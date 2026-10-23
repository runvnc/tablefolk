/* roles.js -- jobs as data: "role": "shopkeeper" gives a character what the
 * job needs, with no code from the scenario's author.
 *
 * A role is a role.json package, named the way skills are (packages.js):
 * a built-in name (roles/<name>/role.json on this site), a URL,
 * npm:<package>@<version> or gh:<user>/<repo>@<tag>. Built in: shopkeeper,
 * innkeeper, guard, quest_giver, companion, villager.
 *
 *   { "id": "shopkeeper", "name": "Shopkeeper", "version": "1.0.0",
 *     "description": "Runs a shop: sells its wares at its prices.",
 *     "duty": "You run a shop. ...",          // "Your job:" line; {player} is the player's name
 *     "commands": ["say", "inventory"],        // added to the character's own list
 *     "skills": ["trade"],                     // skills it brings (the agent's own are added)
 *     "skillParams": { "trade": { ... } },     // defaults; the agent's skillParams win
 *     "temperament": "gruff",                  // when the agent names none
 *     "behaviours": ["follow"] }               // code-run behaviour, by name (below)
 *
 *   "agents": [{ "id": "mog", "role": "shopkeeper",
 *     "prices": { "magic sword": [50, 40], "healing potion": 8 } }]
 *
 * Behaviours are named routines run by code, no model call: a role or a skill
 * lists them; skill modules can add more (tablefolkRoles.behaviours.<name> =
 * { on: 'tablefolk-player-turn', run(g) {} }). Built in: follow.
 * Loaded after app.js and mind.js; uses app.js globals.
 */
(function () {
  const reg = new Map();          // id -> manifest
  const playerName = () => document.getElementById('chatName')?.value.trim() || 'the player';
  const cfgOf = g => getBrainConfig(g.id);
  const key = ref => String(ref || '').trim().toLowerCase();

  async function loadOne(ref) {
    if (get(ref)) return get(ref);   // already here (built in earlier, or from a package)
    const url = window.tablefolkPackages.refUrl(ref, 'role');
    for (const m of reg.values()) if (m._url === url) return m;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`role ${ref}: ${r.status} at ${url}`);
    return register(await r.json(), url, ref);
  }
  // Add a role manifest (fetched, or inline in a package).
  function register(m, url = '', ref = m?.id) {
    if (!m || !m.id) throw new Error(`role ${ref}: manifest has no "id"`);
    m._url = url; m._ref = String(ref);
    reg.set(key(m.id), m);
    if (key(ref) !== key(m.id)) reg.set(key(ref), m);
    return m;
  }
  // Load every role a scenario's agents name; returns warnings.
  async function load(scn) {
    const refs = new Set((scn.agents || []).map(a => a.role).filter(Boolean).map(String));
    const warnings = [];
    await Promise.all([...refs].map(r => loadOne(r).catch(e => warnings.push(e.message))));
    return warnings;
  }
  const get = ref => reg.get(key(ref)) || null;
  const roleOf = g => g && get(cfgOf(g).role) || null;

  // An agent with its role's skills and their defaults added (for skills.js).
  function withRole(a) {
    const r = get(a.role); if (!r) return a;
    return { ...a, skills: [...new Set([...(r.skills || []), ...(a.skills || [])])],
      skillParams: { ...(r.skillParams || {}), ...(a.skillParams || {}) }, temperament: a.temperament || r.temperament || '' };
  }

  // ---- prompt ----
  function duty(g) { const r = roleOf(g); return r?.duty ? r.duty.replace(/\{player\}/g, playerName()) : ''; }
  function commands(g) { return roleOf(g)?.commands || []; }

  // ---- behaviours (code-run, no model call) ----
  const behaviours = {
    // A companion that has fallen behind walks back to the player after the player moves.
    follow: { on: 'tablefolk-player-turn', run(g) {
      const me = state.playerAvatar; if (!me) return;
      const a = g.root.position, b = me.root.position;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 2.6) { try { walk(g, { type: 'coord', x: Math.round(b.x), z: Math.round(b.z) }); } catch (e) { console.warn('follow', e); } }
    } },
  };
  function behavioursOf(g) {
    const fromSkills = (window.tablefolkSkills?.skillsOf(g) || []).flatMap(m => m.behaviours || []);
    return [...new Set([...(roleOf(g)?.behaviours || []), ...fromSkills])];
  }
  const listening = new Set();
  function listen(ev) {
    if (listening.has(ev)) return; listening.add(ev);
    window.addEventListener(ev, () => {
      for (const g of state.characters) {
        if (g.defeated || cfgOf(g).enabled === false) continue;
        for (const name of behavioursOf(g)) { const b = behaviours[name]; if (b?.on === ev) { try { b.run(g); } catch (e) { console.warn('behaviour', name, e); } } }
      }
    });
  }
  listen('tablefolk-player-turn');
  // Behaviours added later (by skill modules) get their event hooked up when used.
  function addBehaviour(name, b) { behaviours[name] = b; if (b?.on) listen(b.on); }

  window.tablefolkRoles = { load, loadOne, register, get, roleOf, withRole, duty, commands, behaviours, addBehaviour, behavioursOf, registry: reg };
})();
