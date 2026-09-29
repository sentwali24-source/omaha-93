import * as THREE from 'three';
import { clamp, damp } from '../core/math.js';

// STUB — replaced by the Player/Character agent. Keeps the public API from ARCHITECTURE.md.
// yaw: camera heading (same convention as actor heading). Player movement is relative to it.

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 6;
    this.target = new THREE.Vector3();
    this.attract = false;
    this.attractT = 0;
    this.attract = true;
  }

  setAttract(on) {
    this.attract = on;
  }

  snap() {
    this._snap = true;
  }

  shake() {}

  update(dt) {
    const game = this.game;
    const cam = this.camera;
    if (this.attract || !game.player) {
      this.attractT += dt * 0.03;
      const cx = 150;
      const cz = -150;
      this.target.set(cx, 0, cz);
      cam.position.set(cx + Math.sin(this.attractT) * 500, 180, cz + Math.cos(this.attractT) * 500);
      cam.lookAt(this.target);
      return;
    }
    const input = game.input;
    this.yaw -= input.look.dx * 0.003;
    this.pitch = clamp(this.pitch + input.look.dy * 0.003, -0.2, 1.2);
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const dist = game.player.vehicle ? 9 : this.distance;
    this.target.set(p.x, p.y + 1.6, p.z);
    const back = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const want = new THREE.Vector3(
      this.target.x + back.x * dist * Math.cos(this.pitch),
      this.target.y + dist * Math.sin(this.pitch),
      this.target.z + back.z * dist * Math.cos(this.pitch),
    );
    if (this._snap) {
      cam.position.copy(want);
      this._snap = false;
    } else {
      cam.position.x = damp(cam.position.x, want.x, 12, dt);
      cam.position.y = damp(cam.position.y, want.y, 12, dt);
      cam.position.z = damp(cam.position.z, want.z, 12, dt);
    }
    cam.lookAt(this.target);
  }
}
