import { Frame, rgb, shade } from './batch.js';
import { faces, panel, walls, top, lbox, gableRoof, hipRoof, shedRoof, tree, fenceRun, facePoint, lquad } from './kit.js';
import { Y } from './context.js';
import { FT } from '../textures.js';

// Wood-frame houses of North Omaha / Midtown (1–2.5 stories), porches, yards, fences, garages,
// vacant lots, boarded houses and Kountze Place Victorians. Everything is built in the lot's local
// frame (u along the street, v into the lot, front faces the street).

const SIDING = ['#e9e6dc', '#ece3c4', '#e8dc9a', '#c4dcc4', '#bcd0e0', '#aeb2ae', '#d8c8a8', '#c9d6b8', '#e3c8b6', '#a9b8c4', '#f0ece2', '#d7dcc4'];
const TRIM = ['#f4f2ea', '#efe9d8', '#f7f7f2', '#f4f2ea', '#6a4a36', '#3e4e40'];
const ROOF = ['#5d5d5d', '#4d4843', '#6e5d4c', '#404043', '#5d655b', '#6e4a3c', '#545b66'];
const DOORS = ['#8a2a22', '#2f4f3a', '#27406a', '#f0ece2', '#5a3a26', '#1e1e1e', '#6a1e2e'];
const BRICK_TINT = ['#ffffff', '#f0dccc', '#d8b8a0', '#e8e0d8'];

const pick = (r, a) => a[Math.floor(r() * a.length)];

/** Lot ground (lawn / dirt) at yard height. */
export function lotGround(C, lot, tile = 'lawn', color = '#ffffff') {
  const [x0, z0, x1, z1] = lot.rect;
  C.B.at((x0 + x1) / 2, (z0 + z1) / 2);
  C.ground('surface', x0, z0, x1, z1, tile === 'dirt' ? Y.dirt : Y.yard, C.s(tile, color));
}

/** Local flat patch (walkway / driveway / slab) at height y. */
export function patch(C, F, u0, u1, v0, v1, y, tile, color = '#ffffff') {
  const [x0, z0, x1, z1] = F.rect(u0, v0, u1, v1);
  C.ground('surface', x0, z0, x1, z1, y, C.s(tile, color));
}

/** Window with trim on a face at s (centre), sill y. lit: pick lit variants at random. */
function houseWin(C, F, face, s, y, w, h, boarded, r) {
  let tile;
  if (boarded) tile = FT.winBoard;
  else {
    const q = r();
    const lit = r() < 0.42;
    if (q < 0.34) tile = lit ? (r() < 0.8 ? FT.winALit : FT.winALit2) : FT.winA;
    else if (q < 0.68) tile = lit ? (r() < 0.75 ? FT.winBLit : FT.winBLit2) : FT.winB;
    else tile = lit ? FT.winCTv : FT.winC;
  }
  C.B.tile = tile;
  C.B.color = rgb('#ffffff');
  panel(C, 'facade', F, face, s - w / 2, s + w / 2, y, y + h, null, 0.04, true);
}

/**
 * Build a house on a lot. opts: { victorian, brick, boarded, midtown, alley }
 * Returns info { box: [minX,minZ,maxX,maxZ], ridge }.
 */
