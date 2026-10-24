// Render the 2D tiles of every object, character body and floor
// (app/tile-render.js) in the test Chrome and save them in assets/tiles/:
//   assets/tiles/<kind>/<name>.png   and   assets/tiles/tiles.json
// (kind: objects | characters | floors; the manifest has each tile's size and
// anchor: where its square's middle, on the floor, is in the image).
// Usage: node render-tiles.mjs [base] [only=a,b] [ppu]
//   base: http://localhost:8001 (default); a running test Chrome (launch-chrome.sh)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.argv[2] || 'http://localhost:8001';
const only = process.argv[3] || '', ppu = +(process.argv[4] || 128);
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0], page = await ctx.newPage();
page.on('console', m => { if (/\[tiles\]/.test(m.text())) console.log(m.text()); });
await page.goto(`${base}/app/?tabletop=1&tiles=1&ppu=${ppu}${only ? '&only=' + only : ''}&t=${Date.now()}`);
let last = -1;
for (;;) {
  const s = await page.evaluate(() => ({ n: window.tablefolkTiles?.results.length || 0, total: window.tablefolkTiles?.total || 0, done: !!window.tablefolkTiles?.done }));
  if (s.n !== last) { last = s.n; process.stdout.write(`\r${s.n}/${s.total}   `); }
  if (s.done) break;
  await page.waitForTimeout(500);
}
const res = await page.evaluate(() => window.tablefolkTiles.results);
const dir = join(ROOT, 'assets', 'tiles'), mf = join(dir, 'tiles.json');
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { objects: {}, characters: {}, floors: {} };
manifest.ppu = ppu; manifest.view = 'from the south, 58 degrees up (floors: straight down); screen right is -x';
for (const r of res) {
  if (!r.url) { console.log('\nfailed:', r.kind, r.name, r.error); continue; }
  mkdirSync(join(dir, r.kind), { recursive: true });
  writeFileSync(join(dir, r.kind, r.name + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  (manifest[r.kind] ||= {})[r.name] = { file: `${r.kind}/${r.name}.png`, w: r.w, h: r.h, anchor: r.anchor };
}
writeFileSync(mf, JSON.stringify(manifest, null, 1) + '\n');
console.log(`\nsaved ${res.filter(r => r.url).length} tiles in assets/tiles/`);
await page.close(); await b.close().catch(() => {});
