// Time of day for Omaha in summer: sun and moon arcs plus the color grading keyframes.
//
// Everything here is pure data + math (no THREE objects) so it can be sampled every frame without
// allocating. Colors are stored as display-space (sRGB) floats: the sky shader and scene.fog use them
// as-is, lights convert them with Color.setRGB(r, g, b, SRGBColorSpace).
//
// Omaha, late June: sunrise ~6:00, sunset ~21:00 (CDT), the sun climbs to ~70° at 13:30.
// The summer full moon rides low in the south (declination ≈ -23°), so ours tops out near 26°.

import { clamp } from '../../core/math.js';

export const SUNRISE = 6.0;
export const SUNSET = 21.0;
const SOLAR_NOON = (SUNRISE + SUNSET) / 2;
const DAY_LEN = SUNSET - SUNRISE;
const DEG = Math.PI / 180;
const SUN_MAX_EL = 68 * DEG;
const SUN_MIN_EL = -24 * DEG; // lowest point at solar midnight
const MOON_RISE = 20.6;
const MOON_SET = 6.4;
const MOON_MAX_EL = 26 * DEG;

/** Unit vector from azimuth (radians clockwise from north) and elevation. +X east, -Z north. */
function fromAzEl(az, el, out) {
  const c = Math.cos(el);
  out.x = Math.sin(az) * c;
  out.y = Math.sin(el);
  out.z = -Math.cos(az) * c;
  return out;
}

/** Direction toward the sun for a game-clock hour (0..24). Rises ENE, sets WNW, south at noon. */
export function sunDirection(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  let el;
  let az;
  if (h >= SUNRISE && h <= SUNSET) {
    const a = ((h - SUNRISE) / DAY_LEN) * Math.PI; // 0 at sunrise .. PI at sunset
    el = Math.sin(a) * SUN_MAX_EL;
    az = (58 + (a / Math.PI) * 244) * DEG;
  } else {
    const since = h > SUNSET ? h - SUNSET : h + 24 - SUNSET; // hours after sunset
    const a = (since / (24 - DAY_LEN)) * Math.PI;
    el = -Math.sin(a) * -SUN_MIN_EL;
    az = (302 + (a / Math.PI) * 116) * DEG; // swings through north below the horizon
  }
  return fromAzEl(az, el, out);
}

/** Direction toward the moon: a low summer moon from the SE to the SW, under the horizon by day. */
export function moonDirection(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  const span = MOON_SET + 24 - MOON_RISE;
  let since = h - MOON_RISE;
  if (since < 0) since += 24;
  const a = (since / span) * Math.PI; // 0 moonrise .. PI moonset
  let el;
  if (since <= span) el = Math.sin(a) * MOON_MAX_EL;
  else el = -Math.sin(((since - span) / (24 - span)) * Math.PI) * 0.4; // below the horizon by day
  const az = (118 + clamp(a / Math.PI, 0, 1) * 124) * DEG;
  return fromAzEl(az, el, out);
}

