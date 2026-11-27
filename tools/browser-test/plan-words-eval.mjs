// plan-words-eval.mjs: the player's words to a plan with the brain that is loaded
// (designate.js planWords: code reads the words, the brain fills the plan from the
// list of places; a small brain names only places and numbers), against code alone.
// Never approves a model download: stops if the page asks for one.
//   node plan-words-eval.mjs [--base=http://localhost:8000] [--model=gemma4-e2b-litert] [--wait=240]
import { chromium } from 'playwright-core';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:8000'), MODEL = arg('model', 'gemma4-e2b-litert'), WAIT = +arg('wait', 240);
const SAYS = [
  'put a wall around the garden with the gate facing the road',
  'fence in the pond',
  'dig a 2 by 2 cellar under the temple',
  'mark a 3 by 2 stockpile north of the square',
  'clear the trees near the pond',
  'post two guards on the east road',
  'a patrol route from the temple to the garden by way of the square',
  'make a little farm plot beside the temple',
  'build walls round the holy house so nobody gets in',
  'I want some men watching over the water',
  'the smith needs a place to pile his ore, 2 by 2, west of the blacksmith',
  'surround the inn with a fence, opening to the south',
];
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
await page.goto(`${BASE}/app/?model=${MODEL}&gfx=light&fps=10&scenario=../scenarios/hearth-spirit.json&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !document.getElementById('modelConsent')?.hidden, text: document.getElementById('modelLoadText')?.textContent || '' })).catch(() => ({}));
  if (s.consent) { console.log('the page asks to download the model: not approved; stopping'); await b.close(); process.exit(2); }
  if (s.ready) break;
  if (Date.now() - t0 > WAIT * 1000) { console.log('no brain after', WAIT, 's:', s.text); await b.close(); process.exit(3); }
  await page.waitForTimeout(2000);
}
console.log(`brain ready in ${Math.round((Date.now() - t0) / 1000)} s:`, await page.evaluate(() => JSON.stringify({ key: tablefolkBrainInfo?.()?.key, tier: tablefolkMind?.tier?.(null) })));
// keep the village still while measuring (the characters would use the brain too)
await page.evaluate(() => { tablefolkLive.stop(); });
await page.waitForTimeout(1500);
console.log('places:', await page.evaluate(() => tablefolkDesignate.gameMap().places.map(p => p.id).join(', ')));
const rows = [];
for (const say of SAYS) {
  const r = await page.evaluate(async say => {
    const P = window.TablefolkPlanCore, code = await tablefolkDesignate.planWords(say, { useBrain: false }), m = await tablefolkDesignate.planWords(say, { useBrain: true });
    const res = x => { if (x.ask) return 'asks ' + x.ask; if (!x.plan.verb) return 'no verb'; const q = P.plan(x.plan, x.map); return q.ok ? `${q.cells.length} sq` : 'fails: ' + (q.error || q.warnings?.[0]); };
    const strip = p => JSON.stringify(Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))));
    return { say, code: strip(code.plan), codeRes: res(code), model: strip(m.plan), modelRes: res(m), by: m.by, ms: m.ms, raw: String(m.raw || '').replace(/\s+/g, ' ').slice(0, 160) };
  }, say);
  rows.push(r);
  console.log(`\n"${r.say}"\n  code:  ${r.code} -> ${r.codeRes}\n  brain: ${r.model} -> ${r.modelRes}  (${r.by}, ${r.ms} ms)\n  raw:   ${r.raw}`);
}
const ok = k => rows.filter(r => /sq$/.test(r[k])).length;
console.log(`\nresolved: code alone ${ok('codeRes')}/${rows.length}, with the brain ${ok('modelRes')}/${rows.length}; median ${rows.map(r => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)]} ms a command`);
await b.close();
