import * as THREE from 'three';
import { makeGlowTexture } from '../util.js';
import { waveHJS } from './glsl.js';

const SEGS = 22;

// A bolt that wanders over the text plain. Every ~0.12s it stamps its
// position + timestamp into the letters' trail ring buffer — the shader
// does the scattering and, because the impulse is a function of age,
// the letters re-form in its wake for free.
export class Lightning {
  constructor(bounds) {
    this.bounds = bounds;
    this.pos = new THREE.Vector2(0, 0);
    this.target = new THREE.Vector2();
    this._pickTarget(0);

    this.trail = null;      // Vector3[] (x, z, birthTime), shared with letters
    this._ring = 0;
    this._tPush = 0;
    this._tRebuild = 0;
    this._tRetarget = 0;
    this.flick = 1;

    const positions = new Float32Array(SEGS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: '#dfeeff', transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 30;

    this.impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('#cfe6ff'), color: '#eaf4ff',
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.impact.renderOrder = 31;

    this.group = new THREE.Group();
    this.group.add(this.line, this.impact);

    this.boltTip = new THREE.Vector3();   // fed to the water shader
  }

  attachTrail(trail) { this.trail = trail; }

  _pickTarget(t) {
    const b = this.bounds;
    this.target.set(
      b.minX + Math.random() * (b.maxX - b.minX),
      b.minZ + Math.random() * (b.maxZ - b.minZ),
    );
    this._tRetarget = t + 1.4 + Math.random() * 1.8;
  }

  _rebuild(t) {
    const surf = waveHJS(this.pos.x, this.pos.y, t);
    const top = new THREE.Vector3(
      this.pos.x + (Math.random() - 0.5) * 26,
      58 + Math.random() * 14,
      this.pos.y + (Math.random() - 0.5) * 26,
    );
    const bottom = new THREE.Vector3(this.pos.x, surf + 0.2, this.pos.y);

    const attr = this.line.geometry.attributes.position;
    for (let i = 0; i < SEGS; i++) {
      const k = i / (SEGS - 1);
      const amp = Math.sin(k * Math.PI) * 7;
      attr.setXYZ(i,
        THREE.MathUtils.lerp(top.x, bottom.x, k) + (Math.random() - 0.5) * amp,
        THREE.MathUtils.lerp(top.y, bottom.y, k),
        THREE.MathUtils.lerp(top.z, bottom.z, k) + (Math.random() - 0.5) * amp,
      );
    }
    attr.needsUpdate = true;

    this.impact.position.set(bottom.x, bottom.y + 0.6, bottom.z);
    this.boltTip.set(this.pos.x, surf + 7, this.pos.y);
  }

  update(dt, t) {
    if (t > this._tRetarget) this._pickTarget(t);

    // wander toward the target with a little sway
    const to = this.target.clone().sub(this.pos);
    const d = to.length();
    if (d > 0.5) {
      const speed = Math.min(16, d * 1.1 + 3);
      this.pos.addScaledVector(to.normalize(), speed * dt);
      this.pos.x += Math.sin(t * 3.1) * 2.2 * dt;
      this.pos.y += Math.cos(t * 2.6) * 2.2 * dt;
    }

    if (t > this._tPush && this.trail) {
      this._tPush = t + 0.12;
      this.trail[this._ring].set(this.pos.x, this.pos.y, t);
      this._ring = (this._ring + 1) % this.trail.length;
    }

    if (t > this._tRebuild) {
      this._tRebuild = t + 0.07;
      this._rebuild(t);
      this.flick = 0.55 + Math.random() * 0.65;
    }

    this.line.material.opacity = 0.55 * this.flick + 0.3;
    this.impact.scale.setScalar(5 + this.flick * 5);
    this.impact.material.opacity = 0.5 + this.flick * 0.4;
  }

  dispose() {
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.impact.material.dispose();
  }
}
