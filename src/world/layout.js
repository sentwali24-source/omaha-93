// Derived, mesh-free city layout: road graph, blocks, and "where am I" lookups.
// Everything comes from src/data/map.js. See ARCHITECTURE.md §8.
import { NS_STREETS, EW_STREETS, BOUNDS, DISTRICTS, LANDMARKS, PARKS, WATER } from '../data/map.js';
import { TURF_ZONES } from '../data/sets.js';
import { inRect } from '../core/math.js';

export const SIDEWALK = 3.5;
export const LANE_WIDTH = 3.3;

const rectContains = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

export class Layout {
  constructor(game) {
    this.game = game;
    this.SIDEWALK = SIDEWALK;
    this.LANE_WIDTH = LANE_WIDTH;
    this.bounds = { ...BOUNDS };
    this.nsStreets = [...NS_STREETS].sort((a, b) => a.x - b.x); // west → east
    this.ewStreets = [...EW_STREETS].sort((a, b) => a.z - b.z); // north → south
    this.districts = DISTRICTS;
    this.landmarks = LANDMARKS;
    this.parks = PARKS;
    this.water = WATER;
    this.zones = TURF_ZONES;
    this._buildGraph();
    this._buildBlocks();
  }

  // ------------------------------------------------------------------ graph
  _buildGraph() {
    const nodes = [];
    const edges = [];
    const grid = new Map(); // `${nsIndex},${ewIndex}` -> node
    const ns = this.nsStreets;
    const ew = this.ewStreets;

    const spans = (street, coord) => {
      const lo = street.from ?? -Infinity;
      const hi = street.to ?? Infinity;
      return coord >= lo - 0.01 && coord <= hi + 0.01;
    };

    ns.forEach((s, i) => {
      ew.forEach((e, j) => {
        // an intersection exists if each street runs through the other's line
        if (!spans(s, e.z) || !spans(e, s.x)) return;
        const node = { id: nodes.length, x: s.x, z: e.z, ns: s.id, ew: e.id, i, j, edges: [] };
        nodes.push(node);
        grid.set(`${i},${j}`, node);
      });
    });

    const addEdge = (a, b, street, axis) => {
      const length = axis === 'z' ? Math.abs(b.z - a.z) : Math.abs(b.x - a.x);
      const lanesPerDir = street.lanes || (street.width >= 15 ? 2 : 1);
      const edge = {
        id: edges.length,
        a: a.id,
        b: b.id,
        axis, // 'z' = runs north-south (along z), 'x' = runs east-west
        street: street.id,
        name: street.name,
        width: street.width,
        lanesPerDir,
        major: !!street.major,
        length,
        speed: street.speed || (street.major ? 15 : 11), // m/s cruise
      };
      edges.push(edge);
      a.edges.push(edge.id);
      b.edges.push(edge.id);
    };

    // north-south streets: connect consecutive nodes along each x line
    ns.forEach((s, i) => {
      let prev = null;
      for (let j = 0; j < ew.length; j++) {
        const n = grid.get(`${i},${j}`);
        if (!n) continue;
        if (prev) addEdge(prev, n, s, 'z');
        prev = n;
      }
    });
    ew.forEach((e, j) => {
      let prev = null;
      for (let i = 0; i < ns.length; i++) {
        const n = grid.get(`${i},${j}`);
        if (!n) continue;
        if (prev) addEdge(prev, n, e, 'x');
        prev = n;
      }
    });

    this.nodes = nodes;
    this.edges = edges;
    this._grid = grid;
  }

  nodeById(id) {
    return this.nodes[id];
  }

  edgeById(id) {
    return this.edges[id];
  }

  neighbors(nodeId) {
    const n = this.nodes[nodeId];
    return n.edges.map((eid) => {
      const e = this.edges[eid];
      return { edge: e, node: this.nodes[e.a === nodeId ? e.b : e.a] };
    });
  }

  otherEnd(edge, nodeId) {
    return this.nodes[edge.a === nodeId ? edge.b : edge.a];
  }

