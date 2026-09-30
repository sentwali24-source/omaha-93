import { C, box, beam, flat, lawn, surface, bermX, mound, obox } from './kit.js';
import { tree, bench, lamp, postSign, payphone, trashCan } from './props.js';

// Gene Leahy Mall (Central Park Mall, renamed 1992): the lagoon with its waterfall, two
// footbridges, grass banks and the famous big metal slides near 11th & Farnam. The ground is
// flat for gameplay, so the "sunken" feel comes from grass berms along Douglas and Farnam and a
// tall slide hill at the southeast corner.

export function buildLeahyMall(ctx) {
  const P = ctx.cluster('leahy');
  const land = ctx.land(ctx.lm('leahymall').rect)[0];
  const lag = ctx.layout.water.find((w) => w.id === 'leahy-lagoon');
  const b = P.get('solid');
  const { x0, x1, z0, z1 } = land;

  lawn(P, land, '#6a9642');
  // paths along both shores, a paved plaza at the west (library) end, entrances through the berms
  surface(P, { x0, x1, z0: lag.z0 - 4.4, z1: lag.z0 - 0.4 }, 'path', 3, { across: 4 });
  surface(P, { x0, x1, z0: lag.z1 + 0.4, z1: lag.z1 + 4.4 }, 'path', 3, { across: 4 });
  surface(P, { x0, x1: lag.x0 - 0.2, z0: lag.z0 - 4.4, z1: lag.z1 + 4.4 }, 'pavers', 4, { across: 4 });
  const gapsN = [[497, 502.5], [521, 526.5]];
  const gapS = [500, 505.5];
  for (const [g0, g1] of gapsN) surface(P, { x0: g0, x1: g1, z0, z1: lag.z0 - 4.4 }, 'path', 3, { axis: 'z', across: g1 - g0 });
  surface(P, { x0: gapS[0], x1: gapS[1], z0: lag.z1 + 4.4, z1 }, 'path', 3, { axis: 'z', across: gapS[1] - gapS[0] });

  // grass berms (jumpable) along Douglas (north) and Farnam (south)
  const bermN = [[x0 + 2, gapsN[0][0]], [gapsN[0][1], gapsN[1][0]], [gapsN[1][1], x1 - 2]];
  for (const [a, c] of bermN) {
    bermX(P, a, c, z0 + 0.4, z0 + 3.4, lag.z0 - 4.6, 1.1, '#6d9a44');
    ctx.box(a, z0 + 1.4, c, lag.z0 - 5.6, 1.1, 'prop');
  }
  const hill = { x0: 527, x1: x1 - 0.5, z0: lag.z1 + 4.6, z1: z1 - 0.3 };
  for (const [a, c] of [[x0 + 2, gapS[0]], [gapS[1], hill.x0 - 0.5]]) {
    bermX(P, a, c, lag.z1 + 4.6, z1 - 3.4, z1 - 0.4, 1.1, '#6d9a44');
    ctx.box(a, lag.z1 + 5.6, c, z1 - 1.4, 1.1, 'prop');
  }
  // the slide hill near 11th & Farnam: a steep mound with a paved top and three long metal slides
  const top = { x0: hill.x0 + 5, x1: hill.x1 - 4, z0: hill.z0 + 4, z1: hill.z1 - 1.5 };
  const H = 4.4;
  mound(P, hill, top, H, '#6a9642');
  flat(P.get('ground'), top.x0, top.z0, top.x1, top.z1, H + 0.08, C('#cfc9bc'), false, 0);
  ctx.box(hill.x0 + 1.5, hill.z0 + 1.5, hill.x1 - 1, hill.z1 - 0.5, H);
  const metal = P.get('shiny');
  const rail = C('#9ea3a6');
  for (const sx of [top.x0 + 2, (top.x0 + top.x1) / 2, top.x1 - 2]) {
    const ya = H + 0.35;
    const za = top.z0 + 0.3;
    const zb = lag.z1 + 1.4;
    const yb = 0.45;
    const w = 0.55;
    metal.quad(sx - w, ya, za, sx + w, ya, za, sx + w, yb, zb, sx - w, yb, zb, C('#d7dadc'));
    metal.quad(sx + w, ya - 0.05, za, sx - w, ya - 0.05, za, sx - w, yb - 0.05, zb, sx + w, yb - 0.05, zb, C('#b7bbbe'));
    for (const s of [-1, 1]) {
      const x = sx + s * w;
      metal.quad(x, ya, za, x, yb, zb, x, yb + 0.35, zb, x, ya + 0.35, za, rail);
      metal.quad(x, yb, zb, x, ya, za, x, ya + 0.35, za, x, yb + 0.35, zb, rail);
    }
    // run-out at the bottom
    box(b, sx - 0.7, 0, zb - 0.2, sx + 0.7, 0.45, zb + 0.9, C('#c9ccce'));
    ctx.box(sx - 0.7, zb - 0.2, sx + 0.7, zb + 0.9, 0.45, 'prop');
  }
  // railing around the top platform and steps up the back
  for (const [ax, az, bx, bz] of [[top.x0, top.z1, top.x1, top.z1], [top.x0, top.z0, top.x0, top.z1], [top.x1, top.z0, top.x1, top.z1]]) {
    beam(b, ax, H + 1.1, az, bx, H + 1.1, bz, 0.06, rail);
  }
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    box(b, top.x1 + 0.2, 0.05, hill.z1 - 0.6 - t * 0.2, top.x1 + 2, 0.5 + t * H, hill.z1 - 0.2 - t * 0.2 + 0.4, C('#bdb7aa'));
  }

  // the lagoon: stone coping, water, waterfall at the west end, two footbridges
  const cop = C('#bdb5a4');
  box(b, lag.x0 - 0.4, 0, lag.z0 - 0.4, lag.x1 + 0.4, 0.35, lag.z0, cop);
  box(b, lag.x0 - 0.4, 0, lag.z1, lag.x1 + 0.4, 0.35, lag.z1 + 0.4, cop);
  box(b, lag.x1, 0, lag.z0, lag.x1 + 0.4, 0.35, lag.z1, cop);
  flat(P.get('lake'), lag.x0, lag.z0, lag.x1, lag.z1, 0.22, C('#58767d'), false, 1 / 14);
  const bridges = [510, 531];
  // water collider in pieces so the footbridges stay walkable
  let wx = lag.x0;
  for (const bx of bridges) {
    ctx.box(wx, lag.z0, bx - 1.6, lag.z1, 1.5, 'water', -2);
    wx = bx + 1.6;
  }
  ctx.box(wx, lag.z0, lag.x1, lag.z1, 1.5, 'water', -2);
  for (const bx of bridges) {
    const deck = C('#c4bcae');
    box(b, bx - 1.6, 0.05, lag.z0 - 0.6, bx + 1.6, 0.34, lag.z1 + 0.6, deck, { bottom: true });
    for (const s of [-1, 1]) {
      const x = bx + s * 1.5;
      for (let z = lag.z0 - 0.5; z <= lag.z1 + 0.6; z += 2) box(b, x - 0.06, 0.34, z - 0.06, x + 0.06, 1.3, z + 0.06, rail);
      beam(b, x, 1.3, lag.z0 - 0.5, x, 1.3, lag.z1 + 0.5, 0.08, rail);
      ctx.box(x - 0.1, lag.z0, x + 0.1, lag.z1, 1.3, 'prop');
    }
  }
  // waterfall: a stepped stone cascade feeding the lagoon
  const fx = lag.x0;
  const stone = C('#9d958a');
  box(b, fx - 7, 0, lag.z0 + 0.6, fx - 0.2, 4.4, lag.z1 - 0.6, stone);
  box(b, fx - 0.4, 0, lag.z0 + 1.5, fx + 1.2, 2.0, lag.z1 - 1.5, C('#8e877c'));
  box(b, fx - 8, 4.4, lag.z0 + 0.2, fx - 0.2, 4.9, lag.z1 - 0.2, C('#b3aa9c'));
  const falls = P.get('falls');
  const white = C('#e8f0f2');
  falls.quad(fx - 0.15, 2.05, lag.z1 - 1.8, fx - 0.15, 2.05, lag.z0 + 1.8, fx - 0.15, 4.45, lag.z0 + 1.8, fx - 0.15, 4.45, lag.z1 - 1.8, white, 0, 0, 3, 1.5);
  falls.quad(fx + 1.25, 0.22, lag.z1 - 1.8, fx + 1.25, 0.22, lag.z0 + 1.8, fx + 1.25, 2.02, lag.z0 + 1.8, fx + 1.25, 2.02, lag.z1 - 1.8, white, 0, 0, 3, 1);
  flat(falls, fx - 0.15, lag.z0 + 1.8, fx + 1.25, lag.z1 - 1.8, 2.03, white, false, 0.3);
  flat(falls, fx + 1.2, lag.z0 + 1.2, fx + 4.5, lag.z1 - 1.2, 0.26, white, false, 0.25);
  ctx.box(fx - 7, lag.z0 + 0.6, fx + 1.2, lag.z1 - 0.6, 4.4);

  // swans (1993 mall regulars)
  for (const [sx, sz, r] of [[518, 86, 0.4], [520.5, 87.5, 1.2], [540, 92, -0.8]]) {
    obox(b, sx, sz, 0.5, 1.0, 0.22, 0.6, r, C('#f4f4f0'));
    const nx = sx - Math.sin(r) * 0.45;
    const nz = sz - Math.cos(r) * 0.45;
    beam(b, nx, 0.5, nz, nx - Math.sin(r) * 0.1, 1.05, nz - Math.cos(r) * 0.1, 0.1, C('#f4f4f0'));
    box(b, nx - Math.sin(r) * 0.2 - 0.05, 1.0, nz - Math.cos(r) * 0.2 - 0.05, nx - Math.sin(r) * 0.2 + 0.05, 1.07, nz - Math.cos(r) * 0.2 + 0.05, C('#e07a1f'));
  }

  // trees on the banks, lamps + benches along the shore paths
  const rng = ctx.rng;
  for (let x = x0 + 6; x < x1 - 4; x += 8.5 + rng() * 2) {
    if (!gapsN.some(([g0, g1]) => x > g0 - 2 && x < g1 + 2)) tree(P, x, z0 + 3.2, { h: 7 + rng() * 3, kind: rng() < 0.3 ? 'round' : 'broad' });
    if (x < hill.x0 - 3 && !(x > gapS[0] - 2 && x < gapS[1] + 2)) tree(P, x + 3, z1 - 3.2, { h: 7 + rng() * 3 });
  }
  for (let x = lag.x0 + 6; x < lag.x1 - 2; x += 13) {
    lamp(P, x, lag.z0 - 4.1, { style: 'park' });
    lamp(P, x + 6, lag.z1 + 4.1, { style: 'park' });
    if (!bridges.some((bx) => Math.abs(bx - x - 3) < 3)) {
      bench(P, x + 3, lag.z0 - 3.4, Math.PI);
      if (x + 9 < hill.x0 || x + 9 > hill.x1) bench(P, x + 9, lag.z1 + 3.4, 0);
    }
  }
  for (const [tx, tz] of [[x0 + 3, lag.z0 - 2], [x0 + 3, lag.z1 + 2]]) tree(P, tx, tz, { h: 8, kind: 'round' });
  trashCan(P, lag.x0 + 3, lag.z0 - 2.6);
  trashCan(P, lag.x0 + 3, lag.z1 + 2.6);
  postSign(P, 'leahymall', x0 + 1.2, (z0 + z1) / 2, 5.2, Math.PI / 2, { twoSided: true });
  const pp = payphone(P, x0 + 5, lag.z1 + 2.2, Math.PI / 2);
  ctx.poi({ id: 'lm-payphone-leahy', type: 'payphone', name: 'Payphone', ...pp });
  P.flush();
}
