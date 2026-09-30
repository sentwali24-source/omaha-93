import { rgb, shade } from './batch.js';
import { FT } from '../textures.js';
import { blob, cone } from './kit.js';

// Cheap low-detail continuation of the city beyond the playable bounds to the west, north and
// south (never east: the river and Iowa belong to the landmarks module). Rows of flat-shaded
// houses along continued streets, tree clusters and two water towers, fading into the fog.

const HOUSE_COLS = ['#d8d4c8', '#d8ccb0', '#c8d0c0', '#b8c4cc', '#c8c0b0', '#a8aca8', '#d0c0b0'];
const ROOF_COLS = ['#4d4a46', '#5a524a', '#3e4042', '#5a5e56'];

export function buildHorizon(C, depth = 700) {
  const { L, B } = C;
  const bounds = L.bounds;
  const r = C.rng.next;
  const low = C.detail === 0;
  const asphalt = C.s('asphalt2', '#d0d0d0');
  const white = FT.white;
  const roofT = FT.roofShingle;

  // regions: [x0, z0, x1, z1]
  const west = [bounds.minX - depth, bounds.minZ - depth, bounds.minX - 6, bounds.maxZ + depth];
  const north = [bounds.minX - 6, bounds.minZ - depth, 700, bounds.minZ - 6];
  const south = [bounds.minX - 6, bounds.maxZ + 6, 560, bounds.maxZ + depth];

  // street lines: continue the real NS streets north/south, EW streets west; add a synthetic grid
  const nsX = L.nsStreets.map((s) => s.x);
  for (let x = bounds.minX - 60; x > west[0]; x -= 64) nsX.push(x);
  const ewZ = L.ewStreets.map((s) => s.z);
  for (let z = bounds.minZ - 80; z > north[1]; z -= 90) ewZ.push(z);
  for (let z = bounds.maxZ + 70; z < south[3]; z += 80) ewZ.push(z);
  nsX.sort((a, b) => a - b);
  ewZ.sort((a, b) => a - b);

  const inRegion = (x, z) => [west, north, south].some((g) => x >= g[0] && x <= g[2] && z >= g[1] && z <= g[3]);

  // roads (flat strips, no sidewalks)
  const roadW = 10;
  for (const x of nsX) {
    for (const g of [north, south, west]) {
      if (x < g[0] || x > g[2]) continue;
      for (let z = g[1]; z < g[3]; z += 120) {
        const z1 = Math.min(g[3], z + 120);
        B.at(x, (z + z1) / 2);
        C.ground('surface', x - roadW / 2, z, x + roadW / 2, z1, 0.015, asphalt);
      }
    }
  }
  for (const z of ewZ) {
    for (const g of [west]) {
      if (z < g[1] || z > g[3]) continue;
      for (let x = g[0]; x < g[2]; x += 120) {
        const x1 = Math.min(g[2], x + 120);
        B.at((x + x1) / 2, z);
        C.ground('surface', x, z - roadW / 2, x1, z + roadW / 2, 0.012, asphalt);
      }
    }
    for (const g of [north, south]) {
      if (z < g[1] || z > g[3]) continue;
      for (let x = g[0]; x < g[2]; x += 120) {
        const x1 = Math.min(g[2], x + 120);
        B.at((x + x1) / 2, z);
        C.ground('surface', x, z - roadW / 2, x1, z + roadW / 2, 0.012, asphalt);
      }
    }
  }

  // blocks between the street lines
  let houses = 0;
  for (let i = 0; i < nsX.length - 1; i++) {
    for (let j = 0; j < ewZ.length - 1; j++) {
      const bx0 = nsX[i] + roadW / 2 + 3;
      const bx1 = nsX[i + 1] - roadW / 2 - 3;
      const bz0 = ewZ[j] + roadW / 2 + 3;
      const bz1 = ewZ[j + 1] - roadW / 2 - 3;
      if (bx1 - bx0 < 14 || bz1 - bz0 < 14) continue;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      if (!inRegion(cx, cz)) continue;
      // keep clear of the playable area edge
      if (cx > bounds.minX - 10 && cx < bounds.maxX && cz > bounds.minZ - 10 && cz < bounds.maxZ + 10) continue;
      const dist = Math.max(bounds.minX - cx, bounds.minZ - cz, cz - bounds.maxZ, 0);
      if (low && dist > 420) continue;
      if (dist > 260 && r() < 0.35) continue;
      B.at(cx, cz);
      // houses along the long sides
      const alongZ = bz1 - bz0 > bx1 - bx0;
      const len = alongZ ? bz1 - bz0 : bx1 - bx0;
      const n = Math.max(1, Math.floor(len / (dist > 300 ? 22 : 15)));
      for (const side of [-1, 1]) {
        for (let k = 0; k < n; k++) {
          if (r() < 0.14) continue;
          const t = (k + 0.5) / n;
          const w = 7 + r() * 4;
          const d = 8 + r() * 3;
          const h = 3.2 + r() * 3.5;
          let x;
          let z;
          if (alongZ) {
            x = side < 0 ? bx0 + 5 + d / 2 : bx1 - 5 - d / 2;
            z = bz0 + len * t;
          } else {
            x = bx0 + len * t;
            z = side < 0 ? bz0 + 5 + d / 2 : bz1 - 5 - d / 2;
          }
          const hx = alongZ ? d / 2 : w / 2;
          const hz = alongZ ? w / 2 : d / 2;
          const col = rgb(HOUSE_COLS[Math.floor(r() * HOUSE_COLS.length)]);
          B.tile = white;
          B.color = col;
          B.box('facade', x - hx, 0, z - hz, x + hx, h, z + hz, { all: { tile: white, color: col, tw: 4, th: 4 }, py: false });
          // pyramid-ish roof (4 triangles)
          B.tile = roofT;
          B.color = rgb(ROOF_COLS[Math.floor(r() * ROOF_COLS.length)]);
          const ry = h + 1.6 + r();
          const o = 0.3;
          const a = [x - hx - o, h, z - hz - o];
          const b2 = [x + hx + o, h, z - hz - o];
          const c = [x + hx + o, h, z + hz + o];
          const d2 = [x - hx - o, h, z + hz + o];
          const top = [x, ry, z];
          B.tri('facade', ...b2, ...a, ...top, 0, 0, 1, 0, 0.5, 1);
          B.tri('facade', ...c, ...b2, ...top, 0, 0, 1, 0, 0.5, 1);
          B.tri('facade', ...d2, ...c, ...top, 0, 0, 1, 0, 0.5, 1);
          B.tri('facade', ...a, ...d2, ...top, 0, 0, 1, 0, 0.5, 1);
          houses++;
        }
      }
      // tree clusters
      const nt = low ? 1 : dist > 300 ? 2 : 3;
      for (let k = 0; k < nt; k++) {
        const tx = bx0 + 6 + r() * (bx1 - bx0 - 12);
        const tz = bz0 + 6 + r() * (bz1 - bz0 - 12);
        const s = 1.2 + r() * 0.8;
        const g = rgb(['#557a33', '#4d6e2e', '#627f36'][Math.floor(r() * 3)]);
        if (r() < 0.2) cone(C, 'facade', tx, 1.5, tz, 2.6 * s, 6 * s, 5, shade(g, 0.8), r);
        else blob(C, 'facade', tx, 4.5 * s, tz, 3.6 * s, 3.0 * s, 3.6 * s, g, r, 0.25);
      }
    }
  }
  // water towers
  waterTower(C, bounds.minX - 260, -420, 34);
  waterTower(C, 180, bounds.minZ - 330, 30);
  if (!low) waterTower(C, bounds.minX - 420, 180, 28);
  return houses;
}

function waterTower(C, x, z, h) {
  const B = C.B;
  B.at(x, z);
  const steel = C.f('metalPlain', '#b8bcbe');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    B.cylinder('facade', x + Math.cos(a) * 3.2, z - Math.sin(a) * 3.2, 0, h - 5, 0.25, 0.22, 4, steel, false);
  }
  B.cylinder('facade', x, z, 0, h - 5, 0.6, 0.6, 6, steel, false);
  const tank = C.f('tank', '#e8ecee');
  B.cylinder('facade', x, z, h - 6, h - 5, 3.2, 6.5, 12, tank, false);
  B.cylinder('facade', x, z, h - 5, h + 1, 6.5, 6.5, 12, tank, false);
  B.cylinder('facade', x, z, h + 1, h + 3.5, 6.5, 0.8, 12, tank, true);
  C.box(x - 3.5, z - 3.5, x + 3.5, z + 3.5, h, 0, 'building');
}
