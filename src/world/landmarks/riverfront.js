import * as THREE from 'three';
import { EW_STREETS } from '../../data/map.js';
import { C, shade, jitter, box, block, flat, cylinder, gableRoof, hipRoof, beam, lawn, surface, strip, mound } from './kit.js';
import { tree, bench, lamp, fence, flagpole, postSign, railcar, barricade, sandbagWall, trashCan } from './props.js';
import { UP_BRIDGE } from './river.js';

// The riverfront: Heartland of America Park and its computerized fountain, the low ConAgra
// campus, the ASARCO lead refinery (still smoking in 1993), the Union Pacific rail yards with a
// grain elevator, and flood barricades where the streets end at the river.
// Everything stays west of x = 690, where the levee (river.js) begins.

const EDGE = 689;

export function buildRiverfront(ctx) {
  heartland(ctx);
  conagra(ctx);
  asarco(ctx);
  railyards(ctx);
  barricades(ctx);
}

// ------------------------------------------------------------------ Heartland of America Park (1990)
function heartland(ctx) {
  const P = ctx.cluster('heartland');
  const r = ctx.lm('heartlandpark').rect;
  const lake = ctx.layout.water.find((w) => w.id === 'heartland-lake');
  const b = P.get('solid');
  const land = { x0: r.x0, x1: EDGE, z0: r.z0, z1: r.z1 };
  lawn(P, land, '#6b9843');
  // promenade loop around the lake
  const pw = 3.5;
  const L = { x0: lake.x0 - 6, x1: lake.x1 + 4.5, z0: lake.z0 - 5.5, z1: lake.z1 + 3 };
  surface(P, { x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z0 + pw }, 'path', 3, { across: pw });
  surface(P, { x0: L.x0, x1: L.x1, z0: L.z1, z1: L.z1 + pw }, 'path', 3, { across: pw });
  surface(P, { x0: L.x0, x1: L.x0 + pw, z0: L.z0, z1: L.z1 + pw }, 'path', 3, { axis: 'z', across: pw });
  surface(P, { x0: L.x1 - pw, x1: L.x1, z0: L.z0, z1: L.z1 + pw }, 'path', 3, { axis: 'z', across: pw });
  // entry walk from the city side (Douglas St)
  surface(P, { x0: r.x0, x1: L.x0, z0: 58, z1: 62 }, 'path', 3, { across: 4 });
  // lake with a concrete edge
  const cop = C('#c2bcb0');
  box(b, lake.x0 - 0.6, 0, lake.z0 - 0.6, lake.x1 + 0.6, 0.4, lake.z0, cop);
  box(b, lake.x0 - 0.6, 0, lake.z1, lake.x1 + 0.6, 0.4, lake.z1 + 0.6, cop);
  box(b, lake.x0 - 0.6, 0, lake.z0, lake.x0, 0.4, lake.z1, cop);
  box(b, lake.x1, 0, lake.z0, lake.x1 + 0.6, 0.4, lake.z1, cop);
  flat(P.get('lake'), lake.x0, lake.z0, lake.x1, lake.z1, 0.18, C('#5a7a82'), false, 1 / 16);
  ctx.box(lake.x0, lake.z0, lake.x1, lake.z1, 1.5, 'water', -2);
  // fountain platform in the middle of the lake
  const fx = (lake.x0 + lake.x1) / 2;
  const fz = (lake.z0 + lake.z1) / 2;
  cylinder(b, fx, fz, 5, 5, 0, 0.5, 10, C('#4a4d50'));
  cylinder(b, fx, fz, 2.4, 2.4, 0.5, 0.9, 10, C('#6a6d70'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.glow(fx + Math.cos(a) * 3.5, 0.9, fz + Math.sin(a) * 3.5, '#bfe4ff', 4);
  }
  // gondola dock on the south shore
  const dx = lake.x0 + 22;
  box(b, dx - 4, 0.25, lake.z1 - 5, dx + 4, 0.5, lake.z1 + 0.2, C('#7a5a3a'), { bottom: true });
  for (const [gx, gr] of [[dx - 9, 0.08], [dx + 9, -0.12]]) gondola(b, gx, lake.z1 - 3.5, gr);
  // gazebo on the south lawn
  const gx = fx + 18;
  const gz = r.z1 - 9;
  cylinder(b, gx, gz, 4.6, 4.6, 0, 0.35, 8, C('#c8c2b6'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = gx + Math.cos(a) * 4;
    const pz = gz + Math.sin(a) * 4;
    cylinder(b, px, pz, 0.18, 0.18, 0.35, 3.2, 6, C('#f2efe8'), { top: false });
    ctx.box(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 3.2, 'prop');
  }
  cylinder(b, gx, gz, 5.2, 0.4, 3.2, 5.6, 8, C('#3f5b4b'), { a0: Math.PI / 8, a1: Math.PI / 8 + Math.PI * 2, bottom: true });
  // trees around the edges, lamps and benches on the promenade
  const rng = ctx.rng;
  for (let z = r.z0 + 6; z < r.z1 - 3; z += 9 + rng() * 3) {
    tree(P, r.x0 + 3 + rng() * 2, z, { h: 8 + rng() * 4 });
    tree(P, EDGE - 3 - rng() * 2, z + 4, { h: 8 + rng() * 4, kind: rng() < 0.5 ? 'cottonwood' : 'broad' });
  }
  for (let x = L.x0 + 10; x < L.x1 - 6; x += 11 + rng() * 5) tree(P, x, r.z1 - 3 - rng() * 3, { h: 7 + rng() * 4, kind: 'round' });
  for (let x = L.x0 + 6; x < L.x1 - 3; x += 15) {
    lamp(P, x, L.z0 - 0.6, { style: 'park' });
    lamp(P, x + 7, L.z1 + pw + 0.6, { style: 'park' });
    bench(P, x + 3.5, L.z1 + 0.9, 0);
  }
  for (let z = L.z0 + 8; z < L.z1; z += 15) {
    lamp(P, L.x0 - 0.6, z, { style: 'park' });
    lamp(P, L.x1 + 0.6, z + 7, { style: 'park' });
  }
  trashCan(P, L.x0 + 6, L.z1 + 4.5);
  postSign(P, 'heartland', r.x0 + 1.5, 67, 7, Math.PI / 2, { twoSided: true });
  // small parking lot at the southwest corner
  const lot = { x0: r.x0 + 0.5, x1: r.x0 + 15.5, z0: r.z1 - 14, z1: r.z1 - 0.5 };
  surface(P, { x0: lot.x0, x1: lot.x0 + 5.5, z0: lot.z0, z1: lot.z1 }, 'parking', 10.8, { axis: 'z', across: 5.5 });
  surface(P, { x0: lot.x0 + 5.5, x1: lot.x1 - 5.5, z0: lot.z0, z1: lot.z1 }, 'asphalt', 8, { axis: 'z', across: 4 });
  surface(P, { x0: lot.x1 - 5.5, x1: lot.x1, z0: lot.z0, z1: lot.z1 }, 'parking', 10.8, { axis: 'z', across: 5.5 });
  for (let z = lot.z0 + 1.35; z < lot.z1 - 1; z += 2.7) {
    ctx.park(lot.x0 + 2.8, z, Math.PI / 2);
    ctx.park(lot.x1 - 2.8, z, -Math.PI / 2);
  }
  P.flush();
  fountain(ctx, fx, fz);
}

function gondola(b, x, z, rot) {
  const black = C('#1b1b1e');
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const p = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const L = 5;
  const W = 0.8;
  const pts = [p(-L, 0), p(-L * 0.6, -W), p(L * 0.6, -W), p(L, 0), p(L * 0.6, W), p(-L * 0.6, W)];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    b.quad(c[0], 0.15, c[1], a[0], 0.15, a[1], a[0], 0.7, a[1], c[0], 0.7, c[1], black);
  }
  const [px, pz] = p(0, 0);
  box(b, px - 0.6, 0.6, pz - 0.6, px + 0.6, 1.4, pz + 0.6, C('#8b1e1e'));
  for (const q of [p(-L, 0), p(L, 0)]) box(b, q[0] - 0.1, 0.6, q[1] - 0.1, q[0] + 0.1, 1.5, q[1] + 0.1, black);
}

/** Geometry with a per-vertex alpha ramp by height (a0 at y = 0, a1 at y = 1 in local units). */
function alphaRamp(geo, a0, a1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    lo = Math.min(lo, pos.getY(i));
    hi = Math.max(hi, pos.getY(i));
  }
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - lo) / (hi - lo || 1);
    col[i * 4] = 1;
    col[i * 4 + 1] = 1;
    col[i * 4 + 2] = 1;
    col[i * 4 + 3] = a0 + (a1 - a0) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}

