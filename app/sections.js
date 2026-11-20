/* sections.js -- the look and the upkeep of a world in sections (scenario.js
 * keeps the sections themselves: links, travel, saved states, the journey).
 *
 *   marker(link)       a link's look on its square, by "kind": stairs_down (steps
 *                      going down into the dark, a stone rim), stairs_up (steps
 *                      rising to a dark opening), cave (a dark mouth in a rock
 *                      mound), gate (two posts and a lintel), trapdoor (a hatch
 *                      with an iron ring); each with its destination's name on a
 *                      small floating label. A door keeps scenario.js's glowing disc.
 *   edgeMarker(e)      an edge that leads on: a faint band along the rim and an
 *                      arrow with the name where the road leaves (terrain.js draws
 *                      the road past the board, surroundings.js keeps trees off it)
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
 *   window.tablefolkSections = { marker, edgeMarker, clearMarkers, catchUp, showMap, hideMap }
 * Loaded after scenario.js; uses app.js globals (state, meta, setCharacterLogicalPosition).
 */
(function () {
  const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
  let markers = [];
  const top = () => state.terrainTopY ?? 0;
  const W = () => window.tablefolk;
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
    return m;
  }
  const ARROW = { stairs_down: '↓ ', stairs_up: '↑ ', trapdoor: '↓ ', cave: '', gate: '', door: '' };
  function marker(l) {
    const sc = state.scene; if (!sc || !l.at) return false;
    const [x, z] = l.at, root = new BABYLON.TransformNode('link_marker', sc);
    root.position.set(x, top(), z);
    const [fx, fz] = l.kind === 'stairs_down' || l.kind === 'stairs_up' ? facingOf(l) : [0, -1];
    root.rotation.y = Math.atan2(fx, fz);   // local +z runs the way the stair goes
    const box = (name, w, h, d, px, py, pz, m) => { const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, sc); b.position.set(px, py, pz); b.material = m; b.parent = root; b.isPickable = false; b.receiveShadows = true; return b; };
    if (l.kind === 'stairs_down') {
      const p = BABYLON.MeshBuilder.CreateGround('link_stairs_down', { width: .86, height: .92 }, sc); p.parent = root; p.position.y = .012; p.material = stairsDownTex(sc); p.isPickable = false;
      p.rotation.y = Math.PI;   // the light end toward the player coming in (local -z)
      box('link_rim', .1, .1, 1, -.48, .05, 0, stone()); box('link_rim', .1, .1, 1, .48, .05, 0, stone()); box('link_rim', 1.06, .1, .1, 0, .05, .5, stone());
    } else if (l.kind === 'stairs_up') {
      for (let i = 0; i < 5; i++) box('link_step', .86, .2 * (i + 1), .19, 0, .1 * (i + 1), -.38 + i * .19, stone());
      const d = BABYLON.MeshBuilder.CreatePlane('link_dark', { width: .74, height: 1.25 }, sc); d.parent = root; d.position.set(0, 1 + .62, .47); d.material = black(); d.isPickable = false;
      box('link_post', .1, 2.4, .12, -.43, 1.2, .47, stone()); box('link_post', .1, 2.4, .12, .43, 1.2, .47, stone()); box('link_lintel', .96, .14, .14, 0, 2.38, .47, stone());
    } else if (l.kind === 'cave') {
      const r = BABYLON.MeshBuilder.CreateSphere('link_cave_rock', { diameter: 1.9, segments: 7 }, sc); r.parent = root; r.scaling.set(1, .75, .7); r.position.set(0, .15, .55); r.material = stone(); r.isPickable = false;
      const d = BABYLON.MeshBuilder.CreateDisc('link_cave_mouth', { radius: .46, tessellation: 18 }, sc); d.parent = root; d.scaling.set(1, 1.4, 1); d.position.set(0, .5, .04); d.rotation.y = Math.PI; d.material = black(); d.isPickable = false;
    } else if (l.kind === 'gate') {
      box('link_post', .16, 1.9, .16, -.5, .95, 0, wood()); box('link_post', .16, 1.9, .16, .5, .95, 0, wood()); box('link_lintel', 1.25, .14, .18, 0, 1.92, 0, wood());
      for (let i = -2; i <= 2; i++) box('link_bar', .035, 1.5, .035, i * .17, .8, .02, iron());
      box('link_bar', .82, .05, .04, 0, 1.45, .02, iron()); box('link_bar', .82, .05, .04, 0, .3, .02, iron());
    } else if (l.kind === 'trapdoor') {
      box('link_hatch', .8, .05, .8, 0, .03, 0, wood());
      for (let i = -1; i <= 1; i++) box('link_band', .82, .055, .06, 0, .035, i * .3, iron());
      const ring = BABYLON.MeshBuilder.CreateTorus('link_ring', { diameter: .16, thickness: .025, tessellation: 16 }, sc); ring.parent = root; ring.position.set(0, .07, -.25); ring.material = iron(); ring.isPickable = false;
    } else { root.dispose(); return false; }
    // a faint glow on the square: this is a way somewhere
    const g = BABYLON.MeshBuilder.CreateDisc('link_glow', { radius: .5, tessellation: 32 }, sc); g.rotation.x = Math.PI / 2; g.position.set(x, top() + .04, z); g.material = glow(); g.isPickable = false;
    markers.push(root, g);
    const lb = label((ARROW[l.kind] || '') + (l.name || ''), x, z, l.kind === 'stairs_up' || l.kind === 'gate' ? 2.75 : 1.6);
    if (lb) markers.push(lb);
    return true;
  }
  function edgeMarker(e) {
    const sc = state.scene; if (!sc || window.TABLEFOLK_TABLETOP) return;
    const Wd = W().WORLD, bx = Wd.halfW - 1, bz = Wd.halfH - 1, ew = e.edge === 'east' || e.edge === 'west';
    const len = ew ? Wd.rows : Wd.cols, band = BABYLON.MeshBuilder.CreateGround('link_edge_band', { width: ew ? .5 : len, height: ew ? len : .5 }, sc);
    const off = .25;
    band.position.set(e.edge === 'east' ? -bx - off : e.edge === 'west' ? bx + off : 0, top() + .03, e.edge === 'north' ? -bz - off : e.edge === 'south' ? bz + off : 0);
    band.material = glow(); band.isPickable = false; markers.push(band);
    const [rx, rz] = e.road || [0, 0], d = { east: [-1, 0], west: [1, 0], north: [0, -1], south: [0, 1] }[e.edge];
    // an arrow on the ground at the road, pointing off the board
    const a = BABYLON.MeshBuilder.CreateDisc('link_edge_arrow', { radius: .38, tessellation: 3 }, sc);
    a.rotation.x = Math.PI / 2; a.rotation.y = Math.atan2(d[0], d[1]) - Math.PI / 2; a.position.set(rx + d[0] * .15, top() + .05, rz + d[1] * .15);
    a.material = glow(); a.isPickable = false; markers.push(a);
    const lb = label('→ ' + (e.name || e.edge), rx + d[0] * .4, rz + d[1] * .4, 1.7); if (lb) markers.push(lb);
  }
  function clearMarkers() { for (const m of markers) try { m.dispose(false, false); } catch {} markers = []; }

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
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

  window.tablefolkSections = { marker, edgeMarker, clearMarkers, catchUp, showMap, hideMap, get lastCatchUp() { return lastCatchUp; } };
})();
