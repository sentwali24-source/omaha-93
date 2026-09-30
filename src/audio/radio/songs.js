import { prng } from '../dsp.js';
import { SCALES, bassNote, pattern, scaleNotes, voiceChord } from './theory.js';

// Procedural songs. A generator takes a seed and returns
//   { genre, bpm, swing, bars, sections, mono: { lead?, sub? }, bed?, lowpass?, events(bar) }
// events(bar) → note events for one bar of 16 steps (sixteenth notes):
//   { i: drum name, s: step, v }                           drum hit
//   { i: 'ep'|'pluck'|'bass'|'pad'|'brass'|'bell', n: midi | midi[], s, d: steps, v, strum? }
//   { i: 'lead'|'sub', n, s, d, v, g: glide seconds }        mono synth (portamento)
//   { i: 'fx', n: 'scratch'|'sweep', s }
// Every song is built from a key, a chord loop, drum/bass/keys templates and a generated lead
// melody, arranged intro → verse → hook → ... so each seed sounds different but stays musical.

function rng(seed) {
  const r = prng(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
}

function arrange(blocks) {
  const sections = [];
  let bar = 0;
  for (const [name, bars] of blocks) {
    sections.push({ name, from: bar, to: bar + bars });
    bar += bars;
  }
  return { sections, bars: bar };
}

function sectionAt(sections, bar) {
  for (const s of sections) if (bar >= s.from && bar < s.to) return s;
  return sections[sections.length - 1];
}

/** A melodic phrase: [{ s (step within the phrase), d, n, g }] over `bars` bars from a note pool. */
function melody(R, pool, rhythm, { start = null, glideChance = 0.45, resolve = null } = {}) {
  let idx = start ?? Math.floor(pool.length / 2);
  const out = [];
  rhythm.forEach(([s, d], k) => {
    const step = R.pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
    idx = Math.max(0, Math.min(pool.length - 1, idx + step));
    let n = pool[idx];
    if (k === rhythm.length - 1 && resolve) n = resolve(n);
    out.push({ s, d, n, g: R.chance(glideChance) ? R.range(0.05, 0.14) : 0.02 });
  });
  return out;
}

function nearestPc(n, pcs) {
  let best = n;
  let bd = 99;
  for (let k = -6; k <= 6; k++) {
    const pc = (((n + k) % 12) + 12) % 12;
    if (pcs.includes(pc) && Math.abs(k) < bd) {
      bd = Math.abs(k);
      best = n + k;
    }
  }
  return best;
}

const hats16 = (R, lo = 0.3, hi = 0.62, drop = 0.12) => {
  const out = [];
  for (let s = 0; s < 16; s++) if (!R.chance(drop) || s % 4 === 0) out.push([s, s % 2 === 0 ? hi : lo]);
  return out;
};

// =========================================================================== G-funk (K-HOT)
const GFUNK_PROGS = [
  [[0, 'm9'], [0, 'm9'], [5, 'dom9'], [5, 'dom9']],
  [[0, 'm7'], [8, 'maj7'], [5, 'm7'], [7, 'dom7']],
  [[0, 'm7'], [3, 'maj7'], [5, 'm7'], [10, 'dom7']],
  [[0, 'm9'], [10, 'dom9'], [8, 'maj7'], [7, 'dom7']],
  [[0, 'm9'], [5, 'm7'], [0, 'm9'], [7, 'dom7']],
];
const GFUNK_KICKS = ['x.....x...x.....', 'x......xx.x.....', 'x.....x.x.....x.', 'x..x......x..x..', 'x.....xx..x....g'];
const GFUNK_BASS = [
  [[0, 3, 0], [3, 1, 0], [6, 2, 12, 1], [8, 2, 0], [10, 2, 7], [14, 2, 10]],
  [[0, 6, 0], [7, 1, 0], [8, 3, 12, 1], [11, 2, 10], [14, 2, 7]],
  [[0, 2, 0], [2, 1, 12, 1], [3, 3, 0], [8, 4, 0], [12, 1, 7], [13, 3, 10, 1]],
  [[0, 4, 0], [6, 1, 0], [7, 2, 7, 1], [10, 2, 0], [12, 4, 12, 1]],
];
const GFUNK_LEAD_RHYTHMS = [
  [[0, 6], [8, 4], [12, 4], [16, 10], [28, 4]],
  [[2, 4], [6, 2], [8, 8], [18, 4], [22, 2], [24, 8]],
  [[0, 3], [3, 3], [6, 10], [16, 3], [19, 3], [22, 10]],
];

export function gfunk(seed, { title = false } = {}) {
  const R = rng(seed);
  const keyPc = R.pick([1, 3, 5, 6, 8, 10, 2]);
  const bpm = title ? 90 : R.int(88, 96);
  const prog = R.pick(GFUNK_PROGS);
  const kick = pattern(R.pick(GFUNK_KICKS));
  const bass = R.pick(GFUNK_BASS);
  const pool = scaleNotes(keyPc, SCALES.minPent, 70, 87);
  const tonicPcs = [keyPc, (keyPc + 7) % 12, (keyPc + 3) % 12];
  const rhythm = R.pick(GFUNK_LEAD_RHYTHMS);
  const hookA = melody(R, pool, rhythm, { glideChance: 0.55 });
  const hookB = melody(R, pool, rhythm, { start: pool.indexOf(hookA[1]?.n ?? pool[0]), glideChance: 0.55, resolve: (n) => nearestPc(n, tonicPcs) });
  const keysRhythm = R.pick([[[0, 15]], [[0, 6], [6, 2], [10, 6]], [[0, 8], [10, 6]]]);
  const openHat = R.chance(0.6);
  const { sections, bars } = arrange(
    title
      ? [['intro', 4], ['hook', 8], ['verse', 8], ['hook', 8], ['bridge', 4], ['hook', 8], ['outro', 4]]
      : R.pick([
          [['intro', 4], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['bridge', 4], ['hook', 8], ['outro', 4]],
          [['intro', 4], ['hook', 8], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['outro', 4]],
          [['intro', 2], ['verse', 8], ['hook', 8], ['bridge', 4], ['verse', 8], ['hook', 8], ['outro', 4]],
        ]),
  );
  const song = {
    genre: 'gfunk',
    bpm,
    swing: R.range(0.1, 0.19),
    bars,
    sections,
    mono: { lead: 'gfunk', sub: 'sub' },
    bed: null,
    lowpass: null,
    events(bar) {
      const sec = sectionAt(sections, bar);
      const name = sec.name;
      const ev = [];
      const [deg, type] = prog[bar % prog.length];
      const rootPc = (keyPc + deg) % 12;
      const drums = name === 'verse' || name === 'hook';
      const thin = name === 'bridge' || name === 'intro' || name === 'outro';
      // drums
      if (drums) {
        for (const [s, v] of kick) ev.push({ i: 'kick808', s, v });
        ev.push({ i: 'clap', s: 4, v: 0.85 }, { i: 'clap', s: 12, v: 0.9 });
        ev.push({ i: 'snare', s: 4, v: 0.35 }, { i: 'snare', s: 12, v: 0.4 });
      }
      if (name !== 'outro' || bar < sec.to - 2) {
        for (const [s, v] of hats16(R, 0.22, 0.48)) ev.push({ i: 'hatC', s, v: thin ? v * 0.6 : v });
      }
      if (drums && openHat && bar % 2 === 1) ev.push({ i: 'hatO', s: 14, v: 0.35 });
      if (name === 'hook') for (let s = 0; s < 16; s += 2) ev.push({ i: 'shaker', s: s + 1, v: 0.22 });
      if (name === 'bridge') ev.push({ i: 'clap', s: 12, v: 0.7 });
      if (bar === sec.from && name === 'hook') ev.push({ i: 'crash', s: 0, v: 0.35 });
      // bass
      if (name !== 'intro' || bar >= sec.to - 2) {
        const b0 = bassNote(rootPc, 34);
        for (const [s, d, iv, gl] of bass) ev.push({ i: 'sub', s, d, n: b0 + iv, v: 0.9, g: gl ? 0.07 : 0.012 });
      }
      // keys + strings
      const chord = voiceChord(rootPc, type, 61, 4);
      for (const [s, d] of keysRhythm) ev.push({ i: 'ep', n: chord, s, d, v: 0.42 });
      if (name === 'hook' || name === 'bridge') ev.push({ i: 'pad', n: voiceChord(rootPc, type, 68, 3), s: 0, d: 16, v: 0.24 });
      // lead
      const rel = bar - sec.from;
      if (name === 'hook' || name === 'bridge' || (name === 'intro' && rel >= 2) || name === 'outro') {
        const phrase = (rel >> 1) % 2 === 0 ? hookA : hookB;
        const off = (rel % 2) * 16;
        for (const nt of phrase) if (nt.s >= off && nt.s < off + 16) ev.push({ i: 'lead', s: nt.s - off, d: nt.d, n: nt.n, v: 0.8, g: nt.g });
      } else if (name === 'verse' && rel % 4 === 3) {
        const n = nearestPc(pool[Math.floor(pool.length * 0.6)], tonicPcs);
        ev.push({ i: 'lead', s: 4, d: 10, n, v: 0.55, g: 0.12 });
      }
      return ev;
    },
  };
  return song;
}

// =========================================================================== boom-bap (KBNC)
const BAP_PROGS = [
  [[0, 'm9'], [0, 'm9'], [5, 'dom9'], [5, 'dom9']],
  [[0, 'm9'], [3, 'maj9'], [8, 'maj7'], [7, 'dom9']],
  [[2, 'm9'], [7, 'dom9'], [0, 'maj9'], [0, 'maj9']],
  [[0, 'm11'], [10, 'dom9'], [3, 'maj9'], [5, 'm9']],
];
const BAP_KICKS = ['x.......x.x.....', 'x......x..x.....', 'x.x.......x..x..', 'x........xx.....', 'x......x.x....x.'];
const BAP_SNARES = ['....x.......x...', '....x.......x..g', '....x..g....x...'];
const BAP_CHOPS = [[[0, 3], [3, 3], [10, 4]], [[0, 6], [7, 2], [10, 5]], [[0, 2], [3, 2], [6, 2], [11, 4]], [[0, 10], [11, 4]]];

export function boombap(seed) {
  const R = rng(seed);
  const keyPc = R.pick([0, 2, 4, 5, 7, 9, 11]);
  const prog = R.pick(BAP_PROGS);
  const kick = pattern(R.pick(BAP_KICKS));
  const snare = pattern(R.pick(BAP_SNARES));
  const chop = R.pick(BAP_CHOPS);
  const horns = R.chance(0.7);
  const hornPool = scaleNotes(keyPc, SCALES.dorian, 62, 77);
  const hornLine = melody(R, hornPool, [[0, 2], [3, 2], [6, 4], [16, 2], [19, 2], [22, 6]], { glideChance: 0 });
  const { sections, bars } = arrange(
    R.pick([
      [['intro', 4], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 4], ['outro', 2]],
      [['intro', 2], ['verse', 12], ['hook', 8], ['verse', 12], ['hook', 8], ['outro', 2]],
    ]),
  );
  return {
    genre: 'boombap',
    bpm: R.int(86, 94),
    swing: R.range(0.2, 0.28),
    bars,
    sections,
    mono: {},
    bed: 'crackle',
    lowpass: 6800,
    events(bar) {
      const sec = sectionAt(sections, bar);
      const name = sec.name;
      const ev = [];
      const [deg, type] = prog[bar % prog.length];
      const rootPc = (keyPc + deg) % 12;
      const drums = name !== 'intro' && name !== 'outro';
      if (drums) {
        for (const [s, v] of kick) ev.push({ i: 'kickDusty', s, v });
        for (const [s, v] of snare) ev.push({ i: 'snareDusty', s, v });
        if (bar % 4 === 3 && R.chance(0.5)) ev.push({ i: 'kickDusty', s: 14, v: 0.6 });
      }
      for (let s = 0; s < 16; s += 2) ev.push({ i: 'hatC', s, v: (s % 4 === 0 ? 0.5 : 0.34) * (drums ? 1 : 0.6) });
      if (drums && R.chance(0.35)) ev.push({ i: 'hatC', s: R.pick([7, 11, 15]), v: 0.18 });
      if (name === 'hook' && bar === sec.from) ev.push({ i: 'fx', n: 'scratch', s: 0 });
      // the "sample": EP chord chops (with a filtered intro)
      const chord = voiceChord(rootPc, type, 62, 5);
      for (const [s, d] of chop) ev.push({ i: 'ep', n: chord, s, d, v: name === 'intro' ? 0.3 : 0.44 });
      // upright-ish bass
      if (name !== 'intro') {
        const b0 = bassNote(rootPc, 33);
        const nextRoot = bassNote((keyPc + prog[(bar + 1) % prog.length][0]) % 12, 33);
        ev.push({ i: 'bass', n: b0, s: 0, d: 5, v: 0.85 }, { i: 'bass', n: b0 + 7, s: 6, d: 2, v: 0.6 });
        ev.push({ i: 'bass', n: b0, s: 8, d: 4, v: 0.75 });
        ev.push({ i: 'bass', n: R.chance(0.5) ? b0 + 10 : b0 + 12, s: 12, d: 2, v: 0.55 });
        ev.push({ i: 'bass', n: nextRoot - 1, s: 14, d: 2, v: 0.5 });
      }
      if (name === 'hook' && horns) {
        const off = ((bar - sec.from) % 2) * 16;
        for (const nt of hornLine) if (nt.s >= off && nt.s < off + 16) ev.push({ i: 'brass', n: [nt.n, nt.n - 5], s: nt.s - off, d: nt.d, v: 0.4 });
      }
      return ev;
    },
  };
}

