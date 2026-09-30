import { prng } from '../dsp.js';
import { SFX } from '../sfx.js';
import { Band } from './Band.js';
import { SampleBank } from './samples.js';
import { GENRES, gfunk, jingle, talkBed } from './songs.js';
import { COMMUNITY, DJ, HEADLINES, Speaker, weatherReport } from './talk.js';

// The car radio (ARCHITECTURE §11):
//   radio.stations  [{ id, name, genre }]
//   radio.station   current station object, or null when off
//   radio.next()    next station (… → KNOR → off → K-HOT …); the 'radio' key calls it
//   radio.off()     radio off
//   radio.setActive(bool)   plays only while the player drives; emits 'radio:station' { station }
//
// Every station runs on its own "live" timeline (jingle, song, jingle, song…, seeded), so tuning
// away and back lands you later in the broadcast, mid-song. Music is generated in real time and
// scheduled bar by bar a few hundred milliseconds ahead on the AudioContext clock.

export const STATIONS = [
  { id: 'khot', name: 'K-HOT 101.7', genre: 'West Coast Hip-Hop', style: 'gfunk', seed: 1017 },
  { id: 'kbnc', name: 'KBNC 94.1 The Bounce', genre: 'East Coast Hip-Hop', style: 'boombap', seed: 941 },
  { id: 'kqst', name: 'KQST 105.5 Quiet Storm', genre: 'R&B Slow Jams', style: 'quietstorm', seed: 1055 },
  { id: 'kxnb', name: 'KXNB 98.5', genre: 'Country', style: 'country', seed: 985 },
  { id: 'knor', name: 'KNOR 89.3 North O Talk', genre: 'Community Talk', style: 'talk', seed: 893 },
];

const LOOKAHEAD = 0.4; // schedule a bar this long before it starts
const TICK_MS = 60;
const JINGLE_DJ_CHANCE = 0.55;

const barSeconds = (song) => (60 / song.bpm) * 4;
const songSeconds = (song) => barSeconds(song) * song.bars;

/** Plays one song on a band from `startBar`, starting at context time t0 (exported for tests). */
export class Sequencer {
  constructor(audio, band, song, t0, startBar = 0) {
    this.audio = audio;
    this.band = band;
    this.song = song;
    this.bar = startBar;
    this.barTime = t0;
    this.stepDur = barSeconds(song) / 16;
    this.endTime = t0 + (song.bars - startBar) * barSeconds(song);
    this.monos = {};
    for (const [role, kind] of Object.entries(song.mono || {})) this.monos[role] = band.mono(kind, t0);
    this.bed = null;
    if (song.bed) this.bed = startBed(audio, band, song.bed, t0, this.endTime);
  }

  get done() {
    return this.bar >= this.song.bars;
  }

  schedule(until) {
    const song = this.song;
    const bd = this.stepDur * 16;
    const swing = song.swing * this.stepDur;
    while (!this.done && this.barTime < until) {
      const t0 = this.barTime;
      const now = this.audio.ctx.currentTime;
      if (t0 + bd < now) {
        // fell behind (tab was hidden / long frame): skip the bar instead of a burst
        this.bar++;
        this.barTime += bd;
        continue;
      }
      const events = song.events(this.bar);
      for (const e of events) {
        const s = e.s;
        const t = Math.max(now, t0 + s * this.stepDur + (Math.floor(s) % 2 === 1 ? swing : 0));
        if (e.i === 'lead' || e.i === 'sub') {
          const m = this.monos[e.i];
          if (m) m.note(e.n, t, e.d * this.stepDur, e.v, e.g || 0.02);
        } else if (e.i === 'fx') {
          this.band.fx(e.n, t, bd);
        } else if (e.n !== undefined) {
          this.band.sample(e.i, e.n, t, e.d * this.stepDur, e.v, e.strum || 0, this.stepDur);
        } else {
          this.band.drum(e.i, t, e.v);
        }
      }
      this.bar++;
      this.barTime += bd;
    }
  }

  stop(t) {
    for (const m of Object.values(this.monos)) m.stop(t);
    this.monos = {};
    try {
      this.bed?.stop(t + 0.1);
    } catch {
      /* ignore */
    }
  }
}

function startBed(audio, band, name, t0, t1) {
  const buf = band.bank.drum(name);
  if (!buf) return null;
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = audio.ctx.createGain();
  g.gain.value = 0.16;
  src.connect(g);
  g.connect(band.out);
  src.start(t0, Math.random() * 3);
  src.stop(t1 + 0.05);
  return src;
}

