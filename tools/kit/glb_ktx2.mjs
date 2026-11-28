// glb_ktx2.mjs -- the kit's piece GLBs with KTX2 textures (KHR_texture_basisu) beside the AVIF ones.
// Base colour: ETC1S sRGB; ORM (metallic-roughness, occlusion): ETC1S linear; normal: UASTC (RDO, Zstandard).
// glTF images are top-left first like KTX2: no flip. Geometry (meshopt) is copied byte for byte.
//   cd work/ktx2 && npm i ktx2-encoder@0.6.0      (the encoder stays under work/)
//   node tools/kit/glb_ktx2.mjs [names...]        (python3 with Pillow decodes the AVIF)
// Writes assets/models/kit/<name>.ktx2.glb (buildings.js loads it where the card takes KTX2).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIR = path.join(ROOT, 'assets/models/kit');
const { encodeToKTX2 } = await import(path.join(ROOT, 'work/ktx2/node_modules/ktx2-encoder/dist/node/index.js'));
const decode = async buf => {
  const out = execFileSync('python3', ['-I', '-c', 'import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")\nsys.stdout.buffer.write(im.size[0].to_bytes(4,"little")+im.size[1].to_bytes(4,"little")+im.tobytes())'], { input: buf, maxBuffer: 1 << 28 });
  return { width: out.readUInt32LE(0), height: out.readUInt32LE(4), data: new Uint8Array(out.buffer, out.byteOffset + 8, out.length - 8) };
};
const OPTS = {
  color: { isUASTC: false, qualityLevel: 255, compressionLevel: 3, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
  orm: { isUASTC: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },   // (ETC1S bled the occlusion, roughness and metal channels into each other: the chimney's stone came out darker and flat)
  normal: { isUASTC: true, isNormalMap: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
};
const only = process.argv.slice(2);
const pad = (n, a) => (n + a - 1) & ~(a - 1);
for (const f of readdirSync(DIR).filter(f => f.endsWith('.glb') && !f.endsWith('.ktx2.glb')).sort()) {
  if (only.length && !only.includes(f.replace(/\.glb$/, ''))) continue;
  const b = readFileSync(path.join(DIR, f)), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const binStart = 20 + jl + 8, bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jl));
  // each image's role from the materials
  const role = {}, texImg = t => j.textures[t].extensions?.EXT_texture_avif?.source ?? j.textures[t].source;
  for (const m of j.materials || []) {
    if (m.normalTexture) role[texImg(m.normalTexture.index)] = 'normal';
    const pb = m.pbrMetallicRoughness || {};
    if (pb.baseColorTexture) role[texImg(pb.baseColorTexture.index)] = 'color';
    if (pb.metallicRoughnessTexture) role[texImg(pb.metallicRoughnessTexture.index)] ??= 'orm';
    if (m.occlusionTexture) role[texImg(m.occlusionTexture.index)] ??= 'orm';
  }
  const newImg = {};
  for (let i = 0; i < j.images.length; i++) {
    const im = j.images[i], bv = j.bufferViews[im.bufferView];
    const src = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    newImg[im.bufferView] = Buffer.from(await encodeToKTX2(new Uint8Array(src), { ...OPTS[role[i] || 'color'], generateMipmap: true, isYFlip: false, imageDecoder: decode }));
    im.mimeType = 'image/ktx2';
  }
  // buffer 0's referenced ranges (plain views and meshopt's compressed views), laid out again in order
  const ranges = [];
  j.bufferViews.forEach((v, k) => { if (v.buffer === 0) ranges.push({ off: v.byteOffset || 0, len: v.byteLength, set: o => { v.byteOffset = o; }, data: newImg[k] }); const mo = v.extensions?.EXT_meshopt_compression; if (mo && mo.buffer === 0) ranges.push({ off: mo.byteOffset || 0, len: mo.byteLength, set: o => { mo.byteOffset = o; } }); });
  ranges.sort((a, c) => a.off - c.off);
  const parts = []; let at = 0;
  for (const r of ranges) {
    const data = r.data || bin.subarray(r.off, r.off + r.len);
    const o = pad(at, 16); if (o > at) parts.push(Buffer.alloc(o - at)); r.set(o); parts.push(data); at = o + data.length;
    if (r.data) j.bufferViews.find((v, k) => newImg[k] === r.data).byteLength = data.length;
  }
  const nb = Buffer.concat(parts); j.buffers[0].byteLength = nb.length;
  for (const t of j.textures) { const s = t.extensions?.EXT_texture_avif?.source; if (s !== undefined) { delete t.extensions.EXT_texture_avif; t.extensions.KHR_texture_basisu = { source: s }; } }
  const swap = a => a && a.map(x => x === 'EXT_texture_avif' ? 'KHR_texture_basisu' : x);
  j.extensionsUsed = swap(j.extensionsUsed); j.extensionsRequired = swap(j.extensionsRequired);
  let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc(pad(js.length, 4) - js.length, 0x20)]);
  const nbp = Buffer.concat([nb, Buffer.alloc(pad(nb.length, 4) - nb.length)]);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + nbp.length, 8);
  const ch = (len, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.write(type, 4); return c; };
  const out = Buffer.concat([head, ch(js.length, 'JSON'), js, ch(nbp.length, 'BIN\0'), nbp]);
  const name = f.replace(/\.glb$/, '.ktx2.glb');
  writeFileSync(path.join(DIR, name), out);
  console.log(name, (out.length / 1024).toFixed(0) + ' KB', 'avif', (b.length / 1024).toFixed(0) + ' KB', j.images.map((im, i) => role[i]).join(','));
}
