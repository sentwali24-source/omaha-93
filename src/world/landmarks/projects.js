import { C, shade, jitter, box, obox, wall, flat, hipRoof, lawn, surface, mound } from './kit.js';
import { tree, lamp, fence, postSign, payphone, clothesline, trashCan, bench } from './props.js';

// Public housing in North Omaha, summer 1993: Hilltop Homes and Pleasantview Homes (with the
// 6-story Pleasantview Towers) on North 30th, Spencer Homes (split by the North Freeway), and
// Logan Fontenelle — mid-demolition: some rows boarded up, others already cleared to rubble.
// Two-story brick rows (barracks style), walkways, clotheslines, parking lots; each project gets
// a hangout POI, a payphone, tag walls and parking spots.

const BRICKS = ['#9c5642', '#a3614a', '#8f4d3b', '#a86b52'];

/**
 * One two-story brick row building over rect r. opts: { tint, boarded, hip, h, tagId }.
 * The long faces carry doors and windows; the ends are blank brick (good tag walls).
 */
function row(P, ctx, r, opts = {}) {
  const b = P.get('solid');
  const tint = opts.tint || BRICKS[0];
  const H = opts.h || 7;
  const face = { mat: 'lowrise', row: opts.boarded ? 'boarded' : 'rowhouse', tile: 12, tint };
  const end = { mat: 'solid', color: shade(C(tint), 0.92) };
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  if (alongX) {
    wall(P, face, r.x0, r.z1, r.x1, r.z1, 0, H);
    wall(P, face, r.x1, r.z0, r.x0, r.z0, 0, H);
    wall(P, end, r.x1, r.z1, r.x1, r.z0, 0, H);
    wall(P, end, r.x0, r.z0, r.x0, r.z1, 0, H);
  } else {
    wall(P, face, r.x1, r.z1, r.x1, r.z0, 0, H);
    wall(P, face, r.x0, r.z0, r.x0, r.z1, 0, H);
    wall(P, end, r.x0, r.z1, r.x1, r.z1, 0, H);
    wall(P, end, r.x1, r.z0, r.x0, r.z0, 0, H);
  }
  // foundation band on the blank ends, then the roof
  const base = C('#7c7670');
  if (alongX) {
    box(b, r.x1, 0, r.z0, r.x1 + 0.05, 0.5, r.z1, base, { top: false });
    box(b, r.x0 - 0.05, 0, r.z0, r.x0, 0.5, r.z1, base, { top: false });
  } else {
    box(b, r.x0, 0, r.z1, r.x1, 0.5, r.z1 + 0.05, base, { top: false });
    box(b, r.x0, 0, r.z0 - 0.05, r.x1, 0.5, r.z0, base, { top: false });
  }
  if (opts.hip) hipRoof(b, r.x0, r.z0, r.x1, r.z1, H, 2.4, jitter(C('#4d4744'), ctx.rng, 0.1), 0.45);
  else {
    flat(b, r.x0, r.z0, r.x1, r.z1, H, C('#3e3c3a'));
    const cp = C('#c9c1b3');
    box(b, r.x0 - 0.15, H - 0.1, r.z0 - 0.15, r.x1 + 0.15, H + 0.35, r.z0 + 0.2, cp);
    box(b, r.x0 - 0.15, H - 0.1, r.z1 - 0.2, r.x1 + 0.15, H + 0.35, r.z1 + 0.15, cp);
    box(b, r.x0 - 0.15, H - 0.1, r.z0, r.x0 + 0.2, H + 0.35, r.z1, cp);
    box(b, r.x1 - 0.2, H - 0.1, r.z0, r.x1 + 0.15, H + 0.35, r.z1, cp);
  }
  // small concrete stoops along the door faces
  const stoop = C('#b9b3a8');
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  const units = Math.round(len / 6);
  for (let i = 0; i < units; i++) {
    const t = (i + 0.175) / units;
    if (alongX) {
      const x = r.x0 + len * t;
      box(b, x - 0.7, 0, r.z1, x + 0.7, 0.3, r.z1 + 1.1, stoop);
      box(b, x + len / units - 0.7 - len / units * 0.35 * 2, 0, r.z0 - 1.1, x + len / units - len / units * 0.35 * 2 + 0.7, 0.3, r.z0, stoop);
    } else {
      const z = r.z1 - len * t;
      box(b, r.x1, 0, z - 0.7, r.x1 + 1.1, 0.3, z + 0.7, stoop);
    }
  }
  ctx.box(r.x0, r.z0, r.x1, r.z1, H + 2.4);
  if (opts.tagId) {
    if (alongX) {
      ctx.tag({ id: `${opts.tagId}-e`, x: r.x1, y: 1.8, z: (r.z0 + r.z1) / 2, nx: 1, nz: 0 });
      ctx.tag({ id: `${opts.tagId}-w`, x: r.x0, y: 1.8, z: (r.z0 + r.z1) / 2, nx: -1, nz: 0 });
    } else {
      ctx.tag({ id: `${opts.tagId}-s`, x: (r.x0 + r.x1) / 2, y: 1.8, z: r.z1, nx: 0, nz: 1 });
      ctx.tag({ id: `${opts.tagId}-n`, x: (r.x0 + r.x1) / 2, y: 1.8, z: r.z0, nx: 0, nz: -1 });
    }
  }
}

