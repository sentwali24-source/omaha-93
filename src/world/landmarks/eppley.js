import * as THREE from 'three';
import { C, shade, box, obox, flat, block, cylinder, curvedWall, vault, beam, lawn, surface, strip, rotPt, oboxCollider } from './kit.js';
import { tree, lamp, fence, postSign, sign, groundSign, jetGeometry } from './props.js';
import { glowMaterial } from './materials.js';

// Eppley Airfield, 1993: runway 14/32 (the main runway, NW–SE), a parallel taxiway, the apron,
// the 1961 terminal with two concourse piers and parked jets, the 1975 control tower, a hangar,
// fuel tanks, a radar antenna, runway/taxiway lights at night and a perimeter fence. One jet
// flies a loop: it lands on 32 coming in over the river from Iowa, turns around at the far end,
// takes off on 14 and climbs out back over the river.

const EDGE = 689; // the levee (river.js) starts at x = 690
const RWY = { ax: 432, az: -1240, len: 372, width: 30 };
const D = [0.643, 0.766]; // runway direction A → B (south-east)
const N = [-D[1], D[0]]; // perpendicular toward the south-west (terminal side)
const H14 = Math.atan2(-D[0], -D[1]); // heading flying south-east
const H32 = H14 + Math.PI; // heading flying north-west
const ROT = Math.atan2(-D[1], D[0]); // obox rotation whose local x runs along the runway

/** World point from runway coordinates: u along A → B, v toward the south-west. */
const rw = (u, v = 0) => [RWY.ax + D[0] * u + N[0] * v, RWY.az + D[1] * u + N[1] * v];

export function buildEppley(ctx) {
  const r = ctx.lm('eppley').rect;
  const land = { ...ctx.land(r)[0], x1: EDGE };
  const P = ctx.cluster('eppley-air');
  airfield(ctx, P, land);
  P.flush();
  const T = ctx.cluster('eppley-terminal');
  terminal(ctx, T, land);
  T.flush();
  const radar = radarAntenna(ctx);
  flyingJet(ctx, radar);
}

