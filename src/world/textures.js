import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import {
  makeCanvas, setDensity, grain, blotches, blob, speckle, crack, streaks, vgrad, hgrad, rrect, jitter, mix, fitText, wrapped,
  FONT_BLOCK, FONT_SANS, FONT_SERIF, FONT_SCRIPT, FONT_WIDE, TAU,
} from './city/draw.js';
import { BUSINESSES, GAS_BRANDS, BILLBOARDS, CHURCHES, GHOST_ADS, MURALS } from './city/names.js';

// Procedural canvas textures for the generic city (no image files).
//
//   surface atlas  roads, sidewalks, lawns, lots, gravel, rail beds...   (tiling, 4×4 tiles)
//   facade atlas   walls, roofs, window grids, doors, foliage, props     (tiling, 16×16 grid)
//                  + a matching emissive atlas (lit windows) used at night
//   fence atlas    chain-link / picket / wrought iron (alpha-tested)
//   sign atlas     storefront signs, billboards, street-name blades, murals... (unique cells)
//                  + emissive atlas (neon, lightboxes, lamps)
//   pool texture   soft radial light pool (additive decals under streetlights)
//
// Atlas tile rects are in 1/16 units with y measured from the BOTTOM of the texture (uv space);
// see city/atlasMaterial.js. Sizes scale with quality (drawn in 'design' pixels, then scaled).

// ------------------------------------------------------------------ tile tables
const T = (col, row, w, h) => [col, 16 - row - h, w, h];

/** Facade atlas tiles (16-grid). */
export const FT = {
  siding: T(0, 0, 2, 2),
  shingle: T(2, 0, 2, 2),
  brick: T(4, 0, 2, 2),
  brickBuff: T(6, 0, 2, 2),
  concrete: T(8, 0, 2, 2),
  metal: T(10, 0, 2, 2),
  block: T(12, 0, 2, 2),
  planks: T(14, 0, 2, 2),
  roofShingle: T(0, 2, 2, 2),
  roofTar: T(2, 2, 2, 2),
  roofMetal: T(4, 2, 2, 2),
  foliage: T(6, 2, 2, 2),
  bark: T(8, 2, 2, 2),
  stone: T(10, 2, 2, 2),
  awning: T(12, 2, 2, 2),
  awningStripe: T(14, 2, 2, 2),
  office: T(0, 4, 4, 4),
  glass: T(4, 4, 4, 4),
  office1910: T(8, 4, 4, 4),
  apartment: T(12, 4, 4, 4),
  oldmarket: T(0, 8, 4, 4),
  warehouse: T(4, 8, 4, 4),
  garageDeck: T(8, 8, 4, 2),
  docks: T(8, 10, 4, 2),
  storefront: T(12, 8, 4, 2),
  storefrontClosed: T(12, 10, 4, 2),
  lobby: T(0, 12, 4, 2),
  church: T(4, 12, 4, 2),
  winA: T(8, 12, 1, 1),
  winALit: T(9, 12, 1, 1),
  winB: T(10, 12, 1, 1),
  winBLit: T(11, 12, 1, 1),
  winC: T(12, 12, 1, 1),
  winCTv: T(13, 12, 1, 1),
  winBoard: T(14, 12, 1, 1),
  white: T(15, 12, 1, 1),
  garageDoor: T(8, 13, 2, 1),
  shopDoor: T(10, 13, 1, 1),
  door: T(11, 13, 1, 1),
  doorScreen: T(12, 13, 1, 1),
  vent: T(13, 13, 1, 1),
  dark: T(14, 13, 1, 1),
  metalPlain: T(15, 13, 1, 1),
  churchWin: T(8, 14, 1, 2),
  winSmall: T(9, 14, 1, 1),
  winSmallLit: T(10, 14, 1, 1),
  trim: T(11, 14, 1, 1),
  acUnit: T(12, 14, 1, 1),
  doorApt: T(13, 14, 1, 1),
  winArch: T(14, 14, 1, 1),
  winArchLit: T(15, 14, 1, 1),
  winBoardShop: T(9, 15, 2, 1),
  rust: T(11, 15, 1, 1),
  glassBlock: T(12, 15, 1, 1),
  winALit2: T(13, 15, 1, 1),
  winBLit2: T(14, 15, 1, 1),
  grille: T(15, 15, 1, 1),
  silo: T(0, 14, 2, 2),
  tank: T(2, 14, 2, 2),
  sawtooth: T(4, 14, 2, 2),
  plywood: T(6, 14, 2, 2),
};

/** Meters per repeat for tiling facade tiles [u, v]. */
export const FT_SIZE = {
  siding: [3, 3], shingle: [3, 3], brick: [2.4, 2.4], brickBuff: [2.4, 2.4], concrete: [4, 4], metal: [3, 3], block: [3.2, 3.2], planks: [2.4, 2.4],
  roofShingle: [3, 3], roofTar: [6, 6], roofMetal: [3, 3], foliage: [2.5, 2.5], bark: [1, 2], stone: [2.4, 2.4], awning: [1.5, 1.5], awningStripe: [1.8, 1.8],
  office: [12, 14.4], glass: [12, 14.4], office1910: [12, 14.4], apartment: [12, 12], oldmarket: [12, 9], warehouse: [14, 10],
  garageDeck: [14, 6], docks: [12, 6], storefront: [8, 4.2], storefrontClosed: [8, 4.2], lobby: [12, 5], church: [8, 5],
  silo: [5, 5], tank: [4, 4], sawtooth: [3, 3], plywood: [2.4, 2.4], rust: [2, 2], glassBlock: [1, 1], grille: [1, 1],
};

/** Surface atlas tiles (4×4 tiles of 4 units). */
const S = (c, r) => [c * 4, 12 - r * 4, 4, 4];
export const ST = {
  asphalt: S(0, 0), asphalt2: S(1, 0), sidewalk: S(2, 0), brick: S(3, 0),
  lawn: S(0, 1), dirt: S(1, 1), gravel: S(2, 1), lot: S(3, 1),
  concrete: S(0, 2), dryGrass: S(1, 2), rail: S(2, 2), pavers: S(3, 2),
  paint: S(0, 3), mulch: S(1, 3), curb: S(2, 3), mud: S(3, 3),
};
export const ST_SIZE = {
  asphalt: 9, asphalt2: 9, sidewalk: 3.5, brick: 3, lawn: 7, dirt: 7, gravel: 5, lot: 10,
  concrete: 4, dryGrass: 7, rail: 2.4, pavers: 3, paint: 6, mulch: 4, curb: 3, mud: 8,
};

/** Fence atlas tiles (2×2 tiles of 8 units). */
export const FENCE = { chain: [0, 8, 8, 8], picket: [8, 8, 8, 8], iron: [0, 0, 8, 8], wire: [8, 0, 8, 8] };
export const FENCE_SIZE = { chain: [2.4, 1.2], picket: [1.8, 1.0], iron: [1.6, 1.2], wire: [2.4, 2.4] };

// ------------------------------------------------------------------ atlas scaffolding
class Atlas {
  constructor(size, design, emissiveScale = 0) {
    this.size = size;
    this.design = design;
    this.k = size / design;
    this.canvas = makeCanvas(size, size);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#808080';
    this.ctx.fillRect(0, 0, size, size);
    if (emissiveScale) {
      this.ek = this.k * emissiveScale;
      this.ecanvas = makeCanvas(size * emissiveScale, size * emissiveScale);
      this.ectx = this.ecanvas.getContext('2d');
      this.ectx.fillStyle = '#000';
      this.ectx.fillRect(0, 0, this.ecanvas.width, this.ecanvas.height);
    }
  }

  /** Draw into a region given in design pixels; fn(ctx, w, h). */
  region(x, y, w, h, fn, emissive = false) {
    const ctx = emissive ? this.ectx : this.ctx;
    const k = emissive ? this.ek : this.k;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, x * k, y * k);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    fn(ctx, w, h);
    ctx.restore();
  }

  /** Tile in grid units (tile rect from the table, y from the bottom). */
  tile(rect, grid, fn, efn = null) {
    const cell = this.design / grid;
    const units = 16 / grid;
    const col = rect[0] / units;
    const w = rect[2] / units;
    const h = rect[3] / units;
    const row = grid - rect[1] / units - h;
    this.region(col * cell, row * cell, w * cell, h * cell, fn);
    if (efn && this.ectx) this.region(col * cell, row * cell, w * cell, h * cell, efn, true);
  }
}

function canvasTexture(canvas, { repeat = false, anisotropy = 1, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ wall / roof painters
function brickWall(ctx, w, h, r, palette, mortar, rows = 32, cols = 12) {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, w, h);
  const bh = h / rows;
  const bw = w / cols;
  const colors = [];
  for (let j = 0; j < rows; j++) {
    colors[j] = [];
    for (let i = 0; i < cols; i++) colors[j][i] = jitter(palette[Math.floor(r() * palette.length)], 0.1, r);
  }
  const m = Math.max(0.6, bh * 0.12);
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * bw * 0.5;
    for (let i = -1; i < cols; i++) {
      ctx.fillStyle = colors[j][(i + cols) % cols];
      ctx.fillRect(i * bw + off + m, j * bh + m, bw - m * 2, bh - m * 2);
    }
  }
  grain(ctx, w, h, 0.18, 'overlay', r);
}

function clapboard(ctx, w, h, r, boards = 20) {
  const bh = h / boards;
  for (let i = 0; i < boards; i++) {
    const y = i * bh;
    ctx.fillStyle = jitter('#f0ede6', 0.025, r);
    ctx.fillRect(0, y, w, bh);
    vgrad(ctx, 0, y, w, bh * 0.45, [[0, 'rgba(40,35,30,0.34)'], [1, 'rgba(40,35,30,0)']]);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(0, y + bh - 1.2, w, 1.2);
    // butt joints
    if (r() < 0.5) {
      const x = r() * w;
      ctx.fillStyle = 'rgba(60,50,40,0.25)';
      ctx.fillRect(x, y, 1, bh);
    }
  }
  grain(ctx, w, h, 0.08, 'overlay', r);
  streaks(ctx, w, h, 12, 'rgba(70,60,45,0.8)', 0.12, r, 0.6);
  blotches(ctx, w, h, 6, 10, 26, ['rgba(110,100,80,1)'], 0.07, r);
  speckle(ctx, w, h, 40, ['#b5ad9d', '#8e877a'], 0.4, 1.4, r, 0.45);
}

function asbestosShingle(ctx, w, h, r) {
  const rows = 10;
  const cols = 5;
  const rh = h / rows;
  const cw = w / cols;
  ctx.fillStyle = '#8f8c86';
  ctx.fillRect(0, 0, w, h);
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * cw * 0.5;
    for (let i = -1; i < cols; i++) {
      const x = i * cw + off;
      ctx.fillStyle = jitter('#e9e6df', 0.04, r);
      ctx.fillRect(x + 0.8, j * rh + 0.8, cw - 1.6, rh - 1.6);
      // vertical striations (asbestos shingle texture)
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let s = 0; s < 8; s++) ctx.fillRect(x + 3 + (s * (cw - 6)) / 8, j * rh + 1, 1, rh - 2);
      vgrad(ctx, x, j * rh + rh - 5, cw, 5, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.25)']]);
    }
  }
  grain(ctx, w, h, 0.1, 'overlay', r);
  streaks(ctx, w, h, 10, 'rgba(60,55,45,0.8)', 0.12, r, 0.5);
}

function concreteWall(ctx, w, h, r) {
  ctx.fillStyle = '#b9b5ab';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 14, 20, 60, ['rgba(150,145,135,1)', 'rgba(200,196,188,1)'], 0.25, r);
  ctx.fillStyle = 'rgba(70,70,65,0.35)';
  ctx.fillRect(0, h / 2 - 0.7, w, 1.4);
  ctx.fillRect(0, h - 1.4, w, 1.4);
  ctx.fillRect(w / 2 - 0.7, 0, 1.4, h);
  ctx.fillRect(0, 0, 1.4, h);
  // form-tie holes
  ctx.fillStyle = 'rgba(60,60,55,0.5)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ctx.fillRect(w * (i / 4 + 0.125) - 1, h * (j / 4 + 0.125) - 1, 2, 2);
  grain(ctx, w, h, 0.16, 'overlay', r);
  streaks(ctx, w, h, 16, 'rgba(60,58,50,0.8)', 0.14, r);
}

function corrugated(ctx, w, h, r) {
  const n = 24;
  const rw = w / n;
  for (let i = 0; i < n; i++) {
    hgrad(ctx, i * rw, 0, rw, h, [[0, '#9ea2a4'], [0.35, '#e0e3e4'], [0.6, '#b8bcbe'], [1, '#7c8082']]);
  }
  ctx.fillStyle = 'rgba(40,40,40,0.35)';
  ctx.fillRect(0, h * 0.5, w, 1);
  streaks(ctx, w, h, 10, 'rgba(120,60,25,0.9)', 0.25, r);
  blotches(ctx, w, h, 5, 10, 30, ['rgba(130,70,30,1)'], 0.12, r);
  grain(ctx, w, h, 0.1, 'overlay', r);
}

