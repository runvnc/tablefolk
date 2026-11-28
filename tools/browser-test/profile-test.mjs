// profile-test.mjs -- autonomy profiles (app/autonomy-profile.js) in Node: what a scenario may
// write, and how the character's, the world's, the player's and the brain's settings combine.
//   node tools/browser-test/profile-test.mjs
import '../../app/autonomy-profile.js';
const P = globalThis.tablefolkProfile;
let ok = 0, n = 0;
const t = (name, got, want) => { n++; const pass = JSON.stringify(got) === JSON.stringify(want); if (pass) ok++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
// normalize: what normalizeScenario keeps
t('a preset name', P.normalize('assisted'), 'assisted');
t('an unknown name', P.normalize('chaotic'), null);
t('an object', P.normalize({ preset: 'guided', danger: 'code', bogus: 1, talk: 'maybe' }), { preset: 'guided', danger: 'code' });
t('an empty object', P.normalize({ nope: true }), null);
t('a list', P.normalize(['guided']), null);
// presets keep their behaviour
t('rails: all code', Object.values(P.resolve(['rails']).domains).every(v => v === 'code'), true);
t('guided: all model', Object.values(P.resolve(['guided']).domains).every(v => v === 'model'), true);
t('free: the free loop', P.resolve(['free']).free, true);
t('assisted', P.resolve(['assisted']).domains, { activity: 'model', plan: 'model', talk: 'model', danger: 'code', needs: 'code', temper: 'model' });
t('nothing set: rails', P.resolve([null, undefined]).preset, 'rails');
// sources combine, highest first
t('character over world', P.resolve(['free', 'guided']).preset, 'free');
t('world over the player', P.resolve([null, 'assisted', 'guided']).preset, 'assisted');
t('an override on the preset below', P.resolve([{ danger: 'code' }, null, 'guided']).domains.danger, 'code');
t('... the rest from that preset', P.resolve([{ danger: 'code' }, null, 'guided']).domains.talk, 'model');
t('an object with its own preset', P.resolve([{ preset: 'guided', needs: 'code' }, 'rails']).domains, { activity: 'model', plan: 'model', talk: 'model', danger: 'model', needs: 'code', temper: 'model' });
t('the character beats a world override', P.resolve([{ danger: 'model' }, { preset: 'guided', danger: 'code' }]).domains.danger, 'model');
t('free with activity in code is not the free loop', P.resolve([{ preset: 'free', activity: 'code' }]).free, false);
// labels for Settings and Running now
t('label: a plain preset', P.resolve(['guided']).label, 'guided');
t('label: mixed', P.resolve([{ preset: 'guided', danger: 'code', needs: 'code' }]).label, 'guided (danger and needs in code)');
t('label: rails with talk by the model', P.resolve([{ preset: 'rails', talk: 'model' }]).label, 'rails (talk by the model)');
// choose(): a world's request meets the brain (agency.js resolve)
const C = o => P.choose(o);
t('no request, Auto: the brain', C({ setting: 'auto', auto: 'guided' }).label, 'guided');
t('no request, Settings', C({ setting: 'assisted', auto: 'rails' }).source, 'setting');
t('world free on a rails brain (E2B): rails', C({ world: 'free', setting: 'auto', auto: 'rails' }).preset, 'rails');
t('... says what was asked and why', C({ world: 'free', setting: 'auto', auto: 'rails' }).capped, { asked: 'free', by: 'brain' });
t('world free, player chose On rails: rails', C({ world: 'free', setting: 'rails' }).capped, { asked: 'free', by: 'setting' });
t('world free, nothing known of the brain: rails', C({ world: 'free' }).preset, 'rails');
t('world rails on a strong brain: rails, not capped', C({ world: 'rails', setting: 'auto', auto: 'free' }).capped, undefined);
t('world free on a guided brain: free', C({ world: 'free', setting: 'auto', auto: 'guided' }).free, true);
t('... the domains the check failed stay in code', C({ world: 'free', setting: 'auto', auto: { preset: 'guided', danger: 'code' } }).label, 'free (danger in code)');
t('... and are listed', C({ world: 'free', setting: 'auto', auto: { preset: 'guided', danger: 'code' } }).kept, ['danger']);
t('... unless the world names them', C({ world: { preset: 'free', danger: 'model' }, setting: 'auto', auto: { preset: 'guided', danger: 'code' } }).domains.danger, 'model');
t('world free on an assisted brain: free, danger and needs in code', C({ world: 'free', setting: 'auto', auto: { preset: 'assisted', temper: 'code' } }).label, 'free (danger and needs and temper in code)');
t('the 12 GB form on an assisted brain', C({ world: { preset: 'free', needs: 'code' }, setting: 'auto', auto: 'assisted' }).label, 'free (danger and needs in code)');
t('a chosen level adds no kept domains', C({ world: 'free', setting: 'assisted' }).label, 'free');
t('a character asks on a rails brain: capped, by the character', C({ character: 'guided', world: null, setting: 'auto', auto: 'rails' }).source, 'character');
t('a world override without a preset on a rails brain: rails', C({ world: { danger: 'model' }, setting: 'auto', auto: 'rails' }).preset, 'rails');
// Auto from the capability check (fromCheck, v4 rule): every recorded check (brains.md, "Calibrating the
// check against the days") with the level its measured hearthvale days support. v3 items: the v4 check
// swaps hunger for busy; v2 results have the first eight. [label, score/of, tokens/s, missed, want, the days]
const V3 = ['steps', 'sums', 'character', 'track', 'plan', 'mind', 'danger', 'haggle', 'shelter', 'hunger'];
const rec = (score, of, tokS, miss, extra = {}) => { const tasks = {}; for (const k of V3.slice(0, of)) tasks[k] = { ok: !miss.includes(k) }; for (const [k, v] of Object.entries(extra)) tasks[k] = v; return { score, of, tokS, tasks }; };
const RECORDED = [
  ['SenseNova-Loop-9B, Chrome, 4080 S', rec(10, 10, 24.2, []), 'guided (needs in code)', 'free day: 50 calls, 21% model-chosen, 4 hungry, judge 3.75/3.63/3.5'],
  ['SenseNova-Loop-9B, endpoint, 4090', rec(7, 10, 27.4, ['sums', 'character', 'plan']), 'guided (talk and needs in code)', 'guided: everyone fed, judge 3.5/3.88/4.13'],
  ['Inkling 2 Mini AD-IQ2_M, Chrome, 4080 S', rec(8, 10, 21, ['mind', 'danger']), 'guided (danger and needs and temper in code)', 'guided 3 hungry; free 3 hungry, half the activities by code'],
  ['Inkling 2 Mini, Chrome, 4080 (fresh)', rec(7, 10, 16, ['mind', 'danger', 'haggle']), 'guided (danger and needs and temper in code)', 'as above'],
  ['Inkling 8GB-64K, Chrome, 4080 S', rec(7, 10, 17.8, ['mind', 'danger', 'haggle']), 'guided (danger and needs and temper in code)', 'guided: 1 hungry, judge 3.88/3.63/4.38'],
  ['Inkling 2 Mini, endpoint, 4070 Ti S', rec(8, 10, 46, ['mind', 'haggle']), 'guided (temper in code)', 'guided judge 4.0/3.88/4.63, 1 hungry; free below it, 2 hungry'],
  ['Bonsai 2 27B, 4070', rec(6, 10, 25.7, ['sums', 'danger', 'haggle', 'shelter']), 'guided (danger and needs in code)', 'guided: 2 hungry, 2.7 calls a game hour'],
  ['Bonsai 2 27B, 4080', rec(8, 10, 26.7, ['steps', 'haggle']), 'guided (needs in code)', 'guided 1 hungry; free (4080 S) 2-3 hungry, judged below guided'],
  ['Bonsai 2.5 27B, 4080', rec(8, 10, 26.3, ['sums', 'danger']), 'guided (danger and needs in code)', 'guided: 1 hungry, judge 4.0/4.0/4.63'],
  ['Bonsai 2.5 27B, 4070 (items not kept)', { score: 9, of: 10, tokS: 27.8 }, 'guided (needs in code)', 'the 27B on a 4070: guided left 2 hungry; living-mode replies 16-26 s'],
  ['Bonsai 2 9B, 4090', rec(5, 10, 145.2, ['sums', 'plan', 'mind', 'danger', 'haggle']), 'assisted (temper in code)', 'assisted/Auto: everyone fed, judge 3.63-3.88/4.0-4.13'],
  ['Bonsai 2 9B, 4070 (2026-11-21)', rec(5, 10, 75.6, ['steps', 'sums', 'mind', 'danger', 'haggle']), 'assisted (temper in code)', 'Auto (assisted): everyone fed, judge 3.88/4.13/4.5'],
  ['Spark-X2.6-4B, endpoint, 4070', rec(5, 10, 123.1, ['steps', 'sums', 'mind', 'haggle', 'shelter']), 'assisted (temper in code)', 'guided: the village barely worked, 2 hungry'],
  ['Bonsai 2 27B, 4090 (v2)', rec(5, 8, 53, ['sums', 'danger', 'haggle']), 'guided (danger and needs in code)', 'guided and free both good, nobody hungry (5/8: one item above guided)'],
  ['Bonsai 2 9B, 4070 (2026-11-27)', rec(6, 10, 30.4, ['character', 'mind', 'danger', 'haggle']), 'guided (talk and danger and needs and temper in code)', 'the same day 5/10 on a 4080 S: assisted (temper); a working village either way'],
  ['Bonsai 2.5 27B, 4080 S (2026-11-27, items not kept)', { score: 7, of: 10, tokS: 42.2 }, 'guided', 'guided: 7/10 here, 9/10 on a 4070 the same day'],
  ['Gemma 4 12B, 3090 (v2)', rec(6, 8, 29.4, ['track', 'haggle']), 'guided (talk and needs in code)', 'guided: 5-7 hungry (picks 2-30 s); free unusable'],
  ['Gemma 4 E4B, 3090 (v2)', rec(6, 8, 34.3, ['track', 'haggle']), 'guided (talk and needs in code)', 'guided: works, 2 hungry'],
  ['Raon-1 nano, 4090 (v2)', rec(4, 8, 58.2, ['steps', 'sums', 'track', 'danger']), 'rails', 'guided wasted 14%, flattest'],
  ['Gemma 4 E2B, 3090 (v2)', rec(4, 8, 60, ['track', 'mind', 'danger', 'haggle']), 'rails', 'the rails design'],
];
const autoLabel = r => { const c = P.fromCheck(r); return P.resolve([P.autoValue(c)]).label; };
for (const [name, r, want] of RECORDED) t('Auto: ' + name, autoLabel(r), want);
// the v4 busy item (a turn-sized prompt): free wants it answered in 6 s; over 8 s, needs in code; failed, needs in code
const v4 = (score, tokS, busy) => rec(score, 10, tokS, [], { hunger: undefined, busy }) ;
const v4r = (score, tokS, busy) => { const r = v4(score, tokS, busy); delete r.tasks.hunger; return r; };
t('v4: 9/10, 53 tokens/s, a turn in 3.5 s: free', autoLabel(v4r(9, 53, { ok: true, ms: 3500 })), 'free');
t('v4: the same with the turn in 7 s: guided', autoLabel(v4r(9, 53, { ok: true, ms: 7000 })), 'guided');
t('v4: the same with the turn in 10 s: guided, needs in code', autoLabel(v4r(9, 53, { ok: true, ms: 10000 })), 'guided (needs in code)');
t('v4: 10/10 but 24 tokens/s: guided, needs in code', autoLabel(v4r(10, 24, { ok: true, ms: 9000 })), 'guided (needs in code)');
t('v4: fast but ate nothing while busy: free, needs in code', autoLabel(v4r(9, 60, { ok: false, ms: 3000 })), 'free (needs in code)');
t('noise: 9/10 at 42 tokens/s with no busy turn measured is not free', autoLabel({ score: 9, of: 10, tokS: 42.2 }), 'guided');
t('noise: the 9B at 5/10 and 6/10 both keep danger, needs and temper in code', [autoLabel(rec(5, 10, 98.5, ['sums', 'plan', 'mind', 'danger', 'haggle'])), autoLabel(rec(6, 10, 30.4, ['character', 'mind', 'danger', 'haggle']))].map(l => ['danger', 'needs', 'temper'].every(d => l === 'assisted (temper in code)' || l.includes(d))), [true, true]);
t('v4: the turn time is reported', P.fromCheck(v4r(9, 60, { ok: true, ms: 3040 })).turnS, 3);
console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
