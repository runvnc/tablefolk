// modes-test.mjs -- the game modes' rules (app/modes-core.js) in Node: which mode runs, who may
// use the model, the turn order, the encounter switch, early turns, the model queue's order.
//   node tools/browser-test/modes-test.mjs
import '../../app/modes-core.js';
const M = globalThis.tablefolkModesCore;
let ok = 0, n = 0;
const t = (name, got, want) => { n++; const pass = JSON.stringify(got) === JSON.stringify(want); if (pass) ok++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// what a scenario may write
t('mode names', ['living', 'adventure', 'turns', 'god', null].map(M.normalize), ['living', 'adventure', 'turns', null, null]);
t('modeWhen keeps valid keys', M.normalizeWhen({ fight: 'turns', talk: 'adventure', swim: 'turns', indoors: 'nope' }), { fight: 'turns', talk: 'adventure' });
t('modeWhen empty', M.normalizeWhen({ x: 1 }), null);
t('options defaults', M.options({}), { radius: 12, encounterWorld: 'slow', slowRate: .25, turnMoves: 6, turnMinutes: 10 });
t('options clamped', M.options({ modeRadius: 0, encounterWorld: 'pause', turnMoves: 99, turnMinutes: -3 }), { radius: 0, encounterWorld: 'pause', slowRate: .25, turnMoves: 30, turnMinutes: 0 });

// which mode runs
t('nothing set: living', M.resolve({}).mode, 'living');
t('the world', M.resolve({ world: 'adventure' }), { mode: 'adventure', source: 'world' });
t('no world mode, the brain\'s default (the 27B on 12 GB): adventure', M.resolve({ brain: 'adventure' }), { mode: 'adventure', source: 'brain' });
t('... the world\'s own mode wins', M.resolve({ world: 'living', brain: 'adventure' }).mode, 'living');
t('... and the player\'s setting', M.resolve({ setting: 'turns', brain: 'adventure' }).mode, 'turns');
t('a section over the world', M.resolve({ world: 'adventure', section: 'turns' }).mode, 'turns');
t('a switch over the section', M.resolve({ world: 'adventure', section: 'turns', switched: 'living' }).mode, 'living');
t('a fight (modeWhen) over a switch', M.resolve({ world: 'living', switched: 'adventure', when: { fight: 'turns' }, situation: { fight: true } }), { mode: 'turns', source: 'when fight' });
t('modeWhen idle when the situation does not hold', M.resolve({ world: 'living', when: { fight: 'turns' }, situation: { talk: true } }).mode, 'living');
t('fight wins over talk', M.situational({ talk: 'adventure', fight: 'turns' }, { talk: true, fight: true }).mode, 'turns');
t('the player setting over the situation', M.resolve({ setting: 'living', when: { fight: 'turns' }, situation: { fight: true } }).mode, 'living');
t('the link over everything', M.resolve({ url: 'turns', setting: 'living', world: 'adventure' }), { mode: 'turns', source: 'link' });
t('a bad link value is ignored', M.resolve({ url: 'god', world: 'adventure' }).mode, 'adventure');

// who may use the model
t('living: near', M.mayThink('living', { d: 5, radius: 12 }), true);
t('living: far', M.mayThink('living', { d: 20, radius: 12 }), false);
t('living: far but in the conversation', M.mayThink('living', { d: 20, radius: 12, member: true }), true);
t('living: radius 0 is everyone', M.mayThink('living', { d: 500, radius: 0 }), true);
t('anywhere: spoken to by the player, it may answer', [M.mayThink('living', { d: 50, spokenTo: true }), M.mayThink('adventure', { d: 50, spokenTo: true })], [true, true]);
t('adventure: outside the encounter, even next to the player', M.mayThink('adventure', { d: 1 }), false);
t('adventure: in the encounter', M.mayThink('adventure', { d: 3, member: true }), true);
t('turns: in the active area', M.mayThink('turns', { d: 8, radius: 10 }), true);
t('turns: outside it', M.mayThink('turns', { d: 11, radius: 10 }), false);

// the turn order
const people = [{ id: 'cora', x: 4, z: 0 }, { id: 'abe', x: 0, z: 4 }, { id: 'dov', x: 1, z: 1 }, { id: 'far', x: 30, z: 0 }];
t('nearest first, ties by name, the far one left out', M.turnOrder(people, { x: 0, z: 0 }, 12).map(c => c.id), ['dov', 'abe', 'cora']);
t('radius 0: everyone', M.turnOrder(people, { x: 0, z: 0 }, 0).map(c => c.id), ['dov', 'abe', 'cora', 'far']);
t('no player: by name', M.turnOrder(people, null, 12).map(c => c.id), ['abe', 'cora', 'dov', 'far']);
t('the same order every time', JSON.stringify(M.turnOrder(people.slice().reverse(), { x: 0, z: 0 })), JSON.stringify(M.turnOrder(people, { x: 0, z: 0 })));

// the encounter switch
{
  let clock = 0; const E = M.createEncounter({ now: () => clock });
  t('closed at first', E.open, false);
  E.start('bram', ['ana'], 'talk');
  t('opens with the one spoken to and the others in the conversation', E.members, ['bram', 'ana']);
  t('a member', E.has('ana'), true);
  t('not a member', E.has('cora'), false);
  clock = 30000; E.line('player');
  t('stays open while near and talking', E.check({ dist: { bram: 2, ana: 3 }, leave: 6, idleMs: 90000 }), null);
  t('one member near is enough', E.check({ dist: { bram: 9, ana: 3 }, leave: 6 }), null);
  t('ends when the player walks away', E.check({ dist: { bram: 9, ana: 8 }, leave: 6 }), 'walked away');
  t('... but not while a reply is on its way', E.check({ dist: { bram: 9, ana: 8 }, leave: 6, busy: true }), null);
  clock = 30000 + 91000;
  t('ends when the talk has been idle', E.check({ dist: { bram: 2 }, leave: 6, idleMs: 90000 }), 'the talk ended');
  t('... but not while a reply is being written', E.check({ dist: { bram: 2 }, leave: 6, idleMs: 90000, busy: true }), null);
  E.join('cora');
  t('someone joins', E.members, ['bram', 'ana', 'cora']);
  const s = E.end('walked away');
  t('the summary', { members: s.members, lines: s.lines, reason: s.reason }, { members: ['bram', 'ana', 'cora'], lines: 1, reason: 'walked away' });
  t('closed after', [E.open, E.has('bram'), E.check({ dist: { bram: 1 } })], [false, false, null]);
}

// early turns (turn mode prefetch)
t('far, untouched: may start early', M.independent({ d: 25, moves: 6, sight: 12, earshot: 6 }), true);
t('within reach of a walk and a look: not', M.independent({ d: 18, moves: 6, sight: 12, earshot: 6 }), false);
t('spoken to by the player: not', M.independent({ d: 40, spokenTo: true }), false);
t('in the encounter: not', M.independent({ d: 40, member: true }), false);
t('no distance: not', M.independent({ d: NaN }), false);

// the player's squares
{ const B = M.createBudget(3); t('three steps then none', [B.step(), B.step(), B.step(), B.step(), B.left], [true, true, true, false, 0]); B.reset(); t('reset', B.left, 3); }

// the model queue: the player's call goes first; a running call is not stopped
{
  const Q = M.createQueue(), done = [];
  const job = (name, ms) => () => sleep(ms).then(() => { done.push(name); return name; });
  const a = Q.push(job('bg1', 30), 0, 'bg1');   // starts at once
  const b = Q.push(job('bg2', 5), 0, 'bg2');
  const c = Q.push(job('bg3', 5), 0, 'bg3');
  const p = Q.push(job('player', 5), 2, 'player');
  t('queued: the player first, then the others in order', Q.order, ['player', 'bg2', 'bg3']);
  await Promise.all([a, b, c, p]);
  t('the running call finished first, then the player\'s', done, ['bg1', 'player', 'bg2', 'bg3']);
  const R = M.createQueue(), d2 = [];
  R.push(() => sleep(20).then(() => d2.push('run')), 0);
  const x = R.push(() => d2.push('x'), 0, 'x'), y = R.push(() => d2.push('y'), 0, 'y');
  R.raise(tag => tag === 'y', 1);
  await Promise.all([x, y]);
  t('raise moves a queued call up', d2, ['run', 'y', 'x']);
  const E2 = M.createQueue(); let err = '';
  await E2.push(() => { throw new Error('boom'); }).catch(e => { err = e.message; });
  t('an error reaches the caller and the queue goes on', [err, await E2.push(() => 'next')], ['boom', 'next']);
}
// two calls at once (a llama.cpp brain's parallel slots): background calls pair up; the player's call starts beside a
// running background one at once, and no new background call starts beside the player's
{
  const Q = M.createQueue({ slots: () => 2 }), log = [];
  const job = (name, ms) => () => { log.push('+' + name); return sleep(ms).then(() => { log.push('-' + name); }); };
  const a = Q.push(job('bg1', 40), 0, 'bg1'), b = Q.push(job('bg2', 10), 0, 'bg2');
  t('two background calls run together', [Q.running, Q.waiting], [2, 0]);
  const c = Q.push(job('bg3', 10), 0, 'bg3'), p = Q.push(job('player', 30), 2, 'player');
  await sleep(15);
  t('the player\'s call took the slot bg2 left, ahead of bg3', log.slice(0, 4), ['+bg1', '+bg2', '-bg2', '+player']);
  await Promise.all([a, b, c, p]);
  t('bg3 waited for the player\'s call, not only for a free slot', log.indexOf('+bg3') > log.indexOf('-player'), true);
  const one = M.createQueue({ slots: 1 }); one.push(() => sleep(10)); one.push(() => sleep(10));
  t('one slot: one at a time', [one.running, one.waiting], [1, 1]);
}
// the turn lock: a waiting reply to the player goes before waiting background turns
{
  const L = M.createLock(), got = [];
  const r1 = await L.acquire(0, 'bg-holder');
  const w1 = L.acquire(0, 'bg').then(r => { got.push('bg'); r(); });
  const w2 = L.acquire(2, 'player').then(r => { got.push('player'); r(); });
  r1(); await Promise.all([w1, w2]);
  t('lock: the player\'s reply next', got, ['player', 'bg']);
}

console.log(`\n${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
