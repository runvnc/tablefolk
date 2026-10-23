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
 *   emote(sleep) bring them down. Off for the undead, and for every character
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
    }
    return cfg.mind;
  }
  const needsOn = g => state.needs !== false && !UNDEAD.test(g.charModel || '');

  // ---- memory ----
  function addMemory(g, text, w = 1, kind = 'event') {
    const m = mindOf(g); text = String(text || '').trim().slice(0, 160); if (!text) return;
    const same = m.mem.find(e => e.text.toLowerCase() === text.toLowerCase());
    if (same) { same.turn = m.turn; same.w = Math.max(same.w, w); return; }
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
  function score(e, ctx, now) { return e.w * .5 + overlap(e.text, ctx) * 2 + 1.5 / (1 + (now - e.turn) / 6); }
  function recall(g, n = 3) {
    const m = mindOf(g), ctx = context(g);
    return m.mem.map(e => ({ e, s: score(e, ctx, m.turn) })).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.e)
      .sort((a, b) => a.turn - b.turn).map(e => e.text);
  }
  function facts(g, n = 2) {
    const cfg = getBrainConfig(g.id), ctx = context(g);
    const all = [...(Array.isArray(cfg.knows) ? cfg.knows : []), ...(Array.isArray(state.lore) ? state.lore : [])].map(String);
    return all.map(t => ({ t, s: overlap(t, ctx) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.t);
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
      if (me) m.mood.trust = clamp01(m.mood.trust - .35);
      m.threat = d.by; m.threatTurn = m.turn;
      addMemory(g, `${d.by} attacked you${d.hit === false ? ' (and missed)' : ''}.`, 3);
    } else if (kind === 'saw_attack') {
      push(g, t === 'brave' ? 'anger' : 'fear', .25, `${d.by} attacked ${d.victim}`);
      if (me) m.mood.trust = clamp01(m.mood.trust - .15);
      addMemory(g, `${d.by} attacked ${d.victim}.`, 1.5);
    } else if (kind === 'saw_defeat') {
      push(g, 'sadness', .35, `${d.victim} was struck down`); push(g, 'fear', t === 'brave' ? .1 : .3, `${d.victim} was struck down`);
      if (me) m.mood.trust = clamp01(m.mood.trust - .3);
      addMemory(g, `${d.by ? d.by + ' struck down ' : 'You saw '}${d.victim}${d.by ? '' : ' fall'}.`, 2.5);
    } else if (kind === 'given') {
      push(g, 'joy', .35, `${d.who} gave you ${d.what}`); m.mood.anger *= .6;
      if (me) m.mood.trust = clamp01(m.mood.trust + .25);
      addMemory(g, `${d.who} gave you ${d.what}.`, 2);
    } else if (kind === 'sold') {
      push(g, 'joy', .2, `you sold ${d.item}`);
      if (isPlayerName(d.buyer)) m.mood.trust = clamp01(m.mood.trust + .05);
      addMemory(g, `You sold ${d.buyer} ${d.item} for ${d.price} gold.`, 2);
    } else if (kind === 'gave') {
      addMemory(g, `You gave ${d.to} ${d.item}.`, 1.5);
    } else if (kind === 'heard') {
      m.heard = String(d.text || '');
      if (me) m.mood.trust = clamp01(m.mood.trust + .004);
    }
  }
  // One of its turns went by: needs grow, feelings settle.
  function tick(g, line = '') {
    const cfg = getBrainConfig(g.id); if (cfg.defeated) return;
    const m = mindOf(g), b = baseline(cfg);
    m.turn++; m.lastRound = round;
    // feelings fade over a few turns (a punch is still felt five turns on), trust over many
    for (const k of MOODS) m.mood[k] += (b[k] - m.mood[k]) * .07;
    m.mood.trust += (b.trust - m.mood.trust) * .015;
    for (const k of MOODS) if (m.mood[k] < .3) delete m.why[k];
    if (needsOn(g)) { m.hunger = clamp01(m.hunger + .025); m.tired = clamp01(m.tired + .015); }
    if (/emote\(\s*"?sleep/i.test(line)) m.tired = 0;
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
    if (needsOn(g) && m.hunger >= .55) { const f = food(g); return f ? `eat something: eat(${f})` : 'find something to eat (buy it, or ask for some)'; }
    if (needsOn(g) && m.tired >= .7) return 'rest: emote(sleep)';
    return '';
  }
  function cardLines(g) {
    if (!g) return [];
    const cfg = getBrainConfig(g.id), m = mindOf(g), out = [];
    const f = feelLine(g); if (f) out.push(f);
    const b = bodyLine(g); if (b) out.push(b);
    const w = want(g), urgent = /^(stay safe|get your wounds|get away|tell .* attacked|let .* stand for)/.test(w);
    if (w && (urgent || !cfg.goal)) out.push('You want: ' + w + '.');
    if (cfg.goal) { const n = m.turn - m.goalTurn; out.push(`Current goal: ${cfg.goal}` + (n >= 6 ? ` (${n} turns on it: what is the next step?)` : '')); }
    const mem = recall(g); if (mem.length) out.push('You remember: ' + mem.join(' | '));
    const kn = facts(g); if (kn.length) out.push('You know: ' + kn.join(' | '));
    return out;
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
    if (cfg.pendingChat?.length) return true;
    if (window.tablefolkWorkflows?.active(g.id)) return true;
    const w = want(g);
    if (/^(stay safe|get away|tell .* attacked|let .* stand for)/.test(w)) return true;
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
    const nourish = isFood(it.name);
    if (!nourish) return say(g, `eat failed: ${it.name} is not food`, false);
    it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) inv.items = inv.items.filter(i => i !== it);
    setBrainConfig(g.id, { inventory: inv });
    const m = mindOf(g); m.hunger = Math.max(0, m.hunger - nourish); push(g, 'joy', .1);
    try { emitBadge(g, 'eats ' + it.name); inventoryChanged(); } catch {}
    return say(g, `${g.id} eats ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}`, false);
  }

  // ---- events from the rest of the game ----
  window.addEventListener('tablefolk-agent-turn', e => { const g = state.characters.find(c => c.id === e.detail?.agentId); if (g) tick(g, e.detail.line || ''); });
  window.addEventListener('tablefolk-player-chat', e => { const g = state.characters.find(c => c.id === e.detail?.agentId); if (g) event(g, 'heard', { who: playerName(), text: e.detail.text }); });
  window.addEventListener('tablefolk-defeated', e => {
    const id = e.detail?.id, v = id === 'player' ? state.playerAvatar : state.characters.find(c => c.id === id); if (!v) return;
    const name = id === 'player' ? playerName() : id, p = v.root.position, range = state.earshot || 6;
    for (const o of state.characters) if (o !== v && !o.defeated && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < range) event(o, 'saw_defeat', { by: e.detail.by, victim: name });
  });

  window.tablefolkMind = { event, tick, cardLines, wantsTurn, remember, feel, eat, addMemory, recall, mindOf, temperament, FOOD, isFood };
})();
