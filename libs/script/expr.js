// Conditions and templates: one language for menus, workflows, triggers and goals.
//
//   world.cat_found                     a flag holds (not false, 0, "", "no", "none", "off")
//   world.favours >= 2                  compare: == != >= <= > <  contains
//   player has lost cat                 someone carries it   (player lacks lost cat)
//   player has "bread and butter"       quote names that contain and/or
//   player.gold >= 10, me.gold, bert.items contains key
//   answer contains kettle              a run's own variables
//   not world.paid, (a or b) and c      not / and / or, brackets
//
// Item names match whole words: "cat" finds "lost cat", "key" does not find "keyring".
//
//   const ast = parse('player has lost cat and not world.paid');   // throws ExprError (with .pos) on bad input
//   evaluate(ast, scope) / check(text, scope) -> boolean
//   render('Thanks, {{player}}! You have {{player.gold}} gold.', scope)
// scope: { flag(name), vars: {}, me, playerName(), inventory(who) -> { gold, items: [{ name, qty }] } | null }

export class ExprError extends Error { constructor(msg, pos, text) { super(`${msg} at ${pos} in "${text}"`); this.pos = pos; this.text = text; } }

const OPS = ['==', '!=', '>=', '<=', '>', '<'];
function tokenize(text) {
  const out = []; let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1); if (end < 0) throw new ExprError('unclosed quote', i, text);
      out.push({ t: 'str', v: text.slice(i + 1, end), pos: i }); i = end + 1; continue;
    }
    if (c === '(' || c === ')') { out.push({ t: c, pos: i }); i++; continue; }
    if (c === '!' && text[i + 1] !== '=') { out.push({ t: 'not', pos: i }); i++; continue; }
    const op = OPS.find(o => text.startsWith(o, i)); if (op) { out.push({ t: 'op', v: op, pos: i }); i += op.length; continue; }
    const m = text.slice(i).match(/^[^\s()"'=!<>]+/);
    const w = m[0], low = w.toLowerCase();
    if (low === 'and' || low === 'or' || low === 'not') out.push({ t: low, pos: i });
    else if (low === 'contains') out.push({ t: 'op', v: 'contains', pos: i });
    else if (low === 'has' || low === 'lacks' || low === 'carries') out.push({ t: 'has', v: low === 'lacks' ? 'lacks' : 'has', pos: i });
    else out.push({ t: 'word', v: w, pos: i });
    i += w.length;
  }
  return out;
}

export function parse(text) {
  text = String(text ?? '').trim();
  if (!text) return { k: 'lit', v: true };
  const toks = tokenize(text); let p = 0;
  const peek = () => toks[p], take = t => { const x = toks[p]; if (!x || (t && x.t !== t)) throw new ExprError(`expected ${t || 'more'}`, x ? x.pos : text.length, text); p++; return x; };
  const stop = x => !x || x.t === 'and' || x.t === 'or' || x.t === ')';
  // words up to and/or/): an item name or a right-hand side ("lost cat")
  function phrase() {
    const x = peek(); if (!x || stop(x)) throw new ExprError('expected a value', x ? x.pos : text.length, text);
    if (x.t === 'str') { p++; return { k: 'lit', v: x.v }; }
    const words = []; while (peek() && !stop(peek()) && peek().t === 'word') words.push(take().v);
    if (!words.length) throw new ExprError('expected a value', x.pos, text);
    if (words.length === 1) return /^-?\d+(\.\d+)?$/.test(words[0]) ? { k: 'lit', v: +words[0] } : { k: 'ref', v: words[0] };
    return { k: 'lit', v: words.join(' ') };
  }
  function primary() {
    const x = peek();
    if (!x) throw new ExprError('unexpected end', text.length, text);
    if (x.t === 'not') { p++; return { k: 'not', a: primary() }; }
    if (x.t === '(') { p++; const e = or(); take(')'); return e; }
    // holder has item
    if (x.t === 'word' && toks[p + 1]?.t === 'has') { p++; const h = take('has'); return { k: 'has', who: x.v, item: phrase(), neg: h.v === 'lacks' }; }
    const a = x.t === 'str' ? (p++, { k: 'lit', v: x.v }) : x.t === 'word' ? (p++, /^-?\d+(\.\d+)?$/.test(x.v) ? { k: 'lit', v: +x.v } : { k: 'ref', v: x.v }) : null;
    if (!a) throw new ExprError(`unexpected "${x.v || x.t}"`, x.pos, text);
    if (peek()?.t === 'op') { const op = take().v; return { k: 'cmp', op, a, b: phrase() }; }
    return { k: 'truthy', a };
  }
  function and() { let e = primary(); while (peek()?.t === 'and') { p++; e = { k: 'and', a: e, b: primary() }; } return e; }
  function or() { let e = and(); while (peek()?.t === 'or') { p++; e = { k: 'or', a: e, b: and() }; } return e; }
  const e = or();
  if (p < toks.length) throw new ExprError(`unexpected "${toks[p].v || toks[p].t}"`, toks[p].pos, text);
  return e;
}

