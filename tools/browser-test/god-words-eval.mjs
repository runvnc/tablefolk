// god-words-eval.mjs: the God game (scenarios/god-village.json) with a brain loaded: decree words
// read (code first, then the menus' matcher / the brain for words code cannot read), a prayer in a
// villager's own words, and a council where the villagers above rails speak for themselves and
// their stance is read from their words. ?autonomy=guided puts everyone above rails (a small brain
// would otherwise stay on rails). Never approves a model download: stops if the page asks for one.
//   node god-words-eval.mjs [--base=http://localhost:8000] [--model=gemma4-e2b-litert] [--wait=240] [--councils=3] [--decider=on|auto|off] [--local=0]
import { chromium } from 'playwright-core';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:8000'), MODEL = arg('model', 'gemma4-e2b-litert'), WAIT = +arg('wait', 240), DECIDER = arg('decider', '');
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
// --decider=on: the decision model beside the brain (app/decider.js; read from /work/decider/, no download;
// --local=0: from Hugging Face and the browser's cache, as players get it: on downloads it once, auto loads it when cached)
const LOCAL = arg('local', '1') !== '0';
await page.goto(`${BASE}/app/?model=${MODEL}&autonomy=guided&gfx=light&fps=10&intro=0${DECIDER ? `&decider=${DECIDER}${LOCAL ? '&deciderLocal=1' : ''}` : ''}&scenario=/scenarios/god-village.json&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.() && !!window.tablefolkGod, consent: !document.getElementById('modelConsent')?.hidden, text: document.getElementById('modelLoadText')?.textContent || '' })).catch(() => ({}));
  if (s.consent) { console.log('the page asks to download the model: not approved; stopping'); await b.close(); process.exit(2); }
  if (s.ready) break;
  if (Date.now() - t0 > WAIT * 1000) { console.log('no brain after', WAIT, 's:', s.text); await b.close(); process.exit(3); }
  await page.waitForTimeout(2000);
}
console.log(`brain ready in ${Math.round((Date.now() - t0) / 1000)} s:`, await page.evaluate(() => tablefolkBrainInfo?.()?.key));
if (DECIDER && DECIDER !== 'off') {
  const t1 = Date.now(); let st = null;
  while (Date.now() - t1 < (LOCAL ? 180000 : 900000)) { st = await page.evaluate(() => tablefolkDecision.state()); if (/ready|failed|off|available/.test(st.status)) break; await page.waitForTimeout(2000); }
  console.log(`decider: ${st.status} (${st.why}) after ${Math.round((Date.now() - t1) / 1000)} s; ${st.free} GB left beside the brain`);
  // speeches code cannot place (stanceOf null): the decider against the menus' matcher
  const LINES = [['The god provides; we owe it this much.', 'yes'], ['A sheep is a sheep. Ada can have the old ewe, the lame one.', 'yes'], ['My hands are for the axe, not the altar.', 'no'], ['Let the faithful bleed their own flocks.', 'no'], ['Three loaves is a week of bread for the children.', 'no'], ['Give it to the god before sundown, I say.', 'yes'], ['After the harvest there will be bread enough for gods and men.', 'bargain'], ['The temple can wait for the next market day.', 'bargain']];
  const r = await page.evaluate(async L => { const items = [{ id: 'yes', label: 'agrees to do it' }, { id: 'no', label: 'refuses' }, { id: 'bargain', label: 'wants to bargain: more time or less' }]; const out = []; for (const [l, want] of L) { const d = await tablefolkDecision.choose(`bram answers: "${l}"`, items, 'Does bram agree to the demand, refuse it, or bargain for more time or less?', { min: 0, context: 'At a council at the temple, elder_ada says the god demands: "Bring 3 bread to the temple as an offering."' }); const m = await tablefolkMenu?.match?.({ items }, l).catch(() => null); out.push({ l, want, decider: d?.id, conf: d ? +d.confidence.toFixed(2) : null, ms: d?.ms, matcher: m?.item?.id || null, by: m?.by }); } return out; }, LINES);
  let dOk = 0, mOk = 0; for (const x of r) { if (x.decider === x.want) dOk++; if (x.matcher === x.want) mOk++; console.log(`  ${x.decider === x.want ? 'ok  ' : 'MISS'} decider ${x.decider} (${x.conf}, ${x.ms} ms) · matcher ${x.matcher} (${x.by}) · want ${x.want}: ${x.l}`); }
  console.log(`stances by the decider ${dOk}/${r.length}, by the matcher ${mOk}/${r.length}`);
}
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
// councils: the priest's call, up to five speeches, the vote (nobody walks: the village is paused, so each
// starts after 25 s). Each speech with the stance read from it and how (code, decider, matcher, rails) for a
// person to judge: does the stance match what was said?
const COUNCILS = ['I require a goat sacrifice by the full moon', 'the faithful must bring three bread to the temple by evening', 'everyone shall gather and pray at dawn'].slice(0, +arg('councils', 3));
const tally = { code: 0, decider: 0, matcher: 0, rails: 0, none: 0 };
for (const words of COUNCILS) {
  const c = await page.evaluate(async w => {
    const n0 = __says.length, k0 = __calls, t = performance.now();
    const d = await tablefolkGod.decree(w, { anger: 'storm' }), lc = tablefolkGod.lastCouncil() || {};
    return { ms: Math.round(performance.now() - t), says: __says.slice(n0), calls: __calls - k0, council: d.data?.council, votes: d.data?.votes, refused: d.refused?.map(r => r.who), said: lc.said, stance: lc.stance, read: lc.read };
  }, words);
  console.log(`\ncouncil on "${words}" (${Math.round(c.ms / 1000)} s, ${c.calls} model calls): ${c.council}; refused ${c.refused || 'none'}`);
  for (const id of Object.keys(c.said || {})) { tally[c.read[id]] = (tally[c.read[id]] || 0) + 1; console.log(`   ${id.padEnd(10)} ${String(c.stance[id]).padEnd(8)} (${c.read[id]}): ${c.said[id]}`); }
  await page.evaluate(() => { for (const d of tablefolkDemands.list()) if (d.status === 'open') d.status = 'cancelled'; });
}
console.log('stances read by', JSON.stringify(tally));
await b.close().catch(() => {});
process.exit(0);
