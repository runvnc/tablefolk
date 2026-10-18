/* tablefolk.world shell: icon rail + tabbed side panes + top-bar speech toggle. */
(() => {
  'use strict';
  const KEY = 'character.ui.tab';
  const rail = () => document.getElementById('rail');
  const panes = () => Array.from(document.querySelectorAll('#sidePanel .pane'));
  let current = null;

  function show(name, opts = {}) {
    const target = document.getElementById('pane-' + name);
    if (!target) return;
    // Clicking the active rail icon collapses the panel (except programmatic opens).
    if (current === name && !opts.force) { hide(); return; }
    current = name;
    for (const p of panes()) p.classList.toggle('active', p === target);
    document.getElementById('sidePanel')?.classList.add('open');
    for (const b of document.querySelectorAll('#rail .rail-btn')) b.classList.toggle('active', b.dataset.tab === name);
    try { localStorage.setItem(KEY, name); } catch {}
  }

  function hide() {
    current = null;
    for (const p of panes()) p.classList.remove('active');
    document.getElementById('sidePanel')?.classList.remove('open');
    for (const b of document.querySelectorAll('#rail .rail-btn')) b.classList.remove('active');
    try { localStorage.setItem(KEY, ''); } catch {}
  }

  function initRail() {
    for (const b of document.querySelectorAll('#rail .rail-btn')) {
      b.addEventListener('click', () => show(b.dataset.tab));
    }
    // The panel starts collapsed so it never covers the world on load; the
    // rail icons open it.
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }

  function initTtsToggle() {
    const btn = document.getElementById('ttsTopToggle');
    const box = document.getElementById('ttsEnabled');
    if (!btn || !box) return;
    const sync = () => { btn.textContent = box.checked ? '\uD83D\uDD0A' : '\uD83D\uDD07'; btn.classList.toggle('on', box.checked); };
    btn.addEventListener('click', () => { box.click(); sync(); });
    box.addEventListener('change', sync);
    sync();
  }

  function init() {
    if (!rail()) return;
    initRail();
    initTtsToggle();
    // showIfOpen: switch panes without opening a collapsed panel (selecting a
    // character shows its pane only if the panel is already open).
    window.tablefolkTabs = { show: (n) => show(n, { force: true }), showIfOpen: (n) => { if (current) show(n, { force: true }); }, hide };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
