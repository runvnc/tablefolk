// World flags and the facts that hold while they do.
//
//   const state = createState({ flags: () => myFlagsObject, facts: () => scenario.facts });
//   state.get('cat_found'); state.set('favours', '+1'); state.all()
//   state.on(({ name, value, was }) => ...)       every change
//   state.facts(meId, scope) -> texts            facts whose flag holds, for this character
// flags: where the values live (an object you save with your world; changed in
// place). Names may be written world.x or x: the same flag either way.
// Keys starting with "__" are the library's own (triggers fired once).
import { applyValue, truthy, render } from './expr.js';

export function createState({ flags = null, facts = () => ({}) } = {}) {
  let own = {};
  const store = () => (flags ? flags() : own) || own;
  const key = n => String(n).replace(/^world\./i, '');
  const listeners = new Set();
  return {
    get: n => store()[key(n)],
    set(n, value) {
      const k = key(n), s = store(), was = s[k], v = applyValue(was, value);
      s[k] = v;
      for (const fn of listeners) { try { fn({ name: k, value: v, was }); } catch (e) { console.warn('[script] flag listener', e); } }
      return v;
    },
    all: () => Object.fromEntries(Object.entries(store()).filter(([k]) => !k.startsWith('__'))),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // the facts of flags that hold: "text", or { text, for: [ids] }
    facts(me, scope = {}) {
      const out = [];
      for (const [k, f] of Object.entries(facts() || {})) {
        if (!truthy(store()[k])) continue;
        const text = typeof f === 'string' ? f : f?.text; if (!text) continue;
        if (Array.isArray(f?.for) && !f.for.map(s => String(s).toLowerCase()).includes(String(me).toLowerCase())) continue;
        out.push(render(text, { ...scope, me }));
      }
      return out;
    },
    // replace every value (a new world): returns the new object, in case the caller keeps it
    reset(start = {}) { const s = store(); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, start || {}); return s; },
    raw: store,
  };
}
