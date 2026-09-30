import * as THREE from 'three';
import { GeoBuilder, SLOT } from './vehicles/builder.js';
import { getAtlas } from './vehicles/atlas.js';

// Procedural low-poly 1993 street cars (ARCHITECTURE.md §16).
//
// Every model is built once as a merged triangle soup (body, glass, chrome, lamps, plates and
// decals in ONE geometry). Per car paint schemes re-use the cached position/normal/uv buffers and
// only add their own color + shine attributes, so 100 cars of 9 models cost ~9 base geometries.
// Wheels are NOT part of the body: all wheels of all cars are one shared InstancedMesh (fx.js).
//
// Model space: faces -Z, +X = passenger side, ground at y = 0.

export const VEHICLE_MODELS = ['sedan', 'coupe', 'lowrider', 'wagon', 'pickup', 'hatch', 'van', 'police', 'bus'];

// ------------------------------------------------------------------ shared face specs
const P = { slot: SLOT.paint };
const UP = { slot: SLOT.upper };
const ROOF = { slot: SLOT.roof };
const HOOD = { slot: SLOT.hood };
const DOOR = { slot: SLOT.door };
const FENDER = { slot: SLOT.fender };
const STRIPE = { slot: SLOT.stripe, jitter: false };
const STRIPE2 = { slot: SLOT.stripe2, jitter: false };
const RUST = { slot: SLOT.rust, jitter: false };
const TTOP = { slot: SLOT.ttop, jitter: false };
const GLASS = { color: '#16202a', shine: 0.72 };
const CHROME = { color: '#d9dde2', shine: 1.0 };
const DULLCHROME = { color: '#9ea4aa', shine: 0.7 };
const BLACK = { color: '#141516', shine: 0.14 };
const RUBBER = { color: '#0c0c0d', shine: 0.03 };
const UNDER = { color: '#101010', shine: 0.0 };
const ARCH = { color: '#070707', shine: 0.0 };
const GAP = { color: '#0b0b0c', shine: 0.0 };

let _atlasUv = null;
const uv = (name) => {
  if (!_atlasUv) _atlasUv = getAtlas().uv;
  return _atlasUv(name);
};
const lens = () => ({ color: '#f3f5f2', shine: 0.32, uv: uv('head') });
const red = () => ({ color: '#b3141c', shine: 0.45, uv: uv('tail') });
const amber = () => ({ color: '#e0841a', shine: 0.45, uv: uv('tail') });
const plate = (i) => ({ color: '#ffffff', shine: 0.3, uv: uv(`plate${i % 4}`) });

// ------------------------------------------------------------------ model specs
// lights (model space): head, tail (also brake), turnF/turnR ([left, right]), rev, bar (police)
export const MODELS = {
  sedan: {
    label: 'Full-size sedan',
    length: 5.4, width: 1.96, height: 1.43, wheelbase: 2.95,
    axleF: -1.55, axleR: 1.4, wheelR: 0.36, wheelW: 0.24,
    mass: 1750, accel: 7.2, top: 37, brake: 15, grip: 8.5, steer: 0.62,
    lights: {
      head: [[-0.66, 0.7, -2.72], [0.66, 0.7, -2.72]],
      tail: [[-0.64, 0.72, 2.72], [0.64, 0.72, 2.72]],
      turnF: [[-0.8, 0.47, -2.84], [0.8, 0.47, -2.84]],
      turnR: [[-0.86, 0.72, 2.72], [0.86, 0.72, 2.72]],
      rev: [[-0.3, 0.72, 2.72], [0.3, 0.72, 2.72]],
    },
  },
  coupe: {
    label: 'G-body coupe',
    length: 5.08, width: 1.84, height: 1.38, wheelbase: 2.74,
    axleF: -1.42, axleR: 1.32, wheelR: 0.35, wheelW: 0.23,
    mass: 1500, accel: 8.4, top: 40, brake: 16, grip: 9, steer: 0.64,
    lights: {
      head: [[-0.6, 0.7, -2.56], [0.6, 0.7, -2.56]],
      tail: [[-0.56, 0.72, 2.56], [0.56, 0.72, 2.56]],
      turnF: [[-0.74, 0.46, -2.66], [0.74, 0.46, -2.66]],
      turnR: [[-0.78, 0.72, 2.56], [0.78, 0.72, 2.56]],
      rev: [[-0.24, 0.72, 2.56], [0.24, 0.72, 2.56]],
    },
  },
  lowrider: {
    label: "'60s lowrider hardtop",
    length: 5.35, width: 2.0, height: 1.28, wheelbase: 3.02,
    axleF: -1.52, axleR: 1.5, wheelR: 0.33, wheelW: 0.2,
    mass: 1800, accel: 6.4, top: 31, brake: 13, grip: 7.6, steer: 0.6,
    lights: {
      head: [[-0.64, 0.7, -2.7], [0.64, 0.7, -2.7]],
      tail: [[-0.62, 0.7, 2.7], [0.62, 0.7, 2.7]],
      turnF: [[-0.8, 0.46, -2.8], [0.8, 0.46, -2.8]],
      turnR: [[-0.82, 0.7, 2.7], [0.82, 0.7, 2.7]],
      rev: [[-0.2, 0.52, 2.78], [0.2, 0.52, 2.78]],
    },
  },
  wagon: {
    label: 'Wood-panel wagon',
    length: 5.55, width: 1.98, height: 1.46, wheelbase: 2.95,
    axleF: -1.6, axleR: 1.35, wheelR: 0.36, wheelW: 0.24,
    mass: 1900, accel: 6.2, top: 34, brake: 14, grip: 8, steer: 0.58,
    lights: {
      head: [[-0.66, 0.7, -2.8], [0.66, 0.7, -2.8]],
      tail: [[-0.84, 0.74, 2.8], [0.84, 0.74, 2.8]],
      turnF: [[-0.8, 0.47, -2.92], [0.8, 0.47, -2.92]],
      turnR: [[-0.84, 0.62, 2.8], [0.84, 0.62, 2.8]],
      rev: [[-0.84, 0.86, 2.8], [0.84, 0.86, 2.8]],
    },
  },
  pickup: {
    label: 'Square-body pickup',
    length: 5.3, width: 2.0, height: 1.84, wheelbase: 3.25,
    axleF: -1.6, axleR: 1.65, wheelR: 0.4, wheelW: 0.26,
    mass: 1950, accel: 7.0, top: 35, brake: 14, grip: 7.8, steer: 0.58,
    lights: {
      head: [[-0.8, 0.95, -2.67], [0.8, 0.95, -2.67]],
      tail: [[-0.9, 1.0, 2.66], [0.9, 1.0, 2.66]],
      turnF: [[-0.66, 0.7, -2.8], [0.66, 0.7, -2.8]],
      turnR: [[-0.9, 1.1, 2.66], [0.9, 1.1, 2.66]],
      rev: [[-0.9, 0.9, 2.66], [0.9, 0.9, 2.66]],
    },
  },
  hatch: {
    label: 'Economy hatchback',
    length: 4.1, width: 1.62, height: 1.35, wheelbase: 2.42,
    axleF: -1.2, axleR: 1.22, wheelR: 0.31, wheelW: 0.2,
    mass: 1050, accel: 6.6, top: 33, brake: 15, grip: 9.4, steer: 0.68,
    lights: {
      head: [[-0.52, 0.67, -2.08], [0.52, 0.67, -2.08]],
      tail: [[-0.58, 0.7, 2.08], [0.58, 0.7, 2.08]],
      turnF: [[-0.66, 0.42, -2.17], [0.66, 0.42, -2.17]],
      turnR: [[-0.66, 0.7, 2.08], [0.66, 0.7, 2.08]],
      rev: [[-0.44, 0.7, 2.08], [0.44, 0.7, 2.08]],
    },
  },
  van: {
    label: 'Conversion van',
    length: 5.2, width: 2.02, height: 2.05, wheelbase: 3.1,
    axleF: -1.45, axleR: 1.65, wheelR: 0.38, wheelW: 0.25,
    mass: 2200, accel: 5.4, top: 31, brake: 13, grip: 7.0, steer: 0.56,
    lights: {
      head: [[-0.72, 0.94, -2.62], [0.72, 0.94, -2.62]],
      tail: [[-0.93, 1.05, 2.62], [0.93, 1.05, 2.62]],
      turnF: [[-0.72, 0.62, -2.72], [0.72, 0.62, -2.72]],
      turnR: [[-0.93, 1.25, 2.62], [0.93, 1.25, 2.62]],
      rev: [[-0.93, 0.88, 2.62], [0.93, 0.88, 2.62]],
    },
  },
  police: {
    label: 'OPD cruiser',
    length: 4.92, width: 1.84, height: 1.56, wheelbase: 2.72,
    axleF: -1.38, axleR: 1.34, wheelR: 0.35, wheelW: 0.23,
    mass: 1650, accel: 9.6, top: 45, brake: 17, grip: 10, steer: 0.64,
    lights: {
      head: [[-0.56, 0.7, -2.47], [0.56, 0.7, -2.47]],
      tail: [[-0.58, 0.82, 2.48], [0.58, 0.82, 2.48]],
      turnF: [[-0.76, 0.6, -2.4], [0.76, 0.6, -2.4]],
      turnR: [[-0.8, 0.82, 2.46], [0.8, 0.82, 2.46]],
      rev: [[-0.2, 0.82, 2.48], [0.2, 0.82, 2.48]],
      bar: [[-0.33, 1.52, 0.2], [0.33, 1.52, 0.2]],
    },
  },
  bus: {
    label: 'MAT city bus',
    length: 12.0, width: 2.55, height: 3.2, wheelbase: 6.9,
    axleF: -3.55, axleR: 3.35, wheelR: 0.5, wheelW: 0.3, rearWheelW: 0.52,
    mass: 11000, accel: 3.4, top: 22, brake: 9, grip: 6.5, steer: 0.52,
    lights: {
      head: [[-0.92, 0.86, -6.06], [0.92, 0.86, -6.06]],
      tail: [[-1.0, 0.95, 6.03], [1.0, 0.95, 6.03]],
      turnF: [[-1.12, 0.86, -6.06], [1.12, 0.86, -6.06]],
      turnR: [[-1.0, 1.2, 6.03], [1.0, 1.2, 6.03]],
      rev: [[-0.75, 0.95, 6.03], [0.75, 0.95, 6.03]],
    },
  },
};

