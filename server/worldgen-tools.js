// The world builder's tools: what a tool-calling model (the builder's agent
// mode, app/worldgen-agent.js) uses to build and change a scenario step by step
// instead of writing it as one JSON answer. Pure functions over a scenario
// object, shared by the Bun server and the Cloudflare Worker (POST
// /api/worldgen/tool) and tested without a model (tools/worldgen-tools-test.mjs).
//
//   TOOLS                         the tool list (OpenAI "tools" format)
//   runTool(scenario, name, args, ctx)
//       -> { scenario, result, log, changed, done? }
//          scenario: the new one (a copy; the given one is not changed)
//          result:   what goes back to the model (an object; errors as { error })
//          log:      one short line for the player ("added character mara, the miller")
//          done:     finish passed the checks: { scenario, code } as POST /api/finish gives
//       ctx: { packVoices, prompt (the request: finish runs the living-world checks for a
//              new world), fresh (a new world, not a change) }
//   agentSystem(skill, voices)    the agent's system message (the generator's guide as reference)
//   agentUser(prompt)             the first request; followUser(request) a later one
//
// Each change is checked as it is made (ids, bodies, jobs, object types, places,
// map methods); the whole world is checked by "validate" and "finish" with the
// server's own checkScenario / finishScenario (worldgen-core.js), so an agent's
// world passes exactly what a one-answer world passes.
import { checkScenario, finishScenario, systemPrompt, MODELS, MINDLESS, ANIMALS, COMMANDS, PICKUPS } from './worldgen-core.js';
import '../app/procgen.js';
import '../app/autonomy-profile.js';
const Procgen = globalThis.TablefolkProcgen;

// ---- the catalog (fast-skill.md and the map editor's palette, app/map-editor.js OBJECT_GROUPS) ----
export const JOBS = ['farmer', 'baker', 'innkeeper', 'cook', 'smith', 'woodcutter', 'miner', 'hunter', 'fisher', 'herder', 'merchant', 'guard', 'healer', 'ratcatcher', 'scholar', 'child', 'labourer', 'idler'];
const OBJECT_GROUPS = {
  treasure: ['chest', 'iron_chest', 'coin_pile', 'key', 'potion', 'scroll', 'chalice', 'bag', 'note', 'gold_bars', 'crown', 'necklace', 'coin_pouch', 'crystals', 'book', 'open_book'],
  arms: ['sword', 'greatsword', 'dagger', 'spear', 'war_hammer', 'hunting_bow', 'shield', 'round_shield', 'leather_armor', 'plate_armor'],
  light: ['torch', 'candelabra', 'candles', 'lantern', 'lamp', 'campfire', 'floor_lamp', 'crystal_ball', 'scrying_pool', 'rune_circle'],
  furniture: ['picture', 'table', 'bench', 'stool', 'wooden_chair', 'bed', 'double_bed', 'bookcase', 'bookshelf', 'cabinet', 'nightstand', 'desk', 'lectern', 'armchair', 'sofa', 'coffee_table', 'plant', 'rug'],
  storage: ['barrel', 'crate', 'iron_crate', 'apple_barrel', 'apple_crate', 'carrot_crate', 'bucket', 'pot', 'vase', 'broken_pot', 'cauldron'],
  work: ['anvil', 'workbench', 'weapon_stand', 'axe', 'pickaxe', 'rope', 'logs', 'dummy', 'target', 'cage', 'chains', 'wall_banner', 'banner'],
  outdoors: ['tree', 'boulder', 'flowers', 'grass_tuft', 'mushroom', 'pumpkin', 'fence', 'signpost', 'well', 'cart', 'broken_cart', 'tent', 'market_stand', 'market_stalls', 'statue', 'lily_pad', 'fire_pit', 'log', 'hay', 'sacks', 'fence_section', 'farm_fence', 'backpack', 'shovel', 'scythe', 'frying_pan', 'bear_trap', 'skull', 'bone'],
  nature: ['pine_tree', 'tall_pine', 'oak_tree', 'tall_tree', 'autumn_tree', 'dead_tree', 'red_bush', 'flower_bush', 'fern', 'mushroom_cluster', 'shelf_fungus', 'mossy_rock', 'tall_grass', 'heather', 'flower_patch'],
  buildings: ['house', 'fantasy_house', 'stable', 'windmill', 'bell_tower', 'watch_tower', 'inn', 'stone_house', 'tall_house', 'mill_house', 'sawmill', 'blacksmith', 'barracks', 'gazebo', 'barn', 'big_barn', 'small_barn', 'open_barn', 'silo', 'silo_barn', 'chicken_coop', 'stone_windmill'],
};
export const OBJECT_TYPES = new Set([...Object.values(OBJECT_GROUPS).flat(), 'wall', 'door', 'light', 'tile', ...Object.keys(PICKUPS)]);
const PLACES = {
  village: ['square', 'tavern', 'smithy', 'shop', 'temple', 'alchemist', 'guardhouse', 'library', 'stable', 'house', 'pond', 'garden'],
  dungeon: ['entrance', 'throne', 'lair', 'treasure', 'library', 'shrine', 'barracks', 'storage', 'kitchen', 'prison', 'crypt', 'alchemy'],
  forest: ['clearing', 'camp', 'ruins', 'grove', 'shrine', 'pond', 'hut', 'cave', 'meadow'],
  farm: ['yard', 'farmhouse', 'barn', 'pasture', 'field', 'orchard', 'coop'],
  cave: ['entrance', 'lair', 'crystals', 'grotto', 'pool', 'treasure', 'bones', 'camp', 'mine', 'chamber'],
};
const MAP_STYLES = { village: ['hamlet'], dungeon: ['castle', 'crypt'], forest: ['spooky', 'autumn', 'pine'], farm: [], cave: ['mine'] };
const HOUSE = { style: ['plaster_timber', 'stone_timber', 'stone_cottage', 'plank_barn'], storeys: [1, 2], roof: ['shingle', 'tile', 'thatch'], chimney: ['left', 'right', false] };
const PEOPLE = ['woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard', 'swordswoman', 'sorceress', 'swordsman', 'wanderer', 'villager_woman', 'dwarf', 'elf', 'priest', 'guard', 'merchant'];
const GOALS = 'survived_days 2 | stock_at_least ["wheat", 10] | threat_defeated "wolf" or ["goblin", 4] | agents_alive 3 or "all" | agent_defeated "id" | player_defeated true | player_has "item" | player_gold [">=", 10] | agent_has ["id", "item"] | agent_near ["id", "square", 2] | chest_has "item" | said ["id", "word"] | all/any/not [...]';
// top-level fields set_meta may set (the map, characters, objects, events and sections have their own tools)
const META = ['title', 'subtitle', 'intro', 'seed', 'lighting', 'dark', 'talk', 'live', 'time', 'dayMinutes', 'monsters', 'temper', 'harsh', 'prices', 'food', 'autonomy', 'allowed',
  'player', 'goal', 'threats', 'director', 'skills', 'menus', 'flags', 'facts', 'triggers', 'locked', 'walls', 'view', 'showIntro', 'defaultModel', 'brain', 'simple', 'onlySpokenTo', 'bodies', 'packages', 'stores'];
