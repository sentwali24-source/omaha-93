// Small DSP toolbox shared by the synthesized sound effects, ambience beds and radio instruments.
//
// Two halves:
//  * offline helpers that fill Float32Arrays in plain JS (deterministic PRNG, one-pole and biquad
//    filters, envelopes) — used to pre-render noise, loops and instrument samples once;
//  * WebAudio helpers for scheduling live nodes (envelopes on AudioParams, one-liner oscillators).

export const midiFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Deterministic PRNG (mulberry32) → float in [0, 1). */
export function prng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------ offline

/** Create an AudioBuffer and let fill(channels[], sampleRate, length) write into it. */
export function renderBuffer(ctx, seconds, fill, { channels = 1, sampleRate = ctx.sampleRate } = {}) {
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const buf = ctx.createBuffer(channels, length, sampleRate);
  const data = [];
  for (let c = 0; c < channels; c++) data.push(buf.getChannelData(c));
  fill(data, sampleRate, length);
  return buf;
}

/** RBJ biquad for offline use. type: 'lp' | 'hp' | 'bp' (constant peak gain). */
export class Biquad {
  constructor(type, freq, q, sr) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, freq, q, sr);
  }

  set(type, freq, q, sr) {
    const w = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr;
    const cs = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (type === 'lp') {
      b0 = (1 - cs) / 2;
      b1 = 1 - cs;
      b2 = (1 - cs) / 2;
    } else if (type === 'hp') {
      b0 = (1 + cs) / 2;
      b1 = -(1 + cs);
      b2 = (1 + cs) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** One-pole lowpass (cheap smoothing). */
export class OnePole {
  constructor(freq, sr) {
    this.y = 0;
    this.set(freq, sr);
  }

  set(freq, sr) {
    this.a = 1 - Math.exp((-2 * Math.PI * freq) / sr);
  }

  process(x) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

/** Fill `out` with white / pink / brown noise. */
export function fillNoise(out, kind = 'white', rnd = Math.random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rnd() * 2 - 1;
    if (kind === 'pink') {
      // Paul Kellet's economy pink filter
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    } else {
      out[i] = w;
    }
  }
  return out;
}

/** Normalize a buffer's channels to a peak value. */
export function normalize(data, peak = 0.9) {
  let m = 0;
  for (const ch of data) for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i]));
  if (m < 1e-9) return;
  const k = peak / m;
  for (const ch of data) for (let i = 0; i < ch.length; i++) ch[i] *= k;
}

/** Short fades at both ends so a buffer loops / starts without clicks. */
export function fadeEnds(ch, sr, seconds = 0.01) {
  const n = Math.min(Math.floor(sr * seconds), Math.floor(ch.length / 2));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    ch[i] *= k;
    ch[ch.length - 1 - i] *= k;
  }
}

/** Crossfade the tail into the head so a bed loops seamlessly (length shrinks by `seconds`). */
export function makeLoopable(ch, sr, seconds = 0.25) {
  const n = Math.floor(sr * seconds);
  const len = ch.length;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    ch[i] = ch[i] * k + ch[len - n + i] * (1 - k);
  }
  for (let i = len - n; i < len; i++) ch[i] = ch[i - (len - n)];
}

// ------------------------------------------------------------------------------------ live

/** Attack / decay envelope on an AudioParam: 0 → peak in `a`, then exponential-ish decay. */
export function envAD(param, t, a, peak, decay, floor = 0) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  param.setTargetAtTime(floor, t + a, Math.max(0.001, decay / 4));
}

/** Attack / hold / release envelope (linear). */
export function envAHR(param, t, a, peak, hold, r) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  param.setValueAtTime(peak, t + a + hold);
  param.linearRampToValueAtTime(0, t + a + hold + Math.max(0.005, r));
}

/** Soft-clip curve for WaveShaperNodes. */
export function driveCurve(amount = 2, n = 1024) {
  const c = new Float32Array(n);
  const k = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * amount) / k;
  }
  return c;
}

/** Stereo impulse response: decaying filtered noise (street reverb). */
export function impulseResponse(ctx, seconds = 1.4, decay = 3.2, seed = 7) {
  const rnd = prng(seed);
  return renderBuffer(
    ctx,
    seconds,
    (data, sr, len) => {
      for (const ch of data) {
        const lp = new OnePole(5200, sr);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          // a couple of early reflections (building faces across the street), then a tail
          const early = i === Math.floor(sr * 0.019) || i === Math.floor(sr * 0.041) ? 0.6 : 0;
          ch[i] = lp.process(rnd() * 2 - 1) * Math.pow(1 - t, decay) * 0.8 + early * (rnd() > 0.5 ? 1 : -1);
        }
      }
    },
    { channels: 2 }, // a ConvolverNode buffer must match the context rate
  );
}
