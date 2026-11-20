// The package mechanisms end to end, no language model: the Night Watch
// (packages/nightwatch + scenarios/nightwatch.json, "brain": "none") from this
// site and from a second origin (trust asked and answered through the page,
// data only when declined), the documented options on small fixtures
// (fixtures/pkg-extra, pkg-dep), skill code from another site, and npm:/gh:
// reference mapping.
//
//   bun server/server.js 8000                       (or any port: BASE=http://localhost:8001)
//   HEADLESS=1 ./launch-chrome.sh "http://localhost:8000/app/?art=1"
//   node package-test.mjs                           ok/FAIL lines; exits 1 on a failure
//
// It starts its own static server with CORS on port 8014 (PORT2) for the second
// origin and stops it at the end. The page's code trust (localStorage
// tablefolkTrustedCode) is cleared before and after.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://localhost:8000';
const PORT2 = +(process.env.PORT2 || 8014), ORIGIN2 = `http://localhost:${PORT2}`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.ogg': 'audio/ogg', '.png': 'image/png', '.bin': 'application/octet-stream' };
const server2 = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, ORIGIN2).pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server2.listen(PORT2, '127.0.0.1', r));

const results = [];
const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
page.setDefaultTimeout(90000);
await page.bringToFront().catch(() => {});   // a background tab's frames are throttled: walks (the militia's) never finish
try {
  say('opening the app');
  await page.goto(`${BASE}/app/?art=1&t=${Date.now()}`);
  await page.waitForFunction(() => window.tablefolk?.ready && window.tablefolkScenario && window.tablefolkPackages && window.tablefolkWorkflows, null, { timeout: 90000 });
  await page.evaluate(() => { localStorage.removeItem('tablefolkTrustedCode'); localStorage.setItem('tablefolkTtsEnabled', '0'); });

  // shared helpers in the page
  await page.evaluate(() => {
    const W = window.tablefolk;
    window.__t = {
      sleep: ms => new Promise(r => setTimeout(r, ms)),
      agent: id => W.getAgents().find(a => a.id === id),
      beacon: () => W.getObjects().find(o => o.type === 'signal_beacon'),
      mm: o => W.state.meta.get(o.mesh),
      last: id => { const h = W.state.globalHistory || []; for (let i = h.length - 1; i >= 0; i--) if (h[i].startsWith('T') && h[i].includes(' ' + id + ':')) return h[i]; return ''; },
      failed: id => W.isFailedEntry(window.__t.last(id)),
      put: (g, x, z) => { g.root.position.x = x; g.root.position.z = z; if (g.logicalPos) { g.logicalPos.x = x; g.logicalPos.z = z; } W.setCharacterLogicalPosition?.(g, new BABYLON.Vector3(x, 0, z)); },
      // play a scenario; answer the code question ("allow" | "deny" | null: none expected)
      async play(scn, answer = null) {
        const asked = [];
        const p = window.tablefolkScenario.playScenario(scn);
        const seen = new Set();
        for (let i = 0; i < 300; i++) {
          const d = document.querySelector('.confirm-overlay');
          if (d && !seen.has(d)) { seen.add(d); asked.push(d.querySelector('.confirm-title')?.textContent || '?'); (answer === 'allow' ? d.querySelector('.confirm-yes') : d.querySelector('.confirm-no')).click(); await window.__t.sleep(200); continue; }
          const done = await Promise.race([p.then(() => true), window.__t.sleep(100).then(() => false)]);
          if (done) break;
        }
        const r = await p;
        return { asked, warnings: r.plan.warnings };
      },
    };
  });
  const check = async (name, fn, arg) => {
    let r; try { r = await page.evaluate(fn, arg); } catch (e) { r = [false, 'threw: ' + e.message.split('\n')[0]]; }
    const [okv, extra] = Array.isArray(r) ? r : [r, ''];
    results.push(okv); console.log(`${okv ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).slice(0, 300) : ''}`);
    return okv;
  };

  // ---------------------------------------------------------------- 1. the Night Watch from this site
  say('1. the Night Watch from this site');
  const r1 = await page.evaluate(async () => { const s = await (await fetch('/scenarios/nightwatch.json?t=' + Date.now())).json(); s.brain = 'none'; return window.__t.play(s, null); });
  await check('no code question for this site', a => [a.asked.length === 0, a.asked.join(', ')], r1);
  await check('no load errors', a => [!a.warnings.some(w => /^error|failed|not run/i.test(w)), a.warnings.join(' | ')], r1);
  // "brain": "none" switches the page's brain, which clears the conversation history once: let it settle
  await page.evaluate(async () => { for (let i = 0; i < 50 && window.tablefolkBrainInfo?.()?.key !== 'none'; i++) await __t.sleep(100); await __t.sleep(1500); });
  await check('item types, body, sound and command registered', () => [!!tablefolkPacks.items.signal_beacon && !!tablefolkPacks.items.woodpile && tablefolkBodies.list().includes('dire_wolf') && tablefolkSfx.names.includes('howl') && !!tablefolkSkills.packageCommands.signal, Object.keys(tablefolkSkills.packageCommands).join(',')]);
  await check('the beacon starts lit, with its code-driven flame and light', () => { const o = __t.beacon(), mm = __t.mm(o); return [mm.state === 'lit' && mm.opts.fuel > 0 && tablefolk.state.scene.particleSystems.some(p => p.name === 'nw_flame') && tablefolk.state.scene.lights.some(l => l.name === 'pkg_light'), `state ${mm.state} fuel ${mm.opts.fuel}`]; });
  await check('flags published for jobs and goals', () => [tablefolkStory.get('beacon_lit') === true && tablefolkStory.get('beacon_fuel') > 0, JSON.stringify(tablefolkStory.all())]);

  // the captain's briefing: a package workflow started by the scenario's trigger, with a menu
  await check('briefing: package workflow running, its menu open', async () => { for (let i = 0; i < 30 && !document.querySelector('#menuBox [data-menu-item]'); i++) await __t.sleep(200); const items = [...document.querySelectorAll('#menuBox [data-menu-item]')].map(b => b.textContent); return [tablefolkWorkflows.active('brenna') && items.length === 3, items.join(' | ')]; });
  await check('briefing: a choice answers', async () => { await tablefolkMenu.offer('What is my duty?'); for (let i = 0; i < 40 && !/Keep the beacon burning/.test(__t.last('brenna')); i++) await __t.sleep(200); return [/Keep the beacon burning/.test(__t.last('brenna')), __t.last('brenna') || JSON.stringify((tablefolk.state.globalHistory || []).slice(-3))]; });
  await check('briefing: "ready" ends it, a flag set and a clip played (do.anim)', async () => { for (let i = 0; i < 40 && !(tablefolk.getBrainConfig('brenna').wf?.at === 'ask' && tablefolk.getBrainConfig('brenna').wf?.visits?.ask >= 2); i++) await __t.sleep(200); await __t.sleep(400); await tablefolkMenu.offer('Understood. I\'m ready.'); for (let i = 0; i < 40 && tablefolkWorkflows.active('brenna'); i++) await __t.sleep(200); return [tablefolkStory.get('briefed') === true && !tablefolkWorkflows.active('brenna') && /Two nights/.test(__t.last('brenna')) && (__t.agent('brenna')._clipsPlayed || []).includes('wave'), `${__t.last('brenna')} clips ${__t.agent('brenna')._clipsPlayed}`]; });

  // the state card and the module's effect
  await check('card line from the module (skill "card")', () => { const l = tablefolkSkills.cardLines(__t.agent('odo')); return [l.some(x => /The beacon burns/.test(x)), l.join(' | ')]; });
  await check('command list: signal() for odo (job "commands") and brenna (allowed), not wren', () => { const has = id => tablefolkSkills.commandLines(__t.agent(id)).some(l => l.startsWith('signal()')); return [has('odo') && has('brenna') && !has('wren'), `odo ${has('odo')} brenna ${has('brenna')} wren ${has('wren')}`]; });
  await check('the prompt lists it with its help line', () => { const g = __t.agent('odo'), p = tablefolk.buildAgentPrompt?.(g, tablefolk.getBrainConfig(g.id)) || ''; const s = typeof p === 'string' ? p : JSON.stringify(p); return [/signal\(\) - at a lit beacon/.test(s), (s.match(/signal\(\)[^\n]*/) || [''])[0]]; });

  // signal(): FAILED away from the fire, worked beside it, FAILED again the same night
  await check('signal() away from the beacon: FAILED', async () => { const o = __t.beacon(), g = __t.agent('odo'); __t.put(g, o.x + 8, o.z); await tablefolk.runAs('odo', 'signal()', 'test'); return [__t.failed('odo') && /stand next to the beacon/.test(__t.last('odo')), __t.last('odo')]; });
  await check('signal() beside the lit beacon: worked, two militia come', async () => { const o = __t.beacon(), g = __t.agent('odo'), c = tablefolkPackages.api().freeCell(o.x, o.z + 1, 3); __t.put(g, c.x, c.z); await tablefolk.runAs('odo', 'signal()', 'test'); await __t.sleep(2500); const mil = tablefolk.getAgents().filter(a => /^militia/.test(a.id)); return [!__t.failed('odo') && mil.length === 2 && tablefolkStory.get('militia_called') === true, `${__t.last('odo')} | militia ${mil.map(m => m.id + ':' + m.charModel)}`]; });
  await check('signal() again the same night: FAILED', async () => { await tablefolk.runAs('odo', 'signal()', 'test'); return [__t.failed('odo') && /already on its way/.test(__t.last('odo')), __t.last('odo')]; });
  await check('the player has it as /signal', () => [tablefolkSkills.mayUse(tablefolk.getPlayerAvatar(), 'signal'), '']);

  // kindle(): a data skill command using the module's effect
  await check('kindle() (skill command -> module effect) adds fuel', async () => { const o = __t.beacon(), was = __t.mm(o).opts.fuel; tablefolkPackages.api().give(__t.agent('odo'), 'firewood'); await tablefolk.runAs('odo', 'kindle()', 'test'); const now = __t.mm(o).opts.fuel; return [now > was && !__t.failed('odo'), `${was} -> ${now}: ${__t.last('odo')}`]; });

  // use: the player's E (code use) feeds it, then douses it; the card turns urgent
  await check('use: the player feeds a log (code use, object state, user clip)', async () => { const o = __t.beacon(), p = tablefolk.getPlayerAvatar(), was = __t.mm(o).opts.fuel; const c = tablefolkPackages.api().freeCell(o.x + 1, o.z, 3); __t.put(p, c.x, c.z); if (!tablefolk.findItem(tablefolk.state.player.items, 'firewood')) tablefolkPackages.api().give(p, 'firewood'); const r = await tablefolkPackages.useThing(o.mesh, p); return [r === true && __t.mm(o).opts.fuel > was && (p._clipsPlayed || []).includes('pickup') || p.rigMode === 'pickup', `fuel ${was} -> ${__t.mm(o).opts.fuel}, clips ${p._clipsPlayed}`]; });
  await check('use: with no firewood the player douses it', async () => { const o = __t.beacon(), p = tablefolk.getPlayerAvatar(); while (tablefolkPackages.api().take(p, 'firewood')); await tablefolkPackages.useThing(o.mesh, p); await __t.sleep(1600); return [__t.mm(o).state === 'out' && tablefolkStory.get('beacon_lit') === false && !tablefolk.state.scene.particleSystems.some(p => p.name === 'nw_flame'), __t.mm(o).state]; });
  await check('card line turns urgent when it is out', () => { const l = tablefolkSkills.urgentLines(__t.agent('odo')); return [l.some(x => /beacon is OUT/.test(x)), l.join(' | ')]; });

  // the threat: the package's body, sound and behaviour
  await check('wolfpack: dire wolves from the package body', async () => { window.__gr = await tablefolkThreats.now('wolfpack'); await __t.sleep(2500); const w = __t.agent(__gr.ids[0]); return [__gr.ids.length === 3 && w.charModel === 'dire_wolf' && Math.abs(w.height - .95) < .01 && tablefolkPlay.isHostile(w) && tablefolk.getBrainConfig(w.id).maxHp === 8, `${__gr.ids} h ${w.height} hp ${tablefolk.getBrainConfig(w.id).maxHp}`]; });
  await check('body clip map: idle, walk, attack, death, howl from the file', () => { const w = __t.agent(__gr.ids[0]), r = w.rigAnims; return [r.Idle_A && r.Walking_A && r.Melee_1H_Attack_Chop && r.Death_A && r.howl && /Idle_2/.test(r.howl.name), Object.keys(r).filter(k => /^[a-z]/.test(k)).join(',')]; });
  await check('the threat\'s sound asked for (package "howl")', () => [tablefolkSfx.requested.some(x => x.name === 'howl'), tablefolkSfx.requested.map(x => x.name).join(',')]);
  await check('emote(howl) and emote(howl, loop) play the body\'s clip', async () => { const id = __gr.ids[1], w = __t.agent(id); const c = tablefolk.parseLLMCommandLine('emote(howl, loop)'); const once = tablefolkBodies.emote(w, 'howl'); await __t.sleep(100); const looped = tablefolkBodies.emote(w, 'howl', true); return [once && looped && c.loop === true && w.rigMode === 'clip_howl' && w.activeRigAnim?.loopAnimation, `cmd ${JSON.stringify(c)} mode ${w.rigMode}`]; });
  await check('beacon out: the pack falls back to raiding (behaviour returns false)', async () => { const w = __t.agent(__gr.ids[0]); const r = await tablefolkThreats.turn(w); return [r === false || __gr.closing === true, `turn -> ${r}, closing ${__gr.closing}`]; });
  await check('beacon lit: the pack circles (the module\'s behaviour ran)', async () => { const o = __t.beacon(), p = tablefolk.getPlayerAvatar(); tablefolkPackages.api().give(p, 'firewood'); await tablefolkPackages.useThing(o.mesh, p); const before = __gr.circled || 0; for (const id of __gr.ids) await tablefolkThreats.turn(__t.agent(id)); return [__t.mm(o).state === 'lit' && (__gr.circled || 0) >= before + 3 && __gr.customRuns > 0, `circled ${before} -> ${__gr.circled}`]; });

  // the keeper's job: woodpile stock runs down, the beacon is refuelled
  await check('job: the keeper fetches firewood and refuels (stock down, fuel up)', async () => {
    const o = __t.beacon(), odo = __t.agent('odo'), pile = tablefolk.getObjects().filter(x => x.type === 'woodpile').map(x => tablefolkUses.stockOf(x)).reduce((a, s) => a + (s?.left || 0), 0);
    while (tablefolkPackages.api().take(odo, 'firewood'));
    __t.mm(o).opts.fuel = 1.5; tablefolkStory.set('beacon_fuel', 2);
    for (const id of __gr.ids) { const w = __t.agent(id); if (w) { tablefolk.getBrainConfig(id).defeated = true; w.defeated = true; } }
    const fuel0 = __t.mm(o).opts.fuel, ticks0 = odo._job?.ticks || 0;
    let pile1 = pile, fuel1 = fuel0;
    // ?art=1 has no brain, and live.js waits for one: the test runs the keeper's job ticks itself
    for (let i = 0; i < 90; i++) { const r = await tablefolkJobs.tick(odo); await __t.sleep(Math.min(1500, Math.max(300, r?.ms || 800))); pile1 = tablefolk.getObjects().filter(x => x.type === 'woodpile').map(x => tablefolkUses.stockOf(x)).reduce((a, s) => a + (s?.left || 0), 0); fuel1 = __t.mm(o).opts.fuel; if (pile1 < pile && fuel1 > fuel0) break; }
    return [pile1 < pile && fuel1 > fuel0 && (odo._job?.ticks || 0) > ticks0, `woodpile ${pile} -> ${pile1}, fuel ${fuel0} -> ${fuel1}, ticks ${ticks0} -> ${odo._job?.ticks}, doing "${odo._job?.doing}"`];
  });

  // the keeper signals by rule, the militia defend the beacon, signal() is offered in picks
  await check('rule: the keeper signals by code when wolves are near and the beacon is lit (job "commands" rule)', async () => {
    const o = __t.beacon(), odo = __t.agent('odo'), k = tablefolkClock.now(); tablefolkClock.set(k.min, k.day + 1); tablefolkStory.set('militia_called', false);
    if (__t.mm(o).state !== 'lit') { const p = tablefolk.getPlayerAvatar(); tablefolkPackages.api().give(p, 'firewood'); await tablefolkPackages.useThing(o.mesh, p); }
    window.__gr2 = await tablefolkThreats.now('wolfpack'); await __t.sleep(2500);
    const w = __t.agent(__gr2.ids[0]), c = tablefolkPackages.api().freeCell(o.x + 4, o.z, 3); __t.put(w, c.x, c.z);
    const n0 = tablefolk.getAgents().filter(a => /^militia/.test(a.id)).length;
    for (let i = 0; i < 30 && !tablefolkStory.get('militia_called'); i++) { const r = await tablefolkJobs.tick(odo); await __t.sleep(Math.min(1200, Math.max(300, r?.ms || 600))); }
    await __t.sleep(2500);
    const n1 = tablefolk.getAgents().filter(a => /^militia/.test(a.id)).length;
    return [tablefolkStory.get('militia_called') === true && n1 === n0 + 2, `militia ${n0} -> ${n1}, odo "${odo._job?.doing}" last ${__t.last('odo')}`];
  });
  await check('offer: signal() is offered to the keeper in a pick when it would work (module offer)', async () => {
    const k = tablefolkClock.now(); tablefolkClock.set(k.min, k.day + 1);
    const o = __t.beacon(), odo = __t.agent('odo'), c = tablefolkPackages.api().freeCell(o.x, o.z + 1, 3); __t.put(odo, c.x, c.z);
    const offs = tablefolkSkills.offers(odo), wren = tablefolkSkills.offers(__t.agent('wren'));
    return [offs.some(x => x.name === 'signal' && x.line === 'signal()') && !wren.some(x => x.name === 'signal') && tablefolkJobs.offers(odo).length > 0, JSON.stringify(offs)];
  });
  await check('defends: the militia keep to the beacon and take on wolves near it', async () => {
    const o = __t.beacon(), m = tablefolk.getAgents().find(a => /^militia/.test(a.id) && !a.defeated), j = tablefolkJobs.jobOf(m);
    const far = tablefolkPackages.api().freeCell(o.x + 9, o.z + 2, 3); __t.put(m, far.x, far.z);
    for (const id of __gr2.ids) { const w = __t.agent(id); if (w) __t.put(w, o.x - 14, o.z - 14); }
    const trace = [];
    for (let i = 0; i < 12; i++) { const r = await tablefolkJobs.tick(m); const q = m.logicalPos || m.root.position; trace.push(`${q.x.toFixed(0)},${q.z.toFixed(0)}:${r?.ms}${m.turnMove ? 'm' : ''}`); await __t.sleep(Math.min(1500, Math.max(300, r?.ms || 600))); }
    window.__dtrace = trace.join(' ') + ' from ' + far.x + ',' + far.z + ' beacon ' + o.x + ',' + o.z + ' raiders ' + tablefolkThreats.active().map(r => r.id).join(',');
    const p = m.logicalPos || m.root.position, d = Math.hypot(p.x - o.x, p.z - o.z);
    return [j?.id === 'militia' && j.defends === 'signal_beacon' && d <= 4.5 && /guarding|defending/.test(m._job?.doing || ''), `job ${j?.id} defends ${j?.defends}, ${d.toFixed(1)} cells from the beacon, "${m._job?.doing}" ${window.__dtrace}`];
  });
  await check('goal predicate from the module: beacon_burning', () => [typeof tablefolkPackages.goals.beacon_burning === 'function' && tablefolkPackages.goals.beacon_burning(true) === (__t.mm(__t.beacon()).state === 'lit'), Object.keys(tablefolkPackages.goals).join(',')]);
  await check('package lines: the Night Watch\'s pools are added (chatter.js)', () => [tablefolkChatter.pools.packages.some(p => p.from === 'nightwatch' && p.pools.raid_fighter), tablefolkChatter.pools.packages.map(p => p.from).join(',')]);
  await page.evaluate(() => { for (const id of window.__gr2?.ids || []) { const w = __t.agent(id); if (w) { tablefolk.getBrainConfig(id).defeated = true; w.defeated = true; } } }).catch(() => {});

  // the goal: two nights with the keeper alive, by moving the clock on
  await check('goal: survive two nights with odo alive (clock advanced)', async () => { tablefolkClock.set(6 * 60 + 30, 3); for (let i = 0; i < 20 && !tablefolkScenario.active.ended; i++) await __t.sleep(300); return [tablefolkScenario.active.ended && tablefolkScenario.active.result === true, `ended ${tablefolkScenario.active.ended} result ${tablefolkScenario.active.result} clock ${JSON.stringify(tablefolkClock.now())}`]; });

  // ---------------------------------------------------------------- 2. the documented options, on fixtures
  say('2. fixtures: loop, use fields, requires, package workflows, module cards and effects');
  const r2 = await page.evaluate(async () => window.__t.play({ title: 'package options', brain: 'none', size: [11, 11], packages: [location.origin + '/tools/browser-test/fixtures/pkg-extra/'],
    agents: [{ id: 'fixa', model: 'peasant', at: [0, -2], skills: ['fx_skill'], allowed: ['say', 'walk', 'workflow'], personality: 'a test' }],
    objects: [{ type: 'music_box', x: 2, z: 0 }, { type: 'dep_crate', x: -2, z: 0 }], player: { at: [1, 1], items: [] } }, null));
  await check('fixtures load cleanly', a => [!a.warnings.some(w => /^error|failed|not run|no such/i.test(w)), a.warnings.join(' | ')], r2);
  await check('requires: the required package\'s item (relative path)', () => [!!tablefolkPacks.items.dep_crate && tablefolk.getObjects().some(o => o.type === 'dep_crate'), Object.keys(tablefolkPacks.items).filter(k => /dep|music/.test(k)).join(',')]);
  await check('loop: the model\'s clip plays from the start', async () => { await __t.sleep(800); const o = tablefolk.getObjects().find(x => x.type === 'music_box'), a = __t.mm(o)?.anims || []; return [a.some(g => g.isPlaying && /Idle/.test(g.name)), a.filter(g => g.isPlaying).map(g => g.name).join(',')]; });
  await check('use data: anim, who, give, gold, state, sound', async () => { const o = tablefolk.getObjects().find(x => x.type === 'music_box'), p = tablefolk.getPlayerAvatar(), gold = tablefolk.state.player.gold || 0; const r = await tablefolkPackages.useThing(o.mesh, p); await __t.sleep(200); const a = __t.mm(o).anims || []; return [r === true && tablefolk.findItem(tablefolk.state.player.items, 'silver coin') && tablefolk.state.player.gold === gold + 2 && __t.mm(o).state === 'played' && a.some(g => g.isPlaying && /Jump/.test(g.name)) && tablefolkSfx.requested.some(x => x.name === 'chime') && ((p._clipsPlayed || []).includes('pickup') || p.rigMode === 'pickup'), `gold ${gold} -> ${tablefolk.state.player.gold}, state ${__t.mm(o).state}, playing ${a.filter(g => g.isPlaying).map(g => g.name)}`]; });
  await check('use data: once (a second use does nothing)', async () => { const o = tablefolk.getObjects().find(x => x.type === 'music_box'), gold = tablefolk.state.player.gold; const r = await tablefolkPackages.useThing(o.mesh, tablefolk.getPlayerAvatar()); return [r === false && tablefolk.state.player.gold === gold, `-> ${r}`]; });
  await check('a character uses it too (use() by a character: "once" already spent)', async () => { const g = __t.agent('fixa'), o = tablefolk.getObjects().find(x => x.type === 'music_box'); __t.put(g, o.x - 1, o.z); await tablefolk.runAs('fixa', 'use(music_box)', 'test'); await __t.sleep(400); return [__t.failed('fixa') || /already|nothing/i.test(__t.last('fixa')), __t.last('fixa')]; });
  await check('module card named by a package skill', () => { const l = tablefolkSkills.cardLines(__t.agent('fixa')); return [l.includes('fixture card for fixa'), l.join(' | ')]; });
  await check('module effect used by a package skill\'s command', async () => { await tablefolk.runAs('fixa', 'fx()', 'test'); return [tablefolkStory.get('fx_effect') === 2 && /fixture effect/.test(__t.last('fixa')), __t.last('fixa')]; });
  await check('offers: a data command with when/offer and a module command with offer()', async () => { const g = __t.agent('fixa'); const none = tablefolkSkills.offers(g).length; tablefolkStory.set('fx_offer_on', true); const o = tablefolkSkills.offers(g); return [none === 0 && o.some(x => x.name === 'fx' && x.label === 'do the fixture thing') && o.some(x => x.name === 'fx_code' && /fixture code command, fixa/.test(x.label)), JSON.stringify(o)]; });
  await check('a skill\'s cue starts a workflow ("on": player-chat)', async () => { dispatchEvent(new CustomEvent('tablefolk-player-chat', { detail: { agentId: 'fixa', text: 'hello' } })); for (let i = 0; i < 20 && !tablefolkStory.get('fx_cue_ran'); i++) await __t.sleep(200); return [tablefolkStory.get('fx_cue_ran') === true, __t.last('fixa')]; });
  await check('module goal predicate in a scenario goal', () => { tablefolkStory.set('fx_count', 3); return [tablefolkPackages.goals.fx_goal(3) === true && tablefolkPackages.goals.fx_goal(4) === false, '']; });
  await check('package lines reach the pools', () => [tablefolkChatter.pools.packages.some(p => p.pools.greet?.any?.includes('Fixture hello, {name}.')), '']);
  await check('package workflow runs (do: reply, anim, sound)', async () => { tablefolkWorkflows.start('fixa', 'fx_flow'); await tablefolkWorkflows.drive('fixa'); await __t.sleep(500); return [tablefolkStory.get('fx_flow_ran') === true && /fixture workflow ran/.test(__t.last('fixa')), __t.last('fixa')]; });
  await check('reset: the Night Watch\'s things are gone in another scenario', () => [!tablefolkPacks.items.signal_beacon && !tablefolkBodies.list().includes('dire_wolf') && !tablefolkSkills.packageCommands.signal && !tablefolkSfx.names.includes('howl') && !tablefolkJobs.registry.has('beacon_keeper'), '']);

  // ---------------------------------------------------------------- 3. from another origin: the trust question
  say(`3. the Night Watch from ${ORIGIN2}: data only, then allowed`);
  const scn2 = async () => page.evaluate(async o2 => { const s = await (await fetch('/scenarios/nightwatch.json?t=' + Date.now())).json(); s.brain = 'none'; s.packages = [o2 + '/packages/nightwatch/']; delete s.triggers; return s; }, ORIGIN2);
  const s2 = await scn2();
  const r3 = await page.evaluate(s => window.__t.play(s, 'deny'), s2);
  await check('asked once: "Run code from a package?"', a => [a.asked.length === 1 && /package/.test(a.asked[0]), a.asked.join(', ')], r3);
  await check('declined: data loads (items from the other origin, body, sound, job, threat kind)', () => [/:8014\//.test(tablefolkPacks.items.signal_beacon?.url || '') && tablefolkBodies.list().includes('dire_wolf') && tablefolkSfx.names.includes('howl') && tablefolkJobs.registry.has('beacon_keeper') && !!tablefolkThreats.KINDS.wolfpack, tablefolkPacks.items.signal_beacon?.url]);
  await check('declined: no code (no signal(), no beacon fire)', () => [!tablefolkSkills.packageCommands.signal && !tablefolk.state.scene.particleSystems.some(p => p.name === 'nw_flame' && p.isStarted()) && tablefolkPackages.dataOnly.has('nightwatch'), Object.keys(tablefolkSkills.packageCommands).join(',')]);
  await check('declined: said plainly (warning and toast)', (a) => { const t = [...document.querySelectorAll('.toast, .tf-toast, [class*=toast]')].map(x => x.textContent).join(' | '); return [a.warnings.some(w => /data only/.test(w)) && /code was not run/.test(t), t.slice(0, 200)]; }, r3);
  await check('declined: using the beacon says it needs code', async () => { const o = __t.beacon(), r = await tablefolkPackages.useThing(o.mesh, tablefolk.getPlayerAvatar()); const t = [...document.querySelectorAll('[class*=toast]')].map(x => x.textContent).join(' | '); return [r === false && /needs its package's code/.test(t), t.slice(-160)]; });
  await check('declined: not remembered', () => [!tablefolkPackages.allowedList().some(s => s.includes(':8014')), JSON.stringify(tablefolkPackages.allowedList())]);
  const r4 = await page.evaluate(s => window.__t.play(s, 'allow'), await scn2());
  await check('asked again, allowed: the code runs from the other origin', a => [a.asked.length === 1 && !!tablefolkSkills.packageCommands.signal && /:8014\//.test(tablefolkSkills.packageCommands.signal._from) && __t.mm(__t.beacon()).state === 'lit', `${a.asked} from ${tablefolkSkills.packageCommands.signal?._from}`], r4);
  await check('allowed: remembered for that folder (the Library pane lists it)', () => [tablefolkPackages.allowedList().some(s => /:8014\/packages\/nightwatch\/$/.test(s)), JSON.stringify(tablefolkPackages.allowedList())]);
  const r5 = await page.evaluate(async s => window.__t.play(s, 'deny'), await scn2());
  await check('allowed: not asked the third time', a => [a.asked.length === 0 && !!tablefolkSkills.packageCommands.signal, a.asked.join(',')], r5);
  await page.evaluate(() => { for (const s of tablefolkPackages.allowedList()) tablefolkPackages.untrust(s); });
  await check('revoked: the list is empty again', () => [tablefolkPackages.allowedList().length === 0, '']);

  // a skill's own module from another site asks the same way (B)
  const r6 = await page.evaluate(o2 => window.__t.play({ title: 'skill trust', brain: 'none', size: [9, 9], skills: [o2 + '/skills/bard/'], agents: [{ id: 'lute', model: 'peasant', at: [0, -2], skills: [o2 + '/skills/bard/'], personality: 'a bard' }] }, 'deny'), ORIGIN2);
  await check('skill code from another site: asked, "data only" works as data', a => [a.asked.length === 1 && /skill/.test(a.asked[0]) && a.warnings.some(w => /skill bard: its code .* not run/.test(w)) && tablefolkSkills.registry.has('bard') && !tablefolkSkills.registry.get('bard').api, `${a.asked} | ${a.warnings.filter(w => /bard/.test(w))}`], r6);

  // ---------------------------------------------------------------- 4. references
  say('4. reference mapping');
  await check('npm: and gh: references map to jsDelivr URLs', () => {
    const R = tablefolkPackages.refUrl, want = {
      'npm:tablefolk-smithy@1.2.0|package': 'https://cdn.jsdelivr.net/npm/tablefolk-smithy@1.2.0/tablefolk.json',
      'npm:@you/tablefolk-pack@2/pack|pack': 'https://cdn.jsdelivr.net/npm/@you/tablefolk-pack@2/pack/pack.json',
      'gh:user/repo@v1.0/smithy|package': 'https://cdn.jsdelivr.net/gh/user/repo@v1.0/smithy/tablefolk.json',
      'gh:user/repo|skill': 'https://cdn.jsdelivr.net/gh/user/repo@main/skill.json',
      'https://example.com/pkgs/x/|package': 'https://example.com/pkgs/x/tablefolk.json',
      'https://example.com/a/role.json|role': 'https://example.com/a/role.json',
      'Smithy|package': location.origin + '/packages/smithy/tablefolk.json' };
    const bad = Object.entries(want).map(([k, v]) => { const [ref, kind] = k.split('|'); return R(ref, kind) === v ? null : `${ref}: ${R(ref, kind)}`; }).filter(Boolean);
    return [!bad.length, bad.join(' | ')];
  });
  await check('Library pane: npm results keep only Tablefolk content (never the @tablefolk/* libraries); packs as URLs', () => {
    const R = tablefolkRegistry; const pk = [{ name: '@tablefolk/brain', keywords: ['tablefolk', 'tablefolk-package'] }, { name: 'tablefolk-ores', keywords: ['tablefolk', 'tablefolk-package'] }, { name: 'random-thing', keywords: ['tablefolk'] }, { name: 'tablefolk-trees', keywords: ['tablefolk', 'tablefolk-pack'] }];
    const kept = pk.filter(R.isContent).map(p => p.name), pack = R.entry('pack', 'npm:tablefolk-trees@1.0.0', {});
    return [kept.join() === 'tablefolk-ores,tablefolk-trees' && pack.ref === 'https://cdn.jsdelivr.net/npm/tablefolk-trees@1.0.0/pack.json', `${kept} ${pack.ref}`];
  });
} catch (e) {
  results.push(false); console.log('FAIL the test itself: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' '));
} finally {
  await page.evaluate(() => { try { localStorage.removeItem('tablefolkTrustedCode'); } catch {} }).catch(() => {});
  server2.close(); await b.close().catch(() => {});
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(passed === results.length ? 0 : 1);
