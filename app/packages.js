/* packages.js -- shareable packages: one file that can bring object models,
 * skills, roles, workflows and code, published anywhere.
 *
 * References (scenarios, skills, roles all name things this way):
 *   blacksmith               built in: <site>/packages/blacksmith/tablefolk.json
 *                            (skills/<name>/skill.json, roles/<name>/role.json)
 *   https://.../tablefolk.json   any URL (CORS); a folder URL gets the file name added
 *   npm:pkg@1.2[/dir]        npm through jsDelivr: cdn.jsdelivr.net/npm/pkg@1.2/tablefolk.json
 *   gh:user/repo@tag[/dir]   GitHub through jsDelivr
 *
 * tablefolk.json (every section optional; paths are relative to the file):
 *   { "id": "blacksmith", "name": "Blacksmith", "version": "1.0.0",
 *     "description": "...", "author": "...", "license": "CC0-1.0",
 *     "requires": ["npm:tablefolk-ores@1", "../ores/"],  // other packages, loaded first (a relative path: beside this one)
 *     "items":     { "forge": { "file": "models/forge.glb", ..., "loop": "Fire",
 *                    "use": { "anim": "Pump", "text": "{{player}} pumps the bellows", "sound": "chestOpen" } } },
 *     "skills":    { "smithing": { ...skill.json... } } or ["skills/smithing/skill.json"],
 *     "roles":     { "blacksmith": { ...role.json... } } or ["roles/blacksmith/role.json"],
 *     "workflows": { "commission": { ...workflow... } },
 *     "jobs":      { "picker": { ...job.json... } } or ["jobs/picker/job.json"],   // jobs.js
 *     "threats":   { "crows": { who, count, when, every, from, behaviour, ... } },  // threats.js
 *     "uses":      { "loom": { types: ["loom"], anim, time, verb, gives } },       // uses.js register
 *     "lines":     { "sale": ["..."], "raid": { "gruff": ["..."] } },          // chatter.js templated lines
 *     "modules":   ["blacksmith.js"] }                   // code: see below
 * Items may also carry "stock": {item, count, regrow, spent} and "gather":
 * {gives, time, anim, verb} (uses.js), and "station": a kind of use.
 *
 * A scenario loads packages with "packages": ["blacksmith", "npm:..."]; its
 * agents can then use the roles and skills by id, its map the items.
 *
 * Code. A module exports default (api) => ({ behaviours, cards, effects, uses }):
 *   behaviours: { name: { on: 'tablefolk-player-turn', run(g) {} } }  (roles and skills list them)
 *   cards:      { name(g, data) { return 'a state-card line' } }       (skills' "card" list)
 *   effects:    { name(g, value, target, how) {} }                      (skills' effect lists)
 *   uses:       { name(thing, who, ctx) { return true } }               (an item's "use": "name")
 *   threats:    { kind(c, ctx) { return true } }                       (a threat kind's behaviour, threats.js)
 *   designations, powers, resources, demands, weather: God / Dungeon Keeper play (designate.js, powers.js,
 *               orders.js, weather.js); all but powers may also be data in tablefolk.json
 * reset() (scenario.js, before a scenario's packages load) forgets what the
 * last scenario's packages brought: items, jobs, uses, threat kinds,
 * workflows and module additions, so they do not leak into the next one.
 * Data loads from anywhere. Code runs only when it comes from this site,
 * the page has ?trustSkills=1, or the player allowed that package (asked
 * once, remembered in this browser; never asked during tests).
 *
 *   window.tablefolkPackages.load(ref)        -> { id, manifest, warnings }
 *   window.tablefolkPackages.loadAll(refs)    -> warnings
 *   window.tablefolkPackages.refUrl(ref, kind) kind: 'package' | 'skill' | 'role' | 'job' | 'pack'
 *   window.tablefolkPackages.useThing(mesh, who)   what E does on an item with "use"
 */
