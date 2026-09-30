// Procedural animation: poses are Float32Arrays of bone Euler rotations (18 bones × [rx, ry, rz])
// plus a hips offset (x, y, z in unit-scale meters) and the prop (spray can) visibility.
//
// Sign conventions (model faces -Z, right side +X), all in the bone's parent frame:
//   upper arm / thigh rx > 0   swing forward        forearm rx > 0   bend the elbow
//   shin rx < 0                bend the knee        foot rx > 0      toes up
//   spine / chest / head rx<0  lean forward / look down               ry > 0  turn left
//   right-side rz > 0          raise the limb outward (left side is mirrored by the helpers)
//
// Loops (idle walk run drive sit lean ko dance talk spray crouch fight surrender) are functions of
// time; one-shots (punch punch2 kick hit getup sign jump cheer point) are keyframe tracks.

import { NB, HIPS, SPINE, CHEST, NECK, HEAD, UAL, FAL, HL, UAR, FAR, HR, THL, SHL, FTL, THR, SHR, FTR } from './rig.js';

export const POSE_LEN = NB * 3 + 4;
export const HX = NB * 3;
export const HY = HX + 1;
export const HZ = HX + 2;
export const PROPV = HX + 3;

export const newPose = () => new Float32Array(POSE_LEN);

const sin = Math.sin;
const cos = Math.cos;
const max = Math.max;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ pose writers
function rot(P, b, x, y, z) {
  const i = b * 3;
  P[i] = x;
  P[i + 1] = y;
  P[i + 2] = z;
}
/** Right-side convention; mirrored for the left side (side = -1). */
function limb(P, b, side, x, y, z) {
  const i = b * 3;
  P[i] = x;
  P[i + 1] = y * side;
  P[i + 2] = z * side;
}
function arms(P, x, y, z, fx, fy = 0, fz = 0) {
  limb(P, UAR, 1, x, y, z);
  limb(P, UAL, -1, x, y, z);
  limb(P, FAR, 1, fx, fy, fz);
  limb(P, FAL, -1, fx, fy, fz);
}

export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export function lerpPoseMasked(out, a, b, t, mask) {
  for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * t * mask[i];
  return out;
}

// ------------------------------------------------------------------ loops
// ctx: { seed, speed, phase, idle (variant 0..2), steer, female }

export function poseIdle(P, t, ctx, variant = ctx.idle) {
  P.fill(0);
  const s = ctx.seed;
  const br = sin(t * 1.7 + s);
  const shift = sin(t * 0.37 + s * 1.3);
  const look = sin(t * 0.23 + s * 2.1) + 0.4 * sin(t * 0.61 + s);
  P[HX] = 0.022 * shift;
  P[HY] = -0.004 - 0.006 * Math.abs(shift);
  rot(P, HIPS, 0, 0.03 * shift, 0.035 * shift);
  rot(P, SPINE, -0.02 + br * 0.01, 0, -0.03 * shift);
  rot(P, CHEST, br * 0.018, 0, -0.01 * shift);
  rot(P, NECK, 0.02, look * 0.1, 0);
  rot(P, HEAD, 0.03 - br * 0.012, look * 0.22, 0.02 * shift);
  // legs: slightly apart, weight on one side
  const relaxR = max(0, -shift);
  const relaxL = max(0, shift);
  limb(P, THR, 1, 0.03 + relaxR * 0.08, -0.06, 0.065 - shift * 0.03);
  limb(P, THL, -1, 0.03 + relaxL * 0.08, -0.06, 0.065 + shift * 0.03);
  rot(P, SHR, -0.04 - relaxR * 0.16, 0, 0);
  rot(P, SHL, -0.04 - relaxL * 0.16, 0, 0);
  rot(P, FTR, 0.01 + relaxR * 0.08, 0, 0);
  rot(P, FTL, 0.01 + relaxL * 0.08, 0, 0);
  const v = variant | 0;
  if (v === 1) {
    // arms crossed
    limb(P, UAR, 1, 0.42, 0, 0.2);
    limb(P, UAL, -1, 0.34, 0, 0.2);
    limb(P, FAR, 1, 1.62, 0, -1.05);
    limb(P, FAL, -1, 1.5, 0, -1.05);
    rot(P, HEAD, 0.08 - br * 0.01, look * 0.2, 0.03 * shift);
  } else if (v === 2) {
    // hands in the front pockets
    limb(P, UAR, 1, -0.12, 0, 0.2 + br * 0.01);
    limb(P, UAL, -1, -0.12, 0, 0.2 + br * 0.01);
    limb(P, FAR, 1, 0.62, 0, -0.35);
    limb(P, FAL, -1, 0.62, 0, -0.35);
  } else {
    arms(P, 0.06, 0, 0.1 + br * 0.012, 0.2 + br * 0.02);
  }
}

