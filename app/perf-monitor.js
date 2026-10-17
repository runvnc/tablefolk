(() => {
  'use strict';
  // Lightweight, always-on rendering/audio profiler. Built to help track down
  // the audio-glitching-during-heavy-rendering issue (?norender=1 makes it go
  // away - see app.js's TABLEFOLK_FORCE_NO_RENDER). Two layers:
  //   1. A main-thread frame-time sampler running its own requestAnimationFrame
  //      loop, independent of Babylon's render loop, so it keeps working even
  //      under ?norender=1 for A/B comparison.
  //   2. Hand-placed begin('name')/end('name') markers around the specific
  //      per-frame hot spots found while investigating (sea wave/foam in
  //      terrain-hd.js, character animate() in app.js, TTS spatial-pan update
  //      in pocket-tts-manager.js). See window.TablefolkPerf.begin/end.
  //   3. Every frame that runs long (>LONG_FRAME_MS) also snapshots Babylon's
  //      own per-frame (not session-average) render/render-target/physics/
  //      inter-frame counters, plus a JS heap-size delta (Chrome/Edge only,
  //      via performance.memory) as a "did a GC probably run here" heuristic.
  //      This exists because the first round of profiling showed long frames
  //      (66ms, one 316ms) whose hand-instrumented sections were all under
  //      2ms combined - i.e. the real cost is somewhere this file didn't
  //      originally look (GPU submission inside scene.render(), or GC). These
  //      per-spike snapshots are how we find out which.
  // Overhead when idle (not visibly displayed) is a handful of performance.now()
  // calls and array pushes per frame - negligible next to what it's measuring.
  //
  // Multiple independent rAF callbacks (ours vs Babylon's internal render loop)
  // fire within the same tick but their relative order isn't guaranteed, so the
  // "heaviest section" attributed to a given long frame is a close estimate,
  // not a precise trace. Good enough to spot which subsystem is dominating.

  const HISTORY_FRAMES = 300;      // ~5s at 60fps, ~10s at 30fps
  const LONG_FRAME_MS = 50;        // below 20fps for that frame
  const MAX_LONG_FRAME_LOG = 40;
  const SECTION_NOTES = {
    'sea.wave': 'sea vertex displacement + ComputeNormals over a 72x72 grid, every frame',
    'sea.foam': '2 shoreline foam ribbons, full VertexData array rebuild + ComputeNormals every frame (GC churn)',
    'sea.misc': 'glints/crests/lilies/haze-band position updates',
    'animate.characters': 'character anim/turn-move/emote update loop',
    'tts.spatial': 'stereo pan/gain recompute (runs only while the TTS spatial ticker is active)'
  };
  const SECTION_ALL_NAMES = Object.keys(SECTION_NOTES);

  const frameTimes = [];
  const longFrames = [];
  let sectionAccum = {};
  const sectionEwma = {};
  const sectionOpenAt = {};

  let lastFrameStart = performance.now();
  const startedAt = performance.now();
  let frameCount = 0;
  const HEAP_AVAILABLE = !!performance.memory;
  let lastHeap = HEAP_AVAILABLE ? performance.memory.usedJSHeapSize : null;

  let engine = null, scene = null, sceneInstrumentation = null, engineInstrumentation = null;

  function begin(name) { sectionOpenAt[name] = performance.now(); }
  function end(name) {
    const t0 = sectionOpenAt[name];
    if (t0 == null) return;
    sectionAccum[name] = (sectionAccum[name] || 0) + (performance.now() - t0);
    sectionOpenAt[name] = null;
  }

  function stats(arr) {
    if (!arr.length) return { avg: 0, min: 0, max: 0, p95: 0 };
    const sorted = arr.slice().sort((a, b) => a - b);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { avg, min: sorted[0], max: sorted[sorted.length - 1], p95: sorted[Math.floor(sorted.length * .95)] };
  }

  function onFrame(now) {
    requestAnimationFrame(onFrame);
    const ms = now - lastFrameStart;
    lastFrameStart = now;
    frameCount++;
    frameTimes.push(ms);
    if (frameTimes.length > HISTORY_FRAMES) frameTimes.shift();

    // Walk every known section name (not just the ones that fired this
    // frame) so a section that was just toggled off decays its displayed
    // average back toward 0 within a couple seconds, instead of freezing on
    // its last value forever (which previously made a disabled section look
    // like it was still running).
    let heaviestName = null, heaviestMs = 0;
    for (const name of SECTION_ALL_NAMES) {
      const v = sectionAccum[name] || 0;
      sectionEwma[name] = sectionEwma[name] == null ? v : sectionEwma[name] * .9 + v * .1;
      if (v > heaviestMs) { heaviestMs = v; heaviestName = name; }
    }
    const heapNow = HEAP_AVAILABLE ? performance.memory.usedJSHeapSize : null;
    if (ms > LONG_FRAME_MS) {
      const rec = { t: +((now - startedAt) / 1000).toFixed(1), ms: +ms.toFixed(1), heaviestName, heaviestMs: +heaviestMs.toFixed(1) };
      if (sceneInstrumentation) {
        const cur = c => (c && typeof c.current === 'number' && !Number.isNaN(c.current)) ? +c.current.toFixed(1) : null;
        rec.render = cur(sceneInstrumentation.renderTimeCounter);
        rec.renderTargets = cur(sceneInstrumentation.renderTargetsRenderTimeCounter);
        rec.activeMeshEval = cur(sceneInstrumentation.activeMeshesEvaluationTimeCounter);
        rec.physics = cur(sceneInstrumentation.physicsTimeCounter);
        rec.interFrame = cur(sceneInstrumentation.interFrameTimeCounter);
      }
      if (heapNow != null && lastHeap != null) {
        const deltaMB = (heapNow - lastHeap) / (1024 * 1024);
        rec.heapDeltaMB = +deltaMB.toFixed(2);
        // A shrinking heap between two consecutive samples almost always means
        // a collection ran in between (allocation alone never reduces it).
        rec.gcSuspected = deltaMB < -1.5;
      }
      longFrames.push(rec);
      if (longFrames.length > MAX_LONG_FRAME_LOG) longFrames.shift();
    }
    if (heapNow != null) lastHeap = heapNow;
    sectionAccum = {};
  }
  requestAnimationFrame(onFrame);

  window.addEventListener('tablefolk-scene-ready', () => {
    const st = window.TABLEFOLK_STATE;
    engine = st?.engine || null;
    scene = st?.scene || null;
    if (scene && window.BABYLON?.SceneInstrumentation) {
      try {
        sceneInstrumentation = new BABYLON.SceneInstrumentation(scene);
        sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
        sceneInstrumentation.captureRenderTargetsRenderTime = true;
        sceneInstrumentation.captureParticlesRenderTime = true;
        sceneInstrumentation.capturePhysicsTime = true;
        sceneInstrumentation.captureFrameTime = true;
        sceneInstrumentation.captureRenderTime = true;
        sceneInstrumentation.captureInterFrameTime = true;
      } catch (e) { console.warn('[TablefolkPerf] SceneInstrumentation unavailable', e); }
    }
    if (engine && window.BABYLON?.EngineInstrumentation) {
      try {
        engineInstrumentation = new BABYLON.EngineInstrumentation(engine);
        engineInstrumentation.captureGPUFrameTime = true;
      } catch (e) { console.warn('[TablefolkPerf] EngineInstrumentation unavailable', e); }
    }
  });

  function engineBackendName() {
    if (!engine) return 'unknown (scene not ready)';
    try { if (window.BABYLON?.WebGPUEngine && engine instanceof BABYLON.WebGPUEngine) return 'WebGPU'; } catch {}
    return 'WebGL' + (engine.webGLVersion === 2 ? '2' : '1');
  }

  function counterMs(counter) {
    if (!counter || typeof counter.average !== 'number' || Number.isNaN(counter.average)) return null;
    return counter.average;
  }

  function buildReport() {
    const fs = stats(frameTimes);
    const flags = ['norender', 'still', 'webgl', 'art', 'nowater'].filter(f => new URLSearchParams(location.search).has(f));
    const lines = [];
    const now = new Date();
    lines.push('TABLEFOLK PERF PROFILE — ' + now.toISOString());
    lines.push('captured over ' + ((performance.now() - startedAt) / 1000).toFixed(1) + 's (' + frameCount + ' frames sampled) | URL flags: ' + (flags.length ? flags.join(', ') : '(none)'));
    lines.push('engine: ' + engineBackendName() + (engine ? ' | canvas ' + engine.getRenderWidth() + 'x' + engine.getRenderHeight() : '') + ' | hw threads: ' + (navigator.hardwareConcurrency || '?'));
    const gfx = window.TABLEFOLK_GFX;
    lines.push('graphics settings: ' + (gfx
      ? 'key shadow ' + (gfx.keyShadowEnabled ? 'on/every ' + gfx.keyShadowEvery + 'f' : 'off')
        + ', campfire shadow ' + (gfx.campfireShadowEnabled ? 'on/every ' + gfx.campfireShadowEvery + 'f' : 'off')
        + ', sea wave ' + (gfx.seaWaveEnabled ? 'on' : 'off') + ', sea foam ' + (gfx.seaFoamEnabled ? 'on' : 'off')
      : '(graphics-settings.js not loaded)'));
    lines.push('');
    lines.push('MAIN-THREAD FRAME TIME (independent rAF sampler, last up to ' + HISTORY_FRAMES + ' frames)');
    lines.push('  avg ' + fs.avg.toFixed(1) + 'ms (' + (1000 / (fs.avg || 1)).toFixed(0) + ' fps)  min ' + fs.min.toFixed(1) + 'ms  max ' + fs.max.toFixed(1) + 'ms  p95 ' + fs.p95.toFixed(1) + 'ms');
    lines.push('  long frames (>' + LONG_FRAME_MS + 'ms) in window: ' + longFrames.length + (longFrames.length >= MAX_LONG_FRAME_LOG ? ' (log capped, oldest dropped)' : ''));
    if (HEAP_AVAILABLE) {
      const withHeap = longFrames.filter(lf => lf.heapDeltaMB != null);
      const gcFrames = withHeap.filter(lf => lf.gcSuspected).length;
      lines.push('  GC heuristic: ' + gcFrames + '/' + withHeap.length + ' long frames coincided with a JS heap drop >1.5MB (heap shrinking almost always means a collection ran)');
    } else {
      lines.push('  GC heuristic: unavailable (performance.memory is Chrome/Edge-only)');
    }
    if (longFrames.length) {
      lines.push('  most recent long frames (babylon.* = Babylon\'s own per-frame counter for that exact frame, not a session average):');
      for (const lf of longFrames.slice(-12)) {
        const bits = [];
        if (lf.heaviestName) bits.push('heaviest hand-timed section: ' + lf.heaviestName + ' (' + lf.heaviestMs + 'ms)');
        if (lf.render != null) bits.push('babylon.render ' + lf.render + 'ms');
        if (lf.renderTargets != null) bits.push('babylon.renderTargets ' + lf.renderTargets + 'ms');
        if (lf.physics != null) bits.push('babylon.physics ' + lf.physics + 'ms');
        if (lf.interFrame != null) bits.push('babylon.interFrame ' + lf.interFrame + 'ms');
        if (lf.heapDeltaMB != null) bits.push('heap Δ' + (lf.heapDeltaMB > 0 ? '+' : '') + lf.heapDeltaMB + 'MB' + (lf.gcSuspected ? ' (GC likely)' : ''));
        lines.push('    +' + lf.t + 's  ' + lf.ms + 'ms' + (bits.length ? '\n        ' + bits.join(', ') : ''));
      }
    }
    lines.push('');
    lines.push('PER-SECTION CPU TIME (rolling avg ms/frame, hand-instrumented)');
    if (!SECTION_ALL_NAMES.some(n => sectionEwma[n] != null)) lines.push('  (no samples yet - scene may not be running)');
    for (const name of SECTION_ALL_NAMES) {
      const v = sectionEwma[name];
      lines.push('  ' + name.padEnd(16) + (v == null ? 'n/a   ' : v.toFixed(2) + 'ms ') + '  ' + SECTION_NOTES[name]);
    }
    lines.push('');
    lines.push('BABYLON SCENE INSTRUMENTATION (engine-reported ms/frame average)');
    if (sceneInstrumentation) {
      const rows = [
        ['active-mesh eval', counterMs(sceneInstrumentation.activeMeshesEvaluationTimeCounter)],
        ['render targets', counterMs(sceneInstrumentation.renderTargetsRenderTimeCounter)],
        ['particles', counterMs(sceneInstrumentation.particlesRenderTimeCounter)],
        ['physics', counterMs(sceneInstrumentation.physicsTimeCounter)],
        ['scene render', counterMs(sceneInstrumentation.renderTimeCounter)],
        ['inter-frame (JS between Babylon frames)', counterMs(sceneInstrumentation.interFrameTimeCounter)],
      ];
      for (const [label, ms] of rows) lines.push('  ' + label.padEnd(40) + (ms == null ? 'n/a' : ms.toFixed(2) + 'ms'));
    } else {
      lines.push('  (unavailable - scene not ready yet, or SceneInstrumentation missing from this Babylon build)');
    }
    const gpuMs = engineInstrumentation ? counterMs(engineInstrumentation.gpuFrameTimeCounter) : null;
    lines.push('  GPU frame time' + ' '.repeat(26) + (gpuMs == null ? 'unsupported on this engine/browser (needs EXT_disjoint_timer_query; typically WebGL only)' : gpuMs.toFixed(2) + 'ms'));
    lines.push('');
    if (scene) {
      lines.push('SCENE COUNTS');
      lines.push('  meshes: ' + scene.meshes.length + '  active this frame: ' + (scene.getActiveMeshes?.().length ?? '?') + '  materials: ' + scene.materials.length + '  babylon fps: ' + (engine?.getFps ? engine.getFps().toFixed(0) : '?'));
      lines.push('');
    }
    const tts = window.tablefolkTTS?.telemetry;
    lines.push('TTS / AUDIO TELEMETRY (window.tablefolkTTS.telemetry)');
    if (tts) {
      lines.push('  backend: ' + tts.backend + '  threads: ' + tts.threads + '  isolated: ' + tts.isolated);
      lines.push('  buffered: ' + tts.bufferedMs + 'ms (min seen ' + (tts.minBufferedMs ?? 'n/a') + 'ms)  underruns: ' + tts.underruns + '  resumes: ' + (tts.resumeCount ?? 0));
      lines.push('  chunks: ' + tts.chunks + '  last chunk RTFx: ' + tts.lastChunkRtfx + '  overall RTFx: ' + tts.rtfx);
      lines.push('  first audio: ' + tts.firstAudioMs + 'ms  audio arrival: ' + tts.audioArrivalMs + 'ms  playback start: ' + tts.playbackStartMs + 'ms');
    } else {
      lines.push('  (TTS manager not loaded)');
    }
    lines.push('');
    lines.push('FINDINGS SO FAR (updated from live profiling across several captures, not just static code review)');
    lines.push('  - Toggling shadows/sea off in the Graphics tab measurably helps: it moves the');
    lines.push('    steady frame cost below the 16.6ms vsync line, avoiding a cliff where the');
    lines.push('    browser drops straight to 33/50/66ms multiples. But renderTargets time barely');
    lines.push('    changed between toggle-on/toggle-off captures, so shadows/sea are NOT the');
    lines.push('    dominant cost - they were just enough to tip the frame over budget.');
    lines.push('  - The bigger unresolved problem is a handful of isolated, massive freezes per');
    lines.push('    session (100ms-1.3s+), uncorrelated with any hand-timed section (all <2ms');
    lines.push('    during these). Several coincide with a heap drop of 15-60MB (GC heuristic');
    lines.push('    above) and a couple show babylon.render itself spiking to ~200ms - i.e. the');
    lines.push('    stall is inside Babylon\'s own render call (possible shader recompile or GPU');
    lines.push('    driver stall), not in anything this file measures directly.');
    lines.push('  - A consistent ~+3.5MB/frame JS heap growth appears in every capture so far,');
    lines.push('    identically whether shadows/sea are on or off - so it is NOT coming from');
    lines.push('    terrain-hd.js. Prime suspect: the TTS pipeline (WASM CPU inference running');
    lines.push('    8 threads + audio chunk handling). Needs a Chrome DevTools Memory allocation');
    lines.push('    recording taken during active speech to identify the exact call stack.');
    return lines.join('\n');
  }

  async function copyReport() {
    const text = buildReport();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Clipboard API blocked (permissions/insecure context) - fall back to a
      // selectable textarea so the user can still Ctrl+C manually.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  function reset() {
    frameTimes.length = 0;
    longFrames.length = 0;
    sectionAccum = {};
    for (const k in sectionEwma) delete sectionEwma[k];
    frameCount = 0;
  }

  window.TablefolkPerf = { begin, end, buildReport, copyReport, reset };

  // ---- debug-pane wiring ----
  function wireUi() {
    const out = document.getElementById('perfOut');
    const liveCb = document.getElementById('perfLive');
    const copyBtn = document.getElementById('copyPerfProfile');
    const resetBtn = document.getElementById('resetPerfProfile');
    if (!out || !copyBtn) return; // markup not present in this build; skip silently
    setInterval(() => { if (liveCb?.checked) out.textContent = buildReport(); }, 500);
    copyBtn.onclick = async () => {
      const ok = await copyReport();
      window.log?.(ok ? 'copied perf profile to clipboard' : 'clipboard blocked - profile text selected, press Ctrl+C');
      out.textContent = buildReport();
    };
    resetBtn.onclick = () => { reset(); out.textContent = buildReport(); window.log?.('perf stats reset'); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUi);
  else wireUi();
})();
