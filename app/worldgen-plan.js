/* worldgen-plan.js -- the world builder's worlds in sections: the plan, one
 * scenario per section, put together and checked. Shared by the server
 * (server/generate.js: a model call per section) and the browser's step by
 * step run (app/worldgen-browser.js: one plan, then per section only the
 * characters; layout and furnishing by procgen). Plain script, no
 * dependencies but procgen.js (globalThis.TablefolkProcgen), like procgen.js.
 *
 *   planPrompt(prompt, n, shape)        the model's request for the world plan (JSON)
 *   readPlan(obj, n, shape, prompt)     a plan made usable: keys, kinds, who, links, goal
 *   sectionPrompt(plan, i, prompt)      the model's request for section i (one scenario)
 *   shapeSection(plan, i, s)            the model's section made to fit the plan (kind, ids, no world fields)
 *   fallbackSection(plan, i)            a section with no model: procgen and the plan's people
 *   assemble(plan, sections)            the world: the first section on top, the rest as subworlds, links
 *   checkWorld(world)                   { problems, repairs, report }: links' ends, squares, edges,
 *                                       keys, every section reachable, what the goal needs reachable
 * Shapes: "levels" (a surface, then levels down joined by stairs), "region"
 * (a hub and the places around it, joined by roads off its edges, or a cave
 * mouth for what lies underground), "auto" (the model decides).
 */
