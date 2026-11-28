// keeper-core.js: the Dungeon Keeper game's rules with no game in them: creatures and what draws them,
// happiness and loyalty, wages and pay day, training levels, research and the workshop, the creature
// council's vote, the dungeon heart. keeper.js wires them into the game; tools/keeper-rules-test.mjs runs
// them in Node.
//
//   const R = createKeeper({ now: () => gameMinutes, rules: { ... } })
//   creatures: R.add(id, kind) -> creature; R.get(id); R.remove(id); R.list(); R.count(kind)
//   mood:      R.adjust(id, delta, why) -> change (clamped 0-100); R.happy(id); R.loyal(id, delta)
//   rooms:     R.setRoom(id, kind, cells); R.rooms(kind?); R.cells(kind); R.beds(); R.freeBeds()
//   arrivals:  R.attract() -> kind | null (a finished room big enough, a free bed, food: what comes next)
//   wages:     R.wageOf(id); R.owed(); R.payday() -> { n, owed, by }; R.pay(gold) -> { ok, paid, changes };
//              R.missPay() -> { changes, leave: [ids], council: true }; R.pending()
//   work:      R.train(id) -> { xp, level, up }; R.research(id) -> { points, unlocked }; R.craft(id) -> { points, traps }
//   council:   stanceOf(words) -> 'wait' | 'strike' | 'leave' | null; R.stance(id) (by mood); vote(stances)
//   time:      R.hour({ hungry: [ids with no food], sleepless: [ids with no bed] }) -> { changes, leave, sulk }
//   heart:     R.heart(delta) -> hp (0 = the dungeon falls)
//   save:      R.data() / R.load(x)
export const RULES = {
  happyStart: 70, loyalStart: 50,
  paydayHours: 8, payWindow: 120,               // a pay day every 8 game hours; the creatures give the keeper 2 game hours
  paid: 12, paidEarly: 3, earlyWindow: 30,      // happiness for wages paid (and paid within half an hour of the demand)
  missed: -25, missedLoyal: -15, paidLoyal: 5,  // a pay day missed: happiness and loyalty; paid: loyalty
  slap: -6, lifted: -2, healed: 3, ate: 2, slept: 2, worked: 2, levelUp: 6, levelLoyal: 5,
  hungry: -4, sleepless: -4,                    // an hour hungry with no food in the hatchery / tired with no bed
  comradeDied: -5, victory: 6,                  // a creature struck down: the others; heroes driven off: those who fought
  complainBelow: 45, strikeBelow: 30, leaveBelow: 18,
  leaveChance: .5,                              // an hour below leaveBelow: (1 - loyalty/100) * this
  strikeHours: 2,
  xpLevels: [0, 4, 10, 18, 30],                 // xp for levels 1-5 (a training session is 1 xp)
  wageStep: .25, hpStep: 3,                     // each level: +25% wage, +3 health
  researchFor: { lightning: 20, possession: 60 }, trapEvery: 6,
  goldPerVein: 30, heartGold: 60, treasuryPerCell: 40,
  heartHp: 100,
};
// creature kinds: the body, the room that draws them (and how big it must be), wage, health, their work
export const KINDS = {
  goblin:   { body: 'goblin',   label: 'goblin',      wants: 'lair',     minSize: 9, limit: 3, wage: 4,  hp: 10, work: 'train',    temper: 'cheerful' },
  orc:      { body: 'orc',      label: 'orc warrior', wants: 'training', minSize: 9, limit: 2, wage: 8,  hp: 14, work: 'train',    temper: 'gruff' },
  warlock:  { body: 'cultist',  label: 'warlock',     wants: 'library',  minSize: 9, limit: 2, wage: 10, hp: 9,  work: 'research', temper: 'plain' },
  troll:    { body: 'troll',    label: 'troll',       wants: 'workshop', minSize: 9, limit: 1, wage: 7,  hp: 18, work: 'craft',    temper: 'gruff' },
  kobold:   { body: 'kobold',   label: 'kobold',      wants: 'treasury', minSize: 9, limit: 2, wage: 6,  hp: 8,  work: 'guard',    temper: 'timid' },
  spider:   { body: 'spider',   label: 'spider',      wants: 'prison',   minSize: 6, limit: 2, wage: 3,  hp: 8,  work: 'guard',    temper: 'plain' },
  skeleton: { body: 'skeleton', label: 'skeleton',    wants: null,       minSize: 0, limit: 9, wage: 2,  hp: 10, work: 'train',    temper: 'plain' },
};
// who comes first when several rooms would draw someone: the specialists, then goblins
export const ARRIVAL_ORDER = ['orc', 'warlock', 'troll', 'kobold', 'spider', 'goblin'];
export const ROOM_KINDS = ['lair', 'hatchery', 'treasury', 'training', 'library', 'workshop', 'prison'];

