// node simplify.mjs in.glb out.glb targetTris [error] [protectSeams]: meshopt (1.x) simplifyWithAttributes, Permissive (non-manifold
// vertices and seams may collapse), one primitive at a time; keeps the GLB's materials and textures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst, tgt, err = '0.05', prot = '0'] = process.argv.slice(2);
const doc = await io.read(src);
let n0 = 0, n1 = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
  const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), UV = p.getAttribute('TEXCOORD_0'), I = p.getIndices();
  const pos = new Float32Array(P.getArray()), idx = new Uint32Array(I.getArray()); n0 += idx.length / 3;
  const nv = P.getCount(), attr = new Float32Array(nv * 5);
  for (let i = 0; i < nv; i++) { const n = N.getElement(i, []), u = UV.getElement(i, []); attr.set([n[0], n[1], n[2], u[0], u[1]], i * 5); }
  // lock: optionally the vertices on UV seams (a position shared by different UVs)
  let lock = null;
  if (prot === '1') { const m = new Map(), uvOf = new Map(); lock = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) { const k = pos[i*3].toFixed(6) + ',' + pos[i*3+1].toFixed(6) + ',' + pos[i*3+2].toFixed(6), uv = attr[i*5+3].toFixed(5) + ',' + attr[i*5+4].toFixed(5);
      if (!m.has(k)) { m.set(k, [i]); uvOf.set(k, uv); } else { m.get(k).push(i); if (uvOf.get(k) !== uv) uvOf.set(k, '*'); } }
    for (const [k, l] of m) if (uvOf.get(k) === '*') for (const i of l) lock[i] = 2; }
  const [out, e] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 5, [0.5, 0.5, 0.5, 1, 1], lock, Math.floor(+tgt * 3 / 1) , +err, ['Permissive']);
  n1 += out.length / 3; console.log('prim', idx.length / 3, '->', out.length / 3, 'err', e.toFixed(4));
  I.setArray(out);
}
console.log('tris', n0, '->', n1);
await io.write(dst, doc);
