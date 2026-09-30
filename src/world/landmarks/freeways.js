import * as THREE from 'three';
import { FREEWAYS } from '../../data/map.js';
import { C, shade, box, cylinder, beam, hitsRoad, rotPt } from './kit.js';
import { sign, carGeometry } from './props.js';
import { IY } from './iowa.js';

// Elevated freeways (decorative, not drivable): the North Freeway (US-75) deck on pillars from
// Fort St south to Cass St, turning into the I-480 leg along the north edge of downtown, which
// swings south-east over the riverfront onto the low 8-lane I-480 plate-girder bridge to Council
// Bluffs. Pillar colliders only. Green 1990s guide signs, cobra-head lights, and a few cheap
// instanced cars cruising the decks (both directions, right-hand traffic).

const DECK_T = 1.4; // slab thickness
const PARAPET = 0.9;

/** Centerline built from lines and arcs, measured by arc length s. */
class Path {
  constructor() {
    this.segs = [];
    this.len = 0;
  }

  line(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az);
    this.segs.push({ arc: false, ax, az, bx, bz, s0: this.len, L });
    this.len += L;
    return this;
  }

  /** Arc around (cx, cz) from angle a0 to a1; point = (cx + r cos a, cz + r sin a). */
  arc(cx, cz, r, a0, a1) {
    const L = Math.abs(a1 - a0) * r;
    this.segs.push({ arc: true, cx, cz, r, a0, a1, s0: this.len, L });
    this.len += L;
    return this;
  }

  /** Position + unit direction at s, written into out { x, z, dx, dz }. */
  at(s, out) {
    const segs = this.segs;
    let g = segs[segs.length - 1];
    for (let i = 0; i < segs.length; i++) {
      if (s <= segs[i].s0 + segs[i].L) {
        g = segs[i];
        break;
      }
    }
    const t = Math.min(1, Math.max(0, (s - g.s0) / g.L));
    if (!g.arc) {
      out.x = g.ax + (g.bx - g.ax) * t;
      out.z = g.az + (g.bz - g.az) * t;
      out.dx = (g.bx - g.ax) / g.L;
      out.dz = (g.bz - g.az) / g.L;
    } else {
      const a = g.a0 + (g.a1 - g.a0) * t;
      const sg = Math.sign(g.a1 - g.a0);
      out.x = g.cx + Math.cos(a) * g.r;
      out.z = g.cz + Math.sin(a) * g.r;
      out.dx = -Math.sin(a) * sg;
      out.dz = Math.cos(a) * sg;
    }
    return out;
  }
}

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

export function buildFreeways(ctx) {
  const nf = FREEWAYS.find((f) => f.id === 'northfreeway');
  const i480 = FREEWAYS.find((f) => f.id === 'i480');
  const br = FREEWAYS.find((f) => f.id === 'i480-bridge');
  const nx = (nf.corridor.x0 + nf.corridor.x1) / 2;
  const iz = (i480.corridor.z0 + i480.corridor.z1) / 2;
  const bz = (br.corridor.z0 + br.corridor.z1) / 2;
  const R1 = (nf.corridor.x1 - nf.corridor.x0) / 2;
  const R2 = 40;
  const xs = 580; // the riverfront swing runs down x = 580, between 10th St and ASARCO
  // the North Freeway comes down to grade at the north end of its corridor (the city builds
  // houses north of it, up to Fort St)
  const footZ = nf.corridor.z0 + 1;
  const path = new Path()
    .line(nx, footZ, nx, iz - R1)
    .arc(nx + R1, iz - R1, R1, Math.PI, Math.PI / 2)
    .line(nx + R1, iz, xs - R2, iz)
    .arc(xs - R2, iz + R2, R2, -Math.PI / 2, 0)
    .line(xs, iz + R2, xs, bz - R2)
    .arc(xs + R2, bz - R2, R2, Math.PI, Math.PI / 2)
    .line(xs + R2, bz, 1400, bz);
  // key stations along the path
  const S = path.segs;
  const sJunction = S[1].s0;
  const sSwing = S[3].s0;
  const sWiden = S[5].s0;
  const sBridge = S[6].s0;
  const sRiver0 = sBridge + (700 - (xs + R2));
  const sRiver1 = sBridge + (1000 - (xs + R2));
  const sGround = sBridge + (1120 - (xs + R2));
  // the ramp (solid fill) must end before the first cross street's sidewalk
  const cross = ctx.layout.ewStreets
    .map((e) => e.z - e.width / 2 - ctx.layout.SIDEWALK)
    .filter((z) => z > footZ + 20)
    .sort((a, b) => a - b)[0];
  const RAMP = Math.min(64, (cross ?? footZ + 80) - footZ - 4);
  const yAt = (s) => {
    if (s < RAMP) return 0.25 + (nf.deckY - 0.25) * smooth(s / RAMP);
    if (s < sJunction - 50) return nf.deckY;
    if (s < sSwing) return nf.deckY + (i480.deckY - nf.deckY) * smooth((s - (sJunction - 50)) / 50);
    if (s < sBridge) return i480.deckY + (br.deckY - i480.deckY) * smooth((s - sSwing) / (sBridge - sSwing));
    if (s < sRiver1) return br.deckY;
    if (s < sGround) return br.deckY + (IY + 0.25 - br.deckY) * smooth((s - sRiver1) / (sGround - sRiver1));
    return IY + 0.25;
  };
  const wAt = (s) => (s < sWiden ? 18 : s > sBridge ? 26 : 18 + 8 * smooth((s - sWiden) / (sBridge - sWiden)));
  const F = { path, yAt, wAt, RAMP, sRiver0, sRiver1, sGround, sBridge };
  ctx.freeway = F;
  deck(ctx, F);
  pillars(ctx, F);
  gantries(ctx, F, { sJunction });
  traffic(ctx, F);
}

