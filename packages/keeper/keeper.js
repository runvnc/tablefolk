// keeper.js: the Dungeon Keeper game (packages/keeper; the rules are keeper-core.js, the scenario
// scenarios/keeper-lair.json). The player is the dungeon's keeper with no body: an overhead camera, the
// power bar, time controls, gold and the heart on the HUD. Imps dig marked rock (gold from veins) and claim
// rooms; a finished room big enough draws a creature that wants it through the portal; creatures eat in the
// hatchery, sleep in the lair, train, study, craft and guard by code, want their wages every pay day (a demand
// made of the keeper) and argue at a council when they are not paid; heroes come in from the gate and the
// creatures fight them. Above rails (a brain loaded, guided or free creatures) complaints and council speeches
// are their own words, and their work is a choice among activities. The reference: the scenario skill's keeper.md.
//
//   designations  dig (rock: gold from veins), lair, hatchery, treasury, training, library, workshop, prison, trap
//   powers        hand (pick up, then drop on a square), slap, heal, call_to_arms, lightning (once researched)
//   resources     gold (the treasury and the heart hold it), heart (the dungeon heart's health)
//   bar           Creatures (the list: mood, level, wage, what they do; rooms, research, traps), Pay wages,
//                 Drop (while the hand holds someone), Call off (a call to arms), Pause / Speed
//   threats       heroes (packages' threat kind; their turn: for the creatures near, else the heart)
//   cards         keeper_creature (mood, wage, pay day, what it wants)
// Map conventions: walls are rock; the scenario's grid letter "g" (legend: wall) marks gold veins; places "heart",
// "portal" and "hero_gate"; the grid's outer ring cannot be dug.
import { createKeeper, KINDS, ROOM_KINDS, stanceOf, vote } from './keeper-core.js';

