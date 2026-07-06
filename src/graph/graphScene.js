import * as THREE from 'three';
import { folderColor } from '../themes.js';

// Renders the vault graph: one InstancedMesh for all nodes, one LineSegments
// for all links. Filter toggles just rewrite instance buffers — no rebuild.
export class GraphScene {
  constructor(scene, graph, layout) {
    this.graph = graph;
    this.layout = layout;

    const N = graph.nodes.length;
    const L = graph.links.length;

    this.radii = new Float32Array(N);
    this.degV = new Float32Array(N);
    this.visible = new Uint8Array(N);
    this.order = new Int32Array(N);      // instance slot -> node index
    this.slotOf = new Int32Array(N);     // node index -> instance slot (-1 hidden)
    this.count = 0;
    this.visibleLinks = [];

    const geo = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshBasicMaterial({ fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tmp = new THREE.Color('#ffffff');
    for (let i = 0; i < N; i++) this.mesh.setColorAt(i, tmp);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this.linkPos = new Float32Array(L * 2 * 3);
    this.linkCol = new Float32Array(L * 2 * 3);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(this.linkPos, 3).setUsage(THREE.DynamicDrawUsage));
    lgeo.setAttribute('color', new THREE.BufferAttribute(this.linkCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.linkMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.lines = new THREE.LineSegments(lgeo, this.linkMat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    this.nodeColors = new Array(N).fill(null).map(() => new THREE.Color());
    this._m = new THREE.Matrix4();
    this._ray = new THREE.Raycaster();
    this._ray.params.Mesh = {};
  }

  // Recompute visible sets, degrees, radii, buffers. Instant on toggle.
  refresh({ hubs, atts }) {
    const { graph, visible, order, slotOf } = this;
    const nodes = graph.nodes, links = graph.links;
    const N = nodes.length;

    for (let i = 0; i < N; i++) {
      const t = nodes[i].type;
      visible[i] = (t === 'note' || (t === 'hub' && hubs) || (t === 'att' && atts)) ? 1 : 0;
    }

    // visible degree -> size stays truthful under filters
    this.degV.fill(0);
    this.visibleLinks.length = 0;
    const linkMask = new Uint8Array(links.length);
    for (let li = 0; li < links.length; li++) {
      const l = links[li];
      if (visible[l.s] && visible[l.t]) {
        linkMask[li] = 1;
        this.visibleLinks.push(li);
        this.degV[l.s]++; this.degV[l.t]++;
      }
    }

    let c = 0;
    slotOf.fill(-1);
    for (let i = 0; i < N; i++) {
      if (!visible[i]) continue;
      order[c] = i;
      slotOf[i] = c;
      c++;
      const d = this.degV[i];
      this.radii[i] = Math.min(0.9 + Math.sqrt(d) * 0.55, 6.5);
    }
    this.count = c;
    this.mesh.count = c;
    this.lines.geometry.setDrawRange(0, this.visibleLinks.length * 2);

    this.layout.setActive(visible, linkMask);
    this.updatePositions();
  }

  setTheme(theme) {
    this.theme = theme;
    const { graph } = this;
    const folders = graph.folders;
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      const hex = n.type === 'hub' ? theme.hub : n.type === 'att' ? theme.att : folderColor(theme, n.folder, folders);
      this.nodeColors[i].set(hex);
    }
    this.linkMat.opacity = theme.linkOpacity;
    this._writeColors();
  }

  _writeColors() {
    const { count, order, nodeColors } = this;
    for (let s = 0; s < count; s++) this.mesh.setColorAt(s, nodeColors[order[s]]);
    this.mesh.instanceColor.needsUpdate = true;

    const dim = 0.5;
    const lp = this.linkCol;
    for (let k = 0; k < this.visibleLinks.length; k++) {
      const l = this.graph.links[this.visibleLinks[k]];
      const ca = nodeColors[l.s], cb = nodeColors[l.t];
      const o = k * 6;
      lp[o] = ca.r * dim; lp[o + 1] = ca.g * dim; lp[o + 2] = ca.b * dim;
      lp[o + 3] = cb.r * dim; lp[o + 4] = cb.g * dim; lp[o + 5] = cb.b * dim;
    }
    this.lines.geometry.attributes.color.needsUpdate = true;
  }

  updatePositions() {
    const { layout, count, order, radii } = this;
    const { px, py, pz } = layout;
    const m = this._m;
    for (let s = 0; s < count; s++) {
      const i = order[s];
      const r = radii[i];
      m.makeScale(r, r, r);
      m.setPosition(px[i], py[i], pz[i]);
      this.mesh.setMatrixAt(s, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    const lp = this.linkPos;
    for (let k = 0; k < this.visibleLinks.length; k++) {
      const l = this.graph.links[this.visibleLinks[k]];
      const o = k * 6;
      lp[o] = px[l.s]; lp[o + 1] = py[l.s]; lp[o + 2] = pz[l.s];
      lp[o + 3] = px[l.t]; lp[o + 4] = py[l.t]; lp[o + 5] = pz[l.t];
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this._writeColors();
  }

  // Ray from camera center (crosshair pick).
  pickCenter(camera) {
    this._ray.setFromCamera({ x: 0, y: 0 }, camera);
    return this._pick();
  }
  pickNDC(x, y, camera) {
    this._ray.setFromCamera({ x, y }, camera);
    return this._pick();
  }
  _pick() {
    const hits = this._ray.intersectObject(this.mesh);
    if (!hits.length) return -1;
    return this.order[hits[0].instanceId];
  }

  nearestVisible(pos, maxD = Infinity) {
    const { count, order, layout } = this;
    const { px, py, pz } = layout;
    let best = -1, bd = maxD * maxD;
    for (let s = 0; s < count; s++) {
      const i = order[s];
      const dx = px[i] - pos.x, dy = py[i] - pos.y, dz = pz[i] - pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return { index: best, dist: best >= 0 ? Math.sqrt(bd) : Infinity };
  }

  // Nodes near the camera, for the label pool.
  collectNear(pos, maxD, out) {
    out.length = 0;
    const { count, order, layout, graph, radii } = this;
    const { px, py, pz } = layout;
    const m2 = maxD * maxD;
    for (let s = 0; s < count; s++) {
      const i = order[s];
      const dx = px[i] - pos.x, dy = py[i] - pos.y, dz = pz[i] - pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < m2) out.push({ i, x: px[i], y: py[i], z: pz[i], d: Math.sqrt(d2), r: radii[i], label: graph.nodes[i].label });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  positionOf(i, v) {
    const { px, py, pz } = this.layout;
    return v.set(px[i], py[i], pz[i]);
  }

  findByLabel(label) {
    const q = label.toLowerCase();
    const nodes = this.graph.nodes;
    let hub = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].label.toLowerCase() === q) {
        if (nodes[i].type === 'note') return i;
        if (hub < 0) hub = i;
      }
    }
    return hub;
  }
}
