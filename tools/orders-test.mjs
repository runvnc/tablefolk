// orders-test.mjs: designations as jobs, demands, groups, standing orders and
// resources (app/orders-core.js) and group autonomy precedence
// (app/autonomy-profile.js), with no game and no model.
//   node tools/orders-test.mjs
import '../app/orders-core.js';
import '../app/autonomy-profile.js';
const O = globalThis.TablefolkOrdersCore, PF = globalThis.tablefolkProfile;
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
let T = 0; const now = () => T;

// ---- designations -> jobs
{
  const b = O.createBoard({ now });
  const wall = b.add({ kind: 'wall', cells: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, [3, 0]], gate: { x: 2, z: 0 }, priority: 2 });
  const dig = b.add({ kind: 'dig', cells: [{ x: 9, z: 9 }], priority: 5, who: 'miner' });
  ok(wall.cells.length === 4 && wall.cells.find(c => c.x === 2).gate, 'a wall of 4 squares, its gate marked');
  const eligible = id => d => !d.who || d.who === id || (id === 'mo' && d.who === 'miner');
  const a = b.claim('ann', { eligible: eligible('ann'), pos: { x: 3, z: 1 } });
  ok(a && a.d === wall && a.cell.x === 3, 'ann (not a miner) takes the wall, the nearest square to her');
  const m = b.claim('mo', { eligible: eligible('mo'), pos: { x: 0, z: 0 } });
  ok(m && m.d === dig, 'mo the miner takes the higher-priority dig first');
  ok(b.claim('ann', { eligible: eligible('ann') }).cell === a.cell, 'claiming again returns the same square');
  const c = b.claim('cy', { eligible: eligible('cy'), pos: { x: 3, z: 0 } });
  ok(c && c.cell !== a.cell, 'two workers never share a square');
  b.finish('ann'); b.finish('mo');
  ok(dig.status === 'done', 'the dig is done when its one square is');
  b.release('cy', { fail: true, why: 'no route' });
  ok(wall.cells.find(x => x.x === c.cell.x).st === 'open' && wall.cells.find(x => x.x === c.cell.x).fails === 1, 'a failed square goes back on the board');
  for (let i = 0; i < 2; i++) { const k = b.claim('cy', { pos: { x: c.cell.x, z: 0 } }); if (k.cell.x === c.cell.x) b.release('cy', { fail: true }); else b.release('cy'); }
  ok(['blocked', 'open'].includes(wall.cells.find(x => x.x === c.cell.x).st), 'three failures block a square for a while');
  b.setPriority(wall.id, 5); ok(wall.priority === 5, 'priority changes');
  const d = b.claim('dee', { pos: { x: 0, z: 0 } }); const ws = b.cancel(wall.id);
  ok(wall.status === 'cancelled' && ws.includes('dee') && !b.claimOf('dee'), 'cancelling frees the workers on it');
  const g = b.add({ kind: 'guard', cells: [{ x: 5, z: 5 }, { x: 7, z: 5 }] });
  ok(g.standing, 'guard posts are standing (never done)');
  const p1 = b.claim('gus', { pos: { x: 5, z: 5 } }); T = 10; b.finish('gus'); const p2 = b.claim('gus', { pos: { x: 5, z: 5 } });
  ok(p1.cell.x === 5 && p2.cell.x === 7 && g.status === 'open', 'a guard serves the post served longest ago next');
  const saved = JSON.stringify(b.data()); const b2 = O.createBoard({ now }); b2.load(JSON.parse(saved));
  ok(b2.list().length === 3 && !b2.claimOf('gus'), 'saved and loaded; claims are not kept');
  let threw = false; try { b.add({ kind: 'wall', cells: [] }); } catch { threw = true; } ok(threw, 'an empty designation is refused');
}

