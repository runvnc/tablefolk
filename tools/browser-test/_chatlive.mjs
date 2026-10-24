import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0]; const page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close();
await page.goto('http://localhost:8000/app/?play=1&scenario=/scenarios/haunted-tavern.json&t=' + Date.now());
for (let i = 0; i < 200; i++) { if (await page.evaluate(() => !!window.tablefolk?.brainReady?.() && window.tablefolkLive?.on)) break; await page.waitForTimeout(1000); }
await page.evaluate(() => document.querySelector('#scenarioEnd [data-scn="close"]')?.click());
await page.waitForTimeout(15000); await page.evaluate(() => { window.__seen = new Set(state.globalHistory || []); });
const t0 = Date.now(); const n0 = await page.evaluate(() => (state.globalHistory || []).length);
await page.selectOption('#chatTo', 'barnaby').catch(() => {});
await page.fill('#chatInput', 'Barnaby, I would like a bowl of stew please. How much?').catch(async () => { await page.fill('#chatDock input[type=text]:not(#chatName)', 'Barnaby, a bowl of stew please. How much?'); });
await page.click('#chatSend');
let reply = null;
for (let i = 0; i < 90 && !reply; i++) {
  await page.waitForTimeout(1000);
  reply = await page.evaluate(() => (state.globalHistory || []).slice(-6).find(l => /barnaby: barnaby (say|sell)/.test(l) && /stew|gold|bowl|coin|3/i.test(l) && !window.__seen?.has(l)) || null);
}
console.log('reply after', Math.round((Date.now() - t0) / 1000), 's:', reply);
console.log((await page.evaluate(() => state.globalHistory.slice(-8).join('\n'))).slice(0, 1500));
await page.evaluate(() => window.tablefolkLive.stop());
await page.close(); await b.close();
