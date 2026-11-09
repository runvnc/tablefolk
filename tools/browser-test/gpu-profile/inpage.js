(() => {
  const sc = TABLEFOLK_STATE.scene, e = sc.getEngine();
  const P = window.__P = { rec: null, obs: {} };
  const EV = ['onBeforeAnimationsObservable','onAfterAnimationsObservable','onBeforeRenderObservable','onBeforePhysicsObservable','onAfterPhysicsObservable','onBeforeActiveMeshesEvaluationObservable','onAfterActiveMeshesEvaluationObservable','onBeforeRenderTargetsRenderObservable','onAfterRenderTargetsRenderObservable','onBeforeCameraRenderObservable','onBeforeDrawPhaseObservable','onAfterDrawPhaseObservable','onAfterCameraRenderObservable','onAfterRenderObservable'];
  let cur = null;
  for (const n of EV) { const o = sc[n]; if (!o) continue;
    o.add(() => { if (cur) cur[n + (n === 'onBeforeRenderObservable' ? ':first' : '')] = performance.now(); }, -1, true);
    if (n === 'onBeforeRenderObservable') o.add(() => { if (cur) cur[n + ':last'] = performance.now(); });
  }
  // wrap the before-render observers
  sc.onBeforeRenderObservable.observers.forEach((ob, i) => {
    const src = ob.callback.toString(); if (/cur\[n/.test(src)) return;
    const key = src.replace(/\s+/g, ' ').slice(0, 110), f = ob.callback;
    ob.callback = function (...a) { const t = performance.now(); const r = f.apply(this, a); if (P.rec) { const s = P.obs[key] ||= { t: 0, n: 0 }; s.t += performance.now() - t; s.n++; } return r; };
  });
  const render = sc.render.bind(sc);
  sc.render = function (...a) { cur = { start: performance.now() }; render(...a); cur.end = performance.now(); if (P.rec) P.rec.frames.push(cur); cur = null; };
  P.timer = !!window.__gpu?.S;
  const si = new BABYLON.SceneInstrumentation(sc); si.captureFrameTime = true;
  P.gpuMs = () => (e.getGPUFrameTimeCounter()?.current || 0) * 1e-6; P.mainMs = () => (e.gpuTimeInFrameForMainPass?.counter?.current ?? e.gpuTimeInFrameForMainPass?.counter?.lastSecAverage ?? 0) * 1e-6;
  let lastRaf = 0; const raf = t => { if (P.rec) { if (lastRaf) P.rec.intervals.push(t - lastRaf); P.rec.gpu.push(P.gpuMs()); P.rec.dc.push(si.drawCallsCounter.current); P.rec.active.push(sc.getActiveMeshes().length); } lastRaf = t; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  // GPU latency: submit to done
  sc.onAfterRenderObservable.add(() => { if (!P.rec) return; const t = performance.now(); e._device.queue.onSubmittedWorkDone().then(() => P.rec && P.rec.lat.push(performance.now() - t)); });
  P.start = () => { P.g0 = performance.now(); P.rec = { frames: [], intervals: [], gpu: [], dc: [], active: [], lat: [], t0: performance.now() }; P.obs = {}; };
  P.stop = () => { const R = P.rec; P.rec = null; R.dur = performance.now() - R.t0;
    const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }, mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, p95 = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * .95)] || 0; };
    // phases: order keys by mean offset from start
    const keys = {}; for (const f of R.frames) for (const k in f) if (k !== 'start') (keys[k] ||= []).push(f[k] - f.start);
    const order = Object.entries(keys).map(([k, a]) => [k, mean(a)]).sort((a, b) => a[1] - b[1]);
    const phases = []; let prev = ['start', 0]; for (const o of order) { phases.push([prev[0] + ' → ' + o[0], +(o[1] - prev[1]).toFixed(3)]); prev = o; }
    const gf = (window.__gpu?.frames || []).filter(f => f.t >= P.g0); const gpu = gf.map(f => f.total); const passAgg = {}; for (const f of gf) f.passes.forEach((p, i) => { const k = i + ':' + (p.label || '?') + (p.depth ? ' +depth' : '') + (p.resolve ? ' +msaa-resolve' : ''); const s = passAgg[k] ||= { ms: 0, n: 0 }; s.ms += p.ms; s.n++; }); const passes = Object.entries(passAgg).map(([k, s]) => [k, +(s.ms / s.n).toFixed(3), s.n]); const span = med(gf.map(f => f.span));
    return { fps: +(R.frames.length / R.dur * 1000).toFixed(1), frames: R.frames.length, renderMs: +mean(R.frames.map(f => f.end - f.start)).toFixed(3), renderP95: +p95(R.frames.map(f => f.end - f.start)).toFixed(3), intervalMed: +med(R.intervals).toFixed(2), intervalP95: +p95(R.intervals).toFixed(2), gpuMs: +med(gpu).toFixed(3), gpuP95: +p95(gpu).toFixed(3), latMs: +med(R.lat).toFixed(2), gpuFrames: gf.length, gpuSpan: +span.toFixed(3), passes, drawCalls: med(R.dc), active: med(R.active), phases,
      observers: Object.entries(P.obs).map(([k, s]) => ({ us: +(s.t / Math.max(1, s.n) * 1000).toFixed(1), n: s.n, k })).sort((a, b) => b.us - a.us) };
  };
  return 'timer ' + P.timer;
})()
