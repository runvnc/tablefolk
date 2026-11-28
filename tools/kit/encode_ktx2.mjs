// encode_ktx2.mjs -- the building kit's textures as KTX2 (Basis Universal) beside the WebP set.
// Colour maps: ETC1S (sRGB); normal maps: UASTC (normal-map mode, Zstandard); roughness: ETC1S (linear).
// Mipmaps are made here, the image is flipped (a compressed texture can't be flipped on load;
// buildings.js loads the WebP with invertY). Only the files the game uses (both sizes).
//   cd work/ktx2 && npm i ktx2-encoder@0.6.0      (the encoder stays under work/, nothing global)
//   node tools/kit/encode_ktx2.mjs [names...]       (python3 with Pillow decodes the WebP)
// Writes assets/textures/kit/<name>_<kind>[_512].ktx2.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIR = path.join(ROOT, 'assets/textures/kit');
const { encodeToKTX2 } = await import(path.join(ROOT, 'work/ktx2/node_modules/ktx2-encoder/dist/node/index.js'));
const decode = async buf => {
  const out = execFileSync('python3', ['-I', '-c', 'import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")\nsys.stdout.buffer.write(im.size[0].to_bytes(4,"little")+im.size[1].to_bytes(4,"little")+im.tobytes())'], { input: buf, maxBuffer: 1 << 28 });
  return { width: out.readUInt32LE(0), height: out.readUInt32LE(4), data: new Uint8Array(out.buffer, out.byteOffset + 8, out.length - 8) };
};
const OPTS = {
  color: process.env.COLOR_UASTC ? { isUASTC: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1, isPerceptual: true, isSetKTX2SRGBTransferFunc: true } : { isUASTC: false, qualityLevel: 255, compressionLevel: 3, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
  rough: { isUASTC: false, qualityLevel: 255, compressionLevel: 3, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
  normal: { isUASTC: true, isNormalMap: true, needSupercompression: true, enableRDO: !!+(process.env.RDO || 0), rdoQualityLevel: +(process.env.RDO || 1), uastcLDRQualityLevel: 2, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
};
const only = process.argv.slice(2), kinds = (process.env.KINDS || 'color,normal,rough').split(',');
for (const f of readdirSync(DIR).filter(f => f.endsWith('.webp')).sort()) {
  const m = f.match(/^(\w+?)_(color|normal|rough)(_512)?\.webp$/); if (!m || (only.length && !only.includes(m[1])) || !kinds.includes(m[2])) continue;
  const t0 = Date.now();
  const ktx = await encodeToKTX2(new Uint8Array(readFileSync(path.join(DIR, f))), { ...OPTS[m[2]], generateMipmap: true, isYFlip: true, imageDecoder: decode });
  const out = f.replace(/\.webp$/, '.ktx2');
  writeFileSync(path.join(DIR, out), ktx);
  console.log(out, (ktx.length / 1024).toFixed(0) + ' KB', 'webp', (readFileSync(path.join(DIR, f)).length / 1024).toFixed(0) + ' KB', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
