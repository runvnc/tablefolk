// @tablefolk/script -- scripted stories: world flags and facts, one condition
// language, actions, a step runner for workflows (menus as steps the player
// answers), triggers, and a validator. No DOM and no game: the app gives a
// small host (who carries what, run a character's command, what was said).
// Runs in the browser and in Node. README.md has the scenario format.
//
//   import { createState, createRunner, createTriggers, perform, check, render, validate } from '@tablefolk/script';
export { parse, evaluate, check, render, lookup, truthy, itemMatches, findItem, applyValue, ExprError } from './expr.js';
export { createState } from './state.js';
export { perform, arith, visibleMenu, pickMenu } from './actions.js';
export { createRunner, parseAnswer, RUN_VERSION } from './run.js';
export { createTriggers } from './triggers.js';
export { validate } from './validate.js';

// A plain in-memory host (tests, tools, a text adventure): inventories and a
// say log; run() understands say("..."), give(item), sell("item", n).
export function memoryHost({ player = { gold: 0, items: [] }, chars = {}, playerName = 'Traveller' } = {}) {
  const inv = who => (who === 'player' || who === 'you' ? player : chars[who]?.inventory) || null;
  const said = [], heard = {};
  const norm = i => typeof i === 'string' ? { name: i, qty: 1 } : i;
  const move = (from, to, name) => {
    const a = inv(from), b = inv(to); if (!a || !b) return false;
    a.items = (a.items || []).map(norm); b.items = (b.items || []).map(norm);
    const it = a.items.find(i => (i.qty ?? 1) > 0 && (i.name.toLowerCase() === String(name).toLowerCase() || new RegExp('(^|\\W)' + String(name).toLowerCase() + '(\\W|$)').test(i.name.toLowerCase())));
    if (!it) return false;
    if ((it.qty ?? 1) > 1) it.qty--; else a.items.splice(a.items.indexOf(it), 1);
    const have = b.items.find(i => i.name === it.name); if (have) have.qty = (have.qty || 1) + 1; else b.items.push({ name: it.name, qty: 1 });
    return it.name;
  };
  const host = {
    player, chars, said, heard,
    scope: (me, vars) => ({ me, vars, playerName: () => playerName, inventory: inv, flag: n => host._state?.get(n) }),
    transfer: (from, to, item) => !!move(from, to, item),
    async run(actor, line) {
      let m;
      if ((m = line.match(/^say\("(.*)"\)$/s))) said.push(`${actor}: ${m[1]}`);
      else if ((m = line.match(/^give\((.+)\)$/))) move(actor, 'player', m[1].replace(/^["']|["']$/g, ''));
      else if ((m = line.match(/^sell\("(.+)",\s*(\d+)\)$/))) { if ((player.gold || 0) >= +m[2] && move(actor, 'player', m[1])) { player.gold -= +m[2]; inv(actor).gold = (inv(actor).gold || 0) + +m[2]; } }
      else said.push(`${actor} does: ${line}`);
      return { tookTurn: true };
    },
    hear: actor => { const q = heard[actor]; return q?.length ? q.shift() : null; },
    ask: async () => null,
    playerSays: (actor, text) => said.push(`player -> ${actor}: ${text}`),
    log: () => {},
  };
  return host;   // set host._state = state so conditions can read flags
}
