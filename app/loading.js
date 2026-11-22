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
 * frame. A safety timeout (45 s) lifts it anyway and notes in the "This device"
 * pane which stage was still pending.
 *
 * Start-up queue: nothing that competes for the graphics card or the main
 * thread starts before the world is shown. A job waits with
 * `await tablefolkLoading.turn(name)`: after the first reveal (and a short
 * pause so the first seconds in view stay smooth), then after every earlier
 * job in ORDER that has also asked for its turn has released (`release(name)`,
 * or 90 s). Jobs: brain (world-integration.js: the model's weights onto the
 * card), voice (tts-ui.js: the voice engine), speech (speech-input.js: the
 * speech recogniser). The capability check (agency.js) and the better-voice
 * offer already wait for a ready brain; sight loads on a character's first look.
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
  const SAFETY_MS = 45000, QUIET_MS = 300, SETTLE_MS = 8000, FRAMES = 4, AFTER_REVEAL_MS = 600;
  const ORDER = ['brain', 'voice', 'speech'];
  const el = () => document.getElementById('loadCover');
  const now = () => performance.now();
  const t0 = now();

  const stages = new Map();        // id -> { name, step, at }
  const log = [];                  // { name, start, end } in s from navigation (the start-up test reads it)
  let seq = 0, covers = 1, unitsDone = 0, unitsAll = 0, shown = 0, lastChange = now();
  let up = !off, revealed = false, everRevealed = false, coverAt = now(), short = false, settling = false;
  let waiters = [], firstReveal = null, firstRevealResolve;
  firstReveal = new Promise(r => { firstRevealResolve = r; });

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
    // never backwards; the settle step fills the last part
    shown = Math.max(shown, Math.min(settling ? .99 : .94, frac * .94 + (settling ? .02 : 0)));
    const bar = c.querySelector('.lc-bar i'); if (bar) bar.style.width = (shown * 100).toFixed(1) + '%';
    c.querySelector('.lc-bar')?.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    const step = settling ? 'Lighting the scene' : (pend.at(-1)?.step || (window.TABLEFOLK_SCENE_READY ? 'Laying out the world' : 'Setting up the 3D view'));
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
    up = false; revealed = true; settling = false;
    const pend = [...new Set([...stages.values()].map(s => s.name))];
    if (c) { c.classList.add('lifting'); setTimeout(() => { if (!up) c.hidden = true; }, 380); }
    document.documentElement.classList.remove('cover-up');
    try { window.tablefolkDiag?.note?.('loading', timedOut ? `the world was shown after ${Math.round(ms / 1000)} s with ${pend.join(', ') || 'its last step'} still loading (safety timeout)` : `the world was built and shown in ${(ms / 1000).toFixed(1)} s`); } catch {}
    // (what never ended is dropped: the next cover, a section, must not wait for it)
    if (timedOut) { console.warn('[loading] safety timeout: still pending', pend); stages.clear(); }
    try { window.dispatchEvent(new CustomEvent('tablefolk-world-ready', { detail: { ms, timedOut: !!timedOut, pending: pend, stages: log.slice() } })); } catch {}
    if (!everRevealed) { everRevealed = true; firstRevealResolve(); }
    const w = waiters; waiters = []; for (const r of w) r();
  }

  // ---- when to lift: nothing pending for a moment, then settle (materials ready, frames drawn) ----
  let timer = null;
  function kick() { if (up && !timer) timer = setTimeout(check, 100); }
  function linkOpening() { return !window.TABLEFOLK_LINK_OPENED && (/(?:^#|&)s(?:cenario)?=/.test(location.hash) || q.has('scenario')); }
  async function check() {
    timer = null;
    if (!up || settling) return;
    if (now() - coverAt > SAFETY_MS) return lift(true);
    if (openingDone && !linkOpening()) { openingDone(); openingDone = null; }
    if (stages.size || !window.TABLEFOLK_SCENE_READY || now() - lastChange < QUIET_MS) { render(); return kick(); }
    settling = true; render();
    const sc = window.TABLEFOLK_STATE?.scene || window.BABYLON?.EngineStore?.LastCreatedScene;
    const ts = now();
    try { if (sc?.whenReadyAsync) await Promise.race([sc.whenReadyAsync(), new Promise(r => setTimeout(r, SETTLE_MS))]); } catch {}
    const f0 = window.TABLEFOLK_FRAMES || 0, tf = now();
    while ((window.TABLEFOLK_FRAMES || 0) < f0 + FRAMES && now() - tf < 1500) await new Promise(r => setTimeout(r, 30));
    log.push({ name: 'settle', start: +((ts - t0) / 1000).toFixed(2), end: +((now() - t0) / 1000).toFixed(2) });
    settling = false;
    if (!up) return;
    // something began meanwhile (a body still coming, a rebuild): wait for it too
    if (stages.size || lastChange > ts) { render(); return kick(); }
    lift(false);
  }

  // ---- the ordered start-up queue (after the first reveal) ----
  const jobs = new Map();   // name -> { released: Promise, release() }
  function job(name) {
    if (!jobs.has(name)) { let r; const p = new Promise(res => { r = res; }); jobs.set(name, { released: p, release: r, claimed: false }); }
    return jobs.get(name);
  }
  async function turn(name) {
    const me = job(name); me.claimed = true;
    if (off) return;
    await firstReveal;
    await new Promise(r => setTimeout(r, AFTER_REVEAL_MS));
    for (const n of ORDER.slice(0, Math.max(0, ORDER.indexOf(name)))) {
      const j = jobs.get(n);
      if (j?.claimed) await Promise.race([j.released, new Promise(r => setTimeout(r, 90000))]);
    }
  }
  function release(name) { job(name).release(); }

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
    begin, track, show, turn, release, whenRevealed: () => revealed && !up ? Promise.resolve() : new Promise(r => waiters.push(r)),
    firstReveal: () => firstReveal, pending: () => [...stages.values()].map(s => s.name),
    // the render loop's frame time under the cover (app.js): 15 fps; ?coverfps=60 for comparisons
    frameMs: 1000 / Math.max(1, +(q.get('coverfps') || 15)),
    get coverUp() { return up; }, get revealed() { return everRevealed && !up; }, get log() { return log.slice(); }, off,
  };
})();
