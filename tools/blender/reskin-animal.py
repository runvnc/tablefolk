# Put a detailed mesh on a rigged low-poly animal, keeping its skeleton and clips.
#   blender -b -P tools/blender/reskin-animal.py -- old_rigged.glb new_mesh.glb out.glb [--flip] [--turn] [--auto] [--bones [--tail]] [--keep-width]
# The new mesh (Meshy image-to-3D, no rig) is turned to lie along the old
# body's length with its head the same way (guessed: the head end is the
# taller one; --flip turns it round, --turn 90 degrees), scaled per axis to
# the old body's bounding box (its skinned meshes only), then takes the old
# mesh's skin weights from the nearest point of its surface (Data Transfer,
# in the rest pose), or with --bones by distance to the nearest bones; with
# --tail as well, the rig's tail chain is moved onto the new body's own tail
# and weights it along its length. The old mesh is dropped; textures are cut
# to 1024 px. 2026-11-14 (--tail 2026-11-19).
import bpy, sys, math, re
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OLD, NEW, OUT = argv[:3]
FLIP, TURN, AUTO = '--flip' in argv, '--turn' in argv, '--auto' in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OLD)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
# the old body: its skinned meshes only (Blender's glTF import adds an
# Icosphere of radius 1 at the origin, the bones' display shape; counted in
# the box, it sank a fitted dragon a unit below the rig, its tail far under
# the tail bones, and turned the head guess round, 2026-11-19)
olds = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)] or [o for o in bpy.data.objects if o.type == 'MESH']
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o not in olds]: bpy.data.objects.remove(o, do_unlink=True)
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
if (head_sign(nv, oax) != head_sign(ov, oax)) != FLIP:   # --flip overrides the guess
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
# --tail (with --bones): the new body's own tail drives the rig's tail chain.
# The tail is the part of the mesh nearer (along the surface) to its far end
# than the plane of the chain's first bone; its length is measured along the
# surface from where it joins the body (so a curled tip counts as the end),
# the chain's bones are moved onto its centre line at the old chain's
# proportions, and each tail vertex is weighted to the two chain bones either
# side of it by that length (never to legs). Without it a dragon's tail lying
# low behind the wolf rig's raised tail bones took the hind legs' weights and
# kinked as they walked (2026-11-19).
TAIL = {}
if BONES and '--tail' in argv:
    import heapq
    tb = set(b.name for b in arm.data.bones if 'tail' in b.name.lower() and b.use_deform)
    chain = [b for b in arm.data.bones if b.name in tb and not (b.parent and b.parent.name in tb)][:1]
    while chain and any(c.name in tb for c in chain[-1].children): chain.append(next(c for c in chain[-1].children if c.name in tb))
    assert len(chain) >= 2, 'no tail chain in the rig'
    par = chain[0].parent.name if chain[0].parent else None
    chain = [b.name for b in chain]   # names: edit mode rebuilds the bones (old references read other bones)
    H = [arm.matrix_world @ arm.data.bones[n].head_local for n in chain]
    me = new.data; nv_ = len(me.vertices); P = [new.matrix_world @ v.co for v in me.vertices]
    # vertices split at UV seams are joined (else the tail is islands)
    can = {}; rep = [can.setdefault(tuple(round(x, 5) for x in P[i]), i) for i in range(nv_)]
    adj = [[] for _ in range(nv_)]
    for e in me.edges:
        a_, b_ = rep[e.vertices[0]], rep[e.vertices[1]]; d_ = (P[a_] - P[b_]).length; adj[a_].append((b_, d_)); adj[b_].append((a_, d_))
    for i in range(nv_):
        if rep[i] != i: adj[i].append((rep[i], 0.0)); adj[rep[i]].append((i, 0.0))
    def dijkstra(seeds, allowed=None):
        g = {i: 0.0 for i in seeds}; q = [(0.0, i) for i in seeds]
        while q:
            d_, i = heapq.heappop(q)
            if d_ > g.get(i, 1e9): continue
            for j, w_ in adj[i]:
                if allowed is not None and j not in allowed: continue
                if d_ + w_ < g.get(j, 1e9): g[j] = d_ + w_; heapq.heappush(q, (d_ + w_, j))
        return g
    ax = oax; sg = 1 if H[-1][ax] > H[0][ax] else -1
    end = max(range(nv_), key=lambda i: sg * P[i][ax])
    gT = dijkstra([end])
    g0 = min((d_ for i, d_ in gT.items() if sg * P[i][ax] <= sg * H[0][ax]), default=None)
    assert g0, 'the tail does not reach the first tail bone'
    tail = set(i for i, d_ in gT.items() if d_ < g0)
    ring = [i for i in tail if any(j not in tail for j, _ in adj[i])]
    D = dijkstra(ring, tail); dmax = max(D.values())
    # bones along the surface length at the old chain's proportions (the last one as long as the one before)
    seg = [(H[k + 1] - H[k]).length for k in range(len(H) - 1)]; seg.append(seg[-1])
    cum = [0.0]
    for x in seg: cum.append(cum[-1] + x)
    Dk = [c / cum[-1] * dmax for c in cum]   # bone k's head at Dk[k]; the tip at Dk[-1]
    # the centre line: mean position of the tail's vertices at each length
    NB = 40; acc = [[Vector(), 0] for _ in range(NB)]
    for i, d_ in D.items():
        k = min(NB - 1, int(d_ / dmax * NB)); acc[k][0] += P[i]; acc[k][1] += 1
    cl = [(k + .5) / NB * dmax for k in range(NB) if acc[k][1]]; cp = [acc[k][0] / acc[k][1] for k in range(NB) if acc[k][1]]
    def along(d_):
        if d_ <= cl[0]: return cp[0]
        for k in range(len(cl) - 1):
            if d_ <= cl[k + 1]: f = (d_ - cl[k]) / (cl[k + 1] - cl[k]); return cp[k].lerp(cp[k + 1], f)
        return cp[-1]
    inv = arm.matrix_world.inverted()
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for k, n in enumerate(chain):
        eb = arm.data.edit_bones[n]; eb.use_connect = False
        off = eb.tail - eb.head; eb.head = inv @ along(Dk[k]); eb.tail = eb.head + off
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = new; new.select_set(True)
    # hat functions over the bones' middles; the first bone shares its root with its parent
    mids = [(Dk[k] + Dk[k + 1]) / 2 for k in range(len(chain))]
    for i, d_ in D.items():
        ws = {}
        if d_ <= mids[0]:
            f = d_ / mids[0]; ws[chain[0]] = .5 + .5 * f
            if par: ws[par] = .5 - .5 * f
        elif d_ >= mids[-1]: ws[chain[-1]] = 1
        else:
            k = max(j for j in range(len(mids)) if mids[j] <= d_); f = (d_ - mids[k]) / (mids[k + 1] - mids[k])
            ws[chain[k]] = 1 - f; ws[chain[k + 1]] = f
        TAIL[i] = ws
    print('[reskin] tail:', len(tail), 'vertices,', round(dmax, 3), 'long; chain', ' '.join(chain), 'moved onto it')
