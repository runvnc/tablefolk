// keeper-test.mjs: the Dungeon Keeper game (packages/keeper, scenarios/keeper-lair.json) with no model
// (?art=1&model=none: live.js waits for a brain there, so the test runs everyone's turns itself: drive()).
// Checks: no avatar, the overhead camera; the bar and the HUD; the rock and its gold veins drawn; the Mark tool
// (dig, by dragging); imps dig marked rock (gold from the veins, carried to the heart / the treasury); every room
// claimed and furnished; creatures drawn by them through the portal (goblin, orc, warlock, troll, kobold,
// spider); eating in the hatchery, sleeping in the lair, training, research, the workshop's traps; a pay day
// paid (the demand made of the keeper, met) and one missed (the council, its vote); a hero raid repelled (a call
// to arms, the fight, a hero to the prison); every power (hand + drop, slap, heal, call to arms, lightning);
// the creatures panel; save; no page errors.
//   HEADLESS=1 ./launch-chrome.sh "about:blank"; node keeper-test.mjs [--base=http://localhost:8007] [--shots=dir]
import { chromium } from 'playwright-core';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', process.env.BASE || 'http://localhost:8000'), SHOTS = arg('shots', ''), ONLY = arg('only', '');
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0] || await b.contexts()[0].newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
let fails = 0, n = 0; const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'warning' && /\[keeper\]/.test(m.text())) console.log('     page:', m.text().slice(0, 200)); });
const check = async (name, fn) => { n++; let r; try { r = await fn(); } catch (e) { r = [false, 'threw ' + e.message]; } const [ok, info] = Array.isArray(r) ? r : [r, '']; if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info ? '- ' + String(info).slice(0, 400) : ''); return ok; };
const ev = (fn, a) => page.evaluate(fn, a);
const shot = async name => { if (!SHOTS) return; const url = await ev(() => document.getElementById('renderCanvas').toDataURL('image/jpeg', .85)); (await import('fs')).writeFileSync(`${SHOTS}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64')); console.log('     shot', `${SHOTS}/${name}.jpg`); };
const pageShot = async name => { if (SHOTS) { await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('     shot', `${SHOTS}/${name}.png`); } };
const look = (x, z, radius = 18, beta = .75) => ev(({ x, z, radius, beta }) => { state.followAvatar = false; const c = state.camera; c.setTarget(new BABYLON.Vector3(x, 0, z)); c.radius = radius; c.beta = beta; c.alpha = -Math.PI / 2; }, { x, z, radius, beta }).then(() => page.waitForTimeout(700));
// everyone's turn (jobs, monsters, raiders: live.js turnOf) until cond() holds or the time is up
const drive = (cond, secs) => ev(async ({ cond, secs }) => {
  const f = new Function('return (' + cond + ')'), end = performance.now() + secs * 1000, sleep = ms => new Promise(r => setTimeout(r, ms));
  const next = new Map(); window.__driving = true;
  try {
    while (performance.now() < end) {
      if (f()) return true;
      const due = state.characters.filter(c => !c.defeated && (next.get(c) || 0) <= performance.now());
      await Promise.all(due.map(async c => { next.set(c, performance.now() + 60000); let r = null; try { r = await tablefolkLive.turnOf(c); } catch (e) { console.warn('turn', c.id, e); } next.set(c, performance.now() + Math.min(2200, Math.max(250, (typeof r === 'number' ? r : 1500) / 3))); }));
      await sleep(150);
    }
    return f();
  } finally { window.__driving = false; }
}, { cond, secs });
const cells = (x0, x1, z0, z1) => { const o = []; for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) o.push({ x, z }); return o; };

console.log('loading the Keeper game', BASE);
page.setDefaultTimeout(15000);
await page.goto(`${BASE}/app/?art=1&model=none&intro=0&pace=busy&t=${Date.now()}&scenario=/scenarios/keeper-lair.json`);
await page.waitForFunction(() => window.tablefolkScenario?.active && state.characters?.length >= 3 && window.tablefolkKeeper && tablefolk.runAs, null, { timeout: 90000 });
await page.waitForTimeout(5000);
await ev(() => { window.__says = []; addEventListener('tablefolk-say', e => __says.push(e.detail.agentId + ': ' + e.detail.text)); window.__k = []; addEventListener('tablefolk-keeper', e => __k.push(e.detail)); window.__narr = []; const n = tablefolkDirector?.narrate; if (n) tablefolkDirector.narrate = (t, ...a) => { __narr.push(t); return n.call(tablefolkDirector, t, ...a); }; });

await check('no avatar; the overhead camera over the heart', () => ev(() => { const c = state.camera, h = tablefolkKeeper.heart(); return [!state.playerAvatar && c.radius >= 20 && Math.hypot(c.target.x - h.x, c.target.z - h.z) < 6, `radius ${c.radius.toFixed(1)} target ${c.target.x.toFixed(1)},${c.target.z.toFixed(1)}`]; }));
await check('the bar: time, Creatures, Mark, Orders, the powers', () => ev(() => { const t = [...document.querySelectorAll('#powerBar button')].map(b => b.textContent); const want = ['Creatures', 'Mark', 'Orders', 'Hand', 'Slap', 'Heal', 'Call to arms', '×1']; return [want.every(w => t.some(x => x.includes(w))) && !t.some(x => /Lightning|Pay wages|Drop/.test(x)), t.join(' | ')]; }));
await check('the HUD: gold and the heart', () => ev(() => { const h = document.getElementById('resourceHud').textContent; return [/Gold/.test(h) && /Heart/.test(h) && tablefolkResources.get('gold') === 80, h]; }));
await check('the rock is drawn as blocks, gold veins glitter', () => ev(() => { const r = state.scene.getMeshByName('keeper_rock'), g = state.scene.getMeshByName('keeper_gold'); return [r?.thinInstanceCount > 300 && g?.thinInstanceCount >= 10 && tablefolkKeeper.veins().size >= 10, `rock ${r?.thinInstanceCount}, gold ${g?.thinInstanceCount}, veins ${tablefolkKeeper.veins().size}`]; }));
await check('three imps, on rails', () => ev(() => { const im = state.characters.filter(c => c.charModel === 'imp'); return [im.length === 3 && im.every(c => tablefolkJobs.jobOf(c)?.id === 'keeper_imp'), im.map(c => c.id + ':' + tablefolkJobs.jobOf(c)?.id).join(' ')]; }));
await look(-4, -3, 26, .7); await shot('k01-start'); await pageShot('k01-start-page');

// ---- the treasury first (the heart holds only 60 gold), then digging for gold
await ev(() => tablefolkLive.start());
const ROOMS = { treasury: [-8, -5, -4, -2], lair: [-13, -9, -7, -2], hatchery: [-8, -5, -7, -5], training: [-13, -11, -1, 1], library: [-10, -8, -1, 1], workshop: [-7, -5, -1, 1], prison: [-11, -6, -9, -8] };
await ev(c => tablefolkDesignate.add({ kind: 'treasury', cells: c, priority: 5, by: 'test' }), cells(...ROOMS.treasury));
// the Mark tool by hand: dig, dragged over the gold west of the heart (with a floor square that must be left out)
await look(2, -7, 14, .45);
await page.click('#powerBar button:has-text("Mark")'); await page.waitForTimeout(300);
await page.click('#tfPickBar button:has-text("dig")');
const pts = await ev(() => { const sc = state.scene, p = (x, z) => BABYLON.Vector3.Project(new BABYLON.Vector3(x, state.terrainTopY ?? 0, z), BABYLON.Matrix.Identity(), sc.getTransformMatrix(), state.camera.viewport.toGlobal(sc.getEngine().getRenderWidth(), sc.getEngine().getRenderHeight())); const r = document.getElementById('renderCanvas').getBoundingClientRect(), k = r.width / sc.getEngine().getRenderWidth(); const a = p(2, -9), b2 = p(5, -7); return [[r.left + a.x * k, r.top + a.y * k], [r.left + b2.x * k, r.top + b2.y * k]]; });
await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); await page.mouse.move((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, { steps: 4 }); await page.mouse.move(pts[1][0], pts[1][1], { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(500);
await check('the dig tool shows the rock squares to confirm (the floor left out)', () => ev(() => { const t = document.getElementById('tfPickBar').textContent; return [/dig/.test(t) && /not rock/.test(t) && !!document.querySelector('#tfPickBar button.go'), t.slice(0, 200)]; }));
await pageShot('k02-dig-confirm');
await page.click('#tfPickBar button.go');
await check('marked: a dig designation of the 9 rock squares', () => ev(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'dig'); return [!!d && d.cells.length === 9 && d.cells.every(c => tablefolkKeeper.isRock(c.x, c.z)), d ? d.cells.map(c => c.x + ',' + c.z).join(' ') : 'none']; }));
const g0 = await ev(() => tablefolkResources.get('gold'));
let t0 = Date.now();
await drive("tablefolkDesignate.list().filter(d => d.kind === 'dig').every(d => d.status === 'done') && tablefolkDesignate.list().find(d => d.kind === 'treasury')?.status === 'done' && state.characters.filter(c => c.charModel === 'imp').every(c => !(charInventory(c).gold > 0))", 240);
console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
await check('the imps dug it out: no rock left there, the tunnel floor', () => ev(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'dig'); return [d.status === 'done' && d.cells.every(c => !tablefolkKeeper.isRock(c.x, c.z) && cellPassable(c.x, c.z)), d.status + ' ' + tablefolkDesignate.board.progress(d).done + '/' + d.cells.length]; }));
await check('the treasury was claimed and is a place with gold piles', () => ev(() => { const p = tablefolkJobs.places.placeNamed('treasury'); return [!!p && tablefolkKeeper.rules.cells('treasury') === 12 && tablefolkKeeper.capacity() === 60 + 12 * 40, `place ${!!p}, ${tablefolkKeeper.rules.cells('treasury')} squares, capacity ${tablefolkKeeper.capacity()}`]; }));
await check('gold from the 5 vein squares (150) carried to the treasury', () => ev(g0 => [tablefolkResources.get('gold') === g0 + 150 && __k.filter(e => e.what === 'dug' && e.gold).length === 5, `${g0} -> ${tablefolkResources.get('gold')}; dug ${__k.filter(e => e.what === 'dug').length} (${__k.filter(e => e.what === 'dug' && e.gold).length} gold)`], g0));
await look(-3, -6, 16, .6); await shot('k03-dug');

// ---- the other rooms
for (const k of ['lair', 'hatchery', 'training', 'library', 'workshop', 'prison']) await ev(({ k, c }) => tablefolkDesignate.add({ kind: k, cells: c, priority: 4, by: 'test' }), { k, c: cells(...ROOMS[k]) });
t0 = Date.now();
await drive("['lair', 'hatchery', 'training', 'library', 'workshop', 'prison'].every(k => tablefolkKeeper.rules.cells(k) > 0)", 300);
console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
await check('every room claimed, a place each, with its furniture', () => ev(() => { const k = ['lair', 'hatchery', 'treasury', 'training', 'library', 'workshop', 'prison'], o = getObjects(); const f = { lair: /^bed$/, hatchery: /sacks|apple_barrel/, training: /dummy/, library: /bookcase|lectern/, workshop: /anvil|workbench/, prison: /cage|chains/ }; const bad = k.filter(r => !tablefolkJobs.places.placeNamed(r) || (f[r] && !o.some(x => f[r].test(x.type) && tablefolkJobs.places.inPlace(tablefolkJobs.places.placeNamed(r), x.x, x.z)))); return [!bad.length, k.map(r => r + ' ' + tablefolkKeeper.rules.cells(r)).join(', ') + (bad.length ? ' missing: ' + bad : '') + '; beds ' + tablefolkKeeper.rules.beds()]; }));
await look(-9, -3, 17, .55); await shot('k04-rooms');

// ---- creatures come
t0 = Date.now();
await ev(() => { tablefolkKeeper.quarter(); });
await drive("state.characters.some(c => tablefolkKeeper.rules.get(c.id))", 20);
await check('a creature came through the portal, drawn by a room', () => ev(() => { const c = tablefolkKeeper.rules.list(); return [c.length >= 1 && __k.some(e => e.what === 'arrived') && __narr.some(t => /comes through the portal/.test(t)), c.map(x => x.id + ' ' + x.kind).join(', ') + ' | ' + __narr.filter(t => /portal/.test(t)).join(' / ')]; }));
// the rest, as each arrival makes room for the next (an arrival every game hour)
for (let i = 0; i < 8; i++) { const k = await ev(() => tablefolkKeeper.attract()); if (!k) break; await ev(k => tablefolkKeeper.arrive(k), k); await page.waitForTimeout(400); }
await check('each room drew its kind: goblin (lair), orc (training), warlock (library), troll (workshop), kobold (treasury), spider (prison)', () => ev(() => { const kinds = new Set(tablefolkKeeper.rules.list().map(c => c.kind)); return [['goblin', 'orc', 'warlock', 'troll', 'kobold', 'spider'].every(k => kinds.has(k)), [...kinds].join(', ') + `; ${tablefolkKeeper.rules.count()} creatures, ${tablefolkKeeper.rules.beds()} beds`]; }));
await check('they are characters with the creature job, a weapon, the card', () => ev(() => { const g = state.characters.find(c => tablefolkKeeper.rules.get(c.id)?.kind === 'orc'); const l = tablefolkMind.cardLines(g); return [tablefolkJobs.jobOf(g)?.id === 'keeper_creature' && l.some(x => /orc warrior/.test(x) && /wage/.test(x)), g.id + ': ' + l.filter(x => /wage|keeper/.test(x)).join(' / ')]; }));
await drive('false', 25);
await look(-7, -3, 15, .6); await shot('k05-creatures');

// ---- their needs and work on rails
const goblin = await ev(() => state.characters.find(c => tablefolkKeeper.rules.get(c.id)?.kind === 'goblin').id);
const food0 = await ev(() => [...tablefolkKeeper.hatch().values()][0].food);
await ev(id => { const g = state.characters.find(c => c.id === id); tablefolkMind.mindOf(g).hunger = .8; }, goblin);
await drive(`tablefolkMind.mindOf(state.characters.find(c => c.id === '${goblin}')).hunger < .1`, 60);
await check('hungry: the goblin ate in the hatchery (a meal fewer there)', () => ev(({ id, food0 }) => { const g = state.characters.find(c => c.id === id); return [tablefolkMind.mindOf(g).hunger < .1 && [...tablefolkKeeper.hatch().values()][0].food === food0 - 1, `hunger ${tablefolkMind.mindOf(g).hunger.toFixed(2)}, food ${food0} -> ${[...tablefolkKeeper.hatch().values()][0].food}`]; }, { id: goblin, food0 }));
await ev(id => { const g = state.characters.find(c => c.id === id); tablefolkMind.mindOf(g).tired = .85; }, goblin);
await drive(`state.characters.find(c => c.id === '${goblin}').pose?.mode === 'lie'`, 60);
await check('tired: it went to bed in the lair', () => ev(id => { const g = state.characters.find(c => c.id === id), p = g.logicalPos || g.root.position; return [g.pose?.mode === 'lie' && tablefolkJobs.places.inPlace(tablefolkJobs.places.placeNamed('lair'), p.x, p.z), `${g.pose?.mode} at ${p.x.toFixed(1)},${p.z.toFixed(1)}; doing ${g._job?.doing}`]; }, goblin));
await look(-11, -4, 9, .6); await shot('k06-asleep');
const w0 = await ev(() => ({ xp: tablefolkKeeper.rules.list().filter(c => c.kind === 'orc').reduce((a, c) => a + c.xp, 0), research: tablefolkKeeper.rules.researchPoints(), gold: tablefolkResources.get('gold') }));
await drive('tablefolkKeeper.rules.researchPoints() >= 4 && tablefolkKeeper.rules.list().some(c => c.kind === "orc" && c.xp >= 2) && tablefolkKeeper.rules.data().craft >= 2', 120);
await check('work: the orc trained (xp, a gold a session), the warlock studied, the troll hammered', () => ev(w0 => { const R = tablefolkKeeper.rules, xp = R.list().filter(c => c.kind === 'orc').reduce((a, c) => a + c.xp, 0); return [xp > w0.xp && R.researchPoints() > w0.research && R.data().craft > 0 && tablefolkResources.get('gold') < w0.gold, `orc xp ${w0.xp} -> ${xp}, research ${w0.research} -> ${R.researchPoints()}, craft ${R.data().craft}, gold ${w0.gold} -> ${tablefolkResources.get('gold')}; doing: ${state.characters.filter(c => R.get(c.id)).map(c => c.id + ': ' + c._job?.doing).join('; ')}`]; }, w0));
await look(-9, 0, 11, .6); await shot('k07-working');

// ---- pay day: paid
await ev(() => tablefolkKeeper.payday());
await page.waitForTimeout(1500);
await check('pay day: a demand made of the keeper, said by a creature; the Pay wages button', () => ev(() => { const d = tablefolkDemands.list().slice(-1)[0], t = [...document.querySelectorAll('#powerBar button')].map(b => b.textContent).join(' | '); return [d?.of === 'player' && d.status === 'open' && /wages/.test(d.text) && __says.some(l => /Pay day/.test(l)) && /Pay wages/.test(t), `${d?.text} (of ${JSON.stringify(d?.of)}, via ${d?.via}); bar: ${t.slice(0, 160)}`]; }));
await check('the creatures’ cards carry it', () => ev(() => { const g = state.characters.find(c => tablefolkKeeper.rules.get(c.id)); return [tablefolkMind.cardLines(g).some(x => /pay day/i.test(x)), tablefolkMind.cardLines(g).filter(x => /pay/i.test(x)).join(' / ')]; }));
const pay0 = await ev(() => ({ gold: tablefolkResources.get('gold'), owed: tablefolkKeeper.rules.pending().owed, happy: tablefolkKeeper.rules.list().map(c => c.happy) }));
await page.click('#powerBar button:has-text("Pay wages")');
await page.waitForTimeout(2600);
await check('paid: gold down by the wages, everyone happier, the demand met', () => ev(p => { const d = tablefolkDemands.list().slice(-1)[0], h = tablefolkKeeper.rules.list().map(c => c.happy); return [tablefolkResources.get('gold') === p.gold - p.owed && d.status === 'met' && h.every((x, i) => x >= Math.min(100, p.happy[i])) && h.some((x, i) => x > p.happy[i]), `gold ${p.gold} -> ${tablefolkResources.get('gold')} (owed ${p.owed}); demand ${d.status}; happiness ${p.happy.map(Math.round).join(',')} -> ${h.map(Math.round).join(',')}`]; }, pay0));

// ---- pay day: missed (the deadline passes), the council
await ev(() => tablefolkKeeper.payday());
await page.waitForTimeout(1200);
const h1 = await ev(() => tablefolkKeeper.rules.list().map(c => c.happy));
await ev(() => { const d = tablefolkDemands.list().slice(-1)[0]; d.by = tablefolkJobs.gm() - 1; });
await page.waitForTimeout(3000);
await check('missed: the demand missed, everyone angrier, the council called', () => ev(h1 => { const d = tablefolkDemands.list().slice(-1)[0], h = tablefolkKeeper.rules.list().map(c => c.happy); return [d.status === 'missed' && h.every((x, i) => x < h1[i]) && (!!tablefolkKeeper.council() || !!tablefolkKeeper.lastCouncil()), `demand ${d.status}; happiness ${h1.map(Math.round).join(',')} -> ${h.map(Math.round).join(',')}; council ${!!tablefolkKeeper.council()}`]; }, h1));
await drive('!!tablefolkKeeper.lastCouncil()', 90);
await check('the council met at the heart: speeches, a vote, its outcome', () => ev(() => { const c = tablefolkKeeper.lastCouncil(); return [!!c && c.speeches.length >= 3 && !!c.outcome && c.speeches.every(s => __says.some(l => l.startsWith(s.who + ': '))), c ? c.speeches.map(s => `${s.who} (${s.stance}): ${s.text}`).join(' / ') + ` => ${c.outcome.outcome} ${JSON.stringify(c.outcome.votes)}` : 'none']; }));
await look(0, -5, 12, .6); await shot('k08-council');

// ---- powers
const tgt = await ev(() => { const g = state.characters.find(c => tablefolkKeeper.rules.get(c.id)?.kind === 'warlock'); const p = g.logicalPos || g.root.position; return { id: g.id, x: Math.round(p.x), z: Math.round(p.z) }; });
await check('slap: happiness down, works faster for an hour', () => ev(async t => { const R = tablefolkKeeper.rules, h = R.happy(t.id), g = state.characters.find(c => c.id === t.id); const r = await tablefolkPowers.use('slap', { who: g, x: t.x, z: t.z }); return [r && !r.fail && R.happy(t.id) < h, `${h} -> ${R.happy(t.id)}`]; }, tgt));
await check('heal: 10 gold, full health', () => ev(async t => { const g = state.characters.find(c => c.id === t.id), gold = tablefolkResources.get('gold'); tablefolk.setBrainConfig(t.id, { hp: 2 }); const r = await tablefolkPowers.use('heal', { who: g, x: t.x, z: t.z }); const c = tablefolk.getBrainConfig(t.id); return [!r?.fail && c.hp === c.maxHp && tablefolkResources.get('gold') === gold - 10, `hp ${c.hp}/${c.maxHp}, gold ${gold} -> ${tablefolkResources.get('gold')}`]; }, tgt));
await check('hand: picked up (out of the world), the Drop button', () => ev(async t => { const g = state.characters.find(c => c.id === t.id); const r = await tablefolkPowers.use('hand', { who: g, x: t.x, z: t.z }); const b = [...document.querySelectorAll('#powerBar button')].map(x => x.textContent).join(' | '); return [!r?.fail && tablefolkKeeper.held().length === 1 && !g.root.isEnabled() && /Drop \(1\)/.test(b), b.slice(0, 200)]; }, tgt));
await page.click('#powerBar button:has-text("Drop")'); await page.waitForTimeout(300);
const dp = await ev(() => { const sc = state.scene, v = BABYLON.Vector3.Project(new BABYLON.Vector3(0, state.terrainTopY ?? 0, 0), BABYLON.Matrix.Identity(), sc.getTransformMatrix(), state.camera.viewport.toGlobal(sc.getEngine().getRenderWidth(), sc.getEngine().getRenderHeight())); const r = document.getElementById('renderCanvas').getBoundingClientRect(), k = r.width / sc.getEngine().getRenderWidth(); return [r.left + v.x * k, r.top + v.y * k]; });
await page.mouse.click(dp[0], dp[1]); await page.waitForTimeout(800);
await check('drop: clicked on the portal: it is there again', () => ev(t => { const g = state.characters.find(c => c.id === t.id), p = g.logicalPos || g.root.position; return [tablefolkKeeper.held().length === 0 && g.root.isEnabled() && Math.hypot(p.x, p.z) < 2.5, `at ${p.x.toFixed(1)},${p.z.toFixed(1)}`]; }, tgt));
await ev(() => { tablefolkKeeper.rules.unlock('lightning'); tablefolkBar.render(); });
await check('research unlocked lightning: the power on the bar', () => ev(() => [[...document.querySelectorAll('#powerBar button')].some(b => /Lightning/.test(b.textContent))]));

// ---- heroes: a call to arms at the portal, the raid, the fight
await ev(() => { for (const c of state.characters) { const m = tablefolkMind.mindOf(c); if (m) { m.hunger = 0; m.tired = 0; } if (c.pose?.mode === 'lie') tablefolkJobs.kit.wake(c, tablefolkJobs.kit.S(c)); } for (const c of tablefolkKeeper.rules.list()) { c.strikeUntil = 0; c.leaving = false; c.happy = Math.max(c.happy, 50); } });
await check('call to arms at the portal: 5 gold, a flag, the Call off button', () => ev(async () => { const gold = tablefolkResources.get('gold'); const r = await tablefolkPowers.use('call_to_arms', { x: 0, z: 1, place: 'portal' }); const b = [...document.querySelectorAll('#powerBar button')].map(x => x.textContent).join(' | '); return [!r?.fail && !!tablefolkKeeper.rally() && tablefolkResources.get('gold') === gold - 5 && /Call off/.test(b), b.slice(0, 200)]; }));
await drive("state.characters.filter(c => tablefolkKeeper.rules.get(c.id)).filter(c => Math.hypot((c.logicalPos||c.root.position).x, (c.logicalPos||c.root.position).z - 1) < 3.5).length >= 4", 60);
await check('the creatures gathered at the flag', () => ev(() => { const near = state.characters.filter(c => tablefolkKeeper.rules.get(c.id)).filter(c => Math.hypot((c.logicalPos || c.root.position).x, (c.logicalPos || c.root.position).z - 1) < 3.5); return [near.length >= 4, near.map(c => c.id).join(', ')]; }));
await look(-2, 3, 14, .6); await shot('k09-call-to-arms');
await ev(() => tablefolkThreats.now('heroes'));
await page.waitForTimeout(1500);
await check('heroes came in from the gate (knight, adventurer, mage)', () => ev(() => { const h = tablefolkThreats.active(); return [h.length === 3 && h.every(c => tablefolkJobs.places.inPlace(tablefolkJobs.places.placeNamed('hero_gate'), (c.logicalPos || c.root.position).x, (c.logicalPos || c.root.position).z) || Math.hypot((c.logicalPos || c.root.position).x + 6.5, (c.logicalPos || c.root.position).z - 7.5) < 4), h.map(c => c.id + ' ' + c.charModel).join(', ')]; }));
const strike = await ev(() => { const h = tablefolkThreats.active()[0], p = h.logicalPos || h.root.position; return { id: h.id, x: Math.round(p.x), z: Math.round(p.z) }; });
await check('lightning on a hero: 20 gold, 5 damage', () => ev(async t => { const g = state.characters.find(c => c.id === t.id), hp = tablefolk.getBrainConfig(t.id).hp, gold = tablefolkResources.get('gold'); const r = await tablefolkPowers.use('lightning', { who: g, x: t.x, z: t.z }); return [!r?.fail && tablefolk.getBrainConfig(t.id).hp <= hp - 5 && tablefolkResources.get('gold') === gold - 20, `hp ${hp} -> ${tablefolk.getBrainConfig(t.id).hp}`]; }, strike));
const heart0 = await ev(() => tablefolkKeeper.rules.heart());
t0 = Date.now();
await drive("tablefolkThreats.active().length === 0", 180);
console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
await check('the raid repelled: no heroes left standing, the heart stands', () => ev(h0 => { const down = state.characters.filter(c => c._threat && c.defeated).length; return [tablefolkThreats.active().length === 0 && tablefolkKeeper.rules.heart() > 0, `heroes struck down ${down}, heart ${h0} -> ${tablefolkKeeper.rules.heart()}; creatures ${tablefolkKeeper.rules.count()}`]; }, heart0));
await page.waitForTimeout(2500);
await check('a fallen hero was dragged to the prison (or looted for gold)', () => ev(() => [tablefolkKeeper.prisoners().size > 0 || __narr.some(t => /take 15 gold/.test(t)), [...tablefolkKeeper.prisoners().keys()].join(', ') + ' | ' + __narr.filter(t => /prison|gold from the body/.test(t)).join(' / ')]));
await look(-5, 2, 16, .6); await shot('k10-after-raid');
if (await ev(() => tablefolkKeeper.prisoners().size > 0)) {
  await ev(() => { for (const p of tablefolkKeeper.prisoners().values()) p.since -= 200; tablefolkKeeper.prisonTick(); });
  await page.waitForTimeout(2500);
  await check('the prisoner rose as a skeleton that serves the keeper', () => ev(() => [tablefolkKeeper.rules.list().some(c => c.kind === 'skeleton'), tablefolkKeeper.rules.list().map(c => c.id + ' ' + c.kind).join(', ')]));
}
await ev(() => tablefolkKeeper.callOff());

// ---- the panel, a trap set, save
await page.click('#powerBar button:has-text("Creatures")'); await page.waitForTimeout(400);
await check('the creatures panel: mood, level, wage, rooms, research', () => ev(() => { const t = document.getElementById('tfPickBar').textContent; return [/level/.test(t) && /wage/.test(t) && /treasury/.test(t) && /research/.test(t) && /imp/.test(t), t.slice(0, 300)]; }));
await pageShot('k11-panel');
await page.click('#tfPickBar button:has-text("close")');
await ev(() => { tablefolkKeeper.rules.data(); for (let i = 0; i < 12 && tablefolkKeeper.rules.traps() < 1; i++) tablefolkKeeper.rules.craft(state.characters.find(c => tablefolkKeeper.rules.get(c.id)?.kind === 'troll').id); tablefolkDesignate.add({ kind: 'trap', cells: [{ x: 0, z: 4 }], by: 'test' }); });
await drive("tablefolkKeeper.traps().length > 0", 60);
await check('a trap made in the workshop set by an imp', () => ev(() => [tablefolkKeeper.traps().length === 1 && getObjects().some(o => o.type === 'bear_trap'), JSON.stringify(tablefolkKeeper.traps().map(t => [t.x, t.z]))]));
await check('save keeps the keeper’s state', () => ev(() => { const s = tablefolkSaveHooks.keeper.save(); return [s.r.C.length === tablefolkKeeper.rules.count() + tablefolkKeeper.rules.list().filter(c => c.leaving).length && s.r.rooms.length === 7, `${s.r.C.length} creatures, ${s.r.rooms.length} rooms`]; }));
await look(-4, -3, 26, .62); await shot('k12-end');
await check('no page errors', () => [!errs.length, errs.slice(0, 3).join(' / ')]);
console.log(`\n${n - fails}/${n} passed`);
await b.close().catch(() => {});
process.exit(fails ? 1 : 0);
