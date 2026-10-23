/* builder.js -- the world builder's editor (server/generate.js, /world/ in
 * the builder view): the generated scenario as forms to change before
 * playing, a raw JSON box, and a top-down map of the layout with every
 * character labelled.
 *
 *   window.tfBuilder.show({ scenario, model?, ms? }, { appLink })
 *
 * Ask the AI for changes: a request goes to POST /api/revise with the
 * scenario (server/generate.js), the reply replaces it; undo steps back.
 * Tabletop map: the app's ?tabletop=1 view in a frame (app/tabletop.js), to
 * print, show on a flat screen, or move things; "use this layout" sends the
 * scenario back with every position fixed.
 *
 * Map preview: generated maps run procgen.js here (the same code the app
 * runs), grids are drawn as they are; "map" layout lines are placed by the
 * app itself, so for those only the explicit objects and positions show.
 */
(function () {
  const PEOPLE = ['woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard'];
  const MONSTERS = ['skeleton', 'skeleton_warrior', 'zombie', 'goblin', 'kobold', 'orc', 'rat', 'spider', 'wolf', 'bat', 'ghost', 'slime', 'demon', 'giant', 'dragon'];
  const OLDER = ['critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian'];
  const MINDLESS = new Set(['skeleton', 'skeleton_warrior', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon']);
  // scenario.js GRID_GLYPHS (materials and things)
  const GLYPHS = { '#': 'wall', '+': 'door', '~': 'water', ',': 'grass', ':': 'dirt', '^': 'stone', '&': 'lava', '=': 'wood', '_': 'oak',
    C: 'crate', B: 'barrel', M: 'mushroom', L: 'lamp', N: 'note', h: 'chest', w: 'workbench', t: 'table', n: 'bench', s: 'stool',
    o: 'cauldron', a: 'anvil', W: 'weapon_stand', '/': 'axe', p: 'pickaxe', u: 'bucket', b: 'bag', P: 'potion', S: 'scroll',
    $: 'coin_pile', D: 'desk', c: 'office_chair', A: 'armchair', F: 'sofa', T: 'coffee_table', l: 'floor_lamp', v: 'plant',
    K: 'bookcase', Y: 'player', '@': 'player', '-': 'sea', '%': 'tree', H: 'house', r: 'boulder', X: 'campfire', f: 'fence', I: 'signpost', j: 'lantern',
    '*': 'flowers', ';': 'grass_tuft', q: 'lily_pad on sea' };
  // procgen.js GEN_LEGEND comes with each generated grid's own legend
  const FLOOR = { wall: '#5d5852', door: '#8a5a2b', water: '#3d7fb8', sea: '#1d3d5c', grass: '#6f9a4c', dirt: '#a48558', stone: '#8d8a84', lava: '#d2541e',
    wood: '#9a6b3c', oak: '#b88a55', carpet: '#9b3a3a', tile: '#d9d6cf', concrete: '#a9a7a2', flagstone: '#9c958a', sand: '#d9c58e', floor: '#c9c2b4' };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let scn = null, meta = {}, voices = [], appLink = l => l;
  const past = [];   // undo: earlier versions of scn
  const remember = () => { past.push(JSON.stringify(scn)); if (past.length > 20) past.shift(); };
  fetch('/api/voices').then(r => r.ok ? r.json() : null).then(d => { if (d?.voices) { voices = d.voices; if (scn) render(); } }).catch(() => {});

  // ---- paths: "agents.0.style" ----
  function get(path) { return path.split('.').reduce((o, k) => o?.[k], scn); }
  function set(path, v) {
    const ks = path.split('.'); let o = scn;
    for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
    const last = ks[ks.length - 1];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete o[last]; else o[last] = v;
  }
  const field = (label, path, type = 'text', opts = {}) => {
    const v = get(path), id = 'f_' + path.replace(/\W/g, '_');
    const val = type === 'list' ? (v || []).map(i => typeof i === 'string' ? i : i?.name).join(', ') : type === 'json' ? (v == null ? '' : JSON.stringify(v, null, 1)) : (v ?? '');
    let input;
    if (type === 'area' || type === 'json' || type === 'lines') input = `<textarea id="${id}" data-path="${path}" data-type="${type}" rows="${opts.rows || 3}" ${type !== 'area' ? 'class="mono"' : ''}>${esc(type === 'lines' ? (v || []).join('\n') : val)}</textarea>`;
    else if (type === 'select') input = `<select id="${id}" data-path="${path}" data-type="text">${opts.options.map(o => { const [k, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}"${String(k) === String(v ?? opts.def ?? '') ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
    else input = `<input id="${id}" data-path="${path}" data-type="${type}" value="${esc(val)}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}>`;
    return `<label class="${opts.wide ? 'wide' : ''}"><span>${label}</span>${input}</label>`;
  };
  function readInput(el) {
    const t = el.dataset.type, raw = el.value;
    if (t === 'num') return raw === '' ? undefined : +raw;
    if (t === 'list') return raw.split(',').map(s => s.trim()).filter(Boolean);
    if (t === 'lines') return raw.split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.length);
    if (t === 'bool3') return raw === '' ? undefined : raw === 'true';
    if (t === 'json') { if (!raw.trim()) return undefined; try { const v = JSON.parse(raw); el.classList.remove('bad'); return v; } catch { el.classList.add('bad'); throw new Error('bad JSON'); } }
    return raw;
  }
  const modelOptions = [['', '(critter)'], ...PEOPLE.map(m => [m, 'person: ' + m]), ...MONSTERS.map(m => [m, 'monster: ' + m]), ...OLDER.filter(m => m !== 'critter').map(m => [m, 'chibi: ' + m])];
  const voiceOptions = () => [['', '(fits the body)'], ...(voices.length ? voices : ['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius'].map(id => ({ id }))).map(v => ['builtin:' + v.id, v.id + (v.gender || v.description ? ' (' + [v.gender, v.description].filter(Boolean).join(', ') + ')' : '')])];

  function agentBox(a, i) {
    const p = 'agents.' + i, hostile = a.hostile == null ? '' : String(!!a.hostile);
    return `<fieldset class="agent"><legend>${esc(a.id || 'character ' + (i + 1))} <button type="button" class="ghost small" data-remove="${i}">remove</button></legend><div class="cols">
      ${field('id', p + '.id')}${field('body', p + '.model', 'select', { options: modelOptions })}${field('voice', p + '.ttsVoiceId', 'select', { options: voiceOptions() })}
      <label><span>hostile</span><select data-path="${p}.hostile" data-type="bool3"><option value=""${hostile === '' ? ' selected' : ''}>auto${MINDLESS.has(a.model) ? ' (yes)' : ' (no)'}</option><option value="true"${hostile === 'true' ? ' selected' : ''}>yes: fights, no LLM</option><option value="false"${hostile === 'false' ? ' selected' : ''}>no: talks</option></select></label>
      ${field('hit points', p + '.hp', 'num', { ph: 'default' })}${field('wields', p + '.wield')}
      ${field('style (a few words)', p + '.style', 'text', { wide: true })}
      ${field('personality / brief', p + '.personality', 'area', { wide: true, rows: 5 })}
      ${field('allowed commands (comma)', p + '.allowed', 'list', { wide: true, ph: 'scenario default' })}
      ${field('gold', p + '.inventory.gold', 'num')}${field('items (comma)', p + '.inventory.items', 'list')}${scn.generate ? field('in (place)', p + '.in') : field('at [x, z]', p + '.at', 'json', { rows: 1 })}
    </div></fieldset>`;
  }
  function mapBox() {
    if (!scn.generate && !scn.grid?.length && (scn.objects?.length || 0) > 40) return `<p class="muted">Fixed layout: ${scn.objects.length} objects and ${scn.paint?.length || 0} floor tiles at exact positions (moved in the tabletop map). Move things there, or ask the AI for changes.${scn.places?.length ? ' Rooms: ' + esc(scn.places.map(p => p.id).join(', ')) + '.' : ''}</p>
      ${field('board size [columns, rows]', 'size', 'json', { rows: 1 })}`;
    if (scn.generate) return `<div class="cols">${field('kind', 'generate.kind', 'select', { options: ['dungeon', 'village'] })}${field(scn.generate.kind === 'village' ? 'buildings' : 'rooms', scn.generate.kind === 'village' ? 'generate.buildings' : 'generate.rooms', 'num')}${field('seed', 'generate.seed', 'num')}</div>
      ${field('objects (JSON)', 'objects', 'json', { wide: true, rows: 4 })}`;
    if (scn.grid?.length) return `${field('grid (top = north, left = west; digits are the characters in order)', 'grid', 'lines', { wide: true, rows: Math.min(30, scn.grid.length + 1) })}
      ${field('legend (JSON)', 'legend', 'json', { wide: true, rows: 2 })}${field('objects (JSON)', 'objects', 'json', { wide: true, rows: 3 })}${field('map lines', 'map', 'lines', { wide: true, rows: 3 })}`;
    return `${field('map lines', 'map', 'lines', { wide: true, rows: Math.min(20, (scn.map?.length || 2) + 1) })}${field('objects (JSON)', 'objects', 'json', { wide: true, rows: 4 })}`;
  }
  function render() {
    const box = $('editor'); if (!box || !scn) return;
    box.hidden = false;
    const typed = $('aiReq')?.value || '', said = $('aiMsg')?.textContent || '';
    box.innerHTML = `<div class="toolbar"><button type="button" data-act="play">▶ play</button><button type="button" class="ghost" data-act="dev">play in dev mode</button>
        <button type="button" data-act="table">tabletop map</button><button type="button" class="ghost" data-act="map">quick map</button><button type="button" class="ghost" data-act="copy">copy link</button><button type="button" class="ghost" data-act="download">download JSON</button><span id="edmsg" class="muted"></span></div>
      <fieldset class="ask"><legend>Ask the AI for changes</legend>
        <textarea id="aiReq" rows="2" placeholder="e.g. make the goblin a nervous shopkeeper who sells potions; add a locked treasure room with a dragon"></textarea>
        <div class="toolbar"><button type="button" data-act="ask">ask</button><button type="button" class="ghost" data-act="undo" ${past.length ? '' : 'disabled'}>undo${past.length ? ' (' + past.length + ')' : ''}</button><span id="aiMsg" class="muted"></span></div></fieldset>
      <fieldset><legend>Story</legend><div class="cols">${field('title', 'title')}${field('subtitle', 'subtitle')}
        ${field('lighting', 'lighting', 'select', { options: [['', '(default)'], 'bright', 'night', 'dim'] })}${field('walls', 'walls', 'select', { options: [['', '(default)'], 'stone', 'tabletop', 'block', 'modern'] })}
        <label><span>dark (fog of war, torches)</span><select data-path="dark" data-type="bool3"><option value=""${scn.dark == null ? ' selected' : ''}>auto (dungeons: yes)</option><option value="true"${scn.dark === true ? ' selected' : ''}>yes</option><option value="false"${scn.dark === false ? ' selected' : ''}>no</option></select></label>
        ${field('intro', 'intro', 'area', { wide: true })}${field('goal (what the player is told)', 'goal.text', 'area', { wide: true, rows: 2 })}
        ${field('win / lose rules (JSON: {"win": ..., "lose": ...})', '__rules', 'json', { wide: true, rows: 3 })}</div></fieldset>
      <fieldset><legend>Player</legend><div class="cols">${field('name', 'player.name')}${field('body', 'player.model', 'select', { options: modelOptions })}${field('gold', 'player.gold', 'num')}${field('hit points', 'player.hp', 'num', { ph: '20' })}${field('items (comma)', 'player.items', 'list')}${field('wields', 'player.wield')}</div></fieldset>
      <fieldset><legend>Characters</legend>${(scn.agents || []).map(agentBox).join('')}<button type="button" class="ghost" data-act="add">+ add a character</button></fieldset>
      <fieldset><legend>Map${scn.generate ? ' (generated ' + esc(scn.generate.kind || 'dungeon') + ')' : scn.grid?.length ? ' (ASCII grid)' : ' (layout lines)'}</legend>${mapBox()}</fieldset>
      <details><summary>raw JSON</summary><textarea id="rawJson" class="mono" rows="18"></textarea><div class="toolbar"><button type="button" class="ghost" data-act="applyRaw">apply JSON</button></div></details>`;
    if (typed) $('aiReq').value = typed; if (said) $('aiMsg').textContent = said;
    // the rules box edits goal.win / goal.lose / goal.maxTurns together
    const rules = $('f___rules'); if (rules) { const g = scn.goal || {}; const r = {}; for (const k of ['win', 'lose', 'maxTurns', 'winText', 'loseText', 'score']) if (g[k] != null) r[k] = g[k]; rules.value = Object.keys(r).length ? JSON.stringify(r, null, 1) : ''; }
  }
  function onInput(e) {
    const el = e.target; if (!el.dataset?.path) return;
    try {
      const v = readInput(el);
      if (el.dataset.path === '__rules') { scn.goal = { ...(scn.goal?.text ? { text: scn.goal.text } : {}), ...(v || {}) }; if (!Object.keys(scn.goal).length) delete scn.goal; }
      else set(el.dataset.path, v);
      msg('');
    } catch (err) { msg(err.message); }
    if (el.tagName === 'SELECT' && /\.(model|hostile)$|^generate\.kind$/.test(el.dataset.path)) render();
  }
  const msg = t => { const m = $('edmsg'); if (m) m.textContent = t; };

  async function encode(obj) {
    const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(JSON.stringify(obj))); w.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function link(dev) { const l = appLink('/app/#s=' + await encode(scn)); return dev ? (l.includes('/app/?') ? l.replace('/app/?', '/app/?dev=1&') : l.replace('/app/#', '/app/?dev=1#')) : l; }

  document.addEventListener('input', e => { if (e.target.closest?.('#editor')) onInput(e); });
  document.addEventListener('change', e => { if (e.target.closest?.('#editor') && e.target.tagName === 'SELECT') onInput(e); });
  document.addEventListener('toggle', e => { if (e.target.tagName === 'DETAILS' && e.target.open && $('rawJson')) $('rawJson').value = JSON.stringify(scn, null, 2); }, true);
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('#editor button, #mapView button, #tableView button'); if (!b) return;
    if (b.dataset.act === 'closeTable') { $('tableView').hidden = true; $('tableView').querySelector('iframe').src = 'about:blank'; return; }
    const act = b.dataset.act;
    if (b.dataset.remove != null) { remember(); scn.agents.splice(+b.dataset.remove, 1); render(); return; }
    if (act === 'play' || act === 'dev') window.open(await link(act === 'dev'), '_blank');
    else if (act === 'copy') { await navigator.clipboard.writeText(location.origin + await link(false)); msg('link copied'); }
    else if (act === 'download') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(scn, null, 2)], { type: 'application/json' })); a.download = (scn.title || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json'; a.click(); }
    else if (act === 'add') { (scn.agents ||= []).push({ id: 'npc' + (scn.agents.length + 1), model: 'villager', style: 'villager', personality: '' }); render(); }
    else if (act === 'applyRaw') { try { const v = JSON.parse($('rawJson').value); remember(); scn = v; render(); msg('applied'); } catch (err) { msg('bad JSON: ' + err.message); } }
    else if (act === 'map') showMap();
    else if (act === 'closeMap') $('mapView').hidden = true;
    else if (act === 'ask') ask();
    else if (act === 'undo' && past.length) { scn = JSON.parse(past.pop()); render(); msg('undone'); }
    else if (act === 'table') showTable();
  });

  // ---- ask the AI for changes ----
  let asking = false;
  async function ask() {
    const req = $('aiReq')?.value.trim(); if (!req || asking) return;
    const say = t => { const m = $('aiMsg'); if (m) m.textContent = t; };
    asking = true; say('asking…');
    try {
      const r = await fetch('/api/revise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: scn, request: req }) });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', done = null;
      for (;;) {
        const { value, done: end } = await rd.read(); if (end) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = chunk.match(/^event: (.*)$/m)?.[1], data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] || '{}');
          if (ev === 'progress') say(data.stage === 'writing' || data.stage === 'repairing' ? `${data.stage}… ${data.chars} characters` : data.stage === 'problems' ? 'fixing: ' + data.problems.join('; ').slice(0, 160) : data.stage === 'thinking' ? 'thinking…' : `asking ${data.model || ''}…`);
          else if (ev === 'failed') throw new Error(data.error);
          else if (ev === 'done') done = data;
        }
      }
      if (!done) throw new Error('no answer');
      remember(); scn = done.scenario; render();
      $('aiReq').value = ''; say(`changed in ${Math.round(done.ms / 1000)} s${done.warnings?.length ? ' · notes: ' + done.warnings.join('; ') : ''}`);
    } catch (e) { say('failed: ' + e.message); }
    finally { asking = false; }
  }

  // ---- tabletop map (the app's ?tabletop=1 view in a frame) ----
  async function showTable() {
    let v = $('tableView');
    if (!v) {
      v = document.createElement('div'); v.id = 'tableView';
      v.innerHTML = `<div class="tvbar"><b>tabletop map</b><span id="tvMsg" class="muted">print it, show it on a screen laid flat, or tick "move things" to rearrange and then "use this layout"</span><span style="flex:1"></span><button type="button" data-act="closeTable">close</button></div><iframe title="tabletop map" allow="fullscreen"></iframe>`;
      document.body.appendChild(v);
    }
    v.hidden = false;
    v.querySelector('iframe').src = '/app/?tabletop=1#s=' + await encode(scn);
  }
  addEventListener('message', e => {
    if (e.origin !== location.origin || e.data?.type !== 'tablefolk-layout' || !e.data.scenario) return;
    remember(); scn = e.data.scenario; render();
    const t = 'layout updated: every position is fixed now (the generator\'s rooms and seed no longer apply; undo goes back)';
    msg(t); const m = $('tvMsg'); if (m) m.textContent = t;
  });

  // ---- top-down map ----
  function layoutForMap() {
    let s = JSON.parse(JSON.stringify(scn)), places = [];
    if (s.generate && window.TablefolkProcgen) { const r = window.TablefolkProcgen.applyToScenario(s); s = r.scenario; places = r.places || []; }
    const grid = Array.isArray(s.grid) ? s.grid : s.grid ? String(s.grid).split('\n') : [];
    if (!grid.length) return null;
    const H = grid.length, W = Math.max(...grid.map(r => [...r].length));
    const x0 = Math.floor((W - 1) / 2), z0 = Math.floor((H - 1) / 2), rc = (x, z) => [Math.round(z) + z0, x0 - Math.round(x)];
    const legend = { ...GLYPHS }; for (const [k, v] of Object.entries(s.legend || {})) legend[k] = String(v);
    const who = [];
    const agents = s.agents || [];
    agents.forEach((a, i) => { if (Array.isArray(a.at)) who.push({ name: a.id, rc: rc(a.at[0], a.at[1]), hostile: a.hostile ?? MINDLESS.has(a.model), a }); });
    grid.forEach((row, r) => [...row].forEach((ch, c) => {
      if (/[1-9]/.test(ch) && agents[+ch - 1] && !who.some(w => w.name === agents[+ch - 1].id)) { const a = agents[+ch - 1]; who.push({ name: a.id, rc: [r, c], hostile: a.hostile ?? MINDLESS.has(a.model), a }); }
      if ((ch === 'Y' || ch === '@') && !s.player?.at) who.push({ name: 'you', rc: [r, c], player: true, a: s.player });
    }));
    if (Array.isArray(s.player?.at)) who.push({ name: 'you', rc: rc(s.player.at[0], s.player.at[1]), player: true, a: s.player });
    const things = (s.objects || []).filter(o => Number.isFinite(+o.x) && Number.isFinite(+o.z) && o.type !== 'light').map(o => ({ type: o.type, rc: rc(+o.x, +o.z), o }));
    return { grid, H, W, legend, who, things, places: places.map(p => ({ id: p.id, rc: p.center ? rc(p.center[0], p.center[1]) : null })).filter(p => p.rc), unplaced: agents.filter(a => !who.some(w => w.name === a.id)).map(a => a.id) };
  }
  function floorOf(v) {
    if (!v) return null;
    const on = v.match(/\son\s+(\w+)$/); if (on) return on[1];
    return FLOOR[v] ? v : null;
  }
  function showMap() {
    let v = $('mapView');
    if (!v) { v = document.createElement('div'); v.id = 'mapView'; document.body.appendChild(v); }
    const L = layoutForMap();
    v.hidden = false;
    if (!L) { v.innerHTML = `<div class="mapcard"><p>This scenario's layout is made by the app when it starts: open the tabletop map to see it.</p><button type="button" data-act="closeMap">close</button></div>`; return; }
    const cell = Math.max(10, Math.min(28, Math.floor(Math.min(innerWidth - 80, 1100) / L.W), Math.floor((innerHeight - 160) / L.H)));
    v.innerHTML = `<div class="mapcard"><div class="toolbar"><b>${esc(scn.title || 'map')}</b><span class="muted">north is up · ${L.W}×${L.H}</span><span style="flex:1"></span><button type="button" data-act="closeMap">close</button></div><canvas width="${L.W * cell}" height="${L.H * cell}"></canvas>
      <div class="muted">${L.unplaced.length ? 'placed by the app at start (not shown): ' + esc(L.unplaced.join(', ')) + ' · ' : ''}<span style="color:#e05a4a">●</span> hostile <span style="color:#4a90e0">●</span> character <span style="color:#f2c94c">●</span> you</div></div>`;
    const ctx = v.querySelector('canvas').getContext('2d');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    L.grid.forEach((row, r) => [...row].forEach((ch, c) => {
      const val = L.legend[ch], fl = floorOf(val) || (ch === '.' || ch === ' ' || /[1-9Y@]/.test(ch) ? 'floor' : null);
      ctx.fillStyle = FLOOR[fl] || FLOOR.floor; ctx.fillRect(c * cell, r * cell, cell, cell);
      if (val && !floorOf(val) && val !== 'player') { ctx.fillStyle = '#2b2620'; ctx.font = `bold ${Math.round(cell * .62)}px ui-monospace,monospace`; ctx.fillText(ch, c * cell + cell / 2, r * cell + cell / 2 + 1); }
    }));
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; for (let r = 0; r <= L.H; r++) { ctx.beginPath(); ctx.moveTo(0, r * cell); ctx.lineTo(L.W * cell, r * cell); ctx.stroke(); } for (let c = 0; c <= L.W; c++) { ctx.beginPath(); ctx.moveTo(c * cell, 0); ctx.lineTo(c * cell, L.H * cell); ctx.stroke(); }
    for (const t of L.things) { ctx.fillStyle = '#2b2620'; ctx.font = `${Math.round(cell * .42)}px system-ui`; ctx.fillText(t.type.slice(0, 6), t.rc[1] * cell + cell / 2, t.rc[0] * cell + cell / 2); }
    ctx.font = `600 ${Math.max(10, Math.round(cell * .5))}px system-ui`;
    for (const p of L.places) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(p.id, p.rc[1] * cell + cell / 2, p.rc[0] * cell - cell * .9); }
    for (const w of L.who) {
      const x = w.rc[1] * cell + cell / 2, y = w.rc[0] * cell + cell / 2;
      ctx.beginPath(); ctx.arc(x, y, cell * .38, 0, Math.PI * 2); ctx.fillStyle = w.player ? '#f2c94c' : w.hostile ? '#e05a4a' : '#4a90e0'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = `700 ${Math.max(11, Math.round(cell * .55))}px system-ui`; const tw = ctx.measureText(w.name).width + 8;
      ctx.fillStyle = 'rgba(20,18,16,.8)'; ctx.fillRect(x - tw / 2, y + cell * .45, tw, Math.max(14, cell * .7)); ctx.fillStyle = '#fff'; ctx.fillText(w.name, x, y + cell * .45 + Math.max(14, cell * .7) / 2);
    }
    // Tooltips: who and what is under the pointer.
    const cv = v.querySelector('canvas'), tip = document.createElement('div'); tip.className = 'maptip'; tip.hidden = true; v.querySelector('.mapcard').appendChild(tip);
    cv.addEventListener('mouseleave', () => { tip.hidden = true; });
    cv.addEventListener('mousemove', e => {
      const b = cv.getBoundingClientRect(), c = Math.floor((e.clientX - b.left) / b.width * L.W), r = Math.floor((e.clientY - b.top) / b.height * L.H);
      const html = mapTip(L, r, c);
      tip.hidden = !html; if (!html) return;
      tip.innerHTML = html;
      const card = v.querySelector('.mapcard').getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - card.left + 14, card.width - tip.offsetWidth - 6) + 'px';
      tip.style.top = (e.clientY - card.top + 16) + 'px';
    });
  }
  function mapTip(L, r, c) {
    const near = p => p.rc[0] === r && p.rc[1] === c, out = [];
    for (const w of L.who.filter(near)) {
      const a = w.a || {}, bits = [a.model || (w.player ? '' : 'critter'), w.player ? 'the player' : w.hostile ? 'hostile' : 'talks'].filter(Boolean);
      const more = [a.personality, a.goal || a.goals, a.items?.length ? 'carries: ' + [].concat(a.items).map(i => i?.name || i).join(', ') : '', a.gold ? a.gold + ' gold' : ''].filter(Boolean).map(t => esc(String(t).slice(0, 140)));
      out.push(`<b>${esc(w.name)}</b> <span class="muted">${esc(bits.join(' · '))}</span>${more.length ? '<br>' + more.join('<br>') : ''}`);
    }
    for (const t of L.things.filter(near)) {
      const o = t.o, extra = [o.name || o.label, o.text || o.note, o.items ? 'holds: ' + [].concat(o.items).map(i => i?.name || i).join(', ') : '', o.gold ? o.gold + ' gold' : '', o.locked ? 'locked' : ''].filter(Boolean).map(x => esc(String(x).slice(0, 140)));
      out.push(`<b>${esc(t.type.replace(/_/g, ' '))}</b>${extra.length ? '<br>' + extra.join('<br>') : ''}`);
    }
    const ch = [...(L.grid[r] || '')][c];
    if (ch && ch !== ' ' && ch !== '.') { const val = L.legend[ch]; if (val && val !== 'player' && !/[1-9Y@]/.test(ch)) out.push(`<span class="muted">${esc(ch)}</span> ${esc(String(val).replace(/_/g, ' '))}`); }
    const pl = L.places.find(near); if (pl) out.push(`<span class="muted">place:</span> ${esc(pl.id)}`);
    return out.join('<hr>');
  }

  window.tfBuilder = {
    show(result, opts = {}) { scn = JSON.parse(JSON.stringify(result.scenario)); meta = result; if (opts.appLink) appLink = opts.appLink; render(); },
    get scenario() { return scn; },
  };
})();
