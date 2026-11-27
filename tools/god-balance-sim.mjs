// god-balance-sim.mjs: a few game days of the God game in Node (packages/god/god-core.js) with a
// scripted "typical player", to tune RULES: belief should move over days, mana should make the
// player choose. Prints each villager's belief every 6 game hours, the conversions, mana spent and
// the prayers the player could not afford.
//   node tools/god-balance-sim.mjs            the current RULES (and the old ones for comparison)
//   node tools/god-balance-sim.mjs --seeds=20 a summary over 20 seeds
//   --answers=.9  a devoted player (answers 90% with a power)
// The player: looks at the prayers every game hour; answers a prayer with the fitting power 55% of
// the time (when it has the mana), a dream 15%, silence 10%, else lets it lapse. Day 2: an omen
// ("rain will come") kept by rain at noon, a decree (3 bread by evening) and a blessing as its
// reward; day 3: lightning on a refuser (else on the least devout: cruel); day 4: beasts, smitten.
import { createGod, RULES, vote, FITS } from '../packages/god/god-core.js';

// the rules before the 2026-11-27 tuning (no diminishing returns, no drift to rest)
export const OLD = { faithfulAt: 60, doubterAt: 35, answered: 15, answeredWitness: 4, answeredSide: 2, dream: 5, dreamDoubter: 8, silence: -3, ignored: -6,
  cruelVictim: -15, cruelHousehold: -10, cruelAll: -5, justFaithful: 3, justFear: 4, threatSmitten: 6, omenFaithful: 3, omenOthers: 1, prophecyKept: 8, prophecyBroken: -6,
  demandMet: 6, demandMetOthers: 2, rewarded: 4, unrewarded: -3, angerFaithful: 2, angerFear: 4, mercyDoubters: -6, mercyFaithful: 1, refused: -4,
  prayerWindow: 180, rewardWindow: 360, prophecyWindow: 720, prayerCooldown: 150, manaPerBelief: 1, diminish: 0, headroom: 0, drift: 0, restFollow: 0 };
const COST = { rain: 6, drought: 10, storm: 8, fog: 4, bless_field: 5, bless_herd: 6, heal: 4, gift_food: 3, smite: 8, plague: 14, blight: 10, beast: 12, dream: 2, omen: 6 };
const START = { ada: 90, wren: 68, tilly: 62, bram: 30, finn: 22 };
const HOUSE = { wren: ['wren', 'bram'], bram: ['wren', 'bram'], tilly: ['tilly', 'finn'], finn: ['tilly', 'finn'], ada: ['ada'] };
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

