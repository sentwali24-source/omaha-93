import { rgb, shade } from './batch.js';
import { FT, FT_SIZE, ST, ST_SIZE, FENCE, FENCE_SIZE } from '../textures.js';
import { LANDMARKS, WATER, FREEWAYS, PARKS, COMMERCIAL_STRIPS, DISTRICTS } from '../../data/map.js';
import { SETS } from '../../data/sets.js';

// Shared state for one city build: batcher, rng, materials/tiles, reserved areas, colliders and
// the outputs (tagSpots, pois, parkingSpots). Passed to every city/*.js builder.

export const Y = {
  road: 0.02,
  paint: 0.035,
  walk: 0.15,
  yard: 0.06,
  dirt: 0.05,
  lot: 0.04,
};

export class CityContext {
  constructor(game, city, batcher, textures) {
    this.game = game;
    this.city = city;
    this.L = game.layout;
    this.col = game.collision;
    this.B = batcher;
    this.tex = textures;
    this.cells = textures.signCells;
    this.detail = game.quality?.detail ?? 1;
    this.rng = game.rng.fork ? game.rng.fork(0xc17) : game.rng;
    this.styleCache = new Map();

    // Areas the generic city must leave alone. Landmark rects get a small margin.
    this.reserved = [];
    for (const l of LANDMARKS) if (l.rect) this.reserved.push({ ...l.rect, kind: 'landmark', id: l.id, pad: 1.5 });
    for (const w of WATER) this.reserved.push({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, kind: 'water', id: w.id, pad: 1 });
    for (const p of PARKS) this.reserved.push({ ...p.rect, kind: 'park', id: p.id, pad: 1 });
    for (const f of FREEWAYS) this.reserved.push({ ...f.corridor, kind: 'freeway', id: f.id, pad: 1 });
    // set hangouts stay clear of buildings and solid props
    this.hoods = SETS.map((s) => ({ set: s, x: s.hood.x, z: s.hood.z }));
    for (const h of this.hoods) this.reserved.push({ x0: h.x - 7, x1: h.x + 7, z0: h.z - 7, z1: h.z + 7, kind: 'hood', id: h.set.id, pad: 0 });

    this.stripsByStreet = new Map();
    for (const s of COMMERCIAL_STRIPS) {
      if (!this.stripsByStreet.has(s.street)) this.stripsByStreet.set(s.street, []);
      this.stripsByStreet.get(s.street).push(s);
    }
    this.districtStyle = Object.fromEntries(DISTRICTS.map((d) => [d.id, d.style]));
    this.streets = new Map();
    for (const s of this.L.nsStreets) this.streets.set(s.id, { ...s, axis: 'ns' });
    for (const s of this.L.ewStreets) this.streets.set(s.id, { ...s, axis: 'ew' });

    this.tagSpots = city.tagSpots;
    this.pois = city.pois;
    this.parkingSpots = city.parkingSpots;
    this._poiCount = 0;
    this._tagCount = 0;
    this.stats = { houses: 0, vacant: 0, stores: 0, towers: 0, trees: 0, props: 0, boxes: 0 };
    // sidewalk-adjacent spots used by props (payphones etc.) to avoid stacking
    this.propSpots = [];
    this.wireSegs = new Map(); // chunk index → [x0,y0,z0,x1,y1,z1,...]
    this.billboardSites = [];
  }

  // ---------------------------------------------------------------- styles
  /** Facade style for Batcher faces: tile from FT with world size, colour tint. */
  f(tile, color = '#ffffff', uo = 0, vb = undefined, size = null) {
    const key = `${tile}|${color}|${uo}|${vb}|${size}`;
    let s = this.styleCache.get(key);
    if (!s) {
      const sz = size || FT_SIZE[tile] || [1, 1];
      s = { tile: FT[tile], color: typeof color === 'string' ? rgb(color) : color, tw: sz[0], th: sz[1], uo, vb };
      if (!s.tile) throw new Error(`unknown facade tile ${tile}`);
      this.styleCache.set(key, s);
    }
    return s;
  }

