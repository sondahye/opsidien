import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const HyperShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmt: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmt;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(float n) { return fract(sin(n) * 43758.5453123); }

    void main() {
      vec2 c = vUv - 0.5;
      c.x *= uAspect;
      float r = length(c);
      float ang = atan(c.y, c.x);

      vec4 base = texture2D(tDiffuse, vUv);
      vec3 rgb = base.rgb;

      if (uAmt > 0.002) {
        // cheap radial zoom blur
        vec2 dir = c / max(r, 1e-4);
        dir.x /= uAspect;
        vec3 acc = rgb;
        for (int i = 1; i <= 4; i++) {
          float t = float(i) / 4.0 * 0.055 * uAmt * r;
          acc += texture2D(tDiffuse, vUv - dir * t).rgb;
        }
        rgb = acc / 5.0;

        // sparse radial streaks racing outward
        float id = floor(ang * 90.0);
        float rnd = hash(id);
        float gate = step(0.7, hash(id + 3.7));
        float speed = 7.0 + rnd * 7.0;
        float line = fract(r * 2.2 - uTime * speed - rnd * 9.0);
        float streak = smoothstep(0.0, 0.12, line) * smoothstep(0.42, 0.12, line);
        streak *= gate * smoothstep(0.12, 0.55, r);
        rgb += vec3(0.82, 0.9, 1.0) * streak * uAmt * 1.7;

        // tunnel vignette
        float vig = smoothstep(0.32, 0.95, r);
        rgb *= 1.0 - vig * 0.78 * uAmt;
      }

      gl_FragColor = vec4(rgb, base.a);
    }
  `,
};

export function setupPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.05, 0.55, 0.12);
  const hyper = new ShaderPass(HyperShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(hyper);
  composer.addPass(output);
  hyper.uniforms.uAspect.value = innerWidth / innerHeight;

  return {
    composer,
    bloom,
    hyper,
    setScene(s, cam) { renderPass.scene = s; renderPass.camera = cam; },
    setBloom({ strength, radius, threshold }) {
      bloom.strength = strength; bloom.radius = radius; bloom.threshold = threshold;
    },
    setSize(w, h) {
      composer.setSize(w, h);
      hyper.uniforms.uAspect.value = w / h;
    },
  };
}
