// Screenshot the tablefolk.world tab of the test Chrome.
// Usage: node shot.mjs out.png ["<js to run first>"] [waitMs]
// The viewport is pinned to SHOT_W x SHOT_H (default 1280x800) over DevTools,
// whatever size the (tiling) window manager gave the window.
import { chromium } from 'playwright-core';
const [out = 'shot.png', js, wait = '1500'] = process.argv.slice(2);
const W = +(process.env.SHOT_W || 1280), H = +(process.env.SHOT_H || 800);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000'));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(300);
if (js) console.log(JSON.stringify(await page.evaluate(js)));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log('saved', out);
await b.close().catch(() => {});
