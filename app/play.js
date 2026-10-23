/* play.js -- the player's side of the game: using things, loot, inventory,
 * and the turn round that lets nearby characters act after each move.
 *
 *   E          use what is in front of you: open a chest (its gold and items
 *              go to you), pick up an item (potion, scroll, axe...), read a
 *              note, or talk to the character there (selects it, focuses chat)
 *   walk over  gold (coin piles) is picked up on its own
 *   give       drag an item (or the gold) from the Adventurer pane onto a
 *              character close by, or press its "give" button (the nearest)
 *   I          the Adventurer pane: health, gold, what you carry (drink a
 *              potion, wield or put away a weapon, drop)
 *
 * Chest contents come from the scenario object: {"type": "chest", "x": 2,
 * "z": -1, "gold": 30, "items": ["silver key", "healing potion"]}; a chest
 * without either holds a little gold (and sometimes a potion). Coin piles
 * take "gold" too (default 10-30).
 *
 * Turn round: every player action (a step, an attack, using something) is a
 * player turn. Then the characters within reach (state.npcRadius, default
 * the earshot, 6) act once each, nearest first, while the player waits:
 * hostile ones (agent "hostile": true; mindless monsters by default) with a
 * quick built-in fighter (close in, then attack), the rest with their LLM
 * brain when it is loaded. Chatting is not a turn: the one spoken to answers.
 *
 * Loaded after app.js, combat.js and senses.js; uses their globals.
 */