export function poseWalk(P, ph, amp, ctx) {
  P.fill(0);
  const s = sin(ph);
  const c = cos(ph);
  const a = amp;
  limb(P, THR, 1, 0.02 + s * 0.44 * a, 0, 0.025);
  limb(P, THL, -1, 0.02 - s * 0.44 * a, 0, 0.025);
  const kr = -(0.08 + 0.78 * max(0, c) * a);
  const kl = -(0.08 + 0.78 * max(0, -c) * a);
  rot(P, SHR, kr, 0, 0);
  rot(P, SHL, kl, 0, 0);
  rot(P, FTR, -(P[THR * 3] + kr) * 0.75 + max(0, s) * 0.12 * a, 0, 0);
  rot(P, FTL, -(P[THL * 3] + kl) * 0.75 + max(0, -s) * 0.12 * a, 0, 0);
  P[HY] = -0.03 * a * Math.abs(s) + 0.006;
  P[HX] = 0.014 * s * a;
  rot(P, HIPS, 0, s * 0.08 * a, c * 0.03 * a);
  rot(P, SPINE, -0.035 * a, -s * 0.05 * a, -s * 0.02 * a);
  rot(P, CHEST, -0.015, -s * 0.09 * a, s * 0.03 * a);
  rot(P, NECK, 0.01, s * 0.04 * a, 0);
  rot(P, HEAD, 0.02 + 0.035 * sin(2 * ph) * a, s * 0.08 * a, -s * 0.02 * a);
  limb(P, UAR, 1, -s * 0.4 * a, 0, 0.1);
  limb(P, UAL, -1, s * 0.4 * a, 0, 0.1);
  limb(P, FAR, 1, 0.22 + 0.35 * max(0, -s) * a, 0, 0);
  limb(P, FAL, -1, 0.22 + 0.35 * max(0, s) * a, 0, 0);
}

export function poseRun(P, ph, amp, ctx) {
  P.fill(0);
  const s = sin(ph);
  const c = cos(ph);
  const a = amp;
  const thr = (s > 0 ? s * 1.0 : s * 0.6) * a;
  const thl = (s < 0 ? -s * 1.0 : -s * 0.6) * a;
  limb(P, THR, 1, 0.1 + thr, 0, 0.03);
  limb(P, THL, -1, 0.1 + thl, 0, 0.03);
  const kr = -(0.35 + 1.35 * max(0, c)) * a;
  const kl = -(0.35 + 1.35 * max(0, -c)) * a;
  rot(P, SHR, kr, 0, 0);
  rot(P, SHL, kl, 0, 0);
  rot(P, FTR, -(P[THR * 3] + kr) * 0.5 - 0.1, 0, 0);
  rot(P, FTL, -(P[THL * 3] + kl) * 0.5 - 0.1, 0, 0);
  P[HY] = (-0.045 + 0.05 * Math.abs(s)) * a;
  rot(P, HIPS, 0, s * 0.14 * a, 0);
  rot(P, SPINE, -0.2 * a, -s * 0.1 * a, 0);
  rot(P, CHEST, -0.06 * a, -s * 0.2 * a, 0);
  rot(P, NECK, 0.08 * a, s * 0.1 * a, 0);
  rot(P, HEAD, 0.14 * a, s * 0.12 * a, 0);
  limb(P, UAR, 1, -s * 0.95 * a + 0.1, 0, 0.12);
  limb(P, UAL, -1, s * 0.95 * a + 0.1, 0, 0.12);
  limb(P, FAR, 1, 1.25 + 0.25 * max(0, -s), 0, 0);
  limb(P, FAL, -1, 1.25 + 0.25 * max(0, s), 0, 0);
}

