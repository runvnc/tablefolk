import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('/world/'));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.evaluate(() => document.getElementById('mapEditor').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
const cv = await page.$('.tfme-stage canvas'), box = await cv.boundingBox();
// drag a goblin from the palette onto the map
const gob = await page.$('.tfme-item[data-name="goblin"]'); const gb = await gob.boundingBox();
await page.mouse.move(gb.x + 20, gb.y + 20);
await page.dragAndDrop('.tfme-item[data-name="goblin"]', '.tfme-stage canvas', { targetPosition: { x: box.width / 2, y: box.height / 2 } });
await page.waitForTimeout(300);
// draw walls: W then drag across
await page.keyboard.press('w');
await page.mouse.move(box.x + 300, box.y + 560); await page.mouse.down(); for (let i = 0; i < 8; i++) await page.mouse.move(box.x + 300 + i * 30, box.y + 560); await page.mouse.up();
await page.keyboard.press('g'); await page.selectOption('.tfme-mat', 'lava');
await page.mouse.move(box.x + 300, box.y + 520); await page.mouse.down(); for (let i = 0; i < 6; i++) await page.mouse.move(box.x + 300 + i * 30, box.y + 520); await page.mouse.up();
await page.keyboard.press('v');
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(400);
console.log(await page.evaluate(() => JSON.stringify({ agents: tfBuilder.scenario.agents.map(a => a.id + '@' + a.at), objs: tfBuilder.scenario.objects.length, paint: tfBuilder.scenario.paint.length, hasGrid: !!tfBuilder.scenario.grid })));
await page.screenshot({ path: out });
await b.close().catch(() => {});
