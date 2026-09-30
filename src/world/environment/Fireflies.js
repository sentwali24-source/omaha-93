import * as THREE from 'three';
import { damp } from '../../core/math.js';

// Fireflies on summer nights in the neighborhoods and parks: one Points draw call, animated
// entirely in the vertex shader around the focus. Hidden by day, in the rain and downtown.

const VS = /* glsl */ `
attribute vec4 seed;
uniform float uTime;
uniform vec3 uCenter;
uniform float uBox;
uniform float uScale;
varying float vGlow;
void main() {
  float t = uTime * (0.25 + 0.2 * seed.w);
  vec3 base = vec3(seed.x, 0.0, seed.y) * uBox;
  vec3 p;
  p.x = uCenter.x + mod(base.x - uCenter.x, uBox) - uBox * 0.5 + sin(t + seed.z * 20.0) * 1.6;
  p.z = uCenter.z + mod(base.z - uCenter.z, uBox) - uBox * 0.5 + cos(t * 0.8 + seed.w * 17.0) * 1.6;
  p.y = 0.5 + seed.z * 2.4 + sin(t * 1.3 + seed.x * 30.0) * 0.4;
  // slow, lazy blinks: mostly dark, a soft pulse every few seconds
  float blink = sin(uTime * (0.7 + seed.w * 0.9) + seed.z * 40.0);
  vGlow = pow(max(blink, 0.0), 6.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = length(p.xz - uCenter.xz);
  vGlow *= 1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d);
  gl_PointSize = uScale * (0.4 + vGlow) / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}
`;

const FS = /* glsl */ `
uniform float uOpacity;
varying float vGlow;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a = smoothstep(0.5, 0.0, r);
  a = a * a * vGlow * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.86, 1.0, 0.42) * a, a);
}
`;

// districts with lawns, trees and quiet streets
const FIREFLY_DISTRICTS = new Set(['north', 'midtown', 'riverfront']);

export class Fireflies {
  constructor(game) {
    this.game = game;
    const detail = game.quality.detail ?? 1;
    const count = [40, 70, 110][detail] ?? 70;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: 44 },
      uScale: { value: 60 },
      uOpacity: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'Fireflies',
      uniforms: this.uniforms,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 8;
    game.scene.add(this.points);
    this.count = count;
    this.visibleCount = 0;
    this._amount = 0;
    this._districtOk = true;
    this._check = 0;
  }

  update(dt, env) {
    const game = this.game;
    const f = game.focus;
    if (!f) return;
    this._check -= dt;
    if (this._check <= 0) {
      this._check = 1;
      const d = game.layout?.districtAt?.(f.x, f.z);
      this._districtOk = !d || FIREFLY_DISTRICTS.has(d.id);
    }
    const want = env.night > 0.7 && !env.raining && env.rainIntensity < 0.05 && this._districtOk && game.camera.position.y < 60 ? 1 : 0;
    this._amount = damp(this._amount, want, 0.6, dt);
    const on = this._amount > 0.02;
    this.points.visible = on;
    this.visibleCount = on ? this.count : 0;
    if (!on) return;
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uCenter.value.set(f.x, 0, f.z);
    u.uOpacity.value = this._amount;
    u.uScale.value = 26 * (game.renderer?.getPixelRatio?.() || 1) * (window.innerHeight / 720 + 0.4);
  }
}
