// node vshot.mjs "<viewer query>" out.png  -- screenshot viewer.html in a new tab of the test Chrome
import { chromium } from 'playwright-core';
const [qs, out] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1100, height: 700 });
await page.goto('http://localhost:8001/tools/browser-test/viewer.html?' + qs);
await page.waitForFunction(() => window.VIEWER_READY, null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out });
console.log(await page.textContent('#info'));
await page.close(); process.exit(0);
