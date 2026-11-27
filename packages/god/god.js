// god.js: the God game (packages/god; the rules are god-core.js, the scenario scenarios/god-village.json).
// The player is a god with no body: an overhead camera, the power bar, time controls, and the
// village's belief and the god's mana on the HUD. Everything runs on rails with templated lines;
// above rails (guided or free characters with a brain loaded) villagers pray, speak at the council,
// read omens and dreams in their own words. The reference: the scenario skill's god.md.
//
//   resources   mana (from belief, an hour, and offerings at the shrine), belief (the village's average),
//               belief_<group> (each group's average); each villager's own belief (0-100) lives here
//   powers      rain, drought, storm, fog, bless_field, bless_herd, heal, gift_food, smite, plague, blight,
//               beast, dream, omen (each: a mana cost, a target, a cooldown, effects on the world and belief)
//   bar         Prayers (the list, answered with a power, a dream or silence), Decree (words -> a vision,
//               a council at the shrine, a demand), Pause / Speed
//   demands     god_offering, god_sacrifice, god_worship (templates; work goes to core's plan language)
//   cards       faith (belief, sickness, dreams, signs) for characters with the "faith" skill
// Flags: god_shrine (the shrine's place id; else the first place named shrine or temple), god_anger (the
// default anger for a missed decree: storm, plague, blight, beast, smite, drought or none), blight, drought.
import { createGod, parseDecree, vote, prophecyOf, FITS, HARMFUL } from './god-core.js';

