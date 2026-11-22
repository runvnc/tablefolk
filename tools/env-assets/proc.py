# blender -b --factory-startup -P proc.py -- in.glb out.glb '<json opts>'
# opts: tris (target), w, d (footprint, m), h (height, m; with fit=height), fit ('footprint'|'height'),
#       yaw (deg, turns the model about the vertical so the door faces glTF +Z = Blender -Y),
#       cut (m, after scaling: removes everything below this height, then drops the model onto 0),
#       minpart (fraction of the biggest part's vertex count below which loose parts are deleted; default 0.002),
#       flat (delete loose parts flatter than this fraction of the height that sit at the base; default 0.03)
#       stretch_y (m) + mid (fraction): lengthen along y by stretching only the middle (bed)
#       cream (0..1, + degrey): warm near-white plaster in the base colour texture
#       core (scale): add a dark solid convex core under see-through strands (hay)
# Vertices are welded by position (1e-5) right after joining: Meshy's GLBs split every vertex along UV seams
# and hard edges, so on unwelded geometry the loose-part filter deletes real faces and the decimator tears
# every seam open (2026-11-21: the shipped inn had 46k open edges in 1,612 pieces). Never skip the weld.
# Prints STATS {...}
import bpy, bmesh, sys, json, os, math
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]; SRC, DST = a[0], a[1]; O = json.loads(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(False)
# bake transforms, join into one mesh
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(objs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
for o in list(bpy.context.scene.objects):
    if o != ob: bpy.data.objects.remove(o, do_unlink=True)
me = ob.data
# weld: Meshy's GLB splits every vertex along UV seams and hard edges (tens of thousands of fragments);
# without this the loose-part filter deletes real faces and the decimator tears the seams open
_bm = bmesh.new(); _bm.from_mesh(me); bmesh.ops.remove_doubles(_bm, verts=_bm.verts[:], dist=1e-5); _bm.to_mesh(me); _bm.free(); me.update()
def tris():
    me.calc_loop_triangles(); return len(me.loop_triangles)
raw = tris()
# yaw
if O.get('yaw'):
    me.transform(Matrix.Rotation(math.radians(O['yaw']), 4, 'Z')); me.update()

def bounds():
    xs = [v.co for v in me.vertices]
    lo = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
    hi = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
    return lo, hi

# loose parts: drop tiny ones and flat ones at the base (ground discs)
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
seen = set(); parts = []
for v in bm.verts:
    if v.index in seen: continue
    stack = [v]; comp = []; seen.add(v.index)
    while stack:
        x = stack.pop(); comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); stack.append(y)
    parts.append(comp)
big = max(len(p) for p in parts)
lo, hi = bounds(); H0 = hi.z - lo.z
kill = []; removed = []
for p in parts:
    zs = [v.co.z for v in p]
    if len(p) < big * O.get('minpart', 0.002): kill += p; removed.append(('tiny', len(p))); continue
    if (max(zs) - min(zs)) < H0 * O.get('flat', 0.03) and min(zs) < lo.z + H0 * 0.05 and len(p) != big:
        kill += p; removed.append(('flat', len(p)))
bmesh.ops.delete(bm, geom=list(set(kill)), context='VERTS')
bm.to_mesh(me); bm.free(); me.update()

# scale
lo, hi = bounds(); ext = hi - lo
if O.get('fit', 'footprint') == 'height': s = O['h'] / ext.z
else: s = min(O['w'] / ext.x, O['d'] / ext.y)
if O.get('scale_mul'): s *= O['scale_mul']
c = (lo + hi) / 2
me.transform(Matrix.Translation((-c.x, -c.y, -lo.z))); me.transform(Matrix.Scale(s, 4)); me.update()
# lengthen along y by stretching only the middle (ends, posts and boards keep their shape)
if O.get('stretch_y'):
    lo, hi = bounds(); L0 = hi.y - lo.y; cy = (lo.y + hi.y) / 2; a = L0 * O.get('mid', 0.3)
    sy = 1 + (O['stretch_y'] - L0) / (2 * a)
    for v in me.vertices:
        y = v.co.y - cy
        v.co.y = cy + (y * sy if abs(y) < a else y + math.copysign(a * (sy - 1), y))
    me.update()
# cut the base
if O.get('cut'):
    bm = bmesh.new(); bm.from_mesh(me)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, O['cut']), plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(me); bm.free(); me.update()
    lo, hi = bounds(); me.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))); me.update()
