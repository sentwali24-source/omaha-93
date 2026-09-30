import * as THREE from 'three';
import { RIVER } from '../../data/map.js';
import { C, shade, box, flat, beam, strip, cylinder } from './kit.js';
import { lamp } from './props.js';

// The Missouri River in the Great Flood of 1993: wide, brown, running fast and high, lapping
// near the top of the Omaha levee, which is lined with sandbags. Also the 1916 Union Pacific
// double-track truss bridge and floating flood debris.
//
// The city ground plane sits at y = 0, so the river surface is drawn *above* it (y = 1.1) and
// the levee rises to 2.4 m: the water really is "near the top of the banks".

export const WATER_Y = 1.1;
export const UP_BRIDGE = { z: -300, deckY: 7.5, x0: 700, x1: 1000, spans: 4, width: 10 };

export function buildRiver(ctx) {
  const P = ctx.cluster('river');
  const { x0, x1, z0, z1 } = RIVER;
  // water: one long quad, texture repeating every 40 m (animated in Landmarks.js)
  flat(P.get('water'), x0 + 2, z0, x1 + 6, z1, WATER_Y, C('#83755c'), false, 1 / 30);
  ctx.box(x0, z0, x1, z1, 3, 'water', -2);

  // --- Omaha levee: landside grass slope, gravel crest, muddy riverside slope
  const grass = C('#71894a');
  for (const [za, zb, bags] of [[z0, -1260, false], [-1260, 420, true], [420, z1]]) {
    const g = P.get('grass');
    const s = 1 / 7;
    // landside slope 690 → 697 (0 → 2.4)
    g.quad(690, 0.04, zb, 697, 2.4, zb, 697, 2.4, za, 690, 0.04, za, grass, 690 * s, zb * s, 697 * s, za * s);
    // riverside slope 701.5 → 705 (2.4 → under water)
    g.quad(701.5, 2.4, zb, 705, 0.8, zb, 705, 0.8, za, 701.5, 2.4, za, shade(grass, 0.85), 701.5 * s, zb * s, 705 * s, za * s);
    const R = ctx.T.rows.dirt;
    const b = P.get('ground');
    b.quad(701.5, 2.42, zb, 701.5, 2.42, za, 697, 2.42, za, 697, 2.42, zb, C('#b0a28a'), -zb / 8, R.v0, -za / 8, R.v1);
    if (bags) {
      // sandbag wall along the crest, facing the river
      const L = P.get('lowrise');
      const row = ctx.T.rows.sandbag;
      const len = zb - za;
      const u1 = len / 6;
      L.quad(701.3, 2.4, zb, 701.3, 2.4, za, 701.3, 3.35, za, 701.3, 3.35, zb, C('#ffffff'), 0, row.v0, u1, row.v1);
      L.quad(700.2, 2.4, za, 700.2, 2.4, zb, 700.2, 3.35, zb, 700.2, 3.35, za, C('#e8e0d0'), 0, row.v0, u1, row.v1);
      flat(P.get('solid'), 700.2, za, 701.3, zb, 3.35, C('#b3a075'));
      // black plastic sheeting draped over some stretches (a real 1993 flood-fight detail)
      for (let z = za + 30; z < zb - 40; z += 90 + ctx.rng() * 80) {
        const zl = 12 + ctx.rng() * 20;
        box(P.get('solid'), 701.28, 2.3, z, 701.45, 3.3, z + zl, C('#1c1d1f'), { top: false });
      }
    }
  }
  ctx.box(693, -1260, 700, 400, 2.4, 'landmark');

  unionPacificBridge(ctx, P);
  P.flush();
  debris(ctx);
}

