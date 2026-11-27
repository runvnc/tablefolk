// kit-test.mjs: the building kit's outside stairs and signs in the game (app/buildings.js), with no model.
// hearthvale (two outside stairs, signs): every stair square is solid and has a static physics box; in first
// person the player walks up to a stair from every side and never onto it; a ball thrown at a stair stops
// against it; a sign keeps 1.8 clear of another house's sign and never hangs into another house.
//   HEADLESS=1 ./launch-chrome.sh "about:blank"; node kit-test.mjs [--base=http://localhost:8003]
import { chromium } from 'playwright-core';
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:8000');
const b = await chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9223));
const page = b.contexts()[0].pages()[0];
let fails = 0, n = 0; const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
const check = async (name, fn) => { n++; let r; try { r = await fn(); } catch (e) { r = [false, 'threw ' + e.message]; } const [ok, info] = Array.isArray(r) ? r : [r, '']; if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, info ? '- ' + String(info).slice(0, 300) : ''); return ok; };
const ev = (fn, a) => page.evaluate(fn, a);
await page.goto(`${BASE}/app/?art=1&intro=0&t=${Date.now()}&scenario=/scenarios/hearthvale.json`);
await page.waitForFunction(() => window.tablefolkBuildings?.list?.().length && state.playerAvatar && state.scene?.getPhysicsEngine?.(), null, { timeout: 90000 });
await page.waitForTimeout(5000);

