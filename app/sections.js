/* sections.js -- the look and the upkeep of a world in sections (scenario.js
 * keeps the sections themselves: links, travel, saved states, the journey).
 *
 *   marker(link)       a link's look on its square, by "kind" (real geometry, look
 *                      pass 4): stairs_down (a stairwell cut into the floor:
 *                      terrain.js leaves the square open, six steps go down into
 *                      the dark between stone sides), stairs_up (six steps
 *                      against the wall to a dark opening in a stone frame),
 *                      cave (a dark mouth under an arch of piled rock), gate (a
 *                      timber gateway on stone footings, its leaves open),
 *                      trapdoor (a plank hatch in a frame, iron straps, a ring);
 *                      each with its destination's name on a small floating label.
 *                      A door keeps scenario.js's glowing disc.
 *   edgeMarker(e)      an edge that leads on: the road leaves between two
 *                      waymarker stones, a signpost names where it goes, and a
 *                      faint arrow shows on the ground while the player is within
 *                      3 squares (terrain.js draws the road past the board,
 *                      surroundings.js keeps trees off it), and a soft warm band
 *                      along the whole rim (brighter while its prompt shows)
 *   doorLabel(l, name) a door link's destination on a label (labels show within
 *                      8 m or when looked at)
 *   prompt({ text, how, edge, locked, onGo }) / prompt(null), nudge()
 *                      the on-screen way-out prompt (scenario.js watchPads)
 *   titleCard(title, sub)  the section's name on arrival (tablefolk-section)
 *   clearMarkers()
 *   catchUp({ minutes, agents, places })
 *                      a section coming back after game time passed, in code (no
 *                      model): stock grows back at its rates, the stores lose a
 *                      meal per resident every 8 hours while they hold food,
 *                      hunger and tiredness move to where the day's routine
 *                      leaves them (never starving), workers stand where their
 *                      job puts them at this hour (asleep in a bed at night, at
 *                      the workplace in working hours, the tavern or square in
 *                      the evening, else home), and raiders left behind are gone.
 *   showMap(list)      the 🗺 map card: every known section, the one you are in,
 *                      visited or not, and its ways out (scenario.js sectionsMap)
 *
 *   window.tablefolkSections = { marker, edgeMarker, doorLabel, clearMarkers, catchUp, showMap, hideMap, prompt, nudge, titleCard }
 * Loaded after scenario.js; uses app.js globals (state, meta, setCharacterLogicalPosition).
 */
