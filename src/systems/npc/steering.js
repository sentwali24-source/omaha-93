import { Actor } from '../../entities/Actor.js';
import { Character } from '../../entities/Character.js';
import { angleDiff, dampAngle, headingTo, damp } from '../../core/math.js';

// Shared NPC locomotion: every walking NPC (civilians, set members, homies, officers) moves
// through locomote(), which layers
//   desired velocity → hit stagger → separation from nearby actors → knockback (actor.velocity)
//   → push out of vehicles → static collision (collision.resolveCircle, y0 = feet + 0.3)
//   → heading / animation speed → character.update(dt, speed)
// plus spawning helpers, animation bookkeeping and distance LOD.

export const WALK = 1.35;
export const JOG = 3.1;
export const RUN = 5.4;
export const SPRINT = 6.8;

// LOD bands around the focus (meters): full rate inside NEAR, ~5 Hz up to FREEZE, frozen and
// hidden beyond (systems normally despawn before that).
export const LOD_NEAR = 55;
export const LOD_FREEZE = 120;
const NEAR2 = LOD_NEAR * LOD_NEAR;
const FREEZE2 = LOD_FREEZE * LOD_FREEZE;

/** Create an NPC Actor with a Character, register it with the game and tag its system. */
export function createNpc(game, { kind, faction = 'civ', side = null, look, x, z, heading = 0, system, name = '', maxHealth = 100, radius = 0.35 }) {
  const character = new Character(look);
  const a = new Actor(game, { kind, faction, side, character, x, z, heading, maxHealth, radius, name });
  a.system = system;
  a.brain = newBrain();
  character.setAnim('idle');
  game.addActor(a);
  return a;
}

function newBrain() {
  return {
    state: 'idle',
    t: 0,
    anim: 'idle',
    visible: true,
    lodAcc: 0,
    lodPhase: Math.random() * 0.2,
    lastState: 'active',
    stuck: 0,
    think: Math.random() * 0.25, // perception timer, staggered per NPC
  };
}

/** setAnim only when it changes (Character rebuilds nothing, but keeps its blend state). */
export function setAnim(a, name) {
  const b = a.brain;
  if (b.anim === name) return;
  b.anim = name;
  a.character.setAnim(name);
}

export function playOnce(a, name) {
  a.character.playOnce?.(name);
}

/**
 * Distance LOD. Returns the dt to simulate this frame (0 = skip). Far NPCs accumulate time and
 * update at ~5 Hz; beyond LOD_FREEZE they are hidden and frozen. `always` NPCs (homies, pursuit
 * officers) never freeze.
 */
export function lodStep(ctx, a, dt, always = false) {
  const b = a.brain;
  const d2 = ctx.d2(a.position.x, a.position.z);
  if (!always && d2 > FREEZE2) {
    if (b.visible) {
      a.character.setVisible(false);
      b.visible = false;
    }
    b.lodAcc = 0;
    return 0;
  }
  if (!b.visible) {
    a.character.setVisible(true);
    b.visible = true;
  }
  if (!always && d2 > NEAR2) {
    b.lodAcc += dt;
    if (b.lodAcc < 0.2 + b.lodPhase * 0.25) return 0;
    const t = Math.min(b.lodAcc, 0.4);
    b.lodAcc = 0;
    return t;
  }
  const t = dt + Math.min(b.lodAcc, 0.3);
  b.lodAcc = 0;
  return t;
}

/**
 * Track actor.state transitions ('active' ↔ 'ko') so systems can react to KO / revive.
 * Returns 'ko' on the frame the NPC went down, 'revived' when it got back up, else null.
 */
export function stateChange(a) {
  const b = a.brain;
  if (b.lastState === a.state) return null;
  const prev = b.lastState;
  b.lastState = a.state;
  if (a.state === 'ko') {
    b.anim = 'ko';
    return 'ko';
  }
  if (a.state === 'active' && prev === 'ko') {
    b.anim = 'idle';
    return 'revived';
  }
  return null;
}

/** A knocked-out body: slides with the remaining knockback, stays out of walls, lies still. */
export function lieStill(game, ctx, a, dt) {
  const p = a.position;
  if (!ctx.combatMoves) {
    p.x += a.velocity.x * dt;
    p.z += a.velocity.z * dt;
  }
  game.collision.resolveCircle(p, a.radius, 0.3, 1.0);
  a.speed = 0;
  a.character.update(dt, 0);
}

/**
 * Move an actor with desired velocity (vx, vz) m/s.
 *   face:  heading to face instead of the travel direction (null = face travel direction)
 *   turn:  turn rate (higher = snappier)
 * Returns the achieved ground speed; a.brain.stuck accumulates while blocked.
 */
