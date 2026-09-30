import { clamp, damp, smoothstep } from '../core/math.js';
import { fillNoise, impulseResponse, prng, renderBuffer } from './dsp.js';
import { SFX } from './sfx.js';
import { LOOPS } from './loops.js';
import { BEDS } from './beds.js';
import { Ambience } from './ambience.js';
import { Radio } from './radio/Radio.js';

// All sound is synthesized with WebAudio — no files (ARCHITECTURE §11).
//
//   audio.unlock()                               first user gesture (menu calls it; we also listen)
//   audio.play(name, { x?, z?, volume?, rate? }) one-shot, positional when x/z are given
//   audio.loop(name, opts) → { setVolume, setRate, setPosition, stop }  engine siren rain crowd spray
//   audio.radio                                  see radio/Radio.js
//   audio.update(dt)                             listener follows the camera, ambience, engines,
//                                                sirens by heat, footsteps, radio key
//
// Most sounds come from game events (hits, KOs, carjacks, crashes, heat, pager, missions, cash,
// rank, tags, doors), so other modules rarely need to call audio directly. Nothing here may throw:
// without an AudioContext (or while it is suspended) every call is a cheap no-op.
//
// Graph:  one-shots/loops ─┐
//         ambience ────────┴→ world (pause duck) ─┐
//         ui ────────────────────────────────────┴→ sfx (settings.sfxVolume) ─┐
//         radio → car-speaker EQ → radio duck ─┐                              ├→ master → limiter → out
//         title theme ─────────────────────────┴→ music (settings.musicVolume)┘

const REF_DIST = 5;
const MAX_DIST = 150;
const LEVEL = {
  punch: 0.9, hit: 0.8, whoosh: 0.35, step: 0.3, spray: 0.7, door: 0.75, horn: 0.8, pager: 0.7, cash: 0.55,
  ui_click: 0.5, ui_select: 0.5, ko: 0.9, skid: 0.6, crash: 1.0, cheer: 0.6, bust: 0.8, glass: 0.7,
  engine_start: 0.75, tag_done: 0.7, mission_pass: 0.8, mission_fail: 0.8, rank_up: 0.7, siren_yelp: 0.6,
  thunder: 1.0, static: 0.5,
};
const UI_SOUNDS = new Set(['ui_click', 'ui_select', 'pager', 'mission_pass', 'mission_fail', 'rank_up', 'cash', 'bust']);
const LOW_PRIORITY = new Set(['step', 'whoosh', 'punch', 'hit', 'glass', 'skid']);
const THROTTLE = { step: 0.06, punch: 0.04, hit: 0.06, cash: 0.25, pager: 0.8, crash: 0.12, door: 0.15, ko: 0.1, siren_yelp: 0.5 };
const GEARS = [0, 7, 13, 20, 28, 38, 70]; // fake gearbox for the engine pitch (m/s at the top of each gear)

const noopHandle = () => ({ setVolume() {}, setRate() {}, setPosition() {}, setMode() {}, setLoad() {}, setMuffle() {}, stop() {} });

export class Audio {
  constructor(game) {
    this.game = game;
    this.attract = true;
    this.always = true; // keeps the listener / pause duck / title music right even when paused
    this.unlocked = false;
    this.ctx = null;
    this.noise = {};
    this._beds = new Map();
    this._bedQueue = Object.keys(BEDS);
    this._loops = new Set();
    this._voiceEnds = [];
    this._last = new Map();
    this._external = { step: -1e9, whoosh: -1e9, horn: -1e9 };
    this._warned = false;
    this.listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this.radio = new Radio(this);
    this.ambience = new Ambience(this);
    this._heat = 0;
    this._engine = null;
    this._engineRpm = 0;
    this._skid = null;
    this._horn = null;
    this._stepT = 0;
    this._sirens = [null, null];
    this._farSiren = null;
    this._traffic = [];
    this._trafficScan = 0;
    this._paused = false;

    // unlock on the very first gesture, whoever handles it
    this._onGesture = () => this.unlock();
    try {
      for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, this._onGesture, { capture: true, passive: true });
      document.addEventListener('visibilitychange', () => this._onVisibility());
    } catch {
      /* no DOM (tests) */
    }
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------------ context
  unlock() {
    try {
      if (!this.ctx) this._createContext();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      this.unlocked = true;
      if (this.running) this._removeGestureListeners();
      return true;
    } catch (err) {
      this._warn('unlock failed', err);
      return false;
    }
  }

