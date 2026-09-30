import * as THREE from 'three';
import { getAtlas } from './atlas.js';

// Shared vehicle materials. ONE material for every car body (vertex colors + the shared atlas +
// a per-vertex "shine" attribute that scales specular highlights and the fake sky reflection, so
// chrome, glass, candy paint and faded primer all live in the same mesh / draw call).

let bodyMaterial = null;
let envCube = null;

/** Small procedural sky/ground cube map: chrome and glass reflect it. */
export function getEnvCube() {
  if (envCube) return envCube;
  const S = 32;
  const face = (kind) => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    if (kind === 'top') {
      ctx.fillStyle = '#b8d4ee';
      ctx.fillRect(0, 0, S, S);
    } else if (kind === 'bottom') {
      ctx.fillStyle = '#3a3632';
      ctx.fillRect(0, 0, S, S);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#a9c8e8');
      g.addColorStop(0.46, '#eef4f8');
      g.addColorStop(0.5, '#8a8478');
      g.addColorStop(0.62, '#4a453e');
      g.addColorStop(1, '#2e2b28');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      // a few "buildings" on the horizon
      ctx.fillStyle = 'rgba(70,80,95,0.55)';
      for (let i = 0; i < 5; i++) ctx.fillRect(i * 7 + 1, S * 0.3 + ((i * 5) % 4), 4, S * 0.2);
    }
    return c;
  };
  // order: +x, -x, +y, -y, +z, -z
  envCube = new THREE.CubeTexture([face('side'), face('side'), face('top'), face('bottom'), face('side'), face('side')]);
  envCube.colorSpace = THREE.SRGBColorSpace;
  envCube.needsUpdate = true;
  return envCube;
}

/** Shared body material. Geometry must carry a float `shine` attribute. */
export function getBodyMaterial() {
  if (bodyMaterial) return bodyMaterial;
  const atlas = getAtlas();
  const m = new THREE.MeshPhongMaterial({
    vertexColors: true,
    map: atlas.texture,
    specular: new THREE.Color('#3a3a3a'),
    shininess: 38,
    envMap: getEnvCube(),
    combine: THREE.MixOperation,
    reflectivity: 0.75,
  });
  m.name = 'vehicle-body';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shine;\nvarying float vShine;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvShine = shine;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShine;')
      .replace('#include <specularmap_fragment>', 'float specularStrength = vShine;');
  };
  m.customProgramCacheKey = () => 'vehicle-body-v1';
  bodyMaterial = m;
  return m;
}

/** Called once per frame by the fx system: dim reflections at night. */
export function updateMaterialsForNight(night) {
  if (bodyMaterial) {
    bodyMaterial.reflectivity = 0.75 * (1 - 0.72 * night);
    bodyMaterial.specular.setScalar(0.043 * (1 - 0.5 * night));
  }
}
