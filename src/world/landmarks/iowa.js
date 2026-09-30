import { C, shade, jitter, box, block, cylinder, gableRoof, pyramid, lawn, surface, strip, beam } from './kit.js';
import { tree, railcar, sign } from './props.js';
import { createRng } from '../../core/rng.js';

// Across the river (x > 1000): the Iowa shore — flooded cottonwood banks, the low Council
// Bluffs skyline (8-story Hotel Chieftain, church spires, a water tower, Bluffs Run greyhound
// park lit up at night), the Union Pacific transfer yard, and the Loess Hills bluffs rising
// behind the town, out to ~2.5 km. Scenery only: no colliders.

export const IY = 1.4; // Iowa floodplain ground level (the river runs at 1.1)
const BLUFF_X = 1440;
const Z0 = -1900;
const Z1 = 1100;

export function buildIowa(ctx) {
  shore(ctx);
  town(ctx);
  bluffs(ctx);
}

// ------------------------------------------------------------------ shore
function shore(ctx) {
  const P = ctx.cluster('iowa-shore');
  const rng = ctx.rng;
  lawn(P, { x0: 1000, x1: BLUFF_X + 40, z0: Z0, z1: Z1 }, '#6f8043', IY, 1 / 20);
  // muddy bank face just above the flood line
  P.get('solid').quad(999.5, 0.9, Z0, 999.5, 0.9, Z1, 999.5, IY + 0.02, Z1, 999.5, IY + 0.02, Z0, C('#6a5a44'));
  // cottonwoods and willows along the bank, some standing in the flood water
  const step = ctx.detail === 0 ? 22 : ctx.detail === 1 ? 13 : 9;
  for (let z = Z0 + 10; z < Z1 - 10; z += step * (0.6 + rng() * 0.8)) {
    if (Math.abs(z - 39) < 22 || Math.abs(z + 300) < 16) continue; // bridge landings
    // flooded willows standing in the water, then the cottonwood bank line
    if (rng() < 0.35) tree(P, 985 + rng() * 13, z + rng() * 6, { h: 7 + rng() * 5, kind: 'round', collide: false, lod: 0, leaf: '#6a7f3a' });
    tree(P, 1000 + rng() * 22, z, { h: 12 + rng() * 9, kind: rng() < 0.6 ? 'cottonwood' : 'round', collide: false, lod: 0, leaf: rng() < 0.5 ? '#50682f' : '#5f7736' });
    tree(P, 1018 + rng() * 30, z + rng() * 8, { h: 10 + rng() * 8, kind: 'cottonwood', collide: false, lod: 0 });
    if (rng() < 0.5) tree(P, 1050 + rng() * 60, z + rng() * 10, { h: 9 + rng() * 7, kind: 'broad', collide: false, lod: 0 });
  }
  P.flush();
}

// ------------------------------------------------------------------ Council Bluffs
const NS = [1120, 1200, 1280, 1360, 1440];
const EW = [-540, -420, -300, -180, -60, 39, 160, 280, 400, 520, 640, 760];
const DOWNTOWN = { x0: 1200, x1: 1440, z0: -180, z1: 280 };