// ------------------------------------------------------------------ deck
function deck(ctx, F) {
  const { path, yAt, wAt } = F;
  const step = ctx.detail === 0 ? 10 : 6;
  const chunkLen = 320;
  const concrete = C('#b1ada4');
  const under = C('#8c8983');
  const barrier = C('#c9c5bb');
  const girder = C('#56645c');
  const row = ctx.T.rows.highway;
  const tile = 12;
  const p0 = { x: 0, z: 0, dx: 0, dz: 0 };
  const p1 = { x: 0, z: 0, dx: 0, dz: 0 };
  let P = null;
  let chunkStart = -1e9;
  const n = Math.ceil(path.len / step);
  for (let i = 0; i < n; i++) {
    const sa = (path.len * i) / n;
    const sb = (path.len * (i + 1)) / n;
    if (sa - chunkStart >= chunkLen) {
      if (P) P.flush();
      P = ctx.cluster(`freeway-${Math.round(sa)}`);
      chunkStart = sa;
    }
    path.at(sa, p0);
    path.at(sb, p1);
    const ya = yAt(sa);
    const yb = yAt(sb);
    const wa = wAt(sa) / 2;
    const wb = wAt(sb) / 2;
    // right vectors (right of travel = (-dz, dx))
    const rax = -p0.dz;
    const raz = p0.dx;
    const rbx = -p1.dz;
    const rbz = p1.dx;
    const E = (p, rx, rz, o) => [p.x + rx * o, p.z + rz * o];
    const RA = E(p0, rax, raz, wa);
    const RB = E(p1, rbx, rbz, wb);
    const LA = E(p0, rax, raz, -wa);
    const LB = E(p1, rbx, rbz, -wb);
    const g = P.get('ground');
    // road surface: v runs across (right edge = v0), u along s
    g.quad(RA[0], ya + 0.02, RA[1], RB[0], yb + 0.02, RB[1], LB[0], yb + 0.02, LB[1], LA[0], ya + 0.02, LA[1], C('#ffffff'), sa / tile, row.v0, sb / tile, row.v1);
    if (sa > F.sGround + 5) continue; // surface road in Iowa: just the pavement
    const b = P.get('solid');
    const ramp = sb <= F.RAMP;
    const botA = ramp ? 0 : Math.max(0, ya - DECK_T);
    const botB = ramp ? 0 : Math.max(0, yb - DECK_T);
    // underside
    if (!ramp) b.quad(LA[0], botA, LA[1], LB[0], botB, LB[1], RB[0], botB, RB[1], RA[0], botA, RA[1], under);
    // outer fascia + parapet outer faces
    b.quad(RA[0], botA, RA[1], RB[0], botB, RB[1], RB[0], yb + PARAPET, RB[1], RA[0], ya + PARAPET, RA[1], concrete);
    b.quad(LB[0], botB, LB[1], LA[0], botA, LA[1], LA[0], ya + PARAPET, LA[1], LB[0], yb + PARAPET, LB[1], concrete);
    // parapet inner faces + tops
    const t = 0.45;
    const RiA = E(p0, rax, raz, wa - t);
    const RiB = E(p1, rbx, rbz, wb - t);
    const LiA = E(p0, rax, raz, -wa + t);
    const LiB = E(p1, rbx, rbz, -wb + t);
    b.quad(RiB[0], yb, RiB[1], RiA[0], ya, RiA[1], RiA[0], ya + PARAPET, RiA[1], RiB[0], yb + PARAPET, RiB[1], barrier);
    b.quad(RA[0], ya + PARAPET, RA[1], RB[0], yb + PARAPET, RB[1], RiB[0], yb + PARAPET, RiB[1], RiA[0], ya + PARAPET, RiA[1], barrier);
    b.quad(LiA[0], ya, LiA[1], LiB[0], yb, LiB[1], LiB[0], yb + PARAPET, LiB[1], LiA[0], ya + PARAPET, LiA[1], barrier);
    b.quad(LiA[0], ya + PARAPET, LiA[1], LiB[0], yb + PARAPET, LiB[1], LB[0], yb + PARAPET, LB[1], LA[0], ya + PARAPET, LA[1], barrier);
    // median barrier on the divided freeway
    if (sb < F.sBridge + 400) {
      const m = 0.3;
      const h = 0.8;
      const MRa = E(p0, rax, raz, m);
      const MRb = E(p1, rbx, rbz, m);
      const MLa = E(p0, rax, raz, -m);
      const MLb = E(p1, rbx, rbz, -m);
      b.quad(MRa[0], ya, MRa[1], MRb[0], yb, MRb[1], MRb[0], yb + h, MRb[1], MRa[0], ya + h, MRa[1], barrier);
      b.quad(MLb[0], yb, MLb[1], MLa[0], ya, MLa[1], MLa[0], ya + h, MLa[1], MLb[0], yb + h, MLb[1], barrier);
      b.quad(MRa[0], ya + h, MRa[1], MRb[0], yb + h, MRb[1], MLb[0], yb + h, MLb[1], MLa[0], ya + h, MLa[1], barrier);
    }
    // plate girders under the river bridge (steel, painted green-gray)
    if (sa >= F.sBridge - 20 && sb <= F.sRiver1 + 60) {
      for (const o of [-0.78, -0.26, 0.26, 0.78]) {
        const A = E(p0, rax, raz, wa * o);
        const B = E(p1, rbx, rbz, wb * o);
        beam(b, A[0], ya - DECK_T - 1.0, A[1], B[0], yb - DECK_T - 1.0, B[1], 1.9, girder);
      }
    }
  }
  if (P) P.flush();
  // the NF ramp: solid fill between retaining walls; its colliders and tag walls
  const q = { x: 0, z: 0, dx: 0, dz: 0 };
  for (let s = 0; s < F.RAMP; s += 8) {
    path.at(s + 4, q);
    const h = yAt(s + 8);
    ctx.box(q.x - 9, q.z - 4, q.x + 9, q.z + 4, h + 0.9, 'landmark');
  }
  path.at(F.RAMP * 0.5, q);
  ctx.tag({ id: 'lm-nf-ramp-w', x: q.x - 9, y: 1.4, z: q.z, nx: -1, nz: 0, w: 3, h: 1.4 });
  ctx.tag({ id: 'lm-nf-ramp-e', x: q.x + 9, y: 1.4, z: q.z + 10, nx: 1, nz: 0, w: 3, h: 1.4 });
  // the ramp's end wall (abutment) where the deck lifts off
  const Pw = ctx.cluster('freeway-ramp');
  path.at(F.RAMP, q);
  const rx = -q.dz;
  const rz = q.dx;
  const hy = yAt(F.RAMP) - DECK_T;
  Pw.get('solid').quad(q.x - rx * 9, 0, q.z - rz * 9, q.x + rx * 9, 0, q.z + rz * 9, q.x + rx * 9, hy, q.z + rz * 9, q.x - rx * 9, hy, q.z - rz * 9, shade(concrete, 0.9));
  Pw.flush();
}

