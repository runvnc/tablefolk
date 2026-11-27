// god-player.mjs -- a scripted player for the God game (packages/god), run beside live-eval.mjs on the
// same test Chrome: live-eval opens and scores the village (transcript, interest report), this plays the god
// in that page for --hours game hours: answers open prayers with a fitting power (food: gift of food, healing:
// heal, rain: rain, harvest: bless field, safety: fog, a sign or strength: a dream; thanks left), blesses the
// field, makes two decrees (each with its council), an omen with a prophecy and the rain that fulfils it, a
// dream to the least devout. Every game half hour: each villager's belief, the average, the sides, mana.
// Saves results/god-player-<label>.json (belief curve, prayers with their words and how they were met,
// councils: each speech, its stance and how it was read, the vote, the decree's end).
//   node live-eval.mjs scenarios/god-village.json --minutes=11 --autonomy=guided --model=bonsai2-27b --query=dayMinutes=24 --label=x &
//   node god-player.mjs [--hours=10] [--label=x]        (CDP_PORT as for the other tools)
import { chromium } from 'playwright-core';
import fs from 'fs';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const HOURS = +arg('hours', 10), LABEL = arg('label', 'god');
const T0 = Date.now(), say = s => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
let page = null;
for (let i = 0; i < 900 && !page; i++) {
  page = b.contexts().flatMap(c => c.pages()).find(p => /god-village/.test(p.url())) || null;
  if (!page) await new Promise(r => setTimeout(r, 2000));
}
if (!page) { say('no god-village page in 30 minutes'); process.exit(2); }
for (let i = 0; ; i++) {
  const ok = await page.evaluate(() => !!(window.tablefolk?.brainReady?.() && window.tablefolkGod && window.tablefolkLive?.on && window.tablefolkClock?.now?.())).catch(() => false);
  if (ok) break;
  if (i > 900) { say('the village never started'); process.exit(3); }
  await page.waitForTimeout(2000);
}
say('the village lives: the god plays');
await page.evaluate(() => {
  window.__gp = { calls: 0, kinds: {} };
  addEventListener('tablefolk-model-call', e => { __gp.calls++; const k = e.detail?.kind || 'turn'; __gp.kinds[k] = (__gp.kinds[k] || 0) + 1; });
});
const gm = () => page.evaluate(() => { const k = tablefolkClock.now(); return (k.day - 1) * 1440 + k.min; });
const start = await gm(), out = { label: LABEL, hours: HOURS, startMin: start, belief: [], powers: [], councils: [], prayers: [], errors: [] };
page.on('pageerror', e => out.errors.push(String(e).slice(0, 200)));
const sample = async () => {
  const s = await page.evaluate(() => { const G = tablefolkGod.rules, ids = G.ids(); return { by: Object.fromEntries(ids.map(id => [id, Math.round(G.belief(id))])), side: Object.fromEntries(ids.map(id => [id, G.side(id)])), avg: Math.round(G.average() * 10) / 10, mana: Math.round(tablefolkResources.get('mana') * 10) / 10, open: G.open().length }; });
  s.h = +(((await gm()) - start) / 60).toFixed(2); out.belief.push(s);
  say(`h${s.h.toFixed(1)} belief avg ${s.avg} (${Object.entries(s.by).map(([k, v]) => k + ' ' + v).join(', ')}), mana ${s.mana}, ${s.open} prayers open`);
};
const power = async (name, target, why) => {
  const r = await page.evaluate(async ([n, t]) => {
    const pos = g => g.logicalPos || g.root.position, garden = () => { const d = tablefolkJobs.places.placeNamed('garden') || tablefolkJobs.places.placeNamed('field'); return d ? { x: Math.round((d.x0 + d.x1) / 2), z: Math.round((d.z0 + d.z1) / 2), place: d.id || 'garden' } : { x: 0, z: 0 }; };
    let tg = t;
    if (t?.who) { const g = state.characters.find(c => c.id === t.who); tg = g ? { who: g, x: Math.round(pos(g).x), z: Math.round(pos(g).z) } : null; }
    else if (t?.place === 'garden') tg = garden();
    const r = await tablefolkPowers.use(n, tg); return typeof r === 'string' ? r : JSON.stringify(r);
  }, [name, target]).catch(e => 'error ' + e.message);
  const h = +(((await gm()) - start) / 60).toFixed(2); out.powers.push({ h, name, target, why, r: String(r).slice(0, 200) }); say(`power ${name} (${why}): ${String(r).slice(0, 140)}`);
};
const FIT = { food: 'gift_food', heal: 'heal', rain: 'rain', harvest: 'bless_field', safety: 'fog', sign: 'dream', strength: 'dream' };
const answerPrayers = async () => {
  const open = await page.evaluate(() => tablefolkGod.rules.open().map(p => ({ id: p.id, who: p.who, need: p.need, text: p.text })));
  for (const p of open) {
    const n = FIT[p.need]; if (!n) continue;
    await power(n, ['rain', 'bless_field'].includes(n) ? { place: 'garden' } : n === 'fog' ? {} : { who: p.who }, `${p.who} prayed for ${p.need}: ${p.text.slice(0, 80)}`);
  }
};
const decree = async words => {
  say(`decree: "${words}"`);
  const c = await page.evaluate(async w => {
    const t = performance.now(), k0 = __gp.kinds.god || 0;
    const d = await tablefolkGod.decree(w, { anger: 'storm' }), lc = tablefolkGod.lastCouncil() || {};
    return { words: w, kind: d.kind, read: d.read, ms: Math.round(performance.now() - t), godCalls: (__gp.kinds.god || 0) - k0, council: d.data?.council, votes: d.data?.votes, refused: d.refused?.map(r => r.who), said: lc.said, stance: lc.stance, how: lc.read, id: d.id };
  }, words).catch(e => ({ words, error: e.message }));
  c.h = +(((await gm()) - start) / 60).toFixed(2); out.councils.push(c);
  say(`council (${Math.round((c.ms || 0) / 1000)} s, ${c.godCalls} model calls): ${c.council}; refused ${c.refused || 'none'}`);
  for (const id of Object.keys(c.said || {})) say(`   ${id.padEnd(10)} ${String(c.stance?.[id]).padEnd(8)} (${c.how?.[id]}): ${c.said[id]}`);
};
// the script: game hour -> what the god does
const PLAN = [
  [0.5, () => power('bless_field', { place: 'garden' }, 'a first sign of favour')],
  [1.5, () => decree('the faithful must bring three bread to the temple by evening')],
  [4, () => power('omen', { words: 'rain will come to the fields' }, 'a prophecy')],
  [5, () => power('rain', { place: 'garden' }, 'the prophecy fulfilled')],
  [6, async () => { const id = await page.evaluate(() => { const G = tablefolkGod.rules; return G.ids().sort((a, b) => G.belief(a) - G.belief(b))[0]; }); await power('dream', { who: id }, 'a dream to the least devout'); }],
  [7, () => decree('everyone shall gather and pray at the temple at dusk')],
];
let nextSample = 0, step = 0;
for (;;) {
  const h = ((await gm()) - start) / 60;
  if (h >= nextSample) { await sample(); nextSample += 0.5; }
  while (step < PLAN.length && h >= PLAN[step][0]) await PLAN[step++][1]();
  await answerPrayers();
  if (h >= HOURS) break;
  await page.waitForTimeout(5000);
}
await sample();
Object.assign(out, await page.evaluate(() => ({
  prayers: tablefolkGod.rules.prayers().map(p => ({ id: p.id, who: p.who, need: p.need, text: p.text, status: p.status, by: p.by || null })),
  demands: (window.tablefolkDemands?.list?.() || []).map(d => ({ template: d.template, status: d.status, text: d.text || d.label || null })),
  modelCalls: __gp.calls, kinds: __gp.kinds,
})));
out.realMinutes = +((Date.now() - T0) / 60000).toFixed(1);
const by = {}; for (const p of out.prayers) by[p.status] = (by[p.status] || 0) + 1;
say(`prayers: ${out.prayers.length} (${JSON.stringify(by)}); model calls ${out.modelCalls} ${JSON.stringify(out.kinds)}; belief ${out.belief[0]?.avg} -> ${out.belief.at(-1)?.avg}`);
fs.mkdirSync('results', { recursive: true }); fs.writeFileSync(`results/god-player-${LABEL}.json`, JSON.stringify(out, null, 1));
say(`saved results/god-player-${LABEL}.json; page errors: ${out.errors.length}`);
await b.close().catch(() => {});
process.exit(0);