export function poseDrive(P, t, ctx) {
  P.fill(0);
  const st = ctx.steer || 0;
  P[HY] = -0.42;
  P[HZ] = 0.04;
  limb(P, THR, 1, 1.45, 0, 0.06);
  limb(P, THL, -1, 1.45, 0, 0.06);
  rot(P, SHR, -1.35, 0, 0);
  rot(P, SHL, -1.35, 0, 0);
  rot(P, FTR, 0.2, 0, 0);
  rot(P, FTL, 0.2, 0, 0);
  rot(P, SPINE, 0.08, 0, 0);
  rot(P, CHEST, 0.02, st * 0.08, 0);
  rot(P, HEAD, 0, sin(t * 0.4 + ctx.seed) * 0.12 + st * 0.15, 0);
  limb(P, UAR, 1, 0.95 + st * 0.15, 0, 0.12);
  limb(P, UAL, -1, 0.95 - st * 0.15, 0, 0.12);
  limb(P, FAR, 1, 0.55, 0, -0.2);
  limb(P, FAL, -1, 0.55, 0, -0.2);
}

export function poseSit(P, t, ctx) {
  P.fill(0);
  const br = sin(t * 1.5 + ctx.seed);
  const look = sin(t * 0.25 + ctx.seed * 2);
  P[HY] = -0.46;
  P[HZ] = 0.06;
  limb(P, THR, 1, 1.5, -0.05, 0.14);
  limb(P, THL, -1, 1.5, -0.05, 0.14);
  rot(P, SHR, -1.42, 0, 0);
  rot(P, SHL, -1.42, 0, 0);
  rot(P, FTR, 0.02, 0, 0);
  rot(P, FTL, 0.02, 0, 0);
  rot(P, SPINE, -0.12 - br * 0.015, 0, 0);
  rot(P, CHEST, -0.05, 0, 0);
  rot(P, HEAD, 0.12, look * 0.35, 0);
  arms(P, 0.5, 0, 0.18, 0.95, 0, -0.25);
}

export function poseLean(P, t, ctx) {
  P.fill(0);
  const br = sin(t * 1.6 + ctx.seed);
  const look = sin(t * 0.2 + ctx.seed);
  P[HZ] = 0.07;
  P[HY] = -0.02;
  rot(P, HIPS, 0.05, 0, 0);
  rot(P, SPINE, 0.08 + br * 0.01, 0, 0);
  rot(P, CHEST, 0.03, 0, 0);
  rot(P, HEAD, -0.05, look * 0.3, 0);
  limb(P, THR, 1, 0.7, 0, 0.08);
  rot(P, SHR, -1.6, 0, 0);
  rot(P, FTR, 0.7, 0, 0);
  limb(P, THL, -1, -0.12, 0, 0.05);
  rot(P, SHL, -0.04, 0, 0);
  rot(P, FTL, 0.1, 0, 0);
  limb(P, UAR, 1, 0.42, 0, 0.2);
  limb(P, UAL, -1, 0.34, 0, 0.2);
  limb(P, FAR, 1, 1.62, 0, -1.05);
  limb(P, FAL, -1, 1.5, 0, -1.05);
}

// lying on the back (end of the KO fall; also the first getup key)
function koLie(P) {
  P.fill(0);
  rot(P, HIPS, 1.5, 0, 0);
  P[HY] = -0.8;
  P[HZ] = 0;
  rot(P, SPINE, 0.03, 0, 0);
  rot(P, CHEST, 0.03, 0, 0);
  rot(P, NECK, 0.05, 0.3, 0);
  rot(P, HEAD, 0.1, 0.45, 0.1);
  limb(P, UAR, 1, 0.25, 0, 1.15);
  limb(P, UAL, -1, 0.05, 0, 0.75);
  limb(P, FAR, 1, 0.35, 0, 0);
  limb(P, FAL, -1, 0.7, 0, 0);
  limb(P, THR, 1, 0.02, 0, 0.12);
  limb(P, THL, -1, 0.55, 0, 0.1);
  rot(P, SHR, -0.06, 0, 0);
  rot(P, SHL, -1.0, 0, 0);
  rot(P, FTR, -0.5, 0, 0);
  rot(P, FTL, 0.1, 0, 0);
}
const KO_LIE = newPose();
koLie(KO_LIE);

