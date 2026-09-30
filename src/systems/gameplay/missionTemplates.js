// Mission templates: the logic behind every job. Each template picks live targets from the world
// when a mission starts (tag spots, zones, POIs, parked cars, gang members) and drives the
// objective until it passes or fails. Missions.js provides the helpers (M.*):
//
//   M.mark(m, key, { x, z | follow, kind, type, label, color, radius, yOffset })  / M.unmark(m, key)
//   M.objective(m, text)   M.pass(m)   M.fail(m, reason)   M.say(speaker, text)
//   M.poi(type, opts) / M.pois(type)   M.spawn(setId, x, z, role)   M.pickZone(kind)
//   M.addInteraction(m, def)   M.later(seconds, fn)
//
// Template hooks: setup(M, m, params) → bool, begin(M, m), update(M, m, dt),
//                 event(M, m, name, payload), skip(M, m) (debug), cleanup(M, m)
import { SIDES, setById, zoneById, areRivals } from '../../data/sets.js';
import { HOMIE_NAMES, DELIVERY_ITEMS } from '../../data/missions.js';
import { Vehicle } from '../../entities/Vehicle.js';

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const timeText = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function playerPos(M) {
  return M.game.focus;
}

/** Is the player (in a car, slow) or (on foot) within r of p? */
function arrived(M, p, rFoot = 3.5, rCar = 8) {
  const pl = M.game.player;
  if (!pl) return false;
  if (pl.vehicle) return d2(pl.vehicle.position, p) < rCar && Math.abs(pl.vehicle.speed || 0) < 4;
  return d2(pl.position, p) < rFoot;
}

/** Was this KO the player's (or a homie's) doing? */
function byPlayerSide(M, attacker) {
  if (!attacker) return false;
  if (attacker === M.game.player || attacker.kind === 'player') return true;
  return !!M.game.gangs?.homies?.includes?.(attacker);
}

/** Count KOs of rival members: listens to both fight:won and actor:ko (deduped by actor id). */
function countKo(M, m, name, payload, accept) {
  const t = payload?.target;
  if (!t || t.kind !== 'gang') return false;
  if (name === 'actor:ko' && !byPlayerSide(M, payload.attacker)) return false;
  if (name !== 'actor:ko' && name !== 'fight:won') return false;
  if (!accept(t)) return false;
  if (m.data.ko.has(t.id)) return false;
  m.data.ko.add(t.id);
  M.unmark(m, `foe:${t.id}`);
  return true;
}

/** Spawn n fighters of setId around p; returns the actors that really spawned. */
function spawnCrew(M, m, setId, p, n, role = 'fighter') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const r = 3 + Math.random() * 3;
    let x = p.x + Math.cos(a) * r;
    let z = p.z + Math.sin(a) * r;
    if (!M.game.collision.isFree(x, z, 0.5)) {
      x = p.x + (Math.random() - 0.5) * 2;
      z = p.z + (Math.random() - 0.5) * 2;
    }
    const actor = M.spawn(setId, x, z, role);
    if (actor) {
      actor.userData = actor.userData || {};
      actor.userData.mission = m.id;
      out.push(actor);
      m.data.spawned.push(actor);
    }
  }
  return out;
}

function markFoes(M, m, list, color) {
  for (const a of list) M.mark(m, `foe:${a.id}`, { follow: a, kind: 'arrow', type: 'target', color, yOffset: 2.3 });
}

function describeCar(v) {
  const models = { sedan: 'boxy four-door', coupe: 'two-door coupe', lowrider: 'lowrider', wagon: 'station wagon', pickup: 'pickup', hatch: 'hatchback', van: 'conversion van' };
  return `${colorName(v.color)} ${models[v.model] || 'ride'}`;
}

export function colorName(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#') return 'clean';
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (s < 0.18) return l > 0.78 ? 'white' : l > 0.45 ? 'silver' : l > 0.2 ? 'gray' : 'black';
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 340) return l < 0.3 ? 'maroon' : 'red';
  if (h < 40) return l < 0.35 ? 'brown' : 'orange';
  if (h < 65) return l < 0.4 ? 'gold' : 'yellow';
  if (h < 160) return l < 0.3 ? 'dark green' : 'green';
  if (h < 200) return 'teal';
  if (h < 255) return l < 0.3 ? 'navy' : 'blue';
  if (h < 290) return 'purple';
  return 'candy pink';
}

// ================================================================== templates