function town(ctx) {
  const P = ctx.cluster('iowa-town');
  const rng = createRng(11993).next;
  const b = P.get('solid');
  // streets
  for (const x of NS) strip(P, 'asphalt', x, -700, x, 900, 12, 8, { y: IY + 0.06 });
  for (const z of EW) strip(P, 'asphalt', 1070, z, BLUFF_X + 10, z, z === 39 ? 18 : 12, 8, { y: IY + 0.06 });
  // Broadway street lights marching toward the bluffs
  for (let x = 1080; x < BLUFF_X; x += 26) {
    ctx.glow(x, IY + 7, 39 - 8, '#ffcf82', 5);
    ctx.glow(x + 13, IY + 7, 39 + 8, '#ffcf82', 5);
    cylinder(b, x, 31, 0.12, 0.08, IY, IY + 7, 4, C('#8a8d8e'), { top: false });
  }
  const houseCap = ctx.detail === 0 ? 70 : ctx.detail === 1 ? 170 : 280;
  let houses = 0;
  const brick = ['#9a5a45', '#8e4f3c', '#a8765a', '#b08a66', '#7d5140', '#c2a27a'];
  for (let i = -1; i < NS.length; i++) {
    const xa = i < 0 ? 1050 : NS[i] + 6;
    const xb = i + 1 < NS.length ? NS[i + 1] - 6 : BLUFF_X - 10;
    for (let j = -1; j < EW.length; j++) {
      const za = j < 0 ? -700 : EW[j] + (EW[j] === 39 ? 9 : 6);
      const zb = j + 1 < EW.length ? EW[j + 1] - (EW[j + 1] === 39 ? 9 : 6) : 900;
      const cx = (xa + xb) / 2;
      const cz = (za + zb) / 2;
      if (cx < 1100 && cz > -380 && cz < -220) continue; // rail yard
      if (cx < 1200 && cz > 460 && cz < 700) continue; // Bluffs Run
      const downtown = cx > DOWNTOWN.x0 && cx < DOWNTOWN.x1 && cz > DOWNTOWN.z0 && cz < DOWNTOWN.z1;
      if (downtown) {
        // brick commercial blocks along the frontages
        for (const side of [0, 1]) {
          let x = xa + 1;
          while (x < xb - 8) {
            const w = 10 + rng() * 14;
            const x2 = Math.min(xb - 1, x + w);
            const d = 18 + rng() * 10;
            const h = 7 + Math.floor(rng() * 3) * 3.6;
            const z0 = side ? zb - d : za;
            const z1 = side ? zb : za + d;
            const tint = brick[Math.floor(rng() * brick.length)];
            block(P, { mat: 'lowrise', row: 'storefront', tile: 8, tint }, x, z0, x2, z1, IY, IY + 4.4, null);
            block(P, { mat: 'masonry', tint, bay: 3.2, floor: 3.6, base: IY + 4.4 }, x, z0, x2, z1, IY + 4.4, IY + h, C('#56524d'));
            box(b, x - 0.2, IY + h - 0.4, z0 - 0.2, x2 + 0.2, IY + h + 0.3, z1 + 0.2, shade(C(tint), 1.2));
            x = x2 + (rng() < 0.3 ? 4 : 0.3);
          }
        }
      } else {
        // houses along the north and south frontages
        for (const side of [0, 1]) {
          for (let x = xa + 4; x < xb - 10 && houses < houseCap; x += 17 + rng() * 6) {
            if (rng() < 0.18) continue;
            const w = 8 + rng() * 3;
            const d = 10 + rng() * 3;
            const z0 = side ? zb - 6 - d : za + 6;
            const hw = 5.5 + (rng() < 0.4 ? 2.6 : 0);
            const col = ['#f2efe6', '#e9dfb8', '#b9c3c7', '#c9d1bf', '#e6d2c0', '#d8d8d2'][Math.floor(rng() * 6)];
            if (ctx.detail > 0) block(P, { mat: 'lowrise', row: 'siding', tile: 8, tint: col }, x, z0, x + w, z0 + d, IY, IY + hw, null);
            else box(b, x, IY, z0, x + w, IY + hw, z0 + d, C(col), { top: false });
            gableRoof(b, x, z0, x + w, z0 + d, IY + hw, 2.8, 'x', jitter(C('#4a4440'), rng, 0.2), C(col), 0.5);
            houses++;
            if (rng() < 0.7) tree(P, x + w + 3, z0 + d / 2 + (rng() - 0.5) * 6, { h: 8 + rng() * 5, collide: false, lod: 0 });
          }
        }
      }
    }
  }
  // Hotel Chieftain (1927): 8 stories of brick with a lit rooftop sign, near Pearl & Broadway
  const hc = { x0: 1288, x1: 1312, z0: 50, z1: 72 };
  block(P, { mat: 'lowrise', row: 'storefront', tile: 8, tint: '#a0634c' }, hc.x0, hc.z0, hc.x1, hc.z1, IY, IY + 5, null);
  block(P, { mat: 'masonry', tint: '#a0634c', bay: 3, floor: 3.1, base: IY + 5 }, hc.x0, hc.z0, hc.x1, hc.z1, IY + 5, IY + 27, C('#55504a'));
  box(b, hc.x0 - 0.4, IY + 26.2, hc.z0 - 0.4, hc.x1 + 0.4, IY + 27.4, hc.z1 + 0.4, C('#d7c6a6'));
  // rooftop sign facing Omaha across the river
  const scx = (hc.x0 + hc.x1) / 2;
  for (const z of [hc.z0 + 2.5, hc.z1 - 2.5]) box(b, scx - 0.2, IY + 27.4, z - 0.2, scx + 0.2, IY + 32.4, z + 0.2, C('#333'));
  sign(P, 'chieftain', scx, IY + 30.4, (hc.z0 + hc.z1) / 2, 18, 0, Math.PI / 2, { twoSided: true });
  // Bennett Building + a couple of taller downtown blocks
  block(P, { mat: 'masonry', tint: '#b58a64', bay: 3, floor: 3.3 }, 1330, 52, 1346, 70, IY, IY + 20, C('#57524c'));
  block(P, { mat: 'office', tint: '#c9c2b4', bay: 3.2, floor: 3.5 }, 1372, -40, 1398, -20, IY, IY + 18, C('#57524c'));
  // church spires
  church(P, 1254, -118, 38, '#b99b78', rng);
  church(P, 1392, 214, 32, '#9c5d48', rng);
  church(P, 1180, 330, 27, '#d8d2c4', rng);
  // water tower
  const wt = [1418, -318];
  for (const [dx, dz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) beam(b, wt[0] + dx, IY, wt[1] + dz, wt[0] + dx * 0.6, IY + 26, wt[1] + dz * 0.6, 0.4, C('#9aa7b0'));
  cylinder(b, wt[0], wt[1], 1, 1, IY, IY + 27, 6, C('#9aa7b0'));
  cylinder(b, wt[0], wt[1], 5.5, 5.5, IY + 26, IY + 32, 10, C('#b8c8d2'), { top: false });
  cylinder(b, wt[0], wt[1], 5.5, 0.6, IY + 32, IY + 34.5, 10, C('#a9bac5'));
  ctx.beacon(P, wt[0], IY + 35, wt[1], 0.6);
  // Union Pacific transfer yard + grain elevator on the Iowa side
  for (let k = 0; k < 5; k++) {
    const z = -345 + k * 9;
    strip(P, 'rail', 1060, z, 1300, z, 3.2, 4, { y: IY + 0.08 });
    let x = 1070 + rng() * 40;
    while (x < 1280) {
      if (rng() < 0.55) {
        const n = 3 + Math.floor(rng() * 6);
        for (let i = 0; i < n && x < 1285; i++) {
          railcar(P, x, z, Math.PI / 2, rng);
          x += 16.6;
        }
      }
      x += 30 + rng() * 40;
    }
  }
  const el = { x0: 1300, z0: -350, n: 6 };
  for (let i = 0; i < el.n; i++) cylinder(b, el.x0 + i * 6.4, el.z0, 3.3, 3.3, IY, IY + 30, 10, C('#cfc9bc'));
  block(P, { mat: 'lowrise', row: 'stoneslit', tile: 6, tint: '#d2ccbf' }, el.x0 - 10, el.z0 - 4, el.x0 - 3, el.z0 + 4, IY, IY + 40, C('#8f8a80'));
  // Bluffs Run greyhound park (1986): grandstand, oval, big lit sign
  const br = { x0: 1060, x1: 1180, z0: 470, z1: 690 };
  surface(P, { x0: br.x0, x1: br.x1, z0: br.z0, z1: br.z0 + 60 }, 'parking', 10.8, { across: 6, y: IY + 0.06 });
  block(P, { mat: 'lowrise', row: 'terminal', tile: 8 }, br.x0 + 20, br.z0 + 64, br.x1 - 20, br.z0 + 84, IY, IY + 12, null);
  gableRoof(b, br.x0 + 18, br.z0 + 62, br.x1 - 18, br.z0 + 86, IY + 12, 2.5, 'x', C('#d6d6d0'), C('#c8c8c2'), 1);
  const oc = { x: (br.x0 + br.x1) / 2, z: br.z0 + 140 };
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 1) / 24) * Math.PI * 2;
    strip(P, 'dirt', oc.x + Math.cos(a0) * 45, oc.z + Math.sin(a0) * 40, oc.x + Math.cos(a1) * 45, oc.z + Math.sin(a1) * 40, 7, 8, { y: IY + 0.07 });
  }
  sign(P, 'bluffsrun', br.x0 + 18, IY + 16, br.z0 + 50, 18, 0, Math.PI / 2, { twoSided: true });
  cylinder(b, br.x0 + 18, br.z0 + 50, 0.4, 0.4, IY, IY + 12, 6, C('#555'));
  for (let x = br.x0 + 10; x < br.x1; x += 22) ctx.glow(x, IY + 9, br.z0 + 30, '#ffe0a0', 6);
  P.flush();
}

