/* powers.js -- the player's action bar, named resources on a small HUD, and
 * powers: player-side actions packages declare (God / Dungeon Keeper play).
 *
 * The bar (#powerBar, bottom middle): buttons the game and packages add.
 * Core puts "Mark" there (designate.js) and "Orders" (orders.js); a package
 * adds its powers (below) or buttons of its own (api.bar.add). Everything a
 * package added is removed when its scenario ends.
 *   tablefolkBar.add({ id, label, icon, title, run(), order }) -> remove(); .remove(id); .set(id, patch); .list()
 * Resources (#resourceHud, top left): named world variables (belief, mana)
 * with limits and a change an hour; each is also the world flag of its name
 * (conditions read world.belief; a trigger can fire on it; saved with the
 * flags). A package declares them ("resources" in tablefolk.json or a module's
 * resources), a scenario's "resources" sets their start.
 *   tablefolkResources.declare(name, { start, min, max, perHour, label, icon, show, color }), .get(name), .add(name, n),
 *     .set(name, v), .can(name, n), .list()
 * Powers: { label, icon, cost: { belief: 5 } (or a number with "resource"), target: 'none' | 'place' |
 *   'area' | 'character' | 'group', cooldown (seconds), run(target, ctx) }. Clicking one picks its target
 * on the map (a square, a dragged area, a character, or a group from a list), pays the cost and runs it;
 * a run that returns false or { fail } is refunded. target: { x, z, place } | { cells, rect } | { who } | { group, members }.
 * ctx: { api, resources, weather, designate, demands, say, toast }.
 *   tablefolkPowers.register(name, def, from), .remove(name), .use(name, target?), .list(), .resetPackaged()
 * Loaded after packages.js, before designate.js; uses app.js globals (state, meta).
 */
