// Bard: a skill with code. The default export receives the skills API and
// returns command handlers (and/or extra effects) by name. Code modules load
// only from this site unless the page has ?trustSkills=1.
export default function bard(api) {
  return {
    commands: {
      sing(g, [song], { narrate, data }) {
        if ((data.cooldown[song] || 0) > 0) return narrate(g, `${g.id} is still catching their breath`), false;
        data.cooldown[song] = 2;
        const range = api.state.earshot || 6, p = g.root.position;
        const listeners = api.state.characters.concat(api.state.playerAvatar ? [api.state.playerAvatar] : [])
          .filter(o => o !== g && !o.defeated && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < range);
        for (const o of listeners) {
          if (song === 'rest') api.combat?.heal(o, 1);
          if (o.id && o !== api.state.playerAvatar) {
            const c = api.getBrainConfig(o.id);
            api.setBrainConfig(o.id, { pendingChat: (c.pendingChat || []).concat([`[event] ${g.id} sings a song of ${song}${song === 'courage' ? '; you feel brave' : '; you feel rested'}.`]).slice(-5) });
          }
        }
        narrate(g, `${g.id} sings a song of ${song} for ${listeners.length ? listeners.map(o => o.id || 'the player').join(', ') : 'nobody'}`);
        return true;
      },
    },
  };
}
