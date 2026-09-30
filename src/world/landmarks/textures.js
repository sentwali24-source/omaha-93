import * as THREE from 'three';
import { createRng } from '../../core/rng.js';

// Canvas textures for the landmarks: repeating facade tiles (with a matching night "lit window"
// emissive map), two strip atlases (low-rise walls, ground surfaces), grass, water, chain-link,
// a glow sprite. Everything is drawn once at boot.
//
// Facade textures are drawn near-white where the wall is, so vertex colors tint them per
// building (brick red, limestone, granite...). Windows stay dark whatever the tint.
//
// Canvas y grows downward and CanvasTexture flips Y, so canvas row py maps to v = 1 - py / H.

export const TILES = {
  office: { bays: 4, floors: 4 },
  slab: { bays: 8, floors: 4 },
  glass: { bays: 4, floors: 4 },
  masonry: { bays: 4, floors: 4 },
};

// Low-rise strip atlas rows: [id, relative height]. Each row repeats horizontally.
const LOWRISE_ROWS = [
  ['rowhouse', 176],
  ['boarded', 176],
  ['storefront', 120],
  ['deco', 128],
  ['fluted', 88],
  ['shed', 88],
  ['terminal', 88],
  ['stoneslit', 88],
  ['siding', 120],
  ['sandbag', 72],
];

// Ground strip atlas rows.
const GROUND_ROWS = [
  ['asphalt', 64],
  ['parking', 96],
  ['runway', 128],
  ['taxiway', 64],
  ['rail', 96],
  ['path', 48],
  ['dirt', 80],
  ['pavers', 80],
  ['plaza', 64],
  ['court', 160],
  ['highway', 96],
  ['rubble', 72],
];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { wrapS = true, wrapT = true, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = wrapT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Fine speckle noise: n dots of random gray with alpha a. */
function speckle(g, x, y, w, h, n, a, rng, dark = true) {
  for (let i = 0; i < n; i++) {
    const v = dark ? Math.floor(rng() * 90) : 160 + Math.floor(rng() * 95);
    g.fillStyle = `rgba(${v},${v},${v},${a * (0.4 + rng() * 0.6)})`;
    g.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

function glassGrad(g, x0, y0, x1, y1, top, bottom) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

const LIT_WARM = ['#ffe3a3', '#ffd88a', '#ffeccc', '#f7c979'];
const LIT_COOL = ['#e6efff', '#d6e6ff', '#f2f6ff'];
function litColor(rng, cool = 0.35) {
  const pal = rng() < cool ? LIT_COOL : LIT_WARM;
  return pal[Math.floor(rng() * pal.length)];
}

// ------------------------------------------------------------------ repeating facades
function drawOffice(S, rng) {
  const c = canvas(S, S);
  const e = canvas(S, S);
  const g = c.getContext('2d');
  const k = e.getContext('2d');
  const B = S / 4;
  const F = S / 4;
  g.fillStyle = '#ebe8e1';
  g.fillRect(0, 0, S, S);
  speckle(g, 0, 0, S, S, S * 6, 0.12, rng);
  k.fillStyle = '#000';
  k.fillRect(0, 0, S, S);
  for (let f = 0; f < 4; f++) {
    const y = f * F;
    const wy0 = y + F * 0.14;
    const wy1 = y + F * 0.74;
    // recess shadow above the ribbon, sill highlight below
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, wy0 - F * 0.04, S, F * 0.04);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, wy1, S, F * 0.02);
    for (let b = 0; b < 4; b++) {
      for (let p = 0; p < 2; p++) {
        const x0 = b * B + B * (0.03 + p * 0.5);
        const x1 = x0 + B * 0.44;
        const t = 0.8 + rng() * 0.4;
        glassGrad(g, x0, wy0, x1, wy1, `rgb(${96 * t | 0},${116 * t | 0},${134 * t | 0})`, `rgb(${34 * t | 0},${42 * t | 0},${52 * t | 0})`);
        if (rng() < 0.3) {
          // blinds half drawn
          g.fillStyle = 'rgba(200,200,190,0.55)';
          const bh = (wy1 - wy0) * (0.2 + rng() * 0.5);
          g.fillRect(x0, wy0, x1 - x0, bh);
        }
        if (rng() < 0.42) {
          k.fillStyle = litColor(rng);
          k.fillRect(x0 + 1, wy0 + 1, x1 - x0 - 2, wy1 - wy0 - 2);
          if (rng() < 0.5) {
            k.fillStyle = 'rgba(0,0,0,0.35)';
            k.fillRect(x0 + 1, wy0 + 1, x1 - x0 - 2, (wy1 - wy0) * 0.25);
          }
        }
      }
      // mullions
      g.fillStyle = '#b9b9b4';
      g.fillRect(b * B, wy0, Math.max(1, B * 0.03), wy1 - wy0);
      g.fillRect(b * B + B * 0.485, wy0, Math.max(1, B * 0.03), wy1 - wy0);
    }
  }
  return [c, e];
}

function drawSlab(S, rng) {
  const c = canvas(S, S);
  const e = canvas(S, S);
  const g = c.getContext('2d');
  const k = e.getContext('2d');
  const B = S / 8;
  const F = S / 4;
  g.fillStyle = '#efe9e4';
  g.fillRect(0, 0, S, S);
  speckle(g, 0, 0, S, S, S * 5, 0.1, rng);
  k.fillStyle = '#000';
  k.fillRect(0, 0, S, S);
  for (let b = 0; b < 8; b++) {
    const x0 = b * B + B * 0.26;
    const x1 = b * B + B * 0.86;
    // continuous dark window column (bronze glass + dark spandrels)
    g.fillStyle = '#2a2523';
    g.fillRect(x0, 0, x1 - x0, S);
    // fin shading: the right side of each pier is in shadow
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x1, 0, B * 0.08, S);
    for (let f = 0; f < 4; f++) {
      const y0 = f * F + F * 0.1;
      const y1 = f * F + F * 0.84;
      const t = 0.75 + rng() * 0.5;
      glassGrad(g, x0, y0, x1, y1, `rgb(${92 * t | 0},${78 * t | 0},${66 * t | 0})`, `rgb(${30 * t | 0},${25 * t | 0},${22 * t | 0})`);
      if (rng() < 0.34) {
        k.fillStyle = litColor(rng, 0.3);
        k.fillRect(x0 + 1, y0 + 2, x1 - x0 - 2, y1 - y0 - 4);
      }
    }
  }
  return [c, e];
}

