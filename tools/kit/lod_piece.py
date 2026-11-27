# The far version of each kit piece (2026-11-27): collapse-decimated to a small budget, textures 256 px.
#   blender -b --factory-startup -P tools/kit/lod_piece.py -- pieces_dir name:tris [name:tris ...]
# Reads <dir>/<name>.glb, writes <dir>/<name>_lod.glb (the same origin, box and material) and adds
# lod_tris to pieces.json. Kit pieces are welded (proc.py), so the collapse does not tear them.
import bpy, sys, os, json
a = sys.argv[sys.argv.index('--') + 1:]; D = a[0]
meta = json.load(open(os.path.join(D, 'pieces.json')))
for spec in a[1:]:
    name, t = spec.split(':'); t = int(t)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(D, name + '.glb'))
    ob = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    n0 = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = min(1.0, t / max(1, n0))
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='d')
    for im in bpy.data.images:
        if im.size[0] > 256: im.scale(256, 256)
    for o in bpy.context.scene.objects: o.select_set(o == ob)
    bpy.ops.export_scene.gltf(filepath=os.path.join(D, name + '_lod.glb'), export_format='GLB', use_selection=True,
                              export_image_format='JPEG', export_tangents=True)
    n1 = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    meta.setdefault(name, {})['lod_tris'] = n1; print('LOD', name, n0, '->', n1)
json.dump(meta, open(os.path.join(D, 'pieces.json'), 'w'), indent=1)