const AGENT_FIELDS = new Set(['id', 'model', 'job', 'home', 'workplace', 'in', 'at', 'style', 'personality', 'secret', 'agenda', 'knows', 'relations', 'quest', 'temper', 'hostile', 'hp', 'wield', 'inventory', 'allowed', 'ttsVoiceId', 'autonomy', 'skills', 'menu', 'thinking', 'facing', 'readsBooks', 'name', 'backstory', 'simple', 'chaos', 'faction', 'brain']);

const clone = v => JSON.parse(JSON.stringify(v ?? {}));
const words = s => String(s).replace(/_/g, ' ');
const near = (w, list) => { w = String(w || '').toLowerCase(); const hits = [...list].filter(x => x.includes(w) || w.includes(x) || x.split('_').some(p => p.length > 2 && w.includes(p))); return hits.slice(0, 8); };
const fail = (error, extra = {}) => ({ error, ...extra });
const bodyOk = (s, m) => MODELS.has(m) || (Array.isArray(s.bodies) && s.bodies.map(String).includes(m));

// ---- the tool list ----
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const anyObj = d => ({ type: 'object', description: d, additionalProperties: true });
const fn = (name, description, parameters) => ({ type: 'function', function: { name, description, parameters } });
export const TOOLS = [
  fn('get_scenario', 'Read the world as it is now. part: "summary" (default: counts, ids, places), "all" (the whole JSON; long object lists cut), or one of "meta", "map", "agents", "objects", "events", "goal", "threats", "sections", or a character id.',
    obj({ part: { type: 'string' } })),
  fn('get_catalog', 'Look up what exists: "bodies" (people, monsters, animals), "objects" (types by group), "jobs", "places" (place kinds per map kind), "houses" (building style fields), "commands", "goals" (win/lose predicates), or "all".',
    obj({ what: { type: 'string' } })),
  fn('set_meta', 'Set top-level fields: title, subtitle, intro, lighting ("bright"|"night"), dark, talk, live, time, dayMinutes, monsters, temper, harsh, prices, food, autonomy ("rails"|"assisted"|"guided"|"free" or an object), allowed, player, goal ({text, win, lose, winText, loseText}), threats (a list), director, skills, menus, flags, facts, triggers, locked. A field set to null is removed.',
    obj({ fields: anyObj('the fields to set, e.g. {"title": "Ashford Hollow", "dayMinutes": 12}') }, ['fields'])),
  fn('set_map', 'Choose how the map is made (replaces the current map method). method "generate": kind village|dungeon|forest|farm|cave, buildings (village 3-14) or rooms (dungeon 3-16, cave), style, places (place kinds that must exist), houses, seed, size [cols, rows]. method "grid": rows of glyphs (talk-only rooms) with legend. method "map": layout lines with floor.',
    obj({ method: { type: 'string', enum: ['generate', 'grid', 'map'] }, kind: { type: 'string' }, buildings: { type: 'integer' }, rooms: { type: 'integer' }, style: { type: 'string' }, places: { type: 'array', items: { type: 'string' } },
      houses: anyObj('per place id or kind: {style, storeys, roof, pitch, jetty, chimney, porch, sign, dormers, seed}'), seed: { type: 'integer' }, size: { type: 'array', items: { type: 'integer' } },
      grid: { type: 'array', items: { type: 'string' } }, legend: anyObj('extra glyphs: {"x": "chest on stone"}'), map: { type: 'array', items: { type: 'string' } }, floor: { type: 'string' } }, ['method'])),
  fn('place', 'Add, remove or style a place of a generated map. action "add" makes sure a place kind exists ("tavern", "house"); "remove" drops it from the places asked for; "style" sets how its building looks (villages and farms): building {style: plaster_timber|stone_timber|stone_cottage|plank_barn, storeys 1|2, roof shingle|tile|thatch, pitch 30-60, jetty, chimney left|right|false, porch, sign, dormers 0-3, seed}.',
    obj({ action: { type: 'string', enum: ['add', 'remove', 'style'] }, place: { type: 'string' }, building: anyObj('style fields') }, ['action', 'place'])),
  fn('character', 'Add, change or remove a character. add: fields with id (1-24 letters, digits, _ or -), model (a body), job, home, workplace, in (a place), style, personality (2-4 sentences: who, one want, one opinion of a neighbour), secret, agenda, relations, temper, hostile, hp, wield, inventory {gold, items}, allowed, ttsVoiceId, autonomy. update: id and only the fields to change (null removes one). remove: id.',
    obj({ action: { type: 'string', enum: ['add', 'update', 'remove'] }, id: { type: 'string' }, fields: anyObj('the character\'s fields') }, ['action', 'id'])),
  fn('object', 'Add, change or remove a thing on the map. add: fields {type, in (a place) or x and z, items, gold, text, ...}. update/remove: index (from get_scenario "objects"). Use get_catalog "objects" for the types.',
    obj({ action: { type: 'string', enum: ['add', 'update', 'remove'] }, index: { type: 'integer' }, fields: anyObj('the object\'s fields') }, ['action'])),
  fn('event', 'Things that happen next to a character now and then. add: event (a sentence, "{who} finds a note.", or an object {text, round, to, spawn, note}); remove: index; clear: all.',
    obj({ action: { type: 'string', enum: ['add', 'remove', 'clear'] }, event: { description: 'a sentence or an object' }, index: { type: 'integer' } }, ['action'])),
  fn('section', 'Worlds in several maps. add: key, title, generate ({kind, rooms...}) and agents (its characters, as for character add) make a new section (a subworld); link: a way between the top map and a section ({in: a place, to: the section key, kind: stairs_down|stairs_up|cave|gate|trapdoor|door, name}); remove: key.',
    obj({ action: { type: 'string', enum: ['add', 'link', 'remove'] }, key: { type: 'string' }, title: { type: 'string' }, generate: anyObj('the section\'s map'), agents: { type: 'array', items: anyObj('a character') }, link: anyObj('the link') }, ['action'])),
  fn('validate', 'Check the whole world with the game\'s own checks; returns the problems to fix (an empty list when it is fine).', obj({})),
  fn('preview', 'The map as it will be built: its size, every place with who and what is in it, and warnings.', obj({})),
  fn('undo', 'Take back the last change.', obj({})),
  fn('finish', 'The world is done: runs the checks; if they pass the player sees it, else the problems come back to fix. summary: two or three sentences for the player on what you built or changed.',
    obj({ summary: { type: 'string' } }, ['summary'])),
];
export const TOOL_NAMES = TOOLS.map(t => t.function.name);

