import { npcContext } from './npc/context.js';
import { sidewalkGraph, Walker } from './npc/sidewalks.js';
import { createNpc, locomote, stand, seek, setAnim, playOnce, lodStep, stateChange, lieStill, SPRINT } from './npc/steering.js';
import { civilianLook, pickArchetype } from './npc/looks.js';
import { CIV, COLORS, say, pick } from './npc/dialog.js';
import { headingTo } from '../core/math.js';

// Civilians (ARCHITECTURE §18). Adults in everyday 1993 clothes walk the sidewalks, turn at
// corners and cross at crosswalks (waiting for the light / a gap in traffic), stop at bus stops,
// payphones and store windows, chat in pairs, react when bumped, dodge fast cars, flee and cower
// from fights, and — 1993, no cell phones — run to a payphone to call the police when they
// witness a crime the cops did not see.
//
//   game.pedestrians.peds                         civilian Actors (kind 'ped', faction 'civ')
//   game.pedestrians.spawnPed({ x, z, flee, look }) → Actor   (Traffic: carjacked drivers)

const SPAWN_MIN = 38;
const SPAWN_MAX = 105;
const DESPAWN = 150;
const DESPAWN_UNSEEN = 118;

// how a POI type is used: stand facing the building / the street / talk on the phone
const POI_USE = {
  bus: { anim: 'idle', faceStreet: true, cap: 3, dur: [20, 60] },
  payphone: { anim: 'talk', faceStreet: false, cap: 1, dur: [12, 30] },
  'phone booth': { anim: 'talk', faceStreet: false, cap: 1, dur: [12, 30] },
  store: { anim: 'idle', faceStreet: false, cap: 2, dur: [8, 22] },
  food: { anim: 'idle', faceStreet: false, cap: 2, dur: [10, 26] },
  clothes: { anim: 'idle', faceStreet: false, cap: 2, dur: [8, 20] },
  record: { anim: 'idle', faceStreet: false, cap: 2, dur: [10, 24] },
  barber: { anim: 'talk', faceStreet: false, cap: 1, dur: [10, 24] },
};

const DISTRICT_DENSITY = { downtown: 1.0, oldmarket: 1.05, midtown: 0.85, north: 0.8, nodo: 0.55, eastomaha: 0.35, riverfront: 0.5 };

