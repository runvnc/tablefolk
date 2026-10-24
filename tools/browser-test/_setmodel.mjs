import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
await page.goto('http://localhost:8000/tools/browser-test/blank.html');
await page.evaluate(k => localStorage.setItem('tablefolk_model', k), process.argv[2]);
console.log('model ->', process.argv[2]); await page.close(); await b.close();
