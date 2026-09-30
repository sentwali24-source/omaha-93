import * as THREE from 'three';

// Cheap pooled particle effects: hit sparks / impact flashes (additive) and dust puffs (alpha).
// Two THREE.Points objects with a tiny shader: 2 draw calls total, and only while particles live.
// No allocations per frame; spawn calls just claim slots in preallocated arrays.
//
//   fx.sparks(x, y, z, count = 8, color = '#ffd27a', dir = null)   quick bright streaks
//   fx.flash(x, y, z, size = 0.55, color = '#fff4d0')              one big short impact star
//   fx.dust(x, y, z, count = 6, spread = 0.35, color = '#b3aa98')  soft rising puffs
//   fx.update(dt) / fx.clear()

const VERT = /* glsl */ `
attribute float size;
attribute vec4 pcolor;
uniform float uScale;
varying vec4 vColor;
#include <fog_pars_vertex>
void main() {
  vColor = pcolor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, size * uScale / max(0.1, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uSoft;
varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = (1.0 - smoothstep(uSoft, 1.0, d)) * vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <fog_fragment>
}`;

const _c = new THREE.Color();
const _rgb = { r: 0, g: 0, b: 0 };

class Pool {
  constructor(capacity, { additive, fog, soft }) {
    this.cap = capacity;
    this.n = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.a0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.rgb = new Float32Array(capacity * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('size', this.aSize);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 }, uSoft: { value: soft } }]),
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 5;
    this.geometry = g;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, hex, alpha, grav, drag) {
    let i = this.n;
    if (i >= this.cap) {
      // pool full: recycle the oldest-looking slot (lowest remaining life)
      i = 0;
      for (let k = 1; k < this.cap; k++) if (this.life[k] < this.life[i]) i = k;
    } else {
      this.n++;
    }
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = alpha;
    this.grav[i] = grav;
    this.drag[i] = drag;
    // raw sRGB components: the shader writes them straight to the (sRGB) framebuffer
    _c.set(hex).getRGB(_rgb, THREE.SRGBColorSpace);
    this.rgb[i * 3] = _rgb.r;
    this.rgb[i * 3 + 1] = _rgb.g;
    this.rgb[i * 3 + 2] = _rgb.b;
  }

  _copy(from, to) {
    for (let a = 0; a < 3; a++) {
      this.pos[to * 3 + a] = this.pos[from * 3 + a];
      this.vel[to * 3 + a] = this.vel[from * 3 + a];
      this.rgb[to * 3 + a] = this.rgb[from * 3 + a];
    }
    this.life[to] = this.life[from];
    this.max[to] = this.max[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
  }

  update(dt, additive) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        if (i !== this.n) this._copy(this.n, i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      const o = i * 3;
      this.vel[o] *= k;
      this.vel[o + 1] = this.vel[o + 1] * k - this.grav[i] * dt;
      this.vel[o + 2] *= k;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < 0.02) {
        this.pos[o + 1] = 0.02;
        this.vel[o + 1] = Math.abs(this.vel[o + 1]) * 0.3;
      }
      const t = 1 - this.life[i] / this.max[i]; // 0 → 1 over the particle's life
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = additive ? (1 - t) * (1 - t) : (1 - t) * Math.min(1, t * 6);
      const c = i * 4;
      if (additive) {
        // additive: fade by darkening the color
        this.col[c] = this.rgb[o] * fade;
        this.col[c + 1] = this.rgb[o + 1] * fade;
        this.col[c + 2] = this.rgb[o + 2] * fade;
        this.col[c + 3] = 1;
      } else {
        this.col[c] = this.rgb[o];
        this.col[c + 1] = this.rgb[o + 1];
        this.col[c + 2] = this.rgb[o + 2];
        this.col[c + 3] = this.a0[i] * fade;
      }
      i++;
    }
    this.geometry.setDrawRange(0, this.n);
    this.points.visible = this.n > 0;
    if (this.n > 0) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true;
    }
  }
}

export class Fx {
  constructor(game) {
    this.game = game;
    const detail = game.quality?.detail ?? 1;
    this.sparkPool = new Pool(detail === 0 ? 96 : 160, { additive: true, fog: false, soft: 0.15 });
    this.dustPool = new Pool(detail === 0 ? 48 : 96, { additive: false, fog: true, soft: 0.2 });
    this.detail = detail;
    game.scene?.add(this.sparkPool.points, this.dustPool.points);
  }

  sparks(x, y, z, count = 8, color = '#ffd27a', dir = null) {
    const n = this.detail === 0 ? Math.ceil(count * 0.6) : count;
    for (let i = 0; i < n; i++) {
      let vx = (Math.random() - 0.5) * 5;
      let vy = Math.random() * 3.5 + 0.5;
      let vz = (Math.random() - 0.5) * 5;
      if (dir) {
        vx += dir.x * 3.5;
        vz += dir.z * 3.5;
      }
      this.sparkPool.spawn(x, y, z, vx, vy, vz, 0.14 + Math.random() * 0.16, 0.09, 0.02, color, 1, 9, 3);
    }
  }

  flash(x, y, z, size = 0.55, color = '#fff4d0') {
    this.sparkPool.spawn(x, y, z, 0, 0, 0, 0.085, size, size * 1.35, color, 1, 0, 0);
  }

  dust(x, y, z, count = 6, spread = 0.35, color = '#b3aa98') {
    const n = this.detail === 0 ? Math.ceil(count * 0.6) : count;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const vx = Math.cos(a) * (0.6 + Math.random() * 0.9);
      const vz = Math.sin(a) * (0.6 + Math.random() * 0.9);
      this.dustPool.spawn(x + Math.cos(a) * r, y + Math.random() * 0.1, z + Math.sin(a) * r, vx, 0.25 + Math.random() * 0.35, vz, 0.55 + Math.random() * 0.45, 0.22, 0.75, color, 0.42, -0.15, 2.2);
    }
  }

  clear() {
    this.sparkPool.n = 0;
    this.dustPool.n = 0;
    this.sparkPool.update(0, true);
    this.dustPool.update(0, false);
  }

  update(dt) {
    // world-size → pixel scale for gl_PointSize (drawing-buffer pixels)
    const game = this.game;
    const cam = game.camera;
    if (cam && game.renderer) {
      const h = game.renderer.domElement.height || 720;
      const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      this.sparkPool.material.uniforms.uScale.value = scale;
      this.dustPool.material.uniforms.uScale.value = scale;
    }
    if (this.sparkPool.n || this.sparkPool.points.visible) this.sparkPool.update(dt, true);
    if (this.dustPool.n || this.dustPool.points.visible) this.dustPool.update(dt, false);
  }
}
