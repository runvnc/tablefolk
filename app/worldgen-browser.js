/* worldgen-browser.js -- the world builder's "step by step, in this browser"
 * run: the scenario is written by the local Gemma (LiteRT, the model this
 * browser loaded last) in small steps, each checked and put together by code,
 * instead of one big JSON answer from the server's model.
 *
 *   1. plan        plain text: title, kind (dungeon, village, outdoor), the
 *                  places, the characters, the treasure, the goal
 *   2. map         a little JSON: title, intro, light, how many rooms, what
 *                  lies where. Code builds the map (procgen.js, or layout
 *                  lines outdoors).
 *   3. review      the model sees the map that was built (its rooms and what
 *                  is in them, and the map as text) and may add things or
 *                  change the room count
 *   4. characters  JSON for the people and monsters, placed in the rooms built
 *   5. fixes       the server checks the whole scenario (POST /api/finish, the
 *                  same checks as a generated one); problems go back to the
 *                  model, at most twice
 *
 *   window.tfWorldgen.run(prompt, emit)   emit(event, data) like the server's
 *       stream: 'progress' {stage, label, chars, preview}, then 'done'
 *       {scenario, code, link, ms, model} or 'failed' {error}
 */
(function () {
  const LOADER = '/app/llm_js/model-loader-litert.js?v=20261024c';
  const PEOPLE = 'woodsman huntress peasant peasant_woman adventurer adventurer_woman hooded king farmer villager witch wizard'.split(' ');
  const MONSTERS = 'skeleton skeleton_warrior skeleton_farmer zombie goblin kobold orc troll rat spider wolf bat ghost slime demon giant dragon'.split(' ');
  const MINDLESS = new Set('skeleton skeleton_warrior skeleton_farmer zombie rat spider wolf bat ghost slime demon giant dragon'.split(' '));
  const DUNGEON = 'entrance throne lair treasure library shrine barracks storage kitchen prison crypt alchemy'.split(' ');
  const VILLAGE = 'square tavern smithy shop temple alchemist guardhouse library stable house pond garden'.split(' ');
  const THINGS = 'chest coin_pile note potion scroll key chalice rope torch barrel crate candles candelabra cage chains statue bookcase lectern cabinet well market_stand cart tent logs campfire banner'.split(' ');
  const OUTDOOR_THINGS = 'campfire tree boulder tent cart logs crate barrel chest well fence signpost flowers lantern bench table mushroom coin_pile note'.split(' ');
  const ENEMY = /\b(villain|necromancer|evil|cultist|cult leader|bandit|brigand|captor|kidnapp\w*|warlord|tyrant|dark lord|lich|enemy|boss|raider|marauder|assassin|monster|warlock)\b/i;
  const HOSTILE_INTENT = /\b(attacks? (anyone|intruders|strangers|the player|on sight)|kills? (anyone|intruders|strangers|the player)|despises (the living|intruders|strangers)|wants (the player|intruders|them) dead)\b/i;
  const COMMANDS = 'say whisper walk face emote give sell inventory look carry drop attack wield'.split(' ');

  // ---- the model ----
  let L = null, modelKey = '';
  async function model(emit) {
    if (L) return L;
    emit('progress', { stage: 'loading', label: 'loading the model in this browser…' });
    const mod = await import(LOADER);
    let key = 'gemma4-e2b-litert';
    try { const k = localStorage.getItem('tablefolk_model'); if (/litert$/.test(k || '')) key = k; } catch {}
    const has = await mod.hasModelCached?.(key).catch(() => false);
    if (has === false) throw new Error(`${key} is not downloaded in this browser yet: open the game once and load it there, then come back`);
    await mod.loadModel(key, p => emit('progress', { stage: 'loading', label: typeof p === 'string' ? p : p?.text || 'loading…' }));
    modelKey = key; L = mod;
    return L;
  }
  let n = 0; const log = [];
  async function ask(emit, stage, label, system, user) {
    const agentId = 'worldgen-' + stage + '-' + (++n) + '-' + Date.now();
    emit('progress', { stage, label, chars: 0 });
    let last = 0;
    const text = await L.litertClient.generate([{ role: 'system', content: system }, { role: 'user', content: user }], { agentId, temperature: stage === 'plan' ? .85 : .5 }, t => {
      if (t.length - last > 24) { last = t.length; emit('progress', { stage, label, chars: t.length, preview: t.slice(-220) }); }
    });
    L.litertClient.clearConversations(agentId).catch(() => {});
    log.push({ stage, text });   // window.tfWorldgen.log: every answer, for tests
    emit('progress', { stage, label, chars: text.length, preview: text.slice(-220) });
    return text;
  }

  // ---- JSON from a small model: the first {...}, forgiving trailing commas and comments ----
  function json(text) {
    const t = String(text).replace(/```(json)?/g, ''), start = t.indexOf('{'); if (start < 0) throw new Error('no JSON object');
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) { end = i; break; }
    }
    let s = t.slice(start, end < 0 ? undefined : end + 1);
    if (end < 0) s += '}'.repeat(Math.max(1, depth));   // cut off: close it
    s = s.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(s);
  }
  const words = s => String(s || '').toLowerCase();
  const pickFrom = (list, s) => list.find(w => new RegExp('\\b' + w.replace('_', '[ _]') + '\\b').test(words(s)));
  const id = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'someone';

  // ---- 1. plan ----
  function parsePlan(text, prompt) {
    const line = k => (text.match(new RegExp('^\\s*\\**' + k + '\\**\\s*:\\s*(.+)$', 'im')) || [])[1]?.trim() || '';
    const kindText = line('KIND') + ' ' + prompt;
    const kind = /dungeon|crypt|cave|castle|tomb|keep|lair|mine|catacomb|tower/i.test(line('KIND') || prompt) ? 'dungeon'
      : /village|town|hamlet|market|city/i.test(kindText) ? 'village' : /outdoor|forest|camp|grove|field|road|beach|clearing/i.test(kindText) ? 'outdoor' : 'dungeon';
    const placeList = kind === 'village' ? VILLAGE : DUNGEON;
    const places = [...new Set(line('PLACES').split(/[,;]/).map(p => pickFrom(placeList, p)).filter(Boolean))];
    const chars = [];
    const block = text.split(/^\s*\**CHARACTERS\**\s*:/im)[1] || '';
    for (const l of block.split('\n')) {
      if (/^\s*\**[A-Z]+\**\s*:/.test(l) && chars.length) break;
      const parts = l.replace(/^\s*[-*\d.)]+\s*/, '').split('|').map(s => s.trim());
      if (parts.length < 3 || !parts[0]) continue;
      const body = pickFrom(PEOPLE.concat(MONSTERS), parts[1]) || (/goblin/i.test(l) ? 'goblin' : /skelet/i.test(l) ? 'skeleton' : 'villager');
      chars.push({ name: parts[0].replace(/\*+/g, ''), body, role: parts[2] || '', want: parts[3] || '', know: parts[4] || '' });
    }
    return { title: line('TITLE').replace(/\*+/g, '') || prompt, kind, mood: line('MOOD'), places, chars: chars.slice(0, 6), treasure: line('TREASURE'), goal: line('GOAL'), text };
  }

  // ---- 2./3. the map ----
  function buildMap(plan, m) {
    const scn = {
      v: 1, title: String(m.title || plan.title).slice(0, 60), subtitle: String(m.subtitle || '').slice(0, 120), intro: String(m.intro || '').slice(0, 400),
      seed: 1 + Math.floor(Math.random() * 9999), lighting: /bright|day/i.test(m.lighting || plan.mood) ? 'bright' : 'night', walls: 'stone', wallHeight: 2,
      player: { name: 'Traveller', gold: 10, items: [] }, allowed: ['say', 'walk', 'face', 'emote'], agents: [], goal: null,
    };
    const things = plan.kind === 'outdoor' ? OUTDOOR_THINGS : THINGS;
    const places = plan.kind === 'village' ? VILLAGE : DUNGEON;
    // models like to write the rooms out: [{name, objects: [...]}]
    for (const k of ['rooms', 'buildings']) if (Array.isArray(m[k])) {
      const rooms = m[k];
      m.objects = [...(m.objects || []), ...rooms.flatMap(r => (Array.isArray(r?.objects) ? r.objects : []).map(o => ({ ...o, in: o.in || r.name || r.id })))];
      plan.places = [...new Set([...plan.places, ...rooms.map(r => pickFrom(places, r?.name || r?.id || r)).filter(Boolean)])];
      m[k] = rooms.length;
    }
    const seen = new Set();
    const objects = (Array.isArray(m.objects) ? m.objects : []).filter(o => o && things.includes(o.type) && !seen.has(o.type + '|' + o.in + '|' + (o.text || '')) && seen.add(o.type + '|' + o.in + '|' + (o.text || ''))).slice(0, 16).map(o => {
      const out = { type: o.type };
      if (plan.kind !== 'outdoor') out.in = pickFrom(places, o.in) || plan.places[0] || places[1];
      if (o.gold != null && /chest|coin/.test(o.type)) out.gold = Math.max(0, Math.min(500, Math.round(+o.gold) || 0));
      if (Array.isArray(o.items) && o.type === 'chest') out.items = o.items.map(String).slice(0, 4);
      if (o.type === 'note' && o.text) out.text = String(o.text).slice(0, 200);
      return out;
    });
    if (plan.kind === 'outdoor') {
      scn.floor = /sand|beach|desert/i.test(plan.text) ? 'sand' : 'grass'; scn.size = [21, 21];
      scn.map = (Array.isArray(m.map) ? m.map : []).map(String).filter(l => /^(place|paint|\w+ path)\b/.test(l.trim())).slice(0, 30);
      for (const o of objects) scn.map.push(`place ${o.type} at random`);
      if (!scn.map.some(l => /player/.test(l))) scn.map.push('place player at south');
      scn.objectsOutdoor = objects.filter(o => o.gold != null || o.items || o.text);
      return { scn, places: [] };
    }
    const n = Math.max(3, Math.min(plan.kind === 'village' ? 12 : 12, Math.round(+(m.rooms ?? m.buildings) || plan.places.length + 2)));
    scn.generate = plan.kind === 'village' ? { kind: 'village', buildings: n, places: plan.places } : { kind: 'dungeon', rooms: n, places: plan.places };
    scn.dark = plan.kind === 'dungeon' ? m.dark !== false : false;
    scn.objects = objects;
    let built = globalThis.TablefolkProcgen.applyToScenario(JSON.parse(JSON.stringify(scn)));
    // a thing put in a place that was not built goes to a like one that was
    const ids = built.places.map(p => p.id.replace(/\s+\d+$/, ''));
    if (scn.objects.some(o => !ids.includes(o.in))) {
      const alt = { garden: 'square', pond: 'square', square: 'house', crypt: 'shrine', treasure: 'lair', throne: 'lair' };
      for (const o of scn.objects) if (!ids.includes(o.in)) o.in = ids.includes(alt[o.in]) ? alt[o.in] : ids.find(i => i !== 'entrance' && i !== 'square') || ids[0];
      scn.generate.places = scn.generate.places.filter(p => ids.includes(p));
      built = globalThis.TablefolkProcgen.applyToScenario(JSON.parse(JSON.stringify(scn)));
    }
    return { scn, places: built.places, grid: built.scenario.grid, objects: built.scenario.objects };
  }
  function describeMap(built) {
    const lines = built.places.map(p => {
      const inside = (built.objects || []).filter(o => o.x >= p.x0 && o.x <= p.x1 && o.z >= p.z0 && o.z <= p.z1 && !['wall', 'door', 'light', 'torch'].includes(o.type));
      const count = inside.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {});
      return `- ${p.id}: ${Object.entries(count).map(([t, k]) => k > 1 ? `${k} ${t}s` : t).join(', ') || 'empty'}`;
    });
    const grid = (built.grid || []).length <= 41 ? '\nThe map from above (# walls, + doors, . floor):\n' + built.grid.join('\n') : '';
    return lines.join('\n') + grid;
  }

  // ---- 4. characters ----
  function buildAgents(plan, out, built, scn) {
    const list = (Array.isArray(out.agents) ? out.agents : []).slice(0, 6), ids = new Set();
    const placeIds = built.places.map(p => p.id);
    const agents = list.map((a, i) => {
      let aid = id(a.id || a.name || plan.chars[i]?.name || 'npc' + i); while (ids.has(aid)) aid += '2'; ids.add(aid);
      const model = PEOPLE.concat(MONSTERS).includes(a.model) ? a.model : pickFrom(PEOPLE.concat(MONSTERS), a.model) || plan.chars[i]?.body || 'villager';
      const ag = { id: aid, model };
      // a monster body given a real part (a ghost who guards and talks) talks
      const talks = MINDLESS.has(model) && a.hostile !== true && String(a.personality || '').length > 80 && (!a.allowed || a.allowed.includes('say'));
      // the story's enemies fight (and, with a personality, still talk)
      // (a monster body allowed to attack is an enemy with a mind)
      // (words about others in a personality mislead: "an escapee from the bandits"; intent doesn't)
      const villain = a.hostile !== false && (ENEMY.test([a.style, a.id, plan.chars[i]?.role].join(' ')) || HOSTILE_INTENT.test(String(a.personality || ''))
        || (MINDLESS.has(model) || ['goblin', 'kobold', 'orc', 'troll'].includes(model)) && (a.allowed || []).includes('attack'));
      const hostile = villain || (!talks && (a.hostile === true || (a.hostile == null && MINDLESS.has(model))));
      if (villain) ag.hostile = true; else if (talks) ag.hostile = false; else if (a.hostile === true || a.hostile === false) ag.hostile = a.hostile;
      if (a.hp) ag.hp = Math.max(1, Math.min(30, Math.round(+a.hp) || 10));
      ag.style = String(a.style || plan.chars[i]?.role || model).slice(0, 60);
      ag.personality = String(a.personality || '').slice(0, 900) || (hostile ? `A hostile ${model.replace(/_/g, ' ')}.` : `${aid}, ${ag.style}. ${plan.chars[i]?.want || ''} ${plan.chars[i]?.know || ''}`.trim());
      const allowed = (Array.isArray(a.allowed) ? a.allowed : []).map(String).filter(c => COMMANDS.includes(c));
      if (!hostile) ag.allowed = [...new Set(['say', 'walk', 'emote', ...allowed])];
      const inv = a.inventory || {}, items = (Array.isArray(inv.items) ? inv.items : Array.isArray(a.items) ? a.items : []).map(String).slice(0, 5);
      if (items.length || inv.gold) ag.inventory = { gold: Math.max(0, Math.round(+inv.gold || 0)), items };
      if (a.wield) ag.wield = String(a.wield);
      if (scn.generate) { const p = pickFrom(placeIds.map(x => x.replace(/\s+\d+$/, '')), a.in); if (p) ag.in = p; }
      else ag.near = OUTDOOR_THINGS.includes(a.near) ? a.near : 'campfire';
      return ag;
    });
    scn.agents = agents.filter(a => !scn.map || true).map(a => { const { near, ...rest } = a; return rest; });
    if (scn.map) for (const a of agents) scn.map.push(`place ${a.id} near ${a.near || 'player'}`);
    if (scn.map && scn.objectsOutdoor) { delete scn.objectsOutdoor; }
    // a goal the game can check, or none
    const g = out.goal || (out.agents || []).map(a => a?.goal).find(x => x?.player_has || x?.agent_defeated), holder = item => agents.find(a => a.inventory?.items?.some(i => i.toLowerCase() === String(item).toLowerCase()));
    // a thing picked up from the floor goes by its kind ("key"), so "silver key" is the key
    const PICK = { key: 'key', chalice: 'gold chalice', potion: 'healing potion', scroll: 'scroll', rope: 'rope', torch: 'torch' };
    if (g?.player_has && !holder(g.player_has)) {
      const pick = (scn.objects || []).find(o => PICK[o.type] && new RegExp('\\b' + o.type + '\\b', 'i').test(g.player_has));
      if (pick) g.player_has = PICK[pick.type];
    }
    if (g?.player_has && holder(g.player_has)) {
      const h = holder(g.player_has); h.allowed = [...new Set([...(h.allowed || []), 'give'])];
      scn.goal = { text: String(g.text || `Get the ${g.player_has}.`).slice(0, 160), win: { player_has: String(g.player_has) } };
    } else if (g?.agent_defeated && agents.some(a => a.id === id(g.agent_defeated))) {
      scn.goal = { text: String(g.text || `Defeat ${id(g.agent_defeated)}.`).slice(0, 160), win: { agent_defeated: id(g.agent_defeated) }, lose: { player_defeated: true } };
    } else if (g?.player_has && (scn.objects || []).some(o => o.items?.some(i => i.toLowerCase() === String(g.player_has).toLowerCase()) || PICK[o.type] === g.player_has)) {
      scn.goal = { text: String(g.text || `Find the ${g.player_has}.`).slice(0, 160), win: { player_has: String(g.player_has) } };
    }
    if (scn.goal?.win?.player_has && !agents.some(a => a.allowed?.includes('give') || a.allowed?.includes('sell'))) {
      // the chest has it: the game's check wants someone able to hand things over
      const p = agents.find(a => !MINDLESS.has(a.model)); if (p) p.allowed = [...new Set([...(p.allowed || []), 'give'])]; else scn.goal = null;
    }
    return scn;
  }

  // A key in the story opens something: lock a room it is not in (locks.js).
  function autoLock(scn, built) {
    if (!scn.generate) return;
    const ids = built.places.map(p => p.id.replace(/\s+\d+$/, ''));
    const keys = [
      ...(scn.objects || []).filter(o => o.type === 'key').map(o => ({ name: 'key', in: o.in })),
      ...(scn.objects || []).flatMap(o => (o.items || []).filter(i => /\bkey\b/i.test(i)).map(i => ({ name: i, in: o.in }))),
      ...(scn.agents || []).flatMap(a => (a.inventory?.items || []).filter(i => /\bkey\b/i.test(i)).map(i => ({ name: i, in: a.in, holder: a }))),
    ];
    const k = keys[0]; if (!k) return;
    const room = ['treasure', 'prison', 'throne', 'crypt', 'library', 'shrine', 'storage', 'smithy', 'shop', 'temple'].find(r => ids.includes(r) && r !== k.in);
    if (!room) return;
    scn.locked = [{ in: room, key: k.name }];
    // whoever carries it can hand it over
    if (k.holder && !MINDLESS.has(k.holder.model)) k.holder.allowed = [...new Set([...(k.holder.allowed || []), 'give'])];
    if (scn.intro && !/locked/i.test(scn.intro)) scn.intro += ` The ${room} is locked.`;
  }

  async function finish(scn, prompt, t0) {
    const r = await fetch('/api/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: scn, prompt, model: modelKey + ' (browser, steps)', ms: Date.now() - t0 }) });
    return r.json();
  }

  async function run(prompt, emit) {
    const t0 = Date.now();
    try {
      await model(emit);
      // 1. plan
      const planText = await ask(emit, 'plan', 'step 1/4: planning the world', 'You design small adventure scenes for a 3D tabletop game whose characters are played by a small AI. Be concrete and brief.',
        `Request: "${prompt}"\n\nWrite a plan, under 200 words, with exactly these lines:\nTITLE: a short title\nKIND: dungeon, village or outdoor\nMOOD: bright or night, and the feeling\nPLACES: 3-7 places, comma separated. Dungeon places: ${DUNGEON.join(', ')}. Village places: ${VILLAGE.join(', ')}.\nCHARACTERS:\n- name | body | role | what they want | what they know or hide\n(3-5 lines: at least one person the player can talk to, and monsters if there is danger. Example: - Brann | woodsman | the gravekeeper | wants the crypt sealed | knows the ghost was his sister. Bodies: ${PEOPLE.join(', ')}; monsters: ${MONSTERS.join(', ')})\nTREASURE: what is worth finding and where\nGOAL: one thing the player tries to do`);
      const plan = parsePlan(planText, prompt);
      // 2. map
      const things = plan.kind === 'outdoor' ? OUTDOOR_THINGS : THINGS;
      const mapAsk = plan.kind === 'outdoor'
        ? `Write the outdoor map as JSON only:\n{"title": "...", "subtitle": "one line hook", "intro": "2-3 sentences for the player", "lighting": "bright or night", "map": ["place campfire at center", "place tree x6 scattered at north", "paint water x8 cluster at east", "place player at south"], "objects": [{"type": "chest", "gold": 30, "items": ["silver key"]}]}\nMap lines: place <thing> [xN] [scattered|cluster|row] at center|north|south|east|west|random, or near/beside <thing>. Things: ${OUTDOOR_THINGS.join(', ')}. No characters yet.`
        : `Write the map as JSON only:\n{"title": "...", "subtitle": "one line hook", "intro": "2-3 sentences for the player", "lighting": "bright or night", "${plan.kind === 'village' ? 'buildings' : 'rooms'}": ${plan.places.length + 2} (a number), "objects": [{"type": "chest", "in": "treasure", "gold": 30, "items": ["silver key"]}, {"type": "note", "in": "library", "text": "..."}]}\nPlaces for "in": ${(plan.kind === 'village' ? VILLAGE : DUNGEON).join(', ')}. Object types: ${things.join(', ')}. Rooms are furnished on their own: list only what matters to the story (2-8 objects). No characters yet.`;
      let mapOut = {};
      try { mapOut = json(await ask(emit, 'map', 'step 2/4: drawing the map', 'You turn adventure plans into game data. Answer with one JSON object, nothing else.', `The plan:\n${planText}\n\n${mapAsk}`)); }
      catch (e) { emit('progress', { stage: 'map', label: 'the map answer was not JSON; using the plan' }); }
      let built = buildMap(plan, mapOut);
      // 3. review
      if (plan.kind !== 'outdoor') {
        try {
          const rev = json(await ask(emit, 'review', 'step 3/4: looking at the map', 'You check game maps against their plan. Answer with one JSON object, nothing else.',
            `The plan:\n${planText}\n\nThe map that was built has these places and things:\n${describeMap(built)}\n\nIs anything from the plan missing (a treasure, a clue, a place)? Answer JSON only: {"add": [{"type": "...", "in": "...", ...}], "${plan.kind === 'village' ? 'buildings' : 'rooms'}": number or null, "intro": "better intro or null"}. "add" may be empty. Object types: ${things.join(', ')}.`));
          if (Array.isArray(rev.add) && rev.add.length) mapOut.objects = [...(mapOut.objects || []), ...rev.add.slice(0, 6)];
          const key = plan.kind === 'village' ? 'buildings' : 'rooms';
          if (+rev[key] >= 3 && +rev[key] <= 14) mapOut[key] = +rev[key];
          if (typeof rev.intro === 'string' && rev.intro.length > 20) mapOut.intro = rev.intro;
          built = buildMap(plan, mapOut);
        } catch (e) { console.warn('[worldgen] review skipped:', e.message); log.push({ stage: 'review', error: e.message }); }
      }
      const scn = built.scn;
      // 4. characters
      const where = plan.kind === 'outdoor' ? `"near": one of ${OUTDOOR_THINGS.join(', ')}` : `"in": one of ${[...new Set(built.places.map(p => p.id.replace(/\s+\d+$/, '')))].join(', ')}`;
      const charAsk = `Write the characters as JSON only:\n{"agents": [{"id": "vexa", "model": "witch", "${plan.kind === 'outdoor' ? 'near' : 'in'}": "...", "style": "a few words", "personality": "Vexa, a witch who ... 2-4 plain sentences: who they are, what they want, facts they know, what they do", "allowed": ["say", "give"], "inventory": {"gold": 0, "items": ["silver key"]}}], "goal": {"text": "Get the silver key.", "player_has": "silver key"}}\n${where}. Bodies: ${PEOPLE.join(', ')}; monsters: ${MONSTERS.join(', ')}. Enemies who attack the player on sight get "hostile": true (with a personality they still talk when spoken to). Monsters that only fight need just id, model, ${plan.kind === 'outdoor' ? 'near' : 'in'} and "hp". Commands for "allowed": ${COMMANDS.join(', ')} (give/sell to hand things over, attack for fighters). Write everyone in the plan (2-5 characters), and add monsters if the place is dangerous. Each person needs a reason to talk to the player. Goal: {"player_has": item} or {"agent_defeated": id}, or null.`;
      const chars = json(await ask(emit, 'characters', 'step 4/4: casting the characters', 'You write game characters as data. Answer with one JSON object, nothing else.', `The plan:\n${planText}\n\n${charAsk}`));
      buildAgents(plan, chars, built, scn);
      if (!scn.agents.length) throw new Error('the model wrote no characters');
      autoLock(scn, built);
      // 5. the server's checks, and fixes
      let r = await finish(scn, prompt, t0);
      for (let round = 1; r.problems?.length && round <= 2; round++) {
        emit('progress', { stage: 'problems', problems: r.problems });
        const fixed = json(await ask(emit, 'repairing', `fixing ${r.problems.length} problem${r.problems.length > 1 ? 's' : ''}`, 'You fix game data. Answer with one JSON object, nothing else.',
          `These characters:\n${JSON.stringify({ agents: scn.agents, goal: scn.goal })}\n\nhave problems:\n- ${r.problems.join('\n- ')}\n\nReply with the corrected {"agents": [...], "goal": ...} only.`));
        if (Array.isArray(fixed.agents)) buildAgents(plan, { agents: fixed.agents.map(a => ({ ...a, in: a.in })), goal: fixed.goal?.win ? { ...fixed.goal.win, text: fixed.goal.text } : fixed.goal }, built, scn);
        r = await finish(scn, prompt, t0);
      }
      if (r.problems?.length) throw new Error('the scenario still has problems: ' + r.problems.join('; '));
      emit('done', { ...r, ms: Date.now() - t0, model: modelKey + ' (in this browser, step by step)' });
    } catch (e) {
      console.error('[worldgen]', e);
      emit('failed', { error: e.message || String(e) });
    }
  }
  window.tfWorldgen = { run, parsePlan, json, log };
})();
