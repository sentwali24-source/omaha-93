import * as THREE from 'three';

// Sign atlas: every lettered sign on the landmarks (marquees, neon, highway signs, building
// names, historical markers) drawn into one canvas, plus a matching emissive canvas for the
// signs that glow at night. One material draws them all.
//
// Each spec: { id, w, h (px at scale 1), lit: 'full' | 'text' | false, draw(g, w, h, lit) }.
// draw() is called twice: for the day map (lit = false) and, for lit signs, for the glow
// map (lit = true, on black).

const SANS = '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
const SANS2 = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", Times, serif';

/** Draw text centred at (cx, cy), shrinking the font until it fits maxW × maxH. */
function fit(g, text, cx, cy, maxW, maxH, family = SANS, weight = 'bold', color = '#000') {
  let size = Math.floor(maxH);
  g.font = `${weight} ${size}px ${family}`;
  let w = g.measureText(text).width;
  if (w > maxW) {
    size = Math.max(6, Math.floor((size * maxW) / w));
    g.font = `${weight} ${size}px ${family}`;
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy + size * 0.04);
}

function panel(g, w, h, bg, border, bw = 0.05) {
  g.fillStyle = border || bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    const b = Math.max(2, Math.min(w, h) * bw);
    g.fillStyle = bg;
    g.fillRect(b, b, w - b * 2, h - b * 2);
  }
}

/** Simple building-name plate. */
function plate(text, { bg = '#e9e4d8', fg = '#3a2f26', family = SERIF, weight = 'bold', border = null, sub = null, subSize = 0.28 } = {}) {
  return (g, w, h, lit) => {
    if (!lit) panel(g, w, h, bg, border);
    const col = lit ? fg === '#3a2f26' ? '#ffe9b8' : fg : fg;
    if (sub) {
      fit(g, text, w / 2, h * 0.36, w * 0.92, h * 0.5, family, weight, col);
      fit(g, sub, w / 2, h * 0.78, w * 0.9, h * subSize, family, 'bold', col);
    } else fit(g, text, w / 2, h / 2, w * 0.92, h * 0.72, family, weight, col);
  };
}

