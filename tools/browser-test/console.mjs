// Print the page's console output for N seconds. Usage: node console.mjs [seconds]
import { chromium } from 'playwright-core';
const secs = +(process.argv[2] || 10);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000'));
const seen = new Map();
page.on('console', m => { const t = (m.type() + ': ' + m.text()).slice(0, 400); seen.set(t, (seen.get(t) || 0) + 1); });
page.on('pageerror', e => { const t = 'PAGEERROR: ' + String(e).slice(0, 400); seen.set(t, (seen.get(t) || 0) + 1); });
await page.waitForTimeout(secs * 1000);
for (const [t, n] of seen) console.log(n > 1 ? `[x${n}] ${t}` : t);
await b.close().catch(() => {});
