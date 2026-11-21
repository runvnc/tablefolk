// interest-report.mjs -- is a living world more interesting, not just
// different? Scored from a live-eval run (live-eval.mjs calls it; also
// `node interest-report.mjs results/live-*.json ...` over saved runs, one
// table row each).
//
// Per run (and per character in `per`):
//   activities        distinct things done per character per game day: the
//                     "doing" labels sampled every 3 s, details and numbers
//                     stripped ("making bread", "talking with tam")
//   chosenByModel     share of activities the model chose: above rails the
//                     agency.js activity events (by model or plan, against
//                     code, safety, fallback); on rails the model's picks,
//                     agenda and "something else" turns against the job
//                     steps code started (doing-label changes)
//   selfInitiated     the model's own lines to someone on turns it was not
//                     answering (kinds free, talk, confront, react, choice,
//                     agenda, goal, raid, open, cause is code-prompted), plus its
//                     own give/sell/attack between characters; `pairs` the
//                     distinct pairs; code-prompted lines (evening topics,
//                     remarks, causes) and templated lines apart
//   plans             day plans written, revised (with the reason), notes
//                     written with plan(...), plan steps done
//   agendaSteps       agenda and goal activities done, goal() commands
//   surprises         activities outside the job routine, chosen by the
//                     model with a stated reason, that succeeded
//   depth             replies that pick up what was just said or a fact the
//                     card reminded it of (two content words shared)
//   failures          FAILED commands, nonsense answers, loops, starving or
//                     weak at the end, idle share of samples, pile-ups (three
//                     or more model lines from different speakers in 10 s);
//                     wastedShare = (failed + nonsense + loops + empty turns) / model calls
//   cost              model calls, output tokens (characters / 4), prompt
//                     tokens read, model seconds; each per game hour
import fs from 'fs';

