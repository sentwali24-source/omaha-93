// STUB — replaced by the Atmosphere agent. Keeps the public API from ARCHITECTURE.md.
const noopHandle = { setVolume() {}, setRate() {}, setPosition() {}, stop() {} };

export class Audio {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.always = true;
    this.unlocked = false;
    this.radio = { station: null, stations: [], next() {}, off() {}, setActive() {} };
  }

  unlock() {
    this.unlocked = true;
  }

  play() {}

  loop() {
    return noopHandle;
  }

  update() {}
}