// derived per-model data: wheel list and collision circles
for (const [key, m] of Object.entries(MODELS)) {
  m.key = key;
  const hw = m.width / 2;
  const inset = key === 'lowrider' ? 0.03 : -0.02; // lowriders tuck their skinny wires in
  const wf = m.wheelW;
  const wr = m.rearWheelW || m.wheelW;
  m.wheels = [
    { x: -(hw - wf / 2 + inset), z: m.axleF, r: m.wheelR, w: wf, front: true, left: true },
    { x: hw - wf / 2 + inset, z: m.axleF, r: m.wheelR, w: wf, front: true, left: false },
    { x: -(hw - wr / 2 + inset), z: m.axleR, r: m.wheelR, w: wr, front: false, left: true },
    { x: hw - wr / 2 + inset, z: m.axleR, r: m.wheelR, w: wr, front: false, left: false },
  ];
  const n = m.length > 8 ? 5 : 3;
  const cr = Math.min(hw * 1.02, m.length / (n * 1.6));
  m.circleR = Math.max(cr, hw * 0.92);
  m.circles = [];
  for (let i = 0; i < n; i++) m.circles.push(-(m.length / 2 - m.circleR) + (i * (m.length - 2 * m.circleR)) / (n - 1));
  m.radius = Math.hypot(m.length / 2, hw);
  m.inertia = (m.mass * (m.length * m.length + m.width * m.width)) / 12;
}

// ------------------------------------------------------------------ helpers
/** Build sections from compact rows [z, y0, y1, w0, w1]. */
const S = (rows) => rows.map(([z, y0, y1, w0, w1 = w0]) => ({ z, y0, y1, w0, w1 }));

function arches(b, m, x, yBottom, pad = 0.06) {
  for (const z of [m.axleF, m.axleR]) {
    for (const side of [-1, 1]) b.arch(side, x, z, m.wheelR, m.wheelR + pad, yBottom, ARCH);
  }
}

function doorGaps(b, x, zs, y0, y1) {
  for (const z of zs) {
    for (const side of [-1, 1]) b.beam([side * (x + 0.003), y0, z], [side * (x + 0.003), y1, z], 0.014, GAP, 0.004);
  }
}

function sideTrim(b, x, y, z0, z1, spec = CHROME, t = 0.03) {
  for (const side of [-1, 1]) b.beam([side * x, y, z0], [side * x, y, z1], t, spec);
}

function mirrors(b, x, y, z, spec = CHROME) {
  for (const side of [-1, 1]) {
    b.box(side * (x + 0.05), y, z, 0.09, 0.09, 0.14, spec);
    b.beam([side * (x - 0.02), y - 0.04, z + 0.03], [side * (x + 0.04), y - 0.02, z + 0.02], 0.025, BLACK);
  }
}

function handles(b, x, y, zs) {
  for (const z of zs) b.box2(x + 0.008, y, z, 0.018, 0.028, 0.13, CHROME);
}

/** Pillar beams from belt to roof on both flanks. pts: [[xBelt, yBelt, zBelt], [xRoof, yRoof, zRoof]]. */
function pillar(b, lo, hi, t, spec) {
  b.beam([-lo[0], lo[1], lo[2]], [-hi[0], hi[1], hi[2]], t, spec);
  b.beam([lo[0], lo[1], lo[2]], [hi[0], hi[1], hi[2]], t, spec);
}

/** Standard two-tier lower body + upper body loft. seg rules decide slots. */
function tiers(b, lower, upper, rules = {}) {
  b.loft(lower, (kind, i, side) => {
    if (kind === 'top') return null;
    if (kind === 'bottom') return UNDER;
    return rules.lowerSide ? rules.lowerSide(i, side, kind) : P;
  });
  b.loft(upper, (kind, i, side) => {
    if (kind === 'bottom') return null;
    if (kind === 'top') return rules.top ? rules.top(i) : P;
    if (kind === 'side') return rules.side ? rules.side(i, side) : UP;
    return rules.cap ? rules.cap(kind) : UP;
  });
}