/** Walkways + lawn + a few trees and clotheslines between rows. */
function grounds(P, ctx, land, paths, trees = 6) {
  lawn(P, land, '#77984a');
  for (const p of paths) surface(P, p, 'path', 3, { axis: p.x1 - p.x0 > p.z1 - p.z0 ? 'x' : 'z', across: Math.min(p.x1 - p.x0, p.z1 - p.z0) });
  void trees;
}

function lot(P, ctx, r, facing) {
  surface(P, r, 'parking', 10.8, { axis: r.x1 - r.x0 > r.z1 - r.z0 ? 'x' : 'z', across: Math.min(r.x1 - r.x0, r.z1 - r.z0) });
  if (r.x1 - r.x0 > r.z1 - r.z0) for (let x = r.x0 + 1.4; x < r.x1 - 1; x += 2.7) ctx.park(x, (r.z0 + r.z1) / 2, facing);
  else for (let z = r.z0 + 1.4; z < r.z1 - 1; z += 2.7) ctx.park((r.x0 + r.x1) / 2, z, facing);
}

function hangout(ctx, id, name, x, z, heading) {
  ctx.poi({ id: `lm-hangout-${id}`, type: 'hangout', name, x, z, heading });
}

// ------------------------------------------------------------------ Hilltop Homes (1952)
function hilltop(ctx) {
  const P = ctx.cluster('hilltop');
  const land = ctx.land(ctx.lm('hilltop').rect)[0];
  const { x0, x1, z0, z1 } = land;
  const rng = ctx.rng;
  grounds(P, ctx, land, [
    { x0: x0 + 1, x1: x1 - 16, z0: z0 + 12.2, z1: z0 + 14.2 },
    { x0: x0 + 1, x1: x1 - 16, z0: z0 + 26.2, z1: z0 + 28.2 },
    { x0: x0 + 1, x1: x1 - 16, z0: z0 + 40.2, z1: z0 + 42.2 },
    { x0: x1 - 18, x1: x1 - 16, z0, z1 },
  ]);
  for (let i = 0; i < 4; i++) {
    const zz = z0 + 2 + i * 14;
    row(P, ctx, { x0: x0 + 4, x1: x1 - 22, z0: zz, z1: zz + 8.4 }, { tint: BRICKS[i % 4], tagId: i === 1 || i === 3 ? `lm-hilltop-${i}` : null });
    if (i < 3) clothesline(P, x0 + 10 + rng() * 10, zz + 11, x0 + 22 + rng() * 10, zz + 11.2, rng);
  }
  lot(P, ctx, { x0: x1 - 14.5, x1: x1 - 1, z0: z0 + 2, z1: z1 - 2 }, Math.PI / 2);
  for (const z of [z0 + 18, z0 + 46]) lamp(P, x1 - 17, z, { style: 'cobra', rot: -Math.PI / 2, h: 7 });
  for (const [tx, tz] of [[x0 + 2, z0 + 12], [x0 + 30, z1 - 2], [x1 - 20, z0 + 34]]) tree(P, tx, tz, { h: 7 + rng() * 3, kind: rng() < 0.5 ? 'small' : 'round' });
  postSign(P, 'hilltop', x0 + 12, z1 - 1.5, 4.2, Math.PI, { post: '#555', y: 0.3 });
  const pp = payphone(P, x1 - 16.5, z1 - 3, Math.PI / 2);
  ctx.poi({ id: 'lm-payphone-hilltop', type: 'payphone', name: 'Payphone', ...pp });
  hangout(ctx, 'hilltop', 'Hilltop courtyard', x0 + 26, z0 + 27.2, 0);
  bench(P, x0 + 24, z0 + 25.4, 0);
  trashCan(P, x0 + 28, z0 + 25.4);
  P.flush();
}

