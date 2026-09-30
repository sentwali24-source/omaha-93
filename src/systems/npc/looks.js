import { SIDES, SKIN_TONES } from '../../data/sets.js';

// Character look generators for every NPC role (see Character look fields, ARCHITECTURE §12).
// Civilians are ADULTS in everyday summer-1993 clothes: work uniforms, church clothes, a mail
// carrier, joggers, office workers, nurses, older folks, Husker fans. Set members wear their
// side's color with outfit variety; officers wear the 'uniform' outfit.

const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
const chance = (p, r = Math.random) => r() < p;

// skin tone weights per district (index into SKIN_TONES, light → dark)
const SKIN_WEIGHTS = {
  north: [0.05, 0.07, 0.12, 0.22, 0.24, 0.18, 0.12],
  default: [0.2, 0.2, 0.14, 0.14, 0.13, 0.11, 0.08],
};

export function skinFor(district, r = Math.random) {
  const w = SKIN_WEIGHTS[district] || SKIN_WEIGHTS.default;
  let x = r();
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return SKIN_TONES[i];
  }
  return SKIN_TONES[3];
}

const HAIR_DARK = ['#15110e', '#1f1712', '#2b1d14', '#3b2616'];
const HAIR_ANY = ['#15110e', '#2b1d14', '#3b2616', '#5a3a22', '#8a6a3a', '#b8955a', '#6e2f16'];
const HAIR_GRAY = ['#8f8f8f', '#a9a9a9', '#c8c8c8', '#dedede'];

const JEANS = ['#2e3f63', '#3c5078', '#24324f', '#4d6189', '#1e2638'];
const KHAKI = ['#b9a57a', '#a8946a', '#8f8266', '#c7b58e'];
const DARK = ['#1c1c1f', '#2a2a30', '#34343b', '#3b3530'];
const EVERYDAY_TOPS = ['#e9e4d6', '#c9c1ad', '#6f7f5a', '#4e6a7d', '#8c5a3c', '#5b4a6e', '#b58a3a', '#2f5d57', '#7d3b3b', '#9aa3ad', '#d6c28c', '#39465a', '#f0f0ea', '#556b2f'];
const BRIGHT_90S = ['#1fb5a8', '#e84a8a', '#6a3fa0', '#e8d33a', '#ff7a2f', '#2dc2e8', '#9be34a', '#f2f2f2'];
const SHOES_CASUAL = ['#f0f0f0', '#e2ddd2', '#2a2a2a', '#6b5a45', '#8a8a8a'];

/** Civilian archetypes: weight by district and hour (adults only). */
export const CIV_ARCHES = {
  casual: { label: ['Man', 'Woman'], speed: 1.35 },
  husker: { label: ['Husker Fan', 'Husker Fan'], speed: 1.35 },
  worker: { label: ['Worker', 'Worker'], speed: 1.3 },
  mail: { label: ['Mail Carrier', 'Mail Carrier'], speed: 1.45 },
  church: { label: ['Churchgoer', 'Churchgoer'], speed: 1.15 },
  elder: { label: ['Older Man', 'Older Woman'], speed: 0.95 },
  jogger: { label: ['Jogger', 'Jogger'], speed: 3.0 },
  office: { label: ['Businessman', 'Businesswoman'], speed: 1.5 },
  nurse: { label: ['Nurse', 'Nurse'], speed: 1.4 },
  student: { label: ['Student', 'Student'], speed: 1.4 },
};

export function pickArchetype(district, hour, day = 1, r = Math.random) {
  const sunday = day % 7 === 0;
  const morning = hour >= 6 && hour < 11;
  const work = hour >= 7 && hour < 18;
  const late = hour >= 22 || hour < 5;
  const w = {
    casual: 5,
    husker: 1.1,
    worker: work ? 1.6 : 0.7,
    mail: work && hour < 16 ? 0.6 : 0,
    church: sunday && hour < 15 ? 3 : 0.6,
    elder: late ? 0.3 : 1.6,
    jogger: morning || (hour >= 17 && hour < 21) ? 1.2 : 0.2,
    office: 0.4,
    nurse: 0.4,
    student: 0.8,
  };
  if (district === 'downtown' || district === 'oldmarket') {
    w.office = work ? 4.5 : 1.2;
    w.worker *= 0.8;
    w.elder *= 0.6;
    w.student *= 1.2;
  } else if (district === 'midtown') {
    w.office = work ? 2 : 0.6;
    w.nurse = 1.1; // Creighton / hospitals
    w.student = 2.2;
    w.jogger *= 1.5;
  } else if (district === 'north') {
    w.elder *= 1.4;
    w.church *= 1.4;
  } else if (district === 'eastomaha' || district === 'riverfront' || district === 'nodo') {
    w.worker *= 2.5;
    w.office *= 0.5;
  }
  let total = 0;
  for (const k in w) total += w[k];
  let x = r() * total;
  for (const k in w) {
    x -= w[k];
    if (x <= 0) return k;
  }
  return 'casual';
}

