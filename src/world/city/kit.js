import { rgb, shade } from './batch.js';
import { FT } from '../textures.js';

// Low-poly building kit in a lot's local Frame (see batch.js Frame):
//   u along the frontage, v from the front lot line into the lot, y up; front faces -v.
// Faces of a local box [u0,u1]×[v0,v1] are described by their left end (seen from outside), the
// along direction and the outward normal, so panels (windows, doors, signs) can be placed by
// "distance from the left end" on any face.

/** Face descriptors of a local box. */
export function faces(u0, u1, v0, v1) {
  return {
    front: { ou: u1, ov: v0, du: -1, dv: 0, nu: 0, nv: -1, len: u1 - u0 },
    back: { ou: u0, ov: v1, du: 1, dv: 0, nu: 0, nv: 1, len: u1 - u0 },
    left: { ou: u0, ov: v0, du: 0, dv: 1, nu: -1, nv: 0, len: v1 - v0 },
    right: { ou: u1, ov: v1, du: 0, dv: -1, nu: 1, nv: 0, len: v1 - v0 },
  };
}

/** World position + normal of a point on a face at distance s from its left end. */
export function facePoint(F, face, s, off = 0) {
  const u = face.ou + face.du * s + face.nu * off;
  const v = face.ov + face.dv * s + face.nv * off;
  return { x: F.x(u, v), z: F.z(u, v), nx: face.nu * F.ux + face.nv * F.vx, nz: face.nu * F.uz + face.nv * F.vz };
}

/**
 * Quad on a face from s0..s1 (along) and y0..y1, pushed `off` outward. style = facade style
 * (tile/color/tw/th/uo/vb) → tiled uv; or pass uvRect=[u0,v0,u1,v1] for a single atlas cell
 * (non tiling: 0..1 inside the cell).
 */
export function panel(C, mat, F, face, s0, s1, y0, y1, style, off = 0.03, fit = false) {
  const B = C.B;
  if (style) {
    B.tile = style.tile;
    B.color = style.color;
  }
  const au = face.ou + face.du * s0 + face.nu * off;
  const av = face.ov + face.dv * s0 + face.nv * off;
  const bu = face.ou + face.du * s1 + face.nu * off;
  const bv = face.ov + face.dv * s1 + face.nv * off;
  const ax = F.x(au, av);
  const az = F.z(au, av);
  const bx = F.x(bu, bv);
  const bz = F.z(bu, bv);
  let u0;
  let u1;
  let v0;
  let v1;
  if (fit) {
    u0 = 0.004;
    u1 = 0.996;
    v0 = 0.004;
    v1 = 0.996;
  } else {
    const tw = style?.tw || 1;
    const th = style?.th || 1;
    const vb = style?.vb ?? 0;
    u0 = s0 / tw + (style?.uo || 0);
    u1 = s1 / tw + (style?.uo || 0);
    v0 = (y0 - vb) / th;
    v1 = (y1 - vb) / th;
  }
  B.quad(mat, ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, u0, v0, u1, v1);
}