export function simulate(rules = {}, { seed = 1, days = 5, manaStart = 30, manaMax = 150, cost = COST, answers = .55 } = {}) {
  const rand = mulberry(seed);
  let T = 7 * 60 + 30; const now = () => T;
  const G = createGod({ now, rules });
  const R = G.rules;
  for (const [id, b] of Object.entries(START)) G.set(id, b);
  G.classify();
  const ids = Object.keys(START);
  let mana = manaStart, spent = 0, earned = 0, broke = 0, answeredN = 0, lapsedN = 0, prayersN = 0;
  const hunger = Object.fromEntries(ids.map(id => [id, .1])), sick = {}, thanks = {};
  let drought = 0, raiders = 0, decree = null;
  const curve = [], events = [];
  const pay = c => { if (mana < c) { broke++; return false; } mana -= c; spent += c; return true; };
  const near = id => ids.filter(x => x !== id && rand() < .4);
  const log = (what) => events.push(`d${Math.floor(T / 1440) + 1} ${String(Math.floor(T % 1440 / 60)).padStart(2, '0')}:${String(T % 60).padStart(2, '0')} ${what}`);
  const conv = () => { for (const c of G.classify()) if (c.from) log(`${c.id} -> ${c.to} (${G.belief(c.id)})`); };
  const end = (days * 1440) + 7 * 60 + 30;
  for (; T < end; T += 15) {
    const h = Math.floor(T % 1440 / 60), m = T % 60, day = Math.floor(T / 1440);
    // the world: meals, a dry spell on day 1, sickness on day 3, beasts on day 4
    for (const id of ids) { hunger[id] = Math.min(1, hunger[id] + .01); if (m === 0 && [7, 12, 19].includes(h) && rand() < .85) hunger[id] = .1; }
    if (day === 0 && h === 14 && m === 0) { drought = T + 720; log('a dry spell'); }
    if (day === 2 && h === 8 && m === 0) { sick.tilly = T + 2160; log('tilly falls sick'); }
    if (day === 3 && h === 6 && m === 0) { raiders = T + 120; log('beasts at the edge of the village'); }
    // mana: an hour from belief
    const inc = G.manaPerHour(ids) / 4; mana = Math.min(manaMax, mana + inc); earned += inc;
    // prayers (at most four waiting)
    for (const id of ids) {
      if (G.open().length >= 4) break;
      const f = { hunger: hunger[id], sick: sick[id] > T, drought: drought > T, raiders: raiders > T ? 2 : 0, thanks: thanks[id] && T - thanks[id] < 240, plagueNear: HOUSE[id].some(x => x !== id && sick[x] > T), demand: decree && decree.status === 'open', k: .22 };
      const w = G.maybePray(id, f, rand);
      if (w) { G.addPrayer({ who: id, need: w.need }); prayersN++; if (G.belief(id) >= 60 && rand() < .5) { mana = Math.min(manaMax, mana + 2); earned += 2; } }
    }
    // the player, every game hour
    if (m === 0) for (const p of G.open()) {
      const r = rand();
      if (r < answers) {
        const pw = (FITS[p.need] || []).filter(n => n !== 'dream' && n !== 'omen')[0] || null;
        if (p.need === 'sign') { if (pay(cost.dream)) G.onPower('dream', { who: p.who, members: [p.who] }, { everyone: ids }); }
        else if (pw && pay(cost[pw])) { const res = G.onPower(pw, { who: p.who, members: [p.who], near: near(p.who), threat: pw === 'smite' && raiders > T }, { everyone: ids }); answeredN += res.answered.length; for (const a of res.answered) thanks[a.who] = T; if (pw === 'heal') delete sick[p.who]; if (pw === 'rain') drought = 0; }
      } else if (r < answers + .15 * (1 - answers) / .45) { if (pay(cost.dream)) G.onPower('dream', { who: p.who, members: [p.who] }, { everyone: ids }); }
      else if (r < answers + .25 * (1 - answers) / .45) G.answer(p.id, { how: 'silence' });
    }
    // day 2: an omen kept, a decree and its reward
    if (day === 1 && h === 8 && m === 0 && pay(cost.omen)) { G.omen('rain will come to the fields'); log('omen: rain will come'); }
    if (day === 1 && h === 12 && m === 0 && pay(cost.rain)) { const r = G.onPower('rain', { x: 0, z: 0, near: ['tilly'] }, { everyone: ids }); drought = 0; if (r.prophecy) log('the prophecy kept'); }
    if (day === 1 && h === 10 && m === 0) {
      const v = vote(ids.filter(id => id !== 'ada').map(id => ({ id, belief: G.belief(id), side: G.side(id) })).concat([{ id: 'ada', belief: 90, side: 'faithful', stance: 'yes' }]));
      const refusers = v.votes.filter(x => x.vote === 'no' && (v.outcome === 'refuse' || G.belief(x.id) < 25)).map(x => x.id);
      G.many(refusers, R.refused, 'refused');
      decree = { status: 'open', refusers, members: ids, by: T + 8 * 60 }; log(`decree: council ${v.outcome}, refusers ${refusers.join(',') || 'none'}`);
    }
    if (decree?.status === 'open' && day === 1 && h === 16 && m === 0) { decree.status = 'met'; G.demandMet(ids.filter(id => !decree.refusers.includes(id)), ids, 'd1'); mana = Math.min(manaMax, mana + 11); earned += 11; log('decree met (+11 mana)'); }
    if (day === 1 && h === 18 && m === 0 && pay(cost.bless_field)) G.onPower('bless_field', { near: ['tilly', 'wren'] }, { everyone: ids });
    // day 3: a punishment
    if (day === 2 && h === 9 && m === 0) {
      const target = decree?.refusers?.[0] || ids.slice().sort((a, b) => G.belief(a) - G.belief(b))[0];
      if (pay(cost.smite)) { const r = G.onPower('smite', { who: target, members: [target] }, { justified: !!decree?.refusers?.includes(target), household: HOUSE[target], everyone: ids }); log(`smite ${target}${r.cruel ? ' (cruel)' : ' (justified)'}`); }
    }
    const k = G.tick(); lapsedN += k.expired.length;
    conv();
    if (m === 0) curve.push({ T, h: Math.round((T - 450) / 60 * 10) / 10, at: `d${day + 1} ${String(h).padStart(2, '0')}:00`, hour: h, mana: Math.round(mana), ...Object.fromEntries(ids.map(id => [id, G.belief(id)])) });
  }
  const at100 = ids.filter(id => curve.some(c => c[id] >= 99.9));
  const first100 = curve.find(c => ids.some(id => c[id] >= 99.9));
  return { curve, events, mana: Math.round(mana), spent, earned: Math.round(earned), broke, answeredN, lapsedN, prayersN, at100, first100h: first100 ? first100.h : null,
    final: Object.fromEntries(ids.map(id => [id, G.belief(id)])), sides: Object.fromEntries(ids.map(id => [id, G.side(id)])) };
}

function table(r, every = 6) {
  const ids = Object.keys(START);
  const rows = r.curve.filter(c => c.hour % every === 0);
  console.log('  game time ' + ids.map(id => id.padStart(6)).join('') + '  mana');
  for (const c of rows) console.log(`  ${c.at}  ` + ids.map(id => String(Math.round(c[id])).padStart(6)).join('') + String(c.mana).padStart(6));
}
const summary = r => `prayers ${r.prayersN}, answered ${r.answeredN}, lapsed ${r.lapsedN}; mana earned ${r.earned}, spent ${r.spent}, left ${r.mana}, could not afford ${r.broke}; at 100: ${r.at100.join(',') || 'none'}${r.first100h != null ? ' (first after ' + r.first100h + ' game h)' : ''}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
  const seeds = +(arg('seeds') || 0), days = +(arg('days') || 5), answers = +(arg('answers') || .55);
  if (seeds) {
    for (const [name, rules] of [['old', OLD], ['now', {}]]) {
      const rs = Array.from({ length: seeds }, (_, i) => simulate(rules, { seed: i + 1, days, answers }));
      const avg = f => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
      console.log(`${name}: runs with someone at 100 ${rs.filter(r => r.at100.length).length}/${seeds}; final mean ${Object.keys(START).map(id => id + ' ' + avg(r => r.final[id])).join(', ')}; could not afford ${avg(r => r.broke)}; lowest mana ${avg(r => Math.min(...r.curve.map(c => c.mana)))}; mana left ${avg(r => r.mana)}; answered ${avg(r => r.answeredN)} of ${avg(r => r.prayersN)}`);
    }
  } else {
    for (const [name, rules] of [['OLD RULES', OLD], ['RULES NOW', {}]]) {
      const r = simulate(rules, { seed: +(arg('seed') || 3), days, answers });
      console.log(`\n${name}: ${summary(r)}`); table(r); console.log('  ' + r.events.join('\n  '));
    }
  }
}
