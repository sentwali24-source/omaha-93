import { envAD, envAHR, midiFreq } from './dsp.js';

// Synthesized one-shot sound effects. Every recipe is (A, t, out, o) → duration (s):
//   A    the audio engine (ctx + pre-rendered noise buffers, see Audio.js)
//   t    start time (AudioContext seconds)
//   out  destination node (the voice's gain/pan chain)
//   o    { volume, rate (pitch multiplier), dur?, wet?, intensity? }
// Recipes only build short-lived nodes that stop themselves, so nothing needs cleaning up.

// ------------------------------------------------------------------ node helpers
export function gainNode(A, dest, value = 0) {
  const g = A.ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

export function filterNode(A, dest, type, freq, q = 0.7) {
  const f = A.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

export function oscNode(A, dest, type, freq, t, dur) {
  const o = A.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** Noise burst from a pre-rendered buffer ('white' | 'pink' | 'brown'), random offset. */
export function noiseNode(A, dest, kind, t, dur, rate = 1) {
  const s = A.ctx.createBufferSource();
  const buf = A.noise[kind] || A.noise.white;
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.connect(dest);
  s.start(t, Math.random() * (buf.duration - 0.1));
  s.stop(t + dur + 0.05);
  return s;
}

/** Pitched decaying tone (sine/triangle/...) with optional pitch glide to f2. */
function blip(A, dest, type, f1, f2, t, a, peak, decay, glide = decay) {
  const g = gainNode(A, dest);
  const o = oscNode(A, g, type, f1, t, a + decay * 1.5);
  if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide);
  envAD(g.gain, t, a, peak, decay);
  return o;
}

/** Filtered noise burst with an AD envelope. */
function burst(A, dest, kind, type, freq, q, t, a, peak, decay) {
  const g = gainNode(A, dest);
  const f = filterNode(A, g, type, freq, q);
  noiseNode(A, f, kind, t, a + decay * 1.5);
  envAD(g.gain, t, a, peak, decay);
  return f;
}

/** Detuned saw "brass" chord stab through an opening/closing lowpass. */
function brassChord(A, dest, notes, t, dur, peak = 0.22, bright = 2600) {
  const g = gainNode(A, dest);
  const f = filterNode(A, g, 'lowpass', 400, 1.2);
  f.frequency.setValueAtTime(400, t);
  f.frequency.linearRampToValueAtTime(bright, t + 0.04);
  f.frequency.setTargetAtTime(bright * 0.45, t + 0.06, dur * 0.4);
  for (const n of notes) {
    for (const det of [-7, 6]) {
      const o = oscNode(A, f, 'sawtooth', midiFreq(n), t, dur + 0.2);
      o.detune.value = det;
    }
  }
  envAHR(g.gain, t, 0.015, peak / Math.sqrt(notes.length), dur, 0.18);
}

function grunt(A, dest, t, pitch = 130, peak = 0.35, len = 0.18) {
  // a short "uh!": a buzzy source through two vowel formants
  const g = gainNode(A, dest);
  const f1 = filterNode(A, g, 'bandpass', 640, 5);
  const f2 = filterNode(A, g, 'bandpass', 1150, 7);
  const o = oscNode(A, f1, 'sawtooth', pitch, t, len + 0.1);
  o.connect(f2);
  o.frequency.exponentialRampToValueAtTime(pitch * 0.78, t + len);
  envAHR(g.gain, t, 0.015, peak, len * 0.5, len * 0.6);
}

// ------------------------------------------------------------------ recipes
export const SFX = {
  punch(A, t, out, o) {
    const r = o.rate;
    blip(A, out, 'sine', 160 * r, 52 * r, t, 0.002, 0.95, 0.12, 0.09);
    burst(A, out, 'white', 'bandpass', 1900 * r, 1.1, t, 0.001, 0.65, 0.035);
    burst(A, out, 'pink', 'lowpass', 520, 0.8, t, 0.002, 0.7, 0.08);
    return 0.3;
  },

  hit(A, t, out, o) {
    const r = o.rate;
    blip(A, out, 'sine', 120 * r, 42 * r, t, 0.002, 1.0, 0.16, 0.12);
    burst(A, out, 'pink', 'lowpass', 700, 0.9, t, 0.002, 0.8, 0.1);
    burst(A, out, 'white', 'bandpass', 1300, 1.4, t, 0.001, 0.35, 0.03);
    grunt(A, out, t + 0.02, (95 + Math.random() * 55) * r, 0.28);
    return 0.4;
  },

  whoosh(A, t, out, o) {
    const g = gainNode(A, out);
    const f = filterNode(A, g, 'bandpass', 300, 0.9);
    f.frequency.setValueAtTime(320 * o.rate, t);
    f.frequency.exponentialRampToValueAtTime(1900 * o.rate, t + 0.1);
    f.frequency.exponentialRampToValueAtTime(500 * o.rate, t + 0.24);
    noiseNode(A, f, 'pink', t, 0.3);
    envAHR(g.gain, t, 0.07, 0.8, 0.02, 0.16);
    return 0.3;
  },

  step(A, t, out, o) {
    const r = o.rate * (0.9 + Math.random() * 0.2);
    burst(A, out, 'pink', 'lowpass', 1100 * r, 0.9, t, 0.002, 0.45, 0.045);
    blip(A, out, 'sine', 90 * r, 60 * r, t, 0.001, 0.35, 0.035);
    if (o.wet > 0.2) burst(A, out, 'white', 'bandpass', 3200 * r, 1.2, t + 0.01, 0.004, 0.22 * o.wet, 0.07);
    return 0.12;
  },

  spray(A, t, out, o) {
    // the rattle (can shake) then a "pssht"
    const rattle = !o.noRattle;
    for (let i = 0; rattle && i < 5; i++) {
      const at = t + i * 0.065 + Math.random() * 0.01;
      burst(A, out, 'white', 'bandpass', 4200 + Math.random() * 1200, 7, at, 0.001, 0.5, 0.018);
      blip(A, out, 'triangle', 2600 + Math.random() * 400, 0, at, 0.001, 0.08, 0.02);
    }
    const hs = rattle ? t + 0.38 : t;
    const g = gainNode(A, out);
    const hp = filterNode(A, g, 'highpass', 3200, 0.7);
    const pk = filterNode(A, hp, 'peaking', 7200, 1.2);
    pk.gain.value = 8;
    noiseNode(A, pk, 'white', hs, (o.dur || 0.45) + 0.1);
    envAHR(g.gain, hs, 0.012, 0.45, o.dur || 0.42, 0.09);
    return hs - t + (o.dur || 0.45) + 0.15;
  },

  door(A, t, out, o) {
    const r = o.rate;
    burst(A, out, 'brown', 'lowpass', 320 * r, 0.8, t, 0.002, 1.0, 0.16);
    blip(A, out, 'sine', 72 * r, 42 * r, t, 0.002, 0.8, 0.16);
    burst(A, out, 'white', 'highpass', 2600, 0.8, t + 0.008, 0.001, 0.45, 0.02);
    burst(A, out, 'pink', 'bandpass', 900 * r, 3, t + 0.01, 0.002, 0.3, 0.09);
    return 0.4;
  },

  horn(A, t, out, o) {
    const dur = o.dur || 0.42;
    const g = gainNode(A, out);
    const lp = filterNode(A, g, 'lowpass', 2800, 0.8);
    const pk = filterNode(A, lp, 'peaking', 1700, 2);
    pk.gain.value = 6;
    for (const f of [370, 466]) {
      oscNode(A, pk, 'sawtooth', f * o.rate, t, dur);
      oscNode(A, pk, 'square', f * o.rate * 1.003, t, dur);
    }
    envAHR(g.gain, t, 0.012, 0.16, dur, 0.05);
    return dur + 0.1;
  },

  pager(A, t, out) {
    // the classic belt pager: two bursts of four piercing square beeps
    const g = gainNode(A, out);
    const lp = filterNode(A, g, 'lowpass', 5200, 0.7);
    const o = oscNode(A, lp, 'square', 2900, t, 1.5);
    o.frequency.setValueAtTime(2900, t);
    g.gain.setValueAtTime(0, t);
    let at = t;
    for (let burstI = 0; burstI < 2; burstI++) {
      for (let i = 0; i < 4; i++) {
        g.gain.setValueAtTime(0.13, at);
        g.gain.setValueAtTime(0, at + 0.065);
        at += 0.11;
      }
      at += 0.26;
    }
    return 1.5;
  },

  cash(A, t, out) {
    // "cha-" (drawer + keys) "-ching" (bell)
    burst(A, out, 'white', 'bandpass', 1500, 1.2, t, 0.002, 0.45, 0.05);
    burst(A, out, 'pink', 'lowpass', 900, 0.8, t + 0.02, 0.002, 0.5, 0.07);
    const b = t + 0.08;
    const partials = [
      [2093, 0.3, 0.9],
      [2093 * 2.76, 0.12, 0.35],
      [2637, 0.22, 0.8],
      [2637 * 2.76, 0.08, 0.3],
      [2093 * 5.4, 0.05, 0.15],
    ];
    for (const [f, a, d] of partials) blip(A, out, 'sine', f, 0, b, 0.002, a, d);
    return 1.2;
  },

  ui_click(A, t, out) {
    blip(A, out, 'sine', 1800, 1100, t, 0.001, 0.28, 0.03, 0.03);
    burst(A, out, 'white', 'highpass', 5000, 0.7, t, 0.001, 0.12, 0.008);
    return 0.08;
  },

  ui_select(A, t, out) {
    blip(A, out, 'triangle', 880, 0, t, 0.003, 0.26, 0.07);
    blip(A, out, 'triangle', 1320, 0, t + 0.065, 0.003, 0.26, 0.12);
    blip(A, out, 'sine', 2640, 0, t + 0.065, 0.003, 0.05, 0.1);
    return 0.3;
  },

  ko(A, t, out, o) {
    const r = o.rate;
    blip(A, out, 'sine', 95 * r, 34 * r, t, 0.002, 1.0, 0.4, 0.3);
    burst(A, out, 'brown', 'lowpass', 300, 0.8, t, 0.002, 1.0, 0.3);
    burst(A, out, 'white', 'bandpass', 1500, 1, t, 0.001, 0.5, 0.05);
    // descending "whomp" and the body hitting the ground
    const g = gainNode(A, out);
    const lp = filterNode(A, g, 'lowpass', 900, 3);
    const s = oscNode(A, lp, 'sawtooth', 380 * r, t + 0.05, 0.6);
    s.frequency.exponentialRampToValueAtTime(90 * r, t + 0.6);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.6);
    envAHR(g.gain, t + 0.05, 0.03, 0.18, 0.3, 0.25);
    burst(A, out, 'pink', 'lowpass', 400, 0.8, t + 0.42, 0.003, 0.7, 0.12);
    return 0.9;
  },

  skid(A, t, out, o) {
    const dur = o.dur || 0.7;
    const g = gainNode(A, out);
    const lfo = A.ctx.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 3;
    const lfoG = A.ctx.createGain();
    lfoG.gain.value = 70;
    lfo.connect(lfoG);
    for (const [f, q] of [[1150, 14], [1720, 16], [2450, 12]]) {
      const bp = filterNode(A, g, 'bandpass', f * o.rate, q);
      lfoG.connect(bp.frequency);
      noiseNode(A, bp, 'white', t, dur + 0.3);
    }
    const tone = oscNode(A, filterNode(A, g, 'bandpass', 1150 * o.rate, 6), 'sawtooth', 1150 * o.rate, t, dur + 0.2);
    lfoG.connect(tone.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.4);
    envAHR(g.gain, t, 0.05, 0.9, dur, 0.22);
    return dur + 0.35;
  },

  crash(A, t, out, o) {
    const r = o.rate;
    const g = gainNode(A, out);
    const lp = filterNode(A, g, 'lowpass', 5000, 0.8);
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.45);
    noiseNode(A, lp, 'white', t, 0.8);
    envAD(g.gain, t, 0.002, 1.0, 0.55);
    blip(A, out, 'sine', 70 * r, 38 * r, t, 0.002, 1.0, 0.35);
    for (const f of [310, 747, 1201, 1873]) blip(A, out, 'triangle', f * r * (0.95 + Math.random() * 0.1), 0, t + 0.005, 0.002, 0.12, 0.25 + Math.random() * 0.35);
    for (let i = 0; i < 6; i++) burst(A, out, 'white', 'bandpass', 1500 + Math.random() * 3000, 3, t + 0.08 + Math.random() * 0.45, 0.001, 0.3, 0.03);
    if ((o.intensity ?? 1) > 0.55) SFX.glass(A, t + 0.02, out, { ...o, volume: 0.7 });
    return 1.1;
  },

  cheer(A, t, out) {
    for (let i = 0; i < 7; i++) {
      const at = t + Math.random() * 0.25;
      const g = gainNode(A, out);
      const bp = filterNode(A, g, 'bandpass', 700 + Math.random() * 900, 2.5);
      noiseNode(A, bp, 'pink', at, 2.2);
      envAHR(g.gain, at, 0.18, 0.22, 0.9 + Math.random() * 0.4, 0.7);
    }
    for (let i = 0; i < 3; i++) {
      // "whooo!" voices
      const at = t + 0.1 + Math.random() * 0.5;
      const g = gainNode(A, out);
      const f1 = filterNode(A, g, 'bandpass', 500, 4);
      const f2 = filterNode(A, g, 'bandpass', 900, 5);
      const s = oscNode(A, f1, 'sawtooth', 190 + Math.random() * 90, at, 1.1);
      s.connect(f2);
      s.frequency.linearRampToValueAtTime(320 + Math.random() * 120, at + 0.35);
      s.frequency.linearRampToValueAtTime(240, at + 1.0);
      envAHR(g.gain, at, 0.08, 0.12, 0.6, 0.35);
    }
    const w = t + 0.2;
    blip(A, out, 'sine', 1900, 2600, w, 0.02, 0.07, 0.5, 0.25);
    return 2.4;
  },

  bust(A, t, out) {
    // dramatic low stab + timpani, then a siren blip
    brassChord(A, out, [36, 42, 48, 51], t, 0.7, 0.4, 1800);
    blip(A, out, 'sine', 90, 55, t, 0.003, 0.9, 0.6, 0.4);
    burst(A, out, 'brown', 'lowpass', 250, 0.8, t, 0.003, 0.8, 0.4);
    SFX.siren_yelp(A, t + 0.5, out, { rate: 1, dur: 0.6 });
    return 1.6;
  },

  glass(A, t, out, o) {
    burst(A, out, 'white', 'highpass', 4200, 0.8, t, 0.001, 0.6 * (o.volume ?? 1), 0.12);
    for (let i = 0; i < 14; i++) {
      const at = t + Math.random() * Math.random() * 0.55;
      blip(A, out, 'sine', 2500 + Math.random() * 4500, 0, at, 0.001, 0.08 + Math.random() * 0.1, 0.04 + Math.random() * 0.25);
    }
    return 0.9;
  },

  engine_start(A, t, out) {
    // starter motor cranking, then the engine catches and revs
    for (let i = 0; i < 7; i++) {
      const at = t + i * 0.1;
      burst(A, out, 'pink', 'lowpass', 900, 1, at, 0.004, 0.45, 0.05);
      blip(A, out, 'sawtooth', 48, 40, at, 0.003, 0.18, 0.05);
    }
    const c = t + 0.72;
    const g = gainNode(A, out);
    const lp = filterNode(A, g, 'lowpass', 500, 2);
    const s1 = oscNode(A, lp, 'sawtooth', 32, c, 1.2);
    const s2 = oscNode(A, lp, 'square', 16, c, 1.2);
    for (const s of [s1, s2]) {
      const k = s === s1 ? 1 : 0.5;
      s.frequency.setValueAtTime(32 * k, c);
      s.frequency.exponentialRampToValueAtTime(95 * k, c + 0.25);
      s.frequency.exponentialRampToValueAtTime(40 * k, c + 0.9);
    }
    lp.frequency.setValueAtTime(400, c);
    lp.frequency.linearRampToValueAtTime(1500, c + 0.22);
    lp.frequency.setTargetAtTime(420, c + 0.3, 0.2);
    envAHR(g.gain, c, 0.03, 0.5, 0.6, 0.45);
    burst(A, out, 'brown', 'lowpass', 300, 0.8, c, 0.02, 0.6, 0.6);
    return 2.2;
  },

  tag_done(A, t, out) {
    SFX.spray(A, t, out, { rate: 1, dur: 0.22, noRattle: true });
    const c = t + 0.3;
    blip(A, out, 'triangle', 1047, 0, c, 0.004, 0.18, 0.35);
    blip(A, out, 'triangle', 1568, 0, c + 0.08, 0.004, 0.18, 0.45);
    blip(A, out, 'sine', 3136, 0, c + 0.08, 0.004, 0.05, 0.3);
    return 1.1;
  },

  mission_pass(A, t, out) {
    // 90s-style victory sting: bVI – bVII – I stabs with a bass run, then a sustained major chord
    const beat = 0.3;
    const stabs = [
      [[56, 60, 63, 68], 44],
      [[58, 62, 65, 70], 46],
      [[60, 64, 67, 72], 48],
    ];
    stabs.forEach(([notes, bass], i) => {
      const at = t + i * beat;
      brassChord(A, out, notes, at, i === 2 ? 1.4 : 0.16, 0.34, 3200);
      blip(A, out, 'square', midiFreq(bass - 12), 0, at, 0.004, 0.2, i === 2 ? 0.9 : 0.2);
      blip(A, out, 'sine', 150, 50, at, 0.002, 0.8, 0.14);
      burst(A, out, 'white', 'bandpass', 1800, 0.9, at, 0.001, i === 2 ? 0.55 : 0.4, 0.08);
    });
    const hit = t + beat * 2;
    burst(A, out, 'white', 'highpass', 5000, 0.7, hit, 0.002, 0.35, 1.4); // crash cymbal
    const arp = [72, 76, 79, 84];
    arp.forEach((n, i) => blip(A, out, 'square', midiFreq(n), 0, hit + 0.08 + i * 0.075, 0.003, 0.07, 0.35));
    return 2.6;
  },

  mission_fail(A, t, out) {
    // a heavy downer: Cm → Ab → Fm, with a falling bass
    const chords = [
      [[48, 51, 55], 36, 0.34],
      [[44, 48, 51], 32, 0.34],
      [[41, 44, 48, 53], 29, 1.3],
    ];
    let at = t;
    for (const [notes, bass, len] of chords) {
      brassChord(A, out, notes, at, len, 0.3, 1500);
      blip(A, out, 'sawtooth', midiFreq(bass), 0, at, 0.01, 0.16, len);
      blip(A, out, 'sine', 80, 50, at, 0.003, 0.7, 0.4);
      at += len === 1.3 ? 0 : 0.42;
    }
    return 2.4;
  },

  rank_up(A, t, out) {
    const notes = [67, 71, 74, 79, 83, 86];
    notes.forEach((n, i) => {
      const at = t + i * 0.07;
      blip(A, out, 'sine', midiFreq(n), 0, at, 0.003, 0.2, 0.6);
      blip(A, out, 'sine', midiFreq(n) * 3.01, 0, at, 0.002, 0.04, 0.25);
    });
    const g = gainNode(A, out);
    const hp = filterNode(A, g, 'highpass', 6000, 0.7);
    noiseNode(A, hp, 'white', t, 1.2);
    envAHR(g.gain, t, 0.3, 0.08, 0.2, 0.6);
    brassChord(A, out, [67, 71, 74, 79], t + 0.42, 0.9, 0.18, 3500);
    return 1.8;
  },

  siren_yelp(A, t, out, o) {
    const dur = o.dur || 0.75;
    const g = gainNode(A, out);
    const bp = filterNode(A, g, 'bandpass', 1300, 0.8);
    const s = oscNode(A, bp, 'square', 700, t, dur);
    let at = t;
    s.frequency.setValueAtTime(650, t);
    while (at < t + dur) {
      s.frequency.linearRampToValueAtTime(1550, at + 0.09);
      s.frequency.linearRampToValueAtTime(650, at + 0.16);
      at += 0.16;
    }
    envAHR(g.gain, t, 0.01, 0.3, dur, 0.06);
    return dur + 0.1;
  },

  // ---- extras (not in the contract list, used internally)
  thunder(A, t, out, o) {
    const near = o.intensity ?? 0.5;
    const len = 3 + (1 - near) * 3;
    if (near > 0.55) {
      burst(A, out, 'white', 'highpass', 1400, 0.7, t, 0.002, 0.6 * near, 0.25);
      blip(A, out, 'sine', 55, 30, t, 0.004, 0.9 * near, 0.8, 0.5);
    }
    const g = gainNode(A, out);
    const lp = filterNode(A, g, 'lowpass', 160 + near * 260, 0.7);
    noiseNode(A, lp, 'brown', t, len + 1, 0.8);
    const lp2 = filterNode(A, g, 'lowpass', 90, 0.9);
    noiseNode(A, lp2, 'brown', t, len + 1, 0.5);
    // rolling swells
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(0.9, t + 0.05 + (1 - near) * 0.5);
    let at = t + 0.4;
    while (at < t + len) {
      p.setTargetAtTime(0.35 + Math.random() * 0.6, at, 0.15);
      at += 0.25 + Math.random() * 0.5;
    }
    p.setTargetAtTime(0, t + len, 0.5);
    return len + 2;
  },

  static(A, t, out, o) {
    const dur = o.dur || 0.32;
    const g = gainNode(A, out);
    const bp = filterNode(A, g, 'bandpass', 2600, 0.6);
    noiseNode(A, bp, 'white', t, dur + 0.05);
    g.gain.setValueAtTime(0, t);
    for (let at = t; at < t + dur; at += 0.018) g.gain.setValueAtTime(0.12 + Math.random() * 0.28, at);
    g.gain.setValueAtTime(0, t + dur);
    blip(A, out, 'sine', 900 + Math.random() * 600, 2400 + Math.random() * 1200, t, 0.01, 0.04, dur, dur);
    return dur + 0.1;
  },
};
