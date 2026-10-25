/* builder.js -- the world builder's workspace (server/generate.js, /world/
 * in the builder view): the map editor (app/map-editor.js) over the
 * generated scenario, and below it the story, the player and the characters
 * as forms, asking the AI for changes, and the raw JSON.
 *
 *   window.tfBuilder.show({ scenario, model?, ms? }, { appLink, revise })
 *     revise: { where, model } for POST /api/revise (where the world was built)
 *
 * Ask the AI for changes: a request goes to POST /api/revise with the
 * scenario (server/generate.js), the reply replaces it; undo steps back.
 * Tabletop map: the app's ?tabletop=1 view in a frame (app/tabletop.js), to
 * print, show on a flat screen, or move things; "use this layout" sends the
 * scenario back with every position fixed.
 *
 * The map editor and the forms change the same scenario: an edit in one
 * redraws the other. A layout written as "map" lines is placed by the app,
 * so the editor has it laid out once by the tabletop page in a hidden frame
 * (?tabletop=1&freeze=1) before it can be edited.
 */
(function () {
  const PEOPLE = ['woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard', 'swordswoman', 'sorceress', 'swordsman', 'wanderer', 'villager_woman'];
  const MONSTERS = ['skeleton', 'skeleton_classic', 'skeleton_warrior', 'skeleton_warrior_classic', 'skeleton_farmer', 'zombie', 'goblin', 'kobold', 'orc', 'rat', 'spider', 'wolf', 'bat', 'ghost', 'slime', 'demon', 'giant', 'dragon', 'troll'];
  const OLDER = ['critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian'];
  const MINDLESS = new Set(['skeleton', 'skeleton_classic', 'skeleton_warrior', 'skeleton_warrior_classic', 'skeleton_farmer', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon', 'troll']);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let scn = null, meta = {}, voices = [], appLink = l => l, revise = {}, ed = null, tabNow = 'story';
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
    box.hidden = false; $('workspace').hidden = false;
    $('wsTitle').textContent = scn.title || 'Untitled world';
    $('wsSub').textContent = [scn.subtitle, meta.model ? 'built with ' + meta.model : ''].filter(Boolean).join(' · ');
    const typed = $('aiReq')?.value || '', said = $('aiMsg')?.textContent || '', canAsk = revise.where !== undefined;
    const tabs = [['story', 'Story'], ['player', 'Player'], ['characters', `Characters (${(scn.agents || []).length})`], ['layout', 'Layout'], ['raw', 'JSON']];
    box.innerHTML = `${canAsk ? `<fieldset class="ask"><legend>Ask the AI for changes</legend>
        <textarea id="aiReq" rows="2" placeholder="e.g. make the goblin a nervous shopkeeper who sells potions; add a locked treasure room with a dragon"></textarea>
        <div class="toolbar"><button type="button" class="go" data-act="ask">Ask</button><button type="button" data-act="undo" ${past.length ? '' : 'disabled'}>Undo${past.length ? ' (' + past.length + ')' : ''}</button><span id="aiMsg" class="muted"></span></div></fieldset>` : ''}
      <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" class="${k === tabNow ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <div data-panel="story" ${tabNow === 'story' ? '' : 'hidden'}><fieldset><legend>Story</legend><div class="cols">${field('title', 'title')}${field('subtitle', 'subtitle')}
        ${field('lighting', 'lighting', 'select', { options: [['', '(default)'], 'bright', 'night', 'dim'] })}${field('walls', 'walls', 'select', { options: [['', '(default)'], 'stone', 'tabletop', 'block', 'modern'] })}
        <label><span>dark (fog of war, torches)</span><select data-path="dark" data-type="bool3"><option value=""${scn.dark == null ? ' selected' : ''}>auto (dungeons: yes)</option><option value="true"${scn.dark === true ? ' selected' : ''}>yes</option><option value="false"${scn.dark === false ? ' selected' : ''}>no</option></select></label>
        ${field('intro', 'intro', 'area', { wide: true })}${field('goal (what the player is told)', 'goal.text', 'area', { wide: true, rows: 2 })}
        ${field('win / lose rules (JSON: {"win": ..., "lose": ...})', '__rules', 'json', { wide: true, rows: 3 })}</div></fieldset></div>
      <div data-panel="player" ${tabNow === 'player' ? '' : 'hidden'}><fieldset><legend>Player</legend><div class="cols">${field('name', 'player.name')}${field('body', 'player.model', 'select', { options: modelOptions })}${field('gold', 'player.gold', 'num')}${field('hit points', 'player.hp', 'num', { ph: '20' })}${field('items (comma)', 'player.items', 'list')}${field('wields', 'player.wield')}</div></fieldset></div>
      <div data-panel="characters" ${tabNow === 'characters' ? '' : 'hidden'}><fieldset><legend>Characters</legend>${(scn.agents || []).map(agentBox).join('') || '<p class="muted">No characters yet: drag monsters and people onto the map.</p>'}<button type="button" data-act="add">+ add a character</button></fieldset></div>
      <div data-panel="layout" ${tabNow === 'layout' ? '' : 'hidden'}><fieldset><legend>Map${scn.generate ? ' (generated ' + esc(scn.generate.kind || 'dungeon') + ')' : scn.grid?.length ? ' (drawn grid)' : scn.map?.length ? ' (layout lines)' : ' (fixed positions)'}</legend>${mapBox()}</fieldset></div>
      <div data-panel="raw" ${tabNow === 'raw' ? '' : 'hidden'}><fieldset><legend>Raw JSON</legend><textarea id="rawJson" class="mono" rows="22"></textarea><div class="toolbar"><button type="button" data-act="applyRaw">Apply JSON</button></div></fieldset></div>`;
    if (typed && $('aiReq')) $('aiReq').value = typed; if (said && $('aiMsg')) $('aiMsg').textContent = said;
    if ($('rawJson')) $('rawJson').value = JSON.stringify(scn, null, 2);
    // the rules box edits goal.win / goal.lose / goal.maxTurns together
    const rules = $('f___rules'); if (rules) { const g = scn.goal || {}; const r = {}; for (const k of ['win', 'lose', 'maxTurns', 'winText', 'loseText', 'score']) if (g[k] != null) r[k] = g[k]; rules.value = Object.keys(r).length ? JSON.stringify(r, null, 1) : ''; }
  }
  // ---- the map editor ----
  function mapEditor() {
    if (ed || !window.tfMapEditor || !$('mapEditor')) return ed;
    ed = window.tfMapEditor.mount($('mapEditor'), {
      onChange(s) { if (inside) inside.parent.subworlds[inside.id] = s; else scn = s; formsSoon(); },
      onEditInside({ id, type }) {
        const root = inside ? inside.parent : scn;
        (root.subworlds ||= {})[id] ||= window.TablefolkProcgen.interiorScenario(type);
        inside = { id, parent: root, type }; insideBar(); ed.load(root.subworlds[id]);
      },
    });
    return ed;
  }
  // the inside of a kept building is edited as a map of its own; the forms stay the world's
  let inside = null;
  function insideBar() {
    let bar = $('insideBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'insideBar'; bar.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 12px;margin:0 0 8px;border-radius:10px;background:#fff3cf;border:1px solid #e8c547;color:#3a2a08'; $('mapEditor').insertAdjacentElement('beforebegin', bar); }
    bar.hidden = !inside;
    if (inside) { bar.innerHTML = `<b>Editing the inside of ${esc(inside.id)}</b><span style="flex:1">Walls, floor, furniture and people here; the player comes in at the gold door square and leaves by the link at the bottom.</span><button type="button" id="insideBack">← back to the world</button>`; $('insideBack').onclick = () => { const p = inside.parent; inside = null; insideBar(); ed.load(p); }; }
  }
  let formsTimer = 0, edTimer = 0;
  // forms follow the map (not while typing in them)
  function formsSoon() { clearTimeout(formsTimer); formsTimer = setTimeout(() => { if (!$('editor')?.contains(document.activeElement)) render(); else formsSoon(); }, 300); }
  // the map follows the forms
  function mapSoon() { clearTimeout(edTimer); edTimer = setTimeout(() => { if (!inside) ed?.refresh(scn); }, 250); }
  // "map" lines: laid out by the tabletop page once
  function needsLayout(s) { return !s.generate && !(Array.isArray(s.grid) ? s.grid.length : s.grid) && (s.map?.length || 0) > 0; }
  async function layOut() {
    msg('laying the map out…');
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-3000px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none';
    fr.src = '/app/?tabletop=1&freeze=1#s=' + await encode(scn);
    document.body.appendChild(fr); layingOut = fr;
  }
  let layingOut = null;
  function loadMap() {
    if (!mapEditor()) return;
    ed.load(scn);
    if (needsLayout(scn)) layOut();
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
    mapSoon();
  }
  const msg = t => { const m = $('edmsg'); if (m) m.textContent = t; };

  async function encode(obj) {
    const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(JSON.stringify(obj))); w.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // play: the player's view even in a browser that remembers dev mode
  async function link(dev) { const l = appLink('/app/#s=' + await encode(scn)), q = dev ? 'dev=1' : 'play=1'; return l.includes('/app/?') ? l.replace('/app/?', '/app/?' + q + '&') : l.replace('/app/#', '/app/?' + q + '#'); }

  document.addEventListener('input', e => { if (e.target.closest?.('#editor')) onInput(e); });
  document.addEventListener('change', e => { if (e.target.closest?.('#editor') && e.target.tagName === 'SELECT') onInput(e); });
  document.addEventListener('toggle', e => { if (e.target.tagName === 'DETAILS' && e.target.open && $('rawJson')) $('rawJson').value = JSON.stringify(scn, null, 2); }, true);
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('#editor button, #workspace .acts button, #tableView button'); if (!b) return;
    if (b.dataset.act === 'closeTable') { $('tableView').hidden = true; $('tableView').querySelector('iframe').src = 'about:blank'; return; }
    if (b.dataset.tab) { tabNow = b.dataset.tab; render(); return; }
    const act = b.dataset.act;
    if (b.dataset.remove != null) { remember(); scn.agents.splice(+b.dataset.remove, 1); render(); mapSoon(); return; }
    if (act === 'play' || act === 'dev') window.open(await link(act === 'dev'), '_blank');
    else if (act === 'copy') { await navigator.clipboard.writeText(location.origin + await link(false)); msg('link copied'); setTimeout(() => msg(''), 2500); }
    else if (act === 'download') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(scn, null, 2)], { type: 'application/json' })); a.download = (scn.title || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json'; a.click(); }
    else if (act === 'add') { (scn.agents ||= []).push({ id: 'npc' + (scn.agents.length + 1), model: 'villager', style: 'villager', personality: '' }); render(); mapSoon(); }
    else if (act === 'applyRaw') { try { const v = JSON.parse($('rawJson').value); remember(); scn = v; render(); loadMap(); msg('applied'); } catch (err) { msg('bad JSON: ' + err.message); } }
    else if (act === 'ask') ask();
    else if (act === 'undo' && past.length) { scn = JSON.parse(past.pop()); render(); loadMap(); msg('undone'); }
    else if (act === 'table') showTable();
  });

  // ---- ask the AI for changes ----
  let asking = false;
  async function ask() {
    const req = $('aiReq')?.value.trim(); if (!req || asking) return;
    const say = t => { const m = $('aiMsg'); if (m) m.textContent = t; };
    asking = true; say('asking…');
    try {
      const q = new URLSearchParams(); if (revise.where) q.set('where', revise.where); if (revise.model) q.set('model', revise.model);
      const r = await fetch('/api/revise?' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: scn, request: req }) });
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
      remember(); scn = done.scenario; render(); loadMap();
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
    if (e.origin !== location.origin || e.data?.type !== 'tablefolk-layout') return;
    if (e.data.auto) { layingOut?.remove(); layingOut = null; if (!e.data.scenario) { msg('could not lay the map out: ' + (e.data.error || 'no answer')); return; } scn = e.data.scenario; render(); ed?.load(scn); msg('laid out: drag things around'); return; }
    if (!e.data.scenario) return;
    remember(); scn = e.data.scenario; render(); ed?.load(scn);
    const t = 'layout updated: every position is fixed now (the generator\'s rooms and seed no longer apply; undo goes back)';
    msg(t); const m = $('tvMsg'); if (m) m.textContent = t;
  });

  window.tfBuilder = {
    show(result, opts = {}) { scn = JSON.parse(JSON.stringify(result.scenario)); meta = result; if (opts.appLink) appLink = opts.appLink; if (opts.revise) revise = opts.revise; render(); loadMap(); $('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    get scenario() { return scn; },
  };
})();
