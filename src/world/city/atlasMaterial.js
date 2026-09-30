import * as THREE from 'three';

// Texture-atlas tiling for Lambert materials.
//
// Geometry carries a `tile` attribute (u8x4: atlas rect x, y, w, h in 1/16 units, y from the
// bottom). The fragment shader wraps the ordinary uv with fract() inside that rect and samples with
// textureGrad using the derivatives of the unwrapped uv, so tiling textures repeat seamlessly and
// mip selection is not broken by the wrap. Gradients are clamped so far-away mip levels do not
// average across neighbouring atlas tiles.
//
// The same rect addresses the emissive map, which has the same layout (it may be lower resolution).

const VERT_PARS = /* glsl */ `
attribute vec4 tile;
varying vec4 vTile;
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vTile;
vec2 atlasUv;
vec2 atlasGx;
vec2 atlasGy;
void atlasSetup(vec2 uv) {
  vec4 r = vTile * 0.0625;
  atlasUv = r.xy + fract(uv) * r.zw;
  // keep a hair inside the rect to avoid sampling the neighbour on the wrap line
  atlasUv = clamp(atlasUv, r.xy + 0.0004, r.xy + r.zw - 0.0004);
  vec2 gx = dFdx(uv) * r.zw;
  vec2 gy = dFdy(uv) * r.zw;
  float lim = min(r.z, r.w) * 0.09;
  float m = max(length(gx), length(gy));
  float k = m > lim ? lim / m : 1.0;
  atlasGx = gx * k;
  atlasGy = gy * k;
}
`;

/**
 * Patch a MeshLambertMaterial (map + optional emissiveMap) for atlas tiling.
 * The material must have `map` set before first render.
 */
export function makeAtlasMaterial(params, key) {
  const mat = new THREE.MeshLambertMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = VERT_PARS + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvTile = tile;');
    shader.fragmentShader = FRAG_PARS + shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
#ifdef USE_MAP
  atlasSetup(vMapUv);
  vec4 sampledDiffuseColor = textureGrad(map, atlasUv, atlasGx, atlasGy);
  diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = textureGrad(emissiveMap, atlasUv, atlasGx, atlasGy);
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,
      );
  };
  mat.customProgramCacheKey = () => `city-atlas-${key}`;
  return mat;
}
