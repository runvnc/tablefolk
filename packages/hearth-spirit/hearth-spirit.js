// hearth-spirit.js: the code half of the example package (tablefolk.json has the data half).
// What it shows, one of each (api.md "Powers, resources, designations, demands, weather"):
//   powers        golden_rain (target: a place; costs favour; the package's own weather kind; fields there grow)
//                 bread_gift (target: a character; two loaves, remembered, and a little favour back)
//   designations  offering_spot (work in code: a candle set out on each square)
//   resources     favour also grows with the faithful (a rule in code on top of the data's +1 an hour)
//   demands       offering: "bring an offering to the shrine" read from the player's words, with what follows
export default function (api) {
  const near = (o, x, z, r) => Math.hypot(o.x - x, o.z - z) <= r;
  return {
    resources: {
      // perHour as a rule: +1 an hour (the data), +0.5 for each of the faithful
      favour: { label: 'Favour', icon: '✨', start: 12, min: 0, max: 60, color: '#e8c25a', perHour: (v, ctx) => 1 + 0.5 * (ctx.groups?.faithful || 0) },
    },
    powers: {
      golden_rain: {
        label: 'Golden rain', icon: '🌧', cost: { favour: 5 }, target: 'place', cooldown: 20,
        description: 'Rain on a place for a while: the crops there grow back.',
        run(t, ctx) {
          api.weather('golden_rain', { area: { x: t.x, z: t.z, r: 7 }, duration: 45, intensity: 0.8 });
          let grew = 0;
          for (const o of api.things()) if (/tall_grass|pumpkin|flowers/.test(o.type) && near(o, t.x, t.z, 7) && o.mesh && api.meta(o.mesh)?.opts?.stock != null) { api.meta(o.mesh).opts.stock += 1; grew++; }
          for (const g of api.people()) if (near(g.logicalPos || g.root.position, t.x, t.z, 7)) api.addMemory?.(g, 'A golden rain fell from a clear sky. The spirit is watching.', 3);
          return `A golden rain falls${t.place ? ' on the ' + t.place : ''}${grew ? '; the fields drink it' : ''}.`;
        },
      },
      bread_gift: {
        label: 'Gift of bread', icon: '🍞', cost: { favour: 3 }, target: 'character',
        description: 'Two warm loaves appear in someone’s hands.',
        run(t) {
          const g = t.who; if (!g || g === api.player()) return { fail: 'Choose one of the villagers' };
          api.give(g, 'bread', 2); api.badge(g, '+2 bread'); api.sound('pickup', g);
          api.addMemory?.(g, 'Two warm loaves appeared in my hands from nowhere. A gift from the spirit of the hearth.', 4);
          api.resource('favour', 1);
          return `Two warm loaves appear in ${g.id}'s hands.`;
        },
      },
    },
    designations: {
      offering_spot: {
        label: 'offering spot', shape: 'posts', color: '#ffb347', jobs: ['*'], maxWorkers: 1,
        description: 'a candle set out where offerings are left',
        // work in code: called each tick once the worker holds a square; return a job step result
        async run(g, cell, ctx) {
          const p = g.logicalPos || g.root.position;
          if (Math.hypot(p.x - cell.x, p.z - cell.z) > 1.6) { const r = await ctx.goTo(cell.x, cell.z, 'the offering spot'); return r.fail ? r : { busy: true, ms: r.ms || 2000 }; }
          ctx.setDoing('setting out a candle for the spirit');
          api.playClip(g, 'pickup');
          ctx.build('candles');
          return { done: true, ms: 2500 };
        },
        done(d) { api.narrator('Candles burn at the offering spot.'); api.resource('favour', 2); },
      },
    },
    demands: {
      offering: {
        label: 'an offering at the shrine', keywords: ['offering', 'offer', 'sacrifice', 'tribute', 'shrine', 'temple'],
        // the player's words -> a demand (or { error }); ctx: { now, items, places, groups, people, api }
        parse(text, ctx) {
          const t = String(text).toLowerCase(), n = +(t.match(/\b(\d+)\b/)?.[1] || ({ two: 2, three: 3, four: 4 }[t.match(/\b(two|three|four)\b/)?.[1]]) || 1);
          const item = (ctx.items.find(i => t.includes(String(i).toLowerCase().replace(/s$/, ''))) || 'bread');
          const to = ctx.places.find(p => /shrine|temple/.test(p)) || 'temple';
          const of = Object.keys(ctx.groups).find(g => t.includes(g)) || Object.keys(ctx.groups)[0];
          return { text: `Bring ${n} ${item} to the ${to} as an offering.`, of: of ? { group: of } : 'all', by: { in: 360 }, met: { deliver: { item, n, to } },
                   onMet: { resource: { favour: 10 }, narrate: 'The spirit of the hearth is pleased.', set: { spirit_pleased: true } },
                   onMissed: { resource: { favour: -5 }, weather: { kind: 'storm', duration: 60, intensity: 0.7 }, narrate: 'The spirit of the hearth is displeased.' } };
        },
      },
    },
  };
}
