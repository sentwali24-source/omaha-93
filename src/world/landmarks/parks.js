import * as THREE from 'three';
import { C, box, obox, cylinder, hipRoof, pyramid, lawn, surface, strip, bermX, rotPt } from './kit.js';
import { tree, treesIn, bench, picnicTable, trashCan, lamp, fence, playground, hoop, postSign, payphone } from './props.js';

// North Omaha parks: Kountze Park (the Parkside hangout — lawns, big old trees, a picnic
// pavilion, playground, a full basketball court under lights), Bemis Park (a narrow wooded
// ravine) and Miller Park (lake, the 1908 pavilion with its wrap-around porch, a golf fairway).
//
// Gangs.js puts park hangout spots at each park's centre and 8 m in from the west / east edges
// (on the centre line), and the Parkside Crips' hood sits in Kountze Park's south-west corner:
// those points are kept free of colliders.

export function buildParks(ctx) {
  kountze(ctx);
  bemis(ctx);
  miller(ctx);
}

/** Points Gangs.js uses as park hangout spots (must stay walkable). */
function gangSpots(r) {
  const cz = (r.z0 + r.z1) / 2;
  return [
    [(r.x0 + r.x1) / 2, cz],
    [r.x0 + 8, cz],
    [r.x1 - 8, cz],
  ];
}

const near = (spots, x, z, d) => spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < d);

/** Charcoal grill on a post (summer cookouts). */
function grill(P, x, z) {
  const b = P.get('solid');
  cylinder(b, x, z, 0.06, 0.06, 0, 0.8, 4, C('#3a3c3d'), { top: false });
  box(b, x - 0.4, 0.8, z - 0.28, x + 0.4, 1.05, z + 0.28, C('#26282a'));
  P.ctx.col.addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.05, 0, 'prop');
}

/** Drinking fountain (concrete pedestal). */
function drinkingFountain(P, x, z) {
  const b = P.get('solid');
  cylinder(b, x, z, 0.28, 0.22, 0, 0.9, 6, C('#a9a59c'), { cTop: C('#8e9496') });
  P.ctx.col.addBox(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0.9, 0, 'prop');
}

/** Tall floodlight pole with a two-lamp head (court lighting); the lamps face heading `rot`. */
function floodlight(P, x, z, rot, h = 9) {
  const ctx = P.ctx;
  const b = P.get('solid');
  cylinder(b, x, z, 0.16, 0.1, 0, h, 5, C('#7d8284'), { top: false });
  const L = P.get('lights');
  for (const s of [-0.55, 0.55]) {
    const [hx, hz] = rotPt(x, z, s, -0.35, rot);
    obox(b, hx, hz, 0.8, 0.5, h - 0.2, h + 0.45, rot, C('#5d6264'));
    const [fx, fz] = rotPt(x, z, s, -0.62, rot);
    obox(L, fx, fz, 0.66, 0.05, h - 0.1, h + 0.35, rot, C('#fff4d6'));
    ctx.glow(fx, h + 0.1, fz, '#fff1cf', 7);
  }
  ctx.col.addBox(x - 0.18, z - 0.18, x + 0.18, z + 0.18, h, 0, 'prop');
}

