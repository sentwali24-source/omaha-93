import * as THREE from 'three';

// Procedural sky dome: one draw call, drawn first, behind everything.
//
//  * vertical gradient (horizon → mid → zenith) that leans warm toward the sun
//  * sun disk + two-lobe glow, a phase-lit low summer moon, twinkling stars
//  * soft fbm clouds projected on a sky plane, self-shadowed toward the light, drifting with the wind
//  * orange sodium light pollution over the city horizon at night (also under the clouds)
//  * lightning flashes (global + localized in the flash direction)
//
// The dome follows the camera and is pushed to the far plane in the vertex shader, so its size does
// not matter and it never clips. It renders after the opaque geometry with depth testing, so the
// shader only runs on pixels the city leaves uncovered (cheap on phones). All colors are display-space (sRGB) and written without tone
// mapping, exactly like three.js applies scene.fog (after tone mapping) — so the haze band under the
// horizon (= fog color) matches fogged geometry pixel for pixel.

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  p.z = p.w; // exactly on the far plane (depth 1.0): LEQUAL passes only where nothing was drawn
  gl_Position = p;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uHorizonSun;
uniform vec3 uFog;
uniform vec3 uGlow;
uniform vec3 uSunCore;
uniform vec3 uCity;
uniform vec3 uSunDir;
uniform vec2 uSunDisk;      // cos(outer), cos(inner)
uniform float uSunVis;
uniform vec3 uMoonDir;
uniform vec3 uMoonRight;
uniform vec3 uMoonUp;
uniform vec3 uMoonLight;    // sun direction in the moon's local frame (phase)
uniform float uMoonSize;
uniform float uMoonVis;
uniform float uStars;
uniform float uTime;
uniform float uCover;       // 0 clear .. 1 overcast
uniform float uCloudDark;   // storm darkness
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec2 uWind;
uniform float uFlash;
uniform vec3 uFlashDir;
uniform float uHaze;        // thickness of the haze band (rain = thick)
uniform sampler2D uNoise;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// Cloud noise from a baked, tileable fbm texture: R = broad shapes, G = detail (see makeNoiseTexture).
// Two lookups instead of dozens of hashes per pixel: cheap on phones and on software GL.
float fbm(vec2 p) {
  return texture2D(uNoise, p * 0.34).r * 0.74 + texture2D(uNoise, p * 1.05 + 0.37).g * 0.26;
}