/** A civilian look for an archetype. Returns { look, arche, female, label, speed }. */
export function civilianLook(arche = 'casual', district = 'north', r = Math.random) {
  const female = chance(arche === 'church' ? 0.6 : arche === 'nurse' ? 0.75 : 0.46, r);
  const skin = skinFor(district, r);
  const look = {
    skin,
    shirt: pick(EVERYDAY_TOPS, r),
    shirt2: pick(EVERYDAY_TOPS, r),
    pants: pick(JEANS, r),
    shoes: pick(SHOES_CASUAL, r),
    hat: 'none',
    hatColor: '#333333',
    bandana: null,
    hair: pick(district === 'north' ? HAIR_DARK : HAIR_ANY, r),
    outfit: 'civilian',
    build: 0.92 + r() * 0.2,
    female,
  };
  switch (arche) {
    case 'casual':
      look.outfit = pick(['tee', 'tee', 'civilian', 'civilian', 'hoodie', 'starter'], r);
      if (look.outfit === 'starter') look.shirt = pick(['#1b3f2e', '#5a1f6e', '#0f2d57', '#303030', '#7a1830', '#b47a14'], r); // team jackets
      if (chance(0.25, r)) {
        look.hat = 'cap';
        look.hatColor = pick(['#303030', '#0f2d57', '#7a1830', '#e9e4d6', '#1b3f2e'], r);
      }
      look.pants = chance(0.6, r) ? pick(JEANS, r) : pick(KHAKI.concat(DARK), r);
      break;
    case 'husker':
      // Husker red is everywhere in Nebraska — a football fan, not a set member
      look.outfit = pick(['tee', 'hoodie', 'civilian'], r);
      look.shirt = '#c8102e';
      look.shirt2 = '#f3efe2';
      look.pants = pick(JEANS.concat(KHAKI), r);
      if (chance(0.5, r)) {
        look.hat = 'cap';
        look.hatColor = chance(0.7, r) ? '#c8102e' : '#f3efe2';
      }
      break;
    case 'worker':
      look.outfit = pick(['civilian', 'flannel'], r);
      look.shirt = pick(['#2f3e55', '#b59a6a', '#6f767d', '#3d5240', '#8a5a2b', '#4a4f57'], r);
      look.shirt2 = '#d9d2bf'; // name patch
      look.pants = chance(0.5, r) ? look.shirt : pick(DARK.concat(KHAKI), r);
      look.shoes = pick(['#4a3322', '#3a2a1c', '#2a2a2a'], r);
      if (chance(0.55, r)) {
        look.hat = 'cap';
        look.hatColor = pick(['#e0d8c4', '#2f3e55', '#a33a24', '#3d5240'], r); // seed / work caps
      }
      look.build = 0.98 + r() * 0.16;
      break;
    case 'mail':
      look.outfit = 'civilian';
      look.shirt = '#a9bdd3';
      look.shirt2 = '#1f2d4a';
      look.pants = '#1f2d4a';
      look.shoes = '#1a1a1a';
      look.hat = 'cap';
      look.hatColor = '#1f2d4a';
      break;
    case 'church':
      look.outfit = 'civilian';
      if (female) {
        look.shirt = pick(['#7d2a6b', '#c9a227', '#e6e1d4', '#2c6e8f', '#b0303c', '#f2f2f2', '#5a3d8a'], r);
        look.shirt2 = pick(['#f2f2f2', '#c9a227', '#1d1d1d'], r);
        look.pants = look.shirt; // dress
        look.shoes = pick(['#1d1d1d', '#e6e1d4', '#7a2a2a'], r);
      } else {
        look.shirt = pick(['#2a2a36', '#3b2f2a', '#1d2433', '#55493d', '#4a4a4f'], r); // suit
        look.shirt2 = '#f2f2f2';
        look.pants = look.shirt;
        look.shoes = '#141414';
      }
      look.build = 0.95 + r() * 0.18;
      break;
    case 'elder':
      look.outfit = 'civilian';
      look.shirt = pick(['#8a6f4d', '#6b7a5a', '#5a5a6e', '#9a8f7a', '#7a4f4f', '#d8d0bc'], r); // cardigans
      look.shirt2 = pick(['#e8e2d0', '#c9c1ad'], r);
      look.pants = pick(['#5a5650', '#4a4036', '#6b6255', '#3a3a40'], r);
      look.shoes = pick(['#2a2a2a', '#4a3322', '#e2ddd2'], r);
      look.hair = pick(HAIR_GRAY, r);
      look.build = 0.9 + r() * 0.1;
      if (!female && chance(0.4, r)) {
        look.hat = 'cap';
        look.hatColor = pick(['#4a4a4a', '#5a4a3a', '#2f3e55'], r);
      }
      break;
    case 'jogger':
      look.outfit = pick(['tee', 'hoodie'], r);
      look.shirt = pick(BRIGHT_90S, r); // neon windbreakers and tanks
      look.shirt2 = pick(BRIGHT_90S, r);
      look.pants = pick(['#2b2b33', '#8a8f99', '#1f2d4a', '#5a3d8a'], r);
      look.shoes = '#f4f4f4';
      look.build = 0.9 + r() * 0.12;
      break;
    case 'office':
      look.outfit = 'civilian';
      look.shirt = pick(['#e8e8e8', '#b9cde0', '#f2efe6', '#d6d6e0'], r);
      look.shirt2 = pick(['#7a1f2b', '#1f3a7a', '#2f5d3a', '#6b5a2a'], r); // tie / scarf
      look.pants = pick(['#2e2e36', '#1f2433', '#4a4a50', '#8f8266'], r);
      look.shoes = pick(['#141414', '#3a2415'], r);
      break;
    case 'nurse':
      look.outfit = 'civilian';
      look.shirt = pick(['#7fb8b0', '#9bb7d4', '#f2f2f2', '#b9a6d4'], r); // scrubs
      look.shirt2 = look.shirt;
      look.pants = look.shirt;
      look.shoes = '#f4f4f4';
      break;
    case 'student':
      look.outfit = pick(['hoodie', 'tee', 'starter', 'flannel'], r);
      look.shirt = pick(['#6e6e72', '#1b3f2e', '#5a1f6e', '#2dc2e8', '#e9e4d6', '#0f2d57', '#8c5a3c', '#1fb5a8'], r);
      look.pants = pick(JEANS.concat(KHAKI), r);
      if (chance(0.3, r)) {
        look.hat = pick(['cap', 'beanie'], r);
        look.hatColor = pick(['#303030', '#1b3f2e', '#0f2d57', '#e9e4d6'], r);
      }
      break;
    default:
      break;
  }
  const def = CIV_ARCHES[arche] || CIV_ARCHES.casual;
  return { look, arche, female, label: def.label[female ? 1 : 0], speed: def.speed * (0.9 + r() * 0.2) };
}