(function () {
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  let markers = [];
  const top = () => state.terrainTopY ?? 0;
  const W = () => window.tablefolk;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mats = {};
  function mat(name, make) {
    const sc = state.scene, m = mats[name];
    if (m && !m.isDisposed?.() && m.getScene() === sc) return m;
    return (mats[name] = make(sc));
  }
  // textured like the walls and floors (assets/textures/env), matte
  const ENV = () => (window.tablefolkPacks?.base || '/assets/') + 'textures/env/';
  function envMat(name, tex, tint, scale = 1) {
    return mat(name, sc => {
      const m = new BABYLON.PBRMaterial(name, sc), t = new BABYLON.Texture(ENV() + tex + '_color_1k.webp', sc);
      t.uScale = t.vScale = scale; m.albedoTexture = t; m.albedoColor = tint; m.metallic = 0; m.roughness = .95; m.maxSimultaneousLights = 8; m.environmentIntensity = .35;
      try { window.TABLEFOLK_LOOK?.matte?.(m); } catch {}
      return m;
    });
  }
  const stone = () => envMat('link_stone_mat', 'stone_blocks_large', C3(.62, .6, .57), .5);
  const wood = () => envMat('link_wood_mat', 'wood_planks_dark', C3(.8, .72, .64), .6);
  const iron = () => mat('iron', sc => { const m = new BABYLON.PBRMaterial('link_iron_mat', sc); m.albedoColor = C3(.2, .2, .22); m.metallic = .6; m.roughness = .55; m.maxSimultaneousLights = 8; return m; });
  const black = () => mat('black', sc => { const m = new BABYLON.StandardMaterial('link_black_mat', sc); m.diffuseColor = m.specularColor = C3(0, 0, 0); m.emissiveColor = C3(.01, .01, .012); m.disableLighting = true; return m; });
  const glow = () => mat('glow', sc => { const m = new BABYLON.StandardMaterial('link_glow_mat', sc); m.disableLighting = true; m.emissiveColor = C3(1, .82, .35); m.alpha = .22; m.disableDepthWrite = true; return m; });
  // steps going down, painted: light stone near, darker and darker away
  function stairsDownTex(sc) {
    return mat('downtex', () => {
      const t = new BABYLON.DynamicTexture('link_down_tex', { width: 128, height: 128 }, sc, true), c = t.getContext();
      for (let i = 0; i < 6; i++) { const v = Math.round(118 * Math.pow(.62, i)); c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.fillRect(0, i * 21, 128, 21); c.fillStyle = `rgba(255,240,215,${.28 * Math.pow(.6, i)})`; c.fillRect(0, i * 21, 128, 3); }
      c.fillStyle = '#000'; c.fillRect(0, 126, 128, 2); t.update();
      const m = new BABYLON.StandardMaterial('link_down_mat', sc); m.diffuseTexture = t; m.emissiveTexture = t; m.disableLighting = true; m.specularColor = C3(0, 0, 0);
      return m;
    });
  }
  // which way a stair runs: its "facing", else toward the wall beside it, else north
  function facingOf(l) {
    const f = { n: [0, -1], s: [0, 1], e: [-1, 0], w: [1, 0], north: [0, -1], south: [0, 1], east: [-1, 0], west: [1, 0] }[l.facing];
    if (f) return f;
    const [x, z] = l.at;
    for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (typeof isBlocked === 'function' && isBlocked(x + d[0], z + d[1])) return d;
    return [0, -1];
  }
  function label(text, x, z, y, parent) {
    if (!text) return null;
    const sc = state.scene, t = new BABYLON.DynamicTexture('link_label_tex', { width: 512, height: 96 }, sc, true), c = t.getContext();
    c.font = '600 46px system-ui, sans-serif'; const w = Math.min(500, c.measureText(text).width + 40);
    c.fillStyle = 'rgba(18,20,24,.72)'; c.beginPath(); c.roundRect?.((512 - w) / 2, 14, w, 68, 30); c.fill();
    c.fillStyle = '#f4e7c6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 49); t.update(); t.hasAlpha = true;
    const m = BABYLON.MeshBuilder.CreatePlane('link_label', { width: 1.9, height: .36 }, sc);
    const mm = new BABYLON.StandardMaterial('link_label_mat', sc); mm.diffuseTexture = t; mm.emissiveColor = C3(1, 1, 1); mm.disableLighting = true; mm.useAlphaFromDiffuseTexture = true; mm.backFaceCulling = false;
    m.material = mm; m.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; m.position.set(x, top() + y, z); m.isPickable = false;
    if (parent) m.parent = parent;
    m.onDisposeObservable.add(() => { try { t.dispose(); mm.dispose(); } catch {} });
    m.visibility = 0; m.setEnabled(false); labels.push(m); watch();
    return m;
  }
  // Labels show within LABEL_NEAR metres of the player (or the camera's target), or
  // when looked at (within ~7 degrees of the view's centre, up to 40 m), fading in and out.
  const LABEL_NEAR = 8;
  let labels = [], obs = null;
  function watch() {
    const sc = state.scene; if (obs || !sc) return;
    obs = sc.onBeforeRenderObservable.add(() => {
      const cam = sc.activeCamera, av = state.playerAvatar, p = av?.logicalPos || av?.root?.position || cam?.target; if (!cam || !p) return;
      const dt = Math.min(.1, (sc.getEngine().getDeltaTime() || 16) / 1000), from = cam.globalPosition || cam.position, fwd = cam.getForwardRay?.(1)?.direction;
      for (const m of labels) {
        if (m.isDisposed()) continue;
        const q = m.getAbsolutePosition(), near = Math.hypot(q.x - p.x, q.z - p.z) <= LABEL_NEAR;
        let look = false;
        if (!near && fwd) { const dx = q.x - from.x, dy = q.y - from.y, dz = q.z - from.z, d = Math.hypot(dx, dy, dz); look = d < 40 && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d > .992; }
        const want = near || look ? 1 : 0, v = m.visibility + (want - m.visibility) * Math.min(1, dt * 6);
        m.visibility = Math.abs(v - want) < .02 ? want : v;
        if (m.isEnabled() !== m.visibility > .01) m.setEnabled(m.visibility > .01);
      }
      for (const r of arrows) if (!r.a.isDisposed()) { const on = !!av && Math.hypot(p.x - r.x, p.z - r.z) <= 3; if (r.a.isEnabled() !== on) r.a.setEnabled(on); }
      for (const s of strips) if (!s.m.isDisposed()) { const want = promptEdge === s.edge ? .9 : .38; s.m.visibility += (want - s.m.visibility) * Math.min(1, dt * 4); }
    });
  }
  // a door link (scenario.js's glowing disc): its destination on a label like the others
  function doorLabel(l, name) {
    if (!state.scene || !l.at || window.TABLEFOLK_TABLETOP) return null;
    const lb = label(name || l.name || '', l.at[0], l.at[1], 1.9); if (lb) markers.push(lb);
    return lb;
  }
  const ARROW = { stairs_down: '↓ ', stairs_up: '↑ ', trapdoor: '↓ ', cave: '', gate: '', door: '' };
  // boxes merged per material under a root (one draw call per material a marker)
  function builder(root, kind) {
    const sc = state.scene, parts = new Map();
    const box = (name, w, h, d, px, py, pz, m, opts = {}) => {
      const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, sc); b.position.set(px, py, pz);
      if (opts.ry) b.rotation.y = opts.ry; if (opts.rx) b.rotation.x = opts.rx; if (opts.rz) b.rotation.z = opts.rz;
      if (opts.col) { const n = b.getTotalVertices(), c = new Float32Array(n * 4); for (let i = 0; i < n; i++) c.set([...opts.col, 1], i * 4); b.setVerticesData(BABYLON.VertexBuffer.ColorKind, c); }
      b.parent = root; (parts.get(m) || parts.set(m, []).get(m)).push(b); return b;
    };
    const done = () => { for (const [m, list] of parts) { for (const b of list) { if (!b.getVerticesData(BABYLON.VertexBuffer.ColorKind)) { const n = b.getTotalVertices(), c = new Float32Array(n * 4).fill(1); b.setVerticesData(BABYLON.VertexBuffer.ColorKind, c); } }
      // merged in world space (MergeMeshes bakes each part's world matrix): not parented, disposed with the root
      root.computeWorldMatrix(true); for (const b of list) b.computeWorldMatrix(true);
      const one = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, false);
      if (!one) continue; one.name = 'link_' + kind + '_' + (m.name || 'part'); root.onDisposeObservable.add(() => { try { one.dispose(); } catch {} }); one.material = m; one.isPickable = false; one.receiveShadows = true; one.useVertexColors = true; one.hasVertexAlpha = false; } };
    return { box, done };
  }
  // a square of ground the terrain leaves open (a stairwell): terrain.js holes
  const holes = new Map();
  function hole(key, x0, z0, x1, z1) { holes.set(key, [x0, z0, x1, z1]); window.tablefolkTerrain?.setHoles?.([...holes.values()]); }
  // Each kind is real geometry (look pass 4): a stairwell cut into the floor with six
  // steps going down into the dark between stone sides; stairs up against a wall to a
  // dark opening; a cave mouth as a dark rock arch; a gate as a timber gateway on
  // stone footings; a trapdoor as a plank hatch with an iron ring.
  function marker(l) {
    const sc = state.scene; if (!sc || !l.at) return false;
    const [x, z] = l.at, root = new BABYLON.TransformNode('link_marker', sc);
    root.position.set(x, top(), z);
    const [fx, fz] = l.kind === 'stairs_down' || l.kind === 'stairs_up' ? facingOf(l) : [0, -1];
    root.rotation.y = Math.atan2(fx, fz);   // local +z runs the way the stair goes
    const B = builder(root, l.kind), box = B.box, S = stone(), Wd = wood(), Ir = iron(), K = black();
    if (l.kind === 'stairs_down') {
      // the opening: .9 x .96; six steps from the near end (local -z) down to -1.0, darker as they go
      const W0 = .86, D = .96, n = 6, rise = .17, run = D / n;
      hole('l' + x + ',' + z, x - .47, z - .5, x + .47, z + .5);
      // the hole is axis-aligned; the steps turn with the stair (a square opening fits either way)
      for (let i = 0; i < n; i++) { const k = Math.pow(.62, i + 1); box('link_step', W0, rise, run + .02, 0, -rise * (i + .5), -D / 2 + run * (i + .5), S, { col: [k, k * .97, k * .93] }); }
      // under the steps and the far end: dark
      box('link_dark', W0, .04, D, 0, -rise * n - .02, 0, K);
      box('link_dark', W0, rise * n, .04, 0, -rise * n / 2, D / 2 + .01, K);
      // stone sides (the cut's walls), lit near the top
      for (const sx of [-1, 1]) { box('link_side', .06, .5, D, sx * (W0 / 2 + .03), -.25, 0, S, { col: [.55, .53, .5] }); box('link_side', .06, rise * n - .5, D, sx * (W0 / 2 + .03), -.5 - (rise * n - .5) / 2, 0, K); }
      // a kerb of dressed stone round the opening, lower on the near side
      box('link_kerb', 1.06, .08, .09, 0, .04, D / 2 + .045, S); for (const sx of [-1, 1]) box('link_kerb', .09, .08, D + .18, sx * .5, .04, 0, S);
      box('link_kerb', 1.06, .03, .09, 0, .015, -D / 2 - .045, S);
    } else if (l.kind === 'stairs_up') {
      // six steps rising against the wall (local +z) to a dark opening in a stone frame
      const n = 6, rise = .2, run = .16;
      for (let i = 0; i < n; i++) box('link_step', .86, rise * (i + 1), run, 0, rise * (i + 1) / 2, -.45 + run * (i + .5), S, { col: [.85 - i * .05, .83 - i * .05, .8 - i * .05] });
      for (const sx of [-1, 1]) box('link_cheek', .08, rise * n, n * run, sx * .47, rise * n / 2, -.45 + n * run / 2, S, { col: [.7, .68, .65] });
      box('link_dark', .74, 1.3, .06, 0, rise * n + .62, .47, K);
      for (const sx of [-1, 1]) box('link_post', .12, rise * n + 1.35, .16, sx * .43, (rise * n + 1.35) / 2, .47, S);
      box('link_lintel', 1.0, .16, .18, 0, rise * n + 1.36, .47, S);
    } else if (l.kind === 'cave') {
      // a rock arch: piled boulders round a dark mouth set back into the mound
      const R = (i, a, b) => { const v = Math.sin(x * 12.9 + z * 78.2 + i * 37.7) * 43758.5; return a + (v - Math.floor(v)) * (b - a); };
      const arch = [[-.62, .25, .55, .7], [-.6, .75, .45, .55], [-.42, 1.15, .5, .45], [0, 1.32, .7, .4], [.42, 1.15, .5, .45], [.6, .75, .45, .55], [.62, .25, .55, .7]];
      arch.forEach(([ax, ay, w, h], i) => { const k = R(i, .5, .72); box('link_cave_rock', w, h, R(i + 9, .55, .8), ax, ay, .25, S, { col: [k, k * .97, k * .92], ry: R(i + 3, -.3, .3), rz: R(i + 5, -.25, .25) }); });
      box('link_cave_rock', 1.9, .6, 1.1, 0, 1.55, .75, S, { col: [.42, .41, .39], rz: .05 });
      box('link_cave_mouth', .78, 1.15, .05, 0, .58, .52, K);
      box('link_cave_mouth', .78, .04, .5, 0, .02, .28, K);
    } else if (l.kind === 'gate') {
      // a timber gateway on stone footings, a little roof, the way through dark-shaded
      for (const sx of [-1, 1]) { box('link_footing', .34, .4, .34, sx * .6, .2, 0, S); box('link_post', .2, 2.0, .2, sx * .6, 1.4, 0, Wd); box('link_brace', .08, .55, .08, sx * .44, 2.0, 0, Wd, { rz: sx * .75 }); }
      box('link_lintel', 1.6, .18, .24, 0, 2.38, 0, Wd);
      box('link_roof', 1.9, .06, .5, 0, 2.62, -.1, Wd, { rx: .35, col: [.6, .55, .5] }); box('link_roof', 1.9, .06, .5, 0, 2.62, .1, Wd, { rx: -.35, col: [.6, .55, .5] });
      for (let i = -1; i <= 1; i += 2) { box('link_leaf', .5, 1.6, .06, i * .26, .95, .12, Wd, { ry: i * .9, col: [.75, .7, .65] }); box('link_band', .5, .06, .07, i * .26, 1.4, .12, Ir, { ry: i * .9 }); box('link_band', .5, .06, .07, i * .26, .5, .12, Ir, { ry: i * .9 }); }
    } else if (l.kind === 'trapdoor') {
      // planks in a timber frame, two iron straps, a ring
      box('link_frame', .92, .05, .08, 0, .025, -.42, Wd, { col: [.6, .55, .5] }); box('link_frame', .92, .05, .08, 0, .025, .42, Wd, { col: [.6, .55, .5] });
      for (const sx of [-1, 1]) box('link_frame', .08, .05, .92, sx * .42, .025, 0, Wd, { col: [.6, .55, .5] });
      for (let i = 0; i < 5; i++) box('link_plank', .15, .04, .78, -.32 + i * .16, .03, 0, Wd, { col: [.95 - (i % 2) * .1, .9 - (i % 2) * .1, .85 - (i % 2) * .1] });
      for (const sz of [-.22, .22]) box('link_band', .8, .015, .07, 0, .055, sz, Ir);
      const ring = BABYLON.MeshBuilder.CreateTorus('link_ring', { diameter: .16, thickness: .025, tessellation: 16 }, sc); ring.parent = root; ring.position.set(0, .07, -.3); ring.material = Ir; ring.isPickable = false;
    } else { root.dispose(); return false; }
    B.done();
    markers.push(root);
    const lb = label((ARROW[l.kind] || '') + (l.name || ''), x, z, l.kind === 'stairs_up' ? 2.95 : l.kind === 'gate' ? 3.0 : l.kind === 'cave' ? 2.3 : 1.4);
    if (lb) markers.push(lb);
    return true;
  }
  // An edge that leads on: the road runs off the board between two waymarker
  // stones, a signpost names where it goes; a faint arrow on the ground only
  // while the player is within 3 squares of the road's last square.
  let arrows = [], strips = [];
  function signTex(text) {
    const sc = state.scene, t = new BABYLON.DynamicTexture('link_sign_tex', { width: 512, height: 128 }, sc, true), c = t.getContext();
    c.fillStyle = '#5a4026'; c.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(0,0,0,${.08 + (i % 2) * .06})`; c.fillRect(0, i * 22, 512, 2); }
    c.font = '700 64px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(20,12,4,.55)'; c.fillText(text, 258, 68); c.fillStyle = '#f1dfb5'; c.fillText(text, 256, 64);
    t.update(); return t;
  }
  function edgeMarker(e) {
    const sc = state.scene; if (!sc || window.TABLEFOLK_TABLETOP) return;
    const [rx, rz] = e.road || [0, 0], d = { east: [-1, 0], west: [1, 0], north: [0, -1], south: [0, 1] }[e.edge] || [0, 1];
    const root = new BABYLON.TransformNode('link_edge', sc);
    root.position.set(rx + d[0] * .5, top(), rz + d[1] * .5); root.rotation.y = Math.atan2(d[0], d[1]);   // local +z: off the board
    const B = builder(root, 'edge'), box = B.box, S = stone(), Wd = wood();
    // two waymarker stones either side of the road, a little worn and leaning
    for (const sx of [-1, 1]) { box('link_waystone', .32, .7, .26, sx * 1.35, .3, 0, S, { rz: sx * .06, ry: sx * .2, col: [.78, .76, .72] }); box('link_waystone', .36, .08, .3, sx * 1.35, .66, 0, S, { col: [.62, .6, .57] }); }
    // the signpost: a post beside the road and an arm pointing on
    box('link_signpost', .12, 2.1, .12, 1.85, 1.05, -.2, Wd);
    B.done();
    const arm = BABYLON.MeshBuilder.CreatePlane('link_sign', { width: 1.25, height: .3, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, sc);
    const sm = new BABYLON.StandardMaterial('link_sign_mat', sc), tex = signTex(e.name || e.edge); sm.diffuseTexture = tex; sm.specularColor = C3(0, 0, 0); sm.emissiveColor = C3(.18, .16, .14);
    arm.material = sm; arm.parent = root; arm.position.set(1.85 - .45, 1.75, -.2); arm.rotation.y = -Math.PI / 2; arm.isPickable = false;
    arm.onDisposeObservable.add(() => { try { tex.dispose(); sm.dispose(); } catch {} });
    markers.push(root);
    // the arrow: only near
    const a = BABYLON.MeshBuilder.CreateDisc('link_edge_arrow', { radius: .38, tessellation: 3 }, sc);
    a.rotation.x = Math.PI / 2; a.rotation.y = Math.atan2(d[0], d[1]) - Math.PI / 2; a.position.set(rx + d[0] * .15, top() + .05, rz + d[1] * .15);
    a.material = glow(); a.isPickable = false; a.setEnabled(false); markers.push(a); arrows.push({ a, x: rx, z: rz });
    // the threshold: a soft warm band along the whole rim of that edge (the board's last
    // half square and a little past it), brighter while the way-out prompt shows for it
    const WB = window.tablefolk?.WORLD;
    if (WB) {
      const alongX = e.edge === 'north' || e.edge === 'south', len = alongX ? 2 * WB.halfW - 1 : 2 * WB.halfH - 1;
      const rimX = e.edge === 'east' ? -(WB.halfW - 1) : e.edge === 'west' ? WB.halfW - 1 : 0, rimZ = e.edge === 'north' ? -(WB.halfH - 1) : e.edge === 'south' ? WB.halfH - 1 : 0;
      const st = BABYLON.MeshBuilder.CreateGround('link_edge_strip', { width: alongX ? len : 1.3, height: alongX ? 1.3 : len }, sc);
      st.position.set(alongX ? 0 : rimX + d[0] * .4, top() + .035, alongX ? rimZ + d[1] * .4 : 0);
      st.material = stripMat(alongX, d); st.isPickable = false; st.visibility = .38; markers.push(st); strips.push({ m: st, edge: e.edge });
    }
    watch();
  }
  // the band's look: transparent on the board side, warm toward the rim, fading again past it
  function stripMat(alongX, d) {
    return mat('strip' + (alongX ? 'z' : 'x') + d.join(''), sc => {
      const t = new BABYLON.DynamicTexture('link_strip_tex', { width: 64, height: 64 }, sc, false), c = t.getContext();
      // u across the board's edge: 0 board side, 1 off the board (flipped for the edges facing -x / -z)
      const flip = (alongX ? d[1] : d[0]) < 0, g = alongX ? c.createLinearGradient(0, flip ? 0 : 64, 0, flip ? 64 : 0) : c.createLinearGradient(flip ? 64 : 0, 0, flip ? 0 : 64, 0);
      g.addColorStop(0, 'rgba(255,214,120,0)'); g.addColorStop(.55, 'rgba(255,214,120,.55)'); g.addColorStop(.72, 'rgba(255,226,150,.7)'); g.addColorStop(1, 'rgba(255,214,120,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64); t.update(); t.hasAlpha = true;
      const m = new BABYLON.StandardMaterial('link_strip_mat', sc); m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.emissiveColor = C3(1, .85, .5); m.disableLighting = true; m.disableDepthWrite = true; m.backFaceCulling = false;
      return m;
    });
  }
  function clearMarkers() { for (const m of markers) try { m.dispose(false, false); } catch {} markers = []; arrows = []; labels = []; strips = []; if (obs) { try { state.scene?.onBeforeRenderObservable.remove(obs); } catch {} obs = null; } holes.clear(); window.tablefolkTerrain?.setHoles?.([]); prompt(null); }

  // ---------------------------------------------------------------- the way-out prompt and the title card
  // prompt({ text, how, locked, edge, onGo }) shows "To the Wolfwood → / keep walking east · press E"
  // over the scene (a button: a tap goes); prompt(null) hides it. nudge(): a little shake (a step
  // off the rim before the prompt had shown long enough). scenario.js watchPads drives it.
  let promptEl = null, promptGo = null, promptEdge = null, promptKey = '';
  function prompt(o) {
    if (!o) { promptGo = null; promptEdge = null; promptKey = ''; if (promptEl) promptEl.classList.remove('on'); return; }
    promptGo = o.onGo || null; promptEdge = o.edge || null;
    if (!promptEl) {
      promptEl = document.createElement('button'); promptEl.type = 'button'; promptEl.id = 'exitPrompt'; promptEl.className = 'exit-prompt';
      promptEl.addEventListener('click', e => { e.preventDefault(); promptGo?.(); });
      document.body.appendChild(promptEl);
    }
    const k = o.text + '|' + o.how + '|' + !!o.locked;
    if (k !== promptKey) { promptKey = k; promptEl.innerHTML = `<b>${esc(o.text)}</b><small>${o.locked ? '🔒 locked · ' : ''}${esc(o.how || '')}</small>`; }
    promptEl.classList.add('on');
  }
  function nudge() { if (!promptEl) return; promptEl.classList.remove('nudge'); void promptEl.offsetWidth; promptEl.classList.add('nudge'); }
  // a section's name for a moment on arrival (the tablefolk-section event)
  let cardTimer = 0;
  function titleCard(title, sub) {
    if (!title || window.TABLEFOLK_TABLETOP) return;
    let el = document.getElementById('sectionTitleCard');
    if (!el) { el = document.createElement('div'); el.id = 'sectionTitleCard'; el.className = 'section-title-card'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.innerHTML = (sub ? `<small>${esc(sub)}</small>` : '') + `<b>${esc(title)}</b>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(cardTimer); cardTimer = setTimeout(() => el.classList.remove('on'), 2800);
  }
  const SUB = { stairs_down: 'down into', stairs_up: 'up to', trapdoor: 'down into', cave: 'into', gate: 'through the gate to', edge: 'on to', door: 'into', back: 'back to' };
  addEventListener('tablefolk-section', e => { const d = e.detail || {}; titleCard(d.title, d.kind ? 'You go ' + (SUB[d.kind] || 'into') : ''); });

  // ---------------------------------------------------------------- time passed elsewhere
  const inHours = (h, w) => Array.isArray(w) && (w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1]);
  const posOf = g => g.logicalPos || g.root.position;
  function teleport(g, x, z) {
    setCharacterLogicalPosition(g, new BABYLON.Vector3(x, 0, z));
    const pb = g.collider?.physicsBody; if (!pb?.setPrestepType) return;
    try { pb.setPrestepType(BABYLON.PhysicsPrestepType.TELEPORT); } catch {}
    state.scene.onAfterRenderObservable.addOnce(() => { try { pb.setPrestepType(BABYLON.PhysicsPrestepType.ACTION); } catch {} });
  }
  function catchUp({ minutes, agents = [], places = [] } = {}) {
    const w = W(), U = window.tablefolkUses, J = window.tablefolkJobs, K = window.tablefolkClock, M = window.tablefolkMind;
    const hours = Math.max(0, minutes / 60), report = { minutes, regrew: 0, ate: 0, moved: [], asleep: [], gone: [] };
    if (!hours) return report;
    // stock grows back (uses.js's rule: a unit every "regrow" game hours, twice as fast tended)
    for (const o of w.getObjects()) {
      let st = null; try { st = U?.stockOf?.(o); } catch {}
      if (!st || !st.regrow || st.left >= st.max) continue;
      const mm = st.mm, grow = (mm.opts.grow || 0) + hours * (mm.opts.tended ? 2 : 1), add = Math.min(st.max - st.left, Math.floor(grow / st.regrow));
      mm.opts.stock = st.left + add; mm.opts.grow = mm.opts.stock >= st.max ? 0 : grow - add * st.regrow; report.regrew += add;
    }
    const def = id => agents.find(a => a.id === id) || {};
    const folk = state.characters.filter(g => !g.defeated && !w.getBrainConfig(g.id).defeated && J?.jobOf?.(g));
    // meals from the stores: one per resident every 8 hours, while there is food
    const isFood = n => M?.isFood ? M.isFood(n) : /bread|pie|stew|meat|apple|carrot|fish|milk|egg|cheese|pumpkin/i.test(n);
    const stores = w.getObjects().filter(o => ['chest', 'store'].includes(U?.kindOf?.(o.type)));
    let meals = Math.floor(hours / 8) * folk.length;
    for (const o of stores) { if (meals <= 0) break; let c = null; try { c = U.contents(o.mesh); } catch {} for (const it of c?.items || []) { while (meals > 0 && (it.qty ?? 1) > 0 && isFood(it.name)) { it.qty = (it.qty ?? 1) - 1; meals--; report.ate++; } } if (c) c.items = c.items.filter(i => (i.qty ?? 1) > 0); }
    const fed = report.ate > 0 || meals <= 0;
    const h = K?.hour?.() ?? 12;
    for (const g of folk) {
      // needs: where a day's routine leaves them (never starving)
      const cfg = w.getBrainConfig(g.id), m = cfg.mind;
      if (m && cfg.mind) {
        const wantHunger = fed ? .15 + ((h + 18) % 6) / 6 * .3 : Math.min(.62, (m.hunger || 0) + hours * .03);
        const wantTired = h >= 21 || h < 5 ? .55 : h < 9 ? .1 : h < 17 ? .25 : .45;
        const k = Math.min(1, hours / 4);
        m.hunger = Math.min(.62, (m.hunger || 0) + (wantHunger - (m.hunger || 0)) * k);
        m.tired = Math.max(0, Math.min(1, (m.tired || 0) + (wantTired - (m.tired || 0)) * k));
        m.starvingSince = null;
      }
      // where the job puts them at this hour
      const j = J.jobOf(g), a = def(g.id), P = J.places || {};
      const home = P.placeNamed?.(a.home) || (P.placeNamed?.(a.in)?.kind === 'house' ? P.placeNamed(a.in) : null);
      const work = P.placeNamed?.(a.workplace) || (a.in && P.placeNamed?.(a.in) && !['house', 'square'].includes(P.placeNamed(a.in).kind) ? P.placeNamed(a.in) : null);
      const sleepH = j.sleep || (j.watch === 'night' ? [9, 16] : [21, 5]), workH = j.hours || [7, 17];
      try { if (g.pose) U?.standUp?.(g); } catch {}
      if (inHours(h, sleepH)) {
        const inPl = (p, o) => p && o.x >= p.x0 - .5 && o.x <= p.x1 + .5 && o.z >= p.z0 - .5 && o.z <= p.z1 + .5;
        const beds = w.getObjects().filter(o => U?.kindOf?.(o.type) === 'bed' && !state.characters.some(c => c !== g && c.pose?.on === o.mesh));
        const bed = beds.find(o => inPl(home, o)) || beds.sort((p, q) => Math.hypot(p.x - posOf(g).x, p.z - posOf(g).z) - Math.hypot(q.x - posOf(g).x, q.z - posOf(g).z))[0];
        if (bed) { const c = U.besideCell(g, bed); teleport(g, c.x, c.z); try { U.useThing(g, bed); } catch {} report.asleep.push(g.id); continue; }
        const s = home && P.spotIn?.(home, g); if (s) { teleport(g, s.x, s.z); report.moved.push(g.id); }
        continue;
      }
      let to = null;
      if (inHours(h, workH) && work) to = P.spotIn?.(work, g);
      else if (h >= 18 && h < 21) { const tav = (places || []).find(p => p.kind === 'tavern') || (places || []).find(p => p.kind === 'square'); to = tav && P.spotIn?.(tav, g); }
      if (!to && home) to = P.spotIn?.(home, g);
      if (to) { teleport(g, to.x, to.z); report.moved.push(g.id); }
    }
    // raiders left behind went home long ago (a section's own characters stay)
    for (const g of state.characters.slice()) {
      const cfg = w.getBrainConfig(g.id);
      if (!cfg.hostile || agents.some(a => a.id === g.id) || !/^A hostile /.test(cfg.personality || '')) continue;
      if (hours < 1 || g.defeated || cfg.defeated) continue;
      try { disposeCharacter(g); } catch {}
      state.characters = state.characters.filter(x => x !== g); try { state.brainConfigs.delete(g.id); refreshAgentSelect(); } catch {}
      report.gone.push(g.id);
    }
    window.tablefolkDiag?.note?.('sections', `caught up ${Math.round(minutes)} game minutes: ${report.regrew} stock regrew, ${report.ate} meals from the stores, ${report.asleep.length} asleep, ${report.moved.length} at their places${report.gone.length ? ', raiders gone: ' + report.gone.join(', ') : ''}`);
    console.info('[sections] catch-up', report);
    lastCatchUp = report;
    return report;
  }
  let lastCatchUp = null;

  // ---------------------------------------------------------------- the map card
  const KIND_WORD = { door: 'door', stairs_down: 'stairs down', stairs_up: 'stairs up', cave: 'cave', gate: 'gate', trapdoor: 'trapdoor', edge: 'edge' };
  function showMap(list) {
    let el = document.getElementById('sectionMap');
    if (!el) { el = document.createElement('div'); el.id = 'sectionMap'; el.className = 'scn-overlay'; el.style.cssText = 'position:fixed;right:16px;top:64px;z-index:40;max-width:min(380px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:rgba(22,24,29,.94);color:#efe6d3;border-radius:14px;padding:14px 16px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)'; document.body.appendChild(el); el.addEventListener('click', e => { if (e.target.closest('[data-map-close]')) hideMap(); }); }
    const title = id => list.find(s => s.id === id)?.title || '?';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px"><b>🗺 The world's map</b><button type="button" data-map-close style="background:none;border:0;color:inherit;font-size:18px;cursor:pointer" aria-label="close">×</button></div>`
      + list.map(s => `<div style="margin:6px 0 2px ${s.depth * 14}px;${s.here ? 'color:#ffd27a;font-weight:600' : s.visited ? '' : 'opacity:.6'}">${s.here ? '★ ' : s.visited ? '● ' : '○ '}${esc(s.title)}${s.here ? ' <small>(you are here)</small>' : s.visited ? '' : ' <small>(not yet visited)</small>'}</div>`
        + s.links.filter(k => k.to !== 'back').map(k => `<div style="margin-left:${s.depth * 14 + 18}px;font-size:12.5px;opacity:.85">→ ${esc(k.name || title(k.to))} <small>(${esc(k.edge ? k.edge + ' edge' : KIND_WORD[k.kind] || k.kind)}${k.locked ? ', locked' : ''})</small></div>`).join('')).join('')
      + `<div style="margin-top:10px;font-size:12px;opacity:.65">★ you are here · ● visited · ○ not yet</div>`;
    el.hidden = false;
  }
  function hideMap() { const el = document.getElementById('sectionMap'); if (el) el.hidden = true; }
  addEventListener('keydown', e => { if (e.key === 'Escape') hideMap(); });
  addEventListener('tablefolk-section', () => { const el = document.getElementById('sectionMap'); if (el && !el.hidden) showMap(window.tablefolkScenario?.sections?.() || []); });

  window.tablefolkSections = { marker, edgeMarker, doorLabel, clearMarkers, catchUp, showMap, hideMap, prompt, nudge, titleCard, get lastCatchUp() { return lastCatchUp; } };
})();