await check('outside stairs: their squares solid, a static physics box on each', () => ev(() => {
  const st = tablefolkBuildings.list().filter(b => b.A?.solid?.length), cells = st.flatMap(b => b.A.solid);
  const boxes = state.scene.meshes.filter(m => m.metadata?.stairCollider);
  return [st.length >= 1 && cells.every(([x, z]) => tablefolkBuildings.solidAt(x, z) && isBlocked(x, z)) && cells.every(([x, z]) => boxes.some(m => Math.round(m.position.x) === x && Math.round(m.position.z) === z && m.physicsBody?.getMotionType?.() === BABYLON.PhysicsMotionType.STATIC)), `${st.length} stairs, ${cells.length} squares, ${boxes.length} boxes`];
}));
await check('first person: walking at a stair from every side stops beside it', () => ev(async () => {
  const g = state.playerAvatar, out = []; tablefolk.setCameraView('first'); await new Promise(r => setTimeout(r, 400));
  for (const b of tablefolkBuildings.list()) for (const [cx, cz] of b.A?.solid || []) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const sx = cx + dx * 2.4, sz = cz + dz * 2.4; if (isBlocked(sx, sz) || !hasGroundAt(sx, sz)) continue;
    setCharacterLogicalPosition(g, new BABYLON.Vector3(sx, 0, sz)); state.fpYaw = Math.atan2(-dx, -dz); fpHeld.add('fwd');
    let onIt = false; for (let i = 0; i < 14; i++) { await new Promise(r => setTimeout(r, 80)); const p = g.logicalPos; if (b.A.solid.some(([x, z]) => Math.round(p.x) === x && Math.round(p.z) === z)) onIt = true; }
    fpHeld.delete('fwd'); out.push(onIt);
  }
  tablefolk.setCameraView('follow');
  return [out.length >= 4 && !out.some(Boolean), `${out.filter(Boolean).length} of ${out.length} approaches got onto a stair square`];
}));
await check('physics: a ball rolled at a stair stops against it', () => ev(async () => {
  const st = tablefolkBuildings.list().find(b => b.A?.solid?.length), [cx, cz] = st.A.solid[st.A.solid.length - 1];
  // from two squares out on the open side (away from the house), rolled toward the stair's low end
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !isBlocked(cx + dx * 2, cz + dz * 2) && !isBlocked(cx + dx, cz + dz) && hasGroundAt(cx + dx * 2, cz + dz * 2));
  if (!dirs.length) return [false, 'no open side'];
  const [dx, dz] = dirs[0], top = state.terrainTopY ?? 0;
  const ball = BABYLON.MeshBuilder.CreateSphere('kit_test_ball', { diameter: .3 }, state.scene); ball.position.set(cx + dx * 2.2, top + .2, cz + dz * 2.2);
  const agg = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 1, restitution: .1, friction: .5 }, state.scene);
  agg.body.setLinearVelocity(new BABYLON.Vector3(-dx * 6, 0, -dz * 6));
  let past = false; for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 50)); const p = ball.position; if ((dx && (p.x - cx) * dx < -.55) || (dz && (p.z - cz) * dz < -.55)) past = true; }
  const p = ball.position.clone(); agg.dispose(); ball.dispose();
  return [!past, `ball from ${dx},${dz} side of ${cx},${cz} ended at ${p.x.toFixed(2)},${p.z.toFixed(2)}`];
}));
await check('signs: another house\'s sign nearby moves this one 1.8 away (or takes it down)', () => ev(() => {
  const b = tablefolkBuildings.list().find(x => x.sp?.sign && x.A?.placed?.some(p => p.name === 'sign')); if (!b) return [false, 'no house with a sign'];
  const s0 = b.A.placed.find(p => p.name === 'sign'), q = [s0.loc[0], s0.loc[1]];
  const A2 = tablefolkBuildings.assemble({ ...b.sp, otherSigns: () => [q], foreignAt: () => false }), s1 = A2.placed.find(p => p.name === 'sign');
  const d = s1 ? Math.hypot(s1.loc[0] - q[0], s1.loc[1] - q[1]) : null;
  return [!s1 || d >= 1.8, s1 ? `moved ${d.toFixed(2)} from the other sign` : 'no sign (nothing clear)'];
}));
await check('signs: a tip that would hang in another house is not used', () => ev(() => {
  const b = tablefolkBuildings.list().find(x => x.sp?.sign && x.A?.placed?.some(p => p.name === 'sign')); if (!b) return [false, 'no house with a sign'];
  const s0 = b.A.placed.find(p => p.name === 'sign'), a = s0.ang - Math.PI / 2, tip = [Math.round(s0.loc[0] + Math.cos(a) * .9), Math.round(s0.loc[1] + Math.sin(a) * .9)];
  const A2 = tablefolkBuildings.assemble({ ...b.sp, otherSigns: () => [], foreignAt: (x, z) => x === tip[0] && z === tip[1] }), s1 = A2.placed.find(p => p.name === 'sign');
  const t1 = s1 && [Math.round(s1.loc[0] + Math.cos(s1.ang - Math.PI / 2) * .9), Math.round(s1.loc[1] + Math.sin(s1.ang - Math.PI / 2) * .9)];
  return [!s1 || t1[0] !== tip[0] || t1[1] !== tip[1], `tip was ${tip}, now ${t1 || 'no sign'}`];
}));
await check('signs: in the built village none within 1.8 of another, none hanging into another house', () => ev(() => {
  const all = tablefolkBuildings.list().concat(tablefolkBuildings.closedList()), signs = [];
  for (const b of all) for (const p of (b.A?.placed || []).filter(p => p.name === 'sign')) { const a = p.ang - Math.PI / 2; signs.push({ key: b.key, p: [p.loc[0], p.loc[1]], tip: [Math.round(p.loc[0] + Math.cos(a) * .9), Math.round(p.loc[1] + Math.sin(a) * .9)] }); }
  const close = signs.some((s, i) => signs.some((t, j) => j > i && t.key !== s.key && Math.hypot(s.p[0] - t.p[0], s.p[1] - t.p[1]) < 1.8));
  const into = signs.filter(s => all.some(b => b.key !== s.key && b.A?.bbox && s.tip[0] >= b.A.bbox[0] + 1 && s.tip[0] <= b.A.bbox[2] - 1 && s.tip[1] >= b.A.bbox[1] + 1 && s.tip[1] <= b.A.bbox[3] - 1));
  return [!close && !into.length, `${signs.length} signs`];
}));
await check('no page errors', () => [!errs.length, errs.slice(0, 3).join(' | ')]);
console.log(fails ? `${fails}/${n} FAILED` : `all ${n} passed`);
await b.close().catch(() => {});
process.exit(fails ? 1 : 0);
