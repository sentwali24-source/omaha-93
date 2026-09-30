import { Frame, rgb, shade } from './batch.js';
import { faces, lbox, tree } from './kit.js';
import { Y } from './context.js';
import { FT } from '../textures.js';
import { BILLBOARDS } from './names.js';

// Street furniture: cobra-head streetlights (on wooden utility poles in North Omaha, steel poles
// elsewhere) with additive light pools, utility poles with sagging wires, stop signs, green
// street-name blades, hydrants, US West payphones, bus-stop benches, newspaper boxes, trash cans,
// mailboxes, billboards and downtown street trees. Signals live in signals.js.

const pick = (r, a) => a[Math.floor(r() * a.length)];
const SW = 3.5;

export function buildProps(C) {
  const { L } = C;
  const r = C.rng.next;
  const low = C.detail === 0;
  const nsById = new Map(L.nsStreets.map((s) => [s.id, s]));
  const ewById = new Map(L.ewStreets.map((s) => [s.id, s]));
  C.nsById = nsById;
  C.ewById = ewById;

  const districtOf = (x, z) => C.L.districtAt(x, z)?.id;
  const utilityDistrict = (x, z) => {
    const d = districtOf(x, z);
    return d === 'north' || d === 'midtown' || d === 'eastomaha' || d === 'nodo';
  };
  // is (x, z) on a crossing roadway / node box (plus margin)?
  const nearNode = (x, z, m) => {
    for (const n of C.nodesNear(x, z)) {
      const hw = nsById.get(n.ns).width / 2 + SW + m;
      const hd = ewById.get(n.ew).width / 2 + SW + m;
      if (Math.abs(x - n.x) < hw && Math.abs(z - n.z) < hd) return true;
    }
    return false;
  };

  // ---------------------------------------------------------------- utility poles, wires, lights
  const lights = [];
  const runs = [];
  for (const s of L.nsStreets) {
    const ext = C.nsExtent.get(s.id);
    if (!ext) continue;
    runs.push({ axis: 'z', street: s, c: s.x, from: ext[0], to: ext[1], off: s.width / 2 + 0.42 });
  }
  for (const s of L.ewStreets) {
    const ext = C.ewExtent.get(s.id);
    if (!ext) continue;
    runs.push({ axis: 'x', street: s, c: s.z, from: ext[0], to: ext[1], off: s.width / 2 + 0.42 });
  }
  const spacing = low ? 44 : 36;
  for (const run of runs) {
    // utility side: east side of NS streets, south side of EW streets; lights alternate sides on
    // commercial/downtown stretches
    const util = { side: 1, poles: [] };
    for (let t = run.from + 8; t < run.to - 4; t += spacing) {
      let p = t;
      // slide out of intersections
      for (let k = 0; k < 8; k++) {
        const x = run.axis === 'z' ? run.c + run.off : p;
        const z = run.axis === 'z' ? p : run.c + run.off;
        if (!nearNode(x, z, 0.5)) break;
        p += 4;
      }
      if (p > run.to - 4) break;
      const along = p;
      for (const side of [1, -1]) {
        const x = run.axis === 'z' ? run.c + side * run.off : along;
        const z = run.axis === 'z' ? along : run.c + side * run.off;
        // curb-side: only the landmark footprints themselves (no pad), parks and hoods block it
        // (and nothing tall under the elevated freeway decks)
        if (C.pointReserved(x, z, ['landmark', 'water', 'park', 'freeway'], 0.25, 0) || C.pointReserved(x, z, ['hood'], 0.3)) continue;
        if (!C.isSidewalkPaved(x, z)) continue;
        const utilHere = side === util.side && utilityDistrict(x, z) && !run.street.major;
        if (utilHere) {
          util.poles.push({ x, z, along });
          if ((util.poles.length % (low ? 2 : 1)) === 0 || run.street.major) lights.push({ x, z, axis: run.axis, side, pole: 'wood', street: run.street });
        } else {
          const dist = districtOf(x, z);
          const dense = dist === 'downtown' || dist === 'oldmarket';
          const want = run.street.major || dense ? side === 1 || dense : side === (Math.round(along / spacing) % 2 ? 1 : -1);
          if (want && !(utilityDistrict(x, z) && side === util.side)) lights.push({ x, z, axis: run.axis, side, pole: 'steel', street: run.street });
        }
      }
    }
    // wires between consecutive utility poles
    const poles = util.poles;
    for (let i = 0; i < poles.length; i++) {
      const p = poles[i];
      utilityPole(C, p.x, p.z, run.axis, r);
      const q = poles[i + 1];
      if (!q || Math.abs(q.along - p.along) > spacing * 1.6) continue;
      const ca = run.axis === 'z' ? [1, 0] : [0, 1]; // crossarm direction
      for (const k of [-1.0, 0, 1.0]) {
        C.wire(p.x + ca[0] * k, 9.75, p.z + ca[1] * k, q.x + ca[0] * k, 9.75, q.z + ca[1] * k, 0.55);
      }
      C.wire(p.x, 7.6, p.z, q.x, 7.6, q.z, 0.4);
    }
  }
  for (const l of lights) streetLight(C, l, r);
  C.stats.props += lights.length;

  // ---------------------------------------------------------------- per-intersection furniture
  let payphones = 0;
  let busN = 0;
  for (const n of L.nodes) {
    const ns = nsById.get(n.ns);
    const ew = ewById.get(n.ew);
    const hw = ns.width / 2;
    const hd = ew.width / 2;
    const legs = C.nodeLegs.get(n.id);
    const signal = C.isSignalNode(n);
    const dist = districtOf(n.x, n.z);
    const strip = C.stripFor(ns.id, { x0: n.x - 1, x1: n.x + 1, z0: n.z - 1, z1: n.z + 1 }) || C.stripFor(ew.id, { x0: n.x - 1, x1: n.x + 1, z0: n.z - 1, z1: n.z + 1 });
    const urban = dist === 'downtown' || dist === 'oldmarket';
    const busy = urban || !!strip || (dist === 'midtown' && (ns.major || ew.major));
    C.B.at(n.x, n.z);
    // corners: [sx, sz] = which quadrant
    const corners = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
    const cornerPt = (sx, sz, ax, az) => ({ x: n.x + sx * (hw + ax), z: n.z + sz * (hd + az) });
    const cornerPaved = (sx, sz) => C.isSidewalkPaved(n.x + sx * (hw + 1.5), n.z + sz * (hd + 1.5));

    // street-name blades at the NE (or first paved) corner
    const cName = corners.find(([sx, sz]) => cornerPaved(sx, sz));
    if (cName) {
      const p = cornerPt(cName[0], cName[1], 0.7, 0.7);
      if (!C.pointReserved(p.x, p.z, ['landmark', 'hood'], 0.3)) streetNameSign(C, p.x, p.z, C.L.streetLabel(ns, n.z).toUpperCase(), ew.name.toUpperCase(), signal);
    }
    // stop signs at minor intersections
    if (!signal) {
      if (legs.n && cornerPaved(-1, -1)) stopSign(C, n.x - hw - 0.7, n.z - hd - 1.4, 0, -1);
      if (legs.s && cornerPaved(1, 1)) stopSign(C, n.x + hw + 0.7, n.z + hd + 1.4, 0, 1);
      if (legs.e && cornerPaved(1, -1)) stopSign(C, n.x + hw + 1.4, n.z - hd - 0.7, 1, 0);
      if (legs.w && cornerPaved(-1, 1)) stopSign(C, n.x - hw - 1.4, n.z + hd + 0.7, -1, 0);
    }
    // hydrant
    {
      const [sx, sz] = pick(r, corners);
      if (cornerPaved(sx, sz)) {
        const p = r() < 0.5 ? cornerPt(sx, sz, 0.45, 3.2) : cornerPt(sx, sz, 3.2, 0.45);
        if (!C.pointReserved(p.x, p.z, ['landmark', 'hood'], 0.4)) hydrant(C, p.x, p.z);
      }
    }
    if (!busy) continue;
    // payphone (pedestal) at a corner
    if (r() < (urban ? 0.45 : 0.5)) {
      const [sx, sz] = pick(r, corners);
      if (cornerPaved(sx, sz)) {
        // against the building side of the sidewalk, facing the street
        const alongNS = r() < 0.5;
        const p = alongNS ? cornerPt(sx, sz, SW - 0.45, 4.5) : cornerPt(sx, sz, 4.5, SW - 0.45);
        const nx = alongNS ? -sx : 0;
        const nz = alongNS ? 0 : -sz;
        if (!C.pointReserved(p.x, p.z, ['landmark', 'hood'], 0.6) && C.claimSpot(p.x, p.z, 1)) {
          pedestalPhone(C, p.x, p.z, nx, nz, `${ns.id === '24th' || ns.numbered ? C.L.streetLabel(ns, n.z) : ns.name} & ${ew.name}`);
          payphones++;
        }
      }
    }
    // newspaper boxes / trash can / mailbox
    if (!low || urban) {
      const [sx, sz] = pick(r, corners);
      if (cornerPaved(sx, sz)) {
        const p = cornerPt(sx, sz, 0.8, 5.5);
        if (!C.pointReserved(p.x, p.z, ['landmark', 'hood'], 0.6) && C.claimSpot(p.x, p.z, 1.2)) {
          newsBox(C, p.x, p.z, sx, 0);
          if (r() < 0.6) newsBox(C, p.x, p.z + sz * 0.7, sx, 0, true);
        }
      }
      const [tx, tz] = pick(r, corners);
      if (cornerPaved(tx, tz)) {
        const p = cornerPt(tx, tz, 5.5, 0.8);
        if (!C.pointReserved(p.x, p.z, ['landmark', 'hood'], 0.5) && C.claimSpot(p.x, p.z, 0.8)) trashCan(C, p.x, p.z);
      }
      if (r() < 0.3) {
        const [mx, mz] = pick(r, corners);
        if (cornerPaved(mx, mz)) {
          const p = cornerPt(mx, mz, 0.9, 7.5);
          if (!C.pointReserved(p.x, p.z, ['landmark', 'hood'], 0.5) && C.claimSpot(p.x, p.z, 0.9)) mailbox(C, p.x, p.z, -mx, 0);
        }
      }
    }
    // bus stops on majors
    const majorAxis = ns.major ? 'z' : ew.major ? 'x' : null;
    if (majorAxis && busN++ % 2 === 0) {
      // far side of the intersection, right-hand side of travel
      const dir = r() < 0.5 ? 1 : -1;
      let p;
      let nx;
      let nz;
      if (majorAxis === 'z') {
        // northbound (dir -1: moving -z) stops on the east side north of the node
        const sx = dir < 0 ? 1 : -1;
        p = { x: n.x + sx * (hw + SW - 0.7), z: n.z + dir * (hd + 9) };
        nx = -sx;
        nz = 0;
      } else {
        const sz = dir > 0 ? 1 : -1;
        p = { x: n.x + dir * (hw + 9), z: n.z + sz * (hd + SW - 0.7) };
        nx = 0;
        nz = -sz;
      }
      if (C.isSidewalkPaved(p.x, p.z) && !C.pointReserved(p.x, p.z, ['landmark', 'hood', 'water'], 1.5) && C.claimSpot(p.x, p.z, 2)) {
        busStop(C, p.x, p.z, nx, nz, r);
        const label = `${C.L.streetLabel(ns, n.z)} & ${ew.name}`;
        C.poi('bus', `MAT bus stop — ${label}`, p.x + nx * 1.4, p.z + nz * 1.4, nx, nz);
      }
    }
  }
  C.stats.payphones = payphones;

  // ---------------------------------------------------------------- downtown street trees
  if (!low) {
    for (const g of C.roadSegments) {
      if (g.stub) continue;
      const mid = g.axis === 'z' ? { x: g.street.x, z: (g.z0 + g.z1) / 2 } : { x: (g.x0 + g.x1) / 2, z: g.street.z };
      const d = districtOf(mid.x, mid.z);
      if (d !== 'downtown' && d !== 'oldmarket' && !(d === 'midtown' && g.street.major)) continue;
      const len = g.axis === 'z' ? g.z1 - g.z0 : g.x1 - g.x0;
      for (let t = 9; t < len - 9; t += 16) {
        for (const side of [1, -1]) {
          if (r() < 0.35) continue;
          const off = g.street.width / 2 + 1.1;
          const x = g.axis === 'z' ? g.street.x + side * off : g.x0 + t;
          const z = g.axis === 'z' ? g.z0 + t : g.street.z + side * off;
          if (C.pointReserved(x, z, ['landmark', 'hood', 'water', 'park'], 1.2) || !C.claimSpot(x, z, 2.5)) continue;
          C.B.at(x, z);
          const grate = C.s('dirt', '#8a8070');
          C.ground('surface', x - 0.7, z - 0.7, x + 0.7, z + 0.7, Y.walk + 0.005, grate);
          tree(C, x, z, pick(r, ['young', 'maple', 'young']), 0.8 + r() * 0.3, r);
        }
      }
    }
  }

  buildBillboards(C, r);
}

