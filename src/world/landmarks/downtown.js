import { C, shade, box, obox, block, oblock, wall, curvedWall, polyRoof, cylinder, gableRoof, vault, dome, beam, lawn, surface, oboxCollider } from './kit.js';
import { tree, bench, lamp, flagpole, sign, postSign } from './props.js';

// Downtown Omaha, 1993: the skyline landmarks from data/map.js. Heights are the map's `h` values
// (game meters, ~0.75 vertical compression). Woodmen Tower is the tallest thing on the skyline.

const ROOF = C('#5e5b57');
const ROOF_DARK = C('#3f3c39');
const LIMESTONE = '#dcd2bd';

export function buildDowntown(ctx) {
  const P = ctx.cluster('downtown');
  woodmen(P, ctx);
  firstNational(P, ctx);
  nwBell(P, ctx);
  usWest(P, ctx);
  unionPacific(P, ctx);
  worldHerald(P, ctx);
  brandeis(P, ctx);
  landmarkCenter(P, ctx);
  centralParkPlaza(P, ctx);
  library(P, ctx);
  courthouse(P, ctx);
  cityHall(P, ctx);
  civicAuditorium(P, ctx);
  orpheum(P, ctx);
  policeHQ(P, ctx);
  unionStation(P, ctx);
  P.flush();
}

/** Roof clutter: parapet coping, a mechanical penthouse and a few HVAC boxes. */
export function roofTop(P, x0, z0, x1, z1, y, rng, opts = {}) {
  const b = P.get('solid');
  const w = x1 - x0;
  const d = z1 - z0;
  const pw = w * (opts.pw || 0.45);
  const pd = d * (opts.pd || 0.4);
  const cx = (x0 + x1) / 2 + (rng() - 0.5) * w * 0.15;
  const cz = (z0 + z1) / 2 + (rng() - 0.5) * d * 0.15;
  if ((opts.ph ?? 3.5) > 0.05) box(b, cx - pw / 2, y, cz - pd / 2, cx + pw / 2, y + (opts.ph || 3.5), cz + pd / 2, C(opts.color || '#8a857d'), { cTop: ROOF_DARK });
  const n = opts.hvac ?? 3;
  for (let i = 0; i < n; i++) {
    const hx = x0 + 1.5 + rng() * Math.max(0.1, w - 5);
    const hz = z0 + 1.5 + rng() * Math.max(0.1, d - 4);
    box(b, hx, y, hz, hx + 2 + rng() * 2, y + 1.2 + rng(), hz + 1.5 + rng() * 1.5, C('#9a9892'));
  }
  const cp = C(opts.coping || '#b7b1a6');
  const t = 0.35;
  box(b, x0, y, z0, x1, y + 0.9, z0 + t, cp);
  box(b, x0, y, z1 - t, x1, y + 0.9, z1, cp);
  box(b, x0, y, z0, x0 + t, y + 0.9, z1, cp);
  box(b, x1 - t, y, z0, x1, y + 0.9, z1, cp);
}

// ------------------------------------------------------------------ Woodmen Tower (1969)
function woodmen(P, ctx) {
  const { x0, x1, z0, z1 } = ctx.lm('woodmen').rect;
  const H = 110;
  const b = P.get('solid');
  const granite = C('#4a3a35');
  // recessed two-story glass lobby between granite piers
  const inset = 1.6;
  block(P, { mat: 'lowrise', row: 'terminal', tile: 9 }, x0 + inset, z0 + inset, x1 - inset, z1 - inset, 0, 7.2, ROOF);
  for (let i = 0; i <= 8; i++) {
    const x = x0 + ((x1 - x0) * i) / 8;
    box(b, x - 0.55, 0, z0 - 0.1, x + 0.55, 7.2, z0 + 1.0, granite);
    box(b, x - 0.55, 0, z1 - 1.0, x + 0.55, 7.2, z1 + 0.1, granite);
  }
  for (let j = 1; j < 6; j++) {
    const z = z0 + ((z1 - z0) * j) / 6;
    box(b, x0 - 0.1, 0, z - 0.55, x0 + 1.0, 7.2, z + 0.55, granite);
    box(b, x1 - 1.0, 0, z - 0.55, x1 + 0.1, 7.2, z + 0.55, granite);
  }
  // the slab: dark red-brown granite piers with bronze glass, strongly vertical
  block(P, { mat: 'slab', tint: '#7a5c52', bay: 1.55, floor: 3.62, base: 7.2 }, x0, z0, x1, z1, 7.2, H - 4.5, ROOF);
  // mechanical crown: blank granite band, then the flat roof
  block(P, { mat: 'solid', color: granite }, x0, z0, x1, z1, H - 4.5, H - 0.6, ROOF_DARK);
  box(b, x0 - 0.2, H - 0.6, z0 - 0.2, x1 + 0.2, H, z1 + 0.2, C('#3a2e2a'));
  box(b, x0 + 7, H, z0 + 5, x1 - 7, H + 3, z1 - 5, C('#3b312e'), { cTop: ROOF_DARK });
  ctx.beacon(P, (x0 + x1) / 2, H + 3.6, (z0 + z1) / 2, 1.0);
  for (const [bx, bz] of [[x0 + 0.6, z0 + 0.6], [x1 - 0.6, z1 - 0.6]]) ctx.beacon(P, bx, H + 0.7, bz, 0.6);
  // entrance canopy + name on Farnam St (south)
  box(b, (x0 + x1) / 2 - 6, 4.2, z1, (x0 + x1) / 2 + 6, 4.6, z1 + 3, C('#2f2624'), { bottom: true });
  sign(P, 'woodmen', (x0 + x1) / 2, 5.3, z1 + 0.15, 8, 0, Math.PI);
  ctx.box(x0, z0, x1, z1, H, 'landmark');
}

