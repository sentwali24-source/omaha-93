import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Small hangout props, built once and shared: a dual-deck boombox sitting on a milk crate.
// One merged BufferGeometry with vertex colors + one shared Lambert material = one draw call
// per prop instance; no textures.

let shared = null;

function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function build() {
  const parts = [];
  const box = (w, h, d, x, y, z, hex) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(colored(g, hex));
  };
  const cyl = (r, depth, x, y, z, hex, seg = 12) => {
    const g = new THREE.CylinderGeometry(r, r, depth, seg);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    parts.push(colored(g, hex));
  };
  // milk crate (slatted look from stacked bars)
  const crate = '#c8622a';
  const ch = 0.3;
  box(0.36, 0.03, 0.36, 0, 0.015, 0, crate);
  box(0.36, 0.03, 0.36, 0, ch - 0.015, 0, crate);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(0.035, ch, 0.035, sx * 0.1625, ch / 2, sz * 0.1625, crate);
  }
  for (const y of [0.1, 0.19]) {
    box(0.36, 0.025, 0.02, 0, y, 0.17, crate);
    box(0.36, 0.025, 0.02, 0, y, -0.17, crate);
    box(0.02, 0.025, 0.36, 0.17, y, 0, crate);
    box(0.02, 0.025, 0.36, -0.17, y, 0, crate);
  }
  // boombox body
  const y0 = ch + 0.15;
  box(0.62, 0.28, 0.17, 0, y0, 0, '#26262b');
  box(0.62, 0.035, 0.175, 0, y0 + 0.125, 0, '#8d8d96'); // chrome top strip
  box(0.2, 0.09, 0.02, 0, y0 + 0.03, 0.09, '#1b1b1f'); // cassette decks
  box(0.085, 0.06, 0.012, -0.05, y0 + 0.03, 0.1, '#6a7078');
  box(0.085, 0.06, 0.012, 0.05, y0 + 0.03, 0.1, '#6a7078');
  box(0.18, 0.03, 0.012, 0, y0 + 0.095, 0.092, '#c9a227'); // tuner dial
  for (const sx of [-1, 1]) {
    cyl(0.1, 0.02, sx * 0.2, y0 - 0.01, 0.09, '#b8b8c0', 14); // speaker ring
    cyl(0.078, 0.025, sx * 0.2, y0 - 0.01, 0.092, '#0d0d10', 14); // cone
    cyl(0.025, 0.03, sx * 0.2, y0 - 0.01, 0.095, '#55555c', 8); // dust cap
  }
  // carry handle
  box(0.44, 0.025, 0.03, 0, y0 + 0.23, 0, '#8d8d96');
  box(0.025, 0.09, 0.03, -0.21, y0 + 0.185, 0, '#8d8d96');
  box(0.025, 0.09, 0.03, 0.21, y0 + 0.185, 0, '#8d8d96');
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return { geo, mat };
}

/** A boombox-on-a-crate mesh (shared geometry/material; do not dispose them). */
export function makeBoombox() {
  if (!shared) shared = build();
  const m = new THREE.Mesh(shared.geo, shared.mat);
  m.castShadow = false;
  m.receiveShadow = false;
  m.matrixAutoUpdate = false;
  return m;
}

/** Place a static prop mesh (matrixAutoUpdate is off). */
export function placeProp(mesh, x, z, heading) {
  mesh.position.set(x, 0, z);
  mesh.rotation.set(0, heading, 0);
  mesh.updateMatrix();
}