/**
 * The computerized fountain: a water column surging to ~65 m, a misty burst at the top, a
 * curtain of spray falling back to the lake and a ring of side jets. Colored lights at night.
 */
function fountain(ctx, x, z) {
  const mk = (opacity) => new THREE.MeshLambertMaterial({ color: '#eef6fa', vertexColors: true, transparent: true, opacity, depthWrite: false, emissive: new THREE.Color('#000000'), side: THREE.DoubleSide });
  const mat = mk(0.8);
  const mist = mk(0.6);
  const colGeo = alphaRamp(new THREE.CylinderGeometry(0.55, 1.5, 1, 10, 6, true).translate(0, 0.5, 0), 0.85, 0.45);
  const column = new THREE.Mesh(colGeo, mat);
  column.position.set(x, 0.8, z);
  const burstGeo = alphaRamp(new THREE.IcosahedronGeometry(1, 1), 0.34, 0.04);
  const burst = new THREE.Mesh(burstGeo, mist);
  const curtainGeo = alphaRamp(new THREE.CylinderGeometry(2.2, 9, 1, 16, 4, true).translate(0, 0.5, 0), 0.03, 0.26);
  const curtain = new THREE.Mesh(curtainGeo, mist);
  curtain.position.set(x, 0.5, z);
  // ring of eight side jets, merged into one geometry
  const jets = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    jets.push(new THREE.CylinderGeometry(0.14, 0.4, 1, 5, 2, true).translate(Math.cos(a) * 3.6, 0.5, Math.sin(a) * 3.6));
  }
  const ring = new THREE.Mesh(alphaRamp(mergeSimple(jets), 0.8, 0.3), mat);
  ring.position.set(x, 0.8, z);
  const splash = new THREE.Mesh(alphaRamp(new THREE.CylinderGeometry(7, 9.5, 1, 14, 1, true).translate(0, 0.5, 0), 0.45, 0.0), mist);
  splash.position.set(x, 0.2, z);
  for (const m of [column, burst, curtain, ring, splash]) {
    m.name = 'lm:fountain';
    m.renderOrder = 1;
    ctx.group.add(m);
  }
  const tint = new THREE.Color();
  ctx.addUpdater((dt, st) => {
    const t = st.t;
    // programmed show: slow surges with quick pulses
    const h = 28 + 32 * (0.5 + 0.5 * Math.sin(t * 0.33)) + 4 * Math.sin(t * 1.9);
    column.scale.set(1 + 0.15 * Math.sin(t * 3.1), h, 1 + 0.15 * Math.cos(t * 2.7));
    const r = 3 + h * 0.05;
    burst.position.set(x + Math.sin(t * 0.7) * 0.6, 0.8 + h - r * 0.35, z);
    burst.scale.set(r, r * 1.25, r);
    curtain.scale.set(0.8 + h / 70, h * 0.92, 0.8 + h / 70);
    ring.scale.set(1, 7 + 4 * Math.sin(t * 2.2), 1);
    splash.scale.set(1, 2 + 2 * (0.5 + 0.5 * Math.sin(t * 0.33)), 1);
    // colored lights after dark
    const n = st.night;
    if (n > 0.2) {
      tint.setHSL((t * 0.04) % 1, 0.85, 0.5);
      mat.emissive.copy(tint).multiplyScalar(0.95 * n);
      mist.emissive.copy(tint).multiplyScalar(0.6 * n);
    } else {
      mat.emissive.setRGB(0, 0, 0);
      mist.emissive.setRGB(0, 0, 0);
    }
  });
}

