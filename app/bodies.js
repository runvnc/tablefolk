/* bodies.js -- bodies from asset packs and packages (data only: a glTF/GLB
 * with its clips), and named clips on characters.
 *
 * A pack.json or a tablefolk.json may carry "bodies" (scenario skill,
 * reference/api.md "Bodies"):
 *   "bodies": { "dire_wolf": { "model": "models/dire_wolf.glb", "h": 0.95,
 *     "clips": { "idle": "Idle", "walk": "Walk", "run": "Gallop", "attack": "Attack",
 *                "hit": "Idle_HitReact_Left", "death": "Death", "howl": "Idle_2" },
 *     "emotes": ["howl"], "kind": "monster", "mindless": true,
 *     "natural": { "dmg": 2, "name": "fangs" }, "hp": 8, "gender": "m",
 *     "voice": "builtin:jean", "footprint": [1, 2], "lift": 0, "tile": "tiles/dire_wolf.png" } }
 * Each becomes an entry of app.js FIGURES for as long as the scenario that
 * loaded it plays (a package's are forgotten by packages.js reset; a pack's
 * stay, like its items), so "model": "dire_wolf" works for agents, the
 * player, threats and api.spawn. createFigure loads it from its URL and maps
 * its "clips" onto the clip names the game asks for (idle, walk, run, attack,
 * hit, death, sit, sleep, work, talk, cast, pickup); a name the game does
 * not know is a custom clip, played with emote(name) when it is in "emotes"
 * or by code with playClip(g, name). Missing clips fall back as for the
 * built-in bodies (idle for anything, the procedural emotes).
 *
 *   window.tablefolkBodies = { add(id, def, baseUrl, from), addAll(map, baseUrl, from), remove(id), get(id),
 *     list(), isAnimal(model), isMindless(model), emotesOf(g), playClip(g, name, { loop, ms }), emote(g, name, loop),
 *     mapClips(F, clips, rigAnims) }
 * Loaded after app.js (FIGURES, playRig, emitBadge, log, say are its globals).
 */