// what a creature's words at the council mean
const LEAVE = /\b(leav(e|ing)|quit|go home|desert|walk out|find (another|a new) (master|keeper)|done with (you|this)|i'?m off|be gone|pack (up|my))\b/i;
const STRIKE = /\b(strike|stop (all )?work|down tools|lay down|refuse to work|no more work|not (lift|dig|train|work)|sit (here|idle)|work for nothing)\b/i;
const WAIT = /\b(wait|patien(ce|t)|give (him|her|it|the keeper|them) time|one more (day|chance)|next pay ?day|trust|loyal|i'?ll stay|we stay)\b/i;
export function stanceOf(words) {
  const t = String(words || ''); if (!t.trim()) return null;
  // the first that takes a side decides (a "wait... or I leave" is a threat to leave)
  const at = [[LEAVE, 'leave'], [STRIKE, 'strike'], [WAIT, 'wait']].map(([re, s]) => { const m = t.match(re); return m ? { s, i: m.index } : null; }).filter(Boolean);
  if (!at.length) return null;
  if (at.some(x => x.s === 'leave') && /\b(or|else|otherwise)\b/i.test(t)) return at.some(x => x.s === 'strike') ? 'strike' : 'leave';
  return at.sort((a, b) => a.i - b.i)[0].s;
}
// the council's outcome: the most votes; a tie goes to the milder (wait < strike < leave)
export function vote(stances) {
  const n = { wait: 0, strike: 0, leave: 0 };
  for (const s of stances) if (n[s] != null) n[s]++;
  const order = ['wait', 'strike', 'leave'], best = order.reduce((a, b) => n[b] > n[a] ? b : a, 'wait');
  return { outcome: best, votes: n };
}

export function createKeeper({ now = () => 0, rules = {} } = {}) {
  const R = { ...RULES, ...rules };
  const C = new Map(), rooms = new Map();
  let paySeq = 0, pay = null, last = null, research = 0, unlocked = [], craft = 0, traps = 0, heart = R.heartHp;
  const clamp = v => Math.max(0, Math.min(100, v));
  function add(id, kind) {
    const k = KINDS[kind]; if (!k) throw new Error(`no creature kind "${kind}"`);
    const c = { id, kind, happy: R.happyStart, loyal: R.loyalStart, xp: 0, level: 1, arrived: now(), strikeUntil: 0, leaving: false, lastPaid: null, worked: 0, why: [] };
    C.set(id, c); return c;
  }
  const get = id => C.get(id) || null;
  const remove = id => C.delete(id);
  const list = () => [...C.values()];
  const count = kind => list().filter(c => !c.leaving && (!kind || c.kind === kind)).length;
  function adjust(id, d, why = '') {
    const c = C.get(id); if (!c || !d) return 0;
    const was = c.happy; c.happy = clamp(c.happy + d);
    if (why) { c.why.push({ at: now(), d: Math.round(c.happy - was), why }); if (c.why.length > 8) c.why.shift(); }
    return c.happy - was;
  }
  const loyal = (id, d) => { const c = C.get(id); if (c) c.loyal = clamp(c.loyal + d); return c?.loyal ?? 0; };
  // rooms
  function setRoom(id, kind, cells, extra = {}) { rooms.set(id, { id, kind, cells: cells.map(c => ({ x: c.x, z: c.z })), size: cells.length, at: now(), ...extra }); return rooms.get(id); }
  const roomList = kind => [...rooms.values()].filter(r => !kind || r.kind === kind);
  const cells = kind => roomList(kind).reduce((a, r) => a + r.size, 0);
  const beds = () => roomList('lair').reduce((a, r) => a + (r.beds ?? Math.max(1, Math.floor(r.size / 2))), 0);   // (the game sets r.beds: the beds it could place)
  const freeBeds = () => beds() - count();
  // what a finished room draws: the first kind (specialists first) whose room is big enough, under its limit
  // (one per minSize squares of its room), with a bed free and a hatchery to eat from
  function attract() {
    if (freeBeds() <= 0 || !cells('hatchery')) return null;
    for (const k of ARRIVAL_ORDER) {
      const K = KINDS[k]; if (!K.wants) continue;
      const have = cells(K.wants); if (have < K.minSize) continue;
      if (count(k) < Math.min(K.limit, Math.floor(have / K.minSize))) return k;
    }
    return null;
  }
  // wages
  const wageOf = id => { const c = C.get(id); if (!c) return 0; const k = KINDS[c.kind]; return Math.round(k.wage * (1 + R.wageStep * (c.level - 1))); };
  const owed = () => list().filter(c => !c.leaving).reduce((a, c) => a + wageOf(c.id), 0);
  function payday() {
    if (pay && !pay.done) return pay;
    const ids = list().filter(c => !c.leaving && wageOf(c.id) > 0).map(c => c.id);
    if (!ids.length) return null;
    pay = { n: ++paySeq, at: now(), by: now() + R.payWindow, ids, owed: ids.reduce((a, id) => a + wageOf(id), 0), done: false };
    return pay;
  }
  const pending = () => pay && !pay.done ? pay : null;
  function payNow(gold) {
    const p = pending(); if (!p) return { ok: false, why: 'no wages are owed' };
    if (gold < p.owed) return { ok: false, why: `not enough gold (${p.owed} owed, ${Math.floor(gold)} in the treasury)` };
    p.done = 'paid'; p.paidAt = now(); last = { n: p.n, how: 'paid', at: now() };
    const early = now() - p.at <= R.earlyWindow, changes = [];
    for (const id of p.ids) { const c = C.get(id); if (!c) continue; c.lastPaid = now(); changes.push({ id, d: adjust(id, R.paid + (early ? R.paidEarly : 0), early ? 'paid promptly' : 'paid') }); loyal(id, R.paidLoyal); c.strikeUntil = 0; }
    return { ok: true, paid: p.owed, changes, early };
  }
  // the deadline passed unpaid: everyone is angry; the bitterest may leave at once
  function missPay() {
    const p = pending(); if (!p) return null;
    p.done = 'missed'; last = { n: p.n, how: 'missed', at: now() };
    const changes = [], leave = [];
    for (const id of p.ids) { const c = C.get(id); if (!c) continue; changes.push({ id, d: adjust(id, R.missed, 'not paid') }); loyal(id, R.missedLoyal); if (c.happy < R.leaveBelow && c.loyal < 40) leave.push(id); }
    return { changes, leave, council: true, owed: p.owed };
  }
  // a creature's stance at the council, by its mood (on rails; above rails its own words decide)
  function stance(id) { const c = C.get(id); if (!c) return 'wait'; return c.happy < R.leaveBelow + 4 && c.loyal < 45 ? 'leave' : c.happy < R.strikeBelow + 8 ? 'strike' : 'wait'; }
  function strike(ids, hours = R.strikeHours) { for (const id of ids) { const c = C.get(id); if (c) c.strikeUntil = now() + hours * 60; } }
  const striking = id => (C.get(id)?.strikeUntil || 0) > now();
  // work
  const levelFor = xp => R.xpLevels.reduce((lv, need, i) => xp >= need ? i + 1 : lv, 1);
  function train(id) {
    const c = C.get(id); if (!c) return null;
    c.xp++; c.worked++; const lv = Math.min(R.xpLevels.length, levelFor(c.xp)), up = lv > c.level;
    if (up) { c.level = lv; adjust(id, R.levelUp, 'grew stronger'); loyal(id, R.levelLoyal); }
    else adjust(id, R.worked, 'trained');
    return { xp: c.xp, level: c.level, up };
  }
  function doResearch(id) {
    const c = C.get(id); if (!c) return null;
    c.worked++; research += c.level * 2; adjust(id, R.worked, 'studied');
    const got = Object.entries(R.researchFor).filter(([k, n]) => research >= n && !unlocked.includes(k)).map(([k]) => k);
    unlocked.push(...got);
    return { points: research, unlocked: got };
  }
  function doCraft(id) {
    const c = C.get(id); if (!c) return null;
    c.worked++; const before = Math.floor(craft / R.trapEvery); craft += c.level; adjust(id, R.worked, 'crafted');
    const made = Math.floor(craft / R.trapEvery) - before; traps += made;
    return { points: craft, made };
  }
  const useTrap = () => { if (traps <= 0) return false; traps--; return true; };
  // every game hour: hunger and sleeplessness hurt; the unhappiest may sulk, strike or leave
  function hour({ hungry = [], sleepless = [], rand = Math.random } = {}) {
    const changes = [], leave = [], sulk = [];
    for (const id of hungry) changes.push({ id, d: adjust(id, R.hungry, 'hungry with nothing in the hatchery') });
    for (const id of sleepless) changes.push({ id, d: adjust(id, R.sleepless, 'no bed to sleep in') });
    for (const c of list()) {
      if (c.leaving) continue;
      if (c.happy < R.leaveBelow && rand() < (1 - c.loyal / 100) * R.leaveChance) leave.push(c.id);
      else if (c.happy < R.strikeBelow) sulk.push(c.id);
    }
    return { changes, leave, sulk };
  }
  const heartHp = d => { if (d) heart = Math.max(0, Math.min(R.heartHp, heart + d)); return heart; };
  function data() { return { C: list(), rooms: roomList(), paySeq, pay, last, research, unlocked, craft, traps, heart }; }
  function load(x) {
    C.clear(); rooms.clear(); if (!x) return;
    for (const c of x.C || []) C.set(c.id, c);
    for (const r of x.rooms || []) rooms.set(r.id, r);
    paySeq = x.paySeq || 0; pay = x.pay || null; last = x.last || null; research = x.research || 0; unlocked = x.unlocked || []; craft = x.craft || 0; traps = x.traps || 0; heart = x.heart ?? R.heartHp;
  }
  function clear() { load(null); paySeq = 0; pay = null; last = null; research = 0; unlocked = []; craft = 0; traps = 0; heart = R.heartHp; }
  return {
    rules: R, add, get, remove, list, count, adjust, loyal, happy: id => C.get(id)?.happy ?? 0,
    setRoom, rooms: roomList, removeRoom: id => rooms.delete(id), cells, beds, freeBeds, attract,
    wageOf, owed, payday, pending, pay: payNow, missPay, lastPay: () => last, stance, strike, striking,
    train, research: doResearch, craft: doCraft, useTrap, traps: () => traps, researchPoints: () => research, unlocked: k => k ? unlocked.includes(k) : unlocked.slice(), unlock: k => { if (!unlocked.includes(k)) unlocked.push(k); },
    levelFor, hour, heart: heartHp, data, load, clear,
  };
}
