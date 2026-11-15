// Books with the in-browser model: Mira answers from her herbal, then the book
// goes to Bram and he answers from it. Needs the cached Gemma 4 E2B on :8000.
//   node books-chat-test.mjs
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = b.contexts()[0].pages()[0];
await page.goto('http://localhost:8000/app/?play=1&norender=1&intro=0&scenario=/tools/browser-test/scenarios/books.json&t=' + Date.now());
for (let i = 0; i < 120; i++) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !document.getElementById('modelConsent')?.hidden, txt: document.getElementById('modelLoadText')?.textContent }));
  if (s.consent) { console.log('model download prompt: not approving; stop'); process.exit(2); }
  if (s.ready) break; if (i % 10 == 0) console.log('loading', s.txt); await page.waitForTimeout(1000);
}
console.log('model', await page.evaluate(() => localStorage.getItem('tablefolk_model')));
async function ask(to, text) {
  const n0 = await page.evaluate(() => (state.globalHistory || []).length);
  await page.selectOption('#chatTo', to).catch(() => {});
  await page.fill('#chatInput', text); await page.click('#chatSend');
  let got = null;
  for (let i = 0; i < 90 && !got; i++) { await page.waitForTimeout(1000); got = await page.evaluate(([n0, to]) => state.globalHistory.slice(n0).find(l => new RegExp('^(T\\d+ )?' + to + ': ' + to + ' say', 'i').test(l)) || null, [n0, to]); }
  const prompt = await page.evaluate(() => document.getElementById('promptOut')?.dataset.baseText || '');
  console.log('\n> ' + text + '\n' + (got || '(no reply)') + '\n  book line in prompt: ' + (prompt.match(/Your book[^\n]{0,160}/)?.[0] || 'none'));
}
await ask('mira', 'Mira, my son broke his arm falling from the hayloft. What should I do?');
await ask('mira', 'Lovely weather today, isn\'t it?');
await ask('mira', 'I cannot sleep at night. Is there anything for that?');
await ask('mira', 'The kids found some sweet black berries behind the mill. Are they safe?');
// hand the book from mira to bram (the same thing give() does to the packs)
await page.evaluate(() => { const t = "The Herbalist's Companion", m = getBrainConfig('mira'), br = getBrainConfig('bram'); m.inventory.items = m.inventory.items.filter(i => i.name !== t); setBrainConfig('mira', { inventory: m.inventory }); const inv = charInventory(state.characters.find(c => c.id === 'bram')); inv.items.push({ name: t, qty: 1 }); setBrainConfig('bram', { inventory: inv }); });
await ask('bram', 'Bram, I cut my hand on the scythe and it keeps bleeding. What do I do?');
await ask('mira', 'Mira, what was that herb for broken bones again?');
await b.close();
