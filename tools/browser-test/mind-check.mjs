// Quick checks of mind.js against the real model in the test Chrome (page
// already loaded with a model, e.g. after agenttest): model reflection and
// gossip between two characters, and the card a character gets.
//   node mind-check.mjs [--base=URL]
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
page.on('console', m => { if (/\[mind\]/.test(m.text())) console.log('  [page]', m.text().slice(0, 300)); });
// a fresh page (the code on disk), on the model given (default E4B)
const model = process.argv.find(a => a.startsWith('--model='))?.slice(8) || 'gemma4-e4b-litert', base = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:8000';
// no voices: a remembered Breeze choice makes the server start Breeze (2 GB of the card)
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); } catch {} });
await page.goto(base + '/app/?norender=1&model=' + model);
for (let t0 = Date.now(); ;) {
  const s = await page.evaluate(() => ({ ready: !!window.TABLEFOLK_SCENE_READY && !!window.tablefolkScenario, consent: !document.getElementById('modelConsent')?.hidden, brain: document.getElementById('brainStatus')?.textContent || '' }));
  if (s.consent) { console.log('needs a download; stopping'); process.exit(2); }
  if (/click load/i.test(s.brain)) await page.evaluate(() => document.getElementById('loadBrains')?.click());
  if (s.ready && /ready/i.test(s.brain)) break;
  if (Date.now() - t0 > 240000) { console.log('timed out', s.brain); process.exit(3); }
  await new Promise(r => setTimeout(r, 1000));
}
const r = await page.evaluate(async () => {
  const scn = { v: 1, title: 'mind check', base: 'plain', size: [11, 9], lighting: 'bright', player: { name: 'Ana', at: [0, 3] },
    allowed: ['say', 'emote', 'give'],
    agents: [{ id: 'bram', model: 'peasant', at: [0, 0], personality: 'a gentle farmer who grows turnips. Friendly but no pushover.', secret: 'You buried stolen silver under the old oak.', agenda: 'win the turnip prize at the fair' },
      { id: 'pip', model: 'peasant', at: [2, 0], personality: 'a nosy baker who loves news.' }] };
  await window.tablefolkScenario.playScenario(scn, { testing: true });
  const M = window.tablefolkMind, A = tablefolk.getAgents(), bram = A.find(a => a.id === 'bram'), pip = A.find(a => a.id === 'pip');
  for (let i = 0; i < 3; i++) M.event(bram, 'attacked', { by: 'grub' });
  M.event(bram, 'given', { who: 'Ana', what: 'a loaf of bread' });
  M.event(bram, 'heard', { who: 'Ana', text: "Hi, I'm Ana. I'm looking for my lost cat. I'll bring you 5 gold tomorrow." });
  M.addMemory(bram, 'The fair is in three days.', 2, 'note');
  M.addMemory(bram, 'Grub stole turnips from the field.', 2, 'event');
  const card = M.cardLines(bram);
  const t0 = performance.now(); await M.reflectWithModel(bram); const ms = Math.round(performance.now() - t0);
  const thoughts = M.mindOf(bram).mem.filter(e => e.kind === 'thought').map(e => e.text);
  window.dispatchEvent(new CustomEvent('tablefolk-say', { detail: { agentId: 'bram', text: 'That brute grub attacked me again, three times now!', voiced: true } }));
  const t1 = performance.now(); await M.planDay(pip); const planMs = Math.round(performance.now() - t1);
  return { planGoal: tablefolk.getBrainConfig('pip').goal, plan: M.mindOf(pip).plan, planMs, card, ms, thoughts, pipHeard: M.recall(pip, 5), tier: M.tier(bram) };
});
console.log(JSON.stringify(r, null, 1));
await b.close().catch(() => {});
