/* decider.js -- the Strands Decider (libs/decider) in the game: a 2B decision model that picks one of a
 * list of options with calibrated probabilities (0.25-0.5 s a question on a 12 GB card, 1-2 s on an RTX
 * 2060), beside the characters' brain. The game uses it to turn words into fixed outcomes (a decree's
 * kind, a dream's meaning, a council speech code could not place: packages/god) and packages may ask it
 * their own questions (api.decide / api.choose, packages.js).
 *
 * Loaded only beside a brain that runs in this browser (not with ?art=1, "brain": "none" or an
 * endpoint), after it is ready, and only:
 *   auto (the default)  when the graphics card has room for it beside the brain (tablefolkDevice.freeGB,
 *                       less a Breeze voice's share, at least NEED_GB + 0.5 left) and the model is already
 *                       in this browser's cache (auto never starts a 2 GB download)
 *   on                  the player asked for it (This device pane): downloads it once if need be, even
 *                       when the budget says it is tight (said so in the pane)
 *   off                 never
 * Setting: localStorage tablefolk.decider; ?decider=auto|on|off for a page; ?deciderLocal=1 (tests) reads
 * the files from /work/decider/ (not in git) without the cache.
 *
 *   window.tablefolkDecision = { setting(), set(v), state() -> { status, why, fits, freeGB, cached, ms },
 *     ready, load(), decide(state, questions) -> the decider's answer | null,
 *     choose(text, items: [{ id, label }], question, { min = .4, context }) -> { id, confidence, probabilities, ms } | null,
 *     yesno(state, statement) -> P(true) | null, diagRow() }
 *   window.tablefolkDecider: the loaded decider itself (decide), set once it is ready
 *   event tablefolk-decider { status, why }
 */