export default function (api) {
  const W = window, J = () => W.tablefolkJobs, K = () => J()?.kit, B = () => W.tablefolkBar, BAB = () => W.BABYLON;
  const gm = () => J()?.gm?.() ?? 0;
  const G = createGod({ now: gm });
  let on = true;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const posOf = g => g.logicalPos || g.root.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const byId = id => api.state.characters.find(c => c.id === id) || null;
  const cfgOf = g => api.getBrainConfig(g.id) || {};
  const isAnimal = g => !!W.tablefolkPlay?.isAnimal?.(g);
  const villagers = () => api.state.characters.filter(c => !c.defeated && !c._threat && !isAnimal(c) && c !== api.player() && !W.tablefolkPlay?.isHostile?.(c));
  const animals = () => api.state.characters.filter(c => !c.defeated && isAnimal(c));
  const vid = () => villagers().map(c => c.id);
  const toast = (t, type) => api.toast(t, type || 'info');
  const narrate = t => api.narrator(t);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
  const brainUsable = () => { try { return !!W.tablefolk?.brainReady?.() && W.tablefolkBrainInfo?.()?.engine !== 'none' && !new URLSearchParams(location.search).has('art') && !!W.tablefolkLLM && W.tablefolkScenario?.active?.scn?.brain !== 'none'; } catch { return false; } };
  const aboveRails = g => (W.tablefolkAgency?.level?.(g) || 'rails') !== 'rails';
  const words = g => brainUsable() && aboveRails(g);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------------------------------------------------------------- the shrine, households, fields
  const places = () => api.state.places || [];
  function shrine() {
    const want = api.flag('god_shrine'), P = J()?.places;
    const p = (want && P?.placeNamed?.(want)) || places().find(p => /shrine|temple/.test(p.id) || /shrine|temple/.test(p.kind || '')) || places()[0];
    if (!p) return { id: 'square', x: 0, z: 0, p: null };
    const c = Array.isArray(p.center) ? { x: p.center[0], z: p.center[1] } : { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 };
    return { id: p.id, ...c, p };
  }
  // where a villager prays: outside the shrine's door, kneeling toward it, when the shrine is a building (seen from
  // above at any zoom, roof on or off); in an open shrine, in it
  function praySpot(g) {
    const sh = shrine(), P = sh.p; if (!P || P.x0 == null) return null;
    const ds = (api.state.blocks || []).filter(b => b && !b.isDisposed?.() && api.meta(b)?.type === 'door' && b.position.x >= P.x0 - 1.01 && b.position.x <= P.x1 + 1.01 && b.position.z >= P.z0 - 1.01 && b.position.z <= P.z1 + 1.01);
    if (!ds.length) return null;
    const d = ds.sort((a, b) => dist(a.position, posOf(g)) - dist(b.position, posOf(g)))[0], cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
    const ax = d.position.x - cx, az = d.position.z - cz, ox = Math.abs(ax) >= Math.abs(az) ? Math.sign(ax) : 0, oz = ox ? 0 : Math.sign(az);
    // a free square in front of the door, not one another villager is on its way to
    const taken = [...intents.values()].map(i => i.spot).filter(Boolean);
    for (const k of [2, 3]) for (const side of [0, 1, -1, 2, -2]) {
      const x = Math.round(d.position.x + ox * k + oz * side), z = Math.round(d.position.z + oz * k + ox * side), c = api.freeCell(x, z, 0);
      if (c && !J().places.inPlace(P, c.x, c.z) && !taken.some(t => t.x === c.x && t.z === c.z)) return { x: c.x, z: c.z, door: d };
    }
    return null;
  }
  const atShrine = g => { const s = shrine(); return s.p ? J().places.inPlace(s.p, posOf(g).x, posOf(g).z) || dist(posOf(g), s) < 2.5 : dist(posOf(g), s) < 2.5; };
  const groupsOf = id => W.tablefolkGroups?.of?.(id) || [];
  const household = id => { const all = W.tablefolkGroups?.all?.() || {}; const h = groupsOf(id).find(gid => /^house|household|family/.test(gid) || /\b(house|household|family)\b/i.test(all[gid]?.description || '')); return h ? W.tablefolkGroups.members(h) : [id]; };
  const households = () => Object.values(W.tablefolkGroups?.all?.() || {}).filter(g => /^house|household|family/.test(g.id) || /\b(house|household|family)\b/i.test(g.description || ''));
  const CROP = /wheat|crop|pumpkin|cabbage|carrot|corn|lettuce|turnip|potato|vegetable|tall_grass|flowers|berry|bush|plant|sapling|vine/;
  const crops = () => api.things().filter(o => CROP.test(o.type) && o.mesh && !o.mesh.isDisposed?.());
  const near = (o, x, z, r) => Math.hypot(o.x - x, o.z - z) <= r;
  const within = (x, z, r) => villagers().filter(g => dist(posOf(g), { x, z }) <= r).map(g => g.id);

  // ---------------------------------------------------------------- effects you can see
  let flareTex = null;
  function flare() {
    if (flareTex && !flareTex._disposed) return flareTex;
    const t = new (BAB().DynamicTexture)('god_flare', { width: 32, height: 32 }, api.scene, false), c = t.getContext();
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32); t.hasAlpha = true; t.update(); flareTex = t; return t;
  }
  const fxAll = new Set();
  // particles over a spot for a while: { color, color2, n, ms, y, r, up, size, life, gravity, emitter (a mesh: follows it) }
  function burst(x, z, o = {}) {
    const BB = BAB(); if (!api.scene || !BB) return null;
    const ps = new BB.ParticleSystem('god_fx', o.n || 400, api.scene); ps.particleTexture = flare();
    const y = (api.state.terrainTopY ?? 0) + (o.y ?? .2), r = o.r ?? 1;
    ps.emitter = o.emitter || new BB.Vector3(x, y, z);
    ps.minEmitBox = new BB.Vector3(-r, 0, -r); ps.maxEmitBox = new BB.Vector3(r, o.h ?? .3, r);
    const [a, b2, c] = o.color || [1, .85, .4], [d, e, f] = o.color2 || o.color || [1, .95, .7];
    ps.color1 = new BB.Color4(a, b2, c, 1); ps.color2 = new BB.Color4(d, e, f, .9); ps.colorDead = new BB.Color4(a, b2, c, 0);
    ps.minSize = (o.size || [.08, .2])[0]; ps.maxSize = (o.size || [.08, .2])[1];
    ps.minLifeTime = (o.life || [.8, 1.6])[0]; ps.maxLifeTime = (o.life || [.8, 1.6])[1];
    const up = o.up ?? 2; ps.direction1 = new BB.Vector3(-.3, up, -.3); ps.direction2 = new BB.Vector3(.3, up * 1.3, .3);
    ps.minEmitPower = .6; ps.maxEmitPower = 1.2; ps.gravity = new BB.Vector3(0, o.gravity ?? -.3, 0);
    ps.emitRate = o.rate || (o.n || 400) / ((o.ms || 1500) / 1000); ps.blendMode = o.blend === 'std' ? BB.ParticleSystem.BLENDMODE_STANDARD : BB.ParticleSystem.BLENDMODE_ADD;
    ps.start(); fxAll.add(ps);
    if (o.ms !== 0) setTimeout(() => { try { ps.stop(); } catch {} setTimeout(() => { try { ps.dispose(); } catch {} fxAll.delete(ps); }, (ps.maxLifeTime + .2) * 1000); }, o.ms || 1500);
    return ps;
  }
  // is a point on the screen (with a margin), from the active camera
  function onScreen(x, y, z, margin = .08) {
    const BB = BAB(), sc = api.scene, cam = sc?.activeCamera; if (!cam) return true;
    const eng = sc.getEngine(), w = eng.getRenderWidth(), h = eng.getRenderHeight();
    const v = BB.Vector3.Project(new BB.Vector3(x, y, z), BB.Matrix.Identity(), sc.getTransformMatrix(), cam.viewport.toGlobal(w, h));
    return v.z > 0 && v.z < 1 && v.x > w * margin && v.x < w * (1 - margin) && v.y > h * margin && v.y < h * (1 - margin);
  }
  // where an omen's ring goes so that it is seen at any zoom: over the shrine if that is in view (as high as
  // still shows), else over the middle of the view; its size follows the camera's distance
  const grow = 1.8;   // an omen's ring at its widest, times its size
  function ringSpot(x, z) {
    const c = api.state.camera, top = api.state.terrainTopY ?? 0, r = c?.radius ?? 30;
    const size = Math.max(2.4, Math.min(9, r * .11)), heights = [7, 5, 3.5, 2.2, 1.2].map(h => h * Math.max(.6, Math.min(2, r / 22)));
    // the whole ring at its widest (it grows to grow x size) must show, not only its middle
    const R = size * grow / 2, whole = (px, y, pz) => onScreen(px, top + y, pz, .1) && [[R, 0], [-R, 0], [0, R], [0, -R]].every(([dx, dz]) => onScreen(px + dx, top + y, pz + dz, .02));
    for (const [px, pz] of [[x, z], c?.target ? [c.target.x, c.target.z] : null].filter(Boolean)) for (const y of heights) if (whole(px, y, pz)) return { x: px, z: pz, y, size };
    return { x: c?.target?.x ?? x, z: c?.target?.z ?? z, y: 1.2, size };
  }
  // a ring of light in the sky over a spot that grows and fades (an omen, a vision)
  function skyRing(x, z, { color = [1, .85, .4], y = 7, ms = 5000, size = 3 } = {}) {
    const BB = BAB(); if (!api.scene || !BB) return;
    const ring = BB.MeshBuilder.CreateTorus('god_ring', { diameter: size, thickness: .18, tessellation: 48 }, api.scene);
    const mat = new BB.StandardMaterial('god_ring_mat', api.scene); mat.emissiveColor = new BB.Color3(...color); mat.disableLighting = true; mat.alpha = .95; ring.material = mat; ring.isPickable = false;
    ring.position.set(x, (api.state.terrainTopY ?? 0) + y, z);
    const beam = BB.MeshBuilder.CreateCylinder('god_beam', { height: y, diameterTop: size * .5, diameterBottom: .6, tessellation: 24 }, api.scene);
    const bm = new BB.StandardMaterial('god_beam_mat', api.scene); bm.emissiveColor = new BB.Color3(...color); bm.disableLighting = true; bm.alpha = .25; beam.material = bm; beam.isPickable = false;
    beam.position.set(x, (api.state.terrainTopY ?? 0) + y / 2, z);
    const t0 = performance.now(), obs = api.scene.onBeforeRenderObservable.add(() => {
      const u = Math.min(1, (performance.now() - t0) / ms);
      ring.rotation.y += .02; ring.scaling.setAll(1 + u * (grow - 1)); mat.alpha = .95 * (1 - u * u); bm.alpha = .28 * (1 - u);
      if (u >= 1) { api.scene.onBeforeRenderObservable.remove(obs); ring.dispose(); beam.dispose(); mat.dispose(); bm.dispose(); fxAll.delete(obs); }
    });
    fxAll.add(obs);
    burst(x, z, { color, n: 500, ms: 1800, y: y - .5, r: size / 2, up: -1.2, gravity: -1, life: [1.5, 2.5] });
  }
  // sick: green motes that follow the character
  const sickFx = new Map();
  function sickMotes(g, onOff) {
    const had = sickFx.get(g.id);
    if (!onOff) { if (had) { try { had.stop(); had.dispose(); } catch {} sickFx.delete(g.id); fxAll.delete(had); } return; }
    if (had) return;
    const ps = burst(0, 0, { emitter: g.root, color: [.45, .85, .25], color2: [.7, .9, .3], n: 60, rate: 14, ms: 0, r: .3, h: 1.4, up: .5, gravity: .1, size: [.05, .12], life: [1, 1.8], blend: 'add' });
    if (ps) sickFx.set(g.id, ps);
  }
  const badge = (g, t) => { try { api.badge(g, t); } catch {} };

  // ---------------------------------------------------------------- belief: groups, the HUD, the cards
  let groupNames = {};
  function sync(changes = []) {
    // badges for the bigger changes (a few at a time)
    for (const c of changes.filter(c => c && Math.abs(c.d) >= 3).slice(0, 6)) { const g = byId(c.id); if (g) badge(g, `${c.d > 0 ? '+' : ''}${Math.round(c.d)} belief`); }
    for (const c of changes) if (c?.id) { const g = byId(c.id); if (g) api.setBrainConfig(g.id, { belief: G.belief(c.id) }); }
    // conversions between the faithful and the doubters
    const GR = W.tablefolkGroups;
    for (const cv of G.classify()) {
      if (!GR || !byId(cv.id)) continue;
      if (cv.from && GR.get(cv.from)) GR.leave(cv.from, cv.id);
      if (cv.to && GR.get(cv.to)) GR.join(cv.to, cv.id);
      if (cv.from) { const line = cv.to === 'faithful' ? `${cv.id} now believes, and joins the faithful.` : `${cv.id} has lost faith, and stands with the doubters.`; narrate(line); toast(line, cv.to === 'faithful' ? 'success' : 'warn'); api.addMemory?.(byId(cv.id), cv.to === 'faithful' ? 'I believe in the god now.' : 'I do not believe in the god any more.', 3); }
    }
    const R = W.tablefolkResources; if (!R) return;
    try { R.set('belief', Math.round(G.average(vid()))); } catch {}
    for (const gid of Object.keys(groupNames)) try { R.set('belief_' + gid, Math.round(G.average(W.tablefolkGroups?.members(gid) || []))); } catch {}
    prayersButton();
  }
  const apply = changes => { sync(changes.filter(Boolean)); return changes; };
  function sideOf(id) { if (W.tablefolkGroups?.of?.(id)?.includes('faithful')) return 'faithful'; if (W.tablefolkGroups?.of?.(id)?.includes('doubters')) return 'doubters'; return G.side(id); }
  const beliefWord = b => b >= 80 ? 'with all your heart' : b >= 60 ? 'firmly' : b >= 45 ? 'somewhat' : b >= 30 ? 'hardly' : 'not at all';

  // ---------------------------------------------------------------- sickness, blight, drought
  const sick = new Map();   // id -> { since, until }
  function makeSick(g, why = 'the plague') {
    if (!g || sick.has(g.id) || isAnimal(g)) return false;
    sick.set(g.id, { since: gm(), until: gm() + 2160, why }); sickMotes(g, true); badge(g, 'sick');
    api.addMemory?.(g, `I fell sick with ${why}. I am weak and feverish.`, 3);
    return true;
  }
  function cure(g) { if (!g || !sick.has(g.id)) return false; sick.delete(g.id); sickMotes(g, false); badge(g, 'well again'); api.addMemory?.(g, 'The sickness left me. I am well again.', 3); return true; }
  const withered = new Map();   // mesh -> its scaling.y
  // the ground under a blight: a grey-brown stain round each withered crop, and one over the whole blighted area
  // (flat decals just above the ground, soft-edged; they go when the crops revive)
  let stainMat = null; const stains = new Map(), areas = [];   // crop mesh -> decal; [{ x, z, r, mesh }]
  function stainMaterial() {
    const BB = BAB(); if (stainMat && !stainMat.isDisposed?.()) return stainMat;
    const t = new BB.DynamicTexture('god_blight_tex', { width: 128, height: 128 }, api.scene, true), c = t.getContext();
    c.clearRect(0, 0, 128, 128);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {   // blotches, denser in the middle
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), .7) * 46, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 10 + rnd() * 18;
      const g = c.createRadialGradient(x, y, 0, x, y, r), k = .85 * (1 - d / 64);
      g.addColorStop(0, `rgba(${62 + rnd() * 26 | 0},${54 + rnd() * 16 | 0},${34 + rnd() * 12 | 0},${k.toFixed(2)})`); g.addColorStop(.6, `rgba(70,60,38,${(k * .6).toFixed(2)})`); g.addColorStop(1, 'rgba(70,60,38,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    t.hasAlpha = true; t.update();
    const m = new BB.StandardMaterial('god_blight_mat', api.scene); m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.specularColor = new BB.Color3(0, 0, 0);
    m.emissiveColor = new BB.Color3(.05, .04, .02); m.zOffset = -3; m.backFaceCulling = false; m.disableDepthWrite = true;
    return (stainMat = m);
  }
  function decal(x, z, size) {
    const BB = BAB(); if (!api.scene || !BB) return null;
    const g = BB.MeshBuilder.CreateGround('god_blight', { width: size, height: size }, api.scene);
    g.material = stainMaterial(); g.isPickable = false; g.position.set(x, (api.state.terrainTopY ?? 0) + .035, z); g.rotation.y = Math.random() * Math.PI * 2;
    g.visibility = 0; const t0 = performance.now(), obs = api.scene.onBeforeRenderObservable.add(() => { const u = Math.min(1, (performance.now() - t0) / 1500); g.visibility = u; if (u >= 1 || g.isDisposed()) api.scene.onBeforeRenderObservable.remove(obs); });
    return g;
  }
  function stainArea(x, z, r) { const m = decal(x, z, r * 2.2); if (m) areas.push({ x, z, r, mesh: m }); }
  function cleanStains() {
    for (const [cm, d] of [...stains]) if (!withered.has(cm) || cm.isDisposed?.()) { d.dispose(); stains.delete(cm); }
    for (let i = areas.length - 1; i >= 0; i--) { const a = areas[i]; if (![...withered.keys()].some(m => !m.isDisposed?.() && Math.hypot(m.position.x - a.x, m.position.z - a.z) <= a.r + .5)) { a.mesh.dispose(); areas.splice(i, 1); } }
  }
  function clearStains() { for (const d of stains.values()) d.dispose(); stains.clear(); for (const a of areas) a.mesh.dispose(); areas.length = 0; try { stainMat?.diffuseTexture?.dispose(); stainMat?.dispose(); } catch {} stainMat = null; }
  function wither(o) { if (!o.mesh || withered.has(o.mesh)) return; withered.set(o.mesh, o.mesh.scaling.y); o.mesh.scaling.y *= .4; const m = api.meta(o.mesh); if (m?.opts && m.opts.stock != null) m.opts.stock = 0; try { const d = decal(o.x, o.z, 1.6); if (d) stains.set(o.mesh, d); } catch (e) { console.warn('[god] stain', e); } }
  function revive(o, add = 1) { if (o.mesh && withered.has(o.mesh)) { o.mesh.scaling.y = withered.get(o.mesh); withered.delete(o.mesh); } const m = api.meta(o.mesh); if (m?.opts && m.opts.stock != null) m.opts.stock = (+m.opts.stock || 0) + add; cleanStains(); return true; }
  const blightCount = () => [...withered.keys()].filter(m => !m.isDisposed?.()).length;
  let droughtUntil = 0;
  function setDrought(minutes) { droughtUntil = minutes ? gm() + minutes : 0; api.flag('drought', !!minutes); }

  // ---------------------------------------------------------------- powers
  // the effect of each, apart from paying: used by the bar (tablefolkPowers.use), and free by a decree's anger
  const justified = who => {
    const t = gm(), id = who?.id || who;
    return (W.tablefolkDemands?.list?.() || []).some(d => (d.refused || []).some(r => r.who === id || household(id).includes(r.who)) && t - (d.created || 0) < 2880)
      || (W.tablefolkDemands?.list?.() || []).some(d => d.status === 'missed' && t - (d.closed || 0) < 720 && (d.of === 'all' || d.of?.id === id || groupsOf(id).includes(d.of?.group)));
  };
  function after(name, target = {}, extra = {}) {
    const x = target.x ?? (target.who ? posOf(target.who).x : shrine().x), z = target.z ?? (target.who ? posOf(target.who).z : shrine().z);
    const who = target.who && !isAnimal(target.who) && !target.who._threat ? target.who.id : null;
    const threat = !!(target.who && (target.who._threat || W.tablefolkPlay?.isHostile?.(target.who))) || !!extra.threat;
    const t = { who, members: extra.members || [], near: extra.near || within(x, z, 7), threat, place: target.place, group: target.group };
    const r = G.onPower(name, t, { justified: extra.justified ?? (who ? justified(who) : false), household: who ? household(who) : extra.household || [], everyone: vid() });
    apply(r.changes);
    for (const p of r.answered) { const g = byId(p.who); toast(`${p.who}'s prayer is answered (${name.replace(/_/g, ' ')}).`, 'success'); if (g) { api.addMemory?.(g, `I prayed for ${needWord(p.need)} and the god answered: ${name.replace(/_/g, ' ')}.`, 4); thanks.set(g.id, gm()); } }
    if (r.cruel) { narrate(pick(['The village whispers: why would the god do this to them?', 'Cruelty without reason. Faith wavers in the village.'])); for (const id of vid()) api.addMemory?.(byId(id), `The god sent ${name.replace(/_/g, ' ')} for no reason anyone knows.`, 2.5); }
    if (r.prophecy) { narrate(`The omen came true: "${r.prophecy.text}". The faithful are vindicated.`); toast('The prophecy came true.', 'success'); }
    W.dispatchEvent(new CustomEvent('tablefolk-god', { detail: { what: 'power', name, answered: r.answered.map(p => p.id), cruel: r.cruel, prophecy: r.prophecy?.id || null } }));
    return r;
  }
  const thanks = new Map();   // id -> when it last had a prayer answered (it may give thanks)
  const placeName = t => t.place ? ' on the ' + t.place : '';
  const EFFECT = {
    rain(t) {
      api.weather('rain', { area: { x: t.x, z: t.z, r: 8 }, duration: 60, intensity: .8 });
      let grew = 0; for (const o of crops()) if (near(o, t.x, t.z, 8)) { revive(o, 1); grew++; }
      setDrought(0);
      return `Rain falls${placeName(t)}${grew ? '; the crops drink it' : ''}.`;
    },
    drought(t) {
      api.weather('drought', { duration: 90, intensity: .6 }); setDrought(1440);
      for (const id of vid()) api.addMemory?.(byId(id), 'The sky burns and no rain comes. The wells are low.', 2);
      return 'The sky turns to brass. A drought settles on the land.';
    },
    storm(t) {
      api.weather('storm', { area: { x: t.x, z: t.z, r: 10 }, duration: 60, intensity: 1 }); setDrought(0);
      for (let i = 0; i < 3; i++) setTimeout(() => { const c = api.freeCell(t.x + (Math.random() * 10 - 5), t.z + (Math.random() * 10 - 5), 3); if (c && on) W.tablefolkSpells?.strike?.(c.x, c.z); }, 600 + i * 1700);
      for (const id of within(t.x, t.z, 14)) api.addMemory?.(byId(id), 'A storm broke over us: thunder and lightning out of a clear sky.', 2.5);
      return `A storm breaks${placeName(t)}.`;
    },
    fog() {
      api.weather('fog', { duration: 90, intensity: .9 });
      const fled = W.tablefolkThreats?.retreat?.('lost in the god\'s fog') || 0;
      return fled ? 'A thick fog rolls in; the beasts lose their way and slink off.' : 'A thick fog rolls in over the village.';
    },
    bless_field(t) {
      let n = 0; for (const o of crops()) if (near(o, t.x, t.z, 4.5)) { revive(o, 2); n++; }
      burst(t.x, t.z, { color: [1, .9, .35], color2: [.8, 1, .4], n: 700, ms: 2200, r: 4, up: 1.6, life: [1, 2] });
      api.flag('blight', blightCount() > 0);
      for (const id of within(t.x, t.z, 8)) api.addMemory?.(byId(id), 'Golden light fell on the field and the crops stood tall and heavy.', 3);
      return n ? `Golden light falls${placeName(t)}: ${n} crop${n > 1 ? 's' : ''} grow tall and heavy.` : { fail: 'There are no crops there' };
    },
    async bless_herd(t) {
      const herd = animals().filter(a => dist(posOf(a), t) <= 7);
      if (!herd.length) return { fail: 'There are no animals there' };
      for (const a of herd) { badge(a, '♥'); burst(posOf(a).x, posOf(a).z, { color: [1, .75, .85], n: 120, ms: 900, r: .5, up: 1.4 }); }
      const kinds = herd.map(a => a.charModel), kind = kinds.sort((a, b) => kinds.filter(k => k === b).length - kinds.filter(k => k === a).length)[0];
      let born = null;
      if (animals().length < 9) { const c = api.freeCell(posOf(herd[0]).x, posOf(herd[0]).z, 3); if (c) born = await api.spawn(kind === 'sheep' ? 'lamb' : kind === 'cow' ? 'calf' : 'young_' + kind, kind, c.x, c.z, { personality: `A young ${kind}, born under the god's blessing.` }); }
      const herder = villagers().sort((a, b) => dist(posOf(a), t) - dist(posOf(b), t))[0];
      const gift = kind === 'sheep' ? 'wool' : kind === 'cow' ? 'milk' : 'meat';
      if (herder && dist(posOf(herder), t) < 10) { api.give(herder, gift, 2); badge(herder, `+2 ${gift}`); api.addMemory?.(herder, `The god blessed the ${kind}s: ${born ? 'a young one was born, and ' : ''}they gave ${gift} as never before.`, 3); }
      return `The god blesses the ${kind === 'sheep' ? 'flock' : kind + 's'}${born ? ': a young one is born' : ''}.`;
    },
    heal(t) {
      const g = t.who; if (!g || isAnimal(g) || g._threat) return { fail: 'Choose one of the villagers' };
      const was = sick.has(g.id); cure(g); try { api.combat.heal(g, 99); } catch {}
      burst(posOf(g).x, posOf(g).z, { color: [.75, 1, .85], color2: [1, 1, 1], n: 260, ms: 1200, r: .5, up: 1.8 });
      api.addMemory?.(g, 'A cool light washed over me and my pain was gone. The god healed me.', 4);
      return `${g.id} is healed${was ? ' of the plague' : ''}.`;
    },
    gift_food(t) {
      const g = t.who; if (!g || isAnimal(g) || g._threat) return { fail: 'Choose one of the villagers' };
      api.give(g, 'bread', 3); badge(g, '+3 bread'); api.sound('pickup', g);
      burst(posOf(g).x, posOf(g).z, { color: [1, .85, .45], n: 200, ms: 900, r: .5, up: 1.5 });
      api.addMemory?.(g, 'Three warm loaves appeared in my hands from nowhere. A gift from the god.', 4);
      return `Three warm loaves appear in ${g.id}'s hands.`;
    },
    smite(t) {
      const g = t.who; if (!g) return { fail: 'Choose someone to strike' };
      const p = posOf(g); W.tablefolkSpells?.strike?.(p.x, p.z);
      const threat = !!(g._threat || W.tablefolkPlay?.isHostile?.(g));
      setTimeout(() => { try { api.combat.hurt(g, threat ? 99 : 4, 'the god', 'a bolt from the sky'); } catch (e) { console.warn('[god] smite', e); } }, 180);
      for (const id of within(p.x, p.z, 10)) if (id !== g.id) api.addMemory?.(byId(id), threat ? `The god struck down the ${g.id} with lightning.` : `The god struck ${g.id} with lightning!`, 3);
      if (!threat) api.addMemory?.(g, 'Lightning struck me out of the sky. The god is angry with me.', 5);
      return threat ? `Lightning strikes the ${g.id} down.` : `Lightning strikes ${g.id}.`;
    },
    plague(t) {
      const g = t.who; if (!g || isAnimal(g) || g._threat) return { fail: 'Choose one of the villagers: their household falls sick' };
      const hh = household(g.id).map(byId).filter(Boolean); let n = 0;
      for (const c of hh) if (makeSick(c)) n++;
      const p = posOf(g); burst(p.x, p.z, { color: [.4, .75, .2], color2: [.6, .7, .3], n: 400, ms: 2000, r: 2.5, up: .6, blend: 'std', size: [.15, .35], life: [1.5, 2.5] });
      return n ? `A sickness falls on ${hh.length > 1 ? 'the household of ' + g.id : g.id}.` : { fail: `${g.id}'s household is already sick` };
    },
    blight(t) {
      let n = 0; for (const o of crops()) if (near(o, t.x, t.z, 4.5) && !withered.has(o.mesh)) { wither(o); n++; }
      if (n) stainArea(t.x, t.z, 4.5);
      burst(t.x, t.z, { color: [.42, .36, .18], color2: [.28, .3, .2], n: 900, ms: 2600, r: 4, up: .7, blend: 'std', size: [.3, .7], life: [1.6, 2.8] });
      api.flag('blight', blightCount() > 0);
      for (const id of within(t.x, t.z, 9)) api.addMemory?.(byId(id), 'A grey rot came over the crops overnight. They wither on the stalk.', 3);
      return n ? `A blight withers ${n} crop${n > 1 ? 's' : ''}${placeName(t)}.` : { fail: 'There are no living crops there' };
    },
    async beast() {
      const gr = await W.tablefolkThreats?.now?.('raid', { who: 'wolf', name: 'beast', count: 2, hp: 8, when: 'any', announce: 'Two great beasts come out of the wild, eyes burning!' });
      return gr ? 'The god looses beasts on the village.' : { fail: 'No beasts came' };
    },
    async dream(t) {
      const g = t.who; if (!g || isAnimal(g) || g._threat) return { fail: 'Choose one of the villagers' };
      const text = t.words ?? await ask(`💭 A dream for ${g.id}: what do you tell them?`, 'Go to the temple at dawn and listen.');
      if (!text) return { fail: 'No dream was sent' };
      dreams.set(g.id, { text, at: gm() });
      burst(posOf(g).x, posOf(g).z, { color: [.7, .7, 1], color2: [1, .9, 1], n: 160, ms: 1400, r: .4, y: 1.6, up: .8 });
      api.addMemory?.(g, `In a dream the god spoke to me: "${text}"`, 5);
      const cfg = cfgOf(g); api.setBrainConfig(g.id, { pendingChat: (cfg.pendingChat || []).concat(`[dream] The god spoke to you in a dream: "${text}"`).slice(-6) });
      setTimeout(() => dreamt(g, text).catch(e => console.warn('[god] dream', e)), 1200);
      return { text: `${g.id} dreams.`, dream: true };
    },
    async omen(t) {
      const text = t?.words ?? await ask('☄ An omen for all. Words to go with it (a prophecy), or leave it empty:', 'rain will come to the fields', true);
      if (text === null) return { fail: 'No omen was sent' };
      const s = shrine(), at = ringSpot(s.x, s.z); skyRing(at.x, at.z, { y: at.y, size: at.size, ms: 6000 });
      const r = G.omen(text || ''); apply(r.changes);
      for (const id of vid()) api.addMemory?.(byId(id), `A ring of light burned in the sky over the ${s.id}${text ? ': ' + text : ''}.`, 3);
      setTimeout(() => readOmen(r.omen).catch(e => console.warn('[god] omen', e)), 1500);
      return `A ring of fire burns in the sky over the ${s.id}${text ? `. Words hang in the air: "${text}"` : ''}.`;
    },
  };
  const POWERS = {
    rain: { label: 'Rain', icon: '🌧', cost: 6, target: 'place', cooldown: 15, description: 'Rain on a place: the crops there grow, a drought ends. Answers prayers for rain.' },
    drought: { label: 'Drought', icon: '☀', cost: 10, target: 'none', cooldown: 40, description: 'A day without rain: crops wither, hunger grows.' },
    storm: { label: 'Storm', icon: '⛈', cost: 8, target: 'place', cooldown: 30, description: 'Thunder, lightning and rain over a place. It frightens, and waters.' },
    fog: { label: 'Fog', icon: '🌫', cost: 4, target: 'none', cooldown: 30, description: 'A thick fog: beasts and raiders lose their way. Answers prayers for safety.' },
    bless_field: { label: 'Bless field', icon: '🌾', cost: 5, target: 'place', cooldown: 10, description: 'The crops near a square grow tall and any blight lifts. Answers prayers for food and harvest.' },
    bless_herd: { label: 'Bless herd', icon: '🐑', cost: 6, target: 'place', cooldown: 20, description: 'The animals near a square thrive: a young one is born, the herder gets wool or milk.' },
    heal: { label: 'Heal', icon: '✚', cost: 4, target: 'character', cooldown: 6, description: 'Heal a villager of wounds and sickness. Answers prayers for healing.' },
    gift_food: { label: 'Gift of food', icon: '🍞', cost: 3, target: 'character', cooldown: 6, description: 'Three loaves appear in someone’s hands. Answers prayers for food.' },
    smite: { label: 'Smite', icon: '⚡', cost: 8, target: 'character', cooldown: 12, description: 'Lightning on someone: kills a beast or raider, wounds a villager (cruel unless they defied you).' },
    plague: { label: 'Plague', icon: '☣', cost: 14, target: 'character', cooldown: 40, description: 'A household falls sick: they cannot work, grow hungry, and it spreads unless healed.' },
    blight: { label: 'Blight', icon: '🥀', cost: 10, target: 'place', cooldown: 30, description: 'The crops near a square wither.' },
    beast: { label: 'Beast', icon: '🐺', cost: 12, target: 'none', cooldown: 60, description: 'Two beasts come out of the wild.' },
    dream: { label: 'Dream', icon: '💭', cost: 2, target: 'character', cooldown: 5, description: 'Your words, privately, in someone’s dream.' },
    omen: { label: 'Omen', icon: '☄', cost: 6, target: 'none', cooldown: 30, description: 'A sign in the sky for all; with words it is a prophecy (kept: belief rises; broken: it falls).' },
  };
  const powers = {};
  for (const [name, p] of Object.entries(POWERS)) powers[name] = { ...p, cost: { mana: p.cost }, async run(t, ctx) { return runPower(name, t || {}, {}); } };
  async function runPower(name, t, { free = false, anger = false } = {}) {
    let r; try { r = await EFFECT[name](t || {}); } catch (e) { console.warn('[god]', name, e); return { fail: e.message || String(e) }; }
    if (!r || r.fail) return r || false;
    const text = typeof r === 'string' ? r : r.text;
    // what it meant to the village (a decree's anger is weighed by the decree's own rules)
    if (!anger) after(name, t, { members: name === 'plague' && t.who ? household(t.who.id) : [] });
    if (free) { try { narrate(text); } catch {} }
    return text;
  }

  // ---------------------------------------------------------------- asking the player for words (dream, omen)
  function ask(question, placeholder, allowEmpty = false) {
    return new Promise(res => {
      B().pick(`<span>${esc(question)}</span><input id="tfGodWords" type="text" placeholder="${esc(placeholder)}" /><button type="button" class="go" data-pick="ok">send</button><button type="button" data-pick="cancel">cancel</button>`,
        { ok: () => { const v = document.getElementById('tfGodWords')?.value.trim(); if (!v && !allowEmpty) return; B().pick(null); res(v || ''); }, enter: el => { const v = el.value.trim(); if (!v && !allowEmpty) return; B().pick(null); res(v || ''); }, cancel: () => { B().pick(null); res(null); } });
      setTimeout(() => document.getElementById('tfGodWords')?.focus(), 30);
    });
  }

  // ---------------------------------------------------------------- the brain, when one is loaded (above rails)
  async function say1(g, system, user, max = 60) {
    try {
      W.dispatchEvent(new CustomEvent('tablefolk-model-call', { detail: { agentId: g.id, kind: 'god' } }));
      const out = await W.tablefolkLLM.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: max, temperature: .7, agentId: g.id, thinking: false });
      // (stage directions in brackets or asterisks go: a small model likes to narrate before it speaks)
      let t = String(out?.choices?.[0]?.message?.content || '').replace(/\([^)]*\)|\*[^*]*\*/g, ' ').replace(/[(*][^)*]*$/, ' ').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
      t = t.replace(/^(\w+\s*:|say\(|")+/i, '').replace(/["')]+\s*$/, '').replace(/^["“]|["”]$/g, '').trim();
      return t.length > 3 ? t.slice(0, 200) : null;
    } catch (e) { console.warn('[god] brain', e); return null; }
  }
  const who = g => { const c = cfgOf(g); return `You are ${g.id}. ${String(c.personality || '').slice(0, 220)} You believe in the god ${beliefWord(G.belief(g.id))} (${Math.round(G.belief(g.id))} of 100)${sideOf(g.id) ? ', one of the ' + sideOf(g.id) : ''}.`; };
  // fixed outcomes from words: a decider (window.tablefolkDecider, when a page has loaded one), else the menus' matcher (keywords, meaning, then the brain)
  async function choose(text, items, question = 'Which fits these words best?') {
    try { const D = W.tablefolkDecider; if (D?.decide) { const r = await D.decide(text, { q: { type: 'choice', instructions: question, criteria: Object.fromEntries(items.map(i => [i.id, i.label])) } }); if (r?.q?.choice && (r.q.confidence ?? 1) >= .4) return r.q.choice; } } catch (e) { console.warn('[god] decider', e); }
    try { const m = await W.tablefolkMenu?.match?.({ items }, text); if (m?.item?.id) return m.item.id; } catch {}
    const t = String(text).toLowerCase(); for (const i of items) if ((i.keywords || []).some(k => t.includes(k))) return i.id;
    return null;
  }

  // ---------------------------------------------------------------- prayers
  const NEED = { food: 'food', heal: 'healing', rain: 'rain', safety: 'safety', harvest: 'a good harvest', sign: 'a sign', thanks: 'nothing: to give thanks', strength: 'strength to do as the god asks' };
  const needWord = n => NEED[n] || n;
  const PRAYER = {
    food: { faithful: ['Merciful one, my belly is empty and the stores are bare. Send us bread.', 'God of the hearth, feed your servant, I beg you.'], doubters: ['If anyone is listening... I am hungry. Prove me wrong.', 'They say you provide. I have had nothing all day.'] },
    heal: { faithful: ['Great one, the fever burns in me. Heal me and I will praise you.', 'Lay your hand on us, the sickness is in our house.'], doubters: ['I hurt. If you are real, take it away.', 'Heal me, and I will believe. That is my bargain.'] },
    rain: { faithful: ['The fields crack and the well is low. Send rain, we beg you.', 'Open the sky, merciful one, the crops are dying.'], doubters: ['Rain. Just rain. Is that too much to ask of a god?'] },
    safety: { faithful: ['Beasts are at the edge of the village! Protect us!', 'Strike them down, great one, before they reach the children!'], doubters: ['Wolves at the door, and the priest says pray. Fine. I am praying.'] },
    harvest: { faithful: ['The rot is in the crops. Lift the blight, we beg you.', 'Bless our field, great one; it is all we have.'], doubters: ['The field is dying. If you made this, unmake it.'] },
    sign: { faithful: ['Show us a sign, so the doubters may see.'], doubters: ['Show me one sign. Just one. Then I will kneel.', 'Ada says you are watching. Prove it.'] },
    thanks: { faithful: ['Thank you, great one, for all you give.', 'I come only to give thanks.'], doubters: ['I suppose... thank you. If it was you.'] },
    strength: { faithful: ['Give me strength to do as you have asked.', 'Help us meet your demand in time.'], doubters: ['You ask a lot of us. Help, then.'] },
  };
  const intents = new Map();   // id -> { need, at } (on its way to pray)
  function factsOf(g) {
    const m = W.tablefolkMind?.mindOf?.(g) || {}, c = cfgOf(g);
    const hurt = c.maxHp ? Math.max(0, 1 - (c.hp ?? c.maxHp) / c.maxHp) : 0;
    return { hunger: m.hunger || 0, sick: sick.has(g.id), hurt, drought: droughtUntil > gm(), blight: blightCount() > 0 && (/farm|garden|field/.test(J()?.jobOf?.(g)?.id || '') || Math.random() < .5),
      raiders: (W.tablefolkThreats?.active?.() || []).length, plagueNear: household(g.id).some(id => id !== g.id && sick.has(id)), demand: (W.tablefolkDemands?.forCharacter?.(g) || []).length > 0,
      thanks: thanks.has(g.id) && gm() - thanks.get(g.id) < 240, k: .22 };
  }
  // the urge to pray: every game quarter hour; at most four prayers waiting at once
  function prayTick() {
    for (const [id, it] of [...intents]) if (gm() - it.at > 480 || !byId(id)) intents.delete(id);
    for (const g of villagers()) {
      if (G.open().length + intents.size >= 4) break;
      if (intents.has(g.id) || councilNow?.members?.includes(g.id)) continue;
      const w = G.maybePray(g.id, factsOf(g));
      if (w) { intents.set(g.id, { need: w.need, at: gm() }); W.tablefolkJobs?.addNews?.(g.id, `${g.id} goes to the ${shrine().id} to pray for ${needWord(w.need)}`, 'news'); }
    }
  }
  async function prayerWords(g, need) {
    const s = sideOf(g.id) === 'doubters' ? 'doubters' : 'faithful';
    if (words(g)) { const t = await say1(g, who(g), `You kneel at the ${shrine().id} and pray to the god for ${needWord(need)}. Say your prayer: one or two short sentences, in your own words, nothing else.`, 50); if (t) return { text: t, by: 'model' }; }
    return { text: pick(PRAYER[need]?.[s] || PRAYER.thanks.faithful), by: 'code' };
  }
  // the work of praying: to the shrine, kneel, speak, and (the faithful with food to spare) leave an offering
  async function prayWork(g, s, j) {
    const it = intents.get(g.id); if (!it) return null;
    const k = K(), sh = shrine();
    if (it.spot === undefined) it.spot = praySpot(g);
    const there = it.spot ? dist(posOf(g), it.spot) < 1.3 : atShrine(g);
    if (!there) {
      if ((it.tries = (it.tries || 0) + 1) > 12) { intents.delete(g.id); return null; }
      k.setDoing(g, s, `going to the ${sh.id} to pray`);
      const spot = it.spot || (sh.p ? J().places.spotIn(sh.p, g) : sh);
      const r = await k.goTo(g, s, spot?.x ?? sh.x, spot?.z ?? sh.z, 'the ' + sh.id);
      if (r.fail) { if (it.spot) { it.spot = null; return { ms: 500 }; } intents.delete(g.id); return null; }
      return { ms: r.ms || 2500 };
    }
    intents.delete(g.id);
    k.setDoing(g, s, `praying for ${needWord(it.need)}`);
    // kneeling (a bow held) toward the door, and a column of light over them while they pray
    if (it.spot?.door) g._faceAt = { node: it.spot.door, until: performance.now() + 6000 };
    try { api.playClip(g, 'bow', true); setTimeout(() => { if (g.anim === 'bow') api.playClip(g, 'idle', true); }, 3600); } catch {}
    burst(posOf(g).x, posOf(g).z, { color: [1, .93, .62], color2: [1, 1, .85], n: 220, ms: 3200, r: .22, y: .2, up: 2.6, gravity: .25, life: [1.1, 1.7], size: [.06, .15] });
    const w = await prayerWords(g, it.need);
    const p = G.addPrayer({ who: g.id, need: it.need, text: w.text, at: posOf(g), place: sh.id }); p.by = w.by;
    try { api.say(g, w.text, true); } catch {}
    // an offering from the faithful who carry food to spare
    if (G.belief(g.id) >= 60) { const inv = api.inventory(g); const it2 = (inv?.items || []).find(i => (i.qty ?? 1) >= 2 && G.offeringValue(i.name) >= 1 && /bread|apple|wheat|fish|meat|cheese|milk|wool|ale|honey/.test(i.name)); if (it2 && api.take(g, it2.name, 1)) { const v = G.offeringValue(it2.name); api.resource('mana', v); badge(g, `offers ${it2.name}`); W.tablefolkJobs?.addNews?.(g.id, `${g.id} left ${it2.name} at the ${sh.id} as an offering`, 'news'); } }
    // a demand to pray at the shrine counts it
    for (const d of W.tablefolkDemands?.forCharacter?.(g) || []) if (d.template === 'god_worship') (d.data.prayed ||= []).includes(g.id) || d.data.prayed.push(g.id);
    W.dispatchEvent(new CustomEvent('tablefolk-god', { detail: { what: 'prayer', id: p.id, who: g.id, need: p.need, text: p.text } }));
    prayersButton();
    return { ms: 3500 };
  }

  // ---------------------------------------------------------------- the prayers list (the bar)
  let panel = null, shownKey = '';   // 'prayers' | 'village' | null
  function prayersButton() {
    const n = G.open().length;
    try { B()?.set?.('god:prayers', { label: n ? `Prayers (${n})` : 'Prayers' }); } catch {}
    // the open list follows when prayers come or go (not on every tick: its buttons would never hold still)
    const key = panel + ':' + G.open().map(p => p.id).join() + ':' + (panel === 'village' ? sick.size + ':' + vid().map(id => Math.round(G.belief(id))).join() : '');
    if (panel && key !== shownKey) { const el = document.getElementById('tfPickBar'); if (el && !el.hidden && el.querySelector('.godPanel')) showPanel(panel); }
  }
  function bestPower(p) {
    const list = (FITS[p.need] || []).filter(n => n !== 'dream' && W.tablefolkPowers?.list?.().some(x => x.name === n));
    return list.find(n => POWERS[n].target === 'character') || list[0] || null;
  }
  function targetFor(power, p) {
    const g = byId(p.who); if (!g) return null;
    if (power === 'smite') { const r = (W.tablefolkThreats?.active?.() || []).sort((a, b) => dist(posOf(a), posOf(g)) - dist(posOf(b), posOf(g)))[0]; return r ? { who: r, x: Math.round(posOf(r).x), z: Math.round(posOf(r).z) } : null; }
    if (POWERS[power].target === 'character') return { who: g, x: Math.round(posOf(g).x), z: Math.round(posOf(g).z) };
    if (POWERS[power].target === 'place') { const home = g._job?.work || g._job?.home; const c = home?.x0 != null && /field|garden|farm/.test(home.kind || home.id) ? { x: Math.round((home.x0 + home.x1) / 2), z: Math.round((home.z0 + home.z1) / 2) } : { x: Math.round(posOf(g).x), z: Math.round(posOf(g).z) }; return { ...c, place: J()?.places?.placeAt?.(c.x, c.z)?.id || null }; }
    return {};
  }
  function showPanel(kind = 'prayers') {
    panel = kind; shownKey = kind + ':' + G.open().map(p => p.id).join() + ':' + (kind === 'village' ? sick.size + ':' + vid().map(id => Math.round(G.belief(id))).join() : '');
    const tabs = `<div class="gtabs"><button type="button" data-pick="t:prayers"${kind === 'prayers' ? ' class="go"' : ''}>prayers</button><button type="button" data-pick="t:village"${kind === 'village' ? ' class="go"' : ''}>the village</button><span style="flex:1"></span><button type="button" data-pick="close">close</button></div>`;
    const on = { 't:prayers': () => showPanel('prayers'), 't:village': () => showPanel('village'), close: () => { panel = null; B().pick(null); }, cancel: () => { panel = null; B().pick(null); } };
    let body = '';
    if (kind === 'prayers') {
      const list = G.open().slice(-6).reverse();
      body = list.length ? list.map(p => {
        const pw = bestPower(p), cost = pw ? POWERS[pw].cost : 0, left = Math.max(0, Math.round((p.until - gm()) / 60 * 10) / 10);
        on['l:' + p.id] = () => look(byId(p.who));
        if (pw && targetFor(pw, p)) on['a:' + p.id] = async () => { const r = await W.tablefolkPowers.use(pw, targetFor(pw, p)); if (r?.fail) toast(r.fail, 'warn'); showPanel('prayers'); };
        on['d:' + p.id] = async () => { const g = byId(p.who); if (!g) return; const r = await W.tablefolkPowers.use('dream', { who: g, x: 0, z: 0 }); if (!r?.fail) { apply(G.answer(p.id, { how: 'dream' }).changes); toast(`${p.who} will dream of you.`); } showPanel('prayers'); };
        on['s:' + p.id] = () => { apply(G.answer(p.id, { how: 'silence' }).changes); api.addMemory?.(byId(p.who), 'I prayed and the god was silent.', 2); showPanel('prayers'); };
        return `<div class="gp"><button type="button" data-pick="l:${p.id}" title="look">👁</button><span class="gq"><b>${esc(p.who)}</b> <i>(${esc(sideOf(p.who) || 'undecided')}, ${Math.round(G.belief(p.who))})</i> asks for <b>${esc(needWord(p.need))}</b>: “${esc(p.text.slice(0, 110))}” <small>${left} h left</small></span>
          <span class="ga">${pw && on['a:' + p.id] ? `<button type="button" class="go" data-pick="a:${p.id}">${POWERS[pw].icon} ${esc(POWERS[pw].label)} (${cost})</button>` : ''}<button type="button" data-pick="d:${p.id}">💭 dream (2)</button><button type="button" data-pick="s:${p.id}">🤐 silence</button></span></div>`;
      }).join('') : `<div class="gp"><small>No one is praying now. Villagers pray at the ${esc(shrine().id)} when hunger, sickness, drought, blight or beasts weigh on them.</small></div>`;
      const past = G.prayers().filter(p => p.status !== 'open').slice(-3).reverse();
      if (past.length) body += `<div class="gp"><small>lately: ${past.map(p => `${esc(p.who)} (${esc(needWord(p.need))}): ${esc(p.status === 'answered' ? 'answered by ' + String(p.by).replace(/_/g, ' ') : p.status)}`).join(' · ')}</small></div>`;
    } else {
      const rows = villagers().sort((a, b) => G.belief(b.id) - G.belief(a.id)).map(g => { const b = Math.round(G.belief(g.id)); on['l:' + g.id] = () => look(g);
        return `<div class="gp"><button type="button" data-pick="l:${g.id}">👁</button><b>${esc(g.id)}</b> <span class="bar"><span style="width:${b}%;background:${b >= 60 ? '#e8c25a' : b <= 35 ? '#8a8fa0' : '#c9a36a'}"></span></span> ${b} <i>${esc(sideOf(g.id) || 'undecided')}${groupsOf(g.id).filter(x => !['faithful', 'doubters'].includes(x)).map(x => ', ' + (W.tablefolkGroups.get(x)?.name || x)).join('')}</i>${sick.has(g.id) ? ' <b style="color:#9fd36a">sick</b>' : ''}${intents.has(g.id) ? ' <small>going to pray</small>' : ''}</div>`; }).join('');
      const d = (W.tablefolkDemands?.list?.() || []).filter(d => d.template?.startsWith('god_') || d.data?.god).slice(-3).reverse();
      body = rows + (d.length ? `<div class="gp"><small>decrees: ${d.map(x => `${esc(x.text)} <b>${esc(x.status)}</b>${x.status === 'open' ? ' ' + Math.round(x.progress * 100) + '%' : ''}`).join(' · ')}</small></div>` : '');
    }
    B().pick(`<div class="godPanel">${tabs}${body}</div>`, on);
  }
  function look(g) { if (!g) return; const c = api.state.camera; if (!c) return; api.state.followAvatar = false; c.setTarget(new (BAB().Vector3)(posOf(g).x, 0, posOf(g).z)); c.radius = Math.min(c.radius, 16); badge(g, '👁'); }

  // ---------------------------------------------------------------- dreams and omens: what the village makes of them
  const dreams = new Map();   // id -> { text, at }
  const DREAM = [
    { id: 'demand', label: 'the god wants something brought, built or done', keywords: ['bring', 'offer', 'sacrific', 'build', 'pray', 'must', 'require', 'want', 'demand'] },
    { id: 'warning', label: 'a warning of danger to come', keywords: ['beware', 'danger', 'coming', 'flee', 'wolves', 'beast', 'storm', 'plague', 'death'] },
    { id: 'go', label: 'go to a place', keywords: ['go to', 'walk to', 'visit', 'travel'] },
    { id: 'comfort', label: 'comfort, love or reassurance', keywords: ['love', 'safe', 'fear not', 'peace', 'well', 'heal', 'watch over', 'forgive'] },
  ];
  async function dreamt(g, text) {
    const kind = await choose(text, DREAM, 'What does the dream ask of the dreamer?') || 'comfort';
    let line = null;
    if (words(g)) line = await say1(g, who(g), `Last night you dreamed the god said to you: "${text}". Tell the people near you about it, and what you will do: one or two sentences, nothing else.`, 60);
    line ||= kind === 'demand' ? `I had a dream. The god spoke to me: "${text}" We must do it.` : kind === 'warning' ? `I dreamed a warning from the god: "${text}" Be careful, all of you.` : kind === 'go' ? `The god came to me in a dream: "${text}" I am going.` : pick([`I dreamed the god spoke to me: "${text}" I feel... at peace.`, `A dream, so real: "${text}" The god knows my name.`]);
    try { api.say(g, line, true); } catch {}
    // (its belief bonus came with the power: core onPower('dream'), one a dream)
    W.tablefolkJobs?.addNews?.(g.id, `${g.id} dreamed the god spoke: "${text}"`, 'news');
    for (const id of within(posOf(g).x, posOf(g).z, 8)) if (id !== g.id) api.addMemory?.(byId(id), `${g.id} says the god spoke in a dream: "${text}"`, 2);
    if (kind === 'demand') { const d = parseDecree(text, decreeCtx()); if (!d.error) await decree(text, { via: g.id, parsed: d, council: false }); }
    else if (kind === 'go') { const pl = places().find(p => new RegExp(`\\b${p.id}\\b`, 'i').test(text)); if (pl) api.runAs(g.id, `walk(${pl.id})`).catch(() => {}); }
    W.dispatchEvent(new CustomEvent('tablefolk-god', { detail: { what: 'dream', who: g.id, text, kind } }));
  }
  const OMEN_LINES = { faithful: ['A sign! The god is watching over us!', 'Look, the sky! Kneel, all of you!', 'The god speaks. We must listen.'], doubters: ['Marsh lights. Nothing more.', 'A trick of the sun, and Ada will make a sermon of it.', 'Hm. I have never seen that before. Still proves nothing.'] };
  async function readOmen(o) {
    const vs = villagers(), f = vs.filter(g => sideOf(g.id) === 'faithful'), d = vs.filter(g => sideOf(g.id) !== 'faithful');
    for (const g of [f[0], d[0]].filter(Boolean)) {
      let line = null;
      if (words(g)) line = await say1(g, who(g), `A ring of fire just appeared in the sky over the ${shrine().id}${o.text ? ` and words hung in the air: "${o.text}"` : ''}. Say what you make of it: one sentence, nothing else.`, 50);
      line ||= o.text && sideOf(g.id) === 'faithful' ? `The god has spoken: ${o.text}. Mark it!` : pick(OMEN_LINES[sideOf(g.id) === 'faithful' ? 'faithful' : 'doubters']);
      try { api.say(g, line, true); } catch {}
      await sleep(1800);
    }
  }

  // ---------------------------------------------------------------- decrees: a vision, a council, a demand
  let councilNow = null;   // { members, priest, until, said }
  const STANCE = [
    { id: 'yes', label: 'agrees to do it', keywords: ['yes', 'we must', 'we will', 'obey', 'agree', 'gladly', 'of course', 'praise'] },
    { id: 'no', label: 'refuses', keywords: ['no', 'never', 'refuse', 'will not', "won't", 'madness', 'nonsense', 'not doing'] },
    { id: 'bargain', label: 'wants to bargain: more time or less', keywords: ['time', 'later', 'less', 'bargain', 'if', 'only', 'half', 'but'] },
  ];
  const COUNCIL = {
    yes: ['The god has spoken. We do as it asks.', 'I will do my part. Who will help me?', 'After all it has given us? Of course we will.'],
    no: ['Madness. I will not give up what little we have for a voice in Ada’s head.', 'No. I want to see this god before I bow to it.', 'We are hungry enough already. I say no.'],
    bargain: ['We will do it, but give us more time.', 'Half now, and the rest when the harvest is in.', 'I will go along, if the god sends rain first.'],
  };
  function priestFor() {
    const re = /\b(elder|priest|priestess|chief|shaman|oracle|monk)\b/i;
    return villagers().find(g => re.test([cfgOf(g).role, cfgOf(g).style, cfgOf(g).personality, g.id].join(' '))) || villagers().sort((a, b) => G.belief(b.id) - G.belief(a.id))[0] || null;
  }
  function decreeCtx() {
    const items = [...new Set(api.state.characters.flatMap(c => (api.inventory(c)?.items || []).map(i => i.name)).concat(['bread', 'wheat', 'apple', 'fish', 'meat', 'ale']))];
    return { now: gm(), items, animals: [...new Set(animals().map(a => a.charModel))], groups: W.tablefolkGroups?.all?.() || {}, people: vid(), shrine: shrine().id };
  }
  const KINDS = [
    { id: 'offering', label: 'bring something to the shrine as an offering', keywords: ['bring', 'offer', 'tribute', 'tithe', 'gift', 'bread', 'food'] },
    { id: 'sacrifice', label: 'sacrifice an animal at the shrine', keywords: ['sacrifice', 'blood', 'goat', 'sheep', 'lamb', 'pig', 'altar'] },
    { id: 'worship', label: 'come to the shrine and pray', keywords: ['pray', 'worship', 'kneel', 'gather', 'praise', 'sing'] },
    { id: 'work', label: 'build, dig or clear something', keywords: ['build', 'wall', 'dig', 'clear', 'raise', 'statue', 'fence'] },
  ];
  async function readDecree(text) {
    const ctx = decreeCtx(); let d = parseDecree(text, ctx), by = 'code';
    if (d.error) {
      const kind = await choose(text, KINDS, 'What does the god require?'); by = W.tablefolkDecider ? 'decider' : 'matcher';
      if (kind === 'offering') d = { ...parseDecree('bring 2 bread', ctx), by: parseDecree(text, ctx).by };
      else if (kind === 'sacrifice' && ctx.animals.length) d = parseDecree(`sacrifice a ${ctx.animals[0]}`, ctx);
      else if (kind === 'worship') d = parseDecree('come and pray', ctx);
      else if (kind === 'work') d = { kind: 'work', plan: text, of: 'all', by: gm() + 1440, text: text.replace(/^\w/, c => c.toUpperCase()) };
      if (!d.error) { const w = parseDecree(text + ' and pray', ctx); d.by = w.by ?? d.by; }
    }
    return { ...d, read: by };
  }
  // the demand core keeps (orders.js): met by a delivery, a check (sacrifice, worship) or marked work
  function demandSpec(d, { via, anger }) {
    const sh = shrine().id, base = { text: d.text, of: d.of, by: d.by, via, from: 'player', data: { god: true, anger, kind: d.kind } };
    if (d.kind === 'offering') return { ...base, template: 'god_offering', met: { deliver: { item: d.item, n: d.n, to: sh } }, data: { ...base.data, item: d.item, n: d.n } };
    if (d.kind === 'sacrifice') return { ...base, template: 'god_sacrifice', met: { check: 'god_sacrifice' }, data: { ...base.data, animal: d.animal } };
    if (d.kind === 'worship') return { ...base, template: 'god_worship', met: { check: 'god_worship' }, data: { ...base.data, prayed: [] } };
    return { ...base, template: 'god_work', met: { designation: true }, plan: d.plan };
  }
  const memberIds = d => d.of === 'all' ? vid() : d.of?.id ? [d.of.id] : (W.tablefolkGroups?.members?.(d.of?.group) || []);
  async function decree(text, { via = null, parsed = null, council: withCouncil = true, anger = null } = {}) {
    const d = parsed || await readDecree(text); if (d.error) { toast(d.error, 'warn'); return { error: d.error }; }
    const priest = (via && byId(via)) || priestFor(); anger ||= api.flag('god_anger') || 'storm';
    let outcome = { outcome: 'accept', votes: [] };
    if (priest && withCouncil) {
      // the vision
      const p = posOf(priest); skyRing(p.x, p.z, { size: 1.6, y: 4, ms: 3000, color: [1, .9, .55] });
      api.addMemory?.(priest, `A vision: the god spoke to me. "${d.text}"`, 5);
      badge(priest, '✨ a vision');
      let call = null;
      if (words(priest)) call = await say1(priest, who(priest), `The god has just sent you a vision: "${d.text}". Call the village to the ${shrine().id} to tell them: one or two sentences, nothing else.`, 60);
      try { api.say(priest, call || `A vision! The god has spoken to me. Come to the ${shrine().id}, all of you, and hear its will!`, true); } catch {}
      outcome = await council(priest, d);
      if (outcome.outcome === 'bargain' && d.by != null) { d.by = Math.round(gm() + (d.by - gm()) * 1.5); d.text = d.text.replace(/\.$/, '') + ' (the village asked for more time).'; }
    }
    const spec = demandSpec(d, { via: priest?.id || null, anger });
    spec.data.council = withCouncil && priest ? outcome.outcome : null; spec.data.votes = outcome.votes;
    const made = await W.tablefolkDemands.create(spec);
    if (made?.error) { toast(made.error, 'warn'); return made; }
    // refusals: those who voted no when the village refused, and the bitterest doubters whatever it decided
    const refusers = outcome.votes.filter(v => v.vote === 'no' && (outcome.outcome === 'refuse' || G.belief(v.id) < 25)).map(v => v.id);
    for (const id of refusers) { W.tablefolkDemands.refuse(made.id, id, 'voted against it at the council'); api.addMemory?.(byId(id), `I refused the god's demand at the council: ${d.text}`, 3); }
    if (refusers.length) apply(G.many(refusers, G.rules.refused, 'refused the god'));
    W.dispatchEvent(new CustomEvent('tablefolk-god', { detail: { what: 'decree', id: made.id, text: made.text, council: outcome.outcome, refusers } }));
    return made;
  }
  async function council(priest, d) {
    const sh = shrine(), members = villagers().filter(g => g !== priest).sort((a, b) => dist(posOf(a), sh) - dist(posOf(b), sh)).slice(0, 6).map(g => g.id);
    councilNow = { members: [priest.id, ...members], priest: priest.id, until: performance.now() + 30000, said: {} };
    narrate(`The village gathers at the ${sh.id} to hear the god's will.`);
    // wait until most have come (or half a minute)
    const t0 = performance.now();
    while (performance.now() - t0 < 25000) { const here = councilNow.members.filter(id => byId(id) && atShrine(byId(id))).length; if (here >= Math.ceil(councilNow.members.length * .7)) break; await sleep(700); }
    try { api.say(priest, `The god demands: ${d.text.replace(/\.$/, '')}. What do you say?`, true); } catch {}
    await sleep(1500);
    const voters = [];
    const speakers = members.map(byId).filter(Boolean).sort((a, b) => G.belief(b.id) - G.belief(a.id)).slice(0, 5);
    for (const g of speakers) {
      let stance = null, line = null;
      if (words(g)) {
        line = await say1(g, who(g), `At a council at the ${sh.id}, ${priest.id} says the god demands: "${d.text}". Do you agree, refuse, or want to bargain? Say it in one or two sentences, in your own words, nothing else.`, 60);
        if (line) stance = await choose(line, STANCE, `Does ${g.id} agree, refuse, or bargain?`);
      }
      const v = vote([{ id: g.id, belief: G.belief(g.id), side: sideOf(g.id), stance }]).votes[0];
      line ||= pick(COUNCIL[v.vote]);
      try { api.say(g, line, true); } catch {}
      councilNow.said[g.id] = line;
      voters.push({ id: g.id, belief: G.belief(g.id), side: sideOf(g.id), stance: v.vote });
      await sleep(1600);
    }
    const r = vote([{ id: priest.id, belief: Math.max(60, G.belief(priest.id)), side: 'faithful', stance: 'yes' }, ...voters]);
    const end = r.outcome === 'accept' ? `It is decided: we will do as the god asks. (${r.yes} for, ${r.no} against)` : r.outcome === 'refuse' ? `The village refuses. May the god forgive us. (${r.no} against, ${r.yes} for)` : `We will do it, but we ask the god for more time. (${r.yes} for, ${r.no} against, ${r.bargain} to bargain)`;
    try { api.say(priest, end, true); } catch {}
    for (const id of councilNow.members) api.addMemory?.(byId(id), `At the council about "${d.text}" the village ${r.outcome === 'accept' ? 'agreed' : r.outcome === 'refuse' ? 'refused' : 'bargained for more time'}.`, 2.5);
    narrate(r.outcome === 'accept' ? 'The council agrees to the god’s demand.' : r.outcome === 'refuse' ? 'The council refuses the god’s demand.' : 'The council bargains for more time.');
    councilNow = null;
    return r;
  }
  // the Decree tool
  function decreeTool() {
    B().pick(`<span>📢 Decree:</span><input id="tfGodWords" type="text" placeholder="I require a goat sacrifice by the full moon" /><button type="button" data-pick="read">read it</button><button type="button" data-pick="cancel">close</button>`,
      { read: () => confirmDecree(document.getElementById('tfGodWords')?.value), enter: el => confirmDecree(el.value), cancel: () => B().pick(null) });
    setTimeout(() => document.getElementById('tfGodWords')?.focus(), 30);
  }
  const ANGER = [['storm', 'a storm'], ['plague', 'plague on a refuser’s household'], ['blight', 'blight on the fields'], ['beast', 'beasts'], ['smite', 'lightning on a refuser'], ['drought', 'a drought'], ['none', 'nothing (mercy)']];
  async function confirmDecree(text) {
    text = String(text || '').trim(); if (!text) return;
    B().pick(`<span>Reading “${esc(text.slice(0, 60))}”…</span>`, {});
    const d = await readDecree(text);
    if (d.error) { toast(d.error, 'warn'); decreeTool(); return; }
    const of = d.of === 'all' ? 'everyone' : d.of?.id || W.tablefolkGroups?.get(d.of?.group)?.name || d.of?.group;
    const hh = m => { const day = Math.floor(m / 1440) + 1, v = ((m % 1440) + 1440) % 1440; return `${day !== Math.floor(gm() / 1440) + 1 ? 'day ' + day + ' ' : ''}${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
    const dflt = api.flag('god_anger') || 'storm';
    B().pick(`<span>${esc(d.text)}</span><small>of ${esc(of)} · by ${esc(hh(d.by))} · read by ${esc(d.read)} · ${esc(priestFor()?.id || 'someone')} will have a vision and the village will hold a council</small><small>if it is not done:</small><select data-change="anger">${ANGER.map(([k, l]) => `<option value="${k}"${k === dflt ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button type="button" class="go" data-pick="ok">Decree it</button><button type="button" data-pick="no">cancel</button>`,
      { ok: () => { const anger = document.querySelector('#tfPickBar select')?.value || dflt; B().pick(null); decree(text, { parsed: d, anger }).catch(e => console.warn('[god] decree', e)); }, anger: () => {}, no: () => decreeTool(), cancel: () => B().pick(null) });
  }

  // ---------------------------------------------------------------- the decree's templates (core demands): met, missed
  const sacrificeAt = d => animals().find(a => a.charModel === d.data.animal && atShrine(a));
  async function sacrifice(d) {
    const a = sacrificeAt(d); if (!a) return false;
    const p = posOf(a); skyRing(p.x, p.z, { size: 1.4, y: 3, ms: 2500, color: [1, .6, .3] });
    burst(p.x, p.z, { color: [1, .5, .25], color2: [1, .9, .5], n: 400, ms: 1500, r: .6, up: 2.4 });
    for (const id of within(p.x, p.z, 10)) api.addMemory?.(byId(id), `We gave a ${a.charModel} to the god at the ${shrine().id}. It was taken up in fire.`, 3);
    setTimeout(() => { try { W.disposeCharacter?.(a); } catch {} api.state.characters = api.state.characters.filter(x => x !== a); try { api.state.brainConfigs.delete(a.id); } catch {} }, 900);
    return true;
  }
  function metReward(d) {
    const members = memberIds(d), v = d.data.kind === 'offering' ? G.offeringValue(d.data.item, d.data.n) + 5 : d.data.kind === 'sacrifice' ? 15 : d.data.kind === 'worship' ? 3 + 2 * (d.data.prayed || []).length : 10;
    api.resource('mana', v);
    apply(G.demandMet(members, vid(), d.id));
    narrate(`The god is pleased. (+${v} mana)`);
    // an offering is taken up from the shrine's stores
    if (d.data.kind === 'offering') try { burst(shrine().x, shrine().z, { color: [1, .85, .4], n: 300, ms: 1500, r: 1.2, up: 2.2 }); } catch {}
  }
  async function missedAnger(d) {
    const anger = d.data.anger || api.flag('god_anger') || 'storm', members = memberIds(d), refusers = (d.refused || []).map(r => r.who);
    apply(G.demandMissed(members, vid(), anger, refusers));
    if (anger === 'none') { narrate('The god lets it pass. Some call it mercy; the doubters laugh.'); return; }
    const victim = byId(refusers[0]) || members.map(byId).filter(Boolean).sort((a, b) => G.belief(a.id) - G.belief(b.id))[0];
    const fields = crops()[0], sh = shrine();
    const t = anger === 'blight' ? (fields ? { x: fields.x, z: fields.z } : { x: sh.x, z: sh.z }) : anger === 'storm' ? { x: sh.x, z: sh.z } : victim ? { who: victim, x: posOf(victim).x, z: posOf(victim).z } : {};
    narrate(`The god is angry: "${d.text.replace(/\.$/, '')}" was not done.`);
    await runPower(anger, t, { free: true, anger: true });
  }
  const demands = {
    god_offering: { label: 'an offering at the shrine', keywords: ['offering', 'offer', 'tribute', 'tithe', 'bring'],
      parse(text, ctx) { const d = parseDecree(text, decreeCtx()); return d.error || d.kind !== 'offering' ? { error: d.error || 'not an offering' } : demandSpec(d, { via: priestFor()?.id, anger: api.flag('god_anger') || 'storm' }); },
      onMet: d => metReward(d), onMissed: d => missedAnger(d) },
    god_sacrifice: { label: 'an animal sacrificed at the shrine', keywords: ['sacrifice', 'goat', 'sheep', 'lamb', 'blood', 'altar'],
      parse(text) { const d = parseDecree(text, decreeCtx()); return d.error || d.kind !== 'sacrifice' ? { error: d.error || 'not a sacrifice' } : demandSpec(d, { via: priestFor()?.id, anger: api.flag('god_anger') || 'storm' }); },
      check(d) { if (d.data.done) return true; if (sacrificeAt(d)) { d.data.done = true; sacrifice(d); return true; } return false; },
      onMet: d => metReward(d), onMissed: d => missedAnger(d) },
    god_worship: { label: 'everyone prays at the shrine', keywords: ['pray', 'worship', 'kneel', 'gather', 'praise'],
      parse(text) { const d = parseDecree(text, decreeCtx()); return d.error || d.kind !== 'worship' ? { error: d.error || 'not worship' } : demandSpec(d, { via: priestFor()?.id, anger: api.flag('god_anger') || 'storm' }); },
      check(d) { const m = memberIds(d).filter(id => !(d.refused || []).some(r => r.who === id)); const n = m.filter(id => (d.data.prayed || []).includes(id)).length; return { met: m.length > 0 && n >= m.length, progress: m.length ? n / m.length : 0 }; },
      onMet: d => metReward(d), onMissed: d => missedAnger(d) },
    god_work: { label: 'work for the god', keywords: [], onMet: d => metReward(d), onMissed: d => missedAnger(d) },
  };
  // on rails: the obvious job for a sacrifice (lead the animal to the shrine) and for worship (go and pray)
  async function demandWorkFor(g, s, j) {
    for (const d of W.tablefolkDemands?.forCharacter?.(g) || []) {
      if ((d.refused || []).some(r => r.who === g.id) || d.status !== 'open') continue;
      if (d.template === 'god_worship' && !(d.data.prayed || []).includes(g.id) && !intents.has(g.id)) { intents.set(g.id, { need: 'strength', at: gm() }); return prayWork(g, s, j); }
      if (d.template === 'god_sacrifice' && !d.data.done) {
        const lead = d.data.leader && byId(d.data.leader) && !byId(d.data.leader).defeated ? d.data.leader : (d.data.leader = g.id);
        if (lead !== g.id) continue;
        const k = K(), sh = shrine(), a = animals().filter(x => x.charModel === d.data.animal).sort((x, y) => dist(posOf(x), posOf(g)) - dist(posOf(y), posOf(g)))[0];
        if (!a) { d.data.stuck = `no ${d.data.animal} to be had`; return null; }
        if (!d.data.leading) { k.setDoing(g, s, `fetching a ${a.charModel} for the god`); if (dist(posOf(g), posOf(a)) > 1.8) { const r = await k.goTo(g, s, posOf(a).x, posOf(a).z, 'the ' + a.charModel); return { ms: r.ms || 2000 }; } d.data.leading = a.id; badge(a, 'led away'); }
        const led = byId(d.data.leading) || a;
        k.setDoing(g, s, `leading a ${led.charModel} to the ${sh.id}`);
        if (dist(posOf(g), sh) > 2) { const spot = sh.p ? J().places.spotIn(sh.p, g) : sh; const r = await k.goTo(g, s, spot.x, spot.z, 'the ' + sh.id); const c = api.freeCell(posOf(g).x, posOf(g).z, 2); if (c) J().walkTo(led, c.x, c.z); return { ms: r.ms || 2000 }; }
        const c = api.freeCell(sh.x, sh.z, 2); if (c) J().walkTo(led, c.x, c.z);
        return { ms: 2500 };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- the urgent: the council, the sick
  async function urgent(g, s, j) {
    if (!on) return null;
    if (councilNow?.members.includes(g.id)) {
      const k = K(); k.setDoing(g, s, 'at the council'); if (!atShrine(g)) { const sh = shrine(), spot = sh.p ? J().places.spotIn(sh.p, g) : sh; const r = await k.goTo(g, s, spot.x, spot.z, 'the ' + sh.id); return { ms: r.ms || 2000 }; } return { ms: 2000 };
    }
    if (sick.has(g.id) && !(W.tablefolkThreats?.active?.() || []).length) { const r = await K().hideHome(g, s, j, false); K().setDoing(g, s, 'sick in bed'); return r || { ms: 4000 }; }
    return null;
  }
  async function work(g, s, j) { if (!on) return null; return (await demandWorkFor(g, s, j)) || (await prayWork(g, s, j)); }
  // above rails: praying is one of the activities (and doing a sacrifice or worship demand)
  function options(g) {
    if (!on || isAnimal(g)) return [];
    const out = [], n = G.maybePray(g.id, { ...factsOf(g), k: 99 }, () => 0);
    if (n && !intents.has(g.id)) out.push({ key: 'god:pray', kind: 'pray', cmd: 'pray', label: `pray at the ${shrine().id} for ${needWord(n.need)}`, doing: 'going to pray',
      run: async (g2, s2, j2) => { intents.set(g2.id, { need: n.need, at: gm() }); const r = await prayWork(g2, s2, j2); return r && intents.has(g2.id) ? { busy: true, ms: r.ms } : { done: true, text: 'prayed' }; } });
    for (const d of W.tablefolkDemands?.forCharacter?.(g) || []) if (/^god_(sacrifice|worship)$/.test(d.template || '') && !(d.refused || []).some(r => r.who === g.id))
      out.push({ key: 'god:' + d.id, kind: 'demand', cmd: 'do as demanded', label: `do as the god demanded: ${d.text.replace(/\.$/, '')}`, doing: 'doing as the god demanded', run: async (g2, s2, j2, a) => { a.cap ||= 120; const r = await demandWorkFor(g2, s2, j2); return r ? { busy: true, ms: r.ms } : { done: true, text: 'did as demanded' }; } });
    return out;
  }

  // ---------------------------------------------------------------- every game quarter hour
  function quarter() {
    if (!on) return;
    const t = gm();
    // sickness: hunger and wounds; it spreads each hour to those close by; it passes after a day and a half
    for (const [id, sk] of [...sick]) {
      const g = byId(id); if (!g) { sick.delete(id); continue; }
      const m = W.tablefolkMind?.mindOf?.(g); if (m) m.hunger = Math.min(1, (m.hunger || 0) + .02);
      if (t >= sk.until) { cure(g); continue; }
      if (Math.floor(t / 60) !== Math.floor((t - 15) / 60)) {
        const c = cfgOf(g); if ((c.hp ?? 10) > 3) api.setBrainConfig(g.id, { hp: (c.hp ?? 10) - 1 });
        for (const o of villagers()) if (!sick.has(o.id) && dist(posOf(o), posOf(g)) < 2.5 && Math.random() < .25) { if (makeSick(o)) { narrate(`The sickness spreads to ${o.id}.`); } }
      }
    }
    // drought: crops dry out, hunger grows
    if (droughtUntil) { if (t >= droughtUntil) setDrought(0); else for (const o of crops()) if (!withered.has(o.mesh) && Math.random() < .08) wither(o); api.flag('blight', blightCount() > 0); }
    const r = G.tick();
    for (const p of r.expired) { api.addMemory?.(byId(p.who), `I prayed for ${needWord(p.need)} and no answer came.`, 2); }
    if (r.broken.length) narrate('The omen did not come true. The doubters are loud tonight.');
    if (r.unrewarded.length) narrate('The village did as the god asked, and the god gave nothing back. They grumble.');
    apply(r.changes);
    prayTick();
    sync([]);
  }

  // ---------------------------------------------------------------- the card (the "faith" skill)
  const cards = {
    faith(g) {
      if (isAnimal(g)) return '';
      const b = Math.round(G.belief(g.id)), out = [`You believe in the god ${beliefWord(b)} (${b} of 100)${sideOf(g.id) ? '; you are one of the ' + sideOf(g.id) : ''}.`];
      if (sick.has(g.id)) out.push('You are sick with the plague: you cannot work, you are weak and hungry. Pray to be healed.');
      const dr = dreams.get(g.id); if (dr && gm() - dr.at < 720) out.push(`Last night the god spoke to you in a dream: "${dr.text}"`);
      const p = G.prayers().filter(p => p.who === g.id).slice(-1)[0]; if (p && gm() - p.at < 360) out.push(p.status === 'open' ? `You prayed for ${needWord(p.need)} and wait for an answer.` : p.status === 'answered' ? `You prayed for ${needWord(p.need)} and the god answered.` : `You prayed for ${needWord(p.need)} and the god was silent.`);
      const o = G.omens().slice(-1)[0]; if (o && gm() - o.at < 720) out.push(`A ring of fire burned in the sky over the ${shrine().id}${o.text ? ': "' + o.text + '"' : ''}${o.status === 'kept' ? ', and it came true' : ''}.`);
      if (droughtUntil > gm()) out.push('A drought: no rain, the crops are drying.');
      if (blightCount()) out.push('A blight is on the crops.');
      return out;
    },
  };

  // ---------------------------------------------------------------- the bar, the HUD, the camera, time
  function speedButton() { const k = W.tablefolkModes?.speed || 1; try { B()?.set?.('god:speed', { label: `×${k}`, icon: k > 1 ? '⏩' : '▶' }); } catch {} }
  function pauseButton() { const live = !!W.tablefolkLive?.on; try { B()?.set?.('god:pause', { label: live ? 'Pause' : 'Go on', icon: live ? '⏸' : '▶' }); } catch {} }
  function bar() {
    api.bar.add({ id: 'god:prayers', label: 'Prayers', icon: '🙏', title: 'Prayers at the shrine: answer with a power, a dream, or silence; and the village (belief, sides, sickness)', order: 5, run: () => (panel === 'prayers' && !document.getElementById('tfPickBar')?.hidden) ? (panel = null, B().pick(null)) : showPanel('prayers') });
    api.bar.add({ id: 'god:decree', label: 'Decree', icon: '📢', title: 'Words ("I require a goat sacrifice by the full moon"): a vision to the priest, a council, a demand', order: 6, run: decreeTool });
    api.bar.add({ id: 'god:pause', label: 'Pause', icon: '⏸', title: 'Pause or go on (P)', order: 1, run: () => { W.tablefolkLive?.toggle?.(); setTimeout(pauseButton, 50); } });
    api.bar.add({ id: 'god:speed', label: '×1', icon: '▶', title: 'Time: normal, twice, four times as fast', order: 2, run: () => { const k = W.tablefolkModes?.speed || 1; W.tablefolkModes?.setSpeed?.(k >= 4 ? 1 : k * 2); speedButton(); } });
    pauseButton(); speedButton();
  }
  if (!document.getElementById('tfGodCss')) {
    const css = document.createElement('style'); css.id = 'tfGodCss';
    css.textContent = `#tfPickBar .godPanel{display:flex;flex-direction:column;gap:4px;max-height:42vh;overflow:auto;min-width:min(720px,90vw)}
#tfPickBar .gtabs{display:flex;gap:6px;align-items:center}#tfPickBar .godPanel button{flex:0 0 auto;width:auto}
#tfPickBar .gp .gq{flex:1 1 280px;min-width:0}#tfPickBar .gp .ga{display:flex;gap:5px;flex:0 0 auto;margin-left:auto}
html.god-game #tfPickBar:has(.godPanel){background:rgba(20,24,30,.97)}
#tfPickBar .gp{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:4px 6px;border-radius:9px;background:rgba(255,255,255,.05);font-weight:500}
#tfPickBar .gp i{opacity:.75;font-style:normal;font-size:11.5px}#tfPickBar .gp small{opacity:.75}
#tfPickBar .gp .bar{display:inline-block;width:90px;height:7px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}#tfPickBar .gp .bar span{display:block;height:100%}
html.god-game #powerBar{left:12px;transform:none;bottom:12px;flex-wrap:wrap;max-width:min(760px,calc(100vw - 420px));overflow:visible;justify-content:flex-start}
html.god-game #powerBar button{flex:0 0 auto;min-width:50px;padding:3px 5px;font-size:10.5px}html.god-game #powerBar button .ic{font-size:17px}
html.god-game #tfPickBar{left:12px;transform:none;bottom:146px;justify-content:flex-start;max-width:min(900px,calc(100vw - 24px))}
@media (max-width:760px){html.god-game #powerBar{max-width:calc(100vw - 24px);flex-wrap:nowrap;overflow-x:auto;bottom:150px}html.god-game #tfPickBar{bottom:222px}#tfPickBar .godPanel{max-height:40vh;min-width:0}}`;
    document.head.appendChild(css);
  }
  const hooks = { urgent, work, options };
  function start() {
    on = true;
    const scn = W.tablefolkScenario?.active?.scn || {};
    G.clear(); sick.clear(); intents.clear(); dreams.clear(); thanks.clear(); withered.clear(); clearStains(); droughtUntil = 0; councilNow = null;
    const GR = W.tablefolkGroups?.all?.() || {};
    for (const a of scn.agents || []) { const g = byId(a.id); if (!g || isAnimal(g)) continue; const gs = W.tablefolkGroups?.of?.(a.id) || []; const b = Number.isFinite(+a.belief) ? +a.belief : gs.includes('faithful') ? 70 : gs.includes('doubters') ? 25 : 50; G.set(a.id, b); G.setSide(a.id, gs.includes('faithful') ? 'faithful' : gs.includes('doubters') ? 'doubters' : null); }
    for (const g of villagers()) if (!G.ids().includes(g.id)) G.set(g.id, 50);
    groupNames = Object.fromEntries(Object.values(GR).map(g => [g.id, g.name]));
    const R = W.tablefolkResources;
    for (const [gid, name] of Object.entries(groupNames)) R?.declare('belief_' + gid, { label: name.replace(/^the /, '').replace(/^\w/, c => c.toUpperCase()), icon: gid === 'faithful' ? '🕯' : gid === 'doubters' ? '❔' : '🏠', start: 50, min: 0, max: 100, show: true, color: gid === 'faithful' ? '#e8c25a' : gid === 'doubters' ? '#8a8fa0' : '#b98a5a' }, 'god');
    for (const [id, n] of Object.entries(scn.flags || {})) if (id === 'god_sick' && byId(n)) makeSick(byId(n));
    W.tablefolkModes?.setSpeed?.(1);
    document.documentElement.classList.add('god-game');
    bar(); sync([]);
    // a god has no body: the overhead camera over the shrine
    if (!api.player()) setTimeout(() => { try { const c = api.state.camera, s = shrine(); if (!c) return; api.state.followAvatar = false; c.setTarget(new (BAB().Vector3)(s.x, 0, s.z)); c.radius = 30; c.beta = .78; } catch (e) { console.warn('[god] camera', e); } }, 400);
  }
  api.on('tablefolk-scenario-started', e => { if (e.detail?.sub) return; try { start(); } catch (err) { console.warn('[god] start', err); } });
  api.on('tablefolk-clock', () => { try { quarter(); } catch (e) { console.warn('[god] quarter', e); } });
  api.on('tablefolk-live', () => pauseButton());
  api.every(1500, () => { pauseButton(); });
  W.tablefolkJobs?.addUrgent?.(hooks.urgent); W.tablefolkJobs?.addWork?.(hooks.work, true); W.tablefolkAgency?.addOptions?.(hooks.options);
  (W.tablefolkSaveHooks ||= {}).god = { save: () => ({ g: G.data(), sick: [...sick], drought: droughtUntil, dreams: [...dreams] }), restore: x => { if (!x) return; G.load(x.g); sick.clear(); for (const [id, v] of x.sick || []) { sick.set(id, v); const g = byId(id); if (g) sickMotes(g, true); } droughtUntil = x.drought || 0; dreams.clear(); for (const [k, v] of x.dreams || []) dreams.set(k, v); sync([]); } };
  // what tests and other packages may read
  W.tablefolkGod = { rules: G, decree, readDecree, prayerWords, council: () => councilNow, sick: () => [...sick.keys()], makeSick, cure, crops, withered: () => blightCount(), showPanel, intents, prayTick, shrine, runPower, quarter, drought: () => droughtUntil,
    stains: () => ({ crops: stains.size, areas: areas.length }), ringSpot, onScreen, praySpot };

  return {
    resources: {
      // mana: an hour, each villager's belief / 100 (rules.manaPerBelief), plus offerings and met decrees
      mana: { label: 'Mana', icon: '🔮', start: 25, min: 0, max: 150, color: '#9a7cf0', perHour: () => G.manaPerHour(vid()) },
      belief: { label: 'Belief', icon: '🙏', start: 50, min: 0, max: 100, color: '#e8c25a' },
    },
    weather: { drought: { base: 'wind', label: 'drought', color: [.86, .68, .36], intensity: .5 } },
    powers, demands, cards,
    dispose() {
      on = false;
      W.tablefolkJobs?.removeUrgent?.(hooks.urgent); W.tablefolkJobs?.removeWork?.(hooks.work); W.tablefolkAgency?.removeOptions?.(hooks.options);
      if (W.tablefolkSaveHooks?.god) delete W.tablefolkSaveHooks.god;
      for (const x of fxAll) { try { if (x.dispose) { x.stop?.(); x.dispose(); } else api.scene?.onBeforeRenderObservable.remove(x); } catch {} } fxAll.clear(); sickFx.clear();
      try { flareTex?.dispose(); } catch {} flareTex = null; clearStains();
      W.tablefolkModes?.setSpeed?.(1); document.documentElement.classList.remove('god-game');
      if (W.tablefolkGod?.rules === G) delete W.tablefolkGod;
    },
  };
}
