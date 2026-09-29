import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Props for FALLBACK shop POIs only (Shops generates those when the city has no POI of a type).
// Payphones (pole + booth, one InstancedMesh) and sidewalk sandwich boards with painted shop
// signs (frame InstancedMesh + sign-face InstancedMesh sampling a small canvas atlas):
// three draw calls in total, whatever the count.

const SIGN_TYPES = ['store', 'food', 'clothes', 'barber', 'garage', 'record'];
const SIGN_TEXT = { store: ['FOOD', 'MART'], food: ['CHICKEN', '& BBQ'], clothes: ['FRESH', 'FITS'], barber: ['BARBER', 'SHOP'], garage: ['AUTO', 'BODY'], record: ['TAPES', '& CDs'] };
const SIGN_COLORS = { store: '#1fa35b', food: '#d8451f', clothes: '#7a3fc0', barber: '#1f6fd8', garage: '#333a44', record: '#e0287a' };

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function box(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return colored(g, hex);
}

function payphoneGeometry() {
  // front (keypad, handset) faces -Z
  return mergeGeometries([
    box(0.1, 1.05, 0.1, 0, 0.52, 0.08, '#6f757c'),
    box(0.58, 0.82, 0.34, 0, 1.36, 0, '#a9b3bd'),
    box(0.5, 0.5, 0.05, 0, 1.3, -0.18, '#39424c'),
    box(0.1, 0.3, 0.09, -0.2, 1.36, -0.23, '#111114'),
    box(0.14, 0.18, 0.03, 0.08, 1.3, -0.21, '#d7dde2'),
    box(0.62, 0.14, 0.38, 0, 1.84, 0, '#2255a4'),
    box(0.7, 0.05, 0.46, 0, 1.93, 0, '#16376b'),
  ]);
}

function boardGeometry() {
  // A-frame sandwich board: two legs, top bar, back panel; the painted face is separate
  return mergeGeometries([
    box(0.06, 1.0, 0.06, -0.36, 0.5, 0.12, '#3a2a1c'),
    box(0.06, 1.0, 0.06, 0.36, 0.5, 0.12, '#3a2a1c'),
    box(0.06, 1.0, 0.06, -0.36, 0.5, -0.12, '#3a2a1c'),
    box(0.06, 1.0, 0.06, 0.36, 0.5, -0.12, '#3a2a1c'),
    box(0.8, 0.06, 0.3, 0, 1.02, 0, '#2a1d12'),
    box(0.74, 0.74, 0.04, 0, 0.58, -0.1, '#e8dcc2'),
  ]);
}

function signAtlas() {
  const cell = 128;
  const c = document.createElement('canvas');
  c.width = cell * SIGN_TYPES.length;
  c.height = cell;
  const ctx = c.getContext('2d');
  SIGN_TYPES.forEach((t, i) => {
    const x0 = i * cell;
    ctx.fillStyle = '#f7efd9';
    ctx.fillRect(x0, 0, cell, cell);
    ctx.fillStyle = SIGN_COLORS[t];
    ctx.fillRect(x0 + 6, 6, cell - 12, cell - 12);
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(x0 + 6, 6);
    ctx.lineTo(x0 + 40, 6);
    ctx.lineTo(x0 + 6, 40);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const [a, b] = SIGN_TEXT[t];
    ctx.lineJoin = 'round';
    for (const [text, y, size] of [[a, 48, 30], [b, 86, 24]]) {
      ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#111018';
      ctx.strokeText(text, x0 + cell / 2, y, cell - 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x0 + cell / 2, y, cell - 18);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build props for fallback POIs. Returns a THREE.Group (added to the scene by the caller). */
export function buildFallbackProps(game, pois) {
  const group = new THREE.Group();
  group.name = 'fallback-shop-props';
  const phones = pois.filter((p) => p.type === 'payphone');
  const boards = pois.filter((p) => SIGN_TYPES.includes(p.type));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  // the prop stands just beyond the POI point, in the direction the POI heading faces
  const place = (p, dist) => {
    const fx = -Math.sin(p.heading || 0);
    const fz = -Math.cos(p.heading || 0);
    return { x: p.x + fx * dist, z: p.z + fz * dist };
  };

  if (phones.length) {
    const mesh = new THREE.InstancedMesh(payphoneGeometry(), mat, phones.length);
    phones.forEach((p, i) => {
      const at = place(p, 0.75);
      q.setFromAxisAngle(up, (p.heading || 0) + Math.PI);
      m.compose(v.set(at.x, 0, at.z), q, s);
      mesh.setMatrixAt(i, m);
      game.collision.addCenteredBox(at.x, at.z, 0.3, 0.3, 2, 0, 'prop');
    });
    mesh.castShadow = !!game.quality.shadows;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  if (boards.length) {
    const frame = new THREE.InstancedMesh(boardGeometry(), mat, boards.length);
    // the painted face looks down -Z (the prop's front, toward the street)
    const faceGeo = new THREE.PlaneGeometry(0.7, 0.7);
    faceGeo.rotateY(Math.PI);
    faceGeo.translate(0, 0.58, -0.125);
    const tile = new THREE.InstancedBufferAttribute(new Float32Array(boards.length), 1);
    faceGeo.setAttribute('aTile', tile);
    const faceMat = new THREE.MeshLambertMaterial({ map: signAtlas() });
    const n = SIGN_TYPES.length.toFixed(1);
    faceMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n  vMapUv = vec2((aTile + uv.x) / ${n}, uv.y);`);
    };
    faceMat.customProgramCacheKey = () => 'fallback-sign-v1';
    const face = new THREE.InstancedMesh(faceGeo, faceMat, boards.length);
    boards.forEach((p, i) => {
      // off to the side of the door, facing the street (toward the player's approach)
      const at = place(p, 0.2);
      const rx = Math.cos(p.heading || 0);
      const rz = -Math.sin(p.heading || 0);
      at.x += rx * 1.6;
      at.z += rz * 1.6;
      q.setFromAxisAngle(up, (p.heading || 0) + Math.PI);
      m.compose(v.set(at.x, 0, at.z), q, s);
      frame.setMatrixAt(i, m);
      face.setMatrixAt(i, m);
      tile.setX(i, SIGN_TYPES.indexOf(p.type));
      game.collision.addCenteredBox(at.x, at.z, 0.4, 0.4, 1.1, 0, 'prop');
    });
    frame.computeBoundingSphere();
    face.computeBoundingSphere();
    group.add(frame, face);
  }
  return group;
}
