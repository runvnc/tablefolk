# blender -b --factory-startup -P analyze.py -- a.glb [b.glb ...]
# Prints one line per file: ANALYZE {"file", "asImported": {...}, "welded": {...}}
# (and bbox_blender: [min, max], Blender axes, Z up, front = -Y) with verts, faces, boundary_edges (open edges: one face), nonmanifold (3+ faces) and parts (connected pieces).
# "welded" merges vertices at the same position (1e-5 m) first: glTF splits every vertex along UV seams and
# hard edges, so only the welded counts say whether the surface itself is torn.
# Compressed (meshopt) GLBs must be decompressed first (decomp.mjs).
import bpy, bmesh, sys, json
DIST = 1e-5

def stat(bm):
    b = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bm.verts.index_update(); seen = set(); parts = 0
    for v in bm.verts:
        if v.index in seen: continue
        parts += 1; st = [v]; seen.add(v.index)
        while st:
            x = st.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); st.append(y)
    return dict(verts=len(bm.verts), faces=len(bm.faces), boundary_edges=b, nonmanifold=nm, parts=parts)

for src in sys.argv[sys.argv.index('--') + 1:]:
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=src)
        bm = bmesh.new(); dg = bpy.context.evaluated_depsgraph_get()
        # all meshes in world space, without modifiers (skins stay in bind pose)
        for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
            m = o.data.copy(); m.transform(o.matrix_world); bm.from_mesh(m); bpy.data.meshes.remove(m)
        a = stat(bm)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=DIST)
        w = stat(bm)
        lo = [round(min(v.co[i] for v in bm.verts), 3) for i in range(3)] if bm.verts else []
        hi = [round(max(v.co[i] for v in bm.verts), 3) for i in range(3)] if bm.verts else []
        bm.free()
        print('ANALYZE ' + json.dumps({'file': src, 'asImported': a, 'welded': w, 'bbox_blender': [lo, hi]}), flush=True)
    except Exception as e:
        print('ANALYZE ' + json.dumps({'file': src, 'error': str(e)[:200]}), flush=True)
