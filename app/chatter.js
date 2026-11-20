/* chatter.js -- short templated lines that characters say by code at natural
 * moments, with no model call: a sale ("Two gold for the ale, Tam."), thanks,
 * a greeting when the player walks up to someone at work, a call when stock
 * runs out, raid shouts and the all-clear, going to bed, a guard's challenge
 * at night, asking for and sharing food, an intruder told off.
 *
 * Pools are data: jobs/common/lines.json (shared), a job's "lines" (its own,
 * first), a package's "lines" section. Each kind is a list, or lists by
 * voice (any, plain, gruff, cheerful, timid; the voice comes from the
 * character's temperament and personality). Slots {name} {item} {price}
 * {raiders} {place} {me}; a line with a slot left empty is skipped.
 *
 * Rules: never the same line twice in a row (nor one of its last eight
 * lines, which app.js would drop); at most one line per character per 20
 * real seconds (raid shouts and intruders: 6 s); only with someone with a
 * mind (or the player) within earshot; asleep, it says nothing (an intruder
 * wakes it). Lines are spoken with world-integration.js speakAs: shown and
 * voiced like any line, kept in the speaker's own history as say("...") and
 * told to those in earshot as heard (no answer asked, no model call). They
 * hold no conversational floor (tablefolk-say carries templated: true).
 *
 *   window.tablefolkChatter = { say(g, kind, slots, { to, force }), add(pools, from), reset(), pools, voiceOf, greetTick }
 * Loaded after jobs.js; uses app.js globals (state, getBrainConfig).
 */
