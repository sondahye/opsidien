import * as THREE from 'three';

// Third-person follow camera. Position is smoothed (the world swings around),
// but lookAt is exact every frame — the avatar never leaves screen center.
export class FollowCamera {
  constructor(camera, { dist = 11, height = 2.4, lag = 5.2 } = {}) {
    this.cam = camera;
    this.dist = dist;
    this.height = height;
    this.lag = lag;
    this.cur = new THREE.Vector3();
    this.init = false;
    this._desired = new THREE.Vector3();
  }

  snap() { this.init = false; }

  update(dt, pos, aim) {
    const d = this._desired;
    d.copy(pos).addScaledVector(aim, -this.dist);
    d.y += this.height * (1 - Math.abs(aim.y) * 0.35);

    if (!this.init) { this.cur.copy(d); this.init = true; }
    else this.cur.lerp(d, 1 - Math.exp(-this.lag * dt));

    this.cam.position.copy(this.cur);
    this.cam.lookAt(pos);
  }
}