// ------------------------------------------------------------------ model builders
function buildSedan(b, m, opt) {
  tiers(
    b,
    S([
      [-2.7, 0.42, 0.6, 0.92],
      [-2.6, 0.34, 0.6, 0.975],
      [2.6, 0.34, 0.6, 0.975],
      [2.7, 0.44, 0.6, 0.92],
    ]),
    S([
      [-2.7, 0.6, 0.8, 0.92, 0.9],
      [-2.6, 0.6, 0.86, 0.975, 0.965],
      [-1.2, 0.6, 0.92, 0.975, 0.965],
      [0.2, 0.6, 0.92, 0.975, 0.965],
      [1.48, 0.6, 0.92, 0.975, 0.965],
      [2.6, 0.6, 0.9, 0.975, 0.965],
      [2.7, 0.6, 0.84, 0.92, 0.9],
    ]),
    {
      top: (i) => (i === 1 ? HOOD : i === 2 || i === 3 ? null : P),
      side: (i, side) => (i === 1 && side > 0 ? FENDER : i === 2 && side < 0 ? DOOR : UP),
    },
  );
  // greenhouse
  b.loft(
    S([
      [-1.2, 0.92, 0.935, 0.965, 0.955],
      [-0.42, 0.92, 1.4, 0.965, 0.8],
      [0.2, 0.92, 1.415, 0.965, 0.8],
      [0.82, 0.92, 1.42, 0.965, 0.8],
      [1.48, 0.92, 0.935, 0.965, 0.955],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front' || kind === 'back') return null;
      if (kind === 'top') return i === 0 || i === 3 ? GLASS : ROOF;
      return i === 3 ? ROOF : GLASS;
    },
  );
  pillar(b, [0.962, 0.935, -1.19], [0.8, 1.4, -0.42], 0.06, UP);
  pillar(b, [0.964, 0.93, 0.2], [0.8, 1.415, 0.2], 0.075, UP);
  sideTrim(b, 0.968, 0.925, -1.18, 1.46, CHROME, 0.022);
  sideTrim(b, 0.802, 1.41, -0.42, 0.82, CHROME, 0.022);
  sideTrim(b, 0.978, 0.6, -2.52, 2.52, CHROME, 0.03);
  doorGaps(b, 0.975, [-1.2, 0.2, 1.48], 0.36, 0.92);
  handles(b, 0.975, 0.83, [-0.05, 1.28]);
  mirrors(b, 0.97, 0.99, -1.08);
  arches(b, m, 0.975, 0.33);
  // front: grille, quad square headlights, chrome bumper
  b.box(0, 0.7, -2.703, 0.94, 0.2, 0.012, CHROME);
  b.endDecal(true, 0, 0.7, -2.712, 0.84, 0.15, { color: '#ffffff', shine: 0.5, uv: uv(opt.grille || 'grilleCrate') });
  for (const s of [-1, 1]) {
    b.box(s * 0.66, 0.7, -2.703, 0.46, 0.19, 0.012, CHROME);
    b.endDecal(true, s * 0.56, 0.7, -2.712, 0.17, 0.14, lens());
    b.endDecal(true, s * 0.77, 0.7, -2.712, 0.17, 0.14, lens());
    b.box(s * 0.52, 0.47, -2.84, 0.08, 0.18, 0.06, RUBBER);
    b.endDecal(true, s * 0.8, 0.47, -2.832, 0.22, 0.07, amber());
  }
  b.box(0, 0.47, -2.76, 2.0, 0.2, 0.14, CHROME);
  b.endDecal(true, 0, 0.47, -2.832, 0.3, 0.15, plate(opt.plate));
  b.box(0, 0.88, -2.5, 0.03, 0.05, 0.08, CHROME); // hood ornament
  b.beam([0.84, 0.88, -1.45], [0.84, 1.36, -1.49], 0.01, BLACK); // fender antenna
  // rear
  for (const s of [-1, 1]) {
    b.endDecal(false, s * 0.64, 0.72, 2.704, 0.54, 0.18, red());
    b.endDecal(false, s * 0.3, 0.72, 2.704, 0.1, 0.12, lens());
  }
  b.endDecal(false, 0, 0.72, 2.704, 0.3, 0.15, plate(opt.plate + 1));
  b.box(0, 0.47, 2.76, 2.0, 0.2, 0.14, CHROME);
  b.cylinder('z', 0.55, 0.33, 2.74, 0.035, 0.22, 6, BLACK, null);
}

function buildCoupe(b, m, opt) {
  tiers(
    b,
    S([
      [-2.54, 0.4, 0.58, 0.86],
      [-2.46, 0.32, 0.58, 0.915],
      [2.46, 0.32, 0.58, 0.915],
      [2.54, 0.42, 0.58, 0.86],
    ]),
    S([
      [-2.54, 0.58, 0.8, 0.86, 0.84],
      [-2.46, 0.58, 0.84, 0.915, 0.905],
      [-1.05, 0.58, 0.9, 0.915, 0.905],
      [0.4, 0.58, 0.9, 0.915, 0.905],
      [1.12, 0.58, 0.915, 0.915, 0.905],
      [2.46, 0.58, 0.92, 0.915, 0.905],
      [2.54, 0.58, 0.85, 0.86, 0.84],
    ]),
    {
      top: (i) => (i === 1 ? HOOD : i === 2 || i === 3 ? null : P),
      side: (i, side) => (i === 1 && side > 0 ? FENDER : i === 2 && side < 0 ? DOOR : UP),
    },
  );
  b.loft(
    S([
      [-1.05, 0.9, 0.915, 0.905, 0.895],
      [-0.3, 0.9, 1.37, 0.905, 0.76],
      [0.3, 0.9, 1.375, 0.905, 0.76],
      [0.62, 0.9, 1.37, 0.905, 0.76],
      [1.12, 0.9, 0.918, 0.905, 0.895],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front' || kind === 'back') return null;
      if (kind === 'top') return i === 0 || i === 3 ? GLASS : ROOF;
      return i <= 1 ? GLASS : ROOF;
    },
  );
  // T-top panels (glass on T-top schemes, roof color otherwise)
  for (const s of [-1, 1]) {
    const x0 = s * 0.07;
    const x1 = s * 0.66;
    b.quad([x0, 1.378, -0.24], [x1, 1.376, -0.24], [x1, 1.378, 0.46], [x0, 1.38, 0.46], TTOP, [0, 1, 0]);
  }
  pillar(b, [0.9, 0.915, -1.04], [0.76, 1.37, -0.3], 0.055, BLACK);
  sideTrim(b, 0.906, 0.905, -1.04, 1.1, CHROME, 0.02);
  sideTrim(b, 0.918, 0.58, -2.4, 2.4, BLACK, 0.035);
  doorGaps(b, 0.913, [-1.05, 0.4], 0.34, 0.9);
  handles(b, 0.913, 0.8, [0.22]);
  mirrors(b, 0.9, 0.97, -0.95, BLACK);
  arches(b, m, 0.913, 0.32);
  // front: split grille, dual rectangular lamps
  b.box(0, 0.7, -2.543, 0.62, 0.19, 0.012, CHROME);
  for (const s of [-1, 1]) {
    b.endDecal(true, s * 0.17, 0.7, -2.552, 0.26, 0.15, { color: '#ffffff', shine: 0.5, uv: uv('grilleCrate') });
    b.box(s * 0.6, 0.7, -2.543, 0.44, 0.18, 0.012, CHROME);
    b.endDecal(true, s * 0.6, 0.7, -2.552, 0.38, 0.13, lens());
    b.endDecal(true, s * 0.74, 0.46, -2.672, 0.22, 0.06, amber());
  }
  b.box(0, 0.46, -2.6, 1.86, 0.18, 0.14, CHROME);
  b.endDecal(true, 0, 0.46, -2.672, 0.3, 0.15, plate(opt.plate));
  // rear
  for (const s of [-1, 1]) {
    b.endDecal(false, s * 0.56, 0.72, 2.544, 0.62, 0.16, red());
    b.endDecal(false, s * 0.24, 0.72, 2.544, 0.08, 0.12, lens());
  }
  b.endDecal(false, 0, 0.72, 2.544, 0.3, 0.15, plate(opt.plate + 1));
  b.box(0, 0.46, 2.6, 1.86, 0.18, 0.14, CHROME);
  b.cylinder('z', -0.5, 0.32, 2.6, 0.035, 0.2, 6, CHROME, null);
  b.cylinder('z', 0.5, 0.32, 2.6, 0.035, 0.2, 6, CHROME, null);
}

function buildLowrider(b, m, opt) {
  tiers(
    b,
    S([
      [-2.675, 0.32, 0.56, 0.94],
      [-2.6, 0.24, 0.56, 0.995],
      [2.6, 0.24, 0.56, 0.995],
      [2.675, 0.32, 0.56, 0.94],
    ]),
    S([
      [-2.675, 0.56, 0.78, 0.94, 0.93],
      [-2.6, 0.56, 0.82, 0.995, 0.985],
      [-1.0, 0.56, 0.845, 0.995, 0.985],
      [0.45, 0.56, 0.845, 0.995, 0.985],
      [1.4, 0.56, 0.85, 0.995, 0.985],
      [2.6, 0.56, 0.855, 0.995, 0.985],
      [2.675, 0.56, 0.8, 0.94, 0.93],
    ]),
    {
      top: (i) => (i === 1 ? HOOD : i === 2 || i === 3 ? null : P),
      side: (i, side) => (i === 1 && side > 0 ? FENDER : i === 2 && side < 0 ? DOOR : UP),
    },
  );
  b.loft(
    S([
      [-1.0, 0.845, 0.86, 0.985, 0.975],
      [-0.36, 0.845, 1.27, 0.985, 0.8],
      [0.72, 0.845, 1.28, 0.985, 0.8],
      [1.4, 0.845, 0.862, 0.985, 0.975],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front' || kind === 'back') return null;
      if (kind === 'top') return i === 1 ? ROOF : GLASS;
      return i === 2 ? ROOF : GLASS;
    },
  );
  // pillarless hardtop: thin chrome A-pillars and window frames
  pillar(b, [0.978, 0.86, -0.99], [0.8, 1.27, -0.36], 0.04, CHROME);
  sideTrim(b, 0.98, 0.852, -0.98, 1.38, CHROME, 0.022);
  sideTrim(b, 0.802, 1.265, -0.36, 0.72, CHROME, 0.02);
  // chrome side spear, rocker trim, pinstripe
  sideTrim(b, 0.998, 0.66, -2.3, 2.3, CHROME, 0.035);
  sideTrim(b, 0.998, 0.28, -1.2, 1.2, CHROME, 0.03);
  for (const s of [-1, 1]) {
    b.sideDecal(s, 0.9985, 0, 0.78, 4.9, 0.012, STRIPE);
    b.sideDecal(s, 0.9985, 0, 0.765, 4.6, 0.006, STRIPE);
  }
  b.topDecal(-2.55, 0.822, -1.1, 0.843, 0.012, STRIPE); // hood pinstripe
  doorGaps(b, 0.995, [-1.0, 0.45], 0.26, 0.845);
  handles(b, 0.995, 0.74, [0.3]);
  mirrors(b, 0.975, 0.92, -0.9);
  arches(b, m, 0.995, 0.24, 0.05);
  // front: full-width grille with quad round headlamps
  b.box(0, 0.7, -2.678, 1.84, 0.2, 0.012, CHROME);
  b.endDecal(true, 0, 0.7, -2.687, 1.76, 0.16, { color: '#ffffff', shine: 0.6, uv: uv('grilleBars') });
  for (const s of [-1, 1]) {
    for (const x of [0.52, 0.76]) {
      b.cylinder('z', s * x, 0.7, -2.69, 0.092, 0.02, 10, CHROME, null);
      b.cylinder('z', s * x, 0.7, -2.7, 0.075, 0.02, 10, CHROME, lens());
    }
    b.endDecal(true, s * 0.8, 0.46, -2.782, 0.2, 0.06, amber());
  }
  b.box(0, 0.46, -2.72, 2.02, 0.16, 0.12, CHROME);
  b.endDecal(true, 0, 0.46, -2.782, 0.3, 0.15, plate(opt.plate));
  b.box(0, 0.83, -2.52, 0.03, 0.06, 0.12, CHROME);
  // rear: brushed panel with the triple round taillights
  b.box(0, 0.7, 2.678, 1.84, 0.18, 0.012, DULLCHROME);
  for (const s of [-1, 1]) {
    for (const x of [0.42, 0.62, 0.82]) {
      b.cylinder('z', s * x, 0.7, 2.688, 0.078, 0.02, 10, CHROME, null);
      b.cylinder('z', s * x, 0.7, 2.695, 0.064, 0.02, 10, CHROME, red());
    }
  }
  b.box(0, 0.46, 2.72, 2.02, 0.16, 0.12, CHROME);
  b.endDecal(false, 0, 0.46, 2.782, 0.3, 0.15, plate(opt.plate + 1));
  b.beam([-0.85, 0.86, 2.3], [-0.85, 1.35, 2.36], 0.01, CHROME); // antenna
}

function buildWagon(b, m, opt) {
  tiers(
    b,
    S([
      [-2.775, 0.42, 0.6, 0.92],
      [-2.675, 0.34, 0.6, 0.975],
      [2.7, 0.34, 0.6, 0.975],
      [2.775, 0.44, 0.6, 0.93],
    ]),
    S([
      [-2.775, 0.6, 0.8, 0.92, 0.9],
      [-2.675, 0.6, 0.86, 0.975, 0.965],
      [-1.25, 0.6, 0.92, 0.975, 0.965],
      [0.12, 0.6, 0.92, 0.975, 0.965],
      [1.3, 0.6, 0.92, 0.975, 0.965],
      [2.7, 0.6, 0.92, 0.975, 0.965],
      [2.775, 0.6, 0.9, 0.93, 0.92],
    ]),
    {
      top: (i) => (i === 1 ? HOOD : i >= 2 && i <= 4 ? null : P),
      side: (i, side) => (i === 1 && side > 0 ? FENDER : i === 2 && side < 0 ? DOOR : UP),
    },
  );
  b.loft(
    S([
      [-1.25, 0.92, 0.935, 0.965, 0.955],
      [-0.48, 0.92, 1.43, 0.965, 0.81],
      [0.12, 0.92, 1.44, 0.965, 0.81],
      [1.3, 0.92, 1.445, 0.965, 0.81],
      [2.5, 0.92, 1.44, 0.965, 0.81],
      [2.7, 0.92, 1.4, 0.965, 0.8],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front') return null;
      if (kind === 'back') return GLASS;
      if (kind === 'top') return i === 0 ? GLASS : ROOF;
      return i === 4 ? ROOF : GLASS;
    },
  );
  pillar(b, [0.962, 0.935, -1.24], [0.81, 1.43, -0.48], 0.06, UP);
  pillar(b, [0.964, 0.93, 0.12], [0.81, 1.44, 0.12], 0.07, UP);
  pillar(b, [0.964, 0.93, 1.3], [0.81, 1.445, 1.3], 0.08, UP);
  sideTrim(b, 0.968, 0.925, -1.24, 2.68, CHROME, 0.022);
  // wood paneling, one framed panel per door + quarter + tailgate
  for (const s of [-1, 1]) {
    b.sideDecal(s, 0.979, -0.56, 0.75, 1.3, 0.28, { color: '#ffffff', shine: 0.25, uv: uv('wood') });
    b.sideDecal(s, 0.979, 0.71, 0.75, 1.12, 0.28, { color: '#ffffff', shine: 0.25, uv: uv('wood') });
    b.sideDecal(s, 0.979, 1.98, 0.75, 1.36, 0.28, { color: '#ffffff', shine: 0.25, uv: uv('wood') });
  }
  b.endDecal(false, 0, 0.76, 2.779, 1.3, 0.24, { color: '#ffffff', shine: 0.25, uv: uv('wood') });
  // roof rack
  for (const s of [-1, 1]) {
    b.beam([s * 0.64, 1.5, -0.2], [s * 0.64, 1.5, 2.45], 0.035, CHROME);
    b.box(s * 0.64, 1.47, -0.1, 0.05, 0.05, 0.08, BLACK);
    b.box(s * 0.64, 1.47, 2.35, 0.05, 0.05, 0.08, BLACK);
  }
  b.beam([-0.64, 1.52, 0.4], [0.64, 1.52, 0.4], 0.03, CHROME);
  b.beam([-0.64, 1.52, 1.9], [0.64, 1.52, 1.9], 0.03, CHROME);
  doorGaps(b, 0.975, [-1.25, 0.12, 1.3], 0.36, 0.92);
  handles(b, 0.975, 0.89, [-0.2, 1.1]);
  mirrors(b, 0.97, 0.99, -1.12);
  arches(b, m, 0.975, 0.33);
  // front (same family as the sedan)
  b.box(0, 0.7, -2.778, 0.94, 0.2, 0.012, CHROME);
  b.endDecal(true, 0, 0.7, -2.787, 0.84, 0.15, { color: '#ffffff', shine: 0.5, uv: uv('grilleBars') });
  for (const s of [-1, 1]) {
    b.box(s * 0.66, 0.7, -2.778, 0.46, 0.19, 0.012, CHROME);
    b.endDecal(true, s * 0.56, 0.7, -2.787, 0.17, 0.14, lens());
    b.endDecal(true, s * 0.77, 0.7, -2.787, 0.17, 0.14, lens());
    b.endDecal(true, s * 0.8, 0.47, -2.907, 0.22, 0.07, amber());
  }
  b.box(0, 0.47, -2.835, 2.0, 0.2, 0.14, CHROME);
  b.endDecal(true, 0, 0.47, -2.907, 0.3, 0.15, plate(opt.plate));
  // rear: vertical wraparound taillights in the corners
  for (const s of [-1, 1]) {
    b.endDecal(false, s * 0.84, 0.72, 2.779, 0.2, 0.3, red());
  }
  b.endDecal(false, 0, 0.5, 2.915, 0.3, 0.15, plate(opt.plate + 1));
  b.box(0, 0.47, 2.84, 2.0, 0.2, 0.14, CHROME);
}

function buildPickup(b, m, opt) {
  // front clip + cab lower body
  tiers(
    b,
    S([
      [-2.65, 0.56, 0.8, 0.96],
      [-2.58, 0.5, 0.8, 1.0],
      [0.55, 0.5, 0.8, 1.0],
    ]),
    S([
      [-2.65, 0.8, 1.1, 0.96, 0.95],
      [-2.58, 0.8, 1.14, 1.0, 0.99],
      [-0.95, 0.8, 1.16, 1.0, 0.99],
      [0.55, 0.8, 1.16, 1.0, 0.99],
    ]),
    {
      top: (i) => (i === 1 ? HOOD : i === 2 ? null : P),
      side: (i, side) => (i === 1 && side > 0 ? FENDER : i === 2 && side < 0 ? DOOR : UP),
      cap: () => UP,
    },
  );
  // cab greenhouse: steep windshield, flat roof, vertical back with a small rear window
  b.loft(
    S([
      [-0.95, 1.16, 1.18, 0.99, 0.98],
      [-0.52, 1.16, 1.8, 0.99, 0.9],
      [0.3, 1.16, 1.82, 0.99, 0.9],
      [0.53, 1.16, 1.82, 0.99, 0.9],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front') return null;
      if (kind === 'back') return ROOF;
      if (kind === 'top') return i === 0 ? GLASS : ROOF;
      return i === 2 ? ROOF : GLASS;
    },
  );
  b.endDecal(false, 0, 1.52, 0.535, 1.2, 0.3, GLASS);
  pillar(b, [0.985, 1.18, -0.94], [0.9, 1.8, -0.52], 0.06, ROOF);
  sideTrim(b, 0.99, 1.17, -0.94, 0.52, CHROME, 0.02);
  sideTrim(b, 1.003, 0.8, -2.5, 0.52, CHROME, 0.025);
  // bed
  b.box(0, 0.82, 1.62, 1.84, 0.06, 1.98, { color: '#2b2926', shine: 0.05 });
  for (const s of [-1, 1]) {
    b.box(s * 0.95, 0.68, 1.62, 0.1, 0.24, 2.0, P, 'ny');
    b.box(s * 0.95, 0.99, 1.62, 0.1, 0.38, 2.0, UP, 'ny');
    b.box(s * 0.95, 1.195, 1.62, 0.13, 0.03, 2.02, CHROME);
  }
  sideTrim(b, 1.003, 0.8, 0.64, 2.6, CHROME, 0.025);
  b.box(0, 0.99, 0.65, 1.8, 0.38, 0.06, UP);
  b.box(0, 0.9, 2.59, 1.8, 0.56, 0.06, UP);
  b.box(0, 1.175, 2.59, 1.8, 0.03, 0.08, CHROME);
  b.box(0, 0.56, 1.62, 1.5, 0.22, 1.9, UNDER);
  b.box(0, 0.62, -0.1, 1.4, 0.2, 1.2, UNDER);
  // front: big truck grille, stacked rectangular headlamps, massive bumper
  b.endDecal(true, 0, 0.95, -2.656, 1.16, 0.26, { color: '#ffffff', shine: 0.55, uv: uv('grilleTruck') });
  for (const s of [-1, 1]) {
    b.box(s * 0.8, 0.95, -2.652, 0.36, 0.3, 0.012, CHROME);
    b.endDecal(true, s * 0.8, 1.01, -2.662, 0.28, 0.1, lens());
    b.endDecal(true, s * 0.8, 0.89, -2.662, 0.28, 0.1, lens());
    b.endDecal(true, s * 0.66, 0.7, -2.792, 0.2, 0.07, amber());
  }
  b.box(0, 0.64, -2.72, 2.04, 0.24, 0.14, CHROME);
  b.endDecal(true, 0, 0.64, -2.792, 0.3, 0.15, plate(opt.plate));
  // rear: vertical taillamps, step bumper, tailgate
  for (const s of [-1, 1]) b.endDecal(false, s * 0.9, 1.0, 2.625, 0.14, 0.3, red());
  b.box(0, 0.64, 2.7, 2.0, 0.2, 0.16, CHROME);
  b.endDecal(false, 0, 0.64, 2.782, 0.3, 0.15, plate(opt.plate + 1));
  b.box(0, 1.06, 2.622, 0.2, 0.05, 0.01, CHROME); // tailgate latch
  doorGaps(b, 1.0, [-0.95, 0.5], 0.52, 1.16);
  handles(b, 1.0, 1.08, [0.28]);
  for (const s of [-1, 1]) {
    b.beam([s * 0.99, 1.3, -0.72], [s * 1.12, 1.34, -0.72], 0.03, CHROME);
    b.box(s * 1.14, 1.34, -0.72, 0.06, 0.2, 0.14, CHROME);
  }
  arches(b, m, 1.0, 0.5, 0.08);
}

function buildHatch(b, m, opt) {
  tiers(
    b,
    S([
      [-2.05, 0.36, 0.55, 0.77],
      [-1.98, 0.3, 0.55, 0.81],
      [1.98, 0.3, 0.55, 0.81],
      [2.05, 0.36, 0.55, 0.77],
    ]),
    S([
      [-2.05, 0.55, 0.74, 0.77, 0.75],
      [-1.98, 0.55, 0.78, 0.81, 0.8],
      [-0.85, 0.55, 0.86, 0.81, 0.8],
      [0.35, 0.55, 0.86, 0.81, 0.8],
      [1.96, 0.55, 0.88, 0.81, 0.8],
      [2.05, 0.55, 0.82, 0.77, 0.76],
    ]),
    {
      top: (i) => (i === 1 ? HOOD : i === 2 || i === 3 ? null : P),
      side: (i, side) => (i === 1 && side > 0 ? FENDER : i === 2 && side < 0 ? DOOR : UP),
    },
  );
  b.loft(
    S([
      [-0.85, 0.86, 0.875, 0.8, 0.79],
      [-0.25, 0.86, 1.33, 0.8, 0.68],
      [0.35, 0.86, 1.34, 0.8, 0.68],
      [1.3, 0.86, 1.33, 0.8, 0.68],
      [1.96, 0.86, 0.9, 0.8, 0.78],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front' || kind === 'back') return null;
      if (kind === 'top') return i === 0 || i === 3 ? GLASS : ROOF;
      return i === 3 ? ROOF : GLASS;
    },
  );
  pillar(b, [0.795, 0.875, -0.84], [0.68, 1.33, -0.25], 0.05, BLACK);
  pillar(b, [0.797, 0.87, 0.35], [0.68, 1.34, 0.35], 0.07, BLACK);
  sideTrim(b, 0.802, 0.868, -0.84, 1.3, BLACK, 0.02);
  sideTrim(b, 0.815, 0.55, -1.9, 1.9, BLACK, 0.04);
  doorGaps(b, 0.81, [-0.85, 0.35], 0.32, 0.86);
  handles(b, 0.81, 0.78, [0.2]);
  mirrors(b, 0.79, 0.94, -0.78, BLACK);
  arches(b, m, 0.81, 0.3, 0.05);
  // rust: fender lips, rockers, hatch bottom
  for (const s of [-1, 1]) {
    b.sideDecal(s, 0.8125, m.axleR + 0.36, 0.42, 0.22, 0.16, RUST);
    b.sideDecal(s, 0.8125, m.axleF - 0.34, 0.4, 0.18, 0.12, RUST);
    b.sideDecal(s, 0.8125, 0.0, 0.335, 1.1, 0.07, RUST);
  }
  b.endDecal(false, 0.35, 0.62, 2.054, 0.3, 0.06, RUST);
  // front: slat grille, single rectangular lamps, black bumpers
  b.endDecal(true, 0, 0.66, -2.055, 0.5, 0.12, { color: '#ffffff', shine: 0.3, uv: uv('grilleSlats') });
  for (const s of [-1, 1]) {
    b.box(s * 0.52, 0.66, -2.052, 0.34, 0.16, 0.012, BLACK);
    b.endDecal(true, s * 0.52, 0.66, -2.06, 0.3, 0.13, lens());
    b.endDecal(true, s * 0.66, 0.42, -2.162, 0.14, 0.06, amber());
  }
  b.box(0, 0.42, -2.1, 1.66, 0.16, 0.12, BLACK);
  b.endDecal(true, 0, 0.42, -2.162, 0.3, 0.15, plate(opt.plate));
  for (const s of [-1, 1]) {
    b.endDecal(false, s * 0.58, 0.7, 2.054, 0.28, 0.14, red());
    b.endDecal(false, s * 0.43, 0.7, 2.055, 0.05, 0.14, lens());
  }
  b.box(0, 0.42, 2.1, 1.66, 0.16, 0.12, BLACK);
  b.endDecal(false, 0, 0.42, 2.162, 0.3, 0.15, plate(opt.plate + 1));
  b.cylinder('z', 0.45, 0.3, 2.1, 0.03, 0.2, 6, BLACK, null);
}

function buildVan(b, m, opt) {
  // lower body full length
  b.loft(
    S([
      [-2.6, 0.46, 0.86, 0.97],
      [-2.52, 0.4, 0.86, 1.01],
      [2.55, 0.4, 0.86, 1.01],
      [2.6, 0.46, 0.86, 0.98],
    ]),
    (kind) => (kind === 'top' ? null : kind === 'bottom' ? UNDER : P),
  );
  // short nose
  b.loft(
    S([
      [-2.6, 0.86, 1.02, 0.97, 0.95],
      [-2.52, 0.86, 1.07, 1.01, 0.99],
      [-1.62, 0.86, 1.14, 1.01, 1.0],
    ]),
    (kind, i, side) => (kind === 'bottom' || kind === 'back' ? null : kind === 'top' ? (i === 1 ? HOOD : P) : kind === 'side' && i === 1 && side > 0 ? FENDER : UP),
  );
  // tall box body
  b.loft(
    S([
      [-1.62, 0.86, 1.16, 1.01, 1.0],
      [-1.2, 0.86, 1.96, 1.01, 0.96],
      [-0.7, 0.86, 2.02, 1.01, 0.97],
      [2.5, 0.86, 2.02, 1.01, 0.97],
      [2.6, 0.86, 1.94, 1.0, 0.95],
    ]),
    (kind, i, side) => {
      if (kind === 'bottom' || kind === 'front') return null;
      if (kind === 'back') return UP;
      if (kind === 'top') return i === 0 ? GLASS : ROOF;
      if (i === 0) return GLASS;
      if (i === 1 && side < 0) return DOOR;
      return UP;
    },
  );
  // windows: door glass, small rear "bubble" windows, rear door glass
  for (const s of [-1, 1]) {
    const x = 0.99;
    b.box(s * x, 1.56, -0.95, 0.04, 0.58, 0.44, GLASS);
    b.box(s * x, 1.6, 1.55, 0.04, 0.3, 0.6, GLASS);
    b.box(s * (x + 0.012), 1.6, 1.55, 0.02, 0.36, 0.66, CHROME, 'px nx');
    // custom stripe package
    b.sideDecal(s, 1.0135, 0.95, 1.14, 3.1, 0.07, STRIPE);
    b.sideDecal(s, 1.0135, 0.95, 1.24, 3.1, 0.07, STRIPE2);
    b.sideDecal(s, 1.0135, 0.95, 1.34, 3.1, 0.05, STRIPE);
    b.sideDecal(s, 1.0135, -1.16, 1.14, 0.9, 0.07, STRIPE);
  }
  for (const s of [-1, 1]) b.endDecal(false, s * 0.45, 1.62, 2.602, 0.62, 0.34, GLASS);
  b.beam([0, 0.9, 2.605], [0, 1.9, 2.605], 0.015, GAP);
  pillar(b, [0.995, 1.17, -1.6], [0.965, 1.96, -1.2], 0.07, UP);
  doorGaps(b, 1.01, [-1.62, -0.7, 0.4, 1.3], 0.42, 1.98);
  handles(b, 1.01, 1.12, [-0.84]);
  mirrors(b, 1.0, 1.55, -1.3, BLACK);
  // ladder on the right rear door
  for (const x of [0.58, 0.86]) b.beam([x, 0.9, 2.66], [x, 1.98, 2.66], 0.03, DULLCHROME);
  for (let y = 1.0; y < 1.95; y += 0.22) b.beam([0.58, y, 2.66], [0.86, y, 2.66], 0.02, DULLCHROME);
  b.box(0, 2.07, 0.5, 1.4, 0.08, 2.4, ROOF); // raised fiberglass roof cap
  arches(b, m, 1.01, 0.4, 0.07);
  // front
  b.endDecal(true, 0, 0.94, -2.606, 0.9, 0.16, { color: '#ffffff', shine: 0.5, uv: uv('grilleBars') });
  for (const s of [-1, 1]) {
    b.box(s * 0.72, 0.94, -2.603, 0.34, 0.18, 0.012, CHROME);
    b.endDecal(true, s * 0.72, 0.94, -2.612, 0.3, 0.14, lens());
    b.endDecal(true, s * 0.72, 0.62, -2.722, 0.2, 0.06, amber());
  }
  b.box(0, 0.62, -2.65, 2.04, 0.2, 0.14, CHROME);
  b.endDecal(true, 0, 0.62, -2.722, 0.3, 0.15, plate(opt.plate));
  // rear
  for (const s of [-1, 1]) b.endDecal(false, s * 0.93, 1.1, 2.603, 0.12, 0.4, red());
  b.box(0, 0.6, 2.66, 2.04, 0.18, 0.14, CHROME);
  b.endDecal(false, 0, 0.84, 2.603, 0.3, 0.15, plate(opt.plate + 1));
}

function buildAero(b, m, opt) {
  // rounded early-'90s mid-size front-drive sedan: the 1993 OPD cruiser shape
  const police = opt.police;
  tiers(
    b,
    S([
      [-2.46, 0.4, 0.58, 0.8],
      [-2.36, 0.35, 0.58, 0.88],
      [-2.1, 0.34, 0.58, 0.92],
      [2.2, 0.34, 0.58, 0.92],
      [2.4, 0.36, 0.58, 0.88],
      [2.46, 0.42, 0.58, 0.82],
    ]),
    S([
      [-2.46, 0.58, 0.66, 0.8, 0.76],
      [-2.36, 0.58, 0.74, 0.88, 0.84],
      [-2.1, 0.58, 0.8, 0.92, 0.89],
      [-1.1, 0.58, 0.9, 0.92, 0.9],
      [0.12, 0.58, 0.925, 0.92, 0.9],
      [1.2, 0.58, 0.95, 0.92, 0.9],
      [1.4, 0.58, 0.955, 0.92, 0.9],
      [2.2, 0.58, 0.97, 0.92, 0.9],
      [2.4, 0.58, 0.93, 0.88, 0.85],
      [2.46, 0.58, 0.86, 0.82, 0.8],
    ]),
    {
      top: (i) => (i <= 2 ? HOOD : i >= 3 && i <= 5 ? null : P),
      side: (i, side) => (i === 2 && side > 0 ? FENDER : i === 3 && side < 0 ? DOOR : UP),
    },
  );
  b.loft(
    S([
      [-1.08, 0.9, 0.915, 0.905, 0.895],
      [-0.22, 0.9, 1.38, 0.905, 0.74],
      [0.12, 0.9, 1.4, 0.905, 0.73],
      [0.66, 0.9, 1.4, 0.905, 0.73],
      [1.4, 0.9, 0.96, 0.905, 0.9],
    ]),
    (kind, i) => {
      if (kind === 'bottom' || kind === 'front' || kind === 'back') return null;
      if (kind === 'top') return i === 0 || i === 3 ? GLASS : ROOF;
      return i === 3 ? ROOF : GLASS;
    },
  );
  pillar(b, [0.9, 0.915, -1.07], [0.74, 1.38, -0.22], 0.05, BLACK);
  pillar(b, [0.905, 0.91, 0.12], [0.735, 1.4, 0.12], 0.07, BLACK);
  sideTrim(b, 0.906, 0.905, -1.07, 1.38, BLACK, 0.02);
  // body-side molding
  sideTrim(b, 0.926, 0.5, -2.0, 2.1, BLACK, 0.04);
  doorGaps(b, 0.92, [-1.1, 0.12, 1.2], 0.36, 0.92);
  handles(b, 0.92, 0.84, [-0.12, 1.0]);
  mirrors(b, 0.9, 0.96, -0.98, BLACK);
  arches(b, m, 0.92, 0.34, 0.05);
  // flush composite headlamps, thin grille slot, integrated bumpers with rub strips
  for (const s of [-1, 1]) {
    b.box(s * 0.56, 0.7, -2.4, 0.4, 0.12, 0.12, lens());
    b.box(s * 0.78, 0.66, -2.34, 0.1, 0.08, 0.12, amber());
  }
  b.box(0, 0.66, -2.44, 0.52, 0.05, 0.08, BLACK);
  b.box(0, 0.47, -2.462, 1.62, 0.07, 0.03, BLACK);
  b.endDecal(true, 0, 0.5, -2.478, 0.3, 0.15, plate(opt.plate));
  b.endDecal(false, 0, 0.82, 2.463, 1.56, 0.12, red());
  b.endDecal(false, 0, 0.82, 2.4635, 0.3, 0.08, { color: '#5a0c10', shine: 0.5 });
  b.endDecal(false, 0, 0.66, 2.464, 0.3, 0.15, plate(opt.plate + 1));
  b.box(0, 0.47, 2.462, 1.62, 0.07, 0.03, BLACK);
  if (police) {
    // door decals ("POLICE"), side stripe, light bar, push bar, spotlight, unit numbers
    for (const s of [-1, 1]) {
      b.sideDecal(s, 0.9225, -0.48, 0.745, 1.14, 0.3, { color: '#ffffff', shine: 0.35, uv: uv('police') });
      b.sideDecal(s, 0.9225, 0.66, 0.745, 1.0, 0.3, { color: '#ffffff', shine: 0.35, uv: uv('white') });
      b.sideDecal(s, 0.923, 0.1, 0.57, 4.2, 0.05, STRIPE);
    }
    b.box(0, 1.428, 0.2, 1.24, 0.05, 0.32, BLACK);
    b.box2(0.52, 1.408, 0.2, 0.08, 0.03, 0.34, BLACK);
    b.box(-0.33, 1.505, 0.2, 0.54, 0.1, 0.27, { color: '#d0141e', shine: 0.4 });
    b.box(0.33, 1.505, 0.2, 0.54, 0.1, 0.27, { color: '#1a40e0', shine: 0.4 });
    b.box(0, 1.5, 0.2, 0.1, 0.08, 0.24, { color: '#eef2f4', shine: 0.9 });
    b.topDecal(0.38, 1.401, 0.64, 1.401, 0.22, { color: '#ffffff', shine: 0.3, uv: uv('unit0') });
    b.topDecal(1.82, 0.963, 2.12, 0.966, 0.2, { color: '#ffffff', shine: 0.3, uv: uv('unit0') });
    // push bar
    for (const s of [-1, 1]) {
      b.box(s * 0.36, 0.66, -2.6, 0.06, 0.42, 0.06, BLACK);
      b.box(s * 0.36, 0.5, -2.52, 0.05, 0.05, 0.14, BLACK);
    }
    b.beam([-0.44, 0.82, -2.62], [0.44, 0.82, -2.62], 0.05, BLACK);
    b.beam([-0.44, 0.58, -2.62], [0.44, 0.58, -2.62], 0.05, BLACK);
    // A-pillar spotlight
    b.box(-0.93, 0.98, -1.0, 0.05, 0.06, 0.05, BLACK);
    b.cylinder('z', -0.96, 1.02, -1.02, 0.06, 0.16, 8, CHROME, lens());
    b.beam([0.3, 1.4, 0.9], [0.3, 1.95, 0.95], 0.012, BLACK); // radio antenna
  } else {
    sideTrim(b, 0.927, 0.5, -2.0, 2.1, DULLCHROME, 0.012);
  }
}

function buildBus(b, m, opt) {
  const hw = 1.275;
  b.loft(
    S([
      [-6.0, 0.5, 2.9, 1.22, 1.18],
      [-5.9, 0.42, 3.0, hw, 1.24],
      [5.92, 0.42, 3.0, hw, 1.24],
      [6.0, 0.5, 2.92, 1.22, 1.18],
    ]),
    (kind) => (kind === 'bottom' ? UNDER : kind === 'top' ? ROOF : P),
  );
  // roof crown + AC pod
  b.box(0, 3.04, 0, 2.2, 0.08, 11.4, ROOF);
  b.box(0, 3.16, 3.6, 1.8, 0.2, 2.6, ROOF);
  // livery: stripe bands along both flanks
  for (const s of [-1, 1]) {
    b.sideDecal(s, hw + 0.004, 0, 1.3, 11.7, 0.22, STRIPE);
    b.sideDecal(s, hw + 0.004, 0, 1.15, 11.7, 0.06, STRIPE2);
    b.sideDecal(s, hw + 0.004, s < 0 ? 1.6 : 2.6, 0.9, 1.5, 0.5, { color: '#ffffff', shine: 0.3, uv: uv('mat') });
  }
  // window band with pillars; entrance doors on the curb (right) side
  const winY = 2.02;
  const winH = 0.86;
  for (const s of [-1, 1]) {
    for (let z = -4.3; z < 5.3; z += 1.36) {
      if (s > 0 && z > 0.2 && z < 1.4) continue;
      // bus flanks lean in slightly above the belt; windows are thin boxes on the flank
      b.box(s * (hw - 0.012), winY, z + 0.64, 0.05, winH, 1.24, { color: '#ffffff', shine: 0.85, uv: uv('busGlass') }, s < 0 ? 'px' : 'nx');
    }
  }
  // front door + rear door (right side): tall glass leaves with frames
  for (const [z0, z1] of [
    [-5.75, -4.55],
    [0.35, 1.55],
  ]) {
    const zc = (z0 + z1) / 2;
    b.box(hw - 0.01, 1.52, zc, 0.05, 2.1, z1 - z0, BLACK, 'nx');
    b.box(hw + 0.006, 1.6, zc - (z1 - z0) / 4, 0.02, 1.8, (z1 - z0) / 2 - 0.08, GLASS, 'nx');
    b.box(hw + 0.006, 1.6, zc + (z1 - z0) / 4, 0.02, 1.8, (z1 - z0) / 2 - 0.08, GLASS, 'nx');
  }
  // driver window (left)
  b.box(-(hw - 0.012), 2.02, -5.2, 0.05, 0.86, 1.1, GLASS, 'px');
  // windshield + destination sign
  b.endDecal(true, 0, 1.95, -6.005, 2.26, 1.36, GLASS);
  b.beam([0, 1.28, -6.01], [0, 2.63, -6.01], 0.05, BLACK);
  b.endDecal(true, 0, 2.77, -6.006, 1.9, 0.22, { color: '#ffffff', shine: 0.2, uv: uv(`sign${opt.sign % 3}`) });
  b.endDecal(true, 0, 1.08, -6.006, 1.1, 0.3, { color: '#ffffff', shine: 0.3, uv: uv('mat') });
  for (const s of [-1, 1]) {
    b.box(s * 0.92, 0.86, -6.0, 0.36, 0.2, 0.03, BLACK);
    b.endDecal(true, s * 0.84, 0.86, -6.018, 0.14, 0.14, lens());
    b.endDecal(true, s * 1.0, 0.86, -6.018, 0.14, 0.14, lens());
    b.endDecal(true, s * 1.14, 0.86, -6.018, 0.08, 0.14, amber());
    // big bus mirrors on arms
    b.beam([s * 1.2, 2.5, -5.95], [s * 1.45, 2.45, -6.3], 0.035, BLACK);
    b.box(s * 1.47, 2.2, -6.3, 0.06, 0.42, 0.22, BLACK);
  }
  b.box(0, 0.56, -6.06, 2.46, 0.26, 0.14, BLACK);
  b.endDecal(true, 0, 0.56, -6.132, 0.3, 0.15, plate(opt.plate));
  // rear: engine louvers, small window, lamps, route sign
  b.endDecal(false, 0, 1.0, 6.005, 1.8, 0.62, { color: '#ffffff', shine: 0.2, uv: uv('louver') });
  b.endDecal(false, 0, 2.1, 6.005, 1.6, 0.5, GLASS);
  b.endDecal(false, 0, 2.66, 6.006, 0.7, 0.2, { color: '#ffffff', shine: 0.2, uv: uv(`sign${opt.sign % 3}`) });
  for (const s of [-1, 1]) {
    b.endDecal(false, s * 1.0, 0.95, 6.006, 0.18, 0.18, red());
    b.endDecal(false, s * 1.0, 1.2, 6.006, 0.18, 0.18, amber());
    b.endDecal(false, s * 0.75, 0.95, 6.006, 0.14, 0.14, lens());
  }
  b.box(0, 0.56, 6.06, 2.46, 0.26, 0.14, BLACK);
  b.endDecal(false, 0, 0.56, 6.132, 0.3, 0.15, plate(opt.plate + 1));
  arches(b, m, hw, 0.42, 0.1);
}

const BUILDERS = {
  sedan: (b, m, o) => (o.variant === 'aero' ? buildAero(b, m, o) : buildSedan(b, m, o)),
  coupe: buildCoupe,
  lowrider: buildLowrider,
  wagon: buildWagon,
  pickup: buildPickup,
  hatch: buildHatch,
  van: buildVan,
  police: (b, m, o) => buildAero(b, m, { ...o, police: true }),
  bus: buildBus,
};

// ------------------------------------------------------------------ paint schemes
export const PALETTE = {
  era: ['#6e1f2a', '#1f2a44', '#ddd2b4', '#5a3a24', '#b69b73', '#2c4a38', '#7f9fc0', '#8b939f', '#cbb99a', '#4d1520', '#1b1b1d', '#e6e4dc', '#9a4a40', '#b8963a', '#8a4b2a', '#a4a6a8', '#94b4d4', '#3d5f7a'],
  aero: ['#2f6f73', '#8e1a2a', '#c9c3b6', '#1f3a2c', '#e8e8e4', '#445c80', '#6b6f78', '#5b2a4a', '#b0b4b8'],
  candy: ['#a00a1e', '#1238a8', '#5a1a8a', '#0f7a3a', '#c89a2a', '#c85a14', '#3a0612', '#1a6f8a', '#e8e2d6'],
  truck: ['#7a2a1e', '#2a3f66', '#5a3a24', '#2f4a2a', '#b89a62', '#1b1b1d', '#8a8f94', '#9a3a1a', '#d8cfb8'],
  hatch: ['#9a4a40', '#6a7f9a', '#c8b88a', '#7a8a4a', '#c8a03a', '#e0ddd2', '#6a4a30', '#3a5a7a'],
  van: ['#5a3a24', '#b69b73', '#6e1f2a', '#1f2a44', '#2c4a38', '#e6e4dc', '#8a8f94', '#3a2a22'],
  twoTone: ['#e6dfcc', '#cbb99a', '#b0b4b8', '#e8e8e4', '#1b1b1d', '#6e5a44'],
  vinyl: ['#efe9d8', '#c8b48a', '#1a1a1a', '#5a1a24', '#2a2f44'],
  primer: ['#6f716c', '#7a4636', '#4a4b48'],
  stripes: [
    ['#e07a1e', '#b8391e'],
    ['#f1c232', '#d0702a'],
    ['#c8c8c0', '#7a1f2a'],
    ['#6fb0d8', '#1f4a7a'],
    ['#e8d8b0', '#8a5a2a'],
  ],
  pin: ['#e8c05a', '#f2f2f2', '#c0c4c8', '#ff9ad0'],
};

export const WHEEL_STYLES = {
  hubcap: { rim: '#c8ccd0', spoke: '#dde0e4', spokes: false, whitewall: false },
  steel: { rim: '#1a1b1c', spoke: '#1a1b1c', spokes: false, whitewall: false },
  steelCap: { rim: '#18191a', spoke: '#c8ccd0', spokes: false, whitewall: false },
  wire: { rim: '#8a8e94', spoke: '#eef0f2', spokes: true, whitewall: true },
  goldWire: { rim: '#7a6a3a', spoke: '#e8c050', spokes: true, whitewall: true },
  rally: { rim: '#5a5e62', spoke: '#d0d4d8', spokes: true, whitewall: false },
  alloy: { rim: '#a8acb2', spoke: '#c8ccd2', spokes: true, whitewall: false },
  plain: { rim: '#3a3634', spoke: '#6a6662', spokes: false, whitewall: false },
  bus: { rim: '#c8ccd0', spoke: '#9aa0a6', spokes: true, whitewall: false },
};

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

/**
 * Random era-appropriate paint scheme for a model. Returns
 * { colors: {slot: hex}, gloss, fade, wheel, variant?, plate, key }.
 * opts: { color (force main paint), variant ('aero' for the newer sedan), dark (police) }
 */
export function makeScheme(model, rng = Math.random, opts = {}) {
  const c = {};
  let gloss = 0.17;
  let fade = 0;
  let wheel = 'hubcap';
  let variant = opts.variant || null;
  const main = (list) => opts.color || pick(list, rng);
  const primerPanel = (chance) => {
    if (rng() < chance) c[rng() < 0.5 ? SLOT.hood : rng() < 0.5 ? SLOT.door : SLOT.fender] = pick(PALETTE.primer, rng);
  };
  switch (model) {
    case 'sedan': {
      if (variant === 'aero') {
        c[SLOT.paint] = main(PALETTE.aero);
        gloss = 0.24;
        wheel = rng() < 0.5 ? 'alloy' : 'hubcap';
        break;
      }
      c[SLOT.paint] = main(PALETTE.era);
      const r = rng();
      if (r < 0.3) c[SLOT.roof] = pick(PALETTE.vinyl, rng);
      else if (r < 0.48) c[SLOT.roof] = c[SLOT.upper] = pick(PALETTE.twoTone, rng);
      if (rng() < 0.28) {
        fade = 0.5 + rng() * 0.5;
        gloss = 0.05;
      }
      primerPanel(0.1);
      wheel = rng() < 0.4 ? 'wire' : rng() < 0.5 ? 'hubcap' : 'steelCap';
      break;
    }
    case 'coupe': {
      c[SLOT.paint] = main([...PALETTE.era, '#c01c2a', '#1a1a1a', '#e8e8e4']);
      if (rng() < 0.3) c[SLOT.upper] = c[SLOT.roof] = pick(PALETTE.twoTone, rng);
      else if (rng() < 0.25) c[SLOT.roof] = pick(PALETTE.vinyl, rng);
      if (rng() < 0.38) c[SLOT.ttop] = '#16202a';
      if (rng() < 0.2) {
        fade = 0.4 + rng() * 0.5;
        gloss = 0.05;
      }
      primerPanel(0.12);
      wheel = rng() < 0.35 ? 'wire' : rng() < 0.5 ? 'rally' : 'hubcap';
      break;
    }
    case 'lowrider': {
      c[SLOT.paint] = main(PALETTE.candy);
      if (rng() < 0.3) c[SLOT.roof] = pick(['#efe9d8', '#1a1a1a', '#e8e2d6'], rng);
      c[SLOT.stripe] = pick(PALETTE.pin, rng);
      gloss = 0.4;
      wheel = rng() < 0.5 ? 'goldWire' : 'wire';
      break;
    }
    case 'wagon': {
      c[SLOT.paint] = main(PALETTE.era);
      if (rng() < 0.2) {
        fade = 0.5 + rng() * 0.4;
        gloss = 0.08;
      }
      wheel = rng() < 0.3 ? 'wire' : 'hubcap';
      break;
    }
    case 'pickup': {
      c[SLOT.paint] = main(PALETTE.truck);
      if (rng() < 0.55) c[SLOT.upper] = c[SLOT.roof] = pick(['#e6e4dc', '#ddd2b4', '#cbb99a'], rng);
      if (rng() < 0.3) {
        fade = 0.5 + rng() * 0.5;
        gloss = 0.06;
      }
      primerPanel(0.15);
      wheel = rng() < 0.5 ? 'rally' : 'steelCap';
      break;
    }
    case 'hatch': {
      c[SLOT.paint] = main(PALETTE.hatch);
      if (rng() < 0.65) {
        fade = 0.6 + rng() * 0.4;
        gloss = 0.05;
      }
      if (rng() < 0.55) c[SLOT.rust] = '#6e3b1f';
      primerPanel(0.28);
      wheel = 'plain';
      break;
    }
    case 'van': {
      c[SLOT.paint] = main(PALETTE.van);
      const st = pick(PALETTE.stripes, rng);
      c[SLOT.stripe] = st[0];
      c[SLOT.stripe2] = st[1];
      if (rng() < 0.3) c[SLOT.roof] = c[SLOT.upper] = pick(PALETTE.twoTone, rng);
      if (rng() < 0.2) {
        fade = 0.4 + rng() * 0.4;
        gloss = 0.08;
      }
      wheel = rng() < 0.5 ? 'rally' : 'steelCap';
      break;
    }
    case 'police': {
      const dark = opts.dark ?? (opts.color ? isDark(opts.color) : rng() < 0.3);
      if (dark) {
        c[SLOT.paint] = opts.color || '#161b26';
        c[SLOT.roof] = '#ecebe6';
        c[SLOT.stripe] = '#ecebe6';
      } else {
        c[SLOT.paint] = opts.color || '#ecebe6';
        c[SLOT.stripe] = '#16244f';
      }
      gloss = 0.2;
      wheel = 'steelCap';
      break;
    }
    case 'bus': {
      c[SLOT.paint] = opts.color || '#ebe5d4';
      c[SLOT.roof] = '#f2f0ea';
      c[SLOT.stripe] = '#7a1f2a';
      c[SLOT.stripe2] = '#d08a2a';
      gloss = 0.14;
      if (rng() < 0.3) {
        fade = 0.35;
        gloss = 0.08;
      }
      wheel = 'bus';
      break;
    }
    default:
      c[SLOT.paint] = main(PALETTE.era);
  }
  if (opts.wheel) wheel = opts.wheel;
  const plateIdx = Math.floor(rng() * 4);
  const sign = Math.floor(rng() * 3);
  const scheme = { model, variant, colors: c, gloss, fade, wheel, plate: plateIdx, sign, burnt: false };
  scheme.key = schemeKey(scheme);
  return scheme;
}

function isDark(hex) {
  const col = new THREE.Color(hex);
  return col.r + col.g + col.b < 0.6;
}

function schemeKey(s) {
  const parts = [];
  for (let i = 0; i <= 9; i++) parts.push(s.colors[i] || '');
  return `${s.model}|${s.variant || ''}|${parts.join(',')}|${s.gloss.toFixed(2)}|${s.fade.toFixed(1)}|${s.burnt ? 1 : 0}`;
}

/** Copy of a scheme with the burnt/totaled look. */
export function burntScheme(s) {
  const b = { ...s, colors: { ...s.colors }, burnt: true, gloss: 0.02, fade: 1 };
  for (const k of Object.keys(b.colors)) b.colors[k] = '#262422';
  b.colors[SLOT.paint] = '#2a2826';
  b.key = schemeKey(b);
  return b;
}

// ------------------------------------------------------------------ geometry cache
const baseCache = new Map();
const schemeCache = new Map();

function baseGeometry(model, variant, plateIdx, sign) {
  // plates/signs are baked into the base (4 plate variants × models); cap variety to keep cache small
  const key = `${model}|${variant || ''}|${plateIdx}|${sign}`;
  let base = baseCache.get(key);
  if (base) return base;
  const m = MODELS[model] || MODELS.sedan;
  const b = new GeoBuilder();
  (BUILDERS[model] || BUILDERS.sedan)(b, m, { variant, plate: plateIdx, sign });
  base = b.build();
  base.geometry.name = `vehicle-${model}${variant ? '-' + variant : ''}`;
  baseCache.set(key, base);
  return base;
}

/**
 * Shared body geometry for (model, scheme). Position/normal/uv buffers are shared with every
 * other scheme of the same model; color + shine are per scheme. Never dispose the result.
 */
export function getBodyGeometry(model, scheme) {
  const plateIdx = model === 'bus' ? 0 : scheme.plate % 4;
  const sign = model === 'bus' ? scheme.sign % 3 : 0;
  const key = `${scheme.key}|${plateIdx}|${sign}`;
  let g = schemeCache.get(key);
  if (g) return g;
  const base = baseGeometry(model, scheme.variant, plateIdx, sign);
  const n = base.slot.length;
  const color = new Float32Array(n * 3);
  const shine = new Float32Array(n);
  const slotCol = [];
  for (let i = 0; i <= 9; i++) {
    const hex = scheme.colors[i];
    slotCol[i] = hex ? new THREE.Color(hex) : null;
  }
  // fallbacks: upper → paint, roof → upper, panels → paint, stripes → paint, ttop → roof
  const paint = slotCol[SLOT.paint] || new THREE.Color('#888888');
  const upper = slotCol[SLOT.upper] || paint;
  const roof = slotCol[SLOT.roof] || upper;
  const resolved = [
    paint,
    upper,
    roof,
    slotCol[SLOT.hood] || paint,
    slotCol[SLOT.door] || upper,
    slotCol[SLOT.fender] || upper,
    slotCol[SLOT.stripe] || paint,
    slotCol[SLOT.stripe2] || paint,
    slotCol[SLOT.rust] || paint,
    slotCol[SLOT.ttop] || roof,
  ];
  const slotShine = resolved.map(() => scheme.gloss);
  const primerHexes = new Set(PALETTE.primer);
  for (const s of [SLOT.hood, SLOT.door, SLOT.fender]) if (scheme.colors[s] && primerHexes.has(scheme.colors[s])) slotShine[s] = 0.02;
  if (scheme.colors[SLOT.rust]) slotShine[SLOT.rust] = 0.0;
  if (scheme.colors[SLOT.ttop]) slotShine[SLOT.ttop] = 0.88;
  if (scheme.colors[SLOT.roof] && PALETTE.vinyl.includes(scheme.colors[SLOT.roof])) slotShine[SLOT.roof] = 0.06;
  const fade = scheme.fade;
  const burnt = scheme.burnt;
  for (let i = 0; i < n; i++) {
    const s = base.slot[i];
    let r, gg, bb, sh;
    if (s === SLOT.FIXED) {
      r = base.fixed[i * 3];
      gg = base.fixed[i * 3 + 1];
      bb = base.fixed[i * 3 + 2];
      sh = base.shine[i];
      if (burnt) {
        r *= 0.16;
        gg *= 0.15;
        bb *= 0.14;
        sh *= 0.2;
      }
    } else {
      const col = resolved[s] || paint;
      const f = 1 + base.jitter[i] * (fade * 0.11 + 0.015);
      // faded paint also loses saturation toward a chalky gray
      const l = (col.r + col.g + col.b) / 3;
      const k = fade * 0.35;
      r = (col.r + (l * 1.15 - col.r) * k) * f;
      gg = (col.g + (l * 1.15 - col.g) * k) * f;
      bb = (col.b + (l * 1.15 - col.b) * k) * f;
      sh = base.shine[i] >= 0 ? base.shine[i] : slotShine[s];
    }
    color[i * 3] = r;
    color[i * 3 + 1] = gg;
    color[i * 3 + 2] = bb;
    shine[i] = sh;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', base.geometry.getAttribute('position'));
  g.setAttribute('normal', base.geometry.getAttribute('normal'));
  g.setAttribute('uv', base.geometry.getAttribute('uv'));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('shine', new THREE.BufferAttribute(shine, 1));
  g.boundingBox = base.geometry.boundingBox;
  g.boundingSphere = base.geometry.boundingSphere;
  g.name = base.geometry.name;
  schemeCache.set(key, g);
  return g;
}

/** Triangle count of a model's body (for perf notes / debug). */
export function bodyTriangles(model, variant) {
  return baseGeometry(model, variant, 0, 0).slot.length / 3;
}