(function () {
  const P = () => globalThis.TablefolkProcgen;
  // a section's kind -> its generate spec
  const GEN = { village: { kind: 'village' }, town: { kind: 'village' }, hamlet: { kind: 'village' }, forest: { kind: 'forest' }, woods: { kind: 'forest' }, farm: { kind: 'farm' },
    cave: { kind: 'cave' }, mine: { kind: 'cave', style: 'mine' }, dungeon: { kind: 'dungeon' }, castle: { kind: 'dungeon', style: 'castle' }, keep: { kind: 'dungeon', style: 'castle' },
    crypt: { kind: 'dungeon', style: 'crypt' }, tomb: { kind: 'dungeon', style: 'crypt' }, ruins: { kind: 'forest', places: ['ruins'] }, camp: { kind: 'forest', places: ['camp', 'clearing'] } };
  const KINDS = Object.keys(GEN);
  const UNDER = new Set(['cave', 'mine', 'dungeon', 'crypt', 'tomb']);
  const OPEN_RIM = new Set(['village', 'forest', 'farm']);   // generated kinds whose rim can be walked
  const EDGES = ['east', 'west', 'north', 'south'], OPP = { north: 'south', south: 'north', east: 'west', west: 'east' };
  const PEOPLE = 'woodsman huntress peasant peasant_woman adventurer adventurer_woman hooded king farmer villager witch wizard swordswoman sorceress swordsman wanderer villager_woman dwarf elf priest guard merchant'.split(' ');
  const MONSTERS = 'skeleton skeleton_warrior zombie goblin kobold orc troll rat spider wolf bat ghost slime demon giant dragon wyrmling imp mushroom_warrior snake wasp minotaur lizardman werewolf mummy ogre gnoll lich vampire bear bandit cultist gargoyle dark_knight'.split(' ');
  const ANIMALS = 'cow bull horse donkey deer stag fox dog husky alpaca pig sheep'.split(' ');
  const MINDLESS = new Set('skeleton skeleton_warrior zombie rat spider wolf bat ghost slime demon giant dragon wyrmling imp mushroom_warrior snake wasp minotaur lizardman werewolf mummy bear gnoll gargoyle dark_knight'.split(' '));
  const JOBS = 'farmer baker innkeeper cook smith woodcutter miner hunter fisher herder merchant guard healer ratcatcher scholar child labourer idler'.split(' ');
  const WORLD_FIELDS = ['goal', 'live', 'time', 'dayMinutes', 'pace', 'player', 'intro', 'clock', 'temper', 'monsters', 'harsh', 'prices', 'food', 'lore', 'packages', 'packs', 'voices', 'books', 'director', 'events', 'flags', 'facts', 'triggers', 'workflows', 'menus', 'defaultModel', 'brain'];
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'section';
  const idOf = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'someone';
  const clone = o => JSON.parse(JSON.stringify(o));
  const kindOf = k => { const t = String(k || '').toLowerCase(); return KINDS.find(x => t === x) || KINDS.find(x => new RegExp('\\b' + x).test(t)) || 'dungeon'; };

  // ---- the plan ----
  function shapeText(shape, n) {
    if (shape === 'levels') return `LEVELS: section 1 is the surface where the player starts (a camp, a village, a keep's courtyard), each next section is one level further down (dungeon, cave, crypt or mine), joined by stairs: section k links to section k+1.`;
    if (shape === 'region') return `A REGION: section 1 is the hub where the player starts (a village, a camp, a farmstead), the other ${n - 1} lie around it (a forest, farmland, a cave, ruins), each joined to the hub by a road off one of its edges (way "edge"), or by a cave mouth for what lies underground (way "cave").`;
    return `Choose the shape that fits the request: levels (a surface and levels down, joined by stairs) or a region (a hub and the places around it, joined by roads off its edges).`;
  }
  function planPrompt(prompt, n, shape) {
    return `World request: ${prompt}

This world is bigger than one map: plan it as ${n} SECTIONS (separate maps the player walks between). ${shapeText(shape, n)}
The pressure and the goal span sections: the danger lives in one section and threatens another; what the goal needs (a person, a thing, a monster) is in a section beyond the first.
Reply with ONE JSON object only (no prose), the plan, not the maps:
{"title": "...", "subtitle": "one line hook", "intro": "2-3 sentences for the player", "pressure": "one line: what threatens this world and where it lives",
 "goal": {"text": "what the player tries to do", "win": {"agent_near": ["tobin", "campfire", 6]}, "lose": {"player_defeated": true}, "winText": "..."},
 "sections": [{"key": "camp", "title": "Deepdelve Camp", "kind": "village | forest | farm | cave | mine | dungeon | castle | crypt", "about": "one line: what is there", "light": "bright | night",
   "who": [{"id": "tobin", "model": "peasant", "job": "miner", "role": "the lost miner"}, {"id": "bat1", "model": "bat", "hostile": true}],
   "links": [{"to": "level1", "way": "stairs | edge | cave | gate | door", "name": "the stairs down"}]}]}
Rules: exactly ${n} sections, the first is where the player starts; keys short (a-z, 0-9, _), unique; every section reachable through links from the first; character ids unique in the whole world (1-24 of a-z 0-9 _ -); 2-5 people in a lived-in section, monsters in dangerous ones; "goal.win" uses the game's predicates (player_has, agent_near, agent_defeated, threat_defeated, survived_days, stock_at_least, chest_has; ids from "who"). Bodies: people ${PEOPLE.join(' ')}; monsters ${MONSTERS.join(' ')}; animals ${ANIMALS.join(' ')}. Jobs: ${JOBS.join(' ')}.`;
  }
  function readPlan(obj, n, shape, prompt = '') {
    const o = obj && typeof obj === 'object' ? obj : {};
    let secs = (Array.isArray(o.sections) ? o.sections : []).filter(s => s && typeof s === 'object').slice(0, 5);
    while (secs.length < n) secs.push({ title: secs.length ? (shape === 'levels' ? `Level ${secs.length}` : 'The wilds') : (o.title || 'The start'), kind: secs.length ? (shape === 'levels' ? 'dungeon' : 'forest') : 'village' });
    secs = secs.slice(0, n);
    const keys = new Set(), ids = new Set();
    const sections = secs.map((s, i) => {
      let key = slug(s.key || s.title || 'section' + i); while (keys.has(key)) key += '_' + (i + 1); keys.add(key);
      const kind = kindOf(s.kind || s.title);
      const who = (Array.isArray(s.who) ? s.who : []).filter(a => a && (a.id || a.name)).slice(0, 7).map(a => {
        let id = idOf(a.id || a.name); while (ids.has(id)) id += '2'; ids.add(id);
        const model = [...PEOPLE, ...MONSTERS, ...ANIMALS].includes(a.model) ? a.model : (MONSTERS.find(m => new RegExp('\\b' + m).test(String(a.model || a.role || ''))) || 'villager');
        return { id, model, ...(JOBS.includes(a.job) ? { job: a.job } : {}), role: String(a.role || a.style || '').slice(0, 80), ...(a.hostile === true || (a.hostile == null && MINDLESS.has(model)) ? { hostile: true } : {}) };
      });
      return { key, title: String(s.title || s.key || 'Section ' + (i + 1)).slice(0, 60), kind, about: String(s.about || '').slice(0, 200), light: s.light === 'night' ? 'night' : 'bright', who, links: (Array.isArray(s.links) ? s.links : []).filter(l => l && l.to) };
    });
    // links by key or title, forward only (the way back is made by the game)
    const find = t => { const k = slug(t); return sections.findIndex(s => s.key === k || slug(s.title) === k); };
    const links = [];
    sections.forEach((s, i) => { for (const l of s.links) { const j = find(l.to); if (j > 0 && j !== i && !links.some(x => x.to === j)) links.push({ from: i, to: j, way: String(l.way || '').toLowerCase(), name: l.name ? String(l.name).slice(0, 60) : '' }); } });
    // every section reached: from the one before it (levels), from the hub (region), else from the first
    for (let j = 1; j < sections.length; j++) if (!links.some(l => l.to === j)) links.push({ from: shape === 'levels' || (shape !== 'region' && UNDER.has(sections[j].kind) && UNDER.has(sections[j - 1].kind)) ? j - 1 : 0, to: j, way: '', name: '' });
    links.sort((a, b) => a.to - b.to);
    const goal = o.goal && typeof o.goal === 'object' && o.goal.win && typeof o.goal.win === 'object' ? { text: String(o.goal.text || '').slice(0, 200), win: o.goal.win, ...(o.goal.lose ? { lose: o.goal.lose } : {}), ...(o.goal.winText ? { winText: String(o.goal.winText).slice(0, 200) } : {}) } : null;
    return { title: String(o.title || prompt || 'A world').slice(0, 60), subtitle: String(o.subtitle || '').slice(0, 120), intro: String(o.intro || '').slice(0, 500), pressure: String(o.pressure || '').slice(0, 200), goal, shape: shape || 'auto', sections, links };
  }
  const planBrief = plan => ({ title: plan.title, pressure: plan.pressure, goal: plan.goal?.text || '', sections: plan.sections.map((s, i) => ({ n: i + 1, key: s.key, title: s.title, kind: s.kind, about: s.about, who: s.who.map(a => a.id + ' (' + a.model + (a.job ? ', ' + a.job : '') + (a.role ? ', ' + a.role : '') + (a.hostile ? ', hostile' : '') + ')') })),
    links: plan.links.map(l => `${plan.sections[l.from].title} -> ${plan.sections[l.to].title}`) });
  function sectionPrompt(plan, i, prompt) {
    const s = plan.sections[i], g = GEN[s.kind] || GEN.dungeon, places = { village: 'square tavern smithy shop temple alchemist guardhouse library stable house pond garden', forest: 'clearing camp ruins grove shrine pond hut cave meadow', farm: 'yard farmhouse barn pasture field orchard coop', cave: 'entrance lair crystals grotto pool treasure bones camp mine chamber', dungeon: 'entrance throne lair treasure library shrine barracks storage kitchen prison crypt alchemy' }[g.kind];
    return `World request: ${prompt}
The world is planned in ${plan.sections.length} sections (separate maps): ${JSON.stringify(planBrief(plan))}

Write section ${i + 1} of ${plan.sections.length} ONLY: "${s.title}" (${s.kind}): ${s.about}
It is one map of this world; the other sections are written separately and the links between them are added afterwards (do not write "links" or "subworlds").
Map: map method A, "generate": ${JSON.stringify({ ...g, places: g.places || '[...]' })} with places from: ${places}.
Characters: exactly these ids: ${s.who.map(a => a.id).join(', ') || '(none planned: add 0-3 that fit)'} (bodies and jobs as planned; you may add 1-2 more that fit this place).
${i === 0 ? `This is where the player starts: "title": "${plan.title}", the world's "intro", "live": true, "time", "dayMinutes", "player". Do NOT write "goal" (the world's goal is added afterwards).` : `Do NOT write "goal", "player", "intro", "live" or "time" (they are the world's). Give it its own "title" ("${s.title}") and "subtitle".`}
"threats": only a danger that lives HERE (the world's pressure: ${plan.pressure || 'none given'}); none when nobody here could be threatened.
Reply with the JSON object only.`;
  }

  // ---- one section ----
  function shapeSection(plan, i, s0) {
    const sec = plan.sections[i], s = s0 && typeof s0 === 'object' ? clone(s0) : {};
    const g = GEN[sec.kind] || GEN.dungeon;
    // the kind the plan asked for; a drawn grid or layout lines stay as written
    if (!s.grid?.length && !s.map?.length) s.generate = { ...g, ...(s.generate && typeof s.generate === 'object' ? s.generate : {}), kind: (s.generate?.kind && GEN[kindOf(s.generate.kind)]?.kind) || g.kind };
    s.title = String(s.title || sec.title).slice(0, 60);
    if (i > 0) { for (const k of WORLD_FIELDS) delete s[k]; s.title = sec.title; }
    delete s.links; delete s.subworlds;
    if (sec.light === 'night' && !s.lighting) s.lighting = 'night';
    s.agents = Array.isArray(s.agents) ? s.agents.filter(a => a && a.id) : [];
    // the planned people are here (added when the model left one out)
    for (const a of sec.who) if (!s.agents.some(x => idOf(x.id) === a.id)) s.agents.push(planAgent(a, sec));
    for (const a of s.agents) a.id = idOf(a.id);
    return s;
  }
  function planAgent(a, sec) {
    const out = { id: a.id, model: a.model };
    if (a.hostile) { out.hostile = true; out.personality = `A hostile ${a.model.replace(/_/g, ' ')}.`; return out; }
    if (ANIMALS.includes(a.model)) return out;
    const name = a.id.replace(/[_-]?\d+$/, '').replace(/^\w/, c => c.toUpperCase());
    out.personality = `${name}, ${a.role || a.job || 'who lives here'} in ${sec.title}. You want what keeps ${sec.title} safe. Say it plain.`;
    if (a.job) out.job = a.job;
    out.style = a.role || a.job || '';
    return out;
  }
  function fallbackSection(plan, i) {
    const sec = plan.sections[i], g = GEN[sec.kind] || GEN.dungeon;
    const s = { title: sec.title, subtitle: sec.about.slice(0, 120), generate: { ...g }, agents: sec.who.map(a => planAgent(a, sec)), objects: [] };
    if (i === 0) Object.assign(s, { title: plan.title, intro: plan.intro, live: true, time: '07:00', dayMinutes: 12 });
    if (sec.light === 'night') s.lighting = 'night';
    if (!s.agents.length) s.agents = UNDER.has(sec.kind) ? [{ id: idOf(sec.key + '_bat'), model: 'bat', hostile: true }] : [{ id: idOf(sec.key + '_keeper'), model: 'villager', personality: `The keeper of ${sec.title}. You want strangers to mind their step. Say it plain.` }];
    return s;
  }

  // ---- the world ----
  // a generated section's places and start (procgen, as the game builds it)
  function built(s) {
    if (!s?.generate || !P()) return null;
    try { const r = P().applyToScenario(clone(s)); return { places: r.places, grid: r.scenario.grid, player: r.scenario.player?.at || null, size: r.scenario.size }; } catch { return null; }
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // the place for a way out: far from where the player comes in, not the entrance
  function farPlace(b, avoid = []) {
    if (!b?.places?.length) return null;
    const start = b.player || b.places[0].center || [0, 0];
    const ok = b.places.filter(p => !['entrance', 'square', 'pond', 'pool'].includes(p.kind) && !avoid.includes(p.id));
    return (ok.length ? ok : b.places).slice().sort((p, q) => dist(q.center || [0, 0], start) - dist(p.center || [0, 0], start))[0].id;
  }
  const WAY_KIND = { stairs: 'stairs_down', stair: 'stairs_down', down: 'stairs_down', ladder: 'stairs_down', cave: 'cave', gate: 'gate', door: 'door', trapdoor: 'trapdoor', edge: 'edge', road: 'edge', path: 'edge' };
  function assemble(plan, list) {
    const top = clone(list[0]);
    top.title = plan.title || top.title; if (plan.subtitle) top.subtitle = plan.subtitle; if (plan.intro) top.intro = plan.intro;
    if (plan.goal) top.goal = clone(plan.goal);
    top.subworlds = {}; top.links = [];
    plan.sections.forEach((sec, i) => { if (i) { top.subworlds[sec.key] = clone(list[i]); top.subworlds[sec.key].links = []; } });
    const secAt = i => i === 0 ? top : top.subworlds[plan.sections[i].key];
    // ids unique across the world (the first keeps its own)
    const seen = new Set();
    plan.sections.forEach((sec, i) => { for (const a of secAt(i).agents || []) { let id = a.id; while (seen.has(id)) id = (id + '2').slice(-24); a.id = id; seen.add(id); } });
    const usedEdges = new Map(), built0 = new Map(), usedPlaces = new Map();
    const b = i => { if (!built0.has(i)) built0.set(i, built(secAt(i))); return built0.get(i); };
    for (const l of plan.links) {
      const from = secAt(l.from), A = plan.sections[l.from], B = plan.sections[l.to];
      let kind = WAY_KIND[(l.way || '').split(/\W/)[0]] || '';
      if (!kind) kind = UNDER.has(B.kind) ? (UNDER.has(A.kind) || plan.shape === 'levels' ? 'stairs_down' : 'cave') : OPEN_RIM.has(GEN[A.kind]?.kind) && OPEN_RIM.has(GEN[B.kind]?.kind) ? 'edge' : 'door';
      // an edge needs a walkable rim on both maps: else a cave mouth or a door
      if (kind === 'edge' && !(OPEN_RIM.has(GEN[A.kind]?.kind) && OPEN_RIM.has(GEN[B.kind]?.kind))) kind = UNDER.has(B.kind) ? 'cave' : 'door';
      const name = l.name || B.title;
      if (kind === 'edge') {
        const taken = usedEdges.get(l.from) || [], edge = EDGES.find(e => !taken.includes(e));
        if (edge) { usedEdges.set(l.from, [...taken, edge]); from.links.push({ edge, to: B.key, name }); continue; }
        kind = 'door';
      }
      const avoid = usedPlaces.get(l.from) || [], place = farPlace(b(l.from), avoid);
      if (place) { usedPlaces.set(l.from, [...avoid, place]); from.links.push({ in: place, to: B.key, kind, name }); }
      else from.links.push({ at: [0, 0], to: B.key, kind, name });
    }
    for (const k of Object.keys(top.subworlds)) if (!top.subworlds[k].links.length) delete top.subworlds[k].links;
    return top;
  }

  // ---- the checks ----
  const FLOOR = new Set([',', ':', '^', '=', '_', 'R', 'E', 'Q', 'U', '+', '.', ';', '*', '/', 'p', 'u', 'b', 'P', 'S', '$', 'N', 'M']);
  function walkable(bt) {
    if (!bt?.grid?.length) return null;
    const H = bt.grid.length, Wd = bt.grid[0].length, x0 = Math.floor((Wd - 1) / 2), z0 = Math.floor((H - 1) / 2);
    const at = (x, z) => bt.grid[z + z0]?.[x0 - x];
    const ok = (x, z) => FLOOR.has(at(x, z));
    // what the player's start reaches
    const seen = new Set(), st = bt.player || [0, 0], q = [[Math.round(st[0]), Math.round(st[1])]];
    while (q.length) { const [x, z] = q.pop(), k = x + ',' + z; if (seen.has(k) || !ok(x, z)) continue; seen.add(k); q.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]); }
    const rim = e => { const out = []; const bx = x0, bz = z0; if (e === 'east' || e === 'west') { const x = e === 'east' ? -(Wd - 1 - x0) : x0; for (let z = -bz; z <= H - 1 - z0; z++) out.push([x, z]); } else { const z = e === 'north' ? -bz : H - 1 - z0; for (let x = -(Wd - 1 - x0); x <= bx; x++) out.push([x, z]); } return out; };
    return { reached: k => seen.has(k), ok, rim: e => rim(e).filter(([x, z]) => ok(x, z) && seen.has(x + ',' + z)) };
  }
  function allSections(world) {
    const out = [{ key: '', s: world, title: world.title }];
    const walk = (s, path, depth) => { if (depth > 6) return; for (const [k, sub] of Object.entries(s.subworlds || {})) if (sub && typeof sub === 'object') { out.push({ key: path ? path + '/' + k : k, s: sub, title: sub.title || k, parent: path }); walk(sub, path ? path + '/' + k : k, depth + 1); } };
    walk(world, '', 0);
    return out;
  }
  const things = s => [...(s.objects || []).flatMap(o => [...(Array.isArray(o?.items) ? o.items.map(i => i?.name || i) : []), o?.type]), ...(s.agents || []).flatMap(a => (a?.inventory?.items || []).map(i => i?.name || i))].filter(Boolean).map(x => String(x).toLowerCase());
  function checkWorld(world) {
    const problems = [], repairs = [], report = [];
    const secs = allSections(world), byKey = new Map(secs.map(x => [x.key, x]));
    // a "to" key: this section's subworlds, then its parents'
    const resolve = (fromKey, to) => { if (to === 'back' || typeof to !== 'string') return null; for (let p = fromKey; ; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const k = p ? p + '/' + to : to; if (byKey.has(k)) return k; if (!p) return /^(https?:|\/|\.\.?\/|#?s=|scenarios\/)/.test(to) || /\.json$/.test(to) ? 'ext:' + to : undefined; } };
    const edgesOut = new Map();
    let nLinks = 0;
    for (const x of secs) {
      const bt = built(x.s), wk = walkable(bt);
      x.bt = bt; x.wk = wk;
      for (const l of x.s.links || []) {
        nLinks++;
        if (l.to && typeof l.to === 'object') continue;   // generated on entry
        const t = resolve(x.key, l.to);
        if (t === undefined) { problems.push(`${x.title}: a link goes to "${l.to}", which is not a section`); continue; }
        if (t) (edgesOut.get(x.key) || edgesOut.set(x.key, []).get(x.key)).push({ to: t, l });
        if (l.in && bt && !bt.places.some(p => p.id === l.in || p.kind === l.in || p.id.startsWith(l.in + ' '))) {
          const p = farPlace(bt); if (p) { repairs.push(`${x.title}: the way to ${l.name || l.to} was in "${l.in}", which this map does not have: now in "${p}"`); l.in = p; } else problems.push(`${x.title}: no place "${l.in}" for the way to ${l.name || l.to}`);
        }
        if (l.at && wk && !(wk.ok(l.at[0], l.at[1]) && wk.reached(l.at[0] + ',' + l.at[1]))) problems.push(`${x.title}: the way to ${l.name || l.to} at [${l.at}] is not on a square the player can reach`);
        if (l.edge && wk && !wk.rim(l.edge).length) problems.push(`${x.title}: its ${l.edge} edge has no square the player can reach, so the way to ${l.name || l.to} cannot be used`);
      }
    }
    // arriving across an edge: the target's opposite rim must be walkable
    for (const [from, outs] of edgesOut) for (const { to, l } of outs) {
      if (!l.edge || !byKey.has(to)) continue;
      const wk = byKey.get(to).wk; if (wk && !wk.rim(OPP[l.edge]).length) {
        const fb = byKey.get(from).bt, p = farPlace(fb);
        if (p) { repairs.push(`${byKey.get(from).title}: ${byKey.get(to).title} has no walkable ${OPP[l.edge]} rim to arrive on, so the way there is a cave mouth in "${p}" instead of the ${l.edge} edge`); delete l.edge; l.in = p; l.kind = 'cave'; }
        else problems.push(`${byKey.get(to).title}: nowhere to arrive from the ${l.edge} edge`);
      }
    }
    // reachable from the top: every section, without passing a locked link whose key lies beyond it
    const reach = (skip = null) => { const seen = new Set(['']), q = ['']; while (q.length) { const k = q.shift(); for (const e of edgesOut.get(k) || []) if (e.l !== skip && byKey.has(e.to) && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } } return seen; };
    const all = reach();
    for (const x of secs) if (!all.has(x.key)) problems.push(`${x.title}: no way leads there from the start`);
    for (const [from, outs] of edgesOut) for (const { l } of outs) if (l.key) {
      const before = reach(l), k = String(l.key).toLowerCase();
      if (![...before].some(key => things(byKey.get(key).s).some(n => n === k || (/key/.test(n) && (n.includes(k) || k.includes(n)))))) problems.push(`${byKey.get(from).title}: the way to ${l.name || l.to} needs the "${l.key}", which is in no section reachable before it`);
    }
    // what the goal needs, and where it is
    const g = world.goal, ids = new Map();
    for (const x of secs) for (const a of x.s.agents || []) if (a?.id) ids.set(String(a.id).toLowerCase(), x.key);
    const needs = [];
    const walkGoal = n => { if (Array.isArray(n)) return n.forEach(walkGoal); if (!n || typeof n !== 'object') return; for (const [k, v] of Object.entries(n)) { if (['agent_has', 'agent_gold', 'agent_near', 'agent_defeated', 'agent_hp', 'agent_pose'].includes(k)) needs.push({ id: String(Array.isArray(v) ? v[0] : v).toLowerCase(), k }); if (k === 'player_has') needs.push({ item: String(Array.isArray(v) ? v[0] : v).toLowerCase(), k }); walkGoal(v); } };
    walkGoal(g?.win);
    for (const nd of needs) {
      if (nd.id) { const at = ids.get(nd.id); if (at == null) problems.push(`goal ${nd.k}: "${nd.id}" is in no section`); else if (!all.has(at)) problems.push(`goal ${nd.k}: "${nd.id}" is in ${byKey.get(at).title}, which no way reaches`); else report.push(`the goal needs ${nd.id}: in ${byKey.get(at).title}${at ? '' : ' (the start)'}`); }
      if (nd.item) { const at = secs.find(x => all.has(x.key) && things(x.s).some(n => n === nd.item || n.includes(nd.item) || nd.item.includes(n))); if (!at) problems.push(`goal player_has: "${nd.item}" is in no section the player can reach (put it in a chest, give it to someone)`); else report.push(`the goal needs the ${nd.item}: in ${at.title}`); }
    }
    report.unshift(`${secs.length} sections, ${nLinks} links (the ways back are made by the game), ${[...all].length} reachable from the start`);
    return { problems, repairs, report };
  }

  const api = { planPrompt, readPlan, sectionPrompt, shapeSection, fallbackSection, assemble, checkWorld, allSections, GEN, KINDS, WORLD_FIELDS };
  globalThis.TablefolkWorldPlan = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
