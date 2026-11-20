// Living worlds made true by code (server/worldgen-core.js checkScenario;
// the Bun server, the Cloudflare Worker and the browser's step-by-step path
// through POST /api/finish all come here). A generated world is a PLACE with
// PEOPLE WITH WORK under a PRESSURE, with a goal tied to it, unless the
// request was a talk-only scene ("talk": true, or the request reads like an
// interview, a trial, a conversation...). The model is asked for all that
// (server/fast-skill.md); what it left out is filled in here, and what code
// cannot fix goes back to it as a problem.
//
//   livingWorld(s, { prompt, fresh, notes })  -> problems (and repairs in place, each told in notes)
//   TALK_ONLY                                  the requests that stay talk scenes
//   reach(s)                                   what the player cannot reach in a generated map
import { JOBS } from './jobs-table.js';
import '../app/procgen.js';
const Procgen = globalThis.TablefolkProcgen;

export const TALK_ONLY = /\b(interview|job interview|trial|court ?room|hearing|conversation|dialogue|chat|talk(?:ing)?[ -]only|just talk|negotiat\w*|interrogat\w*|audition|first date|a date\b|debate|confession|tea party|dinner party|no combat|no fighting|without (?:combat|fighting)|peaceful talk|therapy|tavern (?:chat|talk|conversation))\b/i;

