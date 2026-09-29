import * as THREE from 'three';

// STUB — replaced by the LANDMARKS agent. Contract (ARCHITECTURE.md §9a):
//   export async function buildLandmarks(game, city, onProgress)
// Builds every LANDMARKS / PARKS / FREEWAYS / WATER entry from data/map.js plus the river, the
// Iowa shore and Council Bluffs skyline. Adds its own colliders. May push into city.tagSpots,
// city.pois, city.parkingSpots, city.nightMaterials and call city.addUpdater(fn).

export async function buildLandmarks(game, city, onProgress = () => {}) {
  const L = game.layout;
  for (const w of L.water) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0), new THREE.MeshLambertMaterial({ color: '#3d5a6b' }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((w.x0 + w.x1) / 2, 0.05, (w.z0 + w.z1) / 2);
    city.group.add(m);
    game.collision.addBox(w.x0, w.z0, w.x1, w.z1, 3, -2, 'water');
  }
  for (const l of L.landmarks) {
    if (l.park || !l.h) continue;
    const r = l.rect;
    const g = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, l.h, r.z1 - r.z0), new THREE.MeshLambertMaterial({ color: '#c9b8a0' }));
    g.position.set((r.x0 + r.x1) / 2, l.h / 2, (r.z0 + r.z1) / 2);
    city.group.add(g);
    game.collision.addBox(r.x0, r.z0, r.x1, r.z1, l.h, 0, 'landmark');
  }
  onProgress(1, 'Landmarks');
}
