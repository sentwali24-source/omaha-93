import { C, shade, box, block, cylinder, gableRoof, hipRoof, pyramid, dome, lawn, surface } from './kit.js';
import { tree, bench, lamp, flagpole, sign, postSign, trashCan } from './props.js';
import { roofTop } from './downtown.js';

// Midtown: Joslyn Art Museum (pink Georgia marble, 1931 — no Scott Pavilion yet), Central High
// School's hollow square on Capitol Hill, Creighton University around St. John's Church (with
// I-480 slicing along the south edge of campus), Mutual of Omaha's tower and glass dome,
// Kiewit Plaza and the old Blackstone Hotel.

const ROOF = C('#5e5b57');

export function buildMidtown(ctx) {
  const E = ctx.cluster('midtown-e');
  joslyn(E, ctx);
  centralHigh(E, ctx);
  creighton(E, ctx);
  E.flush();
  const W = ctx.cluster('midtown-w');
  mutual(W, ctx);
  kiewitPlaza(W, ctx);
  blackstone(W, ctx);
  W.flush();
}

// ------------------------------------------------------------------ Joslyn Art Museum (1931)
function joslyn(P, ctx) {
  const land = ctx.land(ctx.lm('joslyn').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const marble = '#d9a596';
  const marbleC = C(marble);
  lawn(P, land, '#6c9844');
  const X0 = x0 + 4;
  const X1 = x1 - 4;
  const Z0 = z0 + 5;
  const Z1 = z1 - 13;
  const f = { mat: 'lowrise', row: 'fluted', tile: 6, tint: marble };
  // stepped temple mass: side wings, taller centre
  block(P, f, X0, Z0, X0 + 7, Z1, 0, 12.5, ROOF);
  block(P, f, X1 - 7, Z0, X1, Z1, 0, 12.5, ROOF);
  block(P, f, X0 + 7, Z0, X1 - 7, Z1, 0, 15.5, ROOF);
  // Art Deco setbacks along the parapets
  const cap = shade(marbleC, 1.06);
  box(b, X0 - 0.3, 12.1, Z0 - 0.3, X0 + 7, 13.1, Z1 + 0.3, cap);
  box(b, X1 - 7, 12.1, Z0 - 0.3, X1 + 0.3, 13.1, Z1 + 0.3, cap);
  box(b, X0 + 6.7, 15.1, Z0 - 0.3, X1 - 6.7, 16.2, Z1 + 0.3, cap);
  box(b, X0 + 10, 16.2, Z0 + 3, X1 - 10, 17.2, Z1 - 3, cap);
  // projecting south entrance pavilion with a tall recessed bronze grille and steps
  const cx = (X0 + X1) / 2;
  block(P, f, cx - 7, Z1, cx + 7, Z1 + 3, 0, 14.5, ROOF);
  box(b, cx - 7.3, 14.1, Z1 - 0.1, cx + 7.3, 15.2, Z1 + 3.3, cap);
  box(b, cx - 2.6, 0.9, Z1 + 3, cx + 2.6, 11.2, Z1 + 3.05, C('#3b3226'));
  for (let i = -2; i <= 2; i++) box(b, cx + i * 1 - 0.06, 0.9, Z1 + 3.05, cx + i * 1 + 0.06, 11.2, Z1 + 3.1, C('#8a6a3a'));
  sign(P, 'joslyn', cx, 12.6, Z1 + 3.12, 10, 0, Math.PI);
  for (let s = 0; s < 5; s++) box(b, cx - 8 + s * 0.3, 0, Z1 + 3 + s * 0.7, cx + 8 - s * 0.3, 0.9 - s * 0.18, Z1 + 3.7 + s * 0.7, C('#d3a293'));
  ctx.box(X0, Z0, X1, Z1 + 3, 16);
  // the marble retaining wall along Dodge St, open at the steps
  const wz = z1 - 0.8;
  box(b, x0 + 0.5, 0, wz, cx - 8, 1.3, wz + 0.6, marbleC);
  box(b, cx + 8, 0, wz, x1 - 0.5, 1.3, wz + 0.6, marbleC);
  box(b, x0 + 0.5, 0, z0 + 1, x0 + 1.1, 1.3, wz, marbleC);
  box(b, x1 - 1.1, 0, z0 + 1, x1 - 0.5, 1.3, wz, marbleC);
  ctx.box(x0 + 0.5, wz, cx - 8, wz + 0.6, 1.3, 'fence');
  ctx.box(cx + 8, wz, x1 - 0.5, wz + 0.6, 1.3, 'fence');
  surface(P, { x0: cx - 8, x1: cx + 8, z0: Z1 + 6.5, z1 }, 'plaza', 5);
  for (const tx of [x0 + 5, x1 - 5]) for (const tz of [z0 + 6, (z0 + z1) / 2]) tree(P, tx - (tx < cx ? 2 : -2), tz, { h: 9, kind: 'round' });
  for (const lx of [cx - 9.5, cx + 9.5]) lamp(P, lx, z1 - 3, { style: 'park' });
}

// ------------------------------------------------------------------ Omaha Central High School (1900-12)
function centralHigh(P, ctx) {
  const land = ctx.land(ctx.lm('centralhigh').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  lawn(P, land, '#6a9642');
  const X0 = x0 + 2;
  const X1 = x1 - 3.5;
  const Z0 = z0 + 2.5;
  const Z1 = z1 - 3;
  const d = 10;
  const base = { mat: 'masonry', tint: '#bcb19b', bay: 3.3, floor: 4.6 };
  const upper = { mat: 'masonry', tint: '#dcd3c0', bay: 3.3, floor: 3.6, base: 4.6 };
  const wings = [
    [X0, Z0, X1, Z0 + d],
    [X0, Z1 - d, X1, Z1],
    [X0, Z0 + d, X0 + d, Z1 - d],
    [X1 - d, Z0 + d, X1, Z1 - d],
  ];
  for (const [a, bz, c, e] of wings) {
    block(P, base, a, bz, c, e, 0, 4.6, ROOF);
    block(P, upper, a, bz, c, e, 4.6, 15.4, ROOF);
    box(b, a - 0.5, 15.0, bz - 0.5, c + 0.5, 16.0, e + 0.5, C('#e7dfcd'));
    hipRoof(b, a, bz, c, e, 16, 2.2, C('#6f6a62'), 0.2);
    ctx.box(a, bz, c, e, 18);
  }
  // translucent courtyard dome (1981)
  dome(P.get('shiny'), (X0 + X1) / 2, 15.8, (Z0 + Z1) / 2, Math.min(X1 - X0, Z1 - Z0) / 2 - d - 0.5, 4.5, 12, 3, C('#b9d2dc'));
  box(b, X0 + d, 15.2, Z0 + d, X1 - d, 15.8, Z1 - d, C('#cfc8b8'));
  // main entrance portico on 20th St (east)
  const cz = (Z0 + Z1) / 2;
  box(b, X1, 0, cz - 7, X1 + 2.8, 1.2, cz + 7, C('#cbc2ae'));
  for (let i = 0; i < 6; i++) cylinder(b, X1 + 2.2, cz - 6 + i * 2.4, 0.42, 0.42, 1.2, 12.6, 8, C('#e7dfcd'));
  box(b, X1 - 0.2, 12.6, cz - 7, X1 + 3, 14.2, cz + 7, C('#e7dfcd'));
  gableRoof(b, X1 - 0.2, cz - 7, X1 + 3, cz + 7, 14.2, 2.2, 'x', C('#8e887e'), C('#e7dfcd'), 0.2);
  sign(P, 'centralhigh', X1 + 3.05, 13.4, cz, 9, 0, -Math.PI / 2);
  ctx.box(X1, cz - 7, X1 + 2.8, cz + 7, 1.2, 'prop');
  flagpole(P, X1 + 6, cz + 12, 13);
  for (const [tx, tz] of [[x1 - 1.8, Z0 + 4], [x1 - 1.8, Z1 - 4], [X0 + 5, z1 - 1.5], [(X0 + X1) / 2, z1 - 1.5]]) tree(P, tx, tz, { h: 9, kind: 'broad' });
  ctx.tag({ id: 'lm-centralhigh-w', x: X0, y: 2.2, z: cz, nx: -1, nz: 0 });
}

// ------------------------------------------------------------------ Creighton University
function creighton(P, ctx) {
  const parts = ctx.land(ctx.lm('creighton').rect);
  const west = parts.find((p) => p.x1 < 140);
  const east = parts.find((p) => p.x0 > 140);
  const b = P.get('solid');
  const deckS = -93; // the I-480 deck runs over z -112..-94 here
  const deckN = -113;
  const rng = ctx.rng;
  for (const p of [west, east]) {
    lawn(P, { x0: p.x0, x1: p.x1, z0: p.z0, z1: deckN - 1 }, '#6a9642');
    surface(P, { x0: p.x0, x1: p.x1, z0: deckN - 1, z1: p.z1 }, 'asphalt', 8, { across: 7 });
  }
  const sandstone = '#b8946c';
  // St. John's Church (1888): English Gothic nave with twin towers facing 24th St
  const nx0 = 99;
  const nx1 = 122;
  const nz0 = -136;
  const nz1 = -123;
  block(P, { mat: 'lowrise', row: 'deco', tile: 5, tint: sandstone }, nx0, nz0, nx1, nz1, 0, 10, null);
  gableRoof(b, nx0, nz0, nx1, nz1, 10, 7.5, 'x', C('#4f4a47'), C(sandstone), 0.4);
  for (let x = nx0 + 2.8; x < nx1 - 1; x += 4.6) {
    for (const z of [nz0 - 0.5, nz1]) box(b, x - 0.45, 0, z, x + 0.45, 9, z + 0.5, shade(C(sandstone), 0.9));
  }
  const tw = 4.4;
  for (const tz of [nz0 - 0.6, nz1 + 0.6 - tw]) {
    block(P, { mat: 'solid', color: C(sandstone) }, nx1, tz, nx1 + tw, tz + tw, 0, 22, ROOF);
    // battlements and corner pinnacles
    for (const [px, pz] of [[nx1, tz], [nx1 + tw, tz], [nx1, tz + tw], [nx1 + tw, tz + tw]]) {
      box(b, px - 0.4, 22, pz - 0.4, px + 0.4, 25, pz + 0.4, C('#c4a37c'));
      pyramid(b, px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, 25, 1.4, C('#c4a37c'));
    }
    box(b, nx1 + 1.4, 22, tz - 0.2, nx1 + tw - 1.4, 23.2, tz + tw + 0.2, C('#c4a37c'));
    box(b, nx1 + tw - 0.05, 12, tz + 1.4, nx1 + tw + 0.05, 17, tz + tw - 1.4, C('#2c2a2a'));
  }
  // facade between the towers: big pointed window + doors
  const fz = (nz0 + nz1) / 2;
  block(P, { mat: 'solid', color: C(sandstone) }, nx1, nz0 + tw - 0.6, nx1 + 1.2, nz1 - tw + 0.6, 0, 16, null);
  gableRoof(b, nx1, nz0 + tw - 0.6, nx1 + 1.2, nz1 - tw + 0.6, 16, 3, 'z', C(sandstone), C(sandstone), 0);
  box(b, nx1 + 1.2, 6, fz - 1.8, nx1 + 1.25, 14, fz + 1.8, C('#3a4a6a'));
  b.tri(nx1 + 1.25, 14, fz + 1.8, nx1 + 1.25, 14, fz - 1.8, nx1 + 1.25, 16, fz, C('#3a4a6a'));
  box(b, nx1 + 1.2, 0, fz - 1.2, nx1 + 1.3, 4.5, fz + 1.2, C('#4a2f22'));
  sign(P, 'stjohns', nx1 + 2.4, 1.1, fz, 4.2, 0, -Math.PI / 2);
  ctx.box(nx0, nz0 - 0.6, nx1 + tw, nz1 + 0.6, 22);
  // Kiewit Hall: 9-story dorm (1966)
  block(P, { mat: 'office', tint: '#b99c80', bay: 3.0, floor: 3.3 }, west.x0 + 2, west.z0 + 1, west.x0 + 26, west.z0 + 13, 0, 30, ROOF);
  roofTop(P, west.x0 + 2, west.z0 + 1, west.x0 + 26, west.z0 + 13, 30, rng, { hvac: 1 });
  ctx.box(west.x0 + 2, west.z0 + 1, west.x0 + 26, west.z0 + 13, 30);
  // low modernist hall between the dorm and the church
  block(P, { mat: 'office', tint: '#d4d0c6', bay: 3.2, floor: 3.8 }, west.x0 + 28, west.z0 + 1, nx0 - 2, west.z0 + 20, 0, 11.4, ROOF);
  ctx.box(west.x0 + 28, west.z0 + 1, nx0 - 2, west.z0 + 20, 11.4);
  // east campus: Swanson Hall (tall dorm), a science hall, and a small quad
  block(P, { mat: 'office', tint: '#c2a88c', bay: 3.0, floor: 3.3 }, east.x1 - 19, east.z0 + 1, east.x1 - 1, east.z0 + 12, 0, 27, ROOF);
  roofTop(P, east.x1 - 19, east.z0 + 1, east.x1 - 1, east.z0 + 12, 27, rng, { hvac: 1 });
  ctx.box(east.x1 - 19, east.z0 + 1, east.x1 - 1, east.z0 + 12, 27);
  block(P, { mat: 'office', tint: '#d6d2c8', bay: 3.2, floor: 3.8 }, east.x0 + 1, east.z0 + 1, east.x0 + 17, east.z0 + 22, 0, 15.2, ROOF);
  ctx.box(east.x0 + 1, east.z0 + 1, east.x0 + 17, east.z0 + 22, 15.2);
  const quad = { x0: east.x0 + 19, x1: east.x1 - 1, z0: east.z0 + 14, z1: deckN - 2 };
  surface(P, { x0: quad.x0 + 7.5, x1: quad.x0 + 10.5, z0: quad.z0, z1: quad.z1 }, 'path', 3, { axis: 'z', across: 3 });
  for (const [tx, tz] of [[quad.x0 + 3, quad.z0 + 3], [quad.x1 - 3, quad.z0 + 3], [quad.x0 + 3, quad.z1 - 3], [quad.x1 - 3, quad.z1 - 3]]) tree(P, tx, tz, { h: 8, kind: 'round' });
  bench(P, quad.x0 + 6.4, (quad.z0 + quad.z1) / 2, Math.PI / 2);
  bench(P, quad.x0 + 11.6, (quad.z0 + quad.z1) / 2, -Math.PI / 2);
  postSign(P, 'creighton', east.x0 + 20, deckN - 2.5, 5, Math.PI, { post: '#2c3e6b', y: 0.4 });
  trashCan(P, quad.x0 + 12, quad.z0 + 1);
  // parking under the freeway: stalls between the bents (checked against the pillar colliders)
  for (const p of [west, east]) {
    for (const [z, heading] of [[-103, 0], [(deckS + p.z1) / 2 - 0.2, Math.PI]]) {
      for (let x = p.x0 + 2; x < p.x1 - 2; x += 2.7) {
        if (ctx.col.isFree(x, z, 2.2, 0.3, 1.6)) ctx.park(x, z, heading);
      }
    }
  }
  for (const x of [west.x0 + 20, east.x0 + 10]) lamp(P, x, deckN - 1.5, { style: 'cobra', rot: Math.PI, h: 6 });
}

// ------------------------------------------------------------------ Mutual of Omaha (1970 tower, 1979 dome)
function mutual(P, ctx) {
  const land = ctx.land(ctx.lm('mutual').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  surface(P, land, 'plaza', 6, { across: 6 });
  // tower: pale stone slab with deep vertical window strips
  const T = { x0: x0 + 1, x1: x0 + 25, z0: z1 - 14, z1: z1 - 1 };
  block(P, { mat: 'masonry', tint: '#cfc8bb', bay: 3.2, floor: 4.2 }, T.x0 - 0.5, T.z0 - 0.5, T.x1 + 0.5, T.z1 + 0.5, 0, 6, ROOF);
  block(P, { mat: 'slab', tint: '#e3ddd2', bay: 1.7, floor: 4.0, base: 6 }, T.x0, T.z0, T.x1, T.z1, 6, 60, ROOF);
  box(b, T.x0 - 0.3, 60, T.z0 - 0.3, T.x1 + 0.3, 62, T.z1 + 0.3, C('#e9e4da'));
  roofTop(P, T.x0, T.z0, T.x1, T.z1, 62, ctx.rng, { hvac: 1, ph: 3 });
  sign(P, 'mutual', (T.x0 + T.x1) / 2, 58, T.z0 - 0.05, 16, 0, 0);
  sign(P, 'mutual', T.x1 + 0.35, 58, (T.z0 + T.z1) / 2, 11, 0, -Math.PI / 2);
  ctx.box(T.x0 - 0.5, T.z0 - 0.5, T.x1 + 0.5, T.z1 + 0.5, 62);
  // low west wing joining the dome
  block(P, { mat: 'office', tint: '#cfc8bb', bay: 3.2, floor: 4 }, x0 + 1, z0 + 1, x0 + 12, T.z0 - 0.5, 0, 12, ROOF);
  ctx.box(x0 + 1, z0 + 1, x0 + 12, T.z0 - 0.5, 12);
  // the glass dome on the corner of 33rd & Dodge
  const dx = x1 - 10.5;
  const dz = z0 + 11;
  cylinder(b, dx, dz, 10, 10, 0, 1.2, 16, C('#bdb6aa'));
  dome(P.get('shiny'), dx, 1.2, dz, 9.6, 6.2, 16, 4, C('#9cc0d2'), C('#b7d4e0'));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.glow(dx + Math.cos(a) * 6, 2, dz + Math.sin(a) * 6, '#d8f0ff', 3.2);
  }
  ctx.box(dx - 7.2, dz - 7.2, dx + 7.2, dz + 7.2, 7.4);
  for (let i = 0; i < 3; i++) flagpole(P, x0 + 16 + i * 2.6, z0 + 2.5, 12);
  tree(P, x0 + 4, z0 + 4, { h: 8, kind: 'round' });
}

// ------------------------------------------------------------------ Kiewit Plaza (1961)
function kiewitPlaza(P, ctx) {
  const land = ctx.land(ctx.lm('kiewitplaza').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  surface(P, { x0, x1, z0, z1: z0 + 7 }, 'plaza', 6);
  lawn(P, { x0, x1, z0: z0 + 7, z1 }, '#6a9642');
  const S = { x0: x0 + 2, x1: x1 - 2, z0: z0 + 8, z1: z0 + 23 };
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, S.x0 + 1.2, S.z0 + 1.2, S.x1 - 1.2, S.z1 - 1.2, 0, 4.4, ROOF);
  block(P, { mat: 'office', tint: '#e6e3dc', bay: 3.1, floor: 3.2, base: 4.4, uOff: 2 }, S.x0, S.z0, S.x1, S.z1, 4.4, 48, ROOF);
  box(b, S.x0, 4.2, S.z0, S.x1, 4.4, S.z1, C('#d8d5ce'), { top: false, bottom: true });
  for (let i = 0; i <= 5; i++) {
    const x = S.x0 + 0.4 + ((S.x1 - S.x0 - 0.8) * i) / 5;
    box(b, x - 0.35, 0, S.z0, x + 0.35, 4.4, S.z0 + 0.7, C('#d8d5ce'));
  }
  roofTop(P, S.x0, S.z0, S.x1, S.z1, 48, ctx.rng, { hvac: 1, ph: 3 });
  sign(P, 'kiewit', (S.x0 + S.x1) / 2, 5.2, S.z0 - 0.05, 8, 0, 0);
  ctx.box(S.x0 + 1.2, S.z0 + 1.2, S.x1 - 1.2, S.z1 - 1.2, 48);
  for (const tx of [x0 + 3, x1 - 3]) tree(P, tx, z1 - 4, { h: 8 });
}

// ------------------------------------------------------------------ Blackstone Center (1916 hotel)
function blackstone(P, ctx) {
  const land = ctx.land(ctx.lm('blackstone').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const X0 = x0 + 1;
  const X1 = x1 - 0.5;
  const Z0 = z0 + 1;
  const Z1 = z1 - 1;
  const cream = C('#e3d5b8');
  block(P, { mat: 'masonry', tint: '#e0d2b4', bay: 3.2, floor: 3.7 }, X0, Z0, X1, Z1, 0, 7.4, ROOF);
  block(P, { mat: 'masonry', tint: '#8c4c3a', bay: 3.0, floor: 3.4, base: 7.4, uOff: 1 }, X0, Z0, X1, Z1, 7.4, 26.2, ROOF);
  block(P, { mat: 'masonry', tint: '#dccdb0', bay: 3.0, floor: 3.4 }, X0, Z0, X1, Z1, 26.2, 29.6, ROOF);
  // terracotta cornice + belt course
  box(b, X0 - 1.0, 28.6, Z0 - 1.0, X1 + 1.0, 29.8, Z1 + 1.0, cream);
  box(b, X0 - 0.3, 7.2, Z0 - 0.3, X1 + 0.3, 7.8, Z1 + 0.3, cream);
  roofTop(P, X0, Z0, X1, Z1, 29.8, ctx.rng, { hvac: 2, ph: 3 });
  // Farnam St entrance canopy + the vertical sign on the corner
  const cx = (X0 + X1) / 2;
  box(b, cx - 4, 3.8, Z0 - 3, cx + 4, 4.2, Z0, C('#2a2320'), { bottom: true });
  box(b, X1, 9, Z0 + 2.5, X1 + 2.2, 22, Z0 + 2.8, C('#2a1f1b'));
  sign(P, 'blackstone', X1 + 1.1, 15.5, Z0 + 2.45, 2, 12.5, 0);
  sign(P, 'blackstone', X1 + 1.1, 15.5, Z0 + 2.85, 2, 12.5, Math.PI);
  ctx.box(X0, Z0, X1, Z1, 29.8);
}
