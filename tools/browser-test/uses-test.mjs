// uses.js in the test Chrome, without the model (?art=1): a room with a
// chest, a bed, a chair, a stool, an anvil and a tree; a character uses each,
// stores and takes from the chest; canvas shots of the poses.
//   node uses-test.mjs [outdir] [base]     (the test Chrome running; loads <base>/app/?art=1&still=0 fresh: physics on)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
const dir = process.argv[2] || 'results/uses'; mkdirSync(dir, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages()[0];
p.on('console', m => { if (/error|uses|\[emote\]/i.test(m.text()) && !/favicon/.test(m.text())) console.log('  [page]', m.text().slice(0, 200)); });
p.on('pageerror', e => console.log('  [pageerror]', e.message));
const cdp = await p.context().newCDPSession(p);
await p.goto((process.argv[3] || 'http://localhost:8001') + '/app/?art=1&still=0');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
await p.waitForFunction(() => window.tablefolk?.ready && window.tablefolkScenario && window.tablefolkUses, null, { timeout: 90000 });
const scn = { v: 1, title: 'Uses test', base: 'plain', size: [13, 11], lighting: 'bright',
  player: { name: 'Ana', gold: 10, items: [], at: [5, 4] }, allowed: ['say', 'walk', 'emote'],
  agents: [{ id: 'mira', model: 'villager_woman', at: [0, 0], facing: 's', personality: 'a villager', inventory: { gold: 12, items: ['bread', 'silver ring'] } },
           { id: 'tor', model: 'swordsman', at: [-3, 2], facing: 's', personality: 'a smith' }],
  objects: [{ type: 'chest', x: 2, z: 0, gold: 5, items: ['old map'] }, { type: 'bed', x: -2, z: -3 }, { type: 'wooden_chair', x: 1, z: 3 }, { type: 'stool', x: 3, z: 3 },
            { type: 'anvil', x: -4, z: 0 }, { type: 'tree', x: 4, z: -3 }, { type: 'bench', x: -1, z: 3 }] };
await p.evaluate(s => tablefolkScenario.playScenario(s), scn);
await p.waitForFunction(() => tablefolk.getAgents().length >= 2, null, { timeout: 60000 });
await p.evaluate(() => { document.querySelector('#welcome')?.remove(); document.querySelectorAll('.scn-intro, #scenarioIntro').forEach(e => e.remove()); window.dispatchEvent(new Event('resize')); });
await p.waitForTimeout(3000);
const run = async (who, line, wait = 2500) => {
  const r = await p.evaluate(([who, line]) => { const g = tablefolk.getAgents().find(a => a.id === who); const cmd = tablefolk.parseLLMCommandLine(line); tablefolk.executeAgentCommand(who, cmd); return JSON.stringify(cmd); }, [who, line]);
  await p.waitForTimeout(wait);
  const st = await p.evaluate(who => { const g = tablefolk.getAgents().find(a => a.id === who); const h = TABLEFOLK_STATE.globalHistory.slice(-2).join(' | '); return { pose: g.pose?.mode || null, clip: g._lastRigAnimName, pos: [g.logicalPos.x, g.logicalPos.z], lift: g.rigRoot?.position.y.toFixed(2), inv: JSON.stringify(tablefolk.getBrainConfig(who).inventory), last: h.slice(-260) }; }, who);
  console.log(`${who}: ${line} -> ${r}\n   `, JSON.stringify(st));
};
const shot = async (name, at, from) => {
  await p.evaluate(([at, from]) => { const c = TABLEFOLK_STATE.scene.activeCamera; if (c.setTarget) { c.setTarget(new BABYLON.Vector3(at[0], .6, at[1])); if (c.radius != null) { c.radius = from[0]; c.alpha = from[1]; c.beta = from[2]; } } }, [at, from]);
  await p.waitForTimeout(900);
  const url = await p.evaluate(() => document.getElementById('renderCanvas').toDataURL('image/jpeg', .85));
  writeFileSync(`${dir}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64')); console.log('  shot', name);
};
await run('mira', 'use(chest)', 3500);
await run('mira', 'put(silver ring, chest)');
await run('mira', 'take(old map, chest)');
await run('mira', 'take(gold, chest)');
await run('mira', 'use(chest)');
await shot('chest', [2, 0], [4, 1.1, 1.1]);
await run('mira', 'use(wooden_chair)', 4500);
await shot('chair', [1, 3], [3.5, 1.3, 1.2]);
await run('mira', 'say(How lovely to sit.)', 1500);
await run('tor', 'use(bench)', 5000);
await shot('bench', [-1, 3], [3.5, 1.4, 1.2]);
await run('mira', 'use(bed)', 6000);
await shot('bed', [-2, -3], [4, 1.0, 0.9]);
await run('tor', 'use(anvil)', 4000);
await shot('anvil', [-4, 0], [3.5, 1.2, 1.2]);
await run('tor', 'use(tree)', 5000);
await shot('tree', [4, -3], [4, 1.2, 1.2]);
await run('mira', 'walk(2,1)', 4000);
await run('mira', 'use(stool)', 4000);
await shot('stool', [3, 3], [3.5, 1.3, 1.2]);
console.log(JSON.stringify(await p.evaluate(() => tablefolk.getObjects().filter(o => o.type === 'chest').map(o => ({ state: o.state, opts: o.opts })))));
process.exit(0);
