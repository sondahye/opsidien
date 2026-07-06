import * as THREE from 'three';
import { THEMES } from './themes.js';
import { ForceLayout } from './graph/forceLayout.js';
import { GraphScene } from './graph/graphScene.js';
import { FlightControls } from './flight/FlightControls.js';
import { FollowCamera } from './flight/FollowCamera.js';
import { AvatarManager } from './avatar/avatars.js';
import { makeStars } from './fx/starfield.js';
import { setupPost } from './fx/postfx.js';
import { buildHUD } from './ui/hud.js';
import { Labels } from './ui/labels.js';
import { NotePanel } from './ui/notePanel.js';
import { DiveScene } from './dive/DiveScene.js';
import { clamp, damp, toast } from './util.js';

const BASE = import.meta.env.BASE_URL;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 9000);

// ---------------------------------------------------------------- galaxy
const galaxy = new THREE.Scene();
const stars = makeStars({});
galaxy.add(stars);
const hemi = new THREE.HemisphereLight('#3a4a7a', '#0a0d1a', 1.4);
galaxy.add(hemi);

// ---------------------------------------------------------------- dive
const dive = new DiveScene();

// ---------------------------------------------------------------- state
const state = {
  mode: 'galaxy',
  theme: THEMES[0],
  filters: { hubs: true, atts: false },
  hyper: 0,
  saved: null,          // galaxy snapshot while diving
  panelIdx: -1,
  dismissed: -1,
  simAcc: 0,
  labelTimer: 0,
  proxTimer: 0,
};

let graph = null;
let layout = null;
let gscene = null;

// controls: one pair per world, same canvas, gated by .enabled
const fc = new FlightControls(canvas);
const dc = new FlightControls(canvas);
dc.enabled = false;
dc.pitchLim = 1.2;

const followG = new FollowCamera(camera);
const followD = new FollowCamera(camera, { dist: 13, height: 3, lag: 4.6 });

const avatarG = new AvatarManager(galaxy);
avatarG.set('dart');
const avatarD = new AvatarManager(dive.scene);
avatarD.set('wisp');

const post = setupPost(renderer, galaxy, camera);

// ---------------------------------------------------------------- UI
const labels = new Labels(document.getElementById('labels'));
const fadeEl = document.getElementById('fade');
const helpEl = document.getElementById('help');
const loadingEl = document.getElementById('loading');

function fadeTransition(cb) {
  fadeEl.style.opacity = '1';
  setTimeout(async () => {
    await cb();
    fadeEl.style.opacity = '0';
  }, 300);
}

const panel = new NotePanel(document.getElementById('note-panel'), {
  onDive: (node) => enterDive(node._idx),
  onWiki: (label) => {
    const idx = gscene.findByLabel(label);
    if (idx < 0) { toast(`"${label}" — not in the graph`); return; }
    const v = new THREE.Vector3();
    gscene.positionOf(idx, v);
    fc.flyTo(v);
    panel.close();
    toast(`→ ${graph.nodes[idx].label}`);
  },
  onClose: () => { state.dismissed = state.panelIdx; state.panelIdx = -1; },
});

const hud = buildHUD(document.getElementById('hud'), {
  themes: THEMES,
  on: {
    theme: (id) => applyTheme(THEMES.find((t) => t.id === id)),
    avatar: (k) => avatarG.set(k),
    speed: (v) => { fc.maxSpeed = v; dc.maxSpeed = v * 0.8; },
    spread: (v) => { layout.setSpread(v); layout.reheat(0.35); },
    hubs: (v) => { state.filters.hubs = v; refilter(); },
    atts: (v) => { state.filters.atts = v; refilter(); },
  },
});
document.getElementById('help-close').addEventListener('click', () => (helpEl.hidden = true));

// ---------------------------------------------------------------- notes
const textCache = new Map();
async function getText(idx) {
  const node = graph.nodes[idx];
  if (textCache.has(node.id)) return textCache.get(node.id);
  let text;
  if (node.type === 'note') {
    try {
      const res = await fetch(BASE + 'vault-data/' + node.file);
      text = res.ok ? await res.text() : `# ${node.label}\n\n_note file missing — re-run the vault script_`;
    } catch {
      text = `# ${node.label}\n\n_could not load note text_`;
    }
  } else if (node.type === 'hub') {
    const back = new Set();
    for (const l of graph.links) {
      if (l.t === idx) back.add(graph.nodes[l.s].label);
      if (l.s === idx) back.add(graph.nodes[l.t].label);
    }
    text = `# ${node.label}\n\n_Synthesized hub — no note exists yet. Linked from:_\n\n` +
      [...back].map((b) => `- [[${b}]]`).join('\n');
  } else {
    text = `# ${node.label}\n\n_Attachment — the original file lives in your vault._`;
  }
  textCache.set(node.id, text);
  return text;
}

