import * as THREE from 'three';
import { MeshBuilder } from './builder.js';
import { rgb, shade, mix, luma } from './palette.js';
import {
  unitJoints, buildScale, HIPS, SPINE, CHEST, NECK, HEAD, UAL, FAL, HL, UAR, FAR, HR, THL, SHL, FTL, THR, SHR, FTR, PROP,
} from './rig.js';

// Builds the single merged, rigid-skinned BufferGeometry for a normalized look (looks.js).
// Authored at unit scale (1.8 m adult, feet at y = 0, facing -Z, right side = +X), then scaled per
// bone for the build. ~500–1100 triangles depending on outfit.

const WHITE = rgb('#f3f2ee');
const BLACK = rgb('#141416');
const GOLD = rgb('#d8ad3c');
const SILVER = rgb('#c9ccd2');
const EYE_WHITE = rgb('#e6e1d6');
const PUPIL = rgb('#1b110b');

// Superellipse front-face factors for sides = 8 lathes (see builder.lathe): the flat front face of
// a ring of full depth d sits at z = oz - fz * d / 2 and spans x = ±fx * w / 2.
function frontFactors(round) {
  const e = 2 / round;
  const a = (247.5 / 180) * Math.PI;
  return { fz: Math.abs(Math.sin(a)) ** e, fx: Math.abs(Math.cos(a)) ** e };
}
const TORSO_ROUND = 3;
const TF = frontFactors(TORSO_ROUND);
const HEAD_ROUND = 3;
const HF = frontFactors(HEAD_ROUND);

// 3x5 pixel digits / letters for jersey numbers and sweatshirt letters (rows top → bottom).
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  N: ['1001', '1101', '1111', '1011', '1001'],
};

// ------------------------------------------------------------------ profiles
// Torso profile rows: [y, width, depth, zOffset]. Sampled into lathe rings per bone segment.
function torsoProfile(L, fit) {
  const f = L.female;
  const extraW = fit.puffy ? 0.055 : fit.oversized ? 0.03 : 0;
  const extraD = fit.puffy ? 0.045 : fit.oversized ? 0.022 : 0;
  const rows = f
    ? [
        [0.76, 0.37, 0.25, 0.005],
        [0.9, 0.365, 0.235, 0.005],
        [0.98, 0.34, 0.215, 0],
        [1.06, 0.3, 0.195, 0],
        [1.15, 0.305, 0.2, -0.004],
        [1.24, 0.335, 0.225, -0.01],
        [1.31, 0.36, 0.25, -0.014],
        [1.37, 0.37, 0.245, -0.01],
        [1.43, 0.37, 0.215, 0],
        [1.475, 0.27, 0.16, 0.005],
      ]
    : [
        [0.76, 0.36, 0.24, 0.005],
        [0.9, 0.345, 0.225, 0.004],
        [0.98, 0.34, 0.215, 0],
        [1.06, 0.33, 0.205, 0],
        [1.15, 0.34, 0.21, -0.002],
        [1.24, 0.37, 0.222, -0.006],
        [1.32, 0.41, 0.235, -0.008],
        [1.4, 0.43, 0.232, -0.004],
        [1.45, 0.41, 0.212, 0.002],
        [1.49, 0.29, 0.165, 0.006],
      ];
  return rows.map(([y, w, d, oz]) => {
    // baggy clothes hang wider toward the hem, shoulders stay closer to the body
    const k = y < 1.3 ? 1 : 0.7;
    return [y, w + extraW * k, d + extraD * k, oz];
  });
}

function sampleProfile(rows, y) {
  if (y <= rows[0][0]) return rows[0];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0]);
      return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  return rows[rows.length - 1];
}

/** Lathe rings for the part of a profile between y0 and y1, split at every row and extra cut. */
function profileRings(rows, y0, y1, cuts = []) {
  const ys = new Set([y0, y1]);
  for (const r of rows) if (r[0] > y0 && r[0] < y1) ys.add(r[0]);
  for (const c of cuts) if (c > y0 + 1e-4 && c < y1 - 1e-4) ys.add(c);
  const sorted = [...ys].sort((a, b) => a - b);
  const h = y1 - y0;
  return {
    y: y0,
    h,
    ys: sorted,
    rings: sorted.map((y) => {
      const s = sampleProfile(rows, y);
      return [(y - y0) / h, s[1], s[2], 0, s[3]];
    }),
  };
}

const frontZ = (rows, y) => {
  const s = sampleProfile(rows, y);
  return s[3] - (TF.fz * s[2]) / 2;
};
const backZ = (rows, y) => {
  const s = sampleProfile(rows, y);
  return s[3] + (TF.fz * s[2]) / 2;
};

// ------------------------------------------------------------------ outfit description
function outfitFit(L) {
  const o = L.outfit;
  const v = L.variant;
  const fit = { oversized: false, puffy: false, hem: 0.9, sleeve: 'short', sleeveEnd: 1.24, sleeveW: 0.125, tucked: false, pad: 0 };
  if (o === 'tee') Object.assign(fit, { oversized: true, hem: 0.78, sleeveEnd: 1.18, sleeveW: 0.155 });
  else if (o === 'jersey') Object.assign(fit, { oversized: true, hem: 0.8, sleeveEnd: 1.23, sleeveW: 0.165, pad: 0.012 });
  else if (o === 'flannel') Object.assign(fit, { oversized: true, hem: 0.8, sleeve: 'long', sleeveW: 0.14 });
  else if (o === 'starter') Object.assign(fit, { puffy: true, hem: 0.86, sleeve: 'long', sleeveW: 0.165, pad: 0.02 });
  else if (o === 'hoodie') Object.assign(fit, { puffy: true, hem: 0.84, sleeve: 'long', sleeveW: 0.155, pad: 0.015 });
  else if (o === 'uniform') Object.assign(fit, { hem: 1.0, tucked: true, sleeveEnd: 1.25, sleeveW: 0.125 });
  else if (o === 'civilian') {
    if (v === 'polo') Object.assign(fit, { hem: 0.9, sleeveEnd: 1.25 });
    else if (v === 'buttonup') Object.assign(fit, { hem: 1.0, tucked: true, sleeveEnd: 1.25 });
    else if (v === 'windbreaker') Object.assign(fit, { puffy: true, hem: 0.86, sleeve: 'long', sleeveW: 0.15, pad: 0.015 });
    else if (v === 'sweatshirt') Object.assign(fit, { hem: 0.88, sleeve: 'long', sleeveW: 0.13 });
    else if (v === 'jacket') Object.assign(fit, { hem: 0.9, sleeve: 'long', sleeveW: 0.13, pad: 0.01 });
    else if (v === 'dress') Object.assign(fit, { hem: 1.0, sleeveEnd: 1.3, sleeveW: 0.11 });
    else if (v === 'overalls') Object.assign(fit, { hem: 1.0, tucked: true, sleeveEnd: 1.25 });
    else Object.assign(fit, { hem: 0.9, sleeveEnd: 1.25 });
  }
  return fit;
}

/** Shoulder pad width the rig needs for this look (puffy jackets push the arms out). */
export function shoulderPad(L) {
  return outfitFit(L).pad;
}