function star(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function interstateShield(g, cx, cy, s, num) {
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(cx - s * 0.5, cy - s * 0.45);
  g.quadraticCurveTo(cx - s * 0.25, cy - s * 0.55, cx, cy - s * 0.45);
  g.quadraticCurveTo(cx + s * 0.25, cy - s * 0.55, cx + s * 0.5, cy - s * 0.45);
  g.quadraticCurveTo(cx + s * 0.55, cy + s * 0.2, cx, cy + s * 0.55);
  g.quadraticCurveTo(cx - s * 0.55, cy + s * 0.2, cx - s * 0.5, cy - s * 0.45);
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#b3202a';
  g.fillRect(cx - s, cy - s, s * 2, s * 0.62);
  g.fillStyle = '#1f3f8f';
  g.fillRect(cx - s, cy - s * 0.32, s * 2, s * 1.2);
  g.restore();
  fit(g, 'INTERSTATE', cx, cy - s * 0.4, s * 0.7, s * 0.1, SANS2, 'bold', '#fff');
  fit(g, num, cx, cy + s * 0.08, s * 0.8, s * 0.5, SANS2, 'bold', '#fff');
}

function usShield(g, cx, cy, s, num) {
  g.fillStyle = '#fff';
  g.fillRect(cx - s * 0.46, cy - s * 0.48, s * 0.92, s * 0.96);
  g.fillStyle = '#111';
  g.beginPath();
  g.moveTo(cx - s * 0.4, cy - s * 0.42);
  g.lineTo(cx + s * 0.4, cy - s * 0.42);
  g.lineTo(cx + s * 0.38, cy + s * 0.1);
  g.quadraticCurveTo(cx + s * 0.3, cy + s * 0.36, cx, cy + s * 0.44);
  g.quadraticCurveTo(cx - s * 0.3, cy + s * 0.36, cx - s * 0.38, cy + s * 0.1);
  g.closePath();
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(cx - s * 0.34, cy - s * 0.37);
  g.lineTo(cx + s * 0.34, cy - s * 0.37);
  g.lineTo(cx + s * 0.32, cy + s * 0.08);
  g.quadraticCurveTo(cx + s * 0.26, cy + s * 0.3, cx, cy + s * 0.38);
  g.quadraticCurveTo(cx - s * 0.26, cy + s * 0.3, cx - s * 0.32, cy + s * 0.08);
  g.closePath();
  g.fill();
  fit(g, num, cx, cy - s * 0.02, s * 0.56, s * 0.42, SANS2, 'bold', '#111');
}

/** Green guide sign: shields on the left, direction + destination on the right. */
function guide({ shields = [], dir = '', dest = '', exit = null }) {
  return (g, w, h, lit) => {
    const fg = lit ? '#fffbe8' : '#ffffff';
    if (!lit) {
      panel(g, w, h, '#136b3c', '#f4f4f4', 0.025);
    }
    const s = h * 0.46;
    let x = w * 0.05 + s * 0.5;
    for (const sh of shields) {
      if (!lit) {
        if (sh.type === 'I') interstateShield(g, x, h * 0.36, s, sh.num);
        else usShield(g, x, h * 0.36, s, sh.num);
      }
      x += s * 1.05;
    }
    const tx = shields.length ? x - s * 0.5 + w * 0.02 : w * 0.06;
    const tw = w - tx - w * 0.05;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const dirSize = h * 0.2;
    g.font = `bold ${dirSize}px ${SANS2}`;
    g.fillStyle = fg;
    g.fillText(dir, tx, h * 0.3, tw);
    let size = h * 0.24;
    g.font = `bold ${size}px ${SANS2}`;
    if (g.measureText(dest).width > w * 0.9) size = (size * w * 0.9) / g.measureText(dest).width;
    g.font = `bold ${size}px ${SANS2}`;
    g.fillText(dest, w * 0.06, h * 0.74);
    if (exit && !lit) {
      g.fillStyle = '#136b3c';
      g.fillRect(w * 0.7, 0, w * 0.3, h * 0.16);
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.strokeRect(w * 0.7, 0, w * 0.3, h * 0.16);
      fit(g, exit, w * 0.85, h * 0.08, w * 0.26, h * 0.12, SANS2, 'bold', '#fff');
    }
  };
}

function vertical(text, { bg, fg, border, bulbs = false, neon = false }) {
  return (g, w, h, lit) => {
    if (!lit) panel(g, w, h, bg, border, 0.08);
    const n = text.length;
    const cell = (h * 0.9) / n;
    for (let i = 0; i < n; i++) {
      const cy = h * 0.05 + cell * (i + 0.5);
      if (neon && lit) {
        g.shadowColor = fg;
        g.shadowBlur = w * 0.12;
      }
      fit(g, text[i], w / 2, cy, w * 0.7, cell * 0.92, SANS, 'bold', lit ? (neon ? fg : '#fff2c4') : fg);
      g.shadowBlur = 0;
    }
    if (bulbs) {
      g.fillStyle = lit ? '#fff6d0' : '#f6e6a8';
      const step = w * 0.16;
      for (let y = step / 2; y < h; y += step) {
        g.beginPath();
        g.arc(w * 0.06, y, w * 0.035, 0, Math.PI * 2);
        g.arc(w * 0.94, y, w * 0.035, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
}

export const SIGN_SPECS = [
  { id: 'orpheum-blade', w: 150, h: 720, lit: 'full', draw: vertical('ORPHEUM', { bg: '#f0e6c8', fg: '#b01e22', border: '#6d1414', bulbs: true }) },
  {
    id: 'orpheum-marquee',
    w: 1000,
    h: 150,
    lit: 'full',
    draw: (g, w, h, lit) => {
      if (!lit) panel(g, w, h, '#f7f2e4', '#8b1a1a', 0.08);
      fit(g, 'OMAHA SYMPHONY', w / 2, h * 0.34, w * 0.86, h * 0.3, SANS2, 'bold', lit ? '#fff4d0' : '#1d1d1d');
      fit(g, 'OPERA OMAHA  ·  BALLET  ·  BROADWAY', w / 2, h * 0.7, w * 0.86, h * 0.24, SANS2, 'bold', lit ? '#fff4d0' : '#1d1d1d');
    },
  },
  { id: 'orpheum-name', w: 700, h: 120, lit: 'text', draw: plate('ORPHEUM', { bg: '#7d1616', fg: '#fff0b0', family: SANS }) },
  {
    id: 'omahastar',
    w: 720,
    h: 130,
    lit: 'full',
    draw: (g, w, h, lit) => {
      if (!lit) panel(g, w, h, '#f4efe2', '#7b1d1d', 0.06);
      star(g, w * 0.09, h / 2, h * 0.34, lit ? '#ffe9a0' : '#c3262b');
      star(g, w * 0.91, h / 2, h * 0.34, lit ? '#ffe9a0' : '#c3262b');
      fit(g, 'THE OMAHA STAR', w / 2, h / 2, w * 0.7, h * 0.62, SERIF, 'bold', lit ? '#ffe9b0' : '#7b1d1d');
    },
  },
  { id: 'dreamland', w: 130, h: 720, lit: 'text', draw: vertical('DREAMLAND', { bg: '#1f1b1e', fg: '#ff3d4a', border: '#777', neon: true }) },
  { id: 'jewell', w: 420, h: 80, lit: false, draw: plate('JEWELL', { bg: '#d9cfbc', fg: '#5a4a3a' }) },
  {
    id: 'skeets',
    w: 620,
    h: 170,
    lit: 'full',
    draw: (g, w, h, lit) => {
      if (!lit) panel(g, w, h, '#f7f4ea', '#b3231f', 0.06);
      fit(g, "SKEET'S", w / 2, h * 0.36, w * 0.8, h * 0.44, SANS, 'bold', lit ? '#ffe2b8' : '#b3231f');
      fit(g, 'RIBS & CHICKEN', w / 2, h * 0.76, w * 0.8, h * 0.24, SANS2, 'bold', lit ? '#ffe2b8' : '#222');
    },
  },
  {
    id: 'fairdeal',
    w: 620,
    h: 130,
    lit: 'full',
    draw: (g, w, h, lit) => {
      if (!lit) panel(g, w, h, '#fbf8ef', '#1f4f8f', 0.06);
      fit(g, 'FAIR DEAL CAFE', w / 2, h / 2, w * 0.86, h * 0.56, SANS, 'bold', lit ? '#fff0c8' : '#b32424');
    },
  },
  { id: 'gpbhm', w: 760, h: 130, lit: 'full', draw: plate('GREAT PLAINS', { bg: '#f1ece0', fg: '#2b2b2b', family: SANS2, sub: 'BLACK HISTORY MUSEUM', subSize: 0.32 }) },
  { id: 'osbn', w: 760, h: 110, lit: 'full', draw: plate('BUSINESS TECHNOLOGY CENTER', { bg: '#f2f2ee', fg: '#18426e', family: SANS2 }) },
  { id: 'hwy-us75n', w: 720, h: 300, lit: 'full', draw: guide({ shields: [{ type: 'US', num: '75' }], dir: 'NORTH', dest: 'North Freeway', exit: null }) },
  { id: 'hwy-i480e', w: 720, h: 300, lit: 'full', draw: guide({ shields: [{ type: 'I', num: '480' }], dir: 'EAST', dest: 'Council Bluffs', exit: null }) },
  { id: 'hwy-i480w', w: 720, h: 300, lit: 'full', draw: guide({ shields: [{ type: 'I', num: '480' }, { type: 'US', num: '75' }], dir: 'WEST  NORTH', dest: 'Downtown  Omaha' }) },
  { id: 'hwy-cuming', w: 720, h: 300, lit: 'full', draw: guide({ dir: 'Cuming St', dest: 'Creighton Univ', exit: 'EXIT 2' }) },
  { id: 'hwy-lake', w: 720, h: 300, lit: 'full', draw: guide({ dir: 'Lake St', dest: '24th St  30th St', exit: 'EXIT 4' }) },
  { id: 'hwy-airport', w: 720, h: 300, lit: 'full', draw: guide({ dir: 'Eppley', dest: 'Airfield', exit: 'EXIT 6' }) },
  { id: 'iowa-line', w: 600, h: 200, lit: false, draw: plate('IOWA', { bg: '#136b3c', fg: '#ffffff', family: SANS2, border: '#f4f4f4', sub: 'STATE LINE', subSize: 0.3 }) },
  {
    id: 'roadclosed',
    w: 600,
    h: 260,
    lit: false,
    draw: (g, w, h) => {
      panel(g, w, h, '#f7f7f2', '#111', 0.04);
      fit(g, 'ROAD CLOSED', w / 2, h * 0.34, w * 0.86, h * 0.34, SANS2, 'bold', '#111');
      fit(g, 'HIGH WATER', w / 2, h * 0.72, w * 0.8, h * 0.28, SANS2, 'bold', '#111');
    },
  },
  { id: 'eppley', w: 820, h: 120, lit: 'full', draw: plate('EPPLEY AIRFIELD', { bg: '#1e3c6e', fg: '#ffffff', family: SANS2 }) },
  { id: 'unionpacific', w: 820, h: 110, lit: false, draw: plate('UNION PACIFIC', { bg: '#cdb99a', fg: '#4a3a2a' }) },
  { id: 'westernheritage', w: 900, h: 110, lit: 'full', draw: plate('WESTERN HERITAGE MUSEUM', { bg: '#efe6cf', fg: '#5b4630', family: SANS2 }) },
  { id: 'unionstation', w: 820, h: 100, lit: false, draw: plate('UNION STATION', { bg: '#ece2c8', fg: '#6b5238', family: SANS2 }) },
  { id: 'civicaud', w: 820, h: 110, lit: 'text', draw: plate('CIVIC AUDITORIUM', { bg: '#b8b2a6', fg: '#1f2a44', family: SANS2 }) },
  { id: 'worldherald', w: 860, h: 110, lit: 'text', draw: plate('OMAHA WORLD-HERALD', { bg: '#d8cdb8', fg: '#1e1e1e', family: SERIF }) },
  { id: 'mutual', w: 860, h: 130, lit: 'text', draw: plate('MUTUAL OF OMAHA', { bg: '#2d4f86', fg: '#ffffff', family: SANS2 }) },
  { id: 'conagra', w: 520, h: 120, lit: 'text', draw: plate('ConAgra', { bg: '#e9e6dc', fg: '#1d5a2f', family: SERIF }) },
  { id: 'heartland', w: 960, h: 140, lit: false, draw: plate('HEARTLAND OF AMERICA', { bg: '#6b4c32', fg: '#f3e6c4', family: SERIF, sub: 'PARK', subSize: 0.3 }) },
  { id: 'kountze', w: 640, h: 130, lit: false, draw: plate('KOUNTZE PARK', { bg: '#5a3e28', fg: '#f3e6c4', family: SERIF }) },
  { id: 'millerpark', w: 640, h: 130, lit: false, draw: plate('MILLER PARK', { bg: '#5a3e28', fg: '#f3e6c4', family: SERIF }) },
  { id: 'bemispark', w: 640, h: 130, lit: false, draw: plate('BEMIS PARK', { bg: '#5a3e28', fg: '#f3e6c4', family: SERIF }) },
  { id: 'leahymall', w: 760, h: 150, lit: false, draw: plate('GENE LEAHY MALL', { bg: '#5a3e28', fg: '#f3e6c4', family: SERIF, sub: 'CENTRAL PARK MALL', subSize: 0.26 }) },
  { id: 'fortomaha', w: 760, h: 170, lit: false, draw: plate('FORT OMAHA', { bg: '#e7dfcc', fg: '#3b2a1e', family: SERIF, sub: 'Metropolitan Community College', subSize: 0.22 }) },
  { id: 'northhigh', w: 760, h: 120, lit: false, draw: plate('OMAHA NORTH HIGH SCHOOL', { bg: '#d9d2c1', fg: '#16305b', family: SERIF }) },
  { id: 'centralhigh', w: 760, h: 110, lit: false, draw: plate('CENTRAL HIGH SCHOOL', { bg: '#ddd5c4', fg: '#3b3228', family: SERIF }) },
  { id: 'creighton', w: 760, h: 120, lit: false, draw: plate('CREIGHTON UNIVERSITY', { bg: '#1c3a6b', fg: '#ffffff', family: SERIF }) },
  { id: 'joslyn', w: 760, h: 100, lit: false, draw: plate('JOSLYN ART MUSEUM', { bg: '#d8a89a', fg: '#5a3028', family: SERIF, weight: 'normal' }) },
  { id: 'police', w: 760, h: 110, lit: 'text', draw: plate('POLICE HEADQUARTERS', { bg: '#cfcac0', fg: '#15254a', family: SANS2 }) },
  { id: 'courthouse', w: 860, h: 90, lit: false, draw: plate('DOUGLAS COUNTY COURT HOUSE', { bg: '#dcd5c5', fg: '#51473a', family: SERIF }) },
  { id: 'cityhall', w: 760, h: 110, lit: false, draw: plate('OMAHA-DOUGLAS CIVIC CENTER', { bg: '#d3d3cf', fg: '#222', family: SANS2 }) },
  { id: 'library', w: 760, h: 100, lit: false, draw: plate('W. DALE CLARK LIBRARY', { bg: '#e0d6c0', fg: '#3d352b', family: SANS2 }) },
  { id: 'brandeis', w: 700, h: 110, lit: 'text', draw: plate('BRANDEIS', { bg: '#ddd0b4', fg: '#3b2c1f', family: SERIF }) },
  { id: 'chieftain', w: 620, h: 120, lit: 'text', draw: plate('HOTEL CHIEFTAIN', { bg: '#2a2a2a', fg: '#ff4a3a', family: SANS }) },
  { id: 'asarco', w: 700, h: 110, lit: false, draw: plate('ASARCO  OMAHA PLANT', { bg: '#e6e2d6', fg: '#333', family: SANS2 }) },
  { id: 'hilltop', w: 560, h: 120, lit: false, draw: plate('HILLTOP HOMES', { bg: '#f2efe6', fg: '#1f3f73', family: SANS2 }) },
  { id: 'pleasantview', w: 560, h: 120, lit: false, draw: plate('PLEASANTVIEW HOMES', { bg: '#f2efe6', fg: '#1f3f73', family: SANS2 }) },
  { id: 'logan', w: 560, h: 120, lit: false, draw: plate('LOGAN FONTENELLE', { bg: '#f2efe6', fg: '#1f3f73', family: SANS2 }) },
  { id: 'spencer', w: 560, h: 120, lit: false, draw: plate('SPENCER HOMES', { bg: '#f2efe6', fg: '#1f3f73', family: SANS2 }) },
  { id: 'keepout', w: 560, h: 180, lit: false, draw: plate('KEEP OUT', { bg: '#f6f3ea', fg: '#b01e1e', family: SANS2, sub: 'DEMOLITION AREA', subSize: 0.28 }) },
  {
    id: 'malcolmx',
    w: 420,
    h: 320,
    lit: false,
    draw: (g, w, h) => {
      panel(g, w, h, '#4a3322', '#2c1d13', 0.04);
      g.fillStyle = '#e8dcc0';
      fit(g, 'MALCOLM X', w / 2, h * 0.17, w * 0.8, h * 0.16, SERIF, 'bold', '#efe3c6');
      fit(g, 'BIRTHSITE', w / 2, h * 0.31, w * 0.6, h * 0.1, SERIF, 'bold', '#efe3c6');
      const lines = ['Malcolm X was born near this', 'site on May 19, 1925, and spent', 'his early childhood in Omaha.', 'He became a leading voice for', 'human rights in America.'];
      lines.forEach((t, i) => fit(g, t, w / 2, h * (0.46 + i * 0.085), w * 0.84, h * 0.065, SERIF, 'normal', '#e8dcc0'));
      fit(g, 'Nebraska State Historical Marker', w / 2, h * 0.9, w * 0.8, h * 0.06, SERIF, 'italic', '#d2c5a5');
    },
  },
  { id: 'rw14', w: 200, h: 260, lit: false, draw: (g, w, h) => fit(g, '14', w / 2, h / 2, w * 0.9, h * 0.9, SANS2, 'bold', '#f2f2ee') },
  { id: 'rw32', w: 200, h: 260, lit: false, draw: (g, w, h) => fit(g, '32', w / 2, h / 2, w * 0.9, h * 0.9, SANS2, 'bold', '#f2f2ee') },
  { id: 'kiewit', w: 700, h: 100, lit: false, draw: plate('KIEWIT PLAZA', { bg: '#dcdcd6', fg: '#2a2a2a', family: SANS2 }) },
  { id: 'blackstone', w: 180, h: 640, lit: 'text', draw: vertical('BLACKSTONE', { bg: '#2a1f1b', fg: '#ffd27a', border: '#8a6a3a', neon: true }) },
  { id: 'stjohns', w: 700, h: 100, lit: false, draw: plate("ST. JOHN'S CHURCH", { bg: '#d8c7a4', fg: '#4a3622', family: SERIF }) },
  { id: 'nwbell', w: 800, h: 100, lit: 'text', draw: plate('NORTHWESTERN BELL', { bg: '#cfcfcb', fg: '#16305b', family: SANS2 }) },
  { id: 'uswest', w: 700, h: 110, lit: 'text', draw: plate('U S WEST', { bg: '#2c2c2c', fg: '#ffffff', family: SANS2 }) },
  { id: 'firstnational', w: 820, h: 100, lit: 'text', draw: plate('FIRST NATIONAL BANK', { bg: '#d7d2c6', fg: '#1f3a28', family: SERIF }) },
  { id: 'woodmen', w: 700, h: 100, lit: false, draw: plate('WOODMEN TOWER', { bg: '#3b2e2a', fg: '#e6d7c2', family: SERIF }) },
  { id: 'bluffsrun', w: 700, h: 150, lit: 'full', draw: plate('BLUFFS RUN', { bg: '#1e2c5a', fg: '#ffd84a', family: SANS, sub: 'GREYHOUND PARK', subSize: 0.28 }) },
  { id: 'cb', w: 700, h: 150, lit: false, draw: plate('COUNCIL BLUFFS', { bg: '#136b3c', fg: '#ffffff', family: SANS2, border: '#f4f4f4', sub: 'NEXT 3 EXITS', subSize: 0.26 }) },
];

/** Pack every sign into one atlas. Returns { tex, glow, rect(id) → {u0, v0, u1, v1, aspect} }. */
export function buildSignAtlas(game) {
  const detail = game.quality?.detail ?? 1;
  const scale = detail === 0 ? 0.5 : 1;
  const W = 2048 * scale;
  const pad = 6 * scale;
  // shelf packing, tallest first
  const items = SIGN_SPECS.map((s) => ({ ...s, pw: Math.ceil(s.w * scale), ph: Math.ceil(s.h * scale) })).sort((a, b) => b.ph - a.ph);
  let x = pad;
  let y = pad;
  let shelf = 0;
  for (const it of items) {
    if (x + it.pw + pad > W) {
      x = pad;
      y += shelf + pad;
      shelf = 0;
    }
    it.x = x;
    it.y = y;
    x += it.pw + pad;
    shelf = Math.max(shelf, it.ph);
  }
  let H = 256;
  while (H < y + shelf + pad) H *= 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const e = document.createElement('canvas');
  e.width = W;
  e.height = H;
  const g = c.getContext('2d');
  const k = e.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  k.fillStyle = '#000';
  k.fillRect(0, 0, W, H);
  const rects = new Map();
  for (const it of items) {
    g.save();
    g.translate(it.x, it.y);
    g.beginPath();
    g.rect(0, 0, it.pw, it.ph);
    g.clip();
    it.draw(g, it.pw, it.ph, false);
    g.restore();
    if (it.lit) {
      k.save();
      k.translate(it.x, it.y);
      k.beginPath();
      k.rect(0, 0, it.pw, it.ph);
      k.clip();
      if (it.lit === 'full') {
        // backlit box: the whole face glows (dimmer), letters brighter on top
        k.drawImage(c, it.x, it.y, it.pw, it.ph, 0, 0, it.pw, it.ph);
        k.fillStyle = 'rgba(0,0,0,0.25)';
        k.fillRect(0, 0, it.pw, it.ph);
      } else {
        it.draw(k, it.pw, it.ph, true);
      }
      k.restore();
    }
    // half-texel inset avoids bleeding from neighbours
    const inset = 1.5;
    rects.set(it.id, {
      u0: (it.x + inset) / W,
      u1: (it.x + it.pw - inset) / W,
      v0: 1 - (it.y + it.ph - inset) / H,
      v1: 1 - (it.y + inset) / H,
      aspect: it.w / it.h,
    });
  }
  const mk = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, game.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return {
    tex: mk(c),
    glow: mk(e),
    rect(id) {
      const r = rects.get(id);
      if (!r) throw new Error(`landmarks: unknown sign ${id}`);
      return r;
    },
  };
}
