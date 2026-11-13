// validate(scenario) -> [{ level: 'error' | 'warning', where, message }]
// Checks the scripted parts of a scenario before anyone plays it (the world
// generator writes these, so mistakes are likely):
//   conditions that do not parse; goto/then/else/exit/other/closed/options
//   targets that do not exist; steps nothing reaches; menus and workflows named
//   but missing; flags read but never set nor given a starting value; a
//   "choose" with no default, or a flow menu step with no "other", in a world
//   with no model ("brain": "none"); triggers with an unknown "on".
import { parse, ExprError } from './expr.js';

const TRIGGER_ON = ['flag', 'given', 'start'];
export function validate(scn = {}) {
  const out = [], err = (where, message) => out.push({ level: 'error', where, message }), warn = (where, message) => out.push({ level: 'warning', where, message });
  const menus = scn.menus || {}, flows = scn.workflows || {}, noModel = scn.brain === 'none';
  const read = new Map(), set = new Set(Object.keys(scn.flags || {}));
  const flagsIn = (text, where) => { for (const m of String(text ?? '').matchAll(/world\.([\w-]+)/gi)) if (!read.has(m[1])) read.set(m[1], where); };
  const cond = (text, where) => {
    if (text == null || typeof text === 'boolean') return;
    for (const t of [].concat(text)) { try { parse(t); } catch (e) { err(where, e instanceof ExprError ? e.message : String(e)); } flagsIn(t, where); }
  };
  const sets = obj => { for (const k of Object.keys(obj || {})) set.add(k.replace(/^world\./i, '')); };
  const actions = (a, where) => {
    if (!a) return;
    sets(a.set);
    for (const t of [a.reply, a.say, ...[].concat(a.act ?? [])]) flagsIn(t, where);
    const st = typeof a.start === 'string' ? a.start : a.start?.name;
    if (st && !flows[st]) err(where, `workflow "${st}" does not exist`);
    if (a.workflow && !flows[a.workflow]) err(where, `workflow "${a.workflow}" does not exist`);
  };
  const menuRef = (ref, where) => { if (typeof ref === 'string' && !menus[ref]) err(where, `menu "${ref}" does not exist`); };

  // menus a workflow opens: the workflow acts on the choice, the items need no actions
  const flowMenus = new Set(Object.values(flows).flatMap(f => (f?.steps || []).map(s => s?.menu).filter(x => typeof x === 'string')));
  for (const [id, m] of Object.entries(menus)) {
    if (!Array.isArray(m?.items) || !m.items.length) { err(`menus.${id}`, 'a menu needs items'); continue; }
    m.items.forEach((it, n) => {
      const where = `menus.${id}.items[${it?.id || n}]`;
      cond(it?.if, where); actions(it, where); menuRef(it?.menu, where);
      if (noModel && it && !flowMenus.has(id) && !it.menu && !it.do && it.reply == null && it.act == null && it.set == null && it.take == null && it.give == null && !it.workflow && !it.start && !it.stop && !/^(bye|leave|close|exit|goodbye)$/i.test(it.id || ''))
        warn(where, 'nothing happens in a world with no model: give it a reply or act');
    });
  }
  for (const a of scn.agents || []) {
    const where = `agents.${a?.id}`;
    if (Array.isArray(a?.menu)) a.menu.forEach(e => { cond(e?.if, where + '.menu'); menuRef(e?.menu, where + '.menu'); });
    else menuRef(a?.menu, where + '.menu');
    if (a?.workflow && !flows[a.workflow]) err(where, `workflow "${a.workflow}" does not exist`);
  }
  for (const [name, f] of Object.entries(flows)) {
    const steps = f?.steps; if (!Array.isArray(steps) || !steps.length) { err(`workflows.${name}`, 'a workflow needs steps'); continue; }
    const ids = new Map(steps.map((s, i) => [s?.id ?? '#' + i, i]));
    const at = ref => ref == null ? -1 : typeof ref === 'number' ? ref : ids.has(ref) ? ids.get(ref) : -2;
    const targets = (s, i) => {
      const t = [];
      for (const k of ['goto', 'then', 'else', 'exit', 'other', 'closed']) if (s[k] != null) t.push([k, s[k]]);
      for (const [o, ref] of Object.entries(s.options || {})) t.push([`options.${o}`, ref]);
      return t;
    };
    const reach = new Set(), todo = [f.start != null ? at(f.start) : 0];
    while (todo.length) {
      const i = todo.pop(); if (i < 0 || i >= steps.length || reach.has(i)) continue; reach.add(i);
      const s = steps[i] || {};
      const branches = targets(s, i).map(([, r]) => at(r)).filter(x => x >= 0);
      todo.push(...branches);
      const falls = !s.end && s.goto == null && !(s.if != null && s.then != null && s.else != null) && !(s.choose != null && s.options);
      if (falls) todo.push(i + 1);
    }
    steps.forEach((s, i) => {
      const where = `workflows.${name}.steps[${s?.id || i}]`;
      if (!s || typeof s !== 'object') { err(where, 'a step must be an object'); return; }
      for (const [k, ref] of targets(s, i)) if (at(ref) === -2) err(where, `${k} goes to "${ref}", which is not a step`);
      cond(s.if, where); sets(Object.fromEntries(Object.entries(s.set || {}).filter(([k]) => /^world\./i.test(k))));
      for (const t of [s.command, s.prompt, s.choose]) flagsIn(t, where);
      actions(s.do, where); menuRef(s.menu, where);
      if (noModel && s.choose != null && s.default == null) warn(where, 'choose has no "default", and this world has no model to answer it');
      if (noModel && s.prompt != null) warn(where, 'prompt needs a model, and this world has none');
      if (s.menu != null && noModel && s.other == null) warn(where, 'words that fit no choice make this menu ask again: add "other" to branch on them');
      if (!reach.has(i)) warn(where, 'nothing leads to this step');
    });
  }
  for (const [i, t] of (scn.triggers || []).entries()) {
    const where = `triggers[${i}]`;
    if (!TRIGGER_ON.includes(t?.on)) err(where, `"on" must be one of ${TRIGGER_ON.join(', ')}`);
    cond(t?.if, where); actions(t?.do, where);
    if (t?.on === 'flag' && t.flag) flagsIn('world.' + String(t.flag).replace(/^world\./i, ''), where);
  }
  if (typeof scn.goal?.win?.if === 'string') cond(scn.goal.win.if, 'goal.win');
  for (const [f, where] of read) if (!set.has(f)) warn(where, `flag "${f}" is read but never set and has no starting value in "flags"`);
  for (const k of Object.keys(scn.facts || {})) if (!set.has(k)) warn(`facts.${k}`, `flag "${k}" is never set, so this fact never shows`);
  return out;
}
