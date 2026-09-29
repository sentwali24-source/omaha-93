// Shop catalog: prices (1993 dollars, see docs/research/period-1993.json pricesIn1993), items and
// fallback storefront names. Everything here is fictional.

export const PRICES = {
  snack: 3, // pop & chips
  dinner: 8, // a chicken dinner
  haircut: 12,
  respray: 100,
  tape: 10,
  payphone: 0.25,
};

export const HEAL = { snack: 30, dinner: 100 };

// OUTFITS / HATS come from data/sets.js; prices live here.
export const OUTFIT_PRICES = { starter: 60, flannel: 35, tee: 25, jersey: 50, hoodie: 40 };
export const HAT_PRICES = { none: 0, cap: 15, beanie: 12, bandana: 8 };

export const HAIRCUTS = [
  { id: 'fade', name: 'Low fade', desc: 'Clean and simple' },
  { id: 'hightop', name: 'High-top fade', desc: 'Tall and flat, still holding on in 1993' },
  { id: 'waves', name: 'Waves', desc: 'Brush it a hundred times a night' },
  { id: 'cornrows', name: 'Cornrows', desc: 'Straight back' },
  { id: 'braids', name: 'Braids', desc: 'Takes all afternoon, worth it' },
  { id: 'bald', name: 'Bald', desc: 'Shaved clean' },
];

// Cassettes: buying one sets state.flags['radio.<n>'] = true (Audio can unlock songs from it).
export const TAPES = [
  { n: 1, name: 'Northside Summer Mixtape', artist: 'DJ Slick', desc: 'G-funk and bass, dubbed off the radio' },
  { n: 2, name: 'Quiet Storm Slow Jams', artist: 'Various', desc: 'For the late-night cruise' },
  { n: 3, name: 'Bass Station Vol. 2', artist: 'Big Bottom Crew', desc: 'Rattle the trunk' },
  { n: 4, name: 'Dreamland Jazz Revue', artist: 'The 24th St Players', desc: 'Old heads love this one' },
  { n: 5, name: 'Sunday Morning Choir', artist: 'Mt. Olive Mass Choir', desc: 'Grandma approved' },
  { n: 6, name: 'Boom Bap Tape', artist: 'Omaha Beat Society', desc: 'East Coast drums, Midwest attitude' },
];

export const RESPRAY_COLORS = ['#7a1f2b', '#1f3a6b', '#2d5a3a', '#e8e4d8', '#b08a2e', '#4a2d5c', '#1b1b1f', '#8f9aa3', '#9c3f14', '#2a6f78', '#c9b06b', '#5c1a4a'];

// Names for fallback storefronts (only used when the city provides no POI of that type).
export const FALLBACK_NAMES = {
  store: ['Corner Food Mart', 'Quick Stop Market', 'Lucky Seven Grocery', 'Northside Mini Mart', 'Big Deal Foods', 'Sunrise Market'],
  food: ['Big Mama’s Chicken', 'Northside BBQ Pit', 'Chicken Shack', 'Uncle Earl’s Wings', 'Soul Food Kitchen', 'Burger Barn'],
  clothes: ['Fresh Threads', 'Kicks & Fits', 'Styles by Dee', 'Da Closet'],
  barber: ['Clean Cutz', 'Fade Masters', 'Sharp Edges Barber Shop'],
  garage: ['Northside Auto Body', "Ray's Paint & Body", 'Quick Spray Auto', 'Midtown Collision'],
  record: ['Sound Wave Records', 'Da Beat Shop', 'Tape Deck Music'],
  payphone: ['Payphone'],
};

// Short sign text for the panel badge (plain glyphs render everywhere, emoji fonts may not).
export const SHOP_ICONS = { store: 'POP', food: 'EAT', clothes: 'FIT', barber: '✂', garage: 'AUTO', record: '♫', payphone: '☎', hood: '★' };
