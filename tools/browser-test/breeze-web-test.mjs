// Speak a line with Breeze in the browser (breeze-web-test.html) in the test Chrome and save the WAV:
//   node breeze-web-test.mjs ["text"]   (OUT=path.wav; the test Chrome on :9223, page on :8000)
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages().find(x => x.url().includes('breeze-web-test')) || b.contexts()[0].pages()[0];
await p.goto('http://localhost:8000/tools/browser-test/breeze-web-test.html');
p.on('console', m => { const t = m.text(); console.log('console:', t.slice(0, 300)); });
if (process.argv[2]) await p.fill('#text', process.argv[2]);
await p.click('#run');
await p.waitForFunction(() => window.RESULT && (window.RESULT.done || window.RESULT.error), null, { timeout: 600000 });
console.log(JSON.stringify(await p.evaluate(() => ({ r: window.RESULT, table: document.getElementById('out').innerText }))));
const wav = await p.evaluate(() => window.WAV); if (wav) writeFileSync(process.env.OUT || 'breeze-web.wav', Buffer.from(wav, 'base64'));
process.exit(0);
