import * as THREE from 'three';
import { C, shade, box, obox, cylinder, beam, flat, rotPt, jitter } from './kit.js';

// Reusable low-poly props for the landmarks: trees, benches, lamps, fences, park furniture,
// signs, barricades, rail cars, jets and freeway cars. Props write into a Cluster (P) so they
// merge with the landmark they belong to.

// ------------------------------------------------------------------ trees
// Canopy variants: unit icosahedra with a deterministic radial wobble (keyed by vertex position,
// so shared corners move together and the shell stays closed).
const canopyCache = new Map();
function canopyVariants(detail) {
  if (canopyCache.has(detail)) return canopyCache.get(detail);
  const out = [];
  for (let k = 0; k < 6; k++) {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 11.31) * 43758.5453;
      const f = 0.84 + (h - Math.floor(h)) * 0.32;
      arr[i * 3] = x * f;
      arr[i * 3 + 1] = y * f;
      arr[i * 3 + 2] = z * f;
    }
    out.push(arr);
    geo.dispose();
  }
  canopyCache.set(detail, out);
  return out;
}

function blob(b, arr, cx, cy, cz, rx, ry, rz, c) {
  for (let i = 0; i < arr.length; i += 9) {
    b.tri(
      cx + arr[i] * rx, cy + arr[i + 1] * ry, cz + arr[i + 2] * rz,
      cx + arr[i + 3] * rx, cy + arr[i + 4] * ry, cz + arr[i + 5] * rz,
      cx + arr[i + 6] * rx, cy + arr[i + 7] * ry, cz + arr[i + 8] * rz,
      c,
    );
  }
}

const LEAF = ['#4b6b2c', '#56752f', '#436226', '#5f7f35', '#3e5a26', '#678a3a'];
const BARK = C('#5a4636');

/**
 * Tree at (x, z). opts: { h = 9, kind: 'broad' | 'round' | 'conifer' | 'cottonwood' | 'small',
 * leaf: css color, collide = true, lod: icosahedron detail override }
 */
export function tree(P, x, z, opts = {}) {
  const ctx = P.ctx;
  const rng = ctx.rng;
  const h = opts.h || 7 + rng() * 5;
  const kind = opts.kind || 'broad';
  const b = P.get('solid');
  const leaf = jitter(C(opts.leaf || LEAF[Math.floor(rng() * LEAF.length)]), rng, 0.1);
  const detail = opts.lod ?? (ctx.detail === 0 ? 0 : 1);
  const vars = canopyVariants(detail);
  const v = vars[Math.floor(rng() * vars.length)];
  if (kind === 'conifer') {
    cylinder(b, x, z, h * 0.04, h * 0.03, 0, h * 0.25, 5, BARK, { top: false });
    const dark = shade(leaf, 0.7);
    for (let i = 0; i < 3; i++) {
      const y0 = h * (0.18 + i * 0.24);
      const r = h * (0.3 - i * 0.07);
      cylinder(b, x, z, r, 0, y0, y0 + h * 0.42, 6, dark, { top: false, bottom: true });
    }
  } else {
    const trunkH = kind === 'small' ? h * 0.35 : h * 0.45;
    const tr = kind === 'cottonwood' ? h * 0.05 : h * 0.035;
    cylinder(b, x, z, tr, tr * 0.7, 0, trunkH + h * 0.1, 5, BARK, { top: false });
    const R = kind === 'round' ? h * 0.36 : kind === 'cottonwood' ? h * 0.34 : kind === 'small' ? h * 0.32 : h * 0.33;
    blob(b, v, x, trunkH + R * 0.75, z, R, R * 0.82, R, leaf);
    if (kind !== 'small' && kind !== 'round' && detail > 0) {
      const a = rng() * Math.PI * 2;
      const v2 = vars[(vars.indexOf(v) + 1) % vars.length];
      blob(b, v2, x + Math.cos(a) * R * 0.55, trunkH + R * 1.15, z + Math.sin(a) * R * 0.55, R * 0.62, R * 0.55, R * 0.62, shade(leaf, 1.08));
    }
    if (kind === 'cottonwood') {
      const a = rng() * Math.PI * 2;
      blob(b, v, x - Math.cos(a) * R * 0.6, trunkH + R * 0.55, z - Math.sin(a) * R * 0.6, R * 0.7, R * 0.6, R * 0.7, shade(leaf, 0.92));
    }
  }
  if (opts.collide !== false) ctx.col.addBox(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 4, 0, 'tree');
}

/** Scatter trees in a rect, keeping clear of `avoid` rects. */
export function treesIn(P, r, count, opts = {}, avoid = []) {
  const rng = P.ctx.rng;
  let placed = 0;
  for (let i = 0; i < count * 4 && placed < count; i++) {
    const x = r.x0 + 2 + rng() * (r.x1 - r.x0 - 4);
    const z = r.z0 + 2 + rng() * (r.z1 - r.z0 - 4);
    if (avoid.some((a) => x > a.x0 - 2 && x < a.x1 + 2 && z > a.z0 - 2 && z < a.z1 + 2)) continue;
    tree(P, x, z, typeof opts === 'function' ? opts(x, z) : opts);
    placed++;
  }
  return placed;
}

