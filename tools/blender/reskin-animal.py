# Put a detailed mesh on a rigged low-poly animal, keeping its skeleton and clips.
#   blender -b -P tools/blender/reskin-animal.py -- old_rigged.glb new_mesh.glb out.glb [--flip] [--turn]
# The new mesh (Meshy image-to-3D, no rig) is turned to lie along the old
# body's length with its head the same way (guessed: the head end is the
# taller one; --flip turns it round, --turn 90 degrees), scaled per axis to
# the old body's bounding box, then takes the old mesh's skin weights from
# the nearest point of its surface (Data Transfer, in the rest pose). The
# old mesh is dropped; textures are cut to 1024 px. 2026-11-14.
import bpy, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OLD, NEW, OUT = argv[:3]
FLIP, TURN = '--flip' in argv, '--turn' in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OLD)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
olds = [o for o in bpy.data.objects if o.type == 'MESH']
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=NEW)
news = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']

def world_verts(objs):
    dg = bpy.context.evaluated_depsgraph_get(); out = []
    for o in objs:
        e = o.evaluated_get(dg); m = e.to_mesh()
        out += [o.matrix_world @ v.co for v in m.vertices]; e.to_mesh_clear()
    return out

def box(vs):
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi

# the new mesh: one object, its transforms applied, no parents
bpy.ops.object.select_all(action='DESELECT')
for o in news:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw; o.select_set(True)
bpy.context.view_layer.objects.active = news[0]
if len(news) > 1: bpy.ops.object.join()
new = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o not in before and o != new]:
    bpy.data.objects.remove(o, do_unlink=True)

ov = world_verts(olds); olo, ohi = box(ov)
def long_axis(lo, hi): return 0 if (hi.x - lo.x) >= (hi.y - lo.y) else 1
def head_sign(vs, ax):
    lo, hi = box(vs); L = hi[ax] - lo[ax]; H = hi.z - lo.z
    front = [v for v in vs if v[ax] > hi[ax] - .25 * L]; back = [v for v in vs if v[ax] < lo[ax] + .25 * L]
    top = lambda s: sum(1 for v in s if v.z > lo.z + .72 * H) / max(1, len(s))
    return 1 if top(front) >= top(back) else -1

oax = long_axis(olo, ohi)
nv = [new.matrix_world @ v.co for v in new.data.vertices]; nlo, nhi = box(nv)
rot = 0.0
if long_axis(nlo, nhi) != oax or TURN: rot += math.pi / 2
if rot:
    new.data.transform(Matrix.Rotation(rot, 4, 'Z')); nv = [v.co.copy() for v in new.data.vertices]; nlo, nhi = box(nv)
if head_sign(nv, oax) != head_sign(ov, oax) or FLIP:
    new.data.transform(Matrix.Rotation(math.pi, 4, 'Z')); nv = [v.co.copy() for v in new.data.vertices]; nlo, nhi = box(nv)
print('[reskin] old axis', 'XY'[oax], 'head', head_sign(ov, oax), 'turned', rot, 'old box', tuple(round(x, 3) for x in (ohi - olo)), 'new box', tuple(round(x, 3) for x in (nhi - nlo)))
# per-axis fit to the old body's box
s = Vector(((ohi.x - olo.x) / (nhi.x - nlo.x), (ohi.y - olo.y) / (nhi.y - nlo.y), (ohi.z - olo.z) / (nhi.z - nlo.z)))
for v in new.data.vertices:
    p = v.co - nlo
    v.co = olo + Vector((p.x * s.x, p.y * s.y, p.z * s.z))
new.data.update()

# skin weights from the old mesh
for o in olds:
    for vg in o.vertex_groups:
        if vg.name not in new.vertex_groups: new.vertex_groups.new(name=vg.name)
for i, o in enumerate(olds):
    dt = new.modifiers.new('wt%d' % i, 'DATA_TRANSFER'); dt.object = o
    dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.context.view_layer.objects.active = new
    bpy.ops.object.modifier_apply(modifier=dt.name)
bpy.context.view_layer.objects.active = new
bpy.ops.object.mode_set(mode='OBJECT')
new.select_set(True)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
for o in olds: bpy.data.objects.remove(o, do_unlink=True)
new.parent = arm
m = new.modifiers.new('Armature', 'ARMATURE'); m.object = arm
new.name = 'Body'
arm.data.pose_position = 'POSE'
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_skins=True, export_image_format='JPEG', export_jpeg_quality=85)
print('[reskin] wrote', OUT, len(new.data.vertices), 'verts')
