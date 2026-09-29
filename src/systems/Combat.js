import { forward, angleDiff, headingTo, damp } from '../core/math.js';

// STUB — replaced by the Player/Character agent. Keeps the public API from ARCHITECTURE.md.
//
// combat.melee(attacker, { damage, range, arc, knockback, delay })  — schedules a hit
// Vehicles call target.takeDamage directly for run-overs.

export class Combat {
  constructor(game) {
    this.game = game;
    this.pending = [];
  }

  melee(attacker, { damage = 10, range = 1.5, arc = Math.PI * 0.6, knockback = 3, delay = 0.12 } = {}) {
    this.pending.push({ attacker, damage, range, arc, knockback, t: delay });
  }

  update(dt) {
    const game = this.game;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const h = this.pending[i];
      h.t -= dt;
      if (h.t > 0) continue;
      this.pending.splice(i, 1);
      const a = h.attacker;
      if (!a.alive) continue;
      const f = forward(a.heading);
      for (const t of game.actorsNear(a.position.x, a.position.z, h.range + 0.5)) {
        if (t === a || !t.alive || t.vehicle) continue;
        const dx = t.position.x - a.position.x;
        const dz = t.position.z - a.position.z;
        if (Math.abs(angleDiff(a.heading, headingTo(dx, dz))) > h.arc / 2) continue;
        t.takeDamage(h.damage, a, f, h.knockback);
      }
    }
    for (const actor of game.actors) {
      if (actor.state === 'ko') actor.koTime += dt;
      if (actor === game.player) continue;
      actor.velocity.x = damp(actor.velocity.x, 0, 6, dt);
      actor.velocity.z = damp(actor.velocity.z, 0, 6, dt);
    }
  }
}
