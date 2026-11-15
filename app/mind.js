/* mind.js -- what a character feels, needs, wants and remembers.
 *
 * A 2B model can't be trusted to remember that the player hit it eight turns
 * ago, or that it is hungry. So the game keeps that, the same way for every
 * character, and each turn the prompt gets a few short lines (cardLines):
 *
 *   You feel: angry (Ana attacked you), nervous.
 *   Body: hungry.
 *   You want: eat something: eat(turnip).
 *   Current goal: sell the sword (7 turns on it: what is the next step?)
 *   You remember: Ana attacked you. | Ana gave you 10 gold.
 *
 * Mood: joy, fear, anger, sadness (0..1) and trust (toward the player, 0..1,
 *   .5 neutral). Events move them; each of its turns they drift back to its
 *   temperament ("brave" | "timid" | "calm", else guessed from personality).
 * Needs: hunger and tiredness rise with its turns; eat(item) and
 *   emote(sleep) or use(bed) bring them down (sitting a little: uses.js). Off for the undead, and for every character
 *   with the scenario's "needs": false.
 * Memory: events the game records by itself (attacks, gifts, sales, deaths
 *   seen), what the character notes with remember(text), and facts: the
 *   scenario's "lore" and the agent's "knows". Each turn the few most relevant
 *   are shown, by word overlap with what was just said and its goal, weight
 *   and recency (an embedding model could replace the scoring: score()).
 *
 *   window.tablefolkMind.event(g, kind, detail)   app.js, combat.js, play.js
 *   window.tablefolkMind.cardLines(g)             app.js buildAgentPrompt
 *   window.tablefolkMind.remember / feel / eat    the commands
 * Loaded after app.js; uses its globals (state, getBrainConfig, charInventory).
 */