// ------------------------------------------------------------------ build
export function buildCharacterGeometry(L) {
  const b = new MeshBuilder();
  const fit = outfitFit(L);
  const J = unitJoints(L.female, fit.pad);
  const c = {
    L,
    J,
    fit,
    jx: (bone) => J[bone * 3],
    jy: (bone) => J[bone * 3 + 1],
    skin: rgb(L.skin),
    shirt: rgb(L.shirt),
    shirt2: rgb(L.shirt2),
    pants: rgb(L.pants),
    shoes: rgb(L.shoes),
    laces: rgb(L.laces),
    hair: rgb(L.hairColor),
    hatColor: rgb(L.hatColor),
    band: L.bandana ? rgb(L.bandana) : null,
  };
  c.rows = torsoProfile(L, fit);
  c.hatOn = L.hat !== 'none' || L.hoodUp;

  buildHead(b, c);
  buildHair(b, c);
  buildHat(b, c);
  buildFace(b, c);
  b.lathe(NECK, { x: 0, y: 1.43, z: 0.005, h: 0.13, w: 0.1, d: 0.1, sides: 6, round: 2, color: shade(c.skin, 0.94), capTop: false, capBottom: false });
  buildPelvis(b, c);
  buildTorso(b, c);
  buildArms(b, c);
  buildLegs(b, c);
  buildShoes(b, c);
  buildAccessories(b, c);
  buildProp(b, c);

  const { joints, scales } = buildScale(L.build, L.female, fit.pad);
  b.scaleByBone(J, joints, scales);
  return b.toGeometry();
}

// ------------------------------------------------------------------ head
const HEAD_Y = 1.535;
const HEAD_H = 0.255;
const HEAD_W = 0.205;
const HEAD_D = 0.235;
const HEAD_RINGS = [
  [0.0, 0.6, 0.66, 0, -0.012],
  [0.2, 0.86, 0.9, 0, -0.004],
  [0.5, 1.0, 1.0, 0, 0],
  [0.7, 1.0, 1.0, 0, 0.002],
  [0.84, 0.97, 0.98, 0, 0.004],
  [1.0, 0.8, 0.84, 0, 0.008],
];

/** Head surface z at the front for a height y (features sit just in front of it). */
function headFrontZ(y) {
  const t = (y - HEAD_Y) / HEAD_H;
  let sz = HEAD_RINGS[0][2];
  let oz = HEAD_RINGS[0][4];
  for (let i = 0; i < HEAD_RINGS.length - 1; i++) {
    const a = HEAD_RINGS[i];
    const q = HEAD_RINGS[i + 1];
    if (t >= a[0] && t <= q[0]) {
      const k = (t - a[0]) / (q[0] - a[0]);
      sz = a[2] + (q[2] - a[2]) * k;
      oz = a[4] + (q[4] - a[4]) * k;
    }
  }
  return 0.005 + oz - (HF.fz * (HEAD_D * sz)) / 2;
}

function buildHead(b, c) {
  const { L } = c;
  const skin = c.skin;
  const hair = c.hair;
  const style = L.hair;
  const covered = c.hatOn;
  const fem = ['ponytail', 'long', 'bun', 'braids'].includes(style);
  const fadeMix = (t) => mix(skin, hair, t);
  b.lathe(HEAD, {
    x: 0,
    y: HEAD_Y,
    z: 0.005,
    h: HEAD_H,
    w: HEAD_W,
    d: HEAD_D,
    sides: 8,
    round: HEAD_ROUND,
    rings: HEAD_RINGS,
    fn: (band, dx, dz) => {
      const front = dz < -0.6;
      const back = dz > 0.6;
      if (style === 'bald') return band >= 3 ? shade(skin, 1.03) : skin;
      if (band === 4) return hair;
      if (band === 3) {
        if (front) return skin;
        if (style === 'fade' || style === 'hightop') return fadeMix(0.62);
        return hair;
      }
      if (band === 2) {
        if (fem || style === 'afro' || style === 'cornrows' || style === 'curly') return back ? hair : dz > 0 && !covered ? mix(skin, hair, 0.5) : skin;
        if (style === 'fade' || style === 'hightop') return back ? fadeMix(0.38) : skin;
      }
      if (band === 1 && fem && back) return hair;
      return skin;
    },
    capTopColor: style === 'bald' ? shade(skin, 1.04) : hair,
    capBottom: false,
  });
}

function buildFace(b, c) {
  const { L } = c;
  const skin = c.skin;
  const f = L.female;
  const dark = luma(skin) < 0.12;
  const hint = [0, 1.66, 0];
  // eyes
  const ey0 = 1.667;
  const ey1 = 1.69;
  const ez = headFrontZ(1.68) - 0.0012;
  for (const s of [-1, 1]) {
    const x0 = s * 0.019;
    const x1 = s * 0.05;
    b.quad(HEAD, [x0, ey0, ez], [x1, ey0, ez], [x1, ey1, ez], [x0, ey1, ez], EYE_WHITE, hint);
    const px0 = s * 0.027;
    const px1 = s * 0.042;
    const pz = ez - 0.0008;
    b.quad(HEAD, [px0, ey0 + 0.001, pz], [px1, ey0 + 0.001, pz], [px1, ey1 - 0.002, pz], [px0, ey1 - 0.002, pz], PUPIL, hint);
    // eyelid / socket shadow above the eye
    b.quad(HEAD, [s * 0.017, ey1, ez], [s * 0.052, ey1, ez], [s * 0.052, ey1 + 0.006, ez], [s * 0.017, ey1 + 0.006, ez], shade(skin, 0.78), hint);
    // brows
    const bz = headFrontZ(1.705) - 0.004;
    b.box(HEAD, { x: s * 0.035, y: 1.703, z: bz, w: 0.04, h: f ? 0.007 : 0.011, d: 0.008, color: mix(c.hair, BLACK, 0.3) });
    // ears
    b.box(HEAD, { x: s * 0.101, y: 1.662, z: 0.012, w: 0.024, h: 0.056, d: 0.042, color: shade(skin, 0.9), top: [0.8, 0.9] });
    if (L.earrings) b.box(HEAD, { x: s * 0.106, y: 1.627, z: 0.004, w: 0.012, h: f ? 0.022 : 0.012, d: 0.012, color: GOLD });
  }
  // nose
  const nz = headFrontZ(1.645);
  b.box(HEAD, { x: 0, y: 1.646, z: nz - 0.011, w: 0.03, h: 0.048, d: 0.026, color: shade(skin, dark ? 0.86 : 0.9), top: [0.55, 0.45], topShiftZ: 0.008 });
  // mouth
  const mz = headFrontZ(1.603) - 0.0012;
  const lip = f ? mix(skin, rgb('#6e1f2a'), 0.55) : mix(skin, rgb('#2a1210'), 0.5);
  const my1 = f ? 1.611 : 1.608;
  b.quad(HEAD, [-0.027, 1.597, mz], [0.027, 1.597, mz], [0.027, my1, mz], [-0.027, my1, mz], lip, [0, 1.62, 0]);
  // facial hair
  if (L.beard === 'goatee' || L.beard === 'chin') {
    const gz = headFrontZ(1.56);
    b.box(HEAD, { x: 0, y: 1.557, z: gz + 0.003, w: 0.05, h: 0.04, d: 0.02, color: c.hair, top: [1.1, 1] });
  }
  if (L.beard === 'goatee' || L.beard === 'mustache') {
    b.box(HEAD, { x: 0, y: 1.618, z: headFrontZ(1.618) - 0.004, w: 0.06, h: 0.011, d: 0.01, color: c.hair });
  }
  // Locs-style wrap-around shades
  if (L.shades) {
    const sz = headFrontZ(1.68) - 0.007;
    b.box(HEAD, { x: 0, y: 1.681, z: sz, w: 0.14, h: 0.03, d: 0.012, color: rgb('#0b0b0e'), faces: { top: rgb('#2a2a30') } });
    for (const s of [-1, 1]) b.box(HEAD, { x: s * 0.085, y: 1.684, z: sz + 0.035, w: 0.03, h: 0.02, d: 0.075, color: rgb('#0b0b0e') });
  }
}