function drawGlass(S, rng) {
  const c = canvas(S, S);
  const e = canvas(S, S);
  const g = c.getContext('2d');
  const k = e.getContext('2d');
  const B = S / 4;
  const F = S / 4;
  k.fillStyle = '#000';
  k.fillRect(0, 0, S, S);
  for (let b = 0; b < 4; b++) {
    const t = 0.85 + rng() * 0.3;
    for (let f = 0; f < 4; f++) {
      const y = f * F;
      glassGrad(g, b * B, y, (b + 1) * B, y + F * 0.8, `rgb(${150 * t | 0},${170 * t | 0},${182 * t | 0})`, `rgb(${70 * t | 0},${84 * t | 0},${96 * t | 0})`);
      // spandrel glass (opaque, a touch darker)
      g.fillStyle = `rgb(${58 * t | 0},${66 * t | 0},${74 * t | 0})`;
      g.fillRect(b * B, y + F * 0.8, B, F * 0.2);
      if (rng() < 0.3) {
        k.fillStyle = litColor(rng, 0.6);
        k.fillRect(b * B + 2, y + 2, B - 4, F * 0.78 - 2);
      }
    }
  }
  g.fillStyle = 'rgba(210,215,220,0.8)';
  for (let b = 0; b < 8; b++) g.fillRect((b * B) / 2, 0, Math.max(1, S / 256), S);
  for (let f = 0; f < 4; f++) {
    g.fillRect(0, f * F + F * 0.8, S, Math.max(1, S / 256));
    g.fillRect(0, f * F, S, Math.max(1, S / 256));
  }
  return [c, e];
}

function drawMasonry(S, rng) {
  const c = canvas(S, S);
  const e = canvas(S, S);
  const g = c.getContext('2d');
  const k = e.getContext('2d');
  const B = S / 4;
  const F = S / 4;
  g.fillStyle = '#f1eee8';
  g.fillRect(0, 0, S, S);
  // faint brick courses
  g.fillStyle = 'rgba(0,0,0,0.05)';
  const course = Math.max(2, S / 170);
  for (let y = 0; y < S; y += course) g.fillRect(0, y, S, 1);
  speckle(g, 0, 0, S, S, S * 8, 0.14, rng);
  k.fillStyle = '#000';
  k.fillRect(0, 0, S, S);
  for (let f = 0; f < 4; f++) {
    for (let b = 0; b < 4; b++) {
      const x0 = b * B + B * 0.29;
      const x1 = b * B + B * 0.71;
      const y0 = f * F + F * 0.2;
      const y1 = f * F + F * 0.74;
      // lintel + sill
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(x0 - B * 0.03, y0 - F * 0.06, x1 - x0 + B * 0.06, F * 0.05);
      g.fillRect(x0 - B * 0.04, y1, x1 - x0 + B * 0.08, F * 0.04);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0 - B * 0.03, y1 + F * 0.04, x1 - x0 + B * 0.06, F * 0.03);
      // frame + glass
      g.fillStyle = '#d9d4ca';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      const t = 0.8 + rng() * 0.4;
      const fr = Math.max(1, B * 0.035);
      glassGrad(g, x0 + fr, y0 + fr, x1 - fr, y1 - fr, `rgb(${88 * t | 0},${104 * t | 0},${118 * t | 0})`, `rgb(${30 * t | 0},${36 * t | 0},${44 * t | 0})`);
      if (rng() < 0.25) {
        g.fillStyle = 'rgba(225,220,200,0.7)';
        g.fillRect(x0 + fr, y0 + fr, x1 - x0 - fr * 2, (y1 - y0) * (0.25 + rng() * 0.4));
      }
      g.fillStyle = '#d9d4ca';
      g.fillRect(x0, (y0 + y1) / 2 - fr / 2, x1 - x0, fr);
      if (rng() < 0.3) {
        k.fillStyle = litColor(rng, 0.2);
        k.fillRect(x0 + fr, y0 + fr, x1 - x0 - fr * 2, y1 - y0 - fr * 2);
        k.fillStyle = '#000';
        k.fillRect(x0, (y0 + y1) / 2 - fr / 2, x1 - x0, fr);
      }
    }
  }
  return [c, e];
}

