/* map-editor.js -- the world builder's map: the scenario drawn from 2D tiles
 * (fast: a canvas, no 3D), and edited by hand.
 *
 *   const ed = tfMapEditor.mount(el, { onChange(scn), onSelect(info) })
 *   ed.load(scenario)    show a scenario (a copy is laid out; the original
 *                        is changed only when something is edited)
 *   ed.fit()             the whole board in view
 *
 * Pictures: assets/tiles/tiles.json and its PNGs (app/tile-render.js renders
 * them from the 3D models; tools/browser-test/render-tiles.mjs saves them).
 * Floors are drawn from the floor textures themselves. A thing with no tile
 * yet (a new pack item, a new body) is drawn as a badge, and its tile is
 * rendered on the spot in a hidden 3D page (/app/?tabletop=1&tiles=1&only=..),
 * kept in this browser (IndexedDB) and, for a logged-in admin, saved on the
 * server (POST /api/admin/tiles) for everyone.
 *
 * Editing turns any layout (generated, ASCII grid, fixed) into the fixed
 * form the app runs as is: "size", "objects" (walls and doors too) with x/z,
 * "paint" for floors, "at" for everyone, "locked" by position. A scenario
 * whose layout is "map" lines (placed by the app) is laid out by the 3D page
 * once, then edited the same way.
 *
 * Tools: select / move (drag things, Delete removes, R turns), walls (drag;
 * on a wall: removes), doors (click a wall; on a door: lock / unlock),
 * floor (drag, with a material), erase, and placing from the palette
 * (monsters, people, objects; drag one in, or click it and click the map).
 * Pan: drag empty floor, the middle or right button, or Space + drag; wheel
 * zooms about the pointer; F fits. Ctrl+Z / Ctrl+Shift+Z undo / redo.
 * World coordinates as in the app: column c is x = x0 - c, row r is
 * z = r - z0 (north up, screen right is -x).
 */