export function buildHouse(C, lot, opts = {}) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  const B = C.B;
  const low = C.detail === 0;
  const vict = !!opts.victorian;
  const boarded = !!opts.boarded;
  const brickHouse = !vict && (opts.brick ?? r() < 0.16);
  const cx = (lot.rect[0] + lot.rect[2]) / 2;
  const cz = (lot.rect[1] + lot.rect[3]) / 2;
  B.at(cx, cz);

  // ---- footprint
  const maxW = vict ? 11.5 : opts.midtown ? 10 : 9;
  const hw = Math.max(5.2, Math.min(maxW, W - 2.6 - r() * 1.6));
  const hd = Math.max(7, Math.min(vict ? 14 : 12, D * 0.42 + r() * 2.5));
  const porchD = low ? 2.2 : 2.4;
  const setback = Math.max(2.5, Math.min(3.5 + r() * 3.5, D - hd - porchD - 3));
  const slack = (W - hw) / 2 - 1.2;
  const uc = (r() - 0.5) * 2 * Math.max(0, slack) * 0.5;
  const u0 = uc - hw / 2;
  const u1 = uc + hw / 2;
  const v0 = setback + porchD;
  const v1 = v0 + hd;
  const stories = vict ? 2 : brickHouse ? (r() < 0.6 ? 1 : 1.5) : pick(r, [1, 1.5, 1.5, 2, 2, 2]);
  const fh = 2.75;
  const base = 0.6;
  const wallTop = base + Math.floor(stories) * fh + (stories === 1.5 ? 0.5 : 0);

  // ---- styles
  const faded = boarded ? 0.78 : 0.9 + r() * 0.1;
  const sidingCol = shade(rgb(pick(r, SIDING)), faded);
  const wallSt = brickHouse ? C.f('brick', pick(r, BRICK_TINT)) : r() < 0.3 ? C.f('shingle', sidingCol) : C.f('siding', sidingCol);
  const trimSt = C.f('trim', boarded ? '#c8c4b8' : pick(r, TRIM));
  const roofSt = C.f('roofShingle', pick(r, ROOF));
  const foundSt = C.f(r() < 0.5 ? 'block' : 'stone', '#b8b2a8');

  // ---- foundation + body
  lbox(C, 'facade', F, u0 - 0.06, u1 + 0.06, v0 - 0.06, v1 + 0.06, 0, base, foundSt, null);
  const fs = walls(C, 'facade', F, u0, u1, v0, v1, base, wallTop, wallSt);

  // ---- roof
  let ridge;
  const roofKind = vict ? 'gable-v' : brickHouse ? pick(r, ['hip', 'gable-u', 'gable-v']) : stories === 2 && r() < 0.45 ? 'hip' : r() < 0.7 ? 'gable-v' : 'gable-u';
  if (roofKind === 'hip') ridge = hipRoof(C, 'facade', F, u0, u1, v0, v1, wallTop, 0.55 + r() * 0.15, roofSt, trimSt, 0.45);
  else if (roofKind === 'gable-v') ridge = gableRoof(C, 'facade', F, u0, u1, v0, v1, wallTop, vict ? 1.25 : stories === 1.5 ? 1.05 : 0.8 + r() * 0.2, 'v', roofSt, wallSt, trimSt, 0.35);
  else ridge = gableRoof(C, 'facade', F, u0, u1, v0, v1, wallTop, 0.75 + r() * 0.2, 'u', roofSt, wallSt, trimSt, 0.4);

  // ---- windows + door (front)
  const ww = 0.95;
  const wh = 1.45;
  const doorS = hw * (r() < 0.5 ? 0.28 : 0.72); // distance from the front face's left end
  const floorsN = Math.floor(stories);
  for (let f = 0; f < floorsN; f++) {
    const sill = base + f * fh + 0.85;
    if (f === 0) {
      // windows on the side away from the door
      const other = doorS < hw / 2 ? [hw * 0.64, hw * 0.86] : [hw * 0.14, hw * 0.36];
      if (hw > 7) other.forEach((s) => houseWin(C, F, fs.front, s, sill, ww, wh, boarded, r));
      else houseWin(C, F, fs.front, (other[0] + other[1]) / 2, sill, ww * 1.3, wh, boarded, r);
    } else {
      houseWin(C, F, fs.front, hw * 0.28, sill, ww, wh, boarded, r);
      houseWin(C, F, fs.front, hw * 0.72, sill, ww, wh, boarded, r);
    }
    // sides
    const nSide = low ? 2 : hd > 10 ? 3 : 2;
    for (const face of [fs.left, fs.right]) {
      for (let k = 0; k < nSide; k++) houseWin(C, F, face, (hd * (k + 0.6)) / (nSide + 0.2), sill, ww, wh * 0.95, boarded, r);
    }
    if (!low) {
      houseWin(C, F, fs.back, hw * 0.3, sill, ww, wh * 0.9, boarded, r);
      houseWin(C, F, fs.back, hw * 0.7, sill, ww * 0.8, wh * 0.6, boarded, r);
    }
  }
  // attic / half-story window in the front gable
  if ((roofKind === 'gable-v' && (stories === 1.5 || vict || r() < 0.5)) || stories === 1.5) {
    if (roofKind === 'gable-v') houseWin(C, F, fs.front, hw / 2, wallTop + 0.25, 0.8, 1.0, boarded, r);
  }
  // door
  C.B.tile = boarded ? FT.plywood : r() < 0.4 ? FT.doorScreen : FT.door;
  C.B.color = boarded ? rgb('#ffffff') : rgb(pick(r, DOORS));
  if (C.B.tile === FT.doorScreen) C.B.color = rgb('#ffffff');
  panel(C, 'facade', F, fs.front, doorS - 0.5, doorS + 0.5, base, base + 2.1, null, 0.04, true);
  const doorU = fs.front.ou + fs.front.du * doorS;

  // ---- chimney
  if (!low && r() < 0.6) {
    const side = r() < 0.5 ? -1 : 1;
    const cu = side < 0 ? u0 - 0.35 : u1 + 0.35;
    const cv = v0 + hd * (0.3 + r() * 0.4);
    lbox(C, 'facade', F, cu - 0.35, cu + 0.35, cv - 0.4, cv + 0.4, 0, ridge + 0.5, C.f('brick', '#e0c8b8'));
  }

  // ---- porch
  let porchU0 = u0;
  let porchU1 = u1;
  if (!vict && r() < 0.35) {
    // half-width porch at the door side
    const du = doorU;
    porchU0 = Math.max(u0, du - hw * 0.3);
    porchU1 = Math.min(u1, du + hw * 0.3);
  }
  const pv0 = setback;
  const pv1 = v0;
  const pFloor = 0.55;
  const plankSt = C.f('planks', '#9a948a');
  walls(C, 'facade', F, porchU0, porchU1, pv0, pv1, 0, pFloor, foundSt, ['front', 'left', 'right']);
  top(C, 'facade', F, porchU0, porchU1, pv0, pv1, pFloor, plankSt);
  const pTop = base + 2.45;
  const postSt = trimSt;
  const pw = 0.09;
  const posts = low ? [porchU0 + 0.15, porchU1 - 0.15] : [porchU0 + 0.15, (porchU0 * 2 + porchU1) / 3, (porchU0 + porchU1 * 2) / 3, porchU1 - 0.15];
  for (const pu of posts) {
    if (brickHouse && !low) {
      lbox(C, 'facade', F, pu - 0.28, pu + 0.28, pv0 + 0.02, pv0 + 0.58, pFloor, pFloor + 0.9, wallSt, wallSt, ['front', 'left', 'right']);
      lbox(C, 'detail', F, pu - pw, pu + pw, pv0 + 0.22, pv0 + 0.4, pFloor + 0.9, pTop, postSt, null, ['front', 'left', 'right']);
    } else lbox(C, 'detail', F, pu - pw, pu + pw, pv0 + 0.1, pv0 + 0.28, pFloor, pTop, postSt, null, ['front', 'left', 'right']);
  }
  if (!low) {
    // railing (low wall) with a gap at the steps
    const railSt = trimSt;
    const gap0 = doorU - 0.8;
    const gap1 = doorU + 0.8;
    if (gap0 - porchU0 > 0.6) lbox(C, 'detail', F, porchU0 + 0.1, gap0, pv0 + 0.14, pv0 + 0.22, pFloor + 0.75, pFloor + 0.85, railSt, railSt, ['front']);
    if (porchU1 - gap1 > 0.6) lbox(C, 'detail', F, gap1, porchU1 - 0.1, pv0 + 0.14, pv0 + 0.22, pFloor + 0.75, pFloor + 0.85, railSt, railSt, ['front']);
  }
  shedRoof(C, 'facade', F, porchU0 - 0.15, porchU1 + 0.15, pv0 - 0.2, pv1, pTop, pTop + 0.45, roofSt, trimSt);
  // steps
  const stSt = C.f('concrete', '#c8c4ba');
  lbox(C, 'facade', F, doorU - 0.75, doorU + 0.75, pv0 - 0.36, pv0, 0, 0.36, stSt, stSt, ['front', 'left', 'right']);
  lbox(C, 'facade', F, doorU - 0.75, doorU + 0.75, pv0 - 0.7, pv0 - 0.36, 0, 0.18, stSt, stSt, ['front', 'left', 'right']);
  // porch light (lamp cell; glows at night unless boarded)
  if (!boarded && !low) {
    const lp = faces(u0, u1, v0, v1).front;
    const ls = doorS + 0.75;
    const p = facePoint(F, lp, ls, 0.06);
    B.at(cx, cz);
    const c = C.cells.get('lamp:warm');
    if (c) {
      const hx = -p.nz * 0.1;
      const hz = p.nx * 0.1;
      B.color = rgb('#ffffff');
      B.quadUV('signs', p.x - hx, base + 2.0, p.z - hz, p.x + hx, base + 2.0, p.z + hz, p.x + hx, base + 2.25, p.z + hz, p.x - hx, base + 2.25, p.z - hz, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    }
  }

  // ---- Victorian extras: side wing with cross gable, turret
  if (vict && !low) {
    const wingSide = r() < 0.5 ? -1 : 1;
    const wu0 = wingSide < 0 ? u0 - 2.4 : u1;
    const wu1 = wingSide < 0 ? u0 : u1 + 2.4;
    const wv0 = v0 + hd * 0.35;
    const wv1 = v0 + hd * 0.8;
    if (Math.abs(wu0) < W / 2 - 0.8 && Math.abs(wu1) < W / 2 - 0.8) {
      lbox(C, 'facade', F, wu0 - 0.05, wu1 + 0.05, wv0 - 0.05, wv1 + 0.05, 0, base, foundSt, null);
      const wf = walls(C, 'facade', F, wu0, wu1, wv0, wv1, base, wallTop - 0.4, wallSt, [wingSide < 0 ? 'left' : 'right', 'front', 'back']);
      gableRoof(C, 'facade', F, wu0, wu1 + (wingSide > 0 ? 0 : 0), wv0, wv1, wallTop - 0.4, 1.1, 'u', roofSt, wallSt, trimSt, 0.3);
      houseWin(C, F, wingSide < 0 ? wf.left : wf.right, (wv1 - wv0) / 2, base + 0.85, ww, wh, boarded, r);
      houseWin(C, F, wingSide < 0 ? wf.left : wf.right, (wv1 - wv0) / 2, base + fh + 0.85, ww, wh, boarded, r);
    }
    if (r() < 0.45) {
      // corner turret
      const tu = wingSide < 0 ? u1 - 0.2 : u0 + 0.2;
      const tv = v0 + 0.2;
      const tx = F.x(tu, tv);
      const tz = F.z(tu, tv);
      const tr = 1.5;
      B.cylinder('facade', tx, tz, 0, wallTop + 1.2, tr, tr, 8, wallSt, false, Math.PI / 8);
      B.tile = roofSt.tile;
      B.color = roofSt.color;
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI / 8 + (i / 8) * Math.PI * 2;
        const a1 = Math.PI / 8 + ((i + 1) / 8) * Math.PI * 2;
        const rr = tr + 0.25;
        B.tri('facade', tx + Math.cos(a0) * rr, wallTop + 1.2, tz - Math.sin(a0) * rr, tx + Math.cos(a1) * rr, wallTop + 1.2, tz - Math.sin(a1) * rr, tx, wallTop + 4.6, tz, 0, 0, 1, 0, 0.5, 1.5);
      }
      for (let k = 0; k < 3; k++) {
        const a = Math.PI / 8 + ((k * 2 + 1) / 8) * Math.PI * 2;
        const px = tx + Math.cos(a) * (tr + 0.04);
        const pz = tz - Math.sin(a) * (tr + 0.04);
        const tx2 = -Math.sin(a) * 0.4;
        const tz2 = -Math.cos(a) * 0.4;
        B.tile = FT.winALit;
        B.color = rgb('#ffffff');
        B.quad('facade', px - tx2, base + fh + 0.9, pz - tz2, px + tx2, base + fh + 0.9, pz + tz2, px + tx2, base + fh + 2.2, pz + tz2, px - tx2, base + fh + 2.2, pz - tz2, 0.004, 0.004, 0.996, 0.996);
      }
    }
  }

  // ---- collider: body + porch + steps
  const [bx0, bz0, bx1, bz1] = F.rect(Math.min(u0, porchU0) - 0.4, pv0 - 0.7, Math.max(u1, porchU1) + 0.4, v1 + 0.1);
  C.box(bx0, bz0, bx1, bz1, ridge, 0, 'house');
  C.stats.houses++;
  return { doorU, setback, u0, u1, v0, v1, ridge, pv0 };
}

