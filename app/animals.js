/* animals.js -- doing things with animals: milk the cow, shear the sheep,
 * feed, pet, and a dog that comes along.
 *
 *   E near an animal (or clicking it, then E) opens its menu of actions;
 *   typed: /milk cow, /milk(daisy), /pet dog, /feed horse, /shear sheep,
 *   /follow dog (a dog, or any animal you have fed, walks with you),
 *   /stay dog (it stops following).
 *   window.tablefolkAnimals.menu(g)          the menu for animal g
 *   window.tablefolkAnimals.playerCommand(t) true when t was an animal command
 *   window.tablefolkAnimals.following(g)     the one g walks after, or null (live.js)
 *
 * What each kind allows is ACTIONS below: an item it gives (milk, wool), how
 * long before it can again (in seconds), what it takes (feeding takes a
 * food you carry: apple, carrot, bread, hay, grain, oats, cabbage...), and
 * how it reacts: a sound from its voice bank (reactions.js), a clip and a
 * line in the log. Fed animals follow you for a while; skittish ones (deer,
 * stag, fox) shy away unless you bring food. An animal with "talks": true
 * has a mind: it is also told what you did ("[event] ... milks you"), so the
 * model answers in its own way. Loaded after play.js and uses app.js's
 * globals (state, getBrainConfig, setBrainConfig, playRig, emitBadge, log).
 */