export class Pedestrians {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.peds = [];
    this.graph = null;
    this._pois = [];
    this._phones = [];
    this._poiUse = new Map(); // poi id → occupants
    this._manageT = 0;
    this._v = { x: 0, z: 0 };
    this._recentCrimes = [];
    this._offs = [];
  }

  init() {
    const game = this.game;
    this.graph = sidewalkGraph(game);
    for (const poi of game.city?.pois || []) {
      if (!POI_USE[poi.type]) continue;
      this._pois.push(poi);
      if (poi.type === 'payphone' || poi.type === 'phone booth') this._phones.push(poi);
    }
    const ev = game.events;
    this._offs.push(
      ev.on('actor:hit', (e) => this._onHit(e)),
      ev.on('crime', (e) => this._onCrime(e)),
      ev.on('vehicle:jacked', (e) => this._onJacked(e)),
      ev.on('vehicle:hitActor', (e) => this._onRunOver(e)),
    );
  }

  onGameStart() {
    this.clearAll();
    const g = this.game;
    if (g.debugApi) {
      g.debugApi.spawnPed = (x, z, opts = {}) => this.spawnPed({ x, z, ...opts });
      g.debugApi.peds = () => this.peds.map((a) => ({ id: a.id, state: a.brain.state, arche: a.brain.arche, x: +a.position.x.toFixed(1), z: +a.position.z.toFixed(1), alive: a.alive }));
    }
  }

  onGameEnd() {
    this.clearAll();
  }

  clearAll() {
    for (const a of this.peds) a.remove();
    this.peds.length = 0;
    this._poiUse.clear();
  }

  // ------------------------------------------------------------------ public
  /** Spawn a civilian at (x, z). opts.flee = Actor to run from (carjacked drivers). */
  spawnPed({ x, z, flee = null, look = null, arche = null, heading = 0 } = {}) {
    // a carjacked police cruiser ejects its officer, not a civilian
    const cop = this.game.police?.ejectedOfficerNear?.(x, z);
    if (cop) return cop;
    const game = this.game;
    const district = game.layout.districtAt(x, z)?.id || 'north';
    const kind = arche || pickArchetype(district, game.clock.hour, game.clock.day);
    const civ = civilianLook(kind, district);
    const a = createNpc(game, {
      kind: 'ped',
      faction: 'civ',
      look: look ? { ...civ.look, ...look } : civ.look,
      x,
      z,
      heading,
      system: 'pedestrians',
      name: civ.label,
      maxHealth: kind === 'elder' ? 60 : 80,
    });
    const b = a.brain;
    b.arche = civ.arche;
    b.speed = civ.speed;
    b.walker = new Walker(this.graph);
    b.walker.crossChance = civ.arche === 'jogger' ? 0.35 : 0.55;
    b.state = 'walk';
    b.poi = null;
    b.threat = null;
    b.report = null;
    b.partner = null;
    b.bumpCd = 0;
    b.lineCd = 6 + Math.random() * 20;
    b.tough = civ.arche === 'worker' ? 0.35 : civ.arche === 'casual' ? 0.12 : 0;
    this.peds.push(a);
    if (!b.walker.resume(x, z)) {
      b.state = 'idle';
      b.t = 4;
    }
    if (flee) {
      this._flee(a, flee.position.x, flee.position.z, flee, 7 + Math.random() * 3, true);
      if (flee === game.player) {
        // the victim runs off and calls it in
        b.report = { type: 'carjack', x, z, severity: 1.6, delay: 6 + Math.random() * 6 };
        say(game, a, pick(CIV.jacked), { color: COLORS.civ, priority: 2, range: 25 });
      }
    }
    return a;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const game = this.game;
    const ctx = npcContext(game);
    if (ctx.jumped) this._repopulate(ctx);
    this._manageT -= dt;
    if (this._manageT <= 0) {
      this._manageT = 0.5;
      this._manage(ctx);
    }
    const peds = this.peds;
    for (let i = peds.length - 1; i >= 0; i--) {
      const a = peds[i];
      if (a.state === 'removed') {
        this._forget(a, i);
        continue;
      }
      this._updatePed(a, dt, ctx);
    }
  }

  _targetCount() {
    const g = this.game;
    const h = g.clock.hour;
    let tf;
    if (h >= 9 && h < 18) tf = 1;
    else if (h >= 18 && h < 22) tf = 0.85;
    else if (h >= 6 && h < 9) tf = 0.7;
    else if (h >= 22 || h < 1) tf = 0.5;
    else tf = 0.25;
    const f = g.focus;
    const dist = g.layout.districtAt(f.x, f.z)?.id;
    const df = DISTRICT_DENSITY[dist] ?? 0.8;
    const wet = g.environment?.weather === 'rain' ? 0.6 : 1;
    return Math.round((g.quality.maxPeds || 16) * tf * df * wet);
  }

  _repopulate(ctx) {
    // focus teleported (new game, respawn, debug teleport): clear what's far and fill in around
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const a = this.peds[i];
      if (ctx.d2(a.position.x, a.position.z) > DESPAWN * DESPAWN) this._despawn(a, i);
    }
    const target = this._targetCount();
    let guard = 0;
    while (this.peds.length < target && guard++ < target * 2) this._spawnAmbient(ctx, 10, SPAWN_MAX, false);
  }

  _manage(ctx) {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const a = this.peds[i];
      const d2 = ctx.d2(a.position.x, a.position.z);
      const b = a.brain;
      if (b.state === 'call' && d2 < DESPAWN * DESPAWN) continue; // let witnesses finish the call
      if (d2 > DESPAWN * DESPAWN || (d2 > DESPAWN_UNSEEN * DESPAWN_UNSEEN && !ctx.inView(a.position.x, a.position.z))) {
        this._despawn(a, i);
        continue;
      }
      // knocked-out civilians get carted off once nobody is looking
      if (a.state === 'ko' && ((a.koTime > 18 && !ctx.inView(a.position.x, a.position.z)) || a.koTime > 45)) this._despawn(a, i);
    }
    const target = this._targetCount();
    if (this.peds.length < target) {
      this._spawnAmbient(ctx, SPAWN_MIN, SPAWN_MAX, true);
      if (this.peds.length < target - 4) this._spawnAmbient(ctx, SPAWN_MIN, SPAWN_MAX, true);
    } else if (this.peds.length > target + 3) {
      // budget dropped (night / quality change): retire the farthest unseen one
      let far = -1;
      let fd = 0;
      for (let i = 0; i < this.peds.length; i++) {
        const a = this.peds[i];
        const d2 = ctx.d2(a.position.x, a.position.z);
        if (d2 > fd && d2 > 50 * 50 && !ctx.inView(a.position.x, a.position.z)) {
          fd = d2;
          far = i;
        }
      }
      if (far >= 0) this._despawn(this.peds[far], far);
    }
  }

  _spawnAmbient(ctx, rMin, rMax, hidden) {
    const filter = hidden ? (x, z) => !ctx.inView(x, z, 2) || (x - ctx.fx) ** 2 + (z - ctx.fz) ** 2 > 75 * 75 : null;
    const roll = Math.random();
    if (roll < 0.22 && this._pois.length) {
      // someone at a bus stop / payphone / storefront
      const poi = this._freePoiNear(ctx.fx, ctx.fz, rMin, rMax, filter);
      if (poi) {
        const a = this.spawnPed({ x: poi.x, z: poi.z, heading: poi.heading || 0 });
        this._takePoi(a, poi, true);
        return a;
      }
    }
    const pt = this.graph.randomPoint(ctx.fx, ctx.fz, rMin, rMax, Math.random, filter);
    if (!pt) return null;
    const a = this.spawnPed({ x: pt.x, z: pt.z });
    a.brain.walker.placeOn(pt.link);
    if (roll > 0.86 && a.brain.arche !== 'jogger' && this.peds.length < this._targetCount()) {
      // a pair stopped on the sidewalk, catching up
      const ox = pt.link.axis === 'z' ? 0 : 1.25;
      const oz = pt.link.axis === 'z' ? 1.25 : 0;
      const b2 = this.spawnPed({ x: pt.x + ox, z: pt.z + oz });
      if (b2.kind === 'ped') {
        b2.brain.walker.placeOn(pt.link);
        this._startChat(a, b2);
      }
    }
    return a;
  }

  _freePoiNear(fx, fz, rMin, rMax, filter) {
    const r0 = rMin * rMin;
    const r1 = rMax * rMax;
    for (let tries = 0; tries < 12; tries++) {
      const poi = this._pois[Math.floor(Math.random() * this._pois.length)];
      const d2 = (poi.x - fx) ** 2 + (poi.z - fz) ** 2;
      if (d2 < r0 || d2 > r1) continue;
      if ((this._poiUse.get(poi.id) || 0) >= (POI_USE[poi.type]?.cap || 1)) continue;
      if (filter && !filter(poi.x, poi.z)) continue;
      return poi;
    }
    return null;
  }

  _takePoi(a, poi, arrived = false) {
    const b = a.brain;
    const use = POI_USE[poi.type];
    const n = this._poiUse.get(poi.id) || 0;
    this._poiUse.set(poi.id, n + 1);
    b.poi = poi;
    b.state = 'poi';
    b.atPoi = arrived;
    // spread several people at one bus stop
    const h = poi.heading || 0;
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const slot = (n - (use.cap - 1) / 2) * 1.1;
    b.poiX = poi.x + rx * slot;
    b.poiZ = poi.z + rz * slot;
    b.poiFace = use.faceStreet ? h + Math.PI : h;
    b.poiAnim = use.anim;
    b.t = use.dur[0] + Math.random() * (use.dur[1] - use.dur[0]);
    if (arrived) {
      a.position.x = b.poiX;
      a.position.z = b.poiZ;
      a.faceHeading(b.poiFace);
    }
  }

  _releasePoi(a) {
    const b = a.brain;
    if (!b.poi) return;
    const n = (this._poiUse.get(b.poi.id) || 1) - 1;
    if (n <= 0) this._poiUse.delete(b.poi.id);
    else this._poiUse.set(b.poi.id, n);
    b.poi = null;
  }

  _startChat(a, b2) {
    const ba = a.brain;
    const bb = b2.brain;
    ba.state = 'chat';
    bb.state = 'chat';
    ba.partner = b2;
    bb.partner = a;
    ba.t = bb.t = 18 + Math.random() * 30;
    ba.talkT = 0;
    bb.talkT = 1.5;
  }

  _despawn(a, i) {
    this._releasePoi(a);
    if (a.brain.partner) a.brain.partner.brain.partner = null;
    a.remove();
    this.peds.splice(i, 1);
  }

  _forget(a, i) {
    this._releasePoi(a);
    this.peds.splice(i, 1);
  }

  // ------------------------------------------------------------------ per ped
  _updatePed(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    const sc = stateChange(a);
    if (sc === 'ko') {
      this._releasePoi(a);
      b.state = 'ko';
      if (b.partner) {
        this._flee(b.partner, a.position.x, a.position.z, a.lastAttacker, 8);
        b.partner.brain.partner = null;
        b.partner = null;
      }
    } else if (sc === 'revived') {
      const att = a.lastAttacker;
      this._flee(a, att ? att.position.x : a.position.x + 1, att ? att.position.z : a.position.z, att, 9, true);
    }
    const ldt = lodStep(ctx, a, dt, b.state === 'flee' || b.state === 'call');
    if (!ldt) return;
    if (a.state === 'ko') {
      lieStill(game, ctx, a, ldt);
      return;
    }
    b.bumpCd -= ldt;
    b.lineCd -= ldt;
    b.think -= ldt;
    if (b.think <= 0) {
      b.think = 0.2 + Math.random() * 0.1;
      this._perceive(a, ctx);
    }
    if (b.report) {
      b.report.delay -= ldt;
      if (b.report.delay <= 0 && b.state !== 'call') this._startCall(a);
    }
    const v = this._v;
    switch (b.state) {
      case 'walk': {
        const r = b.walker.update(game, a, b.speed, ldt, v);
        if (r === 'wait') {
          stand(game, ctx, a, ldt, this._crossFace(b.walker), 5);
          setAnim(a, 'idle');
        } else {
          locomote(game, ctx, a, v.x, v.z, ldt);
          setAnim(a, b.speed > 2.4 ? 'run' : 'walk');
        }
        if (b.stuck > 1.2) {
          b.stuck = 0;
          b.walker.reroute(game);
        }
        break;
      }
      case 'poi': {
        if (!b.atPoi) {
          const d = seek(a, b.poiX, b.poiZ, b.speed, v, 0.6);
          locomote(game, ctx, a, v.x, v.z, ldt);
          setAnim(a, 'walk');
          if (d < 0.45 || b.stuck > 2) {
            b.atPoi = true;
            b.stuck = 0;
          }
        } else {
          stand(game, ctx, a, ldt, b.poiFace, 5);
          setAnim(a, b.poiAnim);
          b.t -= ldt;
          if (b.t <= 0) this._resumeWalk(a);
        }
        break;
      }
      case 'chat': {
        const o = b.partner;
        if (!o || o.state !== 'active' || o.brain.state !== 'chat') {
          this._resumeWalk(a);
          break;
        }
        stand(game, ctx, a, ldt, headingTo(o.position.x - a.position.x, o.position.z - a.position.z), 5);
        b.talkT -= ldt;
        if (b.talkT <= 0) {
          b.talkT = 1.5 + Math.random() * 2.5;
          const talking = b.anim !== 'talk';
          setAnim(a, talking ? 'talk' : 'idle');
          if (talking && Math.random() < 0.25) playOnce(a, Math.random() < 0.5 ? 'point' : 'cheer');
        }
        b.t -= ldt;
        if (b.t <= 0) {
          b.partner = null;
          o.brain.partner = null;
          this._resumeWalk(a);
          this._resumeWalk(o);
          o.brain.walker.reroute(game); // head off opposite ways
        }
        break;
      }
      case 'flee': {
        const t = b.threat;
        if (t && t.state !== 'removed') {
          b.tx = t.position.x;
          b.tz = t.position.z;
        }
        let dx = a.position.x - b.tx;
        let dz = a.position.z - b.tz;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        // veer a little so a crowd scatters instead of running in a line
        const w = b.veer;
        const s = b.fleeSpeed;
        locomote(game, ctx, a, (dx - dz * w) * s, (dz + dx * w) * s, ldt, null, 12);
        setAnim(a, 'run');
        b.t -= ldt;
        if (b.stuck > 0.8 && d < 12) {
          // cornered: cover up
          b.stuck = 0;
          this._cower(a, 3 + Math.random() * 3);
        } else if (b.stuck > 1.2) {
          b.stuck = 0;
          b.veer = -b.veer * 1.5 || 0.9;
        } else if (b.t <= 0 && d > 22) {
          if (b.report) this._startCall(a);
          else this._resumeWalk(a);
        }
        break;
      }
      case 'cower': {
        const t = b.threat;
        stand(game, ctx, a, ldt, t ? headingTo(t.position.x - a.position.x, t.position.z - a.position.z) : null, 4);
        setAnim(a, 'crouch');
        b.t -= ldt;
        if (b.t <= 0) {
          if (t && t.state === 'active' && Math.hypot(t.position.x - a.position.x, t.position.z - a.position.z) < 14) this._flee(a, t.position.x, t.position.z, t, 6, true);
          else if (b.report) this._startCall(a);
          else this._resumeWalk(a);
        }
        break;
      }
      case 'dodge': {
        locomote(game, ctx, a, b.dx, b.dz, ldt, null, 14);
        setAnim(a, 'run');
        b.t -= ldt;
        if (b.t <= 0) {
          if (b.after === 'flee' && b.threat) this._flee(a, b.threat.position.x, b.threat.position.z, b.threat, 4, true);
          else this._resumeWalk(a);
        }
        break;
      }
      case 'react': {
        const t = b.threat;
        stand(game, ctx, a, ldt, t ? headingTo(t.position.x - a.position.x, t.position.z - a.position.z) : null, 8);
        setAnim(a, 'talk');
        b.t -= ldt;
        if (b.t <= 0) this._resumeWalk(a);
        break;
      }
      case 'call': {
        this._updateCall(a, ldt, ctx);
        break;
      }
      default: {
        stand(game, ctx, a, ldt);
        setAnim(a, 'idle');
        b.t = (b.t || 3) - ldt;
        if (b.t <= 0) this._resumeWalk(a);
      }
    }
  }

  _crossFace(w) {
    const g = this.graph;
    const a = g.corners[w.from];
    const c = g.corners[w.to];
    return headingTo(c.x - a.x, c.z - a.z);
  }

  _resumeWalk(a) {
    const b = a.brain;
    this._releasePoi(a);
    b.state = 'walk';
    b.threat = null;
    b.stuck = 0;
    if (!b.walker.resume(a.position.x, a.position.z)) {
      b.state = 'idle';
      b.t = 5;
    }
  }

  _flee(a, fromX, fromZ, threat = null, time = 6, force = false) {
    const b = a.brain;
    if (a.state !== 'active') return;
    if (!force && (b.state === 'flee' || b.state === 'call')) {
      b.t = Math.max(b.t, time * 0.6);
      return;
    }
    this._releasePoi(a);
    if (b.partner) {
      b.partner.brain.partner = null;
      b.partner = null;
    }
    b.state = 'flee';
    b.threat = threat;
    b.tx = fromX;
    b.tz = fromZ;
    b.t = time;
    b.stuck = 0;
    b.veer = (Math.random() - 0.5) * 0.9;
    b.fleeSpeed = b.arche === 'elder' ? 2.6 : b.arche === 'church' ? 4.2 : SPRINT * (0.75 + Math.random() * 0.2);
    if (Math.random() < 0.35) say(this.game, a, pick(CIV.flee), { color: COLORS.civ, range: 22 });
  }

  _cower(a, time) {
    const b = a.brain;
    this._releasePoi(a);
    b.state = 'cower';
    b.t = time;
  }

  // ------------------------------------------------------------------ perception
  _perceive(a, ctx) {
    const game = this.game;
    const b = a.brain;
    const p = a.position;
    const player = game.player;

    // fast cars heading our way → jump out of the way
    if (b.state !== 'dodge' && b.state !== 'cower') {
      const vs = ctx.vehicles;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        const sp = Math.abs(v.speed || 0);
        if (sp < 7) continue;
        const rx = p.x - v.position.x;
        const rz = p.z - v.position.z;
        const d2 = rx * rx + rz * rz;
        if (d2 > 24 * 24) continue;
        const sg = Math.sign(v.speed);
        const fx = -Math.sin(v.heading) * sg;
        const fz = -Math.cos(v.heading) * sg;
        const along = rx * fx + rz * fz;
        if (along < -1 || along / sp > 1.5) continue;
        const lat = rx * -fz + rz * fx; // + = right of the car
        const onWalk = game.layout.isSidewalk(v.position.x, v.position.z);
        if (Math.abs(lat) < 2.8 || (onWalk && d2 < 14 * 14)) {
          const dir = Math.abs(lat) > 0.2 ? Math.sign(lat) : Math.random() < 0.5 ? -1 : 1;
          this._releasePoi(a);
          b.state = 'dodge';
          b.t = 0.75;
          b.dx = -fz * dir * 5.5;
          b.dz = fx * dir * 5.5;
          b.threat = v.driver || null;
          b.after = b.threat && (onWalk || v.driver === player) ? 'flee' : null;
          if (v.driver === player) say(game, a, pick(CIV.car), { color: COLORS.civ, range: 20 });
          return;
        }
      }
    }

    if (!player || player.vehicle || player.state !== 'active') return;
    const dx = player.position.x - p.x;
    const dz = player.position.z - p.z;
    const d2 = dx * dx + dz * dz;

    // bumped by the player
    const touch = a.radius + player.radius + 0.28;
    if (d2 < touch * touch && (player.speed || 0) > 1.3 && b.bumpCd <= 0 && (b.state === 'walk' || b.state === 'poi' || b.state === 'chat' || b.state === 'idle')) {
      b.bumpCd = 4;
      const d = Math.sqrt(d2) || 1;
      a.velocity.x -= (dx / d) * (player.speed > 5 ? 3.2 : 1.8);
      a.velocity.z -= (dz / d) * (player.speed > 5 ? 3.2 : 1.8);
      const line = pick(b.arche === 'elder' ? CIV.bumpElder : CIV.bump);
      if (b.state === 'poi' || b.state === 'chat') {
        // just a glare, stay put
        say(game, a, line, { color: COLORS.civ, priority: 1.5 });
        return;
      }
      b.state = 'react';
      b.threat = player;
      b.t = 1.3 + Math.random() * 0.6;
      say(game, a, line, { color: COLORS.civ, priority: 1.5 });
      return;
    }

    // ambient line as the player walks past
    if (d2 < 5 * 5 && b.lineCd <= 0 && (b.state === 'walk' || b.state === 'poi' || b.state === 'chat')) {
      b.lineCd = 25 + Math.random() * 25;
      if (Math.random() < 0.55) {
        const pool = CIV[b.arche] && Math.random() < 0.6 ? CIV[b.arche] : b.state === 'chat' ? CIV.chatter : CIV.ambient;
        say(game, a, pick(pool), { color: COLORS.civ, range: 8 });
      }
    }

    // passers-by sometimes stop at a free POI they walk past
    if (b.state === 'walk' && b.arche !== 'jogger' && Math.random() < 0.04) {
      for (let i = 0; i < this._pois.length; i++) {
        const poi = this._pois[i];
        const q2 = (poi.x - p.x) ** 2 + (poi.z - p.z) ** 2;
        if (q2 > 6 * 6) continue;
        if ((this._poiUse.get(poi.id) || 0) >= (POI_USE[poi.type]?.cap || 1)) continue;
        this._takePoi(a, poi, false);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ calling the police
  _startCall(a) {
    const b = a.brain;
    if (!b.report || a.state !== 'active') return;
    this._releasePoi(a);
    b.state = 'call';
    b.callPhone = null;
    let bd = 75 * 75;
    for (const ph of this._phones) {
      const d2 = (ph.x - a.position.x) ** 2 + (ph.z - a.position.z) ** 2;
      if (d2 < bd) {
        bd = d2;
        b.callPhone = ph;
      }
    }
    b.callT = b.callPhone ? 3.2 : 6 + Math.random() * 4; // no phone near: "someone called from the store"
    if (Math.random() < 0.6) say(this.game, a, pick(CIV.call), { color: COLORS.civ, range: 22 });
  }

  _updateCall(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    const ph = b.callPhone;
    const v = this._v;
    if (ph) {
      const d = seek(a, ph.x, ph.z, 4.2, v, 0.6);
      if (d > 0.6) {
        locomote(game, ctx, a, v.x, v.z, dt);
        setAnim(a, 'run');
        if (b.stuck > 2.5) b.callPhone = null;
        return;
      }
      stand(game, ctx, a, dt, ph.heading || 0, 8);
      setAnim(a, 'talk');
      if (b.callT > 2.9 && b.callT - dt <= 2.9) {
        const street = game.layout.describe(b.report.x, b.report.z).street || 'the corner';
        say(game, a, CIV.phone(street), { color: COLORS.civ, range: 24, priority: 1.8 });
      }
    } else {
      stand(game, ctx, a, dt);
      setAnim(a, 'idle');
    }
    b.callT -= dt;
    if (b.callT <= 0) {
      const r = b.report;
      b.report = null;
      game.police?.reportCrime?.(r.type, { x: r.x, z: r.z, severity: r.severity, reported: true, victim: r.victim || null });
      this._resumeWalk(a);
    }
  }

  // ------------------------------------------------------------------ events
  _onHit({ target, attacker }) {
    if (!attacker || !target) return;
    const tx = target.position.x;
    const tz = target.position.z;
    const peds = this.peds;
    for (let i = 0; i < peds.length; i++) {
      const a = peds[i];
      if (a.state !== 'active' || a === attacker) continue;
      const b = a.brain;
      if (a === target) {
        if (b.tough > 0 && Math.random() < b.tough && attacker.kind === 'player') {
          // some folks square up once before thinking better of it
          b.tough = 0;
          b.state = 'react';
          b.threat = attacker;
          b.t = 0.8;
          say(this.game, a, pick(['Oh, you wanna go?', 'Back up off me!', "You done lost your mind!"]), { color: COLORS.civ, priority: 1.6 });
          continue;
        }
        this._flee(a, attacker.position.x, attacker.position.z, attacker, 9, true);
        continue;
      }
      const dx = a.position.x - tx;
      const dz = a.position.z - tz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 26 * 26) continue;
      if (b.state === 'flee' || b.state === 'cower' || b.state === 'call') continue;
      if (d2 > 14 * 14 && Math.random() < 0.4) continue;
      if (d2 < 7 * 7 && (b.arche === 'elder' || Math.random() < 0.25)) this._cower(a, 2.5 + Math.random() * 3);
      else this._flee(a, tx, tz, attacker, 5 + Math.random() * 4);
    }
  }

  _onCrime({ type, x, z, severity, witnessed, victim }) {
    if (witnessed) return; // the police saw it themselves
    const game = this.game;
    const now = game.time.elapsed;
    // one caller per incident (a flurry of punches is one incident)
    const rc = this._recentCrimes;
    for (let i = rc.length - 1; i >= 0; i--) if (now - rc[i].t > 12) rc.splice(i, 1);
    for (const c of rc) if (c.type === type && Math.hypot(c.x - x, c.z - z) < 30) return;
    let best = null;
    let bd = 34 * 34;
    for (const a of this.peds) {
      if (a.state !== 'active' || a.brain.report) continue;
      const d2 = (a.position.x - x) ** 2 + (a.position.z - z) ** 2;
      if (d2 > bd) continue;
      if (!game.collision.lineOfSight(a.position.x, 1.6, a.position.z, x, 1.2, z)) continue;
      bd = d2;
      best = a;
    }
    // the victim calls it in themselves (only our own pedestrians: a carjacked driver is Traffic's
    // virtual actor until spawnPed turns them into one of ours)
    if (victim && victim.kind === 'ped' && victim.brain && victim.system === 'pedestrians' && victim.state === 'active' && !victim.brain.report) best = victim;
    if (!best) return;
    rc.push({ type, x, z, t: now });
    best.brain.report = { type, x, z, severity: (severity || 1) * 0.8, delay: 4 + Math.random() * 5, victim };
    const bs = best.brain.state;
    if (bs !== 'flee' && bs !== 'call' && bs !== 'cower') this._flee(best, x, z, game.player, 3 + Math.random() * 2);
  }

  _onJacked({ vehicle, by }) {
    if (!vehicle) return;
    const vx = vehicle.position.x;
    const vz = vehicle.position.z;
    for (const a of this.peds) {
      if (a.state !== 'active') continue;
      const d2 = (a.position.x - vx) ** 2 + (a.position.z - vz) ** 2;
      if (d2 < 22 * 22) this._flee(a, vx, vz, by || null, 5 + Math.random() * 3);
    }
  }

  _onRunOver({ vehicle, actor }) {
    if (!vehicle) return;
    const vx = vehicle.position.x;
    const vz = vehicle.position.z;
    for (const a of this.peds) {
      if (a.state !== 'active' || a === actor) continue;
      const d2 = (a.position.x - vx) ** 2 + (a.position.z - vz) ** 2;
      if (d2 < 24 * 24) this._flee(a, vx, vz, vehicle.driver || null, 6);
    }
  }
}