if BONES:
    from mathutils.geometry import intersect_point_line
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform and b.name in new.vertex_groups and not re.match(r'(IK|Pole|FF)', b.name)}   # not the leg controls
    if TAIL: segs = {n: ab for n, ab in segs.items() if n not in chain}   # the chain drives the tail only (moved to the hips, its first bone took them)
    def segd(p, ab):
        a, b = ab; q, t = intersect_point_line(p, a, b); t = min(1, max(0, t)); return (p - (a + (b - a) * t)).length
    for vg in new.vertex_groups: vg.remove(list(range(len(new.data.vertices))))
    for v in new.data.vertices:
        if v.index in TAIL:
            for n, w in TAIL[v.index].items(): new.vertex_groups[n].add([v.index], w, 'REPLACE')
            continue
        p = new.matrix_world @ v.co
        ds = sorted((segd(p, ab), n) for n, ab in segs.items())[:3]
        inv = [(1 / max(d, 1e-4) ** 6, n) for d, n in ds]; tot = sum(w for w, _ in inv)
        for w, n in inv: new.vertex_groups[n].add([v.index], w / tot, 'REPLACE')
    print('[reskin] weights by bone distance for all', len(new.data.vertices), 'vertices')
elif not AUTO and '--no-fix' not in argv:
    from mathutils.geometry import intersect_point_line
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform and b.name in new.vertex_groups and not re.match(r'(IK|Pole|FF)', b.name)}   # not the leg controls
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
