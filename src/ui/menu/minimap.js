// Turf mini-map for the "Claim a set" cards: a 2D canvas drawing of the neighborhood around a set's
// turf — blocks, parks, roads from game.layout, water from data/map.js WATER, and the turf zones
// tinted by starting owner (your set bright, same-side sets soft, rivals hatched in their color).

import { WATER, BOUNDS } from '../../data/map.js';
import { SIDES, TURF_ZONES, setById } from '../../data/sets.js';
import { rgbTriplet } from './dom.js';

const VIEW = { minX: BOUNDS.minX, maxX: BOUNDS.maxX + 90, minZ: BOUNDS.minZ, maxZ: BOUNDS.maxZ };
const ASPECT = 16 / 9; // width / height of the map window (matches the card canvas)

/** World window [x0, z0, w, h] framing a set's turf with some neighbors around it. */
export function turfWindow(set) {
  const own = TURF_ZONES.filter((z) => z.rect && set.turf.includes(z.id));
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const z of own) {
    x0 = Math.min(x0, z.rect.x0);
    x1 = Math.max(x1, z.rect.x1);
    z0 = Math.min(z0, z.rect.z0);
    z1 = Math.max(z1, z.rect.z1);
  }
  if (!own.length) {
    x0 = set.hood.x - 300;
    x1 = set.hood.x + 300;
    z0 = set.hood.z - 200;
    z1 = set.hood.z + 200;
  }
  let w = Math.max((x1 - x0) * 1.9, 760);
  let h = Math.max((z1 - z0) * 1.7, w / ASPECT);
  w = Math.max(w, h * ASPECT);
  h = w / ASPECT;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  let wx = cx - w / 2;
  let wz = cz - h / 2;
  wx = Math.max(VIEW.minX, Math.min(VIEW.maxX - w, wx));
  wz = Math.max(VIEW.minZ, Math.min(VIEW.maxZ - h, wz));
  return { x0: wx, z0: wz, w, h };
}

const hatchCache = new Map();
function hatch(ctx, color, alpha) {
  const key = color + alpha;
  let p = hatchCache.get(key);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.strokeStyle = `rgba(${rgbTriplet(color)}, ${alpha})`;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.moveTo(6, 10);
  g.lineTo(10, 6);
  g.stroke();
  p = ctx.createPattern(c, 'repeat');
  hatchCache.set(key, p);
  return p;
}

const shortStreet = (name) => name.replace(/ (St|Ave|Blvd)$/, '').toUpperCase();

/**
 * Draw the turf map for `set` into `canvas` (CSS size cssW × cssH).
 * @param {HTMLCanvasElement} canvas
 * @param {Layout} layout   game.layout (roads, blocks)
 * @param {object} set      SETS entry
 */
