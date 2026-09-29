// Ringing payphone: the North American ring (440 + 480 Hz, 2 s on / 4 s off), synthesized with
// WebAudio and attenuated by distance to the player. Uses the game's AudioContext when Audio
// exposes one (game.audio.ctx / .context), otherwise a small private context created after the
// player's first gesture (game.audio.unlocked). Volume follows settings.masterVolume × sfxVolume.

export class PhoneRinger {
  constructor(game) {
    this.game = game;
    this.target = null; // {x, z}
    this.t = 0;
    this.ctx = null;
    this.nodes = null;
  }

  start(pos) {
    this.target = pos;
    this.t = 0;
  }

  stop() {
    this.target = null;
    this._silence();
  }

  _context() {
    const a = this.game.audio;
    const shared = a?.ctx || a?.context;
    if (shared && typeof shared.createOscillator === 'function') return shared;
    if (!a?.unlocked) return null;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = AC ? new AC() : null;
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  _ensureNodes() {
    if (this.nodes) return this.nodes;
    const ctx = this._context();
    if (!ctx) return null;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const out = this.game.audio?.sfxBus || this.game.audio?.sfxGain || ctx.destination;
      gain.connect(out.context === ctx ? out : ctx.destination);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.frequency.value = 440;
      o2.frequency.value = 480;
      // old phone bells: a little amplitude wobble at 20 Hz
      const trem = ctx.createOscillator();
      const tremGain = ctx.createGain();
      trem.frequency.value = 20;
      tremGain.gain.value = 0.35;
      const mix = ctx.createGain();
      mix.gain.value = 0.6;
      trem.connect(tremGain);
      tremGain.connect(mix.gain);
      o1.connect(mix);
      o2.connect(mix);
      mix.connect(gain);
      o1.start();
      o2.start();
      trem.start();
      this.nodes = { ctx, gain, o1, o2, trem };
    } catch {
      this.nodes = null;
    }
    return this.nodes;
  }

  _silence() {
    if (!this.nodes) return;
    try {
      this.nodes.gain.gain.setTargetAtTime(0, this.nodes.ctx.currentTime, 0.03);
    } catch {
      /* ignore */
    }
  }

  update(dt) {
    if (!this.target || !this.game.player) {
      if (this.nodes && this.nodes.gain.gain.value > 0.0001) this._silence();
      return;
    }
    this.t += dt;
    const p = this.game.focus;
    const d = Math.hypot(p.x - this.target.x, p.z - this.target.z);
    if (d > 70) {
      this._silence();
      return;
    }
    const n = this._ensureNodes();
    if (!n) return;
    const s = this.game.settings || {};
    const vol = (s.masterVolume ?? 0.8) * (s.sfxVolume ?? 0.9) * 0.16 * Math.max(0, 1 - d / 70) ** 1.5;
    const phase = this.t % 6;
    const on = phase < 2 && this.game.mode === 'play' && !this.game.paused;
    try {
      n.gain.gain.setTargetAtTime(on ? vol : 0, n.ctx.currentTime, 0.02);
    } catch {
      /* ignore */
    }
  }
}