// ------------------------------------------------------------------ runway, taxiways, lights, fence
function airfield(ctx, P, land) {
  const b = P.get('solid');
  lawn(P, land, '#7f9a4e', 0.05, 1 / 9);
  // runway 14/32 with shoulders, threshold bars, aiming points and numbers
  const [ax, az] = rw(0);
  const [bx, bz] = rw(RWY.len);
  strip(P, 'asphalt', ax, az, bx, bz, RWY.width + 6, 8, { y: 0.07, tint: '#b9b9b4' });
  strip(P, 'runway', ax, az, bx, bz, RWY.width, 36, { y: 0.085 });
  const white = C('#ecece4');
  const bar = (u, v, len, w) => {
    const [cx, cz] = rw(u, v);
    obox(b, cx, cz, len, w, 0.09, 0.1, ROT, white, { top: true });
  };
  for (const end of [0, 1]) {
    const u0 = end ? RWY.len - 8 : 8;
    for (let i = 0; i < 4; i++) {
      bar(u0, -3.2 - i * 2.8, 12, 1.5);
      bar(u0, 3.2 + i * 2.8, 12, 1.5);
    }
    const ua = end ? RWY.len - 70 : 70;
    bar(ua, -6, 22, 3.6);
    bar(ua, 6, 22, 3.6);
  }
  const [n14x, n14z] = rw(24);
  groundSign(P, 'rw14', n14x, 0.1, n14z, 8, 10.4, H14);
  const [n32x, n32z] = rw(RWY.len - 24);
  groundSign(P, 'rw32', n32x, 0.1, n32z, 8, 10.4, H32);

  // parallel taxiway on the south-west side + connectors
  const tv = 55;
  const [t0x, t0z] = rw(40, tv);
  const [t1x, t1z] = rw(340, tv);
  strip(P, 'taxiway', t0x, t0z, t1x, t1z, 18, 20, { y: 0.08 });
  for (const u of [40, 200, 340]) {
    const [c0x, c0z] = rw(u, RWY.width / 2 - 1);
    const [c1x, c1z] = rw(u, tv + 9);
    strip(P, 'taxiway', c0x, c0z, c1x, c1z, 16, 20, { y: 0.082 });
  }
  // links from the taxiway down to the apron (x 470..640, z -935..-850)
  const [l1x, l1z] = rw(250, tv);
  strip(P, 'taxiway', l1x, l1z, l1x, -928, 16, 20, { y: 0.081 });
  strip(P, 'taxiway', t1x, t1z, t1x, -928, 16, 20, { y: 0.081 });

  // edge lights: white along the runway, green thresholds, blue taxiway edges
  for (let u = 0; u <= RWY.len + 0.1; u += 24) {
    for (const s of [-1, 1]) {
      const [lx, lz] = rw(u, s * (RWY.width / 2 + 1));
      ctx.glow(lx, 0.45, lz, '#fff2d2', 2.6);
      box(b, lx - 0.12, 0, lz - 0.12, lx + 0.12, 0.4, lz + 0.12, C('#d9d24a'));
    }
  }
  for (const u of [-1, RWY.len + 1]) {
    for (let v = -RWY.width / 2; v <= RWY.width / 2 + 0.1; v += 3) {
      const [lx, lz] = rw(u, v);
      ctx.glow(lx, 0.4, lz, u < 0 ? '#5dff8a' : '#ff4a3a', 2.6);
    }
  }
  // approach lights leading in from the river side (runway 32)
  for (let k = 1; k <= 3; k++) {
    const [lx, lz] = rw(RWY.len + k * 5);
    if (lx < EDGE - 1) ctx.glow(lx, 1.2, lz, '#fff6e0', 3.4);
  }
  for (let u = 40; u <= 340; u += 30) {
    for (const s of [-1, 1]) {
      const [lx, lz] = rw(u, tv + s * 10);
      ctx.glow(lx, 0.35, lz, '#4f7dff', 2);
    }
  }

  // apron (concrete) with painted lead-in lines to the gates
  const apron = { x0: 470, x1: 640, z0: -935, z1: -842 };
  surface(P, apron, 'plaza', 10, { across: 10, tint: '#c7c5bd', y: 0.075 });
  const yel = C('#e0b52c');
  for (const [gx, gz] of GATES) obox(b, gx, gz, 44, 0.3, 0.08, 0.09, 0, yel);
  // apron floodlights
  for (const [x, z] of [[475, -930], [555, -935], [636, -930], [475, -880], [636, -880]]) lamp(P, x, z, { style: 'cobra', h: 14, rot: x < 550 ? -Math.PI / 2 : Math.PI / 2, glow: 10 });

  // windsock beside the runway
  const [wx, wz] = rw(185, -28);
  cylinder(b, wx, wz, 0.08, 0.06, 0, 6, 4, C('#d9d9d4'), { top: false });
  cylinder(b, wx + 0.4, wz, 0.5, 0.18, 5.7, 5.7, 6, C('#f26a1b'), { top: false });
  beam(b, wx, 5.7, wz, wx + 3, 5.4, wz + 0.8, 0.7, C('#f26a1b'));
  ctx.box(wx - 0.15, wz - 0.15, wx + 0.15, wz + 0.15, 6, 'prop');

  // hangar with a barrel roof west of the taxiway, fuel farm, maintenance lot
  const hg = { x0: 404, x1: 446, z0: -1080, z1: -1048 };
  block(P, { mat: 'solid', tint: '#c9c6bd' }, hg.x0, hg.z0, hg.x1, hg.z1, 0, 9, null);
  vault(b, hg.x0, hg.z0, hg.x1, hg.z1, 9, 6, 'x', 8, C('#8e9396'), C('#c9c6bd'));
  box(b, hg.x1, 0, hg.z0 + 3, hg.x1 + 0.1, 8.4, hg.z1 - 3, C('#7a8187'));
  sign(P, 'eppley', hg.x1 + 0.12, 10.8, (hg.z0 + hg.z1) / 2, 14, 0, -Math.PI / 2);
  ctx.box(hg.x0, hg.z0, hg.x1, hg.z1, 15);
  surface(P, { x0: hg.x1, x1: hg.x1 + 30, z0: hg.z0 - 4, z1: hg.z1 + 4 }, 'plaza', 10, { across: 10, tint: '#bdbbb3' });
  for (let i = 0; i < 3; i++) {
    const fx = 412 + i * 11;
    cylinder(b, fx, -1010, 4.2, 4.2, 0, 7.5, 10, C('#e8e8e2'), { cTop: C('#c9c9c2') });
    ctx.box(fx - 3.6, -1013.6, fx + 3.6, -1006.4, 7.5);
  }
  fence(P, 405, -1018, 441, -1018, 2.1);
  fence(P, 441, -1018, 441, -1002, 2.1);
  fence(P, 441, -1002, 405, -1002, 2.1);

  // perimeter fence: 16th St side and the airside / landside line north of the terminal
  fence(P, land.x0 + 1.5, -1256, land.x0 + 1.5, -842, 2.4, { mesh: '#aeb3b5' });
  fence(P, land.x0 + 1.5, -842, 481, -842, 2.4);
  fence(P, 629, -842, EDGE - 1, -842, 2.4, { gaps: [[0.1, 0.18]] });
  // trees screening the fence along 16th St
  for (let z = -1240; z < -860; z += 26 + ctx.rng() * 12) tree(P, land.x0 + 5, z, { h: 9 + ctx.rng() * 4, kind: ctx.rng() < 0.5 ? 'cottonwood' : 'round' });
}

