// god-words-eval.mjs: the God game (scenarios/god-village.json) with a brain loaded: decree words
// read (code first, then the menus' matcher / the brain for words code cannot read), a prayer in a
// villager's own words, and a council where the villagers above rails speak for themselves and
// their stance is read from their words. ?autonomy=guided puts everyone above rails (a small brain
// would otherwise stay on rails). Never approves a model download: stops if the page asks for one.
//   node god-words-eval.mjs [--base=http://localhost:8000] [--model=gemma4-e2b-litert] [--wait=240]
import { chromium } from 'playwright-core';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:8000'), MODEL = arg('model', 'gemma4-e2b-litert'), WAIT = +arg('wait', 240);
const DECREES = [
  ['I require a goat sacrifice by the full moon', 'sacrifice'],
  ['the faithful must bring three bread to the temple by evening', 'offering'],
  ['everyone shall gather and pray at dawn', 'worship'],
  ['build a wall around the temple', 'work'],
  ['my people shall honour me with their finest loaves', 'offering'],
  ['I thirst for the blood of a beast from the flock', 'sacrifice'],
  ['let them bow down before me at sundown', 'worship'],
  ['raise me a tall statue in the square', 'work'],
];
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
page.on('pageerror', e => console.log('  page error:', String(e).slice(0, 200)));
await page.goto(`${BASE}/app/?model=${MODEL}&autonomy=guided&gfx=light&fps=10&intro=0&scenario=/scenarios/god-village.json&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.() && !!window.tablefolkGod, consent: !document.getElementById('modelConsent')?.hidden, text: document.getElementById('modelLoadText')?.textContent || '' })).catch(() => ({}));
  if (s.consent) { console.log('the page asks to download the model: not approved; stopping'); await b.close(); process.exit(2); }
  if (s.ready) break;
  if (Date.now() - t0 > WAIT * 1000) { console.log('no brain after', WAIT, 's:', s.text); await b.close(); process.exit(3); }
  await page.waitForTimeout(2000);
}
console.log(`brain ready in ${Math.round((Date.now() - t0) / 1000)} s:`, await page.evaluate(() => tablefolkBrainInfo?.()?.key));
await page.evaluate(() => { tablefolkLive.stop(); window.__says = []; addEventListener('tablefolk-say', e => __says.push(e.detail.agentId + ': ' + e.detail.text)); window.__calls = 0; addEventListener('tablefolk-model-call', e => { if (e.detail.kind === 'god') __calls++; }); });
await page.waitForTimeout(1500);
let right = 0;
for (const [words, want] of DECREES) {
  const r = await page.evaluate(async w => { const t = performance.now(); const d = await tablefolkGod.readDecree(w); return { kind: d.kind, text: d.text, read: d.read, error: d.error, ms: Math.round(performance.now() - t) }; }, words);
  if (r.kind === want) right++;
  console.log(`${r.kind === want ? 'ok  ' : 'MISS'} "${words}" -> ${r.kind || r.error} (${r.read}, ${r.ms} ms): ${r.text || ''}`);
}
console.log(`decrees: ${right}/${DECREES.length} read as meant`);
// prayers in the villagers' own words (the words the prayer list shows)
const pr = await page.evaluate(async () => { const out = []; for (const [id, need] of [['tilly', 'food'], ['finn', 'sign'], ['wren', 'heal']]) { const t = performance.now(); const w = await tablefolkGod.prayerWords(state.characters.find(c => c.id === id), need); out.push({ id, need, ...w, ms: Math.round(performance.now() - t) }); } return out; });
for (const p of pr) console.log(`prayer ${p.id} (${p.need}, ${p.by}, ${p.ms} ms): ${p.text}`);
// a council: the priest's call, up to five speeches, the vote (nobody walks: the village is paused, so it starts after 25 s)
const c = await page.evaluate(async () => {
  const n0 = __says.length, k0 = __calls, t = performance.now();
  const d = await tablefolkGod.decree('I require a goat sacrifice by the full moon', { anger: 'storm' });
  return { ms: Math.round(performance.now() - t), says: __says.slice(n0), calls: __calls - k0, council: d.data?.council, votes: d.data?.votes, refused: d.refused?.map(r => r.who) };
});
console.log(`council (${Math.round(c.ms / 1000)} s, ${c.calls} model calls): ${c.council}; votes ${JSON.stringify(c.votes)}; refused ${c.refused}`);
for (const l of c.says) console.log('   ', l);
await b.close().catch(() => {});
process.exit(0);