(function () {
  const ROOT = new URL('../', location.href).href;
  const KINDS = {
    package: { dir: 'packages', file: 'tablefolk.json' },
    job: { dir: 'jobs', file: 'job.json' },
    skill: { dir: 'skills', file: 'skill.json' },
    role: { dir: 'roles', file: 'role.json' },
    pack: { dir: 'assets', file: 'pack.json' },   // an asset pack named like a package (npm:, gh:); the Library pane's refs
  };
  const isRef = r => /^(https?:\/\/|npm:|gh:)/.test(r) || /^[a-z0-9_-]+$/i.test(r);

  function refUrl(ref, kind) {
    const k = KINDS[kind]; if (!k) throw new Error(`unknown package kind "${kind}"`);
    const r = String(ref).trim(), file = k.file;
    if (/^https?:\/\//.test(r)) return r.endsWith('.json') ? r : r.replace(/\/?$/, '/' + file);
    if (r.startsWith('npm:')) return `https://cdn.jsdelivr.net/npm/${r.slice(4).replace(/\/$/, '')}/${file}`;
    if (r.startsWith('gh:')) {
      const m = r.slice(3).match(/^([^/]+\/[^@/]+)(?:@([^/]+))?(\/.*)?$/);
      if (m) return `https://cdn.jsdelivr.net/gh/${m[1]}@${m[2] || 'main'}${(m[3] || '').replace(/\/$/, '')}/${file}`;
    }
    return ROOT + k.dir + '/' + encodeURIComponent(r.toLowerCase().replace(/[^a-z0-9_-]/g, '')) + '/' + file;
  }

  // ---- trust ----
  const TRUST_KEY = 'tablefolkTrustedCode';
  const allowedList = () => { try { return JSON.parse(localStorage.getItem(TRUST_KEY) || '[]'); } catch { return []; } };
  // The package folder a URL belongs to (what trust is granted to).
  const scopeOf = url => { const u = new URL(url, location.href).href; return u.slice(0, u.lastIndexOf('/') + 1); };
  function trusted(url) {
    const u = new URL(url, location.href);
    if (u.origin === location.origin || new URLSearchParams(location.search).has('trustSkills')) return true;
    return allowedList().some(s => u.href.startsWith(s));
  }
  // Ask once per package (or skill) whose code isn't trusted yet. Packages
  // and skills follow the same rule, dialog and remembered answer. A "data
  // only" answer is said plainly (a toast), since parts will not work.
  const asking = new Map();   // scope -> promise (one question per folder, however many modules)
  async function askTrust(m, url, what = 'package') {
    if (trusted(url)) return true;
    const scope = scopeOf(url);
    if (asking.has(scope)) return asking.get(scope);
    const p = (async () => {
      if (noAsk || !window.confirmDialog) return false;
      const ok = await window.confirmDialog(
        `The ${what} "${m.name || m.id}" wants to run its own code (from ${new URL(url).host}). Code can do anything this page can. Allow it?`,
        { title: `Run code from a ${what}?`, confirmText: 'allow code', cancelText: 'data only' }).catch(() => false);
      if (ok) { try { localStorage.setItem(TRUST_KEY, JSON.stringify([...new Set([...allowedList(), scope])])); } catch {} }
      else window.tablefolkToast?.(`${m.name || m.id}: its code was not run (data only). Its things, people and rules are here, but what needs code (${codeParts(m)}) will not work.`, { type: 'warn', ms: 9000 });
      return !!ok;
    })();
    asking.set(scope, p); p.finally(() => setTimeout(() => asking.delete(scope), 0));
    return p;
  }
  const codeParts = m => { const named = Object.entries(m.items || {}).filter(([, it]) => typeof it?.use === 'string').map(([t]) => t.replace(/_/g, ' ')); return named.length ? 'using the ' + named.join(', ') + ', its commands' : 'its commands and behaviours'; };
  function untrust(scope) { try { localStorage.setItem(TRUST_KEY, JSON.stringify(allowedList().filter(s => s !== scope))); } catch {} }

  // ---- what modules add ----
  const uses = {}, workflows = {}, goals = {}, added = { goals: [], behaviours: [], cards: [], effects: [], commands: [], steps: [], items: new Set(), bodies: new Set(), sounds: new Set() };
  // The api handed to a module (and a skill's module): the supported surface,
  // documented in the scenario skill's reference/api.md. Keep it stable.
  function api() {
    const T = () => window.tablefolk;
    return { ...(window.tablefolkSkills?.api?.() || {}), state, meta, playClip,
      toast: (t, type) => window.tablefolkToast?.(t, { type }), addMemory: window.tablefolkMind?.addMemory,
      // a word or icon over a character or thing for a moment ("clang", "+1 firewood")
      badge: (g, text) => { try { emitBadge(g, String(text)); } catch {} },
      sound: (name, pos) => window.tablefolkSfx?.play(name, pos?.root?.position || pos?.position || pos),
      // a command line as that character, as if it chose it (results, clips, memories): await api.runAs('bram', 'walk(anvil)')
      runAs: (id, line) => T()?.runAs?.(typeof id === 'string' ? id : id?.id, line, 'package'),
      spawn: (id, model, x, z, cfg = {}) => spawnCharacterAt(id, model, x, z, cfg),
      things: type => T().getObjects().filter(o => !type || o.type === type),
      people: () => T().getAgents().filter(c => !c.defeated),
      player: () => T().getPlayerAvatar?.() || null,
      inventory: who => who === state.playerAvatar || who === 'player' ? state.player : charInventory(typeof who === 'string' ? T().getAgents().find(c => c.id === who) : who),
      give: (who, item, n = 1) => giveItem(who, item, n), take: (who, item, n = 1) => takeItem(who, item, n),
      flag: (name, value) => value === undefined ? window.tablefolkStory?.get(name) : window.tablefolkStory?.set(name, value),
      clock: () => window.tablefolkClock?.now?.() || null,
      narrator: text => { try { window.tablefolkDirector?.narrate?.(text); } catch {} try { log(text); } catch {} },
      on: (event, fn) => { addEventListener(event, fn); listeners.push([event, fn]); return () => removeEventListener(event, fn); },
      every: (ms, fn) => { const t = setInterval(() => { try { fn(); } catch (e) { console.warn('[package] every', e); } }, Math.max(100, +ms || 1000)); timers.push(t); return t; },
      // a point light in the scene's light budget (scenery.js trackLight): dispose() it when done
      light: (x, z, { y = 1, color = [1, .7, .4], intensity = 2, range = 8 } = {}) => { const L = new BABYLON.PointLight('pkg_light', new BABYLON.Vector3(x, y, z), state.scene); L.diffuse = new BABYLON.Color3(...color); L.intensity = intensity; L.range = range; window.tablefolkScenery?.trackLight?.(L); return L; },
      // the nearest free, walkable cell to (x, z) within r cells, or null
      freeCell: (x, z, r = 4) => { for (let d = 0; d <= r; d++) for (let dx = -d; dx <= d; dx++) for (let dz = -d; dz <= d; dz++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue; const cx = Math.round(x) + dx, cz = Math.round(z) + dz; if (cellPassable(cx, cz) && !occupantAt(cx, cz, null)) return { x: cx, z: cz }; } return null; },
      vec: (x, y, z) => new BABYLON.Vector3(x, y, z), scene: state.scene, BABYLON: window.BABYLON,
      // God / Dungeon Keeper play (api.md "Powers, resources, designations, demands, weather"):
      // a button on the power bar (removed with the scenario); a resource's value (and a change to it)
      bar: { add: b => window.tablefolkBar?.add({ ...b, from: b.from || 'package' }), remove: id => window.tablefolkBar?.remove(id) },
      resource: (name, delta) => delta == null ? window.tablefolkResources?.get(name) : window.tablefolkResources?.add(name, +delta || 0),
      weather: (kind, opts) => kind === undefined ? window.tablefolkWeather?.now() : window.tablefolkWeather?.set(kind, opts || {}),
      // squares marked for work: { kind, cells: [{x, z}] } or a plan by relation ({ verb: "wall", around: "shrine" }); -> the designation or { error }
      designate: (spec, opts = {}) => spec?.cells ? window.tablefolkDesignate?.add({ by: 'package', ...spec }) : window.tablefolkDesignate?.addPlan(spec, { by: 'package', ...opts }),
      demand: spec => window.tablefolkDemands?.create({ from: 'package', ...spec }),
      groups: () => window.tablefolkGroups?.all?.() || {}, groupOf: id => window.tablefolkGroups?.of?.(typeof id === 'string' ? id : id?.id) || [] };
  }
  // what a module's listeners and timers are, so reset() stops them
  const listeners = [], timers = [], disposers = [];
  const invOf = who => who === state.playerAvatar || who === 'player' ? state.player : charInventory(who);
  function giveItem(who, item, n) {
    const inv = invOf(who); if (!inv) return false;
    for (let i = 0; i < n; i++) addItem(inv.items ||= [], String(item));
    if (who !== state.playerAvatar && who !== 'player') setBrainConfig(who.id, { inventory: inv });
    inventoryChanged(); return true;
  }
  function takeItem(who, item, n) {
    const inv = invOf(who), it = inv && findItem(inv.items || [], String(item));
    if (!it || (it.qty ?? 1) < n) return false;
    it.qty = (it.qty ?? 1) - n; inv.items = inv.items.filter(i => (i.qty ?? 1) > 0);
    if (who !== state.playerAvatar && who !== 'player') setBrainConfig(who.id, { inventory: inv });
    inventoryChanged(); return true;
  }
  // a character a module adds (reinforcements, a visitor): a body, a place,
  // its brain config (personality, style, hp, allowed, hostile, job...)
  async function spawnCharacterAt(id, model, x, z, cfg = {}) {
    const T = window.tablefolk; let n = 1, unique = id;
    while (state.characters.some(c => c.id === unique)) unique = id + (++n);
    const g = await T.spawnAgent(unique, Math.round(x), Math.round(z), cfg.facing || 's', model);
    if (!g) return null;
    const hp = Math.max(1, +cfg.hp || window.tablefolkBodies?.get(model)?.hp || 10);
    T.setBrainConfig(unique, { enabled: true, style: cfg.style || model, personality: cfg.personality || `A ${String(model).replace(/_/g, ' ')}.`, mind: null, messages: [], pendingChat: [], maxHp: hp, hp, defeated: false,
      inventory: { gold: +cfg.gold || 0, items: (cfg.items || []).map(i => typeof i === 'string' ? { name: i, qty: 1 } : i) }, ttsEnabled: false, allowed: cfg.allowed || null, role: cfg.role || '', ...(cfg.job ? { job: cfg.job } : {}),
      ...(cfg.hostile != null ? { hostile: !!cfg.hostile } : {}) });
    return g;
  }
  // designations, resources, weather, demands (data or a module's), powers (a module's: they run code)
  function dataExtensions(x, from, warnings = []) {
    const each = (sec, fn) => { for (const [k, d] of Object.entries(x?.[sec] && typeof x[sec] === 'object' && !Array.isArray(x[sec]) ? x[sec] : {})) { try { fn(k, d); } catch (e) { warnings.push(`${from}: ${sec} ${k}: ${e.message}`); console.warn('[packages]', from, sec, k, e.message); } } };
    each('designations', (k, d) => window.tablefolkDesignate?.registerKind(k, d, from));
    each('resources', (k, d) => window.tablefolkResources?.declare(k, d, from));
    each('weather', (k, d) => window.tablefolkWeather?.register(k, d, from));
    each('demands', (k, d) => window.tablefolkDemands?.registerTemplate(k, d, from));
    each('powers', (k, d) => window.tablefolkPowers?.register(k, d, from));
    return warnings;
  }
  function adopt(x, from) {
    dataExtensions(x, from);
    for (const [name, b] of Object.entries(x?.behaviours || {})) { window.tablefolkRoles?.addBehaviour(name, b); added.behaviours.push(name); }
    Object.assign(window.tablefolkSkills?.cards || {}, x?.cards || {}); added.cards.push(...Object.keys(x?.cards || {}));
    Object.assign(window.tablefolkSkills?.effects || {}, x?.effects || {}); added.effects.push(...Object.keys(x?.effects || {}));
    Object.assign(uses, x?.uses || {});
    // a threat kind's behaviour in code (threats.js): { crows(c, ctx) { ... return true } }
    for (const [kind, fn] of Object.entries(x?.threats || {})) if (typeof fn === 'function') window.tablefolkThreats?.registerBehaviour(kind, fn);
    // commands (skills.js addCommand): { signal: { run(g, args, ctx), help, example, allowedBy } }
    for (const [name, c] of Object.entries(x?.commands || {})) { try { window.tablefolkSkills?.addCommand(name, c, from); added.commands.push(String(name).toLowerCase()); } catch (e) { console.warn('[packages]', e.message); } }
    // dispose(): called when the scenario that loaded it ends (its lights, particles, timers of its own)
    if (typeof x?.dispose === 'function') disposers.push(x.dispose);
    // goal predicates in code (scenario.js): { beacon_held(args, world) { return true } } -> "win": { "beacon_held": 3 }
    for (const [name, fn] of Object.entries(x?.goals || {})) if (typeof fn === 'function') { goals[name] = fn; added.goals.push(name); }
    // job step kinds in code (jobs.js): { refuel(g, step, ctx) { return { done: true, ms: 3000 } } }
    for (const [name, fn] of Object.entries(x?.steps || {})) if (typeof fn === 'function') { window.tablefolkJobs?.registerStep?.(name, fn); added.steps.push(name); }
    console.log(`[packages] code from ${from}: ${['behaviours', 'cards', 'effects', 'uses', 'threats', 'commands', 'steps', 'goals', 'designations', 'powers', 'resources', 'demands', 'weather'].map(k => Object.keys(x?.[k] || {}).length + ' ' + k).join(', ')}`);
  }

  // ---- loading ----
  const loaded = new Map();   // url -> promise of { id, manifest, warnings }
  const dataOnly = new Set();   // ids of packages whose code was not run
  function load(ref, depth = 0) {
    const url = refUrl(ref, 'package');
    if (loaded.has(url)) return loaded.get(url);
    const p = (async () => {
      const warnings = [];
      const r = await fetch(url);
      if (!r.ok) throw new Error(`package ${ref}: ${r.status} at ${url}`);
      const m = await r.json();
      if (!m.id) throw new Error(`package ${ref}: tablefolk.json has no "id"`);
      const rel = p => new URL(p, url).href, fromRef = (p, kind) => isRef(p) && !/\.json$/.test(p) ? refUrl(p, kind) : rel(p);
      // a relative path ("../ores/") is another package beside this one, wherever it is hosted
      if (depth < 4) for (const q0 of m.requires || []) {
        const q = /^\.\.?\//.test(q0) ? rel(q0) : q0;
        try { warnings.push(...(await load(q, depth + 1)).warnings); } catch (e) { warnings.push(e.message); }
      }
      if (m.items && window.tablefolkPacks) for (const t of window.tablefolkPacks.add({ id: m.id, items: m.items }, url) || []) added.items.add(t);
      // bodies (bodies.js) and sounds (sfx.js): data, relative to the file
      for (const id of window.tablefolkBodies?.addAll(m.bodies, url, m.id) || []) added.bodies.add(id);
      for (const n of window.tablefolkSfx?.registerAll?.(m.sounds, url, m.id) || []) added.sounds.add(n);
      // uses.js kinds characters and jobs can use
      for (const [kind, def] of Object.entries(m.uses && typeof m.uses === 'object' && !Array.isArray(m.uses) ? m.uses : {})) { try { window.tablefolkUses?.register(kind, def); } catch (e) { warnings.push(`package ${m.id}: use ${kind}: ${e.message}`); } }
      // jobs (jobs.js): inline job.json manifests, or files / references
      if (m.jobs && window.tablefolkJobs) {
        const list = Array.isArray(m.jobs) ? m.jobs.map(p => ({ src: fromRef(p, 'job') })) : Object.entries(m.jobs).map(([id, man]) => ({ man: { id, ...man } }));
        for (const { src, man } of list) {
          try { if (man) window.tablefolkJobs.register(man, url); else { const res = await fetch(src); if (!res.ok) throw new Error(`job ${src}: ${res.status}`); window.tablefolkJobs.register(await res.json(), src); } }
          catch (e) { warnings.push(`package ${m.id}: ${e.message}`); }
        }
      }
      // God / Dungeon Keeper play, in data: designation kinds (designate.js), resources (powers.js), weather kinds (weather.js), demand templates (orders.js)
      dataExtensions(m, m.id, warnings);
      // templated lines (chatter.js): { "sale": [...], "raid": { "gruff": [...] } }
      if (m.lines && typeof m.lines === 'object') window.tablefolkChatter?.add(m.lines, m.id);
      // threat kinds (threats.js), in data
      for (const [kind, def] of Object.entries(m.threats && typeof m.threats === 'object' ? m.threats : {})) { try { window.tablefolkThreats?.registerKind(kind, def, m.id); } catch (e) { warnings.push(`package ${m.id}: threat ${kind}: ${e.message}`); } }
      // skills and roles: inline manifests, or files relative to the package
      for (const [kind, regOf] of [['skill', () => window.tablefolkSkills], ['role', () => window.tablefolkRoles]]) {
        const sec = m[kind + 's'], reg = regOf(); if (!sec || !reg) continue;
        const list = Array.isArray(sec) ? sec.map(p => ({ src: fromRef(p, kind) })) : Object.entries(sec).map(([id, man]) => ({ man: { id, ...man } }));
        for (const { src, man } of list) {
          try {
            if (man) await reg.register(man, url, man.id);
            else { const res = await fetch(src); if (!res.ok) throw new Error(`${kind} ${src}: ${res.status}`); const mm = await res.json(); await reg.register(mm, src, mm.id); }
          } catch (e) { warnings.push(`package ${m.id}: ${e.message}`); }
        }
      }
      Object.assign(workflows, m.workflows || {});
      if (m.modules?.length) {
        const ok = await askTrust(m, rel(m.modules[0]));
        for (const path of m.modules) {
          const src = rel(path);
          if (!ok || !trusted(src)) { warnings.push(`package ${m.id}: its code (${path}) was not run (data only: not allowed in this browser)`); dataOnly.add(m.id); continue; }
          try { const x = await import(src); adopt((x.default || x.register)?.(api()) || {}, src); }
          catch (e) { warnings.push(`package ${m.id}: ${path} failed: ${e.message}`); }
        }
      }
      console.log(`[packages] ${m.id} ${m.version || ''} from ${url}`);
      return { id: m.id, manifest: m, url, warnings };
    })();
    loaded.set(url, p);
    p.catch(() => loaded.delete(url));
    return p;
  }
  let noAsk = false;   // a scenario played as a test (Test tactics) never asks
  async function loadAll(refs, opts = {}) {
    const warnings = [];
    noAsk = !!opts.testing;
    for (const r of await Promise.allSettled((refs || []).map(x => load(x)))) {
      if (r.status === 'rejected') warnings.push(r.reason?.message || String(r.reason));
      else warnings.push(...r.value.warnings);
    }
    return warnings;
  }

  // ---- using things ----
  // Play one of a model's clips (packages' "use" and "loop"; from importPropAsset),
  // or of a character's body (bodies.js): playClip(target, name, loop | { loop })
  function playClip(thing, name, loop = false) {
    if (loop && typeof loop === 'object') loop = !!loop.loop;
    if (thing && (thing.rigAnims || thing.root && state.characters.concat(state.playerAvatar || []).includes(thing))) return window.tablefolkBodies?.playClip(thing, name, { loop }) || (() => { try { playRig(thing, String(name), !!loop); return thing.rigMode === String(name); } catch { return false; } })();
    const anims = meta(thing)?.anims || [];
    // a clip by its name, or by its last part ("RatArmature|Rat_Idle" is "Rat_Idle")
    const n = String(name).toLowerCase(), ag = name === true || name == null ? anims[0] : anims.find(a => a.name.toLowerCase() === n) || anims.find(a => a.name.toLowerCase().split('|').pop() === n);
    if (!ag) return false;
    ag.stop(); ag.start(loop); return true;
  }
  const nameOf = who => who === state.playerAvatar ? (document.getElementById('chatName')?.value.trim() || 'the player') : who?.id || 'someone';
  // E on an item with "use": a module's behaviour by name, or the data form.
  async function useThing(thing, who) {
    const mm = meta(thing), type = mm?.type, def = window.tablefolkPacks?.items[type]?.use;
    if (!def) return false;
    if (typeof def === 'string') {
      const fn = uses[def];
      if (!fn) { const t = `nothing happens: the ${type.replace(/_/g, ' ')} needs its package's code, which is not running`; if (who === state.playerAvatar || !who) window.tablefolkToast?.(t.replace(/^n/, 'N')); return who && who !== state.playerAvatar ? { fail: t } : false; }
      // a module's use returns a string (what happened), true, false, or { fail: "why" }
      let r; try { r = await fn(thing, who, api()); } catch (e) { console.warn('use', def, e); return false; }
      if (who && who !== state.playerAvatar && state.characters.includes(who)) return r;
      if (r && typeof r === 'object' && r.fail) { window.tablefolkToast?.(String(r.fail)); return false; }
      if (typeof r === 'string') { state.globalHistory = (state.globalHistory || []).concat([`T${state.turn?.index ?? 0} player: ${r}`]).slice(-20); log(r); }
      return !!r;
    }
    mm.opts ||= {};
    if (def.once && mm.opts.used) { window.tablefolkToast?.(`The ${type.replace(/_/g, ' ')} has already been used`); return false; }
    mm.opts.used = true;
    if (def.state) mm.state = String(def.state);
    if (def.anim) playClip(thing, def.anim, !!def.loopAnim);
    // "who": a clip of the user's body (a character or the player): "pickup", or a body's own clip
    if (def.who && who) playClip(who, def.who);
    if (def.sound) window.tablefolkSfx?.play(def.sound, thing.getAbsolutePosition?.() || thing.position);
    // the player, or a character (uses.js: use(thing) and jobs): what it gives goes to whoever used it
    const npc = who && who !== state.playerAvatar && state.characters.includes(who);
    const inv = who === state.playerAvatar ? state.player : npc ? charInventory(who) : null;
    if (inv && def.gold) inv.gold = (inv.gold || 0) + (+def.gold || 0);
    if (inv && def.give) for (const n of [].concat(def.give)) { const have = findItem(inv.items, n); if (have) have.qty = (have.qty ?? 1) + 1; else inv.items.push({ name: String(n), qty: 1 }); }
    if (npc && (def.gold || def.give)) setBrainConfig(who.id, { inventory: inv });
    if (def.gold || def.give) inventoryChanged();
    const text = String(def.text || `{{player}} uses the ${type.replace(/_/g, ' ')}`).replace(/\{\{\s*(player|me)\s*\}\}/g, nameOf(who));
    // a character's use is its own turn's result (uses.js says it); the player's goes in the history here
    if (npc) return text;
    state.globalHistory = (state.globalHistory || []).concat([`T${state.turn?.index ?? 0} player: ${text}`]).slice(-20);
    log(text);
    return true;
  }

  // Forget what the last scenario's packages brought (scenario.js, before
  // this one's load): they load again, fresh, if this scenario names them.
  function reset() {
    loaded.clear(); dataOnly.clear();
    for (const k of Object.keys(uses)) delete uses[k];
    for (const k of Object.keys(workflows)) delete workflows[k];
    const items = window.tablefolkPacks?.items || {};
    for (const t of added.items) delete items[t];
    for (const n of added.behaviours) window.tablefolkRoles?.removeBehaviour?.(n);
    for (const n of added.cards) delete window.tablefolkSkills?.cards?.[n];
    for (const n of added.effects) delete window.tablefolkSkills?.effects?.[n];
    for (const n of added.commands) window.tablefolkSkills?.removeCommand?.(n);
    for (const n of added.steps) window.tablefolkJobs?.removeStep?.(n);
    for (const n of added.goals) delete goals[n]; added.goals.length = 0;
    for (const id of added.bodies) window.tablefolkBodies?.remove(id);
    for (const n of added.sounds) window.tablefolkSfx?.unregister?.(n);
    for (const fn of disposers.splice(0)) try { fn(); } catch (e) { console.warn('[packages] dispose', e); }
    for (const [e, fn] of listeners.splice(0)) removeEventListener(e, fn);
    for (const t of timers.splice(0)) clearInterval(t);
    added.items.clear(); added.bodies.clear(); added.sounds.clear(); added.behaviours.length = 0; added.cards.length = 0; added.effects.length = 0; added.commands.length = 0; added.steps.length = 0;
    window.tablefolkUses?.resetRegistered?.();
    window.tablefolkDesignate?.resetPackaged?.(); window.tablefolkPowers?.resetPackaged?.(); window.tablefolkWeather?.resetPackaged?.(); window.tablefolkDemands?.resetPackaged?.();
    window.tablefolkJobs?.resetPackaged?.();
    window.tablefolkThreats?.resetPackaged?.();
    window.tablefolkChatter?.reset?.();
  }
  window.tablefolkPackages = { load, loadAll, reset, refUrl, trusted, untrust, allowedList, askTrust, api, useThing, playClip, uses, workflows, goals, ROOT, dataOnly, loaded };
})();