/** Sign-atlas quad on a face (cell name), off outward. */
export function signPanel(C, F, face, s0, s1, y0, y1, cell, off = 0.06, color = '#ffffff') {
  const c = C.cells.get(cell);
  if (!c) return;
  const B = C.B;
  B.color = typeof color === 'string' ? rgb(color) : color;
  const au = face.ou + face.du * s0 + face.nu * off;
  const av = face.ov + face.dv * s0 + face.nv * off;
  const bu = face.ou + face.du * s1 + face.nu * off;
  const bv = face.ov + face.dv * s1 + face.nv * off;
  const ax = F.x(au, av);
  const az = F.z(au, av);
  const bx = F.x(bu, bv);
  const bz = F.z(bu, bv);
  B.quadUV('signs', ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
}

/** Four walls of a local box between y0 and y1; styles per face (or one style). */
export function walls(C, mat, F, u0, u1, v0, v1, y0, y1, st, which = null) {
  const fs = faces(u0, u1, v0, v1);
  for (const k of ['front', 'back', 'left', 'right']) {
    if (which && !which.includes(k)) continue;
    const s = st[k] || st.all || st;
    if (!s || !s.tile) continue;
    panel(C, mat, F, fs[k], 0, fs[k].len, y0, y1, s, 0);
  }
  return fs;
}

/** Local flat top (roof slab / floor) at height y. */
export function top(C, mat, F, u0, u1, v0, v1, y, style) {
  const B = C.B;
  B.tile = style.tile;
  B.color = style.color;
  const tw = style.tw || 1;
  const th = style.th || tw;
  // local (u, v) → world; winding: in local space a=(u0,v1) b=(u1,v1) c=(u1,v0) d=(u0,v0) faces +y
  B.quad(mat, F.x(u0, v1), y, F.z(u0, v1), F.x(u1, v1), y, F.z(u1, v1), F.x(u1, v0), y, F.z(u1, v0), F.x(u0, v0), y, F.z(u0, v0), u0 / tw, v1 / th, u1 / tw, v0 / th);
}

/** Local solid box (4 walls + top) with one style. */
export function lbox(C, mat, F, u0, u1, v0, v1, y0, y1, style, topStyle = style, which = null) {
  walls(C, mat, F, u0, u1, v0, v1, y0, y1, style, which);
  if (topStyle) top(C, mat, F, u0, u1, v0, v1, y1, topStyle);
}

/** Quad from local points (u, y, v) × 4, ccw from outside. */
export function lquad(C, mat, F, p, uv = [0, 0, 1, 1]) {
  C.B.quad(mat, F.x(p[0], p[2]), p[1], F.z(p[0], p[2]), F.x(p[3], p[5]), p[4], F.z(p[3], p[5]), F.x(p[6], p[8]), p[7], F.z(p[6], p[8]), F.x(p[9], p[11]), p[10], F.z(p[9], p[11]), uv[0], uv[1], uv[2], uv[3]);
}

export function ltri(C, mat, F, p, uv = [0, 0, 1, 0, 0.5, 1]) {
  C.B.tri(mat, F.x(p[0], p[2]), p[1], F.z(p[0], p[2]), F.x(p[3], p[5]), p[4], F.z(p[3], p[5]), F.x(p[6], p[8]), p[7], F.z(p[6], p[8]), uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]);
}

/**
 * Gable roof over [u0,u1]×[v0,v1] with wall top h. ridge 'v' = ridge runs front-to-back (gable
 * faces the street), 'u' = ridge along the frontage. Gable triangles use wallStyle.
 */