// ------------------------------------------------------------------ park furniture
const WOOD = C('#7a5a3a');
const IRON = C('#2e3130');
const GREEN_PAINT = C('#2f5b3a');

/** Park bench centred at (x, z), facing heading rot (people sit looking toward rot). */
export function bench(P, x, z, rot = 0, collide = true) {
  const b = P.get('solid');
  const f = (lx, lz) => rotPt(x, z, lx, lz, rot);
  // seat + back as rotated boxes
  const [sx, sz] = f(0, 0);
  obox(b, sx, sz, 1.8, 0.45, 0.42, 0.5, rot, WOOD);
  const [bx, bz] = f(0, 0.24);
  obox(b, bx, bz, 1.8, 0.08, 0.55, 0.95, rot, WOOD);
  for (const lx of [-0.75, 0.75]) {
    const [lx0, lz0] = f(lx, 0.05);
    obox(b, lx0, lz0, 0.08, 0.5, 0, 0.44, rot, IRON);
  }
  if (collide) P.ctx.col.addBox(Math.min(sx, bx) - 0.7, Math.min(sz, bz) - 0.7, Math.max(sx, bx) + 0.7, Math.max(sz, bz) + 0.7, 0.9, 0, 'prop');
}

/** Picnic table. */
export function picnicTable(P, x, z, rot = 0) {
  const b = P.get('solid');
  obox(b, x, z, 1.9, 0.8, 0.72, 0.78, rot, WOOD);
  for (const o of [-0.62, 0.62]) {
    const [bx, bz] = rotPt(x, z, 0, o, rot);
    obox(b, bx, bz, 1.9, 0.28, 0.42, 0.47, rot, WOOD);
  }
  for (const o of [-0.7, 0.7]) {
    const [lx, lz] = rotPt(x, z, o, 0, rot);
    obox(b, lx, lz, 0.1, 1.5, 0, 0.44, rot, WOOD);
    obox(b, lx, lz, 0.1, 0.2, 0.44, 0.72, rot, WOOD);
  }
  P.ctx.col.addBox(x - 1, z - 1, x + 1, z + 1, 0.8, 0, 'prop');
}

export function trashCan(P, x, z) {
  const b = P.get('solid');
  cylinder(b, x, z, 0.32, 0.3, 0, 0.95, 6, GREEN_PAINT, { cTop: IRON });
  P.ctx.col.addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1, 0, 'prop');
}

/**
 * Lamp post with a glowing head at night. style: 'park' (acorn globe), 'cobra' (highway /
 * parking lot arm), 'short'.
 */
export function lamp(P, x, z, opts = {}) {
  const ctx = P.ctx;
  const b = P.get('solid');
  const style = opts.style || 'park';
  const h = opts.h || (style === 'cobra' ? 9 : 4.2);
  const rot = opts.rot || 0;
  const y0 = opts.y0 || 0;
  const pole = C(opts.color || (style === 'park' ? '#1f2a24' : '#8c8f8f'));
  cylinder(b, x, z, style === 'cobra' ? 0.14 : 0.1, 0.07, y0, y0 + h, 5, pole, { top: false });
  const L = P.get('lights');
  const warm = C(opts.light || (style === 'cobra' ? '#ffcf82' : '#ffe7b0'));
  if (style === 'cobra') {
    const [ax, az] = rotPt(x, z, 0, -1.8, rot);
    beam(b, x, y0 + h, z, ax, y0 + h + 0.3, az, 0.14, pole);
    obox(b, ax, az, 0.5, 0.9, y0 + h + 0.05, y0 + h + 0.35, rot, pole);
    obox(L, ax, az, 0.36, 0.7, y0 + h, y0 + h + 0.06, rot, warm, { top: false, bottom: true });
    ctx.glow(ax, y0 + h - 0.1, az, opts.light || '#ffcf82', opts.glow || 6);
  } else {
    cylinder(b, x, z, 0.16, 0.16, y0 + h, y0 + h + 0.12, 5, pole);
    cylinder(L, x, z, 0.22, 0.18, y0 + h + 0.12, y0 + h + 0.62, 6, warm);
    cylinder(b, x, z, 0.1, 0.02, y0 + h + 0.62, y0 + h + 0.8, 5, pole);
    ctx.glow(x, y0 + h + 0.4, z, opts.light || '#ffe2a8', opts.glow || 3.5);
  }
  if (!y0 && opts.collide !== false) ctx.col.addBox(x - 0.15, z - 0.15, x + 0.15, z + 0.15, h, 0, 'prop');
  // pool of light on the ground under the head
  if (!y0 && ctx.pool && opts.pool !== false) {
    if (style === 'cobra') {
      const [ax, az] = rotPt(x, z, 0, -1.8, rot);
      ctx.pool(ax, az, h * 0.75, opts.light || '#ffcf82', 0.9);
    } else ctx.pool(x, z, 3.6, opts.light || '#ffe2a8', 0.75);
  }
}