const MINDLESS = new Set(['skeleton', 'skeleton_warrior', 'skeleton_farmer', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon', 'wyrmling', 'imp', 'mushroom_warrior', 'bunny', 'snake', 'wasp', 'frog', 'minotaur', 'lizardman', 'werewolf', 'mummy', 'bear', 'gnoll', 'gargoyle', 'dark_knight', 'red_dragon']);
const ANIMALS = new Set(['cow', 'bull', 'horse', 'white_horse', 'donkey', 'deer', 'stag', 'fox', 'dog', 'husky', 'alpaca', 'pig', 'sheep']);
// a job's workplace kind -> the things that are it, and the one to add when there is none
const KIND_TYPES = {
  anvil: ['anvil'], cauldron: ['cauldron'], workbench: ['workbench'], train: ['target', 'dummy'], read: ['lectern', 'bookcase', 'bookshelf', 'open_book'],
  chop: ['tree', 'pine_tree', 'tall_pine', 'oak_tree', 'tall_tree', 'autumn_tree', 'dead_tree', 'logs', 'log'], mine: ['boulder', 'mossy_rock', 'crystals'],
  field: ['tall_grass', 'pumpkin'], hunt: ['bear_trap'], fish: ['lily_pad'],
};
const ADD_TYPE = { anvil: 'anvil', cauldron: 'cauldron', workbench: 'workbench', train: 'target', read: 'bookcase', chop: 'oak_tree', mine: 'mossy_rock', field: 'tall_grass', hunt: 'bear_trap', fish: 'lily_pad' };
const OUTDOOR_KIND = new Set(['chop', 'mine', 'field', 'hunt', 'fish']);
const STORES = new Set(['chest', 'iron_chest', 'barrel', 'crate', 'iron_crate']);
const BEDS = new Set(['bed', 'double_bed']);
const FOOD_THINGS = new Set(['apple_barrel', 'apple_crate', 'carrot_crate', 'tall_grass', 'pumpkin', 'bear_trap', 'lily_pad']);
const FOOD = /\b(bread|apple|turnip|cheese|meat|stew|pie|fish|carrot|potato|soup|meal|berr(y|ies)|egg|cake|ham|sausage|onion|cabbage|pear|plum|grapes?|nuts?|jerky|ration|biscuit|porridge|mushroom|roll|pastry|honey|wheat)s?\b/i;
// grid glyphs (scenario.js GRID_GLYPHS, procgen.js GEN_LEGEND) the checks care about
const GLYPH = { h: 'chest', m: 'iron_chest', B: 'barrel', C: 'crate', ']': 'iron_crate', Z: 'bed', a: 'anvil', o: 'cauldron', w: 'workbench', k: 'target', J: 'dummy', K: 'bookcase', '?': 'lectern', '%': 'tree', r: 'boulder', d: 'logs', g: 'pumpkin', '|': 'apple_barrel', y: 'lily_pad', q: 'lily_pad' };
const FLOOR = new Set([',', ':', '^', '=', '_', 'R', 'E', 'Q', 'U', '+', '.', ';', '*', '/', 'p', 'u', 'b', 'P', 'S', '$', 'N', 'M']);
// where a job works and lives, by the kinds of places a generated map has
const JOB_PLACES = { smith: ['smithy'], innkeeper: ['tavern'], cook: ['kitchen', 'tavern'], baker: ['shop', 'kitchen', 'tavern'], merchant: ['shop', 'square', 'camp'], guard: ['guardhouse', 'barracks', 'entrance', 'camp'],
  hunter: ['camp', 'clearing', 'meadow', 'yard'], miner: ['mine', 'crystals', 'camp'], woodcutter: ['camp', 'clearing', 'yard'], farmer: ['field', 'yard', 'barn', 'garden'], herder: ['pasture', 'barn', 'stable'],
  healer: ['temple', 'shrine', 'alchemist', 'alchemy'], scholar: ['library'], fisher: ['pond', 'pool'], ratcatcher: ['storage', 'shop', 'tavern'], labourer: ['storage', 'square', 'yard'], child: ['square', 'yard'], idler: [] };
const PLACE_JOB = { smithy: 'smith', tavern: 'innkeeper', kitchen: 'cook', shop: 'merchant', guardhouse: 'guard', barracks: 'guard', camp: 'hunter', mine: 'miner', field: 'farmer', yard: 'farmer', barn: 'farmer', pasture: 'herder', temple: 'healer', shrine: 'healer', alchemist: 'healer', library: 'scholar' };
const HOME_KINDS = ['house', 'farmhouse', 'hut', 'camp', 'barracks', 'entrance', 'clearing', 'yard', 'chamber', 'storage'];
const OUTDOOR_PLACES = ['square', 'garden', 'clearing', 'meadow', 'yard', 'field', 'orchard', 'pasture', 'grove', 'camp', 'entrance'];
// the default pressure by generated kind, when the model wrote none (mild)
const DEFAULT_THREAT = { village: { kind: 'raid', who: 'wolf', count: 2, when: 'night', every: 1 }, farm: { kind: 'rats', count: 3, when: 'night', every: 1 }, forest: { kind: 'raid', who: 'wolf', count: 2, when: 'night', every: 1 },
  cave: { kind: 'raid', who: 'spider', count: 2, when: 'night', every: 1 }, dungeon: { kind: 'raid', who: 'skeleton', count: 2, when: 'night', every: 1 } };
const MIN_SIZE = { village: ['buildings', 5], dungeon: ['rooms', 5], cave: ['rooms', 5] };
const KINDS = { village: 'village', town: 'village', hamlet: 'village', forest: 'forest', woods: 'forest', wilds: 'forest', wilderness: 'forest', farm: 'farm', farmstead: 'farm', cave: 'cave', caves: 'cave', cavern: 'cave', mine: 'cave' };
const genKind = s => KINDS[String(s.generate?.kind || s.generate?.type || 'dungeon').toLowerCase()] || 'dungeon';

const minded = a => a && !a.hostile && !(a.hostile == null && MINDLESS.has(a.model)) && !ANIMALS.has(a.model);
function inferJob(a) {
  for (const text of [a.role, a.style, a.personality]) {
    if (!text) continue;
    for (const [id, j] of Object.entries(JOBS)) { if (id === 'idler' || !j.match) continue; try { if (new RegExp(j.match, 'i').test(text)) return id; } catch {} }
  }
  const p = String(a.in || '').toLowerCase().replace(/\s+\d+$/, '');
  return PLACE_JOB[p] || 'idler';
}
const goalKinds = g => JSON.stringify(g || {}).match(/"(\w+)":/g)?.map(k => k.slice(1, -2)) || [];
const PRESSURE_GOALS = ['survived_days', 'stock_at_least', 'threat_defeated', 'agents_alive', 'agent_defeated', 'agent_near', 'chest_has', 'player_has'];

// build the map as the game will (procgen), and index what is where
function built(s) {
  const r = Procgen.applyToScenario(JSON.parse(JSON.stringify(s)));
  const sc = r.scenario, W = sc.size[0], H = sc.size[1], x0 = Math.floor((W - 1) / 2), z0 = Math.floor((H - 1) / 2);
  const things = [];
  sc.grid.forEach((row, rr) => [...row].forEach((ch, cc) => { const t = GLYPH[ch] || (sc.legend?.[ch] ? String(sc.legend[ch]).split(' on ')[0].trim() : null); if (t && !FLOOR.has(ch)) things.push({ type: t, x: x0 - cc, z: rr - z0, grid: true }); }));
  for (const o of sc.objects || []) if (o && Number.isFinite(+o.x)) things.push({ type: o.type, x: +o.x, z: +o.z, src: o });
  const inP = (p, t) => p && t.x >= p.x0 - .5 && t.x <= p.x1 + .5 && t.z >= p.z0 - .5 && t.z <= p.z1 + .5;
  return { r, sc, things, inP, W, H, x0, z0 };
}

// what the player cannot reach: cells walked from the player's start over floor (grid) and free squares (objects block)
export function reach(s) {
  const b = built(s), { sc, W, H, x0, z0 } = b;
  const blockedObj = new Set((sc.objects || []).filter(o => o && Number.isFinite(+o.x) && !['light', 'tile', 'note', 'picture', 'coin_pile', 'key', 'potion', 'scroll', 'flowers', 'grass_tuft', 'tall_grass', 'heather', 'flower_patch', 'fern', 'bear_trap', 'lily_pad', 'torch'].includes(o.type)).map(o => Math.round(+o.x) + ',' + Math.round(+o.z)));
  const walk = (x, z) => { const rr = z + z0, cc = x0 - x, ch = sc.grid[rr]?.[cc]; if (ch == null) return false; if (blockedObj.has(x + ',' + z)) return false; return FLOOR.has(ch) || (sc.legend?.[ch] && !/wall|water|sea|lava/.test(sc.legend[ch]) && /^(carpet|tile|concrete|flagstone|sand|grass|dirt|stone|wood)/.test(sc.legend[ch])); };
  const start = sc.player?.at || [0, 0], seen = new Set(), q = [[Math.round(start[0]), Math.round(start[1])]];
  seen.add(q[0].join(','));
  while (q.length) { const [x, z] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (z + dz); if (!seen.has(k) && walk(x + dx, z + dz)) { seen.add(k); q.push([x + dx, z + dz]); } } }
  const near = t => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]].some(([dx, dz]) => seen.has((Math.round(t.x) + dx) + ',' + (Math.round(t.z) + dz)));
  // (a place counts as reached when one of its squares is, or one right beside it: a 3x1 strip in front of a barn may be all hay and chests)
  const placeReached = p => { for (let x = Math.ceil(p.x0) - 1; x <= p.x1 + 1; x++) for (let z = Math.ceil(p.z0) - 1; z <= p.z1 + 1; z++) if (seen.has(x + ',' + z)) return true; return false; };
  return { b, near, placeReached, seen };
}

