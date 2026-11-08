// Adds The Oracle's look to wizard.glb (Quaternius): a tall, bent oracle's
// hat on the head bone and a glowing orb with a gold collar on the staff's
// knob, each its own mesh and material (the body keeps its one atlas). Run it
// on the face-corrected file (tools/fix-wizard-face.mjs first):
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
const ring = [];
for (let r = 0; r <= RINGS; r++) {
  const t = r / RINGS, [cx, cy, cz] = centre(t), k = rad(t), row = [];
  const band = t > .03 && t < .13, crease = .035 * Math.sin(t * 9) * (1 - t);   // a soft dent or two
  for (let s = 0; s < SEG; s++) {
    const a = s / SEG * Math.PI * 2, wob = 1 + crease * Math.cos(a * 2) + .025 * Math.sin(a * 3 + t * 5);
    const col = band ? (s % 7 === 0 ? GOLD_D : GOLD) : NAVY.map((x, i) => x * (.94 + .06 * Math.sin(a * 5 + r * .7)));
    row.push(hat.v([cx + Math.cos(a) * RX * k * wob, cy + Math.sin(a) * RY * k * wob, cz], col));
  }
  ring.push(row);
}
for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
  const s2 = (s + 1) % SEG; hat.quad(ring[r][s], ring[r + 1][s], ring[r + 1][s2], ring[r][s2]);
}
const tip = hat.v(centre(1.02), NAVY_D); for (let s = 0; s < SEG; s++) hat.tri(ring[RINGS][s], tip, ring[RINGS][(s + 1) % SEG]);
// stars on the cone: small raised gold diamonds
for (const [t, a] of [[.3, .9], [.42, 2.6], [.55, 4.4], [.36, 5.6], [.66, 1.6], [.25, 3.6]]) {
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
const face = node('Face');
// the hat presses the spiky hair down: everything above the crown line is flattened under the cone
{ const fp = face.getMesh().listPrimitives()[0], a = fp.getAttribute('POSITION'), P = Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, []));
  const LINE = .4; let n = 0;
  for (const p of P) if (p[2] > LINE) { p[2] = LINE + (p[2] - LINE) * .15; p[0] *= .97; n++; }
  fp.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(P.flat())).setBuffer(buf));
  console.log('hair pressed down:', n, 'vertices'); }
const hatNode = doc.createNode('Hat').setMesh(doc.createMesh('Hat').addPrimitive(primitive(hat, cloth)))
  .setTranslation(face.getTranslation()).setRotation(face.getRotation()).setScale(face.getScale());
node('Head').addChild(hatNode);

// ---- the orb: a glowing sphere in a gold collar on the staff's knob
const orb = builder(), ORB_C = [0, -1.16, 0], ORB_R = .15, LAT = 14, LON = 22;
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

await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log('hat', hat.P.length, 'vertices,', hat.I.length / 3, 'triangles; orb', orb.P.length + collar.P.length, 'vertices');
