// A driving path through the layout graph for one AI car: a polyline of right-hand lane lines
// joined by smooth arcs at intersections, plus one "step" record per street segment (edge) with
// the path distance of its stop line. Paths are extended ahead of the car and trimmed behind it.
//
//   step = { edge, from, to, lane, axis, dirX, dirZ, turn, sStart, sEnd, sExit, node }
//     sStart/sEnd = path distance of the lane start / stop line on this edge
//     sExit       = distance where the turn onto the next edge ends (= next step's sStart)
//     turn        = maneuver at the END of this step: 'straight' | 'left' | 'right' | 'uturn'

export class DrivePath {
  constructor(layout) {
    this.L = layout;
    this.xs = [];
    this.zs = [];
    this.ss = [];
    this.steps = [];
    this.idx = 0; // current segment [idx, idx + 1]
    this.s = 0; // last projected distance
    this.err = 0; // last lateral error
    this._res = { d: 0, s: 0, dx: 0, dz: 0 };
  }

  get endS() {
    return this.ss.length ? this.ss[this.ss.length - 1] : 0;
  }

  get last() {
    return this.steps[this.steps.length - 1] || null;
  }

  _push(x, z) {
    const n = this.xs.length;
    if (n) {
      const dx = x - this.xs[n - 1];
      const dz = z - this.zs[n - 1];
      const d = Math.hypot(dx, dz);
      if (d < 0.05) return;
      this.ss.push(this.ss[n - 1] + d);
    } else {
      this.ss.push(0);
    }
    this.xs.push(x);
    this.zs.push(z);
  }

  /** Classify the maneuver from direction a to direction b (unit vectors). */
  static turnType(ax, az, bx, bz) {
    const dot = ax * bx + az * bz;
    if (dot > 0.7) return 'straight';
    if (dot < -0.7) return 'uturn';
    // +X east, −Z north: heading north (0,−1) → east (1,0) is a right turn; cross = ax*bz − az*bx
    return ax * bz - az * bx > 0 ? 'right' : 'left';
  }

  _makeStep(edge, from, lane) {
    const L = this.L;
    const d = L.edgeDir(edge, from);
    const to = edge.a === from ? edge.b : edge.a;
    return {
      edge,
      from,
      to,
      node: to,
      lane,
      axis: edge.axis,
      dirX: d.x,
      dirZ: d.z,
      dirSign: edge.axis === 'x' ? Math.sign(d.x) : Math.sign(d.z),
      turn: 'straight',
      sStart: 0,
      sEnd: 0,
      sExit: 0,
    };
  }

  /** Start fresh on `edge` travelling away from node `from`, at the car's position (x, z). */
  start(x, z, edge, from, lane) {
    this.xs.length = this.zs.length = this.ss.length = 0;
    this.steps.length = 0;
    this.idx = 0;
    this.s = 0;
    const st = this._makeStep(edge, from, lane);
    const L = this.L;
    const a = L.laneStart(edge, from, lane);
    const b = L.laneEnd(edge, from, lane);
    // project the car onto the lane line, a little behind it so the pursuit point is ahead
    const lx = b.x - a.x;
    const lz = b.z - a.z;
    const len2 = lx * lx + lz * lz || 1;
    let t = ((x - a.x) * lx + (z - a.z) * lz) / len2;
    t = Math.max(0, Math.min(1, t));
    this._push(x, z);
    const px = a.x + lx * t;
    const pz = a.z + lz * t;
    // join the lane a few meters ahead (smooth merge from a curb / odd spawn)
    const len = Math.sqrt(len2);
    const ahead = Math.min(1, t + 5 / len);
    if (ahead < 1) this._push(a.x + lx * ahead, a.z + lz * ahead);
    else this._push(px, pz);
    st.sStart = 0;
    this._push(b.x, b.z);
    st.sEnd = this.endS;
    st.sExit = st.sEnd;
    this.steps.push(st);
    return st;
  }

