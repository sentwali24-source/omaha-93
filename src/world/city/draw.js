// Canvas drawing helpers shared by the procedural texture atlases (textures.js).
// Everything that must tile is drawn with wrap-around so atlas tiles repeat seamlessly.

export const TAU = Math.PI * 2;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

let _noise = null;
let DENS = 1;

/** Scale the number of random marks (speckles, blotches) — lower for small atlases. */
export function setDensity(k) {
  DENS = k;
}

/** Shared 256² grey white-noise canvas (drawn once). */
export function noiseCanvas(rng) {
  if (_noise) return _noise;
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.floor(rng() * 256);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  _noise = c;
  return c;
}

/** Overlay grain on the current region (0,0,w,h). */
export function grain(ctx, w, h, alpha = 0.15, mode = 'overlay', rng = Math.random) {
  const pat = ctx.createPattern(noiseCanvas(rng), 'repeat');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = mode;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Call fn(x, y) at every wrapped copy needed so a shape of radius r at (x, y) tiles in w×h. */
export function wrapped(w, h, x, y, r, fn) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * w;
      const py = y + oy * h;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      fn(px, py);
    }
  }
}

/** Soft radial blob (tileable). */
export function blob(ctx, w, h, x, y, r, color, alpha = 1) {
  wrapped(w, h, x, y, r, (px, py) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  });
  ctx.globalAlpha = 1;
}

/** Many random soft blobs. colors: array of css colors. */
export function blotches(ctx, w, h, n, rmin, rmax, colors, alpha, rng) {
  n = Math.ceil(n * DENS);
  for (let i = 0; i < n; i++) {
    const c = colors[Math.floor(rng() * colors.length)];
    blob(ctx, w, h, rng() * w, rng() * h, rmin + rng() * (rmax - rmin), c, alpha * (0.4 + rng() * 0.6));
  }
}

/** Random small hard dots (gravel, granules, speckles), tileable. */
export function speckle(ctx, w, h, n, colors, rmin, rmax, rng, alpha = 1) {
  ctx.globalAlpha = alpha;
  n = Math.ceil(n * DENS);
  const k = 1 / Math.sqrt(DENS);
  rmin *= k;
  rmax *= k;
  for (let i = 0; i < n; i++) {
    const r = rmin + rng() * (rmax - rmin);
    const x = rng() * w;
    const y = rng() * h;
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    wrapped(w, h, x, y, r, (px, py) => {
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  ctx.globalAlpha = 1;
}

/** Wandering crack line (tileable-ish: wraps by drawing three copies). */
export function crack(ctx, w, h, x, y, len, angle, width, color, rng) {
  const pts = [[x, y]];
  let a = angle;
  let px = x;
  let py = y;
  const steps = Math.max(3, Math.floor(len / 6));
  for (let i = 0; i < steps; i++) {
    a += (rng() - 0.5) * 1.1;
    px += Math.cos(a) * (len / steps);
    py += Math.sin(a) * (len / steps);
    pts.push([px, py]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      pts.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx + ox * w, qy + oy * h) : ctx.moveTo(qx + ox * w, qy + oy * h)));
      ctx.stroke();
    }
  }
}

/** Vertical grime streaks running down from the top (for walls). */
export function streaks(ctx, w, h, n, color, alpha, rng, maxLen = 1) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w;
    const sw = 1 + rng() * 5;
    const len = h * (0.2 + rng() * 0.8) * maxLen;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.3 + rng() * 0.7);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, sw, len);
    if (x + sw > w) ctx.fillRect(x - w, 0, sw, len);
  }
  ctx.globalAlpha = 1;
}

/** Vertical linear gradient fill of a rect. */
export function vgrad(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function hgrad(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Rounded rect path. */
export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Mix two '#rrggbb' colors. */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Jitter a hex color's brightness by ±amt. */
export function jitter(hex, amt, rng) {
  const k = 1 + (rng() * 2 - 1) * amt;
  const p = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((p >> 16) & 255)},${f((p >> 8) & 255)},${f(p & 255)})`;
}

/**
 * Fit text into a box: picks the largest font size ≤ maxSize whose width fits, draws centred.
 * font: e.g. 'bold {s}px Impact, "Arial Narrow", sans-serif' — {s} is replaced by the size.
 */
export function fitText(ctx, text, cx, cy, maxW, maxSize, font, fill, stroke = null, strokeW = 0, minSize = 6) {
  let s = maxSize;
  for (; s > minSize; s -= 1) {
    ctx.font = font.replace('{s}', s);
    if (ctx.measureText(text).width <= maxW) break;
  }
  ctx.font = font.replace('{s}', s);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke && strokeW) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.strokeText(text, cx, cy);
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillText(text, cx, cy);
  }
  return s;
}

export const FONT_BLOCK = '900 {s}px Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
export const FONT_SANS = 'bold {s}px "Helvetica Neue", Helvetica, Arial, sans-serif';
export const FONT_SERIF = 'bold {s}px Georgia, "Times New Roman", serif';
export const FONT_SCRIPT = 'italic bold {s}px "Brush Script MT", "Segoe Script", Georgia, cursive';
export const FONT_WIDE = '900 {s}px "Arial Black", "Helvetica Neue", Arial, sans-serif';
