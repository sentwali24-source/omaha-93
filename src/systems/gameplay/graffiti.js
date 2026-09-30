// Procedural graffiti: every set's pieces are painted once on <canvas> into a single texture atlas
// that the Tagging system maps onto wall decals (one shared material, one draw call).
//
//   const atlas = buildGraffitiAtlas({ cell: 512 });
//   atlas.canvas                     the atlas (cols × rows cells, each cell is 2:1)
//   atlas.tileFor(setId, variant)    cell index of a set's piece (variant 0..VARIANTS-1)
//   atlas.buffTile(variant)          cell index of a "buffed" wall (painted-over patch, no owner)
//   atlas.uv(index, out)             [u0, v0, su, sv] in texture space (flipY = true)
//
// Each set has its own letter style (bubble, block, wildstyle, drip, throw-up, sharp) in the side
// color with black/white outlines, drips, arrows, stars and overspray. All text is fictional.
import { SETS, SIDES } from '../../data/sets.js';
import { hash, createRng } from '../../core/rng.js';

export const VARIANTS = 3;
const BUFFS = 2;

// Per-set letter style. Set identity is visual: all of a set's pieces share one style.
const SET_STYLE = {
  psc: 'bubble',
  ngc: 'block',
  rlc: 'wild',
  lvb: 'drip',
  nfp: 'throwie',
  wbb: 'sharp',
};

// side-neutral taglines, one per set in SETS order (the last one fits the set on the hill)
const TAGLINES = ['NORTH SIDE', 'NORTH O', "SUMMER '93", 'OMAHA', 'THE BLOCK', 'ON THE HILL'];

const FONT_FAT = '"Arial Black", "Arial Bold", Gadget, "Helvetica Neue", Helvetica, Arial, sans-serif';
const FONT_TALL = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Franklin Gothic Bold", "Arial Black", sans-serif';

const STYLE_DEFS = {
  // fat overlapping bubble letters, glossy highlights, a few drips
  bubble: { font: FONT_FAT, weight: 900, spacing: -0.1, rot: 0.1, bounce: 0.06, scaleJ: 0.08, sy: 1, skew: 0, outline: 0.34, inner: 0.18, join: 'round', extrude: 0, drips: 0.7, cloud: false, spikes: 0, stripes: false, gloss: true, arrows: 1, flat: false },
  // tall 3D block letters on a white cloud, extruded shadow
  block: { font: FONT_TALL, weight: 400, spacing: 0.02, rot: 0, bounce: 0, scaleJ: 0, sy: 1.18, skew: -0.14, outline: 0.2, inner: 0.1, join: 'miter', extrude: 0.13, drips: 0.25, cloud: true, spikes: 0, stripes: true, gloss: false, arrows: 1, flat: false },
  // interlocking tilted letters with arrow spikes and diagonal fades
  wild: { font: FONT_FAT, weight: 900, spacing: -0.18, rot: 0.3, bounce: 0.14, scaleJ: 0.16, sy: 1.05, skew: -0.2, outline: 0.26, inner: 0.13, join: 'miter', extrude: 0.05, drips: 0.2, cloud: false, spikes: 0.6, stripes: true, gloss: false, arrows: 2, flat: false },
  // tall letters dripping hard
  drip: { font: FONT_TALL, weight: 400, spacing: 0.04, rot: 0.04, bounce: 0.03, scaleJ: 0.04, sy: 1.25, skew: 0.05, outline: 0.22, inner: 0.12, join: 'round', extrude: 0.06, drips: 2.2, cloud: false, spikes: 0, stripes: false, gloss: true, arrows: 0, flat: false },
  // quick two-color throw-up, flat fill, heavy overspray
  throwie: { font: FONT_FAT, weight: 900, spacing: -0.07, rot: 0.14, bounce: 0.1, scaleJ: 0.1, sy: 0.95, skew: -0.06, outline: 0.36, inner: 0.2, join: 'round', extrude: 0, drips: 0.5, cloud: false, spikes: 0, stripes: false, gloss: false, arrows: 1, flat: true },
  // sharp slanted letters with stars
  sharp: { font: FONT_TALL, weight: 400, spacing: 0.0, rot: 0.08, bounce: 0.05, scaleJ: 0.06, sy: 1.1, skew: -0.32, outline: 0.24, inner: 0.1, join: 'miter', extrude: 0.09, drips: 0.4, cloud: false, spikes: 0.35, stripes: true, gloss: false, arrows: 1, flat: false },
};

