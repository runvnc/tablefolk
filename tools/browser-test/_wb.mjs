import { chromium } from 'playwright-core';
const [out, file = 'the-cramped-warrens-1792821276923.json', js = ''] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0];
let page = ctx.pages().find(p => p.url().includes('/world/'));
const errs = [];
if (!page) { page = await ctx.newPage(); }
page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
if (!process.env.KEEP) {
  await page.goto('http://localhost:8001/world/?t=' + Date.now());
  await page.evaluate(async f => { const s = await (await fetch('/generated/' + f)).json(); const { prompt, mode, model, ...scn } = s; window.tfBuilder.show({ scenario: scn, model, ms: 0 }, { revise: { where: 'cloud' } }); }, file);
  await page.waitForTimeout(2500);
}
if (js) console.log(JSON.stringify(await page.evaluate(js)));
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: !!process.env.FULL });
console.log(errs.join('\n'));
await b.close().catch(() => {});
