import * as THREE from 'three';

// Geometry batcher for the static city.
//
// Everything static is written straight into growable typed arrays, bucketed by
// (spatial chunk, material). At the end each bucket becomes ONE mesh, so the whole city is a few
// draw calls per visible chunk and the renderer frustum-culls whole chunks.
//
// Vertex layout per bucket: position f32x3, normal i8x3 (normalized), uv f32x2,
// color u8x3 (normalized, linear), and for atlas-tiled materials tile u8x4 = atlas rect in
// 1/16 units (x, y, w, h; y from the bottom). The atlas material (atlasMaterial.js) wraps uv with
// fract() inside that rect, so tiling textures can live in one atlas.
//
// Winding: quad(a, b, c, d) is counter-clockwise seen from the front (a = bottom-left,
// b = bottom-right, c = top-right, d = top-left); the normal is (b - a) x (d - a).

class Grow {
  constructor(Type, cap) {
    this.T = Type;
    this.a = new Type(cap);
    this.n = 0;
  }

  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const b = new this.T(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }

  view() {
    return this.a.slice(0, this.n);
  }
}

export class Bucket {
  constructor(tiled) {
    const cap = 1024;
    this.pos = new Grow(Float32Array, cap * 3);
    this.nrm = new Grow(Int8Array, cap * 3);
    this.uv = new Grow(Float32Array, cap * 2);
    this.col = new Grow(Uint8Array, cap * 3);
    this.tile = tiled ? new Grow(Uint8Array, cap * 4) : null;
    this.idx = new Grow(Uint32Array, cap * 6);
    this.vcount = 0;
  }

