// Worlds in sections, end to end, no language model ("brain": "none", ?art=1):
// fixtures/sections/top.json (a crossroads with stairs down to a cellar and a
// deep cellar under it, an edge east to a field, a gate to another scenario
// file, a cave built by procgen, a locked trapdoor, a way to a missing file)
// and the showcase worlds that use sections (deepdelve-camp, hearthvale).
// Drives the player through the documented API (tablefolkScenario.travel,
// playerStep at the rim, standing on a link's square) and checks: each link
// kind in and out, state kept per section (an object moved, a chest emptied,
// a rat defeated), two deep, a reload mid-section, flags and the clock carry,
// the goal from inside a section, a locked link needs its key, explored
// squares kept, a follower crosses, the catch-up puts a worker in bed at night.
//
//   bun server/server.js 8003
//   TEST_PROFILE=~/.cache/tablefolk-sections-chrome TEST_CDP_PORT=9231 HEADLESS=1 ./launch-chrome.sh "http://localhost:8003/app/?art=1"
//   CDP_PORT=9231 BASE=http://localhost:8003 node sections-test.mjs      ok/FAIL lines; exits 1 on a failure
// SHOTS=dir saves a few canvas pictures there.
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || '';
const results = [];
const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' -- ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
const FIX = '../tools/browser-test/fixtures/sections/top.json';
const HELP = () => {
  window.__s = {
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    W: () => window.tablefolk, S: () => window.tablefolkScenario,
    av: () => window.tablefolk.getPlayerAvatar(),
    put(x, z) { setCharacterLogicalPosition(this.av(), new BABYLON.Vector3(x, 0, z)); },
    putAgent(id, x, z) { const g = window.tablefolk.getAgents().find(a => a.id === id); if (g) setCharacterLogicalPosition(g, new BABYLON.Vector3(x, 0, z)); return !!g; },
    cell() { const p = this.av().logicalPos || this.av().root.position; return [Math.round(p.x), Math.round(p.z)]; },
    curtainDown: () => !(+(document.getElementById('sectionCurtain')?.style.opacity || 0) > .5),
    async waitSection(id, ms = 25000) { const t = Date.now(); while (Date.now() - t < ms) { if (this.S().section === id && this.curtainDown() && this.av()) { await this.sleep(400); return true; } await this.sleep(100); } return false; },
    // walk onto a link's square from the one beside it
    async onto(x, z, from) { this.put(...from); await this.sleep(400); this.put(x, z); },
    agents: () => window.tablefolk.getAgents().map(g => g.id),
    obj: type => window.tablefolk.getObjects().find(o => o.type === type),
    toasts: () => [...document.querySelectorAll('.toast, .tf-toast, [class*=toast]')].map(e => e.textContent).join(' | '),
  };
  return true;
};
async function shot(name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const url = await page.evaluate(() => { const sc = BABYLON.EngineStore.LastCreatedScene, e = sc.getEngine(); e.beginFrame(); sc.render(); e.endFrame(); return e.getRenderingCanvas().toDataURL('image/jpeg', .85); });
  fs.writeFileSync(`${SHOTS}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  say('shot ' + name);
}
const ev = (fn, arg) => page.evaluate(fn, arg);
async function open(url) {
  await page.goto(url);
  await page.waitForFunction(() => window.tablefolk?.ready && window.tablefolkScenario?.active && window.tablefolk.getPlayerAvatar?.(), null, { timeout: 90000 });
  await ev(HELP);
  await page.waitForTimeout(1200);
}

try {
  say('opening the crossroads');
  await page.goto(`${BASE}/app/?art=1`);
  await page.waitForFunction(() => window.tablefolk?.ready, null, { timeout: 90000 });
  await ev(() => { localStorage.removeItem('tablefolkJourney'); localStorage.setItem('tablefolkTtsEnabled', '0'); });
  await open(`${BASE}/app/?art=1&scenario=${FIX}`);
  check('starts on the top map', await ev(() => window.tablefolkScenario.section === '' && window.tablefolkScenario.active.scn.title === 'Crossroads'));
  check('markers for stairs, gate, cave, trapdoor and the edge', await ev(() => ['link_stairs_down_', 'link_gate_', 'link_cave_', 'link_trapdoor_', 'link_edge_', 'link_edge_arrow'].every(n => window.tablefolk.state.scene.meshes.some(m => m.name.startsWith(n) && !m.isDisposed()))));
  const clock0 = await ev(() => ({ ...window.tablefolk.state.clock }));

  // ---- stairs down, a follower comes along ----
  await ev(() => __s.putAgent('mara', 1, -2));
  await ev(() => __s.onto(0, -3, [0, -2]));
  check('stairs down into the cellar', await ev(() => __s.waitSection('cellar')));
  check('the companion came along', await ev(() => __s.agents().includes('mara') && __s.agents().includes('rat1')), await ev(() => __s.agents()));
  check('the stairs up back is there', await ev(() => window.tablefolk.state.scene.meshes.some(m => m.name.startsWith('link_stairs_up_') && !m.isDisposed())));
  await shot('cellar');
  // change things here: take the key from the chest, move the barrel, defeat the rat, set a flag
  await ev(async () => {
    const W = window.tablefolk, ch = __s.obj('chest'), c = tablefolkUses.contents(ch.mesh);
    W.state.player.items.push(...c.items.splice(0)); W.inventoryChanged();
    const br = __s.obj('barrel'); W.disposeWorldObject(br.mesh); W.makeObject('barrel', -4, -2);
    const rat = W.getAgents().find(g => g.id === 'rat1'); window.tablefolkCombat.defeat(rat, 'test');
    window.tablefolkStory.set('visited_cellar', true);
    return true;
  });
  // ---- nested: deeper ----
  await ev(() => __s.onto(-3, -3, [-3, -2]));
  check('two deep: the deep cellar', await ev(() => __s.waitSection('cellar/deep')) && await ev(() => __s.S().journey.stack.length === 2), await ev(() => __s.S().journey.stack.map(f => f.id)));
  check('the deep cellar has a way back made for it', await ev(() => __s.S().sections().find(s => s.id === 'cellar/deep').links.some(l => l.to === 'back')));
  await ev(() => __s.S().travel({ to: 'back' }));
  check('back up to the cellar', await ev(() => __s.waitSection('cellar')));
  const kept = await ev(() => ({ chest: tablefolkUses.contents(__s.obj('chest').mesh).items.length, barrel: [Math.round(__s.obj('barrel').x), Math.round(__s.obj('barrel').z)], rat: !!window.tablefolk.getBrainConfig('rat1').defeated, ratDown: !!window.tablefolk.getAgents().find(g => g.id === 'rat1')?.defeated, flag: window.tablefolkStory.get('visited_cellar') }));
  check('the cellar kept its state (chest empty, barrel moved, rat defeated)', kept.chest === 0 && kept.barrel.join() === '-4,-2' && kept.rat && kept.ratDown, kept);

  // ---- a reload in the middle of a section ----
  await ev(() => __s.S().saveJourney());
  await page.reload();
  await page.waitForFunction(() => window.tablefolk?.ready && window.tablefolkScenario?.active && window.tablefolkScenario.section === 'cellar', null, { timeout: 90000 });
  await ev(HELP); await page.waitForTimeout(1500);
  const after = await ev(() => ({ section: __s.S().section, chest: tablefolkUses.contents(__s.obj('chest').mesh).items.length, barrel: [Math.round(__s.obj('barrel').x), Math.round(__s.obj('barrel').z)], rat: !!window.tablefolk.getBrainConfig('rat1').defeated, key: !!window.tablefolk.state.player.items.find(i => /brass key/.test(i.name)), flag: window.tablefolkStory.get('visited_cellar'), top: Object.keys(__s.S().journey.states), mara: __s.agents().includes('mara') }));
  check('reloaded: back in the cellar, everything as it was', after.section === 'cellar' && after.chest === 0 && after.barrel.join() === '-4,-2' && after.rat && after.key && after.flag === true && after.top.includes('') && after.mara, after);
  await ev(() => { const [x, z] = __s.cell(); __s.putAgent('mara', x + 1, z); __s.S().travel({ to: 'back' }); });
  check('up the stairs to the top', await ev(() => __s.waitSection('')));
  const top = await ev(() => ({ cell: __s.cell(), agents: __s.agents(), flag: window.tablefolkStory.get('visited_cellar'), clock: { ...window.tablefolk.state.clock } }));
  check('arrived by the stairs, the top map as left (mara came back too)', top.cell.join() === '0,-3' && top.agents.includes('pip') && top.agents.includes('odo') && top.agents.includes('mara'), top);
  check('flags carry across sections', top.flag === true);
  check('one clock: it kept running', top.clock.day > clock0.day || top.clock.min >= clock0.min, { before: clock0, after: top.clock });

  // ---- a locked link needs its key ----
  await ev(() => { const it = window.tablefolk.state.player.items; window.__key = it.splice(it.findIndex(i => /brass key/.test(i.name)), 1)[0]; });
  await ev(() => __s.onto(-4, -3, [-4, -2]));
  await page.waitForTimeout(900);
  check('the locked trapdoor stays shut without the key', await ev(() => __s.S().section === ''));
  await ev(() => { window.tablefolk.state.player.items.push(window.__key); });
  await ev(() => __s.onto(-4, -3, [-4, -2]));
  check('with the brass key it opens: the vault', await ev(() => __s.waitSection('vault')));
  await ev(() => __s.S().travel({ to: 'back' })); await ev(() => __s.waitSection(''));

  // ---- the edge: walk off the east rim ----
  await ev(() => { const Wd = window.tablefolk.WORLD; __s.put(-(Wd.halfW - 1), 2); });
  await page.waitForTimeout(400);
  await ev(() => playerStep(new BABYLON.Vector3(-1, 0, 0)));
  check('walking off the east edge: the east field', await ev(() => __s.waitSection('field')));
  const fieldIn = await ev(() => ({ cell: __s.cell(), west: window.tablefolk.WORLD.halfW - 1, explored: window.tablefolkDark.exploredCount(), mode: window.tablefolkDark.mode() }));
  check('arrived on the field\'s west rim at the same row', fieldIn.cell[0] === fieldIn.west && fieldIn.cell[1] === 2, fieldIn);
  check('the field reveals as you go (cells, outdoors: the mist)', fieldIn.mode.reveal === 'cells' && fieldIn.explored > 0 && await ev(() => window.tablefolk.state.scene.meshes.some(m => m.name === 'board_mist_low' && m.isEnabled())), fieldIn);
  check('the crown out in the unexplored is hidden', await ev(() => !__s.obj('crown').mesh.isEnabled()));
  await shot('field-mist');
  await ev(async () => { for (const [x, z] of [[4, 2], [2, 0], [0, -2]]) { __s.put(x, z); await __s.sleep(350); } });
  const explored1 = await ev(() => window.tablefolkDark.exploredCount());
  await ev(() => { const Wd = window.tablefolk.WORLD; __s.put(Wd.halfW - 1, 2); });
  await page.waitForTimeout(400);
  await ev(() => playerStep(new BABYLON.Vector3(1, 0, 0)));
  check('walking off the west edge goes back', await ev(() => __s.waitSection('')));
  check('back on the top map\'s east rim', await ev(() => __s.cell()[0] === -(window.tablefolk.WORLD.halfW - 1)), await ev(() => __s.cell()));
  await ev(() => { const Wd = window.tablefolk.WORLD; __s.put(-(Wd.halfW - 1), 2); });
  await page.waitForTimeout(300);
  await ev(() => playerStep(new BABYLON.Vector3(-1, 0, 0)));
  await ev(() => __s.waitSection('field'));
  check('the field kept what was explored', await ev(n => window.tablefolkDark.exploredCount() >= n, explored1), { before: explored1, now: await ev(() => window.tablefolkDark.exploredCount()) });

  // ---- the goal completes from inside a section ----
  await ev(() => { window.tablefolk.state.player.items.push({ name: 'crown', qty: 1 }); });
  await page.waitForTimeout(1200);
  check('the goal is checked in a section (won in the field)', await ev(() => window.tablefolkScenario.active.ended && window.tablefolkScenario.active.result === true));
  await ev(() => { const a = window.tablefolkScenario.active; a.ended = false; a.result = null; window.tablefolk.state.player.items = window.tablefolk.state.player.items.filter(i => i.name !== 'crown'); document.getElementById('scenarioEnd').hidden = true; });
  await ev(() => __s.S().travel({ to: 'back' })); await ev(() => __s.waitSection(''));

  // ---- another scenario file ----
  await ev(() => __s.onto(4, 3, [4, 2]));
  await ev(async () => { for (let i = 0; i < 150 && !/^~x/.test(__s.S().section); i++) await __s.sleep(100); });
  check('a gate to another scenario file (fetched)', await ev(() => __s.waitSection(__s.S().section)) && await ev(() => /^~x/.test(__s.S().section) && __s.agents().includes('hermit')), await ev(() => [__s.S().section, __s.agents()]));
  await ev(() => __s.S().travel({ to: 'back' })); await ev(() => __s.waitSection(''));
  // ---- a failed fetch leaves the player where they are ----
  await ev(() => __s.onto(6, 1, [6, 2]));
  await page.waitForTimeout(2500);
  check('a way to a missing file: the player stays, with a message', await ev(() => __s.S().section === '' && !!__s.av() && __s.curtainDown()));

  // ---- a generated section ----
  await ev(() => __s.onto(-4, 3, [-4, 2]));
  const gid = await ev(async () => { await __s.sleep(300); for (let i = 0; i < 200 && !/~g/.test(__s.S().section); i++) await __s.sleep(100); await __s.sleep(800); return __s.S().section; });
  const cave = await ev(() => ({ walls: window.tablefolk.state.blocks.length, gen: !!window.tablefolkScenario.here()?._gen }));
  check('a cave built by procgen on first entry', /~g/.test(gid) && cave.walls > 20 && cave.gen, { gid, ...cave });
  await shot('generated-cave');
  const caveSig = await ev(() => window.tablefolk.state.blocks.length);
  await ev(() => __s.S().travel({ to: 'back' })); await ev(() => __s.waitSection(''));
  await ev(() => __s.onto(-4, 3, [-4, 2]));
  await ev(id => __s.waitSection(id), gid);
  check('the generated cave is the same one on return', await ev(n => window.tablefolk.state.blocks.length === n, caveSig));
  await ev(() => __s.S().travel({ to: 'back' })); await ev(() => __s.waitSection(''));

  // ---- time passes elsewhere: the catch-up ----
  await ev(() => __s.onto(0, -3, [0, -2]));
  await ev(() => __s.waitSection('cellar'));
  await ev(() => window.tablefolkClock.set(23 * 60, window.tablefolk.state.clock.day));
  await ev(() => __s.S().travel({ to: 'back' }));
  await ev(() => __s.waitSection(''));
  await page.waitForTimeout(800);
  const odo = await ev(() => ({ pose: window.tablefolk.getAgents().find(g => g.id === 'odo')?.pose?.mode || null, report: window.tablefolkSections.lastCatchUp }));
  check('catch-up: the farmer is in bed at 23:00', odo.pose === 'lie', odo);

  // ---- the map card ----
  await ev(() => window.tablefolkSections.showMap(window.tablefolkScenario.sections()));
  check('the map lists the sections, the current one marked', await ev(() => { const t = document.getElementById('sectionMap')?.textContent || ''; return /you are here/.test(t) && /The Cellar/.test(t) && /The East Field/.test(t); }));
  await ev(() => window.tablefolkSections.hideMap());

  // ---- the showcase worlds that use sections ----
  for (const [file, sec, how] of [['deepdelve-camp', null, 'stairs'], ['hearthvale', null, 'edge']]) {
    await ev(() => localStorage.removeItem('tablefolkJourney'));
    await open(`${BASE}/app/?art=1&scenario=../scenarios/${file}.json`);
    const info = await ev(() => ({ secs: window.tablefolkScenario.sections().map(s => s.id), links: window.tablefolkScenario.sections()[0].links.map(l => l.kind) }));
    check(`${file}: has sections`, info.secs.length >= 2, info);
    if (how === 'stairs') {
      const l = await ev(() => window.tablefolkScenario.sections()[0].links.find(l => l.kind === 'stairs_down'));
      await ev(() => { window.tablefolkScenario.travel(window.tablefolkScenario.links().find(l => l.kind === 'stairs_down')); });
      await ev(async () => { for (let i = 0; i < 300 && !window.tablefolkScenario.section; i++) await __s.sleep(100); });
      check(`${file}: down the stairs`, await ev(() => __s.waitSection(window.tablefolkScenario.section || '?')) && await ev(() => window.tablefolkScenario.section !== ''), { l, now: await ev(() => window.tablefolkScenario.section) });
      await shot(file + '-level');
    } else {
      await ev(() => { window.tablefolkScenario.travel(window.tablefolkScenario.links().find(l => l.edge)); });
      await ev(async () => { for (let i = 0; i < 300 && !window.tablefolkScenario.section; i++) await __s.sleep(100); });
      check(`${file}: off the edge`, await ev(() => __s.waitSection(window.tablefolkScenario.section || '?')) && await ev(() => window.tablefolkScenario.section !== ''));
      await shot(file + '-forest');
    }
    await ev(() => __s.S().travel({ to: 'back' }));
    check(`${file}: and back`, await ev(() => __s.waitSection('')));
  }
} catch (e) {
  check('no exception', false, String(e?.stack || e).slice(0, 600));
} finally {
  await ev(() => localStorage.removeItem('tablefolkJourney')).catch(() => {});
  const bad = errors.filter(e => !/favicon|ResizeObserver/.test(e));
  check('no page errors', !bad.length, bad.slice(0, 5).join(' | '));
  const n = results.filter(r => !r.ok).length;
  say(`${results.length - n}/${results.length} ok`);
  await b.close().catch(() => {});
  process.exit(n ? 1 : 0);
}