// ------------------------------------------------------------------ pieces
function utilityPole(C, x, z, axis, r) {
  const B = C.B;
  B.at(x, z);
  const wood = C.f('planks', '#6a5646', 0, 0, [1.2, 3]);
  B.cylinder('detail', x, z, 0, 10.5, 0.15, 0.12, C.detail === 0 ? 4 : 6, wood, true);
  // crossarm perpendicular to the street run... conductors run along the street, so the arm
  // spans across it (x for NS streets, z for EW streets)
  const ax = axis === 'z' ? 1.25 : 0.06;
  const az = axis === 'z' ? 0.06 : 1.25;
  B.box('detail', x - ax, 9.6, z - az, x + ax, 9.75, z + az, { all: wood });
  if (C.detail > 0) {
    const ins = C.f('white', '#b8c8c0');
    for (const k of [-1.0, 0, 1.0]) {
      const ix = axis === 'z' ? x + k : x;
      const iz = axis === 'z' ? z : z + k;
      B.box('detail', ix - 0.05, 9.75, iz - 0.05, ix + 0.05, 9.95, iz + 0.05, { all: ins, ny: false });
    }
    if (r() < 0.22) B.cylinder('detail', x + (axis === 'z' ? 0 : 0.35), z + (axis === 'z' ? 0.35 : 0), 7.9, 9.0, 0.32, 0.32, 6, C.f('metalPlain', '#8a9090'), true);
  }
  C.box(x - 0.18, z - 0.18, x + 0.18, z + 0.18, 10.5, 0, 'prop');
}

