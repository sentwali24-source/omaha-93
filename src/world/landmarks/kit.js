import * as THREE from 'three';

// Geometry toolkit for the landmark builders.
//
// Everything static is written into `Builder`s — growable, non-indexed triangle soups with
// position / normal / uv / color — one Builder per material per `Cluster`. A cluster is flushed
// into one Mesh per material, so a whole landmark group costs a handful of draw calls and
// frustum culling still works per group.
//
// Winding rule used everywhere: a wall from point A to point B (seen from above) faces to the
// RIGHT of A→B, i.e. its outward normal is (-dz, dx). Walk a footprint south → east → north →
// west (x0→x1 at z1, z1→z0 at x1, x1→x0 at z0, z0→z1 at x0) and every wall faces outward.

// ------------------------------------------------------------------ colors
const colorCache = new Map();

/** Cached linear-space THREE.Color from a css color string. Never mutate the result. */
export function C(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

/** New color = c * f (build time only). */
export const shade = (c, f) => new THREE.Color(c.r * f, c.g * f, c.b * f);

/** New color between a and b. */
export const mix = (a, b, t) => new THREE.Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);

/** Slight random brightness jitter so merged surfaces don't look flat. */
export const jitter = (c, rng, amt = 0.08) => shade(c, 1 - amt + rng() * amt * 2);

// ------------------------------------------------------------------ builder
export class Builder {
  constructor() {
    this.count = 0;
    this.cap = 0;
    this.P = null;
    this.N = null;
    this.U = null;
    this.K = null;
    this._ensure(512);
  }

  _ensure(n) {
    const need = this.count + n;
    if (need <= this.cap) return;
    let cap = Math.max(512, this.cap * 2);
    while (cap < need) cap *= 2;
    const P = new Float32Array(cap * 3);
    const N = new Float32Array(cap * 3);
    const U = new Float32Array(cap * 2);
    const K = new Float32Array(cap * 3);
    if (this.P) {
      P.set(this.P.subarray(0, this.count * 3));
      N.set(this.N.subarray(0, this.count * 3));
      U.set(this.U.subarray(0, this.count * 2));
      K.set(this.K.subarray(0, this.count * 3));
    }
    this.P = P;
    this.N = N;
    this.U = U;
    this.K = K;
    this.cap = cap;
  }

  _v(x, y, z, nx, ny, nz, u, v, c) {
    const i = this.count++;
    const i3 = i * 3;
    this.P[i3] = x;
    this.P[i3 + 1] = y;
    this.P[i3 + 2] = z;
    this.N[i3] = nx;
    this.N[i3 + 1] = ny;
    this.N[i3 + 2] = nz;
    this.U[i * 2] = u;
    this.U[i * 2 + 1] = v;
    this.K[i3] = c.r;
    this.K[i3 + 1] = c.g;
    this.K[i3 + 2] = c.b;
  }

  /** Triangle a-b-c (counter-clockwise from the front), flat normal. */
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, c, au = 0, av = 0, bu = 0, bv = 0, cu = 0, cv = 0) {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this._ensure(3);
    this._v(ax, ay, az, nx, ny, nz, au, av, c);
    this._v(bx, by, bz, nx, ny, nz, bu, bv, c);
    this._v(cx, cy, cz, nx, ny, nz, cu, cv, c);
  }

  /** Quad a-b-c-d (a = bottom-left, b = bottom-right, c = top-right, d = top-left seen from the front). */
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, c, u0 = 0, v0 = 0, u1 = 0, v1 = 0) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, c, u0, v0, u1, v0, u1, v1);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, c, u0, v0, u1, v1, u0, v1);
  }

  /** Append a three.js BufferGeometry transformed by matrix (Matrix4 or null). Flat normals. */
  addGeometry(geo, matrix, c, uvScale = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    const n = pos.count;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      if (matrix) v.applyMatrix4(matrix);
      pts[i * 3] = v.x;
      pts[i * 3 + 1] = v.y;
      pts[i * 3 + 2] = v.z;
    }
    for (let i = 0; i < n; i += 3) {
      const a = i * 3;
      const u = uv && uvScale ? uv : null;
      this.tri(
        pts[a], pts[a + 1], pts[a + 2], pts[a + 3], pts[a + 4], pts[a + 5], pts[a + 6], pts[a + 7], pts[a + 8], c,
        u ? u.getX(i) * uvScale : 0, u ? u.getY(i) * uvScale : 0,
        u ? u.getX(i + 1) * uvScale : 0, u ? u.getY(i + 1) * uvScale : 0,
        u ? u.getX(i + 2) * uvScale : 0, u ? u.getY(i + 2) * uvScale : 0,
      );
    }
    if (g !== geo) g.dispose();
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    const n = this.count;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.K.slice(0, n * 3), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------------ cluster
// Materials whose merged meshes cast shadows (when quality.shadows).
const CASTERS = new Set(['solid', 'office', 'slab', 'glass', 'masonry', 'lowrise', 'shiny']);

