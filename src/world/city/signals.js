import * as THREE from 'three';
import { Frame, rgb } from './batch.js';
import { lbox } from './kit.js';

// Traffic signals at every intersection where a major street is involved.
//
// Timing (ARCHITECTURE.md §9): per axis 14 s green + 3 s yellow + 1 s all-red, offset per node.
//   'x' = the east-west street has green. During yellow `green` still names the axis that is
//   clearing; during all-red it is null. `t` = seconds left in the current phase.
//
// Visuals: a steel mast arm at the far-right corner of every approach with 1–2 yellow heads over
// the approach lanes and a green street-name sign; the lamps are one InstancedMesh whose instance
// colours are rewritten only when a node changes phase, plus an additive glow InstancedMesh.

const GREEN = 14;
const YELLOW = 3;
const ALLRED = 1;
const HALF = GREEN + YELLOW + ALLRED;
const CYCLE = HALF * 2;

const ON = { r: new THREE.Color('#ff2a18'), y: new THREE.Color('#ffb31a'), g: new THREE.Color('#2dff8a') };
const OFF = { r: new THREE.Color('#3a0c08'), y: new THREE.Color('#3a2a08'), g: new THREE.Color('#08301a') };
const BLACK = new THREE.Color(0, 0, 0);

export class Signals {
  constructor(C) {
    this.C = C;
    this.time = 0;
    this.nodes = []; // index = node id → signal record | null
    this._lamps = []; // { head, color: 'r'|'y'|'g' }
  }

  /** Phase for a node record at time t (writes into rec.state). */
  _compute(rec, t) {
    const st = rec.state;
    let local = (t + rec.offset) % CYCLE;
    if (local < 0) local += CYCLE;
    const axis = local < HALF ? 'x' : 'z';
    const l = local < HALF ? local : local - HALF;
    if (l < GREEN) {
      st.green = axis;
      st.phase = 'green';
      st.t = GREEN - l;
    } else if (l < GREEN + YELLOW) {
      st.green = axis;
      st.phase = 'yellow';
      st.t = GREEN + YELLOW - l;
    } else {
      st.green = null;
      st.phase = 'allred';
      st.t = HALF - l;
    }
    st.elapsed = local;
    return st;
  }

  signalAt(nodeId) {
    const rec = this.nodes[nodeId];
    if (!rec) return null;
    return this._compute(rec, this.time);
  }

  build(group) {
    const C = this.C;
    const { L } = C;
    const B = C.B;
    const low = C.detail === 0;
    const heads = []; // { x, y, z, nx, nz, rec, axis }
    for (const n of L.nodes) {
      if (!C.isSignalNode(n)) {
        this.nodes[n.id] = null;
        continue;
      }
      const ns = C.nsById.get(n.ns);
      const ew = C.ewById.get(n.ew);
      const hw = ns.width / 2;
      const hd = ew.width / 2;
      const legs = C.nodeLegs.get(n.id);
      // offsets loosely progress along Dodge/24th etc. so neighbouring lights are staggered
      const offset = ((n.x * 0.071 + n.z * 0.113 + (n.id % 7) * 3.1) % CYCLE + CYCLE) % CYCLE;
      const rec = { node: n, offset, state: { green: 'x', phase: 'green', t: 0, elapsed: 0 }, lamps: [], key: '' };
      this.nodes[n.id] = rec;
      B.at(n.x, n.z);
      // approach definitions: which leg the traffic comes from, pole corner, arm direction, facing
      const approaches = [];
      if (legs.s) approaches.push({ axis: 'z', px: n.x + hw + 0.7, pz: n.z - hd - 0.7, ax: -1, az: 0, fx: 0, fz: 1, lanes: laneCount(ns), street: ew });
      if (legs.n) approaches.push({ axis: 'z', px: n.x - hw - 0.7, pz: n.z + hd + 0.7, ax: 1, az: 0, fx: 0, fz: -1, lanes: laneCount(ns), street: ew });
      if (legs.e) approaches.push({ axis: 'x', px: n.x - hw - 0.7, pz: n.z - hd - 0.7, ax: 0, az: 1, fx: 1, fz: 0, lanes: laneCount(ew), street: ns, cross: n.z });
      if (legs.w) approaches.push({ axis: 'x', px: n.x + hw + 0.7, pz: n.z + hd + 0.7, ax: 0, az: -1, fx: -1, fz: 0, lanes: laneCount(ew), street: ns, cross: n.z });
      for (const a of approaches) {
        if (C.pointReserved(a.px, a.pz, ['hood'], 0.4)) continue;
        const armLen = (a.axis === 'z' ? hw : hd) + 0.7 - 0.4;
        this._mast(a, armLen, low, heads, rec, n);
      }
    }
    this._buildLamps(group, heads);
  }

