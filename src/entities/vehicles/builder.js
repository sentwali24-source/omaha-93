import * as THREE from 'three';
import { WHITE_UV } from './atlas.js';

// Tiny low-poly mesh builder for vehicle bodies. Every primitive is appended to one flat-shaded,
// non-indexed triangle soup. Each face carries a paint "slot" (recolored per car paint scheme) or
// a fixed color, a shine value (specular + reflection strength) and atlas UVs.
//
// Coordinates: model space, car faces -Z, +X = the car's right (passenger) side, y up, ground y = 0.
//
// A face spec is { slot } (paint slot index, see SLOT) or { color: '#hex' }, plus optional
// { shine: 0..1, uv: [u0, v0, u1, v1], jitter: bool }.

export const SLOT = {
  paint: 0, // main body color
  upper: 1, // upper body (two-tone)
  roof: 2, // roof (vinyl / two-tone / white police roof)
  hood: 3, // hood panel (primer / mismatched)
  door: 4, // driver door panel
  fender: 5, // passenger front fender
  stripe: 6, // stripes / pinstripes / police stripe
  stripe2: 7, // second stripe color
  rust: 8, // rust-prone panels (fender lips, rockers)
  ttop: 9, // T-top panels (glass on T-top coupes)
  FIXED: 255,
};