  /** Surface style (ground atlas). */
  s(tile, color = '#ffffff') {
    const key = `s|${tile}|${color}`;
    let s = this.styleCache.get(key);
    if (!s) {
      const sz = ST_SIZE[tile] || 4;
      s = { tile: ST[tile], color: typeof color === 'string' ? rgb(color) : color, tw: sz, th: sz };
      if (!s.tile) throw new Error(`unknown surface tile ${tile}`);
      this.styleCache.set(key, s);
    }
    return s;
  }

  fence(tile, color = '#ffffff') {
    const key = `fe|${tile}|${color}`;
    let s = this.styleCache.get(key);
    if (!s) {
      const sz = FENCE_SIZE[tile];
      s = { tile: FENCE[tile], color: typeof color === 'string' ? rgb(color) : color, tw: sz[0], th: sz[1] };
      this.styleCache.set(key, s);
    }
    return s;
  }

  /** Set the batcher paint state from a style. */
  use(style) {
    this.B.tile = style.tile;
    this.B.color = style.color;
    return style;
  }

  /** Flat surface rect with a surface style at height y. */
  ground(mat, x0, z0, x1, z1, y, style, uo = 0, vo = 0) {
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
    this.use(style);
    this.B.flat(mat, x0, z0, x1, z1, y, style.tw, style.th, uo, vo);
  }

  /** Sign quad from the sign atlas: vertical rect centred at (x, y, z) facing (nx, nz). */
  sign(cell, x, y, z, nx, nz, w, h, color = '#ffffff', mirror = false) {
    const c = this.cells.get(cell);
    if (!c) return;
    // viewer faces (-nx, -nz); viewer's right = (nz, -nx)
    const px = nz;
    const pz = -nx;
    const hw = w / 2;
    const hh = h / 2;
    this.B.color = typeof color === 'string' ? rgb(color) : color;
    const [u0, v0, u1, v1] = c;
    const ua = mirror ? u1 : u0;
    const ub = mirror ? u0 : u1;
    // a = bottom-left (viewer's left = -p)
    this.B.quadUV('signs',
      x - px * hw + nx * 0.001, y - hh, z - pz * hw + nz * 0.001,
      x + px * hw + nx * 0.001, y - hh, z + pz * hw + nz * 0.001,
      x + px * hw + nx * 0.001, y + hh, z + pz * hw + nz * 0.001,
      x - px * hw + nx * 0.001, y + hh, z - pz * hw + nz * 0.001,
      ua, v0, ub, v0, ub, v1, ua, v1);
  }

  // ---------------------------------------------------------------- reserved areas
  /** True if rect [x0,z0,x1,z1] overlaps any reserved area (optionally of given kinds). */
  isReserved(x0, z0, x1, z1, kinds = null, padOverride = null) {
    for (const r of this.reserved) {
      if (kinds && !kinds.includes(r.kind)) continue;
      const p = padOverride ?? (r.pad || 0);
      if (x1 > r.x0 - p && x0 < r.x1 + p && z1 > r.z0 - p && z0 < r.z1 + p) return r;
    }
    return null;
  }

  pointReserved(x, z, kinds = null, extra = 0, padOverride = null) {
    return this.isReserved(x - extra, z - extra, x + extra, z + extra, kinds, padOverride);
  }

  // ---------------------------------------------------------------- collision / outputs
  box(minX, minZ, maxX, maxZ, maxY, minY = 0, tag = 'building') {
    this.stats.boxes++;
    return this.col.addBox(minX, minZ, maxX, maxZ, maxY, minY, tag);
  }

  zoneId(x, z) {
    return this.L.zoneAt(x, z)?.id || null;
  }

  districtId(x, z) {
    return this.L.districtAt(x, z)?.id || null;
  }

  /** Wall tag spot: (x, y, z) on the wall surface, (nx, nz) outward normal. */
  tagSpot(x, y, z, nx, nz, w = 2.4, h = 1.5) {
    const b = this.L.bounds;
    const fx = x + nx * 1.5;
    const fz = z + nz * 1.5;
    if (fx < b.minX + 1 || fx > b.maxX - 1 || fz < b.minZ + 1 || fz > b.maxZ - 1) return null;
    this._tagCount++;
    const spot = {
      id: `tag-${this._tagCount}`,
      x: +(x + nx * 0.03).toFixed(3),
      y: +y.toFixed(3),
      z: +(z + nz * 0.03).toFixed(3),
      nx,
      nz,
      w,
      h,
      zoneId: this.zoneId(x + nx, z + nz),
      district: this.districtId(x + nx, z + nz),
    };
    this.tagSpots.push(spot);
    return spot;
  }

