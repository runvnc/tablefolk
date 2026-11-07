// Corrects wizard.glb's face (Quaternius): gives the nose a real ridge and
// adds the eyes its file lacks (empty sockets, nothing on the atlas), all in
// the Face mesh with the one material, so the file itself is right everywhere.
//
//   cp tools/fix-wizard-face.mjs ~/.cache/tablefolk-gltf/   (beside gltf-transform's node_modules)
//   git show b8eb3b1:assets/models/characters/quaternius/wizard.glb > original.glb
//   node ~/.cache/tablefolk-gltf/fix-wizard-face.mjs original.glb out.glb
//
// Face mesh axes: x across, -y forward, z up.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const [input, output] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const prim = doc.getRoot().listMeshes().find(m => m.getName() === 'Face').listPrimitives()[0];
const rd = a => Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, []));
const POS = rd(prim.getAttribute('POSITION')), NOR = rd(prim.getAttribute('NORMAL')), UV = rd(prim.getAttribute('TEXCOORD_0')), IDX = [...prim.getIndices().getArray()];

// ---- the nose: only these wedge corners move forward (mirrored in x; UV seams
// duplicate a vertex, and all copies move, so the mesh stays closed)
const NOSE = [ // [ |x|, y, z ] as in the file -> new y
  [[0, -.907, .039], -.935],     // top of the ridge
  [[0, -.967, -.421], -1.07],   // the tip
  [[.108, -.915, -.383], -.96], // the tip's sides
];
const moved = new Set();
POS.forEach((p, i) => { for (const [[x, y, z], ny] of NOSE) if (Math.abs(Math.abs(p[0]) - x) < .006 && Math.abs(p[1] - y) < .006 && Math.abs(p[2] - z) < .006) { p[1] = ny; moved.add(i); } });
if (moved.size < 4) throw new Error('nose not found: is this the original file?');
// flat-shaded again, on the triangles that changed
const sub = (a, b) => a.map((v, k) => v - b[k]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sum = new Map();
for (let t = 0; t < IDX.length; t += 3) {
  const v = [IDX[t], IDX[t + 1], IDX[t + 2]]; if (!v.some(i => moved.has(i))) continue;
  const n = cross(sub(POS[v[1]], POS[v[0]]), sub(POS[v[2]], POS[v[0]]));
  for (const i of v) sum.set(i, (sum.get(i) || [0, 0, 0]).map((s, k) => s + n[k]));
}
for (const [i, n] of sum) { const l = Math.hypot(...n) || 1; NOR[i] = n.map(c => c / l); }

// ---- the eyes: flattened spheres in the sockets, coloured by atlas spots
const EYE = { x: .29, y: -.77, z: -.13, white: [.1, .035, .07], pupil: [.05, .03, .05], ahead: .025 };
const [WHITE_UV, BLACK_UV] = JSON.parse(process.env.EYE_UVS);
function ellipsoid(c, r, uv, flipX) {
  const base = POS.length, R = 8, S = 6;   // rings, segments
  for (let a = 0; a <= R; a++) for (let b = 0; b < 2 * S; b++) {
    const th = Math.PI * a / R, ph = Math.PI * b / S, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    POS.push(c.map((v, k) => v + r[k] * d[k]));
    const n = d.map((v, k) => v / r[k]), l = Math.hypot(...n); NOR.push(n.map(v => v / l)); UV.push(uv);
  }
  const at = (a, b) => base + a * 2 * S + (b % (2 * S));
  for (let a = 0; a < R; a++) for (let b = 0; b < 2 * S; b++) {
    // wound like the file's own triangles: the cross product points out along the normal
    const q = [at(a, b), at(a + 1, b), at(a + 1, b + 1), at(a, b + 1)];
    const tri = [[q[0], q[1], q[2]], [q[0], q[2], q[3]]];
    for (const t of tri) {
      const n = cross(sub(POS[t[1]], POS[t[0]]), sub(POS[t[2]], POS[t[0]])), out = NOR[t[0]];
      const ok = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0;
      IDX.push(...(ok ? t : [t[0], t[2], t[1]]));
    }
  }
}
for (const side of [-1, 1]) {
  ellipsoid([side * EYE.x, EYE.y, EYE.z], EYE.white, WHITE_UV);
  ellipsoid([side * EYE.x, EYE.y - EYE.ahead, EYE.z], EYE.pupil, BLACK_UV);
}

// ---- back into the mesh: floats (the tip is beyond the old quantized range), then as the repo's files are
const buf = doc.getRoot().listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
prim.setAttribute('POSITION', acc('VEC3', Float32Array.from(POS.flat())));
prim.setAttribute('NORMAL', acc('VEC3', Float32Array.from(NOR.flat())));
prim.setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(UV.flat())));
prim.setIndices(acc('SCALAR', Uint16Array.from(IDX)));
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log('moved', moved.size, 'nose vertices; face now', POS.length, 'vertices,', IDX.length / 3, 'triangles');