/** Build the atlas. cell = cell width in px (cell height = cell / 2). */
export function buildGraffitiAtlas({ cell = 512 } = {}) {
  const cw = cell;
  const ch = Math.round(cell / 2);
  const count = SETS.length * VARIANTS + BUFFS;
  const cols = 4;
  const rows = Math.ceil(count / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext('2d');

  // scratch layers reused for every piece
  const layer = makeCanvas(cw, ch);
  const piece = makeCanvas(cw, ch);

  const tileIndex = new Map();
  let index = 0;
  const place = () => {
    const i = index++;
    ctx.drawImage(piece.canvas, (i % cols) * cw, Math.floor(i / cols) * ch);
    return i;
  };

  SETS.forEach((set, si) => {
    const side = SIDES[set.side];
    const style = STYLE_DEFS[SET_STYLE[set.id] || 'bubble'];
    const nameWord = set.name.split(' ')[0].toUpperCase();
    // 0: short name + tagline, 1: the full word, 2: throw-up of the short name with the year
    const words = [set.short, nameWord, set.short];
    for (let v = 0; v < VARIANTS; v++) {
      const rng = createRng(hash(set.id, v, 'graffiti'));
      piece.ctx.clearRect(0, 0, cw, ch);
      paintPiece(piece.ctx, layer, cw, ch, {
        text: words[v],
        style: v === 2 ? { ...style, arrows: Math.min(2, style.arrows + 1), cloud: false } : style,
        side,
        set,
        tagline: v === 0 ? TAGLINES[si % TAGLINES.length] : v === 2 ? "'93" : null,
        year: v === 2,
        rng,
      });
      tileIndex.set(`${set.id}:${v}`, place());
    }
  });
  const buffStart = index;
  for (let b = 0; b < BUFFS; b++) {
    piece.ctx.clearRect(0, 0, cw, ch);
    paintBuff(piece.ctx, cw, ch, createRng(hash('buff', b)));
    place();
  }

  return {
    canvas,
    cols,
    rows,
    cellWidth: cw,
    cellHeight: ch,
    tileFor(setId, variant = 0) {
      const t = tileIndex.get(`${setId}:${variant % VARIANTS}`);
      return t ?? buffStart;
    },
    buffTile(variant = 0) {
      return buffStart + (variant % BUFFS);
    },
    /** UV rect of a cell for a texture with flipY = true (v measured from the bottom). */
    uv(i, out = [0, 0, 1, 1]) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      out[0] = c / cols;
      out[1] = 1 - (r + 1) / rows;
      out[2] = 1 / cols;
      out[3] = 1 / rows;
      return out;
    },
  };
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

// ------------------------------------------------------------------ pieces

function paintPiece(ctx, layer, W, H, { text, style, side, set, tagline, year, rng }) {
  const u = W / 512; // unit: 1 at the reference cell size
  const main = side.color;
  const light = mixHex(set.accent || side.light, '#ffffff', 0.35);
  const dark = side.dark;
  const glyphs = layoutGlyphs(ctx, text, style, W, H, rng, tagline ? 0.52 : 0.6);
  const f = glyphs.fontPx;

  // 1. background cloud ("burner" backdrop)
  if (style.cloud) paintCloud(ctx, glyphs, rng, u);

  // 2. extrusion (3D block shadow down-right)
  if (style.extrude > 0) {
    const steps = Math.max(4, Math.round(style.extrude * f * 0.6));
    const dx = (style.extrude * f) / steps;
    for (let s = steps; s >= 1; s--) {
      drawGlyphs(ctx, glyphs, style, (c) => {
        c.lineWidth = style.outline * f;
        c.strokeStyle = '#0b0b0f';
        c.lineJoin = style.join;
        c.miterLimit = 3;
        c.translate(dx * s, dx * s * 0.8);
      }, 'stroke');
    }
    for (let s = steps; s >= 1; s--) {
      drawGlyphs(ctx, glyphs, style, (c) => {
        c.fillStyle = s === 1 ? mixHex(dark, '#000000', 0.2) : dark;
        c.translate(dx * s, dx * s * 0.8);
      }, 'fill');
    }
  }

  // 3. outer black outline with a colored overspray halo
  ctx.save();
  ctx.shadowColor = hexA(main, 0.55);
  ctx.shadowBlur = 14 * u;
  drawGlyphs(ctx, glyphs, style, (c) => {
    c.lineWidth = style.outline * f;
    c.strokeStyle = '#0b0b0f';
    c.lineJoin = style.join;
    c.miterLimit = 3;
  }, 'stroke');
  ctx.restore();

  // 4. inner outline (white, or the light side color for flat throw-ups)
  drawGlyphs(ctx, glyphs, style, (c) => {
    c.lineWidth = style.inner * f;
    c.strokeStyle = style.flat ? '#f4f4f0' : '#fbfbf7';
    c.lineJoin = style.join;
    c.miterLimit = 3;
  }, 'stroke');

  // 5. letter fill on its own layer so fades/stripes/gloss stay inside the letters
  const L = layer.ctx;
  L.clearRect(0, 0, W, H);
  drawGlyphs(L, glyphs, style, (c) => {
    c.fillStyle = '#ffffff';
  }, 'fill');
  L.save();
  L.globalCompositeOperation = 'source-in';
  if (style.flat) {
    L.fillStyle = main;
    L.fillRect(0, 0, W, H);
    // a second flat color on the lower third, typical two-tone throw-up
    L.globalCompositeOperation = 'source-atop';
    L.fillStyle = dark;
    L.fillRect(0, glyphs.baseline - f * 0.26, W, H);
  } else {
    const g = L.createLinearGradient(0, glyphs.top, 0, glyphs.baseline);
    g.addColorStop(0, light);
    g.addColorStop(0.45, main);
    g.addColorStop(1, dark);
    L.fillStyle = g;
    L.fillRect(0, 0, W, H);
  }
  L.globalCompositeOperation = 'source-atop';
  if (style.stripes) {
    // diagonal fade bands
    L.globalAlpha = 0.55;
    L.fillStyle = mixHex(set.accent || side.light, '#ffffff', 0.15);
    const band = f * 0.12;
    for (let x = -H; x < W + H; x += band * 3.2) {
      L.beginPath();
      L.moveTo(x, glyphs.baseline + 4);
      L.lineTo(x + band, glyphs.baseline + 4);
      L.lineTo(x + band + f * 0.9, glyphs.top - 4);
      L.lineTo(x + f * 0.9, glyphs.top - 4);
      L.closePath();
      L.fill();
    }
    L.globalAlpha = 1;
    // bright horizon line through the letters
    L.fillStyle = 'rgba(255,255,255,0.8)';
    L.fillRect(0, glyphs.top + (glyphs.baseline - glyphs.top) * 0.42, W, Math.max(1.5, f * 0.035));
  }
  if (style.gloss) {
    // glossy bubble highlights: a white crescent near the top-left of every letter
    L.fillStyle = 'rgba(255,255,255,0.78)';
    for (const gl of glyphs.list) {
      L.save();
      L.translate(gl.x - gl.w * 0.18, glyphs.top + f * 0.16);
      L.rotate(-0.5);
      L.beginPath();
      L.ellipse(0, 0, Math.max(2, gl.w * 0.16), Math.max(1.5, f * 0.07), 0, 0, Math.PI * 2);
      L.fill();
      L.restore();
    }
  }
  // speckle texture so fills read as spray paint, not vector
  L.globalAlpha = 0.18;
  for (let i = 0; i < 220; i++) {
    L.fillStyle = rng.next() < 0.5 ? '#000' : '#fff';
    L.fillRect(rng.range(0, W), rng.range(glyphs.top - 4, glyphs.baseline + 4), 1.4 * u + 0.6, 1.4 * u + 0.6);
  }
  L.restore();
  ctx.drawImage(layer.canvas, 0, 0);

  // 6. shine sparkles on letter corners
  if (!style.flat) {
    const n = 2 + Math.floor(rng.next() * 2);
    for (let i = 0; i < n; i++) {
      const gl = glyphs.list[Math.floor(rng.next() * glyphs.list.length)];
      sparkle(ctx, gl.x + gl.w * rng.range(-0.35, 0.35), glyphs.top + f * rng.range(0.02, 0.2), f * 0.16);
    }
  }

  // 7. drips of fill paint running over the outline
  paintDrips(ctx, glyphs, style, dark, rng, u);

  // 8. arrows, stars, tagline
  for (let a = 0; a < style.arrows; a++) paintArrow(ctx, glyphs, main, light, rng, u, a);
  if (year) {
    const ys = Math.min(f * 0.4, H * 0.24);
    paintSmallText(ctx, "'93", Math.min(W - ys * 0.95, glyphs.right + f * 0.02), Math.max(ys * 0.62, glyphs.top + f * 0.1), ys, main, rng, -0.2);
  }
  const star = set.side === 'bloods' ? 5 : 6;
  const sx = year || rng.next() < 0.5 ? glyphs.left - f * 0.18 : glyphs.right + f * 0.18;
  const sr = Math.min(f * 0.17, H * 0.12);
  paintStar(ctx, Math.min(W - sr * 1.3, Math.max(sr * 1.3, sx)), Math.max(sr * 1.3, glyphs.top + f * 0.05), sr, star, main);
  if (tagline) {
    const ty = Math.min(H - f * 0.18, glyphs.baseline + f * 0.34);
    paintSmallText(ctx, tagline, W / 2 + rng.range(-W * 0.05, W * 0.05), ty, Math.min(f * 0.3, H * 0.15), '#fbfbf7', rng, rng.range(-0.06, 0.02), '#0b0b0f');
  }

  // 9. overspray dust around the piece
  ctx.save();
  ctx.fillStyle = hexA(main, 0.22);
  for (let i = 0; i < 360; i++) {
    const x = rng.range(glyphs.left - f * 0.3, glyphs.right + f * 0.3);
    const y = rng.range(glyphs.top - f * 0.25, glyphs.baseline + f * 0.25);
    const r = rng.range(0.4, 1.6) * u + 0.3;
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();
}

/** Measure and place each glyph; scales the font to fit the cell. */
function layoutGlyphs(ctx, text, style, W, H, rng, heightFrac) {
  const chars = [...text];
  const base = 100;
  ctx.save();
  ctx.font = `${style.weight} ${base}px ${style.font}`;
  const widths = chars.map((c) => (c === ' ' ? base * 0.3 : ctx.measureText(c).width));
  ctx.restore();
  const scales = chars.map(() => 1 + (rng.next() * 2 - 1) * style.scaleJ);
  let adv = 0;
  for (let i = 0; i < chars.length; i++) adv += widths[i] * scales[i] + (i ? style.spacing * base : 0);
  let capH = 0.74 * style.sy;
  const fitW = (W * 0.74) / Math.max(1, adv + base * style.outline);
  const fitH = (H * heightFrac) / (capH * base);
  const scale = Math.min(fitW, fitH);
  const fontPx = base * scale;
  // long words get taller letters instead of leaving the cell half empty
  const stretch = fitW < fitH ? Math.min(1.55, fitH / fitW) : 1;
  const sy = style.sy * stretch;
  const total = adv * scale;
  capH = 0.74 * sy;
  const cy = H * (heightFrac < 0.56 ? 0.44 : 0.5);
  const baseline = cy + (capH * fontPx) / 2;
  let x = W / 2 - total / 2;
  const list = [];
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i] * scales[i] * scale;
    if (i) x += style.spacing * fontPx;
    list.push({
      ch: chars[i],
      x: x + w / 2,
      y: baseline + Math.sin(i * 1.9 + rng.next()) * style.bounce * fontPx,
      rot: (rng.next() * 2 - 1) * style.rot * (chars.length > 5 ? 0.45 : 1),
      s: scales[i],
      w,
      // wildstyle spikes only off the outer letters so the name stays readable
      spike: (i === 0 || i === chars.length - 1) && chars.length > 1 && rng.next() < style.spikes * 1.6 ? (i === 0 ? -1 : 1) : 0,
    });
    x += w;
  }
  return {
    list,
    fontPx,
    sy,
    W,
    H,
    baseline,
    top: baseline - capH * fontPx,
    left: W / 2 - total / 2,
    right: W / 2 + total / 2,
  };
}