function cinderBlock(ctx, w, h, r) {
  ctx.fillStyle = '#9d9a93';
  ctx.fillRect(0, 0, w, h);
  const rows = 16;
  const cols = 8;
  const bh = h / rows;
  const bw = w / cols;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * bw * 0.5;
    for (let i = -1; i < cols; i++) {
      ctx.fillStyle = jitter('#dad6cc', 0.03, r);
      ctx.fillRect(i * bw + off + 1, j * bh + 1, bw - 2, bh - 2);
    }
  }
  speckle(ctx, w, h, 300, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.15)'], 0.3, 0.9, r);
  grain(ctx, w, h, 0.12, 'overlay', r);
  streaks(ctx, w, h, 8, 'rgba(70,65,55,0.8)', 0.12, r);
}

function planks(ctx, w, h, r) {
  const n = 16;
  const pw = w / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = jitter('#d8cfbf', 0.07, r);
    ctx.fillRect(i * pw, 0, pw, h);
    ctx.strokeStyle = 'rgba(90,70,50,0.18)';
    ctx.lineWidth = 0.8;
    for (let g = 0; g < 3; g++) {
      const gx = i * pw + 2 + r() * (pw - 4);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + (r() - 0.5) * 4, h * 0.3, gx + (r() - 0.5) * 4, h * 0.7, gx, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,30,20,0.55)';
    ctx.fillRect(i * pw, 0, 1.2, h);
  }
  grain(ctx, w, h, 0.12, 'overlay', r);
  streaks(ctx, w, h, 8, 'rgba(60,50,35,0.8)', 0.15, r);
}

function roofShingles(ctx, w, h, r) {
  const rows = 22;
  const cols = 10;
  const rh = h / rows;
  const cw = w / cols;
  ctx.fillStyle = '#4a4846';
  ctx.fillRect(0, 0, w, h);
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * cw * 0.5;
    for (let i = -1; i < cols; i++) {
      ctx.fillStyle = jitter('#9a9791', 0.09, r);
      ctx.fillRect(i * cw + off + 0.6, j * rh, cw - 1.2, rh - 1.4);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, j * rh + rh - 1.6, w, 1.6);
  }
  speckle(ctx, w, h, 900, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.18)'], 0.3, 0.8, r);
  blotches(ctx, w, h, 8, 14, 40, ['rgba(40,50,35,1)', 'rgba(30,30,30,1)'], 0.18, r);
  grain(ctx, w, h, 0.12, 'overlay', r);
}

function tarRoof(ctx, w, h, r) {
  ctx.fillStyle = '#6f6d69';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 2500, ['#8d8a84', '#57554f', '#9d9892', '#4a4843'], 0.4, 1.3, r);
  blotches(ctx, w, h, 10, 20, 60, ['rgba(40,40,40,1)', 'rgba(140,138,130,1)'], 0.25, r);
  // seams / patches
  ctx.fillStyle = 'rgba(30,30,30,0.35)';
  ctx.fillRect(0, h * 0.3, w, 2);
  ctx.fillRect(w * 0.62, 0, 2, h);
  grain(ctx, w, h, 0.12, 'overlay', r);
}

function metalRoof(ctx, w, h, r) {
  const n = 10;
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    hgrad(ctx, i * sw, 0, sw, h, [[0, '#8d9294'], [0.08, '#dfe3e4'], [0.14, '#9fa4a6'], [1, '#aeb3b5']]);
  }
  streaks(ctx, w, h, 12, 'rgba(120,70,40,0.9)', 0.2, r);
  grain(ctx, w, h, 0.1, 'overlay', r);
}

function foliage(ctx, w, h, r) {
  ctx.fillStyle = '#4f6e2e';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 40, 10, 30, ['rgba(40,62,24,1)', 'rgba(96,128,56,1)'], 0.5, r);
  for (let i = 0; i < 700; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = 2 + r() * 5;
    const c = r() < 0.5 ? jitter('#7ea24a', 0.2, r) : jitter('#3c5a22', 0.2, r);
    ctx.fillStyle = c;
    wrapped(w, h, x, y, s, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, s, s * 0.6, r() * TAU, 0, TAU);
      ctx.fill();
    });
  }
  speckle(ctx, w, h, 160, ['rgba(20,30,10,0.6)'], 0.8, 2, r);
  grain(ctx, w, h, 0.12, 'overlay', r);
}

function bark(ctx, w, h, r) {
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    ctx.fillStyle = r() < 0.5 ? 'rgba(30,22,15,0.6)' : 'rgba(120,105,85,0.5)';
    ctx.fillRect(x, 0, 1 + r() * 3, h);
  }
  blotches(ctx, w, h, 12, 6, 20, ['rgba(40,32,24,1)', 'rgba(110,100,80,1)'], 0.3, r);
  grain(ctx, w, h, 0.2, 'overlay', r);
}

function stoneBlocks(ctx, w, h, r) {
  ctx.fillStyle = '#6d6961';
  ctx.fillRect(0, 0, w, h);
  const rows = 6;
  const cols = 4;
  const bh = h / rows;
  const bw = w / cols;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * bw * 0.5;
    for (let i = -1; i < cols; i++) {
      ctx.fillStyle = jitter('#a8a397', 0.1, r);
      ctx.fillRect(i * bw + off + 2, j * bh + 2, bw - 4, bh - 4);
      vgrad(ctx, i * bw + off + 2, j * bh + 2, bw - 4, bh - 4, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.18)']]);
    }
  }
  grain(ctx, w, h, 0.22, 'overlay', r);
}

function awningFabric(ctx, w, h, r, stripes) {
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, w, h);
  if (stripes) {
    const n = 8;
    for (let i = 0; i < n; i += 2) {
      ctx.fillStyle = '#9a968f';
      ctx.fillRect((i * w) / n, 0, w / n, h);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  streaks(ctx, w, h, 10, 'rgba(60,50,40,0.9)', 0.12, r);
  grain(ctx, w, h, 0.1, 'overlay', r);
}

// ------------------------------------------------------------------ windows
function glassPane(ctx, x, y, w, h, r, base = '#243240', refl = 0.25) {
  vgrad(ctx, x, y, w, h, [[0, mix(base, '#9fb4c4', 0.35)], [0.45, base], [1, mix(base, '#000000', 0.3)]]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = refl;
  ctx.fillStyle = '#dfeaf2';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h);
  ctx.lineTo(x + w * 0.45, y);
  ctx.lineTo(x + w * 0.62, y);
  ctx.lineTo(x + w * 0.27, y + h);
  ctx.fill();
  ctx.restore();
}

/** Emissive fill for a lit window (warm / cool / tv). */
function litPane(ctx, x, y, w, h, r, kind = 'warm', level = 1) {
  const c = kind === 'cool' ? ['#d8e6ff', '#9fb6e0'] : kind === 'tv' ? ['#7aa4ff', '#3a58c8'] : kind === 'fluor' ? ['#e4f2ee', '#a4c0c8'] : ['#ffd58a', '#e08a3a'];
  vgrad(ctx, x, y, w, h, [[0, mix('#000000', c[0], level)], [1, mix('#000000', c[1], level)]]);
}

/** Double-hung house window; variant: 'blinds' | 'curtain' | 'plain'. */
function houseWindow(ctx, w, h, r, variant, emissive, litKind) {
  const t = 11;
  if (!emissive) {
    ctx.fillStyle = '#f3f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(t - 2, t - 2, w - t * 2 + 4, h - t * 2 + 4);
    glassPane(ctx, t, t, w - t * 2, h / 2 - t - 2, r);
    glassPane(ctx, t, h / 2 + 2, w - t * 2, h / 2 - t - 2, r, '#1f2b37', 0.18);
    ctx.fillStyle = '#ecebe4';
    ctx.fillRect(t - 2, h / 2 - 3, w - t * 2 + 4, 6);
    if (variant === 'blinds') {
      ctx.fillStyle = 'rgba(235,228,205,0.85)';
      for (let y = t; y < h * 0.62; y += 4) ctx.fillRect(t, y, w - t * 2, 2.6);
    } else if (variant === 'curtain') {
      ctx.fillStyle = r() < 0.5 ? 'rgba(170,60,50,0.85)' : 'rgba(210,190,140,0.85)';
      ctx.fillRect(t, t, (w - t * 2) * 0.3, h - t * 2);
      ctx.fillRect(w - t - (w - t * 2) * 0.3, t, (w - t * 2) * 0.3, h - t * 2);
    }
    ctx.fillStyle = '#d8d5cb';
    ctx.fillRect(0, h - 7, w, 7);
    grain(ctx, w, h, 0.08, 'overlay', r);
  } else if (litKind) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    litPane(ctx, t, t, w - t * 2, h - t * 2, r, litKind, 0.8);
    if (variant === 'blinds') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      for (let y = t; y < h * 0.62; y += 4) ctx.fillRect(t, y + 2.6, w - t * 2, 1.4);
    } else if (variant === 'curtain') {
      ctx.fillStyle = 'rgba(120,40,10,0.7)';
      ctx.fillRect(t, t, (w - t * 2) * 0.3, h - t * 2);
      ctx.fillRect(w - t - (w - t * 2) * 0.3, t, (w - t * 2) * 0.3, h - t * 2);
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(t - 2, h / 2 - 3, w - t * 2 + 4, 6);
  }
}

function officeGrid(ctx, w, h, r, emissive, kind) {
  const bays = 4;
  const floors = 4;
  const cw = w / bays;
  const ch = h / floors;
  if (!emissive) {
    if (kind === 'concrete') {
      ctx.fillStyle = '#b8b4aa';
      ctx.fillRect(0, 0, w, h);
      for (let j = 0; j < floors; j++) {
        for (let i = 0; i < bays; i++) {
          const x = i * cw;
          const y = j * ch;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x + 12, y + 16, cw - 24, ch * 0.62 + 4);
          glassPane(ctx, x + 14, y + 18, cw - 28, ch * 0.62, r, r() < 0.2 ? '#3a3c36' : '#2c3844', 0.22);
          ctx.fillStyle = '#9d998f';
          ctx.fillRect(x + cw / 2 - 1.5, y + 18, 3, ch * 0.62);
          ctx.fillStyle = '#a7a398';
          ctx.fillRect(x, y + ch * 0.82, cw, ch * 0.18);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, j * ch + ch - 3, w, 3);
      }
      for (let i = 0; i < bays; i++) {
        ctx.fillStyle = '#c7c3b9';
        ctx.fillRect(i * cw, 0, 8, h);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(i * cw + 8, 0, 2, h);
      }
      streaks(ctx, w, h, 20, 'rgba(60,58,50,0.9)', 0.12, r);
      grain(ctx, w, h, 0.12, 'overlay', r);
    } else if (kind === 'glass') {
      ctx.fillStyle = '#141619';
      ctx.fillRect(0, 0, w, h);
      for (let j = 0; j < floors; j++) {
        for (let i = 0; i < bays; i++) {
          const x = i * cw;
          const y = j * ch;
          const tint = r() < 0.15 ? '#3a342c' : '#2a2e30';
          vgrad(ctx, x + 2, y + 2, cw - 4, ch * 0.74, [[0, mix(tint, '#8fa4b0', 0.4)], [0.6, tint], [1, mix(tint, '#000000', 0.3)]]);
          ctx.fillStyle = '#1b1c1e';
          ctx.fillRect(x + 2, y + ch * 0.76, cw - 4, ch * 0.24 - 2);
          ctx.fillStyle = 'rgba(160,170,175,0.25)';
          ctx.fillRect(x + cw / 2 - 0.8, y + 2, 1.6, ch * 0.74);
        }
      }
      // big diagonal sky reflection across the tile
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#cfe0ea';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.8);
      ctx.lineTo(w * 0.7, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w * 0.2, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.globalAlpha = 1;
      grain(ctx, w, h, 0.06, 'overlay', r);
    } else if (kind === '1910') {
      brickWall(ctx, w, h, r, ['#b58a5e', '#a67a50', '#c29a6c', '#9c7048'], '#cdbfa6', 64, 24);
      for (let j = 0; j < floors; j++) {
        const y = j * ch;
        ctx.fillStyle = '#d9cfb8';
        ctx.fillRect(0, y + ch - 7, w, 5);
        for (let i = 0; i < bays; i++) {
          for (let k = 0; k < 2; k++) {
            const x = i * cw + 16 + k * (cw / 2 - 8);
            const ww = cw / 2 - 24;
            ctx.fillStyle = '#e6dcc4';
            ctx.fillRect(x - 3, y + 16, ww + 6, 6);
            ctx.fillRect(x - 3, y + ch * 0.74, ww + 6, 5);
            ctx.fillStyle = '#e8e2d2';
            ctx.fillRect(x, y + 22, ww, ch * 0.52);
            glassPane(ctx, x + 3, y + 25, ww - 6, ch * 0.24 - 3, r, '#26303a', 0.2);
            glassPane(ctx, x + 3, y + 22 + ch * 0.26, ww - 6, ch * 0.24 - 3, r, '#212a33', 0.15);
          }
        }
      }
      streaks(ctx, w, h, 20, 'rgba(50,40,30,0.9)', 0.16, r);
    }
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let j = 0; j < floors; j++) {
      // whole-floor tendency: offices light up floor by floor
      const floorLit = r() < 0.45;
      for (let i = 0; i < bays; i++) {
        const lit = floorLit ? r() < 0.8 : r() < 0.12;
        if (!lit) continue;
        const x = i * cw;
        const y = j * ch;
        const k = r() < 0.7 ? 'fluor' : 'warm';
        const lvl = 0.55 + r() * 0.45;
        if (kind === 'concrete') litPane(ctx, x + 14, y + 18, cw - 28, ch * 0.62, r, k, lvl);
        else if (kind === 'glass') litPane(ctx, x + 2, y + 2, cw - 4, ch * 0.74, r, k, lvl * 0.9);
        else {
          for (let q = 0; q < 2; q++) {
            if (r() < 0.2) continue;
            const xx = x + 16 + q * (cw / 2 - 8);
            litPane(ctx, xx + 3, y + 25, cw / 2 - 30, ch * 0.5 - 4, r, 'warm', lvl);
          }
        }
      }
    }
  }
}

