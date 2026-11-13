// The step runner: workflows ("flows") that characters run, one at a time
// each. A flow is a list of steps; each may have an "id", and the next one
// follows unless it says "goto", "end", or branches.
//
//   await     "speech": the next words addressed to the character ("save" keeps them);
//             "turns": waits "turns": N turns
//   set       { "set": { "tries": "{{tries}}+1", "world.paid": true } } run variables; world.x are flags
//   take      { "take": "lost cat", "else": "stepId" } the player hands it over
//   if        { "if": "<condition>", "then": "a", "else": "b" } (expr.js)
//   choose    { "choose": "Fight or flee?", "options": { "fight": "s1", "flee": "s2" },
//               "by": ["decider", "model", "default"], "default": "flee" }
//   prompt    { "prompt": "...", "parse": "text|line|number|yesno|word", "save": "x" } (asks the model)
//   command   { "command": "say(\"hi\")" } a command line; takes the character's turn
//   menu      { "menu": "bert-sell", "save": "pick", "options": { "pay": "s1" }, "then": "s2",
//               "other": "s3", "closed": "s4" } the player chooses: an item's id branches by
//               "options" (else "then"); words that fit none are saved and go to "other"
//               (else the menu asks again); closing goes to "closed" (else the flow ends)
//   do        { "do": { "reply": "...", "act": [...], "set": {...}, "give": "..." } } actions.js
//   goto / end, and "max": N visits then "exit"
//
//   const runner = createRunner({ flows: () => scenario.workflows, state, host, store, choosers });
//   runner.start(actorId, name, input) / stop / active / pause / resume
//   await runner.advance(actorId, { until: 'turn' | 'wait' }) -> { acted }
//     'turn': stops after a command that took the character's turn; 'wait': runs on
//     until the flow waits (speech, turns, its end): a flow started from a menu
// store: { get(actorId) -> run | null, set(actorId, run | null) } (runs are saved with the world)
// host: actions.js's, plus hear(actorId) -> text | null, ask(actorId, question, parse, options) ->
//   text | null (no model: null), decide?(actorId, question, options) -> { choice, confidence },
//   menu?(actorId, ref) -> { item } | { other, text } | null, log?(text), scope(me, vars)
// Runs keep the step's id (or "#<index>" for a step without one) and a version,
// so a saved run survives edits that add or move steps.
import { check, render, findItem } from './expr.js';
import { perform, arith } from './actions.js';

