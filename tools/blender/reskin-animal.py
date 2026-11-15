# Put a detailed mesh on a rigged low-poly animal, keeping its skeleton and clips.
#   blender -b -P tools/blender/reskin-animal.py -- old_rigged.glb new_mesh.glb out.glb [--flip] [--turn] [--auto]
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
FLIP, TURN, AUTO = '--flip' in argv, '--turn' in argv, '--auto' in argv

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
# heavy models (Hunyuan3D's default is 500k faces): down to about 40k
if len(new.data.polygons) > 60000:
    dm = new.modifiers.new('dec', 'DECIMATE'); dm.ratio = 40000 / len(new.data.polygons)
    bpy.ops.object.modifier_apply(modifier=dm.name)
    print('[reskin] decimated to', len(new.data.polygons), 'faces')
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
# --tip / --tip-back: the old body lies along Z, not Y (the farm-pack sheep's
# rig): tip the new mesh 90 degrees about X so its length follows
if '--tip' in argv or '--tip-back' in argv:
    new.data.transform(Matrix.Rotation((1 if '--tip' in argv else -1) * math.pi / 2, 4, 'X')); nv = [v.co.copy() for v in new.data.vertices]; nlo, nhi = box(nv)
print('[reskin] old axis', 'XY'[oax], 'head', head_sign(ov, oax), 'turned', rot, 'old box', tuple(round(x, 3) for x in (ohi - olo)), 'new box', tuple(round(x, 3) for x in (nhi - nlo)))
# per-axis fit to the old body's box
s = Vector(((ohi.x - olo.x) / (nhi.x - nlo.x), (ohi.y - olo.y) / (nhi.y - nlo.y), (ohi.z - olo.z) / (nhi.z - nlo.z)))
# --keep-width: the new body's own width for its length (a dragon with its
# wings out is far wider than the horse rig it rides: fitted to the horse's
# width it looked squashed from the front and above); centred on the old body
if '--keep-width' in argv:
    lax = 1 if (ohi.y - olo.y) >= (ohi.x - olo.x) else 0; wax = 1 - lax
    s[wax] = s[lax]
    c = (olo[wax] + ohi[wax]) / 2; half = (nhi[wax] - nlo[wax]) * s[wax] / 2
    olo[wax] = c - half
for v in new.data.vertices:
    p = v.co - nlo
    v.co = olo + Vector((p.x * s.x, p.y * s.y, p.z * s.z))
new.data.update()

# skin weights from the old mesh
for o in olds:
    for vg in o.vertex_groups:
        if vg.name not in new.vertex_groups: new.vertex_groups.new(name=vg.name)
for i, o in enumerate([] if AUTO else olds):
    dt = new.modifiers.new('wt%d' % i, 'DATA_TRANSFER'); dt.object = o
    dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.context.view_layer.objects.active = new
    bpy.ops.object.modifier_apply(modifier=dt.name)
bpy.context.view_layer.objects.active = new
bpy.ops.object.mode_set(mode='OBJECT')
new.select_set(True)
# (smoothing the weights here, vertex_group_smooth, speckled the whole body: tried 2026-11-14)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
# Repair: a vertex driven mostly by a bone far from it, while another bone
# is much nearer (a long tail beside where the old body's thighs were took
# their weights and smeared into a sheet as the legs walked), gets weights by
# distance to the nearest bone segments instead (--no-fix skips this).
BONES = '--bones' in argv   # every vertex by distance to the nearest bones (no copy from the old surface)
if BONES:
    from mathutils.geometry import intersect_point_line
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform and b.name in new.vertex_groups}
    def segd(p, ab):
        a, b = ab; q, t = intersect_point_line(p, a, b); t = min(1, max(0, t)); return (p - (a + (b - a) * t)).length
    for vg in new.vertex_groups: vg.remove(list(range(len(new.data.vertices))))
    for v in new.data.vertices:
        p = new.matrix_world @ v.co
        ds = sorted((segd(p, ab), n) for n, ab in segs.items())[:3]
        inv = [(1 / max(d, 1e-4) ** 6, n) for d, n in ds]; tot = sum(w for w, _ in inv)
        for w, n in inv: new.vertex_groups[n].add([v.index], w / tot, 'REPLACE')
    print('[reskin] weights by bone distance for all', len(new.data.vertices), 'vertices')
elif not AUTO and '--no-fix' not in argv:
    from mathutils.geometry import intersect_point_line
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform and b.name in new.vertex_groups}
    def segd(p, ab):
        a, b = ab; q, t = intersect_point_line(p, a, b); t = min(1, max(0, t)); return (p - (a + (b - a) * t)).length
    gi = {vg.index: vg.name for vg in new.vertex_groups}
    L = max((ohi - olo)); fixed = 0
    for v in new.data.vertices:
        p = new.matrix_world @ v.co
        ws = [(g.weight, gi[g.group]) for g in v.groups if gi.get(g.group) in segs and g.weight > 0]
        if not ws: continue
        top = max(ws)[1]; dtop = segd(p, segs[top])
        ds = sorted((segd(p, ab), n) for n, ab in segs.items())
        if ds[0][0] < .45 * dtop and dtop > .06 * L:
            near = ds[:3]; inv = [(1 / max(d, 1e-4) ** 4, n) for d, n in near]; tot = sum(w for w, _ in inv)
            for g in list(v.groups): new.vertex_groups[gi[g.group]].remove([v.index])
            for w, n in inv: new.vertex_groups[n].add([v.index], w / tot, 'REPLACE')
            fixed += 1
    print('[reskin] re-weighted', fixed, 'vertices by bone distance')
for o in olds: bpy.data.objects.remove(o, do_unlink=True)
# into the armature's space (its import rotation and scale would apply twice)
new.data.transform(arm.matrix_world.inverted()); new.matrix_world = Matrix.Identity(4)
if AUTO:
    # --auto: Blender's bone-heat weights instead of the old surface's (for a
    # body whose parts sit elsewhere than the old one's: the dog's low tail
    # took hind-leg weights and stretched into a sheet)
    for vg in list(new.vertex_groups): new.vertex_groups.remove(vg)
    bpy.ops.object.select_all(action='DESELECT'); new.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print('[reskin] automatic weights:', len(new.vertex_groups), 'groups')
else:
    new.parent = arm; new.matrix_parent_inverse = Matrix.Identity(4); new.matrix_basis = Matrix.Identity(4)
    m = new.modifiers.new('Armature', 'ARMATURE'); m.object = arm
new.name = 'Body'
arm.data.pose_position = 'POSE'
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_skins=True, export_image_format='JPEG', export_jpeg_quality=85)
print('[reskin] wrote', OUT, len(new.data.vertices), 'verts')