/**
 * Chain-link fence along a straight line (posts, top rail, mesh). Adds a thin collider.
 * gaps: [[t0, t1], ...] fractions of the length left open (gates).
 */
export function fence(P, ax, az, bx, bz, h = 2.1, opts = {}) {
  const ctx = P.ctx;
  const b = P.get('solid');
  const m = P.get('chain');
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 3));
  const post = C(opts.post || '#8d9294');
  const gaps = opts.gaps || [];
  const inGap = (t) => gaps.some(([g0, g1]) => t > g0 && t < g1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (ctx.detail > 0 || i % 2 === 0 || i === n) cylinder(b, x, z, 0.05, 0.05, 0, h + 0.05, 4, post, { top: false });
  }
  const segs = [];
  let t0 = 0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    segs.push([t0, g0]);
    t0 = g1;
  }
  segs.push([t0, 1]);
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 1e-3) continue;
    const x0 = ax + (bx - ax) * s0;
    const z0 = az + (bz - az) * s0;
    const x1 = ax + (bx - ax) * s1;
    const z1 = az + (bz - az) * s1;
    const l = len * (s1 - s0);
    beam(b, x0, h, z0, x1, h, z1, 0.06, post);
    const tint = C(opts.mesh || '#b7bcbe');
    // double-sided material: one quad is enough
    m.quad(x0, 0.05, z0, x1, 0.05, z1, x1, h, z1, x0, h, z0, tint, 0, 0, l / 1.1, h / 1.1);
    if (opts.collide !== false) {
      // axis-aligned fences get one thin box; diagonal ones get slices
      const steps = Math.abs(x1 - x0) > 0.5 && Math.abs(z1 - z0) > 0.5 ? Math.ceil(l / 2) : 1;
      for (let k = 0; k < steps; k++) {
        const p0x = x0 + ((x1 - x0) * k) / steps;
        const p0z = z0 + ((z1 - z0) * k) / steps;
        const p1x = x0 + ((x1 - x0) * (k + 1)) / steps;
        const p1z = z0 + ((z1 - z0) * (k + 1)) / steps;
        ctx.col.addBox(Math.min(p0x, p1x) - 0.08, Math.min(p0z, p1z) - 0.08, Math.max(p0x, p1x) + 0.08, Math.max(p0z, p1z) + 0.08, h, 0, 'fence');
      }
    }
  }
}

/** Fence around a rect with optional gate gaps per side: { s: [[t0,t1]], e, n, w }. */
export function fenceRect(P, r, h = 2.1, gaps = {}, opts = {}) {
  fence(P, r.x0, r.z1, r.x1, r.z1, h, { ...opts, gaps: gaps.s });
  fence(P, r.x1, r.z1, r.x1, r.z0, h, { ...opts, gaps: gaps.e });
  fence(P, r.x1, r.z0, r.x0, r.z0, h, { ...opts, gaps: gaps.n });
  fence(P, r.x0, r.z0, r.x0, r.z1, h, { ...opts, gaps: gaps.w });
}

/** Low wall / hedge / curb along a line (jumpable when h < 1.2). */
export function lowWall(P, ax, az, bx, bz, h, thick, color, collide = true, mat = 'solid') {
  const b = P.get(mat);
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  obox(b, cx, cz, len, thick, 0, h, rot, C(color));
  if (collide) {
    const x0 = Math.min(ax, bx) - thick / 2;
    const x1 = Math.max(ax, bx) + thick / 2;
    const z0 = Math.min(az, bz) - thick / 2;
    const z1 = Math.max(az, bz) + thick / 2;
    P.ctx.col.addBox(x0, z0, x1, z1, h, 0, h < 1.2 ? 'prop' : 'fence');
  }
}

export function flagpole(P, x, z, h = 12) {
  const b = P.get('solid');
  cylinder(b, x, z, 0.12, 0.06, 0, h, 6, C('#d6d6d0'), { top: false });
  cylinder(b, x, z, 0.12, 0.12, h, h + 0.2, 6, C('#c9a640'));
  // flag: red/white stripes + blue canton, as a few quads facing east/west (double sided)
  const s = P.get('solid');
  const fw = 2.6;
  const fh = 1.5;
  const y1 = h - 0.2;
  for (let i = 0; i < 7; i++) {
    const c = C(i % 2 ? '#f2f2ee' : '#b3202a');
    const ya = y1 - (fh / 7) * (i + 1);
    const yb = y1 - (fh / 7) * i;
    s.quad(x, ya, z, x + fw, ya, z + 0.3, x + fw, yb, z + 0.3, x, yb, z, c);
    s.quad(x + fw, ya, z + 0.3, x, ya, z, x, yb, z, x + fw, yb, z + 0.3, c);
  }
  const blue = C('#23336b');
  s.quad(x, y1 - fh * 0.55, z - 0.01, x + fw * 0.42, y1 - fh * 0.55, z + 0.05 - 0.01, x + fw * 0.42, y1, z + 0.05 - 0.01, x, y1, z - 0.01, blue);
  s.quad(x + fw * 0.42, y1 - fh * 0.55, z + 0.05 + 0.01, x, y1 - fh * 0.55, z + 0.01, x, y1, z + 0.01, x + fw * 0.42, y1, z + 0.05 + 0.01, blue);
  P.ctx.col.addBox(x - 0.2, z - 0.2, x + 0.2, z + 0.2, h, 0, 'prop');
}