/** Front walkway + optional driveway / garage / fences / trees around a house. */
export function dressHouseLot(C, lot, info, opts = {}) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  const low = C.detail === 0;
  const boarded = !!opts.boarded;
  // walkway from the sidewalk to the steps
  patch(C, F, info.doorU - 0.55, info.doorU + 0.55, 0, info.pv0 - 0.7, Y.yard + 0.012, 'concrete', '#d8d4ca');

  // garage at the back
  let garage = null;
  const backRoom = D - info.v1;
  if (backRoom > 7.5 && r() < (opts.alley ? 0.62 : 0.4)) {
    const gw = r() < 0.2 ? 6 : 3.6;
    const gd = 6;
    const leftSpace = info.u0 + W / 2;
    const rightSpace = W / 2 - info.u1;
    const side = rightSpace > leftSpace ? 1 : -1;
    const gu0 = side > 0 ? Math.min(W / 2 - 0.6 - gw, info.u1 + 0.8) : Math.max(-W / 2 + 0.6, info.u0 - 0.8 - gw);
    const gu1 = gu0 + gw;
    const gv1 = D - (opts.alley ? 0.6 : 1.2);
    const gv0 = gv1 - gd;
    if (gv0 > info.v1 + 1.5 && gu0 >= -W / 2 + 0.3 && gu1 <= W / 2 - 0.3) {
      const wallCol = shade(rgb(pick(r, SIDING)), 0.85);
      const gst = r() < 0.4 ? C.f('block', '#e0ddd4') : C.f('siding', wallCol);
      const gfs = walls(C, 'facade', F, gu0, gu1, gv0, gv1, 0, 2.5, gst);
      const roofSt = C.f('roofShingle', pick(r, ROOF));
      gableRoof(C, 'facade', F, gu0, gu1, gv0, gv1, 2.5, 0.5, opts.alley ? 'u' : 'v', roofSt, gst, C.f('trim', '#e8e4da'), 0.25);
      C.B.tile = FT.garageDoor;
      C.B.color = rgb(boarded ? '#b0aca0' : '#ffffff');
      const gface = opts.alley ? gfs.back : gfs.front;
      panel(C, 'facade', F, gface, gw / 2 - Math.min(2.6, gw - 0.8) / 2, gw / 2 + Math.min(2.6, gw - 0.8) / 2, 0, 2.15, null, 0.04, true);
      const [x0, z0, x1, z1] = F.rect(gu0, gv0, gu1, gv1);
      C.box(x0, z0, x1, z1, 3.4, 0, 'building');
      garage = { u0: gu0, u1: gu1, v0: gv0, v1: gv1, faces: gfs, side };
      if (!opts.alley) patch(C, F, gu0 + 0.3, gu1 - 0.3, 0, gv0, Y.yard + 0.01, 'concrete', '#cfcac0');
      // tag spot on a garage wall that faces a side street (corner lots)
      if (lot.cornerSide && lot.cornerSide === (side > 0 ? 'pos' : 'neg')) {
        const face = side > 0 ? gfs.right : gfs.left;
        const p = facePoint(F, face, gd / 2, 0);
        C.tagSpot(p.x, 1.4, p.z, p.nx, p.nz, 2.4, 1.3);
      } else if (opts.alley && r() < 0.25) {
        const p = facePoint(F, gfs.back, gw / 2 + (gw > 4 ? 1.8 : 0), 0);
        if (gw > 4) C.tagSpot(p.x, 2.35, p.z, p.nx, p.nz, 1.2, 0.3);
      }
    }
  } else if (!opts.alley && r() < 0.45) {
    // plain driveway along the side
    const side = info.u1 + 3 < W / 2 ? 1 : info.u0 - 3 > -W / 2 ? -1 : 0;
    if (side) {
      const du0 = side > 0 ? info.u1 + 0.4 : info.u0 - 3;
      patch(C, F, du0, du0 + 2.6, 0, Math.min(D - 1, info.v1), Y.yard + 0.01, r() < 0.5 ? 'concrete' : 'gravel', '#d0ccc2');
    }
  }

  // front fence
  const fenceKind = boarded ? (r() < 0.5 ? 'chain' : null) : r() < 0.4 ? 'chain' : r() < 0.22 ? 'picket' : r() < 0.08 ? 'iron' : null;
  if (fenceKind && !low) {
    const fv = 0.35;
    const g0 = info.doorU - 0.75;
    const g1 = info.doorU + 0.75;
    const e0 = -W / 2 + 0.1;
    const e1 = W / 2 - 0.1;
    const h = fenceKind === 'picket' ? 0.95 : 1.0;
    const seg = (a, b) => {
      if (b - a < 0.3) return;
      fenceRun(C, F.x(a, fv), F.z(a, fv), F.x(b, fv), F.z(b, fv), h, fenceKind);
    };
    seg(e0, g0);
    seg(g1, e1);
    // side fences back from the front fence
    if (r() < 0.6) {
      const sideU = r() < 0.5 ? e0 : e1;
      fenceRun(C, F.x(sideU, fv), F.z(sideU, fv), F.x(sideU, info.v0 + 1), F.z(sideU, info.v0 + 1), h, fenceKind);
    }
  }
  // back-yard privacy fence along an alley or side
  if (!low && r() < 0.3) {
    const u = r() < 0.5 ? -W / 2 + 0.1 : W / 2 - 0.1;
    fenceRun(C, F.x(u, info.v1 + 0.5), F.z(u, info.v1 + 0.5), F.x(u, D - 0.3), F.z(u, D - 0.3), 1.8, r() < 0.5 ? 'wood' : 'chain');
  }

  // trees
  const treeKinds = ['elm', 'maple', 'maple', 'elm', 'cotton', 'young', 'spruce'];
  if (info.setback > 3.2 && r() < (low ? 0.3 : 0.55)) {
    const tu = info.doorU > 0 ? -W / 2 + 2 + r() * 1.5 : W / 2 - 2 - r() * 1.5;
    const tv = 1.6 + r() * Math.max(0.2, info.setback - 2.5);
    if (Math.abs(tu - info.doorU) > 2) tree(C, F.x(tu, tv), F.z(tu, tv), pick(r, treeKinds), 0.8 + r() * 0.45, r);
  }
  if (D - info.v1 > 4 && r() < (low ? 0.35 : 0.65)) {
    let tu = (r() - 0.5) * (W - 3);
    const tv = info.v1 + 2 + r() * (D - info.v1 - 4);
    if (garage && tu > garage.u0 - 2 && tu < garage.u1 + 2) tu = garage.side > 0 ? garage.u0 - 2.4 : garage.u1 + 2.4;
    if (Math.abs(tu) < W / 2 - 1) tree(C, F.x(tu, tv), F.z(tu, tv), pick(r, treeKinds), 0.9 + r() * 0.5, r);
  }
  return { garage };
}

