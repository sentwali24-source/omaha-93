// Sidewalk navigation graph derived from layout (no meshes).
//
// Every intersection node gets four sidewalk CORNERS (the square where the two sidewalks meet),
// at x ± (nsWidth/2 + SIDEWALK/2), z ± (ewWidth/2 + SIDEWALK/2):
//
//        q0 NW ─── crosswalk ─── q1 NE
//          │          (NS street)   │
//     crosswalk  (EW street) ─ node ─  crosswalk
//          │                       │
//        q2 SW ─── crosswalk ─── q3 SE
//
// LINKS join corners: 'walk' links run along a block face (the sidewalk of an edge, offset
// width/2 + SIDEWALK/2 from its centerline); 'cross' links are crosswalks across a street at an
// intersection. Walkers keep to the right of their direction of travel (lane offset), wait for
// the signal / a gap in traffic before a crosswalk, and pick a new link at every corner.

const CELL = 40;

export class SidewalkGraph {
  constructor(game) {
    this.game = game;
    const L = game.layout;
    const SW = L.SIDEWALK;
    const nsW = new Map(L.nsStreets.map((s) => [s.id, s.width]));
    const ewW = new Map(L.ewStreets.map((s) => [s.id, s.width]));
    this.corners = [];
    this.links = [];

    for (const n of L.nodes) {
      const ox = (nsW.get(n.ns) || 12) / 2 + SW / 2;
      const oz = (ewW.get(n.ew) || 12) / 2 + SW / 2;
      for (let q = 0; q < 4; q++) {
        this.corners.push({
          id: n.id * 4 + q,
          node: n.id,
          q,
          x: n.x + (q & 1 ? ox : -ox),
          z: n.z + (q & 2 ? oz : -oz),
          links: [],
          blocked: false,
        });
      }
    }

    const C = (nodeId, q) => this.corners[nodeId * 4 + q];
    // block-face sidewalks along each edge
    for (const e of L.edges) {
      let A = L.nodes[e.a];
      let B = L.nodes[e.b];
      if (e.axis === 'z') {
        if (A.z > B.z) [A, B] = [B, A]; // A north of B
        this._link(C(A.id, 2), C(B.id, 0), 'walk', 'z', -1);
        this._link(C(A.id, 3), C(B.id, 1), 'walk', 'z', -1);
      } else {
        if (A.x > B.x) [A, B] = [B, A]; // A west of B
        this._link(C(A.id, 1), C(B.id, 0), 'walk', 'x', -1);
        this._link(C(A.id, 3), C(B.id, 2), 'walk', 'x', -1);
      }
    }
    // corner to corner at each intersection: a crosswalk when a roadway lies between them
    for (const n of L.nodes) {
      const nw = C(n.id, 0);
      const ne = C(n.id, 1);
      const sw = C(n.id, 2);
      const se = C(n.id, 3);
      this._link(nw, ne, L.isRoad(n.x, nw.z) ? 'cross' : 'walk', 'x', n.id);
      this._link(sw, se, L.isRoad(n.x, sw.z) ? 'cross' : 'walk', 'x', n.id);
      this._link(nw, sw, L.isRoad(nw.x, n.z) ? 'cross' : 'walk', 'z', n.id);
      this._link(ne, se, L.isRoad(ne.x, n.z) ? 'cross' : 'walk', 'z', n.id);
    }

    this._validate();
    this._buildGrid();
  }

  _link(ca, cb, kind, axis, node) {
    const len = Math.hypot(cb.x - ca.x, cb.z - ca.z);
    if (len < 0.5) return;
    const link = { id: this.links.length, a: ca.id, b: cb.id, kind, axis, node, len, blocked: false };
    this.links.push(link);
    ca.links.push(link.id);
    cb.links.push(link.id);
  }

