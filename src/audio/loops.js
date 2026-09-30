import { driveCurve } from './dsp.js';
import { gainNode, filterNode, oscNode, noiseNode } from './sfx.js';

// Continuous sounds. Each factory is (A, dest, opts) → voice with at least
//   setVolume(v), setRate(r), stop(fade)
// Audio.js wraps a voice in a public handle (adds setPosition + distance/pan) — see Audio.loop().
//
// engine  oscillators + filtered noise; setRate(rpm 0..1, or real rpm > 3), setLoad(throttle 0..1)
// siren   wail / yelp electronic siren; setMode('wail' | 'yelp')
// rain    pre-rendered rain bed; setMuffle(0..1) for "inside the car"
// crowd   pre-rendered murmur bed
// spray   spray-can hiss with flutter
// horn    held two-tone horn (internal: player car)
// skid    tire squeal (internal: player car)

const LONG = 1e6; // oscillators run until stop()

function ramp(param, v, t, tc = 0.05) {
  param.cancelScheduledValues(t);
  param.setTargetAtTime(v, t, tc);
}

function stopAll(A, mix, sources, fade) {
  const t = A.ctx.currentTime;
  ramp(mix.gain, 0, t, Math.max(0.01, fade / 4));
  for (const s of sources) {
    try {
      s.stop(t + fade + 0.1);
    } catch {
      /* already stopped */
    }
  }
  setTimeout(() => mix.disconnect(), (fade + 0.3) * 1000);
}

