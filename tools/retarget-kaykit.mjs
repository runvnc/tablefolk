// Retarget KayKit Rig_Medium clips (assets/models/animations/kaykit/, CC0)
// onto a Meshy auto-rigged model (24 bones: Hips, Spine02, Spine01, Spine,
// neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg,
// LeftLeg, LeftFoot, LeftToeBase and the right side) and add them to the
// model as more clips under their KayKit names (Sit_Chair_Idle, Chopping, ...).
//
//   node retarget-kaykit.mjs model.glb out.glb [kaykit dir] [Clip,Clip,...]
//
// The two rigs differ: KayKit is a T-posed chibi (big head, short legs),
// Meshy an A-posed adult. Each mapped bone takes the source bone's world
// rotation change from its rest pose, applied to the target bone after
// turning it to point the way the source bone points at rest (so the A-pose
// arms follow the T-pose arms). The torso and head keep their own rest
// orientation (both rigs stand upright facing +Z). Bones with no source
// (shoulders, Spine01, neck) keep their rest pose relative to their parent.
// Hip motion is moved by the leg joints' midpoint, scaled by leg length.
//
// Works on decoded data (meshopt decoder), writes it uncompressed;
// tools/retarget-people.sh runs it on every Meshy model and recompresses.
// Rerunning replaces the clips it added. Previews: tools/preview-clips.py.
// Needs @gltf-transform/core, extensions 4.5.1 and meshoptimizer next to a
// copy of this script (like merge-clips.mjs).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const [model, out, kitDir = 'assets/models/animations/kaykit', clipArg] = process.argv.slice(2);
const FPS = 30;
export const CLIPS = (clipArg || [
  'Interact', 'PickUp', 'Use_Item', 'Throw',
  'Cheering', 'Waving', 'Lie_Down', 'Lie_Idle', 'Lie_StandUp',
  'Sit_Chair_Down', 'Sit_Chair_Idle', 'Sit_Chair_StandUp', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sit_Floor_StandUp',
  'Chopping', 'Digging', 'Hammering', 'Lockpicking', 'Pickaxing', 'Sawing', 'Working_A', 'Working_B', 'Holding_A', 'Fishing_Idle', 'Fishing_Cast',
  'Running_A', 'Jump_Full_Short', 'Walking_Backwards', 'Sneaking', 'Crouching',
  'Melee_1H_Attack_Chop', 'Melee_1H_Attack_Stab', 'Melee_2H_Attack_Chop', 'Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Attack_Kick', 'Melee_Block',
  'Ranged_Magic_Spellcasting', 'Ranged_Magic_Shoot', 'Ranged_Magic_Raise', 'Ranged_Bow_Draw', 'Ranged_Bow_Release',
].join(',')).split(',');

// target bone <- source bone; end: the joint the bone points at (for aiming at rest)
const MAP = {
  Hips: { src: 'hips' }, Spine02: { src: 'spine' }, Spine: { src: 'chest' }, Head: { src: 'head' },
  LeftArm: { src: 'upperarm.l', end: ['LeftForeArm', 'lowerarm.l'] }, LeftForeArm: { src: 'lowerarm.l', end: ['LeftHand', 'wrist.l'] }, LeftHand: { src: 'wrist.l', like: 'LeftForeArm' },
  RightArm: { src: 'upperarm.r', end: ['RightForeArm', 'lowerarm.r'] }, RightForeArm: { src: 'lowerarm.r', end: ['RightHand', 'wrist.r'] }, RightHand: { src: 'wrist.r', like: 'RightForeArm' },
  LeftUpLeg: { src: 'upperleg.l', end: ['LeftLeg', 'lowerleg.l'] }, LeftLeg: { src: 'lowerleg.l', end: ['LeftFoot', 'foot.l'] }, LeftFoot: { src: 'foot.l', end: ['LeftToeBase', 'toes.l'] }, LeftToeBase: { src: 'toes.l', like: 'LeftFoot' },
  RightUpLeg: { src: 'upperleg.r', end: ['RightLeg', 'lowerleg.r'] }, RightLeg: { src: 'lowerleg.r', end: ['RightFoot', 'foot.r'] }, RightFoot: { src: 'foot.r', end: ['RightToeBase', 'toes.r'] }, RightToeBase: { src: 'toes.r', like: 'RightFoot' },
};

