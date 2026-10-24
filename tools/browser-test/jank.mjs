// Jank monitor: loads the app (cold: run with a freshly launched test Chrome)
// and records, every 0.5 s while the model loads and after:
//   frames   requestAnimationFrame callbacks (main thread alive)
//   gap      the longest gap between them, ms
//   gpu      the longest time from a frame's submit to the GPU finishing it
//            (queue.onSubmittedWorkDone): long = the picture stops updating,
//            even when the main thread looks fine
//   input    the longest delay of a real mouse move (sent over DevTools every
//            100 ms, like the OS would) before the page handled it
// plus the brain status lines as they change. Usage:
//   node jank.mjs [url] [seconds]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:8000/app/?play=1';
const secs = +(process.argv[3] || 25);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0];
const page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close();
await page.addInitScript(() => {
  const J = window.__jank = { bins: {}, marks: [] };
  const bin = t => J.bins[Math.floor(t / 500) * 500] ||= { frames: 0, gap: 0, gpu: 0, input: 0 };
  let last = performance.now();
  const raf = t => { const b = bin(t); b.frames++; b.gap = Math.max(b.gap, Math.round(t - last)); last = t; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  addEventListener('pointermove', e => { const d = performance.now() - e.timeStamp; const b = bin(performance.now()); b.input = Math.max(b.input, Math.round(d)); }, { capture: true });
  // GPU: once Babylon's WebGPU engine exists, time every frame's work
  const hook = setInterval(() => {
    const sc = window.TABLEFOLK_STATE?.scene, dev = sc?.getEngine?.()._device; if (!dev) return;
    clearInterval(hook);
    sc.onAfterRenderObservable.add(() => { const t0 = performance.now(); dev.queue.onSubmittedWorkDone().then(() => { const b = bin(t0); b.gpu = Math.max(b.gpu, Math.round(performance.now() - t0)); }); });
  }, 50);
  setInterval(() => { const t = (document.getElementById('brainStatus')?.textContent || '').slice(0, 70); if (t !== J.lastStatus) { J.lastStatus = t; J.marks.push([Math.round(performance.now()), t]); } }, 50);
});
const t0 = Date.now();
await page.goto(url);
// a real mouse move every 100 ms, wandering over the picture
const cdp = await ctx.newCDPSession(page);
let n = 0;
while (Date.now() - t0 < secs * 1000) {
  n++;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600 + Math.sin(n / 5) * 200, y: 400 + Math.cos(n / 7) * 120 }).catch(() => {});
  await new Promise(r => setTimeout(r, 100));
}
const J = await page.evaluate(() => window.__jank);
const marks = [...J.marks];
console.log(' time  frames  gap ms  gpu ms  input ms');
for (const [k, v] of Object.entries(J.bins).sort((a, b) => a[0] - b[0])) {
  while (marks.length && marks[0][0] <= +k + 500) { const m = marks.shift(); console.log(`        -- ${(m[0] / 1000).toFixed(1)}s ${m[1]}`); }
  const bad = v.gap > 200 || v.gpu > 200 || v.input > 200;
  console.log(`${(k / 1000).toFixed(1).padStart(5)}s ${String(v.frames).padStart(6)} ${String(v.gap).padStart(7)} ${String(v.gpu).padStart(7)} ${String(v.input).padStart(9)}${bad ? '   <<' : ''}`);
}
process.exit(0);
