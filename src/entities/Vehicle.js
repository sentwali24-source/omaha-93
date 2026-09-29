import * as THREE from 'three';
import { clamp, damp, forward } from '../core/math.js';

// STUB — replaced by the Vehicles agent. Keeps the public API from ARCHITECTURE.md.
//
// new Vehicle(game, { model, color, x, z, heading, police })
//   model: 'sedan' | 'coupe' | 'lowrider' | 'wagon' | 'pickup' | 'hatch' | 'van' | 'police' | 'bus'

export const VEHICLE_MODELS = ['sedan', 'coupe', 'lowrider', 'wagon', 'pickup', 'hatch', 'van', 'police', 'bus'];

export class Vehicle {
  constructor(game, { model = 'sedan', color = '#8a1c1c', x = 0, z = 0, heading = 0, police = false } = {}) {
    this.game = game;
    this.model = model;
    this.isPolice = police || model === 'police';
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.length = 4.8;
    this.width = 1.9;
    this.height = 1.4;
    this.radius = 2.5;
    this.maxSpeed = 30;
    this.speed = 0;
    this.lateral = 0;
    this.health = 100;
    this.driver = null;
    this.ai = null; // AI driver state (traffic/police)
    this.parked = false;
    this.siren = false;
    this.controls = { throttle: 0, steer: 0, brake: 0, handbrake: false };
    this.color = color;

    const body = new THREE.Mesh(new THREE.BoxGeometry(this.width, 0.8, this.length), new THREE.MeshLambertMaterial({ color: this.isPolice ? '#e8e8e8' : color }));
    body.position.y = 0.7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(this.width * 0.9, 0.55, this.length * 0.5), new THREE.MeshLambertMaterial({ color: '#222831' }));
    cab.position.set(0, 1.35, 0.2);
    body.castShadow = true;
    this.root.add(body, cab);
  }

  get position() {
    return this.root.position;
  }

  setDriver(actor) {
    this.driver = actor;
    if (actor) this.parked = false;
  }

  getExitPoint() {
    const h = this.heading;
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const p = this.position;
    for (const side of [-1, 1]) {
      const x = p.x + rx * side * (this.width / 2 + 0.8);
      const z = p.z + rz * side * (this.width / 2 + 0.8);
      if (this.game.collision.isFree(x, z, 0.4)) return { x, z };
    }
    return { x: p.x - rx * (this.width / 2 + 0.8), z: p.z - rz * (this.width / 2 + 0.8) };
  }

  horn() {}

  update(dt) {
    const c = this.controls;
    if (!this.driver && !this.ai) {
      c.throttle = 0;
      c.steer = 0;
    }
    const accel = c.throttle > 0 ? c.throttle * 12 : c.throttle * (this.speed > 0.5 ? 22 : 7);
    this.speed += accel * dt;
    if (c.handbrake) this.speed = damp(this.speed, 0, 3, dt);
    if (Math.abs(c.throttle) < 0.05) this.speed = damp(this.speed, 0, 0.6, dt);
    this.speed = clamp(this.speed, -8, this.maxSpeed);
    const steerRate = c.steer * clamp(Math.abs(this.speed) / 6, 0, 1) * 1.9 * Math.sign(this.speed || 1);
    this.heading -= steerRate * dt;
    const f = forward(this.heading);
    const p = this.position;
    p.x += f.x * this.speed * dt;
    p.z += f.z * this.speed * dt;
    const hit = this.game.collision.resolveCircle(p, this.width * 0.55, 0.3, 1.5);
    if (hit) this.speed *= 0.5;
    this.root.rotation.y = this.heading;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose?.();
      }
    });
  }
}
