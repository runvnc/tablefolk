// Headless tests for @tablefolk/script: node libs/script/test.mjs
// The expression language, the runner, triggers, and Willow Lane
// (scenarios/willow-lane.json) played through its menus and riddle with an
// in-memory host, plus validate() over every scenario in scenarios/.
import { readFileSync, readdirSync } from 'node:fs';
import { createState, createRunner, createTriggers, perform, check, parse, render, validate, itemMatches, memoryHost, visibleMenu, pickMenu } from './index.js';

let fails = 0, n = 0;
const ok = (name, cond, extra = '') => { n++; if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const throws = t => { try { parse(t); return false; } catch { return true; } };

// ---- expressions
const flags = { cat_found: true, favours: 2, paid: false };
const host0 = memoryHost({ player: { gold: 5, items: ['lost cat', { name: 'bread and butter', qty: 1 }, 'keyring'] }, chars: { bert: { inventory: { gold: 0, items: ['rusty key'] } } } });
const sc = { ...host0.scope('bert', { answer: 'Is it a kettle?', bid: '42' }), flag: k => flags[k] };
ok('flag', check('world.cat_found', sc) && !check('world.paid', sc) && check('not world.paid', sc));
ok('compare', check('world.favours >= 2', sc) && check('player.gold == 5', sc) && check('bid > 40', sc) && !check('player.gold > 5', sc));
ok('has / lacks', check('player has lost cat', sc) && check('player has cat', sc) && check('player lacks rusty key', sc) && check('me has rusty key', sc) && check('bert has key', sc));
ok('whole words: key is not keyring', !check('player has key', sc) && !itemMatches('keyring', 'key') && itemMatches('lost cat', 'cat'));
ok('quoted names with and', check('player has "bread and butter"', sc) && check('answer contains kettle and world.cat_found', sc));
ok('brackets and precedence', check('(world.paid or world.cat_found) and not world.paid', sc) && check('world.paid and world.x or world.cat_found', sc) && !check('world.paid and (world.x or world.cat_found)', sc));
ok('parse errors', throws('(world.x') && throws('world.x >=') && throws('player has') && throws('"open') && !throws('player has lost cat'));
ok('render', render('Hi {{player}}, {{player.gold}} gold, cat {{world.cat_found}}, {{me}} {{nope}}.', sc) === 'Hi Traveller, 5 gold, cat true, bert .');

// ---- Willow Lane, played with an in-memory host
const scn = JSON.parse(readFileSync(new URL('../../scenarios/willow-lane.json', import.meta.url)));
const chars = Object.fromEntries(scn.agents.map(a => [a.id, { inventory: JSON.parse(JSON.stringify(a.inventory)) }]));
const host = memoryHost({ player: JSON.parse(JSON.stringify(scn.player)), chars, playerName: 'Traveller' });
const fl = {}; const state = createState({ flags: () => fl, facts: () => scn.facts }); state.reset(scn.flags); host._state = state;
const runs = {}; const store = { get: a => runs[a] || null, set: (a, r) => { if (r) runs[a] = r; else delete runs[a]; } };
const runner = createRunner({ flows: () => scn.workflows, state, host, store });
const triggers = createTriggers({ list: () => scn.triggers || [], state, host, runner });
const last = id => host.said.filter(l => l.startsWith(id + ':')).slice(-1)[0] || '';
const menuFor = id => visibleMenu(pickMenu(scn.agents.find(a => a.id === id).menu, scn.menus, host.scope(id, {})), host.scope(id, {}));
async function choose(id, itemId) {
  const m = menuFor(id), it = m.items.find(i => i.id === itemId);
  if (!it) return { shown: false, menu: m };
  const r = await perform(it, { host, state, me: id, runner, triggers });
  if (r.started) await runner.advance(id, { until: 'wait' });
  return { shown: true, menu: m, r, next: it.menu };
}
let r = await choose('pell', 'cat');
ok('pell: no cat choice without the cat', !r.shown);
await choose('pell', 'help'); ok('pell: reply', /sheds/.test(last('pell')));
await choose('hobb', 'pie'); ok('hobb refuses', /strangers/.test(last('hobb')));
r = await choose('bert', 'cat'); ok('bert: reply, next menu', /Five gold/.test(last('bert')) && r.next === 'bert-sell');
const sell = visibleMenu(scn.menus['bert-sell'], host.scope('bert', {}));
ok('bert-sell: pay shown (gold 10)', sell.items.some(i => i.id === 'pay') && !sell.items.some(i => i.id === 'broke'));
await perform(sell.items.find(i => i.id === 'pay'), { host, state, me: 'bert', runner, triggers });
ok('bought the cat', check('player has lost cat', host.scope('bert', {})) && host.player.gold === 5);
r = await choose('pell', 'cat');
ok('cat handed over, flag set, locket given', r.shown && state.get('cat_found') === true && check('player has silver locket and pell has lost cat', host.scope('pell', {})));
ok('pell: menu follows the flag', /purring/.test(menuFor('pell').text));
ok('fact for everyone', /found Mrs\. Pell's lost cat/.test(state.facts('hobb', host.scope('hobb', {})).join(' ')) && state.facts('bert', host.scope('bert', {})).length === 1);
r = await choose('hobb', 'pie'); ok('hobb gives the pie', r.shown && check('player has blackberry pie', host.scope('hobb', {})));
ok('pie gone from the menu', !menuFor('hobb').items.some(i => i.id === 'pie'));
await choose('hobb', 'riddle'); ok('riddle asked, waits', /spout/.test(last('hobb')) && runner.active('hobb'));
host.heard.hobb = ['a teapot']; await runner.advance('hobb', { until: 'wait' }); ok('wrong answer', /Think again/.test(last('hobb')) && runner.active('hobb'));
ok('saved run keeps a step id', runs.hobb?.at === 'wait' && runs.hobb.v === 2);
host.heard.hobb = ['is it a kettle?']; await runner.advance('hobb', { until: 'wait' });
ok('right answer: flag, ends', state.get('riddle_solved') === true && /Clever/.test(last('hobb')) && !runner.active('hobb'));
await choose('hobb', 'riddle'); ok('flag remembered', /already/.test(last('hobb')));

// ---- runner details: old saves, pause, max/exit, menu steps, choosers
const flows = { t: { steps: [
  { id: 'ask', menu: 'm', save: 'pick', options: { a: 'gotA' }, other: 'odd' },
  { id: 'gotB', command: 'say("B")', end: true },
  { id: 'gotA', command: 'say("A")', end: true },
  { id: 'odd', choose: 'Which?', options: { x: 'gotA', y: 'gotB' }, by: ['model', 'default'], default: 'y' } ] } };
const h2 = memoryHost(); const st2 = createState(); h2._state = st2; const runs2 = {};
const rn = createRunner({ flows: () => flows, state: st2, host: h2, store: { get: a => runs2[a] || null, set: (a, x) => { if (x) runs2[a] = x; else delete runs2[a]; } } });
const answers = [{ item: { id: 'a' } }, { item: { id: 'b' } }, { other: true, text: 'banana' }];
h2.menu = async () => answers.shift();
rn.start('z', 't'); await rn.advance('z', { until: 'wait' }); ok('menu step: option branch', /z: A/.test(h2.said.join()));
rn.start('z', 't'); await rn.advance('z', { until: 'wait' }); ok('menu step: then/next', /z: B/.test(h2.said.slice(-1)[0]));
rn.start('z', 't'); await rn.advance('z', { until: 'wait' }); ok('menu step: other text saved, chooser falls to default', /z: B/.test(h2.said.slice(-1)[0]));
runs2.q = { name: 't', at: 2, vars: {}, visits: {} }; await rn.advance('q', { until: 'wait' }); ok('old save (an index) resumes', /q: A/.test(h2.said.slice(-1)[0]));
rn.start('p', 't'); rn.pause('p'); h2.menu = async () => ({ item: { id: 'a' } }); await rn.advance('p'); ok('paused run does not move', rn.active('p') && runs2.p.at === 'ask');
rn.resume('p'); await rn.advance('p', { until: 'wait' }); ok('resumed', !rn.active('p'));
runs2.gone = { v: 2, name: 't', at: 'renamed', vars: {}, visits: {} }; await rn.advance('gone'); ok('a step that no longer exists ends the run', !rn.active('gone'));

// ---- triggers
const h3 = memoryHost({ chars: { pell: { inventory: { items: [] } } } }); const st3 = createState(); h3._state = st3;
const tg = createTriggers({ list: () => [{ on: 'flag', flag: 'cat_found', to: true, as: 'pell', once: true, do: { reply: 'Home!', set: { cheered: true } } }, { on: 'flag', flag: 'cheered', as: 'pell', do: { reply: 'loop?' } }], state: st3, host: h3 });
st3.set('cat_found', true); await new Promise(r => setTimeout(r, 10));
st3.set('cat_found', false); st3.set('cat_found', true); await new Promise(r => setTimeout(r, 10));
ok('trigger runs once, and does not chain', h3.said.filter(l => /Home!/.test(l)).length === 1 && !h3.said.some(l => /loop/.test(l)) && st3.get('cheered') === true);

// ---- validate
const v = validate(scn); ok('willow lane validates', !v.some(x => x.level === 'error'), v.map(x => x.message).join('; '));
const bad = validate({ brain: 'none', flags: {}, menus: { m: { items: [{ id: 'x', label: 'X', if: 'world.y >=' }, { id: 'z', label: 'Z', menu: 'nope' }] } }, workflows: { w: { steps: [{ goto: 'missing' }, { id: 'lonely', choose: 'q', options: { a: 'lonely' } }] } }, triggers: [{ on: 'sometimes' }] });
ok('validate finds the mistakes', ['expected a value', 'menu "nope"', '"missing"', 'nothing leads', 'no "default"', '"on" must'].every(s => bad.some(x => x.message.includes(s))), bad.map(x => x.message).join(' | '));
let scnErrors = 0;
for (const f of readdirSync(new URL('../../scenarios/', import.meta.url)).filter(f => f.endsWith('.json') && f !== 'showcase.json')) {
  const errs = validate(JSON.parse(readFileSync(new URL('../../scenarios/' + f, import.meta.url)))).filter(x => x.level === 'error');
  if (errs.length) { scnErrors++; console.log(`  ${f}: ${errs.map(e => e.where + ': ' + e.message).join('; ')}`); }
}
ok('every scenario in scenarios/ validates without errors', scnErrors === 0);

console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
