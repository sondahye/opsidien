// GLSL chunks shared by the dive world's water, letters and sky dome —
// plus a JS twin of waveH so gameplay code (altitude clamp, bolt impact)
// agrees exactly with what the GPU renders.

export const WAVE_GLSL = /* glsl */ `
float waveH(vec2 p, float t) {
  return sin(p.x * 0.045 + t * 0.9) * 1.1
       + sin(p.y * 0.036 - t * 0.7) * 0.8
       + sin((p.x + p.y) * 0.021 + t * 0.45) * 1.4
       + sin(length(p) * 0.05 - t * 1.3) * 0.35;
}
`;

export function waveHJS(x, z, t) {
  return Math.sin(x * 0.045 + t * 0.9) * 1.1
       + Math.sin(z * 0.036 - t * 0.7) * 0.8
       + Math.sin((x + z) * 0.021 + t * 0.45) * 1.4
       + Math.sin(Math.hypot(x, z) * 0.05 - t * 1.3) * 0.35;
}

export const SKY_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 skyCol(vec3 rd, float t, vec3 zen, vec3 hor, vec3 aur) {
  float h = clamp(rd.y, 0.0, 1.0);
  vec3 col = mix(hor, zen, pow(h, 0.55));
  float s = hash13(floor(rd * 230.0));
  float star = smoothstep(0.9965, 1.0, s) * (0.6 + 0.4 * sin(t * 3.0 + s * 40.0));
  col += vec3(star) * smoothstep(0.02, 0.15, rd.y);
  float band = sin(rd.x * 2.3 + rd.z * 1.7 + t * 0.15) * 0.5 + 0.5;
  col += aur * band * 0.12 * smoothstep(0.05, 0.6, rd.y);
  return col;
}
`;
