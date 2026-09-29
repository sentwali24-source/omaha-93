// Circular radar in the HUD corner (bottom-left on desktop, top-left on touch devices).
//
// The static city is pre-rendered ONCE into a big offscreen canvas (mapRender.renderStaticMap);
// each redraw (~20 Hz) copies the patch around the player rotated by the camera yaw, then draws the
// live layers on top: turf tint, shop icons, markers (clamped to the rim), homies, rival set
// members, cops (flashing) and cruisers, the waypoint, and the player arrow in the middle.
// No allocations in the redraw path.

import { clamp, damp } from '../../core/math.js';
import { SIDES } from '../../data/sets.js';
import { MAP_EXTENT, PALETTE, renderStaticMap, drawTurf, drawIcon, paintPlayerArrow, missionMarkers, ICON_STYLE } from './mapRender.js';

const SHOP_TYPES = { clothes: 1, food: 1, garage: 1, payphone: 1 };
const REDRAW_HZ = 20;
const RIVAL_RANGE = 80; // meters: rivals further than this are not shown

export class Minimap {
  constructor(game, hud) {
    this.game = game;
    this.hud = hud;
    this.el = document.createElement('div');
    this.el.className = 'hud-minimap';
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.el.appendChild(this.canvas);
    const rim = document.createElement('div');
    rim.className = 'hud-minimap-rim';
    this.el.appendChild(rim);

    this.staticMap = null;
    this.staticPx = 1;
    this.sizeCss = 0;
    this.dpr = 1;
    this.radiusM = 130; // meters shown from center to rim (zooms out with speed)
    this._acc = 1;
    this._pois = null;
    this._mm = [];
    this._view = { s: 1, ox: 0, oz: 0, w: 0, h: 0 };
    // projection state + one bound function reused by every redraw (no per-frame closures)
    this._proj = { px: 0, pz: 0, k: 1, cos: 1, sin: 0, c: 0 };
    this._pt = { x: 0, y: 0, d: 0 };
    this._projectFn = (x, z) => {
      const P = this._proj;
      const pt = this._pt;
      const dx = (x - P.px) * P.k;
      const dz = (z - P.pz) * P.k;
      pt.x = P.c + dx * P.cos - dz * P.sin;
      pt.y = P.c + dx * P.sin + dz * P.cos;
      pt.d = Math.hypot(pt.x - P.c, pt.y - P.c);
      return pt;
    };
  }

  /** Build the static map canvas (call once after the layout exists). */
  build() {
    const g = this.game;
    const dpr = window.devicePixelRatio || 1;
    // keep the pre-render modest on phones (memory) and crisp enough on hi-dpi desktops
    this.staticPx = g.quality?.detail === 0 ? 1.0 : dpr >= 1.5 ? 1.5 : 1.2;
    try {
      this.staticMap = renderStaticMap(g.layout, this.staticPx);
    } catch (err) {
      console.warn('[hud] minimap pre-render failed', err);
      this.staticMap = null;
    }
  }

  /** City POIs worth an icon on the radar (collected lazily: the city may add POIs late). */
  _collectPois() {
    const pois = this.game.city?.pois || [];
    this._pois = [];
    for (const p of pois) if (p && SHOP_TYPES[p.type]) this._pois.push(p);
  }

