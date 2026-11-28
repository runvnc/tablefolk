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
 *   tablefolkProfile.fromCheck(result) -> { level, domains, comfortable, slow, turnS, why }: Auto's level from
 *     the capability check (agency.js runs it; v4 rule below, brains.md "Calibrating the check against the days")
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
  // ---------------------------------------------------------------- Auto from the capability check
  // Calibrated (v4, 2026-11-27) on every recorded check beside the measured hearthvale days (brains.md,
  // "Calibrating the check against the days"): the score's items did not predict a free day (SenseNova-Loop-9B
  // 10/10 in Chrome left 4 hungry; every brain at 17-28 tokens/s, 27B on 12-16 GB, Inkling, SenseNova, ended
  // its free days with 2-4 hungry and below its own guided day); what did was speed. So:
  //  - the share of items gives the preset as before (free .85, guided .6, assisted .5);
  //  - free also needs 40 tokens/s written and, when measured, a turn-sized prompt (the busy item, ~1,400
  //    tokens read) answered within 6 s; else guided (the only free day as good as guided: Bonsai 2 27B on a
  //    4090, 53 tokens/s, 5 s turns);
  //  - a slow brain (under 35 tokens/s, or the busy turn over 8 s) keeps needs in code: every such brain's
  //    guided day left 1-7 hungry (12B 5-7, Inkling 3, 27B on a 4070 2, E4B 2), and needs in code cost the 9B
  //    nothing (assisted against guided: same judge, everyone fed);
  //  - talk, danger, needs, temper whose items it failed (half or more) stay in code (not activity, the main
  //    loop, nor plan: with plans in code the 9B's villagers talked all day and made nothing).
  const CHECK = { FREE_MIN: .85, GUIDED_MIN: .6, ASSISTED_MIN: .5, FREE_TOKS: 40, FREE_TURN_S: 6, GUIDED_TOKS: 6, NEEDS_TOKS: 35, NEEDS_TURN_S: 8, COMFORT: .7 };
  // each item's decision domain (v1-v3 items included, so recorded results still read)
  const ITEM_DOMAIN = { steps: 'activity', sums: 'activity', haggle: 'activity', character: 'talk', track: 'talk', plan: 'plan', mind: 'temper', danger: 'danger', shelter: 'danger', hunger: 'needs', busy: 'needs' };
  function fromCheck(r) {
    if (!r || !(r.of > 0)) return null;
    const f = r.score / r.of, tokS = +r.tokS || 0, tasks = r.tasks || {};
    const turnS = tasks.busy && tasks.busy.ms > 0 ? +(tasks.busy.ms / 1000).toFixed(1) : null;
    // (assisted came with v3's ten items, at 5/10 the 9B's band; an eight-item v1/v2 result had none: 4/8 was rails)
    let level = f >= CHECK.FREE_MIN ? 'free' : f >= CHECK.GUIDED_MIN ? 'guided' : f >= CHECK.ASSISTED_MIN && r.of >= 10 ? 'assisted' : 'rails';
    const why = [];
    if (level === 'free' && (tokS < CHECK.FREE_TOKS || (turnS != null && turnS > CHECK.FREE_TURN_S))) { level = 'guided'; why.push(`free wants ${CHECK.FREE_TOKS} tokens/s and a turn in ${CHECK.FREE_TURN_S} s`); }
    if ((level === 'guided' || level === 'assisted') && tokS < CHECK.GUIDED_TOKS) { level = 'rails'; why.push('too slow'); }
    const domains = {};
    for (const d of ['talk', 'danger', 'needs', 'temper']) {
      const its = Object.keys(tasks).filter(k => ITEM_DOMAIN[k] === d);
      if (its.length && its.filter(k => !tasks[k].ok).length / its.length >= .5) domains[d] = 'code';
    }
    const slow = tokS < CHECK.NEEDS_TOKS || (turnS != null && turnS > CHECK.NEEDS_TURN_S);
    if (slow && !domains.needs && (level === 'guided' || level === 'free')) { domains.needs = 'code'; why.push('slow turns: needs in code'); }
    return { level, domains, comfortable: f >= CHECK.COMFORT, slow, turnS, why: why.join('; ') };
  }
  // the value Auto hands choose(): a preset, or { preset, <domain>: 'code' ... }
  function autoValue(c) {
    if (!c) return null;
    const code = Object.keys(c.domains).filter(d => c.domains[d] === 'code' && PRESETS[c.level][d] !== 'code');
    return code.length && c.level !== 'rails' ? { preset: c.level, ...Object.fromEntries(code.map(d => [d, 'code'])) } : c.level;
  }
  window.tablefolkProfile = { DOMAINS, PRESETS, NAMES, CHECK, ITEM_DOMAIN, normalize, resolve, choose, describe, fromCheck, autoValue };
})(typeof window !== 'undefined' ? window : globalThis);
