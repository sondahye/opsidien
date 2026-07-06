import * as THREE from 'three';
import { WAVE_GLSL } from './glsl.js';

const TRAIL = 10;
const MAX_GLYPHS = 4500;

// Rasterize the note's unique characters into a canvas atlas.
function buildAtlas(text) {
  const chars = [...new Set(text)].filter((c) => c.trim().length);
  const cell = 64;
  const cols = 16;
  const rows = Math.max(1, Math.ceil(chars.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cell * cols;
  canvas.height = cell * rows;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${cell * 0.78}px "iA Writer Mono", "Noto Sans KR", ui-monospace, monospace`;

  const uv = new Map();
  const fw = 1 / cols, fh = 1 / rows;
  chars.forEach((c, i) => {
    const col = i % cols, row = (i / cols) | 0;
    ctx.fillText(c, col * cell + cell / 2, row * cell + cell / 2 + 2);
    // flipY texture: v measured from the bottom
    uv.set(c, [col * fw, 1 - (row + 1) * fh, fw, fh]);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  return { tex, uv };
}

// Lay the text out as rows of glyphs on the water plane.
function layout(text) {
  const clean = text
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const WRAP = 88;
  const lines = [];
  for (const raw of clean.split('\n')) {
    if (!raw.length) { lines.push(''); continue; }
    for (let i = 0; i < raw.length; i += WRAP) lines.push(raw.slice(i, i + WRAP));
  }

  const scale = 1.5;
  const sx = scale * 1.08;
  const sz = scale * 1.85;
  const glyphs = [];
  outer:
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    const x0 = -(line.length - 1) * sx * 0.5;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (!ch.trim()) continue;
      glyphs.push({ ch, x: x0 + c * sx, z: (r - lines.length * 0.5) * sz });
      if (glyphs.length >= MAX_GLYPHS) break outer;
    }
  }
  const half = Math.max(80, (lines.length * sz) / 2 + 30, WRAP * sx * 0.5 + 30);
  return { glyphs, scale, bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half } };
}

export function makeLetters(text, theme) {
  const { tex, uv } = buildAtlas(text);
  const { glyphs, scale, bounds } = layout(text);
  const n = glyphs.length;

  const offsets = new Float32Array(n * 2);
  const charUV = new Float32Array(n * 4);
  const rands = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = glyphs[i];
    offsets[i * 2] = g.x;
    offsets[i * 2 + 1] = g.z;
    const r = uv.get(g.ch) || [0, 0, 0, 0];
    charUV.set(r, i * 4);
    rands[i] = Math.random();
  }

  const plane = new THREE.PlaneGeometry(1.1, 1.35);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = plane.index;
  geo.setAttribute('position', plane.attributes.position);
  geo.setAttribute('uv', plane.attributes.uv);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aChar', new THREE.InstancedBufferAttribute(charUV, 4));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 1));
  geo.instanceCount = n;

  const trail = [];
  for (let i = 0; i < TRAIL; i++) trail.push(new THREE.Vector3(0, 0, -999));

  const uniforms = {
    uTime: { value: 0 },
    uAtlas: { value: tex },
    uColor: { value: new THREE.Color(theme.dive.letter) },
    uScale: { value: scale },
    uTrail: { value: trail },
    uLife: { value: 2.6 },
    uR: { value: 9.0 },
    uPush: { value: 7.0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uScale, uLife, uR, uPush;
      uniform vec3 uTrail[${TRAIL}];
      attribute vec2 aOffset;
      attribute vec4 aChar;
      attribute float aRand;
      varying vec2 vUv;
      varying float vGlow;
      varying float vFade;
      ${WAVE_GLSL}
      void main() {
        vec2 xz = aOffset;
        vec2 disp = vec2(0.0);
        float lift = 0.0;
        float glow = 0.0;
        for (int i = 0; i < ${TRAIL}; i++) {
          float age = uTime - uTrail[i].z;
          if (age < 0.0 || age > uLife) continue;
          vec2 dv = xz - uTrail[i].xy;
          float d = length(dv) + 0.001;
          float w = exp(-(d * d) / (uR * uR)) * sin(clamp(age / uLife, 0.0, 1.0) * 3.14159265);
          disp += dv / d * w * uPush;
          lift += w * uPush * 0.75;
          glow += w;
        }
        vec3 base = vec3(xz.x + disp.x, 0.0, xz.y + disp.y);
        float h = waveH(base.xz, uTime);
        float bob = sin(uTime * 1.4 + aRand * 17.0) * 0.06;
        base.y = h * 0.95 + 0.24 + lift + bob;

        // glyph quad laid flat on the surface (local +y -> world -z)
        vec3 wp = base + vec3(position.x, 0.0, -position.y) * uScale;

        vGlow = clamp(glow * 1.4, 0.0, 1.0);
        vUv = aChar.xy + uv * aChar.zw;

        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vFade = clamp(1.0 - (-mv.z - 60.0) / 520.0, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vGlow;
      varying float vFade;
      void main() {
        float a = texture2D(uAtlas, vUv).a;
        if (a < 0.05) discard;
        vec3 c = uColor * (1.05 + vGlow * 2.4);
        gl_FragColor = vec4(c, a * (0.3 + 0.7 * vFade));
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  return {
    mesh, uniforms, bounds,
    trail,                         // the lightning writes into this ring
    setTheme(t) { uniforms.uColor.value.set(t.dive.letter); },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