  /** Mark corners/links that the static world blocks (landmark footprints over a sidewalk). */
  _validate() {
    const col = this.game.collision;
    const L = this.game.layout;
    const B = L.bounds;
    for (const c of this.corners) {
      if (c.x < B.minX + 2 || c.x > B.maxX - 2 || c.z < B.minZ + 2 || c.z > B.maxZ - 2) c.blocked = true;
      else if (!col.isFree(c.x, c.z, 0.45, 0.3, 1.8) || L.isWater(c.x, c.z)) c.blocked = true;
    }
    for (const l of this.links) {
      const a = this.corners[l.a];
      const b = this.corners[l.b];
      if (a.blocked || b.blocked) {
        l.blocked = true;
        continue;
      }
      const steps = Math.max(1, Math.floor(l.len / 3));
      let bad = 0;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (!col.isFree(x, z, 0.3, 0.3, 1.8) || L.isWater(x, z)) bad++;
      }
      if (bad > steps * 0.35) l.blocked = true;
    }
  }

  _buildGrid() {
    this.grid = new Map();
    for (const l of this.links) {
      if (l.blocked || l.kind === 'cross') continue;
      const a = this.corners[l.a];
      const b = this.corners[l.b];
      const steps = Math.max(1, Math.ceil(l.len / 15));
      let last = -1;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const k = this._key(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        if (k === last) continue;
        last = k;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        if (list[list.length - 1] !== l.id) list.push(l.id);
      }
    }
  }

  _key(x, z) {
    return (Math.floor(x / CELL) + 1000) * 4096 + (Math.floor(z / CELL) + 1000);
  }

  corner(id) {
    return this.corners[id];
  }

  other(link, cornerId) {
    return link.a === cornerId ? link.b : link.a;
  }

  /** Nearest usable corner to (x, z). */
  nearestCorner(x, z) {
    let best = null;
    let bd = Infinity;
    for (const c of this.corners) {
      if (c.blocked) continue;
      const d = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Random point on a walkable sidewalk between rMin and rMax meters from (fx, fz).
   * filter(x, z) → bool rejects candidates (e.g. in view). Returns { link, t, x, z } or null.
   */
  randomPoint(fx, fz, rMin, rMax, rng = Math.random, filter = null, tries = 40) {
    const c0x = Math.floor((fx - rMax) / CELL);
    const c1x = Math.floor((fx + rMax) / CELL);
    const c0z = Math.floor((fz - rMax) / CELL);
    const c1z = Math.floor((fz + rMax) / CELL);
    const w = c1x - c0x + 1;
    const h = c1z - c0z + 1;
    const rMin2 = rMin * rMin;
    const rMax2 = rMax * rMax;
    for (let i = 0; i < tries; i++) {
      const cx = c0x + Math.floor(rng() * w);
      const cz = c0z + Math.floor(rng() * h);
      const list = this.grid.get((cx + 1000) * 4096 + (cz + 1000));
      if (!list || !list.length) continue;
      const link = this.links[list[Math.floor(rng() * list.length)]];
      const a = this.corners[link.a];
      const b = this.corners[link.b];
      const t = 0.08 + rng() * 0.84;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const d2 = (x - fx) * (x - fx) + (z - fz) * (z - fz);
      if (d2 < rMin2 || d2 > rMax2) continue;
      if (filter && !filter(x, z)) continue;
      return { link, t, x, z };
    }
    return null;
  }

  /** Dijkstra over corners (crosswalks included). Returns corner ids from → to, or null. */
  path(fromId, toId, maxNodes = 4000) {
    if (fromId === toId) return [fromId];
    const n = this.corners.length;
    if (!this._dist || this._dist.length !== n) {
      this._dist = new Float64Array(n);
      this._prev = new Int32Array(n);
      this._done = new Uint8Array(n);
    }
    const dist = this._dist;
    const prev = this._prev;
    const done = this._done;
    dist.fill(Infinity);
    prev.fill(-1);
    done.fill(0);
    dist[fromId] = 0;
    const open = [fromId];
    let expanded = 0;
    while (open.length && expanded < maxNodes) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      expanded++;
      if (cur === toId) break;
      const c = this.corners[cur];
      for (const lid of c.links) {
        const l = this.links[lid];
        if (l.blocked) continue;
        const o = this.other(l, cur);
        if (done[o]) continue;
        const nd = dist[cur] + l.len * (l.kind === 'cross' ? 1.3 : 1);
        if (nd < dist[o]) {
          dist[o] = nd;
          prev[o] = cur;
          open.push(o);
        }
      }
    }
    if (prev[toId] === -1) return null;
    const out = [];
    for (let c = toId; c !== -1; c = prev[c]) out.push(c);
    return out.reverse();
  }
}