# decimate
n = tris(); tgt = O.get('tris', 30000)
for _ in range(3):   # a pass can stop short of the ratio; a second one usually gets there
    n = tris()
    if n <= tgt * 1.05: break
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = tgt / n; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='d')
    if tris() > n * 0.97: break   # no progress
# collapsing can push a vertex past the old surface: nothing may poke below the ground (the hay's strands did, 16 cm)
for v in me.vertices:
    if v.co.z < 0: v.co.z = 0
me.update()
# normals
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
try: bpy.ops.mesh.customdata_custom_splitnormals_clear()
except Exception: pass
bpy.ops.object.shade_smooth()
dec = tris()
lo, hi = bounds()
ob.name = me.name = O.get('name', 'model')
imgs = sorted({(i.name, tuple(i.size)) for i in bpy.data.images if i.size[0]})
for i in bpy.data.images:
    if i.size[0] and max(i.size) > 2048:
        k = 2048 / max(i.size); i.scale(int(i.size[0] * k), int(i.size[1] * k))
# warm the near-white plaster toward the scene's cream (base colour texture only)
if O.get('cream'):
    import numpy as np
    k = float(O['cream'])
    for mat in me.materials:
        if not mat or not mat.use_nodes: continue
        for b in [x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED']:
            inp = b.inputs['Base Color']
            if not inp.is_linked: continue
            node = inp.links[0].from_node
            if node.type != 'TEX_IMAGE' or not node.image or node.image.get('creamed'): continue
            img = node.image; px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            rgb = px[:, :3]; mx = rgb.max(1); mn = rgb.min(1); sat = (mx - mn) / np.maximum(mx, 1e-4)
            lum = rgb.mean(1)
            if O.get('degrey'):   # background grey baked between strands (hay): to dark straw
                w = np.clip((0.22 - sat) / 0.12, 0, 1) * k
                tgt = np.stack([lum * 0.75, lum * 0.55, lum * 0.28], 1)
            else:
                w = np.clip((mx - 0.42) / 0.15, 0, 1) * np.clip((0.3 - sat) / 0.15, 0, 1) * k
                tgt = np.stack([lum * 1.02, lum * 0.90, lum * 0.70], 1) * 0.93
            rgb[:] = rgb * (1 - w[:, None]) + tgt * w[:, None]
            img.pixels[:] = px.ravel(); img['creamed'] = 1; img.update()
            print('CREAM', img.name, float(w.mean()))
            img.file_format = 'PNG'; img.pack()
# a solid dark core under see-through strand geometry (hay)
if O.get('core'):
    bm = bmesh.new(); bm.from_mesh(me)
    hull = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    keep = set(hull['geom']);
    bm2 = bmesh.new()
    vmap = {}
    for f in [g for g in hull['geom'] if isinstance(g, bmesh.types.BMFace)]:
        vs = []
        for v in f.verts:
            if v not in vmap: vmap[v] = bm2.verts.new(v.co)
            vs.append(vmap[v])
        try: bm2.faces.new(vs)
        except ValueError: pass
    bm.free()
    lo, hi = bounds(); c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
    k = float(O['core'])
    for v in bm2.verts: v.co = c + Vector(((v.co.x - c.x) * k, (v.co.y - c.y) * k, v.co.z * k))
    cm = bpy.data.meshes.new('core'); bm2.to_mesh(cm); bm2.free()
    co = bpy.data.objects.new('core', cm); bpy.context.scene.collection.objects.link(co)
    mat = bpy.data.materials.new('core'); mat.use_nodes = True
    pb = mat.node_tree.nodes['Principled BSDF']; pb.inputs['Base Color'].default_value = (0.10, 0.06, 0.02, 1); pb.inputs['Roughness'].default_value = 1
    cm.materials.append(mat)
    for o in bpy.context.scene.objects: o.select_set(o in (ob, co))
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.join(); me = ob.data
    dec = tris()
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_yup=True, export_apply=True)
print('STATS', json.dumps({'raw_tris': raw, 'tris': dec, 'removed_parts': removed[:12], 'n_removed': len(removed), 'size_xyz_blender': [round(v, 2) for v in hi - lo], 'tex': imgs, 'kb': os.path.getsize(DST) // 1024}))
