// Character-creator options → Character look (ARCHITECTURE.md §12).
//
// The creator works with a small "draft" of choices; buildLook() turns it into the full look object
// the Player / Character code expects, always "wearing colors": the flag color goes on the shirt
// (or accent for the white tee), the hat and the rag hanging from the back pocket.

import { SIDES, SKIN_TONES, OUTFITS, HATS, setById, setsForSide } from '../../data/sets.js';
import { shade } from './dom.js';

// look.hair is a style id. Character implementations that don't know an id should fall back to a
// short cut; hairColor carries the color separately.
export const HAIR_STYLES = [
  { id: 'fade', name: 'Fade' },
  { id: 'hightop', name: 'Hi-top' },
  { id: 'waves', name: 'Waves' },
  { id: 'braids', name: 'Braids' },
  { id: 'jheri', name: 'Jheri curl' },
  { id: 'afro', name: 'Afro' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'bald', name: 'Bald' },
];

export const HAIR_COLOR = '#17110d';

export const BUILD_MIN = 0.9;
export const BUILD_MAX = 1.15;

// Fictional street nicknames, era-appropriate and clean. Max 16 characters each.
const NAMES_ANY = [
  'Lil Tre', 'Baby Dre', 'Lil Lou', 'June Bug', 'Skinny', 'Deuce', 'Man-Man', 'Pooh Bear', 'Smiley',
  'Casper', 'Boogie', 'Cool Breeze', 'Tank', 'Hollywood', 'Scooter', 'Peanut', 'Shorty', 'Tay-Tay',
  'Lil Nook', 'Big Moe', 'Lil Rome', 'Dre Dog', 'Kev-O', 'Ricky Ric', 'Boo', 'Dee Dee', 'Lady T',
  'Neecy', 'Baby Girl', 'Tootie', 'Lil Bit', 'Sunshine',
];
const NAMES_SIDE = {
  crips: ['Lil Loc', 'Baby Blue', 'Tiny Loc', 'Blue Dog', 'Loc Dawg'],
  bloods: ['Lil Red', 'Rooster', 'Baby Red', 'Red Dog', 'Big Scarlet'],
};

/** A few name suggestions (random, no repeats), mixing generic and side-flavored nicknames. */
export function nameSuggestions(side, count = 5) {
  const pool = [...NAMES_ANY, ...(NAMES_SIDE[side] || []), ...(NAMES_SIDE[side] || [])];
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    const n = pool.splice(i, 1)[0];
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function randomName(side) {
  return nameSuggestions(side, 1)[0] || 'Lil Homie';
}

/** The three flag shades a set can rep: side color, set accent, dark. */
export function flagColors(side, set) {
  const s = SIDES[side] || SIDES.crips;
  const list = [s.color, set?.accent || s.light, s.dark];
  return [...new Set(list)];
}

/** Default creator draft for a side/set. */
export function defaultDraft(side, setId) {
  const set = setById(setId) || setsForSide(side)[0];
  return {
    name: '',
    skin: SKIN_TONES[3],
    outfit: 'starter',
    hat: 'cap',
    hair: 'fade',
    build: 1.0,
    female: false,
    flag: flagColors(side, set)[0],
  };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Randomize every look option (keeps side/set). */
export function randomDraft(side, setId) {
  const set = setById(setId) || setsForSide(side)[0];
  const female = Math.random() < 0.3;
  const hairPool = HAIR_STYLES.filter((h) => (female ? h.id !== 'bald' : h.id !== 'ponytail'));
  return {
    name: randomName(side),
    skin: pick(SKIN_TONES),
    outfit: pick(OUTFITS).id,
    hat: pick(HATS).id,
    hair: pick(hairPool).id,
    build: +(BUILD_MIN + Math.random() * (BUILD_MAX - BUILD_MIN)).toFixed(2),
    female,
    flag: pick(flagColors(side, set)),
  };
}

// Per-outfit colors. `flag` is the chosen rag color; everything else stays street-neutral.
const OUTFIT_COLORS = {
  starter: (f) => ({ shirt: f, shirt2: '#f2f2ee', pants: '#23252d', shoes: '#f4f4f2' }),
  flannel: (f) => ({ shirt: f, shirt2: shade(f, -0.5), pants: '#1d1d21', shoes: '#ebebe6' }),
  tee: (f) => ({ shirt: '#f4f4f0', shirt2: f, pants: '#34363f', shoes: '#f4f4f2' }),
  jersey: (f) => ({ shirt: f, shirt2: '#f5f5f2', pants: '#2a3550', shoes: '#f4f4f2' }),
  hoodie: (f) => ({ shirt: shade(f, -0.28), shirt2: f, pants: '#2b2d33', shoes: '#1c1c1f' }),
};

/** Full §12 look from a creator draft. */
export function buildLook(draft, side) {
  const s = SIDES[side] || SIDES.crips;
  const flag = draft.flag || s.color;
  const colors = (OUTFIT_COLORS[draft.outfit] || OUTFIT_COLORS.starter)(flag);
  return {
    skin: draft.skin || SKIN_TONES[3],
    ...colors,
    outfit: draft.outfit || 'starter',
    hat: draft.hat || 'none',
    hatColor: flag,
    bandana: flag, // hanging from the back pocket, or tied on the head when hat === 'bandana'
    hair: draft.hair || 'fade',
    hairColor: HAIR_COLOR,
    build: Math.max(BUILD_MIN, Math.min(BUILD_MAX, Number(draft.build) || 1)),
    female: !!draft.female,
  };
}

/** Sensible look for quickStart / ?autostart. */
export function defaultLook(side, setId) {
  return buildLook(defaultDraft(side, setId), side);
}

/** Clean up a typed name: trim, collapse spaces, max 16 chars. */
export function cleanName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
