// Watch characters live: open a scenario with ?play=1, wait for the brain,
// press "let them live", and print what happens (the shared history: every
// action and its result, the director's events) for N seconds. Saves the
// transcript to results/live-<name>-<ts>.json.
// Usage: node live-watch.mjs <scenario url or path> [seconds] [base]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const [src, secs = '180', base = 'http://localhost:8000'] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0];
const page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto(`${base}/app/?play=1&scenario=${encodeURIComponent(src)}&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !document.getElementById('modelConsent')?.hidden, st: document.getElementById('brainStatus')?.textContent }));
  if (s.consent) { console.log('model download prompt: stopping (not approving downloads)'); process.exit(1); }
  if (s.ready) break;
  if (Date.now() - t0 > 240000) { console.log('brain never ready:', s.st); process.exit(1); }
  await page.waitForTimeout(1000);
}
console.log(`brain ready in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await page.evaluate(() => { document.querySelector('.scn-intro, #scenarioIntro')?.remove?.(); window.tablefolkLive.start(); });
const seen = new Set(), lines = [];
const t1 = Date.now();
while (Date.now() - t1 < +secs * 1000) {
  const h = await page.evaluate(() => ({ h: state.globalHistory || [], said: (state.characters || []).map(c => [c.id, c._lastSaid || '']), narr: document.getElementById('narration')?.textContent || '' }));
  for (const l of h.h) if (!seen.has(l)) { seen.add(l); lines.push(l); console.log(l.slice(0, 300)); }
  await page.waitForTimeout(2500);
}
const turns = await page.evaluate(() => window.tablefolkLive.round);
await page.evaluate(() => window.tablefolkLive.stop());
const name = String(src).split('/').pop().replace(/\.json$/, '');
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/live-${name}-${Date.now()}.json`, import.meta.url), JSON.stringify({ src, secs, rounds: turns, lines, errors }, null, 1));
console.log(`\n${lines.length} events in ${secs} s, ${turns} rounds; ${errors.length} errors`);
for (const e of errors.slice(0, 10)) console.log('ERR', e);
await page.close(); await b.close().catch(() => {});
