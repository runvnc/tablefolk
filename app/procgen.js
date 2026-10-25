/* procgen.js -- seeded dungeon and village generator for scenarios.
 *
 *   "generate": { "kind": "dungeon", "seed": 7, "rooms": 9 }
 *   "generate": { "kind": "village", "seed": 3, "buildings": 7 }
 *
 * Output is ordinary scenario material: an ASCII grid (+ legend), explicit
 * objects (lights), and a list of named places (rooms, buildings, the
 * square). Characters go into a place with "in": "throne" / "tavern" /
 * "room 3" / "house", or are put somewhere fitting their role when they have
 * neither "at" nor "in" (a goblin in the lair, a smith at the smithy).
 *
 * Dungeon: BSP rooms joined by corridors (plus a loop or two), one-cell walls
 * around floors only (the rest of the board stays bare table), rooms given a
 * purpose by their place in the graph (the entrance nearest the south edge,
 * the throne room or lair furthest away, treasure in dead ends) and furnished
 * to match. Village: two crossing roads, a square with a campfire, buildings
 * along the roads with doors onto them, trees, flowers, a garden, a pond.
 * Doorways get real doors ('+'), and generated scenarios default to
 * "wallHeight": 2 so the person-height doors fit.
 *
 * Plain script, no dependencies: the browser loads it before scenario.js
 * (window.TablefolkProcgen); the server imports it for the same result.
 */