/** Merge simple geometries (position/normal only). */
function mergeSimple(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ------------------------------------------------------------------ ConAgra campus (~1990)
function conagra(ctx) {
  const P = ctx.cluster('conagra');
  const r = ctx.lm('conagra').rect;
  const b = P.get('solid');
  const land = { x0: r.x0, x1: EDGE, z0: r.z0, z1: r.z1 };
  lawn(P, land, '#6e9a45');
  const brick = { mat: 'office', tint: '#a4624c', bay: 3.2, floor: 4.3 };
  const roof = C('#46524e');
  const bldgs = [
    { x0: 598, x1: 652, z0: 141, z1: 166, h: 13 },
    { x0: 640, x1: 686, z0: 186, z1: 210, h: 11 },
    { x0: 596, x1: 628, z0: 197, z1: 228, h: 11 },
  ];
  for (const q of bldgs) {
    block(P, brick, q.x0, q.z0, q.x1, q.z1, 0, q.h, roof);
    hipRoof(b, q.x0, q.z0, q.x1, q.z1, q.h, 4.2, roof, 0.8);
    ctx.box(q.x0, q.z0, q.x1, q.z1, q.h + 4);
  }
  // glass entrance atriums
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, 618, 166, 632, 171, 0, 8, C('#6b6b66'));
  box(b, 617, 8, 165.5, 633, 8.6, 171.5, C('#d8d2c6'));
  ctx.box(618, 166, 632, 171, 8.6);
  // parking lots + drive
  const lot1 = { x0: 660, x1: 686, z0: 139, z1: 177 };
  lotWithStalls(ctx, P, lot1, 'z');
  const lot2 = { x0: 596, x1: 630, z0: 175, z1: 192 };
  lotWithStalls(ctx, P, lot2, 'x');
  surface(P, { x0: r.x0, x1: 660, z0: 170, z1: 175 }, 'asphalt', 8, { across: 5 });
  // trees, flags, the monument sign
  const rng = ctx.rng;
  for (let i = 0; i < 26; i++) {
    const x = r.x0 + 3 + rng() * (EDGE - r.x0 - 6);
    const z = r.z0 + 3 + rng() * (r.z1 - r.z0 - 6);
    if (bldgs.some((q) => x > q.x0 - 4 && x < q.x1 + 4 && z > q.z0 - 4 && z < q.z1 + 4)) continue;
    if ([lot1, lot2].some((q) => x > q.x0 - 2 && x < q.x1 + 2 && z > q.z0 - 2 && z < q.z1 + 2)) continue;
    if (z > 168 && z < 177) continue;
    tree(P, x, z, { h: 7 + rng() * 4, kind: rng() < 0.4 ? 'round' : 'broad' });
  }
  for (let i = 0; i < 3; i++) flagpole(P, 612 + i * 3, 137, 12);
  postSign(P, 'conagra', r.x0 + 3, 160, 5.5, Math.PI / 2, { post: '#5b5b58', y: 0.4, twoSided: true });
  for (let x = 604; x < 650; x += 12) lamp(P, x, 169, { style: 'cobra', rot: 0, h: 7 });
  P.flush();
}

