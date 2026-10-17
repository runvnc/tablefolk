import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000'));
const s = await page.context().newCDPSession(page); await s.send('Network.clearBrowserCache'); console.log('cache cleared');
await b.close().catch(() => {});
