import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => /localhost:80\d\d/.test(p.url()));
const s = await page.context().newCDPSession(page); await s.send('Network.clearBrowserCache'); console.log('cache cleared');
await b.close().catch(() => {});
