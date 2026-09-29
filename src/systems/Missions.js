// STUB — replaced by the Gameplay agent. Keeps the public API from ARCHITECTURE.md.
export class Missions {
  constructor(game) {
    this.game = game;
    this.active = null;
  }

  available() {
    return [];
  }

  abort() {
    this.active = null;
  }

  update() {}
}
