import { Vehicle } from '../entities/Vehicle.js';
import { angleDiff, headingTo, clamp } from '../core/math.js';
import { npcContext } from './npc/context.js';
import { sidewalkGraph, Walker } from './npc/sidewalks.js';
import { RoadDriver, compass } from './npc/roads.js';
import { createNpc, locomote, stand, seek, setAnim, playOnce, lodStep, stateChange, lieStill, WALK, JOG, RUN } from './npc/steering.js';
import { startFight, fightStep, stopFight } from './npc/fight.js';
import { copLook, copName } from './npc/looks.js';
import * as D from './npc/dialog.js';

// Omaha Police (ARCHITECTURE §18). Melee only — no firearms anywhere in the game.
//
// Heat: game.police.heat 0..5 stars from heat points. Crimes the police witness (a cop within
// ~40 m with line of sight) or that civilians phone in (with a delay, from a payphone) add
// points; heat decays one star at a time once no cop has seen the player for ~25 s (faster in
// neutral clothes).
// Units: patrol cruisers (more downtown: DISTRICTS[].policeLevel) and foot patrols downtown / in
// the Old Market. Pursuit scales with stars: 1 one unit investigates · 2 pursuit with siren ·
// 3 several cruisers + a roadblock attempt · 4–5 ramming and extra officers on foot. Officers get
// out when the player is on foot, chase, strike / tackle; an officer within 1.6 m of the on-foot
// (or stopped / KO'd) player for 1.5 s while heat > 0 → 'player:busted'.

const THRESH = [1, 4, 9, 16, 25]; // points for 1..5 stars
const BASE_POINTS = { assault: 1.2, assaultCop: 3.5, carjack: 2.5, tag: 1.0, hitAndRun: 3.0, vandalism: 0.8, resist: 2.5 };
const SEE_FOOT = 42;
const SEE_CAR = 55;
const WITNESS_FOOT = 38;
const WITNESS_CAR = 46;
const PURSUIT_UNITS = [0, 1, 2, 3, 4, 5];
const BUST_TIME = 1.5;
const BUST_R = 1.6;
const USE_TRAFFIC_CRUISE = true; // let game.traffic.makeAIDriver drive patrols when it exists
const SIREN_AUDIO = true;

let unitIds = 1;

