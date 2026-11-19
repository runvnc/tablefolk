# Give a rigged creature a mouth that opens: a "mouth_open" shape key
# (the game's talking drives it from the voice, app.js updateMouth).
#   blender -b -P tools/blender/add-jaw.py -- in.glb out.glb [--angle 0.45] [--line 0.42] [--hinge 0.35] [--bone Head]
# The head is the vertices the Head bone drives most; the snout runs from the
# bone to the farthest of them (the tip). The mouth is a plane through the
# snout ahead of the hinge (--hinge of the way to the tip): sideways level,
# sloped like the jaw's underside, --line of the way up the snout's height at
# its front third. The snout's faces are cut along that plane (bisect, so the
# lips are a straight line on both sides whatever the triangles) and parted
# along the cut back to the same corners on both sides; the lips keep the
# unparted skin's normals (no crease when closed). Dark, double-sided faces
# line the mouth: palate and floor filling the lip line, and a strip from
# each lip in to a line set toward the middle, so the open mouth is dark
# from any side and closed they lie flat inside it. The lower jaw (below the
# plane ahead of the hinge, eased in near it) turns down --angle radians
# about a sideways axis at the hinge in the shape key, the strips' middle
# line half as far. 2026-11-15; plane cut 2026-11-19 (cutting along existing
# edges left a jagged, lopsided lip, a spike of big triangles and holes).
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
# join the vertices glTF split at UV seams (UVs live on face corners in
# Blender, so nothing is lost): the lip line must be one connected cut
_bm = bmesh.new(); _bm.from_mesh(me); bmesh.ops.remove_doubles(_bm, verts=_bm.verts, dist=1e-6); _bm.to_mesh(me); _bm.free()
# work in armature space (the body is parented to it; bones' rest heads are there too)
to_arm = arm.matrix_world.inverted() @ body.matrix_world
from_arm = to_arm.inverted()
gi = body.vertex_groups[BONE].index
H = arm.data.bones[BONE].head_local.copy()
up = (arm.matrix_world.inverted().to_3x3() @ Vector((0, 0, 1))).normalized()

P = {v.index: to_arm @ v.co for v in me.vertices}
# the head: vertices the Head bone moves most (a fixed weight threshold kept
# only the part next to the bone with distance-based weights)
# (the head's own small bones count as head: the wolf rig's ears took most of it)
hg = {gi} | {g.index for g in body.vertex_groups if any(k in g.name for k in ('Ear', 'Jaw', 'Horn', 'Mouth', 'Eye'))}
headv = [v.index for v in me.vertices if v.groups and max(v.groups, key=lambda g: g.weight).group in hg]
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

mid_s = (s0 + L) / 2
band = [i for i in headv if abs(s[i] - mid_s) < .12 * (L - s0) and abs(h[i] - mouth(s[i])) < .25 * L]
if len(band) < 8: band = [i for i in headv if s[i] > s0]
wc = sum(w[i] for i in band) / len(band)
snout_half = (max(w[i] for i in band) - min(w[i] for i in band)) / 2
# the mouth surface: a plane through the hinge's sideways axis, along the
# mouth line (fitted straight through the per-slice line), so the lips are a
# straight line on both sides whatever the triangles' size (cutting along
# existing edges left a jagged, lopsided lip with a spike of big triangles)
# Its slope is the jaw's underside (the slices' lowest points: the brow and
# horns make the tops, and so a line part way up, climb toward the back,
# which tipped the lips up behind the eye); it passes through the line's
# height at the front third of the snout.
xs = [s0 + (k + .5) / N * (L - s0) for k in range(N)]
lows = [(x, min(b)) for x, b in zip(xs, bins) if len(b) > 3]
mx = sum(x for x, _ in lows) / len(lows); my = sum(y for _, y in lows) / len(lows)
b_ = sum((x - mx) * (y - my) for x, y in lows) / sum((x - mx) ** 2 for x, _ in lows)
fr = range(N * 2 // 3, N); fx = sum(xs[k] for k in fr) / len(fr); fy = sum(line[k] for k in fr) / len(fr)
a_ = fy - b_ * fx
def mouth(sv): return a_ + b_ * sv
pn = (up2 - fwd * b_).normalized(); pc = H + up2 * a_          # plane normal and a point on it (armature space)
def above(q): return (q - pc).dot(pn)
jaw = set(i for i in headv if s[i] > s0 and h[i] < mouth(s[i]) and abs(w[i] - wc) < 1.6 * snout_half)
print('[jaw] head', len(headv), 'jaw', len(jaw), 'snout length', round(L, 3), 'mouth slope', round(b_, 3))

bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
dl = bm.verts.layers.deform.active
inv_arm = to_arm.inverted()
def sw(v):   # s, w of a bmesh vertex (armature space)
    q = to_arm @ v.co; return (q - H).dot(fwd), (q - H).dot(side)
# the snout ahead of the hinge, not the cheeks and frills beside it
def in_snout(v):
    sv, wv = sw(v); return s0 < sv < L * 1.02 and abs(wv - wc) < 1.6 * snout_half
region = [f for f in bm.faces if all(in_snout(v) for v in f.verts)]
geom = list(set(v for f in region for v in f.verts)) + list(set(e for f in region for e in f.edges)) + region
res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=inv_arm @ pc, plane_no=(inv_arm.to_3x3() @ pn).normalized())
cut_e = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
# the lip line: the largest connected run of the cut (other bits are spikes and folds)
adj = {}
for e in cut_e:
    a, b = e.verts; adj.setdefault(a, []).append(e); adj.setdefault(b, []).append(e)