// ---- what a map builds into (procgen.js), for preview, place checks and summaries ----
function built(s) {
  if (!s.generate) return null;
  try { return Procgen.applyToScenario(clone(s)); } catch (e) { return { error: e.message, places: [], warnings: [] }; }
}
const placeIds = s => built(s)?.places?.map(p => p.id) || [];
const kindOf = s => String(s.generate?.kind || '').toLowerCase();
function placeKnown(s, where) {
  if (where == null || !s.generate) return null;
  const k = String(where).toLowerCase().replace(/\s+\d+$/, ''), kinds = PLACES[kindOf(s)] || [];
  if (kinds.includes(k) || (s.generate.places || []).map(p => String(p).toLowerCase().replace(/\s+\d+$/, '')).includes(k) || placeIds(s).some(p => p.replace(/\s+\d+$/, '') === k)) return null;
  return `no place "${where}" in a ${kindOf(s) || 'generated'} map (kinds: ${kinds.join(', ')})`;
}
function summary(s) {
  const b = built(s);
  return {
    title: s.title || null, map: s.generate ? { method: 'generate', ...s.generate } : s.grid ? { method: 'grid', rows: (s.grid || []).length } : s.map ? { method: 'map', lines: s.map.length } : null,
    places: b?.places?.map(p => p.id), characters: (s.agents || []).map(a => `${a.id} (${[a.model, a.job, a.in || a.workplace].filter(Boolean).join(', ')})`),
    objects: (s.objects || []).length, events: (s.events || []).length, threats: (s.threats || []).length, goal: s.goal?.text || null, sections: Object.keys(s.subworlds || {}),
  };
}
function preview(s) {
  const b = built(s);
  if (!b) {
    if (s.grid) return { method: 'grid', rows: s.grid, legend: s.legend || {}, characters: (s.agents || []).map((a, i) => `${i + 1} = ${a.id}`) };
    return { method: s.map ? 'map' : 'none', lines: s.map || [], note: s.map ? 'layout lines are placed when the game starts' : 'no map yet: call set_map' };
  }
  if (b.error) return { error: b.error };
  const sc = b.scenario, at = (x, z, p) => x >= Math.min(p.x0, p.x1) && x <= Math.max(p.x0, p.x1) && z >= Math.min(p.z0, p.z1) && z <= Math.max(p.z0, p.z1);
  const places = b.places.map(p => {
    const who = sc.agents.filter(a => a.in === p.id).map(a => a.id);
    const things = {}; for (const o of sc.objects) if (o && o.type !== 'light' && o.type !== 'wall' && o.type !== 'door' && Number.isFinite(+o.x) && at(+o.x, +o.z, p)) things[o.type] = (things[o.type] || 0) + 1;
    return `${p.id} (${p.kind}) at [${p.center}]${p.house ? ' ' + JSON.stringify(p.house) : ''}: ${who.length ? 'people ' + who.join(', ') + '; ' : ''}${Object.entries(things).map(([t, n]) => n > 1 ? `${t} x${n}` : t).join(', ') || 'empty'}`;
  });
  return { size: sc.size, start: sc.player?.at, places, warnings: b.warnings };
}

