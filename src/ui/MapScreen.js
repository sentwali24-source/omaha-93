// Full-screen map (ARCHITECTURE.md §20): M / Tab / the touch MAP button / the pause menu open it.
// The game is paused while it is open (game.setPaused). Drag to pan, wheel / pinch / buttons to zoom,
// click or tap to drop a waypoint (hud.addMarker type 'waypoint'; click it again to clear).
//
// Two stacked canvases: the base layer (city, turf, labels, shop icons) is re-rendered only when the
// view changes; the overlay (player arrow, blips, markers) is cheap and redrawn every frame while open.

import './hud/map.css';
import { clamp } from '../core/math.js';
import { SETS, SIDES, TURF_ZONES } from '../data/sets.js';
import { LANDMARKS, DISTRICTS } from '../data/map.js';
import { ICONS } from './hud/icons.js';
import { MAP_EXTENT, drawCity, drawTurf, drawIcon, paintIcon, paintPlayerArrow, zoneInfo, missionMarkers, ICON_STYLE } from './hud/mapRender.js';

const MIN_ZOOM_PAD = 0.92; // fraction of the screen the whole city fills at max zoom-out
const MAX_SCALE = 4.5; // css px per meter
const RIVAL_RANGE = 80;
const POI_TYPES = { clothes: 1, food: 1, garage: 1, payphone: 1 };
const DISPLAY_FONT = 'Impact, "HelveticaNeue-CondensedBlack", "Arial Black", Arial, sans-serif';

// Where the district names go (North Omaha is covered by turf labels, so its name sits up top).
const DISTRICT_ANCHORS = {
  north: { x: -35, z: -1296 }, // above the north edge of the city
  eastomaha: { x: 545, z: -1180 },
  midtown: { x: -105, z: 250 },
  nodo: { x: 412, z: -150 },
  downtown: { x: 412, z: 300 },
  oldmarket: { x: 517, z: 250 },
  riverfront: { x: 637, z: -40 },
};