// ------------------------------------------------------------------ strip atlases
function layoutRows(rows, H, gutter) {
  const total = rows.reduce((s, r) => s + r[1], 0);
  const avail = H - gutter * (rows.length + 1);
  const out = {};
  let y = gutter;
  for (const [id, h] of rows) {
    const ph = Math.floor((h / total) * avail);
    out[id] = { y, h: ph, v0: 1 - (y + ph) / H, v1: 1 - y / H };
    y += ph + gutter;
  }
  return out;
}

/** Copy the first/last pixel rows of each row into the gutters (limits mip bleeding). */
function bleedRows(g, rows, W, gutter) {
  for (const r of Object.values(rows)) {
    g.drawImage(g.canvas, 0, r.y, W, 1, 0, r.y - gutter, W, gutter);
    g.drawImage(g.canvas, 0, r.y + r.h - 1, W, 1, 0, r.y + r.h, W, gutter);
  }
}

function win(g, x0, y0, x1, y1, frame, t = 1) {
  g.fillStyle = frame;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const fr = Math.max(1, (x1 - x0) * 0.08);
  glassGrad(g, x0 + fr, y0 + fr, x1 - fr, y1 - fr, `rgb(${96 * t | 0},${110 * t | 0},${122 * t | 0})`, `rgb(${30 * t | 0},${34 * t | 0},${40 * t | 0})`);
  g.fillStyle = frame;
  g.fillRect(x0, (y0 + y1) / 2 - fr / 2, x1 - x0, fr);
}