  _removeGestureListeners() {
    if (!this._onGesture) return;
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, this._onGesture, { capture: true });
    this._onGesture = null;
  }

  _createContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const g = (dest, v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      if (dest) n.connect(dest);
      return n;
    };
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 8;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    this.master = g(limiter);
    this.musicBus = g(this.master);
    this.sfxBus = g(this.master);
    this.world = g(this.sfxBus);
    this.ui = g(this.sfxBus);
    this.oneShotBus = g(this.world);
    this.ambBus = g(this.world, 0.9);

    // car speakers: a little band-limited, a little boxy
    this.radioDuck = g(this.musicBus, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 11500;
    lp.connect(this.radioDuck);
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 180;
    pk.gain.value = 2.5;
    pk.connect(lp);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    hp.connect(pk);
    this.radioIn = g(hp, 0.9);
    this.titleIn = g(this.musicBus, 0.75);

    // street reverb send (skipped on low quality: convolution costs CPU on phones)
    this.reverb = null;
    if ((this.game.quality?.detail ?? 1) > 0) {
      try {
        const conv = ctx.createConvolver();
        conv.buffer = impulseResponse(ctx, 1.3, 3.4);
        this.reverb = g(null, 0.5);
        this.reverb.connect(conv);
        conv.connect(this.world);
      } catch {
        this.reverb = null;
      }
    }

    // pre-rendered noise (2 s each)
    const rnd = prng(99);
    this.noise.white = renderBuffer(ctx, 2, ([d]) => fillNoise(d, 'white', rnd));
    this.noise.pink = renderBuffer(ctx, 2, ([d]) => fillNoise(d, 'pink', rnd), { sampleRate: 24000 });
    this.noise.brown = renderBuffer(ctx, 2, ([d]) => fillNoise(d, 'brown', rnd), { sampleRate: 24000 });

    this._applyVolumes();
    this.ambience.start(this.ambBus);
    ctx.onstatechange = () => {
      if (this.running) this._removeGestureListeners();
    };
  }

  _onVisibility() {
    if (!this.ctx) return;
    try {
      if (document.hidden) this.ctx.suspend();
      else if (this.unlocked) this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  _applyVolumes() {
    const s = this.game.settings || {};
    const set = (node, v) => node && node.gain.setTargetAtTime(clamp(v, 0, 1.5), this.ctx.currentTime, 0.05);
    if (!this.ctx) return;
    set(this.master, s.masterVolume ?? 0.8);
    set(this.musicBus, (s.musicVolume ?? 0.6) * 0.9);
    set(this.sfxBus, s.sfxVolume ?? 0.9);
    this.radio.setSpeechVolume((s.masterVolume ?? 0.8) * (s.musicVolume ?? 0.6) * 1.2);
  }

  /** Lazily rendered ambience / loop beds. */
  hasBed(name) {
    return this._beds.has(name);
  }

  bed(name) {
    let b = this._beds.get(name);
    if (!b && BEDS[name] && this.ctx) {
      b = BEDS[name](this.ctx);
      this._beds.set(name, b);
      const i = this._bedQueue.indexOf(name);
      if (i >= 0) this._bedQueue.splice(i, 1);
    }
    return b;
  }

  sendReverb(node, amount = 0.2) {
    if (!this.reverb || !node) return;
    const s = this.ctx.createGain();
    s.gain.value = amount;
    node.connect(s);
    s.connect(this.reverb);
  }

  _warn(msg, err) {
    if (this._warned) return;
    this._warned = true;
    console.warn(`[audio] ${msg}`, err);
  }

  // ------------------------------------------------------------------ one-shots
  play(name, o = {}) {
    try {
      if (!this.running) return false;
      const fn = SFX[name];
      if (!fn) return false;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      if (!o._internal && this._external[name] !== undefined) this._external[name] = now;
      if (name === 'horn' && this._horn && o.x !== undefined && this._nearPlayerCar(o.x, o.z)) return false;
      const thr = THROTTLE[name] ?? 0.03;
      const key = o.x !== undefined ? `${name}:${Math.round(o.x / 4)}:${Math.round(o.z / 4)}` : name;
      if (now - (this._last.get(key) ?? -1) < thr) return false;
      this._last.set(key, now);
      if (this._last.size > 256) this._last.clear();

      // voice cap: low-priority sounds give way first
      const active = this._activeVoices(now);
      const cap = (this.game.quality?.detail ?? 1) === 0 ? 16 : 28;
      if (active >= cap && LOW_PRIORITY.has(name)) return false;
      if (active >= cap * 1.5 && !UI_SOUNDS.has(name)) return false;

      let gain = (o.volume ?? 1) * (LEVEL[name] ?? 0.8);
      let pan = 0;
      let cutoff = 0;
      const positional = o.x !== undefined && o.z !== undefined && isFinite(o.x) && isFinite(o.z);
      if (positional) {
        const L = this.listener;
        const dx = o.x - L.x;
        const dz = o.z - L.z;
        const d = Math.hypot(dx, dz, L.y * 0.5);
        if (d > MAX_DIST) return false;
        gain *= this._attenuate(d);
        if (gain < 0.004) return false;
        const flat = Math.hypot(dx, dz) || 1;
        pan = clamp(((dx * L.rx + dz * L.rz) / flat) * 0.85, -0.9, 0.9) * smoothstep(1, 6, flat);
        if (d > 30) cutoff = 16000 * Math.pow(1 - smoothstep(30, MAX_DIST, d), 1.5) + 900;
      }
      const bus = UI_SOUNDS.has(name) && !positional ? this.ui : this.oneShotBus;
      const chain = this._chain(bus, gain, pan, cutoff, positional ? 0.18 : 0);
      const dur = fn(this, now + 0.005, chain.input, {
        volume: o.volume ?? 1,
        rate: o.rate ?? 1,
        dur: o.dur,
        intensity: o.intensity,
        wet: this.game.environment?.wetness ?? 0,
      });
      this._voiceEnds.push(now + (dur || 1));
      setTimeout(() => chain.out.disconnect(), ((dur || 1) + 0.6) * 1000);
      return true;
    } catch (err) {
      this._warn(`play(${name}) failed`, err);
      return false;
    }
  }

  _activeVoices(now) {
    const v = this._voiceEnds;
    let w = 0;
    for (let i = 0; i < v.length; i++) if (v[i] > now) v[w++] = v[i];
    v.length = w;
    return w;
  }

  _attenuate(d) {
    const k = REF_DIST / (REF_DIST + 0.65 * Math.max(0, d - REF_DIST));
    return k * (1 - smoothstep(MAX_DIST * 0.75, MAX_DIST, d));
  }

  /** gain → (pan) → (lowpass) → bus, plus a reverb send. Returns { input, out, gain, pan, lp }. */
  _chain(bus, gain, pan, cutoff, reverb) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = g;
    let p = null;
    if (ctx.createStereoPanner) {
      p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail.connect(p);
      tail = p;
    }
    let lp = null;
    if (cutoff > 0) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      tail.connect(lp);
      tail = lp;
    }
    tail.connect(bus);
    if (reverb > 0) this.sendReverb(tail, reverb);
    return { input: g, out: g, gain: g, pan: p, lp };
  }

  // ------------------------------------------------------------------ loops
  /**
   * Continuous sound. opts: { x?, z?, volume?, rate?, mode? ('wail'|'yelp'), bus? (internal) }.
   * Returns { setVolume, setRate, setPosition, setMode, setLoad, setMuffle, stop }.
   */
  loop(name, o = {}) {
    try {
      const make = LOOPS[name];
      if (!make || !this.ctx) return noopHandle();
      const ctx = this.ctx;
      const chain = this._chain(o.bus || this.oneShotBus, 1, 0, 0, 0);
      const lp = ctx.createBiquadFilter(); // distance air absorption for positional loops
      lp.type = 'lowpass';
      lp.frequency.value = 18000;
      chain.gain.disconnect();
      chain.gain.connect(lp);
      lp.connect(chain.pan || (o.bus || this.oneShotBus));
      const voice = make(this, chain.gain, o);
      const audio = this;
      const h = {
        name,
        voice,
        chain,
        lp,
        x: o.x,
        z: o.z,
        positional: o.x !== undefined && o.z !== undefined,
        alive: true,
        setVolume(v) {
          if (h.alive) voice.setVolume(v);
        },
        setRate(r) {
          if (h.alive) voice.setRate(r);
        },
        setMode(m) {
          if (h.alive) voice.setMode?.(m);
        },
        setLoad(l) {
          if (h.alive) voice.setLoad?.(l);
        },
        setMuffle(m) {
          if (h.alive) voice.setMuffle?.(m);
        },
        setPosition(x, z) {
          h.x = x;
          h.z = z;
          h.positional = true;
        },
        stop(fade) {
          if (!h.alive) return;
          h.alive = false;
          try {
            voice.stop(fade);
          } catch {
            /* ignore */
          }
          audio._loops.delete(h);
          setTimeout(() => chain.out.disconnect(), ((fade ?? 0.5) + 0.6) * 1000);
        },
      };
      if (o.rate !== undefined) voice.setRate(o.rate);
      this._loops.add(h);
      this._placeLoop(h);
      return h;
    } catch (err) {
      this._warn(`loop(${name}) failed`, err);
      return noopHandle();
    }
  }

  _placeLoop(h) {
    if (!h.positional) return;
    const L = this.listener;
    const dx = h.x - L.x;
    const dz = h.z - L.z;
    const d = Math.hypot(dx, dz, L.y * 0.5);
    const t = this.ctx.currentTime;
    h.chain.gain.gain.setTargetAtTime(this._attenuate(d), t, 0.05);
    const flat = Math.hypot(dx, dz) || 1;
    h.chain.pan?.pan.setTargetAtTime(clamp(((dx * L.rx + dz * L.rz) / flat) * 0.85, -0.9, 0.9) * smoothstep(1, 6, flat), t, 0.05);
    h.lp.frequency.setTargetAtTime(d > 25 ? 16000 * Math.pow(1 - smoothstep(25, MAX_DIST, d), 1.5) + 700 : 18000, t, 0.1);
  }

  _nearPlayerCar(x, z) {
    const v = this.game.player?.vehicle;
    if (!v) return false;
    return Math.hypot(v.position.x - x, v.position.z - z) < 4;
  }

  // ------------------------------------------------------------------ events
  init() {
    const ev = this.game.events;
    const pos = (a) => (a?.position ? { x: a.position.x, z: a.position.z } : {});
    const P = () => this.game.player;
    ev.on('settings:change', () => this._applyVolumes());
    ev.on('actor:hit', ({ target, damage = 10 } = {}) => {
      const p = pos(target);
      this.play('punch', { ...p, volume: 0.55 + Math.min(30, damage) / 50, rate: 0.9 + Math.random() * 0.2, _internal: true });
      if (target === P() || damage >= 18) this.play('hit', { ...p, volume: target === P() ? 0.8 : 0.5, _internal: true });
    });
    ev.on('actor:ko', ({ target } = {}) => this.play('ko', pos(target)));
    ev.on('vehicle:jacked', ({ vehicle } = {}) => {
      this.play('door', pos(vehicle));
      this.play('whoosh', { ...pos(vehicle), volume: 0.6, _internal: true });
    });
    ev.on('vehicle:crash', ({ vehicle, impact = 10 } = {}) => {
      const k = impact <= 1 ? impact : clamp(impact / 18, 0.15, 1);
      this.play('crash', { ...pos(vehicle), volume: 0.35 + 0.65 * k, intensity: k });
    });
    ev.on('vehicle:hitActor', ({ actor, speed = 8 } = {}) => this.play('hit', { ...pos(actor), volume: clamp(speed / 14, 0.3, 1), _internal: true }));
    ev.on('heat:change', ({ level = 0 } = {}) => {
      if (level > this._heat) {
        const c = this._nearestCruiser(200);
        this.play('siren_yelp', c ? { x: c.position.x, z: c.position.z } : { volume: 0.35 });
      }
      this._heat = level;
    });
    ev.on('pager', () => this.play('pager'));
    ev.on('mission:complete', () => {
      this._duckRadio(0.25, 2.8);
      this.play('mission_pass');
    });
    ev.on('mission:fail', () => {
      this._duckRadio(0.3, 2.4);
      this.play('mission_fail');
    });
    ev.on('cash:change', ({ amount = 0, reason = '' } = {}) => {
      if (amount > 0 || (amount < 0 && reason !== 'bail' && reason !== 'hospital')) this.play('cash');
    });
    ev.on('shop:purchase', () => this.play('cash'));
    ev.on('rank:up', () => {
      this._duckRadio(0.35, 2);
      this.play('rank_up');
    });
    ev.on('tag:complete', ({ spot } = {}) => this.play('tag_done', spot ? { x: spot.x, z: spot.z } : {}));
    ev.on('player:enterVehicle', ({ vehicle } = {}) => {
      this.play('door', pos(vehicle));
      setTimeout(() => this.play('engine_start', pos(vehicle)), 250);
      this.radio.setActive(true);
    });
    ev.on('player:exitVehicle', ({ vehicle } = {}) => {
      this.play('door', pos(vehicle));
      this.radio.setActive(false);
      this._stopCarLoops();
    });
    ev.on('player:down', ({ reason } = {}) => {
      if (reason === 'busted') this.play('bust');
    });
    ev.on('fight:won', () => this.play('cheer', { volume: 0.3 }));
    ev.on('turf:change', ({ owner } = {}) => {
      if (owner && owner === this.game.state?.player?.setId) this.play('cheer', { volume: 0.7 });
    });
    ev.on('weather:lightning', ({ distance = 1000, intensity = 0.5 } = {}) => {
      if (!this.running) return;
      const delay = Math.min(6, distance / 343);
      setTimeout(() => this.play('thunder', { intensity, volume: 0.5 + 0.5 * intensity }), delay * 1000);
    });
    ev.on('game:pause', () => {
      this._paused = true;
      this.radio.speaker.cancel();
    });
    ev.on('game:resume', () => (this._paused = false));
    ev.on('game:end', () => {
      this.radio.setActive(false);
      this._stopCarLoops();
      this._stopSirens();
    });
  }

  _duckRadio(level, seconds) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.radioDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(level, t, 0.05);
    g.setTargetAtTime(1, t + seconds, 0.4);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!this.ctx) return;
    try {
      this._frame(dt);
    } catch (err) {
      this._warn('update failed', err);
    }
  }

  _frame(dt) {
    const game = this.game;
    this._installDebug();
    // background rendering of beds and radio samples (one bed or a few ms of samples per frame)
    if (this._bedQueue.length) this.bed(this._bedQueue[0]);
    else this.radio.update(dt);
    if (!this.running) return;

    // listener = camera
    const cam = game.camera;
    const L = this.listener;
    L.x = cam.position.x;
    L.y = cam.position.y;
    L.z = cam.position.z;
    const e = cam.matrixWorld.elements;
    const rl = Math.hypot(e[0], e[2]) || 1;
    L.rx = e[0] / rl;
    L.rz = e[2] / rl;
    for (const h of this._loops) this._placeLoop(h);

    // pause: the world goes quiet, the radio drops low, UI stays
    const t = this.ctx.currentTime;
    const paused = game.paused || this._paused;
    this.world.gain.setTargetAtTime(paused ? 0.0 : 1, t, 0.08);
    this.radioIn.gain.setTargetAtTime(paused ? 0.25 : 0.9, t, 0.1);

    // title theme behind the menu, faded out when play starts
    this.radio.playTitle(game.mode === 'attract');

    this.ambience.update(dt, L);
    if (game.mode !== 'play') return;
    const p = game.player;
    if (!p) return;
    if (p.vehicle) this._drive(dt, p.vehicle);
    else {
      this._stopCarLoops();
      if (!paused) this._footsteps(dt, p);
    }
    if (!paused && game.input?.pressed?.('radio') && p.vehicle) this.radio.next();
    if (!paused && game.input?.pressed?.('attack') && !p.vehicle && t - this._external.whoosh > 3) this.play('whoosh', { x: p.position.x, z: p.position.z, volume: 0.5, rate: 0.9 + Math.random() * 0.25, _internal: true });
    this._trafficVoices(dt, p);
    this._sirenVoices(dt);
  }

  _drive(dt, v) {
    const game = this.game;
    const sp = Math.abs(v.speed || 0);
    const c = v.controls || {};
    const thr = Math.abs(c.throttle || 0);
    // engine pitch: the car's own rpm when it has one, otherwise a fake gearbox from speed
    let rpm;
    if (typeof v.rpm === 'number' && isFinite(v.rpm)) rpm = v.rpm > 3 ? clamp((v.rpm - 700) / 6000, 0, 1) : clamp(v.rpm, 0, 1.2);
    else if (sp < 0.6) rpm = 0.04 + thr * 0.35;
    else {
      let g = 1;
      while (g < GEARS.length - 1 && sp > GEARS[g]) g++;
      const lo = GEARS[g - 1];
      const hi = GEARS[g];
      rpm = 0.2 + 0.72 * clamp((sp - lo) / (hi - lo), 0, 1) + thr * 0.06;
    }
    this._engineRpm = damp(this._engineRpm, rpm, 9, dt);
    if (!this._engine) {
      this._engine = this.loop('engine', { x: v.position.x, z: v.position.z, volume: 0 });
      this._engineOn = 0;
    }
    this._engineOn = Math.min(1, (this._engineOn || 0) + dt * 1.2);
    const e = this._engine;
    e.setPosition(v.position.x, v.position.z);
    e.setRate(this._engineRpm);
    e.setLoad(thr);
    e.setVolume((0.6 + 0.4 * thr) * smoothstep(0.55, 1, this._engineOn) * (game.paused ? 0 : 1));

    // tire squeal: handbrake slides, hard braking, sideways slip
    const slip = Math.abs(v.slip ?? v.lateral ?? v.drift ?? 0);
    const squeal = clamp((c.handbrake && sp > 6 ? 0.7 : 0) + (c.brake > 0.6 && sp > 12 ? 0.5 : 0) + (slip > 2 ? (slip - 2) / 4 : 0), 0, 1);
    if (squeal > 0.05 && !this._skid) this._skid = this.loop('skid', { x: v.position.x, z: v.position.z, volume: 0 });
    if (this._skid) {
      this._skid.setPosition(v.position.x, v.position.z);
      this._skid.setVolume(squeal * 0.8);
      this._skid.setRate(0.9 + sp / 90);
      if (squeal <= 0.05) {
        this._skid.stop(0.25);
        this._skid = null;
      }
    }

    // horn held (player car)
    const honk = !game.paused && game.input?.held?.('horn');
    if (honk && !this._horn) {
      this._horn = this.loop('horn', { x: v.position.x, z: v.position.z, volume: 1, rate: v.model === 'pickup' || v.model === 'bus' ? 0.85 : 1 });
    } else if (!honk && this._horn) {
      this._horn.stop(0.04);
      this._horn = null;
    }
    this._horn?.setPosition(v.position.x, v.position.z);
  }

  _stopCarLoops() {
    this._engine?.stop(0.4);
    this._engine = null;
    this._skid?.stop(0.2);
    this._skid = null;
    this._horn?.stop(0.04);
    this._horn = null;
  }

  _footsteps(dt, p) {
    // automatic player footsteps unless another module plays 'step' itself
    if (this.ctx.currentTime - this._external.step < 3) return;
    const speed = p.speed || 0;
    const airborne = p.grounded === false || p.position.y > 0.05;
    if (speed < 0.8 || airborne || p.state !== 'active') {
      this._stepT = 0.12;
      return;
    }
    this._stepT -= dt * (1.6 + speed * 0.24);
    if (this._stepT <= 0) {
      this._stepT += 1;
      this.play('step', { x: p.position.x, z: p.position.z, volume: 0.55 + speed / 14, rate: speed > 6 ? 1.1 : 1, _internal: true });
    }
  }

  _trafficVoices(dt, p) {
    const game = this.game;
    const max = [1, 2, 3][game.quality?.detail ?? 1] ?? 2;
    this._trafficScan -= dt;
    if (this._trafficScan <= 0) {
      this._trafficScan = 0.3;
      const L = this.listener;
      const mine = p.vehicle;
      const near = game.vehiclesNear?.(L.x, L.z, 45, (v) => v !== mine && !v.parked && Math.abs(v.speed || 0) > 2) || [];
      near.sort((a, b) => Math.hypot(a.position.x - L.x, a.position.z - L.z) - Math.hypot(b.position.x - L.x, b.position.z - L.z));
      this._trafficCars = near.slice(0, max);
    }
    const cars = this._trafficCars || [];
    for (let i = 0; i < max; i++) {
      const v = cars[i];
      let h = this._traffic[i];
      if (v && v.root?.parent) {
        if (!h) h = this._traffic[i] = { loop: this.loop('engine', { x: v.position.x, z: v.position.z, volume: 0 }), car: null };
        h.car = v;
        const sp = Math.abs(v.speed || 0);
        h.loop.setPosition(v.position.x, v.position.z);
        h.loop.setRate(clamp(0.15 + sp / 30, 0, 0.9));
        h.loop.setLoad(clamp(v.controls?.throttle ?? 0.4, 0, 1));
        h.loop.setVolume(0.5);
      } else if (h) {
        h.loop.stop(0.4);
        this._traffic[i] = null;
      }
    }
  }

  _nearestCruiser(radius) {
    const L = this.listener;
    let best = null;
    let bd = radius;
    for (const v of this.game.vehicles || []) {
      if (!v.isPolice) continue;
      const d = Math.hypot(v.position.x - L.x, v.position.z - L.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  _sirenVoices() {
    const game = this.game;
    const heat = game.police?.heat ?? 0;
    const L = this.listener;
    const list = [];
    for (const v of game.vehicles || []) {
      if (!v.isPolice || !(v.siren || heat > 0) || v === game.player?.vehicle) continue;
      const d = Math.hypot(v.position.x - L.x, v.position.z - L.z);
      if (d < 260) list.push([d, v]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this._sirens.length; i++) {
      const entry = list[i];
      let h = this._sirens[i];
      if (entry) {
        const [d, v] = entry;
        if (!h) h = this._sirens[i] = this.loop('siren', { x: v.position.x, z: v.position.z, volume: 1, mode: 'wail' });
        h.setPosition(v.position.x, v.position.z);
        h.setMode(d < 30 ? 'yelp' : 'wail');
      } else if (h) {
        h.stop(0.6);
        this._sirens[i] = null;
      }
    }
    // no cruiser in earshot yet: sirens somewhere out there, closer (louder, brighter) with heat
    if (heat > 0 && list.length === 0) {
      if (!this._farSiren) this._farSiren = this.loop('siren', { volume: 0, mode: 'wail' });
      this._farSiren.setVolume(clamp(0.08 + heat * 0.07, 0, 0.45));
      this._farSiren.lp.frequency.setTargetAtTime(600 + heat * 700, this.ctx.currentTime, 0.3);
    } else if (this._farSiren) {
      this._farSiren.stop(1.5);
      this._farSiren = null;
    }
  }

  _stopSirens() {
    for (let i = 0; i < this._sirens.length; i++) {
      this._sirens[i]?.stop(0.3);
      this._sirens[i] = null;
    }
    this._farSiren?.stop(0.3);
    this._farSiren = null;
  }

  _installDebug() {
    const api = this.game.debugApi;
    if (!api || api.audio) return;
    api.audio = () => ({
      state: this.ctx?.state ?? 'none',
      unlocked: this.unlocked,
      voices: this._activeVoices(this.ctx?.currentTime ?? 0),
      loops: [...this._loops].map((h) => h.name),
      station: this.radio.station?.id ?? null,
      active: this.radio.active,
      title: !!this.radio.titleProgram,
      playing: this.radio.program ? { bar: this.radio.program.seq?.bar, genre: this.radio.program.seq?.song?.genre, bpm: this.radio.program.seq?.song?.bpm } : null,
      samplesReady: !!this.radio.bank?.done,
      beds: [...this._beds.keys()],
      speech: this.radio.speaker.available,
    });
    api.sfx = (name, opts) => this.play(name, opts);
  }
}
