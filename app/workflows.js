/* workflows.js -- small JSON workflows that keep little models on track.
 *
 * A 2B model can answer one narrow question well, but loses the thread over a
 * multi-step task. A workflow breaks the task into steps; the model only ever
 * answers the step in front of it, and the steps decide what happens next.
 *
 *   "workflows": {
 *     "haggle": {
 *       "description": "sell the sword for a fair price",
 *       "steps": [
 *         { "id": "wait",   "await": "speech", "save": "offer" },
 *         { "id": "price",  "prompt": "The customer said: \"{{offer}}\". What price in gold did they offer? Answer with a number, or 0 if none.", "parse": "number", "save": "bid" },
 *         { "if": "bid >= 40", "then": "sell", "else": "counter" },
 *         { "id": "counter", "prompt": "Write one short, grumpy sentence refusing {{bid}} gold and asking for 50.", "parse": "line", "save": "reply" },
 *         { "command": "say(\"{{reply}}\")", "goto": "wait", "max": 4, "exit": "giveup" },
 *         { "id": "sell",   "command": "sell(\"magic sword\", {{bid}})", "end": true },
 *         { "id": "giveup", "command": "say(\"Bah. Come back with real money.\")", "end": true }
 *       ]
 *     }
 *   }
 *
 * Steps (each may have an "id"; the next step in the list follows unless a
 * step says "goto", "end", or branches):
 *   prompt   ask the character's model; "parse": text | line | number |
 *            yesno | word; "save": variable
 *   choose   {"choose": "Question?", "options": {"fight": "stepA", "flee":
 *            "stepB"}} the model picks an option (by name), which branches
 *   if       {"if": "bid >= 40", "then": "stepA", "else": "stepB"}
 *            (== != >= <= > < contains, or a lone variable for truthiness)
 *   command  a game command line, e.g. "walk(tavern)", "say(\"{{reply}}\")";
 *            it takes the character's turn, the workflow continues next turn
 *   await    "speech": wait for the next words or event addressed to the
 *            character (saved in "save"); "turns": N waits N turns
 *   set      {"set": {"tries": "{{tries}}+1"}} (simple + and - on numbers)
 *   goto/end "goto": "stepId", "end": true; "max": N visits, then "exit"
 * Templates: {{var}}, plus {{me}}, {{player}}, {{input}} (what started it).
 *
 * Starting: the command workflow(name) / workflow(name, input) (allow
 * "workflow"), an agent's "workflow": "name" (runs from the start), or the
 * console tablefolkWorkflows.start(agentId, name, input). An agent's
 * "workflows": ["haggle"] limits which it may start (default: all).
 * A run ends at "end", at the last step, or after 40 steps without a pause.
 *
 * The model is called through window.tablefolkLLM (the active brain, whatever
 * it is), with a short prompt: who the character is plus the one question.
 */