// ------------------------------------------------------------------ hair
function buildHair(b, c) {
  const { L } = c;
  const style = L.hair;
  const hair = c.hair;
  const hatOn = c.hatOn;
  const hairDark = shade(hair, 0.8);
  if (style === 'hightop' && !hatOn) {
    b.lathe(HEAD, { x: 0, y: 1.755, z: 0.012, h: 0.165, w: 0.19, d: 0.205, sides: 8, round: 3.4, rings: [[0, 0.94, 0.94], [0.6, 1.0, 1.0], [1, 1.04, 1.02, 0, 0.004]], color: hair, capTopColor: shade(hair, 1.12), capBottom: false });
  } else if (style === 'afro' && !hatOn) {
    const rj = (k, i) => 1 + (((k * 7 + i * 13) % 5) - 2) * 0.022;
    b.lathe(HEAD, {
      x: 0, y: 1.6, z: 0.03, h: 0.32, w: 0.31, d: 0.32, sides: 10, round: 2,
      rings: [[0, 0.76, 0.8], [0.3, 1.0, 1.0], [0.62, 1.02, 1.02], [0.86, 0.84, 0.86], [1, 0.5, 0.52]],
      rfn: rj,
      // leave the face open below the brow
      fn: (band, dx, dz) => (band <= 1 && dz < -0.45 ? null : band === 0 ? hairDark : hair),
      capTopColor: shade(hair, 1.1),
      capBottom: false,
      inner: shade(hair, 0.55),
    });
  } else if (style === 'curly' && !hatOn) {
    const rj = (k, i) => 1 + (((k * 5 + i * 11) % 4) - 1.5) * 0.03;
    b.lathe(HEAD, { x: 0, y: 1.71, z: 0.01, h: 0.1, w: 0.225, d: 0.25, sides: 8, round: 2.5, rings: [[0, 1.0, 1.0], [0.55, 0.98, 0.98], [1, 0.62, 0.66]], rfn: rj, color: hair, capTopColor: shade(hair, 1.12), capBottom: false, fn: (band, dx, dz) => (band === 0 && dz < -0.6 ? shade(hair, 0.9) : hair) });
  } else if (style === 'cornrows' && !hatOn) {
    // rows running front to back over the scalp: alternating braid / parting colors
    const cx = 0;
    const cy = 1.66;
    const cz = 0.008;
    const rx = 0.106;
    const ry = 0.137;
    const rz = 0.121;
    const part = mix(c.skin, hair, 0.12);
    b.surface(HEAD, 9, 5, (u, v) => {
      const phi = (u - 0.5) * 2.3; // across, radians from the top
      const th = -1.05 + v * 2.45; // front (-) to back (+)
      const s = 1.04;
      return [cx + Math.sin(phi) * rx * s, cy + Math.cos(phi) * Math.cos(th) * ry * s, cz + Math.cos(phi) * Math.sin(th) * rz * s];
    }, (iu) => (iu % 2 === 0 ? hair : part), [cx, cy, cz]);
  }

  // longer styles (female) — these still show under a hat
  if (style === 'ponytail') {
    const m = new THREE.Matrix4().makeRotationX(0.35).setPosition(0, 1.73, 0.12);
    b.lathe(HEAD, { x: 0, y: -0.2, z: 0, h: 0.2, w: 0.07, d: 0.06, sides: 6, round: 2, rings: [[0, 0.3, 0.3], [0.5, 1.0, 1.0], [0.85, 0.9, 0.9], [1, 0.7, 0.7]], color: hair, m });
    b.box(HEAD, { x: 0, y: 1.735, z: 0.118, w: 0.05, h: 0.028, d: 0.04, color: c.shirt2 });
  } else if (style === 'long') {
    b.box(HEAD, { x: 0, y: 1.58, z: 0.098, w: 0.2, h: 0.36, d: 0.065, color: hair, top: [1.05, 1.1], faces: { bottom: hairDark } });
    for (const s of [-1, 1]) b.box(HEAD, { x: s * 0.098, y: 1.62, z: 0.02, w: 0.03, h: 0.25, d: 0.12, color: hair, faces: { bottom: hairDark } });
  } else if (style === 'bun') {
    b.lathe(HEAD, { x: 0, y: 1.745, z: 0.1, h: 0.085, w: 0.09, d: 0.09, sides: 6, round: 2, rings: [[0, 0.7, 0.7], [0.5, 1, 1], [1, 0.6, 0.6]], color: hair });
  } else if (style === 'braids') {
    for (let i = 0; i < 6; i++) {
      const a = -1.1 + (i / 5) * 2.2;
      const x = Math.sin(a) * 0.1;
      const z = Math.cos(a) * 0.1 + 0.02;
      b.lathe(HEAD, { x, y: 1.4, z, h: 0.32, w: 0.026, d: 0.026, sides: 4, color: i % 2 ? hair : hairDark });
    }
  }
}

