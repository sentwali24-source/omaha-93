import { Frame, rgb, shade } from './batch.js';
import { faces, panel, walls, top, lbox, facePoint, tree, fenceRun } from './kit.js';
import { lotGround, patch } from './houses.js';
import { Y } from './context.js';
import { FT } from '../textures.js';
import { GAS_BRANDS } from './names.js';

// Commercial strip buildings: brick storefronts with parapets, signs, awnings, blade signs;
// corner stores, gas stations, car wash, used-car lot, surface parking, midtown walk-up
// apartments. All in the lot's local frame (front faces the street at v = 0).

const pick = (r, a) => a[Math.floor(r() * a.length)];
const AWNINGS = ['#b3261e', '#1f5a2e', '#1d3f7a', '#6b1f3a', '#c8a020', '#2a2a2a', '#1e6a6a'];
const BRICK_TINTS = ['#ffffff', '#f2e2d6', '#e0c8b8', '#fff4ea', '#d8c0b0'];

/** Parapet ring on top of a flat-roof box (front/left/right/back), with a cap. */
function parapet(C, F, u0, u1, v0, v1, h, ph, st, capSt, which = ['front', 'left', 'right', 'back']) {
  const t = 0.25;
  const inner = faces(u0 + t, u1 - t, v0 + t, v1 - t);
  // outer walls continue above the roof (drawn by caller); inner faces of the parapet:
  const fs = faces(u0, u1, v0, v1);
  const B = C.B;
  for (const k of which) {
    // inner face = opposite orientation of outer face, pushed inward by t
    const f = fs[k];
    const len = f.len;
    const inv = { ou: f.ou + f.du * len - f.nu * t, ov: f.ov + f.dv * len - f.nv * t, du: -f.du, dv: -f.dv, nu: -f.nu, nv: -f.nv, len };
    panel(C, 'facade', F, inv, 0, len, h, h + ph, st, 0);
    void inner;
  }
  // caps
  const cap = capSt;
  B.tile = cap.tile;
  B.color = cap.color;
  if (which.includes('front')) top(C, 'facade', F, u0 - 0.05, u1 + 0.05, v0 - 0.05, v0 + t, h + ph, cap);
  if (which.includes('back')) top(C, 'facade', F, u0 - 0.05, u1 + 0.05, v1 - t, v1 + 0.05, h + ph, cap);
  if (which.includes('left')) top(C, 'facade', F, u0 - 0.05, u0 + t, v0 + t, v1 - t, h + ph, cap);
  if (which.includes('right')) top(C, 'facade', F, u1 - t, u1 + 0.05, v0 + t, v1 - t, h + ph, cap);
}

/** Awning over a storefront (sloped fabric with valance). */
function awning(C, F, face, s0, s1, y, depth, color, striped) {
  const B = C.B;
  const st = C.f(striped ? 'awningStripe' : 'awning', color);
  B.tile = st.tile;
  B.color = st.color;
  const p0 = facePoint(F, face, s0, 0.02);
  const p1 = facePoint(F, face, s1, 0.02);
  const q0 = facePoint(F, face, s0, depth);
  const q1 = facePoint(F, face, s1, depth);
  const drop = depth * 0.62;
  const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  // sloped top: wall edge at y, outer edge at y - drop (faces up/out)
  B.quad('facade', q0.x, y - drop, q0.z, q1.x, y - drop, q1.z, p1.x, y, p1.z, p0.x, y, p0.z, 0, 0, len / st.tw, depth / st.tw);
  // valance
  B.quad('facade', q0.x, y - drop - 0.35, q0.z, q1.x, y - drop - 0.35, q1.z, q1.x, y - drop, q1.z, q0.x, y - drop, q0.z, 0, 0, len / st.tw, 0.35 / st.tw);
  // underside (darker)
  B.color = shade(st.color, 0.55);
  B.quad('facade', p0.x, y, p0.z, p1.x, y, p1.z, q1.x, y - drop, q1.z, q0.x, y - drop, q0.z, 0, 0, 1, 1);
  // side triangles
  B.color = shade(st.color, 0.85);
  B.tri('facade', p0.x, y, p0.z, q0.x, y - drop, q0.z, q0.x, y - drop - 0.35, q0.z);
  B.tri('facade', q1.x, y - drop, q1.z, p1.x, y, p1.z, q1.x, y - drop - 0.35, q1.z);
}

