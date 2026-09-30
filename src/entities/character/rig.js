// Skeleton layout shared by every character: 18 bones, hierarchy rooted at the hips.
//
//   hips ─ spine ─ chest ─ neck ─ head
//                        ├ upperArmL ─ foreArmL ─ handL
//                        └ upperArmR ─ foreArmR ─ handR ─ prop (spray can, hidden unless used)
//        ├ thighL ─ shinL ─ footL
//        └ thighR ─ shinR ─ footR
//
// Rest pose: standing, arms hanging straight down, all bone rotations zero (so bone inverses are
// pure translations). Joint positions are authored for a 1.8 m adult, then scaled by build.

export const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'foreArmL', 'handL',
  'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
  'prop',
];
export const NB = BONE_NAMES.length;
export const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15, 10];

export const HIPS = 0;
export const SPINE = 1;
export const CHEST = 2;
export const NECK = 3;
export const HEAD = 4;
export const UAL = 5;
export const FAL = 6;
export const HL = 7;
export const UAR = 8;
export const FAR = 9;
export const HR = 10;
export const THL = 11;
export const SHL = 12;
export const FTL = 13;
export const THR = 14;
export const SHR = 15;
export const FTR = 16;
export const PROP = 17;

/** Unit-scale joint positions (model space) for a male / female frame. Float32Array(NB * 3). */
export function unitJoints(female = false, pad = 0) {
  const sh = (female ? 0.215 : 0.235) + pad; // shoulder joint x (pad: puffy jackets push arms out)
  const hx = female ? 0.1 : 0.095; // hip joint x
  const j = new Float32Array(NB * 3);
  const set = (b, x, y, z = 0) => {
    j[b * 3] = x;
    j[b * 3 + 1] = y;
    j[b * 3 + 2] = z;
  };
  set(HIPS, 0, 0.94);
  set(SPINE, 0, 1.04);
  set(CHEST, 0, 1.22);
  set(NECK, 0, 1.47);
  set(HEAD, 0, 1.53);
  set(UAL, -sh, 1.425);
  set(FAL, -(sh + 0.01), 1.15);
  set(HL, -(sh + 0.015), 0.905);
  set(UAR, sh, 1.425);
  set(FAR, sh + 0.01, 1.15);
  set(HR, sh + 0.015, 0.905);
  set(THL, -hx, 0.9);
  set(SHL, -(hx + 0.004), 0.49);
  set(FTL, -(hx + 0.004), 0.085);
  set(THR, hx, 0.9);
  set(SHR, hx + 0.004, 0.49);
  set(FTR, hx + 0.004, 0.085);
  set(PROP, sh + 0.015, 0.84, -0.01);
  return j;
}

/**
 * Per-build scale factors. Height ≈ 1.8 × build; heavier builds also get wider.
 * Head, neck, hands and feet keep closer to height scale so big guys don't get balloon heads.
 * Returns { sy, sx, joints (scaled), scales: Float32Array(NB * 3) }.
 */
export function buildScale(build = 1, female = false, pad = 0) {
  const b = Math.min(1.2, Math.max(0.85, build));
  const sy = b * (female ? 0.955 : 1);
  const sx = sy * (1 + (b - 1) * 0.95) * (female ? 0.96 : 1);
  const unit = unitJoints(female, pad);
  const scales = new Float32Array(NB * 3);
  const joints = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    let s = sx;
    if (i === HEAD) s = sy * (1 + (b - 1) * 0.25) * 1.06; // slightly big heads read better
    else if (i === NECK) s = sy * (1 + (b - 1) * 0.25);
    else if (i === HL || i === HR || i === PROP) s = (sx + sy) / 2;
    else if (i === FTL || i === FTR) s = sy;
    scales[i * 3] = s;
    scales[i * 3 + 1] = i === HEAD || i === NECK || i === FTL || i === FTR || i === HL || i === HR || i === PROP ? s : sy;
    scales[i * 3 + 2] = s;
    joints[i * 3] = unit[i * 3] * sx;
    joints[i * 3 + 1] = unit[i * 3 + 1] * sy;
    joints[i * 3 + 2] = unit[i * 3 + 2] * sx;
  }
  return { sy, sx, unit, joints, scales };
}