// ------------------------------------------------------------------ hats
function buildHat(b, c) {
  const { L } = c;
  const hc = c.hatColor;
  if (L.hoodUp) {
    const hood = c.shirt;
    b.lathe(HEAD, {
      x: 0, y: 1.48, z: 0.025, h: 0.38, w: 0.28, d: 0.3, sides: 8, round: 2.6,
      rings: [[0, 1.0, 0.95], [0.45, 1.02, 1.0], [0.78, 0.9, 0.92], [1, 0.46, 0.5, 0, 0.01]],
      fn: (band, dx, dz) => (band <= 1 && dz < -0.5 ? null : band === 1 && dz < 0 ? shade(hood, 0.85) : hood),
      capTopColor: hood,
      capBottom: false,
      inner: shade(hood, 0.45),
    });
    return;
  }
  if (L.hat === 'cap') {
    const back = L.capBack;
    b.lathe(HEAD, {
      x: 0, y: 1.728, z: 0.006, h: 0.105, w: 0.218, d: 0.248, sides: 8, round: 2.4,
      rings: [[0, 1.0, 1.0], [0.45, 0.98, 0.98, 0, back ? -0.004 : 0.004], [1, 0.7, 0.74, 0, back ? -0.012 : 0.014]],
      color: hc,
      capTopColor: shade(hc, 1.08),
      capBottom: false,
    });
    b.box(HEAD, { x: 0, y: 1.838, z: 0.004, w: 0.022, h: 0.012, d: 0.022, color: shade(hc, 0.8) });
    // flat brim with a green under-brim, the classic snapback
    const brim = new THREE.Matrix4().makeRotationX(back ? -0.18 : 0.1).setPosition(0, 1.742, back ? 0.17 : -0.162);
    b.box(HEAD, { x: 0, y: 0, z: 0, w: 0.19, h: 0.012, d: 0.125, color: hc, faces: { bottom: rgb('#3f5b3a') }, m: brim });
    // front panel patch (at the back when worn backwards) + the snap strap gap
    const pz = back ? 0.126 : -0.124;
    b.box(HEAD, { x: 0, y: 1.785, z: pz, w: 0.06, h: 0.036, d: 0.006, color: luma(hc) > 0.45 ? BLACK : WHITE });
    b.box(HEAD, { x: 0, y: 1.742, z: back ? -0.123 : 0.124, w: 0.05, h: 0.016, d: 0.006, color: c.hair });
  } else if (L.hat === 'beanie') {
    b.lathe(HEAD, {
      x: 0, y: 1.698, z: 0.006, h: 0.155, w: 0.216, d: 0.246, sides: 8, round: 2.6,
      rings: [[0, 1.02, 1.02], [0.26, 1.03, 1.03], [0.3, 0.99, 0.99], [0.7, 0.9, 0.92], [1, 0.52, 0.56]],
      fn: (band) => (band === 0 ? shade(hc, 0.82) : band === 1 ? shade(hc, 0.9) : hc),
      capTopColor: shade(hc, 1.05),
      capBottom: false,
    });
  } else if (L.hat === 'bandana') {
    const rag = c.band || hc;
    const edge = mix(rag, WHITE, 0.55);
    b.lathe(HEAD, {
      x: 0, y: 1.7, z: 0.006, h: 0.118, w: 0.214, d: 0.244, sides: 8, round: 2.8,
      rings: [[0, 1.0, 1.0], [0.1, 1.0, 1.0], [0.55, 0.98, 0.98], [1, 0.72, 0.78, 0, 0.006]],
      fn: (band) => (band === 0 ? edge : rag),
      capTopColor: shade(rag, 1.06),
      capBottom: false,
    });
    // knot and tails at the back
    b.box(HEAD, { x: 0, y: 1.715, z: 0.128, w: 0.045, h: 0.035, d: 0.03, color: shade(rag, 0.85) });
    for (const s of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationZ(s * 0.35).setPosition(s * 0.022, 1.66, 0.14);
      b.box(HEAD, { x: 0, y: 0, z: 0, w: 0.035, h: 0.085, d: 0.01, color: rag, m });
    }
  } else if (L.hat === 'police') {
    b.lathe(HEAD, {
      x: 0, y: 1.725, z: 0.008, h: 0.125, w: 0.214, d: 0.244, sides: 8, round: 2.6,
      rings: [[0, 1.02, 1.02], [0.3, 1.02, 1.02], [0.34, 1.05, 1.05], [0.82, 1.15, 1.16, 0, -0.006], [1, 1.12, 1.13, 0, -0.004]],
      fn: (band) => (band <= 1 ? rgb('#0b0c10') : hc),
      capTopColor: shade(hc, 1.1),
      capBottom: false,
    });
    const visor = new THREE.Matrix4().makeRotationX(0.32).setPosition(0, 1.735, -0.148);
    b.box(HEAD, { x: 0, y: 0, z: 0, w: 0.185, h: 0.01, d: 0.09, color: rgb('#08090b'), m: visor });
    b.box(HEAD, { x: 0, y: 1.79, z: -0.134, w: 0.032, h: 0.038, d: 0.008, color: GOLD });
  }
}

// ------------------------------------------------------------------ torso
function buildPelvis(b, c) {
  const { L, fit } = c;
  if (L.pantsStyle === 'skirt') {
    const skirtCol = L.variant === 'dress' ? c.shirt : c.pants;
    b.lathe(HIPS, {
      x: 0, y: 0.56, z: 0.008, h: 0.47, w: 1, d: 1, sides: 8, round: 2.4,
      rings: [[0, 0.46, 0.4], [0.12, 0.44, 0.37], [0.6, 0.37, 0.26], [1, 0.34, 0.215]],
      fn: (band) => (band === 0 ? shade(skirtCol, 0.8) : skirtCol),
      capTop: false,
      capBottomColor: shade(skirtCol, 0.35),
    });
    return;
  }
  const pantsTop = fit.tucked ? 1.04 : 1.02;
  b.lathe(HIPS, {
    x: 0, y: 0.8, z: 0.004, h: pantsTop - 0.8, w: 1, d: 1, sides: 8, round: 2.8,
    rings: [[0, 0.33, 0.215], [0.6, 0.34, 0.215], [1, 0.335, 0.21]],
    color: c.pants,
    capTop: false,
    capBottomColor: shade(c.pants, 0.6),
  });
  if (fit.tucked) {
    const belt = L.outfit === 'uniform' ? rgb('#0c0c0e') : rgb('#3a2616');
    b.lathe(HIPS, { x: 0, y: 0.975, z: 0.004, h: 0.05, w: 0.348, d: 0.228, sides: 8, round: 2.8, color: belt, capTop: false, capBottom: false });
    b.box(HIPS, { x: 0, y: 1.0, z: -0.117, w: 0.04, h: 0.032, d: 0.01, color: L.outfit === 'uniform' ? SILVER : GOLD });
  }
}

/** Front-face strip on the torso between y0 and y1 (split per bone), half widths hw0 → hw1. */
function frontStrip(b, c, y0, y1, hw0, hw1, color, out = 0.004) {
  const segs = [
    [HIPS, -1, 1.03],
    [SPINE, 1.0, 1.25],
    [CHEST, 1.22, 2],
  ];
  const rows = c.rows;
  for (const [bone, lo, hi] of segs) {
    const a = Math.max(y0, lo);
    const e = Math.min(y1, hi);
    if (e <= a) continue;
    const ys = [a];
    for (const r of rows) if (r[0] > a && r[0] < e) ys.push(r[0]);
    ys.push(e);
    for (let i = 0; i < ys.length - 1; i++) {
      const ya = ys[i];
      const yb = ys[i + 1];
      const wa = hw0 + (hw1 - hw0) * ((ya - y0) / (y1 - y0));
      const wb = hw0 + (hw1 - hw0) * ((yb - y0) / (y1 - y0));
      const za = frontZ(rows, ya) - out;
      const zb = frontZ(rows, yb) - out;
      b.quad(bone, [-wa, ya, za], [wa, ya, za], [wb, yb, zb], [-wb, yb, zb], color, [0, (ya + yb) / 2, 0]);
    }
  }
}

/**
 * 3x5 pixel glyph as quads on a plane at z. front = true for text on the front of the body: seen
 * from the front the viewer's left is +X, so columns run toward -X.
 */
