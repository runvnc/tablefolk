// Evaluate a JS expression in the tablefolk.world tab of the test Chrome and print
// the JSON result. No argument: print a status summary (scene ready, model
// consent prompt, brain status). Example:
//   node eval.mjs "tablefolkScenario.active?.turns"
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000')) || b.contexts()[0].pages()[0];
const js = process.argv[2] || `({url:location.href, ready:!!window.TABLEFOLK_SCENE_READY, gpu:!!navigator.gpu, consent:!document.getElementById('modelConsent')?.hidden, notice:document.getElementById('modelLoadText')?.textContent, pct:document.getElementById('modelProgressPct')?.textContent, brain:document.getElementById('brainStatus')?.textContent, scn:!!window.tablefolkScenario})`;
console.log(JSON.stringify(await page.evaluate(js), null, 1));
await b.close().catch(()=>{});