(function () {
  function rng(seed) {
    let a = (Number(seed) || 1) >>> 0 || 1;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    const pick = arr => arr[Math.floor(next() * arr.length)];
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    return { next, int, pick, shuffle };
  }
  const odd = n => (n % 2 ? n : n + 1);
  const clampSize = (n, lo, hi) => odd(Math.max(lo, Math.min(hi, Math.round(n))));

  // Grid helpers: g[r][c], row 0 = north. Board cell x = x0 - c, z = r - z0.
  function makeGrid(W, H, fill) { return Array.from({ length: H }, () => Array(W).fill(fill)); }
  function toBoard(W, H) { const x0 = Math.floor((W - 1) / 2), z0 = Math.floor((H - 1) / 2); return (r, c) => [x0 - c, r - z0]; }

  // What each kind of room holds. Glyphs are the scenario grid's own.
  const ROOM_FURNISH = {
    entrance: { floor: '^', wall: ['j'], center: [] },
    throne: { floor: 'R', wall: ['K', 'W', '!', 'e', '!'], center: ['A'], carpet: true },
    lair: { floor: ':', wall: ['r', 'B', 'b', '<', '{'], center: ['X'] },
    treasure: { floor: '^', wall: ['h', '$', '$', 'P', 'm', '>', ']', '}'], center: ['h'] },
    library: { floor: '=', wall: ['K', 'K', 'K', 'S', '(', '!'], center: ['t', 's', '?'] },
    shrine: { floor: '^', wall: ['!', 'e', 'S', 'i', '}'], center: ['?'] },
    barracks: { floor: '^', wall: ['Z', ')', 'Z', 'W', 'n', '/'], center: ['t', 'z'] },
    storage: { floor: ':', wall: ['C', 'B', ']', '|', 'u', '<'], center: ['C'] },
    kitchen: { floor: 'E', wall: ['|', 'u', 'w', '(', '}'], center: ['o', 't', 'z'] },
    prison: { floor: ':', wall: ['f', '{', '[', 'u', '{'], center: [] },
    crypt: { floor: '^', wall: ['r', '!', 'S', '}', '<'], center: ['h'] },
    alchemy: { floor: '^', wall: ['P', 'P', 'K', 'w', '[', '('], center: ['o'] },
    room: { floor: '^', wall: ['C', 'B'], center: [] },
  };
  const BUILDING_FURNISH = {
    tavern: { floor: '=', wall: ['B', '|', 'n', 'j', 'e', '('], center: ['t', 'z', 't', 's'], size: [7, 6] },
    smithy: { floor: 'Q', wall: ['W', '/', 'p', 'd'], center: ['a', '&'], size: [6, 5] },
    shop: { floor: '=', wall: ['C', 'B', 'K', '$', 'm'], center: ['t'], size: [5, 5] },
    temple: { floor: '^', wall: ['i', 'e', 'i', 'S'], center: ['n', 'n', 'o'], size: [7, 7] },
    alchemist: { floor: '_', wall: ['P', 'K', 'P', 'w'], center: ['o'], size: [5, 5] },
    guardhouse: { floor: '^', wall: ['W', 'Z', '/', 'e'], center: ['t'], size: [5, 5] },
    library: { floor: '=', wall: ['K', 'K', 'K'], center: ['t', 's'], size: [6, 5] },
    house: { floor: '=', wall: ['Z', ')', 'K', '(', 'j'], center: ['t', 'z'], size: [5, 5] },
    stable: { floor: ':', wall: ['u', 'B', 'f', 'd'], center: [], size: [6, 5] },
  };
  const GEN_LEGEND = { R: 'carpet', E: 'tile', Q: 'concrete', U: 'flagstone', y: 'lily_pad on water',
    Z: 'bed', G: 'well', O: 'market_stand', V: 'cart', J: 'dummy', k: 'target', g: 'pumpkin', d: 'logs', e: 'wall_banner', i: 'torch', m: 'iron_chest',
    '!': 'candelabra', '?': 'lectern', '(': 'cabinet', ')': 'nightstand', '[': 'cage', ']': 'iron_crate', '{': 'chains', '}': 'vase',
    '<': 'broken_pot', '>': 'chalice', '|': 'apple_barrel', z: 'wooden_chair' };

  // Furnish a rectangular interior (r0..r1, c0..c1): wall-side things on cells
  // next to the wall but not next to a doorway, centre things near the middle,
  // always leaving a walkable ring.
  function furnish(g, R, { r0, c0, r1, c1 }, spec, doors) {
    const nearDoor = (r, c) => doors.some(([dr, dc]) => Math.abs(dr - r) + Math.abs(dc - c) <= 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = spec.floor;
    const W = c1 - c0 + 1, H = r1 - r0 + 1;
    if (spec.carpet && W >= 3) { // a runner of carpet down the middle, stone around
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = Math.abs(c - (c0 + c1) / 2) <= .6 ? 'R' : '^';
    }
    const edgeCells = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const onEdge = r === r0 || r === r1 || c === c0 || c === c1;
      const corner = (r === r0 || r === r1) && (c === c0 || c === c1);
      if (onEdge && !nearDoor(r, c)) edgeCells.push([r, c, corner]);
    }
    R.shuffle(edgeCells).sort((a, b) => b[2] - a[2]);
    const want = Math.min(edgeCells.length, Math.max(1, Math.round((W + H) * .45)));
    const taken = new Set();
    let k = 0;
    for (const [r, c] of edgeCells) {
      if (k >= want || !spec.wall.length) break;
      // not two in a row along a short wall: keep gaps so it reads as furniture
      if (taken.has((r - 1) + ',' + c) && taken.has((r + 1) + ',' + c)) continue;
      g[r][c] = spec.wall[k % spec.wall.length]; taken.add(r + ',' + c); k++;
    }
    if (W >= 3 && H >= 3) {
      const mr = Math.floor((r0 + r1) / 2), mc = Math.floor((c0 + c1) / 2);
      const spots = [[mr, mc], [mr, mc + 1], [mr + 1, mc], [mr - 1, mc], [mr, mc - 1], [mr + 1, mc + 1]];
      spec.center.forEach((glyph, i) => { const s = spots[i]; if (s && s[0] > r0 && s[0] < r1 && s[1] > c0 && s[1] < c1 && !nearDoor(...s)) g[s[0]][s[1]] = glyph; });
    }
  }

  // ---------------------------------------------------------------- dungeon
  function dungeon(opts) {
    const R = rng(opts.seed);
    const W = clampSize(opts.size?.[0] ?? 33, 15, 63), H = clampSize(opts.size?.[1] ?? 25, 13, 63);
    const target = Math.max(3, Math.min(16, +opts.rooms || Math.round(W * H / 95)));
    // BSP: split the board (inside a one-cell rim) until leaves are small.
    let leaves = [{ r0: 1, c0: 1, r1: H - 2, c1: W - 2 }];
    for (let guard = 0; leaves.length < target && guard < 200; guard++) {
      leaves.sort((a, b) => (b.r1 - b.r0) * (b.c1 - b.c0) - (a.r1 - a.r0) * (a.c1 - a.c0));
      const L = leaves[0], h = L.r1 - L.r0 + 1, w = L.c1 - L.c0 + 1;
      const vertical = w > h * 1.2 ? true : h > w * 1.2 ? false : R.next() < .5;
      const span = vertical ? w : h;
      if (span < 12) break;
      const cut = R.int(Math.floor(span * .38), Math.ceil(span * .62));
      leaves.shift();
      if (vertical) leaves.push({ ...L, c1: L.c0 + cut - 1 }, { ...L, c0: L.c0 + cut });
      else leaves.push({ ...L, r1: L.r0 + cut - 1 }, { ...L, r0: L.r0 + cut });
    }
    // A room inside each leaf: interior at least 3x3, walls one cell in.
    const rooms = leaves.map((L, i) => {
      const lw = L.c1 - L.c0 + 1, lh = L.r1 - L.r0 + 1;
      const w = R.int(Math.max(3, Math.floor(lw * .5)), Math.max(3, lw - 3)), h = R.int(Math.max(3, Math.floor(lh * .5)), Math.max(3, lh - 3));
      const c0 = L.c0 + 1 + R.int(0, Math.max(0, lw - 2 - w)), r0 = L.r0 + 1 + R.int(0, Math.max(0, lh - 2 - h));
      return { i, r0, c0, r1: r0 + h - 1, c1: c0 + w - 1 };
    }).filter(r => r.r1 >= r.r0 + 2 && r.c1 >= r.c0 + 2);
    const ctr = rm => [Math.floor((rm.r0 + rm.r1) / 2), Math.floor((rm.c0 + rm.c1) / 2)];
    // Connect: a minimum spanning tree over room centres, then a loop or two.
    const dist = (a, b) => { const [ar, ac] = ctr(a), [br, bc] = ctr(b); return Math.abs(ar - br) + Math.abs(ac - bc); };
    const edges = [], inTree = new Set([0]);
    while (inTree.size < rooms.length) {
      let best = null;
      for (const i of inTree) for (let j = 0; j < rooms.length; j++) if (!inTree.has(j)) { const d = dist(rooms[i], rooms[j]); if (!best || d < best[2]) best = [i, j, d]; }
      edges.push(best); inTree.add(best[1]);
    }
    const extra = Math.max(1, Math.round(rooms.length / 5));
    const others = [];
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) if (!edges.some(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i))) others.push([i, j, dist(rooms[i], rooms[j])]);
    others.sort((a, b) => a[2] - b[2]);
    for (const e of others.slice(0, extra)) if (e[2] < (W + H) / 2.2) edges.push(e);
    // Carve floors: rooms, then corridors (L-shaped, one wide).
    const FLOOR = 1, CORR = 2;
    const cell = makeGrid(W, H, 0);
    for (const rm of rooms) for (let r = rm.r0; r <= rm.r1; r++) for (let c = rm.c0; c <= rm.c1; c++) cell[r][c] = FLOOR;
    const roomAt = (r, c) => rooms.find(rm => r >= rm.r0 && r <= rm.r1 && c >= rm.c0 && c <= rm.c1);
    const carve = (r, c) => { if (r > 0 && c > 0 && r < H - 1 && c < W - 1 && !cell[r][c]) cell[r][c] = CORR; };
    const adj = rooms.map(() => new Set());
    for (const [i, j] of edges) {
      adj[i].add(j); adj[j].add(i);
      let [r, c] = ctr(rooms[i]); const [r2, c2] = ctr(rooms[j]);
      const hFirst = R.next() < .5;
      const stepC = () => { while (c !== c2) { c += Math.sign(c2 - c); carve(r, c); } };
      const stepR = () => { while (r !== r2) { r += Math.sign(r2 - r); carve(r, c); } };
      if (hFirst) { stepC(); stepR(); } else { stepR(); stepC(); }
    }
    // Doorways: corridor cells touching a room's interior edge.
    const doorsOf = rooms.map(() => []);
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (cell[r][c] === CORR) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rm = roomAt(r + dr, c + dc); if (rm) doorsOf[rooms.indexOf(rm)].push([r + dr, c + dc]); }
    }
    // Room purposes: entrance = nearest the south edge; graph distance from it
    // decides the rest.
    const entrance = rooms.reduce((b, rm, i) => (rm.r1 > rooms[b].r1 ? i : b), 0);
    const depth = rooms.map(() => Infinity); depth[entrance] = 0;
    const q = [entrance];
    while (q.length) { const i = q.shift(); for (const j of adj[i]) if (depth[j] === Infinity) { depth[j] = depth[i] + 1; q.push(j); } }
    const order = rooms.map((_, i) => i).filter(i => i !== entrance).sort((a, b) => depth[b] - depth[a] || (rooms[b].r1 - rooms[b].r0) * (rooms[b].c1 - rooms[b].c0) - (rooms[a].r1 - rooms[a].r0) * (rooms[a].c1 - rooms[a].c0));
    const kind = rooms.map(() => 'room'); kind[entrance] = 'entrance';
    // Kinds the scenario asked for ("in") come first, so they always exist.
    const want = (opts.want || []).filter(k => ROOM_FURNISH[k] && !['entrance', 'room'].includes(k));
    const boss = opts.boss || (want.includes('throne') ? 'throne' : want.includes('lair') ? 'lair' : (R.next() < .5 ? 'throne' : 'lair'));
    if (order.length) kind[order[0]] = boss;
    const deadEnds = order.slice(1).filter(i => adj[i].size === 1);
    if (deadEnds.length) kind[deadEnds[0]] = 'treasure';
    let pool = R.shuffle(['barracks', 'storage', 'library', 'shrine', 'kitchen', 'prison', 'crypt', 'alchemy', boss === 'throne' ? 'lair' : 'throne']);
    pool = [...new Set([...want.filter(k => k !== boss && k !== 'treasure'), ...pool])];
    if (want.includes('treasure') && !deadEnds.length && order.length > 1) kind[order[order.length - 1]] = 'treasure';
    for (const i of order) if (kind[i] === 'room' && pool.length) kind[i] = pool.shift();
    // Lay it into glyphs: walls wherever bare cells touch floor (8 ways).
    // Solid rock (everything outside the walls) is open sea by default: the
    // dungeon reads as a tabletop set ("outside": "table" keeps the board).
    const g = makeGrid(W, H, opts.outside === 'table' ? '.' : '-');
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (cell[r][c] === CORR) g[r][c] = ':';
      else if (!cell[r][c]) {
        let near = false;
        for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (cell[r + dr]?.[c + dc]) { near = true; break; }
        if (near) g[r][c] = '#';
      }
    }
    // Doors ('+') where a corridor passes through a room's wall: a corridor
    // cell next to the room, with wall on both sides across it.
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (g[r][c] === ':') {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!roomAt(r + dr, c + dc) || roomAt(r, c)) continue;
        const sides = dr ? [g[r][c - 1], g[r][c + 1]] : [g[r - 1][c], g[r + 1][c]];
        const nextToDoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => g[r + a][c + b] === '+');
        if (sides.every(x => x === '#') && !nextToDoor) { g[r][c] = '+'; break; }
      }
    }
    rooms.forEach((rm, i) => furnish(g, R, rm, ROOM_FURNISH[kind[i]] || ROOM_FURNISH.room, doorsOf[i]));
    const at = toBoard(W, H);
    const count = {};
    const places = rooms.map((rm, i) => {
      const k = kind[i]; count[k] = (count[k] || 0) + 1;
      const [cr, cc] = ctr(rm);
      return { id: count[k] > 1 || k === 'room' ? `${k} ${count[k]}` : k, kind: k, r0: rm.r0, c0: rm.c0, r1: rm.r1, c1: rm.c1, center: at(cr, cc), depth: depth[i] };
    });
    // A light in every room (night-lit dungeon), warmer for fires; in a dark
    // dungeon (darkness.js) crypts, prisons, storerooms, lairs and plain rooms
    // are unlit (a torch shows them), and a standing torch waits at the entrance.
    const UNLIT = new Set(['crypt', 'prison', 'storage', 'lair', 'room']);
    const lit = opts.dark ? places.filter(p => !UNLIT.has(p.kind)) : places;
    const objects = lit.map(p => ({ type: 'light', x: p.center[0], z: p.center[1], y: 1.6, intensity: p.kind === 'lair' ? 1.5 : 2.2, range: 5.5, color: p.kind === 'shrine' || p.kind === 'alchemy' ? '#b9a6ff' : '#ffc98a' }));
    const ent = places.find(p => p.kind === 'entrance');
    if (opts.dark && ent) {
      // on the floor farthest from the middle (the player starts there), clear of the doors
      const i = kind.indexOf('entrance'), rm = rooms[i], [cr, cc] = ctr(rm);
      let spot = null, best = -1;
      for (let r = rm.r0; r <= rm.r1; r++) for (let c = rm.c0; c <= rm.c1; c++) {
        if (g[r][c] !== ROOM_FURNISH.entrance.floor || doorsOf[i].some(([dr, dc]) => Math.abs(dr - r) + Math.abs(dc - c) <= 1)) continue;
        const d = Math.abs(r - cr) + Math.abs(c - cc); if (d > best) { best = d; spot = [r, c]; }
      }
      if (spot) { const [tx, tz] = at(...spot); objects.push({ type: 'torch', x: tx, z: tz }); }
    }
    return finish({ kind: 'dungeon', W, H, g, places, objects, start: ent, lighting: 'night', dark: !!opts.dark });
  }

  // ---------------------------------------------------------------- village
  function village(opts) {
    const R = rng(opts.seed);
    const W = clampSize(opts.size?.[0] ?? 35, 17, 63), H = clampSize(opts.size?.[1] ?? 27, 15, 63);
    const g = makeGrid(W, H, ',');
    const midR = Math.floor(H / 2) + R.int(-1, 1), midC = Math.floor(W / 2) + R.int(-2, 2);
    // Roads: a dirt east-west road and a north-south one, two wide.
    for (let c = 0; c < W; c++) { g[midR][c] = ':'; g[midR + 1][c] = ':'; }
    for (let r = 0; r < H; r++) { g[r][midC] = ':'; g[r][midC + 1] = ':'; }
    // The square: flagstone around the crossing, a campfire, a signpost.
    const sq = { r0: midR - 2, c0: midC - 2, r1: midR + 3, c1: midC + 3 };
    for (let r = sq.r0; r <= sq.r1; r++) for (let c = sq.c0; c <= sq.c1; c++) g[r][c] = 'U';
    g[sq.r0][sq.c0] = 'j'; g[sq.r1][sq.c1] = 'j'; g[sq.r0 + 1][sq.c1 - 1] = 'I'; g[sq.r1][sq.c0] = 'G'; g[sq.r0][sq.c1] = 'O';
    const taken = makeGrid(W, H, false);
    const mark = (r0, c0, r1, c1) => { for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) taken[r][c] = true; };
    mark(midR - 1, 0, midR + 2, W - 1); mark(0, midC - 1, H - 1, midC + 2); mark(sq.r0 - 1, sq.c0 - 1, sq.r1 + 1, sq.c1 + 1);
    const free = (r0, c0, r1, c1) => { if (r0 < 1 || c0 < 1 || r1 > H - 2 || c1 > W - 2) return false; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (taken[r][c]) return false; return true; };
    // Buildings: the important ones first, each facing a road.
    const wanted = Math.max(3, Math.min(14, +opts.buildings || Math.round(W * H / 110)));
    const want = (opts.want || []).filter(k => BUILDING_FURNISH[k] && k !== 'house');
    const kinds = [...new Set([...want, ...['tavern', 'smithy', 'shop', 'temple', 'alchemist', 'guardhouse', 'library', 'stable'].slice(0, Math.max(3, Math.round(wanted * .6)))])];
    while (kinds.length < wanted) kinds.push('house');
    const places = [];
    for (const k of kinds) {
      const spec = BUILDING_FURNISH[k];
      let done = false;
      for (let tries = 0; tries < 240 && !done; tries++) {
        // outer size, walls included; later tries shrink it to fit
        const shrink = tries < 120 ? 0 : tries < 180 ? 1 : 2;
        const w = Math.max(5, spec.size[0] - shrink + (shrink ? 0 : R.int(0, 1))), h = Math.max(5, spec.size[1] - shrink + (shrink ? 0 : R.int(0, 1)));
        // Front onto one of the four road sides.
        const side = R.pick(['n', 's', 'e', 'w']);
        let r0, c0, door;
        if (side === 'n') { r0 = midR - 1 - h; c0 = R.int(1, W - 1 - w); door = [r0 + h - 1, c0 + Math.floor(w / 2)]; }
        else if (side === 's') { r0 = midR + 3; c0 = R.int(1, W - 1 - w); door = [r0, c0 + Math.floor(w / 2)]; }
        else if (side === 'w') { c0 = midC - 1 - w; r0 = R.int(1, H - 1 - h); door = [r0 + Math.floor(h / 2), c0 + w - 1]; }
        else { c0 = midC + 3; r0 = R.int(1, H - 1 - h); door = [r0 + Math.floor(h / 2), c0]; }
        // Not too far from the road: within a cell or two.
        const r1 = r0 + h - 1, c1 = c0 + w - 1;
        if (!free(r0, c0, r1, c1)) continue;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = (r === r0 || r === r1 || c === c0 || c === c1) ? '#' : spec.floor;
        g[door[0]][door[1]] = '+';
        // a path from the door to the road
        const [dr, dc] = side === 'n' ? [1, 0] : side === 's' ? [-1, 0] : side === 'w' ? [0, 1] : [0, -1];
        for (let r = door[0] + dr, c = door[1] + dc; r > 0 && c > 0 && r < H - 1 && c < W - 1 && g[r][c] === ','; r += dr, c += dc) g[r][c] = ':';
        const inner = { r0: r0 + 1, c0: c0 + 1, r1: r1 - 1, c1: c1 - 1 };
        furnish(g, R, inner, spec, [door]);
        mark(r0 - 1, c0 - 1, r1 + 1, c1 + 1);
        places.push({ kind: k, ...inner, door });
        done = true;
      }
    }
    // Pond, garden, trees, flowers in what is left.
    const placeBlob = (h, w, fn) => { for (let tries = 0; tries < 80; tries++) { const r0 = R.int(1, H - 1 - h), c0 = R.int(1, W - 1 - w); if (free(r0, c0, r0 + h - 1, c0 + w - 1)) { fn(r0, c0); mark(r0 - 1, c0 - 1, r0 + h, c0 + w); return [r0, c0]; } } return null; };
    const pond = placeBlob(3, 4, (r0, c0) => { for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 4; c++) if (!((r === r0 || r === r0 + 2) && (c === c0 || c === c0 + 3))) g[r][c] = '~'; g[r0 + 1][c0 + 1] = 'y'; });
    const garden = placeBlob(4, 5, (r0, c0) => { for (let r = r0; r < r0 + 4; r++) for (let c = c0; c < c0 + 5; c++) g[r][c] = (r === r0 || r === r0 + 3) ? 'f' : (c === c0 || c === c0 + 4 ? ',' : (R.next() < .35 ? 'g' : '*')); });
    // Trees, flowers and boulders on open grass (not against walls or paths).
    const open = (r, c) => g[r][c] === ',' && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].every(([dr, dc]) => [',', '%', '*', 'r'].includes(g[r + dr]?.[c + dc] ?? ','));
    for (let i = 0, n = Math.round(W * H / 30), tries = 0; i < n && tries < 2000; tries++) { const r = R.int(1, H - 2), c = R.int(1, W - 2); if (open(r, c)) { g[r][c] = R.next() < .72 ? '%' : (R.next() < .6 ? '*' : 'r'); i++; } }
    // Yard things: carts, woodpiles, a training yard by the guardhouse.
    for (let i = 0, n = Math.max(2, Math.round(W * H / 160)), tries = 0; i < n && tries < 1000; tries++) { const r = R.int(1, H - 2), c = R.int(1, W - 2); if (open(r, c)) { g[r][c] = R.pick(['V', 'd', 'd', 'g', 'k', 'J']); i++; } }
    const at = toBoard(W, H), count = {};
    const named = places.map(p => {
      count[p.kind] = (count[p.kind] || 0) + 1;
      return { ...p, id: p.kind === 'house' ? `house ${count[p.kind]}` : p.kind, center: at(Math.floor((p.r0 + p.r1) / 2), Math.floor((p.c0 + p.c1) / 2)) };
    });
    named.push({ id: 'square', kind: 'square', ...sq, center: at(midR, midC) });
    if (pond) named.push({ id: 'pond', kind: 'pond', r0: pond[0], c0: pond[1], r1: pond[0] + 2, c1: pond[1] + 3, center: at(pond[0] + 1, pond[1] + 2), outdoor: true });
    if (garden) named.push({ id: 'garden', kind: 'garden', r0: garden[0] + 1, c0: garden[1] + 1, r1: garden[0] + 2, c1: garden[1] + 3, center: at(garden[0] + 1, garden[1] + 2) });
    const objects = named.filter(p => !['square', 'pond', 'garden'].includes(p.kind)).map(p => ({ type: 'light', x: p.center[0], z: p.center[1], y: 1.5, intensity: 1.6, range: 4.5, color: '#ffd29a' }));
    return finish({ kind: 'village', W, H, g, places: named, objects, start: named.find(p => p.kind === 'square'), lighting: 'bright' });
  }

  // Everything walkable must be reachable from the start: furniture that cuts
  // a corridor or doorway off is cleared (cheapest path through furniture).
  const HARD = new Set(['#', '.', '~', '&', '-', 'y', '%']);
  function ensureConnected(g, start) {
    const H = g.length, W = g[0].length, key = (r, c) => r * W + c;
    const walk = (r, c) => FLOOR_GLYPHS.has(g[r][c]) || g[r][c] === '+';
    for (let round = 0; round < 60; round++) {
      // 0-1 BFS: floor costs 0, furniture costs 1, walls are impassable.
      const cost = new Map([[key(...start), 0]]), prev = new Map(), dq = [start];
      while (dq.length) {
        const [r, c] = dq.shift(), k0 = cost.get(key(r, c));
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= H || nc >= W || HARD.has(g[nr][nc])) continue;
          const k = k0 + (walk(nr, nc) ? 0 : 1);
          if (k < (cost.get(key(nr, nc)) ?? Infinity)) { cost.set(key(nr, nc), k); prev.set(key(nr, nc), [r, c]); walk(nr, nc) ? dq.unshift([nr, nc]) : dq.push([nr, nc]); }
        }
      }
      let worst = null;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (walk(r, c) && (cost.get(key(r, c)) ?? 0) > 0) { worst = [r, c]; break; }
      if (!worst) return;
      // clear the furniture on the cheapest path to it
      for (let cur = worst; cur && !(cur[0] === start[0] && cur[1] === start[1]); cur = prev.get(key(...cur))) {
        const [r, c] = cur;
        if (!walk(r, c)) { const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => g[r + dr]?.[c + dc]).find(x => FLOOR_GLYPHS.has(x)); g[r][c] = nb || '^'; }
      }
    }
  }

  function finish({ kind, W, H, g, places, objects, start, lighting, dark = false }) {
    const at = toBoard(W, H);
    const sp = places.find(p => p.id === start?.id) || places[0];
    if (sp) { let s0 = null; for (let r = sp.r0; r <= sp.r1 && !s0; r++) for (let c = sp.c0; c <= sp.c1; c++) if (FLOOR_GLYPHS.has(g[r][c])) { s0 = [r, c]; break; } if (s0) ensureConnected(g, s0); }
    // Board-space bounds for each place (x runs east-negative: c0 is max x).
    for (const p of places) {
      const [xa, za] = at(p.r0, p.c0), [xb, zb] = at(p.r1, p.c1);
      Object.assign(p, { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) });
    }
    return { kind, size: [W, H], grid: g.map(row => row.join('')), legend: { ...GEN_LEGEND }, objects, places, start: start?.id || null, lighting, dark };
  }

  // Which place suits a character: words in its id/style/personality.
  const ROLE_PLACES = [
    [/\b(king|queen|lord|lady|boss|warlord|chief|chieftain|emperor|sorcer|necromancer|lich|overlord|dragon|tyrant|throne)/i, ['throne', 'lair', 'temple', 'square']],
    [/\b(goblin|orc|ogre|troll|kobold|bandit|brute|beast|wolf|rat|spider|monster|minion)/i, ['lair', 'barracks', 'storage', 'room']],
    [/\b(guard|soldier|knight|sentry|captain|warden|watch)/i, ['barracks', 'guardhouse', 'entrance', 'prison', 'square']],
    [/\b(prisoner|captive|hostage|chained|jailed)/i, ['prison', 'storage', 'room']],
    [/\b(priest|priestess|monk|nun|cleric|oracle|acolyte|shaman|druid)/i, ['shrine', 'temple', 'crypt']],
    [/\b(wizard|mage|witch|warlock|alchemist|scholar|sage|librarian|scribe)/i, ['library', 'alchemy', 'alchemist', 'shrine']],
    [/\b(ghost|skeleton|zombie|undead|wraith|mummy|vampire)/i, ['crypt', 'shrine', 'room']],
    [/\b(cook|chef|baker)/i, ['kitchen', 'tavern']],
    [/\b(smith|blacksmith|armou?rer|forge)/i, ['smithy']],
    [/\b(innkeeper|barkeep|bartender|tavern|barmaid|bard|drunk|patron)/i, ['tavern']],
    [/\b(merchant|shopkeeper|trader|peddler|vendor|seller)/i, ['shop', 'square']],
    [/\b(stable|groom|farmer|horse)/i, ['stable', 'garden']],
    [/\b(gardener|herbalist)/i, ['garden', 'alchemist']],
    [/\b(treasure|dragon|hoard|miser)/i, ['treasure']],
    [/\b(child|kid|villager|elder|mayor|townsfolk|widow|fisher)/i, ['house', 'square']],
  ];
  function placeFor(agent, places, used) {
    const text = [agent.id, agent.style, agent.personality, agent.role].filter(Boolean).join(' ');
    const has = k => places.filter(p => p.kind === k || p.id === k);
    for (const [re, kinds] of ROLE_PLACES) if (re.test(text)) for (const k of kinds) { const ps = has(k); if (ps.length) return ps.find(p => !used.has(p.id)) || ps[0]; }
    return places.find(p => !used.has(p.id) && !['entrance', 'square', 'pond'].includes(p.kind)) || places[0];
  }
  // Resolve "in" ("tavern", "house 2", "house" = any house, "room" = any room).
  function findPlace(name, places, used) {
    const n = String(name).toLowerCase().trim();
    const exact = places.find(p => p.id === n);
    if (exact) return exact;
    const ofKind = places.filter(p => p.kind === n || p.id.startsWith(n + ' '));
    if (ofKind.length) return ofKind.find(p => !used.has(p.id)) || ofKind[0];
    return null;
  }

  // Free standing cells in a place, centre first: grid cells that are floor
  // (no object glyph), not taken by another character.
  const FLOOR_GLYPHS = new Set([',', ':', '^', '=', '_', 'R', 'E', 'Q', 'U']);
  function freeCells(gen, p, occupied) {
    const at = toBoard(gen.size[0], gen.size[1]), out = [];
    const cr = (p.r0 + p.r1) / 2, cc = (p.c0 + p.c1) / 2;
    for (let r = p.r0; r <= p.r1; r++) for (let c = p.c0; c <= p.c1; c++) {
      if (!FLOOR_GLYPHS.has(gen.grid[r]?.[c])) continue;
      const [x, z] = at(r, c);
      if (!occupied.has(x + ',' + z)) out.push([x, z, Math.abs(r - cr) + Math.abs(c - cc)]);
    }
    return out.sort((a, b) => a[2] - b[2]).map(([x, z]) => [x, z]);
  }

  // A scenario with "generate": its grid, legend, objects, size and lighting
  // filled from the generator (anything the scenario already sets wins), and
  // every character without "at" put in its place. Returns the new scenario
  // plus `places` and warnings.
  function applyToScenario(scn) {
    const opts = scn.generate || {};
    const kindName = String(opts.kind || opts.type || 'dungeon').toLowerCase();
    // places asked for: "generate": {"places": [...]}, and every "in"
    const want = [...(Array.isArray(opts.places) ? opts.places.map(p => ({ in: p })) : []), ...(Array.isArray(scn.locked) ? scn.locked : []), ...(scn.agents || []), ...(scn.objects || []), scn.player || {}].map(a => a.in).filter(v => v != null).map(v => String(v).toLowerCase().replace(/\s+\d+$/, ''));
    // dungeons are dark (fog of war, unlit rooms) unless the scenario says "dark": false
    const gen = (kindName === 'village' || kindName === 'town' ? village : dungeon)({ ...opts, want, seed: opts.seed ?? scn.seed ?? 1, size: opts.size || scn.size, dark: scn.dark ?? true });
    const warnings = [], used = new Set(), occupied = new Set(), placed = {};
    const agents = (scn.agents || []).map(a => {
      if (Array.isArray(a.at)) { occupied.add(a.at[0] + ',' + a.at[1]); return a; }
      let p = a.in != null ? findPlace(a.in, gen.places, used) : null;
      if (a.in != null && !p) warnings.push(`agent ${a.id}: no place "${a.in}" (places: ${gen.places.map(p => p.id).join(', ')})`);
      p = p || placeFor(a, gen.places, used);
      used.add(p.id);
      const cells = freeCells(gen, p, occupied);
      const spot = cells[0] || p.center;
      occupied.add(spot[0] + ',' + spot[1]); placed[a.id] = p.id;
      return { ...a, at: spot, in: p.id };
    });
    // Objects with "in" (and no x/z) go to a free cell of that place.
    const objects = (scn.objects || []).map(o => {
      if (o.in == null || (Number.isFinite(+o.x) && Number.isFinite(+o.z) && o.x !== '' && o.z !== '')) return o;
      const p = findPlace(o.in, gen.places, new Set());
      if (!p) { warnings.push(`object ${o.type}: no place "${o.in}"`); return null; }
      const spot = freeCells(gen, p, occupied).reverse()[0] || p.center;
      occupied.add(spot[0] + ',' + spot[1]);
      return { ...o, x: spot[0], z: spot[1] };
    }).filter(Boolean);
    let player = scn.player || {};
    if (!Array.isArray(player.at)) {
      const p = (player.in != null && findPlace(player.in, gen.places, new Set())) || gen.places.find(q => q.id === gen.start) || gen.places[0];
      const spot = freeCells(gen, p, occupied)[0] || p.center;
      player = { ...player, at: spot, facing: player.facing || 'n' };
    }
    return {
      scenario: { ...scn, grid: scn.grid?.length ? scn.grid : gen.grid, legend: { ...gen.legend, ...(scn.legend || {}) }, size: scn.size || gen.size,
        objects: [...gen.objects, ...objects], agents, player, lighting: scn.lighting ?? gen.lighting, dark: scn.dark ?? gen.dark, walls: scn.walls ?? 'stone', wallHeight: scn.wallHeight ?? 2, base: scn.base ?? 'plain' },
      places: gen.places.map(p => ({ id: p.id, kind: p.kind, center: p.center, x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, who: agents.filter(a => placed[a.id] === p.id).map(a => a.id) })),
      warnings,
    };
  }

  // Buildings to go into (scenario.js expandBuildings): a house, timber house
  // or stable placed as one thing becomes walls round a floor, the door in the
  // middle of its front (+z at ry 0), "inside" its furniture (rows from the
  // back wall; WALK_IN_THINGS). size: [across, deep] with the walls.
  const WALK_IN = {
    house: { name: 'house', size: [5, 5], floor: 'wood', inside: ['Z.K', '.t.', '(..'] },
    fantasy_house: { name: 'timber house', size: [6, 5], floor: 'oak', inside: ['Z)K(', 'z.t.', '....'] },
    stable: { name: 'stable', size: [7, 5], floor: 'dirt', inside: ['dfBfu', '.....', '|...C'] },
  };
  const WALK_IN_THINGS = { Z: 'bed', K: 'bookcase', t: 'table', ')': 'nightstand', '(': 'cabinet', z: 'wooden_chair', B: 'barrel', u: 'bucket', f: 'fence', d: 'logs', '|': 'apple_barrel', C: 'crate' };
  // its squares: cell(i, j) for i across (0..size[0]-1), j from the back
  // (0..size[1]-1); the door at door = [i, j]; turned by ry in quarter turns
  function walkInFootprint(b) {
    const spec = WALK_IN[b.type], q = ((Math.round((+b.ry || 0) / (Math.PI / 2)) % 4) + 4) % 4;
    const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][q], a = [f[1], -f[0]];   // front, and across
    const [Wd, D] = spec.size, bx = Math.round(+b.x), bz = Math.round(+b.z), mi = Math.floor((Wd - 1) / 2), mj = Math.floor((D - 1) / 2);
    const cell = (i, j) => [bx + a[0] * (i - mi) + f[0] * (j - mj), bz + a[1] * (i - mi) + f[1] * (j - mj)];
    return { spec, Wd, D, cell, door: [mi, D - 1] };
  }

  const api = { dungeon, village, applyToScenario, WALK_IN, WALK_IN_THINGS, walkInFootprint, ROOM_KINDS: Object.keys(ROOM_FURNISH), BUILDING_KINDS: Object.keys(BUILDING_FURNISH) };
  globalThis.TablefolkProcgen = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