// ------------------------------------------------------------------ Kountze Park
// North = Pratt St (z0), south = Pinkney St (z1), west = 20th St (x0), east = 18th St (x1).
// The Parkside hood is the south-west corner (20th & Pinkney).
function kountze(ctx) {
  const P = ctx.cluster('kountze');
  const r = ctx.lm('kountzepark').rect;
  const land = ctx.land(r)[0];
  const { x0, x1, z0, z1 } = land;
  const b = P.get('solid');
  const rng = ctx.rng;
  const spots = gangSpots(r);
  const cz = (r.z0 + r.z1) / 2;
  const hood = { x: r.x0 + 4, z: r.z1 - 3 };
  for (const s of ctx.game.city?.pois || []) {
    if (s.type === 'hood' && s.x > r.x0 - 4 && s.x < r.x1 + 4 && s.z > r.z0 - 4 && s.z < r.z1 + 4) Object.assign(hood, { x: s.x, z: s.z });
  }
  spots.push([hood.x, hood.z], [hood.x + 4, hood.z - 3], [hood.x + 2, hood.z - 7]);
  const avoid = []; // rects that trees keep clear of
  const keep = (q) => (avoid.push(q), q);

  lawn(P, land, '#6a9a3f');
  // worn grass where everybody stands around: the hood corner and the middle of the park
  lawn(P, { x0: x0 + 0.5, x1: x0 + 13, z0: z1 - 12, z1: z1 - 0.5 }, '#8a9a52', 0.055);
  lawn(P, { x0: spots[0][0] - 5, x1: spots[0][0] + 5, z0: cz - 4, z1: cz + 3 }, '#869a50', 0.055);

  // --- paths: Pinkney St entrance → middle, a cross walk 20th ↔ 18th, a diagonal from the hood corner
  const px = (x0 + x1) / 2 - 1;
  const pathZ = cz + 3.5;
  surface(P, { x0: px - 1.2, x1: px + 1.2, z0: pathZ, z1 }, 'path', 3, { axis: 'z', across: 2.4 });
  surface(P, { x0, x1, z0: pathZ, z1: pathZ + 2.4 }, 'path', 3, { across: 2.4 });
  strip(P, 'path', x0 + 1, z1 - 1, px - 1.2, pathZ + 2.4, 2.2, 3, { y: 0.075 });

  // --- full basketball court (28 × 15) along Pratt St, under lights
  const court = keep({ x0: x1 - 29.5, x1: x1 - 1.5, z0: z0 + 1.5, z1: z0 + 16.5 });
  const ccz = (court.z0 + court.z1) / 2;
  surface(P, { x0: court.x0 - 1.5, x1: court.x1 + 1, z0: court.z0 - 0.5, z1: court.z1 + 0.8 }, 'plaza', 4, { across: 4 });
  strip(P, 'court', court.x0, ccz, court.x1, ccz, court.z1 - court.z0, 28, { y: 0.09 });
  hoop(P, court.x0 + 1.2, ccz, -Math.PI / 2);
  hoop(P, court.x1 - 1.2, ccz, Math.PI / 2);
  fence(P, court.x0 - 1.2, court.z1 - 1, court.x0 - 1.2, court.z0 + 1, 3.2);
  fence(P, court.x1 + 0.8, court.z1 - 1, court.x1 + 0.8, court.z0 + 1, 3.2);
  floodlight(P, (court.x0 + court.x1) / 2 - 7, court.z1 + 1.2, 0, 9);
  floodlight(P, (court.x0 + court.x1) / 2 + 7, court.z1 + 1.2, 0, 9);
  // two-step bleacher on the park side of the court
  const bl = { x0: court.x0 + 10, x1: court.x1 - 5 };
  surface(P, { x0: bl.x0 - 1, x1: bl.x1 + 1, z0: court.z1 + 0.8, z1: court.z1 + 3.3 }, 'plaza', 4, { across: 2.5 });
  for (let i = 0; i < 2; i++) box(b, bl.x0, 0.25 + i * 0.4, court.z1 + 2.2 - i * 0.7, bl.x1, 0.45 + i * 0.4, court.z1 + 2.8 - i * 0.7, C('#8c9194'));
  for (const x of [bl.x0 + 0.5, (bl.x0 + bl.x1) / 2, bl.x1 - 0.5]) box(b, x - 0.1, 0, court.z1 + 1.5, x + 0.1, 0.65, court.z1 + 2.8, C('#5d6264'));
  ctx.box(bl.x0, court.z1 + 1.5, bl.x1, court.z1 + 2.8, 0.85, 'prop');

  // --- brick park house / restrooms in the north-west corner (tag walls)
  const rh = keep({ x0: x0 + 1.5, x1: x0 + 8.5, z0: z0 + 2, z1: z0 + 9 });
  box(b, rh.x0, 0, rh.z0, rh.x1, 3.1, rh.z1, C('#8f5140'));
  box(b, rh.x0 - 0.5, 3.1, rh.z0 - 0.5, rh.x1 + 0.5, 3.35, rh.z1 + 0.5, C('#5f5d58'), { bottom: true });
  box(b, rh.x0 + 1.4, 0, rh.z1, rh.x0 + 2.4, 2.1, rh.z1 + 0.04, C('#4d5a52'));
  box(b, rh.x1 - 2.4, 0, rh.z1, rh.x1 - 1.4, 2.1, rh.z1 + 0.04, C('#4d5a52'));
  box(b, rh.x0 + 0.8, 2.3, rh.z0 - 0.04, rh.x1 - 0.8, 2.7, rh.z0, C('#3a3f44'));
  ctx.box(rh.x0, rh.z0, rh.x1, rh.z1, 3.35);
  ctx.tag({ id: 'lm-kountze-house-e', x: rh.x1, y: 1.6, z: (rh.z0 + rh.z1) / 2, nx: 1, nz: 0, w: 2.8, h: 1.4 });
  ctx.tag({ id: 'lm-kountze-house-w', x: rh.x0, y: 1.5, z: (rh.z0 + rh.z1) / 2, nx: -1, nz: 0, w: 3.2, h: 1.3 });
  lamp(P, rh.x1 + 1.2, rh.z1 + 1.2, { style: 'park' });

  // --- picnic pavilion (open shelter, hip roof on posts) east of the entrance path
  const pv = keep({ x0: px + 5, x1: px + 15, z0: z1 - 15, z1: z1 - 7 });
  surface(P, { x0: pv.x0 - 0.8, x1: pv.x1 + 0.8, z0: pv.z0 - 0.8, z1: pv.z1 + 0.8 }, 'plaza', 3, { across: 4 });
  box(b, pv.x0 - 0.6, 0, pv.z0 - 0.6, pv.x1 + 0.6, 0.2, pv.z1 + 0.6, C('#b8b2a6'));
  for (const x of [pv.x0, (pv.x0 + pv.x1) / 2, pv.x1]) {
    for (const z of [pv.z0, pv.z1]) {
      box(b, x - 0.16, 0.2, z - 0.16, x + 0.16, 3.0, z + 0.16, C('#e9e4d8'));
      ctx.box(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 3, 'prop');
    }
  }
  box(b, pv.x0 - 0.5, 3.0, pv.z0 - 0.5, pv.x1 + 0.5, 3.3, pv.z1 + 0.5, C('#6b4e36'), { bottom: true });
  hipRoof(b, pv.x0 - 0.5, pv.z0 - 0.5, pv.x1 + 0.5, pv.z1 + 0.5, 3.3, 1.8, C('#3f5b46'), 0.4);
  picnicTable(P, pv.x0 + 2.6, (pv.z0 + pv.z1) / 2, Math.PI / 2);
  picnicTable(P, pv.x1 - 2.6, (pv.z0 + pv.z1) / 2, Math.PI / 2);
  grill(P, pv.x1 + 2.2, pv.z0 - 1.5);
  trashCan(P, pv.x0 - 1.3, pv.z0 - 1);
  ctx.glow((pv.x0 + pv.x1) / 2, 2.9, (pv.z0 + pv.z1) / 2, '#ffe2a8', 3);

  // --- playground north of the cross walk, west of the middle
  const pg = { x: x0 + 13.5, z: pathZ - 9.5 };
  keep({ x0: pg.x - 9, x1: pg.x + 7, z0: pg.z - 2.5, z1: pg.z + 2.5 });
  playground(P, pg.x, pg.z, 0);
  bench(P, pg.x - 5, pathZ + 4.1, 0);
  bench(P, pg.x + 1, pathZ + 4.1, 0);

  // --- benches, a fountain, lamps and trash cans along the paths
  bench(P, px + 3.2, z1 - 20, Math.PI / 2);
  bench(P, court.x0 + 6, court.z1 + 2.6, 0);
  bench(P, x0 + 2.8, z0 + 20, -Math.PI / 2);
  drinkingFountain(P, px + 2.2, pathZ + 3.6);
  trashCan(P, px - 2.2, pathZ + 3.6);
  trashCan(P, x0 + 13.5, z1 - 1.4);
  for (const [lx, lz] of [[px + 1.8, z1 - 4], [px + 4.2, pathZ + 3.4], [x0 + 2, pathZ + 3.2], [x1 - 2, pathZ + 3.2], [x0 + 10, z1 - 6]]) lamp(P, lx, lz, { style: 'park' });

  // --- big old shade trees along the edges and on the lawns (never on a hangout spot)
  const cand = [
    [x0 + 2.5, z0 + 15, 12, 'broad'], [x0 + 2.5, pathZ + 9, 11, 'round'], [x0 + 18, z1 - 2.5, 13, 'broad'],
    [px + 17, z1 - 2.5, 12, 'broad'], [x1 - 2.5, pathZ + 5, 13, 'cottonwood'], [x1 - 2.5, cz - 6, 11, 'round'],
    [px - 7, pathZ + 11, 10, 'round'], [px + 9, cz - 3, 12, 'broad'], [x0 + 12, z0 + 3, 12, 'broad'],
    [px - 4, cz - 5, 9, 'small'], [x1 - 9, pathZ + 5.5, 10, 'small'], [px + 16, z1 - 20, 9, 'small'],
  ];
  for (const [tx, tz, th, kind] of cand) {
    if (near(spots, tx, tz, 4)) continue;
    if (avoid.some((q) => tx > q.x0 - 2.5 && tx < q.x1 + 2.5 && tz > q.z0 - 2.5 && tz < q.z1 + 2.5)) continue;
    tree(P, tx, tz, { h: th + rng() * 2, kind });
  }
  // park sign at the Pinkney St entrance, payphone at the 18th St corner
  postSign(P, 'kountze', px + 5.5, z1 - 1.2, 4.6, Math.PI, { twoSided: true, y: 0.5 });
  const pp = payphone(P, x1 - 1.4, z1 - 1.6, -Math.PI / 2);
  ctx.poi({ id: 'lm-payphone-kountze', type: 'payphone', name: 'Payphone', ...pp });
  ctx.poi({ id: 'lm-hangout-kountze-court', type: 'hangout', name: 'Kountze Park court', x: court.x0 + 14, z: court.z1 + 4, heading: Math.PI });
  ctx.poi({ id: 'lm-hangout-kountze-pavilion', type: 'hangout', name: 'Kountze Park pavilion', x: (pv.x0 + pv.x1) / 2, z: pv.z0 - 2.5, heading: Math.PI });
  P.flush();
}

