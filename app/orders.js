/* orders.js -- groups, standing orders and demands: the player's (and a
 * package's, the director's) say over a living world, carried out by code at
 * every autonomy level, chosen or refused by the characters above rails.
 * The rules live in orders-core.js; this is the game's side.
 *
 * Groups (scenario "groups", agents' "group"): named sets of characters (a
 * household, a faction, the faithful). A group may set "autonomy" (between
 * the character's own and the world's: agency.js), and carries demands.
 *   tablefolkGroups = { all(), get(id), of(charId) -> [group ids], members(id), autonomyOf(charId), add(id, def), join(id, charId), leave(id, charId) }
 *
 * Standing orders (scenario "orders", or the Orders tool): a rule in
 * @tablefolk/script's conditions ("raiders > 2", "hour >= 21", "belief < 5";
 * variables raiders, raider_near, hour, the resources and flags) with actions
 * code runs with no model: { wake: id } (up, to the raiders or the player),
 * { alarm: true }, { all: 'home' }, { go: { who, to } }, { notify: true }, and
 * any script action ({ set }, { act }, { reply } as "as"). Words become a
 * rule by code templates (orders-core parseOrder) or, when they fail and a
 * brain is loaded, by the brain in the same shape; the player sees it in
 * plain text before it is kept.
 *   tablefolkOrders = { add(rule), remove(id), list(), fromWords(text), describe(rule), cardLines(g) }
 *
 * Demands (generic decrees and quests; scenario "demands", the Orders tool's
 * "Demand", a package's power, the director): what, of whom, by when, what
 * counts as met, what follows. Delivered through a character (the elder, a
 * priest: "via") as spoken words, remembered by every member, and on each
 * member's state card ("Demanded of the faithful: bring 3 bread to the shrine
 * by 18:00 (1 of 3 brought)"). On rails code does the obvious job (fetch the
 * item and leave it at the place; a work demand becomes designations for
 * the group); above rails it is one of the activities (do it, or refuse it).
 *   met: { flag } | { if: "<condition>" } | { deliver: { item, n, to: place | character } } | { designation: true }
 *        | { check: "<package template>" }   (a package template's check(d, api) -> true | { met, progress })
 *   onMet / onMissed: script actions (set, reply...) plus { resource: { belief: 5 } }, { weather: "storm" },
 *        { narrate: "..." }, and a package template's own onMet(d, api) / onMissed(d, api)
 *   tablefolkDemands = { create(spec | text), cancel(id), refuse(id, who, why), list(), open(), templates(), registerTemplate(name, def, from), forCharacter(g) }
 *   event 'tablefolk-demand' { id, status: 'open' | 'met' | 'missed' | 'refused' | 'cancelled', text, of, by }
 * Loaded after designate.js; uses app.js globals.
 */