/** Vertical double-sided blade sign projecting from a face at s. */
function bladeSign(C, F, face, s, y0, word) {
  const c = C.cells.get(`blade:${word}`);
  if (!c) return;
  const B = C.B;
  const base = facePoint(F, face, s, 0.05);
  const out = facePoint(F, face, s, 0.95);
  // along direction of the face (world)
  const ax = F.ux * face.du + F.vx * face.dv;
  const az = F.uz * face.du + F.vz * face.dv;
  const t = 0.06;
  B.color = rgb('#ffffff');
  const y1 = y0 + 2.4;
  // two faces of a thin panel perpendicular to the wall
  B.quadUV('signs', base.x + ax * t, y0, base.z + az * t, out.x + ax * t, y0, out.z + az * t, out.x + ax * t, y1, out.z + az * t, base.x + ax * t, y1, base.z + az * t, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  B.quadUV('signs', out.x - ax * t, y0, out.z - az * t, base.x - ax * t, y0, base.z - az * t, base.x - ax * t, y1, base.z - az * t, out.x - ax * t, y1, out.z - az * t, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  // bracket
  const br = C.f('dark', '#ffffff');
  B.tile = br.tile;
  B.color = br.color;
  B.quad('facade', base.x, y1 + 0.1, base.z, out.x, y1 + 0.1, out.z, out.x, y1, out.z, base.x, y1, base.z);
}

/** Sign board quad on a face (sign atlas cell), centred at s. */
function signOn(C, F, face, s, w, y0, y1, cell, off = 0.08) {
  const c = C.cells.get(cell);
  if (!c) return;
  const a = facePoint(F, face, s - w / 2, off);
  const b = facePoint(F, face, s + w / 2, off);
  C.B.color = rgb('#ffffff');
  C.B.quadUV('signs', a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
}

/** Wall-mounted payphone at a face position + POI on the sidewalk in front. */
export function payphoneOnWall(C, F, face, s, name = 'US WEST Payphone') {
  const p = facePoint(F, face, s, 0.02);
  const B = C.B;
  const pf = new Frame(p.x, p.z, p.nx, p.nz);
  const box = C.f('metalPlain', '#9aa0a4');
  lbox(C, 'facade', pf, -0.3, 0.3, 0, 0.28, 1.0, 1.9, box);
  const fr = faces(-0.3, 0.3, 0, 0.28);
  B.tile = FT.dark;
  B.color = rgb('#ffffff');
  panel(C, 'facade', pf, fr.front, 0.12, 0.48, 1.2, 1.7, null, 0.01, true);
  signOn(C, pf, fr.front, 0.3, 0.6, 1.92, 2.12, 'payphone', 0.02);
  const q = facePoint(F, face, s, 1.1);
  C.poi('payphone', name, q.x, q.z, p.nx, p.nz);
}

/**
 * Storefront building on a lot. biz from names.js; opts: { stories, depth, exposed: {neg, pos},
 * closed, corner: 'neg'|'pos'|null, sideSign }.
 */
export function buildStorefront(C, lot, biz, opts = {}) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  const B = C.B;
  const low = C.detail === 0;
  const cx = (lot.rect[0] + lot.rect[2]) / 2;
  const cz = (lot.rect[1] + lot.rect[3]) / 2;
  B.at(cx, cz);
  lotGround(C, lot, 'dirt', '#b8b0a0');
  const bd = Math.min(D - 1, opts.depth ?? 12 + r() * 6);
  const stories = opts.stories ?? (r() < 0.35 ? 2 : 1);
  const h = stories === 2 ? 8.2 : 4.8 + r() * 0.5;
  const ph = 0.7 + r() * 0.7;
  const u0 = -W / 2 + 0.05;
  const u1 = W / 2 - 0.05;
  const v0 = 0.05;
  const v1 = bd;
  const tint = pick(r, BRICK_TINTS);
  const brick = r() < 0.75 ? C.f('brick', tint) : r() < 0.5 ? C.f('brickBuff', tint) : C.f('block', pick(r, ['#e8e0d0', '#d8e0e0', '#e8d8c0']));
  const closed = !!opts.closed;
  const boarded = !!opts.boarded;
  const sfTile = boarded ? 'plywood' : closed ? 'storefrontClosed' : 'storefront';
  const sf = C.f(sfTile, '#ffffff', r() < 0.5 ? 0 : 0.5, 0);
  const fs = faces(u0, u1, v0, v1);
  // ground floor front
  panel(C, 'facade', F, fs.front, 0, fs.front.len, 0, 4.2, sf, 0);
  // upper front + parapet
  panel(C, 'facade', F, fs.front, 0, fs.front.len, 4.2, h + ph, brick, 0);
  // sides / back
  const backSt = C.f('block', '#d8d2c4');
  panel(C, 'facade', F, fs.left, 0, fs.left.len, 0, h + ph, brick, 0);
  panel(C, 'facade', F, fs.right, 0, fs.right.len, 0, h + ph, brick, 0);
  panel(C, 'facade', F, fs.back, 0, fs.back.len, 0, h + 0.3, backSt, 0);
  top(C, 'facade', F, u0, u1, v0, v1, h, C.f('roofTar', '#ffffff'));
  parapet(C, F, u0, u1, v0, v1, h, ph, brick, C.f('concrete', '#d8d4cc'), ['front', 'left', 'right']);
  // cornice band
  if (!low) lbox(C, 'facade', F, u0 - 0.12, u1 + 0.12, v0 - 0.18, v0 + 0.1, h + ph - 0.25, h + ph + 0.05, C.f('concrete', '#cfc8b8'), C.f('concrete', '#cfc8b8'), ['front', 'left', 'right']);
  // second floor windows
  if (stories === 2) {
    const n = Math.max(2, Math.floor(W / 3));
    for (let i = 0; i < n; i++) {
      const s = ((i + 0.5) * fs.front.len) / n;
      B.tile = boarded ? FT.winBoard : r() < 0.4 ? (r() < 0.5 ? FT.winALit : FT.winBLit) : pick(r, [FT.winA, FT.winB, FT.winC]);
      B.color = rgb('#ffffff');
      panel(C, 'facade', F, fs.front, s - 0.55, s + 0.55, 5.4, 7.2, null, 0.04, true);
    }
  }
  // sign band
  const signW = Math.min(W - 1.2, 6.8);
  const sy0 = stories === 2 ? 4.35 : 4.3;
  const sy1 = sy0 + Math.min(1.3, signW * 0.21);
  if (biz && !boarded) {
    signOn(C, F, fs.front, fs.front.len / 2, signW, sy0, sy1, `biz:${biz.key}`, 0.1);
    // lightbox edges
    const a = facePoint(F, fs.front, fs.front.len / 2 - signW / 2, 0.1);
    const b = facePoint(F, fs.front, fs.front.len / 2 + signW / 2, 0.1);
    B.tile = FT.dark;
    B.color = rgb('#ffffff');
    const bw = facePoint(F, fs.front, fs.front.len / 2 - signW / 2, 0);
    const bw2 = facePoint(F, fs.front, fs.front.len / 2 + signW / 2, 0);
    B.quad('facade', bw.x, sy1, bw.z, bw2.x, sy1, bw2.z, b.x, sy1, b.z, a.x, sy1, a.z);
    if (opts.sideSign && opts.corner) {
      const face = opts.corner === 'pos' ? fs.right : fs.left;
      signOn(C, F, face, face.len * 0.45, Math.min(face.len * 0.6, 6), h - 1.6, h - 0.4, `biz:${biz.key}`, 0.06);
    }
    if (biz.blade && !low) bladeSign(C, F, fs.front, r() < 0.5 ? 0.6 : fs.front.len - 0.6, 3.5, biz.blade);
  }
  // awning
  if (!boarded && !low && r() < 0.5) {
    awning(C, F, fs.front, 0.4, fs.front.len - 0.4, 3.7, 1.3, rgb(pick(r, AWNINGS)), r() < 0.4);
  }
  // rooftop units
  if (!low && W > 7) {
    const k = 1 + Math.floor(r() * 2);
    for (let i = 0; i < k; i++) {
      const au = -W / 4 + r() * (W / 2);
      const av = v0 + 3 + r() * (bd - 6);
      lbox(C, 'facade', F, au - 0.7, au + 0.7, av - 0.6, av + 0.6, h, h + 1.0, C.f('metalPlain', '#c8c8c0'), C.f('vent', '#ffffff'));
    }
  }
  // back door + dumpster
  if (!low) {
    B.tile = FT.door;
    B.color = rgb('#6a6e70');
    panel(C, 'facade', F, fs.back, W * 0.3 - 0.5, W * 0.3 + 0.5, 0, 2.1, null, 0.03, true);
    if (D - bd > 3 && r() < 0.55) dumpster(C, F, W * 0.1, bd + 1.4);
  }
  // colliders
  const [x0, z0, x1, z1] = F.rect(u0, v0, u1, v1);
  C.box(x0, z0, x1, z1, h + ph, 0, 'building');

  // tag spots on exposed side walls (neighbour is vacant / not a building) near the front.
  // With opts.deferTags the candidates are stored on the lot and resolved by the caller once the
  // neighbours are known.
  const ex = opts.exposed || {};
  const cands = [];
  for (const [key, face] of [['neg', fs.left], ['pos', fs.right]]) {
    if (face.len < 5) continue;
    const s = Math.min(face.len - 2, 3.2 + r() * 2);
    const p = facePoint(F, face, s, 0);
    cands.push({ key, p });
  }
  if (opts.deferTags) {
    lot.tagCands = cands;
    lot.tagCorner = opts.corner || null;
  } else {
    for (const c of cands) if (ex[c.key] || opts.corner === c.key) C.tagSpot(c.p.x, 1.6, c.p.z, c.p.nx, c.p.nz, 2.6, 1.6);
  }
  // POI in front of the door
  if (biz?.poi && !boarded) {
    const doorS = fs.front.len * (sf.uo ? 0.66 : 0.2);
    const q = facePoint(F, fs.front, doorS, 1.9);
    C.poi(biz.poi, biz.name, q.x, q.z, q.nx, q.nz);
  }
  C.stats.stores++;
  return { fs, h, bd };
}

export function dumpster(C, F, u, v) {
  const x = F.x(u, v);
  const z = F.z(u, v);
  const df = new Frame(x, z, F.fx, F.fz);
  const col = C.f('metalPlain', pick(C.rng.next, ['#3a6a4a', '#2a4a7a', '#6a4a2a', '#4a4a4a']));
  lbox(C, 'facade', df, -1, 1, -0.8, 0.8, 0.1, 1.25, col, C.f('dark', '#ffffff'));
  C.box(Math.min(df.x(-1, -0.8), df.x(1, 0.8)), Math.min(df.z(-1, -0.8), df.z(1, 0.8)), Math.max(df.x(-1, -0.8), df.x(1, 0.8)), Math.max(df.z(-1, -0.8), df.z(1, 0.8)), 1.3, 0, 'prop');
}

/** Corner store: small 1-story with signs on both street faces and a payphone. */
export function buildCornerStore(C, lot, biz, corner) {
  const res = buildStorefront(C, lot, biz, { stories: 1, depth: Math.min(lot.d - 2, 13), corner, sideSign: true });
  const face = corner === 'pos' ? res.fs.right : res.fs.left;
  // side windows (storefront tile on the first few meters of the side)
  const st = C.f('storefront', '#ffffff', 0.5, 0);
  panel(C, 'facade', lot.F, face, face.len - 5.5, face.len - 0.3, 0, 4.2, st, 0.02);
  payphoneOnWall(C, lot.F, face, face.len - 6.4);
  return res;
}

/** Gas station on a (merged) corner lot. corner: side of the lot that touches the cross street. */
export function buildGasStation(C, lot, brandIndex) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  const B = C.B;
  const brand = GAS_BRANDS[brandIndex % GAS_BRANDS.length];
  const cx = (lot.rect[0] + lot.rect[2]) / 2;
  const cz = (lot.rect[1] + lot.rect[3]) / 2;
  B.at(cx, cz);
  // apron
  const [x0, z0, x1, z1] = lot.rect;
  C.ground('surface', x0, z0, x1, z1, Y.lot, C.s('concrete', '#e0dcd4'));
  // canopy over pumps
  const cu0 = -Math.min(7, W / 2 - 2);
  const cu1 = -cu0;
  const cv0 = 3;
  const cv1 = Math.min(D - 9, 12);
  const ch = 4.6;
  const white = C.f('white', '#f2f2ee');
  const brandSt = C.f('white', brand.color);
  lbox(C, 'facade', F, cu0, cu1, cv0, cv1, ch, ch + 0.7, brandSt, white);
  // canopy underside + lamps
  B.tile = FT.white;
  B.color = rgb('#d8d8d4');
  const uF = faces(cu0, cu1, cv0, cv1);
  void uF;
  const [ax0, az0, ax1, az1] = F.rect(cu0, cv0, cu1, cv1);
  B.quad('facade', ax0, ch, az0, ax1, ch, az0, ax1, ch, az1, ax0, ch, az1, 0.004, 0.004, 0.996, 0.996);
  const lamp = C.cells.get('lamp:fluor');
  if (lamp) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const lu = cu0 + ((i + 0.5) * (cu1 - cu0)) / 3;
        const lv = cv0 + ((j + 0.5) * (cv1 - cv0)) / 2;
        const lx = F.x(lu, lv);
        const lz = F.z(lu, lv);
        B.color = rgb('#ffffff');
        B.quadUV('signs', lx - 0.6, ch - 0.02, lz - 0.3, lx + 0.6, ch - 0.02, lz - 0.3, lx + 0.6, ch - 0.02, lz + 0.3, lx - 0.6, ch - 0.02, lz + 0.3, lamp[0], lamp[1], lamp[2], lamp[1], lamp[2], lamp[3], lamp[0], lamp[3]);
        C.pool(lx, lz, 7, '#e8f2ff', 0.8);
      }
    }
  }
  // posts
  for (const pu of [cu0 + 0.8, cu1 - 0.8]) {
    for (const pv of [cv0 + 0.8, cv1 - 0.8]) {
      lbox(C, 'facade', F, pu - 0.18, pu + 0.18, pv - 0.18, pv + 0.18, 0, ch, white, null);
      const [a, b, c, d] = F.rect(pu - 0.2, pv - 0.2, pu + 0.2, pv + 0.2);
      C.box(a, b, c, d, ch, 0, 'prop');
    }
  }
  // pump islands
  for (const pu of [cu0 * 0.45, cu1 * 0.45]) {
    const vm = (cv0 + cv1) / 2;
    lbox(C, 'facade', F, pu - 0.6, pu + 0.6, vm - 2.2, vm + 2.2, 0, 0.2, C.f('concrete', '#e8e4dc'));
    for (const pv of [vm - 1.1, vm + 1.1]) {
      lbox(C, 'facade', F, pu - 0.35, pu + 0.35, pv - 0.25, pv + 0.25, 0.2, 1.7, C.f('white', '#f0f0ea'), brandSt);
      lbox(C, 'facade', F, pu - 0.36, pu + 0.36, pv - 0.26, pv + 0.26, 1.2, 1.5, brandSt, null);
    }
    const [a, b, c, d] = F.rect(pu - 0.6, vm - 2.2, pu + 0.6, vm + 2.2);
    C.box(a, b, c, d, 1.7, 0, 'prop');
  }
  // kiosk
  const kv0 = cv1 + 2;
  const kv1 = Math.min(D - 0.5, kv0 + 7);
  const ku0 = -Math.min(5, W / 2 - 1);
  const ku1 = -ku0;
  let kf = null;
  if (kv1 - kv0 > 4) {
    kf = faces(ku0, ku1, kv0, kv1);
    panel(C, 'facade', F, kf.front, 0, kf.front.len, 0, 3.6, C.f('storefront', '#ffffff', 0, -0.2), 0);
    panel(C, 'facade', F, kf.front, 0, kf.front.len, 3.6, 4.3, brandSt, 0);
    for (const k of ['left', 'right', 'back']) panel(C, 'facade', F, kf[k], 0, kf[k].len, 0, 4.3, C.f('block', '#ece8e0'), 0);
    top(C, 'facade', F, ku0, ku1, kv0, kv1, 4.3, C.f('roofTar', '#ffffff'));
    const [a, b, c, d] = F.rect(ku0, kv0, ku1, kv1);
    C.box(a, b, c, d, 4.3, 0, 'building');
    const q = facePoint(F, kf.front, kf.front.len * 0.2, 1.4);
    C.poi('store', `${brand.name} Food Mart`, q.x, q.z, q.nx, q.nz);
    payphoneOnWall(C, F, kf.front, kf.front.len - 0.8);
    // parking in front of the kiosk
    for (const pu of [ku0 + 1.5, ku1 - 1.5]) {
      if (Math.abs(pu) < 2) continue;
      C.parkingSpots.push({ x: F.x(pu, kv0 - 3), z: F.z(pu, kv0 - 3), heading: headingOf(-F.fx, -F.fz) + Math.PI });
    }
  }
  // price sign on a pole near the street corner
  const su = W / 2 - 1.2;
  const sx = F.x(su, 1.2);
  const sz = F.z(su, 1.2);
  B.cylinder('facade', sx, sz, 0, 5.2, 0.12, 0.12, 6, C.f('metalPlain', '#8a8e90'), false);
  const pf = new Frame(sx, sz, F.fx, F.fz);
  const sf = faces(-0.7, 0.7, -0.12, 0.12);
  lbox(C, 'facade', pf, -0.75, 0.75, -0.13, 0.13, 5.2, 7.4, C.f('white', '#e8e8e2'), brandSt);
  signOn(C, pf, sf.front, 0.7, 1.4, 5.25, 7.35, `gas:${brandIndex % GAS_BRANDS.length}`, 0.02);
  signOn(C, pf, sf.back, 0.7, 1.4, 5.25, 7.35, `gas:${brandIndex % GAS_BRANDS.length}`, 0.02);
  C.box(sx - 0.15, sz - 0.15, sx + 0.15, sz + 0.15, 5, 0, 'prop');
  C.stats.stores++;
}