// =========================================================================== quiet storm (KQST)
const QS_PROGS = [
  [[0, 'maj9'], [9, 'm9'], [2, 'm9'], [7, 'sus']],
  [[5, 'maj9'], [4, 'm7'], [2, 'm9'], [0, 'maj9']],
  [[0, 'maj9'], [4, 'm7'], [5, 'maj9'], [7, 'dom9']],
  [[2, 'm9'], [7, 'dom9'], [0, 'maj9'], [9, 'm9']],
];
const QS_KICKS = ['x.......x.....x.', 'x.....x...x.....', 'x......x.x......'];
const QS_RHYTHMS = [
  [[0, 4], [4, 4], [8, 8], [16, 6], [22, 2], [24, 8]],
  [[2, 2], [4, 6], [10, 6], [18, 2], [20, 4], [24, 8]],
];

export function quietStorm(seed) {
  const R = rng(seed);
  const keyPc = R.pick([1, 3, 8, 10, 5]);
  const prog = R.pick(QS_PROGS);
  const kick = pattern(R.pick(QS_KICKS));
  const pool = scaleNotes(keyPc, SCALES.majPent, 67, 84);
  const rhythm = R.pick(QS_RHYTHMS);
  const tonic = [keyPc, (keyPc + 4) % 12, (keyPc + 7) % 12];
  const lineA = melody(R, pool, rhythm, { glideChance: 0.35 });
  const lineB = melody(R, pool, rhythm, { glideChance: 0.35, resolve: (n) => nearestPc(n, tonic) });
  const { sections, bars } = arrange(
    R.pick([
      [['intro', 2], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['bridge', 4], ['hook', 4], ['outro', 2]],
      [['intro', 4], ['verse', 8], ['hook', 8], ['bridge', 4], ['hook', 8], ['outro', 4]],
    ]),
  );
  return {
    genre: 'quietstorm',
    bpm: R.int(64, 72),
    swing: R.range(0.08, 0.14),
    bars,
    sections,
    mono: { lead: 'soft' },
    bed: null,
    lowpass: null,
    events(bar) {
      const sec = sectionAt(sections, bar);
      const name = sec.name;
      const ev = [];
      const [deg, type] = prog[bar % prog.length];
      const rootPc = (keyPc + deg) % 12;
      const drums = name === 'verse' || name === 'hook';
      if (drums) {
        for (const [s, v] of kick) ev.push({ i: 'kickSoft', s, v: v * 0.9 });
        ev.push({ i: 'snap', s: 4, v: 0.55 }, { i: 'snap', s: 12, v: 0.6 });
        ev.push({ i: 'rim', s: 12, v: 0.25 });
        for (let s = 0; s < 16; s++) ev.push({ i: 'hatC', s, v: s % 2 === 0 ? 0.24 : 0.12 });
        if (name === 'hook') for (let s = 0; s < 16; s += 2) ev.push({ i: 'shaker', s: s + 1, v: 0.18 });
      } else if (name !== 'outro') {
        ev.push({ i: 'snap', s: 12, v: 0.35 });
      }
      const chord = voiceChord(rootPc, type, 62, 5);
      ev.push({ i: 'ep', n: chord, s: 0, d: 7, v: 0.46 }, { i: 'ep', n: chord.slice(1), s: 8, d: 6, v: 0.32 });
      if (name === 'verse' && bar % 2 === 1) chord.slice(-3).forEach((n, k) => ev.push({ i: 'ep', n: n + 12, s: 12 + k, d: 3, v: 0.2 }));
      if (name !== 'verse') ev.push({ i: 'pad', n: voiceChord(rootPc, type, 67, 4), s: 0, d: 16, v: 0.26 });
      if (name !== 'intro') {
        const b0 = bassNote(rootPc, 33);
        ev.push({ i: 'bass', n: b0, s: 0, d: 6, v: 0.8 }, { i: 'bass', n: b0, s: 6, d: 2, v: 0.5 }, { i: 'bass', n: b0 + 7, s: 8, d: 5, v: 0.65 });
        if (R.chance(0.5)) ev.push({ i: 'bass', n: b0 + 12, s: 14, d: 2, v: 0.45 });
      }
      const rel = bar - sec.from;
      if (name === 'hook' || name === 'bridge' || (name === 'verse' && rel >= 4)) {
        const phrase = (rel >> 1) % 2 === 0 ? lineA : lineB;
        const off = (rel % 2) * 16;
        for (const nt of phrase) if (nt.s >= off && nt.s < off + 16) ev.push({ i: 'lead', s: nt.s - off, d: nt.d, n: nt.n, v: name === 'verse' ? 0.5 : 0.7, g: nt.g });
      }
      if (bar === sec.from && name !== 'intro') ev.push({ i: 'bell', n: chord[chord.length - 1] + 12, s: 0, d: 8, v: 0.18 });
      return ev;
    },
  };
}

