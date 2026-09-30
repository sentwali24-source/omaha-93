import { Biquad, OnePole, fadeEnds, makeLoopable, midiFreq, normalize, prng, renderBuffer } from '../dsp.js';

// The radio's instrument samples, rendered once in plain JS (32 kHz mono) and then played back with
// AudioBufferSourceNodes: one node + one gain per note keeps the procedural radio cheap on phones.
//
//   drums   kick808 kickDusty kickSoft snare snareDusty clap rim snap hatC hatO shaker crash
//   pitched ep (FM electric piano) pluck (Karplus-Strong guitar) bass (fingered) pad (detuned saws,
//           looped sustain) brass (stabs) bell
//   beds    crackle (vinyl, loops)
//
// Pitched instruments are rendered at a few roots and re-pitched with playbackRate (≤ ±6 semitones).

const SR = 32000;
const TAU = Math.PI * 2;

const PITCHED = {
  ep: [40, 52, 64, 76],
  pluck: [40, 52, 64],
  bass: [28, 40],
  pad: [48, 60, 72],
  brass: [48, 60, 72],
  bell: [72, 84],
};

// ---------------------------------------------------------------- drum renderers
function metal(t, freqs) {
  let s = 0;
  for (const f of freqs) s += Math.sin(TAU * f * t) > 0 ? 1 : -1;
  return s / freqs.length;
}
const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.9);

const DRUMS = {
  kick808: (d, sr, rnd) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (42 + 120 * Math.exp(-t * 30))) / sr;
      const click = (rnd() * 2 - 1) * Math.exp(-t * 400) * 0.25;
      d[i] = Math.tanh((Math.sin(ph) * Math.exp(-t * 3.2) * Math.min(1, t * 500) + click) * 1.4);
    }
  },
  kickDusty: (d, sr, rnd) => {
    let ph = 0;
    const lp = new OnePole(4200, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (52 + 100 * Math.exp(-t * 38))) / sr;
      const click = (rnd() * 2 - 1) * Math.exp(-t * 250) * 0.4;
      d[i] = lp.process(Math.tanh((Math.sin(ph) * Math.exp(-t * 11) + click) * 2.2));
    }
  },
  kickSoft: (d, sr) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (48 + 70 * Math.exp(-t * 30))) / sr;
      d[i] = Math.sin(ph) * Math.exp(-t * 7.5) * Math.min(1, t * 300);
    }
  },
  snare: (d, sr, rnd) => {
    const hp = new Biquad('hp', 1800, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const n = hp.process(rnd() * 2 - 1) * Math.exp(-t * 17);
      const tone = Math.sin(TAU * 190 * t) * Math.exp(-t * 28) * 0.6 + Math.sin(TAU * 330 * t) * Math.exp(-t * 36) * 0.3;
      d[i] = n * 0.8 + tone;
    }
  },
  snareDusty: (d, sr, rnd) => {
    const bp = new Biquad('bp', 2300, 0.8, sr);
    const lp = new OnePole(5200, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const n = bp.process(rnd() * 2 - 1) * Math.exp(-t * 13) * 2.2;
      const tone = Math.sin(TAU * 180 * t) * Math.exp(-t * 22) * 0.7;
      d[i] = lp.process(Math.tanh((n + tone) * 1.6));
    }
  },
  clap: (d, sr, rnd) => {
    const bp = new Biquad('bp', 1150, 1.1, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let e = 0;
      for (const o of [0, 0.011, 0.023]) if (t >= o) e = Math.max(e, Math.exp(-(t - o) * 320));
      if (t >= 0.03) e = Math.max(e, 0.55 * Math.exp(-(t - 0.03) * 20));
      d[i] = bp.process(rnd() * 2 - 1) * e * 3;
    }
  },
  rim: (d, sr, rnd) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.sin(TAU * 1650 * t) * Math.exp(-t * 90) * 0.6 + Math.sin(TAU * 820 * t) * Math.exp(-t * 70) * 0.5 + (rnd() * 2 - 1) * Math.exp(-t * 250) * 0.3;
    }
  },
  snap: (d, sr, rnd) => {
    const bp = new Biquad('bp', 2300, 2, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = bp.process(rnd() * 2 - 1) * Math.exp(-t * 55) * 4;
    }
  },
  hatC: (d, sr, rnd) => {
    const hp = new Biquad('hp', 7500, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = hp.process((rnd() * 2 - 1) * 0.7 + metal(t, HAT_FREQS) * 0.5) * Math.exp(-t * 55);
    }
  },
  hatO: (d, sr, rnd) => {
    const hp = new Biquad('hp', 7000, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = hp.process((rnd() * 2 - 1) * 0.7 + metal(t, HAT_FREQS) * 0.5) * Math.exp(-t * 6.5);
    }
  },
  shaker: (d, sr, rnd) => {
    const bp = new Biquad('bp', 7500, 1.4, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const e = t < 0.015 ? t / 0.015 : Math.exp(-(t - 0.015) * 42);
      d[i] = bp.process(rnd() * 2 - 1) * e * 2;
    }
  },
  crash: (d, sr, rnd) => {
    const hp = new Biquad('hp', 4200, 0.6, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = hp.process((rnd() * 2 - 1) * 0.8 + metal(t, HAT_FREQS.map((f) => f * 0.63)) * 0.4) * Math.exp(-t * 2.1);
    }
  },
};