// ------------------------------------------------------------------ pillars + river piers
function pillars(ctx, F) {
  const { path, yAt, wAt } = F;
  const layout = ctx.layout;
  const q = { x: 0, z: 0, dx: 0, dz: 0 };
  const col = C('#a9a59c');
  const cap = C('#9d998f');
  let P = null;
  let chunk = -1e9;
  const place = (s, river) => {
    if (s - chunk > 320) {
      if (P) P.flush();
      P = ctx.cluster(`freeway-piers-${Math.round(s)}`);
      chunk = s;
    }
    path.at(s, q);
    const y = yAt(s) - DECK_T;
    const w = wAt(s);
    const rx = -q.dz;
    const rz = q.dx;
    const heading = Math.atan2(-q.dx, -q.dz);
    const b = P.get('solid');
    const iowa = q.x > 1000;
    if (river) {
      // wall pier with a rounded nose, standing in the flood
      const [cx, cz] = [q.x, q.z];
      const len = w * 0.8;
      for (let k = -1; k <= 1; k += 2) {
        cylinder(b, cx + rx * k * (len / 2), cz + rz * k * (len / 2), 1.6, 1.6, -0.5, y - 1.2, 8, col, { top: false });
      }
      const A = rotPt(cx, cz, 0, 0, heading);
      boxRot(b, A[0], A[1], len, 3.2, -0.5, y - 1.2, heading, col);
      boxRot(b, A[0], A[1], w - 2, 2.6, y - 1.2, y, heading, cap);
      return;
    }
    const offs = w > 22 ? [-w / 2 + 3.5, 0, w / 2 - 3.5] : [-w / 2 + 3.5, w / 2 - 3.5];
    const pts = offs.map((o) => [q.x + rx * o, q.z + rz * o]);
    if (!iowa && pts.some(([x, z]) => hitsRoad(ctx.roads, x - 1, z - 1, x + 1, z + 1, 0.4) || layout.isWater(x, z) && x > 698)) return false;
    for (const [x, z] of pts) {
      cylinder(b, x, z, 0.85, 0.85, 0, y - 1.1, 8, col, { top: false });
      if (!iowa) ctx.box(x - 0.85, z - 0.85, x + 0.85, z + 0.85, y, 'landmark');
    }
    boxRot(b, q.x, q.z, w - 2.5, 1.8, y - 1.2, y, heading, cap);
    return true;
  };
  // bents every ~30 m, nudged off streets and sidewalks
  let s = F.RAMP + 14;
  while (s < F.sGround - 30) {
    path.at(s, q);
    if (s > F.sRiver0 - 4 && s < F.sRiver1 + 4) {
      s = F.sRiver1 + 30;
      continue;
    }
    if (yAt(s) - DECK_T < 2.2) break;
    let ok = false;
    for (const d of [0, 5, -5, 10, -10, 15]) {
      if (place(s + d, false)) {
        s += d;
        ok = true;
        break;
      }
    }
    s += ok ? 30 : 12;
  }
  // river piers
  const spans = 5;
  for (let i = 0; i <= spans; i++) place(F.sRiver0 + ((F.sRiver1 - F.sRiver0) * i) / spans, true);
  if (P) P.flush();
}

