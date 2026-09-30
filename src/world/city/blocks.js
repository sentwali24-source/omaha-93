import { Frame } from './batch.js';
import { Y } from './context.js';
import { buildHouse, dressHouseLot, buildVacant, buildBoarded, buildChurch, lotGround, patch } from './houses.js';
import { buildStorefront, buildCornerStore, buildGasStation, buildParkingLot, buildUsedCarLot, buildCarWash, buildApartment, dumpster } from './commercial.js';
import { buildDowntownBlock, buildOldMarketBlock, buildIndustrialBlock, buildRiverfrontBlock, buildLandmarkLeftovers, buildHangout } from './downtown.js';
import { BUSINESSES } from './names.js';
import { tree, fenceRun } from './kit.js';

// Block subdivision. Each block side that faces a paved street claims a strip (commercial strips
// first, then the long residential sides, then whatever is left of the short sides); strips are cut
// into lots; lots get a use (house, storefront, vacant, church, gas station...). Residential blocks
// with houses on both long sides get a gravel alley between the back yards.

const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
const MIDTOWN_COM = new Set(['dodge', 'farnam', 'leavenworth', 'douglas']);
const GAS_STREETS = new Set(['24th', '30th', '16th', 'lake', 'ames', 'hamilton', 'cuming', 'fort', 'dodge', 'farnam', 'leavenworth', '42nd', 'douglas']);
const KOUNTZE = { x0: 140, x1: 380, z0: -870, z1: -720 };

/** Cycling picker over a business list, with type preferences. */
class BizPicker {
  constructor(list, rng) {
    this.list = list;
    this.rng = rng;
    this.order = rng.shuffle([...list.keys()]);
    this.i = 0;
  }

  next(prefer = null) {
    if (prefer) {
      const cands = this.list.filter((b) => b.poi === prefer);
      if (cands.length) return cands[Math.floor(this.rng.next() * cands.length)];
    }
    const b = this.list[this.order[this.i % this.order.length]];
    this.i++;
    return b;
  }
}

export async function buildBlocks(C, onProgress = () => {}) {
  const { L } = C;
  const rng = C.rng;
  C.biz = {
    north: new BizPicker(BUSINESSES.north, rng),
    midtown: new BizPicker(BUSINESSES.midtown, rng),
    downtown: new BizPicker(BUSINESSES.downtown, rng),
    oldmarket: new BizPicker(BUSINESSES.oldmarket, rng),
    industrial: new BizPicker(BUSINESSES.industrial, rng),
  };
  C.zoneHasStore = new Set();
  C.streetHasFood = new Set();
  C.counts = { gas: 0, church: 0, carwash: 0, usedcar: 0, clothes: 0, garage: 0 };
  const blocks = L.blocks;
  let t0 = performance.now();
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    try {
      buildBlock(C, blk);
    } catch (err) {
      console.error('[city] block', blk.id, 'failed', err);
    }
    if (performance.now() - t0 > 40) {
      onProgress(i / blocks.length);
      await new Promise((r) => setTimeout(r));
      t0 = performance.now();
    }
  }
}

function buildBlock(C, blk) {
  if (blk.water || blk.park) return;
  const style = C.districtStyle[blk.district];
  if (blk.landmark) {
    buildLandmarkLeftovers(C, blk);
    return;
  }
  switch (style) {
    case 'houses':
      residentialBlock(C, blk, 'north');
      break;
    case 'midtown':
      residentialBlock(C, blk, 'midtown');
      break;
    case 'offices':
      buildDowntownBlock(C, blk);
      break;
    case 'oldmarket':
      buildOldMarketBlock(C, blk);
      break;
    case 'warehouses':
    case 'industrial':
      buildIndustrialBlock(C, blk, style);
      break;
    case 'riverfront':
      buildRiverfrontBlock(C, blk);
      break;
    default:
      residentialBlock(C, blk, 'north');
  }
}

