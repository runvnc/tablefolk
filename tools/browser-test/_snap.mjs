import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => /8000/.test(p.url()));
const out = await page.evaluate(async () => {
  const sc = state.scene, cam = sc.activeCamera, eng = state.engine, g = state.characters[0];
  const p = g.root.position, d = new BABYLON.Vector3(g.dir?.x || 0, 0, g.dir?.z || 1).normalize();
  const c2 = new BABYLON.FreeCamera('eyecam', new BABYLON.Vector3(p.x + d.x * .3, .85, p.z + d.z * .3), sc);
  c2.setTarget(c2.position.add(d.scale(4)).add(new BABYLON.Vector3(0, -.55, 0))); c2.fov = 1.15; c2.minZ = .05;
  const a = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(eng, c2, { width: 448, height: 320 }, 'image/jpeg', 4, true);
  c2.dispose(); return a;
});
fs.writeFileSync('/tmp/claude-1000/-mnt-files-geebr-world/bde8bf29-8007-4375-b49f-eeda1155bc3c/scratchpad/rtt.jpg', Buffer.from(out.split(',')[1], 'base64'));
await b.close().catch(() => {});