// gates: [x, z, dir] jet parking positions next to the piers (dir = +1 nose east, -1 nose west)
const GATES = [
  [486, -872, 1],
  [534, -862, -1],
  [571, -878, 1],
  [619, -866, -1],
];
const LIVERIES = [
  { body: '#f1f1ee', stripe: '#b3202a', tail: '#b3202a', belly: '#c3c6c9' },
  { body: '#c9ced3', stripe: '#1f4e9c', tail: '#1f4e9c', belly: '#9ea4aa' },
  { body: '#f3f1ea', stripe: '#d0661c', tail: '#7a3b1a', belly: '#c8c4bc' },
  { body: '#eef0f2', stripe: '#1b2a55', tail: '#1b2a55', belly: '#b8bdc2' },
];

/** Copy a Builder's triangles into dst, rotated by heading and moved to (x, z). */
function addBuilder(dst, src, x, z, heading, y = 0) {
  const cs = Math.cos(heading);
  const sn = Math.sin(heading);
  const P = src.P;
  const K = src.K;
  const col = new THREE.Color();
  for (let i = 0; i < src.count; i += 3) {
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const j = (i + k) * 3;
      const lx = P[j];
      const lz = P[j + 2];
      // rotation about +Y by heading (a model built facing -Z then faces `heading`)
      pts.push(x + lx * cs + lz * sn, y + P[j + 1], z - lx * sn + lz * cs);
    }
    col.setRGB(K[i * 3], K[i * 3 + 1], K[i * 3 + 2]);
    dst.tri(...pts, col.clone());
  }
}