export const RUN_VERSION = 2;
const stepKey = (def, i) => def.steps[i]?.id ?? '#' + i;
function indexOf(def, ref) {
  if (ref == null) return -1;
  if (typeof ref === 'number') return ref;                                   // old saves: an index
  if (/^#\d+$/.test(ref)) return +ref.slice(1);
  return def.steps.findIndex(s => s.id === ref);
}
function parseAnswer(text, how, options = []) {
  const t = String(text ?? '').trim();
  switch (how) {
    case 'number': { const m = t.replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : 0; }
    case 'yesno': return /^\W*(yes|yeah|yep|sure|ok|okay|true|y)\b/i.test(t) ? 'yes' : 'no';
    case 'word': return (t.match(/[A-Za-z0-9_-]+/) || [''])[0].toLowerCase();
    case 'choice': { const low = t.toLowerCase(); return options.find(o => low.startsWith(o.toLowerCase())) || options.find(o => low.includes(o.toLowerCase())) || null; }
    case 'line': return t.split('\n').map(s => s.trim()).find(Boolean)?.replace(/^say\((.*)\)$/i, '$1').replace(/^["'“]|["'”]$/g, '') || '';
    default: return t;
  }
}
export { parseAnswer };

export function createRunner({ flows, state, host, store, choosers = ['decider', 'model', 'default'], triggers = null, maxSteps = 40, deciderMin = 0.5 }) {
  const defs = () => flows() || {};
  const log = t => host.log?.(t);
  function start(actor, name, input = '') {
    const def = defs()[name];
    if (!def?.steps?.length) { log(`${actor}: no workflow called ${name}`); return false; }
    const at = def.start != null ? (typeof def.start === 'number' ? stepKey(def, def.start) : def.start) : stepKey(def, 0);
    store.set(actor, { v: RUN_VERSION, name, at, vars: { input: String(input ?? ''), ...(def.vars || {}) }, visits: {}, wait: 0, paused: false });
    log(`${actor} [workflow] starts ${name}${input ? ' (' + input + ')' : ''}`);
    return true;
  }
  function stop(actor, why = '') {
    const run = store.get(actor); if (!run) return;
    store.set(actor, null);
    log(`${actor} [workflow] ${run.name} ended${why ? ': ' + why : ''}`);
    host.ended?.(actor, run);
  }
  const active = actor => !!store.get(actor);
  const pause = actor => { const r = store.get(actor); if (r) { r.paused = true; store.set(actor, r); } };
  const resume = actor => { const r = store.get(actor); if (r) { r.paused = false; store.set(actor, r); } };

  async function choose(actor, s, run, scope) {
    const options = Object.keys(s.options || {}), q = render(s.choose, scope);
    for (const who of [].concat(s.by || choosers)) {
      if (who === 'default') return s.default ?? options[0];
      if (who === 'decider' && host.decide) {
        const r = await host.decide(actor, q, options).catch(() => null);
        if (r?.choice && (r.confidence ?? 1) >= (s.min ?? deciderMin)) return r.choice;
      }
      if (who === 'model') {
        const text = await host.ask(actor, q, 'choice', options);
        const p = text == null ? null : parseAnswer(text, 'choice', options);
        if (p) return p;
      }
    }
    return s.default ?? options[0];
  }

  // Run steps until the flow waits, ends, or (until: 'turn') a command took the turn.
  async function advance(actor, { until = 'turn' } = {}) {
    let acted = false;
    for (let guard = 0; ; guard++) {
      const run = store.get(actor); if (!run || run.paused) return { acted };
      const def = defs()[run.name]; if (!def) { stop(actor, 'definition missing'); return { acted }; }
      if (run.at === '#end') { stop(actor); return { acted }; }
      const i = indexOf(def, run.at);
      if (i < 0 || i >= def.steps.length) { stop(actor, i < 0 && run.at != null ? `step ${run.at} no longer exists` : ''); return { acted }; }
      if (guard >= maxSteps) { stop(actor, 'too many steps without a pause'); return { acted }; }
      const s = def.steps[i], key = stepKey(def, i);
      run.at = key; run.visits[key] = (run.visits[key] || 0) + 1;
      if (s.max && run.visits[key] > s.max) {
        if (s.exit == null || indexOf(def, s.exit) < 0) { stop(actor, `step ${key} ran ${s.max} times`); return { acted }; }
        run.at = s.exit; store.set(actor, run); continue;
      }
      const go = ref => { run.at = ref == null ? null : ref; };
      const next = () => { if (s.end) run.at = '#end'; else if (s.goto != null) run.at = s.goto; else run.at = stepKey(def, i + 1); };
      const scope = host.scope(actor, run.vars);
      try {
        if (s.await) {
          if (s.await === 'turns') {
            if (until === 'wait' && (run.wait || 0) + 1 < (+s.turns || 1)) { run.visits[key]--; store.set(actor, run); return { acted }; }
            run.wait = (run.wait || 0) + 1;
            if (run.wait < (+s.turns || 1)) { run.visits[key]--; store.set(actor, run); return { acted }; }
            run.wait = 0; next(); store.set(actor, run); continue;
          }
          const heard = host.hear(actor);
          if (heard == null) { run.visits[key]--; store.set(actor, run); return { acted }; }
          if (s.save) run.vars[s.save] = heard;
          next(); store.set(actor, run); continue;
        }
        if (s.set) {
          for (const [k, v] of Object.entries(s.set)) {
            const val = typeof v === 'string' ? render(v, scope) : v;
            if (/^world\./i.test(k)) state.set(k, val); else run.vars[k] = arith(run.vars[k], val);
          }
          if (s.take == null && s.if == null && s.command == null) { next(); store.set(actor, run); continue; }
        }
        if (s.take != null) {
          const item = render(s.take, scope), ok = host.transfer('player', actor, item);
          if (ok) triggers?.fire('given', { who: actor, item, from: 'player' });
          if (s.save) run.vars[s.save] = ok ? 'yes' : 'no';
          if (!ok && s.else != null) { go(s.else); store.set(actor, run); continue; }
          next(); store.set(actor, run); continue;
        }
        if (s.if != null) {
          const ok = check(s.if, scope);
          const to = ok ? s.then : s.else;
          if (to != null) go(to); else run.at = stepKey(def, i + 1);
          store.set(actor, run); continue;
        }
        if (s.choose != null) {
          const pickd = await choose(actor, s, run, scope);
          if (s.save) run.vars[s.save] = pickd;
          go(s.options?.[pickd] ?? stepKey(def, i + 1)); store.set(actor, run); continue;
        }
        if (s.prompt != null) {
          const text = await host.ask(actor, render(s.prompt, scope), s.parse || 'text');
          if (s.save) run.vars[s.save] = text == null ? (s.default ?? '') : parseAnswer(text, s.parse || 'text');
          next(); store.set(actor, run); continue;
        }
        if (s.menu != null) {
          if (!host.menu) { next(); store.set(actor, run); continue; }
          store.set(actor, run);
          const r = await host.menu(actor, s.menu);
          const cur = store.get(actor); if (cur !== run && cur?.name !== run.name) return { acted };   // replaced meanwhile
          if (!r) { if (s.closed != null) { go(s.closed); store.set(actor, run); continue; } stop(actor, 'menu closed'); return { acted }; }
          if (r.item) {
            if (s.save) run.vars[s.save] = r.item.id;
            go(s.options?.[r.item.id] ?? s.then ?? stepKey(def, i + 1)); store.set(actor, run); acted = true; continue;
          }
          if (s.save) run.vars[s.save] = r.text ?? '';
          if (s.other != null) { go(s.other); store.set(actor, run); continue; }
          run.visits[key]--; store.set(actor, run); continue;   // asks again
        }
        if (s.do != null) {
          const r = await perform(s.do, { host, state, me: actor, vars: run.vars, runner: api, triggers, inRun: true });
          if (r.started) return { acted: true };   // another flow replaced this one
          if (!r.ok && s.else != null) { go(s.else); store.set(actor, run); continue; }
          next(); store.set(actor, run); acted = true; continue;
        }
        if (s.command != null) {
          const line = render(s.command, scope).replace(/"([^"]*)"/g, (m, inner) => '"' + inner.replace(/"/g, "'") + '"');
          next(); store.set(actor, run);
          log(`${actor} [workflow] ${line}`);
          const r = await host.run(actor, line);
          acted = true;
          if (run.at === '#end') { stop(actor); return { acted }; }
          if (until === 'turn' && r?.tookTurn !== false) return { acted };
          continue;
        }
        next(); store.set(actor, run);
        if (run.at === '#end') { stop(actor); return { acted }; }
      } catch (e) {
        stop(actor, 'error: ' + e.message);
        return { acted };
      }
    }
  }
  const api = { start, stop, active, pause, resume, advance, get: actor => store.get(actor), describe: () => Object.entries(defs()).map(([n, d]) => `${n}${d.description ? ' (' + d.description + ')' : ''}`) };
  return api;
}
export { findItem };
