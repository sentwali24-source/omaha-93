import { midiFreq } from '../dsp.js';
import { gainNode, filterNode, noiseNode, oscNode } from '../sfx.js';

// Plays song events on the audio graph: sample voices (drums, keys, guitar, bass, pads, brass,
// bells) through three fixed pan buses, plus persistent mono synths for the portamento leads and
// the gliding sub bass. One Band per playing station; stop() silences everything it scheduled.

const PAN = { hatC: 0.25, hatO: 0.25, shaker: -0.3, snap: -0.1, rim: 0.15, pluck: -0.2, brass: 0.2, bell: 0.3, lead: 0.12 };
const GAIN = {
  kick808: 0.95, kickDusty: 0.9, kickSoft: 0.8, snare: 0.55, snareDusty: 0.7, clap: 0.55, rim: 0.35, snap: 0.45,
  hatC: 0.22, hatO: 0.2, shaker: 0.2, crash: 0.3, ep: 0.34, pluck: 0.4, bass: 0.7, pad: 0.2, brass: 0.3, bell: 0.22,
};
const RELEASE = { ep: 0.35, pluck: 0.25, bass: 0.12, pad: 0.7, brass: 0.12, bell: 0.8 };

// Mono synth voices: oscillator mix, filter, vibrato, attack/release, level.
const MONO = {
  gfunk: { oscs: [['sine', 1, 0.75], ['sawtooth', 1, 0.16], ['sine', 2, 0.06]], lp: 2600, q: 2, vib: 22, vibRate: 5.6, attack: 0.02, release: 0.12, level: 0.2 },
  sub: { oscs: [['sine', 1, 0.9], ['triangle', 1, 0.22]], lp: 420, q: 0.8, vib: 0, vibRate: 0, attack: 0.008, release: 0.06, level: 0.55 },
  soft: { oscs: [['sine', 1, 0.8], ['triangle', 1, 0.3]], lp: 3000, q: 0.7, vib: 18, vibRate: 5, attack: 0.06, release: 0.2, level: 0.16 },
  steel: { oscs: [['triangle', 1, 0.8], ['sine', 2, 0.2], ['sawtooth', 1, 0.05]], lp: 2400, q: 1.2, vib: 20, vibRate: 6, attack: 0.09, release: 0.25, level: 0.2 },
};

class MonoSynth {
  constructor(band, kind, t) {
    const A = band.A;
    const ctx = A.ctx;
    const def = MONO[kind] || MONO.soft;
    this.def = def;
    this.ctx = ctx;
    this.vca = gainNode(A, band.bus(PAN.lead * (kind === 'sub' ? 0 : 1)), 0);
    const lp = filterNode(A, this.vca, 'lowpass', def.lp, def.q);
    this.oscs = [];
    this.vibGain = ctx.createGain();
    this.vibGain.gain.value = 0;
    if (def.vib) {
      this.lfo = oscNode(A, this.vibGain, 'sine', def.vibRate, t, 1e5);
    }
    for (const [type, mul, lvl] of def.oscs) {
      const g = gainNode(A, lp, lvl);
      const o = oscNode(A, g, type, 220 * mul, t, 1e5);
      this.vibGain.connect(o.detune);
      this.oscs.push([o, mul]);
    }
    this.lastEnd = -1;
  }

  note(n, t, dur, vel, glide) {
    const f = midiFreq(n);
    const d = this.def;
    const legato = glide > 0.03 && t - this.lastEnd < 0.06;
    for (const [o, mul] of this.oscs) {
      if (legato) o.frequency.setTargetAtTime(f * mul, t, glide / 3);
      else o.frequency.setValueAtTime(f * mul, t);
    }
    const g = this.vca.gain;
    g.setTargetAtTime(d.level * vel, t, d.attack / 3);
    g.setTargetAtTime(0, t + dur, d.release / 3);
    if (d.vib) {
      // vibrato blooms on held notes
      this.vibGain.gain.setTargetAtTime(0, t, 0.02);
      if (dur > 0.35) this.vibGain.gain.setTargetAtTime(d.vib, t + 0.22, 0.12);
    }
    this.lastEnd = t + dur;
  }