void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  float e = max(el, 0.0);

  // ---- gradient, warmer toward the sun
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float toward = dot(dh, sh) * 0.5 + 0.5;
  vec3 hor = mix(uHorizon, uHorizonSun, toward * toward * toward);
  vec3 col = mix(hor, uMid, smoothstep(0.0, 0.32, e));
  col = mix(col, uZenith, smoothstep(0.2, 0.95, e));

  // ---- sodium city glow near the horizon
  col += uCity * (exp(-e * 7.0) * 0.9 + 0.1 * (1.0 - e));

  // ---- stars (fade toward the light-polluted horizon)
  if (uStars > 0.01) {
    vec3 sp = d * 150.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    if (h > 0.972) {
      vec3 off = vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.9)) - 0.5;
      float dist = length(fract(sp) - 0.5 - off * 0.55);
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 9.0) + h * 91.0);
      float s = smoothstep(0.16, 0.02, dist) * tw * (0.35 + 1.1 * fract(h * 53.0));
      col += vec3(0.85, 0.9, 1.0) * s * uStars * smoothstep(0.04, 0.4, el);
    }
  }

  // ---- moon: a lit sphere (phase from the real sun direction) with a soft halo
  float md = dot(d, uMoonDir);
  if (uMoonVis > 0.001) {
    col += vec3(0.55, 0.62, 0.8) * (pow(max(md, 0.0), 900.0) * 0.35 + pow(max(md, 0.0), 60.0) * 0.06) * uMoonVis;
    if (md > 0.99) {
      vec2 m = vec2(dot(d, uMoonRight), dot(d, uMoonUp)) / uMoonSize;
      float r2 = dot(m, m);
      if (r2 < 1.0) {
        vec3 n = vec3(m, sqrt(1.0 - r2));
        float lit = smoothstep(-0.05, 0.25, dot(n, uMoonLight));
        float mare = texture2D(uNoise, m * 0.18 + 0.5).r * 1.25 - 0.1;
        vec3 mc = vec3(0.96, 0.95, 0.9) * (0.72 + 0.34 * smoothstep(0.35, 0.75, mare));
        vec3 moonCol = mc * (lit * 0.92 + 0.06);
        col = mix(col, max(col, moonCol), smoothstep(1.0, 0.9, r2) * uMoonVis);
      }
    }
  }

  // ---- sun glow (Mie-ish forward scattering, a little stronger near the horizon), screen-blended
  float cs = dot(d, uSunDir);
  float fwd = max(cs, 0.0);
  float horizonBoost = 1.0 + 0.6 * exp(-e * 6.0);
  vec3 g = uGlow * (pow(fwd, 6.0) * 0.2 + pow(fwd, 60.0) * 0.3 + pow(fwd, 900.0) * 0.55) * horizonBoost * uSunVis;
  col = 1.0 - (1.0 - col) * (1.0 - clamp(g, 0.0, 1.0));

  // ---- sun disk
  float disk = smoothstep(uSunDisk.x, uSunDisk.y, cs) * uSunVis;

  // ---- clouds on a sky plane
  float dens = 0.0;
  if (el > 0.0 && uCover > 0.01) {
    vec2 uv = d.xz / (el + 0.12) * 0.5 + uWind;
    float n = fbm(uv * 1.35);
    float thr = mix(0.64, 0.2, uCover);
    dens = smoothstep(thr, thr + 0.09 + 0.3 * uCover, n);
    dens *= smoothstep(0.0, 0.16, el);            // thin out into the horizon haze
#ifdef CLOUD_LIGHTING
    float n2 = fbm((uv + sh * 0.07) * 1.35);        // one step toward the light
    float shade = clamp(0.62 + (n - n2) * 6.0, 0.0, 1.0);
#else
    float shade = clamp(1.0 - (n - thr) * 2.2, 0.0, 1.0);
#endif
    shade *= 1.0 - 0.25 * smoothstep(0.5, 1.0, dens) * (1.0 - uCover);
    shade *= 1.0 - 0.55 * uCloudDark * smoothstep(0.2, 1.0, dens);
    vec3 cloud = mix(uCloudShade, uCloudLit, shade);
    cloud += uGlow * pow(fwd, 8.0) * (1.0 - dens) * 0.9 * uSunVis; // silver lining
    cloud += uCity * 0.55 * (1.0 - e);                               // city light under the deck
    col = mix(col, cloud, dens * (0.94 - 0.2 * (1.0 - uCover) * (1.0 - dens)));
  }

  // ---- the disk shows through thin cloud only
  col = mix(col, min(uSunCore * 1.25, vec3(1.0)), disk * (1.0 - smoothstep(0.1, 0.8, dens)));

  // ---- lightning
  if (uFlash > 0.001) {
    float local = pow(max(dot(d, uFlashDir), 0.0), 6.0);
    col += vec3(0.78, 0.82, 1.0) * uFlash * (0.25 + dens * 0.6 + local * 1.4);
  }

  // ---- haze band: everything below the horizon is fog color, so the city fades into it
  col = mix(uFog, col, smoothstep(-0.015, uHaze, el));
  // the glow also lights the haze (fading out before the dome's lower edge, which meets the clear color)
  vec3 hg = clamp(uGlow * pow(fwd, 10.0) * 0.3 * uSunVis * (1.0 - smoothstep(0.0, 0.25, e)) * smoothstep(-0.1, 0.0, el), 0.0, 1.0);
  col = 1.0 - (1.0 - col) * (1.0 - hg);

  // ---- dither to kill gradient banding
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * smoothstep(-0.1, -0.02, el);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(game) {
    this.game = game;
    const detail = game.quality.detail ?? 1;
    this.uniforms = {
      uZenith: { value: new THREE.Vector3() },
      uMid: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uHorizonSun: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Vector3() },
      uGlow: { value: new THREE.Vector3() },
      uSunCore: { value: new THREE.Vector3() },
      uCity: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunDisk: { value: new THREE.Vector2(Math.cos(0.024), Math.cos(0.019)) },
      uSunVis: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoonRight: { value: new THREE.Vector3(1, 0, 0) },
      uMoonUp: { value: new THREE.Vector3(0, 1, 0) },
      uMoonLight: { value: new THREE.Vector3(0, 0, 1) },
      uMoonSize: { value: 0.03 },
      uMoonVis: { value: 0 },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uCover: { value: 0.3 },
      uCloudDark: { value: 0 },
      uCloudLit: { value: new THREE.Vector3(1, 1, 1) },
      uCloudShade: { value: new THREE.Vector3(0.7, 0.7, 0.8) },
      uWind: { value: new THREE.Vector2() },
      uFlash: { value: 0 },
      uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
      uHaze: { value: 0.09 },
      uNoise: { value: makeNoiseTexture(256) },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'SkyDome',
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      defines: detail === 0 ? {} : { CLOUD_LIGHTING: 1 },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true, // drawn after the opaque city at the far plane: early-z skips covered pixels
      fog: false,
      toneMapped: false,
    });
    // Low-poly is plenty: all the detail is per pixel. The dome stops 8° below the horizon: under
    // that the sky is plain fog color, which is exactly the renderer's clear color (scene.background),
    // so those pixels never run the shader at all.
    const geo = new THREE.SphereGeometry(100, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2 + (8 * Math.PI) / 180);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1e6; // last of the opaque pass (transparent objects still draw after)
    this.mesh.matrixAutoUpdate = false;
    game.scene.add(this.mesh);
    this._moonTmp = new THREE.Vector3();
  }

  /** Keep the dome centered on the camera (called after the camera moved this frame). */
  follow(camera) {
    this.mesh.position.copy(camera.position);
    this.mesh.updateMatrix();
  }

  /** Moon frame (right/up) and phase light from the sun and moon directions. */
  setMoon(moonDir, sunDir) {
    const u = this.uniforms;
    u.uMoonDir.value.copy(moonDir);
    // right = dir × worldUp, up = right × dir: a right-handed (right, up, -dir) frame as seen by the viewer
    const right = u.uMoonRight.value.copy(moonDir).cross(this._moonTmp.set(0, 1, 0));
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = u.uMoonUp.value.copy(right).cross(moonDir).normalize();
    // n.z points from the moon back toward the viewer (-moonDir)
    u.uMoonLight.value.set(sunDir.dot(right), sunDir.dot(up), -sunDir.dot(moonDir)).normalize();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.uniforms.uNoise.value.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * Tileable fbm value noise baked into an RGBA texture (R: 6 octaves from a 4-cell lattice,
 * G: 5 octaves from an 8-cell lattice). Values keep fbm's natural range (~0.1..0.9, mean ~0.48).
 */
function makeNoiseTexture(size) {
  let s = 1234567;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  const layer = (base, octaves) => {
    const out = new Float32Array(size * size);
    let amp = 0.5;
    for (let o = 0; o < octaves; o++) {
      const period = base << o;
      const lat = new Float32Array(period * period);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      const k = period / size;
      for (let y = 0; y < size; y++) {
        const fy = y * k;
        const iy = Math.floor(fy);
        let ty = fy - iy;
        ty = ty * ty * (3 - 2 * ty);
        const y0 = (iy % period) * period;
        const y1 = ((iy + 1) % period) * period;
        for (let x = 0; x < size; x++) {
          const fx = x * k;
          const ix = Math.floor(fx);
          let tx = fx - ix;
          tx = tx * tx * (3 - 2 * tx);
          const x0 = ix % period;
          const x1 = (ix + 1) % period;
          const a = lat[y0 + x0] + (lat[y0 + x1] - lat[y0 + x0]) * tx;
          const b = lat[y1 + x0] + (lat[y1 + x1] - lat[y1 + x0]) * tx;
          out[y * size + x] += amp * (a + (b - a) * ty);
        }
      }
      amp *= 0.5;
    }
    return out;
  };
  const r = layer(4, 6);
  const g = layer(8, 5);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.min(255, r[i] * 255);
    data[i * 4 + 1] = Math.min(255, g[i] * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
