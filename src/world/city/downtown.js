import { Frame, rgb, shade } from './batch.js';
import { faces, panel, walls, top, lbox, facePoint, tree, fenceRun } from './kit.js';
import { buildStorefront, buildParkingLot, dumpster } from './commercial.js';
import { lotGround } from './houses.js';
import { blockStrips, stripLots, groundAvoid, fitLot } from './blocks.js';
import { Y } from './context.js';
import { FT } from '../textures.js';
import { LANDMARKS } from '../../data/map.js';
import { BUSINESSES } from './names.js';

// Downtown office blocks (mid/high-rises, parking garages, surface lots), Old Market warehouses
// with canopies and ghost ads, North Downtown / East Omaha industry (warehouses, docks, tanks,
// rail spurs, grain elevators), riverfront grass, leftovers of landmark blocks and set hangouts.

const pick = (r, a) => a[Math.floor(r() * a.length)];

/** Lot-like object for a world rect with its front on `side`. */
export function rectLot(rect, side, blk) {
  const [x0, z0, x1, z1] = rect;
  let F;
  let w;
  let d;
  if (side === 'n') {
    F = new Frame((x0 + x1) / 2, z0, 0, -1);
    w = x1 - x0;
    d = z1 - z0;
  } else if (side === 's') {
    F = new Frame((x0 + x1) / 2, z1, 0, 1);
    w = x1 - x0;
    d = z1 - z0;
  } else if (side === 'w') {
    F = new Frame(x0, (z0 + z1) / 2, -1, 0);
    w = z1 - z0;
    d = x1 - x0;
  } else {
    F = new Frame(x1, (z0 + z1) / 2, 1, 0);
    w = z1 - z0;
    d = x1 - x0;
  }
  return { F, w, d, rect: [x0, z0, x1, z1], side, block: blk };
}

/** World-axis faces of a rect: n s w e with left-end/along/normal (like kit faces). */
function worldFaces(x0, z0, x1, z1) {
  return {
    n: { ax: x1, az: z0, dx: -1, dz: 0, nx: 0, nz: -1, len: x1 - x0 },
    s: { ax: x0, az: z1, dx: 1, dz: 0, nx: 0, nz: 1, len: x1 - x0 },
    w: { ax: x0, az: z0, dx: 0, dz: 1, nx: -1, nz: 0, len: z1 - z0 },
    e: { ax: x1, az: z1, dx: 0, dz: -1, nx: 1, nz: 0, len: z1 - z0 },
  };
}

const IDENT = new Frame(0, 0, 0, -1); // u = x, v = z

/** Convert a world face to a kit face in the identity frame. */
function kf(wf) {
  return { ou: wf.ax, ov: wf.az, du: wf.dx, dv: wf.dz, nu: wf.nx, nv: wf.nz, len: wf.len };
}

