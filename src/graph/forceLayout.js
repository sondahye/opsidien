import { hashString, mulberry32 } from '../util.js';

// Force-directed 3D layout over typed arrays.
// Springs on links, grid-accelerated repulsion, mild center gravity
// (hub-weighted so highly-linked nodes settle toward the middle).
// Alpha cools each tick; below threshold the sim freezes dead — no jitter.
export class ForceLayout {
  constructor() {
    this.n = 0;
    this.spread = 60;
    this.alpha = 0;
    this.minAlpha = 0.004;
  }

  init(nodes, links) {
    const n = (this.n = nodes.length);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.fx = new Float32Array(n); this.fy = new Float32Array(n); this.fz = new Float32Array(n);
    this.deg = new Float32Array(n);
    this.active = new Uint8Array(n).fill(1);
    this.links = links; // [{s,t,n}] — filtered externally via linkActive
    this.linkActive = new Uint8Array(links.length).fill(1);

    for (const l of links) { this.deg[l.s] += 1; this.deg[l.t] += 1; }

    // Deterministic seeds — same vault, same constellation, every session.
    for (let i = 0; i < n; i++) {
      const rng = mulberry32(hashString(nodes[i].id));
      const isHub = nodes[i].type === 'hub';
      const r = this.spread * (isHub ? 0.9 + rng() * 0.8 : 2.0 + rng() * 2.4);
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      this.px[i] = r * Math.sin(ph) * Math.cos(th);
      this.py[i] = (r * Math.cos(ph)) * 0.6;
      this.pz[i] = r * Math.sin(ph) * Math.sin(th);
    }
    this.alpha = 1;
  }

  setActive(nodeMask, linkMask) {
    this.active = nodeMask;
    this.linkActive = linkMask;
  }

  setSpread(v) { this.spread = v; }

  reheat(a = 0.3) { this.alpha = Math.max(this.alpha, a); }

  get running() { return this.alpha >= this.minAlpha; }

  step(substeps = 1) {
    while (substeps-- > 0 && this.running) this._tick();
    if (!this.running) { this.vx.fill(0); this.vy.fill(0); this.vz.fill(0); }
  }

  _tick() {
    const { n, px, py, pz, vx, vy, vz, fx, fy, fz, deg, active } = this;
    const a = this.alpha;
    const spread = this.spread;
    fx.fill(0); fy.fill(0); fz.fill(0);

    // --- repulsion via spatial hash grid ---
    const cut = spread * 2.2;
    const cut2 = cut * cut;
    const inv = 1 / cut;
    const kr = spread * spread * 0.6;
    const grid = new Map();
    const key = (x, y, z) =>
      (((x + 512) & 1023)) | (((y + 512) & 1023) << 10) | (((z + 512) & 1023) << 20);
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const k = key((px[i] * inv) | 0, (py[i] * inv) | 0, (pz[i] * inv) | 0);
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(i);
    }
    const maxF = spread * 0.6;
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const cx = (px[i] * inv) | 0, cy = (py[i] * inv) | 0, cz = (pz[i] * inv) | 0;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const cell = grid.get(key(cx + ox, cy + oy, cz + oz));
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          let dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > cut2) continue;
          if (d2 < 0.01) { dx = (i - j) * 0.01; d2 = 0.01; }
          const d = Math.sqrt(d2);
          let f = kr / d2;
          if (f > maxF) f = maxF;
          const s = f / d;
          fx[i] += dx * s; fy[i] += dy * s; fz[i] += dz * s;
          fx[j] -= dx * s; fy[j] -= dy * s; fz[j] -= dz * s;
        }
      }
    }

    // --- springs along links ---
    const ks = 0.06;
    const links = this.links, lact = this.linkActive;
    for (let li = 0; li < links.length; li++) {
      if (!lact[li]) continue;
      const l = links[li];
      const i = l.s, j = l.t;
      let dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
      const rest = spread;
      const f = ks * (d - rest) * Math.min(l.n, 3);
      const s = f / d;
      fx[i] += dx * s; fy[i] += dy * s; fz[i] += dz * s;
      fx[j] -= dx * s; fy[j] -= dy * s; fz[j] -= dz * s;
    }

    // --- hub-weighted gravity toward origin ---
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const g = 0.015 * (0.5 + Math.min(deg[i], 30) * 0.06);
      fx[i] -= px[i] * g; fy[i] -= py[i] * g * 1.6; fz[i] -= pz[i] * g;
    }

    // --- integrate ---
    const velCap = spread * 0.35;
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      vx[i] = (vx[i] + fx[i] * a) * 0.6;
      vy[i] = (vy[i] + fy[i] * a) * 0.6;
      vz[i] = (vz[i] + fz[i] * a) * 0.6;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      if (sp > velCap) { const k = velCap / sp; vx[i] *= k; vy[i] *= k; vz[i] *= k; }
      px[i] += vx[i]; py[i] += vy[i]; pz[i] += vz[i];
    }

    this.alpha *= 0.985;
    if (this.alpha < this.minAlpha) this.alpha = 0;
  }
}