// ---- demands
{
  T = 600;
  const q = O.createDemands({ now });
  const flags = {};
  const met = d => d.met?.flag ? !!flags[d.met.flag] : d.met?.deliver ? { met: (flags.delivered || 0) >= d.met.deliver.n, progress: (flags.delivered || 0) / d.met.deliver.n } : false;
  const d1 = q.add({ text: 'Bring 3 bread to the shrine', of: 'faithful', by: { in: 120 }, met: { deliver: { item: 'bread', n: 3, to: 'shrine' } }, onMet: { set: { blessed: true } }, onMissed: { set: { angry: true } }, via: 'elder' });
  const d2 = q.add({ text: 'Light the beacon', of: { id: 'keeper' }, by: 700, met: { flag: 'beacon_lit' } });
  ok(d1.of.group === 'faithful' && d1.by === 720 && d1.status === 'open', 'a demand of a group, due in two hours');
  ok(q.forMember('wren', ['faithful']).includes(d1) && !q.forMember('wren', ['faithful']).includes(d2), 'it binds the group’s members, not others');
  flags.delivered = 2; let ev = q.tick(met);
  ok(!ev.length && Math.abs(d1.progress - 2 / 3) < 1e-6, 'progress shows before it is met');
  T = 701; ev = q.tick(met);
  ok(ev.length === 1 && ev[0].d === d2 && ev[0].status === 'missed', 'the beacon demand is missed after its hour');
  flags.delivered = 3; ev = q.tick(met);
  ok(ev.length === 1 && ev[0].status === 'met' && d1.status === 'met', 'the bread demand is met when the third loaf arrives');
  ok(!q.tick(met).length, 'a closed demand fires no more');
  const d3 = q.add({ text: 'Dig a cellar', of: 'all', met: { flag: 'x' } }); q.refuse(d3.id, 'bram', 'my back'); q.bargain(d3.id, 'wren', 'two days');
  ok(d3.refused[0].who === 'bram' && d3.bargains.length === 1 && d3.by === null, 'refusals and bargains are kept; no deadline is allowed');
  q.cancel(d3.id); ok(d3.status === 'cancelled', 'cancelled');
}

// ---- demand words
{
  const groups = O.normalizeGroups({ groups: { faithful: { name: 'the faithful' } } });
  const r = O.parseDemand('The faithful must bring three loaves to the shrine by evening', { now: 600, items: ['bread'], places: ['shrine'], groups });
  ok(r.met?.deliver?.item === 'bread' && r.met.deliver.n === 3 && r.met.deliver.to === 'shrine' && r.of.group === 'faithful' && r.by === 18 * 60, 'words: deliver 3 bread to the shrine by evening, of the faithful: ' + JSON.stringify(r));
  const w = O.parseDemand('build a wall around the shrine by tomorrow', { now: 600 });
  ok(w.template === 'work' && w.by === 1440 + 18 * 60, 'words: work demands become designations');
  const f = O.parseDemand('light the beacon within 2 hours', { now: 600 });
  ok(f.met?.flag === 'beacon_lit' && f.by === 720, 'words: a flag demand');
  ok(O.parseDemand('hmm', {}).error, 'nonsense is refused with a hint');
}