/** Cobra-head streetlight; l: { x, z, axis, side, pole: 'wood'|'steel', street } */
function streetLight(C, l, r) {
  const B = C.B;
  const { x, z } = l;
  B.at(x, z);
  const h = l.pole === 'wood' ? 8.2 : l.street.major ? 9 : 8;
  // arm points toward the street centre
  const dx = l.axis === 'z' ? -l.side : 0;
  const dz = l.axis === 'z' ? 0 : -l.side;
  const armLen = l.pole === 'wood' ? 1.8 : 2.4;
  const steel = C.f('metalPlain', '#9ea3a6');
  if (l.pole === 'steel') {
    B.cylinder('detail', x, z, 0, h, 0.13, 0.08, C.detail === 0 ? 4 : 6, steel, false);
    C.box(x - 0.15, z - 0.15, x + 0.15, z + 0.15, h, 0, 'prop');
  }
  const hx = x + dx * armLen;
  const hz = z + dz * armLen;
  // arm: slight upward curve approximated by two boxes
  const t = 0.05;
  const mx = x + dx * armLen * 0.5;
  const mz = z + dz * armLen * 0.5;
  B.box('detail', Math.min(x, mx) - t, h - 0.05, Math.min(z, mz) - t, Math.max(x, mx) + t, h + 0.05, Math.max(z, mz) + t, { all: steel, ny: false });
  B.box('detail', Math.min(mx, hx) - t, h + 0.05, Math.min(mz, hz) - t, Math.max(mx, hx) + t, h + 0.15, Math.max(mz, hz) + t, { all: steel, ny: false });
  // head: flattened box, lens underneath (sodium)
  const hl = 0.5;
  const hwid = 0.22;
  const ex = Math.abs(dx) > 0 ? hl : hwid;
  const ez = Math.abs(dz) > 0 ? hl : hwid;
  const cx = hx + dx * 0.3;
  const cz = hz + dz * 0.3;
  B.box('detail', cx - ex, h - 0.05, cz - ez, cx + ex, h + 0.2, cz + ez, { all: C.f('metalPlain', '#b8bcbe'), ny: false });
  const lamp = C.cells.get('lamp:sodium');
  if (lamp) {
    B.color = rgb('#ffffff');
    // downward-facing lens
    B.quadUV('signs', cx - ex * 0.85, h - 0.06, cz - ez * 0.85, cx + ex * 0.85, h - 0.06, cz - ez * 0.85, cx + ex * 0.85, h - 0.06, cz + ez * 0.85, cx - ex * 0.85, h - 0.06, cz + ez * 0.85, lamp[0], lamp[1], lamp[2], lamp[1], lamp[2], lamp[3], lamp[0], lamp[3]);
  }
  C.pool(cx + dx * 0.8, cz + dz * 0.8, 9.5, '#ffa048', 1);
}

