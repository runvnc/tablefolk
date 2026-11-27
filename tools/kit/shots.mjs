// Screenshots of tools/kit/viewer.html in the headless test Chrome (2026-11-27).
//   node tools/kit/shots.mjs <base url> <outdir> house[,house...] [views]   (views default far,door,inside,cut1,cut2,fade)
// Needs the test Chrome (HEADLESS=1 tools/browser-test/launch-chrome.sh, CDP on 9223 or CDP_PORT) and a server for the
// repo root. Prints each house's stats() (draw groups, triangles, textures) as JSON lines: STATS {...}.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(new URL('../browser-test/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const [base, dir, houses, views = 'far,door,inside,cut1,cut2,fade'] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0]; const p = await ctx.newPage();
await p.setViewportSize({ width: 960, height: 720 });
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
for (const h of houses.split(',')) {
  await p.goto(`${base}/tools/kit/viewer.html?house=${h}`, { timeout: 30000 });
  await p.waitForFunction(() => window.kit?.ready, null, { timeout: 60000 });
  for (const v of views.split(',')) {
    await p.evaluate(v => kit.view(v), v); await p.waitForTimeout(1800);
    const url = await p.evaluate(() => document.getElementById('c').toDataURL('image/jpeg', .88));
    writeFileSync(`${dir}/${h}_bjs_${v}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    if (v === 'far') console.log('STATS ' + JSON.stringify({ house: h, ...(await p.evaluate(() => kit.stats())) }));
    if (v === 'cut2') console.log('STATS_CUT2 ' + JSON.stringify({ house: h, ...(await p.evaluate(() => kit.stats())) }));
  }
}
await p.close(); process.exit(0);