seen = set(); comps = []
for v0 in adj:
    if v0 in seen: continue
    st = [v0]; comp = set(); seen.add(v0)
    while st:
        v = st.pop(); comp.add(v)
        for e in adj[v]:
            o = e.other_vert(v)
            if o not in seen: seen.add(o); st.append(o)
    comps.append(comp)
lip = max(comps, key=lambda c: sum(e.calc_length() for v in c for e in adj[v]) / 2)
ends = [v for v in lip if len(adj[v]) == 1]
assert len(ends) == 2 and all(len(adj[v]) <= 2 for v in lip), 'the lip line is not one simple line: %d ends' % len(ends)
# in order from one corner round the tip to the other
order = [ends[0]]; prev = None
while len(order) < len(lip):
    nxt = [e.other_vert(order[-1]) for e in adj[order[-1]] if e.other_vert(order[-1]) is not prev][0]
    prev = order[-1]; order.append(nxt)
# the same corners both sides (the snout is never quite symmetric): the
# longer side's end is left uncut back to where the other side ends
sc = max(sw(order[0])[0], sw(order[-1])[0])
while sw(order[0])[0] < sc - 1e-9: order.pop(0)
while sw(order[-1])[0] < sc - 1e-9: order.pop()
lip = set(order); ends = [order[0], order[-1]]
lip_e = [next(e for e in adj[order[k]] if e.other_vert(order[k]) is order[k + 1]) for k in range(len(order) - 1)]
print('[jaw] lip line', len(order), 'points; corners at', round(sc / L, 2), 'of the snout')
# the skin's smooth normal along the line, kept for both lips (no crease when closed)
bm.normal_update()
nrm = {tuple(round(x, 6) for x in v.co): v.normal.copy() for v in lip}
# part the lips: each point inside the line becomes two (corners stay one)
bmesh.ops.split_edges(bm, edges=lip_e)
bm.verts.ensure_lookup_table()
key = lambda v: tuple(round(x, 6) for x in v.co)
pos = [key(v) for v in order]; posset = set(pos)
upper = {}; lower = {}
for v in bm.verts:
    k = key(v)
    if k not in posset or not v.link_faces: continue
    c = sum((to_arm @ f.calc_center_median() for f in v.link_faces), Vector()) / len(v.link_faces)
    (upper if above(c) > 0 else lower)[k] = v
for k in (pos[0], pos[-1]):   # corners: one vertex, both lips
    v = upper.get(k) or lower.get(k); upper[k] = lower[k] = v