function church(P, x, z, spire, tint, rng) {
  const b = P.get('solid');
  const c = C(tint);
  block(P, { mat: 'solid', color: c }, x - 7, z - 14, x + 7, z + 14, IY, IY + 10, null);
  gableRoof(b, x - 7, z - 14, x + 7, z + 14, IY + 10, 6, 'z', C('#3f3d3b'), c, 0.4);
  block(P, { mat: 'solid', color: shade(c, 0.95) }, x - 3.5, z - 21, x + 3.5, z - 14, IY, IY + spire * 0.5, C('#3f3d3b'));
  pyramid(b, x - 3.5, z - 21, x + 3.5, z - 14, IY + spire * 0.5, spire * 0.5 * (0.9 + rng() * 0.2), C('#4a4f52'));
}

// ------------------------------------------------------------------ Loess Hills
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash2(x, z) {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Height of the bluffs (world y) at (x, z). */
export function bluffHeight(x, z) {
  const face = smooth(BLUFF_X, BLUFF_X + 170, x);
  const ridge = 58 + 30 * smooth(BLUFF_X + 170, 2300, x);
  const fingers = 14 * Math.sin(z / 48 + Math.sin(x / 70) * 2.2) * smooth(BLUFF_X + 40, BLUFF_X + 260, x);
  const valley = -34 * Math.pow(Math.max(0, Math.sin(z / 240 + 1.3 + x / 900)), 10);
  const n = (hash2(Math.round(x / 35), Math.round(z / 50)) - 0.5) * 10;
  return IY + face * Math.max(0, ridge + fingers + valley + n);
}

function bluffs(ctx) {
  const P = ctx.cluster('iowa-bluffs');
  const b = P.get('solid');
  const x0 = BLUFF_X - 20;
  const x1 = 2560;
  const nx = ctx.detail === 0 ? 22 : 34;
  const nz = ctx.detail === 0 ? 44 : 70;
  const H = [];
  for (let i = 0; i <= nx; i++) {
    const row = [];
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let j = 0; j <= nz; j++) row.push(bluffHeight(x, Z0 + ((Z1 - Z0) * j) / nz));
    H.push(row);
  }
  const woods = C('#3d5a2c');
  const woods2 = C('#4a6532');
  const prairie = C('#8d9657');
  const rng = ctx.rng;
  for (let i = 0; i < nx; i++) {
    const xa = x0 + ((x1 - x0) * i) / nx;
    const xb = x0 + ((x1 - x0) * (i + 1)) / nx;
    for (let j = 0; j < nz; j++) {
      const za = Z0 + ((Z1 - Z0) * j) / nz;
      const zb = Z0 + ((Z1 - Z0) * (j + 1)) / nz;
      const h00 = H[i][j];
      const h10 = H[i + 1][j];
      const h01 = H[i][j + 1];
      const h11 = H[i + 1][j + 1];
      const avg = (h00 + h10 + h01 + h11) / 4;
      const slope = (Math.abs(h10 - h00) + Math.abs(h11 - h01)) / (xb - xa) + (Math.abs(h01 - h00) + Math.abs(h11 - h10)) / (zb - za);
      let c;
      if (avg < IY + 1) c = C('#6f8043');
      else if (slope < 0.35 && avg > 60) c = jitter(prairie, rng, 0.1);
      else c = jitter(rng() < 0.5 ? woods : woods2, rng, 0.12);
      // two triangles, both facing up (walk (xa,zb) → (xb,zb) → (xb,za) → (xa,za))
      b.tri(xa, h01, zb, xb, h11, zb, xb, h10, za, c);
      b.tri(xa, h01, zb, xb, h10, za, xa, h00, za, shade(c, 0.96));
    }
  }
  // radio masts on the ridge with stacked red beacons (the night horizon)
  for (const [mx, mz] of [[1690, -420], [1760, 150], [1705, 640]]) {
    const gy = bluffHeight(mx, mz);
    const top = gy + 110;
    cylinder(b, mx, mz, 0.9, 0.3, gy, top, 4, C('#b9b3aa'));
    for (let k = 1; k <= 3; k++) ctx.beacon(P, mx, gy + (110 * k) / 3, mz, 1.2);
  }
  P.flush();
}

