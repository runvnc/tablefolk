/* embed.js -- meaning-based recall for characters: EmbeddingGemma 2 in the
 * browser (embed-worker.js, ~175 MB once, cached by the browser).
 *
 * mind.js scores memories, backstory facts and world lore against what was
 * just said with both keyword overlap and these vectors, so "Where should I
 * look?" finds "The wolf den is in the hollow past the north pasture" though
 * they share no words.
 *
 * Loads the first time a character takes a turn (not in ?art=1), unless the
 * Graphics pane's "smart memory" box is off (localStorage tablefolkEmbed=off).
 * Until it is ready, recall is keyword-only.
 *
 *   window.tablefolkEmbed.state        'off' | 'idle' | 'loading' | 'ready' | 'error'
 *   window.tablefolkEmbed.start()      begin loading (returns the ready promise)
 *   window.tablefolkEmbed.similar(query, texts) -> Map(text -> cosine 0..1), or null when not ready
 */
(function () {
  const KEY = 'tablefolkEmbed';
  const off = () => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } } ;
  const art = new URLSearchParams(location.search).has('art');
  let worker = null, ready = null, seq = 0, device = '';
  const waiting = new Map(), vecs = new Map();   // text (with prefix) -> Float32Array
  const api = { state: off() || art ? 'off' : 'idle', device: '' };

  function start() {
    if (ready) return ready;
    if (art) return Promise.resolve(false);
    if (off()) { api.state = 'off'; return Promise.resolve(false); }
    api.state = 'loading';
    ready = new Promise(resolve => {
      worker = new Worker(new URL('embed-worker.js?v=20261024a', location.href), { type: 'module' });
      let toasted = false;
      worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'progress') { if (!toasted && d.total > 5e6 && d.loaded < d.total * .5) { toasted = true; window.tablefolkToast?.('Downloading the memory model (EmbeddingGemma, 175 MB, once)…'); } api.progress = d.total ? d.loaded / d.total : 0; return; }
        if (d.type === 'ready') { api.state = 'ready'; api.device = device = d.device; console.log('[embed] ready on', d.device); resolve(true); return; }
        if (d.type === 'error') { api.state = 'error'; console.warn('[embed]', d.error); resolve(false); return; }
        const w = waiting.get(d.id); if (w) { waiting.delete(d.id); d.error ? w.reject(new Error(d.error)) : w.resolve(d.vectors); }
      };
      worker.onerror = e => { api.state = 'error'; console.warn('[embed] worker failed', e.message); resolve(false); };
      worker.postMessage({ type: 'load' });
    });
    return ready;
  }
  function run(texts) {
    return new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); worker.postMessage({ id, texts }); });
  }
  let task = 'search result';
  const Q = t => `task: ${task} | query: ` + t, D = t => 'title: none | text: ' + t;
  async function vectorsFor(keys) {
    const need = [...new Set(keys.filter(k => !vecs.has(k)))];
    for (let i = 0; i < need.length; i += 16) {
      const part = need.slice(i, i + 16), out = await run(part);
      part.forEach((k, j) => vecs.set(k, out[j]));
    }
    if (vecs.size > 4000) for (const k of [...vecs.keys()].slice(0, 1000)) vecs.delete(k);
    return keys.map(k => vecs.get(k));
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  async function similar(query, texts, opts = {}) {
    if (opts.task) task = opts.task;
    if (api.state !== 'ready' || !query || !texts.length) return null;
    const [q, ...ds] = await vectorsFor([Q(query), ...texts.map(D)]);
    const out = new Map();
    texts.forEach((t, i) => out.set(t, dot(q, ds[i])));
    return out;
  }
  function setEnabled(on) {
    try { on ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, 'off'); } catch {}
    if (on && api.state === 'off') { if (api.device) api.state = 'ready'; else { api.state = 'idle'; ready = null; start(); } }
    if (!on) { api.state = 'off'; }
  }
  Object.assign(api, { start, similar, setEnabled });
  // Graphics pane checkbox and status
  function ui() {
    const box = document.getElementById('embedEnabled'), st = document.getElementById('embedStatus'); if (!box) return;
    box.checked = !off();
    box.onchange = () => setEnabled(box.checked);
    const base = st?.textContent || '';
    setInterval(() => { if (st) st.textContent = base + ` Now: ${api.state}${api.state === 'loading' && api.progress ? ' ' + Math.round(api.progress * 100) + '%' : ''}${api.device ? ' (' + api.device + ')' : ''}.`; }, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
  window.tablefolkEmbed = api;
})();
