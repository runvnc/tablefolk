/* uses.js -- characters use the things that have an obvious use.
 *
 *   use(thing)          by what it is:
 *     chest, iron_chest      opens it and says what is inside (again: says it again;
 *                            close(chest) shuts it, the player's E too)
 *     bed, double_bed        lies down on it and rests (tiredness to zero)
 *     bench, stool, chairs   sits on it (tiredness down a little)
 *     anvil                  hammers;  workbench: saws;  cauldron: stirs
 *     tree, logs (and the pines, oaks, other trees, a log)  chops (takes firewood);
 *                            boulder, mossy_rock: breaks stone;  crystals: breaks off a crystal
 *     well                   draws water and drinks;  lectern, bookcase, open_book: reads
 *     target, dummy          practises;  apple/carrot barrels and crates: takes one
 *   take(item, chest)   from a chest ("gold", "5 gold", "all", an item's name)
 *   put(item, chest)    into a chest, from what it carries (both open it if closed)
 *
 * A character walks over first when the thing is a few steps away (like
 * carry). Sitting and lying last (g.pose): talk keeps the pose, the next
 * other action stands it up (standUp, called by executeGameCommandImmediate);
 * playRig plays the pose clip in place of idle and talk, bodyYaw keeps the
 * pose's facing, and the model is lifted onto the seat or mattress (measured
 * from its bones once the clip plays, so KayKit and Meshy rigs both fit).
 *
 * Small models name things by their map labels ("use(h1 chest)"), reach for
 * emote(sit) / emote(sleep), and walk to a bed when told to go to bed: all
 * understood (find, emoteUse, walkOnto: walking onto a bed or seat gets on it).
 *
 * Stock (2026-11-20): trees, boulders, crystals, food barrels, fields
 * (tall_grass: wheat, pumpkin) and snares (bear_trap: meat) hold a count of
 * their item (CORE_STOCK; a pack or package item's "stock": {item, count,
 * regrow, spent} and "gather": {gives, time, anim, verb} work the same; a
 * scenario object's "stock": n and "crop" override). Each use takes one; at
 * 0 the thing fades and cannot be used until it grows back on the clock
 * ("regrow" game hours a unit, twice as fast for a field someone tended).
 * Barrels and crates are stockpiles: put/take work on them as on a chest;
 * put() on a food barrel refills it. make(): jobs.js sets g._make before
 * use(station): the materials go, the goods come (+n item).
 * register(kind, def): a kind characters can use through use(thing) and
 * jobs (packages, modules); a pack item's "station" names a kind, and its
 * "use" data (packages.js useThing) runs for characters too.
 *
 * Routines (live.js idle turns, routine()): asleep in a bed nearby at night,
 * up in the morning; by day at the station that fits the role (smith: anvil,
 * cook: cauldron, scholar: lectern...) or on a bench for a while.
 *
 * Chests hold opts.contents {gold, items} (filled from the scenario's
 * opts.gold/items, or the seeded loot, the first time it is looked into);
 * the player's E on a chest (play.js) takes all of it; opts.opened marks one
 * that is open. Saved with the world, as the object's opts are.
 *
 * The clips are the KayKit ones (Meshy people carry them too:
 * tools/retarget-people.sh). Figures without them play their idle.
 *
 *   window.tablefolkUses = { use, put, take, shut, emoteUse, walkOnto, routine, standUp, kindOf, menu, exampleLine, contents, close, setOpen, nearby, describe, register, stockOf, ... }
 */