function signOn(C, face, s, w, y0, y1, cell, off = 0.08) {
  const c = C.cells.get(cell);
  if (!c) return;
  const a = facePoint(IDENT, face, s - w / 2, off);
  const b = facePoint(IDENT, face, s + w / 2, off);
  C.B.color = rgb('#ffffff');
  C.B.quadUV('signs', a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
}

/** Parapet (inner faces + cap) around a world rect roof at h. */
function roofParapet(C, x0, z0, x1, z1, h, ph, st, cap) {
  const t = 0.3;
  const B = C.B;
  B.tile = st.tile;
  B.color = st.color;
  // inner faces (normals pointing inward)
  B.wall('facade', x0 + t, z0 + t, x1 - t, z0 + t, h, h + ph, st.tw, st.th, 0, 0); // faces +z
  B.wall('facade', x1 - t, z1 - t, x0 + t, z1 - t, h, h + ph, st.tw, st.th, 0, 0); // faces -z
  B.wall('facade', x0 + t, z1 - t, x0 + t, z0 + t, h, h + ph, st.tw, st.th, 0, 0); // faces +x
  B.wall('facade', x1 - t, z0 + t, x1 - t, z1 - t, h, h + ph, st.tw, st.th, 0, 0); // faces -x
  B.tile = cap.tile;
  B.color = cap.color;
  B.flat('facade', x0, z0, x1, z0 + t, h + ph, cap.tw);
  B.flat('facade', x0, z1 - t, x1, z1, h + ph, cap.tw);
  B.flat('facade', x0, z0 + t, x0 + t, z1 - t, h + ph, cap.tw);
  B.flat('facade', x1 - t, z0 + t, x1, z1 - t, h + ph, cap.tw);
}

/**
 * Office / commercial building filling a world rect. streetSides: sides that face a paved street.
 * kind: 'concrete' | 'glass' | '1910' | 'garage'. Returns the building height.
 */
function officeBuilding(C, rect, streetSides, kind, H, opts = {}) {
  const r = C.rng.next;
  const B = C.B;
  const [x0, z0, x1, z1] = rect;
  B.at((x0 + x1) / 2, (z0 + z1) / 2);
  const wf = worldFaces(x0, z0, x1, z1);
  const tileName = kind === 'concrete' ? 'office' : kind === 'glass' ? 'glass' : kind === 'garage' ? 'garageDeck' : 'office1910';
  const tint = kind === 'glass' ? pick(r, ['#ffffff', '#e0e8f0', '#f0e8d8']) : kind === '1910' ? pick(r, ['#ffffff', '#f0dcc8', '#e0d0c0', '#d8d0c8']) : pick(r, ['#ffffff', '#f0ece4', '#e4e0d8']);
  const uo = Math.floor(r() * 4) * 0.25;
  const base = kind === 'garage' ? 0 : 5;
  const up = C.f(tileName, tint, uo, base);
  const party = C.f(kind === '1910' ? 'brickBuff' : 'concrete', kind === '1910' ? '#e8d8c8' : '#d8d4cc');
  const ground = kind === '1910' ? C.f('storefront', '#ffffff', 0, 0, [8, 5]) : C.f('lobby', '#ffffff', 0, 0);
  for (const side of ['n', 's', 'w', 'e']) {
    const face = kf(wf[side]);
    const street = streetSides.includes(side) || opts.allFaces;
    if (kind === 'garage') {
      panel(C, 'facade', IDENT, face, 0, face.len, 0, H, street ? up : party, 0);
      continue;
    }
    if (street) {
      panel(C, 'facade', IDENT, face, 0, face.len, 0, base, ground, 0);
      panel(C, 'facade', IDENT, face, 0, face.len, base, H, up, 0);
    } else {
      panel(C, 'facade', IDENT, face, 0, face.len, 0, H, party, 0);
    }
  }
  B.tile = FT.roofTar;
  B.color = rgb('#ffffff');
  B.flat('facade', x0, z0, x1, z1, H, 6);
  const ph = kind === 'glass' ? 1.2 : 1.0;
  const parSt = kind === 'glass' ? C.f('dark', '#ffffff') : kind === '1910' ? C.f('brickBuff', tint) : C.f('concrete', '#d0ccc4');
  // outer parapet walls (continuation of the facade)
  for (const side of ['n', 's', 'w', 'e']) panel(C, 'facade', IDENT, kf(wf[side]), 0, wf[side].len, H, H + ph, parSt, 0);
  roofParapet(C, x0, z0, x1, z1, H, ph, parSt, C.f('concrete', '#c8c4bc'));
  if (kind === '1910' && C.detail > 0) {
    // projecting cornice
    lbox(C, 'facade', IDENT, x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, H + ph - 0.2, H + ph + 0.5, C.f('concrete', '#e0d8c8'), C.f('concrete', '#e0d8c8'));
    // wooden water tank on steel legs
    if (r() < 0.45) {
      const tx = x0 + (x1 - x0) * (0.3 + r() * 0.4);
      const tz = z0 + (z1 - z0) * (0.3 + r() * 0.4);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cylinder('facade', tx + dx * 1.3, tz + dz * 1.3, H, H + 3, 0.1, 0.1, 4, C.f('dark', '#ffffff'), false);
      B.cylinder('facade', tx, tz, H + 3, H + 6.5, 2.1, 2.0, 10, C.f('planks', '#8a6a4a', 0, 0, [2.4, 2.4]), true);
      B.cylinder('facade', tx, tz, H + 6.5, H + 7.6, 2.1, 0.2, 10, C.f('roofTar', '#6a6a6a'), false);
    }
  }
  if (kind !== 'garage') {
    // mechanical penthouse
    const pw = (x1 - x0) * (0.3 + r() * 0.25);
    const pd = (z1 - z0) * (0.3 + r() * 0.25);
    const pcx = (x0 + x1) / 2 + (r() - 0.5) * (x1 - x0 - pw) * 0.5;
    const pcz = (z0 + z1) / 2 + (r() - 0.5) * (z1 - z0 - pd) * 0.5;
    lbox(C, 'facade', IDENT, pcx - pw / 2, pcx + pw / 2, pcz - pd / 2, pcz + pd / 2, H, H + 3.5 + r() * 2, C.f(kind === 'glass' ? 'dark' : 'concrete', '#c8c4bc'), C.f('roofTar', '#ffffff'));
    if (C.detail > 0 && r() < 0.5) lbox(C, 'facade', IDENT, pcx - 1.2, pcx + 1.2, pcz - 1, pcz + 1, H + 3.5, H + 4.6, C.f('metalPlain', '#bfc2c2'), C.f('vent', '#ffffff'));
    if (H > 40 && r() < 0.4) {
      B.cylinder('facade', pcx, pcz, H + 4, H + 16, 0.12, 0.06, 4, C.f('metalPlain', '#9a9a9a'), false);
      C.beacon?.(pcx, H + 16, pcz);
    }
  }
  C.box(x0, z0, x1, z1, H + ph, 0, 'building');
  C.stats.towers++;
  return H;
}

// ------------------------------------------------------------------ downtown
export function buildDowntownBlock(C, blk) {
  const r = C.rng.next;
  const p = C.blockPaved.get(blk.id);
  const { x0, x1, z0, z1 } = blk;
  const bw = x1 - x0;
  const bd = z1 - z0;
  const alongX = bw >= bd;
  const Lh = alongX ? bw : bd;
  // parcel widths
  const widths = [];
  let rem = Lh;
  while (rem > 0) {
    if (rem < 30) {
      widths.push(rem);
      break;
    }
    const w = 16 + r() * 18;
    widths.push(Math.min(w, rem - 12));
    rem -= Math.min(w, rem - 12);
  }
  let s = 0;
  const parcels = [];
  for (const w of widths) {
    const rect = alongX ? [x0 + s, z0, x0 + s + w, z1] : [x0, z0 + s, x1, z0 + s + w];
    s += w;
    const streetSides = [];
    if (p.n && rect[1] <= z0 + 0.1) streetSides.push('n');
    if (p.s && rect[3] >= z1 - 0.1) streetSides.push('s');
    if (p.w && rect[0] <= x0 + 0.1) streetSides.push('w');
    if (p.e && rect[2] >= x1 - 0.1) streetSides.push('e');
    parcels.push({ rect, streetSides });
  }
  const majorSide = (sides) => {
    let best = sides[0];
    for (const sd of sides) if (C.streets.get(blk.frontage[sd])?.major) best = sd;
    return best || 'n';
  };
  let garages = 0;
  for (let i = 0; i < parcels.length; i++) {
    const pc = parcels[i];
    const res = C.isReserved(...pc.rect, ['landmark', 'water', 'park', 'freeway', 'hood']);
    if (res) {
      pc.use = 'skip';
      continue;
    }
    const q = r();
    const front = majorSide(pc.streetSides);
    const [a0, b0, a1, b1] = pc.rect;
    const area = (a1 - a0) * (b1 - b0);
    if (q < 0.27 || area < 300) {
      pc.use = 'lot';
      const lot = rectLot(pc.rect, front, blk);
      buildParkingLot(C, lot, { fill: 0.85 });
      // attendant booth
      if (C.detail > 0) {
        const F = lot.F;
        lbox(C, 'facade', F, lot.w / 2 - 2.2, lot.w / 2 - 0.6, 0.8, 2.4, 0, 2.5, C.f('white', '#e8e4d8'), C.f('roofTar', '#ffffff'));
        const bf = faces(lot.w / 2 - 2.2, lot.w / 2 - 0.6, 0.8, 2.4);
        C.B.tile = FT.winALit;
        C.B.color = rgb('#ffffff');
        panel(C, 'facade', F, bf.front, 0.2, 1.4, 1.1, 2.1, null, 0.03, true);
        const [c0, c1, c2, c3] = F.rect(lot.w / 2 - 2.2, 0.8, lot.w / 2 - 0.6, 2.4);
        C.box(c0, c1, c2, c3, 2.5, 0, 'prop');
      }
      continue;
    }
    if (q < 0.4 && garages < 1) {
      garages++;
      pc.use = 'garage';
      const lv = 4 + Math.floor(r() * 3);
      officeBuilding(C, pc.rect, pc.streetSides, 'garage', lv * 3);
      const wf = worldFaces(...pc.rect);
      const face = kf(wf[front]);
      signOn(C, face, face.len * 0.2, 2.4, 3.4, 4.8, 'parking', 0.08);
      // entrance opening
      C.B.tile = FT.dark;
      C.B.color = rgb('#ffffff');
      panel(C, 'facade', IDENT, face, face.len * 0.3, face.len * 0.3 + 6, 0, 3.2, null, 0.02, true);
      continue;
    }
    pc.use = 'building';
    // height distribution: mostly 20–45 m, a few up to 60 m (Woodmen Tower stays the tallest)
    const hq = r();
    const H = hq < 0.35 ? 12 + r() * 12 : hq < 0.8 ? 22 + r() * 22 : 42 + r() * 18;
    const kind = H < 26 ? (r() < 0.7 ? '1910' : 'concrete') : r() < 0.45 ? 'concrete' : r() < 0.6 ? 'glass' : '1910';
    const setbackTower = H > 36 && a1 - a0 > 24 && b1 - b0 > 24 && r() < 0.6;
    if (setbackTower) {
      const hb = 12 + r() * 8;
      officeBuilding(C, pc.rect, pc.streetSides, kind === 'glass' ? 'concrete' : kind, hb);
      const inset = 3.5;
      officeBuilding(C, [a0 + inset, b0 + inset, a1 - inset, b1 - inset], ['n', 's', 'w', 'e'], kind, H, { allFaces: true });
    } else officeBuilding(C, pc.rect, pc.streetSides, kind, H);
    // storefront signs on 1910-style ground floors
    if (kind === '1910' || H < 26) {
      const biz = C.biz.downtown.next(null);
      const wf = worldFaces(...pc.rect);
      const face = kf(wf[front]);
      signOn(C, face, face.len / 2, Math.min(face.len - 1, 6.5), 3.9, 4.9, `biz:${biz.key}`, 0.1);
      if (biz.poi) {
        const pt = facePoint(IDENT, face, face.len / 2, 1.9);
        C.poi(biz.poi, biz.name, pt.x, pt.z, pt.nx, pt.nz);
        if (biz.poi === 'store') C.zoneHasStore.add(C.zoneId(pt.x, pt.z));
      }
    }
  }
  // blank walls facing surface lots → tag spots; alley dumpsters
  for (let i = 0; i < parcels.length; i++) {
    const pc = parcels[i];
    if (pc.use !== 'building' && pc.use !== 'garage') continue;
    for (const j of [i - 1, i + 1]) {
      const nb = parcels[j];
      if (!nb || nb.use !== 'lot') continue;
      const [a0, b0, a1, b1] = pc.rect;
      const wf = worldFaces(a0, b0, a1, b1);
      const side = alongX ? (j < i ? 'w' : 'e') : j < i ? 'n' : 's';
      const face = wf[side];
      const sEdge = 3 + r() * 3;
      const px = face.ax + face.dx * sEdge;
      const pz = face.az + face.dz * sEdge;
      C.tagSpot(px, 1.7, pz, face.nx, face.nz, 3, 1.8);
      if (face.len > 14) C.tagSpot(face.ax + face.dx * (face.len - sEdge), 1.7, face.az + face.dz * (face.len - sEdge), face.nx, face.nz, 3, 1.8);
    }
  }
}

// ------------------------------------------------------------------ Old Market
export function buildOldMarketBlock(C, blk) {
  const r = C.rng.next;
  const { strips, claimed } = blockStrips(C, blk, () => 'com', { comDepth: () => 16 + r() * 4 });
  // interior courtyard: pavers
  const ix0 = blk.x0 + claimed.w;
  const ix1 = blk.x1 - claimed.e;
  const iz0 = blk.z0 + claimed.n;
  const iz1 = blk.z1 - claimed.s;
  if (ix1 - ix0 > 0.5 && iz1 - iz0 > 0.5) groundAvoid(C, ix0, iz0, ix1, iz1, Y.dirt, C.s('pavers', '#e0d8d0'));
  for (const strip of strips) {
    const lots = stripLots(C, blk, strip, 11, 22);
    const heights = [];
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      if (!fitLot(C, lot, 10)) {
        heights.push(0);
        continue;
      }
      heights.push(oldMarketBuilding(C, lot, strip));
    }
    // ghost ads on side walls that rise above a lower neighbour
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      if (!lot.omInfo) continue;
      for (const [j, key] of [[i - 1, 'a'], [i + 1, 'b']]) {
        const hn = heights[j] ?? 0;
        const h = heights[i];
        if (h - hn < 6.5) continue;
        const forward = strip.side === 'n' || strip.side === 'e';
        const faceKey = (key === 'a') === forward ? 'left' : 'right';
        const face = lot.omInfo.fs[faceKey];
        if (face.len < 9 || r() < 0.35) continue;
        const cell = `ghost:${Math.floor(r() * 6)}`;
        const y0 = Math.max(hn + 0.6, 5);
        const y1 = Math.min(h - 0.5, y0 + face.len * 0.55);
        signPanelF(C, lot.F, face, face.len * 0.12, face.len * 0.88, y0, y1, cell);
      }
    }
  }
}

