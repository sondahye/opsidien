import * as THREE from 'three';

// A small pool of DOM labels. Titles fade in with proximity — diegetic,
// so they stay visible even in zen mode.
export class Labels {
  constructor(container, max = 26) {
    this.container = container;
    this.pool = [];
    for (let i = 0; i < max; i++) {
      const el = document.createElement('div');
      el.className = 'lb';
      container.appendChild(el);
      this.pool.push(el);
    }
    this._v = new THREE.Vector3();
    this.fadeNear = 14;
    this.fadeFar = 110;
  }

  update(camera, candidates) {
    const w = innerWidth, h = innerHeight;
    let used = 0;
    for (const c of candidates) {
      if (used >= this.pool.length) break;
      this._v.set(c.x, c.y + c.r + 0.6, c.z).project(camera);
      if (this._v.z > 1 || this._v.z < -1) continue;
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      if (x < -80 || x > w + 80 || y < -40 || y > h + 40) continue;
      const el = this.pool[used++];
      el.textContent = c.label;
      el.style.transform = `translate(-50%,-130%) translate(${x}px, ${y}px)`;
      const t = 1 - Math.min(1, Math.max(0, (c.d - this.fadeNear) / (this.fadeFar - this.fadeNear)));
      el.style.opacity = (t * t * 0.95).toFixed(3);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].style.opacity = '0';
  }

  hide() {
    for (const el of this.pool) el.style.opacity = '0';
  }
}
