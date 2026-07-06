import * as THREE from 'three';

// Stable yaw-based flight. Mouse turns the heading and tilts the view (no
// roll). WASD thrusts along a *level* heading and strafes; E/Q rise/descend.
// Motion is deliberately weighty: velocity eases toward intent, then damps.
export class FlightControls {
  constructor(dom) {
    this.dom = dom;
    this.enabled = true;
    this.locked = false;

    this.yaw = 0;
    this.pitch = -0.08;
    this.pos = new THREE.Vector3(0, 14, 150);
    this.vel = new THREE.Vector3();

    this.maxSpeed = 22;
    this.hyperMul = 8;
    this.hyper = 0;            // 0..1, set externally
    this.accelResp = 2.6;
    this.brakeResp = 3.4;
    this.sens = 0.0023;
    this.pitchLim = 1.35;

    this.autoTarget = null;    // Vector3 — autopilot destination
    this.yawRateS = 0;
    this._yawPrev = 0;

    this.keys = new Set();
    this._bind();
  }

  requestLock() { this.dom.requestPointerLock?.(); }

  _bind() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      document.body.classList.toggle('locked', this.locked);
    });
    this.dom.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * this.sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * this.sens, -this.pitchLim, this.pitchLim);
    });
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.enabled && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        this.autoTarget = null;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  flyTo(v) { this.autoTarget = v.clone(); }

  getAim(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt) {
    const k = this.keys;
    const yaw = this.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const dir = new THREE.Vector3();
    if (this.enabled) {
      if (k.has('KeyW')) dir.add(fwd);
      if (k.has('KeyS')) dir.sub(fwd);
      if (k.has('KeyD')) dir.add(right);
      if (k.has('KeyA')) dir.sub(right);
      if (k.has('KeyE')) dir.y += 1;
      if (k.has('KeyQ')) dir.y -= 1;
    }

    const sp = this.maxSpeed * (1 + this.hyper * (this.hyperMul - 1));
    const target = new THREE.Vector3();
    const hasInput = dir.lengthSq() > 0;

    if (hasInput) {
      target.copy(dir.normalize()).multiplyScalar(sp);
    } else if (this.autoTarget && this.enabled) {
      const to = this.autoTarget.clone().sub(this.pos);
      const d = to.length();
      if (d < 5) {
        this.autoTarget = null;
      } else {
        target.copy(to).normalize().multiplyScalar(Math.min(sp, d * 0.9 + 6));
        // steer the view toward the destination
        const ty = Math.atan2(-to.x, -to.z);
        let dy = ((ty - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.yaw += dy * Math.min(1, dt * 2.2);
        const tp = Math.atan2(to.y, Math.hypot(to.x, to.z));
        this.pitch += (tp - this.pitch) * Math.min(1, dt * 2.2);
      }
    }

    const resp = hasInput || this.autoTarget ? this.accelResp : this.brakeResp;
    this.vel.lerp(target, 1 - Math.exp(-resp * dt));
    this.pos.addScaledVector(this.vel, dt);

    const rate = (this.yaw - this._yawPrev) / Math.max(dt, 1e-4);
    this.yawRateS += (rate - this.yawRateS) * Math.min(1, dt * 8);
    this._yawPrev = this.yaw;
  }
}
