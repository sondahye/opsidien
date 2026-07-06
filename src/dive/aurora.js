import * as THREE from 'three';
import { mulberry32, hashString } from '../util.js';

// Curtains of aurora made of the note's own text — several waving sheets,
// purely atmospheric, not meant to be read.
function makeTextTexture(text, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = '150px "iA Writer Mono", "Noto Sans KR", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  const clean = text.replace(/\s+/g, ' ').trim() || 'aurora';
  const rng = mulberry32(seed);
  for (let row = 0; row < 3; row++) {
    const start = (rng() * clean.length) | 0;
    const slice = (clean + '  ' + clean).slice(start, start + 60);
    ctx.globalAlpha = 0.55 + rng() * 0.45;
    ctx.fillText(slice, -((rng() * 300) | 0), 90 + row * 165);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeCurtain(text, colors, seed) {
  const rng = mulberry32(seed);
  const width = 320 + rng() * 420;
  const height = 130 + rng() * 150;
  const geo = new THREE.PlaneGeometry(width, height, 96, 6);
  const tex = makeTextTexture(text, seed);

  const uniforms = {
    uTime: { value: 0 },
    uSeed: { value: rng() * 20 },
    uText: { value: tex },
    uScroll: { value: 0.006 + rng() * 0.01 },
    uRep: { value: 1.2 + rng() * 1.4 },
    uA: { value: new THREE.Color(colors[0]) },
    uB: { value: new THREE.Color(colors[1]) },
    uC: { value: new THREE.Color(colors[2]) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uSeed;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float ph = uv.y;
        p.z += (sin(p.x * 0.012 + uTime * 0.35 + uSeed)
              + sin(p.x * 0.031 - uTime * 0.6 + uSeed * 2.0) * 0.5) * 26.0 * (0.35 + 0.65 * ph);
        p.x += sin(uTime * 0.2 + uSeed + p.y * 0.008) * 10.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uText;
      uniform vec3 uA, uB, uC;
      uniform float uTime, uSeed, uScroll, uRep;
      varying vec2 vUv;
      void main() {
        float a = texture2D(uText, vec2(vUv.x * uRep + uTime * uScroll, vUv.y)).a;
        float base = pow(1.0 - vUv.y, 1.8) * 1.3 + 0.12;
        float f = 0.55 + 0.45 * sin(vUv.x * 38.0 + uTime * 2.1 + sin(vUv.x * 11.0 - uTime * 0.8 + uSeed));
        vec3 col = mix(uA, uB, vUv.y) + uC * f * 0.35;
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        float alpha = a * base * f * edge * 0.85;
        gl_FragColor = vec4(col * (0.8 + f * 0.6), alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  return { mesh, uniforms, tex, geo, mat };
}

export function makeAurora(text, theme) {
  const group = new THREE.Group();
  const curtains = [];
  const baseSeed = hashString(text.slice(0, 64) || 'aurora');

  for (let i = 0; i < 5; i++) {
    const rng = mulberry32(baseSeed + i * 977);
    const c = makeCurtain(text, theme.dive.aurora, baseSeed + i * 977);
    const ang = rng() * Math.PI * 2;
    const rad = 340 + rng() * 380;
    c.mesh.position.set(Math.cos(ang) * rad, 120 + rng() * 160, Math.sin(ang) * rad);
    c.mesh.rotation.y = ang + Math.PI / 2 + (rng() - 0.5) * 0.8;
    group.add(c.mesh);
    curtains.push(c);
  }

  return {
    group,
    update(t) { for (const c of curtains) c.uniforms.uTime.value = t; },
    setTheme(th) {
      for (const c of curtains) {
        c.uniforms.uA.value.set(th.dive.aurora[0]);
        c.uniforms.uB.value.set(th.dive.aurora[1]);
        c.uniforms.uC.value.set(th.dive.aurora[2]);
      }
    },
    dispose() {
      for (const c of curtains) { c.geo.dispose(); c.mat.dispose(); c.tex.dispose(); }
    },
  };
}
