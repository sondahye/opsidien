#!/usr/bin/env node
// Scans an Obsidian vault and emits:
//   public/vault-data/graph.json        (nodes + links, small, loaded up front)
//   public/vault-data/notes/<hash>.md   (per-note text, fetched on demand)
//
// Usage: node scripts/build-vault.mjs <path-to-vault> [outDir]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ATT_EXT = new Set([
  'png','jpg','jpeg','gif','webp','svg','bmp','avif','ico',
  'pdf','mp3','wav','ogg','m4a','flac','mp4','webm','mov','mkv',
  'canvas','excalidraw','zip','pptx','docx','xlsx',
]);

const vaultArg = process.argv[2];
if (!vaultArg) {
  console.error('Usage: node scripts/build-vault.mjs <path-to-vault> [outDir]');
  process.exit(1);
}
const VAULT = path.resolve(vaultArg);
const OUT = path.resolve(process.argv[3] || 'public/vault-data');

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const posix = (p) => p.split(path.sep).join('/');

async function walk(dir, base, out) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else out.push(posix(path.relative(base, full)));
  }
}

function stripForScan(text) {
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')   // frontmatter
    .replace(/```[\s\S]*?```/g, '')                    // fenced code
    .replace(/`[^`\n]*`/g, '');                        // inline code
}

async function main() {
  try { await fs.access(VAULT); }
  catch {
    console.error(`Vault not found: ${VAULT}`);
    process.exit(1);
  }

  const files = [];
  await walk(VAULT, VAULT, files);
  const mdFiles = files.filter((f) => f.toLowerCase().endsWith('.md'));

  // Resolution indices (Obsidian-style: exact path first, then basename, shortest path wins)
  const mdByRel = new Map();   // lower rel (with .md) -> rel
  const mdByBase = new Map();  // lower basename (no ext) -> [rel]
  const anyByRel = new Map();  // lower rel -> rel (all files)
  const anyByBase = new Map(); // lower basename (with ext) -> [rel]
  for (const f of files) {
    anyByRel.set(f.toLowerCase(), f);
    const b = path.posix.basename(f).toLowerCase();
    if (!anyByBase.has(b)) anyByBase.set(b, []);
    anyByBase.get(b).push(f);
  }
  for (const f of mdFiles) {
    mdByRel.set(f.toLowerCase(), f);
    const b = path.posix.basename(f, path.posix.extname(f)).toLowerCase();
    if (!mdByBase.has(b)) mdByBase.set(b, []);
    mdByBase.get(b).push(f);
  }
  const shortest = (arr) => arr.slice().sort((a, b) => a.length - b.length)[0];

  const resolveNote = (target) => {
    let t = target.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
    if (mdByRel.has(t + '.md')) return mdByRel.get(t + '.md');
    const base = t.split('/').pop();
    if (mdByBase.has(base)) return shortest(mdByBase.get(base));
    return null;
  };
  const resolveFile = (target) => {
    const t = target.replace(/\\/g, '/').toLowerCase();
    if (anyByRel.has(t)) return anyByRel.get(t);
    const base = t.split('/').pop();
    if (anyByBase.has(base)) return shortest(anyByBase.get(base));
    return null;
  };

  // Nodes
  const nodes = [];
  const idx = new Map(); // id -> index
  const addNode = (n) => { idx.set(n.id, nodes.length); nodes.push(n); return nodes.length - 1; };

  const noteIdx = new Map(); // rel -> index
  for (const rel of mdFiles) {
    const label = path.posix.basename(rel, '.md');
    const folder = path.posix.dirname(rel);
    const h = hash(rel);
    const i = addNode({
      id: 'n:' + h, label,
      type: 'note',
      folder: folder === '.' ? '/' : folder,
      file: 'notes/' + h + '.md',
      deg: 0,
    });
    noteIdx.set(rel, i);
  }

  const hubIdx = new Map(); // lower name -> index
  const getHub = (name) => {
    const key = name.toLowerCase();
    if (hubIdx.has(key)) return hubIdx.get(key);
    const i = addNode({ id: 'h:' + hash('hub:' + key), label: name, type: 'hub', folder: '#hubs', deg: 0 });
    hubIdx.set(key, i);
    return i;
  };

  const attIdx = new Map(); // key -> index
  const getAtt = (target) => {
    const resolved = resolveFile(target);
    const key = (resolved || target).toLowerCase();
    if (attIdx.has(key)) return attIdx.get(key);
    const label = path.posix.basename(resolved || target);
    const i = addNode({ id: 'a:' + hash('att:' + key), label, type: 'att', folder: '#attachments', deg: 0 });
    attIdx.set(key, i);
    return i;
  };

  // Links
  const WIKI = /(!?)\[\[([^\[\]]+?)\]\]/g;
  const linkMap = new Map(); // "s|t|type" -> {s,t,type,n}
  const addLink = (s, t, type) => {
    if (s === t) return;
    const key = s + '|' + t + '|' + type;
    const cur = linkMap.get(key);
    if (cur) cur.n++;
    else linkMap.set(key, { s, t, type, n: 1 });
  };

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'notes'), { recursive: true });

  for (const rel of mdFiles) {
    const raw = await fs.readFile(path.join(VAULT, rel), 'utf8');
    const src = noteIdx.get(rel);
    await fs.writeFile(path.join(OUT, nodes[src].file), raw, 'utf8');

    const scan = stripForScan(raw);
    let m;
    WIKI.lastIndex = 0;
    while ((m = WIKI.exec(scan))) {
      const embed = m[1] === '!';
      let inner = m[2].split('|')[0].split('#')[0].split('^')[0].trim();
      if (!inner) continue;
      const ext = path.posix.extname(inner).slice(1).toLowerCase();

      if (ATT_EXT.has(ext) || (embed && ext && ext !== 'md')) {
        addLink(src, getAtt(inner), 'att');
        continue;
      }
      const noteRel = resolveNote(inner);
      if (noteRel) addLink(src, noteIdx.get(noteRel), 'link');
      else addLink(src, getHub(inner), 'link');
    }
  }

  const links = [...linkMap.values()];
  for (const l of links) { nodes[l.s].deg++; nodes[l.t].deg++; }

  const folders = [...new Set(nodes.map((n) => n.folder))].sort();
  const stats = {
    notes: mdFiles.length,
    hubs: hubIdx.size,
    attachments: attIdx.size,
    links: links.length,
  };

  const graph = {
    v: 1,
    generated: new Date().toISOString(),
    vault: path.basename(VAULT),
    stats, folders, nodes, links,
  };
  await fs.writeFile(path.join(OUT, 'graph.json'), JSON.stringify(graph), 'utf8');

  console.log(`✔ vault:  ${VAULT}`);
  console.log(`✔ output: ${OUT}`);
  console.log(`  notes ${stats.notes} · hubs ${stats.hubs} · attachments ${stats.attachments} · links ${stats.links}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
