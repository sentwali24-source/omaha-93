import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 3D mission markers: glowing, translucent, pulsing checkpoint cylinders with a tall beam and a
// bobbing arrow, visible from across the city. ONE draw call per marker (the three parts are one
// merged geometry; the vertex shader scales each part and widens the beam with camera distance so
// it stays readable far away). Geometry is shared by every marker; materials share one program.
//
//   const markers = new WorldMarkers(game);
//   const m = markers.add({ x, z, color: '#f2b632', kind: 'checkpoint' | 'arrow', radius: 2.5 });
//   m.setPosition(x, z, y?)   m.follow(object3D | {position}, yOffset)   m.setVisible(bool)   m.remove()
//   markers.update(dt)        (Missions calls it every frame)

const VERT = /* glsl */ `
attribute float aPart;
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uBeam;
uniform float uArrowY;
uniform float uPhase;
varying float vPart;
varying float vH;
varying float vFacing;
void main() {
  vec3 p = position;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float far = max(1.0, distance(cameraPosition, center) / 50.0);
  vPart = aPart;
  vH = clamp(p.y, 0.0, 1.0);
  // cylinders: how directly this side faces the camera (soft glowing edges)
  vec3 wn = normalize((modelMatrix * vec4(position.x, 0.0, position.z, 0.0)).xyz + vec3(1e-5));
  vec3 vd = normalize(cameraPosition - center);
  vFacing = aPart < 1.5 ? abs(dot(wn.xz, normalize(vd.xz + vec2(1e-5)))) : 1.0;
  if (aPart < 0.5) {
    // ground ring cylinder, height 0..1 → uHeight
    p.xz *= uRadius;
    p.y *= uHeight;
  } else if (aPart < 1.5) {
    // tall thin beam, wider with distance
    p.xz *= 0.45 * min(far, 8.0);
    p.y *= uBeam;
  } else {
    // arrow: spins and bobs, grows a little with distance
    float s = min(far, 3.5);
    float a = uTime * 1.6 + uPhase;
    float c = cos(a);
    float sn = sin(a);
    p.xz = mat2(c, -sn, sn, c) * p.xz;
    p *= s;
    p.y += uArrowY + sin(uTime * 3.0 + uPhase) * 0.3 * s;
  }
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uPhase;
varying float vPart;
varying float vH;
varying float vFacing;
void main() {
  float pulse = 0.72 + 0.28 * sin(uTime * 4.2 + uPhase);
  vec3 c = uColor;
  float a;
  if (vPart < 0.5) {
    // bright rim at the ground, fading up; scrolling bands read as "energy"
    float bands = 0.75 + 0.25 * sin(vH * 18.0 - uTime * 5.0);
    a = (pow(1.0 - vH, 1.6) * 0.6 * pulse * bands + step(vH, 0.03) * 0.35) * (0.45 + 0.55 * vFacing);
    c = mix(uColor, vec3(1.0), 0.2 * (1.0 - vH));
  } else if (vPart < 1.5) {
    a = mix(0.62, 0.1, vH) * pulse * smoothstep(0.05, 0.7, vFacing);
    c = uColor * 1.1;
  } else {
    a = 0.92;
    c = mix(uColor, vec3(1.0), 0.3 + 0.2 * pulse);
  }
  gl_FragColor = vec4(c, a * uOpacity);
  #include <colorspace_fragment>
}
`;

function partGeometry(geo, part) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

function buildGeometries() {
  // unit ring cylinder, y 0..1
  const ring = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  ring.translate(0, 0.5, 0);
  const beam = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  beam.translate(0, 0.5, 0);
  // arrow pointing down: cone tip at y = 0 plus a short shaft
  const head = new THREE.ConeGeometry(0.7, 1.0, 4);
  head.rotateX(Math.PI);
  head.translate(0, 0.5, 0);
  const shaft = new THREE.BoxGeometry(0.34, 0.8, 0.34);
  shaft.translate(0, 1.35, 0);
  const arrowParts = [partGeometry(head, 2), partGeometry(shaft, 2)];
  const checkpoint = mergeGeometries([partGeometry(ring, 0), partGeometry(beam, 1), ...arrowParts.map((g) => g.clone())]);
  const arrow = mergeGeometries(arrowParts);
  return { checkpoint, arrow };
}

export class WorldMarkers {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'mission-markers';
    game.scene.add(this.group);
    this.geos = buildGeometries();
    this.time = { value: 0 };
    this.list = [];
    this._base = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
  }

  add({ x = 0, z = 0, y = 0, color = '#f2b632', kind = 'checkpoint', radius = 2.4, height = 2.4, beam = 70, arrowY = null } = {}) {
    const mat = this._base.clone();
    mat.uniforms = {
      uTime: this.time,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uRadius: { value: radius },
      uHeight: { value: height },
      uBeam: { value: beam },
      uArrowY: { value: arrowY ?? (kind === 'arrow' ? 0.4 : height + 1.6) },
      uPhase: { value: Math.random() * 6.28 },
    };
    const mesh = new THREE.Mesh(kind === 'arrow' ? this.geos.arrow : this.geos.checkpoint, mat);
    mesh.frustumCulled = false; // the shader grows the parts well past the unit bounds
    mesh.renderOrder = 5;
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    const marker = {
      mesh,
      kind,
      target: null,
      yOffset: 0,
      get x() {
        return mesh.position.x;
      },
      get z() {
        return mesh.position.z;
      },
      setPosition: (nx, nz, ny = mesh.position.y) => {
        mesh.position.set(nx, ny, nz);
      },
      follow: (obj, yOffset = 2.4) => {
        marker.target = obj;
        marker.yOffset = yOffset;
      },
      setVisible: (v) => {
        mesh.visible = v;
      },
      setColor: (c) => {
        mat.uniforms.uColor.value.set(c);
      },
      remove: () => this.remove(marker),
    };
    this.list.push(marker);
    return marker;
  }

  remove(marker) {
    const i = this.list.indexOf(marker);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.group.remove(marker.mesh);
    marker.mesh.material.dispose();
  }

  clear() {
    while (this.list.length) this.remove(this.list[this.list.length - 1]);
  }

  update(dt) {
    this.time.value += dt;
    for (let i = 0; i < this.list.length; i++) {
      const m = this.list[i];
      const t = m.target;
      if (!t) continue;
      const p = t.position || t;
      m.mesh.position.set(p.x, (p.y || 0) + m.yOffset, p.z);
    }
  }
}
