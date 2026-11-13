/* story.js -- the game's host for @tablefolk/script (libs/script): world
 * flags and facts, conditions, actions, workflows and triggers, wired to the
 * world (inventories, characters' commands, what the player says, the model).
 * The scenario format is in the scenario skill's story.md and workflows.md;
 * the library's own README has the rest.
 *
 * Scenario: "flags", "facts", "workflows", "triggers" (+ menus.js "menus").
 * Flags live in state.flags (saved with the world); runs in each character's
 * brain config ("wf", saved), by step id.
 *
 *   window.tablefolkStory = { get, set, all, check(expr, { me, vars }), render(text, { me, vars }),
 *     take(me, item), hasItem(who, item, me), factsFor(g), reset(flags, facts, triggers),
 *     perform(actions, me), visibleMenu(menu, me), pickMenu(ref, me), fire(on, data), validate(scn), state, host }
 *   window.tablefolkWorkflows = { start(gOrId, name, input), stop(id), active(id), turn(g) (one turn),
 *     drive(id) (until it waits), pause(id), resume(id), describe(g), parse, render }
 * Each flag change fires 'tablefolk-flag' on window ({ name, value, was }); a
 * workflow's end fires 'tablefolk-workflow' ({ agentId, name, ended, vars }).
 */
import { createState, createRunner, createTriggers, perform as libPerform, check as libCheck, render as libRender,
  visibleMenu as libVisible, pickMenu as libPick, findItem, truthy, validate, parseAnswer } from '../libs/script/index.js';

const W = () => window.tablefolk;
const S = () => W()?.state || window.TABLEFOLK_STATE || {};
const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
const agent = id => (W()?.getAgents?.() || S().characters || []).find(c => c.id.toLowerCase() === String(id).toLowerCase());
const meId = me => typeof me === 'string' ? me : me?.id || null;
const norm = i => typeof i === 'string' ? { name: i, qty: 1 } : i;

// who carries what: the player (state.player) or a character (its brain config)
function inventory(who) {
  const w = String(who ?? '').toLowerCase();
  if (w === 'player' || w === 'you') { const p = S().player || { gold: 0, items: [] }; p.items = (p.items || []).map(norm); return p; }
  const g = agent(who); if (!g) return null;
  const cfg = W().getBrainConfig(g.id), inv = cfg.inventory || (cfg.inventory = { gold: 0, items: [] });
  inv.items = (inv.items || []).map(norm);
  return inv;
}
// the player hands an item to a character (the only direction scripts move things by hand;
// characters give and sell with their own commands)
function transfer(from, to, item) {
  const a = inventory(from), b = inventory(to); if (!a || !b) return false;
  const it = findItem(a.items, item); if (!it) return false;
  if ((it.qty ?? 1) > 1) it.qty--; else a.items.splice(a.items.indexOf(it), 1);
  const have = b.items.find(x => x.name.toLowerCase() === it.name.toLowerCase()); if (have) have.qty = (have.qty || 0) + 1; else b.items.push({ name: it.name, qty: 1 });
  const g = agent(to); if (g) W().setBrainConfig(g.id, { inventory: b });
  W().renderPlayerInventory?.();
  if (g) window.tablefolkMind?.event?.(g, 'given', { who: playerName(), what: it.name });
  window.tablefolkDiag?.note?.('story', `${from === 'player' ? playerName() : from} gives ${to} ${it.name}`);
  return true;
}
// a workflow's narrow question to the character's model (null: no model here)
async function ask(actor, question, how = 'text', options = []) {
  const llm = window.tablefolkLLM;
  if (!llm || window.tablefolkBrainInfo?.()?.engine === 'none') return null;
  const cfg = W().getBrainConfig(actor) || {};
  const system = [`You are ${actor}${cfg.style ? ', ' + cfg.style : ''}.`, cfg.personality ? 'About you: ' + cfg.personality : '',
    'Answer only the question, briefly, with exactly what it asks for. No commands, no explanations.'].filter(Boolean).join('\n');
  const q = how === 'choice' ? `${question}\nAnswer with exactly one of: ${options.join(', ')}.` : how === 'number' ? `${question}\nAnswer with a number only.` : how === 'yesno' ? `${question}\nAnswer yes or no.` : question;
  const r = await llm.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: q }], max_tokens: 120, temperature: .3, agentId: actor + ':wf' });
  const text = r.choices?.[0]?.message?.content || '';
  log(`${actor} [workflow] ${q.split('\n')[0].slice(0, 80)} -> ${text.slice(0, 120)}`);
  return text;
}
let choosing = false;
const log = t => { try { W()?.appendLog?.(t) ?? console.info('[story]', t); } catch {} };