/** Box centred at (cx, cz), `len` across the deck and `d` along it, rotated to the deck heading. */
function boxRot(b, cx, cz, len, d, y0, y1, heading, c) {
  const cs = Math.cos(heading);
  const sn = Math.sin(heading);
  const p = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
  const q = [p(-len / 2, d / 2), p(len / 2, d / 2), p(len / 2, -d / 2), p(-len / 2, -d / 2)];
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const n = q[(i + 1) % 4];
    b.quad(a[0], y0, a[1], n[0], y0, n[1], n[0], y1, n[1], a[0], y1, a[1], c);
  }
  b.quad(q[3][0], y0, q[3][1], q[2][0], y0, q[2][1], q[1][0], y0, q[1][1], q[0][0], y0, q[0][1], shade(c, 0.8));
}

// ------------------------------------------------------------------ lights + guide signs
function gantries(ctx, F) {
  const { path, yAt, wAt } = F;
  const P = ctx.cluster('freeway-signs');
  const b = P.get('solid');
  const steel = C('#8d9092');
  const q = { x: 0, z: 0, dx: 0, dz: 0 };
  // cobra-head light poles on the median (both sides on the bridge)
  for (let s = F.RAMP + 20; s < F.sGround; s += 52) {
    path.at(s, q);
    const y = yAt(s);
    const w = wAt(s);
    const rx = -q.dz;
    const rz = q.dx;
    const bridge = w > 22;
    const bases = bridge ? [[q.x + rx * (w / 2 - 0.3), q.z + rz * (w / 2 - 0.3), -1], [q.x - rx * (w / 2 - 0.3), q.z - rz * (w / 2 - 0.3), 1]] : [[q.x, q.z, 0]];
    for (const [px, pz, side] of bases) {
      cylinder(b, px, pz, 0.14, 0.1, y + 0.8, y + 10.5, 5, steel, { top: false });
      for (const dir of side === 0 ? [-1, 1] : [side]) {
        const hx = px + rx * dir * 2.6;
        const hz = pz + rz * dir * 2.6;
        beam(b, px, y + 10.4, pz, hx, y + 10.7, hz, 0.12, steel);
        box(b, hx - 0.35, y + 10.4, hz - 0.35, hx + 0.35, y + 10.75, hz + 0.35, C('#6d7072'));
        box(P.get('lights'), hx - 0.28, y + 10.34, hz - 0.28, hx + 0.28, y + 10.4, hz + 0.28, C('#ffd48a'), { top: false, bottom: true });
        ctx.glow(hx, y + 10.2, hz, '#ffc978', 6);
      }
    }
  }
  // overhead guide-sign gantries: [s, direction (+1 = with the path), sign ids]
  const sAt = (pred) => {
    for (let s = 0; s < path.len; s += 2) {
      path.at(s, q);
      if (pred(q)) return s;
    }
    return null;
  };
  const list = [
    [sAt((p) => p.z > -650 && p.x < 20), 1, ['hwy-lake']],
    [sAt((p) => p.z > -300 && p.x < 20), 1, ['hwy-i480e', 'hwy-cuming']],
    [sAt((p) => p.z > -900 && p.x < 20), -1, ['hwy-airport']],
    [sAt((p) => p.z > -200 && p.x < 20), -1, ['hwy-us75n']],
    [sAt((p) => p.x > 300 && p.z < -60), 1, ['hwy-i480e']],
    [sAt((p) => p.x > 470 && p.z < -60), -1, ['hwy-i480w']],
  ];
  for (const [s, dir, ids] of list) {
    if (s == null) continue;
    path.at(s, q);
    const y = yAt(s);
    const w = wAt(s);
    const rx = -q.dz;
    const rz = q.dx;
    const side = dir;
    // posts at the outer parapet and the median, truss across that carriageway
    const o0 = side * (w / 2 - 0.25);
    const o1 = side * 0.6;
    const A = [q.x + rx * o0, q.z + rz * o0];
    const B = [q.x + rx * o1, q.z + rz * o1];
    for (const [px, pz] of [A, B]) cylinder(b, px, pz, 0.22, 0.22, y + 0.8, y + 8.4, 6, steel);
    beam(b, A[0], y + 8.2, A[1], B[0], y + 8.2, B[1], 0.5, steel);
    beam(b, A[0], y + 6.0, A[1], B[0], y + 6.0, B[1], 0.3, steel);
    // signs face oncoming drivers
    const facing = dir > 0 ? Math.atan2(q.dx, q.dz) : Math.atan2(-q.dx, -q.dz);
    const span = w / 2 - 1.2;
    const sw = Math.min(7.4, (span - 0.4 * (ids.length - 1)) / ids.length);
    ids.forEach((id, k) => {
      const o = side * (1 + sw / 2 + k * (sw + 0.4));
      const cx = q.x + rx * o - q.dx * dir * 0.3;
      const cz = q.z + rz * o - q.dz * dir * 0.3;
      const h = sign(P, id, cx, y + 7.1, cz, sw, 0, facing, { out: 0.05 });
      boxRot(b, cx + q.dx * dir * 0.12, cz + q.dz * dir * 0.12, sw, 0.12, y + 7.1 - h / 2, y + 7.1 + h / 2, Math.atan2(-q.dx, -q.dz), C('#5d6163'));
      ctx.glow(cx - q.dx * dir * 0.8, y + 7.1 + h / 2 + 0.2, cz - q.dz * dir * 0.8, '#fff2d0', 2.2);
    });
  }
  // IOWA state line mid-river and the Council Bluffs sign (roadside, facing eastbound drivers)
  for (const [x, id] of [[850, 'iowa-line'], [1060, 'cb']]) {
    const s = F.sBridge + (x - path.segs[6].ax);
    path.at(s, q);
    const y = yAt(s);
    const w = wAt(s);
    const px = q.x;
    const pz = q.z + w / 2 - 2.2;
    for (const dz of [-1.4, 1.4]) cylinder(b, px + 0.08, pz + dz, 0.08, 0.08, y, y + 4.2, 4, steel, { top: false });
    const h = sign(P, id, px, y + 3.3, pz, 3.4, 0, Math.PI / 2);
    box(b, px, y + 3.3 - h / 2, pz - 1.7, px + 0.08, y + 3.3 + h / 2, pz + 1.7, C('#5d6163'));
  }
  P.flush();
}

