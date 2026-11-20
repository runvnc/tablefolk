// Start-up timing: seconds from navigation to scene ready, world active (the
// scenario started and the player's avatar stands: the player can move),
// brain ready, the first model call, the first character turn, and fully
// dressed (scene mesh count steady 3 s after the world is active, and no
// dressing work pending in window.__tfMarks). With --art the page gets ?art=1
// (no model). Prints one JSON line; window.__tfMarks (ms summed per part) is
// included. Never approves a model download.
//
//   node startup-time.mjs <scenario name> [--art] [--base=http://localhost:8000]
//        [--gfx=light] [--query=fps=10] [--timeout=150]
//
// Use a fresh test Chrome per run for numbers with a model (a long-lived
// Chrome's GPU state slows the model; testing.md).
import { chromium } from 'playwright-core';

const args = process.argv.slice(2), flag = n => { const a = args.find(x => x === '--' + n || x.startsWith('--' + n + '=')); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const name = args.find(a => !a.startsWith('--'));
const art = !!flag('art'), base = flag('base') || 'http://localhost:8000', gfx = flag('gfx') || 'light', extra = flag('query') || '', limit = +(flag('timeout') || 150);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0];
const page = ctx.pages()[0] || await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await page.bringToFront().catch(() => {});
await page.goto('about:blank');
await page.addInitScript(() => {
  try { localStorage.setItem('tablefolkTtsEnabled', '0'); for (const k of Object.keys(localStorage)) if (k.startsWith('tablefolk-mind:') || k.startsWith('tablefolk-journey')) localStorage.removeItem(k); } catch {}
  const T = window.__tfStart = { t0: performance.now() };
  const at = k => { if (T[k] == null) T[k] = +((performance.now() - T.t0) / 1000).toFixed(2); };
  addEventListener('tablefolk-model-call', () => at('firstCall'));
  addEventListener('tablefolk-agent-turn', e => { if (!e.detail?.reflex) at('firstTurn'); });
  addEventListener('tablefolk-scene-ready', () => at('ready'));
  addEventListener('tablefolk-scenario-started', () => at('started'));
  window.__tfAt = at;
  // main-thread long tasks per second (VERBOSE prints them)
  T.lt = {}; try { new PerformanceObserver(l => { for (const e of l.getEntries()) { const k = Math.floor((e.startTime - T.t0) / 1000); T.lt[k] = Math.round((T.lt[k] || 0) + e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch {}
});
const url = `${base}/app/?${art ? 'art=1' : 'play=1&intro=0'}&gfx=${gfx}${extra ? '&' + extra : ''}&scenario=/scenarios/${name}.json&t=${Date.now()}`;
const t0 = Date.now();
if (process.env.VERBOSE) page.on('console', m => { const t = m.text(); if (/\[character\]|\[brain|litert|auto-load|tablefolk-world\] (?!RAW|ABOUT|render)/i.test(t)) console.log(((Date.now() - t0) / 1000).toFixed(1), 'console', t.slice(0, 160)); });
await page.goto(url);
const r = { name, art, gfx };
let last = -1, stableSince = 0, status = '';
for (;;) {
  const s = await page.evaluate(() => {
    const at = window.__tfAt;
    if (window.tablefolkScenario?.active && window.TABLEFOLK_STATE?.playerAvatar) at?.('active');
    if (window.tablefolk?.brainReady?.()) at?.('brain');
    return { T: window.__tfStart, consent: !document.getElementById('modelConsent')?.hidden && !!document.getElementById('modelConsent'), st: document.getElementById('brainStatus')?.textContent || '', meshes: window.TABLEFOLK_STATE?.scene?.meshes.length || 0, pending: window.__tfDressPending?.() || 0, marks: window.__tfMarks || null };
  }).catch(() => ({}));
  const t = (Date.now() - t0) / 1000;
  if (s.consent && !art) { r.error = 'model download prompt: not approved'; break; }
  if (s.st !== status) { status = s.st; if (process.env.VERBOSE) console.log(t.toFixed(1), 'status', status); }
  const T = s.T || {};
  if (T.active != null && r.dressed == null) {
    if (s.meshes !== last || s.pending) { last = s.meshes; stableSince = t; }
    else if (t - stableSince >= 3) r.dressed = +stableSince.toFixed(1);
  }
  const doneBrain = art || (T.brain != null && T.firstTurn != null);
  if (r.dressed != null && doneBrain) { Object.assign(r, T, { t0: undefined }); r.marks = s.marks; break; }
  if (t > limit) { Object.assign(r, T, { t0: undefined }); r.timeout = true; r.status = status; r.marks = s.marks; break; }
  await new Promise(res => setTimeout(res, 200));
}
if (process.env.VERBOSE) { const lt = await page.evaluate(() => window.__tfStart?.lt).catch(() => null); console.log('long tasks ms by second:', JSON.stringify(lt)); }
console.log(JSON.stringify(r));
process.exit(0);
