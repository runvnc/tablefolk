/* tablefolk.world shell: icon rail + tabbed side panes + top-bar speech toggle.
 *
 * Two modes. User mode (the default) keeps the screen for the world: the rail
 * has two icons, Adventurer (health, gold, what you carry, the view buttons
 * and pace, controls) and Settings (your name, links to the Voice, Graphics
 * and Messages panes, the developer-mode switch), and the chat dock is just
 * the conversation (history button, message, 🎤, send; "to:" only with more
 * than one character; health only while hurt). placeForMode() moves the
 * chat name and the view buttons between the dock (dev) and those panes
 * (user): the same nodes, so every id stays unique. Dev mode shows every
 * pane on the rail (Messages, World, Character, Scenario, Library, Voice,
 * Graphics, Debug), the DEV and » buttons, the brain loop buttons, the turn
 * controls and the command box. Rail classes: "dev-only" panes exist only
 * in dev mode, "rail-dev" ones are reachable in both but on the rail only in
 * dev mode, "user-only" ones (Settings) only in user mode. ?dev=1 turns dev mode on
 * (remembered in this browser), ?dev=0 turns it off, ?play=1 shows user mode
 * for that page only. Elements with class
 * "dev-only" exist in both modes and are hidden in user mode ("user-only":
 * hidden in dev mode). The DEV button
 * on the rail switches mode at once, without a reload, and remembers it.
 *
 * The panel: a rail icon opens its pane (clicking the open one, the « button,
 * or Esc collapses it); the » button at the bottom of the rail, or \, brings
 * back the last pane; drag the panel's right edge to resize it.
 */