assert all(k in upper and k in lower for k in pos), 'lip split failed'
U = [upper[k] for k in pos]; Lw = [lower[k] for k in pos]
print('[jaw] split', sum(1 for k in pos if upper[k] is not lower[k]), 'points')
# the mouth inside: the palate (on the upper lip) and the floor (on the lower)
# fill the lip line, dark, double-sided; closed they lie together inside the
# head, open they line the gap and turn with the jaw
mat = bpy.data.materials.new('mouth_inside'); mat.use_nodes = True; mat.use_backface_culling = False
bsdf = mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value = (.12, .02, .02, 1); bsdf.inputs['Roughness'].default_value = .85
me.materials.append(mat); mi = len(me.materials) - 1
def avgw(vs):
    acc = {}
    for v in vs:
        for g, x in v[dl].items(): acc[g] = acc.get(g, 0) + x / len(vs)
    return acc
inside = []
for chain in (U, Lw):
    c = bm.verts.new(sum((v.co for v in chain), Vector()) / len(chain))
    for g, x in avgw(chain).items(): c[dl][g] = x
    for k in range(len(chain) - 1):
        f = bm.faces.new((c, chain[k], chain[k + 1])); f.material_index = mi; f.smooth = False; inside.append(f)
    f = bm.faces.new((c, chain[-1], chain[0])); f.material_index = mi; f.smooth = False; inside.append(f)
    if chain is Lw: floor_c = c
# the cheeks: from each lip a dark strip in to a line set back toward the
# middle of the mouth, so the open mouth shows a dark inside from the side
# (palate and floor alone are edge-on there, and the eye saw through);
# closed they lie flat inside the line
Mv = [U[0]]
for k in range(1, len(U) - 1):
    q = to_arm @ U[k].co; dq = (q - H).dot(side) - wc
    m = bm.verts.new(inv_arm @ (q - side * dq * .45))
    for g, x in U[k][dl].items(): m[dl][g] = x
    Mv.append(m)
Mv.append(U[-1])
for k in range(len(U) - 1):
    for quad in ((U[k], U[k + 1], Mv[k + 1], Mv[k]), (Mv[k], Mv[k + 1], Lw[k + 1], Lw[k])):
        qv = []
        for v in quad:
            if v not in qv: qv.append(v)
        if len(qv) >= 3:
            f = bm.faces.new(qv); f.material_index = mi; f.smooth = False; inside.append(f)
bm.normal_update(); bm.verts.index_update()
Ui = [v.index for v in U]; Li = [v.index for v in Lw]; floor_i = floor_c.index; Mi = [v.index for v in Mv[1:-1]]
bm.to_mesh(me); bm.free()
# custom normals: the lips keep the unparted skin's normal
me.update()
ln = [Vector(n.vector) for n in me.corner_normals]
for p_ in me.polygons:
    if p_.material_index == mi: continue
    for li in p_.loop_indices:
        k = key(me.vertices[me.loops[li].vertex_index])
        if k in nrm: ln[li] = nrm[k]
me.normals_split_custom_set(ln)

# the lower jaw: below the plane in the snout, the lower lip and the floor
P = {v.index: to_arm @ v.co for v in me.vertices}
lowset = set(Li) - {Li[0], Li[-1]}
jaw = set(i for i, q in P.items() if s0 < (q - H).dot(fwd) < L * 1.02 and abs((q - H).dot(side) - wc) < 1.6 * snout_half and above(q) < -1e-6)
jaw = (jaw - set(Ui) - set(Mi)) | lowset | {floor_i}
# the shape key: the lower jaw turned down about the hinge (eased in near it)
body.shape_key_add(name='Basis'); keyb = body.shape_key_add(name='mouth_open')
pivot = H + fwd * s0 + up2 * mouth(s0)
ease = .18 * L
half = set(Mi)   # the cheeks' middle line turns half as far
for i in jaw | half:
    sv = (P[i] - H).dot(fwd)
    t = min(1, max(0, (sv - s0) / ease)); t = t * t * (3 - 2 * t)
    R = Matrix.Rotation(-ANGLE * t * (.5 if i in half else 1), 4, side)
    q = pivot + (R @ (P[i] - pivot).to_4d()).to_3d()
    keyb.data[i].co = from_arm @ q
print('[jaw] jaw', len(jaw), 'vertices')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_skins=True, export_morph=True, export_image_format='JPEG', export_jpeg_quality=85)
print('[jaw] wrote', OUT)
