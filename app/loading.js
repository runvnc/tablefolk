/* loading.js -- the loading cover, and "world ready" as one event.
 *
 * A full-screen cover (#loadCover in index.html, up from the first frame)
 * hides the world while it is built: the board, the ground's textures, walls,
 * roofs and building shells, the trees around, props and the characters'
 * real bodies. Every staged builder reports into it, and the cover lifts only
 * when nothing is pending: the player never sees an intermediate stage.
 *
 *   const done = tablefolkLoading.begin(name, { step })   a stage starts (step: one line
 *                                                         in plain words for the cover)
 *   done()                                                 ...and ends (twice is harmless)
 *   tablefolkLoading.track(name, promise, { step })        a stage that is a promise
 *   tablefolkLoading.show({ title, subtitle, short })      put the cover up (a world
 *                                                         opening; short: a section)
 *   tablefolkLoading.whenRevealed()                        resolves when the cover lifts
 *   tablefolkLoading.turn(job) / release(job)              the ordered start-up queue, below
 *   tablefolkLoading.finish(name, fn)                      a last step before every reveal (below)
 *   tablefolkLoading.holdCover(job, { step, capMs })       keep the first cover up for a job (below)
 *   tablefolkLoading.coverUp, .revealed, .pending(), .log
 *
 * Window event 'tablefolk-world-ready' {ms, timedOut, pending, stages} when it lifts.
 *
 * What counts as pending: the stages begun and not ended; every model file
 * loading through BABYLON.SceneLoader (bodies, props, trees: wrapped here, so
 * makeObject's fire-and-forget loads count); a link's world still opening.
 * Once nothing is pending for a moment the cover settles: the scene's
 * materials and textures ready (scene.whenReadyAsync, at most 8 s) and a few
 * frames drawn under it, so shaders are compiled before the first visible
 * frame. Before that, the finishing steps run (`finish(name, fn)`, each at most
 * 10 s; fn may return a promise): app.js freezes the static scenery's matrices
 * and spells.js compiles the spells' shaders, which ran on timers after the
 * reveal and could hitch the first seconds in view. A safety timeout (45 s)
 * lifts it anyway and notes in the "This device" pane which stage was still
 * pending.
 *
 * Holding the cover for a job: a job that called `holdCover(job)` before the
 * first reveal gets its turn as soon as the world is built, and the cover stays
 * up ("Waking the characters…") until it releases, at most `capMs` (30 s; the
 * 45 s safety timeout covers the world's build only), then the world shows and
 * the job finishes in view (noted in the "This device" pane). Not used by
 * default: world-integration.js takes it for the brain only with ?brainhold=1
 * (comparisons; the world then appeared ~25 s later).
 *
 * Start-up queue, one AI engine at a time: nothing AI-related (a model's
 * download, cache read, worker, weights, shaders, warm-up) starts before the
 * world is shown and the picture has settled. A job waits with
 * `await tablefolkLoading.turn(name)`: after the first reveal and `steady()`
 * (a second of frames with no gap over 100 ms, at most 8 s), then after every
 * earlier job in ORDER that is expected (`expect(name)`) or has asked has
 * finished (`release(name)`, or `skip(name)` when it is not coming; at most
 * 10 minutes). Jobs: probe (agent-brain.js: a first visit's GPU measurements,
 * @tablefolk/device runDeferred), brain (world-integration.js: download, weights, warm-up;
 * expected from its decision, so the others wait even while the download
 * question is open), embed (embed.js: EmbeddingGemma for recall), voice
 * (tts-ui.js, pocket-tts-manager.js prepare), speech (speech-input.js). The
 * capability check (agency.js) and the better-voice offer wait for a ready
 * brain; sight loads on a character's first look. Only the download question may come before: it is UI, shown
 * over the cover (world-integration.js).
 *
 * ?cover=0 turns the cover off (start-up as before: the world shows while it
 * builds); hidden render pages (?tiles=1) never show it. While the cover is up
 * the picture draws at most 15 frames a second (app.js), and the dressing gate
 * (tablefolkDressGate) does not wait for the model.
 * Loaded right after Babylon.js (it wraps SceneLoader before app.js uses it).
 */