/** A station's broadcast: its timeline of segments and the currently playing one. */
class Program {
  constructor(radio, def, dest, { title = false } = {}) {
    this.radio = radio;
    this.audio = radio.audio;
    this.def = def;
    this.title = title;
    this.band = new Band(this.audio, radio.bank, dest);
    this.seq = null;
    this.segIndex = 0;
  }

  /** Segment k of the station's endless schedule (deterministic from the station seed). */
  segment(k) {
    const def = this.def;
    const cache = this.radio._segCache;
    const key = `${def.id}:${k}`;
    let seg = cache.get(key);
    if (seg) return seg;
    const seed = def.seed * 7919 + k * 104729;
    if (k % 2 === 0) seg = { type: 'jingle', song: jingle(seed, def.style) };
    else if (def.style === 'talk') seg = this._talkSegment(seed);
    else seg = { type: 'song', song: GENRES[def.style](seed) };
    seg.duration = songSeconds(seg.song);
    cache.set(key, seg);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return seg;
  }

  _talkSegment(seed) {
    const r = prng(seed);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const items = [weatherReport, pick(HEADLINES), pick(HEADLINES), pick(COMMUNITY), pick(HEADLINES)];
    const speaker = this.radio.speaker;
    // with no speech engine this is a short instrumental interlude
    const est = speaker.available ? items.reduce((s, it) => s + (typeof it === 'string' ? it.split(/\s+/).length * 0.37 + 1.6 : 9), 0) : 20;
    const bed = talkBed(seed, 4);
    const bars = Math.max(4, Math.ceil(est / barSeconds(bed) / 4) * 4);
    return { type: 'talk', song: talkBed(seed, bars), items };
  }

  /** Find where the live broadcast is at station time T and start there at context time t0. */
  tuneIn(T, t0) {
    let k = 0;
    let at = 0;
    for (;;) {
      const seg = this.segment(k);
      if (T < at + seg.duration || k > 2000) break;
      at += seg.duration;
      k++;
    }
    const seg = this.segment(k);
    const bar = barSeconds(seg.song);
    let startBar = Math.ceil((T - at) / bar);
    if (this.title) startBar = 0;
    if (startBar >= seg.song.bars - 1) {
      k++;
      startBar = 0;
    }
    this._play(k, startBar, t0);
  }

  _play(k, startBar, t0) {
    this.segIndex = k;
    const seg = this.title ? { type: 'song', song: gfunk(4242 + k, { title: true }) } : this.segment(k);
    this.seq = new Sequencer(this.audio, this.band, seg.song, t0, startBar);
    const sp = this.radio.speaker;
    if (!this.title && sp.available && this.radio.active) {
      if (seg.type === 'jingle' && startBar === 0) {
        const lines = DJ[this.def.id];
        const r = prng(this.def.seed + k);
        if (lines && (this.def.style === 'talk' || r() < JINGLE_DJ_CHANCE)) sp.say(lines[Math.floor(r() * lines.length)], { delay: t0 - this.audio.ctx.currentTime + 0.35, rate: 1.05 });
      } else if (seg.type === 'talk') {
        // read the items that are still ahead of us
        let at = 0;
        const skip = startBar * barSeconds(seg.song);
        for (const it of seg.items) {
          const text = typeof it === 'function' ? it(this.audio.game) : it;
          const dur = text.split(/\s+/).length * 0.37 + 1.6;
          if (at >= skip) sp.say(text, { delay: t0 - this.audio.ctx.currentTime + (at - skip) + 0.5, rate: 1.0 });
          at += dur;
        }
      }
    }
  }

  tick(now) {
    const seq = this.seq;
    if (!seq) return;
    seq.schedule(now + LOOKAHEAD);
    if (seq.done && now + LOOKAHEAD >= seq.endTime) {
      const end = seq.endTime;
      seq.stop(end);
      this._play(this.segIndex + 1, 0, Math.max(end, now + 0.02));
    }
  }