// ------------------------------------------------------------------ set members
const SIDE_PALETTES = {
  crips: ['#1f5fe0', '#0c2a74', '#2f6bff', '#4fc3ff', '#16408f', '#3a7bd5'],
  bloods: ['#d4202c', '#6d0b12', '#ff3b3b', '#b0101c', '#8a1420', '#e0182d'],
};
const GANG_PANTS = ['#b9a57a', '#1c1c1f', '#26324a', '#55585e', '#a8946a', '#2a2a30'];
const WHITE = '#f2f2f2';

/** Look for a member of `set` (data/sets.js). role: 'hang' | 'patrol' | 'fighter' | 'og'. */
export function gangLook(set, role = 'hang', district = 'north', r = Math.random) {
  const side = SIDES[set.side];
  const pal = SIDE_PALETTES[set.side] || SIDE_PALETTES.crips;
  const color = chance(0.35, r) ? set.accent || side.color : pick(pal, r);
  const female = role !== 'og' && chance(0.1, r);
  const look = {
    skin: skinFor(district, r),
    shirt: color,
    shirt2: side.dark,
    pants: pick(GANG_PANTS, r),
    shoes: pick([WHITE, WHITE, '#161616', color], r),
    hat: 'none',
    hatColor: color,
    bandana: color,
    hair: pick(HAIR_DARK, r),
    outfit: 'tee',
    build: 0.95 + r() * 0.15,
    female,
  };
  const roll = r();
  if (roll < 0.28) {
    // oversized white tee, rag hanging from the back pocket
    look.outfit = 'tee';
    look.shirt = chance(0.7, r) ? WHITE : color;
    look.shirt2 = color;
  } else if (roll < 0.48) {
    look.outfit = 'flannel'; // buttoned-top flannel over a white tee
    look.shirt = color;
    look.shirt2 = chance(0.5, r) ? side.dark : WHITE;
    look.pants = pick(['#b9a57a', '#1c1c1f', '#a8946a'], r); // Dickies
  } else if (roll < 0.63) {
    look.outfit = 'starter';
    look.shirt = color;
    look.shirt2 = chance(0.5, r) ? WHITE : '#161616';
  } else if (roll < 0.8) {
    look.outfit = 'jersey';
    look.shirt = chance(0.75, r) ? color : WHITE;
    look.shirt2 = look.shirt === WHITE ? color : WHITE;
  } else {
    look.outfit = 'hoodie';
    look.shirt = chance(0.6, r) ? color : pick(['#6e6e72', '#2a2a30'], r);
    look.shirt2 = color;
  }
  const h = r();
  if (h < 0.35) {
    look.hat = 'cap';
    look.hatColor = chance(0.7, r) ? color : '#161616';
  } else if (h < 0.55) {
    look.hat = 'bandana';
    look.hatColor = color;
  } else if (h < 0.62 && look.outfit === 'hoodie') {
    look.hat = 'beanie';
    look.hatColor = color;
  }
  if (role === 'og') {
    look.outfit = chance(0.6, r) ? 'flannel' : 'starter';
    look.shirt = side.dark;
    look.shirt2 = color;
    look.build = 1.08 + r() * 0.07;
    look.hat = chance(0.5, r) ? 'cap' : 'none';
    look.hatColor = '#161616';
    if (chance(0.4, r)) look.hair = '#4a4a4a'; // salt & pepper
  } else if (role === 'fighter') {
    look.build = 1.02 + r() * 0.12;
  }
  return look;
}

