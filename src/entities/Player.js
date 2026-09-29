import { Actor } from './Actor.js';
import { Character } from './Character.js';
import { SIDES } from '../data/sets.js';
import { clamp, damp, dampAngle, headingTo } from '../core/math.js';

// STUB — replaced by the Player/Character agent. Keeps the public API from ARCHITECTURE.md.

export class Player extends Actor {
  constructor(game, { x, z, heading, side, setId, look = {}, name }) {
    const sideDef = SIDES[side] || SIDES.crips;
    const character = new Character({ skin: '#8d5a3b', shirt: sideDef.color, pants: '#2a2a33', ...look });
    super(game, { kind: 'player', faction: setId, side, character, x, z, heading, maxHealth: 100, name });
    this.setId = setId;
    this.stamina = 1;
    this.vy = 0;
    this.grounded = true;
    this.attackCooldown = 0;
  }

  update(dt) {
    const game = this.game;
    const input = game.input;
    if (this.vehicle) {
      const v = this.vehicle;
      v.controls.throttle = input.move.y;
      v.controls.steer = input.move.x;
      v.controls.handbrake = input.held('handbrake');
      this.position.copy(v.position);
      if (input.pressed('vehicle')) this.exitVehicle();
      return;
    }
    if (this.state === 'ko') {
      this.character.update(dt, 0);
      return;
    }

    const yaw = game.cameraRig?.yaw ?? 0;
    const mx = input.move.x;
    const my = input.move.y;
    const sprint = input.held('sprint') && this.stamina > 0.05;
    const speed = (sprint ? 7.2 : 4.2) * Math.min(1, Math.hypot(mx, my));
    // camera-relative: forward = camera heading
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const dx = fx * my + rx * mx;
    const dz = fz * my + rz * mx;
    const p = this.position;
    if (speed > 0.01) {
      const len = Math.hypot(dx, dz) || 1;
      p.x += (dx / len) * speed * dt;
      p.z += (dz / len) * speed * dt;
      this.faceHeading(dampAngle(this.heading, headingTo(dx, dz), 12, dt));
    }
    this.stamina = clamp(this.stamina + (sprint && speed > 0 ? -0.18 : 0.12) * dt, 0, 1);

    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    this.velocity.x = damp(this.velocity.x, 0, 6, dt);
    this.velocity.z = damp(this.velocity.z, 0, 6, dt);

    if (input.pressed('jump') && this.grounded) {
      this.vy = 5;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 14 * dt;
      p.y += this.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    game.collision.resolveCircle(p, this.radius, p.y + 0.3, p.y + 1.8);
    this.speed = speed;

    this.attackCooldown -= dt;
    if (input.pressed('attack') && this.attackCooldown <= 0) {
      this.attackCooldown = 0.35;
      this.character.playOnce('punch');
      game.combat?.melee(this, { damage: 12 });
    }

    if (input.pressed('vehicle')) {
      const near = game.vehiclesNear(p.x, p.z, 4).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
      if (near) this.enterVehicle(near);
    }
    this.character.update(dt, speed);
  }

  enterVehicle(v) {
    if (v.driver && v.driver !== this) {
      const prev = v.driver;
      v.setDriver(null);
      this.game.events.emit('vehicle:jacked', { vehicle: v, from: prev, by: this });
    }
    this.vehicle = v;
    v.setDriver(this);
    this.character.setVisible(false);
    this.game.events.emit('player:enterVehicle', { vehicle: v });
  }

  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return;
    if (!force && Math.abs(v.speed) > 6) return;
    const exit = v.getExitPoint();
    v.setDriver(null);
    v.controls.throttle = 0;
    v.controls.steer = 0;
    this.vehicle = null;
    this.position.set(exit.x, 0, exit.z);
    this.character.setVisible(true);
    this.game.events.emit('player:exitVehicle', { vehicle: v });
  }

  respawn(x, z, heading) {
    this.state = 'active';
    this.health = this.maxHealth;
    this.velocity.set(0, 0, 0);
    this.position.set(x, 0, z);
    this.faceHeading(heading);
    this.character.setAnim('idle');
    this.character.setVisible(true);
  }
}
