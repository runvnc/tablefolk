// Play a scenario file with scripted (or model-played) player turns in the
// test Chrome, through the real chat path and model, and print what happened.
// Works with the headless test Chrome (HEADLESS=1 ./launch-chrome.sh), so
// nothing shows on screen. Never approves a model download.
//
//   node agenttest.mjs <scenario.json> <tactics.txt> [runs] [--prompts] [--base=http://localhost:8001]
//                      [--render[=light|medium|high]] [--fps=10] [--size=640x360]
//
// --render draws the 3D scene too (default light quality, 10 fps, a 640x360
// page) for tests that need everything working together, and saves a
// image of the scene (the 3D canvas, without the UI) after each turn to results/shots-<name>-<ts>/. Without it the
// page has no 3D rendering (?norender=1) and the model has the GPU.
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
const render = flag('render') ? (flag('render').split('=')[1] || 'light') : null;
const fps = +(flag('fps')?.split('=')[1] || 10), [vw, vh] = (flag('size')?.split('=')[1] || '640x360').split('x').map(Number);
const scenario = JSON.parse(fs.readFileSync(scnFile, 'utf8')), tacticsText = fs.readFileSync(tacticsFile, 'utf8');

const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = b.contexts()[0], page = ctx.pages()[0] || await ctx.newPage();
page.on('console', m => { const t = m.text(); if (/\berror\b|failed/i.test(t) && !/DEPRECATED_ENDPOINT|favicon/.test(t)) console.log('[page]', t.slice(0, 240)); });
// A fresh page (so it runs the code on disk): no 3D rendering, so the model
// has the GPU to itself, or with --render a small, low-quality, capped scene.
if (render) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false }); }
await page.goto(base + '/app/' + (render ? `?gfx=${render}&fps=${fps}` : '?norender=1'));
const shotDir = render ? `results/shots-${path.basename(scnFile, '.json')}-${Date.now()}` : null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
let shotN = 0;
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
  if (line !== last) {
    console.log(new Date().toISOString().slice(11, 19), line); last = line;
    // Headless Chrome doesn't composite the WebGPU canvas into page
    // screenshots (they come out black), so read the scene from the canvas.
    if (shotDir) {
      const url = await page.evaluate(() => document.getElementById('renderCanvas')?.toDataURL('image/jpeg', 0.8)).catch(() => null);
      if (url) fs.writeFileSync(`${shotDir}/${String(++shotN).padStart(3, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    }
  }
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
  if (shotDir) console.log(`screenshots: ${shotDir}/ (${shotN})`);
}
await b.close().catch(() => {});
