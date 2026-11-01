// Load a page in the test Chrome and print its errors and warnings for 15 s:  node page-errors.mjs <url>
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages()[0]; const out = [];
p.on('pageerror', e => out.push('PAGEERROR ' + String(e).slice(0, 300)));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') out.push(m.type() + ' ' + m.text().slice(0, 250)); });
await p.goto(process.argv[2]); await p.waitForTimeout(15000);
console.log(out.slice(0, 20).join('\n')); console.log(JSON.stringify(await p.evaluate(() => ({ st: !!window.TABLEFOLK_STATE, t: !!window.tablefolk, compat: !document.querySelector('.compatibility-screen')?.hidden && !!document.querySelector('.compatibility-screen'), body: document.body.innerText.slice(0, 300) }))));
process.exit(0);