export class Cluster {
  constructor(ctx, name) {
    this.ctx = ctx;
    this.name = name;
    this.builders = new Map();
    this.meshes = [];
  }

  get(mat) {
    let b = this.builders.get(mat);
    if (!b) {
      b = new Builder();
      this.builders.set(mat, b);
    }
    return b;
  }

  /** Turn every builder into a mesh under ctx.group. Returns the meshes. */
  flush() {
    const ctx = this.ctx;
    for (const [mat, b] of this.builders) {
      if (!b.count) continue;
      const material = ctx.M[mat];
      if (!material) throw new Error(`landmarks: unknown material ${mat}`);
      const mesh = new THREE.Mesh(b.geometry(), material);
      mesh.name = `lm:${this.name}:${mat}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = mat !== 'lights' && mat !== 'beacon';
      mesh.castShadow = !!ctx.shadows && CASTERS.has(mat);
      ctx.group.add(mesh);
      this.meshes.push(mesh);
      ctx.stats.meshes++;
      ctx.stats.triangles += b.count / 3;
    }
    this.builders.clear();
    return this.meshes;
  }
}

// ------------------------------------------------------------------ facade uv mapping
// A facade spec describes how a wall material maps onto a wall:
//   { mat: 'office'|'slab'|'glass'|'masonry', tint, bay, floor }   repeating window textures:
//        u counts texture tiles along the wall (an integer number of bays per wall), v counts floors
//   { mat: 'lowrise', row: 'rowhouse', tint, tile }   strip atlas: v spans the row, u repeats
//        every `tile` meters
//   { mat: 'solid', tint }   plain vertex color
// ctx.T.tiles[mat] = { bays, floors } per texture tile; ctx.T.rows[row] = { v0, v1 }.

/** UV range for a wall segment of length len, height y0..y1. Returns [u0, v0, u1, v1]. */
export function facadeUV(ctx, f, len, y0, y1, uStart = 0) {
  if (!f || f.mat === 'solid' || !ctx.T) return [0, 0, 0, 0];
  if (f.mat === 'lowrise' || f.mat === 'ground') {
    const row = ctx.T.rows[f.row];
    const tile = f.tile || 12;
    const reps = f.fit ? Math.max(1, Math.round(len / tile)) : len / tile;
    return [uStart, row.v0, uStart + reps, row.v1];
  }
  const t = ctx.T.tiles[f.mat];
  const bays = Math.max(1, Math.round(len / (f.bay || 3.2)));
  const floorH = f.floor || 3.6;
  const fy0 = (y0 - (f.base || 0)) / floorH;
  const fy1 = (y1 - (f.base || 0)) / floorH;
  const uo = (f.uOff || 0) / t.bays;
  const vo = (f.vOff || 0) / t.floors;
  return [uo + uStart, fy0 / t.floors + vo, uo + uStart + bays / t.bays, fy1 / t.floors + vo];
}

/** Vertical wall from (ax, az) to (bx, bz), facing right of A→B. */
export function wall(P, f, ax, az, bx, bz, y0, y1, uStart = 0) {
  const ctx = P.ctx;
  const b = P.get(f.mat || 'solid');
  const len = Math.hypot(bx - ax, bz - az);
  const [u0, v0, u1, v1] = facadeUV(ctx, f, len, y0, y1, uStart);
  b.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, f.color || C(f.tint || '#ffffff'), u0, v0, u1, v1);
}

/** Horizontal quad (roof / slab top) facing up, or down when down = true. */
export function flat(b, x0, z0, x1, z1, y, c, down = false, uvScale = 0) {
  const u0 = x0 * uvScale;
  const u1 = x1 * uvScale;
  const v0 = -z1 * uvScale;
  const v1 = -z0 * uvScale;
  if (!down) b.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, c, u0, v0, u1, v1);
  else b.quad(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1, c, u0, v1, u1, v0);
}

/** Axis-aligned box. opts: { top = true, bottom = false, walls = true, uvScale } (solid color). */
export function box(b, x0, y0, z0, x1, y1, z1, c, opts = {}) {
  const { top = true, bottom = false, walls = true, cTop = c } = opts;
  if (walls) {
    b.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, c);
    b.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, c);
    b.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, c);
    b.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, c);
  }
  if (top) flat(b, x0, z0, x1, z1, y1, cTop, false, opts.uvScale || 0);
  if (bottom) flat(b, x0, z0, x1, z1, y0, c, true);
}

/** Box centred at (cx, cz) with size w (x) × d (z), rotated by rot around Y. */
export function obox(b, cx, cz, w, d, y0, y1, rot, c, opts = {}) {
  const q = rotRect(cx, cz, w, d, rot);
  const { top = true, bottom = false, cTop = c } = opts;
  // q = corners [sw, se, ne, nw] in local terms (x0,z1) (x1,z1) (x1,z0) (x0,z0)
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const n = q[(i + 1) % 4];
    b.quad(a[0], y0, a[1], n[0], y0, n[1], n[0], y1, n[1], a[0], y1, a[1], c);
  }
  if (top) b.quad(q[0][0], y1, q[0][1], q[1][0], y1, q[1][1], q[2][0], y1, q[2][1], q[3][0], y1, q[3][1], cTop);
  if (bottom) b.quad(q[3][0], y0, q[3][1], q[2][0], y0, q[2][1], q[1][0], y0, q[1][1], q[0][0], y0, q[0][1], c);
}

/** Corners of a rotated rect in walking order (south, east, north, west walls). */
export function rotRect(cx, cz, w, d, rot) {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const pts = [
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [w / 2, -d / 2],
    [-w / 2, -d / 2],
  ];
  return pts.map(([x, z]) => [cx + x * cs + z * sn, cz - x * sn + z * cs]);
}

/** Rotate a local offset (x, z) by rot and add to (cx, cz). */
export function rotPt(cx, cz, x, z, rot) {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return [cx + x * cs + z * sn, cz - x * sn + z * cs];
}

/**
 * A building block: textured walls (facade f) around a polygon footprint + flat roof.
 * pts: [[x, z], ...] walked so walls face outward (see winding rule). Roof in solid color.
 */
export function prism(P, f, pts, y0, y1, roofColor, opts = {}) {
  let u = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    wall(P, f, a[0], a[1], b[0], b[1], y0, y1, opts.continuousU ? u : 0);
    if (opts.continuousU) u += Math.hypot(b[0] - a[0], b[1] - a[1]) / (opts.continuousU || 12);
  }
  if (roofColor) polyRoof(P.get(opts.roofMat || 'solid'), pts, y1, roofColor);
}

/** Flat upward-facing roof over a simple polygon footprint. */
export function polyRoof(b, pts, y, c) {
  const shape = pts.map((p) => new THREE.Vector2(p[0], -p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const t of tris) {
    const A = pts[t[0]];
    const B = pts[t[1]];
    const D = pts[t[2]];
    const cross = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
    if (cross < 0) b.tri(A[0], y, A[1], B[0], y, B[1], D[0], y, D[1], c);
    else b.tri(A[0], y, A[1], D[0], y, D[1], B[0], y, B[1], c);
  }
}

/** Rectangular footprint → points in the outward winding order. */
export const rectPts = (x0, z0, x1, z1) => [
  [x0, z1],
  [x1, z1],
  [x1, z0],
  [x0, z0],
];

/** Textured box building: facade walls + roof. */
export function block(P, f, x0, z0, x1, z1, y0, y1, roofColor = C('#6d6a66')) {
  prism(P, f, rectPts(x0, z0, x1, z1), y0, y1, roofColor);
}

/** Rotated textured block. */
export function oblock(P, f, cx, cz, w, d, rot, y0, y1, roofColor = C('#6d6a66')) {
  prism(P, f, rotRect(cx, cz, w, d, rot), y0, y1, roofColor);
}

/** Cylinder / frustum (optionally faceted) around a vertical axis. */
export function cylinder(b, cx, cz, r0, r1, y0, y1, seg, c, opts = {}) {
  const { top = true, bottom = false, a0 = 0, a1 = Math.PI * 2, cTop = c } = opts;
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const x0 = Math.cos(t0);
    const z0 = -Math.sin(t0);
    const x1 = Math.cos(t1);
    const z1 = -Math.sin(t1);
    // increasing angle walks counter-clockwise on a north-up map, so the outside is on the right
    b.quad(cx + x0 * r0, y0, cz + z0 * r0, cx + x1 * r0, y0, cz + z1 * r0, cx + x1 * r1, y1, cz + z1 * r1, cx + x0 * r1, y1, cz + z0 * r1, c);
    if (top && r1 > 0) b.tri(cx, y1, cz, cx + x0 * r1, y1, cz + z0 * r1, cx + x1 * r1, y1, cz + z1 * r1, cTop);
    if (bottom) b.tri(cx, y0, cz, cx + x1 * r0, y0, cz + z1 * r0, cx + x0 * r0, y0, cz + z0 * r0, c);
  }
  if (!full && opts.caps) {
    // close the open sides of a partial cylinder
    const e0 = [Math.cos(a0), -Math.sin(a0)];
    const e1 = [Math.cos(a1), -Math.sin(a1)];
    b.quad(cx, y0, cz, cx + e0[0] * r0, y0, cz + e0[1] * r0, cx + e0[0] * r1, y1, cz + e0[1] * r1, cx, y1, cz, c);
    b.quad(cx + e1[0] * r0, y0, cz + e1[1] * r0, cx, y0, cz, cx, y1, cz, cx + e1[0] * r1, y1, cz + e1[1] * r1, c);
  }
}

/** Textured curved wall (outside of a cylinder arc, a0 < a1 counter-clockwise) using facade f. */
export function curvedWall(P, f, cx, cz, r, a0, a1, seg, y0, y1) {
  const ctx = P.ctx;
  const b = P.get(f.mat || 'solid');
  const c = f.color || C(f.tint || '#ffffff');
  const arc = Math.abs(a1 - a0) * r;
  // one uv range for the whole arc so the window grid runs smoothly around it
  const [u0, v0, u1, v1] = facadeUV(ctx, f, arc, y0, y1, 0);
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const ax = cx + Math.cos(t0) * r;
    const az = cz - Math.sin(t0) * r;
    const bx = cx + Math.cos(t1) * r;
    const bz = cz - Math.sin(t1) * r;
    const ua = u0 + ((u1 - u0) * i) / seg;
    const ub = u0 + ((u1 - u0) * (i + 1)) / seg;
    b.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, c, ua, v0, ub, v1);
  }
}

/** Gable roof over a rect; ridge along 'x' or 'z'. Gable-end triangles use cEnd. */
export function gableRoof(b, x0, z0, x1, z1, y0, rise, axis, c, cEnd = c, over = 0.4) {
  if (axis === 'x') {
    const zm = (z0 + z1) / 2;
    const X0 = x0 - over;
    const X1 = x1 + over;
    const Z0 = z0 - over;
    const Z1 = z1 + over;
    const yr = y0 + rise;
    const ye = y0 - over * (rise / ((z1 - z0) / 2));
    b.quad(X0, ye, Z1, X1, ye, Z1, X1, yr, zm, X0, yr, zm, c); // south slope
    b.quad(X1, ye, Z0, X0, ye, Z0, X0, yr, zm, X1, yr, zm, c); // north slope
    b.tri(x1, y0, z1, x1, y0, z0, x1, yr, zm, cEnd); // east gable
    b.tri(x0, y0, z0, x0, y0, z1, x0, yr, zm, cEnd); // west gable
  } else {
    const xm = (x0 + x1) / 2;
    const X0 = x0 - over;
    const X1 = x1 + over;
    const Z0 = z0 - over;
    const Z1 = z1 + over;
    const yr = y0 + rise;
    const ye = y0 - over * (rise / ((x1 - x0) / 2));
    b.quad(X1, ye, Z1, X1, ye, Z0, xm, yr, Z0, xm, yr, Z1, c); // east slope
    b.quad(X0, ye, Z0, X0, ye, Z1, xm, yr, Z1, xm, yr, Z0, c); // west slope
    b.tri(x0, y0, z1, x1, y0, z1, xm, yr, z1, cEnd); // south gable
    b.tri(x1, y0, z0, x0, y0, z0, xm, yr, z0, cEnd); // north gable
  }
}

/** Hip roof over a rect (ridge along the long side). */
export function hipRoof(b, x0, z0, x1, z1, y0, rise, c, over = 0.4) {
  const X0 = x0 - over;
  const X1 = x1 + over;
  const Z0 = z0 - over;
  const Z1 = z1 + over;
  const w = X1 - X0;
  const d = Z1 - Z0;
  const yr = y0 + rise;
  if (w >= d) {
    const zm = (Z0 + Z1) / 2;
    const i = d / 2;
    b.quad(X0, y0, Z1, X1, y0, Z1, X1 - i, yr, zm, X0 + i, yr, zm, c);
    b.quad(X1, y0, Z0, X0, y0, Z0, X0 + i, yr, zm, X1 - i, yr, zm, c);
    b.tri(X1, y0, Z1, X1, y0, Z0, X1 - i, yr, zm, c);
    b.tri(X0, y0, Z0, X0, y0, Z1, X0 + i, yr, zm, c);
  } else {
    const xm = (X0 + X1) / 2;
    const i = w / 2;
    b.quad(X1, y0, Z1, X1, y0, Z0, xm, yr, Z0 + i, xm, yr, Z1 - i, c);
    b.quad(X0, y0, Z0, X0, y0, Z1, xm, yr, Z1 - i, xm, yr, Z0 + i, c);
    b.tri(X0, y0, Z1, X1, y0, Z1, xm, yr, Z1 - i, c);
    b.tri(X1, y0, Z0, X0, y0, Z0, xm, yr, Z0 + i, c);
  }
}

/** Pyramid roof with apex at the centre. */
export function pyramid(b, x0, z0, x1, z1, y0, rise, c) {
  const xm = (x0 + x1) / 2;
  const zm = (z0 + z1) / 2;
  const yr = y0 + rise;
  b.tri(x0, y0, z1, x1, y0, z1, xm, yr, zm, c);
  b.tri(x1, y0, z1, x1, y0, z0, xm, yr, zm, c);
  b.tri(x1, y0, z0, x0, y0, z0, xm, yr, zm, c);
  b.tri(x0, y0, z0, x0, y0, z1, xm, yr, zm, c);
}

/** Barrel vault over a rect: half-ellipse section across the short span, running along axis. */
export function vault(b, x0, z0, x1, z1, y0, rise, axis, seg, c, cEnd = c) {
  const along = axis === 'z';
  const span = along ? x1 - x0 : z1 - z0;
  const mid = along ? (x0 + x1) / 2 : (z0 + z1) / 2;
  for (let i = 0; i < seg; i++) {
    const t0 = (Math.PI * i) / seg;
    const t1 = (Math.PI * (i + 1)) / seg;
    const o0 = Math.cos(t0) * (span / 2);
    const o1 = Math.cos(t1) * (span / 2);
    const h0 = y0 + Math.sin(t0) * rise;
    const h1 = y0 + Math.sin(t1) * rise;
    if (along) {
      // cross-section in x, extruded along z; t runs east → west
      b.quad(mid + o0, h0, z1, mid + o0, h0, z0, mid + o1, h1, z0, mid + o1, h1, z1, c);
      b.tri(mid, y0, z1, mid + o0, h0, z1, mid + o1, h1, z1, cEnd);
      b.tri(mid, y0, z0, mid + o1, h1, z0, mid + o0, h0, z0, cEnd);
    } else {
      b.quad(x0, h0, mid + o0, x1, h0, mid + o0, x1, h1, mid + o1, x0, h1, mid + o1, c);
      b.tri(x1, y0, mid, x1, h1, mid + o1, x1, h0, mid + o0, cEnd);
      b.tri(x0, y0, mid, x0, h0, mid + o0, x0, h1, mid + o1, cEnd);
    }
  }
}

/** Dome (half ellipsoid) with seg sides and rings. */
export function dome(b, cx, cy, cz, r, h, seg, rings, c, cTop = c) {
  for (let j = 0; j < rings; j++) {
    const p0 = (Math.PI / 2) * (j / rings);
    const p1 = (Math.PI / 2) * ((j + 1) / rings);
    const r0 = Math.cos(p0) * r;
    const r1 = Math.cos(p1) * r;
    const y0 = cy + Math.sin(p0) * h;
    const y1 = cy + Math.sin(p1) * h;
    const cc = j === rings - 1 ? cTop : c;
    for (let i = 0; i < seg; i++) {
      const t0 = (Math.PI * 2 * i) / seg;
      const t1 = (Math.PI * 2 * (i + 1)) / seg;
      const ax = Math.cos(t0);
      const az = -Math.sin(t0);
      const bx = Math.cos(t1);
      const bz = -Math.sin(t1);
      if (r1 < 1e-4) b.tri(cx + ax * r0, y0, cz + az * r0, cx + bx * r0, y0, cz + bz * r0, cx, y1, cz, cc);
      else b.quad(cx + ax * r0, y0, cz + az * r0, cx + bx * r0, y0, cz + bz * r0, cx + bx * r1, y1, cz + bz * r1, cx + ax * r1, y1, cz + az * r1, cc);
    }
  }
}

/** A thin beam (box) between two 3D points with square section s. */
export function beam(b, ax, ay, az, bx, by, bz, s, c) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  // local frame: f = direction, u = up-ish, r = side
  const fx = dx / len;
  const fy = dy / len;
  const fz = dz / len;
  let ux = 0;
  let uy = 1;
  let uz = 0;
  if (Math.abs(fy) > 0.95) {
    ux = 1;
    uy = 0;
  }
  // r = f × u
  let rx = fy * uz - fz * uy;
  let ry = fz * ux - fx * uz;
  let rz = fx * uy - fy * ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // u = r × f
  ux = ry * fz - rz * fy;
  uy = rz * fx - rx * fz;
  uz = rx * fy - ry * fx;
  const h = s / 2;
  const corner = (px, py, pz, sr, su) => [px + (rx * sr + ux * su) * h, py + (ry * sr + uy * su) * h, pz + (rz * sr + uz * su) * h];
  const A = [corner(ax, ay, az, -1, -1), corner(ax, ay, az, 1, -1), corner(ax, ay, az, 1, 1), corner(ax, ay, az, -1, 1)];
  const B = [corner(bx, by, bz, -1, -1), corner(bx, by, bz, 1, -1), corner(bx, by, bz, 1, 1), corner(bx, by, bz, -1, 1)];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.quad(A[j][0], A[j][1], A[j][2], A[i][0], A[i][1], A[i][2], B[i][0], B[i][1], B[i][2], B[j][0], B[j][1], B[j][2], c);
  }
}

// ------------------------------------------------------------------ ground surfaces
/** Lawn over rect r (grass material, world-scale uv). */
export function lawn(P, r, tint = '#6f9a45', y = 0.05, scale = 1 / 7) {
  flat(P.get('grass'), r.x0, r.z0, r.x1, r.z1, y, typeof tint === 'string' ? C(tint) : tint, false, scale);
}

/**
 * Grass berm running along x: rises from (za, y0) to a crest line at (zb, y0 + h), falls back
 * to (zc, y0). za < zb < zc. Grass material, world uv.
 */
export function bermX(P, x0, x1, za, zb, zc, h, tint = '#6f9a45', y0 = 0.04, s = 1 / 7) {
  const b = P.get('grass');
  const c = typeof tint === 'string' ? C(tint) : tint;
  const y1 = y0 + h;
  b.quad(x1, y0, za, x0, y0, za, x0, y1, zb, x1, y1, zb, shade(c, 0.95), x1 * s, za * s, x0 * s, zb * s);
  b.quad(x0, y0, zc, x1, y0, zc, x1, y1, zb, x0, y1, zb, c, x0 * s, zc * s, x1 * s, zb * s);
  b.tri(x0, y0, za, x0, y0, zc, x0, y1, zb, shade(c, 0.9), za * s, 0, zc * s, 0, zb * s, h * s);
  b.tri(x1, y0, zc, x1, y0, za, x1, y1, zb, shade(c, 0.9), zc * s, 0, za * s, 0, zb * s, h * s);
}

/** Mound: base rect r rising to a flat top rect t at height h (grass unless mat given). */
export function mound(P, r, t, h, tint = '#6f9a45', mat = 'grass', y0 = 0.04, s = 1 / 7) {
  const b = P.get(mat);
  const c = typeof tint === 'string' ? C(tint) : tint;
  const y1 = y0 + h;
  // south, east, north, west faces
  b.quad(r.x0, y0, r.z1, r.x1, y0, r.z1, t.x1, y1, t.z1, t.x0, y1, t.z1, c, r.x0 * s, r.z1 * s, r.x1 * s, t.z1 * s);
  b.quad(r.x1, y0, r.z1, r.x1, y0, r.z0, t.x1, y1, t.z0, t.x1, y1, t.z1, shade(c, 0.93), -r.z1 * s, r.x1 * s, -r.z0 * s, t.x1 * s);
  b.quad(r.x1, y0, r.z0, r.x0, y0, r.z0, t.x0, y1, t.z0, t.x1, y1, t.z0, shade(c, 0.9), r.x1 * s, r.z0 * s, r.x0 * s, t.z0 * s);
  b.quad(r.x0, y0, r.z0, r.x0, y0, r.z1, t.x0, y1, t.z1, t.x0, y1, t.z0, shade(c, 0.96), r.z0 * s, r.x0 * s, r.z1 * s, t.x0 * s);
  flat(b, t.x0, t.z0, t.x1, t.z1, y1, c, false, s);
}

/**
 * Ground-atlas surface over rect r: the row repeats every `tile` meters along `axis`
 * ('x' or 'z'); across the other axis the rect is cut into strips `across` meters wide, each
 * showing the full row once (so 2D patterns like pavers tile both ways).
 */
export function surface(P, r, row, tile, opts = {}) {
  const ctx = P.ctx;
  const b = P.get('ground');
  const R = ctx.T.rows[row];
  const y = opts.y ?? 0.07;
  const c = opts.tint ? C(opts.tint) : C('#ffffff');
  const axis = opts.axis || 'x';
  const across = opts.across || (axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0);
  if (axis === 'x') {
    for (let z = r.z0; z < r.z1 - 1e-3; z += across) {
      const z1 = Math.min(r.z1, z + across);
      const f = (z1 - z) / across;
      const u0 = r.x0 / tile;
      const u1 = r.x1 / tile;
      // v runs north (v1) → south (v0 + ...): a = (x0, z1) gets v at the south edge
      b.quad(r.x0, y, z1, r.x1, y, z1, r.x1, y, z, r.x0, y, z, c, u0, R.v1 - (R.v1 - R.v0) * f, u1, R.v1);
    }
  } else {
    for (let x = r.x0; x < r.x1 - 1e-3; x += across) {
      const x1 = Math.min(r.x1, x + across);
      const f = (x1 - x) / across;
      const u0 = -r.z1 / tile;
      const u1 = -r.z0 / tile;
      // walk so u runs along z (north = larger u): quad corners (x, z1) → (x, z0) is along -z
      b.tri(x, y, r.z1, x1, y, r.z1, x1, y, r.z0, c, u0, R.v1, u0, R.v1 - (R.v1 - R.v0) * f, u1, R.v1 - (R.v1 - R.v0) * f);
      b.tri(x, y, r.z1, x1, y, r.z0, x, y, r.z0, c, u0, R.v1, u1, R.v1 - (R.v1 - R.v0) * f, u1, R.v1);
    }
  }
}

/** Ground-atlas strip along an arbitrary segment (rails, runway, paths): v across width w. */
export function strip(P, row, ax, az, bx, bz, w, tile, opts = {}) {
  const ctx = P.ctx;
  const b = P.get(opts.mat || 'ground');
  const R = ctx.T.rows[row];
  const y = opts.y ?? 0.08;
  const c = opts.tint ? C(opts.tint) : C('#ffffff');
  const len = Math.hypot(bx - ax, bz - az);
  const nx = (-(bz - az) / len) * (w / 2);
  const nz = ((bx - ax) / len) * (w / 2);
  const u0 = opts.u0 || 0;
  const u1 = u0 + len / tile;
  // left edge (−n) = v1, right edge (+n) = v0; faces up
  b.quad(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz, c, u0, R.v0, u1, R.v1);
}

// ------------------------------------------------------------------ land & collision helpers
/** Road + sidewalk rectangles for every road edge in the layout (what the CITY draws). */
export function roadRects(layout) {
  const out = [];
  const S = layout.SIDEWALK;
  for (const e of layout.edges) {
    const a = layout.nodes[e.a];
    const b = layout.nodes[e.b];
    const hw = e.width / 2 + S;
    if (e.axis === 'z') out.push({ x0: a.x - hw, x1: a.x + hw, z0: Math.min(a.z, b.z) - hw, z1: Math.max(a.z, b.z) + hw });
    else out.push({ x0: Math.min(a.x, b.x) - hw, x1: Math.max(a.x, b.x) + hw, z0: a.z - hw, z1: a.z + hw });
  }
  return out;
}

/** rect minus all road rects → list of disjoint land rects. */
export function landParts(roads, r) {
  const hits = roads.filter((q) => q.x1 > r.x0 && q.x0 < r.x1 && q.z1 > r.z0 && q.z0 < r.z1);
  if (!hits.length) return [{ ...r }];
  const xs = new Set([r.x0, r.x1]);
  const zs = new Set([r.z0, r.z1]);
  for (const q of hits) {
    if (q.x0 > r.x0 && q.x0 < r.x1) xs.add(q.x0);
    if (q.x1 > r.x0 && q.x1 < r.x1) xs.add(q.x1);
    if (q.z0 > r.z0 && q.z0 < r.z1) zs.add(q.z0);
    if (q.z1 > r.z0 && q.z1 < r.z1) zs.add(q.z1);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const free = [];
  for (let j = 0; j < Z.length - 1; j++) {
    let run = null;
    for (let i = 0; i < X.length - 1; i++) {
      const cx = (X[i] + X[i + 1]) / 2;
      const cz = (Z[j] + Z[j + 1]) / 2;
      const covered = hits.some((q) => cx > q.x0 && cx < q.x1 && cz > q.z0 && cz < q.z1);
      if (!covered) {
        if (run) run.x1 = X[i + 1];
        else run = { x0: X[i], x1: X[i + 1], z0: Z[j], z1: Z[j + 1] };
      } else if (run) {
        free.push(run);
        run = null;
      }
    }
    if (run) free.push(run);
  }
  // merge vertically stacked runs with identical x extents
  const merged = [];
  for (const f of free) {
    const m = merged.find((q) => Math.abs(q.x0 - f.x0) < 1e-6 && Math.abs(q.x1 - f.x1) < 1e-6 && Math.abs(q.z1 - f.z0) < 1e-6);
    if (m) m.z1 = f.z1;
    else merged.push({ ...f });
  }
  return merged.filter((q) => q.x1 - q.x0 > 0.5 && q.z1 - q.z0 > 0.5);
}

/** Does rect r overlap any road/sidewalk rect (with margin)? */
export function hitsRoad(roads, x0, z0, x1, z1, margin = 0) {
  for (const q of roads) if (q.x1 + margin > x0 && q.x0 - margin < x1 && q.z1 + margin > z0 && q.z0 - margin < z1) return true;
  return false;
}

/** Collision boxes for a rotated rect, approximated by AABB slices along its long side. */
export function oboxCollider(col, cx, cz, w, d, rot, maxY, tag = 'landmark', minY = 0) {
  const long = Math.max(w, d);
  const short = Math.min(w, d);
  const n = Math.max(1, Math.min(8, Math.round(long / Math.max(3, short * 0.7))));
  const alongX = w >= d;
  for (let i = 0; i < n; i++) {
    const t0 = -long / 2 + (long * i) / n;
    const t1 = -long / 2 + (long * (i + 1)) / n;
    const pts = alongX
      ? [[t0, -d / 2], [t1, -d / 2], [t1, d / 2], [t0, d / 2]]
      : [[-w / 2, t0], [w / 2, t0], [w / 2, t1], [-w / 2, t1]];
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [lx, lz] of pts) {
      const [px, pz] = rotPt(cx, cz, lx, lz, rot);
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      z0 = Math.min(z0, pz);
      z1 = Math.max(z1, pz);
    }
    // shrink the slices a little so the diagonal overhang is not too blocky
    const sx = (x1 - x0) * 0.08;
    const sz = (z1 - z0) * 0.08;
    col.addBox(x0 + sx, z0 + sz, x1 - sx, z1 - sz, maxY, minY, tag);
  }
}

/** Promise that yields to the browser (keeps the loading bar alive). */
export const tick = () => new Promise((r) => setTimeout(r, 0));
