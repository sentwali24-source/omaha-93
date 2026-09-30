import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { Sky } from './environment/Sky.js';
import { Weather, WEATHER_KINDS } from './environment/Weather.js';
import { Rain } from './environment/Rain.js';
import { Fireflies } from './environment/Fireflies.js';
import { createSample, sampleGrading, sunDirection, moonDirection } from './environment/timeOfDay.js';
import { installToneMapping } from './environment/toneMapping.js';

// Sky, sun & moon, time-of-day grading, fog, shadows, night lighting and weather (ARCHITECTURE §10).
//
//   env.update(dt)      everything below, once per frame after the camera moved
//   env.night           0 (day) .. 1 (full night); drives city.setNight + city.nightMaterials
//   env.sun             THREE.DirectionalLight (the moon at night); shadow caster when quality.shadows
//   env.weather         'clear' | 'overcast' | 'rain' | 'thunderstorm'
//   env.setWeather(kind, { immediate, lock })
//
// Extras: env.raining, env.rainIntensity, env.wetness (0..1, lags the rain), env.sunDir / env.moonDir
// (unit vectors toward them), env.flash (lightning 0..1), env.wind {x, z} m/s, env.hemi.
// Events: 'weather:change' { weather }, 'weather:lightning' { distance, intensity, dirX, dirZ }.

const SHADOW_HALF = 70; // shadow frustum half-size (140 m across)
const SHADOW_DIST = 400; // light distance from the frustum center
const SHADOW_STEP = 0.0026; // re-aim the shadow light only after the sun moved ~0.15° (no crawling)
const MOON_COLOR = [0.62, 0.71, 0.92];
// Sky fill is strong relative to the sun (PS2-era readable shadows: colored, never black); the
// grading keys keep hemiI around 1..1.4 and these scale it into light units per tone mapper.
const HEMI_SCALE = 1.85; // ACES / others (deep toe: needs more fill)
const CUSTOM_HEMI = 1.5; // the default "Omaha" curve (see environment/toneMapping.js)
const CUSTOM_EXPOSURE = 1.9;
const EXPOSURE_SCALE = 0.86;
const GRAY_FIELDS = ['zenith', 'mid', 'horizon', 'horizonSun', 'fog', 'cloudLit', 'cloudShade', 'hemiSky'];

const _gray = [0, 0, 0];

/** Pull an sRGB color toward a cool gray of the same brightness (overcast skies). */
function overcast(c, amount, darken) {
  if (amount <= 0 && darken <= 0) return c;
  const l = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) * (1 - darken);
  _gray[0] = l * 0.95;
  _gray[1] = l * 0.99;
  _gray[2] = l * 1.06;
  c[0] = lerp(c[0], _gray[0], amount);
  c[1] = lerp(c[1], _gray[1], amount);
  c[2] = lerp(c[2], _gray[2], amount);
  return c;
}

const setV3 = (v, c, k = 1) => v.set(c[0] * k, c[1] * k, c[2] * k);

export class Environment {
  constructor(game) {
    this.game = game;
    this.attract = true; // the sky keeps moving behind the title menu
    const scene = game.scene;

    this.night = 0;
    this.dayLight = 1;
    this.flash = 0;
    this.wind = { x: 1.2, z: 0.5 };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.grade = createSample();

    // lights
    this.hemi = new THREE.HemisphereLight('#dfefff', '#4a4038', 1.2);
    this.hemi.name = 'env-hemi';
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.5);
    this.sun.name = 'env-sun';
    this.sun.target.name = 'env-sun-target';
    scene.add(this.hemi, this.sun, this.sun.target);
    this._lightDir = new THREE.Vector3(0, 1, 0); // direction the light currently uses
    this._center = new THREE.Vector3();
    this._camFwd = new THREE.Vector3();
    this._basisR = new THREE.Vector3();
    this._basisU = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    scene.background = new THREE.Color('#9cc3e6'); // cleared under the sky dome (cheap fallback)
    scene.fog = new THREE.Fog('#9cc3e6', game.quality.fogNear, game.quality.fogFar);

    this.sky = new Sky(game);
    this.weatherSystem = new Weather(game);
    this.rainFx = new Rain(game);
    this.fireflies = new Fireflies(game);

