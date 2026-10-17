// Screenshot the tablefolk.world tab of the test Chrome.
// Usage: node shot.mjs out.png ["<js to run first>"] [waitMs]
import { chromium } from 'playwright-core';
const [out = 'shot.png', js, wait = '1500'] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000'));
if (js) console.log(JSON.stringify(await page.evaluate(js)));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log('saved', out);
await b.close().catch(() => {});