function apartmentGrid(ctx, w, h, r, emissive) {
  const bays = 4;
  const floors = 4;
  const cw = w / bays;
  const ch = h / floors;
  if (!emissive) {
    brickWall(ctx, w, h, r, ['#8a3d2c', '#7d3627', '#94452f', '#733023'], '#b9aa98', 64, 24);
    for (let j = 0; j < floors; j++) {
      const y = j * ch;
      for (let i = 0; i < bays; i++) {
        const x = i * cw + cw * 0.24;
        const ww = cw * 0.52;
        ctx.fillStyle = '#d8cdb4';
        ctx.fillRect(x - 4, y + 18, ww + 8, 7);
        ctx.fillRect(x - 5, y + ch * 0.78, ww + 10, 6);
        ctx.fillStyle = '#efece3';
        ctx.fillRect(x, y + 25, ww, ch * 0.53);
        glassPane(ctx, x + 4, y + 29, ww - 8, ch * 0.245 - 4, r, '#27323e', 0.22);
        glassPane(ctx, x + 4, y + 27 + ch * 0.265, ww - 8, ch * 0.245 - 4, r, '#1f2831', 0.15);
        const cur = r();
        if (cur < 0.35) {
          ctx.fillStyle = ['rgba(200,70,50,0.8)', 'rgba(230,210,150,0.85)', 'rgba(90,120,170,0.8)'][Math.floor(r() * 3)];
          ctx.fillRect(x + 4, y + 29, (ww - 8) * 0.35, ch * 0.5);
        } else if (cur < 0.55) {
          ctx.fillStyle = 'rgba(240,232,210,0.85)';
          for (let yy = y + 29; yy < y + 29 + ch * 0.3; yy += 4) ctx.fillRect(x + 4, yy, ww - 8, 2.4);
        }
        if (r() < 0.22) {
          // window AC unit
          ctx.fillStyle = '#c9c6bd';
          ctx.fillRect(x + ww * 0.15, y + 25 + ch * 0.4, ww * 0.7, ch * 0.14);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (let g = 0; g < 5; g++) ctx.fillRect(x + ww * 0.2 + g * ww * 0.12, y + 27 + ch * 0.4, 2, ch * 0.1);
        }
      }
    }
    streaks(ctx, w, h, 22, 'rgba(40,30,25,0.9)', 0.14, r);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let j = 0; j < floors; j++) {
      for (let i = 0; i < bays; i++) {
        if (r() > 0.42) continue;
        const x = i * cw + cw * 0.24;
        const ww = cw * 0.52;
        litPane(ctx, x + 4, j * ch + 29, ww - 8, ch * 0.5, r, r() < 0.15 ? 'tv' : 'warm', 0.6 + r() * 0.4);
      }
    }
  }
}

function oldMarketGrid(ctx, w, h, r, emissive) {
  const bays = 4;
  const floors = 2;
  const cw = w / bays;
  const ch = h / floors;
  if (!emissive) {
    brickWall(ctx, w, h, r, ['#8e3a28', '#9b4430', '#7f3222', '#a24a33', '#86402c'], '#b3a391', 72, 24);
    for (let i = 0; i < bays; i++) {
      ctx.fillStyle = 'rgba(60,20,10,0.18)';
      ctx.fillRect(i * cw, 0, 10, h);
    }
    for (let j = 0; j < floors; j++) {
      const y = j * ch;
      ctx.fillStyle = '#cbbd9f';
      ctx.fillRect(0, y + ch - 10, w, 6);
      for (let i = 0; i < bays; i++) {
        const x = i * cw + cw * 0.22;
        const ww = cw * 0.56;
        const top = y + ch * 0.16;
        const bot = y + ch * 0.8;
        const rr = ww / 2;
        // brick arch
        ctx.fillStyle = '#6e2a1c';
        ctx.beginPath();
        ctx.moveTo(x - 5, bot);
        ctx.lineTo(x - 5, top + rr);
        ctx.arc(x + rr, top + rr, rr + 5, Math.PI, 0);
        ctx.lineTo(x + ww + 5, bot);
        ctx.fill();
        ctx.fillStyle = '#ddd2bb';
        ctx.fillRect(x + rr - 4, top - 6, 8, 10);
        ctx.fillStyle = '#e4dccb';
        ctx.fillRect(x - 6, bot, ww + 12, 6);
        // glass (arched)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, bot);
        ctx.lineTo(x, top + rr);
        ctx.arc(x + rr, top + rr, rr, Math.PI, 0);
        ctx.lineTo(x + ww, bot);
        ctx.closePath();
        ctx.clip();
        glassPane(ctx, x, top, ww, bot - top, r, '#232c33', 0.2);
        ctx.fillStyle = 'rgba(210,200,180,0.8)';
        ctx.fillRect(x + ww / 2 - 1.5, top, 3, bot - top);
        ctx.fillRect(x, top + (bot - top) * 0.55, ww, 3);
        ctx.restore();
      }
    }
    streaks(ctx, w, h, 26, 'rgba(40,25,20,0.9)', 0.16, r);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let j = 0; j < floors; j++) {
      for (let i = 0; i < bays; i++) {
        if (r() > 0.45) continue;
        const x = i * cw + cw * 0.22;
        const ww = cw * 0.56;
        const top = j * ch + ch * 0.16;
        const bot = j * ch + ch * 0.8;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, bot);
        ctx.lineTo(x, top + ww / 2);
        ctx.arc(x + ww / 2, top + ww / 2, ww / 2, Math.PI, 0);
        ctx.lineTo(x + ww, bot);
        ctx.closePath();
        ctx.clip();
        litPane(ctx, x, top, ww, bot - top, r, 'warm', 0.6 + r() * 0.4);
        ctx.restore();
      }
    }
  }
}

function warehouseGrid(ctx, w, h, r, emissive) {
  const bays = 4;
  const floors = 2;
  const cw = w / bays;
  const ch = h / floors;
  if (!emissive) {
    brickWall(ctx, w, h, r, ['#8a4a36', '#7a4130', '#955440', '#6f3a2a'], '#a8998a', 72, 24);
    for (let j = 0; j < floors; j++) {
      for (let i = 0; i < bays; i++) {
        const x = i * cw + cw * 0.14;
        const y = j * ch + ch * 0.18;
        const ww = cw * 0.72;
        const hh = ch * 0.6;
        ctx.fillStyle = '#d5cab4';
        ctx.fillRect(x - 3, y + hh, ww + 6, 5);
        ctx.fillStyle = '#3a3d3f';
        ctx.fillRect(x, y, ww, hh);
        const px = 5;
        const py = 6;
        for (let a = 0; a < px; a++) {
          for (let b = 0; b < py; b++) {
            const q = r();
            const c = q < 0.1 ? '#111416' : q < 0.25 ? '#c9c7bf' : q < 0.3 ? '#5a6a4a' : null;
            const gx = x + 2 + (a * (ww - 4)) / px;
            const gy = y + 2 + (b * (hh - 4)) / py;
            const gw = (ww - 4) / px - 2;
            const gh = (hh - 4) / py - 2;
            if (c) {
              ctx.fillStyle = c;
              ctx.fillRect(gx, gy, gw, gh);
            } else glassPane(ctx, gx, gy, gw, gh, r, '#34414a', 0.3);
          }
        }
      }
    }
    streaks(ctx, w, h, 26, 'rgba(40,30,25,0.9)', 0.18, r);
    blotches(ctx, w, h, 8, 20, 50, ['rgba(40,30,25,1)'], 0.12, r);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let j = 0; j < floors; j++) {
      for (let i = 0; i < bays; i++) {
        if (r() > 0.18) continue;
        litPane(ctx, i * cw + cw * 0.14, j * ch + ch * 0.18, cw * 0.72, ch * 0.6, r, 'fluor', 0.4 + r() * 0.3);
      }
    }
  }
}

function garageDeck(ctx, w, h, r, emissive) {
  const bays = 4;
  const levels = 2;
  const cw = w / bays;
  const ch = h / levels;
  if (!emissive) {
    for (let j = 0; j < levels; j++) {
      const y = j * ch;
      ctx.fillStyle = '#1c1d1f';
      ctx.fillRect(0, y, w, ch);
      // parked car hints
      for (let i = 0; i < bays * 2; i++) {
        if (r() < 0.35) continue;
        ctx.fillStyle = ['#5a1a1a', '#1a2a4a', '#6a6a6a', '#2a3a2a', '#8a7a5a'][Math.floor(r() * 5)];
        rrect(ctx, i * (w / (bays * 2)) + 6, y + ch * 0.42, w / (bays * 2) - 12, ch * 0.22, 6);
        ctx.fill();
      }
      vgrad(ctx, 0, y + ch * 0.62, w, ch * 0.38, [[0, '#a9a59c'], [1, '#bdb9af']]);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + ch * 0.62, w, 2);
      for (let i = 0; i < bays; i++) {
        ctx.fillStyle = '#b1ada3';
        ctx.fillRect(i * cw, y, 10, ch);
      }
    }
    streaks(ctx, w, h, 20, 'rgba(60,55,50,0.9)', 0.18, r);
    grain(ctx, w, h, 0.12, 'overlay', r);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let j = 0; j < levels; j++) {
      vgrad(ctx, 0, j * ch + ch * 0.05, w, ch * 0.55, [[0, 'rgba(200,230,210,0.55)'], [1, 'rgba(60,80,70,0.2)']]);
    }
  }
}

function loadingDocks(ctx, w, h, r) {
  cinderBlock(ctx, w, h, r);
  ctx.fillStyle = 'rgba(80,80,80,0.35)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) {
    const x = w * (0.08 + i * 0.5);
    const dw = w * 0.34;
    const top = h * 0.2;
    const open = r() < 0.3 && i === 1;
    if (open) {
      ctx.fillStyle = '#0d0e10';
      ctx.fillRect(x, top, dw, h - top);
      ctx.fillStyle = '#6c6d6e';
      ctx.fillRect(x, top, dw, (h - top) * 0.3);
    } else {
      for (let k = 0; k < 14; k++) {
        vgrad(ctx, x, top + (k * (h - top)) / 14, dw, (h - top) / 14, [[0, '#c3c5c4'], [0.7, '#9a9c9b'], [1, '#6d6f6e']]);
      }
      streaks(ctx, dw, h, 0, '#000', 0, r);
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 10, h * 0.72, 8, h * 0.14);
    ctx.fillRect(x + dw + 2, h * 0.72, 8, h * 0.14);
    ctx.fillStyle = '#e6c33a';
    ctx.fillRect(x - 4, top - 6, dw + 8, 4);
  }
  streaks(ctx, w, h, 16, 'rgba(50,45,40,0.9)', 0.18, r);
}