(function () {
  const OC = () => window.TablefolkOrdersCore;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = (t, type) => window.tablefolkToast?.(t, { type: type || 'info' });
  if (!document.getElementById('tfPowerCss')) {
    const css = document.createElement('style'); css.id = 'tfPowerCss';
    css.textContent = `#powerBar{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:32;display:flex;gap:6px;align-items:center;padding:5px 7px;border-radius:16px;background:rgba(20,24,30,.72);box-shadow:0 2px 10px rgba(0,0,0,.3);max-width:94vw;overflow-x:auto}
#powerBar[hidden]{display:none}
#powerBar button{white-space:nowrap;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:54px;padding:4px 8px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:rgba(255,255,255,.06);color:#f3ead7;font:600 11.5px/1.2 system-ui,sans-serif;cursor:pointer}
#powerBar button .ic{font-size:19px;line-height:1.1}
#powerBar button .cost{font-weight:500;font-size:10px;opacity:.75}
#powerBar button:hover{background:rgba(255,255,255,.14)}#powerBar button.on{background:#c8913a;border-color:#ffd38a;color:#1b1206}
#powerBar button:disabled{opacity:.4;cursor:default}
#resourceHud{position:fixed;top:62px;left:66px;z-index:31;display:flex;gap:6px;flex-wrap:wrap;max-width:46vw}
#resourceHud[hidden]{display:none}
#resourceHud span{padding:3px 10px;border-radius:12px;background:rgba(20,24,30,.66);color:#f3ead7;font:600 12.5px/1.4 system-ui,sans-serif}
#resourceHud span b{font-weight:700;margin-left:4px}
#tfPickBar{position:fixed;left:50%;bottom:146px;transform:translateX(-50%);z-index:33;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;padding:6px 10px;border-radius:14px;background:rgba(20,24,30,.86);color:#f3ead7;font:600 12.5px/1.4 system-ui,sans-serif;max-width:94vw}
#tfPickBar[hidden]{display:none}
#tfPickBar button,#tfPickBar select{padding:3px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#f3ead7;font:600 12px system-ui,sans-serif;cursor:pointer}
#tfPickBar button.go{background:#3d8a4f;border-color:#7fd08f}#tfPickBar input{padding:3px 8px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;font:500 12.5px system-ui,sans-serif;min-width:220px}
#tfPickBar small{font-weight:500;opacity:.8}
html.tabletop #powerBar,html.tabletop #resourceHud{display:none}`;
    document.head.appendChild(css);
  }

  // ---------------------------------------------------------------- the bar
  const buttons = new Map();   // id -> { id, label, icon, title, run, order, from, cost, disabled, on }
  let barEl = null, pickEl = null;
  function barNode() { if (!barEl) { barEl = document.createElement('div'); barEl.id = 'powerBar'; barEl.hidden = true; document.body.appendChild(barEl); barEl.addEventListener('click', e => { const b = e.target.closest('button[data-bar]'); if (!b) return; e.stopPropagation(); const x = buttons.get(b.dataset.bar); if (x && !b.disabled) try { x.run(); } catch (err) { console.warn('[bar]', x.id, err); } }); } return barEl; }
  function render() {
    const el = barNode(), list = [...buttons.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    const shown = list.filter(b => b.when ? b.when() : true);
    el.hidden = !shown.length || !window.tablefolkScenario?.active;
    el.innerHTML = shown.map(b => `<button type="button" data-bar="${esc(b.id)}" title="${esc(b.title || b.label)}"${b.disabled?.() ? ' disabled' : ''} class="${b.on?.() ? 'on' : ''}"><span class="ic">${b.icon || '✦'}</span><span>${esc(b.label)}</span>${b.cost ? `<span class="cost">${esc(b.cost())}</span>` : ''}</button>`).join('');
  }
  const add = b => { if (!b?.id || typeof b.run !== 'function') throw new Error('a bar button needs an id and run()'); buttons.set(String(b.id), { ...b, id: String(b.id) }); render(); return () => remove(b.id); };
  const remove = id => { buttons.delete(String(id)); render(); };
  const set = (id, patch) => { const b = buttons.get(String(id)); if (b) { Object.assign(b, patch); render(); } };

  // the strip above the bar where a tool asks for something (a target, a confirmation)
  function pick(html, on = {}) {
    if (!pickEl) { pickEl = document.createElement('div'); pickEl.id = 'tfPickBar'; pickEl.hidden = true; document.body.appendChild(pickEl);
      pickEl.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { e.stopPropagation(); pickEl._on?.[b.dataset.pick]?.(b); } });
      pickEl.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') pickEl._on?.enter?.(e.target); if (e.key === 'Escape') pickEl._on?.cancel?.(); });
      pickEl.addEventListener('keyup', e => e.stopPropagation());
      pickEl.addEventListener('change', e => { const t = e.target.closest('[data-change]'); if (t) pickEl._on?.[t.dataset.change]?.(t); }); }
    if (html == null) { pickEl.hidden = true; pickEl._on = null; return null; }
    pickEl.innerHTML = html; pickEl._on = on; pickEl.hidden = false; return pickEl;
  }

  // ---------------------------------------------------------------- picking on the map (shared with designate.js)
  // a cell under the pointer: the board's ground plane (no mesh needed)
  function cellAt(ev) {
    const sc = state.scene, cam = state.camera; if (!sc || !cam) return null;
    const r = canvas()?.getBoundingClientRect(), px = ev && r ? ev.clientX - r.left : sc.pointerX, py = ev && r ? ev.clientY - r.top : sc.pointerY;
    const ray = sc.createPickingRay(px, py, BABYLON.Matrix.Identity(), cam);
    const y = state.terrainTopY ?? 0; if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (y - ray.origin.y) / ray.direction.y; if (t < 0) return null;
    const p = ray.origin.add(ray.direction.scale(t)), bx = WORLD.halfW - 1, bz = WORLD.halfH - 1;
    const x = Math.round(p.x), z = Math.round(p.z); if (Math.abs(x) > bx || Math.abs(z) > bz) return null;
    return { x, z };
  }
  function charAt(ev) {
    const sc = state.scene, r = canvas()?.getBoundingClientRect(); const p = sc.pick(ev && r ? ev.clientX - r.left : sc.pointerX, ev && r ? ev.clientY - r.top : sc.pointerY, m => !!m.metadata?.ownerId);
    const id = p?.pickedMesh?.metadata?.ownerId; if (id) return state.characters.find(c => c.id === id) || null;
    const c = cellAt(ev); if (!c) return null;
    return state.characters.filter(g => !g.defeated).map(g => ({ g, d: Math.hypot((g.logicalPos || g.root.position).x - c.x, (g.logicalPos || g.root.position).z - c.z) })).filter(x => x.d < 1.2).sort((a, b) => a.d - b.d)[0]?.g || null;
  }
  // a pointer tool on the canvas: { down(cell, ev), move(cell, ev), up(cell, ev), click(cell, ev) }, Esc ends it
  let tool = null;
  const canvas = () => document.getElementById('renderCanvas') || document.querySelector('canvas');
  function useTool(t) { tool = t; document.documentElement.classList.toggle('tf-tool', !!t); if (canvas()) canvas().style.cursor = t ? 'crosshair' : ''; render(); }
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) addEventListener(type, ev => {
    // (over the scene: the canvas, or the HUD's transparent layers above it; never the game's own controls)
    if (!tool || ev.target?.closest?.('#tfPickBar,#powerBar,#resourceHud,#topBar,#chatDock,#panel,.pane,button,input,select,textarea,a,[role=dialog]')) return;
    if (type === 'pointerdown' && ev.button !== 0) return;
    const cell = cellAt(ev);
    if (type === 'pointerdown') { tool._down = { x: ev.clientX, y: ev.clientY }; tool.down?.(cell, ev); }
    else if (type === 'pointermove') { if (!tool._down && !tool.hover) return; (tool._down ? tool.move : tool.hover)?.(cell, ev); if (!tool._down) return; }
    else if (type === 'pointerup') { const d = tool._down; tool._down = null; if (d && Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) < 6) tool.click?.(cell, ev); else tool.up?.(cell, ev); }
    ev.stopImmediatePropagation(); ev.preventDefault();
  }, { capture: true });
  addEventListener('keydown', e => { if (e.key === 'Escape' && tool) { e.stopImmediatePropagation(); const t = tool; useTool(null); t.cancel?.(); } }, true);

  // ---------------------------------------------------------------- resources
  let R = null;
  const fromPkg = new Set();
  const core = () => (R ||= OC().createResources());
  function declare(name, d = {}, from = null) {
    const n = String(name).replace(/[^a-z0-9_]/gi, '_').toLowerCase(); if (!n) return null;
    const flag = window.tablefolkStory?.get?.(n);
    const def = core().declare(n, { ...d, from });
    if (Number.isFinite(+flag) && flag !== '' && flag != null) core().set(n, +flag);
    if (from) fromPkg.add(n);
    mirror(n); hud(); return def;
  }
  function mirror(n) { try { const v = core().get(n); if (window.tablefolkStory?.get?.(n) !== v) window.tablefolkStory?.set?.(n, v); } catch {} }
  const resources = {
    declare, get: n => core().get(n), can: (n, k) => core().can(n, k),
    add: (n, k) => { const v = core().add(n, k); mirror(n); hud(); return v; },
    set: (n, v) => { const x = core().set(n, v); mirror(n); hud(); return x; },
    list: () => Object.values(core().defs()).map(d => ({ ...d, value: core().get(d.name) })),
  };
  let hudEl = null;
  function hud() {
    hudEl ||= Object.assign(document.createElement('div'), { id: 'resourceHud' }); if (!hudEl.parentNode) document.body.appendChild(hudEl);
    const list = resources.list().filter(d => d.show);
    hudEl.hidden = !list.length;
    hudEl.innerHTML = list.map(d => `<span title="${esc(d.label)}"${d.color ? ` style="border-left:3px solid ${esc(d.color)}"` : ''}>${d.icon ? esc(d.icon) + ' ' : ''}${esc(d.label)}<b>${Math.round(d.value * 10) / 10}</b></span>`).join('');
    render();
  }
  // a flag of the same name changed elsewhere (a trigger, a workflow): the resource follows it
  addEventListener('tablefolk-flag', e => { const n = e.detail?.name; if (R && n && core().defs()[n] && Number.isFinite(+e.detail.value) && +e.detail.value !== core().get(n)) { core().set(n, +e.detail.value); hud(); } });
  // the change an hour, every game quarter hour
  addEventListener('tablefolk-clock', () => {
    if (!R) return;
    const groups = window.tablefolkGroups?.all?.() || {};
    const ctx = { api: window.tablefolkPackages?.api?.(), people: state.characters.filter(c => !c.defeated).length, groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.members.length])), flags: window.tablefolkStory?.all?.() || {} };
    try { core().hour(.25, ctx); } catch (e) { console.warn('[resources]', e); }
    for (const n of Object.keys(core().defs())) mirror(n);
    hud();
  });

  // ---------------------------------------------------------------- powers
  const POWERS = new Map(), cool = new Map();
  const costOf = p => { const c = p.cost; if (c == null) return {}; if (typeof c === 'number') return { [p.resource || Object.keys(core().defs())[0] || 'mana']: c }; return c; };
  const costText = p => Object.entries(costOf(p)).map(([k, v]) => `${v} ${core().defs()[k]?.label || k}`).join(', ');
  const affordable = p => Object.entries(costOf(p)).every(([k, v]) => core().can(k, v));
  function register(name, def, from = null) {
    if (!def || typeof def.run !== 'function') throw new Error(`power ${name}: needs run(target, ctx)`);
    const p = { name: String(name), label: def.label || String(name).replace(/_/g, ' '), icon: def.icon || '✦', target: ['none', 'place', 'area', 'character', 'group'].includes(def.target) ? def.target : 'none', cooldown: +def.cooldown || 0, cost: def.cost, resource: def.resource, run: def.run, description: def.description || '', when: def.when, from };
    POWERS.set(p.name, p);
    add({ id: 'power:' + p.name, label: p.label, icon: p.icon, title: (p.description || p.label) + (p.cost ? ` (costs ${costText(p)})` : ''), order: 60, from,
      cost: () => p.cost ? costText(p) : '', disabled: () => !affordable(p) || (cool.get(p.name) || 0) > Date.now(), on: () => tool?.power === p.name, when: p.when ? () => { try { return !!p.when(ctxFor()); } catch { return true; } } : null,
      run: () => begin(p.name) });
    return p;
  }
  const unregister = name => { POWERS.delete(name); remove('power:' + name); };
  const ctxFor = () => ({ api: window.tablefolkPackages?.api?.(), resources, weather: window.tablefolkWeather, designate: window.tablefolkDesignate, demands: window.tablefolkDemands, groups: window.tablefolkGroups, say: (g, t) => window.tablefolkPackages?.api?.().say?.(g, t, true), toast });
  async function use(name, target = null) {
    const p = POWERS.get(name); if (!p) return { fail: `no power ${name}` };
    if ((cool.get(p.name) || 0) > Date.now()) return { fail: `${p.label} is not ready yet` };
    if (!affordable(p)) { toast(`Not enough for ${p.label} (${costText(p)})`, 'warn'); return { fail: 'cannot afford it' }; }
    const cost = costOf(p); for (const [k, v] of Object.entries(cost)) resources.add(k, -v);
    let r; try { r = await p.run(target, ctxFor()); } catch (e) { console.warn('[powers]', name, e); r = { fail: e.message || String(e) }; }
    if (r === false || (r && typeof r === 'object' && r.fail)) { for (const [k, v] of Object.entries(cost)) resources.add(k, v); const why = r?.fail || `${p.label} did nothing`; toast(why, 'warn'); return { fail: why }; }
    if (p.cooldown) { cool.set(p.name, Date.now() + p.cooldown * 1000); setTimeout(render, p.cooldown * 1000 + 50); }
    if (typeof r === 'string') { try { window.tablefolkDirector?.narrate?.(r); } catch {} try { log(r); } catch {} }
    window.dispatchEvent(new CustomEvent('tablefolk-power', { detail: { name: p.name, target: target ? { ...target, who: target.who?.id || target.who } : null, from: p.from } }));
    render(); return r ?? true;
  }
  // choose the target, then use it
  function begin(name) {
    const p = POWERS.get(name); if (!p) return;
    if (tool?.power === name) { useTool(null); pick(null); return; }
    if (p.target === 'none') { use(name); return; }
    if (p.target === 'group') {
      const gs = Object.values(window.tablefolkGroups?.all?.() || {});
      if (!gs.length) { toast('There are no groups in this world', 'warn'); return; }
      pick(`<span>${esc(p.icon)} ${esc(p.label)}: on which group?</span>` + gs.map(g => `<button type="button" data-pick="g:${esc(g.id)}">${esc(g.name)} (${g.members.length})</button>`).join('') + `<button type="button" data-pick="cancel">cancel</button>`,
        Object.fromEntries([...gs.map(g => ['g:' + g.id, () => { pick(null); use(name, { group: g.id, members: g.members.slice() }); }]), ['cancel', () => pick(null)]]));
      return;
    }
    const say = { place: 'click a square', area: 'drag over an area', character: 'click a character' }[p.target];
    pick(`<span>${esc(p.icon)} ${esc(p.label)}: ${say}</span><small>${esc(p.cost ? costText(p) : '')}</small><button type="button" data-pick="cancel">cancel</button>`, { cancel: () => { useTool(null); pick(null); } });
    let start = null;
    const done = target => { useTool(null); pick(null); window.tablefolkDesignate?.ghost?.(null); use(name, target); };
    useTool({ power: name,
      click: (cell, ev) => {
        if (p.target === 'character') { const g = charAt(ev); if (g) done({ who: g, x: Math.round((g.logicalPos || g.root.position).x), z: Math.round((g.logicalPos || g.root.position).z) }); return; }
        if (!cell) return;
        if (p.target === 'place') done({ ...cell, place: window.tablefolkJobs?.places?.placeAt?.(cell.x, cell.z)?.id || null });
        else done({ cells: [cell], rect: [cell.x, cell.z, cell.x, cell.z], x: cell.x, z: cell.z });
      },
      down: cell => { start = cell; },
      move: cell => { if (p.target === 'area' && start && cell) window.tablefolkDesignate?.ghost?.(rectCells(start, cell), '#e8c25a'); },
      up: cell => { if (p.target === 'area' && start && cell) { const cells = rectCells(start, cell); done({ cells, rect: [Math.min(start.x, cell.x), Math.min(start.z, cell.z), Math.max(start.x, cell.x), Math.max(start.z, cell.z)], x: Math.round((start.x + cell.x) / 2), z: Math.round((start.z + cell.z) / 2) }); } start = null; },
      cancel: () => { pick(null); window.tablefolkDesignate?.ghost?.(null); } });
  }
  const rectCells = (a, b) => { const out = []; for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) out.push({ x, z }); return out; };

  // ---------------------------------------------------------------- a scenario's own; what packages brought goes with it
  function resetPackaged() {
    for (const [n, p] of [...POWERS]) if (p.from) unregister(n);
    for (const [id, b] of [...buttons]) if (b.from) buttons.delete(id);
    R?.clear(); R = null; fromPkg.clear(); cool.clear();
    if (tool) useTool(null); pick(null); render(); hud();
  }
  addEventListener('tablefolk-scenario-started', e => {
    if (e.detail?.sub) return;
    const scn = window.tablefolkScenario?.active?.scn || {};
    // (the story's flags were reset after the packages declared theirs: write them again, or take a saved value)
    for (const n of Object.keys(R ? core().defs() : {})) { const f = window.tablefolkStory?.get?.(n); if (f != null && f !== '' && Number.isFinite(+f)) core().set(n, +f); else mirror(n); }
    // the scenario's "resources": { "belief": { "start": 5, "label": "Belief", "icon": "🙏", "perHour": 1 } } (declares or sets the start)
    for (const [n, d] of Object.entries(scn.resources || {})) { const was = core().defs()[n]; declare(n, { ...(was || {}), ...(typeof d === 'number' ? { start: d } : d) }, was?.from || null); if (d && (typeof d === 'number' || d.start != null) && window.tablefolkStory?.get?.(n) == null) resources.set(n, typeof d === 'number' ? d : +d.start); }
    hud(); render();
  });
  (window.tablefolkSaveHooks ||= {}).resources = { save: () => R ? core().data() : null, restore: x => { if (!x) return; for (const [n, v] of Object.entries(x)) { if (!core().defs()[n]) core().declare(n, {}); core().set(n, v); mirror(n); } hud(); } };
  window.tablefolkBar = { add, remove, set, list: () => [...buttons.values()], render, pick, useTool, tool: () => tool, cellAt, charAt };
  window.tablefolkResources = { declare, get: resources.get, add: resources.add, set: resources.set, can: resources.can, list: resources.list };
  window.tablefolkPowers = { register, remove: unregister, use, begin, list: () => [...POWERS.values()], resetPackaged, costText };
})();
