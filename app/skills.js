/* skills.js -- skills: installable abilities for characters (and the player).
 *
 * A skill is a folder with a skill.json manifest (and optionally a JS
 * module). A scenario names the skills it uses and gives them to characters:
 *
 *   "skills": ["magic", "thievery", "npm:tablefolk-skill-alchemy@1"],
 *   "agents": [{ "id": "vexa", "skills": ["magic"],
 *                "skillParams": { "magic": { "spells": ["spark", "heal"], "mana": 12 } } }],
 *   "player": { "skills": ["magic"] }
 *
 * Where skills come from (see docs/SKILLS.md):
 *   magic                    built-in: <app>/../skills/magic/skill.json
 *   https://.../skill.json   any URL (CORS)
 *   npm:pkg@1.2              npm through jsDelivr: cdn.jsdelivr.net/npm/pkg@1.2/skill.json
 *   gh:user/repo@tag/dir     GitHub through jsDelivr
 *
 * Manifest (data only, safe from anywhere):
 *   id, name, version, description
 *   commands: { cast: { usage, example, help, variants: "spellbook", param: "spells" } }
 *       a command's first argument picks an entry of the table named by
 *       "variants" (e.g. cast(fireball, gob1) -> spellbook.fireball); without
 *       variants the command itself has "effects"
 *   <table>: { fireball: { cost: {mana: 5}, range: 5, target: "other"|"self"|"any"|"none",
 *              cooldown: 2, effects: [...], text: "{{me}} hurls a fireball at {{target}}" } }
 *   params:  defaults a scenario can override per character (e.g. which spells)
 *   state:   per-character resources, e.g. { "mana": 10, "maxMana": 10 }
 *   regen:   per own turn, e.g. { "mana": 1 } (capped by maxMana)
 *   prompt:  a line for the character's prompt, with {{params}} and {{state}}
 *   module:  optional "skill.js" exporting default (api) => ({ effects, commands });
 *            loaded only from this site, or anywhere with ?trustSkills=1
 *
 * Effects: { vfx: spark|fireball|glow|ring }, { damage: N }, { heal: N },
 * { burn: N } (fire on things around the target), { light: { intensity,
 * range, seconds } }, { steal: { chance } }, { give: "item" } (to the user),
 * { take: "item" } (consumed from the user), { say: "text" }, { push: N }.
 */
