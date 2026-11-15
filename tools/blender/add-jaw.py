# Give a rigged creature a mouth that opens: a "mouth_open" shape key
# (the game's talking drives it from the voice, app.js updateMouth).
#   blender -b -P tools/blender/add-jaw.py -- in.glb out.glb [--angle 0.45] [--line 0.42] [--hinge 0.35] [--bone Head]
# The head is the vertices the Head bone drives most; the snout runs from the
# bone to the farthest of them (the tip). The mouth line lies --line of the
# way up the snout's height, all along it; faces across the line in front of
# the hinge (--hinge of the way to the tip) are cut, so the lips part; the
# lower jaw (below the line, ahead of the hinge, eased in near it) turns down
# --angle radians about a sideways axis at the hinge in the shape key. A dark
# mouth inside (a squashed sphere on the Head bone) fills the gap. 2026-11-15.
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
IN, OUT = a[0], a[1]
def opt(n, d):
    return float(a[a.index(n) + 1]) if n in a else d
ANGLE, LINE, HINGE = opt('--angle', .45), opt('--line', .42), opt('--hinge', .35)
BONE = a[a.index('--bone') + 1] if '--bone' in a else 'Head'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o != body]: bpy.data.objects.remove(o, do_unlink=True)
me = body.data
# work in armature space (the body is parented to it; bones' rest heads are there too)
to_arm = arm.matrix_world.inverted() @ body.matrix_world
from_arm = to_arm.inverted()
gi = body.vertex_groups[BONE].index
H = arm.data.bones[BONE].head_local.copy()
up = (arm.matrix_world.inverted().to_3x3() @ Vector((0, 0, 1))).normalized()

P = {v.index: to_arm @ v.co for v in me.vertices}
# the head: vertices the Head bone moves most (a fixed weight threshold kept
# only the part next to the bone with distance-based weights)
headv = [v.index for v in me.vertices if v.groups and max(v.groups, key=lambda g: g.weight).group == gi]
assert len(headv) > 50, 'too few head vertices: %d' % len(headv)
# ahead: the way the neck points into the head (horns sweeping back can reach
# farther from the bone than the snout, so not just the farthest vertex)
par = arm.data.bones[BONE].parent
f0 = H - (par.head_local if par else H - up)
f0 = (f0 - up * f0.dot(up)).normalized()
tip = max(headv, key=lambda i: (P[i] - H).dot(f0))
fwd = (P[tip] - H); fwd = (fwd - up * fwd.dot(up)).normalized()
side = fwd.cross(up).normalized(); up2 = side.cross(fwd).normalized()
L = (P[tip] - H).dot(fwd)
# then the whole snout, by shape: everything ahead of the bone up to the tip
# and near the snout's axis (the weights alone missed much of it on a body
# wider than its rig)
def _ax(i):
    d = P[i] - H; return (d - fwd * d.dot(fwd)).length
far = [i for i in range(len(me.vertices)) if 0 < (P[i] - H).dot(fwd) < L * 1.04 and _ax(i) < .75 * L]
if len(far) > len(headv) * .8:
    headv = sorted(set(headv) | set(far)); tip = max(headv, key=lambda i: (P[i] - H).dot(fwd)); L = (P[tip] - H).dot(fwd)
s = {i: (P[i] - H).dot(fwd) for i in headv}; h = {i: (P[i] - H).dot(up2) for i in headv}; w = {i: (P[i] - H).dot(side) for i in headv}
# the mouth line: per slice along the snout, LINE of the way up its height
N = 12; s0 = HINGE * L
bins = [[] for _ in range(N)]
for i in headv:
    if s[i] >= s0: bins[min(N - 1, int((s[i] - s0) / (L - s0 + 1e-9) * N))].append(h[i])
line = []
for b in bins: line.append(min(b) + LINE * (max(b) - min(b)) if len(b) > 3 else None)
for k in range(N):   # fill gaps
    if line[k] is None: line[k] = next((x for x in line[k:] + line[::-1] if x is not None), 0)
