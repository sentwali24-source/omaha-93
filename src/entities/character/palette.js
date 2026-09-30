import * as THREE from 'three';

// Color helpers for vertex colors. Looks store sRGB hex strings ('#rrggbb'); geometry needs linear
// [r, g, b] triplets (THREE.Color does the sRGB → linear conversion).

const _c = new THREE.Color();
const cache = new Map();

/** Linear [r, g, b] for a hex string / number. Cached; do not mutate the result. */
export function rgb(hex) {
  let v = cache.get(hex);
  if (!v) {
    _c.set(hex);
    v = [_c.r, _c.g, _c.b];
    cache.set(hex, v);
  }
  return v;
}

/** Multiply brightness (linear space). */
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Perceived luminance of a linear color (0..1). */
export const luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/** Normalize '#abc' / '#aabbcc' / 0xaabbcc / THREE.Color to '#aabbcc', or null when invalid. */
export function hexColor(v) {
  if (v == null || v === false) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return '#' + (v & 0xffffff).toString(16).padStart(6, '0');
  if (v && v.isColor) return '#' + v.getHexString();
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  return null;
}

/** sRGB hex lighten/darken (for deriving look colors, not vertex colors). */
export function hexShade(hex, f) {
  _c.set(hex);
  _c.r = Math.min(1, _c.r * f);
  _c.g = Math.min(1, _c.g * f);
  _c.b = Math.min(1, _c.b * f);
  return '#' + _c.getHexString();
}
