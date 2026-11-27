// god-core.js: the God game's rules with no game in them (belief, mana, prayers,
// omens and prophecies, decrees, the council's vote, conversion between groups).
// god.js wires them into the game; tools/god-rules-test.mjs runs them in Node.
//
//   const G = createGod({ now: () => gameMinutes, rules: { ... } })
//   belief:   G.belief(id), G.set(id, v), G.adjust(id, delta, why) -> change, G.average(ids), G.ids()
//   groups:   G.side(id) -> 'faithful' | 'doubters' | null; G.classify() -> [{ id, from, to }] (thresholds with a gap)
//   mana:     G.manaPerHour(ids) (each villager's belief / 100 * rules.manaPerBelief), offeringValue(item, n)
//   prayers:  needsOf(facts) -> [{ need, weight }]; G.maybePray(id, facts, rand) -> prayer | null; G.addPrayer({ who, need, text })
//             G.open(); G.answer(id, { how: 'power' | 'dream' | 'silence', power }) -> { prayer, changes }
//   powers:   G.onPower(name, { who, group, members, near, threat }, { justified }) -> { answered, changes, cruel, prophecy }
//   omens:    G.omen(text) -> { id, prophecy: power | null }  (a prophecy kept when that power is used in time)
//   demands:  G.demandMet(members, everyone, id) / G.demandMissed(members, everyone, anger, refusers); rewards owed after a met demand
//   council:  vote(voters) -> { yes, no, outcome: 'accept' | 'bargain' | 'refuse', votes }
//   decrees:  parseDecree(text, ctx) -> { kind, text, of, by, item, n, animal, plan } | { error }; parseWhen(text, now)
//   time:     G.tick() -> { expired, changes, broken, unrewarded }  (call it every game quarter hour; belief drifts to G.rest(id))
//   balance:  gains shrink with the villager's recent gains (rules.diminish) and near 0 / 100 (rules.headroom); tools/god-balance-sim.mjs
//   save:     G.data() / G.load(x)
export const RULES = {
  // tuned 2026-11-27 with tools/god-balance-sim.mjs (a scripted player over five game days): belief moves
  // over days, not minutes; mana runs short when the player answers everything
  faithfulAt: 60, doubterAt: 35,                       // belief (0-100) to join the faithful / fall to the doubters
  answered: 8, answeredWitness: 2, answeredSide: 1,    // a prayer answered with a fitting power: the one who prayed, those near, their side
  dream: 3, dreamDoubter: 5,                           // a dream: the dreamer (one bonus a dream, whether or not it answers a prayer)
  silence: -2, ignored: -4,                            // a prayer met with silence (chosen) / left until it lapsed
  cruelVictim: -15, cruelHousehold: -8, cruelAll: -4,  // harm with no reason (no refusal, no missed demand)
  justFaithful: 2, justFear: 3,                        // harm with a reason: the faithful approve, the rest are afraid (belief from fear)
  threatSmitten: 4,                                    // a beast or raider struck down: everyone near
  omenFaithful: 2, omenOthers: 1,                      // an omen for all
  prophecyKept: 5, prophecyBroken: -5,                 // an omen's words came true in time / did not
  demandMet: 5, demandMetOthers: 1,                    // a demand met: those it bound, everyone else
  rewarded: 3, unrewarded: -3,                         // a blessing on those who met it, within rewardWindow / none
  angerFaithful: 2, angerFear: 3,                      // a missed demand punished: the faithful, the rest (fear)
  mercyDoubters: -5, mercyFaithful: 1,                 // a missed demand let go: "nothing happened"
  refused: -3,                                         // voted against the decree at the council
  prayerWindow: 180, rewardWindow: 360, prophecyWindow: 720, prayerCooldown: 150,   // game minutes
  manaPerBelief: .25,                                   // mana an hour from a villager at belief 100
  // diminishing returns: a gain is divided by 1 + (the villager's gains in the last diminishWindow minutes) / diminish
  diminish: 10, diminishWindow: 1440,
  // near the ends: a gain is scaled by (100 - belief) / headroom when closer than that to 100 (a loss likewise near 0)
  headroom: 30,
  // drift: each game hour belief moves this share of the way back to the villager's resting value, and the
  // resting value this share of the way toward belief (what lasts: a conversion kept up for days sticks)
  drift: .02, restFollow: .006,
};
// what answers a need; what harms
export const FITS = {
  food: ['gift_food', 'bless_field', 'bless_herd'], heal: ['heal'], rain: ['rain', 'storm'], safety: ['smite', 'fog'],
  harvest: ['bless_field', 'rain'], sign: ['omen', 'dream'], thanks: [], strength: ['dream', 'gift_food', 'heal'],
};
export const HARMFUL = new Set(['smite', 'plague', 'blight', 'beast', 'drought']);
export const BLESSINGS = new Set(['rain', 'bless_field', 'bless_herd', 'heal', 'gift_food', 'dream']);
export const OFFERING = { bread: 2, wheat: 1, apple: 1, fish: 2, meat: 3, ale: 2, cheese: 2, milk: 1, wool: 1, honey: 3, wine: 3, gold: 1, candle: 1, flowers: 1 };
// a prophecy's words -> the power that fulfils it
const PROPHECY = [
  [/\b(drought|dry|parch|thirst|no rain)\w*/, 'drought'], [/\b(storm|thunder|tempest|gale)\w*/, 'storm'], [/\b(rain|flood|shower|water)\w*/, 'rain'],
  [/\bfog|mist\w*/, 'fog'], [/\b(blight|rot|wither|famine)\w*/, 'blight'], [/\b(plague|sick|disease|pestilence|fever)\w*/, 'plague'],
  [/\b(beast|wolf|wolves|monster)\w*/, 'beast'], [/\b(harvest|bounty|plenty|grow|crops?)\b/, 'bless_field'], [/\b(lamb|herd|flock|calf)\w*/, 'bless_herd'],
  [/\b(heal|cure|mend)\w*/, 'heal'], [/\b(bread|food|feast|hunger)\w*/, 'gift_food'], [/\b(lightning|strike|smite|bolt)\w*/, 'smite'],
];
export function prophecyOf(text) { const t = String(text || '').toLowerCase(); for (const [re, p] of PROPHECY) if (re.test(t)) return p; return null; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- needs: what a villager would pray for
// facts: { hunger 0-1, sick, hurt (0-1 of hp lost), blight, drought, raiders, storm, plagueNear, thanks, side }
export function needsOf(f = {}) {
  const out = [];
  if (f.raiders) out.push({ need: 'safety', weight: .9 });
  if (f.sick) out.push({ need: 'heal', weight: .8 });
  else if ((f.hurt || 0) > .35) out.push({ need: 'heal', weight: .5 + f.hurt * .3 });
  if ((f.hunger || 0) > .55) out.push({ need: 'food', weight: .4 + f.hunger * .4 });
  if (f.drought) out.push({ need: 'rain', weight: .6 });
  if (f.blight) out.push({ need: 'harvest', weight: .55 });
  if (f.plagueNear && !f.sick) out.push({ need: 'heal', weight: .35 });
  if (f.demand) out.push({ need: 'strength', weight: .25 });
  if (f.thanks) out.push({ need: 'thanks', weight: .3 });
  if (f.side === 'doubters' && !out.length) out.push({ need: 'sign', weight: .12 });
  if (!out.length) out.push({ need: 'thanks', weight: .06 });
  return out.sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------- the council: who votes for a decree
// voters: [{ id, belief, side, stance: 'yes' | 'no' | 'bargain' | null (their own words, above rails), fear }]
export function vote(voters = []) {
  const votes = voters.map(v => {
    let s = v.stance;
    if (!s) s = v.belief >= 55 || (v.side === 'faithful' && v.belief >= 45) ? 'yes' : v.belief <= 30 && !v.fear ? 'no' : v.belief >= 42 ? 'yes' : v.side === 'doubters' ? 'no' : 'bargain';
    return { id: v.id, vote: s };
  });
  const yes = votes.filter(v => v.vote === 'yes').length, no = votes.filter(v => v.vote === 'no').length, bargain = votes.filter(v => v.vote === 'bargain').length;
  const outcome = no > yes + bargain ? 'refuse' : yes > no + bargain ? 'accept' : 'bargain';
  return { yes, no, bargain, outcome, votes };
}

// ---------------------------------------------------------------- decrees: the player's words -> a demand's parts
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12 };
const ANIMALS = /\b(goats?|kids?|sheep|lambs?|rams?|ewes?|pigs?|swine|hogs?|cows?|calf|calves|oxen|ox|bulls?|chickens?|hens?|doves?|horses?)\b/;
const ANIMAL_KIND = w => /goat|kid|sheep|lamb|ram|ewe/.test(w) ? 'sheep' : /pig|swine|hog/.test(w) ? 'pig' : /cow|calf|calves|ox|bull/.test(w) ? 'cow' : /horse/.test(w) ? 'horse' : /chicken|hen|dove/.test(w) ? 'chicken' : w;
// a deadline in words -> a game minute (now: game minutes since day 1, 00:00); full moon: 21:00 of every third day
export function parseWhen(text, now) {
  const t = String(text || '').toLowerCase(), day = Math.floor(now / 1440), min = now - day * 1440;
  const at = (d, h) => d * 1440 + h * 60;
  const next = h => min < h * 60 - 30 ? at(day, h) : at(day + 1, h);
  let m;
  if ((m = t.match(/\bin\s+(\d+|a|an|one|two|three|four|five|six)\s+(hours?|days?)\b/))) { const n = +m[1] || NUMW[m[1]] || 1; return now + n * (/day/.test(m[2]) ? 1440 : 60); }
  if (/\bfull moon\b/.test(t)) { let d = day; while ((d + 1) % 3 !== 0 || at(d, 21) - now < 360) d++; return at(d, 21); }
  if (/\b(tonight|nightfall|by night|sundown|sunset|dusk)\b/.test(t)) return next(/dusk|sunset|sundown/.test(t) ? 18 : 20);
  if (/\b(evening)\b/.test(t)) return next(18);
  if (/\b(noon|midday)\b/.test(t)) return next(12);
  if (/\b(dawn|sunrise|first light)\b/.test(t)) return next(6);
  if (/\b(morning)\b/.test(t)) return next(8);
  if (/\b(tomorrow)\b/.test(t)) return at(day + 1, 18);
  if (/\b(week)\b/.test(t)) return now + 7 * 1440;
  if (/\b(today|this day)\b/.test(t)) return next(20);
  return null;
}
// ctx: { now, items: [names], animals: [kinds present], groups: { id: { name } }, people: [ids], shrine: place id }
export function parseDecree(text, ctx = {}) {
  const raw = String(text || '').trim(), t = raw.toLowerCase().replace(/[’']/g, "'");
  if (!t) return { error: 'say what you require' };
  const now = +ctx.now || 0, shrine = ctx.shrine || 'temple';
  const by = parseWhen(t, now) ?? now + 1440;
  // of whom: a group by id or name, a person, else everyone
  let of = 'all';
  for (const [id, g] of Object.entries(ctx.groups || {})) { const names = [id, String(g.name || '').replace(/^the\s+/i, ''), id.replace(/_/g, ' ')].map(s => s.toLowerCase()).filter(Boolean); if (names.some(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))) { of = { group: id }; break; } }
  if (of === 'all') { const p = (ctx.people || []).find(id => new RegExp(`\\b${String(id).toLowerCase()}\\b`).test(t)); if (p && /\b(you|from|of)\b/.test(t)) of = { id: p }; }
  // the number closest before the item ("a tribute of three bread": 3)
  const nOf = s => { const m = [...s.matchAll(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|dozen)\b/g)].pop(); return m ? (+m[1] || NUMW[m[1]] || 1) : 1; };
  // a sacrifice of an animal
  let m = t.match(ANIMALS);
  if (m && /\b(sacrific\w*|slaughter|offer\w*|bring|give|blood|altar|lead)\b/.test(t)) {
    const want = ANIMAL_KIND(m[1]), have = ctx.animals || [];
    const kind = have.includes(want) ? want : have.find(k => ['sheep', 'pig', 'cow', 'chicken'].includes(k)) || want;
    const asked = /goat|kid/.test(m[1]) ? 'goat' : m[1].replace(/s$/, '');
    const note = kind !== want || asked === 'goat' ? ` (there is no ${asked} here)` : '';
    return { kind: 'sacrifice', animal: kind, n: 1, of, by, text: `Lead a ${kind} to the ${shrine} as a sacrifice${note}.` };
  }
  // work: build, raise, dig, clear, a wall, a fence, a statue (the plan language reads the rest)
  if (/\b(build|raise|erect|dig|clear|wall|fence|statue|tower|stockpile|farm)\b/.test(t) && !/\b(bring|offer)\b/.test(t)) {
    const plan = raw.replace(/^(i (?:require|demand|want|command)|you (?:must|shall)|let them|they (?:must|shall))\s+/i, '').replace(/\s+(by|before|within|in)\s+(.*)$/i, (m, w, rest) => parseWhen(w + ' ' + rest, now) != null || /\b(days?|hours?|moon|dawn|dusk|noon|evening|morning|tomorrow|tonight|week)\b/i.test(rest) ? '' : m);
    return { kind: 'work', plan, of, by, text: `${plan.replace(/^\w/, c => c.toUpperCase()).replace(/\.$/, '')}.` };
  }
  // worship: gather, pray, kneel, sing at the shrine
  if (/\b(pray|prayers?|worship|kneel|gather|sing|hymn|praise|vigil|bow)\b/.test(t) && !/\b(bring|offer\w*|sacrific\w*)\b.*\b(bread|wheat|apple|fish|meat|ale)\b/.test(t)) {
    return { kind: 'worship', of, by, n: 0, text: `Come to the ${shrine} and pray.` };
  }
  // an offering of an item
  const items = [...new Set([...(ctx.items || []), ...Object.keys(OFFERING)])];
  const item = items.find(i => new RegExp(`\\b${String(i).toLowerCase().replace(/s$/, '')}s?\\b`).test(t));
  if (item || /\b(offer\w*|tribute|tithe|gift|bring|sacrific\w*)\b/.test(t)) {
    const it = item || (/\b(gold|coin|tithe)\b/.test(t) ? 'gold' : 'bread'), n = item ? nOf(t.slice(0, t.indexOf(String(it).toLowerCase().replace(/s$/, '')) + 1).split(/\b(?:by|before)\b/)[0]) : 2;
    return { kind: 'offering', item: it, n: Math.min(12, n), of, by, text: `Bring ${n} ${it} to the ${shrine} as an offering.` };
  }
  return { error: 'I could not tell what you require: an offering ("bring 3 bread"), a sacrifice ("a sheep"), prayer ("come and pray") or work ("build a wall around the temple")' };
}

// ---------------------------------------------------------------- the state
export function createGod({ now = () => 0, rules = {} } = {}) {
  const R = { ...RULES, ...rules };
  let B = {}, side = {}, prayers = [], omens = [], owed = [], seq = 0, lastPray = {}, log = [], rest = {}, gains = {}, lastTick = null;
  const ids = () => Object.keys(B);
  const belief = id => B[id] ?? 50;
  const set = (id, v) => { B[id] = clamp(Math.round(+v * 10) / 10, 0, 100); if (rest[id] == null) rest[id] = B[id]; return B[id]; };
  // what a change comes to: less for a villager who gained much lately (diminish), less near the ends (headroom)
  function scaled(id, d) {
    const b = belief(id);
    if (d > 0) {
      const t = now(), g = (gains[id] || []).filter(x => t - x.at < R.diminishWindow); gains[id] = g;
      if (R.diminish) d /= 1 + g.reduce((a, x) => a + x.d, 0) / R.diminish;
      if (R.headroom) d *= clamp((100 - b) / R.headroom, 0, 1);
    } else if (R.headroom) d *= clamp(b / R.headroom, 0, 1);
    return d;
  }
  function adjust(id, d, why = '') { if (!id || !d) return null; d = scaled(id, d); const from = belief(id), to = set(id, from + d);
    if (to > from) (gains[id] ||= []).push({ at: now(), d: to - from }); const c = { id, from, to, d: Math.round((to - from) * 10) / 10, why }; log.push({ ...c, at: now() }); if (log.length > 200) log.shift(); return c; }
  const many = (list, d, why) => [...new Set(list)].map(id => adjust(id, d, why)).filter(Boolean);
  const average = list => { const l = (list || ids()).filter(id => id in B); return l.length ? l.reduce((a, id) => a + B[id], 0) / l.length : 0; };
  // sides with a gap: above faithfulAt joins the faithful, below doubterAt the doubters; between keeps its side
  function classify() {
    const out = [];
    for (const id of ids()) {
      const b = B[id], was = side[id] ?? null;
      const to = b >= R.faithfulAt ? 'faithful' : b <= R.doubterAt ? 'doubters' : was;
      if (to !== was) { side[id] = to; out.push({ id, from: was, to }); }
    }
    return out;
  }
  const sideOf = id => side[id] ?? null;
  const setSide = (id, s) => { side[id] = s; };
  const manaPerHour = list => (list || ids()).reduce((a, id) => a + belief(id) / 100, 0) * R.manaPerBelief;
  const offeringValue = (item, n = 1) => (OFFERING[String(item).toLowerCase().replace(/s$/, '')] ?? OFFERING[String(item).toLowerCase()] ?? 1) * n;

  // ---- prayers
  const open = () => prayers.filter(p => p.status === 'open');
  function addPrayer({ who, need, text = '', at = null, place = null }) {
    const p = { id: 'p' + (++seq), who, need, text: String(text), at: now(), until: now() + R.prayerWindow, status: 'open', place, x: at?.x, z: at?.z };
    prayers.push(p); lastPray[who] = now(); if (prayers.length > 80) prayers.splice(0, prayers.length - 80);
    return p;
  }
  // a villager prays when a need weighs on it: weight x belief (doubters pray only in need), once in a while
  function maybePray(id, facts = {}, rand = Math.random) {
    if (open().some(p => p.who === id)) return null;
    if (lastPray[id] != null && now() - lastPray[id] < R.prayerCooldown) return null;
    const n = needsOf({ ...facts, side: sideOf(id) })[0]; if (!n) return null;
    const b = belief(id) / 100, k = n.weight * (sideOf(id) === 'doubters' ? .35 + b * .5 : .5 + b * .7) * (facts.k ?? .25);
    if (rand() >= k) return null;
    return { who: id, need: n.need, weight: n.weight };
  }
  const fits = (p, power) => (FITS[p.need] || []).includes(power) || (p.need === 'thanks' && BLESSINGS.has(power));
  function answer(pid, { how = 'power', power = null } = {}) {
    const p = prayers.find(x => x.id === pid); if (!p || p.status !== 'open') return { prayer: p || null, changes: [] };
    let changes = [];
    if (how === 'silence') { p.status = 'silence'; if (p.need !== 'thanks') changes.push(adjust(p.who, R.silence, 'silence')); }
    else if (how === 'dream') { p.status = 'answered'; p.by = 'dream'; changes.push(adjust(p.who, sideOf(p.who) === 'doubters' ? R.dreamDoubter : R.dream, 'a dream')); }
    else { p.status = 'answered'; p.by = power; changes.push(adjust(p.who, R.answered, `${power} answered a prayer`)); }
    p.closed = now();
    return { prayer: p, changes: changes.filter(Boolean) };
  }

  // ---- powers: answered prayers, cruelty, prophecies, rewards
  // target: { who (id), group, members (ids hit), near (ids who saw it), threat (a raider or beast was the target) }
  // ctx: { justified (the target or its household refused a demand, or a demand was missed lately), everyone: [ids] }
  function onPower(name, target = {}, ctx = {}) {
    const changes = [], answered = [], everyone = ctx.everyone || ids();
    const hit = [...new Set([...(target.members || []), ...(target.who ? [target.who] : [])])];
    // a dream: its dreamer's prayer answered by a dream, else a dream's bonus (one either way)
    if (name === 'dream') {
      for (const id of hit) {
        const p = open().find(x => x.who === id);
        if (p) { const r = answer(p.id, { how: 'dream' }); answered.push(p); changes.push(...r.changes); }
        else changes.push(adjust(id, sideOf(id) === 'doubters' ? R.dreamDoubter : R.dream, 'a dream'));
      }
      return { answered, changes: changes.filter(Boolean), cruel: false, prophecy: null };
    }
    // prayers this answers: by the one who prayed being the target or near it (a place), and the power fitting the need
    for (const p of open()) {
      if (!fits(p, name)) continue;
      const aimed = hit.includes(p.who) || (target.near || []).includes(p.who) || (name === 'smite' && target.threat && p.need === 'safety') || (name === 'fog' && p.need === 'safety' && target.threat) || ((name === 'rain' || name === 'storm') && p.need === 'rain');
      if (!aimed) continue;
      const r = answer(p.id, { how: 'power', power: name }); answered.push(p); changes.push(...r.changes);
      changes.push(...many((target.near || []).filter(id => id !== p.who), R.answeredWitness, 'saw a prayer answered'));
      const s = sideOf(p.who); if (s) changes.push(...many(everyone.filter(id => sideOf(id) === s && id !== p.who), R.answeredSide, 'a prayer answered'));
    }
    // harm
    let cruel = false;
    if (HARMFUL.has(name)) {
      if (target.threat) changes.push(...many(target.near?.length ? target.near : everyone, R.threatSmitten, 'the god struck down a beast'));
      else if (ctx.justified) { changes.push(...many(everyone.filter(id => sideOf(id) === 'faithful'), R.justFaithful, 'the god punished the defiant'), ...many(everyone.filter(id => sideOf(id) !== 'faithful'), R.justFear, 'fear of the god')); }
      else if (hit.length || target.group || target.place) {
        cruel = true;
        changes.push(...many(hit, R.cruelVictim, `${name} for nothing`), ...many((ctx.household || []).filter(id => !hit.includes(id)), R.cruelHousehold, `${name} on our house for nothing`), ...many(everyone.filter(id => !hit.includes(id) && !(ctx.household || []).includes(id)), R.cruelAll, 'pointless cruelty'));
      }
    }
    // rewards owed for a met demand: a blessing on one of those who met it
    if (BLESSINGS.has(name)) for (const o of owed) if (!o.paid && (hit.some(id => o.members.includes(id)) || (target.near || []).some(id => o.members.includes(id)))) { o.paid = true; changes.push(...many(o.members, R.rewarded, 'the god rewarded us')); }
    // prophecies
    let prophecy = null;
    for (const o of omens) if (o.status === 'open' && o.prophecy === name) { o.status = 'kept'; prophecy = o; changes.push(...many(everyone, R.prophecyKept, 'the omen came true')); }
    return { answered, changes, cruel, prophecy };
  }

  // ---- omens
  function omen(text = '') {
    const o = { id: 'o' + (++seq), text: String(text || ''), prophecy: prophecyOf(text), at: now(), until: now() + R.prophecyWindow, status: 'open' };
    if (!o.prophecy) o.status = 'sign';
    omens.push(o);
    const changes = many(ids().filter(id => sideOf(id) === 'faithful'), R.omenFaithful, 'an omen').concat(many(ids().filter(id => sideOf(id) !== 'faithful'), R.omenOthers, 'an omen'));
    return { omen: o, changes };
  }

  // ---- demands
  function demandMet(members, everyone, did) {
    owed.push({ id: did || 'd' + (++seq), members: members.slice(), at: now(), until: now() + R.rewardWindow, paid: false });
    return [...many(members, R.demandMet, 'we did as the god demanded'), ...many((everyone || ids()).filter(id => !members.includes(id)), R.demandMetOthers, 'a demand was met')];
  }
  function demandMissed(members, everyone, anger, refusers = []) {
    const all = everyone || ids(), out = [];
    if (anger && anger !== 'none') { out.push(...many(all.filter(id => sideOf(id) === 'faithful'), R.angerFaithful, 'the god is just'), ...many(all.filter(id => sideOf(id) !== 'faithful'), R.angerFear, 'fear of the god')); }
    else { out.push(...many(all.filter(id => sideOf(id) === 'doubters' || refusers.includes(id)), R.mercyDoubters, 'nothing happened'), ...many(all.filter(id => sideOf(id) === 'faithful' && !refusers.includes(id)), R.mercyFaithful, 'the god is merciful')); }
    return out;
  }

  // ---- time: lapsed prayers, prophecies, rewards
  function tick() {
    const t = now(), expired = [], broken = [], unrewarded = [], changes = [];
    // drift toward each villager's resting value, and the resting value toward belief
    const hours = lastTick == null ? 0 : Math.max(0, Math.min(48, (t - lastTick) / 60)); lastTick = t;
    if (hours && (R.drift || R.restFollow)) for (const id of ids()) {
      const b = B[id], r0 = rest[id] ?? b, k = 1 - Math.pow(1 - R.drift, hours);
      B[id] = clamp(Math.round((b + (r0 - b) * k) * 100) / 100, 0, 100);
      rest[id] = r0 + (b - r0) * (1 - Math.pow(1 - R.restFollow, hours));
    }
    for (const p of open()) if (t >= p.until) { p.status = 'ignored'; p.closed = t; expired.push(p); if (p.need !== 'thanks') changes.push(adjust(p.who, R.ignored, 'prayer ignored')); }
    for (const o of omens) if (o.status === 'open' && t >= o.until) { o.status = 'broken'; broken.push(o); changes.push(...many(ids(), R.prophecyBroken, 'the omen did not come true')); }
    for (const o of owed) if (!o.paid && !o.lapsed && t >= o.until) { o.lapsed = true; unrewarded.push(o); changes.push(...many(o.members, R.unrewarded, 'the god took and gave nothing')); }
    return { expired, broken, unrewarded, changes: changes.filter(Boolean) };
  }

  const data = () => JSON.parse(JSON.stringify({ B, side, prayers, omens, owed, seq, lastPray, rest, gains, lastTick }));
  function load(x) { if (!x) return; ({ B = {}, side = {}, prayers = [], omens = [], owed = [], seq = 0, lastPray = {}, rest = {}, gains = {}, lastTick = null } = JSON.parse(JSON.stringify(x))); for (const id of Object.keys(B)) if (rest[id] == null) rest[id] = B[id]; }
  const clear = () => { B = {}; side = {}; prayers = []; omens = []; owed = []; seq = 0; lastPray = {}; log = []; rest = {}; gains = {}; lastTick = null; };
  return { rules: R, belief, set, adjust, many, average, ids, classify, side: sideOf, setSide, manaPerHour, offeringValue, needsOf, maybePray, addPrayer, open, prayers: () => prayers.slice(), rest: id => rest[id] ?? belief(id),
    get: id => prayers.find(p => p.id === id) || null, fits, answer, onPower, omen, omens: () => omens.slice(), demandMet, demandMissed, owed: () => owed.slice(), tick, data, load, clear, log: () => log.slice() };
}
