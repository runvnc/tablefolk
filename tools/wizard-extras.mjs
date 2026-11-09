// Adds The Oracle's look to wizard.glb (Quaternius): a tall, bent oracle's
// hat on the head bone, a glowing orb with a gold collar on the staff's
// knob, each its own mesh and material (the body keeps its one atlas), the
// staff held upright and longer (Idle takes Walk's right arm), and a talking
// mouth (a Mouth mesh and a beard "jaw", morph targets named mouth_open that
// app.js drives from the voice). Run it on the face-corrected file
// (tools/fix-wizard-face.mjs first), then bump the wizard's v in FIGURES:
//
//   cp tools/wizard-extras.mjs ~/.cache/tablefolk-gltf/   (beside gltf-transform's node_modules)
//   git show 4214518:assets/models/characters/quaternius/wizard.glb > face.glb
//   node ~/.cache/tablefolk-gltf/wizard-extras.mjs face.glb out.glb
//
// Spaces: the hat is built in the Face mesh's space (a child of Head with the
// Face node's transform: x across, -y forward, z up; the skull spans x ±.64,
// y -.87..1, z up to .95), the orb in the staff's (a child of Weapon.R: the
// staff runs along y, its knob at y = -1, radius .15).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { reorder, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const [input, output] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot(), buf = root.listBuffers()[0];
const node = name => root.listNodes().find(n => n.getName() === name);
if (node('Hat') || node('Staff_Orb')) throw new Error('already has the extras: run it on the face-corrected file');

// ---- small mesh builder (positions, colours, indices; normals averaged per vertex)
function builder() {
  const P = [], C = [], I = [];
  return {
    P, C, I,
    v(p, c) { P.push(p); C.push(c); return P.length - 1; },
    tri(a, b, c) { I.push(a, b, c); },
    quad(a, b, c, d) { I.push(a, b, c, a, c, d); },
    normals() {
      const N = P.map(() => [0, 0, 0]);
      for (let i = 0; i < I.length; i += 3) {
        const [a, b, c] = [P[I[i]], P[I[i + 1]], P[I[i + 2]]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        for (const k of [I[i], I[i + 1], I[i + 2]]) for (let j = 0; j < 3; j++) N[k][j] += n[j];
      }
      return N.map(n => { const l = Math.hypot(...n) || 1; return n.map(x => x / l); });
    },
  };
}
function primitive(b, material) {
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', Float32Array.from(b.P.flat())))
    .setAttribute('NORMAL', acc('VEC3', Float32Array.from(b.normals().flat())))
    .setAttribute('COLOR_0', acc('VEC4', Float32Array.from(b.C.map(c => [...c, 1]).flat())))
    .setIndices(acc('SCALAR', Uint16Array.from(b.I)))
    .setMaterial(material);
}
const lin = h => { const s = parseInt(h.slice(1), 16); return [s >> 16, s >> 8 & 255, s & 255].map(x => (x / 255) ** 2.2); };
const NAVY = lin('#1f3a8f'), NAVY_D = lin('#152a6b'), GOLD = lin('#e0b040'), GOLD_D = lin('#a8781e');

// ---- the staff held upright. Quaternius' Idle lowers the right arm and the
// staff lies almost flat (orb at the hip, "a lollipop"); its Walk carries it
// upright. Idle takes Walk's right-arm pose (first frame, held still), the
// staff turns a little in the hand (STAFF_FIX, measured in the game so it
// stands vertical in Idle) and grows: the hand slides down the shaft
// (STAFF_SHIFT, mesh units: the mesh is 2 long, .36 m in the game) and the
// shaft below it lengthens (STAFF_GROW) so the foot still reaches the floor.
const ARM_R = /^(Shoulder|UpperArm|LowerArm|Fist|Fist1|Fist2|Thumb1|Thumb2|Weapon)\.R$/;
const STAFF_SHIFT = .75, STAFF_GROW = .85, STAFF_FIX = [0, .071, .0967, .9927];   // FIX: turns the staff's axis (-x in Weapon.R) onto Idle's up there, (-.971, -.192, .141)
{
  const anim = n => root.listAnimations().find(a => a.getName().endsWith('|' + n));
  const idle = anim('Idle'), walk = anim('Walk');
  const dur = Math.max(...idle.listSamplers().map(s => s.getInput().getMax([])[0]));
  for (const ch of walk.listChannels()) {
    const tn = ch.getTargetNode(), path = ch.getTargetPath(); if (!tn || !ARM_R.test(tn.getName())) continue;
    const s = ch.getSampler(), out = s.getOutput(), v = out.getElement(s.getInterpolation() === 'CUBICSPLINE' ? 1 : 0, []);
    for (const old of idle.listChannels()) if (old.getTargetNode() === tn && old.getTargetPath() === path) { const os = old.getSampler(); idle.removeChannel(old); old.dispose(); idle.removeSampler(os); os.dispose(); }
    const smp = doc.createAnimationSampler().setInterpolation('LINEAR')
      .setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, dur])).setBuffer(buf))
      .setOutput(doc.createAccessor().setType(out.getType()).setArray(new Float32Array([...v, ...v])).setBuffer(buf));
    idle.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(tn).setTargetPath(path).setSampler(smp));
  }
  const st = node('Wizard_Staff'), sp = st.getMesh().listPrimitives()[0], a = sp.getAttribute('POSITION');
  const P = Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, []));
  for (const p of P) p[1] += (p[1] > .25 ? STAFF_GROW : 0) - STAFF_SHIFT;   // no vertices between y .05 and .45: the plain shaft
  sp.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(P.flat())).setBuffer(buf));
  // turn about the grip
  const q = st.getRotation(), t = st.getTranslation(), sc = st.getScale()[0];
  const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const rot = (q, v) => { const r = qm(qm(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]); return r.slice(0, 3); };
  const gripMesh = [.033, -.206, .047];   // Weapon.R's origin in the mesh
  const grip = rot(q, gripMesh).map((x, k) => x * sc + t[k]);
  const q2 = qm(STAFF_FIX, q), g2 = rot(q2, gripMesh).map(x => x * sc);
  st.setRotation(q2).setTranslation(grip.map((x, k) => x - g2[k]));
}