/** Swing set, slide and climbing frame in 1990s painted steel. */
export function playground(P, x, z, rot = 0) {
  const b = P.get('solid');
  const red = C('#c0392b');
  const yellow = C('#e0b12e');
  const blue = C('#2e6db4');
  const p = (lx, lz) => rotPt(x, z, lx, lz, rot);
  // swings: A-frames at both ends, top bar
  for (const sx of [-3, 3]) {
    const [a1x, a1z] = p(sx, -1.2);
    const [a2x, a2z] = p(sx, 1.2);
    const [tx, tz] = p(sx, 0);
    beam(b, a1x, 0, a1z, tx, 2.6, tz, 0.1, blue);
    beam(b, a2x, 0, a2z, tx, 2.6, tz, 0.1, blue);
  }
  const [t0x, t0z] = p(-3, 0);
  const [t1x, t1z] = p(3, 0);
  beam(b, t0x, 2.6, t0z, t1x, 2.6, t1z, 0.12, blue);
  for (const sx of [-1.8, -0.6, 0.6, 1.8]) {
    const [sx0, sz0] = p(sx - 0.25, 0);
    const [sx1, sz1] = p(sx + 0.25, 0);
    beam(b, sx0, 2.6, sz0, sx0, 0.6, sz0, 0.03, IRON);
    beam(b, sx1, 2.6, sz1, sx1, 0.6, sz1, 0.03, IRON);
    const [cx, cz] = p(sx, 0);
    obox(b, cx, cz, 0.6, 0.25, 0.55, 0.62, rot, C('#222'));
  }
  // slide
  const [lx, lz] = p(5.5, -1);
  obox(b, lx, lz, 0.9, 0.9, 0, 2.2, rot, yellow, { top: true });
  const [s0x, s0z] = p(5.5, -0.5);
  const [s1x, s1z] = p(5.5, 3.2);
  const sb = P.get('shiny');
  // chute
  const dx = s1x - s0x;
  const dz = s1z - s0z;
  const nx = -dz / Math.hypot(dx, dz) * 0.35;
  const nz = dx / Math.hypot(dx, dz) * 0.35;
  sb.quad(s0x - nx, 2.2, s0z - nz, s0x + nx, 2.2, s0z + nz, s1x + nx, 0.3, s1z + nz, s1x - nx, 0.3, s1z - nz, C('#c9ccce'));
  sb.quad(s1x - nx, 0.28, s1z - nz, s1x + nx, 0.28, s1z + nz, s0x + nx, 2.18, s0z + nz, s0x - nx, 2.18, s0z - nz, C('#c9ccce'));
  // climbing dome frame (jungle gym)
  const [gx, gz] = p(-6.5, 0);
  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const [ux, uz] = p(-8 + i, -1.5 + j);
      beam(b, ux, 0, uz, ux, 2, uz, 0.06, i % 2 ? red : yellow);
    }
    const [r0x, r0z] = p(-8 + i, -1.5);
    const [r1x, r1z] = p(-8 + i, 1.5);
    beam(b, r0x, 2, r0z, r1x, 2, r1z, 0.06, red);
    const [c0x, c0z] = p(-8, -1.5 + i);
    const [c1x, c1z] = p(-5, -1.5 + i);
    beam(b, c0x, 1, c0z, c1x, 1, c1z, 0.06, yellow);
    beam(b, c0x, 2, c0z, c1x, 2, c1z, 0.06, red);
  }
  // sand / wood-chip pad
  const g = P.get('ground');
  const T = P.ctx.T;
  const rw = T.rows.dirt;
  const q = [p(-9, 2.5), p(7, 2.5), p(7, -2.5), p(-9, -2.5)];
  g.quad(q[0][0], 0.07, q[0][1], q[1][0], 0.07, q[1][1], q[2][0], 0.07, q[2][1], q[3][0], 0.07, q[3][1], C('#d8c49a'), 0, rw.v0, 2, rw.v1);
  const col = P.ctx.col;
  const [ax, az] = p(0, 0);
  col.addBox(ax - 3.3, az - 1.3, ax + 3.3, az + 1.3, 2.7, 1.8, 'prop');
  col.addBox(lx - 0.5, lz - 0.5, lx + 0.5, lz + 0.5, 2.2, 0, 'prop');
  col.addBox(gx - 1.6, gz - 1.6, gx + 1.6, gz + 1.6, 2.1, 0, 'prop');
}

