// Merge animation clips into one rigged model: Meshy (fal.ai) returns the
// rigged character and one GLB per clip (each with the whole mesh again).
// The clips' channels are copied onto the rigged model's bones (same names),
// renamed to what the game asks for (app.js FIG_CLIPS: Idle, Walk, Attack,
// HitReact, Death).
//
//   node merge-clips.mjs rigged.glb out.glb Idle=clip_Idle.glb Walk=clip_Walk.glb ...
//
// CALM=0.3 (environment) damps the Idle clip: every key is pulled toward the
// bone's average pose, keeping that share of the motion (Meshy's idle turns
// the head and hips about 90 degrees, which reads as fidgeting in a game).
// The head, neck and hips keep half of that share again.
//
// Needs @gltf-transform/core, extensions, functions 4.5.1 next to a copy of
// this script (see tools/build-figure.mjs). Then: tools/compress-glb.sh out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

const [rigged, out, ...pairs] = process.argv.slice(2);
const CALM = Number(process.env.CALM || 0);
// Pull a sampler's keys toward their average: quaternions by slerp (signs
// aligned first), vectors linearly. Loops stay closed: equal ends stay equal.
function calm(arr, size, k) {
  const n = arr.length / size, mean = new Array(size).fill(0);
  if (size === 4) for (let i = 0; i < n; i++) {
    const s = arr[i*4]*arr[0] + arr[i*4+1]*arr[1] + arr[i*4+2]*arr[2] + arr[i*4+3]*arr[3] < 0 ? -1 : 1;
    for (let j = 0; j < 4; j++) mean[j] += s * arr[i*4+j];
  } else for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) mean[j] += arr[i*size+j];
  const len = size === 4 ? Math.hypot(...mean) : n; for (let j = 0; j < size; j++) mean[j] /= len;
  for (let i = 0; i < n; i++) {
    const v = Array.from(arr.slice(i*size, i*size+size));
    if (size === 4) {
      let d = mean[0]*v[0] + mean[1]*v[1] + mean[2]*v[2] + mean[3]*v[3]; if (d < 0) { for (let j = 0; j < 4; j++) v[j] = -v[j]; d = -d; }
      const th = Math.acos(Math.min(1, d)), sn = Math.sin(th);
      const a = sn < 1e-6 ? 1 - k : Math.sin((1 - k) * th) / sn, b = sn < 1e-6 ? k : Math.sin(k * th) / sn;
      const q = mean.map((m, j) => a * m + b * v[j]), l = Math.hypot(...q);
      for (let j = 0; j < 4; j++) arr[i*4+j] = q[j] / l;
    } else for (let j = 0; j < size; j++) arr[i*size+j] = mean[j] + k * (v[j] - mean[j]);
  }
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(rigged), root = doc.getRoot(), buf = root.listBuffers()[0];
for (const a of root.listAnimations()) a.dispose();   // only the clips we name
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));

for (const pair of pairs) {
  const [name, file] = pair.split('=');
  const src = await io.read(file), anims = src.getRoot().listAnimations();
  if (!anims.length) { console.warn('no animation in', file); continue; }
  const a = anims[0], anim = doc.createAnimation(name);
  const copyAcc = acc => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buf).setNormalized(acc.getNormalized());
  let n = 0, missing = new Set();
  for (const ch of a.listChannels()) {
    const target = byName.get(ch.getTargetNode()?.getName());
    if (!target) { missing.add(ch.getTargetNode()?.getName()); continue; }
    const s = ch.getSampler();
    const output = copyAcc(s.getOutput()), path = ch.getTargetPath();
    if (CALM && name === 'Idle' && (path === 'rotation' || path === 'translation')) calm(output.getArray(), path === 'rotation' ? 4 : 3, /^(Head|neck|Hips)/i.test(target.getName()) ? CALM / 2 : CALM);
    const sampler = doc.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(output).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    n++;
  }
  console.log(`${name}: ${n} channels from ${file}${missing.size ? ` (${missing.size} targets missing)` : ''}`);
}
await doc.transform(dedup(), prune());
await io.write(out, doc);
console.log('wrote', out);