// ------------------------------------------------------------------ instanced deck traffic
const CAR_COLORS = ['#7a1f24', '#1f2f5a', '#e8e6e0', '#9ea3a8', '#2f4a36', '#b8a07a', '#1c1c1e', '#a8322a', '#6b4a2a', '#34506e', '#c9c1a6', '#5a1f3a'];

function traffic(ctx, F) {
  const { path, yAt, wAt } = F;
  const n = ctx.detail === 0 ? 14 : ctx.detail === 1 ? 26 : 40;
  // precomputed samples every 2 m for O(1) lookups in the updater
  const step = 2;
  const count = Math.ceil(path.len / step) + 1;
  const X = new Float32Array(count);
  const Z = new Float32Array(count);
  const DX = new Float32Array(count);
  const DZ = new Float32Array(count);
  const Y = new Float32Array(count);
  const W = new Float32Array(count);
  const q = { x: 0, z: 0, dx: 0, dz: 0 };
  for (let i = 0; i < count; i++) {
    const s = Math.min(path.len, i * step);
    path.at(s, q);
    X[i] = q.x;
    Z[i] = q.z;
    DX[i] = q.dx;
    DZ[i] = q.dz;
    Y[i] = yAt(s);
    W[i] = wAt(s);
  }
  const bodyGeo = carGeometry(ctx.Builder).geometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cars = new THREE.InstancedMesh(bodyGeo, mat, n);
  cars.name = 'lm:freeway-cars';
  cars.frustumCulled = false;
  // head- and taillights: white boxes in front, red at the back (night only)
  const lb = new ctx.Builder();
  const white = C('#fff4d6');
  const red = C('#ff2a1a');
  for (const x of [-0.65, 0.65]) {
    box(lb, x - 0.2, 0.62, -2.34, x + 0.2, 0.82, -2.28, white, { top: false });
    box(lb, x - 0.2, 0.66, 2.28, x + 0.2, 0.84, 2.34, red, { top: false });
  }
  const lights = new THREE.InstancedMesh(lb.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), n);
  lights.name = 'lm:freeway-carlights';
  lights.frustumCulled = false;
  lights.visible = false;
  ctx.group.add(cars, lights);
  const rng = ctx.rng;
  const list = [];
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? -1 : 1;
    list.push({ s: rng() * path.len, dir, lane: rng() < 0.5 ? 0 : 1, v: 22 + rng() * 8 });
    col.set(CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]);
    cars.setColorAt(i, col);
  }
  cars.instanceColor.needsUpdate = true;
  const o = new THREE.Object3D();
  ctx.addUpdater((dt, st) => {
    lights.visible = st.night > 0.3;
    for (let i = 0; i < n; i++) {
      const c = list[i];
      c.s += c.v * dt * c.dir;
      if (c.s > path.len - 1) c.s = 0;
      if (c.s < 0) c.s = path.len - 1;
      const f = c.s / step;
      const k = Math.min(count - 2, Math.floor(f));
      const t = f - k;
      const x = X[k] + (X[k + 1] - X[k]) * t;
      const z = Z[k] + (Z[k + 1] - Z[k]) * t;
      const dx = DX[k] + (DX[k + 1] - DX[k]) * t;
      const dz = DZ[k] + (DZ[k + 1] - DZ[k]) * t;
      let y = Y[k] + (Y[k + 1] - Y[k]) * t;
      const w = W[k];
      // right-hand lanes: 1.9 m and 5.2 m right of the median (scaled on the wide bridge)
      const off = (c.lane ? 5.2 : 1.9) * (w / 18) * c.dir;
      // sink out of sight at the foot of the North Freeway ramp
      if (c.s < 14) y -= (14 - c.s) * 0.2;
      o.position.set(x - dz * off, y + 0.05, z + dx * off);
      o.rotation.set(0, Math.atan2(-dx * c.dir, -dz * c.dir), 0);
      o.updateMatrix();
      cars.setMatrixAt(i, o.matrix);
      lights.setMatrixAt(i, o.matrix);
    }
    cars.instanceMatrix.needsUpdate = true;
    if (lights.visible) lights.instanceMatrix.needsUpdate = true;
  });
}