/** Compute side strips for a block. Returns { strips, claimed }. */
export function blockStrips(C, blk, classify, opts = {}) {
  const r = C.rng.next;
  const p = C.blockPaved.get(blk.id);
  const bw = blk.x1 - blk.x0;
  const bd = blk.z1 - blk.z0;
  const len = { n: bw, s: bw, w: bd, e: bd };
  const perp = { n: bd, s: bd, w: bw, e: bw };
  const infos = {};
  for (const side of ['n', 's', 'w', 'e']) {
    if (!p[side]) continue;
    const street = blk.frontage[side];
    infos[side] = { side, street, kind: classify(side, street) };
  }
  const order = Object.values(infos).sort((a, b) => (a.kind === b.kind ? len[b.side] - len[a.side] : a.kind === 'com' ? -1 : 1));
  const claimed = { n: 0, s: 0, w: 0, e: 0 };
  const strips = [];
  for (const si of order) {
    const o = OPP[si.side];
    const oi = infos[o];
    const avail = perp[si.side] - claimed[o];
    let d;
    let alley = 0;
    if (si.kind === 'com') {
      const want = opts.comDepth ? opts.comDepth() : 15 + r() * 6;
      d = Math.min(want, oi && !claimed[o] ? avail * 0.55 : avail);
    } else if (oi && !claimed[o] && oi.kind === 'res') {
      alley = opts.alley !== false && avail >= 34 ? 4 : 0;
      d = Math.min((avail - alley) / 2, opts.maxDepth || 34);
    } else d = Math.min(avail, opts.maxDepth || 34);
    if (d < 8) continue;
    const a0 = si.side === 'n' || si.side === 's' ? claimed.w : claimed.n;
    const a1 = si.side === 'n' || si.side === 's' ? claimed.e : claimed.s;
    const Ls = len[si.side] - a0 - a1;
    if (Ls < 8) continue;
    claimed[si.side] = d;
    strips.push({ ...si, d, a0, a1, L: Ls, alley });
  }
  return { strips, claimed, infos, paved: p };
}

/** Cut a strip into lots of width in [minW, maxW]. */
export function stripLots(C, blk, strip, minW, maxW) {
  const r = C.rng.next;
  const widths = [];
  let rem = strip.L;
  while (rem > 0) {
    if (rem < minW * 1.6) {
      widths.push(rem);
      break;
    }
    const w = Math.min(rem - minW * 0.6, minW + r() * (maxW - minW));
    widths.push(w);
    rem -= w;
  }
  const lots = [];
  let s = strip.a0;
  const p = C.blockPaved.get(blk.id);
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const d = strip.d;
    let F;
    let rect;
    const side = strip.side;
    if (side === 'n') {
      const xa = blk.x0 + s;
      F = new Frame(xa + w / 2, blk.z0, 0, -1);
      rect = [xa, blk.z0, xa + w, blk.z0 + d];
    } else if (side === 's') {
      const xa = blk.x0 + s;
      F = new Frame(xa + w / 2, blk.z1, 0, 1);
      rect = [xa, blk.z1 - d, xa + w, blk.z1];
    } else if (side === 'w') {
      const za = blk.z0 + s;
      F = new Frame(blk.x0, za + w / 2, -1, 0);
      rect = [blk.x0, za, blk.x0 + d, za + w];
    } else {
      const za = blk.z0 + s;
      F = new Frame(blk.x1, za + w / 2, 1, 0);
      rect = [blk.x1 - d, za, blk.x1, za + w];
    }
    const lot = { block: blk, side, street: strip.street, kind: strip.kind, F, w, d, rect, index: i, count: widths.length, alley: strip.alley > 0 };
    // which local end (u = -w/2 'neg' / +w/2 'pos') sits on a paved side-street corner
    for (const [key, u] of [['neg', -w / 2], ['pos', w / 2]]) {
      const ex = F.x(u, 0);
      const ez = F.z(u, 0);
      let cornerSide = null;
      if (side === 'n' || side === 's') {
        if (Math.abs(ex - blk.x0) < 0.5 && p.w && strip.a0 < 0.5) cornerSide = 'w';
        if (Math.abs(ex - blk.x1) < 0.5 && p.e && strip.a1 < 0.5) cornerSide = 'e';
      } else {
        if (Math.abs(ez - blk.z0) < 0.5 && p.n && strip.a0 < 0.5) cornerSide = 'n';
        if (Math.abs(ez - blk.z1) < 0.5 && p.s && strip.a1 < 0.5) cornerSide = 's';
      }
      if (cornerSide) {
        lot.cornerSide = key;
        lot.cornerStreet = blk.frontage[cornerSide];
      }
    }
    lots.push(lot);
    s += w;
  }
  return lots;
}