(function () {
  const KIND = {
    chest: 'chest', iron_chest: 'chest', bed: 'bed', double_bed: 'bed',
    bench: 'seat', stool: 'seat', wooden_chair: 'seat', armchair: 'seat', sofa: 'seat', office_chair: 'seat', throne: 'seat',
    anvil: 'anvil', workbench: 'workbench', cauldron: 'cauldron', well: 'well', tree: 'chop', logs: 'chop', boulder: 'mine',
    lectern: 'read', bookcase: 'read', bookshelf: 'read', target: 'train', dummy: 'train',
    apple_barrel: 'food', apple_crate: 'food', carrot_crate: 'food',
    // the Quaternius nature and camp things (2026-11-13)
    pine_tree: 'chop', tall_pine: 'chop', oak_tree: 'chop', tall_tree: 'chop', autumn_tree: 'chop', dead_tree: 'chop', log: 'chop',
    mossy_rock: 'mine', crystals: 'mine', open_book: 'read',
    // stockpiles (2026-11-20): put/take work on them like a chest; fields, snares
    barrel: 'store', crate: 'store', iron_crate: 'store', tall_grass: 'field', pumpkin: 'field', bear_trap: 'hunt', lily_pad: 'fish',
  };
  // Stock: what a thing holds and gives until it is spent, and how it comes
  // back: { item, count, regrow (game hours a unit; 0 never), spent }. The
  // same shape as a pack or package item's "stock" (packs.js), which wins;
  // a scenario object's "stock": n (opts.stock) sets the count, "crop" the item.
  const TREE = { item: 'firewood', count: 3, regrow: 8 };
  const CORE_STOCK = {
    tree: TREE, pine_tree: TREE, tall_pine: TREE, oak_tree: TREE, tall_tree: TREE, autumn_tree: TREE, dead_tree: { item: 'firewood', count: 2, regrow: 0 },
    logs: { item: 'firewood', count: 4, regrow: 0 }, log: { item: 'firewood', count: 2, regrow: 0 },
    boulder: { item: 'stone', count: 4, regrow: 12 }, mossy_rock: { item: 'stone', count: 3, regrow: 12 }, crystals: { item: 'crystal', count: 3, regrow: 24 },
    apple_barrel: { item: 'apple', count: 6, regrow: 0 }, apple_crate: { item: 'apple', count: 6, regrow: 0 }, carrot_crate: { item: 'carrot', count: 6, regrow: 0 },
    tall_grass: { item: 'wheat', count: 3, regrow: 3 }, pumpkin: { item: 'pumpkin', count: 2, regrow: 6 },
    bear_trap: { item: 'meat', count: 1, regrow: 4 }, lily_pad: { item: 'fish', count: 3, regrow: 3 },
  };
  // How gathering looks per kind (a pack item's "gather": { gives, time, anim, verb } wins)
  const GATHER = { field: { anim: 'pickup', time: 3, verb: 'harvests {a} from the {t}' }, hunt: { anim: 'pickup', time: 3, verb: 'checks the snare and finds {a}' }, fish: { anim: 'pickup', time: 5, verb: 'fishes by the {t} and catches {a}' }, gather: { anim: 'pickup', time: 3, verb: 'takes {a} from the {t}' } };
  // registered kinds (register(kind, def)) and the types that have them
  const REGISTERED = {}, REG_TYPES = {};
  const packItem = t => window.tablefolkPacks?.items?.[t] || null;
  // work at a thing: the clip (a playRig mode), how long, what is said, what it yields
  const WORK = {
    anvil: { mode: 'hammer', ms: 4500, did: 'hammers at the anvil' },
    workbench: { mode: 'saw', ms: 4000, did: 'works at the workbench' },
    cauldron: { mode: 'stir', ms: 4000, did: 'stirs the cauldron' },
    chop: { mode: 'chop', ms: 4500, did: 'chops wood from the {t}', gives: 'firewood' },
    mine: { mode: 'mine', ms: 4500, did: 'breaks a stone off the {t}', gives: 'stone' },
    well: { mode: 'drink', ms: 2600, did: 'draws water from the well and drinks', heal: 1 },
    read: { mode: 'read', ms: 4000, did: 'reads from the {t}' },
    train: { mode: 'train', ms: 3000, did: 'practises on the {t}' },
    food: { mode: 'pickup', ms: 1500, did: 'takes {a} from the {t}' },
  };
  const FOOD_OF = { apple_barrel: 'apple', apple_crate: 'apple', carrot_crate: 'carrot' };
  // seat or mattress height as a share of the thing's height (chairs have a back, beds a headboard)
  const SURFACE = { wooden_chair: .5, office_chair: .5, armchair: .5, sofa: .5, throne: .42, bench: .9, stool: .95, bed: .62, double_bed: .62 };
  const REACH = 1.9;

  const nice = t => String(t || 'thing').replace(/_/g, ' ');
  // what a thing is used as: built in, registered, or a pack item's own
  // "station" (a kind), "stock"/"gather" (gathered from), or "use" (its E
  // action, which characters can run too)
  function kindOf(t) {
    if (KIND[t]) return KIND[t];
    if (REG_TYPES[t]) return REG_TYPES[t];
    const it = packItem(t); if (!it) return null;
    if (it.station && (WORK[it.station] || REGISTERED[it.station] || KIND_NAMES.has(it.station))) return it.station;
    if (it.stock || it.gather) return 'gather';
    if (it.use) return 'pack';
    return null;
  }
  const KIND_NAMES = new Set(Object.values(KIND));
  const an = item => (/^[aeiou]/i.test(item) ? 'an ' : 'a ') + item;
  // the stock a thing has: { item, count, regrow, spent, left, max } or null
  function stockOf(o) {
    const m = meshOf(o), mm = meta(m); if (!mm) return null;
    const t = o.type || mm.type, it = packItem(t), k = kindOf(t);
    const base = it?.stock || (REG_TYPES[t] && REGISTERED[REG_TYPES[t]]?.stock) || CORE_STOCK[t] || null;
    if (!base) return null;
    mm.opts ||= {};
    const item = mm.opts.crop ? String(mm.opts.crop) : String(base.item || it?.gather?.gives || 'thing');
    if (!Number.isFinite(+mm.opts.stock) && Number.isFinite(+mm.opts.left)) mm.opts.stock = +mm.opts.left;   // a crystal cluster from before stock
    if (!Number.isFinite(+mm.opts.stock)) mm.opts.stock = Math.max(0, Math.round(+base.count || 1));
    else mm.opts.stock = Math.max(0, Math.round(+mm.opts.stock));
    if (!Number.isFinite(mm.opts.stockMax)) mm.opts.stockMax = Math.max(mm.opts.stock, Math.round(+base.count || 1));
    return { item, count: +base.count || 1, regrow: Math.max(0, +base.regrow || 0), spent: base.spent || null, left: mm.opts.stock, max: mm.opts.stockMax, mm, kind: k };
  }
  function gatherOf(o, k) { const it = packItem(o.type); return { ...(GATHER[k] || GATHER.gather), ...(REGISTERED[k] || {}), ...(it?.gather || {}) }; }
  // a spent thing looks it (a crystal cluster shrinks, others fade); back when it has stock again
  function looksSpent(o, st) {
    try {
      const m = meshOf(o);
      if (o.type === 'crystals') { const s = .35 + .65 * (st.left / Math.max(1, st.max)); m.scaling.setAll(s); }
      const v = st.left > 0 ? 1 : .4;
      for (const c of [m, ...(m.getChildMeshes?.(false) || [])]) if (c.visibility !== undefined && c.getTotalVertices?.() > 0) c.visibility = v;
    } catch {}
  }
  const posOf = g => g.logicalPos || g.root.position;
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const toastIfPlayer = (g, text) => { if (g === state.playerAvatar) window.tablefolkToast?.(text); };

  // the nearest usable thing called `name` within sight
  function find(g, name) {
    const o = find0(g, name); if (!o) return o;
    // a spent tree or barrel: another of the same kind close by that still has some
    const st = stockOf(o);
    if (st && st.left <= 0) { const p = posOf(g); let best = null; for (const t of getObjects()) if (t.type === o.type && t.mesh !== o.mesh) { const s2 = stockOf(t); const d = Math.hypot(t.x - p.x, t.z - p.z); if (s2 && s2.left > 0 && d <= 10 && (!best || d < best.d)) best = { ...t, d }; } if (best) return best; }
    return o;
  }
  function find0(g, name) {
    name = String(name || '').trim().replace(/^["']|["']$/g, '');
    const o = namedThing(g, name, 10);
    if (o && kindOf(o.type)) return o;
    // a label from its map ("H1", "h1 chest"): the thing it marks
    for (const w of name.split(/\s+/)) {
      const m = state.perceptionLabels?.get(w.toLowerCase()) || state.perceptionLabels?.get(w);
      if (m && !m.isDisposed?.() && !m.root) { const t = getObjects().find(x => x.mesh === m); if (t && kindOf(t.type)) { const p = posOf(g); return { ...t, d: Math.hypot(t.x - p.x, t.z - p.z) }; } }
    }
    for (const w of name.split(/\s+/).reverse()) { if (w === name) break; const t = namedThing(g, w, 10); if (t && kindOf(t.type)) return t; }
    // "use(seat)", "use(chair)": the nearest thing of that kind
    const want = String(name || '').toLowerCase().replace(/^(the|a|an)\s+/, '').trim();
    const k = { chair: 'seat', seat: 'seat', bed: 'bed', chest: 'chest', box: 'chest', tree: 'chop', wood: 'chop', water: 'well', book: 'read', books: 'read', field: 'field', wheat: 'field', snare: 'hunt', trap: 'hunt', barrel: 'store', crate: 'store' }[want];
    if (!k) return o;
    const p = posOf(g); let best = null;
    for (const t of getObjects()) if (kindOf(t.type) === k) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d <= 10 && (!best || d < best.d)) best = { ...t, d }; }
    return best;
  }
  // walk over first when it is a few steps off, then act on arrival: to a
  // free cell beside it (front first for seats and beds), never into it (a
  // light chair or chest is a dynamic body the walker's collider would shove)
  function besideCell(g, o) {
    const p = posOf(g), ox = Math.round(o.x), oz = Math.round(o.z), front = [Math.round(Math.sin(o.ry || 0)), Math.round(Math.cos(o.ry || 0))];
    const free = (x, z) => (typeof cellPassable !== 'function' || cellPassable(x, z)) && (typeof hasGroundAt !== 'function' || hasGroundAt(x, z)) &&
      !getObjects().some(t => t.mesh !== o.mesh && !['tile', 'light', 'note', 'coin_pile'].includes(t.type) && Math.round(t.x) === x && Math.round(t.z) === z);
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = ox + dx, z = oz + dz; if (!free(x, z)) continue;
      const score = Math.hypot(x - p.x, z - p.z) - (dx === front[0] && dz === front[1] ? 1.5 : 0) + (dx && dz ? .3 : 0);
      if (!best || score < best.score) best = { x, z, score };
    }
    return best || { x: ox, z: oz };
  }
  function reach(g, o, then) {
    if (o.d <= REACH) return then();
    const c = besideCell(g, o);
    g._usesWalking = true; try { walk(g, { type: 'coord', x: c.x, z: c.z, label: 'the ' + nice(o.type) }); } finally { g._usesWalking = false; }
    const ms = (g.turnMove?.dur || 1) * 1000 + 150;
    setTimeout(() => {
      const q = posOf(g);
      if (o.mesh.isDisposed?.()) return;
      if (Math.hypot(o.x - q.x, o.z - q.z) <= REACH + .4) then();
      else fail(g, `${g.id} could not get to the ${nice(o.type)}`, false);
    }, ms);
  }
  // a jump, not a sweep: an ANIMATED collider sent somewhere with the usual
  // ACTION prestep travels there within one physics step, at a speed that
  // flings any light thing in between (a chair, a stool)
  function teleport(g, x, z) {
    setCharacterLogicalPosition(g, new BABYLON.Vector3(x, 0, z));
    const pb = g.collider?.physicsBody; if (!pb?.setPrestepType) return;
    try { pb.setPrestepType(BABYLON.PhysicsPrestepType.TELEPORT); } catch {}
    state.scene.onAfterRenderObservable.addOnce(() => { try { pb.setPrestepType(BABYLON.PhysicsPrestepType.ACTION); } catch {} });
  }
  function face(g, o) { const p = posOf(g); setCharacterFacing(g, new BABYLON.Vector3(o.x - p.x, 0, o.z - p.z)); }

  // narrate, then the clip: say() turns the speaker to its talk clip, so the
  // work clip starts after it (and back to idle, or the pose, when done)
  function act(g, text, mode, ms, loop = true) {
    const r = say(g, text, false);
    g.anim = mode; g.speaking = false; g.rigMode = null; playRig(g, mode, loop);
    if (g._useTimer) clearTimeout(g._useTimer);
    g._useTimer = setTimeout(() => { if (g.anim === mode) { g.anim = 'idle'; playRig(g, 'idle', true); } }, ms);
    return r;
  }

  // ------------------------------------------------------------------ use
  function use(g, name) {
    if (!g) return;
    const o = find(g, name);
    if (!o) return fail(g, `there is no ${name || 'thing'} in sight to use`, false);
    return useThing(g, o);
  }
  function useThing(g, o) {
    const k = kindOf(o.type);
    if (!k) return fail(g, `${g.id} cannot think of a use for the ${nice(o.type)}`, false);
    if (k === 'chest' || k === 'store') return reach(g, o, () => toggleChest(g, o));
    if ((k === 'bed' || k === 'seat') && occupied(o, g)) return fail(g, `someone is already on the ${nice(o.type)}`, false);
    if (k === 'bed' || k === 'seat') return reach(g, o, () => settle(g, o, k === 'bed' ? 'lie' : 'sit'));
    return reach(g, o, () => work(g, o, k));
  }

  function work(g, o, k) {
    face(g, o);
    const m = meshOf(o), mm = meta(m) || {}; mm.opts ||= {};
    // a make order (jobs.js): this station turns what it carries into goods
    if (g._make && g !== state.playerAvatar) { const order = g._make; g._make = null; return make(g, o, k, order); }
    // a package item's own use ("use": {text, anim, give, state} or a module's), for characters too
    if (k === 'pack') return packUse(g, o);
    const st = stockOf(o), gd = gatherOf(o, k), reg = REGISTERED[k];
    const w = reg ? { mode: reg.anim || reg.mode || 'pickup', ms: (reg.time ? reg.time * 1000 : reg.ms) || 3000, did: reg.verb || reg.did || 'uses the {t}', gives: reg.gives, heal: reg.heal } : WORK[k] || { mode: gd.anim || 'pickup', ms: (gd.time || 3) * 1000, did: gd.verb || 'takes {a} from the {t}' };
    // a bare field: tending it (jobs.js tend) makes it grow back twice as fast
    if (k === 'field' && st && st.left <= 0) {
      if (mm.opts.tended) return fail(g, `the ${nice(o.type)} is already sown and tended; it needs time to grow`, false);
      mm.opts.tended = true; emitBadge(g, 'tends');
      toastIfPlayer(g, `You tend the ${nice(o.type)}`);
      return act(g, `${g.id} sows and tends the bare ${nice(o.type)} (it will grow back faster)`, 'pickup', 2500);
    }
    let item = st ? (gd.gives && !mm.opts.crop ? gd.gives : st.item) : FOOD_OF[o.type] || w.gives;
    if (st) {
      if (st.left <= 0) return fail(g, `${g.id} cannot: the ${nice(o.type)} is spent${st.regrow ? ' (it grows back in time)' : ' (it is empty until someone fills it)'}`, false);
      mm.opts.stock = st.left - 1; st.left--;
      looksSpent(o, st);
      try { saveWorldState(); } catch {}
    }
    const food = !!FOOD_OF[o.type];
    const text = o.type === 'crystals' ? 'breaks a crystal off the cluster' : (w.did || 'uses the {t}').replace('{t}', nice(o.type)).replace('{a}', item ? an(item) : 'something');
    if (item) {
      if (g === state.playerAvatar) { const have = state.player.items.find(i => i.name === item); if (have) have.qty = (have.qty ?? 1) + 1; else state.player.items.push({ name: item, qty: 1 }); inventoryChanged(); }
      else { const inv = charInventory(g); addItem(inv.items, item); setBrainConfig(g.id, { inventory: inv }); }
    }
    if (w.heal) window.tablefolkCombat?.heal?.(g, w.heal);
    emitBadge(g, w.mode === 'pickup' ? '+' + (item || 'thing') : w.mode);
    toastIfPlayer(g, 'You ' + text.replace(/^(\w+?)s\b/, '$1').replace(/ and drinks$/, ' and drink'));
    const left = st ? (st.left > 0 ? '' : `; the ${nice(o.type)} is now spent`) : '';
    return act(g, `${g.id} ${text}${item && !food ? ' (+1 ' + item + ')' : ''}${left}`, w.mode, w.ms);
  }
  // make(item) at a station (jobs.js puts the order on g._make): what it
  // needs comes out of the inventory, what it makes goes in
  function make(g, o, k, order) {
    const inv = charInventory(g), need = order.needs || {};
    for (const [n, q] of Object.entries(need)) { const it = findItem(inv.items.filter(i => (i.qty ?? 1) > 0), n); if (!it || (it.qty ?? 1) < q) return fail(g, `make failed: ${g.id} needs ${q} ${n} to make ${order.item} (has ${it ? it.qty ?? 1 : 0})`, false); }
    for (const [n, q] of Object.entries(need)) { const it = findItem(inv.items, n); it.qty = (it.qty ?? 1) - q; if (it.qty <= 0) inv.items.splice(inv.items.indexOf(it), 1); }
    const n = Math.max(1, +order.gives || 1);
    for (let i = 0; i < n; i++) addItem(inv.items, order.item);
    setBrainConfig(g.id, { inventory: inv });
    const w = REGISTERED[k] || WORK[k] || { mode: 'pickup', ms: 3000 };
    emitBadge(g, '+' + n + ' ' + order.item);
    return act(g, `${g.id} ${order.verb || 'makes'} ${n > 1 ? n + ' ' + order.item : an(order.item)} at the ${nice(o.type)} (+${n} ${order.item})`, w.mode || w.anim || 'pickup', Math.max(1500, (+order.time || w.ms / 1000 || 3) * 1000));
  }
  // a package item's "use" run by a character (packages.js useThing with who = g)
  function packUse(g, o) {
    const P = window.tablefolkPackages; if (!P?.useThing) return fail(g, `${g.id} cannot think of a use for the ${nice(o.type)}`, false);
    Promise.resolve(P.useThing(meshOf(o), g)).then(r => {
      if (!r) return fail(g, `nothing happens when ${g.id} uses the ${nice(o.type)}`, false);
      emitBadge(g, nice(o.type));
      say(g, typeof r === 'string' ? r : `${g.id} uses the ${nice(o.type)}`, false);
    }).catch(e => console.warn('[uses] pack use', e));
    return true;
  }
  // stock grows back on the clock (clock.js 'tablefolk-clock', every game
  // quarter hour): a unit every "regrow" game hours, twice as fast tended
  addEventListener('tablefolk-clock', () => {
    for (const o of getObjects()) {
      const st = stockOf(o); if (!st || !st.regrow || st.left >= st.max) continue;
      const mm = st.mm; mm.opts.grow = (mm.opts.grow || 0) + .25 * (mm.opts.tended ? 2 : 1);
      let grew = false;
      while (mm.opts.grow >= st.regrow && mm.opts.stock < st.max) { mm.opts.grow -= st.regrow; mm.opts.stock++; grew = true; }
      if (mm.opts.stock >= st.max) { mm.opts.grow = 0; mm.opts.tended = false; }
      if (grew) looksSpent(o, { ...st, left: mm.opts.stock });
    }
  });
  // register(kind, def): a kind characters (and jobs) can use, from a
  // package or a module: { types: ['loom'], anim: 'saw', time: 4, verb:
  // 'weaves at the {t}', gives: 'cloth', stock: {...}, what: 'weave' }
  function register(kind, def = {}) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(String(kind))) throw new Error(`uses.register: bad kind "${kind}"`);
    REGISTERED[kind] = { ...def }; KIND_NAMES.add(kind);
    for (const t of [].concat(def.types || [])) REG_TYPES[String(t)] = kind;
    return REGISTERED[kind];
  }
  // packages' registrations go when another scenario starts (packages.js reset)
  function resetRegistered() { for (const k of Object.keys(REGISTERED)) { if (REGISTERED[k]._core) continue; delete REGISTERED[k]; } for (const t of Object.keys(REG_TYPES)) if (!REGISTERED[REG_TYPES[t]]) delete REG_TYPES[t]; }

  // close(chest): shut an open chest
  function shut(g, name) {
    const o = find(g, name || 'chest');
    if (!o || kindOf(o.type) !== 'chest') return fail(g, `there is no ${name || 'chest'} in sight to close`, false);
    return reach(g, o, () => { const m = meshOf(o); face(g, o); if (!isOpen(m)) return fail(g, `the ${nice(o.type)} is already closed`, false); setOpen(m, false); emitBadge(g, 'closes'); return act(g, `${g.id} closes the ${nice(o.type)}`, 'open', 1300, false); });
  }
  // walk(bed), walk("-2,-2") onto a bed's or seat's cell: that is getting
  // on it (small models told to go to bed walk to it and stop beside it)
  function walkOnto(g, dest) {
    if (!dest || typeof dest !== 'object' || g.pose || g._usesWalking) return false;
    let o = null;
    if (dest.type === 'coord') o = getObjects().find(t => ['bed', 'seat'].includes(kindOf(t.type)) && Math.round(t.x) === Math.round(+dest.x) && Math.round(t.z) === Math.round(+dest.z));
    else if (dest.type === 'label') { const t = find(g, dest.label); if (t && ['bed', 'seat'].includes(kindOf(t.type)) && String(dest.label).toLowerCase().replace(/_/g, ' ').includes(nice(t.type).split(' ').pop())) o = t; }
    if (!o) return false;
    const p = posOf(g); useThing(g, { ...o, d: Math.hypot(o.x - p.x, o.z - p.z) }); return true;
  }
  // emote(sit) / emote(sleep) with a seat or bed a few steps away: use it
  // (small models reach for the emote they know, not use())
  function emoteUse(g, name) {
    if (!g || g === state.playerAvatar || g.pose) return false;
    const want = name === 'sleep' ? ['bed'] : name === 'sit' ? ['seat', 'bed'] : null; if (!want) return false;
    const o = nearby(g, 3.5).find(t => want.includes(t.k)); if (!o) return false;
    use(g, o.type); return true;
  }

  // ---------------------------------------------------------------- chests
  function meshOf(o) { return o.mesh || o; }
  const mm0 = m => { const x = meta(m); x.opts ||= {}; return x; };
  function contents(m) {
    const mm = meta(m); mm.opts ||= {};
    if (!mm.opts.contents) {
      const o = mm.opts, items = (Array.isArray(o.items) ? o.items : []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : { name: String(i.name), qty: i.qty ?? 1 });
      let gold = Math.max(0, +o.gold || 0), list = items;
      if (o.gold == null && !items.length && /chest/.test(mm.type || '')) {   // a little something, seeded by where the chest stands
        const p = m.getAbsolutePosition?.() || m.position, r = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1;
        gold = 8 + Math.floor(r * 30); list = r > .55 ? [{ name: 'healing potion', qty: 1 }] : [];
      }
      // a chest opened before contents were kept: the player took everything then
      mm.opts.contents = mm.opts.opened ? { gold: 0, items: [] } : { gold, items: list };
    }
    return mm.opts.contents;
  }
  const describe = c => [c.gold ? c.gold + ' gold' : '', ...c.items.filter(i => (i.qty ?? 1) > 0).map(i => i.name + ((i.qty ?? 1) > 1 ? ' x' + i.qty : ''))].filter(Boolean).join(', ');
  const isOpen = m => meta(m)?.state === 'open';
  function lid(m, open) {
    const node = m.getDescendants?.(false).find(n => /Chest_Top|Lid/i.test(n.name) && !n.getTotalVertices);
    if (!node) return;
    node._lidRest ||= { q: node.rotationQuaternion?.clone() || null, r: node.rotation.clone() };
    const rest = node._lidRest, from = node._lidAngle || 0, to = open ? -1.15 : 0;
    let t = 0;
    const obs = state.scene.onBeforeRenderObservable.add(() => {
      t = Math.min(1, t + (state.scene.getEngine().getDeltaTime() || 16) / 450);
      const a = from + (to - from) * (1 - Math.pow(1 - t, 3)); node._lidAngle = a;
      if (rest.q) node.rotationQuaternion = rest.q.multiply(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, a));
      else node.rotation.x = rest.r.x + a;
      if (t >= 1 || node.isDisposed?.()) state.scene.onBeforeRenderObservable.remove(obs);
    });
  }
  function setOpen(m, open) {
    const mm = meta(m); mm.opts ||= {};
    mm.state = open ? 'open' : 'closed'; if (open) mm.opts.opened = true;
    lid(m, open);
    window.tablefolkSfx?.play(open ? 'chestOpen' : 'pickup', m.getAbsolutePosition?.() || m.position);
    try { saveWorldState(); } catch {}
  }
  function close(m) { if (isOpen(m)) setOpen(m, false); }
  function toggleChest(g, o) {
    const m = meshOf(o); face(g, o);
    if (kindOf(o.type) === 'store') { const w = describe(contents(m)); mm0(m).state = 'open'; return act(g, `${g.id} looks in the ${nice(o.type)}: ${w ? 'inside are ' + w : 'it is empty'} (take(item, ${o.type}) takes one, put(item, ${o.type}) stores one)`, 'open', 1300, false); }
    // already open: what is in it (small models repeat use(chest); closing
    // it again undid what they meant). close(chest) shuts it.
    if (isOpen(m)) { const w = describe(contents(m)); return act(g, `the ${nice(o.type)} is open: ${w ? 'inside are ' + w : 'it is empty'} (take(item, ${o.type}) takes one, put(item, ${o.type}) stores one)`, 'open', 1300, false); }
    if (meta(m).locked) return fail(g, `the ${nice(o.type)} is locked`, false);
    const c = contents(m), what = describe(c);   // before it counts as opened
    setOpen(m, true); emitBadge(g, 'opens');
    toastIfPlayer(g, what ? 'Inside: ' + what : 'It is empty');
    return act(g, `${g.id} opens the ${nice(o.type)}: ${what ? 'inside are ' + what : 'it is empty'} (take(item, ${o.type}) takes one, put(item, ${o.type}) stores one)`, 'open', 1300, false);
  }
  // take(item, chest) / put(item, chest): "item, chest" or "item from/in chest"
  function parse(arg, dflt) {
    const s = String(arg || '').trim().replace(/^["']|["']$/g, '');
    const m = s.match(/^(.*?)\s*(?:,|\bfrom\b|\binto\b|\bin\b|\bto\b)\s*(?:the\s+)?["']?([\w -]+?)["']?$/i);
    return m ? { item: m[1].trim().replace(/^["']|["']$/g, ''), where: m[2].trim() } : { item: s, where: dflt };
  }
  // a chest, or any stockpile: a barrel, a crate, a food barrel (2026-11-20)
  const HOLDS = new Set(['chest', 'store', 'food']);
  function chestFor(g, where) {
    let o = find(g, where || 'chest');
    if (o && !HOLDS.has(kindOf(o.type))) o = null;
    if (!o && !where) { const n = nearby(g, 6).find(t => HOLDS.has(t.k)); if (n) o = n; }
    if (!o) return { err: `there is no ${where || 'chest'} in sight` };
    return { o };
  }
  function take(g, arg) {
    const { item, where } = parse(arg, 'chest'), { o, err } = chestFor(g, where);
    if (err) return fail(g, 'take failed: ' + err, false);
    if (kindOf(o.type) === 'food') return reach(g, o, () => work(g, o, 'food'));
    return reach(g, o, () => {
      const m = meshOf(o); face(g, o);
      // a closed chest is opened on the way (one turn, not two)
      if (!isOpen(m)) { if (meta(m).locked) return fail(g, `take failed: the ${nice(o.type)} is locked`, false); contents(m); setOpen(m, true); }
      const c = contents(m), gm = item.match(/^(\d+)?\s*(?:gold|coins?|gold coins?)$/i), mine = g === state.playerAvatar ? state.player : charInventory(g);
      let got = '';
      if (/^(all|everything)$/i.test(item)) {
        const taken = c.items.splice(0).filter(i => (i.qty ?? 1) > 0), n = +c.gold || 0;
        for (const i of taken) for (let k = 0; k < (i.qty ?? 1); k++) addItem(mine.items, i.name);
        c.gold = 0; mine.gold = (+mine.gold || 0) + n; got = describe({ gold: n, items: taken });
      } else if (gm) {
        const n = Math.min(+c.gold || 0, +(gm[1] || c.gold || 0));
        if (n > 0) { c.gold -= n; mine.gold = (+mine.gold || 0) + n; got = n + ' gold'; }
      } else {
        const it = findItem(c.items.filter(i => (i.qty ?? 1) > 0), item);
        if (!it) return fail(g, `take failed: there is no ${item} in the ${nice(o.type)}` + (describe(c) ? ` (it holds ${describe(c)})` : ' (it is empty)'), false);
        it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) c.items.splice(c.items.indexOf(it), 1);
        addItem(mine.items, it.name); got = it.name;
      }
      if (!got) return fail(g, `take failed: the ${nice(o.type)} ${/gold/i.test(item) ? 'has no gold' : 'is empty'}`, false);
      if (g !== state.playerAvatar) setBrainConfig(g.id, { inventory: mine });
      window.tablefolkSfx?.play(/gold/.test(got) ? 'coins' : 'pickup', m.getAbsolutePosition?.() || m.position);
      emitBadge(g, '+' + got); inventoryChanged();
      // fetching: the player just asked it to bring this, so it hands it over
      // too (a small model takes it and stops: "fetch from the chest" 0/3)
      const heard = String(getBrainConfig(g.id).mind?.heard || '').toLowerCase(), key = String(got).toLowerCase().split(/\s+/).filter(w => w.length > 2 && !/^\d/.test(w));
      if (g !== state.playerAvatar && /\b(bring|fetch|get|give|hand|pass)\b/.test(heard) && key.some(w => heard.includes(w)))
        setTimeout(() => { try { if (!g.defeated && (charInventory(g).items || []).some(i => i.name === got)) give(g, got); } catch (e) { console.warn('[uses] fetch give', e); } }, 0);
      return act(g, `${g.id} takes ${got} from the ${nice(o.type)}`, 'pickup', 1300, false);
    });
  }
  function put(g, arg) {
    const { item, where } = parse(arg, 'chest'), { o, err } = chestFor(g, where);
    if (err) return fail(g, 'put failed: ' + err, false);
    // a food barrel takes back what it holds (restocked)
    if (kindOf(o.type) === 'food') return reach(g, o, () => {
      const st = stockOf(o), mine = g === state.playerAvatar ? state.player : charInventory(g), it = st && findItem((mine.items || []).filter(i => (i.qty ?? 1) > 0), item);
      if (!st || !it || it.name.toLowerCase() !== st.item.toLowerCase()) return fail(g, `put failed: the ${nice(o.type)} only holds ${st?.item || 'its own kind'}`, false);
      it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) mine.items.splice(mine.items.indexOf(it), 1);
      st.mm.opts.stock = st.left + 1; st.mm.opts.stockMax = Math.max(st.max, st.left + 1); looksSpent(o, { ...st, left: st.left + 1 });
      if (g !== state.playerAvatar) setBrainConfig(g.id, { inventory: mine });
      emitBadge(g, 'stores ' + it.name); inventoryChanged();
      return act(g, `${g.id} puts ${an(it.name)} in the ${nice(o.type)}`, 'pickup', 1300, false);
    });
    return reach(g, o, () => {
      const m = meshOf(o); face(g, o);
      // a closed chest is opened on the way (one turn, not two)
      if (!isOpen(m)) { if (meta(m).locked) return fail(g, `put failed: the ${nice(o.type)} is locked`, false); contents(m); setOpen(m, true); }
      const c = contents(m), mine = g === state.playerAvatar ? state.player : charInventory(g), gm = item.match(/^(\d+)?\s*(?:gold|coins?|gold coins?)$/i);
      let put = '';
      if (gm) {
        const have = +mine.gold || 0, n = Math.min(have, +(gm[1] || have));
        if (n <= 0) return fail(g, `put failed: ${g.id} has no gold`, false);
        mine.gold = have - n; c.gold = (+c.gold || 0) + n; put = n + ' gold';
      } else {
        const it = findItem((mine.items || []).filter(i => (i.qty ?? 1) > 0), item);
        if (!it) return fail(g, `put failed: ${g.id} has no ${item}`, false);
        if (state.player.wielding && g === state.playerAvatar && state.player.wielding.toLowerCase() === it.name.toLowerCase()) window.tablefolkCombat?.wield(g, 'none');
        if (g !== state.playerAvatar && getBrainConfig(g.id).wielding?.toLowerCase?.() === it.name.toLowerCase()) setBrainConfig(g.id, { wielding: null });
        it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) mine.items.splice(mine.items.indexOf(it), 1);
        addItem(c.items, it.name); put = it.name;
      }
      if (g !== state.playerAvatar) setBrainConfig(g.id, { inventory: mine });
      window.tablefolkSfx?.play('pickup', m.getAbsolutePosition?.() || m.position);
      emitBadge(g, 'stores ' + put); inventoryChanged();
      return act(g, `${g.id} puts ${put} in the ${nice(o.type)}`, 'open', 1300, false);
    });
  }

  // -------------------------------------------------------- sitting, lying
  function surfaceTop(o) {
    const m = meshOf(o); m.computeWorldMatrix?.(true);
    const b = m.getHierarchyBoundingVectors?.(true, x => x.isEnabled() && (x.getTotalVertices?.() || 0) > 0);
    const top = b ? b.max.y - (state.terrainTopY ?? 0) : .5;
    return top * (SURFACE[o.type] ?? .6);
  }
  // the bone the seat or mattress carries: thigh joints sitting, pelvis lying
  function bone(g, re) { return g.rigRoot?.getDescendants?.(false).find(n => re.test(n.name) && !n.getTotalVertices); }
  function settle(g, o, how) {
    standUp(g, true);
    // a light chair or stool is a dynamic body: held still while someone sits
    // on it (the character's collider would shove it away)
    const pb = o.mesh.physicsBody, held = pb?.getMotionType?.() === BABYLON.PhysicsMotionType.DYNAMIC ? pb : null;
    held?.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
    const p = { x: o.x, z: o.z }, yaw = (o.ry || 0) + Math.PI;   // things face +z; a seated character faces the way the thing does
    teleport(g, p.x, p.z);
    g.dir = new BABYLON.Vector3(Math.round(-Math.sin(yaw)), 0, Math.round(-Math.cos(yaw)));
    g.root.rotation.y = yaw;
    g._rigBaseY ??= g.rigRoot?.position.y ?? 0;
    g._rigBaseX ??= g.rigRoot?.position.x ?? 0; g._rigBaseZ ??= g.rigRoot?.position.z ?? 0;
    g.pose = { mode: how, yaw, on: o.mesh, type: o.type, top: surfaceTop(o), held };
    g.anim = 'idle'; g.rigMode = null; playRig(g, 'idle', true);   // the pose clip (playRig reads g.pose)
    // once the clip has posed the bones: lift onto the seat and centre the hips over it
    state.scene.onAfterRenderObservable.addOnce(() => state.scene.onAfterRenderObservable.addOnce(() => fit(g)));
    if (how === 'lie') emitBadge(g, 'rests'); else emitBadge(g, 'sits');
    const cfg = getBrainConfig(g.id), mind = cfg.mind;
    if (mind) { mind.tired = how === 'lie' ? 0 : Math.max(0, (mind.tired || 0) - .3); }
    toastIfPlayer(g, how === 'lie' ? 'You lie down on the ' + nice(o.type) : 'You sit on the ' + nice(o.type));
    return say(g, `${g.id} ${how === 'lie' ? 'lies down on the ' + nice(o.type) + ' to rest' : 'sits down on the ' + nice(o.type)}`, false);
  }
  function fit(g) {
    if (!g.pose || !g.rigRoot || g.root.isDisposed?.()) return;
    const k = g.root.scaling.y || 1, h = g.height || 1.3;
    const hips = bone(g, /^(Hips|hips|mixamorig:Hips)$/), legL = bone(g, /^(LeftUpLeg|upperleg\.l|UpperLeg\.L)$/), legR = bone(g, /^(RightUpLeg|upperleg\.r|UpperLeg\.R)$/);
    const at = n => n?.getAbsolutePosition?.();
    const base = state.terrainTopY ?? 0;
    let carrier = null;
    if (g.pose.mode === 'sit' && at(legL) && at(legR)) carrier = (at(legL).y + at(legR).y) / 2 - base - h * .05;
    else if (at(hips)) carrier = at(hips).y - base - h * .07;
    if (carrier == null) return;
    g.rigRoot.position.y = g._rigBaseY + (g.pose.top - carrier) / k;
    // the hips over the middle of the seat or bed (in the root's own frame)
    const hp = at(hips);
    if (hp) {
      const dx = hp.x - g.root.position.x, dz = hp.z - g.root.position.z, c = Math.cos(-g.root.rotation.y), s = Math.sin(-g.root.rotation.y);
      const lx = (dx * c + dz * s) / k, lz = (-dx * s + dz * c) / k;   // undo the root's turn
      g.rigRoot.position.x -= lx; g.rigRoot.position.z -= lz;
    }
  }
  // the next action that is not talk stands it up, beside the thing
  function standUp(g, quiet) {
    if (!g?.pose) return false;
    const pose = g.pose; g.pose = null;
    if (g.rigRoot) { g.rigRoot.position.y = g._rigBaseY ?? g.rigRoot.position.y; if (g._rigBaseX != null) { g.rigRoot.position.x = g._rigBaseX; g.rigRoot.position.z = g._rigBaseZ; } }
    // step off in front of it (where it faces), else any free side
    const p = posOf(g), fx = Math.round(-Math.sin(pose.yaw)), fz = Math.round(-Math.cos(pose.yaw));
    const tries = [[fx, fz], [1, 0], [-1, 0], [0, 1], [0, -1]].filter(([x, z]) => x || z);
    const free = (x, z) => typeof cellPassable !== 'function' || cellPassable(x, z);
    for (const [dx, dz] of tries) { const x = Math.round(p.x + dx), z = Math.round(p.z + dz); if (free(x, z) && (typeof hasGroundAt !== 'function' || hasGroundAt(x, z))) { teleport(g, x, z); break; } }
    // the seat moves freely again once its sitter is off it
    if (pose.held && !pose.on?.isDisposed?.()) setTimeout(() => { try { pose.held.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC); } catch {} }, 250);
    g.rigMode = null; if (!quiet) { g.anim = 'idle'; playRig(g, 'idle', true); }
    return true;
  }

  // ------------------------------------------------------------- routines
  // A live world's idle turn (live.js, no brain): what someone does with the
  // things around them. At night (the "night" lighting) a bed nearby is slept
  // in, till it is day again; by day a station that fits the character's
  // role or description is worked at (a smith at the anvil), or a seat nearby
  // is sat on for a while. Returns true when it did something.
  const STATION = [
    [/smith|forge|farrier|armou?rer/i, 'anvil'], [/carpent|joiner|woodwork|craftsm|tinker/i, 'workbench'],
    [/cook|innkeep|tavern|alchem|brew|witch|kitchen|baker/i, 'cauldron'], [/woodcut|woodsm|lumber|forester|logger/i, 'chop'],
    [/miner|mason|quarr|stonecut/i, 'mine'], [/scholar|scribe|priest|wizard|mage|librar|sage|monk|sorcer|teacher/i, 'read'],
    [/guard|soldier|knight|warrior|squire|archer|captain|fighter|swords/i, 'train'],
  ];
  const isNight = () => window.tablefolkClock ? window.tablefolkClock.isNight() : state.lighting === 'night';
  function routine(g) {
    if (!g || g === state.playerAvatar || g.defeated) return false;
    if (isNight()) {
      if (g.pose?.mode === 'lie') return true;   // asleep: sleeps on
      const bed = nearby(g, 10).find(o => o.k === 'bed' && !occupied(o, g));
      if (bed && Math.random() < .6) { useThing(g, bed); return true; }
      return false;
    }
    if (g.pose?.mode === 'lie') { standUp(g); say(g, `${g.id} gets up`, false); return true; }   // morning
    const cfg = getBrainConfig(g.id), who = [cfg.role, g.style, cfg.personality].filter(Boolean).join(' ');
    const k = STATION.find(([re]) => re.test(who))?.[1];
    const station = k && nearby(g, 9).find(o => o.k === k);
    if (g.pose) { if (Math.random() < (station ? .7 : .35)) { standUp(g); return true; } return Math.random() < .7; }   // sits a while
    if (station) { if (Math.random() < .6) { useThing(g, station); return true; } return false; }   // a worker works (or wanders)
    const seat = nearby(g, 6).find(o => o.k === 'seat' && !occupied(o, g));
    if (seat && Math.random() < .2) { useThing(g, seat); return true; }
    return false;
  }
  // someone else is already on it
  const occupied = (o, g) => state.characters.concat(state.playerAvatar || []).some(c => c !== g && c.pose?.on === o.mesh);

  // ------------------------------------------------------- prompt helpers
  // "use(bed) (2 steps north: lie down and rest)": the nearest few usable
  // things, for senses.js hereLine
  const WHAT = { chest: o => isOpen(o.mesh) ? 'it is open' : 'open it and look inside', bed: () => 'lie down and rest', seat: () => 'sit down', anvil: () => 'hammer', workbench: () => 'work', cauldron: () => 'stir', chop: () => 'chop firewood', mine: () => 'break stone', well: () => 'drink', read: () => 'read', train: () => 'practise', food: o => 'take ' + (FOOD_OF[o.type] === 'apple' ? 'an apple' : 'a ' + FOOD_OF[o.type]),
    store: () => 'look inside', field: o => { const st = stockOf(o); return st?.left > 0 ? 'harvest ' + st.item : 'sow and tend it'; }, hunt: () => 'check the snare',
    gather: o => { const st = stockOf(o); return st ? (st.left > 0 ? 'take ' + an(st.item) : 'spent for now') : 'gather'; }, pack: o => String(packItem(o.type)?.use?.what || 'use it') };
  const whatOf = o => (WHAT[o.k] || (REGISTERED[o.k] ? () => REGISTERED[o.k].what || 'use it' : () => 'use it'))(o);
  function nearby(g, radius = 4) {
    const p = posOf(g), seen = new Set(), out = [];
    for (const o of getObjects()) {
      const k = kindOf(o.type); if (!k) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z); if (d > radius) continue;
      out.push({ ...o, d, k });
    }
    out.sort((a, b) => a.d - b.d);
    return out.filter(o => !seen.has(o.type) && seen.add(o.type));
  }
  function menu(g, fmt) {
    if (g.pose) return [`stay ${g.pose.mode === 'lie' ? 'lying' : 'seated'} and talk, or do anything else to get up`];
    const out = [];
    for (const o of nearby(g).slice(0, 2)) {
      // a chest: the exact lines first (small models copy a concrete example,
      // and took the first chest line, use(), when asked to store something)
      if (o.k === 'chest' || o.k === 'store') {
        // what is inside: known once it has been opened (open now, or seen before)
        const mm = meta(o.mesh), seen = isOpen(o.mesh) || mm?.opts?.contents && mm.opts.opened;
        const mine = (charInventory(g).items || []).filter(i => (i.qty ?? 1) > 0), c = seen ? contents(o.mesh) : null, inside = c?.items.find(i => (i.qty ?? 1) > 0);
        if (mine.length) out.push(`put(${mine[0].name}, ${o.type}) (puts your ${mine[0].name} in the ${nice(o.type)})`);
        if (inside) out.push(`take(${inside.name}, ${o.type}) (takes the ${inside.name} out)`);
      }
      out.push(`use(${o.type}) (${fmt(o)}: ${whatOf(o)}${o.d > REACH ? '; walks there itself' : ''})`);
    }
    return out;
  }
  // one prompt line, only with something usable close by
  function exampleLine(g) {
    const n = g && nearby(g, 5); if (!n?.length) return '';
    const chest = n.find(o => o.k === 'chest' || o.k === 'store');
    return 'use(thing) e.g. use(' + n[0].type + ') - use a thing nearby (walks over to it first, no walk() needed): open or close a chest, sit on a seat, lie down on a bed, work at an anvil, chop a tree' +
      (chest ? `; take(item, ${chest.type}) and put(item, ${chest.type}) to take from or store in a chest` : '');
  }

  window.tablefolkUses = { use, put, take, shut, emoteUse, walkOnto, routine, standUp, kindOf, menu, exampleLine, contents, close, setOpen, nearby, describe, register, resetRegistered, stockOf, useThing, besideCell, REACH, KIND, CORE_STOCK, registered: REGISTERED, STATION };
})();
