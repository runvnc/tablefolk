// Triggers: things that happen by themselves when the story moves.
//
//   "triggers": [
//     { "on": "flag", "flag": "cat_found", "to": true, "as": "pell", "do": { "reply": "Whiskers is home!" }, "once": true },
//     { "on": "given", "who": "pell", "item": "lost cat", "do": { "set": { "cat_found": true } } },
//     { "on": "start", "as": "hobb", "do": { "start": "open_shop" } },
//     { "on": "flag", "flag": "riddle_solved", "if": "world.cat_found", "as": "hobb", "do": { "act": "emote(dance)" } }
//   ]
// on: "flag" (a flag changed; "to": only to that value), "given" (the player
// handed a character an item; "who", "item" narrow it), "start" (the world
// began). "if": a condition; "once": at most once per world (remembered in
// the flags as __fired). "as": the character the actions run as. A trigger
// set off while another runs is skipped (no chains, no loops).
//
//   const triggers = createTriggers({ list: () => scenario.triggers, state, host, runner });
//   triggers.fire('flag', { name, value }) — state changes are watched for you
import { check, itemMatches, applyValue } from './expr.js';
import { perform } from './actions.js';

export function createTriggers({ list, state, host, runner = null }) {
  let busy = false;
  const fired = () => (state.raw().__fired ||= []);
  const api = {
    async fire(on, data = {}) {
      if (busy) return;
      const all = list() || [];
      const hits = all.map((t, i) => [t, i]).filter(([t, i]) => {
        if (!t || t.on !== on || (t.once && fired().includes(i))) return false;
        if (on === 'flag' && (t.flag != null && String(t.flag).replace(/^world\./i, '') !== data.name)) return false;
        if (on === 'flag' && 'to' in t && String(applyValue(undefined, t.to)) !== String(data.value)) return false;
        if (on === 'given' && ((t.who && String(t.who).toLowerCase() !== String(data.who).toLowerCase()) || (t.item && !itemMatches(data.item, t.item)))) return false;
        return check(t.if, host.scope(t.as || data.who || null, {}));
      });
      if (!hits.length) return;
      busy = true;
      try {
        for (const [t, i] of hits) {
          if (t.once) fired().push(i);
          host.log?.(`trigger ${on}${t.flag ? ' ' + t.flag : ''}${t.as ? ' as ' + t.as : ''}`);
          const me = t.as || data.who || null;
          const r = await perform(t.do, { host, state, me, vars: {}, runner, triggers: null });
          if (r.started && me) await runner?.advance(me, { until: 'wait' });
        }
      } finally { busy = false; }
    },
  };
  state.on(({ name, value }) => { api.fire('flag', { name, value }); });
  return api;
}