const host = {
  scope: (me, vars = {}) => ({ me: meId(me), vars, playerName, inventory, flag: n => state.get(n) }),
  inventory, transfer, ask, log,
  // a command line as the character (world-integration.js runAs: waits for the turn to settle)
  async run(actor, line) {
    // a menu choice the player picked that sells is their agreement to that price (trade.js consent);
    // a workflow's or trigger's sale still needs the player's words
    const c = W().parseLLMCommandLine?.(line), g = agent(actor);
    if (c?.kind === 'sell' && g && choosing) { const st = findItem(inventory(actor)?.items, c.item); (g._shop ||= {}).accept = { item: st?.name || c.item, price: Math.round(Number(c.price)) }; }
    await W().runAs?.(actor, line, 'script');
    return { tookTurn: true };
  },
  playerSays: (actor, text) => log(`${playerName()} -> ${actor || 'everyone'}: ${text}`),
  // the words addressed to the character since it last listened
  hear(actor) {
    const cfg = W().getBrainConfig(actor); const heard = cfg?.pendingChat || [];
    if (!heard.length) return null;
    W().setBrainConfig(actor, { pendingChat: [] });
    return heard.map(l => String(l).replace(/^(.+?)\s+says:\s*/, '')).join(' ');
  },
  menu: (actor, ref) => window.tablefolkMenu?.open(ref, { agentId: actor, flow: true }) ?? Promise.resolve(null),
  ended(actor, run) {
    try { window.dispatchEvent(new CustomEvent('tablefolk-workflow', { detail: { agentId: actor, name: run.name, ended: true, vars: run.vars } })); } catch {}
    try { window.updatePerceptionUI?.(); } catch {}
  },
};

const state = createState({ flags: () => (S().flags ||= {}), facts: () => S().facts || {} });
state.on(({ name, value, was }) => {
  window.tablefolkDiag?.note?.('story', `${name} = ${JSON.stringify(value)}`);
  try { window.dispatchEvent(new CustomEvent('tablefolk-flag', { detail: { name, value, was } })); } catch {}
});
// workflows from loaded packages; the scenario's own win
const flows = () => ({ ...(window.tablefolkPackages?.workflows || {}), ...(S().workflows || {}) });
const store = { get: id => W()?.getBrainConfig(id)?.wf || null, set: (id, run) => W()?.setBrainConfig(id, { wf: run || null }) };
const runner = createRunner({ flows, state, host, store });
const triggers = createTriggers({ list: () => S().triggers || [], state, host, runner });

window.tablefolkStory = {
  get: state.get, set: state.set, all: state.all, state, host, runner, triggers, truthy, validate,
  check: (expr, { me = null, vars = {} } = {}) => libCheck(expr, host.scope(me, vars)),
  render: (text, { me = null, vars = {} } = {}) => libRender(text, host.scope(me, vars)),
  take: (me, item) => transfer('player', meId(me), item),
  hasItem: (who, item, me) => !!findItem(inventory(who === 'me' ? meId(me) : who)?.items, item),
  factsFor: g => state.facts(meId(g), host.scope(g, {})),
  reset(flags = {}, facts = {}, trigs = []) { const s = S(); s.flags = { ...(flags || {}) }; s.facts = facts || {}; s.triggers = Array.isArray(trigs) ? trigs : []; },
  // a menu choice the player picked (menus.js)
  async perform(actions, me) { choosing = true; try { return await libPerform(actions, { host, state, me: meId(me), runner, triggers }); } finally { choosing = false; } },
  visibleMenu: (menu, me) => libVisible(menu, host.scope(me, {})),
  pickMenu: (ref, me) => libPick(ref, window.tablefolkScenario?.active?.scn?.menus || {}, host.scope(me, {})),
  fire: (on, data) => triggers.fire(on, data),
};

const may = (id, name) => { const m = W()?.getBrainConfig(id)?.workflows; return !Array.isArray(m) || m.includes(name); };
window.tablefolkWorkflows = {
  start(gOrId, name, input = '') {
    const id = meId(gOrId); if (!id) return false;
    if (!may(id, name)) { log(`${id} may not run workflow ${name}`); return false; }
    return runner.start(id, name, input);
  },
  stop: id => runner.stop(meId(id), 'stopped'),
  active: id => runner.active(meId(id)),
  // one of the character's turns inside its workflow: true when it acted
  turn: async g => (await runner.advance(meId(g), { until: 'turn' })).acted,
  // until it waits (speech, turns, its end): a workflow started from a menu, or just spoken to
  drive: async id => (await runner.advance(meId(id), { until: 'wait' })).acted,
  pause: id => runner.pause(meId(id)), resume: id => runner.resume(meId(id)),
  describe: g => { const m = W()?.getBrainConfig(meId(g))?.workflows; return Object.entries(flows()).filter(([n]) => !Array.isArray(m) || m.includes(n)).map(([n, d]) => `${n}${d.description ? ' (' + d.description + ')' : ''}`); },
  test: (expr, vars) => libCheck(expr, host.scope(null, vars || {})), parse: parseAnswer, render: (t, vars, g) => libRender(t, host.scope(g, vars || {})),
};
