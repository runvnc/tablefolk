/* combat.js -- hit points, weapons and melee.
 *
 *   wield(item)     hold a weapon from your inventory ("none" puts it away)
 *   attack(target)  strike a character next to you (an id, or "player")
 *
 * Every character has hit points (scenario agent "hp", default 10, monsters
 * less or more by kind; the player "player": {"hp": 20}). Damage is the
 * weapon's (fists 1, the player's 2, dagger/club 2,
 * sword/axe/mace 3, greatsword/warhammer 4) plus a small roll, with a chance
 * to miss. At 0 a character is defeated: it falls, stops acting, and drops
 * what it wielded. The struck character hears about it at once (and answers,
 * when the brains are loaded). The player fights from the chat box:
 * "/attack gob1", "/wield sword", or F for the nearest foe in reach.
 *
 * Loaded after app.js; uses its helpers (state, meta, getBrainConfig, ...).
 * Goal predicates in scenario.js: agent_defeated, agent_hp, player_hp,
 * player_defeated.
 */
(function () {
  const REACH = 1.6;
  const WEAPONS = [
    [/great ?sword|claymore|war ?hammer|halberd|great ?axe|zweihander/i, { dmg: 4, kind: 'sword', two: true }],
    [/sword|blade|sabre|saber|scimitar|katana|rapier|cutlass/i, { dmg: 3, kind: 'sword' }],
    [/axe|hatchet/i, { dmg: 3, kind: 'axe' }],
    [/mace|hammer|flail|morning ?star/i, { dmg: 3, kind: 'club' }],
    [/spear|pike|trident|lance/i, { dmg: 3, kind: 'spear' }],
    [/dagger|knife|dirk|shiv|stiletto/i, { dmg: 2, kind: 'dagger' }],
    [/club|cudgel|bat\b|stick|branch|pickaxe|pick\b|staff|cane|rolling pin|frying pan/i, { dmg: 2, kind: 'club' }],
  ];
  const weaponFor = name => { for (const [re, w] of WEAPONS) if (re.test(name || '')) return { ...w, name }; return null; };
  // Monsters fight with what they are (model, see FIGURES in app.js).
  const NATURAL = {
    skeleton: { dmg: 2, name: 'bony claws' }, skeleton_warrior: { dmg: 2, name: 'notched sword' }, zombie: { dmg: 2, name: 'rotting claws' },
    rat: { dmg: 1, name: 'teeth' }, spider: { dmg: 2, name: 'venomous fangs' }, wolf: { dmg: 2, name: 'fangs' }, bat: { dmg: 1, name: 'fangs' },
    slime: { dmg: 1, name: 'acid' }, ghost: { dmg: 2, name: 'chilling touch' }, giant: { dmg: 4, name: 'huge fists' }, demon: { dmg: 3, name: 'claws' },
    dragon: { dmg: 4, name: 'teeth and claws' }, orc: { dmg: 3, name: 'cleaver' }, goblin: { dmg: 2, name: 'jagged knife' }, kobold: { dmg: 2, name: 'little spear' },
  };

  // ------------------------------------------------------------ hit points
  const isPlayer = g => g && g === state.playerAvatar;
  function hpOf(g) {
    if (isPlayer(g) || g === 'player') { const p = state.player; p.maxHp ??= 20; p.hp ??= p.maxHp; return { hp: p.hp, max: p.maxHp }; }
    const c = getBrainConfig(g.id); c.maxHp ??= 10; c.hp ??= c.maxHp; return { hp: c.hp, max: c.maxHp };
  }
  function setHp(g, hp) {
    if (isPlayer(g) || g === 'player') { state.player.hp = Math.max(0, Math.min(state.player.maxHp ?? 20, hp)); renderPlayerHp(); return; }
    const c = getBrainConfig(g.id); setBrainConfig(g.id, { hp: Math.max(0, Math.min(c.maxHp ?? 10, hp)) });
  }
  function itemsOf(g) { return isPlayer(g) ? state.player.items : (charInventory(g).items || []); }
  function wielded(g) { return isPlayer(g) ? state.player.wielding || null : getBrainConfig(g.id).wielding || null; }
  function nameOf(g) { return isPlayer(g) ? (document.getElementById('chatName')?.value.trim() || 'the player') : g.id; }

  // The result line the actor's model reads back, plus a badge.
  function narrate(g, text) {
    const h = state.globalHistory;
    if (h?.length && !isPlayer(g)) { const last = h[h.length - 1]; if (last.startsWith('T') && last.includes(g.id + ':')) h[h.length - 1] = last + ' -> ' + text; }
    log(text);
  }
  // The struck character's next prompt hears about it; it answers now if idle.
  function tellVictim(victim, text) {
    if (isPlayer(victim)) { window.tablefolkToast?.(text, { type: 'error' }); return; }
    const c = getBrainConfig(victim.id);
    setBrainConfig(victim.id, { pendingChat: (c.pendingChat || []).concat([text]).slice(-5) });
    try { window.dispatchEvent(new CustomEvent('tablefolk-attacked', { detail: { agentId: victim.id } })); } catch {}
  }
  const withA = name => name === 'fists' ? 'bare fists' : (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;
  // Characters within earshot see the fight (and may join in or flee).
  function tellWitnesses(attacker, victim, text) {
    const range = state.earshot || 6;
    for (const o of state.characters) {
      if (o === attacker || o === victim || o.defeated) continue;
      if (gap(o, victim) >= range && gap(o, attacker) >= range) continue;
      const c = getBrainConfig(o.id);
      setBrainConfig(o.id, { pendingChat: (c.pendingChat || []).concat([text]).slice(-5) });
    }
  }
  function floatText(g, text, color = '#ff5a4a') {
    try { emitBadge(g, text); } catch {}
  }

  // ------------------------------------------------------------ weapon models
  const mats = {};
  function mat(name, color, metallic = 0, rough = .5) {
    if (mats[name] && !mats[name].isDisposed?.()) return mats[name];
    const m = new BABYLON.PBRMaterial('weapon_' + name, state.scene);
    m.albedoColor = new BABYLON.Color3(...color); m.metallic = metallic; m.roughness = rough; m.maxSimultaneousLights = 8;
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
    return mats[name] = m;
  }
  // A weapon built from primitives, grip at the origin, pointing up +y.
  function weaponMesh(kind) {
    const sc = state.scene, root = new BABYLON.TransformNode('weapon_' + kind, sc), parts = [];
    const steel = mat('steel', [.86, .88, .92], .55, .3), wood = mat('haft', [.36, .22, .12], 0, .8), gold = mat('brass', [.83, .62, .25], .85, .35), leather = mat('grip', [.2, .12, .07], 0, .9);
    const box = (n, w, h, d, y, m, x = 0, z = 0) => { const b = BABYLON.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, sc); b.position.set(x, y, z); b.material = m; parts.push(b); return b; };
    const cyl = (n, dia, h, y, m) => { const c = BABYLON.MeshBuilder.CreateCylinder(n, { diameter: dia, height: h, tessellation: 8 }, sc); c.position.y = y; c.material = m; parts.push(c); return c; };
    if (kind === 'sword' || kind === 'dagger') {
      const L = kind === 'dagger' ? .26 : .62;
      cyl('grip', .045, .14, 0, leather);
      box('guard', kind === 'dagger' ? .12 : .2, .035, .05, .085, gold);
      box('blade', .07, L, .02, .1 + L / 2, steel);
      const tip = BABYLON.MeshBuilder.CreateCylinder('tip', { diameterTop: 0, diameterBottom: .078, height: .07, tessellation: 4 }, sc);
      tip.position.y = .1 + L + .035; tip.scaling.z = .18; tip.rotation.y = Math.PI / 4; tip.material = steel; parts.push(tip);
      const pommel = BABYLON.MeshBuilder.CreateSphere('pommel', { diameter: .055, segments: 6 }, sc); pommel.position.y = -.08; pommel.material = gold; parts.push(pommel);
    } else if (kind === 'axe') {
      cyl('haft', .04, .58, .2, wood);
      box('head', .2, .12, .025, .44, steel, .08);
    } else if (kind === 'spear') {
      cyl('shaft', .035, .95, .3, wood);
      const tip = BABYLON.MeshBuilder.CreateCylinder('spearhead', { diameterTop: 0, diameterBottom: .07, height: .16, tessellation: 4 }, sc); tip.position.y = .85; tip.material = steel; parts.push(tip);
    } else {
      cyl('haft', .045, .48, .16, wood);
      const head = BABYLON.MeshBuilder.CreateCylinder('head', { diameter: .1, height: .16, tessellation: 8 }, sc); head.position.y = .42; head.material = kind === 'club' ? wood : steel; parts.push(head);
    }
    for (const p of parts) { p.parent = root; p.isPickable = false; try { addShadow(p); } catch {} }
    return root;
  }
  // Right hand: the rig's hand slot (KayKit "handslot.r") or any right-hand bone.
  function handNode(g) {
    const sk = g.root.getChildMeshes().find(m => m.skeleton)?.skeleton;
    const bones = sk?.bones || [];
    // else a wrist, or the end of a simple arm (Quaternius creatures: Arm.R_end)
    const b = bones.find(b => b.name === 'handslot.r') || bones.find(b => /hand.*(\.r|_r|right)|right.*hand|r.*hand$/i.test(b.name))
      || bones.find(b => /^wrist[._]?r$/i.test(b.name)) || bones.find(b => /^arm[._]r_end$/i.test(b.name)) || bones.find(b => /^(lower|fore)arm[._]?r$/i.test(b.name));
    return b?.getTransformNode?.() || null;
  }
  function showWeapon(g, w) {
    if (g._weaponMesh) { g._weaponMesh.dispose(false, true); g._weaponMesh = null; }
    if (!w) return;
    const m = weaponMesh(w.kind), node = handNode(g);
    if (node) {
      m.parent = node;
      // Hand slots carry the rig's scale; size the weapon in world units.
      node.computeWorldMatrix(true);
      const s = node.absoluteScaling ? Math.abs(node.absoluteScaling.y) || 1 : 1;
      m.scaling.setAll(1 / s);
    } else {
      m.parent = g.root; m.position.set(-.22, .45, .1); m.rotation.x = Math.PI / 2.4;
    }
    g._weaponMesh = m;
  }

  // ------------------------------------------------------------ commands
  function wield(g, item) {
    const want = String(item || '').trim().replace(/^["']|["']$/g, '');
    if (!want || /^(none|nothing|fists?|away)$/i.test(want)) {
      if (isPlayer(g)) state.player.wielding = null; else setBrainConfig(g.id, { wielding: null });
      showWeapon(g, null); narrate(g, `${nameOf(g)} puts the weapon away`); return;
    }
    const have = findItem(itemsOf(g).filter(i => (i.qty ?? 1) > 0), want);
    if (!have) { narrate(g, `wield failed: ${nameOf(g)} has no ${want}`); if (isPlayer(g)) window.tablefolkToast?.(`you have no ${want}`, { type: 'error' }); return; }
    const w = weaponFor(have.name) || { dmg: 2, kind: 'club', name: have.name };
    if (isPlayer(g)) state.player.wielding = have.name; else setBrainConfig(g.id, { wielding: have.name });
    showWeapon(g, w); floatText(g, 'wields ' + have.name, '#ffd27a');
    narrate(g, `${nameOf(g)} wields the ${have.name} (${w.dmg} damage)`);
    renderPlayerHp();
  }

  function others(g) { return state.characters.concat(state.playerAvatar ? [state.playerAvatar] : []).filter(o => o && o !== g && !o.defeated); }
  const gap = (a, b) => Math.hypot(a.root.position.x - b.root.position.x, a.root.position.z - b.root.position.z);
  function resolveTarget(g, target) {
    const t = String(target || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
    const list = others(g);
    if (!t) return list.filter(o => gap(g, o) <= REACH).sort((a, b) => gap(g, a) - gap(g, b))[0] || null;
    if (state.playerAvatar && (t === 'player' || t === 'you' || t === nameOf(state.playerAvatar).toLowerCase())) return state.playerAvatar.defeated ? null : state.playerAvatar;
    return list.find(o => o.id?.toLowerCase() === t) || list.find(o => o.id?.toLowerCase().includes(t)) || null;
  }

  function attack(g, target) {
    if (g.defeated) return;
    const v = resolveTarget(g, target);
    if (!v) { narrate(g, `attack failed: no ${target || 'one'} to attack${target ? '' : ' within reach'}`); if (isPlayer(g)) window.tablefolkToast?.(target ? `no ${target} here` : 'nobody within reach', { type: 'error' }); return; }
    const d = gap(g, v);
    if (d > REACH) { narrate(g, `attack failed: ${nameOf(v)} is ${d.toFixed(1)} cells away; walk next to them first`); if (isPlayer(g)) window.tablefolkToast?.(`${nameOf(v)} is too far away`, { type: 'error' }); return; }
    const nat = !isPlayer(g) && NATURAL[g.charModel];
    const wName = wielded(g), w = (wName && weaponFor(wName)) || (wName ? { dmg: 2, kind: 'club', name: wName } : nat ? { ...nat, kind: 'natural' } : { dmg: isPlayer(g) ? 2 : 1, kind: 'fists', name: 'fists' });
    // face the target and swing
    try { setCharacterFacing(g, new BABYLON.Vector3(v.root.position.x - g.root.position.x, 0, v.root.position.z - g.root.position.z).normalize()); } catch {}
    const clip = w.kind === 'fists' ? ['Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Attack_Kick'] : w.two ? ['Melee_2H_Attack_Chop', 'Melee_2H_Attack_Slice'] : w.kind === 'dagger' || w.kind === 'spear' ? ['Melee_1H_Attack_Stab'] : ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Attack_Slice_Horizontal'];
    playClip(g, clip, 900);
    const miss = Math.random() < .15, dmg = miss ? 0 : w.dmg + (Math.random() < .35 ? 1 : 0);
    const who = nameOf(g), whom = nameOf(v);
    const wThe = w.kind === 'natural' ? 'its ' + w.name : w.name === 'fists' ? 'bare fists' : 'the ' + w.name, wA = w.kind === 'natural' ? 'its ' + w.name : withA(w.name);
    // the player's swing is a turn: nearby characters act after it (play.js)
    if (isPlayer(g)) setTimeout(() => window.tablefolkPlay?.acted('attack'), 450);
    setTimeout(() => {
      if (v.defeated) return;
      window.tablefolkSfx?.play(miss ? 'miss' : 'hit', v.root.position);
      if (miss) { floatText(v, 'miss', '#cccccc'); narrate(g, `${who} swings at ${whom} with ${wThe} and misses`); tellVictim(v, `[event] ${who} attacks you with ${wA} and misses!`); tellWitnesses(g, v, `[event] ${who} attacks ${whom} with ${wA} and misses.`); return; }
      const { hp, max } = hpOf(v), left = Math.max(0, hp - dmg);
      setHp(v, left); floatText(v, '-' + dmg);
      if (isPlayer(v)) window.tablefolkPlay?.hurtFlash();
      playClip(v, ['Hit_A', 'Hit_B'], 500);
      if (!left) {
        narrate(g, `${who} hits ${whom} with ${wThe} for ${dmg}: ${whom} is defeated`);
        defeat(v, who);
        tellWitnesses(g, v, `[event] ${who} strikes down ${whom} with ${wA}. ${whom} is defeated.`);
      } else {
        narrate(g, `${who} hits ${whom} with ${wThe} for ${dmg} (${whom}: ${left}/${max} health)`);
        tellVictim(v, `[event] ${who} attacks you with ${wA}! You lose ${dmg} health (${left}/${max} left).`);
        tellWitnesses(g, v, `[event] ${who} attacks ${whom} with ${wA} (${whom}: ${left}/${max} health).`);
      }
    }, 380);
  }

  // Damage or healing from anything else (spells, skills): `by` is the name
  // of who did it, `how` a phrase ("a fireball").
  function hurt(v, dmg, by = 'something', how = '') {
    if (!v || v.defeated || dmg <= 0) return 0;
    const { hp, max } = hpOf(v), left = Math.max(0, hp - dmg), whom = nameOf(v);
    setHp(v, left); floatText(v, '-' + dmg);
    if (isPlayer(v)) window.tablefolkPlay?.hurtFlash();
    playClip(v, ['Hit_A', 'Hit_B'], 500);
    if (!left) { defeat(v, by); tellWitnesses({ root: { position: v.root.position } }, v, `[event] ${by} strikes down ${whom}${how ? ' with ' + how : ''}.`); }
    else tellVictim(v, `[event] ${by} hits you${how ? ' with ' + how : ''}! You lose ${dmg} health (${left}/${max} left).`);
    return dmg;
  }
  function heal(v, n) {
    if (!v || v.defeated || n <= 0) return 0;
    const { hp, max } = hpOf(v), to = Math.min(max, hp + n);
    setHp(v, to); floatText(v, '+' + (to - hp));
    return to - hp;
  }

  function playClip(g, names, ms) {
    if (!g?.rigged || !g.rigAnims) return;
    const ag = names.map(n => g.rigAnims[n]).find(Boolean); if (!ag) return;
    g.activeRigAnim?.stop(); ag.start(false, 1.0, ag.from, ag.to, false); g.activeRigAnim = ag; g.rigMode = 'combat';
    clearTimeout(g._clipTimer);
    g._clipTimer = setTimeout(() => { if (g.rigMode === 'combat' && !g.defeated) { g.rigMode = null; playRig(g, 'idle', true); } }, ms);
  }

  function defeat(v, by) {
    v.defeated = true;
    try { window.tablefolkTTS?.silence?.(v); } catch {}
    try { clearStreamingBubble(v); } catch {}
    if (v._weaponMesh) showWeapon(v, null);
    const dead = ['Death_A', 'Death_B'].map(n => v.rigAnims?.[n]).find(Boolean);
    clearTimeout(v._clipTimer);
    if (dead) { v.activeRigAnim?.stop(); dead.start(false, 1.0, dead.from, dead.to, false); v.activeRigAnim = dead; v.rigMode = 'defeated'; }
    else v.root.rotation.z = Math.PI / 2;
    floatText(v, 'defeated');
    if (isPlayer(v)) {
      window.tablefolkToast?.('You were defeated by ' + by, { type: 'error' });
      renderPlayerHp();
    } else {
      setBrainConfig(v.id, { defeated: true });
      // its wielded weapon falls to the ground
      const w = getBrainConfig(v.id).wielding;
      if (w) setBrainConfig(v.id, { wielding: null });
    }
    try { window.dispatchEvent(new CustomEvent('tablefolk-defeated', { detail: { id: isPlayer(v) ? 'player' : v.id, by } })); } catch {}
    try { updatePerceptionUI(); } catch {}
  }

  // A line for the character's own prompt and a word for others it sees.
  function selfLine(g) {
    const { hp, max } = hpOf(g), w = wielded(g);
    return `Your health: ${hp}/${max}${w ? `. Wielding: ${w}` : ''}.`;
  }
  function statusWord(g) {
    if (g.defeated) return 'defeated';
    const { hp, max } = hpOf(g);
    return hp < max ? `hurt ${hp}/${max}` : '';
  }

  // ------------------------------------------------------------ the player
  function renderPlayerHp() {
    let el = document.getElementById('playerHp');
    if (!el) {
      const dock = document.getElementById('playerItems'); if (!dock) return;
      el = document.createElement('div'); el.id = 'playerHp'; el.className = 'player-hp';
      dock.parentNode.insertBefore(el, dock);
    }
    if (!state.playerAvatar) { el.hidden = true; return; }
    const { hp, max } = hpOf('player'), w = state.player.wielding;
    el.hidden = false;
    el.innerHTML = `<span class="hp-label">Health</span><span class="hp-bar"><span style="width:${Math.round(100 * hp / max)}%"></span></span><span class="hp-num">${hp}/${max}</span>${w ? `<span class="hp-weapon">⚔ ${String(w).replace(/[<&>]/g, '')}</span>` : ''}`;
    el.classList.toggle('down', !!state.playerAvatar?.defeated);
  }
  // "/attack gob1", "/wield sword", "/unwield" from the chat box.
  function playerCommand(text) {
    const g = state.playerAvatar;
    if (!g) { window.tablefolkToast?.('you need an avatar to fight', { type: 'error' }); return true; }
    if (g.defeated) { window.tablefolkToast?.('you are defeated', { type: 'error' }); return true; }
    if (state.npcBusy) { window.tablefolkToast?.('wait for the others to finish their turn'); return true; }
    const m = String(text).match(/^\/(attack|hit|strike|wield|equip|unwield)\b\s*(.*)$/i);
    if (!m) return false;
    const verb = m[1].toLowerCase(), arg = m[2].trim();
    if (verb === 'wield' || verb === 'equip') wield(g, arg);
    else if (verb === 'unwield') wield(g, 'none');
    else attack(g, arg);
    return true;
  }
  addEventListener('keydown', e => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
    const g = state.playerAvatar; if (!g || g.defeated || state.npcBusy) return;
    attack(g, '');
  });

  // A new world (scenario start) resets the player's health and weapon.
  function reset() {
    state.player.maxHp = +state.player.maxHp || 20; state.player.hp = state.player.maxHp; state.player.wielding = null;
    renderPlayerHp();
  }

  window.tablefolkCombat = { attack, wield, hpOf, setHp, defeat, hurt, heal, playClip, nameOf, resolveTarget, selfLine, statusWord, weaponFor, showWeapon, playerCommand, renderPlayerHp, reset, REACH };
})();
