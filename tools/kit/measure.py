#!/usr/bin/env python3
"""Numbers for a GLB house (2026-11-27): triangles, draw calls, textures, bytes.
  python3 tools/kit/measure.py a.glb [b.glb ...]
draw calls: one per (mesh, primitive) when nodes sharing a mesh are drawn as instances (Babylon's glTF loader
makes InstancedMesh for them), and per (node, primitive) without instancing. Texture memory: every image
decoded to RGBA8 with mips (w*h*4*4/3). geometry bytes: the buffer minus the embedded images. Works on
uncompressed GLBs (decompress meshopt ones first: tools/env-assets/decomp.mjs); for a compressed file pass
--size-of=<file> to report its size instead.
"""
import json, struct, sys, io
from PIL import Image


def glb(path):
    d = open(path, 'rb').read(); n = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + n])
    return d, j, 20 + n + 8


def main(paths):
    for p in paths:
        if p.startswith('--'): continue
        d, j, b0 = glb(p)
        tris = 0; inst_tris = 0; calls_inst = set(); calls_plain = 0
        for ni, node in enumerate(j.get('nodes', [])):
            if 'mesh' not in node: continue
            m = j['meshes'][node['mesh']]
            for pi, prim in enumerate(m['primitives']):
                acc = j['accessors'][prim['indices']] if 'indices' in prim else j['accessors'][prim['attributes']['POSITION']]
                t = acc['count'] // 3
                inst_tris += t; calls_plain += 1; calls_inst.add((node['mesh'], pi))
        for mi, m in enumerate(j.get('meshes', [])):
            for prim in m['primitives']:
                acc = j['accessors'][prim['indices']] if 'indices' in prim else j['accessors'][prim['attributes']['POSITION']]
                tris += acc['count'] // 3
        img_bytes = 0; texmem = 0; sizes = []
        for im in j.get('images', []):
            bv = j['bufferViews'][im['bufferView']]; raw = d[b0 + bv.get('byteOffset', 0): b0 + bv.get('byteOffset', 0) + bv['byteLength']]
            img_bytes += len(raw)
            try: w, h = Image.open(io.BytesIO(raw)).size
            except Exception: w = h = 0
            sizes.append(w); texmem += w * h * 4 * 4 / 3
        size = len(d)
        out = dict(file=p.split('/')[-1], tris_drawn=inst_tris, tris_unique=tris, draw_calls_instanced=len(calls_inst),
                   draw_calls_plain=calls_plain, materials=len(j.get('materials', [])), textures=len(sizes),
                   tex_sizes=sorted(set(sizes)), tex_mem_MB=round(texmem / 2 ** 20, 1), file_MB=round(size / 2 ** 20, 2),
                   geometry_MB=round((size - img_bytes) / 2 ** 20, 2))
        print(json.dumps(out))


if __name__ == '__main__':
    main(sys.argv[1:])