function streetNameSign(C, x, z, nsLabel, ewLabel, signal) {
  const B = C.B;
  B.at(x, z);
  const steel = C.f('metalPlain', '#9aa0a2');
  B.cylinder('detail', x, z, 0, 3.3, 0.05, 0.05, 5, steel, false);
  C.box(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 3.3, 0, 'prop');
  const w = 1.5;
  const h = 0.24;
  // NS street blade: long axis along z, faces +x and -x
  bladeQuad(C, `street:${nsLabel}`, x, 3.0, z, 1, 0, w, h);
  bladeQuad(C, `street:${nsLabel}`, x, 3.0, z, -1, 0, w, h);
  // EW street blade: along x, faces ±z
  bladeQuad(C, `street:${ewLabel}`, x, 3.28, z, 0, 1, w, h);
  bladeQuad(C, `street:${ewLabel}`, x, 3.28, z, 0, -1, w, h);
  void signal;
}

function bladeQuad(C, cell, x, y, z, nx, nz, w, h) {
  const c = C.cells.get(cell);
  if (!c) return;
  const px = nz;
  const pz = -nx;
  const o = 0.012;
  const B = C.B;
  B.color = rgb('#ffffff');
  B.quadUV('signs', x - px * w / 2 + nx * o, y - h / 2, z - pz * w / 2 + nz * o, x + px * w / 2 + nx * o, y - h / 2, z + pz * w / 2 + nz * o, x + px * w / 2 + nx * o, y + h / 2, z + pz * w / 2 + nz * o, x - px * w / 2 + nx * o, y + h / 2, z - pz * w / 2 + nz * o, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
}

/** Octagonal stop sign on a post, facing (nx, nz). */
function stopSign(C, x, z, nx, nz) {
  if (C.pointReserved(x, z, ['landmark', 'hood', 'water'], 0.3)) return;
  const B = C.B;
  B.at(x, z);
  B.cylinder('detail', x, z, 0, 2.2, 0.035, 0.035, 4, C.f('metalPlain', '#9aa0a2'), false);
  C.box(x - 0.06, z - 0.06, x + 0.06, z + 0.06, 2.2, 0, 'prop');
  const c = C.cells.get('stop');
  if (!c) return;
  const cy = 2.45;
  const R = 0.38;
  const px = nz;
  const pz = -nx;
  const cu = (c[0] + c[2]) / 2;
  const cv = (c[1] + c[3]) / 2;
  const ru = (c[2] - c[0]) / 2;
  const rv = (c[3] - c[1]) / 2;
  B.color = rgb('#ffffff');
  const o = 0.03;
  const back = C.f('metalPlain', '#8a9092');
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const x0 = x + px * Math.cos(a0) * R + nx * o;
    const z0 = z + pz * Math.cos(a0) * R + nz * o;
    const x1 = x + px * Math.cos(a1) * R + nx * o;
    const z1 = z + pz * Math.cos(a1) * R + nz * o;
    B.color = rgb('#ffffff');
    // front (ccw seen from the front: viewer's right is +p)
    signsTri(C, x + nx * o, cy, z + nz * o, x0, cy + Math.sin(a0) * R, z0, x1, cy + Math.sin(a1) * R, z1, cu, cv, cu + Math.cos(a0) * ru, cv + Math.sin(a0) * rv, cu + Math.cos(a1) * ru, cv + Math.sin(a1) * rv);
    // back (grey)
    B.tile = back.tile;
    B.color = back.color;
    B.tri('detail', x - nx * o, cy, z - nz * o, x1 - nx * o * 2, cy + Math.sin(a1) * R, z1 - nz * o * 2, x0 - nx * o * 2, cy + Math.sin(a0) * R, z0 - nz * o * 2);
  }
}

