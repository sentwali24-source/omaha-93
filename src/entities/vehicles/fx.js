import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { getEnvCube, updateMaterialsForNight } from './materials.js';

// Shared per-game vehicle render systems — a handful of draw calls for ALL cars:
//   wheels   one InstancedMesh for every wheel of every car (spin + steer matrices per frame)
//   glows    one instanced additive billboard system: head/tail/brake/turn/reverse lamps,
//            police light bars, headlight pools on the road at night
//   smoke    one instanced particle system: damage smoke, totaled black smoke, tire smoke
//   skids    pooled skid-mark quads (ring buffer, multiply blended, fading)
//   blobs    soft contact shadows under every car (multiply blended)
//
// Per-frame buffers are compacted: fx.beginFrame() resets the counters and every Vehicle pushes
// what it needs during its update. Paused frames keep last frame's buffers.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _sphere = new THREE.Sphere();

export function getVehicleFx(game) {
  if (!game._vehicleFx) game._vehicleFx = new VehicleFx(game);
  return game._vehicleFx;
}

// ------------------------------------------------------------------ wheel geometry
// Unit wheel: radius 1, width 1 along X, outer face at +X. Parts (attribute `wpart`):
// 0 rubber, 1 sidewall band (whitewall), 2 rim, 3 spokes (hidden on hubcap styles), 4 center cap.
function buildWheelGeometry() {
  const b = new GeoBuilder();
  const N = 12;
  const part = (k) => ({ slot: k });
  b.cylinder('x', 0, 0, 0, 1, 1, N, part(0), null);
  const ring = (x, r0, r1, k, dir) => {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      b.quad([x, Math.cos(a0) * r0, Math.sin(a0) * r0], [x, Math.cos(a1) * r0, Math.sin(a1) * r0], [x, Math.cos(a1) * r1, Math.sin(a1) * r1], [x, Math.cos(a0) * r1, Math.sin(a0) * r1], part(k), [dir, 0, 0]);
    }
  };
  ring(0.5, 1.0, 0.86, 0, 1);
  ring(0.5, 0.86, 0.73, 1, 1);
  ring(0.5, 0.73, 0.64, 0, 1);
  ring(-0.5, 1.0, 0.45, 0, -1);
  // rim barrel lip (inside faces, seen from outside)
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const r = 0.64;
    b.quad([0.5, Math.cos(a0) * r, Math.sin(a0) * r], [0.5, Math.cos(a1) * r, Math.sin(a1) * r], [0.38, Math.cos(a1) * r, Math.sin(a1) * r], [0.38, Math.cos(a0) * r, Math.sin(a0) * r], part(2), [0, -Math.cos(am), -Math.sin(am)]);
  }
  // rim face
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    b.tri([0.38, 0, 0], [0.38, Math.cos(a0) * 0.64, Math.sin(a0) * 0.64], [0.38, Math.cos(a1) * 0.64, Math.sin(a1) * 0.64], part(2), [1, 0, 0]);
  }
  // laced spokes: flat blades twisted around the hub
  const K = 12;
  for (let i = 0; i < K; i++) {
    const a = (i / K) * Math.PI * 2;
    const a2 = a + (i % 2 ? 0.42 : -0.42);
    const p0 = [0.44, Math.cos(a) * 0.13, Math.sin(a) * 0.13];
    const p1 = [0.4, Math.cos(a2) * 0.62, Math.sin(a2) * 0.62];
    const t = [0, -Math.sin(a), Math.cos(a)];
    const w = 0.028;
    b.quad([p0[0], p0[1] - t[1] * w, p0[2] - t[2] * w], [p0[0], p0[1] + t[1] * w, p0[2] + t[2] * w], [p1[0], p1[1] + t[1] * w, p1[2] + t[2] * w], [p1[0], p1[1] - t[1] * w, p1[2] - t[2] * w], part(3), [1, 0, 0]);
    b.quad([p0[0] + 0.02, p0[1], p0[2]], [p0[0] - 0.02, p0[1], p0[2]], [p1[0] - 0.02, p1[1], p1[2]], [p1[0] + 0.02, p1[1], p1[2]], part(3), [0, Math.cos(a + 0.8), Math.sin(a + 0.8)]);
  }
  // center cap + two-eared knock-off spinner
  b.cylinder('x', 0.44, 0, 0, 0.17, 0.14, 8, part(4), part(4));
  b.box(0.5, 0, 0, 0.03, 0.46, 0.06, part(4));
  const built = b.build();
  const g = built.geometry;
  const wpart = new Float32Array(built.slot.length);
  for (let i = 0; i < wpart.length; i++) wpart[i] = built.slot[i];
  g.setAttribute('wpart', new THREE.BufferAttribute(wpart, 1));
  g.deleteAttribute('uv');
  return g;
}