export default function (api) {
  const W = window, J = () => W.tablefolkJobs, K = () => J()?.kit, B = () => W.tablefolkBar, BAB = () => W.BABYLON;
  const gm = () => J()?.gm?.() ?? 0;
  const R = createKeeper({ now: gm });
  let on = true;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const byId = id => api.state.characters.find(c => c.id === id) || null;
  const meta = m => W.meta?.(m);
  const key = (x, z) => Math.round(x) + ',' + Math.round(z);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
  const toast = (t, type) => api.toast(t, type || 'info');
  const narrate = t => api.narrator(t);
  const badge = (g, t) => { try { api.badge(g, t); } catch {} };
  const clip = (g, n, loop = false) => { try { api.playClip(g, n, { loop }); } catch {} };
  const hhmm = t => { const v = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
  const brainUsable = () => { try { return !!W.tablefolk?.brainReady?.() && W.tablefolkBrainInfo?.()?.engine !== 'none' && !new URLSearchParams(location.search).has('art') && !!W.tablefolkLLM && W.tablefolkScenario?.active?.scn?.brain !== 'none'; } catch { return false; } };
  const aboveRails = g => (W.tablefolkAgency?.level?.(g) || 'rails') !== 'rails';
  const words = g => brainUsable() && aboveRails(g);
  const isImp = g => !!g && (g._keeperImp || /^keeper_imp$/.test(J()?.jobOf?.(g)?.id || ''));
  const creature = g => g && R.get(g.id);
  const imps = () => api.state.characters.filter(c => !c.defeated && isImp(c));
  const creatures = () => api.state.characters.filter(c => !c.defeated && R.get(c.id) && !R.get(c.id).leaving);
  const heroes = () => (W.tablefolkThreats?.active?.() || []).filter(c => !c.defeated);
  const hpOf = g => api.getBrainConfig(g.id)?.hp ?? 10, maxHpOf = g => api.getBrainConfig(g.id)?.maxHp ?? 10;

  // ---------------------------------------------------------------- the map: rock, veins, places
  const rock = new Set(), veins = new Set(), edge = new Set();
  const places = () => api.state.places || [];
  const placeNamed = id => J()?.places?.placeNamed?.(id) || places().find(p => p.id === id) || null;
  const centre = p => p ? (Array.isArray(p.center) ? { x: p.center[0], z: p.center[1] } : { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 }) : { x: 0, z: 0 };
  const heart = () => centre(placeNamed('heart'));
  const portal = () => centre(placeNamed('portal'));
  const inPlace = (p, x, z) => p && x >= p.x0 - .01 && x <= p.x1 + .01 && z >= p.z0 - .01 && z <= p.z1 + .01;
  const wallAt = (x, z) => (api.state.blocks || []).find(b => b && !b.isDisposed?.() && meta(b)?.type === 'wall' && Math.round(b.position.x) === x && Math.round(b.position.z) === z) || null;
  function readMap() {
    rock.clear(); veins.clear(); edge.clear();
    for (const b of api.state.blocks || []) if (b && !b.isDisposed?.() && meta(b)?.type === 'wall') rock.add(key(b.position.x, b.position.z));
    // the grid's "g" squares are gold; its outer ring is the edge of the world (never dug)
    const scn = W.tablefolkScenario?.active?.scn || {}, grid = scn.grid || [], gw = Math.max(0, ...grid.map(r => r.length)), gh = grid.length;
    const WO = W.tablefolk?.WORLD || {}, cols = WO.cols || gw, rows = WO.rows || gh;
    const cx = Math.floor((cols - 1) / 2), cz = Math.floor((rows - 1) / 2), oc = Math.floor((cols - gw) / 2), or = Math.floor((rows - gh) / 2);
    for (let r = 0; r < gh; r++) for (let c = 0; c < grid[r].length; c++) {
      const x = cx - (c + oc), z = (r + or) - cz;
      if (grid[r][c] === 'g') veins.add(key(x, z));
      if (r === 0 || c === 0 || r === gh - 1 || c === gw - 1) edge.add(key(x, z));
    }
  }
  const isRock = (x, z) => rock.has(key(x, z));
  const openSide = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !isRock(x + dx, z + dz) && W.cellPassable?.(x + dx, z + dz));
  // what the hand of a builder can stand beside to dig a square
  function standFor(g, x, z) {
    const p = posOf(g);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: x + dx, z: z + dz })).filter(c => !isRock(c.x, c.z) && W.cellPassable?.(c.x, c.z) && !W.occupantAt?.(c.x, c.z, g))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] || null;
  }

  // ---------------------------------------------------------------- what you see: rock blocks, gold, the heart, the portal
  const fx = new Set();
  let rockMesh = null, goldMesh = null, edgeMesh = null, wallH = 1.5;
  function noiseTex(name, base, spots, n = 900) {
    const t = new (BAB().DynamicTexture)(name, { width: 128, height: 128 }, api.scene, true), c = t.getContext();
    c.fillStyle = base; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < n; i++) { const [col, r] = spots[i % spots.length]; c.fillStyle = col; c.globalAlpha = .25 + Math.random() * .5; c.beginPath(); c.arc(Math.random() * 128, Math.random() * 128, Math.random() * r + .5, 0, 7); c.fill(); }
    c.globalAlpha = 1; t.update(); t.wrapU = t.wrapV = 1; return t;
  }
  function blockMesh(name, tex, color, emissive) {
    const m = BAB().MeshBuilder.CreateBox(name, { width: 1.002, depth: 1.002, height: 1 }, api.scene);
    const mat = new (BAB().StandardMaterial)(name + '_mat', api.scene);
    mat.diffuseTexture = tex; mat.diffuseColor = new (BAB().Color3)(...color); mat.specularColor = new (BAB().Color3)(.05, .05, .05);
    if (emissive) mat.emissiveColor = new (BAB().Color3)(...emissive);
    m.material = mat; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.metadata = { keeperRock: true };
    m.thinInstanceSetBuffer('matrix', new Float32Array(16), 16); m.thinInstanceCount = 0;
    fx.add(m); fx.add(mat); fx.add(tex); return m;
  }
  function drawRock() {
    if (!api.scene) return;
    const scn = W.tablefolkScenario?.active?.scn || {};
    wallH = +scn.wallHeight || 1.5;
    rockMesh ||= blockMesh('keeper_rock', noiseTex('keeper_rock_tex', '#4b3f36', [['#2e2722', 5], ['#6a5a4c', 3], ['#3b322b', 8]]), [1, 1, 1]);
    goldMesh ||= blockMesh('keeper_gold', noiseTex('keeper_gold_tex', '#4a3d30', [['#f2c84b', 4], ['#ffe9a0', 2], ['#2e2620', 6]], 700), [1, 1, 1], [.22, .16, .03]);
    edgeMesh ||= blockMesh('keeper_edge', noiseTex('keeper_edge_tex', '#24201d', [['#141210', 6], ['#33302c', 4]]), [1, 1, 1]);
    const top = api.state.terrainTopY ?? 0, h = wallH + .14, groups = { r: [], g: [], e: [] };
    for (const k of rock) { const [x, z] = k.split(',').map(Number); (edge.has(k) ? groups.e : veins.has(k) ? groups.g : groups.r).push([x, z]); }
    for (const [m, list] of [[rockMesh, groups.r], [goldMesh, groups.g], [edgeMesh, groups.e]]) {
      const buf = new Float32Array(Math.max(1, list.length) * 16);
      list.forEach(([x, z], i) => BAB().Matrix.Compose(new (BAB().Vector3)(1, h, 1), BAB().Quaternion.Identity(), new (BAB().Vector3)(x, top + h / 2, z)).copyToArray(buf, i * 16));
      m.thinInstanceSetBuffer('matrix', buf, 16, false); m.thinInstanceCount = list.length; m.isVisible = list.length > 0;
    }
  }
  // the dungeon heart: a pulsing red orb; the portal: a turning purple ring
  let heartOrb = null, portalRing = null, heartLight = null, portalLight = null;
  function drawHeartAndPortal() {
    const top = api.state.terrainTopY ?? 0, h = heart(), p = portal(), V = BAB().Vector3, C3 = BAB().Color3;
    heartOrb = BAB().MeshBuilder.CreateSphere('keeper_heart', { diameter: .9, segments: 16 }, api.scene); heartOrb.position = new V(h.x, top + 1.1, h.z);
    const hm = new (BAB().StandardMaterial)('keeper_heart_mat', api.scene); hm.emissiveColor = new C3(.9, .12, .1); hm.diffuseColor = new C3(.5, .05, .05); heartOrb.material = hm; heartOrb.isPickable = false;
    portalRing = BAB().MeshBuilder.CreateTorus('keeper_portal', { diameter: 1.7, thickness: .16, tessellation: 32 }, api.scene); portalRing.position = new V(p.x, top + .1, p.z);
    const pm = new (BAB().StandardMaterial)('keeper_portal_mat', api.scene); pm.emissiveColor = new C3(.55, .2, .95); pm.diffuseColor = new C3(.2, .05, .4); pm.alpha = .85; portalRing.material = pm; portalRing.isPickable = false;
    heartLight = api.light(h.x, h.z, { y: 1.6, color: [1, .35, .25], intensity: 2.2, range: 7 });
    portalLight = api.light(p.x, p.z, { y: 1.2, color: [.7, .4, 1], intensity: 1.6, range: 5 });
    const obs = api.scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000, hp = R.heart() / R.rules.heartHp;
      if (heartOrb && !heartOrb.isDisposed()) { const s = 1 + .08 * Math.sin(t * (2.2 + (1 - hp) * 4)); heartOrb.scaling.setAll(s * (.6 + .4 * hp)); hm.emissiveColor.r = .5 + .4 * hp; }
      if (portalRing && !portalRing.isDisposed()) { portalRing.rotation.y = t * .8; portalRing.position.y = top + .1 + .05 * Math.sin(t * 1.7); }
    });
    for (const x of [heartOrb, hm, portalRing, pm, heartLight, portalLight]) fx.add(x);
    fx.add({ dispose: () => api.scene.onBeforeRenderObservable.remove(obs) });
  }
  // a puff of light (arrivals, digging, the hand)
  function burst(x, z, color = [1, .8, .3], n = 120, ms = 900) {
    try {
      const ps = new (BAB().ParticleSystem)('keeper_fx', n, api.scene), tex = new (BAB().DynamicTexture)('keeper_fx_tex', 16, api.scene, false), c = tex.getContext();
      const gr = c.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 16, 16); tex.update(); tex.hasAlpha = true;
      ps.particleTexture = tex; ps.emitter = new (BAB().Vector3)(x, (api.state.terrainTopY ?? 0) + .5, z); ps.minEmitBox = new (BAB().Vector3)(-.3, 0, -.3); ps.maxEmitBox = new (BAB().Vector3)(.3, .5, .3);
      ps.color1 = new (BAB().Color4)(...color, 1); ps.color2 = new (BAB().Color4)(...color.map(v => Math.min(1, v + .2)), 1); ps.colorDead = new (BAB().Color4)(0, 0, 0, 0);
      ps.minSize = .05; ps.maxSize = .16; ps.minLifeTime = .4; ps.maxLifeTime = .9; ps.emitRate = n * 2; ps.blendMode = 1; ps.gravity = new (BAB().Vector3)(0, .8, 0);
      ps.direction1 = new (BAB().Vector3)(-.6, 1.2, -.6); ps.direction2 = new (BAB().Vector3)(.6, 2, .6); ps.minEmitPower = .5; ps.maxEmitPower = 1.4; ps.start();
      fx.add(ps); setTimeout(() => { try { ps.stop(); } catch {} setTimeout(() => { try { ps.dispose(); tex.dispose(); } catch {} fx.delete(ps); }, 1200); }, ms);
    } catch (e) { console.warn('[keeper] fx', e); }
  }

  // ---------------------------------------------------------------- rooms
  const ROOM = {
    lair: { label: 'lair', icon: '🛏', color: '#b0563e', floor: 'carpet', tint: '#6e2f2a', light: [1, .55, .35], verb: 'claims the floor for a lair', description: 'beds for your creatures; goblins come to a lair' },
    hatchery: { label: 'hatchery', icon: '🍗', color: '#d6b04a', floor: 'dirt', tint: '#b8963e', light: [1, .8, .45], verb: 'claims the floor for the hatchery', description: 'food for your creatures (it breeds back each hour)' },
    treasury: { label: 'treasury', icon: '💰', color: '#f0d050', floor: 'tile', tint: '#a88a2a', light: [1, .85, .4], verb: 'claims the floor for the treasury', description: 'where the gold is kept (40 gold a square); kobolds come to guard it' },
    training: { label: 'training room', icon: '⚔', color: '#c06a3a', floor: 'stone', tint: '#8a6a58', light: [1, .6, .35], verb: 'claims the floor for the training room', description: 'creatures train and grow stronger (1 gold a session); orc warriors come to it' },
    library: { label: 'library', icon: '📚', color: '#6a7ad0', floor: 'wood', tint: '#5a4a6a', light: [.7, .6, 1], verb: 'claims the floor for the library', description: 'warlocks study here; research unlocks lightning' },
    workshop: { label: 'workshop', icon: '🔨', color: '#8a8f99', floor: 'concrete', tint: '#6a6660', light: [1, .7, .4], verb: 'claims the floor for the workshop', description: 'trolls craft traps here' },
    prison: { label: 'prison', icon: '⛓', color: '#5a6070', floor: 'flagstone', tint: '#4a4a55', light: [.6, .7, .9], verb: 'claims the floor for the prison', description: 'heroes struck down are dragged here, and rise as skeletons; spiders come to keep it' },
  };
  const roomOf = (x, z) => R.rooms().find(r => r.cells.some(c => c.x === x && c.z === z)) || null;
  const roomsOf = kind => R.rooms(kind);
  const lights = new Map();   // room id -> light
  const furniture = new Map();   // room id -> meshes
  const hatch = new Map();   // room id -> { food, grow }
  let goldPiles = [];
  function roomName(kind) { const n = roomsOf(kind).length; return n ? `${kind} ${n + 1}` : kind; }
  function makeRoom(kind, cells, { quiet = false } = {}) {
    cells = cells.filter(c => !isRock(c.x, c.z) && !roomOf(c.x, c.z));
    if (!cells.length) return null;
    const xs = cells.map(c => c.x), zs = cells.map(c => c.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const id = roomName(kind), spec = ROOM[kind];
    (api.state.places ||= []).push({ id, kind, x0, x1, z0, z1, center: [(x0 + x1) / 2, (z0 + z1) / 2], keeper: true });
    W.setPaint?.(cells.map(c => ({ x: c.x, z: c.z, mat: spec.floor, tint: spec.tint })));
    const meshes = [], put = (type, x, z, opts = {}) => { if (W.occupantAt?.(x, z, null)) return null; const m = W.tablefolk?.makeObject?.(type, x, z, opts); if (m) { meshes.push(m); if (meta(m)) meta(m).keeperRoom = id; } return m; };
    const has = (x, z) => cells.some(c => c.x === x && c.z === z);
    let beds = 0;
    // furniture on every other square (odd offsets: the paths between stay open)
    const odd = cells.filter(c => (c.x - x0) % 2 === 1 && (c.z - z0) % 2 === 1);
    if (kind === 'lair') {
      // beds (two squares long) down every other column, the row between free
      for (let x = x0; x <= x1; x += 2) for (let z = z0 + 1; z <= z1 - 1; z += 3) if (has(x, z - 1) && has(x, z) && has(x, z + 1) && put('bed', x, z, {})) beds++;
      if (!beds) for (const c of cells.slice(0, 1)) if (put('hay', c.x, c.z, {})) beds++;
    }
    if (kind === 'hatchery') { for (const c of odd) put(pick(['sacks', 'apple_barrel']), c.x, c.z, {}); hatch.set(id, { food: Math.max(2, Math.floor(cells.length / 2)), max: Math.max(2, Math.floor(cells.length / 2)), grow: 0 }); }
    if (kind === 'training') for (const c of odd) put('dummy', c.x, c.z, {});
    if (kind === 'library') odd.forEach((c, i) => put(i % 3 === 2 ? 'lectern' : 'bookcase', c.x, c.z, {}));
    if (kind === 'workshop') odd.forEach((c, i) => put(i % 2 ? 'workbench' : 'anvil', c.x, c.z, {}));
    if (kind === 'prison') odd.forEach((c, i) => put(i % 2 ? 'chains' : 'cage', c.x, c.z, {}));
    furniture.set(id, meshes);
    const L = api.light((x0 + x1) / 2, (z0 + z1) / 2, { y: 1.5, color: spec.light, intensity: 1.3, range: Math.max(4, Math.hypot(x1 - x0, z1 - z0) + 1.5) }); lights.set(id, L); fx.add(L);
    R.setRoom(id, kind, cells); const r = R.rooms().find(q => q.id === id); if (kind === 'lair') r.beds = Math.max(1, beds);
    if (kind === 'treasury') piles();
    if (!quiet) {
      const k = Object.values(KINDS).find(k => k.wants === kind), big = k && cells.length >= k.minSize;
      narrate(`The ${spec.label} is ready (${cells.length} squares${kind === 'lair' ? `, ${r.beds} bed${r.beds > 1 ? 's' : ''}` : ''}).${k ? big ? ` It will draw ${k.label}s.` : ` ${k.minSize} squares or more would draw ${k.label}s.` : ''}`);
      W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'room', id, kind, size: cells.length } }));
      arrivalSoon = true;
    }
    return r;
  }
  // gold: the heart holds some, every treasury square 40 more; piles show what lies in the treasury
  const capacity = () => R.rules.heartGold + R.cells('treasury') * R.rules.treasuryPerCell;
  function piles() {
    const cells = roomsOf('treasury').flatMap(r => r.cells), want = Math.min(cells.length, Math.ceil(Math.max(0, api.resource('gold') - R.rules.heartGold) / R.rules.treasuryPerCell));
    while (goldPiles.length > want) { const m = goldPiles.pop(); try { W.tablefolk.disposeWorldObject(m); api.state.props = api.state.props.filter(x => x !== m); } catch {} }
    for (const c of cells.slice(goldPiles.length, want)) { const m = W.tablefolk?.makeObject?.('coin_pile', c.x, c.z, { gold: 0 }); if (m) { goldPiles.push(m); if (meta(m)) meta(m).decor = true; } }
  }
  function deposit(n) {
    const room = Math.max(0, capacity() - api.resource('gold')), put = Math.min(n, room);
    if (put > 0) api.resource('gold', put);
    piles();
    return { put, lost: n - put };
  }

  // ---------------------------------------------------------------- designations: digging, rooms, traps
  const near1 = (g, c) => dist(posOf(g), c) <= 1.6;
  const digging = new Map();   // imp id -> { k, hits }
  const slapped = new Map();   // id -> until (game minute)
  const quick = (g, ms) => (slapped.get(g.id) || 0) > gm() ? Math.round(ms * .45) : ms;
  async function goNear(g, ctx, c, label) { const st = standFor(g, c.x, c.z) || c; const r = await ctx.goTo(st.x, st.z, label); if (r.fail) return r; return r.done ? null : { busy: true, ms: r.ms || 1500 }; }
  function dug(x, z, g) {
    const b = wallAt(x, z); if (b) { try { W.tablefolk.disposeWorldObject(b); } catch {} api.state.blocks = api.state.blocks.filter(m => m !== b); api.state.props = api.state.props.filter(m => m !== b); }
    const k = key(x, z), gold = veins.has(k); rock.delete(k); veins.delete(k);
    W.setPaint?.([{ x, z, mat: 'dirt', tint: '#5a4a3a' }]);
    try { W.scheduleWallRebuild?.(); } catch {}
    drawRock();
    if (gold && g) { const inv = api.inventory(g); api.setBrainConfig(g.id, { inventory: { ...inv, gold: (inv.gold || 0) + R.rules.goldPerVein } }); badge(g, `+${R.rules.goldPerVein} gold`); api.sound('coins', g); burst(x, z, [1, .85, .3]); }
    else burst(x, z, [.6, .5, .4], 60);
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'dug', x, z, gold } }));
    return gold;
  }
  const designations = {
    dig: {
      label: 'dig', shape: 'rect', color: '#e0a040', ground: 'rock', jobs: ['keeper_imp'], maxWorkers: 4, h: 1.75,
      description: 'dig out rock (gold from the veins: the glittering squares)',
      accept: (x, z) => !isRock(x, z) ? 'not rock' : edge.has(key(x, z)) ? 'the edge of the world' : true,
      ready: c => isRock(c.x, c.z) && openSide(c.x, c.z),
      async run(g, c, ctx) {
        if (!isRock(c.x, c.z)) return { done: true, ms: 300 };
        if (!near1(g, c)) { const w = await goNear(g, ctx, c, 'the rock face'); if (w) return w; }
        if (!near1(g, c)) return { fail: 'could not reach the rock' };
        const k = key(c.x, c.z), d = digging.get(g.id)?.k === k ? digging.get(g.id) : { k, hits: 0 };
        digging.set(g.id, d);
        try { W.setCharacterFacing?.(g, new (BAB().Vector3)(Math.sign(c.x - posOf(g).x), 0, Math.sign(c.z - posOf(g).z))); } catch {}
        ctx.setDoing(veins.has(k) ? 'mining gold' : 'digging');
        clip(g, 'attack'); api.sound('hit', g);
        if (++d.hits < (veins.has(k) ? 4 : 3)) return { busy: true, ms: quick(g, 1100) };
        digging.delete(g.id); dug(c.x, c.z, g);
        return { done: true, ms: quick(g, 700) };
      },
    },
    trap: {
      label: 'trap', shape: 'posts', color: '#d04848', ground: 'floor', jobs: ['keeper_imp'], maxWorkers: 2,
      description: 'a spike trap the workshop has made (it hurts the first hero to step on it)',
      accept: (x, z) => isRock(x, z) ? 'rock' : true,
      ready: () => R.traps() > 0,
      async run(g, c, ctx) {
        if (!near1(g, c)) { const r = await ctx.goTo(c.x, c.z, 'the trap'); if (r.fail) return r; if (!r.done) return { busy: true, ms: r.ms || 1500 }; }
        if (!R.useTrap()) return { fail: 'no trap made yet' };
        ctx.setDoing('setting a trap'); clip(g, 'pickup');
        const m = W.tablefolk?.makeObject?.('bear_trap', c.x, c.z, {}); if (m) { traps.push({ x: c.x, z: c.z, mesh: m }); if (meta(m)) meta(m).decor = true; }
        return { done: true, ms: 1500 };
      },
    },
  };
  for (const kind of ROOM_KINDS) {
    const s = ROOM[kind];
    designations[kind] = {
      label: s.label, shape: 'rect', color: s.color, ground: 'floor', jobs: ['keeper_imp'], maxWorkers: 3, description: s.description,
      accept: (x, z) => isRock(x, z) ? 'rock (dig it first)' : roomOf(x, z) ? 'already a room' : ['heart', 'portal', 'hero_gate'].some(id => inPlace(placeNamed(id), x, z)) ? 'the heart, the portal or the gate' : true,
      async run(g, c, ctx) {
        if (roomOf(c.x, c.z)) return { done: true, ms: 200 };
        if (dist(posOf(g), c) > 1.1) { const r = await ctx.goTo(c.x, c.z, 'the new ' + s.label); if (r.fail) return r; if (!r.done) return { busy: true, ms: r.ms || 1500 }; }
        ctx.setDoing(s.verb); clip(g, 'pickup');
        W.setPaint?.([{ x: c.x, z: c.z, mat: s.floor, tint: s.tint }]);
        return { done: true, ms: quick(g, 1300) };
      },
      done(d, ctx) { makeRoom(kind, ctx.cells); },
    };
  }
  const traps = [];

  // ---------------------------------------------------------------- the imps (on rails always: they are the keeper's hands)
  async function impWork(g, s, j) {
    const k = K();
    // gold in hand: to the treasury (else the heart)
    const inv = api.inventory(g);
    if ((inv.gold || 0) > 0) {
      const tr = roomsOf('treasury').flatMap(r => r.cells).sort((a, b) => dist(a, posOf(g)) - dist(b, posOf(g)))[0], to = tr || heart();
      k.setDoing(g, s, tr ? 'carrying gold to the treasury' : 'carrying gold to the heart');
      if (dist(posOf(g), to) > 1.6) { const r = await k.goTo(g, s, to.x, to.z, tr ? 'the treasury' : 'the heart'); if (!r.fail) return { ms: quick(g, r.ms || 1500) }; }
      const got = deposit(inv.gold);
      api.setBrainConfig(g.id, { inventory: { ...api.inventory(g), gold: 0 } });
      api.sound('coins', g); badge(g, got.lost ? `the treasury is full (${got.lost} lost)` : `+${got.put} gold stored`);
      if (got.lost) toast(`The treasury is full: ${got.lost} gold lost. Build a bigger treasury.`, 'warn');
      return { ms: 1200 };
    }
    // marked work: digging, claiming rooms, setting traps
    const r = await W.tablefolkDesignate?.workFor?.(g, s, j);
    if (r) return { ms: quick(g, r.ms || 1500) };
    // nothing to do: back to the heart, a slow look about
    k.setDoing(g, s, 'idling by the heart');
    const h = heart();
    if (dist(posOf(g), h) > 4) { const r2 = await k.goTo(g, s, h.x + (Math.random() * 4 - 2), h.z + 2, 'the heart'); return { ms: r2.ms || 2000 }; }
    return { ms: 3000 };
  }

  // ---------------------------------------------------------------- the creatures on rails (and their needs above rails)
  let rally = null;   // { x, z, until }
  let council = null, lastCouncil = null;   // { members, at, speeches }
  const held = [];   // the hand: characters lifted
  const hungryNoFood = new Set(), noBed = new Set();
  const m0 = g => W.tablefolkMind?.mindOf?.(g);
  const thingsIn = (room, re) => api.things().filter(o => o.mesh && !o.mesh.isDisposed?.() && re.test(o.type) && meta(o.mesh)?.keeperRoom === room.id);
  async function goRoom(g, s, room, label) {
    const k = K(), p = J().places.placeNamed(room.id) || room;
    if (inPlace(p, posOf(g).x, posOf(g).z)) return null;
    const c = room.cells.filter(c => W.cellPassable?.(c.x, c.z) && !W.occupantAt?.(c.x, c.z, g)).sort((a, b) => dist(a, posOf(g)) - dist(b, posOf(g)))[0] || room.cells[0];
    const r = await k.goTo(g, s, c.x, c.z, label || 'the ' + room.id); if (r.fail) return { ms: 2500, fail: true };
    return { ms: r.ms || 1500 };
  }
  async function eat(g, s) {
    const k = K(), rooms = roomsOf('hatchery').filter(r => (hatch.get(r.id)?.food || 0) > 0);
    if (!rooms.length) { hungryNoFood.add(g.id); return null; }
    hungryNoFood.delete(g.id);
    const room = rooms.sort((a, b) => dist(centre(J().places.placeNamed(a.id)), posOf(g)) - dist(centre(J().places.placeNamed(b.id)), posOf(g)))[0];
    k.setDoing(g, s, 'going to the hatchery to eat');
    const w = await goRoom(g, s, room, 'the hatchery'); if (w) return w;
    const h = hatch.get(room.id); h.food--; clip(g, 'pickup'); badge(g, 'eats'); api.sound('pickup', g);
    const m = m0(g); if (m) m.hunger = 0;
    R.adjust(g.id, R.rules.ate, 'ate');
    k.setDoing(g, s, 'eating in the hatchery');
    return { ms: 3500 };
  }
  async function rest(g, s) {
    const k = K(), m = m0(g);
    if (g.pose?.mode === 'lie') { if (m) m.tired = Math.max(0, m.tired - .12); k.setDoing(g, s, 'asleep in the lair'); if (m && m.tired <= .05) { k.wake(g, s); R.adjust(g.id, R.rules.slept, 'slept'); return { ms: 1500 }; } return { ms: 4000 }; }
    const lairs = roomsOf('lair'); if (!lairs.length) { noBed.add(g.id); return null; }
    noBed.delete(g.id);
    const beds = lairs.flatMap(r => thingsIn(r, /^(bed|hay)$/)).filter(b => !api.state.characters.some(c => c !== g && c.pose?.mode === 'lie' && dist(posOf(c), b) < .8));
    const bed = beds.sort((a, b) => dist(a, posOf(g)) - dist(b, posOf(g)))[0];
    k.setDoing(g, s, 'going to its bed in the lair');
    if (!bed) { const w = await goRoom(g, s, lairs[0], 'the lair'); if (w) return w; try { W.tablefolkUses?.lieOnFloor?.(g); } catch {} return { ms: 4000 }; }
    const r = await k.goDo(g, s, bed, `use(${bed.type})`);
    if (r.fail) { try { W.tablefolkUses?.lieOnFloor?.(g); } catch {} }
    return { ms: r.ms || 3000 };
  }
  // its work, by kind: training at a dummy, study at a bookcase, crafting at an anvil, guarding its room
  const WORK = {
    train: { room: 'training', at: /^(dummy|target)$/, clip: 'attack', doing: 'training', every: 4500,
      done(g) { if (api.resource('gold') < 1) return 'no gold to train with'; api.resource('gold', -1); const r = R.train(g.id); if (r.up) { narrate(`${g.id} has grown stronger: level ${r.level}. Its wage rises to ${R.wageOf(g.id)} gold.`); const hp = maxHpOf(g) + R.rules.hpStep; api.setBrainConfig(g.id, { maxHp: hp, hp }); badge(g, `level ${r.level}!`); burst(posOf(g).x, posOf(g).z, [1, .9, .4]); } else badge(g, '+1 xp'); return null; } },
    research: { room: 'library', at: /^(bookcase|lectern)$/, clip: 'cast', doing: 'studying', every: 5000,
      done(g) { const r = R.research(g.id); badge(g, `research ${r.points}`); for (const u of r.unlocked) { narrate(`The warlocks have mastered ${u}! A new power: ${u === 'lightning' ? '⚡ Lightning' : u}.`); B()?.render?.(); W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'research', unlocked: u } })); } return null; } },
    craft: { room: 'workshop', at: /^(anvil|workbench)$/, clip: 'hammer', doing: 'crafting', every: 5000,
      done(g) { const r = R.craft(g.id); api.sound('hit', g); if (r.made) { narrate(`The workshop has made a trap. Mark where it goes (Mark, trap).`); badge(g, 'a trap!'); } else badge(g, 'hammers'); return null; } },
  };
  async function work(g, s, c) {
    const k = K(), kind = KINDS[c.kind], w = WORK[kind.work];
    if (w) {
      const rooms = roomsOf(w.room);
      if (rooms.length) {
        const st = thingsIn(rooms[0], w.at).concat(rooms.slice(1).flatMap(r => thingsIn(r, w.at))).sort((a, b) => dist(a, posOf(g)) - dist(b, posOf(g)));
        const busy = st.filter(o => !creatures().some(o2 => o2 !== g && dist(posOf(o2), o) < 1.3));
        const o = busy[0] || st[0];
        if (o) {
          k.setDoing(g, s, `${w.doing} in the ${rooms[0].id}`);
          if (dist(posOf(g), o) > 1.6) { const r = await k.goDo(g, s, o, null); if (r.fail) return { ms: 2500 }; if (!r.done) return { ms: r.ms || 1500 }; }
          try { W.setCharacterFacing?.(g, new (BAB().Vector3)(Math.sign(o.x - posOf(g).x), 0, Math.sign(o.z - posOf(g).z))); } catch {}
          clip(g, w.clip);
          const st2 = (s.keeper ||= {});
          if ((st2.workAt || 0) + quick(g, w.every) < performance.now()) { st2.workAt = performance.now(); const why = w.done(g); if (why) { k.setDoing(g, s, why); return { ms: 6000 }; } }
          return { ms: quick(g, 2200) };
        }
      }
    }
    // guards: walk about their room; anyone without its room: about the lair or the heart
    const home = kind.work === 'guard' ? roomsOf(kind.wants)[0] : null, any = home || roomsOf('lair')[0];
    k.setDoing(g, s, home ? `guarding the ${home.id}` : `idling${any ? ' in the ' + any.id : ' by the heart'}`);
    const cells = any ? any.cells : [heart()], c2 = pick(cells);
    if (Math.random() < .5 && dist(posOf(g), c2) > 1) { const r = await k.goTo(g, s, c2.x, c2.z, any ? 'the ' + any.id : 'the heart'); return { ms: (r.ms || 1500) + 1500 }; }
    return { ms: 3500 };
  }
  async function leave(g, s) {
    const k = K(), p = portal();
    k.setDoing(g, s, 'leaving the dungeon');
    if (dist(posOf(g), p) > 1.5 && (s.keeperLeaveTries = (s.keeperLeaveTries || 0) + 1) < 14) { const r = await k.goTo(g, s, p.x, p.z, 'the portal'); if (!r.fail) return { ms: r.ms || 2000 }; }
    burst(posOf(g).x, posOf(g).z, [.7, .4, 1]);
    narrate(`${g.id} the ${KINDS[R.get(g.id)?.kind]?.label || 'creature'} has left the dungeon.`);
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'left', id: g.id } }));
    R.remove(g.id); despawn(g);
    return { ms: 5000 };
  }
  function despawn(g) { try { W.disposeCharacter?.(g); } catch {} api.state.characters = api.state.characters.filter(x => x !== g); try { api.state.brainConfigs.delete(g.id); W.refreshAgentSelect?.(); } catch {} }
  async function urgent(g, s, j) {
    if (!on) return null;
    if (held.includes(g)) return { ms: 1500 };
    if (isImp(g)) { if (heroes().some(h => dist(posOf(h), posOf(g)) < 3.5)) return null; return impWork(g, s, j); }
    const c = creature(g); if (!c) return null;
    if (c.leaving) return leave(g, s);
    const k = K(), raid = heroes();
    // the council: everyone to the heart
    if (council?.members.includes(g.id)) { k.setDoing(g, s, 'at the council'); const h = heart(); if (dist(posOf(g), h) > 2.6) { const r = await k.goTo(g, s, h.x, h.z + 2, 'the heart'); return { ms: r.ms || 2000 }; } return { ms: 2000 }; }
    // a call to arms: to the spot, and fight what comes near it
    if (rally && rally.until > gm()) {
      if (raid.some(h => dist(posOf(h), posOf(g)) < 8)) return null;
      k.setDoing(g, s, 'answering the call to arms');
      if (g.pose?.mode === 'lie') k.wake(g, s);
      if (dist(posOf(g), rally) > 2) { const r = await k.goTo(g, s, rally.x, rally.z, 'the call to arms'); return { ms: Math.min(2500, r.ms || 2000) }; }
      return { ms: 2000 };
    }
    if (raid.length) return null;   // the core sends fighters at the heroes
    const m = m0(g), above = words(g);
    if (R.striking(g.id)) { k.setDoing(g, s, 'on strike'); if (Math.random() < .15) grumble(g, 'strike'); const lair = roomsOf('lair')[0]; if (lair) { const w = await goRoom(g, s, lair, 'the lair'); if (w) return w; } return { ms: 5000 }; }
    if (g.pose?.mode === 'lie' && (m?.tired ?? 0) > .05) return rest(g, s);
    if ((m?.hunger ?? 0) >= (above ? .85 : .55)) { const r = await eat(g, s); if (r) return r; }
    if ((m?.tired ?? 0) >= (above ? .9 : .7)) { const r = await rest(g, s); if (r) return r; }
    if (above) return null;   // above rails: the agency's activities (ours among them)
    if (R.happy(g.id) < R.rules.complainBelow && Math.random() < .06) grumble(g);
    return work(g, s, c);
  }
  // above rails: our activities among the others
  function options(g, s, j) {
    if (!on || isImp(g)) return [];
    const c = creature(g); if (!c) return [];
    const out = [], kind = KINDS[c.kind], w = WORK[kind.work];
    if (w && roomsOf(w.room).length) out.push({ key: 'keeper:work', kind: 'work', cmd: w.doing, label: `${w.doing} in the ${roomsOf(w.room)[0].id}`, doing: w.doing, run: async (g2, s2, j2, a) => { a.cap ||= 120; const r = await work(g2, s2, c); return { busy: true, ms: r.ms }; } });
    if ((m0(g)?.hunger ?? 0) > .35 && roomsOf('hatchery').length) out.push({ key: 'keeper:eat', kind: 'eat', cmd: 'eat', label: 'eat in the hatchery', doing: 'going to eat', run: async (g2, s2) => { const r = await eat(g2, s2); return r && (m0(g2)?.hunger ?? 0) > .1 ? { busy: true, ms: r.ms } : { done: true, text: 'ate' }; } });
    if ((m0(g)?.tired ?? 0) > .4 && roomsOf('lair').length) out.push({ key: 'keeper:sleep', kind: 'sleep', cmd: 'sleep', label: 'sleep in the lair', doing: 'going to sleep', run: async (g2, s2) => { const r = await rest(g2, s2); return r && (m0(g2)?.tired ?? 0) > .05 ? { busy: true, ms: r.ms } : { done: true, text: 'slept' }; } });
    if (R.happy(g.id) < 60) out.push({ key: 'keeper:grumble', kind: 'talk', cmd: 'complain', label: `complain about ${grievance(c)}`, doing: 'complaining', run: async g2 => { await grumble(g2); return { done: true, text: 'complained' }; } });
    if (R.happy(g.id) < R.rules.strikeBelow) out.push({ key: 'keeper:strike', kind: 'refuse', cmd: 'go on strike', label: 'go on strike until the keeper does better', doing: 'striking', run: async g2 => { R.strike([g2.id], 1); await say(g2, pick(LINES.strike), 'You put down your work and refuse to do any more until the keeper treats you better. Say so in one short sentence.'); return { done: true, text: 'went on strike' }; } });
    return out;
  }

  // ---------------------------------------------------------------- words: complaints, the council (templated on rails, their own above)
  const LINES = {
    pay: ['Where is my gold, keeper?', 'No gold, no work. That is the deal.', 'I have not been paid. I remember that.', 'A pay day came and went, and my purse is empty.'],
    hungry: ['The hatchery is empty. Do you want us to eat each other?', 'I am starving down here.', 'Food, keeper. We need food.'],
    sleep: ['There is no bed for me. I sleep on rock like a beast.', 'Build us a proper lair, keeper.'],
    slap: ['Slap me again and see what happens.', 'I felt that, keeper. I will remember it.', 'Ow! I am working, I am working!'],
    general: ['This dungeon is a miserable hole.', 'Other keepers treat their creatures better.', 'I did not come all this way for this.'],
    strike: ['I am not lifting a finger until I am paid.', 'We stop work. All of us.', 'No more. Pay us, then we talk.'],
    council: {
      wait: ['The keeper has always paid before. I will wait one more pay day.', 'Patience. Give the keeper time.', 'I stay, for now. But I am counting.'],
      strike: ['We stop work until the gold comes!', 'No more work for nothing. Down tools!', 'I will not train, dig or lift a thing until we are paid.'],
      leave: ['I am leaving. There are other dungeons.', 'Pay us or I walk out of this hole for good.', 'I am done with this keeper. Find another fool.'],
    },
  };
  function grievance(c) {
    if (R.lastPay()?.how === 'missed') return 'the wages you were not paid';
    const w = [...c.why].reverse().find(x => x.d < 0)?.why || '';
    return /paid/.test(w) ? 'the wages you were not paid' : /hungry/.test(w) ? 'the empty hatchery' : /bed/.test(w) ? 'having no bed' : /slap|lift/.test(w) ? 'being slapped about' : 'how the keeper treats you';
  }
  const lastGrumble = new Map();
  async function grumble(g, kind) {
    const c = creature(g); if (!c) return;
    const t = performance.now(); if (t - (lastGrumble.get(g.id) || -1e9) < 40000) return; lastGrumble.set(g.id, t);
    const gr = grievance(c), pool = kind ? LINES[kind] : /wages/.test(gr) ? LINES.pay : /hatchery/.test(gr) ? LINES.hungry : /bed/.test(gr) ? LINES.sleep : /slapped/.test(gr) ? LINES.slap : LINES.general;
    await say(g, pick(pool), `You are unhappy in the keeper's dungeon (happiness ${Math.round(c.happy)} of 100). Complain about ${gr} in one short sentence, in your own words.`);
  }
  const who = g => { const c = creature(g), cfg = api.getBrainConfig(g.id) || {}; return `You are ${g.id}, a ${KINDS[c?.kind]?.label || 'creature'} in a dungeon keeper's service. ${String(cfg.personality || '').slice(0, 200)} Your happiness is ${Math.round(c?.happy ?? 50)} of 100, your loyalty ${Math.round(c?.loyal ?? 50)}. Your wage is ${R.wageOf(g.id)} gold a pay day.`; };
  async function say1(g, user, max = 50) {
    try {
      W.dispatchEvent(new CustomEvent('tablefolk-model-call', { detail: { agentId: g.id, kind: 'keeper' } }));
      const out = await W.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: who(g) }, { role: 'user', content: user }], max_tokens: max, temperature: .7, agentId: g.id, thinking: false });
      let t = String(out?.choices?.[0]?.message?.content || '').replace(/\([^)]*\)|\*[^*]*\*/g, ' ').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
      t = t.replace(/^(\w+\s*:|say\(|")+/i, '').replace(/["')]+\s*$/, '').replace(/^["“]|["”]$/g, '').trim();
      return t.length > 3 ? t.slice(0, 200) : null;
    } catch (e) { console.warn('[keeper] brain', e); return null; }
  }
  // a line: the creature's own words above rails, else the templated one; said aloud
  async function say(g, line, prompt) {
    let text = line, by = 'code';
    if (prompt && words(g)) { const t = await say1(g, prompt); if (t) { text = t; by = 'model'; } }
    try { api.say(g, text, true); } catch {}
    return { text, by };
  }
  async function holdCouncil(reason = 'wages') {
    if (council) return council;
    const members = creatures().map(g => g.id); if (!members.length) return null;
    council = { members, at: gm(), reason, speeches: [] };
    narrate(`The creatures gather at the heart to argue about their ${reason}.`);
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'council', phase: 'start', members } }));
    // half a minute at most to gather
    const t0 = performance.now();
    while (performance.now() - t0 < 30000 && members.some(id => { const g = byId(id); return g && dist(posOf(g), heart()) > 3.2; })) await new Promise(r => setTimeout(r, 800));
    const speakers = members.map(byId).filter(Boolean).sort((a, b) => R.happy(a.id) - R.happy(b.id)).slice(0, 5);
    const stances = [];
    for (const g of speakers) {
      const base = R.stance(g.id), r = await say(g, pick(LINES.council[base]), `The keeper did not pay your wages (${R.wageOf(g.id)} gold). The creatures are arguing at a council by the dungeon heart. Say in one or two short sentences whether you will wait for the gold, stop work until you are paid, or leave the dungeon.`);
      const st = r.by === 'model' ? (stanceOf(r.text) || base) : base;
      council.speeches.push({ who: g.id, text: r.text, by: r.by, stance: st }); stances.push(st);
      await new Promise(res => setTimeout(res, 1600));
    }
    const v = vote(stances); council.outcome = v;
    const leavers = council.speeches.filter(x => x.stance === 'leave').map(x => x.who);
    if (v.outcome === 'strike') { R.strike(members); narrate(`The council has voted: the creatures stop work until they are paid (${v.votes.strike} for a strike).`); }
    else if (v.outcome === 'leave') narrate(`The council breaks up in anger: ${leavers.join(' and ')} will leave the dungeon.`);
    else narrate(`The council has voted to wait for their gold${leavers.length ? `, but ${leavers.join(' and ')} will not` : ''}.`);
    for (const id of v.outcome === 'wait' && leavers.length < 2 ? leavers.slice(0, 1) : leavers) { const c = R.get(id); if (c) c.leaving = true; }
    lastCouncil = council; council = null;
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'council', phase: 'end', outcome: v.outcome, votes: v.votes, leavers } }));
    return lastCouncil;
  }

  // ---------------------------------------------------------------- pay day: a demand made of the keeper
  let payDemand = null, lastPaydayHour = null, startHour = 0;
  async function payday() {
    const p = R.payday(); if (!p) return null;
    const spokes = creatures().sort((a, b) => R.get(b.id).level - R.get(a.id).level || R.get(b.id).arrived - R.get(a.id).arrived)[0];
    const d = await api.demand({ text: `Pay day! We want our wages: ${p.owed} gold by ${hhmm(p.by)}.`, of: 'player', by: p.by, via: spokes?.id || null,
      met: { flag: 'keeper_paid_' + p.n }, from: 'keeper', data: { keeperPay: p.n } });
    payDemand = d?.id ? d : null;
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'payday', n: p.n, owed: p.owed, by: p.by } }));
    toast(`Pay day: your creatures want ${p.owed} gold by ${hhmm(p.by)} (💰 Pay wages).`, 'warn');
    B()?.render?.();
    return p;
  }
  function payWages() {
    const p = R.pending(); if (!p) { toast('No wages are owed.'); return { fail: 'no wages owed' }; }
    const r = R.pay(api.resource('gold'));
    if (!r.ok) { toast(`Cannot pay: ${r.why}.`, 'warn'); return { fail: r.why }; }
    api.resource('gold', -r.paid); piles();
    for (const id of p.ids) { const g = byId(id); if (!g) continue; badge(g, `+${R.wageOf(id)} gold`); const inv = api.inventory(g); api.setBrainConfig(id, { inventory: { ...inv, gold: (inv.gold || 0) + R.wageOf(id) } }); }
    api.sound('coins'); api.flag('keeper_paid_' + p.n, true);
    narrate(`The keeper pays ${r.paid} gold in wages${r.early ? ' promptly' : ''}. The creatures are pleased.`);
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'paid', n: p.n, gold: r.paid } }));
    B()?.render?.();
    return r;
  }
  async function missedPay() {
    const r = R.missPay(); if (!r) return null;
    narrate(`Pay day passed and the keeper paid nothing (${r.owed} gold owed). The creatures are furious.`);
    for (const id of r.leave) { const c = R.get(id); if (c) c.leaving = true; }
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'missed', owed: r.owed } }));
    B()?.render?.();
    holdCouncil('wages').catch(e => console.warn('[keeper] council', e));
    return r;
  }

  // ---------------------------------------------------------------- arrivals
  const NAMES = { goblin: ['grub', 'snik', 'mogg', 'ratbag', 'nix'], orc: ['gorza', 'thrak', 'urga'], warlock: ['morvane', 'ilsabet', 'quill'], troll: ['bonk', 'grumm'], kobold: ['yip', 'skree', 'tik'], spider: ['skitter', 'webb'], skeleton: ['rattle', 'bones', 'clatter', 'marrow'] };
  const PERSON = {
    goblin: 'a goblin: cheerful, greedy and quick to complain; loves the hatchery and gold.',
    orc: 'an orc warrior: proud, gruff, lives to fight and train; despises slackers and late wages.',
    warlock: 'a warlock: cold, clever, ambitious; studies forbidden books and expects to be paid well for it.',
    troll: 'a troll: slow, strong and patient; likes hammering at the workshop and hates being rushed.',
    kobold: 'a kobold: twitchy and suspicious; guards the treasury and counts every coin twice.',
    spider: 'a giant spider: silent, watchful; keeps the prison.',
    skeleton: 'a skeleton raised from a fallen hero: grim, obedient, rattles when it walks.',
  };
  const WEAPON = { goblin: 'dagger', orc: 'axe', warlock: 'staff', kobold: 'dagger', skeleton: 'sword' };
  let arrivalSoon = false, lastArrival = -1e9;
  async function arrive(kind, at = null) {
    const K0 = KINDS[kind], p = at || portal(), c = api.freeCell(p.x, p.z, 2) || p;
    const name = (NAMES[kind] || [kind]).find(n => !byId(n)) || kind;
    const g = await api.spawn(name, K0.body, c.x, c.z, { hostile: false, job: 'keeper_creature', hp: K0.hp, style: K0.label, personality: `${name.replace(/^\w/, x => x.toUpperCase())}, ${PERSON[kind]}`, items: WEAPON[kind] ? [WEAPON[kind]] : [] });
    if (!g) return null;
    R.add(g.id, kind);
    try { api.setBrainConfig(g.id, { skills: ['keeper_creature'] }); } catch {}
    try { W.tablefolkGroups?.join?.('creatures', g.id); } catch {}
    try { if (WEAPON[kind]) await api.combat.wield(g, WEAPON[kind]); } catch {}
    const m = m0(g); if (m) { m.hunger = .1; m.tired = .1; }
    burst(c.x, c.z, [.7, .4, 1], 160, 1200); api.sound('pickup', g);
    lastArrival = gm();
    const why = K0.wants ? `drawn by your ${ROOM[K0.wants].label}` : 'from the prison';
    narrate(`${name.replace(/^\w/, x => x.toUpperCase())} the ${K0.label} comes through the portal, ${why}.`);
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'arrived', id: g.id, kind } }));
    B()?.render?.();
    return g;
  }
  function arrivals() {
    if (!(arrivalSoon || gm() - lastArrival >= 60)) return;
    arrivalSoon = false;
    const kind = R.attract(); if (kind) arrive(kind).catch(e => console.warn('[keeper] arrive', e));
  }

  // ---------------------------------------------------------------- heroes
  async function heroTurn(c, ctx) {
    if (!c._keeperArmed) { c._keeperArmed = true; const w = /mage|wizard/.test(c.charModel) ? 'staff' : 'sword'; try { api.give(c, w, 1); await api.combat.wield(c, w); } catch {} }
    // creatures or imps near: fight them (the core's raid)
    const prey = api.state.characters.filter(o => !o.defeated && !o._threat && (R.get(o.id) || isImp(o)) && !held.includes(o) && dist(posOf(o), posOf(c)) < 6.5);
    if (prey.length) return false;
    // else for the heart
    const h = heart();
    if (dist(posOf(c), h) > 1.9) { if (!c.turnMove) ctx.walkTo(h.x + (Math.random() - .5), h.z + 1.5); return true; }
    clip(c, 'attack'); api.sound('hit', c);
    const hp = R.heart(-4); api.resource('heart', -4);
    badge(c, 'strikes the heart!');
    if (hp <= 0 && !api.flag('keeper_fallen')) { api.flag('keeper_fallen', true); narrate('The dungeon heart shatters. The heroes have won, and your dungeon is lost.'); W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'fallen' } })); }
    else if (hp % 20 === 0 || hp < 20) toast(`The heart is under attack! (${hp} left)`, 'warn');
    await new Promise(r => setTimeout(r, 900));
    return true;
  }
  const prisoners = new Map();   // hero id -> { since, x, z }
  function onDefeated(e) {
    const id = e.detail?.id, g = byId(id); if (!g || !on) return;
    if (g._threat) {
      const pr = roomsOf('prison')[0];
      if (pr && prisoners.size < R.cells('prison')) {
        const c = pr.cells.find(q => !W.occupantAt?.(q.x, q.z, g)) || pr.cells[0];
        setTimeout(() => { try { teleport(g, c.x, c.z); prisoners.set(g.id, { since: gm(), x: c.x, z: c.z }); badge(g, 'imprisoned'); narrate(`${g.id} is dragged off to the prison.`); } catch {} }, 1500);
      } else { deposit(15); narrate(`${g.id} falls; the imps take 15 gold from the body.`); piles(); }
      for (const o of creatures()) if (dist(posOf(o), posOf(g)) < 6) R.adjust(o.id, R.rules.victory / 2, 'struck down a hero');
      return;
    }
    if (R.get(id)) {
      for (const o of creatures()) if (o.id !== id) R.adjust(o.id, R.rules.comradeDied, `${id} was killed`);
      narrate(`${id} has fallen.`); R.remove(id);
    }
  }
  function prisonTick() {
    for (const [id, p] of [...prisoners]) {
      const g = byId(id); if (!g) { prisoners.delete(id); continue; }
      if (gm() - p.since >= 120) {
        prisoners.delete(id); const at = { x: p.x, z: p.z };
        try { W.tablefolkThreats?.groups?.forEach(gr => { gr.ids = gr.ids.filter(x => x !== id); }); } catch {}
        despawn(g);
        arrive('skeleton', at).then(s => { if (s) narrate(`In the prison, ${id} rises again as ${s.id}, a skeleton that serves you.`); }).catch(() => {});
      }
    }
  }
  function teleport(g, x, z) {
    W.setCharacterLogicalPosition?.(g, new (BAB().Vector3)(x, 0, z));
    const pb = g.collider?.physicsBody; if (!pb?.setPrestepType) return;
    try { pb.setPrestepType(BAB().PhysicsPrestepType.TELEPORT); } catch {}
    api.scene.onAfterRenderObservable.addOnce(() => { try { pb.setPrestepType(BAB().PhysicsPrestepType.ACTION); } catch {} });
  }
  function trapTick() {
    for (let i = traps.length - 1; i >= 0; i--) {
      const t = traps[i], h = heroes().find(c => dist(posOf(c), t) < .7); if (!h) continue;
      try { api.combat.hurt(h, 5, null, 'is caught in a spike trap'); } catch {}
      api.sound('hit', h); badge(h, 'caught in a trap!'); burst(t.x, t.z, [1, .3, .2], 80);
      try { W.tablefolk.disposeWorldObject(t.mesh); api.state.props = api.state.props.filter(x => x !== t.mesh); } catch {}
      traps.splice(i, 1);
      narrate(`${h.id} steps on a spike trap.`);
    }
  }

  // ---------------------------------------------------------------- powers
  const notHero = g => g && !g._threat;
  const powers = {
    hand: { label: 'Hand', icon: '✋', target: 'character', cooldown: 0, description: 'Pick up a creature or an imp (up to 8); then Drop them on a square.',
      run(t) {
        const g = t.who; if (!g || g._threat || g.defeated) return { fail: 'The hand picks up only your own creatures and imps' };
        if (held.includes(g)) return { fail: `${g.id} is already in your hand` };
        if (held.length >= 8) return { fail: 'Your hand is full' };
        if (g.pose?.mode === 'lie') K()?.wake?.(g, K().S(g));
        held.push(g); g._keeperHeld = true; try { g.root.setEnabled(false); } catch {}
        if (R.get(g.id)) R.adjust(g.id, R.rules.lifted, 'picked up');
        burst(t.x, t.z, [1, .95, .7], 80);
        handButton(); return `The keeper's hand lifts ${g.id}.`;
      } },
    slap: { label: 'Slap', icon: '👋', target: 'character', cooldown: 1, description: 'A slap: the creature works twice as fast for a game hour, but likes you less (and it stings).',
      run(t) {
        const g = t.who; if (!g || g.defeated) return { fail: 'Slap whom?' };
        clip(g, 'hit'); api.sound('hit', g); badge(g, 'slapped!');
        try { api.combat.hurt(g, 1, null, 'is slapped by the keeper'); } catch {}
        if (g._threat) return `The keeper slaps ${g.id}.`;
        slapped.set(g.id, gm() + 60);
        if (R.get(g.id)) { R.adjust(g.id, R.rules.slap, 'slapped'); if (Math.random() < .5) grumble(g, 'slap'); }
        if (g.pose?.mode === 'lie') K()?.wake?.(g, K().S(g));
        return `The keeper slaps ${g.id}. It hurries.`;
      } },
    heal: { label: 'Heal', icon: '✚', target: 'character', cost: { gold: 10 }, cooldown: 3, description: 'Heal a creature or imp to full health.',
      run(t) {
        const g = t.who; if (!notHero(g) || g.defeated) return { fail: 'Heal one of your own' };
        try { api.combat.heal(g, 99); } catch {} api.setBrainConfig(g.id, { hp: maxHpOf(g) });
        if (R.get(g.id)) R.adjust(g.id, R.rules.healed, 'healed');
        burst(t.x, t.z, [.5, 1, .6], 120); badge(g, 'healed');
        return `${g.id} is healed.`;
      } },
    call_to_arms: { label: 'Call to arms', icon: '🚩', target: 'place', cost: { gold: 5 }, cooldown: 3, description: 'Every creature gathers at a square, and fights what comes (for two game hours, or until called off).',
      run(t) {
        if (!creatures().length) return { fail: 'You have no creatures to call' };
        rally = { x: t.x, z: t.z, until: gm() + 120 }; drawRally(); armsButton();
        for (const g of creatures()) { if (g.pose?.mode === 'lie') K()?.wake?.(g, K().S(g)); badge(g, 'to arms!'); }
        return 'The keeper calls the creatures to arms!';
      } },
    lightning: { label: 'Lightning', icon: '⚡', target: 'character', cost: { gold: 20 }, cooldown: 8, when: () => R.unlocked('lightning'), description: 'Researched in the library: lightning on a hero (5 damage).',
      run(t) {
        const g = t.who; if (!g || g.defeated) return { fail: 'Strike whom?' };
        try { W.tablefolkSpells?.strike?.(t.x, t.z); } catch {}
        try { api.combat.hurt(g, 5, null, 'is struck by lightning'); } catch {}
        if (R.get(g.id)) R.adjust(g.id, -15, 'struck by lightning');
        return `Lightning strikes ${g.id}!`;
      } },
  };
  let rallyMesh = null;
  function drawRally() {
    try { rallyMesh?.dispose(); } catch {} rallyMesh = null; if (!rally) return;
    rallyMesh = BAB().MeshBuilder.CreateCylinder('keeper_rally', { diameterTop: .05, diameterBottom: .05, height: 2.2 }, api.scene);
    const flag = BAB().MeshBuilder.CreatePlane('keeper_rally_flag', { width: .7, height: .45 }, api.scene); flag.parent = rallyMesh; flag.position.set(.36, .8, 0); flag.billboardMode = 2;
    const mat = new (BAB().StandardMaterial)('keeper_rally_mat', api.scene); mat.emissiveColor = new (BAB().Color3)(.9, .15, .1); mat.backFaceCulling = false; flag.material = mat; rallyMesh.material = mat;
    rallyMesh.position.set(rally.x, (api.state.terrainTopY ?? 0) + 1.1, rally.z); rallyMesh.isPickable = flag.isPickable = false; fx.add(rallyMesh);
  }
  function callOff() { rally = null; drawRally(); armsButton(); narrate('The call to arms is over.'); }
  function drop(x, z) {
    if (!held.length) return { fail: 'Your hand is empty' };
    if (isRock(x, z) || !W.cellPassable?.(x, z)) { const c = api.freeCell(x, z, 3); if (!c) return { fail: 'Nowhere to drop them there' }; x = c.x; z = c.z; }
    const out = [];
    for (const g of held.splice(0)) {
      const c = api.freeCell(x, z, 3) || { x, z };
      teleport(g, c.x, c.z); g._keeperHeld = false; try { g.root.setEnabled(true); } catch {}
      clip(g, 'hit'); badge(g, 'dropped'); out.push(g.id);
      const s = K()?.S(g); if (s) { s.sub = {}; s.dz = null; } try { W.tablefolkDesignate?.board?.release?.(g.id); } catch {}
    }
    burst(x, z, [1, .95, .7], 120); api.sound('step');
    handButton();
    narrate(`The keeper drops ${out.join(', ')}.`);
    W.dispatchEvent(new CustomEvent('tablefolk-keeper', { detail: { what: 'dropped', ids: out, x, z } }));
    return out;
  }
  function dropTool() {
    if (!held.length) return;
    B().pick(`<span>✋ Drop ${esc(held.map(g => g.id).join(', '))}: click a square</span><button type="button" data-pick="cancel">not yet</button>`, { cancel: () => { B().useTool(null); B().pick(null); } });
    B().useTool({ power: 'drop', click: cell => { if (!cell) return; B().useTool(null); B().pick(null); drop(cell.x, cell.z); }, cancel: () => B().pick(null) });
  }
  function handButton() { try { B()?.set?.('keeper:drop', { label: `Drop (${held.length})` }); B()?.render?.(); } catch {} }
  function armsButton() { try { B()?.render?.(); } catch {} }

  // ---------------------------------------------------------------- the creatures panel
  let panelOpen = false;
  function showPanel() {
    panelOpen = true;
    const on2 = { close: () => { panelOpen = false; B().pick(null); }, cancel: () => { panelOpen = false; B().pick(null); } };
    const rows = creatures().concat(imps()).map(g => {
      const c = R.get(g.id), h = c ? Math.round(c.happy) : null, s = g._job?.doing || '';
      on2['l:' + g.id] = () => look(g);
      return `<div class="kp"><button type="button" data-pick="l:${esc(g.id)}" title="look">👁</button><b>${esc(g.id)}</b> <i>${esc(c ? KINDS[c.kind].label + ' · level ' + c.level + ' · wage ' + R.wageOf(g.id) : 'imp')}</i>`
        + (c ? ` <span class="bar"><span style="width:${h}%;background:${h >= 60 ? '#7fc46a' : h >= 35 ? '#d8b04a' : '#d0584a'}"></span></span> ${h}${R.striking(g.id) ? ' <b style="color:#e0704a">on strike</b>' : ''}${c.leaving ? ' <b style="color:#e0704a">leaving</b>' : ''}` : '')
        + ` <small>${esc(held.includes(g) ? 'in your hand' : s)}</small></div>`;
    }).join('');
    const rooms = ROOM_KINDS.map(k => { const n = R.cells(k); return n ? `${ROOM[k].icon} ${ROOM[k].label} ${n}` : ''; }).filter(Boolean).join(' · ') || 'no rooms yet: dig, then Mark a room on the open floor';
    const p = R.pending(), next = nextPayday();
    const sum = `<div class="kp"><small>rooms: ${esc(rooms)}<br>gold ${Math.floor(api.resource('gold'))} of ${capacity()} · wages ${R.owed()} a pay day · ${p ? `<b>${p.owed} owed by ${hhmm(p.by)}</b>` : `next pay day ${hhmm(next)}`} · research ${R.researchPoints()}${R.unlocked().length ? ' (' + R.unlocked().join(', ') + ')' : ''} · traps ready ${R.traps()} · heart ${R.heart()}</small></div>`;
    B().pick(`<div class="keeperPanel"><div class="ktabs"><b>Creatures</b><span style="flex:1"></span><button type="button" data-pick="close">close</button></div>${sum}${rows || '<div class="kp"><small>No creatures yet. Build a lair and a hatchery: goblins come through the portal.</small></div>'}</div>`, on2);
  }
  function look(g) { if (!g) return; const c = api.state.camera; if (!c) return; api.state.followAvatar = false; c.setTarget(new (BAB().Vector3)(posOf(g).x, 0, posOf(g).z)); c.radius = Math.min(c.radius, 14); badge(g, '👁'); }
  const nextPayday = () => { const h = Math.floor(gm() / 60), N = R.rules.paydayHours; let k = h + 1; while ((k - startHour) % N) k++; return k * 60; };

  // ---------------------------------------------------------------- the card (the "keeper_creature" skill)
  const cards = {
    keeper_creature(g) {
      const c = creature(g); if (!c) return '';
      const K0 = KINDS[c.kind], out = [`You are a ${K0.label} (level ${c.level}) in the keeper's dungeon. Happiness ${Math.round(c.happy)} of 100, loyalty ${Math.round(c.loyal)}. Your wage: ${R.wageOf(g.id)} gold a pay day.`];
      const p = R.pending(), last = R.lastPay();
      if (p) out.push(`It is pay day: the keeper owes the creatures ${p.owed} gold by ${hhmm(p.by)}.`);
      else if (last) out.push(last.how === 'paid' ? 'The keeper paid your wages last pay day.' : '!The keeper did NOT pay your wages last pay day.');
      if (R.striking(g.id)) out.push('You are on strike until you are paid.');
      const bad = [...c.why].reverse().find(x => x.d < 0); if (bad && gm() - bad.at < 240) out.push(`Lately: ${bad.why}.`);
      if (heroes().length) out.push(`!Heroes are in the dungeon: ${heroes().map(h => h.id).join(', ')}. Defend the heart.`);
      if (rally && rally.until > gm()) out.push('The keeper has called you to arms.');
      return out;
    },
  };

  // ---------------------------------------------------------------- every game quarter hour
  function quarter() {
    if (!on) return;
    const t = gm(), h = Math.floor(t / 60);
    // the hatchery breeds: a meal back an hour for every 3 squares
    if (Math.floor(t / 60) !== Math.floor((t - 15) / 60)) {
      for (const r of roomsOf('hatchery')) { const x = hatch.get(r.id); if (!x) continue; x.grow += r.size / 3; const add = Math.floor(x.grow); x.grow -= add; x.food = Math.min(x.max, x.food + add); }
      const hr = R.hour({ hungry: [...hungryNoFood].filter(id => R.get(id)), sleepless: [...noBed].filter(id => R.get(id)) });
      hungryNoFood.clear(); noBed.clear();
      for (const id of hr.leave) { const c = R.get(id); if (c && !c.leaving) { c.leaving = true; const g = byId(id); if (g) say(g, pick(LINES.council.leave), 'You have had enough of this dungeon and its keeper. Say goodbye in one short, bitter sentence.'); } }
      for (const id of hr.sulk) { const g = byId(id); if (g && Math.random() < .5) grumble(g); }
      prisonTick();
      // pay day, every few hours from the start
      if (h !== lastPaydayHour && h > startHour && (h - startHour) % R.rules.paydayHours === 0) { lastPaydayHour = h; payday().catch(e => console.warn('[keeper] payday', e)); }
    }
    if (rally && rally.until <= t) callOff();
    arrivals();
    B()?.render?.();
    if (panelOpen && !document.getElementById('tfPickBar')?.hidden && document.querySelector('#tfPickBar .keeperPanel')) showPanel();
  }

  // ---------------------------------------------------------------- the bar, the HUD, the camera, time
  function speedButton() { const k = W.tablefolkModes?.speed || 1; try { B()?.set?.('keeper:speed', { label: `×${k}`, icon: k > 1 ? '⏩' : '▶' }); } catch {} }
  function pauseButton() { const live = !!W.tablefolkLive?.on; try { B()?.set?.('keeper:pause', { label: live ? 'Pause' : 'Go on', icon: live ? '⏸' : '▶' }); } catch {} }
  function bar() {
    api.bar.add({ id: 'keeper:pause', label: 'Pause', icon: '⏸', title: 'Pause or go on (P)', order: 1, run: () => { W.tablefolkLive?.toggle?.(); setTimeout(pauseButton, 50); } });
    api.bar.add({ id: 'keeper:speed', label: '×1', icon: '▶', title: 'Time: normal, twice, four times as fast', order: 2, run: () => { const k = W.tablefolkModes?.speed || 1; W.tablefolkModes?.setSpeed?.(k >= 4 ? 1 : k * 2); speedButton(); } });
    api.bar.add({ id: 'keeper:creatures', label: 'Creatures', icon: '👹', title: 'Your creatures (mood, level, wage, what they do), the rooms, research and traps', order: 5, run: () => (panelOpen && !document.getElementById('tfPickBar')?.hidden) ? (panelOpen = false, B().pick(null)) : showPanel() });
    api.bar.add({ id: 'keeper:pay', label: 'Pay wages', icon: '💰', title: 'Pay the wages your creatures demand', order: 6, when: () => !!R.pending(), cost: () => R.pending() ? `${R.pending().owed} gold` : '', run: () => payWages() });
    api.bar.add({ id: 'keeper:drop', label: 'Drop', icon: '👇', title: 'Drop what the hand holds on a square', order: 61, when: () => held.length > 0, run: dropTool });
    api.bar.add({ id: 'keeper:calloff', label: 'Call off', icon: '🏳', title: 'End the call to arms', order: 62, when: () => !!(rally && rally.until > gm()), run: callOff });
    pauseButton(); speedButton();
  }
  if (!document.getElementById('tfKeeperCss')) {
    const css = document.createElement('style'); css.id = 'tfKeeperCss';
    css.textContent = `#tfPickBar .keeperPanel{display:flex;flex-direction:column;gap:4px;max-height:42vh;overflow:auto;min-width:min(720px,90vw)}
#tfPickBar .ktabs{display:flex;gap:6px;align-items:center}#tfPickBar .keeperPanel button{flex:0 0 auto;width:auto}
#tfPickBar .kp{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:4px 6px;border-radius:9px;background:rgba(255,255,255,.05);font-weight:500}
#tfPickBar .kp i{opacity:.75;font-style:normal;font-size:11.5px}#tfPickBar .kp small{opacity:.8}
#tfPickBar .kp .bar{display:inline-block;width:90px;height:7px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}#tfPickBar .kp .bar span{display:block;height:100%}
html.keeper-game #powerBar{left:12px;transform:none;bottom:12px;flex-wrap:wrap;max-width:min(760px,calc(100vw - 420px));overflow:visible;justify-content:flex-start}
html.keeper-game #powerBar button{flex:0 0 auto;min-width:50px;padding:3px 5px;font-size:10.5px}html.keeper-game #powerBar button .ic{font-size:17px}
html.keeper-game #tfPickBar{left:12px;transform:none;bottom:96px;justify-content:flex-start;max-width:min(900px,calc(100vw - 24px))}
@media (max-width:760px){html.keeper-game #powerBar{max-width:calc(100vw - 24px);flex-wrap:nowrap;overflow-x:auto;bottom:150px}html.keeper-game #tfPickBar{bottom:222px}#tfPickBar .keeperPanel{max-height:40vh;min-width:0}}`;
    document.head.appendChild(css);
  }
  const hooks = { urgent, options };
  function start() {
    on = true;
    const scn = W.tablefolkScenario?.active?.scn || {};
    R.clear(); held.length = 0; rally = null; council = null; lastCouncil = null; payDemand = null; traps.length = 0; prisoners.clear(); hatch.clear(); lights.clear(); furniture.clear(); goldPiles = []; slapped.clear(); digging.clear();
    startHour = Math.floor(gm() / 60); lastPaydayHour = startHour; lastArrival = -1e9;
    readMap(); drawRock(); drawHeartAndPortal();
    for (const g of api.state.characters) if (/^imp/.test(g.charModel || '') || /^keeper_imp$/.test(J()?.jobOf?.(g)?.id || '')) g._keeperImp = true;
    // rooms the scenario starts with: "flags": { "keeper_rooms": [{ "kind": "lair", "x0": .., "x1": .., "z0": .., "z1": .. }] }
    for (const r of [].concat(scn.flags?.keeper_rooms || [])) { const cells = []; for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) cells.push({ x, z }); makeRoom(r.kind, cells, { quiet: true }); }
    W.tablefolkModes?.setSpeed?.(1);
    document.documentElement.classList.add('keeper-game');
    bar();
    // a keeper has no body: the overhead camera over the heart
    if (!api.player()) setTimeout(() => { try { const c = api.state.camera, h = heart(); if (!c) return; api.state.followAvatar = false; c.setTarget(new (BAB().Vector3)(h.x - 3, 0, h.z + 4)); c.radius = 24; c.beta = .72; c.alpha = -Math.PI / 2; } catch (e) { console.warn('[keeper] camera', e); } }, 400);
  }
  api.on('tablefolk-scenario-started', e => { if (e.detail?.sub) return; try { start(); } catch (err) { console.warn('[keeper] start', err); } });
  api.on('tablefolk-clock', () => { try { quarter(); } catch (e) { console.warn('[keeper] quarter', e); } });
  api.on('tablefolk-defeated', e => { try { onDefeated(e); } catch (err) { console.warn('[keeper] defeated', err); } });
  api.on('tablefolk-demand', e => { if (payDemand && e.detail?.id === payDemand.id && e.detail.status === 'missed') { payDemand = null; missedPay().catch(err => console.warn('[keeper] missed', err)); } if (payDemand && e.detail?.id === payDemand.id && e.detail.status === 'met') payDemand = null; });
  api.every(1500, () => { pauseButton(); });
  api.every(600, () => { try { trapTick(); } catch {} });
  W.tablefolkJobs?.addUrgent?.(hooks.urgent); W.tablefolkAgency?.addOptions?.(hooks.options);
  (W.tablefolkSaveHooks ||= {}).keeper = {
    save: () => ({ r: R.data(), veins: [...veins], hatch: [...hatch], rally, startHour, lastPaydayHour, payDemand: payDemand?.id || null, prisoners: [...prisoners] }),
    restore: x => { if (!x) return; R.load(x.r); readMap(); veins.clear(); for (const k of x.veins || []) veins.add(k); drawRock(); hatch.clear(); for (const [k, v] of x.hatch || []) hatch.set(k, v); rally = x.rally; startHour = x.startHour ?? startHour; lastPaydayHour = x.lastPaydayHour ?? lastPaydayHour; prisoners.clear(); for (const [k, v] of x.prisoners || []) prisoners.set(k, v); drawRally(); },
  };
  // what tests and other packages may read
  W.tablefolkKeeper = { rules: R, rock: () => rock, veins: () => veins, isRock, dug, makeRoom, roomOf, payday, payWages, missedPay, holdCouncil, council: () => council, lastCouncil: () => lastCouncil, arrive, attract: () => R.attract(),
    drop, held: () => held.slice(), rally: () => rally, callOff, heart, portal, hatch: () => hatch, capacity, deposit, traps: () => traps, prisoners: () => prisoners, showPanel, quarter, prisonTick, drawRock, grumble, nextPayday };

  return {
    resources: {
      gold: { label: 'Gold', icon: '💰', start: 60, min: 0, max: 99999, color: '#f0d050' },
      heart: { label: 'Heart', icon: '❤', start: 100, min: 0, max: 100, color: '#e04040' },
    },
    designations, powers, cards,
    threats: { heroes: heroTurn },
    dispose() {
      on = false;
      W.tablefolkJobs?.removeUrgent?.(hooks.urgent); W.tablefolkAgency?.removeOptions?.(hooks.options);
      if (W.tablefolkSaveHooks?.keeper) delete W.tablefolkSaveHooks.keeper;
      for (const x of fx) { try { x.stop?.(); x.dispose?.(); } catch {} } fx.clear();
      rockMesh = goldMesh = edgeMesh = heartOrb = portalRing = rallyMesh = null;
      W.tablefolkModes?.setSpeed?.(1); document.documentElement.classList.remove('keeper-game');
      if (W.tablefolkKeeper?.rules === R) delete W.tablefolkKeeper;
    },
  };
}
