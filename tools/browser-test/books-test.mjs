// Books (app/books.js): the 3D books load, the passages get vectors at run time,
// and search finds the right passage for questions in other words. Needs the
// cached EmbeddingGemma (port 8000) and the test Chrome:  node books-test.mjs
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
await page.goto('http://localhost:8000/app/?play=1&norender=1&intro=0&scenario=/tools/browser-test/scenarios/books.json&t=' + Date.now());
await page.waitForFunction(() => window.TABLEFOLK_SCENE_READY && window.tablefolkBooks && window.tablefolkEmbed, null, { timeout: 60000 });
console.log('scene ready; embed', await page.evaluate(() => tablefolkEmbed.state));
await page.evaluate(() => tablefolkEmbed.start());
for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => tablefolkEmbed.state + ' ' + Math.round((tablefolkEmbed.progress || 0) * 100)); if (/ready|error|off/.test(s)) { console.log('embed', s); break; } if (i % 5 == 0) console.log('waiting', s); await page.waitForTimeout(1000); }
const r = await page.evaluate(async () => {
  const B = tablefolkBooks, g = tablefolk.state?.characters?.find(c => c.id === 'mira') || state.characters.find(c => c.id === 'mira');
  const t0 = performance.now();
  // runtime vectors for a book without any
  await (async () => { for (let i = 0; i < 40 && !B.books.herbal.vec; i++) { await B.prepare(g, { readsBooks: true, pendingChat: ['Ana says: what helps a fever?'] }); await new Promise(r => setTimeout(r, 300)); } })();
  const out = { vectorsMs: Math.round(performance.now() - t0), hasVec: !!B.books.herbal.vec, held: B.heldBy(g).map(b => b.title) };
  const qs = ['My son broke his arm falling from the hayloft, what should I do?', 'I am burning up and my head aches', 'Can I sell mandrake at the market?', 'The kids found some sweet black berries by the mill', 'How do I keep my dried herbs from spoiling?', 'How much is a room at the inn by the bridge?', 'Lovely weather today, isn\'t it?', 'hello mira', 'who owes the smith money?'];
  out.q = [];
  for (const q of qs) { const t = performance.now(); const hs = await B.search(B.books.herbal, q, 3); out.q.push({ q, ms: Math.round(performance.now() - t), hits: hs.map(h => `#${h.i} zc${h.zc} zs${h.zs} cov${h.cov}: ${h.text.slice(0, 50)}`) }); }
  const cfg = getBrainConfig('mira'); cfg.pendingChat = ['Ana says: My son broke his arm, what should I do?'];
  await B.prepare(g, cfg); out.lines = B.urgentLines(g);
  const gb = state.characters.find(c => c.id === 'bram'); await B.prepare(gb, { readsBooks: true, pendingChat: ['Ana says: broken arm?'] }); out.bram = B.urgentLines(gb);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
