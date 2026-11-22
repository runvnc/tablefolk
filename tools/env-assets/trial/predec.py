# blender -b --factory-startup -P predec.py -- in.glb out.glb tris
# For very dense raws (Hunyuan3D 2.0 on fal: ~1.4M triangles): join, weld by position (1e-5, as proc.py does),
# decimate to `tris`, export, so proc.py's per-vertex loops finish within the lock's time. Materials are kept.
import bpy, bmesh, sys
a = sys.argv[sys.argv.index('--') + 1:]; tgt = int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(o in objs)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(objs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; me = ob.data
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); bm.to_mesh(me); bm.free()
me.calc_loop_triangles(); n = len(me.loop_triangles)
if n > tgt:
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = tgt / n; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='d')
me.calc_loop_triangles(); print('PREDEC', n, '->', len(me.loop_triangles))
for o in list(bpy.context.scene.objects):
    if o != ob: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_yup=True)
