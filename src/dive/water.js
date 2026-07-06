import * as THREE from 'three';
import { WAVE_GLSL, SKY_GLSL } from './glsl.js';

// Waves are computed in *world* space, so the mesh can quietly follow the
// camera — the ocean never ends, and the far edge blends into the sky.
export function makeWater(theme) {
  const geo = new THREE.PlaneGeometry(6000, 6000, 150, 150);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color(theme.dive.zenith) },
    uHorizon: { value: new THREE.Color(theme.dive.horizon) },
    uDeep: { value: new THREE.Color(theme.dive.deep) },
    uAurora: { value: new THREE.Color(theme.dive.aurora[0]) },
    uBolt: { value: new THREE.Vector3(0, 8, 0) },
    uBoltI: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0.4, 0.5, -0.75).normalize() },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      ${WAVE_GLSL}
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += waveH(w.xz, uTime);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uZenith, uHorizon, uDeep, uAurora;
      uniform vec3 uBolt;
      uniform float uBoltI;
      uniform vec3 uMoonDir;
      varying vec3 vWorld;
      ${WAVE_GLSL}
      ${SKY_GLSL}
      void main() {
        float e = 1.4;
        float hx = waveH(vWorld.xz + vec2(e, 0.0), uTime) - waveH(vWorld.xz - vec2(e, 0.0), uTime);
        float hz = waveH(vWorld.xz + vec2(0.0, e), uTime) - waveH(vWorld.xz - vec2(0.0, e), uTime);
        vec3 N = normalize(vec3(-hx, 2.0 * e, -hz));

        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 sky = skyCol(R, uTime, uZenith, uHorizon, uAurora);

        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.88 + 0.07;
        vec3 col = mix(uDeep, sky, fres);

        // lightning glow on the water
        vec3 L = uBolt - vWorld;
        float ld = length(L);
        float diff = max(dot(N, L / max(ld, 1e-3)), 0.0);
        col += vec3(0.75, 0.85, 1.0) * uBoltI * diff * 90.0 / (ld * ld + 60.0);

        // moon glint
        col += vec3(0.85, 0.9, 1.0) * pow(max(dot(R, uMoonDir), 0.0), 220.0) * 0.8;

        // dissolve into the sky at the horizon — no visible edge
        vec2 dxz = vWorld.xz - cameraPosition.xz;
        float dist = length(dxz);
        vec3 hdir = normalize(vec3(dxz.x, 30.0, dxz.y));
        vec3 hcol = skyCol(normalize(vec3(hdir.x, 0.03, hdir.z)), uTime, uZenith, uHorizon, uAurora);
        col = mix(col, hcol, 1.0 - exp(-dist * 0.0012));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    setTheme(t) {
      uniforms.uZenith.value.set(t.dive.zenith);
      uniforms.uHorizon.value.set(t.dive.horizon);
      uniforms.uDeep.value.set(t.dive.deep);
      uniforms.uAurora.value.set(t.dive.aurora[0]);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

export function makeSkyDome(theme) {
  const uniforms = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color(theme.dive.zenith) },
    uHorizon: { value: new THREE.Color(theme.dive.horizon) },
    uAurora: { value: new THREE.Color(theme.dive.aurora[0]) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uZenith, uHorizon, uAurora;
      varying vec3 vDir;
      ${SKY_GLSL}
      void main() {
        vec3 rd = normalize(vDir);
        vec3 col = skyCol(vec3(rd.x, max(rd.y, 0.0), rd.z), uTime, uZenith, uHorizon, uAurora);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3200, 32, 16), mat);
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    setTheme(t) {
      uniforms.uZenith.value.set(t.dive.zenith);
      uniforms.uHorizon.value.set(t.dive.horizon);
      uniforms.uAurora.value.set(t.dive.aurora[0]);
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
