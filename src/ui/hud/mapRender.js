// Shared 2D map drawing for the minimap (ui/hud/Minimap.js) and the full-screen map (ui/MapScreen.js).
//
// Everything is drawn from data (game.layout + data/map.js), never from meshes, so the map always
// matches the road graph the AI drives on. A "view" maps world meters to canvas pixels:
//
//   px = (x - view.ox) * view.s        py = (z - view.oz) * view.s        (north = up, since -Z is north)
//
// view = { s, ox, oz, w, h }  (w/h = canvas pixel size, used for culling)

import { LANDMARKS, WATER, PARKS, FREEWAYS } from '../../data/map.js';
import { SIDES, setById, TURF_ZONES } from '../../data/sets.js';

// World rect covered by the pre-rendered minimap canvas (playable bounds + a margin + the river).
export const MAP_EXTENT = { x0: -560, x1: 1080, z0: -1360, z1: 500 };

export const PALETTE = {
  void: '#15181b', // off the map
  outside: '#252a22', // land beyond the playable bounds (Iowa shore, fields)
  sidewalk: '#5d5f57',
  casing: '#16171a',
  road: '#a39e91',
  roadMajor: '#e6d9ad',
  centerLine: 'rgba(196, 150, 40, 0.85)',
  water: '#1f5585',
  waterDeep: '#1a4671',
  waterEdge: '#7fb4dc',
  waterFlow: 'rgba(170, 210, 240, 0.22)',
  park: '#3f6d33',
  parkEdge: '#79a957',
  lot: '#4e5a3c', // grassy empty lots (h = 0 landmarks)
  landmark: '#77716a',
  tower: '#8f897b',
  landmarkEdge: '#efe3c2',
  freeway: 'rgba(150, 158, 178, 0.62)',
  freewayEdge: 'rgba(12, 12, 18, 0.9)',
  rails: 'rgba(40, 32, 28, 0.9)',
};

// Blocks are tinted by district so the neighborhoods read at a glance.
export const DISTRICT_TINT = {
  north: '#3d3b33',
  eastomaha: '#383b3c',
  midtown: '#403c47',
  nodo: '#473b31',
  downtown: '#353b4d',
  oldmarket: '#552f27',
  riverfront: '#34423b',
};

// Point-of-interest icon colors (minimap + map legend).
export const ICON_STYLE = {
  clothes: { bg: '#8e3fd1', label: 'Clothes' },
  food: { bg: '#e67a1c', label: 'Food' },
  garage: { bg: '#5a6f86', label: 'Garage / respray' },
  payphone: { bg: '#17a39a', label: 'Payphone' },
  hood: { bg: '#f2b632', label: 'Set hangout' },
  mission: { bg: '#f7d23a', label: 'Mission' },
  target: { bg: '#e8313c', label: 'Target' },
  shop: { bg: '#35b852', label: 'Shop' },
  waypoint: { bg: '#ff4fb8', label: 'Waypoint' },
};

// ------------------------------------------------------------------ static city

