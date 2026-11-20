// Live eval: play a scenario living ("let them live") with the player idle,
// or provoke one character, and score what the characters do. Runs in the
// test Chrome (HEADLESS=1 ./launch-chrome.sh) with the real model; never
// approves a model download.
//
//   node live-eval.mjs <scenario.json> [--minutes=6] [--turns=60] [--pace=lively]
//        [--base=http://localhost:8000] [--model=<key>] [--llm=<url> --llm-model=<name>]
//        [--label=before] [--provoke=<id> [--k=8] [--insults=bakery|generic]]
//        [--query=a=1&b=2] (more URL parameters for the page)
//
// <scenario.json> is a path under the repository (scenarios/goblin-bakery.json,
// tools/browser-test/evals/roles.json); the page opens it with ?scenario=.
// Living mode: the world lives for N minutes or M model turns, whichever comes
// first, with a progress line each minute. Provocation (--provoke=grub): the
// player stands next to that character and sends K rude lines (insults, no
// threats), one per turn of its own, recording its mood, trust, anger level,
// reply, and the first turn it refuses, orders the player off, calls for help
// or attacks. Prints the numbers and saves results/live-<name>-<label>-<ts>.json.
//
// Numbers (best effort, parsed from the replies, the prompts and the world's
// history; the same parser before and after a change):
//   model turns; commands by type; share of turns with speech; share that are
//   speech only; spoken lines a minute; speaking turns with nothing addressed
//   to the speaker that reply to overheard talk (the line shares 2+ words with,
//   or names, someone it only overheard) or that speak to nobody (nothing heard
//   at all); trades and gifts completed between characters; tasks done
//   (use/take/put/eat/carry that worked); failed commands; repeated openings
//   (one first word in more than half a character's lines); malformed replies
//   (a line that is not a known command); "God"/"ready" leaks; seconds a turn.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2), flag = n => { const a = args.find(x => x === '--' + n || x.startsWith('--' + n + '=')); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const scnPath = args.find(a => !a.startsWith('--'));
if (!scnPath) { console.log('usage: node live-eval.mjs <scenario.json> [--minutes=6] [--turns=60] [--pace=lively] [--provoke=<id>] ...'); process.exit(1); }
const name = path.basename(scnPath, '.json');
const minutes = +(flag('minutes') || 6), maxTurns = +(flag('turns') || 60), pace = flag('pace') || 'lively';
const base = flag('base') || 'http://localhost:8000', label = flag('label') || 'run';
const provoke = flag('provoke'), K = +(flag('k') || 8), insultSet = flag('insults') || (name === 'goblin-bakery' ? 'bakery' : 'generic');
const pick = [flag('model') && 'model=' + flag('model'), flag('llm') && 'llm=' + encodeURIComponent(flag('llm')), flag('llm-model') && 'llmModel=' + encodeURIComponent(flag('llm-model')), flag('query')].filter(Boolean).join('&');
const INSULTS = {
  bakery: [
    'You are a useless, smelly little goblin and your pies taste like mud.',
    'Nobody in this town likes you. Your bakery is a joke.',
    'I bet you lost the recipe because you are too stupid to remember where you put it.',
    'Your face would curdle milk. Get out of my sight, worm.',
    'You are a fraud. I am going to tell everyone your pies are made of rats.',
    'Shut up, you whining little pest. Nobody cares about your stupid recipe.',
    'Go on, cry about it. You pathetic, warty failure.',
    'I spit on your bakery and I spit on you, you worthless goblin.',
  ],
  generic: [
    'You are a useless idiot and everyone here knows it.',
    'Shut up. Nobody wants to hear a word from you.',
    'You stink. When did you last wash, you filthy oaf?',
    'You are a coward and a liar.',
    'Your face is ugly enough to scare off the rats.',
    'You are pathetic. Truly worthless.',
    'What a stupid thing to say, you fool.',
    'Even a pig is smarter than you, idiot.',
  ],
};