// =========================================================================== country (KXNB)
const COUNTRY_PROGS = [
  [[0, 'maj'], [5, 'maj'], [0, 'maj'], [7, 'maj']],
  [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']],
  [[0, 'maj'], [0, 'maj'], [5, 'maj'], [5, 'maj'], [7, 'maj'], [7, 'maj'], [0, 'maj'], [0, 'maj']],
];

export function country(seed) {
  const R = rng(seed);
  const keyPc = R.pick([7, 9, 2, 4, 0]);
  const prog = R.pick(COUNTRY_PROGS);
  const pool = scaleNotes(keyPc, SCALES.majPent, 67, 83);
  const lickPool = scaleNotes(keyPc, SCALES.majPent, 64, 79);
  const tonic = [keyPc, (keyPc + 4) % 12, (keyPc + 7) % 12];
  const steelA = melody(R, pool, [[0, 6], [8, 8], [16, 4], [20, 4], [24, 8]], { glideChance: 0.6 });
  const steelB = melody(R, pool, [[0, 6], [8, 8], [16, 4], [20, 4], [24, 8]], { glideChance: 0.6, resolve: (n) => nearestPc(n, tonic) });
  const lick = melody(R, lickPool, [[0, 1], [2, 1], [3, 1], [4, 2], [6, 1], [8, 1], [10, 1], [11, 1], [12, 2], [14, 2]], { glideChance: 0 });
  const shuffle = R.chance(0.4);
  const { sections, bars } = arrange([['intro', 4], ['verse', 8], ['hook', 8], ['verse', 8], ['hook', 8], ['bridge', 4], ['hook', 8], ['outro', 2]]);
  return {
    genre: 'country',
    bpm: R.int(108, 124),
    swing: shuffle ? 0.14 : 0.02,
    bars,
    sections,
    mono: { lead: 'steel' },
    bed: null,
    lowpass: null,
    events(bar) {
      const sec = sectionAt(sections, bar);
      const name = sec.name;
      const ev = [];
      const [deg, type] = prog[bar % prog.length];
      const rootPc = (keyPc + deg) % 12;
      if (name !== 'intro' || bar >= sec.to - 2) {
        ev.push({ i: 'kickDusty', s: 0, v: 0.8 }, { i: 'kickDusty', s: 8, v: 0.7 });
        ev.push({ i: 'rim', s: 4, v: 0.5 }, { i: 'snare', s: 12, v: 0.45 });
        for (let s = 0; s < 16; s += 2) ev.push({ i: 'hatC', s, v: 0.28 });
        if (name === 'hook') for (let s = 1; s < 16; s += 2) ev.push({ i: 'snare', s, v: 0.08 });
      }
      // boom-chick guitar + bass
      const b0 = bassNote(rootPc, 40);
      const fifth = b0 + 7 > 52 ? b0 - 5 : b0 + 7;
      ev.push({ i: 'pluck', n: b0, s: 0, d: 4, v: 0.7 }, { i: 'pluck', n: fifth, s: 8, d: 4, v: 0.65 });
      const chord = voiceChord(rootPc, type, 60, 4);
      for (const s of [4, 12]) ev.push({ i: 'pluck', n: chord, s, d: 3, v: 0.4, strum: 0.2 });
      if (name === 'hook') for (const s of [6, 14]) ev.push({ i: 'pluck', n: chord, s, d: 1, v: 0.25, strum: 0.12 });
      if (name !== 'intro') ev.push({ i: 'bass', n: b0 - 12, s: 0, d: 6, v: 0.8 }, { i: 'bass', n: fifth - 12, s: 8, d: 6, v: 0.7 });
      // steel guitar sings, chicken-pickin' lick answers
      const rel = bar - sec.from;
      if (name === 'hook' || name === 'intro' || (name === 'verse' && rel % 4 >= 2)) {
        const phrase = (rel >> 1) % 2 === 0 ? steelA : steelB;
        const off = (rel % 2) * 16;
        for (const nt of phrase) if (nt.s >= off && nt.s < off + 16) ev.push({ i: 'lead', s: nt.s - off, d: nt.d, n: nt.n, v: 0.65, g: nt.g });
      }
      if (name === 'bridge' || (name === 'hook' && rel % 4 === 3)) for (const nt of lick) ev.push({ i: 'pluck', n: nt.n, s: nt.s, d: nt.d, v: 0.5 });
      return ev;
    },
  };
}

// =========================================================================== talk bed (KNOR)
export function talkBed(seed, bars = 16) {
  const R = rng(seed);
  const keyPc = R.pick([5, 10, 3]);
  const prog = [[0, 'maj9'], [9, 'm9'], [2, 'm9'], [7, 'dom9']];
  return {
    genre: 'talk',
    bpm: 78,
    swing: 0.12,
    bars,
    sections: [{ name: 'bed', from: 0, to: bars }],
    mono: {},
    bed: null,
    lowpass: 5000,
    events(bar) {
      const [deg, type] = prog[bar % prog.length];
      const rootPc = (keyPc + deg) % 12;
      const b0 = bassNote(rootPc, 33);
      return [
        { i: 'ep', n: voiceChord(rootPc, type, 62, 4), s: 0, d: 14, v: 0.3 },
        { i: 'bass', n: b0, s: 0, d: 6, v: 0.5 },
        { i: 'bass', n: b0 + 7, s: 8, d: 6, v: 0.4 },
        { i: 'snap', s: 4, v: 0.18 },
        { i: 'snap', s: 12, v: 0.2 },
        ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ i: 'shaker', s, v: 0.1 })),
      ];
    },
  };
}

