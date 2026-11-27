// wg-run.mjs (gpu-checks.sh copies it to tools/browser-test/_wg-run.mjs, where playwright-core is) <model> [oneanswer]: the world builder in the box's Chrome with that model; prints its window and result
import { chromium } from 'playwright-core';
const [model, mode] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
const logs = []; page.on('console', m => { const t = m.text(); if (/window|context|out of memory|lost|error/i.test(t)) logs.push(t.slice(0, 200)); });
await page.goto('http://localhost:8000/scenarios/hearthvale.json').catch(() => {});   // the origin, to set the model (the test page would start building at once)
await page.evaluate(m => localStorage.setItem('tablefolk_model', m), model);
const t0 = Date.now();
await page.goto(`http://localhost:8000/tools/browser-test/worldgen-test.html?${mode === 'oneanswer' ? 'oneanswer=1&' : ''}prompt=${encodeURIComponent('a fishing village where the boats have not come back and the baker hoards flour')}&t=${Date.now()}`);
let r = null;
for (let i = 0; i < 360 && !r; i++) { await page.waitForTimeout(5000); r = await page.evaluate(() => window.result || null).catch(() => null); if (i % 12 === 0) console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', (await page.evaluate(() => document.getElementById('out').textContent.split('\n').slice(-1)[0]).catch(() => ''))); }
const log = await page.evaluate(() => document.getElementById('out').textContent).catch(() => '');
console.log(log.slice(-1500));
console.log('RESULT', JSON.stringify(r ? { ok: r.ok, error: r.error, ms: r.ms, title: r.title, chars: r.scenario?.characters?.length } : 'timeout'), 'seconds', ((Date.now() - t0) / 1000).toFixed(0));
console.log('console:', logs.slice(-12).join('\n  '));
await page.close(); await b.close(); process.exit(0);