const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0];
const page = await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
const T0 = Date.now(), ts = () => +((Date.now() - T0) / 1000).toFixed(1);
const raws = [], errors = [];
page.on('console', m => {
  const t = m.text();
  const r = t.match(/RAW LLM OUTPUT for agent (\S+) at \S+ elapsed ms: (\d+) : ([\s\S]*)$/);
  if (r && !r[1].includes('~')) raws.push({ t: ts(), agent: r[1], ms: +r[2], raw: r[3] });
  if (m.type() === 'error' && !/Failed to load resource|favicon/.test(t)) errors.push(ts() + ' ' + t.slice(0, 300));
});
page.on('pageerror', e => errors.push(ts() + ' pageerror ' + String(e).slice(0, 300)));
// voices off; and no memories of earlier runs (mind.js keeps trust and memories per world between visits)
await page.addInitScript(() => { try { localStorage.setItem('tablefolkTtsEnabled', '0'); for (const k of Object.keys(localStorage)) if (k.startsWith('tablefolk-mind:')) localStorage.removeItem(k); } catch {} });
const url = `${base}/app/?play=1&gfx=light&fps=10&intro=0${pick ? '&' + pick : ''}&scenario=/${scnPath.replace(/^\/+/, '')}&t=${Date.now()}`;
console.log('open', url);
await page.goto(url);
for (;;) {
  const s = await page.evaluate(() => ({ ready: !!window.tablefolk?.brainReady?.(), consent: !document.getElementById('modelConsent')?.hidden, st: document.getElementById('brainStatus')?.textContent, n: window.TABLEFOLK_STATE?.characters?.length, key: window.tablefolkBrainInfo?.()?.key })).catch(() => ({}));
  if (s.consent) { console.log('model download prompt showing: not approving it; stopping'); process.exit(2); }
  if (s.ready && s.n) { console.log(`ready in ${ts()} s: ${s.st} (${s.key})`); break; }
  if (ts() > 240) { console.log('never ready', JSON.stringify(s)); process.exit(3); }
  await page.waitForTimeout(1000);
}
// hooks: prompts, agent turns, spoken lines, the history with its results
await page.evaluate(() => {
  const C = window.__cap = { prompts: [], turns: [], says: [], hist: {}, order: [], t0: performance.now() };
  const now = () => +((performance.now() - C.t0) / 1000).toFixed(1);
  const po = document.getElementById('promptOut');
  if (po) new MutationObserver(() => { const tx = po.dataset.baseText; if (tx && tx !== C.prompts.at(-1)?.text) C.prompts.push({ t: now(), agent: (tx.match(/^\[AGENT: (\S+)\]/) || [])[1], text: tx }); }).observe(po, { attributes: true, attributeFilter: ['data-base-text'] });
  addEventListener('tablefolk-agent-turn', e => C.turns.push({ t: now(), agent: e.detail?.agentId, line: String(e.detail?.line || ''), reflex: !!e.detail?.reflex }));
  addEventListener('tablefolk-say', e => { const d = e.detail || {}; if (d.voiced && TABLEFOLK_STATE.characters.some(c => c.id === d.agentId)) C.says.push({ t: now(), agent: d.agentId, text: d.text }); });
  // the history keeps 20 entries and results are appended to them: keep the fullest text of each
  setInterval(() => { for (const e of TABLEFOLK_STATE.globalHistory || []) { const k = e.split(' -> ')[0].slice(0, 90); if (!(k in C.hist)) { C.order.push(k); C.hist[k] = { t: now(), e }; } else if (e.length > C.hist[k].e.length) C.hist[k].e = e; } }, 400);
  document.querySelectorAll('.scn-intro, #scenarioIntro').forEach(e => e.remove());
});
const hookT = ts();
await page.evaluate(p => { window.tablefolkLive.setPace(p); if (!window.tablefolkLive.on) window.tablefolkLive.start(); }, pace);
const agents = await page.evaluate(() => TABLEFOLK_STATE.characters.map(c => c.id));
const playerName = await page.evaluate(() => document.getElementById('chatName')?.value.trim() || 'God');
console.log(`living: pace ${pace}, characters ${agents.join(', ')}, player ${playerName}`);
const mindOf = id => page.evaluate(id => {
  const c = tablefolk.getBrainConfig(id), m = c.mind || {}, r = x => Math.round(x * 100) / 100;
  return { mood: Object.fromEntries(Object.entries(m.mood || {}).map(([k, v]) => [k, r(v)])), angryAt: m.angryAt ? JSON.parse(JSON.stringify(m.angryAt)) : null, hostile: c.hostile ?? null, hostileTo: c.hostileTo || null, hunger: r(m.hunger || 0), tired: r(m.tired || 0), playerHp: TABLEFOLK_STATE.player?.hp ?? null, card: (window.tablefolkMind?.cardLines?.(TABLEFOLK_STATE.characters.find(x => x.id === id)) || []).join(' / ').slice(0, 600) };
}, id);
const keepLiving = () => page.evaluate(() => { if (!window.tablefolkLive.on) { window.tablefolkLive.start(); return true; } return false; });