function storefront(ctx, w, h, r, emissive, closed) {
  // 2 shop bays per tile. Bulkhead, display glass, transom, frame.
  const bays = 2;
  const bw = w / bays;
  if (!emissive) {
    brickWall(ctx, w, h, r, ['#8a3d2c', '#7d3627', '#94452f'], '#b5a794', 36, 24);
    for (let i = 0; i < bays; i++) {
      const x = i * bw;
      const fx = x + 10;
      const fw = bw - 20;
      ctx.fillStyle = '#2a2a2c';
      ctx.fillRect(fx, h * 0.08, fw, h * 0.92);
      // transom
      glassPane(ctx, fx + 4, h * 0.1, fw - 8, h * 0.13, r, '#2d3842', 0.2);
      ctx.fillStyle = '#3a3a3c';
      ctx.fillRect(fx, h * 0.23, fw, 4);
      const doorLeft = i === 0;
      const dw = fw * 0.24;
      const dx = doorLeft ? fx + 4 : fx + fw - dw - 4;
      const gx = doorLeft ? fx + dw + 10 : fx + 4;
      const gw = fw - dw - 14;
      if (!closed) {
        glassPane(ctx, gx, h * 0.26, gw, h * 0.52, r, '#3c4650', 0.25);
        // merchandise / posters
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = ['#d8342c', '#f2c230', '#2f6fd0', '#f4f1e6', '#3aa04a'][Math.floor(r() * 5)];
          ctx.globalAlpha = 0.85;
          ctx.fillRect(gx + 6 + r() * (gw - 40), h * (0.32 + r() * 0.3), 16 + r() * 22, 12 + r() * 18);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = 'rgba(30,30,30,0.5)';
        ctx.fillRect(gx, h * 0.62, gw, 3);
        glassPane(ctx, dx, h * 0.26, dw, h * 0.72, r, '#2e3842', 0.25);
        ctx.fillStyle = '#b8b8b0';
        ctx.fillRect(dx + dw * 0.1, h * 0.58, dw * 0.8, 3);
      } else {
        // roll-down security shutter
        for (let k = 0; k < 18; k++) {
          vgrad(ctx, gx, h * 0.26 + (k * h * 0.52) / 18, gw, (h * 0.52) / 18, [[0, '#b4b6b5'], [0.7, '#8b8d8c'], [1, '#5f6160']]);
        }
        streaks(ctx, gw, h, 0, '#000', 0, r);
        ctx.fillStyle = '#6a6c6b';
        ctx.fillRect(dx, h * 0.26, dw, h * 0.72);
        ctx.strokeStyle = 'rgba(40,40,40,0.8)';
        ctx.lineWidth = 1.2;
        for (let k = -6; k < 12; k++) {
          ctx.beginPath();
          ctx.moveTo(dx + k * 8, h * 0.26);
          ctx.lineTo(dx + k * 8 + h * 0.72, h * 0.98);
          ctx.moveTo(dx + k * 8 + h * 0.72, h * 0.26);
          ctx.lineTo(dx + k * 8, h * 0.98);
          ctx.stroke();
        }
      }
      // bulkhead
      ctx.fillStyle = closed ? '#5a5e5c' : '#6a6f6d';
      ctx.fillRect(gx, h * 0.78, gw, h * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(gx, h * 0.78, gw, 2);
    }
    streaks(ctx, w, h, 12, 'rgba(40,30,25,0.9)', 0.15, r);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (closed) return;
    for (let i = 0; i < bays; i++) {
      const x = i * bw;
      const fx = x + 10;
      const fw = bw - 20;
      const dw = fw * 0.24;
      const doorLeft = i === 0;
      const dx = doorLeft ? fx + 4 : fx + fw - dw - 4;
      const gx = doorLeft ? fx + dw + 10 : fx + 4;
      const gw = fw - dw - 14;
      litPane(ctx, gx, h * 0.26, gw, h * 0.52, r, 'fluor', 0.62);
      litPane(ctx, dx, h * 0.26, dw, h * 0.72, r, 'fluor', 0.55);
      litPane(ctx, fx + 4, h * 0.1, fw - 8, h * 0.13, r, 'warm', 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let k = 0; k < 4; k++) ctx.fillRect(gx + 6 + r() * (gw - 40), h * (0.32 + r() * 0.3), 16 + r() * 22, 12 + r() * 18);
    }
  }
}

function lobby(ctx, w, h, r, emissive) {
  if (!emissive) {
    ctx.fillStyle = '#c4c0b6';
    ctx.fillRect(0, 0, w, h);
    const n = 4;
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      glassPane(ctx, i * cw + 14, h * 0.14, cw - 28, h * 0.84, r, '#26313b', 0.3);
      ctx.fillStyle = 'rgba(200,200,195,0.5)';
      ctx.fillRect(i * cw + cw / 2 - 1, h * 0.14, 2, h * 0.84);
    }
    ctx.fillStyle = '#a19d94';
    ctx.fillRect(0, 0, w, h * 0.12);
    grain(ctx, w, h, 0.1, 'overlay', r);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const n = 4;
    const cw = w / n;
    for (let i = 0; i < n; i++) litPane(ctx, i * cw + 14, h * 0.14, cw - 28, h * 0.84, r, 'warm', 0.75);
  }
}

function churchWall(ctx, w, h, r, emissive) {
  const n = 2;
  const cw = w / n;
  if (!emissive) brickWall(ctx, w, h, r, ['#7a3a2a', '#8a4430', '#6e3224'], '#b0a08c', 40, 20);
  else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < n; i++) {
    const x = i * cw + cw * 0.3;
    const ww = cw * 0.4;
    const top = h * 0.12;
    const bot = h * 0.86;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, bot);
    ctx.lineTo(x, top + ww * 0.8);
    ctx.quadraticCurveTo(x, top, x + ww / 2, top - ww * 0.1);
    ctx.quadraticCurveTo(x + ww, top, x + ww, top + ww * 0.8);
    ctx.lineTo(x + ww, bot);
    ctx.closePath();
    if (!emissive) {
      ctx.fillStyle = '#d8ccb0';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#d8ccb0';
      ctx.stroke();
    }
    ctx.clip();
    const cols = ['#b8322a', '#2a5ab8', '#e0b030', '#3a9a4a', '#8a3ab8'];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 8; b++) {
        ctx.fillStyle = emissive ? mix('#000000', cols[Math.floor(r() * cols.length)], 0.55) : mix(cols[Math.floor(r() * cols.length)], '#202020', 0.45);
        ctx.fillRect(x + (a * ww) / 3, top - ww * 0.2 + (b * (bot - top + ww * 0.2)) / 8, ww / 3, (bot - top + ww * 0.2) / 8);
      }
    }
    ctx.strokeStyle = 'rgba(20,20,20,0.9)';
    ctx.lineWidth = 1.5;
    for (let a = 1; a < 3; a++) {
      ctx.beginPath();
      ctx.moveTo(x + (a * ww) / 3, top - ww);
      ctx.lineTo(x + (a * ww) / 3, bot);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ facade atlas
function buildFacadeAtlas(size, rng) {
  const A = new Atlas(size, 2048, 0.5);
  const r = rng;
  const tile = (name, fn, efn) => A.tile(FT[name], 16, fn, efn);

  tile('siding', (c, w, h) => clapboard(c, w, h, r));
  tile('shingle', (c, w, h) => asbestosShingle(c, w, h, r));
  tile('brick', (c, w, h) => {
    brickWall(c, w, h, r, ['#8e3b2b', '#a0442f', '#7a3326', '#954a36', '#843a2a'], '#b8ab9c');
    streaks(c, w, h, 14, 'rgba(40,30,25,0.9)', 0.14, r);
    blotches(c, w, h, 6, 20, 50, ['rgba(30,25,20,1)'], 0.1, r);
  });
  tile('brickBuff', (c, w, h) => {
    brickWall(c, w, h, r, ['#d6c3a0', '#cbb38a', '#dccaa8', '#c4ab82'], '#e4dccb');
    streaks(c, w, h, 14, 'rgba(60,50,40,0.9)', 0.14, r);
  });
  tile('concrete', (c, w, h) => concreteWall(c, w, h, r));
  tile('metal', (c, w, h) => corrugated(c, w, h, r));
  tile('block', (c, w, h) => cinderBlock(c, w, h, r));
  tile('planks', (c, w, h) => planks(c, w, h, r));
  tile('roofShingle', (c, w, h) => roofShingles(c, w, h, r));
  tile('roofTar', (c, w, h) => tarRoof(c, w, h, r));
  tile('roofMetal', (c, w, h) => metalRoof(c, w, h, r));
  tile('foliage', (c, w, h) => foliage(c, w, h, r));
  tile('bark', (c, w, h) => bark(c, w, h, r));
  tile('stone', (c, w, h) => stoneBlocks(c, w, h, r));
  tile('awning', (c, w, h) => awningFabric(c, w, h, r, false));
  tile('awningStripe', (c, w, h) => awningFabric(c, w, h, r, true));
  tile('office', (c, w, h) => officeGrid(c, w, h, r, false, 'concrete'), (c, w, h) => officeGrid(c, w, h, r, true, 'concrete'));
  tile('glass', (c, w, h) => officeGrid(c, w, h, r, false, 'glass'), (c, w, h) => officeGrid(c, w, h, r, true, 'glass'));
  tile('office1910', (c, w, h) => officeGrid(c, w, h, r, false, '1910'), (c, w, h) => officeGrid(c, w, h, r, true, '1910'));
  tile('apartment', (c, w, h) => apartmentGrid(c, w, h, r, false), (c, w, h) => apartmentGrid(c, w, h, r, true));
  tile('oldmarket', (c, w, h) => oldMarketGrid(c, w, h, r, false), (c, w, h) => oldMarketGrid(c, w, h, r, true));
  tile('warehouse', (c, w, h) => warehouseGrid(c, w, h, r, false), (c, w, h) => warehouseGrid(c, w, h, r, true));
  tile('garageDeck', (c, w, h) => garageDeck(c, w, h, r, false), (c, w, h) => garageDeck(c, w, h, r, true));
  tile('docks', (c, w, h) => loadingDocks(c, w, h, r));
  tile('storefront', (c, w, h) => storefront(c, w, h, r, false, false), (c, w, h) => storefront(c, w, h, r, true, false));
  tile('storefrontClosed', (c, w, h) => storefront(c, w, h, r, false, true));
  tile('lobby', (c, w, h) => lobby(c, w, h, r, false), (c, w, h) => lobby(c, w, h, r, true));
  tile('church', (c, w, h) => churchWall(c, w, h, r, false), (c, w, h) => churchWall(c, w, h, r, true));

  // house windows: same diffuse for lit / unlit variants, different emissive
  const winVariant = (name, variant, lit) => {
    const seed = Math.floor(r() * 1e9);
    tile(name, (c, w, h) => houseWindow(c, w, h, createRng(seed).next, variant, false), lit ? (c, w, h) => houseWindow(c, w, h, createRng(seed).next, variant, true, lit) : null);
    return seed;
  };
  const sA = Math.floor(r() * 1e9);
  const sB = Math.floor(r() * 1e9);
  const sC = Math.floor(r() * 1e9);
  tile('winA', (c, w, h) => houseWindow(c, w, h, createRng(sA).next, 'blinds', false));
  tile('winALit', (c, w, h) => houseWindow(c, w, h, createRng(sA).next, 'blinds', false), (c, w, h) => houseWindow(c, w, h, createRng(sA).next, 'blinds', true, 'warm'));
  tile('winALit2', (c, w, h) => houseWindow(c, w, h, createRng(sA).next, 'blinds', false), (c, w, h) => houseWindow(c, w, h, createRng(sA).next, 'blinds', true, 'cool'));
  tile('winB', (c, w, h) => houseWindow(c, w, h, createRng(sB).next, 'curtain', false));
  tile('winBLit', (c, w, h) => houseWindow(c, w, h, createRng(sB).next, 'curtain', false), (c, w, h) => houseWindow(c, w, h, createRng(sB).next, 'curtain', true, 'warm'));
  tile('winBLit2', (c, w, h) => houseWindow(c, w, h, createRng(sB).next, 'curtain', false), (c, w, h) => houseWindow(c, w, h, createRng(sB).next, 'curtain', true, 'tv'));
  tile('winC', (c, w, h) => houseWindow(c, w, h, createRng(sC).next, 'plain', false));
  tile('winCTv', (c, w, h) => houseWindow(c, w, h, createRng(sC).next, 'plain', false), (c, w, h) => houseWindow(c, w, h, createRng(sC).next, 'plain', true, 'tv'));
  void winVariant;

  tile('winBoard', (c, w, h) => {
    c.fillStyle = '#e8e4d8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#b49a6c';
    c.fillRect(8, 8, w - 16, h - 16);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(90,70,40,${0.1 + r() * 0.15})`;
      c.fillRect(8, 8 + r() * (h - 20), w - 16, 1 + r() * 2);
    }
    blotches(c, w, h, 4, 8, 20, ['rgba(60,50,40,1)'], 0.25, r);
    c.fillStyle = '#3a3a3a';
    for (let i = 0; i < 8; i++) c.fillRect(10 + (i % 2) * (w - 24), 14 + Math.floor(i / 2) * ((h - 28) / 3), 2, 2);
    grain(c, w, h, 0.15, 'overlay', r);
  });
  tile('white', (c, w, h) => {
    c.fillStyle = '#f4f4f2';
    c.fillRect(0, 0, w, h);
    grain(c, w, h, 0.06, 'overlay', r);
  });
  tile('garageDoor', (c, w, h) => {
    c.fillStyle = '#f0eee8';
    c.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const x = 6 + (i * (w - 12)) / 4;
        const y = 6 + (j * (h - 12)) / 4;
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(x + 3, y + 3, (w - 12) / 4 - 6, (h - 12) / 4 - 6);
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.fillRect(x + 3, y + 3, (w - 12) / 4 - 6, 2);
      }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(0, 6 + ((j + 1) * (h - 12)) / 4 - 1, w, 2);
    }
    streaks(c, w, h, 8, 'rgba(60,50,40,0.9)', 0.15, r);
    grain(c, w, h, 0.08, 'overlay', r);
  });
  tile('shopDoor', (c, w, h) => {
    c.fillStyle = '#9a9a96';
    c.fillRect(0, 0, w, h);
    glassPane(c, 12, 10, w - 24, h - 30, r, '#2c3640', 0.3);
    c.fillStyle = '#c8c8c0';
    c.fillRect(14, h * 0.55, w - 28, 4);
  }, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    litPane(c, 12, 10, w - 24, h - 30, r, 'fluor', 0.58);
  });
  tile('door', (c, w, h) => {
    c.fillStyle = '#e8e2d4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d0c6b0';
    c.fillRect(10, 6, w - 20, h - 6);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 2; i++) {
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(16 + i * ((w - 32) / 2 + 4), 14 + j * ((h - 24) / 3), (w - 40) / 2, (h - 24) / 3 - 8);
      }
    }
    c.fillStyle = '#c8a040';
    c.beginPath();
    c.arc(w - 22, h * 0.55, 3, 0, TAU);
    c.fill();
    grain(c, w, h, 0.1, 'overlay', r);
  });
  tile('doorScreen', (c, w, h) => {
    c.fillStyle = '#bfc2c2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a3036';
    c.fillRect(12, 8, w - 24, h * 0.44);
    c.fillRect(12, h * 0.56, w - 24, h * 0.4);
    c.fillStyle = 'rgba(200,200,200,0.25)';
    for (let y = 8; y < h; y += 2) c.fillRect(12, y, w - 24, 0.6);
    c.fillStyle = '#9ea2a3';
    c.fillRect(8, h * 0.48, w - 16, 8);
  }, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    litPane(c, 12, 8, w - 24, h * 0.88, r, 'warm', 0.5);
  });
  tile('vent', (c, w, h) => {
    c.fillStyle = '#9fa3a4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 10; y < h - 10; y += 8) c.fillRect(10, y, w - 20, 4);
  });
  tile('dark', (c, w, h) => {
    c.fillStyle = '#1b1c1e';
    c.fillRect(0, 0, w, h);
    grain(c, w, h, 0.1, 'overlay', r);
  });
  tile('metalPlain', (c, w, h) => {
    c.fillStyle = '#b4b7b8';
    c.fillRect(0, 0, w, h);
    grain(c, w, h, 0.18, 'overlay', r);
  });
  tile('churchWin', (c, w, h) => churchWall(c, w * 2, h, r, false), (c, w, h) => churchWall(c, w * 2, h, r, true));
  tile('winSmall', (c, w, h) => {
    c.fillStyle = '#efece4';
    c.fillRect(0, 0, w, h);
    glassPane(c, 14, 14, w - 28, h - 28, r, '#26303a', 0.2);
  });
  tile('winSmallLit', (c, w, h) => {
    c.fillStyle = '#efece4';
    c.fillRect(0, 0, w, h);
    glassPane(c, 14, 14, w - 28, h - 28, r, '#26303a', 0.2);
  }, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    litPane(c, 14, 14, w - 28, h - 28, r, 'warm', 0.8);
  });
  tile('trim', (c, w, h) => {
    c.fillStyle = '#efede6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < w; x += 9) c.fillRect(x, 0, 1, h);
    grain(c, w, h, 0.08, 'overlay', r);
  });
  tile('acUnit', (c, w, h) => {
    c.fillStyle = '#c9c6bd';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 12; x < w - 12; x += 7) c.fillRect(x, 16, 3, h - 32);
    streaks(c, w, h, 6, 'rgba(90,60,30,0.8)', 0.3, r);
  });
  tile('doorApt', (c, w, h) => {
    c.fillStyle = '#d6ccb4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#5a3a24';
    c.fillRect(12, 10, w - 24, h - 10);
    glassPane(c, 22, 18, w - 44, h * 0.45, r, '#2c3640', 0.25);
    c.fillStyle = '#e8dcc0';
    c.fillRect(8, 2, w - 16, 8);
  }, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    litPane(c, 22, 18, w - 44, h * 0.45, r, 'warm', 0.7);
  });
  const archWin = (c, w, h, emissive) => {
    if (!emissive) {
      c.fillStyle = '#e6dcc6';
      c.fillRect(0, 0, w, h);
    } else {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
    }
    c.save();
    c.beginPath();
    c.moveTo(14, h - 10);
    c.lineTo(14, w / 2);
    c.arc(w / 2, w / 2, w / 2 - 14, Math.PI, 0);
    c.lineTo(w - 14, h - 10);
    c.closePath();
    c.clip();
    if (!emissive) glassPane(c, 0, 0, w, h, r, '#26303a', 0.2);
    else litPane(c, 0, 0, w, h, r, 'warm', 0.8);
    c.restore();
  };
  tile('winArch', (c, w, h) => archWin(c, w, h, false));
  tile('winArchLit', (c, w, h) => archWin(c, w, h, false), (c, w, h) => archWin(c, w, h, true));
  tile('winBoardShop', (c, w, h) => {
    c.fillStyle = '#b49a6c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(60,40,20,0.5)';
    c.fillRect(w / 2 - 1, 0, 2, h);
    blotches(c, w, h, 6, 10, 30, ['rgba(80,60,40,1)'], 0.25, r);
    c.font = 'bold 18px sans-serif';
    c.fillStyle = 'rgba(30,30,30,0.6)';
    c.fillText('NO TRESPASSING', 20, h * 0.55);
    grain(c, w, h, 0.15, 'overlay', r);
  });
  tile('rust', (c, w, h) => {
    c.fillStyle = '#7a4a2a';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 20, 6, 20, ['rgba(160,90,40,1)', 'rgba(50,30,20,1)'], 0.5, r);
    grain(c, w, h, 0.2, 'overlay', r);
  });
  tile('glassBlock', (c, w, h) => {
    c.fillStyle = '#9aa6a8';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) vgrad(c, i * (w / 4) + 2, j * (h / 4) + 2, w / 4 - 4, h / 4 - 4, [[0, '#d8e4e6'], [1, '#8a9a9c']]);
  }, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) litPane(c, i * (w / 4) + 2, j * (h / 4) + 2, w / 4 - 4, h / 4 - 4, r, 'warm', 0.4);
  });
  tile('grille', (c, w, h) => {
    c.fillStyle = '#28292b';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#8a8c8c';
    for (let x = 4; x < w; x += 12) c.fillRect(x, 0, 3, h);
    c.fillRect(0, 6, w, 3);
    c.fillRect(0, h - 9, w, 3);
  });
  tile('silo', (c, w, h) => {
    c.fillStyle = '#c9c3b4';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += h / 8) {
      c.fillStyle = 'rgba(0,0,0,0.1)';
      c.fillRect(0, y, w, 1.5);
    }
    streaks(c, w, h, 30, 'rgba(70,60,45,0.9)', 0.2, r);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('tank', (c, w, h) => {
    c.fillStyle = '#d4d6d4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += h / 4) c.fillRect(0, y, w, 2);
    for (let x = 0; x < w; x += w / 3) c.fillRect(x, 0, 1.5, h);
    streaks(c, w, h, 12, 'rgba(120,80,40,0.9)', 0.2, r);
    grain(c, w, h, 0.08, 'overlay', r);
  });
  tile('sawtooth', (c, w, h) => {
    c.fillStyle = '#4a4e50';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const q = r();
        c.fillStyle = q < 0.2 ? '#d0d0c8' : q < 0.3 ? '#1a1c1e' : '#8a969a';
        c.fillRect(i * (w / 6) + 2, j * (h / 4) + 2, w / 6 - 4, h / 4 - 4);
      }
    }
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('plywood', (c, w, h) => {
    c.fillStyle = '#b8a078';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(80,60,30,0.3)';
    c.fillRect(w / 2 - 1, 0, 2, h);
    c.fillRect(0, h / 2 - 1, w, 2);
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(110,80,40,${0.05 + r() * 0.1})`;
      c.fillRect(0, r() * h, w, 1 + r() * 3);
    }
    blotches(c, w, h, 10, 10, 40, ['rgba(80,70,60,1)', 'rgba(60,60,60,1)'], 0.2, r);
    grain(c, w, h, 0.15, 'overlay', r);
  });
  return A;
}