(function () {
  const TILES = '/app/assets/tiles/', TEX = '/app/assets/textures/';
  // floors: texture and tint (app.js PAINT_MATERIALS), or a flat colour
  const FLOORS = {
    stone: { file: 'stone_blocks.png', tint: [1.1, 1.06, .98] }, flagstone: { file: 'stone_soft.png', tint: [1.02, .99, .93] },
    dirt: { file: 'dirt_path.png', tint: [1, 1, 1] }, wood: { file: 'wood_planks.png', tint: [.95, .9, .85] },
    sand: { file: 'dirt_loam.png', tint: [1.25, 1.1, .8] }, grass: { file: 'grass_meadow.png', tint: [1, 1, 1] },
    water: { file: 'water_soft.png', tint: [.55, .8, 1] }, lava: { tile: 'lava', color: '#d2541e' },
    oak: { color: '#b98b5a', planks: true }, tile: { color: '#e4e1db', grout: true }, concrete: { file: 'stone_soft.png', tint: [.85, .85, .84] },
    carpet: { color: '#66727f' }, sea: { color: '#173550' },
  };
  const FLOOR_NAMES = Object.keys(FLOORS);
  const MONSTERS = ['goblin', 'kobold', 'orc', 'troll', 'skeleton', 'skeleton_warrior', 'skeleton_farmer', 'skeleton_classic', 'skeleton_warrior_classic', 'zombie', 'ghost', 'rat', 'spider', 'wolf', 'bat', 'slime', 'demon', 'giant', 'dragon', 'goblin_classic', 'orc_classic'];
  const PEOPLE = ['villager', 'peasant', 'peasant_woman', 'farmer', 'woodsman', 'huntress', 'adventurer', 'adventurer_woman', 'hooded', 'king', 'witch', 'wizard'];
  const MINDLESS = new Set(['skeleton', 'skeleton_classic', 'skeleton_warrior', 'skeleton_warrior_classic', 'skeleton_farmer', 'zombie', 'rat', 'spider', 'wolf', 'bat', 'slime', 'ghost', 'giant', 'demon', 'dragon', 'troll']);
  const OBJECT_GROUPS = [
    ['Treasure', ['chest', 'iron_chest', 'coin_pile', 'key', 'potion', 'scroll', 'chalice', 'bag', 'note']],
    ['Light', ['torch', 'candelabra', 'candles', 'lantern', 'lamp', 'campfire', 'floor_lamp']],
    ['Furniture', ['table', 'bench', 'stool', 'wooden_chair', 'bed', 'double_bed', 'bookcase', 'bookshelf', 'cabinet', 'nightstand', 'desk', 'lectern', 'armchair', 'sofa', 'coffee_table', 'office_chair', 'plant']],
    ['Storage', ['barrel', 'crate', 'iron_crate', 'apple_barrel', 'apple_crate', 'carrot_crate', 'bucket', 'pot', 'vase', 'broken_pot', 'cauldron']],
    ['Work', ['anvil', 'workbench', 'weapon_stand', 'axe', 'pickaxe', 'rope', 'logs', 'dummy', 'target', 'cage', 'chains', 'wall_banner', 'banner']],
    ['Outdoors', ['tree', 'boulder', 'flowers', 'grass_tuft', 'mushroom', 'pumpkin', 'fence', 'signpost', 'well', 'cart', 'broken_cart', 'tent', 'market_stand', 'market_stalls', 'statue', 'lily_pad']],
    ['Buildings', ['house', 'fantasy_house', 'stable', 'windmill', 'bell_tower', 'watch_tower']],
  ];
  const GLYPHS = { '#': 'wall', '+': 'door', '~': 'water', ',': 'grass', ':': 'dirt', '^': 'stone', '&': 'lava', '=': 'wood', '_': 'oak',
    C: 'crate', B: 'barrel', M: 'mushroom', L: 'lamp', N: 'note', h: 'chest', w: 'workbench', t: 'table', n: 'bench', s: 'stool',
    o: 'cauldron', a: 'anvil', W: 'weapon_stand', '/': 'axe', p: 'pickaxe', u: 'bucket', b: 'bag', P: 'potion', S: 'scroll',
    $: 'coin_pile', D: 'desk', c: 'office_chair', A: 'armchair', F: 'sofa', T: 'coffee_table', l: 'floor_lamp', v: 'plant',
    K: 'bookcase', Y: 'player', '@': 'player', '-': 'sea', '%': 'tree', H: 'house', r: 'boulder', X: 'campfire', f: 'fence', I: 'signpost', j: 'lantern',
    '*': 'flowers', ';': 'grass_tuft', q: 'lily_pad on sea' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = s => String(s || '').replace(/_/g, ' ');
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- tiles ----------
  const tiles = { manifest: null, img: new Map(), ready: null, pending: new Set(), listeners: new Set() };
  const changed = () => { for (const f of tiles.listeners) f(); };
  tiles.ready = fetch(TILES + 'tiles.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(async m => {
    tiles.manifest = { objects: {}, characters: {}, floors: {}, ...m };
    // tiles rendered in this browser before
    for (const t of await idb('getAll').catch(() => [])) if (t?.kind && t.url) (tiles.manifest[t.kind] ||= {})[t.name] = { url: t.url, w: t.w, h: t.h, anchor: t.anchor, local: true };
    changed();
    return tiles.manifest;
  });
  function image(src) {
    let im = tiles.img.get(src);
    if (!im) { im = new Image(); im.decoding = 'async'; im.onload = changed; im.src = src; tiles.img.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  function tileFor(kind, name) {
    const t = tiles.manifest?.[kind]?.[name]; if (!t) return null;
    const im = image(t.url || TILES + t.file); return im ? { im, t } : null;
  }
  // tiny IndexedDB store for tiles rendered here
  function idb(op, val) {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('tablefolk-tiles', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('tiles', { keyPath: 'id' });
      rq.onerror = () => rej(rq.error);
      rq.onsuccess = () => {
        const tx = rq.result.transaction('tiles', op === 'put' ? 'readwrite' : 'readonly'), st = tx.objectStore('tiles');
        const r = op === 'put' ? st.put(val) : st.getAll();
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      };
    });
  }
  // missing tiles: rendered by the 3D page in a hidden frame
  let renderFrame = null, renderQueue = new Set(), renderTimer = 0;
  function want(kind, name) {
    if (!tiles.manifest || tiles.manifest[kind]?.[name] || tiles.pending.has(kind + ':' + name)) return;
    tiles.pending.add(kind + ':' + name); renderQueue.add(name);
    clearTimeout(renderTimer); renderTimer = setTimeout(renderMissing, 600);
  }
  function renderMissing() {
    if (!renderQueue.size || renderFrame) return;
    const names = [...renderQueue]; renderQueue.clear();
    renderFrame = document.createElement('iframe');
    renderFrame.style.cssText = 'position:fixed;left:-2000px;top:0;width:640px;height:480px;border:0;opacity:0;pointer-events:none';
    renderFrame.src = '/app/?tabletop=1&tiles=1&only=' + encodeURIComponent(names.join(','));
    document.body.appendChild(renderFrame);
    status(`drawing pictures for ${names.map(nice).join(', ')}…`);
    setTimeout(() => { if (renderFrame) { renderFrame.remove(); renderFrame = null; renderMissing(); } }, 120000);
  }
  addEventListener('message', async e => {
    if (e.origin !== location.origin || e.data?.type !== 'tablefolk-tiles') return;
    for (const t of e.data.tiles || []) {
      if (!t.url) continue;
      (tiles.manifest[t.kind] ||= {})[t.name] = { url: t.url, w: t.w, h: t.h, anchor: t.anchor, local: true };
      idb('put', { id: t.kind + ':' + t.name, ...t }).catch(() => {});
      // an admin's render is kept on the server for everyone (others get 401)
      fetch('/api/admin/tiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) }).catch(() => {});
    }
    if (!e.data.tiles?.length && renderFrame) { renderFrame.remove(); renderFrame = null; status(''); renderMissing(); }
    changed();
  });
  let statusFn = () => {};
  const status = t => statusFn(t);

  // ---------- the layout: any scenario -> cells ----------
  function parseGlyph(v) {
    v = String(v || '').trim().toLowerCase();
    const on = v.match(/^(\w+)\s+on\s+(\w+)$/);
    if (on) return { obj: on[1], mat: FLOORS[on[2]] ? on[2] : null };
    if (v === 'wall' || v === 'door') return { wall: v };
    if (v === 'player') return { player: true };
    if (FLOORS[v]) return { mat: v };
    return v ? { obj: v } : null;
  }
  function layout(src) {
    let s = clone(src), places = s.places || [];
    if (s.generate && window.TablefolkProcgen) { const r = window.TablefolkProcgen.applyToScenario(s); s = r.scenario; places = r.places || places; }
    const L = { cells: new Map(), floor: new Map(), objects: [], agents: (s.agents || []).map(a => ({ ...a })), player: { ...(s.player || {}) }, places, unplaced: [] };
    const grid = Array.isArray(s.grid) ? s.grid : s.grid ? String(s.grid).split('\n') : [];
    const R = grid.length, C = grid.length ? Math.max(...grid.map(r => [...r].length)) : 0;
    const size = Array.isArray(s.size) && s.size.length === 2 ? s.size.map(n => Math.max(5, Math.min(80, +n || 0))) : [C || 15, R || 11];
    L.cols = Math.max(size[0], C); L.rows = Math.max(size[1], R);
    if (grid.length) {
      const legend = {}; for (const [g, v] of Object.entries(GLYPHS)) legend[g] = parseGlyph(v);
      for (const [g, v] of Object.entries(s.legend || {})) legend[g] = parseGlyph(v);
      const x0 = Math.floor((C - 1) / 2), z0 = Math.floor((R - 1) / 2);
      grid.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch === '.' || ch === ' ') return;
        const x = x0 - c, z = r - z0, k = x + ',' + z;
        if (/[1-9]/.test(ch)) { const a = L.agents[+ch - 1]; if (a && !Array.isArray(a.at)) a.at = [x, z]; return; }
        const e = legend[ch]; if (!e) return;
        if (e.mat) L.floor.set(k, e.mat);
        if (e.wall) L.cells.set(k, { type: e.wall });
        if (e.player && !Array.isArray(L.player.at)) L.player.at = [x, z];
        if (e.obj) L.objects.push({ type: e.obj, x, z });
      }));
    }
    for (const o of s.objects || []) {
      if (!Number.isFinite(+o.x) || !Number.isFinite(+o.z) || o.x === '' || o.z === '') continue;
      const { type, x, z, ...rest } = o;
      if (type === 'wall' || type === 'door') L.cells.set(Math.round(x) + ',' + Math.round(z), { type, ...rest });
      else L.objects.push({ type, x: +x, z: +z, ...rest });
    }
    for (const p of s.paint || []) if (Number.isFinite(+p.x) && FLOORS[p.mat]) L.floor.set(Math.round(p.x) + ',' + Math.round(p.z), p.mat);
    // locks: by position, or every door around a place
    for (const rule of Array.isArray(s.locked) ? s.locked : []) {
      const key = String(rule?.key || 'key');
      if (Array.isArray(rule.at)) { const d = L.cells.get(Math.round(rule.at[0]) + ',' + Math.round(rule.at[1])); if (d?.type === 'door') d.locked = key; continue; }
      const want = String(rule.in || '').toLowerCase();
      for (const p of places.filter(p => p.id?.toLowerCase() === want || p.id?.toLowerCase().replace(/\s+\d+$/, '') === want))
        for (const [k, c] of L.cells) { if (c.type !== 'door') continue; const [x, z] = k.split(',').map(Number); if (x >= p.x0 - 1 && x <= p.x1 + 1 && z >= p.z0 - 1 && z <= p.z1 + 1) c.locked = key; }
    }
    L.unplaced = L.agents.filter(a => !Array.isArray(a.at)).map(a => a.id);
    L.base = s.floor && FLOORS[s.floor] ? s.floor : (s.dark || s.base === 'dungeon' || [...L.cells.values()].length > 8) ? 'stone' : 'grass';
    L.src = s;
    return L;
  }
  // cells -> the fixed form, into the scenario
  function writeBack(scn, L) {
    for (const k of ['generate', 'grid', 'legend', 'map', '_gen', 'genWarnings']) delete scn[k];
    scn.size = [L.cols, L.rows];
    if (L.src.base && !scn.base) scn.base = L.src.base;
    if (L.src.walls && !scn.walls) scn.walls = L.src.walls;
    if (L.src.wallHeight && !scn.wallHeight) scn.wallHeight = L.src.wallHeight;
    if (L.src.lighting && !scn.lighting) scn.lighting = L.src.lighting;
    if (L.src.dark != null && scn.dark == null) scn.dark = L.src.dark;
    if (L.places?.length) scn.places = L.places;
    const objs = [];
    for (const [k, c] of L.cells) { const [x, z] = k.split(',').map(Number); const { type, locked, ...rest } = c; objs.push({ type, x, z, ...rest }); }
    scn.objects = [...objs, ...L.objects.map(o => ({ ...o }))];
    scn.paint = [...L.floor].map(([k, mat]) => { const [x, z] = k.split(',').map(Number); return { x, z, mat }; });
    const locks = [...L.cells].filter(([, c]) => c.type === 'door' && c.locked).map(([k, c]) => ({ at: k.split(',').map(Number), key: c.locked }));
    if (locks.length) scn.locked = locks; else delete scn.locked;
    // everyone where the map shows them (their "in" no longer applies)
    scn.agents = L.agents.map(a => { const { in: _in, ...rest } = a; return Array.isArray(a.at) ? rest : a; });
    if (Array.isArray(L.player.at)) { const { in: _in, ...p } = L.player; scn.player = p; }
    return scn;
  }

  // ---------- drawing ----------
  const floorPattern = new Map();
  function floorFill(ctx, mat, x, y, s, c = 0, r = 0) {
    const f = FLOORS[mat] || FLOORS.flagstone;
    if (f.file) {
      let p = floorPattern.get(mat);
      if (!p) {
        const im = image(TEX + f.file);
        if (im) {
          // tint once into a small canvas: a cell is a quarter of the texture
          const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c2 = cv.getContext('2d');
          c2.drawImage(im, 0, 0, 256, 256);
          const d = c2.getImageData(0, 0, 256, 256), t = f.tint;
          for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.min(255, d.data[i] * t[0]); d.data[i + 1] = Math.min(255, d.data[i + 1] * t[1]); d.data[i + 2] = Math.min(255, d.data[i + 2] * t[2]); }
          c2.putImageData(d, 0, 0); p = cv; floorPattern.set(mat, p);
        }
      }
      if (p) { ctx.drawImage(p, (c & 1) * 128, (r & 1) * 128, 128, 128, x, y, s + .6, s + .6); return; }
    }
    if (f.tile) { const t = tileFor('floors', f.tile); if (t) { ctx.drawImage(t.im, x, y, s + .6, s + .6); return; } }
    ctx.fillStyle = f.color || '#8d8a84'; ctx.fillRect(x, y, s + .6, s + .6);
    if (f.planks) { ctx.fillStyle = 'rgba(70,40,15,.25)'; for (let i = 1; i < 4; i++) ctx.fillRect(x, y + i * s / 4, s, Math.max(1, s * .02)); }
    if (f.grout) { ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = Math.max(1, s * .02); ctx.strokeRect(x + s * .02, y + s * .02, s * .46, s * .46); ctx.strokeRect(x + s * .52, y + s * .52, s * .46, s * .46); }
  }

  function mount(root, opts = {}) {
    injectStyle();
    root.classList.add('tfme');
    root.innerHTML = `
      <div class="tfme-bar">
        <div class="tfme-tools" role="toolbar" aria-label="map tools">
          ${tool('select', 'Select and move', 'M4 3l14 7-6 2-2 6z', 'V')}
          ${tool('wall', 'Draw walls', 'M3 6h8v5H3zM13 6h8v5h-8zM7 13h8v5H7zM17 13h4v5h-4zM3 13h2v5H3z', 'W')}
          ${tool('door', 'Doors: click a wall; click a door to lock it', 'M6 3h12v18H6zM14 12h1', 'D')}
          ${tool('floor', 'Paint the floor', 'M4 4h16v6H4zM12 10v4M10 14h4v7h-4z', 'G')}
          ${tool('erase', 'Erase', 'M16 4l5 5-10 10H6l-3-3zM9 9l6 6', 'X')}
        </div>
        <select class="tfme-mat" title="floor material">${FLOOR_NAMES.map(m => `<option value="${m}">${nice(m)}</option>`).join('')}</select>
        <span class="tfme-sep"></span>
        <button type="button" class="tfme-ib" data-act="undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg></button>
        <button type="button" class="tfme-ib" data-act="redo" title="Redo (Ctrl+Shift+Z)"><svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3"/></svg></button>
        <span class="tfme-sep"></span>
        <button type="button" class="tfme-ib" data-act="zoomout" title="Zoom out (-)"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/></svg></button>
        <button type="button" class="tfme-ib" data-act="zoomin" title="Zoom in (+)"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M20 20l-4-4"/></svg></button>
        <button type="button" class="tfme-ib" data-act="fit" title="Fit the board (F)"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
        <label class="tfme-check"><input type="checkbox" data-opt="labels" checked> names</label>
        <label class="tfme-check"><input type="checkbox" data-opt="grid" checked> grid</label>
        <span class="tfme-status" aria-live="polite"></span>
      </div>
      <div class="tfme-body">
        <aside class="tfme-palette" aria-label="things to place">
          <input class="tfme-search" type="search" placeholder="search monsters, people, things">
          <div class="tfme-tabs" role="tablist"><button type="button" data-tab="monsters" class="on">Monsters</button><button type="button" data-tab="people">People</button><button type="button" data-tab="objects">Things</button></div>
          <div class="tfme-items"></div>
          <p class="tfme-hint">Drag onto the map, or pick one and click where it goes.</p>
        </aside>
        <div class="tfme-stage"><canvas></canvas><div class="tfme-empty" hidden></div><div class="tfme-tip" hidden></div></div>
        <aside class="tfme-inspect" aria-label="selected"></aside>
      </div>`;
    const $ = sel => root.querySelector(sel);
    const cv = $('canvas'), stage = $('.tfme-stage'), tipEl = $('.tfme-tip');
    let L = null, scn = null, view = { s: 32, ox: 0, oy: 0 }, toolName = 'select', armed = null, sel = null, hover = null, drag = null, panning = null, dirty = true, spaceDown = false;
    let tab = 'monsters', query = '';
    const showOpt = { labels: true, grid: true };
    const undo = [], redo = [];
    statusFn = t => { const s = $('.tfme-status'); if (s) s.textContent = t || ''; };
    tiles.listeners.add(() => { dirty = true; renderPalette(); });

    // world <-> cells <-> pixels
    const geo = () => ({ x0: Math.floor((L.cols - 1) / 2), z0: Math.floor((L.rows - 1) / 2) });
    const cellToPx = (x, z) => { const { x0, z0 } = geo(); return [view.ox + (x0 - x) * view.s, view.oy + (z + z0) * view.s]; };
    const pxToCell = (px, py) => { const { x0, z0 } = geo(); return [x0 - Math.floor((px - view.ox) / view.s), Math.floor((py - view.oy) / view.s) - z0]; };
    const inBoard = (x, z) => { const { x0, z0 } = geo(); const c = x0 - x, r = z + z0; return c >= 0 && c < L.cols && r >= 0 && r < L.rows; };

    function fit() {
      if (!L) return;
      const w = stage.clientWidth, h = stage.clientHeight, pad = 24;
      view.s = Math.max(8, Math.min(72, Math.floor(Math.min((w - pad * 2) / L.cols, (h - pad * 2) / L.rows))));
      view.ox = Math.round((w - L.cols * view.s) / 2); view.oy = Math.round((h - L.rows * view.s) / 2); dirty = true;
    }
    function zoomAt(f, px = stage.clientWidth / 2, py = stage.clientHeight / 2) {
      const s2 = Math.max(6, Math.min(160, view.s * f)), k = s2 / view.s;
      view.ox = px - (px - view.ox) * k; view.oy = py - (py - view.oy) * k; view.s = s2; dirty = true;
    }

    // ---- what is where ----
    const at = a => Array.isArray(a?.at) ? a.at : null;
    function charsAt(x, z) {
      const out = [];
      if (at(L.player) && at(L.player)[0] === x && at(L.player)[1] === z) out.push({ kind: 'player', ref: L.player });
      for (const a of L.agents) if (at(a) && at(a)[0] === x && at(a)[1] === z) out.push({ kind: 'agent', ref: a });
      return out;
    }
    function thingAt(x, z) {
      const c = charsAt(x, z); if (c.length) return c[0];
      const o = L.objects.filter(o => Math.round(o.x) === x && Math.round(o.z) === z).pop(); if (o) return { kind: 'object', ref: o };
      const w = L.cells.get(x + ',' + z); if (w) return { kind: w.type, ref: w, key: x + ',' + z };
      return null;
    }
    const isHostile = a => a.hostile ?? MINDLESS.has(a.model);

    // ---- edits ----
    function snapshot() { undo.push(JSON.stringify(scn)); if (undo.length > 80) undo.shift(); redo.length = 0; }
    function commit() { writeBack(scn, L); dirty = true; opts.onChange?.(scn); renderInspector(); }
    function edit(fn) { snapshot(); fn(); commit(); }
    function restore(json) { scn = JSON.parse(json); L = layout(scn); sel = null; dirty = true; opts.onChange?.(scn); renderInspector(); }
    function uniqueId(base) { const ids = new Set(L.agents.map(a => a.id)); let i = 1, id = base; while (ids.has(id)) id = base + (++i); return id; }
    function place(kind, name, x, z) {
      if (!inBoard(x, z)) return;
      edit(() => {
        if (kind === 'object' || kind === 'objects') { L.objects.push({ type: name, x, z }); sel = { kind: 'object', ref: L.objects.at(-1) }; }
        else {
          const monster = kind === 'monsters' || MONSTERS.includes(name);
          const a = { id: uniqueId(name.replace(/_(classic|warrior|farmer|woman)$/, '').replace(/_/g, '')), model: name, at: [x, z], ...(monster ? { hostile: true, style: nice(name) } : { style: nice(name), personality: '' }) };
          L.agents.push(a); sel = { kind: 'agent', ref: a };
        }
        L.cells.delete(x + ',' + z);
      });
      armed = null; renderPalette();
    }
    function remove(t) {
      if (!t) return;
      edit(() => {
        if (t.kind === 'agent') L.agents.splice(L.agents.indexOf(t.ref), 1);
        else if (t.kind === 'object') L.objects.splice(L.objects.indexOf(t.ref), 1);
        else if (t.kind === 'wall' || t.kind === 'door') L.cells.delete(t.key);
        else if (t.kind === 'player') delete L.player.at;
      });
      sel = null; renderInspector();
    }
    function moveTo(t, x, z) {
      if (!inBoard(x, z)) return;
      edit(() => {
        if (t.kind === 'agent' || t.kind === 'player') t.ref.at = [x, z];
        else if (t.kind === 'object') { const fx = t.ref.x - Math.round(t.ref.x), fz = t.ref.z - Math.round(t.ref.z); t.ref.x = x + fx; t.ref.z = z + fz; }
        else if (t.key) { const c = L.cells.get(t.key); L.cells.delete(t.key); t.key = x + ',' + z; L.cells.set(t.key, c); }
        if (t.kind !== 'wall' && t.kind !== 'door' && L.cells.get(x + ',' + z)?.type === 'wall') L.cells.delete(x + ',' + z);
      });
    }

    // ---- palette ----
    function paletteList() {
      const m = tiles.manifest || { objects: {}, characters: {} };
      if (tab === 'objects') {
        const known = new Set(OBJECT_GROUPS.flatMap(g => g[1]));
        const extra = Object.keys(m.objects).filter(k => !known.has(k)).sort();
        return [...OBJECT_GROUPS, ...(extra.length ? [['More', extra]] : [])].map(([g, list]) => [g, list.filter(n => !query || n.includes(query))]).filter(g => g[1].length);
      }
      const list = (tab === 'monsters' ? MONSTERS : PEOPLE).concat(tab === 'people' ? [] : Object.keys(m.characters).filter(k => !MONSTERS.includes(k) && !PEOPLE.includes(k)));
      return [[tab === 'monsters' ? 'Monsters' : 'People', list.filter(n => !query || n.includes(query))]];
    }
    function renderPalette() {
      const box = $('.tfme-items'); if (!box) return;
      const kind = tab === 'objects' ? 'objects' : 'characters';
      box.innerHTML = paletteList().map(([g, list]) => `<div class="tfme-group"><h4>${esc(g)}</h4><div class="tfme-grid">${list.map(n => {
        const t = tiles.manifest?.[kind]?.[n];
        return `<button type="button" class="tfme-item${armed?.name === n ? ' on' : ''}" draggable="true" data-place="${tab}" data-name="${esc(n)}" title="${esc(nice(n))}">${t ? `<img alt="" src="${esc(t.url || TILES + t.file)}" draggable="false">` : `<span class="tfme-badge">${esc(n.slice(0, 2))}</span>`}<span>${esc(nice(n))}</span></button>`;
      }).join('')}</div></div>`).join('') || '<p class="tfme-hint">Nothing matches.</p>';
    }

    // ---- inspector ----
    const BODIES = () => [...MONSTERS, ...PEOPLE];
    function field(label, key, val, type = 'text', extra = '') {
      if (type === 'area') return `<label class="wide"><span>${label}</span><textarea data-k="${key}" rows="4">${esc(val)}</textarea></label>`;
      return `<label><span>${label}</span><input data-k="${key}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`;
    }
    function renderInspector() {
      const box = $('.tfme-inspect'); if (!box || !L) return;
      if (!sel) {
        const counts = { monsters: L.agents.filter(isHostile).length, people: L.agents.filter(a => !isHostile(a)).length, things: L.objects.filter(o => o.type !== 'light').length };
        box.innerHTML = `<h3>${esc(scn.title || 'Map')}</h3>
          <p class="tfme-muted">${L.cols} × ${L.rows} squares · ${counts.monsters} monster${counts.monsters === 1 ? '' : 's'} · ${counts.people} ${counts.people === 1 ? 'person' : 'people'} · ${counts.things} thing${counts.things === 1 ? '' : 's'}</p>
          <div class="tfme-form">
            <label><span>Width</span><input data-board="cols" type="number" min="5" max="80" value="${L.cols}"></label>
            <label><span>Height</span><input data-board="rows" type="number" min="5" max="80" value="${L.rows}"></label>
          </div>
          ${L.unplaced.length ? `<p class="tfme-note">Placed by the game when it starts: ${esc(L.unplaced.join(', '))}. Drag them in from here to fix their spot:</p><div class="tfme-chips">${L.unplaced.map(id => `<button type="button" class="tfme-chip" draggable="true" data-unplaced="${esc(id)}">${esc(id)}</button>`).join('')}</div>` : ''}
          <p class="tfme-muted">Click something on the map to change it. Monsters fight on sight; people talk (their brief is what they know and want).</p>`;
        return;
      }
      const t = sel;
      if (t.kind === 'agent' || t.kind === 'player') {
        const a = t.ref, me = t.kind === 'player';
        box.innerHTML = `<div class="tfme-head">${thumb('characters', a.model || 'adventurer')}<div><h3>${esc(me ? (a.name || 'You') : a.id)}</h3><span class="tfme-muted">${me ? 'the player' : isHostile(a) ? 'hostile: fights' : 'talks'}</span></div></div>
          <div class="tfme-form">
            ${me ? field('Name', 'name', a.name) : field('Name (id)', 'id', a.id)}
            <label><span>Body</span><select data-k="model">${BODIES().map(m => `<option value="${m}"${m === a.model ? ' selected' : ''}>${nice(m)}</option>`).join('')}</select></label>
            ${me ? '' : `<label><span>Behaviour</span><select data-k="hostile"><option value="">auto (${MINDLESS.has(a.model) ? 'fights' : 'talks'})</option><option value="true"${a.hostile === true ? ' selected' : ''}>hostile: fights</option><option value="false"${a.hostile === false ? ' selected' : ''}>friendly: talks</option></select></label>`}
            ${field('Hit points', 'hp', a.hp, 'number', 'min="1" placeholder="default"')}
            ${field('Wields', 'wield', a.wield, 'text', 'placeholder="e.g. sword"')}
            ${field('Gold', me ? 'gold' : 'inventory.gold', me ? a.gold : a.inventory?.gold, 'number', 'min="0"')}
            ${field('Carries (comma)', me ? 'items' : 'inventory.items', (me ? a.items : a.inventory?.items || []).map?.(i => i?.name || i).join(', ') || '', 'text')}
            ${me ? '' : field('Style (a few words)', 'style', a.style)}
            ${me ? '' : field('Brief: who they are, what they know and want', 'personality', a.personality, 'area')}
          </div>
          <div class="tfme-actions">${me ? '' : '<button type="button" data-act="dup">Duplicate</button>'}<button type="button" class="danger" data-act="del">${me ? 'Unplace' : 'Remove'}</button></div>`;
      } else if (t.kind === 'object') {
        const o = t.ref, holds = /chest|crate|barrel|bag|cabinet|nightstand|pot|vase/.test(o.type);
        box.innerHTML = `<div class="tfme-head">${thumb('objects', o.type)}<div><h3>${esc(nice(o.type))}</h3><span class="tfme-muted">at ${o.x}, ${o.z}${o.ry ? ' · turned' : ''}</span></div></div>
          <div class="tfme-form">
            ${o.type === 'note' ? field('Text', 'text', o.text, 'area') : ''}
            ${holds || o.type === 'coin_pile' ? field('Gold inside', 'gold', o.gold, 'number', 'min="0"') : ''}
            ${holds ? field('Items inside (comma)', 'items', (o.items || []).map(i => i?.name || i).join(', ')) : ''}
            ${o.type === 'key' || o.type === 'potion' || o.type === 'scroll' ? field('Name', 'name', o.name, 'text', 'placeholder="e.g. silver key"') : ''}
            ${o.type === 'light' ? field('Colour', 'color', o.color, 'text', 'placeholder="#ffc98a"') + field('Range', 'range', o.range, 'number', 'step="0.5"') : ''}
          </div>
          <div class="tfme-actions"><button type="button" data-act="turn">Turn (R)</button><button type="button" data-act="dup">Duplicate</button><button type="button" class="danger" data-act="del">Remove</button></div>`;
      } else {
        const d = t.ref;
        box.innerHTML = `<h3>${t.kind === 'door' ? 'Door' : 'Wall'}</h3><p class="tfme-muted">at ${t.key.replace(',', ', ')}</p>
          ${t.kind === 'door' ? `<div class="tfme-form"><label class="wide"><span>Locked: the key that opens it (empty: not locked)</span><input data-k="locked" value="${esc(d.locked || '')}" placeholder="e.g. silver key"></label></div>` : ''}
          <div class="tfme-actions">${t.kind === 'wall' ? '<button type="button" data-act="todoor">Make it a door</button>' : '<button type="button" data-act="towall">Make it a wall</button>'}<button type="button" class="danger" data-act="del">Remove</button></div>`;
      }
    }
    function thumb(kind, name) { const t = tiles.manifest?.[kind]?.[name]; return t ? `<img class="tfme-thumb" alt="" src="${esc(t.url || TILES + t.file)}">` : `<span class="tfme-thumb tfme-badge">${esc(String(name).slice(0, 2))}</span>`; }
    function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = o[k] ||= {}; const last = ks.at(-1); if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete o[last]; else o[last] = v; }
    let typing = null;
    root.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.board) {
        const n = Math.max(5, Math.min(80, Math.round(+el.value || 0))); if (!n) return;
        edit(() => { L[el.dataset.board] = n; }); fit(); return;
      }
      if (!el.dataset.k || !sel) return;
      const k = el.dataset.k, raw = el.value;
      let v = el.type === 'number' ? (raw === '' ? undefined : +raw) : raw;
      if (k === 'hostile') v = raw === '' ? undefined : raw === 'true';
      if (/items$/.test(k)) v = raw.split(',').map(s => s.trim()).filter(Boolean);
      // one undo step per field while typing
      if (typing !== el) { snapshot(); typing = el; }
      if (k === 'locked') { if (raw.trim()) sel.ref.locked = raw.trim(); else delete sel.ref.locked; }
      else if (k === 'id') { const id = raw.trim().replace(/\s+/g, '_'); if (id && !L.agents.some(a => a !== sel.ref && a.id === id)) sel.ref.id = id; }
      else setPath(sel.ref, k, v);
      writeBack(scn, L); dirty = true; opts.onChange?.(scn);
      if (el.tagName === 'SELECT') renderInspector();
    });
    root.addEventListener('focusout', () => { typing = null; });

    // ---- drawing ----
    function draw() {
      const dpr = Math.min(2, devicePixelRatio || 1), w = stage.clientWidth, h = stage.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = getComputedStyle(root).getPropertyValue('--tfme-bg') || '#16130f'; ctx.fillRect(0, 0, w, h);
      if (!L) return;
      const s = view.s, { x0, z0 } = geo();
      // visible cells only
      const c0 = Math.max(0, Math.floor(-view.ox / s)), c1 = Math.min(L.cols - 1, Math.ceil((w - view.ox) / s));
      const r0 = Math.max(0, Math.floor(-view.oy / s) - 1), r1 = Math.min(L.rows - 1, Math.ceil((h - view.oy) / s) + 1);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      // board shadow
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(view.ox + 6, view.oy + 8, L.cols * s, L.rows * s);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const x = x0 - c, z = r - z0, px = view.ox + c * s, py = view.oy + r * s;
        floorFill(ctx, L.floor.get(x + ',' + z) || L.base, px, py, s, c, r);
      }
      if (showOpt.grid && s >= 12) {
        ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let c = c0; c <= c1 + 1; c++) { const px = Math.round(view.ox + c * s) + .5; ctx.moveTo(px, view.oy + r0 * s); ctx.lineTo(px, view.oy + (r1 + 1) * s); }
        for (let r = r0; r <= r1 + 1; r++) { const py = Math.round(view.oy + r * s) + .5; ctx.moveTo(view.ox + c0 * s, py); ctx.lineTo(view.ox + (c1 + 1) * s, py); }
        ctx.stroke();
      }
      // rooms' names, faint, under everything standing
      if (s >= 14) for (const p of L.places || []) {
        if (!Array.isArray(p.center)) continue;
        const [px, py] = cellToPx(p.center[0], p.center[1]);
        ctx.font = `600 ${Math.round(Math.min(18, s * .42))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillText(nice(p.id), px + s / 2, py - s * .1);
      }
      // standing things, row by row (north first) so nearer ones overlap
      const rows = new Map(); const push = (r, f) => { if (!rows.has(r)) rows.set(r, []); rows.get(r).push(f); };
      for (const [k, cell] of L.cells) {
        const [x, z] = k.split(',').map(Number), r = z + z0; if (r < r0 - 1 || r > r1 + 1) continue;
        push(r, () => cell.type === 'wall' ? drawWall(ctx, x, z) : drawDoor(ctx, x, z, cell));
      }
      for (const o of L.objects) { const r = Math.round(o.z) + z0; if (r < r0 - 2 || r > r1 + 2) continue; push(r + .2, () => drawThing(ctx, 'objects', o.type, o.x, o.z, o === sel?.ref, +o.ry || 0)); }
      const folk = [...L.agents.filter(at).map(a => ({ a, kind: 'agent' })), ...(at(L.player) ? [{ a: L.player, kind: 'player' }] : [])];
      for (const f of folk) { const r = f.a.at[1] + z0; push(r + .4, () => drawFolk(ctx, f)); }
      for (const r of [...rows.keys()].sort((a, b) => a - b)) for (const f of rows.get(r)) f();
      if (showOpt.labels && s >= 16) for (const f of folk) drawLabel(ctx, f);
      // hover and selection
      if (hover && inBoard(...hover)) { const [px, py] = cellToPx(...hover); ctx.strokeStyle = 'rgba(255,240,200,.85)'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, s - 2, s - 2); }
      if (sel) { const p = selCell(); if (p) { const [px, py] = cellToPx(...p); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3); ctx.setLineDash([]); } }
      if (drag?.to) { const [px, py] = cellToPx(...drag.to); ctx.fillStyle = 'rgba(127,224,138,.25)'; ctx.fillRect(px, py, s, s); ctx.strokeStyle = '#7fe08a'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, s - 2, s - 2); }
      if (armed && hover) { const [px, py] = cellToPx(...hover); ctx.globalAlpha = .65; drawThing(ctx, armed.kind === 'objects' ? 'objects' : 'characters', armed.name, hover[0], hover[1]); ctx.globalAlpha = 1; ctx.strokeStyle = '#7fe08a'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, s - 2, s - 2); }
    }
    function selCell() { const t = sel; if (!t) return null; if (t.kind === 'agent' || t.kind === 'player') return at(t.ref); if (t.kind === 'object') return [Math.round(t.ref.x), Math.round(t.ref.z)]; return t.key?.split(',').map(Number); }
    const wallAt = (x, z) => L.cells.get(x + ',' + z)?.type === 'wall';
    function drawWall(ctx, x, z) {
      const s = view.s, [px, py] = cellToPx(x, z), face = Math.round(s * .32), open = !L.cells.has(x + ',' + (z + 1));
      // the top, lit from the north-west; a face where the square to the south is open
      const g = ctx.createLinearGradient(px, py, px + s, py + s); g.addColorStop(0, '#8b8378'); g.addColorStop(1, '#6b645b');
      ctx.fillStyle = g; ctx.fillRect(px, py, s + .6, s + .6);
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      if (!wallAt(x, z - 1)) ctx.fillRect(px, py, s, Math.max(1, s * .06));
      if (!wallAt(x + 1, z)) ctx.fillRect(px, py, Math.max(1, s * .06), s);
      // stone courses
      if (s >= 18) { ctx.strokeStyle = 'rgba(40,34,28,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 3; i++) { const yy = Math.round(py + i * s / 3) + .5; ctx.moveTo(px, yy); ctx.lineTo(px + s, yy); } const off = ((x + z) & 1) ? s / 2 : s / 4; ctx.moveTo(px + off, py); ctx.lineTo(px + off, py + s / 3); ctx.moveTo(px + off + s / 3, py + s / 3); ctx.lineTo(px + off + s / 3, py + 2 * s / 3); ctx.stroke(); }
      if (open) { const fg = ctx.createLinearGradient(0, py + s, 0, py + s + face); fg.addColorStop(0, '#4a443c'); fg.addColorStop(1, '#2f2b26'); ctx.fillStyle = fg; ctx.fillRect(px, py + s, s + .6, face); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px, py + s + face, s, Math.max(1, s * .08)); }
    }
    function drawDoor(ctx, x, z, cell) {
      const s = view.s, [px, py] = cellToPx(x, z), alongX = L.cells.has((x + 1) + ',' + z) || L.cells.has((x - 1) + ',' + z), { x0, z0 } = geo();
      floorFill(ctx, L.floor.get(x + ',' + z) || L.base, px, py, s, x0 - x, z + z0);
      ctx.fillStyle = '#7a4f28'; ctx.strokeStyle = '#3e2512'; ctx.lineWidth = Math.max(1, s * .05);
      if (alongX) { ctx.fillRect(px + s * .06, py + s * .36, s * .88, s * .28); ctx.strokeRect(px + s * .06, py + s * .36, s * .88, s * .28); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + s * (.06 + i * .22), py + s * .36); ctx.lineTo(px + s * (.06 + i * .22), py + s * .64); ctx.stroke(); } }
      else { ctx.fillRect(px + s * .36, py + s * .06, s * .28, s * .88); ctx.strokeRect(px + s * .36, py + s * .06, s * .28, s * .88); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + s * .36, py + s * (.06 + i * .22)); ctx.lineTo(px + s * .64, py + s * (.06 + i * .22)); ctx.stroke(); } }
      if (cell.locked) {
        const cx = px + s * .5, cy = py + s * .5, r = s * .17;
        ctx.fillStyle = '#e8c547'; ctx.strokeStyle = '#3e2c06'; ctx.lineWidth = Math.max(1, s * .04);
        ctx.beginPath(); ctx.arc(cx, cy - r * .55, r * .62, Math.PI, 0); ctx.stroke();
        ctx.fillRect(cx - r, cy - r * .5, r * 2, r * 1.5); ctx.strokeRect(cx - r, cy - r * .5, r * 2, r * 1.5);
      }
    }
    // ry: an object turned in the world (radians) is drawn turned the same
    // way about its square (the picture is from one side, so this only shows
    // which way a bench or a table runs)
    function drawThing(ctx, kind, name, x, z, selected, ry = 0) {
      const s = view.s, [px, py] = cellToPx(x, z);
      const t = tileFor(kind, name);
      if (!t) { want(kind, name); return badge(ctx, name, px, py, s, kind === 'characters' ? '#4a90e0' : '#8a7356'); }
      const k = s / (t.t.ppu || tiles.manifest.ppu || 128), w = t.t.w * k, h = t.t.h * k;
      // a soft contact shadow
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(px + s / 2, py + s * .62, s * .36, s * .16, 0, 0, Math.PI * 2); ctx.fill();
      if (selected) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 10; }
      const q = Math.round((ry || 0) / (Math.PI / 2)) % 4;
      if (q) {
        // screen right is -x, so a turn by +ry in the world is a turn the other way on screen
        ctx.save(); ctx.translate(px + s / 2, py + s / 2); ctx.rotate(-q * Math.PI / 2);
        ctx.drawImage(t.im, -t.t.anchor[0] * k, -t.t.anchor[1] * k, w, h); ctx.restore();
      } else ctx.drawImage(t.im, px + s / 2 - t.t.anchor[0] * k, py + s / 2 - t.t.anchor[1] * k, w, h);
      ctx.shadowBlur = 0;
    }
    function badge(ctx, name, px, py, s, color) {
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
      const r = s * .38; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(8, Math.round(s * .3))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(name).slice(0, 2).toUpperCase(), px + s / 2, py + s / 2 + 1);
    }
    function drawFolk(ctx, f) {
      const s = view.s, [x, z] = f.a.at, [px, py] = cellToPx(x, z);
      const ring = f.kind === 'player' ? '#f2c94c' : isHostile(f.a) ? '#e05a4a' : '#5aa0ea';
      ctx.strokeStyle = ring; ctx.lineWidth = Math.max(2, s * .07); ctx.beginPath(); ctx.ellipse(px + s / 2, py + s * .62, s * .4, s * .2, 0, 0, Math.PI * 2); ctx.stroke();
      drawThing(ctx, 'characters', f.a.model || (f.kind === 'player' ? 'adventurer' : 'critter'), x, z, sel?.ref === f.a);
    }
    function drawLabel(ctx, f) {
      const s = view.s, [px, py] = cellToPx(...f.a.at), name = f.kind === 'player' ? (f.a.name || 'you') : f.a.id;
      const fs = Math.max(10, Math.min(15, s * .3)); ctx.font = `700 ${fs}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(name).width + fs * .9, th = fs * 1.45, cx = px + s / 2, cy = py + s * .98 + th / 2;
      ctx.fillStyle = f.kind === 'player' ? 'rgba(120,90,10,.92)' : isHostile(f.a) ? 'rgba(140,30,24,.92)' : 'rgba(24,30,40,.88)';
      ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, th / 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(name, cx, cy + 1);
    }
    (function loop() { if (dirty) { dirty = false; try { draw(); } catch (e) { console.warn('[map editor]', e); } } requestAnimationFrame(loop); })();
    new ResizeObserver(() => { dirty = true; }).observe(stage);

    // ---- pointer ----
    const local = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    let stroke = null;
    function paintStroke(x, z) {
      if (!inBoard(x, z) || stroke.done.has(x + ',' + z)) return;
      stroke.done.add(x + ',' + z); const k = x + ',' + z;
      if (toolName === 'wall') { if (stroke.erase) L.cells.delete(k); else { L.cells.set(k, { type: 'wall' }); } }
      else if (toolName === 'floor') { const m = $('.tfme-mat').value; if (m === L.base) L.floor.delete(k); else L.floor.set(k, m); }
      else if (toolName === 'erase') { const t = thingAt(x, z); if (t?.kind === 'agent') L.agents.splice(L.agents.indexOf(t.ref), 1); else if (t?.kind === 'object') L.objects.splice(L.objects.indexOf(t.ref), 1); else if (t?.kind === 'wall' || t?.kind === 'door') L.cells.delete(t.key); else L.floor.delete(k); }
      dirty = true;
    }
    cv.addEventListener('pointerdown', e => {
      if (!L) return;
      // back to the map: the tool keys work again after typing in a field
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) document.activeElement.blur();
      cv.setPointerCapture(e.pointerId);
      const [px, py] = local(e), [x, z] = pxToCell(px, py);
      if (e.button === 1 || e.button === 2 || spaceDown) { panning = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; e.preventDefault(); return; }
      if (armed) { place(armed.kind, armed.name, x, z); return; }
      if (toolName === 'select') {
        const t = inBoard(x, z) ? thingAt(x, z) : null;
        sel = t; renderInspector(); dirty = true;
        if (t) drag = { t, from: [x, z], to: null };
        else panning = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, click: true };
        return;
      }
      if (toolName === 'door') {
        const c = L.cells.get(x + ',' + z);
        if (!c) { status('doors go in walls: click a wall square'); return; }
        edit(() => { if (c.type === 'wall') c.type = 'door'; else if (!c.locked) c.locked = 'key'; else delete c.locked; });
        sel = { kind: c.type, ref: c, key: x + ',' + z }; renderInspector();
        status(c.type === 'door' ? (c.locked ? 'locked: needs the ' + c.locked + ' (set the key on the right)' : 'a door; click again to lock it') : '');
        return;
      }
      snapshot();
      stroke = { done: new Set(), erase: toolName === 'wall' && L.cells.get(x + ',' + z)?.type === 'wall' };
      paintStroke(x, z);
    });
    cv.addEventListener('pointermove', e => {
      if (!L) return;
      const [px, py] = local(e), c = pxToCell(px, py);
      if (panning) { view.ox = panning.ox + e.clientX - panning.x; view.oy = panning.oy + e.clientY - panning.y; if (Math.abs(e.clientX - panning.x) + Math.abs(e.clientY - panning.y) > 3) panning.click = false; dirty = true; return; }
      if (!hover || hover[0] !== c[0] || hover[1] !== c[1]) { hover = c; dirty = true; showTip(e); }
      if (drag) { drag.to = (c[0] !== drag.from[0] || c[1] !== drag.from[1]) && inBoard(...c) ? c : null; dirty = true; }
      if (stroke) { const [a, b] = c; paintStroke(a, b); }
    });
    const up = () => {
      if (drag?.to) moveTo(drag.t, ...drag.to);
      if (panning?.click && sel) { sel = null; renderInspector(); }
      if (stroke) { stroke = null; commit(); }
      drag = null; panning = null; dirty = true;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { hover = null; tipEl.hidden = true; dirty = true; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = local(e); zoomAt(Math.pow(1.0015, -e.deltaY), px, py); }, { passive: false });
    cv.addEventListener('dblclick', e => { if (toolName === 'select' && !sel) fit(); });
    function showTip(e) {
      if (!hover || !inBoard(...hover) || drag || stroke) { tipEl.hidden = true; return; }
      const [x, z] = hover, bits = [];
      for (const c of charsAt(x, z)) bits.push(`<b>${esc(c.kind === 'player' ? (c.ref.name || 'you') : c.ref.id)}</b> <span>${esc(nice(c.ref.model || ''))} · ${c.kind === 'player' ? 'the player' : isHostile(c.ref) ? 'hostile' : 'talks'}</span>`);
      for (const o of L.objects.filter(o => Math.round(o.x) === x && Math.round(o.z) === z)) bits.push(`<b>${esc(nice(o.type))}</b>${o.gold ? ` <span>${o.gold} gold</span>` : ''}${o.items?.length ? ` <span>holds ${esc(o.items.map(i => i?.name || i).join(', '))}</span>` : ''}${o.text ? `<br><span>“${esc(String(o.text).slice(0, 80))}”</span>` : ''}`);
      const c = L.cells.get(x + ',' + z); if (c) bits.push(`<b>${c.type}</b>${c.locked ? ` <span>locked: ${esc(c.locked)}</span>` : ''}`);
      const pl = (L.places || []).find(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
      bits.push(`<span>${x}, ${z}${pl ? ' · ' + esc(nice(pl.id)) : ''}${L.floor.get(x + ',' + z) ? ' · ' + nice(L.floor.get(x + ',' + z)) : ''}</span>`);
      tipEl.innerHTML = bits.join('<br>'); tipEl.hidden = false;
      const [px, py] = local(e), b = stage.getBoundingClientRect();
      tipEl.style.left = Math.min(px + 16, b.width - tipEl.offsetWidth - 8) + 'px'; tipEl.style.top = Math.min(py + 18, b.height - tipEl.offsetHeight - 8) + 'px';
    }

    // ---- palette: click to arm, drag to drop ----
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.dataset.tool) { setTool(b.dataset.tool); return; }
      if (b.dataset.tab) { tab = b.dataset.tab; root.querySelectorAll('.tfme-tabs button').forEach(x => x.classList.toggle('on', x === b)); renderPalette(); return; }
      if (b.dataset.place) { armed = armed?.name === b.dataset.name ? null : { kind: b.dataset.place, name: b.dataset.name }; renderPalette(); status(armed ? `click the map to place ${nice(armed.name)} (Esc: stop)` : ''); return; }
      const act = b.dataset.act;
      if (act === 'undo') doUndo(); else if (act === 'redo') doRedo();
      else if (act === 'fit') fit(); else if (act === 'zoomin') zoomAt(1.25); else if (act === 'zoomout') zoomAt(.8);
      else if (act === 'del') remove(sel);
      else if (act === 'turn' && sel?.kind === 'object') edit(() => { sel.ref.ry = +(((sel.ref.ry || 0) + Math.PI / 2) % (Math.PI * 2)).toFixed(3) || undefined; if (!sel.ref.ry) delete sel.ref.ry; });
      else if (act === 'dup' && sel) {
        const [x, z] = selCell(), spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([a, b]) => [x + a, z + b]).find(([a, b]) => inBoard(a, b) && !thingAt(a, b));
        if (!spot) return;
        edit(() => {
          if (sel.kind === 'agent') { const a = { ...clone(sel.ref), id: uniqueId(sel.ref.id.replace(/\d+$/, '')), at: spot }; L.agents.push(a); sel = { kind: 'agent', ref: a }; }
          else if (sel.kind === 'object') { const o = { ...clone(sel.ref), x: spot[0], z: spot[1] }; L.objects.push(o); sel = { kind: 'object', ref: o }; }
        });
      }
      else if ((act === 'todoor' || act === 'towall') && sel?.key) edit(() => { sel.ref.type = act === 'todoor' ? 'door' : 'wall'; if (act === 'towall') delete sel.ref.locked; sel.kind = sel.ref.type; });
      renderInspector();
    });
    root.addEventListener('change', e => { const o = e.target.dataset.opt; if (o) { showOpt[o] = e.target.checked; dirty = true; } if (e.target.classList.contains('tfme-mat')) setTool('floor'); });
    $('.tfme-search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase().replace(/\s+/g, '_'); if (query && tab !== 'objects' && !paletteList()[0]?.[1].length) { tab = 'objects'; root.querySelectorAll('.tfme-tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); } renderPalette(); });
    root.addEventListener('dragstart', e => {
      const b = e.target.closest('[data-place],[data-unplaced]'); if (!b) return;
      e.dataTransfer.setData('text/plain', JSON.stringify(b.dataset.unplaced ? { unplaced: b.dataset.unplaced } : { kind: b.dataset.place, name: b.dataset.name }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    stage.addEventListener('dragover', e => { e.preventDefault(); const [px, py] = local(e); hover = pxToCell(px, py); dirty = true; });
    stage.addEventListener('drop', e => {
      e.preventDefault(); let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      const [px, py] = local(e), [x, z] = pxToCell(px, py);
      if (d.unplaced) { const a = L.agents.find(a => a.id === d.unplaced); if (a && inBoard(x, z)) { edit(() => { a.at = [x, z]; }); L.unplaced = L.unplaced.filter(i => i !== d.unplaced); sel = { kind: 'agent', ref: a }; renderInspector(); } return; }
      place(d.kind, d.name, x, z);
    });

    function setTool(t) { toolName = t; armed = null; renderPalette(); root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); root.dataset.tool = t; status(''); }
    function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(scn)); restore(undo.pop()); }
    function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(scn)); restore(redo.pop()); }
    // keys, while the pointer is over the editor or focus is in it (not in a text box)
    let over = false; root.addEventListener('pointerenter', () => over = true); root.addEventListener('pointerleave', () => over = false);
    addEventListener('keydown', e => {
      if (!L || !(over || root.contains(document.activeElement))) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === ' ') { spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); return; }
      const tools = { v: 'select', w: 'wall', d: 'door', g: 'floor', x: 'erase' };
      if (tools[k]) { setTool(tools[k]); return; }
      if (k === 'escape') { armed = null; sel = null; renderPalette(); renderInspector(); dirty = true; status(''); return; }
      if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); remove(sel); return; }
      if (k === 'r' && sel?.kind === 'object') { root.querySelector('[data-act="turn"]')?.click(); return; }
      if (k === 'f') { fit(); return; }
      if (k === '+' || k === '=') zoomAt(1.25); if (k === '-') zoomAt(.8);
    });
    addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; cv.style.cursor = ''; } });

    setTool('select'); renderPalette();
    const api = {
      load(s) { scn = s; L = layout(s); sel = null; renderInspector(); requestAnimationFrame(fit); dirty = true; return L; },
      // the scenario changed elsewhere (forms, AI): redraw from it, keeping the view
      refresh(s) { scn = s; L = layout(s); if (sel) sel = null; renderInspector(); dirty = true; },
      fit, get layout() { return L; },
    };
    return api;

    function tool(id, title, path, key) { return `<button type="button" class="tfme-tool" data-tool="${id}" title="${title} (${key})" aria-label="${title}"><svg viewBox="0 0 24 24"><path d="${path}"/></svg><kbd>${key}</kbd></button>`; }
  }

  function injectStyle() {
    if (document.getElementById('tfme-style')) return;
    const st = document.createElement('style'); st.id = 'tfme-style';
    st.textContent = `
.tfme{--tfme-bg:#17140f;--tfme-panel:var(--card,#fffaf0);--tfme-line:var(--line,#e2d8c6);--tfme-fg:var(--fg,#2b2620);--tfme-muted:var(--muted,#7a7064);--tfme-accent:var(--accent,#6b4f2a);
  display:flex;flex-direction:column;border:1px solid var(--tfme-line);border-radius:14px;overflow:hidden;background:var(--tfme-panel);height:min(78vh,860px);min-height:460px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
.tfme-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--tfme-line);background:var(--tfme-panel)}
.tfme-tools{display:flex;gap:2px;background:var(--bg,#f4efe4);border:1px solid var(--tfme-line);border-radius:10px;padding:2px}
.tfme-tool,.tfme-ib{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:34px;border:0;border-radius:8px;background:none;color:var(--tfme-fg);cursor:pointer;padding:0}
.tfme-tool:hover,.tfme-ib:hover{background:rgba(127,110,85,.14)}.tfme-tool.on{background:var(--tfme-accent);color:var(--bg,#fff)}
.tfme-tool svg,.tfme-ib svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.tfme-tool kbd{position:absolute;right:2px;bottom:1px;font:600 8px/1 ui-monospace,monospace;opacity:.55}
.tfme-mat{font:inherit;font-size:.85rem;padding:.3rem .4rem;border-radius:8px;border:1px solid var(--tfme-line);background:var(--bg,#f4efe4);color:var(--tfme-fg)}
.tfme-sep{width:1px;height:22px;background:var(--tfme-line);margin:0 4px}
.tfme-check{display:inline-flex;align-items:center;gap:4px;font-size:.82rem;color:var(--tfme-muted);margin-left:6px;cursor:pointer}
.tfme-status{flex:1;text-align:right;font-size:.82rem;color:var(--tfme-muted);min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tfme-body{flex:1;display:grid;grid-template-columns:220px 1fr 290px;min-height:0}
.tfme-palette,.tfme-inspect{overflow:auto;padding:10px;background:var(--tfme-panel)}
.tfme-palette{border-right:1px solid var(--tfme-line)}.tfme-inspect{border-left:1px solid var(--tfme-line)}
.tfme-search{width:100%;font:inherit;font-size:.85rem;padding:.4rem .55rem;border-radius:8px;border:1px solid var(--tfme-line);background:var(--bg,#f4efe4);color:var(--tfme-fg)}
.tfme-tabs{display:flex;gap:2px;margin:8px 0;background:var(--bg,#f4efe4);border-radius:9px;padding:2px;border:1px solid var(--tfme-line)}
.tfme-tabs button{flex:1;border:0;background:none;border-radius:7px;padding:.3rem 0;font:inherit;font-size:.8rem;font-weight:600;color:var(--tfme-muted);cursor:pointer}.tfme-tabs button.on{background:var(--tfme-panel);color:var(--tfme-fg);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.tfme-group h4{margin:10px 2px 4px;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--tfme-muted)}
.tfme-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.tfme-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px 3px;border:1px solid transparent;border-radius:9px;background:none;cursor:grab;color:var(--tfme-fg);font:inherit;font-size:.66rem;line-height:1.1;min-width:0}
.tfme-item:hover{background:rgba(127,110,85,.12);border-color:var(--tfme-line)}.tfme-item.on{border-color:var(--tfme-accent);background:rgba(107,79,42,.14)}
.tfme-item img{width:48px;height:48px;object-fit:contain;pointer-events:none}.tfme-item>span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tfme-badge{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin:4px;border-radius:50%;background:#8a7356;color:#fff;font-weight:700;text-transform:uppercase;font-size:.8rem}
.tfme-hint{font-size:.75rem;color:var(--tfme-muted);margin:10px 2px}
.tfme-stage{position:relative;min-width:0;min-height:0;background:var(--tfme-bg);overflow:hidden}
.tfme-stage canvas{position:absolute;inset:0;touch-action:none;cursor:default}
.tfme[data-tool=wall] canvas,.tfme[data-tool=floor] canvas,.tfme[data-tool=erase] canvas,.tfme[data-tool=door] canvas{cursor:crosshair}
.tfme-tip{position:absolute;pointer-events:none;max-width:260px;background:rgba(22,19,15,.95);color:#f4eee4;border:1px solid #5a4c3a;border-radius:9px;padding:6px 9px;font-size:12.5px;line-height:1.4;box-shadow:0 6px 18px rgba(0,0,0,.4)}.tfme-tip span{color:#c3b49c}
.tfme-inspect h3{margin:0;font-size:1.02rem}.tfme-muted{color:var(--tfme-muted);font-size:.8rem}
.tfme-head{display:flex;gap:10px;align-items:center;margin-bottom:8px}.tfme-thumb{width:56px;height:56px;object-fit:contain;flex:none;background:rgba(127,110,85,.1);border-radius:10px}
.tfme-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
.tfme-form label{display:flex;flex-direction:column;gap:3px;font-size:.74rem;color:var(--tfme-muted);min-width:0}.tfme-form label.wide{grid-column:1/-1}
.tfme-form input,.tfme-form select,.tfme-form textarea{font:inherit;font-size:.86rem;color:var(--tfme-fg);background:var(--bg,#f4efe4);border:1px solid var(--tfme-line);border-radius:8px;padding:.35rem .5rem;width:100%;min-width:0}
.tfme-form textarea{resize:vertical;line-height:1.4}
.tfme-form input:focus,.tfme-form select:focus,.tfme-form textarea:focus,.tfme-search:focus{outline:2px solid color-mix(in srgb,var(--tfme-accent) 55%,transparent);outline-offset:0}
.tfme-actions{display:flex;gap:6px;flex-wrap:wrap}.tfme-actions button{font:inherit;font-size:.82rem;padding:.35rem .7rem;border-radius:8px;border:1px solid var(--tfme-line);background:var(--bg,#f4efe4);color:var(--tfme-fg);cursor:pointer}
.tfme-actions button:hover{border-color:var(--tfme-accent)}.tfme-actions button.danger{color:#b5442e}
.tfme-note{font-size:.8rem;background:rgba(242,201,76,.16);border:1px solid rgba(242,201,76,.4);padding:6px 8px;border-radius:8px}
.tfme-chips{display:flex;flex-wrap:wrap;gap:4px}.tfme-chip{font:inherit;font-size:.78rem;padding:.2rem .55rem;border-radius:999px;border:1px solid var(--tfme-line);background:var(--bg,#f4efe4);cursor:grab;color:var(--tfme-fg)}
@media (max-width:980px){.tfme{height:auto}.tfme-body{grid-template-columns:1fr;grid-template-rows:auto 60vh auto}.tfme-palette{border-right:0;border-bottom:1px solid var(--tfme-line);max-height:30vh}.tfme-inspect{border-left:0;border-top:1px solid var(--tfme-line)}.tfme-grid{grid-template-columns:repeat(auto-fill,minmax(64px,1fr))}}
`;
    document.head.appendChild(st);
  }

  window.tfMapEditor = { mount, layout, writeBack, tiles };
})();