export function gableRoof(C, mat, F, u0, u1, v0, v1, h, pitch, ridge, roofStyle, wallStyle, trimStyle, oh = 0.35) {
  const B = C.B;
  if (ridge === 'v') {
    const w = u1 - u0;
    const um = (u0 + u1) / 2;
    const rise = (w / 2) * pitch;
    const ue0 = u0 - oh;
    const ue1 = u1 + oh;
    const ye = h - oh * pitch;
    const vf = v0 - oh * 0.7;
    const vb = v1 + oh * 0.7;
    const slope = Math.hypot(w / 2 + oh, rise + oh * pitch);
    const tw = roofStyle.tw;
    B.tile = roofStyle.tile;
    B.color = roofStyle.color;
    // left slope (faces -u)
    lquad(C, mat, F, [ue0, ye, vf, ue0, ye, vb, um, h + rise, vb, um, h + rise, vf], [vf / tw, 0, vb / tw, slope / tw]);
    // right slope (faces +u)
    lquad(C, mat, F, [ue1, ye, vb, ue1, ye, vf, um, h + rise, vf, um, h + rise, vb], [vb / tw, 0, vf / tw, slope / tw]);
    // gables
    B.tile = wallStyle.tile;
    B.color = wallStyle.color;
    const gv = rise / (wallStyle.th || 3);
    const gu = w / (wallStyle.tw || 3);
    ltri(C, mat, F, [u1, h, v0, u0, h, v0, um, h + rise, v0], [0, h / wallStyle.th, gu, h / wallStyle.th, gu / 2, h / wallStyle.th + gv]);
    ltri(C, mat, F, [u0, h, v1, u1, h, v1, um, h + rise, v1], [0, h / wallStyle.th, gu, h / wallStyle.th, gu / 2, h / wallStyle.th + gv]);
    if (trimStyle) {
      B.tile = trimStyle.tile;
      B.color = trimStyle.color;
      // fascia boards along the eaves
      lquad(C, mat, F, [ue0, ye - 0.18, vf, ue0, ye - 0.18, vb, ue0, ye, vb, ue0, ye, vf]);
      lquad(C, mat, F, [ue1, ye - 0.18, vb, ue1, ye - 0.18, vf, ue1, ye, vf, ue1, ye, vb]);
      // soffits (visible from the street)
      lquad(C, mat, F, [ue0, ye, vf, u0, h, vf, u0, h, vb, ue0, ye, vb]);
      lquad(C, mat, F, [u1, h, vf, ue1, ye, vf, ue1, ye, vb, u1, h, vb]);
    }
    return h + rise;
  }
  const d = v1 - v0;
  const vm = (v0 + v1) / 2;
  const rise = (d / 2) * pitch;
  const ve0 = v0 - oh;
  const ve1 = v1 + oh;
  const ye = h - oh * pitch;
  const uf = u0 - oh * 0.7;
  const ub = u1 + oh * 0.7;
  const slope = Math.hypot(d / 2 + oh, rise + oh * pitch);
  const tw = roofStyle.tw;
  B.tile = roofStyle.tile;
  B.color = roofStyle.color;
  // front slope (faces -v)
  lquad(C, mat, F, [ub, ye, ve0, uf, ye, ve0, uf, h + rise, vm, ub, h + rise, vm], [ub / tw, 0, uf / tw, slope / tw]);
  // back slope (faces +v)
  lquad(C, mat, F, [uf, ye, ve1, ub, ye, ve1, ub, h + rise, vm, uf, h + rise, vm], [uf / tw, 0, ub / tw, slope / tw]);
  B.tile = wallStyle.tile;
  B.color = wallStyle.color;
  const gv = rise / (wallStyle.th || 3);
  const gu = d / (wallStyle.tw || 3);
  ltri(C, mat, F, [u0, h, v0, u0, h, v1, u0, h + rise, vm], [0, h / wallStyle.th, gu, h / wallStyle.th, gu / 2, h / wallStyle.th + gv]);
  ltri(C, mat, F, [u1, h, v1, u1, h, v0, u1, h + rise, vm], [0, h / wallStyle.th, gu, h / wallStyle.th, gu / 2, h / wallStyle.th + gv]);
  if (trimStyle) {
    B.tile = trimStyle.tile;
    B.color = trimStyle.color;
    lquad(C, mat, F, [ub, ye - 0.18, ve0, uf, ye - 0.18, ve0, uf, ye, ve0, ub, ye, ve0]);
    lquad(C, mat, F, [uf, ye - 0.18, ve1, ub, ye - 0.18, ve1, ub, ye, ve1, uf, ye, ve1]);
    lquad(C, mat, F, [ub, ye, ve0, ub, h, v0, uf, h, v0, uf, ye, ve0]);
    lquad(C, mat, F, [uf, ye, ve1, uf, h, v1, ub, h, v1, ub, ye, ve1]);
  }
  return h + rise;
}

