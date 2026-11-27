// god-test.mjs: the God / Dungeon Keeper foundations in the game, with no model
// (?art=1, "brain": "none"; live.js waits for a brain there, so the test runs the
// characters' job ticks itself, as package-test.mjs does). Plays
// tools/browser-test/scenarios/hearth-spirit-none.json (scenarios/hearth-spirit.json
// with "brain": "none") and checks:
//   the power bar (Mark, Orders, the package's two powers), the favour HUD, the group;
//   the scenario's demand: the elder says it, the faithful's cards carry it, code on
//   rails brings the bread to the temple, it is met, favour and the flag follow;
//   the Mark tool by hand (a fence dragged on the ground) and by words (a wall around
//   the garden with a gate toward the road, code only), then the workers build the wall;
//   a standing order from words, fired: bram answers the call;
//   the powers: a gift of bread (favour paid, bread given), golden rain (the package's
//   weather kind, particles); above-rails options offer the marked work and the demand.
// Then the God game (packages/god, scenarios/god-village.json): no avatar,
// the bar and the HUD, time controls, a prayer answered and one met with silence, every power, a decree
// met after a council and one missed (its anger), a dream and an omen kept (in god-game-test.mjs); --only=god or --only=hearth.
//   HEADLESS=1 ./launch-chrome.sh "about:blank"; node god-test.mjs [--base=http://localhost:8002] [--shots=dir] [--only=god]
import { chromium } from 'playwright-core';
import { godGameTest } from './god-game-test.mjs';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', process.env.BASE || 'http://localhost:8000'), SHOTS = arg('shots', ''), ONLY = arg('only', '');
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
let fails = 0, n = 0; const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
const check = async (name, fn) => { n++; let r; try { r = await fn(); } catch (e) { r = [false, 'threw ' + e.message]; } const [ok, info] = Array.isArray(r) ? r : [r, '']; if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info ? '- ' + String(info).slice(0, 300) : ''); return ok; };
const ev = (fn, a) => page.evaluate(fn, a);
const shot = async name => { if (!SHOTS) return; const url = await ev(() => document.getElementById('renderCanvas').toDataURL('image/png')); (await import('fs')).writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log('     shot', `${SHOTS}/${name}.png`); };
// the free camera over a square (the follow camera keeps the player in view)
const look = (x, z, radius = 18, beta = .8) => ev(({ x, z, radius, beta }) => { tablefolk.setCameraView('overview'); state.followAvatar = false; const c = state.camera; c.setTarget(new BABYLON.Vector3(x, 0, z)); c.radius = radius; c.beta = beta; }, { x, z, radius, beta }).then(() => page.waitForTimeout(700));
const lookAt = async place => { const p = await ev(n => { const d = tablefolkJobs.places.placeNamed(n); return d ? [(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2] : [0, 0]; }, place); await look(p[0], p[1]); };
const pageShot = async name => { if (SHOTS) { await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('     shot', `${SHOTS}/${name}.png`); } };
// run every character's job tick until cond() holds or the time is up (live.js waits for a brain under ?art=1)
const drive = (cond, secs) => ev(async ({ cond, secs }) => {
  const f = new Function('return (' + cond + ')'), end = performance.now() + secs * 1000, sleep = ms => new Promise(r => setTimeout(r, ms));
  const next = new Map();
  while (performance.now() < end) {
    if (f()) return true;
    for (const c of state.characters) { if (c.defeated || (next.get(c) || 0) > performance.now()) continue; let r = null; try { r = await tablefolkJobs.tick(c); } catch (e) { console.warn('tick', c.id, e); } next.set(c, performance.now() + Math.min(2500, Math.max(250, (r?.ms ?? 1500) / 3))); }
    await sleep(200);
  }
  return f();
}, { cond, secs });

if (ONLY !== 'god') {
console.log('loading', BASE);
await page.goto(`${BASE}/app/?art=1&pace=busy&t=${Date.now()}&scenario=../tools/browser-test/scenarios/hearth-spirit-none.json`);
await page.waitForFunction(() => window.tablefolkScenario?.active && state.characters?.length >= 4 && window.tablefolkBrainInfo?.()?.key === 'none', null, { timeout: 90000 });
await page.waitForTimeout(6000);

await check('the power bar: Mark, Orders and the package’s two powers', () => ev(() => { const t = [...document.querySelectorAll('#powerBar button')].map(b => b.textContent); return [t.some(x => /Mark/.test(x)) && t.some(x => /Orders/.test(x)) && t.some(x => /Golden rain/.test(x)) && t.some(x => /Gift of bread/.test(x)) && !document.getElementById('powerBar').hidden, t.join(' | ')]; }));
await check('the favour resource on the HUD, and as the world flag', () => ev(() => [/Favour/.test(document.getElementById('resourceHud').textContent) && tablefolkStory.get('favour') === tablefolkResources.get('favour'), document.getElementById('resourceHud').textContent]));
await check('the faithful group (from the scenario)', () => ev(() => [tablefolkGroups.members('faithful').join() === 'wren,bram,tilly' && tablefolkGroups.of('wren').includes('faithful'), tablefolkGroups.members('faithful').join()]));
await pageShot('01-bar');

// ---- the demand
await check('the elder delivered the demand in words', () => ev(() => { const h = state.globalHistory.join('\n'); return [/elder_ada say "Bring 2 bread to the temple/.test(h), tablefolkDemands.list()[0]?.via]; }));
await check('the faithful’s state cards carry it', () => ev(() => { const l = tablefolkMind.cardLines(state.characters.find(c => c.id === 'bram')); return [l.some(x => /Demanded of the faithful/.test(x)) && l.some(x => /belong to the faithful/.test(x)), l.filter(x => /faithful/.test(x)).join(' / ')]; }));
await check('above rails the demand would be an activity (do it, or refuse)', () => ev(() => { const g = state.characters.find(c => c.id === 'wren'), k = tablefolkJobs.kit, o = tablefolkAgency.options(g, k.S(g), tablefolkJobs.jobOf(g)); return [o.some(x => x.kind === 'demand') && o.some(x => x.kind === 'refuse'), o.filter(x => /demand|refuse/.test(x.kind)).map(x => x.label).join(' / ')]; }));
const t0 = Date.now(), fav0 = await ev(() => tablefolkResources.get('favour'));
const met = await drive("tablefolkDemands.list()[0]?.status === 'met' && tablefolkStory.get('offering_made') === true", 150);
await check('on rails, code brought the bread and the demand was met', () => ev(() => { const d = tablefolkDemands.list()[0]; return [d.status === 'met' && tablefolkStory.get('offering_made') === true, `${d.status} ${Math.round(d.progress * 100)}% delivered ${tablefolkDemands.delivered(d)}; wren carries ${JSON.stringify(charInventory(state.characters.find(c => c.id === 'wren')).items)}`]; }));
console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
await check('its consequence: favour went up by 8 (beside its +2.5 an hour)', () => ev(f0 => [tablefolkResources.get('favour') >= f0 + 8, `${f0} -> ${tablefolkResources.get('favour')}`], fav0));

// ---- the Mark tool by hand: a fence dragged on the ground
await look(0, 0, 34, .5);
await page.click('#powerBar button:has-text("Mark")');
await page.waitForTimeout(300);
await page.click('#tfPickBar button:has-text("fence")');
const pts = await ev(() => { const sc = state.scene, p = (x, z) => BABYLON.Vector3.Project(new BABYLON.Vector3(x, state.terrainTopY ?? 0, z), BABYLON.Matrix.Identity(), sc.getTransformMatrix(), state.camera.viewport.toGlobal(sc.getEngine().getRenderWidth(), sc.getEngine().getRenderHeight())); const r = document.getElementById('renderCanvas').getBoundingClientRect(), k = r.width / sc.getEngine().getRenderWidth(); const a = p(-12, 9), b2 = p(-15, 12); return [[r.left + a.x * k, r.top + a.y * k], [r.left + b2.x * k, r.top + b2.y * k]]; });
await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); await page.mouse.move((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, { steps: 4 }); await page.mouse.move(pts[1][0], pts[1][1], { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(500);
await pageShot('02-fence-preview');
await check('dragging shows the fence’s squares to confirm', () => ev(() => [/fence/.test(document.getElementById('tfPickBar').textContent) && !!document.querySelector('#tfPickBar button.go'), document.getElementById('tfPickBar').textContent.slice(0, 160)]));
await page.click('#tfPickBar button.go');
await check('marked: a fence designation (a ring of squares)', () => ev(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'fence'); return [!!d && d.cells.length >= 8, d ? d.cells.length + ' squares' : 'none']; }));
await ev(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'fence'); if (d) tablefolkDesignate.cancel(d.id); });
await check('cancelled: gone from the board', () => ev(() => [!tablefolkDesignate.list().some(x => x.kind === 'fence')]));

// ---- the Mark tool by words (code only): a wall around the garden, a gate toward the road
await page.click('#powerBar button:has-text("Mark")');
await page.fill('#tfMarkWords', 'build a wall around the garden with a gate toward the road');
await page.click('#tfPickBar button:has-text("plan it")');
await page.waitForFunction(() => !!document.querySelector('#tfPickBar button.go'), null, { timeout: 10000 });
await check('words to a plan, shown for confirmation', () => ev(() => [/wall around the garden/.test(document.getElementById('tfPickBar').textContent), document.getElementById('tfPickBar').textContent.slice(0, 200)]));
await lookAt('garden');
await shot('03-wall-preview');
await page.selectOption('#tfPickBar select', '5');
await page.click('#tfPickBar button.go');
await check('marked: the wall, urgent, with its gate', () => ev(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'wall'); return [!!d && d.priority === 5 && !!d.gate && d.cells.length >= 12, d ? `${d.cells.length} squares, gate ${JSON.stringify(d.gate)}` : 'none']; }));
await check('above rails the wall would be an activity', () => ev(() => { const g = state.characters.find(c => c.id === 'bram'), k = tablefolkJobs.kit, o = tablefolkAgency.options(g, k.S(g), tablefolkJobs.jobOf(g)); return [o.some(x => x.kind === 'mark'), o.filter(x => x.kind === 'mark').map(x => x.label).join(' / ')]; }));
const w0 = Date.now();
await drive("(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'wall'); return !d || d.status !== 'open' || tablefolkDesignate.board.progress(d).done >= 8; })()", 120);
await lookAt('garden'); await shot('04-wall-building');
await drive("(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'wall'); return !d || d.status !== 'open'; })()", 200);
await check('characters built the wall by code (walls and a door in its squares)', () => ev(() => { const d = tablefolkDesignate.list().find(x => x.kind === 'wall'), p = tablefolkDesignate.board.progress(d); const walls = d.cells.filter(c => state.blocks.some(b => !b.isDisposed?.() && ['wall', 'door'].includes(meta(b)?.type) && Math.round(b.position.x) === c.x && Math.round(b.position.z) === c.z)).length; return [d.status === 'done' && walls >= p.done - 1 && p.done >= d.cells.length * .8, `${d.status}: ${p.done}/${p.total} done, ${p.blocked} blocked, ${walls} stand; who: ${[...new Set(d.cells.map(c => c.by).filter(Boolean))]}`]; }));
console.log(`     (${Math.round((Date.now() - w0) / 1000)} s)`);
await lookAt('garden'); await shot('05-wall-done');

// ---- a standing order
await check('a standing order from words, in plain text', () => ev(async () => { const r = await tablefolkOrders.fromWords('if any bandits come, wake bram and ring the bell'); return [r.when === 'raiders > 0' && r.do.wake === 'bram' && r.do.alarm && /When raiders come: /.test(tablefolkOrders.describe(r)), tablefolkOrders.describe(r)]; }));
await check('the scenario’s order fires with no model: bram answers the call', () => ev(async () => { const o = tablefolkOrders.list()[0]; await tablefolkOrders.fire(o); const g = state.characters.find(c => c.id === 'bram'), r = await tablefolkOrders.urgent(g, tablefolkJobs.kit.S(g), tablefolkJobs.jobOf(g)); return [!!r && /call/.test(g._job.doing), g._job.doing]; }));

// ---- powers
await check('gift of bread: favour paid, two loaves given', () => ev(async () => { const g = state.characters.find(c => c.id === 'tilly'), f0 = tablefolkResources.get('favour'), b0 = tablefolkJobs.kit.count(g, 'bread'); const r = await tablefolkPowers.use('bread_gift', { who: g }); return [tablefolkJobs.kit.count(g, 'bread') === b0 + 2 && Math.abs(tablefolkResources.get('favour') - (f0 - 3 + 1)) < .01, `${r}; favour ${f0} -> ${tablefolkResources.get('favour')}`]; }));
await check('golden rain on a place: the package’s weather kind, particles, the flag', () => ev(async () => { const d = tablefolkJobs.places.placeNamed('garden'); const r = await tablefolkPowers.use('golden_rain', { x: Math.round((d.x0 + d.x1) / 2), z: Math.round((d.z0 + d.z1) / 2), place: 'garden' }); const w = tablefolkWeather.now(); return [w?.kind === 'golden_rain' && !!w.area && state.scene.particleSystems.some(p => p.name === 'weather') && tablefolkStory.get('weather') === 'golden_rain', `${r} / ${JSON.stringify(w)}`]; }));
await lookAt('garden'); await page.waitForTimeout(2000);
await shot('06-golden-rain');
await check('a power the player cannot afford is refused, nothing paid', () => ev(async () => { tablefolkResources.set('favour', 1); const g = state.characters.find(c => c.id === 'bram'), b0 = tablefolkJobs.kit.count(g, 'bread'), r = await tablefolkPowers.use('bread_gift', { who: g }); return [r.fail === 'cannot afford it' && tablefolkResources.get('favour') === 1 && tablefolkJobs.kit.count(g, 'bread') === b0, JSON.stringify(r)]; }));
await check('core weather: storm, snow, fog, dark, then clear', () => ev(async () => { const out = []; for (const k of ['storm', 'snow', 'fog', 'dark']) { tablefolkWeather.set(k, { intensity: .8 }); out.push(tablefolkWeather.now()?.kind); } tablefolkWeather.set('storm', { intensity: 1 }); await new Promise(r => setTimeout(r, 1200)); return [out.join() === 'storm,snow,fog,dark', out.join()]; }));
await shot('07-storm');
await ev(() => tablefolkWeather.clear());
await check('saved and restored with the world (designations, demands, orders, resources, weather)', () => ev(() => { const d = tablefolk.worldStateData(); return [!!d.hooks?.designations?.all?.length && !!d.hooks?.orders?.demands?.all?.length && d.hooks?.resources?.favour != null, Object.keys(d.hooks || {}).join(', ')]; }));
await check('no page errors', () => [!errs.length, errs.slice(0, 3).join(' | ')]);
}
if (ONLY !== 'hearth') { errs.length = 0; await godGameTest({ page, ev, check, shot, pageShot, look, drive, errs, BASE }); }
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} passed`);
await b.close().catch(() => {});
process.exit(fails ? 1 : 0);
