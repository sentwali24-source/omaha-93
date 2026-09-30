import { Frame, rgb } from './batch.js';
import { lbox, faces } from './kit.js';
import { SETS } from '../../data/sets.js';
import { NAMED_POIS } from '../../data/map.js';
import { BUSINESSES } from './names.js';

// Final passes over the generated city: set hood POIs, NAMED_POIS, guarantees from
// ARCHITECTURE.md §9 (payphones, stores per zone, clothes, garages, tag spots per zone, parking).

/** Prepare NAMED_POIS lookups before blocks are built (lets a strip lot host Time Out Foods). */
export function prepareNamed(C) {
  C.named = NAMED_POIS.map((n) => ({ ...n, biz: BUSINESSES.named.find((b) => b.name === n.name) || null, done: false }));
  C.namedAt = (lot) => {
    for (const n of C.named) {
      if (n.done || !n.biz) continue;
      const [x0, z0, x1, z1] = lot.rect;
      if (n.near.x >= x0 - 4 && n.near.x <= x1 + 4 && n.near.z >= z0 && n.near.z <= z1) return n;
    }
    return null;
  };
}

export function finishCity(C) {
  const { L } = C;
  const r = C.rng.next;
  const city = C.city;

  // ---- hoods: exactly one per set at SETS[].hood
  for (const s of SETS) {
    const id = `hood-${s.id}`;
    if (city.pois.some((p) => p.id === id)) continue;
    const street = L.describe(s.hood.x, s.hood.z).street;
    city.pois.push({
      id,
      type: 'hood',
      name: `${s.name} hood${street ? ` — ${street}` : ''}`,
      x: s.hood.x,
      z: s.hood.z,
      heading: s.hood.heading || 0,
      zoneId: C.zoneId(s.hood.x, s.hood.z),
      district: C.districtId(s.hood.x, s.hood.z),
      setId: s.id,
    });
  }

  // ---- named real places that were not built as storefronts: POI on the nearest sidewalk
  for (const n of C.named || []) {
    if (n.done) continue;
    const sp = nearestSidewalk(C, n.near.x, n.near.z);
    city.pois.push({ id: `named-${slug(n.name)}`, type: n.type, name: n.name, x: sp.x, z: sp.z, heading: sp.heading, zoneId: C.zoneId(sp.x, sp.z), district: C.districtId(sp.x, sp.z) });
  }

  // ---- ≥ 25 payphones: add pedestal phones at busy corners if short
  const count = (t) => city.pois.filter((p) => p.type === t).length;
  let guard = 0;
  while (count('payphone') < 28 && guard++ < 200) {
    const n = L.nodes[Math.floor(r() * L.nodes.length)];
    const d = C.districtId(n.x, n.z);
    if (d === 'riverfront' || d === 'eastomaha') continue;
    const ns = C.nsById.get(n.ns);
    const ew = C.ewById.get(n.ew);
    const sx = r() < 0.5 ? 1 : -1;
    const sz = r() < 0.5 ? 1 : -1;
    const x = n.x + sx * (ns.width / 2 + 3.05);
    const z = n.z + sz * (ew.width / 2 + 5.5);
    if (!C.isSidewalkPaved(x, z) || C.pointReserved(x, z, ['landmark', 'hood', 'water'], 0.8) || !C.claimSpot(x, z, 1)) continue;
    C.B.at(x, z);
    pedestal(C, x, z, -sx, 0, `${L.streetLabel(ns, n.z)} & ${ew.name}`);
  }

  // ---- tag spots: every turf zone ≥ 8 (freestanding walls along sidewalks if short)
  for (const zone of L.zones) {
    let have = city.tagSpots.filter((t) => t.zoneId === zone.id).length;
    let tries = 0;
    while (have < 8 && tries++ < 400) {
      const e = L.edges[Math.floor(r() * L.edges.length)];
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      const t = 0.3 + r() * 0.4;
      const cx = a.x + (b.x - a.x) * t;
      const cz = a.z + (b.z - a.z) * t;
      if (C.zoneId(cx, cz) !== zone.id) continue;
      const side = r() < 0.5 ? 1 : -1;
      const off = e.width / 2 + 3.5 + 0.8; // just inside the block edge, facing the sidewalk
      const x = e.axis === 'z' ? cx + side * off : cx;
      const z = e.axis === 'z' ? cz : cz + side * off;
      if (C.pointReserved(x, z, ['landmark', 'hood', 'water', 'park', 'freeway'], 3) || !C.claimSpot(x, z, 3)) continue;
      if (C.col.query(x - 2.5, z - 1.2, x + 2.5, z + 1.2).length) continue;
      const nx = e.axis === 'z' ? -side : 0;
      const nz = e.axis === 'z' ? 0 : -side;
      tagWall(C, x, z, nx, nz);
      have++;
    }
  }

  // ---- curbside parking along minor streets
  const spots = city.parkingSpots;
  for (const g of C.roadSegments) {
    const s = g.street;
    const lanes = s.lanes || (s.width >= 15 ? 2 : 1);
    if (lanes > 1 || s.width < 10.5) continue;
    const len = g.axis === 'z' ? g.z1 - g.z0 : g.x1 - g.x0;
    const d = C.districtId(g.axis === 'z' ? s.x : (g.x0 + g.x1) / 2, g.axis === 'z' ? (g.z0 + g.z1) / 2 : s.z);
    if (d === 'riverfront') continue;
    const off = s.width / 2 - 1.15;
    for (let t = 12; t < len - 12; t += 6.8) {
      for (const side of [1, -1]) {
        if (r() > 0.32) continue;
        const x = g.axis === 'z' ? s.x + side * off : g.x0 + t;
        const z = g.axis === 'z' ? g.z0 + t : s.z + side * off;
        if (C.pointReserved(x, z, ['hood', 'water', 'landmark'], 2)) continue;
        if (C.spotTaken(x, z, 3)) continue;
        // right-hand traffic: east side faces north (0), west side south (π); north side of an
        // EW street faces west (π/2), south side east (−π/2)
        const heading = g.axis === 'z' ? (side > 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2;
        spots.push({ x: +x.toFixed(2), z: +z.toFixed(2), heading, curb: true });
      }
    }
  }
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Nearest sidewalk-centre point to (x, z) with a heading facing away from the street. */
function nearestSidewalk(C, x, z) {
  const { L } = C;
  let best = null;
  for (const s of L.nsStreets) {
    for (const side of [-1, 1]) {
      const sx = s.x + side * (s.width / 2 + 1.75);
      const d = Math.abs(sx - x);
      if (!best || d < best.d) best = { d, x: sx, z, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
    }
  }
  for (const s of L.ewStreets) {
    for (const side of [-1, 1]) {
      const sz = s.z + side * (s.width / 2 + 1.75);
      const d = Math.abs(sz - z);
      if (d < best.d) best = { d, x, z: sz, heading: side > 0 ? Math.PI : 0 };
    }
  }
  return best;
}

function pedestal(C, x, z, nx, nz, label) {
  const B = C.B;
  const F = new Frame(x, z, nx, nz);
  const steel = C.f('metalPlain', '#8e969a');
  lbox(C, 'facade', F, -0.06, 0.06, -0.06, 0.06, 0, 1.0, steel, null);
  lbox(C, 'facade', F, -0.32, 0.32, -0.22, 0.12, 1.0, 1.95, C.f('metalPlain', '#a8b0b4'), steel);
  const c = C.cells.get('payphone');
  if (c) {
    const a = { x: F.x(0.32, -0.25), z: F.z(0.32, -0.25) };
    const b = { x: F.x(-0.32, -0.25), z: F.z(-0.32, -0.25) };
    B.color = rgb('#ffffff');
    B.quadUV('signs', a.x, 1.97, a.z, b.x, 1.97, b.z, b.x, 2.2, b.z, a.x, 2.2, a.z, c[0], c[1], c[2], c[1], c[2], c[3], c[0], c[3]);
  }
  C.box(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.95, 0, 'prop');
  C.poi('payphone', `US WEST Payphone — ${label}`, x + nx, z + nz, nx, nz);
}

/** Freestanding cinder-block wall (utility enclosure) with a tag spot facing the sidewalk. */
function tagWall(C, x, z, nx, nz) {
  const B = C.B;
  B.at(x, z);
  const F = new Frame(x, z, nx, nz);
  const st = C.f('block', ['#d8d4c8', '#c8ccc8', '#e0d8c8'][Math.floor(C.rng.next() * 3)]);
  lbox(C, 'facade', F, -2.6, 2.6, 0, 0.35, 0, 2.3, st, C.f('concrete', '#c8c4bc'));
  const [x0, z0, x1, z1] = F.rect(-2.6, 0, 2.6, 0.35);
  C.box(x0, z0, x1, z1, 2.3, 0, 'building');
  const fs = faces(-2.6, 2.6, 0, 0.35);
  const f = fs.front;
  const px = F.x(f.ou + f.du * 2.6, f.ov);
  const pz = F.z(f.ou + f.du * 2.6, f.ov);
  C.tagSpot(px, 1.35, pz, nx, nz, 3.2, 1.4);
}
