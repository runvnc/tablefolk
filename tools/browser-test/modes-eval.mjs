// modes-eval.mjs -- the game modes measured with a real brain (modes.js): what the player waits for.
//
//   node modes-eval.mjs --mode=adventure|living|turns [--model=<key>] [--scenario=scenarios/hearthvale.json]
//        [--autonomy=rails|assisted|guided|free] [--base=http://localhost:8000] [--rounds=3] [--lines=3]
//        [--label=x]   (results/modes-<mode>-<label>.json)
//
//   adventure: model calls while the player explores (expected 0), then walks up to someone and talks
//              (--lines lines): seconds to the first streamed words and to the whole line, then walks away:
//              the encounter's end, its memory, model calls in the 30 s after (expected 0)
//   living:    the village lives for 60 s (busy above rails with --autonomy=guided), then the player talks to
//              the nearest character: the model queue's length at each line, seconds to the first words and to
//              the line; model calls by characters farther than modeRadius (expected 0)
//   turns:     a line to the nearest, then --rounds rounds: seconds per round and per turn, who took them, its
//              answer in the first, early turns used and dropped
//   when:      the world living, with "modeWhen": {"fight": "turns", "talk": "adventure", "indoors": "turns"} set on
//              it: a line to the nearest (adventure while the encounter is open), the encounter ended (living),
//              a villager turned on the player beside it (turns, and living again 6 s after), the player
//              put inside a room (turns, living outside); each with the mode and its source
// Never approves a model download (stops when the consent prompt shows). Uses the test Chrome (CDP_PORT, 9223).
import { chromium } from 'playwright-core';
import fs from 'fs';
const args = process.argv.slice(2), flag = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const mode = flag('mode', 'adventure'), model = flag('model', ''), scn = flag('scenario', 'scenarios/hearthvale.json'), autonomy = flag('autonomy', '');
const base = flag('base', 'http://localhost:8000'), rounds = +flag('rounds', 3), nLines = +flag('lines', 3), label = flag('label', model || 'default');
const T0 = Date.now(), say = s => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`), out = { mode, model, scn, autonomy, at: new Date().toISOString() };
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = await b.contexts()[0].newPage(); await page.setViewportSize({ width: 1000, height: 700 });
const errs = [], raws = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const trace = [];
page.on('console', m => { if (/^\[reply\]/.test(m.text())) trace.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + m.text()); });
page.on('console', m => { const r = m.text().match(/RAW LLM OUTPUT for agent (\S+) at \S+ elapsed ms: (\d+) : ([\s\S]*)$/); if (r) raws.push({ t: (Date.now() - T0) / 1000, agent: r[1], ms: +r[2], out: r[3].slice(0, 200) }); });
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); for (const k of Object.keys(localStorage)) if (k.startsWith('tablefolk-mind:')) localStorage.removeItem(k); } catch {} });
await page.goto(`${base}/app/?play=1&gfx=light&fps=15&intro=0&probe=0${mode === 'when' ? '' : '&mode=' + mode}${model ? '&model=' + model : ''}${autonomy ? '&autonomy=' + autonomy : ''}&scenario=/${scn.replace(/^\/+/, '')}&t=${Date.now()}`);
await page.waitForFunction(() => window.tablefolkModes && window.TABLEFOLK_STATE?.playerAvatar, null, { timeout: 120000 });
for (let i = 0; ; i++) {
  const st = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !!document.getElementById('approveModelDownload')?.offsetParent, status: document.getElementById('brainStatus')?.textContent || '' }));
  if (st.consent && process.env.APPROVE_DOWNLOAD === '1') { await page.evaluate(() => document.getElementById('approveModelDownload')?.click()); await page.waitForTimeout(2000); continue; }   // a rented test machine (tools/cloud-gpu)
  if (st.consent) { say('the model is not cached here (download consent showing): stopping'); process.exit(2); }
  if (st.ready) { say('brain ready: ' + st.status); out.brain = st.status; break; }
  if (i > 450) { say('the brain did not load in 15 minutes'); process.exit(3); }
  if (i % 15 === 0) say('waiting for the brain: ' + st.status);
  await page.waitForTimeout(2000);
}
await page.evaluate(() => {
  window.__calls = []; addEventListener('tablefolk-model-call', e => { const g = TABLEFOLK_STATE.characters.find(c => c.id === e.detail.agentId), p = TABLEFOLK_STATE.playerAvatar; __calls.push({ t: performance.now(), ...e.detail, d: g && p ? Math.round(Math.hypot((g.logicalPos || g.root.position).x - (p.logicalPos || p.root.position).x, (g.logicalPos || g.root.position).z - (p.logicalPos || p.root.position).z)) : null }); });
  window.__enc = []; addEventListener('tablefolk-encounter', e => __enc.push(e.detail));
  window.__said = []; addEventListener('tablefolk-say', e => __said.push({ t: performance.now(), id: e.detail.agentId, text: e.detail.text }));
  window.__turns = []; addEventListener('tablefolk-turn', e => __turns.push({ t: performance.now(), ...e.detail }));
  window.__rounds = []; addEventListener('tablefolk-round', e => __rounds.push({ t: performance.now(), ...e.detail }));
});
await page.waitForFunction(() => window.tablefolkLive?.on || !window.tablefolkScenario?.active?.scn?.live, null, { timeout: 60000 }).catch(() => say('live never started'));
const near = () => page.evaluate(() => {
  const P = TABLEFOLK_STATE.playerAvatar, pos = g => g.logicalPos || g.root.position;
  const ppl = TABLEFOLK_STATE.characters.filter(c => !c.defeated && !tablefolkPlay.isAnimal(c) && !tablefolkPlay.isHostile(c)).sort((a, b) => Math.hypot(pos(a).x - pos(P).x, pos(a).z - pos(P).z) - Math.hypot(pos(b).x - pos(P).x, pos(b).z - pos(P).z));
  const g = ppl[0], p = pos(g);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cellPassable(Math.round(p.x) + dx, Math.round(p.z) + dz)) { setCharacterLogicalPosition(P, new BABYLON.Vector3(Math.round(p.x) + dx, 0, Math.round(p.z) + dz)); break; }
  tablefolk.selectCharacter(g); return g.id;
});
// one line to someone: the queue then, the first streamed words, the whole line
async function talk(who, text) {
  const q = await page.evaluate(() => window.tablefolkModelQueue?.waiting ?? null);
  const n0 = await page.evaluate(id => __said.filter(x => x.id === id).length, who), t = Date.now();
  await page.fill('#chatInput', text); await page.click('#chatSend');
  let first = null;
  for (let i = 0; i < 600; i++) {
    const s = await page.evaluate(id => ({ n: __said.filter(x => x.id === id).length, stream: !!document.querySelector('.bubble.streaming'), last: __said.filter(x => x.id === id).slice(-1)[0]?.text }), who);
    if (s.stream && first == null) first = (Date.now() - t) / 1000;
    if (s.n > n0) { const r = { text, queued: q, firstWords: first, line: (Date.now() - t) / 1000, said: s.last }; say(`  ${who}: ${r.line.toFixed(1)} s (first words ${first?.toFixed(1) ?? '-'} s, ${q ?? '?'} calls queued at the send): "${s.last}"`); return r; }
    await page.waitForTimeout(250);
  }
  say(`  ${who}: no answer in 150 s`); return { text, queued: q, firstWords: first, line: null };
}
const LINES = ['Good morning! What are you busy with today?', 'Is there bread to be had in this village?', 'Who here would know about the old road north?', 'Thank you. I will be back later.'];
if (mode === 'adventure') {
  const c0 = raws.length; await page.waitForTimeout(40000);
  out.exploring = { seconds: 40, modelOutputs: raws.length - c0 }; say(`exploring 40 s: ${out.exploring.modelOutputs} model outputs (expected 0)`);
  const who = await near(); await page.waitForTimeout(600);
  out.talk = []; for (let i = 0; i < nLines; i++) out.talk.push(await talk(who, LINES[i % LINES.length]));
  await page.evaluate(id => { const g = TABLEFOLK_STATE.characters.find(c => c.id === id), p = g.logicalPos || g.root.position; let far = null, fd = 0; for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) { if (!cellPassable(x, z)) continue; const d = Math.hypot(x - p.x, z - p.z); if (d > fd) { fd = d; far = [x, z]; } } setCharacterLogicalPosition(TABLEFOLK_STATE.playerAvatar, new BABYLON.Vector3(far[0], 0, far[1])); }, who);
  await page.waitForFunction(() => __enc.some(e => e.phase === 'end'), null, { timeout: 150000 }).catch(() => {});
  const c1 = raws.length; await page.waitForTimeout(30000);
  out.after = await page.evaluate(id => { const g = TABLEFOLK_STATE.characters.find(c => c.id === id); return { encounters: __enc, mayThink: tablefolkModes.mayThink(g), level: tablefolkAgency.level(g), memory: (tablefolkMind.mindOf(g)?.mem || []).filter(m => /You talked with/.test(m.text)).map(m => m.text).slice(-1)[0] || null }; }, who);
  out.after.modelOutputs30s = raws.length - c1;
  say(`walked away: ${JSON.stringify(out.after.encounters.filter(e => e.phase === 'end').map(e => e.reason))}; then ${out.after.modelOutputs30s} model outputs in 30 s (expected 0); memory: ${out.after.memory}`);
}
if (mode === 'living') {
  say('the village lives for 60 s'); await page.waitForTimeout(60000);
  const who = await near(); await page.waitForTimeout(600);
  out.talk = []; for (let i = 0; i < nLines; i++) out.talk.push(await talk(who, LINES[i % LINES.length]));
  out.calls = await page.evaluate(() => ({ all: __calls.length, R: tablefolkModes.options.radius, far: __calls.filter(c => c.d != null && c.d > tablefolkModes.options.radius).map(c => c.agentId + '@' + c.d) }));
  say(`model calls: ${out.calls.all}; by characters farther than ${out.calls.R}: ${out.calls.far.length} ${out.calls.far.slice(0, 8).join(' ')}`);
}
if (mode === 'turns') {
  out.rounds = [];
  // a line to the nearest before the first round: it answers on its turn (a model call in the round)
  const who = await near(); await page.waitForTimeout(600);
  await page.fill('#chatInput', LINES[0]); await page.click('#chatSend'); out.spokeTo = who; say(`said to ${who}: it answers on its turn`);
  for (let r = 0; r < rounds; r++) {
    await page.waitForTimeout(1500);
    const t = Date.now(), n0 = await page.evaluate(() => __turns.length);
    await page.evaluate(() => tablefolkModes.endTurn());
    await page.waitForFunction(k => __rounds.length > k, r, { timeout: 900000 }).catch(() => {});
    const x = await page.evaluate(n => { const ts = __turns.slice(n), end = __rounds.slice(-1)[0]; return { order: end?.order, early: end?.early, turns: ts.map((u, i) => ({ id: u.agentId, s: +(((ts[i + 1]?.t ?? end?.t ?? performance.now()) - u.t) / 1000).toFixed(1) })) }; }, n0);
    x.seconds = (Date.now() - t) / 1000; out.rounds.push(x);
    say(`round ${r + 1}: ${x.seconds.toFixed(1)} s; ${x.turns.map(u => u.id + ' ' + u.s + 's').join(', ')}; early turns ${JSON.stringify(x.early)}`);
    if (r === 0) { x.answer = await page.evaluate(id => __said.filter(z => z.id === id).map(z => z.text).slice(-1)[0] || null, who); say(`  ${who} said: ${x.answer}`); }
  }
}
if (mode === 'when') {
  out.when = [];
  const look = async (what, want, ms = 8000) => {
    const t = Date.now(); let m;
    for (;;) { m = await page.evaluate(() => ({ mode: tablefolkModes.mode(), source: tablefolkModes.source })); if (m.mode === want || Date.now() - t > ms) break; await page.waitForTimeout(200); }
    const r = { what, want, ...m, ok: m.mode === want, s: (Date.now() - t) / 1000 }; out.when.push(r);
    say(`${r.ok ? 'ok  ' : 'MISS'} ${what}: ${m.mode} (${m.source}) after ${r.s.toFixed(1)} s, want ${want}`); return r;
  };
  await page.evaluate(() => { tablefolkScenario.active.scn.modeWhen = { fight: 'turns', talk: 'adventure', indoors: 'turns' }; });
  await look('living, nothing going on', 'living');
  const who = await near(); await page.waitForTimeout(600);
  await page.fill('#chatInput', LINES[0]); await page.click('#chatSend');
  await look('a line to ' + who, 'adventure');
  await page.waitForFunction(id => __said.some(x => x.id === id), who, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => tablefolkModes.encounter.end('test'));
  await look('the encounter ended', 'living');
  const foe = await page.evaluate(id => { const g = TABLEFOLK_STATE.characters.find(c => c.id === id); tablefolk.setBrainConfig?.(g.id, { hostileTo: { player: Date.now() } }) ?? (getBrainConfig(g.id).hostileTo = { player: Date.now() }); return g.id + ' ' + JSON.stringify(getBrainConfig(g.id).hostileTo); }, who);
  say('hostile: ' + foe);
  await look('a villager turned on the player beside it', 'turns');
  await page.evaluate(id => { const c = getBrainConfig(id); delete c.hostileTo; }, who);
  await look('the fight over (6 s hold)', 'living', 15000);
  const room = await page.evaluate(() => { const r = (window.tablefolkRoofs?.rooms || []).find(r => r?.cells?.size); if (!r) return null; const k = [...r.cells].find(k => { const [x, z] = k.split(',').map(Number); return cellPassable(x, z); }) || [...r.cells][0]; const [x, z] = k.split(',').map(Number); setCharacterLogicalPosition(TABLEFOLK_STATE.playerAvatar, new BABYLON.Vector3(x, 0, z)); return k + ' of ' + tablefolkRoofs.rooms.length + ' rooms'; });
  say('inside: ' + room);
  if (room) await look('the player indoors', 'turns');
  await page.evaluate(() => { const P = TABLEFOLK_STATE.playerAvatar; for (let d = 1; d < 40; d++) for (const [x, z] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const px = Math.round((P.logicalPos || P.root.position).x) + x, pz = Math.round((P.logicalPos || P.root.position).z) + z, k = px + ',' + pz; if (cellPassable(px, pz) && !(tablefolkRoofs.rooms || []).some(r => r.cells?.has?.(k))) { setCharacterLogicalPosition(P, new BABYLON.Vector3(px, 0, pz)); return; } } });
  if (room) await look('the player outdoors again', 'living', 15000);
  say(`modeWhen: ${out.when.filter(r => r.ok).length}/${out.when.length}`);
}
out.replyTrace = trace; if (trace.length) say('reply trace:\n    ' + trace.join('\n    '));
for (const r of raws) say(`  model ${r.agent} ${r.ms} ms at ${r.t.toFixed(1)}s`);
out.modelOutputs = raws; out.errors = errs;
fs.mkdirSync('results', { recursive: true }); const f = `results/modes-${mode}-${label}.json`; fs.writeFileSync(f, JSON.stringify(out, null, 1));
say(`saved ${f}; page errors: ${errs.length ? errs.join(' / ') : 'none'}`);
await page.close(); await b.close().catch(() => {});