// ------------------------------------------------------------------ Bemis Park (wooded ravine)
function bemis(ctx) {
  const P = ctx.cluster('bemis');
  const r = ctx.lm('bemispark').rect;
  const land = ctx.land(r)[0];
  const { x0, x1, z0, z1 } = land;
  const rng = ctx.rng;
  const cz = (r.z0 + r.z1) / 2;
  const spots = gangSpots(r);
  lawn(P, land, '#5f8a3a');
  // ravine floor along the centre line (where the park hangout spots are), wooded slopes N and S
  const f0 = cz - 5.5;
  const f1 = cz + 5.5;
  const nb = { za: z0, zb: z0 + (f0 - z0) * 0.45, zc: f0 };
  const sb = { za: f1, zb: f1 + (z1 - f1) * 0.55, zc: z1 };
  bermX(P, x0, x1, nb.za, nb.zb, nb.zc, 4.2, '#557f35');
  bermX(P, x0, x1, sb.za, sb.zb, sb.zc, 3.6, '#5a8438');
  // the slopes are steep brush: blocked (walk the ravine floor in from 33rd or 36th St)
  ctx.box(x0, nb.za + 1.2, x1, nb.zc - 1.4, 3.6, 'landmark');
  ctx.box(x0, sb.za + 1.4, x1, sb.zc - 1.2, 3.2, 'landmark');
  // creek + dirt footpath on the floor
  const creekZ = f1 - 1.6;
  const lk = P.get('lake');
  lk.quad(x0 + 1, 0.1, creekZ + 0.8, x1 - 1, 0.1, creekZ + 0.8, x1 - 1, 0.1, creekZ - 0.8, x0 + 1, 0.1, creekZ - 0.8, C('#4f6a60'), x0 / 16, 0, x1 / 16, 0.1);
  surface(P, { x0, x1, z0: f0 + 1.2, z1: f0 + 3.4 }, 'dirt', 6, { across: 2.2 });
  // dense trees on the slopes (the canopy closes over the ravine)
  const n = ctx.detail === 0 ? 11 : 17;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.3 + rng() * 0.4) / n;
    const x = x0 + 2 + t * (x1 - x0 - 4);
    tree(P, x, nb.zb + (rng() - 0.5) * 3, { h: 12 + rng() * 5, kind: rng() < 0.3 ? 'cottonwood' : 'broad', collide: false });
    tree(P, x + 2, sb.zb + (rng() - 0.5) * 3, { h: 11 + rng() * 5, kind: rng() < 0.3 ? 'round' : 'broad', collide: false });
  }
  for (let i = 0; i < 5; i++) {
    const x = x0 + 8 + i * ((x1 - x0 - 16) / 4);
    if (!near(spots, x, f0 + 0.8, 3)) tree(P, x, f0 + 0.6, { h: 9 + rng() * 3, kind: 'small' });
  }
  bench(P, (x0 + x1) / 2 - 12, f0 + 4.4, Math.PI);
  bench(P, (x0 + x1) / 2 + 14, f0 + 4.4, Math.PI);
  lamp(P, x0 + 3, f0 + 4, { style: 'park' });
  lamp(P, x1 - 3, f0 + 4, { style: 'park' });
  lamp(P, (x0 + x1) / 2 - 20, f1 - 3.4, { style: 'park' });
  // footbridge over the creek
  const bx = (x0 + x1) / 2 + 3;
  const b = P.get('solid');
  box(b, bx - 1.2, 0.35, creekZ - 1.4, bx + 1.2, 0.5, creekZ + 1.4, C('#7a5a3a'));
  for (const s of [-1.1, 1.1]) box(b, bx + s - 0.05, 0.5, creekZ - 1.4, bx + s + 0.05, 1.3, creekZ + 1.4, C('#5b4330'));
  postSign(P, 'bemispark', x1 - 1.5, cz - 3, 3.8, -Math.PI / 2, { twoSided: true, y: 0.5 });
  postSign(P, 'bemispark', x0 + 1.5, cz + 3, 3.8, Math.PI / 2, { twoSided: true, y: 0.5 });
  trashCan(P, x1 - 2.2, cz + 1.8);
  P.flush();
}

