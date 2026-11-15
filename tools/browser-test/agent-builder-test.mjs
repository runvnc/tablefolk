// World builder: the agent's map snapshot and text, and pictures (signs,
// paintings, tapestries) drawn in the map editor. No model is run.
// Usage: node agent-builder-test.mjs [base] [outdir]
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8000', out = process.argv[3] || '.';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(base + '/world/?t=' + Date.now());
// SCN_FILE: a scenario file on disk instead (pictures with "in" in a generated map)
const scenario = process.env.SCN_FILE ? JSON.parse(readFileSync(process.env.SCN_FILE, 'utf8')) : process.env.SCN || '/scenarios/goblin-bakery.json';
const res = await page.evaluate(async scn => {
  const s = typeof scn === 'string' ? await (await fetch(scn)).json() : scn;
  const extra = !!s._noTestPictures; delete s._noTestPictures;
  // a test picture: a canvas pattern as a JPEG data URL
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, '#c33'); g.addColorStop(1, '#33c'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); c.fillStyle = '#fd3'; c.beginPath(); c.arc(64, 64, 30, 0, 7); c.fill();
  const img = cv.toDataURL('image/jpeg', .8);
  if (!extra) s.objects = [...(s.objects || []), { type: 'picture', style: 'sign', x: 0, z: 0, title: 'The Goblin Loaf', image: img }, { type: 'picture', style: 'painting', x: 2, z: 1, prompt: 'a portrait of a goblin baker' }];
  window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} });
  await new Promise(r => setTimeout(r, 1500));
  const ed = window.tfBuilder.editor, shot = await ed.snapshot();
  return { shot: shot.url, w: shot.w, h: shot.h, text: ed.describe(), pending: window.tfBuilder.pendingPictures().length, bar: document.querySelector('.paintbar')?.innerText || '', improveBtn: !!document.querySelector('[data-act="improve"]') };
}, scenario);
writeFileSync(out + '/agent-snapshot.jpg', Buffer.from(res.shot.split(',')[1], 'base64'));
console.log(`snapshot ${res.w}x${res.h} -> ${out}/agent-snapshot.jpg`);
console.log(res.text);
console.log('pending pictures:', res.pending, '| paint bar:', res.bar, '| improve button (no AI here):', res.improveBtn);
await page.screenshot({ path: out + '/agent-builder.png', fullPage: false });
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
await page.close(); await b.close().catch(() => {});
