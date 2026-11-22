// brainload.mjs -- load one brain in the test Chrome inside a playing world and time it: page open to brain ready
// (cold: download + load; cached: from the browser's storage), then keep the world playing for a while (for a
// peak-memory sample taken outside, e.g. nvidia-smi on the box) and print the turn times the page logged.
//   node brainload.mjs --model=inkling2-mini-wllama [--base=http://localhost:8000] [--gfx=medium]
//        [--scenario=scenarios/hearthvale.json] [--play=180] [--autonomy=guided]
// APPROVE_DOWNLOAD=1 approves a model download (a rented machine only). Prints one JSON line.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), flag = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const base = flag('base', 'http://localhost:8000');
const q = ['play=1', 'intro=0', 'gfx=' + flag('gfx', 'medium'), 'model=' + flag('model'), 'scenario=/' + flag('scenario', 'scenarios/hearthvale.json'),
  'autonomy=' + flag('autonomy', 'guided'), flag('query', '')].filter(Boolean).join('&');   // --query=a=1&b=2: more URL parameters
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0], page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); } catch {} });
const turns = [], t0 = Date.now();
page.on('console', m => {
  const t = m.text();
  const r = t.match(/RAW OUTPUT at .*elapsed ms: (\d+)/);
  if (r) turns.push(+r[1]);
  const k = t.match(/llama\.cpp timings: prompt_n= (\d+) prompt_ms= (\d+) PREFILL= ([\d.]+).*predicted_n= (\d+) DECODE= ([\d.]+)/);
  if (k) reads.push({ n: +k[1], ms: +k[2], gen: +k[4], tps: +k[5] });
});
const reads = [], errs = [];
// CONSOLE_LOG=file: every console line (debugging a crash)
if (process.env.CONSOLE_LOG) { const fs = await import('fs'); page.on('console', m => fs.appendFileSync(process.env.CONSOLE_LOG, `[${((Date.now() - t0) / 1000).toFixed(1)}] ${m.type()}: ${m.text().slice(0, 2000)}\n`)); }
page.on('pageerror', e => { if (errs.length < 12) errs.push('PAGEERROR ' + String(e).slice(0, 300)); });
page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /crash|RuntimeError|abort|exception|Device.*lost/i.test(t)) && errs.length < 12 && !errs.includes(t.slice(0, 300))) errs.push(t.slice(0, 300)); });
await page.goto(`${base}/app/?${q}&t=${t0}`);
let consentAt = null, readyAt = null;
for (;;) {
  const s = await page.evaluate(() => ({ consent: !document.getElementById('modelConsent')?.hidden, ready: !!window.tablefolk?.brainReady?.() }));
  if (s.consent && !consentAt) {
    if (process.env.APPROVE_DOWNLOAD !== '1') { console.log(JSON.stringify({ error: 'download needed; not approving' })); process.exit(2); }
    consentAt = Date.now();
    await page.evaluate(() => document.getElementById('approveModelDownload')?.click());
  }
  if (s.ready) { readyAt = Date.now(); break; }
  if (Date.now() - t0 > (+process.env.LOAD_TIMEOUT || 1500) * 1000) { console.log(JSON.stringify({ error: 'timeout' })); process.exit(3); }
  await page.waitForTimeout(1000);
}
const play = +flag('play', 180);
await page.waitForTimeout(play * 1000);
const med = a => { const v = a.filter(x => Number.isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const sorted = [...turns].sort((a, b) => a - b), pct = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
console.log(JSON.stringify({ model: flag('model'), downloaded: !!consentAt, ready_s: ((readyAt - t0) / 1000).toFixed(1), turns: turns.length,
  turn_median_s: pct(0.5) && (pct(0.5) / 1000).toFixed(2), turn_p90_s: pct(0.9) && (pct(0.9) / 1000).toFixed(2),
  // tokens read and written a call, its reading and writing speed (llama.cpp's timings), medians
  read_n_median: med(reads.map(x => x.n)), read_ms_median: med(reads.map(x => x.ms)), written_median: med(reads.map(x => x.gen)),
  write_tps_median: med(reads.map(x => x.tps)), errors: errs }));
await page.close(); await b.close(); process.exit(0);
