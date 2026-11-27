// god-game-test.mjs: the God game (packages/god, scenarios/god-village.json) with no model,
// called by god-test.mjs (node god-test.mjs --only=god). ?art=1&model=none: live.js waits for a
// brain there, so the test runs the characters' job ticks itself (drive), and the clock runs.
// Checks: no avatar and the overhead camera; the bar (Pause, speed, Prayers, Decree, 14 powers)
// and the HUD (mana, belief, each group's average); speed x2; a prayer said at the temple, in the
// list, answered with a gift of food (belief +15, mana paid); one met with silence; every power and
// what it does (weather, crops withered and grown back, a lamb born, sickness, healing, lightning
// on a beast and on a villager (cruel: belief falls), beasts lost in the fog); a dream and an omen
// whose prophecy comes true; a decree met after a council (mana, belief) and one missed (its anger);
// the village tab; save; no page errors.
export async function godGameTest({ page, ev, check, shot, pageShot, look, drive, errs, BASE }) {
  console.log('loading the God game', BASE);
  page.setDefaultTimeout(10000);
  await page.goto(`${BASE}/app/?art=1&model=none&intro=0&pace=busy&t=${Date.now()}&scenario=/scenarios/god-village.json`);
  await page.waitForFunction(() => window.tablefolkScenario?.active && state.characters?.length >= 8 && window.tablefolkGod && tablefolk.runAs, null, { timeout: 90000 });
  await page.waitForTimeout(5000);
  // what everyone says (code's lines do not go to the turn history)
  await ev(() => { window.__says = []; addEventListener('tablefolk-say', e => __says.push(e.detail.agentId + ': ' + e.detail.text)); });
  const said = re => ev(src => __says.filter(l => new RegExp(src).test(l)), re.source);
  const gm = () => ev(() => tablefolkJobs.gm());
  const lookAt = async place => { const p = await ev(n => { const d = tablefolkJobs.places.placeNamed(n); return d ? [(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2] : [0, 0]; }, place); await look(p[0], p[1], 16, .85); };
  const B = id => ev(id => tablefolkGod.rules.belief(id), id);

  await check('god: no avatar, the overhead camera over the temple', () => ev(() => { const c = state.camera, s = tablefolkGod.shrine(); return [!state.playerAvatar && c.radius >= 25 && Math.hypot(c.target.x - s.x, c.target.z - s.z) < 1.5, `radius ${c.radius.toFixed(1)} target ${c.target.x.toFixed(1)},${c.target.z.toFixed(1)} shrine ${s.id} ${s.x},${s.z}`]; }));
  await check('god: the bar (time, Prayers, Decree, 14 powers)', () => ev(() => { const t = [...document.querySelectorAll('#powerBar button')].map(b => b.textContent); const want = ['Prayers', 'Decree', 'Rain', 'Drought', 'Storm', 'Fog', 'Bless field', 'Bless herd', 'Heal', 'Gift of food', 'Smite', 'Plague', 'Blight', 'Beast', 'Dream', 'Omen', '×1']; return [want.every(w => t.some(x => x.includes(w))) && t.some(x => /Pause|Go on/.test(x)), t.join(' | ')]; }));
  await check('god: the HUD: mana, belief, the faithful, the doubters, the households', () => ev(() => { const h = document.getElementById('resourceHud').textContent; return [/Mana/.test(h) && /Belief/.test(h) && /Faithful/.test(h) && /Doubters/.test(h) && /Millers/.test(h) && /Reeds/.test(h) && tablefolkResources.get('belief_faithful') > 60 && tablefolkResources.get('belief_doubters') < 35, h]; }));
  await ev(() => { tablefolkLive.start(); });
  await page.click('#powerBar button:has-text("×1")');
  await check('god: speed ×2 (the clock twice as fast), then back', () => ev(async () => { const k = tablefolkModes.speed, r = tablefolkModes.clockRate(); document.querySelector('#powerBar [data-bar="god:speed"]').click(); document.querySelector('#powerBar [data-bar="god:speed"]').click(); return [k === 2 && r === 2 && tablefolkModes.speed === 1, `speed ${k}, clock rate ${r}, then ${tablefolkModes.speed}`]; }));
  await pageShot('g01-bar-hud');

  // ---- a prayer: tilly is hungry and goes to the temple
  await ev(() => { const g = state.characters.find(c => c.id === 'tilly'); tablefolkMind.mindOf(g).hunger = .9; tablefolkGod.intents.set('tilly', { need: 'food', at: tablefolkJobs.gm() }); tablefolkGod.intents.set('finn', { need: 'sign', at: tablefolkJobs.gm() }); });
  const t0 = Date.now();
  await drive("tablefolkGod.rules.open().filter(p => ['tilly', 'finn'].includes(p.who)).length >= 2", 120);
  console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
  await check('god: tilly walked to the temple and prayed aloud for food', () => ev(() => { const p = tablefolkGod.rules.open().find(p => p.who === 'tilly'); return [!!p && p.need === 'food' && __says.some(l => l.startsWith('tilly: ') && l.includes(p.text)) && /temple/.test(p.place), p ? `${p.need}: ${p.text} (${p.by})` : 'no prayer; open: ' + JSON.stringify(tablefolkGod.rules.open())]; }));
  await page.click('#powerBar button:has-text("Prayers")');
  await page.waitForTimeout(400);
  await check('god: the prayers list shows both, each with an answer, a dream and silence', () => ev(() => { const t = document.getElementById('tfPickBar').textContent; return [/tilly/.test(t) && /finn/.test(t) && /Gift of food/.test(t) && /dream/.test(t) && /silence/.test(t), t.slice(0, 300)]; }));
  await lookAt('temple'); await pageShot('g02-prayers'); await shot('g02-prayers-scene');
  const b0 = await B('tilly'), m0 = await ev(() => tablefolkResources.get('mana')), bread0 = await ev(() => tablefolkJobs.kit.count(state.characters.find(c => c.id === 'tilly'), 'bread'));
  await page.click('#tfPickBar .gp:has-text("tilly") button.go');
  await page.waitForTimeout(800);
  await check('god: answered with a gift of food: +3 bread, belief +15, 3 mana paid', () => ev(({ b0, m0, bread0 }) => { const g = state.characters.find(c => c.id === 'tilly'), p = tablefolkGod.rules.prayers().find(p => p.who === 'tilly'); return [p.status === 'answered' && tablefolkJobs.kit.count(g, 'bread') === bread0 + 3 && tablefolkGod.rules.belief('tilly') >= Math.min(100, b0 + 15) && tablefolkResources.get('mana') <= m0 - 3 + .5, `${p.status} by ${p.by}; belief ${b0} -> ${tablefolkGod.rules.belief('tilly')}; mana ${m0.toFixed(1)} -> ${tablefolkResources.get('mana').toFixed(1)}`]; }, { b0, m0, bread0 }));
  const f0 = await B('finn');
  await page.click('#tfPickBar .gp:has-text("finn") button:has-text("silence")');
  await check('god: finn’s prayer met with silence: -3', () => ev(f0 => { const p = tablefolkGod.rules.prayers().find(p => p.who === 'finn'); return [p.status === 'silence' && tablefolkGod.rules.belief('finn') === f0 - 3, `${p.status}; ${f0} -> ${tablefolkGod.rules.belief('finn')}`]; }, f0));
  await ev(() => tablefolkBar.pick(null));

  // ---- the powers
  await ev(() => tablefolkResources.set('mana', 150));
  const garden = await ev(() => { const d = tablefolkJobs.places.placeNamed('garden'); return { x: Math.round((d.x0 + d.x1) / 2), z: Math.round((d.z0 + d.z1) / 2), place: 'garden' }; });
  await check('god: blight on the garden: crops wither, the flag', () => ev(async t => { const r = await tablefolkPowers.use('blight', t); return [tablefolkGod.withered() > 0 && tablefolkStory.get('blight') === true, `${r}; ${tablefolkGod.withered()} withered`]; }, garden));
  await lookAt('garden'); await page.waitForTimeout(600); await shot('g03-blight');
  await check('god: bless the field: the blight lifts, crops grow', () => ev(async t => { const before = tablefolkGod.withered(); const r = await tablefolkPowers.use('bless_field', t); return [tablefolkGod.withered() < before && tablefolkStory.get('blight') === false, `${r}; withered ${before} -> ${tablefolkGod.withered()}`]; }, garden));
  await page.waitForTimeout(700); await shot('g04-bless-field');
  await check('god: bless the herd: a lamb is born, the herder gets wool', () => ev(async t => { const n0 = state.characters.filter(c => c.charModel === 'sheep').length; const r = await tablefolkPowers.use('bless_herd', t); await new Promise(r => setTimeout(r, 1500)); const n1 = state.characters.filter(c => c.charModel === 'sheep').length; return [n1 === n0 + 1 && state.characters.some(c => /^lamb/.test(c.id)), `${r}; sheep ${n0} -> ${n1}`]; }, garden));
  await check('god: drought: the weather kind, the flag; rain ends it', () => ev(async t => { const r1 = await tablefolkPowers.use('drought', null); const w1 = tablefolkWeather.now()?.kind, d1 = tablefolkStory.get('drought'); const r2 = await tablefolkPowers.use('rain', t); return [w1 === 'drought' && d1 === true && tablefolkWeather.now()?.kind === 'rain' && tablefolkStory.get('drought') === false, `${r1} (${w1}, ${d1}) / ${r2} (${tablefolkWeather.now()?.kind})`]; }, garden));
  await page.waitForTimeout(1500); await shot('g05-rain');
  await check('god: storm over the square: lightning, the weather', () => ev(async () => { const d = tablefolkJobs.places.placeNamed('square'); const r = await tablefolkPowers.use('storm', { x: Math.round((d.x0 + d.x1) / 2), z: Math.round((d.z0 + d.z1) / 2), place: 'square' }); return [tablefolkWeather.now()?.kind === 'storm', r]; }));
  await page.waitForTimeout(2500); await look(0, 0, 30, .8); await shot('g06-storm');
  // a beast; a prayer for safety; smite one beast; the fog drives the other off
  await check('god: beasts come out of the wild', () => ev(async () => { const r = await tablefolkPowers.use('beast', null); return [tablefolkThreats.active().length === 2, `${r}; ${tablefolkThreats.active().map(c => c.id)}`]; }));
  await ev(() => { const p = tablefolkGod.rules.addPrayer({ who: 'wren', need: 'safety', text: 'Beasts! Protect us!' }); });
  const w0 = await B('wren');
  await check('god: smite a beast: it falls, wren’s prayer for safety is answered', () => ev(async w0 => { const c = tablefolkThreats.active()[0]; const r = await tablefolkPowers.use('smite', { who: c, x: 0, z: 0 }); await new Promise(r => setTimeout(r, 900)); const p = tablefolkGod.rules.prayers().find(p => p.who === 'wren' && p.need === 'safety'); return [c.defeated && p.status === 'answered' && tablefolkGod.rules.belief('wren') > w0, `${r}; ${c.id} defeated ${c.defeated}; prayer ${p.status}; wren ${w0} -> ${tablefolkGod.rules.belief('wren')}`]; }, w0));
  await page.waitForTimeout(400); await shot('g07-smite');
  await check('god: fog: the other beast loses its way', () => ev(async () => { const r = await tablefolkPowers.use('fog', null); return [tablefolkWeather.now()?.kind === 'fog' && tablefolkThreats.active().length === 0, `${r}; active ${tablefolkThreats.active().length}`]; }));
  await page.waitForTimeout(800); await shot('g08-fog');
  await ev(() => tablefolkWeather.clear());
  // cruelty: lightning on a villager who did nothing
  const before = await ev(() => Object.fromEntries(['elder_ada', 'wren', 'bram'].map(id => [id, tablefolkGod.rules.belief(id)])));
  await page.waitForTimeout(12500);   // (smite's cooldown)
  await check('god: smite bram for nothing: cruel, he and everyone else lose belief', () => ev(async b => { const g = state.characters.find(c => c.id === 'bram'); const r = JSON.stringify(await tablefolkPowers.use('smite', { who: g, x: 0, z: 0 })); await new Promise(r => setTimeout(r, 400)); const a = id => tablefolkGod.rules.belief(id); return [a('bram') < b.bram && a('elder_ada') < b.elder_ada && a('wren') < b.wren, `${r}; bram ${b.bram} -> ${a('bram')}, ada ${b.elder_ada} -> ${a('elder_ada')}`]; }, before));
  // plague on the Reeds, then heal tilly
  await check('god: plague on finn: the Reeds fall sick (motes, in bed, hungrier)', () => ev(async () => { const g = state.characters.find(c => c.id === 'finn'); const r = await tablefolkPowers.use('plague', { who: g, x: 0, z: 0 }); const s = tablefolkGod.sick(); const t = state.characters.find(c => c.id === 'tilly'), u = await tablefolkGod.quarter && await tablefolkJobs.tick(g); return [s.includes('finn') && s.includes('tilly') && /sick|home|hiding/.test(tablefolkJobs.doing(g)), `${r}; sick ${s}; finn: ${tablefolkJobs.doing(g)}`]; }));
  await ev(() => { const g = state.characters.find(c => c.id === 'finn'); const p = g.logicalPos || g.root.position; state.camera.setTarget(new BABYLON.Vector3(p.x, 0, p.z)); state.camera.radius = 9; });
  await page.waitForTimeout(900); await shot('g09-plague');
  await check('god: the plague card line', () => ev(() => { const l = tablefolkSkills.cardLines(state.characters.find(c => c.id === 'finn')); return [l.some(x => /sick with the plague/.test(x)) && l.some(x => /believe in the god/.test(x)), l.join(' / ')]; }));
  await check('god: heal tilly: cured, not finn', () => ev(async () => { const g = state.characters.find(c => c.id === 'tilly'); const r = await tablefolkPowers.use('heal', { who: g, x: 0, z: 0 }); const s = tablefolkGod.sick(); return [!s.includes('tilly') && s.includes('finn'), `${r}; sick ${s}`]; }));
  await ev(() => tablefolkGod.cure(state.characters.find(c => c.id === 'finn')));
  // a dream, an omen and its prophecy
  const br0 = await B('bram');
  await check('god: a dream to bram: remembered, told aloud, a doubter’s belief +8', () => ev(async br0 => { const g = state.characters.find(c => c.id === 'bram'); const r = await tablefolkPowers.use('dream', { who: g, words: 'Fear not, Bram. I watch over your sister.' }); await new Promise(r => setTimeout(r, 2500)); const h = __says.filter(l => l.startsWith('bram: ')).join('\n'); return [/dream/i.test(h) && tablefolkGod.rules.belief('bram') >= br0 + 8 && tablefolkSkills.cardLines(g).some(l => /dream/.test(l)), `${r}; ${br0} -> ${tablefolkGod.rules.belief('bram')}; ${h.split('\n').slice(-1)}`]; }, br0));
  const says0 = await ev(() => __says.length);
  await check('god: an omen with words is a prophecy; two villagers read it', () => ev(async () => { const r = await tablefolkPowers.use('omen', { words: 'rain will come to the fields' }); await new Promise(r => setTimeout(r, 1200)); const o = tablefolkGod.rules.omens().slice(-1)[0]; return [o.prophecy === 'rain' && o.status === 'open', r]; }));
  await lookAt('temple'); await page.waitForTimeout(500); await shot('g10-omen');
  await page.waitForTimeout(4000);
  await check('god: the omen read aloud by the faithful and a doubter', () => ev(n => { const l = __says.slice(n); const f = l.filter(x => /^(elder_ada|wren|tilly): /.test(x)), d = l.filter(x => /^(bram|finn): /.test(x)); return [f.length >= 1 && d.length >= 1, l.join(' / ')]; }, says0 - 0));
  const fin0 = await B('finn');
  await check('god: rain makes the prophecy come true: everyone +8', () => ev(async ({ garden, fin0 }) => { const r = await tablefolkPowers.use('rain', garden); const o = tablefolkGod.rules.omens().slice(-1)[0]; return [o.status === 'kept' && tablefolkGod.rules.belief('finn') >= fin0 + 8, `${o.status}; finn ${fin0} -> ${tablefolkGod.rules.belief('finn')}`]; }, { garden, fin0 }));
  await ev(() => tablefolkWeather.clear());

  // ---- a decree met: a council, then the faithful bring the bread
  await page.click('#powerBar button:has-text("Decree")');
  await page.fill('#tfGodWords', 'the faithful must bring 2 bread to the temple by tomorrow');
  await page.click('#tfPickBar button:has-text("read it")');
  await page.waitForFunction(() => !!document.querySelector('#tfPickBar button.go'), null, { timeout: 10000 });
  await check('god: the decree read and shown, with the anger to choose', () => ev(() => { const t = document.getElementById('tfPickBar').textContent; return [/Bring 2 bread to the temple/.test(t) && /the faithful/.test(t) && !!document.querySelector('#tfPickBar select') && /council/.test(t), t.slice(0, 260)]; }));
  await pageShot('g11-decree');
  const mana0 = await ev(() => tablefolkResources.get('mana')), wb0 = await B('wren');
  await page.click('#tfPickBar button.go');
  const c0 = Date.now();
  await drive("!!tablefolkGod.council()", 10);
  await drive("!tablefolkGod.council() && tablefolkDemands.list().some(d => d.template === 'god_offering')", 70);
  console.log(`     (council ${Math.round((Date.now() - c0) / 1000)} s)`);
  await check('god: a vision, a council at the temple (speeches, a vote), then the demand', () => ev(() => { const d = tablefolkDemands.list().find(d => d.template === 'god_offering'), h = state.globalHistory.join('\n'); return [!!d && d.via === 'elder_ada' && __says.some(l => /^elder_ada: A vision/.test(l)) && __says.some(l => /What do you say/.test(l)) && !!d.data.council, `${d?.text} via ${d?.via}; council ${d?.data?.council}; votes ${JSON.stringify(d?.data?.votes)}`]; }));
  await lookAt('temple'); await shot('g12-council');
  await drive("tablefolkDemands.list().find(d => d.template === 'god_offering')?.status !== 'open'", 150);
  await check('god: the faithful brought the bread: met, mana and belief up', () => ev(({ mana0, wb0 }) => { const d = tablefolkDemands.list().find(d => d.template === 'god_offering'); return [d.status === 'met' && tablefolkResources.get('mana') > mana0 && tablefolkGod.rules.belief('wren') > wb0 && tablefolkGod.rules.owed().length > 0, `${d.status} ${Math.round(d.progress * 100)}%; mana ${mana0.toFixed(1)} -> ${tablefolkResources.get('mana').toFixed(1)}; wren ${wb0} -> ${tablefolkGod.rules.belief('wren')}`]; }, { mana0, wb0 }));
  // ---- a decree missed: a sheep by the full moon, no one does it in time; the anger: plague
  await check('god: a goat sacrifice by the full moon: a sheep, the anger chosen (plague)', () => ev(async () => { const d = await tablefolkGod.decree('I require a goat sacrifice by the full moon', { council: false, anger: 'plague' }); return [d.template === 'god_sacrifice' && d.data.animal === 'sheep' && d.by > tablefolkJobs.gm(), `${d.text} by ${d.by} (now ${tablefolkJobs.gm()})`]; }));
  await check('god: the deadline passes: missed, the anger falls (a household sick), belief from fear', () => ev(async () => { const d = tablefolkDemands.list().find(d => d.template === 'god_sacrifice'); const b0 = tablefolkGod.rules.belief('finn'); d.by = tablefolkJobs.gm() - 1; await new Promise(r => setTimeout(r, 4500)); return [d.status === 'missed' && tablefolkGod.sick().length > 0 && tablefolkGod.rules.belief('finn') !== b0, `${d.status}; sick ${tablefolkGod.sick()}; finn ${b0} -> ${tablefolkGod.rules.belief('finn')}`]; }));
  // ---- the village tab
  await page.click('#powerBar button:has-text("Prayers")'); await page.click('#tfPickBar button:has-text("the village")'); await page.waitForTimeout(300);
  await check('god: the village tab: everyone’s belief, side, sickness, the decrees', () => ev(() => { const t = document.getElementById('tfPickBar').textContent; return [['elder_ada', 'wren', 'tilly', 'bram', 'finn'].every(n => t.includes(n)) && /decrees/.test(t) && /met/.test(t) && /missed/.test(t), t.slice(0, 300)]; }));
  await pageShot('g13-village');
  await ev(() => tablefolkBar.pick(null));
  await check('god: saved with the world (belief, prayers, sickness)', () => ev(() => { const d = tablefolk.worldStateData(); return [!!d.hooks?.god?.g?.B?.wren && Array.isArray(d.hooks.god.sick), Object.keys(d.hooks || {}).join(', ')]; }));
  await check('god: no page errors', () => [!errs.length, errs.slice(0, 3).join(' | ')]);
}