/** Flat ground over a rect, skipping reserved areas (quadtree split). */
export function groundAvoid(C, x0, z0, x1, z1, y, style, depth = 0) {
  if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
  const res = C.isReserved(x0, z0, x1, z1, ['landmark', 'water', 'park']);
  if (!res) {
    C.B.at((x0 + x1) / 2, (z0 + z1) / 2);
    C.ground('surface', x0, z0, x1, z1, y, style);
    return;
  }
  // fully inside the reserved rect → skip
  const p = res.pad || 0;
  if (x0 >= res.x0 - p && x1 <= res.x1 + p && z0 >= res.z0 - p && z1 <= res.z1 + p) return;
  if (depth > 4) return;
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  groundAvoid(C, x0, z0, mx, mz, y, style, depth + 1);
  groundAvoid(C, mx, z0, x1, mz, y, style, depth + 1);
  groundAvoid(C, x0, mz, mx, z1, y, style, depth + 1);
  groundAvoid(C, mx, mz, x1, z1, y, style, depth + 1);
}

/** Trim a lot so it does not overlap reserved areas; returns false if nothing usable remains. */
export function fitLot(C, lot, minD = 8) {
  const kinds = ['landmark', 'water', 'park', 'freeway'];
  if (!C.isReserved(...lot.rect, kinds)) return true;
  // shrink depth (the back of the lot) in 1 m steps
  for (let d = lot.d - 1; d >= minD; d -= 1) {
    const rect = lot.F.rect(-lot.w / 2, 0, lot.w / 2, d);
    if (!C.isReserved(...rect, kinds)) {
      lot.d = d;
      lot.rect = rect;
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ residential / commercial
function residentialBlock(C, blk, district) {
  const r = C.rng.next;
  const classify = (side, street) => {
    if (C.stripFor(street, blk)) return 'com';
    if (district === 'midtown' && MIDTOWN_COM.has(street)) return 'com';
    return 'res';
  };
  const { strips, claimed } = blockStrips(C, blk, classify, { alley: true, maxDepth: district === 'midtown' ? 30 : 26 });
  const inKountze = district === 'north' && blk.cx > KOUNTZE.x0 && blk.cx < KOUNTZE.x1 && blk.cz > KOUNTZE.z0 && blk.cz < KOUNTZE.z1;
  const near24 = district === 'north' && Math.abs(blk.cx - 140) < 80;

  // interior: alley gravel or backyard lawn / commercial dirt
  const ix0 = blk.x0 + claimed.w;
  const ix1 = blk.x1 - claimed.e;
  const iz0 = blk.z0 + claimed.n;
  const iz1 = blk.z1 - claimed.s;
  if (ix1 - ix0 > 0.5 && iz1 - iz0 > 0.5) {
    const alleyStrip = strips.find((s) => s.alley);
    const hasCom = strips.some((s) => s.kind === 'com');
    const st = alleyStrip ? C.s('gravel', '#ffffff') : hasCom && district === 'north' ? C.s('dirt', '#c8c0b0') : C.s('lawn', '#e8f0e0');
    groundAvoid(C, ix0, iz0, ix1, iz1, Y.dirt, st);
    if (alleyStrip && C.detail > 0 && r() < 0.35) {
      // a dumpster or two in the alley
      const cx = (ix0 + ix1) / 2;
      const cz = (iz0 + iz1) / 2;
      if (!C.pointReserved(cx, cz, null, 3)) {
        const F = new Frame(cx, cz, 0, -1);
        C.B.at(cx, cz);
        if (ix1 - ix0 < iz1 - iz0) dumpster(C, new Frame(cx, cz, -1, 0), 0, 0);
        else dumpster(C, F, 0, 0);
      }
    }
  }

  for (const strip of strips) {
    const com = strip.kind === 'com';
    const lots = com ? stripLots(C, blk, strip, 9, 17) : inKountze ? stripLots(C, blk, strip, 15, 21) : district === 'midtown' ? stripLots(C, blk, strip, 12, 18) : stripLots(C, blk, strip, 11, 15.5);
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      lot.zone = C.zoneId(lot.F.x(0, lot.d / 2), lot.F.z(0, lot.d / 2));
      lot.district = district;
      if (C.isReserved(...lot.rect, ['hood'])) {
        buildHangout(C, lot);
        lot.use = 'hangout';
        continue;
      }
      if (!fitLot(C, lot, com ? 10 : 12)) {
        lot.use = 'skip';
        continue;
      }
      if (com) comLot(C, lot, lots, i, district, near24);
      else resLot(C, lot, lots, i, district, inKountze, near24);
    }
    // second pass: storefront side walls exposed to open neighbours (vacant, parking, houses,
    // corners) get tag spots
    resolveTags(C, lots, strip.side);
  }
}

function resLot(C, lot, lots, i, district, kountze, near24) {
  const r = C.rng.next;
  if (lot.use) return; // merged into a previous lot
  const vacancy = district === 'midtown' ? 0.05 : near24 ? 0.24 : 0.14;
  // church on a double lot
  if (district === 'north' && C.counts.church < 7 && !kountze && i + 1 < lots.length && !lots[i + 1].use && lot.w + lots[i + 1].w >= 24 && r() < 0.035) {
    const merged = mergeLots(lot, lots[i + 1]);
    lots[i + 1].use = 'merged';
    if (fitLot(C, merged, 20)) {
      buildChurch(C, merged, C.counts.church++);
      lot.use = 'church';
      return;
    }
  }
  // midtown apartments on double lots
  if (district === 'midtown' && i + 1 < lots.length && !lots[i + 1].use && r() < 0.42) {
    const merged = mergeLots(lot, lots[i + 1]);
    lots[i + 1].use = 'merged';
    if (fitLot(C, merged, 16)) {
      buildApartment(C, merged);
      lot.use = 'apartment';
      return;
    }
  }
  // corner store on residential corners
  if (district === 'north' && lot.cornerSide && r() < 0.08) {
    const biz = pickBiz(C, 'north', lot, 'store');
    buildCornerStore(C, lot, biz, lot.cornerSide);
    markBiz(C, lot, biz);
    lot.use = 'store';
    return;
  }
  if (r() < vacancy) {
    buildVacant(C, lot);
    lot.use = 'vacant';
    billboardSite(C, lot);
    return;
  }
  if (district === 'midtown' && r() < 0.05) {
    buildParkingLot(C, lot, { fill: 0.7 });
    lot.use = 'parking';
    return;
  }
  const boarded = district === 'north' && r() < (near24 ? 0.1 : 0.05);
  if (boarded) {
    buildBoarded(C, lot, { alley: lot.alley });
    lot.use = 'boarded';
    return;
  }
  lotGround(C, lot, r() < 0.2 ? 'dryGrass' : 'lawn', r() < 0.5 ? '#ffffff' : '#e8f0d8');
  const info = buildHouse(C, lot, { victorian: kountze && r() < 0.8, midtown: district === 'midtown', alley: lot.alley });
  dressHouseLot(C, lot, info, { alley: lot.alley });
  lot.use = 'house';
}

function comLot(C, lot, lots, i, district, near24) {
  const r = C.rng.next;
  if (lot.use) return;
  // real 1993 business from NAMED_POIS that sits on this lot (e.g. Time Out Foods on 30th)
  const named = C.namedAt?.(lot);
  if (named) {
    buildStorefront(C, lot, named.biz, { stories: 1, corner: lot.cornerSide || null, deferTags: true });
    named.done = true;
    C.streetHasFood.add(lot.street);
    lot.use = 'store';
    return;
  }
  const bizDistrict = district === 'midtown' ? 'midtown' : 'north';
  const street = lot.street;
  const major = C.streets.get(street)?.major;
  // gas station on a major corner (merge with the neighbour if narrow)
  if (lot.cornerSide && GAS_STREETS.has(street) && C.counts.gas < 16 && r() < (district === 'midtown' ? 0.35 : 0.22)) {
    let g = lot;
    const ni = lot.cornerSide === 'neg' ? i + 1 : i - 1;
    if (lot.w < 26 && lots[ni] && !lots[ni].use) {
      g = mergeLots(lot, lots[ni]);
      lots[ni].use = 'merged';
    }
    if (g.w >= 22 && g.d >= 18 && fitLot(C, g, 18)) {
      buildGasStation(C, g, C.counts.gas++);
      lot.use = 'gas';
      return;
    }
    if (g !== lot && lots[ni]) lots[ni].use = null;
  }
  if (street === '30th' && C.counts.carwash < 1 && lot.w >= 13 && !lot.cornerSide && r() < 0.3) {
    buildCarWash(C, lot);
    C.counts.carwash++;
    lot.use = 'carwash';
    return;
  }
  if (district === 'midtown' && major && C.counts.usedcar < 2 && lot.w >= 16 && r() < 0.08) {
    buildUsedCarLot(C, lot);
    C.counts.usedcar++;
    lot.use = 'usedcar';
    return;
  }
  const vac = district === 'midtown' ? 0.08 : near24 && street === '24th' ? 0.3 : 0.2;
  const q = r();
  if (q < vac) {
    buildVacant(C, lot);
    lot.use = 'vacant';
    billboardSite(C, lot, true);
    return;
  }
  if (q < vac + (district === 'midtown' ? 0.14 : 0.05)) {
    buildParkingLot(C, lot, { fill: 0.6, sign: district === 'midtown' ? 'parking' : 'onlyparking' });
    lot.use = 'parking';
    return;
  }
  if (district === 'north' && q < vac + 0.05 + 0.12) {
    lotGround(C, lot, 'lawn');
    const info = buildHouse(C, lot, { alley: false });
    dressHouseLot(C, lot, info, {});
    lot.use = 'house';
    return;
  }
  // storefront
  let prefer = null;
  if (!C.zoneHasStore.has(lot.zone)) prefer = 'store';
  else if ((street === '24th' || street === '30th') && !C.streetHasFood.has(street)) prefer = 'food';
  const biz = pickBiz(C, bizDistrict, lot, prefer);
  const boarded = district === 'north' && !biz.poi && r() < 0.12;
  const closed = !boarded && !biz.poi && r() < 0.25;
  if (lot.cornerSide && r() < 0.6 && biz.poi === 'store') buildCornerStore(C, lot, biz, lot.cornerSide);
  else buildStorefront(C, lot, biz, { boarded, closed, corner: lot.cornerSide || null, deferTags: true, sideSign: !!lot.cornerSide, stories: district === 'midtown' && r() < 0.5 ? 2 : undefined });
  if (!boarded) markBiz(C, lot, biz);
  lot.use = boarded ? 'boardedStore' : 'store';
}

const OPEN_USES = new Set(['vacant', 'parking', 'house', 'boarded', 'hangout', 'skip', 'gas', 'usedcar']);

/** Neighbour lot at a lot's local 'neg' / 'pos' end (lots run along +x / +z in the strip). */
function neighbour(lots, i, key, side) {
  const forward = side === 'n' || side === 'e';
  const prev = key === 'neg' ? forward : !forward;
  return lots[prev ? i - 1 : i + 1] || null;
}

function resolveTags(C, lots, side) {
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (!lot.tagCands) continue;
    for (const c of lot.tagCands) {
      const nb = neighbour(lots, i, c.key, side);
      const open = lot.tagCorner === c.key || !nb || OPEN_USES.has(nb.use);
      if (open) C.tagSpot(c.p.x, 1.6, c.p.z, c.p.nx, c.p.nz, 2.6, 1.6);
    }
  }
}

/** Remember vacant lots on busy streets as billboard sites (placed later, spread out). */
function billboardSite(C, lot, strip = false) {
  const st = C.streets.get(lot.street);
  if (!strip && !st?.major) return;
  if (lot.w < 10 || lot.d < 10) return;
  C.billboardSites.push({ x: lot.F.x(0, Math.min(lot.d - 2, 7)), z: lot.F.z(0, Math.min(lot.d - 2, 7)), nx: lot.F.fx, nz: lot.F.fz });
}

function pickBiz(C, district, lot, prefer) {
  const b = C.biz[district].next(prefer);
  return b;
}

function markBiz(C, lot, biz) {
  if (biz.poi === 'store') C.zoneHasStore.add(lot.zone);
  if (biz.poi === 'food') C.streetHasFood.add(lot.street);
}

function mergeLots(a, b) {
  const rect = [Math.min(a.rect[0], b.rect[0]), Math.min(a.rect[1], b.rect[1]), Math.max(a.rect[2], b.rect[2]), Math.max(a.rect[3], b.rect[3])];
  const w = a.w + b.w;
  // frame centre = midpoint of the two fronts
  const cx = (a.F.ox + b.F.ox) / 2;
  const cz = (a.F.oz + b.F.oz) / 2;
  const F = new Frame(cx, cz, a.F.fx, a.F.fz);
  const m = { ...a, F, w, rect, merged: true };
  m.cornerSide = a.cornerSide || b.cornerSide;
  if (a.cornerSide || b.cornerSide) {
    // recompute which end of the merged lot is the corner
    const src = a.cornerSide ? a : b;
    const endU = src.cornerSide === 'neg' ? -src.w / 2 : src.w / 2;
    const ex = src.F.x(endU, 0);
    const ez = src.F.z(endU, 0);
    const un = (ex - F.ox) * F.ux + (ez - F.oz) * F.uz;
    m.cornerSide = un < 0 ? 'neg' : 'pos';
  }
  return m;
}

void tree;
void fenceRun;
void patch;