// ------------------------------------------------------------------ terminal, piers, tower, jets, landside
function terminal(ctx, P, land) {
  const b = P.get('solid');
  const TM = { x0: 482, x1: 628, z0: -838, z1: -812 };
  const glassF = { mat: 'glass', tint: '#7d8f98', bay: 3, floor: 4.4 };
  const conc = C('#d9d4c8');
  // ground floor glass, upper floor concrete band with a window strip, flat roof
  block(P, glassF, TM.x0, TM.z0, TM.x1, TM.z1, 0, 4.4, null);
  block(P, { mat: 'office', tint: '#d8d2c4', bay: 3.2, floor: 4.2, base: 4.4 }, TM.x0 - 1, TM.z0 - 1, TM.x1 + 1, TM.z1 + 1, 4.4, 9.2, C('#7a7873'));
  box(b, TM.x0 - 1.6, 9.2, TM.z0 - 1.6, TM.x1 + 1.6, 9.9, TM.z1 + 1.6, conc, { cTop: C('#8d8a83') });
  box(b, TM.x0 - 1, 4.25, TM.z0 - 1, TM.x1 + 1, 4.45, TM.z1 + 1, conc, { top: false, bottom: true });
  // central hall raised with a folded-plate roof line
  const cx = (TM.x0 + TM.x1) / 2;
  block(P, glassF, cx - 16, TM.z0 - 1, cx + 16, TM.z1 + 1, 9.9, 13.4, null);
  for (let i = 0; i < 8; i++) {
    const x0 = cx - 16 + i * 4;
    b.tri(x0, 13.4, TM.z1 + 1.4, x0 + 4, 13.4, TM.z1 + 1.4, x0 + 2, 15.2, TM.z1 + 1.4, conc);
    b.tri(x0 + 4, 13.4, TM.z0 - 1.4, x0, 13.4, TM.z0 - 1.4, x0 + 2, 15.2, TM.z0 - 1.4, conc);
    b.quad(x0, 13.4, TM.z1 + 1.4, x0 + 2, 15.2, TM.z1 + 1.4, x0 + 2, 15.2, TM.z0 - 1.4, x0, 13.4, TM.z0 - 1.4, shade(conc, 0.92));
    b.quad(x0 + 2, 15.2, TM.z1 + 1.4, x0 + 4, 13.4, TM.z1 + 1.4, x0 + 4, 13.4, TM.z0 - 1.4, x0 + 2, 15.2, TM.z0 - 1.4, shade(conc, 0.85));
  }
  // curbside canopy on the landside (south) with the name on its fascia
  box(b, TM.x0 + 10, 4.6, TM.z1, TM.x1 - 10, 5.3, TM.z1 + 7, C('#c9c4b8'), { bottom: true, cTop: C('#96938b') });
  for (let x = TM.x0 + 14; x < TM.x1 - 10; x += 12) box(b, x - 0.25, 0, TM.z1 + 6.2, x + 0.25, 4.6, TM.z1 + 6.7, C('#9a9a94'));
  sign(P, 'eppley', cx, 7.1, TM.z1 + 1.05, 22, 0, Math.PI);
  sign(P, 'eppley', cx, 11.6, TM.z0 - 1.05, 18, 0, 0);
  ctx.box(TM.x0 - 1, TM.z0 - 1, TM.x1 + 1, TM.z1 + 1, 15.2);
  for (let x = TM.x0 + 14; x < TM.x1 - 10; x += 12) ctx.box(x - 0.3, TM.z1 + 6.1, x + 0.3, TM.z1 + 6.8, 4.6, 'prop');
  ctx.glow(cx, 4.3, TM.z1 + 3.5, '#fff0cc', 5);

  // two concourse piers with round gate lounges
  for (const px of [510, 595]) {
    const pr = { x0: px - 6, x1: px + 6, z0: -886, z1: TM.z0 - 1 };
    block(P, { mat: 'office', tint: '#d3cec2', bay: 3, floor: 3.6 }, pr.x0, pr.z0, pr.x1, pr.z1, 0, 7.2, C('#77756f'));
    const gz = pr.z0 - 5;
    curvedWall(P, { mat: 'glass', tint: '#7d8f98', bay: 3, floor: 3.6 }, px, gz, 10, 0, Math.PI * 2, 10, 0, 7.2);
    cylinder(b, px, gz, 10.6, 10.6, 7.2, 7.8, 10, conc);
    cylinder(b, px, gz, 10.6, 3, 7.8, 9, 10, C('#77756f'));
    ctx.box(pr.x0, pr.z0, pr.x1, pr.z1, 7.8);
    ctx.box(px - 8, gz - 8, px + 8, gz + 8, 9);
  }
  // parked jets at the gates with jet bridges
  const jets = LIVERIES.map((l) => jetGeometry(ctx.Builder, l));
  const sh = P.get('shiny');
  GATES.forEach(([gx, gz, dir], i) => {
    const h = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    addBuilder(sh, jets[i % jets.length], gx, gz, h);
    // colliders: fuselage, and the wings + engines
    ctx.box(gx - 16, gz - 2.2, gx + 16, gz + 2.2, 5.5, 'prop');
    ctx.box(gx + (dir > 0 ? -6.4 : -2.6), gz - 14, gx + (dir > 0 ? 2.6 : 6.4), gz + 14, 3.2, 'prop');
    // jet bridge from the pier wall to the front door (left side, behind the cockpit)
    const pierX = dir > 0 ? (gx < 550 ? 504 : 589) : gx < 550 ? 516 : 601;
    const doorX = gx + dir * 11.5;
    const bz = gz - dir * 3.3;
    const y = 3.1;
    beam(b, pierX, y + 1.25, bz, doorX, y + 1.25, bz, 2.5, C('#b9b6ad'));
    box(b, doorX - dir * 1.2 - 0.3, 0, bz - 0.3, doorX - dir * 1.2 + 0.3, y, bz + 0.3, C('#5f6164'));
    ctx.box(Math.min(pierX, doorX), bz - 1.3, Math.max(pierX, doorX), bz + 1.3, y + 2.5, 'prop', y - 0.2);
  });
  // ground equipment: baggage carts, a fuel truck, a tug
  for (const [x, z, w, d, c] of [[500, -900, 6, 2, '#d8d6cf'], [556, -905, 9, 2.6, '#e8e6de'], [580, -900, 3, 2, '#e0b52c'], [626, -900, 6, 2, '#d8d6cf']]) {
    box(b, x - w / 2, 0.3, z - d / 2, x + w / 2, 1.9, z + d / 2, C(c));
    ctx.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 1.9, 'prop');
  }

  // control tower (1975): concrete shaft, flared glass cab, beacon
  const tw = { x: 660, z: -826 };
  block(P, { mat: 'office', tint: '#cfc9bc', bay: 3.2, floor: 3.4 }, tw.x - 9, tw.z - 5, tw.x + 5, tw.z + 6, 0, 6.8, C('#77756f'));
  cylinder(b, tw.x, tw.z, 3.2, 2.7, 0, 36, 8, C('#d4cfc3'));
  cylinder(b, tw.x, tw.z, 2.8, 5.4, 36, 38, 8, C('#bdb8ad'));
  cylinder(b, tw.x, tw.z, 5.4, 5.8, 38, 41.6, 8, C('#28343a'), { top: false });
  cylinder(P.get('lights'), tw.x, tw.z, 5.45, 5.85, 38.4, 41.2, 8, C('#9fd3c9'), { top: false });
  cylinder(b, tw.x, tw.z, 6.2, 6.2, 41.6, 42.4, 8, C('#d4cfc3'));
  cylinder(b, tw.x, tw.z, 0.12, 0.08, 42.4, 47, 4, C('#9a9a94'), { top: false });
  ctx.beacon(P, tw.x, 47.2, tw.z, 0.7);
  ctx.box(tw.x - 3.2, tw.z - 3.2, tw.x + 3.2, tw.z + 3.2, 42);
  ctx.box(tw.x - 9, tw.z - 5, tw.x + 5, tw.z + 6, 6.8);

  // landside: access road from 16th St, curb road, parking lot, entrance sign
  surface(P, { x0: land.x0, x1: TM.x1 + 8, z0: -806, z1: -796 }, 'asphalt', 8, { across: 10 });
  surface(P, { x0: TM.x0, x1: TM.x1, z0: TM.z1 + 7, z1: -806 }, 'plaza', 6, { across: 6, tint: '#d4d0c6' });
  const lot = { x0: 474, x1: 640, z0: -793, z1: land.z1 - 1 };
  surface(P, lot, 'parking', 10.8, { across: (lot.z1 - lot.z0) / 3 });
  for (let row = 0; row < 3; row++) {
    const z = lot.z0 + (row + 0.5) * ((lot.z1 - lot.z0) / 3);
    for (let x = lot.x0 + 1.4; x < lot.x1 - 1; x += 2.7) if (ctx.rng() < 0.35) ctx.park(x, z, row % 2 ? 0 : Math.PI);
  }
  for (const x of [lot.x0 + 2, (lot.x0 + lot.x1) / 2, lot.x1 - 2]) lamp(P, x, lot.z0 + 0.5, { style: 'cobra', h: 9, rot: Math.PI });
  postSign(P, 'eppley', land.x0 + 6, -812, 9, Math.PI / 2, { post: '#3b3b3b', y: 0.6, twoSided: true });
  for (const [x, z] of [[420, -830], [440, -790], [455, -826], [650, -790], [668, -800]]) tree(P, x, z, { h: 8 + ctx.rng() * 3, kind: 'round' });
}