/** Vacant lot: dirt + weeds, maybe a broken fence, a tree, junk. */
export function buildVacant(C, lot) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  lotGround(C, lot, r() < 0.65 ? 'dirt' : 'dryGrass');
  const [x0, z0, x1, z1] = lot.rect;
  C.B.at((x0 + x1) / 2, (z0 + z1) / 2);
  // weed tufts / shrubs
  const n = C.detail === 0 ? 1 : 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const u = (r() - 0.5) * (W - 2);
    const v = 1.5 + r() * (D - 3);
    const s = 0.4 + r() * 0.6;
    const col = rgb(r() < 0.5 ? '#6a7a36' : '#7e8440');
    C.B.at(F.x(u, v), F.z(u, v));
    blobShrub(C, F.x(u, v), F.z(u, v), s, col, r);
  }
  if (r() < 0.45) tree(C, F.x((r() - 0.5) * (W - 3), D * (0.3 + r() * 0.6)), F.z((r() - 0.5) * (W - 3), D * (0.3 + r() * 0.6)), r() < 0.2 ? 'dead' : r() < 0.6 ? 'young' : 'cotton', 0.8 + r() * 0.5, r);
  if (r() < 0.3 && C.detail > 0) {
    const a = -W / 2 + 0.2 + r() * 2;
    const b = W / 2 - 0.2 - r() * 3;
    fenceRun(C, F.x(a, 0.3), F.z(a, 0.3), F.x(b, 0.3), F.z(b, 0.3), 1.0, 'chain');
  }
  if (r() < 0.35 && C.detail > 0) {
    // old tire / debris
    const u = (r() - 0.5) * (W - 3);
    const v = 2 + r() * (D - 4);
    C.B.cylinder('detail', F.x(u, v), F.z(u, v), Y.dirt, Y.dirt + 0.22, 0.34, 0.34, 7, C.f('dark', '#ffffff'));
  }
  C.stats.vacant++;
}

