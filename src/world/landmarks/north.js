import { C, shade, box, block, wall, flat, cylinder, hipRoof, pyramid, lawn, surface } from './kit.js';
import { tree, treesIn, bench, lamp, flagpole, sign, postSign, payphone, trashCan } from './props.js';
import { smoke } from './riverfront.js';

// North Omaha landmarks along North 24th Street and beyond: the Omaha Star, the Jewell Building
// with its DREAMLAND sign, Skeet's, the Fair Deal Cafe, the Great Plains Black History Museum,
// the old Safeway (Business Technology Center), the Malcolm X birthsite, North High School and
// historic Fort Omaha. Real 1993 places, shown as a respectful setting.

const ROOF = C('#4f4c48');
const ROOF_TAR = C('#3b3a38');

export function buildNorth(ctx) {
  const P = ctx.cluster('north24');
  omahaStar(P, ctx);
  jewell(P, ctx);
  skeets(P, ctx);
  fairDeal(P, ctx);
  blackHistoryMuseum(P, ctx);
  safeway(P, ctx);
  P.flush();
  const M = ctx.cluster('malcolmx');
  malcolmX(M, ctx);
  M.flush();
  const N = ctx.cluster('northhigh');
  northHigh(N, ctx);
  N.flush();
  const F = ctx.cluster('fortomaha');
  fortOmaha(F, ctx);
  F.flush();
}

/** Red-and-white scalloped awning along a wall from A to B, projecting along normal (nx, nz). */
export function awning(P, ax, az, bx, bz, nx, nz, yTop, depth = 1.1, drop = 0.6, colors = ['#c0262b', '#f4f1ea']) {
  const b = P.get('solid');
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const n = Math.max(2, Math.round(len / 0.5));
  const yF = yTop - drop;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * len;
    const t1 = ((i + 1) / n) * len;
    const c = C(colors[i % 2]);
    const p0x = ax + ux * t0;
    const p0z = az + uz * t0;
    const p1x = ax + ux * t1;
    const p1z = az + uz * t1;
    const f0x = p0x + nx * depth;
    const f0z = p0z + nz * depth;
    const f1x = p1x + nx * depth;
    const f1z = p1z + nz * depth;
    b.quad(f0x, yF, f0z, f1x, yF, f1z, p1x, yTop, p1z, p0x, yTop, p0z, c);
    b.quad(p0x, yTop, p0z, p1x, yTop, p1z, f1x, yF, f1z, f0x, yF, f0z, shade(c, 0.7));
    // valance with a scalloped edge
    b.quad(f0x, yF - 0.28, f0z, f1x, yF - 0.28, f1z, f1x, yF, f1z, f0x, yF, f0z, c);
    b.quad(f1x, yF - 0.28, f1z, f0x, yF - 0.28, f0z, f0x, yF, f0z, f1x, yF, f1z, c);
    const mx = (f0x + f1x) / 2;
    const mz = (f0z + f1z) / 2;
    b.tri(f0x, yF - 0.28, f0z, mx, yF - 0.5, mz, f1x, yF - 0.28, f1z, c);
    b.tri(f1x, yF - 0.28, f1z, mx, yF - 0.5, mz, f0x, yF - 0.28, f0z, c);
  }
}

/** Crenellated parapet (merlons) around a rect roof at height y. */
function crenellate(b, x0, z0, x1, z1, y, c) {
  box(b, x0 - 0.15, y, z0 - 0.15, x1 + 0.15, y + 0.3, z1 + 0.15, c);
  const m = 0.7;
  const step = 1.5;
  for (let x = x0; x <= x1 - m + 0.01; x += step) {
    box(b, x, y + 0.3, z0 - 0.15, x + m, y + 0.95, z0 + 0.25, c);
    box(b, x, y + 0.3, z1 - 0.25, x + m, y + 0.95, z1 + 0.15, c);
  }
  for (let z = z0 + step; z <= z1 - m - 0.5; z += step) {
    box(b, x0 - 0.15, y + 0.3, z, x0 + 0.25, y + 0.95, z + m, c);
    box(b, x1 - 0.25, y + 0.3, z, x1 + 0.15, y + 0.95, z + m, c);
  }
}