(function () {
  const REACH = 1.7;
  const MINDLESS = new Set(['skeleton', 'skeleton_warrior', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon']);
  const PICKUPS = { potion: 'healing potion', scroll: 'scroll', axe: 'axe', pickaxe: 'pickaxe', bag: 'bag', bucket: 'bucket', key: 'key', chalice: 'gold chalice', rope: 'rope' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toast = (t, type = 'info') => window.tablefolkToast?.(t, { type });
  const sfx = (n, p) => window.tablefolkSfx?.play(n, p);
  const posOf = m => m.getAbsolutePosition?.() || m.position;
  const me = () => state.playerAvatar;
  const myPos = () => { const g = me(); return g && (g.logicalPos || g.root.position); };
  const alive = m => m && !m.isDisposed?.();
  function note(text) { state.globalHistory = (state.globalHistory || []).concat([`T${state.turn?.index ?? 0} player: ${text}`]).slice(-20); log(text); }

  // ---------------------------------------------------------------- loot
  // Every object remembers its scenario options (makeObject in app.js), so a
  // chest knows what it holds; opened chests keep "opened" in their opts.
  function lootOf(m) {
    const mm = meta(m), o = mm?.opts || {};
    const items = (Array.isArray(o.items) ? o.items : []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : { name: String(i.name), qty: i.qty ?? 1 });
    if (o.gold == null && !items.length) {
      // a little something: seeded by where the chest stands
      const p = posOf(m), r = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1;
      return { gold: 8 + Math.floor(r * 30), items: r > .55 ? [{ name: 'healing potion', qty: 1 }] : [] };
    }
    return { gold: Math.max(0, +o.gold || 0), items };
  }
  function give(items) { for (const i of items) { const have = state.player.items.find(x => x.name.toLowerCase() === i.name.toLowerCase()); if (have) have.qty = (have.qty ?? 1) + (i.qty ?? 1); else state.player.items.push({ name: i.name, qty: i.qty ?? 1 }); } }
  function describe(gold, items) { return [gold ? gold + ' gold' : '', ...items.map(i => i.name + ((i.qty ?? 1) > 1 ? ' x' + i.qty : ''))].filter(Boolean).join(', '); }

  function openChest(m) {
    const mm = meta(m); mm.opts ||= {};
    if (mm.opts.opened) { toast('the ' + mm.type.replace('_', ' ') + ' is empty'); return false; }
    const { gold, items } = lootOf(m);
    mm.opts.opened = true; mm.state = 'open';
    lidOpen(m);
    sfx('chestOpen', posOf(m));
    state.player.gold = (state.player.gold || 0) + gold; give(items);
    if (gold) setTimeout(() => sfx('coins', posOf(m)), 350);
    const got = describe(gold, items);
    note(`${playerName()} opens the ${mm.type.replace('_', ' ')}${got ? ' and takes ' + got : ': it is empty'}`);
    toast(got ? 'You found ' + got : 'The chest is empty', got ? 'success' : 'info');
    inventoryChanged(); render();
    return true;
  }
  // The wooden chest's lid is a bone (Chest_Top): tip it back.
  function lidOpen(m) {
    const lid = m.getDescendants?.(false).find(n => /Chest_Top|Lid/i.test(n.name) && !n.getTotalVertices);
    if (!lid) return;
    const q0 = lid.rotationQuaternion ? lid.rotationQuaternion.clone() : null, r0 = lid.rotation.clone();
    let t = 0;
    const obs = state.scene.onBeforeRenderObservable.add(() => {
      t = Math.min(1, t + (state.scene.getEngine().getDeltaTime() || 16) / 450);
      const a = -1.15 * (1 - Math.pow(1 - t, 3));
      if (q0) lid.rotationQuaternion = q0.multiply(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, a));
      else lid.rotation.x = r0.x + a;
      if (t >= 1 || lid.isDisposed?.()) state.scene.onBeforeRenderObservable.remove(obs);
    });
  }
  function pickUp(m) {
    const mm = meta(m), name = mm.opts?.name || PICKUPS[mm.type] || mm.type.replace(/_/g, ' ');
    give([{ name, qty: 1 }]);
    // bare-handed: take up a weapon at once
    if (!state.player.wielding && window.tablefolkCombat?.weaponFor(name) && me()) window.tablefolkCombat.wield(me(), name);
    sfx('pickup', posOf(m));
    note(`${playerName()} picks up the ${name}`);
    toast('Picked up: ' + name, 'success');
    disposeWorldObject(m);
    inventoryChanged(); render();
    return true;
  }
  function takeGold(m) {
    const mm = meta(m), n = mm.opts?.gold != null ? Math.max(0, +mm.opts.gold || 0) : 10 + Math.floor(Math.random() * 21);
    state.player.gold = (state.player.gold || 0) + n;
    sfx('coins', posOf(m));
    note(`${playerName()} picks up ${n} gold`);
    toast('+' + n + ' gold', 'success');
    disposeWorldObject(m);
    inventoryChanged(); render();
  }
  // Walking over gold picks it up.
  setInterval(() => {
    const p = myPos(); if (!p || me()?.defeated) return;
    for (const m of state.props.slice()) {
      if (!alive(m) || meta(m)?.type !== 'coin_pile') continue;
      const q = posOf(m); if (Math.abs(q.x - p.x) < .7 && Math.abs(q.z - p.z) < .7) takeGold(m);
    }
  }, 200);

  // ---------------------------------------------------------------- E: use
  // The nearest usable thing within reach, preferring what is in front.
  function usable() {
    const g = me(), p = myPos(); if (!g || !p) return null;
    const f = state.firstPerson ? { x: Math.sin(state.fpYaw ?? 0), z: Math.cos(state.fpYaw ?? 0) } : { x: g.dir?.x || 0, z: g.dir?.z || 0 };
    const score = q => { const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); return d > REACH ? null : d - .6 * ((dx * f.x + dz * f.z) / (d || 1)); };
    let best = null;
    const consider = (kind, thing, q) => { const s = score(q); if (s != null && (!best || s < best.s)) best = { kind, thing, s }; };
    for (const m of state.props) {
      if (!alive(m)) continue;
      const t = meta(m)?.type;
      if (t === 'chest' || t === 'iron_chest') consider('chest', m, posOf(m));
      else if (PICKUPS[t]) consider('item', m, posOf(m));
      else if (t === 'coin_pile') consider('gold', m, posOf(m));
      else if (t === 'note') consider('note', m, posOf(m));
    }
    for (const c of state.characters) if (!c.defeated) consider('person', c, c.logicalPos || c.root.position);
    return best;
  }
  function use() {
    const g = me(); if (!g || g.defeated || state.npcBusy) return;
    const u = usable();
    if (!u) { toast('Nothing to use here. Walk up to a chest, an item or a person and press E.'); return; }
    if (u.kind === 'person') {
      selectCharacter(u.thing);
      const to = document.getElementById('chatTo'); if (to) to.value = u.thing.id;
      document.getElementById('chatInput')?.focus();
      toast('Say something to ' + u.thing.id);
      return;   // talking is not a turn: the one spoken to answers
    }
    if (u.kind === 'note') { const mm = meta(u.thing); toast('The note says: ' + ((mm.noteText || noteTextFromHtml(mm.noteHtml || '')) || '(blank)')); return; }
    const p = u.kind === 'chest' ? posOf(u.thing) : null;
    if (p) setCharacterFacing(g, new BABYLON.Vector3(p.x - myPos().x, 0, p.z - myPos().z));
    const done = u.kind === 'chest' ? openChest(u.thing) : u.kind === 'gold' ? (takeGold(u.thing), true) : pickUp(u.thing);
    if (done) acted('use');
  }

  // ---------------------------------------------------------------- inventory
  const POTION = /potion|elixir|tonic|draught/i;
  function drink(name) {
    const it = findItem(state.player.items, name); if (!it || !(it.qty ?? 1)) return;
    const healed = window.tablefolkCombat?.heal(me() || 'player', 4) || 0;
    it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) state.player.items.splice(state.player.items.indexOf(it), 1);
    note(`${playerName()} drinks the ${it.name}${healed ? ' and heals ' + healed : ''}`);
    toast(healed ? `You feel better (+${healed} health)` : 'You drink the ' + it.name, 'success');
    window.tablefolkCombat?.renderPlayerHp(); inventoryChanged(); render(); acted('use');
  }
  function drop(name) {
    const g = me(), it = findItem(state.player.items, name); if (!it) return;
    if (state.player.wielding && state.player.wielding.toLowerCase() === it.name.toLowerCase()) window.tablefolkCombat?.wield(g, 'none');
    it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) state.player.items.splice(state.player.items.indexOf(it), 1);
    note(`${playerName()} drops the ${it.name}`);
    inventoryChanged(); render();
  }
  const esc = s => String(s).replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    const box = document.getElementById('advPane'); if (!box) return;
    const g = me(), C = window.tablefolkCombat;
    const hp = g && C ? C.hpOf('player') : null, w = state.player?.wielding;
    const items = (state.player?.items || []).filter(i => (i.qty ?? 1) > 0);
    const goal = window.tablefolkScenario?.active?.scn?.goal?.text;
    box.innerHTML = `
      ${g ? `<div class="adv-stat"><span>Health</span><span class="hp-bar"><span style="width:${Math.round(100 * hp.hp / hp.max)}%"></span></span><b>${hp.hp}/${hp.max}</b></div>` : '<p class="pane-note">No avatar in this world.</p>'}
      <div class="adv-stat adv-drag" draggable="${state.player?.gold > 0}" data-give="gold" title="drag onto a character to give gold"><span>Gold</span><b class="adv-gold">${state.player?.gold || 0}</b></div>
      <div class="adv-stat"><span>Wielding</span><b>${w ? esc(w) : 'bare hands'}</b></div>
      ${goal ? `<div class="section-subtitle">Goal</div><p class="adv-goal">${esc(goal)}</p>` : ''}
      <div class="section-subtitle">Carrying</div>
      ${items.length ? `<ul class="adv-items">${items.map(i => {
        const n = esc(i.name), weapon = C?.weaponFor(i.name), held = w && w.toLowerCase() === i.name.toLowerCase();
        return `<li class="adv-drag" draggable="true" data-give="${n}" title="drag onto a character to give it"><span>${n}${(i.qty ?? 1) > 1 ? ` <small>x${i.qty}</small>` : ''}</span><span class="adv-acts">
          <button data-act="give" data-item="${n}" title="give to the nearest character (or drag the item onto one)">give</button>
          ${POTION.test(i.name) ? `<button data-act="drink" data-item="${n}">drink</button>` : ''}
          ${weapon ? `<button data-act="${held ? 'unwield' : 'wield'}" data-item="${n}">${held ? 'put away' : 'wield'}</button>` : ''}
          <button data-act="drop" data-item="${n}" title="drop">✕</button></span></li>`;
      }).join('')}</ul>` : '<p class="pane-note">Nothing yet. Open chests (E) and pick things up.</p>'}
      <div class="section-subtitle">Controls</div>
      <div class="adv-keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span><span>click the ground: walk there</span>
        <span><kbd>E</kbd> open / pick up / talk</span><span><kbd>F</kbd> attack</span>
        <span><kbd>V</kbd> first person</span><span><kbd>I</kbd> this panel</span>
        <span><kbd>Enter</kbd> chat</span><span><kbd>Esc</kbd> close panel</span>
      </div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('#advPane button[data-act]'); if (!b) return;
    const name = b.dataset.item, act = b.dataset.act, g = me();
    if (act === 'drink') drink(name);
    else if (act === 'drop') drop(name);
    else if (act === 'wield' && g) { window.tablefolkCombat?.wield(g, name); render(); }
    else if (act === 'unwield' && g) { window.tablefolkCombat?.wield(g, 'none'); render(); }
    else if (act === 'give') { const c = nearestTaker(); if (c) giveTo(c, name); else toast('nobody close enough to give it to', 'warn'); }
  });

  // ---------------------------------------------------------------- giving
  // Drag an item or the gold from the Adventurer pane onto a character (or
  // "give" hands it to the nearest one). The character gets it in its
  // inventory, and hears about it as something said to it, so it reacts.
  const GIVE_REACH = 3.2;
  const takers = () => state.characters.filter(c => c.root && !c.defeated && !getBrainConfig(c.id).defeated && c !== me());
  const distTo = c => { const p = myPos(), q = c.logicalPos || c.root.position; return p ? Math.hypot(p.x - q.x, p.z - q.z) : Infinity; };
  function nearestTaker() { let best = null; for (const c of takers()) if (distTo(c) <= GIVE_REACH && (!best || distTo(c) < distTo(best))) best = c; return best; }
  // the character drawn nearest a screen point (its middle, within 80 px)
  function characterAt(x, y) {
    const scene = state.scene, cam = scene?.activeCamera; if (!cam) return null;
    const r = scene.getEngine().getRenderingCanvas().getBoundingClientRect(), vp = cam.viewport.toGlobal(r.width, r.height);
    let best = null, bd = 80;
    for (const c of takers()) {
      const q = c.root.getAbsolutePosition(), s = BABYLON.Vector3.Project(new BABYLON.Vector3(q.x, q.y + .7, q.z), BABYLON.Matrix.Identity(), scene.getTransformMatrix(), vp);
      if (s.z < 0 || s.z > 1) continue;
      const d = Math.hypot(s.x + r.left - x, s.y + r.top - y); if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function giveTo(c, what, amount) {
    if (!me() || me().defeated) return;
    if (distTo(c) > GIVE_REACH) { toast(`walk closer to ${c.id} first`, 'warn'); return; }
    const inv = charInventory(c), who = playerName();
    let given;
    if (what === 'gold') {
      const n = Math.min(state.player.gold || 0, Math.max(0, Math.round(+amount || 0))); if (!n) return;
      state.player.gold -= n; inv.gold = (inv.gold || 0) + n; given = n + ' gold';
      sfx('coins', posOf(c.root));
    } else {
      const it = findItem(state.player.items, what); if (!it || !(it.qty ?? 1)) return;
      if (state.player.wielding && state.player.wielding.toLowerCase() === it.name.toLowerCase()) window.tablefolkCombat?.wield(me(), 'none');
      it.qty = (it.qty ?? 1) - 1; if (it.qty <= 0) state.player.items.splice(state.player.items.indexOf(it), 1);
      addItem(inv.items, it.name); given = 'the ' + it.name;
    }
    const cfg = getBrainConfig(c.id);
    cfg.inventory = inv;
    cfg.pendingChat = (cfg.pendingChat || []).concat([`(${who} gives you ${given}.)`]).slice(-5);
    setBrainConfig(c.id, cfg);
    emitBadge(c, '+' + given.replace(/^the /, ''));
    note(`${who} gives ${c.id} ${given}`);
    inventoryChanged(); render(); acted('give');
  }
  // how much gold: a small box where it was dropped
  function askGold(c, x, y) {
    document.getElementById('giveGold')?.remove();
    const have = state.player.gold || 0; if (!have) return;
    const box = document.createElement('form'); box.id = 'giveGold';
    box.innerHTML = `<span>Give ${esc(c.id)}</span><input type="number" min="1" max="${have}" value="${Math.min(10, have)}"> <span>gold</span><button>give</button><button type="button" data-x>✕</button>`;
    box.style.left = Math.min(x, innerWidth - 260) + 'px'; box.style.top = Math.max(8, y - 50) + 'px';
    document.body.appendChild(box);
    const inp = box.querySelector('input'); inp.focus(); inp.select();
    box.addEventListener('submit', e => { e.preventDefault(); box.remove(); giveTo(c, 'gold', inp.value); });
    box.querySelector('[data-x]').onclick = () => box.remove();
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') box.remove(); });
  }
  let dragging = null;
  const hint = () => { let h = document.getElementById('giveHint'); if (!h) { h = document.createElement('div'); h.id = 'giveHint'; document.body.appendChild(h); } return h; };
  document.addEventListener('dragstart', e => {
    const d = e.target.closest?.('#advPane [data-give]'); if (!d) return;
    dragging = d.dataset.give;
    e.dataTransfer.setData('text/plain', dragging); e.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragend', () => { dragging = null; hint().classList.remove('show'); });
  const overCanvas = e => e.target?.id === 'renderCanvas';
  document.addEventListener('dragover', e => {
    if (!dragging || !overCanvas(e)) { if (dragging) hint().classList.remove('show'); return; }
    e.preventDefault();
    const c = characterAt(e.clientX, e.clientY), h = hint();
    e.dataTransfer.dropEffect = c ? 'move' : 'none';
    h.textContent = c ? (distTo(c) > GIVE_REACH ? `${c.id} is too far away` : `give to ${c.id}`) : 'drop on a character';
    h.classList.toggle('far', !c || distTo(c) > GIVE_REACH);
    h.style.left = e.clientX + 14 + 'px'; h.style.top = e.clientY + 12 + 'px'; h.classList.add('show');
  });
  document.addEventListener('drop', e => {
    if (!dragging || !overCanvas(e)) return;
    e.preventDefault(); hint().classList.remove('show');
    const what = dragging, c = characterAt(e.clientX, e.clientY); dragging = null;
    if (!c) return;
    if (what === 'gold') { if (distTo(c) > GIVE_REACH) toast(`walk closer to ${c.id} first`, 'warn'); else askGold(c, e.clientX, e.clientY); }
    else giveTo(c, what);
  });
  window.addEventListener('tablefolk-inventory', render);

  // ---------------------------------------------------------------- the turn round
  // A player action: the characters close by each act once, nearest first.
  // Fighters take their turn before the player moves again (combat is quick).
  // Characters with a brain think and talk in the background: the player
  // keeps moving meanwhile, and a small note says who is thinking.
  let busy = false, queued = false, talking = false;
  function acted(kind) {
    if (!me()) return;
    try { window.dispatchEvent(new CustomEvent('tablefolk-player-turn', { detail: { kind } })); } catch {}
    if (busy) { queued = true; return; }
    round().catch(e => console.error('[play] turn round', e));
  }
  function banner(id, text) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    if (text) el.textContent = text; el.classList.toggle('show', !!text);
  }
  function setBusy(on, text = '') {
    state.npcBusy = on;
    banner('npcTurnBanner', on ? text : '');
    if (on) { try { fpHeld?.clear?.(); } catch {} }
  }
  const until = async (fn, ms = 20000) => { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await sleep(60); };
  async function round() {
    busy = true;
    try {
      do {
        queued = false;
        const p0 = myPos(); if (!p0) return;
        // let the player's own move finish first
        await until(() => !me()?.turnMove, 8000);
        const p = myPos(), R = +state.npcRadius > 0 ? +state.npcRadius : (+state.earshot > 0 ? +state.earshot : 6);
        const near = state.characters.filter(c => !c.defeated && !getBrainConfig(c.id).defeated && Math.hypot(posOf(c.root).x - p.x, posOf(c.root).z - p.z) <= R)
          .sort((a, b) => Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z) - Math.hypot(b.root.position.x - p.x, b.root.position.z - p.z));
        const w = window.tablefolk;
        const brains = w?.brainReady?.() && !w?.isBrainLoopRunning?.();
        const actors = near.filter(c => getBrainConfig(c.id).enabled !== false);
        const fighters = actors.filter(isHostile), talkers = brains ? actors.filter(c => !isHostile(c) && sees(c)) : [];
        if (talkers.length && !talking) talk(talkers);
        for (const c of fighters) {
          if (c.defeated || me()?.defeated) break;
          setBusy(true, `${c.id}${/s$/.test(c.id) ? "'" : "'s"} turn`);
          await fighterTurn(c);
          await until(() => !c.turnMove, 15000);
        }
      } while (queued);
    } finally { busy = false; setBusy(false); }
  }
  // a friendly character only takes a turn while it can see the player
  const sees = c => window.tablefolk?.canSeeEachOther?.(c, me()) ?? true;
  async function talk(list) {
    talking = true;
    const w = window.tablefolk;
    try {
      for (const c of list) {
        if (c.defeated || me()?.defeated) break;
        if (!sees(c)) continue;   // the player has left the room meanwhile
        banner('npcThinking', `${c.id} is thinking…`);
        await w.runAgentTurn(c);
      }
    } catch (e) { console.error('[play] talk turn', e); }
    finally { talking = false; banner('npcThinking', ''); }
  }
  // the note goes away once the character has decided what to do
  addEventListener('tablefolk-agent-turn', () => banner('npcThinking', ''));
  function isHostile(c) { const cfg = getBrainConfig(c.id); return cfg.hostile ?? MINDLESS.has(c.charModel); }

  // A plain fighter: attack when next to the player, else close in (two
  // cells a turn) when it can see the player within 8 cells.
  async function fighterTurn(c) {
    const pl = me(); if (!pl || pl.defeated) return;
    const a = c.logicalPos || c.root.position, b = pl.logicalPos || pl.root.position, d = Math.hypot(b.x - a.x, b.z - a.z);
    const C = window.tablefolkCombat;
    if (d <= (C?.REACH ?? 1.6)) { C?.attack(c, 'player'); await sleep(900); return; }
    if (d > 8) return;
    const route = findRoute(new BABYLON.Vector3(a.x, 0, a.z), new BABYLON.Vector3(b.x, 0, b.z)); if (!route?.length) return;
    // walk two cells along the route, stopping short of the player
    const pts = [new BABYLON.Vector3(a.x, 0, a.z), ...route]; let left = Math.min(2, d - 1.2), end = pts[0];
    for (let i = 1; i < pts.length && left > 0; i++) { const seg = BABYLON.Vector3.Distance(pts[i - 1], pts[i]); const t = Math.min(1, left / seg); end = BABYLON.Vector3.Lerp(pts[i - 1], pts[i], t); left -= seg; }
    let tx = Math.round(end.x), tz = Math.round(end.z);
    if (!cellPassable(tx, tz) || occupantAt(tx, tz, c)) return;
    if (Math.abs(tx - a.x) < .1 && Math.abs(tz - a.z) < .1) return;
    const leg = findRoute(new BABYLON.Vector3(a.x, 0, a.z), new BABYLON.Vector3(tx, 0, tz)); if (!leg?.length) return;
    startTurnPath(c, leg); c.anim = 'walk'; playRig(c, 'walk', true);
    setTimeout(() => { if (c.anim === 'walk') { c.anim = 'idle'; playRig(c, 'idle', true); } }, c.turnMove.dur * 1000 + 80);
    await sleep(c.turnMove.dur * 1000 + 120);
    // close enough now: strike in the same turn, like a charge
    const a2 = c.logicalPos || c.root.position;
    if (Math.hypot(b.x - a2.x, b.z - a2.z) <= (C?.REACH ?? 1.6)) { C?.attack(c, 'player'); await sleep(900); }
  }

  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'e' && me()) { e.preventDefault(); use(); }
    else if (k === 'i') { e.preventDefault(); window.tablefolkTabs?.toggle?.('adventurer'); render(); }
  });

  // ---------------------------------------------------------------- messages
  // Everything the game said (speech, fights, loot), for the Messages pane:
  // toasts vanish, this keeps the last 300 lines. Engine chatter is left out.
  const NOISE = /^(turn \d|selected |KayKit|.*rig anims|v8 real prop|world state|layout|loaded |rigged character|.* walks (toward|\d)|.* blocked walking|generated character|agent brains|scenario )/i;
  const history = [];
  function remember(text) {
    const t = String(text || '').trim(); if (!t || NOISE.test(t)) return;
    const kind = /attack|hits|misses|defeated|strikes|health/i.test(t) ? 'fight' : /picks up|opens|takes|gold|found/i.test(t) ? 'loot' : /^[\w-]+: /.test(t) ? 'talk' : 'info';
    history.push({ t: Date.now(), text: t, kind }); if (history.length > 300) history.shift();
    renderMessages();
  }
  function renderMessages() {
    const box = document.getElementById('msgPane'); if (!box || !box.offsetParent) return;
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.innerHTML = history.length ? history.map(m => `<div class="msg m-${m.kind}"><time>${new Date(m.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>${esc(m.text)}</div>`).join('') : '<p class="pane-note">Nothing has happened yet.</p>';
    if (atEnd) box.scrollTop = box.scrollHeight;
  }

  // ---------------------------------------------------------------- hurt, defeat
  function hurtFlash() {
    let el = document.getElementById('hurtFlash');
    if (!el) { el = document.createElement('div'); el.id = 'hurtFlash'; document.body.appendChild(el); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  window.addEventListener('tablefolk-defeated', e => {
    if (e.detail?.id !== 'player') return;
    remember('You were defeated by ' + e.detail.by + '.');
    // a scenario with a "player_defeated" lose condition shows its own ending
    setTimeout(() => {
      if (!document.getElementById('scenarioEnd')?.hidden) return;
      let el = document.getElementById('defeatCard');
      if (!el) { el = document.createElement('div'); el.id = 'defeatCard'; el.className = 'scn-overlay'; document.body.appendChild(el); }
      el.innerHTML = `<div class="scn-card"><h2>You were defeated</h2><p>${esc(e.detail.by)} struck you down.</p><div class="scn-actions">
        <button type="button" data-d="restart">try again</button><button type="button" data-d="close">look around</button></div></div>`;
      el.hidden = false;
      el.onclick = ev => {
        const b = ev.target.closest('button'); if (!b) return;
        el.hidden = true;
        const a = window.tablefolkScenario?.active;
        if (b.dataset.d === 'restart' && a) window.tablefolkScenario.playScenario(a.scn, { code: a.code });
      };
    }, 700);
  });

  window.tablefolkPlay = { remember, renderMessages, hurtFlash, use, acted, openChest, pickUp, takeGold, drink, drop, render, isHostile, fighterTurn, get busy() { return busy; } };
})();
