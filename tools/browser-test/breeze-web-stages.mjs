// Run Breeze's stages on fixed inputs in the browser (tf_stages) and save the stats, to compare
// with a native build (tools/breeze-web/README.md):  node breeze-web-stages.mjs out.txt
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages()[0];
await p.goto('http://localhost:8000/tools/browser-test/breeze-web-test.html');
const text = await p.evaluate(async () => {
  ensureWorker(); await step({ type: 'load', data: {} });
  return await new Promise(r => { const old = worker.onmessage; worker.onmessage = e => { if (e.data.type === 'debug_stages') { worker.onmessage = old; r(e.data.text); } else old(e); }; worker.postMessage({ type: 'debug_stages' }); });
});
writeFileSync(process.argv[2], text); console.log('lines', text.split('\n').length - 1);
process.exit(0);