// ------------------------------------------------------------------ surface atlas
function buildSurfaceAtlas(size, rng) {
  const A = new Atlas(size, 1024);
  const r = rng;
  const tile = (name, fn) => A.tile(ST[name], 16, fn);

  const asphalt = (c, w, h, base, worn) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 16, 20, 70, ['rgba(40,40,42,1)', 'rgba(120,118,112,1)'], worn ? 0.16 : 0.1, r);
    speckle(c, w, h, 2600, ['#6a6966', '#3a3a3c', '#7a7873', '#555555'], 0.3, 0.8, r, 0.45);
    // patches (rectangular repairs)
    for (let i = 0; i < (worn ? 4 : 2); i++) {
      const pw = 30 + r() * 60;
      const ph = 20 + r() * 50;
      const px = r() * w;
      const py = r() * h;
      c.fillStyle = r() < 0.5 ? 'rgba(30,30,32,0.3)' : 'rgba(100,99,95,0.25)';
      wrapped(w, h, px, py, Math.max(pw, ph), (x, y) => c.fillRect(x, y, pw, ph));
    }
    for (let i = 0; i < (worn ? 9 : 5); i++) crack(c, w, h, r() * w, r() * h, 40 + r() * 90, r() * TAU, 1.4, 'rgba(15,15,15,0.75)', r);
    for (let i = 0; i < 3; i++) blob(c, w, h, r() * w, r() * h, 10 + r() * 16, 'rgba(20,20,22,1)', 0.18);
    grain(c, w, h, 0.1, 'overlay', r);
  };
  tile('asphalt', (c, w, h) => asphalt(c, w, h, '#48484b', false));
  tile('asphalt2', (c, w, h) => asphalt(c, w, h, '#525254', true));
  tile('sidewalk', (c, w, h) => {
    c.fillStyle = '#aaa69c';
    c.fillRect(0, 0, w, h);
    const n = 2;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        c.fillStyle = jitter('#b1ada2', 0.05, r);
        c.fillRect((i * w) / n + 1.5, (j * h) / n + 1.5, w / n - 3, h / n - 3);
      }
    }
    blotches(c, w, h, 12, 10, 40, ['rgba(120,115,105,1)', 'rgba(190,186,176,1)'], 0.25, r);
    speckle(c, w, h, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.12)'], 0.3, 0.8, r);
    speckle(c, w, h, 14, ['rgba(40,40,40,0.35)'], 1, 2.2, r); // gum spots
    for (let i = 0; i < 3; i++) crack(c, w, h, r() * w, r() * h, 20 + r() * 40, r() * TAU, 0.8, 'rgba(60,58,52,0.6)', r);
    c.fillStyle = 'rgba(60,58,52,0.55)';
    for (let i = 0; i <= n; i++) {
      c.fillRect((i * w) / n - 1, 0, 2, h);
      c.fillRect(0, (i * h) / n - 1, w, 2);
    }
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('brick', (c, w, h) => {
    c.fillStyle = '#4a3a30';
    c.fillRect(0, 0, w, h);
    const rows = 30;
    const cols = 7;
    const bh = h / rows;
    const bw = w / cols;
    for (let j = 0; j < rows; j++) {
      const off = (j % 2) * bw * 0.5;
      for (let i = -1; i < cols; i++) {
        c.fillStyle = jitter(['#7a4a38', '#86523e', '#6e4232', '#8f5a44'][(j * 7 + ((i + cols) % cols)) % 4], 0.1, r);
        c.fillRect(i * bw + off + 1, j * bh + 1, bw - 2, bh - 2);
      }
    }
    blotches(c, w, h, 10, 20, 50, ['rgba(30,25,20,1)', 'rgba(140,120,100,1)'], 0.2, r);
    grain(c, w, h, 0.16, 'overlay', r);
  });
  tile('lawn', (c, w, h) => {
    c.fillStyle = '#56722f';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 20, 20, 60, ['rgba(70,92,38,1)', 'rgba(110,120,55,1)', 'rgba(52,72,30,1)'], 0.45, r);
    speckle(c, w, h, 2400, ['#6d8c3a', '#43602a', '#7a9a45', '#4d6a2c'], 0.4, 1.1, r);
    blotches(c, w, h, 4, 10, 25, ['rgba(140,125,70,1)'], 0.25, r);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('dirt', (c, w, h) => {
    c.fillStyle = '#6f5e45';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 20, 15, 50, ['rgba(90,78,58,1)', 'rgba(120,105,80,1)', 'rgba(60,50,38,1)'], 0.45, r);
    // weed clumps
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = r() * h;
      blob(c, w, h, x, y, 8 + r() * 22, r() < 0.6 ? 'rgba(88,110,48,1)' : 'rgba(130,130,60,1)', 0.6);
    }
    speckle(c, w, h, 1600, ['#8a7a60', '#4e4232', '#9a8c72', '#5f7a36'], 0.3, 1.1, r);
    speckle(c, w, h, 14, ['#c8c2b0', '#b03a2a', '#e0d8c0'], 0.8, 2.2, r); // litter
    grain(c, w, h, 0.14, 'overlay', r);
  });
  tile('gravel', (c, w, h) => {
    c.fillStyle = '#7d766a';
    c.fillRect(0, 0, w, h);
    speckle(c, w, h, 4200, ['#9a9284', '#5d574e', '#b0a898', '#6e675c', '#8b8373'], 0.4, 1.4, r);
    blotches(c, w, h, 8, 20, 50, ['rgba(60,55,48,1)'], 0.25, r);
    grain(c, w, h, 0.14, 'overlay', r);
  });
  tile('lot', (c, w, h) => {
    asphalt(c, w, h, '#4b4b4d', true);
    for (let i = 0; i < 10; i++) blob(c, w, h, r() * w, r() * h, 8 + r() * 14, 'rgba(15,15,18,1)', 0.35);
  });
  tile('concrete', (c, w, h) => {
    c.fillStyle = '#b3aea3';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 14, 15, 50, ['rgba(130,125,115,1)', 'rgba(200,196,186,1)'], 0.25, r);
    speckle(c, w, h, 700, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.12)'], 0.3, 0.8, r);
    for (let i = 0; i < 4; i++) blob(c, w, h, r() * w, r() * h, 8 + r() * 16, 'rgba(40,38,34,1)', 0.25);
    c.fillStyle = 'rgba(60,58,52,0.5)';
    c.fillRect(0, h / 2 - 1, w, 2);
    c.fillRect(w / 2 - 1, 0, 2, h);
    c.fillRect(0, 0, w, 1);
    c.fillRect(0, 0, 1, h);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('dryGrass', (c, w, h) => {
    c.fillStyle = '#7f7d45';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 20, 15, 50, ['rgba(110,110,60,1)', 'rgba(90,100,45,1)', 'rgba(130,120,70,1)'], 0.4, r);
    speckle(c, w, h, 2000, ['#9a9658', '#6a6a38', '#a8a060', '#5a6e32'], 0.4, 1.2, r);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('rail', (c, w, h) => {
    c.fillStyle = '#6f6960';
    c.fillRect(0, 0, w, h);
    speckle(c, w, h, 2600, ['#8e877a', '#56504a', '#a09888', '#6a5a4a'], 0.4, 1.4, r);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = (i + 0.5) * (h / n);
      c.fillStyle = jitter('#4a3a2c', 0.12, r);
      c.fillRect(w * 0.08, y - 7, w * 0.84, 14);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(w * 0.08, y + 5, w * 0.84, 2);
    }
    c.fillStyle = 'rgba(110,60,30,0.5)';
    c.fillRect(w * 0.3 - 3, 0, 6, h);
    c.fillRect(w * 0.7 - 3, 0, 6, h);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('pavers', (c, w, h) => {
    c.fillStyle = '#6a4e3e';
    c.fillRect(0, 0, w, h);
    const n = 12;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n * 2; j++) {
        c.fillStyle = jitter('#a0664a', 0.1, r);
        if ((i + j) % 2) c.fillRect(i * s + 1, (j * s) / 2 + 1, s - 2, s / 2 - 2);
        else c.fillRect(i * s + 1, (j * s) / 2 + 1, s / 2 - 2, s / 2 - 2), c.fillRect(i * s + s / 2 + 1, (j * s) / 2 + 1, s / 2 - 2, s / 2 - 2);
      }
    }
    grain(c, w, h, 0.14, 'overlay', r);
  });
  tile('paint', (c, w, h) => {
    c.fillStyle = '#f2f1ea';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 24, 6, 26, ['rgba(80,80,80,1)', 'rgba(140,140,140,1)'], 0.35, r);
    speckle(c, w, h, 900, ['rgba(60,60,60,0.5)'], 0.3, 1.2, r);
    grain(c, w, h, 0.1, 'overlay', r);
  });
  tile('mulch', (c, w, h) => {
    c.fillStyle = '#4a3828';
    c.fillRect(0, 0, w, h);
    speckle(c, w, h, 2200, ['#6a5038', '#34281c', '#5a4a30', '#3e5a2a'], 0.4, 1.4, r);
    grain(c, w, h, 0.14, 'overlay', r);
  });
  tile('curb', (c, w, h) => {
    c.fillStyle = '#b5b0a5';
    c.fillRect(0, 0, w, h);
    speckle(c, w, h, 800, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.12)'], 0.3, 0.8, r);
    vgrad(c, 0, h * 0.55, w, h * 0.45, [[0, 'rgba(60,55,45,0)'], [1, 'rgba(50,45,38,0.55)']]);
    c.fillStyle = 'rgba(60,58,52,0.4)';
    c.fillRect(0, 0, 1.5, h);
    c.fillRect(w / 2, 0, 1.5, h);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  tile('mud', (c, w, h) => {
    c.fillStyle = '#5e5446';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, 20, 20, 60, ['rgba(80,72,60,1)', 'rgba(50,44,36,1)'], 0.4, r);
    speckle(c, w, h, 900, ['#7a6e5c', '#453c30'], 0.3, 1, r);
    grain(c, w, h, 0.12, 'overlay', r);
  });
  return A;
}

