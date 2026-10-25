// Map editor test: every tool on a loaded world, checked against the
// scenario it writes. Needs the test Chrome and a server (base, default :8000).
// Usage: node editor-test.mjs [base]
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8000';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(base + '/world/?t=' + Date.now());
await page.evaluate(async () => { const s = await (await fetch('/scenarios/goblin-bakery.json')).json(); window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} }); });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('mapEditor').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
const box = await (await page.$('.tfme-stage canvas')).boundingBox();
// cell (x, z) -> screen point, from the editor's own view
const S = () => page.evaluate(() => tfBuilder.scenario);
const fails = []; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
// probe the board's geometry with the tooltip: hover two points, read "x, z"
async function probe(px, py) { await page.mouse.move(box.x + px, box.y + py); await page.waitForTimeout(60); const t = await page.evaluate(() => document.querySelector('.tfme-tip')?.innerText || ''); const m = t.match(/(-?\d+), (-?\d+)/); return m ? [+m[1], +m[2]] : null; }
const p1 = await probe(box.width / 2, box.height / 2), p2 = await probe(box.width / 2 + 120, box.height / 2 + 120);
const s = 120 / (p1[0] - p2[0]);   // pixels per cell (screen right is -x)
const px = (x, z) => [box.x + box.width / 2 + (p1[0] - x) * s, box.y + box.height / 2 + (z - p1[1]) * s];
const click = async (x, z) => { const [a, c] = px(x, z); await page.mouse.click(a, c); await page.waitForTimeout(80); };
const key = async k => { await page.evaluate(() => document.activeElement?.blur?.()); await page.mouse.move(...px(0, 0)); await page.keyboard.press(k); await page.waitForTimeout(80); };
// 1. walls: the bakery's west wall at x=6 (grid col 0); draw a wall at (2,2)
await key('w'); await click(2, 2);
ok((await S()).objects.some(o => o.type === 'wall' && o.x === 2 && o.z === 2), 'wall drawn at (2,2)');
await click(2, 2);
ok(!(await S()).objects.some(o => o.type === 'wall' && o.x === 2 && o.z === 2), 'clicking a wall with the wall tool removes it');
// 2. doors: a wall of the bakery (x=6, z=0) becomes a door, then locked, then unlocked
await key('d'); await click(6, 0);
ok((await S()).objects.some(o => o.type === 'door' && o.x === 6 && o.z === 0), 'wall turned into a door');
await click(6, 0);
ok((await S()).locked?.some(l => l.at[0] === 6 && l.at[1] === 0), 'door locked');
await page.fill('.tfme-inspect input[data-k="locked"]', 'iron key'); await page.waitForTimeout(100);
ok((await S()).locked?.some(l => l.key === 'iron key'), 'lock key renamed in the inspector');
await key('Escape'); await key('d'); await click(6, 0);
ok(!(await S()).locked?.some(l => l.at[0] === 6 && l.at[1] === 0), 'door unlocked');
// 3. floor
await key('g'); await page.selectOption('.tfme-mat', 'lava'); await click(-2, 3);
ok((await S()).paint.some(p => p.x === -2 && p.z === 3 && p.mat === 'lava'), 'floor painted with lava');
// 4. place a thing and a monster, select, rename, duplicate, delete
await key('v');
await page.click('.tfme-tabs button[data-tab="objects"]'); await page.evaluate(() => document.querySelector('.tfme-item[data-name="barrel"]').click()); await click(-4, 2);
ok((await S()).objects.some(o => o.type === 'barrel' && o.x === -4 && o.z === 2), 'barrel placed from the Things tab');
await page.click('.tfme-tabs button[data-tab="monsters"]'); await page.evaluate(() => document.querySelector('.tfme-item[data-name="skeleton"]').click()); await click(-4, 0);
let sc = await S(); const sk = sc.agents.find(a => a.model === 'skeleton');
ok(sk && sk.at[0] === -4 && sk.at[1] === 0 && sk.hostile === true, 'skeleton placed, hostile');
await page.fill('.tfme-inspect input[data-k="id"]', 'boney'); await page.waitForTimeout(100);
ok((await S()).agents.some(a => a.id === 'boney'), 'renamed to boney');
await page.click('.tfme-inspect [data-act="dup"]'); await page.waitForTimeout(100);
ok((await S()).agents.filter(a => a.model === 'skeleton').length === 2, 'duplicated');
await page.click('.tfme-inspect [data-act="del"]'); await page.waitForTimeout(100);
ok((await S()).agents.filter(a => a.model === 'skeleton').length === 1, 'deleted the copy');
// 5. move by drag: boney to (-5, 0)
await key('v'); { const [a, c] = px(-4, 0), [d, e] = px(-5, 0); await page.mouse.move(a, c); await page.mouse.down(); await page.mouse.move(d, e, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100); }
ok((await S()).agents.find(a => a.id === 'boney')?.at?.join() === '-5,0', 'dragged boney to (-5,0)');
// 6. erase
await key('x'); await click(-4, 2);
ok(!(await S()).objects.some(o => o.type === 'barrel' && o.x === -4 && o.z === 2), 'barrel erased');
// 7. undo / redo
await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
ok((await S()).objects.some(o => o.type === 'barrel' && o.x === -4 && o.z === 2), 'undo brings the barrel back');
await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(100);
ok(!(await S()).objects.some(o => o.type === 'barrel' && o.x === -4 && o.z === 2), 'redo erases it again');
// 8. board size
await key('Escape'); await page.fill('.tfme-inspect input[data-board="cols"]', '15'); await page.waitForTimeout(150);
ok((await S()).size?.[0] === 15, 'board 15 wide');
// 9. the forms see the map's changes
await page.click('#editor .tabs button[data-tab="characters"]').catch(() => {}); await page.waitForTimeout(500);
ok(await page.evaluate(() => !!document.querySelector('#editor [data-path$=".id"][value="boney"]')), 'characters form shows boney');
console.log(errs.length ? 'page errors:\n' + errs.join('\n') : 'no page errors');
console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
await page.close(); await b.close();
process.exit(fails.length ? 1 : 0);
