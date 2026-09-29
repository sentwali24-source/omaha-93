import * as THREE from 'three';

// STUB — replaced by the Atmosphere agent. Keeps the public API from ARCHITECTURE.md.
export class Environment {
  constructor(game) {
    this.game = game;
    this.attract = true;
    const scene = game.scene;
    scene.background = new THREE.Color('#9cc3e6');
    scene.fog = new THREE.Fog('#9cc3e6', game.quality.fogNear, game.quality.fogFar);
    this.hemi = new THREE.HemisphereLight('#dfefff', '#4a4038', 1.4);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.0);
    this.sun.position.set(200, 300, 100);
    scene.add(this.hemi, this.sun);
    this.night = 0;
  }

  update() {}
}