function drawLowrise(W, H, rng) {
  const c = canvas(W, H);
  const e = canvas(W, H);
  const g = c.getContext('2d');
  const k = e.getContext('2d');
  const gutter = Math.max(2, Math.round(H / 256));
  const rows = layoutRows(LOWRISE_ROWS, H, gutter);
  g.fillStyle = '#e0dcd4';
  g.fillRect(0, 0, W, H);
  k.fillStyle = '#000';
  k.fillRect(0, 0, W, H);

  // --- rowhouse: 12 m tile, two 6 m units, 2 floors. Wall is light (tinted brick).
  const rowhouse = (r, boarded) => {
    const { y, h } = r;
    g.fillStyle = '#eee8e2';
    g.fillRect(0, y, W, h);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let yy = y; yy < y + h; yy += Math.max(2, h / 70)) g.fillRect(0, yy, W, 1);
    speckle(g, 0, y, W, h, W * 2, 0.14, rng);
    // coping + foundation
    g.fillStyle = '#f7f5f0';
    g.fillRect(0, y, W, h * 0.04);
    g.fillStyle = '#8a8580';
    g.fillRect(0, y + h * 0.93, W, h * 0.07);
    const U = W / 2;
    for (let u = 0; u < 2; u++) {
      const ux = u * U;
      // door + canopy
      const dx0 = ux + U * 0.1;
      const dx1 = ux + U * 0.25;
      const dy0 = y + h * 0.6;
      const dy1 = y + h * 0.93;
      g.fillStyle = '#d8d2c8';
      g.fillRect(dx0 - U * 0.02, y + h * 0.56, dx1 - dx0 + U * 0.04, h * 0.03);
      if (boarded) {
        g.fillStyle = '#b39463';
        g.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
        g.fillStyle = 'rgba(60,40,20,0.35)';
        g.fillRect(dx0 + (dx1 - dx0) * 0.48, dy0, 1, dy1 - dy0);
      } else {
        g.fillStyle = rng() < 0.5 ? '#5c3b2a' : '#3f4a52';
        g.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(dx0 + (dx1 - dx0) * 0.2, dy0 + (dy1 - dy0) * 0.1, (dx1 - dx0) * 0.6, (dy1 - dy0) * 0.25);
        // porch light
        k.fillStyle = '#ffd98a';
        k.fillRect(dx1 + U * 0.01, y + h * 0.5, Math.max(2, U * 0.02), Math.max(2, h * 0.03));
        g.fillStyle = '#fff4cc';
        g.fillRect(dx1 + U * 0.01, y + h * 0.5, Math.max(2, U * 0.02), Math.max(2, h * 0.03));
      }
      const wins = [
        [0.36, 0.52, 0.62, 0.84],
        [0.66, 0.82, 0.62, 0.84],
        [0.08, 0.26, 0.14, 0.38],
        [0.38, 0.56, 0.14, 0.38],
        [0.68, 0.86, 0.14, 0.38],
      ];
      for (const [a0, a1, b0, b1] of wins) {
        const x0 = ux + U * a0;
        const x1 = ux + U * a1;
        const y0 = y + h * b0;
        const y1 = y + h * b1;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x0 - 1, y1, x1 - x0 + 2, h * 0.02);
        if (boarded) {
          const broken = rng() < 0.2;
          g.fillStyle = broken ? '#1b1b1b' : ['#b39463', '#a88a5c', '#c2a676'][Math.floor(rng() * 3)];
          g.fillRect(x0, y0, x1 - x0, y1 - y0);
          if (!broken) {
            g.fillStyle = 'rgba(60,40,20,0.3)';
            g.fillRect(x0 + (x1 - x0) * 0.5, y0, 1, y1 - y0);
            g.fillStyle = 'rgba(40,30,20,0.25)';
            g.fillRect(x0, y1 - (y1 - y0) * 0.3, x1 - x0, (y1 - y0) * 0.3);
          }
        } else {
          win(g, x0, y0, x1, y1, '#e8e6e0', 0.8 + rng() * 0.4);
          if (rng() < 0.3) {
            // curtains
            g.fillStyle = ['rgba(220,200,160,0.7)', 'rgba(180,90,70,0.6)', 'rgba(200,210,220,0.7)'][Math.floor(rng() * 3)];
            g.fillRect(x0 + 2, y0 + 2, (x1 - x0) * 0.3, y1 - y0 - 4);
          }
          if (rng() < 0.4) {
            k.fillStyle = litColor(rng, 0.25);
            k.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
          }
        }
      }
    }
    if (boarded) {
      // water stains and grime
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `rgba(40,35,30,${0.06 + rng() * 0.1})`;
        g.fillRect(rng() * W, y + h * 0.05, 2 + rng() * 10, h * (0.2 + rng() * 0.6));
      }
    }
  };
  rowhouse(rows.rowhouse, false);
  rowhouse(rows.boarded, true);

  // --- storefront: tile holds two shopfronts
  {
    const { y, h } = rows.storefront;
    g.fillStyle = '#ece6de';
    g.fillRect(0, y, W, h);
    speckle(g, 0, y, W, h, W, 0.14, rng);
    const U = W / 2;
    for (let u = 0; u < 2; u++) {
      const ux = u * U;
      // sign band
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(ux + U * 0.06, y + h * 0.08, U * 0.88, h * 0.18);
      // display windows + door
      g.fillStyle = '#6b665f';
      g.fillRect(ux + U * 0.05, y + h * 0.33, U * 0.9, h * 0.6);
      glassGrad(g, ux + U * 0.07, y + h * 0.36, ux + U * 0.6, y + h * 0.8, '#7d8d99', '#262b31');
      glassGrad(g, ux + U * 0.64, y + h * 0.36, ux + U * 0.8, y + h * 0.93, '#5e6a74', '#202428');
      glassGrad(g, ux + U * 0.83, y + h * 0.36, ux + U * 0.93, y + h * 0.8, '#7d8d99', '#262b31');
      g.fillStyle = '#9a9288';
      g.fillRect(ux + U * 0.05, y + h * 0.8, U * 0.9, h * 0.13);
      k.fillStyle = litColor(rng, 0.4);
      k.fillRect(ux + U * 0.07, y + h * 0.36, U * 0.53, h * 0.44);
      k.fillRect(ux + U * 0.83, y + h * 0.36, U * 0.1, h * 0.44);
      k.fillStyle = '#6a5a40';
      k.fillRect(ux + U * 0.64, y + h * 0.36, U * 0.16, h * 0.57);
    }
  }

  // --- deco: tall vertical window bays between fluted piers (Union Station, courthouse wings)
  {
    const { y, h } = rows.deco;
    g.fillStyle = '#f4efe4';
    g.fillRect(0, y, W, h);
    speckle(g, 0, y, W, h, W, 0.1, rng);
    const n = 4;
    const U = W / n;
    for (let i = 0; i < n; i++) {
      const x0 = i * U + U * 0.28;
      const x1 = i * U + U * 0.72;
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x0 - U * 0.04, y + h * 0.1, U * 0.04, h * 0.8);
      g.fillStyle = '#5b5750';
      g.fillRect(x0, y + h * 0.12, x1 - x0, h * 0.78);
      glassGrad(g, x0 + 2, y + h * 0.14, x1 - 2, y + h * 0.88, '#8497a3', '#2c3339');
      g.fillStyle = '#6b665f';
      for (let m = 1; m < 6; m++) g.fillRect(x0, y + h * (0.12 + m * 0.13), x1 - x0, Math.max(1, h * 0.01));
      g.fillRect((x0 + x1) / 2 - 1, y + h * 0.12, 2, h * 0.78);
      k.fillStyle = '#e6c688';
      k.fillRect(x0 + 2, y + h * 0.14, x1 - x0 - 4, h * 0.74);
      // pier flutes
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let fl = 0; fl < 3; fl++) g.fillRect(i * U + U * (0.04 + fl * 0.07), y + h * 0.05, Math.max(1, U * 0.02), h * 0.9);
      // stepped cap
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x0 - U * 0.04, y + h * 0.06, x1 - x0 + U * 0.08, h * 0.03);
    }
  }

  // --- fluted: blank Art Deco stone with shallow pilasters and a frieze (Joslyn)
  {
    const { y, h } = rows.fluted;
    g.fillStyle = '#f4ece8';
    g.fillRect(0, y, W, h);
    speckle(g, 0, y, W, h, W * 1.5, 0.08, rng);
    const n = 8;
    const U = W / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(i * U + U * 0.78, y + h * 0.16, U * 0.06, h * 0.8);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(i * U + U * 0.16, y + h * 0.16, U * 0.04, h * 0.8);
    }
    // frieze band with a geometric relief
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(0, y + h * 0.04, W, h * 0.1);
    for (let i = 0; i < n * 2; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.beginPath();
      const cx = (i + 0.5) * (U / 2);
      g.moveTo(cx - U * 0.15, y + h * 0.13);
      g.lineTo(cx, y + h * 0.05);
      g.lineTo(cx + U * 0.15, y + h * 0.13);
      g.fill();
    }
  }

  // --- shed: corrugated metal with a band of clerestory windows near the top
  {
    const { y, h } = rows.shed;
    g.fillStyle = '#d7d7d2';
    g.fillRect(0, y, W, h);
    const rib = Math.max(3, W / 128);
    for (let x = 0; x < W; x += rib) {
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.fillRect(x, y, rib * 0.4, h);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + rib * 0.5, y, rib * 0.2, h);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(120,70,30,${0.08 + rng() * 0.14})`;
      g.fillRect(rng() * W, y + h * rng() * 0.5, 2 + rng() * 6, h * (0.2 + rng() * 0.5));
    }
    for (let i = 0; i < 4; i++) {
      const x0 = i * (W / 4) + W * 0.02;
      glassGrad(g, x0, y + h * 0.1, x0 + W * 0.2, y + h * 0.24, '#a5aeb2', '#59636a');
      k.fillStyle = '#d8c290';
      k.fillRect(x0, y + h * 0.1, W * 0.2, h * 0.14);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y + h * 0.95, W, h * 0.05);
  }

  // --- terminal: 1960s glass wall with mullions under a deep fascia
  {
    const { y, h } = rows.terminal;
    g.fillStyle = '#ecebe6';
    g.fillRect(0, y, W, h * 0.3);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, y + h * 0.3, W, h * 0.04);
    glassGrad(g, 0, y + h * 0.34, W, y + h, '#8ba2b0', '#2a3238');
    k.fillStyle = '#f2e2b8';
    k.fillRect(0, y + h * 0.36, W, h * 0.62);
    g.fillStyle = '#c5c7c7';
    for (let x = 0; x < W; x += W / 16) g.fillRect(x, y + h * 0.34, Math.max(1, W / 300), h * 0.66);
    k.fillStyle = '#000';
    for (let x = 0; x < W; x += W / 16) k.fillRect(x, y + h * 0.34, Math.max(1, W / 300), h * 0.66);
  }

  // --- stoneslit: heavy stone with sparse slit windows (library)
  {
    const { y, h } = rows.stoneslit;
    g.fillStyle = '#f2ede2';
    g.fillRect(0, y, W, h);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let yy = y; yy < y + h; yy += h / 8) g.fillRect(0, yy, W, 1);
    for (let x = 0; x < W; x += W / 12) g.fillRect(x + (Math.floor((x / W) * 12) % 2) * 3, y, 1, h);
    speckle(g, 0, y, W, h, W, 0.08, rng);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x0 = (i + 0.5) * (W / n) - W * 0.02;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x0 - 2, y + h * 0.18, W * 0.04 + 4, h * 0.64);
      glassGrad(g, x0, y + h * 0.2, x0 + W * 0.04, y + h * 0.8, '#6f7f8a', '#23292e');
      k.fillStyle = '#ffe0a0';
      k.fillRect(x0, y + h * 0.2, W * 0.04, h * 0.6);
    }
  }

  // --- siding: two-story wood clapboard house front (officers' quarters, Iowa houses)
  {
    const { y, h } = rows.siding;
    g.fillStyle = '#f4f2ec';
    g.fillRect(0, y, W, h);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    for (let yy = y; yy < y + h; yy += Math.max(2, h / 40)) g.fillRect(0, yy, W, 1);
    const U = W / 2;
    for (let u = 0; u < 2; u++) {
      const ux = u * U;
      for (const [a0, a1, b0, b1] of [
        [0.14, 0.3, 0.14, 0.4],
        [0.42, 0.58, 0.14, 0.4],
        [0.7, 0.86, 0.14, 0.4],
        [0.14, 0.3, 0.56, 0.84],
        [0.7, 0.86, 0.56, 0.84],
      ]) {
        const x0 = ux + U * a0;
        const x1 = ux + U * a1;
        g.fillStyle = '#3d4a3f';
        g.fillRect(x0 - U * 0.03, y + h * b0, U * 0.03, h * (b1 - b0));
        g.fillRect(x1, y + h * b0, U * 0.03, h * (b1 - b0));
        win(g, x0, y + h * b0, x1, y + h * b1, '#faf8f2', 0.9);
        if (rng() < 0.45) {
          k.fillStyle = litColor(rng, 0.1);
          k.fillRect(x0 + 2, y + h * b0 + 2, x1 - x0 - 4, h * (b1 - b0) - 4);
        }
      }
      g.fillStyle = '#5a3d2b';
      g.fillRect(ux + U * 0.43, y + h * 0.56, U * 0.14, h * 0.4);
    }
    g.fillStyle = '#8e8a84';
    g.fillRect(0, y + h * 0.95, W, h * 0.05);
  }

  // --- sandbag: staggered courses of tan bags (flood walls)
  {
    const { y, h } = rows.sandbag;
    g.fillStyle = '#6b5b40';
    g.fillRect(0, y, W, h);
    const courses = 5;
    const ch = h / courses;
    const bw = W / 12;
    for (let r = 0; r < courses; r++) {
      const off = (r % 2) * bw * 0.5;
      for (let x = -bw; x < W + bw; x += bw) {
        const t = 0.82 + rng() * 0.3;
        g.fillStyle = `rgb(${196 * t | 0},${172 * t | 0},${122 * t | 0})`;
        const bx = x + off + 2;
        const by = y + r * ch + 1;
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, bw - 4, ch - 2, Math.min(ch, bw) * 0.35);
        else g.rect(bx, by, bw - 4, ch - 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(bx + bw * 0.1, by + ch * 0.15, bw * 0.6, ch * 0.18);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(bx + bw * 0.05, by + ch * 0.75, bw * 0.8, ch * 0.14);
      }
    }
  }

  bleedRows(g, rows, W, gutter);
  bleedRows(k, rows, W, gutter);
  return [c, e, rows];
}

function drawGround(W, H, rng) {
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const gutter = Math.max(2, Math.round(H / 256));
  const rows = layoutRows(GROUND_ROWS, H, gutter);
  g.fillStyle = '#555';
  g.fillRect(0, 0, W, H);
  const asphalt = (y, h, base = '#4a4a4c') => {
    g.fillStyle = base;
    g.fillRect(0, y, W, h);
    speckle(g, 0, y, W, h, W * h * 0.02, 0.25, rng);
    speckle(g, 0, y, W, h, W * h * 0.01, 0.15, rng, false);
  };
  let r = rows.asphalt;
  asphalt(r.y, r.h);
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(20,20,20,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    let x = rng() * W;
    let yy = r.y + rng() * r.h;
    g.moveTo(x, yy);
    for (let s = 0; s < 5; s++) {
      x += (rng() - 0.3) * 30;
      yy += (rng() - 0.5) * 12;
      g.lineTo(x, Math.min(r.y + r.h, Math.max(r.y, yy)));
    }
    g.stroke();
  }

  // parking: v across the stall depth, 4 stalls per tile, painted lines at stall edges
  r = rows.parking;
  asphalt(r.y, r.h, '#4d4d4f');
  g.fillStyle = '#e8e4d6';
  for (let i = 0; i < 4; i++) g.fillRect(i * (W / 4), r.y + r.h * 0.05, Math.max(2, W / 150), r.h * 0.9);
  g.fillStyle = 'rgba(30,30,30,0.35)';
  for (let i = 0; i < 4; i++) g.fillRect(i * (W / 4) + W / 8 - 10, r.y + r.h * 0.2, 20, r.h * 0.5);

  // runway: v across the width, u along; centerline dashes, edge + side stripes
  r = rows.runway;
  asphalt(r.y, r.h, '#3f3f42');
  g.fillStyle = '#efefe8';
  g.fillRect(0, r.y + r.h * 0.03, W, Math.max(2, r.h * 0.02));
  g.fillRect(0, r.y + r.h * 0.95, W, Math.max(2, r.h * 0.02));
  g.fillRect(W * 0.05, r.y + r.h * 0.49, W * 0.5, Math.max(2, r.h * 0.025));
  // tire marks
  g.fillStyle = 'rgba(15,15,15,0.35)';
  for (let i = 0; i < 20; i++) g.fillRect(rng() * W, r.y + r.h * (0.35 + rng() * 0.3), 20 + rng() * 60, 1 + rng() * 2);

  // taxiway: yellow centerline, yellow edges
  r = rows.taxiway;
  asphalt(r.y, r.h, '#454547');
  g.fillStyle = '#e0b52c';
  g.fillRect(0, r.y + r.h * 0.48, W, Math.max(2, r.h * 0.04));
  g.fillRect(0, r.y + r.h * 0.04, W, Math.max(1, r.h * 0.02));
  g.fillRect(0, r.y + r.h * 0.94, W, Math.max(1, r.h * 0.02));

  // rail: ballast, ties, two rails (v across ~3.2 m)
  r = rows.rail;
  g.fillStyle = '#6d655b';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.06, 0.4, rng);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.03, 0.3, rng, false);
  const ties = 7;
  for (let i = 0; i < ties; i++) {
    const x = (i + 0.2) * (W / ties);
    g.fillStyle = '#3e3129';
    g.fillRect(x, r.y + r.h * 0.12, W / ties * 0.45, r.h * 0.76);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x, r.y + r.h * 0.84, W / ties * 0.45, r.h * 0.04);
  }
  for (const v of [0.3, 0.66]) {
    g.fillStyle = '#5d4a3c';
    g.fillRect(0, r.y + r.h * v, W, r.h * 0.05);
    g.fillStyle = '#c9c7c2';
    g.fillRect(0, r.y + r.h * v, W, r.h * 0.018);
  }

  // path: light concrete with expansion joints
  r = rows.path;
  g.fillStyle = '#bdb8ad';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.02, 0.18, rng);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 4; i++) g.fillRect(i * (W / 4), r.y, 2, r.h);

  // dirt
  r = rows.dirt;
  g.fillStyle = '#7b6448';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.05, 0.35, rng);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.02, 0.25, rng, false);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(90,110,50,${0.2 + rng() * 0.3})`;
    g.fillRect(rng() * W, r.y + rng() * r.h, 3 + rng() * 12, 2 + rng() * 6);
  }

  // brick pavers (herringbone-ish)
  r = rows.pavers;
  g.fillStyle = '#8d5a45';
  g.fillRect(0, r.y, W, r.h);
  const pw = Math.max(6, W / 64);
  const ph = pw / 2;
  for (let yy = 0; yy < r.h; yy += ph) {
    for (let x = ((yy / ph) % 2) * (pw / 2); x < W; x += pw) {
      const t = 0.85 + rng() * 0.3;
      g.fillStyle = `rgb(${150 * t | 0},${88 * t | 0},${66 * t | 0})`;
      g.fillRect(x + 1, r.y + yy + 1, pw - 2, ph - 2);
    }
  }

  // plaza: pale concrete squares
  r = rows.plaza;
  g.fillStyle = '#c8c3b8';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.02, 0.14, rng);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect(i * (W / 6), r.y, 1, r.h);
  g.fillRect(0, r.y + r.h / 2, W, 1);

  // basketball court: one full court per tile (u along 28 m, v across 15 m)
  r = rows.court;
  g.fillStyle = '#6c7a7c';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.02, 0.2, rng);
  g.strokeStyle = '#f2efe6';
  g.lineWidth = Math.max(2, W / 300);
  const cy = r.y + r.h / 2;
  g.strokeRect(W * 0.02, r.y + r.h * 0.04, W * 0.96, r.h * 0.92);
  g.beginPath();
  g.moveTo(W / 2, r.y + r.h * 0.04);
  g.lineTo(W / 2, r.y + r.h * 0.96);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, cy, r.h * 0.12, 0, Math.PI * 2);
  g.stroke();
  for (const side of [0, 1]) {
    const x = side ? W * 0.98 : W * 0.02;
    const dir = side ? -1 : 1;
    g.fillStyle = '#9b4d3a';
    g.fillRect(side ? x - W * 0.19 : x, cy - r.h * 0.16, W * 0.19, r.h * 0.32);
    g.strokeRect(side ? x - W * 0.19 : x, cy - r.h * 0.16, W * 0.19, r.h * 0.32);
    g.beginPath();
    g.arc(x + dir * W * 0.19, cy, r.h * 0.16, side ? Math.PI / 2 : -Math.PI / 2, side ? -Math.PI / 2 : Math.PI / 2, side ? false : false);
    g.stroke();
    g.beginPath();
    g.arc(x + dir * W * 0.05, cy, r.h * 0.44, side ? Math.PI / 2 : -Math.PI / 2, side ? (Math.PI * 3) / 2 : Math.PI / 2, false);
    g.stroke();
  }

  // highway deck: 4 lanes of concrete, dashed lane lines, solid edges (v across 18 m)
  r = rows.highway;
  g.fillStyle = '#9a978f';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.03, 0.18, rng);
  g.fillStyle = 'rgba(40,40,40,0.25)';
  for (const v of [0.2, 0.3, 0.7, 0.8]) g.fillRect(0, r.y + r.h * v, W, r.h * 0.04);
  g.fillStyle = '#f2f0e8';
  g.fillRect(0, r.y + r.h * 0.07, W, Math.max(1, r.h * 0.015));
  g.fillRect(0, r.y + r.h * 0.915, W, Math.max(1, r.h * 0.015));
  g.fillStyle = '#e6c23a';
  g.fillRect(0, r.y + r.h * 0.46, W, Math.max(1, r.h * 0.015));
  g.fillRect(0, r.y + r.h * 0.525, W, Math.max(1, r.h * 0.015));
  g.fillStyle = '#f2f0e8';
  for (const v of [0.27, 0.73]) g.fillRect(0, r.y + r.h * v, W * 0.35, Math.max(1, r.h * 0.015));

  // rubble: cleared lot with broken brick and concrete chunks
  r = rows.rubble;
  g.fillStyle = '#7a6a58';
  g.fillRect(0, r.y, W, r.h);
  speckle(g, 0, r.y, W, r.h, W * r.h * 0.05, 0.35, rng);
  for (let i = 0; i < W * 0.3; i++) {
    const t = rng();
    g.fillStyle = t < 0.5 ? `rgba(150,80,60,${0.5 + rng() * 0.5})` : t < 0.8 ? `rgba(170,165,155,${0.5 + rng() * 0.4})` : 'rgba(40,35,30,0.6)';
    g.fillRect(rng() * W, r.y + rng() * r.h, 2 + rng() * 6, 2 + rng() * 4);
  }
  for (let i = 0; i < 25; i++) {
    g.fillStyle = `rgba(90,120,55,${0.25 + rng() * 0.3})`;
    g.fillRect(rng() * W, r.y + rng() * r.h, 4 + rng() * 14, 2 + rng() * 8);
  }

  bleedRows(g, rows, W, gutter);
  return [c, rows];
}

