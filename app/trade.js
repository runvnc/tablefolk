/* trade.js -- buying and selling: the rules the game keeps so a 2B model
 * can run a shop. Used by sell() in app.js for every seller, and by the
 * "trade" skill (skills/trade/skill.json), whose state-card lines come from
 * here:
 *
 *   wares   "You sell: magic sword 50 gold (never under 40), healing potion 8 gold."
 *   offer   what the customer's latest words mean: "Ana offers 45 gold for
 *           the magic sword: that is enough. Sell it now: sell(...)". The game
 *           reads the offer out of the words; the model only has to act.
 *
 * Prices: the agent's "prices" ({ "magic sword": [50, 40], "potion": 8 },
 * asking or [asking, lowest]) or the trade skill's "prices" param. sell()
 * refuses a price under the lowest, and goes through only when the buyer
 * agreed (else it is an offer the player can take with a buy button).
 * Loaded after app.js, mind.js and skills.js; uses app.js globals.
 */
(function () {
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const cfgOf = g => getBrainConfig(g.id);

  // ---- prices ----
  function pricesOf(g) { const c = cfgOf(g); return c.prices || c.skillData?.trade?.params?.prices || {}; }
  function priceOf(g, item) {
    const p = pricesOf(g), it = String(item).toLowerCase();
    const k = Object.keys(p).find(n => n.toLowerCase() === it) || Object.keys(p).find(n => it.includes(n.toLowerCase()) || n.toLowerCase().includes(it));
    if (k == null) return null;
    const v = p[k], ask = Array.isArray(v) ? +v[0] : +v, low = Array.isArray(v) && v[1] != null ? +v[1] : ask;
    return Number.isFinite(ask) ? { ask, low: Number.isFinite(low) ? low : ask } : null;
  }
  // The lowest price sell() accepts (null: no rule).
  function floor(g, item) { return priceOf(g, item)?.low ?? null; }
  // What it sells: what it carries, except the materials its own skills use
  // up (a smith's iron bars), unless they have a price.
  function materials(g) {
    const out = new Set();
    for (const m of window.tablefolkSkills?.skillsOf(g) || []) for (const c of Object.values(m.commands || {})) {
      const table = c.variants ? m[c.variants] || {} : { x: c };
      for (const e of Object.values(table)) for (const n of [].concat(e.needs || [])) out.add(String(n).toLowerCase());
    }
    return out;
  }
  const wares = g => { const mat = materials(g); return (charInventory(g).items || []).filter(i => (i.qty ?? 1) > 0 && (!mat.has(i.name.toLowerCase()) || priceOf(g, i.name))); };
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
    const st = (g._shop ||= {}), heard = window.tablefolkMind?.mindOf(g).heard || '', who = playerName();
    if (!heard || st.done === heard) return '';
    const item = itemIn(g, heard) || (BUYING.test(heard) || YES.test(heard) || amountIn(heard) != null ? st.item : null);
    if (item) st.item = item;
    if (!item) return BUYING.test(heard) ? 'They may want to buy: tell them what you sell and the price.' : '';
    const p = priceOf(g, item); let amt = amountIn(heard);
    // "yes" to the price it named itself
    if (amt == null && YES.test(heard) && st.quoted?.item === item) amt = st.quoted.price;
    if (amt == null) return p ? `They are asking about the ${item}: it is ${p.ask} gold.` : `They are asking about the ${item}.`;
    if (!p) return `!${who} offers ${amt} gold for the ${item}. If that is fair, answer with say(...) and sell it on the next line: sell(${item}, ${amt}).`;
    if (amt >= p.low) return `!${who} offers ${amt} gold for the ${item}: that is enough. Answer with say(...) and sell it on the next line: sell(${item}, ${amt}).`;
    return `!${who} offers ${amt} gold for the ${item}: too little (you never go under ${p.low}). Refuse, or ask for more.`;
  }
  // Remember the price a seller named, so a plain "yes" can be read as accepting it.
  window.addEventListener('tablefolk-say', e => {
    const g = state.characters.find(c => c.id === e.detail?.agentId); if (!g || e.detail.voiced === false) return;
    const item = itemIn(g, e.detail.text), amt = amountIn(e.detail.text);
    if (item && amt != null) (g._shop ||= {}).quoted = { item, price: amt };
  });
  // A sale closes the offer it answered.
  window.addEventListener('tablefolk-inventory', () => {
    for (const g of state.characters) if (g._shop) g._shop.done = window.tablefolkMind?.mindOf(g).heard || g._shop.done;
  });

  // ---- the buyer agrees ----
  // Any seller: sell() goes through only when the player's latest words to
  // it offer at least that price, accept the price it named, or ask to buy at
  // its asking price; else it is an offer the player can take (the card
  // below). Without this a model "sold" the sword for 40 to a player who had
  // offered 5, and took their gold.
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

  // State-card lines a skill can name in its "card" list.
  if (window.tablefolkSkills) Object.assign(window.tablefolkSkills.cards, { wares: g => waresLine(g), offer: g => offerLine(g) });

  window.tablefolkTrade = { priceOf, floor, waresLine, offerLine, itemIn, amountIn, consent, offer };
})();