// ------------------------------------------------------------------ fence atlas
function buildFenceAtlas(size, rng) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const k = size / 512;
  const r = rng;
  const region = (x, y, fn) => {
    ctx.save();
    ctx.setTransform(k, 0, 0, k, x * k, y * k);
    ctx.beginPath();
    ctx.rect(0, 0, 256, 256);
    ctx.clip();
    fn(ctx, 256, 256);
    ctx.restore();
  };
  // chain link (top-left in canvas = rows from top: [0,8] in uv means canvas top half)
  region(0, 0, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(175,180,178,1)';
    g.lineWidth = 2.2;
    const s = 16;
    for (let i = -h; i < w + h; i += s) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
      g.beginPath();
      g.moveTo(i, h);
      g.lineTo(i + h, 0);
      g.stroke();
    }
    // top rail + posts at tile edges
    g.fillStyle = '#9ea3a2';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, 0, 9, h);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(0, 2, w, 2);
  });
  region(256, 0, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const n = 8;
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = jitter('#f0ede4', 0.04, r);
      g.beginPath();
      g.moveTo(i * pw + 4, h);
      g.lineTo(i * pw + 4, 22);
      g.lineTo(i * pw + pw / 2, 4);
      g.lineTo(i * pw + pw - 4, 22);
      g.lineTo(i * pw + pw - 4, h);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(i * pw + pw - 8, 22, 4, h - 22);
    }
    g.fillStyle = '#e4e0d4';
    g.fillRect(0, 70, w, 12);
    g.fillRect(0, h - 60, w, 12);
    streaks(g, w, h, 10, 'rgba(70,60,45,0.9)', 0.2, r);
  });
  region(0, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1e1f21';
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (w / n);
      g.fillRect(x - 3, 12, 6, h - 12);
      g.beginPath();
      g.moveTo(x - 7, 16);
      g.lineTo(x, 0);
      g.lineTo(x + 7, 16);
      g.fill();
    }
    g.fillRect(0, 26, w, 8);
    g.fillRect(0, h - 30, w, 8);
  });
  region(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,155,152,1)';
    g.lineWidth = 1.6;
    const s = 12;
    for (let i = -h; i < w + h; i += s) {
      g.beginPath();
      g.moveTo(i, 40);
      g.lineTo(i + h, h + 40);
      g.stroke();
      g.beginPath();
      g.moveTo(i, h);
      g.lineTo(i + h - 40, 40);
      g.stroke();
    }
    g.fillStyle = '#8a8f8e';
    g.fillRect(0, 36, w, 6);
    g.fillRect(0, 0, 7, h);
    // barbed wire strands
    g.strokeStyle = '#6a6e6d';
    g.lineWidth = 1.4;
    for (let k2 = 0; k2 < 3; k2++) {
      g.beginPath();
      g.moveTo(0, 8 + k2 * 10);
      g.lineTo(w, 8 + k2 * 10);
      g.stroke();
      for (let x = 6; x < w; x += 16) {
        g.beginPath();
        g.moveTo(x - 3, 5 + k2 * 10);
        g.lineTo(x + 3, 11 + k2 * 10);
        g.moveTo(x + 3, 5 + k2 * 10);
        g.lineTo(x - 3, 11 + k2 * 10);
        g.stroke();
      }
    }
  });
  return c;
}

// ------------------------------------------------------------------ sign atlas
class Packer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.x = 0;
    this.y = 0;
    this.row = 0;
  }

  add(w, h) {
    if (this.x + w > this.w) {
      this.x = 0;
      this.y += this.row + 2;
      this.row = 0;
    }
    if (this.y + h > this.h) return null;
    const r = { x: this.x, y: this.y, w, h };
    this.x += w + 2;
    this.row = Math.max(this.row, h);
    return r;
  }
}

function drawSignBoard(c, w, h, biz, r, emissive) {
  const { text, sub, style, bg, fg } = biz;
  if (emissive) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    if (style === 'box') {
      c.fillStyle = mix('#000000', bg, 0.85);
      c.fillRect(4, 4, w - 8, h - 8);
      fitText(c, text, w / 2, h * 0.42, w - 24, h * 0.5, FONT_BLOCK, mix('#000000', fg, 0.8));
      if (sub) fitText(c, sub, w / 2, h * 0.8, w - 30, h * 0.2, FONT_SANS, mix('#000000', fg, 0.7));
    } else if (style === 'neon') {
      c.shadowColor = fg;
      c.shadowBlur = 10;
      fitText(c, text, w / 2, h * 0.42, w - 30, h * 0.52, FONT_SCRIPT, fg);
      fitText(c, text, w / 2, h * 0.42, w - 30, h * 0.52, FONT_SCRIPT, '#ffffff');
      c.shadowBlur = 6;
      if (sub) fitText(c, sub, w / 2, h * 0.8, w - 34, h * 0.2, FONT_SANS, fg);
      c.strokeStyle = fg;
      c.lineWidth = 2;
      rrect(c, 6, 6, w - 12, h - 12, 8);
      c.stroke();
      c.shadowBlur = 0;
    } else if (style === 'letters') {
      c.shadowColor = fg;
      c.shadowBlur = 5;
      fitText(c, text, w / 2, h * 0.45, w - 24, h * 0.55, FONT_SERIF, mix('#000000', fg, 0.8));
      c.shadowBlur = 0;
    }
    return;
  }
  if (style === 'box' || style === 'board') {
    c.fillStyle = style === 'box' ? '#2a2a2a' : mix(bg, '#000000', 0.3);
    c.fillRect(0, 0, w, h);
    c.fillStyle = bg;
    c.fillRect(4, 4, w - 8, h - 8);
    if (style === 'board') {
      c.strokeStyle = fg;
      c.lineWidth = 2;
      c.strokeRect(9, 9, w - 18, h - 18);
    }
    fitText(c, text, w / 2, h * 0.42, w - 26, h * 0.5, FONT_BLOCK, fg, style === 'board' ? 'rgba(0,0,0,0.35)' : null, 3);
    // board: sit the sub line inside the painted frame (its bottom edge is at h - 9)
    if (sub) fitText(c, sub, w / 2, style === 'board' ? h * 0.73 : h * 0.79, w - 34, style === 'board' ? h * 0.16 : h * 0.19, FONT_SANS, style === 'box' ? mix(fg, '#000000', 0.2) : fg);
    grain(c, w, h, style === 'board' ? 0.2 : 0.08, 'overlay', r);
    streaks(c, w, h, 6, 'rgba(40,30,20,0.8)', style === 'board' ? 0.25 : 0.1, r);
  } else if (style === 'neon') {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = mix(fg, '#ffffff', 0.3);
    c.lineWidth = 2;
    rrect(c, 6, 6, w - 12, h - 12, 8);
    c.stroke();
    fitText(c, text, w / 2, h * 0.42, w - 30, h * 0.52, FONT_SCRIPT, mix(fg, '#ffffff', 0.35));
    if (sub) fitText(c, sub, w / 2, h * 0.8, w - 34, h * 0.2, FONT_SANS, mix(fg, '#ffffff', 0.2));
    grain(c, w, h, 0.1, 'overlay', r);
  } else {
    // channel letters on a dark raceway
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, h * 0.4, w, h * 0.12);
    fitText(c, text, w / 2, h * 0.45, w - 24, h * 0.55, FONT_SERIF, fg, 'rgba(0,0,0,0.6)', 3);
    if (sub) fitText(c, sub, w / 2, h * 0.84, w - 40, h * 0.16, FONT_SANS, mix(fg, '#888888', 0.3));
  }
}

