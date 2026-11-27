// Kit buildings in the game (2026-11-27): screenshots and numbers in the headless test Chrome.
//   node tools/kit/game-shots.mjs <base url> <scenario path|url params> <outdir> <prefix> [views] [extra query]
//   views (default far,door,corner,inside,fp,upper,night): comma list; "stats" alone only measures
// Needs the test Chrome (HEADLESS=1 tools/browser-test/launch-chrome.sh; CDP on 9223 or CDP_PORT) and a server.
// Prints STATS {...}: buildings, build ms, draw calls, active meshes, triangles drawn, textures (GB), frame ms.
// The scenario: a path under the server ("/scenarios/hearthvale.json") or raw query ("generate=..."), with ?art=1.
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
const require = createRequire(new URL('../browser-test/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const [base, scn, dir, prefix, views = 'far,door,corner,inside,fp,upper,night', extra = ''] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const ctx = b.contexts()[0]; const p = await ctx.newPage();
await p.setViewportSize({ width: +(process.env.SHOT_W || 1100), height: +(process.env.SHOT_H || 700) });
p.on('console', m => { const t = m.text(); if (m.type() === 'error' || /\[buildings\]|\[walls\]|\[roofs\]/.test(t)) console.log('console:', m.type(), t.slice(0, 300)); });
p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 400)));
p.on('response', r => { if (r.status() >= 400) console.log('http', r.status(), r.url().slice(0, 160)); });
const q = scn.includes('=') ? scn : 'scenario=' + scn;
const t0 = Date.now();
await p.goto(`${base}/app/?art=1&intro=0&model=none&${q}${extra ? '&' + extra : ''}&t=${Date.now()}`, { timeout: 60000 });
await p.waitForFunction(() => window.tablefolkLoading?.revealed && window.TABLEFOLK_STATE?.playerAvatar, null, { timeout: 120000 });
const readyMs = Date.now() - t0;
await p.waitForTimeout(2500);
const measure = () => p.evaluate(async () => {
  const s = TABLEFOLK_STATE, sc = s.scene, e = sc.getEngine();
  const ins = window._tfIns || (window._tfIns = new BABYLON.SceneInstrumentation(sc)); ins.captureFrameTime = true; ins.captureActiveMeshesEvaluationTime = true;
  await new Promise(r => setTimeout(r, 800));
  // medians over 3 s of frames: draw calls per frame (the shadow map is redrawn every second frame at light) and
  // the frame's CPU time
  const dcs = [], fts = [], ob = sc.onAfterRenderObservable.add(() => { dcs.push(e._drawCalls?.current ?? 0); fts.push(ins.frameTimeCounter.current); });
  await new Promise(r => setTimeout(r, 3000)); sc.onAfterRenderObservable.remove(ob);
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)] || 0; };
  const act = sc.getActiveMeshes(); let tris = 0, kitTris = 0;
  for (let i = 0; i < act.length; i++) { const m = act.data[i]; const n = (m.getTotalIndices?.() || 0) / 3 * (m.thinInstanceCount || 1) * (m.isVisible ? 1 : 0); tris += n; if (/kit/.test(m.name)) kitTris += n; }
  const ws = window.tablefolkLoading?.log?.find?.(l => /world-ready|revealed/.test(l.what || ''));
  return { buildings: window.tablefolkBuildings?.stats?.(), activeMeshes: act.length, drawCalls: med(dcs), drawCallsMax: Math.max(0, ...dcs), trisDrawn: Math.round(tris), kitTris: Math.round(kitTris),
    gfxGB: +window.tablefolkGfxGB?.().toFixed(3), textures: sc.textures.length, frameMs: +med(fts).toFixed(2), frames: fts.length, fps: +e.getFps().toFixed(1),
    quality: window.TABLEFOLK_GFX?.quality, shells: window.tablefolkRoofs?.shells?.().length, roofs: window.tablefolkRoofs?.roofed?.().length };
});
const shot = async name => { await p.waitForTimeout(+(process.env.SHOT_WAIT || 1400)); const url = await p.evaluate(() => document.getElementById('renderCanvas').toDataURL('image/jpeg', .86)); writeFileSync(`${dir}/${prefix}_${name}.jpg`, Buffer.from(url.split(',')[1], 'base64')); console.log('shot', `${dir}/${prefix}_${name}.jpg`); };
const st = await measure();
console.log('STATS ' + JSON.stringify({ prefix, readyMs, ...st }));
// KIT_BREAKDOWN=1: render calls by mesh name over 20 frames (main pass / render targets: shadow maps), the top ones
const breakdown = () => p.evaluate(async () => {
  const sc = TABLEFOLK_STATE.scene, e = sc.getEngine(), by = {}, P = BABYLON.Mesh.prototype, R = BABYLON.RenderTargetTexture.prototype;
  const oProc = P._processRendering, oRT = R.render, oDE = e.drawElementsType, oDA = e.drawArraysType;
  let cur = '?', inRT = 0;
  P._processRendering = function (...a) { const was = cur; cur = this.name.replace(/[_ ]?\d+$/, '').replace(/#.*/, ''); try { return oProc.apply(this, a); } finally { cur = was; } };
  R.render = function (...a) { inRT++; try { return oRT.apply(this, a); } finally { inRT--; } };
  const count = () => { const o = by[cur] || (by[cur] = { main: 0, rt: 0 }); o[inRT ? 'rt' : 'main']++; };
  e.drawElementsType = function (...a) { count(); return oDE.apply(this, a); };
  e.drawArraysType = function (...a) { count(); return oDA.apply(this, a); };
  let n = 0; await new Promise(r => { const ob = sc.onAfterRenderObservable.add(() => { if (++n >= 20) { sc.onAfterRenderObservable.remove(ob); r(); } }); });
  P._processRendering = oProc; R.render = oRT; delete e.drawElementsType; delete e.drawArraysType;
  if (e.drawElementsType !== oDE) e.drawElementsType = oDE; if (e.drawArraysType !== oDA) e.drawArraysType = oDA;
  const rows = Object.entries(by).map(([k, v]) => [k, +(v.main / 20).toFixed(1), +(v.rt / 20).toFixed(1)]).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
  const sum = rs => rs.reduce((t, r) => [t[0] + r[1], t[1] + r[2]], [0, 0]).map(v => +v.toFixed(1));
  return { total: sum(rows), kit: sum(rows.filter(r => /kit|door_leaf|door_pivot/.test(r[0]))), top: rows.slice(0, +(window.KIT_TOP || 45)) };
});
if (process.env.KIT_BREAKDOWN) console.log('BREAKDOWN ' + JSON.stringify(await breakdown()));
// a building to look at: the KIT_PICK-th (default the one nearest the player)
const info = await p.evaluate(([pick, key]) => {
  const L = window.tablefolkBuildings?.list?.() || [], s = TABLEFOLK_STATE, pp = s.playerAvatar.logicalPos || s.playerAvatar.root.position;
  const rooms = L.length ? L : (window.tablefolkRoofs?.roofed?.() || []).map(r => ({ rooms: [r], center: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], A: { ZT: 2.2 } }));
  const sorted = rooms.slice().sort((a, b) => Math.hypot(a.center[0] - pp.x, a.center[1] - pp.z) - Math.hypot(b.center[0] - pp.x, b.center[1] - pp.z));
  const bb = (key && sorted.find(b => (b.key || '').includes(key) || b.spec?.role === key)) || sorted[Math.min(sorted.length - 1, pick | 0)]; if (!bb) return null;
  const r = bb.rooms[0], d = r.doors?.[0] || [r.x0, r.z1 + 1, 0, 1];
  return { center: bb.center, ZT: bb.A?.ZT || 2.2, door: d, room: { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }, spec: bb.spec ? { style: bb.spec.style, storeys: bb.spec.storeys, roof: bb.spec.roof, role: bb.spec.role } : null, top: s.terrainTopY ?? 0 };
}, [+(process.env.KIT_PICK || 0), process.env.KIT_KEY || '']);
console.log('BUILDING ' + JSON.stringify(info));
if (!info) { await p.close(); process.exit(0); }
const free = (tx, ty, tz, alpha, beta, radius) => p.evaluate(([tx, ty, tz, alpha, beta, radius]) => {
  const s = TABLEFOLK_STATE, c = s.camera; if (s.firstPerson) tablefolk.setFirstPerson(false); window.tablefolk?.setCameraView?.('overview');
  s.cameraMode = 'overview'; s.followAvatar = false; c.lowerRadiusLimit = .5; c.upperRadiusLimit = 200; c.lowerBetaLimit = .05; c.upperBetaLimit = 1.55;
  c.setTarget(new BABYLON.Vector3(tx, ty, tz)); c.alpha = alpha; c.beta = beta; c.radius = radius; c.minZ = .05;
}, [tx, ty, tz, alpha, beta, radius]);
const player = (x, z) => p.evaluate(([x, z]) => { const s = TABLEFOLK_STATE; tablefolk.setCharacterLogicalPosition(s.playerAvatar, { x, z }); }, [x, z]);
const [cx, cz] = info.center, [dx, dz, nx, nz] = info.door, top = info.top, aOut = Math.atan2(nz, nx);
for (const v of views.split(',')) {
  if (v === 'stats') continue;
  if (v === 'far') { await player(dx + nx * 6, dz + nz * 6); await free(cx, top + 2, cz, aOut + .6, 1.0, 30); }
  if (v === 'mid') { await player(dx + nx * 6, dz + nz * 6); await free(cx, top + 2, cz, aOut + .5, 1.05, 16); }
  if (v === 'door') { await player(dx + nx * 3, dz + nz * 3); await free(dx, top + 1.3, dz, aOut + .25, 1.42, 5.5); }
  if (v === 'corner') { const ex = nz ? info.room.x1 + 1 : dx, ez = nx ? info.room.z1 + 1 : dz; await free(ex, top + 1.6, ez, aOut + .9, 1.38, 4.2); }
  if (v === 'close') { await free(dx + (nz ? .9 : 0), top + 1.2, dz + (nx ? .9 : 0), aOut + .3, 1.5, 1.9); }
  if (v === 'inside') {   // the player in the room, the follow camera (roof away, the storey above clipped)
    await player(Math.round((info.room.x0 + info.room.x1) / 2), Math.round((info.room.z0 + info.room.z1) / 2));
    await p.evaluate(() => { window.tablefolk?.setCameraView?.('follow'); });
    await p.waitForTimeout(1200);
  }
  if (v === 'upper') {   // the player inside, a free camera from higher: the clipped storey and the room below
    await player(Math.round((info.room.x0 + info.room.x1) / 2), Math.round((info.room.z0 + info.room.z1) / 2));
    await free(cx, top + 1, cz, aOut + .7, .75, 13);
  }
  if (v === 'fp') {   // first person in the room, looking at the door (the roof is the ceiling)
    await p.evaluate(([x, z, yaw]) => { const s = TABLEFOLK_STATE; tablefolk.setCharacterLogicalPosition(s.playerAvatar, { x, z });
      tablefolk.setCameraView('first'); s.fpYaw = yaw; s.fpPitch = .12; },
      [dx - nx * 2, dz - nz * 2, Math.atan2(nx, nz)]);
  }
  if (v === 'fpout') {   // first person outside, at the door looking in
    await p.evaluate(([x, z, yaw]) => { const s = TABLEFOLK_STATE; tablefolk.setCharacterLogicalPosition(s.playerAvatar, { x, z });
      tablefolk.setCameraView('first'); s.fpYaw = yaw; s.fpPitch = -.05; },
      [dx + nx * 2.2, dz + nz * 2.2, Math.atan2(-nx, -nz)]);
  }
  // walking in with the follow camera: walkN = N squares out from the door (walk0 in the doorway, walkin 1.5 inside)
  if (/^walk/.test(v)) {
    const n = v === 'walkin' ? -1.5 : +v.slice(4);
    await p.evaluate(() => { if (TABLEFOLK_STATE.firstPerson) tablefolk.setFirstPerson(false); tablefolk.setCameraView('follow'); });
    await player(dx + nx * n, dz + nz * n); await p.waitForTimeout(900);
  }
  if (v === 'fpdoor') {   // first person a step outside the doorway, looking in: the leaf swings open
    await p.evaluate(([x, z, yaw]) => { const s = TABLEFOLK_STATE; tablefolk.setCharacterLogicalPosition(s.playerAvatar, { x, z });
      tablefolk.setCameraView('first'); s.fpYaw = yaw; s.fpPitch = -.02; }, [dx + nx * 1.1, dz + nz * 1.1, Math.atan2(-nx, -nz)]);
    await p.waitForTimeout(1200);
  }
  // piece-<name>[-<n>][-night]: close on the n-th placed piece of that name (window, window_shut, dormer, sign, stair...)
  if (v.startsWith('piece-')) {
    const [, name, n, night] = v.split('-'), r = await p.evaluate(([name, n]) => {
      const all = [...window.tablefolkBuildings.list(), ...window.tablefolkBuildings.closedList()].flatMap(b => (b.pl?.wall || []).filter(w => w.name === name));
      const w = all[Math.min(all.length - 1, +n || 0)]; if (!w) return null; const m = w.M.m;
      const ez = new BABYLON.Vector3(m[8], m[9], m[10]).normalize();
      return { t: [m[12], m[13], m[14]], ez: [ez.x, ez.y, ez.z], count: all.length };
    }, [name, n || 0]);
    console.log('PIECE ' + JSON.stringify(r));
    if (r) {
      if (night === 'night' || n === 'night') await p.evaluate(() => window.tablefolk?.setTimeOfDay?.(22));
      const V = { dormer: [4, .6, 0, 1.1], stair: [9, 1.2, .25, 1.3], chimney: [4, .5, 0, 1.2], sign: [5, -.5, .55, 1.4], porch: [5, -.4, .3, 1.35] }[name] || [2.4, .45, 0, 1.45];
      // ArcRotate: position = target + r (cos a sin b, cos b, sin a sin b)
      await free(r.t[0], r.t[1] + V[1], r.t[2], Math.atan2(r.ez[2], r.ez[0]) + V[2], V[3], V[0]);
    }
  }
  if (v === 'nmid' || v === 'ndoor') {   // at 22:00, from the mid distance or at the door
    await player(dx + nx * 6, dz + nz * 6); await p.evaluate(() => window.tablefolk?.setTimeOfDay?.(22));
    if (v === 'nmid') await free(cx, top + 2, cz, aOut + .5, 1.1, 13); else await free(dx, top + 1.8, dz, aOut + .25, 1.35, 6.5);
  }
  if (v === 'night') { await player(dx + nx * 6, dz + nz * 6); await p.evaluate(() => window.tablefolk?.setTimeOfDay?.(22)); await free(cx, top + 2, cz, aOut + .5, 1.12, 18); }
  if (process.env.KIT_JS) console.log('KIT_JS', JSON.stringify(await p.evaluate(process.env.KIT_JS)));
  await shot(v);
  if (v === 'fp' || v === 'fpout') await p.evaluate(() => { if (TABLEFOLK_STATE.firstPerson) tablefolk.setFirstPerson(false); });
  if (v === 'far' && process.env.KIT_MEASURE_FAR) console.log('STATS_FAR ' + JSON.stringify(await measure()));
  if (v === 'far' && process.env.KIT_BREAKDOWN) console.log('BREAKDOWN_FAR ' + JSON.stringify(await breakdown()));
}
await p.close(); process.exit(0);