export const LOOPS = {
  engine(A, dest, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime;
    const mix = gainNode(A, dest, 0);
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(2.4);
    shaper.connect(mix);
    const lp = filterNode(A, shaper, 'lowpass', 500, 1.6);
    const am = gainNode(A, lp, 0.85); // "lumpy" amplitude modulation at half the firing rate
    const g1 = gainNode(A, am, 0.5);
    const g2 = gainNode(A, am, 0.4);
    const g3 = gainNode(A, am, 0.1);
    const gN = gainNode(A, am, 0.3);
    const o1 = oscNode(A, g1, 'sawtooth', 40, t, LONG);
    const o2 = oscNode(A, g2, 'square', 20, t, LONG);
    const o3 = oscNode(A, g3, 'sawtooth', 80, t, LONG);
    o3.detune.value = 9;
    const bp = filterNode(A, gN, 'bandpass', 160, 1.1);
    const n = noiseNode(A, bp, 'brown', t, LONG, 1);
    const lfo = oscNode(A, gainNode(A, am.gain, 0.28), 'sine', 20, t, LONG);
    const wob = oscNode(A, gainNode(A, o1.detune, 14), 'sine', 0.7 + Math.random() * 0.4, t, LONG);
    const srcs = [o1, o2, o3, n, lfo, wob];
    let rate = 0;
    let load = 0.3;
    const apply = () => {
      const now = ctx.currentTime;
      const f0 = 38 + 112 * rate;
      ramp(o1.frequency, f0, now);
      ramp(o2.frequency, f0 * 0.5, now);
      ramp(o3.frequency, f0 * 2, now);
      ramp(lfo.frequency, f0 * 0.5, now);
      ramp(bp.frequency, f0 * 3.2, now);
      ramp(lp.frequency, 260 + 700 * rate + 1500 * load * (0.3 + rate), now, 0.08);
      ramp(gN.gain, 0.18 + 0.45 * load, now, 0.08);
    };
    apply();
    const v = {
      volume: o.volume ?? 1,
      setVolume(x) {
        v.volume = x;
        ramp(mix.gain, 0.3 * x, ctx.currentTime, 0.06);
      },
      setRate(r) {
        rate = r > 3 ? Math.min(1, Math.max(0, (r - 700) / 6000)) : Math.min(1.2, Math.max(0, r));
        apply();
      },
      setLoad(l) {
        load = Math.min(1, Math.max(0, l));
        apply();
      },
      stop(fade = 0.3) {
        stopAll(A, mix, srcs, fade);
      },
    };
    v.setVolume(v.volume);
    return v;
  },

  siren(A, dest, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime;
    const mix = gainNode(A, dest, 0);
    const bp = filterNode(A, mix, 'bandpass', 1300, 0.7);
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(1.6);
    shaper.connect(bp);
    const s1 = oscNode(A, shaper, 'square', 1000, t, LONG);
    const s2 = oscNode(A, shaper, 'sawtooth', 1000, t, LONG);
    s2.detune.value = 12;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    const depth = ctx.createGain();
    lfo.connect(depth);
    depth.connect(s1.frequency);
    depth.connect(s2.frequency);
    lfo.start(t);
    const srcs = [s1, s2, lfo];
    const v = {
      mode: null,
      setMode(m) {
        if (m === v.mode) return;
        v.mode = m;
        const now = ctx.currentTime;
        const yelp = m === 'yelp';
        ramp(lfo.frequency, yelp ? 3.3 : 0.23, now, 0.02);
        ramp(depth.gain, yelp ? 430 : 400, now, 0.02);
        ramp(s1.frequency, yelp ? 1080 : 1000, now, 0.02);
        ramp(s2.frequency, yelp ? 1080 : 1000, now, 0.02);
      },
      setVolume(x) {
        ramp(mix.gain, 0.22 * x, ctx.currentTime, 0.05);
      },
      setRate(r) {
        lfo.frequency.setTargetAtTime((v.mode === 'yelp' ? 3.3 : 0.23) * r, ctx.currentTime, 0.05);
      },
      stop(fade = 0.4) {
        stopAll(A, mix, srcs, fade);
      },
    };
    v.setMode(o.mode || 'wail');
    v.setVolume(o.volume ?? 1);
    return v;
  },

  rain(A, dest, o = {}) {
    return bufferLoop(A, dest, 'rain', o, 0.9);
  },

  crowd(A, dest, o = {}) {
    return bufferLoop(A, dest, 'crowd', o, 0.8);
  },

  spray(A, dest, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime;
    const mix = gainNode(A, dest, 0);
    const flutter = gainNode(A, mix, 0.8);
    const pk = filterNode(A, flutter, 'peaking', 7000, 1.1);
    pk.gain.value = 7;
    const hp = filterNode(A, pk, 'highpass', 3000, 0.7);
    const n = noiseNode(A, hp, 'white', t, LONG);
    const lfo = oscNode(A, gainNode(A, flutter.gain, 0.2), 'sine', 11, t, LONG);
    const v = {
      setVolume(x) {
        ramp(mix.gain, 0.35 * x, ctx.currentTime, 0.02);
      },
      setRate(r) {
        n.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.05);
      },
      stop(fade = 0.08) {
        stopAll(A, mix, [n, lfo], fade);
      },
    };
    v.setVolume(o.volume ?? 1);
    return v;
  },

  horn(A, dest, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime;
    const mix = gainNode(A, dest, 0);
    const lp = filterNode(A, mix, 'lowpass', 2800, 0.8);
    const pk = filterNode(A, lp, 'peaking', 1700, 2);
    pk.gain.value = 6;
    const srcs = [];
    const pitch = o.rate || 1;
    for (const f of [370, 466]) {
      srcs.push(oscNode(A, pk, 'sawtooth', f * pitch, t, LONG));
      srcs.push(oscNode(A, pk, 'square', f * pitch * 1.003, t, LONG));
    }
    const v = {
      setVolume(x) {
        ramp(mix.gain, 0.15 * x, ctx.currentTime, 0.006);
      },
      setRate() {},
      stop(fade = 0.05) {
        stopAll(A, mix, srcs, fade);
      },
    };
    v.setVolume(o.volume ?? 1);
    return v;
  },

  skid(A, dest, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime;
    const mix = gainNode(A, dest, 0);
    const lfoG = ctx.createGain(); // wobble of the squeal pitch
    lfoG.gain.value = 60;
    const lfo = oscNode(A, lfoG, 'sine', 8, t, LONG);
    const srcs = [lfo];
    const filters = [];
    for (const [f, q] of [[1150, 14], [1720, 16], [2450, 12]]) {
      const bp = filterNode(A, mix, 'bandpass', f, q);
      lfoG.connect(bp.frequency);
      srcs.push(noiseNode(A, bp, 'white', t, LONG));
      filters.push([bp, f]);
    }
    const v = {
      setVolume(x) {
        ramp(mix.gain, 0.8 * x, ctx.currentTime, 0.04);
      },
      setRate(r) {
        const now = ctx.currentTime;
        for (const [bp, f] of filters) ramp(bp.frequency, f * r, now, 0.05);
      },
      stop(fade = 0.2) {
        stopAll(A, mix, srcs, fade);
      },
    };
    v.setVolume(o.volume ?? 0);
    return v;
  },
};

/** A looping pre-rendered bed with a muffle lowpass (rain on the car roof, crowd behind walls). */
function bufferLoop(A, dest, name, o, level) {
  const ctx = A.ctx;
  const mix = gainNode(A, dest, 0);
  const lp = filterNode(A, mix, 'lowpass', 16000, 0.5);
  const s = ctx.createBufferSource();
  s.buffer = A.bed(name);
  s.loop = true;
  s.connect(lp);
  s.start(ctx.currentTime, Math.random() * Math.max(0, s.buffer.duration - 0.5));
  const v = {
    setVolume(x) {
      ramp(mix.gain, level * x, ctx.currentTime, 0.2);
    },
    setRate(r) {
      s.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.1);
    },
    setMuffle(m) {
      ramp(lp.frequency, 16000 * Math.pow(1 - Math.min(0.95, m), 2.2) + 300, ctx.currentTime, 0.15);
    },
    stop(fade = 0.5) {
      stopAll(A, mix, [s], fade);
    },
  };
  v.setVolume(o.volume ?? 1);
  return v;
}