function glyph(b, bone, ch, cx, cy, px, z, color, front = true) {
  const g = GLYPHS[ch];
  if (!g) return;
  const hint = [cx, cy, front ? z + 1 : z - 1];
  for (let row = 0; row < 5; row++) {
    const line = g[row];
    const w = line.length;
    const half = w / 2;
    let col = 0;
    while (col < w) {
      if (line[col] !== '1') {
        col++;
        continue;
      }
      let end = col;
      while (end + 1 < w && line[end + 1] === '1') end++;
      const x0 = front ? cx + (half - 1 - end) * px : cx + (col - half) * px;
      const x1 = front ? cx + (half - col) * px : cx + (end + 1 - half) * px;
      const y1 = cy + (2.5 - row) * px;
      const y0 = y1 - px;
      b.quad(bone, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], color, hint);
      col = end + 1;
    }
  }
}

function buildTorso(b, c) {
  const { L, fit } = c;
  const rows = c.rows;
  const o = L.outfit;
  const v = L.variant;
  const S = c.shirt;
  const S2 = c.shirt2;
  const hem = fit.hem;
  const cuts = [];
  let color = (y) => (y < hem + 0.04 ? shade(S, 0.9) : S);
  if (hem < 0.99) cuts.push(hem + 0.04);

  if (o === 'starter') {
    cuts.push(hem + 0.045, hem + 0.055, hem + 0.065, 1.33, 1.345, 1.395, 1.41);
    color = (y) => {
      if (y < hem + 0.045) return S2;
      if (y < hem + 0.055) return WHITE;
      if (y < hem + 0.065) return S2;
      if (y > 1.33 && y < 1.345) return WHITE;
      if (y > 1.345 && y < 1.395) return S2;
      if (y > 1.395 && y < 1.41) return WHITE;
      return y > 1.42 ? shade(S, 1.07) : S;
    };
  } else if (o === 'flannel') {
    for (let y = hem + 0.06; y < 1.47; y += 0.062) cuts.push(y);
    const mid = mix(S, S2, 0.5);
    const dark = mix(S, S2, 0.86);
    color = (y, band, dx, dz, k) => {
      const row = Math.floor((y - hem) / 0.062) % 2 === 0;
      const col = k % 2 === 0;
      return row && col ? dark : row || col ? mid : S;
    };
  } else if (o === 'jersey') {
    cuts.push(hem + 0.05);
    color = (y) => (y < hem + 0.05 ? shade(S, 0.88) : S);
  } else if (o === 'hoodie') {
    cuts.push(hem + 0.06);
    color = (y) => (y < hem + 0.06 ? shade(S, 0.78) : S);
  } else if (o === 'uniform') {
    color = (y) => (y > 1.43 ? shade(S, 1.05) : S);
  } else if (o === 'civilian') {
    if (v === 'tshirt') {
      cuts.push(1.29, 1.36);
      color = (y) => (y > 1.29 && y < 1.36 ? S2 : y < hem + 0.04 ? shade(S, 0.9) : S);
    } else if (v === 'buttonup') {
      color = (y, band, dx, dz, k) => (k % 2 === 0 ? mix(S, S2, 0.35) : S);
    } else if (v === 'windbreaker') {
      cuts.push(1.12, 1.3, hem + 0.05);
      const third = luma(S) > 0.5 && luma(S2) > 0.5 ? rgb('#2a2a4a') : WHITE;
      color = (y) => (y < hem + 0.05 ? shade(S2, 0.8) : y < 1.12 ? S : y < 1.3 ? S2 : third);
    } else if (v === 'sweatshirt') {
      cuts.push(hem + 0.05);
      color = (y) => (y < hem + 0.05 ? shade(S, 0.82) : S);
    }
  }

  const topY = rows[rows.length - 1][0];
  const segs = [
    [HIPS, hem, 1.035],
    [SPINE, Math.max(hem, 1.0), 1.25],
    [CHEST, 1.22, topY],
  ];
  for (const [bone, y0, y1] of segs) {
    if (y1 <= y0 + 0.01) continue;
    const pr = profileRings(rows, y0, y1, cuts);
    b.lathe(bone, {
      x: 0, y: pr.y, z: 0, h: pr.h, w: 1, d: 1, sides: 8, round: TORSO_ROUND,
      rings: pr.rings,
      fn: (band, dx, dz, k) => color((pr.ys[band] + pr.ys[band + 1]) / 2, band, dx, dz, k),
      capTop: bone === CHEST,
      capTopColor: shade(color(1.47, 99, 0, 0, 1), 1.04),
      capBottom: bone === HIPS || (bone === SPINE && hem >= 1.0),
      capBottomColor: shade(S, 0.5),
    });
  }

  // ---- outfit details
  if (o === 'starter') {
    // snap placket, ribbed stand-up collar
    frontStrip(b, c, hem, 1.44, 0.009, 0.009, shade(S, 0.7));
    b.lathe(CHEST, { x: 0, y: topY - 0.035, z: 0.004, h: 0.07, w: 0.2, d: 0.18, sides: 8, round: 2.6, rings: [[0, 1, 1], [0.5, 1, 1], [1, 0.98, 0.98]], fn: (band) => (band === 0 ? S2 : WHITE), capTop: false, capBottom: false });
  } else if (o === 'tee' || (o === 'civilian' && (v === 'tshirt' || v === 'overalls' || v === 'dress'))) {
    const ring = v === 'tshirt' ? S2 : shade(S, 0.88);
    b.lathe(CHEST, { x: 0, y: topY - 0.012, z: 0.004, h: 0.022, w: 0.15, d: 0.135, sides: 8, round: 2.2, color: ring, capTop: false, capBottom: false });
  } else if (o === 'flannel') {
    // open below the top button: the white tee shows through
    frontStrip(b, c, hem + 0.002, 1.37, 0.058, 0.012, WHITE, 0.003);
    b.lathe(CHEST, { x: 0, y: topY - 0.02, z: 0.004, h: 0.045, w: 0.18, d: 0.16, sides: 8, round: 2.4, color: mix(S, S2, 0.5), capTop: false, capBottom: false });
    b.box(CHEST, { x: 0, y: 1.39, z: frontZ(rows, 1.39) - 0.006, w: 0.012, h: 0.012, d: 0.006, color: WHITE });
  } else if (o === 'jersey') {
    // V-neck trim, big numbers front and back
    const vz = frontZ(rows, 1.44) - 0.004;
    b.tri(CHEST, [-0.055, 1.472, vz + 0.02], [0.055, 1.472, vz + 0.02], [0, 1.39, frontZ(rows, 1.39) - 0.004], S2, [0, 1.43, 0]);
    b.tri(CHEST, [-0.03, 1.472, vz + 0.018], [0.03, 1.472, vz + 0.018], [0, 1.415, frontZ(rows, 1.415) - 0.005], shade(S, 0.6), [0, 1.43, 0]);
    const num = String(L.number);
    const n = num.length;
    const px = 0.024;
    const dw = px * 3.8;
    const fz = frontZ(rows, 1.3) - 0.005;
    for (let i = 0; i < n; i++) glyph(b, CHEST, num[i], ((n - 1) * dw) / 2 - i * dw, 1.3, px, fz, S2, true);
    const pxB = 0.03;
    const dwB = pxB * 3.8;
    const bz = backZ(rows, 1.28) + 0.005;
    for (let i = 0; i < n; i++) glyph(b, CHEST, num[i], -((n - 1) * dwB) / 2 + i * dwB, 1.28, pxB, bz, S2, false);
  } else if (o === 'hoodie') {
    // kangaroo pocket, drawstrings, hood lying on the back
    const pz = frontZ(rows, 1.06) - 0.012;
    b.box(SPINE, { x: 0, y: 1.08, z: pz, w: 0.26, h: 0.13, d: 0.03, color: shade(S, 0.9), top: [0.82, 1], faces: { bottom: shade(S, 0.55) } });
    for (const s of [-1, 1]) b.box(CHEST, { x: s * 0.04, y: 1.38, z: frontZ(rows, 1.38) - 0.006, w: 0.012, h: 0.13, d: 0.008, color: S2 });
    if (!L.hoodUp) {
      b.lathe(CHEST, { x: 0, y: 1.39, z: 0.105, h: 0.12, w: 0.28, d: 0.12, sides: 8, round: 2.4, rings: [[0, 0.7, 0.8], [0.5, 1, 1], [1, 0.85, 0.8, 0, -0.01]], color: S, capTopColor: shade(S, 0.62), capBottomColor: S });
    }
  } else if (o === 'uniform') {
    for (const s of [-1, 1]) {
      b.box(CHEST, { x: s * 0.095, y: 1.345, z: frontZ(rows, 1.345) - 0.006, w: 0.1, h: 0.035, d: 0.012, color: shade(S, 0.82) });
      b.box(CHEST, { x: s * 0.17, y: 1.47, z: 0.0, w: 0.09, h: 0.014, d: 0.07, color: shade(S, 0.8) });
    }
    b.box(CHEST, { x: -0.095, y: 1.39, z: frontZ(rows, 1.39) - 0.008, w: 0.042, h: 0.05, d: 0.008, color: GOLD, top: [0.7, 1] });
    b.box(CHEST, { x: 0.095, y: 1.305, z: frontZ(rows, 1.305) - 0.006, w: 0.065, h: 0.016, d: 0.006, color: SILVER });
    b.box(CHEST, { x: -0.13, y: 1.43, z: frontZ(rows, 1.43) - 0.012, w: 0.035, h: 0.05, d: 0.03, color: BLACK });
    frontStrip(b, c, 1.0, 1.46, 0.006, 0.006, shade(S, 0.75));
    b.lathe(CHEST, { x: 0, y: topY - 0.03, z: 0.004, h: 0.06, w: 0.18, d: 0.16, sides: 8, round: 2.4, color: shade(S, 0.9), capTop: false, capBottom: false });
  } else if (o === 'civilian') {
    if (v === 'polo' || v === 'buttonup' || v === 'jacket') {
      // collar flaps
      const cz = frontZ(rows, 1.45);
      for (const s of [-1, 1]) {
        b.tri(CHEST, [s * 0.012, 1.44, cz - 0.004], [s * 0.085, 1.49, cz + 0.035], [s * 0.07, 1.41, cz - 0.002], shade(S, 1.05), [0, 1.43, 0.05]);
      }
      if (v === 'jacket') frontStrip(b, c, hem, 1.42, 0.06, 0.03, S2, 0.004);
      else frontStrip(b, c, v === 'polo' ? 1.33 : 1.0, 1.45, 0.012, 0.012, shade(S, 0.85));
      if (v === 'polo') for (const y of [1.36, 1.41]) b.box(CHEST, { x: 0, y, z: frontZ(rows, y) - 0.007, w: 0.008, h: 0.008, d: 0.004, color: WHITE });
      if (v === 'buttonup') b.box(CHEST, { x: 0.1, y: 1.35, z: frontZ(rows, 1.35) - 0.005, w: 0.08, h: 0.07, d: 0.008, color: shade(S, 0.9) });
    } else if (v === 'windbreaker') {
      frontStrip(b, c, hem, 1.44, 0.006, 0.006, shade(S, 0.6));
      b.lathe(CHEST, { x: 0, y: topY - 0.03, z: 0.004, h: 0.06, w: 0.19, d: 0.17, sides: 8, round: 2.4, color: shade(S2, 0.85), capTop: false, capBottom: false });
    } else if (v === 'sweatshirt') {
      b.lathe(CHEST, { x: 0, y: topY - 0.014, z: 0.004, h: 0.024, w: 0.16, d: 0.14, sides: 8, round: 2.2, color: shade(S, 0.82), capTop: false, capBottom: false });
      if (L.shirt === '#c8202a') glyph(b, CHEST, 'N', 0, 1.3, 0.03, frontZ(rows, 1.3) - 0.005, WHITE, true);
      else frontStrip(b, c, 1.27, 1.33, 0.075, 0.075, S2, 0.004);
    } else if (v === 'overalls') {
      // denim bib + one strap down (very 1993)
      frontStrip(b, c, 1.0, 1.35, 0.11, 0.1, c.pants, 0.006);
      const lz = frontZ(rows, 1.42) - 0.006;
      const z35 = frontZ(rows, 1.35) - 0.006;
      b.quad(CHEST, [-0.1, 1.35, z35], [-0.07, 1.35, z35], [-0.1, 1.47, lz + 0.03], [-0.13, 1.47, lz + 0.03], c.pants, [-0.1, 1.4, 0]);
      b.box(CHEST, { x: -0.085, y: 1.345, z: z35 - 0.004, w: 0.016, h: 0.016, d: 0.006, color: GOLD });
      b.box(HIPS, { x: 0.12, y: 0.9, z: -0.1, w: 0.03, h: 0.2, d: 0.012, color: c.pants, m: new THREE.Matrix4().makeRotationZ(0.15) });
    }
  }
}

