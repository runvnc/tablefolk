// probe.mjs -- run agency.js's capability check for one brain in the test
// Chrome and print its result (score, tasks, tokens/s, the level it gives).
//   node probe.mjs --model=bonsai2-27b [--base=http://localhost:8000] [--llm=<url> --llm-model=<name>]
// APPROVE_DOWNLOAD=1 approves a model download (a rented machine only).
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const base = flag('base') || 'http://localhost:8000';
const q = ['probe=1', 'intro=0', 'gfx=light', 'fps=10', flag('model') && 'model=' + flag('model'), flag('llm') && 'llm=' + encodeURIComponent(flag('llm')), flag('llm-model') && 'llmModel=' + encodeURIComponent(flag('llm-model')), process.env.PAGE_QUERY].filter(Boolean).join('&');   // PAGE_QUERY: more URL parameters
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0], page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); } catch {} });
await page.goto(`${base}/app/?${q}&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ consent: !document.getElementById('modelConsent')?.hidden, ready: !!window.tablefolk?.brainReady?.(), running: !!window.tablefolkAgency?.probe?.running, res: window.tablefolkAgency?.probe?.result?.() || null, st: document.getElementById('brainStatus')?.textContent })).catch(() => ({}));
  if (s.consent) { if (process.env.APPROVE_DOWNLOAD === '1') await page.evaluate(() => document.getElementById('approveModelDownload')?.click()); else { console.log('download needed; not approving'); process.exit(2); } }
  if (s.res && !s.running && s.ready) { console.log(JSON.stringify(s.res)); break; }
  if (Date.now() - t0 > (+process.env.PROBE_TIMEOUT || 900) * 1000) { console.log('timeout', JSON.stringify(s)); process.exit(3); }
  await page.waitForTimeout(3000);
}
await page.close(); await b.close(); process.exit(0);
