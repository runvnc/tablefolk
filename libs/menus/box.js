// The menu box on screen: click a choice, press 1-9, arrows and Enter, Esc
// closes; words (typed into your own field, or from speech) go to offer().
//
//   import { createMenuBox } from '@tablefolk/menus';
//   const box = createMenuBox({
//     matchOptions: () => ({ embed, choose }),   // what match() may use (see index.js)
//     onChoose: (item, { menu, how, text }) => {},
//     onOther: (text, menu) => {},               // words that fit none, when menu.other
//   });
//   const r = await box.open(menu);   // { item, how, text } | { other: true, text } | null (closed)
//   box.offer('the second one')       // true when the open menu took the words
//   box.close(); box.active           // the open menu or null
// Styles: a default look is added to the page once (injectMenuStyles; pass
// styles: false to style .menu-box yourself).
import { match, normalizeMenu } from './index.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MENU_CSS = `
.menu-box { position:fixed; left:50%; bottom:92px; transform:translateX(-50%); z-index:60; width:min(440px, calc(100vw - 32px));
  background:linear-gradient(180deg, rgba(22,26,44,.97), rgba(12,14,26,.97)); border:2px solid #d9c27a; border-radius:12px;
  box-shadow:0 0 0 3px rgba(0,0,0,.55), 0 14px 40px rgba(0,0,0,.6); color:#f3ecd6; padding:10px 12px 8px; font-size:15px; box-sizing:border-box; }
.menu-box[hidden] { display:none; }
.menu-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.menu-head b { flex:1; color:#f2d27c; font-size:15px; letter-spacing:.02em; }
.menu-x { flex:0 0 auto; width:auto; background:none; border:0; color:#cbbf9a; font-size:15px; cursor:pointer; padding:2px 6px; }
.menu-text { margin:6px 0 4px; line-height:1.35; }
.menu-items { list-style:none; margin:6px 0 4px; padding:0; display:flex; flex-direction:column; gap:3px; max-height:46vh; overflow:auto; }
.menu-items button { display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:transparent; border:1px solid transparent; border-radius:8px;
  color:inherit; font:inherit; padding:7px 10px 7px 26px; cursor:pointer; position:relative; }
.menu-items button.sel { background:rgba(217,194,122,.14); border-color:rgba(217,194,122,.45); }
.menu-items button.sel::before { content:"▶"; position:absolute; left:8px; color:#f2d27c; font-size:11px; }
.menu-num { min-width:18px; color:#9fb3d9; font-size:12px; font-variant-numeric:tabular-nums; }
.menu-hint { font-size:11.5px; color:#a8a08a; margin-top:4px; }
@media (max-width: 600px) { .menu-box { bottom:76px; font-size:14px; } .menu-items button { padding:9px 10px 9px 26px; } }
`;
export function injectMenuStyles(doc = document) {
  if (doc.getElementById('tf-menu-styles')) return;
  const s = doc.createElement('style'); s.id = 'tf-menu-styles'; s.textContent = MENU_CSS;
  doc.head.prepend(s);   // first, so the page's own rules win
}

export function createMenuBox({ parent = null, id = 'menuBox', matchOptions = () => ({}), onChoose = null, onOther = null, onOpen = null, styles = true, keys = true, log = null } = {}) {
  if (styles) injectMenuStyles();
  let cur = null;   // { menu, ctx, resolve, sel, busy, hint }
  let el = null;
  function box() {
    if (el) return el;
    el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div'); el.id = id; el.className = 'menu-box'; el.setAttribute('role', 'dialog'); el.hidden = true;
      (parent || document.body).appendChild(el);
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-menu-item]'); if (b) { choose(+b.dataset.menuItem, 'click'); return; }
      if (e.target.closest('[data-menu-close]')) close();
    });
    el.addEventListener('mousemove', e => { const b = e.target.closest('[data-menu-item]'); if (b && cur && +b.dataset.menuItem !== cur.sel) { cur.sel = +b.dataset.menuItem; mark(); } });
    return el;
  }
  function render() {
    const el = box(); if (!cur) { el.hidden = true; return; }
    const m = cur.menu;
    el.innerHTML = `<div class="menu-head"><b>${esc(m.title || cur.ctx.title || '')}</b><button type="button" class="menu-x" data-menu-close aria-label="close">✕</button></div>`
      + (m.text ? `<p class="menu-text">${esc(m.text)}</p>` : '')
      + `<ol class="menu-items">${m.items.map((i, n) => `<li><button type="button" data-menu-item="${n}" class="${n === cur.sel ? 'sel' : ''}"><span class="menu-num">${n + 1}</span>${esc(i.label)}</button></li>`).join('')}</ol>`
      + `<div class="menu-hint" aria-live="polite">${esc(cur.hint || `click, press 1-${Math.min(9, m.items.length)}, or type or say it${m.other ? ' (or anything else)' : ''} · Esc closes`)}</div>`;
    el.hidden = false;
    el.setAttribute('aria-label', m.title || 'menu');
  }
  function mark() { box().querySelectorAll('[data-menu-item]').forEach(b => b.classList.toggle('sel', +b.dataset.menuItem === cur?.sel)); }
  function hint(text) { if (!cur) return; cur.hint = text; const h = box().querySelector('.menu-hint'); if (h) h.textContent = text; }

  // ctx: anything the caller wants back in onChoose (the Tablefolk game: agentId)
  function open(menuIn, ctx = {}) {
    const menu = normalizeMenu(menuIn);
    if (!menu) { log?.('no such menu', menuIn); return Promise.resolve(null); }
    if (cur) finish(null);
    return new Promise(res => {
      cur = { menu, ctx, resolve: res, sel: 0, hint: '' };
      render();
      onOpen?.(menu, ctx);
    });
  }
  function finish(result) { const c = cur; cur = null; render(); c?.resolve(result); }
  function close() { finish(null); }
  function choose(n, how, text) {
    if (!cur) return;
    const { menu, ctx } = cur, item = menu.items[n]; if (!item) return;
    finish({ item, how, text: text ?? null });
    onChoose?.(item, { menu, how, text: text ?? null, ...ctx });
  }
  async function offer(text) {
    if (!cur) return false;
    if (cur.busy) return true;
    const c = cur; c.busy = true; hint('working out which one you meant…');
    let r; try { r = await match(c.menu, text, { log, ...(matchOptions() || {}) }); } finally { c.busy = false; }
    if (cur !== c) return true;
    if (r.item) { log?.('matched', JSON.stringify(text), '->', r.item.id, 'by', r.by, r.score ?? ''); choose(c.menu.items.findIndex(i => i.id === r.item.id), 'words', text); return true; }
    if (c.menu.other) { finish({ other: true, text }); onOther?.(text, c.menu, c.ctx); return true; }
    hint(`"${String(text).slice(0, 50)}" isn't one of these: pick one, or say it another way`);
    return true;
  }
  // keys while a menu is open (not while typing in a field)
  const onKey = e => {
    if (!cur) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (typing) return;
    const n = cur.menu.items.length;
    if (/^[1-9]$/.test(e.key) && +e.key <= n) { e.preventDefault(); e.stopImmediatePropagation(); choose(+e.key - 1, 'key'); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); cur.sel = (cur.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; mark(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); choose(cur.sel, 'key'); }
  };
  if (keys) addEventListener('keydown', onKey, true);
  return {
    open, close, offer, choose, hint,
    get active() { return cur ? cur.menu : null; },
    get context() { return cur ? cur.ctx : null; },
    destroy() { removeEventListener('keydown', onKey, true); close(); el?.remove(); },
  };
}