// ------------------------------------------------------------------------------ grading keys
// Hours are art-directed, not physical: golden hour 18:30–21:00 is the signature look, the blue hour
// follows sunset, nights are deep blue with an orange sodium glow over the city, dawn is pink.
//
//  zenith / mid / horizon   sky gradient (mid ≈ 20° up); horizonSun = horizon color toward the sun
//  fog                      scene fog + the haze band under the horizon (distant city fades into it)
//  glow                     sun halo color (added), sunCore = the disk
//  city                     sodium light pollution added near the horizon (and under the clouds)
//  light / lightI           sun (or moon) directional light color + intensity
//  hemiSky / hemiGround / hemiI   hemisphere fill
//  cloudLit / cloudShade    cloud colors facing / away from the light
//  exposure                 renderer.toneMappingExposure
//  stars                    0..1
const KEYS = [
  {
    h: 0.0, zenith: '#050a1e', mid: '#0d1636', horizon: '#1f2446', horizonSun: '#222548', fog: '#2c2940',
    glow: '#000000', sunCore: '#000000', city: '#5a2e12', light: '#9fb6ec', lightI: 0.0,
    hemiSky: '#5a6aa2', hemiGround: '#342a1e', hemiI: 1.35, cloudLit: '#3e3244', cloudShade: '#141628',
    exposure: 1.3, stars: 1.0,
  },
  {
    h: 3.8, zenith: '#060c22', mid: '#0f1838', horizon: '#232648', horizonSun: '#2a2a4e', fog: '#2e2b44',
    glow: '#000000', sunCore: '#000000', city: '#4e2810', light: '#9fb6ec', lightI: 0.0,
    hemiSky: '#5a6aa2', hemiGround: '#342a1e', hemiI: 1.35, cloudLit: '#3c3244', cloudShade: '#15172a',
    exposure: 1.3, stars: 0.95,
  },
  {
    h: 4.7, zenith: '#0c1638', mid: '#1c2858', horizon: '#3e3e6c', horizonSun: '#634a70', fog: '#3e3c5e',
    glow: '#3a2030', sunCore: '#000000', city: '#3a2010', light: '#a8b8e8', lightI: 0.0,
    hemiSky: '#5c6a9c', hemiGround: '#342a1e', hemiI: 1.3, cloudLit: '#54466a', cloudShade: '#1e2038',
    exposure: 1.25, stars: 0.6,
  },
  {
    h: 5.45, zenith: '#2a3c74', mid: '#62629a', horizon: '#d8949c', horizonSun: '#ffae8a', fog: '#b08a9a',
    glow: '#ff9a74', sunCore: '#ffc0a0', city: '#160c06', light: '#ff9e70', lightI: 0.0,
    hemiSky: '#9a94be', hemiGround: '#54443e', hemiI: 1.25, cloudLit: '#ffb4a4', cloudShade: '#6c5c8a',
    exposure: 1.12, stars: 0.12,
  },
  {
    h: 6.35, zenith: '#4a72b4', mid: '#90a8d4', horizon: '#f0c4ac', horizonSun: '#ffca8e', fog: '#d8c0b4',
    glow: '#ffc080', sunCore: '#fff0d0', city: '#000000', light: '#ffc28a', lightI: 1.9,
    hemiSky: '#b8c2de', hemiGround: '#665446', hemiI: 1.35, cloudLit: '#ffe2cc', cloudShade: '#8c8cae',
    exposure: 1.05, stars: 0.0,
  },
  {
    h: 8.2, zenith: '#3c78ca', mid: '#7aa8de', horizon: '#c6daec', horizonSun: '#e8e6da', fog: '#c0d2e2',
    glow: '#fff0d0', sunCore: '#ffffff', city: '#000000', light: '#fff0da', lightI: 2.7,
    hemiSky: '#c8dcf6', hemiGround: '#6c5c48', hemiI: 1.15, cloudLit: '#ffffff', cloudShade: '#aab6ce',
    exposure: 1.0, stars: 0.0,
  },
  {
    h: 13.0, zenith: '#2e6ed2', mid: '#6ea4e2', horizon: '#bad4ee', horizonSun: '#d8e4f0', fog: '#b4cce2',
    glow: '#fff8e8', sunCore: '#ffffff', city: '#000000', light: '#fffaf0', lightI: 3.0,
    hemiSky: '#d0e4ff', hemiGround: '#6e5e4a', hemiI: 1.2, cloudLit: '#ffffff', cloudShade: '#b2bed6',
    exposure: 0.9, stars: 0.0,
  },
  {
    h: 17.0, zenith: '#3472cc', mid: '#76a6de', horizon: '#cad8e6', horizonSun: '#efe2ca', fog: '#c4d0dc',
    glow: '#ffe8c0', sunCore: '#ffffff', city: '#000000', light: '#fff0d6', lightI: 2.85,
    hemiSky: '#d0dcf4', hemiGround: '#6e5c46', hemiI: 1.15, cloudLit: '#fff8ec', cloudShade: '#aab4cc',
    exposure: 0.93, stars: 0.0,
  },
  {
    h: 18.6, zenith: '#3a6abc', mid: '#7c9ed0', horizon: '#e8d0b0', horizonSun: '#ffd08c', fog: '#dcc8ac',
    glow: '#ffc070', sunCore: '#fff4d8', city: '#000000', light: '#ffd49c', lightI: 2.65,
    hemiSky: '#c4c8e0', hemiGround: '#765c44', hemiI: 1.28, cloudLit: '#ffe8c4', cloudShade: '#9ca0c2',
    exposure: 1.0, stars: 0.0,
  },
  {
    h: 19.75, zenith: '#33569e', mid: '#7a86ba', horizon: '#f2ba8c', horizonSun: '#ffae5c', fog: '#e2aa84',
    glow: '#ff9c44', sunCore: '#ffe8b8', city: '#000000', light: '#ffb466', lightI: 2.35,
    hemiSky: '#bcaed0', hemiGround: '#74523a', hemiI: 1.32, cloudLit: '#ffca92', cloudShade: '#8a7ca8',
    exposure: 1.05, stars: 0.0,
  },
  {
    h: 20.6, zenith: '#283a7a', mid: '#6a5c96', horizon: '#ee8c6c', horizonSun: '#ff7c38', fog: '#c2766c',
    glow: '#ff6c2c', sunCore: '#ffc488', city: '#080402', light: '#ff8444', lightI: 1.45,
    hemiSky: '#a490b6', hemiGround: '#644236', hemiI: 1.28, cloudLit: '#ff9c6c', cloudShade: '#6a5284',
    exposure: 1.1, stars: 0.0,
  },
  {
    h: 21.15, zenith: '#18225a', mid: '#3c3a7a', horizon: '#9c5c7a', horizonSun: '#d86c4c', fog: '#6c4c68',
    glow: '#c44c2c', sunCore: '#ff9a66', city: '#2c1808', light: '#c8a0c0', lightI: 0.0,
    hemiSky: '#666aa0', hemiGround: '#42302a', hemiI: 1.25, cloudLit: '#b4627c', cloudShade: '#3a3062',
    exposure: 1.18, stars: 0.25,
  },
  {
    h: 21.9, zenith: '#0b1238', mid: '#1c2254', horizon: '#403252', horizonSun: '#5c364a', fog: '#3c3048',
    glow: '#3c1a10', sunCore: '#000000', city: '#582e12', light: '#a0b4e8', lightI: 0.0,
    hemiSky: '#56669e', hemiGround: '#342a1e', hemiI: 1.32, cloudLit: '#4c3a4a', cloudShade: '#1a1a34',
    exposure: 1.28, stars: 0.75,
  },
];