(function () {
  const q = new URLSearchParams(location.search);
  const off = q.get('cover') === '0' || q.has('tiles');
  const SAFETY_MS = 45000, QUIET_MS = 300, SETTLE_MS = 8000, FRAMES = 4, STEADY_MS = 1000, STEADY_CAP_MS = 8000, JOB_CAP_MS = 600000, FINISH_MS = 10000, HOLD_MS = 30000;
  const ORDER = ['probe', 'brain', 'embed', 'voice', 'speech'];
  const el = () => document.getElementById('loadCover');
  const now = () => performance.now();
  const t0 = now();

  const stages = new Map();        // id -> { name, step, at }
  const log = [];                  // { name, start, end } in s from navigation (the start-up test reads it)
  let seq = 0, covers = 1, unitsDone = 0, unitsAll = 0, shown = 0, lastChange = now();
  let up = !off, revealed = false, everRevealed = false, coverAt = now(), short = false, settling = false;
  let waiters = [], firstReveal = null, firstRevealResolve, builtResolve, waking = false;
  firstReveal = new Promise(r => { firstRevealResolve = r; });
  const built = new Promise(r => { builtResolve = r; });   // the first world is built (the cover may stay up for holds)
  const finishers = new Map();     // name -> fn: last steps before every reveal
  const holds = new Map();         // job -> { step, capMs, ended, end, p }

  function begin(name, opts = {}) {
    const id = ++seq;
    stages.set(id, { name, step: opts.step || STEPS[name] || '', at: now() });
    // (model files are many: one entry per kind and cover, from the first start to the last end)
    const sec = +((now() - t0) / 1000).toFixed(2), many = name === 'bodies' || name === 'props';
    let entry = many ? log.findLast(e => e.name === name && e.cover === covers) : null;
    if (entry) entry.n++;
    else { entry = { name, start: sec, end: null, cover: covers, ...(many ? { n: 1 } : {}) }; if (up) log.push(entry); }
    unitsAll++; lastChange = now(); render(); kick();
    let ended = false;
    return () => {
      if (ended) return; ended = true;
      stages.delete(id); unitsDone++; lastChange = now();
      entry.end = +((now() - t0) / 1000).toFixed(2);
      render(); kick();
    };
  }
  function track(name, p, opts) {
    const done = begin(name, opts);
    Promise.resolve(p).then(done, done);
    return p;
  }
  // what the cover says, by stage name
  const STEPS = {
    scene: 'Setting up the 3D view', opening: 'Opening the world', world: 'Laying out the world',
    ground: 'Painting the ground', walls: 'Raising the walls', roofs: 'Putting on the roofs',
    trees: 'Planting the trees around', bodies: 'Dressing the characters', props: 'Placing buildings and things',
    travel: 'On the way',
  };

  // ---- model files: every SceneLoader load counts (bodies when the path is a character's) ----
  function wrapLoader() {
    const SL = window.BABYLON?.SceneLoader; if (!SL || SL.__tfWrapped) return;
    SL.__tfWrapped = true;
    for (const k of ['ImportMeshAsync', 'LoadAssetContainerAsync', 'AppendAsync']) {
      const orig = SL[k]; if (typeof orig !== 'function') continue;
      SL[k] = function (...a) {
        const path = String(a[0] || '') + String(a[1] || '');
        const done = begin(/characters|people|figures|avatar|meshy|animals/i.test(path) ? 'bodies' : 'props');
        let p; try { p = orig.apply(this, a); } catch (e) { done(); throw e; }
        Promise.resolve(p).then(done, done);
        return p;
      };
    }
  }

  // ---- the cover ----
  function render() {
    const c = el(); if (!c || !up) return;
    const pend = [...stages.values()];
    const frac = settling ? .96 : unitsAll ? unitsDone / unitsAll : 0;
    // never backwards; the settle step fills the last part; waking: full, pulsing (style.css)
    const wake = waking && [...holds.values()].find(h => !h.ended);
    shown = wake ? 1 : Math.max(shown, Math.min(settling ? .99 : .94, frac * .94 + (settling ? .02 : 0)));
    c.classList.toggle('waking', !!wake);
    const bar = c.querySelector('.lc-bar i'); if (bar) bar.style.width = (shown * 100).toFixed(1) + '%';
    c.querySelector('.lc-bar')?.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    const step = wake ? wake.step : settling ? 'Lighting the scene' : (pend.at(-1)?.step || (window.TABLEFOLK_SCENE_READY ? 'Laying out the world' : 'Setting up the 3D view'));
    const s = c.querySelector('.lc-step'); if (s && s.textContent !== step + '…') s.textContent = step + '…';
  }
  function show(opts = {}) {
    if (off) return;
    const c = el(); if (!c) return;
    const wasUp = up;
    if (!wasUp) {
      up = true; revealed = false; coverAt = now(); covers++; shown = 0; unitsDone = 0; unitsAll = stages.size;
      short = !!opts.short; c.classList.toggle('short', short);
      c.hidden = false; c.classList.remove('lifting'); document.documentElement.classList.add('cover-up');
    }
    // a section never turns a world's full cover into the short one
    if (opts.title != null) { const t = c.querySelector('.lc-title'); if (t && (!wasUp || !short || opts.short)) t.textContent = String(opts.title || 'Tablefolk'); }
    if ('subtitle' in opts) { const s = c.querySelector('.lc-sub'); if (s) { s.textContent = opts.subtitle || ''; s.hidden = !opts.subtitle; } }
    render(); kick();
  }
  function lift(timedOut) {
    const c = el(); const ms = Math.round(now() - coverAt);
    up = false; revealed = true; settling = false; c?.classList.remove('waking');
    const pend = [...new Set([...stages.values()].map(s => s.name))];
    if (c) { c.classList.add('lifting'); setTimeout(() => { if (!up) c.hidden = true; }, 380); }
    document.documentElement.classList.remove('cover-up');
    try { window.tablefolkDiag?.note?.('loading', timedOut ? `the world was shown after ${Math.round(ms / 1000)} s with ${pend.join(', ') || 'its last step'} still loading (safety timeout)` : `the world was built and shown in ${(ms / 1000).toFixed(1)} s`); } catch {}
    // (what never ended is dropped: the next cover, a section, must not wait for it)
    if (timedOut) { console.warn('[loading] safety timeout: still pending', pend); stages.clear(); }
    try { window.dispatchEvent(new CustomEvent('tablefolk-world-ready', { detail: { ms, timedOut: !!timedOut, pending: pend, stages: log.slice() } })); } catch {}
    if (!everRevealed) { everRevealed = true; builtResolve(); firstRevealResolve(); }
    const w = waiters; waiters = []; for (const r of w) r();
  }

  // ---- when to lift: nothing pending for a moment, then settle (materials ready, frames drawn) ----
  let timer = null;
  function kick() { if (up && !timer) timer = setTimeout(check, 100); }
  function linkOpening() { return !window.TABLEFOLK_LINK_OPENED && (/(?:^#|&)s(?:cenario)?=/.test(location.hash) || q.has('scenario')); }
  async function check() {
    timer = null;
    if (!up || settling || waking) return;
    if (now() - coverAt > SAFETY_MS) return lift(true);
    if (openingDone && !linkOpening()) { openingDone(); openingDone = null; }
    if (stages.size || !window.TABLEFOLK_SCENE_READY || now() - lastChange < QUIET_MS) { render(); return kick(); }
    settling = true; render();
    const sc = window.TABLEFOLK_STATE?.scene || window.BABYLON?.EngineStore?.LastCreatedScene;
    const ts = now();
    for (const [name, fn] of finishers) {
      const tf = now();
      try { await Promise.race([Promise.resolve().then(fn), new Promise(r => setTimeout(r, FINISH_MS))]); } catch (e) { console.warn('[loading] ' + name, e); }
      log.push({ name, start: +((tf - t0) / 1000).toFixed(2), end: +((now() - t0) / 1000).toFixed(2) });
    }
    try { if (sc?.whenReadyAsync) await Promise.race([sc.whenReadyAsync(), new Promise(r => setTimeout(r, SETTLE_MS))]); } catch {}
    const f0 = window.TABLEFOLK_FRAMES || 0, tf = now();
    while ((window.TABLEFOLK_FRAMES || 0) < f0 + FRAMES && now() - tf < 1500) await new Promise(r => setTimeout(r, 30));
    log.push({ name: 'settle', start: +((ts - t0) / 1000).toFixed(2), end: +((now() - t0) / 1000).toFixed(2) });
    settling = false;
    if (!up) return;
    // something began meanwhile (a body still coming, a rebuild): wait for it too
    if (stages.size || lastChange > ts) { render(); return kick(); }
    if (!everRevealed && [...holds.values()].some(h => !h.ended)) return wake();
    lift(false);
  }
  // the first world is built: the holding jobs start under the cover, which lifts when they release (or the cap)
  async function wake() {
    waking = true; builtResolve(); render();
    const tw = now(), open = [...holds.entries()].filter(([, h]) => !h.ended);
    const cap = Math.max(...open.map(([, h]) => h.capMs));
    const capped = await Promise.race([Promise.all(open.map(([, h]) => h.p)).then(() => false), new Promise(r => setTimeout(() => r(true), cap))]);
    log.push({ name: 'waking', start: +((tw - t0) / 1000).toFixed(2), end: +((now() - t0) / 1000).toFixed(2), ...(capped ? { capped: true } : {}) });
    const late = open.filter(([, h]) => !h.ended).map(([n]) => n);
    for (const [, h] of holds) h.ended = true;
    waking = false;
    if (capped) {
      console.warn('[loading] still starting after the cover\'s cap: shown anyway', late);
      try { window.tablefolkDiag?.note?.('loading', `the world was shown with ${late.join(', ')} still starting after ${Math.round(cap / 1000)} s (it finishes in view)`); } catch {}
    }
    if (up) lift(false);
  }
  function holdCover(name, opts = {}) {
    if (off || everRevealed || !up || holds.has(name)) return false;
    let end; const p = new Promise(r => { end = r; });
    const h = { step: opts.step || 'Waking the characters', capMs: opts.capMs || HOLD_MS, ended: false, p };
    h.end = () => { if (!h.ended) { h.ended = true; } end(); render(); };
    holds.set(name, h);
    return true;
  }
  function finish(name, fn) { finishers.set(name, fn); if (up) kick(); }

  // ---- the ordered start-up queue (after the first reveal) ----
  const jobs = new Map();   // name -> { released: Promise, release() }
  function job(name) {
    if (!jobs.has(name)) { let r; const p = new Promise(res => { r = res; }); jobs.set(name, { released: p, release: r, claimed: false }); }
    return jobs.get(name);
  }
  // the picture has settled after the reveal: a second of frames drawn with no gap over
  // 100 ms (at most 8 s after the reveal); once per page, the first reveal
  let steadyP = null;
  function steady() {
    return steadyP ||= firstReveal.then(() => new Promise(res => {
      const t0s = now(); let lastF = window.TABLEFOLK_FRAMES || 0, lastFT = now(), since = now();
      const tick = () => {
        const t = now(), f = window.TABLEFOLK_FRAMES || 0;
        if (f !== lastF) { if (t - lastFT > 100) since = t; lastF = f; lastFT = t; }
        else if (t - lastFT > 100) since = t;
        if (t - since >= STEADY_MS || t - t0s > STEADY_CAP_MS) {
          log.push({ name: 'steady', start: +((t0s - t0) / 1000).toFixed(2), end: +((t - t0) / 1000).toFixed(2), ...(t - since < STEADY_MS ? { capped: true } : {}) });
          return res();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
  }
  async function turn(name) {
    const me = job(name); me.claimed = true;
    if (off) return;
    // a job holding the cover starts as soon as the world is built, under it
    if (holds.has(name) && !holds.get(name).ended) await Promise.race([built, firstReveal]);
    else await steady();
    // one at a time, in ORDER: every earlier job that is expected or has asked must
    // have finished (released or skipped) first
    for (const n of ORDER.slice(0, Math.max(0, ORDER.indexOf(name)))) {
      const j = jobs.get(n);
      if (j?.claimed) await Promise.race([j.released, new Promise(r => setTimeout(r, JOB_CAP_MS))]);
    }
  }
  function release(name) { job(name).release(); holds.get(name)?.end(); }
  // a job that will ask for its turn (claimed early, so later jobs wait for it), and one that will not
  function expect(name) { job(name).claimed = true; }
  const skip = release;

  // ---- first load: up from the first frame until the scene and a linked world are built ----
  let openingDone = null;
  if (off) { up = false; revealed = true; everRevealed = true; firstRevealResolve(); const c = el(); if (c) c.hidden = true; }
  else {
    document.documentElement.classList.add('cover-up');
    const sceneDone = begin('scene');
    if (window.TABLEFOLK_SCENE_READY) sceneDone(); else addEventListener('tablefolk-scene-ready', sceneDone, { once: true });
    if (linkOpening()) openingDone = begin('opening');
    wrapLoader();
    // a link's title as soon as the scenario is known (scenario.js show() sets it too)
    kick();
  }

  window.tablefolkLoading = {
    begin, track, show, turn, release, expect, skip, steady, finish, holdCover, whenRevealed: () => revealed && !up ? Promise.resolve() : new Promise(r => waiters.push(r)),
    firstReveal: () => firstReveal, pending: () => [...stages.values()].map(s => s.name),
    // the render loop's frame time under the cover (app.js): 15 fps; ?coverfps=60 for comparisons
    frameMs: 1000 / Math.max(1, +(q.get('coverfps') || 15)),
    get coverUp() { return up; }, get waking() { return waking; }, get revealed() { return everRevealed && !up; }, get log() { return log.slice(); }, off,
  };
})();