const graphs = new WeakMap();
/** One shared graph per game (built on first use, after the city colliders exist). */
export function sidewalkGraph(game) {
  let g = graphs.get(game);
  if (!g) {
    g = new SidewalkGraph(game);
    graphs.set(game, g);
  }
  return g;
}

// ------------------------------------------------------------------------------------ walker

/**
 * Per-NPC sidewalk walker. update() writes a desired velocity into `out` and returns
 *   'walk'   heading along the sidewalk / crosswalk
 *   'wait'   standing at a curb waiting for the signal or a gap in traffic
 *   'arrive' reached the end of a path (path mode)
 * Options on the instance: zone (rect to prefer staying inside), crossChance, path (corner ids).
 */
export class Walker {
  constructor(graph) {
    this.g = graph;
    this.from = -1;
    this.to = -1;
    this.link = null;
    this.lane = 0.35 + Math.random() * 0.7; // meters right of the sidewalk centerline
    this.tx = 0;
    this.tz = 0;
    this.waitT = 0;
    this.waiting = false;
    this.crossChance = 0.55;
    this.zone = null; // { x0, x1, z0, z1 }
    this.path = null; // corner ids to follow (path mode)
    this.pathI = 0;
    this.speedMul = 1;
  }

  /** Start on `link` at fraction t, heading toward its b corner (or a when !towardB). */
  placeOn(link, towardB = Math.random() < 0.5) {
    this.link = link;
    this.from = towardB ? link.a : link.b;
    this.to = towardB ? link.b : link.a;
    this.path = null;
    this._target();
  }

  /** Re-enter the graph from an arbitrary position (after fleeing, fighting, idling...). */
  resume(x, z) {
    const g = this.g;
    const c = g.nearestCorner(x, z);
    if (!c) return false;
    // pick the link out of that corner that points most away from us, so we do not
    // walk back and forth; approach the corner itself first when it is far
    const d = Math.hypot(c.x - x, c.z - z);
    let best = null;
    let bs = -Infinity;
    for (const lid of c.links) {
      const l = g.links[lid];
      if (l.blocked) continue;
      const o = g.corners[g.other(l, c.id)];
      // prefer links whose far end is closer to us (we're somewhere along it)
      const s = -Math.hypot(o.x - x, o.z - z) + (l.kind === 'walk' ? 6 : 0) + Math.random() * 4;
      if (s > bs) {
        bs = s;
        best = l;
      }
    }
    if (!best) return false;
    const o = g.other(best, c.id);
    if (d > 6) {
      // walk to the nearest corner along this link first
      this.link = best;
      this.from = o;
      this.to = c.id;
    } else {
      this.link = best;
      this.from = c.id;
      this.to = o;
    }
    this.path = null;
    this._target();
    return true;
  }

  /** Follow a corner path (from SidewalkGraph.path). */
  followPath(path) {
    if (!path || path.length < 1) return false;
    this.path = path;
    this.pathI = 0;
    this.from = path[0];
    this.to = path[0];
    this.link = null;
    this._target();
    return true;
  }

  _target() {
    const g = this.g;
    const c = g.corners[this.to];
    const f = g.corners[this.from];
    let dx = c.x - f.x;
    let dz = c.z - f.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // right of travel = (-dz, dx)
    const lane = this.link && this.link.kind === 'cross' ? this.lane * 0.8 : this.lane;
    this.tx = c.x - dz * lane;
    this.tz = c.z + dx * lane;
  }