export function locomote(game, ctx, a, vx, vz, dt, face = null, turn = 9) {
  const p = a.position;
  const b = a.brain;
  const x0 = p.x;
  const z0 = p.z;

  // flinch right after a hit
  if (game.time.elapsed - a.lastHitAt < 0.32) {
    vx *= 0.15;
    vz *= 0.15;
  }
  const want = Math.hypot(vx, vz);

  // separation: soft steering away from close actors + hard overlap resolution
  let sx = 0;
  let sz = 0;
  const near = ctx.near;
  for (let i = 0; i < near.length; i++) {
    const o = near[i];
    if (o === a || o.state !== 'active' || o.vehicle) continue;
    const dx = p.x - o.position.x;
    const dz = p.z - o.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1.44 || d2 < 1e-8) continue;
    const d = Math.sqrt(d2);
    const minD = a.radius + o.radius + 0.08;
    if (d < minD) {
      const push = (minD - d) * (o.kind === 'player' ? 1 : 0.5);
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
    }
    const w = (1.2 - d) / 1.2;
    sx += (dx / d) * w;
    sz += (dz / d) * w;
  }
  if (want > 0.2) {
    // steer around rather than straight back: bias the push sideways relative to travel
    vx += sx * 1.3;
    vz += sz * 1.3;
  }

  // knockback impulse (unless Combat integrates it for us)
  const kv = a.velocity;
  const kick = Math.abs(kv.x) + Math.abs(kv.z) > 0.8;
  if (!ctx.combatMoves) {
    p.x += kv.x * dt;
    p.z += kv.z * dt;
  }

  p.x += vx * dt;
  p.z += vz * dt;

  pushOutOfVehicles(ctx, a);
  game.collision.resolveCircle(p, a.radius, p.y + 0.3, p.y + 1.8);

  if (kick && !ctx.combatMoves) ctx.probe(a);

  // heading
  if (face !== null) {
    a.faceHeading(dampAngle(a.heading, face, turn, dt));
  } else if (want > 0.25) {
    a.faceHeading(dampAngle(a.heading, headingTo(vx, vz), turn, dt));
  }

  // achieved speed (for the walk/run blend) and stuck detection
  const moved = dt > 0 ? Math.hypot(p.x - x0, p.z - z0) / dt : 0;
  const achieved = Math.min(moved, want + 0.4);
  a.speed = damp(a.speed, want > 0.05 ? achieved : 0, 10, dt);
  if (want > 0.5 && moved < want * 0.3) b.stuck += dt;
  else b.stuck = Math.max(0, b.stuck - dt * 2);
  a.character.update(dt, a.speed);
  return achieved;
}

/** Stand in place (still resolves separation / knockback), optionally turning toward `face`. */
export function stand(game, ctx, a, dt, face = null, turn = 6) {
  return locomote(game, ctx, a, 0, 0, dt, face, turn);
}

/** Desired velocity toward (tx, tz) at `speed`, slowing inside `arrive` meters. Writes out. */
export function seek(a, tx, tz, speed, out, arrive = 0.8) {
  const dx = tx - a.position.x;
  const dz = tz - a.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) {
    out.x = 0;
    out.z = 0;
    return 0;
  }
  const s = d < arrive ? speed * (d / arrive) : speed;
  out.x = (dx / d) * s;
  out.z = (dz / d) * s;
  return d;
}

/** Oriented-box push out of nearby vehicles (they are not in the static collision world). */
function pushOutOfVehicles(ctx, a) {
  const p = a.position;
  const vs = ctx.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    const dx = p.x - v.position.x;
    const dz = p.z - v.position.z;
    const reach = (v.length || 4.8) * 0.5 + a.radius + 0.2;
    if (dx * dx + dz * dz > reach * reach) continue;
    const h = v.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const lf = dx * fx + dz * fz; // along the car
    const lr = dx * rx + dz * rz; // across the car
    const hl = (v.length || 4.8) * 0.5 + a.radius;
    const hw = (v.width || 1.9) * 0.5 + a.radius;
    if (Math.abs(lf) >= hl || Math.abs(lr) >= hw) continue;
    const penF = hl - Math.abs(lf);
    const penR = hw - Math.abs(lr);
    if (penR < penF) {
      const s = lr >= 0 ? penR : -penR;
      p.x += rx * s;
      p.z += rz * s;
    } else {
      const s = lf >= 0 ? penF : -penF;
      p.x += fx * s;
      p.z += fz * s;
    }
  }
}

/** Heading difference helper re-exported for AI code. */
export const turnNeeded = (a, h) => Math.abs(angleDiff(a.heading, h));
