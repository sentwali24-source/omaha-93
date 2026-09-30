import { Y } from './context.js';
import { rgb } from './batch.js';

// Ground, roadways, sidewalks, curbs and road paint.
//
// Roadway = node boxes (curb to curb of both streets) + edge segments between them + stubs that
// run from the last node to the map edge (clipped at parks / water / landmarks). Sidewalks are a
// ring around each block on every side whose street is actually paved, so no two sidewalk pieces
// overlap (corner squares belong to the north/south strips). Paint sits on its own
// polygon-offset material so it never z-fights the asphalt.

const SW = 3.5; // sidewalk width (layout.SIDEWALK)

export function buildGround(C) {
  const { L, B } = C;
  const bounds = L.bounds;
  const asphalt = C.s('asphalt', '#ffffff');
  const asphaltMinor = C.s('asphalt2', '#ffffff');
  const brick = C.s('brick', '#ffffff');
  const walk = C.s('sidewalk', '#ffffff');
  const curb = C.s('curb', '#ffffff');
  const concrete = C.s('concrete', '#d8d4cc');

  const nsById = new Map(L.nsStreets.map((s) => [s.id, s]));
  const ewById = new Map(L.ewStreets.map((s) => [s.id, s]));

  // ---- node lookup per street, ordered
  const nodesOnNs = new Map();
  const nodesOnEw = new Map();
  for (const n of L.nodes) {
    if (!nodesOnNs.has(n.ns)) nodesOnNs.set(n.ns, []);
    if (!nodesOnEw.has(n.ew)) nodesOnEw.set(n.ew, []);
    nodesOnNs.get(n.ns).push(n);
    nodesOnEw.get(n.ew).push(n);
  }
  for (const list of nodesOnNs.values()) list.sort((a, b) => a.z - b.z);
  for (const list of nodesOnEw.values()) list.sort((a, b) => a.x - b.x);

  const hwOf = (n) => nsById.get(n.ns).width / 2; // half width of the NS street at node
  const hdOf = (n) => ewById.get(n.ew).width / 2; // half width of the EW street at node

  // stubs are clipped where they would run into parks / water / landmarks
  const clipKinds = ['landmark', 'park', 'water'];
  const clipStub = (x0, z0, x1, z1, axis, dir) => {
    // walk from the node outward in 2 m steps until a reserved area is hit
    const len = axis === 'z' ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
    let ok = 0;
    for (let t = 0; t <= len; t += 2) {
      const cx = axis === 'z' ? (x0 + x1) / 2 : x0 + dir * t;
      const cz = axis === 'z' ? z0 + dir * t : (z0 + z1) / 2;
      const hw = axis === 'z' ? Math.abs(x1 - x0) / 2 : 1;
      const hd = axis === 'z' ? 1 : Math.abs(z1 - z0) / 2;
      if (C.isReserved(cx - hw, cz - hd, cx + hw, cz + hd, clipKinds)) break;
      ok = t;
    }
    return ok;
  };

  // ---- road extents per street (used for sidewalks / frontage tests)
  // nsExtent: id → [z0, z1]; ewExtent: id → [x0, x1]
  const nsExtent = new Map();
  const ewExtent = new Map();
  const segments = []; // { axis, street, x0, z0, x1, z1 } road rects (non-box)
  const legs = new Map(); // node id → { n, s, e, w }
  for (const n of L.nodes) legs.set(n.id, { n: false, s: false, e: false, w: false });

  for (const s of L.nsStreets) {
    const list = nodesOnNs.get(s.id) || [];
    if (!list.length) continue;
    const hw = s.width / 2;
    let z0 = list[0].z - hdOf(list[0]);
    let z1 = list[list.length - 1].z + hdOf(list[list.length - 1]);
    // edges between consecutive nodes
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      segments.push({ axis: 'z', street: s, x0: s.x - hw, x1: s.x + hw, z0: a.z + hdOf(a), z1: b.z - hdOf(b), a, b });
      legs.get(a.id).s = true;
      legs.get(b.id).n = true;
    }
    // stub north
    const first = list[0];
    if (s.from == null) {
      const zs = first.z - hdOf(first);
      const len = clipStub(s.x - hw, zs, s.x + hw, bounds.minZ, 'z', -1);
      if (len > 4) {
        segments.push({ axis: 'z', street: s, x0: s.x - hw, x1: s.x + hw, z0: zs - len, z1: zs, stub: true, a: first });
        legs.get(first.id).n = true;
        z0 = zs - len;
      }
    }
    const last = list[list.length - 1];
    if (s.to == null) {
      const zs = last.z + hdOf(last);
      const len = clipStub(s.x - hw, zs, s.x + hw, bounds.maxZ, 'z', 1);
      if (len > 4) {
        segments.push({ axis: 'z', street: s, x0: s.x - hw, x1: s.x + hw, z0: zs, z1: zs + len, stub: true, a: last });
        legs.get(last.id).s = true;
        z1 = zs + len;
      }
    }
    nsExtent.set(s.id, [z0, z1]);
  }
  for (const s of L.ewStreets) {
    const list = nodesOnEw.get(s.id) || [];
    if (!list.length) continue;
    const hd = s.width / 2;
    let x0 = list[0].x - hwOf(list[0]);
    const x1 = list[list.length - 1].x + hwOf(list[list.length - 1]);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      segments.push({ axis: 'x', street: s, z0: s.z - hd, z1: s.z + hd, x0: a.x + hwOf(a), x1: b.x - hwOf(b), a, b });
      legs.get(a.id).e = true;
      legs.get(b.id).w = true;
    }
    const first = list[0];
    if (s.from == null) {
      const xs = first.x - hwOf(first);
      const len = clipStub(xs, s.z - hd, bounds.minX, s.z + hd, 'x', -1);
      if (len > 4) {
        segments.push({ axis: 'x', street: s, z0: s.z - hd, z1: s.z + hd, x0: xs - len, x1: xs, stub: true, a: first });
        legs.get(first.id).w = true;
        x0 = xs - len;
      }
    }
    ewExtent.set(s.id, [x0, x1]);
  }
  C.roadSegments = segments;
  C.nodeLegs = legs;
  C.nsExtent = nsExtent;
  C.ewExtent = ewExtent;

  const isBrick = (street, x) => street.surface === 'brick' && x >= (street.surfaceFromX ?? -Infinity);

  // ---- asphalt: node boxes
  for (const n of L.nodes) {
    const hw = hwOf(n);
    const hd = hdOf(n);
    const ns = nsById.get(n.ns);
    const ew = ewById.get(n.ew);
    B.at(n.x, n.z);
    const st = isBrick(ew, n.x - hw + 0.1) ? brick : ns.major || ew.major ? asphalt : asphaltMinor;
    C.ground('surface', n.x - hw, n.z - hd, n.x + hw, n.z + hd, Y.road, st);
  }
  // ---- asphalt: segments (split long ones so chunks stay local)
  for (const g of segments) {
    const len = g.axis === 'z' ? g.z1 - g.z0 : g.x1 - g.x0;
    if (len <= 0.05) continue;
    const pieces = Math.max(1, Math.ceil(len / 60));
    for (let i = 0; i < pieces; i++) {
      let x0 = g.x0;
      let x1 = g.x1;
      let z0 = g.z0;
      let z1 = g.z1;
      if (g.axis === 'z') {
        z0 = g.z0 + (len * i) / pieces;
        z1 = g.z0 + (len * (i + 1)) / pieces;
      } else {
        x0 = g.x0 + (len * i) / pieces;
        x1 = g.x0 + (len * (i + 1)) / pieces;
      }
      B.at((x0 + x1) / 2, (z0 + z1) / 2);
      const st = isBrick(g.street, x0 + 0.1) ? brick : g.street.major ? asphalt : asphaltMinor;
      C.ground('surface', x0, z0, x1, z1, Y.road, st);
    }
  }

  // ---- sidewalks: ring around each block, only where the adjacent street is paved
  const paved = (side, blk) => {
    const id = blk.frontage[side];
    if (!id) return false;
    if (side === 'w' || side === 'e') {
      const ext = nsExtent.get(id);
      return !!ext && blk.cz >= ext[0] - 0.5 && blk.cz <= ext[1] + 0.5;
    }
    const ext = ewExtent.get(id);
    return !!ext && blk.cx >= ext[0] - 0.5 && blk.cx <= ext[1] + 0.5;
  };
  const wallFace = (x0, z0, x1, z1, y0, y1, st) => {
    C.use(st);
    B.wall('surface', x0, z0, x1, z1, y0, y1, st.tw, y1 - y0, 0, y0);
  };
  C.blockPaved = new Map();
  for (const blk of L.blocks) {
    const p = { n: paved('n', blk), s: paved('s', blk), w: paved('w', blk), e: paved('e', blk) };
    C.blockPaved.set(blk.id, p);
    const { x0, x1, z0, z1 } = blk;
    B.at(blk.cx, blk.cz);
    const wx0 = p.w ? x0 - SW : x0;
    const wx1 = p.e ? x1 + SW : x1;
    const y = Y.walk;
    if (p.n) {
      C.use(walk);
      B.flat('surface', wx0, z0 - SW, wx1, z0, y, walk.tw, walk.th, 0, z0 / walk.th);
      wallFace(wx1, z0 - SW, wx0, z0 - SW, Y.road - 0.02, y, curb); // faces north
      if (p.w) wallFace(wx0, z0 - SW, wx0, z0, Y.road - 0.02, y, curb); // west end faces west
      if (p.e) wallFace(wx1, z0, wx1, z0 - SW, Y.road - 0.02, y, curb);
      wallFace(x0, z0, x1, z0, 0, y, concrete); // inner lip faces the block (south)
    }
    if (p.s) {
      C.use(walk);
      B.flat('surface', wx0, z1, wx1, z1 + SW, y, walk.tw, walk.th, 0, (z1 + SW) / walk.th);
      wallFace(wx0, z1 + SW, wx1, z1 + SW, Y.road - 0.02, y, curb); // faces south
      if (p.w) wallFace(wx0, z1, wx0, z1 + SW, Y.road - 0.02, y, curb);
      if (p.e) wallFace(wx1, z1 + SW, wx1, z1, Y.road - 0.02, y, curb);
      wallFace(x1, z1, x0, z1, 0, y, concrete); // faces north into the block
    }
    if (p.w) {
      C.use(walk);
      B.flat('surface', x0 - SW, z0, x0, z1, y, walk.tw, walk.th, -(x0 - SW) / walk.tw, 0);
      wallFace(x0 - SW, z0, x0 - SW, z1, Y.road - 0.02, y, curb); // faces west
      wallFace(x0, z1, x0, z0, 0, y, concrete); // faces east into the block
    }
    if (p.e) {
      C.use(walk);
      B.flat('surface', x1, z0, x1 + SW, z1, y, walk.tw, walk.th, -x1 / walk.tw, 0);
      wallFace(x1 + SW, z1, x1 + SW, z0, Y.road - 0.02, y, curb); // faces east
      wallFace(x1, z0, x1, z1, 0, y, concrete); // faces west into the block
    }
  }

  buildPaint(C, segments, legs, nsById, ewById, hwOf, hdOf, isBrick);
}

