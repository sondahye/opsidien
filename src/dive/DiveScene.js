import * as THREE from 'three';
import { makeWater, makeSkyDome } from './water.js';
import { makeLetters } from './letters.js';
import { makeAurora } from './aurora.js';
import { Lightning } from './lightning.js';
import { makeStars } from '../fx/starfield.js';
import { waveHJS } from './glsl.js';

// The inside of a note: its text riding an endless reflective sea,
// a lightning walker scattering letters, aurora curtains of the same
// text overhead. Built lazily per note, torn down on rebuild.
export class DiveScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.built = false;
    this.noteId = null;
    this.parts = null;
  }

  build(noteId, text, theme) {
    this.disposeParts();

    this.scene.background = new THREE.Color(theme.dive.deep);

    const water = makeWater(theme);
    const sky = makeSkyDome(theme);
    const letters = makeLetters(text, theme);
    const aurora = makeAurora(text, theme);
    const bolt = new Lightning(letters.bounds);
    bolt.attachTrail(letters.trail);
    const stars = makeStars({ count: 2600, radius: 2900, color: '#dce9ff', size: 2.6, seed: 42 });

    this.scene.add(water.mesh, sky.mesh, letters.mesh, aurora.group, bolt.group, stars);

    this.parts = { water, sky, letters, aurora, bolt, stars };
    this.bounds = letters.bounds;
    this.built = true;
    this.noteId = noteId;
  }

  update(dt, t, camPos) {
    if (!this.built) return;
    const { water, sky, letters, aurora, bolt } = this.parts;

    water.uniforms.uTime.value = t;
    sky.uniforms.uTime.value = t;
    letters.uniforms.uTime.value = t;
    aurora.update(t);
    bolt.update(dt, t);

    water.uniforms.uBolt.value.copy(bolt.boltTip);
    water.uniforms.uBoltI.value = bolt.flick;

    // infinite ocean: the plane and sky quietly follow the camera
    water.mesh.position.set(camPos.x, 0, camPos.z);
    sky.mesh.position.copy(camPos);
    this.parts.stars.position.copy(camPos);
  }

  surfaceY(x, z, t) { return waveHJS(x, z, t); }

  spawnPoint() {
    const b = this.bounds;
    return new THREE.Vector3(0, 26, b.maxZ + 55);
  }

  clampAvatar(pos, t) {
    const minY = this.surfaceY(pos.x, pos.z, t) + 2.2;
    if (pos.y < minY) pos.y = minY;
    if (pos.y > 420) pos.y = 420;
    const r = Math.hypot(pos.x, pos.z);
    if (r > 1500) {
      const k = 1500 / r;
      pos.x *= k; pos.z *= k;
    }
  }

  setTheme(theme) {
    if (!this.built) return;
    this.scene.background.set(theme.dive.deep);
    this.parts.water.setTheme(theme);
    this.parts.sky.setTheme(theme);
    this.parts.letters.setTheme(theme);
    this.parts.aurora.setTheme(theme);
  }

  disposeParts() {
    if (!this.parts) return;
    const { water, sky, letters, aurora, bolt, stars } = this.parts;
    this.scene.remove(water.mesh, sky.mesh, letters.mesh, aurora.group, bolt.group, stars);
    water.dispose(); sky.dispose(); letters.dispose(); aurora.dispose(); bolt.dispose();
    stars.geometry.dispose(); stars.material.dispose();
    this.parts = null;
    this.built = false;
    this.noteId = null;
  }
}
