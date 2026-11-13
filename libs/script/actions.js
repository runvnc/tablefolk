// What a menu choice, a workflow step ("do") or a trigger does. One list of
// effects, run in this order:
//   take      the player hands this item to the character (stops here when they lack it)
//   set       flags: { "cat_found": true, "favours": "+1" } (world.x is always a flag;
//             a bare name is a flag here, a run variable inside a workflow)
//   say       the player's line (shown; the host decides who hears it)
//   reply     the character says this
//   act       command lines the character runs: "give(silver locket)", "walk(well)" (a string or a list)
//   give      the character hands the player this item (a give() command)
//   start     starts a workflow on the character: "riddle" or { "name": "riddle", "input": "..." }
//             ("workflow": the same, the name menus used first)
//   stop      stops the character's workflow (true)
// Texts take {{player}}, {{me}}, {{world.flag}}, {{player.gold}}, run variables.
//
//   await perform(actions, { host, state, me, vars, runner, triggers }) -> { ok, missing?, started? }
// host: { run(actorId, line) -> Promise<{ tookTurn }>, transfer(from, to, item) -> bool,
//         playerSays?(actorId, text), scope(me, vars) -> expr scope }
import { render, applyValue, findItem } from './expr.js';

// "+1" adds to what was there; "3+1" (a rendered "{{tries}}+1") is worked out
export function arith(was, v) {
  const m = typeof v === 'string' && v.match(/^\s*(-?\d+(?:\.\d+)?)\s*([+-])\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? (m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]) : applyValue(was, v);
}

const q = s => '"' + String(s).replace(/"/g, "'") + '"';
export async function perform(a, ctx) {
  if (!a) return { ok: true };
  const { host, state, me, vars = {}, runner = null, triggers = null } = ctx;
  const scope = host.scope(me, vars), t = x => render(x, scope);
  if (a.take != null) {
    const item = t(a.take);
    if (!host.transfer('player', me, item)) return { ok: false, missing: item };
    triggers?.fire('given', { who: me, item, from: 'player' });
  }
  for (const [k, v] of Object.entries(a.set || {})) {
    // world.x is always a flag; a bare name is a flag in a menu or trigger, a run variable in a workflow
    if (/^world\./i.test(k) || !ctx.inRun) state.set(k, typeof v === 'string' ? t(v) : v);
    else vars[k] = arith(vars[k], typeof v === 'string' ? t(v) : v);
  }
  if (a.say != null) host.playerSays?.(me, t(a.say));
  const lines = [];
  if (a.reply != null) lines.push(`say(${q(t(a.reply))})`);
  for (const l of [].concat(a.act ?? [])) lines.push(t(l));
  if (a.give != null) lines.push(`give(${t(a.give)})`);
  for (const line of lines) if (me) await host.run(me, line);
  if (a.stop && runner && me) runner.stop(me, 'stopped');
  let started = null;
  const startRef = a.start ?? a.workflow;   // "workflow": the menu field's older name
  if (startRef != null && runner && me) {
    const s = typeof startRef === 'string' ? { name: startRef } : startRef;
    if (runner.start(me, t(s.name), s.input != null ? t(s.input) : (a.say ?? ''))) started = s.name;
  }
  return { ok: true, started };
}

// The choices of a menu that show now: their "if" holds, and a "take" item is
// carried by the player. Labels, says, title and text rendered.
//   visibleMenu(menu, scope) -> menu with items filtered (scope from host.scope(me, {}))
import { check } from './expr.js';
export function visibleMenu(menu, scope) {
  if (!menu || !Array.isArray(menu.items)) return menu || null;
  const inv = scope.inventory?.('player');
  const items = menu.items.filter(i => i && check(i.if, scope) && (i.take == null || !inv || findItem(inv.items, render(i.take, scope))))
    .map(i => ({ ...i, label: render(i.label || i.say, scope), ...(i.say != null ? { say: render(i.say, scope) } : {}) }));
  return { ...menu, ...(menu.title ? { title: render(menu.title, scope) } : {}), ...(menu.text ? { text: render(menu.text, scope) } : {}), items };
}
// a character's menu: an id or object, or a list whose first entry with a holding "if" wins
export function pickMenu(ref, menus, scope) {
  if (Array.isArray(ref)) { const hit = ref.find(m => m && check(m.if, scope)); return hit ? pickMenu(hit.menu ?? hit, menus, scope) : null; }
  if (typeof ref === 'string') return menus?.[ref] ? { id: ref, ...menus[ref] } : null;
  return ref || null;
}