// ------------------------------------------------------------------ First National Center (1971)
function firstNational(P, ctx) {
  const land = ctx.land(ctx.lm('firstnational').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const stone = C('#e2dac8');
  surface(P, land, 'plaza', 6, { across: 6 });
  // dark recessed core at street level
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, x0 + 3.2, z0 + 3.2, x1 - 3.2, z1 - 3.2, 0, 10, ROOF);
  // limestone colonnade: square columns carrying a deep architrave
  const cols = [];
  const nx = 6;
  const nz = 7;
  for (let i = 0; i <= nx; i++) {
    const x = x0 + 0.8 + ((x1 - x0 - 1.6) * i) / nx;
    cols.push([x, z0 + 0.8], [x, z1 - 0.8]);
  }
  for (let j = 1; j < nz; j++) {
    const z = z0 + 0.8 + ((z1 - z0 - 1.6) * j) / nz;
    cols.push([x0 + 0.8, z], [x1 - 0.8, z]);
  }
  for (const [cx, cz] of cols) {
    box(b, cx - 0.6, 0, cz - 0.6, cx + 0.6, 10, cz + 0.6, stone);
    ctx.box(cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6, 10);
  }
  box(b, x0, 10, z0, x1, 12.4, z1, stone, { bottom: true });
  // the glass tower floating above
  const tx0 = x0 + 1.5;
  const tx1 = x1 - 1.5;
  const tz0 = z0 + 1.5;
  const tz1 = z1 - 1.5;
  block(P, { mat: 'glass', tint: '#6f7f86', bay: 3.0, floor: 3.4, base: 12.4 }, tx0, tz0, tx1, tz1, 12.4, 64.5, ROOF);
  // limestone edge piers on the tower corners
  for (const [cx, cz] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) box(b, cx - 0.7, 12.4, cz - 0.7, cx + 0.7, 66, cz + 0.7, stone);
  block(P, { mat: 'solid', color: shade(stone, 0.85) }, tx0, tz0, tx1, tz1, 64.5, 68, ROOF);
  box(b, tx0 + 6, 68, tz0 + 6, tx1 - 6, 71, tz1 - 6, C('#8d8a84'), { cTop: ROOF_DARK });
  // antenna mast to 88 m with cross arms and beacons
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const steel = C('#b9bcbc');
  cylinder(b, mx, mz, 0.9, 0.35, 71, 88, 6, steel);
  for (const y of [76, 82]) {
    beam(b, mx - 2.2, y, mz, mx + 2.2, y, mz, 0.18, steel);
    beam(b, mx, y, mz - 2.2, mx, y, mz + 2.2, 0.18, steel);
  }
  ctx.beacon(P, mx, 88.6, mz, 0.9);
  ctx.beacon(P, mx, 79, mz + 0.9, 0.6);
  ctx.box(x0 + 3.2, z0 + 3.2, x1 - 3.2, z1 - 3.2, 68);
  sign(P, 'firstnational', mx, 11.2, z1 + 0.05, 12, 0, Math.PI);
}