// ---- quaternions [x,y,z,w] and vectors
const qmul = (a, b) => [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0], a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = q => { const l = Math.hypot(...q) || 1; return q.map(x => x / l); };
const qrot = (q, v) => { const r = qmul(qmul(q, [...v, 0]), qinv(q)); return [r[0], r[1], r[2]]; };
const vadd = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]], vsub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], vmul = (a, k) => a.map(x => x * k), vmul3 = (a, b) => [a[0]*b[0], a[1]*b[1], a[2]*b[2]];
const vnorm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
function arc(from, to) {   // shortest rotation taking direction from onto to
  const a = vnorm(from), b = vnorm(to), d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  if (d < -0.9999) { const ax = Math.abs(a[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const c = vnorm([a[1]*ax[2]-a[2]*ax[1], a[2]*ax[0]-a[0]*ax[2], a[0]*ax[1]-a[1]*ax[0]]); return [...c, 0]; }
  const c = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  return qnorm([...c, 1 + d]);
}

// ---- sampling a glTF animation channel
function sample(ch, t) {
  const s = ch.getSampler(), times = s.getInput().getArray(), out = s.getOutput().getArray(), size = ch.getTargetPath() === 'rotation' ? 4 : 3;
  const cubic = s.getInterpolation() === 'CUBICSPLINE', stride = cubic ? size * 3 : size, off = cubic ? size : 0;
  const at = i => Array.from(out.slice(i * stride + off, i * stride + off + size));
  if (t <= times[0]) return at(0);
  const n = times.length; if (t >= times[n - 1]) return at(n - 1);
  let i = 0; while (times[i + 1] < t) i++;
  if (s.getInterpolation() === 'STEP') return at(i);
  const k = (t - times[i]) / (times[i + 1] - times[i]), a = at(i), b = at(i + 1);
  if (size === 4) {   // nlerp, sign-aligned (fine at 30 fps keys)
    const d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3], sgn = d < 0 ? -1 : 1;
    return qnorm(a.map((x, j) => x * (1 - k) + sgn * b[j] * k));
  }
  return a.map((x, j) => x * (1 - k) + b[j] * k);
}

// world rotation and position of every node, given local overrides
function worlds(nodes, local) {
  const W = new Map();
  const visit = (n, pr, pt, ps) => {
    const l = local(n), r = qmul(pr, l.r), t = vadd(pt, qrot(pr, vmul3(ps, l.t))), s = vmul3(ps, l.s);
    W.set(n.getName(), { r, t, s, node: n });
    for (const c of n.listChildren()) visit(c, r, t, s);
  };
  for (const n of nodes) if (!n.getParentNode()) visit(n, [0, 0, 0, 1], [0, 0, 0], [1, 1, 1]);
  return W;
}
// a source clip's pose at time t (world rotations and positions)
function poseAt(src, t) {
  if (!src.chans) { src.chans = new Map(); for (const ch of src.anim.listChannels()) { const n = ch.getTargetNode()?.getName(); if (!src.chans.has(n)) src.chans.set(n, {}); src.chans.get(n)[ch.getTargetPath()] = ch; } }
  return worlds(src.nodes, n => { const c = src.chans.get(n.getName()) || {}, r = rest(n); return { r: c.rotation ? sample(c.rotation, t) : r.r, t: c.translation ? sample(c.translation, t) : r.t, s: c.scale ? sample(c.scale, t) : r.s }; });
}
// clips whose hips are moved so this clip's first frame has them at the origin
const ANCHOR = { '^Sit_Chair_': 'Sit_Chair_Idle', '^Sit_Floor_': 'Sit_Floor_Idle', '^Lie_': 'Lie_Idle' };
const rest = n => ({ r: n.getRotation(), t: n.getTranslation(), s: n.getScale() });

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// source clips by name, from every KayKit file
const kit = new Map(); let kitNodes = null;
for (const f of readdirSync(kitDir).filter(f => f.endsWith('.glb')).sort()) {
  const d = await io.read(join(kitDir, f));
  for (const a of d.getRoot().listAnimations()) if (!kit.has(a.getName())) kit.set(a.getName(), { anim: a, nodes: d.getRoot().listNodes() });
}

const ARM = new Set(['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']);
const idleRef = poseAt(kit.get('Idle_A'), 0);   // KayKit Idle_A's first frame
const doc = await io.read(model), root = doc.getRoot(), buf = root.listBuffers()[0];
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();   // written plain; recompressed after
for (const a of root.listAnimations()) if (CLIPS.includes(a.getName())) a.dispose();   // rerun: replace, not add
const tNodes = root.listNodes(), tByName = new Map(tNodes.map(n => [n.getName(), n]));
const tRest = worlds(tNodes, rest);
const bones = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
for (const b of bones) if (!tByName.has(b)) throw new Error(`${model}: no bone ${b} (not a Meshy rig?)`);

// One clip solved on the target: per frame, every bone's local rotation and
// the hips' world position, plus where the feet and legs ended up. Cached:
// the chair and bed clips are grounded by their idle clip.
const solved = new Map();
function solve(name) {
  if (solved.has(name)) return solved.get(name);
  const src = kit.get(name); if (!src) return null;
  const sRest = worlds(src.nodes, rest);
  // rest alignment per target bone (world rotation turning the target's rest direction onto the source's)
  const align = {};
  for (const [tb, m] of Object.entries(MAP)) {
    if (m.end) align[tb] = arc(vsub(tRest.get(m.end[0]).t, tRest.get(tb).t), vsub(sRest.get(m.end[1]).t, sRest.get(m.src).t));
  }
  for (const [tb, m] of Object.entries(MAP)) if (m.like) align[tb] = align[m.like];
  // arms: KayKit's idle pose maps onto the Meshy A-pose (the chibi holds its
  // arms out from a wide body; measured from rest, they came out spread wide)
  const ref = b => ARM.has(b) ? idleRef.get(MAP[b].src).r : sRest.get(MAP[b].src).r;
  for (const b of ARM) align[b] = [0, 0, 0, 1];
  // leg length ratio and the hips' offset to the leg joints' midpoint
  const mid = W => vmul(vadd(W.get(W === tRest ? 'LeftUpLeg' : 'upperleg.l').t, W.get(W === tRest ? 'RightUpLeg' : 'upperleg.r').t), .5);
  const sMid0 = mid(sRest), tMid0 = mid(tRest);
  const legS = sMid0[1] - Math.min(sRest.get('foot.l').t[1], sRest.get('foot.r').t[1]), legT = tMid0[1] - Math.min(tRest.get('LeftFoot').t[1], tRest.get('RightFoot').t[1]);
  const ratio = legT / legS;
  const hipsToMid = qrot(qinv(tRest.get('Hips').r), vsub(tMid0, tRest.get('Hips').t));
  // chairs and beds: the seated or lying hips end up over the character's
  // origin (KayKit sits back onto a chair behind it), so the game can stand a
  // character on the seat or bed and play the clip there
  const anchorClip = Object.entries(ANCHOR).find(([re]) => new RegExp(re).test(name))?.[1];
  let shift = [0, 0, 0];
  if (anchorClip && kit.has(anchorClip)) { const d = vsub(mid(poseAt(kit.get(anchorClip), 0)), sMid0); shift = [-d[0] * ratio, 0, -d[2] * ratio]; }

  const dur = Math.max(...src.anim.listSamplers().map(s => s.getInput().getMax([])[0] || 0));
  const frames = Math.max(1, Math.round(dur * FPS) + 1);
  const out = { frames, ratio, times: new Float32Array(frames), rot: Object.fromEntries(bones.map(b => [b, new Float32Array(frames * 4)])), hips: [], foot: [], seat: [] };
  for (let f = 0; f < frames; f++) {
    const t = Math.min(dur, f / FPS); out.times[f] = t;
    const sW = poseAt(src, t);
    // target world rotations, parents first (bones is in hierarchy order)
    const want = new Map();
    const parentW = b => { const p = tByName.get(b).getParentNode(); return want.get(p.getName()) || tRest.get(p.getName()).r; };
    for (const b of bones) {
      const m = MAP[b];
      if (m) {
        const delta = qmul(sW.get(m.src).r, qinv(ref(b)));
        want.set(b, qnorm(qmul(qmul(delta, align[b] || [0, 0, 0, 1]), tRest.get(b).r)));
      } else want.set(b, qnorm(qmul(parentW(b), tByName.get(b).getRotation())));
      out.rot[b].set(qnorm(qmul(qinv(parentW(b)), want.get(b))), f * 4);
    }
    // hips: place the leg joints' midpoint where the source's went, scaled
    const tMid = vadd(vadd(tMid0, vmul(vsub(mid(sW), sMid0), ratio)), shift);
    const hipsWorld = vsub(tMid, qrot(want.get('Hips'), hipsToMid));
    out.hips.push(hipsWorld);
    // forward kinematics: the lowest foot point and the leg joints' height
    const P = new Map([['Hips', hipsWorld]]);
    for (const b of bones.slice(1)) { const n = tByName.get(b), p = n.getParentNode().getName(); P.set(b, vadd(P.get(p), qrot(want.get(p), vmul3(n.getTranslation(), tRest.get(p).s)))); }
    out.foot.push(Math.min(...['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map(b => P.get(b)[1])));
    out.seat.push((P.get('LeftUpLeg')[1] + P.get('RightUpLeg')[1]) / 2);
  }
  solved.set(name, out);
  return out;
}

// Grounding (metres, model space). The chibi's proportions put feet in the
// air: its chair seat is level with an adult's hips (feet dangling 0.6 m up),
// its lying pelvis 0.3 m up. Standing clips: the lowest foot over the whole
// clip touches the floor. Chair clips: seated (Sit_Chair_Idle), the feet
// rest on the floor. Lying (Lie_Idle): the pelvis on the floor (on a bed, the
// game raises the character to the mattress). The way down and back up
// keep the lowest foot on the floor down to the seated or lying height.
const restFoot = Math.min(tRest.get('LeftFoot').t[1], tRest.get('LeftToeBase').t[1], tRest.get('RightFoot').t[1], tRest.get('RightToeBase').t[1]);
const LIE_PELVIS = 0.13;
const minOf = a => Math.min(...a);
function lift(name, c) {
  const stand = restFoot - minOf(c.foot);
  // the way down and back up: the lowest foot stays on the floor, never
  // lowered further than seated or lying
  const onFloor = low => f => Math.max(low, restFoot - c.foot[f]);
  if (/^Sit_Chair_/.test(name)) { const i = solve('Sit_Chair_Idle'), low = restFoot - minOf(i.foot); return /Idle$/.test(name) ? () => low : onFloor(low); }
  if (/^Lie_/.test(name)) { const i = solve('Lie_Idle'), low = Math.max(LIE_PELVIS - minOf(i.seat), restFoot - minOf(i.foot)); return /Idle$/.test(name) ? () => low : onFloor(low); }
  return () => stand;
}

for (const name of CLIPS) {
  const c = solve(name); if (!c) { console.warn('no KayKit clip', name); continue; }
  const dy = lift(name, c);
  const par = tRest.get(tByName.get('Hips').getParentNode().getName());
  const hipsT = new Float32Array(c.frames * 3);
  for (let f = 0; f < c.frames; f++) {
    const w = vadd(c.hips[f], [0, dy(f), 0]);
    hipsT.set(vmul3(qrot(qinv(par.r), vsub(w, par.t)), par.s.map(x => 1 / x)), f * 3);   // into the Armature's space (Meshy: centimetres, scale 0.01)
  }
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor().setType('SCALAR').setArray(c.times).setBuffer(buf);
  const add = (node, path, arr, type) => {
    const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(arr).setBuffer(buf)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
  };
  for (const b of bones) add(tByName.get(b), 'rotation', c.rot[b], 'VEC4');
  add(tByName.get('Hips'), 'translation', hipsT, 'VEC3');
  const d0 = dy(0), d1 = dy(c.frames - 1);
  console.log(`${name}: ${c.frames} frames, legs x${c.ratio.toFixed(2)}, lowered ${(-d0).toFixed(2)}${d1 !== d0 ? '..' + (-d1).toFixed(2) : ''} m` + (process.env.DEBUG ? `, seat ${(c.seat[0] + d0).toFixed(2)} m, lowest foot ${minOf(c.foot.map((y, f) => y + dy(f))).toFixed(2)}` : ''));
}
await io.write(out, doc);
console.log('wrote', out);