/** Run one stroke/fill pass over all glyphs with per-letter transforms (and spikes). */
function drawGlyphs(ctx, glyphs, style, setup, mode) {
  const f = glyphs.fontPx;
  for (const g of glyphs.list) {
    if (g.ch === ' ') continue;
    ctx.save();
    setup(ctx);
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.transform(1, 0, style.skew, 1, 0, 0);
    ctx.scale(g.s, g.s * glyphs.sy);
    ctx.font = `${style.weight} ${f}px ${style.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (mode === 'stroke') ctx.strokeText(g.ch, 0, 0);
    else ctx.fillText(g.ch, 0, 0);
    if (g.spike) {
      // wildstyle arrow spike off the top corner of the letter
      const sx = g.spike * g.w * 0.35;
      ctx.beginPath();
      ctx.moveTo(sx - f * 0.12, -f * 0.6);
      ctx.lineTo(sx + g.spike * f * 0.42, -f * 0.98);
      ctx.lineTo(sx + f * 0.1, -f * 0.5);
      ctx.closePath();
      if (mode === 'stroke') ctx.stroke();
      else ctx.fill();
    }
    ctx.restore();
  }
}

function paintCloud(ctx, glyphs, rng, u) {
  const f = glyphs.fontPx;
  const cx0 = glyphs.left - f * 0.25;
  const cx1 = glyphs.right + f * 0.25;
  const cy = (glyphs.top + glyphs.baseline) / 2;
  const blobs = [];
  for (let x = cx0; x <= cx1; x += f * 0.32) {
    const r = Math.min(glyphs.H * 0.4, f * rng.range(0.42, 0.62));
    // keep every blob (plus its outline) inside the cell so nothing gets cut off square
    const bx = Math.max(r + 7 * u, Math.min(glyphs.W - r - 7 * u, x + rng.range(-4, 4) * u));
    blobs.push([bx, Math.max(r + 7 * u, Math.min(glyphs.H - r - 7 * u, cy + rng.range(-0.2, 0.2) * f)), r]);
  }
  const pass = (fill, grow) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const [x, y, r] of blobs) {
      ctx.moveTo(x + r + grow, y);
      ctx.arc(x, y, r + grow, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  pass('#0b0b0f', 5 * u);
  pass('#f2f0ea', 0);
  // a soft pastel inner cloud
  ctx.save();
  ctx.globalAlpha = 0.5;
  pass('#d8dde6', -f * 0.12);
  ctx.restore();
}

function paintDrips(ctx, glyphs, style, color, rng, u) {
  const f = glyphs.fontPx;
  const n = Math.round(glyphs.list.length * style.drips + rng.next());
  for (let i = 0; i < n; i++) {
    const g = glyphs.list[Math.floor(rng.next() * glyphs.list.length)];
    if (g.ch === ' ') continue;
    const x = g.x + rng.range(-0.3, 0.3) * g.w;
    const y0 = g.y - f * 0.08;
    const len = f * rng.range(0.12, 0.5) * (style.drips > 1.5 ? 1.4 : 1);
    const w = Math.max(2, f * rng.range(0.035, 0.06));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0b0b0f';
    ctx.lineWidth = w + 3 * u + 1;
    line(ctx, x, y0, x, y0 + len);
    ctx.fillStyle = '#0b0b0f';
    circle(ctx, x, y0 + len, w * 0.95 + 1.5 * u + 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    line(ctx, x, y0, x, y0 + len);
    ctx.fillStyle = color;
    circle(ctx, x, y0 + len, w * 0.95);
    ctx.restore();
  }
}

function paintArrow(ctx, glyphs, color, light, rng, u, k) {
  const f = glyphs.fontPx;
  const right = k % 2 === 0;
  const x0 = right ? glyphs.right - f * 0.2 : glyphs.left + f * 0.2;
  const y0 = right ? glyphs.baseline - f * 0.1 : glyphs.top + f * 0.15;
  const dir = right ? 1 : -1;
  const m = glyphs.H * 0.1; // keep arrow heads inside the cell (mip bleed + cut-offs)
  const x1 = Math.min(glyphs.W - m, Math.max(m, x0 + dir * f * rng.range(0.45, 0.7)));
  const y1 = Math.max(m, Math.min(glyphs.H - m, right ? glyphs.top - f * rng.range(0.0, 0.12) : glyphs.baseline + f * 0.12));
  const cx = Math.min(glyphs.W - m * 0.5, Math.max(m * 0.5, x0 + dir * f * 0.75));
  const cy = (y0 + y1) / 2;
  const w = Math.max(3, f * 0.09);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
  };
  ctx.strokeStyle = '#0b0b0f';
  ctx.lineWidth = w + 6 * u + 2;
  path();
  ctx.stroke();
  ctx.strokeStyle = '#fbfbf7';
  ctx.lineWidth = w + 2.5 * u + 1;
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  path();
  ctx.stroke();
  // head along the curve tangent at the end
  const tx = x1 - cx;
  const ty = y1 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ax = tx / tl;
  const ay = ty / tl;
  const hs = f * 0.2;
  ctx.beginPath();
  ctx.moveTo(x1 + ax * hs, y1 + ay * hs);
  ctx.lineTo(x1 - ay * hs * 0.7, y1 + ax * hs * 0.7);
  ctx.lineTo(x1 + ay * hs * 0.7, y1 - ax * hs * 0.7);
  ctx.closePath();
  ctx.lineWidth = 4 * u + 1;
  ctx.strokeStyle = '#0b0b0f';
  ctx.stroke();
  ctx.fillStyle = light;
  ctx.fill();
  ctx.restore();
}

function paintStar(ctx, x, y, r, points, color) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * (points === 6 ? 0.58 : 0.45);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, r * 0.32);
  ctx.strokeStyle = '#0b0b0f';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r * 0.9, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r * 0.9, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

function paintSmallText(ctx, text, x, y, size, fill, rng, rot = 0, outline = '#0b0b0f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.font = `900 ${size}px ${FONT_FAT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.3;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** A painted-over ("buffed") patch of wall: nobody owns it, anyone can hit it. */
function paintBuff(ctx, W, H, rng) {
  const u = W / 512;
  // ghost of an old tag bleeding through
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = `900 ${H * 0.4}px ${FONT_FAT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6 * u;
  ctx.strokeStyle = '#2a2a2a';
  ctx.strokeText(rng.next() < 0.5 ? 'KR8Z' : 'SK1', W / 2 + rng.range(-20, 20) * u, H / 2);
  ctx.restore();
  const paints = ['#8f8a7f', '#a39d90', '#7b766c', '#b3ab99', '#948f83'];
  for (let i = 0; i < 5; i++) {
    const cx = W * rng.range(0.3, 0.7);
    const cy = H * rng.range(0.4, 0.6);
    const hw = W * rng.range(0.2, 0.36);
    const hh = H * rng.range(0.22, 0.34);
    ctx.fillStyle = paints[i % paints.length];
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const steps = 18;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // rough rectangle outline walked clockwise with jitter
      let px;
      let py;
      if (t < 0.25) {
        px = cx - hw + (t / 0.25) * hw * 2;
        py = cy - hh;
      } else if (t < 0.5) {
        px = cx + hw;
        py = cy - hh + ((t - 0.25) / 0.25) * hh * 2;
      } else if (t < 0.75) {
        px = cx + hw - ((t - 0.5) / 0.25) * hw * 2;
        py = cy + hh;
      } else {
        px = cx - hw;
        py = cy + hh - ((t - 0.75) / 0.25) * hh * 2;
      }
      ctx.lineTo(px + rng.range(-5, 5) * u, py + rng.range(-5, 5) * u);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // roller streaks
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.2, H * (0.3 + i * 0.07), W * 0.6, 2 * u + 1);
}

// ------------------------------------------------------------------ small helpers

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexA(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