function signsTri(C, ax, ay, az, bx, by, bz, cx, cy, cz, ua, va, ub, vb, uc, vc) {
  C.B.tri('signs', ax, ay, az, bx, by, bz, cx, cy, cz, ua, va, ub, vb, uc, vc);
}

function hydrant(C, x, z) {
  const B = C.B;
  B.at(x, z);
  const red = C.f('metalPlain', '#c8281e');
  B.cylinder('detail', x, z, Y.walk, 0.7, 0.14, 0.13, 6, red, false);
  B.cylinder('detail', x, z, 0.7, 0.85, 0.13, 0.05, 6, C.f('metalPlain', '#d8d8d0'), true);
  B.box('detail', x - 0.22, 0.45, z - 0.05, x + 0.22, 0.55, z + 0.05, { all: red, ny: false });
  C.box(x - 0.16, z - 0.16, x + 0.16, z + 0.16, 0.85, 0, 'prop');
}

/** Freestanding pedestal payphone + POI. */
function pedestalPhone(C, x, z, nx, nz, label) {
  const B = C.B;
  B.at(x, z);
  const F = new Frame(x, z, nx, nz);
  const steel = C.f('metalPlain', '#8e969a');
  lbox(C, 'detail', F, -0.06, 0.06, -0.06, 0.06, 0, 1.0, steel, null);
  lbox(C, 'detail', F, -0.32, 0.32, -0.22, 0.12, 1.0, 1.95, C.f('metalPlain', '#a8b0b4'), steel);
  const fs = faces(-0.32, 0.32, -0.22, 0.12);
  const c = C.cells.get('payphone');
  const cd = C.cells.get('dark');
  B.color = rgb('#ffffff');
  if (cd) {
    const a = { x: F.x(0.2, -0.24), z: F.z(0.2, -0.24) };
    const b = { x: F.x(-0.2, -0.24), z: F.z(-0.2, -0.24) };
    B.quadUV('signs', a.x, 1.15, a.z, b.x, 1.15, b.z, b.x, 1.75, b.z, a.x, 1.75, a.z, cd[0], cd[1], cd[2], cd[1], cd[2], cd[3], cd[0], cd[3]);
  }
  if (c) {
    const a = { x: F.x(0.32, -0.25), z: F.z(0.32, -0.25) };
    const b = { x: F.x(-0.32, -0.25), z: F.z(-0.32, -0.25) };
    B.quadUV('signs', a.x, 1.97, a.z, b.x, 1.97, b.z, b.x, 2.2, b.z, a.x, 2.2, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }
  void fs;
  C.box(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.95, 0, 'prop');
  // POI on the street side facing the phone
  C.poi('payphone', `US WEST Payphone — ${label}`, x + nx * 1.0, z + nz * 1.0, nx, nz);
}

function newsBox(C, x, z, sx, sz, alt = false) {
  const B = C.B;
  B.at(x, z);
  // box faces the street: normal toward the curb (-sx for NS corner offsets)
  const nx = sx ? sx : 0;
  const nz = sz ? sz : sx ? 0 : 1;
  const F = new Frame(x, z, nx, nz);
  const col = alt ? C.f('metalPlain', '#c8281e') : C.f('metalPlain', '#e0d43a');
  lbox(C, 'detail', F, -0.25, 0.25, -0.22, 0.22, 0.3, 1.15, col, col);
  lbox(C, 'detail', F, -0.2, 0.2, -0.18, 0.18, Y.walk, 0.3, C.f('dark', '#ffffff'), null);
  if (!alt) {
    const c = C.cells.get('newsbox');
    if (c) {
      const a = { x: F.x(0.25, -0.235), z: F.z(0.25, -0.235) };
      const b = { x: F.x(-0.25, -0.235), z: F.z(-0.25, -0.235) };
      B.color = rgb('#ffffff');
      B.quadUV('signs', a.x, 0.32, a.z, b.x, 0.32, b.z, b.x, 1.12, b.z, a.x, 1.12, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    }
  }
  C.box(x - 0.28, z - 0.28, x + 0.28, z + 0.28, 1.15, 0, 'prop');
}

function trashCan(C, x, z) {
  const B = C.B;
  B.at(x, z);
  const g = C.f('metalPlain', '#2e5a3a');
  B.cylinder('detail', x, z, Y.walk, 0.95, 0.3, 0.32, 8, g, true);
  B.cylinder('detail', x, z, 0.95, 1.02, 0.34, 0.3, 8, C.f('dark', '#ffffff'), true);
  C.box(x - 0.32, z - 0.32, x + 0.32, z + 0.32, 1.0, 0, 'prop');
}

function mailbox(C, x, z, nx, nz) {
  const B = C.B;
  B.at(x, z);
  const F = new Frame(x, z, nx, nz || 0);
  const blue = C.f('metalPlain', '#1f3f8a');
  lbox(C, 'detail', F, -0.28, 0.28, -0.25, 0.25, 0.25, 1.05, blue, blue);
  // rounded top
  B.tile = blue.tile;
  B.color = blue.color;
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI;
    const a1 = ((i + 1) / 4) * Math.PI;
    const p = (a, v) => [F.x(Math.cos(a) * 0.28, v), 1.05 + Math.sin(a) * 0.18, F.z(Math.cos(a) * 0.28, v)];
    const q0 = p(a0, -0.25);
    const q1 = p(a1, -0.25);
    const q2 = p(a1, 0.25);
    const q3 = p(a0, 0.25);
    B.quad('detail', q3[0], q3[1], q3[2], q2[0], q2[1], q2[2], q1[0], q1[1], q1[2], q0[0], q0[1], q0[2]);
  }
  for (const [u0, u1] of [[-0.26, -0.2], [0.2, 0.26]]) lbox(C, 'detail', F, u0, u1, -0.2, 0.2, Y.walk, 0.25, C.f('dark', '#ffffff'), null);
  const c = C.cells.get('mail');
  if (c) {
    const a = { x: F.x(0.22, -0.265), z: F.z(0.22, -0.265) };
    const b = { x: F.x(-0.22, -0.265), z: F.z(-0.22, -0.265) };
    B.color = rgb('#ffffff');
    B.quadUV('signs', a.x, 0.72, a.z, b.x, 0.72, b.z, b.x, 0.94, b.z, a.x, 0.94, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }
  C.box(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.2, 0, 'prop');
}

function busStop(C, x, z, nx, nz, r) {
  const B = C.B;
  B.at(x, z);
  // bench faces the street (normal n points to the street); built in a frame whose front is n
  const F = new Frame(x, z, nx, nz);
  const wood = C.f('planks', '#8a6a4a', 0, 0, [1.2, 1.2]);
  const steel = C.f('metalPlain', '#6a7074');
  // seat + back
  lbox(C, 'detail', F, -1.0, 1.0, -0.25, 0.2, 0.42, 0.5, wood, wood);
  lbox(C, 'detail', F, -1.0, 1.0, 0.2, 0.3, 0.5, 1.05, C.f('white', '#f0f0ea'), wood);
  for (const u of [-0.9, 0.9]) lbox(C, 'detail', F, u - 0.05, u + 0.05, -0.2, 0.25, Y.walk, 0.42, steel, null);
  const ad = C.cells.get(`bench:${Math.floor(r() * 8)}`);
  if (ad) {
    const fs = faces(-1.0, 1.0, 0.2, 0.3);
    const p0 = fs.front;
    const a = { x: F.x(p0.ou + p0.du * 0.05 + p0.nu * 0.012, p0.ov + p0.nv * 0.012), z: F.z(p0.ou + p0.du * 0.05 + p0.nu * 0.012, p0.ov + p0.nv * 0.012) };
    const b = { x: F.x(p0.ou + p0.du * 1.95 + p0.nu * 0.012, p0.ov + p0.nv * 0.012), z: F.z(p0.ou + p0.du * 1.95 + p0.nu * 0.012, p0.ov + p0.nv * 0.012) };
    B.color = rgb('#ffffff');
    B.quadUV('signs', a.x, 0.52, a.z, b.x, 0.52, b.z, b.x, 1.03, b.z, a.x, 1.03, a.z, ad[0], ad[1], ad[2], ad[1], ad[2], ad[3], ad[0], ad[3]);
    // back side too (faces the building side)
    const bk = fs.back;
    const c0 = { x: F.x(bk.ou + bk.du * 0.05 + bk.nu * 0.012, bk.ov + bk.nv * 0.012), z: F.z(bk.ou + bk.du * 0.05 + bk.nu * 0.012, bk.ov + bk.nv * 0.012) };
    const c1 = { x: F.x(bk.ou + bk.du * 1.95 + bk.nu * 0.012, bk.ov + bk.nv * 0.012), z: F.z(bk.ou + bk.du * 1.95 + bk.nu * 0.012, bk.ov + bk.nv * 0.012) };
    B.quadUV('signs', c0.x, 0.52, c0.z, c1.x, 0.52, c1.z, c1.x, 1.03, c1.z, c0.x, 1.03, c0.z, ad[0], ad[1], ad[2], ad[1], ad[2], ad[3], ad[0], ad[3]);
  }
  const [x0, z0, x1, z1] = F.rect(-1.0, -0.25, 1.0, 0.3);
  C.box(x0, z0, x1, z1, 0.55, 0, 'prop');
  // bus stop sign post beside the bench
  const sx = F.x(1.6, -0.1);
  const sz = F.z(1.6, -0.1);
  B.cylinder('detail', sx, sz, 0, 2.6, 0.035, 0.035, 4, C.f('metalPlain', '#9aa0a2'), false);
  const c = C.cells.get('busstop');
  if (c) {
    B.color = rgb('#ffffff');
    const ux = -F.fz;
    const uz = F.fx;
    const w = 0.22;
    const o = 0.03;
    B.quadUV('signs', sx - ux * w + nx * o, 2.0, sz - uz * w + nz * o, sx + ux * w + nx * o, 2.0, sz + uz * w + nz * o, sx + ux * w + nx * o, 2.62, sz + uz * w + nz * o, sx - ux * w + nx * o, 2.62, sz - uz * w + nz * o, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
    B.quadUV('signs', sx + ux * w - nx * o, 2.0, sz + uz * w - nz * o, sx - ux * w - nx * o, 2.0, sz - uz * w - nz * o, sx - ux * w - nx * o, 2.62, sz - uz * w - nz * o, sx + ux * w - nx * o, 2.62, sz + uz * w - nz * o, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }
  C.box(sx - 0.05, sz - 0.05, sx + 0.05, sz + 0.05, 2.6, 0, 'prop');
}

// ------------------------------------------------------------------ billboards
function buildBillboards(C, r) {
  const sites = C.billboardSites || [];
  C.rng.shuffle(sites);
  const placed = [];
  const max = C.detail === 0 ? 10 : 16;
  let k = Math.floor(r() * BILLBOARDS.length);
  for (const s of sites) {
    if (placed.length >= max) break;
    if (placed.some((p) => (p.x - s.x) ** 2 + (p.z - s.z) ** 2 < 150 * 150)) continue;
    if (C.pointReserved(s.x, s.z, ['landmark', 'water', 'park', 'hood'], 6)) continue;
    billboard(C, s.x, s.z, s.nx, s.nz, BILLBOARDS[k % BILLBOARDS.length], s.y0 ?? 0, r);
    k++;
    placed.push(s);
  }
  C.stats.billboards = placed.length;
}

function billboard(C, x, z, nx, nz, bb, y0, r) {
  const B = C.B;
  B.at(x, z);
  const F = new Frame(x, z, nx, nz);
  const steel = C.f('metalPlain', '#7a7e80');
  const W = 10.5;
  const H = 3.8;
  const yb = y0 + 5.5;
  // two I-beam posts (or one monopole)
  const mono = r() < 0.4;
  if (mono) {
    B.cylinder('detail', x, z, y0, yb, 0.35, 0.3, 8, steel, false);
    C.box(x - 0.4, z - 0.4, x + 0.4, z + 0.4, yb, y0, 'prop');
  } else {
    for (const u of [-W * 0.3, W * 0.3]) {
      lbox(C, 'detail', F, u - 0.18, u + 0.18, 0.1, 0.4, y0, yb, steel, null);
      const [a, b, c, d] = F.rect(u - 0.2, 0.1, u + 0.2, 0.4);
      C.box(a, b, c, d, yb, y0, 'prop');
    }
  }
  // board frame
  lbox(C, 'detail', F, -W / 2 - 0.15, W / 2 + 0.15, 0, 0.35, yb, yb + H + 0.3, C.f('white', '#e8e4d8'), steel);
  const c = C.cells.get(`bb:${bb.id}`);
  const fs = faces(-W / 2 - 0.15, W / 2 + 0.15, 0, 0.35);
  if (c) {
    const f = fs.front;
    const a = { x: F.x(f.ou + f.du * 0.15 + f.nu * 0.02, f.ov + f.nv * 0.02), z: F.z(f.ou + f.du * 0.15 + f.nu * 0.02, f.ov + f.nv * 0.02) };
    const b = { x: F.x(f.ou + f.du * (f.len - 0.15) + f.nu * 0.02, f.ov + f.nv * 0.02), z: F.z(f.ou + f.du * (f.len - 0.15) + f.nu * 0.02, f.ov + f.nv * 0.02) };
    B.color = rgb('#ffffff');
    B.quadUV('signs', a.x, yb + 0.15, a.z, b.x, yb + 0.15, b.z, b.x, yb + H + 0.15, b.z, a.x, yb + H + 0.15, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }
  // catwalk + flood lights
  lbox(C, 'detail', F, -W / 2, W / 2, -1.0, 0, yb - 0.1, yb, C.f('grille', '#ffffff'), C.f('grille', '#ffffff'));
  const lamp = C.cells.get('lamp:fluor');
  for (let i = 0; i < 3; i++) {
    const u = -W / 3 + (i * W) / 3;
    lbox(C, 'detail', F, u - 0.12, u + 0.12, -1.0, -0.8, yb, yb + 0.4, steel, steel);
    if (lamp) {
      const px = F.x(u, -0.79);
      const pz = F.z(u, -0.79);
      const qx = F.ux * 0.1;
      const qz = F.uz * 0.1;
      B.color = rgb('#ffffff');
      B.quadUV('signs', px - qx + nx * 0.0, yb + 0.1, pz - qz, px + qx, yb + 0.1, pz + qz, px + qx, yb + 0.35, pz + qz, px - qx, yb + 0.35, pz - qz, lamp[0], lamp[1], lamp[2], lamp[1], lamp[2], lamp[3], lamp[0], lamp[3]);
    }
  }
}

void shade;
void FT;