export const TEMPLATES = {
  // ---------------------------------------------------------------- story 1: meet the OG
  meet: {
    setup(M, m) {
      m.data.hood = M.hoodPoi();
      return !!m.data.hood;
    },
    begin(M, m) {
      const hood = m.data.hood;
      // the OG already posted up with the hood crew, else he walks up now
      const here = (M.game.gangs?.members || []).find(
        (a) => a.faction === M.setId && a.brain?.role === 'og' && a.state === 'active' && Math.hypot(a.position.x - hood.x, a.position.z - hood.z) < 16,
      );
      const og = here || M.spawn(M.setId, hood.x + 1.2, hood.z + 1.2, 'og');
      m.data.og = og;
      if (og) M.mark(m, 'og', { follow: og, kind: 'arrow', type: 'mission', label: M.ogName, yOffset: 2.4 });
      else M.mark(m, 'og', { x: hood.x, z: hood.z, type: 'mission', label: M.ogName, radius: 1.6 });
      M.objective(m, m.def.objective);
      M.addInteraction(m, {
        position: () => (og && og.alive ? og.position : hood),
        radius: 3,
        label: `Talk to ${M.ogName}`,
        priority: 5,
        onInteract: () => M.pass(m),
      });
    },
    update(M, m) {
      // the prompt is the objective; nudge the player when they are close
      const hood = m.data.hood;
      if (!m.data.near && M.game.player && d2(playerPos(M), hood) < 6) {
        m.data.near = true;
        M.objective(m, `Talk to ${M.ogName}`);
      }
    },
    skip(M, m) {
      M.pass(m);
    },
  },

  // ---------------------------------------------------------------- tag N walls in a zone
  tag_run: {
    setup(M, m, p) {
      const T = M.game.tagging;
      if (!T?.spots?.length) return false;
      const zoneId = M.pickZone(p.zone || 'rival');
      const hood = M.hoodPoi() || playerPos(M);
      const count = p.count || 3;
      let spots = [];
      if (p.buff && zoneId) {
        // the city buffed the set's walls nearest the hood
        spots = T.spotsInZone(zoneId).sort((a, b) => d2(a, hood) - d2(b, hood)).slice(0, count);
        for (const s of spots) if (s.owner === M.setId) T.setOwner(s.id, null);
      } else if (zoneId) {
        spots = T.spotsInZone(zoneId).filter((s) => s.owner !== M.setId);
      }
      if (!spots.length) {
        // no walls in that zone: the closest rival walls anywhere
        spots = T.spots.filter((s) => s.owner && areRivals(s.owner, M.setId));
      }
      if (!spots.length) return false;
      const from = playerPos(M);
      spots = spots.sort((a, b) => d2(a, from) - d2(b, from)).slice(0, count);
      m.data.targets = new Set(spots.map((s) => s.id));
      m.data.spots = spots;
      m.data.need = spots.length;
      m.data.done = 0;
      const zId = zoneId || spots[0].zoneId;
      m.tokens.zone = zoneById(zId)?.name || 'the zone';
      m.tokens.count = spots.length;
      if (!m.story) m.timer = p.timer || 240;
      return true;
    },
    begin(M, m) {
      const color = SIDES[M.side]?.color;
      for (const s of m.data.spots) {
        const st = M.game.tagging.standPoint(s);
        M.mark(m, `spot:${s.id}`, { x: st.x, z: st.z, type: 'target', color, radius: 1.2, height: 1.8, label: 'Wall' });
      }
      this.refresh(M, m);
    },
    refresh(M, m) {
      M.objective(m, `${m.def.objective} (${m.data.done}/${m.data.need})`);
    },
    event(M, m, name, payload) {
      if (name !== 'tag:complete' || !payload?.byPlayer) return;
      const id = payload.spot?.id;
      if (!m.data.targets.has(id)) return;
      m.data.targets.delete(id);
      M.unmark(m, `spot:${id}`);
      m.data.done++;
      if (m.data.done >= m.data.need) M.pass(m);
      else this.refresh(M, m);
    },
    skip(M, m) {
      const id = [...m.data.targets][0];
      if (id) M.game.tagging._finishTag(M.game.tagging.spotById(id));
    },
  },

  // ---------------------------------------------------------------- boost a car to a garage
  wheels: {
    setup(M, m, p) {
      const game = M.game;
      const from = playerPos(M);
      const want = p.models || ['coupe', 'lowrider', 'sedan', 'pickup', 'wagon', 'hatch'];
      const pool = (game.traffic?.parked?.length ? game.traffic.parked : game.vehicles) || [];
      const ok = (v) => v && !v.isPolice && !v.driver && v.model !== 'bus' && v !== game.player?.vehicle && game.vehicles.includes(v);
      let cands = pool.filter((v) => ok(v) && d2(v.position, from) > 30 && d2(v.position, from) < 450);
      const preferred = cands.filter((v) => want.includes(v.model));
      if (preferred.length) cands = preferred;
      let car = cands.sort((a, b) => d2(a.position, from) - d2(b.position, from))[Math.floor(Math.random() * Math.min(3, cands.length))];
      if (!car) car = M.spawnParkedCar(pick(want), from, 70, 220);
      if (!car) return false;
      const garage = M.poi('garage', { near: car.position, minDist: 80 }) || M.poi('garage', { near: car.position });
      if (!garage) return false;
      // claim it: Traffic must not recycle the target when the player drives away from it
      if (game.traffic?.parked?.includes(car)) game.traffic.release?.(car);
      m.data.car = car;
      m.data.garage = garage;
      m.tokens.target = describeCar(car);
      m.tokens.garage = garage.name || 'the body shop';
      m.tokens.street = game.layout.describe(car.position.x, car.position.z).street || 'the block';
      return true;
    },
    begin(M, m) {
      this.toCar(M, m);
    },
    toCar(M, m) {
      m.stage = 0;
      M.unmark(m, 'garage');
      M.mark(m, 'car', { follow: m.data.car, kind: 'arrow', type: 'target', label: m.tokens.target, yOffset: 2.8 });
      M.objective(m, m.data.boosted ? `Get back in the ${m.tokens.target}` : m.def.objective);
    },
    toGarage(M, m) {
      m.stage = 1;
      M.unmark(m, 'car');
      const g = m.data.garage;
      M.mark(m, 'garage', { x: g.x, z: g.z, type: 'mission', label: m.tokens.garage, radius: 4 });
      M.objective(m, `Take the ${m.tokens.target} to ${m.tokens.garage}`);
    },
    update(M, m) {
      const game = M.game;
      const car = m.data.car;
      const player = game.player;
      if (!game.vehicles.includes(car)) return M.fail(m, 'The car is gone');
      if ((car.health ?? 100) <= 0) return M.fail(m, 'The car got wrecked');
      if (m.stage === 0 && player?.vehicle === car) {
        if (!m.data.boosted) {
          m.data.boosted = true;
          game.traffic?.release?.(car);
          if (Math.random() < 0.3) {
            game.hud?.toast?.('Car alarm!', { color: '#d4202c' });
            game.police?.reportCrime?.('vandalism', { x: car.position.x, z: car.position.z, severity: 1 });
          }
        }
        this.toGarage(M, m);
      } else if (m.stage === 1) {
        if (player?.vehicle !== car) {
          if (!player?.vehicle && d2(player.position, car.position) > 12) this.toCar(M, m);
          return;
        }
        if (d2(car.position, m.data.garage) < 7 && Math.abs(car.speed || 0) < 3) this.deliver(M, m);
      }
    },
    deliver(M, m) {
      const game = M.game;
      const car = m.data.car;
      if (game.player?.vehicle === car) game.player.exitVehicle?.(true);
      game.traffic?.release?.(car);
      if (game.vehicles.includes(car)) game.removeVehicle(car);
      m.data.delivered = true;
      M.pass(m);
    },
    skip(M, m) {
      const game = M.game;
      const car = m.data.car;
      if (m.stage === 0) {
        const p = car.getExitPoint?.() || car.position;
        game.debugApi?.teleport?.(p.x, p.z);
        game.player.enterVehicle?.(car);
      } else {
        car.position.set(m.data.garage.x, 0, m.data.garage.z);
        car.speed = 0;
        this.deliver(M, m);
      }
    },
    cleanup(M, m) {
      const car = m.data.car;
      const game = M.game;
      if (!car || m.data.delivered || game.player?.vehicle === car || !game.vehicles.includes(car)) return;
      // our own spawn, or a car Traffic released to us: clean it up once it's out of sight
      const ours = m.data.ownCar || !!game.traffic?.release;
      const far = Math.hypot(car.position.x - game.focus.x, car.position.z - game.focus.z) > 50;
      if (ours && (far || m.data.ownCar)) game.removeVehicle(car);
    },
  },

  // ---------------------------------------------------------------- KO rivals in their zone, get out
  beef: {
    setup(M, m, p) {
      const zoneId = M.pickZone(p.zone || 'rival');
      if (!zoneId) return false;
      const owner = M.game.gangs?.getZoneOwner?.(zoneId) ?? zoneById(zoneId)?.owner;
      const rival = owner && areRivals(owner, M.setId) ? setById(owner) : M.rival;
      const pt = M.pointInZone(zoneId, rival?.id);
      if (!pt) return false;
      m.data.zoneId = zoneId;
      m.data.rival = rival;
      m.data.pt = pt;
      m.data.need = p.count || 3;
      m.data.ko = new Set();
      m.data.spawned = [];
      m.tokens.zone = zoneById(zoneId).name;
      m.tokens.rivalShort = rival.short;
      m.tokens.rival = rival.name;
      return true;
    },
    begin(M, m) {
      m.stage = 0;
      M.mark(m, 'spot', { x: m.data.pt.x, z: m.data.pt.z, type: 'mission', label: m.tokens.zone, radius: 3.5 });
      M.objective(m, m.def.objective);
    },
    accept(M, m, t) {
      if (t.faction === m.data.rival.id) return true;
      if (!areRivals(t.faction, M.setId)) return false;
      return m.data.spawned.includes(t) || M.game.layout.zoneAt(t.position.x, t.position.z)?.id === m.data.zoneId;
    },
    fightStage(M, m) {
      m.stage = 1;
      M.unmark(m, 'spot');
      this.refresh(M, m);
    },
    refresh(M, m) {
      M.objective(m, `Beat down the ${m.tokens.rivalShort} (${Math.min(m.data.ko.size, m.data.need)}/${m.data.need})`);
    },
    update(M, m, dt) {
      const game = M.game;
      const pos = playerPos(M);
      if (m.stage === 0 && d2(pos, m.data.pt) < 70) {
        // as many as the OG said; the story's first beef is a corner crew, not hand-picked fighters
        // (four fighters on one player swarm him before he can land a combo)
        const crew = spawnCrew(M, m, m.data.rival.id, m.data.pt, m.data.need, m.story ? 'hang' : 'fighter');
        const local = (game.gangs?.members || []).filter((a) => a.alive && a.faction === m.data.rival.id && d2(a.position, m.data.pt) < 80);
        if (!crew.length && !local.length) {
          // no one to fight (NPC system could not spawn): hold the corner instead
          m.data.hold = 0;
          m.stage = 3;
          M.objective(m, `Hold it down in ${m.tokens.zone}`);
        } else {
          m.data.need = Math.min(m.data.need, Math.max(1, crew.length || local.length));
          markFoes(M, m, crew.length ? crew : local.slice(0, m.data.need), SIDES[m.data.rival.side].color);
          this.fightStage(M, m);
        }
      } else if (m.stage === 3) {
        const inZone = game.layout.zoneAt(pos.x, pos.z)?.id === m.data.zoneId;
        if (inZone) m.data.hold += dt;
        const left = Math.max(0, Math.ceil(30 - m.data.hold));
        if (left !== m.data.holdShown) {
          m.data.holdShown = left;
          M.objective(m, `Hold it down in ${m.tokens.zone} (${left}s)`);
        }
        if (m.data.hold >= 30) this.leave(M, m);
      } else if (m.stage === 2) {
        const out = game.layout.zoneAt(pos.x, pos.z)?.id !== m.data.zoneId && d2(pos, m.data.pt) > 60;
        if (out) M.pass(m);
      }
    },
    leave(M, m) {
      m.stage = 2;
      for (const a of m.data.spawned) M.unmark(m, `foe:${a.id}`);
      M.objective(m, `Get out of ${m.tokens.zone}`);
    },
    event(M, m, name, payload) {
      if (m.stage !== 1) return;
      if (countKo(M, m, name, payload, (t) => this.accept(M, m, t))) {
        if (m.data.ko.size >= m.data.need) this.leave(M, m);
        else this.refresh(M, m);
      }
    },
    skip(M, m) {
      if (m.stage === 0) {
        m.stage = 1;
        m.data.ko = new Set(Array.from({ length: m.data.need }, (_, i) => `skip${i}`));
        this.leave(M, m);
      } else if (m.stage === 1 || m.stage === 3) this.leave(M, m);
      else M.pass(m);
    },
  },

  // ---------------------------------------------------------------- drive a homie across town
  escort: {
    setup(M, m) {
      const from = playerPos(M);
      const safe = (p) => !p.zoneId || !areRivals(M.game.gangs?.getZoneOwner?.(p.zoneId) ?? null, M.setId);
      const pickup = M.poi(['store', 'food', 'hood', 'payphone', 'barber'], { near: from, minDist: 50, maxDist: 280, filter: safe }) || M.poi(['store', 'food', 'payphone'], { near: from, minDist: 30 });
      if (!pickup) return false;
      const dest =
        M.poi(['record', 'clothes', 'food', 'store', 'barber', 'payphone'], { near: pickup, minDist: 380, maxDist: 950, filter: (p) => p !== pickup, random: true }) ||
        M.poi(['record', 'clothes', 'food', 'store', 'payphone'], { near: pickup, minDist: 200, random: true });
      if (!dest) return false;
      m.data.pickup = pickup;
      m.data.dest = dest;
      const dist = d2(pickup, dest);
      m.data.time = Math.round(dist / 9 + 40);
      m.tokens.homie = m.tokens.homie || pick(HOMIE_NAMES);
      m.tokens.place = M.placeName(pickup);
      m.tokens.dest = M.placeName(dest);
      m.tokens.time = timeText(m.data.time + 30);
      m.data.contact = m.tokens.homie;
      return true;
    },
    begin(M, m) {
      m.stage = 0;
      const p = m.data.pickup;
      m.data.spawned = [];
      const homie = M.spawn(M.setId, p.x + 1, p.z + 1, 'hang');
      if (homie?.brain) homie.brain.noRecruit = true; // the passenger, not a recruit
      m.data.homie = homie;
      if (homie) M.mark(m, 'homie', { follow: homie, kind: 'arrow', type: 'target', label: m.tokens.homie, yOffset: 2.3 });
      M.mark(m, 'pickup', { x: p.x, z: p.z, type: 'mission', label: m.tokens.place, radius: 4 });
      // the pickup has its own soft deadline so the player doesn't dawdle
      m.timer = m.data.time + 30;
      this.refresh(M, m);
    },
    refresh(M, m) {
      const car = !!M.game.player?.vehicle;
      if (m.stage === 0) M.objective(m, car ? `Pick up ${m.tokens.homie} at ${m.tokens.place}` : `Get a car, then pick up ${m.tokens.homie} at ${m.tokens.place}`);
      else M.objective(m, car ? `Drive ${m.tokens.homie} to ${m.tokens.dest}` : `Get back in a car, ${m.tokens.homie} ain't walking`);
      m.data.carState = car;
    },
    update(M, m) {
      const game = M.game;
      const player = game.player;
      if (!!player?.vehicle !== m.data.carState) this.refresh(M, m);
      if (m.stage === 0) {
        if (player?.vehicle && arrived(M, m.data.pickup, 0, 9)) this.pickUp(M, m);
        else if (!player?.vehicle && !m.data.nagged && d2(player.position, m.data.pickup) < 5) {
          m.data.nagged = true;
          M.say('homie', "We ain't walking, get a ride!");
        }
      } else if (m.stage === 1 && player?.vehicle && arrived(M, m.data.dest, 0, 10)) {
        this.dropOff(M, m);
      }
    },
    pickUp(M, m) {
      const h = m.data.homie;
      if (h?.userData?.homie) M.game.gangs?.dismiss?.(h, true);
      if (h && h.state !== 'removed') h.remove?.();
      M.unmark(m, 'homie');
      M.unmark(m, 'pickup');
      m.stage = 1;
      m.timer = m.data.time;
      const d = m.data.dest;
      M.mark(m, 'dest', { x: d.x, z: d.z, type: 'mission', label: m.tokens.dest, radius: 5 });
      M.say('homie', `Good looking out! ${m.tokens.dest}, and step on it.`);
      this.refresh(M, m);
    },
    dropOff(M, m) {
      const v = M.game.player?.vehicle;
      const exit = v?.getExitPoint?.() || m.data.dest;
      M.spawn(M.setId, exit.x, exit.z, 'hang');
      M.say('homie', 'Made it with time to spare. I owe you one.');
      M.pass(m);
    },
    skip(M, m) {
      if (m.stage === 0) this.pickUp(M, m);
      else this.dropOff(M, m);
    },
  },

  // ---------------------------------------------------------------- recruit homies, bring them home
  recruit: {
    setup(M, m, p) {
      const game = M.game;
      const hood = M.hoodPoi();
      if (!hood || !game.gangs) return false;
      // the homies are kicking it somewhere on our side of town, not at the hood itself
      const friendly = (q) => {
        const o = q.zoneId ? game.gangs.getZoneOwner?.(q.zoneId) ?? null : null;
        return !o || !areRivals(o, M.setId);
      };
      const spot =
        M.poi(['store', 'food', 'barber', 'record', 'payphone'], { near: hood, minDist: 80, maxDist: 320, filter: friendly, random: true }) ||
        M.poi(['store', 'food', 'payphone'], { near: hood, minDist: 40, filter: friendly });
      if (!spot) return false;
      m.data.hood = hood;
      m.data.spot = spot;
      m.data.need = p.count || 2;
      m.tokens.count = m.data.need;
      m.tokens.place = M.placeName(spot);
      m.data.spawned = [];
      return true;
    },
    begin(M, m) {
      const game = M.game;
      const spot = m.data.spot;
      m.stage = 0;
      const have = (game.gangs.members || []).filter((a) => a.alive && a.faction === M.setId && d2(a.position, spot) < 40 && !game.gangs.homies?.includes(a));
      const crew = have.length >= m.data.need ? [] : spawnCrew(M, m, M.setId, spot, m.data.need - have.length, 'hang');
      const recruitable = [...have.slice(0, m.data.need), ...crew];
      m.data.recruitable = recruitable;
      m.data.fallback = !recruitable.length || !game.gangs.recruit;
      for (const a of recruitable) M.mark(m, `foe:${a.id}`, { follow: a, kind: 'arrow', type: 'target', color: SIDES[M.side].light, yOffset: 2.3 });
      M.mark(m, 'spot', { x: spot.x, z: spot.z, type: 'mission', label: m.tokens.place, radius: 3 });
      this.refresh(M, m);
    },
    homies(M) {
      const list = M.game.gangs?.homies || [];
      let n = 0;
      for (let i = 0; i < list.length; i++) if (list[i].alive) n++;
      return n;
    },
    refresh(M, m) {
      if (m.stage === 0) {
        if (m.data.fallback) M.objective(m, `Round up the homies at ${m.tokens.place}`);
        else M.objective(m, `Recruit homies at ${m.tokens.place}: "Roll with me" (${Math.min(this.homies(M), m.data.need)}/${m.data.need})`);
      } else M.objective(m, 'Bring your homies back to the hood');
      m.data.last = this.homies(M);
    },
    toHood(M, m) {
      m.stage = 1;
      M.unmark(m, 'spot');
      const hood = m.data.hood;
      M.mark(m, 'hood', { x: hood.x, z: hood.z, type: 'hood', label: 'The hood', radius: 3 });
      if (m.data.fallback) M.say('homie', "Aight, we rolling. Lead the way.");
      this.refresh(M, m);
    },
    update(M, m) {
      const n = this.homies(M);
      if (n !== m.data.last) {
        for (const a of M.game.gangs?.homies || []) M.unmark(m, `foe:${a.id}`);
        this.refresh(M, m);
      }
      if (m.stage === 0) {
        if (m.data.fallback ? arrived(M, m.data.spot, 4, 9) : n >= m.data.need) this.toHood(M, m);
      } else if (m.stage === 1) {
        if (!m.data.fallback && n < m.data.need) {
          m.stage = 0;
          M.unmark(m, 'hood');
          const spot = m.data.spot;
          M.mark(m, 'spot', { x: spot.x, z: spot.z, type: 'mission', label: m.tokens.place, radius: 3 });
          this.refresh(M, m);
          return;
        }
        if (arrived(M, m.data.hood, 8, 10)) M.pass(m);
      }
    },
    skip(M, m) {
      if (m.stage === 0) {
        m.data.fallback = true;
        this.toHood(M, m);
      } else M.pass(m);
    },
  },

  // ---------------------------------------------------------------- shake a police chase
  lose_heat: {
    setup(M, m, p) {
      const police = M.game.police;
      if (!police?.setHeat) return false;
      m.data.heat = p.heat || 3;
      if (!m.story) m.timer = p.timer || 180;
      return true;
    },
    begin(M, m) {
      const police = M.game.police;
      police.setHeat(Math.max(police.heat || 0, m.data.heat));
      m.data.armed = (police.heat || 0) > 0;
      if (!m.data.armed) {
        M.pass(m);
        return;
      }
      const g = M.poi('garage', { near: playerPos(M) });
      if (g) M.mark(m, 'garage', { x: g.x, z: g.z, type: 'shop', label: `${g.name || 'Body shop'}: respray`, radius: 3, color: '#9ad3ff' });
      this.refresh(M, m);
    },
    refresh(M, m) {
      const h = Math.round(M.game.police?.heat || 0);
      m.data.shown = h;
      M.objective(m, `Lose the police ${'★'.repeat(h)}`);
    },
    update(M, m) {
      const h = Math.round(M.game.police?.heat || 0);
      if (h !== m.data.shown) this.refresh(M, m);
      if (h <= 0) M.pass(m);
    },
    skip(M) {
      M.game.police?.setHeat?.(0);
    },
  },

  // ---------------------------------------------------------------- run a package to a POI
  delivery: {
    setup(M, m, p) {
      const from = playerPos(M);
      const it = p.item ? { item: p.item, contact: p.contact || 'the contact', line: null } : pick(DELIVERY_ITEMS);
      const pickup = p.pickup === 'hood' ? M.hoodPoi() : M.poi(['store', 'food', 'hood', 'record', 'barber'], { near: from, minDist: 30, maxDist: 260, random: true }) || M.hoodPoi();
      if (!pickup) return false;
      let dest;
      if (p.dest === 'oldmarket') dest = M.poiInDistrict('oldmarket', pickup) || M.pointInZone('oldmarket');
      else dest = M.poi(['record', 'food', 'clothes', 'store', 'barber', 'hood'], { near: pickup, minDist: 300, maxDist: 900, random: true, filter: (q) => q !== pickup && q.id !== `hood-${M.setId}` });
      dest = dest || M.poi(['record', 'food', 'clothes', 'store'], { near: pickup, minDist: 150, random: true });
      if (!dest) return false;
      m.data.pickup = pickup;
      m.data.dest = dest;
      m.data.item = it;
      m.data.contact = it.contact;
      m.data.time = Math.round((d2(pickup, dest) / 9) * (p.timer || 1) + 35);
      m.tokens.item = it.item;
      m.tokens.place = M.placeName(pickup);
      m.tokens.dest = M.placeName(dest);
      return true;
    },
    begin(M, m) {
      m.stage = 0;
      const p = m.data.pickup;
      M.mark(m, 'pickup', { x: p.x, z: p.z, type: 'mission', label: m.tokens.place, radius: 2.2 });
      M.objective(m, `Pick up ${m.tokens.item} at ${m.tokens.place}`);
    },
    update(M, m) {
      if (m.stage === 0 && arrived(M, m.data.pickup, 3.5, 8)) {
        m.stage = 1;
        M.unmark(m, 'pickup');
        const d = m.data.dest;
        M.mark(m, 'dest', { x: d.x, z: d.z, type: 'mission', label: m.tokens.dest, radius: 2.8 });
        m.timer = m.data.time;
        M.game.hud?.toast?.(`Got ${m.tokens.item}`, { duration: 2.5 });
        M.objective(m, `Take ${m.tokens.item} to ${m.tokens.dest}`);
      } else if (m.stage === 1 && arrived(M, m.data.dest, 4, 9)) {
        if (m.data.item.line) M.say('contact', m.data.item.line);
        M.pass(m);
      }
    },
    skip(M, m) {
      if (m.stage === 0) {
        const p = m.data.pickup;
        M.game.debugApi?.teleport?.(p.x, p.z);
      } else {
        const d = m.data.dest;
        M.game.debugApi?.teleport?.(d.x, d.z);
      }
    },
  },

  // ---------------------------------------------------------------- story 9: rivals raid the hood
  defend: {
    setup(M, m, p) {
      const hood = M.hoodPoi();
      if (!hood) return false;
      const zoneId = M.game.layout.zoneAt(hood.x, hood.z)?.id || null;
      m.data.hood = hood;
      m.data.zoneId = zoneId;
      m.data.rival = M.rival;
      m.data.needKo = p.count || 3;
      m.data.ko = new Set();
      m.data.spawned = [];
      m.data.targets = new Set();
      const T = M.game.tagging;
      if (T && zoneId) {
        const walls = T.spotsInZone(zoneId).sort((a, b) => d2(a, hood) - d2(b, hood)).slice(0, p.tags || 2);
        for (const s of walls) {
          T.setOwner(s.id, M.rival.id);
          m.data.targets.add(s.id);
        }
      }
      m.data.needTags = m.data.targets.size;
      m.tokens.zone = zoneById(zoneId)?.name || 'the hood';
      return true;
    },
    begin(M, m) {
      const hood = m.data.hood;
      const crew = spawnCrew(M, m, m.data.rival.id, hood, m.data.needKo);
      if (!crew.length) m.data.needKo = 0;
      else m.data.needKo = Math.min(m.data.needKo, crew.length);
      markFoes(M, m, crew, SIDES[m.data.rival.side].color);
      for (const id of m.data.targets) {
        const s = M.game.tagging.spotById(id);
        const st = M.game.tagging.standPoint(s);
        M.mark(m, `spot:${id}`, { x: st.x, z: st.z, type: 'target', radius: 1.2, height: 1.8, color: SIDES[M.side].color, label: 'Cover it' });
      }
      if (!crew.length) M.mark(m, 'hood', { x: hood.x, z: hood.z, type: 'hood', radius: 3 });
      this.refresh(M, m);
      if (!m.data.needKo && !m.data.needTags) M.pass(m);
    },
    refresh(M, m) {
      const parts = [];
      if (m.data.needKo) parts.push(`run them off ${Math.min(m.data.ko.size, m.data.needKo)}/${m.data.needKo}`);
      if (m.data.needTags) parts.push(`cover tags ${m.data.needTags - m.data.targets.size}/${m.data.needTags}`);
      M.objective(m, `Defend ${m.tokens.zone}: ${parts.join(' · ')}`);
    },
    check(M, m) {
      if (m.data.ko.size >= m.data.needKo && m.data.targets.size === 0) M.pass(m);
      else this.refresh(M, m);
    },
    event(M, m, name, payload) {
      if (name === 'tag:complete' && payload?.byPlayer && m.data.targets.has(payload.spot?.id)) {
        m.data.targets.delete(payload.spot.id);
        M.unmark(m, `spot:${payload.spot.id}`);
        this.check(M, m);
        return;
      }
      const hood = m.data.hood;
      if (countKo(M, m, name, payload, (t) => m.data.spawned.includes(t) || (areRivals(t.faction, M.setId) && d2(t.position, hood) < 70))) this.check(M, m);
    },
    skip(M, m) {
      for (const a of m.data.spawned) m.data.ko.add(a.id);
      for (const id of [...m.data.targets]) M.game.tagging._finishTag(M.game.tagging.spotById(id));
      this.check(M, m);
    },
  },

  // ---------------------------------------------------------------- story 8 / 10: take a zone
  takeover: {
    setup(M, m, p) {
      const T = M.game.tagging;
      const zoneId = M.pickZone(p.zone || 'contested');
      if (!zoneId || !T) return false;
      const from = playerPos(M);
      let spots = T.spotsInZone(zoneId).filter((s) => s.owner !== M.setId);
      if (!spots.length) return false;
      spots = spots.sort((a, b) => d2(a, from) - d2(b, from)).slice(0, p.count || 3);
      m.data.zoneId = zoneId;
      m.data.spots = spots;
      m.data.targets = new Set(spots.map((s) => s.id));
      m.data.need = spots.length;
      m.data.ko = new Set();
      m.data.spawned = [];
      const owner = M.game.gangs?.getZoneOwner?.(zoneId) ?? zoneById(zoneId)?.owner ?? null;
      m.data.rival = owner && areRivals(owner, M.setId) ? setById(owner) : M.rival;
      m.data.rivals = p.rivals || 0;
      m.data.storm = !!p.storm;
      m.tokens.zone = zoneById(zoneId).name;
      return true;
    },
    begin(M, m) {
      if (m.data.storm) M.setStorm(true);
      const color = SIDES[M.side].color;
      for (const s of m.data.spots) {
        const st = M.game.tagging.standPoint(s);
        M.mark(m, `spot:${s.id}`, { x: st.x, z: st.z, type: 'target', color, radius: 1.2, height: 1.8, label: 'Wall' });
      }
      this.refresh(M, m);
    },
    refresh(M, m) {
      M.objective(m, `${m.def.objective}: tag walls (${m.data.need - m.data.targets.size}/${m.data.need})`);
    },
    update(M, m) {
      // the other side shows up to defend once the player gets close
      if (m.data.rivals && !m.data.crewSpawned) {
        const first = m.data.spots[0];
        if (d2(playerPos(M), first) < 80) {
          m.data.crewSpawned = true;
          const crew = spawnCrew(M, m, m.data.rival.id, M.game.tagging.standPoint(first), m.data.rivals);
          markFoes(M, m, crew, SIDES[m.data.rival.side].color);
        }
      }
    },
    event(M, m, name, payload) {
      if (name === 'tag:complete' && payload?.byPlayer && m.data.targets.has(payload.spot?.id)) {
        m.data.targets.delete(payload.spot.id);
        M.unmark(m, `spot:${payload.spot.id}`);
        if (m.data.targets.size === 0) this.finish(M, m);
        else this.refresh(M, m);
        return;
      }
      countKo(M, m, name, payload, (t) => m.data.spawned.includes(t));
    },
    finish(M, m) {
      const game = M.game;
      // the whole set rolls through behind you and makes it official
      if ((game.gangs?.getZoneOwner?.(m.data.zoneId) ?? null) !== M.setId) game.gangs?.addInfluence?.(m.data.zoneId, M.setId, 90);
      M.pass(m);
    },
    skip(M, m) {
      const id = [...m.data.targets][0];
      if (id) M.game.tagging._finishTag(M.game.tagging.spotById(id));
    },
    cleanup(M, m) {
      if (m.data.storm) M.setStorm(false, m.status === 'complete' ? 60 : 0);
    },
  },
};

/** Fallback parked car when Traffic has none to offer (stub traffic). */
export function makeParkedCar(game, model, x, z, heading) {
  const colors = ['#6b1f2a', '#1f3f6b', '#2d5a3a', '#c9c2b0', '#8a6d2f', '#4a2d5c', '#b8b8b8', '#222222'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  let v = null;
  try {
    v = game.traffic?.spawnCar?.({ x, z, heading, model, color, ai: false }) || null;
  } catch (err) {
    console.warn('[missions] traffic.spawnCar failed', err);
  }
  let own = false;
  if (!v) {
    v = new Vehicle(game, { model, color, x, z, heading });
    game.addVehicle(v);
    own = true;
  }
  v.parked = true;
  v.ai = null;
  if (v.controls) v.controls.throttle = 0;
  return { vehicle: v, own };
}
