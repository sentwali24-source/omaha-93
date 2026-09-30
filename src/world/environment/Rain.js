import * as THREE from 'three';

// Rain near the camera: camera-facing streaks (one instanced draw call) plus ground splashes (a
// second one). Everything animates in the vertex shader from uTime — the CPU only updates a handful
// of uniforms per frame. Drops live in a box that wraps around a point just ahead of the camera, so
// they stay world-anchored while the camera moves (no "rain glued to the lens").

const streakVS = /* glsl */ `
attribute vec2 corner;   // x: -1..1 across the streak, y: 0 head .. 1 tail
attribute vec4 seed;     // x, z in the box, fall phase, speed variation
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uFall;
uniform vec2 uWind;
uniform float uLen;
uniform float uWidth;
uniform float uPixel;
varying float vAlpha;
varying float vAlong;
void main() {
  float speed = uFall * (0.8 + 0.4 * seed.w);
  float y = fract(seed.z - uTime * speed / uBox.y) * uBox.y;       // height above the box floor
  float tFall = y / speed;                                           // time until it lands
  vec3 p;
  p.y = max(uCenter.y - uBox.y * 0.3, 0.0) + y;
  p.x = uCenter.x + mod(seed.x * uBox.x - uCenter.x - uWind.x * tFall, uBox.x) - uBox.x * 0.5;
  p.z = uCenter.z + mod(seed.y * uBox.z - uCenter.z - uWind.y * tFall, uBox.z) - uBox.z * 0.5;
  vec3 vel = normalize(vec3(uWind.x, -speed, uWind.y));
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(vel, toCam));
  float len = uLen * (0.7 + 0.6 * seed.w);
  float dist = length(p - cameraPosition);
  // at least ~1 px wide at any distance (uPixel = meters per pixel at 1 m); far drops get fainter instead
  float halfW = max(uWidth, dist * uPixel * 0.75);
  vec3 pos = p - vel * len * corner.y + side * halfW * corner.x;
  vAlpha = smoothstep(0.8, 3.0, dist) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, dist)) * (uWidth / halfW * 0.6 + 0.4);
  vAlong = corner.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

const streakFS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vAlong;
void main() {
  float a = vAlpha * uOpacity * (1.0 - vAlong) * smoothstep(0.0, 0.15, vAlong + 0.05);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

const splashVS = /* glsl */ `
attribute vec2 corner;
attribute vec4 seed;
uniform float uTime;
uniform vec3 uCenter;
uniform float uRadius;
varying vec2 vUv;
varying float vT;
varying float vFade;
float h11(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float period = 0.42 + 0.25 * seed.w;
  float cyc = uTime / period + seed.z;
  float idx = floor(cyc);
  vT = fract(cyc);
  // a new random spot every cycle, world-anchored on a grid that follows the camera
  float rx = h11(idx * 12.9898 + seed.x * 78.233);
  float rz = h11(idx * 39.3468 + seed.y * 11.135);
  vec2 cell = vec2(seed.x + rx, seed.y + rz);
  vec2 box = vec2(uRadius * 2.0);
  vec2 p = uCenter.xz + mod(cell * box - uCenter.xz, box) - box * 0.5;
  float size = 0.09 + 0.16 * vT;
  vUv = corner;
  vec3 pos = vec3(p.x + corner.x * size, 0.06 + 0.02 * seed.w, p.y + corner.y * size);
  vFade = 1.0 - smoothstep(uRadius * 0.55, uRadius, length(p - cameraPosition.xz));
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

const splashFS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vT;
varying float vFade;
void main() {
  float r = length(vUv);
  float ring = smoothstep(0.22, 0.0, abs(r - 0.7)) * (1.0 - vT);
  float a = ring * uOpacity * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

function quadGeometry(count, corners, indices) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  geo.setIndex(indices);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = 0;
  // positions are computed in the shader; give three a bounding sphere so it never culls wrongly
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return geo;
}

export class Rain {
  constructor(game) {
    this.game = game;
    const detail = game.quality.detail ?? 1;
    this.maxDrops = [650, 1300, 2200][detail] ?? 1300;
    this.maxSplashes = [120, 220, 340][detail] ?? 220;

    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(34, 20, 34) },
      uFall: { value: 13 },
      uWind: { value: new THREE.Vector2(1.2, 0.6) },
      uLen: { value: 0.75 },
      uWidth: { value: 0.008 },
      uPixel: { value: 0.0016 },
      uColor: { value: new THREE.Vector3(0.7, 0.72, 0.78) }, // display-space (sRGB), no tone mapping
      uOpacity: { value: 0.35 },
    };
    const streakGeo = quadGeometry(this.maxDrops, [-1, 0, 1, 0, 1, 1, -1, 1], [0, 1, 2, 0, 2, 3]);
    this.streakMat = new THREE.ShaderMaterial({
      name: 'RainStreaks',
      uniforms: this.uniforms,
      vertexShader: streakVS,
      fragmentShader: streakFS,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.streaks = new THREE.Mesh(streakGeo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 10;
    this.streaks.visible = false;

    this.splashUniforms = {
      uTime: this.uniforms.uTime,
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 11 },
      uColor: { value: new THREE.Vector3(0.7, 0.72, 0.78) },
      uOpacity: { value: 0.4 },
    };
    const splashGeo = quadGeometry(this.maxSplashes, [-1, -1, 1, -1, 1, 1, -1, 1], [0, 2, 1, 0, 3, 2]);
    this.splashMat = new THREE.ShaderMaterial({
      name: 'RainSplashes',
      uniforms: this.splashUniforms,
      vertexShader: splashVS,
      fragmentShader: splashFS,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.splashes = new THREE.Mesh(splashGeo, this.splashMat);
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 9;
    this.splashes.visible = false;

    game.scene.add(this.streaks, this.splashes);
    this._fwd = new THREE.Vector3();
  }

  /**
   * intensity 0..1, color = lit rain color (sRGB array), wind = {x, z} m/s.
   */
  update(dt, camera, intensity, color, wind, time) {
    const on = intensity > 0.02;
    this.streaks.visible = on;
    this.splashes.visible = on && camera.position.y < 40;
    if (!on) return;
    const u = this.uniforms;
    u.uTime.value = time;
    // the box sits a little ahead of the camera: that is where drops are visible
    camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() > 1e-6) this._fwd.normalize();
    u.uCenter.value.set(camera.position.x + this._fwd.x * 9, camera.position.y, camera.position.z + this._fwd.z * 9);
    u.uWind.value.set(wind.x, wind.z);
    const h = this.game.renderer?.domElement?.height || 720;
    u.uPixel.value = (2 * Math.tan(((camera.fov || 60) * Math.PI) / 360)) / h;
    u.uColor.value.set(color[0], color[1], color[2]);
    u.uOpacity.value = 0.22 + 0.26 * intensity;
    u.uLen.value = 0.55 + 0.45 * intensity;
    this.streaks.geometry.instanceCount = Math.floor(this.maxDrops * Math.min(1, intensity * 1.1));

    const s = this.splashUniforms;
    s.uCenter.value.set(camera.position.x + this._fwd.x * 6, 0, camera.position.z + this._fwd.z * 6);
    s.uColor.value.copy(u.uColor.value);
    s.uOpacity.value = 0.25 + 0.3 * intensity;
    this.splashes.geometry.instanceCount = Math.floor(this.maxSplashes * intensity);
  }

  dispose() {
    for (const m of [this.streaks, this.splashes]) {
      m.geometry.dispose();
      m.material.dispose();
      m.removeFromParent();
    }
  }
}
