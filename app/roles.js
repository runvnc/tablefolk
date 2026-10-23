/* roles.js -- jobs as data: "role": "shopkeeper" gives a character what the
 * job needs, with no code from the scenario's author.
 *
 * A role adds:
 *   - the commands the job needs (on top of the character's own list)
 *   - a duty line in the stable part of its prompt ("Your job: ...")
 *   - state-card lines each turn: what it sells and for how much, and, when
 *     the customer names a price, what that offer means ("45 gold for the
 *     magic sword: enough, sell it with sell(magic sword, 45)"). The game
 *     reads the offer out of the words; a 2B model only has to act on it.
 *   - rules the game keeps: sell() refuses a price under the lowest
 *   - behaviour run by code: a companion keeps up with the player
 *
 *   "agents": [{ "id": "mog", "role": "shopkeeper",
 *     "prices": { "magic sword": [50, 40], "healing potion": 8 } }]   // asking, or [asking, lowest]
 *
 * Roles: shopkeeper, innkeeper, guard, quest_giver, companion, villager.
 * Loaded after app.js and mind.js; uses app.js globals.
 */
(function () {
  const ROLES = {
    shopkeeper: { commands: ['say', 'sell', 'inventory'], sells: true,
      duty: 'You run a shop. Greet customers, say what you sell and what it costs, haggle a little if you like, and when a customer agrees to a price, sell it with sell(item, price) in the same reply.' },
    innkeeper: { commands: ['say', 'sell', 'give', 'inventory'], sells: true,
      duty: 'You keep the inn. Welcome guests, sell food, drink and beds with sell(item, price), and pass on the local gossip.' },
    guard: { commands: ['say', 'attack'],
      duty: 'You are a guard. Keep watch, question strangers, keep the peace, and stand up to anyone who causes trouble.' },
    quest_giver: { commands: ['say', 'give_quest', 'give'],
      duty: 'You need help with something. Tell travellers about your problem, ask for their help with give_quest(text), and reward them with give(item) when it is done.' },
    companion: { commands: ['say', 'walk', 'attack'], follows: true,
      duty: 'You travel with {player}. Stay close, help when you can, and talk about what you see.' },
    villager: { commands: ['say', 'emote'],
      duty: 'You live here. Go about your day, chat with people, and share what you know about the place.' },
  };
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const cfgOf = g => getBrainConfig(g.id);
  const roleOf = g => g && ROLES[String(cfgOf(g).role || '').toLowerCase()] || null;

  // ---- prices ----
  function priceOf(g, item) {
    const p = cfgOf(g).prices || {}, k = Object.keys(p).find(n => n.toLowerCase() === String(item).toLowerCase())
      || Object.keys(p).find(n => String(item).toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(String(item).toLowerCase()));
    if (k == null) return null;
    const v = p[k], ask = Array.isArray(v) ? +v[0] : +v, low = Array.isArray(v) && v[1] != null ? +v[1] : ask;
    return Number.isFinite(ask) ? { ask, low: Number.isFinite(low) ? low : ask } : null;
  }
  // The lowest price sell() accepts (null: no rule).
  function floor(g, item) { return roleOf(g)?.sells ? priceOf(g, item)?.low ?? null : null; }
  const wares = g => (charInventory(g).items || []).filter(i => (i.qty ?? 1) > 0);
  function waresLine(g) {
    const list = wares(g); if (!list.length) return 'You have nothing left to sell.';
    return 'You sell: ' + list.map(i => {
      const p = priceOf(g, i.name), n = (i.qty ?? 1) > 1 ? ` (${i.qty} left)` : '';
      return p ? `${i.name} ${p.ask} gold${p.low < p.ask ? ` (never under ${p.low})` : ''}${n}` : `${i.name} (name a fair price)${n}`;
    }).join(', ') + '.';
  }

  // ---- reading the customer's words ----
  // Which of its wares a text is about: the longest name, or a word of one.
  function itemIn(g, text) {
    const t = String(text || '').toLowerCase(), list = wares(g).map(i => i.name);
    const whole = list.filter(n => t.includes(n.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    if (whole) return whole;
    return list.find(n => n.toLowerCase().split(/\s+/).some(w => w.length > 3 && new RegExp('\\b' + w.replace(/s$/, '') + 's?\\b').test(t))) || null;
  }
  const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 };
  function amountIn(text) {
    // a number said with "gold" first ("2 potions for 16 gold" is 16), else any number
    const t = String(text || '').toLowerCase(), m = t.match(/(\d+)\s*(gold|coins?|g\b|pieces)/) || t.match(/(\d+)/);
    if (m) return +m[1];
    const w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty|sixty|hundred)\b\s*(gold|coins?)/);
    return w ? NUM_WORDS[w[1]] : null;
  }
  const BUYING = /\b(buy|purchase|sell me|i'?ll take|take it|how much|price|cost|pay|offer|deal|gold|coins?)\b/i;
  const YES = /^\s*(yes|yeah|yep|ok(ay)?|deal|agreed|sure|fine|done|alright|you have a deal|it'?s a deal)\b/i;
  // What the latest words say about buying, as a line for the card.
  function offerLine(g) {
    const r = roleOf(g); if (!r?.sells) return '';
    const st = (g._shop ||= {}), heard = window.tablefolkMind?.mindOf(g).heard || '', who = playerName();
    if (!heard || st.done === heard) return '';
    const item = itemIn(g, heard) || (BUYING.test(heard) || YES.test(heard) || amountIn(heard) != null ? st.item : null);
    if (item) st.item = item;
    if (!item) return BUYING.test(heard) ? 'They may want to buy: tell them what you sell and the price.' : '';
    const p = priceOf(g, item); let amt = amountIn(heard);
    // "yes" to the price it named itself
    if (amt == null && YES.test(heard) && st.quoted?.item === item) amt = st.quoted.price;
    if (amt == null) return p ? `They are asking about the ${item}: it is ${p.ask} gold.` : `They are asking about the ${item}.`;
    if (!p) return `${who} offers ${amt} gold for the ${item}. If that is fair, sell it now: sell(${item}, ${amt}).`;
    if (amt >= p.low) return `${who} offers ${amt} gold for the ${item}: that is enough. Sell it now: sell(${item}, ${amt}).`;
    return `${who} offers ${amt} gold for the ${item}: too little (you never go under ${p.low}). Refuse, or ask for more.`;
  }
  // Remember the price it named, so a plain "yes" can be read as accepting it.
  window.addEventListener('tablefolk-say', e => {
    const g = state.characters.find(c => c.id === e.detail?.agentId); if (!g || !roleOf(g)?.sells || e.detail.voiced === false) return;
    const item = itemIn(g, e.detail.text), amt = amountIn(e.detail.text);
    if (item && amt != null) (g._shop ||= {}).quoted = { item, price: amt };
  });
  // A sale closes the offer it answered.
  window.addEventListener('tablefolk-inventory', () => {
    for (const g of state.characters) if (g._shop) g._shop.done = window.tablefolkMind?.mindOf(g).heard || g._shop.done;
  });

  // ---- the buyer agrees ----
  // Any seller (role or not): sell() goes through only when the player's
  // latest words to it offer at least that price, accept the price it named,
  // or ask to buy at its asking price; else it is an offer the player can take
  // (the card below). Without this a model "sold" the sword for 40 to a
  // player who had offered 5, and took their gold.
  const WANTS = /\b(buy|i'?ll take|sell me|i'?ll have|i want|i'?d like|give me|purchase|take (it|one))\b/i;
  function consent(g, item, price) {
    const st = (g._shop ||= {});
    if (st.accept && st.accept.item === item && st.accept.price === price) { st.accept = null; return true; }
    const heard = window.tablefolkMind?.mindOf(g).heard || '';
    if (!heard) return false;
    const about = itemIn(g, heard), amt = amountIn(heard);
    if (about && about.toLowerCase() !== String(item).toLowerCase()) return false;
    if (amt != null) return amt >= price;
    if (YES.test(heard)) return !st.quoted || st.quoted.item !== item || price <= st.quoted.price;
    if (WANTS.test(heard)) { const p = priceOf(g, item); return !p || price <= p.ask; }
    return false;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function offer(g, item, price) {
    (g._shop ||= {}).quoted = { item, price };
    if (window.tablefolkScenario?.active?.testing) return;
    document.getElementById('shopOffer')?.remove();
    const box = document.createElement('div'); box.id = 'shopOffer';
    box.innerHTML = `<span>${esc(g.id)} offers you the ${esc(item)} for ${price} gold.</span><button data-buy>buy</button><button data-no>no thanks</button>`;
    document.body.appendChild(box);
    box.querySelector('[data-buy]').onclick = () => { box.remove(); g._shop.accept = { item, price }; sell(g, item, price); };
    box.querySelector('[data-no]').onclick = () => box.remove();
    setTimeout(() => box.remove(), 30000);
  }

  // ---- prompt ----
  function duty(g) { const r = roleOf(g); return r ? r.duty.replace(/\{player\}/g, playerName()) : ''; }
  function cardLines(g) {
    const r = roleOf(g); if (!r) return [];
    const out = [];
    if (r.sells) { out.push(waresLine(g)); const o = offerLine(g); if (o) out.push(o); }
    return out;
  }
  function commands(g) { return roleOf(g)?.commands || []; }

  // ---- code-run behaviour ----
  // A companion that has fallen behind walks back to the player after the
  // player moves (no model call).
  window.addEventListener('tablefolk-player-turn', () => {
    const me = state.playerAvatar; if (!me) return;
    for (const g of state.characters) {
      if (!roleOf(g)?.follows || g.defeated || cfgOf(g).enabled === false) continue;
      const a = g.root.position, b = me.root.position;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 2.6) { try { walk(g, `${Math.round(b.x)},${Math.round(b.z)}`); } catch {} }
    }
  });

  window.tablefolkRoles = { ROLES, roleOf, duty, cardLines, commands, floor, priceOf, offerLine, itemIn, amountIn, consent, offer };
})();