(function () {
  const FOOD = /apple|carrot|bread|hay|grain|oats|cabbage|turnip|corn|wheat|berr|lettuce|meat|bone|cheese/i;
  const MEAT = /meat|bone|sausage|ham/i;
  // per kind: the actions, in menu order
  const ACTIONS = {
    cow:   { milk: { gives: 'milk', every: 90, line: '{a} stands still while you milk her. You fill a jug with warm milk.', after: 'contented' } },
    sheep: { shear: { gives: 'wool', every: 240, line: 'You shear a fleece from {a}. It bleats, a little lighter.' } },
    alpaca:{ shear: { gives: 'wool', every: 240, line: 'You shear soft wool from {a}. It hums at you, unimpressed.' } },
    pig:   { scratch: { line: 'You scratch {a} behind the ears. It grunts happily and leans into your hand.' } },
    horse: { groom: { line: 'You brush {a}\'s coat. It snorts and nuzzles your shoulder.' } },
    white_horse: { groom: { line: 'You brush {a}\'s white coat until it shines. It nickers softly.' } },
    donkey:{ groom: { line: 'You brush {a}. It flicks its long ears and brays.' } },
    dog:   { fetch: { line: 'You throw a stick. {a} bounds after it and brings it back, tail wagging.' } },
    husky: { fetch: { line: 'You throw a stick. {a} races off, howls with joy and brings it back.' } },
    bull:  {},
    deer: {}, stag: {}, fox: {},
  };
  const SKITTISH = new Set(['deer', 'stag', 'fox']);
  const NAMES = { milk: 'Milk', shear: 'Shear', scratch: 'Scratch its ears', groom: 'Groom', fetch: 'Throw a stick' };
  const last = new Map();     // `${id}:${act}` -> time
  const follow = new Map();   // animal id -> until (ms)

  const me = () => state.playerAvatar;
  const kindOf = g => g?.charModel;
  const isBeast = g => !!g && Object.prototype.hasOwnProperty.call(ACTIONS, kindOf(g));
  const nice = g => { const n = g.id; return /^[a-z]/.test(n) && n === kindOf(g) ? 'the ' + n.replace(/_/g, ' ') : n.charAt(0).toUpperCase() + n.slice(1); };
  const toast = (t, type = 'info') => window.tablefolkToast?.(t, { type });
  const pos = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).z - pos(b).z);
  const playerName = () => state.player?.name || 'the player';
  function food() { return (state.player?.items || []).find(i => (i.qty ?? 1) > 0 && FOOD.test(i.name)); }
  function take(it) { it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) state.player.items.splice(state.player.items.indexOf(it), 1); }
  function give(name) { const have = state.player.items.find(i => i.name.toLowerCase() === name); if (have) have.qty = (have.qty ?? 1) + 1; else state.player.items.push({ name, qty: 1 }); }
  function changed() { try { inventoryChanged(); } catch {} }

  // the animal turns to you, makes its sound, plays a clip; a mind is told
  function react(g, kind, line, event) {
    try { window.tablefolk?.faceToward?.(g, me(), 5000); } catch {}
    try { window.tablefolkReact?.voice(g, 'call'); } catch {}
    try { playRig(g, kind === 'eat' ? 'pickup' : 'cheer', false); setTimeout(() => { if (!g.defeated && g.anim !== 'walk') playRig(g, 'idle', true); }, 1600); } catch {}
    log(line); state.globalHistory = (state.globalHistory || []).concat([`T${state.turn?.index ?? 0} player: ${line}`]).slice(-20);
    // (log() already shows it as a toast)
    if (getBrainConfig(g.id)?.talks === true && event) {
      const c = getBrainConfig(g.id);
      setBrainConfig(g.id, { pendingChat: (c.pendingChat || []).concat([`[event] ${event}`]).slice(-5) });
      try { window.dispatchEvent(new CustomEvent('tablefolk-attacked', { detail: { agentId: g.id } })); } catch {}   // wakes it to answer (same path as an event)
    }
  }

  function act(g, what) {
    const pl = me(); if (!pl || !g || g.defeated) return false;
    if (dist(pl, g) > 2.6) { toast(`Walk up to ${nice(g)} first`, 'error'); return true; }
    const k = kindOf(g), A = ACTIONS[k] || {}, who = nice(g), P = playerName();
    if (what === 'pet') {
      if (SKITTISH.has(k) && !follow.has(g.id)) { react(g, 'shy', `${who} shies away from your hand and steps back, watching you.`, `${P} reaches out to touch you`); try { window.tablefolkLive?.flee?.(g, pl); } catch {} return true; }
      react(g, 'pet', `You pet ${who}. ${k === 'bull' ? 'It snorts, but lets you.' : /dog|husky/.test(k) ? 'Its tail thumps happily.' : 'It leans into your hand.'}`, `${P} pets you gently`);
      emitBadge(g, '♥'); return true;
    }
    if (what === 'feed') {
      const f = food();
      if (!f) { toast(`You have nothing ${who} would eat (an apple, a carrot, bread, hay...)`, 'error'); return true; }
      if (/dog|husky|fox/.test(k) ? !MEAT.test(f.name) && !/bread|cheese/.test(f.name) : MEAT.test(f.name)) { toast(`${who} sniffs the ${f.name} and turns away`); return true; }
      take(f); changed();
      follow.set(g.id, performance.now() + 120000);
      react(g, 'eat', `You feed ${who} the ${f.name}. It eats from your hand and will follow you for a while.`, `${P} feeds you a ${f.name} from their hand`);
      emitBadge(g, '♥'); return true;
    }
    if (what === 'follow' || what === 'stay') {
      if (what === 'stay') { follow.delete(g.id); react(g, 'stay', `${who} stops and stays where it is.`, `${P} tells you to stay`); return true; }
      if (!/dog|husky/.test(k) && !follow.has(g.id)) { toast(`${who} won't follow you. Feed it something first.`); return true; }
      follow.set(g.id, performance.now() + (/dog|husky/.test(k) ? 600000 : 120000));
      react(g, 'follow', `${who} trots after you.`, `${P} calls you to come along`); return true;
    }
    const a = A[what];
    if (!a) { toast(`You can't ${what} ${who}`, 'error'); return true; }
    const key = g.id + ':' + what, t = performance.now();
    if (a.every && t - (last.get(key) || -1e9) < a.every * 1000) {
      const left = Math.ceil((a.every * 1000 - (t - last.get(key))) / 1000);
      toast(what === 'milk' ? `${who} has no more milk yet (about ${left} s)` : what === 'shear' ? `${who}'s wool hasn't grown back yet` : `${who} has had enough for now`); return true;
    }
    last.set(key, t);
    if (a.gives) { give(a.gives); changed(); emitBadge(g, '+' + a.gives); }
    react(g, what, a.line.replace('{a}', who), `${P} ${what === 'milk' ? 'milks you' : what === 'shear' ? 'shears your wool' : what === 'groom' ? 'brushes your coat' : what === 'scratch' ? 'scratches you behind the ears' : 'throws a stick for you'}`);
    return true;
  }

  function menu(g) {
    const k = kindOf(g), A = ACTIONS[k] || {}, f = food();
    const items = Object.keys(A).map(id => ({ id, label: NAMES[id] || id, do: `/${id} ${g.id}` }));
    items.push({ id: 'pet', label: 'Pet', do: `/pet ${g.id}` });
    items.push({ id: 'feed', label: f ? `Feed (${f.name})` : 'Feed (you have no food)', do: `/feed ${g.id}` });
    if (follow.has(g.id)) items.push({ id: 'stay', label: 'Tell it to stay', do: `/stay ${g.id}` });
    else if (/dog|husky/.test(k)) items.push({ id: 'follow', label: 'Come along!', do: `/follow ${g.id}` });
    if (getBrainConfig(g.id)?.talks === true) items.push({ id: 'talk', label: 'Talk', menu: null, say: null, talk: true });
    items.push({ id: 'bye', label: 'Leave' });
    if (!window.tablefolkMenu) return false;
    window.tablefolkMenu.open({ id: 'animal-' + g.id, title: nice(g), text: k === 'bull' ? 'It eyes you, nostrils flaring.' : SKITTISH.has(k) ? 'It watches you warily.' : 'It looks at you calmly.', items: items.filter(i => !i.talk), other: getBrainConfig(g.id)?.talks === true }, { agentId: g.id });
    return true;
  }

  // "/milk cow", "/milk(daisy)", "/pet the dog"
  const VERBS = /^\/(milk|shear|pet|stroke|feed|groom|brush|scratch|fetch|follow|stay)\b\s*\(?\s*(?:the\s+)?([^)]*?)\s*\)?\s*$/i;
  function playerCommand(text) {
    const m = String(text).trim().match(VERBS); if (!m) return false;
    const verb = { stroke: 'pet', brush: 'groom' }[m[1].toLowerCase()] || m[1].toLowerCase(), name = m[2].toLowerCase().replace(/\s+/g, '_');
    const pl = me(); if (!pl) return false;
    const near = state.characters.filter(c => isBeast(c) && !c.defeated).sort((a, b) => dist(pl, a) - dist(pl, b));
    const g = name ? near.find(c => c.id.toLowerCase() === name || kindOf(c) === name || c.id.toLowerCase().startsWith(name)) : (state.selected && isBeast(state.selected) ? state.selected : near[0]);
    if (!g) { toast(name ? `There is no ${m[2]} here` : 'There is no animal here', 'error'); return true; }
    return act(g, verb);
  }

  window.addEventListener('tablefolk-scenario-started', e => { if (!e.detail?.sub) { last.clear(); follow.clear(); } });
  window.tablefolkAnimals = {
    menu, act, playerCommand, isBeast, ACTIONS,
    following(g) { const u = follow.get(g?.id); if (!u) return null; if (performance.now() > u) { follow.delete(g.id); return null; } return me(); },
    reset() { last.clear(); follow.clear(); },
  };
})();