function drawBillboard(c, w, h, b, r) {
  c.fillStyle = b.bg;
  c.fillRect(0, 0, w, h);
  // art
  c.save();
  const art = b.art;
  if (art === 'stripes') {
    c.globalAlpha = 0.25;
    c.fillStyle = '#000';
    for (let x = -h; x < w; x += 40) {
      c.beginPath();
      c.moveTo(x, h);
      c.lineTo(x + 20, h);
      c.lineTo(x + 20 + h, 0);
      c.lineTo(x + h, 0);
      c.fill();
    }
  } else if (art === 'corn') {
    for (let i = 0; i < 3; i++) {
      const x = w * 0.82 + i * 18;
      c.fillStyle = '#f2c230';
      c.beginPath();
      c.ellipse(x, h * 0.5, 12, h * 0.34, 0.2, 0, TAU);
      c.fill();
      c.fillStyle = '#3a8a2a';
      c.beginPath();
      c.ellipse(x - 10, h * 0.62, 8, h * 0.3, -0.5, 0, TAU);
      c.fill();
    }
  } else if (art === 'ball') {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(w * 0.86, h * 0.5, h * 0.34, 0, TAU);
    c.fill();
    c.strokeStyle = '#d0202a';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w * 0.86 - h * 0.45, h * 0.5, h * 0.36, -0.7, 0.7);
    c.stroke();
    c.beginPath();
    c.arc(w * 0.86 + h * 0.45, h * 0.5, h * 0.36, Math.PI - 0.7, Math.PI + 0.7);
    c.stroke();
  } else if (art === 'leaves') {
    for (let i = 0; i < 14; i++) {
      c.fillStyle = r() < 0.5 ? '#2e8a3a' : '#57b045';
      c.beginPath();
      c.ellipse(w * (0.75 + r() * 0.25), h * r(), 24, 9, r() * TAU, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#f2a91c';
    c.beginPath();
    c.arc(w * 0.88, h * 0.45, 14, 0, TAU);
    c.fill();
  } else if (art === 'horse') {
    c.strokeStyle = '#5a1a1a';
    c.lineWidth = 9;
    c.beginPath();
    c.arc(w * 0.86, h * 0.45, h * 0.26, Math.PI * 0.15, Math.PI * 0.85, true);
    c.stroke();
    c.fillStyle = '#5a1a1a';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.2 + i * 0.13);
      c.beginPath();
      c.arc(w * 0.86 - Math.cos(a) * h * 0.26, h * 0.45 - Math.sin(a) * h * 0.26, 2.5, 0, TAU);
      c.fill();
    }
  } else if (art === 'pager') {
    c.fillStyle = '#222';
    rrect(c, w * 0.76, h * 0.25, w * 0.2, h * 0.5, 8);
    c.fill();
    c.fillStyle = '#9fd07a';
    c.fillRect(w * 0.78, h * 0.33, w * 0.16, h * 0.18);
    c.fillStyle = '#1a2a10';
    c.font = `bold ${Math.round(h * 0.14)}px monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('411-911', w * 0.86, h * 0.43, w * 0.15); // squeeze into the LCD
  } else if (art === 'wave') {
    c.strokeStyle = b.fg;
    c.globalAlpha = 0.5;
    c.lineWidth = 5;
    for (let i = 1; i <= 4; i++) {
      c.beginPath();
      c.arc(w * 0.88, h * 0.75, i * 16, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
  } else if (art === 'car') {
    c.fillStyle = '#b3141b';
    c.fillRect(w * 0.72, h * 0.52, w * 0.24, h * 0.18);
    c.fillRect(w * 0.77, h * 0.38, w * 0.13, h * 0.16);
    c.fillStyle = '#222';
    c.beginPath();
    c.arc(w * 0.77, h * 0.72, 9, 0, TAU);
    c.arc(w * 0.91, h * 0.72, 9, 0, TAU);
    c.fill();
  } else if (art === 'sun') {
    c.fillStyle = '#ffd23a';
    c.beginPath();
    c.arc(w * 0.87, h * 0.5, h * 0.2, 0, TAU);
    c.fill();
    c.strokeStyle = '#ffd23a';
    c.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.beginPath();
      c.moveTo(w * 0.87 + Math.cos(a) * h * 0.26, h * 0.5 + Math.sin(a) * h * 0.26);
      c.lineTo(w * 0.87 + Math.cos(a) * h * 0.38, h * 0.5 + Math.sin(a) * h * 0.38);
      c.stroke();
    }
  }
  c.restore();
  const tw = w * 0.7;
  const lines = b.lines;
  const lh = (h * 0.62) / lines.length;
  lines.forEach((ln, i) => fitText(c, ln, w * 0.38, h * 0.12 + lh * (i + 0.5), tw, lh * 0.9, FONT_BLOCK, b.fg, 'rgba(0,0,0,0.35)', 4));
  fitText(c, b.sub, w * 0.38, h * 0.86, tw, h * 0.13, FONT_SANS, b.fg);
  // weathering + paper seams
  c.fillStyle = 'rgba(0,0,0,0.08)';
  for (let x = w / 6; x < w; x += w / 6) c.fillRect(x, 0, 1.5, h);
  grain(c, w, h, 0.1, 'overlay', r);
  streaks(c, w, h, 10, 'rgba(40,30,20,0.9)', 0.12, r, 0.5);
  c.fillStyle = '#e8e4d8';
  c.fillRect(0, 0, w, 4);
  c.fillRect(0, h - 4, w, 4);
  c.fillRect(0, 0, 4, h);
  c.fillRect(w - 4, 0, 4, h);
}

function drawMural(c, w, h, kind, r) {
  if (kind === 'jazz') {
    vgrad(c, 0, 0, w, h, [[0, '#2a1a5a'], [0.55, '#c8502a'], [1, '#f2b23a']]);
    c.fillStyle = '#f7e08a';
    c.beginPath();
    c.arc(w * 0.72, h * 0.55, h * 0.28, 0, TAU);
    c.fill();
    // piano keys band
    c.fillStyle = '#f4f1e6';
    c.fillRect(0, h * 0.8, w, h * 0.2);
    c.fillStyle = '#111';
    for (let x = 0; x < w; x += 14) c.fillRect(x, h * 0.8, 1.5, h * 0.2);
    for (let x = 9; x < w; x += 14) if ((x / 14) % 7 !== 2 && (x / 14) % 7 !== 6) c.fillRect(x, h * 0.8, 8, h * 0.12);
    // silhouettes (horn player, bass)
    c.fillStyle = '#1a1020';
    c.beginPath();
    c.arc(w * 0.3, h * 0.36, 12, 0, TAU);
    c.fill();
    c.fillRect(w * 0.27, h * 0.42, 22, h * 0.36);
    c.fillStyle = '#e8b83a';
    c.beginPath();
    c.moveTo(w * 0.33, h * 0.4);
    c.lineTo(w * 0.44, h * 0.3);
    c.lineTo(w * 0.47, h * 0.36);
    c.fill();
    c.fillStyle = '#1a1020';
    c.beginPath();
    c.ellipse(w * 0.55, h * 0.58, 16, 34, 0, 0, TAU);
    c.fill();
    c.fillRect(w * 0.55 - 1.5, h * 0.2, 3, h * 0.4);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const x = w * (0.12 + r() * 0.8);
      const y = h * (0.1 + r() * 0.3);
      c.beginPath();
      c.arc(x, y, 4, 0, TAU);
      c.fill();
      c.fillRect(x + 3, y - 14, 1.5, 14);
    }
    fitText(c, '24TH STREET · WHERE JAZZ LIVES', w / 2, h * 0.1, w * 0.9, h * 0.1, FONT_BLOCK, '#ffffff', '#1a1020', 3);
  } else if (kind === 'peace') {
    vgrad(c, 0, 0, w, h, [[0, '#6ac4f0'], [1, '#e8f6ff']]);
    const cols = ['#d62828', '#f77f00', '#fcbf49', '#2a9d4a', '#1d6fd6', '#7b2cbf'];
    cols.forEach((col, i) => {
      c.strokeStyle = col;
      c.lineWidth = 9;
      c.beginPath();
      c.arc(w / 2, h * 1.05, h * 0.75 - i * 9, Math.PI, 0);
      c.stroke();
    });
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.3);
      const y = h * (0.35 + (i % 2) * 0.1);
      c.beginPath();
      c.ellipse(x, y, 18, 8, -0.3, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(x - 4, y);
      c.lineTo(x - 14, y - 22);
      c.lineTo(x + 8, y - 4);
      c.fill();
    }
    c.fillStyle = '#6b3a1f';
    c.fillRect(0, h * 0.82, w, h * 0.18);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = ['#6b3a1f', '#8a5a36', '#3a2214', '#a8704a'][i % 4];
      c.beginPath();
      c.arc(w * (0.08 + i * 0.12), h * 0.74, 10, 0, TAU);
      c.fill();
      c.fillRect(w * (0.08 + i * 0.12) - 8, h * 0.76, 16, h * 0.12);
    }
    fitText(c, 'PEACE IN THE HOOD', w / 2, h * 0.14, w * 0.85, h * 0.16, FONT_BLOCK, '#1d2a6b', '#ffffff', 5);
  } else if (kind === 'school') {
    c.fillStyle = '#f4e3b0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8942a';
    c.beginPath();
    c.arc(w * 0.15, h * 0.3, h * 0.16, 0, TAU);
    c.fill();
    c.fillStyle = '#2a5ab8';
    c.beginPath();
    c.moveTo(w * 0.35, h * 0.75);
    c.lineTo(w * 0.5, h * 0.68);
    c.lineTo(w * 0.65, h * 0.75);
    c.lineTo(w * 0.65, h * 0.4);
    c.lineTo(w * 0.5, h * 0.33);
    c.lineTo(w * 0.35, h * 0.4);
    c.fill();
    c.strokeStyle = '#f4f1e6';
    c.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(w * 0.38, h * (0.44 + i * 0.05));
      c.lineTo(w * 0.48, h * (0.4 + i * 0.05));
      c.moveTo(w * 0.52, h * (0.4 + i * 0.05));
      c.lineTo(w * 0.62, h * (0.44 + i * 0.05));
      c.stroke();
    }
    fitText(c, 'EDUCATION IS FREEDOM', w / 2, h * 0.12, w * 0.9, h * 0.14, FONT_BLOCK, '#7a1a1a', '#ffffff', 4);
    fitText(c, 'STAY IN SCHOOL · READ · DREAM', w / 2, h * 0.9, w * 0.9, h * 0.1, FONT_SANS, '#1a1a1a');
  } else {
    const cols = ['#b3141b', '#f2c230', '#1c7a3a', '#111111'];
    for (let i = 0; i < 16; i++) {
      c.fillStyle = cols[i % 4];
      c.fillRect((i * w) / 16, 0, w / 16 + 1, h);
      c.fillStyle = cols[(i + 2) % 4];
      for (let j = 0; j < 6; j++) if ((i + j) % 3 === 0) c.fillRect((i * w) / 16 + 3, (j * h) / 6 + 4, w / 16 - 6, h / 12);
    }
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, h * 0.38, w, h * 0.24);
    fitText(c, 'NORTH OMAHA PRIDE', w / 2, h * 0.5, w * 0.9, h * 0.18, FONT_BLOCK, '#f2c230', '#000000', 4);
  }
  grain(c, w, h, 0.14, 'overlay', r);
  streaks(c, w, h, 12, 'rgba(40,30,20,0.9)', 0.14, r, 0.6);
}

function drawGhostAd(c, w, h, ad, r) {
  brickWall(c, w, h, r, ['#8e3a28', '#9b4430', '#7f3222', '#a24a33'], '#b3a391', 40, 14);
  c.save();
  c.globalAlpha = 0.42;
  c.fillStyle = '#1e2a3a';
  c.fillRect(w * 0.05, h * 0.08, w * 0.9, h * 0.84);
  c.globalAlpha = 0.55;
  const lh = (h * 0.55) / ad.lines.length;
  ad.lines.forEach((ln, i) => fitText(c, ln, w / 2, h * 0.14 + lh * (i + 0.5), w * 0.82, lh * 0.9, FONT_SERIF, '#f2ead0'));
  fitText(c, ad.sub, w / 2, h * 0.8, w * 0.8, h * 0.12, FONT_SANS, '#f2c86a');
  c.restore();
  // erosion: brick shows through
  c.globalAlpha = 0.5;
  brickPatch(c, w, h, r);
  c.globalAlpha = 1;
  grain(c, w, h, 0.2, 'overlay', r);
}

function brickPatch(c, w, h, r) {
  for (let i = 0; i < 40; i++) {
    c.fillStyle = r() < 0.5 ? '#8e3a28' : '#9b4430';
    c.fillRect(r() * w, r() * h, 4 + r() * 16, 3 + r() * 5);
  }
}

function drawStreetName(c, w, h, text) {
  c.fillStyle = '#0f5a32';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#f2f2ea';
  c.lineWidth = 2;
  rrect(c, 3, 3, w - 6, h - 6, 4);
  c.stroke();
  fitText(c, text, w / 2, h * 0.54, w - 18, h * 0.72, FONT_SANS, '#f6f6f0');
}

/**
 * Build the sign atlas. Returns { canvas, ecanvas, cells: Map(name → [u0, v0, u1, v1]) }.
 * streetNames: array of strings (unique street-name blade labels).
 */
function buildSignAtlas(size, rng, streetNames) {
  const D = 2048;
  const A = new Atlas(size, D, 0.5);
  const P = new Packer(D, D);
  const cells = new Map();
  const r = rng;
  const add = (name, w, h, fn, efn = null) => {
    const rect = P.add(w, h);
    if (!rect) {
      console.warn(`[city] sign atlas full, skipping ${name}`);
      return;
    }
    A.region(rect.x, rect.y, w, h, fn);
    if (efn) A.region(rect.x, rect.y, w, h, efn, true);
    // uv (flipY): v from bottom
    const u0 = (rect.x + 1) / D;
    const u1 = (rect.x + w - 1) / D;
    const v1 = 1 - (rect.y + 1) / D;
    const v0 = 1 - (rect.y + h - 1) / D;
    cells.set(name, [u0, v0, u1, v1]);
  };

  // storefront signs (all districts)
  for (const [district, list] of Object.entries(BUSINESSES)) {
    list.forEach((biz, i) => {
      biz.key = `${district}:${i}`;
      const glow = biz.style !== 'board';
      add(`biz:${biz.key}`, 288, 64, (c, w, h) => drawSignBoard(c, w, h, biz, r, false), glow ? (c, w, h) => drawSignBoard(c, w, h, biz, r, true) : null);
    });
  }
  // billboards
  for (const b of BILLBOARDS) {
    add(`bb:${b.id}`, 384, 136, (c, w, h) => drawBillboard(c, w, h, b, r), (c, w, h) => {
      // billboard floodlights: faint even glow
      c.fillStyle = 'rgba(90,80,60,1)';
      c.fillRect(0, 0, w, h);
      vgrad(c, 0, 0, w, h, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
    });
  }
  // murals + ghost ads
  MURALS.forEach((m) => add(`mural:${m}`, 384, 192, (c, w, h) => drawMural(c, w, h, m, r)));
  GHOST_ADS.forEach((g, i) => add(`ghost:${i}`, 256, 192, (c, w, h) => drawGhostAd(c, w, h, g, r)));
  // gas price signs + canopy fascia
  GAS_BRANDS.forEach((g, i) => {
    const price = (c, w, h, e) => {
      if (e) {
        c.fillStyle = '#000';
        c.fillRect(0, 0, w, h);
        c.fillStyle = mix('#000000', g.color, 0.8);
        c.fillRect(6, 6, w - 12, h * 0.3);
        fitText(c, g.text, w / 2, h * 0.2, w - 20, h * 0.18, FONT_BLOCK, mix('#000000', g.accent, 0.9));
        c.fillStyle = 'rgba(240,240,230,0.85)';
        c.fillRect(8, h * 0.38, w - 16, h * 0.58);
        return;
      }
      c.fillStyle = '#e8e8e2';
      c.fillRect(0, 0, w, h);
      c.fillStyle = g.color;
      c.fillRect(6, 6, w - 12, h * 0.3);
      fitText(c, g.text, w / 2, h * 0.2, w - 20, h * 0.18, FONT_BLOCK, g.accent);
      const rows = [['REG', '1.09'], ['UNL', '1.15'], ['SUP', '1.21']];
      rows.forEach(([lbl, p], k) => {
        const y = h * (0.46 + k * 0.18);
        c.fillStyle = '#111';
        c.fillRect(10, y - h * 0.07, w - 20, h * 0.15);
        fitText(c, lbl, w * 0.24, y, w * 0.3, h * 0.08, FONT_SANS, '#ffffff');
        fitText(c, p, w * 0.62, y, w * 0.4, h * 0.12, FONT_BLOCK, '#ffd23a');
        fitText(c, '9', w * 0.86, y - h * 0.03, w * 0.1, h * 0.06, FONT_SANS, '#ffd23a');
      });
    };
    add(`gas:${i}`, 128, 192, (c, w, h) => price(c, w, h, false), (c, w, h) => price(c, w, h, true));
  });
  // blade signs (vertical, double sided)
  for (const word of ['LIQUOR', 'BARBER', 'PAWN', 'OPEN', 'HOTEL', 'BAR', 'CAFE', 'CHURCH']) {
    const col = { LIQUOR: '#ff4d6d', BARBER: '#58c7ff', PAWN: '#ffd23a', OPEN: '#ff3b3b', HOTEL: '#ff9c2b', BAR: '#ff5cf0', CAFE: '#6bff6b', CHURCH: '#ffffff' }[word];
    const blade = (c, w, h, e) => {
      c.fillStyle = e ? '#000' : '#1a1a1e';
      c.fillRect(0, 0, w, h);
      const n = word.length;
      if (!e) {
        c.strokeStyle = '#888';
        c.lineWidth = 2;
        c.strokeRect(3, 3, w - 6, h - 6);
      }
      for (let i = 0; i < n; i++) fitText(c, word[i], w / 2, 14 + ((h - 28) * (i + 0.5)) / n, w - 12, (h - 28) / n, FONT_BLOCK, e ? col : mix(col, '#ffffff', 0.3));
    };
    add(`blade:${word}`, 64, 224, (c, w, h) => blade(c, w, h, false), (c, w, h) => blade(c, w, h, true));
  }
  // street-name blades
  for (const name of streetNames) add(`street:${name}`, 224, 36, (c, w, h) => drawStreetName(c, w, h, name));
  // church name boards
  CHURCHES.forEach((name, i) => add(`church:${i}`, 224, 72, (c, w, h) => {
    c.fillStyle = '#2a2a2a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4f1e6';
    c.fillRect(4, 4, w - 8, h - 8);
    fitText(c, name.toUpperCase(), w / 2, h * 0.3, w - 16, h * 0.22, FONT_SERIF, '#1a1a1a');
    fitText(c, 'SUNDAY WORSHIP 11 AM', w / 2, h * 0.6, w - 20, h * 0.15, FONT_SANS, '#7a1a1a');
    fitText(c, 'ALL ARE WELCOME', w / 2, h * 0.82, w - 20, h * 0.13, FONT_SANS, '#1a1a1a');
  }));
  // bench ads
  const benchAds = [
    ['KBNC 94.1', '#5b1a8a', '#ffe23a'], ['METRO BEEPERS', '#101820', '#38e8ff'], ["EARL'S AUTO BODY", '#e8e2d0', '#1b2a5a'],
    ['RENT TO OWN', '#1a55b8', '#ffffff'], ['GO BIG RED', '#c8102e', '#ffffff'], ['VOTE · SPEAK UP', '#f2f2f2', '#1a1a1a'],
    ['BIG JIM\'S AUTO', '#ffe23a', '#b3141b'], ['K-HOT 101.7', '#e8461b', '#ffffff'],
  ];
  benchAds.forEach(([t, bg, fg], i) => add(`bench:${i}`, 224, 48, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    fitText(c, t, w / 2, h * 0.52, w - 16, h * 0.7, FONT_BLOCK, fg);
    grain(c, w, h, 0.12, 'overlay', r);
  }));
  // small cells
  add('stop', 96, 96, (c, w, h) => {
    c.fillStyle = '#f2f2f2';
    c.fillRect(0, 0, w, h);
    const oct = (k, col) => {
      c.fillStyle = col;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + TAU / 16;
        const x = w / 2 + Math.cos(a) * (w / 2 - k);
        const y = h / 2 + Math.sin(a) * (h / 2 - k);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.fill();
    };
    oct(1, '#f4f4f4');
    oct(5, '#c8161e');
    fitText(c, 'STOP', w / 2, h / 2 + 1, w * 0.78, h * 0.36, FONT_SANS, '#ffffff');
  });
  add('busstop', 64, 96, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d4f9c';
    c.fillRect(4, 4, w - 8, h * 0.4);
    fitText(c, 'MAT', w / 2, h * 0.24, w - 12, h * 0.3, FONT_BLOCK, '#ffffff');
    fitText(c, 'BUS', w / 2, h * 0.6, w - 12, h * 0.18, FONT_SANS, '#1d4f9c');
    fitText(c, 'STOP', w / 2, h * 0.8, w - 12, h * 0.18, FONT_SANS, '#1d4f9c');
  });
  add('payphone', 128, 40, (c, w, h) => {
    c.fillStyle = '#1b4e9b';
    c.fillRect(0, 0, w, h);
    fitText(c, 'PHONE', w * 0.36, h * 0.52, w * 0.6, h * 0.7, FONT_SANS, '#ffffff');
    fitText(c, 'US WEST', w * 0.82, h * 0.52, w * 0.3, h * 0.4, FONT_SANS, '#a8d0ff');
  }, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    fitText(c, 'PHONE', w * 0.36, h * 0.52, w * 0.6, h * 0.7, FONT_SANS, '#9fc4ff');
  });
  add('newsbox', 96, 128, (c, w, h) => {
    c.fillStyle = '#e8dc3a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a1a1a';
    c.fillRect(6, 6, w - 12, h * 0.2);
    fitText(c, 'World-Herald', w / 2, h * 0.16, w - 16, h * 0.14, FONT_SERIF, '#ffffff');
    glassPane(c, 10, h * 0.32, w - 20, h * 0.36, r, '#3a4450', 0.3);
    c.fillStyle = '#f4f1e6';
    c.fillRect(16, h * 0.4, w - 32, h * 0.24);
    c.fillStyle = '#333';
    for (let i = 0; i < 5; i++) c.fillRect(20, h * 0.43 + i * 5, w - 40, 2);
    fitText(c, '35¢', w / 2, h * 0.82, w - 20, h * 0.12, FONT_SANS, '#1a1a1a');
  });
  add('mail', 96, 48, (c, w, h) => {
    c.fillStyle = '#1d3f8a';
    c.fillRect(0, 0, w, h);
    fitText(c, 'U.S. MAIL', w / 2, h / 2, w - 12, h * 0.5, FONT_SANS, '#ffffff');
  });
  add('parking', 160, 96, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d4f9c';
    c.fillRect(6, 6, h - 12, h - 12);
    fitText(c, 'P', 6 + (h - 12) / 2, h / 2, h - 16, h * 0.8, FONT_SANS, '#ffffff');
    fitText(c, 'PARK', w * 0.68, h * 0.28, w * 0.4, h * 0.26, FONT_BLOCK, '#1a1a1a');
    fitText(c, '$3 ALL DAY', w * 0.68, h * 0.58, w * 0.42, h * 0.2, FONT_SANS, '#b3141b');
    fitText(c, 'MONTHLY', w * 0.68, h * 0.82, w * 0.4, h * 0.14, FONT_SANS, '#1a1a1a');
  });
  add('usedcars', 256, 80, (c, w, h) => {
    c.fillStyle = '#ffe23a';
    c.fillRect(0, 0, w, h);
    fitText(c, "BIG JIM'S USED CARS", w / 2, h * 0.36, w - 16, h * 0.4, FONT_BLOCK, '#b3141b');
    fitText(c, 'WE TOTE THE NOTE · NO CREDIT OK', w / 2, h * 0.76, w - 16, h * 0.2, FONT_SANS, '#1a1a1a');
  }, (c, w, h) => {
    c.fillStyle = '#403810';
    c.fillRect(0, 0, w, h);
  });
  add('carwash', 256, 80, (c, w, h) => {
    c.fillStyle = '#1c7fc4';
    c.fillRect(0, 0, w, h);
    fitText(c, 'SPARKLE CAR WASH', w / 2, h * 0.38, w - 16, h * 0.42, FONT_BLOCK, '#ffffff');
    fitText(c, 'HAND WASH $5 · WAX $10', w / 2, h * 0.78, w - 16, h * 0.2, FONT_SANS, '#ffe23a');
  });
  add('onlyparking', 96, 64, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    fitText(c, 'CUSTOMER', w / 2, h * 0.25, w - 10, h * 0.2, FONT_SANS, '#b3141b');
    fitText(c, 'PARKING', w / 2, h * 0.5, w - 10, h * 0.24, FONT_BLOCK, '#b3141b');
    fitText(c, 'ONLY', w / 2, h * 0.78, w - 10, h * 0.2, FONT_SANS, '#b3141b');
  });
  add('noparking', 64, 96, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c8161e';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(w / 2, h * 0.36, w * 0.3, 0, TAU);
    c.stroke();
    fitText(c, 'P', w / 2, h * 0.37, w * 0.4, h * 0.3, FONT_SANS, '#1a1a1a');
    c.beginPath();
    c.moveTo(w * 0.28, h * 0.16);
    c.lineTo(w * 0.72, h * 0.56);
    c.stroke();
    fitText(c, 'TOW ZONE', w / 2, h * 0.82, w - 8, h * 0.16, FONT_SANS, '#c8161e');
  });
  // lamp lenses (diffuse light grey; emissive = light colour)
  const lamp = (name, color) => add(name, 32, 32, (c, w, h) => {
    c.fillStyle = '#d8d6ce';
    c.fillRect(0, 0, w, h);
  }, (c, w, h) => {
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
  });
  lamp('lamp:sodium', '#ffae52');
  lamp('lamp:fluor', '#e8f4ff');
  lamp('lamp:warm', '#ffd88a');
  lamp('lamp:red', '#ff3030');
  add('dark', 32, 32, (c, w, h) => {
    c.fillStyle = '#202022';
    c.fillRect(0, 0, w, h);
  });
  add('white', 32, 32, (c, w, h) => {
    c.fillStyle = '#f0f0ec';
    c.fillRect(0, 0, w, h);
  });
  return { canvas: A.canvas, ecanvas: A.ecanvas, cells };
}

function buildPoolTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

/** Base ground grass texture (tiles, separate so it can repeat across the whole map). */
function buildGroundTexture(size, rng) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.scale(size / 256, size / 256);
  const w = 256;
  const h = 256;
  ctx.fillStyle = '#5a6e36';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 24, 16, 60, ['rgba(80,95,45,1)', 'rgba(110,112,60,1)', 'rgba(60,78,34,1)', 'rgba(120,108,70,1)'], 0.45, rng);
  speckle(ctx, w, h, 2400, ['#6d8438', '#4a5e2c', '#7e8c48', '#5c5a3a'], 0.4, 1.1, rng);
  grain(ctx, w, h, 0.12, 'overlay', rng);
  return c;
}

// ------------------------------------------------------------------ public
/**
 * Create every city texture. quality: game.quality ({ detail }), anisotropy: max to use.
 * streetNames: labels for street-name blades.
 */
export function createCityTextures({ detail = 1, anisotropy = 1, streetNames = [], seed = 1993 } = {}) {
  const rng = createRng(seed ^ 0x5eed);
  const big = detail >= 1;
  setDensity(big ? 1 : 0.55);
  const facade = buildFacadeAtlas(big ? 2048 : 1024, rng.next);
  const surface = buildSurfaceAtlas(big ? 1024 : 512, rng.next);
  const fence = buildFenceAtlas(big ? 512 : 256, rng.next);
  const signs = buildSignAtlas(big ? 2048 : 1024, rng.next, streetNames);
  const ground = buildGroundTexture(big ? 256 : 128, rng.next);
  const aniso = Math.max(1, anisotropy);
  return {
    facade: canvasTexture(facade.canvas, { anisotropy: aniso }),
    facadeEmissive: canvasTexture(facade.ecanvas, { anisotropy: 1 }),
    surface: canvasTexture(surface.canvas, { anisotropy: aniso }),
    fence: canvasTexture(fence, { anisotropy: aniso }),
    signs: canvasTexture(signs.canvas, { anisotropy: aniso }),
    signsEmissive: canvasTexture(signs.ecanvas, { anisotropy: 1 }),
    signCells: signs.cells,
    pool: canvasTexture(buildPoolTexture(), { mips: true }),
    ground: canvasTexture(ground, { repeat: true, anisotropy: aniso }),
  };
}