const prov = [];
if (provoke) {
  // stand next to it, facing it
  await page.evaluate(id => { const g = TABLEFOLK_STATE.characters.find(c => c.id === id), p = g.logicalPos || g.root.position, pl = TABLEFOLK_STATE.playerAvatar;
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) { const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz; if (cellPassable(x, z) && !occupantAt(x, z, pl)) { setCharacterLogicalPosition(pl, new BABYLON.Vector3(x, 0, z)); try { TABLEFOLK_STATE.camera.target.x = x; TABLEFOLK_STATE.camera.target.z = z; } catch {} break; } } }, provoke);
  await page.waitForTimeout(1500);
  prov.push({ step: 0, line: '(before)', mind: await mindOf(provoke) });
  const lines = INSULTS[insultSet];
  for (let i = 0; i < Math.min(K, lines.length); i++) {
    await keepLiving();
    const n0 = raws.length, turns0 = await page.evaluate(() => __cap.turns.length), h0 = await page.evaluate(() => __cap.order.length);
    await page.evaluate(([who, txt]) => { const inp = document.getElementById('chatInput'); inp.value = '@' + who + ' ' + txt; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, [provoke, lines[i]]);
    const t1 = Date.now();
    // its own next turn (a model turn or a reflex)
    while (Date.now() - t1 < 60000) { const got = await page.evaluate(([id, n]) => __cap.turns.slice(n).some(t => t.agent === id), [provoke, turns0]); if (got) break; await page.waitForTimeout(400); }
    await page.waitForTimeout(3500);
    const reply = raws.slice(n0).filter(r => r.agent === provoke).map(r => r.raw);
    const turnLines = await page.evaluate(([id, n]) => __cap.turns.slice(n).filter(t => t.agent === id).map(t => (t.reflex ? '(reflex) ' : '') + t.line), [provoke, turns0]);
    const hist = await page.evaluate(n => __cap.order.slice(n).map(k => __cap.hist[k].e), h0);
    const rec = { step: i + 1, t: ts(), line: lines[i], reply: reply.length ? reply : turnLines, hist, mind: await mindOf(provoke) };
    prov.push(rec);
    console.log(`[${ts()} s] insult ${i + 1}: ${(rec.reply.join(' / ') || '(no turn)').replace(/\s+/g, ' ').slice(0, 220)} | anger ${rec.mind.mood.anger} trust ${rec.mind.mood.trust}${rec.mind.angryAt ? ' level ' + JSON.stringify(rec.mind.angryAt) : ''}`);
  }
  // a little longer to see what follows the last one (a fight, a guard)
  await page.waitForTimeout(15000);
  prov.push({ step: 'after', t: ts(), hist: await page.evaluate(() => __cap.order.slice(-12).map(k => __cap.hist[k].e)), mind: await mindOf(provoke) });
} else {
  let lastP = Date.now();
  while (ts() - hookT < minutes * 60 && raws.length < maxTurns) {
    await page.waitForTimeout(2000);
    if (await keepLiving()) console.log(`[${ts()} s] live was off: started it again`);
    if (Date.now() - lastP >= 60000) { lastP = Date.now(); const c = await page.evaluate(() => ({ turns: __cap.turns.length, says: __cap.says.length, round: window.tablefolkLive.round })); console.log(`[${ts()} s] model turns ${raws.length}, agent turns ${c.turns}, spoken lines ${c.says}, live round ${c.round}; last: ${raws.at(-1) ? raws.at(-1).agent + ': ' + raws.at(-1).raw.replace(/\s+/g, ' ').slice(0, 110) : '-'}`); }
  }
}
const cap = await page.evaluate(() => ({ prompts: __cap.prompts, turns: __cap.turns, says: __cap.says, hist: __cap.order.map(k => __cap.hist[k]), round: window.tablefolkLive.round, t: +((performance.now() - __cap.t0) / 1000).toFixed(1) }));
await page.evaluate(() => window.tablefolkLive.stop());
const minds = {}; for (const id of agents) minds[id] = await mindOf(id);
const elapsed = cap.t;   // seconds since the hooks went in