// ------------------------------------------------------------------ radar antenna (rotating)
function radarAntenna(ctx) {
  const x = 410;
  const z = -1150;
  const P = ctx.cluster('eppley-radar');
  const b = P.get('solid');
  for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]]) beam(b, x + dx, 0, z + dz, x + dx * 0.4, 12, z + dz * 0.4, 0.2, C('#c9c9c2'));
  box(b, x - 0.9, 12, z - 0.9, x + 0.9, 13, z + 0.9, C('#9a9a94'));
  ctx.box(x - 1.8, z - 1.8, x + 1.8, z + 1.8, 13);
  P.flush();
  const g = new ctx.Builder();
  box(g, -3.6, 0, -0.25, 3.6, 1.8, 0.25, C('#e0e0da'));
  box(g, -0.3, -0.3, -0.3, 0.3, 0, 0.3, C('#5f6164'));
  const mesh = new THREE.Mesh(g.geometry(), ctx.M.solid);
  mesh.name = 'lm:eppley:radar';
  mesh.position.set(x, 13.3, z);
  ctx.group.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ the jet: land on 32, take off on 14
function flyingJet(ctx, radar) {
  const jb = jetGeometry(ctx.Builder, { body: '#f0f0ec', stripe: '#1f4e9c', tail: '#1f4e9c', belly: '#b9bec3' });
  const jet = new THREE.Mesh(jb.geometry(), ctx.M.shiny);
  jet.name = 'lm:eppley:jet';
  jet.rotation.order = 'YXZ';
  jet.visible = false;
  ctx.group.add(jet);
  // navigation lights: red left wingtip, green right, white tail, landing light at the nose
  const lights = { pos: [-14, 2.4, 5, 14, 2.4, 5, 0, 10, 15.5, 0, 1.6, -16], col: [], size: [5, 5, 4, 12] };
  for (const c of ['#ff2a1a', '#2aff5a', '#ffffff', '#fff6dc']) {
    const k = new THREE.Color(c);
    lights.col.push(k.r, k.g, k.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lights.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(lights.col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(lights.size, 1));
  const lm = glowMaterial(ctx.T.glow, 0);
  const pts = new THREE.Points(g, lm);
  pts.frustumCulled = false;
  jet.add(pts);

  // timeline (seconds)
  const APP = 1600; // approach starts this far out beyond the 32 threshold
  const TD = RWY.len - 45; // touchdown point (u)
  const VAPP = 72;
  const tApp = (APP + 45) / VAPP;
  const vTaxi = 9;
  const uStop = 60;
  const tRoll = (2 * (TD - uStop)) / (VAPP + vTaxi);
  const aRoll = (VAPP - vTaxi) / tRoll;
  const uTurn = 25;
  const tTaxi = (uStop - uTurn) / vTaxi;
  const tTurn = 9;
  const RT = 7; // turn radius
  const tHold = 8;
  const aTo = 8.5;
  const vRot = 72;
  const tTo = vRot / aTo;
  const tClimb = 28;
  const tGap = 32;
  const phases = [tApp, tRoll, tTaxi, tTurn, tHold, tTo, tClimb, tGap];
  const cycle = phases.reduce((s, x) => s + x, 0);
  const st = { t: tApp * 0.35, phase: '', x: 0, y: 0, z: 0 };
  ctx.jet = st;

  const place = (u, v, y, heading, pitch = 0, roll = 0) => {
    const [x, z] = rw(u, v);
    jet.position.set(x, y, z);
    jet.rotation.set(pitch, heading, roll);
    st.x = x;
    st.y = y;
    st.z = z;
  };

  ctx.addUpdater((dt, state) => {
    radar.rotation.y += dt * 1.6;
    st.t = (st.t + dt) % cycle;
    let t = st.t;
    lm.opacity = Math.min(1, 0.25 + state.night * 1.2);
    jet.visible = true;
    let landing = false;
    if (t < tApp) {
      // final approach from the south-east over Iowa and the river, flare at the threshold
      const u = RWY.len + APP - VAPP * t;
      const f = Math.max(0, (u - TD) / (APP + 45));
      const alt = f < 0.03 ? 140 * 0.03 * (f / 0.03) ** 2 : 140 * f;
      place(u, 0, alt, H32, f < 0.03 ? 0.09 : 0.045);
      st.phase = 'approach';
      landing = true;
    } else if ((t -= tApp) < tRoll) {
      const u = TD - (VAPP * t - 0.5 * aRoll * t * t);
      place(u, 0, 0, H32, t < 1 ? 0.06 * (1 - t) : 0);
      st.phase = 'rollout';
      landing = t < 3;
    } else if ((t -= tRoll) < tTaxi) {
      const k = t / tTaxi;
      place(uStop - vTaxi * t, -RT * k, 0, H32);
      st.phase = 'taxi';
    } else if ((t -= tTaxi) < tTurn) {
      // 180° turn on the turning pad at the north-west end
      const phi = (t / tTurn) * Math.PI;
      place(uTurn - RT * Math.sin(phi), -RT * Math.cos(phi), 0, H32 + phi);
      st.phase = 'turn';
    } else if ((t -= tTurn) < tHold) {
      place(uTurn, RT, 0, H14);
      st.phase = 'hold';
    } else if ((t -= tHold) < tTo) {
      // takeoff roll on 14, lining up on the centreline in the first seconds
      const u = uTurn + 0.5 * aTo * t * t;
      const v = RT * Math.max(0, 1 - t / 3);
      const rot = t > tTo - 1.2 ? (t - (tTo - 1.2)) / 1.2 : 0;
      place(u, v, 0, H14, 0.14 * rot);
      st.phase = 'takeoff';
      landing = true;
    } else if ((t -= tTo) < tClimb) {
      // climb out south-east over the river toward Iowa
      const u0 = uTurn + 0.5 * aTo * tTo * tTo;
      const u = u0 + vRot * t + 0.4 * t * t;
      const alt = 3.5 * t + 0.22 * t * t;
      place(u, 0, alt, H14, 0.16 - Math.min(0.06, t * 0.004), 0);
      st.phase = 'climb';
      landing = t < 12;
    } else {
      jet.visible = false;
      st.phase = 'gone';
    }
    // landing light only near the ground
    lights.size[3] = landing ? 14 : 0.001;
    g.attributes.aSize.array[3] = lights.size[3];
    g.attributes.aSize.needsUpdate = true;
  });
}

void flat;
void oboxCollider;
void rotPt;
