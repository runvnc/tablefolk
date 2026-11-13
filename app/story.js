/* story.js -- the world's story state: flags that menus, workflows and the
 * characters share, conditions on them and on what people carry, and facts
 * the characters know while a flag holds.
 *
 * A scenario:
 *   "flags": { "cat_found": false, "favours": 0 }        the starting values
 *   "facts": { "cat_found": "The player found Mrs. Pell's lost cat Whiskers and brought her home: everyone on Willow Lane thinks well of them.",
 *              "favours": { "text": "The player has done the smith a favour.", "for": ["brakka"] } }
 *     while a flag is true (not false, 0, "", "no"), its fact is in what every
 *     character knows (or only those listed in "for"), shown first (mind.js).
 *
 * Setting flags: a menu choice's "set" ({ "cat_found": true, "favours": "+1" }),
 * a workflow step { "set": { "world.cat_found": true } }, or the console
 * tablefolkStory.set('cat_found', true). Flags are saved with the world.
 *
 * Conditions (a menu choice's "if", a character's menu list, a workflow's "if"):
 *   world.cat_found                 a flag is true          not world.cat_found
 *   world.favours >= 2              compare (== != >= <= > <)
 *   player has lost cat             the player carries it    player lacks lost cat
 *   player.gold >= 10               the player's gold
 *   me has rusty key / me.gold > 5  the character (the menu's, or the workflow's)
 *   brakka has rusty key            any character by id
 *   ... and ... / ... or ...        ("and" binds first)
 *   a workflow's own variables too: bid >= 40, reply contains wolf
 * Templates: {{world.cat_found}}, {{player.gold}}, {{player}}, {{me}}.
 *
 *   window.tablefolkStory = { get, set, all, check(expr, { me, vars }), render(text, { me, vars }),
 *                             take(me, item) (from the player), factsFor(g), reset(flags, facts) }
 * Each change fires 'tablefolk-flag' on window: { name, value, was }.
 */
