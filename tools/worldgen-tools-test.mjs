// Unit tests for the world builder's agent tools (server/worldgen-tools.js) and
// the in-browser tool-call parsing (app/worldgen-agent.js), no model needed:
//   node tools/worldgen-tools-test.mjs
import assert from 'node:assert/strict';
import { runTool, TOOLS, TOOL_NAMES, agentSystem, agentRequest, toolRequest, agentUser, reviewUser } from '../server/worldgen-tools.js';
import '../app/worldgen-agent.js';
const A = globalThis.TablefolkWorldAgent;
let n = 0, failed = 0;
const later = [];
// async tests (the agent loop) run one after another at the end: they share the agent's session
const t = (name, f) => { if (f.constructor.name === 'AsyncFunction') return later.push([name, f]); n++; try { f(); } catch (e) { failed++; console.log('FAIL', name, '\n ', e.message); } };

// ---- the tools ----
let s = {};
const step = (name, args, ctx) => { const r = runTool(s, name, args, ctx); if (r.changed) s = r.scenario; return r; };
t('tool list is valid', () => { assert.ok(TOOLS.length >= 12 && TOOLS.length <= 16); for (const x of TOOLS) assert.equal(x.function.parameters.type, 'object'); assert.ok(TOOL_NAMES.includes('finish')); });
t('system prompt drops the one-JSON instruction', () => { const p = agentSystem('Answer with ONE JSON object and nothing else\n(no prose, no markdown fences). Be quick: keep it compact.\n# Fields', 'x'); assert.ok(!/ONE JSON object/.test(p)); assert.ok(/tools/.test(p)); });
t('set_map generate', () => { const r = step('set_map', { method: 'generate', kind: 'village', buildings: 6, places: ['tavern', 'smithy'] }); assert.ok(r.result.ok, JSON.stringify(r.result)); assert.ok(r.result.places.includes('square')); assert.match(r.log, /village/); });
t('set_map rejects a bad kind', () => { const r = step('set_map', { method: 'generate', kind: 'spaceship' }); assert.ok(r.result.error); assert.equal(r.changed, false); assert.ok(s.generate); });
t('set_map rejects a bad place', () => { const r = step('set_map', { method: 'generate', kind: 'village', places: ['throne'] }); assert.match(r.result.error, /a village has/); });
t('set_meta', () => { const r = step('set_meta', { fields: { title: 'Ashford', time: '07:00', dayMinutes: 12, live: true, threats: [{ kind: 'raid', who: 'wolf', count: 2, when: 'night' }] } }); assert.ok(r.result.ok); assert.equal(s.title, 'Ashford'); });
t('set_meta refuses map fields and bad values', () => { assert.match(step('set_meta', { fields: { agents: [] } }).result.error, /own tool/); assert.match(step('set_meta', { fields: { lighting: 'purple' } }).result.error, /lighting/); assert.match(step('set_meta', { fields: { threats: [{ kind: 'raid', who: 'unicorn' }] } }).result.error, /unicorn/); });
t('set_meta null removes', () => { step('set_meta', { fields: { subtitle: 'x' } }); step('set_meta', { fields: { subtitle: null } }); assert.equal(s.subtitle, undefined); });
t('character add', () => { const r = step('character', { action: 'add', id: 'mara', fields: { model: 'peasant_woman', job: 'baker', home: 'house', workplace: 'tavern', personality: 'Mara, the baker. She wants flour.' } }); assert.ok(r.result.ok, JSON.stringify(r.result)); assert.match(r.log, /added character mara, the baker/); });
t('character add checks', () => {
  assert.match(step('character', { action: 'add', id: 'mara', fields: { model: 'farmer', personality: 'x' } }).result.error, /already/);
  assert.match(step('character', { action: 'add', id: 'bob', fields: { model: 'robot', personality: 'x' } }).result.error, /no body "robot"/);
  assert.match(step('character', { action: 'add', id: 'bob', fields: { model: 'farmer', job: 'astronaut', personality: 'x' } }).result.error, /no job/);
  assert.match(step('character', { action: 'add', id: 'bob', fields: { model: 'farmer' } }).result.error, /personality/);
  assert.match(step('character', { action: 'add', id: 'bob b', fields: { model: 'farmer', personality: 'x' } }).result.error, /id/);
  assert.match(step('character', { action: 'add', id: 'bob', fields: { model: 'farmer', personality: 'x', in: 'throne' } }).result.error, /no place/);
  assert.ok(step('character', { action: 'add', id: 'wolf1', fields: { model: 'wolf' } }).result.ok);   // a monster needs no personality
});
t('character update and remove', () => { step('character', { action: 'update', id: 'mara', fields: { secret: 'She sold grain.', job: null } }); assert.equal(s.agents[0].secret, 'She sold grain.'); assert.equal(s.agents[0].job, undefined); assert.ok(step('character', { action: 'remove', id: 'wolf1' }).result.ok); assert.match(step('character', { action: 'remove', id: 'ghost' }).result.error, /no character/); });
t('object add/update/remove', () => {
  const r = step('object', { action: 'add', fields: { type: 'chest', in: 'tavern', items: [{ name: 'wheat', qty: 2 }] } }); assert.ok(r.result.ok); assert.equal(r.result.index, 0);
  assert.match(step('object', { action: 'add', fields: { type: 'spaceship', in: 'tavern' } }).result.error, /no object type/);
  assert.match(step('object', { action: 'add', fields: { type: 'barrel' } }).result.error, /place/);
  assert.ok(step('object', { action: 'update', index: 0, fields: { gold: 5 } }).result.ok); assert.equal(s.objects[0].gold, 5);
  assert.match(step('object', { action: 'remove', index: 9 }).result.error, /index/);
});
t('plan: relations to squares on the built map (plan-core)', () => {
  const pre = step('plan', { plan: { verb: 'wall', around: 'tavern', gate: { toward: 'road' } }, as: 'preview' });
  assert.ok(pre.result.ok && pre.result.squares > 10 && pre.result.gate, JSON.stringify(pre.result).slice(0, 200)); assert.equal(pre.changed, false);
  const n0 = (s.objects || []).length, o = step('plan', { plan: { verb: 'fence', around: 'tavern', gate: 'none' }, as: 'objects' });
  assert.ok(o.result.ok, JSON.stringify(o.result)); assert.ok(s.objects.length > n0 + 8 && s.objects.slice(n0).every(x => x.type === 'fence'));
  const d = step('plan', { plan: { verb: 'stockpile', near: 'square', side: 'any', w: 3, h: 2 }, who: 'labourer', priority: 4 });
  assert.ok(d.result.ok, JSON.stringify(d.result)); assert.equal(s.designations.at(-1).verb, 'stockpile'); assert.equal(s.designations.at(-1).priority, 4);
  assert.match(step('plan', { plan: { verb: 'wall', around: 'castle' } }).result.error, /unknown place/);
  assert.match(step('plan', { plan: { verb: 'dig', near: 'tavern' }, as: 'objects' }).result.error, /walls or fences/);
  s.objects = s.objects.slice(0, n0); delete s.designations;
});
t('place add/style/remove', () => {
  assert.ok(step('place', { action: 'add', place: 'temple' }).result.ok); assert.ok(s.generate.places.includes('temple'));
  const r = step('place', { action: 'style', place: 'tavern', building: { style: 'stone_timber', roof: 'thatch', storeys: 2 } }); assert.ok(r.result.ok, JSON.stringify(r.result)); assert.equal(s.generate.houses.tavern.roof, 'thatch');
  assert.match(step('place', { action: 'style', place: 'tavern', building: { roof: 'gold' } }).result.error, /roof/);
  assert.ok(step('place', { action: 'remove', place: 'temple' }).result.ok); assert.ok(!s.generate.places.includes('temple'));
});
t('events', () => { step('event', { action: 'add', event: 'A rat runs across the floor.' }); step('event', { action: 'add', event: { text: 'The bell rings!', round: 8 } }); assert.equal(s.events.length, 2); assert.match(step('event', { action: 'add', event: {} }).result.error, /event/); });
t('preview', () => { const r = step('preview', {}); assert.ok(r.result.preview.places.some(p => /tavern .*mara/.test(p)), JSON.stringify(r.result.preview.places)); assert.equal(r.changed, false); });
t('get_scenario / get_catalog', () => { assert.ok(step('get_scenario', {}).result.summary.characters[0].startsWith('mara')); assert.equal(step('get_scenario', { part: 'mara' }).result.character.id, 'mara'); assert.ok(step('get_catalog', { what: 'jobs' }).result.jobs.includes('baker')); assert.ok(step('get_catalog', { what: 'bodies' }).result.bodies.animals.includes('cow')); });
t('validate', () => { const r = step('validate', {}); assert.ok(Array.isArray(r.result.problems)); });
t('finish with problems, then fixed', () => {
  const bad = runTool({ agents: [] }, 'finish', { summary: 'x' }, { fresh: true, prompt: 'a village' }); assert.equal(bad.result.ok, false); assert.ok(bad.result.problems.length); assert.ok(!bad.done);
  step('set_meta', { fields: { intro: 'Ashford holds through the winter.', goal: { text: 'Survive two nights.', win: { survived_days: 2 } } } });
  const r = runTool(s, 'finish', { summary: 'A village.' }, { fresh: true, prompt: 'a small village with a baker' });
  assert.ok(r.done, JSON.stringify(r.result)); assert.ok(r.done.code.length > 50);
});
t('sections', () => { assert.ok(step('section', { action: 'add', key: 'cellar', title: 'The Cellar', generate: { kind: 'dungeon', rooms: 4 }, agents: [{ id: 'rat1', model: 'rat' }] }).result.ok); assert.ok(step('section', { action: 'link', link: { in: 'tavern', to: 'cellar', kind: 'stairs_down' } }).result.ok); assert.ok(step('section', { action: 'remove', key: 'cellar' }).result.ok); assert.equal(s.links, undefined); });
t('unknown tool', () => { assert.match(step('fly', {}).result.error, /no tool/); });
t('the given scenario is not changed', () => { const before = JSON.stringify(s); runTool(s, 'character', { action: 'add', id: 'zed', fields: { model: 'farmer', personality: 'Zed.' } }); assert.equal(JSON.stringify(s), before); });

