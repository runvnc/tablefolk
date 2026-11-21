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
  function describe(p) {
    const base = PRESETS[p.preset] || PRESETS.rails, diff = DOMAINS.filter(d => p.domains[d] !== base[d]);
    if (!diff.length) return p.preset;
    const by = v => diff.filter(d => p.domains[d] === v);
    const parts = [by('code').length ? by('code').join(' and ') + ' in code' : '', by('model').length ? by('model').join(' and ') + ' by the model' : ''].filter(Boolean);
    return `${p.preset} (${parts.join('; ')})`;
  }
  window.tablefolkProfile = { DOMAINS, PRESETS, NAMES, normalize, resolve, describe };
})(typeof window !== 'undefined' ? window : globalThis);
