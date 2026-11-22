// Start-up timing: seconds from navigation to scene ready, world active (the
// scenario started and the player's avatar stands: the player can move),
// the loading cover shown and lifted (app/loading.js: `coverShown`,
// `reveal`), brain ready, the first model call, the first character turn, and
// fully dressed (scene mesh count steady 3 s after the world is active, and no
// dressing work pending in window.__tfMarks). With --art the page gets ?art=1
// (no model). Prints one JSON line; window.__tfMarks (ms summed per part) and
// the loading stages (window.tablefolkLoading.log) are included. `gap`: the
// longest pause between drawn frames (`frame`, a held or frozen picture) and
// between animation frames (`raf`, the main thread) in the 20 s after the
// reveal, in ms, with when (`frameAt`, `rafAt`, s); the run waits for them. Never
// approves a model download.
//
//   node startup-time.mjs <scenario name> [--art] [--base=http://localhost:8000]
//        [--gfx=light|high] [--query=fps=10] [--timeout=150] [--shots=DIR]
//
// --shots=DIR: a screenshot every 500 ms until the world is dressed (DIR/NN-t.jpg),
// with whether the cover was up; `visibleBeforeDressed` counts the samples where
// the world showed (no cover) before it was fully dressed: intermediate stages a
// player saw (0 is the goal). `changedAfterReveal`: the mesh count still changed
// after the cover lifted (dressing finished in view). Screenshots cost some
// time: take timings from runs without --shots.
//
// Use a fresh test Chrome per run for numbers with a model (a long-lived
// Chrome's GPU state slows the model; testing.md).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), flag = n => { const a = args.find(x => x === '--' + n || x.startsWith('--' + n + '=')); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const name = args.find(a => !a.startsWith('--'));
const art = !!flag('art'), base = flag('base') || 'http://localhost:8000', gfx = flag('gfx') || 'light', extra = flag('query') || '', limit = +(flag('timeout') || 150);
const shots = typeof flag('shots') === 'string' ? flag('shots') : null;
if (shots) mkdirSync(shots, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0];
const page = ctx.pages()[0] || await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: +(process.env.SHOT_W || 800), height: +(process.env.SHOT_H || 500), deviceScaleFactor: 1, mobile: false });
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
  addEventListener('tablefolk-world-ready', () => at('reveal'));
  window.__tfAt = at;
  // the longest gap between drawn frames (TABLEFOLK_FRAMES steps) and between
  // animation frames (the main thread) in the first 20 s after the reveal
  const G = T.gap = { frame: 0, frameAt: null, raf: 0, rafAt: null };
  let lastF = -1, lastFT = 0, lastR = 0;
  const tick = () => {
    const t = performance.now(), sec = +((t - T.t0) / 1000).toFixed(2);
    if (T.reveal != null && sec <= T.reveal + 20) {
      const f = window.TABLEFOLK_FRAMES || 0;
      if (lastR) { const d = t - lastR; if (d > G.raf) { G.raf = Math.round(d); G.rafAt = sec; } }
      if (f !== lastF) { if (lastF >= 0) { const d = t - lastFT; if (d > G.frame) { G.frame = Math.round(d); G.frameAt = sec; } } lastF = f; lastFT = t; }
      else if (lastF >= 0 && t - lastFT > G.frame) { G.frame = Math.round(t - lastFT); G.frameAt = sec; }
    }
    if (T.reveal != null && sec >= T.reveal + 20) G.done = true;
    lastR = t; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // main-thread long tasks per second (VERBOSE prints them)
  T.lt = {}; try { new PerformanceObserver(l => { for (const e of l.getEntries()) { const k = Math.floor((e.startTime - T.t0) / 1000); T.lt[k] = Math.round((T.lt[k] || 0) + e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch {}
});
const url = `${base}/app/?${art ? 'art=1' : 'play=1&intro=0'}&gfx=${gfx}${extra ? '&' + extra : ''}&scenario=/scenarios/${name}.json&t=${Date.now()}`;
const t0 = Date.now();
if (process.env.VERBOSE) page.on('console', m => { const t = m.text(); if (/\[character\]|\[brain|\[loading|litert|auto-load|tablefolk-world\] (?!RAW|ABOUT|render)/i.test(t)) console.log(((Date.now() - t0) / 1000).toFixed(1), 'console', t.slice(0, 160)); });
await page.goto(url);
const r = { name, art, gfx };
let last = -1, stableSince = 0, status = '', lastChange = 0;
// screenshots every 500 ms until dressed (and reveal), with the cover's state
const samples = [];
let sampling = !!shots;
const sampler = (async () => {
  let n = 0;
  while (sampling) {
    const t = (Date.now() - t0) / 1000;
    try {
      // headless page screenshots leave the WebGPU canvas black (shot.mjs): the canvas is read
      // itself (what is drawn under the cover, too); a page screenshot shows the cover when it is up
      const s = await page.evaluate(() => { const c = document.getElementById('loadCover'), cv = document.getElementById('renderCanvas'); let img = null; try { img = cv?.toDataURL('image/jpeg', .45); } catch {} return { cover: !!c && !c.hidden && +getComputedStyle(c).opacity > .98, frames: window.TABLEFOLK_FRAMES || 0, img }; });
      const file = `${shots}/${String(n).padStart(3, '0')}-${t.toFixed(1)}s${s.cover ? '-cover' : ''}.jpg`;
      if (s.img) writeFileSync(file, Buffer.from(s.img.split(',')[1], 'base64'));
      if (s.cover && (!samples.some(x => x.cover) || samples.filter(x => x.cover).length === 8)) { const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 }); writeFileSync(`${shots}/cover-page-${t.toFixed(1)}s.jpg`, Buffer.from(shot.data, 'base64')); }
      n++;
      samples.push({ t: +t.toFixed(1), cover: s.cover, frames: s.frames, file });
    } catch {}
    await new Promise(res => setTimeout(res, 500));
  }
})();
for (;;) {
  const s = await page.evaluate(() => {
    const at = window.__tfAt;
    if (window.tablefolkScenario?.active && window.TABLEFOLK_STATE?.playerAvatar) at?.('active');
    if (window.tablefolk?.brainReady?.()) at?.('brain');
    const c = document.getElementById('loadCover');
    if (c && !c.hidden) at?.('coverShown');
    return { T: window.__tfStart, consent: !document.getElementById('modelConsent')?.hidden && !!document.getElementById('modelConsent'), st: document.getElementById('brainStatus')?.textContent || '', meshes: window.TABLEFOLK_STATE?.scene?.meshes.length || 0, pending: window.__tfDressPending?.() || 0, marks: window.__tfMarks || null, hasLoading: !!window.tablefolkLoading };
  }).catch(() => ({}));
  const t = (Date.now() - t0) / 1000;
  if (s.consent && !art) { r.error = 'model download prompt: not approved'; break; }
  if (s.st !== status) { status = s.st; if (process.env.VERBOSE) console.log(t.toFixed(1), 'status', status); }
  const T = s.T || {};
  if (s.meshes !== last) { last = s.meshes; lastChange = t; }
  if (T.active != null && r.dressed == null) {
    if (s.meshes !== last || s.pending) stableSince = t;
    else if (t - Math.max(stableSince, lastChange) >= 3) r.dressed = +Math.max(stableSince, lastChange).toFixed(1);
  }
  const doneBrain = art || (T.brain != null && T.firstTurn != null);
  const doneReveal = T.reveal != null || !s.hasLoading || t > 60;
  const doneGap = !s.hasLoading || (T.reveal != null && (T.gap?.done || t > T.reveal + 25));
  if (r.dressed != null && doneReveal) sampling = false;
  if (r.dressed != null && doneBrain && doneReveal && doneGap) { Object.assign(r, T, { t0: undefined, lt: undefined }); r.marks = s.marks; break; }
  if (t > limit) { Object.assign(r, T, { t0: undefined, lt: undefined }); r.timeout = true; r.status = status; r.marks = s.marks; break; }
  await new Promise(res => setTimeout(res, 200));
}
sampling = false; await sampler;
r.stages = await page.evaluate(() => window.tablefolkLoading?.log || null).catch(() => null);
if (r.reveal != null && r.dressed != null) r.changedAfterReveal = r.dressed > r.reveal + .3;
if (shots) {
  // samples showing the world (no cover) after the first frame and before it was fully dressed
  const shown = samples.filter(x => !x.cover && x.frames > 0 && r.dressed != null && x.t < r.dressed);
  r.samples = samples.length; r.visibleBeforeDressed = shown.length; r.visibleFiles = shown.map(x => x.file).slice(0, 12);
}
if (process.env.VERBOSE) { const lt = await page.evaluate(() => window.__tfStart?.lt).catch(() => null); console.log('long tasks ms by second:', JSON.stringify(lt)); }
console.log(JSON.stringify(r));
process.exit(0);