// ---- worlds in sections (plan_sections, "section" on the map tools, the whole world checked) ----
const PLAN3 = { shape: 'region', title: 'Ashford', goal: { text: 'Kill the wolf queen.', win: { agent_defeated: 'queen' }, lose: { player_defeated: true } }, sections: [
  { key: 'ashford', title: 'Ashford', kind: 'village', who: [{ id: 'mara', model: 'peasant_woman', job: 'baker' }], links: [{ to: 'wood', way: 'edge' }] },
  { key: 'wood', title: 'The Old Wood', kind: 'forest', who: [{ id: 'tom', model: 'woodsman', job: 'woodcutter' }], links: [{ to: 'den', way: 'cave' }] },
  { key: 'den', title: 'Wolf Den', kind: 'cave', light: 'night', who: [{ id: 'queen', model: 'wolf', hostile: true }] }] };
const WCTX = { fresh: true, prompt: 'a village, the old wood beyond it and a wolf den' };
let w = {};
const ws = (name, args, ctx = WCTX) => { const r = runTool(w, name, args, ctx); if (r.changed) w = r.scenario; return r; };
t('plan_sections lays out the sections, their maps and the ways', () => {
  assert.match(ws('plan_sections', { sections: [{ key: 'a', kind: 'village' }] }).result.error, /2-5/);
  const r = ws('plan_sections', PLAN3);
  assert.ok(r.result.ok, JSON.stringify(r.result)); assert.equal(w.generate.kind, 'village'); assert.deepEqual(Object.keys(w.subworlds), ['wood', 'den']);
  assert.equal(w.subworlds.wood.generate.kind, 'forest'); assert.equal(w.subworlds.den.generate.kind, 'cave'); assert.equal(w.subworlds.den.lighting, 'night');
  assert.ok(w.links.some(l => l.to === 'wood' && l.edge), JSON.stringify(w.links)); assert.ok(w.subworlds.wood.links.some(l => l.to === 'den' && l.in && l.kind === 'cave'), JSON.stringify(w.subworlds.wood.links));
  assert.equal(r.result.sections[0].section, 'top'); assert.equal(r.result.sections[2].add[0].id, 'queen'); assert.match(r.result.next, /section/);
  assert.match(r.log, /planned 3 sections/); assert.equal(w.goal.win.agent_defeated, 'queen');
});
t('map tools take "section"; ids unique across the world; world fields only on the top', () => {
  assert.ok(ws('character', { action: 'add', id: 'mara', section: 'top', fields: { model: 'peasant_woman', job: 'baker', home: 'house', workplace: 'tavern', personality: 'Mara bakes. She wants flour. She thinks Tom idles.' } }).result.ok);
  const r = ws('character', { action: 'add', id: 'tom', section: 'wood', fields: { model: 'woodsman', job: 'woodcutter', personality: 'Tom cuts wood. He wants quiet.' } });
  assert.ok(r.result.ok, JSON.stringify(r.result)); assert.match(r.log, /^\[The Old Wood\] added character tom/); assert.equal(w.subworlds.wood.agents[0].id, 'tom'); assert.ok(!w.agents.some(a => a.id === 'tom'));
  assert.match(ws('character', { action: 'add', id: 'mara', section: 'den', fields: { model: 'wolf' } }).result.error, /already a character in the top map/);
  assert.match(ws('character', { action: 'add', id: 'tom', fields: { model: 'farmer', personality: 'x' } }).result.error, /section "wood"/);
  assert.match(ws('character', { action: 'add', id: 'x', section: 'moon', fields: { model: 'wolf' } }).result.error, /no section "moon".*wood/);
  assert.ok(ws('character', { action: 'add', id: 'queen', section: 'Wolf Den', fields: { model: 'wolf', hostile: true } }).result.ok);   // by its title
  assert.match(ws('set_meta', { section: 'wood', fields: { goal: { text: 'x' }, time: '07:00' } }).result.error, /the whole world/);
  assert.ok(ws('set_meta', { section: 'wood', fields: { subtitle: 'Old trees.' } }).result.ok); assert.equal(w.subworlds.wood.subtitle, 'Old trees.');
  assert.ok(ws('object', { action: 'add', section: 'den', fields: { type: 'chest', in: 'treasure', items: ['silver key'] } }).result.ok); assert.equal(w.subworlds.den.objects.length, 1);
  assert.match(ws('object', { action: 'add', section: 'den', fields: { type: 'chest', in: 'tavern' } }).result.error, /no place "tavern" in a cave/);
  assert.ok(ws('character', { action: 'update', id: 'tom', section: 'wood', fields: { secret: 'He saw the queen.' } }).result.ok);
  assert.equal(ws('get_scenario', { section: 'wood', part: 'agents' }).result.agents[0].id, 'tom');
  assert.ok(ws('get_scenario', {}).result.summary.sections.some(x => /^den .*queen/.test(x)));
});
t('preview and validate the whole world; one section alone', () => {
  const p = ws('preview', {}).result.preview; assert.equal(p.sections.length, 3); assert.ok(p.sections[1].ways[0].includes('den')); assert.match(p.report.join(' '), /3 reachable/);
  const one = ws('preview', { section: 'wood' }).result.preview; assert.ok(one.places.length && one.ways.length, JSON.stringify(one).slice(0, 300));
  const v = ws('validate', {}); assert.deepEqual(v.result.problems, []); assert.match(v.result.report.join(' '), /the goal needs queen: in Wolf Den/);
  assert.ok(Array.isArray(ws('validate', { section: 'den' }).result.problems));
});
t('section link: checked both ways, from any section', () => {
  // an edge into a cave: no walkable rim to arrive on, so it becomes a cave mouth (checkWorld's repair)
  const w0 = w, edge = ws('section', { action: 'link', from: 'top', link: { edge: 'west', to: 'den' } }); assert.ok(edge.result.ok, JSON.stringify(edge.result)); assert.match(edge.result.repairs.join(' '), /cave mouth/);
  assert.ok(w.links.some(l => l.to === 'den' && l.in && l.kind === 'cave')); w = w0;
  assert.match(ws('section', { action: 'link', link: { in: 'throne', to: 'den' } }).result.error, /no place "throne"/);
  assert.match(ws('section', { action: 'link', from: 'nowhere', link: { in: 'x', to: 'den' } }).result.error, /from/);
  const n0 = (w.subworlds.den.links || []).length, ok = ws('section', { action: 'link', from: 'den', link: { in: 'lair', to: 'wood', kind: 'stairs_up', name: 'up to the wood' } });
  assert.ok(ok.result.ok, JSON.stringify(ok.result)); assert.equal(w.subworlds.den.links.length, n0 + 1);
  w.subworlds.den.links.pop(); if (!w.subworlds.den.links.length) delete w.subworlds.den.links;
});
t('section add takes a planner kind (mine, crypt)', () => { const r = runTool(w, 'section', { action: 'add', key: 'mine', title: 'The Mine', kind: 'mine' }); assert.ok(r.result.ok, JSON.stringify(r.result)); assert.equal(r.scenario.subworlds.mine.generate.kind, 'cave'); assert.equal(r.scenario.subworlds.mine.generate.style, 'mine'); });
t('finish a world in sections: every section checked, one link code', () => {
  const r = ws('finish', { summary: 'Three maps.' });
  assert.ok(r.done, JSON.stringify(r.result)); assert.ok(r.done.scenario.subworlds.den.agents.length); assert.ok(r.done.scenario.live); assert.ok(r.done.code.length > 200); assert.ok(r.done.report.length);
  // a section nobody can reach, an id twice: problems for the model
  const x = JSON.parse(JSON.stringify(w)); x.subworlds.lost = { title: 'Lost', generate: { kind: 'forest' }, agents: [{ id: 'mara', model: 'farmer', personality: 'Again.' }] };
  const f = runTool(x, 'finish', { summary: 'x' }, WCTX); assert.ok(!f.done); const ps = f.result.problems.join(' | ');
  assert.match(ps, /Lost: no way leads there/); assert.match(ps, /"mara" is in the top map and in section "lost"/);
  // the page's last resort repairs both
  const a = runTool(x, 'finish', { summary: 'x' }, { ...WCTX, auto: true }); assert.ok(a.done, JSON.stringify(a.result)); assert.ok(a.done.auto.length, JSON.stringify(a.done.auto));
});
t('finish auto: an empty or broken world is completed by code', () => {
  const r = runTool({}, 'finish', { summary: 'x' }, { fresh: true, prompt: 'a spooky forest camp', auto: true });
  assert.ok(r.done, JSON.stringify(r.result)); assert.equal(r.done.scenario.generate.kind, 'forest'); assert.ok(r.done.scenario.agents.length); assert.match(r.done.auto.join(' '), /forest map/);
  const b = runTool({ generate: { kind: 'village' }, agents: [{ id: 'bo b', model: 'robot', allowed: ['fly'] }], goal: { text: 'x', win: { agent_near: ['ghost', 'square', 2] } } }, 'finish', { summary: 'x' }, { fresh: true, prompt: 'a village', auto: true });
  assert.ok(b.done, JSON.stringify(b.result)); assert.equal(b.done.scenario.agents[0].id, 'bo_b'); assert.equal(b.done.scenario.agents[0].model, 'villager');
});
t('agent requests: sections asked for, a review round', () => {
  assert.match(agentUser('a big world', { sections: 3, shape: 'levels' }), /3 sections \(levels.*plan_sections first/);
  assert.ok(!/sections/.test(agentUser('a village')));
  const r = agentRequest({ review: { round: 2, rounds: 3, history: ['added a well'] } }, { skill: 'x', voices: 'y' }); assert.match(r.user, /Review round 2 of 3/); assert.match(r.user, /GOOD:/); assert.match(r.user, /added a well/); assert.ok(!r.system);
  assert.match(reviewUser(1, 1), /preview/);
  const tr = toolRequest({ scenario: {}, name: 'finish', args: { summary: 'x' }, prompt: 'a cave', fresh: true }, { packVoices: [] }); assert.ok(tr.problems?.length && !tr.done);
  assert.ok(toolRequest({ scenario: {}, name: 'finish', args: { summary: 'x' }, prompt: 'a cave', fresh: true, auto: true }, { packVoices: [] }).done.link.startsWith('/app/#s='));
  assert.match(agentSystem('Answer with ONE JSON object and nothing else\n(no prose, no markdown fences). Be quick: keep it compact.', 'v'), /plan_sections first/);
});

// ---- the loop: going round in circles, recovery, every run ends with a world or a message ----
// fetch routed to the tool and agent handlers (as the server does), a scripted model
globalThis.fetch = async (url, o) => {
  const b = JSON.parse(o.body), r = url.includes('/api/worldgen/agent') ? agentRequest(b, { skill: 'Answer with ONE JSON object and nothing else\n(no prose, no markdown fences). Be quick: keep it compact.', voices: 'v' })
    : url.includes('/api/worldgen/tool') ? toolRequest(b, { packVoices: [] }) : url.includes('/api/finish') ? { scenario: b.scenario, code: 'c', link: '/app/#s=c' } : { error: 'no route' };
  return { ok: !r.error, status: r.status || 200, json: async () => r };
};
const scripted = (steps, seen) => ({ name: 'mock', kind: 'local', context: 32768, async step(messages) { seen?.push(messages[messages.length - 1]); const s = steps.shift(); if (s instanceof Error) throw s; if (!s) return { text: 'I am done.', calls: [], usage: {} }; return { text: '', calls: s.map((c, i) => ({ id: 'c' + Math.random(), name: c[0], args: c[1] || {} })), usage: {} }; } });
const runBuild = (prompt, backend, opts) => new Promise(res => A.build(prompt, backend, (ev, d) => { if (ev !== 'progress') res({ ev, d }); }, opts));
const MAP = ['set_map', { method: 'generate', kind: 'village', buildings: 5 }];
t('loop: set_map over and over is caught, the model told, the world completed', async () => {
  const seen = [], r = await runBuild('a quiet village', scripted(Array.from({ length: 12 }, () => [MAP]), seen));
  assert.equal(r.ev, 'done', JSON.stringify(r.d).slice(0, 300));
  const tellings = seen.filter(m => m.role === 'user' && /going round in circles/.test(m.content));
  assert.ok(tellings.length >= 1, 'recovery message'); assert.match(tellings[0].content, /Next: add the characters/);
  assert.ok(seen.some(m => m.role === 'tool' && /already done/.test(m.content)), 'a repeated change answered without running');
  assert.ok(r.d.log.some(l => /going round in circles/.test(l))); assert.ok(r.d.scenario.agents.length, 'a world with someone in it'); assert.match(r.d.summary, /code completed/);
  assert.ok(r.d.ended);
});
t('loop: a tool failing three times running gets a recovery note', async () => {
  const bad = ['character', { action: 'add', id: 'x', fields: { model: 'robot', personality: 'x' } }], seen = [];
  const r = await runBuild('a village', scripted([[MAP], [bad], [['character', { action: 'add', id: 'y', fields: { model: 'robot2', personality: 'y' } }]], [['character', { action: 'add', id: 'z', fields: { model: 'robot3', personality: 'z' } }]],
    [['character', { action: 'add', id: 'mara', fields: { model: 'peasant_woman', personality: 'Mara bakes.' } }]], [['finish', { summary: 'ok' }]]], seen));
  assert.equal(r.ev, 'done', JSON.stringify(r.d).slice(0, 300)); assert.ok(seen.some(m => m.role === 'user' && /failed 3 times running/.test(m.content)));
  assert.ok(!r.d.ended, 'finished by the model itself');
});
t('loop: a model that never calls a tool ends with a plain message (and noTools for the fallback)', async () => {
  const r = await runBuild('a village', scripted([]));
  assert.equal(r.ev, 'failed'); assert.match(r.d.error, /before building anything/); assert.equal(r.d.noTools, true);
});
t('loop: a model that fails mid-run still leaves a world', async () => {
  const r = await runBuild('a village', scripted([[MAP], [['character', { action: 'add', id: 'mara', fields: { model: 'peasant_woman', personality: 'Mara bakes.' } }]], new Error('HTTP 500 upstream')]));
  assert.equal(r.ev, 'done', JSON.stringify(r.d).slice(0, 300)); assert.match(r.d.ended, /failed at step 3/);
  const r2 = await runBuild('a village', scripted([new Error('400 tools are not supported')])); assert.equal(r2.ev, 'failed'); assert.ok(A.toolsRefused(r2.d.error));
});
t('loop: a world in sections end to end with a scripted model', async () => {
  const add = (id, section, f) => ['character', { action: 'add', id, section, fields: f }];
  const r = await runBuild('a village, the old wood and a wolf den', scripted([[['plan_sections', PLAN3]],
    [add('mara', 'top', { model: 'peasant_woman', job: 'baker', personality: 'Mara bakes.' }), add('tom', 'wood', { model: 'woodsman', personality: 'Tom cuts wood.' }), add('queen', 'den', { model: 'wolf', hostile: true })],
    [['preview'], ['validate']], [['finish', { summary: 'Three maps.' }]]]), { sections: 3, shape: 'region' });
  assert.equal(r.ev, 'done', JSON.stringify(r.d).slice(0, 400)); assert.deepEqual(Object.keys(r.d.scenario.subworlds), ['wood', 'den']); assert.equal(A.session.messages[1].content.includes('plan_sections first'), true);
});
t('loop: a review round in the same session', async () => {
  const seen = [];
  const r = await new Promise(res => A.change(A.session.scenario, '', (ev, d) => { if (ev !== 'progress') res({ ev, d }); }, scripted([[['preview'], ['validate']], [['finish', { summary: 'GOOD: nothing to change.' }]]], seen), { review: { round: 1, rounds: 2, history: [] } }));
  assert.equal(r.ev, 'done', JSON.stringify(r.d).slice(0, 300)); assert.match(r.d.summary, /^GOOD/); assert.match(A.session.messages[1].content, /Review round 1 of 2/);
});
t('watch(): the patterns', () => {
  const S = c => ({ calls: c.map(([name, sig, ok = true]) => ({ name, sig: sig ?? name, ok })), idle: 0 });
  assert.match(A.watch(S([['set_map', 'a'], ['preview'], ['set_map', 'a'], ['set_map', 'a']])), /same arguments 3 times/);
  assert.match(A.watch(S([['set_map', 'a'], ['set_map', 'b'], ['set_map', 'c'], ['set_map', 'd']])), /set_map 4 times running/);
  assert.equal(A.watch(S([['character', 'a'], ['character', 'b'], ['character', 'c'], ['character', 'd']])), null);
  assert.match(A.watch({ ...S([['preview']]), idle: 6 }), /6 steps without a change/);
  assert.match(A.nextStep({ scenario: { generate: { kind: 'village' }, agents: [{ id: 'a' }], subworlds: { cave: { agents: [] } } } }), /section cave/);
});
t('canAgent: the server own model by what the provider says', () => {
  assert.equal(A.canAgent('cloud', { tools: true }).dflt, true); assert.equal(A.canAgent('cloud', { tools: false }).ok, false);
  const u = A.canAgent('server', { tools: null }); assert.ok(u.ok && !u.dflt);
});

// ---- tool calls written by in-browser models (their chat templates' formats) ----
const P = (text, f) => A.parseToolCalls(text, f);
t('qwen 3.5 XML (Bonsai 2.5, SenseNova)', () => {
  const c = P('I will add the baker.\n\n<tool_call>\n<function=character>\n<parameter=action>\nadd\n</parameter>\n<parameter=id>\nmara\n</parameter>\n<parameter=fields>\n{"model": "peasant_woman", "job": "baker", "personality": "Mara bakes."}\n</parameter>\n</function>\n</tool_call>', 'qwen-xml');
  assert.equal(c.calls.length, 1); assert.equal(c.calls[0].name, 'character'); assert.equal(c.calls[0].args.fields.job, 'baker'); assert.equal(c.calls[0].args.action, 'add'); assert.equal(c.text, 'I will add the baker.');
});
t('qwen XML: two calls, a number, a cut-off end', () => {
  const c = P('<tool_call>\n<function=set_map>\n<parameter=method>\ngenerate\n</parameter>\n<parameter=kind>\nvillage\n</parameter>\n<parameter=buildings>\n6\n</parameter>\n</function>\n</tool_call>\n<tool_call>\n<function=preview>\n</function>\n</tool_call>\n<tool_call>\n<function=validate>', 'qwen-xml');
  assert.deepEqual(c.calls.map(x => x.name), ['set_map', 'preview', 'validate']); assert.equal(c.calls[0].args.buildings, 6);
});
t('qwen JSON inside tool_call (Qwen 2.5/3 style)', () => {
  const c = P('<tool_call>\n{"name": "set_meta", "arguments": {"fields": {"title": "Ashford"}}}\n</tool_call>', 'qwen-xml');
  assert.equal(c.calls[0].name, 'set_meta'); assert.equal(c.calls[0].args.fields.title, 'Ashford');
});
t('JSON with a fence, trailing comma, no tags', () => {
  const c = P('```json\n{"name": "finish", "arguments": {"summary": "Done.",}}\n```', 'qwen-xml');
  assert.equal(c.calls[0].name, 'finish'); assert.equal(c.calls[0].args.summary, 'Done.');
});
t('Inkling: native invoke blocks', () => {
  const c = P('character<|content_invoke_tool_json|>{"name":"character","args":{"action":"add","fields":{"model":"guard","personality":"Hector."},"id":"hector"}}', 'inkling');
  assert.equal(c.calls[0].name, 'character'); assert.equal(c.calls[0].args.id, 'hector');
  const d = P('<|message_model|>preview<|content_invoke_tool_json|>{"name":"preview","args":{}}<|end_message|><|message_model|>validate<|content_invoke_tool_json|>{"name":"validate","args":{}}<|end_message|>', 'inkling');
  assert.deepEqual(d.calls.map(x => x.name), ['preview', 'validate']);
  const e = P('<|content_text|>All done, the village stands.', 'inkling'); assert.equal(e.calls.length, 0); assert.equal(e.text, 'All done, the village stands.');
});
t('Bonsai 2.5 in the browser (the engine tool_call events written back as text; recorded 2026-11-27)', () => {
  const c = P('\n<tool_call>\n<function=set_meta>\n<parameter=fields>\n{"title": "Tiny Village with a Baker", "lighting": "bright", "dayMinutes": 1440}\n</parameter>\n</function>\n</tool_call>\n<tool_call>\n<function=set_map>\n<parameter=method>\ngenerate\n</parameter>\n<parameter=kind>\nvillage\n</parameter>\n<parameter=buildings>\n5\n</parameter>\n<parameter=places>\n["tavern", "house", "baker"]\n</parameter>\n<parameter=size>\n[10, 10]\n</parameter>\n</function>\n</tool_call>', 'qwen-xml');
  assert.deepEqual(c.calls.map(x => x.name), ['set_meta', 'set_map']); assert.equal(c.calls[0].args.fields.title, 'Tiny Village with a Baker'); assert.equal(c.calls[1].args.buildings, 5); assert.deepEqual(c.calls[1].args.size, [10, 10]); assert.deepEqual(c.calls[1].args.places, ['tavern', 'house', 'baker']);
});
t('no call in plain text', () => { assert.equal(P('Sure! I will build it now.', 'qwen-xml').calls.length, 0); });
t('unknown tool names are kept for the loop to answer', () => { assert.equal(P('<tool_call>\n<function=fly>\n</function>\n</tool_call>', 'qwen-xml').calls[0].name, 'fly'); });
t('rendering: qwen prompt has the tool list and the history', () => {
  const msgs = A.renderMessages([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'build' }, { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'preview', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' }], TOOLS, 'qwen-xml');
  assert.match(msgs[0].content, /<tools>/); assert.match(msgs[0].content, /<function=example_function_name>/);
  assert.match(msgs[2].content, /<tool_call>\n<function=preview>/); assert.equal(msgs[3].role, 'user'); assert.match(msgs[3].content, /<tool_response>\n\{"ok":true\}\n<\/tool_response>/);
});
t('rendering: inkling raw prompt', () => {
  const p = A.inklingPrompt([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'build' }, { role: 'assistant', content: '', tool_calls: [{ id: 'c1', function: { name: 'preview', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: 'R' }], TOOLS);
  assert.ok(p.startsWith('<|message_system|>tool_declare<|content_xml|>[')); assert.match(p, /<\|message_model\|>preview<\|content_invoke_tool_json\|>\{"name":"preview","args":\{\}\}<\|end_message\|><\|content_model_end_sampling\|>/);
  assert.match(p, /<\|message_tool\|>preview<\|content_text\|>R<\|end_message\|>/); assert.ok(p.endsWith('<|message_model|>'));
});
t('rendering: inkling keeps the model own words (prefix cache)', () => {
  const raw = 'preview<|content_invoke_tool_json|>{"name": "preview", "args": {}}';
  const p = A.inklingPrompt([{ role: 'user', content: 'build' }, { role: 'assistant', content: '', raw, tool_calls: [{ id: 'c1', function: { name: 'preview', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c1', content: 'R' }], TOOLS);
  assert.ok(p.includes('<|message_model|>' + raw + '<|end_message|><|content_model_end_sampling|><|message_tool|>preview<|content_text|>R'));
});
t('mode defaults per model', () => {
  assert.equal(A.canAgent('bonsai2-27b').ok, true); assert.equal(A.canAgent('inkling2-mini-wllama').ok, true); assert.equal(A.canAgent('sensenova-loop-9b-wllama').ok, true);
  assert.equal(A.canAgent('gemma4-e2b-litert').ok, false); assert.equal(A.canAgent('raon1-nano-litert').ok, false);
});
t('compaction keeps the start and the recent turns', () => {
  const m = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }];
  for (let i = 0; i < 40; i++) m.push({ role: 'assistant', content: '', tool_calls: [{ id: 'c' + i, function: { name: 'preview', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c' + i, content: 'x'.repeat(2000) });
  const out = A.compact(m, ['added a', 'added b'], 6000);
  assert.equal(out[0].role, 'system'); assert.equal(out[1].content, 'U'); assert.match(out[2].content, /added a/); assert.ok(JSON.stringify(out).length < JSON.stringify(m).length / 3);
  assert.notEqual(out[3].role, 'tool');   // never starts on a tool result without its call
});

for (const [name, f] of later) { n++; try { await f(); } catch (e) { failed++; console.log('FAIL', name, '\n ', e.message); } }
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
