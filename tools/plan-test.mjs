// plan-test.mjs: the plan language (app/plan-core.js) without a game or a model.
//   node tools/plan-test.mjs
// 1. every spatial-eval task's gold relation, through plan-core's resolver, passes
//    the benchmark's own scorer (tools/spatial-eval/geom.mjs score);
// 2. validation drops squares on buildings and water and keeps reachable ones;
// 3. words -> plan by code (no model) on the benchmark's commands: the verb, the
//    places, the numbers and the sides, and "which side?" when the words are unclear;
// 4. merge: a small brain's side never overrides the words.
import fs from 'node:fs';
import path from 'node:path';
import '../app/plan-core.js';
import { buildMaps } from './spatial-eval/maps.mjs';
import { ctx as gctx, score } from './spatial-eval/geom.mjs';
const P = globalThis.TablefolkPlanCore;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const maps = Object.fromEntries(buildMaps().map(m => [m.id, m]));
const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/spatial-eval/tasks.json'), 'utf8'));
const VERB = { wall: 'wall', posts: 'guard', path: 'patrol' };
const verbOf = t => VERB[t.answer] || (t.gold.under ? 'dig' : t.answer === 'area' ? 'mark' : 'stockpile');
// 1. gold
let gold = 0;
for (const t of tasks) {
  const r = P.resolve({ verb: verbOf(t), ...t.gold }, maps[t.map]);
  const planForScore = r.shape === 'ring' ? { wall: r.cells, gate: r.gate } : r.shape === 'posts' ? { posts: r.posts } : r.shape === 'path' ? { path: r.path } : { cells: r.cells, rect: r.rect };
  const s = score(t, r.error ? { error: r.error } : planForScore, gctx(maps[t.map]));
  if (s.pass) gold++; else console.log('gold FAIL', t.id, r.error || JSON.stringify(s.checks));
}
ok(gold === tasks.length, `gold relations ${gold}/${tasks.length}`);
console.log(`gold relations through plan-core: ${gold}/${tasks.length}`);
// 2. validation
{
  const m = maps.riverford;
  const r = P.plan({ verb: 'wall', around: 'field', gate: 'north' }, m);
  ok(r.ok && r.cells.length > 20, 'riverford: wall around the field resolves');
  ok(r.cells.every(([x, y]) => !'#oH~'.includes(m.rows[y][x])), 'validated wall stays off buildings and water');
  const v = P.validate({ verb: 'stockpile', shape: 'rect', cells: [[15, 5], [6, 5], [0, 0]] }, m, {});   // water, inside the inn, open ground
  ok(v.cells.length === 1 && v.dropped.length === 2, 'validate drops water and a building: ' + JSON.stringify(v.dropped.map(d => d.why)));
  const u = P.plan({ verb: 'dig', under: 'inn', w: 2, h: 2 }, m);
  ok(u.ok && u.cells.length === 4 && u.cells.every(([x, y]) => m.rows[y][x] === 'o'), 'dig under the inn: 4 squares inside');
  const bt = P.plan({ verb: 'fence', between: ['smithy', 'house'] }, m);
  ok(!bt.error, 'a fence between two places: ' + (bt.error || bt.cells.length + ' squares'));
  const bad = P.plan({ verb: 'wall', around: 'castle' }, m);
  ok(bad.error && /unknown place/.test(bad.error), 'an unknown place fails plainly: ' + bad.error);
}
// 3. words by code
const W = (text, map, want, extra) => {
  const r = P.parseWords(text, maps[map].places, extra);
  for (const [k, v] of Object.entries(want)) ok(JSON.stringify(k === 'ask' ? r.ask : k === 'verb' ? r.verb : r.plan[k]) === JSON.stringify(v), `words "${text}": ${k} = ${JSON.stringify(k === 'ask' ? r.ask : k === 'verb' ? r.verb : r.plan[k])}, want ${JSON.stringify(v)}`);
  return r;
};
W('Build a wall around the garden, with a gate on the side toward the east road.', 'village23', { verb: 'wall', around: 'garden', gate: { toward: 'east road' } });
W('Wall in the temple, gate on the north side', 'hearthvale', { verb: 'wall', around: 'temple', gate: 'north' });
W('Mark out a 4 by 3 stockpile on open ground next to the smithy.', 'village23', { verb: 'stockpile', near: 'smithy', w: 4, h: 3, side: 'any' });
W('Post 3 guards along the north road.', 'village23', { verb: 'guard', at: 'north road', n: 3 });
W('Dig a 2 by 2 cellar under the tavern.', 'village23', { verb: 'dig', under: 'tavern', w: 2, h: 2 });
W('Give the watch a patrol route from the guardhouse to the alchemist by way of the square, keeping to the roads.', 'village23', { verb: 'patrol', from: 'guardhouse', to: 'alchemist', via: ['square'], prefer: 'road' });
W('Put a woodpile 4 by 2 north of the library', 'hearthvale', { verb: 'stockpile', near: 'library', side: 'north' });
W('dig a pit behind the smithy', 'riverford', { verb: 'dig', ask: 'side' });
W('two guards on the east bank of the bridge', 'riverford', { verb: 'guard', at: 'bridge', n: 2, side: 'east' });
W('fence between the smithy and the house', 'riverford', { verb: 'fence', between: ['smithy', 'house'] });
W('plant a shrine garden by the inn', 'riverford', { verb: 'shrine_plot', near: 'inn' }, { verbs: { shrine_plot: { label: 'shrine garden', shape: 'rect' } } });
// every gold-able command by code alone resolves (no model): the floor for every brain
let byCode = 0, passCode = 0; const asked = [];
for (const t of tasks) {
  const r = P.parseWords(t.say, maps[t.map].places); if (!r.verb || r.ask) { asked.push(t.id + (r.ask ? ' (asks ' + r.ask + ')' : ' (no verb)')); continue; }
  const res = P.resolve(r.plan, maps[t.map]); if (res.error) { asked.push(t.id + ': ' + res.error); continue; } byCode++;
  const pl = res.shape === 'ring' || res.shape === 'line' ? { wall: res.cells, gate: res.gate } : res.shape === 'posts' ? { posts: res.posts } : res.shape === 'path' ? { path: res.path } : { cells: res.cells, rect: res.rect };
  try { if (score(t, { cells: res.cells || [], rect: res.rect || [0, 0, 0, 0], ...pl }, gctx(maps[t.map])).pass) passCode++; } catch {}
}
console.log(`words by code alone (no model): ${byCode}/${tasks.length} resolve, ${passCode}/${tasks.length} pass the benchmark's checks; not resolved: ${asked.join(', ')}`);
// 4. merge
{
  const c = P.parseWords('dig a pit north of the smithy', maps.riverford.places).plan;
  const m = P.merge(c, { verb: 'dig', near: 'smithy', side: 'south', w: 3, h: 2 }, { small: true, places: maps.riverford.places });
  ok(m.side === 'north' && m.w === 3, 'small brain: the words keep the side, the model gives the size');
  const m2 = P.merge({ verb: 'wall' }, { verb: 'wall', around: 'castle of doom' }, { places: maps.riverford.places });
  ok(!m2.around, 'an unknown place from the model is dropped');
  ok(P.parseAnswer('```json\n{"verb":"wall","around":"inn"}\n```').around === 'inn', 'parseAnswer reads fenced JSON');
}
// 5. a scenario as a map (the world builder's agent)
{
  const scn = JSON.parse(fs.readFileSync(path.join(ROOT, 'scenarios/hearthvale.json'), 'utf8'));
  await import('../app/procgen.js');
  const m = P.mapFromScenario(scn, globalThis.TablefolkProcgen);
  ok(m.W > 10 && m.places.length > 4, `mapFromScenario hearthvale: ${m.W}x${m.H}, ${m.places.length} places`);
  const r = P.plan({ verb: 'wall', around: 'temple' }, m);
  ok(r.ok, 'hearthvale: wall around the temple from the scenario: ' + (r.error || r.cells.length + ' squares'));
  const b = P.toBoard(m, [0, 0]), back = P.fromBoard(m, b.x, b.z);
  ok(back[0] === 0 && back[1] === 0, 'toBoard / fromBoard round trip');
}
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
