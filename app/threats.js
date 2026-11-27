/* threats.js -- danger on the clock: wolves at night, rats in the stores,
 * bandits on the road.
 *
 * A scenario lists them ("threats", through normalizeScenario):
 *   { "kind": "raid", "who": "wolf", "count": 2, "when": "night", "every": 1, "from": "edge" }
 * "kind" names an entry of the kinds table; every other field overrides it.
 * Built-in kinds (the same shape a package's "threats" section uses):
 *   raid     who wolf, 2, at night: attacks people (and anyone it meets)
 *   rats     who rat, 3, at night: "pilfer": goes for the food in the
 *            stores and eats it, runs when hurt
 *   bandits  who rogue, 2, by day: "rob": takes gold (from a person or a
 *            chest) and runs for the edge
 * Fields: who (a body, or a list), name (their ids: wolf1, wolf2), count,
 * when ("night" 22:00, "day" 10:00, "any", or [hour, hour]), every (days),
 * from ("edge", or a place id: a lair), side (with "edge": north, south,
 * east or west: that edge only, e.g. the side a forest section lies on), behaviour (raid | pilfer | rob, or
 * a package module's registered one), targets (pilfer: item names), hp,
 * retreat ("dawn": at daybreak, or 17:00 for day kinds; "half": when half
 * are down; both by default), announce (a narrator's line), scares (others
 * hide: true for raid and rob), sound (played as they come: sfx.js, a package's too).
 * A package module's threats.<kind>(c, ctx) runs each raider's turn (ctx: spec,
 * group, retreat(why), despawn(), walkTo(x, z), attack(target), api); false
 * falls back to the kind's behaviour.
 * Only the section the player is in has threats (its own list: scenario.js
 * here()); the others stand still while the player is away.
 * They retreat to the edge and are gone (fled) at dawn or when half are
 * down. Afterwards everyone remembers it as news, and thinks better of those
 * who fought (the player included).
 *
 *   window.tablefolkThreats = { active(), label(c), scares(c), turn(c), registerKind, registerBehaviour, now(kind), retreat(why), KINDS }
 * live.js runs a raider's turn through turn(c); jobs.js sends fighters and
 * hides the rest. Loaded after jobs.js; uses app.js globals.
 */
