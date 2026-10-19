// Build one game figure from Quaternius's Universal rig kits (CC0):
// an outfit (Modular Character Outfits - Fantasy), the head, eyes and brows
// of a Universal Base Character, an optional hairstyle, and clips from the
// Universal Animation Library (its Unreal FBX converted with FBX2glTF:
// `FBX2glTF -b -i AL_Standard.fbx -o al`), retargeted onto the outfit's
// skeleton (same bone names; rotations relative to each rig's rest pose,
// the hips' motion scaled from centimetres).
//
//   node tools/build-figure.mjs --outfit Male_Ranger.gltf --base Superhero_Male_FullBody.gltf \
//        --keep SuperHero_Male,Eyes,Eyebrows --headOnly SuperHero_Male [--hair Hair_Beard.gltf] \
//        --anims al.glb --clips Idle_Loop,Walk_Loop,... --out ranger.glb
//
// Needs @gltf-transform/core, extensions, functions 4.5.1: npm i them in a
// folder and run a copy of this script from there (ES modules resolve
// packages next to the script). Then compress with tools/compress-glb.sh.
// tools/build-figures.sh builds the game's set.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, unpartition } from '@gltf-transform/functions';

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(arg('outfit'));
const root = doc.getRoot();
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
const outSkin = root.listSkins()[0];

// Pull meshes from another file onto this skeleton: each skinned mesh node
// gets a new skin over the outfit's joints of the same names (its own
// inverse bind matrices, so it sits on the bones as it did on its own rig).
// headOnly: for these meshes keep only the triangles skinned mostly to the
// head and neck (the base body's head, without the body under the clothes).
const HEAD = new Set(['Head', 'neck_01', 'neck_02']);
function cutToHead(mesh, skin) {
  const joints = skin.listJoints().map(j => j.getName());
  for (const prim of mesh.listPrimitives()) {
    const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), idx = prim.getIndices();
    if (!J || !W || !idx) continue;
    const head = v => { const j = J.getElement(v, []), w = W.getElement(v, []); let best = 0; for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k; return HEAD.has(joints[j[best]]); };
    const a = idx.getArray(), keep = [];
    for (let i = 0; i < a.length; i += 3) if (head(a[i]) || head(a[i + 1]) || head(a[i + 2])) keep.push(a[i], a[i + 1], a[i + 2]);
    idx.setArray(a.length > 65535 || Math.max(...keep) > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
  }
}
const headOnly = (arg('headOnly') || '').split(',').filter(Boolean);
async function graft(file, keep) {
  const other = await io.read(file);
  const before = new Set(root.listNodes());
  const map = mergeDocuments(doc, other);
  const added = root.listNodes().filter(n => !before.has(n));
  const scenes = root.listScenes(); const extraScene = scenes[scenes.length - 1];
  for (const n of added) {
    const mesh = n.getMesh(), skin = n.getSkin();
    if (!mesh || !skin) continue;
    if (keep && !keep.includes(n.getName()) && !keep.includes(mesh.getName())) continue;
    if (headOnly.includes(n.getName()) || headOnly.includes(mesh.getName())) cutToHead(mesh, skin);
    const s = doc.createSkin(n.getName() + '_skin').setInverseBindMatrices(skin.getInverseBindMatrices());
    for (const j of skin.listJoints()) { const t = byName.get(j.getName()); if (!t) throw new Error('no joint ' + j.getName()); s.addJoint(t); }
    s.setSkeleton(outSkin.getSkeleton() || null);
    const keepNode = doc.createNode(n.getName()).setMesh(mesh).setSkin(s);
    byName.get('Armature')?.addChild(keepNode) || root.getDefaultScene().addChild(keepNode);
  }
  // drop the grafted file's own scene and nodes
  for (const n of added) n.dispose();
  extraScene.dispose();
}
const keep = (arg('keep') || '').split(',').filter(Boolean);
if (arg('base')) await graft(arg('base'), keep);
for (const h of (arg('hair') || '').split(',').filter(Boolean)) await graft(h, null);

// --hairColor r,g,b (0-1): the hair texture is grey, meant to be tinted
if (arg('hairColor')) {
  const c = arg('hairColor').split(',').map(Number);
  for (const mat of root.listMaterials()) if (/hair/i.test(mat.getName())) mat.setBaseColorFactor([c[0], c[1], c[2], 1]);
}

// ---- animations ----
const quat = {
  mul: (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]],
  inv: q => [-q[0], -q[1], -q[2], q[3]],
};
if (arg('anims')) {
  const an = await io.read(arg('anims'));
  const aNodes = new Map(an.getRoot().listNodes().map(n => [n.getName(), n]));
  const want = (arg('clips') || '').split(',').filter(Boolean);
  // --rename Idle_Loop=Idle,Walk_Loop=Walk: the clip names the game looks for
  const rename = Object.fromEntries((arg('rename') || '').split(',').filter(Boolean).map(p => p.split('=')));
  const pelvisA = aNodes.get('pelvis').getTranslation(), pelvisO = byName.get('pelvis').getTranslation();
  const scale = Math.hypot(...pelvisO) / Math.hypot(...pelvisA);
  for (const a of an.getRoot().listAnimations()) {
    const name = a.getName().replace(/^.*\|/, '');
    if (want.length && !want.includes(name)) continue;
    const out = doc.createAnimation(rename[name] || name);
    for (const ch of a.listChannels()) {
      const src = ch.getTargetNode(), path = ch.getTargetPath(), tgt = byName.get(src?.getName());
      if (!tgt || (path === 'translation' && src.getName() !== 'pelvis') || path === 'scale') continue;
      const smp = ch.getSampler(), inp = smp.getInput(), val = smp.getOutput().getArray(), n = val.length;
      const outArr = new Float32Array(n);
      if (path === 'rotation') {
        const rA = src.getRotation(), rO = tgt.getRotation(), fix = quat.mul(rO, quat.inv(rA));
        for (let i = 0; i < n; i += 4) { const q = quat.mul(fix, [val[i], val[i + 1], val[i + 2], val[i + 3]]); outArr.set(q, i); }
      } else {
        const tA = src.getTranslation(), tO = tgt.getTranslation();
        for (let i = 0; i < n; i += 3) for (let k = 0; k < 3; k++) outArr[i + k] = tO[k] + (val[i + k] - tA[k]) * scale;
      }
      const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(inp.getArray()));
      const output = doc.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(outArr);
      const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(smp.getInterpolation());
      out.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(tgt).setTargetPath(path).setSampler(s));
    }
  }
}
await doc.transform(prune(), dedup(), unpartition());
await io.write(arg('out'), doc);
console.log('wrote', arg('out'), root.listAnimations().map(a => a.getName()).join(','));