  stop(t) {
    this.vca.gain.setTargetAtTime(0, t, 0.05);
    for (const [o] of this.oscs) o.stop(t + 0.3);
    this.lfo?.stop(t + 0.3);
  }
}

export class Band {
  constructor(audio, bank, dest) {
    this.A = audio;
    this.ctx = audio.ctx;
    this.bank = bank;
    this.out = gainNode(audio, dest, 1);
    this._buses = new Map();
    this._pitch = {};
    this.monos = [];
  }

  /** A shared stereo bus for a pan position (quantized to a few buses). */
  bus(pan = 0) {
    const key = Math.round(pan * 4) / 4;
    let b = this._buses.get(key);
    if (!b) {
      if (this.ctx.createStereoPanner) {
        b = this.ctx.createStereoPanner();
        b.pan.value = key;
        b.connect(this.out);
      } else b = this.out;
      this._buses.set(key, b);
    }
    return b;
  }

  mono(kind, t) {
    const m = new MonoSynth(this, kind, t);
    this.monos.push(m);
    return m;
  }

  drum(name, t, vel) {
    const buf = this.bank.drum(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.985 + Math.random() * 0.03;
    const g = this.ctx.createGain();
    g.gain.value = (GAIN[name] ?? 0.5) * vel;
    src.connect(g);
    g.connect(this.bus(PAN[name] ?? 0));
    src.start(t);
  }

  sample(inst, n, t, dur, vel, strum = 0, stepDur = 0.16) {
    const notes = Array.isArray(n) ? n : [n];
    const rel = RELEASE[inst] ?? 0.2;
    const lvl = ((GAIN[inst] ?? 0.4) * vel) / Math.sqrt(notes.length);
    const dest = this.bus(PAN[inst] ?? 0);
    for (let k = 0; k < notes.length; k++) {
      const at = t + k * strum * stepDur;
      const p = this.bank.pitched(inst, notes[k], this._pitch);
      const src = this.ctx.createBufferSource();
      src.buffer = p.buffer;
      src.playbackRate.value = p.rate;
      if (inst === 'pad') {
        src.loop = true;
        src.loopStart = p.buffer.loopStart ?? 1.2;
        src.loopEnd = p.buffer.loopEnd ?? p.buffer.duration - 0.6;
      }
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(lvl, at);
      g.gain.setTargetAtTime(0, at + dur, rel / 3);
      src.connect(g);
      g.connect(dest);
      src.start(at);
      src.stop(at + dur + rel * 2.5);
    }
  }

  fx(name, t, barDur) {
    const A = this.A;
    if (name === 'sweep') {
      const g = gainNode(A, this.out, 0);
      const bp = filterNode(A, g, 'bandpass', 400, 1.5);
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + barDur * 0.9);
      noiseNode(A, bp, 'white', t, barDur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + barDur * 0.85);
      g.gain.linearRampToValueAtTime(0, t + barDur);
    } else if (name === 'scratch') {
      // baby scratch: a pitched "record" dragged back and forth
      const g = gainNode(A, this.bus(-0.2), 0);
      const bp = filterNode(A, g, 'bandpass', 1400, 1.2);
      const s = oscNode(A, bp, 'sawtooth', 300, t, 0.6);
      noiseNode(A, bp, 'white', t, 0.6, 0.6);
      for (let k = 0; k < 4; k++) {
        const at = t + k * 0.12;
        s.frequency.setValueAtTime(220, at);
        s.frequency.linearRampToValueAtTime(900, at + 0.06);
        s.frequency.linearRampToValueAtTime(260, at + 0.12);
        g.gain.setValueAtTime(0.25, at);
        g.gain.setValueAtTime(0.05, at + 0.1);
      }
      g.gain.setValueAtTime(0, t + 0.5);
    }
  }

  /** Silence everything this band scheduled (fade), then drop the graph. */
  stop(fade = 0.12) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, fade / 3);
    for (const m of this.monos) m.stop(t + fade);
    this.monos.length = 0;
    const out = this.out;
    setTimeout(() => out.disconnect(), (fade + 0.5) * 1000);
  }
}