/** Asphalt lot with stall rows. axis = direction the rows run. Adds parking spots. */
function lotWithStalls(ctx, P, lot, axis) {
  const depth = 5.5;
  if (axis === 'z') {
    surface(P, { x0: lot.x0, x1: lot.x0 + depth, z0: lot.z0, z1: lot.z1 }, 'parking', 10.8, { axis: 'z', across: depth });
    surface(P, { x0: lot.x1 - depth, x1: lot.x1, z0: lot.z0, z1: lot.z1 }, 'parking', 10.8, { axis: 'z', across: depth });
    surface(P, { x0: lot.x0 + depth, x1: lot.x1 - depth, z0: lot.z0, z1: lot.z1 }, 'asphalt', 8, { axis: 'z', across: 6 });
    for (let z = lot.z0 + 1.35; z < lot.z1 - 1; z += 2.7) {
      ctx.park(lot.x0 + depth / 2, z, Math.PI / 2);
      ctx.park(lot.x1 - depth / 2, z, -Math.PI / 2);
    }
  } else {
    surface(P, { x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z0 + depth }, 'parking', 10.8, { across: depth });
    surface(P, { x0: lot.x0, x1: lot.x1, z0: lot.z1 - depth, z1: lot.z1 }, 'parking', 10.8, { across: depth });
    surface(P, { x0: lot.x0, x1: lot.x1, z0: lot.z0 + depth, z1: lot.z1 - depth }, 'asphalt', 8, { across: 6 });
    for (let x = lot.x0 + 1.35; x < lot.x1 - 1; x += 2.7) {
      ctx.park(x, lot.z0 + depth / 2, 0);
      ctx.park(x, lot.z1 - depth / 2, Math.PI);
    }
  }
}