  nearestNode(x, z) {
    let best = null;
    let bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  nearestEdge(x, z) {
    let best = null;
    let bd = Infinity;
    let bt = 0;
    for (const e of this.edges) {
      const a = this.nodes[e.a];
      const b = this.nodes[e.b];
      let t;
      let d;
      if (e.axis === 'z') {
        t = (z - a.z) / (b.z - a.z);
        t = Math.max(0, Math.min(1, t));
        const pz = a.z + (b.z - a.z) * t;
        d = Math.hypot(x - a.x, z - pz);
      } else {
        t = (x - a.x) / (b.x - a.x);
        t = Math.max(0, Math.min(1, t));
        const px = a.x + (b.x - a.x) * t;
        d = Math.hypot(x - px, z - a.z);
      }
      if (d < bd) {
        bd = d;
        best = e;
        bt = t;
      }
    }
    return { edge: best, t: bt, dist: bd };
  }

  /** Meters to the right of the centerline (in the direction of travel) for lane index. */
  laneOffset(edge, lane = 0) {
    const lanes = edge.lanesPerDir;
    const l = Math.min(lane, lanes - 1);
    const median = edge.major && lanes >= 2 ? 0.4 : 0;
    return median + LANE_WIDTH * (l + 0.5);
  }

  /** Travel direction unit vector along edge when leaving fromNodeId. */
  edgeDir(edge, fromNodeId) {
    const a = this.nodes[fromNodeId];
    const b = this.otherEnd(edge, fromNodeId);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  /** Right-hand lane start point, pulled back from the intersection box. */
  laneStart(edge, fromNodeId, lane = 0, setback = null) {
    const a = this.nodes[fromNodeId];
    const d = this.edgeDir(edge, fromNodeId);
    const off = this.laneOffset(edge, lane);
    const sb = setback ?? this.crossWidth(a, edge) / 2 + 1;
    // right of travel direction (dx, dz) is (-dz, dx) in this coordinate system
    return { x: a.x + d.x * sb - d.z * off, z: a.z + d.z * sb + d.x * off };
  }

  laneEnd(edge, fromNodeId, lane = 0, setback = null) {
    const b = this.otherEnd(edge, fromNodeId);
    const d = this.edgeDir(edge, fromNodeId);
    const off = this.laneOffset(edge, lane);
    const sb = setback ?? this.crossWidth(b, edge) / 2 + 1;
    return { x: b.x - d.x * sb - d.z * off, z: b.z - d.z * sb + d.x * off };
  }

  /** Width of the street crossing `edge` at `node` (size of the intersection box along the edge). */
  crossWidth(node, edge) {
    const cross = edge.axis === 'z' ? this.ewStreets.find((s) => s.id === node.ew) : this.nsStreets.find((s) => s.id === node.ns);
    return cross ? cross.width : 12;
  }

  // ------------------------------------------------------------------ blocks
  _buildBlocks() {
    const blocks = [];
    const B = this.bounds;
    const xs = this.nsStreets;
    const zs = this.ewStreets;
    // column edges: bounds.minX, each NS street, bounds.maxX
    const cols = [{ x: B.minX, w: 0, id: null }, ...xs.map((s) => ({ x: s.x, w: s.width, id: s.id })), { x: B.maxX, w: 0, id: null }];
    const rows = [{ z: B.minZ, w: 0, id: null }, ...zs.map((s) => ({ z: s.z, w: s.width, id: s.id })), { z: B.maxZ, w: 0, id: null }];
    for (let i = 0; i < cols.length - 1; i++) {
      for (let j = 0; j < rows.length - 1; j++) {
        const c0 = cols[i];
        const c1 = cols[i + 1];
        const r0 = rows[j];
        const r1 = rows[j + 1];
        const x0 = c0.x + (c0.w ? c0.w / 2 + SIDEWALK : 0);
        const x1 = c1.x - (c1.w ? c1.w / 2 + SIDEWALK : 0);
        const z0 = r0.z + (r0.w ? r0.w / 2 + SIDEWALK : 0);
        const z1 = r1.z - (r1.w ? r1.w / 2 + SIDEWALK : 0);
        if (x1 - x0 < 4 || z1 - z0 < 4) continue;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const block = {
          id: blocks.length,
          x0,
          x1,
          z0,
          z1,
          cx,
          cz,
          // which sides face a street (and which street): west/east = NS streets, north/south = EW streets
          frontage: {
            w: c0.id && this._streetRuns(c0.id, cz) ? c0.id : null,
            e: c1.id && this._streetRuns(c1.id, cz) ? c1.id : null,
            n: r0.id && this._streetRuns(r0.id, cx) ? r0.id : null,
            s: r1.id && this._streetRuns(r1.id, cx) ? r1.id : null,
          },
          district: this.districtAt(cx, cz)?.id || 'north',
          landmark: this.landmarkAt(cx, cz)?.id || null,
          park: this.parkAt(cx, cz)?.id || null,
          water: this.isWater(cx, cz),
          zone: this.zoneAt(cx, cz)?.id || null,
        };
        blocks.push(block);
      }
    }
    this.blocks = blocks;
  }

  _streetRuns(streetId, coord) {
    const s = this.nsStreets.find((q) => q.id === streetId) || this.ewStreets.find((q) => q.id === streetId);
    if (!s) return false;
    return coord >= (s.from ?? -Infinity) && coord <= (s.to ?? Infinity);
  }

  blockAt(x, z) {
    for (const b of this.blocks) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b;
    return null;
  }

  // ------------------------------------------------------------------ lookups
  isRoad(x, z) {
    for (const s of this.nsStreets) {
      if (Math.abs(x - s.x) <= s.width / 2 && z >= (s.from ?? -Infinity) && z <= (s.to ?? Infinity) && z >= this.bounds.minZ && z <= this.bounds.maxZ) return true;
    }
    for (const s of this.ewStreets) {
      if (Math.abs(z - s.z) <= s.width / 2 && x >= (s.from ?? -Infinity) && x <= (s.to ?? Infinity) && x >= this.bounds.minX && x <= this.bounds.maxX) return true;
    }
    return false;
  }

  isSidewalk(x, z) {
    if (this.isRoad(x, z)) return false;
    for (const s of this.nsStreets) {
      const d = Math.abs(x - s.x) - s.width / 2;
      if (d >= 0 && d <= SIDEWALK && z >= (s.from ?? -Infinity) && z <= (s.to ?? Infinity)) return true;
    }
    for (const s of this.ewStreets) {
      const d = Math.abs(z - s.z) - s.width / 2;
      if (d >= 0 && d <= SIDEWALK && x >= (s.from ?? -Infinity) && x <= (s.to ?? Infinity)) return true;
    }
    return false;
  }

  isWater(x, z) {
    for (const w of this.water) if (rectContains(w, x, z)) return true;
    return false;
  }

  districtAt(x, z) {
    // later entries win (more specific districts are listed after broad ones)
    let found = null;
    for (const d of this.districts) if (rectContains(d.rect, x, z)) found = d;
    return found || this.districts[0];
  }

  zoneAt(x, z) {
    let found = null;
    for (const zn of this.zones) if (zn.rect && inRect(x, z, zn.rect)) found = zn;
    return found;
  }

  landmarkAt(x, z) {
    for (const l of this.landmarks) if (l.rect && rectContains(l.rect, x, z)) return l;
    return null;
  }

  parkAt(x, z) {
    for (const p of this.parks) if (rectContains(p.rect, x, z)) return p;
    return null;
  }

  streetAt(x, z) {
    let best = null;
    let bd = Infinity;
    for (const s of this.nsStreets) {
      if (z < (s.from ?? -Infinity) || z > (s.to ?? Infinity)) continue;
      const d = Math.abs(x - s.x) - s.width / 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    for (const s of this.ewStreets) {
      if (x < (s.from ?? -Infinity) || x > (s.to ?? Infinity)) continue;
      const d = Math.abs(z - s.z) - s.width / 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Display name for a numbered street: "N 24th St" north of Dodge, "S 24th St" south of it. */
  streetLabel(street, z) {
    if (!street) return '';
    if (street.northName && z < street.northOf) return street.northName;
    if (street.numbered) return `${z < 0 ? 'N' : 'S'} ${street.name}`;
    return street.name;
  }

  describe(x, z) {
    const ns = this._nearest(this.nsStreets, 'x', x, z);
    const ew = this._nearest(this.ewStreets, 'z', z, x);
    const nearNs = ns && Math.abs(x - ns.x) < ns.width / 2 + SIDEWALK + 14;
    const nearEw = ew && Math.abs(z - ew.z) < ew.width / 2 + SIDEWALK + 14;
    let street;
    if (nearNs && nearEw) street = `${this.streetLabel(ns, z)} & ${ew.name}`;
    else if (nearNs) street = this.streetLabel(ns, z);
    else if (nearEw) street = ew.name;
    else if (ns && ew) street = `near ${this.streetLabel(ns, z)} & ${ew.name}`;
    else street = '';
    return {
      street,
      district: this.districtAt(x, z),
      zone: this.zoneAt(x, z),
      landmark: this.landmarkAt(x, z),
      park: this.parkAt(x, z),
    };
  }

  _nearest(list, key, v, other) {
    let best = null;
    let bd = Infinity;
    for (const s of list) {
      if (other < (s.from ?? -Infinity) || other > (s.to ?? Infinity)) continue;
      const d = Math.abs(v - s[key]);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  randomRoadPoint(rng = Math.random) {
    const e = this.edges[Math.floor(rng() * this.edges.length)];
    const a = this.nodes[e.a];
    const b = this.nodes[e.b];
    const t = 0.2 + rng() * 0.6;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, edge: e };
  }

  randomSidewalkPoint(rng = Math.random) {
    const e = this.edges[Math.floor(rng() * this.edges.length)];
    const a = this.nodes[e.a];
    const b = this.nodes[e.b];
    const t = 0.15 + rng() * 0.7;
    const side = rng() < 0.5 ? -1 : 1;
    const off = e.width / 2 + SIDEWALK / 2;
    const x = a.x + (b.x - a.x) * t + (e.axis === 'z' ? side * off : 0);
    const z = a.z + (b.z - a.z) * t + (e.axis === 'x' ? side * off : 0);
    return { x, z, edge: e };
  }
}
