// Character looks: defaults, validation, cache keys, random NPC looks and side/neutral colors.
//
// A look is a plain object (see ARCHITECTURE.md §12). Every field is optional; normalizeLook()
// fills the gaps with deterministic choices derived from the fields that were given, so the same
// partial look always produces the same character.
//
// Fields (beyond the contract's skin/shirt/shirt2/pants/shoes/hat/hatColor/bandana/hair/outfit/
// build/female):
//   hairColor    '#rrggbb'
//   laces        shoe accent (laces / side stripe), e.g. the side color
//   capBack      snapback worn backwards
//   bandanaSide  'left' | 'right' back pocket
//   beard        'none' | 'goatee' | 'mustache' | 'chin'
//   variant      civilian clothes: tshirt polo buttonup windbreaker sweatshirt overalls jacket dress
//   pantsStyle   jeans dickies slacks shorts skirt
//   shoeStyle    hightop runner boot dress
//   number       jersey number 0..99
//   shades chain earrings hoodUp pager   booleans (Locs-style shades, gold rope chain, ...)
//   idle         0..2 idle stance variant (relaxed / arms crossed / hands in pockets)

import { SKIN_TONES, SIDES, NEUTRAL_COLORS } from '../../data/sets.js';
import { hexColor, hexShade } from './palette.js';

export const OUTFIT_IDS = ['starter', 'flannel', 'tee', 'jersey', 'hoodie', 'uniform', 'civilian'];
export const GANG_OUTFITS = ['starter', 'flannel', 'tee', 'jersey', 'hoodie'];
export const HAT_IDS = ['none', 'cap', 'beanie', 'bandana', 'police'];
export const HAIR_MALE = ['fade', 'hightop', 'cornrows', 'afro', 'bald', 'curly', 'waves', 'jheri'];
export const HAIR_FEMALE = ['ponytail', 'long', 'bun', 'braids', 'afro', 'curly'];
export const HAIR_STYLES = [...new Set([...HAIR_MALE, ...HAIR_FEMALE])];
export const HAIR_COLORS = ['#120d0a', '#1a120d', '#24170f', '#3a2515', '#5b3b21', '#8a6238', '#b99260', '#8d8a84'];
export const SHOE_STYLES = ['hightop', 'runner', 'boot', 'dress'];
export const PANTS_STYLES = ['jeans', 'dickies', 'slacks', 'shorts', 'skirt'];
export const CIV_VARIANTS = ['tshirt', 'polo', 'buttonup', 'windbreaker', 'sweatshirt', 'overalls', 'jacket', 'dress'];
export const BEARDS = ['none', 'goatee', 'mustache', 'chin'];

// Everyday 1993 palettes: teal, purple, forest, burgundy, mustard, mauve, denim, Husker red...
const CIV_SHIRTS = ['#2f8f8a', '#5b3a7a', '#2e5a3c', '#7a2233', '#c9a13b', '#b77f8f', '#3f5f8f', '#c8202a', '#e9e3d0', '#f2f2f2', '#6e7f3a', '#d86a2c', '#1e6fb0', '#8e8e8e', '#20304f'];
const CIV_PANTS = ['#2e4568', '#3b5680', '#b9a47c', '#6b5a45', '#222428', '#4a4a50', '#8a7a5c', '#26344d'];
const DENIM = '#3a5680';