let opening = -1;
async function openPanel(idx, { auto = false } = {}) {
  if (idx < 0 || state.panelIdx === idx) return;
  opening = idx;
  const text = await getText(idx);
  if (opening !== idx) return;
  state.panelIdx = idx;
  panel.open(graph.nodes[idx], text, { auto });
}

// ---------------------------------------------------------------- filters / theme
function refilter() {
  gscene.refresh(state.filters);
  layout.reheat(0.3);
  updateStats();
}

function applyTheme(theme) {
  state.theme = theme;
  hud.setTheme(theme.id);
  galaxy.background = new THREE.Color(theme.bg);
  galaxy.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);
  stars.material.color.set(theme.stars.color);
  hemi.color.set(theme.hemi[0]);
  hemi.groundColor.set(theme.hemi[1]);
  hemi.intensity = theme.hemi[2];
  gscene?.setTheme(theme);
  dive.setTheme(theme);
  post.setBloom(state.mode === 'dive' ? theme.dive.bloom : theme.bloom);
}

function updateStats() {
  if (!graph) return;
  const s = graph.stats;
  hud.setStats(
    `<span class="val">${s.notes}</span> notes · <span class="val">${s.hubs}</span> hubs · ` +
    `<span class="val">${s.attachments}</span> atts<br><span class="val">${s.links}</span> links · ` +
    `vault <span class="val">${graph.vault}</span>`
  );
}

// ---------------------------------------------------------------- dive transitions
async function enterDive(idx) {
  const node = graph.nodes[idx];
  if (node.type === 'att') { toast('attachments have no inside'); return; }
  const text = await getText(idx);

  fadeTransition(() => {
    state.saved = {
      pos: fc.pos.clone(), vel: fc.vel.clone(),
      yaw: fc.yaw, pitch: fc.pitch,
      cam: camera.position.clone(),
    };
    if (dive.noteId !== node.id) dive.build(node.id, text, state.theme);

    const spawn = dive.spawnPoint();
    dc.pos.copy(spawn);
    dc.vel.set(0, 0, 0);
    dc.yaw = 0;
    dc.pitch = -0.14;
    dc.autoTarget = null;
    followD.snap();

    fc.enabled = false;
    dc.enabled = true;
    state.mode = 'dive';
    panel.close();
    post.setScene(dive.scene, camera);
    post.setBloom(state.theme.dive.bloom);
    toast('V · Esc Esc — return to the galaxy', 3200);
  });
}

function exitDive() {
  if (state.mode !== 'dive' || !state.saved) return;
  fadeTransition(() => {
    const s = state.saved;
    fc.pos.copy(s.pos);
    fc.vel.copy(s.vel);
    fc.yaw = s.yaw;
    fc.pitch = s.pitch;
    followG.cur.copy(s.cam);
    followG.init = true;

    dc.enabled = false;
    fc.enabled = true;
    state.mode = 'galaxy';
    state.saved = null;
    post.setScene(galaxy, camera);
    post.setBloom(state.theme.bloom);
  });
}

// ---------------------------------------------------------------- input
canvas.addEventListener('mousedown', (e) => {
  const locked = document.pointerLockElement === canvas;
  if (state.mode === 'galaxy' && gscene) {
    if (locked) {
      const idx = gscene.pickCenter(camera);
      if (idx >= 0) openPanel(idx);
      return;
    }
    const ndc = {
      x: (e.clientX / innerWidth) * 2 - 1,
      y: -(e.clientY / innerHeight) * 2 + 1,
    };
    const idx = gscene.pickNDC(ndc.x, ndc.y, camera);
    if (idx >= 0) { openPanel(idx); return; }
  }
  if (!locked) (state.mode === 'dive' ? dc : fc).requestLock();
});

addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyV':
      if (state.mode === 'dive') exitDive();
      else if (panel.isOpen && panel.node) enterDive(panel.node._idx);
      else toast('open a note first — fly close or click it');
      break;
    case 'KeyZ':
      document.body.classList.toggle('zen');
      break;
    case 'KeyT': {
      const i = THEMES.indexOf(state.theme);
      applyTheme(THEMES[(i + 1) % THEMES.length]);
      toast(state.theme.name.toLowerCase());
      break;
    }
    case 'KeyH':
      helpEl.hidden = !helpEl.hidden;
      break;
    case 'Escape':
      if (!helpEl.hidden) { helpEl.hidden = true; break; }
      if (state.mode === 'dive' && !document.pointerLockElement) exitDive();
      else if (panel.isOpen && !document.pointerLockElement) panel.close();
      break;
  }
});

