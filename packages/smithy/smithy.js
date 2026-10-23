// Code for the smithy package (packages.js loads it; see tablefolk.json).
export default function (api) {
  let turns = 0;
  return {
    behaviours: {
      // A smith with no customer near hammers away every few player turns.
      hammer: { on: 'tablefolk-player-turn', run(g) {
        if (++turns % 3) return;
        const p = api.state.playerAvatar?.root.position, q = g.root.position;
        if (p && Math.hypot(p.x - q.x, p.z - q.z) < 3) return;
        try { emitBadge(g, 'clang'); } catch {}
        window.tablefolkSfx?.play('hit', q);
      } },
    },
    uses: {
      // E on the bellows: the fire roars; any smith nearby takes note.
      pump_bellows(thing, who) {
        window.tablefolkSfx?.play('doorClose', thing.position);
        api.toast('You pump the bellows. The forge roars.');
        for (const g of api.state.characters) {
          if (Math.hypot(g.root.position.x - thing.position.x, g.root.position.z - thing.position.z) < 5)
            api.addMemory?.(g, 'Someone worked the bellows for me.', 0.4);
        }
        return true;
      },
    },
  };
}
