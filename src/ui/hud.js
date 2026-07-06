export function buildHUD(root, { themes, on }) {
  root.innerHTML = `
    <div class="title">VAULT GALAXY <button id="btnHelp" title="help (H)">?</button></div>
    <label><span class="k">theme</span><select id="selTheme"></select></label>
    <label><span class="k">avatar</span>
      <select id="selAvatar">
        <option value="dart">dart</option>
        <option value="blob">blob</option>
      </select>
    </label>
    <label><span class="k">speed</span><input type="range" id="rngSpeed" min="6" max="140" step="1" value="22"></label>
    <label><span class="k">spread</span><input type="range" id="rngSpread" min="24" max="160" step="1" value="60"></label>
    <label class="chk"><input type="checkbox" id="chkHubs" checked> synthesized hubs</label>
    <label class="chk"><input type="checkbox" id="chkAtts"> attachments</label>
    <div class="stats" id="stats"></div>
  `;

  const $ = (id) => root.querySelector('#' + id);
  const selTheme = $('selTheme');
  for (const t of themes) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name.toLowerCase();
    selTheme.appendChild(o);
  }

  selTheme.addEventListener('change', () => on.theme(selTheme.value));
  $('selAvatar').addEventListener('change', (e) => on.avatar(e.target.value));
  $('rngSpeed').addEventListener('input', (e) => on.speed(+e.target.value));
  $('rngSpread').addEventListener('input', (e) => on.spread(+e.target.value));
  $('chkHubs').addEventListener('change', (e) => on.hubs(e.target.checked));
  $('chkAtts').addEventListener('change', (e) => on.atts(e.target.checked));
  $('btnHelp').addEventListener('click', () => on.help());

  return {
    values: () => ({
      theme: selTheme.value,
      avatar: $('selAvatar').value,
      speed: +$('rngSpeed').value,
      spread: +$('rngSpread').value,
      hubs: $('chkHubs').checked,
      atts: $('chkAtts').checked,
    }),
    setTheme: (id) => { selTheme.value = id; },
    setStats: (txt) => { $('stats').innerHTML = txt; },
  };
}