  stop(fade = 0.12) {
    this.seq?.stop(this.audio.ctx.currentTime + fade);
    this.seq = null;
    this.band.stop(fade);
  }
}

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.stations = STATIONS.map(({ id, name, genre }) => ({ id, name, genre }));
    this.index = 0; // -1 = off
    this.active = false;
    this.program = null;
    this.titleProgram = null;
    this.bank = null;
    this.speaker = new Speaker();
    this._segCache = new Map();
    // every station has been "broadcasting" for a while before you tune in
    this._epoch = STATIONS.map(() => 60 + Math.random() * 900);
    this._timer = null;
    this._lastNext = -1;
    this._carStation = new WeakMap();
  }

  get station() {
    return this.index >= 0 ? this.stations[this.index] : null;
  }

  // ------------------------------------------------------------------ public API
  next() {
    const now = performance.now();
    if (now - this._lastNext < 180) return this.station; // the key and a UI button in the same frame
    this._lastNext = now;
    const n = this.stations.length;
    this.index = this.index >= n - 1 ? -1 : this.index + 1;
    this._remember();
    this._switch();
    return this.station;
  }

  off() {
    this.index = -1;
    this._remember();
    this._switch();
  }

  setStation(id) {
    const i = typeof id === 'number' ? id : this.stations.findIndex((s) => s.id === id);
    if (i < -1 || i >= this.stations.length) return;
    this.index = i;
    this._remember();
    this._switch();
  }

  setActive(on) {
    on = !!on;
    if (on === this.active) return;
    this.active = on;
    if (on) {
      const v = this.audio.game.player?.vehicle;
      if (v) this.index = this._stationFor(v);
      this._switch(false);
    } else {
      this._stopProgram();
      this.speaker.cancel();
      this.audio.game.events.emit('radio:station', { station: null });
    }
  }

  // ------------------------------------------------------------------ internals
  _stationFor(v) {
    if (this._carStation.has(v)) return this._carStation.get(v);
    // every car comes with its own dial position
    let i;
    const r = Math.random();
    if (v.isPolice) i = 4;
    else if (v.model === 'lowrider' || v.model === 'coupe') i = r < 0.7 ? 0 : 1;
    else if (v.model === 'pickup') i = r < 0.6 ? 3 : 0;
    else if (v.model === 'bus') i = 4;
    else i = Math.floor(r * 4);
    this._carStation.set(v, i);
    return i;
  }

  _remember() {
    const v = this.audio.game.player?.vehicle;
    if (v) this._carStation.set(v, this.index);
  }

  _ensureBank() {
    const ctx = this.audio.ctx;
    if (!ctx) return false;
    if (!this.bank) this.bank = new SampleBank(ctx);
    return true;
  }

  /** Called by Audio each frame: render samples in the background once audio is unlocked. */
  update() {
    if (this.bank && !this.bank.done) this.bank.pump(3);
  }

  _switch(withStatic = true) {
    const A = this.audio;
    const game = A.game;
    this._stopProgram();
    this.speaker.cancel();
    if (this.active) game.events.emit('radio:station', { station: this.station });
    if (!this.active || !A.ctx || !this._ensureBank()) return;
    const t = A.ctx.currentTime;
    if (withStatic && A.running) SFX.static(A, t, A.radioIn, { dur: 0.3 });
    const def = STATIONS[this.index];
    if (!def) return;
    this.bank.finish(); // first tune-in: make sure every sample exists (a one-time hitch at worst)
    this.program = new Program(this, def, A.radioIn);
    const T = performance.now() / 1000 + this._epoch[this.index];
    this.program.tuneIn(T, t + (withStatic ? 0.32 : 0.08));
    this._startTimer();
  }

  _stopProgram() {
    this.program?.stop();
    this.program = null;
    if (!this.titleProgram) this._stopTimer();
  }

  /** Title-screen theme (not a station: no static, no DJ, straight to the music bus). */
  playTitle(on) {
    const A = this.audio;
    if (on) {
      if (this.titleProgram || !A.ctx || !this._ensureBank()) return;
      if (!this.bank.done) return; // wait for the background render (no hitch behind the menu)
      this.titleProgram = new Program(this, { id: 'title', style: 'gfunk', seed: 4242 }, A.titleIn, { title: true });
      this.titleProgram.tuneIn(0, A.ctx.currentTime + 0.1);
      this._startTimer();
    } else if (this.titleProgram) {
      this.titleProgram.stop(1.5);
      this.titleProgram = null;
      if (!this.program) this._stopTimer();
    }
  }

  _startTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
  }

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _tick() {
    const A = this.audio;
    if (!A.ctx || A.ctx.state !== 'running') return;
    const now = A.ctx.currentTime;
    try {
      this.program?.tick(now);
      this.titleProgram?.tick(now);
    } catch (err) {
      if (!this._warned) console.warn('[radio] scheduling failed', err);
      this._warned = true;
      this._stopProgram();
    }
  }

  /** Radio volume follows music volume; speech follows it too. */
  setSpeechVolume(v) {
    this.speaker.volume = v;
  }

  dispose() {
    this._stopProgram();
    this.playTitle(false);
    this.speaker.cancel();
  }
}