(function () {
  // packages.js: workflows from loaded packages, the scenario's own win
  const defs = () => ({ ...(window.tablefolkPackages?.workflows || {}), ...(state.workflows || {}) });
  const cfgOf = id => getBrainConfig(id);
  const agentOf = id => state.characters.find(c => c.id === id);
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';

  function render(tpl, vars, g) {
    return String(tpl ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
      if (k === 'me') return g.id;
      if (k === 'player') return playerName();
      const v = vars[k]; return v == null ? '' : String(v);
    });
  }
  const num = v => { const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
  function value(tok, vars) {
    tok = tok.trim();
    if (/^".*"$|^'.*'$/.test(tok)) return tok.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(tok)) return +tok;
    if (tok in vars) { const v = vars[tok]; return Number.isFinite(num(v)) && /^\s*-?\d/.test(String(v)) ? num(v) : v; }
    return tok;
  }
  function test(expr, vars) {
    const m = String(expr).match(/^(.*?)\s*(==|!=|>=|<=|>|<|\bcontains\b)\s*(.*)$/);
    if (!m) { const v = value(expr, vars); return !!v && !/^(no|false|0|none)$/i.test(String(v)); }
    const a = value(m[1], vars), b = value(m[3], vars), op = m[2];
    if (op === 'contains') return String(a).toLowerCase().includes(String(b).toLowerCase());
    const both = typeof a === 'number' && typeof b === 'number';
    const x = both ? a : String(a).toLowerCase(), y = both ? b : String(b).toLowerCase();
    return op === '==' ? x == y : op === '!=' ? x != y : op === '>=' ? x >= y : op === '<=' ? x <= y : op === '>' ? x > y : x < y;
  }
  function parse(text, how, options) {
    const t = String(text || '').trim();
    switch (how) {
      case 'number': { const n = num(t); return Number.isFinite(n) ? n : 0; }
      case 'yesno': return /^\W*(yes|yeah|yep|sure|ok|okay|true|y)\b/i.test(t) ? 'yes' : 'no';
      case 'word': return (t.match(/[A-Za-z0-9_-]+/) || [''])[0].toLowerCase();
      case 'choice': {
        const low = t.toLowerCase();
        return options.find(o => low.startsWith(o.toLowerCase())) || options.find(o => low.includes(o.toLowerCase())) || null;
      }
      case 'line': return t.split('\n').map(s => s.trim()).find(Boolean)?.replace(/^say\((.*)\)$/i, '$1').replace(/^["'“]|["'”]$/g, '') || '';
      default: return t;
    }
  }

  async function ask(g, question, how = 'text', options = []) {
    const llm = window.tablefolkLLM;
    if (!llm) throw new Error('no brain loaded for workflows');
    const cfg = cfgOf(g.id);
    const system = [`You are ${g.id}${cfg.style ? ', ' + cfg.style : ''}.`, cfg.personality ? 'About you: ' + cfg.personality : '',
      'Answer only the question, briefly, with exactly what it asks for. No commands, no explanations.'].filter(Boolean).join('\n');
    const q = how === 'choice' ? `${question}\nAnswer with exactly one of: ${options.join(', ')}.` : how === 'number' ? `${question}\nAnswer with a number only.` : how === 'yesno' ? `${question}\nAnswer yes or no.` : question;
    const r = await llm.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: q }], max_tokens: 120, temperature: .3, agentId: g.id + ':wf' });
    const text = r.choices?.[0]?.message?.content || '';
    log(`${g.id} [workflow] ${q.split('\n')[0].slice(0, 80)} -> ${text.slice(0, 120)}`);
    return text;
  }

  function stepIndex(def, ref) { return typeof ref === 'number' ? ref : def.steps.findIndex(s => s.id === ref); }
  function stopRun(g, why) {
    const cfg = cfgOf(g.id), wf = cfg.wf; if (!wf) return;
    setBrainConfig(g.id, { wf: null });
    log(`${g.id} [workflow] ${wf.name} ended${why ? ': ' + why : ''}`);
    try { window.dispatchEvent(new CustomEvent('tablefolk-workflow', { detail: { agentId: g.id, name: wf.name, ended: true, vars: wf.vars } })); } catch {}
    try { updatePerceptionUI(); } catch {}
  }
  function start(gOrId, name, input = '') {
    const g = typeof gOrId === 'string' ? agentOf(gOrId) : gOrId;
    const def = defs()[name];
    if (!g || !def?.steps?.length) { if (g) log(`${g.id}: no workflow called ${name}`); return false; }
    const may = cfgOf(g.id).workflows;
    if (Array.isArray(may) && !may.includes(name)) { log(`${g.id} may not run workflow ${name}`); return false; }
    setBrainConfig(g.id, { wf: { name, at: stepIndex(def, def.start ?? 0), vars: { input: String(input ?? ''), ...(def.vars || {}) }, visits: {}, wait: 0 } });
    log(`${g.id} [workflow] starts ${name}${input ? ' (' + input + ')' : ''}`);
    return true;
  }
  const active = id => !!cfgOf(id)?.wf;

  // Run one character turn inside its workflow: steps until a command (which
  // takes the turn) or a pause. Returns true if the character acted.
  async function turn(g, { runLine } = {}) {
    let guard = 0;
    for (;;) {
      const cfg = cfgOf(g.id), wf = cfg.wf; if (!wf) return false;
      const def = defs()[wf.name]; if (!def) { stopRun(g, 'definition missing'); return false; }
      if (wf.at < 0 || wf.at >= def.steps.length) { stopRun(g); return false; }
      if (++guard > 40) { stopRun(g, 'too many steps without a pause'); return false; }
      const s = def.steps[wf.at], key = s.id || String(wf.at);
      wf.visits[key] = (wf.visits[key] || 0) + 1;
      if (s.max && wf.visits[key] > s.max) {
        const exit = s.exit != null ? stepIndex(def, s.exit) : -1;
        if (exit < 0) { stopRun(g, `step ${key} ran ${s.max} times`); return false; }
        wf.at = exit; continue;
      }
      const next = () => { wf.at = s.end ? -1 : s.goto != null ? stepIndex(def, s.goto) : wf.at + 1; };
      try {
        if (s.await) {
          if (s.await === 'turns') {
            wf.wait = (wf.wait || 0) + 1;
            if (wf.wait < (+s.turns || 1)) { setBrainConfig(g.id, { wf }); return false; }
            wf.wait = 0; next(); continue;
          }
          const heard = cfg.pendingChat || [];
          if (!heard.length) { wf.visits[key]--; setBrainConfig(g.id, { wf }); return false; }
          const text = heard.map(l => String(l).replace(/^(.+?)\s+says:\s*/, '')).join(' ');
          setBrainConfig(g.id, { pendingChat: [] });
          if (s.save) wf.vars[s.save] = text;
          next(); continue;
        }
        if (s.set) {
          for (const [k, v] of Object.entries(s.set)) {
            const expr = render(v, wf.vars, g), m = expr.match(/^\s*(-?\d+(?:\.\d+)?)\s*([+-])\s*(-?\d+(?:\.\d+)?)\s*$/);
            wf.vars[k] = m ? (m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]) : expr;
          }
          next(); continue;
        }
        if (s.if != null) {
          const ok = test(render(s.if, wf.vars, g), wf.vars);
          const to = ok ? s.then : s.else;
          wf.at = to != null ? stepIndex(def, to) : wf.at + 1;
          continue;
        }
        if (s.choose != null) {
          const options = Object.keys(s.options || {});
          const pickd = parse(await ask(g, render(s.choose, wf.vars, g), 'choice', options), 'choice', options) || s.default || options[0];
          if (s.save) wf.vars[s.save] = pickd;
          wf.at = stepIndex(def, s.options[pickd]);
          continue;
        }
        if (s.prompt != null) {
          const out = parse(await ask(g, render(s.prompt, wf.vars, g), s.parse || 'text'), s.parse || 'text');
          if (s.save) wf.vars[s.save] = out;
          next(); continue;
        }
        if (s.command != null) {
          const line = render(s.command, wf.vars, g).replace(/"([^"]*)"/g, (m, inner) => '"' + inner.replace(/"/g, "'") + '"');
          next(); setBrainConfig(g.id, { wf });
          log(`${g.id} [workflow] ${line}`);
          await runLine(g, line);
          if (wf.at < 0) stopRun(g);
          return true;
        }
        next();
      } catch (e) {
        stopRun(g, 'error: ' + e.message);
        return false;
      } finally {
        if (cfgOf(g.id).wf) setBrainConfig(g.id, { wf });
      }
    }
  }

  // For the character's prompt: the routines it may start.
  function describe(g) {
    const all = defs(), may = cfgOf(g.id).workflows;
    return Object.entries(all).filter(([n]) => !Array.isArray(may) || may.includes(n)).map(([n, d]) => `${n}${d.description ? ' (' + d.description + ')' : ''}`);
  }

  window.tablefolkWorkflows = { start, stop: id => { const g = agentOf(id); if (g) stopRun(g, 'stopped'); }, active, turn, describe, test, parse, render };
})();
