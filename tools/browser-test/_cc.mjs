import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage(); const bad = new Set();
const s = await page.context().newCDPSession(page); await s.send('Network.enable'); await s.send('Network.clearBrowserCache');
page.on('response', r => { if (r.status() >= 400) bad.add(r.status() + ' ' + r.url()); });
await page.goto('http://localhost:8000/app/?play=1&art=1&scenario=/scenarios/goblin-bakery.json'); await page.waitForTimeout(15000);
console.log('bad:', [...bad].join('\n') || 'none'); await page.close(); await b.close();