// ------------------------------------------------------------------ police
export function copLook(district = 'downtown', r = Math.random) {
  const female = chance(0.14, r);
  return {
    skin: skinFor(district === 'north' ? 'default' : district, r),
    shirt: '#22304d', // navy uniform shirt
    shirt2: '#d9b54a', // badge / patches
    pants: '#1b2336',
    shoes: '#0f0f0f',
    hat: 'cap',
    hatColor: '#1b2336',
    bandana: null,
    hair: pick(HAIR_ANY, r),
    outfit: 'uniform',
    build: 1.0 + r() * 0.12,
    female,
  };
}

// ------------------------------------------------------------------ names
const NICKS = [
  'Lil Man', 'Tiny', 'Duke', 'Pooh', 'Ace', 'June Bug', 'Peanut', 'Lil D', 'Dre', 'Tay', 'Pee Wee', 'Bird',
  'Scooter', 'Cool Breeze', 'Baby Ray', 'Big Mike', 'Lil Kev', 'Nook', 'Face', 'Boo', 'Man-Man', 'Stretch',
  'Q', 'Lil Rob', 'Sleepy', 'T-Bone', 'Bishop', 'Rocko', 'Dink', 'Poochie', 'Lil Earl', 'Chico', 'Smiley',
  'Lil Tone', 'Lil Lou', 'Deuce', 'Monk', 'Bam', 'Kiki', 'Dee Dee', 'Nene', 'Tasha', 'Boo Boo',
];
const OG_NICKS = ['Big Earl', 'Unc', 'Old Man Ray', 'Big Tone', 'Pops', 'OG Mack', 'Big Lou', 'Mister Lee'];
const COP_NAMES = ['Novak', 'Kowalski', "O'Brien", 'Hansen', 'Petersen', 'Jackson', 'Dvorak', 'Svoboda', 'Murphy', 'Reyes', 'Johnson', 'Williams', 'Sorensen', 'Kucera', 'Brennan', 'Tran', 'Lindquist', 'Carter'];

export function gangName(role = 'hang', female = false, r = Math.random) {
  if (role === 'og') return pick(OG_NICKS, r);
  return pick(NICKS, r);
}

export function copName(r = Math.random) {
  return `Officer ${pick(COP_NAMES, r)}`;
}