// ------------------------------------------------------------------ UP Missouri River bridge (1916)
function unionPacificBridge(ctx, P) {
  const B = UP_BRIDGE;
  const b = P.get('solid');
  const zc = B.z;
  const hw = B.width / 2;
  const deck = B.deckY;
  const steel = C('#3e4347');
  const stone = C('#9d958a');
  const spanLen = (B.x1 - B.x0) / B.spans;
  // piers (stone, with a pointed nose facing upstream / north)
  for (let i = 0; i <= B.spans; i++) {
    const px = B.x0 + i * spanLen;
    box(b, px - 3, -0.5, zc - hw - 2, px + 3, deck - 0.8, zc + hw + 2, stone);
    b.tri(px - 3, deck - 0.8, zc - hw - 2, px + 3, deck - 0.8, zc - hw - 2, px, deck - 0.8, zc - hw - 6, shade(stone, 1.05));
    b.quad(px, -0.5, zc - hw - 6, px - 3, -0.5, zc - hw - 2, px - 3, deck - 0.8, zc - hw - 2, px, deck - 0.8, zc - hw - 6, shade(stone, 0.9));
    b.quad(px + 3, -0.5, zc - hw - 2, px, -0.5, zc - hw - 6, px, deck - 0.8, zc - hw - 6, px + 3, deck - 0.8, zc - hw - 2, shade(stone, 0.95));
  }
  // deck slab + ties/rails
  box(b, B.x0 - 2, deck - 0.9, zc - hw, B.x1 + 2, deck, zc + hw, C('#4a4640'), { bottom: true });
  for (const tz of [zc - 2.3, zc + 2.3]) strip(P, 'rail', B.x0 - 2, tz, B.x1 + 2, tz, 3.2, 4, { y: deck + 0.04 });
  // Parker through-trusses on both sides of each span
  const n = 8;
  for (let s = 0; s < B.spans; s++) {
    const sx = B.x0 + s * spanLen;
    for (const tz of [zc - hw - 0.4, zc + hw + 0.4]) {
      const bot = [];
      const top = [];
      for (let i = 0; i <= n; i++) {
        const x = sx + (spanLen * i) / n;
        bot.push([x, deck - 0.3, tz]);
        top.push([x, deck + 6.5 + 3.5 * Math.sin((Math.PI * i) / n), tz]);
      }
      const bm = (a, c, w = 0.45) => beam(b, a[0], a[1], a[2], c[0], c[1], c[2], w, steel);
      for (let i = 0; i < n; i++) bm(bot[i], bot[i + 1], 0.7);
      for (let i = 1; i < n - 1; i++) bm(top[i], top[i + 1], 0.7);
      bm(bot[0], top[1], 0.65);
      bm(bot[n], top[n - 1], 0.65);
      for (let i = 1; i < n; i++) bm(bot[i], top[i], 0.35);
      for (let i = 1; i < n - 1; i++) {
        if (i < n / 2) bm(top[i], bot[i + 1], 0.3);
        else bm(top[i + 1], bot[i], 0.3);
      }
    }
    // top lateral bracing
    for (let i = 1; i < n; i++) {
      const x = sx + (spanLen * i) / n;
      const y = deck + 6.5 + 3.5 * Math.sin((Math.PI * i) / n);
      beam(b, x, y, zc - hw - 0.4, x, y, zc + hw + 0.4, 0.3, steel);
      if (i < n - 1) {
        const x2 = sx + (spanLen * (i + 1)) / n;
        const y2 = deck + 6.5 + 3.5 * Math.sin((Math.PI * (i + 1)) / n);
        beam(b, x, y, zc - hw - 0.4, x2, y2, zc + hw + 0.4, 0.18, steel);
      }
    }
  }
  // Iowa-side approach embankment down to the floodplain
  const E = C('#6f7a4a');
  const g = P.get('grass');
  const s = 1 / 7;
  const top0 = deck;
  const iy = 1.5;
  g.quad(B.x1, top0, zc + hw, B.x1 + 70, iy, zc + hw + 4, B.x1 + 70, iy, zc - hw - 4, B.x1, top0, zc - hw, E, 0, 0, 10, 2);
  g.quad(B.x1, top0 - 0.01, zc + hw, B.x1, iy, zc + hw + 10, B.x1 + 70, iy, zc + hw + 10, B.x1 + 70, iy - 0.01, zc + hw + 4, shade(E, 0.85), 0, 0, 10, 1);
  g.quad(B.x1 + 70, iy - 0.01, zc - hw - 4, B.x1 + 70, iy, zc - hw - 10, B.x1, iy, zc - hw - 10, B.x1, top0 - 0.01, zc - hw, shade(E, 0.85), 0, 0, 10, 1);
  for (const tz of [zc - 2.3, zc + 2.3]) {
    const R = ctx.T.rows.rail;
    const gb = P.get('ground');
    gb.quad(B.x1, top0 + 0.05, tz + 1.6, B.x1 + 70, iy + 0.05, tz + 1.6, B.x1 + 70, iy + 0.05, tz - 1.6, B.x1, top0 + 0.05, tz - 1.6, C('#ffffff'), 0, R.v0, 17, R.v1);
  }
  // signal mast + lamp on the Omaha abutment
  lamp(P, B.x0 - 6, zc + hw + 2, { style: 'cobra', h: 7, y0: 0, rot: Math.PI / 2, collide: false });
  cylinder(b, B.x0 + 4, zc - hw - 1.5, 0.15, 0.15, deck, deck + 6, 5, C('#2b2b2b'));
  ctx.blink(B.x0 + 4, deck + 6.2, zc - hw - 1.5, '#ff3020', 3);
}

// ------------------------------------------------------------------ flood debris drifting downstream
function debris(ctx) {
  const n = ctx.detail === 0 ? 8 : 16;
  const geo = new THREE.CylinderGeometry(0.28, 0.35, 1, 6, 1);
  geo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: '#4d3b2c' });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'lm:river-debris';
  mesh.frustumCulled = false;
  const rng = ctx.rng;
  const logs = [];
  for (let i = 0; i < n; i++) {
    logs.push({ x: 715 + rng() * 270, z: -1400 + rng() * 2200, len: 3 + rng() * 7, rot: rng() * Math.PI, spin: (rng() - 0.5) * 0.1, v: 1.1 + rng() * 0.8, ph: rng() * 6 });
  }
  ctx.group.add(mesh);
  const o = new THREE.Object3D();
  ctx.addUpdater((dt, st) => {
    for (let i = 0; i < n; i++) {
      const l = logs[i];
      l.z += l.v * dt;
      l.rot += l.spin * dt;
      if (l.z > 900) {
        l.z = -1500;
        l.x = 715 + rng() * 270;
      }
      o.position.set(l.x, WATER_Y + 0.05 + Math.sin(st.t * 1.3 + l.ph) * 0.06, l.z);
      o.rotation.set(0, l.rot, 0);
      o.scale.set(l.len, 1, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}
