// llm-sweep.mjs -- how one brain behaves outside the game: prompts of growing
// length one after another, then two calls at once, each timed and given up
// after a limit; console errors (device lost, out of memory) are printed.
//   node llm-sweep.mjs --model=bonsai2-27b [--noqueue=1: calls overlap, as before the queue] [--base=http://localhost:8000] [--sizes=500,1000,2000,4000,6000] [--limit=180]
// APPROVE_DOWNLOAD=1 approves a download (a rented machine only).
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const base = flag('base') || 'http://localhost:8000', sizes = (flag('sizes') || '500,1000,2000,4000,6000').split(',').map(Number), limit = +(flag('limit') || 180);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0], page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
page.on('console', m => { const t = m.text(); if (m.type() === 'error' || /lost|out of memory|OOM|uncaptured|GPUValidation|Device/i.test(t)) console.log('  console:', t.slice(0, 200)); });
page.on('pageerror', e => console.log('  pageerror:', String(e).slice(0, 200)));
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); } catch {} });
await page.goto(`${base}/app/?play=1&intro=0&gfx=light&fps=10&probe=0${flag('noqueue') ? '&llmqueue=0' : ''}&model=${flag('model')}&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ consent: !document.getElementById('modelConsent')?.hidden, ready: !!window.tablefolk?.brainReady?.(), st: document.getElementById('brainStatus')?.textContent })).catch(() => ({}));
  if (s.consent && process.env.APPROVE_DOWNLOAD === '1') await page.evaluate(() => document.getElementById('approveModelDownload')?.click());
  if (s.ready) { console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${s.st}`); break; }
  if (Date.now() - t0 > 1200e3) { console.log('never ready', JSON.stringify(s)); process.exit(3); }
  await page.waitForTimeout(3000);
}
const call = (n, tag) => page.evaluate(async ([n, tag, limit]) => {
  const filler = Array.from({ length: Math.ceil(n / 12) }, (_, i) => `Line ${i}: the baker sold ${i % 7} loaves to the smith at the square.`).join('\n');
  const t = performance.now();
  try {
    const r = await Promise.race([window.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: 'You are Odo, the baker.' }, { role: 'user', content: filler + '\n\nIn one short sentence: how many loaves were sold on line 3?' }], max_tokens: 40, agentId: 'sweep-' + tag }), new Promise((_, no) => setTimeout(() => no(new Error('no answer in ' + limit + ' s')), limit * 1000))]);
    return { tag, n, s: +((performance.now() - t) / 1000).toFixed(1), out: String(r?.choices?.[0]?.message?.content || '').slice(0, 80) };
  } catch (e) { return { tag, n, s: +((performance.now() - t) / 1000).toFixed(1), err: String(e.message || e) }; }
}, [n, tag, limit]);
for (const n of sizes) console.log(JSON.stringify(await call(n, 'seq')));
console.log('two at once:', JSON.stringify(await Promise.all([call(1500, 'a'), call(1500, 'b')])));
console.log('three different agents at once:', JSON.stringify(await Promise.all([call(2500, 'x'), call(800, 'y'), call(2500, 'z')])));
await page.close(); await b.close(); process.exit(0);