  /** POI on the sidewalk at (x, z); heading faces the building (direction -n). */
  poi(type, name, x, z, nx, nz, extra = {}) {
    this._poiCount++;
    const heading = Math.atan2(nx, nz); // facing direction (-nx, -nz): atan2(-dx, -dz)
    const p = {
      id: extra.id || `${type}-${this._poiCount}`,
      type,
      name,
      x: +x.toFixed(2),
      z: +z.toFixed(2),
      heading,
      zoneId: this.zoneId(x, z),
      district: this.districtId(x, z),
      ...extra,
    };
    this.pois.push(p);
    return p;
  }

  /** Commercial strip entry for a block side facing `streetId`, or null. */
  stripFor(streetId, block) {
    const list = this.stripsByStreet.get(streetId);
    if (!list) return null;
    const st = this.streets.get(streetId);
    for (const s of list) {
      if (st.axis === 'ns') {
        if (block.z1 > (s.z0 ?? -Infinity) && block.z0 < (s.z1 ?? Infinity)) return s;
      } else if (block.x1 > (s.x0 ?? -Infinity) && block.x0 < (s.x1 ?? Infinity)) return s;
    }
    return null;
  }

  // ---------------------------------------------------------------- spatial lookups
  _indexNodes() {
    this._nodeGrid = new Map();
    for (const n of this.L.nodes) {
      const k = `${Math.floor(n.x / 80)},${Math.floor(n.z / 80)}`;
      if (!this._nodeGrid.has(k)) this._nodeGrid.set(k, []);
      this._nodeGrid.get(k).push(n);
    }
    this._blockGrid = new Map();
    for (const b of this.L.blocks) {
      for (let gx = Math.floor((b.x0 - 4) / 40); gx <= Math.floor((b.x1 + 4) / 40); gx++) {
        for (let gz = Math.floor((b.z0 - 4) / 40); gz <= Math.floor((b.z1 + 4) / 40); gz++) {
          const k = `${gx},${gz}`;
          if (!this._blockGrid.has(k)) this._blockGrid.set(k, []);
          this._blockGrid.get(k).push(b);
        }
      }
    }
  }

