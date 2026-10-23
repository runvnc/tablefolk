// Play a scenario file with scripted (or model-played) player turns in the
// test Chrome, through the real chat path and model, and print what happened.
// Works with the headless test Chrome (HEADLESS=1 ./launch-chrome.sh), so
// nothing shows on screen. Never approves a model download.
//
//   node agenttest.mjs <scenario.json> <tactics.txt> [runs] [--prompts] [--base=http://localhost:8001]
//
// The tactics file is the Scenario pane's "Test tactics" format: "## name"
// blocks, one player message per line, "## llm: strategy" + "turns: N" for a
// model-played player, "to: id", and "win: {json}" / "lose: {json}" to judge
// that tactic by its own goal. Results go to results/agent-<name>-<ts>.json.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const args = process.argv.slice(2), flag = n => args.find(a => a.startsWith('--' + n));
const [scnFile, tacticsFile, runsArg] = args.filter(a => !a.startsWith('--'));
if (!scnFile || !tacticsFile) { console.log('usage: node agenttest.mjs <scenario.json> <tactics.txt> [runs] [--prompts] [--base=URL]'); process.exit(1); }
const runs = +(runsArg || 1), withPrompts = !!flag('prompts');
const base = (flag('base')?.split('=')[1]) || process.env.TABLEFOLK_URL || 'http://localhost:8001';
const scenario = JSON.parse(fs.readFileSync(scnFile, 'utf8')), tacticsText = fs.readFileSync(tacticsFile, 'utf8');

const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0], page = ctx.pages()[0] || await ctx.newPage();
page.on('console', m => { const t = m.text(); if (/\berror\b|failed/i.test(t) && !/DEPRECATED_ENDPOINT|favicon/.test(t)) console.log('[page]', t.slice(0, 240)); });
// A fresh page with no 3D rendering, so the model has the GPU to itself.
// Always a fresh load, so it runs the code on disk.
await page.goto(base + '/app/?norender=1');
const t0 = Date.now(), status = () => page.evaluate(() => ({ ready: !!window.TABLEFOLK_SCENE_READY && !!window.tablefolkScenario, consent: !document.getElementById('modelConsent')?.hidden, brain: document.getElementById('brainStatus')?.textContent || '' }));
for (;;) {
  const s = await status().catch(() => ({}));
  if (s.consent && process.env.APPROVE_DOWNLOAD !== '1') { console.log('The model is not cached in the test profile and needs a download; not approving it (APPROVE_DOWNLOAD=1 to allow).'); await b.close(); process.exit(2); }
  if (s.consent) await page.evaluate(() => document.getElementById('approveModelDownload')?.click());
  if (s.ready && / ready/.test(s.brain)) break;
  if (Date.now() - t0 > 600000) { console.log('timed out waiting for the model:', s.brain); await b.close(); process.exit(3); }
  await new Promise(r => setTimeout(r, 2000));
}
console.log('model:', (await status()).brain, `(${Math.round((Date.now() - t0) / 1000)} s)`);

await page.evaluate(({ scenario, tacticsText, runs, withPrompts }) => {
  const S = window.tablefolkScenario, tactics = S.parseTactics(tacticsText);
  window.__at = { status: 'starting', done: false, result: null, error: null };
  S.runTactics({ scenario, tactics, runs, withPrompts,
    onProgress: (t, partial) => { window.__at.status = t; window.__at.partial = partial.map(r => `${r.name.slice(0, 24)} ${r.wins}/${r.runs.length}`).join(' · '); } })
    .then(r => { window.__at.result = r; window.__at.done = true; })
    .catch(e => { window.__at.error = String(e && e.stack || e); window.__at.done = true; });
}, { scenario, tacticsText, runs, withPrompts });
let last = '';
for (;;) {
  const s = await page.evaluate(() => window.__at);
  const line = `${s.status}  ${s.partial || ''}`;
  if (line !== last) { console.log(new Date().toISOString().slice(11, 19), line); last = line; }
  if (s.done) { if (s.error) console.log('ERROR', s.error); break; }
  await new Promise(r => setTimeout(r, 3000));
}
const result = await page.evaluate(() => window.__at.result);
if (result) {
  console.log('\n=== ' + result.scenario + ' ===');
  for (const r of result.results) {
    console.log(`\n## ${r.name}: ${r.wins}/${r.runs.length} won`);
    for (const run of r.runs) {
      console.log(`-- run ${run.run}: ${run.won ? 'WON' : run.lost ? 'LOST' : 'no result'}, ${run.turns} turns, player gold ${run.playerGold}`);
      for (const t of run.transcript) console.log(`  > ${t.player}\n  < ${t.said.join(' ') || '…'}${t.commands ? `   [${t.commands}]` : ''}${t.error ? '  ERROR ' + t.error : ''}`);
    }
  }
  fs.mkdirSync('results', { recursive: true });
  const out = `results/agent-${path.basename(scnFile, '.json')}-${Date.now()}.json`;
  fs.writeFileSync(out, JSON.stringify(result, null, 2)); console.log('\nsaved', out);
}
await b.close().catch(() => {});
