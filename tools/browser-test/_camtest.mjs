// temp camera test (scratch; deleted after)
import { chromium } from 'playwright-core';
const SP = process.argv[2], mode = process.argv[3] || 'welcome';
console.log('connect'); const b = await chromium.connectOverCDP('http://127.0.0.1:9333', { timeout: 10000 }); console.log('connected');
const ctx = b.contexts()[0]; const page = ctx.pages()[0] || await ctx.newPage();
const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 200)));

const shot = async n => { const u = await page.evaluate(() => document.getElementById('renderCanvas').toDataURL('image/jpeg')); (await import('fs')).writeFileSync(`${SP}/${n}.jpg`, Buffer.from(u.split(',')[1], 'base64')); console.log('shot', n); };
const waitFor = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(300); } return false; };
if (mode === 'welcome') {
  await page.goto('http://localhost:8002/app/?art=1', { timeout: 20000 });
  console.log('welcome', await waitFor(() => document.querySelector('#welcome [data-play]')));
  await page.evaluate(() => { const bs = [...document.querySelectorAll('#welcome [data-play]')]; bs.find(b => /Oracle/.test(b.textContent)).click(); });
  console.log('avatar', await waitFor(() => window.tablefolk?.getPlayerAvatar?.() && window.tablefolk.getCameraView() === 'first', 40000));
  await page.waitForTimeout(2500);
  console.log(await page.evaluate(() => ({ view: window.tablefolk.getCameraView(), active: window.TABLEFOLK_STATE.scene.activeCamera.name, intro: !document.getElementById('scenarioEnd')?.hidden })));
  await shot('oracle-fp');
  await page.mouse.move(640, 400); for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(30); }
  await page.waitForTimeout(500); console.log('fp fov', await page.evaluate(() => window.TABLEFOLK_STATE.scene.activeCamera.fov)); await shot('oracle-fp-zoom');
} else {
  if (!page.url().includes(mode)) await page.goto(`http://localhost:8002/app/?art=1&scenario=/scenarios/${mode}`, { timeout: 20000 });
  console.log('page', page.url().slice(0, 80));
  console.log('avatar', await waitFor(() => window.tablefolk?.getPlayerAvatar?.(), 40000));
  await page.waitForTimeout(3000);
  console.log('view', await page.evaluate(() => window.tablefolk.getCameraView()));
  // the world point under a pixel
  const under = (x, y) => page.evaluate(([x, y]) => { const s = window.TABLEFOLK_STATE.scene, c = s.activeCamera; const r = s.pick(x, y, m => m.isPickable && m.isEnabled() && m.isVisible); return r?.hit ? { p: [r.pickedPoint.x, r.pickedPoint.y, r.pickedPoint.z].map(v => +v.toFixed(3)), m: r.pickedMesh.name, r: +c.radius.toFixed(3), minZ: c.minZ, beta: +c.beta.toFixed(3) } : { miss: 1, r: c.radius }; }, [x, y]);
  const proj = p => page.evaluate(p => { const s = window.TABLEFOLK_STATE.scene, c = s.activeCamera, e = s.getEngine(); const v = BABYLON.Vector3.Project(new BABYLON.Vector3(...p), BABYLON.Matrix.Identity(), s.getTransformMatrix(), c.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight())); return [+v.x.toFixed(1), +v.y.toFixed(1)]; }, p);
  await shot('free-0');
  const X = 820, Y = 470;
  await page.mouse.move(X, Y);
  const a = await under(X, Y); console.log('before', JSON.stringify(a));
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(25); }
  await page.waitForTimeout(400);
  const b2 = await under(X, Y); console.log('after zoom-in', JSON.stringify(b2), 'orig point now at', JSON.stringify(await proj(a.p)));
  await shot('free-zoomed');
  // orbit drag from a pixel
  const P = await under(X, Y);
  await page.mouse.move(X, Y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(X + i * 12, Y + i * 3); await page.waitForTimeout(16); }
  await page.waitForTimeout(100);
  console.log('mid-orbit pivot at', JSON.stringify(await proj(P.p)), JSON.stringify(await under(X, Y)));
  await page.mouse.up(); await page.waitForTimeout(300);
  await shot('free-orbited');
  // zoom back out
  for (let i = 0; i < 50; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(20); }
  await page.waitForTimeout(400); console.log('zoomed out', JSON.stringify(await under(X, Y)));
  // big orbit from a far pixel, pitch limits
  await page.mouse.move(500, 300); await page.mouse.down();
  for (let i = 1; i <= 30; i++) { await page.mouse.move(500 - i * 10, 300 + i * 15); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(300);
  console.log('after big orbit', JSON.stringify(await under(640, 400)));
  await shot('free-orbit2');
  // click still selects / walks (no drag)
  await page.mouse.click(640, 400); await page.waitForTimeout(300);
  // follow mode zoom
  await page.evaluate(() => window.tablefolk.setCameraView('follow')); await page.waitForTimeout(500);
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(20); }
  await page.waitForTimeout(400); console.log('follow r', await page.evaluate(() => window.TABLEFOLK_STATE.camera.radius));
  await shot('follow-zoom');
}
console.log('errors', JSON.stringify(errs.slice(0, 10)));
await b.close().catch(() => {});