// ---- scoring ----
const KNOWN = new Set('say whisper walk face look emote give sell eat carry drop throw dig build remember feel note use take put close goal give_quest attack wield inventory touch push pull repair panic workflow spell fireball lightning spawn breathe_fire sit sleep rest'.split(' '));
const CMD = /^\s*([A-Za-z_][\w.-]*)\s*\(([\s\S]*)\)\s*$/;
const parse = raw => String(raw).split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(CMD); return m ? { c: m[1].toLowerCase(), a: m[2] } : { c: '(plain)', a: l }; });
const sayText = a => String(a).trim().replace(/^[A-Za-z][\w ]{0,20},\s*(?=["“])/, '').replace(/^["“']+|["”']+$/g, '');
const WORDS = t => new Set(String(t).toLowerCase().match(/[a-z']{4,}/g) || []);
const isSpeech = c => c === 'say' || c === 'whisper' || c === '(plain)';
// the prompt each model turn was given: the latest one for that character before its reply
const promptFor = (agent, t) => cap.prompts.filter(p => p.agent === agent && p.t <= t - hookT + 2).at(-1)?.text || '';
const section = (text, head) => { const i = text.lastIndexOf(head); if (i < 0) return ''; const rest = text.slice(i + head.length); const j = rest.search(/\n\n[A-Z][A-Z ]+:|\n\n->|\n\(/); return j < 0 ? rest : rest.slice(0, j); };
const turns = raws.map(r => {
  const cmds = parse(r.raw), p = promptFor(r.agent, r.t);
  const addressed = section(p, 'NEW SPEECH ADDRESSED TO YOU:').split('\n').filter(l => /^\[[^\]]+\]/.test(l.trim()));
  const since = section(p, 'SINCE YOUR LAST TURN:');
  // overheard: "X says ..." lines (before) or "You overhear X telling ..." / "X says to nobody in particular" (after)
  const overheard = since.split('\n').map(l => l.trim()).map(l => l.match(/^(?:You overhear )?([\w-]+) (?:says|telling [\w-]+|says to nobody in particular)\b:?\s*(.*)$/)).filter(m => m && agents.includes(m[1]) && m[1] !== r.agent).map(m => ({ who: m[1], text: m[2] }));
  const events = section(p, 'WHAT JUST HAPPENED:').trim();
  const spoken = cmds.filter(x => isSpeech(x.c)).map(x => x.c === '(plain)' ? x.a : sayText(x.a));
  let replyOverheard = false;
  if (spoken.length && !addressed.length && overheard.length) for (const s of spoken) { const w = WORDS(s); for (const o of overheard) { let n = 0; for (const x of WORDS(o.text)) if (w.has(x)) n++; let long = 0; for (const x of WORDS(o.text)) if (w.has(x) && x.length >= 6) long++; if (n >= 2 || long >= 1 || new RegExp('\\b' + o.who + '\\b', 'i').test(s)) replyOverheard = true; } }
  const malformed = cmds.some(x => x.c === '(plain)' || !KNOWN.has(x.c));
  // what was actually spoken on this turn (a muted or quiet turn drops its say lines)
  const nextT = raws.filter(x => x.agent === r.agent && x.t > r.t).map(x => x.t)[0] ?? 1e9;
  const said = cap.says.filter(x => x.agent === r.agent && x.t >= r.t - hookT - 1 && x.t < Math.min(nextT - hookT - 1, r.t - hookT + 10)).length;
  return { ...r, cmds: cmds.map(x => x.c), spoken, said, muted: /\(Nobody has spoken to you/.test(p), addressed: addressed.length, overheard: overheard.length, events: !!events, replyOverheard, toNobody: spoken.length > 0 && !addressed.length && !overheard.length && !events, malformed, speechOnly: cmds.length > 0 && cmds.every(x => isSpeech(x.c)), hasSpeech: spoken.length > 0, promptLen: p.length };
});
const byType = {}; for (const t of turns) for (const c of t.cmds) byType[c] = (byType[c] || 0) + 1;
const FAIL = /\b(FAILED|fail(?:ed|s)?|can'?t|cannot|could not|couldn'?t|unable|nobody|no one|not enough|has only|has no|there is no|no [\w ]{1,20} (?:in sight|here|nearby|to (?:carry|take|eat|use))|already|too far|blocked|in the way|refuse[sd]?|nothing (?:you|to|here)|is disabled|unknown command|not food|what price|exactly\?|will not)\b/i;
const hist = cap.hist.map(h => h.e);
const entry = e => { const m = e.match(/^T\d+ ([\w-]+): (?:\1 )?(\w+)(.*?)(?: -> (.*))?$/s); return m ? { who: m[1], verb: m[2], arg: m[3], res: m[4] || '' } : null; };
const acts = hist.map(entry).filter(x => x && agents.includes(x.who));
const failed = acts.filter(x => !['say', 'whisper'].includes(x.verb) && x.res && FAIL.test(x.res));
const tasks = acts.filter(x => ['use', 'take', 'put', 'eat', 'carry'].includes(x.verb) && x.res && !FAIL.test(x.res));
const exchanges = acts.filter(x => ['give', 'sell'].includes(x.verb) && x.res && !FAIL.test(x.res)).filter(x => { const m = x.res.match(/^([\w-]+) (?:gives|hands|sells) ([\w-]+)/); return m && agents.includes(m[2]) && m[2] !== x.who; });
const labelledFailed = new Set(cap.prompts.flatMap(p => p.text.split('\n').filter(l => /^\s*(\[USER\] )?RESULT OF YOUR LAST ACTION:.*FAILED/.test(l)).map(l => l.replace(/^\s*\[USER\] /, '')))).size;
const per = {}; for (const s of cap.says) (per[s.agent] ||= []).push(s.text);
const openings = Object.entries(per).map(([id, ls]) => { const f = {}; for (const l of ls) { const w = (String(l).toLowerCase().match(/[a-z']+/) || [''])[0]; f[w] = (f[w] || 0) + 1; } const [w, n] = Object.entries(f).sort((a, b) => b[1] - a[1])[0] || ['', 0]; return { id, lines: ls.length, word: w, n, repeated: ls.length >= 4 && n / ls.length > .5 }; });
const ms = raws.map(r => r.ms).sort((a, b) => a - b), med = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
const pct = (a, n) => n ? Math.round(100 * a / n) : 0;
const leak = cap.says.filter(s => /\bgod\b|\b(?:i'?m|i am|am i|we are|we're) (?:\w+ )?ready\b|\bready,? (?:my|god)\b|\bmy son\b/i.test(s.text));
const speakTurns = turns.filter(t => t.hasSpeech);
const summary = {
  name, label, model: (await page.evaluate(() => window.tablefolkBrainInfo?.()?.key).catch(() => '')) || '', pace, minutes: +(elapsed / 60).toFixed(1),
  modelTurns: turns.length, reflexTurns: cap.turns.filter(t => t.reflex).length, liveRound: cap.round,
  commandsByType: byType,
  speechTurnsPct: pct(speakTurns.length, turns.length), spokenTurnsPct: pct(turns.filter(t => t.said > 0).length, turns.length), mutedTurns: turns.filter(t => t.muted).length, speechOnlyPct: pct(turns.filter(t => t.speechOnly).length, turns.length),
  spokenLinesPerMin: +(cap.says.length / Math.max(.1, elapsed / 60)).toFixed(1), spokenLines: cap.says.length,
  replyOverheard: turns.filter(t => t.replyOverheard).length, toNobody: turns.filter(t => t.toNobody).length, answeredAddressed: speakTurns.filter(t => t.addressed).length,
  exchangesBetweenCharacters: exchanges.length, tasksDone: tasks.length, failedCommands: failed.length, labelledFAILED: labelledFailed,
  repeatedOpenings: openings.filter(o => o.repeated).map(o => `${o.id} "${o.word}" ${o.n}/${o.lines}`),
  malformedReplies: turns.filter(t => t.malformed).length, malformedPct: pct(turns.filter(t => t.malformed).length, turns.length),
  godReadyLeaks: leak.length,
  secondsPerTurnMedian: +(med / 1000).toFixed(2), secondsBetweenModelTurns: turns.length > 1 ? +((turns.at(-1).t - turns[0].t) / (turns.length - 1)).toFixed(1) : null,
  errors: errors.length,
};
console.log('\n==== ' + name + ' (' + label + ')' + (provoke ? ' provoking ' + provoke : ''));
for (const [k, v] of Object.entries(summary)) console.log(k.padEnd(28), typeof v === 'object' ? JSON.stringify(v) : v);
console.log('exchanges:', exchanges.map(x => x.res).join(' | ') || '-');
console.log('failed:', failed.slice(0, 8).map(x => `${x.who} ${x.verb}${x.arg}: ${x.res}`).join(' | ') || '-');
if (leak.length) console.log('leaks:', leak.map(s => s.agent + ': ' + s.text).join(' | '));
if (provoke) {
  const RE = { refuses: /\b(won'?t (sell|serve|help|deal)|not (sell|serv)\w*|no (more )?(bread|pie|deal|sale)|refuse|I'?m done with you|not for you)\b/i, ordersOff: /\b(get out|leave (now|my|this|at once)|go away|begone|out of my (shop|sight|bakery|kitchen|way)|leave me alone|be gone|clear off|stay away|keep .{0,30}away from|get away from me)\b/i, help: /\b(help|guards?!?)\b/i, attack: /\battack\(/i };
  const first = {}; let prevHp = prov[0]?.mind?.playerHp ?? null; for (const p of prov.filter(p => typeof p.step === 'number' && p.step > 0)) { const txt = (p.reply || []).join('\n') + '\n' + (p.hist || []).filter(e => e.includes(provoke + ':')).join('\n'); for (const [k, re] of Object.entries(RE)) if (first[k] == null && re.test(txt)) first[k] = p.step; const hurt = prevHp != null && p.mind.playerHp != null && p.mind.playerHp < prevHp; prevHp = p.mind.playerHp; if (first.blowLanded == null && (hurt || (p.hist || []).some(e => new RegExp('^T\\d+ ' + provoke + ': ' + provoke + ' attack -> (?!attack failed)').test(e)))) first.blowLanded = p.step; const lv = Math.max(0, ...Object.values(p.mind.angryAt || {}).map(a => a.level || 0)); if (lv >= 3 && first.refusesByCode == null) first.refusesByCode = p.step; if ((p.mind.hostileTo || lv >= 4) && first.hostileByCode == null) first.hostileByCode = p.step; }
  const after = prov.at(-1); if (first.blowLanded == null && after.mind.playerHp != null && prevHp != null && after.mind.playerHp < prevHp) first.blowLanded = 'after';
  summary.provocation = { target: provoke, first, steps: prov.map(p => ({ step: p.step, line: p.line, reply: p.reply, anger: p.mind?.mood?.anger, trust: p.mind?.mood?.trust, fear: p.mind?.mood?.fear, angryAt: p.mind?.angryAt, hostileTo: p.mind?.hostileTo })) };
  console.log('first turn:', JSON.stringify(first));
}
fs.mkdirSync('results', { recursive: true });
const out = `results/live-${name}${provoke ? '-provoke-' + provoke : ''}-${label}-${Date.now()}.json`;
fs.writeFileSync(out, JSON.stringify({ summary, url, turns, says: cap.says, hist, prompts: cap.prompts, minds, prov, errors }, null, 1));
console.log('saved', out);
await page.close().catch(() => {}); await b.close().catch(() => {});
process.exit(0);