// ---- checks for one change ----
function checkAgent(s, a, isNew) {
  const out = [];
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(String(a.id || ''))) out.push(`id ${JSON.stringify(a.id)}: use 1-24 letters, digits, _ or -`);
  if (a.model != null && !bodyOk(s, a.model)) out.push(`no body "${a.model}"${near(a.model, MODELS).length ? ' (close: ' + near(a.model, MODELS).join(', ') + ')' : ''}: see get_catalog "bodies"`);
  if (a.job != null && !JOBS.includes(a.job)) out.push(`no job "${a.job}" (jobs: ${JOBS.join(', ')})`);
  for (const k of ['in', 'home', 'workplace']) { const p = a[k] != null && placeKnown(s, a[k]); if (p) out.push(`${k}: ${p}`); }
  if (a.autonomy != null && !globalThis.tablefolkProfile.normalize(a.autonomy)) out.push('autonomy: "rails", "assisted", "guided", "free" or an object such as {"preset": "free", "needs": "code"}');
  for (const c of a.allowed || []) if (!COMMANDS.has(c)) out.push(`allowed: no command "${c}"`);
  if (isNew && !a.personality && !(a.hostile || MINDLESS.has(a.model) || ANIMALS.has(a.model))) out.push('a talking character needs a "personality" (2-4 sentences)');
  if (a.inventory != null && (typeof a.inventory !== 'object' || Array.isArray(a.inventory))) out.push('inventory: {"gold": 5, "items": ["bread"]}');
  return out;
}
function checkObject(s, o) {
  const out = [];
  if (!o.type || !OBJECT_TYPES.has(o.type)) out.push(`no object type "${o.type}"${near(o.type, OBJECT_TYPES).length ? ' (close: ' + near(o.type, OBJECT_TYPES).join(', ') + ')' : ''}: see get_catalog "objects"`);
  const p = o.in != null && placeKnown(s, o.in); if (p) out.push('in: ' + p);
  if (o.in == null && !(Number.isFinite(+o.x) && Number.isFinite(+o.z))) out.push('give it a place ("in") or a square ("x" and "z")');
  return out;
}
function checkHouse(b) {
  const out = [], h = {};
  for (const [k, v] of Object.entries(b || {})) {
    if (HOUSE[k] && !HOUSE[k].includes(v)) { out.push(`${k}: one of ${HOUSE[k].map(String).join(', ')}`); continue; }
    if (k === 'pitch' && !(+v >= 30 && +v <= 60)) { out.push('pitch: 30-60'); continue; }
    if (k === 'dormers' && !(Number.isInteger(+v) && +v >= 0 && +v <= 3)) { out.push('dormers: 0-3'); continue; }
    if (!['style', 'storeys', 'roof', 'pitch', 'jetty', 'chimney', 'porch', 'sign', 'dormers', 'seed'].includes(k)) { out.push(`no building field "${k}"`); continue; }
    h[k] = v;
  }
  return { out, h };
}
function checkMeta(s, f) {
  const out = [];
  for (const k of Object.keys(f)) if (!META.includes(k)) out.push(`"${k}" is not set here${['agents', 'objects', 'events', 'generate', 'grid', 'map', 'subworlds', 'links'].includes(k) ? ' (use its own tool)' : ''}`);
  if (f.lighting != null && !['bright', 'night', 'dim'].includes(f.lighting)) out.push('lighting: "bright", "night" or "dim"');
  if (f.autonomy != null && !globalThis.tablefolkProfile.normalize(f.autonomy)) out.push('autonomy: "rails", "assisted", "guided", "free" or an object');
  for (const c of f.allowed || []) if (!COMMANDS.has(c)) out.push(`allowed: no command "${c}"`);
  if (f.player?.model && !bodyOk(s, f.player.model)) out.push(`player.model: no body "${f.player.model}"`);
  if (f.threats != null) { if (!Array.isArray(f.threats)) out.push('threats: a list'); else for (const t of f.threats) { if (!['raid', 'rats', 'bandits'].includes(t?.kind)) out.push('threats: kind raid, rats or bandits'); if (t?.who && !bodyOk(s, t.who)) out.push(`threats: no body "${t.who}"`); } }
  if (f.goal != null && (typeof f.goal !== 'object' || !f.goal.text)) out.push('goal: {"text": "...", "win": {...}, "lose": {...}}');
  if (f.dayMinutes != null && !(+f.dayMinutes >= 0)) out.push('dayMinutes: real minutes a game day takes (12), 0 stops the clock');
  if (f.time != null && !/^\d{1,2}:\d\d$/.test(String(f.time))) out.push('time: "07:00"');
  return out;
}

