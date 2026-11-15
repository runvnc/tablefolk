// "always, after every change": the toggle is remembered and the agent runs by itself on a new world
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8001';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
let critiques = 0;
await page.route('**/api/critique*', r => { critiques++; r.fulfill({ contentType: 'application/json', body: JSON.stringify({ verdict: 'good', problems: [], ideas: [], request: '' }) }); });
const show = () => page.evaluate(async () => { const s = await (await fetch('/scenarios/goblin-bakery.json')).json(); window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: { where: 'test' } }); await new Promise(r => setTimeout(r, 2500)); });
await page.goto(base + '/world/?t=' + Date.now()); await page.evaluate(() => localStorage.removeItem('tablefolk.builderAgent'));
await show(); console.log('toggle off: critiques', critiques);
await page.check('#aiAuto'); await page.selectOption('#aiRounds', '2');
await page.reload(); await show();
console.log('after reload: checked', await page.isChecked('#aiAuto'), 'rounds', await page.inputValue('#aiRounds'), 'critiques', critiques, '| log:', (await page.locator('.agentlog').innerText().catch(() => '')).slice(0, 80));
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no page errors'); await page.close(); await b.close().catch(() => {});
