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
 * Look it over and improve (the agent): rounds of review and change. The map
 * editor draws the whole map (snapshot(), describe()); the model reviews it
 * (POST /api/critique, or the visitor's own model) and asks for changes, which
 * go through the same revision as "Ask". See improve().
 *
 * Pictures (app/builder-paint.js, @tablefolk/paint with tiny-sd): signs,
 * paintings, tapestries ("picture" objects), notes with a picture and book
 * covers, painted in this browser from their "prompt" ("coverPrompt" for a
 * book); the AI writes prompts, the paint bar or the map editor paints them.
 * The AI never sees picture data (lightImages).
 *
 * Books (app/books.js): a PDF or text file becomes a knowledge base in the
 * scenario ("books"), indexed with EmbeddingGemma in this browser; the AI
 * that changes the world sees only each book's title and summary.
 *
 * The map editor and the forms change the same scenario: an edit in one
 * redraws the other. A layout written as "map" lines is placed by the app,
 * so the editor has it laid out once by the tabletop page in a hidden frame
 * (?tabletop=1&freeze=1) before it can be edited.
 */
(function () {
  const PEOPLE = ['woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard', 'swordswoman', 'sorceress', 'swordsman', 'wanderer', 'villager_woman', 'dwarf', 'elf', 'priest', 'guard', 'merchant'];
  const MONSTERS = ['skeleton', 'skeleton_classic', 'skeleton_warrior', 'skeleton_warrior_classic', 'skeleton_farmer', 'zombie', 'goblin', 'kobold', 'orc', 'rat', 'spider', 'wolf', 'bat', 'ghost', 'slime', 'demon', 'giant', 'dragon', 'troll', 'wyrmling', 'imp', 'mushroom_warrior', 'bunny', 'snake', 'wasp', 'frog', 'minotaur', 'lizardman', 'werewolf', 'mummy', 'ogre', 'gnoll', 'lich', 'vampire', 'bear', 'bandit', 'cultist', 'zombie_classic', 'kobold_classic', 'demon_classic', 'giant_classic', 'imp_classic', 'gargoyle', 'dark_knight'];
  const ANIMALS = ['cow', 'bull', 'horse', 'white_horse', 'donkey', 'deer', 'stag', 'fox', 'dog', 'husky', 'alpaca', 'pig', 'sheep'];
  const OLDER = ['critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian'];
  const MINDLESS = new Set(['skeleton', 'skeleton_classic', 'skeleton_warrior', 'skeleton_warrior_classic', 'skeleton_farmer', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon', 'troll', 'wyrmling', 'imp', 'mushroom_warrior', 'bunny', 'snake', 'wasp', 'frog', 'minotaur', 'lizardman', 'werewolf', 'mummy', 'bear', 'gnoll', 'zombie_classic', 'kobold_classic', 'demon_classic', 'giant_classic', 'imp_classic', 'gargoyle', 'dark_knight']);
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
  // The brains a world can start on (the visible ones of SUPPORTED_MODELS in llm_js/agent-brain.js)
  const brainOptions = [['', "(the player's own)"], ['qwen1.5-0.5b', 'Qwen1.5 0.5B (~395 MB)'], ['gemma4-e2b-litert', 'Gemma 4 E2B (~2 GB)'], ['gemma4-e4b-litert', 'Gemma 4 E4B (~3 GB)'], ['gemma4-e2b-vision', 'Gemma 4 E2B with sight (~2.6 GB)'], ['gemma4-e4b-vision', 'Gemma 4 E4B with sight (~3.7 GB)'], ['gemma4-12b-vision', 'Gemma 4 12B with sight (~6 GB)'], ['bonsai2-9b', 'Bonsai 2 9B (~1.9 GB)'], ['gemma4-12b-litert', 'Gemma 4 12B (~5.6 GB)'], ['bonsai2-27b', 'Bonsai 2 27B (~5.9 GB)'], ['endpoint', 'OpenAI-compatible endpoint']];
  const simpleSelect = (path, v) => `<label><span>simple mode (short prompt, replies are spoken)</span><select data-path="${path}" data-type="bool3"><option value=""${v == null ? ' selected' : ''}>auto (very small brains)</option><option value="true"${v === true ? ' selected' : ''}>on</option><option value="false"${v === false ? ' selected' : ''}>off</option></select></label>`;
  const spokenSelect = (path, v) => `<label><span>speaks only when spoken to</span><select data-path="${path}" data-type="bool3"><option value=""${v == null ? ' selected' : ''}>auto (in simple mode)</option><option value="true"${v === true ? ' selected' : ''}>yes</option><option value="false"${v === false ? ' selected' : ''}>no</option></select></label>`;
  const directorSelect = v => `<label><span>director (random events in a living world)</span><select data-path="director" data-type="bool3"><option value=""${v == null || Number.isFinite(+v) && v !== false ? ' selected' : ''}>${Number.isFinite(+v) && v != null && v !== false ? 'on: every ' + esc(v) + ' turns' : 'on'}</option><option value="false"${v === false ? ' selected' : ''}>off</option></select></label>`;
  const modelOptions = [['', '(critter)'], ...PEOPLE.map(m => [m, 'person: ' + m]), ...MONSTERS.map(m => [m, 'monster: ' + m]), ...ANIMALS.map(m => [m, 'animal: ' + m]), ...OLDER.filter(m => m !== 'critter').map(m => [m, 'chibi: ' + m])];
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
      ${simpleSelect(p + '.simple', a.simple)}${spokenSelect(p + '.onlySpokenTo', a.onlySpokenTo)}
      <label><span>reads its books (answers from the books it carries)</span><select data-path="${p}.readsBooks" data-type="bool3"><option value=""${a.readsBooks ? '' : ' selected'}>no</option><option value="true"${a.readsBooks ? ' selected' : ''}>yes</option></select></label>
      ${field('full system prompt (replaces the built one; {name} {style} {personality} {backstory} {commands})', p + '.systemPrompt', 'area', { wide: true, rows: 3 })}
      ${field('gold', p + '.inventory.gold', 'num')}${field('items (comma)', p + '.inventory.items', 'list')}${scn.generate ? field('in (place)', p + '.in') : field('at [x, z]', p + '.at', 'json', { rows: 1 })}
    </div></fieldset>`;
  }
  function mapBox() {
    if (!scn.generate && !scn.grid?.length && (scn.objects?.length || 0) > 40) return `<p class="muted">Fixed layout: ${scn.objects.length} objects and ${scn.paint?.length || 0} floor tiles at exact positions (moved in the tabletop map). Move things there, or ask the AI for changes.${scn.places?.length ? ' Rooms: ' + esc(scn.places.map(p => p.id).join(', ')) + '.' : ''}</p>
      ${field('board size [columns, rows]', 'size', 'json', { rows: 1 })}`;
    if (scn.generate) return `<div class="cols">${field('kind', 'generate.kind', 'select', { options: ['dungeon', 'village', 'forest', 'farm', 'cave'] })}${field(scn.generate.kind === 'village' ? 'buildings' : 'rooms', scn.generate.kind === 'village' ? 'generate.buildings' : 'generate.rooms', 'num')}${field('seed', 'generate.seed', 'num')}${field('size [cols, rows]', 'generate.size', 'json', { ph: 'default; up to [63, 63]' })}</div>
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
    const tabs = [['story', 'Story'], ['player', 'Player'], ['characters', `Characters (${(scn.agents || []).length})`], ['layout', 'Layout'], ['books', `Books (${Object.keys(scn.books || {}).length})`], ['raw', 'JSON']];
    box.innerHTML = `${canAsk ? `<fieldset class="ask"><legend>Ask the AI for changes</legend>
        <textarea id="aiReq" rows="2" placeholder="e.g. make the goblin a nervous shopkeeper who sells potions; add a locked treasure room with a dragon"></textarea>
        <div class="toolbar"><button type="button" class="go" data-act="ask">Ask</button><button type="button" data-act="undo" ${past.length ? '' : 'disabled'}>Undo${past.length ? ' (' + past.length + ')' : ''}</button><span id="aiMsg" class="muted"></span></div>
        <div class="toolbar"><button type="button" data-act="${agent.running ? 'stopImprove' : 'improve'}" title="The AI looks at the whole map (as a picture, if the model can see, and as text), finds problems and things to improve, makes the changes, and looks again">${agent.running ? '■ Stop after this step' : '🔍 Look it over and improve'}</button><label class="muted" style="display:inline-flex;flex-direction:row;gap:6px;align-items:center;margin:0">rounds <select id="aiRounds">${[1, 2, 3, 4, 5].map(n => `<option${n === agent.rounds ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label class="muted" style="display:inline-flex;flex-direction:row;gap:6px;align-items:center;margin:0"><input type="checkbox" id="aiPaint" ${agent.paint ? 'checked' : ''} style="width:auto;margin:0"> then paint the pictures</label><label class="muted" style="display:inline-flex;flex-direction:row;gap:6px;align-items:center;margin:0" title="Stays on until you untick it: every new world and every change you ask for is looked over and improved by itself"><input type="checkbox" id="aiAuto" ${agent.auto ? 'checked' : ''} style="width:auto;margin:0"> always, after every change</label></div>
        ${agent.log.length ? `<ol class="agentlog">${agent.log.map(l => `<li class="${l.kind || ''}">${l.html}</li>`).join('')}</ol>` : ''}</fieldset>` : ''}
      ${paintBar()}
      <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" class="${k === tabNow ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <div data-panel="story" ${tabNow === 'story' ? '' : 'hidden'}><fieldset><legend>Story</legend><div class="cols">${field('title', 'title')}${field('subtitle', 'subtitle')}
        ${field('lighting', 'lighting', 'select', { options: [['', '(default)'], 'bright', 'night', 'dim'] })}${field('walls', 'walls', 'select', { options: [['', '(default)'], 'stone', 'tabletop', 'block', 'modern'] })}
        <label><span>dark (fog of war, torches)</span><select data-path="dark" data-type="bool3"><option value=""${scn.dark == null ? ' selected' : ''}>auto (dungeons: yes)</option><option value="true"${scn.dark === true ? ' selected' : ''}>yes</option><option value="false"${scn.dark === false ? ' selected' : ''}>no</option></select></label>
        ${field('default brain (model this world starts on)', 'defaultModel', 'select', { options: brainOptions })}${simpleSelect('simple', scn.simple)}${spokenSelect('onlySpokenTo', scn.onlySpokenTo)}${directorSelect(scn.director)}
        <label><span>show the intro card</span><select data-path="showIntro" data-type="bool3"><option value=""${scn.showIntro !== false ? ' selected' : ''}>yes</option><option value="false"${scn.showIntro === false ? ' selected' : ''}>no: straight into the world</option></select></label>
        ${field('starting view', 'view', 'select', { options: [['', '(default: free camera)'], ['follow', 'follow camera'], ['first', 'first person']] })}
        ${field('intro', 'intro', 'area', { wide: true })}${field('goal (what the player is told)', 'goal.text', 'area', { wide: true, rows: 2 })}
        ${field('win / lose rules (JSON: {"win": ..., "lose": ...})', '__rules', 'json', { wide: true, rows: 3 })}
        ${field('full system prompt for every character (replaces the built one; {name} {style} {personality} {backstory} {commands})', 'systemPrompt', 'area', { wide: true, rows: 3 })}</div></fieldset></div>
      <div data-panel="player" ${tabNow === 'player' ? '' : 'hidden'}><fieldset><legend>Player</legend><div class="cols">${field('name', 'player.name')}${field('body', 'player.model', 'select', { options: modelOptions })}${field('gold', 'player.gold', 'num')}${field('hit points', 'player.hp', 'num', { ph: '20' })}${field('items (comma)', 'player.items', 'list')}${field('wields', 'player.wield')}</div></fieldset></div>
      <div data-panel="characters" ${tabNow === 'characters' ? '' : 'hidden'}><fieldset><legend>Characters</legend>${(scn.agents || []).map(agentBox).join('') || '<p class="muted">No characters yet: drag monsters and people onto the map.</p>'}<button type="button" data-act="add">+ add a character</button></fieldset></div>
      <div data-panel="layout" ${tabNow === 'layout' ? '' : 'hidden'}><fieldset><legend>Map${scn.generate ? ' (generated ' + esc(scn.generate.kind || 'dungeon') + ')' : scn.grid?.length ? ' (drawn grid)' : scn.map?.length ? ' (layout lines)' : ' (fixed positions)'}</legend>${mapBox()}</fieldset></div>
      <div data-panel="books" ${tabNow === 'books' ? '' : 'hidden'}><fieldset><legend>Books</legend>${booksPanel()}</fieldset></div>
      <div data-panel="raw" ${tabNow === 'raw' ? '' : 'hidden'}><fieldset><legend>Raw JSON</legend><textarea id="rawJson" class="mono" rows="22"></textarea><div class="toolbar"><button type="button" data-act="applyRaw">Apply JSON</button></div></fieldset></div>`;
    if (typed && $('aiReq')) $('aiReq').value = typed; if (said && $('aiMsg')) $('aiMsg').textContent = said;
    if ($('rawJson')) $('rawJson').value = JSON.stringify(scn, null, 2);
    // the rules box edits goal.win / goal.lose / goal.maxTurns together
    const rules = $('f___rules'); if (rules) { const g = scn.goal || {}; const r = {}; for (const k of ['win', 'lose', 'maxTurns', 'winText', 'loseText', 'score']) if (g[k] != null) r[k] = g[k]; rules.value = Object.keys(r).length ? JSON.stringify(r, null, 1) : ''; }
  }
  // ---- books (app/books.js): knowledge bases characters read from ----
  // A book is an item named by its title: "where it is" puts the title in a
  // pack (or the book on the floor), so give, take and chests move it.
  const B = () => window.tablefolkBooks;
  let bookMsg = {};
  const itemName = i => typeof i === 'string' ? i : i?.name;
  function whereIs(b) {
    const t = b.title.toLowerCase(), has = items => (items || []).some(i => String(itemName(i)).toLowerCase() === t);
    if (has(scn.player?.items)) return 'player';
    const a = (scn.agents || []).find(a => has(a.inventory?.items)); if (a) return 'agent:' + a.id;
    const o = (scn.objects || []).find(o => o.type === 'book' && o.book === b.id); if (o) return 'floor';
    return '';
  }
  function takeAway(b) {
    const t = b.title.toLowerCase(), drop = items => (items || []).filter(i => String(itemName(i)).toLowerCase() !== t);
    if (scn.player?.items) scn.player.items = drop(scn.player.items);
    for (const a of scn.agents || []) if (a.inventory?.items) { a.inventory.items = drop(a.inventory.items); if (!a.inventory.items.length) delete a.inventory.items; }
    if (scn.objects) scn.objects = scn.objects.filter(o => !(o.type === 'book' && o.book === b.id));
  }
  function putBook(b, where) {
    takeAway(b);
    if (where === 'player') ((scn.player ||= { name: 'Traveller', gold: 0, items: [] }).items ||= []).push(b.title);
    else if (where.startsWith('agent:')) { const a = scn.agents.find(a => a.id === where.slice(6)); if (a) { ((a.inventory ||= {}).items ||= []).push(b.title); if (a.readsBooks == null) a.readsBooks = true; } }
    else if (where === 'floor') { const p = scn.player?.at || [0, 0]; (scn.objects ||= []).push({ type: 'book', book: b.id, x: +p[0] + 1, z: +p[1] }); }
  }
  function booksPanel() {
    const bs = Object.entries(scn.books || {});
    const whereOpts = [['', '(nowhere yet)'], ['player', "in the player's pack"], ...(scn.agents || []).map(a => ['agent:' + a.id, `carried by ${a.id}`]), ['floor', 'lying on the floor (next to the player\'s start)']];
    const img = (src, w, h, b) => src ? `<img src="${esc(src)}" alt="" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:3px;border:1px solid var(--line)">` : `<span title="drawn from the title and colour" style="display:inline-block;flex:none;width:${w}px;height:${h}px;border-radius:3px;background:${esc(/^#[0-9a-f]{6}$/i.test(b?.color || '') ? b.color : '#6b2d2d')}"></span>`;
    return `<p class="muted">A book is a knowledge base: a PDF or a text file, cut into passages and indexed in this browser with the memory model (EmbeddingGemma). A character that carries it and has <b>reads its books</b> on (Characters tab) looks up what is said to it and answers from the best passages. Books are items named by their title: they can be given, sold and put in chests. The book's text is stored in the world, so a big book makes a long link: share it as a file (download) for anything over a few pages.</p>
      ${bs.map(([id, b]) => { const w = whereIs(b); return `<fieldset class="agent" data-book="${esc(id)}"><legend>${esc(b.title)} <button type="button" class="ghost small" data-bookact="remove">remove</button></legend><div class="cols">
        <label><span>title (the item's name)</span><input data-bookfield="title" value="${esc(b.title)}"></label>
        <label><span>author</span><input data-bookfield="author" value="${esc(b.author || '')}"></label>
        <label class="wide"><span>what it is about (one line)</span><input data-bookfield="about" value="${esc(b.about || '')}"></label>
        <label><span>where it is</span><select data-bookfield="where">${whereOpts.map(([k, t]) => `<option value="${esc(k)}"${k === w ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label><span>colour (drawn cover and back)</span><input type="color" data-bookfield="color" value="${esc(/^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#6b2d2d')}"></label>
        <label><span>cover art ${b.cover ? '<button type="button" class="ghost small" data-bookact="nocover">clear</button>' : ''}</span><span style="display:flex;gap:8px;align-items:center">${img(b.cover, 52, 72, b)}<input type="file" accept="image/*" data-bookfile="cover"></span></label>
        <label class="wide"><span>cover picture: what it shows (painted in this browser)</span><span style="display:flex;gap:8px;align-items:center"><input data-bookfield="coverPrompt" value="${esc(b.coverPrompt || '')}" placeholder="${esc([b.title, b.about].filter(Boolean).join(', '))}" style="flex:1"><button type="button" data-bookact="paintCover" ${window.tfPaint ? '' : 'disabled'}>🎨 paint the cover</button></span></label>
        <label><span>spine art ${b.spine ? '<button type="button" class="ghost small" data-bookact="nospine">clear</button>' : ''}</span><span style="display:flex;gap:8px;align-items:center">${img(b.spine, 14, 72, b)}<input type="file" accept="image/*" data-bookfile="spine"></span></label>
        <p class="muted" style="grid-column:1/-1;margin:0">${(b.chunks || []).length} passages${b.source ? ' from ' + esc(b.source) : ''} · ${b.vectors ? 'indexed by meaning' : 'keywords only (index it below, or the game does it when the model is ready)'} · ${Math.round(JSON.stringify(b).length / 1024)} KB <span data-bookmsg>${esc(bookMsg[id] || '')}</span></p>
        <label class="wide"><span>replace the text (PDF, .txt, .md)</span><input type="file" accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf" data-bookfile="text"></label>
        ${b.vectors ? '' : '<button type="button" data-bookact="index">index by meaning</button>'}
      </div></fieldset>`; }).join('')}
      <label class="wide"><span>+ add a book from a file (PDF, .txt, .md)</span><input type="file" accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf" data-bookfile="new"></label>`;
  }
  function slug(t) { let base = String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'book', id = base; for (let n = 2; scn.books?.[id]; n++) id = base + '_' + n; return id; }
  function bookSay(id, t) { bookMsg[id] = t; const el = document.querySelector(`[data-book="${CSS.escape(id)}"] [data-bookmsg]`); if (el) el.textContent = t; else if (id === '_new') msg(t); }
  async function indexBook(id) {
    const b = scn.books[id];
    bookSay(id, 'loading the memory model…');
    const vecs = await B().embedDocs(b.chunks, f => bookSay(id, `indexing… ${Math.round(f * 100)}%`), f => bookSay(id, `downloading the memory model (175 MB, once)… ${Math.round(f * 100)}%`));
    if (scn.books[id] !== b) return;
    b.vectors = B().encode(vecs); b.dim = B().DIM; b.model = B().MODEL;
    bookMsg[id] = ''; render();
  }
  async function readText(id, file) {
    const isNew = id === '_new';
    bookSay(id, 'reading ' + file.name + '…');
    const text = await B().extract(file, f => bookSay(id, `reading ${file.name}… ${Math.round(f * 100)}%`));
    const chunks = B().chunk(text);
    if (!chunks.length) throw new Error('no text found in ' + file.name + (/\.pdf$/i.test(file.name) ? ' (a scanned PDF has pictures of pages, not text)' : ''));
    if (chunks.length > 3000) throw new Error(`${file.name} is too long (${chunks.length} passages; up to 3000, about 300 pages)`);
    remember();
    if (isNew) {
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60);
      id = slug(title); (scn.books ||= {})[id] = { title, chunks, source: file.name }; tabNow = 'books'; render();
    } else { const b = scn.books[id]; Object.assign(b, { chunks, source: file.name }); delete b.vectors; delete b.dim; delete b.model; render(); }
    await indexBook(id);
  }
  document.addEventListener('change', async e => {
    const el = e.target, box = el.closest?.('#editor');
    if (!box) return;
    const id = el.closest('[data-book]')?.dataset.book;
    if (el.dataset.bookfile) {
      const file = el.files?.[0]; if (!file) return;
      const kind = el.dataset.bookfile;
      try {
        if (kind === 'new') await readText('_new', file);
        else if (kind === 'text') await readText(id, file);
        else { remember(); scn.books[id][kind] = await B().image(file, kind === 'cover' ? 256 : 64, 360); render(); mapSoon(); }
      } catch (err) { bookSay(id || '_new', 'failed: ' + err.message); }
      return;
    }
    if (el.dataset.bookfield && id) {
      const b = scn.books[id], f = el.dataset.bookfield, v = el.value.trim();
      if (f === 'where') { remember(); putBook(b, v); render(); mapSoon(); }
      else if (f === 'title') { if (!v) { el.value = b.title; return; } const w = whereIs(b); remember(); takeAway(b); b.title = v.slice(0, 80); if (w) putBook(b, w); render(); mapSoon(); }
      else { if (v) b[f] = v; else delete b[f]; if (f === 'color') { render(); mapSoon(); } }
    }
  });
  document.addEventListener('click', e => {
    const bt = e.target.closest?.('#editor [data-bookact]'); if (!bt) return;
    e.preventDefault(); e.stopPropagation();
    const id = bt.closest('[data-book]')?.dataset.book, b = scn.books?.[id]; if (!b) return;
    const act = bt.dataset.bookact;
    if (act === 'remove') { remember(); takeAway(b); delete scn.books[id]; if (!Object.keys(scn.books).length) delete scn.books; render(); mapSoon(); }
    else if (act === 'nocover' || act === 'nospine') { remember(); delete b[act.slice(2)]; render(); mapSoon(); }
    else if (act === 'index') indexBook(id).catch(err => bookSay(id, 'failed: ' + err.message));
    else if (act === 'paintCover') paintCover(id);
  }, true);
  // a cover painted from "coverPrompt" (or the title and what it is about)
  async function paintCover(id) {
    const b = scn.books?.[id]; if (!b || !window.tfPaint) return;
    const prompt = String(b.coverPrompt || '').trim() || [b.title, b.about].filter(Boolean).join(', ');
    try {
      const url = await window.tfPaint.paint(prompt, { kind: 'cover', onStatus: t => bookSay(id, t) });
      remember(); b.cover = url; if (!b.coverPrompt) b.coverPrompt = prompt; bookMsg[id] = ''; render(); mapSoon();
    } catch (e) { bookSay(id, 'painting failed: ' + e.message); }
  }
  // the agent's log: a map snapshot grows when clicked; its options are kept
  document.addEventListener('click', e => { const im = e.target.closest?.('.agentshot'); if (im) im.classList.toggle('big'); });
  document.addEventListener('change', e => {
    const id = e.target.id; if (!['aiRounds', 'aiPaint', 'aiAuto'].includes(id)) return;
    if (id === 'aiRounds') agent.rounds = +e.target.value; if (id === 'aiPaint') agent.paint = e.target.checked; if (id === 'aiAuto') agent.auto = e.target.checked;
    saveAgent();
  });
  // The AI that changes the world sees each book as a short summary (title,
  // author, what it is about), not its text; its answer gets the text back.
  function lightBooks(s) {
    if (!s.books) return s;
    return { ...s, books: Object.fromEntries(Object.entries(s.books).map(([id, b]) => [id, { title: b.title, ...(b.author ? { author: b.author } : {}), ...(b.about ? { about: b.about } : {}), ...(b.coverPrompt ? { coverPrompt: b.coverPrompt } : {}), ...(b.cover ? { hasCover: true } : {}), passages: (b.chunks || []).length }])) };
  }
  function heavyBooks(next, before) {
    if (!before.books) return next;
    // an answer without "books" at all forgot them: keep every one
    if (!next.books || typeof next.books !== 'object') { next.books = before.books; return next; }
    const out = {};
    for (const [id, b] of Object.entries(next.books)) { const old = before.books[id]; if (!old) continue; const { passages, hasCover, ...light } = b; out[id] = { ...old, ...light }; }
    if (Object.keys(out).length) next.books = out; else delete next.books;
    return next;
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
    else if (act === 'improve') { agent.rounds = +($('aiRounds')?.value || 3); agent.paint = !!$('aiPaint')?.checked; saveAgent(); improve(); }
    else if (act === 'stopImprove') { agent.stop = true; b.disabled = true; b.textContent = 'stopping after this step…'; }
    else if (act === 'paintAll') paintPending();
    else if (act === 'undo' && past.length) { scn = JSON.parse(past.pop()); render(); loadMap(); msg('undone'); }
    else if (act === 'table') showTable();
  });

  // ---- ask the AI for changes ----
  // Pictures travel as data URLs inside the world; the AI never sees them: each
  // becomes "[picture N]" on the way out and is put back in its answer.
  function lightImages(s) {
    const imgs = [];
    const json = JSON.stringify(s).replace(/"data:image\/[^"]+"/g, m => { imgs.push(m); return `"[picture ${imgs.length - 1}]"`; });
    return { light: JSON.parse(json), heavy: next => JSON.parse(JSON.stringify(next).replace(/"\[picture (\d+)\]"/g, (m, i) => imgs[+i] || '""')) };
  }
  const progressText = d => d.stage === 'writing' || d.stage === 'repairing' ? `${d.stage}… ${d.chars || 0} characters` : d.stage === 'problems' ? 'fixing: ' + d.problems.join('; ').slice(0, 160) : d.stage === 'thinking' ? 'thinking…' : `asking ${d.model || ''}…`;
  // one change by the AI: the new scenario replaces this one (undo steps back)
  async function reviseAI(req, say) {
    const { light, heavy } = lightImages(lightBooks(scn));
    let done = null;
    // the visitor's own key or server: this page calls it (app/worldgen-own.js)
    if (revise.where === 'own' && window.tfOwnModel) {
      done = await new Promise((res, rej) => window.tfOwnModel.revise(light, req, (ev, d) => {
        if (ev === 'progress') say(progressText(d)); else if (ev === 'done') res(d); else if (ev === 'failed') rej(new Error(d.error));
      }));
    } else {
      const q = new URLSearchParams(); if (revise.where) q.set('where', revise.where); if (revise.model) q.set('model', revise.model);
      const r = await fetch('/api/revise?' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: light, request: req }) });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done: end } = await rd.read(); if (end) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = chunk.match(/^event: (.*)$/m)?.[1], data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] || '{}');
          if (ev === 'progress') say(progressText(data));
          else if (ev === 'failed') throw new Error(data.error);
          else if (ev === 'done') done = data;
        }
      }
      if (!done) throw new Error('no answer');
    }
    remember(); scn = heavyBooks(heavy(done.scenario), scn); render(); loadMap();
    return done;
  }
  let asking = false;
  async function ask() {
    const req = $('aiReq')?.value.trim(); if (!req || asking || agent.running) return;
    const say = t => { const m = $('aiMsg'); if (m) m.textContent = t; };
    asking = true; say('asking…');
    try {
      const done = await reviseAI(req, say);
      $('aiReq').value = ''; say(`changed in ${Math.round(done.ms / 1000)} s${done.warnings?.length ? ' · notes: ' + done.warnings.join('; ') : ''}`);
      if (pendingPictures().length) render();
    } catch (e) { say('failed: ' + e.message); return; }
    finally { asking = false; }
    if (agent.auto) improve();
  }

  // ---- look it over and improve: the agent ----
  // Each round: the whole map is drawn by the map editor (instant, 2D tiles)
  // and described as text; the model reviews it with the scenario (POST
  // /api/critique, or the visitor's own model) and answers with problems and
  // one change request; the request goes through the same revision as "Ask";
  // the new map is drawn again and looked at in the next round, until the
  // model calls it good or the rounds run out. Then the pictures it asked for
  // are painted (builder-paint.js) when "then paint the pictures" is ticked.
  // "Always": the settings stay on (this browser remembers them) and the agent
  // runs by itself after every new world and every change asked for
  const AGENT_KEY = 'tablefolk.builderAgent';
  const agent = { running: false, stop: false, rounds: 3, paint: true, auto: false, log: [] };
  try { const o = JSON.parse(localStorage.getItem(AGENT_KEY) || '{}'); if (o.rounds) agent.rounds = Math.min(5, Math.max(1, +o.rounds)); if (o.paint != null) agent.paint = !!o.paint; agent.auto = !!o.auto; } catch {}
  const saveAgent = () => { try { localStorage.setItem(AGENT_KEY, JSON.stringify({ rounds: agent.rounds, paint: agent.paint, auto: agent.auto })); } catch {} };
  const logLine = (html, kind = '') => { agent.log.push({ html, kind }); render(); };
  async function mapLaidOut() {
    // "map" lines are laid out by the tabletop page first (layOut)
    for (let t = 0; layingOut && t < 120; t++) await new Promise(r => setTimeout(r, 250));
    if (inside) { const p = inside.parent; inside = null; insideBar(); ed?.load(p); }
    await new Promise(r => requestAnimationFrame(() => r()));
  }
  async function critique(round, rounds, history, say) {
    await mapLaidOut();
    const shot = await ed?.snapshot?.(), mapText = ed?.describe?.() || '';
    const { light } = lightImages(lightBooks(scn));
    const body = { scenario: light, mapText, round, rounds, history };
    if (revise.where === 'own' && window.tfOwnModel) {
      const r = await window.tfOwnModel.critique(body, shot?.url, say);
      let c; try { c = window.tfOwnModel.parseJSON(r.text); } catch (e) { throw new Error('the review was not JSON: ' + e.message); }
      const request = String(c.request || '').trim();
      const verdict = /good/i.test(String(c.verdict || '')) || !request ? 'good' : 'improve';
      return { verdict, problems: [].concat(c.problems || []).map(String), ideas: [].concat(c.ideas || []).map(String), request: verdict === 'good' ? '' : request, sawImage: r.sawImage, shot };
    }
    const q = new URLSearchParams(); if (revise.where) q.set('where', revise.where); if (revise.model) q.set('model', revise.model);
    const r = await fetch('/api/critique?' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, image: shot?.url }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return { ...d, shot };
  }
  // what a change did: things and characters added and removed, settings dropped
  function diffWorlds(a, b) {
    const count = s => { const m = {}; for (const o of s.objects || []) if (o && !['wall', 'door', 'light'].includes(o.type)) m[o.type] = (m[o.type] || 0) + 1; return m; };
    const ca = count(a), cb = count(b), added = [], lost = [];
    for (const t of new Set([...Object.keys(ca), ...Object.keys(cb)])) { const n = (cb[t] || 0) - (ca[t] || 0); if (n > 0) added.push((n > 1 ? n + ' ' : '') + t); else if (n < 0) lost.push((n < -1 ? -n + ' ' : '') + t); }
    const ids = s => new Set((s.agents || []).map(x => x.id));
    const ia = ids(a), ib = ids(b);
    for (const id of ib) if (!ia.has(id)) added.push('character ' + id);
    for (const id of ia) if (!ib.has(id)) lost.push('character ' + id);
    for (const k of ['floor', 'base', 'lighting', 'walls', 'dark', 'goal', 'intro', 'books', 'generate', 'events']) if (a[k] != null && b[k] == null) lost.push(`"${k}"`);
    // moved: a type whose count stayed the same but whose squares changed
    const at = (s, t) => (s.objects || []).filter(o => o?.type === t).map(o => Math.round(o.x) + ',' + Math.round(o.z));
    const moved = Object.keys(ca).filter(t => !['wall', 'door', 'light'].includes(t) && ca[t] === cb[t] && at(a, t).sort().join() !== at(b, t).sort().join());
    for (const x of b.agents || []) { const y = (a.agents || []).find(q => q.id === x.id); if (y && JSON.stringify(y.at) !== JSON.stringify(x.at)) moved.push(x.id); }
    const tile = s => new Map((s.paint || []).map(c => [Math.round(c.x) + ',' + Math.round(c.z), c.mat]));
    const ta = tile(a), tb = tile(b); let tiles = 0;
    for (const k of new Set([...ta.keys(), ...tb.keys()])) if (ta.get(k) !== tb.get(k)) tiles++;
    const changed = (b.agents || []).flatMap(x => { const y = (a.agents || []).find(q => q.id === x.id); if (!y) return [];
      const f = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => k !== 'at' && JSON.stringify(x[k]) !== JSON.stringify(y[k]));
      return f.length ? [`${x.id} (${f.join(', ')})`] : []; });
    const text = [added.length ? 'added ' + added.join(', ') : '', lost.length ? 'removed ' + lost.join(', ') : '', moved.length ? 'moved ' + moved.join(', ') : '',
      tiles ? `${tiles} floor tile${tiles > 1 ? 's' : ''} changed` : '', changed.length ? 'changed ' + changed.join(', ') : ''].filter(Boolean).join('; ');
    return { added, lost, text };
  }
  async function improve(rounds = agent.rounds) {
    if (agent.running || asking || revise.where === undefined) return;
    agent.running = true; agent.stop = false; agent.log = []; render();
    const say = t => { const m = $('aiMsg'); if (m) m.textContent = t; };
    const history = [];
    try {
      for (let round = 1; round <= rounds && !agent.stop; round++) {
        say(`round ${round}/${rounds}: looking at the map…`);
        const c = await critique(round, rounds, history, say);
        const thumb = c.shot ? `<img class="agentshot" title="the map it looked at (click to enlarge)" alt="map, round ${round}" src="${c.shot.url}">` : '';
        const list = (t, xs) => xs?.length ? `<br><b>${t}:</b> ${xs.map(esc).join(' · ')}` : '';
        logLine(`${thumb}<b>Round ${round}</b> (${c.sawImage ? 'saw the map as a picture and as text' : 'read the map as text: this model takes no pictures'}): ${c.verdict === 'good' ? 'looks good' : 'wants changes'}${list('problems', c.problems)}${list('ideas', c.ideas)}${c.request ? `<br><b>asks for:</b> ${esc(c.request)}` : ''}`);
        if (c.verdict === 'good' || !c.request) break;
        if (agent.stop) break;
        say(`round ${round}/${rounds}: making the changes…`);
        const before = JSON.parse(JSON.stringify(scn));
        const done = await reviseAI(c.request, t => say(`round ${round}/${rounds}: ${t}`));
        const d = diffWorlds(before, scn);
        // what the change lost goes to the next round, which can put it back
        history.push(c.request.slice(0, 300) + (d.lost.length ? ` (this change also lost: ${d.lost.join(', ')}; put back what should stay)` : ''));
        logLine(`changed in ${Math.round((done.ms || 0) / 1000)} s${d.text ? ': ' + esc(d.text) : ''}${d.lost.length ? ` <b>· lost: ${esc(d.lost.join(', '))}</b>` : ''}${done.warnings?.length ? ' · notes: ' + esc(done.warnings.join('; ')) : ''}`, d.lost.length ? 'warn' : 'done');
      }
      if (agent.paint && !agent.stop && pendingPictures().length) { logLine(`painting ${pendingPictures().length} picture${pendingPictures().length > 1 ? 's' : ''}…`); await paintPending(); }
      say(agent.stop ? 'stopped' : 'finished looking it over (undo steps back through each change)');
    } catch (e) { logLine('failed: ' + esc(e.message), 'bad'); say('failed: ' + e.message); }
    finally { agent.running = false; render(); }
  }

  // ---- pictures: painted in this browser (builder-paint.js) ----
  // Pictures, notes with a picture and book covers the AI (or a person) asked
  // for with a "prompt" and that have no image yet.
  function pendingPictures() {
    const out = [], isPic = o => o && (o.type === 'picture' || o.type === 'note') && String(o.prompt || '').trim() && !o.image;
    const walk = s => { for (const o of s?.objects || []) if (isPic(o)) out.push({ o, kind: o.type === 'note' ? 'poster' : o.style || 'painting', prompt: o.prompt }); for (const sub of Object.values(s?.subworlds || {})) walk(sub); };
    walk(scn);
    for (const b of Object.values(scn?.books || {})) if (String(b.coverPrompt || '').trim() && !b.cover) out.push({ o: b, kind: 'cover', prompt: b.coverPrompt, key: 'cover' });
    return out;
  }
  let painting = false, paintMsg = '';
  function paintBar() {
    const n = scn ? pendingPictures().length : 0;
    if (!n && !painting) return '';
    return `<div class="paintbar"><span>🎨 ${painting ? esc(paintMsg) : `${n} picture${n > 1 ? 's' : ''} to paint (signs, paintings, tapestries, notes, book covers): a small image model in this browser paints them`}</span>${painting ? '' : `<button type="button" data-act="paintAll" ${window.tfPaint ? '' : 'disabled'}>Paint ${n > 1 ? 'them' : 'it'}</button>`}</div>`;
  }
  async function paintPending() {
    if (painting || !window.tfPaint) return;
    painting = true;
    const say = t => { paintMsg = t; const el = document.querySelector('.paintbar span'); if (el) el.textContent = '🎨 ' + t; };
    try {
      const todo = pendingPictures();
      for (let i = 0; i < todo.length; i++) {
        const p = todo[i], head = `picture ${i + 1} of ${todo.length} (${p.prompt.slice(0, 50)}): `;
        say(head + 'starting…'); render();
        const url = await window.tfPaint.paint(p.prompt, { kind: p.kind, onStatus: t => say(head + t) });
        p.o[p.key || 'image'] = url;
        ed?.refresh?.(inside ? inside.parent.subworlds[inside.id] : scn);
      }
      paintMsg = '';
    } catch (e) { paintMsg = ''; msg('painting failed: ' + e.message); }
    finally { painting = false; render(); }
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
    show(result, opts = {}) {
      scn = JSON.parse(JSON.stringify(result.scenario)); meta = result; if (opts.appLink) appLink = opts.appLink; if (opts.revise) revise = opts.revise; render(); loadMap(); $('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // the form's "look it over" (?improve=N): the agent starts on the new world
      // (or "always, after every change" is on)
      if (opts.improve > 0 && revise.where !== undefined) { agent.rounds = Math.min(5, +opts.improve); setTimeout(() => improve(agent.rounds), 600); }
      else if (agent.auto && revise.where !== undefined) setTimeout(() => improve(), 600);
    },
    improve, paintPending, pendingPictures, get agent() { return agent; }, get editor() { return ed; },
    get scenario() { return scn; },
    encode,
  };
})();
