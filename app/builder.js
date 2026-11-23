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
 * A world in sections (top map + "subworlds", joined by "links"; the scenario
 * skill's things.md "Sections"): the bar over the map switches the section
 * being edited (secPath: subworlds keys down from the top), adds, renames and
 * deletes sections; the map editor's link tool links them. Asking the AI and
 * "look it over" change only the section shown: it is sent without its
 * subworlds, with a few lines about the whole world, and put back in place.
 * The forms (story, player, characters) stay the top map's.
 *
 * How much the characters decide ("autonomy"): five choices on the Story tab
 * (Auto, the default, leaves it out; the scenario skill's living.md) and a
 * "decides for itself" select in each character's box; the choice sets the
 * preset and keeps per-decision keys written in the JSON.
 *
 * The map editor and the forms change the same scenario: an edit in one
 * redraws the other. A layout written as "map" lines is placed by the app,
 * so the editor has it laid out once by the tabletop page in a hidden frame
 * (?tabletop=1&freeze=1) before it can be edited.
 */
(function () {
  const PEOPLE = ['woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard', 'swordswoman', 'sorceress', 'swordsman', 'wanderer', 'villager_woman', 'dwarf', 'elf', 'priest', 'guard', 'merchant'];
  const MONSTERS = ['skeleton', 'skeleton_classic', 'skeleton_warrior', 'skeleton_warrior_classic', 'skeleton_farmer', 'zombie', 'goblin', 'kobold', 'orc', 'rat', 'spider', 'wolf', 'bat', 'ghost', 'slime', 'demon', 'giant', 'dragon', 'troll', 'wyrmling', 'imp', 'mushroom_warrior', 'bunny', 'snake', 'wasp', 'frog', 'minotaur', 'lizardman', 'werewolf', 'mummy', 'ogre', 'gnoll', 'lich', 'vampire', 'bear', 'bandit', 'cultist', 'zombie_classic', 'kobold_classic', 'demon_classic', 'giant_classic', 'imp_classic', 'gargoyle', 'dark_knight', 'red_dragon'];
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
  // How much characters decide ("autonomy": a preset, or an object such as {"preset": "free", "needs": "code"}:
  // the scenario skill's living.md). The choice sets the preset and keeps any per-decision keys the JSON has.
  const AUTONOMY = [
    ['', 'Auto (recommended)', 'The game picks for the player\'s brain and machine (a short check of how well it decides).'],
    ['rails', 'On rails', 'The game runs their day and they talk. Works on every brain, the smallest too.'],
    ['assisted', 'Assisted', 'They choose what to do, plan and talk; the game keeps them fed, in bed at night and safe in a raid.'],
    ['guided', 'Guided', 'They pick each next thing to do from what the world offers, and plan their day.'],
    ['free', 'Free', 'They act on their own: plans, deals, favours, feuds. Wants a strong, fast brain; on a weak one the game keeps them on rails.'],
  ];
  const autoPreset = v => typeof v === 'string' ? v : v && typeof v === 'object' ? v.preset || '' : '';
  const autoExtra = v => v && typeof v === 'object' ? Object.entries(v).filter(([k]) => k !== 'preset').map(([k, x]) => `${k} by ${x === 'code' ? 'the game' : 'the model'}`).join(', ') : '';
  const autonomyPick = () => { const v = scn.autonomy, cur = autoPreset(v), extra = autoExtra(v); return `<div class="autopick" role="radiogroup"><span>How much do characters decide for themselves?</span>${AUTONOMY.map(([k, t, line]) => `<label class="${k === cur ? 'on' : ''}"><input type="radio" name="scnAutonomy" value="${k}" data-path="autonomy" data-type="autonomy"${k === cur ? ' checked' : ''}><b>${esc(t)}</b><small>${esc(line)}</small></label>`).join('')}${extra ? `<small class="muted">Also set in the JSON: ${esc(extra)}.</small>` : ''}</div>`; };
  const autonomySelect = (path, v) => `<label><span>decides for itself</span><select data-path="${path}" data-type="autonomy">${[['', "(the world's)"], ...AUTONOMY.slice(1).map(([k, t]) => [k, t.toLowerCase()])].map(([k, t]) => `<option value="${k}"${k === autoPreset(v) ? ' selected' : ''}>${esc(t)}${k && k === autoPreset(v) && autoExtra(v) ? ' (+ JSON: ' + esc(autoExtra(v)) + ')' : ''}</option>`).join('')}</select></label>`;
  // the choice replaces the preset; per-decision keys written in the JSON stay
  function setAutonomy(path, v) {
    const old = get(path);
    if (old && typeof old === 'object') { const o = { ...old }; if (v) o.preset = v; else delete o.preset; set(path, Object.keys(o).length ? o : undefined); }
    else set(path, v || undefined);
  }
  // + the bodies its packs and packages bring (the scenario's "bodies" hint, bodies.js)
  const modelOptions = () => [['', '(critter)'], ...PEOPLE.map(m => [m, 'person: ' + m]), ...MONSTERS.map(m => [m, 'monster: ' + m]), ...ANIMALS.map(m => [m, 'animal: ' + m]), ...OLDER.filter(m => m !== 'critter').map(m => [m, 'chibi: ' + m]), ...(Array.isArray(scn?.bodies) ? scn.bodies.map(m => [String(m), 'package: ' + m]) : [])];
  // voices: the world's own first (Voices tab), then mine (this browser), the library, ZONOS3-Mini's and Pocket-TTS's built-in ones
  const about = v => v.gender || v.description ? ' (' + [v.gender, v.description].filter(Boolean).join(', ') + ')' : '';
  const voiceOptions = () => [['', '(fits the body)'],
    ...(scn.voices || []).map(v => ['pack:' + v.id, '★ this world: ' + v.name + about(v)]),
    ...myList.filter(m => !(scn.voices || []).some(v => v.v === m.v)).map(m => ['my:' + m.id, '♥ my voices: ' + m.name + about(m)]),
    ['__new', '+ a new voice from a sample or a recording…'],
    ...libVoices.map(v => ['pack:' + v.id, 'library: ' + v.name + about(v)]),
    ...ZONOS_BUILT.map(([id, g, d]) => ['builtin:' + id, `ZONOS3-Mini: ${id} (${g}, ${d}; other engines: a Pocket-TTS voice)`]),
    ...(voices.length ? voices : ['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius'].map(id => ({ id }))).map(v => ['builtin:' + v.id, 'Pocket-TTS: ' + v.id + about(v)])];

  // ---- voices (app/tts/voice-sample.js): the world's own ("voices": a short sample each,
  // spoken as "pack:<id>"), mine (kept in this browser, for every world), the library's
  const VS = () => window.tablefolkVoiceSample;
  const ZONOS_BUILT = [['cillian', 'male', 'Irish'], ['imogen', 'female', 'British'], ['jett', 'male', 'energetic'], ['morgana', 'female', 'a witch'], ['rupert', 'male', 'British'], ['sakura', 'female', 'anime'], ['savannah', 'female', 'American'], ['thaddeus', 'male', 'an announcer'], ['willow', 'female', 'soft, close (ASMR)'], ['wyatt', 'male', 'American']];
  const READ_THIS = "The road north is longer than it looks, friend. Keep your lantern lit, mind the river, and don't trust anyone who smiles too quickly.";
  let libVoices = [], myList = [], paneVoices = [], voiceMsg = '', assignTo = null, recording = null, voiceBusy = false;
  fetch('/app/assets/voices/voices.json').then(r => r.ok ? r.json() : []).then(d => { libVoices = Array.isArray(d) ? d : []; if (scn) render(); }).catch(() => {});
  async function refreshMine() { if (!VS()) return; myList = await VS().myVoices.list(); paneVoices = await VS().myVoices.fromVoicePane(); if (scn) render(); }
  setTimeout(refreshMine, 0);
  const voiceSay = t => { voiceMsg = t; const el = $('voiceMsg'); if (el) el.textContent = t; };
  function voiceSlug(name) { const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'voice'; let id = base; const taken = x => (scn.voices || []).some(v => v.id === x) || libVoices.some(v => v.id === x); for (let n = 2; taken(id); n++) id = base + '_' + n; return id; }
  const kb = n => Math.round(n / 1024) + ' KB';
  // make the ZONOS3-Mini voice here when it is downloaded (else the game makes it from the sample)
  async function zonosFor(v, audio) {
    if (v.zonos || !VS().zonosReady()) return;
    voiceSay('making the ZONOS3-Mini voice…');
    const a = audio || await VS().decode(v.sample), z = await VS().embedding(a, v.v);
    if (z && (scn.voices || []).includes(v)) { v.zonos = z; voiceSay(''); render(); }
  }
  async function addVoiceFrom(blob, name, extra = {}) {
    if (voiceBusy) return; voiceBusy = true;
    try {
      voiceSay('reading the sample…');
      const p = await VS().prepare(blob), id = voiceSlug(name || 'voice');
      const v = { id, name: String(name || id).slice(0, 40), ...(extra.gender ? { gender: extra.gender } : {}), ...(extra.description ? { description: extra.description } : {}), sample: p.sample, v: p.v, ...(extra.text ? { text: extra.text } : {}) };
      remember(); (scn.voices ||= []).push(v);
      if (assignTo) { set(assignTo, 'pack:' + id); assignTo = null; }
      voiceSay(`${v.name}: ${p.seconds.toFixed(1)} s, ${kb(p.sample.length)} in the world`); render(); mapSoon();
      await zonosFor(v, p.audio).catch(e => voiceSay('ZONOS3-Mini voice not made here (' + e.message + '); the game makes it'));
    } catch (e) { voiceSay('failed: ' + e.message); }
    finally { voiceBusy = false; }
  }
  // one of my voices into this world (a copy: the world carries it)
  function addMine(id) {
    const m = myList.find(x => x.id === id); if (!m) return null;
    const have = (scn.voices || []).find(v => v.v === m.v); if (have) return have.id;
    const { saved, ...v } = m; v.id = voiceSlug(m.id);
    (scn.voices ||= []).push(v); return v.id;
  }
  function voicesPanel() {
    if (!VS()) return '<p class="muted">The voice tools did not load.</p>';
    const vs = scn.voices || [], users = id => (scn.agents || []).filter(a => a.ttsVoiceId === 'pack:' + id).map(a => a.id);
    const zr = VS().zonosReady(), total = vs.reduce((n, v) => n + JSON.stringify(v).length, 0);
    const forWho = assignTo ? get(assignTo.replace(/\.ttsVoiceId$/, '.id')) : null;
    return `<p class="muted">A voice of this world's own: a short sample of one person speaking (3 to 12 seconds; a file or a recording), kept in the world (about 35 KB each) so it travels with the link. ZONOS3-Mini clones it from its sound (${zr ? 'downloaded in this browser: the voice is made here and you can try lines' : 'not downloaded in this browser yet: the game makes the voice the first time it speaks; the Voice pane in the game downloads it'}); Pocket-TTS clones it from the sample too; Breeze TTS also needs the words said in it. Give a voice to a character here or in the Characters tab.</p>
      ${forWho ? `<p><b>The next voice you add goes to ${esc(forWho)}.</b> <button type="button" class="ghost small" data-vact="unassign">cancel</button></p>` : ''}
      ${vs.map((v, i) => `<fieldset class="agent" data-voice="${i}"><legend>${esc(v.name)} <button type="button" class="ghost small" data-vact="remove">remove</button></legend><div class="cols">
        <label><span>name</span><input data-vfield="name" value="${esc(v.name)}"></label>
        <label><span>gender</span><select data-vfield="gender">${[['', '(not said)'], 'female', 'male', 'other'].map(o => { const [k, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${k}"${(v.gender || '') === k ? ' selected' : ''}>${t}</option>`; }).join('')}</select></label>
        <label class="wide"><span>what it sounds like (a few words, for the AI casting it and for engines that design voices)</span><input data-vfield="description" value="${esc(v.description || '')}" placeholder="e.g. gruff old sailor, slow, a little hoarse"></label>
        <label class="wide"><span>the words said in the sample (exactly; Breeze TTS clones from them)</span><input data-vfield="text" value="${esc(v.text || '')}"></label>
        <label><span>the sample</span><audio controls preload="none" src="${esc(v.sample)}" style="width:100%;height:32px"></audio></label>
        <label><span>speaks for</span><select data-vfield="assign"><option value="">${users(v.id).length ? esc(users(v.id).join(', ')) : '(nobody yet)'}</option>${(scn.agents || []).filter(a => a.ttsVoiceId !== 'pack:' + v.id).map(a => `<option value="${esc(a.id)}">+ give it to ${esc(a.id)}</option>`).join('')}</select></label>
        <label class="wide"><span>try a line (ZONOS3-Mini)</span><span style="display:flex;gap:8px"><input data-vtry value="Well met, traveller. What brings you all this way?" style="flex:1"><button type="button" data-vact="try" ${zr ? '' : `disabled title="ZONOS3-Mini is not downloaded in this browser (the game's Voice pane downloads it)"`}>▶ try it</button></span></label>
        <p class="muted" style="grid-column:1/-1;margin:0">${kb(JSON.stringify(v).length)} · ${v.zonos ? 'ZONOS3-Mini voice made' : 'ZONOS3-Mini voice: made by the game the first time it speaks'}${v.text ? '' : ' · no words: Breeze TTS designs a voice from the description instead'} <button type="button" class="ghost small" data-vact="save">${myList.some(m => m.v === v.v) ? '♥ in my voices' : '♥ save to my voices'}</button></p>
      </div></fieldset>`).join('')}
      <fieldset class="agent"><legend>Add a voice</legend><div class="cols">
        <label><span>name</span><input id="vNewName" placeholder="e.g. Old Sailor"></label>
        <label><span>gender</span><select id="vNewGender"><option value="">(not said)</option><option>female</option><option>male</option><option>other</option></select></label>
        <label class="wide"><span>from a file (WAV, MP3, OGG, M4A...: one person, no music; the first 12 seconds are kept)</span><input type="file" accept="audio/*,.wav,.mp3,.ogg,.m4a,.webm,.flac" id="vNewFile"></label>
        <label class="wide"><span>or record it: read this aloud (its words are kept for Breeze TTS)</span><span style="display:flex;gap:8px;align-items:center"><em style="flex:1">${esc(READ_THIS)}</em><button type="button" data-vact="record">${recording ? '■ stop' : '● record'}</button></span></label>
        <p class="muted" style="grid-column:1/-1;margin:0"><span id="voiceMsg">${esc(voiceMsg)}</span>${vs.length ? ` · the world's voices: ${kb(total)} (a saved world can be up to about 390 KB in all)` : ''}</p>
      </div></fieldset>
      ${myList.length || paneVoices.length ? `<fieldset class="agent"><legend>My voices (kept in this browser)</legend>
        ${myList.map(m => `<div class="toolbar" data-mine="${esc(m.id)}"><b>${esc(m.name)}</b><span class="muted">${esc(about(m))}</span><audio controls preload="none" src="${esc(m.sample)}" style="height:28px;width:180px"></audio>${(scn.voices || []).some(v => v.v === m.v) ? '<span class="muted">in this world</span>' : '<button type="button" data-vact="useMine">add to this world</button>'}<button type="button" class="ghost small" data-vact="forget">delete</button></div>`).join('')}
        ${paneVoices.map(p => `<div class="toolbar" data-pane="${esc(p.id)}"><b>${esc(p.name)}</b><span class="muted">made in the game's Voice pane</span><button type="button" data-vact="usePane">add to this world</button></div>`).join('')}
      </fieldset>` : ''}`;
  }
  document.addEventListener('change', e => {
    const el = e.target; if (!el.closest?.('#editor')) return;
    if (el.id === 'vNewFile' && el.files?.[0]) { const f = el.files[0]; addVoiceFrom(f, $('vNewName')?.value.trim() || f.name.replace(/\.[^.]+$/, ''), { gender: $('vNewGender')?.value }); return; }
    const box = el.closest('[data-voice]'), v = box && scn.voices?.[+box.dataset.voice]; if (!v || !el.dataset.vfield) return;
    const f = el.dataset.vfield;
    if (f === 'assign') { const a = (scn.agents || []).find(a => a.id === el.value); if (a) { remember(); a.ttsVoiceId = 'pack:' + v.id; render(); mapSoon(); } return; }
    if (f === 'gender') { if (el.value) v.gender = el.value; else delete v.gender; mapSoon(); }
  });
  document.addEventListener('input', e => {
    const el = e.target, box = el.closest?.('[data-voice]'), v = box && scn.voices?.[+box.dataset.voice]; if (!v || !el.dataset.vfield || el.tagName === 'SELECT') return;
    const f = el.dataset.vfield;
    if (el.value.trim()) v[f] = el.value; else if (f !== 'name') delete v[f];
    mapSoon();
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('#editor [data-vact]'); if (!b) return;
    const act = b.dataset.vact, box = b.closest('[data-voice]'), v = box && scn.voices?.[+box.dataset.voice];
    if (act === 'unassign') { assignTo = null; render(); }
    else if (act === 'remove' && v) { remember(); for (const a of scn.agents || []) if (a.ttsVoiceId === 'pack:' + v.id) delete a.ttsVoiceId; scn.voices.splice(+box.dataset.voice, 1); if (!scn.voices.length) delete scn.voices; render(); mapSoon(); }
    else if (act === 'save' && v) { await VS().myVoices.put({ ...v }); await refreshMine(); voiceSay(v.name + ' is in my voices: offered in every world in this browser'); }
    else if (act === 'try' && v) {
      const line = box.querySelector('[data-vtry]')?.value.trim(); if (!line) return;
      b.disabled = true;
      try { if (!v.zonos) await zonosFor(v); if (!v.zonos) throw new Error('no ZONOS3-Mini voice'); voiceSay('speaking…'); const secs = await VS().say(line, v.zonos); voiceSay(`spoken (${secs.toFixed(1)} s)`); }
      catch (err) { voiceSay('failed: ' + err.message); } finally { b.disabled = false; }
    }
    else if (act === 'useMine') { const id = b.closest('[data-mine]')?.dataset.mine; remember(); const got = addMine(id); if (got && assignTo) { set(assignTo, 'pack:' + got); assignTo = null; } render(); mapSoon(); }
    else if (act === 'forget') { const id = b.closest('[data-mine]')?.dataset.mine, m = myList.find(x => x.id === id); if (m && await (window.confirmDialog ? window.confirmDialog(`Delete ${m.name} from my voices in this browser? Worlds that have it keep their copy.`, { title: 'Delete voice?', confirmText: 'delete', danger: true }) : confirm(`Delete ${m.name} from my voices?`))) { await VS().myVoices.remove(id); refreshMine(); } }
    else if (act === 'usePane') { const p = paneVoices.find(x => x.id === b.closest('[data-pane]')?.dataset.pane); if (p) addVoiceFrom(VS().floatsToFile(Float32Array.from(p.audio)), p.name); }
    else if (act === 'record') {
      if (recording) { recording.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } }), parts = [], rec = new MediaRecorder(stream);
        rec.ondataavailable = x => { if (x.data.size) parts.push(x.data); };
        rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); recording = null; render(); addVoiceFrom(new Blob(parts, { type: rec.mimeType }), $('vNewName')?.value.trim() || 'my voice', { gender: $('vNewGender')?.value, text: READ_THIS }); };
        rec.start(); recording = rec; voiceMsg = 'recording: read the line, then press stop'; render();
        setTimeout(() => { if (recording === rec) rec.stop(); }, 15000);
      } catch (err) { voiceSay('no microphone: ' + err.message); }
    }
  });
  // the AI that changes the world sees each voice without its sample; its answer gets them back
  function lightVoices(s) { return Array.isArray(s.voices) ? { ...s, voices: s.voices.map(v => ({ id: v.id, name: v.name, ...(v.gender ? { gender: v.gender } : {}), ...(v.description ? { description: v.description } : {}) })) } : s; }
  function heavyVoices(next, before) {
    if (!Array.isArray(before.voices)) return next;
    if (!Array.isArray(next.voices)) { next.voices = before.voices; return next; }
    const out = next.voices.map(v => { const old = before.voices.find(o => o.id === v?.id); return old && { ...old, ...(v.name ? { name: String(v.name) } : {}), ...(v.gender != null ? { gender: String(v.gender) } : {}), ...(v.description != null ? { description: String(v.description) } : {}) }; }).filter(Boolean);
    if (out.length) next.voices = out; else delete next.voices;
    return next;
  }

  // the jobs the game has (jobs/<id>/job.json; a package may bring more: kept as written)
  const JOBS = ['farmer', 'baker', 'innkeeper', 'cook', 'smith', 'woodcutter', 'miner', 'hunter', 'fisher', 'herder', 'merchant', 'guard', 'healer', 'ratcatcher', 'scholar', 'child', 'labourer', 'idler'];
  const jobOptions = v => [['', '(guessed from its role)'], ...JOBS, ...(v && typeof v === 'string' && !JOBS.includes(v) ? [v] : [])];
  const placeHint = () => (scn.places || []).map(p => p.id).slice(0, 4).join(', ') || (scn.generate ? 'house 2, smithy' : 'a thing\'s type');
  function agentBox(a, i) {
    const p = 'agents.' + i, hostile = a.hostile == null ? '' : String(!!a.hostile);
    return `<fieldset class="agent"><legend>${esc(a.id || 'character ' + (i + 1))} <button type="button" class="ghost small" data-remove="${i}">remove</button></legend><div class="cols">
      ${field('id', p + '.id')}${field('body', p + '.model', 'select', { options: modelOptions() })}${field('voice', p + '.ttsVoiceId', 'select', { options: voiceOptions() })}
      <label><span>hostile</span><select data-path="${p}.hostile" data-type="bool3"><option value=""${hostile === '' ? ' selected' : ''}>auto${MINDLESS.has(a.model) ? ' (yes)' : ' (no)'}</option><option value="true"${hostile === 'true' ? ' selected' : ''}>yes: fights, no LLM</option><option value="false"${hostile === 'false' ? ' selected' : ''}>no: talks</option></select></label>
      ${field('hit points', p + '.hp', 'num', { ph: 'default' })}${field('wields', p + '.wield')}
      ${field('job (a living world runs it)', p + '.job', 'select', { options: jobOptions(a.job) })}${field('home (a place)', p + '.home', 'text', { ph: placeHint() })}${field('workplace (a place or a thing)', p + '.workplace', 'text', { ph: placeHint() })}${field('temper', p + '.temper', 'select', { options: [['', '(the world\'s)'], 'short', 'normal', 'long'] })}${autonomySelect(p + '.autonomy', a.autonomy)}
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
    const tabs = [['story', 'Story'], ['player', 'Player'], ['characters', `Characters (${(scn.agents || []).length})`], ['layout', 'Layout'], ['books', `Books (${Object.keys(scn.books || {}).length})`], ['voices', `Voices (${(scn.voices || []).length})`], ['raw', 'JSON']];
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
        <label><span>living (characters act on their own: jobs, meals, sleep)</span><select data-path="live" data-type="bool3"><option value=""${!scn.live ? ' selected' : ''}>no</option><option value="true"${scn.live ? ' selected' : ''}>yes</option></select></label>
        ${field('start time (HH:MM)', 'time', 'text', { ph: '08:00' })}${field('day length (real minutes; 0 stops the clock)', 'dayMinutes', 'num', { ph: '12' })}
        ${field('temper (how fast insults anger them)', 'temper', 'select', { options: [['', '(normal)'], 'short', 'normal', 'long'] })}${field('monsters hunt', 'monsters', 'select', { options: [['', '(default: everyone in a living world)'], 'everyone', 'player'] })}
        ${autonomyPick()}
        <label><span>talk-only scene (no jobs or threats added by the builder)</span><select data-path="talk" data-type="bool3"><option value=""${scn.talk ? '' : ' selected'}>no</option><option value="true"${scn.talk ? ' selected' : ''}>yes</option></select></label>
        <div class="wide"><span class="muted">threats (on the clock: raid attacks people, rats eat the stores, bandits steal gold)</span>${(scn.threats || []).map((t, i) => `<div class="cols" style="align-items:end">${field('kind', `threats.${i}.kind`, 'select', { options: [...new Set(['raid', 'rats', 'bandits', t.kind].filter(Boolean))] })}${field('who (a body)', `threats.${i}.who`, 'text', { ph: 'wolf' })}${field('count', `threats.${i}.count`, 'num', { ph: '2' })}${field('when', `threats.${i}.when`, 'select', { options: [['', '(the kind\'s)'], 'night', 'day', 'any'] })}${field('every (days)', `threats.${i}.every`, 'num', { ph: '1' })}<button type="button" class="ghost small" data-act="removeThreat" data-i="${i}">remove</button></div>`).join('')}<button type="button" class="ghost small" data-act="addThreat">+ add a threat</button></div>
        ${field('intro', 'intro', 'area', { wide: true })}${field('goal (what the player is told)', 'goal.text', 'area', { wide: true, rows: 2 })}
        ${field('win / lose rules (JSON: {"win": ..., "lose": ...})', '__rules', 'json', { wide: true, rows: 3 })}
        ${field('full system prompt for every character (replaces the built one; {name} {style} {personality} {backstory} {commands})', 'systemPrompt', 'area', { wide: true, rows: 3 })}</div></fieldset></div>
      <div data-panel="player" ${tabNow === 'player' ? '' : 'hidden'}><fieldset><legend>Player</legend><div class="cols">${field('name', 'player.name')}${field('body', 'player.model', 'select', { options: modelOptions() })}${field('gold', 'player.gold', 'num')}${field('hit points', 'player.hp', 'num', { ph: '20' })}${field('items (comma)', 'player.items', 'list')}${field('wields', 'player.wield')}</div></fieldset></div>
      <div data-panel="characters" ${tabNow === 'characters' ? '' : 'hidden'}><fieldset><legend>Characters</legend>${(scn.agents || []).map(agentBox).join('') || '<p class="muted">No characters yet: drag monsters and people onto the map.</p>'}<button type="button" data-act="add">+ add a character</button></fieldset></div>
      <div data-panel="layout" ${tabNow === 'layout' ? '' : 'hidden'}><fieldset><legend>Map${scn.generate ? ' (generated ' + esc(scn.generate.kind || 'dungeon') + ')' : scn.grid?.length ? ' (drawn grid)' : scn.map?.length ? ' (layout lines)' : ' (fixed positions)'}</legend>${mapBox()}</fieldset></div>
      <div data-panel="books" ${tabNow === 'books' ? '' : 'hidden'}><fieldset><legend>Books</legend>${booksPanel()}</fieldset></div>
      <div data-panel="voices" ${tabNow === 'voices' ? '' : 'hidden'}><fieldset><legend>Voices</legend>${voicesPanel()}</fieldset></div>
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

  // ---- a world as a file (app/world-file.js): a picture with the world inside, a .zip, a .json ----
  const WF = () => window.tablefolkWorldFile;
  function openWorld(s) {
    if (scn) remember();
    // the page's own way of asking for changes (worldgen-core.js reviseWith), so Ask works on it too
    let rv = revise; try { rv = reviseWith(); } catch {}
    window.tfBuilder.show({ scenario: s, model: 'a file', ms: 0 }, { appLink, revise: rv, opened: true });
    msg('opened ' + (s.title || 'the world') + ' from a file');
  }
  document.addEventListener('click', async e => {
    if (e.target.id !== 'openWorldFile') return; e.preventDefault();
    try { openWorld(await WF().pick()); } catch (err) { alert(err.message); }
  });
  window.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file') && !e.target.closest?.('input[type=file]')) e.preventDefault(); });
  window.addEventListener('drop', async e => {
    const f = e.dataTransfer?.files?.[0]; if (!f || e.target.closest?.('input[type=file]') || !WF()?.isWorldFile(f)) return;
    e.preventDefault();
    try { openWorld(await WF().read(f)); } catch (err) { msg('could not open ' + f.name + ': ' + err.message); if (!scn) alert('could not open ' + f.name + ': ' + err.message); }
  });

  // ---- sections: the map being edited ----
  // secPath: [] the top map, else the subworlds keys down from it (a kept
  // building's inside is one too); the forms stay the world's (the top map)
  let secPath = [];
  const sectionAt = path => path.reduce((o, k) => o && o.subworlds && typeof o.subworlds[k] === 'object' ? o.subworlds[k] : null, scn);
  function cur() { const c = sectionAt(secPath); if (c) return c; secPath = []; return scn; }
  function putSection(path, s) { if (!path.length) scn = s; else { const p = sectionAt(path.slice(0, -1)); if (p) (p.subworlds ||= {})[path.at(-1)] = s; } }
  function allSections() {
    const out = [];
    const walk = (o, path, depth) => { out.push({ path, key: path.at(-1) ?? '', title: o.title || (path.length ? path.at(-1) : 'the top map'), depth, kind: o.generate?.kind || '' }); for (const [k, v] of Object.entries(o.subworlds || {})) if (v && typeof v === 'object' && depth < 8) walk(v, [...path, k], depth + 1); };
    if (scn) walk(scn, [], 0);
    return out;
  }
  const multi = () => allSections().length > 1;
  // where a link's "to" can point from the section shown: subworlds of it and of every section above it (scenario.js looks a key up the same way)
  function linkTargets() {
    const here = secPath.join('/');
    return allSections().filter(x => x.path.length && x.path.join('/') !== here && secPath.slice(0, x.path.length - 1).join('/') === x.path.slice(0, -1).join('/')).map(x => ({ key: x.key, title: x.title, depth: x.depth - 1 }));
  }
  const SECTION_KINDS = ['dungeon', 'castle', 'crypt', 'cave', 'forest', 'village', 'farm', 'empty'];
  // a new section at the top level (every section can link to it): a generate spec, or an empty floor
  function newSection({ kind = 'dungeon', size = [33, 25], title = null } = {}) {
    remember();
    const t = title || kind.replace(/^\w/, c => c.toUpperCase());
    let key = String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'section';
    for (let n = 2; scn.subworlds?.[key]; n++) key = key.replace(/-\d+$/, '') + '-' + n;
    const sz = Array.isArray(size) && size.length === 2 ? size.map(n => Math.max(9, Math.min(63, +n || 25))) : [33, 25];
    (scn.subworlds ||= {})[key] = kind === 'empty' ? { title: t, size: sz, floor: 'stone', agents: [], objects: [] }
      : { title: t, generate: { kind, size: sz, seed: 1 + Math.floor(Math.random() * 9999) }, agents: [], objects: [] };
    sectionBar(); return key;
  }
  function deleteSection(path) {
    if (!path.length) return;
    const parent = sectionAt(path.slice(0, -1)), key = path.at(-1); if (!parent?.subworlds?.[key]) return;
    remember(); delete parent.subworlds[key]; if (!Object.keys(parent.subworlds).length) delete parent.subworlds;
    // ways to it go too
    const strip = o => { if (Array.isArray(o.links)) { o.links = o.links.filter(l => l.to !== key); if (!o.links.length) delete o.links; } for (const v of Object.values(o.subworlds || {})) if (v && typeof v === 'object') strip(v); };
    strip(scn);
    setSection([]);
  }
  function setSection(path) { secPath = path; sectionBar(); if (ed) ed.load(cur()); }
  function sectionBar() {
    if (!$('mapEditor')) return;
    let bar = $('sectionBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'sectionBar'; bar.className = 'secbar'; $('mapEditor').insertAdjacentElement('beforebegin', bar); }
    if (!scn) { bar.hidden = true; return; }
    const list = allSections(), here = secPath.join('/'), c = cur();
    bar.hidden = false;
    bar.innerHTML = `<label class="secsel"><span class="lbl">Map</span><select id="secSelect">${list.map(x => `<option value="${esc(x.path.join('/'))}"${x.path.join('/') === here ? ' selected' : ''}>${'\u2003'.repeat(x.depth)}${esc(x.title)}${x.kind ? ' · ' + esc(x.kind) : ''}</option>`).join('')}</select></label>
      <span class="muted secinfo">${list.length > 1 ? `a world in ${list.length} sections · ${(c.links || []).length} way${(c.links || []).length === 1 ? '' : 's'} out of this one (the link tool, L, adds them)` : 'one map: add a section to make a bigger world (dungeon levels, the forest next door)'}</span>
      <details class="secadd"><summary>+ add a section</summary><div class="secform"><label><span class="lbl">Kind</span><select id="secKind">${SECTION_KINDS.map(k => `<option>${k}</option>`).join('')}</select></label><label><span class="lbl">Size</span><select id="secSize"><option value="25,19">small</option><option value="33,25" selected>medium</option><option value="45,35">large</option></select></label><label><span class="lbl">Title</span><input id="secTitle" placeholder="e.g. The Lower Vault"></label><button type="button" id="secAddBtn">Add</button></div></details>
      ${secPath.length ? `<button type="button" id="secRename">Rename</button><button type="button" id="secDelete" class="danger">Delete this section</button><button type="button" id="secTop">← the top map</button>` : ''}`;
    $('secSelect').onchange = e => setSection(e.target.value ? e.target.value.split('/') : []);
    $('secAddBtn').onclick = () => { const key = newSection({ kind: $('secKind').value, size: $('secSize').value.split(',').map(Number), title: $('secTitle').value.trim() || null }); setSection([key]); msg('added the section "' + (scn.subworlds[key].title) + '": link it from another map with the link tool (L)'); };
    if (secPath.length) {
      $('secRename').onclick = () => { const t = prompt('Title of this section:', c.title || ''); if (t != null && t.trim()) { remember(); c.title = t.trim(); sectionBar(); ed?.refresh(c); } };
      $('secDelete').onclick = () => { if (confirm(`Delete the section "${c.title || secPath.at(-1)}" and every way to it?`)) deleteSection(secPath); };
      $('secTop').onclick = () => setSection([]);
    }
  }

  // ---- the map editor ----
  function mapEditor() {
    if (ed || !window.tfMapEditor || !$('mapEditor')) return ed;
    ed = window.tfMapEditor.mount($('mapEditor'), {
      onChange(s) { putSection(secPath, s); formsSoon(); },
      sections: linkTargets,
      onNewSection: spec => newSection(spec),
      onEditInside({ id, type }) {
        const root = cur();
        (root.subworlds ||= {})[id] ||= window.TablefolkProcgen.interiorScenario(type);
        setSection([...secPath, id]);
      },
    });
    return ed;
  }
  let formsTimer = 0, edTimer = 0;
  // forms follow the map (not while typing in them)
  function formsSoon() { clearTimeout(formsTimer); formsTimer = setTimeout(() => { if (!$('editor')?.contains(document.activeElement)) render(); else formsSoon(); }, 300); }
  // the map follows the forms
  function mapSoon() { clearTimeout(edTimer); edTimer = setTimeout(() => { if (!secPath.length) ed?.refresh(scn); }, 250); }
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
    sectionBar();
    ed.load(cur());
    if (needsLayout(scn) && !secPath.length) layOut();
  }
  function onInput(e) {
    const el = e.target; if (!el.dataset?.path) return;
    try {
      const v = readInput(el);
      if (/\.ttsVoiceId$/.test(el.dataset.path) && (v === '__new' || String(v).startsWith('my:'))) {
        if (v === '__new') { assignTo = el.dataset.path; tabNow = 'voices'; render(); return; }
        remember(); const id = addMine(String(v).slice(3)); if (id) set(el.dataset.path, 'pack:' + id); render(); mapSoon(); return;
      }
      if (el.dataset.type === 'autonomy') { if ((el.type === 'radio' && !el.checked) || (el.tagName === 'SELECT' && e.type === 'input')) return; setAutonomy(el.dataset.path, v); msg(''); render(); mapSoon(); return; }
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
    else if (act === 'copy') {
      const l = location.origin + await link(false); await navigator.clipboard.writeText(l);
      // chat apps and some sites cut long links (links-and-testing.md): a big world (sections, voices, pictures) travels better as a file
      if (l.length > 8000) { msg(`link copied, but it is long (${Math.round(l.length / 1024)} KB): chat apps may cut it; "Share as a picture" or ".zip" carry the whole world as a file`); setTimeout(() => msg(''), 9000); }
      else { msg('link copied'); setTimeout(() => msg(''), 2500); }
    }
    else if (act === 'download') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(scn, null, 2)], { type: 'application/json' })); a.download = (scn.title || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json'; a.click(); }
    else if (act === 'sharePic') { msg('drawing the picture…'); try { await mapLaidOut(); const shot = await ed?.snapshot?.({ maxSide: 1000 }), blob = await WF().toImage(scn, { picture: shot?.url }); WF().download(blob, WF().fileName(scn, 'png')); msg(`picture saved (${Math.round(blob.size / 1024)} KB): send the file itself; the game opens it when it is dropped on the page`); } catch (err) { msg('failed: ' + err.message); } }
    else if (act === 'zip') { try { const blob = await WF().toZip(scn); WF().download(blob, WF().fileName(scn, 'zip')); msg(`.zip saved (${Math.round(blob.size / 1024)} KB)`); } catch (err) { msg('failed: ' + err.message); } }
    else if (act === 'openFile') { try { openWorld(await WF().pick()); } catch (err) { msg(err.message); } }
    else if (act === 'addThreat') { remember(); (scn.threats ||= []).push({ kind: 'raid', who: 'wolf', count: 2, when: 'night', every: 1 }); render(); mapSoon(); }
    else if (act === 'removeThreat') { remember(); scn.threats.splice(+b.dataset.i, 1); if (!scn.threats.length) delete scn.threats; render(); mapSoon(); }
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
  // a world in sections: the AI changes the section shown, told about the rest
  function worldContext() {
    if (!multi()) return '';
    const here = secPath.join('/');
    const lines = allSections().map(x => `- ${x.path.join('/') || '(top map)'}: "${x.title}"${x.kind ? ' (' + x.kind + ')' : ''}${(sectionAt(x.path).agents || []).length ? ', with ' + sectionAt(x.path).agents.slice(0, 6).map(a => a.id).join(', ') : ''}${x.path.join('/') === here ? '  <- THIS ONE' : ''}`);
    return `This world is made of ${lines.length} sections (maps joined by links: stairs, doors, edges):\n${lines.join('\n')}\nThe scenario below is only the section "${cur().title || here || 'top map'}". Change only this section; keep its "links" unless asked (they lead to the other sections).\n\n`;
  }
  function sectionOut(s) { const { subworlds, ...rest } = s; return rest; }
  async function reviseAI(req, say) {
    const path = secPath.slice(), base = cur(), top = !path.length;
    const send = multi() ? sectionOut(base) : base;
    req = worldContext() + req;
    const { light, heavy } = lightImages(top ? lightVoices(lightBooks(send)) : send);
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
    remember();
    let next = heavy(done.scenario);
    if (top) next = heavyVoices(heavyBooks(next, scn), scn);
    if (base.subworlds && next && typeof next === 'object') next.subworlds = base.subworlds;   // the other sections are not the AI's to rewrite
    putSection(path, next); secPath = path; render(); loadMap();
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
    await new Promise(r => requestAnimationFrame(() => r()));
  }
  async function critique(round, rounds, history, say) {
    await mapLaidOut();
    const shot = await ed?.snapshot?.(), mapText = ed?.describe?.() || '';
    const send = multi() ? sectionOut(cur()) : cur();
    const { light } = lightImages(secPath.length ? send : lightVoices(lightBooks(send)));
    // a world in sections: the reviewer is told which section this is (as the first "earlier round" line)
    const ctx = worldContext().replace(/\n+/g, ' ').trim();
    const body = { scenario: light, mapText, round, rounds, history: ctx ? [ctx + ' Review only this section.', ...history] : history };
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
        const before = JSON.parse(JSON.stringify(cur()));
        const done = await reviseAI(c.request, t => say(`round ${round}/${rounds}: ${t}`));
        const d = diffWorlds(before, cur());
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
        ed?.refresh?.(cur());
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
      scn = JSON.parse(JSON.stringify(result.scenario)); meta = result; secPath = []; if (opts.appLink) appLink = opts.appLink; if (opts.revise) revise = opts.revise; render(); loadMap(); $('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // the form's "look it over" (?improve=N): the agent starts on the new world
      // (or "always, after every change" is on)
      if (opts.improve > 0 && revise.where !== undefined) { agent.rounds = Math.min(5, +opts.improve); setTimeout(() => improve(agent.rounds), 600); }
      else if (agent.auto && revise.where !== undefined && !opts.opened) setTimeout(() => improve(), 600);
    },
    improve, paintPending, pendingPictures, get agent() { return agent; }, get editor() { return ed; },
    get scenario() { return scn; },
    encode,
  };
})();