export function poseKO(P, t, ctx) {
  const FALL = 0.55;
  if (t >= FALL + 0.2) {
    P.set(KO_LIE);
    const br = sin(t * 1.3);
    P[CHEST * 3] += br * 0.015;
    return;
  }
  const e = clamp01(t / FALL);
  const k = e * e;
  P.set(KO_LIE);
  for (let i = 0; i < POSE_LEN; i++) P[i] *= k;
  // knees buckle and arms fly up on the way down
  const mid = sin(Math.PI * e);
  P[SHR * 3] -= 0.6 * mid;
  P[SHL * 3] -= 0.7 * mid;
  P[UAR * 3] += 0.9 * mid;
  P[UAL * 3] += 0.8 * mid;
  P[HEAD * 3] += 0.3 * mid;
  if (t > FALL) P[HY] += 0.035 * sin(Math.PI * ((t - FALL) / 0.2));
}

export function poseDance(P, t, ctx) {
  P.fill(0);
  const b = t * Math.PI * 2 * 1.9 + ctx.seed;
  const side = sin(b / 2);
  const bounce = 0.5 + 0.5 * cos(b);
  P[HX] = 0.06 * side;
  P[HY] = -0.04 * bounce;
  rot(P, HIPS, 0, 0.12 * sin(b / 2 + 0.5), -0.08 * side);
  limb(P, THR, 1, 0.1 * bounce, 0, 0.07 + 0.1 * max(0, side));
  limb(P, THL, -1, 0.1 * bounce, 0, 0.07 + 0.1 * max(0, -side));
  rot(P, SHR, -0.22 * bounce - 0.2 * max(0, -side), 0, 0);
  rot(P, SHL, -0.22 * bounce - 0.2 * max(0, side), 0, 0);
  rot(P, FTR, 0.1 * bounce, 0, 0);
  rot(P, FTL, 0.1 * bounce, 0, 0);
  rot(P, SPINE, -0.05, 0, 0.06 * side);
  rot(P, CHEST, -0.03, -0.15 * sin(b / 2), 0.04 * side);
  rot(P, HEAD, 0.05 - 0.12 * bounce, 0.1 * side, 0);
  limb(P, UAR, 1, 0.35 + 0.28 * sin(b), 0, 0.25);
  limb(P, UAL, -1, 0.35 - 0.28 * sin(b), 0, 0.25);
  limb(P, FAR, 1, 1.45 + 0.2 * sin(b), 0, 0);
  limb(P, FAL, -1, 1.45 - 0.2 * sin(b), 0, 0);
}

export function poseTalk(P, t, ctx) {
  poseIdleLegs(P, t, ctx);
  const s = ctx.seed;
  const g1 = max(0, sin(t * 1.25 + s));
  const g2 = max(0, sin(t * 0.9 + s * 2 + 1.7));
  limb(P, UAR, 1, 0.18 + 0.55 * g1, 0, 0.14 + 0.1 * g1);
  limb(P, FAR, 1, 0.5 + 0.95 * g1 + 0.2 * sin(t * 3.1), 0, -0.2 * g1);
  limb(P, HR, 1, 0, 0, 0.3 * g1);
  limb(P, UAL, -1, 0.15 + 0.45 * g2, 0, 0.12 + 0.08 * g2);
  limb(P, FAL, -1, 0.4 + 0.85 * g2 + 0.15 * sin(t * 2.7), 0, -0.15 * g2);
  rot(P, HEAD, 0.05 * sin(t * 2.3), 0.2 * sin(t * 0.6 + s), 0.05 * sin(t * 1.1));
  rot(P, CHEST, 0, 0.08 * sin(t * 0.8), 0);
}

/** Relaxed idle stance (used under upper-body loops). */
function poseIdleLegs(P, t, ctx) {
  poseIdle(P, t, ctx, 0);
}

