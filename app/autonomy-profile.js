/* autonomy-profile.js -- who decides what: code or the model, per decision domain.
 *
 * A character's autonomy is a profile: one setting per domain, "code" or "model":
 *   activity  what to do next              plan    the day's plan and re-plans
 *   talk      starting conversations        danger  raids, monsters: shelter / fight / flee
 *   needs     when to eat and sleep         temper  what it does when provoked
 * Presets (agency.js runs them):
 *   rails     everything in code (the small brains' design; the model only answers)
 *   assisted  the model chooses activities, plans and talk and handles its temper; code keeps
 *             it safe and fed (the rails reflexes: shelter in a raid unless its job fights or
 *             defends, eat when hungry, bed at night)
 *   guided    every domain the model's; it picks from menus of activities
 *   free      every domain the model's; open turns with do(...) are the main loop
 * A scenario's or character's "autonomy" is a preset name or an object:
 *   { "preset": "guided", "danger": "code" }  (domains not named come from the preset;
 *   without "preset", from what the player's setting or the brain would give).
 *
 *   tablefolkProfile.normalize(value) -> a preset name, an object of valid keys, or null
 *   tablefolkProfile.resolve([...sources]) -> { preset, free, domains, label }  (sources highest first; each a value as above, or null)
 *   tablefolkProfile.choose({ character, group, world, setting, auto }) -> the above + { source, capped?, kept? }:
 *     (group: the character's group's request, between its own and the world's; source 'group')
 *     the whole rule with a brain too weak for a world's request (below; living.md, "How much characters decide")
 *   tablefolkProfile.describe(profile) -> "guided" | "guided (danger and needs in code)"
 * A classic script with no game globals (Node imports it for tools/browser-test/profile-test.mjs).
 */
(function (window) {
  const DOMAINS = ['activity', 'plan', 'talk', 'danger', 'needs', 'temper'];
  const PRESETS = {
    rails: { activity: 'code', plan: 'code', talk: 'code', danger: 'code', needs: 'code', temper: 'code' },
    assisted: { activity: 'model', plan: 'model', talk: 'model', danger: 'code', needs: 'code', temper: 'model' },
    guided: { activity: 'model', plan: 'model', talk: 'model', danger: 'model', needs: 'model', temper: 'model' },
    free: { activity: 'model', plan: 'model', talk: 'model', danger: 'model', needs: 'model', temper: 'model' },
  };
  const NAMES = Object.keys(PRESETS);
  function normalize(v) {
    if (typeof v === 'string') return NAMES.includes(v) ? v : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out = {};
    if (NAMES.includes(v.preset)) out.preset = v.preset;
    for (const d of DOMAINS) if (v[d] === 'code' || v[d] === 'model') out[d] = v[d];
    return Object.keys(out).length ? out : null;
  }
  // sources, highest first (character, scenario, the player's setting, the brain's default);
  // the first preset found is the base, and domains named above it override it
  function resolve(sources) {
    const list = (sources || []).map(normalize).filter(Boolean);
    let preset = 'rails', over = {};
    for (const s of list) {
      if (typeof s === 'string') { preset = s; break; }
      for (const d of DOMAINS) if (s[d] && !(d in over)) over[d] = s[d];
      if (s.preset) { preset = s.preset; break; }
    }
    const domains = { ...PRESETS[preset], ...over };
    return { preset, free: preset === 'free' && domains.activity === 'model', domains, label: describe({ preset, domains }) };
  }
  // The whole rule, as agency.js applies it: character > world > the player's setting > Auto (the brain's
  // own level: the capability check's preset and the domains it failed, else the brain's size).
  // A request from the world or a character meets the brain it runs on:
  //  - when the base below it is rails (Auto puts this brain on rails: small or slow; or the player
  //    chose "On rails" in Settings), a request that would hand the model the activities is not
  //    followed: everyone runs on rails, and `capped` says what was asked and why not;
  //  - otherwise the request runs; on Auto, the decisions this brain keeps in code (talk, danger,
  //    needs, temper: the ones its check failed, or its assisted preset's) stay in code unless the
  //    request names them ("kept"); a level the player chose in Settings adds no such domains.
  //   choose({ character, world, setting: 'auto'|preset, auto: Auto's value })
  //     -> { ...resolve(), source: 'character'|'world'|'setting'|'auto', capped?: { asked, by: 'brain'|'setting' }, kept?: [domains] }
  // group: the character's group's "autonomy" (orders.js groups), between the character's own and the world's
  function choose({ character, group, world, setting, auto } = {}) {
    const c = normalize(character), gr = normalize(group), w = normalize(world), s = setting && setting !== 'auto' ? normalize(setting) : null;
    const base = s || normalize(auto) || 'rails', brain = resolve([base]);
    if (!c && !gr && !w) return { ...brain, source: s ? 'setting' : 'auto' };
    const source = c ? 'character' : gr ? 'group' : 'world';
    let p = resolve([c, gr, w, base]);
    if (p.domains.activity === 'model' && brain.domains.activity === 'code') return { ...resolve(['rails']), source, capped: { asked: p.label, by: s ? 'setting' : 'brain' } };
    if (s) return { ...p, source };
    const full = x => typeof x === 'string' || x?.preset;
    const used = full(c) ? [c] : full(gr) ? [c, gr] : [c, gr, w];   // the requests resolve() read
    const named = d => used.some(x => x && typeof x === 'object' && x[d]);
    const kept = ['talk', 'danger', 'needs', 'temper'].filter(d => brain.domains[d] === 'code' && p.domains[d] === 'model' && !named(d));
    if (!kept.length) return { ...p, source };
    const domains = { ...p.domains }; for (const d of kept) domains[d] = 'code';
    return { ...p, domains, label: describe({ preset: p.preset, domains }), source, kept };
  }
  function describe(p) {
    const base = PRESETS[p.preset] || PRESETS.rails, diff = DOMAINS.filter(d => p.domains[d] !== base[d]);
    if (!diff.length) return p.preset;
    const by = v => diff.filter(d => p.domains[d] === v);
    const parts = [by('code').length ? by('code').join(' and ') + ' in code' : '', by('model').length ? by('model').join(' and ') + ' by the model' : ''].filter(Boolean);
    return `${p.preset} (${parts.join('; ')})`;
  }
  window.tablefolkProfile = { DOMAINS, PRESETS, NAMES, normalize, resolve, choose, describe };
})(typeof window !== 'undefined' ? window : globalThis);
