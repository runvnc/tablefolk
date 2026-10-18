/* tablefolk.world shell: icon rail + tabbed side panes + top-bar speech toggle.
 *
 * Two modes. User mode (the default) shows the player's panes: Adventurer
 * (health, gold, what you carry, controls), Voice and Graphics. Dev mode
 * adds World, Character, Scenario, Library and Debug, the brain loop
 * buttons, the turn controls and the command box. ?dev=1 turns dev mode on
 * (remembered in this browser), ?dev=0 turns it off. Elements with class
 * "dev-only" exist in both modes and are hidden in user mode.
 *
 * The panel: a rail icon opens its pane (clicking the open one, the « button,
 * or Esc collapses it); the » button at the bottom of the rail, or \, brings
 * back the last pane; drag the panel's right edge to resize it.
 */
(() => {
  'use strict';
  const KEY = 'character.ui.tab', LAST = 'tablefolk.ui.lastTab', WIDTH = 'tablefolk.ui.panelWidth', DEV = 'tablefolk.dev';
  const panes = () => Array.from(document.querySelectorAll('#sidePanel .pane'));
  const panel = () => document.getElementById('sidePanel');
  let current = null;

  // ?dev=1 / ?dev=0, remembered
  const devParam = new URLSearchParams(location.search).get('dev');
  try { if (devParam === '1' || devParam === 'true') localStorage.setItem(DEV, '1'); else if (devParam === '0' || devParam === 'false') localStorage.removeItem(DEV); } catch {}
  let dev = false;
  try { dev = localStorage.getItem(DEV) === '1'; } catch {}
  const allowed = name => { const b = document.querySelector(`#rail .rail-btn[data-tab="${name}"]`); return !!b && (dev || !b.classList.contains('dev-only')); };

  function show(name, opts = {}) {
    const target = document.getElementById('pane-' + name);
    if (!target || !allowed(name)) return;
    // Clicking the active rail icon collapses the panel (except programmatic opens).
    if (current === name && !opts.force) { hide(); return; }
    current = name;
    for (const p of panes()) p.classList.toggle('active', p === target);
    panel()?.classList.add('open');
    document.body.classList.add('panel-open');
    for (const b of document.querySelectorAll('#rail .rail-btn')) b.classList.toggle('active', b.dataset.tab === name);
    try { localStorage.setItem(KEY, name); localStorage.setItem(LAST, name); } catch {}
    if (name === 'adventurer') try { window.tablefolkPlay?.render(); } catch {}
    if (name === 'messages') try { window.tablefolkPlay?.renderMessages(); } catch {}
  }

  function hide() {
    current = null;
    panel()?.classList.remove('open');
    document.body.classList.remove('panel-open');
    for (const b of document.querySelectorAll('#rail .rail-btn')) b.classList.remove('active');
    try { localStorage.setItem(KEY, ''); } catch {}
  }
  function lastTab() { let t = ''; try { t = localStorage.getItem(LAST) || ''; } catch {} return allowed(t) ? t : (dev ? 'world' : 'adventurer'); }
  function toggle(name) { if (current && (!name || current === name)) hide(); else show(name || lastTab(), { force: true }); }

  function initRail() {
    for (const b of document.querySelectorAll('#rail .rail-btn[data-tab]')) b.addEventListener('click', () => show(b.dataset.tab));
    document.getElementById('railToggle')?.addEventListener('click', () => toggle());
    document.getElementById('panelClose')?.addEventListener('click', hide);
    // The panel starts collapsed so it never covers the world on load; the
    // rail icons open it.
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
      if (e.key === 'Escape' && current) { if (typing) e.target.blur(); hide(); }
      else if (e.key === '\\' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggle(); }
    });
  }

  // Drag the right edge to resize; the width is remembered.
  function initResize() {
    const p = panel(), h = document.getElementById('panelResize'); if (!p || !h) return;
    const apply = w => { const v = Math.max(300, Math.min(Math.round(innerWidth * .6), Math.round(w))); p.style.width = v + 'px'; document.body.style.setProperty('--panel-w', v + 'px'); return v; };
    try { const w = +localStorage.getItem(WIDTH); if (w) apply(w); } catch {}
    let drag = null;
    h.addEventListener('pointerdown', e => { drag = { x: e.clientX, w: p.getBoundingClientRect().width }; h.setPointerCapture(e.pointerId); p.classList.add('resizing'); e.preventDefault(); });
    h.addEventListener('pointermove', e => { if (drag) apply(drag.w + e.clientX - drag.x); });
    const end = () => { if (!drag) return; drag = null; p.classList.remove('resizing'); try { localStorage.setItem(WIDTH, String(Math.round(p.getBoundingClientRect().width))); } catch {} };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    h.addEventListener('dblclick', () => { p.style.width = ''; document.body.style.removeProperty('--panel-w'); try { localStorage.removeItem(WIDTH); } catch {} });
  }

  function initTtsToggle() {
    const btn = document.getElementById('ttsTopToggle');
    const box = document.getElementById('ttsEnabled');
    if (!btn || !box) return;
    const sync = () => { btn.textContent = box.checked ? '🔊' : '🔇'; btn.classList.toggle('on', box.checked); };
    btn.addEventListener('click', () => { box.click(); sync(); });
    box.addEventListener('change', sync);
    sync();
  }

  function init() {
    if (!document.getElementById('rail')) return;
    document.body.classList.toggle('dev-mode', dev);
    document.body.classList.toggle('user-mode', !dev);
    initRail();
    initResize();
    initTtsToggle();
    // showIfOpen: switch panes without opening a collapsed panel (selecting a
    // character shows its pane only if the panel is already open).
    window.tablefolkTabs = { show: (n) => show(n, { force: true }), showIfOpen: (n) => { if (current && allowed(n)) show(n, { force: true }); }, hide, toggle, get dev() { return dev; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