(function () {
  const BASE = {};            // kind -> { voice: [lines] } from jobs/common/lines.json
  const PKG = [];             // [{ from, pools }] from packages (reset with the scenario)
  const GAP = 20000, URGENT_GAP = 6000;
  const URGENT = new Set(['raid', 'raid_fighter', 'intruder', 'allclear']);
  const W = () => window.tablefolk, P = () => window.tablefolkPlay, M = () => window.tablefolkMind;
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const norm = v => Array.isArray(v) ? { any: v } : (v && typeof v === 'object' ? v : {});
  function merge(into, pools) {
    for (const [kind, v] of Object.entries(pools || {})) {
      if (kind === 'about') continue;
      const n = norm(v), dst = into[kind] ||= {};
      for (const [voice, list] of Object.entries(n)) if (Array.isArray(list)) dst[voice] = [...(dst[voice] || []), ...list.map(String)];
    }
  }
  const loaded = fetch(new URL('../jobs/common/lines.json', location.href)).then(r => r.ok ? r.json() : {}).then(j => merge(BASE, j)).catch(e => console.warn('[chatter] lines', e));
  function add(pools, from = '') { PKG.push({ from, pools: norm0(pools) }); }
  const norm0 = p => { const o = {}; merge(o, p); return o; };
  function reset() { PKG.length = 0; }

  // gruff, cheerful, timid or plain: its temperament and the words of its personality
  function voiceOf(g) {
    const cfg = W().getBrainConfig(g.id) || {}, words = `${cfg.personality || ''} ${cfg.style || ''}`;
    if (/\b(grumpy|gruff|surly|bitter|cranky|grouchy|stern|blunt|curt|sour|dour)\b/i.test(words)) return 'gruff';
    const t = M()?.temperament?.(cfg);
    if (t === 'timid') return 'timid';
    if (/\b(cheerful|happy|jolly|merry|warm|bubbly|friendly|chatty|bright)\b/i.test(words)) return 'cheerful';
    if (t === 'brave') return 'gruff';
    return 'plain';
  }
  const mindful = c => c && !c.defeated && !P()?.isAnimal?.(c) && !(P()?.isHostile?.(c) && !P()?.talksToo?.(c)) && !c._threat;
  const playerName = () => document.getElementById('chatName')?.value.trim() || '';
  // someone to hear it: a character with a mind, or the player, within earshot
  function listener(g, to) {
    const r = state.earshot || 6, p = posOf(g);
    if (to) { const q = to === state.playerAvatar ? posOf(to) : to.root && posOf(to); return !!q && dist(p, q) <= r; }
    if (state.playerAvatar && !state.playerAvatar.defeated && dist(p, posOf(state.playerAvatar)) <= r) return true;
    return state.characters.some(c => c !== g && mindful(c) && dist(p, posOf(c)) <= r);
  }
  function candidates(g, kind) {
    const v = voiceOf(g), out = [];
    const job = window.tablefolkJobs?.jobOf?.(g), own = norm(job?.lines?.[kind]);
    const take = n => { for (const key of [v, 'any', ...(v === 'plain' ? [] : [])]) out.push(...(n[key] || [])); };
    take(own);
    for (const p of PKG) take(p.pools[kind] || {});
    take(BASE[kind] || {});
    return out;
  }
  function fill(t, slots) {
    let ok = true;
    const s = String(t).replace(/\{(\w+)\}/g, (_, k) => { const v = slots[k]; if (v == null || v === '') { ok = false; return ''; } return String(v).replace(/_/g, ' '); });
    if (!ok) return null;
    return s.replace(/^\s*([a-z])/, c => c.toUpperCase());
  }
  const keyOf = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // one templated line: true when it was spoken
  function say(g, kind, slots = {}, { to = null, force = false } = {}) {
    if (!mindful(g) || state.mind === false) return false;
    if (W().getBrainConfig(g.id)?.enabled === false) return false;
    if (g.pose?.mode === 'lie' && kind !== 'intruder') return false;
    const now = performance.now(), c = g._chatter ||= { at: -1e9, last: '', byKind: {} };
    if (!force && now - c.at < (URGENT.has(kind) ? URGENT_GAP : GAP)) return false;
    if (to && !mindful(to) && to !== state.playerAvatar) return false;
    if (!listener(g, to)) return false;
    const name = to ? (to === state.playerAvatar ? playerName() : to.id) : (slots.name ?? '');
    const all = { me: g.id, ...slots, name };
    const recent = new Set(g._said || []);
    const lines = candidates(g, kind).map(t => fill(t, all)).filter(t => t && t !== c.last && t !== c.byKind[kind] && !recent.has(keyOf(t)));
    if (!lines.length) return false;
    const text = lines[Math.floor(Math.random() * lines.length)];
    const r = window.tablefolkTalk?.speak?.(g, text, { to: to || null, templated: kind });
    if (!r) return false;
    c.at = now; c.last = text; c.byKind[kind] = text;
    return true;
  }

  // the player walks up to someone at work (within 2 cells): a greeting, once a game day each
  function greetTick() {
    const pl = state.playerAvatar, J = window.tablefolkJobs, K = window.tablefolkClock;
    if (!pl || pl.defeated || !J || !K?.running || !window.tablefolkLive?.on) return;
    const day = K.now()?.day || 1, h = K.hour?.() ?? 12;
    for (const g of state.characters) {
      if (!mindful(g) || !J.handles?.(g) || g.pose?.mode === 'lie' || dist(posOf(g), posOf(pl)) > 2.2) continue;
      const s = g._job; if (!s || (s.greetedDay === day)) continue;
      const j = J.jobOf(g), hours = j?.hours || [7, 17], inH = hours[0] <= hours[1] ? h >= hours[0] && h < hours[1] : h >= hours[0] || h < hours[1];
      if (!inH) continue;
      if (say(g, 'greet', {}, { to: pl })) s.greetedDay = day;
    }
  }
  setInterval(() => { try { greetTick(); } catch (e) { console.warn('[chatter] greet', e); } }, 1000);
  addEventListener('tablefolk-scenario-started', e => { if (!e.detail?.sub) for (const g of state.characters || []) g._chatter = null; });

  window.tablefolkChatter = { say, add, reset, voiceOf, greetTick, loaded, get pools() { return { base: BASE, packages: PKG }; } };
})();
