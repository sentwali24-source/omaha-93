// Weather: clear / overcast / rain / thunderstorm.
//
// Summer 1993 was the wettest on record in Omaha (rain on 34 of 57 days, June 1 – July 27), so the
// scheduler brings rain around regularly — but a first play session always opens on a clear golden
// hour, and the title screen stays clear with scattered clouds.
//
// `params` are smoothed toward the current kind's targets so changes roll in over ~20–40 s.
// Lightning strikes are emitted as 'weather:lightning' { distance, intensity, dirX, dirZ }; Audio
// turns them into thunder with the right delay.

import { damp } from '../../core/math.js';

export const WEATHER_KINDS = ['clear', 'overcast', 'rain', 'thunderstorm'];

// cover: cloud cover 0..1   dark: storm darkness 0..1   rain: 0..1   fog: fog distance multiplier
// sun: direct light multiplier   storm: lightning on/off
const TARGETS = {
  clear: { cover: 0.3, dark: 0.0, rain: 0.0, fog: 1.0, sun: 1.0, storm: 0 },
  overcast: { cover: 0.9, dark: 0.35, rain: 0.0, fog: 0.8, sun: 0.3, storm: 0 },
  rain: { cover: 1.0, dark: 0.62, rain: 0.62, fog: 0.52, sun: 0.12, storm: 0 },
  thunderstorm: { cover: 1.0, dark: 0.86, rain: 1.0, fog: 0.42, sun: 0.06, storm: 1 },
};

// Markov chain: next kind weights + how long (real seconds) each kind lasts.
const NEXT = {
  clear: [['overcast', 0.78], ['rain', 0.22]],
  overcast: [['rain', 0.55], ['clear', 0.45]],
  rain: [['overcast', 0.45], ['thunderstorm', 0.3], ['clear', 0.25]],
  thunderstorm: [['rain', 0.8], ['overcast', 0.2]],
};
const DURATION = {
  clear: [150, 320],
  overcast: [70, 160],
  rain: [70, 170],
  thunderstorm: [50, 110],
};

const rand = (a, b) => a + Math.random() * (b - a);

function weighted(list) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = Math.random() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[list.length - 1][0];
}

export class Weather {
  constructor(game) {
    this.game = game;
    this.kind = 'clear';
    this.params = { ...TARGETS.clear };
    this.wetness = 0; // ground wetness, lags behind the rain (dries slowly)
    this.timer = rand(160, 300); // first change: give the player their golden hour
    this.locked = false; // true = the scheduler never changes the kind (tests, ?weather=)
    this.flash = 0; // lightning brightness 0..1+
    this.flashDir = { x: 0, y: 0.4, z: -1 };
    this._pulses = []; // [{ at, amp }] seconds from strike
    this._strikeT = 0;
    this._nextStrike = rand(4, 10);
    this._coverDrift = Math.random() * 100; // clear skies still vary: 15%..45% cloud
  }

  /** Change weather. { immediate } snaps the look, { lock } stops the scheduler. */
  set(kind, { immediate = false, lock = null, duration = null } = {}) {
    if (!TARGETS[kind]) return false;
    const changed = kind !== this.kind;
    this.kind = kind;
    if (lock !== null) this.locked = !!lock;
    const [a, b] = DURATION[kind];
    this.timer = duration ?? rand(a, b);
    if (immediate) {
      Object.assign(this.params, TARGETS[kind]);
      if (kind === 'clear') this.params.cover = this._clearCover();
      this.wetness = TARGETS[kind].rain > 0 ? 1 : 0;
    }
    if (kind === 'thunderstorm') this._nextStrike = immediate ? 1.5 : rand(6, 12);
    if (changed || immediate) this.game.events.emit('weather:change', { weather: kind });
    return true;
  }

  _clearCover() {
    // slow drift so a clear evening has a few clouds to catch the sunset
    return 0.3 + 0.14 * Math.sin(this._coverDrift * 0.013) + 0.06 * Math.sin(this._coverDrift * 0.047);
  }

  /** Trigger a lightning strike now (also used by the debug API). */
  strike(distance = rand(250, 2600)) {
    const a = Math.random() * Math.PI * 2;
    this.flashDir.x = Math.cos(a);
    this.flashDir.z = Math.sin(a);
    this.flashDir.y = rand(0.12, 0.5);
    const len = Math.hypot(this.flashDir.x, this.flashDir.y, this.flashDir.z);
    this.flashDir.x /= len;
    this.flashDir.y /= len;
    this.flashDir.z /= len;
    const near = 1 - Math.min(1, distance / 2800);
    const amp = 0.45 + 0.75 * near;
    this._pulses.length = 0;
    this._pulses.push({ at: 0, amp });
    this._pulses.push({ at: rand(0.07, 0.12), amp: amp * rand(0.25, 0.5) });
    if (Math.random() < 0.7) this._pulses.push({ at: rand(0.18, 0.32), amp: amp * rand(0.6, 1.0) });
    this._strikeT = 0;
    this.game.events.emit('weather:lightning', { distance, intensity: near, dirX: this.flashDir.x, dirZ: this.flashDir.z });
  }

  update(dt, { attract = false } = {}) {
    const p = this.params;
    this._coverDrift += dt;

    if (attract) {
      // title screen: always a clear evening with scattered clouds
      if (this.kind !== 'clear') this.set('clear');
      this.timer = 1e9;
    } else if (!this.locked) {
      this.timer -= dt;
      if (this.timer <= 0) this.set(weighted(NEXT[this.kind]));
    }

    // smooth toward the target look
    const t = TARGETS[this.kind];
    const k = 0.07; // ~ 1/14 s-1: most of a change happens in 25–35 s
    p.cover = damp(p.cover, this.kind === 'clear' ? this._clearCover() : t.cover, k, dt);
    p.dark = damp(p.dark, t.dark, k, dt);
    p.rain = damp(p.rain, t.rain, t.rain > p.rain ? 0.12 : 0.09, dt);
    p.fog = damp(p.fog, t.fog, k, dt);
    p.sun = damp(p.sun, t.sun, k, dt);
    p.storm = damp(p.storm, t.storm, 0.2, dt);
    // ground gets wet in ~15 s of rain and dries over a couple of minutes
    this.wetness = p.rain > 0.15 ? Math.min(1, this.wetness + dt * 0.07 * p.rain) : Math.max(0, this.wetness - dt / 140);

    // lightning
    if (p.storm > 0.5) {
      this._nextStrike -= dt;
      if (this._nextStrike <= 0) {
        this.strike();
        this._nextStrike = rand(5, 16);
      }
    }
    let f = 0;
    if (this._pulses.length) {
      this._strikeT += dt;
      for (const pulse of this._pulses) {
        const age = this._strikeT - pulse.at;
        if (age >= 0) f = Math.max(f, pulse.amp * Math.exp(-age * 14));
      }
      if (this._strikeT > 1.2) this._pulses.length = 0;
    }
    this.flash = f;
  }
}