function signPanelF(C, F, face, s0, s1, y0, y1, cell) {
  const c = C.cells.get(cell);
  if (!c) return;
  const a = facePoint(F, face, s0, 0.03);
  const b = facePoint(F, face, s1, 0.03);
  C.B.color = rgb('#ffffff');
  C.B.quadUV('signs', a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
}

function oldMarketBuilding(C, lot, strip) {
  const r = C.rng.next;
  const B = C.B;
  const { F, w: W, d: D } = lot;
  B.at((lot.rect[0] + lot.rect[2]) / 2, (lot.rect[1] + lot.rect[3]) / 2);
  const floors = 2 + Math.floor(r() * 4);
  const H = 4.4 + floors * 3.4;
  const u0 = -W / 2 + 0.02;
  const u1 = W / 2 - 0.02;
  const v0 = 0;
  const v1 = D;
  const fs = faces(u0, u1, v0, v1);
  const tint = pick(r, ['#ffffff', '#f4e4d8', '#e8d0c0', '#fff0e8', '#d8c0b0']);
  const upper = C.f(r() < 0.7 ? 'oldmarket' : 'warehouse', tint, Math.floor(r() * 4) * 0.25, 4.4, [12, 6.8]);
  const brick = C.f('brick', tint);
  const sf = C.f('storefront', '#ffffff', r() < 0.5 ? 0 : 0.5, 0, [8, 4.4]);
  const corner = lot.cornerSide;
  panel(C, 'facade', F, fs.front, 0, fs.front.len, 0, 4.4, sf, 0);
  panel(C, 'facade', F, fs.front, 0, fs.front.len, 4.4, H, upper, 0);
  for (const [key, face] of [['neg', fs.left], ['pos', fs.right]]) {
    if (corner === key) {
      panel(C, 'facade', F, face, 0, face.len, 0, 4.4, sf, 0);
      panel(C, 'facade', F, face, 0, face.len, 4.4, H, upper, 0);
    } else panel(C, 'facade', F, face, 0, face.len, 0, H + 1.2, brick, 0);
  }
  panel(C, 'facade', F, fs.back, 0, fs.back.len, 0, H + 1.2, brick, 0);
  top(C, 'facade', F, u0, u1, v0, v1, H, C.f('roofTar', '#ffffff'));
  panel(C, 'facade', F, fs.front, 0, fs.front.len, H, H + 1.2, brick, 0);
  // corbelled cornice
  lbox(C, 'facade', F, u0 - 0.1, u1 + 0.1, v0 - 0.45, v0 + 0.1, H + 0.8, H + 1.35, C.f('brick', shade(rgb(tint), 0.8)), C.f('concrete', '#c8c0b0'), ['front', 'left', 'right']);
  // storefront sign + blade
  const biz = C.biz.oldmarket.next(null);
  const signW = Math.min(W - 1.5, 6.5);
  const c = C.cells.get(`biz:${biz.key}`);
  if (c) {
    const a = facePoint(F, fs.front, fs.front.len / 2 - signW / 2, 0.1);
    const b = facePoint(F, fs.front, fs.front.len / 2 + signW / 2, 0.1);
    B.color = rgb('#ffffff');
    B.quadUV('signs', a.x, 4.45, a.z, b.x, 4.45, b.z, b.x, 5.6, b.z, a.x, 5.6, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }
  if (biz.poi) {
    const q = facePoint(F, fs.front, fs.front.len / 2, 1.9);
    C.poi(biz.poi, biz.name, q.x, q.z, q.nx, q.nz);
    if (biz.poi === 'store') C.zoneHasStore.add(C.zoneId(q.x, q.z));
  }
  // metal canopy over the sidewalk on posts (Howard St and some others)
  const street = C.streets.get(lot.street);
  const canopy = street?.surface === 'brick' || r() < 0.4;
  if (canopy) {
    const cd = 3.1;
    const cy = 3.6;
    const green = C.f('metalPlain', pick(r, ['#2e4a3a', '#2a2e30', '#4a2e2a']));
    lbox(C, 'facade', F, u0 + 0.1, u1 - 0.1, -cd, 0, cy, cy + 0.3, green, green, ['front', 'left', 'right']);
    // underside
    B.tile = FT.dark;
    B.color = rgb('#ffffff');
    const [ux0, uz0, ux1, uz1] = F.rect(u0 + 0.1, -cd, u1 - 0.1, 0);
    B.quad('facade', ux0, cy, uz0, ux1, cy, uz0, ux1, cy, uz1, ux0, cy, uz1, 0.004, 0.996, 0.996, 0.004);
    // posts at the curb edge
    const n = Math.max(2, Math.round(W / 4.5) + 1);
    for (let k = 0; k < n; k++) {
      const u = u0 + 0.35 + ((u1 - u0 - 0.7) * k) / (n - 1);
      const px = F.x(u, -cd + 0.2);
      const pz = F.z(u, -cd + 0.2);
      B.cylinder('facade', px, pz, Y.walk, cy, 0.07, 0.07, 5, green, false);
      C.box(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, cy, 0, 'prop');
    }
    // warm lamps under the canopy
    const lamp = C.cells.get('lamp:warm');
    if (lamp) {
      for (let k = 0; k < Math.max(1, Math.floor(W / 7)); k++) {
        const u = u0 + ((k + 0.5) * (u1 - u0)) / Math.max(1, Math.floor(W / 7));
        const lx = F.x(u, -1.4);
        const lz = F.z(u, -1.4);
        B.color = rgb('#ffffff');
        B.quadUV('signs', lx - 0.25, cy - 0.02, lz + 0.25, lx + 0.25, cy - 0.02, lz + 0.25, lx + 0.25, cy - 0.02, lz - 0.25, lx - 0.25, cy - 0.02, lz - 0.25, lamp[0], lamp[1], lamp[2], lamp[1], lamp[2], lamp[3], lamp[0], lamp[3]);
        C.pool(lx, lz, 5.5, '#ffc070', 0.6);
      }
    }
  }
  const [x0, z0, x1, z1] = F.rect(u0, v0, u1, v1);
  C.box(x0, z0, x1, z1, H + 1.35, 0, 'building');
  lot.omInfo = { fs, H };
  // occasional tag spot on the side street wall of a corner building's back half
  if (corner) {
    const face = corner === 'neg' ? fs.left : fs.right;
    const pp = facePoint(F, face, face.len - 3, 0.35);
    C.tagSpot(pp.x, 1.7, pp.z, pp.nx, pp.nz, 2.6, 1.6);
  }
  return H + 1.2;
}

// ------------------------------------------------------------------ industrial
let grainElevators = 0;

export function buildIndustrialBlock(C, blk, style) {
  const r = C.rng.next;
  const B = C.B;
  const p = C.blockPaved.get(blk.id);
  const { x0, x1, z0, z1 } = blk;
  const bw = x1 - x0;
  const bd = z1 - z0;
  B.at(blk.cx, blk.cz);
  groundAvoid(C, x0, z0, x1, z1, Y.lot, style === 'warehouses' ? C.s('lot', '#e0e0e0') : C.s('gravel', '#ffffff'));
  if (C.isReserved(x0, z0, x1, z1, ['freeway']) && bd < 60) {
    // under the I-480 viaduct: gravel parking under the deck only
    return;
  }
  const sides = ['n', 's', 'w', 'e'].filter((s) => p[s]);
  const front = sides.find((s) => C.streets.get(blk.frontage[s])?.major) || sides[0] || 'n';
  // grain elevator (two in the whole city)
  if (grainElevators < 2 && bw > 50 && bd > 45 && r() < (style === 'industrial' ? 0.35 : 0.25)) {
    grainElevator(C, blk, front);
    grainElevators++;
    return;
  }
  // main warehouse along the front
  const lot = rectLot([x0, z0, x1, z1], front, blk);
  const W = lot.w;
  const D = lot.d;
  const ww = Math.min(W - 2, 28 + r() * 30);
  const wd = Math.min(D - 8, 18 + r() * 16);
  const uc = (r() - 0.5) * (W - ww - 2);
  const wlot = { ...lot, w: ww, d: wd, F: new Frame(lot.F.x(uc, 0), lot.F.z(uc, 0), lot.F.fx, lot.F.fz) };
  wlot.rect = wlot.F.rect(-ww / 2, 0, ww / 2, wd);
  if (!C.isReserved(...wlot.rect, ['landmark', 'water', 'park', 'freeway', 'hood'])) warehouse(C, wlot, style);
  // yard behind: tanks, trailers, fence
  const yv0 = wd + 1;
  const F = lot.F;
  if (D - yv0 > 8) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const tu = -W / 2 + 5 + r() * (W - 10);
      const tv = yv0 + 3 + r() * (D - yv0 - 6);
      const tx = F.x(tu, tv);
      const tz = F.z(tu, tv);
      if (C.pointReserved(tx, tz, null, 5)) continue;
      if (r() < 0.5) {
        const tr = 2.5 + r() * 2;
        const th = 5 + r() * 7;
        B.at(tx, tz);
        B.cylinder('facade', tx, tz, 0, th, tr, tr, 12, C.f('tank', pick(r, ['#ffffff', '#e8e0d0', '#d8e0e8'])), true);
        B.cylinder('facade', tx, tz, th, th + 0.8, tr, tr * 0.2, 12, C.f('tank', '#d0d0d0'), false);
        C.box(tx - tr, tz - tr, tx + tr, tz + tr, th, 0, 'building');
      } else {
        // semi trailer
        const tf = new Frame(tx, tz, F.ux, F.uz);
        lbox(C, 'facade', tf, -1.3, 1.3, -6, 6, 1.1, 4.0, C.f('metalPlain', pick(r, ['#e8e8e4', '#c8ccd0', '#b8402a', '#2a4a8a'])), C.f('metalPlain', '#d8d8d4'));
        lbox(C, 'facade', tf, -1.2, 1.2, -5, -3.4, 0, 1.1, C.f('dark', '#ffffff'), null);
        lbox(C, 'facade', tf, -1.2, 1.2, 3.6, 5.4, 0, 1.1, C.f('dark', '#ffffff'), null);
        const [a, b, c, d] = tf.rect(-1.3, -6, 1.3, 6);
        C.box(a, b, c, d, 4, 0, 'building');
      }
    }
    // fence around the yard with barbed wire
    if (C.detail > 0) {
      const fy = [[-W / 2 + 0.3, yv0], [-W / 2 + 0.3, D - 0.3], [W / 2 - 0.3, D - 0.3], [W / 2 - 0.3, yv0]];
      for (let k = 0; k < fy.length - 1; k++) {
        const [ua, va] = fy[k];
        const [ub, vb] = fy[k + 1];
        fenceRun(C, F.x(ua, va), F.z(ua, va), F.x(ub, vb), F.z(ub, vb), 2.4, 'wire');
      }
    }
  }
  // rail spur across the yard (East Omaha)
  if (style === 'industrial' && r() < 0.45 && D - yv0 > 10) {
    const rv = yv0 + 4;
    const [a, b, c, d] = F.rect(-W / 2, rv - 1.3, W / 2, rv + 1.3);
    groundAvoid(C, a, b, c, d, Y.lot + 0.01, C.s('rail', '#ffffff'));
    const railSt = C.f('rust', '#8a6a5a');
    for (const off of [-0.72, 0.72]) {
      const [e0, e1, e2, e3] = F.rect(-W / 2, rv + off - 0.05, W / 2, rv + off + 0.05);
      B.box('facade', e0, Y.lot, e1, e2, Y.lot + 0.16, e3, { all: railSt, nx: false, px: false });
    }
  }
  // a business sign + POI on the warehouse front
  if (wlot.whInfo) {
    const biz = C.biz.industrial.next(C.zoneHasStore.has(C.zoneId(blk.cx, blk.cz)) ? null : 'store');
    const face = wlot.whInfo.fs.front;
    const c = C.cells.get(`biz:${biz.key}`);
    if (c) {
      const a = facePoint(wlot.F, face, face.len * 0.25 - 3.2, 0.08);
      const b = facePoint(wlot.F, face, face.len * 0.25 + 3.2, 0.08);
      B.color = rgb('#ffffff');
      B.quadUV('signs', a.x, 4.2, a.z, b.x, 4.2, b.z, b.x, 5.6, b.z, a.x, 5.6, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    }
    if (biz.poi) {
      const q = facePoint(wlot.F, face, face.len * 0.25, 1.8);
      C.poi(biz.poi, biz.name, q.x, q.z, q.nx, q.nz);
      if (biz.poi === 'store') C.zoneHasStore.add(C.zoneId(q.x, q.z));
    }
    // tag spots on the blank end walls
    for (const fk of ['left', 'right']) {
      const fc = wlot.whInfo.fs[fk];
      const pp = facePoint(wlot.F, fc, 3.5, 0);
      C.tagSpot(pp.x, 1.8, pp.z, pp.nx, pp.nz, 3, 1.8);
    }
  }
}

function warehouse(C, lot, style) {
  const r = C.rng.next;
  const B = C.B;
  const { F, w: W, d: D } = lot;
  B.at(F.x(0, D / 2), F.z(0, D / 2));
  const H = 7 + r() * 7;
  const u0 = -W / 2;
  const u1 = W / 2;
  const fs = faces(u0, u1, 0, D);
  const q = r();
  const wallSt = q < 0.5 ? C.f('warehouse', pick(r, ['#ffffff', '#f0e0d0', '#e0d0c8']), Math.floor(r() * 4) * 0.25, 0, [14, 10]) : q < 0.75 ? C.f('metal', pick(r, ['#e8e8e4', '#d8dcd8', '#e0d8c8', '#c8d0d8'])) : C.f('block', pick(r, ['#e8e4dc', '#d8d8d0', '#e8dcc8']));
  const docks = C.f('docks', '#ffffff');
  // front: docks band on part of the face
  const L = fs.front.len;
  const dockLen = Math.min(L * 0.5, 24);
  panel(C, 'facade', F, fs.front, 0, dockLen, 0, 6, docks, 0);
  panel(C, 'facade', F, fs.front, 0, dockLen, 6, H, wallSt, 0);
  panel(C, 'facade', F, fs.front, dockLen, L, 0, H, wallSt, 0);
  for (const k of ['left', 'right', 'back']) panel(C, 'facade', F, fs[k], 0, fs[k].len, 0, H, wallSt, 0);
  // dock platform
  lbox(C, 'facade', F, u1 - dockLen, u1 - 0.2, -2.6, 0, 0, 1.2, C.f('concrete', '#c8c4bc'), C.f('concrete', '#b8b4ac'), ['front', 'left', 'right']);
  const [pa, pb, pc, pd] = F.rect(u1 - dockLen, -2.6, u1 - 0.2, 0);
  C.box(pa, pb, pc, pd, 1.2, 0, 'building');
  // office door
  B.tile = FT.shopDoor;
  B.color = rgb('#ffffff');
  panel(C, 'facade', F, fs.front, L * 0.75 - 0.5, L * 0.75 + 0.5, 0, 2.2, null, 0.03, true);
  // roof: flat or sawtooth
  if (W > 24 && D > 16 && r() < 0.4 && C.detail > 0) {
    top(C, 'facade', F, u0, u1, 0, D, H, C.f('roofTar', '#ffffff'));
    const n = Math.floor(D / 5);
    const glass = C.f('sawtooth', '#ffffff');
    const roof = C.f('roofMetal', '#d0d0d0');
    for (let i = 0; i < n; i++) {
      const va = 0.5 + i * 5;
      const vb = va + 4.5;
      // vertical glazed face toward the front, sloped metal back
      B.tile = glass.tile;
      B.color = glass.color;
      const a = [F.x(u1 - 0.5, va), F.z(u1 - 0.5, va)];
      const b = [F.x(u0 + 0.5, va), F.z(u0 + 0.5, va)];
      B.quad('facade', a[0], H, a[1], b[0], H, b[1], b[0], H + 2.2, b[1], a[0], H + 2.2, a[1], 0, 0, (W - 1) / 3, 0.9);
      B.tile = roof.tile;
      B.color = roof.color;
      const c2 = [F.x(u0 + 0.5, vb), F.z(u0 + 0.5, vb)];
      const d2 = [F.x(u1 - 0.5, vb), F.z(u1 - 0.5, vb)];
      B.quad('facade', b[0], H + 2.2, b[1], a[0], H + 2.2, a[1], d2[0], H, d2[1], c2[0], H, c2[1], 0, 0, (W - 1) / 3, 1.6);
      // side triangles
      B.tri('facade', b[0], H, b[1], c2[0], H, c2[1], b[0], H + 2.2, b[1]);
      B.tri('facade', a[0], H + 2.2, a[1], d2[0], H, d2[1], a[0], H, a[1]);
    }
  } else {
    top(C, 'facade', F, u0, u1, 0, D, H, C.f('roofTar', '#ffffff'));
    for (const k of ['front', 'left', 'right', 'back']) panel(C, 'facade', F, fs[k], 0, fs[k].len, H, H + 0.8, wallSt, 0);
    if (C.detail > 0) {
      for (let i = 0; i < 2; i++) {
        const au = u0 + 3 + r() * (W - 6);
        const av = 3 + r() * (D - 6);
        lbox(C, 'facade', F, au - 1, au + 1, av - 1, av + 1, H, H + 1.4, C.f('metalPlain', '#c0c0b8'), C.f('vent', '#ffffff'));
      }
    }
  }
  const [x0, z0, x1, z1] = F.rect(u0, 0, u1, D);
  C.box(x0, z0, x1, z1, H + 1, 0, 'building');
  lot.whInfo = { fs, H };
  C.stats.towers++;
}

function grainElevator(C, blk, front) {
  const r = C.rng.next;
  const B = C.B;
  const lot = rectLot([blk.x0, blk.z0, blk.x1, blk.z1], front, blk);
  const { F, w: W, d: D } = lot;
  B.at(blk.cx, blk.cz);
  const n = 6 + Math.floor(r() * 3);
  const sr = 3.1;
  const sh = 30 + r() * 6;
  const concrete = C.f('silo', '#ffffff');
  const rowV = [D * 0.4, D * 0.4 + sr * 2];
  const start = -((n - 1) * sr * 2) / 2;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const v of rowV) {
    for (let i = 0; i < n; i++) {
      const u = start + i * sr * 2;
      if (Math.abs(u) > W / 2 - sr - 1) continue;
      const x = F.x(u, v);
      const z = F.z(u, v);
      B.cylinder('facade', x, z, 0, sh, sr, sr, 12, concrete, true);
      minX = Math.min(minX, x - sr);
      minZ = Math.min(minZ, z - sr);
      maxX = Math.max(maxX, x + sr);
      maxZ = Math.max(maxZ, z + sr);
    }
  }
  C.box(minX, minZ, maxX, maxZ, sh, 0, 'building');
  // headhouse tower at one end + gallery on top
  const hu = start - sr * 2 - 3;
  const hv = rowV[0] + sr;
  if (Math.abs(hu) < W / 2 - 4) {
    lbox(C, 'facade', F, hu - 4, hu + 4, hv - 5, hv + 5, 0, sh + 12, concrete, C.f('roofTar', '#ffffff'));
    const hf = faces(hu - 4, hu + 4, hv - 5, hv + 5);
    for (let k = 0; k < 4; k++) {
      B.tile = FT.winSmall;
      B.color = rgb('#ffffff');
      panel(C, 'facade', F, hf.front, 3, 5, sh - 4 + k * 3, sh - 2.8 + k * 3, null, 0.04, true);
    }
    const [a, b, c, d] = F.rect(hu - 4, hv - 5, hu + 4, hv + 5);
    C.box(a, b, c, d, sh + 12, 0, 'building');
    // name painted near the top
    const c2 = C.cells.get('biz:industrial:4');
    if (c2) {
      const p0 = facePoint(F, hf.front, 0.3, 0.05);
      const p1 = facePoint(F, hf.front, 7.7, 0.05);
      B.color = rgb('#ffffff');
      B.quadUV('signs', p0.x, sh + 7, p0.z, p1.x, sh + 7, p1.z, p1.x, sh + 9, p1.z, p0.x, sh + 9, p0.z, c2[0], c2[1], c2[2], c2[1], c2[2], c2[3], c2[0], c2[3]);
    }
  }
  lbox(C, 'facade', F, start - sr, -start + sr, hv - 1.4, hv + 1.4, sh, sh + 3, C.f('metal', '#d8d8d4'), C.f('roofMetal', '#c8c8c8'));
  // track + a couple of hopper cars (boxes) along the front
  const [a, b, c, d] = F.rect(-W / 2, 3, W / 2, 5.6);
  groundAvoid(C, a, b, c, d, Y.lot + 0.01, C.s('rail', '#ffffff'));
  for (let k = 0; k < 3; k++) {
    const cu = -W / 2 + 8 + k * 13;
    if (cu > W / 2 - 8) break;
    const tf = new Frame(F.x(cu, 4.3), F.z(cu, 4.3), F.ux, F.uz);
    lbox(C, 'facade', tf, -1.4, 1.4, -6, 6, 1, 4.2, C.f('metalPlain', pick(r, ['#8a6a4a', '#6a6a6a', '#8a3a2a'])), C.f('metalPlain', '#7a7a7a'));
    const [e0, e1, e2, e3] = tf.rect(-1.4, -6, 1.4, 6);
    C.box(e0, e1, e2, e3, 4.2, 0, 'building');
  }
  // tag spot low on a silo base facing the street
  const pt = facePoint(F, faces(-W / 2, W / 2, 0, D).front, W / 2 + 6, -(rowV[0] - sr) + 0.05);
  void pt;
}

