// Sides, sets (gang "sets"), turf zones and rep ranks.
//
// Every set here is FICTIONAL, with invented neighborhood-style names so no set matches a real
// group. Turf sits on real 1993 North Omaha streets and landmarks (setting only).
// To rename a set, change `name` / `short` here — nothing else references the text.

import { at, TURF_RECTS } from './map.js';

export const SIDES = {
  crips: {
    id: 'crips',
    name: 'Crips',
    color: '#1f5fe0',
    dark: '#0c2a74',
    light: '#7fb0ff',
    rival: 'bloods',
    greet: 'cuz',
    shout: "What's crackin', cuz?",
    blurb: 'Blue rag, blue laces. Loyal to the set, loyal to the block.',
  },
  bloods: {
    id: 'bloods',
    name: 'Bloods',
    color: '#d4202c',
    dark: '#6d0b12',
    light: '#ff8a8f',
    rival: 'crips',
    greet: 'blood',
    shout: "What's poppin', blood?",
    blurb: 'Red rag, red flag. Family first, no matter what.',
  },
};

// hood = spawn point / hangout. turf = zone ids (from TURF_ZONES below) the set starts owning.
export const SETS = [
  {
    id: 'psc',
    side: 'crips',
    name: 'Parkside Crips',
    short: 'PSC',
    hood: { ...at('20th', 'pinkney', 11, -11), heading: -Math.PI / 2 },
    turf: ['kountze'],
    blurb: "Old heads and young G's posted up on the benches by Kountze Park. Big on loyalty, small on patience.",
    accent: '#39a0ff',
  },
  {
    id: 'ngc',
    side: 'crips',
    name: 'Northgate Crips',
    short: 'NGC',
    hood: { ...at('30th', 'hamilton', -12, -11), heading: 0 },
    turf: ['thirty', 'hamiltonwest'],
    blurb: "Run the North 30th strip from the corner store to the car wash. Always rolling deep in somebody's Cutlass.",
    accent: '#2f6bff',
  },
  {
    id: 'rlc',
    side: 'crips',
    name: 'Ridgeline Crips',
    short: 'RLC',
    hood: { ...at('36th', 'ames', 11, 12), heading: Math.PI },
    turf: ['amesnorth'],
    blurb: 'Northside riders off Ames Avenue. Quiet streets, loud cars, and nobody talks to the police.',
    accent: '#4fc3ff',
  },
  {
    id: 'lvb',
    side: 'bloods',
    name: 'Lakeview Bloods',
    short: 'LVB',
    hood: { ...at('24th', 'lake', 12, 12), heading: Math.PI },
    turf: ['lake24'],
    blurb: 'Hold down 24th & Lake, the old heart of North O. They know every shop owner on the strip by name.',
    accent: '#ff3b3b',
  },
  {
    id: 'nfp',
    side: 'bloods',
    name: 'Northfield Pirus',
    short: 'NFP',
    hood: { ...at('30th', 'fort', 12, 12), heading: Math.PI },
    turf: ['fort'],
    blurb: 'Way up north by Fort Street and Miller Park. Few in number, deep in heart, and they never back down.',
    accent: '#ff5a36',
  },
  {
    id: 'wbb',
    side: 'bloods',
    name: 'Westbrook Bloods',
    short: 'WBB',
    hood: { ...at('40th', 'hamilton', 11, -11), heading: -Math.PI / 2 },
    turf: ['westlake'],
    blurb: 'Westside of North O on the hill by 40th & Hamilton. Car guys first, fighters when they have to be.',
    accent: '#e0182d',
  },
];

// Turf zones. owner = initial controlling set (null = neutral ground: no set hangouts,
// more police). Rects come from data/map.js so they line up with streets.
export const TURF_ZONES = [
  // broad neutral areas first (later zones win on overlap in layout.zoneAt)
  { id: 'midtown', name: 'Midtown', owner: null, noTurf: true },
  { id: 'downtown', name: 'Downtown', owner: null, noTurf: true },
  { id: 'oldmarket', name: 'Old Market', owner: null, noTurf: true },
  { id: 'riverfront', name: 'Riverfront', owner: null, noTurf: true },
  { id: 'eastomaha', name: 'East Omaha', owner: null, noTurf: true },
  // North Omaha turf
  { id: 'fort', name: 'Fort Street', owner: 'nfp' },
  { id: 'amesnorth', name: 'Ames Avenue', owner: 'rlc' },
  { id: 'spencer', name: '30th & Spencer', owner: null },
  { id: 'kountze', name: 'Kountze Park', owner: 'psc' },
  { id: 'westlake', name: 'Hamilton Heights', owner: 'wbb' },
  { id: 'thirty', name: 'North 30th', owner: 'ngc' },
  { id: 'hamiltonwest', name: 'Hamilton & 30th', owner: 'ngc' },
  { id: 'lake24', name: '24th & Lake', owner: 'lvb' },
  { id: 'deuce', name: 'Near North Side', owner: null },
].map((z) => ({ ...z, rect: TURF_RECTS[z.id] }));

// noTurf zones can't be claimed (too much police) but still name the area on the HUD.
// owner null + no noTurf = contested ground anyone can take by tagging.

export const RANKS = [
  { index: 0, name: 'Lil Homie', rep: 0 },
  { index: 1, name: 'Homie', rep: 100 },
  { index: 2, name: 'Rider', rep: 300 },
  { index: 3, name: 'Soldier', rep: 700 },
  { index: 4, name: 'Shot Caller', rep: 1400 },
  { index: 5, name: 'Big Homie', rep: 2500 },
  { index: 6, name: 'OG', rep: 4000 },
];

export function rankForRep(rep) {
  let r = RANKS[0];
  for (const k of RANKS) if (rep >= k.rep) r = k;
  return r;
}

export function nextRank(rep) {
  return RANKS.find((k) => k.rep > rep) || null;
}

export const setById = (id) => SETS.find((s) => s.id === id) || null;
export const setsForSide = (side) => SETS.filter((s) => s.side === side);
export const zoneById = (id) => TURF_ZONES.find((z) => z.id === id) || null;
export const sideOfSet = (setId) => setById(setId)?.side || null;
export const areRivals = (setA, setB) => {
  const a = sideOfSet(setA);
  const b = sideOfSet(setB);
  return !!a && !!b && a !== b;
};

/** Neutral clothing colors used when the player "takes off their colors". */
export const NEUTRAL_COLORS = ['#e8e4d8', '#3b3b3b', '#6b5a45', '#2f4f3a', '#8a8a8a'];

// Look options for the character creator (ui/Menu.js) and NPC generation.
export const SKIN_TONES = ['#f1c7a3', '#d9a07a', '#b97a4f', '#8d5a3b', '#6b4029', '#4a2c1d', '#3a2217'];
export const OUTFITS = [
  { id: 'starter', name: 'Starter Jacket', desc: 'Satin team-style jacket in your colors' },
  { id: 'flannel', name: 'Flannel & Dickies', desc: 'Buttoned-top flannel, creased work pants' },
  { id: 'tee', name: 'White Tee', desc: 'Oversized white tee, rag hanging from the back pocket' },
  { id: 'jersey', name: 'Jersey', desc: 'Mesh team-style jersey in your colors' },
  { id: 'hoodie', name: 'Hoodie', desc: 'Heavy hoodie, good for Nebraska nights' },
];
export const HATS = [
  { id: 'none', name: 'No hat' },
  { id: 'cap', name: 'Snapback' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'bandana', name: 'Rag on the head' },
];
