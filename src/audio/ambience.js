import { clamp, smoothstep } from '../core/math.js';
import { envAD, envAHR, midiFreq } from './dsp.js';
import { gainNode, filterNode, oscNode, noiseNode } from './sfx.js';

// Ambient beds and distant events, chosen by where the camera is, the hour and the weather:
//
//   crickets   summer nights in the neighborhoods and parks
//   cicadas    hot afternoons and evenings in the trees
//   traffic    distant city hum: loud downtown by day, faint at 4 a.m.
//   wind       gusts under storm clouds and up high (title flyover)
//   rain       the rain bed (muffled on the car roof when driving)
//   events     dogs barking in North Omaha, a freight train horn by the river, jets out of Eppley,
//              dawn birds, a far-off siren at night, thunder (from 'weather:lightning')

const RESIDENTIAL = { north: 1, midtown: 0.7, riverfront: 0.6, eastomaha: 0.4, nodo: 0.25, downtown: 0.15, oldmarket: 0.2 };
const TRAFFIC = { downtown: 1, oldmarket: 0.85, midtown: 0.8, nodo: 0.75, north: 0.45, eastomaha: 0.55, riverfront: 0.45 };

const rand = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(audio) {
    this.audio = audio;
    this.beds = {}; // name → { src, gain, level }
    this.bus = null;
    this._district = 'north';
    this._check = 0;
    this._timers = { dog: rand(8, 20), train: rand(40, 90), jet: rand(25, 60), bird: rand(2, 6), siren: rand(60, 140) };
  }

  /** Build the bed players once the context and buffers exist. */
  start(dest) {
    const A = this.audio;
    this.bus = gainNode(A, dest, 1);
    for (const name of ['crickets', 'cicadas', 'traffic', 'wind']) this._ensureBed(name);
    this.rain = null;
  }

  _ensureBed(name) {
    const A = this.audio;
    if (this.beds[name] || !A.hasBed(name)) return this.beds[name] || null;
    const ctx = A.ctx;
    const gain = gainNode(A, this.bus, 0);
    const src = ctx.createBufferSource();
    src.buffer = A.bed(name);
    src.loop = true;
    src.connect(gain);
    src.start(ctx.currentTime, Math.random() * src.buffer.duration * 0.9);
    this.beds[name] = { src, gain, level: 0 };
    return this.beds[name];
  }

  _setBed(name, level) {
    const b = this.beds[name] || this._ensureBed(name);
    if (!b) return;
    if (Math.abs(b.level - level) < 0.004) return;
    b.level = level;
    b.gain.gain.setTargetAtTime(level, this.audio.ctx.currentTime, 0.6);
  }

  update(dt, listener) {
    const A = this.audio;
    const game = A.game;
    if (!this.bus) return;
    const env = game.environment;
    const hour = game.clock?.hour ?? 12;
    const night = env?.night ?? 0;
    const rain = env?.rainIntensity ?? 0;
    const cover = env?.weatherSystem?.params?.cover ?? 0.3;
    const storm = env?.weatherSystem?.params?.storm ?? 0;

    this._check -= dt;
    if (this._check <= 0) {
      this._check = 0.5;
      this._district = game.layout?.districtAt?.(listener.x, listener.z)?.id || 'north';
    }
    const d = this._district;
    const resid = RESIDENTIAL[d] ?? 0.5;
    const high = smoothstep(25, 120, listener.y); // title-screen flyover altitude
    const ground = 1 - high * 0.8;
    const inCar = !!game.player?.vehicle;
    const car = inCar ? 0.45 : 1; // windows up-ish

    const dryness = 1 - smoothstep(0.1, 0.6, rain);
    this._setBed('crickets', 0.5 * smoothstep(0.45, 0.9, night) * resid * dryness * ground * car);
    // cicadas: loudest in the late-afternoon heat, gone by full dark
    const cic = smoothstep(10, 14, hour) * (1 - smoothstep(20.3, 21.3, hour)) * (1 - 0.5 * smoothstep(0.6, 1, cover));
    this._setBed('cicadas', 0.26 * cic * resid * dryness * ground * car);
    const hourK = 0.35 + 0.65 * (smoothstep(5, 8, hour) * (1 - smoothstep(22, 26, hour + (hour < 5 ? 24 : 0))));
    this._setBed('traffic', 0.38 * (TRAFFIC[d] ?? 0.6) * hourK * (0.6 + 0.4 * ground) * car);
    this._setBed('wind', clamp(0.05 + 0.12 * cover + 0.45 * storm + 0.25 * high, 0, 0.7) * (inCar ? 0.35 : 1));

    // rain uses the shared loop (so its "on the roof" muffle can follow the car)
    if (rain > 0.03 && A.hasBed('rain')) {
      if (!this.rain) this.rain = A.loop('rain', { volume: 0, bus: this.bus });
      this.rain.setVolume(Math.min(1, rain * 1.1) * (inCar ? 1.15 : 1));
      this.rain.setMuffle?.(inCar ? 0.75 : 0);
    } else if (this.rain) {
      this.rain.stop(2);
      this.rain = null;
    }

    // ---- distant events
    if (game.mode === 'boot') return;
    const T = this._timers;
    for (const k in T) T[k] -= dt;
    if (T.dog <= 0) {
      T.dog = rand(14, 45);
      if (d === 'north' || d === 'eastomaha' || d === 'midtown') this.dog(listener);
    }
    if (T.train <= 0) {
      T.train = rand(70, 160);
      if (listener.x > 330 || d === 'riverfront' || d === 'eastomaha' || d === 'nodo') this.train(listener);
    }
    if (T.jet <= 0) {
      T.jet = rand(40, 110);
      if (listener.z < -500 || d === 'eastomaha' || d === 'riverfront') this.jet(listener);
    }
    if (T.bird <= 0) {
      T.bird = rand(1.5, 6);
      const dawn = smoothstep(4.8, 5.6, hour) * (1 - smoothstep(9.5, 11, hour));
      const dayBirds = smoothstep(6, 8, hour) * (1 - smoothstep(19, 20.5, hour)) * 0.35;
      if (Math.random() < Math.max(dawn, dayBirds) * resid * dryness && ground > 0.5) this.bird(listener);
    }
    if (T.siren <= 0) {
      T.siren = rand(80, 200);
      if (night > 0.6 && !((game.police?.heat ?? 0) > 0)) this.farSiren(listener);
    }
  }

  // ------------------------------------------------------------------ events
  /** A destination node for a distant event: lowpass (air), pan, gain. */
  _far(pan, gain, cutoff) {
    const A = this.audio;
    const ctx = A.ctx;
    const g = gainNode(A, this.bus, gain);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = clamp(pan, -1, 1);
      p.connect(g);
    }
    const lp = filterNode(A, p || g, 'lowpass', cutoff, 0.7);
    A.sendReverb?.(g, 0.35);
    setTimeout(() => g.disconnect(), 12000);
    return lp;
  }

  dog() {
    const A = this.audio;
    const t = A.ctx.currentTime + 0.05;
    const out = this._far(rand(-0.9, 0.9), rand(0.08, 0.16), rand(1800, 3200));
    const barks = 2 + Math.floor(Math.random() * 3);
    const pitch = rand(420, 640);
    for (let i = 0; i < barks; i++) {
      const at = t + i * rand(0.28, 0.42);
      const g = gainNode(A, out);
      const f1 = filterNode(A, g, 'bandpass', rand(900, 1300), 3);
      const s = oscNode(A, f1, 'sawtooth', pitch, at, 0.2);
      s.frequency.setValueAtTime(pitch * 1.25, at);
      s.frequency.exponentialRampToValueAtTime(pitch * 0.7, at + 0.12);
      noiseNode(A, f1, 'pink', at, 0.12);
      envAD(g.gain, at, 0.01, 1, 0.12);
    }
  }

  train() {
    // a freight horn blowing for a grade crossing: long, long, short, long
    const A = this.audio;
    const t = A.ctx.currentTime + 0.1;
    const out = this._far(rand(0.3, 1), 0.07, 1500);
    const chord = [63, 66, 68, 71, 75].map(midiFreq); // D#4 F#4 G#4 B4 D#5
    const pattern = [1.6, 1.6, 0.6, 2.4];
    let at = t;
    for (const len of pattern) {
      const g = gainNode(A, out);
      for (const f of chord) {
        const o = oscNode(A, g, 'sawtooth', f * 0.995, at, len);
        o.detune.value = rand(-6, 6);
      }
      envAHR(g.gain, at, 0.12, 0.12, len - 0.2, 0.25);
      at += len + 0.35;
    }
    // the train itself rumbling by
    const r = gainNode(A, out);
    const lp = filterNode(A, r, 'lowpass', 180, 0.8);
    noiseNode(A, lp, 'brown', t, 16);
    envAHR(r.gain, t, 4, 0.6, 7, 5);
  }

  jet() {
    const A = this.audio;
    const t = A.ctx.currentTime + 0.1;
    const dur = rand(9, 13);
    const ctx = A.ctx;
    const g = gainNode(A, this.bus, 0);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.connect(g);
      const dir = Math.random() > 0.5 ? 1 : -1;
      p.pan.setValueAtTime(-0.8 * dir, t);
      p.pan.linearRampToValueAtTime(0.8 * dir, t + dur);
    }
    const bp = filterNode(A, p || g, 'bandpass', 300, 0.8);
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.linearRampToValueAtTime(900, t + dur * 0.45);
    bp.frequency.linearRampToValueAtTime(380, t + dur);
    noiseNode(A, bp, 'pink', t, dur + 0.5);
    const whine = gainNode(A, p || g, 0.02);
    const w = oscNode(A, whine, 'sine', 3100, t, dur);
    w.frequency.linearRampToValueAtTime(2500, t + dur); // doppler
    envAHR(g.gain, t, dur * 0.45, 0.22, 0.5, dur * 0.5);
    setTimeout(() => g.disconnect(), (dur + 2) * 1000);
  }

  bird() {
    const A = this.audio;
    const t = A.ctx.currentTime + 0.02;
    const out = this._far(rand(-1, 1), rand(0.05, 0.1), 9000);
    const base = rand(2400, 4200);
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const at = t + i * rand(0.08, 0.16);
      const g = gainNode(A, out);
      const o = oscNode(A, g, 'sine', base, at, 0.12);
      o.frequency.setValueAtTime(base * rand(0.9, 1.1), at);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.6), at + 0.06);
      envAD(g.gain, at, 0.005, 1, 0.07);
    }
  }

  farSiren() {
    const A = this.audio;
    const t = A.ctx.currentTime + 0.1;
    const out = this._far(rand(-1, 1), 0.035, 1400);
    const g = gainNode(A, out);
    const o = oscNode(A, g, 'square', 700, t, 7);
    for (let k = 0; k < 2; k++) {
      o.frequency.linearRampToValueAtTime(1400, t + k * 3.4 + 1.7);
      o.frequency.linearRampToValueAtTime(700, t + k * 3.4 + 3.4);
    }
    envAHR(g.gain, t, 1.5, 1, 3, 2.2);
  }

  stop() {
    for (const b of Object.values(this.beds)) {
      try {
        b.src.stop();
      } catch {
        /* ignore */
      }
      b.gain.disconnect();
    }
    this.beds = {};
    this.rain?.stop(0.2);
    this.rain = null;
  }
}
