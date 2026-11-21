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
    if (own) return +(own.nourish ?? (own.drink ? .25 : .6));
    return FOOD.test(n) ? .6 : DRINK.test(n) && !POTION.test(n) ? .25 : 0;
  }
  // drinks: drunk, not eaten (drink(ale) is eat's alias); a scenario food entry's "drink": true, a pack item tagged "drink", or the words below
  const DRINK = /\b(ale|beer|wine|mead|cider|water|milk|tea|juice|grog|brew|potion|elixir|tonic)\b/i;
  function isDrink(name) {
    const n = String(name || '').toLowerCase().trim(), type = n.replace(/\s+/g, '_');
    const it = window.tablefolkPacks?.items?.[type];
    if (it?.tags?.includes('drink')) return true;
    const own = (state.food || []).find(f => typeof f === 'object' && n === String(f.name).toLowerCase());
    if (own) return !!own.drink;
    return DRINK.test(n);
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
      // described as starving or hungry: it starts hungry (.7)
      const starved = /\b(starv\w*|famished|ravenous|(always |very |so )?hungry|ha(s|ve)(n'?t| not) eaten)\b/i.test(String(cfg.personality || '') + ' ' + String(cfg.style || ''));
      cfg.mind = { mood: { ...b }, why: {}, hunger: starved ? .7 : r() * .25, tired: r() * .2, mem: [], turn: 0, goal: cfg.goal || '', goalTurn: 0, feel: null };
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
      if (Array.isArray(v.recipes)) m.recipes = v.recipes;
      if (typeof v.trust === 'number') m.mood.trust = .5 + (v.trust - .5) * .7;   // a little faded
    } catch {}
  }
  function persist() {
    for (const g of state.characters || []) {
      const m = getBrainConfig(g.id)?.mind, k = m && memKey(g); if (!k) continue;
      if (!m.pf && !m.mem.some(e => e.w >= 2)) continue;
      const mem = m.mem.filter(e => e.w >= 2 || ['belief', 'thought', 'note'].includes(e.kind)).slice(-12).map(({ text, w, kind, n, src, who, pi }) => ({ text, w, kind, n, src, who, pi }));
      try { localStorage.setItem(k, JSON.stringify({ pf: m.pf, mem, rel: m.rel, trust: m.mood.trust, recipes: m.recipes, at: Date.now() })); } catch {}
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
    if (/\b(bring|fetch|get|give|hand|pass|sell|buy|need|want)\b/i.test(t)) { const mm = mindOf(g); mm.askedAt = mm.turn; mm.askWords = [...new Set(words(t))].slice(0, 8); }
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
    // Raon-1 nano: 36/36 on the evals, haggles and refuses lowballs like E4B (brains.md)
    if (/e4b|raon/i.test(k)) return 'capable';
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
    if (aboveRails(g) && window.tablefolkJobs?.handles?.(g)) return;   // agency.js plans the day itself
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
  // animals, raiders and mindless monsters take in no gossip
  const mindfulC = c => !c._threat && !window.tablefolkPlay?.isAnimal?.(c) && !(window.tablefolkPlay?.isHostile?.(c) && !window.tablefolkPlay?.talksToo?.(c));
  function onSpoke(g, text) {
    if (state.gossip === false || !state.characters.includes(g)) return;
    const said = new Set(words(text)); if (said.size < 2) return;
    const mine = mindOf(g).mem.filter(e => juicy(g, e) && overlap(e.text, said) >= 2);
    if (!mine.length) return;
    const p = g.root.position, R = state.earshot || 6;
    for (const c of state.characters) {
      if (c === g || c.defeated || getBrainConfig(c.id).defeated || UNDEAD.test(c.charModel || '') || !mindfulC(c)) continue;
      if (Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) > R) continue;
      for (const e of mine) if (hearGossip(c, g, e.text)) mindOf(g).shared = { ...(mindOf(g).shared || {}), [c.id + '|' + e.text]: 1 };
    }
  }
  function gossipLine(g) {
    if (state.gossip === false) return '';
    const m = mindOf(g), p = g.root?.position; if (!p) return '';
    const near = state.characters.filter(c => c !== g && !c.defeated && !getBrainConfig(c.id).defeated && !UNDEAD.test(c.charModel || '') && mindfulC(c) && Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) <= 4);
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
    if (cfg.secret) out.push(m.mood.trust >= .85 && pfOf(g).talks >= 3 ? `Your secret (you trust ${pfOf(g).name || playerName()} enough to share it if they ask): ${cfg.secret}` : `Your secret (never tell it, never hint at it, not even as a joke, and never name the places or things in it; if pressed, deny and change the subject): ${cfg.secret}`);
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
    return state.characters.filter(c => c !== g && !c.defeated && !getBrainConfig(c.id).defeated && (P.isHostile(c) || !!getBrainConfig(c.id).hostileTo?.[g.id]) && dist2(g, c) <= R && (window.tablefolk?.canSeeEachOther?.(g, c) ?? true))
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
    const f = fs[0], m = mindOf(g), C = window.tablefolkCombat, me = C?.hpOf(g) || { hp: 10, max: 10 }, fh = C?.hpOf(f) || { hp: 5, max: 5 };
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
    // it was hitting someone who is already down (Bonsai 27B kept at it)
    const last = String(m.lastLine || '').match(/attack\(\s*"?([\w -]+?)"?\s*\)/)?.[1];
    if (last && last !== f.id && state.characters.some(c => c.id === last && (c.defeated || getBrainConfig(c.id).defeated))) out.push(`${last} is already down: turn to ${f.id}.`);
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
    if (tempersOn()) {
      for (const [key, a] of Object.entries(m.angryAt || {})) if (a.backAway != null && m.turn - a.backAway <= 2) { const o = charOf(key); const sp = o && dist2(g, o) < 4 && fleeSpot(g, o); if (sp) { a.backAway = -99; return { line: `walk("${sp}")`, why: `backs away from ${nameOfKey(key)}` }; } }
      const w = m.watch, o = w && Date.now() < w.until && !w.warned && charOf(w.who);
      if (o && !o.defeated && dist2(g, o) > 2.2) return { line: `walk(${w.name})`, why: `goes over to ${w.name} (${w.for} called for help)` };
    }
    if (needsOn(g) && m.hunger >= (basic ? .8 : .92)) { const fd = food(g); if (fd) return { line: `eat(${fd})`, why: `starving: eats the ${fd}` }; const src = foodSource(g); if (src) return { line: src, why: `starving: gets food (${src})` }; }
    return null;
  }

  // ---- tempers: insults, anger at someone, and what it does about it ----
  // Words alone used to move nothing (eight insults: anger 0, trust up). Now
  // speech said TO a character (by the player or another character) is read
  // with plain patterns: an insult (a put-down word near "you/your", a rude
  // phrase, mockery of what it is proud of) or pestering (the same demand a
  // third time after a no). Each adds anger toward that one (angryAt[key]),
  // scaled by temperament and the agent's or world's "temper"; an apology
  // halves it, a gift calms it. The level decides what happens, in code:
  //   1 (>= .3) gets on its nerves            2 (>= .5) tell them to stop
  //   3 (>= .7) refuses to sell, give or help them (app.js sell/give)
  //   4 (>= .85) brave or a fighter: hostile toward that one only (play.js
  //     fights them; hostileTo); calm: orders them out, then calls for help;
  //     timid: backs away and calls for help.
  // Calling for help tells every guard or fighter within twice the earshot;
  // one walks over, warns once, and fights the troublemaker if they insult
  // or hit anyone within 60 s. The scenario's "tempers": false turns it off;
  // one fight between characters at a time.
  const PUTDOWN = new Set('stupid idiot idiots idiotic dumb moron morons fool fools foolish ugly liar liars thief thieves coward cowards cowardly worthless useless filthy pathetic stink stinks stinking stinky smelly disgusting loser losers fraud scum vermin oaf imbecile halfwit cretin failure joke rubbish trash lazy freak clown wretch wretched crook cheat cheater incompetent hopeless repulsive vile warty fake hag brute twit dimwit nitwit buffoon bumbling whining'.split(' '));
  const BEAST = new Set('pig pigs rat rats worm worms pest pests toad slug swine weasel snake dog cur maggot'.split(' '));
  const SCORN = /\b(mud|awful|terrible|horrible|disgusting|rubbish|joke|worst|nasty|stale|burnt|garbage|trash|poison|vile|pathetic|sad excuse|no good|bad)\b/i;
  const RUDE = /\b(shut up|shut your (?:mouth|trap)|get lost|nobody (?:likes|cares about|wants|trusts) you|get out of my (?:sight|way|face)|i spit on you|drop dead|you make me sick|piss off|bugger off|go to hell|curse you|damn you|nobody cares)\b/i;
  const YOUW = new Set(['you', 'your', "you're", 'youre', 'yours', 'ya', 'yer', 'thou', 'thee', 'ye', "you've", "you'll"]);
  const APOLOGY = /\b(sorry|apologi[sz]e|apologies|forgive me|i was wrong|my bad|i didn'?t mean (?:it|that)|pardon me)\b/i;
  const YIELD = /\b(i yield|i give up|i surrender|you win|mercy|enough,? (please|stop)|stop,? please|i'?ll go|i'?m leaving|i'?ll leave)\b/i;
  const DEMAND = /\b(give|sell|hand|bring|gimme|let me have|i want|i need|can i have|feed)\b/i;
  const NO = /\b(no|not|never|won'?t|can'?t|refuse|stop asking|go away)\b/i;
  const tempersOn = () => state.tempers !== false && window.tablefolkScenario?.active?.scn?.tempers !== false;
  const keyOf = who => isPlayerName(who) ? 'player' : String(who);
  const nameOfKey = k => k === 'player' ? playerName() : k;
  const charOf = k => k === 'player' ? state.playerAvatar : state.characters.find(c => c.id === k);
  function temperK(cfg) { const t = String(cfg.temper || state.temper || '').toLowerCase(); return t === 'short' ? 1.6 : t === 'long' ? .6 : 1; }
  // Is this sentence (or line) an insult to the one it is said to?
  function insultIn(g, text) {
    const proud = new Set(words(getBrainConfig(g.id).personality || '').filter(w => w.length >= 4));
    for (const s of String(text || '').split(/(?<=[.!?;])\s+|\n/)) {
      if (RUDE.test(s)) return s.trim();
      const w = s.toLowerCase().match(/[a-z']+/g) || [];
      const yous = w.map((x, i) => YOUW.has(x) ? i : -1).filter(i => i >= 0);
      for (let i = 0; i < w.length; i++) {
        // "you stupid oaf", "your pies are a joke"; "Idiot!" alone; not "that stupid door"
        if (PUTDOWN.has(w[i]) && (yous.some(j => Math.abs(j - i) <= 5) || w.length <= 3)) return s.trim();
        if (BEAST.has(w[i]) && (yous.some(j => j < i && i - j <= 4) || w.length <= 3)) return s.trim();
      }
      // mockery of what it is proud of: "your pies taste like mud"
      const yi = w.indexOf('your');
      if (yi >= 0 && SCORN.test(s) && w.slice(yi + 1, yi + 4).some(x => [...proud].some(p => p.length >= 4 && (x.replace(/(ies|es|s)$/, '').startsWith(p.slice(0, 5)) || p.startsWith(x.replace(/(ies|es|s)$/, '').slice(0, 5)))))) return s.trim();
    }
    return '';
  }
  // the same demand a third time after it said no
  function pestering(g, key, text) {
    const m = mindOf(g); m.pester ||= {};
    if (!DEMAND.test(text)) return false;
    const lastSaid = String((g._lines || []).slice(-1)[0]?.text || '');
    const p = m.pester[key] ||= { n: 0, w: [] }, w = words(text);
    if (!NO.test(lastSaid)) { p.n = 1; p.w = w; return false; }
    p.n = p.w.some(x => w.includes(x)) ? p.n + 1 : 1; p.w = w;
    if (p.n >= 3) { p.n = 0; return true; }
    return false;
  }
  function angerLevel(v) { return v >= .85 ? 4 : v >= .7 ? 3 : v >= .5 ? 2 : v >= .3 ? 1 : 0; }
  const fighterish = g => { const cfg = getBrainConfig(g.id); return temperament(cfg) === 'brave' || /guard|soldier|knight|warrior|fighter/i.test(cfg.role || '') || (() => { try { return commandsFor(g).has('attack'); } catch { return false; } })(); };
  // Speech said to g (addressed: by the player, or a character talking to it)
  function provoked(g, who, text) {
    if (!g || !tempersOn() || !state.characters.includes(g) || getBrainConfig(g.id).defeated || window.tablefolkPlay?.isAnimal?.(g)) return;
    const key = keyOf(who);
    if (APOLOGY.test(text)) return calm(g, key, .5, `${who} apologised`);
    // giving in, in the middle of a fight it started: it stands down (non-lethal quarrels)
    if (YIELD.test(text) && getBrainConfig(g.id).hostileTo?.[key]) { calm(g, key, .3, `${who} gave in`); return endQuarrel(g, key, 'yielded'); }
    const s = insultIn(g, text);
    if (s) return insult(g, key, `${who} insulted you: "${clip(s, 60)}"`, who);
    if (pestering(g, key, text)) insult(g, key, `${who} kept pestering you after you said no`, who);
  }
  function insult(g, key, why, who) {
    const cfg = getBrainConfig(g.id), t = temperament(cfg), k = temperK(cfg), m = mindOf(g);
    // calm: x0.85 (was 0.7: a calm innkeeper refused service only at the 5th insult; now the 4th)
    let da = .22 * k * (t === 'brave' ? 1.2 : t === 'calm' ? .85 : 1), df = 0;
    if (t === 'timid') { df = da / 2; da = da / 2; }
    m.angryAt ||= {};
    const a = m.angryAt[key] ||= { v: 0, level: 0, n: 0 };
    a.v = clamp01(a.v + da + df * .5); a.n++; a.last = m.turn; a.at = Date.now(); a.why = why;
    push(g, 'anger', da, why); if (df) push(g, 'fear', df, why);
    if (key === 'player') m.mood.trust = clamp01(m.mood.trust - .08); else opinion(g, key, -.2, 'insulted you');
    addMemory(g, why + '.', 2);
    // the day's news (jobs.js topics: who insulted whom)
    if (/insulted|pestering/.test(why)) try { window.tablefolkJobs?.addNews?.('', `${key === 'player' ? playerName() : who} insulted ${g.id}`, key === 'player' ? 'player' : 'insult'); } catch {}
    // someone watching for this troublemaker (a guard called over) steps in
    watchers(key, 'insulted ' + g.id);
    // told to leave already (calm, level 4): now it calls for help
    if (a.orderedOut) callForHelp(g, key);
    ladder(g, key);
  }
  function calm(g, key, by, why) {
    const a = mindOf(g).angryAt?.[key]; if (!a) return;
    a.v *= by; a.level = Math.min(a.level, angerLevel(a.v)); a.orderedOut = a.v >= .85 && a.orderedOut;
    mindOf(g).mood.anger *= .7;
    addMemory(g, why + '.', 1.5);
    standDown(g);
  }
  function ladder(g, key) {
    const m = mindOf(g), a = m.angryAt[key], lv = angerLevel(a.v), was = a.level || 0;
    a.level = Math.max(was, lv);
    if (lv < 4 || was >= 4) return;
    // above rails (agency.js guided, free): the top of the ladder is advice, not an act; the
    // model is told it is furious and chooses (agency.js eventPick offers fight, order out,
    // call for help, walk away, let it go; or attack(name) in a turn of its own)
    if (aboveRails(g)) {
      a.furious = true;
      const cfg = getBrainConfig(g.id), name = nameOfKey(key);
      setBrainConfig(g.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] You are furious with ${name} (${a.why || 'they keep at you'}). What you do about it is up to you.`]).slice(-5) });
      addMemory(g, `You were furious with ${name}.`, 2.5);
      return;
    }
    const cfg = getBrainConfig(g.id), t = temperament(cfg), name = nameOfKey(key), other = charOf(key);
    // already beaten down to a third of their health: not another fight, only the door
    if (fighterish(g) && beaten(key)) { a.orderedOut = true; a.level = 3; setBrainConfig(g.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] ${name} is hurt and still insulting you. Tell them to get out; you will not fight them again.`]).slice(-5) }); return; }
    if (fighterish(g)) {
      // one fight between characters at a time, started this way
      if (key !== 'player' && state.ladderFight && !(state.ladderFight.a === g.id || state.ladderFight.b === g.id)) { a.level = 3; a.capped = true; return; }
      if (key !== 'player') state.ladderFight = { a: g.id, b: key };
      setBrainConfig(g.id, { hostileTo: { ...(getBrainConfig(g.id).hostileTo || {}), [key]: Date.now() }, pendingChat: (getBrainConfig(g.id).pendingChat || []).concat([`[event] You have had enough of ${name}. Say one short line to them; then you fight them.`]).slice(-5) });
      addMemory(g, `You lost your temper with ${name} and went for them.`, 3);
      a.hostile = true;
    } else if (t === 'timid') {
      a.backAway = m.turn; callForHelp(g, key);
    } else {
      a.orderedOut = true;
      setBrainConfig(g.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] You have had enough of ${name}: order them out. If they insult or hit you again, you will call for help.`]).slice(-5) });
    }
    void other;
  }
  const aboveRails = g => { const l = window.tablefolkAgency?.level?.(g); return !!l && l !== 'rails'; };
  // a quarrel the character chose (agency.js): the hard limits hold: one fight between
  // characters at a time, none with someone already beaten down to a third; it ends
  // there (standDown, endQuarrel). '' when it started, else why not.
  function startFight(g, key) {
    if (!tempersOn()) return 'tempers are off in this world';
    const name = nameOfKey(key), o = charOf(key);
    if (!o || o.defeated) return `${name} is not here`;
    if (beaten(key)) return `${name} is already beaten down`;
    if (key !== 'player' && state.ladderFight && !(state.ladderFight.a === g.id || state.ladderFight.b === g.id)) return 'another fight is going on';
    if (key !== 'player') state.ladderFight = { a: g.id, b: key };
    const m = mindOf(g); m.angryAt ||= {}; const a = m.angryAt[key] ||= { v: .85, level: 4, n: 0 };
    a.hostile = true; a.furious = false;
    setBrainConfig(g.id, { hostileTo: { ...(getBrainConfig(g.id).hostileTo || {}), [key]: Date.now() } });
    addMemory(g, `You went for ${name}.`, 3);
    return '';
  }
  // may it strike someone it is angry with? (app.js commandsFor adds attack): above rails, at level 3+
  function mayFight(g) { return aboveRails(g) && tempersOn() && Object.values(mindOf(g).angryAt || {}).some(a => a.v >= .7); }
  function calmDown(g, key, why) { calm(g, key, .4, why || `You let it go with ${nameOfKey(key)}`); const a = mindOf(g).angryAt?.[key]; if (a) a.furious = false; }
  // its own attack(name) on someone it is furious with starts the quarrel (non-lethal, one at a time)
  window.addEventListener('tablefolk-agent-turn', e => {
    const g = state.characters.find(c => c.id === e.detail?.agentId); if (!g || !aboveRails(g)) return;
    const t = String(e.detail?.line || '').match(/\battack\(\s*"?([^")]+)"?\s*\)/i); if (!t) return;
    const key = keyOf(t[1].trim()), a = mindOf(g).angryAt?.[key];
    if (a && a.v >= .7 && !getBrainConfig(g.id).hostileTo?.[key]) { const no = startFight(g, key); if (no) console.info('[mind]', g.id, 'no fight with', key + ':', no); }
  });
  // a guard, a soldier, anyone who fights (role, commands, or a monster with a mind)
  function isProtector(c) {
    if (!c || c.defeated || getBrainConfig(c.id).defeated || window.tablefolkPlay?.isAnimal?.(c)) return false;
    const cfg = getBrainConfig(c.id);
    if (/guard|soldier|knight|warrior|captain|sheriff|watch/i.test(cfg.role + ' ' + cfg.style)) return true;
    try { return commandsFor(c).has('attack') && !window.tablefolkPlay?.isHostile?.(c); } catch { return false; }
  }
  function callForHelp(g, key) {
    const a = mindOf(g).angryAt?.[key]; if (!a || Date.now() - (a.helpAt || 0) < 20000) return;
    a.helpAt = Date.now();
    const name = nameOfKey(key), R = (state.earshot || 6) * 2, p = g.root.position;
    try { say(g, `Help! ${name} will not leave me alone!`, true); } catch {}
    addMemory(g, `You called for help against ${name}.`, 2);
    for (const c of state.characters) {
      if (c === g || c.id === key || !isProtector(c) || Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) > R) continue;
      const cfg = getBrainConfig(c.id), mc = mindOf(c);
      mc.watch = { who: key, name, for: g.id, until: Date.now() + 75000, warned: false };
      setBrainConfig(c.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] ${g.id} shouts for help: ${name} will not leave them alone.`]).slice(-5) });
    }
  }
  // down to a third of their health (a quarrel stops there)
  function beaten(key) { const hp = key === 'player' ? { hp: state.player?.hp ?? 20, max: state.player?.maxHp ?? 20 } : { hp: getBrainConfig(key)?.hp ?? 10, max: getBrainConfig(key)?.maxHp ?? 10 }; return hp.hp <= hp.max / 3; }
  // a guard watching someone: they did it again, so it fights them
  function watchers(key, what) {
    if (beaten(key)) return;
    for (const c of state.characters) {
      const w = getBrainConfig(c.id).mind?.watch;
      if (!w || w.who !== key || !w.warned || Date.now() > w.until || c.id === key) continue;
      setBrainConfig(c.id, { hostileTo: { ...(getBrainConfig(c.id).hostileTo || {}), [key]: Date.now() }, pendingChat: (getBrainConfig(c.id).pendingChat || []).concat([`[event] ${w.name} ${what} after your warning. Stop them.`]).slice(-5) });
      addMemory(c, `${w.name} ${what} after you warned them.`, 2.5);
      w.until = 0;
    }
  }
  // hostility toward someone ends when they are down, out of sight a minute, or it has calmed down
  function standDown(g) {
    const cfg = getBrainConfig(g.id), h = cfg.hostileTo; if (!h || !Object.keys(h).length) return;
    const m = mindOf(g), next = { ...h };
    for (const key of Object.keys(h)) {
      const o = charOf(key), a = m.angryAt?.[key];
      const down = !o || o.defeated || (key !== 'player' && getBrainConfig(key).defeated) || (key === 'player' && (state.player?.hp ?? 1) <= 0);
      const seen = o && !down && dist2(g, o) <= 10 && (window.tablefolk?.canSeeEachOther?.(g, o) ?? true);
      if (seen) m.lastSaw = { ...(m.lastSaw || {}), [key]: Date.now() };
      // a monster or a raider (threats.js): fought to the end, or till it is gone a minute
      const monster = key !== 'player' && o && (o._threat || window.tablefolkPlay?.isHostile?.(o));
      const gone = !seen && Date.now() - (m.lastSaw?.[key] || h[key]) > (monster ? 60000 : 15000);
      if (monster) { if (down || gone) { delete next[key]; addMemory(g, `You stopped fighting ${key}${down ? ': it is down' : ': it is gone'}.`, 1.5); } continue; }
      // a quarrel (tempers, a guard called over): not to the death. It stops
      // when the other is down to a third of its health, or runs off
      const hp = key === 'player' ? { hp: state.player?.hp ?? 20, max: state.player?.maxHp ?? 20 } : { hp: getBrainConfig(key).hp ?? 10, max: getBrainConfig(key).maxHp ?? 10 };
      if (!down && hp.hp <= hp.max / 3) { delete next[key]; endQuarrel(g, key, 'beaten', true); continue; }
      if (!down && gone) { delete next[key]; endQuarrel(g, key, 'ran', true); continue; }
      const cooled = a ? a.v < .5 : !m.watch || m.watch.who !== key;
      if (down || gone || (cooled && Date.now() - h[key] > 3000)) {
        delete next[key];
        if (a) { a.hostile = false; a.level = Math.min(a.level, 3); }
        if (state.ladderFight && (state.ladderFight.a === g.id || state.ladderFight.b === g.id)) state.ladderFight = null;
        if (m.watch?.who === key) m.watch = null;
        addMemory(g, `You stopped fighting ${nameOfKey(key)}${down ? ': they are down' : gone ? ': they are gone' : ''}.`, 1.5);
      }
    }
    setBrainConfig(g.id, { hostileTo: Object.keys(next).length ? next : null });
  }
  setInterval(() => { try { for (const g of state.characters || []) if (getBrainConfig(g.id).hostileTo) standDown(g); } catch {} }, 1000);
  // the end of a quarrel that is not to the death: a line, and the other is told to leave
  function endQuarrel(g, key, how, handled = false) {
    const cfg = getBrainConfig(g.id), m = mindOf(g), name = nameOfKey(key), o = charOf(key), a = m.angryAt?.[key];
    if (!handled) { const h = { ...(cfg.hostileTo || {}) }; delete h[key]; setBrainConfig(g.id, { hostileTo: Object.keys(h).length ? h : null }); }
    if (a) { a.hostile = false; a.level = Math.min(a.level || 0, 3); a.orderedOut = true; }
    if (state.ladderFight && (state.ladderFight.a === g.id || state.ladderFight.b === g.id)) state.ladderFight = null;
    if (m.watch?.who === key) m.watch = null;
    const line = how === 'ran' ? `And stay away, ${name}!` : how === 'yielded' ? `Good. Now get out of here, ${name}, and don't come back.` : `That's enough. Get out of here, ${name}, and don't come back.`;
    try { if (!g.defeated && o && dist2(g, o) <= 10) say(g, line, true); } catch {}
    addMemory(g, how === 'ran' ? `${name} ran from you.` : `You beat ${name} and sent them away.`, 2.5);
    if (o && key !== 'player') { const oc = getBrainConfig(key); addMemory(o, `${g.id} beat you and told you to leave.`, 3); setBrainConfig(key, { pendingChat: (oc.pendingChat || []).concat([`[event] ${g.id} stops hitting you and tells you to leave.`]).slice(-5) }); }
    if (key === 'player') window.tablefolkToast?.(`${g.id} stops: "${line}"`, { type: 'warn' });
    try { window.tablefolkJobs?.addNews?.(g.id, how === 'ran' ? `${name} ran from ${g.id}` : `${g.id} beat ${name} in a quarrel`, 'quarrel'); } catch {}
  }
  // will it deal with them? (app.js sell, give, give_quest; trade)
  // (above rails the model decides whom it serves: only the deals code runs for it keep the refusal)
  function refuses(g, who, byCode = false) { const a = mindOf(g).angryAt?.[keyOf(who)]; return !!a && angerLevel(a.v) >= 3 && tempersOn() && (byCode || !aboveRails(g)); }
  function temperLines(g) {
    const m = mindOf(g), out = [];
    for (const [key, a] of Object.entries(m.angryAt || {})) {
      const name = nameOfKey(key), lv = Math.min(a.level || 0, Math.max(angerLevel(a.v), a.hostile || a.orderedOut ? 4 : 0));
      if (lv >= 4 && a.hostile) out.push(`You are fighting ${name}: they pushed you too far. They can stop it by apologising.`);
      else if (aboveRails(g) && lv >= 3) out.push(`You are furious with ${name} (${a.why || 'they keep at you'}). What you do about it is up to you: refuse to deal with them, order them out, call for help, walk away, or fight them with attack(${name}) (not to the death).`);
      else if (lv >= 4 && a.orderedOut) out.push(`Order ${name} out of here. If they insult or hit you again, call for help.`);
      else if (lv >= 4 && a.backAway != null) out.push(`${name} frightens you: keep away from them; you called for help.`);
      else if (lv >= 3) out.push(`You will not serve or help ${name} until they apologise.`);
      else if (lv >= 2) out.push(`You have had enough of ${name}. Tell them to stop or leave.`);
      else if (lv >= 1) out.push(`${name} is getting on your nerves.`);
    }
    const w = m.watch; if (w && Date.now() < w.until && !w.warned) out.push(`${w.for} called for help: ${w.name} will not leave them alone. Go to ${w.name} and warn them once to stop.`);
    else if (w && Date.now() < w.until) out.push(`You warned ${w.name}. If they insult or hit anyone again, stop them.`);
    for (const [who, until] of Object.entries(m.pieceSaid || {})) if (Date.now() < until) out.push(`You have said your piece to ${who}; back to work.`);
    return out;
  }
  // a reason to speak on a turn when nobody has spoken to it (world-integration.js)
  function speechCause(g) {
    const m = mindOf(g), cfg = getBrainConfig(g.id), p = g.root?.position; if (!p) return '';
    // jobs.js: the evening's talk, an ask for what its work needs
    const jc = window.tablefolkJobs?.speechCause?.(g); if (jc) return jc;
    if (gossipLine(g)) return 'news';
    const w = want(g); if (/\b(buy it|ask for|ask|beg|tell|let .* know|call for help|help)\b/i.test(w)) return 'want';
    const R = state.earshot || 6, near = [...state.characters.filter(c => c !== g && !c.defeated && Math.hypot(c.root.position.x - p.x, c.root.position.z - p.z) <= R).map(c => c.id), ...(state.playerAvatar && Math.hypot(state.playerAvatar.root.position.x - p.x, state.playerAvatar.root.position.z - p.z) <= R ? [playerName()] : [])];
    const named = n => new RegExp('\\b' + String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (cfg.goal && near.some(n => named(n).test(cfg.goal))) return 'goal';
    if (Object.entries(m.angryAt || {}).some(([k, a]) => angerLevel(a.v) >= 2 && near.includes(nameOfKey(k)))) return 'temper';
    if (m.watch && Date.now() < m.watch.until && !m.watch.warned) return 'warn';
    if (playerLines(g).some(l => /^You could ask/.test(l))) return 'ask';
    return '';
  }

  // ---- recipes: what worked before ----
  // A small Voyager-style skill memory. Its last few command lines are kept;
  // when a give or sale to someone completes what the player had asked for,
  // the commands since that request are saved as a recipe under the
  // request's words. A later request that shares two or more words gets
  // "Last time this worked: walk(chest) -> take(map, chest) -> give(map)".
  function noteLine(g, line) {
    const m = mindOf(g), cmds = String(line || '').match(/\b(walk|take|put|use|give|sell|open|wield|eat|close)\([^()]*\)/g);
    if (!cmds) return;
    m.recent = [...(m.recent || []), ...cmds.map(c => ({ c, turn: m.turn }))].slice(-8);
  }
  function learnRecipe(g) {
    const m = mindOf(g), ask = m.askedAt, words0 = m.askWords;
    if (ask == null || !words0?.length) return;
    const steps = (m.recent || []).filter(x => x.turn >= ask).map(x => x.c);
    if (!steps.length) return;
    m.recipes = [...(m.recipes || []).filter(r => r.words.join() !== words0.join()), { words: words0, steps: steps.slice(-5) }].slice(-6);
    m.askedAt = null;
  }
  function recipeLine(g) {
    const m = mindOf(g); if (!m.recipes?.length || !m.heard) return '';
    const said = new Set(words(m.heard)); let best = null, bs = 1;
    for (const r of m.recipes) { const n = r.words.filter(w => said.has(w)).length; if (n > bs) { best = r; bs = n; } }
    return best ? 'Last time this worked: ' + best.steps.join(' -> ') : '';
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
    // what the player did, for the day's news (jobs.js topics: the evening talks about it)
    try {
      const pn = playerName(), J = window.tablefolkJobs;
      if (kind === 'attacked' && me && !window.tablefolkPlay?.isHostile?.(g)) J?.addNews?.('', `${pn} attacked ${g.id}`, 'player');
      else if (kind === 'given' && me) J?.addNews?.('', `${pn} gave ${g.id} ${d.what}${isFood(String(d.what).replace(/^(an?|some|the) /, '')) ? ' to eat' : ''}`, 'player');
      else if (kind === 'sold' && isPlayerName(d.buyer)) J?.addNews?.('', `${pn} bought ${d.item} from ${g.id} for ${d.price} gold`, 'player');
    } catch {}
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
      // a guard watching them steps in; ordered out already: it calls for help
      if (tempersOn()) { const k = keyOf(d.by); watchers(k, 'attacked ' + g.id); if (m.angryAt?.[k]?.orderedOut) callForHelp(g, k); }
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
      // a gift (or paying up) calms anger at the giver too
      if (m.angryAt?.[keyOf(d.who)]) calm(g, keyOf(d.who), .5, `${d.who} made it up to you with ${d.what}`);
      if (!me) opinion(g, d.who, .35, `gave you ${d.what}`);
      if (me) { m.mood.trust = clamp01(m.mood.trust + .25); keep(pfOf(g).gifts, d.what, 5); promiseKept(g, d.what); }
      addMemory(g, `${d.who} gave you ${d.what}.`, 2);
    } else if (kind === 'sold') {
      push(g, 'joy', .2, `you sold ${d.item}`);
      if (isPlayerName(d.buyer)) m.mood.trust = clamp01(m.mood.trust + .05);
      addMemory(g, `You sold ${d.buyer} ${d.item} for ${d.price} gold.`, 2);
      if (isPlayerName(d.buyer)) learnRecipe(g);
    } else if (kind === 'gave') {
      addMemory(g, `You gave ${d.to} ${d.item}.`, 1.5);
      if (isPlayerName(d.to)) learnRecipe(g);
    } else if (kind === 'heard') {
      m.heard = String(d.text || '');
      if (me) learnFromPlayer(g, d.text);
      // a friendly word nudges trust; an insult does the opposite (provoked)
      const rude = tempersOn() && !!insultIn(g, d.text);
      if (me && !rude) m.mood.trust = clamp01(m.mood.trust + .004);
      provoked(g, d.who, String(d.text || ''));
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
    noteLine(g, line);
    m.turn++; m.lastRound = round; m.lastLine = String(line || '');
    // feelings fade over a few turns (a punch is still felt five turns on), trust over many
    for (const k of MOODS) m.mood[k] += (b[k] - m.mood[k]) * .07;
    m.mood.trust += (b.trust - m.mood.trust) * .015;
    // anger at someone holds while they keep at it; three of its turns
    // without a new insult and it starts to fade
    let held = 0;
    for (const a of Object.values(m.angryAt || {})) { if (m.turn - (a.last ?? m.turn) >= 3 && !a.hostile) a.v *= .85; held = Math.max(held, a.v); }
    if (held > m.mood.anger) m.mood.anger = held;
    for (const k of MOODS) if (m.mood[k] < .3) delete m.why[k];
    // slow: a living world gives each character a turn every 15-20 s, and at
    // twice this a meal lasted three minutes ("Thistle keeps saying she's hungry")
    // (while the world lives, needs grow with real time instead: below)
    if (needsOn(g) && !window.tablefolkLive?.on) { m.hunger = clamp01(m.hunger + .012); m.tired = clamp01(m.tired + .007); }
    if (/emote\(\s*"?sleep/i.test(line)) m.tired = 0;
    const slept = (m.prevTired ?? 0) - m.tired > .3; m.prevTired = m.tired;
    if (slept || m.turn - (m.lastConsolidated ?? 0) >= 12) consolidate(g);
    if (slept || m.turn - (m.lastReflected ?? 0) >= 30) setTimeout(() => reflectWithModel(g), 50);
    advancePlan(g);
    maybeGlance(g);
    if (!getBrainConfig(g.id).goal && m.turn >= 2 && m.turn - (m.lastPlanned ?? -99) >= 40) setTimeout(() => planDay(g), 400);
    if ((cfg.goal || '') !== m.goal) { m.goal = cfg.goal || ''; m.goalTurn = m.turn; }
    if (m.feel && m.turn - m.feel.turn > 4) m.feel = null;
    const w = m.watch, wo = w && !w.warned && charOf(w.who);
    if (wo && dist2(g, wo) <= 3.2 && /\b(say|whisper)\s*\(/.test(String(line || ''))) { w.warned = true; w.until = Date.now() + 60000; addMemory(g, `You warned ${w.name} to leave ${w.for} alone.`, 2); }
    if (m.threat && m.mood.fear < .3 && m.mood.anger < .3) m.threat = null;
  }

  // While the world lives (live.js), hunger and tiredness grow with real time,
  // the same at every pace: from nothing to hungry (.55) in about 8 minutes,
  // to tired (.7) in about 12. (Per model turn they hardly moved: a living
  // character mostly idles without its model.) Turn-by-turn play: tick().
  const HUNGER_PER_S = .55 / 480, TIRED_PER_S = .7 / 720;
  let needsAt = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = Math.min(5, (now - needsAt) / 1000); needsAt = now;
    if (!window.tablefolkLive?.on) return;
    for (const g of state.characters || []) {
      const cfg = getBrainConfig(g.id);
      if (g.defeated || cfg.defeated || !needsOn(g) || window.tablefolkPlay?.isAnimal?.(g) || window.tablefolkPlay?.isHostile?.(g)) continue;
      const m = mindOf(g);
      m.hunger = clamp01(m.hunger + dt * HUNGER_PER_S);
      // starving (.8+) for a third of a game day: weak (slow, no work); a "harsh" world drains health too
      const t = gameMinute();
      if (t != null) {
        if (m.hunger >= .8) m.starvingSince ??= t; else m.starvingSince = null;
        if (state.harsh && weak(g) && t - (m.lastDrain ?? -999) >= 60) { m.lastDrain = t; try { window.tablefolkCombat?.hurt?.(g, 1, 'hunger', 'starves'); } catch {} }
      }
      if (!g.pose || g.pose.mode !== 'lie') m.tired = clamp01(m.tired + dt * TIRED_PER_S);
    }
  }, 1000);

  const gameMinute = () => { const k = window.tablefolkClock?.now?.(); return k ? (k.day - 1) * 1440 + k.min : null; };
  function weak(g) { const m = getBrainConfig(g.id).mind, t = gameMinute(); return !!(m && t != null && m.starvingSince != null && t - m.starvingSince > 480); }
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
      if (weak(g)) bits.push('weak from hunger');
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
    out.push(...temperLines(g));
    out.push(...playerLines(g));
    out.push(...secretLines(g));
    const rl = relLine(g); if (rl) out.push(rl);
    const b = bodyLine(g); if (b) out.push(b);
    // jobs.js: what it does for a living, what it is doing, what it did today
    out.push(...(window.tablefolkJobs?.cardLine?.(g) || []));
    const ask = window.tablefolkJobs?.askLine?.(g); if (ask) out.push(ask);
    const w = want(g), urgent = /^(stay safe|get your wounds|get away|tell .* attacked|let .* stand for)/.test(w);
    if (w && (urgent || !cfg.goal)) out.push('You want: ' + w + '.');
    if (cfg.goal) { const n = m.turn - m.goalTurn; out.push(`Current goal: ${cfg.goal}` + (n >= 6 ? ` (${n} turns on it: what is the next step?)` : '')); }
    const mem = recall(g, aboveRails(g) ? 6 : { basic: 3, capable: 4, ambitious: 6 }[tier(g)]); if (mem.length) out.push('You remember: ' + mem.join(' | '));
    const kn = facts(g); if (kn.length) out.push('You know: ' + kn.join(' | '));
    const rc = !danger.length && recipeLine(g); if (rc) out.push(rc);
    const gl = !danger.length && gossipLine(g); if (gl) out.push(gl);
    // agency.js (guided, free): its notes, the day's plan, how its last activities went
    out.push(...(window.tablefolkAgency?.cardLines?.(g) || []));
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

  // Think before acting this turn? Only big brains (tier "ambitious"), only
  // when it matters: danger close by, a fresh request or promise from the
  // player, or a trade cue (skills' urgent lines). A character's "thinking":
  // true makes it think every turn; the scenario's "autoThink": false turns
  // this off.
  function thinkNow(g) {
    if (state.autoThink === false || tier(g) !== 'ambitious') return false;
    const key = String(window.tablefolkBrainInfo?.()?.key || '');
    if (!/bonsai2|12b|endpoint/i.test(key)) return false;   // models that think well
    if (dangerLines(g).length) return true;
    if (urgentLines(g).length) return true;
    return (window.tablefolkSkills?.urgentLines?.(g) || []).length > 0;
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
    if (!it) return fail(g, item ? `eat failed: ${g.id} has no ${item}` : 'eat failed: nothing to eat', false);
    if (POTION.test(it.name)) {
      it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) inv.items = inv.items.filter(i => i !== it);
      setBrainConfig(g.id, { inventory: inv });
      const healed = window.tablefolkCombat?.heal(g, 4) || 0;
      try { emitBadge(g, 'drinks ' + it.name); inventoryChanged(); } catch {}
      return say(g, `${g.id} drinks the ${it.name}${healed ? ' and heals ' + healed : ''}`, false);
    }
    const nourish = isFood(it.name), drunk = isDrink(it.name);
    if (!nourish) return fail(g, `${drunk ? 'drink' : 'eat'} failed: ${it.name} is not ${drunk ? 'something to drink' : 'food'}`, false);
    it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) inv.items = inv.items.filter(i => i !== it);
    setBrainConfig(g.id, { inventory: inv });
    const m = mindOf(g); m.hunger = Math.max(0, m.hunger - nourish); push(g, 'joy', .1);
    try { emitBadge(g, (drunk ? 'drinks ' : 'eats ') + it.name); inventoryChanged(); } catch {}
    return say(g, `${g.id} ${drunk ? 'drinks' : 'eats'} the ${it.name}`, false);
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

  window.tablefolkMind = { startFight, mayFight, calmDown, fleeSpot, bestWeapon, insult, isDrink, weak, endQuarrel, food, provoked, insultIn, refuses, speechCause, temperLines, standDown, callForHelp, angerLevel, thinkNow, recipeLine, urgentLines, planDay, persist, reflex, dangerLines, foes, tier, consolidate, reflectWithModel, hearGossip, gossipLine, onSpoke, prepare, learnFromPlayer, playerLines, pfOf, event, tick, cardLines, opinion, wantsTurn, remember, feel, eat, addMemory, recall, mindOf, temperament, FOOD, isFood };
})();