// ------------------------------------------------------------------ Pleasantview Homes (1953) + Towers
function pleasantview(ctx) {
  const P = ctx.cluster('pleasantview');
  const parts = ctx.land(ctx.lm('pleasantview').rect);
  const west = parts.find((p) => p.x1 < -40);
  const eastParts = parts.filter((p) => p.x0 > -40);
  const rng = ctx.rng;
  const { x0, x1, z0, z1 } = west;
  grounds(P, ctx, west, [
    { x0: x0 + 1, x1: x1 - 1, z0: z0 + 10, z1: z0 + 12 },
    { x0: x0 + 22.5, x1: x0 + 24.5, z0: z0 + 12, z1: z1 - 10 },
    { x0: x0 + 1, x1: x1 - 20, z0: z1 - 10, z1: z1 - 8 },
  ]);
  row(P, ctx, { x0: x0 + 2, x1: x0 + 38, z0: z0 + 1.2, z1: z0 + 9.2 }, { tint: BRICKS[1], tagId: 'lm-pv-1' });
  row(P, ctx, { x0: x0 + 2, x1: x0 + 21, z0: z0 + 17, z1: z0 + 25 }, { tint: BRICKS[0] });
  row(P, ctx, { x0: x0 + 27, x1: x0 + 35, z0: z0 + 15, z1: z0 + 42 }, { tint: BRICKS[2], tagId: 'lm-pv-3' });
  row(P, ctx, { x0: x0 + 2, x1: x0 + 21, z0: z0 + 33, z1: z0 + 41 }, { tint: BRICKS[3] });
  row(P, ctx, { x0: x0 + 2, x1: x0 + 36, z0: z1 - 7.4, z1: z1 - 0.8 }, { tint: BRICKS[1], h: 3.8 });
  // Pleasantview Towers: 6 stories near 30th St
  const T = { x0: x1 - 14, x1: x1 - 2, z0: z0 + 13, z1: z0 + 37 };
  const b = P.get('solid');
  wall(P, { mat: 'masonry', tint: '#9a5a45', bay: 3.0, floor: 3.6 }, T.x0, T.z1, T.x1, T.z1, 0, 22);
  wall(P, { mat: 'masonry', tint: '#9a5a45', bay: 3.0, floor: 3.6 }, T.x1, T.z1, T.x1, T.z0, 0, 22);
  wall(P, { mat: 'masonry', tint: '#9a5a45', bay: 3.0, floor: 3.6 }, T.x1, T.z0, T.x0, T.z0, 0, 22);
  wall(P, { mat: 'masonry', tint: '#9a5a45', bay: 3.0, floor: 3.6 }, T.x0, T.z0, T.x0, T.z1, 0, 22);
  flat(b, T.x0, T.z0, T.x1, T.z1, 22, C('#3e3c3a'));
  box(b, T.x0 - 0.2, 21.6, T.z0 - 0.2, T.x1 + 0.2, 22.5, T.z1 + 0.2, C('#cfc6b6'));
  box(b, T.x0 + 3, 22, T.z0 + 8, T.x1 - 3, 25, T.z0 + 14, C('#8a5040'));
  box(b, T.x0 - 0.1, 2.8, (T.z0 + T.z1) / 2 - 2.5, T.x0 + 0.1, 3.1, (T.z0 + T.z1) / 2 + 2.5, C('#6a6660'));
  box(b, T.x0 - 2.6, 2.8, (T.z0 + T.z1) / 2 - 2, T.x0, 3.1, (T.z0 + T.z1) / 2 + 2, C('#8e8a82'), { bottom: true });
  ctx.box(T.x0, T.z0, T.x1, T.z1, 25);
  ctx.tag({ id: 'lm-pv-tower-s', x: (T.x0 + T.x1) / 2, y: 1.8, z: T.z1, nx: 0, nz: 1 });
  lot(P, ctx, { x0: x1 - 19, x1: x1 - 1, z0: z1 - 8, z1: z1 - 2.5 }, 0);
  lamp(P, x1 - 16, T.z1 + 2, { style: 'cobra', rot: Math.PI, h: 7 });
  for (let i = 0; i < 3; i++) clothesline(P, x0 + 4 + i * 6, z0 + 28.5, x0 + 8 + i * 6, z0 + 28.6, rng);
  postSign(P, 'pleasantview', x1 - 1.2, z0 + 6, 4.4, -Math.PI / 2, { post: '#555', y: 0.3 });
  hangout(ctx, 'pleasantview', 'Pleasantview courtyard', x0 + 24, z0 + 29, Math.PI / 2);
  const pp = payphone(P, T.x0 - 2, T.z0 - 1.2, Math.PI / 2);
  ctx.poi({ id: 'lm-payphone-pleasantview', type: 'payphone', name: 'Payphone', ...pp });
  bench(P, T.x0 - 3.5, T.z1 - 4, -Math.PI / 2);
  // east of 30th: rows either side of the North Freeway pillars
  for (const p of eastParts) {
    for (const q of freewaySplit(p)) {
      if (q.x1 - q.x0 < 9) continue;
      lawn(P, q, '#77984a');
      const w = Math.min(8.4, q.x1 - q.x0 - 3);
      row(P, ctx, { x0: q.x0 + 1.5, x1: q.x0 + 1.5 + w, z0: q.z0 + 4, z1: q.z0 + 26 }, { tint: BRICKS[2], tagId: `lm-pv-e${Math.round(q.x0)}` });
      row(P, ctx, { x0: q.x0 + 1.5, x1: q.x0 + 1.5 + w, z0: q.z0 + 31, z1: q.z1 - 4 }, { tint: BRICKS[3] });
      tree(P, q.x1 - 1.5, q.z0 + 28.5, { h: 7, kind: 'small' });
    }
  }
  P.flush();
}

