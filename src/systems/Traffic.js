import * as THREE from 'three';
import { Vehicle } from '../entities/Vehicle.js';
import { MODELS, VEHICLE_MODELS } from '../entities/vehicleModels.js';
import { DrivePath } from '../entities/vehicles/drivePath.js';
import { getVehicleFx } from '../entities/vehicles/fx.js';
import { installVehicleDebug } from '../entities/vehicles/debug.js';
import { clamp, headingTo } from '../core/math.js';
import { createRng, hash } from '../core/rng.js';
import { SKIN_TONES } from '../data/sets.js';

// Traffic (ARCHITECTURE.md §17): AI drivers on the layout graph and parked cars near the focus.
//
//   traffic.cars    AI-driven Vehicles (own traffic + any car handed to makeAIDriver, e.g. police)
//   traffic.parked  parked Vehicles near game.focus (quality.maxParked)
//   traffic.spawnCar({ x, z, heading, model, color, ai, variant, police, owner, speed }) → Vehicle|null
//   traffic.makeAIDriver(vehicle, { mode: 'cruise' | 'chase' | 'flee', target })     → ai state
//   traffic.release(vehicle)   stop managing it (e.g. the player took it)
//
// Driving model: each AI car follows a DrivePath (right-hand lane lines + arcs at intersections)
// with pure-pursuit steering and a speed planner that brakes for turns, stop lines, signals
// (city.signalAt), the intersection box and whatever is ahead on its path (cars, the player,
// pedestrians). The AI only sets vehicle.controls — the Vehicle physics does the driving.
//
// Unsignalized intersections: a major street has priority over a minor one (minor = stop sign);
// equal streets are first-come-first-served via per-node claims. Left turns yield to oncoming cars.

const BUS_STREETS = new Set(['dodge', '24th', '30th']);
const TURN_SPEED = { straight: Infinity, right: 5.2, left: 6.8, uturn: 3.2 };
const CHASE_TURN_SPEED = { straight: Infinity, right: 8.5, left: 9.5, uturn: 4 };
const DECEL = 4.2; // comfortable braking used by the speed planner (m/s²)

// model mix by district (weights); 'aero' = the rounded early-'90s sedan
const MIX = {
  north: [['sedan', 26], ['pickup', 18], ['coupe', 15], ['hatch', 12], ['wagon', 9], ['van', 8], ['lowrider', 6], ['aero', 6]],
  eastomaha: [['pickup', 30], ['van', 18], ['sedan', 20], ['hatch', 10], ['coupe', 8], ['wagon', 6], ['aero', 8]],
  midtown: [['sedan', 26], ['aero', 18], ['coupe', 14], ['wagon', 12], ['hatch', 12], ['pickup', 8], ['van', 6], ['lowrider', 4]],
  nodo: [['pickup', 24], ['van', 18], ['sedan', 22], ['aero', 14], ['hatch', 10], ['coupe', 8], ['wagon', 4]],
  downtown: [['aero', 32], ['sedan', 28], ['coupe', 10], ['wagon', 8], ['hatch', 8], ['van', 6], ['pickup', 5], ['lowrider', 3]],
  oldmarket: [['aero', 26], ['sedan', 26], ['coupe', 14], ['wagon', 8], ['hatch', 10], ['van', 6], ['pickup', 6], ['lowrider', 4]],
  riverfront: [['pickup', 26], ['van', 16], ['sedan', 22], ['aero', 14], ['hatch', 12], ['coupe', 6], ['wagon', 4]],
};

const PED_SHIRTS = ['#d8d4c8', '#3b4a6b', '#7a2a2a', '#4a6a3a', '#c8a060', '#2a2a2e', '#8a8a90', '#b86a3a'];
const PED_PANTS = ['#2a2a33', '#3a4a6a', '#5a4a3a', '#1e1e22', '#6a6a70'];

let virtualId = 0;

