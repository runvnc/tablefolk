/* orders-core.js -- the rules behind God / Dungeon Keeper style play, with no
 * game in them: designations as a job board, demands (decrees, quests) and
 * their lifecycle, groups of characters, standing orders from words, and
 * resources. The game wires them in designate.js (marks, workers, the ghost
 * overlay), orders.js (standing orders, demands, groups) and powers.js (the
 * power bar, resources); tools/orders-test.mjs runs them in Node. A classic
 * script with no game globals (globalThis.TablefolkOrdersCore).
 *
 * Designations (a board): what to do on which squares, as jobs code can hand out.
 *   board = createBoard({ now })            now(): game minutes (any clock)
 *   board.add({ kind, cells: [{x, z}], gate: {x, z}, priority 1-5 (3), who: id | group | job | [..],
 *               by: 'player' | 'package' | 'director' | 'scenario', label, standing, needs, maxWorkers }) -> d
 *   board.claim(worker, { eligible(d) -> bool, ready(d, cell) -> bool, pos: {x, z} }) -> { d, cell } | null
 *        (ready: a square that cannot be worked yet is passed over, e.g. rock with no open side to dig from)
 *        the highest priority open designation the worker may take, its nearest open square;
 *        a "standing" kind (a guard post, a patrol route) goes to the square served longest ago
 *   board.claimOf(worker) -> { d, cell } | null;  board.release(worker, { fail, why })  (3 failures: blocked an hour)
 *   board.finish(worker)  the square is done (a standing square opens again)
 *   board.cancel(id) -> [workers who held squares];  board.setPriority(id, p);  board.list();  board.open()
 *   board.data() / board.load(data)
 * Demands: what is demanded, of whom, by when, what counts as met, what follows.
 *   demands = createDemands({ now })
 *   demands.add({ text, of: { group } | { id } | 'all' | 'player' (made of the player: a keeper's creatures want their wages), by: <game minute> | { in: minutes }, met: <condition>,
 *                 onMet: actions, onMissed: actions, via: id, from: 'player' | <package> | 'director', reward, template })
 *     met: { flag: "name" } | { if: "<script condition>" } | { deliver: { item, n, to } } | { goal: { ... } } | { check: "<package check>" }
 *   demands.tick(isMet(d) -> bool | { progress }) -> [{ d, status: 'met' | 'missed' }]   (the host runs onMet / onMissed)
 *   demands.refuse(id, who, why); demands.bargain(id, who, offer); demands.cancel(id); demands.open(); demands.forMember(id, groups)
 * Groups: named sets of characters (a household, a faction, the faithful).
 *   normalizeGroups(scn) -> { id: { id, name, members: [...], autonomy, color } }   (members: the group's list + agents' "group")
 *   groupsOf(id, groups) -> [ids];  autonomyFor(agentAutonomy, groupIds, groups) -> the first group's autonomy or null
 * Standing orders: a rule in @tablefolk/script conditions with actions, kept and run by code.
 *   parseOrder(text, { people, places, roles }) -> { when, do, as, text, every } | { error }  (code templates; a brain may write the same shape)
 *   describeOrder(rule) -> "When more than 2 raiders are about: wake captain_mara."
 *   orders = createOrders({ now }); orders.add(rule); orders.tick(holds(rule) -> bool) -> rules to fire now (when it becomes true; again after "every" minutes while it holds)
 * Resources: named world variables (belief, mana) with limits and a change an hour.
 *   resources = createResources(); resources.declare(name, { start, min, max, perHour, label, icon, show }); get(name); add(name, n) -> new value; can(name, n); hour(n = 1)
 */
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ck = c => Math.round(c.x) + ',' + Math.round(c.z);
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const STANDING = new Set(['guard', 'patrol']);

  // ---------------------------------------------------------------- designations
  function createBoard({ now = () => 0 } = {}) {
    let seq = 0; const all = [];
    const byWorker = new Map();   // worker id -> { id, key }
    const find = id => all.find(d => d.id === id) || null;
    function add(spec) {
      if (!spec || !spec.kind) throw new Error('a designation needs a kind');
      const seen = new Set(), cells = [];
      for (const c of spec.cells || []) { const x = Math.round(c.x != null ? +c.x : +c[0]), z = Math.round(c.z != null ? +c.z : +c[1]); if (!Number.isFinite(x) || !Number.isFinite(z) || seen.has(x + ',' + z)) continue; seen.add(x + ',' + z); cells.push({ x, z, st: 'open', by: null, fails: 0, served: -1e9 }); }
      if (!cells.length) throw new Error('a designation needs at least one square');
      const d = { id: spec.id || ('d' + (++seq) + '_' + String(spec.kind).replace(/[^a-z0-9_]/gi, '').slice(0, 12)), kind: String(spec.kind), label: spec.label || String(spec.kind).replace(/_/g, ' '),
        cells, gate: spec.gate ? { x: Math.round(spec.gate.x), z: Math.round(spec.gate.z) } : null, priority: clamp(Math.round(+spec.priority || 3), 1, 5),
        who: spec.who ?? null, by: spec.by || 'player', created: now(), status: 'open', standing: spec.standing ?? STANDING.has(spec.kind),
        needs: spec.needs || null, maxWorkers: +spec.maxWorkers || 0, text: spec.text || '', plan: spec.plan || null, from: spec.from || null };
      if (d.gate) { const gk = ck(d.gate); const gc = d.cells.find(c => ck(c) === gk); if (gc) gc.gate = true; }
      all.push(d); return d;
    }
    const workersOn = d => d.cells.filter(c => c.st === 'claimed').length;
    function open() { return all.filter(d => d.status === 'open').sort((a, b) => b.priority - a.priority || a.created - b.created); }
    function claim(worker, { eligible = () => true, ready = null, pos = { x: 0, z: 0 }, retryAfter = 60 } = {}) {
      const id = typeof worker === 'string' ? worker : worker.id, have = claimOf(id); if (have) return have;
      const t = now();
      for (const d of open()) {
        if (!eligible(d)) continue;
        if (d.maxWorkers && workersOn(d) >= d.maxWorkers) continue;
        const free = d.cells.filter(c => (c.st === 'open' || (c.st === 'blocked' && t >= (c.until ?? Infinity))) && (!ready || ready(d, c)));
        if (!free.length) continue;
        free.sort((a, b) => d.standing ? (a.served - b.served) || d2(a, pos) - d2(b, pos) : d2(a, pos) - d2(b, pos));
        const c = free[0]; c.st = 'claimed'; c.by = id; c.at = t;
        byWorker.set(id, { id: d.id, key: ck(c) });
        return { d, cell: c };
      }
      return null;
    }
    function claimOf(worker) {
      const id = typeof worker === 'string' ? worker : worker.id, h = byWorker.get(id); if (!h) return null;
      const d = find(h.id), c = d && d.status === 'open' && d.cells.find(x => ck(x) === h.key && x.by === id && x.st === 'claimed');
      if (!c) { byWorker.delete(id); return null; }
      return { d, cell: c };
    }
    function settle(d) {
      if (d.standing || d.status !== 'open') return;
      if (d.cells.every(c => c.st === 'done' || (c.st === 'blocked' && c.fails >= 6))) d.status = d.cells.some(c => c.st === 'done') ? 'done' : 'failed';
    }
    function release(worker, { fail = false, why = '', retryAfter = 60 } = {}) {
      const id = typeof worker === 'string' ? worker : worker.id, h = claimOf(id); byWorker.delete(id); if (!h) return null;
      const c = h.cell; c.by = null;
      if (fail) { c.fails++; c.why = why; if (c.fails >= 3) { c.st = 'blocked'; c.until = now() + retryAfter * (c.fails >= 6 ? 1e6 : 1); } else c.st = 'open'; }
      else c.st = 'open';
      settle(h.d); return h;
    }
    function finish(worker) {
      const id = typeof worker === 'string' ? worker : worker.id, h = claimOf(id); byWorker.delete(id); if (!h) return null;
      const c = h.cell; c.by = null;
      if (h.d.standing) { c.st = 'open'; c.served = now(); }
      else { c.st = 'done'; c.doneAt = now(); }
      settle(h.d); return h;
    }
    function cancel(id) {
      const d = find(id); if (!d) return [];
      const ws = d.cells.filter(c => c.st === 'claimed').map(c => c.by); for (const w of ws) byWorker.delete(w);
      d.status = 'cancelled'; for (const c of d.cells) if (c.st === 'claimed') { c.st = 'open'; c.by = null; }
      return ws;
    }
    function remove(id) { const i = all.findIndex(d => d.id === id); if (i >= 0) { cancel(id); all.splice(i, 1); } }
    function setPriority(id, p) { const d = find(id); if (d) d.priority = clamp(Math.round(+p || 3), 1, 5); return d; }
    const progress = d => ({ done: d.cells.filter(c => c.st === 'done').length, total: d.cells.length, blocked: d.cells.filter(c => c.st === 'blocked').length, working: workersOn(d) });
    function data() { return { seq, all: JSON.parse(JSON.stringify(all)) }; }
    function load(x) { all.length = 0; byWorker.clear(); seq = +x?.seq || 0; for (const d of x?.all || []) { for (const c of d.cells) if (c.st === 'claimed') { c.st = 'open'; c.by = null; } all.push(d); } }
    function clear() { all.length = 0; byWorker.clear(); }
    return { add, claim, claimOf, release, finish, cancel, remove, setPriority, open, list: () => all.slice(), get: find, progress, data, load, clear };
  }

  // ---------------------------------------------------------------- demands
  function createDemands({ now = () => 0 } = {}) {
    let seq = 0; const all = [];
    const find = id => all.find(d => d.id === id) || null;
    function add(spec) {
      if (!spec || (!spec.text && !spec.what)) throw new Error('a demand needs "text" (what is demanded)');
      const t = now();
      const by = spec.by == null ? null : typeof spec.by === 'object' && spec.by.in != null ? t + +spec.by.in : +spec.by;
      let of = spec.of ?? 'all'; if (typeof of === 'string' && of !== 'all' && of !== 'player') of = { group: of };
      const d = { id: spec.id || 'q' + (++seq), text: String(spec.text || spec.what), of, by: Number.isFinite(by) ? by : null, met: spec.met || null,
        onMet: spec.onMet || null, onMissed: spec.onMissed || null, via: spec.via || null, from: spec.from || 'player', template: spec.template || null,
        reward: spec.reward || null, status: 'open', created: t, delivered: false, progress: 0, refused: [], bargains: [], data: spec.data || {} };
      all.push(d); return d;
    }
    // isMet(d) -> true | false | { met, progress }: the host knows the world (flags, items, goals)
    function tick(isMet) {
      const t = now(), out = [];
      for (const d of all) {
        if (d.status !== 'open') continue;
        let r = false; try { r = isMet(d); } catch { r = false; }
        const met = r === true || (r && typeof r === 'object' && r.met);
        if (r && typeof r === 'object' && Number.isFinite(+r.progress)) d.progress = clamp(+r.progress, 0, 1);
        if (met) { d.status = 'met'; d.closed = t; d.progress = 1; out.push({ d, status: 'met' }); }
        else if (d.by != null && t >= d.by) { d.status = 'missed'; d.closed = t; out.push({ d, status: 'missed' }); }
      }
      return out;
    }
    const refuse = (id, who, why = '') => { const d = find(id); if (d && !d.refused.some(r => r.who === who)) d.refused.push({ who, why: String(why), at: now() }); return d; };
    const bargain = (id, who, offer) => { const d = find(id); if (d) d.bargains.push({ who, offer: String(offer), at: now() }); return d; };
    const cancel = id => { const d = find(id); if (d && d.status === 'open') { d.status = 'cancelled'; d.closed = now(); } return d; };
    const open = () => all.filter(d => d.status === 'open');
    // demands that bind a character: of "all", of it by id, or of one of its groups (and it has not refused)
    const binds = (d, id, groupIds = []) => d.of === 'all' || (d.of?.id && d.of.id === id) || (d.of?.group && groupIds.includes(d.of.group));
    const forMember = (id, groupIds = []) => open().filter(d => binds(d, id, groupIds));
    function data() { return { seq, all: JSON.parse(JSON.stringify(all)) }; }
    function load(x) { all.length = 0; seq = +x?.seq || 0; for (const d of x?.all || []) all.push(d); }
    return { add, tick, refuse, bargain, cancel, open, forMember, binds, list: () => all.slice(), get: find, data, load, clear: () => { all.length = 0; } };
  }

  // ---------------------------------------------------------------- groups
  const GID = /^[a-z][a-z0-9_-]{0,31}$/i;
  function normalizeGroups(scn = {}) {
    const out = {}, src = scn.groups;
    const list = Array.isArray(src) ? src : src && typeof src === 'object' ? Object.entries(src).map(([id, g]) => ({ id, ...(g || {}) })) : [];
    for (const g of list) {
      const id = String(g?.id || '').trim(); if (!GID.test(id)) continue;
      out[id] = { id, name: String(g.name || id.replace(/_/g, ' ')), members: Array.isArray(g.members) ? g.members.map(String) : [], autonomy: g.autonomy ?? null,
        color: typeof g.color === 'string' ? g.color : null, demands: Array.isArray(g.demands) ? g.demands : [], description: g.description ? String(g.description) : '' };
    }
    for (const a of scn.agents || []) for (const gid of [].concat(a?.group || [])) {
      const id = String(gid).trim(); if (!GID.test(id)) continue;
      out[id] ||= { id, name: id.replace(/_/g, ' '), members: [], autonomy: null, color: null, demands: [], description: '' };
      if (!out[id].members.includes(a.id)) out[id].members.push(a.id);
    }
    return out;
  }
  const groupsOf = (id, groups) => Object.values(groups || {}).filter(g => g.members.includes(id)).map(g => g.id);
  // between the character's own and the world's: the first of its groups that sets one
  function autonomyFor(agentAutonomy, groupIds, groups) {
    if (agentAutonomy) return null;   // the character's own wins; the group's is not needed
    for (const id of groupIds || []) { const a = groups?.[id]?.autonomy; if (a) return a; }
    return null;
  }

  // ---------------------------------------------------------------- standing orders
  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, any: 0 };
  const nm = w => /^\d+$/.test(w) ? +w : NUMW[w] ?? null;
  const THREAT = '(wolves|wolfs|wolf|raiders?|bandits?|monsters?|goblins?|enemies|enemy|foes?|rats|crows|attackers?|intruders?|orcs?|undead|skeletons?)';
  function parseOrder(text, { people = [], places = [], roles = {} } = {}) {
    const t = String(text || '').toLowerCase().replace(/[’']/g, "'").trim();
    if (!t) return { error: 'say what should happen, and when' };
    const lowNames = people.map(p => String(p).toLowerCase());
    const who = s => { const w = String(s || '').toLowerCase().replace(/^(the|our|my)\s+/, '').trim(); if (!w) return null; const exact = lowNames.indexOf(w); if (exact >= 0) return people[exact]; const byRole = Object.entries(roles).find(([, r]) => String(r || '').toLowerCase().includes(w)); if (byRole) return byRole[0]; const part = people.find(p => String(p).toLowerCase().includes(w) || w.includes(String(p).toLowerCase())); return part || null; };
    // the condition
    let when = null, cond = '';
    let m = t.match(new RegExp(`\\b(?:if|when|whenever|once)\\s+(?:there are\\s+)?(more than|over|at least|any|(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+or more)?\\s*(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|any)?\\s*${THREAT}\\b(?:\\s+(?:come|comes|appear|appears|attack|attacks|show up|arrive|arrives|are about|are near|get close))?`));
    if (m) {
      const q = m[1] || '', n = nm((m[2] || (q === 'any' ? 'any' : '')).trim()) ?? nm(q.split(' ')[0]) ?? 0;
      const k = /more than|over/.test(q) ? n : /at least|or more/.test(q) ? n - 1 : (m[2] && !/^(a|any)$/.test(m[2]) ? n - 1 : 0);
      when = `raiders > ${Math.max(0, k)}`; cond = k > 0 ? `more than ${k} raiders are about` : 'raiders come';
      if (/\bnear|close|by the\b/.test(t.slice(m.index, m.index + m[0].length + 30))) { when += ' and raider_near < 8'; cond += ' close by'; }
    }
    else if ((m = t.match(/\b(?:at|when it is|when it's|come)\s+(night|nightfall|dusk|dawn|morning|noon|midnight)\b/))) {
      const H = { night: 21, nightfall: 20, dusk: 18, dawn: 6, morning: 8, noon: 12, midnight: 0 }[m[1]];
      when = H === 0 ? 'hour < 1' : `hour >= ${H} and hour < ${H + 1}`; cond = 'at ' + m[1];
    }
    else if ((m = t.match(/\bif\s+(?:the\s+)?([a-z ]+?)\s+(?:runs? (?:out|low)|is empty|are gone)\b/))) { when = `stock_${m[1].trim().replace(/\s+/g, '_')} < 1`; cond = `the ${m[1].trim()} runs out`; }
    else if ((m = t.match(/\bif\s+(?:the\s+)?([a-z_]+)\s+(?:is )?(?:below|under|less than|drops below)\s+(\d+)\b/))) { when = `${m[1]} < ${m[2]}`; cond = `${m[1]} is below ${m[2]}`; }
    if (!when) return { error: 'no condition I understand (try "if more than two wolves come, ..." or "at night, ...")' };
    // the action
    const act = t.replace(m[0], ' ');
    const out = { when, do: {}, as: null, text: '', every: 0 }, said = [];
    let a;
    if (/\b(ring|sound|blow)\b.*\b(bell|alarm|horn)\b/.test(act)) { out.do.alarm = true; said.push('sound the alarm'); }
    if (/\b(everyone|all)\b.*\b(inside|home|indoors|hide)\b|\bhide\b/.test(act)) { out.do.all = 'home'; said.push('send everyone indoors'); }
    if ((a = act.match(/\b(wake|rouse|call|fetch|send for|alert|warn)\s+(?:up\s+)?(?:the\s+)?([a-z_ -]+?)(?:\s+up)?\s*(?:[,.;!]|\band\b|$)/)) && !/^(me|us|the player)$/.test(a[2].trim())) {
      const id = who(a[2]);
      if (id) { out.do.wake = id; out.as = id; said.push(`wake ${id} and send them to the threat`); }
      else if (/everyone|all|the village|people/.test(a[2])) { out.do.all = out.do.all || 'wake'; said.push('wake everyone'); }
      else return { error: `who is "${a[2].trim()}"? (${people.slice(0, 8).join(', ')})` };
    }
    if (!out.do.wake && (a = act.match(/\b(?:send|have|make|get)\s+(?:the\s+)?([a-z_ -]+?)\s+to\s+(?:the\s+)?([a-z_ -]+?)\s*(?:[,.;!]|\band\b|$)/))) {
      const id = who(a[1]); if (id) { out.do.go = { who: id, to: a[2].trim() }; out.as = id; said.push(`send ${id} to the ${a[2].trim()}`); }
    }
    if (/\b(tell|warn|alert|notify|wake)\s+(me|us)\b/.test(act)) { out.do.notify = true; said.push('tell you'); }
    if (!said.length) return { error: 'no action I understand (wake someone, sound the alarm, everyone inside, send someone somewhere, tell me)' };
    out.text = said.join(' and ');
    out.cond = cond; out.source = String(text).trim();
    return out;
  }
  function describeOrder(r) {
    if (!r) return '';
    const what = r.text || [r.do?.wake && `wake ${r.do.wake}`, r.do?.alarm && 'sound the alarm', r.do?.all === 'home' && 'send everyone indoors', r.do?.go && `send ${r.do.go.who} to the ${r.do.go.to}`, r.do?.notify && 'tell you', r.do?.act && `${r.as || 'someone'}: ${[].concat(r.do.act).join(', ')}`, r.do?.set && `set ${Object.keys(r.do.set).join(', ')}`].filter(Boolean).join(', ') || 'do something';
    const cond = r.cond || String(r.when || '').replace(/\braiders > (\d+)/, (x, n) => +n ? `more than ${n} raiders are about` : 'raiders come').replace(/\braider_near < (\d+)/, 'one is within $1 squares').replace(/\band\b/g, 'and');
    return `When ${cond}: ${what}.`;
  }
  function createOrders({ now = () => 0 } = {}) {
    let seq = 0; const all = [];
    const add = r => { if (!r || !r.when || !r.do) throw new Error('a standing order needs "when" and "do"'); const o = { id: r.id || 'o' + (++seq), ...r, on: r.on !== false, held: false, last: -1e9, fired: 0 }; all.push(o); return o; };
    const remove = id => { const i = all.findIndex(o => o.id === id); if (i >= 0) all.splice(i, 1); };
    function tick(holds) {
      const t = now(), out = [];
      for (const o of all) {
        if (!o.on) continue;
        let h = false; try { h = !!holds(o); } catch { h = false; }
        if (h && (!o.held || (o.every > 0 && t - o.last >= o.every))) { o.last = t; o.fired++; out.push(o); }
        o.held = h;
      }
      return out;
    }
    return { add, remove, tick, list: () => all.slice(), get: id => all.find(o => o.id === id) || null, data: () => ({ seq, all: JSON.parse(JSON.stringify(all)) }), load: x => { all.length = 0; seq = +x?.seq || 0; for (const o of x?.all || []) all.push(o); }, clear: () => { all.length = 0; } };
  }

  // ---------------------------------------------------------------- resources
  function createResources() {
    const defs = {}, vals = {};
    function declare(name, d = {}) {
      const n = String(name); const min = Number.isFinite(+d.min) ? +d.min : 0, max = Number.isFinite(+d.max) ? +d.max : 1e9;
      defs[n] = { name: n, label: d.label || n.replace(/_/g, ' '), icon: d.icon || '', min, max, perHour: d.perHour ?? 0, show: d.show !== false, color: d.color || null, from: d.from || null };
      if (!(n in vals)) vals[n] = clamp(Number.isFinite(+d.start) ? +d.start : 0, min, max);
      return defs[n];
    }
    const get = n => vals[n] ?? 0;
    const set = (n, v) => { const d = defs[n] || declare(n); vals[n] = clamp(+v || 0, d.min, d.max); return vals[n]; };
    const add = (n, k) => set(n, get(n) + (+k || 0));
    const can = (n, k) => get(n) >= (+k || 0);
    // perHour: a number, or a function (value, ctx) -> the change (a package's rule: belief grows with the faithful)
    function hour(h = 1, ctx = {}) { for (const d of Object.values(defs)) { const r = typeof d.perHour === 'function' ? d.perHour(get(d.name), ctx) : d.perHour; if (Number.isFinite(+r) && +r) add(d.name, +r * h); } }
    return { declare, get, set, add, can, hour, defs: () => ({ ...defs }), values: () => ({ ...vals }), data: () => ({ ...vals }), load: x => { for (const [k, v] of Object.entries(x || {})) vals[k] = +v || 0; }, clear: () => { for (const k of Object.keys(defs)) delete defs[k]; for (const k of Object.keys(vals)) delete vals[k]; } };
  }

  // ---------------------------------------------------------------- demand words (code templates; a brain fills the same shape)
  // "bring three bread to the shrine by evening", "the farmers must deliver 5 wheat to the barn by day 3",
  // "build a wall around the shrine by tomorrow" (a demand whose work is a designation)
  const WHEN = { morning: 8, noon: 12, evening: 18, dusk: 18, night: 21, nightfall: 20, midnight: 24, sunset: 19, dawn: 6 };
  function parseDemand(text, { now = 0, items = [], places = [], groups = {}, people = [] } = {}) {
    const t = String(text || '').toLowerCase().replace(/[’']/g, "'").trim();
    if (!t) return { error: 'say what you demand' };
    const day = Math.floor(now / 1440), mins = now % 1440;
    // by when
    let by = null, byText = '';
    let m = t.match(/\bby\s+(tomorrow\s+)?(morning|noon|evening|dusk|night|nightfall|midnight|sunset|dawn)\b/);
    if (m) { let at = day * 1440 + WHEN[m[2]] * 60; if (m[1] || at <= now) at += 1440; by = at; byText = (m[1] ? 'tomorrow ' : '') + m[2]; }
    else if ((m = t.match(/\bby\s+tomorrow\b/))) { by = (day + 1) * 1440 + 18 * 60; byText = 'tomorrow evening'; }
    else if ((m = t.match(/\bwithin\s+(\d+|a|an|one|two|three)\s+(hours?|days?)\b/))) { const n = nm(m[1]) || 1; by = now + n * (/day/.test(m[2]) ? 1440 : 60); byText = `within ${n} ${m[2]}`; }
    else if ((m = t.match(/\bby\s+day\s+(\d+)\b/))) { by = (+m[1] - 1) * 1440 + 18 * 60; byText = 'day ' + m[1]; }
    // of whom
    let of = 'all', ofText = 'everyone';
    for (const g of Object.values(groups)) { const names = [g.id, g.name].map(x => String(x).toLowerCase().replace(/_/g, ' ')); if (names.some(n => new RegExp('\\b' + n + 's?\\b').test(t))) { of = { group: g.id }; ofText = 'the ' + g.name; break; } }
    if (of === 'all') { const p = people.find(p => new RegExp('\\b' + String(p).toLowerCase() + '\\b').test(t)); if (p && !/\bto\s+/.test(t.slice(t.indexOf(String(p).toLowerCase()) - 4, t.indexOf(String(p).toLowerCase())))) { of = { id: p }; ofText = p; } }
    // what: deliver N item to place
    m = t.match(/\b(?:bring|deliver|offer|give|leave|carry|take)\s+(?:me\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)?\s*([a-z][a-z ]*?)\s+(?:to|at|for)\s+(?:the\s+)?([a-z][a-z _-]*?)(?:\s+by\b|\s+within\b|[,.;!]|$)/);
    if (m) {
      const n = nm(m[1] || 'one') || 1; let item = m[2].trim().replace(/\b(loaves|loaf)\b/, 'bread').replace(/^(some|the)\s+/, '');
      const known = items.find(i => item === String(i).toLowerCase() || item.replace(/s$/, '') === String(i).toLowerCase()); if (known) item = known; else item = item.replace(/(?<!s)s$/, '');
      const to = m[3].trim(), place = places.find(p => String(p).toLowerCase() === to) || to;
      return { text: `${ofText === 'everyone' ? 'Bring' : ofText + ': bring'} ${n} ${item} to the ${place}${byText ? ' by ' + byText : ''}.`, of, by, met: { deliver: { item, n, to: place } }, template: 'deliver' };
    }
    // build / dig / clear something (a designation: the plan language)
    if (/\b(build|wall|fence|dig|clear|stockpile|farm|plant)\b/.test(t)) return { text: String(text).trim().replace(/^./, c => c.toUpperCase()), of, by, met: { designation: true }, plan: t, template: 'work' };
    // a flag ("light the beacon" -> world.beacon_lit)
    m = t.match(/\b(light|raise|ring|open|close|repair|kill|drive off|find)\s+(?:the\s+)?([a-z][a-z _]*?)(?:\s+by\b|\s+within\b|[,.;!]|$)/);
    if (m) { const flag = m[2].trim().replace(/\s+/g, '_') + '_' + { light: 'lit', raise: 'raised', ring: 'rung', open: 'open', close: 'closed', repair: 'repaired', kill: 'dead', 'drive off': 'gone', find: 'found' }[m[1]]; return { text: String(text).trim().replace(/^./, c => c.toUpperCase()), of, by, met: { flag }, template: 'flag' }; }
    return { error: 'no demand I understand (try "bring 3 bread to the shrine by evening")' };
  }

  root.TablefolkOrdersCore = { createBoard, createDemands, normalizeGroups, groupsOf, autonomyFor, parseOrder, describeOrder, createOrders, createResources, parseDemand, STANDING };
})(typeof window !== 'undefined' ? window : globalThis);