// ---- running one tool ----
export function runTool(scenario, name, args = {}, ctx = {}) {
  const s = clone(scenario);
  args = args && typeof args === 'object' ? args : {};
  const ok = (result, log, changed = true) => ({ scenario: changed ? s : scenario, result: { ok: true, ...result }, log, changed });
  const no = (error, extra) => ({ scenario, result: fail(error, extra), log: `${name}: ${String(error).slice(0, 140)}`, changed: false, failed: true });
  try {
    switch (name) {
      case 'get_scenario': {
        const part = String(args.part || 'summary');
        const cut = v => Array.isArray(v) && v.length > 150 ? [...v.slice(0, 150), `... ${v.length - 150} more`] : v;
        const parts = { summary: () => summary(s), all: () => ({ ...s, objects: cut((s.objects || []).map((o, i) => ({ i, ...o }))) }),
          meta: () => Object.fromEntries(META.filter(k => s[k] !== undefined).map(k => [k, s[k]])), map: () => ({ generate: s.generate, grid: s.grid, legend: s.legend, map: s.map, floor: s.floor, size: s.size }),
          agents: () => s.agents || [], objects: () => cut((s.objects || []).map((o, i) => ({ i, ...o }))), events: () => (s.events || []).map((e, i) => ({ i, event: e })),
          goal: () => s.goal || null, threats: () => s.threats || [], sections: () => ({ links: s.links || [], subworlds: Object.fromEntries(Object.entries(s.subworlds || {}).map(([k, v]) => [k, { title: v.title, generate: v.generate, agents: (v.agents || []).map(a => a.id) }])) }) };
        if (parts[part]) return ok({ [part]: parts[part]() }, null, false);
        const a = (s.agents || []).find(x => x.id === part);
        return a ? ok({ character: a }, null, false) : no(`no part "${part}" (summary, all, meta, map, agents, objects, events, goal, threats, sections, or a character id)`);
      }
      case 'get_catalog': {
        const w = String(args.what || 'all');
        const c = { bodies: { people: PEOPLE, monsters: [...MODELS].filter(m => !PEOPLE.includes(m) && !ANIMALS.has(m) && !['critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian'].includes(m)), animals: [...ANIMALS], note: 'monsters in MINDLESS fight by default: ' + [...MINDLESS].join(' ') },
          objects: OBJECT_GROUPS, jobs: JOBS, places: PLACES, map_styles: MAP_STYLES, houses: { ...HOUSE, pitch: '30-60', jetty: 'true|false', porch: 'true|false', sign: 'true|false', dormers: '0-3', seed: 'a number' },
          commands: [...COMMANDS], goals: GOALS };
        if (w === 'all') return ok({ catalog: c }, null, false);
        return c[w] ? ok({ [w]: c[w] }, null, false) : no(`no catalog "${w}" (bodies, objects, jobs, places, houses, commands, goals, all)`);
      }
      case 'set_meta': {
        const f = args.fields && typeof args.fields === 'object' ? args.fields : null;
        if (!f || !Object.keys(f).length) return no('fields: an object of top-level fields');
        const bad = checkMeta(s, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null)));
        if (bad.length) return no(bad.join('; '));
        for (const [k, v] of Object.entries(f)) { if (v === null) delete s[k]; else s[k] = v; }
        return ok({ set: Object.keys(f) }, 'set ' + Object.keys(f).map(k => k === 'title' ? `the title "${f.title}"` : k).join(', '));
      }
      case 'set_map': {
        const m = args.method;
        delete s.generate; delete s.grid; delete s.map;
        if (m === 'generate') {
          const kind = String(args.kind || '').toLowerCase();
          if (!PLACES[kind]) return no(`kind: one of ${Object.keys(PLACES).join(', ')}`);
          const g = { kind };
          if (args.buildings != null) { if (!(args.buildings >= 3 && args.buildings <= 14)) return no('buildings: 3-14'); g.buildings = +args.buildings; }
          if (args.rooms != null) { if (!(args.rooms >= 3 && args.rooms <= 16)) return no('rooms: 3-16'); g.rooms = +args.rooms; }
          if (args.style) { if (!MAP_STYLES[kind].includes(args.style)) return no(`style for a ${kind}: ${MAP_STYLES[kind].join(', ') || 'none'}`); g.style = args.style; }
          if (args.places) { const badP = args.places.filter(p => !PLACES[kind].includes(String(p).toLowerCase().replace(/\s+\d+$/, ''))); if (badP.length) return no(`places ${badP.join(', ')}: a ${kind} has ${PLACES[kind].join(', ')}`); g.places = args.places; }
          if (args.houses) { const hs = {}; for (const [k, b] of Object.entries(args.houses)) { const { out, h } = checkHouse(b); if (out.length) return no(`houses.${k}: ${out.join('; ')}`); hs[k] = h; } g.houses = hs; }
          if (args.seed != null) g.seed = +args.seed;
          if (Array.isArray(args.size) && args.size.length === 2) { if (!args.size.every(n => n >= 15 && n <= 63)) return no('size: [cols, rows], each 15-63'); g.size = args.size.map(Number); }
          s.generate = g; delete s.size;
          if (s.legend && !args.legend) delete s.legend;
          const b = built(s); if (b?.error) return no('the map could not be made: ' + b.error);
          return ok({ places: b.places.map(p => p.id), warnings: b.warnings, ...(kind === 'village' ? { note: 'a building nobody lives or works in, and with nothing put in it, stays a closed building: give places to characters (in, home, workplace) and things (in) to open them' } : {}) }, `made a ${kind} map${g.buildings ? ' with ' + g.buildings + ' buildings' : g.rooms ? ' with ' + g.rooms + ' rooms' : ''}: ${b.places.map(p => p.id).join(', ')}`);
        }
        if (m === 'grid') {
          const g = args.grid;
          if (!Array.isArray(g) || g.length < 3) return no('grid: a list of rows (top = north), all the same length');
          const w = [...g[0]].length; if (g.some(r => [...r].length !== w)) return no('grid: every row the same length');
          if (w > 63 || g.length > 63) return no('grid: at most 63 x 63');
          s.grid = g; if (args.legend) s.legend = args.legend;
          return ok({ size: [w, g.length] }, `drew a ${w} x ${g.length} room`);
        }
        if (m === 'map') {
          if (!Array.isArray(args.map) || !args.map.length) return no('map: a list of layout lines ("place campfire at center")');
          s.map = args.map; if (args.floor) s.floor = args.floor;
          return ok({ lines: args.map.length }, `laid out the scene in ${args.map.length} lines`);
        }
        return no('method: generate, grid or map');
      }
      case 'place': {
        if (!s.generate) return no('the map is not generated: set_map with method "generate" first');
        const kind = kindOf(s), p = String(args.place || '').toLowerCase().trim(), base = p.replace(/\s+\d+$/, '');
        if (!PLACES[kind]?.includes(base)) return no(`a ${kind} has ${PLACES[kind]?.join(', ')}`);
        if (args.action === 'add') { const list = s.generate.places || []; if (!list.includes(p)) list.push(p); s.generate.places = list; const b = built(s); return ok({ places: b?.places?.map(q => q.id) }, `added the ${p}`); }
        if (args.action === 'remove') {
          s.generate.places = (s.generate.places || []).filter(q => String(q).toLowerCase() !== p); if (!s.generate.places.length) delete s.generate.places;
          if (s.generate.houses) delete s.generate.houses[p];
          const users = [...(s.agents || []).filter(a => [a.in, a.home, a.workplace].map(v => String(v || '').toLowerCase()).includes(p)).map(a => a.id), ...(s.objects || []).filter(o => String(o?.in || '').toLowerCase() === p).map(o => o.type)];
          return ok({ note: users.length ? `still pointing at "${p}" (the map makes it while they do): ${users.join(', ')}` : undefined }, `removed the ${p}`);
        }
        if (args.action === 'style') {
          if (!['village', 'farm'].includes(kind)) return no('building styles are for villages and farms');
          const { out, h } = checkHouse(args.building); if (out.length) return no(out.join('; '));
          s.generate.houses = { ...(s.generate.houses || {}), [p]: { ...(s.generate.houses?.[p] || {}), ...h } };
          return ok({ house: s.generate.houses[p] }, `styled the ${p}: ${Object.entries(h).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        }
        return no('action: add, remove or style');
      }
      case 'character': {
        const id = String(args.id || args.fields?.id || ''), list = s.agents ||= [], i = list.findIndex(a => a.id === id), f = args.fields && typeof args.fields === 'object' ? args.fields : {};
        const unknown = Object.keys(f).filter(k => !AGENT_FIELDS.has(k));
        if (args.action === 'add') {
          if (i >= 0) return no(`there is already a character "${id}": use update`);
          const a = { ...f, id }; for (const k of Object.keys(a)) if (a[k] === null) delete a[k];
          const bad = checkAgent(s, a, true); if (bad.length) return no(bad.join('; '));
          list.push(a);
          return ok({ id, note: unknown.length ? 'fields the game does not read: ' + unknown.join(', ') : undefined }, `added character ${id}${a.job ? ', the ' + words(a.job) : a.model ? ' (' + words(a.model) + ')' : ''}`);
        }
        if (i < 0) return no(`no character "${id}" (${list.map(a => a.id).join(', ') || 'none yet'})`);
        if (args.action === 'update') {
          const a = { ...list[i] }; for (const [k, v] of Object.entries(f)) { if (k === 'id') continue; if (v === null) delete a[k]; else a[k] = v; }
          const bad = checkAgent(s, a, false); if (bad.length) return no(bad.join('; '));
          list[i] = a;
          return ok({ id, note: unknown.length ? 'fields the game does not read: ' + unknown.join(', ') : undefined }, `changed ${id}: ${Object.keys(f).join(', ')}`);
        }
        if (args.action === 'remove') { list.splice(i, 1); return ok({ id }, `removed ${id}`); }
        return no('action: add, update or remove');
      }
      case 'object': {
        const list = s.objects ||= [], f = args.fields && typeof args.fields === 'object' ? args.fields : {};
        if (args.action === 'add') {
          const o = { ...f }; const bad = checkObject(s, o); if (bad.length) return no(bad.join('; '));
          list.push(o);
          return ok({ index: list.length - 1 }, `added a ${words(o.type)}${o.in ? ' in the ' + o.in : ''}`);
        }
        const i = +args.index;
        if (!Number.isInteger(i) || !list[i]) return no(`index: 0-${list.length - 1} (get_scenario "objects")`);
        if (args.action === 'update') {
          const o = { ...list[i] }; for (const [k, v] of Object.entries(f)) { if (v === null) delete o[k]; else o[k] = v; }
          const bad = checkObject(s, o); if (bad.length) return no(bad.join('; '));
          list[i] = o; return ok({ index: i }, `changed the ${words(o.type)} (${Object.keys(f).join(', ')})`);
        }
        if (args.action === 'remove') { const [o] = list.splice(i, 1); return ok({ index: i, note: 'later objects moved down one index' }, `removed the ${words(o.type)}`); }
        return no('action: add, update or remove');
      }
      case 'event': {
        const list = s.events ||= [];
        if (args.action === 'add') {
          const e = args.event; if (!e || (typeof e !== 'string' && !(typeof e === 'object' && e.text))) return no('event: a sentence or {"text": ...}');
          list.push(e); return ok({ index: list.length - 1 }, `added an event: ${String(typeof e === 'string' ? e : e.text).slice(0, 80)}`);
        }
        if (args.action === 'remove') { const i = +args.index; if (!list[i]) return no(`index: 0-${list.length - 1}`); list.splice(i, 1); return ok({}, 'removed an event'); }
        if (args.action === 'clear') { delete s.events; return ok({}, 'cleared the events'); }
        return no('action: add, remove or clear');
      }
      case 'section': {
        const key = String(args.key || '');
        if (args.action === 'add') {
          if (!/^[a-z0-9_-]{1,24}$/i.test(key)) return no('key: 1-24 letters, digits, _ or -');
          if (s.subworlds?.[key]) return no(`there is already a section "${key}"`);
          const g = args.generate || {}; if (!PLACES[String(g.kind || '').toLowerCase()]) return no(`generate.kind: one of ${Object.keys(PLACES).join(', ')}`);
          const sec = { title: args.title || key, generate: g, agents: Array.isArray(args.agents) ? args.agents : [] };
          const bad = sec.agents.flatMap(a => checkAgent(sec, a || {}, true).map(x => `${a?.id}: ${x}`)); if (bad.length) return no(bad.join('; '));
          (s.subworlds ||= {})[key] = sec;
          return ok({ key, note: 'link it from the top map with section action "link"' }, `added the section ${args.title || key}${sec.agents.length ? ' with ' + sec.agents.map(a => a.id).join(', ') : ''}`);
        }
        if (args.action === 'link') {
          const l = args.link || {}; if (!l.to || (l.to !== 'back' && !s.subworlds?.[l.to])) return no(`link.to: a section key (${Object.keys(s.subworlds || {}).join(', ') || 'none yet'})`);
          if (!l.in && !l.edge) return no('link: "in" (a place) or "edge" (north, south, east, west)');
          (s.links ||= []).push(l); return ok({}, `linked ${l.in || l.edge} to ${l.to}`);
        }
        if (args.action === 'remove') { if (!s.subworlds?.[key]) return no(`no section "${key}"`); delete s.subworlds[key]; if (!Object.keys(s.subworlds).length) delete s.subworlds; s.links = (s.links || []).filter(l => l.to !== key); if (!s.links.length) delete s.links; return ok({}, `removed the section ${key}`); }
        return no('action: add, link or remove');
      }
      case 'validate': {
        const problems = checkScenario(clone(s), ctx.packVoices || [], { section: false });
        return ok({ problems }, problems.length ? `checked: ${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'checked: no problems', false);
      }
      case 'preview': return ok({ preview: preview(s) }, 'looked at the map', false);
      case 'undo': return { scenario, result: { ok: true, undo: true }, log: 'took back the last change', changed: false, undo: true };   // the caller keeps the history
      case 'finish': {
        const r = finishScenario({ scenario: clone(s), prompt: ctx.fresh ? (ctx.prompt || '') : '' }, ctx.packVoices || []);
        if (r.problems?.length) return { scenario, result: { ok: false, problems: r.problems, note: 'fix these, then call finish again' }, log: `finish: ${r.problems.length} problem${r.problems.length > 1 ? 's' : ''} to fix first`, changed: false };
        return { scenario: r.scenario, result: { ok: true, finished: true, repairs: r.repairs }, log: 'finished: ' + String(args.summary || '').slice(0, 200), changed: true, done: { scenario: r.scenario, code: r.code, repairs: r.repairs, summary: String(args.summary || '') } };
      }
      default: return no(`no tool "${name}" (${TOOL_NAMES.join(', ')})`);
    }
  } catch (e) { return no('the tool failed: ' + (e?.message || e)); }
}

