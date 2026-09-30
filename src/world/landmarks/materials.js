import * as THREE from 'three';

// Shared landmark materials. Every landmark cluster merges its geometry per material key, so
// this short list is also the per-cluster draw-call ceiling.
//
//   solid     vertex colors (roofs, trim, props, trees)
//   office slab glass masonry lowrise   textured facades + night window emissive maps
//   shiny     glossy vertex colors (domes, jets, slides)
//   ground    flat ground overlays from the ground strip atlas (plazas, lots, rails, runway)
//   grass     lawns
//   water / lake   Missouri River (flowing) / still water
//   signs     sign atlas (lit signs glow at night)
//   chain     chain-link fence (alpha tested, double sided)
//   lights    lamp heads, runway lights: unlit colors, only visible at night
//   beacon    red aircraft-warning beacons (blink)
//
// Materials with an emissive map are pushed into city.nightMaterials: the City sets their
// emissiveIntensity to the night amount (0..1).

export function buildMaterials(game, T, S) {
  const M = {};
  M.solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const id of ['office', 'slab', 'glass', 'masonry', 'lowrise']) {
    M[id] = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: T.facade[id],
      emissiveMap: T.emissive[id],
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0,
    });
  }
  M.shiny = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: new THREE.Color('#5a5a5a') });
  // ground overlays sit a few cm above the city ground: polygon offset keeps them from
  // z-fighting at distance (offsets in depth-buffer units, so it scales with range)
  M.grass = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: T.grass,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  M.ground = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: T.ground,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  const riverTex = T.water;
  const lakeTex = T.lakeWater;
  M.water = new THREE.MeshPhongMaterial({
    vertexColors: true,
    map: riverTex,
    shininess: 34,
    specular: new THREE.Color('#77766c'),
    emissive: new THREE.Color('#1a1c1c'),
  });
  M.lake = new THREE.MeshPhongMaterial({
    vertexColors: true,
    map: lakeTex,
    shininess: 50,
    specular: new THREE.Color('#6e7274'),
    emissive: new THREE.Color('#0c1214'),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  M.signs = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: S.tex,
    emissiveMap: S.glow,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  // falling water sheets (Leahy Mall waterfall, fountain basins): scrolling ripples, translucent
  const fallsTex = T.water.clone();
  fallsTex.needsUpdate = true;
  M.falls = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: fallsTex,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    emissive: new THREE.Color('#9fb7c4'),
    emissiveIntensity: 0.25,
    side: THREE.DoubleSide,
  });
  M.chain = new THREE.MeshLambertMaterial({ vertexColors: true, map: T.chainlink, alphaTest: 0.45, side: THREE.DoubleSide });
  M.lights = new THREE.MeshBasicMaterial({ vertexColors: true });
  M.lights.visible = false;
  M.beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2414') });
  M.nightMaterials = [M.office, M.slab, M.glass, M.masonry, M.lowrise, M.signs];
  for (const id of ['solid', 'office', 'slab', 'glass', 'masonry', 'shiny', 'signs', 'lights', 'beacon']) heightFog(M[id]);
  return M;
}

/**
 * Height haze: the summer haze hangs low, so geometry high above the ground is fogged less
 * (up to 45 % less distance at 90 m). Street level is untouched, but the towers and the Loess
 * Hills keep their silhouettes against the sky from across the city.
 */
export function heightFog(m) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      '#include <fog_vertex>\n#ifdef USE_FOG\n  vFogDepth *= 1.0 - 0.45 * smoothstep(18.0, 90.0, (modelMatrix * vec4(transformed, 1.0)).y);\n#endif',
    );
  };
}

/**
 * Glow sprites for night lights: PointsMaterial with a per-point size attribute (aSize) and a
 * minimum on-screen size so distant beacons still read. Additive, fogged.
 */
export function glowMaterial(tex, opacity = 1) {
  const m = new THREE.PointsMaterial({
    size: 1,
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;')
      .replace('#include <fog_vertex>', 'gl_PointSize = max(gl_PointSize, 2.0);\n#include <fog_vertex>');
  };
  return m;
}

/** Build a Points object from collected glow data { pos: [], col: [], size: [] }. */
export function glowPoints(data, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(data.size, 1));
  g.computeBoundingSphere();
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  p.matrixAutoUpdate = false;
  p.renderOrder = 2;
  return p;
}
