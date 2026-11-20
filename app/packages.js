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
 *     "requires": ["npm:tablefolk-ores@1"],              // other packages, loaded first
 *     "items":     { "forge": { "file": "models/forge.glb", ..., "loop": "Fire",
 *                    "use": { "anim": "Pump", "text": "{{player}} pumps the bellows", "sound": "chestOpen" } } },
 *     "skills":    { "smithing": { ...skill.json... } } or ["skills/smithing/skill.json"],
 *     "roles":     { "blacksmith": { ...role.json... } } or ["roles/blacksmith/role.json"],
 *     "workflows": { "commission": { ...workflow... } },
 *     "jobs":      { "picker": { ...job.json... } } or ["jobs/picker/job.json"],   // jobs.js
 *     "threats":   { "crows": { who, count, when, every, from, behaviour, ... } },  // threats.js
 *     "uses":      { "loom": { types: ["loom"], anim, time, verb, gives } },       // uses.js register
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
 * reset() (scenario.js, before a scenario's packages load) forgets what the
 * last scenario's packages brought: items, jobs, uses, threat kinds,
 * workflows and module additions, so they do not leak into the next one.
 * Data loads from anywhere. Code runs only when it comes from this site,
 * the page has ?trustSkills=1, or the player allowed that package (asked
 * once, remembered in this browser; never asked during tests).
 *
 *   window.tablefolkPackages.load(ref)        -> { id, manifest, warnings }
 *   window.tablefolkPackages.loadAll(refs)    -> warnings
 *   window.tablefolkPackages.refUrl(ref, kind) kind: 'package' | 'skill' | 'role'
 *   window.tablefolkPackages.useThing(mesh, who)   what E does on an item with "use"
 */
(function () {
  const ROOT = new URL('../', location.href).href;
  const KINDS = {
    package: { dir: 'packages', file: 'tablefolk.json' },
    job: { dir: 'jobs', file: 'job.json' },
    skill: { dir: 'skills', file: 'skill.json' },
    role: { dir: 'roles', file: 'role.json' },
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
  // Ask once per package whose code isn't trusted yet.
  async function askTrust(m, url) {
    if (trusted(url)) return true;
    if (window.tablefolkScenario?.active?.testing || !window.confirmDialog) return false;
    const ok = await window.confirmDialog(
      `The package "${m.name || m.id}" wants to run its own code (from ${new URL(url).host}). Code can do anything this page can. Allow it?`,
      { title: 'Run code from a package?', confirmText: 'allow code', cancelText: 'data only' }).catch(() => false);
    if (ok) { try { localStorage.setItem(TRUST_KEY, JSON.stringify([...new Set([...allowedList(), scopeOf(url)])])); } catch {} }
    return !!ok;
  }
  function untrust(scope) { try { localStorage.setItem(TRUST_KEY, JSON.stringify(allowedList().filter(s => s !== scope))); } catch {} }

  // ---- what modules add ----
  const uses = {}, workflows = {}, added = { behaviours: [], cards: [], effects: [], items: new Set() };
  function api() {
    return { ...(window.tablefolkSkills?.api?.() || {}), state, meta, playClip, toast: (t, type) => window.tablefolkToast?.(t, { type }), addMemory: window.tablefolkMind?.addMemory };
  }
  function adopt(x, from) {
    for (const [name, b] of Object.entries(x?.behaviours || {})) { window.tablefolkRoles?.addBehaviour(name, b); added.behaviours.push(name); }
    Object.assign(window.tablefolkSkills?.cards || {}, x?.cards || {}); added.cards.push(...Object.keys(x?.cards || {}));
    Object.assign(window.tablefolkSkills?.effects || {}, x?.effects || {}); added.effects.push(...Object.keys(x?.effects || {}));
    Object.assign(uses, x?.uses || {});
    // a threat kind's behaviour in code (threats.js): { crows(c, ctx) { ... return true } }
    for (const [kind, fn] of Object.entries(x?.threats || {})) if (typeof fn === 'function') window.tablefolkThreats?.registerBehaviour(kind, fn);
    console.log(`[packages] code from ${from}: ${['behaviours', 'cards', 'effects', 'uses', 'threats'].map(k => Object.keys(x?.[k] || {}).length + ' ' + k).join(', ')}`);
  }

  // ---- loading ----
  const loaded = new Map();   // url -> promise of { id, manifest, warnings }
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
      if (depth < 4) for (const q of m.requires || []) {
        try { warnings.push(...(await load(q, depth + 1)).warnings); } catch (e) { warnings.push(e.message); }
      }
      if (m.items && window.tablefolkPacks) for (const t of window.tablefolkPacks.add({ id: m.id, items: m.items }, url) || []) added.items.add(t);
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
          if (!ok || !trusted(src)) { warnings.push(`package ${m.id}: its code (${path}) was not run: not allowed`); continue; }
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
  async function loadAll(refs) {
    const warnings = [];
    for (const r of await Promise.allSettled((refs || []).map(x => load(x)))) {
      if (r.status === 'rejected') warnings.push(r.reason?.message || String(r.reason));
      else warnings.push(...r.value.warnings);
    }
    return warnings;
  }

  // ---- using things ----
  // Play one of a model's clips (packages' "use" and "loop"; from importPropAsset).
  function playClip(thing, name, loop = false) {
    const anims = meta(thing)?.anims || [];
    const ag = name === true || name == null ? anims[0] : anims.find(a => a.name.toLowerCase() === String(name).toLowerCase());
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
      if (!fn) { window.tablefolkToast?.(`Nothing happens (the ${type.replace(/_/g, ' ')} needs code that isn't loaded)`); return false; }
      try { return !!(await fn(thing, who, api())); } catch (e) { console.warn('use', def, e); return false; }
    }
    mm.opts ||= {};
    if (def.once && mm.opts.used) { window.tablefolkToast?.(`The ${type.replace(/_/g, ' ')} has already been used`); return false; }
    mm.opts.used = true;
    if (def.state) mm.state = String(def.state);
    if (def.anim) playClip(thing, def.anim, !!def.loopAnim);
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
    loaded.clear();
    for (const k of Object.keys(uses)) delete uses[k];
    for (const k of Object.keys(workflows)) delete workflows[k];
    const items = window.tablefolkPacks?.items || {};
    for (const t of added.items) delete items[t];
    for (const n of added.behaviours) window.tablefolkRoles?.removeBehaviour?.(n);
    for (const n of added.cards) delete window.tablefolkSkills?.cards?.[n];
    for (const n of added.effects) delete window.tablefolkSkills?.effects?.[n];
    added.items.clear(); added.behaviours.length = 0; added.cards.length = 0; added.effects.length = 0;
    window.tablefolkUses?.resetRegistered?.();
    window.tablefolkJobs?.resetPackaged?.();
    window.tablefolkThreats?.resetPackaged?.();
  }
  window.tablefolkPackages = { load, loadAll, reset, refUrl, trusted, untrust, allowedList, useThing, playClip, uses, workflows, ROOT };
})();
