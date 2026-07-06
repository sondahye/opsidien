import * as THREE from 'three';
import { makeGlowTexture, mulberry32, clamp, damp } from '../util.js';

// Every avatar is generated in code and satisfies:
//   { object: THREE.Object3D, update(state), dispose() }
// state = { dt, t, speed01, hyper, vy }
// Register a new one by adding a factory to AVATARS.

function makeDart() {
  const g = new THREE.Group();

  // A low-poly dart whose nose reads instantly as "this way".
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([
    // nose, tail-left, tail-right, keel-top, keel-bottom
    0, 0, -2.3,
    -1.15, 0, 1.35,
    1.15, 0, 1.35,
    0, 0.6, 1.05,
    0, -0.28, 1.2,
  ]);
  const idx = [0, 1, 3, 0, 3, 2, 0, 2, 4, 0, 4, 1, 1, 2, 3, 1, 4, 2];
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#d7e6ff', roughness: 0.35, metalness: 0.55, flatShading: true,
  }));
  g.add(body);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#9fd0ff'), color: '#bfe0ff',
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glow.position.set(0, 0.05, 1.5);
  g.add(glow);

  return {
    object: g,
    update({ t, speed01, hyper }) {
      const s = 0.7 + speed01 * 1.3 + hyper * 2.6;
      glow.scale.setScalar(s + Math.sin(t * 22) * 0.08 * (0.3 + hyper));
      glow.material.opacity = 0.55 + speed01 * 0.3 + hyper * 0.15;
    },
    dispose() { geo.dispose(); body.material.dispose(); glow.material.dispose(); },
  };
}

function makeBlob() {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.95, 1);
  const rng = mulberry32(1337);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.82 + rng() * 0.34;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#9ff0c8', roughness: 0.55, metalness: 0.1, flatShading: true,
  }));
  g.add(body);

  // tiny beak so heading is unambiguous
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.6, 4),
    new THREE.MeshStandardMaterial({ color: '#245b43', flatShading: true }),
  );
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.05, -1.05);
  g.add(beak);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#a5ffd4'), color: '#c9ffe6',
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  glow.position.set(0, 0, 1.1);
  g.add(glow);

  return {
    object: g,
    update({ t, speed01, hyper }) {
      const squash = 1 + Math.sin(t * 5) * 0.05 * (0.4 + speed01);
      body.scale.set(1 / squash, squash, 1 / squash);
      glow.scale.setScalar(0.6 + speed01 * 1.1 + hyper * 2.2);
      glow.material.opacity = 0.5 + speed01 * 0.3 + hyper * 0.2;
    },
    dispose() { geo.dispose(); body.material.dispose(); beak.geometry.dispose(); beak.material.dispose(); glow.material.dispose(); },
  };
}

function makeWisp() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 1),
    new THREE.MeshBasicMaterial({ color: '#f4faff' }),
  );
  g.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#bfe6ff'), color: '#dff2ff',
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(3.2);
  g.add(halo);
  const motes = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('#e8f6ff'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8,
    }));
    m.scale.setScalar(0.5);
    g.add(m);
    motes.push(m);
  }
  return {
    object: g,
    update({ t, speed01, hyper }) {
      core.scale.setScalar(1 + Math.sin(t * 4.2) * 0.12);
      halo.scale.setScalar(3 + Math.sin(t * 2.6) * 0.4 + hyper * 2 + speed01);
      for (let i = 0; i < motes.length; i++) {
        const a = t * (1.4 + i * 0.35) + (i * Math.PI * 2) / 3;
        motes[i].position.set(Math.cos(a) * 1.1, Math.sin(a * 1.3) * 0.5, Math.sin(a) * 1.1);
      }
    },
    dispose() {
      core.geometry.dispose(); core.material.dispose(); halo.material.dispose();
      motes.forEach((m) => m.material.dispose());
    },
  };
}

export const AVATARS = { dart: makeDart, blob: makeBlob, wisp: makeWisp };

export class AvatarManager {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.impl = null;
    this.bank = 0;
    this._eul = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  set(kind) {
    if (this.impl) { this.group.remove(this.impl.object); this.impl.dispose(); }
    this.impl = AVATARS[kind]();
    this.group.add(this.impl.object);
  }

  update({ dt, t, pos, yaw, pitch, yawRate, speed01, hyper, vy }) {
    this.group.position.copy(pos);
    this.bank = damp(this.bank, clamp(-yawRate * 0.5, -0.7, 0.7), 6, dt);
    const tilt = pitch * 0.55 + clamp(vy * 0.01, -0.3, 0.3);
    this._eul.set(tilt, yaw, this.bank);
    this.group.quaternion.setFromEuler(this._eul);
    this.impl?.update({ dt, t, speed01, hyper, vy });
  }
}
