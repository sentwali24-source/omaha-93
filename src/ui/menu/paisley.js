// Procedural bandana art for the menu cards: a seamless paisley tile drawn on a canvas and handed
// to CSS as a data URL (background-image, repeat). Cached per color so every card and screen that
// uses the same rag shares one image. Also the VHS noise tile used by the tape overlay.

const tileCache = new Map();

/**
 * Seamless paisley bandana tile.
 * @param {string} base   rag color (#rrggbb)
 * @param {object} opt    ink = print color, shadow = outline color, size = tile px
 * @returns {string} data URL (PNG)
 */
export function paisleyTile(base, { ink = '#ffffff', shadow = '#050308', size = 220 } = {}) {
  const key = `${base}|${ink}|${shadow}|${size}`;
  const hit = tileCache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Faint fabric weave so the flat color reads as cloth.
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = shadow;
  for (let y = 0; y < size; y += 3) ctx.fillRect(0, y, size, 1);
  ctx.globalAlpha = 1;

  // Motifs on a loose grid; each is drawn at 9 wrapped offsets so the tile repeats seamlessly.
  const motifs = [
    { x: 0.27, y: 0.3, s: 0.34, r: -0.55, kind: 'paisley' },
    { x: 0.77, y: 0.74, s: 0.34, r: 2.55, kind: 'paisley' },
    { x: 0.8, y: 0.22, s: 0.2, r: 1.05, kind: 'paisley' },
    { x: 0.2, y: 0.8, s: 0.2, r: -2.1, kind: 'paisley' },
    { x: 0.52, y: 0.52, s: 0.11, r: 0, kind: 'flower' },
    { x: 0.02, y: 0.02, s: 0.1, r: 0.4, kind: 'flower' },
    { x: 0.55, y: 0.07, s: 0.07, r: 0, kind: 'star' },
    { x: 0.05, y: 0.55, s: 0.07, r: 0, kind: 'star' },
    { x: 0.46, y: 0.9, s: 0.06, r: 0, kind: 'dots' },
    { x: 0.95, y: 0.45, s: 0.06, r: 0, kind: 'dots' },
  ];
  for (const m of motifs) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x = (m.x + ox) * size;
        const y = (m.y + oy) * size;
        const s = m.s * size;
        if (x < -s * 1.6 || x > size + s * 1.6 || y < -s * 1.6 || y > size + s * 1.6) continue;
        if (m.kind === 'paisley') drawPaisley(ctx, x, y, s, m.r, ink, shadow);
        else if (m.kind === 'flower') drawFlower(ctx, x, y, s, m.r, ink, shadow);
        else if (m.kind === 'star') drawStar(ctx, x, y, s, ink, shadow);
        else drawDotCluster(ctx, x, y, s, ink);
      }
    }
  }

  let url = '';
  try {
    url = c.toDataURL('image/png');
  } catch {
    /* tainted / unsupported: plain color fallback */
  }
  tileCache.set(key, url);
  return url;
}

// Teardrop outline in a 100-unit box: bulb around (2, 20), tail curling up-right to (30, -52).
let paisleyPath = null;
function getPaisleyPath() {
  if (paisleyPath) return paisleyPath;
  const p = new Path2D();
  p.moveTo(30, -52);
  p.bezierCurveTo(-8, -42, -42, -12, -37, 18);
  p.bezierCurveTo(-32, 47, 8, 58, 30, 38);
  p.bezierCurveTo(48, 20, 42, -4, 20, -9);
  p.bezierCurveTo(4, -12, 6, -34, 30, -52);
  p.closePath();
  paisleyPath = p;
  return p;
}

function drawPaisley(ctx, x, y, s, rot, ink, shadow) {
  const path = getPaisleyPath();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s / 100, s / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // outer body: dark outline under a white print line
  ctx.lineWidth = 11;
  ctx.strokeStyle = shadow;
  ctx.stroke(path);
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = ink;
  ctx.stroke(path);
  // dotted halo around the bulb (skips the tail)
  ctx.fillStyle = ink;
  for (let i = 0; i < 15; i++) {
    const a = -0.55 + (i / 14) * 4.35; // from right-up, round the bottom, to the left
    const px = 2 + Math.cos(a) * 52;
    const py = 20 + Math.sin(a) * 50;
    ctx.beginPath();
    ctx.arc(px, py, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // inner teardrop + petals
  ctx.save();
  ctx.translate(3, 16);
  ctx.scale(0.52, 0.52);
  ctx.lineWidth = 9;
  ctx.strokeStyle = shadow;
  ctx.stroke(path);
  ctx.lineWidth = 6;
  ctx.strokeStyle = ink;
  ctx.stroke(path);
  ctx.restore();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(4 + Math.cos(a) * 8, 26 + Math.sin(a) * 8, 5, 2.6, a, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(4, 26, 4, 0, Math.PI * 2);
  ctx.fillStyle = shadow;
  ctx.fill();
  // curl at the tail
  ctx.beginPath();
  ctx.arc(24, -40, 5, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.restore();
}

function drawFlower(ctx, x, y, s, rot, ink, shadow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.42, s * 0.2, a, 0, Math.PI * 2);
    ctx.fillStyle = shadow;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.3, s * 0.12, a, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx, x, y, s, ink, shadow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? s * 0.35 : s;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = shadow;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}

function drawDotCluster(ctx, x, y, s, ink) {
  ctx.fillStyle = ink;
  const pts = [[0, 0], [1, 0.3], [-0.8, 0.6], [0.3, -1], [-0.4, -0.7]];
  for (const [dx, dy] of pts) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

let noiseUrl = null;

/** Grainy grayscale tile for the VHS overlay (drawn once). */
export function noiseTile(size = 160) {
  if (noiseUrl !== null) return noiseUrl;
  noiseUrl = '';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.random() < 0.5 ? 0 : 60 + Math.random() * 120;
    }
    ctx.putImageData(img, 0, 0);
    noiseUrl = c.toDataURL('image/png');
  } catch {
    /* no canvas: overlay just skips the grain */
  }
  return noiseUrl;
}
