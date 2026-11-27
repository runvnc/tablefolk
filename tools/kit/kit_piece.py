# Normalise a processed hero piece for the building kit (2026-11-27).
#   blender -b --factory-startup -P tools/kit/kit_piece.py -- in.glb out_dir name '<json opts>'
# in.glb: the output of tools/env-assets/proc.py (welded, decimated, normal map baked, metric, front -Y).
# opts: yaw (deg about +Z, first); fit {"x": w, "y": d, "z": h} in game units (1 square = 1); a missing axis takes the mean factor of
#   axis named by "by" (default the first given of z, x, y: {"z": .92} is a uniform fit by height); anchor: "bottom" (x, y centre, z min),
#   "back-top" (x centre, y max = against the wall, z max), "back-bottom", "stair" (x max, y max, z min);
#   tex (px, default 1024); leaf (door only): split the closed leaf off as <out>/door_leaf.glb (bisect at
#   the frame's inner opening, found where the front surface is recessed; the front sheet becomes the
#   leaf, its back a mirrored copy 6 cm behind, with its origin on the hinge at -x; the back sheet is deleted, so the
#   frame is an open doorway). Writes <out>/<name>.glb and merges its entry into <out>/pieces.json
#   (box, tris, offset: where the leaf's hinge sits relative to the door's origin).
import bpy, bmesh, sys, json, os, math
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]; SRC, OUTD, NAME, O = a[0], a[1], a[2], json.loads(a[3])
os.makedirs(OUTD, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(o in obs)
bpy.context.view_layer.objects.active = obs[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(obs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.name = NAME; me = ob.data
for o in list(bpy.context.scene.objects):
    if o != ob: bpy.data.objects.remove(o, do_unlink=True)

if O.get('yaw'): me.transform(Matrix.Rotation(math.radians(O['yaw']), 4, 'Z')); me.update()

def bounds():
    vs = [v.co for v in me.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])
lo, hi = bounds(); size = hi - lo
fit = O.get('fit', {}); f = {}
for i, k in enumerate('xyz'):
    if k in fit: f[i] = fit[k] / size[i]
by = 'xyz'.index(O['by']) if 'by' in O else next(i for i in (2, 0, 1) if i in f)
S = [f.get(i, f[by]) for i in range(3)]
me.transform(Matrix.Diagonal((*S, 1))); me.update()
lo, hi = bounds(); c = (lo + hi) / 2
anc = O.get('anchor', 'bottom')
org = {'bottom': Vector((c.x, c.y, lo.z)), 'back-top': Vector((c.x, hi.y, hi.z)), 'back-bottom': Vector((c.x, hi.y, lo.z)),
       'stair': Vector((hi.x, hi.y, lo.z))}[anc]
me.transform(Matrix.Translation(-org)); me.update()

# textures down to the game size
px = O.get('tex', 1024)
for im in bpy.data.images:
    if im.size[0] > px: im.scale(px, px)

meta = json.load(open(os.path.join(OUTD, 'pieces.json'))) if os.path.exists(os.path.join(OUTD, 'pieces.json')) else {}

def export(obj, path):
    for o in bpy.context.scene.objects: o.select_set(o == obj)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_image_format='JPEG',
                              export_tangents=True, export_apply=True)

def tris(obj): return sum(len(p.vertices) - 2 for p in obj.data.polygons)

if O.get('leaf'):
    lo, hi = bounds(); h = hi.z - lo.z
    # the frame's inner opening: where the frontmost surface (min y) is recessed behind the frame's front
    vs = [v.co.copy() for v in me.vertices]
    band = [v for v in vs if lo.z + .3 * h < v.z < lo.z + .7 * h]
    yf = min(v.y for v in band)
    bins = {}
    for v in band:
        b = round(v.x / .02); bins[b] = min(bins.get(b, 9), v.y)
    rec = sorted(b * .02 for b, y in bins.items() if y > yf + .035)
    xi = min(abs(rec[0]), abs(rec[-1])) if rec else .38
    col = [v for v in vs if abs(v.x) < xi * .5]
    zb = {}
    for v in col:
        b = round(v.z / .02); zb[b] = min(zb.get(b, 9), v.y)
    zs = sorted(b * .02 for b, y in zb.items() if y > yf + .035)
    zi_lo, zi_hi = (zs[0], zs[-1]) if zs else (.05, h * .88)
    print('LEAF opening x +-%.3f z %.3f..%.3f front y %.3f' % (xi, zi_lo, zi_hi, yf))
    bm = bmesh.new(); bm.from_mesh(me)
    for co, no in ((Vector((-xi, 0, 0)), Vector((1, 0, 0))), (Vector((xi, 0, 0)), Vector((1, 0, 0))),
                   (Vector((0, 0, zi_lo)), Vector((0, 0, 1))), (Vector((0, 0, zi_hi)), Vector((0, 0, 1)))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    inside = lambda p: -xi + 1e-4 < p.x < xi - 1e-4 and zi_lo + 1e-4 < p.z < zi_hi - 1e-4
    # the front sheet: faces in the opening that look forward (-y); the rest in it (the back sheet) goes
    ins = [fc for fc in bm.faces if inside(fc.calc_center_median())]
    front = [fc for fc in ins if fc.normal.y < .1]
    back = [fc for fc in ins if fc.normal.y >= .1]
    # the leaf: the front sheet, a copy (face order is kept by copy())
    bm.faces.index_update(); fi = {fc.index for fc in front}
    leaf_bm = bm.copy(); leaf_bm.faces.index_update()
    bmesh.ops.delete(leaf_bm, geom=[fc for fc in leaf_bm.faces if fc.index not in fi], context='FACES')
    bmesh.ops.delete(bm, geom=front + back, context='FACES')
    bm.to_mesh(me); bm.free()
    lme = bpy.data.meshes.new('door_leaf'); leaf_bm.to_mesh(lme); leaf_bm.free()
    for m in me.materials: lme.materials.append(m)
    lob = bpy.data.objects.new('door_leaf', lme); bpy.context.scene.collection.objects.link(lob)
    # its back: the front sheet mirrored about a plane 6 cm behind it (a solidify spiked on the strap edges)
    ys = sorted(v.co.y for v in lme.vertices); mid = ys[len(ys) // 2] + .03   # 3 cm behind the median face
    bm2 = bmesh.new(); bm2.from_mesh(lme)
    dup = bmesh.ops.duplicate(bm2, geom=bm2.faces[:])['geom']
    dv = [g for g in dup if isinstance(g, bmesh.types.BMVert)]
    for v in dv: v.co.y = 2 * mid - v.co.y
    bmesh.ops.reverse_faces(bm2, faces=[g for g in dup if isinstance(g, bmesh.types.BMFace)])
    bm2.to_mesh(lme); bm2.free(); lme.update()
    hinge = Vector((-xi, mid, 0))
    lme.transform(Matrix.Translation(-hinge)); lme.update()
    export(lob, os.path.join(OUTD, 'door_leaf.glb'))
    meta['door_leaf'] = dict(offset=list(hinge), tris=tris(lob), opening=[2 * xi, zi_lo, zi_hi])
    bpy.data.objects.remove(lob, do_unlink=True)

lo, hi = bounds()
export(ob, os.path.join(OUTD, NAME + '.glb'))
meta[NAME] = dict(box=[round(x, 3) for x in (hi - lo)], tris=tris(ob), anchor=anc, scale=[round(s, 4) for s in S])
json.dump(meta, open(os.path.join(OUTD, 'pieces.json'), 'w'), indent=1)
print('PIECE ' + json.dumps(meta[NAME]))