const DRUM_LEN = { kick808: 0.9, kickDusty: 0.35, kickSoft: 0.45, snare: 0.3, snareDusty: 0.38, clap: 0.35, rim: 0.08, snap: 0.12, hatC: 0.12, hatO: 0.55, shaker: 0.13, crash: 2.0 };

// ---------------------------------------------------------------- pitched renderers
function renderEP(d, sr, f) {
  const decay = 0.9 + f / 400;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 350) * (Math.exp(-t * decay) * 0.75 + Math.exp(-t * 4.5) * 0.25);
    const I = 1.3 * Math.exp(-t * 2.8) + 0.22;
    const m = Math.sin(TAU * f * t);
    const c = Math.sin(TAU * f * t + I * m);
    const tine = Math.sin(TAU * f * 7 * t) * Math.exp(-t * 22) * 0.18;
    d[i] = (Math.tanh(c * 1.4) * 0.8 + tine) * env;
  }
}

function renderPluck(d, sr, f, rnd) {
  // Karplus-Strong with a bright pick and a gentle loop filter
  const N = Math.max(2, Math.round(sr / f - 0.5));
  const line = new Float32Array(N);
  const lp = new OnePole(Math.min(9000, f * 14), sr);
  for (let i = 0; i < N; i++) line[i] = lp.process(rnd() * 2 - 1);
  let idx = 0;
  const damp = 0.9965 - f / 90000;
  for (let i = 0; i < d.length; i++) {
    const a = line[idx];
    const b = line[(idx + 1) % N];
    line[idx] = (a * 0.5 + b * 0.5) * damp;
    d[i] = a;
    idx = (idx + 1) % N;
  }
}

function renderBass(d, sr, f, rnd) {
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 400) * Math.exp(-t * 1.7);
    const p = TAU * f * t;
    const s = Math.sin(p) + 0.42 * Math.sin(2 * p) * Math.exp(-t * 5) + 0.2 * Math.sin(3 * p) * Math.exp(-t * 9) + 0.08 * Math.sin(4 * p) * Math.exp(-t * 14);
    d[i] = Math.tanh(s * env * 1.2) + (rnd() * 2 - 1) * Math.exp(-t * 350) * 0.15;
  }
}

function renderPad(d, sr, f, rnd) {
  const lp = new Biquad('lp', Math.min(2400, f * 7), 0.6, sr);
  const lp2 = new Biquad('lp', Math.min(2400, f * 7), 0.6, sr);
  const det = [1, 1.0045, 0.9953];
  const ph = det.map(() => rnd());
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      ph[k] += (f * det[k]) / sr;
      s += (ph[k] % 1) * 2 - 1;
    }
    const env = Math.min(1, t / 0.45);
    d[i] = lp2.process(lp.process(s / 3)) * env;
  }
}

function renderBrass(d, sr, f) {
  const lp = new Biquad('lp', 3000, 1.2, sr);
  let p1 = 0;
  let p2 = 0.5;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    if ((i & 31) === 0) lp.set('lp', 500 + 3200 * Math.exp(-t * 6) + f * 2, 1.2, sr);
    p1 += (f * 1.004) / sr;
    p2 += (f * 0.996) / sr;
    const s = ((p1 % 1) * 2 - 1 + (p2 % 1) * 2 - 1) * 0.5;
    const env = Math.min(1, t * 60) * (0.55 + 0.45 * Math.exp(-t * 5)) * Math.exp(-t * 1.2);
    d[i] = lp.process(s) * env;
  }
}

