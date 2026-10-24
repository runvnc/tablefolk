/* welcome.js -- the first thing a visitor sees: a few worlds to drop into,
 * each a click away, and the way to build their own.
 *
 * Shown when the app opens without a scenario (no #s=, no ?scenario=), and
 * from the "worlds" button in the top bar. The worlds are
 * scenarios/showcase.json: [{ "file": "goblin-bakery.json", "title", "pitch",
 * "who": ["goblin", "witch"], "tags": ["lives on its own"] }]; "who" are body
 * names whose tiles (assets/tiles/characters) show on the card.
 * Picking one plays it (tablefolkScenario.playScenario) and puts its link in
 * the address bar, like opening a shared link.
 * Loaded after scenario.js.
 */
(function () {
  const q = new URLSearchParams(location.search);
  if (window.TABLEFOLK_TABLETOP || q.has('tiles')) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let list = null, el = null;

  async function worlds() {
    if (list) return list;
    try { list = await (await fetch('/scenarios/showcase.json', { cache: 'no-cache' })).json(); } catch { list = []; }
    return list;
  }
  async function show() {
    const items = await worlds();
    if (!el) {
      el = document.createElement('div'); el.id = 'welcome'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'choose a world');
      document.body.appendChild(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-play]'); if (b) return play(items[+b.dataset.play]);
        if (e.target.closest('[data-close]') || e.target === el) hide();
      });
      addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.hidden) hide(); });
    }
    el.innerHTML = `<div class="wl-card">
      <button class="wl-x" data-close aria-label="close">×</button>
      <header><h1>Tablefolk</h1><p>Little worlds where the characters think for themselves, with a small AI running right in your browser. Pick one and press <kbd>P</kbd> to let them live, or walk in and talk to them.</p></header>
      <div class="wl-grid">${items.map((w, i) => `<button class="wl-world" data-play="${i}">
        <span class="wl-who">${(w.who || []).slice(0, 3).map(n => `<img alt="" src="/app/assets/tiles/characters/${esc(n)}.png" onerror="this.remove()">`).join('')}</span>
        <b>${esc(w.title)}</b><span class="wl-pitch">${esc(w.pitch)}</span>
        ${(w.tags || []).length ? `<span class="wl-tags">${w.tags.map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</button>`).join('')}
      </div>
      <footer><a class="wl-build" href="/world/">Build your own world →</a><span>The characters' brain (Gemma, about 2 GB) downloads once, then runs on your own graphics card. Chrome or Edge on a computer works best.</span></footer>
    </div>`;
    el.hidden = false; document.documentElement.classList.add('welcome-open');
  }
  function hide() { if (el) el.hidden = true; document.documentElement.classList.remove('welcome-open'); }
  async function play(w) {
    if (!w) return;
    // still "busy" until the world (and its intro card) is up: the model
    // download question waits for that (world-integration.js)
    document.documentElement.classList.add('world-loading');
    hide();
    try {
      const scn = await (await fetch('/scenarios/' + w.file, { cache: 'no-cache' })).json();
      await window.tablefolkScenario.playScenario(scn);
    } catch (e) { console.error('[welcome]', e); window.tablefolkToast?.('could not open that world: ' + e.message, { type: 'error' }); show(); }
    finally { setTimeout(() => document.documentElement.classList.remove('world-loading'), 400); }
  }
  function start() {
    // the top bar's "worlds" button
    const bar = document.getElementById('topBar');
    if (bar && !document.getElementById('worldsBtn')) {
      const b = document.createElement('button'); b.id = 'worldsBtn'; b.type = 'button'; b.className = 'worlds-btn'; b.textContent = 'worlds'; b.title = 'pick another world';
      b.onclick = show; bar.querySelector('.brand')?.after(b);
    }
    const linked = /(^|&)s(cenario)?=/.test(location.hash.replace(/^#/, '')) || q.has('scenario') || q.has('nowelcome');
    if (!linked) show();
  }
  if (window.TABLEFOLK_SCENE_READY) start(); else addEventListener('tablefolk-scene-ready', start, { once: true });
  window.tablefolkWelcome = { show, hide };
})();
