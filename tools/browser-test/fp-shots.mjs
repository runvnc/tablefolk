// First-person shots at given squares of the scenario page open in the test Chrome (url containing FP_PAGE, default 'scenario='):
//   node fp-shots.mjs '[["name",x,z,yawDeg,pitch],...]' outdir   (yaw 180 looks north, -z; canvas read, so headless works)
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const p = b.contexts()[0].pages().find(x => x.url().includes(process.env.FP_PAGE || 'scenario='));
const cdp = await p.context().newCDPSession(p);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 640, deviceScaleFactor: 1, mobile: false });
await p.waitForFunction(() => window.TABLEFOLK_STATE?.playerAvatar && window.tablefolk, null, { timeout: 90000 });
await p.evaluate(() => { window.dispatchEvent(new Event('resize')); document.querySelector('#welcome')?.remove(); document.querySelectorAll('.scn-intro, #scenarioIntro').forEach(e => e.remove()); });
const [list, dir] = [JSON.parse(process.argv[2]), process.argv[3]];
for (const [name, x, z, yaw, pitch = .05] of list) {
  const info = await p.evaluate(([x, z, yaw, pitch]) => { const s = TABLEFOLK_STATE; tablefolk.setCharacterLogicalPosition(s.playerAvatar, { x, z });
    if (!s.firstPerson) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
    s.fpYaw = yaw * Math.PI / 180; s.fpPitch = pitch; return { fp: s.firstPerson, cam: s.scene.activeCamera?.name, pos: s.playerAvatar.root.position.toString() }; }, [x, z, yaw, pitch]);
  await p.waitForTimeout(1500);
  const url = await p.evaluate(() => document.getElementById('renderCanvas').toDataURL('image/jpeg', .85));
  writeFileSync(`${dir}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64')); console.log(name, JSON.stringify(info));
}
process.exit(0);