/** Hip roof (pyramid when square). Returns the peak height. */
export function hipRoof(C, mat, F, u0, u1, v0, v1, h, pitch, roofStyle, trimStyle, oh = 0.4) {
  const B = C.B;
  const a0 = u0 - oh;
  const a1 = u1 + oh;
  const b0 = v0 - oh;
  const b1 = v1 + oh;
  const w = a1 - a0;
  const d = b1 - b0;
  const ye = h - oh * pitch;
  const rise = (Math.min(w, d) / 2) * pitch;
  const yr = ye + rise;
  const um = (a0 + a1) / 2;
  const vm = (b0 + b1) / 2;
  let r0u;
  let r0v;
  let r1u;
  let r1v;
  if (w >= d) {
    r0u = a0 + d / 2;
    r1u = a1 - d / 2;
    r0v = r1v = vm;
  } else {
    r0u = r1u = um;
    r0v = b0 + w / 2;
    r1v = b1 - w / 2;
  }
  const tw = roofStyle.tw;
  B.tile = roofStyle.tile;
  B.color = roofStyle.color;
  const sl = rise * 1.4 / tw;
  if (w >= d) {
    // front (faces -v): a1,b0 → a0,b0 → r0 → r1
    lquad(C, mat, F, [a1, ye, b0, a0, ye, b0, r0u, yr, r0v, r1u, yr, r1v], [a1 / tw, 0, a0 / tw, sl]);
    lquad(C, mat, F, [a0, ye, b1, a1, ye, b1, r1u, yr, r1v, r0u, yr, r0v], [a0 / tw, 0, a1 / tw, sl]);
    ltri(C, mat, F, [a0, ye, b0, a0, ye, b1, r0u, yr, r0v], [b0 / tw, 0, b1 / tw, 0, vm / tw, sl]);
    ltri(C, mat, F, [a1, ye, b1, a1, ye, b0, r1u, yr, r1v], [b1 / tw, 0, b0 / tw, 0, vm / tw, sl]);
  } else {
    ltri(C, mat, F, [a1, ye, b0, a0, ye, b0, r0u, yr, r0v], [a1 / tw, 0, a0 / tw, 0, um / tw, sl]);
    ltri(C, mat, F, [a0, ye, b1, a1, ye, b1, r1u, yr, r1v], [a0 / tw, 0, a1 / tw, 0, um / tw, sl]);
    lquad(C, mat, F, [a0, ye, b0, a0, ye, b1, r1u, yr, r1v, r0u, yr, r0v], [b0 / tw, 0, b1 / tw, sl]);
    lquad(C, mat, F, [a1, ye, b1, a1, ye, b0, r0u, yr, r0v, r1u, yr, r1v], [b1 / tw, 0, b0 / tw, sl]);
  }
  if (trimStyle) {
    B.tile = trimStyle.tile;
    B.color = trimStyle.color;
    lquad(C, mat, F, [a1, ye - 0.18, b0, a0, ye - 0.18, b0, a0, ye, b0, a1, ye, b0]);
    lquad(C, mat, F, [a0, ye - 0.18, b1, a1, ye - 0.18, b1, a1, ye, b1, a0, ye, b1]);
    lquad(C, mat, F, [a0, ye - 0.18, b0, a0, ye - 0.18, b1, a0, ye, b1, a0, ye, b0]);
    lquad(C, mat, F, [a1, ye - 0.18, b1, a1, ye - 0.18, b0, a1, ye, b0, a1, ye, b1]);
    // soffit ring (front + sides)
    lquad(C, mat, F, [a1, ye - 0.18, b0, u1, h, v0, u0, h, v0, a0, ye - 0.18, b0]);
    lquad(C, mat, F, [a0, ye - 0.18, b0, u0, h, v0, u0, h, v1, a0, ye - 0.18, b1]);
    lquad(C, mat, F, [u1, h, v0, a1, ye - 0.18, b0, a1, ye - 0.18, b1, u1, h, v1]);
  }
  return yr;
}

/** Shed roof sloping down toward the front (porches). */
export function shedRoof(C, mat, F, u0, u1, v0, v1, yFront, yBack, roofStyle, trimStyle) {
  const B = C.B;
  B.tile = roofStyle.tile;
  B.color = roofStyle.color;
  const tw = roofStyle.tw;
  lquad(C, mat, F, [u1, yFront, v0, u0, yFront, v0, u0, yBack, v1, u1, yBack, v1], [u1 / tw, v0 / tw, u0 / tw, v1 / tw]);
  if (trimStyle) {
    B.tile = trimStyle.tile;
    B.color = trimStyle.color;
    lquad(C, mat, F, [u1, yFront - 0.22, v0, u0, yFront - 0.22, v0, u0, yFront, v0, u1, yFront, v0]);
    lquad(C, mat, F, [u0, yFront - 0.22, v0, u1, yFront - 0.22, v0, u1, yBack - 0.05, v1, u0, yBack - 0.05, v1]);
    lquad(C, mat, F, [u0, yFront - 0.22, v0, u0, yFront - 0.22, v1, u0, yBack, v1, u0, yFront, v0]);
    lquad(C, mat, F, [u1, yFront - 0.22, v1, u1, yFront - 0.22, v0, u1, yFront, v0, u1, yBack, v1]);
  }
}

