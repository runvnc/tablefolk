// package-test.mjs fixture: a module's cards and effects (and a behaviour's absence is fine)
export default function (api) {
  return {
    cards: { fx_card(g) { return `fixture card for ${g.id}`; } },
    effects: { fx_effect(g, n) { api.flag('fx_effect', +n); return `the fixture effect (${n})`; } },
  };
}