/** FNV-1a string hash → uint32. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tiny seeded PRNG (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const valid = (v, list) => (list.includes(v) ? v : null);

function stableKey(input) {
  const keys = Object.keys(input || {}).sort();
  let s = '';
  for (const k of keys) {
    const v = input[k];
    if (v === undefined) continue;
    s += k + '=' + (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)) + ';';
  }
  return s;
}

/** Fill every look field. Unknown / invalid values fall back to sensible, deterministic defaults. */
export function normalizeLook(input = {}) {
  const L = input || {};
  const r = seeded(hashString(stableKey(L)) ^ 0x9e3779b9);
  const out = {};
  out.female = !!L.female;
  const b = Number(L.build);
  out.build = Number.isFinite(b) && b > 0 ? Math.min(1.2, Math.max(0.85, b)) : 1;
  out.outfit = valid(L.outfit, OUTFIT_IDS) || 'tee';
  const uniform = out.outfit === 'uniform';
  const civ = out.outfit === 'civilian';
  out.variant = civ ? valid(L.variant, CIV_VARIANTS) || pick(r, out.female ? ['tshirt', 'polo', 'windbreaker', 'dress', 'sweatshirt', 'overalls', 'jacket'] : ['tshirt', 'polo', 'buttonup', 'windbreaker', 'sweatshirt', 'overalls', 'jacket']) : null;
  if (out.variant === 'dress' && !out.female) out.variant = 'polo';

  out.skin = hexColor(L.skin) || pick(r, SKIN_TONES);

  // hair: style name, or a color passed as `hair`
  const hairAsColor = hexColor(L.hair);
  const hairStyle = hairAsColor ? null : valid(L.hair, HAIR_STYLES);
  out.hair = hairStyle || pick(r, out.female ? HAIR_FEMALE : HAIR_MALE);
  out.hairColor = hexColor(L.hairColor) || hairAsColor || pick(r, [HAIR_COLORS[0], HAIR_COLORS[1], HAIR_COLORS[2], HAIR_COLORS[0], HAIR_COLORS[3]]);

  // clothes
  const defaultShirt = { tee: '#f3f1ea', uniform: '#1f2c4d', flannel: '#2f4f8f', starter: '#1f5fe0', jersey: '#1f5fe0', hoodie: '#3a3d44' }[out.outfit];
  out.shirt = hexColor(L.shirt) || defaultShirt || pick(r, CIV_SHIRTS);
  const defaultShirt2 = {
    uniform: '#141c33',
    flannel: '#15161a',
    starter: '#f0f0f0',
    jersey: '#f4f4f4',
    hoodie: '#e8e8e8',
    tee: '#2a2a2a',
  }[out.outfit];
  out.shirt2 = hexColor(L.shirt2) || defaultShirt2 || pick(r, CIV_SHIRTS.filter((c) => c !== out.shirt));

  out.pantsStyle = valid(L.pantsStyle, PANTS_STYLES) || (
    uniform ? 'slacks'
      : out.outfit === 'flannel' || out.outfit === 'tee' ? 'dickies'
        : out.outfit === 'jersey' ? (r() < 0.35 ? 'shorts' : 'jeans')
          : civ ? (out.variant === 'dress' ? 'skirt' : out.variant === 'overalls' ? 'jeans' : pick(r, out.female ? ['jeans', 'skirt', 'jeans', 'slacks', 'shorts'] : ['jeans', 'slacks', 'shorts', 'jeans', 'slacks']))
            : 'jeans');
  if (out.pantsStyle === 'skirt' && !out.female) out.pantsStyle = 'jeans';
  const defaultPants = uniform ? '#1a2340'
    : out.variant === 'dress' ? out.shirt
      : out.variant === 'overalls' ? DENIM
        : out.pantsStyle === 'dickies' ? (out.outfit === 'flannel' ? '#b8a57e' : '#22252b')
          : out.pantsStyle === 'jeans' ? pick(r, ['#2e4568', '#3b5680', '#27354f', '#4a6590'])
            : out.pantsStyle === 'skirt' ? pick(r, ['#22252b', '#5b3a7a', '#7a2233', DENIM])
              : pick(r, CIV_PANTS);
  out.pants = hexColor(L.pants) || defaultPants;

  out.shoeStyle = valid(L.shoeStyle, SHOE_STYLES) || (
    uniform ? 'dress'
      : out.outfit === 'hoodie' ? 'boot'
        : out.outfit === 'tee' || out.outfit === 'jersey' ? 'hightop'
          : out.outfit === 'flannel' || out.outfit === 'starter' ? 'runner'
            : pick(r, ['runner', 'dress', 'hightop', 'runner']));
  const defaultShoes = out.shoeStyle === 'boot' ? '#b3834a' : out.shoeStyle === 'dress' ? '#1b1b1d' : '#f1efe8';
  out.shoes = hexColor(L.shoes) || defaultShoes;
  out.laces = hexColor(L.laces) || (out.shoeStyle === 'runner' ? pick(r, ['#c8202a', '#1e4fb0', '#1b1b1d', '#2e7d4f']) : out.shoeStyle === 'hightop' ? '#f5f5f5' : '#2a2a2a');

  // hats
  let hat = valid(L.hat, HAT_IDS) || (uniform ? 'police' : 'none');
  if (uniform && hat === 'cap') hat = 'police';
  if (!uniform && hat === 'police') hat = 'cap';
  out.hat = hat;
  out.hatColor = hexColor(L.hatColor) || (hat === 'police' ? '#141c33' : hat === 'bandana' ? hexColor(L.bandana) || '#222222' : out.shirt2);
  out.capBack = !!L.capBack;

  out.bandana = hexColor(L.bandana);
  out.bandanaSide = L.bandanaSide === 'right' ? 'right' : 'left';
  out.beard = valid(L.beard, BEARDS) || (out.female || uniform ? 'none' : pick(r, ['none', 'none', 'none', 'goatee', 'mustache', 'chin']));
  const n = Number(L.number);
  out.number = Number.isFinite(n) ? Math.abs(Math.round(n)) % 100 : 1 + Math.floor(r() * 98);
  out.shades = !!L.shades;
  out.chain = !!L.chain;
  out.earrings = L.earrings === undefined ? out.female : !!L.earrings;
  out.hoodUp = out.outfit === 'hoodie' && !!L.hoodUp;
  out.pager = !!L.pager;
  const idle = Number(L.idle);
  out.idle = Number.isFinite(idle) ? Math.abs(Math.round(idle)) % 3 : Math.floor(r() * 3);
  return out;
}

