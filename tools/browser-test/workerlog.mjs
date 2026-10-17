// Run a JS expression in the page while capturing the LiteRT worker's console
// (where the exact prompt sent to the model is logged). Usage: node workerlog.mjs "<js>"
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000'));
const lines = [];
const hook = w => w.on('console', m => { const t = m.text(); if (/SENDING PROMPT/.test(t)) lines.push(m); });
page.workers().forEach(hook); page.on('worker', hook);
console.log(JSON.stringify(await page.evaluate(process.argv[2])));
for (const m of lines) { const args = await Promise.all(m.args().map(a => a.jsonValue().catch(() => null))); console.log('--- worker prompt:', JSON.stringify(args[1]?.promptText ?? args, null, 1)); }
await b.close().catch(() => {});
