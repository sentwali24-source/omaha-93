import { Vehicle } from '../entities/Vehicle.js';

// STUB — replaced by the Vehicles/Traffic agent. Keeps the public API from ARCHITECTURE.md.
export class Traffic {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.cars = []; // AI-driven
    this.parked = []; // parked, player-stealable
  }

  onGameStart() {
    const p = this.game.player.position;
    const v = new Vehicle(this.game, { model: 'sedan', color: '#7a1f2b', x: p.x + 6, z: p.z, heading: 0 });
    v.parked = true;
    this.parked.push(v);
    this.game.addVehicle(v);
  }

  onGameEnd() {
    for (const v of [...this.cars, ...this.parked]) if (!v.driver || v.driver !== this.game.player) this.game.removeVehicle(v);
    this.cars = [];
    this.parked = [];
  }

  update() {}
}
