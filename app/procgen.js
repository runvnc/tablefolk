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

  // ------------------------------------------------- outdoor helpers (2026-11-13)
  // Things placed as objects (pack types: the Quaternius village, farm and
  // nature sets) rather than grid glyphs. A building takes an odd square of
  // cells (span) so its middle is a cell; ry turns its front (+z, south) to face.
  function placer(W, H, R) {
    const at = toBoard(W, H), taken = makeGrid(W, H, false), objects = [];
    const mark = (r0, c0, r1, c1) => { for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) taken[r][c] = true; };
    const free = (r0, c0, r1, c1, g, ok = [',']) => {
      if (r0 < 1 || c0 < 1 || r1 > H - 2 || c1 > W - 2) return false;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (taken[r][c] || (g && !ok.includes(g[r][c]))) return false;
      return true;
    };
    // facing: 'n' | 's' | 'e' | 'w' (the side its front looks to)
    const RY = { s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
    const put = (type, r, c, facing, extra = {}) => { const [x, z] = at(r, c); objects.push({ type, x, z, ...(facing ? { ry: +RY[facing].toFixed(4) } : {}), ...extra }); };
    // a building or other big thing in a free span x span square near (r, c)
    const building = (type, span, g, r, c, facing, tries = 40) => {
      const h = Math.floor(span / 2);
      for (let t = 0; t < tries; t++) {
        const rr = r + (t ? R.int(-3, 3) : 0), cc = c + (t ? R.int(-3, 3) : 0);
        if (!free(rr - h, cc - h, rr + h, cc + h, g)) continue;
        put(type, rr, cc, facing); mark(rr - h - 1, cc - h - 1, rr + h + 1, cc + h + 1);
        return [rr, cc];
      }
      return null;
    };
    return { at, taken, objects, mark, free, put, building };
  }
  // trees and growth on open grass, objects in single cells, never touching a
  // path, wall or each other's cell
  function scatter(g, P, R, n, kinds, ok = [',']) {
    const H = g.length, W = g[0].length;
    for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
      const r = R.int(1, H - 2), c = R.int(1, W - 2);
      if (!ok.includes(g[r][c]) || P.taken[r][c]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => ![',', ...ok].includes(g[r + dr]?.[c + dc]))) continue;
      const type = typeof kinds === 'function' ? kinds() : R.pick(kinds);
      P.put(type, r, c, null, { ry: +(R.next() * 6.283).toFixed(3) }); P.taken[r][c] = true; i++;
    }
  }
  // a rectangle of floor (a clearing or a yard) with a dirt trail to the path
  function clearing(g, R, P, h, w, floor, near, pathGlyph = ':') {
    const H = g.length, W = g[0].length;
    for (let t = 0; t < 120; t++) {
      const r0 = R.int(2, H - 2 - h), c0 = R.int(2, W - 2 - w);
      if (near && Math.abs(r0 + h / 2 - near[0]) + Math.abs(c0 + w / 2 - near[1]) > near[2]) continue;
      if (!P.free(r0 - 1, c0 - 1, r0 + h, c0 + w, g, [',', '%'])) continue;
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) g[r][c] = floor;
      P.mark(r0 - 1, c0 - 1, r0 + h, c0 + w);
      return { r0, c0, r1: r0 + h - 1, c1: c0 + w - 1 };
    }
    return null;
  }
  // an L-shaped trail from a place's middle to the nearest path cell
  function trail(g, p, isPath, glyph = ':') {
    const H = g.length, W = g[0].length, mr = Math.floor((p.r0 + p.r1) / 2), mc = Math.floor((p.c0 + p.c1) / 2);
    let best = null;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (isPath(g[r][c]) && !(r >= p.r0 && r <= p.r1 && c >= p.c0 && c <= p.c1)) { const d = Math.abs(r - mr) + Math.abs(c - mc); if (!best || d < best[2]) best = [r, c, d]; }
    if (!best) return;
    const lay = (r, c) => { if (g[r][c] === ',' || g[r][c] === '%') g[r][c] = glyph; };
    for (let r = mr; r !== best[0]; r += Math.sign(best[0] - mr)) lay(r, mc);
    for (let c = mc; c !== best[1]; c += Math.sign(best[1] - mc)) lay(best[0], c);
  }
  // a small walled building (walls, floor, a door on one side) furnished like the village's
  function hut(g, R, P, r0, c0, w, h, spec, side) {
    const r1 = r0 + h - 1, c1 = c0 + w - 1;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = (r === r0 || r === r1 || c === c0 || c === c1) ? '#' : spec.floor;
    const door = side === 's' ? [r1, c0 + (w >> 1)] : side === 'n' ? [r0, c0 + (w >> 1)] : side === 'e' ? [r0 + (h >> 1), c1] : [r0 + (h >> 1), c0];
    g[door[0]][door[1]] = '+';
    const inner = { r0: r0 + 1, c0: c0 + 1, r1: r1 - 1, c1: c1 - 1 };
    furnish(g, R, inner, spec, [door]);
    P.mark(r0 - 1, c0 - 1, r1 + 1, c1 + 1);
    // the door opens onto a step of dirt
    const out = side === 's' ? [door[0] + 1, door[1]] : side === 'n' ? [door[0] - 1, door[1]] : side === 'e' ? [door[0], door[1] + 1] : [door[0], door[1] - 1];
    if (g[out[0]]?.[out[1]] === ',') g[out[0]][out[1]] = ':';
    return { ...inner, door };
  }
  const named = (W, H, places) => { const at = toBoard(W, H), count = {}; return places.map(p => { count[p.kind] = (count[p.kind] || 0) + 1; const n = places.filter(q => q.kind === p.kind).length; return { ...p, id: p.id || (n > 1 ? `${p.kind} ${count[p.kind]}` : p.kind), center: at(Math.floor((p.r0 + p.r1) / 2), Math.floor((p.c0 + p.c1) / 2)) }; }); };

  // ---------------------------------------------------------------- forest
  // Wild country: a winding path across, trees thick on both sides, and
  // clearings along it: the clearing where you start, a camp, ruins, a grove,
  // a shrine, a pond, a woodcutter's hut, a cave mouth. "style": "spooky"
  // (dead trees, dusk), "autumn", "pine".
  function forest(opts) {
    const R = rng(opts.seed);
    const W = clampSize(opts.size?.[0] ?? 37, 19, 63), H = clampSize(opts.size?.[1] ?? 29, 15, 63);
    const g = makeGrid(W, H, ','), P = placer(W, H, R), style = String(opts.style || '').toLowerCase();
    // the path: from the south edge to the north, wandering a little
    let c = Math.floor(W / 2) + R.int(-3, 3);
    for (let r = H - 1; r >= 0; r--) { g[r][c] = ':'; if (R.next() < .5) g[r][c + 1 < W - 1 ? c + 1 : c - 1] = ':'; if (R.next() < .3) { const nc = Math.max(3, Math.min(W - 4, c + R.pick([-1, 1]))); g[r][nc] = ':'; c = nc; } }
    for (let r = 0; r < H; r++) for (let cc = 0; cc < W; cc++) if (g[r][cc] === ':') P.taken[r][cc] = true;
    const want = (opts.want || []).filter(k => ['camp', 'ruins', 'grove', 'shrine', 'pond', 'hut', 'cave', 'clearing', 'meadow'].includes(k));
    const kinds = [...new Set(['clearing', ...want, ...R.shuffle(['camp', 'ruins', 'grove', 'shrine', 'pond', 'hut', 'cave', 'meadow']).slice(0, Math.max(3, Math.round(W * H / 220)))])];
    const places = [];
    for (const k of kinds) {
      const size = { clearing: [5, 7], camp: [5, 6], ruins: [7, 7], grove: [5, 5], shrine: [5, 5], pond: [4, 5], hut: [7, 7], cave: [5, 7], meadow: [6, 8] }[k];
      // the start clearing sits by the path near the south edge
      const near = k === 'clearing' ? [H - 5, Math.floor(W / 2), 9] : null;
      const p = clearing(g, R, P, size[0], size[1], k === 'pond' ? ',' : k === 'ruins' || k === 'shrine' ? '^' : k === 'cave' ? ':' : ',', near);
      if (!p) continue;
      const mr = Math.floor((p.r0 + p.r1) / 2), mc = Math.floor((p.c0 + p.c1) / 2);
      if (k === 'camp') { g[mr][mc] = 'X'; P.put('tent', p.r0, p.c0 + 1, 's'); P.put('tent', p.r0, p.c1 - 1, 's'); g[p.r1][p.c0] = 'd'; P.put('log', mr + 1, mc + 2, null, { ry: 1.2 }); P.put('backpack', mr - 1, mc - 2); }
      if (k === 'ruins') {
        // broken walls: a square with gaps, rubble, a statue in the middle
        for (let r = p.r0; r <= p.r1; r++) for (let cc = p.c0; cc <= p.c1; cc++) if ((r === p.r0 || r === p.r1 || cc === p.c0 || cc === p.c1) && R.next() < .55 && !(cc === mc || r === mr)) g[r][cc] = '#';
        P.put('statue', mr, mc, 's'); g[p.r0 + 1][p.c0 + 1] = 'r'; P.put('skull', p.r1 - 1, p.c1 - 1); if (R.next() < .6) g[p.r1 - 1][p.c0 + 1] = 'h';
      }
      if (k === 'grove') { for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) P.put('autumn_tree', mr + dr, mc + dc, null, { ry: R.next() * 6 }); P.put('mushroom_cluster', mr, mc - 1); P.put('flower_patch', mr + 1, mc + 1); }
      if (k === 'shrine') { P.put('statue', p.r0 + 1, mc, 's'); g[p.r0 + 1][mc - 2] = 'i'; g[p.r0 + 1][mc + 2] = 'i'; g[mr + 1][mc - 1] = '*'; g[mr + 1][mc + 1] = '*'; }
      if (k === 'pond') { for (let r = p.r0; r <= p.r1; r++) for (let cc = p.c0; cc <= p.c1; cc++) if (!((r === p.r0 || r === p.r1) && (cc === p.c0 || cc === p.c1))) g[r][cc] = '~'; g[mr][mc] = 'y'; P.put('tall_grass', p.r0 - 1, p.c0); P.put('tall_grass', p.r1 + 1, p.c1); }
      if (k === 'meadow') { for (let i = 0; i < 6; i++) { const r = R.int(p.r0, p.r1), cc = R.int(p.c0, p.c1); if (g[r][cc] === ',') P.put(R.pick(['flower_patch', 'heather', 'tall_grass']), r, cc); } }
      if (k === 'cave') {
        // a cave mouth: a dark floor in a ring of rocks, crystals in the back
        for (let cc = p.c0; cc <= p.c1; cc++) { P.put(cc % 2 ? 'mossy_rock' : 'boulder', p.r0, cc, null, { ry: R.next() * 6 }); }
        for (let r = p.r0 + 1; r <= p.r1 - 2; r++) { P.put('mossy_rock', r, p.c0, null, { ry: R.next() * 6 }); P.put('mossy_rock', r, p.c1, null, { ry: R.next() * 6 }); }
        P.put('crystals', p.r0 + 1, mc); g[p.r0 + 1][mc - 1] = '^'; g[p.r0 + 1][mc + 1] = '^';
      }
      let hutPlace = null;
      if (k === 'hut') hutPlace = hut(g, R, P, p.r0, p.c0, 6, 6, BUILDING_FURNISH.house, R.pick(['s', 'e', 'w']));
      if (k !== 'pond') trail(g, hutPlace ? { r0: hutPlace.door[0], c0: hutPlace.door[1], r1: hutPlace.door[0], c1: hutPlace.door[1] } : p, v => v === ':');
      places.push({ kind: k, ...(hutPlace || p), outdoor: k !== 'hut' });
    }
    // the woods: thick on open grass; a few bushes, ferns, rocks, flowers
    const trees = style === 'spooky' ? ['dead_tree', 'dead_tree', 'dead_tree', 'pine_tree', 'tall_pine'] : style === 'autumn' ? ['autumn_tree', 'autumn_tree', 'oak_tree', 'tall_tree', 'pine_tree'] : style === 'pine' ? ['pine_tree', 'tall_pine', 'pine_tree', 'tall_pine', 'dead_tree'] : ['pine_tree', 'tall_pine', 'oak_tree', 'tall_tree', 'pine_tree', 'oak_tree', 'autumn_tree'];
    scatter(g, P, R, Math.round(W * H / 6), trees);
    scatter(g, P, R, Math.round(W * H / 28), style === 'spooky' ? ['mushroom_cluster', 'boulder', 'fern', 'skull', 'shelf_fungus'] : ['fern', 'red_bush', 'flower_bush', 'mossy_rock', 'mushroom_cluster', 'tall_grass', 'flower_patch', 'heather', 'shelf_fungus']);
    const pl = named(W, H, places);
    const objects = [...P.objects, ...pl.filter(p => p.kind === 'camp' || p.kind === 'shrine').map(p => ({ type: 'light', x: p.center[0], z: p.center[1], y: 1.4, intensity: 1.6, range: 5, color: '#ffc98a' }))];
    return finish({ kind: 'forest', W, H, g, places: pl, objects, start: pl.find(p => p.kind === 'clearing') || pl[0], lighting: style === 'spooky' ? 'night' : 'bright', dark: false });
  }

  // ---------------------------------------------------------------- farm
  // A farmstead: a lane across, the farmhouse (walk in), a barn, a silo and a
  // coop as buildings, a fenced pasture (for the animals), fields of crops,
  // a yard with hay, a cart and a well, an orchard; woods around the edge.
  function farm(opts) {
    const R = rng(opts.seed);
    const W = clampSize(opts.size?.[0] ?? 35, 21, 63), H = clampSize(opts.size?.[1] ?? 27, 17, 63);
    const g = makeGrid(W, H, ','), P = placer(W, H, R);
    const lane = Math.floor(H / 2) + R.int(-1, 1);
    for (let c = 0; c < W; c++) { g[lane][c] = ':'; P.taken[lane][c] = true; }
    const places = [];
    // the yard by the lane, the farmhouse north of it
    const mc = Math.floor(W / 2) + R.int(-3, 3);
    const yard = { r0: lane + 2, c0: mc - 3, r1: lane + 5, c1: mc + 3 };
    for (let r = yard.r0; r <= yard.r1; r++) for (let c = yard.c0; c <= yard.c1; c++) g[r][c] = ':';
    P.mark(yard.r0, yard.c0, yard.r1, yard.c1);
    g[yard.r1][yard.c0] = 'G'; g[yard.r0][yard.c1] = 'V'; P.put('hay', yard.r1, yard.c1); P.put('sacks', yard.r1, yard.c1 - 1);
    places.push({ kind: 'yard', ...yard, outdoor: true });
    const house = hut(g, R, P, lane - 7, mc - 3, 7, 6, BUILDING_FURNISH.house, 's');
    for (let r = house.door[0] + 1; r < lane; r++) g[r][house.door[1]] = ':';
    places.push({ kind: 'farmhouse', ...house });
    // the barn and the outbuildings: objects on the grass, fronts to the lane
    const bigBarn = R.pick(['barn', 'big_barn', 'silo_barn']);
    const barn = P.building(bigBarn, 5, g, lane - 4, mc + 9, 's') || P.building(bigBarn, 5, g, lane + 5, mc - 9, 'n');
    if (barn) places.push({ kind: 'barn', r0: barn[0] + 3, c0: barn[1] - 1, r1: barn[0] + 3, c1: barn[1] + 1, outdoor: true });
    P.building('silo', 3, g, lane - 4, mc + 14, 's');
    const coop = P.building('chicken_coop', 3, g, lane + 4, mc + 7, 'n');
    if (coop) places.push({ kind: 'coop', r0: coop[0] - 2, c0: coop[1] - 1, r1: coop[0] - 2, c1: coop[1] + 1, outdoor: true });
    if (R.next() < .7) P.building(R.pick(['stone_windmill', 'windmill']), 5, g, lane - 5, mc - 12, 's');
    P.building(R.pick(['open_barn', 'small_barn']), 5, g, lane + 6, mc - 10, 'n');
    // the pasture: a fence round grass (fence glyphs), a gate to the lane
    const pas = clearing(g, R, P, 6, 9, ',', [lane + 7, mc + 8, 12]) || clearing(g, R, P, 6, 8, ',', null);
    if (pas) {
      for (let r = pas.r0 - 1; r <= pas.r1 + 1; r++) for (let c = pas.c0 - 1; c <= pas.c1 + 1; c++) if (r === pas.r0 - 1 || r === pas.r1 + 1 || c === pas.c0 - 1 || c === pas.c1 + 1) g[r][c] = 'f';
      const gate = [pas.r0 - 1, Math.floor((pas.c0 + pas.c1) / 2)]; g[gate[0]][gate[1]] = ':';
      trail(g, { r0: gate[0], c0: gate[1], r1: gate[0], c1: gate[1] }, v => v === ':');
      P.put('hay', pas.r1, pas.c1); places.push({ kind: 'pasture', ...pas, outdoor: true });
    }
    // fields: rows of crops and furrows
    for (let i = 0; i < 2; i++) {
      const f = clearing(g, R, P, 5, 7, ':', null);
      if (!f) continue;
      for (let r = f.r0; r <= f.r1; r++) for (let c = f.c0; c <= f.c1; c++) if ((r - f.r0) % 2 === 0) g[r][c] = R.next() < .55 ? 'g' : ':';
      trail(g, f, v => v === ':'); places.push({ kind: 'field', ...f, outdoor: true });
    }
    // an orchard of oaks
    const orch = clearing(g, R, P, 5, 5, ',', null);
    if (orch) { for (let r = orch.r0; r <= orch.r1; r += 2) for (let c = orch.c0; c <= orch.c1; c += 2) P.put('oak_tree', r, c, null, { ry: R.next() * 6 }); places.push({ kind: 'orchard', ...orch, outdoor: true }); }
    scatter(g, P, R, Math.round(W * H / 26), ['pine_tree', 'oak_tree', 'tall_tree', 'pine_tree', 'flower_bush', 'red_bush', 'fern']);
    scatter(g, P, R, Math.round(W * H / 60), ['flower_patch', 'tall_grass', 'heather', 'fence_section']);
    const pl = named(W, H, places);
    const objects = [...P.objects, ...pl.filter(p => p.kind === 'farmhouse').map(p => ({ type: 'light', x: p.center[0], z: p.center[1], y: 1.5, intensity: 1.6, range: 4.5, color: '#ffd29a' }))];
    return finish({ kind: 'farm', W, H, g, places: pl, objects, start: pl.find(p => p.kind === 'yard'), lighting: 'bright', dark: false });
  }

  // ---------------------------------------------------------------- cave
  // Caverns: a cellular-automaton cave (organic walls, one connected system),
  // chambers named by their place in it (the entrance nearest the south edge,
  // the lair furthest), crystals, mushrooms, pools, bones; dark, lit by
  // glowing crystals. "style": "mine" adds a miners' camp with lamps, carts and
  // crates.
  function cave(opts) {
    const R = rng(opts.seed);
    const W = clampSize(opts.size?.[0] ?? 33, 17, 63), H = clampSize(opts.size?.[1] ?? 25, 13, 63);
    const style = String(opts.style || '').toLowerCase();
    let open = makeGrid(W, H, false);
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) open[r][c] = R.next() < .55;
    for (let step = 0; step < 5; step++) {
      const nx = makeGrid(W, H, false);
      for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) {
        let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && open[r + dr][c + dc]) n++;
        nx[r][c] = open[r][c] ? n >= 4 : n >= 5;
      }
      open = nx;
    }
    // keep the largest connected cave
    const seen = makeGrid(W, H, -1), regions = [];
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (open[r][c] && seen[r][c] < 0) {
      const cells = [], q = [[r, c]]; seen[r][c] = regions.length;
      while (q.length) { const [a, b] = q.pop(); cells.push([a, b]); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = a + dr, y = b + dc; if (open[x]?.[y] && seen[x][y] < 0) { seen[x][y] = regions.length; q.push([x, y]); } } }
      regions.push(cells);
    }
    const main = regions.sort((a, b) => b.length - a.length)[0] || [];
    const g = makeGrid(W, H, '.'), P = placer(W, H, R);
    for (const [r, c] of main) g[r][c] = R.next() < .8 ? ':' : '^';
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dr, dc]) => [':', '^'].includes(g[r + dr]?.[c + dc]))) g[r][c] = '#';
    // chambers: the widest spots, spread apart
    const room = ([r, c]) => { let n = 0; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if ([':', '^'].includes(g[r + dr]?.[c + dc])) n++; return n; };
    const spots = R.shuffle(main.filter(p => room(p) >= 19)).sort((a, b) => room(b) - room(a));
    const centres = [];
    for (const s of spots) if (centres.every(t => Math.abs(t[0] - s[0]) + Math.abs(t[1] - s[1]) >= 8)) centres.push(s);
    if (!centres.length && main.length) centres.push(main[0]);
    const target = Math.max(3, Math.min(9, +opts.rooms || Math.round(W * H / 120)));
    const chosen = centres.slice(0, target);
    const entrance = chosen.slice().sort((a, b) => b[0] - a[0])[0];
    const far = p => Math.abs(p[0] - entrance[0]) + Math.abs(p[1] - entrance[1]);
    const rest = chosen.filter(p => p !== entrance).sort((a, b) => far(b) - far(a));
    // places asked for come first ("in" and "generate": {"places": [...]}), then the rest
    const CAVE_KINDS = ['crystals', 'grotto', 'pool', 'treasure', 'bones', 'camp', 'mine', 'chamber'];
    const asked = [...new Set((opts.want || []).filter(k => CAVE_KINDS.includes(k)))];
    const roles = ['lair', ...asked, ...R.shuffle(['crystals', 'grotto', 'pool', 'treasure', 'bones', style === 'mine' ? 'mine' : 'camp', 'chamber', 'chamber']).filter(k => !asked.includes(k))];
    const places = [{ kind: 'entrance', r0: entrance[0] - 1, c0: entrance[1] - 1, r1: entrance[0] + 1, c1: entrance[1] + 1 }];
    rest.forEach((p, i) => places.push({ kind: roles[i] || 'chamber', r0: p[0] - 1, c0: p[1] - 1, r1: p[0] + 1, c1: p[1] + 1 }));
    const floorAt = (r, c) => [':', '^'].includes(g[r]?.[c]) && !P.taken[r][c];
    const near = (p, n, fn) => { const cells = []; for (let r = p.r0 - 1; r <= p.r1 + 1; r++) for (let c = p.c0 - 1; c <= p.c1 + 1; c++) if (floorAt(r, c) && !(r === (p.r0 + p.r1) / 2 && c === (p.c0 + p.c1) / 2)) cells.push([r, c]); R.shuffle(cells).slice(0, n).forEach(([r, c]) => { fn(r, c); P.taken[r][c] = true; }); };
    const lights = [];
    for (const p of places) {
      const mr = (p.r0 + p.r1) / 2, mc = (p.c0 + p.c1) / 2;
      if (p.kind === 'crystals') { near(p, 4, (r, c) => P.put('crystals', r, c, null, { ry: R.next() * 6 })); lights.push([mr, mc, '#c58cff']); }
      if (p.kind === 'grotto') near(p, 5, (r, c) => P.put(R.pick(['mushroom_cluster', 'shelf_fungus']), r, c, null, { ry: R.next() * 6 }));
      if (p.kind === 'pool') near(p, 4, (r, c) => { g[r][c] = '~'; });
      if (p.kind === 'treasure') { near(p, 1, (r, c) => { g[r][c] = 'h'; }); near(p, 2, (r, c) => P.put(R.pick(['gold_bars', 'coin_pouch', 'crown']), r, c)); }
      if (p.kind === 'bones' || p.kind === 'lair') near(p, 3, (r, c) => P.put(R.pick(['skull', 'bone', 'bone']), r, c, null, { ry: R.next() * 6 }));
      if (p.kind === 'camp') { near(p, 1, (r, c) => { g[r][c] = 'X'; }); near(p, 2, (r, c) => P.put(R.pick(['sacks', 'backpack', 'log']), r, c)); lights.push([mr, mc, '#ffb070']); }
      if (p.kind === 'mine') { near(p, 2, (r, c) => { g[r][c] = R.pick(['C', 'p', 'V']); }); near(p, 1, (r, c) => P.put('crystals', r, c)); lights.push([mr, mc, '#ffd29a']); }
      if (p.kind === 'entrance') lights.push([mr, mc, '#cfe2ff']);
    }
    // the rest of the cave: rocks and fungus against the walls
    for (const [r, c] of R.shuffle(main.slice()).slice(0, Math.round(main.length / 14))) {
      if (!floorAt(r, c) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => g[r + dr]?.[c + dc] === '#')) continue;
      P.put(R.pick(['mossy_rock', 'boulder', 'mushroom_cluster', 'crystals', 'mossy_rock']), r, c, null, { ry: R.next() * 6 }); P.taken[r][c] = true;
    }
    const pl = named(W, H, places), at = toBoard(W, H);
    const objects = [...P.objects, ...lights.map(([r, c, color]) => { const [x, z] = at(Math.round(r), Math.round(c)); return { type: 'light', x, z, y: 1.4, intensity: 1.5, range: 5.5, color }; })];
    return finish({ kind: 'cave', W, H, g, places: pl, objects, start: pl.find(p => p.kind === 'entrance'), lighting: 'night', dark: !!opts.dark });
  }

  // Villages look built-up all round: closed buildings (inn, stone and tall
  // houses, a mill house, a sawmill, a blacksmith, barracks, a gazebo) on the
  // grass left over, facing the nearest road, and varied trees.
  function villageExtras(v, opts) {
    const R = rng((opts.seed ?? 1) * 31 + 7), W = v.size[0], H = v.size[1];
    const g = v.grid.map(row => row.split('')), P = placer(W, H, R);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] !== ',') P.mark(r - 1, c - 1, r + 1, c + 1);
    const style = String(opts.style || '').toLowerCase();
    const kinds = style === 'farming' || style === 'hamlet' ? ['small_barn', 'barn', 'chicken_coop', 'silo', 'stone_house', 'hay', 'open_barn'] : ['inn', 'stone_house', 'tall_house', 'mill_house', 'stone_house', 'tall_house', 'sawmill', 'blacksmith', 'barracks', 'gazebo', 'fantasy_house', 'stone_house'];
    const road = (r, c) => g[r]?.[c] === ':' || g[r]?.[c] === 'U';
    const facing = (r, c) => { let best = null; for (const [d, dr, dc] of [['s', 1, 0], ['n', -1, 0], ['e', 0, -1], ['w', 0, 1]]) for (let k = 1; k < 12; k++) if (road(r + dr * k, c + dc * k)) { if (!best || k < best[1]) best = [d, k]; break; } return best ? best[0] : 's'; };
    let n = 0;
    for (let t = 0; t < 300 && n < Math.max(2, Math.round(W * H / 140)); t++) {
      const r = R.int(3, H - 4), c = R.int(3, W - 4), type = kinds[n % kinds.length];
      const span = ['hay', 'chicken_coop', 'silo', 'gazebo'].includes(type) ? 3 : 5;
      if (P.building(type, span, g, r, c, facing(r, c), 1)) n++;
    }
    // swap some of the plain trees for the varied ones
    const tree = () => R.pick(['pine_tree', 'oak_tree', 'tall_tree', 'autumn_tree', 'tall_pine', 'oak_tree']);
    const extra = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] === '%' && R.next() < .6) { g[r][c] = ','; const [x, z] = P.at(r, c); extra.push({ type: tree(), x, z, ry: +(R.next() * 6.283).toFixed(3) }); }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] === ',' && !P.taken[r][c] && R.next() < .02) { const [x, z] = P.at(r, c); extra.push({ type: R.pick(['flower_bush', 'flower_patch', 'heather', 'fence_section', 'hay']), x, z, ry: +(R.next() * 6.283).toFixed(3) }); P.taken[r][c] = true; }
    return { ...v, grid: g.map(row => row.join('')), objects: [...v.objects, ...P.objects, ...extra] };
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
    [/\b(cow|bull|sheep|pig|horse|donkey|alpaca|goat)/i, ['pasture', 'stable', 'meadow', 'yard', 'clearing', 'garden', 'square']],
    [/\b(deer|stag|fox|rabbit|bunny|boar)/i, ['grove', 'meadow', 'clearing', 'pasture']],
    [/\b(dog|husky|hound)/i, ['yard', 'square', 'camp', 'farmhouse']],
    [/\b(stable|groom|farmer|farmhand|milkmaid|shepherd)/i, ['field', 'farmhouse', 'yard', 'stable', 'garden', 'pasture']],
    [/\b(hunter|huntress|ranger|bandit|outlaw|poacher|woodsman|woodcutter|scout)/i, ['camp', 'hut', 'clearing', 'ruins']],
    [/\b(hermit|druid|witch|herbalist)/i, ['hut', 'shrine', 'grove']],
    [/\b(miner|prospector|dwarf)/i, ['mine', 'camp', 'crystals']],
    [/\b(wyrm|wyrmling|snake|serpent|wasp|frog|mushroom|imp)/i, ['lair', 'grotto', 'pool', 'grove', 'ruins', 'cave']],
    [/\b(gardener|herbalist)/i, ['garden', 'alchemist']],
    [/\b(treasure|dragon|hoard|miser)/i, ['treasure']],
    [/\b(child|kid|villager|elder|mayor|townsfolk|widow|fisher)/i, ['house', 'square']],
  ];
  function placeFor(agent, places, used) {
    const text = [agent.id, agent.style, agent.personality, agent.role, String(agent.model || '').replace(/_/g, ' ')].filter(Boolean).join(' ');
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
    const KINDS = { village, town: village, hamlet: village, forest, woods: forest, wilds: forest, wilderness: forest, farm, farmstead: farm, cave, caves: cave, cavern: cave, mine: cave, dungeon };
    const make = KINDS[kindName] || dungeon, outdoor = make === village || make === forest || make === farm;
    const genOpts = { ...opts, want, seed: opts.seed ?? scn.seed ?? 1, size: opts.size || scn.size, dark: scn.dark ?? !outdoor, style: opts.style || (kindName === 'mine' ? 'mine' : kindName === 'hamlet' ? 'hamlet' : '') };
    let gen = make(genOpts);
    if (make === village && opts.extras !== false) gen = villageExtras(gen, genOpts);
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
        objects: [...gen.objects, ...objects], agents, player, lighting: scn.lighting ?? gen.lighting, dark: scn.dark ?? gen.dark, walls: scn.walls ?? (make === forest || make === cave ? 'stone' : 'stone'), wallHeight: scn.wallHeight ?? 2, base: scn.base ?? 'plain' },
      places: gen.places.map(p => ({ id: p.id, kind: p.kind, center: p.center, x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, who: agents.filter(a => placed[a.id] === p.id).map(a => a.id) })),
      warnings,
    };
  }

  // Buildings to go into (scenario.js expandBuildings): a house, timber house
  // or stable placed as one thing becomes walls round a floor, the door in the
  // middle of its front (+z at ry 0), "inside" its furniture (rows from the
  // back wall; WALK_IN_THINGS). size: [across, deep] with the walls.
  const WALK_IN = {
    house: { name: 'house', size: [5, 5], floor: 'wood', inside: ['Z.K', '.t.', '(..'], pad: 2 },
    fantasy_house: { name: 'timber house', size: [6, 5], floor: 'oak', inside: ['Z)K(', 'z.t.', '....'], pad: 2 },
    stable: { name: 'stable', size: [7, 5], floor: 'dirt', inside: ['dfBfu', '.....', '|...C'], pad: 2 },
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

  // The inside of a kept building as a scenario of its own (a subworld): the
  // walls with a door at the front, the floor, the standard furniture, the
  // player set down inside the door and a link back out at the square in
  // front of it. The world builder lets it be edited like any map.
  function interiorScenario(type) {
    const { spec, Wd, D, cell, door } = walkInFootprint({ type, x: 0, z: 0, ry: 0 });
    const objects = [], paint = [];
    for (let i = 0; i < Wd; i++) for (let j = 0; j < D; j++) {
      const [x, z] = cell(i, j);
      if (i === 0 || j === 0 || i === Wd - 1 || j === D - 1) { objects.push({ type: i === door[0] && j === door[1] ? 'door' : 'wall', x, z }); continue; }
      const t = WALK_IN_THINGS[spec.inside[j - 1]?.[i - 1]]; if (t) objects.push({ type: t, x, z });
      paint.push({ x, z, mat: spec.floor });
    }
    const [ix, iz] = cell(door[0], D - 2), out = cell(door[0], D);
    paint.push({ x: ix, z: cell(door[0], D - 1)[1], mat: spec.floor });
    return { title: spec.name, base: 'plain', floor: spec.floor, size: [Math.max(11, Wd + 6), Math.max(9, D + 5)], objects, paint, agents: [],
      player: { at: [ix, iz], facing: 'n' }, links: [{ at: out, to: 'back', name: 'outside' }], roofs: false };
  }
  // A kept building ("keep": true: the model stays outside, the inside is a
  // subworld): the square in front of its door, `dist` squares from the
  // building's centre, and the one beyond it where the player is set down on
  // coming back (scenario.js expandBuildings).
  function doorPad(b) {
    const spec = WALK_IN[b.type], q = ((Math.round((+b.ry || 0) / (Math.PI / 2)) % 4) + 4) % 4, f = [[0, 1], [1, 0], [0, -1], [-1, 0]][q];
    const bx = Math.round(+b.x), bz = Math.round(+b.z), d = spec.pad || 2;
    return { pad: [bx + f[0] * d, bz + f[1] * d], beyond: [bx + f[0] * (d + 1), bz + f[1] * (d + 1)] };
  }
  const api = { dungeon, village, forest, farm, cave, applyToScenario, KINDS: ['dungeon', 'village', 'forest', 'farm', 'cave'], WALK_IN, WALK_IN_THINGS, walkInFootprint, doorPad, interiorScenario, ROOM_KINDS: Object.keys(ROOM_FURNISH), BUILDING_KINDS: Object.keys(BUILDING_FURNISH) };
  globalThis.TablefolkProcgen = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