// ---- the agent's prompts ----
export function agentSystem(skill, voices) {
  const guide = systemPrompt(skill, voices)
    .replace(/Answer with ONE JSON object and nothing else\s*\(no prose, no markdown fences\)\. Be quick: keep it compact\./, 'The guide below describes the scenario format; here you build it with tools, not as one JSON answer.');
  return `You are the world builder of Tablefolk, a 3D tabletop game whose characters are played by AI models. You build and change a world (a scenario) by calling tools; the player sees the world when you call finish.

How to work:
- Start with set_map (the kind of map; a living world uses "generate"), then set_meta (title, subtitle, intro, time, dayMinutes, threats, goal), then add the characters one by one with character, then things (object), events, and building styles (place style) where they help.
- Use get_catalog when unsure of a body, job, object type, place or building field; use preview to see where everything lands; validate to see the problems.
- A tool that fails tells you why: fix the arguments and call it again. Do not repeat a call that worked.
- Keep each call small: one character, one object. Several calls in one turn are fine.
- When the world is complete and validate shows no problems, call finish with a short summary. For a later change, make only what was asked, then finish again.

# The scenario guide (reference)

${guide}`;
}
export const agentUser = prompt => `Build this world: ${String(prompt || '').trim()}\n\nThe scenario is empty now. Call the tools to build it, then finish.`;
export const followUser = request => `Change the world: ${String(request || '').trim()}\n\nThe world may have been edited by hand since your last turn: read it with get_scenario if you need to. Make the change with the tools, then finish.`;