(function () {
  const REG = new Map();   // id -> def as given (+ _from)
  // the game's names for a body's clips -> the rig names app.js asks for (FIG_CLIPS, playRig)
  const GAME = {
    idle: ['Idle_A', 'Idle_B'], walk: ['Walking_A', 'Walking_B'], run: ['Running_A', 'Running_B'],
    attack: ['Melee_1H_Attack_Chop', 'Melee_1H_Attack_Stab', 'Melee_2H_Attack_Chop', 'Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Attack_Kick'],
    hit: ['Hit_A', 'Hit_B'], death: ['Death_A'], sit: ['Sit_Floor_Idle', 'Sit_Chair_Idle'], sleep: ['Lie_Idle'],
    work: ['Interact', 'Hammering', 'Working_A', 'Working_B', 'Chopping', 'Pickaxing', 'Use_Item'], talk: ['Waving'], cast: ['Ranged_Magic_Spellcasting', 'Ranged_Magic_Shoot'],
    pickup: ['PickUp'], dance: ['Cheering'], wave: ['Waving'],
  };
  const STANDARD_EMOTES = ['dance', 'laugh', 'sit', 'wave', 'clap', 'cheer', 'sleep', 'bow'];
  const ID = /^[a-z][a-z0-9_]{0,31}$/;

  function add(id, def, baseUrl = location.href, from = '') {
    id = String(id).toLowerCase();
    if (!ID.test(id)) throw new Error(`body "${id}": use lowercase letters, digits and _`);
    if (!def || typeof def.model !== 'string') throw new Error(`body "${id}" needs a "model" (a .glb or .gltf file)`);
    if (FIGURES[id] && !REG.has(id)) throw new Error(`body "${id}" is a built-in body; pick another name`);
    const h = Number.isFinite(+def.h) && +def.h > 0 ? Math.min(6, +def.h) : 1.3;
    const F = { url: new URL(def.model, baseUrl).href, h, v: def.version || '1', pkg: from || 'pack',
      lift: +def.lift || 0, ry: +def.ry || 0,
      clips: def.clips && typeof def.clips === 'object' ? Object.fromEntries(Object.entries(def.clips).filter(([k, v]) => /^[a-z][a-z0-9_]*$/i.test(k) && typeof v === 'string')) : {},
      emotes: Array.isArray(def.emotes) ? def.emotes.map(e => String(e).toLowerCase()).filter(e => /^[a-z][a-z0-9_]*$/.test(e)) : [],
      kind: ['person', 'monster', 'animal'].includes(def.kind) ? def.kind : 'person',
      gender: ['f', 'm', 'n'].includes(def.gender) ? def.gender : 'n',
      ...(typeof def.voice === 'string' ? { voice: def.voice } : {}),
      ...(def.mindless != null ? { mindless: !!def.mindless } : {}),
      ...(def.natural && Number.isFinite(+def.natural.dmg) ? { natural: { dmg: Math.max(0, +def.natural.dmg), name: String(def.natural.name || 'bite') } } : {}),
      ...(Number.isFinite(+def.hp) && +def.hp > 0 ? { hp: +def.hp } : {}),
      ...(Array.isArray(def.footprint) && def.footprint.length === 2 && def.footprint.every(n => Number.isFinite(+n) && +n > 0) ? { footprint: def.footprint.map(Number) } : {}),
      ...(typeof def.tile === 'string' ? { tile: new URL(def.tile, baseUrl).href } : {}),
      ...(def.mouth ? { mouth: true } : {}) };
    FIGURES[id] = F; REG.set(id, { ...def, _from: from });
    return id;
  }
  function addAll(map, baseUrl, from = '') {
    const ids = [];
    for (const [id, def] of Object.entries(map && typeof map === 'object' ? map : {})) {
      try { ids.push(add(id, def, baseUrl, from)); } catch (e) { console.warn('[bodies]', e.message); }
    }
    if (ids.length) console.log(`[bodies] ${from || 'pack'}: ${ids.join(', ')}`);
    return ids;
  }
  function remove(id) { if (REG.has(id)) { REG.delete(id); delete FIGURES[id]; } }
  const get = id => (REG.has(id) ? FIGURES[id] : null);
  const list = () => [...REG.keys()];
  const isAnimal = m => get(m)?.kind === 'animal' && get(m)?.mindless !== false;
  const isMindless = m => { const F = get(m); return !!F && (F.mindless ?? F.kind === 'monster'); };

  // createFigure: the body's "clips" become the names the game asks for
  function mapClips(F, clips, rigAnims) {
    const find = name => clips[name] || Object.entries(clips).find(([k]) => k.toLowerCase() === String(name).toLowerCase())?.[1];
    for (const [game, file] of Object.entries(F.clips || {})) {
      const ag = find(file); if (!ag) { console.warn(`[bodies] clip "${file}" (${game}) is not in the model`); continue; }
      for (const n of GAME[game] || []) rigAnims[n] = ag;
      rigAnims[game] = ag;   // the game name itself (custom ones: emote(howl), playClip(g, "howl"))
    }
  }

  // ---- named clips on characters ----
  // the emotes a character can play: the standard ones (a clip or the
  // procedural fallback) and its body's own
  function emotesOf(g) {
    const F = g && FIGURES[g.charModel];
    return [...STANDARD_EMOTES, ...(F?.emotes || [])];
  }
  const clipOf = (g, name) => { const n = String(name).toLowerCase(), r = g?.rigAnims || {}; return r[name] || r[n] || Object.entries(r).find(([k]) => k.toLowerCase() === n)?.[1] || null; };
  // Play one clip on a character by name (a body's clip map name, or the
  // file's own clip name). Once: back to idle when it ends; loop: until the
  // next action. -> true when the character has that clip.
  // the game's own animation modes (app.js playRig): any body has a clip for them, or idle
  const MODES = new Set(['idle', 'walk', 'panic', 'talk', 'cast', 'push', 'carry', 'throw', 'dig', 'repair', 'bonk', 'dance', 'laugh', 'sit', 'wave', 'clap', 'cheer', 'sleep', 'bow', 'hammer', 'saw', 'stir', 'chop', 'mine', 'drink', 'read', 'train', 'pickup', 'open']);
  function playClip(g, name, { loop = false, ms = null } = {}) {
    if (!g?.rigged) return false;
    const ag = clipOf(g, name);
    if (!ag) {
      // a mode name ("pickup", "wave", "hammer"): the body's clip for it, through playRig
      const mode = String(name).toLowerCase(); if (!MODES.has(mode)) return false;
      if (g._clipTimer) { clearTimeout(g._clipTimer); g._clipTimer = null; }
      g.rigMode = null; playRig(g, mode, !!loop); g.anim = mode;
      if (!loop) g._clipTimer = setTimeout(() => { g._clipTimer = null; if (g.anim === mode) { g.anim = 'idle'; playRig(g, 'idle', true); } }, ms ?? 1800);
      (g._clipsPlayed ||= []).push(mode); if (g._clipsPlayed.length > 20) g._clipsPlayed.shift();
      return true;
    }
    try { g.activeRigAnim?.stop(); } catch {}
    if (g._clipTimer) { clearTimeout(g._clipTimer); g._clipTimer = null; }
    ag.start(!!loop, 1.0, ag.from, ag.to, false);
    g.activeRigAnim = ag; g.rigMode = 'clip_' + name; g.anim = 'clip_' + name; g.emote = null;
    g._lastRigAnimName = ag.name;
    if (!loop) {
      const fps = ag.targetedAnimations?.[0]?.animation?.framePerSecond || 30;
      const dur = ms ?? Math.max(600, ((ag.to - ag.from) / fps) * 1000);
      g._clipTimer = setTimeout(() => { g._clipTimer = null; if (g.anim === 'clip_' + name) { g.anim = 'idle'; g.rigMode = null; playRig(g, 'idle', true); } }, dur);
    }
    (g._clipsPlayed ||= []).push(String(name));   // what played (tests, the dev console)
    if (g._clipsPlayed.length > 20) g._clipsPlayed.shift();
    return true;
  }
  // emote(name) / emote(name, loop) on a body that has the clip: -> true when played
  function emote(g, name, loop = false) {
    const F = g && FIGURES[g.charModel];
    const n = String(name || '').toLowerCase();
    if (!F?.emotes?.includes(n) && !(F?.clips && n in F.clips && !STANDARD_EMOTES.includes(n))) return false;
    if (!playClip(g, n, { loop })) return false;
    try { emitBadge(g, n); log(`${g.id} emotes: ${n}`); } catch {}
    return true;
  }

  window.tablefolkBodies = { add, addAll, remove, get, list, isAnimal, isMindless, emotesOf, playClip, emote, mapClips, GAME, registry: REG };
})();