let FACE_P = null;
const face = node('Face');
// the hat presses the spiky hair down: everything above the crown line is flattened under the cone
{ const fp = face.getMesh().listPrimitives()[0], a = fp.getAttribute('POSITION'), P = Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, []));
  const LINE = .36; let n = 0;
  for (const p of P) if (p[2] > LINE) { p[2] = LINE + (p[2] - LINE) * .06; p[0] *= .95; p[1] = p[1] * .95 + .005; n++; }
  fp.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(P.flat())).setBuffer(buf));
  console.log('hair pressed down:', n, 'vertices'); FACE_P = P; }

// ---- the hat: a brim, then a cone that leans back and bends over near the tip
const hat = builder(), SEG = 28;
const CX = 0, CY = .1, Z0 = .3;                 // where it sits on the crown
const RX = .74, RY = 1.0;                         // the cone's foot (the skull is wider front-to-back)
const H = 2.5, RINGS = 22;
const centre = t => {                             // the cone's axis, t = 0 foot .. 1 tip
  const back = .6 * t * t + 1.1 * Math.max(0, t - .62) ** 2 * 3;   // leans back, then flops
  const up = H * (t - .38 * Math.max(0, t - .62) ** 2 * 3);
  return [CX, CY + back, Z0 + up];
};
const rad = t => Math.max(.02, (1 - t) ** 1.15);
// The cone's lower rings fit the head: at each ring's height the head's
// vertices (after the hair is pressed down) are measured in the ring's own
// ellipse units, per direction, and the ring is widened to clear them by 15%
// (the forehead and hair came through the band at the front and sides).
// The body mesh (Wizard.001) has the ears: its vertices go into the fit too,
// brought into the Face's space through both nodes' rest-pose world matrices.
{
  const inv = m => { // 4x4 column-major inverse (general)
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
      (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
      (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
      (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d];
  };
  const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
  // skinned (and quantized): a vertex's rest position is its main joint's world
  // matrix times that joint's inverse bind matrix (which holds the dequantization)
  const body = node('Wizard.001'), skin = body.getSkin(), joints = skin.listJoints(), ibm = skin.getInverseBindMatrices();
  const faceInv = inv(face.getWorldMatrix()), perJoint = joints.map((j, i) => mul(faceInv, mul(j.getWorldMatrix(), ibm.getElement(i, []))));
  const prim = body.getMesh().listPrimitives()[0], a = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'); let n = 0;
  for (let i = 0; i < a.getCount(); i++) {
    const w = W.getElement(i, []), jj = J.getElement(i, []), main = jj[w.indexOf(Math.max(...w))];
    const [x, y, z] = a.getElement(i, []), m = perJoint[main];
    const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    if (p[2] > -.2 && Math.abs(p[0]) < 1.8 && Math.abs(p[1]) < 1.8) { FACE_P.push(p); n++; }
  }
  console.log('body vertices near the head in the fit:', n);
}
const fitAt = (cx, cy, cz, k) => {
  const need = new Array(SEG).fill(0);
  for (const p of FACE_P) {
    if (Math.abs(p[2] - cz) > .16) continue;
    const ex = (p[0] - cx) / RX, ey = (p[1] - cy) / RY, e = Math.hypot(ex, ey);
    const b = Math.round(((Math.atan2(ey, ex) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SEG) % SEG;
    need[b] = Math.max(need[b], e * 1.15 / k);
  }
  // spread to the neighbours so the widening is smooth
  return need.map((_, i) => Math.max(1, need[i], need[(i + 1) % SEG] * .97, need[(i + SEG - 1) % SEG] * .97, need[(i + 2) % SEG] * .9, need[(i + SEG - 2) % SEG] * .9));
};
const ring = [];
let widened = 0;
for (let r = 0; r <= RINGS; r++) {
  const t = r / RINGS, [cx, cy, cz] = centre(t), k = rad(t), row = [], fit = fitAt(cx, cy, cz, k);
  widened = Math.max(widened, ...fit);
  const band = t > .03 && t < .13, crease = .035 * Math.sin(t * 9) * (1 - t);   // a soft dent or two
  for (let s = 0; s < SEG; s++) {
    const a = s / SEG * Math.PI * 2, wob = 1 + crease * Math.cos(a * 2) + .025 * Math.sin(a * 3 + t * 5);
    const col = band ? (s % 7 === 0 ? GOLD_D : GOLD) : NAVY.map((x, i) => x * (.94 + .06 * Math.sin(a * 5 + r * .7)));
    const f = fit[s];
    row.push(hat.v([cx + Math.cos(a) * RX * k * wob * f, cy + Math.sin(a) * RY * k * wob * f, cz], col));
  }
  ring.push(row);
}
for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
  const s2 = (s + 1) % SEG; hat.quad(ring[r][s], ring[r + 1][s], ring[r + 1][s2], ring[r][s2]);
}
console.log('hat widened up to', widened.toFixed(3), 'x where the head needed it');
const tip = hat.v(centre(1.02), NAVY_D); for (let s = 0; s < SEG; s++) hat.tri(ring[RINGS][s], tip, ring[RINGS][(s + 1) % SEG]);
// stars on the cone: small raised gold diamonds
for (const [t, a] of [[.42, .9], [.46, 2.6], [.58, 4.4], [.44, 5.6], [.68, 1.6], [.4, 3.6]]) {   // above the widened foot (the skull ends about t .26)
  const [cx, cy, cz] = centre(t), k = rad(t), out = [Math.cos(a), Math.sin(a)];
  const at = (d, dz, lift) => [cx + out[0] * (RX * k + lift) - out[1] * d * RX, cy + out[1] * (RY * k + lift) + out[0] * d * RY, cz + dz];
  const sz = .09 * (1 - t * .5), c = hat.v(at(0, 0, .03), GOLD);
  const pts = [at(0, sz * 1.6, .005), at(sz, 0, .005), at(0, -sz * 1.6, .005), at(-sz, 0, .005)].map(p => hat.v(p, GOLD));
  for (let i = 0; i < 4; i++) hat.tri(c, pts[(i + 1) % 4], pts[i]);
}
// the brim: a wide ring, its edge turned up a little, with a thickness
const BRIM_IN = 1, BRIM_OUT = 1.55, BR = 4, top = [], bot = [];
for (let b = 0; b <= BR; b++) {
  const f = b / BR, rr = BRIM_IN + (BRIM_OUT - BRIM_IN) * f, lift = .16 * f ** 2.2, rowT = [], rowB = [];
  for (let s = 0; s < SEG; s++) {
    const a = s / SEG * Math.PI * 2, wob = 1 + .03 * Math.sin(a * 3) + .02 * Math.cos(a * 5);
    const x = CX + Math.cos(a) * RX * rr * wob, y = CY + Math.sin(a) * RY * rr * wob;
    rowT.push(hat.v([x, y, Z0 + .02 + lift], b === BR ? GOLD : NAVY));
    rowB.push(hat.v([x, y, Z0 - .05 + lift], NAVY_D));
  }
  top.push(rowT); bot.push(rowB);
}
for (let b = 0; b < BR; b++) for (let s = 0; s < SEG; s++) {
  const s2 = (s + 1) % SEG;
  hat.quad(top[b][s], top[b][s2], top[b + 1][s2], top[b + 1][s]);
  hat.quad(bot[b][s], bot[b + 1][s], bot[b + 1][s2], bot[b][s2]);
}
for (let s = 0; s < SEG; s++) { const s2 = (s + 1) % SEG; hat.quad(top[BR][s], top[BR][s2], bot[BR][s2], bot[BR][s]); }

const cloth = doc.createMaterial('Oracle_Hat').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.42).setMetallicFactor(0).setDoubleSided(true);
const hatNode = doc.createNode('Hat').setMesh(doc.createMesh('Hat').addPrimitive(primitive(hat, cloth)))
  .setTranslation(face.getTranslation()).setRotation(face.getRotation()).setScale(face.getScale());
node('Head').addChild(hatNode);

// ---- the orb: a glowing sphere in a gold collar on the staff's knob
const orb = builder(), ORB_C = [0, -1.16 - STAFF_SHIFT, 0], ORB_R = .15, LAT = 14, LON = 22;
const sphere = (b, c, r, col, lat, lon) => {
  const rows = [];
  for (let i = 0; i <= lat; i++) { const th = i / lat * Math.PI, row = []; for (let j = 0; j < lon; j++) { const ph = j / lon * Math.PI * 2; row.push(b.v([c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.cos(th), c[2] + r * Math.sin(th) * Math.sin(ph)], col)); } rows.push(row); }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const j2 = (j + 1) % lon; b.quad(rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j]); }
};
sphere(orb, ORB_C, ORB_R, [1, 1, 1], LAT, LON);
const collar = builder();
// four gold prongs from the knob up around the orb, and a ring where they meet it
for (let k = 0; k < 0; k++) {   // (prongs: off, they read as a flat bar from the side)
  const a = k / 4 * Math.PI * 2 + .4, ca = Math.cos(a), sa = Math.sin(a), pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6, th = Math.PI * (.95 - t * .62), r = ORB_R * 1.06; pts.push([ORB_C[0] + r * Math.sin(th) * ca, ORB_C[1] + r * Math.cos(th), ORB_C[2] + r * Math.sin(th) * sa]); }
  const w = .022, side = [-sa * w, 0, ca * w], rows = pts.map(p => [collar.v([p[0] - side[0], p[1], p[2] - side[2]], GOLD), collar.v([p[0] + side[0], p[1], p[2] + side[2]], GOLD)]);
  for (let i = 0; i < 6; i++) { collar.quad(rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]); collar.quad(rows[i][1], rows[i + 1][1], rows[i + 1][0], rows[i][0]); }
}
{ const rows = []; for (const [dy, r] of [[-.01, .11], [.025, .13], [.06, .11]]) { const row = []; for (let j = 0; j < 20; j++) { const ph = j / 20 * Math.PI * 2; row.push(collar.v([r * Math.cos(ph), ORB_C[1] + ORB_R * .9 + dy, r * Math.sin(ph)], GOLD_D)); } rows.push(row); }
  for (let i = 0; i < 2; i++) for (let j = 0; j < 20; j++) { const j2 = (j + 1) % 20; collar.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j2], rows[i][j2]); } }
