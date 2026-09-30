import * as THREE from 'three';

// Shared 512×512 canvas atlas for every vehicle body: a white block (plain vertex-colored faces
// sample it), Nebraska plates, police door decals, grilles, wood paneling, MAT bus signs and logos.
// All faces of every car body use this one texture, so bodies stay one mesh / one material.
//
// uv(name) → [u0, v0, u1, v1] (canvas is flipped: pixel row 0 = v 1).

const SIZE = 512;
let atlas = null;

// Pixel rects: [x, y, w, h]
const RECTS = {
  white: [0, 0, 32, 32],
  plate0: [0, 32, 128, 64],
  plate1: [128, 32, 128, 64],
  plate2: [256, 32, 128, 64],
  plate3: [384, 32, 128, 64],
  police: [0, 96, 256, 96],
  grilleCrate: [256, 96, 128, 48],
  grilleBars: [384, 96, 128, 48],
  grilleTruck: [256, 144, 128, 48],
  grilleSlats: [384, 144, 128, 48],
  wood: [0, 192, 256, 64],
  sign0: [256, 192, 256, 32],
  sign1: [256, 224, 256, 32],
  sign2: [256, 256, 256, 32],
  mat: [0, 256, 192, 64],
  unit0: [192, 256, 64, 32],
  unit1: [192, 288, 64, 32],
  tail: [0, 320, 64, 32],
  head: [64, 320, 64, 32],
  louver: [128, 320, 64, 64],
  rust: [192, 320, 64, 64],
  vanStripe: [256, 288, 256, 64],
  busGlass: [256, 352, 128, 64],
};

const PLATES = ['1-K4821', '1-A7390', '1-EW226', '1-B5518'];
const SIGNS = ['24  N 24TH ST', '2  DODGE ST', '30  N 30TH ST'];