(function () {
  const OC = () => window.TablefolkOrdersCore, J = () => window.tablefolkJobs, K = () => J()?.kit, ST = () => window.tablefolkStory;
  const gm = () => J()?.gm?.() ?? 0;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const toast = (t, type) => window.tablefolkToast?.(t, { type: type || 'info' });
  const api = () => window.tablefolkPackages?.api?.();
  const byId = id => state.characters.find(c => c.id === id) || null;
  const hhmm = t => { const v = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
  const dayOf = t => Math.floor(t / 1440) + 1;
  const scn = () => window.tablefolkScenario?.active?.scn || {};
  const brainUsable = () => { try { return !!window.tablefolk?.brainReady?.() && window.tablefolkBrainInfo?.()?.engine !== 'none' && !new URLSearchParams(location.search).has('art') && !!window.tablefolkLLM; } catch { return false; } };

  // ---------------------------------------------------------------- groups
  let G = {};
  const groups = {
    all: () => G, get: id => G[id] || null, of: cid => OC().groupsOf(cid, G), members: id => (G[id]?.members || []).slice(),
    autonomyOf: cid => { if (!cid) return null; const own = getBrainConfig(cid)?.autonomy; return OC().autonomyFor(own || null, OC().groupsOf(cid, G), G); },
    add: (id, def = {}) => { G[id] = OC().normalizeGroups({ groups: { [id]: def } })[id]; return G[id]; },
    join: (id, cid) => { (G[id] ||= OC().normalizeGroups({ groups: { [id]: {} } })[id]).members.includes(cid) || G[id].members.push(cid); },
    leave: (id, cid) => { if (G[id]) G[id].members = G[id].members.filter(x => x !== cid); },
  };

  // ---------------------------------------------------------------- standing orders
  const O = OC().createOrders({ now: gm });
  const vars = () => { const T = window.tablefolkThreats, r = T?.active?.() || [], p = state.playerAvatar ? posOf(state.playerAvatar) : null; return { raiders: r.length, raider_near: p && r.length ? +Math.min(...r.map(x => dist(posOf(x), p))).toFixed(1) : 99, hour: +(window.tablefolkClock?.hour?.() ?? 12).toFixed(2), ...Object.fromEntries((window.tablefolkResources?.list?.() || []).map(d => [d.name, d.value])) }; };
  const holds = o => { try { return !!ST()?.check(o.when, { me: o.as || null, vars: vars() }); } catch { return false; } };
  const called = new Map();   // character id -> game minute its call ends
  async function fire(o) {
    const d = o.do || {}, text = OC().describeOrder(o);
    console.info('[orders] fired:', text);
    if (d.alarm) { window.tablefolkSfx?.play?.('hit', state.playerAvatar ? posOf(state.playerAvatar) : null); try { window.tablefolkDirector?.narrate?.('The alarm sounds!'); } catch {} for (const c of state.characters) if (!c.defeated) { const cfg = getBrainConfig(c.id); if (cfg) cfg.pendingChat = (cfg.pendingChat || []).concat('[event] The alarm sounds: danger!').slice(-6); } }
    if (d.wake) call(byId(d.wake), o);
    if (d.all === 'wake') for (const c of state.characters) call(c, o);
    if (d.all === 'home') { const k = K(); for (const c of state.characters) { if (c.defeated || !c._job || k.fighter(c, J().jobOf(c))) continue; c._job.sent = gm() + 120; } }
    if (d.go) { const g = byId(d.go.who); if (g) { called.set(g.id, gm() + 60); try { await window.tablefolk.runAs(g.id, `walk(${d.go.to})`); } catch {} } }
    if (d.notify) { toast(`Standing order: ${text.replace(/^When /, 'when ')}`, 'warn'); try { window.tablefolkDirector?.narrate?.(text); } catch {} }
    const rest = { ...d }; for (const k of ['wake', 'alarm', 'all', 'go', 'notify']) delete rest[k];
    if (Object.keys(rest).length) try { await ST()?.perform(rest, o.as || null); } catch (e) { console.warn('[orders]', e); }
    dispatchEvent(new CustomEvent('tablefolk-order', { detail: { id: o.id, text, when: o.when } }));
  }
  function call(g, o) {
    if (!g || g.defeated || g === state.playerAvatar) return;
    called.set(g.id, gm() + 90);
    try { if (g.pose?.mode === 'lie') window.tablefolkUses?.standUp?.(g); } catch {}
    try { say(g, `${g.id} is roused: ${o.cond || 'the alarm'}!`, false); } catch {}
    try { window.tablefolkChatter?.say?.(g, 'raid_fighter', { raiders: 'Raiders' }); } catch {}
  }
  // the called and the sent-home act before anything else (jobs.js urgent hook): a call ends after 90 game minutes or when the raiders are gone
  async function urgent(g, s, j) {
    const k = K(), T = window.tablefolkThreats, r = T?.active?.() || [];
    const until = called.get(g.id);
    if (until != null) {
      if (gm() > until || (!r.length && !scn().orders?.length && until - gm() < 60)) { called.delete(g.id); }
      else if (r.length) { k.setDoing(g, s, 'answering the call to arms'); return k.fightRaiders(g, s, j, r); }
      else if (state.playerAvatar) { const p = posOf(state.playerAvatar); if (dist(posOf(g), p) > 2.5) { k.setDoing(g, s, 'answering the call'); const rr = await k.goTo(g, s, p.x, p.z, 'you'); return { ms: rr.ms || 2500 }; } called.delete(g.id); }
    }
    if (s.sent && s.sent > gm()) { if (!r.length && s.sent - gm() < 90) { s.sent = 0; return null; } return k.hideHome(g, s, j, false); }
    return null;
  }
  setInterval(() => { if (!window.tablefolkScenario?.active || !O.list().length) return; for (const o of O.tick(holds)) fire(o); }, 1500);
  async function orderFromWords(text) {
    const people = state.characters.filter(c => !c.defeated && !c._threat).map(c => c.id), roles = Object.fromEntries(people.map(id => [id, [getBrainConfig(id)?.role, getBrainConfig(id)?.style, J()?.jobOf?.(byId(id))?.id].filter(Boolean).join(' ')]));
    let r = OC().parseOrder(text, { people, roles }), by = 'code';
    if (r.error && brainUsable()) {
      try {
        const msg = [{ role: 'system', content: 'You turn a player’s standing order in a village game into a JSON rule. Reply with one JSON object only.' },
          { role: 'user', content: `People: ${people.join(', ')}\nConditions use: raiders (how many raiders are about), raider_near (squares to the nearest), hour (0-24).\nActions: "wake": "<person>", "alarm": true, "all": "home", "go": {"who": "<person>", "to": "<place>"}, "notify": true.\nShape: {"when": "raiders > 2", "do": {"wake": "<person>"}}\n\nThe order: "${text}"` }];
        dispatchEvent(new CustomEvent('tablefolk-model-call', { detail: { agentId: 'player', kind: 'order' } }));
        const out = await window.tablefolkLLM.chat.completions.create({ messages: msg, max_tokens: 80, temperature: 0, agentId: 'orders', thinking: false });
        const a = window.TablefolkPlanCore.parseAnswer(out?.choices?.[0]?.message?.content);
        if (a?.when && a?.do && typeof a.when === 'string') { try { ST().check(a.when, { vars: vars() }); r = { when: a.when, do: a.do, as: a.do.wake || a.do.go?.who || null, source: text }; by = 'model'; } catch {} }
      } catch (e) { console.warn('[orders] words', e); }
    }
    return { ...r, by };
  }

  // ---------------------------------------------------------------- demands
  const Q = OC().createDemands({ now: gm });
  const TEMPLATES = new Map(Object.entries({
    deliver: { label: 'bring something to a place', keywords: ['bring', 'deliver', 'offer', 'give', 'offering', 'tribute'] },
    work: { label: 'build, dig or clear something', keywords: ['build', 'wall', 'fence', 'dig', 'clear', 'farm', 'stockpile'] },
    flag: { label: 'make something happen', keywords: ['light', 'ring', 'raise', 'open', 'repair', 'find'] },
  }).map(([k, d]) => [k, { ...d, name: k, from: null }]));
  function registerTemplate(name, def = {}, from = null) { TEMPLATES.set(String(name), { label: def.label || String(name).replace(/_/g, ' '), keywords: def.keywords || [], ...def, name: String(name), from }); return TEMPLATES.get(String(name)); }
  const pkgTemplate = d => d.template && TEMPLATES.get(d.template);
  // where the place a delivery goes to is, and what it holds there now
  const placeOf = id => J()?.places?.placeNamed?.(id) || null;
  function storesIn(p) { if (!p) return []; return getObjects().filter(o => ['chest', 'store'].includes(window.tablefolkUses?.kindOf?.(o.type)) && J().places.inPlace(p, o.x, o.z)); }
  const countIn = (list, item) => list.reduce((a, o) => a + (K().contentsOf(o).items || []).filter(i => i.name.toLowerCase() === String(item).toLowerCase()).reduce((b, i) => b + (i.qty ?? 1), 0), 0);
  function deliveredOf(d) {
    const dv = d.met?.deliver; if (!dv) return 0;
    const who = byId(dv.to);
    if (who) return Math.max(0, K().count(who, dv.item) - (d.data.base || 0)) + (d.data.delivered || 0);
    return Math.max(0, countIn(storesIn(placeOf(dv.to)), dv.item) - (d.data.base || 0)) + (d.data.delivered || 0);
  }
  function isMet(d) {
    const m = d.met || {};
    if (m.flag) return ST()?.truthy?.(ST()?.get(m.flag)) ?? !!ST()?.get(m.flag);
    if (m.if) { try { return !!ST()?.check(m.if, { vars: vars() }); } catch { return false; } }
    if (m.deliver) { const n = deliveredOf(d); return { met: n >= (m.deliver.n || 1), progress: n / (m.deliver.n || 1) }; }
    if (m.designation) { const ds = (d.data.designations || []).map(id => window.tablefolkDesignate?.get?.(id)).filter(Boolean); if (!ds.length) return false; const done = ds.filter(x => x.status === 'done').length; return { met: done === ds.length, progress: ds.reduce((a, x) => a + window.tablefolkDesignate.board.progress(x).done / Math.max(1, x.cells.length), 0) / ds.length }; }
    const t = pkgTemplate(d); if (m.check || t?.check) { const fn = (m.check && TEMPLATES.get(m.check)?.check) || t?.check; if (typeof fn === 'function') return fn(d, api()); }
    return false;
  }
  async function consequences(d, which) {
    const a = which === 'met' ? d.onMet : d.onMissed, t = pkgTemplate(d);
    try { const fn = t?.[which === 'met' ? 'onMet' : 'onMissed']; if (typeof fn === 'function') await fn(d, api()); } catch (e) { console.warn('[demands]', e); }
    if (!a) return;
    const rest = { ...a };
    if (a.resource) { for (const [k, v] of Object.entries(a.resource)) window.tablefolkResources?.add?.(k, +v || 0); delete rest.resource; }
    if (a.weather) { try { const w = a.weather; window.tablefolkWeather?.set(typeof w === 'string' ? w : w.kind, typeof w === 'object' ? w : { duration: 120 }); } catch (e) { console.warn(e); } delete rest.weather; }
    if (a.narrate) { try { window.tablefolkDirector?.narrate?.(a.narrate); } catch {} delete rest.narrate; }
    if (Object.keys(rest).length) try { await ST()?.perform(rest, d.via || null); } catch (e) { console.warn('[demands]', e); }
  }
  const memberIds = d => d.of === 'all' ? state.characters.filter(c => !c.defeated && !c._threat && c._job !== undefined).map(c => c.id) : d.of?.id ? [d.of.id] : groups.members(d.of?.group);
  const ofText = d => d.of === 'all' ? 'everyone' : d.of?.id ? d.of.id : (n => /^the /i.test(n) ? n : 'the ' + n)(String(G[d.of?.group]?.name || d.of?.group));
  const byText = d => d.by == null ? '' : ` by ${dayOf(d.by) !== dayOf(gm()) ? 'day ' + dayOf(d.by) + ', ' : ''}${hhmm(d.by)}`;
  const emitD = (d, status) => dispatchEvent(new CustomEvent('tablefolk-demand', { detail: { id: d.id, status: status || d.status, text: d.text, of: d.of, by: d.by } }));
  // the messenger: "via", else an elder, priest or chief by role or look, else a member
  function messengerFor(d) {
    const v = d.via && byId(d.via); if (v) return v;
    const re = /\b(elder|priest|priestess|chief|headman|mayor|captain|reeve|steward)\b/i;
    return state.characters.find(c => !c.defeated && re.test([getBrainConfig(c.id)?.role, c.style, getBrainConfig(c.id)?.personality].join(' '))) || byId(memberIds(d)[0]) || null;
  }
  async function deliverMessage(d) {
    const m = messengerFor(d); d.via ||= m?.id || null;
    const line = d.text.replace(/\.$/, '') + (d.by != null ? '' : '') + (d.from === 'player' ? '. So it is commanded.' : '.');
    for (const id of memberIds(d)) { const c = byId(id); if (c && c !== m) try { window.tablefolkMind?.addMemory?.(c, `${m ? m.id : 'Word came'}: ${d.text}${byText(d)}`, 3); } catch {} }
    if (m) {
      const near = memberIds(d).map(byId).filter(c => c && c !== m && !c.defeated).sort((a, b) => dist(posOf(a), posOf(m)) - dist(posOf(b), posOf(m)))[0];
      try { await window.tablefolk.runAs(m.id, `say("${line.replace(/"/g, "'")}")`); } catch {}
      try { window.tablefolkMind?.addMemory?.(m, `I told ${ofText(d)}: ${d.text}`, 2); } catch {}
      if (near && dist(posOf(near), posOf(m)) > 6) setTimeout(() => window.tablefolk.runAs(m.id, `walk(${near.id})`).catch(() => {}), 2500);
    }
    d.delivered = true;
    toast(`${m ? m.id + ' tells ' + ofText(d) : 'Demanded of ' + ofText(d)}: ${d.text}`);
  }
  async function create(spec) {
    if (typeof spec === 'string') { const r = await demandFromWords(spec); if (r.error) return r; spec = r; }
    const t = spec.template && TEMPLATES.get(spec.template);
    if (t?.build) spec = { ...spec, ...(t.build(spec, api()) || {}) };
    if (spec.met?.deliver && !spec.met.deliver.to) return { error: 'deliver where?' };
    const d = Q.add({ ...spec, from: spec.from || 'player' });
    // a baseline, so what was already there does not count
    if (d.met?.deliver) { const dv = d.met.deliver, who = byId(dv.to); d.data.base = who ? K().count(who, dv.item) : countIn(storesIn(placeOf(dv.to)), dv.item); if (!who && !placeOf(dv.to)) console.warn('[demands] no place', dv.to); }
    // a work demand: its designations, for the group
    if (d.met?.designation && (spec.plan || spec.designation)) {
      const plans = [].concat(spec.designation || []);
      if (!plans.length && typeof spec.plan === 'string') { const r = await window.tablefolkDesignate.planWords(spec.plan, { useBrain: brainUsable() }); if (r.plan?.verb) plans.push(r.plan); }
      else if (spec.plan && typeof spec.plan === 'object') plans.push(spec.plan);
      d.data.designations = [];
      for (const p of plans) { const r = window.tablefolkDesignate.addPlan(p, { who: d.of?.group || d.of?.id || null, priority: 4, by: 'demand', from: d.id }); if (r.d) d.data.designations.push(r.d.id); else console.warn('[demands] work:', r.error); }
      if (!d.data.designations.length) { Q.cancel(d.id); return { error: 'could not mark the work: ' + plans.map(p => JSON.stringify(p)).join(', ') }; }
    }
    emitD(d, 'open');
    await deliverMessage(d);
    return d;
  }
  async function demandFromWords(text) {
    const items = [...new Set(state.characters.flatMap(c => (charInventory(c)?.items || []).map(i => i.name)).concat(['bread', 'wheat', 'firewood', 'stone', 'apple', 'fish', 'meat', 'ale']))];
    const ctx = { now: gm(), items, places: (state.places || []).map(p => p.id), groups: G, people: state.characters.map(c => c.id) };
    let r = OC().parseDemand(text, ctx);
    // a package template that fits the words better (fixed options chosen by the menus' matcher: words, meaning, then the brain)
    const pkg = [...TEMPLATES.values()].filter(t => t.from && typeof t.parse === 'function');
    if (pkg.length) {
      let pick = null;
      try { const m = await window.tablefolkMenu?.match?.({ items: [...TEMPLATES.values()].map(t => ({ id: t.name, label: t.label, keywords: t.keywords })) }, text); pick = m?.item?.id ? TEMPLATES.get(m.item.id) : null; } catch {}
      if (pick?.parse) { const p = pick.parse(text, { ...ctx, api: api() }); if (p && !p.error) r = { ...p, template: pick.name }; }
    }
    return r;
  }
  // the members' card: what is demanded of them and how far it is
  function cardLines(g) {
    const out = [], gs = groups.of(g.id);
    if (gs.length) out.push(`You belong to ${gs.map(id => G[id]?.name || id).join(' and ')}.`);
    for (const d of Q.forMember(g.id, gs)) {
      if (d.refused.some(r => r.who === g.id)) { out.push(`You refused what was demanded: ${d.text}`); continue; }
      const dv = d.met?.deliver, have = dv ? K().count(g, dv.item) : 0;
      out.push(`Demanded of ${d.of?.id === g.id ? 'you' : ofText(d)}${d.via ? ' (word from ' + d.via + ')' : ''}: ${d.text.replace(/\.$/, '')}${byText(d)}${dv ? ` (${deliveredOf(d)} of ${dv.n} brought; you carry ${have} ${dv.item})` : d.progress ? ` (${Math.round(d.progress * 100)}% done)` : ''}.`);
    }
    for (const o of O.list().filter(o => o.on && (o.do?.wake === g.id || o.do?.go?.who === g.id))) out.push(`Standing order: ${OC().describeOrder(o)}`);
    return out;
  }
  // the obvious job, by code (rails) or chosen (above rails): bring the item to the place
  async function demandWork(g, s, j, d) {
    const k = K(), dv = d.met?.deliver; if (!dv || d.status !== 'open') return null;
    if (d.refused.some(r => r.who === g.id)) return null;
    const left = dv.n - deliveredOf(d); if (left <= 0) return null;
    const carrying = d.data.carry || (d.data.carry = {});
    // not everyone at once: as many workers as loaves still wanted
    const others = Object.entries(carrying).filter(([id, t]) => id !== g.id && gm() - t < 60).length; if (others >= left && !carrying[g.id]) return null;
    carrying[g.id] = gm();
    k.setDoing(g, s, `doing as demanded: ${d.text.replace(/\.$/, '').toLowerCase()}`);
    if (g.turnMove) return { ms: 700 };
    if (k.count(g, dv.item) < 1) {
      const r = await k.doStep(g, s, j, { fetch: { [dv.item]: 1 } });
      if (r?.need || r?.skip || r?.fail) { const fr = await k.fallback(g, s, j, r.need || { item: dv.item, n: 1 }); if (fr) return { ms: fr.ms || 2500 }; delete carrying[g.id]; d.data.stuck = `${g.id}: no ${dv.item} to be had`; return null; }
      return { ms: r?.ms || 2000 };
    }
    const who = byId(dv.to);
    if (who) { if (dist(posOf(g), posOf(who)) > 2.2) { const r = await k.goTo(g, s, posOf(who).x, posOf(who).z, who.id); return { ms: r.ms || 2500 }; } await k.runLine(g, `give(${dv.item}, ${who.id})`); delete carrying[g.id]; return { ms: 2500 }; }
    const p = placeOf(dv.to); if (!p) return null;
    const store = storesIn(p).sort((a, b) => dist(posOf(g), a) - dist(posOf(g), b))[0];
    if (store) { if (dist(posOf(g), store) > 1.9) { const r = await k.approach(g, s, store); return { ms: r.ms || 2500 }; } const r = await k.runLine(g, `put(${dv.item}, ${store.type})`); if (!r.ok) return { ms: 2000 }; delete carrying[g.id]; return { ms: 2500 }; }
    const spot = k.spotIn(p, g); if (dist(posOf(g), spot) > 1.6) { const r = await k.goTo(g, s, spot.x, spot.z, 'the ' + p.id); return { ms: r.ms || 2500 }; }
    if (api()?.take?.(g, dv.item, 1)) { d.data.delivered = (d.data.delivered || 0) + 1; try { say(g, `${g.id} leaves ${dv.item} at the ${p.id}`, false); } catch {} try { playRig(g, 'pickup', false); } catch {} }
    delete carrying[g.id]; return { ms: 2500 };
  }
  async function railsWork(g, s, j) {
    for (const d of Q.forMember(g.id, groups.of(g.id))) { const r = await demandWork(g, s, j, d); if (r) return r; }
    return null;
  }
  function options(g, s, j) {
    const out = [];
    for (const d of Q.forMember(g.id, groups.of(g.id))) {
      if (d.refused.some(r => r.who === g.id)) continue;
      if (d.met?.deliver && deliveredOf(d) < d.met.deliver.n) out.push({ key: 'demand:' + d.id, kind: 'demand', cmd: 'do as demanded', label: `do as demanded: ${d.text.replace(/\.$/, '')}${byText(d)} (word from ${d.via || 'above'})`, doing: 'doing as demanded',
        run: async (g2, s2, j2, a) => { a.cap ||= 120; const r = await demandWork(g2, s2, j2, d); return r ? { busy: true, ms: r.ms } : { done: true, text: 'did as demanded' }; } });
      out.push({ key: 'refuse:' + d.id, kind: 'refuse', cmd: 'refuse the demand', label: `refuse what is demanded (${d.text.replace(/\.$/, '').slice(0, 60)}); there may be consequences`, doing: 'refusing',
        run: async (g2) => { Q.refuse(d.id, g2.id, 'chose to refuse'); emitD(d, 'refused'); try { J()?.addNews?.(g2.id, `${g2.id} refused: ${d.text}`, 'news'); } catch {} try { await window.tablefolk.runAs(g2.id, `say("I will not. ${d.text.replace(/\.$/, '')}? No.")`); } catch {} return { done: true, text: 'refused' }; } });
    }
    return out;
  }
  // checked every two seconds; consequences once
  setInterval(async () => {
    if (!window.tablefolkScenario?.active || !Q.open().length) return;
    for (const { d, status } of Q.tick(isMet)) {
      emitD(d, status);
      const m = byId(d.via);
      const line = status === 'met' ? `It is done: ${d.text.replace(/\.$/, '').toLowerCase()}` : `It was not done: ${d.text.replace(/\.$/, '').toLowerCase()}`;
      toast(`${status === 'met' ? 'Met' : 'Missed'}: ${d.text}`, status === 'met' ? 'success' : 'warn');
      try { window.tablefolkJobs?.addNews?.(d.via || 'player', line, 'news'); } catch {}
      if (m && !m.defeated) try { await window.tablefolk.runAs(m.id, `say("${line.replace(/"/g, "'")}.")`); } catch {}
      for (const id of d.data.designations || []) if (status === 'missed') window.tablefolkDesignate?.cancel?.(id);
      await consequences(d, status);
    }
  }, 2000);

  // ---------------------------------------------------------------- the Orders tool (the power bar)
  const B = () => window.tablefolkBar;
  function tool(tab = 'orders') {
    const list = O.list(), qs = Q.open();
    const tabs = `<button type="button" data-pick="t:orders"${tab === 'orders' ? ' class="go"' : ''}>standing orders</button><button type="button" data-pick="t:demand"${tab === 'demand' ? ' class="go"' : ''}>demand</button>`;
    const body = tab === 'orders'
      ? `<input id="tfOrderWords" type="text" placeholder="if more than two wolves come, wake the captain" /><button type="button" data-pick="parse">read it</button>` + list.map(o => `<button type="button" data-pick="x:${esc(o.id)}" title="remove">✕ ${esc(OC().describeOrder(o))}</button>`).join('')
      : `<input id="tfOrderWords" type="text" placeholder="the faithful must bring 3 bread to the shrine by evening" /><button type="button" data-pick="parse">read it</button>` + qs.map(d => `<button type="button" data-pick="q:${esc(d.id)}" title="withdraw it">✕ ${esc(d.text)} ${Math.round(d.progress * 100)}%</button>`).join('');
    B().pick(tabs + body + `<button type="button" data-pick="close">close</button>`,
      Object.fromEntries([['t:orders', () => tool('orders')], ['t:demand', () => tool('demand')], ['close', () => B().pick(null)], ['cancel', () => B().pick(null)],
        ['parse', () => read(tab, document.getElementById('tfOrderWords')?.value)], ['enter', el => read(tab, el.value)],
        ...list.map(o => ['x:' + o.id, () => { O.remove(o.id); tool('orders'); }]), ...qs.map(d => ['q:' + d.id, () => { Q.cancel(d.id); emitD(d, 'cancelled'); for (const id of d.data.designations || []) window.tablefolkDesignate?.cancel?.(id); tool('demand'); }])]));
    setTimeout(() => document.getElementById('tfOrderWords')?.focus(), 30);
  }
  async function read(tab, text) {
    text = String(text || '').trim(); if (!text) return;
    B().pick(`<span>Reading “${esc(text.slice(0, 60))}”…</span>`, {});
    if (tab === 'orders') {
      const r = await orderFromWords(text);
      if (r.error) { toast(r.error, 'warn'); tool('orders'); return; }
      B().pick(`<span>${esc(OC().describeOrder(r))}</span><small>${r.by === 'model' ? 'read by the brain' : 'read by code'} · runs with no model</small><button type="button" class="go" data-pick="ok">Keep it</button><button type="button" data-pick="no">cancel</button>`,
        { ok: () => { O.add(r); toast('Standing order kept: ' + OC().describeOrder(r)); tool('orders'); }, no: () => tool('orders'), cancel: () => B().pick(null) });
    } else {
      const r = await demandFromWords(text);
      if (r.error) { toast(r.error, 'warn'); tool('demand'); return; }
      const of = r.of === 'all' ? 'everyone' : r.of?.id || G[r.of?.group]?.name || r.of?.group;
      B().pick(`<span>${esc(r.text)}</span><small>of ${esc(of)}${r.by != null ? ' · by ' + esc((dayOf(r.by) !== dayOf(gm()) ? 'day ' + dayOf(r.by) + ' ' : '') + hhmm(r.by)) : ' · no deadline'} · met when ${esc(r.met?.deliver ? `${r.met.deliver.n} ${r.met.deliver.item} reach the ${r.met.deliver.to}` : r.met?.flag ? 'world.' + r.met.flag + ' holds' : r.met?.designation ? 'the marked work is done' : 'its check passes')}</small><button type="button" class="go" data-pick="ok">Demand it</button><button type="button" data-pick="no">cancel</button>`,
        { ok: async () => { B().pick(null); const d = await create(r); if (d?.error) toast(d.error, 'warn'); }, no: () => tool('demand'), cancel: () => B().pick(null) });
    }
  }

  // ---------------------------------------------------------------- start, save
  addEventListener('tablefolk-scenario-started', e => {
    if (e.detail?.sub) return;
    const s = scn(); G = OC().normalizeGroups(s); O.clear(); Q.clear(); called.clear();
    for (const r of s.orders || []) { try { O.add(typeof r === 'string' ? (() => { const x = OC().parseOrder(r, { people: state.characters.map(c => c.id) }); if (x.error) throw new Error(x.error + ': ' + r); return x; })() : r); } catch (err) { console.warn('[orders] scenario order:', err.message); } }
    const specs = [...(s.demands || []), ...Object.values(G).flatMap(g => (g.demands || []).map(d => ({ of: { group: g.id }, ...d })))];
    if (specs.length) setTimeout(async () => { for (const sp of specs) { try { const d = await create({ ...sp, by: sp.by ?? (sp.in != null ? { in: +sp.in } : null), from: sp.from || 'scenario' }); if (d?.error) console.warn('[demands] scenario demand:', d.error); } catch (err) { console.warn('[demands]', err.message); } } }, +s.demandDelay || 3000);
  });
  (window.tablefolkSaveHooks ||= {}).orders = { save: () => ({ orders: O.data(), demands: Q.data(), groups: G }), restore: x => { if (!x) return; if (x.groups) G = x.groups; O.load(x.orders); Q.load(x.demands); } };
  window.tablefolkJobs?.addUrgent?.(urgent);
  window.tablefolkJobs?.addWork?.(railsWork);
  window.tablefolkAgency?.addOptions?.(options);
  B()?.add({ id: 'orders', label: 'Orders', icon: '📜', title: 'Standing orders ("if more than two wolves come, wake the captain") and demands ("the faithful must bring 3 bread to the shrine by evening")', order: 20, run: () => tool('orders') });
  window.tablefolkGroups = { all: groups.all, get: groups.get, of: groups.of, members: groups.members, autonomyOf: groups.autonomyOf, add: groups.add, join: groups.join, leave: groups.leave };
  window.tablefolkOrders = { add: r => O.add(r), remove: id => O.remove(id), list: () => O.list(), fromWords: orderFromWords, describe: r => OC().describeOrder(r), cardLines, fire, tool, urgent };
  window.tablefolkDemands = { create, cancel: id => { const d = Q.cancel(id); if (d) emitD(d, 'cancelled'); return d; }, refuse: (id, who, why) => { const d = Q.refuse(id, who, why); if (d) emitD(d, 'refused'); return d; }, list: () => Q.list(), open: () => Q.open(), get: id => Q.get(id),
    templates: () => [...TEMPLATES.values()], registerTemplate, resetPackaged: () => { for (const [k, t] of [...TEMPLATES]) if (t.from) TEMPLATES.delete(k); }, forCharacter: g => Q.forMember(g.id, groups.of(g.id)), fromWords: demandFromWords, isMet, delivered: deliveredOf };
})();
