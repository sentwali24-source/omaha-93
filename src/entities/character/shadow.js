import * as THREE from 'three';

// Soft blob shadows under every character: one InstancedMesh per scene (a single draw call for all
// characters), so people stay grounded on 'low' quality and at night when real shadows are off.
// Characters own a slot and write their matrix directly in Character.update().

const CAPACITY = 192;
const layers = new WeakMap(); // Scene → BlobLayer
let texture = null;
let material = null;
let geometry = null;

function shared() {
  if (material) return;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    color: '#ffffff',
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
}

class BlobLayer {
  constructor(scene) {
    shared();
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = 'character-blob-shadows';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // before other transparent things (tags, particles)
    this.mesh.count = 0;
    this.arr = this.mesh.instanceMatrix.array;
    this.arr.fill(0);
    this.free = [];
    this.used = 0;
    scene.add(this.mesh);
  }

  alloc() {
    const i = this.free.length ? this.free.pop() : this.used < CAPACITY ? this.used++ : -1;
    if (i >= 0) this.mesh.count = Math.max(this.mesh.count, i + 1);
    return i;
  }

  release(i) {
    if (i < 0) return;
    this.hide(i);
    this.free.push(i);
  }

  set(i, x, y, z, s) {
    const a = this.arr;
    const o = i * 16;
    a[o] = s;
    a[o + 5] = 1;
    a[o + 10] = s;
    a[o + 12] = x;
    a[o + 13] = y;
    a[o + 14] = z;
    a[o + 15] = 1;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(i) {
    const o = i * 16;
    if (this.arr[o] === 0 && this.arr[o + 15] === 0) return;
    this.arr.fill(0, o, o + 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Blob layer for the scene an object lives in (null when it's not in a scene). */
export function blobLayerFor(obj) {
  let p = obj.parent;
  while (p && !p.isScene) p = p.parent;
  if (!p) return null;
  let layer = layers.get(p);
  if (!layer) {
    layer = new BlobLayer(p);
    layers.set(p, layer);
  }
  return layer;
}