// ------------------------------------------------------------------ trees
// unit icosahedron
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
});
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** Jittered low-poly blob (icosahedron) — flat shaded foliage clump. */
export function blob(C, mat, x, y, z, rx, ry, rz, color, rng, jitter = 0.18) {
  const B = C.B;
  B.tile = FT.foliage;
  const vs = ICO_V.map(([a, b, c]) => {
    const k = 1 + (rng() * 2 - 1) * jitter;
    return [x + a * rx * k, y + b * ry * k, z + c * rz * k];
  });
  const top = shade(color, 1.12);
  const bot = shade(color, 0.72);
  for (const [i, j, k] of ICO_F) {
    const a = vs[i];
    const b = vs[j];
    const c = vs[k];
    const cy = (a[1] + b[1] + c[1]) / 3;
    B.color = cy > y + ry * 0.2 ? top : cy < y - ry * 0.3 ? bot : color;
    // icosahedron faces listed ccw from outside
    B.tri(mat, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0] / 2.5, a[1] / 2.5, b[0] / 2.5, b[1] / 2.5, c[0] / 2.5 + c[2] / 2.5, c[1] / 2.5);
  }
}

/** Cone (evergreen tier). */
export function cone(C, mat, x, y0, z, r, h, sides, color, rng) {
  const B = C.B;
  B.tile = FT.foliage;
  const ph = rng() * Math.PI;
  for (let i = 0; i < sides; i++) {
    const a0 = ph + (i / sides) * Math.PI * 2;
    const a1 = ph + ((i + 1) / sides) * Math.PI * 2;
    B.color = i % 2 ? color : shade(color, 0.85);
    const x0 = x + Math.cos(a0) * r;
    const z0 = z - Math.sin(a0) * r;
    const x1 = x + Math.cos(a1) * r;
    const z1 = z - Math.sin(a1) * r;
    B.tri(mat, x0, y0, z0, x1, y0, z1, x, y0 + h, z, 0, 0, 1, 0, 0.5, 1);
  }
  // underside
  B.color = shade(color, 0.55);
  for (let i = 0; i < sides; i++) {
    const a0 = ph + (i / sides) * Math.PI * 2;
    const a1 = ph + ((i + 1) / sides) * Math.PI * 2;
    B.tri(mat, x, y0, z, x + Math.cos(a1) * r, y0, z - Math.sin(a1) * r, x + Math.cos(a0) * r, y0, z - Math.sin(a0) * r, 0, 0, 1, 0, 0.5, 1);
  }
}

export const TREE_GREENS = ['#5f8a35', '#557e2f', '#6c9440', '#4d7430', '#7a9a44', '#627f36', '#4a6b2b'];

/**
 * Tree at (x, z). kind: 'elm' | 'maple' | 'cotton' | 'spruce' | 'young' | 'dead'. scale ~1.
 * Adds a small 'tree' collider for the trunk.
 */