(function () {
  const KEY = 'tablefolk.decider', MARGIN = .5;
  const qs = new URLSearchParams(location.search);
  const urlSetting = ['auto', 'on', 'off'].includes(qs.get('decider')) ? qs.get('decider') : null;
  let setting = urlSetting || (() => { try { const v = localStorage.getItem(KEY); return ['auto', 'on', 'off'].includes(v) ? v : 'auto'; } catch { return 'auto'; } })();
  let status = 'waiting', why = 'waits for the characters\' brain', lib = null, D = null, loading = null, cached = null, needGB = 2.6, stats = { n: 0, ms: 0 };
  const note = t => { try { window.tablefolkDiag?.note?.('decider', t); } catch {} };
  const emit = () => { try { dispatchEvent(new CustomEvent('tablefolk-decider', { detail: { status, why } })); } catch {} };
  const say = (st, w) => { if (st === status && w === why) return; status = st; why = w; note(`${st}: ${w}`); emit(); };
  const libUrl = '/libs/decider/index.js';
  const getLib = async () => (lib ||= await import(libUrl));
  // a brain that runs in this browser (the decider shares its graphics card)
  function brainHere() {
    try {
      if (qs.has('art') || window.TABLEFOLK_TABLETOP) return 'no brain in this view';
      if (window.tablefolkScenario?.active?.scn?.brain === 'none') return 'this world has no brain';
      const b = window.tablefolkBrainInfo?.(); if (!b || b.engine === 'none' || b.key === 'none') return 'no brain loaded';
      if (/endpoint|openrouter|server/i.test(b.engine || '') || b.key === 'endpoint') return 'the brain runs elsewhere (a server or a key)';
      if (!window.tablefolk?.brainReady?.()) return 'waits for the characters\' brain';
      if (!navigator.gpu) return 'no WebGPU here';
      return null;
    } catch { return 'no brain loaded'; }
  }
  // graphics memory left beside the brain (and a Breeze voice on the card)
  function room() {
    const d = window.tablefolkDevice, f = d?.freeGB;
    if (f == null) return { free: null, fits: false };
    const breeze = /breeze/i.test(window.tablefolkTTS?.engine || '') ? 3 : 0, free = Math.round((f - breeze) * 10) / 10;
    return { free, fits: free - needGB >= MARGIN };
  }
  async function consider() {
    if (D || loading) return;
    if (setting === 'off') { say('off', 'turned off in This device'); return; }
    const no = brainHere(); if (no) { say(/waits/.test(no) ? 'waiting' : 'off', no); return; }
    const L = await getLib().catch(e => { say('failed', 'could not load its code: ' + e.message); return null; }); if (!L) return;
    needGB = L.NEED_GB || needGB;
    const r = room(), local = qs.has('deciderLocal');
    if (cached == null) cached = local || await L.deciderCached();
    if (setting === 'auto') {
      if (!r.fits) { say('off', r.free == null ? 'graphics memory unknown: turn it on in This device to try it' : `${r.free} GB left beside the brain (it wants ${needGB} + ${MARGIN}): off`); return; }
      if (!cached) { say('available', `${r.free} GB left beside the brain: it fits; turn it on to download it (2.0 GB)`); return; }
    }
    load();
  }
  function load() {
    if (D) return Promise.resolve(D);
    return loading ||= (async () => {
      const L = await getLib(), r = room(), local = qs.has('deciderLocal');
      say('loading', setting === 'on' && !r.fits ? `you turned it on (${r.free ?? '?'} GB left beside the brain: tight)` : `${r.free ?? '?'} GB left beside the brain`);
      const t0 = performance.now();
      try {
        D = await L.loadDecider(s => { if (/downloading/.test(s)) say('loading', s); }, local ? { ggufUrl: location.origin + '/work/decider/strands-decider-2B-qwen3.5-v1-2610-Q8_0.gguf', headUrl: '/work/decider/decider-head.safetensors', useCache: false } : {});
        window.tablefolkDecider = D; cached = true;
        say('ready', `loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${r.free ?? '?'} GB left beside the brain before it`);
        return D;
      } catch (e) { say('failed', String(e.message || e).slice(0, 160)); loading = null; return null; }
    })();
  }
  // a question, timed; null when there is no decider (callers fall back to the matcher or the brain)
  async function decide(state, questions) {
    if (!D) return null;
    const t0 = performance.now();
    try { const r = await D.decide(String(state || ''), questions); const ms = performance.now() - t0; stats.n++; stats.ms += ms; return r; }
    catch (e) { console.warn('[decider]', e); note('a question failed: ' + (e.message || e)); return null; }
  }
  async function choose(text, items, question = 'Which fits best?', { min = .4, context = '' } = {}) {
    if (!D || !items?.length) return null;
    const criteria = Object.fromEntries(items.map(i => [String(i.id), String(i.label || i.id)]));
    const t0 = performance.now(), r = await decide((context ? context + '\n' : '') + text, { q: { type: 'choice', instructions: question, criteria } });
    const a = r?.q; if (!a?.choice) return null;
    const out = { id: a.choice, confidence: a.confidence, probabilities: a.probabilities, ms: Math.round(performance.now() - t0) };
    return (a.confidence ?? 1) >= min ? out : { ...out, id: null, unsure: a.choice };
  }
  async function yesno(state, statement) { const r = await decide(state, { q: { type: 'noul', instructions: statement } }); return r?.q?.noul ?? null; }
  function set(v) {
    if (!['auto', 'on', 'off'].includes(v)) return setting;
    setting = v; try { localStorage.setItem(KEY, v); } catch {}
    if (v === 'off' && D) say('ready', 'turned off: it goes at the next page load'); else consider();
    return setting;
  }
  function diagRow() {
    return ['Decision model', D ? 'Strands Decider 2B' : 'Strands Decider 2B (' + setting + ')', status + (stats.n ? ` · ${stats.n} questions, ${Math.round(stats.ms / stats.n)} ms each` : ''), status === 'ready' ? 'ok' : status === 'failed' ? 'bad' : status === 'loading' ? 'busy' : 'off', why];
  }
  // look again now and then until it is settled (the brain loads, the voice changes, the player turns it on)
  let tries = 0;
  const timer = setInterval(() => { if (D || ++tries > 400) { clearInterval(timer); return; } if (!loading) consider().catch(e => console.warn('[decider]', e)); }, 3000);
  window.tablefolkDecision = { setting: () => setting, set, state: () => ({ status, why, ...room(), cached, needGB, questions: stats.n, ms: stats.n ? Math.round(stats.ms / stats.n) : null }), get ready() { return !!D; }, load: () => { if (setting === 'off') set('on'); return load(); }, decide, choose, yesno, diagRow, consider };
})();