// ---------------------------------------------------------------- load graph
async function load() {
  let data;
  try {
    const res = await fetch(BASE + 'vault-data/graph.json');
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    loadingEl.innerHTML =
      `<div class="err">no vault data found.<br><br>` +
      `generate it first:<br><code>npm run vault -- /path/to/your/vault</code><br>` +
      `then reload.</div>`;
    return;
  }

  graph = data;
  graph.nodes.forEach((n, i) => { n._idx = i; });

  layout = new ForceLayout();
  layout.init(graph.nodes, graph.links);
  layout.setSpread(hud.values().spread);

  gscene = new GraphScene(galaxy, graph, layout);
  gscene.refresh(state.filters);

  applyTheme(state.theme);
  updateStats();

  fc.maxSpeed = hud.values().speed;
  dc.maxSpeed = hud.values().speed * 0.8;

  loadingEl.classList.add('done');
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
const _aim = new THREE.Vector3();
const _near = [];
let fovCur = 62;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const ctrl = state.mode === 'dive' ? dc : fc;
  const follow = state.mode === 'dive' ? followD : followG;

  // hyperdrive ramp
  const wantHyper = ctrl.keys.has('Space') && ctrl.enabled ? 1 : 0;
  state.hyper = damp(state.hyper, wantHyper, wantHyper > state.hyper ? 3.5 : 5, dt);
  ctrl.hyper = state.hyper;

  ctrl.update(dt);
  if (state.mode === 'dive') dive.clampAvatar(ctrl.pos, t);

  ctrl.getAim(_aim);
  const sp = ctrl.maxSpeed * (1 + ctrl.hyper * (ctrl.hyperMul - 1));
  const speed01 = clamp(ctrl.vel.length() / Math.max(ctrl.maxSpeed, 1), 0, 1.5);
  const avatar = state.mode === 'dive' ? avatarD : avatarG;
  avatar.update({
    dt, t,
    pos: ctrl.pos, yaw: ctrl.yaw, pitch: ctrl.pitch,
    yawRate: ctrl.yawRateS, speed01: Math.min(speed01, 1),
    hyper: state.hyper, vy: ctrl.vel.y,
  });
  follow.update(dt, ctrl.pos, _aim);

  // FOV kick under hyperdrive
  const fovTarget = 62 + state.hyper * 22;
  fovCur = damp(fovCur, fovTarget, 6, dt);
  if (Math.abs(camera.fov - fovCur) > 0.01) {
    camera.fov = fovCur;
    camera.updateProjectionMatrix();
  }

  if (state.mode === 'galaxy') {
    // simulation: fixed substeps, freezes solid when settled
    if (layout.running) {
      state.simAcc += dt;
      let steps = Math.min(3, Math.floor(state.simAcc * 60));
      state.simAcc -= steps / 60;
      if (steps > 0) {
        layout.step(steps);
        gscene.updatePositions();
      }
    }

    stars.position.copy(camera.position);

    // labels
    state.labelTimer -= dt;
    if (state.labelTimer <= 0) {
      state.labelTimer = 0.12;
      gscene.collectNear(ctrl.pos, 130, _near);
      labels.update(camera, _near);
    }

    // proximity panel
    state.proxTimer -= dt;
    if (state.proxTimer <= 0) {
      state.proxTimer = 0.1;
      const { index, dist } = gscene.nearestVisible(ctrl.pos, 80);
      if (index >= 0) {
        const openDist = gscene.radii[index] * 2 + 6;
        if (state.dismissed >= 0 &&
            (state.dismissed !== index || dist > openDist + 8)) {
          state.dismissed = -1;
        }
        if (dist < openDist && index !== state.dismissed &&
            state.panelIdx !== index && !panel.isOpen) {
          openPanel(index, { auto: true });
        } else if (panel.isOpen && panel.auto &&
                   (state.panelIdx !== index || dist > openDist + 8)) {
          panel.close();
        }
      } else {
        state.dismissed = -1;
        if (panel.isOpen && panel.auto) panel.close();
      }
    }
  } else {
    dive.update(dt, t, camera.position);
    labels.hide();
  }

  post.hyper.uniforms.uAmt.value = state.hyper;
  post.hyper.uniforms.uTime.value = t;
  post.composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});

load();