/** Small low shrub (weeds / hedges). */
export function blobShrub(C, x, z, s, color, r) {
  const B = C.B;
  B.tile = FT.foliage;
  const k = s;
  const pts = 5;
  const y = Y.dirt;
  for (let i = 0; i < pts; i++) {
    const a0 = (i / pts) * Math.PI * 2 + r() * 0.3;
    const a1 = ((i + 1) / pts) * Math.PI * 2;
    B.color = i % 2 ? color : shade(color, 0.85);
    B.tri('detail', x + Math.cos(a0) * k, y, z - Math.sin(a0) * k, x + Math.cos(a1) * k, y, z - Math.sin(a1) * k, x, y + k * 1.1, z, 0, 0, 1, 0, 0.5, 1);
  }
}

/** Boarded / abandoned house: faded, plywood windows. */
export function buildBoarded(C, lot, opts) {
  lotGround(C, lot, 'dryGrass');
  const info = buildHouse(C, lot, { ...opts, boarded: true });
  dressHouseLot(C, lot, info, { ...opts, boarded: true });
  return info;
}

/** Church: brick nave with a steeple tower, on a double-width lot. */
export function buildChurch(C, lot, nameIndex) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  const B = C.B;
  lotGround(C, lot, 'lawn');
  const cx = (lot.rect[0] + lot.rect[2]) / 2;
  const cz = (lot.rect[1] + lot.rect[3]) / 2;
  B.at(cx, cz);
  const nw = Math.min(W - 6, 13);
  const nd = Math.min(D - 6, 22);
  const u0 = -nw / 2 + (W > 26 ? 2 : 0);
  const u1 = u0 + nw;
  const v0 = 4;
  const v1 = v0 + nd;
  const h = 7.5;
  const brickSt = C.f('brick', r() < 0.5 ? '#f0e0d0' : '#d8c0a8');
  const wallCh = C.f('church', '#ffffff', 0, 1.2);
  lbox(C, 'facade', F, u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.1, 0, 0.8, C.f('stone', '#c8c0b0'), null);
  const fs = walls(C, 'facade', F, u0, u1, v0, v1, 0.8, h, { front: brickSt, back: brickSt, left: wallCh, right: wallCh });
  const roofSt = C.f('roofShingle', '#4a4846');
  const ridge = gableRoof(C, 'facade', F, u0, u1, v0, v1, h, 1.1, 'v', roofSt, brickSt, C.f('trim', '#e8e4da'), 0.4);
  // front rose window + doors
  B.tile = FT.churchWin;
  B.color = rgb('#ffffff');
  panel(C, 'facade', F, fs.front, nw / 2 - 1.1, nw / 2 + 1.1, h - 2.4, h + 1.8, null, 0.04, true);
  B.tile = FT.door;
  B.color = rgb('#6a3a22');
  panel(C, 'facade', F, fs.front, nw / 2 - 1.2, nw / 2 + 1.2, 0.8, 3.4, null, 0.04, true);
  // steeple tower at the front corner
  const side = r() < 0.5 ? -1 : 1;
  const tu0 = side < 0 ? u0 - 1.5 : u1 - 2.5;
  const tu1 = tu0 + 4;
  const tv0 = v0 - 1.8;
  const tv1 = tv0 + 4;
  const th = 15 + r() * 3;
  lbox(C, 'facade', F, tu0, tu1, tv0, tv1, 0, th, brickSt, null);
  const tfs = faces(tu0, tu1, tv0, tv1);
  for (const k of ['front', 'left', 'right', 'back']) {
    B.tile = FT.churchWin;
    B.color = rgb('#ffffff');
    panel(C, 'facade', F, tfs[k], 1.4, 2.6, th - 4.2, th - 1.2, null, 0.04, true);
  }
  // spire
  const sx = F.x((tu0 + tu1) / 2, (tv0 + tv1) / 2);
  const sz = F.z((tu0 + tu1) / 2, (tv0 + tv1) / 2);
  B.tile = roofSt.tile;
  B.color = rgb('#5a5e60');
  const sr = 2.9;
  for (let i = 0; i < 4; i++) {
    const a0 = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const a1 = Math.PI / 4 + ((i + 1) / 4) * Math.PI * 2;
    B.tri('facade', sx + Math.cos(a0) * sr, th, sz - Math.sin(a0) * sr, sx + Math.cos(a1) * sr, th, sz - Math.sin(a1) * sr, sx, th + 9, sz, 0, 0, 1, 0, 0.5, 3);
  }
  // cross
  lbox(C, 'facade', new Frame(sx, sz, F.fx, F.fz), -0.06, 0.06, -0.06, 0.06, th + 8.8, th + 10.4, C.f('metalPlain', '#d8d8d0'));
  lbox(C, 'facade', new Frame(sx, sz, F.fx, F.fz), -0.45, 0.45, -0.06, 0.06, th + 9.6, th + 9.8, C.f('metalPlain', '#d8d8d0'));
  // name board on the lawn
  const bu = side < 0 ? u1 - 2 : u0 + 2;
  const bF = new Frame(F.x(bu, 1.2), F.z(bu, 1.2), F.fx, F.fz);
  lbox(C, 'facade', bF, -1.35, 1.35, -0.1, 0.1, 0, 0.35, C.f('brick', '#ffffff'));
  const bf = faces(-1.3, 1.3, -0.08, 0.08);
  signPanelFace(C, bF, bf.front, 0.05, 2.55, 0.35, 1.2, `church:${nameIndex % 6}`);
  signPanelFace(C, bF, bf.back, 0.05, 2.55, 0.35, 1.2, `church:${nameIndex % 6}`);
  lbox(C, 'facade', bF, -1.35, -1.2, -0.1, 0.1, 0.35, 1.25, C.f('dark', '#ffffff'), null);
  lbox(C, 'facade', bF, 1.2, 1.35, -0.1, 0.1, 0.35, 1.25, C.f('dark', '#ffffff'), null);
  // colliders
  const [x0, z0, x1, z1] = F.rect(u0 - 0.2, v0 - 0.2, u1 + 0.2, v1 + 0.2);
  C.box(x0, z0, x1, z1, ridge, 0, 'building');
  const [a0, b0, a1, b1] = F.rect(tu0, tv0, tu1, tv1);
  C.box(a0, b0, a1, b1, th + 9, 0, 'building');
  const [c0, d0, c1, d1] = bF.rect(-1.35, -0.1, 1.35, 0.1);
  C.box(c0, d0, c1, d1, 1.25, 0, 'prop');
  patch(C, F, (u0 + u1) / 2 - 1.3, (u0 + u1) / 2 + 1.3, 0, v0, Y.yard + 0.012, 'concrete', '#d8d4ca');
  // trees
  tree(C, F.x(W / 2 - 2.5, D - 3), F.z(W / 2 - 2.5, D - 3), 'elm', 1.1, r);
  tree(C, F.x(-W / 2 + 2.5, D - 4), F.z(-W / 2 + 2.5, D - 4), 'maple', 1.0, r);
}

function signPanelFace(C, F, face, s0, s1, y0, y1, cell) {
  const c = C.cells.get(cell);
  if (!c) return;
  const B = C.B;
  B.color = rgb('#ffffff');
  const off = 0.03;
  const au = face.ou + face.du * s0 + face.nu * off;
  const av = face.ov + face.dv * s0 + face.nv * off;
  const bu = face.ou + face.du * s1 + face.nu * off;
  const bv = face.ov + face.dv * s1 + face.nv * off;
  B.quadUV('signs', F.x(au, av), y0, F.z(au, av), F.x(bu, bv), y0, F.z(bu, bv), F.x(bu, bv), y1, F.z(bu, bv), F.x(au, av), y1, F.z(au, av), c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
}

void lquad;