// ------------------------------------------------------------------ ASARCO lead refinery
function asarco(ctx) {
  const P = ctx.cluster('asarco');
  const r = ctx.lm('asarco').rect;
  const b = P.get('solid');
  const land = { x0: r.x0, x1: EDGE, z0: r.z0, z1: r.z1 };
  surface(P, land, 'dirt', 8, { across: 8, tint: '#b9b0a2' });
  const shed = (x0, z0, x1, z1, h, tint, roofH = 3.2) => {
    block(P, { mat: 'lowrise', row: 'shed', tile: 8, tint }, x0, z0, x1, z1, 0, h, null);
    gableRoof(b, x0, z0, x1, z1, h, roofH, x1 - x0 > z1 - z0 ? 'x' : 'z', C('#7f807b'), C(tint), 0.5);
    ctx.box(x0, z0, x1, z1, h + roofH);
  };
  shed(598, -132, 648, -94, 13, '#bdb8ae');
  shed(655, -118, 687, -78, 17, '#b3a494', 3.8);
  shed(598, -72, 640, -32, 9, '#c7beae');
  // roof monitor (clerestory) on the refinery shed
  block(P, { mat: 'lowrise', row: 'shed', tile: 8, tint: '#aaa59a' }, 602, -116, 644, -110, 16.2, 18.6, C('#6e6e6a'));
  // brick office by the gate
  block(P, { mat: 'masonry', tint: '#9b624b', bay: 3.2, floor: 3.8 }, 646, -40, 670, -26, 0, 7.6, C('#5d5a55'));
  ctx.box(646, -40, 670, -26, 7.6);
  // the main stack with red/white bands near the top, plus two smaller stacks
  const sx = 672;
  const sz = -56;
  cylinder(b, sx, sz, 3.6, 2.5, 0, 36, 12, C('#8f8073'));
  for (let i = 0; i < 4; i++) cylinder(b, sx, sz, 2.5 - i * 0.012 * 6, 2.5 - (i + 1) * 0.012 * 6, 36 + i * 1.8, 37.8 + i * 1.8, 12, C(i % 2 ? '#f0ece4' : '#b62a22'), { top: false });
  cylinder(b, sx, sz, 2.2, 2.15, 43.2, 45, 12, C('#2f2b28'), { top: false });
  ctx.beacon(P, sx, 45.6, sz, 0.8);
  ctx.box(sx - 3.2, sz - 3.2, sx + 3.2, sz + 3.2, 45);
  for (const [cx, cz, rr, h] of [[628, -86, 1.6, 24], [662, -128, 1.3, 20]]) {
    cylinder(b, cx, cz, rr, rr * 0.8, 0, h, 8, C('#86796e'));
    cylinder(b, cx, cz, rr * 0.82, rr * 0.8, h - 1, h, 8, C('#2f2b28'), { top: false });
    ctx.box(cx - rr, cz - rr, cx + rr, cz + rr, h);
  }
  // flue duct from the kettle house to the stack, conveyor to the sheds
  beam(b, 666, 12, -78, sx, 12, sz + 3, 2.2, C('#8a8782'));
  beam(b, 648, 3, -100, 655, 12, -100, 1.2, C('#6f6a62'));
  // ore and slag piles
  mound(P, { x0: 668, x1: 687, z0: -148, z1: -130 }, { x0: 675, x1: 681, z0: -142, z1: -137 }, 5, '#3b3834', 'solid');
  mound(P, { x0: 612, x1: 632, z0: -149, z1: -137 }, { x0: 619, x1: 625, z0: -145, z1: -141 }, 3.5, '#5a534b', 'solid');
  ctx.box(670, -146, 685, -132, 5, 'prop');
  ctx.box(614, -148, 630, -138, 3.5, 'prop');
  // rail siding with hoppers along the west edge
  strip(P, 'rail', 594, r.z0 + 1, 594, r.z1 - 1, 3.2, 4);
  const rng = ctx.rng;
  for (let i = 0; i < 4; i++) railcar(P, 594, -140 + i * 16.5, 0, rng, 'hopper');
  ctx.box(592.4, -148.5, 595.6, -148.5 + 4 * 16.5, 4.4);
  // perimeter fence with the gate at the Cass St end
  fence(P, r.x0 + 0.5, r.z1 - 0.5, r.x0 + 0.5, r.z0 + 0.5, 2.4, { gaps: [[0.44, 0.52]] });
  fence(P, r.x0 + 0.5, r.z1 - 0.5, EDGE, r.z1 - 0.5, 2.4);
  fence(P, EDGE, r.z0 + 0.5, r.x0 + 0.5, r.z0 + 0.5, 2.4);
  postSign(P, 'asarco', r.x0 - 2.5, -86, 5, Math.PI / 2, { post: '#555', y: 0.5 });
  // sodium floodlights
  for (const [lx, lz] of [[596, -90], [652, -70], [650, -140], [690 - 3, -60]]) lamp(P, lx, lz, { style: 'cobra', h: 11, rot: Math.PI / 2, light: '#ffb05a', glow: 9 });
  ctx.tag({ id: 'lm-asarco-wall', x: 598, y: 2, z: -52, nx: -1, nz: 0, w: 3, h: 1.6 });
  P.flush();
  smoke(ctx, sx, 45.5, sz, { count: ctx.detail === 0 ? 7 : 14, color: '#aaa49c', size: 5, rise: 2.2, drift: 1.6, life: 14 });
  smoke(ctx, 628, 24.5, -86, { count: 4, color: '#bdb8b0', size: 2.5, rise: 1.5, drift: 1.2, life: 8 });
}