/** Everything that changes geometry, as a string (build quantized so similar builds share). */
export function lookKey(L) {
  return [
    L.outfit, L.variant, L.skin, L.shirt, L.shirt2, L.pants, L.pantsStyle, L.shoes, L.shoeStyle, L.laces,
    L.hat, L.hatColor, L.capBack ? 1 : 0, L.bandana, L.bandanaSide, L.hair, L.hairColor, L.beard,
    Math.round(L.build * 20) / 20, L.female ? 1 : 0, L.outfit === 'jersey' ? L.number : '', L.shades ? 1 : 0,
    L.chain ? 1 : 0, L.earrings ? 1 : 0, L.hoodUp ? 1 : 0, L.pager ? 1 : 0,
  ].join('|');
}

/**
 * Side colors on top of a look. wearingColors → the side color on the shirt/accents, rag in the
 * back pocket, colored laces; otherwise neutral colors (NEUTRAL_COLORS) and no rag.
 * look.hat 'bandana' becomes a neutral-colored rag when not wearing colors.
 */
export function sideLook(look = {}, sideId = 'crips', { wearingColors = true, seed = 0 } = {}) {
  const S = SIDES[sideId] || SIDES.crips;
  const out = { ...look };
  const outfit = valid(look.outfit, OUTFIT_IDS) || 'tee';
  out.outfit = outfit;
  if (wearingColors) {
    const dark = S.dark;
    const sleeves = sideId === 'bloods' ? '#15161a' : '#f1f1f1';
    const pal = {
      starter: [S.color, sleeves],
      flannel: [S.color, '#121316'],
      tee: ['#f4f3ee', S.color],
      jersey: [S.color, '#f4f4f4'],
      hoodie: [S.color, '#f0f0f0'],
      uniform: ['#1f2c4d', '#141c33'],
      civilian: [S.color, '#f0f0f0'],
    }[outfit];
    out.shirt = pal[0];
    out.shirt2 = pal[1];
    out.hatColor = look.hat === 'beanie' ? dark : S.color;
    out.bandana = S.color;
    out.laces = S.color;
    out.bandanaSide = sideId === 'bloods' ? 'right' : 'left';
    if (outfit === 'flannel' && !look.pants) out.pants = '#b8a57e';
  } else {
    const n = NEUTRAL_COLORS.length;
    const i = Math.abs(seed | 0) % n;
    const c1 = NEUTRAL_COLORS[i];
    const c2 = NEUTRAL_COLORS[(i + 2) % n];
    out.shirt = outfit === 'tee' ? '#f4f3ee' : c1;
    out.shirt2 = outfit === 'tee' ? '#3b3b3b' : outfit === 'flannel' ? hexShade(c1, 0.35) : c2;
    out.hatColor = NEUTRAL_COLORS[(i + 1) % n];
    out.bandana = null;
    out.laces = '#f2f2f2';
    if (outfit === 'flannel' && !look.pants) out.pants = '#6b5a45';
  }
  return out;
}

