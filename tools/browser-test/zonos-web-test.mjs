// ZONOS3-Mini in the browser (zonos-web-test.html) in the test Chrome:
//   node zonos-web-test.mjs ["text"] [voice]   speak a line, save results/zonos-<voice>.wav
//   node zonos-web-test.mjs --embeddings      clone every library voice (and mood) and write
//                                             app/assets/voices/zonos-embeddings.json
// (the test Chrome on CDP_PORT, default 9223; the page on PORT, default 8000)
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
const port = process.env.PORT || 8000;
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const p = b.contexts()[0].pages()[0] || await b.contexts()[0].newPage();
p.on('console', m => { const t = m.text(); if (!/^\[zonos\] chunk/.test(t)) console.log('console:', t.slice(0, 300)); });
p.on('pageerror', e => console.log('pageerror:', e.message));
await p.goto(`http://localhost:${port}/tools/browser-test/zonos-web-test.html`);
const t0 = Date.now();
const loadMs = await p.evaluate(() => zt.load());
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s (worker says ${loadMs} ms)`);
if (process.argv[2] === '--embeddings') {
  const root = new URL('../../app/assets/voices/', import.meta.url);
  const list = JSON.parse(readFileSync(new URL('voices.json', root)));
  const files = [...new Set(list.flatMap(v => [v.file, ...Object.values(v.moods || {})]).filter(Boolean))];
  const out = {};
  for (const f of files) {
    const stem = f.split('/').pop().replace(/\.[^.]+$/, '');
    const s = Date.now();
    out[stem] = await p.evaluate(([id, url]) => zt.clone(id, url), [stem, '/app/assets/voices/' + f]);
    console.log(`${stem}: ${out[stem]?.length} numbers, ${Date.now() - s} ms`);
  }
  writeFileSync(new URL('zonos-embeddings.json', root), JSON.stringify(out) + '\n');
  console.log(`wrote ${Object.keys(out).length} embeddings`);
} else {
  const text = process.argv[2] || 'Well met, traveller. The road north is muddy after the rain, but the inn at the crossing still has a warm fire and a free bed.';
  const voice = process.argv[3] || 'savannah';
  for (let i = 0; i < 2; i++) {
    const r = await p.evaluate(([t, v]) => zt.say(t, v), [text, voice]);
    mkdirSync(new URL('results/', import.meta.url), { recursive: true });
    writeFileSync(new URL(`results/zonos-${voice.replace(/\W+/g, '_')}.wav`, import.meta.url), Buffer.from(r.wav, 'base64'));
    delete r.wav; console.log(`run ${i + 1}:`, JSON.stringify(r));
  }
}
process.exit(0);