function drawAtlas(ctx) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ---- Nebraska plates (Douglas County "1-" prefix): white, maroon state name, navy characters
  PLATES.forEach((text, i) => {
    const [x, y, w, h] = RECTS[`plate${i}`];
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(120,150,200,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2a3346';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = '#8a1a22';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEBRASKA', x + w / 2, y + 13);
    ctx.fillStyle = '#1b2a5a';
    ctx.font = 'bold 27px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(text, x + w / 2, y + 38);
    ctx.fillStyle = '#6a6f7a';
    ctx.font = '8px Arial, sans-serif';
    ctx.fillText('DOUGLAS', x + w / 2, y + 56);
  });

  // ---- police door panel: white field, navy star emblem, "POLICE" lettering
  {
    const [x, y, w, h] = RECTS.police;
    ctx.fillStyle = '#f2f2f0';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#16244f';
    ctx.fillRect(x, y + h - 12, w, 12);
    // star badge
    const cx = x + 40;
    const cy = y + 42;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 26 : 11;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#c9a33a';
    ctx.fill();
    ctx.strokeStyle = '#16244f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#16244f';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px Impact, "Arial Black", Arial, sans-serif';
    ctx.fillText('POLICE', x + 76, y + 38);
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText('CITY OF OMAHA', x + 80, y + 66);
  }

  // ---- grilles
  const grille = (rect, draw) => {
    const [x, y, w, h] = rect;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    draw(x, y, w, h);
    ctx.restore();
  };
  grille(RECTS.grilleCrate, (x, y, w, h) => {
    ctx.fillStyle = '#16171a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c9cdd2';
    for (let i = 0; i <= 12; i++) ctx.fillRect(x + (i * w) / 12 - 1, y, 3, h);
    for (let j = 0; j <= 4; j++) ctx.fillRect(x, y + (j * h) / 4 - 1, w, 3);
    ctx.strokeStyle = '#e8ebee';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  });
  grille(RECTS.grilleBars, (x, y, w, h) => {
    ctx.fillStyle = '#131416';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#bfc4ca';
    for (let j = 1; j < 7; j++) ctx.fillRect(x, y + (j * h) / 7 - 1, w, 3);
    ctx.fillRect(x + w / 2 - 3, y, 6, h);
    ctx.strokeStyle = '#e2e5e8';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  });
  grille(RECTS.grilleTruck, (x, y, w, h) => {
    ctx.fillStyle = '#1a1b1d';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#cdd1d6';
    for (let i = 0; i <= 8; i++) ctx.fillRect(x + (i * w) / 8 - 2, y, 4, h);
    ctx.fillRect(x, y + h / 2 - 2, w, 5);
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(x + w / 2 - 12, y + h / 2 - 6, 24, 12);
  });
  grille(RECTS.grilleSlats, (x, y, w, h) => {
    ctx.fillStyle = '#18191b';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3a3c40';
    for (let j = 0; j < 5; j++) ctx.fillRect(x, y + 4 + j * 9, w, 4);
  });

  // ---- wood grain paneling with a light maple frame (station wagon sides)
  {
    const [x, y, w, h] = RECTS.wood;
    ctx.fillStyle = '#6b3f1f';
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 26; i++) {
      const yy = y + 6 + (i / 26) * (h - 12);
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(40,20,8,0.55)' : 'rgba(150,95,50,0.45)';
      ctx.lineWidth = i % 4 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      for (let k = 0; k <= 16; k++) ctx.lineTo(x + (k * w) / 16, yy + Math.sin(k * 0.9 + i * 1.7) * 1.6);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d8c39a';
    ctx.lineWidth = 7;
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
    ctx.strokeStyle = 'rgba(90,60,30,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 7.5, y + 7.5, w - 15, h - 15);
  }

  // ---- MAT bus destination signs: amber flip-dot text on black
  SIGNS.forEach((text, i) => {
    const [x, y, w, h] = RECTS[`sign${i}`];
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffb21e';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = 0; k < w; k += 3) ctx.fillRect(x + k, y, 1, h);
  });

  // ---- MAT logo (Metro Area Transit)
  {
    const [x, y, w, h] = RECTS.mat;
    ctx.fillStyle = '#f0ebdc';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#7a1f2a';
    ctx.font = 'bold italic 40px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAT', x + 10, y + 26);
    ctx.fillStyle = '#d0842a';
    ctx.fillRect(x + 10, y + 46, 112, 4);
    ctx.fillStyle = '#3a2a22';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('METRO AREA TRANSIT', x + 10, y + 57);
  }

  // ---- roof/trunk unit numbers
  ['214', '37'].forEach((t, i) => {
    const [x, y, w, h] = RECTS[`unit${i}`];
    ctx.fillStyle = '#f2f2f0';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#111624';
    ctx.font = 'bold 26px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x + w / 2, y + h / 2 + 1);
  });

  // ---- tail lamp lens (ribbed) and headlamp lens (faceted) — tinted by vertex color
  {
    const [x, y, w, h] = RECTS.tail;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let k = 0; k < w; k += 6) ctx.fillRect(x + k, y, 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
  }
  {
    const [x, y, w, h] = RECTS.head;
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, w / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#b9c0c6');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(80,90,100,0.35)';
    ctx.lineWidth = 1;
    for (let k = 4; k < w; k += 8) {
      ctx.beginPath();
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + k, y + h);
      ctx.stroke();
    }
  }
  // ---- engine louvers (bus rear) and rust speckle
  {
    const [x, y, w, h] = RECTS.louver;
    ctx.fillStyle = '#2a2b2e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#0c0c0d';
    for (let j = 4; j < h; j += 7) ctx.fillRect(x + 4, y + j, w - 8, 3);
  }
  {
    const [x, y, w, h] = RECTS.rust;
    ctx.fillStyle = '#7a4424';
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 160; i++) {
      const s = 1 + ((i * 7) % 4);
      ctx.fillStyle = ['#5a2c14', '#9a5a2a', '#3e2414', '#a86a3a'][i % 4];
      ctx.fillRect(x + ((i * 37) % w), y + ((i * 53) % h), s, s);
    }
  }
  // ---- conversion-van side graphic: three swooping stripes (white base, tinted by vertex color)
  {
    const [x, y, w, h] = RECTS.vanStripe;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    const bands = ['#e07a1e', '#b8391e', '#f1c232'];
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      const y0 = y + 14 + i * 12;
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(x + w * 0.45, y0, x + w * 0.6, y0 - 12, x + w, y0 - 12);
      ctx.lineTo(x + w, y0 - 4);
      ctx.bezierCurveTo(x + w * 0.62, y0 - 4, x + w * 0.48, y0 + 8, x, y0 + 8);
      ctx.closePath();
      ctx.fill();
    });
  }
  // ---- bus window band: dark glass with reflections
  {
    const [x, y, w, h] = RECTS.busGlass;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#2c3a44');
    g.addColorStop(0.5, '#141c22');
    g.addColorStop(1, '#26323a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x + 20, y);
    ctx.lineTo(x + 50, y);
    ctx.lineTo(x + 20, y + h);
    ctx.lineTo(x - 10, y + h);
    ctx.fill();
  }
}

/** The shared atlas: { texture, uv(name) }. Built once. */
export function getAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  drawAtlas(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = 'vehicle-atlas';
  const uvCache = {};
  const uv = (name) => {
    if (uvCache[name]) return uvCache[name];
    const r = RECTS[name] || RECTS.white;
    const inset = 1.5;
    const u0 = (r[0] + inset) / SIZE;
    const u1 = (r[0] + r[2] - inset) / SIZE;
    const v0 = 1 - (r[1] + r[3] - inset) / SIZE;
    const v1 = 1 - (r[1] + inset) / SIZE;
    return (uvCache[name] = [u0, v0, u1, v1]);
  };
  atlas = { texture, uv, canvas };
  return atlas;
}

/** UV of the solid white texel block (for plain vertex-colored faces). */
export const WHITE_UV = [16 / SIZE, 1 - 16 / SIZE];
