import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SETS } from '../data/sets.js';

// STUB — replaced by the CITY agent. Keeps the public API from ARCHITECTURE.md §9:
// flat ground, gray roads, one plain box per block (with collision), water, map bounds.

export class City {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'city';
    game.scene.add(this.group);
    this.tagSpots = [];
    this.pois = [];
    this.parkingSpots = [];
    this.nightMaterials = [];
  }

  async build(onProgress = () => {}) {
    const game = this.game;
    const L = game.layout;
    const B = L.bounds;
    const col = game.collision;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: '#5d6b43' }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    const roadGeos = [];
    for (const e of L.edges) {
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      const len = e.axis === 'z' ? Math.abs(b.z - a.z) : Math.abs(b.x - a.x);
      const w = e.width + L.SIDEWALK * 2;
      const g = new THREE.PlaneGeometry(e.axis === 'z' ? w : len + w, e.axis === 'z' ? len + w : w);
      g.rotateX(-Math.PI / 2);
      g.translate((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
      roadGeos.push(g);
    }
    const roads = new THREE.Mesh(mergeGeometries(roadGeos), new THREE.MeshLambertMaterial({ color: '#3a3a3e' }));
    roads.receiveShadow = true;
    this.group.add(roads);
    onProgress(0.4, 'Roads');

    const boxGeos = [];
    for (const blk of L.blocks) {
      if (blk.water || blk.park) continue;
      const pad = 3;
      const w = blk.x1 - blk.x0 - pad * 2;
      const d = blk.z1 - blk.z0 - pad * 2;
      if (w < 4 || d < 4) continue;
      const h = blk.district === 'downtown' ? 30 : blk.district === 'north' ? 7 : 12;
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(blk.cx, h / 2, blk.cz);
      boxGeos.push(g);
      col.addBox(blk.x0 + pad, blk.z0 + pad, blk.x1 - pad, blk.z1 - pad, h, 0, 'building');
    }
    const boxes = new THREE.Mesh(mergeGeometries(boxGeos), new THREE.MeshLambertMaterial({ color: '#a49a8a' }));
    boxes.castShadow = true;
    boxes.receiveShadow = true;
    this.group.add(boxes);
    onProgress(0.8, 'Buildings');

    for (const w of L.water) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0), new THREE.MeshLambertMaterial({ color: '#3d5a6b' }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((w.x0 + w.x1) / 2, 0.05, (w.z0 + w.z1) / 2);
      this.group.add(m);
      col.addBox(w.x0, w.z0, w.x1, w.z1, 3, -2, 'water');
    }

    const t = 5;
    col.addBox(B.minX - t, B.minZ - t, B.maxX + t, B.minZ, 50, -5, 'bounds');
    col.addBox(B.minX - t, B.maxZ, B.maxX + t, B.maxZ + t, 50, -5, 'bounds');
    col.addBox(B.minX - t, B.minZ, B.minX, B.maxZ, 50, -5, 'bounds');
    col.addBox(B.maxX, B.minZ, B.maxX + t, B.maxZ, 50, -5, 'bounds');

    // minimal POIs so other systems can be tested against the stub
    for (const s of SETS) this.pois.push({ id: `hood-${s.id}`, type: 'hood', name: `${s.short} hood`, x: s.hood.x, z: s.hood.z, heading: 0, zoneId: L.zoneAt(s.hood.x, s.hood.z)?.id || null, district: 'north' });
    onProgress(1, 'Done');
  }

  setNight() {}

  update() {}
}