const SELF = new Set(['free', 'talk', 'confront', 'react', 'choice', 'agenda', 'goal', 'raid']);
const PROMPTED = new Set(['social', 'remark', 'cause', 'open', 'event', 'danger']);
const STOP = new Set('that this with have what your from they them there then than were will would could should about just like know want into been some when where which their only also very much more here come over well back good make made take said says tell told going doing really right still away again ever even after before because maybe today tonight morning evening'.split(' '));
const content = (t, names) => new Set((String(t).toLowerCase().match(/[a-z']{4,}/g) || []).filter(w => !STOP.has(w) && !names.has(w)));
const normLabel = l => String(l || '').toLowerCase().replace(/\(.*$/, '').replace(/\b\d+\b/g, '').replace(/\b(to|from|at|for|with|the|a|an|some|of|in)\b [\w' -]*$/, '').replace(/\s+/g, ' ').trim();

export function interestReport(R) {
  const { cap = {}, raws = [], turns = [], day = null, summary = {} } = R;
  const agents = R.agents || Object.keys(R.minds || {});
  const names = new Set(agents.map(a => a.toLowerCase()));
  const people = new Set((day?.initial || agents).filter(id => agents.includes(id)));
  const samples = cap.samples || day?.samples || [];
  const gameHours = summary.day?.gameHours || (samples.length > 1 ? Math.max(.1, (samples.at(-1).gm - samples[0].gm) / 60) : Math.max(.1, (summary.minutes || 6) / 60 * 24 / ((R.dayMinutes || 12) / 60) / 24));
  const days = Math.max(.25, gameHours / 24);
  const per = {}; const P = id => per[id] ||= { doing: new Set(), byModel: 0, byCode: 0, self: 0, prompted: 0, replies: 0, templated: 0, gifts: 0, trades: 0, conflicts: 0, plans: 0, revised: 0, notes: 0, planDone: 0, agenda: 0, surprises: 0, failedActs: 0, idleSamples: 0, samples: 0 };
  // ---- activities: doing labels
  let lastDoing = {};
  for (const smp of samples) for (const c of smp.chars || []) {
    if (!people.has(c.id) || c.hostile || c.animal) continue;
    const r = P(c.id); r.samples++;
    const l = normLabel(c.doing); if (l) r.doing.add(l);
    if (!l || /^(idle|nothing much|with nothing to do|thinking)/.test(l)) r.idleSamples++;
    if (l && l !== lastDoing[c.id]) { r.transitions = (r.transitions || 0) + 1; lastDoing[c.id] = l; }
  }
  // ---- who chose: activity events above rails; on rails, the picks against the job's steps
  const acts = (cap.activity || []).filter(a => a.phase === 'end' || a.kind === 'raid');
  const calls = cap.calls || [];
  const railsAgents = new Set(Object.entries(R.levels || {}).filter(([, l]) => l === 'rails').map(([id]) => id));
  for (const a of acts) {
    if (!people.has(a.agentId)) continue; const r = P(a.agentId);
    if (a.by === 'model' || a.by === 'plan') r.byModel++; else r.byCode++;
    if (a.outcome === 'failed') r.failedActs++;
    if (a.by === 'plan' && a.outcome === 'done') r.planDone++;
    if (['agenda', 'goal'].includes(a.kind) && a.outcome === 'done') r.agenda++;
    if (!a.routine && a.kind !== 'raid' && (a.by === 'model' || a.by === 'plan') && a.outcome === 'done' && String(a.why || '').trim().length >= 4) r.surprises++;
    if (a.kind === 'give' && a.outcome === 'done') r.gifts++;
  }
  for (const id of people) if (railsAgents.has(id) || !acts.some(a => a.agentId === id)) {
    const r = P(id), picks = calls.filter(c => c.agent === id && ['pick', 'agenda', 'choice'].includes(c.kind)).length;
    if (!acts.some(a => a.agentId === id)) { r.byModel = picks; r.byCode = Math.max(0, (r.transitions || 0) - picks); r.railsEstimate = true; }
  }
  // ---- lines: each voiced line's cause, from the model call of that character just before it
  const callsBy = {}; for (const c of calls) (callsBy[c.agent] ||= []).push(c);
  const kindAt = (id, t) => { const l = (callsBy[id] || []).filter(c => c.t <= t + .5 && t - c.t < 90).at(-1); return l?.kind || ''; };
  const pairs = new Set(), pairsAll = new Set();
  for (const s of cap.says || []) {
    if (!people.has(s.agent)) continue; const r = P(s.agent);
    if (s.tpl) { r.templated++; continue; }
    const k = kindAt(s.agent, s.t), to = s.to ? String(s.to) : '';
    if (k === 'reply') { r.replies++; if (to) pairsAll.add([s.agent, to].sort().join('|')); continue; }
    if (SELF.has(k)) { r.self++; if (to) { pairs.add([s.agent, to].sort().join('|')); pairsAll.add([s.agent, to].sort().join('|')); } }
    else r.prompted++;
  }
  // its own give / sell / attack between characters (a model's command, not code's: no source)
  for (const t of cap.turns || []) {
    if (!people.has(t.agent) || t.reflex || t.source) continue;
    for (const m of String(t.line).matchAll(/\b(give|sell|attack)\(\s*([^)]*)\)/gi)) {
      const args = m[2].split(',').map(x => x.trim().replace(/^["']|["']$/g, '')), other = args.find(a => agents.includes(a) && a !== t.agent) || (m[1].toLowerCase() === 'attack' ? args[0] : '');
      if (!other || !agents.includes(other)) continue;
      const r = P(t.agent); if (m[1].toLowerCase() === 'give') r.gifts++; else if (m[1].toLowerCase() === 'sell') r.trades++; else r.conflicts++;
      pairs.add([t.agent, other].sort().join('|')); pairsAll.add([t.agent, other].sort().join('|'));
    }
  }
  // ---- plans
  for (const p of cap.plans || []) { if (!people.has(p.agentId)) continue; const r = P(p.agentId); if (p.notes) r.notes++; else if (p.revised) r.revised++; else r.plans++; }
  for (const t of cap.turns || []) if (people.has(t.agent) && !t.source && /\bgoal\(/.test(t.line)) P(t.agent).agenda++;
  // ---- conversation depth: replies that pick up what was said to them, or a fact on their card
  let replyTurns = 0, deep = 0;
  for (const t of turns) {
    if (!t.addressed || !t.spoken?.length) continue;
    const p = (R.prompts || []).filter(x => x.agent === t.agent && x.t <= t.t + 2).at(-1)?.text || '';
    const i = p.lastIndexOf('NEW SPEECH ADDRESSED TO YOU:'); const heard = i >= 0 ? p.slice(i + 28).split('\n').filter(l => /^\[/.test(l.trim())).join(' ') : '';
    const mem = (p.match(/You remember: ([^\n]*)/) || [])[1] || '', notes = (p.match(/Your notes: ([^\n]*)/) || [])[1] || '';
    const said = content(t.spoken.join(' '), names), ctx = content(heard, names), facts = content(mem + ' ' + notes, names);
    let a = 0, b = 0; for (const w of said) { if (ctx.has(w)) a++; if (facts.has(w)) b++; }
    replyTurns++; if (a >= 2 || b >= 2) deep++;
  }
  // ---- failures
  const nonsense = (cap.agency || []).filter(x => x.what === 'nonsense').length, loops = (cap.agency || []).filter(x => x.what === 'loop').length;
  const safety = (cap.agency || []).filter(x => x.what === 'safety').length;
  const lastS = samples.at(-1); const starving = lastS ? lastS.chars.filter(c => people.has(c.id) && c.hunger >= .8).map(c => c.id) : [];
  const vs = (cap.says || []).filter(s => !s.tpl).map(s => s.t).sort((a, b) => a - b); let pile = 0;
  for (let i = 2; i < vs.length; i++) if (vs[i] - vs[i - 2] <= 10) { const sp = new Set((cap.says || []).filter(s => !s.tpl && s.t >= vs[i - 2] && s.t <= vs[i]).map(s => s.agent)); if (sp.size >= 3) { pile++; i += 2; } }
  const emptyTurns = turns.filter(t => !t.cmds?.length || (t.cmds.length === 1 && t.cmds[0] === 'emote' && /ponders/.test(t.raw || ''))).length;
  const failed = summary.failedCommands || 0;
  // ---- cost
  const picks = (cap.agency || []).filter(x => x.what === 'pick');
  const modelCalls = calls.length || (raws.length + picks.length);
  const outTok = Math.round((raws.reduce((a, r) => a + String(r.raw || '').length, 0) + picks.reduce((a, p) => a + String(p.detail || '').length, 0)) / 4);
  const promptTok = Math.round(((R.prompts || []).reduce((a, p) => a + (p.text?.length || 0), 0) + picks.reduce((a, p) => a + (p.promptChars || 0), 0)) / 4);
  const modelSec = (raws.reduce((a, r) => a + (r.ms || 0), 0) + picks.reduce((a, p) => a + (p.ms || 0), 0)) / 1000;
  // ---- totals
  const list = Object.entries(per);
  const sum = f => list.reduce((a, [, r]) => a + f(r), 0);
  const byModel = sum(r => r.byModel), byCode = sum(r => r.byCode);
  const out = {
    gameHours: +gameHours.toFixed(1),
    activitiesPerCharDay: +(sum(r => r.doing.size) / Math.max(1, list.length) / days).toFixed(1),
    chosenByModelShare: byModel + byCode ? +(byModel / (byModel + byCode)).toFixed(2) : 0, chosenByModel: byModel, chosenByCode: byCode, railsEstimated: list.some(([, r]) => r.railsEstimate),
    selfInitiatedLines: sum(r => r.self), selfInitiatedActs: sum(r => r.gifts + r.trades + r.conflicts), selfInitiated: sum(r => r.self + r.gifts + r.trades + r.conflicts), pairs: pairs.size, pairsAll: pairsAll.size,
    codePromptedLines: sum(r => r.prompted), replyLines: sum(r => r.replies), templatedLines: sum(r => r.templated),
    gifts: sum(r => r.gifts), trades: sum(r => r.trades), conflicts: sum(r => r.conflicts),
    plansWritten: sum(r => r.plans), plansRevised: sum(r => r.revised), notesWritten: sum(r => r.notes), planStepsDone: sum(r => r.planDone),
    agendaSteps: sum(r => r.agenda), surprises: sum(r => r.surprises),
    depth: replyTurns ? +(deep / replyTurns).toFixed(2) : null, replyTurns,
    failedCommands: failed, failedActivities: sum(r => r.failedActs), nonsense, loops, safetyNets: safety, starvingAtEnd: starving, idleShare: +(sum(r => r.idleSamples) / Math.max(1, sum(r => r.samples))).toFixed(2), pileUps: pile, emptyTurns,
    wastedShare: modelCalls ? +((failed + nonsense + loops + emptyTurns) / modelCalls).toFixed(2) : 0,
    modelCalls, callsPerGameHour: +(modelCalls / gameHours).toFixed(1), outTokensPerGameHour: Math.round(outTok / gameHours), promptTokensPerGameHour: Math.round(promptTok / gameHours), modelSecondsPerGameHour: +(modelSec / gameHours).toFixed(1),
    per: Object.fromEntries(list.map(([id, r]) => [id, { level: R.levels?.[id] || '', activities: r.doing.size, byModel: r.byModel, byCode: r.byCode, self: r.self, gifts: r.gifts, trades: r.trades, conflicts: r.conflicts, plans: r.plans + r.revised, notes: r.notes, surprises: r.surprises, failedActs: r.failedActs }])),
  };
  return out;
}

// node interest-report.mjs results/live-x.json [...]: one row per run
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of process.argv.slice(2)) {
    const R = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = interestReport({ ...R, cap: R.cap || { samples: R.day?.samples, says: R.says, turns: R.capTurns || [], calls: R.day?.calls || R.calls || [], activity: R.activity, plans: R.plans, agency: R.agency }, agents: R.agents || Object.keys(R.minds || {}) });
    console.log(f, JSON.stringify({ ...r, per: undefined }));
  }
}
