import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8001'));
const S = '/tmp/claude-1000/-mnt-files-geebr-world/bde8bf29-8007-4375-b49f-eeda1155bc3c/scratchpad/';
await page.evaluate(() => { const s = TABLEFOLK_STATE, t = tablefolk; t.setCharacterLogicalPosition(s.playerAvatar, { x: 1, z: 2 }); });
await page.waitForTimeout(800);
const mode = process.argv[2];
await page.evaluate(m => tablefolkCombat.wield(TABLEFOLK_STATE.playerAvatar, m === 'sword' ? 'sword' : 'none'), mode);
await page.evaluate(() => { const s=TABLEFOLK_STATE; s.camera.target = s.playerAvatar.root.position.add(new BABYLON.Vector3(0,.8,0)); s.camera.radius = 6; s.camera.beta = 1.2; });
await page.waitForTimeout(600);
await page.evaluate(() => document.activeElement?.blur());
const shots = [];
await page.keyboard.press('f');
for (const t of [150, 200, 200, 200]) { await page.waitForTimeout(t); const f = S + `a2-${mode}-${shots.length}.png`; await page.screenshot({ path: f, clip: { x: 390, y: 150, width: 500, height: 500 } }); shots.push(f); }
console.log(await page.evaluate(() => { const g = TABLEFOLK_STATE.playerAvatar; return [g.charModel, g.rigMode, g.activeRigAnim?.name, !!g._weaponMesh, g._weaponMesh?.parent?.name]; }));
process.exit(0);