const glow = doc.createMaterial('Oracle_Orb').setBaseColorFactor([.1, .55, 1, 1]).setRoughnessFactor(.08).setMetallicFactor(0).setEmissiveFactor([.08, .45, 1]);
glow.setExtension('KHR_materials_emissive_strength', doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(1.4));
const metal = doc.createMaterial('Oracle_Gold').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.3).setMetallicFactor(.85);
const staff = node('Wizard_Staff');
const orbMesh = doc.createMesh('Staff_Orb').addPrimitive(primitive(orb, glow)).addPrimitive(primitive(collar, metal));
node('Weapon.R').addChild(doc.createNode('Staff_Orb').setMesh(orbMesh).setTranslation(staff.getTranslation()).setRotation(staff.getRotation()).setScale(staff.getScale()));

// ---- the mouth: under the moustache, above the beard (Quaternius left no
// mouth: the skull's chin hides behind them). One mesh, its own node on the
// Head with the Face node's transform (Face space: x across, -y forward, z
// up): an upper lip, upper teeth, a dark cavity and a lower lip. Its morph
// target "mouth_open" drops the lower lip (most in the middle, none at the
// corners) and stretches the cavity after it; the Face mesh gets a target of
// the same name that drops the beard with it, like a jaw. The game drives
// both from the voice's level (app.js, updateMouth); at 0 the lips meet.
{
  const MX = .11, ZT = -.552, RY = -.875, OPEN = .085, BEARD = .045, N = 16;   // RY: in front of the skull's flat face (y -.83 in the middle)
  const top = t => ZT - .012 * t * t, ry = t => RY + .03 * t * t;     // the lip line, and the face's curve
  const drop = t => OPEN * Math.max(0, 1 - t * t) ** .8;
  const mouth = builder(), D = [];
  const v = (p, c, d = [0, 0, 0]) => { D.push(d); return mouth.v(p, c); };
  const grid = (rows, cols) => { for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < cols - 1; i++) mouth.quad(rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i]); };
  const LIP = lin('#7e3e30'), LIP_D = lin('#4e221a'), TEETH = lin('#ece2c6'), DARK = lin('#2a0a0a'), DEEP = lin('#120303');
  const ts = n => Array.from({ length: n }, (_, i) => -1 + 2 * i / (n - 1));
  // upper lip: a short band from under the moustache down to the lip line
  grid([[.022, -.004, LIP_D], [.008, -.012, LIP], [0, -.008, LIP]].map(([dz, dy, c]) => ts(N).map(t => v([t * MX * 1.08, ry(t) + dy * (1 - .5 * t * t), top(t) + dz], c))), N);
  // the cavity: from the lip line down to behind the lower lip, recessed; opens with the lip
  const R = 5;
  grid(Array.from({ length: R + 1 }, (_, r) => ts(N).map(t => { const f = r / R, k = Math.max(0, 1 - t * t);
    return v([t * MX, ry(t) + .012 * Math.sin(Math.PI * f) * k, top(t) - .012 * f * k], f > .2 && f < .8 ? DEEP : DARK, [0, 0, -drop(t) * f]); })), N);   // (a deeper recess goes behind the skull)
  // upper teeth, just behind the lips
  grid([[-.001, TEETH], [-.022, TEETH]].map(([dz, c]) => ts(10).map(t => v([t * MX * .62, ry(t * .62) + .004, top(t * .62) + dz * (1 - .35 * t * t)], c))), 10);
  // lower lip: a soft roll whose top meets the upper lip when closed
  grid([[.002, -.006, LIP], [-.012, -.02, LIP], [-.03, -.008, LIP_D]].map(([dz, dy, c]) => ts(N).map(t => { const k = .35 + .65 * Math.sqrt(Math.max(0, 1 - t * t));
    return v([t * MX * 1.04, ry(t) + dy * k, top(t) + dz * k], c, [0, .1 * drop(t), -drop(t)]); })), N);
  const lips = doc.createMaterial('Oracle_Mouth').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.55).setMetallicFactor(0).setDoubleSided(true);
  const prim = primitive(mouth, lips);
  prim.addTarget(doc.createPrimitiveTarget('mouth_open').setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(D.flat())).setBuffer(buf)));
  const mesh = doc.createMesh('Mouth').addPrimitive(prim).setWeights([0]).setExtras({ targetNames: ['mouth_open'] });
  node('Head').addChild(doc.createNode('Mouth').setMesh(mesh).setTranslation(face.getTranslation()).setRotation(face.getRotation()).setScale(face.getScale()));
  // the beard drops with the lower lip (a jaw): everything below the lip line in front, fading out by the sideburns
  const fp = face.getMesh().listPrimitives()[0], a = fp.getAttribute('POSITION'), FD = [];
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  let moved = 0;
  for (let i = 0; i < a.getCount(); i++) { const p = a.getElement(i, []);
    const w = ss(-.555, -.6, p[2]) * ss(.44, .28, Math.abs(p[0])) * ss(-.4, -.5, p[1]);
    if (w > 0) moved++; FD.push(0, .25 * BEARD * w, -BEARD * w); }
  fp.addTarget(doc.createPrimitiveTarget('mouth_open').setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(FD)).setBuffer(buf)));
  face.getMesh().setWeights([0]).setExtras({ targetNames: ['mouth_open'] });
  console.log('mouth', mouth.P.length, 'vertices; beard vertices that move:', moved);
}

await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log('hat', hat.P.length, 'vertices,', hat.I.length / 3, 'triangles; orb', orb.P.length + collar.P.length, 'vertices');