/**
 * Random look for NPC generation.
 * opts: { kind: 'ped' | 'gang' | 'cop', side, female, outfit, wearingColors = true }
 */
export function randomLook(rand = Math.random, opts = {}) {
  const r = rand;
  const kind = opts.kind || 'ped';
  const female = opts.female ?? r() < (kind === 'gang' ? 0.15 : kind === 'cop' ? 0.12 : 0.45);
  const skin = kind === 'gang' ? pick(r, SKIN_TONES.slice(2)) : pick(r, SKIN_TONES);
  const build = +(0.92 + r() * 0.2 + (female ? -0.03 : 0)).toFixed(2);
  const hair = pick(r, female ? HAIR_FEMALE : HAIR_MALE);
  const lightSkin = SKIN_TONES.indexOf(skin) <= 1;
  const hairColor = lightSkin && r() < 0.5 ? pick(r, HAIR_COLORS.slice(3)) : pick(r, HAIR_COLORS.slice(0, 4));
  const base = { female, skin, build, hair, hairColor, idle: Math.floor(r() * 3) };
  if (kind === 'cop') {
    return { ...base, outfit: 'uniform', hat: r() < 0.8 ? 'police' : 'none', hair: female ? 'bun' : pick(r, ['fade', 'bald', 'curly', 'fade']), beard: 'none', shades: r() < 0.25 };
  }
  if (kind === 'gang') {
    const outfit = opts.outfit || pick(r, GANG_OUTFITS);
    const hat = pick(r, ['none', 'cap', 'cap', 'beanie', 'bandana']);
    const look = {
      ...base,
      outfit,
      hat,
      capBack: r() < 0.4,
      hoodUp: outfit === 'hoodie' && r() < 0.25,
      shades: r() < 0.2,
      chain: r() < 0.3,
      pager: r() < 0.3,
      number: Math.floor(r() * 99),
      pantsStyle: r() < 0.5 ? 'dickies' : 'jeans',
      shoeStyle: pick(r, ['hightop', 'runner', 'runner', 'boot']),
      shoes: r() < 0.15 ? '#1b1b1d' : undefined,
    };
    return sideLook(look, opts.side || 'crips', { wearingColors: opts.wearingColors !== false, seed: Math.floor(r() * 99) });
  }
  // civilians: varied everyday 1993 clothes (occasional Husker red)
  const variant = opts.variant || pick(r, female ? ['tshirt', 'polo', 'windbreaker', 'dress', 'sweatshirt', 'overalls', 'jacket'] : ['tshirt', 'polo', 'buttonup', 'windbreaker', 'sweatshirt', 'overalls', 'jacket']);
  const shirt = variant === 'sweatshirt' && r() < 0.5 ? '#c8202a' : pick(r, CIV_SHIRTS);
  let shirt2 = pick(r, CIV_SHIRTS);
  if (shirt2 === shirt) shirt2 = '#f2f2f2';
  return {
    ...base,
    outfit: 'civilian',
    variant,
    shirt,
    shirt2,
    hat: r() < 0.22 ? pick(r, ['cap', 'cap', 'beanie']) : 'none',
    hatColor: pick(r, CIV_SHIRTS),
    capBack: r() < 0.15,
    shades: r() < 0.08,
  };
}
