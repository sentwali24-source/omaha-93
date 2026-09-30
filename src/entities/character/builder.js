import * as THREE from 'three';

// Geometry builder for rigid-skinned, vertex-colored low-poly characters.
//
// Every primitive is flat shaded (each quad owns its 4 vertices) and weighted 100 % to one bone.
// Parts are authored at "unit scale" (a 1.8 m tall adult) in model space: feet at y = 0, facing -Z,
// the character's right side at +X. Model.js scales the finished geometry per build.
//
// Primitives:
//   quad(bone, a, b, c, d, color, hint?)       any planar quad; hint = a point "inside" the part
//   tri(bone, a, b, c, color, hint?)
//   lathe(bone, opts)                           rounded prism through a stack of rings (torso, limbs, head)
//   box(bone, opts)                             lathe with 4 sides and square corners
//   surface(bone, nu, nv, fn, color, hint)      parametric patch (caps, domes, cornrows, rags)
// Colors are linear [r, g, b] arrays (see palette.js).

const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.bones = [];
    this.idx = [];
    this.count = 0;
  }

  _vert(p, nx, ny, nz, c, bone) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(nx, ny, nz);
    this.col.push(c[0], c[1], c[2]);
    this.bones.push(bone);
    return this.count++;
  }

  /** Planar quad a-b-c-d (in order around the edge). The normal is flipped to face away from hint. */
  quad(bone, a, b, c, d, color, hint = null) {
    if (!color) return;
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    nx /= len;
    ny /= len;
    nz /= len;
    if (hint) {
      const cx = (a[0] + c[0]) * 0.5 - hint[0];
      const cy = (a[1] + c[1]) * 0.5 - hint[1];
      const cz = (a[2] + c[2]) * 0.5 - hint[2];
      if (cx * nx + cy * ny + cz * nz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    const i0 = this._vert(a, nx, ny, nz, color, bone);
    const i1 = this._vert(b, nx, ny, nz, color, bone);
    const i2 = this._vert(c, nx, ny, nz, color, bone);
    const i3 = this._vert(d, nx, ny, nz, color, bone);
    // winding: counter-clockwise seen from the normal side
    const w = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])) * nx
      + ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])) * ny
      + ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * nz;
    if (w >= 0) this.idx.push(i0, i1, i2, i0, i2, i3);
    else this.idx.push(i0, i2, i1, i0, i3, i2);
  }

  tri(bone, a, b, c, color, hint = null) {
    if (!color) return;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    nx /= len;
    ny /= len;
    nz /= len;
    let flip = false;
    if (hint) {
      const cx = (a[0] + b[0] + c[0]) / 3 - hint[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - hint[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - hint[2];
      if (cx * nx + cy * ny + cz * nz < 0) flip = true;
    }
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const i0 = this._vert(a, nx, ny, nz, color, bone);
    const i1 = this._vert(b, nx, ny, nz, color, bone);
    const i2 = this._vert(c, nx, ny, nz, color, bone);
    if (flip) this.idx.push(i0, i2, i1);
    else this.idx.push(i0, i1, i2);
  }

  /**
   * Rounded prism along +Y through rings.
   * opts: x, y, z   bottom center
   *       h         height; w, d full width / depth at scale 1
   *       sides     cross-section vertex count (4 = box, 6 limbs, 8 torso/head)
   *       round     superellipse exponent (2 = ellipse, 3-4 = chamfered box, 0 = square corners)
   *       rings     [[t 0..1, sx, sz, ox?, oz?], ...] bottom to top (default straight prism)
   *       color     base color;  fn(band, dirX, dirZ, side) → color | null (null skips the quad)
   *       capTop / capBottom (default true), capTopColor / capBottomColor
   *       rfn(side, ring) → radius multiplier (lumpy hair)
   *       m         optional Matrix4 applied to the finished part
   */
  lathe(bone, o) {
    const start = this.count;
    const sides = o.sides || 8;
    const round = o.round ?? 3;
    const rings = o.rings || [[0, 1, 1], [1, 1, 1]];
    const x = o.x || 0;
    const y = o.y || 0;
    const z = o.z || 0;
    const h = o.h;
    const hw = o.w / 2;
    const hd = (o.d ?? o.w) / 2;
    // cross-section unit points (vertices sit between face centers so a flat face faces front)
    const cs = [];
    for (let k = 0; k < sides; k++) {
      const a = ((k + 0.5) / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (round <= 0 || sides === 4) {
        cs.push([Math.sign(ca), Math.sign(sa)]);
      } else {
        const e = 2 / round;
        cs.push([Math.sign(ca) * Math.abs(ca) ** e, Math.sign(sa) * Math.abs(sa) ** e]);
      }
    }
    const pts = rings.map((r, i) => {
      const yy = y + r[0] * h;
      const ox = x + (r[3] || 0);
      const oz = z + (r[4] || 0);
      return cs.map((c, k) => {
        const m = o.rfn ? o.rfn(k, i) : 1;
        return [ox + c[0] * hw * r[1] * m, yy, oz + c[1] * hd * r[2] * m];
      });
    });
    const centers = rings.map((r) => [x + (r[3] || 0), y + r[0] * h, z + (r[4] || 0)]);
    for (let i = 0; i < rings.length - 1; i++) {
      const hint = [(centers[i][0] + centers[i + 1][0]) / 2, (centers[i][1] + centers[i + 1][1]) / 2, (centers[i][2] + centers[i + 1][2]) / 2];
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        let color = o.color;
        if (o.fn) {
          const a = ((k + 1) / sides) * Math.PI * 2;
          color = o.fn(i, Math.cos(a), Math.sin(a), k);
        }
        this.quad(bone, pts[i][k], pts[i][k2], pts[i + 1][k2], pts[i + 1][k], color, hint);
      }
    }
    const capTop = o.capTop !== false;
    const capBottom = o.capBottom !== false;
    const top = pts[pts.length - 1];
    const bot = pts[0];
    const ct = centers[centers.length - 1];
    const cb = centers[0];
    if (capTop) this._cap(bone, top, ct, [ct[0], ct[1] - 1, ct[2]], o.capTopColor || o.color, sides);
    if (capBottom) this._cap(bone, bot, cb, [cb[0], cb[1] + 1, cb[2]], o.capBottomColor || o.color, sides);
    if (o.m) this.transform(start, o.m);
    // optional inside surface (seen through openings: afro, hood), same shape with flipped faces
    if (o.inner) {
      const vi = this.count;
      const ii = this.idx.length;
      const inner = o.inner;
      this.lathe(bone, {
        ...o,
        inner: null,
        capBottom: false,
        capTop: o.capTop,
        capTopColor: inner,
        fn: o.fn ? (band, dx, dz, k) => (o.fn(band, dx, dz, k) ? inner : null) : null,
        color: inner,
      });
      this.flip(vi, ii);
    }
    return start;
  }

  /** Turn faces inside out for vertices from startVertex / indices from startIndex. */
  flip(startVertex, startIndex) {
    for (let i = startVertex * 3; i < this.count * 3; i++) this.nrm[i] = -this.nrm[i];
    for (let i = startIndex; i < this.idx.length; i += 3) {
      const t = this.idx[i + 1];
      this.idx[i + 1] = this.idx[i + 2];
      this.idx[i + 2] = t;
    }
  }

  _cap(bone, ring, center, hint, color, sides) {
    if (!color) return;
    if (sides === 4) {
      this.quad(bone, ring[0], ring[1], ring[2], ring[3], color, hint);
      return;
    }
    for (let k = 0; k < sides; k++) this.tri(bone, center, ring[k], ring[(k + 1) % sides], color, hint);
  }

  /** Box centered at (x, y, z). faces: { front, back, left, right, top, bottom } colors (null = skip). */
  box(bone, o) {
    const f = o.faces || {};
    const base = o.color;
    // lathe with sides = 4 walks: k0 = back(+Z), k1 = left(-X), k2 = front(-Z), k3 = right(+X)
    const sideColor = [f.back, f.left, f.front, f.right];
    const tt = o.top || [1, 1]; // top scale (taper)
    return this.lathe(bone, {
      x: o.x || 0,
      y: (o.y || 0) - o.h / 2,
      z: o.z || 0,
      w: o.w,
      d: o.d,
      h: o.h,
      sides: 4,
      rings: [[0, 1, 1], [1, tt[0], tt[1], o.topShiftX || 0, o.topShiftZ || 0]],
      color: base,
      fn: o.fn || ((band, dx, dz, k) => (sideColor[k] === undefined ? base : sideColor[k])),
      capTopColor: f.top === undefined ? base : f.top,
      capBottomColor: f.bottom === undefined ? base : f.bottom,
      capTop: f.top !== null,
      capBottom: f.bottom !== null,
      m: o.m,
    });
  }

  /**
   * Parametric patch: fn(u, v) → [x, y, z] for u, v in 0..1. color(iu, iv) → color | null or a color.
   * hint: point inside the shape (normals face away from it) or a function (u, v) → point.
   */
  surface(bone, nu, nv, fn, color, hint, m = null) {
    const start = this.count;
    const grid = [];
    for (let j = 0; j <= nv; j++) {
      const row = [];
      for (let i = 0; i <= nu; i++) row.push(fn(i / nu, j / nv));
      grid.push(row);
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const c = typeof color === 'function' ? color(i, j) : color;
        const hp = typeof hint === 'function' ? hint((i + 0.5) / nu, (j + 0.5) / nv) : hint;
        this.quad(bone, grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i], c, hp);
      }
    }
    if (m) this.transform(start, m);
    return start;
  }

  /** Apply a Matrix4 to vertices [start, count). */
  transform(start, m) {
    _m3.getNormalMatrix(m);
    for (let i = start; i < this.count; i++) {
      _v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(m);
      this.pos[i * 3] = _v.x;
      this.pos[i * 3 + 1] = _v.y;
      this.pos[i * 3 + 2] = _v.z;
      _v.set(this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]).applyMatrix3(_m3).normalize();
      this.nrm[i * 3] = _v.x;
      this.nrm[i * 3 + 1] = _v.y;
      this.nrm[i * 3 + 2] = _v.z;
    }
  }

  /**
   * Scale every vertex about its bone's joint: v' = J'[b] + (v - J[b]) * S[b].
   * joints / scaled: Float32Array(nBones * 3); scales: Float32Array(nBones * 3).
   */
  scaleByBone(joints, scaled, scales) {
    for (let i = 0; i < this.count; i++) {
      const b = this.bones[i] * 3;
      for (let a = 0; a < 3; a++) {
        const p = i * 3 + a;
        this.pos[p] = scaled[b + a] + (this.pos[p] - joints[b + a]) * scales[b + a];
        this.nrm[p] /= scales[b + a];
      }
      const n = i * 3;
      const l = Math.hypot(this.nrm[n], this.nrm[n + 1], this.nrm[n + 2]) || 1;
      this.nrm[n] /= l;
      this.nrm[n + 1] /= l;
      this.nrm[n + 2] /= l;
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    const n = this.count;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = this.bones[i];
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
