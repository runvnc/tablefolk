// Does a monster (or animal) that was told something starve everyone else's
// turns in a living world? live.js due() serves characters with something in
// pendingChat first; a monster's or animal's turn never took it in, so it
// stayed "pending" and was picked again and again (cause 8 of the 2026-11-19
// survey). This loads evals/survival-one.json (tam, a woodcutter with a
// mind, and fang, a mindless wolf), lives at the busy pace, puts one event
// in the wolf's pendingChat, and counts tam's turns over N seconds.
//
//   node live-pending-test.mjs [seconds=40] [--base=http://localhost:8000]
// Passes when tam got turns and the wolf's pendingChat is empty again.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), secs = +(args.find(a => /^\d+$/.test(a)) || 40);
const base = (args.find(a => a.startsWith('--base=')) || '--base=http://localhost:8000').slice(7);
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0], page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); } catch {} });
await page.goto(`${base}/app/?play=1&gfx=light&fps=10&intro=0&scenario=/tools/browser-test/evals/survival-one.json&t=${Date.now()}`);
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !document.getElementById('modelConsent')?.hidden, n: window.TABLEFOLK_STATE?.characters?.length })).catch(() => ({}));
  if (s.consent) { console.log('model not cached: not approving a download'); process.exit(2); }
  if (s.ready && s.n) break;
  if (Date.now() - t0 > 180000) { console.log('never ready'); process.exit(3); }
  await page.waitForTimeout(1000);
}
const r = await page.evaluate(async secs => {
  const turns = [];
  addEventListener('tablefolk-agent-turn', e => turns.push(e.detail?.agentId));
  // the wolf far from the player and from tam, so it only wanders
  const S = TABLEFOLK_STATE, wolf = S.characters.find(c => c.id === 'fang'), tam = S.characters.find(c => c.id === 'tam'), pl = S.playerAvatar;
  // the wolf as far as it can be from tam and the player (out of sight: it wanders)
  let best = null, bd = -1;
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) { if (!cellPassable(x, z) || occupantAt(x, z, wolf)) continue; const d = Math.min(Math.hypot(x - tam.root.position.x, z - tam.root.position.z), Math.hypot(x - pl.root.position.x, z - pl.root.position.z)); if (d > bd) { bd = d; best = [x, z]; } }
  if (best) setCharacterLogicalPosition(wolf, new BABYLON.Vector3(best[0], 0, best[1]));
  tablefolk.setBrainConfig('fang', { pendingChat: ['[event] A bird lands on a branch above fang.'] });
  window.tablefolkLive.setPace('busy'); if (!window.tablefolkLive.on) window.tablefolkLive.start();
  await new Promise(r => setTimeout(r, secs * 1000));
  window.tablefolkLive.stop();
  return { tamTurns: turns.filter(t => t === 'tam').length, all: turns.length, wolfPending: tablefolk.getBrainConfig('fang').pendingChat || [], wolfAt: wolf && [wolf.root.position.x, wolf.root.position.z] };
}, secs);
console.log(JSON.stringify(r));
const ok = r.tamTurns > 0 && !r.wolfPending.length;
console.log(ok ? 'PASS: tam took turns and the wolf is not left pending' : 'FAIL: ' + (r.tamTurns ? '' : 'tam got no turns; ') + (r.wolfPending.length ? 'the wolf is still pending' : ''));
await page.close().catch(() => {}); await b.close().catch(() => {});
process.exit(ok ? 0 : 1);