export const truthy = v => v != null && v !== false && !/^(|0|no|false|none|off)$/i.test(String(v).trim());
const norm = s => String(s ?? '').toLowerCase().replace(/^(a|an|the|some)\s+/, '').trim();
// whole words: "cat" finds "lost cat", "key" does not find "keyring"
export function itemMatches(name, want) {
  const n = norm(name), w = norm(want); if (!n || !w) return false;
  if (n === w) return true;
  const re = s => new RegExp('(^|\\W)' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\W|$)');
  return re(w).test(n) || re(n).test(w);
}
export function findItem(items, want) {
  const live = (items || []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : i).filter(i => i && (i.qty ?? 1) > 0);
  return live.find(i => norm(i.name) === norm(want)) || live.find(i => itemMatches(i.name, want)) || null;
}

// a name's value: world.x (a flag), <who>.gold / <who>.items, a run variable, else the word itself
export function lookup(name, scope = {}) {
  const n = String(name);
  if (/^world\./i.test(n)) return scope.flag?.(n.slice(6));
  const m = n.match(/^([\w-]+)\.(gold|items)$/i);
  if (m) {
    const inv = scope.inventory?.(m[1] === 'me' ? scope.me : m[1]);
    if (inv) return m[2].toLowerCase() === 'gold' ? Number(inv.gold) || 0 : (inv.items || []).filter(i => (i.qty ?? 1) > 0).map(i => i.name).join(', ');
  }
  if (n === 'me') return scope.me ?? '';
  if (n === 'player') return scope.playerName?.() ?? 'the player';
  if (scope.vars && n in scope.vars) { const v = scope.vars[n]; return /^\s*-?\d+(\.\d+)?\s*$/.test(String(v)) ? +v : v; }
  return n;
}

export function evaluate(e, scope = {}) {
  const val = x => x.k === 'lit' ? x.v : lookup(x.v, scope);
  switch (e.k) {
    case 'lit': return truthy(e.v);
    case 'not': return !evaluate(e.a, scope);
    case 'and': return evaluate(e.a, scope) && evaluate(e.b, scope);
    case 'or': return evaluate(e.a, scope) || evaluate(e.b, scope);
    case 'truthy': return truthy(val(e.a));
    case 'has': { const inv = scope.inventory?.(e.who === 'me' ? scope.me : e.who); const r = !!(inv && findItem(inv.items, val(e.item.k === 'ref' ? { k: 'lit', v: e.item.v } : e.item))); return e.neg ? !r : r; }
    case 'cmp': {
      const a = val(e.a), b = e.b.k === 'ref' && !/^world\.|\.(gold|items)$/i.test(e.b.v) && !(scope.vars && e.b.v in scope.vars) ? e.b.v : val(e.b);
      if (e.op === 'contains') return String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase());
      const num = x => typeof x === 'number' ? x : /^\s*-?\d+(\.\d+)?\s*$/.test(String(x)) ? +x : (x === true ? 1 : x === false || x == null ? 0 : NaN);
      const na = num(a), nb = num(b), both = !Number.isNaN(na) && !Number.isNaN(nb);
      const x = both ? na : String(a ?? '').toLowerCase(), y = both ? nb : String(b ?? '').toLowerCase();
      return e.op === '==' ? x == y : e.op === '!=' ? x != y : e.op === '>=' ? x >= y : e.op === '<=' ? x <= y : e.op === '>' ? x > y : x < y;
    }
  }
  return false;
}
const cache = new Map();
export function check(text, scope = {}) {
  if (text == null || text === '' || text === true) return true;
  if (text === false) return false;
  if (Array.isArray(text)) return text.every(t => check(t, scope));
  let ast = cache.get(text); if (!ast) { ast = parse(text); if (cache.size > 500) cache.clear(); cache.set(text, ast); }
  return evaluate(ast, scope);
}
export function render(tpl, scope = {}) {
  return String(tpl ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => { const v = lookup(k, scope); return v == null || v === k && !(scope.vars && k in scope.vars) && k !== 'me' && k !== 'player' ? '' : String(v); });
}
// "+1" / "-2" add to a number; "true"/"false" and numbers become themselves
export function applyValue(was, value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\s*([+-])\s*(\d+(?:\.\d+)?)\s*$/);
  if (m) return (Number(was) || 0) + (m[1] === '+' ? +m[2] : -m[2]);
  if (/^\s*-?\d+(\.\d+)?\s*$/.test(value)) return +value;
  if (value === 'true') return true; if (value === 'false') return false;
  return value;
}