export function poseSpray(P, t, ctx) {
  poseIdle(P, t, ctx, 0);
  const cyc = t % 4.5;
  const shake = cyc < 0.8 ? 1 - smooth(clamp01((cyc - 0.55) / 0.25)) : cyc > 4.2 ? smooth(clamp01((cyc - 4.2) / 0.3)) : 0;
  const sweep = sin(t * 0.9);
  // spraying: arm raised toward the wall, sweeping
  const sx = 1.72 + 0.22 * sin(t * 1.4);
  const fx = 0.3;
  // shaking: can held at chest height, fast pumping
  const kx = 0.55 + 0.25 * sin(t * 32);
  const kf = 1.55 + 0.35 * sin(t * 32);
  limb(P, UAR, 1, sx + (kx - sx) * shake, 0, 0.08 + 0.1 * shake);
  limb(P, FAR, 1, fx + (kf - fx) * shake, 0, 0);
  limb(P, HR, 1, 0.1 * sin(t * 9) * (1 - shake), 0, 0);
  rot(P, CHEST, 0.02, sweep * 0.3 * (1 - shake), 0);
  rot(P, SPINE, 0, sweep * 0.1 * (1 - shake), 0);
  rot(P, HEAD, 0.14 * (1 - shake) - 0.1 * shake, sweep * 0.12, 0);
  limb(P, UAL, -1, 0.15, 0, 0.14);
  limb(P, FAL, -1, 0.35, 0, 0);
  P[PROPV] = 1;
}

export function poseCrouch(P, t, ctx) {
  P.fill(0);
  const br = sin(t * 1.8 + ctx.seed);
  P[HY] = -0.4;
  P[HZ] = 0.05;
  limb(P, THR, 1, 1.35, -0.1, 0.16);
  limb(P, THL, -1, 1.35, -0.1, 0.16);
  rot(P, SHR, -2.1, 0, 0);
  rot(P, SHL, -2.1, 0, 0);
  rot(P, FTR, 0.72, 0, 0);
  rot(P, FTL, 0.72, 0, 0);
  rot(P, SPINE, -0.35 - br * 0.02, 0, 0);
  rot(P, CHEST, -0.1, 0, 0);
  rot(P, HEAD, 0.35, sin(t * 0.3 + ctx.seed) * 0.3, 0);
  arms(P, 0.75, 0, 0.12, 0.7);
}

export function poseFight(P, t, ctx) {
  P.fill(0);
  const bob = sin(t * 8.5 + ctx.seed);
  P[HY] = -0.05 + 0.015 * bob;
  rot(P, HIPS, 0, -0.35, 0);
  rot(P, SPINE, -0.08, 0.12, 0);
  rot(P, CHEST, -0.04, 0.12, 0);
  rot(P, HEAD, -0.02, 0.1, 0);
  limb(P, THL, -1, 0.3, 0.2, 0.08);
  limb(P, THR, 1, -0.12, -0.2, 0.1);
  rot(P, SHL, -0.3, 0, 0);
  rot(P, SHR, -0.28, 0, 0);
  rot(P, FTL, 0.0, 0, 0);
  rot(P, FTR, 0.35, 0, 0);
  limb(P, UAL, -1, 0.95 + 0.04 * bob, 0, 0.12);
  limb(P, FAL, -1, 1.95, 0, -0.35);
  limb(P, UAR, 1, 0.72 + 0.04 * bob, 0, 0.14);
  limb(P, FAR, 1, 2.05, 0, -0.35);
}

export function poseSurrender(P, t, ctx) {
  poseIdle(P, t, ctx, 0);
  const br = sin(t * 2.2);
  limb(P, UAR, 1, 2.75 + br * 0.03, 0, 0.42);
  limb(P, UAL, -1, 2.75 + br * 0.03, 0, 0.42);
  limb(P, FAR, 1, 0.45, 0, 0);
  limb(P, FAL, -1, 0.45, 0, 0);
  rot(P, HEAD, -0.12, 0, 0);
}

export const LOOPS = {
  drive: poseDrive,
  sit: poseSit,
  lean: poseLean,
  ko: poseKO,
  dance: poseDance,
  talk: poseTalk,
  spray: poseSpray,
  crouch: poseCrouch,
  fight: poseFight,
  surrender: poseSurrender,
};
export const LOCOMOTION = new Set(['idle', 'walk', 'run']);