/** Split a land rect around the North Freeway corridor (keeps pillars clear). */
function freewaySplit(p) {
  const c0 = -10;
  const c1 = 16;
  const out = [];
  if (p.x0 < c0) out.push({ ...p, x1: Math.min(p.x1, c0) });
  if (p.x1 > c1) out.push({ ...p, x0: Math.max(p.x0, c1) });
  if (p.x0 >= c1 || p.x1 <= c0) return [p];
  return out;
}

// ------------------------------------------------------------------ Spencer Homes (1952)
function spencer(ctx) {
  const P = ctx.cluster('spencer');
  const parts = ctx.land(ctx.lm('spencer').rect);
  const west = parts.find((p) => p.x1 < -40);
  const eastParts = parts.filter((p) => p.x0 > -40);
  const rng = ctx.rng;
  const { x0, x1, z0, z1 } = west;
  grounds(P, ctx, west, [
    { x0: x0 + 1, x1: x1 - 1, z0: z0 + 15.5, z1: z0 + 17.5 },
    { x0: x0 + 1, x1: x1 - 1, z0: z0 + 31.5, z1: z0 + 33.5 },
    { x0: x0 + 1, x1: x1 - 1, z0: z0 + 47.5, z1: z0 + 49.5 },
  ]);
  for (let i = 0; i < 4; i++) {
    const zz = z0 + 4 + i * 16;
    const xa = i % 2 ? x0 + 3 : x0 + 11;
    row(P, ctx, { x0: xa, x1: xa + 40, z0: zz, z1: zz + 8.4 }, { tint: BRICKS[(i + 1) % 4], tagId: i % 2 ? `lm-spencer-${i}` : null });
    if (i < 3) clothesline(P, xa + 6, zz + 12, xa + 18, zz + 12.1, rng);
  }
  const L = { x0: x1 - 9, x1: x1 - 1, z0: z0 + 2, z1: z1 - 2 };
  lot(P, ctx, L, -Math.PI / 2);
  lamp(P, L.x0 - 1, (L.z0 + L.z1) / 2, { style: 'cobra', rot: -Math.PI / 2, h: 7 });
  for (const [tx, tz] of [[x0 + 3, z0 + 2], [x0 + 5, z1 - 3], [x0 + 50, z0 + 30]]) tree(P, tx, tz, { h: 8, kind: 'round' });
  postSign(P, 'spencer', x0 + 20, z0 + 1.2, 4.2, 0, { post: '#555', y: 0.3 });
  hangout(ctx, 'spencer', 'Spencer Homes', x0 + 30, z0 + 32.5, 0);
  const pp = payphone(P, x0 + 2.5, z0 + 33, -Math.PI / 2);
  ctx.poi({ id: 'lm-payphone-spencer', type: 'payphone', name: 'Payphone', ...pp });
  bench(P, x0 + 34, z0 + 30.6, 0);
  // the east half, split by the North Freeway in 1981
  for (const p of eastParts) {
    for (const q of freewaySplit(p)) {
      if (q.x1 - q.x0 < 9) continue;
      lawn(P, q, '#77984a');
      const w = Math.min(8.4, q.x1 - q.x0 - 3);
      row(P, ctx, { x0: q.x0 + 1.5, x1: q.x0 + 1.5 + w, z0: q.z0 + 4, z1: q.z0 + 28 }, { tint: BRICKS[0], tagId: `lm-spencer-e${Math.round(q.x0)}` });
      row(P, ctx, { x0: q.x0 + 1.5, x1: q.x0 + 1.5 + w, z0: q.z0 + 34, z1: q.z1 - 4 }, { tint: BRICKS[2] });
    }
  }
  P.flush();
}

