// Test the "find helpers on this computer" button against breeze-server (:8137) and llama-server (:8080) running here:
// the probe, the llama.cpp offer and the endpoint fill. node helpers-test.mjs (the test Chrome, page on :8000)
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages()[0] || await b.contexts()[0].newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8000/app/?norender=1&t=' + Date.now());
await p.evaluate(() => { localStorage.removeItem('tablefolkHelpers'); });
await p.waitForFunction(() => window.tablefolkHelpers && document.querySelector('.find-helpers'), null, { timeout: 60000 });
const before = await p.evaluate(() => document.getElementById('modelSelect').value);
await p.evaluate(() => document.querySelector('#llmEndpointBox .find-helpers').click());
await p.waitForSelector('.confirm-yes', { timeout: 15000 });
const msg = await p.$eval('.confirm-msg', e => e.textContent);
await p.waitForTimeout(700); await p.click('.confirm-yes'); await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(b4 => ({ before: b4, after: document.getElementById('modelSelect').value, status: document.querySelector('.helpers-status').textContent,
  endpoint: localStorage.getItem('tablefolk_llm_endpoint'), breezeUrl: localStorage.getItem('tablefolkBreezeUrl'), remembered: localStorage.getItem('tablefolkHelpers') }), before), null, 1));
console.log('dialog:', msg); console.log('errors:', errs);
process.exit(0);
