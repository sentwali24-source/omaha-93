import { headingTo } from '../../core/math.js';
import { locomote, setAnim, playOnce, RUN } from './steering.js';

// Shared melee behaviour for set members, homies and police officers (fists only — no weapons).
//
//   startFight(actor, target)          → brain.fight
//   fightStep(game, ctx, actor, dt, o) → 'fight' | 'swing' | 'backoff' | 'car' | 'lost'
//
// A fighter closes in, takes a slot around the target (so a group surrounds it), circles, and
// swings after a visible wind-up (stops, squares up, then punch / punch2 / kick through
// game.combat.melee). Only one NPC swings at a given target every ~0.4 s, so being jumped by
// three is dangerous but readable. Hurt fighters back off for a moment before re-engaging.

const lastSwing = new WeakMap(); // target actor → game time of the last NPC swing at it
const MOVES = ['punch', 'punch2', 'punch', 'kick'];

export function startFight(a, target) {
  const b = a.brain;
  const f = b.fight || (b.fight = {});
  const dx = a.position.x - target.position.x;
  const dz = a.position.z - target.position.z;
  f.target = target;
  f.cd = 0.35 + Math.random() * 0.7;
  f.windup = 0;
  f.backoff = 0;
  f.backoffReady = 0;
  f.strafe = Math.random() < 0.5 ? 1 : -1;
  f.strafeT = 1 + Math.random() * 2;
  f.slot = Math.atan2(dz, dx);
  f.since = 0;
  return f;
}

export function stopFight(a) {
  if (a.brain.fight) a.brain.fight.target = null;
}

function canSwing(game, t, gap) {
  const last = lastSwing.get(t);
  return last === undefined || game.time.elapsed - last > gap;
}

/**
 * opts: { damage, speed, reach, windup, cooldown: [min, max], knockback, backOffAt, swingGap, moves }
 */
export function fightStep(game, ctx, a, dt, o = {}) {
  const f = a.brain.fight;
  const t = f && f.target;
  if (!t || t.state !== 'active') return 'lost';
  const p = a.position;
  const tp = t.position;
  const dx = tp.x - p.x;
  const dz = tp.z - p.z;
  const d = Math.hypot(dx, dz) || 0.001;
  const face = headingTo(dx, dz);
  f.since += dt;

  if (t.vehicle) {
    // can't punch through a car door: hang around it, jog after it if it's slow
    const vs = Math.abs(t.vehicle.speed || 0);
    const s = d > 4.5 && vs < 9 ? (o.speed || RUN) : 0;
    locomote(game, ctx, a, (dx / d) * s, (dz / d) * s, dt, face, 10);
    setAnim(a, a.speed > 3.5 ? 'run' : a.speed > 0.3 ? 'walk' : 'idle');
    return 'car';
  }

  const reach = o.reach ?? 1.15;
  if (f.backoff > 0) {
    f.backoff -= dt;
    const tx = -dz / d;
    const tz = dx / d;
    locomote(game, ctx, a, (-dx / d) * 2.6 + tx * f.strafe, (-dz / d) * 2.6 + tz * f.strafe, dt, face, 12);
    setAnim(a, 'walk');
    return 'backoff';
  }
  const now = game.time.elapsed;
  if (a.health < a.maxHealth * (o.backOffAt ?? 0.35) && now > f.backoffReady && d < 2.4 && Math.random() < dt * 1.4) {
    f.backoff = 1 + Math.random() * 0.8;
    f.backoffReady = now + 6;
    f.windup = 0;
  }

  if (f.windup > 0) {
    f.windup -= dt;
    locomote(game, ctx, a, 0, 0, dt, face, 16);
    setAnim(a, 'idle');
    if (f.windup <= 0) {
      const moves = o.moves || MOVES;
      const move = moves[Math.floor(Math.random() * moves.length)];
      playOnce(a, move);
      game.combat?.melee?.(a, {
        damage: (o.damage ?? 8) * (move === 'kick' ? 1.25 : 1),
        range: 1.55,
        knockback: (o.knockback ?? 3) * (move === 'kick' ? 1.4 : 1),
        delay: 0.14,
      });
      game.audio?.play?.('whoosh', { x: p.x, z: p.z, volume: 0.45, rate: 0.9 + Math.random() * 0.25 });
      const cd = o.cooldown || [0.9, 1.6];
      f.cd = cd[0] + Math.random() * (cd[1] - cd[0]);
    }
    return 'swing';
  }

  f.cd -= dt;
  let vx;
  let vz;
  if (d > 3.4) {
    const s = o.speed || RUN;
    vx = (dx / d) * s;
    vz = (dz / d) * s;
  } else {
    // take our slot around the target and circle it
    f.strafeT -= dt;
    if (f.strafeT <= 0) {
      f.strafe = -f.strafe;
      f.strafeT = 1.2 + Math.random() * 2;
    }
    f.slot += f.strafe * dt * 0.4;
    const sx = tp.x + Math.cos(f.slot) * reach;
    const sz = tp.z + Math.sin(f.slot) * reach;
    const ex = sx - p.x;
    const ez = sz - p.z;
    const ed = Math.hypot(ex, ez);
    const s = Math.min(2.6, ed * 2.2);
    vx = ed > 0.05 ? (ex / ed) * s : 0;
    vz = ed > 0.05 ? (ez / ed) * s : 0;
    // the player gets a fair beat between swings; NPC brawls run hotter
    if (d < reach + 0.4 && f.cd <= 0 && canSwing(game, t, o.swingGap ?? (t.kind === 'player' ? 0.65 : 0.42))) {
      f.windup = o.windup ?? 0.3;
      lastSwing.set(t, now);
    }
  }
  locomote(game, ctx, a, vx, vz, dt, d < 4 ? face : null, 12);
  setAnim(a, a.speed > 3.5 ? 'run' : a.speed > 0.3 ? 'walk' : 'idle');
  return 'fight';
}
