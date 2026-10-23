/* senses.js -- what a character perceives, said the way small models read best.
 *
 * Small models (Gemma 4 E2B) do badly with the north-up ASCII map: they have
 * to count columns to find anything. These helpers describe the same world
 * relative to the character instead:
 *
 *   aroundLines(g)  "Around you": by compass direction (and ahead/behind/left/
 *                   right of where it faces), nearest first, steps and the
 *                   cell to walk to, plus what is right next to it
 *   placeLine(g)    the room or building it is in (generated maps), and the
 *                   places it can walk to by name: walk(tavern)
 *   look(g)         the look() command: a fuller description of everything in
 *                   sight (people's looks, health, what they hold; object
 *                   states), returned as the action's result
 *   approach watch  when someone walks up to a character, it is told
 *                   ("Traveller comes up to you, 1 step west"), and answers at
 *                   once if the brains are idle (at most once a minute)
 *
 * Loaded after app.js and combat.js; uses app.js globals.
 */
(function () {
  const SECTORS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  // north = -z, east = -x
  function compass(dx, dz) {
    const a = Math.atan2(-dx, -dz); // 0 = north, +pi/2 = east
    return SECTORS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  }
  function relative(g, dx, dz) {
    const fx = g.dir?.x || 0, fz = g.dir?.z || 1, len = Math.hypot(dx, dz) || 1;
    const dot = (fx * dx + fz * dz) / len, cross = fx * dz - fz * dx;
    if (dot > .75) return 'ahead';
    if (dot < -.75) return 'behind';
    const side = cross > 0 ? 'left' : 'right';
    return dot > .3 ? 'ahead-' + side : dot < -.3 ? 'behind-' + side : side;
  }
  const facingWord = g => compass(g.dir?.x || 0, g.dir?.z || 1);
  const steps = d => d < 1.5 ? 'next to you' : `${Math.round(d)} steps`;
  const DECOR = new Set(['flowers', 'grass_tuft', 'lily_pad', 'light', 'tile', 'hole', 'rubble']);
  const pos = o => o.root ? o.root.position : (o.getAbsolutePosition?.() || o.position);
  const nameOfPlayer = () => document.getElementById('chatName')?.value.trim() || 'the player';

  // Everything a character might notice: people, the player, objects, on
  // squares it sees (darkness.js: line of sight, and light when it's dark).
  function things(g, radius) {
    const p0 = pos(g), out = [], vis = window.tablefolkDark?.sightFor?.(g);
    const seen = (x, z) => !vis || vis.has(Math.round(x) + ',' + Math.round(z));
    for (const o of state.characters) {
      if (o === g) continue;
      const p = pos(o), d = Math.hypot(p.x - p0.x, p.z - p0.z);
      if (d <= radius && seen(p.x, p.z)) out.push({ kind: 'person', id: o.id, who: o, name: o.id, x: Math.round(p.x), z: Math.round(p.z), d });
    }
    if (state.playerAvatar) {
      const p = pos(state.playerAvatar), d = Math.hypot(p.x - p0.x, p.z - p0.z);
      if (d <= radius && seen(p.x, p.z)) out.push({ kind: 'player', id: 'player', who: state.playerAvatar, name: nameOfPlayer() + ' (the player)', x: Math.round(p.x), z: Math.round(p.z), d });
    }
    for (const o of getObjects()) {
      if (DECOR.has(o.type) || meta(o.mesh)?.decor) continue;
      const d = Math.hypot(o.x - p0.x, o.z - p0.z);
      if (d <= radius && d > .2 && seen(o.x, o.z)) out.push({ kind: 'thing', id: o.type, name: o.type.replace(/_/g, ' '), state: o.state, x: Math.round(o.x), z: Math.round(o.z), d, rawX: o.x, rawZ: o.z });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  function personWords(t, detailed) {
    const bits = [];
    const c = window.tablefolkCombat;
    if (t.who?.defeated) bits.push('defeated, lying on the ground');
    else if (c) { const w = c.statusWord(t.who); if (w) bits.push(w); }
    if (detailed && t.kind === 'person') {
      const cfg = getBrainConfig(t.id);
      if (cfg.style) bits.unshift(cfg.style);
      if (cfg.wielding) bits.push('holding ' + cfg.wielding);
    }
    if (t.kind === 'player' && state.player?.wielding) bits.push('holding ' + state.player.wielding);
    return bits.length ? ` (${bits.join(', ')})` : '';
  }

  // "Around you" in a few short lines, grouped by direction.
  function aroundLines(g, { radius = 7, perDir = 3 } = {}) {
    const p0 = pos(g), all = things(g, radius), groups = new Map(), kinds = new Map();
    let wallsNear = [];
    for (const t of all) {
      const dx = t.x - Math.round(p0.x), dz = t.z - Math.round(p0.z);
      if (t.id === 'wall') { if (t.d < 1.5) wallsNear.push(compass(dx, dz)); continue; }
      const dir = compass(dx, dz);
      if (!groups.has(dir)) groups.set(dir, []);
      const list = groups.get(dir);
      // people always; things at most perDir a direction and three of a kind
      if (t.kind !== 'thing') { list.push(t); continue; }
      const k = kinds.get(t.id) || 0;
      if (list.length < perDir && k < 3) { list.push(t); kinds.set(t.id, k + 1); }
    }
    const lines = [`Around you (you face ${facingWord(g)}):`];
    for (const dir of SECTORS) {
      const list = groups.get(dir); if (!list?.length) continue;
      const any = list[0], rel = relative(g, any.x - Math.round(p0.x), any.z - Math.round(p0.z));
      lines.push(`- ${dir} (${rel}): ` + list.map(t => `${t.name}${t.kind !== 'thing' ? personWords(t, false) : t.state && t.state !== 'intact' ? ' (' + t.state + ')' : ''} ${steps(t.d)} at (${t.x},${t.z})`).join('; '));
    }
    if (wallsNear.length) lines.push(`- walls right next to you: ${[...new Set(wallsNear)].join(', ')}`);
    if (lines.length === 1) lines.push('- nothing nearby');
    return lines;
  }

  // Generated maps: which place it is in, and where the others are.
  const ROOM_WORDS = { throne: 'throne room', treasure: 'treasure room', entrance: 'entrance hall', storage: 'storeroom', alchemy: 'alchemy lab', lair: 'lair' };
  const placeName = p => ROOM_WORDS[p.id] || p.id;
  function placeAt(x, z) {
    return (state.places || []).find(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) || null;
  }
  function placeLine(g) {
    const places = state.places || []; if (!places.length) return [];
    const p0 = pos(g), here = placeAt(Math.round(p0.x), Math.round(p0.z));
    const others = places.filter(p => p !== here).map(p => ({ p, d: Math.hypot(p.center[0] - p0.x, p.center[1] - p0.z) })).sort((a, b) => a.d - b.d).slice(0, 6);
    return [
      here ? `You are in: the ${placeName(here)}.` : 'You are outside, between places.',
      ...(others.length ? ['Places (walk(name) goes there): ' + others.map(({ p, d }) => `${p.id} ${Math.round(d)} steps ${compass(p.center[0] - p0.x, p.center[1] - p0.z)}`).join(', ') + '.'] : []),
    ];
  }
  // walk(tavern): the free cell of that place nearest the walker.
  function placeTarget(name, g) {
    const n = String(name || '').toLowerCase().replace(/_/g, ' ').trim();
    const places = state.places || [];
    const p = places.find(q => q.id === n) || places.find(q => q.kind === n) || places.find(q => q.id.startsWith(n));
    if (!p) return null;
    const p0 = pos(g); let best = null;
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) {
      if (typeof cellPassable === 'function' && !cellPassable(x, z)) continue;
      const d = Math.hypot(x - p0.x, z - p0.z) + Math.hypot(x - p.center[0], z - p.center[1]) * .5;
      if (!best || d < best.d) best = { x, z, d };
    }
    return best ? { x: best.x, z: best.z, id: p.id } : { x: p.center[0], z: p.center[1], id: p.id };
  }

  // look(): the action's result is a fuller description.
  function look(g) {
    const p0 = pos(g), all = things(g, 10);
    const here = placeAt(Math.round(p0.x), Math.round(p0.z));
    const people = all.filter(t => t.kind !== 'thing');
    const kinds = new Map(), objs = all.filter(t => t.kind === 'thing' && t.id !== 'wall' && (kinds.set(t.id, (kinds.get(t.id) || 0) + 1), kinds.get(t.id) <= 3)).slice(0, 10);
    const desc = [
      `${g.id} looks around${here ? ' the ' + placeName(here) : ''}, facing ${facingWord(g)}.`,
      people.length ? 'People: ' + people.map(t => `${t.name}${personWords(t, true)}, ${steps(t.d)} ${compass(t.x - Math.round(p0.x), t.z - Math.round(p0.z))}`).join('; ') + '.' : 'Nobody else is in sight.',
      objs.length ? 'Things: ' + objs.map(t => `${t.name}${t.state && t.state !== 'intact' ? ' (' + t.state + ')' : ''} ${steps(t.d)} ${compass(t.x - Math.round(p0.x), t.z - Math.round(p0.z))} at (${t.x},${t.z})`).join('; ') + '.' : '',
    ].filter(Boolean).join(' ');
    const h = state.globalHistory;
    if (h?.length) { const last = h[h.length - 1]; if (last.startsWith('T') && last.includes(g.id + ':')) h[h.length - 1] = last + ' -> ' + desc; }
    try { emitBadge(g, 'looks around'); playRig(g, 'idle', true); } catch {}
    log(desc);
    return desc;
  }

  // ------------------------------------------------------------ approaches
  const near = new Set(), lastReply = new Map(), lastTold = new Map();
  const APPROACH = 2.2, LEAVE = 3.2;
  function watch() {
    if (!state.scene || !state.characters?.length) return;
    const movers = state.characters.concat(state.playerAvatar ? [state.playerAvatar] : []);
    for (const c of state.characters) {
      if (c.defeated) continue;
      const pc = pos(c);
      for (const m of movers) {
        if (m === c || m.defeated) continue;
        const pm = pos(m), d = Math.hypot(pm.x - pc.x, pm.z - pc.z), key = c.id + '|' + (m.id || 'player');
        if (d > LEAVE) { near.delete(key); continue; }
        if (d > APPROACH || near.has(key)) continue;
        near.add(key);
        // Only when the other one did the moving (not when c walked up itself).
        if (!m.turnMove && !m._movedRecently) continue;
        const now = performance.now();
        if (now - (lastTold.get(key) || 0) < 20000) continue;
        lastTold.set(key, now);
        const isPlayer = m === state.playerAvatar, who = isPlayer ? nameOfPlayer() : m.id;
        const where = compass(Math.round(pm.x) - Math.round(pc.x), Math.round(pm.z) - Math.round(pc.z));
        const cfg = getBrainConfig(c.id);
        setBrainConfig(c.id, { pendingChat: (cfg.pendingChat || []).concat([`[event] ${who} comes up to you (${steps(d)}, ${where}).`]).slice(-5) });
        if (isPlayer && state.approachReplies !== false && now - (lastReply.get(c.id) || 0) > 60000) {
          lastReply.set(c.id, now);
          try { window.dispatchEvent(new CustomEvent('tablefolk-approached', { detail: { agentId: c.id, by: who } })); } catch {}
        }
      }
    }
    // remember who moved during the last check
    for (const m of movers) { const p = pos(m), k = p.x.toFixed(2) + ',' + p.z.toFixed(2); m._movedRecently = m._lastPosKey != null && m._lastPosKey !== k; m._lastPosKey = k; }
  }
  setInterval(watch, 400);

  // The character's own view, as a small JPEG data URL (vision brains). The
  // main camera is posed at the character's eyes for one frame (a second
  // camera or a render-target capture comes out blank with this WebGPU setup
  // and its post-process pipelines), then put back.
  async function snapshot(g, { width = 448, height = 320 } = {}) {
    const sc = state.scene, eng = state.engine, cam = sc?.activeCamera;
    if (!cam || !eng || cam.getClassName() !== 'ArcRotateCamera') return null;
    const p = pos(g), d = new BABYLON.Vector3(g.dir?.x || 0, 0, g.dir?.z || 1).normalize();
    const eye = new BABYLON.Vector3(p.x + d.x * .3, (state.terrainTopY ?? 0) + .85, p.z + d.z * .3);
    const look = eye.add(d.scale(4)).add(new BABYLON.Vector3(0, -.55, 0));
    const save = { a: cam.alpha, b: cam.beta, r: cam.radius, t: cam.target.clone(), fov: cam.fov, minZ: cam.minZ, lr: cam.lowerRadiusLimit, lb: cam.lowerBetaLimit, ub: cam.upperBetaLimit };
    cam.lowerRadiusLimit = null; cam.lowerBetaLimit = null; cam.upperBetaLimit = null;
    cam.setTarget(look); cam.setPosition(eye); cam.fov = 1.15; cam.minZ = .05;
    try { return await BABYLON.Tools.CreateScreenshotAsync(eng, cam, { width, height }, 'image/jpeg'); }
    finally {
      cam.lowerRadiusLimit = save.lr; cam.lowerBetaLimit = save.lb; cam.upperBetaLimit = save.ub;
      cam.setTarget(save.t); cam.alpha = save.a; cam.beta = save.b; cam.radius = save.r; cam.fov = save.fov; cam.minZ = save.minZ;
    }
  }

  window.tablefolkSenses = { snapshot, aroundLines, placeLine, placeTarget, placeAt, look, compass, relative };
})();
