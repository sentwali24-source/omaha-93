// Just enough music theory for the procedural radio: scales, chord shapes, voicings, patterns.

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minPent: [0, 3, 5, 7, 10],
  majPent: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
};

export const CHORDS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
  sus: [0, 5, 7, 10, 14],
  six: [0, 4, 7, 9],
};

/** Chord intervals voiced close around `center` (midi), root at or below the center. */
export function voiceChord(rootPc, type, center = 60, maxNotes = 5) {
  const iv = CHORDS[type] || CHORDS.maj;
  let base = center - 9 + ((((rootPc - (center - 9)) % 12) + 12) % 12);
  const out = [];
  for (let i = 0; i < iv.length && out.length < maxNotes; i++) {
    let n = base + iv[i];
    while (n > center + 13) n -= 12;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** Bass note for a chord root near `low` (midi, e.g. 36). */
export function bassNote(rootPc, low = 33) {
  return low + ((((rootPc - low) % 12) + 12) % 12);
}

/** Notes of a scale spanning [lo, hi] (midi) in key `keyPc`. */
export function scaleNotes(keyPc, scale, lo, hi) {
  const out = [];
  for (let n = lo; n <= hi; n++) {
    const pc = (((n - keyPc) % 12) + 12) % 12;
    if (scale.includes(pc)) out.push(n);
  }
  return out;
}

/**
 * Drum pattern string → [[step, velocity], ...]. 16 chars per bar:
 *   X accent, x hit, o medium, g ghost, . rest
 */
export function pattern(str) {
  const v = { X: 1, x: 0.82, o: 0.55, g: 0.28 };
  const out = [];
  for (let i = 0; i < str.length; i++) if (v[str[i]]) out.push([i, v[str[i]]]);
  return out;
}
