// Undo tools/compress-glb.sh's geometry compression (meshopt, quantization) so
// Blender (no meshopt decoder here) can read a model: node decompress-glb.mjs in.glb out.glb
// Run from ~/.cache/tablefolk-gltf (gltf-transform and meshoptimizer installed there).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(dequantize());
for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization|avif|webp/i.test(e.extensionName)) e.dispose();
await io.write(process.argv[3], doc);
console.log('wrote', process.argv[3]);