const COLOR_FIELDS = ['zenith', 'mid', 'horizon', 'horizonSun', 'fog', 'glow', 'sunCore', 'city', 'light', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudShade'];
const NUM_FIELDS = ['lightI', 'hemiI', 'exposure', 'stars'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// pre-parse hex strings once
const PARSED = KEYS.map((k) => {
  const o = { h: k.h };
  for (const f of COLOR_FIELDS) o[f] = hexToRgb(k[f]);
  for (const f of NUM_FIELDS) o[f] = k[f];
  return o;
});

/** A reusable sample object: arrays [r, g, b] (sRGB 0..1) + numbers. */
export function createSample() {
  const o = {};
  for (const f of COLOR_FIELDS) o[f] = [0, 0, 0];
  for (const f of NUM_FIELDS) o[f] = 0;
  return o;
}

/** Interpolate the grading keys at `hour` into `out` (no allocation). */
export function sampleGrading(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  const n = PARSED.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) {
    if (PARSED[k].h <= h) i = k;
  }
  const a = PARSED[i];
  const b = PARSED[(i + 1) % n];
  let span = b.h - a.h;
  if (span <= 0) span += 24;
  let d = h - a.h;
  if (d < 0) d += 24;
  let t = clamp(d / span, 0, 1);
  t = t * t * (3 - 2 * t); // ease between keys: no visible "kinks" in the grading
  for (const f of COLOR_FIELDS) {
    const ca = a[f];
    const cb = b[f];
    const o = out[f];
    o[0] = ca[0] + (cb[0] - ca[0]) * t;
    o[1] = ca[1] + (cb[1] - ca[1]) * t;
    o[2] = ca[2] + (cb[2] - ca[2]) * t;
  }
  for (const f of NUM_FIELDS) out[f] = a[f] + (b[f] - a[f]) * t;
  return out;
}

export const GRADING_COLOR_FIELDS = COLOR_FIELDS;
