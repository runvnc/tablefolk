// god-rules-test.mjs: the God package's rules in Node (packages/god/god-core.js):
// belief and sides, mana, prayers (made, answered, met with silence, lapsed),
// powers (fitting, cruel, justified, a beast struck down), omens and prophecies,
// demands met (and rewarded or not) and missed (anger or mercy), the council's
// vote, decrees and deadlines from words.   node tools/god-rules-test.mjs
import { createGod, parseDecree, parseWhen, vote, needsOf, prophecyOf, RULES } from '../packages/god/god-core.js';
let n = 0, fails = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) fails++; console.log(cond ? 'ok  ' : 'FAIL', name, info && !cond ? '- ' + info : ''); };
let T = 8 * 60; const now = () => T;
// the exact numbers first (no diminishing returns, no headroom, no drift); the balance after
const EXACT = { diminish: 0, headroom: 0, drift: 0, restFollow: 0 };
const G = createGod({ now, rules: EXACT });
for (const [id, b] of Object.entries({ ada: 80, wren: 65, tilly: 55, bram: 30, finn: 20 })) G.set(id, b);

// sides with a gap
let conv = G.classify();
ok('sides: faithful at 60+, doubters at 35-, between keeps none', G.side('ada') === 'faithful' && G.side('wren') === 'faithful' && G.side('tilly') === null && G.side('bram') === 'doubters' && G.side('finn') === 'doubters' && conv.length === 4, JSON.stringify(conv));
G.set('wren', 50); ok('between the marks a villager keeps its side', G.classify().length === 0 && G.side('wren') === 'faithful');
G.set('bram', 62); conv = G.classify(); ok('a doubter above 60 converts to the faithful', conv.some(c => c.id === 'bram' && c.from === 'doubters' && c.to === 'faithful'));
G.set('bram', 30); G.classify(); G.set('wren', 65);
ok('average belief of a group', Math.abs(G.average(['ada', 'wren']) - 72.5) < .01);
ok('mana an hour: the sum of belief / 100, times manaPerBelief', Math.abs(G.manaPerHour() - (80 + 65 + 55 + 30 + 20) / 100 * RULES.manaPerBelief) < .01);
ok('offering value: bread 2 each, unknown 1', G.offeringValue('bread', 3) === 6 && G.offeringValue('pebble', 2) === 2);

// needs and prayers
ok('needs: raiders first, then sickness, then hunger', needsOf({ raiders: 2, sick: true, hunger: .8 }).map(x => x.need).join() === 'safety,heal,food');
ok('needs: a doubter with nothing wrong asks for a sign', needsOf({ side: 'doubters' })[0].need === 'sign');
const p1 = G.maybePray('wren', { hunger: .9, k: 10 }, () => 0);
ok('a hungry villager prays for food', p1?.need === 'food');
const P1 = G.addPrayer({ who: 'wren', need: 'food', text: 'Bread, please.' });
ok('one open prayer each', G.maybePray('wren', { hunger: .9, k: 10 }, () => 0) === null);
let r = G.onPower('heal', { who: 'wren', near: [] }, {});
ok('a power that does not fit the need does not answer it', !r.answered.length && G.get(P1.id).status === 'open');
const b0 = G.belief('wren'), a0 = G.belief('ada');
r = G.onPower('gift_food', { who: 'wren', near: ['tilly'] }, {});
ok('a gift of food on the one who prayed answers it: +15, +4 to a witness, +2 to its side', r.answered.length === 1 && G.belief('wren') === b0 + RULES.answered && G.belief('ada') === a0 + RULES.answeredSide && G.get(P1.id).status === 'answered', JSON.stringify(r.changes));
const P2 = G.addPrayer({ who: 'tilly', need: 'rain' }), t0 = G.belief('tilly');
r = G.onPower('rain', { x: 0, z: 0, near: [] }, {});
ok('rain anywhere answers a prayer for rain', r.answered.some(p => p.id === P2.id) && G.belief('tilly') === t0 + RULES.answered);
const P3 = G.addPrayer({ who: 'finn', need: 'heal' }), f0 = G.belief('finn');
G.answer(P3.id, { how: 'silence' });
ok('silence chosen: -3', G.belief('finn') === f0 + RULES.silence && G.get(P3.id).status === 'silence');
const P4 = G.addPrayer({ who: 'bram', need: 'safety' }), br0 = G.belief('bram');
G.answer(P4.id, { how: 'dream' });
ok('a dream to a doubter: +8', G.belief('bram') === br0 + RULES.dreamDoubter);
T += 30; const P5 = G.addPrayer({ who: 'tilly', need: 'heal' }), t1 = G.belief('tilly');
T += RULES.prayerWindow + 1; let k = G.tick();
ok('a prayer left until it lapses is ignored: -6', k.expired.some(p => p.id === P5.id) && G.belief('tilly') === t1 + RULES.ignored);
ok('prayers have a cooldown', G.maybePray('ada', { hunger: .9, k: 10 }, () => 0) !== null && (G.addPrayer({ who: 'ada', need: 'food' }), G.maybePray('ada', { hunger: .9, k: 10 }, () => 0)) === null);

