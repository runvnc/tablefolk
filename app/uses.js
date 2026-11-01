/* uses.js -- characters use the things that have an obvious use.
 *
 *   use(thing)          by what it is:
 *     chest, iron_chest      opens it (and says what is inside) or closes it
 *     bed, double_bed        lies down on it and rests (tiredness to zero)
 *     bench, stool, chairs   sits on it (tiredness down a little)
 *     anvil                  hammers;  workbench: saws;  cauldron: stirs
 *     tree, logs             chops (takes firewood);  boulder: breaks stone
 *     well                   draws water and drinks;  lectern, bookcase: reads
 *     target, dummy          practises;  apple/carrot barrels and crates: takes one
 *   take(item, chest)   from an open chest ("gold", "5 gold", an item's name)
 *   put(item, chest)    into an open chest, from what it carries
 *
 * A character walks over first when the thing is a few steps away (like
 * carry). Sitting and lying last (g.pose): talk keeps the pose, the next
 * other action stands it up (standUp, called by executeGameCommandImmediate);
 * playRig plays the pose clip in place of idle and talk, bodyYaw keeps the
 * pose's facing, and the model is lifted onto the seat or mattress (measured
 * from its bones once the clip plays, so KayKit and Meshy rigs both fit).
 *
 * Chests hold opts.contents {gold, items} (filled from the scenario's
 * opts.gold/items, or the seeded loot, the first time it is looked into);
 * the player's E on a chest (play.js) takes all of it; opts.opened marks one
 * that is open. Saved with the world, as the object's opts are.
 *
 * The clips are the KayKit ones (Meshy people carry them too:
 * tools/retarget-people.sh). Figures without them play their idle.
 *
 *   window.tablefolkUses = { use, put, take, standUp, kindOf, menu, exampleLine, contents, close, setOpen, nearby, describe }
 */
