import { SETS, SIDES, TURF_ZONES, zoneById, setById, sideOfSet } from '../data/sets.js';
import { hash } from '../core/rng.js';
import { headingTo, forward, right } from '../core/math.js';
import { npcContext } from './npc/context.js';
import { sidewalkGraph, Walker } from './npc/sidewalks.js';
import { createNpc, locomote, stand, seek, setAnim, playOnce, lodStep, stateChange, lieStill, WALK, RUN, SPRINT } from './npc/steering.js';
import { startFight, fightStep, stopFight } from './npc/fight.js';
import { gangLook, gangName } from './npc/looks.js';
import { makeBoombox, placeProp } from './npc/props.js';
import * as D from './npc/dialog.js';
import { OGS } from '../data/missions.js';

// Sets, hangouts, the rules of the street, homies and turf (ARCHITECTURE §18).
//
// Hangouts: groups of 3–6 members at hood POIs, stores, corners and parks inside zones their set
// owns (count scaled by control and quality.maxGang): leaning on walls, talking, dancing to a
// boombox, throwing up signs; pairs patrol the zone's sidewalks.
// Rules: rival-side members notice the player within ~18 m in their zone when wearing colors,
// warn once, then attack if the player stays, throws a sign, or hits one of them. Same-side
// members of other sets nod; own-set members greet you by set name.
// Homies: "Roll with me" on own-set members (max 3); they follow in formation, fight hostiles,
// ride hidden in the player's car, G toggles follow / wait, E sends one home.
// Turf: game.state.turf { owner, control } — addInfluence swings it (tags, fights), owners slowly
// regenerate control, and now and then a rival crew rolls into a border zone ('beef', paged).

const ACTIVATE_R = 140;
const DEACTIVATE_R = 178;
const SPOT_POI = { store: 1, food: 1, record: 1, barber: 1, payphone: 1, clothes: 1, garage: 1 };
const MAX_HOMIES = 3;
const CLAIM = 30; // control a set needs to take an unclaimed zone

const FIGHT = {
  hang: { damage: 6, speed: 5.2, windup: 0.32, cooldown: [1.0, 1.7], knockback: 3, backOffAt: 0.35 },
  patrol: { damage: 6, speed: 5.4, windup: 0.3, cooldown: [1.0, 1.6], knockback: 3, backOffAt: 0.35 },
  og: { damage: 10, speed: 4.6, windup: 0.36, cooldown: [1.1, 1.8], knockback: 4, backOffAt: 0.22 },
  fighter: { damage: 9, speed: 5.7, windup: 0.28, cooldown: [0.9, 1.5], knockback: 3.5, backOffAt: 0.3 },
  homie: { damage: 9, speed: 6.4, windup: 0.26, cooldown: [0.8, 1.4], knockback: 3.5, backOffAt: 0.3, swingGap: 0.3 },
};

// homie formation around the player: (meters right, meters behind)
// (flanking, nearly abreast: the chase camera behind the player stays clear)
const FORMATION = [
  [-1.9, 0.6],
  [1.9, 0.6],
  [-3.3, 1.5],
];

let groupIds = 1;