// ------------------------------------------------------------------ Logan Fontenelle Homes (1938), mid-demolition
function loganFontenelle(ctx) {
  const P = ctx.cluster('logan');
  const parts = ctx.land(ctx.lm('loganfontenelle').rect);
  const rng = ctx.rng;
  // per part: four rows; state = 'up' | 'boarded' | 'cleared'
  const plans = [
    ['up', 'boarded', 'cleared', 'up'],
    ['boarded', 'cleared', 'cleared', 'boarded'],
  ];
  parts.sort((a, b) => a.x0 - b.x0);
  parts.forEach((p, k) => {
    lawn(P, p, '#809a4c');
    surface(P, { x0: p.x0 + 1, x1: p.x1 - 1, z0: p.z0 + 26.5, z1: p.z0 + 28.5 }, 'path', 3, { across: 2 });
    const plan = plans[k % plans.length];
    for (let i = 0; i < 4; i++) {
      const zz = p.z0 + 2 + i * 13.5 + (i >= 2 ? 1.5 : 0);
      const r = { x0: p.x0 + 3, x1: p.x1 - 3, z0: zz, z1: zz + 8.4 };
      const st = plan[i];
      if (st === 'cleared') {
        cleared(P, ctx, { x0: r.x0 - 1.5, x1: r.x1 + 1.5, z0: r.z0 - 1.5, z1: r.z1 + 1.5 }, rng, i === 2 && k === 1);
      } else {
        row(P, ctx, r, { tint: BRICKS[(i + k) % 4], boarded: st === 'boarded', hip: true, tagId: `lm-logan-${k}-${i}` });
      }
    }
    for (const [tx, tz] of [[p.x0 + 1.8, p.z0 + 12], [p.x1 - 1.8, p.z1 - 12]]) tree(P, tx, tz, { h: 9, kind: 'broad' });
  });
  const main = parts[0];
  postSign(P, 'logan', main.x0 + 10, main.z1 - 1.1, 4.4, Math.PI, { post: '#555', y: 0.3 });
  hangout(ctx, 'logan', 'Logan Fontenelle', main.x0 + 20, main.z0 + 27.5, 0);
  const pp = payphone(P, main.x0 + 2, main.z0 + 28.5, -Math.PI / 2);
  ctx.poi({ id: 'lm-payphone-logan', type: 'payphone', name: 'Payphone', ...pp });
  lamp(P, main.x1 - 3, main.z0 + 27.5, { style: 'park' });
  for (let x = main.x0 + 4; x < main.x1 - 4; x += 2.7) ctx.park(x, main.z1 - 0.5 - 2.75 + 0.0, Math.PI);
  P.flush();
}

