// A world as a file (app/world-file.js): picture and .zip written by the builder, read back
// (also with the PNG chunk stripped, and as a JPEG), dropped on the game and the builder.
// Usage: PORT=8001 CDP_PORT=9224 node world-file-test.mjs   (writes results/world-card.png, results/world.zip)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
const base = process.env.BASE || 'http://localhost:' + (process.env.PORT || 8000);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage();
for (const p of b.contexts()[0].pages()) if (p !== page) await p.close();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
mkdirSync(new URL('results/', import.meta.url), { recursive: true });
await page.setViewportSize({ width: 1300, height: 1100 });
await page.goto(base + '/world/?t=' + Date.now());
await page.evaluate(async () => { const s = await (await fetch('/scenarios/goblin-bakery.json')).json(); window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} }); });
await page.waitForTimeout(800);
// a world with a voice in it (a data URL) and a picture
await page.click('[data-tab="voices"]'); await page.fill('#vNewName', 'Old Captain');
await page.setInputFiles('#vNewFile', '../../app/assets/voices/captain_m.mp3');
for (let i = 0; i < 100 && !(await page.evaluate(() => tfBuilder.scenario.voices?.length)); i++) await page.waitForTimeout(200);
const r = await page.evaluate(async () => {
  const WF = tablefolkWorldFile, scn = tfBuilder.scenario, same = a => JSON.stringify(a) === JSON.stringify(scn), out = {};
  const shot = await tfBuilder.editor.snapshot({ maxSide: 1000 });
  const png = await WF.toImage(scn, { picture: shot?.url }); out.pngKB = Math.round(png.size / 1024);
  out.picture = same(await WF.read(new File([png], 'w.png', { type: 'image/png' })));
  // the chunk stripped (as a service that drops metadata would)
  const u = new Uint8Array(await png.arrayBuffer()), dv = new DataView(u.buffer); let o = 8, cut = null;
  while (o < u.length) { const n = dv.getUint32(o), t = new TextDecoder().decode(u.subarray(o + 4, o + 8)); if (t === 'tfWd') cut = [o, o + 12 + n]; o += 12 + n; }
  const stripped = new Uint8Array(u.length - (cut[1] - cut[0])); stripped.set(u.subarray(0, cut[0])); stripped.set(u.subarray(cut[1]), cut[0]);
  out.strippedKB = Math.round(stripped.length / 1024);
  out.pixelsOnly = same(await WF.read(new File([stripped], 'w.png', { type: 'image/png' })));
  // re-saved as a PNG by another canvas (a lossless re-encode)
  const bm = await createImageBitmap(new Blob([stripped], { type: 'image/png' }), { colorSpaceConversion: 'none' }), c = new OffscreenCanvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0);
  out.resaved = same(await WF.read(new File([await c.convertToBlob({ type: 'image/png' })], 'w.png', { type: 'image/png' })));
  // recompressed to JPEG: lost, with a message that says so
  try { await WF.read(new File([await c.convertToBlob({ type: 'image/jpeg', quality: .9 })], 'w.jpg', { type: 'image/jpeg' })); out.jpeg = 'read?!'; } catch (e) { out.jpeg = e.message; }
  const zip = await WF.toZip(scn); out.zipKB = Math.round(zip.size / 1024);
  out.zip = same(await WF.read(new File([zip], 'w.zip', { type: 'application/zip' })));
  out.json = same(await WF.read(new File([JSON.stringify(scn)], 'w.json', { type: 'application/json' })));
  const b64 = async bl => { const a = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
  out.png64 = await b64(png); out.zip64 = await b64(zip);
  return out;
});
writeFileSync(new URL('results/world-card.png', import.meta.url), Buffer.from(r.png64, 'base64'));
writeFileSync(new URL('results/world.zip', import.meta.url), Buffer.from(r.zip64, 'base64'));
delete r.png64; delete r.zip64; console.log('round trips:', r);
const drop = async (bytes64, name, type) => page.evaluate(async ([b64, name, type]) => {
  const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), dt = new DataTransfer(); dt.items.add(new File([u], name, { type }));
  document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, [bytes64, name, type]);
const png64 = (await import('fs')).readFileSync(new URL('results/world-card.png', import.meta.url)).toString('base64');
const zip64 = (await import('fs')).readFileSync(new URL('results/world.zip', import.meta.url)).toString('base64');
// the builder: a fresh page, the .zip dropped on it
await page.goto(base + '/world/?t=' + Date.now()); await page.waitForTimeout(500);
await drop(zip64, 'world.zip', 'application/zip');
for (let i = 0; i < 30 && !(await page.evaluate(() => window.tfBuilder?.scenario)); i++) await page.waitForTimeout(200);
console.log('builder opened the .zip:', await page.evaluate(() => ({ title: tfBuilder.scenario?.title, voices: tfBuilder.scenario?.voices?.map(v => v.id + ' ' + v.sample.slice(0, 15)), msg: document.getElementById('edmsg')?.textContent })));
// the game: the picture dropped on it
await page.goto(base + '/app/?play=1&t=' + Date.now());
for (let i = 0; i < 150 && !(await page.evaluate(() => window.TABLEFOLK_SCENE_READY && window.tablefolkScenario)); i++) await page.waitForTimeout(200);   // scenario.js (the drop handler) loads after the scene
await drop(png64, 'world.png', 'image/png');
for (let i = 0; i < 60 && !(await page.evaluate(() => window.tablefolkScenario?.active)); i++) await page.waitForTimeout(250);
console.log('game opened the picture:', await page.evaluate(() => ({ title: tablefolkScenario.active?.scn?.title || tablefolkScenario.active?.title || !!tablefolkScenario.active, voices: (window.TABLEFOLK_SCENARIO_VOICES || []).map(v => v.id), hash: location.hash.length })));
console.log('errors:', errs.length ? errs : 'none');
await page.close(); await b.close();