/** Basketball hoop on a pole at (x, z), backboard facing heading rot. */
export function hoop(P, x, z, rot) {
  const b = P.get('solid');
  const [px, pz] = rotPt(x, z, 0, 1.1, rot);
  cylinder(b, px, pz, 0.1, 0.1, 0, 3.3, 5, C('#5d6468'), { top: false });
  const [ax, az] = rotPt(x, z, 0, 0.1, rot);
  beam(b, px, 3.2, pz, ax, 3.2, az, 0.1, C('#5d6468'));
  obox(b, ax, az, 1.8, 0.06, 2.9, 3.95, rot, C('#f2f2ee'));
  const [rx, rz] = rotPt(x, z, 0, -0.25, rot);
  cylinder(b, rx, rz, 0.24, 0.24, 3.02, 3.06, 8, C('#e0621e'), { top: false });
  P.ctx.col.addBox(px - 0.15, pz - 0.15, px + 0.15, pz + 0.15, 3.3, 0, 'prop');
}

/**
 * Sign quad showing atlas sign `id`, centred at (x, y, z), w × h meters, its face looking along
 * heading `facing` (0 = the readable side faces north). twoSided adds the back face.
 */
export function sign(P, id, x, y, z, w, h, facing, opts = {}) {
  const r = P.ctx.S.rect(id);
  const b = P.get('signs');
  if (!h) h = w / r.aspect;
  const dx = -Math.cos(facing) * (w / 2);
  const dz = Math.sin(facing) * (w / 2);
  const ox = -Math.sin(facing) * (opts.out || 0.02);
  const oz = -Math.cos(facing) * (opts.out || 0.02);
  const c = C(opts.tint || '#ffffff');
  b.quad(x - dx + ox, y - h / 2, z - dz + oz, x + dx + ox, y - h / 2, z + dz + oz, x + dx + ox, y + h / 2, z + dz + oz, x - dx + ox, y + h / 2, z - dz + oz, c, r.u0, r.v0, r.u1, r.v1);
  if (opts.twoSided) b.quad(x + dx - ox, y - h / 2, z + dz - oz, x - dx - ox, y - h / 2, z - dz - oz, x - dx - ox, y + h / 2, z - dz - oz, x + dx - ox, y + h / 2, z + dz - oz, c, r.u0, r.v0, r.u1, r.v1);
  return h;
}

/** Sign lying flat on the ground (runway numbers), text up = heading `facing`. */
export function groundSign(P, id, x, y, z, w, h, facing) {
  const r = P.ctx.S.rect(id);
  const b = P.get('signs');
  const [ax, az] = rotPt(x, z, -w / 2, h / 2, facing);
  const [bx, bz] = rotPt(x, z, w / 2, h / 2, facing);
  const [cx, cz] = rotPt(x, z, w / 2, -h / 2, facing);
  const [dx, dz] = rotPt(x, z, -w / 2, -h / 2, facing);
  b.quad(ax, y, az, bx, y, bz, cx, y, cz, dx, y, dz, C('#ffffff'), r.u0, r.v0, r.u1, r.v1);
}

/** Free-standing sign on two posts (park / project entrance sign), readable side facing `facing`. */
export function postSign(P, id, x, z, w, facing, opts = {}) {
  const b = P.get('solid');
  const r = P.ctx.S.rect(id);
  const h = w / r.aspect;
  const y = (opts.y || 0.9) + h / 2;
  sign(P, id, x, y, z, w, h, facing, { twoSided: opts.twoSided, out: 0.06 });
  const post = C(opts.post || '#4a3a2a');
  for (const s of [-1, 1]) {
    const [px, pz] = rotPt(x, z, s * (w / 2 - 0.1), 0, facing);
    obox(b, px, pz, 0.14, 0.14, 0, y + h / 2 + 0.05, facing, post);
  }
  // back board so the sign has thickness
  obox(b, x, z, w, 0.08, y - h / 2, y + h / 2, facing, shade(post, 0.8));
  const [c0x, c0z] = rotPt(x, z, -w / 2, 0, facing);
  const [c1x, c1z] = rotPt(x, z, w / 2, 0, facing);
  P.ctx.col.addBox(Math.min(c0x, c1x) - 0.1, Math.min(c0z, c1z) - 0.1, Math.max(c0x, c1x) + 0.1, Math.max(c0z, c1z) + 0.1, y + h / 2, 0, 'prop');
}

/** Payphone on a pedestal (Northwestern Bell blue). Returns the POI stand point. */
export function payphone(P, x, z, facing) {
  const b = P.get('solid');
  cylinder(b, x, z, 0.06, 0.06, 0, 1.1, 4, C('#8a8f93'), { top: false });
  obox(b, x, z, 0.5, 0.35, 1.0, 1.7, facing, C('#9aa1a6'));
  obox(b, x, z, 0.62, 0.45, 1.7, 1.95, facing, C('#1f4f9a'));
  const [fx, fz] = rotPt(x, z, 0, -0.19, facing);
  obox(b, fx, fz, 0.3, 0.04, 1.15, 1.55, facing, C('#2a2d30'));
  P.ctx.col.addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.9, 0, 'prop');
  const [sx, sz] = rotPt(x, z, 0, -0.9, facing);
  return { x: sx, z: sz, heading: facing + Math.PI };
}