export function drawTurfMap(canvas, layout, set, cssW = 360, cssH = 240) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const side = SIDES[set.side];
  const rival = SIDES[side.rival];
  const win = turfWindow(set);
  const s = cssW / win.w;
  const X = (x) => (x - win.x0) * s;
  const Z = (z) => (z - win.z0) * s;
  const inView = (r) => r.x1 > win.x0 && r.x0 < win.x0 + win.w && r.z1 > win.z0 && r.z0 < win.z0 + win.h;

  // land
  ctx.fillStyle = '#17131f';
  ctx.fillRect(0, 0, cssW, cssH);

  // blocks + parks
  const blocks = layout?.blocks || [];
  for (const b of blocks) {
    if (!inView(b) || b.water) continue;
    ctx.fillStyle = b.park ? '#1d3524' : b.landmark ? '#2c2635' : '#221d2b';
    ctx.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
  }

  // turf tint (under the roads, like a printed map overlay)
  const zones = TURF_ZONES.filter((z) => z.rect && !z.noTurf && inView(z.rect));
  for (const z of zones) {
    const r = z.rect;
    const owner = z.owner ? setById(z.owner) : null;
    const x = X(r.x0);
    const y = Z(r.z0);
    const w = (r.x1 - r.x0) * s;
    const h = (r.z1 - r.z0) * s;
    if (owner && owner.id === set.id) {
      ctx.fillStyle = `rgba(${rgbTriplet(side.color)}, 0.5)`;
      ctx.fillRect(x, y, w, h);
    } else if (owner && owner.side === set.side) {
      ctx.fillStyle = `rgba(${rgbTriplet(side.color)}, 0.16)`;
      ctx.fillRect(x, y, w, h);
    } else if (owner) {
      ctx.fillStyle = `rgba(${rgbTriplet(rival.color)}, 0.16)`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = hatch(ctx, rival.color, 0.55);
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.fillStyle = hatch(ctx, '#bdb6c8', 0.18);
      ctx.fillRect(x, y, w, h);
    }
  }

  // roads
  const edges = layout?.edges || [];
  ctx.lineCap = 'square';
  for (let pass = 0; pass < 2; pass++) {
    for (const e of edges) {
      if (!!e.major !== (pass === 1)) continue;
      const a = layout.nodeById(e.a);
      const b = layout.nodeById(e.b);
      if (!a || !b) continue;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minZ = Math.min(a.z, b.z);
      const maxZ = Math.max(a.z, b.z);
      if (maxX < win.x0 || minX > win.x0 + win.w || maxZ < win.z0 || minZ > win.z0 + win.h) continue;
      ctx.strokeStyle = e.major ? '#8f879c' : '#4d4659';
      ctx.lineWidth = Math.max(e.major ? 2.2 : 1.1, e.width * s * 0.95);
      ctx.beginPath();
      ctx.moveTo(X(a.x), Z(a.z));
      ctx.lineTo(X(b.x), Z(b.z));
      ctx.stroke();
    }
  }

  // water (river runs past the east edge of the map)
  for (const w of WATER) {
    if (!inView(w)) continue;
    const x = X(w.x0);
    const y = Z(w.z0);
    const ww = (w.x1 - w.x0) * s;
    const hh = (w.z1 - w.z0) * s;
    ctx.fillStyle = '#16365a';
    ctx.fillRect(x, y, ww, hh);
    ctx.strokeStyle = 'rgba(120, 190, 255, 0.25)';
    ctx.lineWidth = 1;
    for (let yy = Math.max(0, y) + 4; yy < Math.min(cssH, y + hh); yy += 7) {
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x) + 3, yy);
      ctx.lineTo(Math.min(cssW, x + ww) - 3, yy);
      ctx.stroke();
    }
  }

  // zone borders + labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try {
    ctx.letterSpacing = '1px';
  } catch {
    /* older canvas */
  }
  for (const z of zones) {
    const r = z.rect;
    const owner = z.owner ? setById(z.owner) : null;
    const mine = owner && owner.id === set.id;
    const x = X(r.x0);
    const y = Z(r.z0);
    const w = (r.x1 - r.x0) * s;
    const h = (r.z1 - r.z0) * s;
    ctx.lineWidth = mine ? 2.5 : 1;
    ctx.strokeStyle = mine ? side.light : owner ? (owner.side === set.side ? `rgba(${rgbTriplet(side.light)}, 0.45)` : `rgba(${rgbTriplet(rival.light)}, 0.55)`) : 'rgba(220, 210, 230, 0.25)';
    ctx.setLineDash(mine ? [] : [4, 3]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    if (w < 46 || h < 22) continue;
    const size = mine ? 15 : 12;
    ctx.font = `${size}px 'Bebas Neue', 'Anton', Impact, 'Arial Narrow', sans-serif`;
    const label = z.name.toUpperCase();
    // keep the label inside both the zone's visible part and the canvas
    const half = ctx.measureText(label).width / 2 + 4;
    const vx0 = Math.max(0, x);
    const vx1 = Math.min(cssW, x + w);
    if (vx1 - vx0 < half * 2 - 8) continue;
    const lx = Math.max(vx0 + half, Math.min(vx1 - half, x + w / 2));
    const ly = Math.max(12, Math.min(cssH - 14, y + h / 2));
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8, 6, 14, 0.85)';
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = mine ? '#ffffff' : owner ? (owner.side === set.side ? side.light : rival.light) : '#b9b1c4';
    ctx.fillText(label, lx, ly);
    if (owner && !mine) {
      ctx.font = `10px 'VT323', 'Courier New', monospace`;
      ctx.fillStyle = 'rgba(230, 225, 240, 0.7)';
      ctx.fillText(owner.short, lx, ly + 11);
    }
  }

  // major street names along the top / left edges
  ctx.font = `10px 'VT323', 'Courier New', monospace`;
  ctx.fillStyle = 'rgba(235, 228, 245, 0.75)';
  for (const st of layout?.nsStreets || []) {
    if (!st.major) continue;
    const px = X(st.x);
    if (px < 18 || px > cssW - 18) continue;
    ctx.fillText(shortStreet(st.name), px, cssH - 7);
  }
  ctx.textAlign = 'left';
  for (const st of layout?.ewStreets || []) {
    if (!st.major) continue;
    const pz = Z(st.z);
    if (pz < 12 || pz > cssH - 16) continue;
    ctx.fillText(shortStreet(st.name), 4, pz - 6);
  }

  // hood marker
  const hx = X(set.hood.x);
  const hz = Z(set.hood.z);
  ctx.beginPath();
  ctx.arc(hx, hz, 9, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgbTriplet(side.color)}, 0.35)`;
  ctx.fill();
  drawStar(ctx, hx, hz, 6.5, '#ffffff', '#0b0b12');

  // compass
  ctx.save();
  ctx.translate(cssW - 14, 16);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fillStyle = '#f2b632';
  ctx.fill();
  ctx.font = `11px 'VT323', 'Courier New', monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2b632';
  ctx.fillText('N', 0, 14);
  ctx.restore();

  // downtown hint when the window stops short of it
  if (win.z0 + win.h < -60) {
    ctx.font = `10px 'VT323', 'Courier New', monospace`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242, 182, 50, 0.8)';
    ctx.fillText('DOWNTOWN ↓', cssW - 6, cssH - 18);
  }
}

function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Rival-side zones that touch (share an edge with) a set's turf — "who's next door". */
export function rivalNeighbors(set) {
  const own = TURF_ZONES.filter((z) => z.rect && set.turf.includes(z.id));
  const out = [];
  for (const z of TURF_ZONES) {
    if (!z.rect || !z.owner || set.turf.includes(z.id)) continue;
    const o = setById(z.owner);
    if (!o || o.side === set.side) continue;
    const touches = own.some((m) => z.rect.x0 <= m.rect.x1 + 1 && z.rect.x1 >= m.rect.x0 - 1 && z.rect.z0 <= m.rect.z1 + 1 && z.rect.z1 >= m.rect.z0 - 1);
    if (touches && !out.includes(o)) out.push(o);
  }
  return out;
}