// ------------------------------------------------------------------ arms
function buildArms(b, c) {
  const { L, fit } = c;
  const o = L.outfit;
  const skin = c.skin;
  let sleeveCol = c.shirt;
  let cuff = shade(c.shirt, 0.85);
  let stripes = null;
  if (o === 'starter') {
    sleeveCol = c.shirt2;
    cuff = c.shirt2;
    stripes = WHITE;
  } else if (o === 'jersey') {
    stripes = c.shirt2;
  } else if (o === 'civilian' && L.variant === 'windbreaker') {
    sleeveCol = c.shirt2;
    cuff = shade(c.shirt, 0.9);
  }
  const plaid = o === 'flannel';
  const mid = mix(c.shirt, c.shirt2, 0.5);
  const dark = mix(c.shirt, c.shirt2, 0.86);
  const plaidFn = (band, dx, dz, k) => {
    const row = band % 2 === 0;
    const col = k % 2 === 0;
    return row && col ? dark : row || col ? mid : c.shirt;
  };

  for (const [UA, FA, H, s] of [[UAL, FAL, HL, -1], [UAR, FAR, HR, 1]]) {
    const ux = c.jx(UA);
    const fx = c.jx(FA);
    const hx = c.jx(H);
    const sw = fit.sleeveW;
    if (fit.sleeve === 'long') {
      const n = plaid ? 6 : 3;
      const rings = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        rings.push([t, 0.86 + t * 0.14, 0.9 + t * 0.1]);
      }
      b.lathe(UA, { x: ux, y: 1.12, z: 0, h: 0.37, w: sw, d: sw * 1.02, sides: 6, round: 2.2, rings, fn: plaid ? plaidFn : null, color: sleeveCol, capBottom: false, capTopColor: sleeveCol });
      const frings = [[0, 0.72, 0.72], [0.18, 0.72, 0.72], [0.2, 0.9, 0.9], [1, 1, 1]];
      if (plaid) frings.splice(3, 0, [0.45, 0.94, 0.94], [0.7, 0.97, 0.97]);
      b.lathe(FA, {
        x: fx, y: 0.915, z: -0.004, h: 0.27, w: sw * 0.9, d: sw * 0.92, sides: 6, round: 2.2, rings: frings,
        fn: (band, dx, dz, k) => (band === 0 ? cuff : plaid ? plaidFn(band, dx, dz, k) : sleeveCol),
        capBottomColor: shade(cuff, 0.6),
        capTop: false,
      });
      if (stripes) b.lathe(FA, { x: fx, y: 0.94, z: -0.004, h: 0.012, w: sw * 0.93, d: sw * 0.95, sides: 6, round: 2.2, color: WHITE, capTop: false, capBottom: false });
    } else {
      // short sleeve over a bare upper arm
      const y0 = fit.sleeveEnd;
      const sleeveRings = stripes
        ? [[0, 1, 1], [0.14, 1, 1], [0.2, 1, 1], [0.3, 1, 1], [0.36, 1, 1], [1, 0.92, 0.92]]
        : [[0, 1, 1], [1, 0.9, 0.9]];
      b.lathe(UA, {
        x: ux, y: y0, z: 0, h: 1.47 - y0, w: sw, d: sw * 1.02, sides: 6, round: 2.2,
        rings: sleeveRings,
        fn: (band) => (stripes && (band === 1 || band === 3) ? stripes : sleeveCol),
        capBottomColor: shade(sleeveCol, 0.55),
        capTopColor: sleeveCol,
      });
      b.lathe(UA, { x: ux, y: 1.12, z: 0, h: y0 - 1.12 + 0.03, w: 0.085, d: 0.09, sides: 6, round: 2, color: skin, capTop: false, capBottomColor: skin });
      if (o === 'uniform') b.box(UA, { x: ux + s * (sw / 2 - 0.004), y: 1.38, z: 0, w: 0.01, h: 0.07, d: 0.055, color: rgb('#c9a646') });
      b.lathe(FA, { x: fx, y: 0.91, z: -0.004, h: 0.27, w: 0.078, d: 0.08, sides: 6, round: 2, rings: [[0, 0.82, 0.82], [0.6, 1, 1], [1, 1.02, 1.02]], color: skin, capTop: false, capBottomColor: skin });
    }
    // fist + thumb
    b.box(H, { x: hx, y: 0.855, z: -0.006, w: 0.072, h: 0.105, d: 0.088, color: skin, top: [1.05, 0.95], faces: { bottom: shade(skin, 0.85) } });
    b.box(H, { x: hx - s * 0.03, y: 0.87, z: -0.042, w: 0.024, h: 0.05, d: 0.026, color: shade(skin, 0.96) });
    if (o === 'uniform' && s === -1) b.box(H, { x: hx, y: 0.93, z: 0, w: 0.082, h: 0.02, d: 0.088, color: SILVER });
  }
}