/** Clothesline between two T-posts with a few pieces of laundry. */
export function clothesline(P, ax, az, bx, bz, rng) {
  const b = P.get('solid');
  const post = C('#7d8284');
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const nx = (-dz / len) * 0.6;
  const nz = (dx / len) * 0.6;
  for (const [x, z] of [[ax, az], [bx, bz]]) {
    beam(b, x, 0, z, x, 1.9, z, 0.07, post);
    beam(b, x - nx, 1.9, z - nz, x + nx, 1.9, z + nz, 0.06, post);
  }
  for (const s of [-0.5, 0, 0.5]) beam(b, ax + nx * s, 1.88, az + nz * s, bx + nx * s, 1.88, bz + nz * s, 0.015, C('#e8e8e8'));
  const colors = ['#f2f2ee', '#c0392b', '#2e6db4', '#e0b12e', '#f4f4f0', '#6b8e5a'];
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const t = 0.1 + rng() * 0.8;
    const s = [-0.5, 0, 0.5][Math.floor(rng() * 3)];
    const cx = ax + dx * t + nx * s;
    const cz = az + dz * t + nz * s;
    const w = 0.4 + rng() * 0.5;
    const hh = 0.5 + rng() * 0.4;
    const ux = (dx / len) * (w / 2);
    const uz = (dz / len) * (w / 2);
    const c = C(colors[Math.floor(rng() * colors.length)]);
    b.quad(cx - ux, 1.86 - hh, cz - uz, cx + ux, 1.86 - hh, cz + uz, cx + ux, 1.86, cz + uz, cx - ux, 1.86, cz - uz, c);
    b.quad(cx + ux, 1.86 - hh, cz + uz, cx - ux, 1.86 - hh, cz - uz, cx - ux, 1.86, cz - uz, cx + ux, 1.86, cz + uz, c);
  }
}

// ------------------------------------------------------------------ flood gear
/**
 * Type III barricade with a 'ROAD CLOSED HIGH WATER' sign and a blinking amber lamp, spanning
 * width w centred at (x, z), facing heading `facing` (approaching drivers see the front).
 */
export function barricade(P, x, z, w, facing) {
  const ctx = P.ctx;
  const b = P.get('solid');
  const white = C('#f2f2ec');
  const orange = C('#e8661c');
  const n = Math.max(3, Math.round(w / 0.6));
  for (const rail of [0.55, 1.0, 1.45]) {
    for (let i = 0; i < n; i++) {
      const t0 = -w / 2 + (w * i) / n;
      const [cx, cz] = rotPt(x, z, t0 + w / n / 2, 0, facing);
      obox(b, cx, cz, w / n, 0.06, rail, rail + 0.25, facing, i % 2 ? white : orange);
    }
  }
  for (const s of [-1, 1]) {
    const [lx, lz] = rotPt(x, z, s * (w / 2 - 0.2), 0, facing);
    obox(b, lx, lz, 0.1, 0.5, 0, 1.75, facing, white);
    const [fx, fz] = rotPt(x, z, s * (w / 2 - 0.2), -0.35, facing);
    obox(b, fx, fz, 0.35, 0.1, 0, 0.08, facing, C('#555'));
  }
  const [sgx, sgz] = rotPt(x, z, 0, -0.06, facing);
  const sh = sign(P, 'roadclosed', sgx, 2.35, sgz, 1.6, 0, facing, { twoSided: true });
  // sign plate backing
  const [sx, sz] = rotPt(x, z, 0, -0.03, facing);
  obox(b, sx, sz, 1.6, 0.03, 2.35 - sh / 2, 2.35 + sh / 2, facing, C('#8b8b86'));
  for (const s of [-1, 1]) {
    const [lx, lz] = rotPt(x, z, s * (w / 2 - 0.2), 0, facing);
    cylinder(b, lx, lz, 0.1, 0.1, 1.75, 1.95, 6, C('#222'));
    cylinder(P.get('lights'), lx, lz, 0.1, 0.09, 1.95, 2.12, 6, C('#ffb020'));
    ctx.blink(lx, 2.05, lz, '#ffb020', 2.2);
  }
  const [c0x, c0z] = rotPt(x, z, -w / 2, 0, facing);
  const [c1x, c1z] = rotPt(x, z, w / 2, 0, facing);
  ctx.col.addBox(Math.min(c0x, c1x) - 0.2, Math.min(c0z, c1z) - 0.2, Math.max(c0x, c1x) + 0.2, Math.max(c0z, c1z) + 0.2, 1.1, 0, 'prop');
}