// ------------------------------------------------------------------ riverfront / leftovers
export function buildRiverfrontBlock(C, blk) {
  const r = C.rng.next;
  const { x0, x1, z0, z1 } = blk;
  groundAvoid(C, x0, z0, x1, z1, Y.yard, C.s('lawn', '#f0f4e8'));
  const p = C.blockPaved.get(blk.id);
  // a bait shop on 10th St (stores in every zone) and concrete flood-wall stubs to tag
  // (the riverfront zone starts at x = 575, so the shop faces an east-west street)
  if (!C.riverStore && (p.n || p.s) && z1 - z0 > 20) {
    const side = p.n ? 'n' : 's';
    const rect = side === 'n' ? [x0 + 7, z0, x0 + 21, z0 + 12] : [x0 + 7, z1 - 12, x0 + 21, z1];
    if (!C.isReserved(...rect, ['landmark', 'water', 'park', 'freeway', 'hood'])) {
      const lot = rectLot(rect, side, blk);
      lot.street = blk.frontage[side];
      buildStorefront(C, lot, BUSINESSES.riverfront[0], { stories: 1, depth: 11 });
      C.riverStore = true;
    }
  }
  if (p.w) {
    for (const t of [0.2, 0.5, 0.8]) {
      const z = z0 + (z1 - z0) * t;
      const x = Math.max(x0 + 5.5, 576.5);
      if (C.pointReserved(x, z, ['landmark', 'water', 'park', 'hood'], 3)) continue;
      const F = new Frame(x, z, -1, 0);
      C.B.at(x, z);
      lbox(C, 'facade', F, -3, 3, 0, 0.5, 0, 2.2, C.f('concrete', '#d8d4cc'), C.f('concrete', '#c8c4bc'));
      const [a, b, c, d] = F.rect(-3, 0, 3, 0.5);
      C.box(a, b, c, d, 2.2, 0, 'building');
      C.tagSpot(x, 1.3, z, -1, 0, 3.4, 1.4);
    }
  }
  const n = C.detail === 0 ? 3 : 7;
  for (let i = 0; i < n; i++) {
    const x = x0 + 4 + r() * (x1 - x0 - 8);
    const z = z0 + 4 + r() * (z1 - z0 - 8);
    if (C.pointReserved(x, z, null, 4)) continue;
    tree(C, x, z, pick(r, ['cotton', 'elm', 'cotton', 'young']), 0.9 + r() * 0.5, r);
  }
}