// ------------------------------------------------------------------ legs
function buildLegs(b, c) {
  const { L } = c;
  const ps = L.pantsStyle;
  const P = c.pants;
  const skin = c.skin;
  const crease = shade(P, ps === 'jeans' ? 1.1 : 1.18);
  const legFn = (band, dx, dz) => (dz < -0.8 && (ps === 'dickies' || ps === 'slacks' || ps === 'jeans') ? crease : P);
  for (const [TH, SH] of [[THL, SHL], [THR, SHR]]) {
    const tx = c.jx(TH);
    const sx = c.jx(SH);
    if (ps === 'skirt') {
      b.lathe(TH, { x: tx, y: 0.46, z: 0, h: 0.5, w: 0.13, d: 0.135, sides: 6, round: 2, rings: [[0, 0.8, 0.8], [1, 1, 1]], color: skin, capTop: false });
      b.lathe(SH, { x: sx, y: 0.06, z: 0.005, h: 0.46, w: 0.1, d: 0.105, sides: 6, round: 2, rings: [[0, 0.66, 0.7], [0.55, 1, 1.05, 0, 0.008], [1, 0.9, 0.9]], color: skin, capTop: false, capBottom: false });
      continue;
    }
    const baggy = ps === 'jeans' || ps === 'dickies' ? 1 : ps === 'shorts' ? 1.08 : 0.85;
    if (ps === 'shorts') {
      b.lathe(TH, { x: tx, y: 0.5, z: 0, h: 0.47, w: 0.19 * baggy, d: 0.195 * baggy, sides: 8, round: 2.5, rings: [[0, 1.02, 1.02], [1, 1, 1]], color: P, capTop: false, capBottomColor: shade(P, 0.5) });
      b.lathe(SH, { x: sx, y: 0.06, z: 0.005, h: 0.49, w: 0.1, d: 0.105, sides: 6, round: 2, rings: [[0, 0.95, 0.95], [0.5, 1.02, 1.08, 0, 0.008], [1, 1, 1]], fn: (band) => (band === 0 ? WHITE : skin), capTop: false, capBottom: false });
      continue;
    }
    b.lathe(TH, { x: tx, y: 0.45, z: 0, h: 0.52, w: 0.175 * baggy, d: 0.185 * baggy, sides: 8, round: 2.5, rings: [[0, 0.92, 0.92], [0.5, 0.97, 0.98], [1, 1.04, 1.06]], fn: legFn, capTop: false, capBottom: false });
    const hemW = ps === 'slacks' ? 0.135 : 0.172;
    b.lathe(SH, {
      x: sx, y: 0.052, z: 0.004, h: 0.48, w: hemW, d: hemW * 1.06, sides: 8, round: 2.5,
      rings: [[0, 1.02, 1.02], [0.1, 1.0, 1.0], [0.18, 0.93, 0.95], [1, 0.95, 0.97]],
      fn: (band, dx, dz) => (band === 0 ? shade(P, 0.85) : legFn(band, dx, dz)),
      capTop: false,
      capBottomColor: shade(P, 0.35),
    });
  }
}