// ------------------------------------------------------------------ Miller Park
function miller(ctx) {
  const P = ctx.cluster('millerpark');
  const r = ctx.lm('millerpark').rect;
  const land = ctx.land(r)[0];
  const { x0, x1, z0, z1 } = land;
  const lake = ctx.layout.water.find((w) => w.id === 'miller-lake');
  const b = P.get('solid');
  const rng = ctx.rng;
  const spots = gangSpots(r);
  lawn(P, land, '#6a983f');

  // --- the lake: rounded shoreline filling the WATER rect, muddy bank ring, water colliders
  const lcx = (lake.x0 + lake.x1) / 2;
  const lcz = (lake.z0 + lake.z1) / 2;
  const hx = (lake.x1 - lake.x0) / 2;
  const hz = (lake.z1 - lake.z0) / 2;
  const N = 28;
  const inner = [];
  const outer = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // superellipse (fills the rect with soft corners) plus a little wobble
    const e = 0.62;
    const ex = Math.sign(ca) * Math.pow(Math.abs(ca), e);
    const ez = Math.sign(sa) * Math.pow(Math.abs(sa), e);
    const w = 0.94 + 0.05 * Math.sin(a * 3 + 1.3) + 0.02 * Math.sin(a * 7);
    inner.push([lcx + ex * hx * w, lcz - ez * hz * w]);
    outer.push([lcx + ex * (hx * w + 2.4), lcz - ez * (hz * w + 2.4)]);
  }
  const g = P.get('ground');
  const R = ctx.T.rows.dirt;
  const bank = C('#9c8a6a');
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    // points run counter-clockwise on the map, so outer → inner faces up
    g.quad(outer[i][0], 0.075, outer[i][1], outer[j][0], 0.075, outer[j][1], inner[j][0], 0.1, inner[j][1], inner[i][0], 0.1, inner[i][1], bank, 0, R.v0, 1, R.v1);
  }
  polyFlat(P.get('lake'), inner, 0.13, C('#587276'), 1 / 16);
  ctx.box(lake.x0 + 1.5, lake.z0 + 1.5, lake.x1 - 1.5, lake.z1 - 1.5, 1.5, 'water', -2);
  // small island with a willow
  cylinder(b, lcx - 12, lcz + 4, 4.5, 3.6, 0.05, 0.45, 9, C('#6f8f45'));
  tree(P, lcx - 12, lcz + 4, { h: 9, kind: 'round', leaf: '#6f8c3a', collide: false });

  // --- loop path around the lake and a walk in from Fort St
  const L = { x0: lake.x0 - 7, x1: lake.x1 + 5, z0: lake.z0 - 6, z1: lake.z1 + 5 };
  const pw = 2.6;
  surface(P, { x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z0 + pw }, 'path', 3, { across: pw });
  surface(P, { x0: L.x0, x1: L.x1, z0: L.z1 - pw, z1: L.z1 }, 'path', 3, { across: pw });
  surface(P, { x0: L.x0, x1: L.x0 + pw, z0: L.z0 + pw, z1: L.z1 - pw }, 'path', 3, { axis: 'z', across: pw });
  surface(P, { x0: L.x1 - pw, x1: L.x1, z0: L.z0 + pw, z1: L.z1 - pw }, 'path', 3, { axis: 'z', across: pw });
  const ex = (L.x0 + L.x1) / 2 + 12;
  surface(P, { x0: ex - 1.5, x1: ex + 1.5, z0: L.z1, z1 }, 'path', 3, { axis: 'z', across: 3 });

  // --- 1908 pavilion east of the lake: white clapboard hall, wrap-around porch, hip roof, cupola
  const pv = { x0: L.x1 + 7, x1: L.x1 + 23, z0: lcz - 7, z1: lcz + 5 };
  const porch = 2.6;
  const cream = C('#efe8d6');
  surface(P, { x0: L.x1, x1: pv.x0 - porch, z0: lcz - 2, z1: lcz + 1 }, 'path', 3, { across: 3 });
  box(b, pv.x0 - porch, 0, pv.z0 - porch, pv.x1 + porch, 0.6, pv.z1 + porch, C('#b5ada0'));
  const row = ctx.T.rows.storefront;
  const hallWall = (ax, az, bx2, bz2) => {
    const reps = Math.max(1, Math.round(Math.hypot(bx2 - ax, bz2 - az) / 4.2));
    P.get('lowrise').quad(ax, 0.6, az, bx2, 0.6, bz2, bx2, 4.8, bz2, ax, 4.8, az, C('#f1ead8'), 0, row.v0, reps, row.v1);
  };
  hallWall(pv.x0, pv.z1, pv.x1, pv.z1);
  hallWall(pv.x1, pv.z1, pv.x1, pv.z0);
  hallWall(pv.x1, pv.z0, pv.x0, pv.z0);
  hallWall(pv.x0, pv.z0, pv.x0, pv.z1);
  // porch posts + railings (openings on the lake side and the south side)
  const postC = C('#f7f4ec');
  const px0 = pv.x0 - porch + 0.3;
  const px1 = pv.x1 + porch - 0.3;
  const pz0 = pv.z0 - porch + 0.3;
  const pz1 = pv.z1 + porch - 0.3;
  for (let i = 0; i <= 6; i++) {
    const x = px0 + ((px1 - px0) * i) / 6;
    for (const z of [pz0, pz1]) box(b, x - 0.13, 0.6, z - 0.13, x + 0.13, 4.8, z + 0.13, postC);
  }
  for (let i = 1; i < 3; i++) {
    const z = pz0 + ((pz1 - pz0) * i) / 3;
    for (const x of [px0, px1]) box(b, x - 0.13, 0.6, z - 0.13, x + 0.13, 4.8, z + 0.13, postC);
  }
  const rail = (ax, az, bx2, bz2) => {
    box(b, Math.min(ax, bx2) - 0.05, 1.45, Math.min(az, bz2) - 0.05, Math.max(ax, bx2) + 0.05, 1.55, Math.max(az, bz2) + 0.05, postC);
    box(b, Math.min(ax, bx2) - 0.03, 0.6, Math.min(az, bz2) - 0.03, Math.max(ax, bx2) + 0.03, 0.72, Math.max(az, bz2) + 0.03, postC);
  };
  rail(px0, pz0, px1, pz0);
  rail(px0, pz1, (px0 + px1) / 2 - 1.5, pz1);
  rail((px0 + px1) / 2 + 1.5, pz1, px1, pz1);
  rail(px1, pz0, px1, pz1);
  rail(px0, pz0, px0, lcz - 2.2);
  rail(px0, lcz + 1.2, px0, pz1);
  box(b, pv.x0 - porch - 0.1, 4.8, pv.z0 - porch - 0.1, pv.x1 + porch + 0.1, 5.2, pv.z1 + porch + 0.1, C('#e3dccb'), { bottom: true });
  hipRoof(b, pv.x0 - porch - 0.1, pv.z0 - porch - 0.1, pv.x1 + porch + 0.1, pv.z1 + porch + 0.1, 5.2, 3.2, C('#566b52'), 0.6);
  const cx = (pv.x0 + pv.x1) / 2;
  const czp = (pv.z0 + pv.z1) / 2;
  box(b, cx - 1.3, 7.6, czp - 1.3, cx + 1.3, 9.4, czp + 1.3, cream);
  pyramid(b, cx - 1.7, czp - 1.7, cx + 1.7, czp + 1.7, 9.4, 1.6, C('#566b52'));
  ctx.box(pv.x0, pv.z0, pv.x1, pv.z1, 8);
  ctx.box(px0 - 0.2, pz0, px0 + 0.2, lcz - 2.2, 1.55, 'prop');
  ctx.box(px0 - 0.2, lcz + 1.2, px0 + 0.2, pz1, 1.55, 'prop');
  ctx.box(px1 - 0.2, pz0, px1 + 0.2, pz1, 1.55, 'prop');
  ctx.box(px0, pz0 - 0.2, px1, pz0 + 0.2, 1.55, 'prop');
  ctx.box(px0, pz1 - 0.2, (px0 + px1) / 2 - 1.5, pz1 + 0.2, 1.55, 'prop');
  ctx.box((px0 + px1) / 2 + 1.5, pz1 - 0.2, px1, pz1 + 0.2, 1.55, 'prop');
  ctx.glow(px0 + 0.4, 4.3, lcz - 0.5, '#ffe2a8', 2.2);
  ctx.glow(cx, 4.3, pz1 + 0.2, '#ffe2a8', 2.2);
  ctx.tag({ id: 'lm-miller-pavilion-n', x: cx + 4, y: 1.9, z: pv.z0, nx: 0, nz: -1, w: 2.4, h: 1.2 });

  // --- golf course hole in the west part: tee, mown fairway stripes, bunker, green with the pin
  const fw = { x0: x0 + 6, x1: L.x0 - 8, z0: z0 + 10, z1: z1 - 14 };
  const fcx = (fw.x0 + fw.x1) / 2;
  for (let z = fw.z0, k = 0; z < fw.z1; z += 4, k++) lawn(P, { x0: fw.x0 + 3, x1: fw.x1 - 3, z0: z, z1: Math.min(fw.z1, z + 4) }, k % 2 ? '#74a443' : '#7fb048', 0.056);
  cylinder(P.get('grass'), fcx, fw.z0 + 8, 7.5, 7.5, 0.057, 0.058, 12, C('#8ec452'));
  cylinder(b, fcx + 9, fw.z0 + 13, 3.2, 3.4, 0.04, 0.07, 8, C('#d9c79a'));
  cylinder(b, fcx + 1.5, fw.z0 + 7, 0.04, 0.04, 0, 2.6, 4, C('#eeeeee'), { top: false });
  b.quad(fcx + 1.5, 2.1, fw.z0 + 7, fcx + 2.6, 2.1, fw.z0 + 7, fcx + 2.6, 2.6, fw.z0 + 7, fcx + 1.5, 2.6, fw.z0 + 7, C('#d02a24'));
  b.quad(fcx + 2.6, 2.1, fw.z0 + 7, fcx + 1.5, 2.1, fw.z0 + 7, fcx + 1.5, 2.6, fw.z0 + 7, fcx + 2.6, 2.6, fw.z0 + 7, C('#d02a24'));
  box(b, fcx - 3, 0, fw.z1 - 5, fcx + 3, 0.25, fw.z1 - 1, C('#7aa844'));
  bench(P, fcx - 5, fw.z1 - 3, -Math.PI / 2);
  // old trees framing the fairway
  for (let z = fw.z0 + 4; z < fw.z1; z += 14 + rng() * 6) {
    for (const x of [fw.x0 + 1, fw.x1 - 1]) if (!near(spots, x, z, 4)) tree(P, x + (rng() - 0.5) * 2, z, { h: 12 + rng() * 4, kind: rng() < 0.3 ? 'conifer' : 'broad' });
  }

  // --- trees, benches and lamps around the lake and along the edges
  for (let x = L.x0 + 4; x < L.x1 - 2; x += 11 + rng() * 5) {
    if (!near(spots, x, L.z0 - 4, 4)) tree(P, x, L.z0 - 4 - rng() * 3, { h: 11 + rng() * 5, kind: rng() < 0.3 ? 'cottonwood' : 'broad' });
    if (Math.abs(x + 5 - ex) > 4) tree(P, x + 5, L.z1 + 4 + rng() * 3, { h: 10 + rng() * 4, kind: 'broad' });
  }
  for (let z = z0 + 6; z < z1 - 4; z += 13 + rng() * 5) {
    if (!near(spots, x1 - 3, z, 4)) tree(P, x1 - 3 - rng() * 2, z, { h: 10 + rng() * 5, kind: rng() < 0.3 ? 'round' : 'broad' });
  }
  for (let x = L.x0 + 8; x < L.x1 - 4; x += 16) {
    lamp(P, x, L.z1 + 0.7, { style: 'park' });
    bench(P, x + 5, L.z1 - pw - 0.9, 0);
    lamp(P, x + 8, L.z0 - 0.7, { style: 'park' });
  }
  bench(P, L.x0 + pw + 0.9, lcz, -Math.PI / 2);
  // the south lawn toward Fort St: shade trees and picnic tables
  const south = { x0: L.x0, x1: x1 - 6, z0: L.z1 + 9, z1: z1 - 5 };
  const pvAvoid = { x0: pv.x0 - porch - 3, x1: pv.x1 + porch + 3, z0: pv.z0 - porch - 3, z1: pv.z1 + porch + 3 };
  treesIn(P, south, ctx.detail === 0 ? 6 : 9, () => ({ h: 10 + rng() * 5, kind: rng() < 0.25 ? 'cottonwood' : 'broad' }), [{ x0: ex - 3, x1: ex + 3, z0: L.z1, z1 }, pvAvoid]);
  picnicTable(P, ex - 9, L.z1 + 12, 0.3);
  picnicTable(P, ex + 10, L.z1 + 16, -0.2);
  trashCan(P, ex + 2.5, L.z1 + 2);
  trashCan(P, pv.x0 - porch - 1.5, pv.z1 + 1);
  postSign(P, 'millerpark', ex - 7, z1 - 1.3, 4.8, Math.PI, { twoSided: true, y: 0.5 });
  const pp = payphone(P, ex + 3.5, z1 - 1.5, Math.PI);
  ctx.poi({ id: 'lm-payphone-miller', type: 'payphone', name: 'Payphone', ...pp });
  ctx.poi({ id: 'lm-hangout-miller', type: 'hangout', name: 'Miller Park pavilion', x: cx, z: pz1 + 2.5, heading: 0 });
  P.flush();
}

/** Flat upward polygon (any winding) with world-space uv. */
function polyFlat(b, pts, y, c, s) {
  const shape = pts.map((p) => new THREE.Vector2(p[0], -p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const t of tris) {
    const A = pts[t[0]];
    const B = pts[t[1]];
    const D = pts[t[2]];
    const cross = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
    const [p, q] = cross < 0 ? [B, D] : [D, B];
    b.tri(A[0], y, A[1], p[0], y, p[1], q[0], y, q[1], c, A[0] * s, -A[1] * s, p[0] * s, -p[1] * s, q[0] * s, -q[1] * s);
  }
}