/** Pile/wall of sandbags as small rounded boxes (for spots the player can walk up to). */
export function sandbagWall(P, ax, az, bx, bz, courses = 3) {
  const b = P.get('solid');
  const rng = P.ctx.rng;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  const n = Math.max(1, Math.round(len / 0.62));
  for (let r = 0; r < courses; r++) {
    const off = (r % 2) * 0.31;
    const inset = r * 0.12;
    for (let i = 0; i < n - (r % 2); i++) {
      const t = (i * 0.62 + off + 0.31) / len;
      if (t > 1) continue;
      const cx = ax + (bx - ax) * t;
      const cz = az + (bz - az) * t;
      const c = jitter(C('#b9a578'), rng, 0.12);
      obox(b, cx, cz, 0.58, 0.42 - inset, r * 0.2, r * 0.2 + 0.21, rot + (rng() - 0.5) * 0.12, c);
    }
  }
  P.ctx.col.addBox(Math.min(ax, bx) - 0.3, Math.min(az, bz) - 0.3, Math.max(ax, bx) + 0.3, Math.max(az, bz) + 0.3, courses * 0.2 + 0.05, 0, 'prop');
}

// ------------------------------------------------------------------ rail cars
const RAILCARS = [
  { kind: 'box', color: '#7a3b24' },
  { kind: 'box', color: '#5d4636' },
  { kind: 'box', color: '#8a4b2c' },
  { kind: 'box', color: '#2f4f4a' },
  { kind: 'hopper', color: '#c9a227' },
  { kind: 'hopper', color: '#9aa0a3' },
  { kind: 'hopper', color: '#b5b2a8' },
  { kind: 'tank', color: '#1f1f22' },
  { kind: 'gondola', color: '#4a3a30' },
];

/** One freight car centred at (x, z), long axis along heading rot (0 = along z). */
export function railcar(P, x, z, rot, rng, kind = null) {
  const b = P.get('solid');
  const spec = kind ? RAILCARS.find((r) => r.kind === kind) : RAILCARS[Math.floor(rng() * RAILCARS.length)];
  const c = jitter(C(spec.color), rng, 0.08);
  const L = spec.kind === 'tank' ? 13 : spec.kind === 'hopper' ? 15 : 15.5;
  const W = 3.0;
  // trucks + frame
  for (const s of [-1, 1]) {
    const [tx, tz] = rotPt(x, z, 0, s * (L / 2 - 2), rot);
    obox(b, tx, tz, 2.2, 2.6, 0.2, 0.9, rot, C('#1d1d1d'));
  }
  obox(b, x, z, W * 0.9, L, 0.9, 1.25, rot, C('#262626'));
  if (spec.kind === 'box') {
    obox(b, x, z, W, L, 1.25, 4.3, rot, c, { cTop: shade(c, 0.85) });
    // doors
    for (const s of [-1, 1]) {
      const [dx, dz] = rotPt(x, z, s * (W / 2 + 0.02), 0, rot);
      obox(b, dx, dz, 0.04, 3.2, 1.5, 4.0, rot, shade(c, 0.78));
    }
  } else if (spec.kind === 'hopper') {
    obox(b, x, z, W, L - 1.5, 1.6, 4.4, rot, c);
    for (const s of [-1, 1]) {
      const [ex, ez] = rotPt(x, z, 0, s * (L / 2 - 0.75), rot);
      obox(b, ex, ez, W * 0.8, 1.5, 1.25, 3.2, rot, shade(c, 0.9));
    }
    const [bx, bz] = rotPt(x, z, 0, 0, rot);
    obox(b, bx, bz, W * 0.6, L - 5, 0.9, 1.6, rot, shade(c, 0.7));
  } else if (spec.kind === 'tank') {
    // tank lying along the car: build a cylinder oriented along the rot axis
    const m = new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(x, 2.6, z);
    b.addGeometry(new THREE.CylinderGeometry(1.4, 1.4, L - 0.6, 8, 1), m, c);
    const [dx, dz] = rotPt(x, z, 0, 0, rot);
    cylinder(b, dx, dz, 0.45, 0.45, 3.9, 4.3, 6, shade(c, 1.3));
  } else {
    obox(b, x, z, W, L, 1.25, 2.6, rot, c, { top: false });
    obox(b, x, z, W - 0.3, L - 0.3, 1.3, 1.5, rot, shade(c, 0.6));
  }
}

// ------------------------------------------------------------------ vehicles for animation
/**
 * Jet airliner geometry (1993 twin-jet), nose toward -Z, wheels at y = 0. Vertex colors carry the
 * livery. Returns a BufferGeometry (for static parked jets add it into a Builder instead).
 */