  get empty() {
    return this.vcount === 0;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.view(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.view(), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.view(), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.view(), 3, true));
    if (this.tile) g.setAttribute('tile', new THREE.BufferAttribute(this.tile.view(), 4, false));
    const idx = this.idx.view();
    g.setIndex(new THREE.BufferAttribute(this.vcount < 65536 ? new Uint16Array(idx) : idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _c = new THREE.Color();

/** '#rrggbb' | number | [r,g,b] (0..1 sRGB) → linear [r,g,b] 0..255 */
export function rgb(c) {
  if (Array.isArray(c)) _c.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  else _c.set(c);
  return [Math.round(_c.r * 255), Math.round(_c.g * 255), Math.round(_c.b * 255)];
}

/** Scale a linear color triple (returns a new array). */
export function shade(col, k) {
  return [Math.min(255, Math.round(col[0] * k)), Math.min(255, Math.round(col[1] * k)), Math.min(255, Math.round(col[2] * k))];
}

export const WHITE = [255, 255, 255];

export class Batcher {
  /**
   * @param {object} bounds {minX, maxX, minZ, maxZ} area to chunk
   * @param {number} chunk chunk size in meters
   * @param {object} materials key → { tiled: bool }
   */
  constructor(bounds, chunk, materials) {
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.chunk = chunk;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / chunk));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / chunk));
    this.materials = materials;
    this.buckets = new Map(); // `${chunk}|${mat}` → Bucket
    this.cur = 0; // current chunk index (main grid), -1 = global
    this.px = 0; // current representative point (materials with their own `chunk` size use it)
    this.pz = 0;
    // current paint state
    this.color = WHITE;
    this.tile = [0, 0, 16, 16];
  }

  /** Select the chunk that the following geometry belongs to (by a representative point). */
  at(x, z) {
    this.px = x;
    this.pz = z;
    let cx = Math.floor((x - this.minX) / this.chunk);
    let cz = Math.floor((z - this.minZ) / this.chunk);
    cx = cx < 0 ? 0 : cx >= this.cols ? this.cols - 1 : cx;
    cz = cz < 0 ? 0 : cz >= this.rows ? this.rows - 1 : cz;
    this.cur = cz * this.cols + cx;
    return this;
  }

  /** Put the following geometry in a chunk-independent bucket (e.g. horizon). */
  global() {
    this.cur = -1;
    return this;
  }

  /** Chunk index of the current point for a material (own grid size if it defines `chunk`). */
  chunkFor(def) {
    if (this.cur === -1 || !def.chunk) return this.cur;
    const size = def.chunk;
    const cols = Math.ceil((this.cols * this.chunk) / size);
    const rows = Math.ceil((this.rows * this.chunk) / size);
    let cx = Math.floor((this.px - this.minX) / size);
    let cz = Math.floor((this.pz - this.minZ) / size);
    cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx;
    cz = cz < 0 ? 0 : cz >= rows ? rows - 1 : cz;
    return 10000 + cz * cols + cx;
  }

  bucket(mat) {
    const def = this.materials[mat];
    if (!def) throw new Error(`batch: unknown material ${mat}`);
    const ci = this.chunkFor(def);
    const key = `${ci}|${mat}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = new Bucket(!!def.tiled);
      b.mat = mat;
      b.chunkIndex = ci;
      this.buckets.set(key, b);
    }
    return b;
  }

  _vert(b, x, y, z, nx, ny, nz, u, v) {
    const p = b.pos;
    p.reserve(3);
    p.a[p.n++] = x;
    p.a[p.n++] = y;
    p.a[p.n++] = z;
    const n = b.nrm;
    n.reserve(3);
    n.a[n.n++] = Math.round(nx * 127);
    n.a[n.n++] = Math.round(ny * 127);
    n.a[n.n++] = Math.round(nz * 127);
    const t = b.uv;
    t.reserve(2);
    t.a[t.n++] = u;
    t.a[t.n++] = v;
    const c = b.col;
    c.reserve(3);
    const col = this.color;
    c.a[c.n++] = col[0];
    c.a[c.n++] = col[1];
    c.a[c.n++] = col[2];
    if (b.tile) {
      const tt = b.tile;
      tt.reserve(4);
      const tl = this.tile;
      tt.a[tt.n++] = tl[0];
      tt.a[tt.n++] = tl[1];
      tt.a[tt.n++] = tl[2];
      tt.a[tt.n++] = tl[3];
    }
    return b.vcount++;
  }

  /** Quad a→b→c→d counter-clockwise from the front; uv a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1). */
  quad(mat, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const b = this.bucket(mat);
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const fx = dx - ax;
    const fy = dy - ay;
    const fz = dz - az;
    let nx = ey * fz - ez * fy;
    let ny = ez * fx - ex * fz;
    let nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i = this._vert(b, ax, ay, az, nx, ny, nz, u0, v0);
    this._vert(b, bx, by, bz, nx, ny, nz, u1, v0);
    this._vert(b, cx, cy, cz, nx, ny, nz, u1, v1);
    this._vert(b, dx, dy, dz, nx, ny, nz, u0, v1);
    const ix = b.idx;
    ix.reserve(6);
    ix.a[ix.n++] = i;
    ix.a[ix.n++] = i + 1;
    ix.a[ix.n++] = i + 2;
    ix.a[ix.n++] = i;
    ix.a[ix.n++] = i + 2;
    ix.a[ix.n++] = i + 3;
  }

  /** Quad with explicit per-corner uvs (for signs / atlas cells). */
  quadUV(mat, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ua, va, ub, vb, uc, vc, ud, vd) {
    const b = this.bucket(mat);
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const fx = dx - ax;
    const fy = dy - ay;
    const fz = dz - az;
    let nx = ey * fz - ez * fy;
    let ny = ez * fx - ex * fz;
    let nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i = this._vert(b, ax, ay, az, nx, ny, nz, ua, va);
    this._vert(b, bx, by, bz, nx, ny, nz, ub, vb);
    this._vert(b, cx, cy, cz, nx, ny, nz, uc, vc);
    this._vert(b, dx, dy, dz, nx, ny, nz, ud, vd);
    const ix = b.idx;
    ix.reserve(6);
    ix.a[ix.n++] = i;
    ix.a[ix.n++] = i + 1;
    ix.a[ix.n++] = i + 2;
    ix.a[ix.n++] = i;
    ix.a[ix.n++] = i + 2;
    ix.a[ix.n++] = i + 3;
  }

  /** Triangle a→b→c counter-clockwise from the front. */
  tri(mat, ax, ay, az, bx, by, bz, cx, cy, cz, ua = 0, va = 0, ub = 1, vb = 0, uc = 0.5, vc = 1) {
    const b = this.bucket(mat);
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const fx = cx - ax;
    const fy = cy - ay;
    const fz = cz - az;
    let nx = ey * fz - ez * fy;
    let ny = ez * fx - ex * fz;
    let nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i = this._vert(b, ax, ay, az, nx, ny, nz, ua, va);
    this._vert(b, bx, by, bz, nx, ny, nz, ub, vb);
    this._vert(b, cx, cy, cz, nx, ny, nz, uc, vc);
    const ix = b.idx;
    ix.reserve(3);
    ix.a[ix.n++] = i;
    ix.a[ix.n++] = i + 1;
    ix.a[ix.n++] = i + 2;
  }

  /** Horizontal rectangle at height y facing up, world-anchored uv (tw, th meters per repeat). */
  flat(mat, x0, z0, x1, z1, y, tw = 1, th = tw, uo = 0, vo = 0) {
    this.quad(mat, x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, x0 / tw + uo, -z1 / th + vo, x1 / tw + uo, -z0 / th + vo);
  }

  /**
   * Vertical wall from (x0,z0) to (x1,z1), seen from the side where (x0,z0) is on the left.
   * uv: u runs along the wall (tw m per repeat, offset uo), v = (y - vBase) / th.
   */
  wall(mat, x0, z0, x1, z1, y0, y1, tw = 1, th = 1, uo = 0, vBase = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.quad(mat, x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, uo, (y0 - vBase) / th, uo + len / tw, (y1 - vBase) / th);
  }

  /**
   * Axis-aligned box. faces: object with optional keys px nx pz nz py ny, each either false (skip)
   * or a style { tile, color, tw, th, uo, vb }. `all` style applies to faces not listed.
   */
  box(mat, minX, minY, minZ, maxX, maxY, maxZ, faces = {}) {
    const all = faces.all;
    const sPX = faces.px ?? all;
    const sNX = faces.nx ?? all;
    const sPZ = faces.pz ?? all;
    const sNZ = faces.nz ?? all;
    const sPY = faces.py ?? all;
    const sNY = faces.ny ?? false;
    const prevTile = this.tile;
    const prevColor = this.color;
    const apply = (s) => {
      this.tile = s.tile || prevTile;
      this.color = s.color || prevColor;
    };
    if (sPX) {
      apply(sPX);
      this.wall(mat, maxX, maxZ, maxX, minZ, minY, maxY, sPX.tw || 1, sPX.th || 1, sPX.uo || 0, sPX.vb ?? minY);
    }
    if (sNX) {
      apply(sNX);
      this.wall(mat, minX, minZ, minX, maxZ, minY, maxY, sNX.tw || 1, sNX.th || 1, sNX.uo || 0, sNX.vb ?? minY);
    }
    if (sPZ) {
      apply(sPZ);
      this.wall(mat, minX, maxZ, maxX, maxZ, minY, maxY, sPZ.tw || 1, sPZ.th || 1, sPZ.uo || 0, sPZ.vb ?? minY);
    }
    if (sNZ) {
      apply(sNZ);
      this.wall(mat, maxX, minZ, minX, minZ, minY, maxY, sNZ.tw || 1, sNZ.th || 1, sNZ.uo || 0, sNZ.vb ?? minY);
    }
    if (sPY) {
      apply(sPY);
      this.flat(mat, minX, minZ, maxX, maxZ, maxY, sPY.tw || 1, sPY.th || sPY.tw || 1);
    }
    if (sNY) {
      apply(sNY);
      this.quad(mat, minX, minY, minZ, maxX, minY, minZ, maxX, minY, maxZ, minX, minY, maxZ, 0, 0, 1, 1);
    }
    this.tile = prevTile;
    this.color = prevColor;
  }

  /** Box centred at (x, z) with half extents and a single style for all faces. */
  cbox(mat, x, y0, z, hx, y1, hz, style, top = true) {
    this.box(mat, x - hx, y0, z - hz, x + hx, y1, z + hz, top ? { all: style } : { all: style, py: false });
  }

  /**
   * Vertical prism (n-sided cylinder), optionally tapered, axis at (x, z).
   * uv: u around (tw m per repeat), v by height.
   */
  cylinder(mat, x, z, y0, y1, r0, r1 = r0, sides = 6, style = null, cap = true, phase = 0) {
    const prevTile = this.tile;
    const prevColor = this.color;
    if (style) {
      this.tile = style.tile || prevTile;
      this.color = style.color || prevColor;
    }
    const tw = style?.tw || 1;
    const th = style?.th || 1;
    const circ = Math.PI * 2 * r0;
    for (let i = 0; i < sides; i++) {
      const a0 = phase + (i / sides) * Math.PI * 2;
      const a1 = phase + ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const u0 = ((i / sides) * circ) / tw;
      const u1 = (((i + 1) / sides) * circ) / tw;
      // outward: going around counter-clockwise seen from above (+y) means a0 → a1 with
      // x = cos, z = -sin keeps the face front outward
      this.quad(mat, x + c0 * r0, y0, z - s0 * r0, x + c1 * r0, y0, z - s1 * r0, x + c1 * r1, y1, z - s1 * r1, x + c0 * r1, y1, z - s0 * r1, u0, y0 / th, u1, y1 / th);
    }
    if (cap && r1 > 0) {
      for (let i = 0; i < sides; i++) {
        const a0 = phase + (i / sides) * Math.PI * 2;
        const a1 = phase + ((i + 1) / sides) * Math.PI * 2;
        this.tri(mat, x, y1, z, x + Math.cos(a0) * r1, y1, z - Math.sin(a0) * r1, x + Math.cos(a1) * r1, y1, z - Math.sin(a1) * r1, 0.5, 0.5, 0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5, 0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5);
      }
    }
    this.tile = prevTile;
    this.color = prevColor;
  }

  /** Build meshes: one per non-empty bucket. Returns array of THREE.Mesh. */
  build(materialObjects, { castShadow = {}, receiveShadow = true } = {}) {
    const meshes = [];
    for (const b of this.buckets.values()) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.toGeometry(), materialObjects[b.mat]);
      m.name = `city:${b.mat}:${b.chunkIndex}`;
      m.matrixAutoUpdate = false;
      m.receiveShadow = receiveShadow;
      m.castShadow = !!castShadow[b.mat];
      m.renderOrder = this.materials[b.mat].renderOrder || 0;
      m.userData.lod = !!this.materials[b.mat].lod;
      meshes.push(m);
    }
    this.buckets.clear();
    return meshes;
  }

  stats() {
    let verts = 0;
    let tris = 0;
    for (const b of this.buckets.values()) {
      verts += b.vcount;
      tris += b.idx.n / 3;
    }
    return { buckets: this.buckets.size, verts, tris };
  }
}

/**
 * Local lot frame, rotated by a multiple of 90°. Local u runs along the street frontage, v runs
 * from the front lot line (v = 0, at the sidewalk) into the lot; y is up. `front` is the outward
 * unit axis vector pointing at the street.
 */
export class Frame {
  constructor(ox, oz, fx, fz) {
    this.ox = ox;
    this.oz = oz;
    this.fx = fx; // front (toward the street)
    this.fz = fz;
    this.vx = -fx; // into the lot
    this.vz = -fz;
    this.ux = this.vz; // along the frontage (keeps a proper rotation)
    this.uz = -this.vx;
  }

  x(u, v) {
    return this.ox + u * this.ux + v * this.vx;
  }

  z(u, v) {
    return this.oz + u * this.uz + v * this.vz;
  }

  /** World AABB of a local rect → [minX, minZ, maxX, maxZ] */
  rect(u0, v0, u1, v1) {
    const xa = this.x(u0, v0);
    const xb = this.x(u1, v1);
    const za = this.z(u0, v0);
    const zb = this.z(u1, v1);
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
  }

  /** Heading (yaw) that faces the street (models built facing -Z). */
  get heading() {
    return Math.atan2(-this.fx, -this.fz);
  }
}

/**
 * Local-frame box: maps local faces (front = toward street, back, left = -u, right = +u) to the
 * world-axis faces of Batcher.box.
 */
export function frameBox(B, mat, F, u0, v0, u1, v1, y0, y1, faces) {
  const [minX, minZ, maxX, maxZ] = F.rect(u0, v0, u1, v1);
  const map = {};
  const set = (axisKey, style) => {
    if (style !== undefined) map[axisKey] = style;
  };
  // which world face is "front" (normal = F.front)
  const key = (dx, dz) => (dx > 0.5 ? 'px' : dx < -0.5 ? 'nx' : dz > 0.5 ? 'pz' : 'nz');
  set(key(F.fx, F.fz), faces.front);
  set(key(-F.fx, -F.fz), faces.back);
  set(key(-F.ux, -F.uz), faces.left);
  set(key(F.ux, F.uz), faces.right);
  if (faces.top !== undefined) map.py = faces.top;
  if (faces.bottom !== undefined) map.ny = faces.bottom;
  map.all = faces.all;
  B.box(mat, minX, y0, minZ, maxX, y1, maxZ, map);
  return [minX, minZ, maxX, maxZ];
}