def mouth(sv):
    t = min(N - 1.001, max(0, (sv - s0) / (L - s0 + 1e-9) * N - .5)); k = int(t); f = t - k
    return line[k] * (1 - f) + line[min(N - 1, k + 1)] * f
jaw = set(i for i in headv if s[i] > s0 and h[i] < mouth(s[i]))
print('[jaw] head', len(headv), 'jaw', len(jaw), 'snout length', round(L, 3))

mid_s = (s0 + L) / 2
# sized and centred from the snout around the mouth line at its middle (not
# the whole head: horns and frills made it poke out of a cheek)
band = [i for i in headv if abs(s[i] - mid_s) < .12 * (L - s0) and abs(h[i] - mouth(s[i])) < .25 * L]
if len(band) < 8: band = [i for i in headv if s[i] > s0]
wc = sum(w[i] for i in band) / len(band)
inner_w = max(1e-3, .45 * (max(w[i] for i in band) - min(w[i] for i in band)) / 2)
hs = [h[i] for i in headv if abs(s[i] - mid_s) < .12 * (L - s0)]
inner_h = max(1e-3, .16 * (max(hs) - min(hs)))
c_arm = H + fwd * mid_s + up2 * mouth(mid_s) + side * wc
snout_half = (max(w[i] for i in band) - min(w[i] for i in band)) / 2
jaw = set(i for i in jaw if abs(w[i] - wc) < 1.3 * snout_half)   # the jaw only, not cheeks and frills beside it
# cut the lips: faces ahead of the hinge with corners on both sides of the line
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
cut = [f for f in bm.faces if all(v.index in s for v in f.verts) and min(s[v.index] for v in f.verts) > s0 + .08 * L
       and all(abs(w[v.index] - wc) < 1.15 * snout_half for v in f.verts)
       and any(v.index in jaw for v in f.verts) and not all(v.index in jaw for v in f.verts)]
bmesh.ops.delete(bm, geom=cut, context='FACES_ONLY'); bm.to_mesh(me); bm.free()
print('[jaw] cut', len(cut), 'faces')

# the dark mouth inside, on the head bone
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1)
inner = bpy.context.active_object; inner.name = 'MouthInside'
M = Matrix.Identity(4); M.col[0][:3] = fwd * ((L - s0) * .36); M.col[1][:3] = side * inner_w; M.col[2][:3] = up2 * inner_h; M.col[3][:3] = c_arm
inner.data.transform(from_arm @ M)
# parented like the body (its local space is the armature's): set the parent
# first, then the same local transform, or the armature's scale applies twice
inner.parent = arm; inner.matrix_parent_inverse = body.matrix_parent_inverse.copy(); inner.matrix_basis = body.matrix_basis.copy()
mat = bpy.data.materials.new('mouth_inside'); mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value = (.12, .02, .02, 1); bsdf.inputs['Roughness'].default_value = .8
inner.data.materials.append(mat)
vg =inner.vertex_groups.new(name=BONE); vg.add(list(range(len(inner.data.vertices))), 1.0, 'REPLACE')
mod = inner.modifiers.new('Armature', 'ARMATURE'); mod.object = arm

# the shape key: the lower jaw turned down about the hinge (eased in near it)
body.shape_key_add(name='Basis'); key = body.shape_key_add(name='mouth_open')
pivot = H + fwd * s0 + up2 * mouth(s0 + .05 * L)
ease = .18 * L
for i in jaw:
    if i >= len(key.data): continue
    t = min(1, (s[i] - s0) / ease); t = t * t * (3 - 2 * t)
    R = Matrix.Rotation(-ANGLE * t, 4, side)
    q = pivot + (R @ (P[i] - pivot).to_4d()).to_3d()
    key.data[i].co = from_arm @ q
# the inside follows a little (slight gape)
ik = None
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_skins=True, export_morph=True, export_image_format='JPEG', export_jpeg_quality=85)
print('[jaw] wrote', OUT)
