// Survival eval: a character alone with monsters that hunt everyone, hungry,
// carrying a weapon, food and a potion. The player only waits, so every
// round is the world's. Prints each round (health, hunger, what it did) and
// a summary: did it survive, monsters defeated, hunger handled, how many
// turns were reflexes (the game) and how many the model.
//
//   node survival-test.mjs [evals/survival.json] [--rounds=24] [--model=<key>] [--expect=basic|capable|ambitious] [--hunger=0.75] [--base=URL] [--runs=N]
import { chromium } from 'playwright-core';
import fs from 'fs';
const args = process.argv.slice(2), flag = n => args.find(a => a.startsWith('--' + n + '='))?.split('=').slice(1).join('=');
const file = args.find(a => !a.startsWith('--')) || 'evals/survival.json';
const rounds = +(flag('rounds') || 24), runs = +(flag('runs') || 1), base = flag('base') || 'http://localhost:8000';
const scenario = JSON.parse(fs.readFileSync(file, 'utf8'));
if (flag('expect')) scenario.expect = flag('expect');
if (args.includes('--no-reflexes')) scenario.reflexes = false;
const hunger = +(flag('hunger') || .75);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0], page = ctx.pages()[0] || await ctx.newPage();
page.on('console', m => { const t = m.text(); if (/reflex|reflects|\berror\b/i.test(t) && !/favicon|DEPRECATED/.test(t)) console.log('  [page]', t.slice(0, 200)); });
// no voices: a remembered Breeze choice makes the server start Breeze (2 GB of the card)
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); } catch {} });
await page.goto(base + '/app/?norender=1' + (flag('model') ? '&model=' + flag('model') : ''));
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.TABLEFOLK_SCENE_READY && !!window.tablefolkScenario, consent: !document.getElementById('modelConsent')?.hidden, brain: document.getElementById('brainStatus')?.textContent || '' }));
  if (s.consent && process.env.APPROVE_DOWNLOAD !== '1') { console.log('needs a model download; not approving it'); process.exit(2); }
  if (s.consent) await page.evaluate(() => document.getElementById('approveModelDownload')?.click());
  if (/click load/i.test(s.brain)) await page.evaluate(() => document.getElementById('loadBrains')?.click());
  if (s.ready && /ready/i.test(s.brain)) { console.log('model:', s.brain, Math.round((Date.now() - t0) / 1000) + ' s'); break; }
  if (Date.now() - t0 > 1200000) { console.log('timed out:', s.brain); process.exit(3); }
  await new Promise(r => setTimeout(r, 1000));
}
const all = [];
for (let run = 1; run <= runs; run++) {
  await page.evaluate(async ({ scenario, hunger }) => {
    await window.tablefolkScenario.playScenario(scenario, { testing: true });
    window.__sv = { log: [], reflex: 0, model: 0 };
    if (!window.__svOn && (window.__svOn = true)) addEventListener('tablefolk-agent-turn', e => { if (e.detail?.agentId !== 'tam') return; if (e.detail.reflex) window.__sv.reflex++; else window.__sv.model++; window.__sv.log.push((e.detail.reflex ? 'REFLEX ' : 'model  ') + String(e.detail.line || '').replace(/\s+/g, ' ').slice(0, 160)); });
    const g = tablefolk.getAgents().find(a => a.id === 'tam'); window.tablefolkMind.mindOf(g).hunger = hunger;
  }, { scenario, hunger });
  console.log(`--- run ${run} (expect: ${await page.evaluate(() => window.tablefolkMind.tier(tablefolk.getAgents().find(a => a.id === 'tam')))})`);
  let out = null;
  for (let r = 1; r <= rounds; r++) {
    await page.evaluate(() => window.tablefolkPlay.acted('wait'));
    const tw = Date.now();
    await new Promise(r => setTimeout(r, 400));
    while (Date.now() - tw < 90000 && await page.evaluate(() => window.tablefolkPlay.busy || document.getElementById('npcThinking')?.classList.contains('show'))) await new Promise(r => setTimeout(r, 300));
    await new Promise(r => setTimeout(r, 300));
    out = await page.evaluate(() => {
      const C = window.tablefolkCombat, M = window.tablefolkMind, A = tablefolk.getAgents(), g = A.find(a => a.id === 'tam'), cfg = tablefolk.getBrainConfig('tam');
      const mons = A.filter(a => a.id !== 'tam').map(a => `${a.id} ${tablefolk.getBrainConfig(a.id).defeated ? 'DEAD' : C.hpOf(a).hp}`);
      const lines = window.__sv.log.splice(0);
      return { hp: C.hpOf(g).hp, dead: !!cfg.defeated, hunger: +M.mindOf(g).hunger.toFixed(2), held: cfg.wielding, inv: (cfg.inventory.items || []).map(i => i.name + 'x' + (i.qty ?? 1)).join(','), mons, lines, reflex: window.__sv.reflex, model: window.__sv.model, monsLeft: A.filter(a => a.id !== 'tam' && !tablefolk.getBrainConfig(a.id).defeated).length };
    });
    console.log(`r${r} tam ${out.dead ? 'DEAD' : out.hp + 'hp'} hunger ${out.hunger} ${out.held || '-'} [${out.inv}] | ${out.mons.join(', ')}`);
    for (const l of out.lines) console.log('     ' + l);
    if (out.dead || (!out.monsLeft && r > 6 && out.mons.length) || (!out.mons.length && out.hunger < .4)) break;
  }
  const res = { run, survived: !out.dead, hp: out.hp, monstersLeft: out.monsLeft, hunger: out.hunger, reflex: out.reflex, model: out.model };
  console.log('RESULT', JSON.stringify(res)); all.push(res);
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/survival-${Date.now()}.json`, JSON.stringify({ args, all }, null, 1));
console.log('SUMMARY', all.filter(r => r.survived).length + '/' + all.length, 'survived;', all.reduce((a, r) => a + (2 - r.monstersLeft), 0), 'monsters defeated;', all.filter(r => r.hunger < .5).length + '/' + all.length, 'fed (hunger under 0.5)');
await b.close().catch(() => {});