export function tree(C, x, z, kind, scale, rng, collide = true) {
  const B = C.B;
  B.at(x, z);
  const bark = C.f('bark', '#8a7a68');
  const green = rgb(TREE_GREENS[Math.floor(rng() * TREE_GREENS.length)]);
  const low = C.detail === 0;
  const s = scale;
  if (kind === 'spruce') {
    B.cylinder('detail', x, z, 0, 1.4 * s, 0.18 * s, 0.14 * s, 5, bark, false);
    const g = shade(rgb('#3e5e34'), 0.9 + rng() * 0.2);
    const tiers = low ? 2 : 3;
    for (let i = 0; i < tiers; i++) cone(C, 'detail', x, (1.0 + i * 2.0) * s, z, (2.6 - i * 0.7) * s, 3.4 * s, 6, g, rng);
  } else if (kind === 'dead') {
    B.cylinder('detail', x, z, 0, 5 * s, 0.2 * s, 0.08 * s, 5, bark, false);
  } else {
    const th = { elm: 3.4, maple: 2.6, cotton: 4.2, young: 2.0 }[kind] * s;
    const tr = { elm: 0.28, maple: 0.22, cotton: 0.32, young: 0.1 }[kind] * s;
    B.cylinder('detail', x, z, 0, th + 0.8 * s, tr, tr * 0.7, low ? 4 : 5, bark, false);
    if (kind === 'young') {
      blob(C, 'detail', x, th + 0.9 * s, z, 1.3 * s, 1.5 * s, 1.3 * s, green, rng);
    } else if (kind === 'maple') {
      blob(C, 'detail', x, th + 1.8 * s, z, 2.8 * s, 2.4 * s, 2.8 * s, green, rng);
      if (!low) blob(C, 'detail', x + 0.8 * s, th + 2.8 * s, z - 0.5 * s, 1.8 * s, 1.6 * s, 1.8 * s, shade(green, 1.08), rng);
    } else if (kind === 'elm') {
      blob(C, 'detail', x, th + 2.2 * s, z, 3.6 * s, 2.6 * s, 3.6 * s, green, rng);
      if (!low) {
        blob(C, 'detail', x - 1.6 * s, th + 3.2 * s, z + 0.8 * s, 2.4 * s, 2.0 * s, 2.4 * s, shade(green, 1.06), rng);
        blob(C, 'detail', x + 1.5 * s, th + 3.4 * s, z - 0.6 * s, 2.2 * s, 1.9 * s, 2.2 * s, shade(green, 0.96), rng);
      }
    } else {
      // cottonwood: tall and loose
      blob(C, 'detail', x, th + 2.6 * s, z, 3.0 * s, 3.2 * s, 3.0 * s, green, rng);
      blob(C, 'detail', x + 0.6 * s, th + 5.4 * s, z, 2.2 * s, 2.4 * s, 2.2 * s, shade(green, 1.07), rng);
      if (!low) blob(C, 'detail', x - 1.2 * s, th + 1.6 * s, z + 1 * s, 2.0 * s, 1.6 * s, 2.0 * s, shade(green, 0.94), rng);
    }
  }
  C.stats.trees++;
  if (collide) C.box(x - 0.3 * s, z - 0.3 * s, x + 0.3 * s, z + 0.3 * s, 3.5, 0, 'tree');
}

// ------------------------------------------------------------------ fences
/**
 * Fence run from (x0,z0) to (x1,z1) (world), height h. kind: chain | picket | iron | wire | wood.
 * Alpha-tested kinds go to the 'fence' material (double sided); 'wood' is an opaque privacy fence.
 */
export function fenceRun(C, x0, z0, x1, z1, h, kind, collide = true) {
  const B = C.B;
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.3) return;
  B.at((x0 + x1) / 2, (z0 + z1) / 2);
  if (kind === 'wood') {
    const st = C.f('planks', '#a8927a');
    B.tile = st.tile;
    B.color = st.color;
    B.wall('detail', x0, z0, x1, z1, 0, h, st.tw, st.th, 0, 0);
    B.wall('detail', x1, z1, x0, z0, 0, h, st.tw, st.th, 0, 0);
  } else {
    const st = C.fence(kind === 'wire' ? 'wire' : kind, kind === 'picket' ? '#f2efe6' : '#ffffff');
    B.tile = st.tile;
    B.color = st.color;
    B.wall('fence', x0, z0, x1, z1, 0.02, h, st.tw, h, 0, 0.02);
  }
  if (collide) {
    const t = 0.08;
    C.box(Math.min(x0, x1) - t, Math.min(z0, z1) - t, Math.max(x0, x1) + t, Math.max(z0, z1) + t, Math.min(h, kind === 'wood' || kind === 'wire' ? h : 1.05), 0, 'fence');
  }
}
