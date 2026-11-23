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
console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