(function () {
  const CORE = {
    raid: { who: 'wolf', name: '', count: 2, when: 'night', every: 1, from: 'edge', behaviour: 'raid', retreat: 'dawn half', scares: true, announce: 'Howling at the edge of the village: {name}s are coming!', hp: 6 },
    rats: { who: 'rat', name: 'rat', count: 3, when: 'night', every: 1, from: 'edge', behaviour: 'pilfer', targets: [], retreat: 'dawn half', scares: false, announce: 'Rats are scurrying toward the food stores!', hp: 3 },
    bandits: { who: 'rogue', name: 'bandit', count: 2, when: 'day', every: 2, from: 'edge', behaviour: 'rob', retreat: 'dawn half', scares: true, announce: 'Bandits are coming up the road!', hp: 8 },
  };
  const KINDS = { ...CORE }, PKG = new Set(), BEHAVIOURS = {};
  const W = () => window.tablefolk, P = () => window.tablefolkPlay, K = () => window.tablefolkClock, J = () => window.tablefolkJobs;
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // the section the player is in (scenario.js here()): threats only come where the player is
  const scn = () => window.tablefolkScenario?.here?.() || window.tablefolkScenario?.active?.scn || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function registerKind(kind, def, from = '') {
    if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(kind)) throw new Error('bad threat kind name');
    if (!def || typeof def !== 'object') throw new Error('a threat kind is an object');
    KINDS[kind] = { ...(CORE[def.behaviour === 'pilfer' ? 'rats' : def.behaviour === 'rob' ? 'bandits' : 'raid']), ...def, _from: from };
    if (from) PKG.add(kind);
  }
  function registerBehaviour(kind, fn) { BEHAVIOURS[kind] = fn; }
  function resetPackaged() { for (const k of PKG) delete KINDS[k]; PKG.clear(); for (const k of Object.keys(BEHAVIOURS)) delete BEHAVIOURS[k]; }

  // ---- the night's (or day's) visitors ----
  let groups = [];   // { spec, ids, day, retreating, startAlive, fought: Set }
  const raiders = () => groups.filter(gr => !gr.retreating).flatMap(gr => gr.ids.map(id => state.characters.find(c => c.id === id)).filter(c => c && !c.defeated && !W().getBrainConfig(c.id).defeated));
  const active = () => raiders();
  const specOf = c => c?._threat?.spec || null;
  const label = c => specOf(c)?.name || c?.charModel || 'raider';
  const scares = c => !!specOf(c)?.scares && !c?._threat?.group?.retreating;
  // a free square on the board's edge ("side": north | south | east | west: that edge only)
  function edgeCell(only) {
    const hw = Math.floor((state.worldW || 0) / 2) || null;
    const xs = [], b = (window.tablefolk?.WORLD) || {};
    const halfW = Math.floor(b.halfW ?? 20), halfH = Math.floor(b.halfH ?? 15);
    const SIDE = { south: 0, north: 1, west: 2, east: 3 };
    for (let i = 0; i < 80; i++) {
      const side = only in SIDE ? SIDE[only] : Math.floor(Math.random() * 4), t = Math.random() * 2 - 1;
      const x = side < 2 ? Math.round(t * (halfW - 1)) : (side === 2 ? halfW - 1 : -halfW + 1);
      const z = side >= 2 ? Math.round(t * (halfH - 1)) : (side === 0 ? halfH - 1 : -halfH + 1);
      if (cellPassable(x, z) && !occupantAt(x, z, null)) xs.push({ x, z });
      if (xs.length >= 6) break;
    }
    void hw;
    const pl = state.playerAvatar && posOf(state.playerAvatar);
    return xs.sort((a, b) => (pl ? dist(b, pl) - dist(a, pl) : 0))[0] || { x: 0, z: 0 };
  }
  const plural = n => /f$/.test(n) ? n.slice(0, -1) + 'ves' : /(s|x|ch|sh)$/.test(n) ? n + 'es' : n + 's';
  const HP = { wolf: 6, rat: 3, bat: 3, rogue: 8, spider: 4, goblin: 6, skeleton: 6, bear: 12 };
  async function spawn(entry) {
    const spec = { ...(KINDS[entry.kind] || KINDS.raid), ...entry };
    const who = [].concat(spec.who || 'wolf'), name = spec.name || String(who[0]).replace(/_.*/, '');
    const day = K()?.now()?.day || 1;
    const gr = { spec: { ...spec, name }, ids: [], day, retreating: false, fought: new Set(), hurt: new Set(), ate: 0, stole: 0, kind: entry.kind };
    const lair = spec.from && spec.from !== 'edge' ? J()?.places?.placeNamed?.(spec.from) : null;
    const at = lair ? (J().places.spotIn(lair) || edgeCell(spec.side)) : edgeCell(spec.side);
    for (let i = 0; i < Math.max(1, Math.min(8, +spec.count || 1)); i++) {
      let n = 1, id; do id = `${name}${n++}`; while (state.characters.some(c => c.id === id));
      const x = at.x + (i % 2), z = at.z + Math.floor(i / 2);
      const cx = cellPassable(x, z) ? x : at.x, cz = cellPassable(x, z) ? z : at.z;
      const g = await W().spawnAgent(id, cx, cz, 's', who[i % who.length]);
      if (!g) continue;
      const hp = +spec.hp || HP[who[i % who.length]] || 6;
      W().setBrainConfig(id, { enabled: true, style: name, personality: `A hostile ${name}.`, hostile: true, mind: null, messages: [], pendingChat: [], maxHp: hp, hp, defeated: false, inventory: { gold: 0, items: [] }, ttsEnabled: false, allowed: [] });
      g._threat = { spec: gr.spec, group: gr };
      gr.ids.push(id);
    }
    gr.startAlive = gr.ids.length;
    groups.push(gr);
    const text = String(spec.announce || `{name}s are coming!`).replace(/\{name\}s\b/g, plural(name)).replace(/\{name\}/g, name).replace(/^\w/, c => c.toUpperCase());
    try { window.tablefolkDirector?.narrate?.(text); } catch {}
    // "sound": played as they come (sfx.js: a built-in name or a package's "sounds")
    if (spec.sound) try { window.tablefolkSfx?.play(spec.sound); } catch {}
    try { log('[threat] ' + text); } catch {}
    J()?.addNews?.('', text, 'raid');
    for (const c of state.characters) if (!c._threat && !c.defeated && !P()?.isAnimal?.(c) && !(P()?.isHostile?.(c) && !P()?.talksToo?.(c))) try { window.tablefolkMind?.addMemory?.(c, text, 1.5, 'event'); } catch {}
    console.info('[threats] spawned', gr.ids.join(', '), 'at', at);
    return gr;
  }

  // ---- on the clock ----
  const lastSpawn = new Map();   // entry index -> day
  const inWindow = (h, when) => Array.isArray(when) ? (when[0] <= when[1] ? h >= when[0] && h < when[1] : h >= when[0] || h < when[1]) : when === 'night' ? h >= 22 || h < 3 : when === 'day' ? h >= 10 && h < 15 : true;
  addEventListener('tablefolk-clock', e => {
    const list = scn().threats || []; if (!list.length || !window.tablefolkLive?.on) return;
    const { hour: h, day } = e.detail || {};
    list.forEach((entry, i) => {
      const spec = { ...(KINDS[entry.kind] || {}), ...entry }; if (!KINDS[entry.kind]) return;
      // a night's raid belongs to the evening it started
      const nightDay = spec.when === 'night' && h < 12 ? day - 1 : day;
      const every = Math.max(1, +spec.every || 1);
      if (!inWindow(h, spec.when)) return;
      // per section: each section's list is its own (scenario.js here())
      const key = (window.tablefolkScenario?.section || '') + '#' + i;
      const last = lastSpawn.get(key);
      if (last != null && nightDay - last < every) return;
      if (groups.some(gr => gr.entry === key && gr.ids.some(id => state.characters.some(c => c.id === id)))) return;
      lastSpawn.set(key, nightDay);
      spawn(entry).then(gr => { gr.entry = key; }).catch(err => console.warn('[threats] spawn', err));
    });
    // retreat at daybreak (night kinds) or 17:00 (day kinds)
    for (const gr of groups) if (!gr.retreating && /dawn/.test(gr.spec.retreat || 'dawn') && (gr.spec.when === 'night' ? h >= 5 && h < 12 : h >= 17)) retreat(gr, 'the day has come');
  });
  function retreat(gr, why) {
    if (gr.retreating) return; gr.retreating = true;
    console.info('[threats] retreat:', gr.spec.name, why);
    gr.exit = edgeCell(gr.spec.side);
    // they are gone in half a minute, wherever they got to
    setTimeout(() => { for (const id of gr.ids) { const c = state.characters.find(x => x.id === id); if (c && !c.defeated) despawn(c); } }, 30000);
    for (const c of state.characters) { const h = W().getBrainConfig(c.id).hostileTo; if (h && gr.ids.some(id => h[id])) { const n = { ...h }; for (const id of gr.ids) delete n[id]; W().setBrainConfig(c.id, { hostileTo: Object.keys(n).length ? n : null }); } }
  }
  // half of them down: the rest run
  setInterval(() => {
    for (const gr of groups) {
      const alive = gr.ids.filter(id => { const c = state.characters.find(x => x.id === id); return c && !c.defeated && !W().getBrainConfig(id).defeated; });
      if (!gr.retreating && /half/.test(gr.spec.retreat || 'half') && alive.length <= gr.startAlive / 2) retreat(gr, 'half are down');
      if (!gr.done && (!alive.length || gr.retreating && alive.every(id => !state.characters.some(c => c.id === id && !c.defeated)))) allClear(gr);
    }
  }, 1500);
  // who fought them: whoever hit one (combat.js 'tablefolk-attacked' on a raider)
  addEventListener('tablefolk-attacked', e => {
    const v = state.characters.find(c => c.id === e.detail?.agentId); if (!v?._threat) return;
    const gr = v._threat.group, p = posOf(v);
    for (const c of [...state.characters, state.playerAvatar].filter(Boolean)) if (c !== v && !c._threat && dist(posOf(c), p) <= 2.2 && (c === state.playerAvatar || W().getBrainConfig(c.id).hostileTo?.[v.id])) gr.fought.add(c === state.playerAvatar ? 'player' : c.id);
  });
  addEventListener('tablefolk-attacked', e => { const v = state.characters.find(c => c.id === e.detail?.agentId); if (v && !v._threat) for (const gr of groups) if (!gr.done) gr.hurt.add(v.id); });
  function allClear(gr) {
    gr.done = true;
    const pn = document.getElementById('chatName')?.value.trim() || 'the traveller';
    const names = [...gr.fought].map(k => k === 'player' ? pn : k);
    const down = gr.ids.filter(id => state.characters.find(c => c.id === id)?.defeated).length;
    const what = gr.spec.behaviour === 'pilfer' ? ` (they ate ${gr.ate} from the stores)` : gr.spec.behaviour === 'rob' ? ` (they stole ${gr.stole} gold)` : '';
    const text = `${gr.startAlive} ${gr.startAlive > 1 ? plural(gr.spec.name) : gr.spec.name} came${gr.spec.when === 'night' ? ' in the night' : ''}${what}; ${names.length ? names.join(' and ') + ' drove them off' : 'they left on their own'}${down ? ` (${down} struck down)` : ''}.`;
    J()?.addNews?.('', text, 'raid');
    if (gr.fought.has('player')) J()?.addNews?.('', `${pn} helped drive off the ${plural(gr.spec.name)}`, 'player');
    // the all-clear, out loud: one who fought, else anyone awake and outdoors near where they were
    try {
      const C = window.tablefolkChatter, awake = c => c && !c.defeated && !c._threat && !P()?.isAnimal?.(c) && c.pose?.mode !== 'lie';
      const by = [...gr.fought].filter(k => k !== 'player').map(k => state.characters.find(c => c.id === k)).filter(awake);
      for (const c of [...by, ...state.characters.filter(awake)]) if (C?.say(c, 'allclear', {})) break;
    } catch {}
    for (const c of state.characters) {
      if (c._threat || c.defeated || P()?.isAnimal?.(c) || (P()?.isHostile?.(c) && !P()?.talksToo?.(c))) continue;
      try { window.tablefolkMind?.addMemory?.(c, text, 2, 'event'); } catch {}
      for (const k of gr.fought) { if (k === c.id) continue; if (k === 'player') { const m = window.tablefolkMind?.mindOf?.(c); if (m) m.mood.trust = Math.min(1, m.mood.trust + .12); } else window.tablefolkMind?.opinion?.(c, k, .25, `fought off the ${plural(gr.spec.name)}`); }
    }
    try { log('[threat] all clear: ' + text); } catch {}
    console.info('[threats] all clear:', text);
    // the ones that fled are gone; the fallen stay where they fell
    setTimeout(() => { for (const id of gr.ids) { const c = state.characters.find(x => x.id === id); if (c && !c.defeated) despawn(c); } }, 500);
  }
  function despawn(c) {
    try { disposeCharacter(c); } catch (e) { console.warn('[threats] dispose', e); }
    state.characters = state.characters.filter(x => x !== c);
    try { state.brainConfigs.delete(c.id); refreshAgentSelect(); } catch {}
  }

  // ---- a raider's turn (live.js monsterTurn) ----
  async function walkTo(c, x, z) { return J()?.walkTo?.(c, x, z); }
  const foodStores = (targets) => getObjects().filter(o => ['chest', 'store'].includes(window.tablefolkUses?.kindOf(o.type))).map(o => ({ o, it: (window.tablefolkUses.contents(o.mesh).items || []).find(i => (i.qty ?? 1) > 0 && (targets?.length ? targets.includes(i.name) : window.tablefolkMind?.isFood?.(i.name))) })).filter(x => x.it);
  async function turn(c) {
    const t = c._threat; if (!t) return false;
    const gr = t.group, spec = t.spec;
    if (gr.retreating) {
      if (c.turnMove) return true;
      if (dist(posOf(c), gr.exit) <= 1.5 || (c._exitTries = (c._exitTries || 0) + 1) > 12) { despawn(c); return true; }
      walkTo(c, gr.exit.x, gr.exit.z); await sleep(400); return true;
    }
    const custom = BEHAVIOURS[gr.kind] || BEHAVIOURS[spec.behaviour];
    if (custom) {
      gr.customRuns = (gr.customRuns || 0) + 1;
      try { return !!(await custom(c, { spec, group: gr, retreat: why => retreat(gr, why), despawn: () => despawn(c), walkTo: (x, z) => walkTo(c, x, z),
        attack: target => window.tablefolkCombat?.attack(c, typeof target === 'string' ? target : target?.id === 'player' || target === state.playerAvatar ? 'player' : target?.id || ''),
        api: window.tablefolkPackages?.api?.() })); } catch (e) { console.warn('[threats] behaviour', e); return false; }
    }
    const cfg = W().getBrainConfig(c.id), hurt = (cfg.hp ?? 1) < (cfg.maxHp ?? 1);
    if (spec.behaviour === 'pilfer') {
      if (hurt) { retreatOne(c, gr); return true; }
      const list = foodStores(spec.targets); if (!list.length) { retreatOne(c, gr); return true; }
      const near = list.sort((a, b) => dist(posOf(c), a.o) - dist(posOf(c), b.o))[0];
      if (dist(posOf(c), near.o) > 1.9) { if (!c.turnMove) { const cell = window.tablefolkUses.besideCell(c, near.o); walkTo(c, cell.x, cell.z); } return true; }
      near.it.qty = (near.it.qty ?? 1) - 1; const box = window.tablefolkUses.contents(near.o.mesh); if (near.it.qty <= 0) box.items.splice(box.items.indexOf(near.it), 1);
      gr.ate++;
      try { emitBadge(c, 'eats ' + near.it.name); playRig(c, 'pickup', false); } catch {}
      try { say(c, `${c.id} gnaws at the ${near.it.name} in the ${String(near.o.type).replace(/_/g, ' ')}`, false); } catch {}
      if ((c._ate = (c._ate || 0) + 1) >= 3) retreatOne(c, gr);
      await sleep(900); return true;
    }
    if (spec.behaviour === 'rob') {
      if (c._loot || hurt) { retreatOne(c, gr); return true; }
      // a person with gold who is not a fighter, else a chest with gold
      const marks = state.characters.filter(o => o !== c && !o._threat && !o.defeated && !P()?.isAnimal?.(o) && (charInventory(o).gold || 0) > 0 && !/guard|hunter/.test(J()?.jobOf?.(o)?.id || '')).sort((a, b) => dist(posOf(a), posOf(c)) - dist(posOf(b), posOf(c)));
      const m = marks[0]; if (!m) { retreatOne(c, gr); return true; }
      if (dist(posOf(c), posOf(m)) > 1.6) { if (!c.turnMove) walkTo(c, posOf(m).x, posOf(m).z); return true; }
      const inv = charInventory(m), n = Math.min(inv.gold || 0, 5 + Math.floor(Math.random() * 6));
      inv.gold -= n; W().setBrainConfig(m.id, { inventory: inv }); c._loot = n; gr.stole += n;
      try { emitBadge(c, `steals ${n} gold`); say(c, `${c.id} snatches ${n} gold from ${m.id} and runs`, false, { kind: 'event' }); window.tablefolkMind?.addMemory?.(m, `${c.id} robbed you of ${n} gold.`, 3); window.tablefolkMind?.event?.(m, 'attacked', { by: c.id, hit: false }); } catch {}
      retreatOne(c, gr); return true;
    }
    return false;   // raid: the usual monster (play.js fighterTurn: everyone is prey in a living world)
  }
  function retreatOne(c, gr) {
    if (c._leaving) return; c._leaving = true;
    const exit = edgeCell(gr?.spec?.side); walkTo(c, exit.x, exit.z);
    setTimeout(() => { if (!c.defeated && state.characters.includes(c)) despawn(c); }, 9000);
    void gr;
  }
  addEventListener('tablefolk-scenario-started', e => { if (e.detail?.sub) return; groups = []; lastSpawn.clear(); });
  // now(kind): a threat at once (tests, dev)
  const now = (kind = 'raid', over = {}) => spawn({ kind, ...over });
  // retreat(why): every group about now turns for the edge (a god's fog, a package's power)
  const retreatAll = (why = 'driven off') => { let n = 0; for (const gr of groups) if (!gr.retreating && gr.ids.some(id => state.characters.some(c => c.id === id && !c.defeated))) { retreat(gr, why); n++; } return n; };
  window.tablefolkThreats = { active, label, scares, turn, registerKind, registerBehaviour, resetPackaged, now, retreat: retreatAll, KINDS, get groups() { return groups; } };
})();