// ------------------------------------------------------------------ Northwestern Bell (1957/62)
function nwBell(P, ctx) {
  const land = ctx.land(ctx.lm('nwbell-old').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const H = 58;
  const X0 = x0 + 0.5;
  const X1 = x1 - 0.5;
  const Z0 = z0 + 0.5;
  const Z1 = z1 - 0.5;
  // granite base, then brick + granite with long rows of aluminum-framed windows
  block(P, { mat: 'masonry', tint: '#8f8a84', bay: 3.6, floor: 4.5 }, X0, Z0, X1, Z1, 0, 4.5, ROOF);
  block(P, { mat: 'office', tint: '#cbbfae', bay: 3.2, floor: 3.35, base: 4.5, uOff: 1 }, X0 + 3.6, Z0, X1 - 3.6, Z1, 4.5, H, ROOF);
  // granite end bays (blank walls on the narrow sides)
  block(P, { mat: 'solid', color: C('#a39c92') }, X0, Z0, X0 + 3.6, Z1, 4.5, H + 0.4, ROOF);
  block(P, { mat: 'solid', color: C('#a39c92') }, X1 - 3.6, Z0, X1, Z1, 4.5, H + 0.4, ROOF);
  roofTop(P, X0, Z0, X1, Z1, H, ctx.rng, { ph: 4 });
  // phone-company microwave relay tower on the roof: lattice + drum and horn antennas
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2 + 4;
  const steel = C('#a7aaab');
  const top = H + 18;
  for (const [sx, sz] of [[-1.8, -1.8], [1.8, -1.8], [1.8, 1.8], [-1.8, 1.8]]) beam(b, cx + sx, H + 4, cz + sz, cx + sx * 0.5, top, cz + sz * 0.5, 0.25, steel);
  for (let y = H + 6; y < top; y += 3) {
    const k = 1.8 - ((y - H - 4) / (top - H - 4)) * 0.9;
    beam(b, cx - k, y, cz - k, cx + k, y, cz + k, 0.12, steel);
    beam(b, cx + k, y, cz - k, cx - k, y, cz + k, 0.12, steel);
  }
  const drum = C('#e7e7e2');
  for (const [dx, dz, h] of [[1.6, 0, H + 11], [-1.6, 0, H + 14], [0, 1.6, H + 9]]) cylinder(b, cx + dx * 1.2, cz + dz * 1.2, 1.1, 1.1, h, h + 0.9, 8, drum);
  box(b, cx - 1, H + 15, cz - 2.8, cx + 1, H + 17, cz - 1.4, drum);
  ctx.beacon(P, cx, top + 0.5, cz, 0.7);
  ctx.box(X0, Z0, X1, Z1, H);
  sign(P, 'nwbell', cx, 5.4, Z1 + 0.05, 10, 0, Math.PI);
}

// ------------------------------------------------------------------ US West / Northwestern Bell HQ (1981)
function usWest(P, ctx) {
  const land = ctx.land(ctx.lm('uswest').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const f = { mat: 'office', tint: '#9e7767', bay: 3.0, floor: 3.6, uOff: 2 };
  const X0 = x0 + 0.5;
  const X1 = x1 - 0.5;
  const Z0 = z0 + 1;
  const Z1 = z1 - 3;
  surface(P, { x0, x1, z0: Z1, z1 }, 'plaza', 6);
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, X0 + 1.5, Z0 + 1.5, X1 - 1.5, Z1 - 1.5, 0, 5, ROOF);
  block(P, { ...f, base: 5 }, X0, Z0, X1, Z1, 5, 44, ROOF);
  const b = P.get('solid');
  box(b, X0, 4.8, Z0, X1, 5, Z1, C('#7b5d51'), { top: false, bottom: true });
  // the stepped central slice
  const m = (Z0 + Z1) / 2;
  block(P, { ...f, base: 5 }, X0, m - 7, X1, m + 7, 44, 52, ROOF);
  block(P, { ...f, base: 5 }, X0 + 1, m - 4, X1 - 1, m + 4, 52, 59, ROOF);
  box(b, X0 + 1, 59, m - 4, X1 - 1, 60, m + 4, C('#6b5047'));
  roofTop(P, X0, Z0, X1, m - 7, 44, ctx.rng, { hvac: 2, ph: 0.01 });
  roofTop(P, X0 + 1, m - 4, X1 - 1, m + 4, 60, ctx.rng, { hvac: 1, ph: 2.5 });
  // piloti columns around the recessed lobby
  for (let i = 0; i <= 5; i++) {
    const x = X0 + 0.45 + ((X1 - X0 - 0.9) * i) / 5;
    box(b, x - 0.45, 0, Z0, x + 0.45, 5, Z0 + 0.9, C('#7b5d51'));
    box(b, x - 0.45, 0, Z1 - 0.9, x + 0.45, 5, Z1, C('#7b5d51'));
  }
  ctx.box(X0 + 1.5, Z0 + 1.5, X1 - 1.5, Z1 - 1.5, 60);
  sign(P, 'uswest', (X0 + X1) / 2, 6.2, Z1 + 0.05, 8, 0, Math.PI);
}

// ------------------------------------------------------------------ Union Pacific HQ (1911 + 1971 annex)
function unionPacific(P, ctx) {
  const { x0, x1, z0, z1 } = ctx.lm('unionpacific').rect;
  const b = P.get('solid');
  const H = 42;
  const brick = { mat: 'masonry', tint: '#a8805f', bay: 3.4, floor: 3.55, base: 7.5, uOff: 1 };
  const stone = { mat: 'masonry', tint: '#cfbea0', bay: 3.4, floor: 3.75 };
  const Z1 = z1 - 1.5;
  const mz = Z1 - 29;
  block(P, stone, x0, mz, x1, Z1, 0, 7.5, ROOF);
  block(P, brick, x0, mz, x1, Z1, 7.5, H - 2, ROOF);
  block(P, { ...brick, tint: '#9a7556' }, x0, mz, x1, Z1, H - 2, H, ROOF);
  // deep cornice + belt course
  box(b, x0 - 0.8, H - 1.6, mz - 0.8, x1 + 0.8, H - 0.6, Z1 + 0.8, C('#d6c8ae'));
  box(b, x0 - 0.3, 7.2, mz - 0.3, x1 + 0.3, 7.8, Z1 + 0.3, C('#d6c8ae'));
  roofTop(P, x0, mz, x1, Z1, H, ctx.rng, { coping: '#c7b79c' });
  // 1971 annex behind
  block(P, { mat: 'office', tint: '#c9c2b5', bay: 3.2, floor: 3.6 }, x0 + 2, z0, x1 - 2, mz, 0, 22, ROOF);
  roofTop(P, x0 + 2, z0, x1 - 2, mz, 22, ctx.rng, { hvac: 2, ph: 2.5 });
  // Dodge St entrance: stone portal and the carved name
  const cx = (x0 + x1) / 2;
  box(b, cx - 5, 0, Z1, cx + 5, 7.2, Z1 + 0.8, C('#d8caae'));
  box(b, cx - 3, 0, Z1 + 0.8, cx + 3, 4.2, Z1 + 0.85, C('#2a2622'));
  sign(P, 'unionpacific', cx, 5.6, Z1 + 0.9, 8.5, 0, Math.PI);
  flagpole(P, cx + 8, z1 - 0.6, 11);
  ctx.box(x0, mz, x1, Z1 + 0.8, H);
  ctx.box(x0 + 2, z0, x1 - 2, mz, 22);
}

// ------------------------------------------------------------------ Omaha World-Herald (1948)
function worldHerald(P, ctx) {
  const land = ctx.land(ctx.lm('worldherald').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const H = 20;
  const R = 7;
  const f = { mat: 'masonry', tint: '#dccfb6', bay: 3.4, floor: 4 };
  // footprint with the rounded SE corner (the corner entrance)
  wall(P, f, x0, z1, x1 - R, z1, 0, H);
  wall(P, f, x1, z1 - R, x1, z0, 0, H);
  wall(P, f, x1, z0, x0, z0, 0, H);
  wall(P, f, x0, z0, x0, z1, 0, H);
  const cx = x1 - R;
  const cz = z1 - R;
  // the curved entrance: tall glass bays below, stone above
  curvedWall(P, { mat: 'lowrise', row: 'deco', tile: 5.5, fit: true, tint: '#efe6d2' }, cx, cz, R, -Math.PI / 2, 0, 8, 0, 12);
  curvedWall(P, { ...f, tint: '#e6dac3' }, cx, cz, R, -Math.PI / 2, 0, 8, 12, H + 1.2);
  const pts = [[x0, z1]];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * R, cz - Math.sin(a) * R]);
  }
  pts.push([x1, z0], [x0, z0]);
  polyRoof(b, pts, H, ROOF);
  cylinder(b, cx, cz, R - 0.05, R - 0.05, H, H + 1.2, 8, C('#e6dac3'), { a0: -Math.PI / 2, a1: 0 });
  roofTop(P, x0 + 1, z0 + 1, x1 - 4, z1 - 10, H, ctx.rng, { hvac: 4, pw: 0.5, pd: 0.25 });
  sign(P, 'worldherald', cx + R * 0.72, 13.6, cz + R * 0.72, 9, 0, (-Math.PI * 3) / 4, { out: 0.4 });
  ctx.box(x0, z0, x1, z1 - R, H);
  ctx.box(x0, z1 - R, x1 - R, z1, H);
  ctx.box(x1 - R, z1 - R, x1 - R * 0.3, z1 - R * 0.3, H);
}