    // Tone mapping: exposure is graded per time of day in update(). ?tonemap=aces|neutral|agx to compare.
    const TONEMAPS = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, omaha: THREE.CustomToneMapping };
    let tm = TONEMAPS[game.params?.get?.('tonemap')] ?? THREE.CustomToneMapping;
    if (tm === THREE.CustomToneMapping && !installToneMapping()) tm = THREE.ACESFilmicToneMapping;
    if (game.renderer) game.renderer.toneMapping = tm;
    // ACES pre-scales by 1/0.6 and has a deep toe; the others need more gain to match its brightness
    this._exposureK = { [THREE.ACESFilmicToneMapping]: 1, [THREE.AgXToneMapping]: 1.35, [THREE.NeutralToneMapping]: 1.5 }[tm] ?? CUSTOM_EXPOSURE;
    this._hemiK = tm === THREE.CustomToneMapping ? CUSTOM_HEMI : HEMI_SCALE;

    this._nightSent = -1;
    this._nightMatCount = -1;
    this._rainColor = [0.7, 0.72, 0.78];
    this._time = 0;
    this._applyQuality();

    // ?weather=rain (tests / screenshots) pins the weather
    const forced = game.params?.get?.('weather');
    if (forced && WEATHER_KINDS.includes(forced)) this.weatherSystem.set(forced, { immediate: true, lock: true });

    this.update(0); // correct look on the very first frame
  }

  init() {
    this.game.events.on('settings:change', () => this._applyQuality());
  }

  // ------------------------------------------------------------------ public API
  get weather() {
    return this.weatherSystem.kind;
  }

  /** True while it is actually raining (rain or thunderstorm, once the rain rolled in). */
  get raining() {
    return this.weatherSystem.params.rain > 0.2;
  }

  get rainIntensity() {
    return this.weatherSystem.params.rain;
  }

  get wetness() {
    return this.weatherSystem.wetness;
  }

  /** kind: 'clear' | 'overcast' | 'rain' | 'thunderstorm'. opts: { immediate, lock } */
  setWeather(kind, opts = {}) {
    return this.weatherSystem.set(kind, opts);
  }

  // ------------------------------------------------------------------ lifecycle
  onGameStart(isNew) {
    const w = this.weatherSystem;
    if (w.locked) return;
    const saved = !isNew && this.game.state?.flags?.['environment.weather'];
    if (saved && WEATHER_KINDS.includes(saved)) w.set(saved, { immediate: true });
    else w.set('clear', { duration: 150 + Math.random() * 150 });
  }

  onGameEnd() {
    if (!this.weatherSystem.locked) this.weatherSystem.set('clear', { immediate: true });
  }

  serialize(state) {
    if (state?.flags) state.flags['environment.weather'] = this.weatherSystem.kind;
  }

  _applyQuality() {
    const q = this.game.quality;
    const sun = this.sun;
    const want = !!q.shadows;
    const size = q.shadowSize || 1024;
    if (sun.castShadow !== want || (want && sun.shadow.mapSize.x !== size)) {
      sun.castShadow = want;
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(size, size);
      const cam = sun.shadow.camera;
      cam.left = -SHADOW_HALF;
      cam.right = SHADOW_HALF;
      cam.top = SHADOW_HALF;
      cam.bottom = -SHADOW_HALF;
      cam.near = 1;
      cam.far = SHADOW_DIST * 2;
      cam.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.045;
      sun.shadow.radius = 2;
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const game = this.game;
    const cam = game.camera;
    const g = this.grade;
    const hour = game.clock.hour;
    this._time += dt;
    this._installDebug();

    sunDirection(hour, this.sunDir);
    moonDirection(hour, this.moonDir);
    sampleGrading(hour, g);

    const wx = this.weatherSystem;
    wx.update(dt, { attract: game.mode !== 'play' && !wx.locked });
    const P = wx.params;
    this.flash = wx.flash;

    const sunEl = this.sunDir.y;
    const moonEl = this.moonDir.y;
    const dayF = smoothstep(-0.05, 0.2, sunEl);
    this.dayLight = dayF;

    // ---- weather grading: overcast pulls everything toward a darker gray
    const oc = smoothstep(0.45, 1.0, P.cover) * 0.92;
    const dk = P.dark * 0.5;
    for (let i = 0; i < GRAY_FIELDS.length; i++) overcast(g[GRAY_FIELDS[i]], oc, dk);
    overcast(g.cloudShade, P.dark * 0.5, P.dark * 0.35);
    const glowK = 1 - 0.85 * oc;

    // ---- night factor (streetlights come on early under storm clouds)
    const sunNight = 1 - smoothstep(-0.14, 0.07, sunEl);
    this.night = clamp(sunNight + P.dark * 0.55 * (1 - sunNight), 0, 1);

    // ---- sky uniforms
    const u = this.sky.uniforms;
    setV3(u.uZenith.value, g.zenith);
    setV3(u.uMid.value, g.mid);
    setV3(u.uHorizon.value, g.horizon);
    setV3(u.uHorizonSun.value, g.horizonSun);
    setV3(u.uFog.value, g.fog);
    setV3(u.uGlow.value, g.glow, glowK);
    setV3(u.uSunCore.value, g.sunCore);
    setV3(u.uCity.value, g.city, 1 + 0.7 * P.cover);
    setV3(u.uCloudLit.value, g.cloudLit);
    setV3(u.uCloudShade.value, g.cloudShade);
    u.uSunDir.value.copy(this.sunDir);
    u.uSunVis.value = smoothstep(-0.05, 0.01, sunEl) * glowK;
    this.sky.setMoon(this.moonDir, this.sunDir);
    u.uMoonVis.value = smoothstep(-0.02, 0.05, moonEl) * (1 - 0.8 * dayF);
    u.uStars.value = g.stars * (1 - 0.85 * smoothstep(0.55, 0.95, P.cover));
    u.uTime.value = this._time;
    u.uCover.value = P.cover;
    u.uCloudDark.value = P.dark;
    u.uFlash.value = this.flash;
    u.uFlashDir.value.set(wx.flashDir.x, wx.flashDir.y, wx.flashDir.z);
    u.uHaze.value = 0.07 + 0.12 * (1 - P.fog);
    // wind: gentle and gusting, stronger in storms; the clouds drift with it
    const gust = 1 + 0.35 * Math.sin(this._time * 0.21) + 0.2 * Math.sin(this._time * 0.53);
    const windK = (1 + 2.2 * P.storm + 0.8 * P.rain) * gust;
    this.wind.x = 1.3 * windK;
    this.wind.z = 0.55 * windK;
    u.uWind.value.x += this.wind.x * dt * 0.0022;
    u.uWind.value.y += this.wind.z * dt * 0.0022;
    this.sky.follow(cam);

    // ---- fog
    const q = game.quality;
    const fog = game.scene.fog;
    const fl = this.flash * 0.3; // lightning lights up the murk too
    const fr = Math.min(1, g.fog[0] + fl * 0.9);
    const fgc = Math.min(1, g.fog[1] + fl * 0.92);
    const fb = Math.min(1, g.fog[2] + fl);
    fog.color.setRGB(fr, fgc, fb, THREE.SRGBColorSpace);
    u.uFog.value.set(fr, fgc, fb);
    const qFar = q.far || cam.far;
    fog.near = q.fogNear * lerp(0.35, 1, P.fog);
    fog.far = Math.min(q.fogFar * P.fog, qFar * 0.98);
    // the draw distance follows the fog wall: past it every pixel is pure fog colour (= the clear
    // colour), so whole city chunks there are skipped — a big saving in rain. The sky dome sits on
    // the far plane in its own shader, so it is unaffected.
    const wantFar = Math.min(qFar, fog.far + 25);
    if (Math.abs(cam.far - wantFar) > 4) {
      cam.far = wantFar;
      cam.updateProjectionMatrix();
    }
    game.scene.background.copy(fog.color);

    // ---- lights: the sun by day, the moon by night (the same shadow-casting light)
    const sunPart = g.lightI * smoothstep(-0.03, 0.08, sunEl) * P.sun;
    const moonPart = 0.5 * smoothstep(0.0, 0.14, moonEl) * (1 - smoothstep(-0.02, 0.06, sunEl)) * (1 - 0.8 * oc);
    const useSun = sunPart >= moonPart;
    const sun = this.sun;
    if (useSun) sun.color.setRGB(g.light[0], g.light[1], g.light[2], THREE.SRGBColorSpace);
    else sun.color.setRGB(MOON_COLOR[0], MOON_COLOR[1], MOON_COLOR[2], THREE.SRGBColorSpace);
    sun.intensity = Math.max(sunPart, moonPart);
    this._aimLight(useSun ? this.sunDir : this.moonDir, cam);

    const hemiBoost = (1 + 0.5 * (1 - P.sun) * dayF) * (1 - 0.28 * P.dark);
    this.hemi.color.setRGB(g.hemiSky[0], g.hemiSky[1], g.hemiSky[2], THREE.SRGBColorSpace);
    this.hemi.groundColor.setRGB(g.hemiGround[0], g.hemiGround[1], g.hemiGround[2], THREE.SRGBColorSpace);
    this.hemi.intensity = g.hemiI * this._hemiK * hemiBoost + this.flash * 3.5;

    // ---- exposure per time of day (+ a kick from lightning)
    const r = game.renderer;
    if (r) r.toneMappingExposure = (g.exposure * (1 + 0.1 * P.dark) + this.flash * 0.5) * this._exposureK * EXPOSURE_SCALE;

    // ---- rain + fireflies
    const rc = this._rainColor;
    for (let i = 0; i < 3; i++) rc[i] = clamp(g.fog[i] * 0.5 + g.hemiSky[i] * 0.3 + 0.24 + this.flash * 0.5, 0, 1);
    this.rainFx.update(dt, cam, P.rain, rc, this.wind, this._time);
    this.fireflies.update(dt, this);
    game.city?.setWetness?.(this.wetness);

    // ---- city night lighting (only when it changed: setNight may be expensive)
    this._applyNight();
  }

  /** Aim the directional light at the area around the focus, snapped to shadow-map texels. */
  _aimLight(dir, cam) {
    const game = this.game;
    const sun = this.sun;
    const ld = this._lightDir;
    // never light from below the horizon; keep a grazing minimum so facades still catch a low sun
    const ty = Math.max(dir.y, 0.1);
    const len = Math.hypot(dir.x, ty, dir.z);
    const nx = dir.x / len;
    const ny = ty / len;
    const nz = dir.z / len;
    if (!sun.castShadow || Math.abs(nx - ld.x) + Math.abs(ny - ld.y) + Math.abs(nz - ld.z) > SHADOW_STEP) ld.set(nx, ny, nz);

    // frustum center: the focus, pushed a little toward where the camera looks
    const f = game.focus || cam.position;
    cam.getWorldDirection(this._camFwd);
    const c = this._center.set(f.x + this._camFwd.x * 22, 0, f.z + this._camFwd.z * 22);

    if (sun.castShadow) {
      // light-space basis exactly as Matrix4.lookAt builds it for the shadow camera
      const right = this._basisR.crossVectors(this._up, ld).normalize();
      const up = this._basisU.crossVectors(ld, right);
      const texel = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
      const a = Math.round(c.dot(right) / texel) * texel;
      const b = Math.round(c.dot(up) / texel) * texel;
      const w = c.dot(ld);
      c.set(right.x * a + up.x * b + ld.x * w, right.y * a + up.y * b + ld.y * w, right.z * a + up.z * b + ld.z * w);
    }
    sun.target.position.copy(c);
    sun.position.set(c.x + ld.x * SHADOW_DIST, c.y + ld.y * SHADOW_DIST, c.z + ld.z * SHADOW_DIST);
    sun.target.updateMatrixWorld();
  }

  _applyNight() {
    const city = this.game.city;
    const n = Math.round(this.night * 400) / 400;
    const mats = city?.nightMaterials;
    const count = mats?.length ?? 0;
    if (n === this._nightSent && count === this._nightMatCount) return;
    this._nightSent = n;
    this._nightMatCount = count;
    if (mats) {
      for (let i = 0; i < count; i++) {
        const m = mats[i];
        // materials the city grades itself (windows / lamps curves) are left to city.setNight
        if (m && 'emissiveIntensity' in m && !m.userData?.cityNight) m.emissiveIntensity = n * (m.userData?.nightIntensity ?? 1);
      }
    }
    // city last, so it may refine what we set on its materials
    try {
      city?.setNight?.(n);
    } catch (err) {
      if (!this._nightErr) console.error('[environment] city.setNight threw', err);
      this._nightErr = true;
    }
  }

  _installDebug() {
    const api = this.game.debugApi;
    if (!api || api.weather) return;
    api.weather = (kind, lock = true) => this.setWeather(kind, { immediate: true, lock });
    api.lightning = (distance) => this.weatherSystem.strike(distance);
    api.env = () => ({
      hour: this.game.clock.hour,
      night: this.night,
      weather: this.weather,
      params: { ...this.weatherSystem.params },
      wetness: this.wetness,
      sunDir: this.sunDir.toArray().map((v) => +v.toFixed(3)),
      moonDir: this.moonDir.toArray().map((v) => +v.toFixed(3)),
      sunIntensity: +this.sun.intensity.toFixed(3),
      hemiIntensity: +this.hemi.intensity.toFixed(3),
      exposure: this.game.renderer?.toneMappingExposure,
      shadows: this.sun.castShadow,
      fog: { near: this.game.scene.fog.near, far: this.game.scene.fog.far },
      rainDrops: this.rainFx.streaks.visible ? this.rainFx.streaks.geometry.instanceCount : 0,
      fireflies: this.fireflies.visibleCount,
    });
  }
}