(function () {
  const KIND = {
    chest: 'chest', iron_chest: 'chest', bed: 'bed', double_bed: 'bed',
    bench: 'seat', stool: 'seat', wooden_chair: 'seat', armchair: 'seat', sofa: 'seat', office_chair: 'seat', throne: 'seat',
    anvil: 'anvil', workbench: 'workbench', cauldron: 'cauldron', well: 'well', tree: 'chop', logs: 'chop', boulder: 'mine',
    lectern: 'read', bookcase: 'read', bookshelf: 'read', target: 'train', dummy: 'train',
    apple_barrel: 'food', apple_crate: 'food', carrot_crate: 'food',
  };
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
  const kindOf = t => KIND[t] || null;
  const posOf = g => g.logicalPos || g.root.position;
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const toastIfPlayer = (g, text) => { if (g === state.playerAvatar) window.tablefolkToast?.(text); };

  // the nearest usable thing called `name` within sight
  function find(g, name) {
    const o = namedThing(g, name, 10);
    if (o && kindOf(o.type)) return o;
    // "use(seat)", "use(chair)": the nearest thing of that kind
    const want = String(name || '').toLowerCase().replace(/^(the|a|an)\s+/, '').trim();
    const k = { chair: 'seat', seat: 'seat', bed: 'bed', chest: 'chest', box: 'chest', tree: 'chop', wood: 'chop', water: 'well', book: 'read', books: 'read' }[want];
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
    walk(g, { type: 'coord', x: c.x, z: c.z, label: 'the ' + nice(o.type) });
    const ms = (g.turnMove?.dur || 1) * 1000 + 150;
    setTimeout(() => {
      const q = posOf(g);
      if (!o.mesh.isDisposed?.() && Math.hypot(o.x - q.x, o.z - q.z) <= REACH + .1) then();
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
    if (!o) return say(g, `there is no ${name || 'thing'} in sight to use`, false);
    const k = kindOf(o.type);
    if (!k) return say(g, `${g.id} cannot think of a use for the ${nice(o.type)}`, false);
    if (k === 'chest') return reach(g, o, () => toggleChest(g, o));
    if (k === 'bed' || k === 'seat') return reach(g, o, () => settle(g, o, k === 'bed' ? 'lie' : 'sit'));
    return reach(g, o, () => work(g, o, k));
  }

  function work(g, o, k) {
    const w = WORK[k]; face(g, o);
    const food = FOOD_OF[o.type];
    const text = w.did.replace('{t}', nice(o.type)).replace('{a}', food === 'apple' ? 'an apple' : 'a ' + (food || 'thing'));
    const item = food || w.gives;
    if (item) {
      if (g === state.playerAvatar) { const have = state.player.items.find(i => i.name === item); if (have) have.qty = (have.qty ?? 1) + 1; else state.player.items.push({ name: item, qty: 1 }); inventoryChanged(); }
      else { const inv = charInventory(g); addItem(inv.items, item); setBrainConfig(g.id, { inventory: inv }); }
    }
    if (w.heal) window.tablefolkCombat?.heal?.(g, w.heal);
    emitBadge(g, w.mode === 'pickup' ? '+' + item : w.mode);
    toastIfPlayer(g, 'You ' + text.replace(/^(\w+?)s\b/, '$1').replace(/ and drinks$/, ' and drink'));
    return act(g, `${g.id} ${text}${item && !food ? ' (+1 ' + item + ')' : ''}`, w.mode, w.ms);
  }

  // ---------------------------------------------------------------- chests
  function meshOf(o) { return o.mesh || o; }
  function contents(m) {
    const mm = meta(m); mm.opts ||= {};
    if (!mm.opts.contents) {
      const o = mm.opts, items = (Array.isArray(o.items) ? o.items : []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : { name: String(i.name), qty: i.qty ?? 1 });
      let gold = Math.max(0, +o.gold || 0), list = items;
      if (o.gold == null && !items.length) {   // a little something, seeded by where the chest stands
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
    if (isOpen(m)) { setOpen(m, false); emitBadge(g, 'closes'); return act(g, `${g.id} closes the ${nice(o.type)}`, 'open', 1300, false); }
    if (meta(m).locked) return say(g, `the ${nice(o.type)} is locked`, false);
    const c = contents(m), what = describe(c);   // before it counts as opened
    setOpen(m, true); emitBadge(g, 'opens');
    toastIfPlayer(g, what ? 'Inside: ' + what : 'It is empty');
    return act(g, `${g.id} opens the ${nice(o.type)}: ${what ? 'inside are ' + what + ' (take(item, ' + o.type + ') to take one)' : 'it is empty'}`, 'open', 1300, false);
  }
  // take(item, chest) / put(item, chest): "item, chest" or "item from/in chest"
  function parse(arg, dflt) {
    const s = String(arg || '').trim().replace(/^["']|["']$/g, '');
    const m = s.match(/^(.*?)\s*(?:,|\bfrom\b|\binto\b|\bin\b|\bto\b)\s*(?:the\s+)?["']?([\w -]+?)["']?$/i);
    return m ? { item: m[1].trim().replace(/^["']|["']$/g, ''), where: m[2].trim() } : { item: s, where: dflt };
  }
  function chestFor(g, where) {
    const o = find(g, where || 'chest');
    if (!o || kindOf(o.type) !== 'chest') return { err: `there is no ${where || 'chest'} in sight` };
    return { o };
  }
  function take(g, arg) {
    const { item, where } = parse(arg, 'chest'), { o, err } = chestFor(g, where);
    if (err) return say(g, 'take failed: ' + err, false);
    return reach(g, o, () => {
      const m = meshOf(o); face(g, o);
      if (!isOpen(m)) return say(g, `take failed: the ${nice(o.type)} is closed; open it first with use(${o.type})`, false);
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
        if (!it) return say(g, `take failed: there is no ${item} in the ${nice(o.type)}` + (describe(c) ? ` (it holds ${describe(c)})` : ' (it is empty)'), false);
        it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) c.items.splice(c.items.indexOf(it), 1);
        addItem(mine.items, it.name); got = it.name;
      }
      if (!got) return say(g, `take failed: the ${nice(o.type)} ${/gold/i.test(item) ? 'has no gold' : 'is empty'}`, false);
      if (g !== state.playerAvatar) setBrainConfig(g.id, { inventory: mine });
      window.tablefolkSfx?.play(/gold/.test(got) ? 'coins' : 'pickup', m.getAbsolutePosition?.() || m.position);
      emitBadge(g, '+' + got); inventoryChanged();
      return act(g, `${g.id} takes ${got} from the ${nice(o.type)}`, 'pickup', 1300, false);
    });
  }
  function put(g, arg) {
    const { item, where } = parse(arg, 'chest'), { o, err } = chestFor(g, where);
    if (err) return say(g, 'put failed: ' + err, false);
    return reach(g, o, () => {
      const m = meshOf(o); face(g, o);
      if (!isOpen(m)) return say(g, `put failed: the ${nice(o.type)} is closed; open it first with use(${o.type})`, false);
      const c = contents(m), mine = g === state.playerAvatar ? state.player : charInventory(g), gm = item.match(/^(\d+)?\s*(?:gold|coins?|gold coins?)$/i);
      let put = '';
      if (gm) {
        const have = +mine.gold || 0, n = Math.min(have, +(gm[1] || have));
        if (n <= 0) return say(g, `put failed: ${g.id} has no gold`, false);
        mine.gold = have - n; c.gold = (+c.gold || 0) + n; put = n + ' gold';
      } else {
        const it = findItem((mine.items || []).filter(i => (i.qty ?? 1) > 0), item);
        if (!it) return say(g, `put failed: ${g.id} has no ${item}`, false);
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

  // ------------------------------------------------------- prompt helpers
  // "use(bed) (2 steps north: lie down and rest)": the nearest few usable
  // things, for senses.js hereLine
  const WHAT = { chest: o => isOpen(o.mesh) ? 'open: take(item, chest) or put(item, chest), or use() again to close it' : 'open it', bed: () => 'lie down and rest', seat: () => 'sit down', anvil: () => 'hammer', workbench: () => 'work', cauldron: () => 'stir', chop: () => 'chop firewood', mine: () => 'break stone', well: () => 'drink', read: () => 'read', train: () => 'practise', food: o => 'take ' + (FOOD_OF[o.type] === 'apple' ? 'an apple' : 'a ' + FOOD_OF[o.type]) };
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
    return nearby(g).slice(0, 2).map(o => `use(${o.type}) (${fmt(o)}: ${WHAT[o.k](o)})`);
  }
  // one prompt line, only with something usable close by
  function exampleLine(g) {
    const n = g && nearby(g, 5); if (!n?.length) return '';
    const chest = n.find(o => o.k === 'chest');
    return 'use(thing) e.g. use(' + n[0].type + ') - use a thing nearby: open or close a chest, sit on a seat, lie on a bed, work at an anvil, chop a tree' +
      (chest ? `; take(item, ${chest.type}) and put(item, ${chest.type}) with an open chest` : '');
  }

  window.tablefolkUses = { use, put, take, standUp, kindOf, menu, exampleLine, contents, close, setOpen, nearby, describe };
})();
