// decider-run.mjs -- open tools/browser-test/decider-test.html in the test Chrome and print its result.
//   node decider-run.mjs [query, e.g. "local=1&engine=embeddings"] [--base=http://localhost:8000] [--timeout=300]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const query = args.find(a => !a.startsWith('--')) || 'local=1';
const base = flag('base') || 'http://localhost:8000', limit = (+flag('timeout') || 300) * 1000;
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0], page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
page.on('console', m => { const t = m.text(); if (t.startsWith('DEC ') && !t.startsWith('DEC RESULT')) console.log(t.slice(4)); });
await page.goto(`${base}/tools/browser-test/decider-test.html?${query}`);
const t0 = Date.now();
let r = null;
while (!(r = await page.evaluate(() => window.result).catch(() => null)) && Date.now() - t0 < limit) await page.waitForTimeout(1000);
console.log('RESULT ' + JSON.stringify(r || { timeout: true }));
await page.close(); await b.close(); process.exit(r && !r.error ? 0 : 1);