// harm
let before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
r = G.onPower('plague', { who: 'tilly', members: ['tilly', 'finn'] }, { household: ['tilly', 'finn'] });
ok('plague for nothing is cruel: the victims -15, everyone else -5', r.cruel && G.belief('tilly') === before.tilly + RULES.cruelVictim && G.belief('ada') === before.ada + RULES.cruelAll, JSON.stringify(r.changes.map(c => c.id + c.d)));
before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
r = G.onPower('smite', { who: 'bram' }, { justified: true });
ok('smiting one who refused is justified: the faithful +3, the rest +4 from fear', !r.cruel && G.belief('ada') === before.ada + RULES.justFaithful && G.belief('bram') === before.bram + RULES.justFear);
const P6 = G.addPrayer({ who: 'wren', need: 'safety' }); before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
r = G.onPower('smite', { who: 'wolf1', threat: true, near: ['wren', 'ada'] }, {});
ok('a beast struck down answers a prayer for safety, those near +6', !r.cruel && r.answered.some(p => p.id === P6.id) && G.belief('ada') >= Math.min(100, before.ada + RULES.threatSmitten));

// omens and prophecies
ok('prophecy words', prophecyOf('a great storm will come') === 'storm' && prophecyOf('the crops will rot') === 'blight' && prophecyOf('rain will fall on the fields') === 'rain' && prophecyOf('behold') === null);
let o = G.omen('rain will come to the fields');
ok('an omen with words is a prophecy', o.omen.prophecy === 'rain' && o.omen.status === 'open');
before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
r = G.onPower('rain', { x: 0, z: 0 }, {});
ok('the prophecy kept: everyone +8', r.prophecy?.id === o.omen.id && G.belief('finn') === before.finn + RULES.prophecyKept);
o = G.omen('a plague will come'); before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
T += RULES.prophecyWindow + 1; k = G.tick();
ok('a prophecy not kept in time: everyone -6', k.broken.some(x => x.id === o.omen.id) && G.belief('finn') === before.finn + RULES.prophecyBroken);

// demands
before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
G.demandMet(['ada', 'wren'], G.ids(), 'q1');
ok('a demand met: those bound +6, the rest +2, a reward owed', G.belief('wren') === before.wren + RULES.demandMet && G.belief('finn') === before.finn + RULES.demandMetOthers && G.owed().length === 1);
before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
G.onPower('bless_field', { who: null, near: ['wren'] }, {});
ok('a blessing near one who met it pays the reward: +4 to those bound', G.belief('ada') === Math.min(100, before.ada + RULES.rewarded) && G.owed()[0].paid);
G.demandMet(['tilly'], G.ids(), 'q2'); const t2 = G.belief('tilly'); T += RULES.rewardWindow + 1; k = G.tick();
ok('no reward in time: -3', k.unrewarded.length === 1 && G.belief('tilly') === t2 + RULES.unrewarded);
before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
G.demandMissed(['bram', 'finn'], G.ids(), 'storm', ['finn']);
ok('a missed demand punished: the faithful +2, the rest +4 (fear)', G.belief('ada') === Math.min(100, before.ada + RULES.angerFaithful) && G.belief('finn') === before.finn + RULES.angerFear);
before = Object.fromEntries(G.ids().map(id => [id, G.belief(id)]));
G.demandMissed(['bram', 'finn'], G.ids(), 'none', ['finn']);
ok('a missed demand let go: doubters and refusers -6', G.belief('finn') === before.finn + RULES.mercyDoubters);

// the council
let v = vote([{ id: 'ada', belief: 90, side: 'faithful' }, { id: 'wren', belief: 70, side: 'faithful' }, { id: 'bram', belief: 25, side: 'doubters' }]);
ok('council: two faithful against one doubter accept', v.outcome === 'accept' && v.yes === 2 && v.no === 1);
v = vote([{ id: 'ada', belief: 90, side: 'faithful' }, { id: 'bram', belief: 25, side: 'doubters' }, { id: 'finn', belief: 20, side: 'doubters' }]);
ok('council: two doubters against one refuse', v.outcome === 'refuse');
v = vote([{ id: 'ada', belief: 90, side: 'faithful' }, { id: 'bram', belief: 25, side: 'doubters' }, { id: 'finn', belief: 20, side: 'doubters', stance: 'bargain' }]);
ok('council: a bargain in the middle', v.outcome === 'bargain', JSON.stringify(v));
v = vote([{ id: 'bram', belief: 25, side: 'doubters', stance: 'yes' }, { id: 'finn', belief: 20, side: 'doubters', stance: 'yes' }]);
ok('council: their own words (stance) win over belief', v.outcome === 'accept');

