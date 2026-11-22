# blender -b --factory-startup -P strip.py -- in.glb out.glb [yaw_deg]
# Writes the mesh alone (joined, no materials, no UVs) turned by yaw about the vertical, for
# fal-ai/trellis-2/retexture: it bakes a new texture from an image onto the given shape.
import bpy, sys, math
from mathutils import Matrix
a = sys.argv[sys.argv.index('--') + 1:]; yaw = float(a[2]) if len(a) > 2 else 0
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(o in objs)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(objs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; me = ob.data
me.materials.clear()
while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
me.transform(Matrix.Rotation(math.radians(yaw), 4, 'Z')); me.update()
for o in list(bpy.context.scene.objects):
    if o != ob: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_yup=True, export_materials='NONE', export_texcoords=False)
print('STRIPPED', len(me.polygons))