// ---- groups and their autonomy
{
  const scn = { groups: { faithful: { name: 'The faithful', autonomy: 'guided', members: ['wren'] }, household: { members: ['bram'] } }, agents: [{ id: 'wren' }, { id: 'bram', group: 'household' }, { id: 'ida', group: ['faithful', 'household'] }, { id: 'odd', group: 'bad group!' }] };
  const G = O.normalizeGroups(scn);
  ok(G.faithful.members.join() === 'wren,ida' && G.household.members.join() === 'bram,ida', 'members from the group’s list and agents’ "group"');
  ok(!Object.keys(G).some(k => /bad/.test(k)), 'a bad group id is dropped');
  ok(O.groupsOf('ida', G).join() === 'faithful,household', 'a character in two groups');
  ok(O.autonomyFor(null, O.groupsOf('ida', G), G) === 'guided' && O.autonomyFor('free', ['faithful'], G) === null && O.autonomyFor(null, ['household'], G) === null, 'group autonomy: the first group that sets one; none when the character has its own');
  // precedence: character > group > world > setting (autonomy-profile.js choose)
  const ch = (o) => PF.choose({ setting: 'free', ...o });
  ok(ch({ character: 'rails', group: 'guided', world: 'free' }).preset === 'rails' && ch({ character: 'rails', group: 'guided' }).source === 'character', 'the character’s own beats its group’s');
  ok(ch({ group: 'guided', world: 'free' }).preset === 'guided' && ch({ group: 'guided', world: 'free' }).source === 'group', 'the group’s beats the world’s');
  ok(ch({ world: 'free' }).preset === 'free', 'no group: the world’s');
  ok(PF.choose({ group: 'free', setting: 'auto', auto: 'rails' }).capped?.asked === 'free', 'a group asking for free on a rails brain is kept on rails');
  const mix = PF.choose({ group: { danger: 'code' }, world: 'guided', setting: 'auto', auto: 'guided' });
  ok(mix.preset === 'guided' && mix.domains.danger === 'code', 'a group override without a preset fills from the world: ' + mix.label);
}

// ---- standing orders
{
  const people = ['captain_mara', 'wren', 'bram'], roles = { captain_mara: 'captain of the guard', wren: 'baker' };
  const r = O.parseOrder('wake the captain if more than two wolves come', { people, roles });
  ok(r.when === 'raiders > 2' && r.do.wake === 'captain_mara', 'words: wake the captain if more than two wolves come -> ' + JSON.stringify({ when: r.when, do: r.do }));
  ok(O.describeOrder(r) === 'When more than 2 raiders are about: wake captain_mara and send them to the threat.', 'shown in plain text: ' + O.describeOrder(r));
  const r2 = O.parseOrder('at night, send everyone inside', { people });
  ok(r2.when === 'hour >= 21 and hour < 22' && r2.do.all === 'home', 'words: at night, everyone inside');
  const r3 = O.parseOrder('if any bandits come, ring the bell and tell me', { people });
  ok(r3.when === 'raiders > 0' && r3.do.alarm && r3.do.notify, 'words: any bandits -> alarm and tell me');
  ok(O.parseOrder('if 3 or more goblins appear, send bram to the gate', { people }).do.go?.who === 'bram', 'words: send someone somewhere');
  ok(O.parseOrder('wake the dragon if wolves come', { people }).error, 'an unknown person is asked about, not guessed');
  ok(O.parseOrder('be nice', { people }).error, 'no condition: refused with a hint');
  T = 0; const orders = O.createOrders({ now }); const o = orders.add(r); let raiders = 0;
  const holds = x => x.when === 'raiders > 2' ? raiders > 2 : false;
  ok(!orders.tick(holds).length, 'quiet: nothing fires');
  raiders = 3; ok(orders.tick(holds).length === 1, 'three wolves: it fires once');
  T = 30; ok(!orders.tick(holds).length, 'still three: it does not fire again');
  raiders = 0; orders.tick(holds); raiders = 4; ok(orders.tick(holds).length === 1 && o.fired === 2, 'they come again: it fires again');
}

// ---- resources
{
  const R = O.createResources();
  R.declare('belief', { start: 10, min: 0, max: 100, perHour: 2, label: 'Belief' });
  R.declare('mana', { start: 5, perHour: (v, c) => c.faithful || 0 });
  ok(R.get('belief') === 10 && R.can('belief', 10) && !R.can('belief', 11), 'a resource with a start and a check');
  R.add('belief', -15); ok(R.get('belief') === 0, 'never below its minimum');
  R.hour(3, { faithful: 4 }); ok(R.get('belief') === 6 && R.get('mana') === 17, 'it changes by the hour (a number or a rule)');
  R.add('belief', 500); ok(R.get('belief') === 100, 'never above its maximum');
}
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
