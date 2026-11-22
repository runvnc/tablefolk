# blender -b --factory-startup -P dec.py -- in.glb out.glb target_tris
# Prints STATS {...}: raw tris, decimated tris, texture sizes. Textures above 2048 are scaled to 2048.
# Each mesh is welded by position (1e-5) first: generated GLBs split every vertex along UV seams and hard edges,
# and the Decimate modifier collapses each split fragment on its own, tearing every seam open. Never skip it.
import bpy, bmesh, sys, json, os
a = sys.argv[sys.argv.index('--') + 1:]; src, dst, tgt = a[0], a[1], int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
def tris():
    n = 0
    for o in objs:
        m = o.data; m.calc_loop_triangles(); n += len(m.loop_triangles)
    return n
raw = tris()
for o in objs:
    if o.data.shape_keys: continue   # remove_doubles would break shape keys
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); bm.to_mesh(o.data); bm.free(); o.data.update()
imgs0 = sorted({(i.name, tuple(i.size)) for i in bpy.data.images})
if raw > tgt:
    for o in objs:
        bpy.context.view_layer.objects.active = o
        m = o.modifiers.new('d', 'DECIMATE'); m.ratio = tgt / raw; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='d')
dec = tris()
for i in bpy.data.images:
    if max(i.size) > 2048:
        s = 2048 / max(i.size); i.scale(int(i.size[0] * s), int(i.size[1] * s))
imgs1 = sorted({(i.name, tuple(i.size)) for i in bpy.data.images})
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG' if os.environ.get('JPG') else 'AUTO', export_jpeg_quality=90)
print('STATS', json.dumps({'raw_tris': raw, 'dec_tris': dec, 'tex_in': imgs0, 'tex_out': imgs1, 'kb': os.path.getsize(dst) // 1024}))
