// Navigate the test tab to a URL, reload, and wait for the scene (walls or characters).
// Usage: node reload.mjs <url>
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => /localhost:80\d\d/.test(p.url()));
await page.goto(process.argv[2]); await page.reload();
await page.waitForFunction(() => typeof state!=='undefined' && state.scene && (state.wallVisuals?.length || state.characters?.length), null, { timeout: 60000 });
await page.waitForTimeout(3000);
console.log('loaded'); await b.close().catch(()=>{});
