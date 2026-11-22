// node env-decomp.mjs in.glb out.glb : meshopt/quantization removed, AVIF/WebP textures re-encoded as PNG (for Blender checks)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(dequantize());
for (const t of doc.getRoot().listTextures()) {
  const mt = t.getMimeType();
  if (mt === 'image/avif' || mt === 'image/webp') { t.setImage(await sharp(Buffer.from(t.getImage())).png().toBuffer()); t.setMimeType('image/png'); t.setURI((t.getURI() || t.getName() || 'tex').replace(/\.\w+$/, '') + '.png'); }
}
for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization|avif|webp/i.test(e.extensionName)) e.dispose();
await io.write(process.argv[3], doc);
console.log('wrote', process.argv[3]);