// =========================================================================== station IDs
/** A two-bar jingle in the station's style (sweep, chord hits, rising arpeggio, crash). */
export function jingle(seed, style) {
  const R = rng(seed);
  const major = style === 'country' || style === 'quietstorm' || style === 'talk';
  const keyPc = R.pick([0, 2, 5, 7, 9]);
  const bpm = { gfunk: 92, boombap: 90, quietstorm: 70, country: 116, talk: 84 }[style] || 90;
  const hits = major ? [[0, 'maj9'], [10, 'maj'], [0, 'maj9']] : [[0, 'm9'], [10, 'dom9'], [0, 'm9']];
  const arp = major ? [0, 4, 7, 12] : [0, 3, 7, 12];
  const inst = style === 'country' ? 'pluck' : style === 'boombap' ? 'brass' : 'ep';
  return {
    genre: 'jingle',
    bpm,
    swing: 0.1,
    bars: 2,
    sections: [{ name: 'jingle', from: 0, to: 2 }],
    mono: {},
    bed: style === 'boombap' ? 'crackle' : null,
    lowpass: null,
    events(bar) {
      const ev = [];
      if (bar === 0) {
        ev.push({ i: 'fx', n: 'sweep', s: 0 });
        [0, 6, 10].forEach((s, k) => {
          const [deg, type] = hits[k];
          ev.push({ i: inst, n: voiceChord((keyPc + deg) % 12, type, 64, 4), s, d: k === 2 ? 6 : 3, v: 0.5 });
          ev.push({ i: 'kickDusty', s, v: 0.7 });
        });
        ev.push({ i: 'clap', s: 6, v: 0.6 });
        arp.forEach((iv, k) => ev.push({ i: 'bell', n: 72 + keyPc + iv, s: 12 + k, d: 4, v: 0.3 }));
      } else {
        ev.push({ i: 'crash', s: 0, v: 0.4 }, { i: 'kickDusty', s: 0, v: 0.8 });
        ev.push({ i: 'pad', n: voiceChord(keyPc, major ? 'maj9' : 'm9', 66, 4), s: 0, d: 14, v: 0.35 });
        ev.push({ i: inst, n: voiceChord(keyPc, major ? 'maj9' : 'm9', 60, 4), s: 0, d: 10, v: 0.45 });
        ev.push({ i: 'bass', n: bassNote(keyPc, 33), s: 0, d: 10, v: 0.8 });
      }
      return ev;
    },
  };
}

export const GENRES = { gfunk, boombap, quietstorm: quietStorm, country, talk: talkBed };