export function headingOf(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/** Surface parking lot with stall stripes; pushes parkingSpots. */
export function buildParkingLot(C, lot, opts = {}) {
  const { F, w: W, d: D } = lot;
  const B = C.B;
  const r = C.rng.next;
  const [x0, z0, x1, z1] = lot.rect;
  B.at((x0 + x1) / 2, (z0 + z1) / 2);
  C.ground('surface', x0, z0, x1, z1, Y.lot, C.s('lot', '#ffffff'));
  const paint = C.s('paint');
  const white = rgb('#dcdcd2');
  // rows of stalls perpendicular to the street: stalls 2.7 wide × 5.2 deep, aisle 6 m
  const stallW = 2.7;
  const stallD = 5.2;
  const rows = [];
  let v = 1.2;
  while (v + stallD <= D - 0.8) {
    rows.push(v);
    v += stallD;
    if (v + 6 + stallD <= D - 0.8) {
      v += 6;
    } else break;
  }
  const n = Math.floor((W - 1.5) / stallW);
  const u0 = -((n * stallW) / 2);
  const facing = [];
  rows.forEach((rv, ri) => {
    for (let i = 0; i <= n; i++) {
      const u = u0 + i * stallW;
      const [a, b, c, d] = F.rect(u - 0.06, rv, u + 0.06, rv + stallD);
      B.tile = paint.tile;
      B.color = white;
      B.flat('paint', a, b, c, d, Y.lot + 0.012, paint.tw, paint.th);
    }
    for (let i = 0; i < n; i++) {
      if (r() < (opts.fill ?? 0.9)) {
        const u = u0 + (i + 0.5) * stallW;
        const vv = rv + stallD / 2;
        // cars nose-in toward the aisle alternately
        const hd = ri % 2 === 0 ? headingOf(F.vx, F.vz) : headingOf(-F.vx, -F.vz);
        facing.push({ x: F.x(u, vv), z: F.z(u, vv), heading: hd });
      }
    }
  });
  for (const s of facing) C.parkingSpots.push(s);
  // light pole
  if (C.detail > 0 && W > 12 && D > 14) {
    const lu = 0;
    const lv = D / 2;
    C.lightPole(F.x(lu, lv), F.z(lu, lv), 8, 'fluor');
  }
  // sign at the street edge
  if (opts.sign !== false) {
    const su = -W / 2 + 1;
    const sx = F.x(su, 0.6);
    const sz = F.z(su, 0.6);
    B.cylinder('facade', sx, sz, 0, 2.2, 0.05, 0.05, 5, C.f('metalPlain', '#8a8e90'), false);
    const pf = new Frame(sx, sz, F.fx, F.fz);
    const sf = faces(-0.55, 0.55, -0.02, 0.02);
    signOn(C, pf, sf.front, 0.55, 1.1, 2.2, 2.85, opts.sign || 'parking', 0.01);
    signOn(C, pf, sf.back, 0.55, 1.1, 2.2, 2.85, opts.sign || 'parking', 0.01);
  }
  // low bumper wall / chain along the sidewalk sometimes
  if (C.detail > 0 && r() < 0.35) {
    fenceRun(C, F.x(-W / 2 + 0.2, 0.3), F.z(-W / 2 + 0.2, 0.3), F.x(-2, 0.3), F.z(-2, 0.3), 0.6, 'iron');
    fenceRun(C, F.x(3, 0.3), F.z(3, 0.3), F.x(W / 2 - 0.2, 0.3), F.z(W / 2 - 0.2, 0.3), 0.6, 'iron');
  }
}

/** Used-car lot: stalls, a small office, a big sign and bunting. */
export function buildUsedCarLot(C, lot) {
  const { F, w: W, d: D } = lot;
  buildParkingLot(C, lot, { fill: 1, sign: false });
  const B = C.B;
  // office
  const ou0 = W / 2 - 5;
  const ov0 = D - 5;
  lbox(C, 'facade', F, ou0, ou0 + 4, ov0, ov0 + 3.2, 0, 3, C.f('siding', '#f0ece0'), C.f('roofTar', '#ffffff'));
  const of = faces(ou0, ou0 + 4, ov0, ov0 + 3.2);
  B.tile = FT.shopDoor;
  B.color = rgb('#ffffff');
  panel(C, 'facade', F, of.front, 0.4, 1.4, 0, 2.2, null, 0.03, true);
  B.tile = FT.winALit;
  panel(C, 'facade', F, of.front, 1.9, 3.5, 1, 2.2, null, 0.03, true);
  const [a, b, c, d] = F.rect(ou0, ov0, ou0 + 4, ov0 + 3.2);
  C.box(a, b, c, d, 3, 0, 'building');
  // tall sign
  const sx = F.x(-W / 2 + 1.5, 1);
  const sz = F.z(-W / 2 + 1.5, 1);
  B.cylinder('facade', sx - F.ux * 1.2, sz - F.uz * 1.2, 0, 5, 0.1, 0.1, 5, C.f('metalPlain', '#8a8e90'), false);
  B.cylinder('facade', sx + F.ux * 1.2, sz + F.uz * 1.2, 0, 5, 0.1, 0.1, 5, C.f('metalPlain', '#8a8e90'), false);
  const pf = new Frame(sx, sz, F.fx, F.fz);
  const sf = faces(-1.6, 1.6, -0.05, 0.05);
  lbox(C, 'facade', pf, -1.65, 1.65, -0.06, 0.06, 4.9, 6.0, C.f('white', '#e8e8e2'), null);
  signOn(C, pf, sf.front, 1.6, 3.2, 4.92, 5.98, 'usedcars', 0.02);
  signOn(C, pf, sf.back, 1.6, 3.2, 4.92, 5.98, 'usedcars', 0.02);
  C.box(Math.min(pf.x(-1.7, 0), pf.x(1.7, 0)) - 0.1, Math.min(pf.z(-1.7, 0), pf.z(1.7, 0)) - 0.1, Math.max(pf.x(-1.7, 0), pf.x(1.7, 0)) + 0.1, Math.max(pf.z(-1.7, 0), pf.z(1.7, 0)) + 0.1, 5, 0, 'prop');
  // bunting: strings of little flags between poles along the front
  const cols = ['#d8261e', '#f2c230', '#2a6ad8', '#f4f4f0', '#2a9a4a'];
  const poles = [[-W / 2 + 0.6, 0.8], [0, 0.8], [W / 2 - 0.6, 0.8]];
  for (const [pu, pv] of poles) B.cylinder('facade', F.x(pu, pv), F.z(pu, pv), 0, 4.2, 0.05, 0.05, 4, C.f('metalPlain', '#9a9ea0'), false);
  for (let k = 0; k < poles.length - 1; k++) {
    const [ua] = poles[k];
    const [ub] = poles[k + 1];
    const nf = Math.floor(Math.abs(ub - ua) / 0.7);
    for (let i = 0; i < nf; i++) {
      const t = (i + 0.5) / nf;
      const u = ua + (ub - ua) * t;
      const y = 4.1 - Math.sin(t * Math.PI) * 0.6;
      const x = F.x(u, 0.8);
      const z = F.z(u, 0.8);
      B.tile = FT.white;
      B.color = rgb(cols[i % cols.length]);
      const hx = F.ux * 0.22;
      const hz = F.uz * 0.22;
      B.tri('facade', x - hx, y, z - hz, x + hx, y, z + hz, x, y - 0.45, z);
      B.tri('facade', x + hx, y, z + hz, x - hx, y, z - hz, x, y - 0.45, z);
    }
    C.wire(F.x(ua, 0.8), 4.1, F.z(ua, 0.8), F.x(ub, 0.8), 4.1, F.z(ub, 0.8), 0.6);
  }
  const q = facePoint(F, of.front, 1, 1.5);
  C.poi('garage', "Big Jim's Used Cars", q.x, q.z, q.nx, q.nz);
}

/** Hand car wash: two open bays under a flat roof. */
export function buildCarWash(C, lot) {
  const { F, w: W, d: D } = lot;
  const B = C.B;
  const [x0, z0, x1, z1] = lot.rect;
  B.at((x0 + x1) / 2, (z0 + z1) / 2);
  C.ground('surface', x0, z0, x1, z1, Y.lot, C.s('concrete', '#d0ccc4'));
  const u0 = -Math.min(7, W / 2 - 0.5);
  const u1 = -u0;
  const v0 = Math.max(3, D - 11);
  const v1 = Math.min(D - 0.5, v0 + 9);
  const st = C.f('block', '#e8f0f4');
  const fs = faces(u0, u1, v0, v1);
  panel(C, 'facade', F, fs.left, 0, fs.left.len, 0, 4.4, st, 0);
  panel(C, 'facade', F, fs.right, 0, fs.right.len, 0, 4.4, st, 0);
  panel(C, 'facade', F, fs.back, 0, fs.back.len, 0, 4.4, st, 0);
  // front: two open bays (dark) with a middle pier and a header
  const blu = C.f('white', '#1c7fc4');
  panel(C, 'facade', F, fs.front, 0, fs.front.len, 3.4, 4.4, blu, 0);
  B.tile = FT.dark;
  B.color = rgb('#ffffff');
  const L = fs.front.len;
  panel(C, 'facade', F, fs.front, 0.4, L / 2 - 0.4, 0, 3.4, null, -0.6, true);
  panel(C, 'facade', F, fs.front, L / 2 + 0.4, L - 0.4, 0, 3.4, null, -0.6, true);
  lbox(C, 'facade', F, u0, u0 + 0.4, v0, v0 + 0.6, 0, 3.4, st, null);
  lbox(C, 'facade', F, u1 - 0.4, u1, v0, v0 + 0.6, 0, 3.4, st, null);
  lbox(C, 'facade', F, -0.4, 0.4, v0, v0 + 0.6, 0, 3.4, st, null);
  top(C, 'facade', F, u0, u1, v0, v1, 4.4, C.f('roofTar', '#ffffff'));
  const sfF = faces(u0, u1, v0, v1);
  signOn(C, F, sfF.front, L / 2, Math.min(L - 1, 6), 4.45, 5.9, 'carwash', 0.1);
  const [a, b, c, d] = F.rect(u0, v0 + 0.6, u1, v1);
  C.box(a, b, c, d, 4.4, 0, 'building');
  for (const pu of [u0 + 0.2, -0.0, u1 - 0.2]) {
    const [p0, p1, p2, p3] = F.rect(pu - 0.25, v0, pu + 0.25, v0 + 0.6);
    C.box(p0, p1, p2, p3, 3.4, 0, 'prop');
  }
  // side wall tag spot facing the lot
  const p = facePoint(F, fs.left, 4, 0);
  C.tagSpot(p.x, 1.6, p.z, p.nx, p.nz, 2.6, 1.6);
}

/** Midtown walk-up apartment building (3–4 stories brick). */
export function buildApartment(C, lot) {
  const { F, w: W, d: D } = lot;
  const r = C.rng.next;
  const B = C.B;
  lotGround(C, lot, 'lawn');
  const cx = (lot.rect[0] + lot.rect[2]) / 2;
  const cz = (lot.rect[1] + lot.rect[3]) / 2;
  B.at(cx, cz);
  const setback = 2.5 + r() * 2;
  const bw = Math.min(W - 2.4, 26);
  const bdp = Math.min(D - setback - 2, 16 + r() * 4);
  const u0 = -bw / 2;
  const u1 = bw / 2;
  const v0 = setback;
  const v1 = setback + bdp;
  const floors = r() < 0.6 ? 3 : 4;
  const h = floors * 3 + 0.4;
  const aptTint = pick(r, ['#ffffff', '#f0e0d0', '#e0d4c8', '#ffece0']);
  const st = C.f('apartment', aptTint, Math.floor(r() * 4) * 0.25, 0.4);
  walls(C, 'facade', F, u0, u1, v0, v1, 0.4, h, st);
  lbox(C, 'facade', F, u0 - 0.05, u1 + 0.05, v0 - 0.05, v1 + 0.05, 0, 0.4, C.f('stone', '#c8c0b0'), null);
  top(C, 'facade', F, u0, u1, v0, v1, h, C.f('roofTar', '#ffffff'));
  parapet(C, F, u0, u1, v0, v1, h, 0.9, C.f('brick', aptTint), C.f('concrete', '#d8d0c0'));
  const fs = walls(C, 'facade', F, u0, u1, v0, v1, h, h + 0.9, C.f('brick', aptTint));
  // cornice
  lbox(C, 'facade', F, u0 - 0.25, u1 + 0.25, v0 - 0.25, v1 + 0.25, h + 0.6, h + 0.95, C.f('concrete', '#d8d0c0'), C.f('concrete', '#d8d0c0'));
  // entrance: door + stone surround + canopy + steps
  const ds = fs.front.len / 2;
  B.tile = FT.doorApt;
  B.color = rgb('#ffffff');
  panel(C, 'facade', F, fs.front, ds - 0.8, ds + 0.8, 0.4, 3.0, null, 0.05, true);
  lbox(C, 'facade', F, -1.3, 1.3, v0 - 1.2, v0, 3.0, 3.25, C.f('white', '#e8e2d4'), C.f('roofTar', '#ffffff'));
  lbox(C, 'facade', F, -1.3, 1.3, v0 - 1.2, v0, 0, 0.4, C.f('concrete', '#d0ccc2'));
  patch(C, F, -1, 1, 0, v0 - 1.2, Y.yard + 0.012, 'concrete', '#d8d4ca');
  // fire escape on one side
  if (C.detail > 0) {
    const face = r() < 0.5 ? fs.left : fs.right;
    const iron = C.f('dark', '#ffffff');
    for (let f = 1; f < floors; f++) {
      const y = 0.4 + f * 3;
      const a = facePoint(F, face, face.len * 0.3, 0);
      const b = facePoint(F, face, face.len * 0.6, 0);
      const a2 = facePoint(F, face, face.len * 0.3, 1.0);
      const b2 = facePoint(F, face, face.len * 0.6, 1.0);
      B.tile = iron.tile;
      B.color = iron.color;
      B.quad('facade', a.x, y, a.z, b.x, y, b.z, b2.x, y, b2.z, a2.x, y, a2.z);
      B.quad('facade', a2.x, y, a2.z, b2.x, y, b2.z, b.x, y, b.z, a.x, y, a.z);
      B.tile = FT.grille;
      B.quad('facade', a2.x, y, a2.z, b2.x, y, b2.z, b2.x, y + 1, b2.z, a2.x, y + 1, a2.z, 0, 0, 3, 1);
    }
  }
  const [x0, z0, x1, z1] = F.rect(u0 - 0.2, v0 - 1.3, u1 + 0.2, v1 + 0.2);
  C.box(x0, z0, x1, z1, h + 1, 0, 'building');
  // shrubs / trees
  if (r() < 0.8) tree(C, F.x(u0 - 1, 1.5), F.z(u0 - 1, 1.5), 'elm', 1.0 + r() * 0.3, r);
  if (r() < 0.6) tree(C, F.x(u1 + 1, D - 3), F.z(u1 + 1, D - 3), 'maple', 1.0, r);
  return { fs, h };
}

void shade;