/** A cleared lot: rubble ground, debris piles, a demolition fence and maybe a parked dozer. */
function cleared(P, ctx, r, rng, dozer) {
  surface(P, r, 'rubble', 7, { across: 7 });
  const b = P.get('solid');
  for (let i = 0; i < 3; i++) {
    const cx = r.x0 + 5 + rng() * (r.x1 - r.x0 - 10);
    const cz = r.z0 + 3 + rng() * (r.z1 - r.z0 - 6);
    const w = 3 + rng() * 4;
    const d = 2 + rng() * 2;
    mound(P, { x0: cx - w, x1: cx + w, z0: cz - d, z1: cz + d }, { x0: cx - w * 0.3, x1: cx + w * 0.3, z0: cz - d * 0.3, z1: cz + d * 0.3 }, 0.8 + rng() * 1.1, '#7d5e4a', 'solid');
    for (let j = 0; j < 5; j++) {
      const sx = cx + (rng() - 0.5) * w * 1.6;
      const sz = cz + (rng() - 0.5) * d * 1.6;
      obox(b, sx, sz, 0.6 + rng() * 1.4, 0.4 + rng() * 0.8, 0, 0.2 + rng() * 0.4, rng() * 3, jitter(C(rng() < 0.5 ? '#9a5a45' : '#a9a397'), rng, 0.1));
    }
    ctx.box(cx - w * 0.7, cz - d * 0.7, cx + w * 0.7, cz + d * 0.7, 1.0, 'prop');
  }
  if (dozer) {
    const dx = r.x1 - 6;
    const dz = (r.z0 + r.z1) / 2;
    const y = C('#e0a82a');
    box(b, dx - 1.3, 0, dz - 2.2, dx + 1.3, 0.8, dz + 2.2, C('#222'));
    box(b, dx - 1.1, 0.8, dz - 1.8, dx + 1.1, 2.1, dz + 1.6, y);
    box(b, dx - 0.9, 2.1, dz, dx + 0.9, 3.3, dz + 1.5, y);
    box(b, dx - 0.85, 2.4, dz - 0.02, dx + 0.85, 3.2, dz + 0.02, C('#2a3036'));
    box(b, dx - 1.8, 0, dz - 3.1, dx + 1.8, 1.4, dz - 2.7, C('#c9941f'));
    ctx.box(dx - 1.8, dz - 3.1, dx + 1.8, dz + 2.2, 2.4);
  }
  // chain-link demolition fence along the path side, with a KEEP OUT sign
  fence(P, r.x0, r.z1, r.x1, r.z1, 1.8, { gaps: [[0.45, 0.55]] });
  postSign(P, 'keepout', r.x0 + 4, r.z1 + 0.5, 2.2, Math.PI, { post: '#6b6b6b', y: 0.6 });
}

export function buildProjects(ctx) {
  hilltop(ctx);
  pleasantview(ctx);
  spencer(ctx);
  loganFontenelle(ctx);
}