export function livingWorld(s, { prompt = '', fresh = false, notes = [] } = {}) {
  const problems = [];
  if (!s || typeof s !== 'object' || !Array.isArray(s.agents)) return problems;
  if (fresh && TALK_ONLY.test(String(prompt)) && s.talk == null) s.talk = true;
  if (s.talk === true) return problems;
  // an edit of an older world (no "generate", or not living) is left as it is
  if (!fresh && !(s.live && s.generate)) return problems;
  const note = t => { notes.push(t); };
  if (!s.live) { s.live = true; note('live: true'); }
  if (!s.time) { s.time = '07:00'; note('time 07:00'); }
  if (s.dayMinutes == null) { s.dayMinutes = 12; note('dayMinutes 12'); }
  if (!s.generate) { problems.push('a living world needs a place with several buildings, rooms or areas where people live and work: use "generate" (village, farm, forest, cave or dungeon), not one room (or, for a talk-only scene, set "talk": true)'); return problems; }
  if (s.generate && typeof s.generate !== 'object') return problems;
  const kind = genKind(s), [szKey, szMin] = MIN_SIZE[kind] || [];
  if (szKey && Math.max(+(s.generate[szKey] || 0), (s.generate.places || []).length) < szMin) { s.generate[szKey] = szMin; note(`generate.${szKey} ${szMin} (a living world needs room)`); }
  let b;
  try { b = built(s); } catch (e) { return problems; }
  // a village with nowhere to live gets houses (asked for by name: procgen builds them)
  if (kind === 'village' && !b.r.places.some(p => p.kind === 'house')) {
    s.generate.places = [...new Set([...(s.generate.places || []), 'house'])];
    s.generate.buildings = Math.max(+(s.generate.buildings || 0), (s.generate.places || []).length + 2);
    try { b = built(s); note('houses for the villagers to live in'); } catch {}
  }
  const places = b.r.places, pk = p => p.id.replace(/\s+\d+$/, '');
  const placeOf = id => places.find(p => p.id === String(id || '').toLowerCase()) || places.find(p => pk(p) === String(id || '').toLowerCase().replace(/\s+\d+$/, '')) || null;
  const has = (types, p) => b.things.some(t => types.includes(t.type) && (!p || b.inP(p, t)));
  const add = (o, why) => { (s.objects ||= []).push(o); if (why) note(why); b.things.push({ type: o.type, x: NaN, z: NaN, in: o.in }); };
  const addedIn = (types, p) => (s.objects || []).some(o => types.includes(o.type) && p && String(o.in || '').toLowerCase() === p.id);
  const folk = s.agents.filter(minded);
  // ---- people with work: a job, a workplace the map has, a home
  const houses = places.filter(p => HOME_KINDS.includes(p.kind));
  let hi = 0;
  for (const a of folk) {
    // (a package may bring the job: then it is left as written)
    if (!a.job || (typeof a.job === 'string' && !JOBS[a.job.toLowerCase()] && !/^(https?:|npm:|gh:)/.test(a.job) && !(s.packages || []).length)) { const was = a.job; a.job = inferJob(a); note(`${a.id}: job ${a.job}${was ? ` (was "${was}", not a job)` : ' (from its role)'}`); }
    const j = typeof a.job === 'string' ? JOBS[a.job.toLowerCase()] : null;
    if (!a.workplace || !placeOf(a.workplace)) {
      const own = a.in && placeOf(a.in) && !['house', 'square', 'pond'].includes(placeOf(a.in).kind) ? placeOf(a.in) : null;
      const p = own || (j && (JOB_PLACES[a.job] || []).map(k => places.find(q => q.kind === k)).find(Boolean)) || null;
      if (p) { if (a.workplace !== p.id) note(`${a.id}: workplace ${p.id}`); a.workplace = p.id; }
      else if (a.workplace) { note(`${a.id}: workplace "${a.workplace}" is not on the map (dropped)`); delete a.workplace; }
    }
    // (a place id the map has: "house 2" in a village of one house is that house)
    if (a.home && placeOf(a.home) && placeOf(a.home).id !== String(a.home).toLowerCase()) a.home = placeOf(a.home).id;
    if (a.workplace && placeOf(a.workplace) && placeOf(a.workplace).id !== String(a.workplace).toLowerCase()) a.workplace = placeOf(a.workplace).id;
    if (!a.home || !placeOf(a.home)) {
      const p = (a.in && placeOf(a.in)?.kind === 'house' ? placeOf(a.in) : null) || (houses.length ? houses[hi++ % houses.length] : null) || placeOf(a.workplace);
      if (p) { a.home = p.id; note(`${a.id}: home ${p.id}`); } else delete a.home;
    }
    if (!a.in && a.workplace) a.in = a.workplace;
    // the job's station, at its workplace (outdoor work: anywhere on the map will do)
    const wp = placeOf(a.workplace);
    for (const k of (j?.workplace || [])) {
      const types = KIND_TYPES[k]; if (!types) continue;
      const outdoor = OUTDOOR_KIND.has(k);
      // outdoor work needs a few (one snare gave a hunter a meat every four game hours)
      const many = b.things.filter(t => types.includes(t.type)).length;
      if (outdoor ? many >= 3 : (wp ? has(types, wp) || addedIn(types, wp) : has(types))) continue;
      const where = outdoor ? (places.find(p => ['field', 'meadow', 'garden', 'yard', 'clearing', 'square', 'camp', 'orchard'].includes(p.kind)) || wp) : wp || places.find(p => !OUTDOOR_PLACES.includes(p.kind));
      if (!where) continue;
      const n = outdoor ? 3 - many : 1;
      for (let i = 0; i < n; i++) add({ type: ADD_TYPE[k], in: where.id, ...(k === 'field' ? { crop: 'wheat' } : {}) }, i ? null : `${a.id}: a ${ADD_TYPE[k].replace(/_/g, ' ')} to work at (${where.id})`);
    }
    // a store beside the work for one who makes, gathers or sells
    const near6 = (p, t) => t.x >= p.x0 - 6 && t.x <= p.x1 + 6 && t.z >= p.z0 - 6 && t.z <= p.z1 + 6;
    if (j && (j.stores || j.sells) && wp && !b.things.some(t => STORES.has(t.type) && (b.inP(wp, t) || (OUTDOOR_PLACES.includes(wp.kind) && near6(wp, t)))) && !addedIn([...STORES], wp)) add({ type: 'chest', in: wp.id, items: [] }, `${a.id}: a chest to store and sell from (${wp.id})`);
  }
  // ---- a bed per resident, in its home
  const residents = {};
  for (const a of folk) if (a.home) (residents[a.home] ||= []).push(a.id);
  for (const [home, who] of Object.entries(residents)) {
    const p = placeOf(home); if (!p) continue;
    const beds = b.things.filter(t => BEDS.has(t.type) && b.inP(p, t)).length + (s.objects || []).filter(o => BEDS.has(o.type) && String(o.in || '').toLowerCase() === p.id).length;
    // the night watch sleeps by day in the same bed: guards need none of their own
    // (no more than a bed per four squares of floor: a 3x3 camp holds two; the rest sleep by the fire, jobs.js)
    const room = Math.max(1, Math.floor((p.x1 - p.x0 + 1) * (p.z1 - p.z0 + 1) / 4)) - beds;
    const need = Math.min(room, who.filter(id => (folk.find(a => a.id === id)?.job) !== 'guard').length - beds);
    for (let i = 0; i < need; i++) add({ type: 'bed', in: p.id }, i ? null : `${need} bed${need > 1 ? 's' : ''} in ${p.id} for ${who.join(', ')}`);
  }
  // ---- food: something to eat that is on the map or in a store
  const foodStock = (s.objects || []).some(o => (o.items || []).some(i => FOOD.test(String(i?.name || i)))) || folk.some(a => (a.inventory?.items || []).some(i => FOOD.test(String(i?.name || i))));
  if (!has([...FOOD_THINGS]) && !foodStock) {
    const p = places.find(q => ['tavern', 'shop', 'kitchen', 'storage', 'farmhouse', 'barn', 'camp', 'entrance', 'house'].includes(q.kind)) || places[0];
    if (p) add({ type: 'apple_barrel', in: p.id }, `a food barrel in ${p.id} (nothing to eat on the map)`);
  }
  // ---- a pressure: threats, a hunting monster, scarcity, or a goal that is one
  const monsters = s.agents.some(a => !minded(a) && !ANIMALS.has(a.model));
  const gk = goalKinds(s.goal);
  const pressure = (Array.isArray(s.threats) && s.threats.length) || monsters || gk.some(k => ['survived_days', 'stock_at_least', 'threat_defeated'].includes(k));
  if (!pressure) { s.threats = [{ ...DEFAULT_THREAT[kind] }]; note(`threats: ${s.threats[0].count} ${s.threats[0].who || s.threats[0].kind} at night (the world had no pressure; mild default)`); }
  // ---- a goal the engine can check, tied to the pressure
  if (!s.goal || !gk.some(k => PRESSURE_GOALS.includes(k))) {
    const t = (s.threats || [])[0], n = Math.max(1, folk.length - 1);
    s.goal = { text: s.goal?.text || (t ? `Help ${s.title || 'them'} through two nights: keep at least ${n} of its people standing.` : 'Keep everyone standing for two days.'), win: { survived_days: 2 }, lose: { not: { agents_alive: n } }, ...(s.goal?.winText ? { winText: s.goal.winText } : {}) };
    note('goal: survive two nights, lose if too many fall (none the engine could check)');
  }
  // ---- what the jobs need to be allowed
  const base = Array.isArray(s.allowed) ? s.allowed : ['say', 'walk', 'face', 'emote'];
  for (const a of folk) {
    const j = typeof a.job === 'string' ? JOBS[a.job.toLowerCase()] : null; if (!j) continue;
    const need = [...(j.fights ? ['attack', 'wield'] : []), ...(j.sells ? ['give', 'sell'] : [])];
    const mine = Array.isArray(a.allowed) ? a.allowed : base;
    const missing = need.filter(c => !mine.includes(c));
    if (missing.length) { a.allowed = [...new Set([...mine, ...missing])]; note(`${a.id}: allowed ${missing.join(', ')} (${a.job})`); }
  }
  // ---- everyone's start, home and workplace reachable from the player's start
  try {
    const R = reach(s);
    for (const a of folk) for (const k of ['home', 'workplace']) { const p = a[k] && R.b.r.places.find(q => q.id === String(a[k]).toLowerCase()); if (p && !R.placeReached(p)) problems.push(`${a.id}: its ${k} "${a[k]}" cannot be reached from the player's start`); }
    const bad = R.b.things.filter(t => t.src && (BEDS.has(t.type) || STORES.has(t.type) || Object.values(KIND_TYPES).flat().includes(t.type)) && !R.near(t));
    for (const t of bad) { const o = t.src; if (o && s.objects?.includes(o)) { delete o.x; delete o.z; const p = R.b.r.places.find(q => R.b.inP(q, t)); if (p) { o.in = p.id; note(`${o.type} at an unreachable square moved to a free one in ${p.id}`); } } else note(`unreachable: ${t.type} at ${t.x},${t.z}`); }
  } catch (e) { note('reachability check skipped: ' + e.message); }
  return problems;
}
