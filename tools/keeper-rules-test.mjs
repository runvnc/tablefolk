// keeper-rules-test.mjs: the Dungeon Keeper rules (packages/keeper/keeper-core.js) with no game.
//   node tools/keeper-rules-test.mjs
import { createKeeper, stanceOf, vote, KINDS, RULES } from '../packages/keeper/keeper-core.js';
let fails = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) fails++; console.log(cond ? 'ok  ' : 'FAIL', name, info ? '- ' + info : ''); };
let t = 480; const now = () => t;
const R = createKeeper({ now });
const sq = (x0, z0, w, h) => { const o = []; for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + h; z++) o.push({ x, z }); return o; };

// arrivals
ok('nothing comes to an empty dungeon', R.attract() === null);
R.setRoom('lair', 'lair', sq(0, 0, 3, 3));
ok('a lair alone draws no one (no hatchery)', R.attract() === null);
R.setRoom('hatchery', 'hatchery', sq(5, 0, 3, 3));
ok('lair + hatchery: a goblin comes', R.attract() === 'goblin', R.attract());
R.add('goblin1', 'goblin');
ok('a 3x3 lair (4 beds) and one goblin per 9 squares: no second goblin', R.attract() === null, `beds ${R.beds()} free ${R.freeBeds()}`);
R.setRoom('training', 'training', sq(0, 5, 3, 3));
ok('a training room of 9 squares draws an orc warrior', R.attract() === 'orc');
R.add('orc1', 'orc');
R.setRoom('library', 'library', sq(5, 5, 3, 2));
ok('a library of 6 squares is too small for a warlock', R.attract() === null);
R.setRoom('library', 'library', sq(5, 5, 3, 3));
ok('...of 9 squares draws one', R.attract() === 'warlock');
R.add('warlock1', 'warlock');
R.add('x', 'goblin');
ok('no free bed: nobody else comes', R.freeBeds() === 0 && R.attract() === null, `beds ${R.beds()}, creatures ${R.count()}`);
R.remove('x');

// wages and pay day
ok('wages: goblin 4 + orc 8 + warlock 10', R.owed() === 22, R.owed());
const p = R.payday();
ok('pay day: 22 owed within 2 game hours', p.owed === 22 && p.by === t + RULES.payWindow);
ok('paying with too little gold fails', !R.pay(10).ok);
t += 10;
const h0 = R.happy('orc1'), pr = R.pay(50);
ok('paid promptly: everyone happier (+15), loyalty +5', pr.ok && R.happy('orc1') === Math.min(100, h0 + RULES.paid + RULES.paidEarly) && R.get('orc1').loyal === 55, `${h0} -> ${R.happy('orc1')}`);
t += 480;
R.payday();
const h1 = R.happy('goblin1'), ms = R.missPay();
ok('a missed pay day: -25 happiness, -15 loyalty, a council', ms.council && R.happy('goblin1') === h1 - 25 && R.get('goblin1').loyal === 40, `${h1} -> ${R.happy('goblin1')}`);
ok('nobody leaves at once while still above the leaving line', ms.leave.length === 0, ms.leave.join());
R.adjust('goblin1', -100, 'test'); R.get('goblin1').loyal = 10;
ok('the bitterest stance is to leave', R.stance('goblin1') === 'leave');
R.adjust('orc1', -30, 'test');
ok('an unhappy one strikes', R.stance('orc1') === 'strike', R.happy('orc1'));
const hr = R.hour({ hungry: ['warlock1'], rand: () => 0 });
ok('an hour: a hungry one loses happiness; one below the line leaves (bad luck)', hr.leave.includes('goblin1') && hr.changes[0].d === RULES.hungry, JSON.stringify(hr));

// council words
const cases = [['I will wait one more pay day, keeper.', 'wait'], ['We stop work until we are paid!', 'strike'], ['I am leaving. Find another fool.', 'leave'],
  ['Pay us or I walk out of this hole.', 'leave'], ['No more work for nothing. Down tools!', 'strike'], ['Patience, brothers. The keeper has always paid.', 'wait'], ['Gold, gold, gold.', null]];
for (const [w, s] of cases) ok(`stanceOf "${w}"`, stanceOf(w) === s, stanceOf(w));
ok('vote: 2 strike 1 wait -> strike', vote(['strike', 'strike', 'wait']).outcome === 'strike');
ok('vote: a tie goes to the milder', vote(['leave', 'wait']).outcome === 'wait');

// work: levels, research, the workshop
const before = R.get('orc1').level;
for (let i = 0; i < 4; i++) R.train('orc1');
ok('4 training sessions: level 2, wage up 25%', R.get('orc1').level === before + 1 && R.wageOf('orc1') === 10, `level ${R.get('orc1').level} wage ${R.wageOf('orc1')}`);
let un = [];
for (let i = 0; i < 10; i++) un.push(...R.research('warlock1').unlocked);
ok('research: 10 sessions at level 1 unlock lightning (20 points)', un.includes('lightning') && R.unlocked('lightning'), R.researchPoints());
R.add('troll1', 'troll');
let made = 0; for (let i = 0; i < 6; i++) made += R.craft('troll1').made;
ok('the workshop: a trap every 6 points', made === 1 && R.traps() === 1 && R.useTrap() && R.traps() === 0);
ok('the heart takes damage, never below 0', R.heart(-30) === 70 && R.heart(-200) === 0);
const d = R.data(), R2 = createKeeper({ now }); R2.load(d);
ok('save and load', R2.count() === R.count() && R2.researchPoints() === R.researchPoints() && R2.heart() === 0);
ok('every kind has a body and a wage', Object.values(KINDS).every(k => k.body && k.wage >= 0));
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