// POST /api/worldgen/agent and /api/worldgen/tool, for the Bun server and the Worker alike:
//   agent {prompt} or {request}  -> { system, tools, user, maxSteps }   (system only for a new session: {prompt} or {system: true})
//   tool  {scenario, name, args, prompt, fresh} -> runTool's { scenario (when changed), result, log, changed, undo, done }
export function agentRequest(b, { skill, voices }) {
  const prompt = String(b?.prompt || '').trim().slice(0, 4000), request = String(b?.request || '').trim().slice(0, 4000);
  if (!prompt && !request) return { error: 'prompt or request required', status: 400 };
  return { ...(prompt || b.system ? { system: agentSystem(skill, voices) } : {}), tools: TOOLS, user: prompt ? agentUser(prompt) : followUser(request), maxSteps: 60 };
}
export function toolRequest(b, { packVoices }) {
  if (!b || typeof b.name !== 'string') return { error: 'POST {scenario, name, args}', status: 400 };
  const r = runTool(b.scenario && typeof b.scenario === 'object' ? b.scenario : {}, b.name, b.args, { packVoices, prompt: String(b.prompt || '').slice(0, 4000), fresh: !!b.fresh });
  return { ...(r.changed ? { scenario: r.scenario } : {}), result: r.result, log: r.log, changed: r.changed, ...(r.undo ? { undo: true } : {}), ...(r.done ? { done: { ...r.done, link: '/app/#s=' + r.done.code } } : {}) };
}
