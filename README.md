# Vault Galaxy

Fly through your Obsidian vault as a 3D graph. Notes are glowing bodies, links are lanes, missing link targets become synthesized hubs that anchor clusters — just like Obsidian's graph view, but you're inside it. Dive *into* a note and read its text floating on an endless night sea.

## Run

```bash
npm install
npm run vault -- /path/to/your/vault   # preprocess: graph.json + note texts
npm run dev
```

Sample vault data is pre-generated, so `npm install && npm run dev` works out of the box.

> The vault script copies your note text into `public/vault-data/`. Don't deploy that folder anywhere public unless you mean to.

## Controls

| input | action |
| --- | --- |
| click canvas | capture mouse (Esc releases) |
| mouse | turn heading, tilt view (no roll) |
| W / S | thrust forward / back along a level heading |
| A / D | strafe |
| E / Q | rise / descend |
| Space (hold) | hyperdrive — tunnel vision + speed lines |
| fly close / crosshair click | open note panel |
| V | dive into the open note · return |
| Esc ×2 | return from a dive |
| Z | zen mode (hide all UI) |
| T | cycle theme |
| H | help |

HUD: theme, avatar, speed, spread (link length), and instant toggles for synthesized hubs and attachments — no rebuild, the layout gently re-settles.

## How it fits together

- `scripts/build-vault.mjs` — scans the vault, parses `[[wikilinks]]`, resolves Obsidian-style (exact path → shortest basename). Unresolved targets become **hub** nodes; image/file links become **attachment** nodes (hidden by default). Emits `public/vault-data/graph.json` + one text file per note (fetched on demand).
- `src/graph/forceLayout.js` — 3D force sim over typed arrays with grid-accelerated repulsion. Cools and freezes solid; toggles/sliders reheat it gently. Seeds are hashed from note ids, so the constellation is stable across sessions.
- `src/flight/` — yaw-stable flight with weighty damping and a follow camera that keeps the avatar dead-center.
- `src/dive/` — the inside of a note: the text as instanced glyphs riding a shader ocean, a lightning walker whose wake scatters and re-forms letters (stateless GPU trail), aurora curtains woven from the same text, and a procedural sky the water actually reflects.
- `src/themes.js` — everything visual is data. Add a theme object and it appears in the HUD.
- `src/avatar/avatars.js` — avatars are factories returning `{ object, update, dispose }`. Add one to `AVATARS` and it's selectable.

## Notes

- Hubs are divable too — their "text" is synthesized from backlinks.
- Wikilinks inside the note panel are clickable: the ship autopilots to that node.
- Attachments have no interior; the panel just names the file.