/** Draw the static city (no turf, no blips) into ctx for the given view. */
export function drawCity(ctx, layout, view, { detail = 1 } = {}) {
  const { s, ox, oz, w, h } = view;
  const X = (x) => (x - ox) * s;
  const Z = (z) => (z - oz) * s;
  const visible = (x0, z0, x1, z1) => X(x1) >= -2 && X(x0) <= w + 2 && Z(z1) >= -2 && Z(z0) <= h + 2;
  const fill = (x0, z0, x1, z1) => {
    if (visible(x0, z0, x1, z1)) ctx.fillRect(X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s);
  };
  const B = layout.bounds;

  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.outside;
  fill(MAP_EXTENT.x0 - 2000, MAP_EXTENT.z0 - 2000, MAP_EXTENT.x1 + 2000, MAP_EXTENT.z1 + 2000);
  // playable ground reads as sidewalk / curb everywhere a block does not cover it
  ctx.fillStyle = PALETTE.sidewalk;
  fill(B.minX, B.minZ, B.maxX, B.maxZ);

  // city blocks, tinted by district
  for (const b of layout.blocks) {
    if (b.water) continue;
    ctx.fillStyle = DISTRICT_TINT[b.district] || DISTRICT_TINT.north;
    fill(b.x0, b.z0, b.x1, b.z1);
  }

  // parks (lawns) and landmark footprints
  for (const p of PARKS) {
    const r = p.rect;
    ctx.fillStyle = PALETTE.park;
    fill(r.x0, r.z0, r.x1, r.z1);
  }
  const edgeW = Math.max(1, Math.min(2.5, s * 0.9));
  for (const l of LANDMARKS) {
    const r = l.rect;
    if (!r || !visible(r.x0, r.z0, r.x1, r.z1)) continue;
    if (l.park) {
      ctx.strokeStyle = PALETTE.parkEdge;
    } else {
      ctx.fillStyle = !l.h ? PALETTE.lot : l.h >= 40 ? PALETTE.tower : PALETTE.landmark;
      fill(r.x0, r.z0, r.x1, r.z1);
      if (l.id === 'railyards' && s >= 0.6) drawRails(ctx, r, X, Z, s);
      ctx.strokeStyle = PALETTE.landmarkEdge;
    }
    ctx.lineWidth = edgeW;
    ctx.strokeRect(X(r.x0) + edgeW / 2, Z(r.z0) + edgeW / 2, (r.x1 - r.x0) * s - edgeW, (r.z1 - r.z0) * s - edgeW);
  }

  // water (river runs down the east edge; lakes in the parks)
  for (const wtr of WATER) {
    if (!visible(wtr.x0, wtr.z0, wtr.x1, wtr.z1)) continue;
    ctx.fillStyle = wtr.id === 'missouri' ? PALETTE.waterDeep : PALETTE.water;
    fill(wtr.x0, wtr.z0, wtr.x1, wtr.z1);
    if (wtr.id === 'missouri') {
      // lighter channel near the Omaha bank + flow dashes
      ctx.fillStyle = PALETTE.water;
      fill(wtr.x0, wtr.z0, wtr.x0 + 70, wtr.z1);
      ctx.strokeStyle = PALETTE.waterFlow;
      ctx.lineWidth = Math.max(1, s * 1.2);
      ctx.beginPath();
      for (let x = wtr.x0 + 30; x < wtr.x1; x += 55) {
        for (let z = wtr.z0 + ((x * 7) % 90); z < wtr.z1; z += 140) {
          if (!visible(x, z, x, z + 40)) continue;
          ctx.moveTo(X(x), Z(z));
          ctx.lineTo(X(x), Z(z + 40));
        }
      }
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.waterEdge;
    ctx.lineWidth = Math.max(1, s * 1.1);
    ctx.strokeRect(X(wtr.x0), Z(wtr.z0), (wtr.x1 - wtr.x0) * s, (wtr.z1 - wtr.z0) * s);
  }

  // roads: dark casing first, then fills (minor under major) so intersections stay clean
  const casing = Math.max(0.8, 1.4 / Math.max(s, 0.4));
  ctx.fillStyle = PALETTE.casing;
  forEachStreet(layout, (x0, z0, x1, z1, st) => fill(x0 - (st.axis === 'z' ? casing : 0), z0 - (st.axis === 'x' ? casing : 0), x1 + (st.axis === 'z' ? casing : 0), z1 + (st.axis === 'x' ? casing : 0)));
  for (const major of [false, true]) {
    ctx.fillStyle = major ? PALETTE.roadMajor : PALETTE.road;
    forEachStreet(layout, (x0, z0, x1, z1, st) => {
      if (!!st.major === major) fill(x0, z0, x1, z1);
    });
  }
  // dashed yellow center line on major streets when zoomed in (full map)
  if (detail >= 2 && s >= 1.6) {
    ctx.strokeStyle = PALETTE.centerLine;
    ctx.lineWidth = Math.max(1, s * 0.35);
    ctx.setLineDash([s * 6, s * 5]);
    ctx.beginPath();
    forEachStreet(layout, (x0, z0, x1, z1, st) => {
      if (!st.major || !visible(x0, z0, x1, z1)) return;
      if (st.axis === 'z') {
        ctx.moveTo(X((x0 + x1) / 2), Z(z0));
        ctx.lineTo(X((x0 + x1) / 2), Z(z1));
      } else {
        ctx.moveTo(X(x0), Z((z0 + z1) / 2));
        ctx.lineTo(X(x1), Z((z0 + z1) / 2));
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // elevated freeways over everything (semi-transparent decks with dark edges)
  for (const f of FREEWAYS) {
    const c = f.corridor;
    const inset = f.axis === 'z' ? { x: 3, z: 0 } : { x: 0, z: 3 };
    const x0 = c.x0 + inset.x;
    const x1 = c.x1 - inset.x;
    const z0 = c.z0 + inset.z;
    const z1 = c.z1 - inset.z;
    if (!visible(x0, z0, x1, z1)) continue;
    ctx.fillStyle = PALETTE.freeway;
    fill(x0, z0, x1, z1);
    ctx.strokeStyle = PALETTE.freewayEdge;
    ctx.lineWidth = Math.max(1, s * 0.8);
    ctx.beginPath();
    if (f.axis === 'z') {
      ctx.moveTo(X(x0), Z(z0));
      ctx.lineTo(X(x0), Z(z1));
      ctx.moveTo(X(x1), Z(z0));
      ctx.lineTo(X(x1), Z(z1));
    } else {
      ctx.moveTo(X(x0), Z(z0));
      ctx.lineTo(X(x1), Z(z0));
      ctx.moveTo(X(x0), Z(z1));
      ctx.lineTo(X(x1), Z(z1));
    }
    ctx.stroke();
  }
}

/** Calls fn(x0, z0, x1, z1, {axis, major, street}) for every street's roadway rect (curb to curb). */
export function forEachStreet(layout, fn) {
  const B = layout.bounds;
  const info = { axis: 'z', major: false, street: null };
  for (const st of layout.nsStreets) {
    const z0 = Math.max(B.minZ, st.from ?? -Infinity);
    const z1 = Math.min(B.maxZ, st.to ?? Infinity);
    info.axis = 'z';
    info.major = !!st.major;
    info.street = st;
    fn(st.x - st.width / 2, z0, st.x + st.width / 2, z1, info);
  }
  for (const st of layout.ewStreets) {
    const x0 = Math.max(B.minX, st.from ?? -Infinity);
    const x1 = Math.min(B.maxX, st.to ?? Infinity);
    info.axis = 'x';
    info.major = !!st.major;
    info.street = st;
    fn(x0, st.z - st.width / 2, x1, st.z + st.width / 2, info);
  }
}

function drawRails(ctx, r, X, Z, s) {
  ctx.strokeStyle = PALETTE.rails;
  ctx.lineWidth = Math.max(1, s * 0.6);
  ctx.beginPath();
  for (let x = r.x0 + 8; x < r.x1 - 4; x += 9) {
    ctx.moveTo(X(x), Z(r.z0 + 6));
    ctx.lineTo(X(x), Z(r.z1 - 6));
  }
  ctx.stroke();
}

/** Pre-render the whole map at `pxPerM` into a new canvas (used by the minimap). */
export function renderStaticMap(layout, pxPerM) {
  const E = MAP_EXTENT;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((E.x1 - E.x0) * pxPerM);
  canvas.height = Math.ceil((E.z1 - E.z0) * pxPerM);
  const ctx = canvas.getContext('2d');
  drawCity(ctx, layout, { s: pxPerM, ox: E.x0, oz: E.z0, w: canvas.width, h: canvas.height }, { detail: 1 });
  return canvas;
}

// ------------------------------------------------------------------ turf overlay

/** Live owner/control of a zone (falls back to save state / zone defaults when Gangs is missing). */
export function zoneInfo(game, zone) {
  let owner = null;
  let control = 0;
  try {
    owner = game.gangs?.getZoneOwner?.(zone.id);
    control = game.gangs?.getControl?.(zone.id);
  } catch {
    /* defensive: never let another system break the HUD */
  }
  if (owner === undefined) owner = game.state?.turf?.[zone.id]?.owner ?? zone.owner ?? null;
  if (control === undefined || control === null || Number.isNaN(control)) control = game.state?.turf?.[zone.id]?.control ?? 0;
  const set = owner ? setById(owner) : null;
  const side = set ? SIDES[set.side] : null;
  return { owner, control: Math.max(0, Math.min(100, control)), set, side };
}

/** Tint claimable turf zones by the owner's side color, alpha ~ control. `lineScale` = px per line. */
export function drawTurf(ctx, game, view, { border = true, lineScale = 1, alpha = 1 } = {}) {
  const { s, ox, oz, w, h } = view;
  for (const zone of TURF_ZONES) {
    if (zone.noTurf || !zone.rect) continue;
    const r = zone.rect;
    const x = (r.x0 - ox) * s;
    const y = (r.z0 - oz) * s;
    const ww = (r.x1 - r.x0) * s;
    const hh = (r.z1 - r.z0) * s;
    if (x > w || y > h || x + ww < 0 || y + hh < 0) continue;
    const info = zoneInfo(game, zone);
    if (info.side) {
      ctx.globalAlpha = (0.08 + 0.24 * (info.control / 100)) * alpha;
      ctx.fillStyle = info.side.color;
      ctx.fillRect(x, y, ww, hh);
      ctx.globalAlpha = 1;
    }
    if (border) {
      const lw = 1.5 * lineScale;
      ctx.lineWidth = lw;
      ctx.strokeStyle = info.side ? info.side.light : 'rgba(230, 225, 210, 0.55)';
      ctx.globalAlpha = info.side ? 0.75 : 0.6;
      ctx.setLineDash(info.side ? [] : [6 * lineScale, 5 * lineScale]);
      ctx.strokeRect(x + lw / 2, y + lw / 2, ww - lw, hh - lw);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ icons

const spriteCache = new Map();

/** A round badge icon (pre-rendered once per type/size) drawn centered at (x, y). */
export function drawIcon(ctx, type, x, y, size, color = null) {
  const key = `${type}|${size | 0}|${color || ''}`;
  let spr = spriteCache.get(key);
  if (!spr) {
    spr = makeIconSprite(type, size | 0, color);
    spriteCache.set(key, spr);
  }
  ctx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
}

function makeIconSprite(type, size, color) {
  const pad = 2;
  const c = document.createElement('canvas');
  c.width = c.height = size + pad * 2;
  const ctx = c.getContext('2d');
  ctx.translate(pad, pad);
  const k = size / 24;
  ctx.scale(k, k);
  paintIcon(ctx, type, color);
  return c;
}

/** Paint a 24×24 icon (badge + glyph) at the current transform. Also used by the map legend. */
export function paintIcon(ctx, type, color = null) {
  const style = ICON_STYLE[type] || { bg: '#888' };
  const bg = color || style.bg;
  if (type === 'waypoint') {
    // map pin
    ctx.beginPath();
    ctx.moveTo(12, 23);
    ctx.bezierCurveTo(6, 15, 3.5, 12, 3.5, 8.5);
    ctx.arc(12, 8.5, 8.5, Math.PI, 0);
    ctx.bezierCurveTo(20.5, 12, 18, 15, 12, 23);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#140d12';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 8.5, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    return;
  }
  if (type === 'target') {
    // red diamond with a white core
    ctx.beginPath();
    ctx.moveTo(12, 1.5);
    ctx.lineTo(22.5, 12);
    ctx.lineTo(12, 22.5);
    ctx.lineTo(1.5, 12);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#150607';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 12, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    return;
  }
  // round badge
  ctx.beginPath();
  ctx.arc(12, 12, 10.5, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0d0d10';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (type) {
    case 'clothes': // t-shirt
      ctx.beginPath();
      ctx.moveTo(8, 6.5);
      ctx.lineTo(10.2, 5.6);
      ctx.quadraticCurveTo(12, 7.6, 13.8, 5.6);
      ctx.lineTo(16, 6.5);
      ctx.lineTo(19, 9.6);
      ctx.lineTo(17, 11.4);
      ctx.lineTo(15.8, 10.4);
      ctx.lineTo(15.8, 18);
      ctx.lineTo(8.2, 18);
      ctx.lineTo(8.2, 10.4);
      ctx.lineTo(7, 11.4);
      ctx.lineTo(5, 9.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'food': // chicken drumstick
      ctx.save();
      ctx.translate(12, 12);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, -2.6, 4.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-1.1, 1.5, 2.2, 5);
      ctx.beginPath();
      ctx.arc(-1.4, 7, 1.6, 0, Math.PI * 2);
      ctx.arc(1.4, 7, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    case 'garage': // wrench
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(7.5, 16.5);
      ctx.lineTo(13.5, 10.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(15, 9, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ICON_STYLE.garage.bg;
      ctx.beginPath();
      ctx.moveTo(15.6, 8.4);
      ctx.lineTo(19.5, 4.5);
      ctx.lineTo(20.5, 8.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'payphone': // handset
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(12, 13.5, 6, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(6.6, 14.2, 2.2, 3, 0.3, 0, Math.PI * 2);
      ctx.ellipse(17.4, 14.2, 2.2, 3, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'hood': // house
      ctx.beginPath();
      ctx.moveTo(12, 5);
      ctx.lineTo(19, 11);
      ctx.lineTo(17, 11);
      ctx.lineTo(17, 18);
      ctx.lineTo(7, 18);
      ctx.lineTo(7, 11);
      ctx.lineTo(5, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = bg;
      ctx.fillRect(10.5, 13.5, 3, 4.5);
      break;
    case 'mission': // star
      starPath(ctx, 12, 12.5, 7.6, 3.3, 5);
      ctx.fillStyle = '#1a1405';
      ctx.fill();
      break;
    case 'shop':
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 12, 12.8);
      break;
    default:
      ctx.beginPath();
      ctx.arc(12, 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
  }
}

export function starPath(ctx, cx, cy, r0, r1, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r1 : r0;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** The player arrow (GTA-style chevron), pointing up, centered at the origin of the current transform. */
export function paintPlayerArrow(ctx, size, color = '#ffffff') {
  const k = size / 20;
  ctx.beginPath();
  ctx.moveTo(0, -10 * k);
  ctx.lineTo(7.5 * k, 8 * k);
  ctx.lineTo(0, 4 * k);
  ctx.lineTo(-7.5 * k, 8 * k);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, 2 * k);
  ctx.strokeStyle = '#0a0a0c';
  ctx.stroke();
}

/** Marker-ish objects from game.missions.active that the HUD does not already track. */
export function missionMarkers(game, out) {
  out.length = 0;
  const list = game.missions?.active?.markers;
  if (!Array.isArray(list)) return out;
  for (const m of list) {
    if (!m || typeof m.x !== 'number' || typeof m.z !== 'number') continue;
    if (m.id != null && game.hud?.markers?.has(m.id)) continue;
    out.push(m);
  }
  return out;
}