(function () {
  'use strict';
  const S = () => window.tablefolk?.state || window.TABLEFOLK_STATE || {};
  const flags = () => (S().flags ||= {});
  const truthy = v => v != null && v !== false && !/^(|0|no|false|none|off)$/i.test(String(v).trim());
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const agent = id => (window.tablefolk?.state?.characters || []).find(c => c.id.toLowerCase() === String(id).toLowerCase());
  const meId = me => typeof me === 'string' ? me : me?.id || null;

  function get(name) { return flags()[String(name).replace(/^world\./, '')]; }
  function set(name, value) {
    const k = String(name).replace(/^world\./, ''), was = flags()[k];
    let v = value;
    // "+1" / "-2": add to a number
    const m = typeof v === 'string' && v.match(/^\s*([+-])\s*(\d+(?:\.\d+)?)\s*$/);
    if (m) v = (Number(was) || 0) + (m[1] === '+' ? +m[2] : -m[2]);
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = +v;
    else if (v === 'true') v = true; else if (v === 'false') v = false;
    flags()[k] = v;
    window.tablefolkDiag?.note?.('story', `${k} = ${JSON.stringify(v)}`);
    try { window.dispatchEvent(new CustomEvent('tablefolk-flag', { detail: { name: k, value: v, was } })); } catch {}
    return v;
  }

  // what someone carries: the player (state.player) or a character (its brain config)
  function holder(who, me) {
    const w = String(who).toLowerCase();
    if (w === 'player' || w === 'you') return S().player || { gold: 0, items: [] };
    const id = w === 'me' ? meId(me) : who;
    const g = id && agent(id); if (!g) return null;
    const cfg = window.tablefolk?.getBrainConfig?.(g.id) || {};
    const inv = cfg.inventory || { gold: 0, items: [] };
    inv.items = (inv.items || []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : i);
    return inv;
  }
  const nameOf = i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase();
  function hasItem(inv, item) {
    const n = String(item).trim().toLowerCase().replace(/^(a|an|the)\s+/, ''); if (!n || !inv) return false;
    return (inv.items || []).some(i => (i.qty ?? 1) > 0 && (nameOf(i) === n || nameOf(i).includes(n) || (nameOf(i) && n.includes(nameOf(i)))));
  }

  // the values a condition or template can name
  function lookup(tok, { me, vars = {} } = {}) {
    tok = tok.trim();
    if (/^".*"$|^'.*'$/.test(tok)) return tok.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(tok)) return +tok;
    if (/^world\./i.test(tok)) return get(tok.slice(6));
    const m = tok.match(/^([\w-]+)\.(gold|items)$/i);
    if (m) { const inv = holder(m[1], me); if (inv) return m[2].toLowerCase() === 'gold' ? (Number(inv.gold) || 0) : (inv.items || []).filter(i => (i.qty ?? 1) > 0).map(i => i.name).join(', '); }
    if (tok in vars) { const v = vars[tok]; return /^\s*-?\d+(\.\d+)?\s*$/.test(String(v)) ? +v : v; }
    return tok;
  }
  function one(expr, ctx) {
    let e = String(expr).trim(), neg = false;
    while (/^(not|!)\s*/i.test(e)) { neg = !neg; e = e.replace(/^(not|!)\s*/i, ''); }
    let r;
    const has = e.match(/^([\w-]+)\s+(has|lacks|carries)\s+(.+)$/i);
    if (has) { const inv = holder(has[1], ctx.me); r = hasItem(inv, has[3].replace(/^["']|["']$/g, '')); if (/lacks/i.test(has[2])) r = !r; }
    else {
      const m = e.match(/^(.*?)\s*(==|!=|>=|<=|>|<|\bcontains\b)\s*(.*)$/);
      if (!m) r = truthy(lookup(e, ctx));
      else {
        const a = lookup(m[1], ctx), b = lookup(m[3], ctx), op = m[2];
        if (op === 'contains') r = String(a ?? '').toLowerCase().includes(String(b).toLowerCase());
        else {
          const both = typeof a === 'number' && typeof b === 'number' || (op !== '==' && op !== '!=' && Number.isFinite(+a) && Number.isFinite(+b) && a !== '' && b !== '');
          const x = both ? +a : String(a ?? '').toLowerCase(), y = both ? +b : String(b ?? '').toLowerCase();
          r = op === '==' ? x == y : op === '!=' ? x != y : op === '>=' ? x >= y : op === '<=' ? x <= y : op === '>' ? x > y : x < y;
        }
      }
    }
    return neg ? !r : r;
  }
  function check(expr, ctx = {}) {
    if (expr == null || expr === '' || expr === true) return true;
    if (expr === false) return false;
    if (Array.isArray(expr)) return expr.every(e => check(e, ctx));
    return String(expr).split(/\s+or\s+/i).some(part => part.split(/\s+and\s+/i).every(p => one(p, ctx)));
  }
  function render(text, { me, vars = {} } = {}) {
    return String(text ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => {
      if (k === 'me') return meId(me) || '';
      if (k === 'player') return playerName();
      const v = /^world\.|\.(gold|items)$/i.test(k) ? lookup(k, { me, vars }) : vars[k];
      return v == null ? '' : String(v);
    });
  }

  // the player hands an item to a character (a lost cat, a letter): false when they lack it
  function take(me, item) {
    const p = S().player, g = agent(meId(me)); if (!p || !g) return false;
    const n = String(item).trim().toLowerCase();
    const i = (p.items || []).find(x => (x.qty ?? 1) > 0 && (nameOf(x) === n || nameOf(x).includes(n) || n.includes(nameOf(x))));
    if (!i) return false;
    if ((i.qty ?? 1) > 1) i.qty--; else p.items.splice(p.items.indexOf(i), 1);
    const cfg = window.tablefolk.getBrainConfig(g.id), inv = cfg.inventory || { gold: 0, items: [] };
    inv.items = (inv.items || []).map(x => typeof x === 'string' ? { name: x, qty: 1 } : x);
    const have = inv.items.find(x => nameOf(x) === nameOf(i)); if (have) have.qty = (have.qty || 0) + 1; else inv.items.push({ name: i.name, qty: 1 });
    window.tablefolk.setBrainConfig(g.id, { inventory: inv });
    window.tablefolk.renderPlayerInventory?.();
    window.tablefolkMind?.event?.(g, 'given', { who: playerName(), what: i.name });
    window.tablefolkDiag?.note?.('story', `${playerName()} gives ${g.id} ${i.name}`);
    return true;
  }

  // facts that hold now, for this character (mind.js puts them first in what it knows)
  function factsFor(g) {
    const facts = S().facts || {}, out = [];
    for (const [k, f] of Object.entries(facts)) {
      if (!truthy(get(k))) continue;
      const text = typeof f === 'string' ? f : f?.text; if (!text) continue;
      const only = Array.isArray(f?.for) ? f.for.map(s => String(s).toLowerCase()) : null;
      if (only && !only.includes(String(g?.id).toLowerCase())) continue;
      out.push(render(text, { me: g }));
    }
    return out;
  }
  function reset(startFlags = {}, facts = {}) { const s = S(); s.flags = { ...startFlags }; s.facts = facts || {}; }

  window.tablefolkStory = { get, set, all: () => ({ ...flags() }), check, render, take, factsFor, reset, hasItem: (who, item, me) => hasItem(holder(who, me), item), truthy };
})();
