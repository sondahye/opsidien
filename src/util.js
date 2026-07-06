import * as THREE from 'three';

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function dampV3(v, target, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt);
  v.x += (target.x - v.x) * k;
  v.y += (target.y - v.y) * k;
  v.z += (target.z - v.z) * k;
  return v;
}

let glowCache = new Map();
export function makeGlowTexture(hex = '#ffffff', size = 128) {
  const key = hex + size;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, hex);
  grd.addColorStop(0.35, hex + 'aa');
  grd.addColorStop(1, hex + '00');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowCache.set(key, tex);
  return tex;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Tiny, dependency-free markdown renderer for the note panel.
export function renderMarkdownMini(md) {
  let t = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  t = escapeHtml(t);
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`);
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/!\[\[([^\]]+)\]\]/g, (_, p) => `<span class="att">⬡ ${p}</span>`);
  t = t.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
    (_, tg, al) => `<span class="wl" data-t="${tg.trim()}">${al || tg}</span>`);
  t = t.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  t = t.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|\s)\*([^*\n]+)\*/g, '$1<i>$2</i>');
  t = t.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>');
  t = t.replace(/\r?\n\r?\n+/g, '</p><p>');
  t = t.replace(/\r?\n/g, '<br>');
  return `<p>${t}</p>`;
}

export function toast(msg, ms = 2200) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}