(function () {
  const MOODS = ['joy', 'fear', 'anger', 'sadness'];
  const UNDEAD = /skeleton|zombie|ghost|slime/i;
  const FOOD = /\b(bread|apple|turnip|cheese|meat|stew|pie|fish|carrot|potato|soup|meal|berr(y|ies)|egg|cake|ham|sausage|onion|cabbage|pear|plum|grapes?|nuts?|jerky|ration|biscuit|porridge|mushroom|roll|pastry|honey)s?\b/i;
  // Food: anything tagged "food" in a loaded asset pack (its "nourish", 0..1,
  // says how much hunger it takes away), a scenario's "food" list, or the
  // everyday words above. Returns how much it nourishes (0: not food).
  function isFood(name) {
    const n = String(name || '').toLowerCase().trim(), type = n.replace(/\s+/g, '_');
    const items = window.tablefolkPacks?.items || {};
    const it = items[type] || Object.values(items).find(i => i.aliases?.includes(type));
    if (it?.tags?.includes('food')) return it.nourish ?? .6;
    const own = (state.food || []).find(f => n === String(f.name ?? f).toLowerCase() || n.includes(String(f.name ?? f).toLowerCase()));
    if (own) return +(own.nourish ?? .6);
    return FOOD.test(n) ? .6 : 0;
  }
  const STOP = new Set('the and you your for are was were with that this have has had not but what who how why where when can will would could should about there their them they then than its it\'s i\'m me my mine our out all any some just very much more most into from over under also only does did doing been being here like want wants know think tell said says say yes okay please thanks'.split(' '));
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const isPlayerName = n => String(n || '').toLowerCase() === playerName().toLowerCase() || n === 'player';

  function temperament(cfg) {
    const t = String(cfg.temperament || '').toLowerCase();
    if (['brave', 'timid', 'calm'].includes(t)) return t;
    const words = (cfg.personality || '') + ' ' + (cfg.style || '') + ' ' + (cfg.role || '');
    if (/\b(brave|bold|fierce|proud|grumpy|tough|stern|guard|knight|warrior|soldier|captain|angry|hot-?headed|stubborn)\b/i.test(words)) return 'brave';
    if (/\b(shy|timid|nervous|scared|fearful|meek|anxious|cowardly|small|little|child|kid)\b/i.test(words)) return 'timid';
    return 'calm';
  }
  function baseline(cfg) {
    const grumpy = /\b(grumpy|gruff|surly|bitter|cranky|grouchy)\b/i.test(cfg.personality || '');
    const cheerful = /\b(cheerful|happy|jolly|merry|warm|kind|friendly|gentle)\b/i.test(cfg.personality || '');
    return { joy: cheerful ? .2 : .08, fear: 0, anger: grumpy ? .15 : 0, sadness: 0, trust: .5 };
  }
  function mindOf(g) {
    const cfg = getBrainConfig(g.id);
    if (!cfg.mind) {
      const b = baseline(cfg);
      // a little spread so a village doesn't all get hungry on the same turn
      const r = (s => () => (s = (s * 9301 + 49297) % 233280) / 233280)([...g.id].reduce((a, c) => a + c.charCodeAt(0), 7));
      cfg.mind = { mood: { ...b }, why: {}, hunger: r() * .25, tired: r() * .2, mem: [], turn: 0, goal: cfg.goal || '', goalTurn: 0, feel: null };
      restore(g, cfg.mind);
    }
    return cfg.mind;
  }
  // ---- remembered between visits ----
  // What a character knows about the player, its beliefs and weightier
  // memories, and its trust are kept in this browser per world and
  // character, so coming back to a world a week later it still knows you
  // ("They have visited before"). Not in tests; "remembers": false
  // on the scenario turns it off.
  const active = () => window.tablefolkScenario?.active;
  function memKey(g) {
    const a = active(); if (!a || a.testing || a.scn?.remembers === false) return null;
    const t = String(a.scn?.title || '') + '|' + (a.scn?.agents || []).map(x => x.id).join(',');
    let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'tablefolk-mind:' + (h >>> 0).toString(36) + ':' + g.id;
  }
  function restore(g, m) {
    const k = memKey(g); if (!k) return;
    try {
      const v = JSON.parse(localStorage.getItem(k) || 'null'); if (!v) return;
      if (v.pf) m.pf = { ...v.pf, met: 0, last: 0, gap: 0, visits: (v.pf.visits || 1) + 1, talks: v.pf.talks || 0, talksAtStart: v.pf.talks || 0 };
      m.mem = (v.mem || []).map(e => ({ ...e, turn: 0 }));
      if (v.rel) m.rel = v.rel;
      if (typeof v.trust === 'number') m.mood.trust = .5 + (v.trust - .5) * .7;   // a little faded
    } catch {}
  }
  function persist() {
    for (const g of state.characters || []) {
      const m = getBrainConfig(g.id)?.mind, k = m && memKey(g); if (!k) continue;
      if (!m.pf && !m.mem.some(e => e.w >= 2)) continue;
      const mem = m.mem.filter(e => e.w >= 2 || ['belief', 'thought', 'note'].includes(e.kind)).slice(-12).map(({ text, w, kind, n, src, who, pi }) => ({ text, w, kind, n, src, who, pi }));
      try { localStorage.setItem(k, JSON.stringify({ pf: m.pf, mem, rel: m.rel, trust: m.mood.trust, at: Date.now() })); } catch {}
    }
  }
  setInterval(persist, 20000);
  window.addEventListener('pagehide', persist);

  const needsOn = g => state.needs !== false && !UNDEAD.test(g.charModel || '');

  // ---- memory ----
  function addMemory(g, text, w = 1, kind = 'event') {
    const m = mindOf(g); text = String(text || '').trim().slice(0, 160); if (!text) return;
    const same = m.mem.find(e => e.text.toLowerCase() === text.toLowerCase() || e.src?.toLowerCase() === text.toLowerCase());
    if (same?.src) { same.n++; same.turn = m.turn; same.text = PATTERNS[same.pi]?.[1](same.who, same.n) || same.text; return; }
    if (same) { same.turn = m.turn; same.w = Math.max(same.w, w); same.n = (same.n || 1) + 1; if (same.n >= 3) consolidate(g); return; }
    m.mem.push({ text, w, kind, turn: m.turn });
    // keep the weightiest and the newest
    if (m.mem.length > 40) { m.mem.sort((a, b) => (b.w + b.turn * .05) - (a.w + a.turn * .05)); m.mem.length = 32; m.mem.sort((a, b) => a.turn - b.turn); }
  }
  const words = s => String(s || '').toLowerCase().match(/[a-z][a-z'-]{2,}/g)?.filter(w => !STOP.has(w)).map(w => w.replace(/(ies|es|s)$/, '')) || [];
  function overlap(a, ctx) { let n = 0; for (const w of new Set(words(a))) if (ctx.has(w)) n++; return n; }
  function context(g) {
    const m = mindOf(g), cfg = getBrainConfig(g.id);
    return new Set(words([m.heard || '', cfg.goal || '', cfg.quest || ''].join(' ')));
  }
  // Meaning (embed.js, EmbeddingGemma): how close each memory or fact is to
  // what was just said, worked out in prepare() before the turn. Raw
  // cosines bunch together (0.6-0.8 for everything), so each is scored
  // against the others: standard deviations above the mean (z). Measured:
  // "Is there any trouble around here?" -> "Three sheep went missing" z 2.2;
  // "How do you feel about me?" -> "Ana attacked you" 1.3, "gave you 10 gold" 1.6.
  const simOf = (m, t) => { const z = m.sim?.map.get(t); return z == null ? 0 : Math.max(0, z - .5) * 2.5; };
  const query = (g, m) => { const cfg = getBrainConfig(g.id); return [m.heard || '', cfg.goal || '', cfg.quest || ''].join(' ').trim(); };
  const ownFacts = g => { const cfg = getBrainConfig(g.id); return (Array.isArray(cfg.knows) ? cfg.knows : []).map(String); };
  const loreFacts = () => (Array.isArray(state.lore) ? state.lore : []).map(String);
  // Off for worlds with "memory": false and for simple-mode characters (a tiny
  // model's prompt has no recalled facts, so the embedder would load for nothing).
  const noRecall = g => window.tablefolkScenario?.active?.scn?.memory === false || !!window.tablefolk?.isSimpleBrain?.(g, getBrainConfig(g.id));
  async function prepare(g) {
    const E = window.tablefolkEmbed; if (!E || E.state === 'off' || noRecall(g)) return;
    if (E.state !== 'ready') { E.start(); return; }
    const m = mindOf(g), q = query(g, m);
    if (!q) { m.sim = null; return; }
    if (m.sim?.q === q && m.sim.n === m.mem.length) return;
    const texts = [...new Set([...m.mem.map(e => e.text), ...ownFacts(g), ...loreFacts()])];
    try {
      const cos = await E.similar(q, texts); if (!cos) { m.sim = null; return; }
      const v = [...cos.values()], mu = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.max(.02, Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length));
      const map = new Map(); for (const [t, c] of cos) map.set(t, v.length < 3 ? (c - .62) / .05 : (c - mu) / sd);
      m.sim = { q, n: m.mem.length, map };
    } catch (e) { console.warn('[mind] embed', e); }
  }
  function score(e, ctx, now, m) { return e.w * .5 + overlap(e.text, ctx) * 2 + simOf(m, e.text) + 1.5 / (1 + (now - e.turn) / 6); }
  function recall(g, n = 3) {
    const m = mindOf(g), ctx = context(g);
    return m.mem.map(e => ({ e, s: score(e, ctx, m.turn, m) })).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.e)
      .sort((a, b) => a.turn - b.turn).map(shown);
  }
  // What it knows: its own facts ("knows") always, the most relevant first;
  // then world lore that fits what was said, or, when none does, one piece
  // in turn so it has something true to talk about (an innkeeper asked for
  // news made up gossip while the village lore went unused).
  // story.js: facts that hold now (a flag set: "the player found the cat") come first, always
  function facts(g, n = 4) { const story = window.tablefolkStory?.factsFor(g) || []; return [...story, ...baseFacts(g, n)]; }
  function baseFacts(g, n = 4) {
    const m = mindOf(g), ctx = context(g), rel = t => overlap(t, ctx) * 2 + simOf(m, t);
    const own = ownFacts(g).map(t => ({ t, s: rel(t) })).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.t);
    const lore = loreFacts().filter(t => !own.includes(t)), room = Math.max(1, n - own.length);
    // a short lore list is shown whole, best first (for a vague "any trouble
    // around here?" the vectors barely tell three facts apart)
    const raw = t => overlap(t, ctx) * 2 + (m.sim?.map.get(t) ?? 0);
    if (lore.length <= 3) return [...own, ...lore.slice().sort((a, b) => raw(b) - raw(a))];
    const fit = lore.map(t => ({ t, s: rel(t) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, room).map(x => x.t);
    if (!fit.length) fit.push(m.sim ? lore.slice().sort((a, b) => raw(b) - raw(a))[0] : lore[(m.turn || 0) % lore.length]);
    return [...own, ...fit];
  }

  // ---- what it knows about the player (the "player file") ----
  // A small model forgets the player's name and errand in a few turns, and
  // what makes a character feel alive is that it doesn't. The game keeps,
  // per character, what the player told it about themselves, what they
  // asked for, what they promised, and how they treated it; two short lines
  // on the card ("About Ana: ..."). Read from the player's own words with
  // plain patterns, so it costs no model call.
  function pfOf(g) { const m = mindOf(g); return m.pf ||= { met: m.turn, talks: 0, name: '', wants: [], promises: [], said: [], gifts: [], hits: 0 }; }
  const clip = (t, n = 70) => String(t || '').replace(/\s+/g, ' ').replace(/[.!?,;:\s]+$/, '').trim().slice(0, n);
  const keep = (list, t, n = 3) => { t = clip(t); if (!t || t.length < 3) return; const i = list.findIndex(x => x.toLowerCase() === t.toLowerCase()); if (i >= 0) list.splice(i, 1); list.push(t); if (list.length > n) list.shift(); };
  // the player's words about themselves, as the character would put them
  const theirs = t => String(t).replace(/\b(my|mine|me|myself|i'm|i am|i)\b/gi, w => ({ my: 'their', mine: 'theirs', me: 'them', myself: 'themselves', "i'm": "they're", 'i am': 'they are', i: 'they' })[w.toLowerCase()]).replace(/\byou\b/gi, 'you').replace(/\byour\b/gi, 'your');
  function learnFromPlayer(g, text) {
    const pf = pfOf(g), t = String(text || '').trim(); if (!t) return;
    const now = mindOf(g).turn; pf.gap = pf.last != null ? now - pf.last : 0; pf.talks++; pf.last = now;
    const before = pf.wants.join('|') + '#' + pf.promises.join('|');
    let r;
    if ((r = t.match(/\b(?:my name is|my name's|call me|i am called|name'?s)\s+([A-Z][\w'-]{1,20})/i)) || (r = t.match(/\b(?:i'?m|i am)\s+([A-Z][a-z'-]{1,20})\b(?![\w\s]*\b(?:years|tired|hungry|sorry|lost|looking|here|fine|good|ok))/))) pf.name = r[1];
    for (const sent of t.split(/(?<=[.!?])\s+/)) {
      const sn = sent.replace(/\bim\b/gi, "I'm").replace(/,?\s*please\b/gi, '');
      if ((r = sn.match(/\b(?:i'?ll|i will|i'?m going to|i am going to)\s+((?:kill|hurt|beat|stab|burn|rob|get)\s+you\b.{0,40})/i))) { keep(pf.threats ||= [], theirs(r[1])); const m = mindOf(g); push(g, temperament(getBrainConfig(g.id)) === 'brave' ? 'anger' : 'fear', .3, `${playerName()} threatened you`); m.mood.trust = clamp01(m.mood.trust - .2); continue; }
      if ((r = sn.match(/\bi (?:want|need|would like|'d like) you to\s+(.{3,80})/i))) { keep(pf.wants, 'you to ' + theirs(r[1])); continue; }
      if ((r = sn.match(/\b(i(?:'m| am) (?:looking|searching) for|i need to|i want to|i(?:'d| would) like to|i(?:'m| am) trying to|i came (?:here )?to|help me(?: to)?|i need|i want|i(?:'d| would) like|i came (?:here )?for)\s+(.{3,80})/i))) keep(pf.wants, (/looking|searching|for$/i.test(r[1]) ? 'find ' : /^i (need|want)$|like$/i.test(r[1]) ? 'get ' : '') + theirs(r[2]));
      else if ((r = sn.match(/^(?:can|could|would|will) you\s+(.{3,80})\?/i))) keep(pf.wants, 'you to ' + theirs(r[1]));
      if ((r = sn.match(/\b(?:i promise(?: to| that i'?ll)?|i swear(?: to| i'?ll)?|i'?ll|i will)\s+((?:bring|pay|give|come back|return|find|get|help|fetch|kill|deal with|save|protect|tell)\b.{0,70})/i))) keep(pf.promises, theirs(r[1]));
      if ((r = sn.match(/\bi(?:'m| am) ((?:a|an|the)\s+[\w\s'-]{2,40}|from\s+[\w\s'-]{2,40})/i))) keep(pf.said, theirs(r[1]));
      else if ((r = sn.match(/\bi (live|work|love|like|hate|fear|have)\s+([\w\s'-]{2,40})/i))) keep(pf.said, ({ have: 'has' }[r[1].toLowerCase()] || r[1].toLowerCase() + 's') + ' ' + theirs(r[2]));
    }
    // something new they want or promise: answered first, this turn
    pf.fresh = (pf.wants.join('|') + '#' + pf.promises.join('|')) !== before ? { want: pf.wants[pf.wants.length - 1], promise: pf.promises[pf.promises.length - 1], turn: mindOf(g).turn } : null;
  }
  // the player gave it something: a promise about that thing is kept
  function promiseKept(g, what) {
    const pf = pfOf(g), w = words(what); if (!w.length) return;
    const i = pf.promises.findIndex(p => words(p).some(x => w.includes(x)) || (/gold|pay|coin/i.test(p) && /gold/i.test(what)));
    if (i >= 0) { const p = pf.promises.splice(i, 1)[0]; addMemory(g, `${playerName()} kept their promise to ${p}.`, 2.5, 'event'); pf.kept = (pf.kept || 0) + 1; mindOf(g).mood.trust = clamp01(mindOf(g).mood.trust + .15); }
  }
  function playerLines(g) {
    const pf = mindOf(g).pf; if (!pf || (!pf.talks && !pf.gifts.length && !pf.hits && !(pf.visits > 1))) return [];
    const m = mindOf(g), who = pf.name || playerName(), ago = m.turn - pf.met, bits = [];
    if (pf.visits > 1) bits.push(`they have been here before (${pf.visits} visits); greet them as someone you know`);
    else bits.push(pf.talks > 6 || ago > 30 ? 'you know them well by now' : pf.talks > 1 ? `you met ${ago <= 1 ? 'just now' : ago + ' turns ago'}, talked ${pf.talks} times` : 'you have only just met');
    if (pf.said.length) bits.push(pf.said.join('; '));
    if (pf.wants.length) bits.push('they want: ' + pf.wants.join('; '));
    if (pf.promises.length) bits.push('they promised to ' + pf.promises.join('; ') + ' (not done yet)');
    if (pf.kept) bits.push(`kept ${pf.kept === 1 ? 'a promise' : pf.kept + ' promises'} to you`);
    if (pf.gifts.length) bits.push('gave you ' + pf.gifts.slice(-3).join(', '));
    if (pf.threats?.length) bits.push('threatened to ' + pf.threats.join('; '));
    if (pf.hits) bits.push(pf.hits === 1 ? 'hit you once' : `hit you ${pf.hits} times`);
    const out = ['About ' + who + ': ' + bits.map(b => b[0].toUpperCase() + b.slice(1)).join('. ') + '.'];
    // back after a while (or another visit) with something still wanted: a
    // natural thing to ask about, so the character shows it remembers
    const back = pf.visits > 1 && pf.talks <= (pf.talksAtStart ?? 0) + 1 || (pf.gap || 0) >= 8;
    if (back && pf.wants.length) out.push(`You could ask ${who} how it is going: ${pf.wants[pf.wants.length - 1]}.`);
    return out;
  }

  // ---- how much the game does for it, by the size of its brain ----
  // basic: a 2B-class model. The game reacts for it when it matters (eats
  //   when starving, hits back or runs from a monster: reflexes) and keeps
  //   the card short.
  // capable: a 4B-class model (Gemma 4 E4B). It is offered concrete choices
  //   when in danger or hungry and decides itself; the game steps in only
  //   when it lets things get bad. Reflection asks the model.
  // ambitious: 12B and up, or an online model. No reflexes; longer memory.
  // A scenario's "expect" (or an agent's) overrides the guess.
  const TIERS = ['basic', 'capable', 'ambitious'];
  function tier(g) {
    const cfg = g ? getBrainConfig(g.id) : {}, set = cfg.expect || state.expect;
    if (TIERS.includes(set)) return set;
    const k = String(window.tablefolkBrainInfo?.()?.key || '');
    if (/endpoint|12b|26b|27b|31b|9b/i.test(k)) return 'ambitious';
    if (/e4b/i.test(k)) return 'capable';
    return 'basic';
  }

  // ---- reflection: raw memories become a few lasting beliefs ----
  // Each memory has a source (kind): event (it happened to it or it saw it),
  // note (its own remember()), heard (someone told it: may be wrong), belief
  // (the game's summary of many events), thought (the model's own reflection).
  // consolidate() runs every 12 of its turns and when it has slept: repeated
  // events about one person fold into one belief ("Ana has attacked you 3
  // times"). reflectWithModel() (capable and ambitious brains, the
  // scenario's "reflect" not false) asks the model, when it sleeps or every
  // 30 turns, for one or two short lessons from what it remembers.
  const PATTERNS = [
    [/^(.+?) attacked you/i, (who, n) => `${who} has attacked you ${n} times: not to be trusted near you.`],
    [/^(.+?) gave you /i, (who, n) => `${who} has given you things ${n} times: generous to you.`],
    [/^You sold (.+?) /i, (who, n) => `${who} is a regular customer (${n} purchases).`],
    [/^(.+?) attacked (?!you)/i, (who, n) => `${who} has attacked people ${n} times: violent.`],
  ];
  function consolidate(g) {
    const m = mindOf(g);
    for (const e of m.mem) {
      if ((e.n || 1) < 3 || e.kind === 'belief' || e.kind === 'thought') continue;
      for (const [pi, [re, fn]] of PATTERNS.entries()) { const r = e.text.match(re); if (r) { Object.assign(e, { src: e.text, who: r[1], pi, kind: 'belief', w: Math.max(e.w, 3) }); e.text = fn(r[1], e.n); break; } }
    }
    m.lastConsolidated = m.turn;
  }
  let reflecting = false;
  async function reflectWithModel(g) {
    const m = mindOf(g), cfg = getBrainConfig(g.id);
    if (reflecting || state.reflect === false || tier(g) === 'basic' || !window.tablefolkLLM || cfg.defeated) return;
    const raw = m.mem.filter(e => e.kind !== 'thought').slice(-12).map(e => '- ' + e.text);
    if (raw.length < 4) return;
    reflecting = true; m.lastReflected = m.turn;
    try {
      const sys = `You are ${g.id}. ${String(cfg.personality || '').slice(0, 300)}`;
      const user = `Things you remember:\n${raw.join('\n')}\n\nWhat do you make of all this? Write one or two short lessons or beliefs, in your own voice, about the people here or what you should do next. One per line, under 20 words each, no lists or numbering.`;
      const r = await window.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 80, temperature: .7, agentId: g.id + '~reflect' });
      const lines = String(r?.choices?.[0]?.message?.content || '').split('\n').map(t => t.replace(/^[-*\d.)\s]+/, '').replace(/^["']|["']$/g, '').trim()).filter(t => t.length > 8 && t.length < 160 && !/[{}()<>]/.test(t)).slice(0, 2);
      m.mem = m.mem.filter(e => e.kind !== 'thought' || m.turn - e.turn < 60).slice(-40);
      for (const t of lines) addMemory(g, t, 3, 'thought');
      if (lines.length) console.log('[mind] ' + g.id + ' reflects:', lines.join(' | '));
    } catch (e) { console.warn('[mind] reflect', e); }
    finally { reflecting = false; }
  }
  // ---- a plan for the day (capable and ambitious brains) ----
  // A character with no goal of its own asks itself, once in a while, for
  // three small things it means to do here; they become its goals one by
  // one (each kept for up to 10 of its turns). Generative Agents' daily
  // plan, small. Off with "plans": false; not for characters with a quest.
  let planning = false;
  async function planDay(g) {
    const m = mindOf(g), cfg = getBrainConfig(g.id);
    if (planning || reflecting || state.plans === false || tier(g) === 'basic' || !window.tablefolkLLM || cfg.defeated || cfg.goal || cfg.quest) return;
    planning = true; m.lastPlanned = m.turn;
    try {
      const things = (window.tablefolkUses?.nearby(g, 10) || []).map(o => String(o.type).replace(/_/g, ' ')).slice(0, 8);
      const places = (state.places || []).map(p => p.name || p.kind).filter(Boolean).slice(0, 8);
      const ctx = [cfg.role ? 'Your job: ' + cfg.role + '.' : '', cfg.agenda ? 'You are quietly after: ' + cfg.agenda + '.' : '', things.length ? 'Near you: ' + things.join(', ') + '.' : '', places.length ? 'Places here: ' + places.join(', ') + '.' : '', recall(g, 3).length ? 'You remember: ' + recall(g, 3).join(' | ') : ''].filter(Boolean).join('\n');
      const r = await window.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: `You are ${g.id}. ${String(cfg.personality || '').slice(0, 300)}` }, { role: 'user', content: `${ctx}\n\nWhat three small things will you do next, here, in your own way? One per line, each a short goal under 10 words (like "sweep the tavern floor" or "ask the stranger about the road"). No numbering.` }], max_tokens: 70, temperature: .8, agentId: g.id + '~plan' });
      const lines = String(r?.choices?.[0]?.message?.content || '').split('\n').map(t => t.replace(/^[-*\d.)\s]+/, '').replace(/^["']|["'.]$/g, '').trim()).filter(t => t.length > 4 && t.length < 80 && !/[{}()<>]/.test(t)).slice(0, 3);
      if (lines.length && !getBrainConfig(g.id).goal) {
        m.plan = lines.slice(1); setBrainConfig(g.id, { goal: lines[0] }); m.planGoal = lines[0];
        console.log('[mind] ' + g.id + ' plans:', lines.join(' | '));
      }
    } catch (e) { console.warn('[mind] plan', e); }
    finally { planning = false; }
  }
  function advancePlan(g) {
    const m = mindOf(g), cfg = getBrainConfig(g.id);
    if (!m.planGoal) return;
    if (cfg.goal !== m.planGoal) { m.planGoal = null; return; }   // it chose another goal itself
    if (m.turn - m.goalTurn >= 10) { const next = (m.plan || []).shift(); m.planGoal = next || null; setBrainConfig(g.id, { goal: next || '' }); }
  }

  // ---- glancing (brains that see) ----
  // With a model that sees (tablefolkVision.available()), a capable or
  // ambitious character looks on its own when someone new comes into view,
  // or every 12 of its turns, so what it sees becomes memory without the
  // model having to think of look(). One picture at a time.
  let glancing = false;
  function maybeGlance(g) {
    const V = window.tablefolkVision, m = mindOf(g);
    if (glancing || planning || reflecting || !V?.available?.() || tier(g) === 'basic' || state.glances === false || getBrainConfig(g.id).defeated) return;
    const p = g.root?.position; if (!p) return;
    const seen = state.characters.filter(c => c !== g && !c.defeated && Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) <= 6 && (window.tablefolk?.canSeeEachOther?.(g, c) ?? true)).map(c => c.id);
    const pl = state.playerAvatar; if (pl && Math.hypot(pl.root.position.x - p.x, pl.root.position.z - p.z) <= 6) seen.push('player');
    const fresh = seen.filter(id => !(m.seenIds || []).includes(id));
    m.seenIds = seen;
    if (!fresh.length && m.turn - (m.lastGlance ?? -99) < 12) return;
    m.lastGlance = m.turn; glancing = true;
    setTimeout(() => Promise.resolve(V.lookFor(g)).catch(e => console.warn('[mind] glance', e)).finally(() => { glancing = false; }), 300);
  }

  // how a memory reads on the card: what it was told or thought is marked as such
  const shown = e => e.kind === 'thought' ? `(you concluded) ${e.text}` : e.text;

  // ---- gossip: news travels between characters ----
  // When a character says something within earshot of another, and its
  // words match something it remembers about someone else, the listener
  // remembers it too, as hearsay: "pip told you: Ana attacked grub." The
  // card offers a piece of news when someone it could tell is nearby, so
  // the model has something true to chat about. Off with "gossip": false.
  const juicy = (g, e) => (e.kind === 'event' || e.kind === 'belief' || e.kind === 'note') && e.w >= 1.5 && !/^You (sold|gave)/.test(e.text);
  function asTold(teller, text) {
    return String(text).replace(/\byour\b/gi, teller + "'s").replace(/\byou\b/gi, teller).replace(/^\w/, c => c.toUpperCase());
  }
  function hearGossip(listener, teller, text) {
    const m = mindOf(listener); m.told ||= {};
    const told = `${teller.id} told you: ${asTold(teller.id, text)}`;
    if (m.mem.some(e => e.text.toLowerCase() === told.toLowerCase())) return false;
    addMemory(listener, told, 1.8, 'heard');
    const r = text.match(/^(.+?) (attacked|struck down|gave|has attacked|has given|kept their promise)/i);
    if (r && r[1] !== listener.id) {
      const bad = /attack|struck/i.test(r[2]);
      // the player's name travels too: a reputation
      if (isPlayerName(r[1])) m.mood.trust = clamp01(m.mood.trust + (bad ? -.1 : .05));
      else opinion(listener, r[1], bad ? -.15 : .1, bad ? 'heard they attacked someone' : 'heard they are generous');
    }
    return true;
  }
  function onSpoke(g, text) {
    if (state.gossip === false || !state.characters.includes(g)) return;
    const said = new Set(words(text)); if (said.size < 2) return;
    const mine = mindOf(g).mem.filter(e => juicy(g, e) && overlap(e.text, said) >= 2);
    if (!mine.length) return;
    const p = g.root.position, R = state.earshot || 6;
    for (const c of state.characters) {
      if (c === g || c.defeated || getBrainConfig(c.id).defeated || UNDEAD.test(c.charModel || '')) continue;
      if (Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) > R) continue;
      for (const e of mine) if (hearGossip(c, g, e.text)) mindOf(g).shared = { ...(mindOf(g).shared || {}), [c.id + '|' + e.text]: 1 };
    }
  }
  function gossipLine(g) {
    if (state.gossip === false) return '';
    const m = mindOf(g), p = g.root?.position; if (!p) return '';
    const near = state.characters.filter(c => c !== g && !c.defeated && !getBrainConfig(c.id).defeated && !UNDEAD.test(c.charModel || '') && Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) <= 4);
    if (!near.length) return '';
    for (const c of near) {
      const news = m.mem.filter(e => juicy(g, e) && !(m.shared || {})[c.id + '|' + e.text] && !e.text.toLowerCase().includes(c.id.toLowerCase())).sort((a, b) => b.w - a.w || b.turn - a.turn)[0];
      if (news) return `News you could tell ${c.id}: ${news.text}`;
    }
    return '';
  }
  // what it hides and what it is after (agent "secret", "agenda")
  function secretLines(g) {
    const cfg = getBrainConfig(g.id), m = mindOf(g), out = [];
    if (cfg.agenda) out.push(`What you are quietly after: ${cfg.agenda}`);
    if (cfg.secret) out.push(m.mood.trust >= .85 && pfOf(g).talks >= 3 ? `Your secret (you trust ${pfOf(g).name || playerName()} enough to share it if they ask): ${cfg.secret}` : `Your secret (never tell it; change the subject if pressed): ${cfg.secret}`);
    return out;
  }

  // ---- survival: danger, choices and reflexes ----
  // A monster near it is put on the card with concrete choices (fight with
  // the best weapon it carries, drink a potion, run to a named spot), so
  // a 4B model picks one instead of inventing one. reflex() is the game
  // acting for it when the model can't be trusted to (basic tier) or let
  // things get bad (capable tier): it returns a command line, or null.
  const POTION = /potion|elixir|tonic|salve|bandage/i;
  const posOf2 = c => c.logicalPos || c.root.position;
  const dist2 = (a, b) => Math.hypot(posOf2(a).x - posOf2(b).x, posOf2(a).z - posOf2(b).z);
  function foes(g, R = 6) {
    const P = window.tablefolkPlay; if (!P?.isHostile || !g.root) return [];
    return state.characters.filter(c => c !== g && !c.defeated && !getBrainConfig(c.id).defeated && P.isHostile(c) && dist2(g, c) <= R && (window.tablefolk?.canSeeEachOther?.(g, c) ?? true))
      .sort((a, b) => dist2(g, a) - dist2(g, b));
  }
  function dirWord(dx, dz) { const a = Math.atan2(dx, dz) * 180 / Math.PI; return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((a + 360) % 360) / 45) % 8]; }
  function bestWeapon(g) {
    const W = window.tablefolkCombat?.weaponFor; if (!W) return null;
    return (charInventory(g).items || []).filter(i => (i.qty ?? 1) > 0).map(i => W(i.name)).filter(Boolean).sort((a, b) => b.dmg - a.dmg)[0] || null;
  }
  // a free cell about 4 steps straight away from the foe (else the player, an ally)
  function fleeSpot(g, foe) {
    const a = posOf2(g), b = posOf2(foe);
    // toward the player when the player is further from the foe: help is there
    const pl = state.playerAvatar;
    if (pl && !pl.defeated && dist2(pl, foe) > dist2(g, foe) + 1) {
      const p = posOf2(pl);
      for (const [ox, oz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const x = Math.round(p.x) + ox, z = Math.round(p.z) + oz; try { if (cellPassable(x, z) && !occupantAt(x, z, g) && Math.hypot(x - b.x, z - b.z) > dist2(g, foe)) return `${x},${z}`; } catch { break; } }
    }
    let dx = a.x - b.x, dz = a.z - b.z; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
    for (const k of [5, 4, 3]) for (const rot of [0, .5, -.5, 1, -1]) {
      const c = Math.cos(rot), sn = Math.sin(rot), x = Math.round(a.x + (dx * c - dz * sn) * k), z = Math.round(a.z + (dx * sn + dz * c) * k);
      try { if (cellPassable(x, z) && !occupantAt(x, z, g)) return `${x},${z}`; } catch { return null; }
    }
    return null;
  }
  // about how much harm the foes close by can do next round (a monster
  // strikes for 1-4; 2.5 if its weapon is unknown)
  function incoming(g, fs) {
    const W = window.tablefolkCombat?.weaponFor;
    return fs.filter(f => dist2(g, f) <= 3.2).reduce((a, f) => a + ((getBrainConfig(f.id).wielding && W?.(getBrainConfig(f.id).wielding)?.dmg) || 2.5), 0);
  }
  function potion(g) { return (charInventory(g).items || []).find(i => POTION.test(i.name) && (i.qty ?? 1) > 0)?.name || null; }
  function dangerLines(g) {
    const fs = foes(g); if (!fs.length) return [];
    const f = fs[0], C = window.tablefolkCombat, me = C?.hpOf(g) || { hp: 10, max: 10 }, fh = C?.hpOf(f) || { hp: 5, max: 5 };
    const d = dist2(g, f), reach = d <= (C?.REACH ?? 1.6) + .05, dir = dirWord(posOf2(f).x - posOf2(g).x, posOf2(f).z - posOf2(g).z);
    const held = getBrainConfig(g.id).wielding, w = bestWeapon(g), pot = potion(g), spot = fleeSpot(g, f);
    const out = [`DANGER: ${f.id} (${String(f.charModel || 'monster').replace(/_/g, ' ')}, ${fh.hp}/${fh.max} health) is ${reach ? 'right next to you' : Math.round(d) + ' steps ' + dir}${fs.length > 1 ? `, with ${fs.length - 1} more nearby` : ''}. You have ${me.hp}/${me.max} health${held ? ', holding ' + held : ''}.`];
    const ch = [], may = c => { try { return commandsFor(g).has(c); } catch { return true; } };
    if (w && may('wield') && (!held || (C.weaponFor(held)?.dmg || 0) < w.dmg)) ch.push(`wield(${w.name}) - you carry it`);
    if (may('attack')) ch.push(reach ? `attack(${f.id}) - it is in reach` : may('walk') ? `walk(${f.id}) then attack(${f.id})` : `attack(${f.id}) when it comes close`);
    const risk = incoming(g, fs), dying = risk > 0 && me.hp <= Math.max(risk * 2, me.max * .35);
    if (dying) out[0] += ` You could die in the next round (they can do about ${Math.round(risk)} damage).`;
    if (pot && (dying || me.hp < me.max * .6)) ch[dying ? 'unshift' : 'push'](`eat(${pot}) - drink it, heals 4`);
    if (!pot && spot && may('walk') && me.hp <= risk) ch.unshift(`walk("${spot}") - run away now`);
    if (spot && may('walk') && me.hp > risk) ch.push(`walk("${spot}") - run away from it (it may follow)`);
    if (may('say') && state.playerAvatar && !state.playerAvatar.defeated) ch.push(`say("Help! ${f.id} is attacking!") - call for help`);
    if (ch.length) out.push('Choose one now: ' + ch.join(' | ') + (food(g) ? ` (food such as ${food(g)} does not heal you: not now)` : ''));
    return out;
  }
  function reflex(g) {
    const cfg = getBrainConfig(g.id), t = tier(g);
    if (cfg.defeated || t === 'ambitious' || state.reflexes === false || cfg.reflexes === false) return null;
    const C = window.tablefolkCombat, m = mindOf(g), me = C?.hpOf(g) || { hp: 1, max: 1 }, frac = me.hp / me.max;
    const fs = foes(g, 4), f = fs[0], reach = f && dist2(g, f) <= (C?.REACH ?? 1.6) + .05;
    const brave = temperament(cfg) === 'brave', basic = t === 'basic';
    if (f) {
      const pot = potion(g), risk = incoming(g, fs), spot = () => fleeSpot(g, f);
      // nearly dead and in reach: finish it (running then gave it the last
      // bite: E2B and E4B both died with the wolf at 1-2 health)
      const fh = C?.hpOf(f), myDmg = (cfg.wielding && C?.weaponFor(cfg.wielding)?.dmg) || 1;
      if (reach && fh && fh.hp <= myDmg) return { line: `attack(${f.id})`, why: `${f.id} is nearly down: finishes it` };
      // in real danger of dying next round: the potion; running only when the
      // next round would kill it and there is no potion (monsters chase, and
      // a turn spent running is a free blow: seen in the survival eval)
      if (pot && frac < .7 && (me.hp <= risk * (basic ? 1.6 : 1.3) || frac <= (basic ? .45 : .35))) return { line: `eat(${pot})`, why: `${me.hp}/${me.max} health with ${f.id} near: drinks the ${pot}` };
      if (!pot && !brave && me.hp <= risk) { const sp = spot(); if (sp) return { line: `walk("${sp}")`, why: `about to fall: runs from ${f.id}` }; }
      // draw the best weapon as soon as it comes near (drawing it in reach
      // cost a turn of blows), and strike back when it is in reach
      const w = bestWeapon(g), held = cfg.wielding;
      if (w && (!held || (C.weaponFor(held)?.dmg || 0) < w.dmg) && (basic || reach)) return { line: `wield(${w.name})`, why: `draws the ${w.name} against ${f.id}` };
      if (basic && reach) return { line: `attack(${f.id})`, why: `fights back against ${f.id}` };
      // capable: it chose something other than a blow last turn while the
      // monster stood in reach and it is not about to fall: strike back
      // (E4B ran from a faster wolf and never hit it: 0/3)
      if (reach && me.hp > risk * 1.3 && !/attack\(|eat\(|wield\(/.test(m.lastLine || '')) return { line: `attack(${f.id})`, why: `strikes back at ${f.id}` };
      if (basic && !reach && temperament(cfg) === 'timid') { const sp = spot(); if (sp) return { line: `walk("${sp}")`, why: `keeps away from ${f.id}` }; }
      return null;
    }
    if (needsOn(g) && m.hunger >= (basic ? .8 : .92)) { const fd = food(g); if (fd) return { line: `eat(${fd})`, why: `starving: eats the ${fd}` }; const src = foodSource(g); if (src) return { line: src, why: `starving: gets food (${src})` }; }
    return null;
  }

  // ---- mood ----
  function push(g, mood, by, why) {
    const m = mindOf(g);
    m.mood[mood] = clamp01(m.mood[mood] + by);
    if (why && by > 0) m.why[mood] = why;
  }
  function event(g, kind, d = {}) {
    if (!g || g === state.playerAvatar || !state.characters.includes(g)) return;
    const cfg = getBrainConfig(g.id); if (cfg.defeated) return;
    const t = temperament(cfg), m = mindOf(g), me = isPlayerName(d.by || d.who);
    if (kind === 'attacked') {
      const why = `${d.by} attacked you`;
      if (t === 'brave') { push(g, 'anger', .5, why); push(g, 'fear', .12, why); }
      else if (t === 'timid') { push(g, 'fear', .55, why); push(g, 'anger', .1, why); }
      else { push(g, 'anger', .45, why); push(g, 'fear', .25, why); }
      push(g, 'joy', -.4);
      if (me) { m.mood.trust = clamp01(m.mood.trust - .35); pfOf(g).hits++; }
      m.threat = d.by; m.threatTurn = m.turn;
      if (!me) opinion(g, d.by, -.6, 'attacked you');
      addMemory(g, `${d.by} attacked you${d.hit === false ? ' (and missed)' : ''}.`, 3);
    } else if (kind === 'saw_attack') {
      push(g, t === 'brave' ? 'anger' : 'fear', .25, `${d.by} attacked ${d.victim}`);
      if (!isPlayerName(d.by)) opinion(g, d.by, -.25, `attacked ${d.victim}`);
      if (me) m.mood.trust = clamp01(m.mood.trust - .15);
      addMemory(g, `${d.by} attacked ${d.victim}.`, 1.5);
    } else if (kind === 'saw_defeat') {
      push(g, 'sadness', .35, `${d.victim} was struck down`); push(g, 'fear', t === 'brave' ? .1 : .3, `${d.victim} was struck down`);
      if (me) m.mood.trust = clamp01(m.mood.trust - .3);
      addMemory(g, `${d.by ? d.by + ' struck down ' : 'You saw '}${d.victim}${d.by ? '' : ' fall'}.`, 2.5);
    } else if (kind === 'given') {
      push(g, 'joy', .35, `${d.who} gave you ${d.what}`); m.mood.anger *= .6;
      if (!me) opinion(g, d.who, .35, `gave you ${d.what}`);
      if (me) { m.mood.trust = clamp01(m.mood.trust + .25); keep(pfOf(g).gifts, d.what, 5); promiseKept(g, d.what); }
      addMemory(g, `${d.who} gave you ${d.what}.`, 2);
    } else if (kind === 'sold') {
      push(g, 'joy', .2, `you sold ${d.item}`);
      if (isPlayerName(d.buyer)) m.mood.trust = clamp01(m.mood.trust + .05);
      addMemory(g, `You sold ${d.buyer} ${d.item} for ${d.price} gold.`, 2);
    } else if (kind === 'gave') {
      addMemory(g, `You gave ${d.to} ${d.item}.`, 1.5);
    } else if (kind === 'heard') {
      m.heard = String(d.text || '');
      if (me) learnFromPlayer(g, d.text);
      if (me) m.mood.trust = clamp01(m.mood.trust + .004);
    }
  }
  // How it feels about the other characters (the player has trust, above):
  // gifts and blows between them move it, so a feud or a friendship that
  // the game saw happen stays in the prompt ("You like: pip (gave you a
  // bun). You dislike: grub (attacked you).").
  function opinion(g, who, dv, why) {
    if (!who || who === g.id) return;
    const m = mindOf(g); m.rel ||= {};
    const r = m.rel[who] ||= { v: 0, why: '' };
    r.v = Math.max(-1, Math.min(1, r.v + dv)); r.why = why;
  }
  function relLine(g) {
    const rel = mindOf(g).rel || {}, ids = new Set(state.characters.filter(c => !c.defeated).map(c => c.id));
    const like = [], dislike = [];
    for (const [id, r] of Object.entries(rel)) { if (!ids.has(id)) continue; if (r.v >= .3) like.push(`${id} (${r.why})`); else if (r.v <= -.3) dislike.push(`${id} (${r.why})`); }
    return [like.length ? 'You like: ' + like.join(', ') + '.' : '', dislike.length ? 'You dislike: ' + dislike.join(', ') + '.' : ''].filter(Boolean).join(' ');
  }
  // One of its turns went by: needs grow, feelings settle.
  function tick(g, line = '') {
    const cfg = getBrainConfig(g.id); if (cfg.defeated) return;
    const m = mindOf(g), b = baseline(cfg);
    m.turn++; m.lastRound = round; m.lastLine = String(line || '');
    // feelings fade over a few turns (a punch is still felt five turns on), trust over many
    for (const k of MOODS) m.mood[k] += (b[k] - m.mood[k]) * .07;
    m.mood.trust += (b.trust - m.mood.trust) * .015;
    for (const k of MOODS) if (m.mood[k] < .3) delete m.why[k];
    // slow: a living world gives each character a turn every 15-20 s, and at
    // twice this a meal lasted three minutes ("Thistle keeps saying she's hungry")
    if (needsOn(g)) { m.hunger = clamp01(m.hunger + .012); m.tired = clamp01(m.tired + .007); }
    if (/emote\(\s*"?sleep/i.test(line)) m.tired = 0;
    const slept = (m.prevTired ?? 0) - m.tired > .3; m.prevTired = m.tired;
    if (slept || m.turn - (m.lastConsolidated ?? 0) >= 12) consolidate(g);
    if (slept || m.turn - (m.lastReflected ?? 0) >= 30) setTimeout(() => reflectWithModel(g), 50);
    advancePlan(g);
    maybeGlance(g);
    if (!getBrainConfig(g.id).goal && m.turn >= 2 && m.turn - (m.lastPlanned ?? -99) >= 40) setTimeout(() => planDay(g), 400);
    if ((cfg.goal || '') !== m.goal) { m.goal = cfg.goal || ''; m.goalTurn = m.turn; }
    if (m.feel && m.turn - m.feel.turn > 4) m.feel = null;
    if (m.threat && m.mood.fear < .3 && m.mood.anger < .3) m.threat = null;
  }

  // ---- what goes in the prompt ----
  const LEVELS = { joy: ['cheerful', 'happy'], fear: ['nervous', 'scared'], anger: ['annoyed', 'angry'], sadness: ['a bit down', 'sad'] };
  function feelLine(g) {
    const m = mindOf(g), parts = [];
    const strong = MOODS.filter(k => m.mood[k] >= .3).sort((a, b) => m.mood[b] - m.mood[a]);
    strong.forEach((k, i) => parts.push(LEVELS[k][m.mood[k] >= .6 ? 1 : 0] + (i === 0 && m.why[k] ? ` (${m.why[k]})` : '')));
    if (m.feel) parts.unshift(m.feel.word);
    if (m.mood.trust <= .35) parts.push(`you don't trust ${playerName()}`);
    else if (m.mood.trust >= .75) parts.push(`you like ${playerName()}`);
    return parts.length ? 'You feel: ' + [...new Set(parts)].join(', ') + '.' : '';
  }
  function hpFrac(g) { const h = window.tablefolkCombat?.hpOf(g); return h && h.max ? h.hp / h.max : 1; }
  function food(g) { return (charInventory(g).items || []).find(i => isFood(i.name) && (i.qty ?? 1) > 0)?.name || null; }
  // food it doesn't carry but can reach: a barrel or crate of food (use), or
  // a chest it can see into with food in it (take)
  function foodSource(g) {
    const U = window.tablefolkUses; if (!U?.nearby) return null;
    const near = U.nearby(g, 10);
    const crate = near.find(o => o.k === 'food'); if (crate) return `use(${crate.type})`;
    for (const o of near.filter(o => o.k === 'chest')) {
      try { const c = meta(o.mesh)?.opts?.contents;   // only a chest someone has looked into: no peeking
      const it = (c?.items || []).find(i => (i.qty ?? 1) > 0 && isFood(i.name)); if (it) return `take(${it.name}, ${o.type})`; } catch {}
    }
    return null;
  }
  function bodyLine(g) {
    const m = mindOf(g), bits = [], hp = hpFrac(g);
    if (hp <= .35) bits.push('badly hurt'); else if (hp < .75) bits.push('hurt');
    if (needsOn(g)) {
      if (m.hunger >= .8) bits.push('starving'); else if (m.hunger >= .55) bits.push('hungry');
      if (m.tired >= .8) bits.push('exhausted'); else if (m.tired >= .6) bits.push('tired');
    }
    return bits.length ? 'Body: ' + bits.join(', ') + '.' : '';
  }
  // What it wants when nothing else is asked of it: the most pressing need or feeling.
  function want(g) {
    const m = mindOf(g), hp = hpFrac(g), threat = m.threat, fresh = threat && m.turn - (m.threatTurn ?? -99) <= 3;
    if (threat && m.mood.fear >= .5) return `stay safe: keep away from ${threat}, or ask for help`;
    if (hp <= .35) return 'get your wounds seen to, and avoid any fight';
    if (threat && m.mood.anger >= .5) return `let ${threat} know you won't stand for it`;
    // just attacked: react to it before anything else
    if (fresh) return temperament(getBrainConfig(g.id)) === 'timid' ? `get away from ${threat}, or beg them to stop` : `tell ${threat} what you think of being attacked`;
    if (needsOn(g) && m.hunger >= .55) { const f = food(g); if (f) return `eat something: eat(${f})`; const src = foodSource(g); return src ? `get something to eat: ${src}` : 'find something to eat (buy it, or ask for some)'; }
    if (needsOn(g) && m.tired >= .7) { const bed = window.tablefolkUses?.nearby(g, 8).find(o => o.k === 'bed' || o.k === 'seat'); return bed ? `rest: use(${bed.type})` : 'rest: emote(sleep)'; }
    // nothing pressing: a small step toward what it is quietly after
    const ag = getBrainConfig(g.id).agenda; if (ag && m.turn % 3 === 0) return `take a small step toward what you are after (${ag})`;
    return '';
  }
  function cardLines(g) {
    if (!g) return [];
    const cfg = getBrainConfig(g.id), m = mindOf(g), out = [];
    const danger = dangerLines(g);
    const f = feelLine(g); if (f) out.push(f);
    out.push(...playerLines(g));
    out.push(...secretLines(g));
    const rl = relLine(g); if (rl) out.push(rl);
    const b = bodyLine(g); if (b) out.push(b);
    const w = want(g), urgent = /^(stay safe|get your wounds|get away|tell .* attacked|let .* stand for)/.test(w);
    if (w && (urgent || !cfg.goal)) out.push('You want: ' + w + '.');
    if (cfg.goal) { const n = m.turn - m.goalTurn; out.push(`Current goal: ${cfg.goal}` + (n >= 6 ? ` (${n} turns on it: what is the next step?)` : '')); }
    const mem = recall(g, { basic: 3, capable: 4, ambitious: 6 }[tier(g)]); if (mem.length) out.push('You remember: ' + mem.join(' | '));
    const kn = facts(g); if (kn.length) out.push('You know: ' + kn.join(' | '));
    const gl = !danger.length && gossipLine(g); if (gl) out.push(gl);
    out.push(...danger);
    return out;
  }

  // Said right after the player's words (world-integration.js, beside the
  // skills' urgent cues): what they just asked for or promised, so a chatty
  // character answers it instead of its favourite subject.
  function urgentLines(g) {
    const m = mindOf(g), fr = m.pf?.fresh;
    if (!fr || fr.turn !== m.turn || dangerLines(g).length) return [];
    return [`${m.pf.name || playerName()} just told you what they ${fr.promise && !fr.want ? 'promise' : 'want'}: ${fr.want || fr.promise}. Answer that first, in character.`];
  }

  // ---- the director: who takes a turn ----
  // play.js asks after each player action. A character near the player takes
  // a model turn when there is something for it to do: it was spoken to or
  // something happened to it, it has a pressing want, or it is working on a
  // goal (every other round); otherwise only now and then (idle chatter), so
  // a walk past the bakery isn't a speech from the baker at every step.
  let round = 0;
  window.addEventListener('tablefolk-player-turn', () => { round++; });
  function wantsTurn(g) {
    const cfg = getBrainConfig(g.id), m = mindOf(g), since = round - (m.lastRound ?? -99);
    if (window.tablefolk?.onlySpokenTo?.(g, cfg)) return window.tablefolk.heardSpeech(cfg);
    if (cfg.pendingChat?.length) return true;
    if (window.tablefolkWorkflows?.active(g.id)) return true;
    const w = want(g);
    if (/^(stay safe|get away|tell .* attacked|let .* stand for)/.test(w)) return true;
    if (foes(g, 5).length && since >= 1) return true;
    if ((cfg.goal || w) && since >= 2) return true;
    return since >= (+state.idleTurnEvery > 0 ? +state.idleTurnEvery : 5);
  }

  // ---- commands ----
  function remember(g, text) {
    text = String(text || '').replace(/^["']|["']$/g, '').trim();
    if (!text) return say(g, 'remember what?', false);
    addMemory(g, text, 2.5, 'note');
    return say(g, `(${g.id} makes a mental note: ${text})`, false);
  }
  const FEELS = { joy: /happy|glad|joy|cheer|delight|pleased|content/, fear: /scared|afraid|fear|nervous|anxious|worried|terrified/, anger: /angry|annoyed|mad|furious|irritat|cross/, sadness: /sad|down|unhappy|gloomy|miserable|grief|lonely/ };
  function feel(g, word) {
    word = String(word || '').replace(/^["']|["']$/g, '').trim().toLowerCase().slice(0, 30);
    if (!word) return say(g, 'feel what?', false);
    const m = mindOf(g), k = Object.keys(FEELS).find(k => FEELS[k].test(word));
    if (k) m.mood[k] = Math.max(m.mood[k], .65);
    m.feel = { word, turn: m.turn };
    try { emitBadge(g, word); } catch {}
    return say(g, `(${g.id} feels ${word})`, false);
  }
  function eat(g, item) {
    item = String(item || '').replace(/^["']|["']$/g, '').trim();
    const inv = charInventory(g), items = (inv.items || []).filter(i => (i.qty ?? 1) > 0);
    const it = item ? findItem(items, item) : items.find(i => isFood(i.name));
    if (!it) return say(g, item ? `eat failed: ${g.id} has no ${item}` : 'eat failed: nothing to eat', false);
    if (POTION.test(it.name)) {
      it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) inv.items = inv.items.filter(i => i !== it);
      setBrainConfig(g.id, { inventory: inv });
      const healed = window.tablefolkCombat?.heal(g, 4) || 0;
      try { emitBadge(g, 'drinks ' + it.name); inventoryChanged(); } catch {}
      return say(g, `${g.id} drinks the ${it.name}${healed ? ' and heals ' + healed : ''}`, false);
    }
    const nourish = isFood(it.name);
    if (!nourish) return say(g, `eat failed: ${it.name} is not food`, false);
    it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) inv.items = inv.items.filter(i => i !== it);
    setBrainConfig(g.id, { inventory: inv });
    const m = mindOf(g); m.hunger = Math.max(0, m.hunger - nourish); push(g, 'joy', .1);
    try { emitBadge(g, 'eats ' + it.name); inventoryChanged(); } catch {}
    return say(g, `${g.id} eats the ${it.name}`, false);
  }

  // ---- events from the rest of the game ----
  window.addEventListener('tablefolk-agent-turn', e => { const g = state.characters.find(c => c.id === e.detail?.agentId); if (g) tick(g, e.detail.line || ''); });
  window.addEventListener('tablefolk-say', e => { const d = e.detail || {}; if (!d.voiced) return; const g = state.characters.find(c => c.id === d.agentId); if (g) onSpoke(g, d.text); });
  window.addEventListener('tablefolk-player-chat', e => { const g = state.characters.find(c => c.id === e.detail?.agentId); if (g) event(g, 'heard', { who: playerName(), text: e.detail.text }); });
  window.addEventListener('tablefolk-defeated', e => {
    const id = e.detail?.id, v = id === 'player' ? state.playerAvatar : state.characters.find(c => c.id === id); if (!v) return;
    const name = id === 'player' ? playerName() : id, p = v.root.position, range = state.earshot || 6;
    for (const o of state.characters) if (o !== v && !o.defeated && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < range) event(o, 'saw_defeat', { by: e.detail.by, victim: name });
  });

  window.tablefolkMind = { urgentLines, planDay, persist, reflex, dangerLines, foes, tier, consolidate, reflectWithModel, hearGossip, gossipLine, onSpoke, prepare, learnFromPlayer, playerLines, pfOf, event, tick, cardLines, opinion, wantsTurn, remember, feel, eat, addMemory, recall, mindOf, temperament, FOOD, isFood };
})();
