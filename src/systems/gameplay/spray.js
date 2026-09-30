import * as THREE from 'three';

// Spray-paint mist: a small fixed pool of soft points (ONE draw call, no per-frame allocation).
// Tagging emits from the can toward the wall while the player holds "Tag wall".
//
//   const spray = new SprayParticles(game);
//   spray.emit(from {x,y,z}, to {x,y,z}, color, count)
//   spray.update(dt)

const POOL = 160;

const VERT = /* glsl */ `
attribute float aLife;
attribute vec3 aColor;
uniform float uScale;
varying float vLife;
varying vec3 vColor;
void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = mix(0.5, 0.1, aLife);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying float vLife;
varying vec3 vColor;
void main() {
  if (vLife <= 0.0) discard;
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  float a = (1.0 - r) * min(1.0, vLife * 1.6) * 0.6;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

export class SprayParticles {
  constructor(game) {
    this.game = game;
    this.pos = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.col = new Float32Array(POOL * 3);
    this.life = new Float32Array(POOL);
    this.maxLife = new Float32Array(POOL);
    this.next = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr = new THREE.BufferAttribute(new Float32Array(POOL), 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);
    geo.setAttribute('aColor', this.colAttr);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 4;
    game.scene.add(this.points);
    this._c = new THREE.Color();
  }

  emit(from, to, color, count = 3) {
    const c = this._c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      const i3 = i * 3;
      this.pos[i3] = from.x;
      this.pos[i3 + 1] = from.y;
      this.pos[i3 + 2] = from.z;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const t = 0.18 + Math.random() * 0.12; // nominal seconds to the wall (drag eats ~30 %)
      const spread = 0.35;
      const k = 1.4 / t;
      this.vel[i3] = dx * k + (Math.random() - 0.5) * spread * k;
      this.vel[i3 + 1] = dy * k + (Math.random() - 0.5) * spread * k;
      this.vel[i3 + 2] = dz * k + (Math.random() - 0.5) * spread * k;
      this.maxLife[i] = t + 0.25 + Math.random() * 0.3;
      this.life[i] = this.maxLife[i];
      // mist is mostly paint color with some gray haze
      const haze = Math.random() < 0.25 ? 0.6 : 0;
      this.col[i3] = c.r + (0.85 - c.r) * haze;
      this.col[i3 + 1] = c.g + (0.85 - c.g) * haze;
      this.col[i3 + 2] = c.b + (0.85 - c.b) * haze;
    }
    this.alive = POOL;
    this.points.visible = true;
    this.colAttr.needsUpdate = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    const h = this.game.renderer?.domElement?.clientHeight || 720;
    this.material.uniforms.uScale.value = h * 0.9;
    const lifeArr = this.lifeAttr.array;
    let any = false;
    for (let i = 0; i < POOL; i++) {
      let l = this.life[i];
      if (l <= 0) {
        lifeArr[i] = 0;
        continue;
      }
      any = true;
      l -= dt;
      this.life[i] = l;
      const i3 = i * 3;
      // slow down fast (mist hangs in the air once it leaves the nozzle)
      const drag = Math.exp(-dt * 7);
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - 0.4 * dt;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      lifeArr[i] = Math.max(0, l / this.maxLife[i]);
    }
    this.posAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
    if (!any) this.points.visible = false;
  }

  clear() {
    this.life.fill(0);
    this.points.visible = false;
  }
}
