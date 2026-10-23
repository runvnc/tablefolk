// Merge animation clips into one rigged model: Meshy (fal.ai) returns the
// rigged character and one GLB per clip (each with the whole mesh again).
// The clips' channels are copied onto the rigged model's bones (same names),
// renamed to what the game asks for (app.js FIG_CLIPS: Idle, Walk, Attack,
// HitReact, Death).
//
//   node merge-clips.mjs rigged.glb out.glb Idle=clip_Idle.glb Walk=clip_Walk.glb ...
//
// Needs @gltf-transform/core, extensions, functions 4.5.1 next to a copy of
// this script (see tools/build-figure.mjs). Then: tools/compress-glb.sh out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

const [rigged, out, ...pairs] = process.argv.slice(2);
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
    const sampler = doc.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    n++;
  }
  console.log(`${name}: ${n} channels from ${file}${missing.size ? ` (${missing.size} targets missing)` : ''}`);
}
await doc.transform(dedup(), prune());
await io.write(out, doc);
console.log('wrote', out);