export class Police {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.heat = 0;
    this.points = 0;
    this.cops = [];
    this.cruisers = [];
    this.units = [];
    this.lastSeen = -1e9;
    this.lastKnown = { x: 0, z: 0 };
    this.bustT = 0;
    this.busted = false;
    this.graph = null;
    this._recent = [];
    this._seeT = 0;
    this._manageT = 0;
    this._decayT = 0;
    this._roadblockAt = -1e9;
    this._resistAt = -1e9;
    this._abandoned = [];
    this._frozen = false;
    this._siren = null;
    this._v = { x: 0, z: 0 };
    this._lastDispatch = -1e9;
  }

  // ================================================================== lifecycle
  init() {
    const game = this.game;
    this.graph = sidewalkGraph(game);
    const ev = game.events;
    ev.on('actor:hit', (e) => this._onHit(e));
    ev.on('vehicle:jacked', (e) => this._onJacked(e));
    ev.on('vehicle:hitActor', (e) => this._onRunOver(e));
    ev.on('player:down', () => {
      this._frozen = true;
    });
  }

  onGameStart() {
    this._despawnAll();
    this.points = 0;
    this.heat = 0;
    this.busted = false;
    this._frozen = false;
    this.bustT = 0;
    this.lastSeen = -1e9;
    this.game.events.emit('heat:change', { level: 0 });
    const g = this.game;
    if (g.debugApi) {
      g.debugApi.spawnCop = (x, z, state = null) => {
        const o = this._spawnOfficer(x, z, null);
        o.brain.state = state || (this.heat > 0 ? 'foot' : 'patrol');
        return o.id;
      };
      g.debugApi.spawnCruiser = (x, z, heading = 0) => this._spawnUnit(x, z, heading, 'patrol', 1)?.id;
      g.debugApi.police = () => ({
        heat: this.heat,
        points: +this.points.toFixed(2),
        busted: this.busted,
        bustT: +this.bustT.toFixed(2),
        sinceSeen: +(this.game.time.elapsed - this.lastSeen).toFixed(1),
        cops: this.cops.length,
        units: this.units.map((u) => ({ id: u.id, mode: u.mode, pursuit: u.pursuit, drive: u.traffic ? u.trMode : 'own', siren: !!u.vehicle.siren, x: Math.round(u.vehicle.position.x), z: Math.round(u.vehicle.position.z), inCar: u.officers.filter((o) => o.vehicle).length, crew: u.officers.length })),
        foot: this.cops.filter((o) => !o.vehicle).map((o) => ({ id: o.id, state: o.brain.state, alive: o.alive, x: Math.round(o.position.x), z: Math.round(o.position.z) })),
      });
    }
  }

  onGameEnd() {
    this._despawnAll();
    this.points = 0;
    this.heat = 0;
    this.busted = false;
  }

  onPlayerRespawn(reason) {
    this._despawnAll();
    this.points = 0;
    this.busted = false;
    this._frozen = false;
    this.bustT = 0;
    this.lastSeen = -1e9;
    this.heat = 0;
    this.game.events.emit('heat:change', { level: 0 });
    if (reason === 'busted') {
      // walked out the front door of Police HQ on 16th & Howard
      const lines = ['Bail posted. You are free to go.', "Released. Don't let me see you back in here.", 'Sign here. Stay out of trouble, now.'];
      D.say(this.game, null, D.pick(lines), { color: D.COLORS.cop, speaker: 'Desk Sergeant', priority: 2, duration: 4 });
      this.game.hud?.toast?.('RELEASED · OMAHA POLICE HQ', { color: D.COLORS.cop, duration: 3.5 });
    }
  }

  // ================================================================== heat API
  setHeat(n) {
    const level = clamp(Math.round(n), 0, 5);
    this.points = level > 0 ? THRESH[level - 1] + 0.01 : 0;
    if (level > 0 && this.game.player) {
      this.lastSeen = this.game.time.elapsed;
      const p = this.game.focus;
      this.lastKnown.x = p.x;
      this.lastKnown.z = p.z;
    }
    const prev = this.heat;
    this.heat = level;
    this._decayT = 0;
    this.game.events.emit('heat:change', { level });
    if (level > prev) this._onHeatUp(prev, 'setHeat');
    if (level === 0 && prev > 0) this._endPursuit(false);
  }

  clear() {
    const had = this.heat > 0;
    this.points = 0;
    this.heat = 0;
    this.bustT = 0;
    this.game.events.emit('heat:change', { level: 0 });
    if (had) this._endPursuit(false);
  }

  /**
   * A crime by the player. Counts when a cop witnesses it (or `reported` by a civilian / `witnessed`
   * forced by the caller); always re-broadcast as 'crime'.
   */
  reportCrime(type, { x, z, severity, victim = null, reported = false, witnessed = null } = {}) {
    const game = this.game;
    if (game.mode !== 'play' || !game.player || this.busted) return;
    if (x === undefined || z === undefined) {
      x = game.focus.x;
      z = game.focus.z;
    }
    let pts = severity ?? BASE_POINTS[type] ?? 1;
    const now = game.time.elapsed;
    const recent = this._recent;
    for (let i = recent.length - 1; i >= 0; i--) if (now - recent[i].t > 40) recent.splice(i, 1);
    const seen = witnessed ?? (reported ? false : this.copWitness(x, z));
    if (reported) {
      // the cops already saw this one
      for (const c of recent) if (c.type === type && c.counted && now - c.t < 30 && Math.hypot(c.x - x, c.z - z) < 45) {
        game.events.emit('crime', { type, x, z, severity: 0, victim, witnessed: false, reported: true });
        return;
      }
    }
    if (victim) {
      // a flurry of punches on one person is one incident
      for (const c of recent) if (c.victim === victim && c.type === type && c.counted && now - c.t < 3) pts *= 0.3;
    }
    const counted = seen || reported;
    recent.push({ type, x, z, t: now, victim, counted });
    game.events.emit('crime', { type, x, z, severity: pts, victim, witnessed: seen, reported });
    if (!counted) return;
    const before = this.heat;
    this.points = Math.min(40, this.points + pts * (reported ? 0.85 : 1));
    if (reported && this.points < THRESH[0]) this.points = THRESH[0] + 0.01; // a phoned-in crime gets a unit sent
    this.lastSeen = now;
    this.lastKnown.x = x;
    this.lastKnown.z = z;
    this._decayT = 0;
    this._syncHeat(type);
    if (this.heat === before && before > 0 && now - this._lastDispatch > 12) this._dispatch(type, x, z);
  }

  /** Does any officer (on foot or in a cruiser) see (x, z)? */
  copWitness(x, z) {
    const col = this.game.collision;
    for (const o of this.cops) {
      if (o.state !== 'active') continue;
      const src = o.vehicle ? o.vehicle.position : o.position;
      const r = o.vehicle ? WITNESS_CAR : WITNESS_FOOT;
      const dx = x - src.x;
      const dz = z - src.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (!o.vehicle && d2 > 14 * 14) {
        // on foot: roughly in front of them
        if (Math.abs(angleDiff(o.heading, headingTo(dx, dz))) > 1.15) continue;
      }
      if (col.lineOfSight(src.x, 1.6, src.z, x, 1.2, z)) return true;
    }
    return false;
  }

  _syncHeat(reason = '') {
    let lvl = 0;
    for (let i = 0; i < THRESH.length; i++) if (this.points >= THRESH[i]) lvl = i + 1;
    if (lvl === this.heat) return;
    const prev = this.heat;
    this.heat = lvl;
    this.game.events.emit('heat:change', { level: lvl });
    if (lvl > prev) this._onHeatUp(prev, reason);
    else if (lvl === 0) this._endPursuit(true);
  }

  _onHeatUp(prev, reason) {
    const game = this.game;
    const lk = this.lastKnown;
    this._dispatch(this.heat >= 2 && game.player?.vehicle ? 'pursuit' : reason, lk.x, lk.z);
    if (this.heat >= 2 && prev < 2) {
      for (const u of this.units) if (u.pursuit) u.vehicle.siren = true;
      game.audio?.play?.('siren_yelp', { x: lk.x, z: lk.z, volume: 0.8 });
    }
  }

  _dispatch(kind, x, z) {
    const game = this.game;
    const now = game.time.elapsed;
    if (now - this._lastDispatch < 4) return;
    this._lastDispatch = now;
    const p = game.player;
    const street = game.layout.describe(x, z).street || 'downtown';
    const dir = p?.vehicle ? compass(p.vehicle.heading) : compass(p?.heading || 0);
    const key = kind === 'pursuit' ? 'pursuit' : kind === 'assaultCop' ? 'assaultCop' : kind === 'carjack' ? 'carjack' : p?.vehicle ? 'pursuit' : kind === 'assault' ? 'assault' : this.heat >= 2 ? 'foot' : 'default';
    D.say(game, null, D.dispatchLine(key, street, dir), { color: D.COLORS.dispatch, speaker: 'Dispatch', priority: 1.6 });
  }

  // ================================================================== frame
  update(dt) {
    const game = this.game;
    const ctx = npcContext(game);
    const playing = game.mode === 'play' && !!game.player;
    this._manageT -= dt;
    if (this._manageT <= 0 || ctx.jumped) {
      this._manageT = 1;
      this._managePatrols(ctx);
      if (playing) this._managePursuit(ctx);
    }
    if (playing) {
      this._seeT -= dt;
      if (this._seeT <= 0) {
        this._seeT = 0.25;
        if (this.heat > 0 && !this._frozen && this._sees(ctx)) {
          this.lastSeen = game.time.elapsed;
          const f = game.focus;
          this.lastKnown.x = f.x;
          this.lastKnown.z = f.z;
          this._decayT = 0;
          this._escalate();
        }
      }
      this._decay(dt);
    }
    for (let i = this.units.length - 1; i >= 0; i--) this._updateUnit(this.units[i], dt, ctx);
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const o = this.cops[i];
      if (o.state === 'removed' && !o.vehicle) {
        this._forgetOfficer(o);
        continue;
      }
      this._updateOfficer(o, dt, ctx);
    }
    if (playing) this._bustCheck(dt);
    this._updateSiren(ctx);
    this._cleanupAbandoned(ctx);
  }

  _sees(ctx) {
    const game = this.game;
    const f = game.focus;
    const col = game.collision;
    for (const o of this.cops) {
      if (o.state !== 'active') continue;
      const src = o.vehicle ? o.vehicle.position : o.position;
      const r = o.vehicle ? SEE_CAR : SEE_FOOT;
      const d2 = (src.x - f.x) ** 2 + (src.z - f.z) ** 2;
      if (d2 > r * r) continue;
      if (col.lineOfSight(src.x, 1.6, src.z, f.x, 1.3, f.z)) return true;
    }
    void ctx;
    return false;
  }

  /** Heat creeps up while the player keeps running from officers who can see them. */
  _escalate() {
    const game = this.game;
    const p = game.player;
    const now = game.time.elapsed;
    if (this.heat === 1) {
      // evading at one star → resisting
      const fleeingCar = p.vehicle && Math.abs(p.vehicle.speed) > 15 && this._nearestUnitDist() < 35;
      if (fleeingCar && now - this._resistAt > 20) {
        this._resistAt = now;
        this.reportCrime('resist', { x: p.position.x, z: p.position.z, witnessed: true });
      }
    } else if (this.heat >= 2 && this.heat < 4 && p.vehicle && Math.abs(p.vehicle.speed) > 18) {
      this.points = Math.min(THRESH[3] - 0.01, this.points + 0.012);
      this._syncHeat('pursuit');
    }
  }

  _nearestUnitDist() {
    const f = this.game.focus;
    let best = Infinity;
    for (const u of this.units) best = Math.min(best, Math.hypot(u.vehicle.position.x - f.x, u.vehicle.position.z - f.z));
    return best;
  }

  _decay(dt) {
    if (this.heat <= 0 || this.busted) return;
    const game = this.game;
    const neutral = game.state && !game.state.wearingColors;
    const delay = neutral ? 16 : 25;
    const step = neutral ? 4 : 6.5;
    if (game.time.elapsed - this.lastSeen < delay) {
      this._decayT = 0;
      return;
    }
    this._decayT += dt;
    if (this._decayT < step) return;
    this._decayT = 0;
    this.points = this.heat >= 2 ? THRESH[this.heat - 2] + 0.01 : 0;
    this._syncHeat('decay');
  }

  // ================================================================== spawning
  _spawnOfficer(x, z, unit) {
    const game = this.game;
    const district = game.layout.districtAt(x, z)?.id || 'downtown';
    const o = createNpc(game, { kind: 'cop', faction: 'police', look: copLook(district), x, z, system: 'police', name: copName(), maxHealth: 120 });
    const b = o.brain;
    b.role = 'officer';
    b.unit = unit;
    b.state = unit ? 'car' : 'patrol';
    b.shoutT = 0;
    b.lineCd = 10;
    b.tackleCd = 0;
    b.walker = null;
    b.angry = false;
    this.cops.push(o);
    return o;
  }

  /** A police Vehicle: through game.traffic.spawnCar when it exists (then released to us), else built here. */
  _makeCruiser(x, z, heading) {
    const game = this.game;
    const tr = game.traffic;
    let v = null;
    if (typeof tr?.spawnCar === 'function') {
      try {
        v = tr.spawnCar({ x, z, heading, model: 'police', color: '#f2f2f2', ai: null });
        if (v && v.position) tr.release?.(v);
        else v = null;
      } catch {
        v = null;
      }
    }
    if (!v) {
      try {
        v = new Vehicle(game, { model: 'police', color: '#f2f2f2', x, z, heading, police: true });
      } catch (err) {
        console.warn('[police] could not build a cruiser', err);
        return null;
      }
    }
    v.isPolice = true;
    if (!game.vehicles.includes(v)) game.addVehicle(v);
    return v;
  }

  _spawnUnit(x, z, heading, mode, crew = 1) {
    const game = this.game;
    const v = this._makeCruiser(x, z, heading);
    if (!v) return null;
    const u = { id: unitIds++, vehicle: v, driver: new RoadDriver(game, v), officers: [], mode, pursuit: false, traffic: false, blockUntil: 0, t: 0, deployT: 0 };
    v.ai = u.driver; // keeps Vehicle from zeroing our controls when no one is in the seat
    for (let i = 0; i < crew; i++) {
      const o = this._spawnOfficer(x, z, u);
      u.officers.push(o);
      this._board(o, u);
    }
    v.setDriver(u.officers[0] || null);
    this.units.push(u);
    this.cruisers.push(v);
    if (mode === 'patrol') this._handToTraffic(u);
    return u;
  }

  _handToTraffic(u) {
    this._trafficDrive(u, 'cruise', null);
  }

  /**
   * Let game.traffic drive this unit: 'cruise' (patrol the lane graph) or 'chase' (A* routing,
   * flanking / boxing in the target). target: the player (Traffic follows player.vehicle itself)
   * or a {x, z} last-known point. Returns false when Traffic can't (then our RoadDriver drives).
   */
  _trafficDrive(u, mode, target) {
    const tr = this.game.traffic;
    if (!USE_TRAFFIC_CRUISE || typeof tr?.makeAIDriver !== 'function') return false;
    const v = u.vehicle;
    if (u.traffic && u.trMode === mode && u.trTarget === target && v.ai && v.ai.owner === tr) return true;
    try {
      if (!tr.makeAIDriver(v, { mode, target })) throw new Error('no ai');
      u.traffic = true;
      u.trMode = mode;
      u.trTarget = target;
      return true;
    } catch {
      u.traffic = false;
      u.trMode = null;
      u.trTarget = null;
      v.ai = u.driver;
      return false;
    }
  }

  _takeFromTraffic(u) {
    u.trMode = null;
    u.trTarget = null;
    if (!u.traffic) return;
    try {
      this.game.traffic?.release?.(u.vehicle);
    } catch {
      /* ignore */
    }
    u.traffic = false;
    u.vehicle.ai = u.driver;
    u.driver.reseat();
  }

  _board(o, u) {
    const game = this.game;
    stopFight(o);
    o.vehicle = u.vehicle;
    o.brain.state = 'car';
    if (game.actors.includes(o)) game.removeActor(o);
    if (!u.vehicle.driver || u.vehicle.driver.kind !== 'cop') u.vehicle.setDriver(o);
  }

  _unboard(o, u, i = 0) {
    const game = this.game;
    const v = u.vehicle;
    let p = v.getExitPoint?.() || { x: v.position.x + 2, z: v.position.z };
    if (i > 0) {
      // partner climbs out the other side
      const rx = Math.cos(v.heading);
      const rz = -Math.sin(v.heading);
      const side = (p.x - v.position.x) * rx + (p.z - v.position.z) * rz > 0 ? -1 : 1;
      const q = { x: v.position.x + rx * side * ((v.width || 1.9) / 2 + 0.8), z: v.position.z + rz * side * ((v.width || 1.9) / 2 + 0.8) };
      if (game.collision.isFree(q.x, q.z, 0.4, 0.3, 1.8)) p = q;
    }
    o.position.set(p.x, 0, p.z);
    o.faceHeading(v.heading);
    o.vehicle = null;
    if (!game.actors.includes(o)) game.addActor(o);
    o.character.setVisible(true);
    o.brain.visible = true;
    if (v.driver === o) v.setDriver(null);
    o.brain.state = 'foot';
  }

  _removeUnit(u, removeVehicle = true) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    const j = this.cruisers.indexOf(u.vehicle);
    if (j >= 0) this.cruisers.splice(j, 1);
    for (const o of [...u.officers]) {
      if (o.vehicle === u.vehicle) this._removeOfficer(o);
      else o.brain.unit = null;
    }
    u.officers.length = 0;
    const v = u.vehicle;
    if (removeVehicle && this.game.vehicles.includes(v) && v.driver !== this.game.player) {
      if (u.traffic) {
        try {
          this.game.traffic?.release?.(v);
        } catch {
          /* ignore */
        }
      }
      v.setDriver?.(null);
      this.game.removeVehicle(v);
    } else if (v.ai === u.driver) {
      v.ai = null;
      v.siren = false;
    }
  }

  _removeOfficer(o) {
    const i = this.cops.indexOf(o);
    if (i >= 0) this.cops.splice(i, 1);
    const u = o.brain.unit;
    if (u) {
      const j = u.officers.indexOf(o);
      if (j >= 0) u.officers.splice(j, 1);
      if (u.vehicle.driver === o) u.vehicle.setDriver(null);
    }
    o.vehicle = null;
    if (o.state !== 'removed') o.remove();
  }

  _forgetOfficer(o) {
    const i = this.cops.indexOf(o);
    if (i >= 0) this.cops.splice(i, 1);
    const u = o.brain.unit;
    if (u) {
      const j = u.officers.indexOf(o);
      if (j >= 0) u.officers.splice(j, 1);
    }
  }

  _despawnAll() {
    for (const u of [...this.units]) this._removeUnit(u, true);
    for (const o of [...this.cops]) this._removeOfficer(o);
    this.units.length = 0;
    this.cops.length = 0;
    this.cruisers.length = 0;
    for (const v of this._abandoned) if (this.game.vehicles.includes(v) && v.driver !== this.game.player) this.game.removeVehicle(v);
    this._abandoned.length = 0;
    this._siren?.stop?.();
    this._siren = null;
  }

  /** Called by Pedestrians.spawnPed: if Traffic ejects a "driver" from a jacked cruiser, it's our officer. */
  ejectedOfficerNear(x, z) {
    for (const u of this.units) {
      const v = u.vehicle;
      if (Math.hypot(v.position.x - x, v.position.z - z) > 7) continue;
      const inside = u.officers.find((o) => o.vehicle === v);
      if (!inside || v.driver === inside) continue;
      this._unboard(inside, u, 0);
      inside.brain.state = 'foot';
      inside.brain.angry = true;
      return inside;
    }
    return null;
  }

  /** Random lane position on a road between rMin and rMax from (fx, fz), out of view. */
  _roadSpawn(ctx, fx, fz, rMin, rMax, towardX = null, towardZ = null, hidden = true) {
    const L = this.game.layout;
    const edges = L.edges;
    for (let tries = 0; tries < 60; tries++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      // cheap reject by distance to the edge midpoint
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const md = Math.hypot(mx - fx, mz - fz);
      if (md > rMax + e.length / 2 || md < rMin - e.length / 2) continue;
      let from = Math.random() < 0.5 ? a.id : b.id;
      if (towardX !== null) {
        const da = Math.hypot(a.x - towardX, a.z - towardZ);
        const db = Math.hypot(b.x - towardX, b.z - towardZ);
        from = da > db ? a.id : b.id; // drive toward the end nearer the target
      }
      const s = L.laneStart(e, from, 0);
      const en = L.laneEnd(e, from, 0);
      const t = 0.15 + Math.random() * 0.7;
      const x = s.x + (en.x - s.x) * t;
      const z = s.z + (en.z - s.z) * t;
      const d = Math.hypot(x - fx, z - fz);
      if (d < rMin || d > rMax) continue;
      if (hidden && ctx.inView(x, z, 4) && d < 150) continue;
      if (this.game.vehiclesNear(x, z, 9).length) continue;
      return { x, z, heading: headingTo(en.x - s.x, en.z - s.z), edge: e, from };
    }
    return null;
  }

  // ================================================================== population
  _managePatrols(ctx) {
    const game = this.game;
    const L = game.layout;
    const district = L.districtAt(ctx.fx, ctx.fz);
    const level = district?.policeLevel ?? 1;
    const detail = game.quality.detail || 0;
    const target = clamp(Math.round(level * (1.1 + detail * 0.6)), 1, 4);
    let patrols = 0;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const d2 = ctx.d2(u.vehicle.position.x, u.vehicle.position.z);
      if (u.mode === 'patrol' || u.mode === 'leave') {
        const far = u.mode === 'leave' ? 140 : 260;
        const allAboard = u.officers.every((o) => o.vehicle === u.vehicle || o.state !== 'active');
        if (allAboard && (d2 > 340 * 340 || (d2 > far * far && !ctx.inView(u.vehicle.position.x, u.vehicle.position.z, 4)))) {
          this._removeUnit(u);
          continue;
        }
        if (u.mode === 'patrol') patrols++;
      }
    }
    if (patrols < target) {
      const near = ctx.jumped ? 70 : 110;
      const pt = this._roadSpawn(ctx, ctx.fx, ctx.fz, near, 230, null, null, !ctx.jumped);
      if (pt) this._spawnUnit(pt.x, pt.z, pt.heading, 'patrol', Math.random() < 0.35 ? 2 : 1);
    }
    // foot patrols downtown / Old Market
    const footZone = district && (district.id === 'downtown' || district.id === 'oldmarket');
    let pairs = 0;
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const o = this.cops[i];
      if (o.brain.unit || o.vehicle) continue;
      const d2 = ctx.d2(o.position.x, o.position.z);
      const st = o.brain.state;
      if (st === 'patrol' || st === 'leave') {
        if (d2 > 160 * 160 || (d2 > 110 * 110 && !ctx.inView(o.position.x, o.position.z)) || (o.state === 'ko' && o.koTime > 30 && !ctx.inView(o.position.x, o.position.z))) {
          this._removeOfficer(o);
          continue;
        }
        if (st === 'patrol' && o.brain.lead) pairs++;
      }
    }
    const wantPairs = footZone ? (detail >= 1 ? 2 : 1) : 0;
    if (pairs < wantPairs) {
      const pt = this.graph.randomPoint(ctx.fx, ctx.fz, ctx.jumped ? 25 : 45, 110, Math.random, (x, z) => {
        const d = L.districtAt(x, z)?.id;
        return (d === 'downtown' || d === 'oldmarket') && (ctx.jumped || !ctx.inView(x, z, 2) || ctx.d2(x, z) > 80 * 80);
      });
      if (pt) {
        const lead = this._spawnOfficer(pt.x, pt.z, null);
        lead.brain.lead = true;
        lead.brain.walker = new Walker(this.graph);
        lead.brain.walker.crossChance = 0.4;
        lead.brain.walker.placeOn(pt.link);
        const mate = this._spawnOfficer(pt.x + 0.9, pt.z + 0.5, null);
        mate.brain.partner = lead;
      }
    }
  }

  _managePursuit(ctx) {
    const game = this.game;
    if (this.heat <= 0 || this.busted || this._frozen) return;
    const player = game.player;
    const f = game.focus;
    let pursuing = 0;
    for (const u of this.units) if (u.pursuit) pursuing++;
    const want = PURSUIT_UNITS[this.heat];
    if (pursuing < want) {
      // nearest patrol unit takes the call, else a new one rolls in
      let best = null;
      let bd = 240 * 240;
      for (const u of this.units) {
        if (u.pursuit || u.mode === 'block') continue;
        const d2 = ctx.d2(u.vehicle.position.x, u.vehicle.position.z);
        if (d2 < bd && u.officers.some((o) => o.vehicle === u.vehicle)) {
          bd = d2;
          best = u;
        }
      }
      if (best) this._joinPursuit(best);
      else {
        const pt = this._roadSpawn(ctx, f.x, f.z, 85, 170, f.x, f.z, true) || this._roadSpawn(ctx, f.x, f.z, 60, 200, f.x, f.z, false);
        if (pt) {
          const u = this._spawnUnit(pt.x, pt.z, pt.heading, 'pursuit', this.heat >= 3 ? 2 : 1);
          if (u) this._joinPursuit(u);
        }
      }
    } else if (pursuing > want + 1) {
      // stars dropped: extra units go back to patrol
      for (const u of this.units) {
        if (!u.pursuit) continue;
        this._leavePursuit(u);
        if (--pursuing <= want) break;
      }
    }
    // extra officers on foot at 4+ stars
    if (this.heat >= 4 && !player.vehicle) {
      let foot = 0;
      for (const o of this.cops) if (!o.vehicle && !o.brain.unit && o.brain.state === 'foot') foot++;
      if (foot < 2) {
        const pt = this.graph.randomPoint(f.x, f.z, 35, 70, Math.random, (x, z) => !ctx.inView(x, z, 2));
        if (pt) {
          const o = this._spawnOfficer(pt.x, pt.z, null);
          o.brain.state = 'foot';
        }
      }
    }
    // foot patrols nearby join in
    for (const o of this.cops) {
      if (o.vehicle || o.state !== 'active') continue;
      if (o.brain.state === 'patrol' && ctx.d2(o.position.x, o.position.z) < 60 * 60 && game.time.elapsed - this.lastSeen < 3) {
        o.brain.state = 'foot';
        D.say(game, o, D.pick(D.COP.freeze), { color: D.COLORS.cop, priority: 2, range: 40 });
      }
    }
    // roadblock attempt at 3+ stars against a car
    if (this.heat >= 3 && player.vehicle && Math.abs(player.vehicle.speed) > 8 && game.time.elapsed - this._roadblockAt > 40) {
      this._roadblockAt = game.time.elapsed;
      this._roadblock(ctx);
    }
  }

  _joinPursuit(u) {
    this._takeFromTraffic(u);
    u.pursuit = true;
    u.mode = 'pursuit';
    u.vehicle.siren = this.heat >= 2;
    u.t = 0;
  }

  _leavePursuit(u) {
    u.pursuit = false;
    u.vehicle.siren = false;
    const aboard = u.officers.every((o) => o.vehicle === u.vehicle || o.state !== 'active');
    if (aboard) {
      u.mode = 'patrol';
      u.driver.reseat();
      this._handToTraffic(u);
    } else {
      u.mode = 'deployed';
      for (const o of u.officers) if (!o.vehicle && o.state === 'active') o.brain.state = 'return';
    }
  }

  _endPursuit(lost) {
    const game = this.game;
    for (const u of this.units) {
      if (u.pursuit) this._leavePursuit(u);
      else if (u.mode === 'block') {
        u.mode = 'deployed';
        for (const o of u.officers) if (!o.vehicle && o.state === 'active') o.brain.state = 'return';
      }
    }
    for (const o of this.cops) {
      if (o.vehicle || o.state !== 'active') continue;
      stopFight(o);
      o.brain.angry = false;
      const st = o.brain.state;
      if (st === 'foot' || st === 'fight' || st === 'block') o.brain.state = o.brain.unit ? 'return' : o.brain.walkerHome ? 'patrol' : 'leave';
    }
    this.bustT = 0;
    if (lost && game.mode === 'play') D.say(game, null, D.dispatchLine('lost'), { color: D.COLORS.dispatch, speaker: 'Dispatch', priority: 1.6 });
  }

  _roadblock(ctx) {
    const game = this.game;
    const L = game.layout;
    const pv = game.player.vehicle;
    const ne = L.nearestEdge(pv.position.x, pv.position.z).edge;
    if (!ne) return false;
    const a = L.nodes[ne.a];
    const b = L.nodes[ne.b];
    const towardB = Math.abs(angleDiff(pv.heading, headingTo(b.x - a.x, b.z - a.z))) < Math.PI / 2;
    let from = towardB ? a : b;
    let node = towardB ? b : a;
    let edge = ne;
    let dist = Math.hypot(node.x - pv.position.x, node.z - pv.position.z);
    for (let steps = 0; dist < 115 && steps < 6; steps++) {
      const nb = L.neighbors(node.id).find((q) => q.edge.axis === edge.axis && q.node.id !== from.id);
      if (!nb) break;
      from = node;
      node = nb.node;
      edge = nb.edge;
      dist += nb.edge.length;
    }
    if (dist < 75) return false;
    const len = Math.hypot(node.x - from.x, node.z - from.z) || 1;
    const dx = (node.x - from.x) / len;
    const dz = (node.z - from.z) / len;
    const back = L.crossWidth(node, edge) / 2 + 12;
    const cx = node.x - dx * back;
    const cz = node.z - dz * back;
    const across = headingTo(dx, dz) + Math.PI / 2;
    const px = -dz;
    const pz = dx;
    const off = Math.min(2.8, edge.width / 4 + 0.4);
    for (const s of [-1, 1]) {
      const x = cx + px * off * s;
      const z = cz + pz * off * s;
      if (game.vehiclesNear(x, z, 3.5).length) continue;
      const u = this._spawnUnit(x, z, across + (s > 0 ? Math.PI : 0), 'block', 1);
      if (!u) continue;
      u.blockUntil = game.time.elapsed + 45;
      u.vehicle.siren = true;
      u.blockX = cx;
      u.blockZ = cz;
      const o = u.officers[0];
      this._unboard(o, u, 0);
      o.brain.state = 'block';
      o.brain.blockX = x + dx * -3;
      o.brain.blockZ = z + dz * -3;
    }
    D.say(game, null, D.dispatchLine('roadblock', L.describe(cx, cz).street || edge.name), { color: D.COLORS.dispatch, speaker: 'Dispatch', priority: 1.6 });
    return true;
  }

  // ================================================================== units (cruisers)
  _updateUnit(u, dt, ctx) {
    const game = this.game;
    const v = u.vehicle;
    const player = game.player;
    if (!game.vehicles.includes(v)) {
      // someone else removed the car (traffic cleanup): drop the unit
      this._removeUnit(u, false);
      return;
    }
    if (player && v.driver === player) {
      this._lostCar(u);
      return;
    }
    u.t += dt;
    // officers inside ride along
    for (const o of u.officers) {
      if (o.vehicle === v) {
        o.position.x = v.position.x;
        o.position.z = v.position.z;
        o.heading = v.heading;
      }
    }
    let aboard = 0;
    let away = 0; // active officers out of the car
    for (const o of u.officers) {
      if (o.vehicle === v) aboard++;
      else if (o.state === 'active') away++;
    }
    if (!aboard && u.mode !== 'block' && u.mode !== 'deployed') u.mode = 'deployed';
    switch (u.mode) {
      case 'patrol':
      case 'leave':
        v.siren = false;
        if (!u.traffic) u.driver.patrol(dt);
        break;
      case 'pursuit':
        this._drivePursuit(u, dt, ctx);
        break;
      case 'deployed': {
        if (u.traffic) this._takeFromTraffic(u);
        u.driver.stop();
        const back = u.officers.length > 0 && away === 0;
        if (u.officers.length === 0) {
          // crew gone (KO'd and cleaned up): the car stays as an abandoned cruiser
          this._removeUnit(u, false);
          this._abandoned.push(v);
          v.siren = false;
          break;
        }
        if (back && aboard) {
          if (this.heat > 0 && !this.busted) {
            u.mode = 'pursuit';
            u.pursuit = true;
          } else {
            u.mode = 'patrol';
            u.pursuit = false;
            v.siren = false;
            u.driver.reseat();
            this._handToTraffic(u);
          }
        }
        break;
      }
      case 'block': {
        if (u.traffic) this._takeFromTraffic(u);
        u.driver.stop();
        const f = game.focus;
        const passed = Math.hypot(f.x - u.blockX, f.z - u.blockZ) > 140 && game.time.elapsed > u.blockUntil - 30;
        if (game.time.elapsed > u.blockUntil || passed || this.heat === 0) {
          u.mode = 'deployed';
          for (const o of u.officers) if (!o.vehicle && o.state === 'active') o.brain.state = 'return';
        }
        break;
      }
      default:
        u.driver.stop();
    }
  }

  _drivePursuit(u, dt, ctx) {
    const game = this.game;
    const v = u.vehicle;
    const player = game.player;
    if (!player || this._frozen || this.busted) {
      u.driver.stop();
      return;
    }
    const now = game.time.elapsed;
    const seen = now - this.lastSeen < 1.5;
    const pv = player.vehicle;
    const tp = pv ? pv.position : player.position;
    const gx = seen ? tp.x : this.lastKnown.x;
    const gz = seen ? tp.z : this.lastKnown.z;
    const d = Math.hypot(gx - v.position.x, gz - v.position.z);
    v.siren = this.heat >= 2;
    if (!pv && seen && d < 15) {
      // suspect on foot: pull up and get out
      this._takeFromTraffic(u);
      u.driver.stop();
      if (Math.abs(v.speed) < 2.5) this._deploy(u);
      return;
    }
    if (pv && seen && Math.abs(pv.speed) < 1.2 && d < 12) {
      // car stopped: box it in and get out
      this._takeFromTraffic(u);
      u.driver.stop();
      if (Math.abs(v.speed) < 2) this._deploy(u);
      return;
    }
    if (!seen && d < 14) {
      // lost them at the last known spot: cruise around the area
      if (!this._trafficDrive(u, 'cruise', null)) u.driver.patrol(dt, 0.6);
      return;
    }
    const los = d < 50 && game.collision.lineOfSight(v.position.x, 1.2, v.position.z, gx, 1.2, gz);
    if (pv && seen && this.heat >= 4 && d < 32 && los) {
      // aggressive: ram the suspect's car (aim a little ahead of it)
      this._takeFromTraffic(u);
      const lead = clamp(d / 25, 0.2, 0.9);
      const fx = -Math.sin(pv.heading) * pv.speed * lead;
      const fz = -Math.cos(pv.heading) * pv.speed * lead;
      u.driver.steerTo(gx + fx, gz + fz, Math.abs(pv.speed) + 9, dt, 3);
      return;
    }
    // the pursuit proper: Traffic's chase driver (routes over the street graph, flanks the car)
    const lk = this._lkTarget || (this._lkTarget = { x: 0, z: 0 });
    lk.x = this.lastKnown.x;
    lk.z = this.lastKnown.z;
    if (this._trafficDrive(u, 'chase', seen ? player : lk)) {
      if (u.vehicle.ai) u.vehicle.ai.speedMul = this.heat >= 3 ? 1.15 : 1;
      return;
    }
    let speed = this.heat >= 2 ? 21 : 14;
    if (pv && seen && d < 25) speed = Math.max(8, Math.abs(pv.speed) + 3); // tail, don't overshoot
    u.driver.route(gx, gz, dt, speed, los && d < 40);
  }

  _deploy(u) {
    if (u.mode === 'deployed') return;
    u.mode = 'deployed';
    let i = 0;
    for (const o of u.officers) {
      if (o.vehicle !== u.vehicle) continue;
      this._unboard(o, u, i++);
      o.brain.state = 'foot';
    }
    const first = u.officers[0];
    if (first) D.say(this.game, first, D.pick(D.COP.freeze), { color: D.COLORS.cop, priority: 2, range: 45 });
  }

  _lostCar(u) {
    // the player took the cruiser: the crew is on foot and very upset
    const v = u.vehicle;
    const game = this.game;
    for (const o of [...u.officers]) {
      if (o.vehicle === v) this._unboard(o, u, 0);
      o.brain.unit = null;
      o.brain.state = 'foot';
      o.brain.angry = true;
    }
    u.officers.length = 0;
    this._removeUnit(u, false);
    if (u.traffic) {
      try {
        game.traffic?.release?.(v);
      } catch {
        /* ignore */
      }
    }
    v.ai = null;
    v.siren = false;
    this._abandoned.push(v);
    this.reportCrime('carjack', { x: v.position.x, z: v.position.z, severity: 4, witnessed: true });
  }

  _cleanupAbandoned(ctx) {
    const game = this.game;
    for (let i = this._abandoned.length - 1; i >= 0; i--) {
      const v = this._abandoned[i];
      if (!game.vehicles.includes(v)) {
        this._abandoned.splice(i, 1);
        continue;
      }
      if (v.driver === game.player) continue;
      if (ctx.d2(v.position.x, v.position.z) > 300 * 300) {
        game.removeVehicle(v);
        this._abandoned.splice(i, 1);
      }
    }
  }

  // ================================================================== officers on foot
  _updateOfficer(o, dt, ctx) {
    const game = this.game;
    const b = o.brain;
    if (o.vehicle) return; // riding: synced by the unit
    const sc = stateChange(o);
    if (sc === 'ko') stopFight(o);
    else if (sc === 'revived') b.state = this.heat > 0 ? 'foot' : b.unit ? 'return' : 'leave';
    const chasing = b.state === 'foot' || b.state === 'fight' || b.state === 'return';
    const ldt = lodStep(ctx, o, dt, chasing);
    if (!ldt) return;
    if (o.state === 'ko') {
      lieStill(game, ctx, o, ldt);
      if (o.koTime > 34) o.revive(0.5);
      return;
    }
    b.shoutT -= ldt;
    b.lineCd -= ldt;
    b.tackleCd -= ldt;
    const player = game.player;
    const v = this._v;
    switch (b.state) {
      case 'patrol':
        this._footPatrol(o, ldt, ctx);
        break;
      case 'foot':
        this._chase(o, ldt, ctx);
        break;
      case 'fight': {
        const r = fightStep(game, ctx, o, ldt, { damage: this.heat >= 4 ? 9 : 6, speed: RUN + 0.8, windup: 0.32, cooldown: [1.1, 1.8], knockback: 1.2, backOffAt: 0 });
        const t = b.fight?.target;
        const calm = t === player && player && (player.speed || 0) < 0.8 && !b.angry;
        if (r === 'lost' || r === 'car' || calm || this.heat === 0) {
          stopFight(o);
          b.state = this.heat > 0 ? 'foot' : b.unit ? 'return' : 'leave';
        }
        break;
      }
      case 'return': {
        const u = b.unit;
        if (!u || !this.units.includes(u)) {
          b.state = this.heat > 0 ? 'foot' : 'leave';
          b.unit = null;
          break;
        }
        const car = u.vehicle;
        const d = seek(o, car.position.x, car.position.z, this.heat > 0 ? RUN : JOG, v, 1);
        locomote(game, ctx, o, v.x, v.z, ldt);
        setAnim(o, o.speed > 3.4 ? 'run' : 'walk');
        if (d < 2.8 || o.brain.stuck > 3) {
          o.brain.stuck = 0;
          this._board(o, u);
        }
        // the player got out again close by: back on foot
        if (this.heat > 0 && player && !player.vehicle && Math.hypot(player.position.x - o.position.x, player.position.z - o.position.z) < 22) b.state = 'foot';
        break;
      }
      case 'block': {
        const f = headingTo(ctx.fx - o.position.x, ctx.fz - o.position.z);
        const d = seek(o, b.blockX ?? o.position.x, b.blockZ ?? o.position.z, WALK, v, 0.5);
        if (d > 0.5) locomote(game, ctx, o, v.x, v.z, ldt);
        else stand(game, ctx, o, ldt, f, 4);
        setAnim(o, d > 0.5 ? 'walk' : 'idle');
        if (this.heat > 0 && player && !player.vehicle && Math.hypot(player.position.x - o.position.x, player.position.z - o.position.z) < 35) b.state = 'foot';
        break;
      }
      case 'leave': {
        if (!b.walker) {
          b.walker = new Walker(this.graph);
          b.walker.resume(o.position.x, o.position.z);
        }
        const r = b.walker.update(game, o, WALK, ldt, v);
        if (r === 'wait') stand(game, ctx, o, ldt);
        else locomote(game, ctx, o, v.x, v.z, ldt);
        setAnim(o, o.speed > 0.25 ? 'walk' : 'idle');
        if (ctx.d2(o.position.x, o.position.z) > 90 * 90 && !ctx.inView(o.position.x, o.position.z)) this._removeOfficer(o);
        break;
      }
      default:
        stand(game, ctx, o, ldt);
        setAnim(o, 'idle');
    }
  }

  _footPatrol(o, dt, ctx) {
    const game = this.game;
    const b = o.brain;
    const v = this._v;
    const lead = b.partner;
    if (lead && lead.state === 'active' && lead.brain.state === 'patrol' && !lead.vehicle) {
      // walk beside the partner
      const rx = Math.cos(lead.heading);
      const rz = -Math.sin(lead.heading);
      const tx = lead.position.x + rx * 1.1;
      const tz = lead.position.z + rz * 1.1;
      const gap = Math.hypot(tx - o.position.x, tz - o.position.z);
      const d = seek(o, tx, tz, gap > 2 ? JOG : WALK, v, 0.6);
      locomote(game, ctx, o, v.x, v.z, dt, d < 0.8 ? lead.heading : null);
    } else {
      if (!b.walker) {
        b.walker = new Walker(this.graph);
        b.walker.crossChance = 0.4;
        b.walker.resume(o.position.x, o.position.z);
        b.lead = true;
      }
      b.walkerHome = true;
      const r = b.walker.update(game, o, WALK * 0.95, dt, v);
      if (r === 'wait') stand(game, ctx, o, dt);
      else locomote(game, ctx, o, v.x, v.z, dt);
      if (b.stuck > 1.5) {
        b.stuck = 0;
        b.walker.reroute(game);
      }
    }
    setAnim(o, o.speed > 0.25 ? 'walk' : 'idle');
    const player = game.player;
    if (player && !player.vehicle && b.lineCd <= 0 && this.heat === 0) {
      const d2 = (player.position.x - o.position.x) ** 2 + (player.position.z - o.position.z) ** 2;
      if (d2 < 4.5 * 4.5) {
        b.lineCd = 40;
        D.say(game, o, D.pick(D.COP.patrol), { color: D.COLORS.cop, range: 8 });
      }
    }
  }

  _chase(o, dt, ctx) {
    const game = this.game;
    const b = o.brain;
    const player = game.player;
    const v = this._v;
    if (!player || this.heat === 0 || this.busted) {
      stand(game, ctx, o, dt, player ? headingTo(player.position.x - o.position.x, player.position.z - o.position.z) : null);
      setAnim(o, 'idle');
      if (this.heat === 0 && !this.busted) b.state = b.unit ? 'return' : 'leave';
      return;
    }
    const pv = player.vehicle;
    const tp = pv ? pv.position : player.position;
    const dx = tp.x - o.position.x;
    const dz = tp.z - o.position.z;
    const d = Math.hypot(dx, dz);
    const face = headingTo(dx, dz);
    if (pv) {
      // suspect in a car: back to the cruiser unless the car is stopped right here
      const u = b.unit;
      const slow = Math.abs(pv.speed) < 1.5;
      if (slow && d < 25) {
        const s = d > 2.2 ? RUN : 0;
        locomote(game, ctx, o, (dx / d) * s, (dz / d) * s, dt, face, 10);
        setAnim(o, s ? 'run' : 'idle');
        if (d < 8 && b.shoutT <= 0) {
          b.shoutT = 6;
          D.say(game, o, 'Step out of the vehicle!', { color: D.COLORS.cop, priority: 2, speaker: o.name });
        }
        return;
      }
      if (u && this.units.includes(u) && Math.hypot(u.vehicle.position.x - o.position.x, u.vehicle.position.z - o.position.z) < 45) b.state = 'return';
      else if (d > 60) b.state = 'leave';
      else {
        locomote(game, ctx, o, (dx / d) * RUN, (dz / d) * RUN, dt);
        setAnim(o, 'run');
      }
      return;
    }
    if (d > 75) {
      b.state = b.unit ? 'return' : 'leave';
      return;
    }
    // shout, then close in
    if (d < 14 && b.shoutT <= 0) {
      b.shoutT = 7;
      b.orderAt = game.time.elapsed;
      D.say(game, o, D.pick(d < 3 ? D.COP.arrest : D.COP.freeze), { color: D.COLORS.cop, priority: 2, range: 30 });
    }
    // running from an officer who told you to stop = resisting (1★ → 2★)
    const now = game.time.elapsed;
    if (this.heat === 1 && b.orderAt && now - b.orderAt < 6 && d > 10 && (player.speed || 0) > 4 && now - this._resistAt > 20) {
      this._resistAt = now;
      this.reportCrime('resist', { x: player.position.x, z: player.position.z, witnessed: true });
    }
    const runningAway = (player.speed || 0) > 1.5;
    const rough = this.heat >= 2 || b.angry;
    // tackle a runner from close range
    if (rough && runningAway && d > 1.4 && d < 3.2 && b.tackleCd <= 0) {
      b.tackleCd = 3.5;
      o.velocity.x += (dx / d) * 6;
      o.velocity.z += (dz / d) * 6;
      o.faceHeading(face);
      playOnce(o, 'punch2');
      game.combat?.melee?.(o, { damage: 5, range: 1.9, knockback: 0.8, delay: 0.22 });
      game.audio?.play?.('whoosh', { x: o.position.x, z: o.position.z, volume: 0.5 });
    }
    if (d < BUST_R) {
      if (rough && (runningAway || b.angry) && this.heat >= 2) {
        startFight(o, player);
        b.state = 'fight';
        return;
      }
      // cuffing: hold position right on the suspect
      stand(game, ctx, o, dt, face, 12);
      setAnim(o, 'idle');
      return;
    }
    const speed = this.heat >= 2 || d > 9 ? RUN + 0.9 : JOG;
    // aim slightly ahead of a runner
    const lead = runningAway ? 0.35 : 0;
    const fx = -Math.sin(player.heading) * (player.speed || 0) * lead;
    const fz = -Math.cos(player.heading) * (player.speed || 0) * lead;
    const d2 = seek(o, tp.x + fx, tp.z + fz, speed, v, 0.6);
    locomote(game, ctx, o, v.x, v.z, dt, d2 < 2 ? face : null, 12);
    setAnim(o, o.speed > 3.4 ? 'run' : o.speed > 0.3 ? 'walk' : 'idle');
  }

  _bustCheck(dt) {
    const game = this.game;
    const player = game.player;
    if (!player || this.heat <= 0 || this.busted || this._frozen) {
      this.bustT = 0;
      return;
    }
    const pv = player.vehicle;
    const tp = pv ? pv.position : player.position;
    const r = pv ? (pv.width || 1.9) / 2 + 1.6 : BUST_R;
    const stopped = !pv || Math.abs(pv.speed) < 1;
    let near = null;
    for (const o of this.cops) {
      if (o.vehicle || o.state !== 'active') continue;
      const d2 = (o.position.x - tp.x) ** 2 + (o.position.z - tp.z) ** 2;
      if (d2 < r * r) {
        near = o;
        break;
      }
    }
    if (near && stopped) this.bustT += dt;
    else this.bustT = Math.max(0, this.bustT - dt * 0.8);
    if (this.bustT >= BUST_TIME) {
      this.busted = true;
      this.bustT = 0;
      playOnce(near, 'point');
      D.say(game, near, D.pick(D.COP.arrest), { color: D.COLORS.cop, priority: 3, range: 30 });
      for (const u of this.units) u.driver.stop();
      game.events.emit('player:busted', {});
    }
  }

  // ================================================================== siren audio
  _updateSiren(ctx) {
    if (!SIREN_AUDIO) return;
    const audio = this.game.audio;
    let best = null;
    let bd = 160 * 160;
    for (const u of this.units) {
      if (!u.vehicle.siren) continue;
      const d2 = ctx.d2(u.vehicle.position.x, u.vehicle.position.z);
      if (d2 < bd) {
        bd = d2;
        best = u.vehicle;
      }
    }
    if (best && this.game.mode === 'play') {
      if (!this._siren && audio?.loop) {
        try {
          this._siren = audio.loop('siren', { x: best.position.x, z: best.position.z, volume: 0.7 });
        } catch {
          this._siren = null;
        }
      }
      this._siren?.setPosition?.(best.position.x, best.position.z);
      this._siren?.setVolume?.(clamp(1 - Math.sqrt(bd) / 160, 0.1, 0.8));
    } else if (this._siren) {
      this._siren.stop?.();
      this._siren = null;
    }
  }

  // ================================================================== events
  _onHit({ target, attacker }) {
    const game = this.game;
    const player = game.player;
    if (!attacker || !target || attacker !== player || target === player) return;
    const x = target.position.x;
    const z = target.position.z;
    if (target.kind === 'cop') {
      this.reportCrime('assaultCop', { x, z, victim: target, witnessed: true });
      // officers fight back
      target.brain.angry = true;
      if (target.state === 'active' && !target.vehicle) {
        startFight(target, player);
        target.brain.state = 'fight';
      }
      for (const o of this.cops) {
        if (o === target || o.vehicle || o.state !== 'active') continue;
        if ((o.position.x - x) ** 2 + (o.position.z - z) ** 2 < 30 * 30) {
          o.brain.angry = true;
          if (o.brain.state === 'patrol' || o.brain.state === 'block') o.brain.state = 'foot';
        }
      }
      if (Math.random() < 0.5) D.say(game, target, D.pick(D.COP.hit), { color: D.COLORS.cop, priority: 2 });
      return;
    }
    const sev = target.kind === 'gang' ? 0.6 : BASE_POINTS.assault;
    this.reportCrime('assault', { x, z, severity: sev, victim: target });
  }

  _onJacked({ vehicle, from, by }) {
    const game = this.game;
    if (!vehicle || by !== game.player) return;
    const u = this.units.find((q) => q.vehicle === vehicle);
    if (u) {
      this._lostCar(u);
      return;
    }
    this.reportCrime('carjack', { x: vehicle.position.x, z: vehicle.position.z, victim: from || null });
  }

  _onRunOver({ vehicle, actor }) {
    const game = this.game;
    if (!vehicle || !actor || vehicle.driver !== game.player || actor === game.player) return;
    this.reportCrime('hitAndRun', { x: actor.position.x, z: actor.position.z, victim: actor, severity: actor.kind === 'cop' ? 5 : BASE_POINTS.hitAndRun });
  }
}