export function buildLandmarkLeftovers(C, blk) {
  const r = C.rng.next;
  const lm = LANDMARKS.find((l) => l.id === blk.landmark);
  if (!lm?.rect || lm.park) return;
  const pad = 3;
  const R = lm.rect;
  const { x0, x1, z0, z1 } = blk;
  const bands = [
    ['n', [x0, z0, x1, Math.min(z1, R.z0 - pad)]],
    ['s', [x0, Math.max(z0, R.z1 + pad), x1, z1]],
    ['w', [x0, Math.max(z0, R.z0 - pad), Math.min(x1, R.x0 - pad), Math.min(z1, R.z1 + pad)]],
    ['e', [Math.max(x0, R.x1 + pad), Math.max(z0, R.z0 - pad), x1, Math.min(z1, R.z1 + pad)]],
  ];
  const p = C.blockPaved.get(blk.id);
  const urban = blk.district === 'downtown' || blk.district === 'midtown';
  for (const [side, rect] of bands) {
    const w = rect[2] - rect[0];
    const d = rect[3] - rect[1];
    if (w < 12 || d < 12) continue;
    if (C.isReserved(...rect, ['landmark', 'water', 'park', 'freeway', 'hood'])) continue;
    const front = p[side] ? side : ['n', 's', 'w', 'e'].find((s) => p[s]) || 'n';
    if (urban) {
      const lot = rectLot(rect, front, blk);
      buildParkingLot(C, lot, { fill: 0.8 });
    } else {
      C.B.at((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
      C.ground('surface', rect[0], rect[1], rect[2], rect[3], Y.yard, C.s('lawn', '#e8f0e0'));
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) tree(C, rect[0] + 3 + r() * (w - 6), rect[1] + 3 + r() * (d - 6), pick(r, ['elm', 'maple', 'cotton']), 1 + r() * 0.3, r);
    }
  }
}

/** Set hangout lot around a hood point: open slab, mural wall, a hoop, milk crates. */
export function buildHangout(C, lot) {
  const r = C.rng.next;
  const B = C.B;
  const { F, w: W, d: D } = lot;
  const hood = C.hoods.find((h) => h.x >= lot.rect[0] - 8 && h.x <= lot.rect[2] + 8 && h.z >= lot.rect[1] - 8 && h.z <= lot.rect[3] + 8);
  const [x0, z0, x1, z1] = lot.rect;
  B.at((x0 + x1) / 2, (z0 + z1) / 2);
  C.ground('surface', x0, z0, x1, z1, Y.lot, C.s(r() < 0.5 ? 'concrete' : 'lot', '#d8d4cc'));
  if (!hood) return;
  if (hood.done) return;
  hood.done = true;
  // mural wall at the back of the lot, facing the hood, outside the 7 m clear square
  const v = Math.min(D - 0.5, 12);
  const wx = F.x(0, v);
  const wz = F.z(0, v);
  if (Math.abs(wx - hood.x) > 7.4 || Math.abs(wz - hood.z) > 7.4) {
    const len = Math.min(W - 1, 8);
    const wf = faces(-len / 2, len / 2, v, v + 0.4);
    lbox(C, 'facade', F, -len / 2, len / 2, v, v + 0.4, 0, 3.2, C.f('brick', '#f0e0d0'), C.f('concrete', '#d0c8b8'));
    const c = C.cells.get(`mural:${['jazz', 'peace', 'school', 'sunrise'][C.hoods.indexOf(hood) % 4]}`);
    if (c) {
      const a = facePoint(F, wf.front, 0.2, 0.03);
      const b = facePoint(F, wf.front, len - 0.2, 0.03);
      B.color = rgb('#ffffff');
      B.quadUV('signs', a.x, 0.25, a.z, b.x, 0.25, b.z, b.x, 3.05, b.z, a.x, 3.05, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    }
    const [a0, b0, a1, b1] = F.rect(-len / 2, v, len / 2, v + 0.4);
    C.box(a0, b0, a1, b1, 3.2, 0, 'building');
    // tag spot on the back of the mural wall
    const bp = facePoint(F, wf.back, len / 2, 0);
    C.tagSpot(bp.x, 1.6, bp.z, bp.nx, bp.nz, 2.6, 1.5);
  }
  // decorative crates (no colliders so NPCs can stand here)
  const crate = C.f('white', '#3a6ab8');
  for (let i = 0; i < 3; i++) {
    const cu = -W / 2 + 1.2 + r() * (W - 2.4);
    const cv = D - 2 - r() * 3;
    const cf = new Frame(F.x(cu, cv), F.z(cu, cv), F.fx, F.fz);
    lbox(C, 'facade', cf, -0.2, 0.2, -0.2, 0.2, Y.lot, Y.lot + 0.34, i % 2 ? C.f('white', '#b83a2a') : crate);
  }
}