// ------------------------------------------------------------------ road paint
function buildPaint(C, segments, legs, nsById, ewById, hwOf, hdOf, isBrick) {
  const { L, B } = C;
  const paint = C.s('paint');
  const yellow = rgb('#d9ad2c');
  const white = rgb('#e6e6de');
  const y = Y.paint;
  const signal = (n) => nsById.get(n.ns).major || ewById.get(n.ew).major;
  C.isSignalNode = signal;

  const rect = (x0, z0, x1, z1, col) => {
    B.tile = paint.tile;
    B.color = col;
    B.flat('paint', Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y, paint.tw, paint.th);
  };
  // dashed line along an axis
  const dashes = (axis, c, from, to, off, w, dash, gap, col) => {
    const len = to - from;
    if (len < 1) return;
    const period = dash + gap;
    const n = Math.floor((len + gap) / period);
    const start = from + (len - (n * period - gap)) / 2;
    for (let i = 0; i < n; i++) {
      const a = start + i * period;
      if (axis === 'z') rect(c + off - w / 2, a, c + off + w / 2, a + dash, col);
      else rect(a, c + off - w / 2, a + dash, c + off + w / 2, col);
    }
  };
  const solid = (axis, c, from, to, off, w, col) => {
    if (to - from < 0.5) return;
    if (axis === 'z') rect(c + off - w / 2, from, c + off + w / 2, to, col);
    else rect(from, c + off - w / 2, to, c + off + w / 2, col);
  };

  const CW = 3.2; // crosswalk depth
  for (const g of segments) {
    const s = g.street;
    if (isBrick(s, (g.x0 + g.x1) / 2)) continue;
    const axis = g.axis;
    const c = axis === 'z' ? s.x : s.z;
    // leave room for crosswalks / stop bars at signalized ends
    const aSig = g.a && signal(g.a);
    const bSig = g.b && signal(g.b);
    let from = axis === 'z' ? g.z0 : g.x0;
    let to = axis === 'z' ? g.z1 : g.x1;
    from += aSig ? CW + 1.2 : 1.2;
    to -= g.b ? (bSig ? CW + 1.2 : 1.2) : 0;
    if (g.stub && g.a) {
      // stubs start at the node end (a) on either side
      const aAtStart = axis === 'z' ? Math.abs(g.z0 - (g.a.z + hdOf(g.a))) < 0.1 : Math.abs(g.x0 - (g.a.x + hwOf(g.a))) < 0.1;
      from = axis === 'z' ? g.z0 : g.x0;
      to = axis === 'z' ? g.z1 : g.x1;
      if (aAtStart) from += aSig ? CW + 1.2 : 1.2;
      else to -= aSig ? CW + 1.2 : 1.2;
    }
    if (to - from < 2) continue;
    const pieces = Math.max(1, Math.ceil((to - from) / 60));
    const lanes = s.lanes || (s.width >= 15 ? 2 : 1);
    for (let i = 0; i < pieces; i++) {
      const f = from + ((to - from) * i) / pieces;
      const t = from + ((to - from) * (i + 1)) / pieces;
      B.at(axis === 'z' ? c : (f + t) / 2, axis === 'z' ? (f + t) / 2 : c);
      if (s.major) {
        const m = lanes >= 2 ? 0.22 : 0.14;
        solid(axis, c, f, t, -m, 0.12, yellow);
        solid(axis, c, f, t, m, 0.12, yellow);
        if (lanes >= 2) {
          const lo = 0.4 + 3.3;
          dashes(axis, c, f, t, -lo, 0.12, 3, 6, white);
          dashes(axis, c, f, t, lo, 0.12, 3, 6, white);
        }
      } else {
        dashes(axis, c, f, t, 0, 0.12, 2.5, 5, yellow);
      }
    }
  }

  // crosswalks + stop bars
  for (const n of L.nodes) {
    const lg = legs.get(n.id);
    const hw = hwOf(n);
    const hd = hdOf(n);
    const sig = signal(n);
    B.at(n.x, n.z);
    const ew = ewById.get(n.ew);
    if (isBrick(ew, n.x - hw)) continue;
    const zebra = (axis, sideSign) => {
      // crosswalk across the leg on side sideSign (-1 = north/west, +1 = south/east)
      if (axis === 'z') {
        const z0 = sideSign < 0 ? n.z - hd - CW : n.z + hd;
        const z1 = z0 + CW;
        for (let x = n.x - hw + 0.6; x < n.x + hw - 0.5; x += 1.2) rect(x, z0 + 0.25, x + 0.55, z1 - 0.25, white);
        // stop bar on the approach half (right-hand traffic)
        const zb = sideSign < 0 ? z0 - 0.9 : z1 + 0.5;
        if (sideSign < 0) rect(n.x - hw + 0.3, zb, n.x - 0.3, zb + 0.4, white);
        else rect(n.x + 0.3, zb, n.x + hw - 0.3, zb + 0.4, white);
      } else {
        const x0 = sideSign < 0 ? n.x - hw - CW : n.x + hw;
        const x1 = x0 + CW;
        for (let z = n.z - hd + 0.6; z < n.z + hd - 0.5; z += 1.2) rect(x0 + 0.25, z, x1 - 0.25, z + 0.55, white);
        const xb = sideSign < 0 ? x0 - 0.9 : x1 + 0.5;
        // eastbound traffic (coming from the west) drives on the south half
        if (sideSign < 0) rect(xb, n.z + 0.3, xb + 0.4, n.z + hd - 0.3, white);
        else rect(xb, n.z - hd + 0.3, xb + 0.4, n.z - 0.3, white);
      }
    };
    const stopBar = (axis, sideSign) => {
      if (axis === 'z') {
        const zb = sideSign < 0 ? n.z - hd - 1.2 : n.z + hd + 0.8;
        if (sideSign < 0) rect(n.x - hw + 0.3, zb, n.x - 0.3, zb + 0.4, white);
        else rect(n.x + 0.3, zb, n.x + hw - 0.3, zb + 0.4, white);
      } else {
        const xb = sideSign < 0 ? n.x - hw - 1.2 : n.x + hw + 0.8;
        if (sideSign < 0) rect(xb, n.z + 0.3, xb + 0.4, n.z + hd - 0.3, white);
        else rect(xb, n.z - hd + 0.3, xb + 0.4, n.z - 0.3, white);
      }
    };
    const f = sig ? zebra : stopBar;
    if (lg.n) f('z', -1);
    if (lg.s) f('z', 1);
    if (lg.w) f('x', -1);
    if (lg.e) f('x', 1);
  }
}
