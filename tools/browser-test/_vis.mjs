import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0]; const page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
page.on('console', m => { if (/vision|sees|see\b|litert-worker|RESTART|\[senses\]/i.test(m.text())) console.log('console:', m.text().slice(0, 300)); });
await page.goto('http://localhost:8000/app/?norender=0');
await page.evaluate(() => { localStorage.setItem('tablefolk_model', 'gemma4-e2b-vision'); localStorage.setItem('tablefolk_model_url:gemma4-e2b-vision', 'http://127.0.0.1:8002/model.litertlm'); });
await page.goto('http://localhost:8000/app/?play=1&scenario=/scenarios/goblin-bakery.json&t=' + Date.now());
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !document.getElementById('modelConsent')?.hidden, st: document.getElementById('brainStatus')?.textContent, pct: document.getElementById('modelLoadText')?.textContent }));
  if (s.consent) { console.log('approving local copy'); await page.click('#approveModelDownload'); }
  if (s.ready) break;
  if ((Date.now() - t0) % 20000 < 1100) console.log(Math.round((Date.now() - t0) / 1000), s.st, s.pct);
  if (Date.now() - t0 > 600000) { console.log('timeout', s); process.exit(1); }
  await page.waitForTimeout(1000);
}
console.log('ready in', Math.round((Date.now() - t0) / 1000), 's; vision:', await page.evaluate(() => window.tablefolkVision?.available()));
const r = await page.evaluate(async () => { const g = state.characters.find(c => c.id === 'grub'); return await window.tablefolkVision.lookFor(g); });
console.log('grub sees:', r);
const img = await page.evaluate(() => document.querySelector('#sightCard img')?.src);
if (img) fs.writeFileSync('/tmp/claude-1000/-mnt-files-geebr-world/bde8bf29-8007-4375-b49f-eeda1155bc3c/scratchpad/grub-sees.jpg', Buffer.from(img.split(',')[1], 'base64'));
console.log(errs.join('\n'));
await b.close().catch(() => {});
