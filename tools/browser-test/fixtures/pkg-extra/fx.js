// package-test.mjs fixture: a module's cards and effects (and a behaviour's absence is fine)
export default function (api) {
  return {
    cards: { fx_card(g) { return `fixture card for ${g.id}`; } },
    effects: { fx_effect(g, n) { api.flag('fx_effect', +n); return `the fixture effect (${n})`; } },
    // a module command offered in the game's picks when its offer() says so
    commands: { fx_code: { usage: 'fx_code()', help: 'fx_code() - the fixture command from code', allowedBy: 'default', run: () => { api.flag('fx_code_ran', true); return 'the fixture code command ran'; }, offer: g => api.flag('fx_offer_on') ? `run the fixture code command, ${g.id}` : null } },
    // a goal predicate: "win": { "fx_goal": 3 } holds when the flag fx_count reaches 3
    goals: { fx_goal: n => (+api.flag('fx_count') || 0) >= +n },
  };
}