export function jetGeometry(Builder, livery = {}) {
  const b = new Builder();
  const body = C(livery.body || '#eef0f2');
  const belly = C(livery.belly || '#b9bec3');
  const stripe = C(livery.stripe || '#b3202a');
  const tail = C(livery.tail || livery.stripe || '#b3202a');
  const glass = C('#1d242b');
  const engine = C('#c4c8cc');
  const r = 1.9;
  const L = 30;
  const y = 2.6;
  // fuselage along z (-L/2 nose .. +L/2 tail) as an 8-sided tube
  const seg = 8;
  const ring = (z, rr, yy = y) => {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + Math.PI / seg;
      pts.push([Math.cos(a) * rr, yy + Math.sin(a) * rr, z]);
    }
    return pts;
  };
  const tube = (A, B, colorFor) => {
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const c = colorFor(i);
      b.quad(A[i][0], A[i][1], A[i][2], A[j][0], A[j][1], A[j][2], B[j][0], B[j][1], B[j][2], B[i][0], B[i][1], B[i][2], c);
    }
  };
  // rows: i indexes around; bottom faces (i = 4..6 roughly) get the belly color
  const colorAround = (i) => (i >= 4 && i <= 6 ? belly : body);
  const stripeAround = (i) => (i === 0 || i === 3 ? stripe : colorAround(i));
  const rNose = ring(-L / 2 - 1.8, 0.2, y - 0.4);
  const r0 = ring(-L / 2, r * 0.8, y - 0.15);
  const r1 = ring(-L / 2 + 3, r);
  const r2 = ring(L / 2 - 6, r);
  const r3 = ring(L / 2, 0.45, y + 0.9);
  tube(rNose, r0, (i) => (i === 1 || i === 2 ? glass : colorAround(i)));
  tube(r0, r1, (i) => (i === 1 || i === 2 ? glass : stripeAround(i)));
  tube(r1, r2, stripeAround);
  tube(r2, r3, colorAround);
  // wings (swept), horizontal tail, fin
  const wing = (side) => {
    const s = side;
    const root0 = [s * r * 0.8, y - 0.8, -2.5];
    const root1 = [s * r * 0.8, y - 0.8, 3.5];
    const tip0 = [s * 14, y - 0.2, 4.5];
    const tip1 = [s * 14, y - 0.2, 6.2];
    const top = [root0, root1, tip1, tip0];
    const up = s > 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
    b.quad(...top[up[0]], ...top[up[1]], ...top[up[2]], ...top[up[3]], body);
    const bot = top.map((p) => [p[0], p[1] - 0.25, p[2]]);
    const dn = s > 0 ? [1, 0, 3, 2] : [0, 1, 2, 3];
    b.quad(...bot[dn[0]], ...bot[dn[1]], ...bot[dn[2]], ...bot[dn[3]], belly);
    // engine nacelle under the wing
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    m.setPosition(s * 5, y - 1.7, 0.5);
    b.addGeometry(new THREE.CylinderGeometry(0.85, 0.75, 4, 8, 1, true), m, engine);
  };
  wing(1);
  wing(-1);
  for (const s of [1, -1]) {
    const p = [[s * 0.4, y + 0.6, L / 2 - 4.5], [s * 0.4, y + 0.6, L / 2 - 1.5], [s * 6, y + 0.9, L / 2 - 0.2], [s * 6, y + 0.9, L / 2 - 1.8]];
    const o = s > 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
    b.quad(...p[o[0]], ...p[o[1]], ...p[o[2]], ...p[o[3]], body);
    const q = p.map((v) => [v[0], v[1] - 0.12, v[2]]);
    const u = s > 0 ? [1, 0, 3, 2] : [0, 1, 2, 3];
    b.quad(...q[u[0]], ...q[u[1]], ...q[u[2]], ...q[u[3]], belly);
  }
  const fin = [[0, y + 1.4, L / 2 - 6.5], [0, y + 1.4, L / 2 - 0.5], [0, y + 7.5, L / 2 + 0.6], [0, y + 7.5, L / 2 - 2.2]];
  b.quad(...fin[1], ...fin[0], ...fin[3], ...fin[2], tail);
  b.quad(...fin[0], ...fin[1], ...fin[2], ...fin[3], tail);
  // landing gear
  for (const [gx, gz] of [[0, -L / 2 + 3.5], [2.2, 2], [-2.2, 2]]) {
    beam(b, gx, 0.5, gz, gx, y - 1, gz, 0.2, C('#555'));
    cylinder(b, gx, gz, 0.5, 0.5, 0, 0.6, 6, C('#1a1a1a'));
  }
  return b;
}

/** Simple 1990s sedan for instanced freeway traffic (white body = instance color). */
export function carGeometry(Builder) {
  const b = new Builder();
  const body = C('#ffffff');
  const dark = C('#20242a');
  const tire = C('#111111');
  box(b, -0.9, 0.35, -2.3, 0.9, 1.0, 2.3, body);
  // cabin with a slanted windshield
  b.quad(0.8, 1.0, -0.9, -0.8, 1.0, -0.9, -0.75, 1.45, -0.3, 0.75, 1.45, -0.3, dark);
  b.quad(-0.8, 1.0, 1.3, 0.8, 1.0, 1.3, 0.75, 1.45, 0.9, -0.75, 1.45, 0.9, dark);
  b.quad(0.8, 1.0, 1.3, 0.8, 1.0, -0.9, 0.75, 1.45, -0.3, 0.75, 1.45, 0.9, dark);
  b.quad(-0.8, 1.0, -0.9, -0.8, 1.0, 1.3, -0.75, 1.45, 0.9, -0.75, 1.45, -0.3, dark);
  flat(b, -0.75, -0.3, 0.75, 0.9, 1.45, body);
  for (const [x, z] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, 1.4], [0.9, 1.4]]) box(b, x - 0.12, 0, z - 0.33, x + 0.12, 0.62, z + 0.33, tire);
  return b;
}