(function () {
  const reg = new Map();          // id -> manifest (+ .api from a module)
  const urlFor = ref => window.tablefolkPackages.refUrl(ref, 'skill');
  async function loadOne(ref) {
    const url = urlFor(ref);
    for (const m of reg.values()) if (m._url === url) return m;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`skill ${ref}: ${r.status} at ${url}`);
    return register(await r.json(), url, ref);
  }
  // Add a skill manifest (fetched, or inline in a package).
  async function register(m, url = '', ref = m?.id) {
    if (!m || !m.id) throw new Error(`skill ${ref}: manifest has no "id"`);
    m._url = url; m._ref = String(ref);
    if (m.module) {
      const mod = new URL(m.module, url || location.href);
      if (window.tablefolkPackages.trusted(mod.href)) {
        try { const x = await import(mod.href); m.api = (x.default || x.register)?.(api()) || {}; }
        catch (e) { console.warn('skill module failed', m.id, e); }
        for (const [name, b] of Object.entries(m.api?.behaviours || {})) window.tablefolkRoles?.addBehaviour(name, b);
      } else console.warn(`skill ${m.id}: code module from ${mod.origin} not loaded (open with ?trustSkills=1 to allow)`);
    }
    reg.set(m.id, m);
    return m;
  }
  // Load everything a scenario names (top level, agents, player); returns warnings.
  async function load(scn) {
    const refs = new Set([...(scn.skills || []), ...(scn.agents || []).flatMap(a => a.skills || []), ...(scn.player?.skills || [])].map(String));
    const warnings = [];
    await Promise.all([...refs].map(r => loadOne(r).catch(e => warnings.push(e.message))));
    return warnings;
  }
  // A ref ("magic", a URL...) -> the loaded manifest's id.
  const idOf = ref => { for (const m of reg.values()) if (m._ref === String(ref) || m.id === String(ref)) return m.id; return null; };

  // ------------------------------------------------------------ per character
  const isPlayer = g => g === state.playerAvatar;
  function store(g) {
    if (isPlayer(g)) return (state.player.skillData ||= {});
    const c = getBrainConfig(g.id); c.skillData ||= {}; return c.skillData;
  }
  function skillsOf(g) {
    const list = isPlayer(g) ? state.player.skills : getBrainConfig(g.id).skills;
    return (list || []).map(idOf).filter(Boolean).map(id => reg.get(id));
  }
  // Give skills to a character: params from the scenario, fresh state.
  function grant(g, refs, params = {}) {
    const ids = (refs || []).map(idOf).filter(Boolean);
    if (isPlayer(g)) state.player.skills = ids; else setBrainConfig(g.id, { skills: ids });
    const data = store(g);
    for (const id of ids) {
      const m = reg.get(id), p = { ...(m.params || {}), ...(params[id] || params[m._ref] || {}) };
      const st = { ...(m.state || {}) };
      for (const k of Object.keys(st)) if (p[k] != null && typeof p[k] === 'number') { st[k] = p[k]; if (st['max' + k[0].toUpperCase() + k.slice(1)] != null) st['max' + k[0].toUpperCase() + k.slice(1)] = p[k]; }
      data[id] = { params: p, state: st, cooldown: {} };
    }
  }
  function fill(tpl, vars) { return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => { const v = vars[k]; return v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v); }); }

  // Lines for the character's prompt and command list.
  function promptLines(g) {
    const out = [], data = store(g);
    for (const m of skillsOf(g)) if (m.prompt) { const d = data[m.id] || {}; out.push(fill(m.prompt, { ...d.params, ...d.state, me: g.id })); }
    return out;
  }
  function commandLines(g) {
    const out = [], data = store(g);
    for (const m of skillsOf(g)) for (const [name, c] of Object.entries(m.commands || {})) {
      const d = data[m.id] || {}, known = c.param ? d.params?.[c.param] : null;
      out.push(`${c.usage || name + '()'}${c.example ? ' e.g. ' + c.example : ''}${c.help ? ' - ' + c.help : ''}${known ? ' (yours: ' + [].concat(known).join(', ') + ')' : ''}`);
    }
    return out;
  }
  // State-card lines a skill names ("card": ["wares", "offer"]): providers
  // from the game (trade.js adds wares and offer) or the skill's own module.
  const cards = {};
  function cardLines(g) {
    const out = [], data = store(g);
    for (const m of skillsOf(g)) for (const name of m.card || []) {
      const fn = m.api?.cards?.[name] || cards[name];
      if (!fn) continue;
      try { const r = fn(g, data[m.id] || {}); for (const l of [].concat(r || [])) if (l) out.push(String(l)); } catch (e) { console.warn('skill card', m.id, name, e); }
    }
    return out;
  }
  // The game's own commands a skill unlocks ("allow": ["sell", "inventory"]).
  const allowedBy = g => skillsOf(g).flatMap(m => m.allow || []);
  const has = (g, id) => skillsOf(g).some(m => m.id === id);
  function commandFor(g, name) {
    for (const m of skillsOf(g)) if (m.commands?.[name]) return { m, c: m.commands[name] };
    return null;
  }
  // Is `name` a skill command of anyone (for the parser)?
  const isCommand = name => [...reg.values()].some(m => m.commands?.[name]);

  // ------------------------------------------------------------ running
  const others = g => state.characters.concat(state.playerAvatar ? [state.playerAvatar] : []).filter(o => o && o !== g);
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const posOf = o => o.root ? o.root.position : (o.getAbsolutePosition?.() || o.position);
  const nameOf = o => isPlayer(o) ? (document.getElementById('chatName')?.value.trim() || 'the player') : o.id;
  function findTarget(g, word) {
    const t = String(word || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (!t || ['me', 'self', 'myself', g.id?.toLowerCase()].includes(t)) return { who: g, kind: 'self' };
    if (state.playerAvatar && (t === 'player' || t === 'you' || t === nameOf(state.playerAvatar).toLowerCase())) return { who: state.playerAvatar, kind: 'person' };
    const p = others(g).find(o => o.id?.toLowerCase() === t) || others(g).find(o => o.id?.toLowerCase().includes(t));
    if (p) return { who: p, kind: 'person' };
    const objs = getObjects().filter(o => o.type === t.replace(/\s+/g, '_') || o.type.includes(t.replace(/\s+/g, '_')));
    const me = posOf(g); objs.sort((a, b) => gap(a, me) - gap(b, me));
    if (objs[0]) return { thing: objs[0], kind: 'thing', pos: { x: objs[0].x, z: objs[0].z } };
    return null;
  }
  function narrate(g, text) {
    const h = state.globalHistory;
    if (h?.length && !isPlayer(g)) { const last = h[h.length - 1]; if (last.startsWith('T') && last.includes(g.id + ':')) h[h.length - 1] = last + ' -> ' + text; }
    log(text);
    if (isPlayer(g)) window.tablefolkToast?.(text);
  }
  const fail = (g, text) => { narrate(g, text); return false; };

  const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);
  const EFFECTS = {
    vfx(g, v, tgt) {
      const from = posOf(g), to = tgt.pos ? V3(tgt.pos.x, .4, tgt.pos.z) : tgt.who ? posOf(tgt.who).add(V3(0, .4, 0)) : from;
      if (v === 'fireball') fireballVfx(from.add(V3(0, .85, 0)), to);
      else if (v === 'ring' || v === 'spark') makeRing(to, v === 'spark' ? state.materials.magic : state.materials.fire);
      else if (v === 'glow') makeRing(to, state.materials.magic);
      try { playRig(g, 'cast', false); setTimeout(() => playRig(g, 'idle', true), 900); } catch {}
    },
    damage(g, n, tgt, how) { if (tgt.who && tgt.who !== g) window.tablefolkCombat?.hurt(tgt.who, +n, nameOf(g), how); else if (tgt.thing) damage(tgt.thing.mesh, +n, 'spark'); },
    heal(g, n, tgt) { const w = tgt.who || g; return window.tablefolkCombat?.heal(w, +n); },
    burn(g, n, tgt) {
      const c = tgt.pos || (tgt.who ? posOf(tgt.who) : posOf(g));
      for (const m of state.props.concat(state.blocks)) if (!m.isDisposed?.() && Math.hypot(m.position.x - c.x, m.position.z - c.z) < 1.8) damage(m, meta(m)?.flammable ? +n : Math.max(1, +n - 1), 'fire');
    },
    light(g, o) {
      const L = new BABYLON.PointLight('skill_light', posOf(g).add(V3(0, 1.4, 0)), state.scene);
      L.diffuse = new BABYLON.Color3(1, .9, .7); L.intensity = +o?.intensity || 3; L.range = +o?.range || 6;
      window.tablefolkScenery?.trackLight(L);
      setTimeout(() => L.dispose(), (+o?.seconds || 60) * 1000);
    },
    push(g, n, tgt) { const c = tgt.pos || (tgt.who ? posOf(tgt.who) : posOf(g)); for (const m of state.props) if (!m.isDisposed() && Math.hypot(m.position.x - c.x, m.position.z - c.z) < 2.5) impulse(m, posOf(g), 4 * (+n || 1), .25); },
    steal(g, o, tgt) {
      const v = tgt.who; if (!v || v === g) return 'nothing to steal from';
      const from = isPlayer(v) ? state.player : getBrainConfig(v.id).inventory || { gold: 0, items: [] };
      const to = isPlayer(g) ? state.player : (getBrainConfig(g.id).inventory ||= { gold: 0, items: [] });
      if (Math.random() > (+o?.chance || .5)) {
        const c = !isPlayer(v) && getBrainConfig(v.id);
        if (c) setBrainConfig(v.id, { pendingChat: (c.pendingChat || []).concat([`[event] ${nameOf(g)} tried to pick your pocket! You caught them.`]).slice(-5) });
        else window.tablefolkToast?.(`${nameOf(g)} tried to pick your pocket!`, { type: 'error' });
        return `${nameOf(g)} fumbles; ${nameOf(v)} notices`;
      }
      const items = (from.items || []).filter(i => (i.qty ?? 1) > 0);
      if (items.length && Math.random() < .6) {
        const it = items[Math.floor(Math.random() * items.length)];
        it.qty = (it.qty ?? 1) - 1; from.items = from.items.filter(i => (i.qty ?? 1) > 0);
        addItem(to.items ||= [], it.name);
        if (!isPlayer(v)) setBrainConfig(v.id, { inventory: from }); if (!isPlayer(g)) setBrainConfig(g.id, { inventory: to });
        inventoryChanged(); return `${nameOf(g)} quietly lifts ${it.name} from ${nameOf(v)}`;
      }
      const gold = Math.min(from.gold || 0, 1 + Math.floor(Math.random() * 5));
      if (!gold) return `${nameOf(v)} has nothing worth taking`;
      from.gold -= gold; to.gold = (to.gold || 0) + gold;
      if (!isPlayer(v)) setBrainConfig(v.id, { inventory: from }); if (!isPlayer(g)) setBrainConfig(g.id, { inventory: to });
      inventoryChanged(); return `${nameOf(g)} quietly lifts ${gold} gold from ${nameOf(v)}`;
    },
    give(g, item) { const inv = isPlayer(g) ? state.player : (getBrainConfig(g.id).inventory ||= { gold: 0, items: [] }); addItem(inv.items ||= [], String(item)); if (!isPlayer(g)) setBrainConfig(g.id, { inventory: inv }); inventoryChanged(); },
    take(g, item) { const inv = isPlayer(g) ? state.player : getBrainConfig(g.id).inventory; const it = inv && findItem(inv.items || [], String(item)); if (it) { it.qty = (it.qty ?? 1) - 1; inv.items = inv.items.filter(i => (i.qty ?? 1) > 0); if (!isPlayer(g)) setBrainConfig(g.id, { inventory: inv }); inventoryChanged(); } },
    say(g, text, tgt) { say(g, fill(text, { me: nameOf(g), target: tgt.who ? nameOf(tgt.who) : tgt.thing?.type || '' }), true); },
  };

  // Run a skill command: cast(fireball, gob1).
  async function run(g, name, args) {
    const found = commandFor(g, name);
    if (!found) return fail(g, `${nameOf(g)} doesn't know how to ${name}`);
    const { m, c } = found, d = store(g)[m.id] || (store(g)[m.id] = { params: { ...(m.params || {}) }, state: { ...(m.state || {}) }, cooldown: {} });
    let entry = c, key = name, rest = args.slice();
    if (c.variants) {
      key = String(rest.shift() || '').toLowerCase().replace(/^["']|["']$/g, '').trim();
      const table = m[c.variants] || {}, mine = c.param ? [].concat(d.params[c.param] || []) : Object.keys(table);
      if (!table[key] || !mine.includes(key)) return fail(g, `${name} failed: ${nameOf(g)} doesn't know "${key}" (knows: ${mine.join(', ')})`);
      entry = table[key];
    }
    if (m.api?.commands?.[name]) return m.api.commands[name](g, [key, ...rest], { manifest: m, data: d, narrate, findTarget });
    const tgtWord = rest[0] || entry.default || (entry.target === 'self' ? 'me' : '');
    const tgt = entry.target === 'none' ? { kind: 'none' } : findTarget(g, tgtWord);
    if (!tgt) return fail(g, `${name} failed: no ${tgtWord} in sight`);
    if (entry.target === 'other' && tgt.kind === 'self') return fail(g, `${name} ${key} needs a target other than yourself`);
    const me = posOf(g), tp = tgt.pos || (tgt.who ? posOf(tgt.who) : me), dist = gap(me, tp);
    if (entry.range && tgt.kind !== 'self' && tgt.kind !== 'none' && dist > entry.range + .2) return fail(g, `${name} failed: ${tgt.who ? nameOf(tgt.who) : tgtWord} is ${Math.round(dist)} steps away (range ${entry.range}); move closer`);
    if ((d.cooldown[key] || 0) > 0) return fail(g, `${name} ${key} isn't ready yet (${d.cooldown[key]} more turns)`);
    for (const [res, n] of Object.entries(entry.cost || {})) if ((d.state[res] ?? 0) < n) return fail(g, `${name} failed: not enough ${res} (${d.state[res] ?? 0}/${n})`);
    for (const it of [].concat(entry.needs || [])) { const inv = isPlayer(g) ? state.player.items : getBrainConfig(g.id).inventory?.items; if (!findItem(inv || [], it)) return fail(g, `${name} failed: needs ${it}`); }
    for (const [res, n] of Object.entries(entry.cost || {})) d.state[res] -= n;
    if (entry.cooldown) d.cooldown[key] = +entry.cooldown;
    if (tgt.who && tgt.who !== g) { try { setCharacterFacing(g, V3(posOf(tgt.who).x - me.x, 0, posOf(tgt.who).z - me.z).normalize()); } catch {} }
    const how = entry.how || (c.variants ? `a ${key} ${name === 'cast' ? 'spell' : ''}`.trim() : name);
    const notes = [];
    for (const e of entry.effects || []) for (const [k, v] of Object.entries(e)) {
      const fn = m.api?.effects?.[k] || EFFECTS[k];
      if (!fn) { notes.push(`(unknown effect ${k})`); continue; }
      const r = await fn(g, v, tgt, how, { manifest: m, data: d });
      if (typeof r === 'string') notes.push(r);
      if (k === 'heal' && typeof r === 'number') notes.push(`${tgt.who ? nameOf(tgt.who) : nameOf(g)} recovers ${r} health`);
    }
    const target = tgt.who ? nameOf(tgt.who) : tgt.thing ? tgt.thing.type.replace(/_/g, ' ') : '';
    narrate(g, [fill(entry.text || `{{me}} uses ${name}${c.variants ? ' ' + key : ''}${target ? ' on {{target}}' : ''}`, { me: nameOf(g), target }), ...notes].filter(Boolean).join('; ') + (Object.keys(entry.cost || {}).length ? ` (${Object.keys(entry.cost).map(r => `${r} ${d.state[r]}`).join(', ')} left)` : ''));
    return true;
  }

  // Each character's own turn: resources come back, cooldowns tick.
  window.addEventListener('tablefolk-agent-turn', e => {
    const g = state.characters.find(c => c.id === e.detail?.agentId); if (!g) return;
    const data = store(g);
    for (const m of skillsOf(g)) {
      const d = data[m.id]; if (!d) continue;
      for (const [res, n] of Object.entries(m.regen || {})) { const max = d.state['max' + res[0].toUpperCase() + res.slice(1)]; d.state[res] = Math.min(max ?? Infinity, (d.state[res] || 0) + n); }
      for (const k of Object.keys(d.cooldown)) d.cooldown[k] = Math.max(0, d.cooldown[k] - 1);
    }
  });

  // "/cast heal me" from the chat box.
  function playerCommand(text) {
    const g = state.playerAvatar; if (!g) return false;
    const m = String(text).match(/^\/(\w+)\s*(.*)$/); if (!m || !commandFor(g, m[1].toLowerCase())) return false;
    run(g, m[1].toLowerCase(), m[2].split(/[\s,]+/).filter(Boolean));
    return true;
  }

  function api() { return { state, narrate, findTarget, combat: window.tablefolkCombat, say, log, getBrainConfig, setBrainConfig, effects: EFFECTS }; }
  window.tablefolkSkills = { load, loadOne, register, grant, skillsOf, has, promptLines, commandLines, cardLines, allowedBy, cards, isCommand, commandFor, run, playerCommand, registry: reg, urlFor };
})();
