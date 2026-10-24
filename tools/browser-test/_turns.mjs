// run N turns of one character in a scenario and print its raw output and prompt tail
import { chromium } from 'playwright-core';
const [src, who, n = '3'] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0]; const page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close();
page.on('console', m => { const t = m.text(); if (t.includes('RAW LLM OUTPUT for agent ' + who) || t.includes('RAW LiteRT OUTPUT')) console.log('RAW:', t.replace(/.*elapsed ms: \d+ :/, '').slice(0, 400)); });
await page.goto(`http://localhost:8000/app/?play=1&scenario=${encodeURIComponent(src)}&t=${Date.now()}`);
for (let i = 0; i < 240; i++) { if (await page.evaluate(() => !!window.tablefolk?.brainReady?.())) break; await page.waitForTimeout(1000); }
for (let i = 0; i < +n; i++) {
  await page.evaluate(w => window.tablefolk.runAgentTurn(state.characters.find(c => c.id === w)), who);
  console.log('HIST:', (await page.evaluate(() => (state.globalHistory || []).slice(-2).join(' || '))).slice(0, 300));
}
const p = await page.evaluate(() => window.__tablefolkLiteRT?.lastPrompt?.());
console.log('PROMPT TAIL:\n' + String(p?.promptText || '').slice(-1600));
await page.close(); await b.close();
