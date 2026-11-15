// World builder: add a book from a PDF (scenarios/herbal.pdf), check it is
// extracted, cut, indexed and given to a character; screenshot of the tab.
// Needs the test Chrome and a server on :8000 (the embedding model's cache).
// Usage: node books-builder-test.mjs [out.png]
import { chromium } from 'playwright-core';
const base = 'http://localhost:8000', out = process.argv[2] || 'books-builder.png';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = await b.contexts()[0].newPage();
for (const p of b.contexts()[0].pages()) if (p !== page) await p.close();
page.on('console', m => { if (/embed|books|error/i.test(m.text())) console.log('[page]', m.text().slice(0, 200)); });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.setViewportSize({ width: 1300, height: 1100 });
await page.goto(base + '/world/?t=' + Date.now());
await page.evaluate(async () => { const s = await (await fetch('/scenarios/goblin-bakery.json')).json(); window.tfBuilder.show({ scenario: s, model: 'test', ms: 0 }, { revise: {} }); });
await page.waitForTimeout(1000);
await page.click('[data-tab="books"]');
await page.setInputFiles('input[data-bookfile="new"]', 'scenarios/herbal.pdf');
const t0 = Date.now();
for (let i = 0; i < 120; i++) { const s = await page.evaluate(() => { const b = Object.values(tfBuilder.scenario.books || {})[0]; return b ? { n: b.chunks.length, v: !!b.vectors, msg: document.querySelector('[data-bookmsg]')?.textContent } : null; }); if (s?.v) { console.log('indexed in', Date.now() - t0, 'ms:', s.n, 'passages'); break; } if (i % 5 == 0) console.log('…', JSON.stringify(s)); await page.waitForTimeout(1000); }
const id = await page.evaluate(() => Object.keys(tfBuilder.scenario.books)[0]);
const agent = await page.evaluate(() => tfBuilder.scenario.agents[0].id);
await page.selectOption(`[data-book="${id}"] select[data-bookfield="where"]`, 'agent:' + agent);
await page.waitForTimeout(500);
const s = await page.evaluate(() => tfBuilder.scenario);
const bk = s.books[id], a = s.agents[0];
console.log({ id, title: bk.title, passages: bk.chunks.length, vectorsKB: Math.round(bk.vectors.length / 1024), first: bk.chunks[0].slice(0, 70), agentItems: a.inventory?.items, readsBooks: a.readsBooks });
await page.waitForTimeout(800); await (await page.$('[data-panel="books"]')).screenshot({ path: out });
console.log('errors:', errs.length ? errs : 'none');
await page.close(); await b.close();