export class Gangs {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.members = [];
    this.homies = [];
    this.groups = [];
    this.spots = [];
    this.homieMode = 'follow';
    this.beef = null;
    this.graph = null;
    this.ogName = 'Big Earl';
    this._manageT = 0;
    this._regenT = 0;
    this._beefT = 200;
    this._threats = new Map(); // actor → time until which it counts as a threat to the crew
    this._v = { x: 0, z: 0 };
    this._f = { x: 0, z: 0 };
    this._r = { x: 0, z: 0 };
    this._lastEmit = new Map();
  }

  // ================================================================== lifecycle
  init() {
    const game = this.game;
    this.graph = sidewalkGraph(game);
    this._buildSpots();
    const ev = game.events;
    ev.on('actor:hit', (e) => this._onHit(e));
    ev.on('actor:ko', (e) => this._onKo(e));
    ev.on('player:sign', (e) => this._onSign(e));
    ev.on('player:homies', () => this.toggleHomies());
    ev.on('player:enterVehicle', (e) => this._onEnterVehicle(e));
    ev.on('player:exitVehicle', (e) => this._onExitVehicle(e));
    ev.on('vehicle:hitActor', (e) => this._onRunOver(e));
    ev.on('mission:complete', (e) => this._releaseMissionCrew(e?.mission));
    ev.on('mission:fail', (e) => this._releaseMissionCrew(e?.mission));
  }

  onGameStart() {
    this.clearAll();
    this.homieMode = 'follow';
    this._fresh = true; // first manage pass may spawn in view (the hood crew must be there)
    this._manageT = 0;
    this._beefT = 150 + Math.random() * 150;
    this.ogName = OGS[this.game.state?.player?.setId]?.name || gangName('og');
    const g = this.game;
    if (g.debugApi) {
      g.debugApi.spawnGang = (setId, x, z, n = 3, role = 'hang') => {
        const out = [];
        for (let i = 0; i < n; i++) out.push(this.spawnMember({ setId, x: x + (i % 3) * 1.4 - 1.4, z: z + Math.floor(i / 3) * 1.4, role }));
        return out.map((a) => a && a.id);
      };
      g.debugApi.beefNow = () => this._startBeef(true);
      g.debugApi.gangs = () => ({
        members: this.members.length,
        homies: this.homies.map((a) => ({ id: a.id, state: a.brain.state, riding: !!a.brain.riding, x: +a.position.x.toFixed(1), z: +a.position.z.toFixed(1) })),
        groups: this.groups.map((q) => ({ id: q.id, set: q.setId, kind: q.kind, size: q.members.length, mode: q.mode, alert: q.alert, rel: q.rel, x: Math.round(q.cx), z: Math.round(q.cz) })),
        beef: this.beef ? { zone: this.beef.zoneId, set: this.beef.setId, t: Math.round(this.beef.t) } : null,
      });
    }
  }

  onGameEnd() {
    this.clearAll();
  }

  onPlayerRespawn() {
    // the crew scatters when you go down or get locked up
    for (const a of [...this.homies]) this.dismiss(a, true);
    if (this.beef) this._endBeef(false, true);
    for (const g of this.groups) {
      if (g.mode === 'fight') this._calmGroup(g);
    }
  }

  clearAll() {
    for (const g of [...this.groups]) this._removeGroup(g);
    for (const a of [...this.members]) this._removeMember(a);
    this.members.length = 0;
    this.homies.length = 0;
    this.groups.length = 0;
    this._threats.clear();
    if (this.beef) {
      this.game.hud?.removeMarker?.('beef');
      this.beef = null;
    }
    for (const s of this.spots) {
      s.group = null;
      s.cool = 0;
    }
  }

  serialize(state) {
    if (!state.turf) state.turf = {};
    for (const z of TURF_ZONES) {
      const t = state.turf[z.id] || (state.turf[z.id] = { owner: z.owner, control: z.owner ? 70 : 0 });
      t.control = Math.round(Math.max(0, Math.min(100, t.control)) * 10) / 10;
      if (t.owner && !setById(t.owner)) t.owner = null;
    }
  }

  // ================================================================== turf API
  zones() {
    return TURF_ZONES;
  }

  getZoneOwner(zoneId) {
    const t = this.game.state?.turf?.[zoneId];
    return t ? t.owner : zoneById(zoneId)?.owner ?? null;
  }

  getControl(zoneId) {
    const t = this.game.state?.turf?.[zoneId];
    if (t) return t.control;
    return zoneById(zoneId)?.owner ? 70 : 0;
  }

  /** Shift control of zoneId toward setId. Emits 'turf:influence', and 'turf:change' on a flip. */
  addInfluence(zoneId, setId, amount) {
    const st = this.game.state;
    if (!st || !amount) return;
    const zone = zoneById(zoneId);
    if (!zone || zone.noTurf || !setById(setId)) return;
    const t = st.turf[zoneId] || (st.turf[zoneId] = { owner: null, control: 0 });
    const prev = t.owner;
    if (t.owner === null) {
      // unclaimed ground (the contested zones): sets race for it; t.lead is who's ahead and
      // t.control their progress — a set only owns it once it reaches CLAIM (one tag won't do)
      if (!t.lead || t.lead === setId || t.control <= 0) {
        t.lead = setId;
        t.control = Math.min(100, Math.max(0, t.control) + amount);
      } else {
        t.control -= amount;
        if (t.control < 0) {
          t.lead = setId;
          t.control = -t.control;
        }
      }
      if (t.control >= CLAIM) {
        t.owner = t.lead;
        t.lead = null;
      }
    } else if (t.owner === setId) {
      t.control = Math.min(100, t.control + amount);
    } else {
      t.control -= amount;
      if (t.control < 0) {
        t.owner = setId;
        t.control = Math.min(100, -t.control);
      }
    }
    const payload = { zoneId, owner: t.owner, control: t.control, prev, setId, amount, lead: t.lead || null };
    this.game.events.emit('turf:influence', payload);
    if (t.owner !== prev) this.game.events.emit('turf:change', payload);
  }

  // ================================================================== relations
  relation(setId) {
    const ps = this.game.state?.player?.setId;
    if (!ps || !setId) return 'none';
    if (setId === ps) return 'own';
    return sideOfSet(setId) === sideOfSet(ps) ? 'ally' : 'rival';
  }

  /** Will this gang actor attack the player? */
  isHostile(a) {
    if (!a || a.kind !== 'gang' || a.state !== 'active' || a.userData?.homie) return false;
    const b = a.brain;
    if (!b) return false;
    const p = this.game.player;
    if (b.state === 'fight' && b.fight?.target && (b.fight.target === p || b.fight.target.userData?.homie)) return true;
    const g = b.group;
    if (!g) return false;
    if (g.rel === 'rival' && (g.alert === 'warned' || g.mode === 'fight' || g.kind === 'beef' || g.kind === 'hunt')) return true;
    return g.mode === 'fight' && g.target === p;
  }

  // ================================================================== spawning
  /** Spawn one set member. role: 'hang' | 'patrol' | 'fighter' | 'og'. Missions may call this. */
  spawnMember({ setId, x, z, role = 'hang', heading = 0, group = null } = {}) {
    const game = this.game;
    const set = setById(setId) || SETS[0];
    const district = game.layout.districtAt(x, z)?.id || 'north';
    const look = gangLook(set, role, district);
    // each set's OG is a known face: the same man who pages the player (data/missions.js OGS)
    const ogName = role === 'og' ? OGS[set.id]?.name : null;
    if (ogName) look.female = false;
    const a = createNpc(game, {
      kind: 'gang',
      faction: set.id,
      side: set.side,
      look,
      x,
      z,
      heading,
      system: 'gangs',
      name: ogName || gangName(role, look.female),
      maxHealth: role === 'og' ? 130 : role === 'fighter' ? 115 : 100,
    });
    const b = a.brain;
    b.role = role;
    b.set = set;
    b.rel = this.relation(set.id);
    b.state = 'hang';
    b.slot = { x, z, h: heading, anim: 'idle' };
    b.animT = Math.random() * 4;
    b.signT = 12 + Math.random() * 30;
    b.hits = 0;
    b.hitAt = -1e9;
    b.walker = null;
    this.members.push(a);
    if (!group) {
      // external spawn (missions, debug): give it a small group so it behaves
      group = this._externalGroup(set, x, z, role);
      b.external = true;
    }
    group.members.push(a);
    b.group = group;
    if (role === 'patrol' || group.kind === 'patrol') {
      b.state = 'walk';
      if (group.members.length === 1) {
        b.walker = new Walker(this.graph);
        b.walker.zone = group.zoneRect || null;
        b.walker.crossChance = 0.3;
        b.walker.resume(x, z);
      }
    } else if (group.kind === 'hunt' || group.kind === 'beef') {
      b.state = 'invade';
      b.arrived = group.kind === 'hunt'; // mission crews hold their spot
    }
    this._addPrompt(a);
    return a;
  }

  _externalGroup(set, x, z, role) {
    for (const g of this.groups) {
      if (g.external && g.setId === set.id && g.role === role && Math.hypot(g.cx - x, g.cz - z) < 8) return g;
    }
    const kind = role === 'patrol' ? 'patrol' : role === 'fighter' && this.relation(set.id) === 'rival' ? 'hunt' : 'hang';
    const g = this._newGroup(set, null, x, z, 0, kind);
    g.external = true;
    g.role = role;
    return g;
  }

  _newGroup(set, spot, cx, cz, face, kind = 'hang') {
    const g = {
      id: groupIds++,
      kind, // 'hang' | 'patrol' | 'beef' | 'hunt'
      spot,
      setId: set.id,
      set,
      rel: this.relation(set.id),
      members: [],
      cx,
      cz,
      face,
      mode: kind === 'beef' || kind === 'hunt' ? 'invade' : 'hang', // 'hang' | 'fight' | 'invade'
      alert: 'none', // 'none' | 'warned'
      alertT: 0,
      warned: false,
      warnedAt: -1e9,
      greetCd: 0,
      thinkT: Math.random() * 0.25,
      target: null,
      boombox: null,
      lostT: 0,
      external: false,
      zoneRect: null,
    };
    this.groups.push(g);
    return g;
  }

  _buildSpots() {
    const game = this.game;
    const L = game.layout;
    const col = game.collision;
    const seen = new Set();
    const add = (s) => {
      const zone = L.zoneAt(s.x, s.z);
      if (!zone || zone.noTurf) return;
      if (!col.isFree(s.x, s.z, 0.6, 0.3, 1.8) || L.isRoad(s.x, s.z) || L.isWater(s.x, s.z)) return;
      const key = `${Math.round(s.x / 6)},${Math.round(s.z / 6)}`;
      if (seen.has(key)) return;
      seen.add(key);
      s.zoneId = zone.id;
      s.roll = Math.random();
      s.group = null;
      s.cool = 0;
      this.spots.push(s);
    };
    for (const poi of game.city?.pois || []) {
      if (poi.type === 'hood') {
        const setId = String(poi.id || '').replace(/^hood-/, '');
        add({ id: `spot-${poi.id}`, type: 'hood', x: poi.x, z: poi.z, heading: poi.heading || 0, hoodSet: setById(setId) ? setId : null, size: [4, 6] });
      } else if (poi.type === 'hangout') {
        // housing-project courtyards (landmarks): open ground, bigger crews
        add({ id: `spot-${poi.id}`, type: 'park', x: poi.x, z: poi.z, heading: poi.heading || 0, size: [4, 6] });
      } else if (SPOT_POI[poi.type]) {
        add({ id: `spot-${poi.id}`, type: 'store', x: poi.x, z: poi.z, heading: poi.heading || 0, size: [3, 4] });
      }
    }
    // hood spots from set data too, in case the city has no hood POI for a set
    for (const s of SETS) {
      if (!this.spots.some((q) => q.type === 'hood' && q.hoodSet === s.id)) {
        add({ id: `spot-hood-${s.id}`, type: 'hood', x: s.hood.x, z: s.hood.z, heading: (s.hood.heading || 0) + Math.PI, hoodSet: s.id, size: [4, 6] });
      }
    }
    // street corners (a deterministic subset of intersections inside turf)
    for (const n of L.nodes) {
      const h = hash('corner', n.id);
      if (h % 3 !== 0) continue;
      const c = this.graph.corners[n.id * 4 + ((h >>> 4) % 4)];
      if (!c || c.blocked) continue;
      // face away from the intersection: the group stands with its back to the buildings
      add({ id: `spot-c${n.id}`, type: 'corner', x: c.x, z: c.z, heading: headingTo(c.x - n.x, c.z - n.z), size: [3, 5] });
    }
    // parks
    for (const p of L.parks) {
      const r = p.rect;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      add({ id: `spot-p${p.id}`, type: 'park', x: cx, z: cz, heading: 0, size: [4, 6] });
      add({ id: `spot-p${p.id}-w`, type: 'park', x: r.x0 + 8, z: cz, heading: -Math.PI / 2, size: [3, 5] });
      add({ id: `spot-p${p.id}-e`, type: 'park', x: r.x1 - 8, z: cz, heading: Math.PI / 2, size: [3, 5] });
    }
  }

  /** Spawn a hangout group at a spot for its zone's owner. */
  _spawnGroup(spot, set, size) {
    const game = this.game;
    const col = game.collision;
    // spot.heading faces the building (POI convention): the group faces the street
    const face = spot.heading + Math.PI;
    const f = forward(spot.heading, this._f); // toward the building
    const r = right(spot.heading, this._r);
    let cx = spot.x;
    let cz = spot.z;
    if (spot.type === 'hood') {
      // keep the spawn point itself clear (the player respawns at the hood), but stay on the
      // sidewalk: try either side along the storefront before settling closer in
      const L = game.layout;
      for (const k of [5.6, -5.6, 4, -4, 2.6]) {
        const x = spot.x + r.x * k;
        const z = spot.z + r.z * k;
        let ok = !L.isRoad(x, z) && col.isFree(x, z, 0.5, 0.3, 1.8);
        for (let q = 0; ok && q < 4; q++) {
          const a = (q / 4) * Math.PI * 2;
          ok = !L.isRoad(x + Math.cos(a) * 1.0, z + Math.sin(a) * 1.0);
        }
        if (ok) {
          cx = x;
          cz = z;
          break;
        }
        if (k === 2.6) {
          cx = x;
          cz = z;
        }
      }
    }
    const g = this._newGroup(set, spot, cx, cz, face, 'hang');
    spot.group = g;
    // wall behind the group? (leaning spots)
    const wallD = spot.type === 'park' ? Infinity : col.raycast(cx, 1.0, cz, f.x, 0, f.z, 4.5);
    const wantBox = spot.type === 'hood' ? 0.8 : spot.type === 'park' ? 0.55 : 0.3;
    let boxX = cx;
    let boxZ = cz;
    if (Math.random() < wantBox) {
      g.boombox = makeBoombox();
      if (wallD < 4.5) {
        boxX = cx + f.x * (wallD - 0.4);
        boxZ = cz + f.z * (wallD - 0.4);
      }
      placeProp(g.boombox, boxX, boxZ, face);
      game.scene.add(g.boombox);
    }
    const base = Math.random() * Math.PI * 2;
    let leaners = 0;
    for (let i = 0; i < size; i++) {
      const role = spot.type === 'hood' && i === 0 ? 'og' : 'hang';
      let ang = base + (i / size) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      let rad = 1.35 + Math.random() * 0.45;
      let x = cx + Math.cos(ang) * rad;
      let z = cz + Math.sin(ang) * rad;
      let h = headingTo(cx - x, cz - z);
      let anim = Math.random() < 0.55 ? 'talk' : 'idle';
      // members on the building side lean on the wall instead
      const towardWall = (Math.cos(ang) * f.x + Math.sin(ang) * f.z) > 0.35;
      if (wallD < 4.5 && towardWall && leaners < 2) {
        leaners++;
        const along = (Math.cos(ang) * r.x + Math.sin(ang) * r.z) * 1.6;
        x = cx + f.x * (wallD - 0.42) + r.x * along;
        z = cz + f.z * (wallD - 0.42) + r.z * along;
        h = face;
        anim = 'lean';
      } else if (g.boombox && Math.random() < 0.4) {
        anim = 'dance';
        ang = Math.atan2(z - boxZ, x - boxX);
        rad = 1.1 + Math.random() * 0.5;
        x = boxX + Math.cos(ang) * rad;
        z = boxZ + Math.sin(ang) * rad;
        h = headingTo(boxX - x, boxZ - z);
      }
      if (!col.isFree(x, z, 0.35, 0.3, 1.8) || game.layout.isRoad(x, z)) {
        x = cx + Math.cos(ang) * 0.9;
        z = cz + Math.sin(ang) * 0.9;
        anim = anim === 'lean' ? 'idle' : anim;
      }
      const a = this.spawnMember({ setId: set.id, x, z, role, heading: h, group: g });
      a.brain.slot = { x, z, h, anim };
      setAnim(a, anim);
    }
    return g;
  }

  _spawnPatrol(zone, set, ctx) {
    const pt = this.graph.randomPoint(ctx.fx, ctx.fz, 50, 125, Math.random, (x, z) => {
      const zn = this.game.layout.zoneAt(x, z);
      return zn && zn.id === zone.id && (!ctx.inView(x, z, 2) || ctx.d2(x, z) > 80 * 80);
    });
    if (!pt) return null;
    const g = this._newGroup(set, null, pt.x, pt.z, 0, 'patrol');
    g.zoneRect = zone.rect;
    const lead = this.spawnMember({ setId: set.id, x: pt.x, z: pt.z, role: 'patrol', group: g });
    lead.brain.walker.placeOn(pt.link);
    lead.brain.walker.zone = zone.rect;
    const n = Math.random() < 0.35 ? 3 : 2;
    for (let i = 1; i < n; i++) this.spawnMember({ setId: set.id, x: pt.x + 0.8 * i, z: pt.z + 0.6, role: 'patrol', group: g });
    return g;
  }

  _addPrompt(a) {
    const game = this.game;
    if (!game.state || a.faction !== game.state.player.setId) return;
    const b = a.brain;
    b.prompt = game.interactions.add({
      position: () => a.position,
      radius: 2.2,
      label: () => (a.userData.homie ? `Send ${a.name} home` : 'Roll with me'),
      // homies only offer "send home" when you walk right up to one (they trail you at ~2 m)
      enabled: () =>
        a.state === 'active' &&
        !a.vehicle &&
        (a.userData.homie
          ? b.state !== 'fight' && distTo(a, game.player) < 1.45
          : !b.noRecruit && this.homies.length < MAX_HOMIES && b.role !== 'og' && b.state !== 'fight' && b.group?.mode !== 'fight'),
      priority: a.userData.homie ? -1 : 0,
      onInteract: () => (a.userData.homie ? this.dismiss(a) : this.recruit(a)),
    });
  }

  _removeMember(a) {
    const b = a.brain;
    b.prompt?.remove();
    b.prompt = null;
    let i = this.members.indexOf(a);
    if (i >= 0) this.members.splice(i, 1);
    i = this.homies.indexOf(a);
    if (i >= 0) this.homies.splice(i, 1);
    const g = b.group;
    if (g) {
      const j = g.members.indexOf(a);
      if (j >= 0) g.members.splice(j, 1);
      if (!g.members.length) this._removeGroup(g);
    }
    b.group = null;
    if (b.riding) this.game.scene.remove(a.root);
    if (a.state !== 'removed') a.remove();
  }

  _removeGroup(g) {
    const i = this.groups.indexOf(g);
    if (i >= 0) this.groups.splice(i, 1);
    if (g.boombox) {
      g.boombox.parent?.remove(g.boombox);
      g.boombox = null;
    }
    if (g.spot) {
      g.spot.group = null;
      g.spot.roll = Math.random();
      g.spot.cool = 25;
    }
    for (const a of [...g.members]) {
      a.brain.group = null;
      this._removeMember(a);
    }
    g.members.length = 0;
  }

  // ================================================================== frame
  update(dt) {
    const game = this.game;
    const ctx = npcContext(game);
    this._manageT -= dt;
    if (this._manageT <= 0 || ctx.jumped) {
      this._manageT = 1;
      this._manage(ctx, ctx.jumped || this._fresh);
      if (game.mode === 'play') this._fresh = false;
    }
    if (game.mode === 'play' && game.state) {
      this._regenT -= dt;
      if (this._regenT <= 0) {
        this._regenT = 10;
        this._regen();
      }
      this._beefTick(dt, ctx);
      for (const [a, until] of this._threats) if (until < game.time.elapsed || a.state === 'removed') this._threats.delete(a);
    }
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i];
      g.thinkT -= dt;
      if (g.thinkT <= 0) {
        g.thinkT = 0.25;
        this._groupThink(g, ctx);
      }
    }
    const ms = this.members;
    for (let i = ms.length - 1; i >= 0; i--) {
      const a = ms[i];
      if (a.state === 'removed' && !a.brain.riding) {
        this._removeMember(a);
        continue;
      }
      this._updateMember(a, dt, ctx);
    }
  }

  _budget() {
    const h = this.game.clock.hour;
    const tf = h >= 17 || h < 2 ? 1 : h >= 2 && h < 6 ? 0.55 : h < 11 ? 0.5 : 0.8;
    return Math.round((this.game.quality.maxGang || 14) * tf);
  }

  _manage(ctx, jumped = ctx.jumped) {
    const game = this.game;
    const L = game.layout;
    let count = 0;
    let patrols = 0;
    // retire far groups
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i];
      if (g.kind === 'patrol' && g.members[0]) {
        g.cx = g.members[0].position.x;
        g.cz = g.members[0].position.z;
      }
      const d2 = ctx.d2(g.cx, g.cz);
      const lim = g.external ? 260 : g.kind === 'beef' ? 300 : DEACTIVATE_R;
      if (d2 > lim * lim || (d2 > (lim - 40) ** 2 && !ctx.inView(g.cx, g.cz, 4) && g.mode !== 'fight')) {
        if (g.kind === 'beef' && this.beef && this.beef.group === g) continue;
        // a running job still needs its crew (recruits, raiders, the OG) even when the player is far
        const job = g.external && game.missions?.active?.id;
        if (job && g.members.some((a) => a.userData?.mission === job)) continue;
        this._removeGroup(g);
        continue;
      }
      if (!g.external && g.kind !== 'beef') count += g.members.length;
      if (g.kind === 'patrol') patrols++;
    }
    // members walking home (dismissed homies, beaten crews) disappear out of sight
    for (let i = this.members.length - 1; i >= 0; i--) {
      const a = this.members[i];
      if (a.brain.state !== 'leave') continue;
      const d2 = ctx.d2(a.position.x, a.position.z);
      if (d2 > 150 * 150 || (d2 > 70 * 70 && !ctx.inView(a.position.x, a.position.z)) || (a.state === 'ko' && a.koTime > 30 && !ctx.inView(a.position.x, a.position.z))) this._removeMember(a);
    }
    const budget = this._budget();
    // activate the nearest eligible hangout spots
    const cands = this._cands || (this._cands = []);
    cands.length = 0;
    for (const s of this.spots) {
      if (s.group) continue;
      if (s.cool > 0) {
        s.cool -= 1;
        continue;
      }
      const d2 = ctx.d2(s.x, s.z);
      if (d2 > ACTIVATE_R * ACTIVATE_R) continue;
      s._d2 = d2;
      cands.push(s);
    }
    cands.sort((a, b) => a._d2 - b._d2);
    for (const s of cands) {
      const owner = this.getZoneOwner(s.zoneId);
      if (!owner) continue;
      const set = setById(owner);
      if (!set) continue;
      const control = this.getControl(s.zoneId);
      const home = s.type === 'hood' && s.hoodSet === owner;
      const p = home ? 1 : Math.min(0.85, 0.18 + (control / 100) * 0.55);
      if (s.roll > p) continue;
      if (!jumped && s._d2 < 65 * 65 && ctx.inView(s.x, s.z, 4)) continue; // don't pop in under the camera
      let size = s.size[0] + Math.round((control / 100) * (s.size[1] - s.size[0]) * (0.6 + Math.random() * 0.6));
      size = Math.max(3, Math.min(6, size));
      if (count + size > budget) {
        size = budget - count;
        if (size < 3) break;
      }
      this._spawnGroup(s, set, size);
      count += size;
    }
    // sidewalk patrols in owned zones near the focus
    const maxPatrols = game.quality.detail >= 1 ? 2 : 1;
    if (patrols < maxPatrols && count + 2 <= budget && Math.random() < 0.5) {
      const zone = L.zoneAt(ctx.fx + (Math.random() - 0.5) * 160, ctx.fz + (Math.random() - 0.5) * 160);
      if (zone && !zone.noTurf) {
        const owner = this.getZoneOwner(zone.id);
        const set = owner && setById(owner);
        if (set && Math.random() < 0.3 + this.getControl(zone.id) / 200) this._spawnPatrol(zone, set, ctx);
      }
    }
  }

  _regen() {
    const st = this.game.state;
    for (const z of TURF_ZONES) {
      const t = st.turf[z.id];
      if (!t || !t.owner || z.noTurf || t.control >= 100) continue;
      t.control = Math.min(100, t.control + 0.8);
      const last = this._lastEmit.get(z.id) ?? t.control;
      if (Math.abs(t.control - last) >= 5 || t.control >= 100) {
        this._lastEmit.set(z.id, t.control);
        this.game.events.emit('turf:influence', { zoneId: z.id, owner: t.owner, control: t.control, prev: t.owner, setId: t.owner, amount: 0.8, reason: 'regen' });
      } else if (!this._lastEmit.has(z.id)) this._lastEmit.set(z.id, t.control);
    }
  }

  // ================================================================== group brain
  _groupThink(g, ctx) {
    const game = this.game;
    const player = game.player;
    g.greetCd -= 0.25;
    if (!g.members.length) return;
    if (g.kind === 'patrol' || g.kind === 'beef' || g.kind === 'hunt') {
      const lead = g.members[0];
      g.cx = lead.position.x;
      g.cz = lead.position.z;
    }
    if (!player || game.mode !== 'play') return;
    const pp = player.position;
    // closest active member
    let near = null;
    let nd = Infinity;
    for (const a of g.members) {
      if (a.state !== 'active') continue;
      const d = Math.hypot(a.position.x - pp.x, a.position.z - pp.z);
      if (d < nd) {
        nd = d;
        near = a;
      }
    }
    if (!near) {
      if (g.mode === 'fight') this._calmGroup(g, false);
      return;
    }
    const now = game.time.elapsed;
    const onFoot = !player.vehicle && player.state === 'active';
    const colors = !!game.state?.wearingColors;

    if (g.mode === 'fight') {
      // give up when the player is down, far away or gone in a car
      const t = g.target;
      const gone = !t || t.state !== 'active' || (t === player && (nd > 42 || (player.vehicle && nd > 18)));
      g.lostT = gone ? g.lostT + 0.25 : 0;
      if (t && t.state === 'ko' && t === player) {
        this._calmGroup(g, true);
      } else if (g.lostT > 5) {
        if (t === player && nd < 40) D.say(game, near, D.pick(D.RIVAL_LEAVE), { color: this._color(g), priority: 1.5, range: 40 });
        this._calmGroup(g, false);
      }
      return;
    }

    if (g.rel === 'rival') {
      if (g.kind === 'beef' || g.kind === 'hunt') {
        // a crew that came looking for trouble
        if (onFoot && nd < 24 && (colors || (near.aggro.get(player.id) || 0) > 0) && this._los(near, player)) {
          D.say(game, near, D.beefArrive(g.set), { color: this._color(g), priority: 2, range: 30 });
          this._engage(g, player);
          return;
        }
        this._crewVsLocals(g);
        return;
      }
      const zone = game.layout.zoneAt(pp.x, pp.z);
      const theirTurf = !!zone && this.getZoneOwner(zone.id) === g.setId;
      if (g.alert === 'none') {
        if (theirTurf && colors && onFoot && nd < 18 && this._los(near, player)) {
          if (g.warned && now - g.warnedAt < 90) {
            // they already told you once
            D.say(game, near, D.rivalAttack(g.set), { color: this._color(g), priority: 2 });
            this._engage(g, player);
            return;
          }
          g.alert = 'warned';
          g.alertT = 0;
          g.warned = true;
          g.warnedAt = now;
          const warner = g.members.find((m) => m.brain.role === 'og' && m.state === 'active') || near;
          g.warner = warner;
          D.say(game, warner, D.rivalWarn(g.set), { color: this._color(g), priority: 2, range: 24, speaker: `${warner.name} (${g.set.short})` });
          playOnce(warner, 'sign');
        }
      } else if (g.alert === 'warned') {
        g.alertT += 0.25;
        if (nd > 26 || !onFoot || !theirTurf) {
          g.alert = 'none';
          if (nd < 40) D.say(game, near, D.pick(D.RIVAL_LEAVE), { color: this._color(g), priority: 1.5, range: 40 });
        } else if (g.alertT > 6 || nd < 4.5) {
          D.say(game, near, D.rivalAttack(g.set), { color: this._color(g), priority: 2 });
          this._engage(g, player);
        } else if (g.alertT > 3 && g.alertT - 0.25 <= 3) {
          playOnce(g.members[Math.floor(Math.random() * g.members.length)], 'point');
        }
      }
    } else if (g.rel === 'own') {
      if (onFoot && nd < 5.5 && g.greetCd <= 0) {
        const og = near.brain.role === 'og';
        // cooldown only once the line actually made it past the subtitle throttle
        if (D.say(game, near, D.greetOwn(g.set.side, g.set, game.state.player.name || 'homie', og), { color: this._color(g), priority: 1.5, speaker: `${near.name} (${g.set.short})` })) {
          g.greetCd = 45;
          playOnce(near, Math.random() < 0.6 ? 'sign' : 'cheer');
        }
      }
      this._localsVsCrew(g);
    } else if (g.rel === 'ally') {
      if (onFoot && colors && nd < 5 && g.greetCd <= 0) {
        if (D.say(game, near, D.nodAlly(g.set.side), { color: this._color(g), speaker: `${near.name} (${g.set.short})` })) g.greetCd = 50;
      }
    }
  }

  _color(g) {
    return SIDES[g.set.side]?.light || '#ffffff';
  }

  _los(a, b) {
    return this.game.collision.lineOfSight(a.position.x, 1.6, a.position.z, b.position.x, 1.6, b.position.z);
  }

  /** Whole group goes after target. */
  _engage(g, target) {
    g.mode = 'fight';
    g.alert = 'none';
    g.target = target;
    g.lostT = 0;
    for (const a of g.members) {
      if (a.state !== 'active') continue;
      if (a.brain.state === 'fight' && a.brain.fight?.target && a.brain.fight.target.state === 'active') continue;
      startFight(a, target);
      a.brain.state = 'fight';
    }
    if (target === this.game.player) for (const a of g.members) this._threats.set(a, this.game.time.elapsed + 15);
  }

  _calmGroup(g, taunt = false) {
    g.mode = g.kind === 'beef' || g.kind === 'hunt' ? 'invade' : 'hang';
    g.target = null;
    g.alert = 'none';
    g.lostT = 0;
    for (const a of g.members) {
      if (a.brain.state === 'fight') {
        stopFight(a);
        a.brain.state = g.kind === 'patrol' ? 'walk' : g.kind === 'beef' || g.kind === 'hunt' ? 'invade' : 'return';
        if (a.brain.state === 'walk' && a.brain.walker) a.brain.walker.resume(a.position.x, a.position.z);
      }
      if (taunt && a.state === 'active') {
        playOnce(a, Math.random() < 0.5 ? 'sign' : 'cheer');
      }
    }
    if (taunt) {
      const a = g.members.find((m) => m.state === 'active');
      if (a) D.say(this.game, a, D.pick(D.RIVAL_WIN), { color: this._color(g), range: 30 });
    }
  }

  // own-set locals jump in when a rival crew is on their block
  _localsVsCrew(g) {
    const bf = this.beef;
    if (!bf || g.mode === 'fight' || g.kind === 'beef') return;
    for (const c of bf.group.members) {
      if (c.state !== 'active') continue;
      if (Math.hypot(c.position.x - g.cx, c.position.z - g.cz) < 20) {
        this._engage(g, c);
        return;
      }
    }
  }

  _crewVsLocals(g) {
    // crew members pick fights with own-set NPCs of the player's set nearby
    for (const a of g.members) {
      if (a.state !== 'active' || a.brain.state === 'fight') continue;
      let best = null;
      let bd = 18 * 18;
      for (const o of this.members) {
        if (o.state !== 'active' || o.brain.rel !== 'own' || o.userData.homie) continue;
        const d2 = (o.position.x - a.position.x) ** 2 + (o.position.z - a.position.z) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = o;
        }
      }
      if (best) {
        startFight(a, best);
        a.brain.state = 'fight';
        g.mode = 'fight';
        g.target = best;
      }
    }
  }

  // ================================================================== member brain
  _updateMember(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    if (b.riding) {
      this._ride(a);
      return;
    }
    const sc = stateChange(a);
    if (sc === 'ko') this._memberDown(a);
    else if (sc === 'revived') this._memberUp(a);
    const always = b.role === 'homie' || b.state === 'fight' || b.state === 'invade';
    const ldt = lodStep(ctx, a, dt, always);
    if (!ldt) return;
    if (a.state === 'ko') {
      lieStill(game, ctx, a, ldt);
      // Combat revives NPCs after 15–25 s; fall back if it doesn't
      if (a.koTime > 34) a.revive(0.5);
      // a homie left lying far behind heads home once he's back up
      else if (b.role === 'homie' && game.player && ctx.d2(a.position.x, a.position.z) > 90 * 90) this.dismiss(a, true);
      return;
    }
    if (a.aggro.size) for (const [k, v] of a.aggro) (v - ldt <= 0 ? a.aggro.delete(k) : a.aggro.set(k, v - ldt));
    if (b.role === 'homie') {
      this._updateHomie(a, ldt, ctx);
      return;
    }
    switch (b.state) {
      case 'hang':
        this._hang(a, ldt, ctx);
        break;
      case 'return': {
        const s = b.slot;
        const v = this._v;
        const d = seek(a, s.x, s.z, WALK * 1.2, v, 0.5);
        locomote(game, ctx, a, v.x, v.z, ldt);
        setAnim(a, 'walk');
        if (d < 0.4 || b.stuck > 3) {
          b.state = 'hang';
          b.stuck = 0;
          b.animT = 0;
        }
        break;
      }
      case 'fight': {
        const r = fightStep(game, ctx, a, ldt, FIGHT[b.role] || FIGHT.hang);
        const t = b.fight?.target;
        const g = b.group;
        const leash = g && g.kind === 'hang' ? Math.hypot(a.position.x - g.cx, a.position.z - g.cz) > 48 : false;
        if (r === 'lost' || leash || (r === 'car' && t && Math.abs(t.vehicle?.speed || 0) > 10)) {
          const next = leash ? null : this._nextTarget(a);
          if (next) startFight(a, next);
          else {
            stopFight(a);
            b.state = g?.kind === 'patrol' ? 'walk' : g?.kind === 'beef' || g?.kind === 'hunt' ? 'invade' : 'return';
            if (b.state === 'walk') {
              if (!b.walker && g && g.members[0] === a) b.walker = new Walker(this.graph);
              b.walker?.resume(a.position.x, a.position.z);
            }
          }
        }
        break;
      }
      case 'walk':
        this._patrolWalk(a, ldt, ctx);
        break;
      case 'invade':
        this._invade(a, ldt, ctx);
        break;
      case 'leave': {
        if (!b.walker) {
          b.walker = new Walker(this.graph);
          b.walker.resume(a.position.x, a.position.z);
        }
        const v = this._v;
        b.walker.update(game, a, WALK * 1.1, ldt, v);
        locomote(game, ctx, a, v.x, v.z, ldt);
        setAnim(a, a.speed > 0.3 ? 'walk' : 'idle');
        if (b.stuck > 1.5) {
          b.stuck = 0;
          b.walker.reroute(game);
        }
        break;
      }
      default:
        stand(game, ctx, a, ldt);
    }
  }

  _hang(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    const s = b.slot;
    const g = b.group;
    const v = this._v;
    const d = Math.hypot(s.x - a.position.x, s.z - a.position.z);
    if (d > 0.45) {
      seek(a, s.x, s.z, WALK, v, 0.4);
      locomote(game, ctx, a, v.x, v.z, dt);
      setAnim(a, 'walk');
      return;
    }
    const player = game.player;
    let face = s.h;
    let anim = b.curAnim || s.anim;
    if (g && g.alert === 'warned' && player) {
      // squared up, watching the player
      face = headingTo(player.position.x - a.position.x, player.position.z - a.position.z);
      anim = 'idle';
    } else {
      b.animT -= dt;
      if (b.animT <= 0) {
        b.animT = 5 + Math.random() * 9;
        if (s.anim === 'lean') anim = Math.random() < 0.8 ? 'lean' : 'talk';
        else if (s.anim === 'dance') anim = Math.random() < 0.75 ? 'dance' : 'idle';
        else anim = Math.random() < 0.6 ? 'talk' : g?.boombox && Math.random() < 0.25 ? 'dance' : 'idle';
        b.curAnim = anim;
      }
      if (anim === 'talk' && g && s.anim !== 'lean') face = headingTo(g.cx - a.position.x, g.cz - a.position.z);
      b.signT -= dt;
      if (b.signT <= 0) {
        b.signT = 18 + Math.random() * 35;
        playOnce(a, Math.random() < 0.55 ? 'sign' : Math.random() < 0.5 ? 'cheer' : 'point');
      }
    }
    stand(game, ctx, a, dt, face, 5);
    setAnim(a, anim);
  }

  _patrolWalk(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    const g = b.group;
    const v = this._v;
    const lead = g?.members[0];
    if (!lead || lead === a || lead.state !== 'active' || lead.brain.state !== 'walk') {
      if (!b.walker) {
        b.walker = new Walker(this.graph);
        b.walker.zone = g?.zoneRect || null;
        b.walker.crossChance = 0.3;
        b.walker.resume(a.position.x, a.position.z);
      }
      const r = b.walker.update(game, a, WALK * 1.05, dt, v);
      if (r === 'wait') stand(game, ctx, a, dt);
      else locomote(game, ctx, a, v.x, v.z, dt);
      if (b.stuck > 1.5) {
        b.stuck = 0;
        b.walker.reroute(game);
      }
    } else {
      // walk beside the leader
      const idx = g.members.indexOf(a);
      const r = right(lead.heading, this._r);
      const f = forward(lead.heading, this._f);
      const side = idx % 2 ? 1.1 : -1.1;
      const tx = lead.position.x + r.x * side - f.x * (idx > 1 ? 1.2 : 0.2);
      const tz = lead.position.z + r.z * side - f.z * (idx > 1 ? 1.2 : 0.2);
      const d = seek(a, tx, tz, d2speed(a, tx, tz), v, 0.6);
      locomote(game, ctx, a, v.x, v.z, dt, d < 0.8 ? lead.heading : null);
    }
    setAnim(a, a.speed > 3 ? 'run' : a.speed > 0.25 ? 'walk' : 'idle');
    // idle life: point at things, sign now and then
    b.signT -= dt;
    if (b.signT <= 0) {
      b.signT = 25 + Math.random() * 30;
      playOnce(a, 'point');
    }
  }

  _nextTarget(a) {
    const b = a.brain;
    const g = b.group;
    const p = a.position;
    // group target first
    if (g && g.target && g.target.state === 'active' && Math.hypot(g.target.position.x - p.x, g.target.position.z - p.z) < 25) return g.target;
    // whoever hit us recently
    let best = null;
    let bd = 16 * 16;
    for (const o of this.game.actors) {
      if (o === a || o.state !== 'active' || o.vehicle) continue;
      const hate = a.aggro.get(o.id) || 0;
      const enemy = hate > 0 || (o.kind === 'gang' && b.rel !== 'none' && this._enemies(a, o));
      if (!enemy) continue;
      if (o.kind === 'gang' && o.faction === a.faction && !o.userData.homie) continue;
      const d2 = (o.position.x - p.x) ** 2 + (o.position.z - p.z) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = o;
      }
    }
    return best;
  }

  /** NPC vs NPC hostility: beef crews vs the player's set (and homies). */
  _enemies(a, o) {
    const ga = a.brain.group;
    const go = o.brain?.group;
    if (ga && ga.kind === 'beef') return o.brain?.rel === 'own' || !!o.userData?.homie;
    if (go && go.kind === 'beef') return a.brain.rel === 'own';
    return false;
  }

  _memberDown(a) {
    const b = a.brain;
    const g = b.group;
    stopFight(a);
    if (g && g.kind === 'beef' && this.beef && this.beef.group === g) {
      if (g.members.every((m) => m.state !== 'active')) this._endBeef(true);
    }
  }

  _memberUp(a) {
    const b = a.brain;
    const g = b.group;
    const player = this.game.player;
    if (b.role === 'homie') {
      b.state = this.homieMode === 'wait' ? 'wait' : 'follow';
      return;
    }
    if (b.beaten || (g && g.kind === 'beef' && !this.beef)) {
      b.state = 'leave';
      b.walker = null;
      D.say(this.game, a, "Man... this ain't over.", { color: g ? this._color(g) : undefined, range: 20 });
      return;
    }
    if (g && g.mode === 'fight' && g.target && g.target.state === 'active') {
      startFight(a, g.target);
      b.state = 'fight';
      return;
    }
    if (player && (a.aggro.get(player.id) || 0) > 0 && b.rel === 'rival') {
      D.say(this.game, a, 'You got lucky, fool!', { color: g ? this._color(g) : undefined, range: 22 });
    }
    b.state = g?.kind === 'patrol' ? 'walk' : g?.kind === 'beef' || g?.kind === 'hunt' ? 'invade' : 'return';
    if (b.state === 'walk') {
      if (!b.walker) b.walker = new Walker(this.graph);
      b.walker.resume(a.position.x, a.position.z);
    }
  }

  // ================================================================== homies
  recruit(a) {
    const game = this.game;
    if (!a || a.kind !== 'gang' || a.state !== 'active' || a.userData.homie || !game.state) return false;
    if (a.faction !== game.state.player.setId) return false;
    if (this.homies.length >= MAX_HOMIES) {
      D.say(game, a, D.pick(D.HOMIE.full), { color: SIDES[a.side]?.light });
      return false;
    }
    const b = a.brain;
    const g = b.group;
    if (g) {
      const i = g.members.indexOf(a);
      if (i >= 0) g.members.splice(i, 1);
      if (!g.members.length) this._removeGroup(g);
    }
    b.group = null;
    b.role = 'homie';
    b.state = this.homies.length && this.homieMode === 'wait' ? 'wait' : 'follow';
    if (!this.homies.length) this.homieMode = 'follow';
    b.external = false;
    b.waitX = a.position.x;
    b.waitZ = a.position.z;
    a.userData.homie = true;
    a.maxHealth = Math.max(a.maxHealth, 110);
    a.heal(40);
    this.homies.push(a);
    D.say(game, a, D.HOMIE.recruit(a.side), { color: SIDES[a.side]?.light, priority: 2, speaker: `${a.name} (${b.set.short})` });
    playOnce(a, 'sign');
    game.hud?.toast?.(`${a.name.toUpperCase()} IS ROLLING WITH YOU`, { color: SIDES[a.side]?.light });
    game.events.emit('homie:recruit', { actor: a });
    return true;
  }

  dismiss(a, silent = false) {
    const i = this.homies.indexOf(a);
    if (i < 0) return false;
    this.homies.splice(i, 1);
    const b = a.brain;
    if (b.riding) this._unboard(a, this.game.player?.position || a.position, i);
    a.userData.homie = false;
    b.role = 'hang';
    b.state = 'leave';
    b.walker = null;
    stopFight(a);
    if (!silent) D.say(this.game, a, D.pick(D.HOMIE.dismiss), { color: SIDES[a.side]?.light, priority: 1.8 });
    this.game.events.emit('homie:dismiss', { actor: a });
    return true;
  }

  /** G: follow ↔ wait. */
  toggleHomies() {
    const game = this.game;
    if (!this.homies.length) {
      game.hud?.toast?.('NO HOMIES WITH YOU', { color: '#bbbbbb' });
      return;
    }
    this.homieMode = this.homieMode === 'follow' ? 'wait' : 'follow';
    for (const a of this.homies) {
      const b = a.brain;
      if (b.riding) continue;
      b.waitX = a.position.x;
      b.waitZ = a.position.z;
      if (b.state !== 'fight') b.state = this.homieMode;
    }
    const a = this.homies.find((h) => h.state === 'active' && !h.brain.riding) || this.homies[0];
    D.say(game, a, D.pick(this.homieMode === 'wait' ? D.HOMIE.wait : D.HOMIE.follow), { color: SIDES[a.side]?.light, priority: 2, range: 60 });
    game.hud?.toast?.(this.homieMode === 'wait' ? 'HOMIES: WAIT HERE' : 'HOMIES: FOLLOW ME', { color: SIDES[a.side]?.light });
  }

  _updateHomie(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    const player = game.player;
    if (!player) return;
    const pp = player.position;
    const dp = Math.hypot(a.position.x - pp.x, a.position.z - pp.z);
    // lost track of the player entirely (far away while waiting, or KO'd and left behind)
    if (dp > 420 || (a.state === 'ko' && dp > 90)) {
      this.dismiss(a, true);
      return;
    }
    b.threatT = (b.threatT || 0) - dt;
    if (b.threatT <= 0) {
      b.threatT = 0.25;
      const t = this._homieTarget(a, b.state === 'wait' ? a.position : pp, b.state === 'wait' ? 12 : 17);
      if (t && (b.state !== 'fight' || b.fight?.target !== t)) {
        if (b.state !== 'fight' && Math.random() < 0.5) D.say(game, a, D.pick(D.HOMIE.fight), { color: SIDES[a.side]?.light, range: 20 });
        startFight(a, t);
        b.state = 'fight';
      }
    }
    const v = this._v;
    if (b.state === 'fight') {
      const r = fightStep(game, ctx, a, dt, FIGHT.homie);
      const t = b.fight?.target;
      const far = t && Math.hypot(t.position.x - pp.x, t.position.z - pp.z) > 24;
      if (r === 'lost' || r === 'car' || far) {
        stopFight(a);
        b.state = this.homieMode;
      }
      return;
    }
    if (b.state === 'wait') {
      const d = seek(a, b.waitX, b.waitZ, WALK, v, 0.5);
      if (d > 0.5) {
        locomote(game, ctx, a, v.x, v.z, dt);
        setAnim(a, 'walk');
      } else {
        stand(game, ctx, a, dt, headingTo(pp.x - a.position.x, pp.z - a.position.z), 3);
        setAnim(a, dp < 12 ? 'idle' : 'lean');
      }
      return;
    }
    // follow in formation behind the player
    const idx = Math.max(0, this.homies.indexOf(a)) % FORMATION.length;
    const [sx, sb] = FORMATION[idx];
    const h = player.heading;
    const f = forward(h, this._f);
    const r = right(h, this._r);
    const tx = pp.x + r.x * sx - f.x * sb;
    const tz = pp.z + r.z * sx - f.z * sb;
    const d = Math.hypot(tx - a.position.x, tz - a.position.z);
    if (player.vehicle) {
      // left behind while the player drives off: hold the spot, catch up once they're on foot
      if (dp > 20) {
        stand(game, ctx, a, dt, headingTo(pp.x - a.position.x, pp.z - a.position.z), 3);
        setAnim(a, 'idle');
        return;
      }
    } else if (dp > 55 && !ctx.inView(a.position.x, a.position.z) && this._teleportNear(a, player)) return;
    let speed;
    if (d < 0.5) speed = 0;
    else if (d < 3) speed = Math.max(WALK, Math.min(4.2, (player.speed || 0) + 0.6));
    else if (d < 10) speed = RUN;
    else speed = SPRINT + 0.6;
    seek(a, tx, tz, speed, v, 0.8);
    locomote(game, ctx, a, v.x, v.z, dt, d < 0.8 ? h : null, 10);
    setAnim(a, a.speed > 3.6 ? 'run' : a.speed > 0.25 ? 'walk' : 'idle');
    if (b.stuck > 2.5 && dp > 12) {
      b.stuck = 0;
      if (!player.vehicle && !ctx.inView(a.position.x, a.position.z)) this._teleportNear(a, player);
    }
  }

  _teleportNear(a, player) {
    const col = this.game.collision;
    const f = forward(player.heading, this._f);
    const r = right(player.heading, this._r);
    const pp = player.position;
    for (const [sx, sb] of [[0, 4], [2, 3], [-2, 3], [0, 7], [3, 0], [-3, 0]]) {
      const x = pp.x + r.x * sx - f.x * sb;
      const z = pp.z + r.z * sx - f.z * sb;
      if (col.isFree(x, z, 0.45, 0.3, 1.8)) {
        a.position.set(x, 0, z);
        a.faceHeading(player.heading);
        a.brain.stuck = 0;
        return true;
      }
    }
    return false;
  }

  /** Who should a homie fight: anyone fighting the player / a homie, recent attackers, beef. */
  _homieTarget(a, center, radius) {
    const player = this.game.player;
    const r2 = radius * radius;
    let best = null;
    let bd = Infinity;
    const consider = (o) => {
      if (!o || o === a || o.state !== 'active' || o.vehicle || o.userData?.homie || o === player) return;
      if (o.kind === 'cop') return; // homies don't swing on the police
      if (o.kind === 'gang' && o.faction === a.faction) return;
      const cx = o.position.x - center.x;
      const cz = o.position.z - center.z;
      if (cx * cx + cz * cz > r2) return;
      const d2 = (o.position.x - a.position.x) ** 2 + (o.position.z - a.position.z) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = o;
      }
    };
    for (const [o] of this._threats) consider(o);
    for (const o of this.members) {
      if (o.state !== 'active' || o.userData.homie) continue;
      const ft = o.brain.state === 'fight' ? o.brain.fight?.target : null;
      if (ft && (ft === player || ft.userData?.homie)) consider(o);
      else if (o.brain.group?.kind === 'beef' && o.brain.rel === 'rival') consider(o);
    }
    return best;
  }

  _onEnterVehicle({ vehicle }) {
    if (!vehicle) return;
    let seat = 0;
    for (const a of this.homies) {
      const b = a.brain;
      if (a.state !== 'active' || b.state === 'wait' || b.riding) continue;
      const d = Math.hypot(a.position.x - vehicle.position.x, a.position.z - vehicle.position.z);
      if (d > 35) continue;
      // hop in (hidden passenger); pulled out of the actor list so nothing collides with them
      stopFight(a);
      b.riding = vehicle;
      b.seat = seat++;
      b.state = 'follow';
      a.vehicle = vehicle;
      this.game.removeActor(a);
    }
    const rider = this.homies.find((h) => h.brain.riding);
    if (rider && Math.random() < 0.5) D.say(this.game, null, D.pick(D.HOMIE.car), { color: SIDES[rider.side]?.light, speaker: rider.name, priority: 1 });
  }

  _onExitVehicle({ vehicle }) {
    let i = 0;
    for (const a of this.homies) {
      if (!a.brain.riding) continue;
      this._unboard(a, vehicle?.position || this.game.player.position, i++, vehicle);
    }
  }

  _unboard(a, at, i, vehicle = a.brain.riding) {
    const b = a.brain;
    const col = this.game.collision;
    let x = at.x;
    let z = at.z;
    if (vehicle && vehicle.heading !== undefined) {
      const f = forward(vehicle.heading, this._f);
      const r = right(vehicle.heading, this._r);
      const w = (vehicle.width || 1.9) / 2 + 0.9;
      const spots = [[w, 1.1], [w, -1.1], [-w, -1.1], [-w, 1.1], [0, (vehicle.length || 4.8) / 2 + 1]];
      for (let k = 0; k < spots.length; k++) {
        const [sr, sf] = spots[(i + k) % spots.length];
        const px = vehicle.position.x + r.x * sr + f.x * sf;
        const pz = vehicle.position.z + r.z * sr + f.z * sf;
        if (col.isFree(px, pz, 0.4, 0.3, 1.8)) {
          x = px;
          z = pz;
          break;
        }
      }
    }
    a.position.set(x, 0, z);
    a.vehicle = null;
    b.riding = null;
    this.game.addActor(a);
    a.character.setVisible(true);
    b.visible = true;
  }

  _ride(a) {
    const v = a.brain.riding;
    const p = this.game.player;
    if (!p || !p.vehicle || p.vehicle !== v || !this.game.vehicles.includes(v)) {
      this._unboard(a, (p || a).position, this.homies.indexOf(a), p?.vehicle ? null : v);
      return;
    }
    a.position.x = v.position.x;
    a.position.z = v.position.z;
  }

  // ================================================================== beef (rival crew rolls in)
  _beefTick(dt) {
    if (this.beef) {
      this._updateBeef(dt);
      return;
    }
    this._beefT -= dt;
    if (this._beefT > 0) return;
    this._beefT = 150 + Math.random() * 200;
    this._startBeef(false);
  }

  _startBeef(force) {
    const game = this.game;
    const st = game.state;
    const player = game.player;
    if (!st || !player || this.beef) return false;
    if (!force && ((game.police?.heat || 0) >= 2 || game.missions?.active)) return false;
    const ps = st.player.setId;
    const pp = player.position;
    // the player's zone nearest to them (within reach)
    let zone = null;
    let zd = force ? Infinity : 160;
    for (const z of TURF_ZONES) {
      if (z.noTurf || !z.rect || this.getZoneOwner(z.id) !== ps) continue;
      const r = z.rect;
      const dx = Math.max(r.x0 - pp.x, 0, pp.x - r.x1);
      const dz = Math.max(r.z0 - pp.z, 0, pp.z - r.z1);
      const d = Math.hypot(dx, dz);
      if (d < zd) {
        zd = d;
        zone = z;
      }
    }
    if (!zone) return false;
    // a rival set, preferably one whose turf borders this zone
    const rivals = SETS.filter((s) => s.side !== sideOfSet(ps));
    const bordering = rivals.filter((s) => TURF_ZONES.some((z) => z.rect && this.getZoneOwner(z.id) === s.id && touches(z.rect, zone.rect)));
    const pool = bordering.length ? bordering : rivals;
    const set = pool[Math.floor(Math.random() * pool.length)];
    // where they show up: a sidewalk in the zone, out of sight, not too far from the player
    const ctx = npcContext(game);
    const inZone = (x, z) => x >= zone.rect.x0 && x <= zone.rect.x1 && z >= zone.rect.z0 && z <= zone.rect.z1;
    let pt = this.graph.randomPoint(pp.x, pp.z, 55, 115, Math.random, (x, z) => inZone(x, z) && !ctx.inView(x, z, 3), 60);
    if (!pt) pt = this.graph.randomPoint(pp.x, pp.z, 35, 140, Math.random, inZone, 60);
    if (!pt) return false;
    const g = this._newGroup(set, null, pt.x, pt.z, 0, 'beef');
    const n = 3 + (Math.random() < 0.5 ? 1 : 0) + (this.getControl(zone.id) < 50 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = this.spawnMember({ setId: set.id, x: pt.x + (i % 2) * 1.1, z: pt.z + Math.floor(i / 2) * 1.1, role: 'fighter', group: g });
      a.brain.state = 'invade';
    }
    // head for the heart of the zone: the player's hood spot there, or the zone center
    const hood = this.spots.find((s) => s.type === 'hood' && s.hoodSet === ps && s.zoneId === zone.id);
    const dest = hood || { x: (zone.rect.x0 + zone.rect.x1) / 2, z: (zone.rect.z0 + zone.rect.z1) / 2 };
    const from = this.graph.nearestCorner(pt.x, pt.z);
    const to = this.graph.nearestCorner(dest.x, dest.z);
    const lead = g.members[0];
    lead.brain.walker = new Walker(this.graph);
    const path = from && to ? this.graph.path(from.id, to.id) : null;
    if (path) lead.brain.walker.followPath(path);
    else lead.brain.walker.resume(pt.x, pt.z);
    g.destX = dest.x;
    g.destZ = dest.z;
    this.beef = { group: g, zoneId: zone.id, setId: set.id, t: 0, markT: 0 };
    const mySet = setById(ps);
    const street = (game.layout.describe(pt.x, pt.z).street || zone.name).replace(/^near /, '');
    game.events.emit('pager', { from: OGS[ps]?.name || this.ogName, text: `911 ${set.short} ROLLIN THRU ${zone.name.toUpperCase()} BY ${street.toUpperCase()}. HANDLE IT` });
    this._markBeef();
    return true;
  }

  _markBeef() {
    const bf = this.beef;
    const hud = this.game.hud;
    if (!bf || !hud?.addMarker) return;
    let x = 0;
    let z = 0;
    let n = 0;
    for (const a of bf.group.members) {
      if (a.state !== 'active') continue;
      x += a.position.x;
      z += a.position.z;
      n++;
    }
    if (!n) return;
    hud.removeMarker?.('beef');
    hud.addMarker({ id: 'beef', x: x / n, z: z / n, type: 'target', color: SIDES[bf.group.set.side]?.color, label: `${bf.group.set.short} crew` });
  }

  _updateBeef(dt) {
    const bf = this.beef;
    bf.t += dt;
    bf.markT -= dt;
    if (bf.markT <= 0) {
      bf.markT = 2;
      this._markBeef();
    }
    const g = bf.group;
    if (!g.members.length || !this.groups.includes(g)) {
      this._endBeef(false, true);
      return;
    }
    if (bf.t > 220) this._endBeef(false);
  }

  _endBeef(won, silent = false) {
    const bf = this.beef;
    if (!bf) return;
    this.beef = null;
    const game = this.game;
    game.hud?.removeMarker?.('beef');
    const g = bf.group;
    const ps = game.state?.player?.setId;
    if (won) {
      game.hud?.toast?.('BEEF SQUASHED', { color: SIDES[sideOfSet(ps)]?.light });
      if (ps) this.addInfluence(bf.zoneId, ps, 8);
      for (const a of g.members) a.brain.beaten = true;
    } else if (!silent) {
      // they held the block and left their mark
      if (g.members.some((a) => a.state === 'active')) this.addInfluence(bf.zoneId, bf.setId, 6);
    }
    game.events.emit('beef:end', { zoneId: bf.zoneId, setId: bf.setId, won });
    g.kind = 'hang';
    g.mode = 'hang';
    for (const a of g.members) {
      if (a.state === 'active') {
        stopFight(a);
        a.brain.state = 'leave';
        a.brain.walker = null;
      } else a.brain.beaten = true;
    }
  }

  /**
   * A mission's rival crew ('hunt' group) outlives the job: once it passes, fails or is dropped they
   * head home like a finished beef crew. Otherwise a crew sent to the player's hood (defend) keeps
   * jumping the player at the respawn point after every knockout.
   */
  _releaseMissionCrew(m) {
    const spawned = m?.data?.spawned;
    if (!Array.isArray(spawned) || !spawned.length) return;
    const groups = new Set();
    for (const a of spawned) {
      const g = a?.brain?.group;
      if (g && g.kind === 'hunt' && this.groups.includes(g)) groups.add(g);
    }
    for (const g of groups) {
      g.kind = 'hang';
      g.mode = 'hang';
      g.target = null;
      g.alert = 'none';
      for (const a of g.members) {
        if (a.state === 'active') {
          stopFight(a);
          a.brain.state = 'leave';
          a.brain.walker = null;
        } else a.brain.beaten = true;
      }
    }
  }

  _invade(a, dt, ctx) {
    const game = this.game;
    const b = a.brain;
    const g = b.group;
    const v = this._v;
    const lead = g ? crewLead(g) : null;
    if (!lead) {
      b.state = 'leave';
      return;
    }
    if (lead === a) {
      if (!b.walker) {
        b.walker = new Walker(this.graph);
        b.walker.resume(a.position.x, a.position.z);
      }
      let r = 'walk';
      if (b.arrived) {
        // posted up on their block, waiting for someone to do something about it
        stand(game, ctx, a, dt, headingTo((g.destX ?? a.position.x) - a.position.x + 0.01, (g.destZ ?? a.position.z) - a.position.z));
        setAnim(a, 'idle');
        return;
      }
      r = b.walker.update(game, a, WALK * 1.25, dt, v);
      if (r === 'arrive') b.arrived = true;
      locomote(game, ctx, a, v.x, v.z, dt);
      setAnim(a, a.speed > 0.25 ? 'walk' : 'idle');
      if (b.stuck > 1.5) {
        b.stuck = 0;
        b.walker.resume(a.position.x, a.position.z);
      }
      return;
    }
    const idx = g.members.indexOf(a);
    const r = right(lead.heading, this._r);
    const f = forward(lead.heading, this._f);
    const side = idx % 2 ? 1.2 : -1.2;
    const back = 1 + Math.floor(idx / 2) * 1.3;
    const tx = lead.position.x + r.x * side - f.x * back;
    const tz = lead.position.z + r.z * side - f.z * back;
    const d = seek(a, tx, tz, d2speed(a, tx, tz), v, 0.6);
    locomote(game, ctx, a, v.x, v.z, dt, d < 0.8 ? lead.heading : null);
    setAnim(a, a.speed > 3 ? 'run' : a.speed > 0.25 ? 'walk' : 'idle');
  }

  // ================================================================== events
  _onHit({ target, attacker }) {
    if (!target || !attacker) return;
    const game = this.game;
    const player = game.player;
    const now = game.time.elapsed;
    // anyone who hits the player or a homie becomes a target for the homies
    if ((target === player || target.userData?.homie) && attacker !== player && attacker.kind !== 'cop') {
      this._threats.set(attacker, now + 10);
    }
    if (target.system !== 'gangs' || target.state === 'removed') return;
    const b = target.brain;
    const g = b.group;
    if (attacker === player) {
      if (target.userData.homie) {
        D.say(game, target, D.pick(D.HOMIE.hit), { color: SIDES[target.side]?.light, priority: 1.5 });
        return;
      }
      if (b.rel === 'own') {
        b.hits = now - b.hitAt < 10 ? b.hits + 1 : 1;
        b.hitAt = now;
        if (b.hits >= 2 && target.state === 'active') {
          startFight(target, player);
          b.state = 'fight';
        } else D.say(game, target, D.ownHit(target.side), { color: SIDES[target.side]?.light, priority: 1.8 });
        return;
      }
      if (g && g.mode !== 'fight') {
        D.say(game, target, b.rel === 'ally' ? D.allyHit() : D.rivalAttack(b.set), { color: SIDES[target.side]?.light, priority: 2 });
        this._engage(g, player);
      } else if (target.state === 'active' && b.state !== 'fight') {
        startFight(target, player);
        b.state = 'fight';
      }
      return;
    }
    if (attacker.kind === 'cop') return;
    // NPC attacker: fight back (and bring the group) unless it's one of our own by accident
    if (attacker.kind === 'gang' && attacker.faction === target.faction && !attacker.userData.homie) return;
    if (target.userData.homie && attacker.userData?.homie) return;
    if (target.state === 'active' && b.state !== 'fight' && b.role !== 'homie') {
      if (g && g.mode !== 'fight') this._engage(g, attacker);
      else {
        startFight(target, attacker);
        b.state = 'fight';
      }
    }
  }

  _onKo({ target, attacker }) {
    const game = this.game;
    const st = game.state;
    if (!st || !target) return;
    const ps = st.player.setId;
    const player = game.player;
    const zone = game.layout.zoneAt(target.position.x, target.position.z);
    if (!zone || zone.noTurf) return;
    if (target.kind === 'gang' && attacker && (attacker === player || attacker.userData?.homie)) {
      // knocking out rivals swings the block your way
      if (this.relation(target.faction) === 'rival') this.addInfluence(zone.id, ps, 3);
    } else if (target === player && attacker && attacker.kind === 'gang' && this.relation(attacker.faction) === 'rival') {
      this.addInfluence(zone.id, attacker.faction, 3);
    } else if (target.kind === 'gang' && target.brain?.rel === 'own' && attacker?.kind === 'gang' && this.relation(attacker.faction) === 'rival') {
      this.addInfluence(zone.id, attacker.faction, 1.5);
    }
  }

  _onSign() {
    const game = this.game;
    const player = game.player;
    if (!player || player.vehicle) return;
    const pp = player.position;
    const zone = game.layout.zoneAt(pp.x, pp.z);
    const owner = zone ? this.getZoneOwner(zone.id) : null;
    for (const g of this.groups) {
      if (g.mode === 'fight') continue;
      const d = Math.hypot(g.cx - pp.x, g.cz - pp.z);
      if (d > 25) continue;
      const near = g.members.find((m) => m.state === 'active');
      if (!near) continue;
      if (g.rel === 'rival' && (owner === g.setId || g.alert === 'warned' || g.kind === 'beef' || g.kind === 'hunt')) {
        D.say(game, near, D.rivalSignReply(), { color: this._color(g), priority: 2.5, range: 30 });
        this._engage(g, player);
      } else if (g.rel === 'own' && d < 18) {
        // throw it right back
        for (const m of g.members) if (m.state === 'active' && Math.random() < 0.7) playOnce(m, 'sign');
        D.say(game, near, `${g.set.short}! ${g.set.side === 'bloods' ? "What's poppin'!" : "What's crackin'!"}`, { color: this._color(g), range: 20 });
      } else if (g.rel === 'ally' && d < 12 && game.state?.wearingColors) {
        playOnce(near, 'sign');
      }
    }
    for (const h of this.homies) if (h.state === 'active' && !h.brain.riding) playOnce(h, 'sign');
  }

  _onRunOver({ vehicle, actor }) {
    const player = this.game.player;
    if (!actor || actor.system !== 'gangs' || !vehicle || vehicle.driver !== player || actor.userData.homie) return;
    const g = actor.brain.group;
    if (g && g.rel !== 'own' && g.mode !== 'fight') this._engage(g, player);
  }
}

// ------------------------------------------------------------------ helpers
/** First standing crew member still on the move (the one who walks the path). */
function crewLead(g) {
  const ms = g.members;
  for (let i = 0; i < ms.length; i++) if (ms[i].state === 'active' && ms[i].brain.state === 'invade') return ms[i];
  return null;
}

function distTo(a, b) {
  return b ? Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) : Infinity;
}

function touches(a, b) {
  return a.x0 <= b.x1 + 1 && a.x1 >= b.x0 - 1 && a.z0 <= b.z1 + 1 && a.z1 >= b.z0 - 1;
}

/** Catch-up speed toward a formation slot. */
function d2speed(a, tx, tz) {
  const d = Math.hypot(tx - a.position.x, tz - a.position.z);
  return d < 1.5 ? WALK : d < 6 ? WALK * 2.2 : RUN;
}