function wheelMaterial() {
  const m = new THREE.MeshPhongMaterial({ color: '#ffffff', specular: "#777777", shininess: 60, envMap: getEnvCube(), combine: THREE.MixOperation, reflectivity: 0.55 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float wpart;
attribute vec4 iRim;
attribute vec4 iSpoke;
varying vec3 vWCol;
varying float vWShine;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 rubber = vec3(0.028);
if (wpart < 0.5) { vWCol = rubber; vWShine = 0.04; }
else if (wpart < 1.5) { vWCol = mix(rubber, vec3(0.82, 0.8, 0.76), iRim.w); vWShine = 0.08; }
else if (wpart < 2.5) { vWCol = iRim.rgb; vWShine = 0.75; }
else if (wpart < 3.5) { vWCol = iSpoke.rgb; vWShine = 0.95; if (iSpoke.w < 0.5) transformed.x -= 0.22; }
else { vWCol = mix(iSpoke.rgb, vec3(0.85), 0.35); vWShine = 1.0; }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWCol;\nvarying float vWShine;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vWCol;')
      .replace('#include <specularmap_fragment>', 'float specularStrength = vWShine;');
  };
  m.customProgramCacheKey = () => 'vehicle-wheel-v1';
  return m;
}

// ------------------------------------------------------------------ billboard shaders
const GLOW_VS = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iParams; // sx, sy, mode (0 directional lamp, 1 omni, 2 ground pool), heading
attribute vec3 iColor;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
varying vec3 vColor;
varying float vMode;
void main() {
  vUv = position.xy;
  vColor = iColor;
  vMode = iParams.z;
  vec4 mv;
  if (iParams.z > 1.5) {
    float c = cos(iParams.w);
    float s = sin(iParams.w);
    vec2 p = position.xy * iParams.xy;
    vec3 wp = iPos + vec3(p.x * c - p.y * s, 0.0, -p.x * s - p.y * c);
    mv = modelViewMatrix * vec4(wp, 1.0);
  } else {
    mv = modelViewMatrix * vec4(iPos, 1.0);
    if (iParams.z < 0.5) {
      vec3 toCam = cameraPosition - iPos;
      vec2 f = vec2(-sin(iParams.w), -cos(iParams.w));
      float d = dot(f, normalize(toCam.xz + vec2(1e-4)));
      vColor *= 0.06 + 0.94 * smoothstep(-0.2, 0.75, d);
    }
    mv.xyz += normalize(-mv.xyz) * 0.4;
    mv.xy += position.xy * iParams.xy;
  }
  vColor *= 1.0 - smoothstep(uNear, uFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vMode;
void main() {
  float r = length(vUv);
  if (r >= 1.0) discard;
  float halo = 1.0 - r;
  float a;
  if (vMode > 1.5) {
    a = halo * halo * (0.6 + 0.4 * smoothstep(-1.0, 0.4, vUv.y));
  } else {
    a = halo * halo * 0.75 + smoothstep(0.4, 0.0, r) * 0.9;
  }
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

const SMOKE_VS = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iParams; // size, alpha, rotation, unused
attribute vec3 iColor;
uniform float uFar;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float c = cos(iParams.z);
  float s = sin(iParams.z);
  vUv = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  vColor = iColor;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vAlpha = iParams.y * (1.0 - smoothstep(uFar * 0.5, uFar, -mv.z));
  mv.xy += position.xy * iParams.x;
  gl_Position = projectionMatrix * mv;
}`;

const SMOKE_FS = /* glsl */ `
uniform float uLight;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(vUv);
  if (r >= 1.0) discard;
  // lumpy puff: a few lobes around the rim
  float ang = atan(vUv.y, vUv.x);
  float lobes = 0.82 + 0.18 * sin(ang * 5.0);
  float a = smoothstep(lobes, lobes * 0.35, r) * vAlpha;
  vec3 col = vColor * (0.75 + 0.25 * (vUv.y * 0.5 + 0.5)) * uLight;
  gl_FragColor = vec4(col, a);
}`;

function quadGeometry(cap, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size] of attrs) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
  }
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

function softTexture(kind) {
  const c = document.createElement('canvas');
  const W = kind === 'skid' ? 32 : 64;
  const H = 64;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5;
      const v = (y + 0.5) / H - 0.5;
      let a;
      if (kind === 'skid') {
        a = Math.max(0, 1 - Math.pow(Math.abs(u) * 2, 3));
        a *= 0.75 + 0.25 * Math.sin(x * 2.1 + Math.sin(y * 0.7) * 1.5);
      } else {
        // rounded-rect contact shadow
        const dx = Math.max(0, Math.abs(u) * 2 - 0.55) / 0.45;
        const dy = Math.max(0, Math.abs(v) * 2 - 0.62) / 0.38;
        const d = Math.min(1, Math.hypot(dx, dy));
        a = (1 - d) * (1 - d) * (0.55 + 0.45 * (1 - Math.min(1, Math.hypot(u * 2, v * 2))));
      }
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ system
export class VehicleFx {
  constructor(game) {
    this.game = game;
    const q = game.quality || {};
    const det = q.detail ?? 1;
    this.frame = -1;
    this.night = 0;
    this.frustum = new THREE.Frustum();
    this._pv = new THREE.Matrix4();

    // --- wheels
    this.wheelCap = 768;
    this.wheelGeo = buildWheelGeometry();
    this.wheelMat = wheelMaterial();
    this._makeWheelMesh(this.wheelCap);

    // --- glows
    this.glowCap = 1400;
    this.glowGeo = quadGeometry(this.glowCap, [
      ['iPos', 3],
      ['iParams', 4],
      ['iColor', 3],
    ]);
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VS,
      fragmentShader: GLOW_FS,
      uniforms: { uNear: { value: 160 }, uFar: { value: 520 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glows = new THREE.Mesh(this.glowGeo, this.glowMat);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 5;
    this.glows.name = 'vehicle-glows';
    this.glowCount = 0;

    // --- smoke particles
    this.smokeCap = det === 0 ? 90 : det === 1 ? 160 : 240;
    this.smokeGeo = quadGeometry(this.smokeCap, [
      ['iPos', 3],
      ['iParams', 4],
      ['iColor', 3],
    ]);
    this.smokeMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VS,
      fragmentShader: SMOKE_FS,
      uniforms: { uFar: { value: 320 }, uLight: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    this.smoke = new THREE.Mesh(this.smokeGeo, this.smokeMat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 6;
    this.smoke.name = 'vehicle-smoke';
    const P = this.smokeCap;
    this.pPos = new Float32Array(P * 3);
    this.pVel = new Float32Array(P * 3);
    this.pAge = new Float32Array(P);
    this.pLife = new Float32Array(P);
    this.pSize = new Float32Array(P * 2);
    this.pAlpha = new Float32Array(P);
    this.pGray = new Float32Array(P);
    this.pRot = new Float32Array(P);
    this.pAlive = 0; // live particles are packed at [0, pAlive)

    // --- skid marks (ring buffer)
    this.skidCap = det === 0 ? 140 : det === 1 ? 260 : 420;
    const skidGeo = new THREE.PlaneGeometry(1, 1);
    skidGeo.rotateX(-Math.PI / 2);
    this.skidMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: softTexture('skid'),
      transparent: true,
      depthWrite: false,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skids = new THREE.InstancedMesh(skidGeo, this.skidMat, this.skidCap);
    this.skids.frustumCulled = false;
    this.skids.count = 0;
    this.skids.renderOrder = 2;
    this.skids.name = 'vehicle-skids';
    this.skids.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.skidCap * 3), 3);
    this.skidBorn = new Float32Array(this.skidCap);
    this.skidHead = 0;
    this.skidTotal = 0;
    this._skidFadeT = 0;

    // --- contact shadow blobs
    this.blobCap = 220;
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({
      color: '#262626',
      map: softTexture('blob'),
      transparent: true,
      depthWrite: false,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.blobs = new THREE.InstancedMesh(blobGeo, this.blobMat, this.blobCap);
    this.blobs.frustumCulled = false;
    this.blobs.count = 0;
    this.blobs.renderOrder = 1;
    this.blobs.name = 'vehicle-shadows';
    this.blobCount = 0;
    this.glowCount = 0;

    this.group = new THREE.Group();
    this.group.name = 'vehicle-fx';
    this.group.add(this.wheels, this.blobs, this.skids, this.glows, this.smoke);
    game.scene.add(this.group);
    this._dirty = { wheels: false, glows: false, blobs: false };
  }

  _makeWheelMesh(cap) {
    const old = this.wheels;
    const mesh = new THREE.InstancedMesh(this.wheelGeo, this.wheelMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const rim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const spoke = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    rim.setUsage(THREE.DynamicDrawUsage);
    spoke.setUsage(THREE.DynamicDrawUsage);
    // the geometry is shared: per-instance attributes live on a clone so capacity can grow
    const g = this.wheelGeo.clone();
    g.setAttribute('iRim', rim);
    g.setAttribute('iSpoke', spoke);
    mesh.geometry = g;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = !!this.game.quality?.shadows;
    mesh.name = 'vehicle-wheels';
    this.wheelRim = rim;
    this.wheelSpoke = spoke;
    this.wheelCap = cap;
    this.wheels = mesh;
    this.wheelCount = 0;
    if (old && old.parent) {
      old.parent.add(mesh);
      old.parent.remove(old);
      old.geometry.dispose();
    }
  }

  /** Reset per-frame buffers (idempotent within a frame). dt advances particles. */
  beginFrame(dt) {
    const game = this.game;
    if (this.frame === game.time.frame) return;
    this.frame = game.time.frame;
    this.wheelCount = 0;
    this.glowCount = 0;
    this.blobCount = 0;
    this.wheels.count = 0;
    this.glowGeo.instanceCount = 0;
    this.blobs.count = 0;
    this._dirty.wheels = this._dirty.glows = this._dirty.blobs = false;
    const n = game.environment?.night;
    this.night = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    const weather = game.environment?.weather;
    this.gloom = weather === 'rain' ? 0.45 : weather === 'overcast' ? 0.2 : 0;
    updateMaterialsForNight(this.night);
    this.smokeMat.uniforms.uLight.value = 1 - 0.7 * this.night;
    const cam = game.camera;
    this.camX = cam.position.x;
    this.camY = cam.position.y;
    this.camZ = cam.position.z;
    this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pv);
    this.farSq = (cam.far + 20) * (cam.far + 20);
    const q = game.quality || {};
    this.glowMat.uniforms.uFar.value = Math.max(260, (q.fogFar || 520) * 0.95);
    this.glowMat.uniforms.uNear.value = Math.max(90, (q.fogNear || 140) * 1.2);
    this.smokeMat.uniforms.uFar.value = Math.max(160, (q.fogFar || 520) * 0.6);
    this._updateParticles(Math.min(dt || 0, 0.05));
    this._skidFadeT += dt || 0;
    if (this._skidFadeT > 0.5) {
      this._skidFadeT = 0;
      this._fadeSkids();
    }
  }

  /** Bounding sphere visibility vs. last frame's camera frustum. */
  isVisible(x, y, z, r) {
    const dx = x - this.camX;
    const dz = z - this.camZ;
    if (dx * dx + dz * dz > this.farSq) return false;
    _sphere.center.set(x, y, z);
    _sphere.radius = r;
    return this.frustum.intersectsSphere(_sphere);
  }

  distSqToCamera(x, z) {
    const dx = x - this.camX;
    const dz = z - this.camZ;
    return dx * dx + dz * dz;
  }

  // ---------------------------------------------------------------- wheels
  /** Push one wheel. m = world matrix (Matrix4). style = WHEEL_STYLES entry (with cached colors). */
  pushWheel(m, style) {
    if (this.wheelCount >= this.wheelCap) {
      if (this.wheelCap >= 4096) return;
      this._growWheels();
    }
    const i = this.wheelCount++;
    m.toArray(this.wheels.instanceMatrix.array, i * 16);
    const r = this.wheelRim.array;
    const s = this.wheelSpoke.array;
    r[i * 4] = style._rim.r;
    r[i * 4 + 1] = style._rim.g;
    r[i * 4 + 2] = style._rim.b;
    r[i * 4 + 3] = style.whitewall ? 1 : 0;
    s[i * 4] = style._spoke.r;
    s[i * 4 + 1] = style._spoke.g;
    s[i * 4 + 2] = style._spoke.b;
    s[i * 4 + 3] = style.spokes ? 1 : 0;
    this.wheels.count = this.wheelCount;
    if (!this._dirty.wheels) {
      this._dirty.wheels = true;
      this.wheels.instanceMatrix.needsUpdate = true;
      this.wheelRim.needsUpdate = true;
      this.wheelSpoke.needsUpdate = true;
    }
  }

  _growWheels() {
    const oldM = this.wheels.instanceMatrix.array;
    const oldR = this.wheelRim.array;
    const oldS = this.wheelSpoke.array;
    const n = this.wheelCount;
    this._makeWheelMesh(this.wheelCap * 2);
    this.wheels.instanceMatrix.array.set(oldM.subarray(0, n * 16));
    this.wheelRim.array.set(oldR.subarray(0, n * 4));
    this.wheelSpoke.array.set(oldS.subarray(0, n * 4));
    this.wheelCount = n;
    this.wheels.count = n;
    this._dirty.wheels = false;
  }

  // ---------------------------------------------------------------- glows
  /**
   * mode 0 = directional lamp (heading = lamp facing), 1 = omni flare, 2 = ground pool
   * (sx = half width, sy = half length, heading = pool direction). Colors are additive (0..~2).
   */
  pushGlow(x, y, z, sx, sy, mode, heading, r, g, b) {
    if (this.glowCount >= this.glowCap) return;
    const i = this.glowCount++;
    const G = this.glowGeo.attributes;
    const pos = G.iPos.array;
    const par = G.iParams.array;
    const col = G.iColor.array;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    par[i * 4] = sx;
    par[i * 4 + 1] = sy;
    par[i * 4 + 2] = mode;
    par[i * 4 + 3] = heading;
    col[i * 3] = r;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = b;
    this.glowGeo.instanceCount = this.glowCount;
    if (!this._dirty.glows) {
      this._dirty.glows = true;
      G.iPos.needsUpdate = true;
      G.iParams.needsUpdate = true;
      G.iColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- shadow blobs
  pushBlob(x, y, z, heading, w, l) {
    if (this.blobCount >= this.blobCap) return;
    const i = this.blobCount++;
    _e.set(0, heading, 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(w, 1, l);
    _m.compose(_p, _q, _s);
    _m.toArray(this.blobs.instanceMatrix.array, i * 16);
    this.blobs.count = this.blobCount;
    if (!this._dirty.blobs) {
      this._dirty.blobs = true;
      this.blobs.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- skids
  addSkid(x0, z0, x1, z1, width) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 4) return;
    const i = this.skidHead;
    this.skidHead = (this.skidHead + 1) % this.skidCap;
    this.skidTotal++;
    _e.set(0, Math.atan2(dx, dz), 0);
    _q.setFromEuler(_e);
    _p.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
    _s.set(width, 1, len + 0.06);
    _m.compose(_p, _q, _s);
    _m.toArray(this.skids.instanceMatrix.array, i * 16);
    this.skids.instanceMatrix.needsUpdate = true;
    const c = this.skids.instanceColor.array;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0.16;
    this.skids.instanceColor.needsUpdate = true;
    this.skidBorn[i] = this.game.time.elapsed;
    this.skids.count = Math.min(this.skidTotal, this.skidCap);
  }

  _fadeSkids() {
    const n = this.skids.count;
    if (!n) return;
    const now = this.game.time.elapsed;
    const c = this.skids.instanceColor.array;
    const LIFE = 28;
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (now - this.skidBorn[i]) / LIFE));
      const v = 0.16 + 0.84 * t * t;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
    }
    this.skids.instanceColor.needsUpdate = true;
  }

  clearSkids() {
    this.skids.count = 0;
    this.skidTotal = 0;
    this.skidHead = 0;
  }

  // ---------------------------------------------------------------- smoke
  /** gray: 0 = black soot .. 1 = white steam. */
  emitSmoke(x, y, z, vx, vy, vz, size0, size1, life, gray, alpha) {
    let i = this.pAlive;
    if (i >= this.smokeCap) {
      // recycle the oldest-looking slot (cheap: random)
      i = Math.floor(Math.random() * this.smokeCap);
    } else {
      this.pAlive++;
    }
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    this.pAge[i] = 0;
    this.pLife[i] = life;
    this.pSize[i * 2] = size0;
    this.pSize[i * 2 + 1] = size1;
    this.pGray[i] = gray;
    this.pAlpha[i] = alpha;
    this.pRot[i] = Math.random() * Math.PI * 2;
  }

  _updateParticles(dt) {
    const G = this.smokeGeo.attributes;
    const pos = G.iPos.array;
    const par = G.iParams.array;
    const col = G.iColor.array;
    let n = this.pAlive;
    let i = 0;
    const drag = Math.exp(-1.6 * dt);
    while (i < n) {
      this.pAge[i] += dt;
      if (this.pAge[i] >= this.pLife[i]) {
        // swap-remove with the last live particle
        n--;
        this._copyParticle(n, i);
        continue;
      }
      const k = i * 3;
      this.pVel[k] *= drag;
      this.pVel[k + 2] *= drag;
      this.pVel[k + 1] = this.pVel[k + 1] * drag + 0.9 * dt;
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      i++;
    }
    this.pAlive = n;
    for (let j = 0; j < n; j++) {
      const t = this.pAge[j] / this.pLife[j];
      pos[j * 3] = this.pPos[j * 3];
      pos[j * 3 + 1] = this.pPos[j * 3 + 1];
      pos[j * 3 + 2] = this.pPos[j * 3 + 2];
      par[j * 4] = this.pSize[j * 2] + (this.pSize[j * 2 + 1] - this.pSize[j * 2]) * Math.sqrt(t);
      par[j * 4 + 1] = this.pAlpha[j] * Math.min(1, t * 6) * (1 - t) * (1 - t);
      par[j * 4 + 2] = this.pRot[j] + t * 1.2;
      const g = this.pGray[j];
      col[j * 3] = 0.08 + g * 0.72;
      col[j * 3 + 1] = 0.08 + g * 0.72;
      col[j * 3 + 2] = 0.085 + g * 0.74;
    }
    this.smokeGeo.instanceCount = n;
    if (n) {
      G.iPos.needsUpdate = true;
      G.iParams.needsUpdate = true;
      G.iColor.needsUpdate = true;
    }
  }

  _copyParticle(from, to) {
    if (from === to) return;
    for (let c = 0; c < 3; c++) {
      this.pPos[to * 3 + c] = this.pPos[from * 3 + c];
      this.pVel[to * 3 + c] = this.pVel[from * 3 + c];
    }
    this.pAge[to] = this.pAge[from];
    this.pLife[to] = this.pLife[from];
    this.pSize[to * 2] = this.pSize[from * 2];
    this.pSize[to * 2 + 1] = this.pSize[from * 2 + 1];
    this.pAlpha[to] = this.pAlpha[from];
    this.pGray[to] = this.pGray[from];
    this.pRot[to] = this.pRot[from];
  }

  clearParticles() {
    this.pAlive = 0;
    this.smokeGeo.instanceCount = 0;
  }
}

/** Resolve a wheel style's colors once (linear). */
export function prepareWheelStyle(style) {
  if (!style._rim) {
    style._rim = new THREE.Color(style.rim);
    style._spoke = new THREE.Color(style.spoke);
  }
  return style;
}