/**
 * Drifting smoke puffs from (x, y, z): one InstancedMesh, puffs grow and rise, drifting east with
 * the wind, and shrink away at the end of their life.
 */
export function smoke(ctx, x, y, z, opts = {}) {
  const n = opts.count || 8;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: opts.color || '#a8a39b', transparent: true, opacity: opts.opacity ?? 0.22, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'lm:smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  ctx.group.add(mesh);
  const life = opts.life || 10;
  const ages = [];
  for (let i = 0; i < n; i++) ages.push((i / n) * life);
  const o = new THREE.Object3D();
  const size = opts.size || 3;
  ctx.addUpdater((dt) => {
    for (let i = 0; i < n; i++) {
      let a = ages[i] + dt;
      if (a > life) a -= life;
      ages[i] = a;
      const k = a / life;
      const s = size * (0.4 + k * 1.6) * (k > 0.8 ? (1 - k) / 0.2 : 1);
      o.position.set(x + a * (opts.drift ?? 1.5) + Math.sin(i * 1.7 + a) * 0.6, y + a * (opts.rise ?? 1.8), z + Math.cos(i * 2.3) * 1.5 + a * 0.3);
      o.rotation.set(i, a * 0.2, i * 0.5);
      o.scale.setScalar(Math.max(0.01, s));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

// ------------------------------------------------------------------ Union Pacific rail yards
function railyards(ctx) {
  const r = ctx.lm('railyards').rect;
  const rng = ctx.rng;
  const north = ctx.cluster('railyards-n');
  const south = ctx.cluster('railyards-s');
  const bz = UP_BRIDGE.z;
  const split = -480;
  const pick = (z) => (z < split ? north : south);
  for (const P of [north, south]) {
    const z0 = P === north ? r.z0 : split;
    const z1 = P === north ? split : r.z1;
    surface(P, { x0: r.x0, x1: EDGE, z0, z1 }, 'dirt', 8, { across: 8, tint: '#a39b8d' });
  }
  const fill = ctx.detail === 0 ? 0.28 : ctx.detail === 1 ? 0.45 : 0.6;
  // grain elevator at the north end
  const ge = { x0: 622, x1: 666, z0: r.z0 + 3, z1: r.z0 + 22 };
  // track layout: west group runs the full yard; east group splits at the bridge approach
  const tracks = [];
  for (const x of [588, 594, 600, 606, 612]) tracks.push({ x, z0: r.z0 + 1, z1: r.z1 - 1 });
  for (let x = 624; x <= 684; x += 6) {
    tracks.push({ x, z0: x < ge.x1 + 2 ? ge.z1 + 2 : r.z0 + 1, z1: bz - 14 });
    tracks.push({ x, z0: bz + 14, z1: r.z1 - 1 });
  }
  for (const t of tracks) {
    // split long tracks between the two clusters
    if (t.z0 < split && t.z1 > split) {
      strip(north, 'rail', t.x, t.z0, t.x, split, 3.2, 4);
      strip(south, 'rail', t.x, split, t.x, t.z1, 3.2, 4);
    } else strip(pick(t.z0), 'rail', t.x, t.z0, t.x, t.z1, 3.2, 4);
    // strings of cars
    let z = t.z0 + 2 + rng() * 30;
    while (z < t.z1 - 18) {
      if (rng() < fill) {
        const n = 3 + Math.floor(rng() * 9);
        const start = z;
        for (let i = 0; i < n && z < t.z1 - 18; i++) {
          railcar(pick(z), t.x, z + 8, 0, rng);
          z += 16.6;
        }
        ctx.box(t.x - 1.6, start, t.x + 1.6, z, 4.3, 'landmark');
        z += 20 + rng() * 40;
      } else z += 30 + rng() * 60;
    }
  }
  // locomotives
  for (const [lx, lz] of [[594, -520], [642, -390], [606, -262]]) {
    const P = pick(lz);
    locomotive(P, lx, lz);
    ctx.box(lx - 1.7, lz - 10, lx + 1.7, lz + 10, 4.6);
  }
  grainElevator(ctx, north, ge);
  bridgeApproach(ctx, pick(bz), r);
  // yard office with a tower cab
  const yo = { x0: 584, x1: 596, z0: -470, z1: -458 };
  block(south, { mat: 'masonry', tint: '#9c5f47', bay: 3, floor: 3.4 }, yo.x0, yo.z0, yo.x1, yo.z1, 0, 6.8, C('#4f4b46'));
  block(south, { mat: 'lowrise', row: 'terminal', tile: 6 }, yo.x0 + 3, yo.z0 + 3, yo.x1 - 3, yo.z1 - 3, 6.8, 9.6, C('#3d3a36'));
  box(south.get('solid'), yo.x0 + 2.4, 9.6, yo.z0 + 2.4, yo.x1 - 2.4, 10.1, yo.z1 - 2.4, C('#3d3a36'));
  ctx.box(yo.x0, yo.z0, yo.x1, yo.z1, 10);
  ctx.tag({ id: 'lm-yard-office-s', x: (yo.x0 + yo.x1) / 2, z: yo.z1, nx: 0, nz: 1 });
  ctx.tag({ id: 'lm-yard-office-w', x: yo.x0, z: (yo.z0 + yo.z1) / 2, nx: -1, nz: 0 });
  // light towers
  for (const [lx, lz] of [[618, -700], [618, -560], [618, -420], [618, -250]]) {
    const P = pick(lz);
    const b = P.get('solid');
    cylinder(b, lx, lz, 0.45, 0.3, 0, 24, 6, C('#8c8f90'), { top: false });
    box(b, lx - 2, 24, lz - 0.6, lx + 2, 25.6, lz + 0.6, C('#5c5f60'));
    box(P.get('lights'), lx - 1.8, 23.9, lz - 0.5, lx + 1.8, 24.05, lz + 0.5, C('#fff0c8'));
    for (const o of [-1.2, 0, 1.2]) ctx.glow(lx + o, 24.2, lz, '#ffe2a8', 7);
    ctx.box(lx - 0.5, lz - 0.5, lx + 0.5, lz + 0.5, 24, 'prop');
  }
  // signal gantry over the west ladder tracks
  for (const P of [south]) {
    const b = P.get('solid');
    const gz = -300;
    const steel = C('#4f5356');
    beam(b, 585, 0, gz, 585, 7.5, gz, 0.35, steel);
    beam(b, 615, 0, gz, 615, 7.5, gz, 0.35, steel);
    beam(b, 585, 7.5, gz, 615, 7.5, gz, 0.5, steel);
    for (const x of [588, 594, 600, 606, 612]) {
      box(b, x - 0.35, 6.2, gz - 0.2, x + 0.35, 7.3, gz + 0.2, C('#1d1d1d'));
      ctx.glow(x, 6.9, gz + 0.3, rng() < 0.5 ? '#ff3a2a' : '#3aff6a', 1.6);
    }
    ctx.box(584.6, gz - 0.4, 585.4, gz + 0.4, 7.5, 'prop');
    ctx.box(614.6, gz - 0.4, 615.4, gz + 0.4, 7.5, 'prop');
  }
  // fence along the city side, with gates
  fence(north, r.x0 + 0.4, r.z0 + 1, r.x0 + 0.4, split, 2.2, { gaps: [[0.62, 0.66]] });
  fence(south, r.x0 + 0.4, split, r.x0 + 0.4, r.z1 - 1, 2.2, { gaps: [[0.3, 0.36], [0.8, 0.86]] });
  north.flush();
  south.flush();
}

function locomotive(P, x, z) {
  const b = P.get('solid');
  const yellow = C('#e3ad1f');
  const gray = C('#9b9e9e');
  const red = C('#b3262b');
  const dark = C('#1f1f1f');
  box(b, x - 1.5, 0.2, z - 10, x + 1.5, 1.4, z + 10, dark);
  box(b, x - 1.2, 1.4, z - 7, x + 1.2, 4.3, z + 9.5, yellow, { cTop: gray });
  box(b, x - 1.55, 1.4, z - 10, x + 1.55, 4.8, z - 7, yellow, { cTop: gray });
  box(b, x - 1.56, 1.4, z - 7, x + 1.56, 1.9, z + 9.5, red);
  box(b, x - 1.6, 3.6, z - 9.9, x + 1.6, 4.4, z - 7.1, C('#20262c'));
  box(b, x - 0.9, 4.3, z + 2, x + 0.9, 4.9, z + 6, gray);
}

function grainElevator(ctx, P, ge) {
  const b = P.get('solid');
  const con = C('#cbc5b8');
  const H = 34;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = ge.x0 + 11 + i * 6.6;
      const cz = ge.z0 + 5.5 + j * 7;
      cylinder(b, cx, cz, 3.5, 3.5, 0, H, 10, jitter(con, ctx.rng, 0.04), { cTop: C('#a9a399') });
    }
  }
  // gallery along the top + headhouse / workhouse at the west end
  box(b, ge.x0 + 8, H, ge.z0 + 7.5, ge.x1, H + 2.6, ge.z0 + 10.5, C('#bdb7aa'));
  block(P, { mat: 'lowrise', row: 'stoneslit', tile: 6, tint: '#d2ccbf' }, ge.x0, ge.z0 + 1, ge.x0 + 8, ge.z1 - 1, 0, 46, C('#8f8a80'));
  box(b, ge.x0 + 1.5, 46, ge.z0 + 4, ge.x0 + 6.5, 50, ge.z1 - 4, C('#bdb7aa'));
  beam(b, ge.x0 + 8, 30, ge.z0 + 9, ge.x0 + 30, 34, ge.z0 + 9, 1.2, C('#9d978c'));
  ctx.beacon(P, ge.x0 + 4, 50.6, (ge.z0 + ge.z1) / 2, 0.7);
  ctx.box(ge.x0, ge.z0, ge.x1, ge.z1, H);
  ctx.tag({ id: 'lm-elevator', x: ge.x0 + 8, y: 2, z: ge.z1 - 1, nx: 0, nz: 1, w: 3, h: 1.6 });
}

/** Embankment carrying the double-track main line up to the UP bridge deck. */
function bridgeApproach(ctx, P, r) {
  const B = UP_BRIDGE;
  const xs = 620;
  const xe = B.x0 + 1;
  const hw = B.width / 2 + 0.5;
  const g = P.get('grass');
  const col = C('#7d7a55');
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const xa = xs + ((xe - xs) * i) / steps;
    const xb = xs + ((xe - xs) * (i + 1)) / steps;
    const ha = (B.deckY * i) / steps;
    const hb = (B.deckY * (i + 1)) / steps;
    const sa = hw + ha * 1.2;
    const sb = hw + hb * 1.2;
    // top
    g.quad(xa, ha + 0.05, B.z + hw, xb, hb + 0.05, B.z + hw, xb, hb + 0.05, B.z - hw, xa, ha + 0.05, B.z - hw, col, 0, 0, 2, 1);
    // side slopes
    g.quad(xa, 0.05, B.z + sa, xb, 0.05, B.z + sb, xb, hb + 0.05, B.z + hw, xa, ha + 0.05, B.z + hw, shade(col, 0.9), 0, 0, 2, 1);
    g.quad(xb, 0.05, B.z - sb, xa, 0.05, B.z - sa, xa, ha + 0.05, B.z - hw, xb, hb + 0.05, B.z - hw, shade(col, 0.85), 0, 0, 2, 1);
    ctx.box(xa, B.z - (sa + sb) / 2 + 1, xb, B.z + (sa + sb) / 2 - 1, Math.max(0.5, hb), 'landmark');
    for (const tz of [B.z - 2.3, B.z + 2.3]) {
      const R = ctx.T.rows.rail;
      P.get('ground').quad(xa, ha + 0.1, tz + 1.6, xb, hb + 0.1, tz + 1.6, xb, hb + 0.1, tz - 1.6, xa, ha + 0.1, tz - 1.6, C('#ffffff'), xa / 4, R.v0, xb / 4, R.v1);
    }
  }
  // tracks at grade leading west to the yard throat
  for (const tz of [B.z - 2.3, B.z + 2.3]) strip(P, 'rail', r.x0 + 1, tz, xs, tz, 3.2, 4);
  // stone abutment where the embankment meets the levee
  box(P.get('solid'), xe - 6, 0, B.z - hw - 0.2, xe + 1, B.deckY, B.z + hw + 0.2, C('#a39a8d'));
}

// ------------------------------------------------------------------ ROAD CLOSED — HIGH WATER
function barricades(ctx) {
  const P = ctx.cluster('barricades');
  const x = 571.8;
  for (const s of EW_STREETS) {
    if (s.to != null && s.to < 560) continue;
    if (s.z < -215) continue; // north of Cuming the streets end before the river
    barricade(P, x, s.z, s.width - 0.6, Math.PI / 2);
    if (s.major) sandbagWall(P, x + 1.6, s.z - 3, x + 1.6, s.z + 3, 3);
  }
  P.flush();
}