(() => {
  'use strict';
  const KEY = 'character.ui.tab', LAST = 'tablefolk.ui.lastTab', WIDTH = 'tablefolk.ui.panelWidth', DEV = 'tablefolk.dev';
  // Speech on by default: a saved "off" from before 2026-11-08 is dropped once.
  // Until 2026-11-07 the 🔊 button showed 🔇 at startup while speech was on, so
  // clicking it to "unmute" turned speech off and saved that. A choice made
  // after this runs is kept (tablefolkTtsReset marks the reset as done).
  try { if (!localStorage.getItem('tablefolkTtsReset')) { if (localStorage.getItem('tablefolkTtsEnabled') === '0') localStorage.removeItem('tablefolkTtsEnabled'); localStorage.setItem('tablefolkTtsReset', '1'); } } catch {}
  const panes = () => Array.from(document.querySelectorAll('#sidePanel .pane'));
  const panel = () => document.getElementById('sidePanel');
  let current = null;

  // ?dev=1 / ?dev=0, remembered
  const devParam = new URLSearchParams(location.search).get('dev');
  try { if (devParam === '1' || devParam === 'true') localStorage.setItem(DEV, '1'); else if (devParam === '0' || devParam === 'false') localStorage.removeItem(DEV); } catch {}
  let dev = false;
  try { dev = localStorage.getItem(DEV) === '1'; } catch {}
  // ?play=1: the player's view for this page, whatever is remembered (the
  // world builder's play links); ?dev=1 still wins
  if (new URLSearchParams(location.search).has('play') && devParam !== '1') dev = false;
  window.TABLEFOLK_DEV = dev;
  const allowed = name => { const b = document.querySelector(`#rail .rail-btn[data-tab="${name}"]`); return !!b && !b.classList.contains(dev ? 'user-only' : 'dev-only'); };
  // the rail icon lit for a pane: in user mode Voice and Graphics belong to Settings
  const railFor = name => !dev && (name === 'voice' || name === 'graphics' || name === 'device') ? 'settings' : name;

  function show(name, opts = {}) {
    const target = document.getElementById('pane-' + name);
    if (!target || !allowed(name)) return;
    // Clicking the active rail icon collapses the panel (except programmatic opens).
    if (current === name && !opts.force) { hide(); return; }
    current = name;
    for (const p of panes()) p.classList.toggle('active', p === target);
    panel()?.classList.add('open');
    document.body.classList.add('panel-open');
    for (const b of document.querySelectorAll('#rail .rail-btn')) b.classList.toggle('active', b.dataset.tab === railFor(name));
    document.getElementById('chatHistoryBtn')?.classList.toggle('active', name === 'messages');
    try { localStorage.setItem(KEY, name); localStorage.setItem(LAST, name); } catch {}
    if (name === 'adventurer') try { window.tablefolkPlay?.render(); } catch {}
    if (name === 'messages') try { window.tablefolkPlay?.renderMessages(); } catch {}
  }

  function hide() {
    current = null;
    panel()?.classList.remove('open');
    document.body.classList.remove('panel-open');
    for (const b of document.querySelectorAll('#rail .rail-btn')) b.classList.remove('active');
    document.getElementById('chatHistoryBtn')?.classList.remove('active');
    try { localStorage.setItem(KEY, ''); } catch {}
  }
  function lastTab() { let t = ''; try { t = localStorage.getItem(LAST) || ''; } catch {} return allowed(t) ? t : (dev ? 'world' : 'adventurer'); }
  function toggle(name) { if (current && (!name || current === name)) hide(); else show(name || lastTab(), { force: true }); }

  function initRail() {
    for (const b of document.querySelectorAll('#rail .rail-btn[data-tab]')) b.addEventListener('click', () => show(b.dataset.tab));
    // Settings' links and the panes' "‹ Settings" buttons
    document.getElementById('sidePanel')?.addEventListener('click', e => { const b = e.target.closest?.('button[data-open]'); if (b) show(b.dataset.open, { force: true }); });
    // the chat dock's history button: the Messages pane
    document.getElementById('chatHistoryBtn')?.addEventListener('click', () => show('messages'));
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
    // the tooltip names the voice engine in use and its state (Settings, "Running now", says why)
    const sync = () => { btn.textContent = box.checked ? '🔊' : '🔇'; btn.classList.toggle('on', box.checked);
      const t = window.tablefolkTTS, e = t?.engineLabel?.();
      btn.title = (box.checked ? 'speech on' : 'speech off') + (e ? ` · voice: ${e}${t.ready ? '' : ' (' + (t.lastStatus || 'loading') + ')'}` : '') + ' · click to turn ' + (box.checked ? 'off' : 'on'); };
    const hook = () => { const t = window.tablefolkTTS; if (!t) return setTimeout(hook, 500); t.addEventListener('status', sync); sync(); }; hook();
    btn.addEventListener('click', () => { box.click(); sync(); });
    box.addEventListener('change', sync);
    // tts-ui.js loads later and sets the box from the saved choice without a
    // change event, so start from that saved choice (speech is on unless
    // turned off), and tts-ui.js calls tablefolkTtsToggleSync after it.
    try { box.checked = localStorage.getItem('tablefolkTtsEnabled') !== '0'; } catch {}
    window.tablefolkTtsToggleSync = sync;
    sync();
    // the voice volume slider beside it, kept in step with the Voice pane's
    const top = document.getElementById('ttsTopVolume'), pane = document.getElementById('ttsVolume');
    if (top) {
      try { top.value = localStorage.getItem('tablefolkTtsVolume') || '.85'; } catch {}
      top.addEventListener('input', () => { window.tablefolkTTS?.setVolume(top.value); if (pane) pane.value = top.value; });
      pane?.addEventListener('input', () => { top.value = pane.value; });
    }
  }

  // The chat name and the view buttons sit in the chat dock in dev mode and
  // in the Settings / Adventurer panes in user mode. Moved, not copied: lots
  // of code finds them by id. Comment anchors remember the dock positions.
  const anchors = new Map();
  function place(id, slotId) {
    const el = document.getElementById(id), slot = document.getElementById(slotId); if (!el || !slot) return;
    if (!anchors.has(id)) { const a = document.createComment(id); el.before(a); anchors.set(id, a); }
    if (dev) anchors.get(id).after(el); else slot.appendChild(el);
  }
  function placeForMode() { place('chatNameLabel', 'settingsNameSlot'); place('viewBtns', 'advPlaySlot'); }

  function applyMode() {
    window.TABLEFOLK_DEV = dev;
    placeForMode();
    document.body.classList.toggle('dev-mode', dev);
    document.body.classList.toggle('user-mode', !dev);
    const b = document.getElementById('devToggle'); if (!b) return;
    b.setAttribute('aria-pressed', String(dev));
    b.title = 'Developer mode is ' + (dev ? 'on' : 'off') + ': ' + (dev ? 'click for the player\'s view' : 'click for all the panels, the brain loop and the command box');
    b.setAttribute('aria-label', b.title);
  }
  function setDev(on) {
    dev = !!on;
    try { if (dev) localStorage.setItem(DEV, '1'); else localStorage.removeItem(DEV); } catch {}
    // ?dev= and ?play= would overrule the choice at the next reload
    const url = new URL(location.href); url.searchParams.delete('dev'); url.searchParams.delete('play'); history.replaceState(history.state, '', url);
    if (current && !allowed(current)) hide();
    applyMode();
  }

  function init() {
    if (!document.getElementById('rail')) return;
    applyMode();
    document.getElementById('devToggle')?.addEventListener('click', () => setDev(!dev));
    document.getElementById('devSwitch')?.addEventListener('click', () => setDev(true));
    initRail();
    initResize();
    initTtsToggle();
    // showIfOpen: switch panes without opening a collapsed panel (selecting a
    // character shows its pane only if the panel is already open).
    window.tablefolkTabs = { show: (n) => show(n, { force: true }), showIfOpen: (n) => { if (current && allowed(n)) show(n, { force: true }); }, hide, toggle, setDev, get dev() { return dev; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
