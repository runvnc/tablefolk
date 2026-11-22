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
// reveal (with ?cover=0: after 'active'), in ms, with when (`frameAt`, `rafAt`,
// s); the run waits for them. `unseen`: the game clock
// when the cover lifted against the scenario's `time` (`clockAtStart`), and the
// characters that moved since the world started (`moved`, ids): nothing should live unseen under the cover (live.js). Never
// approves a model download.
//
//   node startup-time.mjs <scenario name> [--art] [--base=http://localhost:8000]
//        [--gfx=light|high] [--query=fps=10] [--timeout=150] [--shots=DIR] [--trace[=FILE]]
//
// --trace: per phase of the model's set-up (start, download, weights, setup,
// warmup, ready; from its status text): seconds, frames drawn (fps), the longest
// drawn-frame gap, rAF gap (main thread) and GPU frame latency (submit to done),
// in `phases`; =FILE keeps the raw samples.
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
// a fresh headless Chrome's first tab was sometimes left hidden: no animation
// frames, so the scene never started (a whole run timed out with only the first
// status). Focus emulation and an active lifecycle keep it drawing.
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await cdp.send('Page.enable').catch(() => {});
await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
await page.goto('about:blank');
if (flag('trace')) await page.addInitScript(() => { window.__tfTraceOn = true; });
// --ls=key=value[,key=value]: localStorage entries set before the page loads (e.g. tablefolk_load_pace=4:8)
if (typeof flag('ls') === 'string') await page.addInitScript(kv => { try { for (const p of kv.split(',')) { const i = p.indexOf('='); localStorage.setItem(p.slice(0, i), p.slice(i + 1)); } } catch {} }, flag('ls'));
// the model worker's own log lines ([litert-worker] weights, warm-up), with times (`workerLog`)
const workerLog = [];
page.on('worker', w => w.on('console', m => { const t = m.text(); if (/litert-worker|warm-up|wllama|bonsai/i.test(t)) workerLog.push([+((Date.now() - t0w) / 1000).toFixed(2), t.slice(0, 160)]); }));
let t0w = Date.now();
// --audit: every start of AI work in the page, with its time and caller: workers
// and shared workers created, GPU devices requested (Babylon's own is marked), model-file and model-host
// fetches, the origin's private file system and Cache Storage opened. `audit`
// lists them with `beforeSettle` (before the cover's settle ended): the rule is
// that nothing AI-related begins before the graphics have settled.
if (flag('audit')) await page.addInitScript(() => {
  const A = window.__tfAudit = [], t0 = performance.now();
  const who = () => (new Error().stack || '').split('\n').slice(2).map(l => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/, '').replace(/\?v=\w+/, '')).filter(l => !/__tfAudit|addInitScript/.test(l)).slice(0, 3).join(' < ');
  const note = (kind, what) => A.push({ t: +((performance.now() - t0) / 1000).toFixed(2), kind, what: String(what).slice(0, 120), by: who() });
  const W = window.Worker;
  window.Worker = function (url, opts) { note('worker', url); return new W(url, opts); };
  window.Worker.prototype = W.prototype;
  const SW = window.SharedWorker;
  if (SW) { window.SharedWorker = function (url, opts) { note('shared-worker', url); return new SW(url, opts); }; window.SharedWorker.prototype = SW.prototype; }
  const AD = window.GPUAdapter?.prototype;
  if (AD?.requestDevice) { const rd = AD.requestDevice; AD.requestDevice = function (...a) { note('gpu-device', ''); return rd.apply(this, a); }; }
  const MODEL = /\.(litertlm|gguf|onnx|safetensors|task|tflite|bin|wasm)(\?|$)|huggingface\.co|geebr-models|hf\.co|jsdelivr\.net\/npm\/@(litert|huggingface|mlc|wllama)/i;
  const F = window.fetch;
  window.fetch = function (u, o) { const url = typeof u === 'string' ? u : u?.url || String(u); if (MODEL.test(url)) note('fetch', url); return F.call(this, u, o); };
  const gd = navigator.storage?.getDirectory?.bind(navigator.storage);
  if (gd) navigator.storage.getDirectory = () => { note('opfs', 'getDirectory'); return gd(); };
  const co = caches?.open?.bind(caches);
  if (co) caches.open = n => { note('cache-storage', n); return co(n); };
});
await page.addInitScript(() => {
  try { localStorage.setItem('tablefolkTtsEnabled', '0'); for (const k of Object.keys(localStorage)) if (k.startsWith('tablefolk-mind:') || k.startsWith('tablefolk-journey')) localStorage.removeItem(k); } catch {}
  const T = window.__tfStart = { t0: performance.now() };
  const at = k => { if (T[k] == null) T[k] = +((performance.now() - T.t0) / 1000).toFixed(2); };
  addEventListener('tablefolk-model-call', () => at('firstCall'));
  addEventListener('tablefolk-agent-turn', e => { if (!e.detail?.reflex) at('firstTurn'); });
  addEventListener('tablefolk-scene-ready', () => at('ready'));
  addEventListener('tablefolk-scenario-started', () => at('started'));
  // nothing lives unseen under the cover: the clock and every character's square
  // when the world started and when it was shown (`unseen`: clock at both, how many moved)
  const snap = () => { const S = window.TABLEFOLK_STATE; return { clock: S?.clock ? { ...S.clock } : null, live: !!window.tablefolkLive?.on, pos: Object.fromEntries((S?.characters || []).map(c => { const p = c.logicalPos || c.root?.position; return [c.id, p ? [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10] : null]; })) }; };
  addEventListener('tablefolk-scenario-started', e => { if (!e.detail?.sub && !T.unseen) T.unseen = { start: snap() }; });
  addEventListener('tablefolk-world-ready', () => {
    at('reveal');
    const u = T.unseen; if (u && !u.reveal) { u.reveal = snap(); u.moved = Object.keys(u.start.pos).filter(k => JSON.stringify(u.start.pos[k]) !== JSON.stringify(u.reveal.pos[k])); u.scenarioTime = window.tablefolkScenario?.active?.scn?.time || null; const m = /^(\d+):(\d+)$/.exec(u.scenarioTime || ''); u.clockAtStart = !!(m && u.reveal.clock && u.reveal.clock.min === +m[1] * 60 + +m[2] && u.reveal.clock.day === 1); u.liveAtReveal = u.reveal.live; u.reveal = { clock: u.reveal.clock }; delete u.start; }
  });
  window.__tfAt = at;
  // the longest gap between drawn frames (TABLEFOLK_FRAMES steps) and between
  // animation frames (the main thread) in the first 20 s after the reveal
  const G = T.gap = { frame: 0, frameAt: null, raf: 0, rafAt: null };
  let lastF = -1, lastFT = 0, lastR = 0;
  // with the cover off (?cover=0) the world is in view from the start: measured from 'active'
  const shownAt = () => T.reveal ?? (window.tablefolkLoading?.off ? T.active : null);
  const tick = () => {
    const t = performance.now(), sec = +((t - T.t0) / 1000).toFixed(2), R = shownAt();
    if (R != null && sec <= R + 20) {
      const f = window.TABLEFOLK_FRAMES || 0;
      if (lastR) { const d = t - lastR; if (d > G.raf) { G.raf = Math.round(d); G.rafAt = sec; } }
      if (f !== lastF) { if (lastF >= 0) { const d = t - lastFT; if (d > G.frame) { G.frame = Math.round(d); G.frameAt = sec; } } lastF = f; lastFT = t; }
      else if (lastF >= 0 && t - lastFT > G.frame) { G.frame = Math.round(t - lastFT); G.frameAt = sec; }
    }
    if (R != null && sec >= R + 20) G.done = true;
    lastR = t; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // --trace: every rAF, what changed (drawn frames, the brain's status, the GPU's longest
  // frame latency), so the node side can attribute pauses to the model's phases
  T.trace = [];
  let lastStatus = '', traceF = -1, traceR = 0;
  const trace = () => {
    const t = performance.now(), sec = +((t - T.t0) / 1000).toFixed(3);
    const st = document.getElementById('brainStatus')?.textContent || '', f = window.TABLEFOLK_FRAMES || 0;
    const lat = Math.round(window.TABLEFOLK_GPU_LAT || 0); window.TABLEFOLK_GPU_LAT = 0;
    const rgap = traceR ? Math.round(t - traceR) : 0; traceR = t;
    if (st !== lastStatus || f !== traceF || rgap > 50 || lat > 50) { T.trace.push([sec, f, rgap, lat, st !== lastStatus ? st.slice(0, 70) : undefined]); lastStatus = st; traceF = f; }
    if (T.trace.length < 60000) requestAnimationFrame(trace);
  };
  if (window.__tfTraceOn) requestAnimationFrame(trace);
  // main-thread long tasks per second (VERBOSE prints them)
  T.lt = {}; try { new PerformanceObserver(l => { for (const e of l.getEntries()) { const k = Math.floor((e.startTime - T.t0) / 1000); T.lt[k] = Math.round((T.lt[k] || 0) + e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch {}
});
const url = `${base}/app/?${art ? 'art=1' : 'play=1&intro=0'}&gfx=${gfx}${extra ? '&' + extra : ''}&scenario=/scenarios/${name}.json&t=${Date.now()}`;
// --profile[=FILE]: a CPU profile of the page's main thread from navigation to the reveal:
// `profile` lists the top functions by self time and the scripts by self time
// (=FILE keeps the .cpuprofile for Chrome's Performance panel)
const profiling = !!flag('profile');
if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
const t0 = Date.now(); t0w = t0;
if (process.env.VERBOSE) page.on('console', m => { const t = m.text(); if (/\[character\]|\[brain|\[loading|litert|auto-load|tablefolk-world\] (?!RAW|ABOUT|render)/i.test(t)) console.log(((Date.now() - t0) / 1000).toFixed(1), 'console', t.slice(0, 160)); });
await page.goto(url);
const r = { name, art, gfx };
r.visibility = await page.evaluate(() => document.visibilityState).catch(() => null);
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
    return { T: window.__tfStart, consent: !document.getElementById('modelConsent')?.hidden && !!document.getElementById('modelConsent'), st: document.getElementById('brainStatus')?.textContent || '', meshes: window.TABLEFOLK_STATE?.scene?.meshes.length || 0, pending: window.__tfDressPending?.() || 0, marks: window.__tfMarks || null, hasLoading: !!window.tablefolkLoading, coverOff: !!window.tablefolkLoading?.off };
  }).catch(() => ({}));
  const t = (Date.now() - t0) / 1000;
  if (s.consent && !art) { r.error = 'model download prompt: not approved'; break; }
  // a page that never draws (no scene after 45 s: seen right after another run's Chrome
  // closed with a model on the card) fails fast instead of waiting out the timeout
  if (t > 45 && s.T && s.T.ready == null) { r.error = 'page stalled: no scene after 45 s (the GPU may still be busy from the last Chrome)'; break; }
  if (s.st !== status) { status = s.st; if (process.env.VERBOSE) console.log(t.toFixed(1), 'status', status); }
  const T = s.T || {};
  if (s.meshes !== last) { last = s.meshes; lastChange = t; }
  if (T.active != null && r.dressed == null) {
    if (s.meshes !== last || s.pending) stableSince = t;
    else if (t - Math.max(stableSince, lastChange) >= 3) r.dressed = +Math.max(stableSince, lastChange).toFixed(1);
  }
  const doneBrain = art || (T.brain != null && T.firstTurn != null);
  const doneReveal = T.reveal != null || !s.hasLoading || s.coverOff || t > 60;
  const R = T.reveal ?? (s.coverOff ? T.active : null);
  const doneGap = !s.hasLoading || (R != null && (T.gap?.done || t > R + 25));
  if (r.dressed != null && doneReveal) sampling = false;
  if (r.dressed != null && doneBrain && doneReveal && doneGap) { Object.assign(r, T, { t0: undefined, lt: undefined }); r.marks = s.marks; break; }
  if (t > limit) { Object.assign(r, T, { t0: undefined, lt: undefined }); r.timeout = true; r.status = status; r.marks = s.marks; break; }
  await new Promise(res => setTimeout(res, 200));
}
sampling = false; await sampler;
r.stages = await page.evaluate(() => window.tablefolkLoading?.log || null).catch(() => null);
if (profiling) {
  const { profile } = await cdp.send('Profiler.stop');
  if (typeof flag('profile') === 'string') writeFileSync(flag('profile'), JSON.stringify(profile));
  // self time per node from the samples (until the reveal when there was one)
  const byId = new Map(profile.nodes.map(n => [n.id, n])), self = new Map();
  const end = r.reveal != null ? profile.startTime + r.reveal * 1e6 + 2e6 : Infinity;
  let t = profile.startTime;
  profile.samples.forEach((id, i) => { t += profile.timeDeltas[i] || 0; if (t > end) return; const d = (profile.timeDeltas[i + 1] || 0) / 1000; self.set(id, (self.get(id) || 0) + d); });
  const fn = new Map(), file = new Map();
  for (const [id, ms] of self) {
    const c = byId.get(id)?.callFrame || {}, u = (c.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '') || '(' + (c.functionName || 'native') + ')';
    const k = (c.functionName || '(anon)') + ' ' + u.split('/').pop() + ':' + (c.lineNumber + 1);
    fn.set(k, (fn.get(k) || 0) + ms); file.set(u, (file.get(u) || 0) + ms);
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => [k, Math.round(ms)]);
  r.profile = { functions: top(fn, 30), scripts: top(file, 15) };
}
if (workerLog.length) r.workerLog = workerLog;
if (flag('audit')) {
  // the reveal follows the settle at once (the stages' own times count from loading.js's load, not navigation)
  const settled = r.reveal;
  r.settledAt = settled;
  r.audit = (await page.evaluate(() => window.__tfAudit || []).catch(() => [])).map(a => ({ ...a, beforeSettle: settled != null && a.t < settled }));
}
if (flag('trace')) {
  // phases of the model's set-up by its status text; per phase: length, frames drawn,
  // the longest drawn-frame gap, rAF (main thread) gap and GPU frame latency
  const tr = await page.evaluate(() => window.__tfStart?.trace || []).catch(() => []);
  const phaseOf = st => /download/i.test(st) ? 'download' : /checking|cache|Loading LiteRT|Model:/i.test(st) ? 'start' : /onto the graphics card/i.test(st) ? 'weights' : /setting up the model|initializ/i.test(st) ? 'setup' : /warming/i.test(st) ? 'warmup' : /ready/i.test(st) ? 'ready' : 'other';
  const ph = []; let cur = null, lastF = null, lastFT = null;
  for (const [t, f, rg, lat, st] of tr) {
    if (st != null) { const name = phaseOf(st); if (!cur || cur.name !== name) { if (cur) cur.end = t; cur = { name, start: t, frames: 0, frameGap: 0, rafGap: 0, gpuLat: 0 }; ph.push(cur); } }
    if (!cur) continue;
    if (lastF != null && f !== lastF) { cur.frames += f - lastF; cur.frameGap = Math.max(cur.frameGap, Math.round((t - lastFT) * 1000)); }
    if (f !== lastF) { lastF = f; lastFT = t; }
    cur.rafGap = Math.max(cur.rafGap, rg); cur.gpuLat = Math.max(cur.gpuLat, lat);
  }
  if (cur) cur.end = tr.at(-1)?.[0];
  r.phases = ph.filter(p => p.name !== 'other' || p.end - p.start > .5).map(p => ({ ...p, s: +(p.end - p.start).toFixed(2), fps: p.end > p.start ? +(p.frames / (p.end - p.start)).toFixed(1) : 0 }));
  if (typeof flag('trace') === 'string') writeFileSync(flag('trace'), JSON.stringify(tr));
}
if (r.reveal != null && r.dressed != null) r.changedAfterReveal = r.dressed > r.reveal + .3;
if (shots) {
  // samples showing the world (no cover) after the first frame and before it was fully dressed
  const shown = samples.filter(x => !x.cover && x.frames > 0 && r.dressed != null && x.t < r.dressed);
  r.samples = samples.length; r.visibleBeforeDressed = shown.length; r.visibleFiles = shown.map(x => x.file).slice(0, 12);
}
if (process.env.VERBOSE) { const lt = await page.evaluate(() => window.__tfStart?.lt).catch(() => null); console.log('long tasks ms by second:', JSON.stringify(lt)); }
console.log(JSON.stringify(r));
process.exit(0);