  /** Append the next edge (travelling away from the previous step's end node). */
  append(edge, lane) {
    const prev = this.last;
    const L = this.L;
    const st = this._makeStep(edge, prev.to, lane);
    prev.turn = DrivePath.turnType(prev.dirX, prev.dirZ, st.dirX, st.dirZ);
    const q0 = L.laneStart(edge, st.from, lane);
    const q1 = L.laneEnd(edge, st.from, lane);
    const p1x = this.xs[this.xs.length - 1];
    const p1z = this.zs[this.zs.length - 1];
    if (prev.turn === 'left' || prev.turn === 'right') {
      // quadratic Bezier through the point where the two lane lines cross
      let cx;
      let cz;
      if (Math.abs(prev.dirX) < 0.5) {
        cx = p1x;
        cz = q0.z;
      } else {
        cx = q0.x;
        cz = p1z;
      }
      const n = prev.turn === 'left' ? 8 : 6;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        this._push(u * u * p1x + 2 * u * t * cx + t * t * q0.x, u * u * p1z + 2 * u * t * cz + t * t * q0.z);
      }
    } else if (prev.turn === 'uturn') {
      // loop out into the intersection box and back (cubic Bezier)
      const k = 9;
      const c1x = p1x + prev.dirX * k;
      const c1z = p1z + prev.dirZ * k;
      const c2x = q0.x + prev.dirX * k;
      const c2z = q0.z + prev.dirZ * k;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        this._push(u * u * u * p1x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * q0.x, u * u * u * p1z + 3 * u * u * t * c1z + 3 * u * t * t * c2z + t * t * t * q0.z);
      }
    } else {
      this._push(q0.x, q0.z);
    }
    st.sStart = this.endS;
    prev.sExit = st.sStart;
    this._push(q1.x, q1.z);
    st.sEnd = this.endS;
    st.sExit = st.sEnd;
    this.steps.push(st);
    return st;
  }

  /** Project (x, z) onto the path near the current segment. Returns path distance s. */
  project(x, z) {
    const n = this.xs.length;
    if (n < 2) return 0;
    let best = Infinity;
    let bi = this.idx;
    let bt = 0;
    const i0 = Math.max(0, this.idx - 1);
    const i1 = Math.min(n - 2, this.idx + 6);
    for (let i = i0; i <= i1; i++) {
      const ax = this.xs[i];
      const az = this.zs[i];
      const sx = this.xs[i + 1] - ax;
      const sz = this.zs[i + 1] - az;
      const l2 = sx * sx + sz * sz || 1e-9;
      let t = ((x - ax) * sx + (z - az) * sz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + sx * t - x;
      const pz = az + sz * t - z;
      const d = px * px + pz * pz;
      if (d < best - 1e-6 || (Math.abs(d - best) <= 1e-6 && i > bi)) {
        best = d;
        bi = i;
        bt = t;
      }
    }
    this.idx = bi;
    this.err = Math.sqrt(best);
    this.s = this.ss[bi] + (this.ss[bi + 1] - this.ss[bi]) * bt;
    return this.s;
  }

  /** Point and direction at path distance s (clamped to the path) into out {x, z, dx, dz}. */
  pointAt(s, out) {
    const n = this.xs.length;
    let i = Math.min(this.idx, n - 2);
    while (i < n - 2 && this.ss[i + 1] < s) i++;
    const ax = this.xs[i];
    const az = this.zs[i];
    const sx = this.xs[i + 1] - ax;
    const sz = this.zs[i + 1] - az;
    const len = this.ss[i + 1] - this.ss[i] || 1e-9;
    let t = (s - this.ss[i]) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.x = ax + sx * t;
    out.z = az + sz * t;
    out.dx = sx / len;
    out.dz = sz / len;
    return out;
  }

  /**
   * Closest approach of point (x, z) to the path between distances s0 and s1.
   * Returns a shared object { d, s, dx, dz } (d = Infinity if out of range).
   */
  distanceTo(x, z, s0, s1) {
    const r = this._res;
    r.d = Infinity;
    const n = this.xs.length;
    for (let i = this.idx; i < n - 1; i++) {
      if (this.ss[i] > s1) break;
      if (this.ss[i + 1] < s0) continue;
      const ax = this.xs[i];
      const az = this.zs[i];
      const sx = this.xs[i + 1] - ax;
      const sz = this.zs[i + 1] - az;
      const len = this.ss[i + 1] - this.ss[i] || 1e-9;
      let t = ((x - ax) * sx + (z - az) * sz) / (len * len);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + sx * t - x;
      const pz = az + sz * t - z;
      const d = Math.sqrt(px * px + pz * pz);
      const s = this.ss[i] + len * t;
      if (s < s0 || s > s1) continue;
      if (d < r.d) {
        r.d = d;
        r.s = s;
        r.dx = sx / len;
        r.dz = sz / len;
      }
    }
    return r;
  }

  /** First step whose stop line is still ahead of path distance s. */
  stepAt(s) {
    for (let i = 0; i < this.steps.length; i++) if (this.steps[i].sExit > s) return this.steps[i];
    return this.last;
  }

  /** Drop points and steps well behind the car. */
  trim() {
    if (this.idx > 24) {
      const k = this.idx - 2;
      this.xs.splice(0, k);
      this.zs.splice(0, k);
      this.ss.splice(0, k);
      this.idx -= k;
    }
    while (this.steps.length > 2 && this.steps[0].sExit < this.s - 30) this.steps.shift();
  }
}