  _mast(a, armLen, low, heads, rec, n) {
    const C = this.C;
    const B = C.B;
    const steel = C.f('metalPlain', '#8c9294');
    const yellow = C.f('metalPlain', '#d8b020');
    const y = 6.3;
    B.cylinder('detail', a.px, a.pz, 0, y + 0.6, 0.16, 0.12, low ? 5 : 8, steel, true);
    C.box(a.px - 0.2, a.pz - 0.2, a.px + 0.2, a.pz + 0.2, y + 0.6, 0, 'prop');
    const ex = a.px + a.ax * armLen;
    const ez = a.pz + a.az * armLen;
    const t = 0.07;
    B.box('detail', Math.min(a.px, ex) - t, y - t, Math.min(a.pz, ez) - t, Math.max(a.px, ex) + t, y + t, Math.max(a.pz, ez) + t, { all: steel });
    // heads over the approach lanes (lane centres measured from the street centreline)
    const lanesOff = a.lanes >= 2 ? [2.05, 5.35] : [1.65];
    const use = low ? [lanesOff[0]] : lanesOff;
    const cx = a.axis === 'z' ? n.x : n.z;
    for (const off of use) {
      // lane offset on the approach's right side = toward the pole
      const along = a.axis === 'z' ? cx + -a.ax * off : cx + -a.az * off;
      const hx = a.axis === 'z' ? along : a.px;
      const hz = a.axis === 'z' ? a.pz : along;
      const F = new Frame(hx, hz, a.fx, a.fz);
      lbox(C, 'detail', F, -0.19, 0.19, -0.16, 0.16, y - 1.25, y - 0.06, yellow, yellow);
      // black backplate
      lbox(C, 'detail', F, -0.34, 0.34, 0.16, 0.2, y - 1.4, y + 0.05, C.f('dark', '#ffffff'), null, ['front', 'back']);
      heads.push({ x: hx + a.fx * 0.17, z: hz + a.fz * 0.17, y: y - 0.66, fx: a.fx, fz: a.fz, rec, axis: a.axis });
    }
    // street-name sign on the arm, facing the approaching traffic
    const label = a.axis === 'z' ? a.street.name.toUpperCase() : C.L.streetLabel(a.street, n.z).toUpperCase();
    const cell = C.cells.get(`street:${label}`);
    if (cell) {
      const sm = 0.55;
      const sx = a.px + a.ax * (sm + 1.3) + a.fx * 0.1;
      const sz = a.pz + a.az * (sm + 1.3) + a.fz * 0.1;
      const px = a.fz;
      const pz = -a.fx;
      const w = 2.4;
      const h = 0.4;
      B.color = rgb('#ffffff');
      B.quadUV('signs', sx - px * w / 2, y + 0.12, sz - pz * w / 2, sx + px * w / 2, y + 0.12, sz + pz * w / 2, sx + px * w / 2, y + 0.12 + h, sz + pz * w / 2, sx - px * w / 2, y + 0.12 + h, sz - pz * w / 2, cell[0], cell[1], cell[2], cell[1], cell[2], cell[3], cell[0], cell[3]);
    }
  }

  _buildLamps(group, heads) {
    const n = heads.length * 3;
    this.count = n;
    if (!n) return;
    const geo = new THREE.CircleGeometry(0.13, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = 'city:signal-lamps';
    const glowGeo = new THREE.PlaneGeometry(1.1, 1.1);
    const glowMat = new THREE.MeshBasicMaterial({ map: this.C.tex.pool, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.3 });
    const glow = new THREE.InstancedMesh(glowGeo, glowMat, n);
    glow.name = 'city:signal-glow';
    glow.renderOrder = 3;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const h of heads) {
      // circle faces +z by default; rotate to face (fx, fz)
      q.setFromAxisAngle(up, Math.atan2(h.fx, h.fz));
      const colors = ['r', 'y', 'g'];
      for (let k = 0; k < 3; k++) {
        p.set(h.x + h.fx * 0.02, h.y + 0.36 - k * 0.36, h.z + h.fz * 0.02);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        p.set(h.x + h.fx * 0.08, h.y + 0.36 - k * 0.36, h.z + h.fz * 0.08);
        m.compose(p, q, s);
        glow.setMatrixAt(i, m);
        mesh.setColorAt(i, OFF[colors[k]]);
        glow.setColorAt(i, BLACK);
        h.rec.lamps.push({ i, color: colors[k], axis: h.axis });
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    glow.computeBoundingSphere();
    group.add(mesh, glow);
    this.mesh = mesh;
    this.glow = glow;
    this.glowMat = glowMat;
    this._refreshAll();
  }

  _apply(rec) {
    const st = rec.state;
    for (const l of rec.lamps) {
      const mine = st.green === l.axis;
      const lit = l.color === 'r' ? !mine : mine && ((l.color === 'g' && st.phase === 'green') || (l.color === 'y' && st.phase === 'yellow'));
      this.mesh.setColorAt(l.i, lit ? ON[l.color] : OFF[l.color]);
      this.glow.setColorAt(l.i, lit ? ON[l.color] : BLACK);
    }
  }

  _refreshAll() {
    for (const rec of this.nodes) {
      if (!rec || !rec.lamps.length) continue;
      this._compute(rec, this.time);
      rec.key = `${rec.state.green}|${rec.state.phase}`;
      this._apply(rec);
    }
    if (this.mesh) {
      this.mesh.instanceColor.needsUpdate = true;
      this.glow.instanceColor.needsUpdate = true;
    }
  }

  update(dt) {
    this.time += dt;
    if (!this.mesh) return;
    let dirty = false;
    const nodes = this.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const rec = nodes[i];
      if (!rec || !rec.lamps.length) continue;
      const st = this._compute(rec, this.time);
      // cheap change test without string allocation
      const code = (st.green === 'x' ? 1 : st.green === 'z' ? 2 : 0) * 4 + (st.phase === 'green' ? 1 : st.phase === 'yellow' ? 2 : 3);
      if (code !== rec.code) {
        rec.code = code;
        this._apply(rec);
        dirty = true;
      }
    }
    if (dirty) {
      this.mesh.instanceColor.needsUpdate = true;
      this.glow.instanceColor.needsUpdate = true;
    }
  }

  setNight(n) {
    if (this.glowMat) this.glowMat.opacity = 0.25 + n * 0.75;
  }
}

function laneCount(street) {
  return street.lanes || (street.width >= 15 ? 2 : 1);
}
