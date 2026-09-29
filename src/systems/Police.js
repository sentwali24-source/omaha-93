// STUB — replaced by the NPC agent. Keeps the public API from ARCHITECTURE.md.
export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0; // 0..5 stars
    this.points = 0;
    this.cops = [];
    this.cruisers = [];
  }

  setHeat(level) {
    this.heat = Math.max(0, Math.min(5, level));
    this.game.events.emit('heat:change', { level: this.heat });
  }

  /** type: 'assault' | 'assaultCop' | 'carjack' | 'tag' | 'hitAndRun' | 'vandalism' | 'resist' */
  reportCrime() {}

  clear() {
    this.setHeat(0);
  }

  update() {}
}