  resize(sizeCss) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (sizeCss === this.sizeCss && dpr === this.dpr) return;
    this.sizeCss = sizeCss;
    this.dpr = dpr;
    this.canvas.width = Math.round(sizeCss * dpr);
    this.canvas.height = Math.round(sizeCss * dpr);
    this._acc = 1;
  }

  invalidate() {
    this._acc = 1;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    // zoom out when driving fast
    const speed = p.vehicle ? Math.abs(p.vehicle.speed || 0) : 0;
    const want = p.vehicle ? 150 + clamp((speed - 8) / 24, 0, 1) * 170 : 130;
    this.radiusM = damp(this.radiusM, want, 2.2, dt);
    this._acc += dt;
    if (this._acc < 1 / REDRAW_HZ) return;
    this._acc = 0;
    this.draw();
  }

  draw() {
    const g = this.game;
    const p = g.player;
    const ctx = this.ctx;
    const W = this.canvas.width;
    if (!p || !W) return;
    if (!this._pois) this._collectPois();
    const dpr = this.dpr;
    const cx = W / 2;
    const R = W / 2 - 1.5 * dpr; // rim radius in device px
    const k = R / this.radiusM; // device px per meter
    const focus = p.vehicle ? p.vehicle.position : p.position;
    const px = focus.x;
    const pz = focus.z;
    const yaw = g.cameraRig?.yaw ?? 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const t = g.time?.elapsed ?? 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cx, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, W, W);

    // --- static city + turf, rotated so the camera's forward points up
    ctx.translate(cx, cx);
    ctx.rotate(yaw);
    if (this.staticMap) {
      const S = this.staticPx;
      const half = this.radiusM * 1.45 * S; // source half-size in static px (covers the rotated circle)
      const sx = (px - MAP_EXTENT.x0) * S;
      const sz = (pz - MAP_EXTENT.z0) * S;
      const f = k / S;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.staticMap, sx - half, sz - half, half * 2, half * 2, -half * f, -half * f, half * 2 * f, half * 2 * f);
    }
    // turf overlay in the same rotated frame; drawTurf culls against an axis-aligned view, so give
    // it a square around the player big enough to cover the rotated circle
    const v = this._view;
    v.s = k;
    const cull = this.radiusM * 1.5;
    v.ox = px - cull;
    v.oz = pz - cull;
    v.w = v.h = cull * 2 * k;
    ctx.translate(-cull * k, -cull * k);
    drawTurf(ctx, g, v, { border: true, lineScale: dpr, alpha: 0.6 });
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // world → minimap device px (see _project)
    const P = this._proj;
    P.px = px;
    P.pz = pz;
    P.k = k;
    P.cos = cos;
    P.sin = sin;
    P.c = cx;
    const project = this._projectFn;

    // --- shop icons (only inside the circle)
    const iconSize = Math.round(15 * dpr);
    const pois = this._pois;
    for (let i = 0; i < pois.length; i++) {
      const q = pois[i];
      const s = project(q.x, q.z);
      if (s.d > R - iconSize * 0.4) continue;
      drawIcon(ctx, q.type, s.x, s.y, q.type === 'payphone' ? Math.round(iconSize * 0.8) : iconSize);
    }

    // --- actors: rivals within RIVAL_RANGE, cops (flash red/blue), homies
    const mySide = g.state?.player?.side || p.side;
    const rival = SIDES[mySide]?.rival;
    const rivalColor = rival ? SIDES[rival].color : '#e33';
    const flash = Math.floor(t * 5) % 2 === 0;
    const actors = g.actors;
    const homies = g.gangs?.homies || [];
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a === p || a.state === 'removed' || a.vehicle) continue;
      if (a.kind === 'cop') {
        const s = project(a.position.x, a.position.z);
        if (s.d > R - 3 * dpr) continue;
        dot(ctx, s.x, s.y, 4 * dpr, flash ? '#ff3040' : '#3a7bff');
      } else if (a.kind === 'gang' && rival && a.side === rival && homies.indexOf(a) < 0) {
        const dx = a.position.x - px;
        const dz = a.position.z - pz;
        if (dx * dx + dz * dz > RIVAL_RANGE * RIVAL_RANGE) continue;
        const s = project(a.position.x, a.position.z);
        if (s.d > R - 3 * dpr) continue;
        let hostile = false;
        try {
          hostile = !!g.gangs?.isHostile?.(a);
        } catch {
          hostile = false;
        }
        const r = (hostile ? 4.4 + (flash ? 0.8 : 0) : 3.7) * dpr;
        dot(ctx, s.x, s.y, r, a.alive ? rivalColor : '#6b6b6b', hostile ? '#ffffff' : '#08080a');
      }
    }
    const homieColor = SIDES[mySide]?.light || '#9cf';
    for (let i = 0; i < homies.length; i++) {
      const a = homies[i];
      if (!a || a.state === 'removed' || a.vehicle) continue;
      const s = project(a.position.x, a.position.z);
      clampToRim(s, cx, R - 4 * dpr);
      dot(ctx, s.x, s.y, 4.4 * dpr, homieColor, '#ffffff');
    }

    // --- police cruisers (little flashing boxes)
    const vehicles = g.vehicles;
    for (let i = 0; i < vehicles.length; i++) {
      const veh = vehicles[i];
      if (!veh.isPolice || veh === p.vehicle) continue;
      const s = project(veh.position.x, veh.position.z);
      if (s.d > R - 4 * dpr) continue;
      const hw = 4 * dpr;
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(s.x - hw - dpr, s.y - hw - dpr, (hw + dpr) * 2, (hw + dpr) * 2);
      ctx.fillStyle = veh.siren ? (flash ? '#ff3040' : '#3a7bff') : '#dfe6ff';
      ctx.fillRect(s.x - hw, s.y - hw, hw * 2, hw * 2);
    }

    // --- markers (HUD + active mission), clamped to the rim when far away
    const mSize = Math.round(18 * dpr);
    const mm = missionMarkers(g, this._mm);
    for (let i = 0; i < mm.length; i++) this._drawMarker(ctx, mm[i], project, cx, R, mSize, t);
    for (const m of this.hud.markers.values()) this._drawMarker(ctx, m, project, cx, R, mSize, t);

    ctx.restore();

    // --- player arrow in the center (rotated by heading relative to the camera)
    const heading = p.vehicle ? p.vehicle.heading : p.heading;
    ctx.save();
    ctx.translate(cx, cx);
    ctx.rotate(yaw - heading);
    paintPlayerArrow(ctx, 18 * dpr, '#ffffff');
    ctx.restore();

    // --- north marker on the rim
    const nx = cx + Math.sin(yaw) * (R - 8 * dpr);
    const ny = cx - Math.cos(yaw) * (R - 8 * dpr);
    ctx.beginPath();
    ctx.arc(nx, ny, 7 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0c10';
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#e8e2cf';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    if (this._nDpr !== dpr) {
      this._nDpr = dpr;
      this._nFont = `bold ${Math.round(9 * dpr)}px Arial, sans-serif`;
    }
    ctx.font = this._nFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5 * dpr);
  }

  _drawMarker(ctx, m, project, cx, R, size, t) {
    if (typeof m.x !== 'number' || typeof m.z !== 'number') return;
    const type = m.type || 'mission';
    if ((type === 'shop' || type === 'payphone' || type === 'hood') && !m.important) {
      // ambient markers (shops, payphones, hoods) only show inside the radar; `important: true` clamps them
      const s = project(m.x, m.z);
      if (s.d > R - size * 0.4) return;
      drawIcon(ctx, type === 'shop' ? 'shop' : type, s.x, s.y, Math.round(size * 0.85), m.color || null);
      return;
    }
    const s = project(m.x, m.z);
    const outside = s.d > R - size * 0.55;
    if (outside) clampToRim(s, cx, R - size * 0.55);
    // pulse ring for mission-critical markers inside the radar
    if (!outside && (type === 'mission' || type === 'target')) {
      const ph = (t * 1.4) % 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, size * (0.4 + ph * 0.7), 0, Math.PI * 2);
      ctx.strokeStyle = m.color || ICON_STYLE[type].bg;
      ctx.globalAlpha = 1 - ph;
      ctx.lineWidth = 2 * this.dpr;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawIcon(ctx, ICON_STYLE[type] ? type : 'mission', s.x, s.y, outside ? Math.round(size * 0.85) : size, m.color || null);
  }
}

function dot(ctx, x, y, r, fill, stroke = '#08080a') {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.38);
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function clampToRim(s, c, r) {
  const dx = s.x - c;
  const dy = s.y - c;
  const d = Math.hypot(dx, dy);
  if (d > r && d > 0) {
    s.x = c + (dx / d) * r;
    s.y = c + (dy / d) * r;
    s.d = r;
  }
}