export class MapScreen {
  constructor(game) {
    this.game = game;
    this.always = true;
    this.open = false;
    this.cx = 0; // view center (world meters)
    this.cz = -400;
    this.scale = 0.6; // css px per meter
    this._w = window.innerWidth;
    this._h = window.innerHeight;
    this._dpr = 1;
    this._dirty = true;
    this._pausedByMe = false;
    this._pointers = new Map();
    this._pinch = null;
    this._drag = null;
    this._labelBoxes = [];
    this._mm = [];
    this._v = {};
    this._ov = {};
    this._build();
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const g = this.game;
    const root = document.createElement('div');
    root.className = 'map-screen';
    root.innerHTML = `
      <canvas class="map-base"></canvas>
      <canvas class="map-over"></canvas>
      <div class="map-vignette"></div>
      <div class="map-header">
        <div class="map-title">OMAHA <span>'93</span></div>
        <div class="map-sub">Summer 1993 · North O · Downtown · Old Market</div>
        <div class="map-where"></div>
      </div>
      <button class="map-close" type="button" aria-label="Close map">${ICONS.close}<span>CLOSE</span><kbd>M</kbd></button>
      <div class="map-legend">
        <button class="map-legend-toggle" type="button">KEY</button>
        <div class="map-legend-body"></div>
      </div>
      <div class="map-controls">
        <button type="button" data-act="in" aria-label="Zoom in">${ICONS.plus}</button>
        <button type="button" data-act="out" aria-label="Zoom out">${ICONS.minus}</button>
        <button type="button" data-act="center" aria-label="Center on me">${ICONS.target}</button>
        <button type="button" data-act="clear" aria-label="Clear waypoint" class="wp">${ICONS.pin}<i></i></button>
      </div>
      <div class="map-hint"></div>`;
    g.uiRoot.appendChild(root);
    this.el = root;
    this.base = root.querySelector('.map-base');
    this.over = root.querySelector('.map-over');
    this.bctx = this.base.getContext('2d');
    this.octx = this.over.getContext('2d');
    this.whereEl = root.querySelector('.map-where');
    this.legendEl = root.querySelector('.map-legend');
    this.legendBody = root.querySelector('.map-legend-body');
    this.hintEl = root.querySelector('.map-hint');
    this.clearBtn = root.querySelector('[data-act="clear"]');

    root.querySelector('.map-close').addEventListener('click', () => this.close());
    root.querySelector('.map-legend-toggle').addEventListener('click', () => this.legendEl.classList.toggle('open'));
    root.querySelector('.map-controls').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'in') this._zoomAt(this._w / 2, this._h / 2, 1.5);
      else if (act === 'out') this._zoomAt(this._w / 2, this._h / 2, 1 / 1.5);
      else if (act === 'center') this._centerOnPlayer();
      else if (act === 'clear') this._clearWaypoint();
      this._click();
    });
    // keep UI clicks away from the map canvas
    for (const sel of ['.map-close', '.map-legend', '.map-controls']) {
      root.querySelector(sel).addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    const ov = this.over;
    ov.addEventListener('pointerdown', (e) => this._onDown(e));
    ov.addEventListener('pointermove', (e) => this._onMove(e));
    ov.addEventListener('pointerup', (e) => this._onUp(e));
    ov.addEventListener('pointercancel', (e) => this._onUp(e, true));
    ov.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    ov.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  init() {
    this.game.events.on('resize', () => {
      if (this.open) this._resize();
    });
    this.game.events.on('game:end', () => {
      if (this.open) this.close();
    });
  }

  // ------------------------------------------------------------------ open / close
  /** Open the map (also available as openMap()). `open` itself is the boolean state. */
  show() {
    const g = this.game;
    if (this.open || g.mode !== 'play' || !g.player) return;
    this.open = true;
    this._pausedByMe = !g.paused;
    if (!g.paused) g.setPaused(true);
    this.el.classList.add('show');
    this.legendEl.classList.toggle('open', window.innerWidth >= 900);
    const touch = !!(g.touch?.active ?? g.input?.isTouch);
    this.el.classList.toggle('touch', touch);
    this.hintEl.textContent = touch ? 'Drag to pan · pinch to zoom · tap to set a waypoint' : 'Drag to pan · scroll to zoom · click to set a waypoint · M / Esc to close';
    this._resize();
    this._fitDefault();
    this._buildLegend();
    this._updateWhere();
    this._render(true);
    this._click();
  }

  openMap() {
    this.show();
  }

  close() {
    if (!this.open) return;
    const g = this.game;
    this.open = false;
    this.el.classList.remove('show', 'dragging');
    this._pointers.clear();
    this._pinch = null;
    this._drag = null;
    if (this._pausedByMe && g.paused && !g.menu?.pauseOpen) g.setPaused(false);
    this._pausedByMe = false;
    this._click();
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  _click() {
    try {
      this.game.audio?.play?.('ui_click');
    } catch {
      /* optional */
    }
  }

  // ------------------------------------------------------------------ view
  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
    for (const c of [this.base, this.over]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this._dirty = true;
  }

  _minScale() {
    const B = this.game.layout.bounds;
    return Math.min((this._w * MIN_ZOOM_PAD) / (B.maxX - B.minX + 380), (this._h * MIN_ZOOM_PAD) / (B.maxZ - B.minZ + 130));
  }

  _fitDefault() {
    // centered on the player, showing roughly 800 m top to bottom
    this.scale = clamp(this._h / 800, this._minScale(), MAX_SCALE);
    this._centerOnPlayer();
  }

  _centerOnPlayer() {
    const f = this.game.focus;
    this.cx = f.x;
    this.cz = f.z;
    this._clampView();
    this._dirty = true;
  }

  /** Keep the city on screen: centered when it fits, otherwise no panning past its edges. */
  _clampView() {
    const B = this.game.layout.bounds;
    const x0 = B.minX - 60;
    const x1 = Math.min(MAP_EXTENT.x1, B.maxX + 320); // include the river
    const z0 = B.minZ - 70;
    const z1 = B.maxZ + 60;
    const hw = this._w / 2 / this.scale;
    const hh = this._h / 2 / this.scale;
    this.cx = x1 - x0 <= hw * 2 ? (x0 + x1) / 2 : clamp(this.cx, x0 + hw, x1 - hw);
    this.cz = z1 - z0 <= hh * 2 ? (z0 + z1) / 2 : clamp(this.cz, z0 + hh, z1 - hh);
  }

  _zoomAt(px, py, factor) {
    const s0 = this.scale;
    const s1 = clamp(s0 * factor, this._minScale(), MAX_SCALE);
    if (s1 === s0) return;
    const wx = this.cx + (px - this._w / 2) / s0;
    const wz = this.cz + (py - this._h / 2) / s0;
    this.scale = s1;
    this.cx = wx - (px - this._w / 2) / s1;
    this.cz = wz - (py - this._h / 2) / s1;
    this._clampView();
    this._dirty = true;
  }

  /** Screen css px → world meters. */
  _toWorld(px, py, out = {}) {
    out.x = this.cx + (px - this._w / 2) / this.scale;
    out.z = this.cz + (py - this._h / 2) / this.scale;
    return out;
  }

  /** Canvas-pixel view for mapRender (px = (x - ox) * s). */
  _view(v) {
    const d = this._dpr;
    v.s = this.scale * d;
    v.w = this._w * d;
    v.h = this._h * d;
    v.ox = this.cx - this._w / 2 / this.scale;
    v.oz = this.cz - this._h / 2 / this.scale;
    return v;
  }

  // ------------------------------------------------------------------ input
  _onDown(e) {
    e.preventDefault();
    try {
      this.over.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: performance.now() });
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this._drag = null;
    } else if (this._pointers.size === 1) {
      this._drag = { moved: 0 };
    }
  }

  _onMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this._pinch && this._pointers.size >= 2) {
      const [a, b] = [...this._pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // pan with the midpoint, zoom around it
      this.cx -= (mx - this._pinch.mx) / this.scale;
      this.cz -= (my - this._pinch.my) / this.scale;
      this._zoomAt(mx, my, d / this._pinch.d);
      this._pinch.d = d;
      this._pinch.mx = mx;
      this._pinch.my = my;
      this._clampView();
      this._dirty = true;
    } else if (this._drag) {
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this.cx -= dx / this.scale;
      this.cz -= dy / this.scale;
      this._clampView();
      this._dirty = true;
      if (this._drag.moved > 6) this.el.classList.add('dragging');
    }
  }

  _onUp(e, cancel = false) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    this._pointers.delete(e.pointerId);
    const wasPinch = !!this._pinch;
    if (this._pointers.size < 2) this._pinch = null;
    const tap = !cancel && !wasPinch && this._drag && this._drag.moved < 8 && performance.now() - p.t0 < 700;
    if (this._pointers.size === 0) {
      this._drag = null;
      this.el.classList.remove('dragging');
    } else if (this._pointers.size === 1) {
      this._drag = { moved: 99 }; // the finger left over from a pinch keeps panning, never taps
    }
    if (tap) this._tapAt(e.clientX, e.clientY);
  }

  _onWheel(e) {
    e.preventDefault();
    const f = Math.exp(-clamp(e.deltaY, -300, 300) * 0.0022);
    this._zoomAt(e.clientX, e.clientY, f);
  }

  _onKey(e) {
    if (!this.open) return;
    const pan = 90 / this.scale;
    switch (e.code) {
      case 'Equal':
      case 'NumpadAdd':
        this._zoomAt(this._w / 2, this._h / 2, 1.4);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        this._zoomAt(this._w / 2, this._h / 2, 1 / 1.4);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.cx -= pan;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.cx += pan;
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.cz -= pan;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.cz += pan;
        break;
      case 'Space':
        this._centerOnPlayer();
        break;
      default:
        return;
    }
    this._clampView();
    this._dirty = true;
  }

  /** Tap/click: set a waypoint there (or clear it when tapping the existing one). */
  _tapAt(px, py) {
    const hud = this.game.hud;
    if (!hud) return;
    const wp = hud.getWaypoint?.();
    if (wp) {
      const sx = (wp.x - this.cx) * this.scale + this._w / 2;
      const sy = (wp.z - this.cz) * this.scale + this._h / 2;
      if (Math.hypot(sx - px, sy - (py + 10)) < 24) {
        this._clearWaypoint();
        return;
      }
    }
    const w = this._toWorld(px, py);
    this.setWaypoint(w.x, w.z);
  }

  /** Drop the waypoint at world (x, z). Returns the marker id (or null outside the city). */
  setWaypoint(x, z) {
    const hud = this.game.hud;
    const B = this.game.layout.bounds;
    if (!hud || x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) return null;
    let label = '';
    try {
      label = this.game.layout.describe(x, z).street;
    } catch {
      label = '';
    }
    const id = hud.addMarker({ id: 'waypoint', type: 'waypoint', x, z, label });
    try {
      this.game.audio?.play?.('ui_select');
    } catch {
      /* optional */
    }
    return id;
  }

  _clearWaypoint() {
    const wp = this.game.hud?.getWaypoint?.();
    if (wp) this.game.hud.removeMarker(wp.id);
  }

  // ------------------------------------------------------------------ frame
  update() {
    if (!this.open) return;
    const g = this.game;
    if (g.mode !== 'play' || !g.player) {
      this.close();
      return;
    }
    this._render(false);
  }

  _render(force) {
    if (this._dirty || force) {
      this._dirty = false;
      this._renderBase();
    }
    this._renderOverlay();
    const hasWp = !!this.game.hud?.getWaypoint?.();
    if (hasWp !== this._hasWp) {
      this._hasWp = hasWp;
      this.clearBtn.classList.toggle('on', hasWp);
    }
  }

  _renderBase() {
    const g = this.game;
    const ctx = this.bctx;
    const v = this._view(this._v);
    const d = this._dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCity(ctx, g.layout, v, { detail: 2 });
    drawTurf(ctx, g, v, { border: true, lineScale: d * 1.4, alpha: 0.75 });

    this._labelBoxes.length = 0;
    this._drawStreetLabels(ctx, v);

    const s = this.scale;
    // POI icons (payphones only when zoomed in; they are on every corner)
    const pois = g.city?.pois || [];
    const iconSize = Math.round(clamp(9 + s * 5, 12, 22) * d);
    for (const p of pois) {
      if (!POI_TYPES[p.type]) continue;
      if (p.type === 'payphone' && s < 1.1) continue;
      const x = (p.x - v.ox) * v.s;
      const y = (p.z - v.oz) * v.s;
      if (x < -20 || y < -20 || x > v.w + 20 || y > v.h + 20) continue;
      drawIcon(ctx, p.type, x, y, p.type === 'payphone' ? Math.round(iconSize * 0.8) : iconSize);
    }
    // set hangouts (house icon in the set's color)
    for (const set of SETS) {
      drawIcon(ctx, 'hood', (set.hood.x - v.ox) * v.s, (set.hood.z - v.oz) * v.s, Math.round(iconSize * 1.1), set.accent);
    }

    this._drawZoneLabels(ctx, v);
    this._drawDistrictLabels(ctx, v);
    this._drawLandmarkLabels(ctx, v);
  }

  /** Outlined canvas text; with avoid=true it is skipped when it would overlap an earlier label. */
  _text(ctx, text, x, y, { size, color = '#fff', stroke = '#000', weight = 800, font = 'Arial, sans-serif', align = 'center', spacing = 0, lw = 3, avoid = true }) {
    ctx.font = `${weight} ${Math.round(size)}px ${font}`;
    const hasSpacing = 'letterSpacing' in ctx;
    if (hasSpacing) ctx.letterSpacing = `${spacing}px`;
    const w = ctx.measureText(text).width;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const box = { x0: x0 - 3, y0: y - size / 2 - 2, x1: x0 + w + 3, y1: y + size / 2 + 2 };
    if (avoid) {
      for (const b of this._labelBoxes) {
        if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) {
          if (hasSpacing) ctx.letterSpacing = '0px';
          return false;
        }
      }
    }
    this._labelBoxes.push(box);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (stroke) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    if (hasSpacing) ctx.letterSpacing = '0px';
    return true;
  }

  _drawDistrictLabels(ctx, v) {
    const d = this._dpr;
    const size = clamp(this.scale * 34, 15, 30) * d;
    for (const dist of DISTRICTS) {
      const a = DISTRICT_ANCHORS[dist.id];
      if (!a) continue;
      const x = (a.x - v.ox) * v.s;
      const y = (a.z - v.oz) * v.s;
      if (x < -300 || x > v.w + 300 || y < -60 || y > v.h + 60) continue;
      const sz = dist.id === 'oldmarket' || dist.id === 'nodo' ? size * 0.72 : size;
      this._text(ctx, dist.name.toUpperCase(), x, y, { size: sz, color: 'rgba(255, 246, 220, 0.92)', stroke: 'rgba(0,0,0,0.85)', weight: 900, font: DISPLAY_FONT, spacing: 3 * d, lw: 4 * d, avoid: true });
    }
  }

  _drawZoneLabels(ctx, v) {
    const g = this.game;
    const d = this._dpr;
    const s = this.scale;
    const maxSize = clamp(9 + s * 9, 11, 19) * d;
    for (const zone of TURF_ZONES) {
      if (zone.noTurf || !zone.rect) continue;
      const r = zone.rect;
      const x = ((r.x0 + r.x1) / 2 - v.ox) * v.s;
      const y = ((r.z0 + r.z1) / 2 - v.oz) * v.s;
      if (x < -200 || x > v.w + 200 || y < -60 || y > v.h + 60) continue;
      // shrink the name to fit inside its zone at low zoom
      const name = zone.name.toUpperCase();
      const zoneW = (r.x1 - r.x0) * v.s * 0.9;
      const size = Math.min(maxSize, zoneW / (name.length * 0.62));
      if (size < 7 * d) continue;
      const info = zoneInfo(g, zone);
      const color = info.set ? info.set.accent : '#e8e2cf';
      this._text(ctx, name, x, y - size * 0.55, { size, color, weight: 900, font: DISPLAY_FONT, spacing: 0.5 * d, lw: 3.5 * d, avoid: false });
      const sub = info.set ? `${info.set.short} · ${Math.round(info.control)}%` : 'CONTESTED';
      this._text(ctx, sub, x, y + size * 0.6, { size: Math.max(8 * d, size * 0.7), color: '#fff', weight: 800, spacing: 1.5 * d, lw: 3 * d, avoid: false });
      if (info.set) {
        // control meter under the label
        const bw = Math.min(58 * d, zoneW * 0.6);
        const bh = 5 * d;
        const bx = x - bw / 2;
        const by = y + size * 1.25;
        ctx.fillStyle = '#000';
        ctx.fillRect(bx - d, by - d, bw + 2 * d, bh + 2 * d);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = info.side.color;
        ctx.fillRect(bx, by, (bw * info.control) / 100, bh);
      }
      const half = Math.min(zoneW / 2, name.length * size * 0.32);
      this._labelBoxes.push({ x0: x - half, y0: y - size * 1.2, x1: x + half, y1: y + size * 1.6 });
    }
  }

  _drawLandmarkLabels(ctx, v) {
    const s = this.scale;
    if (s < 0.55) return;
    const d = this._dpr;
    const size = clamp(8 + s * 2.5, 10, 14) * d;
    for (const l of LANDMARKS) {
      const r = l.rect;
      const x = ((r.x0 + r.x1) / 2 - v.ox) * v.s;
      const y = ((r.z0 + r.z1) / 2 - v.oz) * v.s;
      if (x < -150 || x > v.w + 150 || y < -30 || y > v.h + 30) continue;
      const big = l.h >= 40 || l.park || (r.x1 - r.x0) * (r.z1 - r.z0) > 6000;
      if (!big && s < 1.1) continue;
      this._text(ctx, l.name, x, y, { size, color: l.park ? '#d9f5c4' : '#fff4d8', weight: 700, lw: 3 * d, avoid: true });
    }
  }

  _drawStreetLabels(ctx, v) {
    const L = this.game.layout;
    const s = this.scale;
    if (s < 0.9) return;
    const d = this._dpr;
    const B = L.bounds;
    const every = 420 / s; // meters between repeats (~420 css px on screen)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const st of L.nsStreets) {
      if (!st.major && s < 1.7) continue;
      const size = Math.min(st.width * s * 0.72, 13) * d;
      if (size < 8 * d) continue;
      const x = (st.x - v.ox) * v.s;
      if (x < -20 || x > v.w + 20) continue;
      const z0 = Math.max(B.minZ, st.from ?? -Infinity) + 40;
      const z1 = Math.min(B.maxZ, st.to ?? Infinity) - 40;
      ctx.font = `800 ${Math.round(size)}px Arial, sans-serif`;
      ctx.fillStyle = st.major ? '#3b2f12' : '#1f1e1b';
      for (let z = z0 + every * 0.5; z < z1; z += every) {
        const y = (z - v.oz) * v.s;
        if (y < -80 || y > v.h + 80) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(L.streetLabel(st, z).toUpperCase(), 0, size * 0.05);
        ctx.restore();
      }
    }
    for (const st of L.ewStreets) {
      if (!st.major && s < 1.7) continue;
      const size = Math.min(st.width * s * 0.72, 13) * d;
      if (size < 8 * d) continue;
      const y = (st.z - v.oz) * v.s;
      if (y < -20 || y > v.h + 20) continue;
      const x0 = Math.max(B.minX, st.from ?? -Infinity) + 40;
      const x1 = Math.min(B.maxX, st.to ?? Infinity) - 40;
      ctx.font = `800 ${Math.round(size)}px Arial, sans-serif`;
      ctx.fillStyle = st.major ? '#3b2f12' : '#1f1e1b';
      for (let x = x0 + every * 0.5; x < x1; x += every) {
        const sx = (x - v.ox) * v.s;
        if (sx < -120 || sx > v.w + 120) continue;
        ctx.fillText(st.name.toUpperCase(), sx, y + size * 0.05);
      }
    }
  }

  _renderOverlay() {
    const g = this.game;
    const p = g.player;
    const ctx = this.octx;
    const d = this._dpr;
    const v = this._view(this._ov);
    const t = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    if (!p) return;
    const sx = (x) => (x - v.ox) * v.s;
    const sy = (z) => (z - v.oz) * v.s;
    const f = g.focus;

    // blips: cruisers, cops, nearby rivals, homies
    const flash = Math.floor(t * 4) % 2 === 0;
    const mySide = g.state?.player?.side;
    const rival = SIDES[mySide]?.rival;
    for (const veh of g.vehicles) {
      if (!veh.isPolice || veh === p.vehicle) continue;
      const hw = 4.5 * d;
      const x = sx(veh.position.x);
      const y = sy(veh.position.z);
      ctx.fillStyle = '#000';
      ctx.fillRect(x - hw - d, y - hw - d, (hw + d) * 2, (hw + d) * 2);
      ctx.fillStyle = veh.siren ? (flash ? '#ff3040' : '#3a7bff') : '#dfe6ff';
      ctx.fillRect(x - hw, y - hw, hw * 2, hw * 2);
    }
    const homies = g.gangs?.homies || [];
    for (const a of g.actors) {
      if (a === p || a.state === 'removed' || a.vehicle) continue;
      if (a.kind === 'cop') {
        blip(ctx, sx(a.position.x), sy(a.position.z), 4 * d, flash ? '#ff3040' : '#3a7bff');
      } else if (a.kind === 'gang' && rival && a.side === rival && homies.indexOf(a) < 0) {
        if (Math.hypot(a.position.x - f.x, a.position.z - f.z) > RIVAL_RANGE) continue;
        blip(ctx, sx(a.position.x), sy(a.position.z), 3.6 * d, SIDES[rival].color);
      }
    }
    for (const a of homies) {
      if (!a || a.state === 'removed' || a.vehicle) continue;
      blip(ctx, sx(a.position.x), sy(a.position.z), 4.2 * d, SIDES[mySide]?.light || '#9cf', '#fff');
    }

    // markers (+ labels); the waypoint gets a marching dashed line from the player
    const size = Math.round(22 * d);
    const mm = missionMarkers(g, this._mm);
    for (const m of mm) this._drawMarker(ctx, m, sx, sy, f, size, t);
    if (g.hud?.markers) for (const m of g.hud.markers.values()) this._drawMarker(ctx, m, sx, sy, f, size, t);

    // the player: pulsing ring + arrow (north is up, so rotate by -heading)
    const px = sx(f.x);
    const py = sy(f.z);
    const ph = (t * 0.9) % 1;
    ctx.beginPath();
    ctx.arc(px, py, (10 + ph * 26) * d, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${((1 - ph) * 0.8).toFixed(2)})`;
    ctx.lineWidth = 2.5 * d;
    ctx.stroke();
    const heading = p.vehicle ? p.vehicle.heading : p.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-heading);
    paintPlayerArrow(ctx, 24 * d, '#ffffff');
    ctx.restore();

    // off-screen player indicator on the screen edge
    if (px < 0 || py < 0 || px > v.w || py > v.h) {
      const cx = clamp(px, 26 * d, v.w - 26 * d);
      const cy = clamp(py, 26 * d, v.h - 26 * d);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(py - cy, px - cx) + Math.PI / 2);
      paintPlayerArrow(ctx, 20 * d, '#ffc23a');
      ctx.restore();
    }
  }

  _drawMarker(ctx, m, sx, sy, f, size, t) {
    if (typeof m.x !== 'number' || typeof m.z !== 'number') return;
    const d = this._dpr;
    const type = ICON_STYLE[m.type] ? m.type : 'mission';
    const x = sx(m.x);
    const y = sy(m.z);
    if (type === 'waypoint') {
      ctx.save();
      ctx.setLineDash([6 * d, 6 * d]);
      ctx.lineDashOffset = -t * 20 * d;
      ctx.strokeStyle = 'rgba(255, 79, 184, 0.85)';
      ctx.lineWidth = 2.5 * d;
      ctx.beginPath();
      ctx.moveTo(sx(f.x), sy(f.z));
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
      drawIcon(ctx, 'waypoint', x, y - size * 0.45, size);
      return;
    }
    if (type === 'mission' || type === 'target') {
      const ph = (t * 1.2) % 1;
      ctx.beginPath();
      ctx.arc(x, y, size * (0.5 + ph), 0, Math.PI * 2);
      ctx.strokeStyle = m.color || ICON_STYLE[type].bg;
      ctx.globalAlpha = 1 - ph;
      ctx.lineWidth = 2.5 * d;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawIcon(ctx, type, x, y, size, m.color || null);
    if (m.label) {
      ctx.font = `800 ${Math.round(12 * d)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3 * d;
      ctx.strokeStyle = '#000';
      ctx.strokeText(String(m.label), x, y + size * 0.62);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(m.label), x, y + size * 0.62);
    }
  }

  _updateWhere() {
    const g = this.game;
    const f = g.focus;
    let text = '';
    try {
      const d = g.layout.describe(f.x, f.z);
      const area = d.zone && !d.zone.noTurf ? d.zone.name : d.district?.name || '';
      text = [d.street, area].filter(Boolean).join(' — ');
    } catch {
      text = '';
    }
    this.whereEl.textContent = text;
  }

  /** Legend: turf owners by set (zones + average control) and the symbol key. */
  _buildLegend() {
    const g = this.game;
    const owned = new Map(); // setId -> { n, control }
    let contested = 0;
    for (const z of TURF_ZONES) {
      if (z.noTurf) continue;
      const info = zoneInfo(g, z);
      if (!info.owner) {
        contested++;
        continue;
      }
      const o = owned.get(info.owner) || { n: 0, control: 0 };
      o.n++;
      o.control += info.control;
      owned.set(info.owner, o);
    }
    const mySet = g.state?.player?.setId;
    const rows = [];
    for (const side of ['crips', 'bloods']) {
      rows.push(`<div class="lg-side" style="--c:${SIDES[side].color}">${SIDES[side].name.toUpperCase()}</div>`);
      for (const set of SETS.filter((s) => s.side === side)) {
        const o = owned.get(set.id);
        const stat = o ? `${o.n} zone${o.n > 1 ? 's' : ''} · ${Math.round(o.control / o.n)}%` : 'no turf';
        rows.push(`<div class="lg-set${set.id === mySet ? ' mine' : ''}"><i style="--c:${SIDES[side].color};--a:${set.accent}"></i><b>${set.name}</b><em>${stat}</em></div>`);
      }
    }
    rows.push(`<div class="lg-set contested"><i></i><b>Contested</b><em>${contested} zone${contested === 1 ? '' : 's'}</em></div>`);
    const keys = [
      ['you', 'You'],
      ['waypoint', 'Waypoint'],
      ['mission', 'Mission'],
      ['homie', 'Homie'],
      ['rival', 'Rival set'],
      ['cop', 'Police'],
      ['hood', 'Set hangout'],
      ['clothes', 'Clothes'],
      ['food', 'Food'],
      ['garage', 'Garage'],
      ['payphone', 'Payphone'],
    ];
    this.legendBody.innerHTML = `<div class="lg-h">TURF</div>${rows.join('')}<div class="lg-h">KEY</div><div class="lg-keys">${keys
      .map(([k, label]) => `<div class="lg-key"><canvas data-k="${k}"></canvas><span>${label}</span></div>`)
      .join('')}</div>`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rivalColor = SIDES[SIDES[g.state?.player?.side]?.rival]?.color || '#d4202c';
    for (const c of this.legendBody.querySelectorAll('canvas')) {
      c.width = c.height = Math.round(18 * dpr);
      const ctx = c.getContext('2d');
      ctx.scale((18 * dpr) / 24, (18 * dpr) / 24);
      const k = c.dataset.k;
      if (k === 'you') {
        ctx.translate(12, 12);
        paintPlayerArrow(ctx, 20);
      } else if (k === 'homie') blip(ctx, 12, 12, 6, SIDES[g.state?.player?.side]?.light || '#9cf', '#fff');
      else if (k === 'rival') blip(ctx, 12, 12, 6, rivalColor);
      else if (k === 'cop') {
        ctx.fillStyle = '#000';
        ctx.fillRect(4, 4, 16, 16);
        ctx.fillStyle = '#ff3040';
        ctx.fillRect(6, 6, 6, 12);
        ctx.fillStyle = '#3a7bff';
        ctx.fillRect(12, 6, 6, 12);
      } else if (k === 'hood') paintIcon(ctx, 'hood', g.playerSet?.accent || null);
      else paintIcon(ctx, k);
    }
  }
}

function blip(ctx, x, y, r, fill, stroke = '#000') {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.4);
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
