// Talk report: how much the characters of a live-eval run said, and how.
// Used by live-eval.mjs at the end of a run, and on its own over saved runs
// (results/live-*.json), so older runs can be scored the same way:
//
//   node talk-report.mjs results/live-hearthvale-a3-1795193565893.json [...]
//
// Lines are split into templated (said by code from a pool: chatter.js marks
// them; in runs from before it, the guards' "Good day, maren." greetings)
// and model lines; by the game clock into day (05-17), evening (17-21, the
// social window) and night; per game hour. Model lines to another character:
// the pairs that talked and the biggest pair's share; questions (lines ending
// "?"). With the day's data: model calls, job cycles, who ended hungry (and
// why, when the run recorded it).
import fs from 'fs';

const CODE_GREETING = /^(Quiet night|Morning|Good day|Evening), [\w' -]+\.$/;
export function talkReport(run) {
  const says = run.says || [], day = run.day || null, S = day?.samples || [];
  const agents = new Set((S[0]?.chars || []).map(c => c.id).concat(says.map(s => s.agent)));
  const gmAt = t => { if (!S.length) return null; let a = S[0]; for (const s of S) { if (s.t <= t) a = s; else { const f = (t - a.t) / Math.max(.1, s.t - a.t); return a.gm + f * (s.gm - a.gm); } } return a.gm; };
  const part = gm => { if (gm == null) return 'all'; const h = ((gm % 1440) + 1440) % 1440 / 60; return h >= 17 && h < 21 ? 'evening' : h >= 5 && h < 17 ? 'day' : 'night'; };
  const lines = says.map((s, i) => {
    const tpl = s.tpl != null ? !!s.tpl : CODE_GREETING.test(String(s.text).trim());
    let to = s.to ?? null;
    if (to == null && s.tpl == null) {
      const named = [...agents].find(id => id !== s.agent && new RegExp('\\b' + id + '\\b', 'i').test(s.text));
      const next = says.slice(i + 1).find(x => x.agent !== s.agent && x.t - s.t < 20);
      to = named || next?.agent || null;
    }
    const gm = gmAt(s.t);
    return { ...s, tpl, to, gm, part: part(gm), q: /\?["'”]?\s*$/.test(String(s.text).trim()) };
  });
  const hours = { day: 0, evening: 0, night: 0 };
  for (let i = 1; i < S.length; i++) hours[part(S[i].gm)] += (S[i].gm - S[i - 1].gm) / 60;
  const gameHours = S.length ? (S.at(-1).gm - S[0].gm) / 60 : null, minutes = run.summary?.minutes || (says.at(-1)?.t ?? 0) / 60;
  const per = (n, h) => h ? +(n / h).toFixed(1) : null;
  const model = lines.filter(l => !l.tpl), tpl = lines.filter(l => l.tpl);
  const split = list => Object.fromEntries(['day', 'evening', 'night'].map(p => [p, { lines: list.filter(l => l.part === p).length, perGameHour: per(list.filter(l => l.part === p).length, hours[p]) }]));
  const pairs = {};
  for (const l of model) if (l.to && l.to !== 'player' && agents.has(l.to)) { const k = [l.agent, l.to].sort().join('-'); pairs[k] = (pairs[k] || 0) + 1; }
  const pairLines = Object.values(pairs).reduce((a, b) => a + b, 0);
  const evePairs = {}; for (const l of model.filter(l => l.part === 'evening')) if (l.to && l.to !== 'player' && agents.has(l.to)) { const k = [l.agent, l.to].sort().join('-'); evePairs[k] = (evePairs[k] || 0) + 1; }
  const out = {
    lines: lines.length, templated: tpl.length, model: model.length,
    gameHours: gameHours && +gameHours.toFixed(1), realMinutes: +minutes.toFixed(1),
    perGameHour: { all: per(lines.length, gameHours), templated: per(tpl.length, gameHours), model: per(model.length, gameHours) },
    model_by_part: S.length ? split(model) : null, templated_by_part: S.length ? split(tpl) : null,
    pairs, pairsThatTalked: Object.keys(pairs).length, topPairShare: pairLines ? +(Math.max(...Object.values(pairs)) / pairLines).toFixed(2) : 0,
    eveningPairs: evePairs,
    questions: model.filter(l => l.q).length, questionsToCharacters: model.filter(l => l.q && l.to && l.to !== 'player').length,
    templatedKinds: tpl.reduce((o, l) => (o[l.kind || '?'] = (o[l.kind || '?'] || 0) + 1, o), {}),
  };
  if (day?.calls) out.modelCalls = day.calls.length;
  const sum = run.summary?.day;
  if (sum) {
    out.jobCycles = Object.fromEntries(Object.entries(sum.per).map(([id, r]) => [id + ' (' + (r.job || '-') + ')', r.cycles]));
    out.hungryAtEnd = Object.entries(sum.per).filter(([, r]) => (r.hungerEnd ?? 0) >= .55).map(([id, r]) => `${id} ${r.hungerEnd}${r.hungerWhy ? ' (' + r.hungerWhy + ')' : ''}`);
    out.modelCallsByKind = sum.totals?.callsByKind;
  }
  if (!S.length && minutes) out.perRealMinute = { model: +(model.length / minutes).toFixed(1), templated: +(tpl.length / minutes).toFixed(1) };
  return out;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  for (const f of process.argv.slice(2)) {
    const run = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log('==== ' + f);
    for (const [k, v] of Object.entries(talkReport(run))) console.log(k.padEnd(22), typeof v === 'object' ? JSON.stringify(v) : v);
  }
}