const _c = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.slot = [];
    this.fixed = []; // rgb linear for FIXED faces
    this.shine = [];
    this.jitter = [];
    this.flags = []; // 1 = paint shine follows scheme gloss
    this._face = 0;
  }

  _spec(spec) {
    if (spec.slot !== undefined && spec.slot !== null) {
      return { slot: spec.slot, r: 1, g: 1, b: 1, shine: spec.shine ?? -1 };
    }
    _c.set(spec.color || '#ff00ff');
    return { slot: SLOT.FIXED, r: _c.r, g: _c.g, b: _c.b, shine: spec.shine ?? 0.1 };
  }

  /** Append one triangle with explicit uvs (arrays [u, v]). */
  _tri(a, b, c, s, ua, ub, uc, jit) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    const len = _n.length();
    if (len < 1e-9) return;
    _n.multiplyScalar(1 / len);
    for (const [p, u] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.uv.push(u[0], u[1]);
      this.slot.push(s.slot);
      this.fixed.push(s.r, s.g, s.b);
      this.shine.push(s.shine);
      this.jitter.push(jit);
    }
  }

  /**
   * Quad a-b-c-d (any winding). hint = outward direction [x, y, z] used to fix the winding.
   * uv (optional) maps a→(u0,v0) b→(u1,v0) c→(u1,v1) d→(u0,v1).
   */
  quad(a, b, c, d, spec, hint) {
    const s = this._spec(spec);
    let ua = WHITE_UV;
    let ub = WHITE_UV;
    let uc = WHITE_UV;
    let ud = WHITE_UV;
    if (spec.uv) {
      const [u0, v0, u1, v1] = spec.uv;
      ua = [u0, v0];
      ub = [u1, v0];
      uc = [u1, v1];
      ud = [u0, v1];
    }
    const jit = spec.jitter === false ? 0 : ((this._face++ * 0.61803) % 1) * 2 - 1;
    if (hint) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _n.crossVectors(_a, _b);
      if (_n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) {
        // reverse winding: a d c b
        this._tri(a, d, c, s, ua, ud, uc, jit);
        this._tri(a, c, b, s, ua, uc, ub, jit);
        return;
      }
    }
    this._tri(a, b, c, s, ua, ub, uc, jit);
    this._tri(a, c, d, s, ua, uc, ud, jit);
  }

  tri(a, b, c, spec, hint) {
    const s = this._spec(spec);
    const jit = ((this._face++ * 0.61803) % 1) * 2 - 1;
    if (hint) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _n.crossVectors(_a, _b);
      if (_n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) {
        this._tri(a, c, b, s, WHITE_UV, WHITE_UV, WHITE_UV, jit);
        return;
      }
    }
    this._tri(a, b, c, s, WHITE_UV, WHITE_UV, WHITE_UV, jit);
  }

  /** Axis-aligned box centered at (x, y, z). skip: string of faces to omit, e.g. 'ny' (bottom). */
  box(x, y, z, sx, sy, sz, spec, skip = '') {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const x0 = x - hx, x1 = x + hx, y0 = y - hy, y1 = y + hy, z0 = z - hz, z1 = z + hz;
    const faces = typeof spec.faces === 'object' ? spec.faces : null;
    const f = (name) => (faces && faces[name]) || spec;
    if (!skip.includes('px')) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], f('px'), [1, 0, 0]);
    if (!skip.includes('nx')) this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], f('nx'), [-1, 0, 0]);
    if (!skip.includes('py')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], f('py'), [0, 1, 0]);
    if (!skip.includes('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], f('ny'), [0, -1, 0]);
    if (!skip.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], f('pz'), [0, 0, 1]);
    if (!skip.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], f('nz'), [0, 0, -1]);
  }

  /** Mirrored pair of boxes at ±x. */
  box2(x, y, z, sx, sy, sz, spec, skip = '') {
    this.box(x, y, z, sx, sy, sz, spec, skip);
    this.box(-x, y, z, sx, sy, sz, spec, skip);
  }

  /** Square-section beam from p0 to p1 (thickness t). Good for pillars, rails, trim lines. */
  beam(p0, p1, t, spec, t2 = t) {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = d.length();
    if (len < 1e-6) return;
    d.multiplyScalar(1 / len);
    const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(t / 2);
    const s2 = new THREE.Vector3().crossVectors(s1, d).normalize().multiplyScalar(t2 / 2);
    const P = (base, a, b) => [base[0] + s1.x * a + s2.x * b, base[1] + s1.y * a + s2.y * b, base[2] + s1.z * a + s2.z * b];
    const c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    const corners = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (let i = 0; i < 4; i++) {
      const [a1, b1] = corners[i];
      const [a2, b2] = corners[(i + 1) % 4];
      const q = [P(p0, a1, b1), P(p0, a2, b2), P(p1, a2, b2), P(p1, a1, b1)];
      const mid = [(q[0][0] + q[2][0]) / 2 - c[0], (q[0][1] + q[2][1]) / 2 - c[1], (q[0][2] + q[2][2]) / 2 - c[2]];
      this.quad(q[0], q[1], q[2], q[3], spec, mid);
    }
    // end caps
    const e0 = corners.map(([a, b]) => P(p0, a, b));
    const e1 = corners.map(([a, b]) => P(p1, a, b));
    this.quad(e0[0], e0[1], e0[2], e0[3], spec, [-d.x, -d.y, -d.z]);
    this.quad(e1[0], e1[1], e1[2], e1[3], spec, [d.x, d.y, d.z]);
  }

  /** Cylinder along an axis ('x' | 'y' | 'z'), n segments, with caps (capSpec null = no caps). */
  cylinder(axis, x, y, z, r, length, n, spec, capSpec = spec) {
    const h = length / 2;
    const pt = (ang, s) => {
      const a = Math.cos(ang) * r;
      const b = Math.sin(ang) * r;
      if (axis === 'x') return [x + s * h, y + a, z + b];
      if (axis === 'y') return [x + a, y + s * h, z + b];
      return [x + a, y + b, z + s * h];
    };
    const axisV = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const hint = axis === 'x' ? [0, Math.cos(am), Math.sin(am)] : axis === 'y' ? [Math.cos(am), 0, Math.sin(am)] : [Math.cos(am), Math.sin(am), 0];
      this.quad(pt(a0, -1), pt(a1, -1), pt(a1, 1), pt(a0, 1), spec, hint);
      if (capSpec) {
        const c0 = axis === 'x' ? [x - h, y, z] : axis === 'y' ? [x, y - h, z] : [x, y, z - h];
        const c1 = axis === 'x' ? [x + h, y, z] : axis === 'y' ? [x, y + h, z] : [x, y, z + h];
        this.tri(c0, pt(a0, -1), pt(a1, -1), capSpec, [-axisV[0], -axisV[1], -axisV[2]]);
        this.tri(c1, pt(a0, 1), pt(a1, 1), capSpec, axisV);
      }
    }
  }

  /**
   * Loft through cross-sections along z. Each section: { z, y0, y1, w0, w1 } — a trapezoid with
   * bottom half-width w0 at y0 and top half-width w1 at y1. specFn(kind, i, side) returns a face
   * spec or null to skip. kind: 'top' | 'bottom' | 'side' | 'front' | 'back'.
   */
  loft(S, specFn) {
    for (let i = 0; i < S.length - 1; i++) {
      const A = S[i];
      const B = S[i + 1];
      const cy = (A.y0 + A.y1 + B.y0 + B.y1) / 4;
      const cz = (A.z + B.z) / 2;
      const hintFrom = (pts) => {
        let x = 0, y = 0, z = 0;
        for (const p of pts) {
          x += p[0];
          y += p[1];
          z += p[2];
        }
        return [x / pts.length, y / pts.length - cy, z / pts.length - cz];
      };
      let s = specFn('top', i, 0);
      if (s) {
        const q = [[-A.w1, A.y1, A.z], [A.w1, A.y1, A.z], [B.w1, B.y1, B.z], [-B.w1, B.y1, B.z]];
        this.quad(q[0], q[1], q[2], q[3], s, hintFrom(q));
      }
      s = specFn('bottom', i, 0);
      if (s) {
        const q = [[-A.w0, A.y0, A.z], [A.w0, A.y0, A.z], [B.w0, B.y0, B.z], [-B.w0, B.y0, B.z]];
        this.quad(q[0], q[1], q[2], q[3], s, [0, -1, 0]);
      }
      for (const side of [-1, 1]) {
        s = specFn('side', i, side);
        if (!s) continue;
        const q = [
          [side * A.w0, A.y0, A.z],
          [side * B.w0, B.y0, B.z],
          [side * B.w1, B.y1, B.z],
          [side * A.w1, A.y1, A.z],
        ];
        this.quad(q[0], q[1], q[2], q[3], s, [side, 0, 0]);
      }
    }
    const F = S[0];
    const L = S[S.length - 1];
    let s = specFn('front', 0, 0);
    if (s && F.y1 - F.y0 > 1e-3) this.quad([-F.w0, F.y0, F.z], [F.w0, F.y0, F.z], [F.w1, F.y1, F.z], [-F.w1, F.y1, F.z], s, [0, 0, -1]);
    s = specFn('back', 0, 0);
    if (s && L.y1 - L.y0 > 1e-3) this.quad([-L.w0, L.y0, L.z], [L.w0, L.y0, L.z], [L.w1, L.y1, L.z], [-L.w1, L.y1, L.z], s, [0, 0, 1]);
  }

  /**
   * Flat textured quad (decal) centered at c, facing normal n, with in-plane right/up vectors.
   * size w × h. spec.uv maps bottom-left → top-right as seen from outside.
   */
  decal(c, right, up, w, h, spec, normal) {
    const hw = w / 2;
    const hh = h / 2;
    const P = (a, b) => [c[0] + right[0] * a + up[0] * b, c[1] + right[1] * a + up[1] * b, c[2] + right[2] * a + up[2] * b];
    const bl = P(-hw, -hh);
    const br = P(hw, -hh);
    const tr = P(hw, hh);
    const tl = P(-hw, hh);
    // uv mapping assumes CCW (bl, br, tr, tl) as seen from outside; pass no hint so uvs stay put
    const s = this._spec(spec);
    const [u0, v0, u1, v1] = spec.uv || [WHITE_UV[0], WHITE_UV[1], WHITE_UV[0], WHITE_UV[1]];
    const jit = 0;
    this._tri(bl, br, tr, s, [u0, v0], [u1, v0], [u1, v1], jit);
    this._tri(bl, tr, tl, s, [u0, v0], [u1, v1], [u0, v1], jit);
    void normal;
  }

  /** Side decal on the car's left (-X) or right (+X) flank, centered at (z, y), facing outward. */
  sideDecal(side, x, z, y, w, h, spec) {
    // viewer on the left looks toward +X: right = +Z. On the right side: right = -Z.
    const right = side < 0 ? [0, 0, 1] : [0, 0, -1];
    this.decal([side * x, y, z], right, [0, 1, 0], w, h, spec);
  }

  /** Front (-Z facing) or rear (+Z facing) decal centered at (x, y) on plane z. */
  endDecal(front, x, y, z, w, h, spec) {
    const right = front ? [-1, 0, 0] : [1, 0, 0];
    this.decal([x, y, z], right, [0, 1, 0], w, h, spec);
  }

  /** Flat decal on a (possibly sloped) top surface: from z0 → z1 at heights y0 → y1, half width hw. */
  topDecal(z0, y0, z1, y1, hw, spec) {
    // seen from above, front of the car (-Z) is "up" in the texture
    const a = [-hw, y1, z1];
    const b = [hw, y1, z1];
    const c = [hw, y0, z0];
    const d = [-hw, y0, z0];
    const s = this._spec(spec);
    const [u0, v0, u1, v1] = spec.uv || [WHITE_UV[0], WHITE_UV[1], WHITE_UV[0], WHITE_UV[1]];
    this._tri(a, b, c, s, [u0, v0], [u1, v0], [u1, v1], 0);
    this._tri(a, c, d, s, [u0, v0], [u1, v1], [u0, v1], 0);
  }

  /**
   * Wheel arch patch on a flank: a flat dark shape (half-disc over a rectangle) behind a wheel.
   * x = flank half width (patch is placed just outside), zc/yc = wheel center, r = arch radius.
   */
  arch(side, x, zc, yc, r, yBottom, spec, n = 7) {
    const px = side * (x + 0.004);
    const pts = [];
    pts.push([px, yBottom, zc - r]);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI; // left → over the top → right (in z)
      pts.push([px, yc + Math.sin(a) * r, zc + Math.cos(a) * r]);
    }
    pts.push([px, yBottom, zc + r]);
    const center = [px, (yBottom + yc) / 2, zc];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.tri(center, a, b, spec, [side, 0, 0]);
    }
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  /** Finish: geometry with position/normal/uv, plus recolor data. */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return {
      geometry: g,
      slot: Uint8Array.from(this.slot),
      fixed: Float32Array.from(this.fixed),
      shine: Float32Array.from(this.shine),
      jitter: Float32Array.from(this.jitter),
    };
  }
}