// decrees and deadlines
const ctx = { now: 1440 + 9 * 60, items: ['bread', 'wheat'], animals: ['sheep', 'pig'], groups: { faithful: { name: 'the faithful' }, doubters: { name: 'the doubters' } }, people: ['bram'], shrine: 'temple' };
let d = parseDecree('I require a goat sacrifice by the full moon', ctx);
ok('a goat sacrifice: a sheep (no goats here), by the full moon (21:00 of a third day)', d.kind === 'sacrifice' && d.animal === 'sheep' && /no goat/.test(d.text) && d.by % 1440 === 21 * 60 && Math.floor(d.by / 1440 + 1) % 3 === 0, JSON.stringify(d));
d = parseDecree('the faithful must bring three bread to the temple by evening', ctx);
ok('an offering: 3 bread, of the faithful, by 18:00', d.kind === 'offering' && d.item === 'bread' && d.n === 3 && d.of?.group === 'faithful' && d.by === 1440 + 18 * 60, JSON.stringify(d));
d = parseDecree('everyone shall gather and pray at dawn', ctx);
ok('worship: everyone, by dawn tomorrow', d.kind === 'worship' && d.of === 'all' && d.by === 2 * 1440 + 6 * 60, JSON.stringify(d));
d = parseDecree('build a wall around the temple in 2 days', ctx);
ok('work: the plan words for the plan language', d.kind === 'work' && /wall around the temple/.test(d.plan) && d.by === ctx.now + 2880, JSON.stringify(d));
d = parseDecree('the doubters owe me a tribute of 2 wheat', ctx);
ok('a tribute of the doubters, no deadline given: a day', d.kind === 'offering' && d.item === 'wheat' && d.n === 2 && d.of?.group === 'doubters' && d.by === ctx.now + 1440, JSON.stringify(d));
ok('nonsense is an error', !!parseDecree('purple', ctx).error);
ok('deadlines: in 3 hours, noon, tomorrow', parseWhen('in 3 hours', 600) === 780 && parseWhen('by noon', 600) === 720 && parseWhen('by noon', 800) === 1440 + 720 && parseWhen('by tomorrow', 600) === 1440 + 1080);

// save
const G2 = createGod({ now, rules: EXACT }); G2.load(G.data());
ok('saved and loaded', G2.belief('finn') === G.belief('finn') && G2.side('ada') === 'faithful' && G2.prayers().length === G.prayers().length);

// dreams: one bonus a dream, whether or not it answers a prayer
{ const D = createGod({ now, rules: EXACT }); D.set('a', 50); D.set('b', 50); D.addPrayer({ who: 'a', need: 'sign' });
  const r = D.onPower('dream', { who: 'a', members: ['a'] }, {}); D.onPower('dream', { who: 'b', members: ['b'] }, {});
  ok('a dream answers the dreamer\'s prayer with one dream bonus (no prayer: the same bonus)', r.answered.length === 1 && D.belief('a') === 50 + RULES.dream && D.belief('b') === 50 + RULES.dream, D.belief('a') + ' ' + D.belief('b')); }

// the balance (RULES as they are)
{ let t = 0; const H = createGod({ now: () => t });
  H.set('a', 50); const g1 = H.adjust('a', 8).d, g2 = H.adjust('a', 8).d, g3 = H.adjust('a', 8).d;
  ok('diminishing returns: each gain to the same villager smaller than the last', g1 === 8 && g2 < g1 && g3 < g2, [g1, g2, g3].join());
  t += RULES.diminishWindow + 1; ok('a day later a gain is whole again', H.adjust('a', 4).d === 4);
  H.set('z', 90); ok('near 100 a gain shrinks (headroom)', H.adjust('z', 9).d < 4);
  H.set('y', 10); ok('near 0 a loss shrinks', H.adjust('y', -9).d > -4);
  const S = createGod({ now: () => t }); S.set('d', 25); S.tick(); S.set('d', 65); const r0 = S.rest('d');
  for (let i = 0; i < 96; i++) { t += 15; S.tick(); }
  ok('belief drifts back toward the resting value over a day, and the resting value follows a little', S.belief('d') < 55 && S.belief('d') > 30 && S.rest('d') > r0, `${S.belief('d')} rest ${S.rest('d')}`);
  const mod = await import('./god-balance-sim.mjs');
  const runs = [1, 2, 3, 4, 5].map(seed => mod.simulate({}, { seed }));
  ok('simulation: no one reaches 100 in five game days of typical play', runs.every(r => !r.at100.length), runs.map(r => r.at100.join()).join('|'));
  ok('simulation: the doubters stay doubters on day 1', runs.every(r => r.curve.filter(c => c.h <= 24).every(c => c.bram < 60 && c.finn < 60)));
  ok('simulation: mana does not pile up to its cap', runs.every(r => r.mana < 120), runs.map(r => r.mana).join());
  const old = mod.simulate(mod.OLD, { seed: 1 }); ok('simulation: the old rules did put someone at 100 (the problem this fixes)', old.at100.length > 0); }

console.log(fails ? `${fails}/${n} FAILED` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
