import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
for (const f of process.argv.slice(2)) {
  const urls = []; const h = r => { if (/\.(png|avif)/.test(r.url())) urls.push(r.status() + ' ' + r.url().split('/').pop()); }; page.on('response', h);
  await page.goto('http://localhost:8000/tools/browser-test/tmp/gltf.html?f=' + f); await page.waitForTimeout(2500);
  page.off('response', h); console.log(f, urls.join(', '));
}
await page.close(); await b.close();
