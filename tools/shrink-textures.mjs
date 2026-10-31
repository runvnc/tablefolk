// Shrink a GLB's textures (largest side to MAX px) and change nothing else:
// geometry, morphs, skins and animations byte-identical. Resizes with ffmpeg.
//   node shrink-textures.mjs in.glb out.glb [1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { execFileSync } from 'child_process';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs'; import os from 'os'; import path from 'path';
const [inp, out, max = '1024'] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shrink-'));
for (const [i, t] of doc.getRoot().listTextures().entries()) {
  const mime = t.getMimeType(), ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : mime === 'image/avif' ? 'avif' : 'png';
  const a = path.join(tmp, `in${i}.${ext}`), b = path.join(tmp, `out${i}.${ext}`);
  fs.writeFileSync(a, t.getImage());
  // AVIF at a normal quality (ffmpeg's default is near lossless, larger than the 2048 original)
  const enc = ext === 'avif' ? ['-c:v', 'libaom-av1', '-crf', '30', '-still-picture', '1', '-cpu-used', '4'] : [];
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', a, '-vf', `scale='min(${max},iw)':'min(${max},ih)':force_original_aspect_ratio=decrease:flags=lanczos`, ...enc, b]);
  const before = t.getImage().length; t.setImage(new Uint8Array(fs.readFileSync(b)));
  console.log(t.getName() || i, mime, before, '->', t.getImage().length);
}
await io.write(out, doc);
fs.rmSync(tmp, { recursive: true });
console.log('wrote', out);
