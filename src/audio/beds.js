import { Biquad, OnePole, fillNoise, makeLoopable, normalize, prng, renderBuffer } from './dsp.js';

// Pre-rendered, seamlessly looping ambience beds (stereo, 24 kHz). Rendering them once in JS is far
// cheaper at runtime than running the equivalent live node graphs, which matters on phones.
// Each renderer: (ctx) → AudioBuffer. Audio.js renders them lazily, one per frame.

const SR = 24000;
const opts = { channels: 2, sampleRate: SR };

function pan(p) {
  // equal-power gains for p in -1..1
  const a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

export const BEDS = {
  /** Steady hiss plus thousands of individual drops ticking on pavement, cars and leaves. */
  rain(ctx) {
    const rnd = prng(11);
    return renderBuffer(
      ctx,
      5,
      ([L, R], sr, len) => {
        const n = new Float32Array(len);
        fillNoise(n, 'pink', rnd);
        const hp = new Biquad('hp', 450, 0.7, sr);
        const lp = new Biquad('lp', 6500, 0.7, sr);
        const hp2 = new Biquad('hp', 450, 0.7, sr);
        const lp2 = new Biquad('lp', 6500, 0.7, sr);
        const n2 = new Float32Array(len);
        fillNoise(n2, 'pink', rnd);
        for (let i = 0; i < len; i++) {
          L[i] = lp.process(hp.process(n[i])) * 0.5;
          R[i] = lp2.process(hp2.process(n2[i])) * 0.5;
        }
        const drops = Math.floor(len / sr) * 320;
        for (let d = 0; d < drops; d++) {
          const at = Math.floor(rnd() * (len - 400));
          const f = 1400 + rnd() * 5200;
          const dec = 0.002 + rnd() * 0.006;
          const amp = Math.pow(rnd(), 2.2) * 0.9;
          const [gl, gr] = pan(rnd() * 2 - 1);
          const w = (2 * Math.PI * f) / sr;
          const k = Math.exp(-1 / (dec * sr));
          let e = amp;
          for (let i = 0; i < 300 && e > 0.001; i++) {
            const s = Math.sin(w * i) * e * (rnd() * 0.6 + 0.4);
            L[at + i] += s * gl;
            R[at + i] += s * gr;
            e *= k;
          }
        }
        makeLoopable(L, sr, 0.3);
        makeLoopable(R, sr, 0.3);
        normalize([L, R], 0.8);
      },
      opts,
    );
  },

  /** Murmuring crowd: a dozen "voices" of formant-filtered syllables. */
  crowd(ctx) {
    const rnd = prng(23);
    return renderBuffer(
      ctx,
      6,
      ([L, R], sr, len) => {
        for (let v = 0; v < 12; v++) {
          const pitch = 100 + rnd() * 140;
          const [gl, gr] = pan(rnd() * 1.6 - 0.8);
          const f1 = new Biquad('bp', 500, 4, sr);
          const f2 = new Biquad('bp', 1400, 5, sr);
          let i = Math.floor(rnd() * sr * 0.3);
          let phase = 0;
          while (i < len) {
            const syl = Math.floor((0.08 + rnd() * 0.18) * sr);
            f1.set('bp', 300 + rnd() * 500, 4, sr);
            f2.set('bp', 900 + rnd() * 1300, 5, sr);
            const p = pitch * (0.9 + rnd() * 0.25);
            const amp = 0.4 + rnd() * 0.6;
            for (let k = 0; k < syl && i + k < len; k++) {
              phase += p / sr;
              const src = (phase % 1) * 2 - 1 + (rnd() * 2 - 1) * 0.3;
              const env = Math.sin((Math.PI * k) / syl) * amp;
              const s = (f1.process(src) + f2.process(src) * 0.6) * env;
              L[i + k] += s * gl;
              R[i + k] += s * gr;
            }
            i += syl + Math.floor(rnd() * rnd() * 0.35 * sr);
          }
        }
        const lpL = new OnePole(2600, sr);
        const lpR = new OnePole(2600, sr);
        for (let i = 0; i < len; i++) {
          L[i] = lpL.process(L[i]);
          R[i] = lpR.process(R[i]);
        }
        makeLoopable(L, sr, 0.4);
        makeLoopable(R, sr, 0.4);
        normalize([L, R], 0.7);
      },
      opts,
    );
  },

  /** A field of crickets: pulsed chirps near 4–5 kHz at different rates, near and far. */
  crickets(ctx) {
    const rnd = prng(31);
    return renderBuffer(
      ctx,
      8,
      ([L, R], sr, len) => {
        for (let c = 0; c < 9; c++) {
          const f = 3900 + rnd() * 1300;
          const far = c > 4;
          const amp = far ? 0.12 + rnd() * 0.1 : 0.35 + rnd() * 0.3;
          const [gl, gr] = pan(rnd() * 2 - 1);
          const period = 0.45 + rnd() * 0.5;
          const pulses = 2 + Math.floor(rnd() * 3);
          const pulseLen = Math.floor(0.011 * sr);
          const gap = Math.floor(0.036 * sr);
          const w = (2 * Math.PI * f) / sr;
          let t = rnd() * period;
          while (t * sr < len - sr * 0.3) {
            const start = Math.floor(t * sr);
            for (let p = 0; p < pulses; p++) {
              const s0 = start + p * (pulseLen + gap);
              for (let k = 0; k < pulseLen; k++) {
                const e = Math.sin((Math.PI * k) / pulseLen);
                const s = Math.sin(w * (s0 + k)) * e * e * amp;
                L[s0 + k] += s * gl;
                R[s0 + k] += s * gr;
              }
            }
            t += period * (0.92 + rnd() * 0.16);
          }
        }
        makeLoopable(L, sr, 0.2);
        makeLoopable(R, sr, 0.2);
        normalize([L, R], 0.6);
      },
      opts,
    );
  },

  /** Dog-day cicadas: buzzing swells that rise and fall from the trees. */
  cicadas(ctx) {
    const rnd = prng(47);
    return renderBuffer(
      ctx,
      12,
      ([L, R], sr, len) => {
        const n = new Float32Array(len);
        for (let c = 0; c < 3; c++) {
          fillNoise(n, 'white', rnd);
          const bp = new Biquad('bp', 4600 + rnd() * 1100, 3.5, sr);
          const buzz = 140 + rnd() * 60;
          const [gl, gr] = pan(rnd() * 1.6 - 0.8);
          const start = rnd() * 4;
          const rise = 2 + rnd();
          const hold = 2.5 + rnd() * 2;
          const fall = 1.5 + rnd();
          for (let i = 0; i < len; i++) {
            let t = i / sr - start;
            if (t < 0) t += len / sr;
            let e = 0;
            if (t < rise) e = t / rise;
            else if (t < rise + hold) e = 1;
            else if (t < rise + hold + fall) e = 1 - (t - rise - hold) / fall;
            if (e <= 0) {
              bp.process(n[i]);
              continue;
            }
            const am = Math.pow(Math.abs(Math.sin(Math.PI * buzz * (i / sr))), 3);
            const s = bp.process(n[i]) * am * e * e * 0.8;
            L[i] += s * gl;
            R[i] += s * gr;
          }
        }
        makeLoopable(L, sr, 0.5);
        makeLoopable(R, sr, 0.5);
        normalize([L, R], 0.55);
      },
      opts,
    );
  },

  /** Distant city traffic: a low rumble with cars swelling past a few blocks away. */
  traffic(ctx) {
    const rnd = prng(59);
    return renderBuffer(
      ctx,
      10,
      ([L, R], sr, len) => {
        const n = new Float32Array(len);
        fillNoise(n, 'brown', rnd);
        const lp = new Biquad('lp', 260, 0.7, sr);
        for (let i = 0; i < len; i++) {
          const s = lp.process(n[i]) * 0.9;
          L[i] = s;
          R[i] = s;
        }
        for (let c = 0; c < 6; c++) {
          fillNoise(n, 'pink', rnd);
          const bp = new Biquad('bp', 400, 1.2, sr);
          const start = rnd() * 10;
          const dur = 3 + rnd() * 2.5;
          const dir = rnd() > 0.5 ? 1 : -1;
          const amp = 0.35 + rnd() * 0.4;
          for (let i = 0; i < len; i++) {
            let t = i / sr - start;
            if (t < 0) t += len / sr;
            if (t > dur) continue;
            const u = t / dur;
            const e = Math.sin(Math.PI * u) ** 2 * amp;
            if ((i & 63) === 0) bp.set('bp', 250 + 500 * Math.sin(Math.PI * u), 1.2, sr);
            const s = bp.process(n[i]) * e;
            const [gl, gr] = pan(dir * (u * 1.6 - 0.8));
            L[i] += s * gl;
            R[i] += s * gr;
          }
        }
        makeLoopable(L, sr, 0.5);
        makeLoopable(R, sr, 0.5);
        normalize([L, R], 0.7);
      },
      opts,
    );
  },

  /** Wind in the wires and trees: slow gusts of band-limited noise. */
  wind(ctx) {
    const rnd = prng(71);
    return renderBuffer(
      ctx,
      10,
      ([L, R], sr, len) => {
        const n = new Float32Array(len);
        for (const [ch, seed] of [[L, 0], [R, 1]]) {
          fillNoise(n, 'pink', rnd);
          const bp = new Biquad('bp', 500, 0.9, sr);
          const ph = seed * 1.7 + rnd() * 3;
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            const gust = 0.35 + 0.35 * Math.sin((t / 10) * Math.PI * 2 * 2 + ph) + 0.3 * Math.sin((t / 10) * Math.PI * 2 * 3 + ph * 2);
            if ((i & 127) === 0) bp.set('bp', 350 + 500 * Math.max(0, gust), 0.9, sr);
            ch[i] = bp.process(n[i]) * Math.max(0.05, gust);
          }
        }
        makeLoopable(L, sr, 0.5);
        makeLoopable(R, sr, 0.5);
        normalize([L, R], 0.7);
      },
      opts,
    );
  },
};