  /** Nodes within ~80 m of (x, z). */
  nodesNear(x, z) {
    if (!this._nodeGrid) this._indexNodes();
    const out = [];
    const gx = Math.floor(x / 80);
    const gz = Math.floor(z / 80);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this._nodeGrid.get(`${gx + i},${gz + j}`);
      if (l) out.push(...l);
    }
    return out;
  }

  /** True if (x, z) lies on a paved sidewalk ring (see ground.js). */
  isSidewalkPaved(x, z) {
    if (!this._blockGrid) this._indexNodes();
    const l = this._blockGrid.get(`${Math.floor(x / 40)},${Math.floor(z / 40)}`);
    if (!l || !this.blockPaved) return false;
    const S = 3.5;
    for (const b of l) {
      const p = this.blockPaved.get(b.id);
      if (!p) continue;
      const wx0 = p.w ? b.x0 - S : b.x0;
      const wx1 = p.e ? b.x1 + S : b.x1;
      if (p.n && z >= b.z0 - S && z <= b.z0 && x >= wx0 && x <= wx1) return true;
      if (p.s && z >= b.z1 && z <= b.z1 + S && x >= wx0 && x <= wx1) return true;
      if (p.w && x >= b.x0 - S && x <= b.x0 && z >= b.z0 && z <= b.z1) return true;
      if (p.e && x >= b.x1 && x <= b.x1 + S && z >= b.z0 && z <= b.z1) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- lights / wires
  /** Additive light pool decal on the ground. */
  pool(x, z, radius, color = '#ffa048', k = 1) {
    const B = this.B;
    B.at(x, z);
    B.color = shade(rgb(color), k);
    const y = Y.walk + 0.025;
    B.quad('pool', x - radius, y, z + radius, x + radius, y, z + radius, x + radius, y, z - radius, x - radius, y, z - radius, 0, 0, 1, 1);
  }

  /** Sagging wire between two points (line segments, drawn with the city wires). */
  wire(x0, y0, z0, x1, y1, z1, sag = 0.5) {
    const n = this.detail === 0 ? 3 : 6;
    const key = this.B.cur === -1 ? -1 : this._chunkOf((x0 + x1) / 2, (z0 + z1) / 2);
    let arr = this.wireSegs.get(key);
    if (!arr) this.wireSegs.set(key, (arr = []));
    let px = x0;
    let py = y0;
    let pz = z0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
      arr.push(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
  }

  _chunkOf(x, z) {
    const B = this.B;
    let cx = Math.floor((x - B.minX) / B.chunk);
    let cz = Math.floor((z - B.minZ) / B.chunk);
    cx = cx < 0 ? 0 : cx >= B.cols ? B.cols - 1 : cx;
    cz = cz < 0 ? 0 : cz >= B.rows ? B.rows - 1 : cz;
    return cz * B.cols + cx;
  }

  /** Parking-lot style light pole (fluorescent head + pool). */
  lightPole(x, z, h = 8, kind = 'fluor') {
    const B = this.B;
    B.at(x, z);
    const steel = this.f('metalPlain', '#9ea3a6');
    B.cylinder('facade', x, z, 0, h, 0.12, 0.09, 5, steel, false);
    B.box('facade', x - 0.45, h, z - 0.3, x + 0.45, h + 0.25, z + 0.3, { all: steel, ny: false });
    const c = this.cells.get(`lamp:${kind}`);
    if (c) {
      B.color = rgb('#ffffff');
      B.quadUV('signs', x - 0.4, h - 0.01, z - 0.25, x + 0.4, h - 0.01, z - 0.25, x + 0.4, h - 0.01, z + 0.25, x - 0.4, h - 0.01, z + 0.25, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    }
    this.pool(x, z, 10, kind === 'fluor' ? '#dfeaff' : '#ffa048', 0.7);
    this.box(x - 0.15, z - 0.15, x + 0.15, z + 0.15, h, 0, 'prop');
  }

  /** Red aircraft beacon on an antenna tip. */
  beacon(x, y, z) {
    const c = this.cells.get('lamp:red');
    if (!c) return;
    const B = this.B;
    B.color = rgb('#ffffff');
    const s = 0.25;
    B.quadUV('signs', x - s, y, z, x + s, y, z, x + s, y + s * 2, z, x - s, y + s * 2, z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    B.quadUV('signs', x + s, y, z, x - s, y, z, x - s, y + s * 2, z, x + s, y + s * 2, z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    B.quadUV('signs', x, y, z + s, x, y, z - s, x, y + s * 2, z - s, x, y + s * 2, z + s, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    B.quadUV('signs', x, y, z - s, x, y, z + s, x, y + s * 2, z + s, x, y + s * 2, z - s, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }

  /** Is (x, z) within r of an already claimed prop spot? (spatial hash, 8 m cells) */
  spotTaken(x, z, r) {
    const g = this._spotGrid;
    if (!g) return false;
    const cx = Math.floor(x / 8);
    const cz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = g.get((cx + i) * 100003 + (cz + j));
        if (!l) continue;
        for (const p of l) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r) ** 2) return true;
      }
    }
    return false;
  }

  /** Can a prop / small structure go at (x, z)? (not reserved, not on another prop) */
  claimSpot(x, z, r = 1.2, kinds = ['landmark', 'water', 'hood']) {
    if (this.pointReserved(x, z, kinds, r * 0.5)) return false;
    if (this.spotTaken(x, z, r)) return false;
    const p = { x, z, r };
    this.propSpots.push(p);
    if (!this._spotGrid) this._spotGrid = new Map();
    const k = Math.floor(x / 8) * 100003 + Math.floor(z / 8);
    if (!this._spotGrid.has(k)) this._spotGrid.set(k, []);
    this._spotGrid.get(k).push(p);
    return true;
  }
}