function drawGrass(S, rng) {
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#d8dccb';
  g.fillRect(0, 0, S, S);
  // big soft mottles (wrap-safe by drawing each blob 4x)
  for (let i = 0; i < 40; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = S * (0.05 + rng() * 0.12);
    const v = rng() < 0.5 ? 'rgba(90,110,60,0.10)' : 'rgba(255,255,230,0.10)';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, v);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  // blades
  for (let i = 0; i < S * S * 0.06; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const t = rng();
    g.fillStyle = t < 0.5 ? `rgba(60,80,30,${0.12 + rng() * 0.2})` : `rgba(250,255,220,${0.1 + rng() * 0.2})`;
    g.fillRect(x, y, 1, 2 + rng() * 3);
  }
  return c;
}

/** Water ripples. flow = true: streaks stretched along v (the river runs along z). */
function drawWater(S, rng, flow) {
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#d2d2d2';
  g.fillRect(0, 0, S, S);
  // soft large-scale variation
  for (let i = 0; i < 26; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = S * (0.08 + rng() * 0.16);
    const v = rng() < 0.5 ? 'rgba(150,150,150,0.10)' : 'rgba(255,255,255,0.12)';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, v);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  // ripple streaks: mostly light glints, a few darker troughs
  for (let i = 0; i < (flow ? 220 : 160); i++) {
    const x = rng() * S;
    const y = rng() * S;
    const long = S * (flow ? 0.05 + rng() * 0.14 : 0.03 + rng() * 0.08);
    const thin = 0.8 + rng() * 1.6;
    const light = rng() < 0.75;
    g.fillStyle = light ? `rgba(255,255,255,${0.08 + rng() * 0.2})` : `rgba(110,110,110,${0.05 + rng() * 0.08})`;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        if (flow) g.ellipse(x + ox, y + oy, thin, long / 2, 0, 0, Math.PI * 2);
        else g.ellipse(x + ox, y + oy, long / 2, thin, rng() * 0.4 - 0.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

function drawChainlink(S) {
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(200,204,206,1)';
  g.lineWidth = Math.max(1.5, S / 48);
  const n = 4;
  const d = S / n;
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath();
    g.moveTo(i * d, 0);
    g.lineTo(i * d + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(i * d, S);
    g.lineTo(i * d + S, 0);
    g.stroke();
  }
  return c;
}

function drawGlow(S) {
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

/** Build every landmark texture. detail 0 = phone sizes. */
export function buildTextures(game) {
  const detail = game.quality?.detail ?? 1;
  const rng = createRng(931993).next;
  const S = detail === 0 ? 256 : 512;
  const A = detail === 0 ? 512 : 1024;
  const maxAniso = game.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
  const aniso = detail === 0 ? 1 : Math.min(detail === 2 ? 8 : 4, maxAniso);
  const T = { tiles: TILES, rows: {}, facade: {}, emissive: {} };
  for (const [id, fn] of [
    ['office', drawOffice],
    ['slab', drawSlab],
    ['glass', drawGlass],
    ['masonry', drawMasonry],
  ]) {
    const [c, e] = fn(S, rng);
    T.facade[id] = toTexture(c, { aniso });
    T.emissive[id] = toTexture(e, { aniso });
  }
  const [lc, le, lrows] = drawLowrise(A, A, rng);
  T.facade.lowrise = toTexture(lc, { wrapT: false, aniso });
  T.emissive.lowrise = toTexture(le, { wrapT: false, aniso });
  const [gc, grows] = drawGround(A, A, rng);
  T.ground = toTexture(gc, { wrapT: false, aniso });
  T.rows = { ...lrows, ...grows };
  T.grass = toTexture(drawGrass(detail === 0 ? 128 : 256, rng), { aniso });
  T.water = toTexture(drawWater(256, rng, true), { aniso });
  T.lakeWater = toTexture(drawWater(256, rng, false), { aniso });
  T.chainlink = toTexture(drawChainlink(64), { aniso });
  T.chainlink.colorSpace = THREE.SRGBColorSpace;
  T.glow = toTexture(drawGlow(64), { wrapS: false, wrapT: false });
  return T;
}
