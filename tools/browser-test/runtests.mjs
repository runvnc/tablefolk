// Run the Scenario pane tactic tester in the test Chrome and save the results.
// Usage: node runtests.mjs <runs> [example-key]
// Uses the tactics currently in the pane's "Test tactics" box and the built-in
// example scenario (shop, guard, lure). Results go to results/results-<ts>.json.
import { chromium } from 'playwright-core';
import fs from 'fs';
const runs = +(process.argv[2] || 3), exampleKey = process.argv[3] || 'shop';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:8000'));
page.on('console', m => { const t = m.text(); if (/error|ERROR|failed/i.test(t) && !/DEPRECATED_ENDPOINT/.test(t)) console.log('[page]', t.slice(0, 300)); });
await page.evaluate(({ runs, exampleKey }) => {
  const S = window.tablefolkScenario;
  const tactics = S.parseTactics(document.getElementById('scnTactics').value);
  window.__tt = { status: 'starting', done: false, result: null, error: null };
  S.runTactics({ scenario: S.EXAMPLES[exampleKey], tactics, runs,
    onProgress: (t, partial) => { window.__tt.status = t; window.__tt.partial = partial.map(r => ({ name: r.name, wins: r.wins, n: r.runs.length })); } })
    .then(r => { window.__tt.result = r; window.__tt.done = true; })
    .catch(e => { window.__tt.error = String(e && e.stack || e); window.__tt.done = true; });
}, { runs, exampleKey });
let last = '';
while (true) {
  const s = await page.evaluate(() => ({ status: window.__tt.status, done: window.__tt.done, error: window.__tt.error, partial: window.__tt.partial }));
  const line = s.status + '  ' + (s.partial || []).map(r => `${r.name.slice(0, 22)} ${r.wins}/${r.n}`).join(' · ');
  if (line !== last) { console.log(new Date().toISOString().slice(11, 19), line); last = line; }
  if (s.done) { if (s.error) console.log('ERROR', s.error); break; }
  await new Promise(r => setTimeout(r, 4000));
}
const result = await page.evaluate(() => window.__tt.result);
if (result) { fs.mkdirSync('results', { recursive: true }); fs.writeFileSync('results/results-' + Date.now() + '.json', JSON.stringify(result, null, 2)); console.log('saved'); }
await b.close().catch(() => {});