// ------------------------------------------------------------------ one-shots
// Keyframes are sparse: { hips: [rx, ry, rz], uaR: [...], ua: [...] (both, mirrored), hy, hz, ... }.
const KEYMAP = {
  hips: HIPS, spine: SPINE, chest: CHEST, neck: NECK, head: HEAD,
  uaL: UAL, faL: FAL, hL: HL, uaR: UAR, faR: FAR, hR: HR,
  thL: THL, shL: SHL, ftL: FTL, thR: THR, shR: SHR, ftR: FTR,
};
const BOTH = { ua: [UAR, UAL], fa: [FAR, FAL], h: [HR, HL], th: [THR, THL], sh: [SHR, SHL], ft: [FTR, FTL] };
const LEFT = new Set([UAL, FAL, HL, THL, SHL, FTL]);

function key(def) {
  const P = newPose();
  for (const [k, v] of Object.entries(def)) {
    if (k === 'hx') P[HX] = v;
    else if (k === 'hy') P[HY] = v;
    else if (k === 'hz') P[HZ] = v;
    else if (BOTH[k]) {
      limb(P, BOTH[k][0], 1, v[0], v[1] || 0, v[2] || 0);
      limb(P, BOTH[k][1], -1, v[0], v[1] || 0, v[2] || 0);
    } else if (KEYMAP[k] !== undefined) {
      const b = KEYMAP[k];
      if (LEFT.has(b)) limb(P, b, -1, v[0], v[1] || 0, v[2] || 0);
      else rot(P, b, v[0], v[1] || 0, v[2] || 0);
    }
  }
  return P;
}
const merge = (...defs) => Object.assign({}, ...defs);

const REST_ARMS = { ua: [0.06, 0, 0.1], fa: [0.2] };
const GUARD = { uaL: [0.95, 0, 0.12], faL: [1.95, 0, -0.35], uaR: [0.72, 0, 0.14], faR: [2.05, 0, -0.35], hips: [0, -0.2, 0], chest: [-0.04, 0.12, 0] };
const STAND = { th: [0.02, 0, 0.05], sh: [-0.04] };

// masks: which channels a one-shot drives (1) versus leaves to the base loop (0)
function makeMask(weights) {
  const m = new Float32Array(POSE_LEN);
  for (let b = 0; b < NB; b++) {
    const w = weights[b] ?? weights.default ?? 0;
    m[b * 3] = m[b * 3 + 1] = m[b * 3 + 2] = w;
  }
  m[HX] = m[HY] = m[HZ] = weights.offset ?? 0;
  m[PROPV] = 0;
  return m;
}
const UPPER = makeMask({ [SPINE]: 0.7, [CHEST]: 1, [NECK]: 1, [HEAD]: 1, [UAL]: 1, [FAL]: 1, [HL]: 1, [UAR]: 1, [FAR]: 1, [HR]: 1, [HIPS]: 0.25 });
const FULL = makeMask({ default: 1, offset: 1 });
const HIT = makeMask({ default: 1, [HIPS]: 0.4, [THL]: 0.25, [THR]: 0.25, [SHL]: 0.25, [SHR]: 0.25, [FTL]: 0.2, [FTR]: 0.2, offset: 0.5 });

function track(keys) {
  return keys.map(([t, def]) => ({ t, pose: key(def) }));
}

