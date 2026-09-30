import * as THREE from 'three';

// "Omaha" tone mapping: a Gran Turismo style (Uchimura 2017) curve plugged into three.js'
// CustomToneMapping slot. Compared to ACES it keeps a long linear mid-section and only a gentle
// toe, so dark asphalt in skylight stays a readable colored gray instead of crushing to black,
// while the shoulder still rolls off hot sunlit walls and neon. Saturation is preserved (per
// channel), which suits the stylized low-poly palette.
//
// Only the CustomToneMapping function is replaced; the other tone mappers are untouched.

const GLSL = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  // OMAHA_TONEMAP
  color *= toneMappingExposure;
  const float P = 1.0;   // max display brightness
  const float a = 1.0;   // contrast
  const float m = 0.2;   // linear section start
  const float l = 0.42;  // linear section length
  const float c = 1.12;  // toe tightness (1 = no toe)
  const float b = 0.0;   // pedestal
  float l0 = ((P - m) * l) / a;
  float S0 = m + l0;
  float S1 = m + a * l0;
  float C2 = (a * P) / (P - S1);
  float CP = -C2 / P;
  vec3 x = max(color, vec3(0.0));
  vec3 w0 = vec3(1.0) - smoothstep(vec3(0.0), vec3(m), x);
  vec3 w2 = step(vec3(S0), x);
  vec3 w1 = vec3(1.0) - w0 - w2;
  vec3 T = m * pow(x / m, vec3(c)) + b;
  vec3 S = P - (P - S1) * exp(CP * (x - S0));
  vec3 L = m + a * (x - m);
  return T * w0 + L * w1 + S * w2;
}
`;

let installed = false;

/** Swap three's CustomToneMapping stub for the Omaha curve (idempotent). */
export function installToneMapping() {
  if (installed) return true;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes('OMAHA_TONEMAP')) return (installed = true);
  const re = /vec3 CustomToneMapping\( vec3 color \) \{ return color; \}/;
  if (!re.test(chunk)) return false; // three changed the chunk: fall back to ACES
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(re, GLSL);
  installed = true;
  return true;
}