function renderBell(d, sr, f) {
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = (Math.sin(TAU * f * t) * Math.exp(-t * 2.2) + Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 5) * 0.35 + Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 11) * 0.15) * Math.min(1, t * 800);
  }
}

const PITCH_LEN = { ep: 3.0, pluck: 2.2, bass: 2.2, pad: 5.0, brass: 1.0, bell: 2.0 };
const PITCH_FN = { ep: renderEP, pluck: renderPluck, bass: renderBass, pad: renderPad, brass: renderBrass, bell: renderBell };

// ---------------------------------------------------------------- bank
export class SampleBank {
  constructor(ctx) {
    this.ctx = ctx;
    this.buffers = new Map();
    this.jobs = [];
    for (const name of Object.keys(DRUMS)) this.jobs.push(name);
    for (const [inst, roots] of Object.entries(PITCHED)) for (const r of roots) this.jobs.push(`${inst}@${r}`);
    this.jobs.push('crackle');
  }

  get done() {
    return this.jobs.length === 0;
  }

  /** Render queued samples until `budgetMs` is used up. */
  pump(budgetMs = 4) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < budgetMs) this._render(this.jobs.shift());
  }

  /** Render everything left right now (first radio use before the queue finished). */
  finish() {
    while (this.jobs.length) this._render(this.jobs.shift());
  }

  _render(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    const ctx = this.ctx;
    const rnd = prng(key.length * 977 + key.charCodeAt(0) * 31 + (key.charCodeAt(key.length - 1) || 0));
    let buf;
    if (DRUMS[key]) {
      buf = renderBuffer(ctx, DRUM_LEN[key], ([d], sr) => {
        DRUMS[key](d, sr, rnd);
        normalize([d], 0.9);
        fadeEnds(d, sr, 0.004);
      }, { sampleRate: SR });
    } else if (key === 'crackle') {
      buf = renderBuffer(ctx, 4, ([d], sr, len) => {
        const lp = new OnePole(5000, sr);
        for (let i = 0; i < len; i++) d[i] = lp.process(rnd() * 2 - 1) * 0.03;
        const clicks = 4 * 26;
        for (let c = 0; c < clicks; c++) {
          const at = Math.floor(rnd() * (len - 60));
          const a = Math.pow(rnd(), 3) * (rnd() > 0.5 ? 1 : -1);
          for (let k = 0; k < 40; k++) d[at + k] += a * Math.exp(-k / 5);
        }
        makeLoopable(d, sr, 0.1);
        normalize([d], 0.5);
      }, { sampleRate: SR });
    } else {
      const [inst, root] = key.split('@');
      const f = midiFreq(Number(root));
      buf = renderBuffer(ctx, PITCH_LEN[inst], ([d], sr) => {
        PITCH_FN[inst](d, sr, f, rnd);
        normalize([d], 0.85);
        if (inst === 'pad') {
          // loop the sustain (1.2 s .. end) so pads can hold any chord length
          const start = Math.floor(sr * 1.2);
          makeLoopable(d.subarray(start), sr, 0.6);
        } else fadeEnds(d, sr, 0.003);
      }, { sampleRate: SR });
      if (inst === 'pad') {
        buf.loopStart = 1.2;
        buf.loopEnd = PITCH_LEN.pad - 0.6;
      }
    }
    this.buffers.set(key, buf);
    const i = this.jobs.indexOf(key);
    if (i >= 0) this.jobs.splice(i, 1);
    return buf;
  }

  drum(name) {
    return this.buffers.get(name) || this._render(name);
  }

  /** Nearest rendered root for a midi note → { buffer, rate, loopStart?, loopEnd? }. */
  pitched(inst, note, out = {}) {
    const roots = PITCHED[inst];
    let best = roots[0];
    for (const r of roots) if (Math.abs(r - note) < Math.abs(best - note)) best = r;
    const key = `${inst}@${best}`;
    out.buffer = this.buffers.get(key) || this._render(key);
    out.rate = Math.pow(2, (note - best) / 12);
    return out;
  }
}