export const ONESHOTS = {
  // jab with the lead (left) hand
  punch: {
    mask: UPPER, fadeIn: 0.05, fadeOut: 0.12,
    keys: track([
      [0, GUARD],
      [0.07, merge(GUARD, { uaL: [1.52, 0, 0.02], faL: [0.12, 0, 0], chest: [-0.06, -0.34, 0], spine: [-0.04, -0.12, 0], head: [0, 0.3, 0] })],
      [0.15, merge(GUARD, { uaL: [1.5, 0, 0.02], faL: [0.15, 0, 0], chest: [-0.06, -0.32, 0], spine: [-0.04, -0.1, 0], head: [0, 0.28, 0] })],
      [0.32, GUARD],
    ]),
  },
  // cross with the rear (right) hand
  punch2: {
    mask: UPPER, fadeIn: 0.05, fadeOut: 0.12,
    keys: track([
      [0, GUARD],
      [0.09, merge(GUARD, { uaR: [1.55, 0, 0.0], faR: [0.1, 0, 0], chest: [-0.08, 0.45, 0], spine: [-0.06, 0.16, 0], hips: [0, 0.12, 0], head: [0, -0.35, 0] })],
      [0.18, merge(GUARD, { uaR: [1.52, 0, 0.0], faR: [0.14, 0, 0], chest: [-0.08, 0.42, 0], spine: [-0.06, 0.14, 0], hips: [0, 0.1, 0], head: [0, -0.32, 0] })],
      [0.36, GUARD],
    ]),
  },
  // front push kick with the right leg (combo finisher)
  kick: {
    mask: FULL, fadeIn: 0.06, fadeOut: 0.14,
    keys: track([
      [0, merge(GUARD, STAND)],
      [0.12, merge(GUARD, { thR: [1.5, 0, 0.05], shR: [-1.8], ftR: [-0.2], thL: [-0.05], shL: [-0.22], spine: [0.1], hy: -0.03 })],
      [0.21, merge(GUARD, { thR: [1.45, 0, 0.02], shR: [-0.05], ftR: [-0.45], thL: [-0.08], shL: [-0.12], spine: [0.28], chest: [0.08, 0.1, 0], hz: 0.06, uaR: [-0.25, 0, 0.35], faR: [0.6] })],
      [0.33, merge(GUARD, { thR: [1.42, 0, 0.02], shR: [-0.08], ftR: [-0.4], thL: [-0.08], shL: [-0.12], spine: [0.26], chest: [0.08, 0.1, 0], hz: 0.06, uaR: [-0.25, 0, 0.35], faR: [0.6] })],
      [0.48, merge(GUARD, { thR: [1.1, 0, 0.05], shR: [-1.5], ftR: [-0.1], spine: [0.08] })],
      [0.64, merge(GUARD, STAND)],
    ]),
  },
  hit: {
    mask: HIT, fadeIn: 0.03, fadeOut: 0.16,
    keys: track([
      [0, {}],
      [0.06, { spine: [0.22, 0.15, 0], chest: [0.2, 0.12, 0.05], head: [0.38, -0.25, 0.1], ua: [-0.3, 0, 0.45], fa: [0.6], hz: 0.05, sh: [-0.15] }],
      [0.2, { spine: [0.1, 0.08, 0], chest: [0.08, 0.05, 0], head: [0.12, -0.1, 0.05], ua: [0.2, 0, 0.3], fa: [0.9], hz: 0.02, sh: [-0.1] }],
      [0.4, merge(REST_ARMS, {})],
    ]),
  },
  getup: {
    mask: FULL, fadeIn: 0, fadeOut: 0.22,
    keys: [
      { t: 0, pose: KO_LIE },
      ...track([
        [0.32, { hips: [0.1, 0, 0], hy: -0.7, th: [1.45, 0, 0.15], sh: [-0.3], spine: [-0.32], chest: [-0.1], head: [0.2], ua: [0.2, 0, 0.35], fa: [0.4] }],
        [0.66, { hips: [0.15, 0, 0], hy: -0.44, th: [1.35, 0, 0.1], sh: [-2.15], ft: [0.75], spine: [-0.5], chest: [-0.2], head: [0.4], ua: [0.7, 0, 0.25], fa: [0.7] }],
        [0.96, { hy: -0.06, th: [0.25, 0, 0.05], sh: [-0.35], ft: [0.1], spine: [-0.15], ua: [0.2, 0, 0.15], fa: [0.4] }],
        [1.2, merge(REST_ARMS, STAND)],
      ]),
    ],
  },
  sign: {
    mask: UPPER, fadeIn: 0.1, fadeOut: 0.22,
    keys: track([
      [0, {}],
      [0.18, { uaR: [0.95, 0, -0.32], faR: [1.55, 0, -0.35], hR: [0, 0, 0.35], uaL: [0.8, 0, -0.28], faL: [1.45, 0, -0.4], hL: [0.2, 0, 0.3], chest: [-0.1, 0.08, 0], spine: [-0.06], head: [0.14, 0, -0.12] }],
      [0.3, { uaR: [1.12, 0, -0.3], faR: [1.35, 0, -0.35], hR: [0, 0, 0.35], uaL: [0.95, 0, -0.26], faL: [1.3, 0, -0.4], hL: [0.2, 0, 0.3], chest: [-0.14, 0.08, 0], spine: [-0.08], head: [0.18, 0, -0.14] }],
      [0.75, { uaR: [1.05, 0, -0.3], faR: [1.42, 0, -0.35], hR: [0, 0, 0.35], uaL: [0.9, 0, -0.26], faL: [1.36, 0, -0.4], hL: [0.2, 0, 0.3], chest: [-0.12, 0.1, 0], spine: [-0.07], head: [0.16, 0.05, -0.1] }],
      [1.15, { uaR: [1.1, 0, -0.3], faR: [1.38, 0, -0.35], hR: [0, 0, 0.35], uaL: [0.94, 0, -0.26], faL: [1.32, 0, -0.4], hL: [0.2, 0, 0.3], chest: [-0.13, 0.06, 0], spine: [-0.08], head: [0.17, -0.05, -0.12] }],
      [1.45, REST_ARMS],
    ]),
  },
  cheer: {
    mask: FULL, fadeIn: 0.1, fadeOut: 0.2,
    keys: track([
      [0, STAND],
      [0.15, { ua: [2.7, 0, 0.35], fa: [0.2], hy: 0.01, head: [0.25], ...STAND }],
      [0.35, { ua: [2.3, 0, 0.45], fa: [0.7], hy: -0.05, th: [0.2, 0, 0.05], sh: [-0.4], ft: [0.2], head: [0.1] }],
      [0.55, { ua: [2.85, 0, 0.35], fa: [0.15], hy: 0.02, head: [0.28], ...STAND }],
      [0.75, { ua: [2.3, 0, 0.45], fa: [0.7], hy: -0.05, th: [0.2, 0, 0.05], sh: [-0.4], ft: [0.2], head: [0.1] }],
      [0.98, { ua: [2.8, 0, 0.38], fa: [0.2], hy: 0.01, head: [0.25], ...STAND }],
      [1.3, merge(REST_ARMS, STAND)],
    ]),
  },
  point: {
    mask: UPPER, fadeIn: 0.1, fadeOut: 0.2,
    keys: track([
      [0, REST_ARMS],
      [0.18, { uaR: [1.55, 0, 0.05], faR: [0.05], chest: [0, 0.22, 0], head: [0.05, -0.18, 0], uaL: [0.1, 0, 0.15], faL: [0.3] }],
      [0.85, { uaR: [1.5, 0, 0.05], faR: [0.08], chest: [0, 0.2, 0], head: [0.05, -0.16, 0], uaL: [0.1, 0, 0.15], faL: [0.3] }],
      [1.1, REST_ARMS],
    ]),
  },
  jump: {
    mask: FULL, fadeIn: 0.04, fadeOut: 0.14,
    keys: track([
      [0, { hy: -0.1, th: [0.45], sh: [-0.9], ft: [0.45], spine: [-0.2], ua: [-0.4, 0, 0.15], fa: [0.3] }],
      [0.1, { hy: 0, th: [0.1], sh: [-0.1], ft: [-0.3], ua: [0.9, 0, 0.25], fa: [0.4] }],
      [0.32, { th: [0.9, 0, 0.1], sh: [-1.2], ft: [0.1], ua: [1.1, 0, 0.45], fa: [0.6], spine: [-0.1] }],
      [0.55, { th: [0.5, 0, 0.06], sh: [-0.7], ft: [0.2], ua: [0.6, 0, 0.4], fa: [0.5] }],
      [0.72, { hy: -0.06, th: [0.3, 0, 0.04], sh: [-0.5], ft: [0.2], spine: [-0.1], ua: [0.2, 0, 0.2], fa: [0.3] }],
    ]),
  },
};
for (const k of Object.values(ONESHOTS)) k.dur = k.keys[k.keys.length - 1].t;

/** Evaluate a one-shot track at time t into P (smoothstep between keys). */
export function sampleTrack(P, os, t) {
  const keys = os.keys;
  if (t <= 0) return P.set(keys[0].pose);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const k = smooth((t - a.t) / (b.t - a.t));
      for (let j = 0; j < POSE_LEN; j++) P[j] = a.pose[j] + (b.pose[j] - a.pose[j]) * k;
      return P;
    }
  }
  P.set(keys[keys.length - 1].pose);
  return P;
}

export { KO_LIE };
