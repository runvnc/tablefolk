// Fine-grained graphics profile of a Tablefolk page (2026-11-08). Run it in
// the headless test Chrome (no other page open), the server on :8000:
//   HEADLESS=1 tools/browser-test/launch-chrome.sh about:blank
//   node tools/browser-test/gpu-profile/profile.mjs '<url>' out.json [width height]
//   node tools/browser-test/close.mjs
// e.g. url http://localhost:8000/oracle?art=1&gfx=light (art=1: no model).
// Prints, for a 5 s baseline: frame rate, CPU time of scene.render (mean,
// p95), GPU time per frame from WebGPU timestamp queries around every render
// pass (gputime.js patches beginRenderPass/queue.submit before the page loads;
// Babylon's own GPU counter stopped reporting after shader recompiles), draw
// calls, active meshes; the CPU phases inside scene.render (from the scene's
// observables); the cost of each onBeforeRender callback; a 5 s JS sampling
// profile by file and function. Then the ablations in GROUPS (JSON: label ->
// a /regex/ on root mesh names to disable, or "JS:<code>" pushing undo
// functions onto __undo), each measured 2 s against a fresh 2 s baseline,
// with the stall after the change (lights recompile every material).
// Examples: groups-oracle.json, groups-village.json:
//   GROUPS="$(cat tools/browser-test/gpu-profile/groups-oracle.json)" node ...
// QUICK=1: baseline and ablations only. NOMSAA=1: the page with MSAA forced
// off at the WebGPU level (nomsaa.js), to price anti-aliasing.
// Frame rate is no measure of cost: the game keeps two frames in flight and
// Chrome reports a frame done ~17 ms late, so it tops out near 100 fps.
// Uncapped runs (CHROME_EXTRA="--disable-frame-rate-limit --disable-gpu-vsync")
// heat a laptop; the default 60 Hz cap is enough for the GPU timestamps.
// --enable-webgpu-developer-features in CHROME_EXTRA unrounds timestamps (100 us).
import fs from 'fs';
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9223}/json`)).json(); const t = list.find(x => x.type === 'page' && /localhost:8000/.test(x.url)) || list.find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  return { send, ev, close: () => ws.close() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [url, out, W = 1920, H = 1080] = process.argv.slice(2);
const c = await connect();
await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(new URL('./gputime.js', import.meta.url), 'utf8') });
if (process.env.NOMSAA) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(new URL('./nomsaa.js', import.meta.url), 'utf8') });
await c.send('Page.navigate', { url });
const t0 = Date.now();
while (Date.now() - t0 < 40000) { await sleep(500); try { if (await c.ev('!!window.TABLEFOLK_SCENE_READY')) break; } catch {} }
console.log('ready', (Date.now() - t0) / 1000); await sleep(7000);
console.log(await c.ev(fs.readFileSync(new URL('./inpage.js', import.meta.url), 'utf8')));
const res = {};
const run = async (label, ms = 3000) => { await c.ev('__P.start()'); await sleep(ms); const r = await c.ev('__P.stop()'); res[label] = r; console.log(`${label.padEnd(28)} fps ${String(r.fps).padStart(6)} render ${r.renderMs.toFixed(2)} (p95 ${r.renderP95.toFixed(2)}) ms  gpu ${r.gpuMs.toFixed(2)} (p95 ${r.gpuP95.toFixed(2)}, n ${r.gpuFrames}) ms  lat ${r.latMs}  dc ${r.drawCalls} active ${r.active}`); return r; };
const base = await run("baseline", 5000); if (process.env.QUICK) { res.base = base; }

console.log('\nphases (ms, mean, inside scene.render):'); for (const [k, v] of base.phases) console.log('  ' + v.toFixed(3).padStart(7) + '  ' + k);
console.log('\nbefore-render observers (µs per call):'); for (const o of base.observers.slice(0, 25)) console.log('  ' + String(o.us).padStart(7) + '  ' + o.k);
if (!process.env.QUICK) {
// JS sampling profile
await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 100 }); await c.send('Profiler.start'); await sleep(5000);
const { result: { profile } } = await c.send('Profiler.stop');
const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map(); const dt = profile.timeDeltas; let tot = 0;
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); tot += dt[i] || 0; });
const byFile = new Map(); for (const [k, v] of self) { const f = k.split(' ')[1]?.split(':')[0] || '?'; byFile.set(f, (byFile.get(f) || 0) + v); }
console.log(`\nJS self time over ${(tot / 1e6).toFixed(1)} s, by file:`); for (const [k, v] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('  ' + (v / tot * 100).toFixed(1).padStart(5) + '%  ' + k);
console.log('top functions:'); for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('  ' + (v / tot * 100).toFixed(1).padStart(5) + '%  ' + k);
res.profile = [...self].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => [k, v / tot]);
}
// ablations
const groups = JSON.parse(process.env.GROUPS || '{}');
const off = async (expr) => c.ev(`(() => { const sc = TABLEFOLK_STATE.scene; window.__undo = []; ${expr}; return __undo.length; })()`);
const restore = () => c.ev('(() => { for (const f of __undo.reverse()) f(); return 1; })()');
const meshOff = re => `for (const m of sc.meshes) { let p = m; while (p.parent) p = p.parent; if (${re}.test(p.name) && m.isEnabled(false)) { m.setEnabled(false); __undo.push(() => m.setEnabled(true)); } }`;
const settle = async () => { const t = Date.now(); let f = await c.ev('TABLEFOLK_FRAMES'); const f0 = f; while (Date.now() - t < 20000) { await sleep(50); const g = await c.ev('TABLEFOLK_FRAMES'); if (g - f0 >= 20) break; } return Date.now() - t; };
console.log('\nablations (turn one thing off):');
for (const [label, expr] of Object.entries(groups)) { const b0 = await run('  base', 2000); const n = await off(expr.startsWith('JS:') ? expr.slice(3) : meshOff(expr)); const st = await settle(); await sleep(300); const r = await run(`-${label.slice(0,22)} (${n})`, 2000); r.stall = st; r.base = b0; console.log(`   => saves gpu ${(b0.gpuMs - r.gpuMs).toFixed(2)} ms, cpu render ${(b0.renderMs - r.renderMs).toFixed(2)} ms, ${b0.drawCalls - r.drawCalls} draw calls`); console.log('   (stall after change ' + st + ' ms)'); await restore(); await settle(); await sleep(300); }
fs.writeFileSync(out, JSON.stringify(res, null, 1));
c.close();
