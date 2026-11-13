/* menus.js -- JRPG-style menus: a list of choices the player clicks, presses
 * a number for, types, or says (the 🎤 fills the chat box like typing).
 *
 * A menu (in a scenario: a character's "menu", or the scenario's "menus" by
 * id; or from code):
 *   { id: 'smith', title: 'Brakka', text: 'What do you need?',
 *     items: [ { id: 'buy',  label: 'Buy a sword (30 gold)', say: 'I would like to buy a sword.' },
 *              { id: 'ask',  label: 'Ask about the wolves', keywords: ['wolf', 'wolves'] },
 *              { id: 'more', label: 'Something else…', menu: 'smith-more' },
 *              { id: 'hit',  label: 'Attack!', do: '/attack brakka' },
 *              { id: 'bye',  label: 'Leave' } ],
 *     other: true }
 *   item.say    what the player says to the character when it is picked
 *               (default: the label, unless the item has do or menu)
 *   item.do     a player command instead (/attack, /wield, /cast...: combat.js, skills.js)
 *   item.menu   open another menu (an id, or a menu object) after it
 *   item.keywords  words that pick it outright when typed or said
 *   item.id 'bye' / 'leave' / 'close' with nothing else: just closes
 *   menu.other  true: words that fit no choice go to the character as
 *               ordinary chat (and the menu closes); false (default): the
 *               menu says it did not understand and stays open
 *
 * Words are matched to a choice (match()) in steps, cheapest first: a number
 * ("2", "two", "the second one"), the label or a keyword, shared words, then
 * meaning (EmbeddingGemma, embed.js) when its best choice is clear, then the
 * characters' model asked to pick a number (greedy) when it is loaded. Every
 * step can say "none of these".
 *
 *   window.tablefolkMenu = {
 *     open(menu, { agentId })  show it (a menu object or a scenario menu id);
 *                              resolves { item, how, text } when one is chosen,
 *                              { other: true, text } for words that fit none, null when closed
 *     close(), active          the open menu (or null)
 *     match(menu, text)        -> { item, by, score } | { none: true, by }
 *     pick(question, options, { context }) -> { index, by } | null: the
 *                              characters' model chooses one (index -1: none)
 *     offer(text)              the chat box's words while a menu is open:
 *                              true when the menu took them (world-integration.js)
 *   }
 * Each choice also fires 'tablefolk-menu' on window: { menu, item, agentId, how, text }.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set('a an the to of and or i im me my you your we us it is are be do can could would will want like please some about for with on in at this that these those what whats one just get got let lets go ok okay yes no have need'.split(' '));
  // content words, roughly stemmed ("repaired", "repairs", "repairing" -> "repair")
  const stem = w => w.length > 5 && /(ing|ed)$/.test(w) ? w.replace(/(ing|ed)$/, '') : w.length > 3 ? w.replace(/ies$/, 'y').replace(/(es|s)$/, '') : w;
  const words = s => norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)).map(stem);
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, last: -1 };
  // embedding cosine (EmbeddingGemma, a query against "label. say"): the best
  // must reach EMBED_MIN and lead the next by EMBED_GAP, else the model decides
  const EMBED_MIN = 0.74, EMBED_GAP = 0.06;   // unrelated choices score 0.6-0.7 (2026-11-12: right picks 0.76-0.91)

  const scnMenus = () => window.tablefolkScenario?.active?.scn?.menus || {};
  function resolve(menu) {
    if (typeof menu === 'string') menu = scnMenus()[menu] && { id: menu, ...scnMenus()[menu] };
    if (!menu || !Array.isArray(menu.items) || !menu.items.length) return null;
    return { ...menu, items: menu.items.filter(i => i && (i.label || i.say)).slice(0, 24).map((i, n) => ({ ...i, id: String(i.id || 'item' + (n + 1)), label: String(i.label || i.say) })) };
  }
  const itemText = i => [i.label, i.say].filter(Boolean).join('. ');

  // ---- matching words to a choice ----
  async function match(menuIn, text) {
    const menu = resolve(menuIn); if (!menu) return { none: true, by: 'no menu' };
    const items = menu.items, t = norm(text);
    if (!t) return { none: true, by: 'empty' };
    // a number: "2", "number 2", "option two", "the second one", "the last"
    const num = t.match(/^(?:(?:number|option|choice|the)\s+)?(\d+|[a-z]+)(?:\s+(?:one|option|choice|please))?$/);
    if (num) {
      let n = /^\d+$/.test(num[1]) ? +num[1] : NUM[num[1]];
      if (n === -1) n = items.length;
      if (n >= 1 && n <= items.length) return { item: items[n - 1], by: 'number', score: 1 };
    }
    // the label itself, or one of its keywords
    for (const i of items) if (norm(i.label) === t || norm(i.say) === t) return { item: i, by: 'label', score: 1 };
    const kw = items.filter(i => (i.keywords || []).some(k => new RegExp('\\b' + norm(k).replace(/ /g, '\\s+') + '\\b').test(t)));
    if (kw.length === 1) return { item: kw[0], by: 'keyword', score: 1 };
    // shared words: most of a choice's words said, and more than any other choice
    const tw = new Set(words(t));
    const overlap = items.map(i => { const iw = [...new Set(words(i.label))]; return iw.length ? iw.filter(w => tw.has(w)).length / iw.length : 0; });
    const best = Math.max(...overlap), at = overlap.indexOf(best);
    if (best >= 0.6 && overlap.filter(v => v === best).length === 1) return { item: items[at], by: 'words', score: best };
    // meaning: EmbeddingGemma, when it is loaded and its pick is clear
    const E = window.tablefolkEmbed;
    if (E?.state === 'ready') {
      try {
        const texts = items.map(itemText), sims = await E.similar(text, texts);
        if (sims) {
          const scored = texts.map((x, n) => [sims.get(x) ?? 0, n]).sort((a, b) => b[0] - a[0]);
          const [s1, n1] = scored[0], s2 = scored[1]?.[0] ?? 0;
          console.info('[menu] meaning', text, scored.map(([s, n]) => items[n].id + ' ' + s.toFixed(2)).join(', '));
          if (s1 >= EMBED_MIN && s1 - s2 >= EMBED_GAP) return { item: items[n1], by: 'meaning', score: +s1.toFixed(3) };
        }
      } catch (e) { console.warn('[menu] embedding failed', e); }
    }
    // the characters' model picks a number
    const p = await pick(menu.text || menu.title || 'Which choice?', items.map(i => i.label), { context: 'The player said: "' + String(text).slice(0, 300) + '"' });
    if (p && p.index >= 0) return { item: items[p.index], by: p.by, score: null };
    return { none: true, by: p ? p.by : 'no match' };
  }

  // ---- the characters' model chooses one of the options (also for a
  // character deciding from a list instead of writing commands) ----
  const brainReady = () => /ready/i.test($('brainStatus')?.textContent || '') && !!window.tablefolkLLM;
  async function pick(question, options, { context = '', none = true } = {}) {
    if (!brainReady() || !options?.length) return null;
    const list = options.map((o, n) => `${n + 1}. ${o}`).join('\n') + (none ? '\n0. None of these' : '');
    const prompt = `${context ? context + '\n\n' : ''}${question}\nChoices:\n${list}\n\nWhich choice is meant? Answer with the number only.`;
    try {
      const r = await window.tablefolkLLM.chat.completions.create({
        messages: [{ role: 'system', content: 'You match what a player said to one choice of a game menu. Answer with one number and nothing else.' }, { role: 'user', content: prompt }],
        max_tokens: 6, temperature: 0, agentId: 'menu' });
      const out = String(r?.choices?.[0]?.message?.content || ''), m = out.match(/\d+/);
      console.info('[menu] model', JSON.stringify(out));
      if (!m) return { index: -1, by: 'model (no number)' };
      const n = +m[0];
      return { index: n >= 1 && n <= options.length ? n - 1 : -1, by: 'model' };
    } catch (e) { console.warn('[menu] model failed', e); return null; }
  }

  // ---- the box ----
  let cur = null;   // { menu, agentId, resolve, sel, busy }
  function box() {
    let el = $('menuBox');
    if (!el) {
      el = document.createElement('div'); el.id = 'menuBox'; el.className = 'menu-box'; el.setAttribute('role', 'dialog'); el.hidden = true;
      document.body.appendChild(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-menu-item]'); if (b) { choose(+b.dataset.menuItem, 'click'); return; }
        if (e.target.closest('[data-menu-close]')) close();
      });
      el.addEventListener('mousemove', e => { const b = e.target.closest('[data-menu-item]'); if (b && cur && +b.dataset.menuItem !== cur.sel) { cur.sel = +b.dataset.menuItem; mark(); } });
    }
    return el;
  }
  function render() {
    const el = box(); if (!cur) { el.hidden = true; return; }
    const m = cur.menu;
    el.innerHTML = `<div class="menu-head"><b>${esc(m.title || cur.agentId || '')}</b><button type="button" class="menu-x" data-menu-close aria-label="close">✕</button></div>`
      + (m.text ? `<p class="menu-text">${esc(m.text)}</p>` : '')
      + `<ol class="menu-items">${m.items.map((i, n) => `<li><button type="button" data-menu-item="${n}" class="${n === cur.sel ? 'sel' : ''}"><span class="menu-num">${n + 1}</span>${esc(i.label)}</button></li>`).join('')}</ol>`
      + `<div class="menu-hint" aria-live="polite">${esc(cur.hint || `click, press 1-${Math.min(9, m.items.length)}, or type or say it${m.other ? ' (or anything else)' : ''} · Esc closes`)}</div>`;
    el.hidden = false;
    el.setAttribute('aria-label', m.title || 'menu');
  }
  function mark() { box().querySelectorAll('[data-menu-item]').forEach(b => b.classList.toggle('sel', +b.dataset.menuItem === cur?.sel)); }
  function hint(text) { if (!cur) return; cur.hint = text; const h = box().querySelector('.menu-hint'); if (h) h.textContent = text; }

  function open(menuIn, opts = {}) {
    const menu = resolve(menuIn);
    if (!menu) { console.warn('[menu] no such menu', menuIn); return Promise.resolve(null); }
    if (cur) finish(null);
    return new Promise(res => {
      cur = { menu, agentId: opts.agentId || menu.agentId || null, resolve: res, sel: 0, hint: '' };
      render();
      window.tablefolkDiag?.note?.('menu', `opened ${menu.id || menu.title || 'a menu'} (${menu.items.length} choices)`);
    });
  }
  function finish(result) { const c = cur; cur = null; render(); c?.resolve(result); }
  function close() { finish(null); }

  // talk to the menu's character, or run a player command, as the chat box does
  function sendLine(line) {
    const input = $('chatInput'), send = $('chatSend'); if (!input || !send) return;
    input.value = line; bypass = true;
    try { send.click(); } finally { bypass = false; }
  }
  function choose(n, how, text) {
    if (!cur) return;
    const { menu, agentId } = cur, item = menu.items[n]; if (!item) return;
    finish({ item, how, text: text ?? null });
    try { window.dispatchEvent(new CustomEvent('tablefolk-menu', { detail: { menu, item, agentId, how, text: text ?? null } })); } catch {}
    window.tablefolkDiag?.note?.('menu', `${menu.id || 'menu'}: ${item.id} (${how}${text ? ': "' + String(text).slice(0, 60) + '"' : ''})`);
    const leaving = /^(bye|leave|close|exit|goodbye)$/i.test(item.id) && !item.say && !item.do && !item.menu;
    if (item.do) sendLine(String(item.do));
    else if (!leaving && (item.say || !item.menu)) sendLine((agentId ? '@' + agentId + ' ' : '') + (item.say || item.label));
    if (item.menu) setTimeout(() => open(item.menu, { agentId }), 50);
  }

  // the chat box's words while a menu is open (typed, or said into the 🎤)
  let bypass = false;
  async function offer(text) {
    if (!cur || bypass) return false;
    if (cur.busy) return true;
    const c = cur; c.busy = true; hint('working out which one you meant…');
    let r; try { r = await match(c.menu, text); } finally { c.busy = false; }
    if (cur !== c) return true;
    if (r.item) { choose(c.menu.items.findIndex(i => i.id === r.item.id), 'words', text); console.info('[menu] matched', JSON.stringify(text), '->', r.item.id, 'by', r.by, r.score ?? ''); return true; }
    if (c.menu.other) {
      const agentId = c.agentId; finish({ other: true, text });
      try { window.dispatchEvent(new CustomEvent('tablefolk-menu', { detail: { menu: c.menu, item: null, agentId, how: 'other', text } })); } catch {}
      sendLine((agentId ? '@' + agentId + ' ' : '') + text);
      return true;
    }
    hint(`"${String(text).slice(0, 50)}" isn't one of these: pick one, or say it another way`);
    return true;
  }

  // keys while a menu is open (not while typing in a field)
  addEventListener('keydown', e => {
    if (!cur) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (typing) return;
    const n = cur.menu.items.length;
    if (/^[1-9]$/.test(e.key) && +e.key <= n) { e.preventDefault(); e.stopImmediatePropagation(); choose(+e.key - 1, 'key'); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); cur.sel = (cur.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; mark(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); choose(cur.sel, 'key'); }
  }, true);

  window.tablefolkMenu = { open, close, match, pick, offer, get active() { return cur ? cur.menu : null; } };
})();