// ------------------------------------------------------------------ Omaha Star (since 1938)
function omahaStar(P, ctx) {
  const land = ctx.land(ctx.lm('omahastar').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const brick = '#7d5039';
  const X0 = x0 + 0.5;
  const X1 = x1 - 0.2;
  const Z0 = z0 + 0.5;
  const Z1 = z1 - 0.5;
  const H = 4.4;
  const front = { mat: 'lowrise', row: 'storefront', tile: 5.5, tint: brick, fit: true };
  const side = { mat: 'solid', color: shade(C(brick), 0.9) };
  wall(P, front, X1, Z1, X1, Z0, 0, H);
  wall(P, front, X1, Z0, X0, Z0, 0, H);
  wall(P, side, X0, Z1, X1, Z1, 0, H);
  wall(P, side, X0, Z0, X0, Z1, 0, H);
  flat(b, X0, Z0, X1, Z1, H, ROOF_TAR);
  crenellate(b, X0, Z0, X1, Z1, H, C('#6d4531'));
  // brick piers on limestone bases along the 24th St front
  for (let z = Z0; z <= Z1 + 0.01; z += (Z1 - Z0) / 5) {
    box(b, X1 - 0.05, 0, z - 0.3, X1 + 0.35, 0.6, z + 0.3, C('#cfc6b4'));
    box(b, X1 - 0.05, 0.6, z - 0.25, X1 + 0.3, H + 0.2, z + 0.25, C('#6b432f'));
  }
  // red-and-white scalloped awnings over the windows
  const seg = (Z1 - Z0) / 5;
  for (let i = 0; i < 5; i++) {
    if (i === 2) continue;
    awning(P, X1 + 0.3, Z0 + i * seg + 0.35, X1 + 0.3, Z0 + (i + 1) * seg - 0.35, 1, 0, 3.3, 1.0, 0.55);
  }
  // corner entrance awning (metal)
  box(b, X1 + 0.3, 3.05, Z0 + 2 * seg + 0.2, X1 + 1.6, 3.25, Z0 + 3 * seg - 0.2, C('#9aa0a3'), { bottom: true });
  sign(P, 'omahastar', X1 + 0.36, 4.05, (Z0 + Z1) / 2, 5.6, 0, -Math.PI / 2);
  ctx.box(X0, Z0, X1 + 0.35, Z1, H + 1);
  ctx.tag({ id: 'lm-omahastar-n', x: (X0 + X1) / 2, y: 1.8, z: Z0, nx: 0, nz: -1, w: 2.4, h: 1.4 });
}

// ------------------------------------------------------------------ Jewell Building / Dreamland Ballroom (1923)
function jewell(P, ctx) {
  const land = ctx.land(ctx.lm('jewell').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const brick = '#8e4a36';
  const X0 = x0 + 0.2;
  const X1 = x1 - 0.5;
  const Z0 = z0 + 0.5;
  const Z1 = z1 - 0.5;
  block(P, { mat: 'lowrise', row: 'storefront', tile: 7.5, tint: brick }, X0, Z0, X1, Z1, 0, 4.4, null);
  block(P, { mat: 'masonry', tint: brick, bay: 2.6, floor: 4.0, base: 4.4 }, X0, Z0, X1, Z1, 4.4, 8.4, ROOF_TAR);
  const trim = C('#e0d6c2');
  box(b, X0 - 0.3, 4.2, Z0 - 0.3, X1 + 0.3, 4.6, Z1 + 0.3, trim);
  box(b, X0 - 0.2, 8.4, Z0 - 0.2, X1 + 0.2, 9.2, Z1 + 0.2, C('#7f4230'));
  box(b, X0 - 0.35, 9.2, Z0 - 0.35, X1 + 0.35, 9.45, Z1 + 0.35, trim);
  sign(P, 'jewell', X0 - 0.22, 8.8, (Z0 + Z1) / 2, 4.2, 0, Math.PI / 2);
  // the DREAMLAND blade sign, neon red at night
  const bz = Z0 + 2.2;
  box(b, X0 - 1.5, 3.2, bz - 0.12, X0, 10.8, bz + 0.12, C('#2b2427'));
  sign(P, 'dreamland', X0 - 0.75, 7, bz - 0.13, 1.3, 7.2, 0);
  sign(P, 'dreamland', X0 - 0.75, 7, bz + 0.13, 1.3, 7.2, Math.PI);
  ctx.glow(X0 - 0.75, 7, bz, '#ff3040', 6);
  ctx.box(X0, Z0, X1, Z1, 9.4);
  ctx.tag({ id: 'lm-jewell-s', x: (X0 + X1) / 2, y: 1.8, z: Z1, nx: 0, nz: 1 });
}

// ------------------------------------------------------------------ Skeet's Ribs & Chicken (c. 1955)
function skeets(P, ctx) {
  const land = ctx.land(ctx.lm('skeets').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const X0 = x0 + 0.2;
  const X1 = x1 - 0.5;
  const Z0 = z0 + 0.3;
  const Z1 = z1 - 0.3;
  block(P, { mat: 'lowrise', row: 'storefront', tile: 5.5, tint: '#ece6da' }, X0, Z0, X1, Z1, 0, 4.2, ROOF_TAR);
  box(b, X0 - 0.2, 3.3, Z0 - 0.2, X1 + 0.2, 3.7, Z1 + 0.2, C('#b3231f'));
  box(b, X0 - 0.1, 4.2, Z0 - 0.1, X1 + 0.1, 4.5, Z1 + 0.1, C('#d9d2c4'));
  // roof sign on posts facing 24th St
  for (const z of [Z0 + 1.2, Z1 - 1.2]) box(b, X0 + 1.4, 4.5, z - 0.08, X0 + 1.56, 6.3, z + 0.08, C('#333'));
  sign(P, 'skeets', X0 + 1.4, 5.7, (Z0 + Z1) / 2, 5.4, 0, Math.PI / 2, { twoSided: true });
  // smoker stack out back
  cylinder(b, X1 - 1.5, Z1 - 1.2, 0.3, 0.3, 4.2, 6.4, 6, C('#5a5652'));
  smoke(ctx, X1 - 1.5, 6.6, Z1 - 1.2, { count: 4, color: '#c9c3ba', size: 0.9, rise: 0.8, drift: 0.5, life: 7, opacity: 0.2 });
  ctx.box(X0, Z0, X1, Z1, 5);
  ctx.poi({ id: 'lm-food-skeets', type: 'food', name: "Skeet's Ribs & Chicken", x: X0 - 1.8, z: (Z0 + Z1) / 2, heading: -Math.PI / 2, landmark: 'skeets' });
}

// ------------------------------------------------------------------ Fair Deal Cafe (1954)
// West side of 24th St: the storefront faces east onto 24th, blank brick on the other sides.
function fairDeal(P, ctx) {
  const land = ctx.land(ctx.lm('fairdeal').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const X0 = x0 + 0.5;
  const X1 = x1 - 0.2;
  const Z0 = z0 + 0.5;
  const Z1 = z1 - 0.5;
  const brick = C('#a35d44');
  const side = { mat: 'solid', color: shade(brick, 0.94) };
  wall(P, { mat: 'lowrise', row: 'storefront', tile: 4.5, tint: '#b86a4e', fit: true }, X1, Z1, X1, Z0, 0, 4.4);
  wall(P, side, X0, Z1, X1, Z1, 0, 4.4);
  wall(P, side, X1, Z0, X0, Z0, 0, 4.4);
  wall(P, side, X0, Z0, X0, Z1, 0, 4.4);
  flat(b, X0, Z0, X1, Z1, 4.4, ROOF_TAR);
  box(b, X0 - 0.2, 4.4, Z0 - 0.2, X1 + 0.2, 4.8, Z1 + 0.2, C('#e5ddcc'));
  sign(P, 'fairdeal', X1 + 0.05, 3.85, (Z0 + Z1) / 2, 6.4, 0, -Math.PI / 2);
  awning(P, X1 + 0.05, Z0 + 0.6, X1 + 0.05, Z1 - 0.6, 1, 0, 3.1, 0.9, 0.45, ['#1f4f8f', '#f4f1ea']);
  ctx.glow(X1 + 0.8, 2.9, (Z0 + Z1) / 2, '#ffe0a0', 2.4);
  ctx.box(X0, Z0, X1 + 0.05, Z1, 5);
  ctx.poi({ id: 'lm-food-fairdeal', type: 'food', name: 'Fair Deal Cafe', x: X1 + 1.8, z: (Z0 + Z1) / 2, heading: Math.PI / 2, landmark: 'fairdeal' });
  ctx.tag({ id: 'lm-fairdeal-n', x: (X0 + X1) / 2, y: 1.8, z: Z0, nx: 0, nz: -1, w: 2.2, h: 1.3 });
  ctx.tag({ id: 'lm-fairdeal-w', x: X0, y: 1.8, z: (Z0 + Z1) / 2, nx: -1, nz: 0, w: 2.6, h: 1.3 });
}

// ------------------------------------------------------------------ Great Plains Black History Museum (1906 exchange)
function blackHistoryMuseum(P, ctx) {
  const land = ctx.land(ctx.lm('gpbhm').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  // only a narrow sliver of the footprint is off 22nd St: a tall, narrow brick exchange
  const X0 = x0 + 0.3;
  const X1 = x1 - 0.3;
  block(P, { mat: 'masonry', tint: '#9c5842', bay: 2.4, floor: 3.9 }, X0, z0 + 0.3, X1, z1 - 0.3, 0, 9.4, ROOF_TAR);
  box(b, X0 - 0.3, 9.0, z0, X1 + 0.3, 9.9, z1, C('#d8cdb8'));
  box(b, X0 - 0.3, 0, z0, X1 + 0.3, 0.8, z1, C('#c8bea9'));
  sign(P, 'gpbhm', X0 - 0.05, 4.2, (z0 + z1) / 2, 6.5, 0, Math.PI / 2);
  box(b, (X0 + X1) / 2 - 0.9, 0, z0 + 0.2, (X0 + X1) / 2 + 0.9, 2.4, z0 + 0.32, C('#3b2b20'));
  ctx.box(X0, z0 + 0.3, X1, z1 - 0.3, 9.9);
}

// ------------------------------------------------------------------ former Safeway (1963) / Business Technology Center
function safeway(P, ctx) {
  const land = ctx.land(ctx.lm('osbn').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const S = { x0: x0 + 1, x1: x1 - 1, z0: z0 + 1, z1: z0 + 22 };
  block(P, { mat: 'masonry', tint: '#bfa582', bay: 4, floor: 5.4 }, S.x0, S.z0, S.x1, S.z1 - 0.5, 0, 5.8, ROOF_TAR);
  block(P, { mat: 'lowrise', row: 'storefront', tile: 6, tint: '#d8cbb0' }, S.x0 + 4, S.z1 - 0.5, S.x1 - 4, S.z1, 0, 4.4, null);
  // tall front fascia with the sign
  box(b, S.x0 - 0.2, 4.4, S.z1 - 1.2, S.x1 + 0.2, 7.4, S.z1 + 0.4, C('#e6e0d2'));
  sign(P, 'osbn', (S.x0 + S.x1) / 2, 5.9, S.z1 + 0.42, 16, 0, Math.PI);
  ctx.box(S.x0, S.z0, S.x1, S.z1 + 0.4, 7.4);
  // parking lot out front toward Lake St
  const lot = { x0: x0 + 1, x1: x1 - 1, z0: S.z1 + 0.5, z1: z1 };
  surface(P, { x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z0 + 5.5 }, 'parking', 10.8, { across: 5.5 });
  surface(P, { x0: lot.x0, x1: lot.x1, z0: lot.z0 + 5.5, z1: lot.z1 }, 'asphalt', 8, { across: lot.z1 - lot.z0 - 5.5 });
  for (let x = lot.x0 + 1.5; x < lot.x1 - 1; x += 2.7) ctx.park(x, lot.z0 + 2.8, 0);
  lamp(P, lot.x0 + 1, lot.z1 - 1, { style: 'cobra', rot: -Math.PI / 2, h: 7 });
  lamp(P, lot.x1 - 1, lot.z1 - 1, { style: 'cobra', rot: Math.PI / 2, h: 7 });
  const pp = payphone(P, S.x0 + 1.5, S.z1 + 1.4, Math.PI);
  ctx.poi({ id: 'lm-payphone-osbn', type: 'payphone', name: 'Payphone', ...pp });
  ctx.tag({ id: 'lm-safeway-w', x: S.x0, y: 1.8, z: (S.z0 + S.z1) / 2, nx: -1, nz: 0, w: 3, h: 1.6 });
  ctx.tag({ id: 'lm-safeway-e', x: S.x1, y: 1.8, z: (S.z0 + S.z1) / 2, nx: 1, nz: 0, w: 3, h: 1.6 });
}

// ------------------------------------------------------------------ Malcolm X birthsite
function malcolmX(P, ctx) {
  const land = ctx.land(ctx.lm('malcolmx').rect)[0];
  const { x0, x1, z0, z1 } = land;
  lawn(P, land, '#739c46');
  const cx = (x0 + x1) / 2;
  // the 1987 state historical marker near the Pinkney St sidewalk, readable from the street
  postSign(P, 'malcolmx', cx, z0 + 2.2, 1.9, 0, { post: '#2c1d13', y: 0.9 });
  surface(P, { x0: cx - 1, x1: cx + 1, z0, z1: z0 + 3.6 }, 'path', 2, { axis: 'z', across: 2 });
  tree(P, x0 + 3, z1 - 3, { h: 11, kind: 'broad' });
  tree(P, x1 - 4, z1 - 4, { h: 9, kind: 'round' });
  tree(P, x0 + 8, z1 - 2.5, { h: 7, kind: 'small' });
}

// ------------------------------------------------------------------ Omaha North High School
function northHigh(P, ctx) {
  const parts = ctx.land(ctx.lm('northhigh').rect);
  const west = parts.find((p) => p.x1 < -280);
  const east = parts.find((p) => p.x0 > -280);
  const b = P.get('solid');
  for (const p of [west, east]) lawn(P, p, '#6c9843');
  const brick = { mat: 'masonry', tint: '#9a553f', bay: 3.3, floor: 4.1 };
  const S = { x0: west.x0 + 2, x1: west.x1 - 2, z0: west.z0 + 8, z1: west.z1 - 3 };
  block(P, brick, S.x0, S.z0, S.x1, S.z1, 0, 13.2, ROOF);
  box(b, S.x0 - 0.3, 12.8, S.z0 - 0.3, S.x1 + 0.3, 13.6, S.z1 + 0.3, C('#d8ccb4'));
  // central entrance block on Ames Ave with a taller stair tower
  const cx = (S.x0 + S.x1) / 2;
  block(P, { mat: 'masonry', tint: '#a45f47', bay: 3, floor: 4.1 }, cx - 6, S.z0 - 2.5, cx + 6, S.z0, 0, 16.4, ROOF);
  box(b, cx - 6.3, 16, S.z0 - 2.8, cx + 6.3, 16.8, S.z0 + 0.3, C('#d8ccb4'));
  box(b, cx - 2.5, 0, S.z0 - 2.55, cx + 2.5, 3.6, S.z0 - 2.5, C('#2e2a26'));
  roofTop(P, S.x0, S.z0, S.x1, S.z1, 13.6, ctx);
  ctx.box(S.x0, S.z0 - 2.5, S.x1, S.z1, 16.8);
  postSign(P, 'northhigh', cx - 12, west.z0 + 2.5, 6.4, 0, { post: '#6b3a2c', y: 0.4, twoSided: true });
  flagpole(P, cx + 10, west.z0 + 3.5, 12);
  surface(P, { x0: cx - 2.5, x1: cx + 2.5, z0: west.z0, z1: S.z0 - 2.5 }, 'path', 3, { axis: 'z', across: 5 });
  // gymnasium across 38th St with a practice field and bleachers
  const G = { x0: east.x0 + 1.5, x1: east.x0 + 20, z0: east.z0 + 2, z1: east.z1 - 8 };
  block(P, { mat: 'masonry', tint: '#94513c', bay: 4.5, floor: 5.4 }, G.x0, G.z0, G.x1, G.z1, 0, 10.8, ROOF);
  ctx.box(G.x0, G.z0, G.x1, G.z1, 10.8);
  ctx.tag({ id: 'lm-northhigh-gym-e', x: G.x1, y: 2, z: (G.z0 + G.z1) / 2, nx: 1, nz: 0, w: 3, h: 1.6 });
  ctx.tag({ id: 'lm-northhigh-gym-s', x: (G.x0 + G.x1) / 2, y: 2, z: G.z1, nx: 0, nz: 1, w: 3, h: 1.6 });
  const fx0 = G.x1 + 3;
  const fx1 = east.x1 - 1.5;
  for (const z of [east.z0 + 4, east.z1 - 4]) {
    for (const x of [(fx0 + fx1) / 2 - 2.8, (fx0 + fx1) / 2 + 2.8]) cylinder(b, x, z, 0.08, 0.08, 0, 6, 4, C('#e3c43a'), { top: false });
    box(b, (fx0 + fx1) / 2 - 2.8, 2.9, z - 0.08, (fx0 + fx1) / 2 + 2.8, 3.05, z + 0.08, C('#e3c43a'));
    ctx.box((fx0 + fx1) / 2 - 3, z - 0.2, (fx0 + fx1) / 2 + 3, z + 0.2, 1, 'prop');
  }
  for (let r = 0; r < 4; r++) box(b, fx1 - 2 + r * 0.45, r * 0.45, east.z0 + 10, fx1 - 1.5 + r * 0.45, r * 0.45 + 0.5, east.z1 - 10, C('#9ea3a6'));
  ctx.box(fx1 - 2, east.z0 + 10, fx1 + 0.4, east.z1 - 10, 1.8, 'prop');
  for (let x = G.x0 + 1.4; x < G.x1 - 1; x += 2.7) ctx.park(x, east.z1 - 3.5, Math.PI);
  surface(P, { x0: G.x0, x1: G.x1, z0: east.z1 - 6.5, z1: east.z1 - 0.5 }, 'parking', 10.8, { across: 6 });
}

function roofTop(P, x0, z0, x1, z1, y, ctx) {
  const b = P.get('solid');
  const rng = ctx.rng;
  for (let i = 0; i < 3; i++) {
    const hx = x0 + 2 + rng() * (x1 - x0 - 6);
    const hz = z0 + 2 + rng() * (z1 - z0 - 5);
    box(b, hx, y, hz, hx + 2.5, y + 1.4, hz + 2, C('#9a9892'));
  }
}

// ------------------------------------------------------------------ Fort Omaha (1868)
function fortOmaha(P, ctx) {
  const land = ctx.land(ctx.lm('fortomaha').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  lawn(P, land, '#6d9a44');
  const pg = { x0: x0 + 15, x1: x1 - 15, z0: z0 + 22, z1: z1 - 22 };
  // loop road around the parade ground
  surface(P, { x0: pg.x0 - 5, x1: pg.x1 + 5, z0: pg.z0 - 5, z1: pg.z0 }, 'asphalt', 8, { across: 5 });
  surface(P, { x0: pg.x0 - 5, x1: pg.x1 + 5, z0: pg.z1, z1: pg.z1 + 5 }, 'asphalt', 8, { across: 5 });
  surface(P, { x0: pg.x0 - 5, x1: pg.x0, z0: pg.z0, z1: pg.z1 }, 'asphalt', 8, { axis: 'z', across: 5 });
  surface(P, { x0: pg.x1, x1: pg.x1 + 5, z0: pg.z0, z1: pg.z1 }, 'asphalt', 8, { axis: 'z', across: 5 });
  surface(P, { x0: (x0 + x1) / 2 - 3, x1: (x0 + x1) / 2 + 3, z0: pg.z1 + 5, z1 }, 'asphalt', 8, { axis: 'z', across: 6 });
  flagpole(P, (pg.x0 + pg.x1) / 2, (pg.z0 + pg.z1) / 2, 16);
  // officers' quarters: 2-story red brick houses with porches, facing the parade ground
  const brick = '#9b4e3a';
  const house = (cx, cz, face) => {
    const w = 10;
    const d = 12;
    const X0 = cx - w / 2;
    const Z0 = cz - d / 2;
    block(P, { mat: 'masonry', tint: brick, bay: 2.6, floor: 3.4 }, X0, Z0, X0 + w, Z0 + d, 0, 6.8, null);
    hipRoof(b, X0, Z0, X0 + w, Z0 + d, 6.8, 3.4, C('#4a4442'), 0.5);
    cylinder(b, cx + 2, cz, 0.35, 0.35, 8, 11, 4, C('#7a3b2c'));
    // porch facing the parade ground (face = +1 east, -1 west)
    const px = face > 0 ? X0 + w : X0 - 2.4;
    box(b, px, 0, Z0 + 1, px + 2.4, 0.5, Z0 + d - 1, C('#b9b2a4'));
    box(b, px - 0.1, 3.1, Z0 + 0.8, px + 2.5, 3.35, Z0 + d - 0.8, C('#e8e4da'));
    for (let z = Z0 + 1.2; z <= Z0 + d - 1.1; z += 2.4) box(b, px + (face > 0 ? 2.2 : 0.05), 0.5, z - 0.1, px + (face > 0 ? 2.35 : 0.2), 3.1, z + 0.1, C('#f2efe8'));
    ctx.glow(face > 0 ? px + 0.3 : px + 2.1, 2.8, cz, '#ffd98a', 1.8);
    ctx.box(X0, Z0, X0 + w, Z0 + d, 10);
  };
  for (let i = 0; i < 5; i++) {
    const cz = pg.z0 + 6 + i * ((pg.z1 - pg.z0 - 12) / 4);
    house(x0 + 7, cz, 1);
    house(x1 - 7, cz, -1);
  }
  // General Crook House (1879) at the head of the parade ground, with a cupola
  const ch = { x0: (x0 + x1) / 2 - 8, x1: (x0 + x1) / 2 + 8, z0: z0 + 3, z1: z0 + 14 };
  block(P, { mat: 'masonry', tint: '#a0533d', bay: 2.8, floor: 3.6 }, ch.x0, ch.z0, ch.x1, ch.z1, 0, 7.4, null);
  hipRoof(b, ch.x0, ch.z0, ch.x1, ch.z1, 7.4, 2.4, C('#3f3b39'), 0.8);
  box(b, (ch.x0 + ch.x1) / 2 - 1.2, 9.2, (ch.z0 + ch.z1) / 2 - 1.2, (ch.x0 + ch.x1) / 2 + 1.2, 10.8, (ch.z0 + ch.z1) / 2 + 1.2, C('#efe9dc'));
  pyramid(b, (ch.x0 + ch.x1) / 2 - 1.5, (ch.z0 + ch.z1) / 2 - 1.5, (ch.x0 + ch.x1) / 2 + 1.5, (ch.z0 + ch.z1) / 2 + 1.5, 10.8, 1.4, C('#3f3b39'));
  box(b, ch.x0 + 2, 0, ch.z1, ch.x1 - 2, 0.5, ch.z1 + 2.6, C('#b9b2a4'));
  box(b, ch.x0 + 1.8, 3.1, ch.z1, ch.x1 - 1.8, 3.35, ch.z1 + 2.8, C('#e8e4da'));
  ctx.box(ch.x0, ch.z0, ch.x1, ch.z1, 10);
  // entrance gate on Fort St
  const gx = (x0 + x1) / 2;
  for (const s of [-1, 1]) {
    box(b, gx + s * 5 - 0.6, 0, z1 - 1.6, gx + s * 5 + 0.6, 2.4, z1 - 0.4, C('#9b4e3a'));
    box(b, gx + s * 5 - 0.75, 2.4, z1 - 1.75, gx + s * 5 + 0.75, 2.7, z1 - 0.25, C('#d8cdb8'));
    ctx.box(gx + s * 5 - 0.6, z1 - 1.6, gx + s * 5 + 0.6, z1 - 0.4, 2.7, 'prop');
  }
  postSign(P, 'fortomaha', gx - 10, z1 - 2, 5.5, Math.PI, { post: '#5a3a2a', y: 0.4, twoSided: true });
  // old shade trees around the parade ground, lamps on the loop
  for (let z = pg.z0 + 2; z < pg.z1; z += 13) {
    tree(P, pg.x0 + 2, z, { h: 12, kind: 'broad' });
    tree(P, pg.x1 - 2, z + 6, { h: 12, kind: 'broad' });
    lamp(P, pg.x0 - 5.6, z + 6, { style: 'park' });
    lamp(P, pg.x1 + 5.6, z, { style: 'park' });
  }
  treesIn(P, { x0: gx + 12, x1, z0: z1 - 12, z1: z1 - 3 }, 4, { h: 10 });
  // college parking on the south lawn
  for (let x = x0 + 4; x < gx - 14; x += 2.7) ctx.park(x, z1 - 7.5, 0);
  surface(P, { x0: x0 + 2.6, x1: gx - 13, z0: z1 - 10.5, z1: z1 - 4.5 }, 'parking', 10.8, { across: 6 });
  bench(P, (pg.x0 + pg.x1) / 2 - 6, pg.z1 - 2, 0);
  bench(P, (pg.x0 + pg.x1) / 2 + 6, pg.z1 - 2, 0);
  trashCan(P, (pg.x0 + pg.x1) / 2, pg.z1 - 1.5);
}