// ------------------------------------------------------------------ Brandeis Building (1906)
function brandeis(P, ctx) {
  const land = ctx.land(ctx.lm('brandeis').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const H = 34;
  block(P, { mat: 'lowrise', row: 'storefront', tile: 8, tint: '#e3d6bc' }, x0, z0, x1, z1, 0, 5.2, ROOF);
  block(P, { mat: 'masonry', tint: '#d8c4a0', bay: 3.2, floor: 3.2, base: 5.2, uOff: 2 }, x0, z0, x1, z1, 5.2, H - 1.5, ROOF);
  block(P, { mat: 'solid', color: C('#e3d6bc') }, x0, z0, x1, z1, H - 1.5, H, ROOF);
  // heavy projecting cornice and a belt course over the store level
  box(b, x0 - 1.1, H - 2.2, z0 - 1.1, x1 + 1.1, H - 1.2, z1 + 1.1, C('#efe5d2'));
  box(b, x0 - 0.4, 5.0, z0 - 0.4, x1 + 0.4, 5.6, z1 + 0.4, C('#efe5d2'));
  roofTop(P, x0, z0, x1, z1, H, ctx.rng);
  sign(P, 'brandeis', x1 - 7, 6.6, z1 + 0.45, 7, 0, Math.PI);
  ctx.box(x0, z0, x1, z1, H);
}

// ------------------------------------------------------------------ 1200 Landmark Center (1990)
function landmarkCenter(P, ctx) {
  const land = ctx.land(ctx.lm('landmarkcenter').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const tint = '#c6a594';
  block(P, { mat: 'office', tint, bay: 3.0, floor: 3.6 }, x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, 0, 10.5, ROOF);
  const tx0 = x0 + 2.5;
  const tx1 = x1 - 2.5;
  const tz0 = z0 + 5;
  const tz1 = z1 - 5;
  block(P, { mat: 'office', tint, bay: 2.9, floor: 3.4, base: 10.5, uOff: 1 }, tx0, tz0, tx1, tz1, 10.5, 50, ROOF);
  // stone corner piers, then the crown: four gabled peaks (a cross-gable roof)
  const stone = C('#d9c3b4');
  for (const [cx, cz] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) box(b, cx - 0.9, 10.5, cz - 0.9, cx + 0.9, 51.5, cz + 0.9, stone);
  box(b, tx0 - 0.4, 50, tz0 - 0.4, tx1 + 0.4, 51.5, tz1 + 0.4, stone);
  const roof = C('#4b5a58');
  gableRoof(b, tx0, tz0, tx1, tz1, 51.5, 8.5, 'x', roof, stone, 0.6);
  gableRoof(b, tx0, tz0, tx1, tz1, 51.5, 8.5, 'z', roof, stone, 0.6);
  // floodlit gables at night
  const cx = (tx0 + tx1) / 2;
  const cz = (tz0 + tz1) / 2;
  for (const [gx, gz] of [[cx, tz0 - 1], [cx, tz1 + 1], [tx0 - 1, cz], [tx1 + 1, cz]]) ctx.glow(gx, 55, gz, '#ffe7c0', 7);
  ctx.beacon(P, cx, 60.4, cz, 0.6);
  ctx.box(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, 50);
}

// ------------------------------------------------------------------ Central Park Plaza (1982)
function centralParkPlaza(P, ctx) {
  const land = ctx.land(ctx.lm('centralparkplaza').rect)[0];
  const b = P.get('solid');
  const f = { mat: 'office', tint: '#a4543f', bay: 3.0, floor: 3.35, uOff: 1 };
  const H = 50;
  surface(P, land, 'pavers', 4, { across: 4 });
  const towers = [
    { cx: 407.5, cz: 81.6, rot: 0.46 },
    { cx: 407.5, cz: 96.9, rot: -0.46 },
  ];
  for (const t of towers) {
    oblock(P, f, t.cx, t.cz, 24, 11.5, t.rot, 0, H, ROOF);
    obox(b, t.cx, t.cz, 24.4, 11.9, H, H + 0.8, t.rot, C('#8e4636'), { cTop: ROOF });
    obox(b, t.cx + 1, t.cz, 9, 6, H + 0.8, H + 3.8, t.rot, C('#8a4a3a'), { cTop: ROOF_DARK });
    oboxCollider(ctx.col, t.cx, t.cz, 24, 11.5, t.rot, H);
  }
  // two-story glass connector filling the V at the west end
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, 394.5, 84.5, 409, 94, 0, 8, ROOF);
  ctx.box(394.5, 84.5, 409, 94, 8);
  for (const [tx, tz] of [[418, 89], [417, 75], [417, 104]]) tree(P, tx, tz, { h: 7, kind: 'round' });
}

// ------------------------------------------------------------------ W. Dale Clark Library (1977)
function library(P, ctx) {
  const land = ctx.land(ctx.lm('library').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const stoneTint = '#dccdb0';
  // recessed glass ground floor under a heavy limestone box
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, x0 + 3, z0 + 3, x1 - 3, z1 - 3, 0, 4.6, ROOF);
  block(P, { mat: 'lowrise', row: 'stoneslit', tile: 7, tint: stoneTint }, x0, z0, x1, z1, 4.6, 16, ROOF);
  box(b, x0, 4.4, z0, x1, 4.6, z1, C(stoneTint), { top: false, bottom: true });
  for (const [cx, cz] of [[x0 + 1.2, z0 + 1.2], [x1 - 1.2, z0 + 1.2], [x0 + 1.2, z1 - 1.2], [x1 - 1.2, z1 - 1.2]]) {
    box(b, cx - 1.2, 0, cz - 1.2, cx + 1.2, 4.6, cz + 1.2, C(stoneTint));
    ctx.box(cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2, 16);
  }
  roofTop(P, x0, z0, x1, z1, 16, ctx.rng, { coping: '#cbbc9f' });
  sign(P, 'library', (x0 + x1) / 2, 5.6, z1 + 0.05, 9, 0, Math.PI);
  ctx.box(x0 + 3, z0 + 3, x1 - 3, z1 - 3, 16);
  ctx.tag({ id: 'lm-library-back', x: x0 + 3, y: 2, z: (z0 + z1) / 2, nx: -1, nz: 0 });
}

// ------------------------------------------------------------------ Douglas County Courthouse (1912)
function courthouse(P, ctx) {
  const land = ctx.land(ctx.lm('courthouse').rect)[0];
  const { x0, x1, z1 } = land;
  const b = P.get('solid');
  const stone = { mat: 'masonry', tint: LIMESTONE, bay: 3.3, floor: 3.8, base: 4.4 };
  const base = { mat: 'masonry', tint: '#b9b1a2', bay: 3.3, floor: 4.4 };
  const X0 = x0 + 1;
  const X1 = x1 - 1;
  const Z0 = land.z0 + 8; // set back from Farnam
  const Z1 = z1 - 0.5;
  const H = 22;
  block(P, base, X0, Z0, X1, Z1, 0, 4.4, ROOF);
  block(P, stone, X0, Z0, X1, Z1, 4.4, H, ROOF);
  // projecting end wings on the Farnam front, each with a pediment
  const wing = 8;
  for (const [wx0, wx1] of [[X0, X0 + wing], [X1 - wing, X1]]) {
    block(P, base, wx0, Z0 - 2.2, wx1, Z0, 0, 4.4, ROOF);
    block(P, stone, wx0, Z0 - 2.2, wx1, Z0, 4.4, H, ROOF);
    gableRoof(b, wx0, Z0 - 2.2, wx1, Z0 + 2, H, 3.2, 'z', C('#b7ae9c'), C(LIMESTONE), 0.3);
  }
  // balustrade + cornice
  const cor = C('#e6ddca');
  box(b, X0 - 0.5, H - 0.8, Z0 - 0.5, X1 + 0.5, H, Z1 + 0.5, cor);
  box(b, X0, H, Z0, X1, H + 1, Z0 + 0.4, cor);
  box(b, X0, H, Z1 - 0.4, X1, H + 1, Z1, cor);
  // arcaded entrance loggia with engaged columns
  const cx = (X0 + X1) / 2;
  const dark = C('#2d2a26');
  for (let i = -2; i <= 2; i++) {
    const ax = cx + i * 3.4;
    box(b, ax - 1.1, 0.3, Z0 - 0.15, ax + 1.1, 4.4, Z0 - 0.05, dark);
    cylinder(b, ax - 1.7, Z0 - 0.6, 0.45, 0.45, 4.4, 17, 8, cor);
  }
  cylinder(b, cx + 3 * 3.4 - 1.7, Z0 - 0.6, 0.45, 0.45, 4.4, 17, 8, cor);
  box(b, cx - 10, 17, Z0 - 1.2, cx + 10, 18.6, Z0, cor);
  sign(P, 'courthouse', cx, 19.3, Z0 - 0.02, 14, 0, 0);
  // wide front steps
  for (let s = 0; s < 3; s++) box(b, cx - 9 + s * 0.4, 0, Z0 - 2.2 - (3 - s) * 0.6, cx + 9 - s * 0.4, 0.2 + s * 0.2, Z0, C('#cfc7b6'));
  // octagonal drum + dome + lantern at the centre of the roof
  const dz = (Z0 + Z1) / 2;
  cylinder(b, cx, dz, 7.4, 7.4, H, H + 5.2, 8, C('#d4cbb8'), { a0: Math.PI / 8, a1: Math.PI / 8 + Math.PI * 2 });
  cylinder(b, cx, dz, 7.8, 7.8, H + 5.2, H + 5.7, 8, cor, { a0: Math.PI / 8, a1: Math.PI / 8 + Math.PI * 2 });
  dome(b, cx, H + 5.7, dz, 7.2, 6.4, 8, 3, C('#7f9689'), C('#8fa597'));
  cylinder(b, cx, dz, 1.3, 1.1, H + 11.4, H + 13, 8, C('#d4cbb8'));
  cylinder(b, cx, dz, 1.4, 0.1, H + 13, H + 14.2, 8, C('#7f9689'));
  ctx.box(X0, Z0 - 2.2, X1, Z1, H);
  // lawn and trees on the Farnam St setback
  lawn(P, { x0: land.x0, x1: land.x1, z0: land.z0, z1: Z0 - 4.2 }, '#6d9443');
  for (const tx of [X0 + 3, X1 - 3]) tree(P, tx, land.z0 + 2.5, { h: 8, kind: 'round' });
  flagpole(P, cx - 12, land.z0 + 2.5, 12);
}

// ------------------------------------------------------------------ Omaha-Douglas Civic Center / City Hall (1974)
function cityHall(P, ctx) {
  const land = ctx.land(ctx.lm('cityhall').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const H = 44;
  const sx0 = x0 + 6;
  const sx1 = x1 - 8;
  const sz0 = z0 + 11;
  const sz1 = z1 - 6;
  surface(P, land, 'plaza', 6, { across: 6 });
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, sx0 + 1.8, sz0 + 1.8, sx1 - 1.8, sz1 - 1.8, 0, 4.2, ROOF);
  block(P, { mat: 'office', tint: '#d6d3cb', bay: 3.0, floor: 3.35, base: 4.2 }, sx0, sz0, sx1, sz1, 4.2, H, ROOF);
  box(b, sx0, 4.0, sz0, sx1, 4.2, sz1, C('#cfcac0'), { top: false, bottom: true });
  for (let i = 0; i <= 6; i++) {
    const x = sx0 + 0.5 + ((sx1 - sx0 - 1) * i) / 6;
    box(b, x - 0.4, 0, sz0 + 0.1, x + 0.4, 4.2, sz0 + 0.9, C('#d6d3cb'));
    box(b, x - 0.4, 0, sz1 - 0.9, x + 0.4, 4.2, sz1 - 0.1, C('#d6d3cb'));
  }
  roofTop(P, sx0, sz0, sx1, sz1, H, ctx.rng, { coping: '#c4c1b8' });
  ctx.box(sx0 + 1.8, sz0 + 1.8, sx1 - 1.8, sz1 - 1.8, H);
  // fountain pool and planters on the Farnam St plaza
  const px = (x0 + x1) / 2;
  const pz = z0 + 5.5;
  box(b, px - 6, 0, pz - 2.6, px + 6, 0.55, pz + 2.6, C('#bcb6aa'));
  P.get('lake').quad(px - 5.6, 0.45, pz + 2.2, px + 5.6, 0.45, pz + 2.2, px + 5.6, 0.45, pz - 2.2, px - 5.6, 0.45, pz - 2.2, C('#6f8e98'), 0, 0, 2, 1);
  ctx.box(px - 6, pz - 2.6, px + 6, pz + 2.6, 0.55, 'prop');
  for (const [tx, tz] of [[x0 + 2.5, z0 + 3], [x1 - 2.5, z0 + 3], [x0 + 2.5, z1 - 3], [x1 - 3, (z0 + z1) / 2]]) {
    box(b, tx - 1.6, 0, tz - 1.6, tx + 1.6, 0.6, tz + 1.6, C('#b0aa9d'));
    tree(P, tx, tz, { h: 7, kind: 'round', collide: false });
    ctx.box(tx - 1.6, tz - 1.6, tx + 1.6, tz + 1.6, 0.6, 'prop');
  }
  for (let i = 0; i < 3; i++) flagpole(P, sx0 + 6 + i * 3, sz0 - 2.5, 13);
  postSign(P, 'cityhall', px - 9, z0 + 1.2, 5, 0, { post: '#6a6a66', y: 0.4 });
  for (const bx of [px - 9, px + 9]) bench(P, bx, pz, Math.PI);
}

// ------------------------------------------------------------------ Civic Auditorium (1954)
function civicAuditorium(P, ctx) {
  const land = ctx.land(ctx.lm('civicaud').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const X0 = x0 + 1.5;
  const X1 = x1 - 1.5;
  const Z0 = z0 + 4;
  const Z1 = z1 - 9;
  const brick = { mat: 'masonry', tint: '#c8b597', bay: 4.2, floor: 4.6 };
  block(P, brick, X0, Z0, X1, Z1, 0, 14, ROOF);
  // the big barrel vault over the arena
  vault(b, X0 - 0.4, Z0 - 0.4, X1 + 0.4, Z1 + 0.4, 14, 8.2, 'z', 12, C('#a9aca8'), C('#bfb29a'));
  box(b, X0 - 0.5, 13.6, Z0 - 0.5, X1 + 0.5, 14.1, Z1 + 0.5, C('#d7ccb6'));
  // glass entrance lobby on the Dodge St side with a canopy
  const LZ = z1 - 2;
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, X0 + 4, Z1, X1 - 4, LZ, 0, 8, ROOF);
  box(b, X0 + 3, 8, Z1, X1 - 3, 8.6, z1 - 1, C('#d7ccb6'), { bottom: true });
  sign(P, 'civicaud', (X0 + X1) / 2, 11.2, Z1 + 0.05, 16, 0, Math.PI);
  // the attached Music Hall on the north end
  block(P, brick, X0 + 6, z0 + 0.5, X1 - 6, Z0, 0, 11, ROOF);
  ctx.box(X0, Z0, X1, Z1, 22);
  ctx.box(X0 + 4, Z1, X1 - 4, LZ, 8);
  ctx.box(X0 + 6, z0 + 0.5, X1 - 6, Z0, 11);
  // big blank side walls take tags
  ctx.tag({ id: 'lm-civicaud-w', x: X0, y: 2.2, z: (Z0 + Z1) / 2, nx: -1, nz: 0, w: 3.2, h: 1.8 });
  ctx.tag({ id: 'lm-civicaud-e', x: X1, y: 2.2, z: (Z0 + Z1) / 2 + 6, nx: 1, nz: 0, w: 3.2, h: 1.8 });
}

// ------------------------------------------------------------------ Orpheum Theater + City National Bank (1910/1927)
function orpheum(P, ctx) {
  const land = ctx.land(ctx.lm('orpheum').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  // City National Bank Building: tripartite 16-story tower on the corner of 16th & Harney
  const tz1 = z0 + 15.5;
  const T = 52;
  block(P, { mat: 'masonry', tint: '#dccdb3', bay: 3.2, floor: 3.6 }, x0 + 3, z0, x1, tz1, 0, 7.2, ROOF);
  block(P, { mat: 'masonry', tint: '#c3a987', bay: 2.9, floor: 3.05, base: 7.2, uOff: 1 }, x0 + 3, z0, x1, tz1, 7.2, T - 3, ROOF);
  block(P, { mat: 'masonry', tint: '#d8c8aa', bay: 2.9, floor: 3 }, x0 + 3, z0, x1, tz1, T - 3, T, ROOF);
  box(b, x0 + 2.2, T - 1.4, z0 - 0.8, x1 + 0.8, T - 0.4, tz1 + 0.8, C('#e9dfcb'));
  box(b, x0 + 2.6, 7, z0 - 0.4, x1 + 0.4, 7.6, tz1 + 0.4, C('#e9dfcb'));
  roofTop(P, x0 + 3, z0, x1, tz1, T, ctx.rng, { hvac: 1 });
  ctx.beacon(P, x1 - 2, T + 4, z0 + 3, 0.5);
  // the Orpheum: Italianate front on 16th St, auditorium and fly tower behind
  const front = { mat: 'masonry', tint: '#e0cfae', bay: 3.4, floor: 4.5 };
  block(P, front, x1 - 9, tz1, x1, z1, 0, 18, ROOF);
  block(P, { mat: 'lowrise', row: 'stoneslit', tile: 9, tint: '#cdb99a' }, x0, tz1, x1 - 9, z1, 0, 21, ROOF);
  block(P, { mat: 'solid', color: C('#bca98b') }, x0, tz1 + 2, x0 + 7, z1 - 2, 21, 26, ROOF);
  box(b, x1 - 9.3, 17.4, tz1 - 0.1, x1 + 0.4, 18.2, z1 + 0.3, C('#efe5d2'));
  // the 1970s steel-letter marquee over the 16th St sidewalk
  const mz0 = tz1 + 4;
  const mz1 = z1 - 2.5;
  const mx = x1 + 3.2;
  box(b, x1, 4.6, mz0, mx, 6.9, mz1, C('#7d1616'), { bottom: true });
  sign(P, 'orpheum-marquee', mx + 0.02, 5.75, (mz0 + mz1) / 2, mz1 - mz0 - 0.3, 2.1, -Math.PI / 2);
  sign(P, 'orpheum-name', (x1 + mx) / 2, 5.75, mz0 - 0.02, mx - x1 - 0.2, 0.9, 0);
  sign(P, 'orpheum-name', (x1 + mx) / 2, 5.75, mz1 + 0.02, mx - x1 - 0.2, 0.9, Math.PI);
  for (let i = 0; i <= 12; i++) ctx.glow(mx + 0.1, 4.55, mz0 + ((mz1 - mz0) * i) / 12, '#ffd98a', 1.4);
  // vertical ORPHEUM blade sign above the marquee (double sided, reads up and down 16th St)
  const bz = (mz0 + mz1) / 2;
  box(b, x1, 8, bz - 0.15, x1 + 2.8, 20.5, bz + 0.15, C('#6d1414'));
  sign(P, 'orpheum-blade', x1 + 1.4, 14.25, bz - 0.16, 2.6, 12.5, 0);
  sign(P, 'orpheum-blade', x1 + 1.4, 14.25, bz + 0.16, 2.6, 12.5, Math.PI);
  ctx.glow(x1 + 1.4, 14, bz, '#ffcf8a', 9);
  ctx.box(x0 + 3, z0, x1, tz1, T);
  ctx.box(x0, tz1, x1, z1, 21);
}

// ------------------------------------------------------------------ Police Headquarters
function policeHQ(P, ctx) {
  const land = ctx.land(ctx.lm('policehq').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const Z0 = z0 + 10; // front plaza on Howard St (busted players are released here)
  surface(P, { x0, x1, z0, z1: Z0 }, 'plaza', 5);
  block(P, { mat: 'masonry', tint: '#a9a294', bay: 3.6, floor: 4.4 }, x0 + 2, Z0, x1 - 2, z1 - 1, 0, 4.4, ROOF);
  block(P, { mat: 'office', tint: '#c3bdb0', bay: 3.2, floor: 3.5, base: 4.4, uOff: 3 }, x0 + 2, Z0, x1 - 2, z1 - 1, 4.4, 22, ROOF);
  box(b, x0 + 1.6, 4.2, Z0 - 0.4, x1 - 1.6, 4.8, z1 - 0.6, C('#b7b0a2'));
  roofTop(P, x0 + 2, Z0, x1 - 2, z1 - 1, 22, ctx.rng, { hvac: 3 });
  // entrance canopy + sign
  const cx = (x0 + x1) / 2;
  box(b, cx - 5, 3.4, Z0 - 3, cx + 5, 3.8, Z0, C('#6e6a62'), { bottom: true });
  for (const sx of [-4.6, 4.6]) box(b, cx + sx - 0.2, 0, Z0 - 2.9, cx + sx + 0.2, 3.4, Z0 - 2.5, C('#6e6a62'));
  sign(P, 'police', cx, 5.8, Z0 - 0.45, 10, 0, 0);
  for (let i = 0; i < 2; i++) flagpole(P, cx + 9 + i * 3, Z0 - 4, 12);
  for (const tx of [x0 + 4, x1 - 4]) {
    box(b, tx - 1.5, 0, z0 + 3, tx + 1.5, 0.6, z0 + 6, C('#aaa497'));
    tree(P, tx, z0 + 4.5, { h: 6.5, kind: 'round', collide: false });
    ctx.box(tx - 1.5, z0 + 3, tx + 1.5, z0 + 6, 0.6, 'prop');
  }
  lamp(P, cx - 7, z0 + 2, { style: 'park' });
  lamp(P, cx + 7, z0 + 2, { style: 'park' });
  ctx.box(x0 + 2, Z0, x1 - 2, z1 - 1, 22);
}

// ------------------------------------------------------------------ Union Station / Western Heritage Museum (1931)
function unionStation(P, ctx) {
  const land = ctx.land(ctx.lm('unionstation').rect).sort((a, q) => q.x1 - q.x0 - (a.x1 - a.x0))[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const cream = '#e9dcbf';
  const X0 = x0 + 3;
  const X1 = x1 - 2;
  const Z0 = z0 + 7;
  const Z1 = z1 - 2;
  const cx = (X0 + X1) / 2;
  surface(P, { x0, x1, z0, z1: Z0 }, 'pavers', 4, { across: 3.5 });
  // main waiting-room block with tall window bays, lower wings at each end
  block(P, { mat: 'lowrise', row: 'deco', tile: 9.5, tint: cream }, X0 + 8, Z0, X1 - 8, Z1, 0, 18, ROOF);
  block(P, { mat: 'lowrise', row: 'deco', tile: 8, tint: '#e2d3b3' }, X0, Z0 + 2, X0 + 8, Z1, 0, 13, ROOF);
  block(P, { mat: 'lowrise', row: 'deco', tile: 8, tint: '#e2d3b3' }, X1 - 8, Z0 + 2, X1, Z1, 0, 13, ROOF);
  // stepped Art Deco parapets
  const cap = C('#f1e7d0');
  box(b, X0 + 7.6, 18, Z0 - 0.3, X1 - 7.6, 19.4, Z1 + 0.3, cap);
  box(b, cx - 7, 19.4, Z0 - 0.3, cx + 7, 21.2, Z0 + 3, cap);
  box(b, cx - 3.5, 21.2, Z0 - 0.3, cx + 3.5, 23, Z0 + 2, cap);
  box(b, X0 - 0.3, 13, Z0 + 1.7, X0 + 8.2, 14, Z1 + 0.3, cap);
  box(b, X1 - 8.2, 13, Z0 + 1.7, X1 + 0.3, 14, Z1 + 0.3, cap);
  // fluted piers between the bays of the main front (north, facing Leavenworth)
  for (let i = 0; i <= 6; i++) {
    const px = X0 + 8 + ((X1 - X0 - 16) * i) / 6;
    box(b, px - 0.5, 0, Z0 - 0.5, px + 0.5, 18.6, Z0, cap);
  }
  sign(P, 'unionstation', cx, 20.3, Z0 - 0.32, 11, 0, 0);
  sign(P, 'westernheritage', cx, 3.6, Z0 - 0.52, 12, 0, 0);
  sign(P, 'westernheritage', X1 + 0.05, 10.6, (Z0 + Z1) / 2, 10, 0, -Math.PI / 2);
  for (const lx of [cx - 12, cx - 4, cx + 4, cx + 12]) lamp(P, lx, z0 + 2.5, { style: 'park', h: 4.6 });
  flagpole(P, cx, z0 + 3.5, 13);
  ctx.box(X0 + 8, Z0 - 0.5, X1 - 8, Z1, 18);
  ctx.box(X0, Z0 + 2, X0 + 8, Z1, 13);
  ctx.box(X1 - 8, Z0 + 2, X1, Z1, 13);
}