function weighted(items, r) {
  let total = 0;
  for (const it of items) total += it[1];
  let x = r * total;
  for (const it of items) {
    x -= it[1];
    if (x <= 0) return it[0];
  }
  return items[items.length - 1][0];
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.cars = []; // AI-driven
    this.parked = []; // parked, player-stealable
    this.abandoned = []; // cars the player drove and left behind
    this.claims = new Map(); // nodeId -> [claim]
    this.frozen = false; // debug: no spawning / despawning
    this.dummies = [];
    this._spawnT = 0;
    this._parkT = 0;
    this._cleanT = 0;
    this._busCount = 0;
    this._pt = { x: 0, z: 0, dx: 0, dz: 0 };
    this._probeRes = { gap: Infinity, speed: 0, blocker: null };
    this._nodeInfo = [];
    this._edgeCells = new Map();
    this._nearEdges = [];
    this._nearEdgesAt = { x: 1e9, z: 1e9 };
    this.spots = [];
    this._spotCells = new Map();
    this._astar = null;
    this.stats = { spawned: 0, despawned: 0, recoveries: 0 };
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    const game = this.game;
    this._buildGraphInfo();
    this._buildSpots();
    const ev = game.events;
    ev.on('vehicle:jacked', ({ vehicle, from, by }) => this._onJacked(vehicle, from, by));
    ev.on('player:enterVehicle', ({ vehicle }) => {
      if (!vehicle) return;
      this.release(vehicle);
      this._removeFrom(this.abandoned, vehicle);
    });
    ev.on('player:exitVehicle', ({ vehicle }) => {
      if (!vehicle || vehicle.disposed) return;
      if (vehicle.userData.owner === 'external') return;
      vehicle.parked = true;
      if (!this.abandoned.includes(vehicle)) this.abandoned.push(vehicle);
    });
  }

  onGameStart() {
    this._clearOwn();
    this._prefill(true);
  }

  onGameEnd() {
    this._clearOwn();
    for (const d of this.dummies) d.remove?.();
    this.dummies.length = 0;
    this.claims.clear();
    const fx = getVehicleFx(this.game);
    fx.clearSkids();
    fx.clearParticles();
  }

  onPlayerRespawn() {
    this._despawnFar(true);
    this._prefill(false);
  }

  // ------------------------------------------------------------------ public API
  /**
   * Spawn a car. Without x/z a spawn point near the focus is chosen (on a lane, off-screen).
   * ai: true | 'cruise' | 'chase' | 'flee' | { mode, target } → AI driven, else parked.
   * owner: 'traffic' = managed and despawned by Traffic; default 'external' (caller removes it).
   */
  spawnCar(opts = {}) {
    const game = this.game;
    let { x, z, heading = 0, model, color, ai, variant, police, owner = 'external', speed } = opts;
    let lane = null;
    if (x === undefined || z === undefined) {
      lane = this._findLaneSpot(game.focus, 60, 250, false) || this._findLaneSpot(game.focus, 30, 260, true);
      if (!lane) return null;
      x = lane.x;
      z = lane.z;
      heading = lane.heading;
    }
    if (!model) {
      const pick = this._pickModel(x, z);
      model = pick.model;
      variant = variant ?? pick.variant;
    }
    if (model === 'aero') {
      model = 'sedan';
      variant = 'aero';
    }
    const v = new Vehicle(game, { model, color, x, z, heading, police, variant });
    v.userData.owner = owner;
    game.addVehicle(v);
    if (ai) {
      const o = typeof ai === 'object' ? ai : { mode: typeof ai === 'string' ? ai : 'cruise' };
      this.makeAIDriver(v, o);
      if (!v.driver) v.setDriver(this._virtualDriver(v));
      const sp = speed ?? (lane ? lane.edge.speed * 0.7 : 0);
      v.velocity.set(-Math.sin(heading) * sp, 0, -Math.cos(heading) * sp);
    } else {
      v.parked = true;
      if (owner === 'traffic') this.parked.push(v);
    }
    this.stats.spawned++;
    return v;
  }

  /** Put an AI at the wheel (or change its mode). target: Actor | Vehicle | {x, z}. */
  makeAIDriver(vehicle, { mode = 'cruise', target = null, speed = null } = {}) {
    if (!vehicle || vehicle.disposed) return null;
    let ai = vehicle.ai;
    if (!ai || ai.owner !== this) {
      ai = {
        owner: this,
        mode: 'cruise',
        target: null,
        path: null,
        queued: null,
        claims: [],
        pers: 0.88 + Math.random() * 0.24,
        stuckT: 0,
        recoverT: 0,
        recoverSteer: 0,
        recoveries: 0,
        blockT: 0,
        blocker: null,
        waitT: 0,
        honkT: 0,
        shift: 0,
        shiftT: 0,
        ignore: null,
        stoppedAt: -1,
        repathT: 0,
        route: null,
        los: false,
        losT: 0,
        flank: 0,
        arrived: false,
        hitByPlayer: -1e9,
        fleeUntil: 0,
        deadT: 0,
        lane: 0,
        speedMul: 1,
        vDes: 0,
        waiting: null,
      };
    }
    this._unclaim(vehicle, ai);
    ai.mode = mode;
    ai.target = target;
    ai.path = null;
    ai.queued = null;
    ai.route = null;
    ai.repathT = 0;
    ai.speedMul = speed ?? 1;
    ai.shift = 0;
    ai.arrived = false;
    if (mode === 'flee') ai.fleeUntil = this.game.time.elapsed + 25;
    if (mode === 'chase') {
      // spread several chasers of one target over its flanks (box it in)
      let n = 0;
      for (const c of this.cars) if (c !== vehicle && c.ai?.mode === 'chase' && c.ai.target === target) n++;
      ai.flank = n === 0 ? 0 : n % 2 ? -1 : 1;
    }
    vehicle.ai = ai;
    vehicle.parked = false;
    vehicle.asleep = false;
    if (!this.cars.includes(vehicle)) this.cars.push(vehicle);
    this._removeFrom(this.parked, vehicle);
    this._removeFrom(this.abandoned, vehicle);
    if (vehicle.userData.spot) {
      vehicle.userData.spot.v = null;
      vehicle.userData.spot = null;
    }
    return ai;
  }

  /** Stop managing a vehicle (the player took it, a mission owns it, ...). */
  release(vehicle) {
    if (!vehicle) return;
    if (vehicle.ai && vehicle.ai.owner === this) {
      this._unclaim(vehicle, vehicle.ai);
      vehicle.ai = null;
    }
    this._removeFrom(this.cars, vehicle);
    this._removeFrom(this.parked, vehicle);
    vehicle.turnSignal = 0;
    if (vehicle.userData.spot) {
      vehicle.userData.spot.v = null;
      vehicle.userData.spot = null;
    }
    const c = vehicle.controls;
    c.throttle = 0;
    c.steer = 0;
    c.brake = 0;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const game = this.game;
    getVehicleFx(game).beginFrame(dt);
    if (game.debug && game.debugApi && !game.debugApi.showroom) installVehicleDebug(game, this);
    const player = game.player;

    // drive AI cars (drop dead references first)
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      const ours = v.ai && v.ai.owner === this;
      if (v.disposed || !ours || (player && v.driver === player)) {
        if (!v.disposed && ours) this.release(v);
        else this.cars.splice(i, 1);
        continue;
      }
      try {
        this._drive(v, dt);
      } catch (err) {
        if (!v.ai._err) console.error('[traffic] AI failed', err);
        v.ai._err = true;
        v.controls.throttle = 0;
        v.controls.brake = 1;
      }
    }
    for (let i = this.parked.length - 1; i >= 0; i--) if (this.parked[i].disposed) this.parked.splice(i, 1);
    for (let i = this.abandoned.length - 1; i >= 0; i--) if (this.abandoned[i].disposed) this.abandoned.splice(i, 1);

    // debug dummies: apply knockback impulses (no system owns them)
    for (let i = this.dummies.length - 1; i >= 0; i--) {
      const d = this.dummies[i];
      if (d.state === 'removed') {
        this.dummies.splice(i, 1);
        continue;
      }
      d.position.x += d.velocity.x * dt;
      d.position.z += d.velocity.z * dt;
      game.collision.resolveCircle(d.position, d.radius);
      d.character?.update?.(dt, 0);
    }

    if (this.frozen) return;
    this._spawnT -= dt;
    if (this._spawnT <= 0) {
      this._spawnT = 0.25;
      this._spawnTraffic(false);
    }
    this._parkT -= dt;
    if (this._parkT <= 0) {
      this._parkT = 0.5;
      this._manageParked(false);
    }
    this._cleanT -= dt;
    if (this._cleanT <= 0) {
      this._cleanT = 0.5;
      this._despawnFar(false);
    }
  }

  // ------------------------------------------------------------------ graph helpers
  _buildGraphInfo() {
    const L = this.game.layout;
    const ns = new Map(L.nsStreets.map((s) => [s.id, s]));
    const ew = new Map(L.ewStreets.map((s) => [s.id, s]));
    this._nodeInfo = L.nodes.map((n) => {
      const a = ns.get(n.ns);
      const b = ew.get(n.ew);
      return { hx: (a?.width || 12) / 2, hz: (b?.width || 12) / 2, nsMajor: !!a?.major, ewMajor: !!b?.major };
    });
    // edges bucketed by midpoint (100 m cells) for spawn sampling
    for (const e of L.edges) {
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      const k = this._cellKey((a.x + b.x) / 2, (a.z + b.z) / 2, 100);
      let list = this._edgeCells.get(k);
      if (!list) this._edgeCells.set(k, (list = []));
      list.push(e);
    }
    const n = L.nodes.length;
    this._astar = { g: new Float64Array(n), f: new Float64Array(n), came: new Int32Array(n), state: new Uint8Array(n), open: [] };
  }

  _cellKey(x, z, size) {
    return `${Math.floor(x / size)},${Math.floor(z / size)}`;
  }

  /** Is the street crossing an approach along `axis` at this node a major one? */
  _crossMajor(nodeId, axis) {
    const ni = this._nodeInfo[nodeId];
    return axis === 'z' ? ni.ewMajor : ni.nsMajor;
  }

  _nearEdgeList(focus) {
    const at = this._nearEdgesAt;
    if ((focus.x - at.x) ** 2 + (focus.z - at.z) ** 2 < 40 * 40) return this._nearEdges;
    at.x = focus.x;
    at.z = focus.z;
    const out = (this._nearEdges = []);
    const c0x = Math.floor((focus.x - 300) / 100);
    const c1x = Math.floor((focus.x + 300) / 100);
    const c0z = Math.floor((focus.z - 300) / 100);
    const c1z = Math.floor((focus.z + 300) / 100);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this._edgeCells.get(`${cx},${cz}`);
        if (list) for (const e of list) out.push(e);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ spawning
  _visible(x, z, r = 4) {
    return getVehicleFx(this.game).isVisible(x, 1.2, z, r);
  }

  _vehicleNear(x, z, r) {
    const list = this.game.vehicles;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const dx = v.position.x - x;
      const dz = v.position.z - z;
      const rr = r + v.radius * 0.6;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  /** Random lane position in a ring around focus (off-screen unless allowVisible). */
  _findLaneSpot(focus, minD, maxD, allowVisible, busOnly = false) {
    const L = this.game.layout;
    const edges = this._nearEdgeList(focus);
    if (!edges.length) return null;
    const col = this.game.collision;
    for (let attempt = 0; attempt < 14; attempt++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      if (busOnly && !BUS_STREETS.has(e.street)) continue;
      const from = Math.random() < 0.5 ? e.a : e.b;
      const lane = busOnly ? e.lanesPerDir - 1 : Math.floor(Math.random() * e.lanesPerDir);
      const a = L.laneStart(e, from, lane);
      const b = L.laneEnd(e, from, lane);
      const t = 0.12 + Math.random() * 0.76;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < minD || d > maxD) continue;
      if (!allowVisible && d < 175 && this._visible(x, z)) continue;
      if (this._vehicleNear(x, z, busOnly ? 14 : 9)) continue;
      if (col && !col.isFree(x, z, 1.1, 0.3, 1.5)) continue;
      const dir = L.edgeDir(e, from);
      return { x, z, heading: headingTo(dir.x, dir.z), edge: e, from, lane };
    }
    return null;
  }

  _pickModel(x, z) {
    const dist = this.game.layout.districtAt(x, z)?.id || 'north';
    const m = weighted(MIX[dist] || MIX.north, Math.random());
    return m === 'aero' ? { model: 'sedan', variant: 'aero' } : { model: m, variant: null };
  }

  _maxBuses() {
    const d = this.game.quality?.detail ?? 1;
    return d === 0 ? 1 : d === 1 ? 2 : 3;
  }

  _ownTrafficCount() {
    let n = 0;
    let buses = 0;
    for (const v of this.cars) {
      if (v.userData.owner !== 'traffic') continue;
      n++;
      if (v.model === 'bus') buses++;
    }
    this._busCount = buses;
    return n;
  }

  _spawnTraffic(initial) {
    const game = this.game;
    const max = game.quality?.maxTraffic ?? 16;
    let n = this._ownTrafficCount();
    const focus = game.focus;
    let budget = initial ? max * 2 : 2;
    while (n < max && budget-- > 0) {
      const wantBus = this._busCount < this._maxBuses() && Math.random() < 0.14;
      const spot = wantBus
        ? this._findLaneSpot(focus, initial ? 40 : 70, 240, initial, true)
        : this._findLaneSpot(focus, initial ? 28 : 60, initial ? 230 : 250, initial);
      if (!spot) continue;
      let model = 'bus';
      let variant = null;
      if (!wantBus) {
        const pick = this._pickModel(spot.x, spot.z);
        model = pick.model;
        variant = pick.variant;
      }
      const v = new Vehicle(game, { model, x: spot.x, z: spot.z, heading: spot.heading, variant });
      v.userData.owner = 'traffic';
      game.addVehicle(v);
      v.setDriver(this._virtualDriver(v));
      const ai = this.makeAIDriver(v, { mode: 'cruise' });
      ai.lane = spot.lane;
      const sp = spot.edge.speed * (model === 'bus' ? 0.5 : 0.75);
      v.velocity.set(-Math.sin(spot.heading) * sp, 0, -Math.cos(spot.heading) * sp);
      ai.path = new DrivePath(game.layout);
      ai.path.start(spot.x, spot.z, spot.edge, spot.from, spot.lane);
      if (model === 'bus') this._busCount++;
      this.stats.spawned++;
      n++;
    }
  }

  _prefill(isStart) {
    this._manageParked(true);
    this._spawnTraffic(true);
    if (isStart) this._ensureCarNearPlayer();
  }

  _despawnFar(force) {
    const game = this.game;
    const f = game.focus;
    const player = game.player;
    const kill = (v, list, i) => {
      list.splice(i, 1);
      this.release(v);
      game.removeVehicle(v);
      this.stats.despawned++;
    };
    const hidden = (v) => !this._visible(v.position.x, v.position.z, v.radius + 2);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v.userData.owner !== 'traffic' || (player && v.driver === player)) continue;
      const d2 = (v.position.x - f.x) ** 2 + (v.position.z - f.z) ** 2;
      const ai = v.ai;
      let remove = d2 > 320 * 320 || (d2 > 250 * 250 && hidden(v));
      if (!remove && ai && (v.totaled || ai.deadT > 0)) {
        ai.deadT += 0.5;
        if (ai.deadT > 25 && d2 > 40 * 40 && hidden(v)) remove = true;
      }
      if (!remove && ai && ai.recoveries >= 4 && hidden(v)) remove = true;
      if (!remove && ai && ai.waitT > 40 && hidden(v)) remove = true;
      if (force && d2 > 260 * 260) remove = true;
      if (remove) kill(v, this.cars, i);
    }
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const v = this.parked[i];
      if (v.driver) continue;
      const d2 = (v.position.x - f.x) ** 2 + (v.position.z - f.z) ** 2;
      if (d2 > 215 * 215 || (d2 > 180 * 180 && hidden(v)) || (force && d2 > 180 * 180)) kill(v, this.parked, i);
    }
    for (let i = this.abandoned.length - 1; i >= 0; i--) {
      const v = this.abandoned[i];
      if (v.driver || v.ai) {
        this.abandoned.splice(i, 1);
        continue;
      }
      const d2 = (v.position.x - f.x) ** 2 + (v.position.z - f.z) ** 2;
      const tooMany = this.abandoned.length > 6 && i === 0;
      if ((d2 > 260 * 260 || tooMany) && hidden(v)) kill(v, this.abandoned, i);
    }
  }

  _clearOwn() {
    const game = this.game;
    for (const list of [this.cars, this.parked, this.abandoned]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        if (v.userData.owner === 'external') continue;
        if (game.player && v.driver === game.player) continue;
        list.splice(i, 1);
        this.release(v);
        game.removeVehicle(v);
      }
    }
    this.claims.clear();
    for (const s of this.spots) s.v = null;
  }

  _virtualDriver(vehicle) {
    const r = Math.random;
    const look = {
      skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)],
      shirt: PED_SHIRTS[Math.floor(r() * PED_SHIRTS.length)],
      pants: PED_PANTS[Math.floor(r() * PED_PANTS.length)],
      outfit: 'civilian',
      hat: r() < 0.2 ? 'cap' : 'none',
      female: r() < 0.4,
    };
    // lightweight stand-in for an Actor so carjacks hand over a `from` driver to eject
    return {
      id: -++virtualId,
      isVirtual: true,
      kind: 'ped',
      faction: 'civ',
      side: null,
      name: 'Driver',
      state: 'active',
      alive: true,
      health: 100,
      maxHealth: 100,
      radius: 0.35,
      look,
      vehicle,
      get position() {
        return vehicle.position;
      },
      heading: 0,
      velocity: new THREE.Vector3(),
      aggro: new Map(),
      userData: {},
      takeDamage() {
        return false;
      },
      knockOut() {},
      revive() {},
      heal() {},
      remove() {},
      faceHeading() {},
    };
  }

  _onJacked(vehicle, from, by) {
    if (!vehicle) return;
    this.release(vehicle);
    this._removeFrom(this.abandoned, vehicle);
    if (from && from.isVirtual) {
      from.vehicle = null;
      const exit = vehicle.getExitPoint();
      try {
        this.game.pedestrians?.spawnPed?.({ x: exit.x, z: exit.z, flee: by || this.game.player, look: from.look });
      } catch (err) {
        console.error('[traffic] spawnPed failed', err);
      }
    }
  }

  _ensureCarNearPlayer() {
    const game = this.game;
    const p = game.player?.position;
    if (!p) return;
    for (const v of this.parked) if ((v.position.x - p.x) ** 2 + (v.position.z - p.z) ** 2 < 26 * 26) return;
    let best = null;
    let bd = 45 * 45;
    this._forSpotsNear(p.x, p.z, 50, (s) => {
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d < bd && d > 4 && !s.v && !this._vehicleNear(s.x, s.z, 4.5) && game.collision.isFree(s.x, s.z, 1.1, 0.3, 1.5)) {
        bd = d;
        best = s;
      }
    });
    if (!best) return;
    const r = Math.random();
    const model = r < 0.35 ? 'coupe' : r < 0.6 ? 'lowrider' : r < 0.8 ? 'sedan' : 'pickup';
    this._spawnParkedAt(best, model);
  }

  // ------------------------------------------------------------------ parking
  _buildSpots() {
    const game = this.game;
    const L = game.layout;
    const rng = createRng((game.seed || 1993) ^ 0x9a4c);
    const add = (x, z, heading, src, fill) => {
      const s = { x, z, heading, v: null, fill: rng.next() < fill, seed: hash(Math.round(x * 10), Math.round(z * 10)), src };
      this.spots.push(s);
      const k = this._cellKey(x, z, 64);
      let list = this._spotCells.get(k);
      if (!list) this._spotCells.set(k, (list = []));
      list.push(s);
    };
    const citySpots = (game.city?.parkingSpots || []).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.z));
    // the real city already thins its curbside spots (~1/3 used) and avoids hoods / landmarks:
    // most of its spots get a car; the stub city has none and relies on derived spots below
    for (const s of citySpots) add(s.x, s.z, s.heading || 0, 'city', 0.82);
    const realCity = citySpots.length >= 150;
    // POIs nobody should park in front of (bus stops, hangouts, garage doors)
    const keepClear = (game.city?.pois || []).filter((p) => p.type === 'bus' || p.type === 'hood' || p.type === 'garage');
    const cityCell = new Set(citySpots.map((s) => this._cellKey(s.x, s.z, 24)));
    // curbside spots derived from the lane layout (only streets wide enough for a parking lane; with
    // the real city only on stretches where it placed no spots of its own)
    for (const e of L.edges) {
      const outer = L.laneOffset(e, e.lanesPerDir - 1);
      const off = e.width / 2 - 1.15;
      if (off - 0.95 < outer + 0.95 + 0.2) continue;
      for (const from of [e.a, e.b]) {
        const a = L.nodes[from];
        const b = L.nodes[from === e.a ? e.b : e.a];
        const dir = L.edgeDir(e, from);
        const s0 = L.crossWidth(a, e) / 2 + 9;
        const s1 = e.length - L.crossWidth(b, e) / 2 - 9;
        const heading = headingTo(dir.x, dir.z);
        for (let s = s0; s < s1; s += 7.2) {
          // right of travel direction (dx, dz) is (−dz, dx)
          const x = a.x + dir.x * s - dir.z * off;
          const z = a.z + dir.z * s + dir.x * off;
          if (L.isWater?.(x, z)) continue;
          if (realCity) {
            if (cityCell.has(this._cellKey(x, z, 24))) continue;
            if (keepClear.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 10 * 10)) continue;
            if (L.landmarkAt?.(x, z)) continue;
          }
          add(x, z, heading, 'curb', realCity ? 0.35 : 0.5);
        }
      }
    }
  }

  _forSpotsNear(x, z, r, fn) {
    const c0x = Math.floor((x - r) / 64);
    const c1x = Math.floor((x + r) / 64);
    const c0z = Math.floor((z - r) / 64);
    const c1z = Math.floor((z + r) / 64);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this._spotCells.get(`${cx},${cz}`);
        if (list) for (const s of list) fn(s);
      }
    }
  }

  _spawnParkedAt(spot, model = null) {
    const game = this.game;
    // spots keep a stable-ish car for a while (seeded by spot and 10-minute window)
    const rng = createRng(spot.seed ^ (Math.floor(game.time.elapsed / 600) * 7919));
    let variant = null;
    if (!model) {
      const d = game.layout.districtAt(spot.x, spot.z)?.id || 'north';
      const m = weighted(MIX[d] || MIX.north, rng.next());
      if (m === 'aero') {
        model = 'sedan';
        variant = 'aero';
      } else model = m;
    }
    const v = new Vehicle(game, { model, x: spot.x, z: spot.z, heading: spot.heading, variant, rng: rng.next });
    v.userData.owner = 'traffic';
    v.userData.spot = spot;
    v.parked = true;
    spot.v = v;
    game.addVehicle(v);
    this.parked.push(v);
    this.stats.spawned++;
    return v;
  }

  _manageParked(initial) {
    const game = this.game;
    const max = game.quality?.maxParked ?? 30;
    // free spots whose car drove off / got shoved away
    for (const v of this.parked) {
      const s = v.userData.spot;
      if (s && (v.position.x - s.x) ** 2 + (v.position.z - s.z) ** 2 > 9) {
        s.v = null;
        v.userData.spot = null;
      }
    }
    const f = game.focus;
    // teleports / respawns: refill around the new spot right away (the view is jumping anyway)
    const lf = this._lastParkFocus || (this._lastParkFocus = { x: f.x, z: f.z });
    const jumped = (f.x - lf.x) ** 2 + (f.z - lf.z) ** 2 > 70 * 70;
    lf.x = f.x;
    lf.z = f.z;
    if (jumped && !initial) {
      for (let i = this.parked.length - 1; i >= 0; i--) {
        const v = this.parked[i];
        if (v.driver || (v.position.x - f.x) ** 2 + (v.position.z - f.z) ** 2 < 150 * 150) continue;
        this.parked.splice(i, 1);
        this.release(v);
        game.removeVehicle(v);
      }
      initial = true;
    }
    let n = this.parked.length;
    if (n >= max && !initial) {
      // at the cap: recycle the farthest hidden car behind us so the street ahead gets cars
      let far = null;
      let fd = 120 * 120;
      for (const v of this.parked) {
        if (v.driver) continue;
        const d2 = (v.position.x - f.x) ** 2 + (v.position.z - f.z) ** 2;
        if (d2 > fd && !this._visible(v.position.x, v.position.z, v.radius + 2)) {
          fd = d2;
          far = v;
        }
      }
      if (far) {
        this._removeFrom(this.parked, far);
        this.release(far);
        game.removeVehicle(far);
        n--;
      }
    }
    if (n >= max) return;
    // hidden spots (behind the camera / around a corner) may fill fairly close; spots in view only
    // far away so cars never pop in on screen
    const minD = initial ? 8 : 12;
    const cands = [];
    this._forSpotsNear(f.x, f.z, 170, (s) => {
      if (s.v || !s.fill) return;
      const d2 = (s.x - f.x) ** 2 + (s.z - f.z) ** 2;
      if (d2 < minD * minD || d2 > 170 * 170) return;
      s._d2 = d2 + Math.random() * 2500;
      cands.push(s);
    });
    cands.sort((a, b) => a._d2 - b._d2);
    let budget = initial ? max : 3;
    for (const s of cands) {
      if (n >= max || budget <= 0) break;
      const d = Math.hypot(s.x - f.x, s.z - f.z);
      if (!initial && d < 115 && this._visible(s.x, s.z, 3.5)) continue;
      if (this._vehicleNear(s.x, s.z, 4.2)) continue;
      if (!game.collision.isFree(s.x, s.z, 1.05, 0.3, 1.5)) continue;
      this._spawnParkedAt(s);
      n++;
      budget--;
    }
  }

  // ------------------------------------------------------------------ claims (intersections)
  _claim(v, ai, st) {
    let list = this.claims.get(st.node);
    if (!list) this.claims.set(st.node, (list = []));
    const c = { v, node: st.node, step: st, t: this.game.time.elapsed, axis: st.axis, dirSign: st.dirSign, turn: st.turn, dist: 99, speed: 0, inBox: false };
    list.push(c);
    ai.claims.push(c);
    return c;
  }

  _unclaim(v, ai, only = null) {
    if (!ai || !ai.claims) return;
    for (let i = ai.claims.length - 1; i >= 0; i--) {
      const c = ai.claims[i];
      if (only && c !== only) continue;
      const list = this.claims.get(c.node);
      if (list) {
        const k = list.indexOf(c);
        if (k >= 0) list.splice(k, 1);
      }
      ai.claims.splice(i, 1);
    }
  }

  /** Do two intersection movements cross? (a, b: { axis, dirSign, turn }) */
  static conflicts(a, b) {
    if (a.axis !== b.axis) return !(a.turn === 'right' && b.turn === 'right');
    if (a.dirSign === b.dirSign) return false;
    return (a.turn === 'left') !== (b.turn === 'left');
  }

  /** May this car enter the intersection at the end of step st? */
  _mayEnter(v, ai, st, dStop, claim) {
    const game = this.game;
    const list = this.claims.get(st.node) || [];
    // anything conflicting already inside the box?
    for (const c of list) if (c !== claim && c.inBox && Traffic.conflicts(st, c)) return false;
    if (this._foreignInBox(v, st)) return false;
    // left turns yield to oncoming traffic
    if (st.turn === 'left') {
      for (const c of list) {
        if (c === claim || c.axis !== st.axis || c.dirSign === st.dirSign || c.turn === 'left') continue;
        if (c.inBox || c.dist < 5 || (c.dist < 32 && c.speed > 1.5)) return false;
      }
    }
    const sig = game.city?.signalAt?.(st.node);
    if (sig) {
      if (sig.green !== st.axis || sig.phase === 'allred') return false;
      if (sig.phase === 'yellow') {
        const need = (v.speed * v.speed) / (2 * 5.5);
        if (dStop > need + 1.2) return false;
      }
      return true;
    }
    const mine = st.edge.major;
    const cross = this._crossMajor(st.node, st.axis);
    if (mine && !cross) return true;
    if (!mine && cross) {
      // stop sign: full stop at the line, then go when the major street is clear
      if (ai.stoppedAt !== st.node) {
        if (dStop < 2.6 && Math.abs(v.speed) < 0.7) ai.stoppedAt = st.node;
        else return false;
      }
      for (const c of list) {
        if (c === claim || !Traffic.conflicts(st, c)) continue;
        if (c.inBox || c.dist < 4 || (c.dist < 26 && c.speed > 0.8)) return false;
      }
      return true;
    }
    // equal streets: first come, first served (with a patience timeout)
    if (ai.waitT > 10) return true;
    for (const c of list) {
      if (c === claim || !Traffic.conflicts(st, c) || c.dist > 9) continue;
      if (c.t < claim.t || (c.t === claim.t && c.v.uid < v.uid)) return false;
    }
    return true;
  }

  /** A moving vehicle that is not cruise traffic (player, police...) crossing the box. */
  _foreignInBox(v, st) {
    const n = this.game.layout.nodes[st.node];
    const ni = this._nodeInfo[st.node];
    const list = this.game.vehicles;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === v || (o.ai && o.ai.owner === this && o.ai.mode === 'cruise')) continue;
      const dx = o.position.x - n.x;
      const dz = o.position.z - n.z;
      if (Math.abs(dx) > ni.hx + 1.5 || Math.abs(dz) > ni.hz + 1.5) continue;
      if (Math.abs(o.speed) < 1) continue;
      const axis = Math.abs(Math.sin(o.heading)) > 0.7 ? 'x' : 'z';
      if (axis !== st.axis) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ planning
  /** (Re)start the car's path on the edge that best matches its position and heading. */
  _planFrom(v, ai) {
    const L = this.game.layout;
    const p = v.position;
    const fx = -Math.sin(v.heading);
    const fz = -Math.cos(v.heading);
    let best = null;
    let bs = Infinity;
    let bFrom = 0;
    for (const e of L.edges) {
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      let d;
      if (e.axis === 'z') {
        const t = clamp((p.z - a.z) / (b.z - a.z), 0, 1);
        d = Math.hypot(p.x - a.x, p.z - (a.z + (b.z - a.z) * t));
      } else {
        const t = clamp((p.x - a.x) / (b.x - a.x), 0, 1);
        d = Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.z - a.z);
      }
      if (d > bs) continue;
      const dir = L.edgeDir(e, e.a);
      const dot = dir.x * fx + dir.z * fz;
      const score = d + (1 - Math.abs(dot)) * 9;
      if (score < bs) {
        bs = score;
        best = e;
        bFrom = dot >= 0 ? e.a : e.b;
      }
    }
    if (!best) return false;
    let lane = 0;
    if (best.lanesPerDir > 1) {
      let bd = Infinity;
      for (let l = 0; l < best.lanesPerDir; l++) {
        const q = L.laneStart(best, bFrom, l);
        const r = L.laneEnd(best, bFrom, l);
        const d = Math.abs((r.x - q.x) * (q.z - p.z) - (q.x - p.x) * (r.z - q.z)) / (Math.hypot(r.x - q.x, r.z - q.z) || 1);
        if (d < bd) {
          bd = d;
          lane = l;
        }
      }
    }
    if (v.model === 'bus') lane = best.lanesPerDir - 1;
    if (!ai.path) ai.path = new DrivePath(L);
    this._unclaim(v, ai);
    ai.path.start(p.x, p.z, best, bFrom, lane);
    ai.queued = null;
    ai.lane = lane;
    return true;
  }

  /** Next edge out of `atNode` after arriving along `edge`. */
  _chooseNext(v, ai, edge, atNode) {
    const L = this.game.layout;
    const node = L.nodes[atNode];
    const inDir = L.edgeDir(edge, edge.a === atNode ? edge.b : edge.a);
    const opts = [];
    for (const eid of node.edges) if (eid !== edge.id) opts.push(L.edges[eid]);
    if (!opts.length) return edge; // dead end: U-turn
    if (ai.mode === 'chase' && ai.route) {
      const i = ai.route.indexOf(atNode);
      if (i >= 0 && i + 1 < ai.route.length) {
        const nextNode = ai.route[i + 1];
        for (const e of opts) if (e.a === nextNode || e.b === nextNode) return e;
      }
      const t = this._targetPos(ai.target);
      if (t) return this._greedy(opts, atNode, t.x, t.z, 1);
    }
    if (ai.mode === 'flee') {
      const t = this._targetPos(ai.target);
      if (t) return this._greedy(opts, atNode, t.x, t.z, -1);
    }
    const focus = this.game.focus;
    let total = 0;
    const w = [];
    for (const e of opts) {
      const out = L.edgeDir(e, atNode);
      const turn = DrivePath.turnType(inDir.x, inDir.z, out.x, out.z);
      let k = turn === 'straight' ? 3 : turn === 'right' ? 1.5 : 1.15;
      if (e.major) k *= 1.3;
      const far = L.nodes[e.a === atNode ? e.b : e.a];
      if (Math.hypot(far.x - focus.x, far.z - focus.z) > 300) k *= 0.25; // stay around the action
      if (v.model === 'bus') k = e.street === edge.street ? 30 : BUS_STREETS.has(e.street) ? 3 : 0.2;
      w.push(k);
      total += k;
    }
    let r = Math.random() * total;
    for (let i = 0; i < opts.length; i++) {
      r -= w[i];
      if (r <= 0) return opts[i];
    }
    return opts[opts.length - 1];
  }

  _greedy(opts, atNode, tx, tz, sign) {
    const L = this.game.layout;
    let best = opts[0];
    let bs = Infinity;
    for (const e of opts) {
      const far = L.nodes[e.a === atNode ? e.b : e.a];
      const d = Math.hypot(far.x - tx, far.z - tz) * sign + Math.random() * 12;
      if (d < bs) {
        bs = d;
        best = e;
      }
    }
    return best;
  }

  _laneFor(edge, turnAfter, prevLane, bus) {
    if (edge.lanesPerDir < 2) return 0;
    if (bus || turnAfter === 'right') return edge.lanesPerDir - 1;
    if (turnAfter === 'left' || turnAfter === 'uturn') return 0;
    return prevLane < edge.lanesPerDir ? prevLane : Math.floor(Math.random() * edge.lanesPerDir);
  }

  /** Append one more edge to the car's path (deciding the one after it for lane choice). */
  _extend(v, ai) {
    const L = this.game.layout;
    const path = ai.path;
    const last = path.last;
    const next = ai.queued && ai.queued.from === last.to ? ai.queued.edge : this._chooseNext(v, ai, last.edge, last.to);
    const nextTo = next.a === last.to ? next.b : next.a;
    const after = this._chooseNext(v, ai, next, nextTo);
    const d1 = L.edgeDir(next, last.to);
    const d2 = L.edgeDir(after, nextTo);
    const turnAfter = DrivePath.turnType(d1.x, d1.z, d2.x, d2.z);
    path.append(next, this._laneFor(next, turnAfter, last.lane, v.model === 'bus'));
    ai.queued = { edge: after, from: nextTo };
  }

  // ------------------------------------------------------------------ targets / A*
  _targetPos(t) {
    if (!t || t.disposed || t.state === 'removed') return null;
    const src = t.vehicle || t;
    const p = src.position || src;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    return p;
  }

  _astarRoute(startNode, goalNode, avoidFirst = -1) {
    const L = this.game.layout;
    const A = this._astar;
    const N = L.nodes.length;
    A.state.fill(0);
    A.came.fill(-1);
    const goal = L.nodes[goalNode];
    const open = A.open;
    open.length = 0;
    A.g[startNode] = 0;
    A.f[startNode] = Math.hypot(L.nodes[startNode].x - goal.x, L.nodes[startNode].z - goal.z);
    open.push(startNode);
    A.state[startNode] = 1;
    let iter = 0;
    while (open.length && iter++ < N * 4) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (A.f[open[i]] < A.f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goalNode) break;
      A.state[cur] = 2;
      for (const eid of L.nodes[cur].edges) {
        const e = L.edges[eid];
        const nb = e.a === cur ? e.b : e.a;
        if (cur === startNode && nb === avoidFirst) continue; // no instant U-turn
        if (A.state[nb] === 2) continue;
        const g = A.g[cur] + e.length;
        if (A.state[nb] === 1 && g >= A.g[nb]) continue;
        A.g[nb] = g;
        A.f[nb] = g + Math.hypot(L.nodes[nb].x - goal.x, L.nodes[nb].z - goal.z);
        A.came[nb] = cur;
        if (A.state[nb] !== 1) {
          A.state[nb] = 1;
          open.push(nb);
        }
      }
    }
    if (goalNode !== startNode && A.came[goalNode] < 0) return null;
    const route = [goalNode];
    let c = goalNode;
    let guard = 0;
    while (c !== startNode && guard++ < N) {
      c = A.came[c];
      if (c < 0) return null;
      route.push(c);
    }
    return route.reverse();
  }

  _planChase(v, ai, tp) {
    if (!this._planFrom(v, ai)) return;
    const st = ai.path.last;
    const goal = this.game.layout.nearestNode(tp.x, tp.z);
    ai.route = goal ? this._astarRoute(st.to, goal.id, st.from) : null;
    ai.queued = null;
  }

  // ------------------------------------------------------------------ driving
  _steerTo(v, tx, tz) {
    const p = v.position;
    const h = v.heading;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const lx = dx * Math.cos(h) + dz * -Math.sin(h);
    const lf = dx * -Math.sin(h) + dz * -Math.cos(h);
    const d2 = lx * lx + lf * lf || 1;
    let delta = Math.atan(((2 * lx) / d2) * v.spec.wheelbase);
    if (lf < 0) delta = Math.sign(lx || 1) * v.spec.steer;
    v.controls.steer = clamp(delta / Math.max(0.05, v.maxSteerAt(v.speed)), -1, 1);
  }

  _speedControl(v, vDes) {
    const c = v.controls;
    const sp = v.speed;
    c.handbrake = false;
    if (vDes < 0.25) {
      c.throttle = 0;
      c.brake = sp > 0.4 ? clamp(0.5 + sp * 0.1, 0, 1) : 1;
      return;
    }
    const err = vDes - sp;
    if (err > 0) {
      c.brake = 0;
      c.throttle = clamp(0.22 + err * 0.32, 0, 1);
    } else if (err < -0.4) {
      c.throttle = 0;
      c.brake = clamp(-err * 0.22, 0.05, 1);
    } else {
      c.throttle = 0.1;
      c.brake = 0;
    }
  }

  /** Nearest thing on the path ahead: { gap (m, bumper to bumper), speed, blocker }. */
  _probe(v, ai, s, probeLen) {
    const game = this.game;
    const path = ai.path;
    const res = this._probeRes;
    res.gap = Infinity;
    res.speed = 0;
    res.blocker = null;
    const p = v.position;
    const fx = -Math.sin(v.heading);
    const fz = -Math.cos(v.heading);
    const myHW = v.width / 2;
    const myHL = v.length / 2;
    const reach = probeLen + 10;
    const list = game.vehicles;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === v || o === ai.ignore || o.disposed) continue;
      const dx = o.position.x - p.x;
      const dz = o.position.z - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (dx * fx + dz * fz < -o.radius) continue; // behind us
      const r = path.distanceTo(o.position.x, o.position.z, s, s + probeLen);
      if (r.d === Infinity) continue;
      // the other car's extents across / along our path direction
      const cosA = Math.abs(-Math.sin(o.heading) * r.dx + -Math.cos(o.heading) * r.dz);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const across = sinA * (o.length / 2) + cosA * (o.width / 2);
      if (r.d > myHW + across + 0.3) continue;
      const along = cosA * (o.length / 2) + sinA * (o.width / 2);
      const gap = r.s - s - myHL - along;
      if (gap < res.gap) {
        res.gap = gap;
        res.speed = Math.max(0, o.velocity.x * r.dx + o.velocity.z * r.dz);
        res.blocker = o;
      }
    }
    const actors = game.actors;
    const areach = Math.min(reach, 34);
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.vehicle || a.state === 'removed') continue;
      const dx = a.position.x - p.x;
      const dz = a.position.z - p.z;
      if (dx * dx + dz * dz > areach * areach) continue;
      if (dx * fx + dz * fz < 0) continue;
      const r = path.distanceTo(a.position.x, a.position.z, s, s + Math.min(probeLen, 30));
      if (r.d > myHW + 1.0) continue;
      const gap = r.s - s - myHL - 0.5;
      if (gap < res.gap) {
        res.gap = gap;
        res.speed = 0;
        res.blocker = a;
      }
    }
    return res;
  }

  _drive(v, dt) {
    const game = this.game;
    const ai = v.ai;
    const c = v.controls;
    const now = game.time.elapsed;
    if (v.totaled) {
      c.throttle = 0;
      c.brake = 1;
      c.steer = 0;
      v.turnSignal = 0;
      this._unclaim(v, ai);
      if (!ai.deadT) ai.deadT = 0.01;
      return;
    }
    // the player is pulling the door open: stand on the brakes
    if (game.player?._enter?.v === v) {
      c.throttle = 0;
      c.brake = 1;
      c.steer = 0;
      c.handbrake = false;
      return;
    }
    // stuck recovery: back up with opposite lock, then replan
    if (ai.recoverT > 0) {
      ai.recoverT -= dt;
      c.throttle = -0.75;
      c.brake = 0;
      c.handbrake = false;
      c.steer = ai.recoverSteer;
      if (ai.recoverT <= 0) ai.path = null;
      return;
    }
    // rammed by the player: honk, maybe bolt
    if (ai.mode === 'cruise' && now - ai.hitByPlayer < 0.5 && v.userData.owner === 'traffic') {
      ai.hitByPlayer = -1e9;
      v.horn();
      if (Math.random() < 0.6 && game.player) this.makeAIDriver(v, { mode: 'flee', target: game.player });
    }
    if (ai.mode === 'flee' && now > ai.fleeUntil) ai.mode = 'cruise';

    if (ai.mode === 'chase') {
      const tp = this._targetPos(ai.target);
      if (!tp) {
        ai.mode = 'cruise';
        ai.target = null;
        ai.route = null;
      } else {
        const p = v.position;
        const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
        ai.losT -= dt;
        if (ai.losT <= 0) {
          ai.losT = 0.35;
          ai.los = dist < 60 && (game.collision?.lineOfSight?.(p.x, 1.0, p.z, tp.x, 1.0, tp.z) ?? true);
        }
        if (ai.los && dist < 45) {
          this._pursue(v, ai, tp, dist, dt);
          return;
        }
        ai.repathT -= dt;
        if (ai.repathT <= 0 || !ai.path) {
          ai.repathT = 1.6;
          this._planChase(v, ai, tp);
        }
      }
    }

    // ---- path upkeep
    if ((!ai.path || !ai.path.steps.length) && !this._planFrom(v, ai)) {
      c.throttle = 0;
      c.brake = 1;
      return;
    }
    let path = ai.path;
    const p = v.position;
    let s = path.project(p.x, p.z);
    if (path.err > 7.5) {
      this._planFrom(v, ai);
      path = ai.path;
      s = path.project(p.x, p.z);
    }
    let guard = 0;
    while (path.endS - s < 85 && guard++ < 4) this._extend(v, ai);
    path.trim();

    const sp = Math.abs(v.speed);
    const halfL = v.length / 2;
    const frontS = s + halfL;
    const chasing = ai.mode === 'chase';
    const fleeing = ai.mode === 'flee';
    const reckless = chasing || fleeing;
    const turnSpeed = reckless ? CHASE_TURN_SPEED : TURN_SPEED;

    // ---- steering: pure pursuit, optionally shifted left to pass a stalled car
    const T = path.pointAt(s + clamp(3.8 + sp * 0.55, 4.5, 17), this._pt);
    let tx = T.x;
    let tz = T.z;
    if (ai.shift) {
      tx += -T.dz * ai.shift;
      tz += T.dx * ai.shift;
    }
    this._steerTo(v, tx, tz);

    // ---- speed planning
    const cur = path.stepAt(s);
    const edgeSpeed = cur ? cur.edge.speed : 11;
    let cruise = edgeSpeed * ai.pers * ai.speedMul;
    if (v.model === 'bus') cruise *= 0.72;
    if (chasing) cruise = Math.min(v.maxSpeed * 0.92, edgeSpeed * 2.3);
    if (fleeing) cruise = Math.min(v.maxSpeed * 0.9, edgeSpeed * 1.7);
    let vDes = Math.min(cruise, v.maxSpeed);
    const limit = (vc, dist) => {
      const vv = Math.sqrt(vc * vc + 2 * DECEL * Math.max(0, dist));
      if (vv < vDes) vDes = vv;
    };
    let controlled = false;
    let signal = 0;
    ai.waiting = null;
    for (let i = 0; i < path.steps.length; i++) {
      const st = path.steps[i];
      if (st.sExit < s - halfL) continue;
      if (st.sEnd - frontS > 95) break;
      const vt = turnSpeed[st.turn];
      if (vt < Infinity) {
        if (frontS < st.sEnd) limit(vt, st.sEnd - frontS);
        else if (s < st.sExit + 1) vDes = Math.min(vDes, vt);
        if (!signal && st.sEnd - frontS < 38 && s < st.sExit) signal = st.turn === 'right' ? 1 : st.turn === 'left' ? -1 : 0;
      }
      if (!controlled && frontS < st.sEnd + 0.6) {
        controlled = true;
        const dStop = st.sEnd - frontS;
        let claim = null;
        for (const cl of ai.claims) if (cl.step === st) claim = cl;
        if (!claim && dStop < Math.max(14, sp * 2.6)) claim = this._claim(v, ai, st);
        if (claim) {
          claim.dist = dStop;
          claim.speed = sp;
        }
        if (!reckless && claim) {
          if (!this._mayEnter(v, ai, st, dStop, claim)) {
            // aim a metre short of the line: low frame rates and brake lag never overshoot into the box
            limit(0, dStop - 1.1);
            ai.waiting = st.node;
          } else if (!game.city?.signalAt?.(st.node) && this._crossMajor(st.node, st.axis)) {
            // no signal but a major street crosses: ease through
            limit(st.edge.major ? 8 : 4, dStop);
          }
        }
      }
    }
    v.turnSignal = signal;
    for (let i = ai.claims.length - 1; i >= 0; i--) {
      const cl = ai.claims[i];
      cl.inBox = frontS > cl.step.sEnd - 0.2 && s - halfL < cl.step.sExit;
      if (s - halfL > cl.step.sExit + 0.5) this._unclaim(v, ai, cl);
    }
    if (ai.stoppedAt >= 0 && !ai.claims.some((cl) => cl.node === ai.stoppedAt)) ai.stoppedAt = -1;

    // ---- obstacles on the path ahead
    const ob = this._probe(v, ai, s, clamp(9 + sp * 2.3, 14, 48));
    let blocker = ob.blocker;
    if (blocker && blocker.ai && blocker.ai.blocker === v && blocker.uid < v.uid) blocker = null; // mutual: lower uid goes first
    ai.blocker = blocker;
    if (blocker) {
      const gapMin = reckless ? 1.2 : 2.2 + sp * 0.12;
      limit(ob.speed * 0.9, ob.gap - gapMin);
      if (ob.gap < gapMin * 0.6) vDes = 0;
    }
    if (ai.waiting !== null && sp < 0.5) ai.waitT += dt;
    else if (sp > 2) ai.waitT = 0;

    // ---- blocked by something that isn't moving: honk, then pass parked / stalled cars
    const stalled = !!blocker && ob.gap < 7 && ob.speed < 0.5 && sp < 1;
    ai.blockT = stalled ? ai.blockT + dt : Math.max(0, ai.blockT - dt * 2);
    const isCar = blocker instanceof Vehicle;
    const playerCar = isCar && blocker.driver === game.player && !!game.player;
    const isStatic = isCar && (blocker.asleep || blocker.totaled || blocker.parked || (playerCar && Math.abs(blocker.speed) < 0.3));
    if (stalled && ai.blockT > 2.2 && now - ai.honkT > 3 + Math.random() * 3 && (blocker === game.player || playerCar || !isCar || isStatic)) {
      ai.honkT = now;
      v.horn();
    }
    if (stalled && isStatic && !ai.shift && ai.blockT > (playerCar ? 7 : 3.5)) {
      ai.shift = -2.9;
      ai.shiftT = 7;
      ai.ignore = blocker;
    }
    if (ai.shift) {
      ai.shiftT -= dt;
      const ig = ai.ignore;
      let passed = true;
      if (ig && !ig.disposed) {
        const lf = (ig.position.x - p.x) * -Math.sin(v.heading) + (ig.position.z - p.z) * -Math.cos(v.heading);
        passed = lf < -(halfL + ig.length / 2 + 1.5);
      }
      if (passed || ai.shiftT <= 0) {
        ai.shift = 0;
        ai.ignore = null;
      } else {
        vDes = Math.min(vDes, 5);
      }
    }
    ai.vDes = vDes;
    this._speedControl(v, vDes);

    // ---- physically stuck (wants to go, isn't moving): back out
    if (vDes > 1.5 && sp < 0.4) ai.stuckT += dt;
    else ai.stuckT = Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 2.8) {
      ai.stuckT = 0;
      ai.recoverT = 1.3;
      ai.recoverSteer = -Math.sign(c.steer || 1) * 0.9;
      ai.recoveries++;
      this.stats.recoveries++;
    }
  }

  /** Direct pursuit when the target is close and in sight (cops ram / box in the car). */
  _pursue(v, ai, tp, dist, dt) {
    const t = ai.target;
    const tv = t instanceof Vehicle ? t : t.vehicle instanceof Vehicle ? t.vehicle : null;
    const c = v.controls;
    let ax = tp.x;
    let az = tp.z;
    let tSpeed = 0;
    if (tv) {
      const lead = clamp(dist / 22, 0, 1.1);
      ax += tv.velocity.x * lead;
      az += tv.velocity.z * lead;
      tSpeed = Math.abs(tv.speed || 0);
      if (ai.flank && dist < 20) {
        const h = tv.heading;
        ax += Math.cos(h) * ai.flank * 2.6 - Math.sin(h) * 3.5;
        az += -Math.sin(h) * ai.flank * 2.6 - Math.cos(h) * 3.5;
      }
    }
    this._steerTo(v, ax, az);
    const vDes = tv ? Math.min(v.maxSpeed, Math.max(7, tSpeed + dist * 0.9)) : dist < 9 ? 0 : Math.min(v.maxSpeed * 0.7, dist * 1.1);
    ai.arrived = !tv && dist < 12;
    ai.vDes = vDes;
    this._unclaim(v, ai);
    v.turnSignal = 0;
    this._speedControl(v, vDes);
    if (vDes > 1.5 && Math.abs(v.speed) < 0.4) ai.stuckT += dt;
    else ai.stuckT = Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 2.2) {
      ai.stuckT = 0;
      ai.recoverT = 1.2;
      ai.recoverSteer = -Math.sign(c.steer || 1) * 0.9;
      ai.recoveries++;
    }
    ai.path = null;
  }

  // ------------------------------------------------------------------ utils
  _removeFrom(list, v) {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
  }

  /** Diagnostics for tests: stuck / overlapping / off-road traffic. */
  report() {
    const game = this.game;
    const L = game.layout;
    const cars = this.cars.filter((v) => v.userData.owner === 'traffic');
    let offRoad = 0;
    let overlaps = 0;
    let moving = 0;
    let speedSum = 0;
    const stuck = [];
    for (const v of cars) {
      if (!L.isRoad(v.position.x, v.position.z)) offRoad++;
      if (Math.abs(v.speed) > 1) moving++;
      speedSum += Math.abs(v.speed);
      const ai = v.ai;
      if (ai && (ai.waitT > 25 || ai.recoveries >= 3)) stuck.push({ uid: v.uid, model: v.model, waitT: +ai.waitT.toFixed(1), rec: ai.recoveries, at: [Math.round(v.position.x), Math.round(v.position.z)] });
    }
    const all = game.vehicles;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        let hit = false;
        for (let k = 0; k < a._cx.length && !hit; k++) {
          for (let l = 0; l < b._cx.length && !hit; l++) {
            if (Math.hypot(a._cx[k] - b._cx[l], a._cz[k] - b._cz[l]) < (a.spec.circleR + b.spec.circleR) * 0.7) hit = true;
          }
        }
        if (hit) overlaps++;
      }
    }
    const key = (v) => v.model + (v.variant ? '-' + v.variant : '');
    return {
      cars: cars.length,
      parked: this.parked.length,
      abandoned: this.abandoned.length,
      moving,
      avgSpeed: cars.length ? +(speedSum / cars.length).toFixed(2) : 0,
      offRoad,
      overlaps,
      stuck,
      recoveries: this.stats.recoveries,
      spawned: this.stats.spawned,
      despawned: this.stats.despawned,
      claims: [...this.claims.values()].reduce((n, l) => n + l.length, 0),
      buses: cars.filter((v) => v.model === 'bus').length,
      models: cars.reduce((m, v) => ((m[key(v)] = (m[key(v)] || 0) + 1), m), {}),
    };
  }
}

export { VEHICLE_MODELS, MODELS };