  _pickNext(game) {
    const g = this.g;
    const c = g.corners[this.to];
    if (this.path) {
      this.pathI++;
      if (this.pathI >= this.path.length) return 'arrive';
      const next = this.path[this.pathI];
      const link = c.links.map((id) => g.links[id]).find((l) => g.other(l, c.id) === next);
      this.from = c.id;
      this.to = next;
      this.link = link || null;
      this._target();
      return 'walk';
    }
    let total = 0;
    const cands = this._cands || (this._cands = []);
    const weights = this._w || (this._w = []);
    cands.length = 0;
    weights.length = 0;
    const cameFrom = this.from;
    const curAxis = this.link ? this.link.axis : null;
    for (const lid of c.links) {
      const l = g.links[lid];
      if (l.blocked) continue;
      const o = g.other(l, c.id);
      let w = l.kind === 'cross' ? this.crossChance : 1;
      if (o === cameFrom) w *= 0.03; // U-turns only at dead ends
      else if (l.kind === 'walk' && l.axis === curAxis && this.link && this.link.kind === 'walk') w *= 2.2; // keep going straight
      if (this.zone) {
        const oc = g.corners[o];
        const z = this.zone;
        if (oc.x < z.x0 || oc.x > z.x1 || oc.z < z.z0 || oc.z > z.z1) w *= 0.02;
      }
      if (w <= 0) continue;
      cands.push(l);
      weights.push(w);
      total += w;
    }
    if (!cands.length) {
      // isolated corner: turn around
      [this.from, this.to] = [this.to, this.from];
      this._target();
      return 'walk';
    }
    let r = Math.random() * total;
    let pick = cands[cands.length - 1];
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = cands[i];
        break;
      }
    }
    this.link = pick;
    this.from = c.id;
    this.to = g.other(pick, c.id);
    this._target();
    this.waiting = pick.kind === 'cross';
    this.waitT = 0;
    return 'walk';
  }

  /** Is it OK to start across `link` (a crosswalk) right now? */
  _crossingClear(game, link) {
    const sig = game.city?.signalAt?.(link.node);
    if (sig && this.waitT < 20) {
      if (sig.phase !== 'green' || sig.green !== link.axis) return false;
      if (typeof sig.t === 'number' && sig.t > 10) return false; // don't start late in the phase
    }
    const g = this.g;
    const a = g.corners[link.a];
    const b = g.corners[link.b];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const vs = game.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const dx = mx - v.position.x;
      const dz = mz - v.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 30 * 30) continue;
      if (d2 < 5 * 5) return false; // a car sitting in the crosswalk
      const sp = Math.abs(v.speed || 0);
      if (sp < 1.5) continue;
      const fx = -Math.sin(v.heading) * Math.sign(v.speed);
      const fz = -Math.cos(v.heading) * Math.sign(v.speed);
      const along = dx * fx + dz * fz;
      if (along > 0 && along / sp < 4.5) return false; // it'll get here within ~4 s
    }
    return true;
  }

  /** Advance; writes desired velocity (m/s) into out. */
  update(game, a, speed, dt, out) {
    const p = a.position;
    if (this.waiting && this.link) {
      // stand at the curb until it's safe, then go
      this.waitT += dt;
      if (this._crossingClear(game, this.link) || this.waitT > 28) {
        this.waiting = false;
      } else {
        // keep near the corner
        const g = this.g;
        const c = g.corners[this.from];
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const d = Math.hypot(dx, dz);
        const s = d > 0.9 ? Math.min(speed, d) : 0;
        out.x = d > 0 ? (dx / d) * s : 0;
        out.z = d > 0 ? (dz / d) * s : 0;
        return 'wait';
      }
    }
    const dx = this.tx - p.x;
    const dz = this.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.75) {
      const r = this._pickNext(game);
      if (r === 'arrive') {
        out.x = 0;
        out.z = 0;
        return 'arrive';
      }
      out.x = 0;
      out.z = 0;
      return this.waiting ? 'wait' : 'walk';
    }
    // hurry across crosswalks
    const s = speed * this.speedMul * (this.link && this.link.kind === 'cross' ? 1.25 : 1);
    out.x = (dx / d) * s;
    out.z = (dz / d) * s;
    return 'walk';
  }

  /** Crossing a street right now (on a crosswalk link, not waiting). */
  get onCrosswalk() {
    return !!this.link && this.link.kind === 'cross' && !this.waiting;
  }

  /** Is (x, z) the current target direction blocked for a while? Pick a different link. */
  reroute(game) {
    // swap direction: go back to where we came from
    [this.from, this.to] = [this.to, this.from];
    this.waiting = false;
    this._target();
  }
}