// ------------------------------------------------------------------ shoes
function buildShoes(b, c) {
  const { L } = c;
  const style = L.shoeStyle;
  const up = c.shoes;
  const lace = c.laces;
  for (const [FT, s] of [[FTL, -1], [FTR, 1]]) {
    const x = c.jx(FT);
    if (style === 'hightop') {
      b.lathe(FT, { x, y: 0, z: -0.06, h: 0.036, w: 0.114, d: 0.285, sides: 4, rings: [[0, 1, 1], [0.5, 1, 1], [0.7, 1, 1], [1, 1, 1]], fn: (band) => (band === 1 ? rgb('#1c1c1e') : rgb('#f4f3ee')), capBottomColor: rgb('#6a6a66'), capTop: false });
      b.box(FT, { x, y: 0.058, z: -0.14, w: 0.108, h: 0.045, d: 0.115, color: up, faces: { front: rgb('#f4f3ee') }, top: [0.95, 0.85], topShiftZ: 0.01 });
      b.box(FT, { x, y: 0.11, z: 0.012, w: 0.108, h: 0.15, d: 0.15, color: up, top: [0.96, 0.9] });
      b.box(FT, { x, y: 0.12, z: -0.064, w: 0.036, h: 0.1, d: 0.008, color: lace });
      b.box(FT, { x: x + s * 0.055, y: 0.13, z: 0.02, w: 0.004, h: 0.03, d: 0.03, color: rgb('#f4f3ee') });
    } else if (style === 'runner') {
      b.lathe(FT, { x, y: 0, z: -0.055, h: 0.038, w: 0.112, d: 0.28, sides: 4, rings: [[0, 1, 1], [0.35, 1, 1], [1, 1, 1]], fn: (band) => (band === 0 ? rgb('#8a8a86') : rgb('#f2f1ec')), capBottomColor: rgb('#4a4a48'), capTop: false });
      b.box(FT, { x, y: 0.058, z: -0.13, w: 0.104, h: 0.04, d: 0.12, color: up, top: [0.9, 0.7], topShiftZ: 0.02 });
      b.box(FT, { x, y: 0.075, z: 0.0, w: 0.104, h: 0.075, d: 0.15, color: up, top: [0.94, 0.9] });
      b.box(FT, { x, y: 0.114, z: -0.04, w: 0.04, h: 0.008, d: 0.07, color: lace });
      // side stripe
      for (const q of [-1, 1]) {
        const xx = x + q * 0.0535;
        b.quad(FT, [xx, 0.045, -0.12], [xx, 0.045, 0.02], [xx, 0.085, 0.06], [xx, 0.085, -0.04], lace, [x, 0.06, -0.03]);
      }
    } else if (style === 'boot') {
      b.box(FT, { x, y: 0.02, z: -0.055, w: 0.13, h: 0.04, d: 0.29, color: rgb('#3a2616'), faces: { bottom: rgb('#1e140c') } });
      b.box(FT, { x, y: 0.075, z: -0.135, w: 0.122, h: 0.07, d: 0.125, color: up, top: [0.94, 0.8], topShiftZ: 0.012 });
      b.box(FT, { x, y: 0.13, z: 0.01, w: 0.12, h: 0.18, d: 0.15, color: up, top: [0.95, 0.92] });
      b.box(FT, { x, y: 0.215, z: 0.01, w: 0.126, h: 0.025, d: 0.155, color: shade(up, 0.7) });
      b.box(FT, { x, y: 0.15, z: -0.066, w: 0.034, h: 0.12, d: 0.006, color: shade(up, 0.55) });
    } else {
      b.box(FT, { x, y: 0.011, z: -0.055, w: 0.104, h: 0.022, d: 0.275, color: rgb('#111113') });
      b.box(FT, { x, y: 0.055, z: -0.03, w: 0.1, h: 0.07, d: 0.21, color: up, top: [0.9, 0.85], topShiftZ: 0.01 });
      b.box(FT, { x, y: 0.042, z: -0.155, w: 0.092, h: 0.042, d: 0.06, color: up, top: [0.9, 0.7] });
    }
  }
}

// ------------------------------------------------------------------ accessories & prop
function buildAccessories(b, c) {
  const { L, fit } = c;
  const rows = c.rows;
  // rag hanging from the back pocket
  if (c.band && L.hat !== 'bandana' && L.outfit !== 'uniform' && L.pantsStyle !== 'skirt') {
    const side = L.bandanaSide === 'right' ? 1 : -1;
    const x = side * 0.1;
    const top = Math.min(0.9, fit.hem + 0.03);
    const bz = fit.hem < 0.9 ? backZ(rows, fit.hem) + 0.012 : 0.118;
    const rag = c.band;
    const speck = mix(rag, WHITE, 0.6);
    const len = 0.21;
    const hw = 0.052;
    const P = (u, v) => [x + (u - 0.5) * 2 * hw * (1 - v * 0.75), top - v * len, bz + v * 0.02];
    const colorFn = (iu, iv) => ((iu + iv) % 3 === 1 && iv > 0 ? speck : iv === 0 ? shade(rag, 0.8) : rag);
    b.surface(HIPS, 2, 3, P, colorFn, [x, top - 0.1, bz - 0.5]);
    b.surface(HIPS, 2, 3, (u, v) => {
      const p = P(u, v);
      p[2] -= 0.004;
      return p;
    }, shade(rag, 0.7), [x, top - 0.1, bz + 0.5]);
  }
  if (L.chain) {
    const z0 = frontZ(rows, 1.38) - 0.008;
    const zt = frontZ(rows, 1.47) + 0.04;
    for (const s of [-1, 1]) b.quad(CHEST, [s * 0.065, 1.478, zt], [s * 0.078, 1.474, zt], [s * 0.01, 1.372, z0], [0, 1.378, z0], GOLD, [0, 1.42, 0.1]);
    b.box(CHEST, { x: 0, y: 1.36, z: z0 - 0.002, w: 0.028, h: 0.03, d: 0.008, color: GOLD });
    b.lathe(CHEST, { x: 0, y: 1.488, z: 0.012, h: 0.01, w: 0.16, d: 0.14, sides: 8, round: 2, color: GOLD, capTop: false, capBottom: false });
  }
  if (L.pager) {
    const y = fit.hem >= 0.95 ? 0.96 : fit.hem - 0.04;
    b.box(HIPS, { x: 0.165, y, z: -0.035, w: 0.022, h: 0.055, d: 0.04, color: rgb('#18181b'), faces: { top: rgb('#6f8f5a') } });
  }
  if (L.outfit === 'uniform') {
    // duty belt pouches and a radio (no firearms anywhere in the game)
    b.box(HIPS, { x: 0.175, y: 0.955, z: 0.0, w: 0.04, h: 0.08, d: 0.07, color: BLACK });
    b.box(HIPS, { x: -0.175, y: 0.96, z: -0.02, w: 0.035, h: 0.06, d: 0.05, color: BLACK });
    b.box(HIPS, { x: -0.1, y: 0.955, z: 0.12, w: 0.05, h: 0.05, d: 0.03, color: BLACK });
  }
}

function buildProp(b, c) {
  // spray can along the hand's local Z (vertical when the arm is raised toward a wall)
  const x = c.jx(PROP);
  const y = c.jy(PROP);
  const capCol = c.band || c.shirt2;
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, y, -0.01);
  b.lathe(PROP, { x: 0, y: -0.07, z: 0, h: 0.13, w: 0.05, d: 0.05, sides: 6, round: 2, rings: [[0, 1, 1], [0.82, 1, 1], [1, 0.7, 0.7]], color: rgb('#b9bdc6'), capTopColor: SILVER, m });
  b.box(PROP, { x: 0, y: 0.075, z: 0, w: 0.03, h: 0.025, d: 0.03, color: capCol, m: m.clone() });
}
