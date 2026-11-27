// Unit tests for the world builder's agent tools (server/worldgen-tools.js) and
// the in-browser tool-call parsing (app/worldgen-agent.js), no model needed:
//   node tools/worldgen-tools-test.mjs
import assert from 'node:assert/strict';
import { runTool, TOOLS, TOOL_NAMES, agentSystem } from '../server/worldgen-tools.js';
import '../app/worldgen-agent.js';
const A = globalThis.TablefolkWorldAgent;
let n = 0, failed = 0;
const t = (name, f) => { n++; try { f(); } catch (e) { failed++; console.log('FAIL', name, '\n ', e.message); } };

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

console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
