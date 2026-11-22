# blender -b --factory-startup -P proc.py -- in.glb out.glb '<json opts>'
# opts: tris (target), w, d (footprint, m), h (height, m; with fit=height), fit ('footprint'|'height'),
#       yaw (deg, turns the model about the vertical so the door faces glTF +Z = Blender -Y),
#       cut (m, after scaling: removes everything below this height, then drops the model onto 0),
#       minpart (fraction of the biggest part's vertex count below which loose parts are deleted; default 0.002),
#       flat (delete loose parts flatter than this fraction of the height that sit at the base; default 0.03)
#       stretch_y (m) + mid (fraction): lengthen along y by stretching only the middle (bed)
#       cream (0..1, + degrey): warm near-white plaster in the base colour texture
#       core (scale): add a dark solid convex core under see-through strands (hay)
#       bake (default 1): bake the full model's shading (surface + normal map) into a new normal map for the
#         decimated mesh (bake_ext, bake_ray: cage extrusion and ray distance as fractions of the size; tangents exported)
#       hp_src: the bake's source GLB when the input was simplified beforehand (finish.sh presimplify)
#       rebake (true or px): new UVs (Smart UV Project) and base colour, roughness and normal baked from the source
#       delight (default .6, 0 off): flatten baked low-frequency shading in the base colour (delight.py)
#       dedup (default 1): delete faces doubled by the weld; split_nm (m): split 3-face edges before decimating
#         (tried for the bed: tore its frame apart; kept for experiments)
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
# hp_src: the bake's high-poly source when the input was simplified beforehand (finish.sh's meshopt pre-pass):
# the original raw, joined, moved with every transform below (xf)
hp = None
if O.get('bake', 1) and O.get('hp_src'):
    before = set(bpy.context.scene.objects); bpy.ops.import_scene.gltf(filepath=O['hp_src'])
    new_ = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    for o in bpy.context.scene.objects: o.select_set(o in new_)
    bpy.context.view_layer.objects.active = new_[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(new_) > 1: bpy.ops.object.join()
    hp = bpy.context.view_layer.objects.active; hp.name = 'hp'
    for o in list(bpy.context.scene.objects):
        if o not in (ob, hp): bpy.data.objects.remove(o, do_unlink=True)
    _b = bmesh.new(); _b.from_mesh(hp.data); bmesh.ops.remove_doubles(_b, verts=_b.verts[:], dist=1e-5); _b.to_mesh(hp.data); _b.free()
    bpy.context.view_layer.objects.active = ob
def xf(M):
    me.transform(M); me.update()
    if hp: hp.data.transform(M); hp.data.update()
# weld: Meshy's GLB splits every vertex along UV seams and hard edges (tens of thousands of fragments);
# without this the loose-part filter deletes real faces and the decimator tears the seams open
_bm = bmesh.new(); _bm.from_mesh(me); bmesh.ops.remove_doubles(_bm, verts=_bm.verts[:], dist=1e-5)
# faces doubled once welded (a thin sheet's two sides on the same vertices: the bed's cloth had thousands) make
# 3-face edges the collapse decimator never touches; the material is double-sided, so one copy is enough
_bm.verts.index_update(); _seen = set(); _dup = []
for f in _bm.faces:
    k = tuple(sorted(v.index for v in f.verts))
    if k in _seen: _dup.append(f)
    else: _seen.add(k)
if _dup and O.get('dedup', 1): bmesh.ops.delete(_bm, geom=_dup, context='FACES_ONLY')
_bm.to_mesh(me); _bm.free(); me.update()
DUP = len(_dup)
def tris():
    me.calc_loop_triangles(); return len(me.loop_triangles)
raw = tris()
# yaw
if O.get('yaw'):
    xf(Matrix.Rotation(math.radians(O['yaw']), 4, 'Z'))

def bounds():
    xs = [v.co for v in me.vertices]
    lo = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
    hi = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
    return lo, hi

def bake_normals(lo_ob, hi_ob):
    """Cycles selected-to-active normal bake (tangent space) into a new image the size of the old normal map.
    The high-poly copy gets the same consistent outward normals as the decimated mesh (the raw's winding is
    inconsistent in places: unfixed, those patches baked as normals pointing into the surface)."""
    for o in bpy.context.scene.objects: o.select_set(o == hi_ob)
    bpy.context.view_layer.objects.active = hi_ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    mat = lo_ob.data.materials[0]; nt = mat.node_tree
    nm = next((n for n in nt.nodes if n.type == 'NORMAL_MAP'), None)
    old = nm.inputs['Color'].links[0].from_node.image if nm and nm.inputs['Color'].is_linked else None
    size = min(old.size[0] if old else 2048, 2048)
    img = bpy.data.images.new('normal_baked', size, size, alpha=False, float_buffer=False); img.colorspace_settings.name = 'Non-Color'
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.interpolation = 'Linear'
    for n in nt.nodes: n.select = False
    tn.select = True; nt.nodes.active = tn
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(O.get('bake_samples', 4))
    lo_, hi_ = bounds(); L = max(hi_ - lo_)
    b = sc.render.bake; b.use_selected_to_active = True; b.cage_extrusion = O.get('bake_ext', 0.004) * L
    b.max_ray_distance = O.get('bake_ray', 0.01) * L; b.margin = 16; b.margin_type = 'EXTEND'; b.normal_space = 'TANGENT'
    for o in bpy.context.scene.objects: o.select_set(o in (lo_ob, hi_ob))
    bpy.context.view_layer.objects.active = lo_ob
    import time; t0 = time.time()
    bpy.ops.object.bake(type='NORMAL')
    print('BAKE', size, round(time.time() - t0, 1), 's')
    img.pack()
    if nm: nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    else:
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    bpy.data.objects.remove(hi_ob, do_unlink=True)

def rebake_all(lo_ob, hi_ob):
    """rebake: a fresh UV layout (Smart UV Project) and base colour, roughness and normal maps baked from the
    full model. For a model whose UV islands are too many to keep through decimation (the bed: 49k pieces as
    imported; any decimator that keeps the seams stops at 33k, one that ignores them smears the textures)."""
    for o in bpy.context.scene.objects: o.select_set(o == hi_ob)
    bpy.context.view_layer.objects.active = hi_ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT'); bpy.ops.object.shade_smooth()
    # the low mesh: its own material (the high one keeps the original) and a new UV layout
    lo_ob.data.materials.clear()
    for o in bpy.context.scene.objects: o.select_set(o == lo_ob)
    bpy.context.view_layer.objects.active = lo_ob
    me_ = lo_ob.data
    while len(me_.uv_layers) > 1: me_.uv_layers.remove(me_.uv_layers[-1])
    me_.uv_layers[0].name = 'UVMap'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    size = int(O.get('rebake', 2048)) if O.get('rebake') is not True else 2048
    mat = bpy.data.materials.new(O.get('name', 'model')); mat.use_nodes = True; nt = mat.node_tree; me_.materials.append(mat)
    bsdf = nt.nodes['Principled BSDF']
    def img(name, srgb):
        i = bpy.data.images.new(name, size, size, alpha=False); i.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = i; return i, t
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(O.get('bake_samples', 4))
    lo_, hi_ = bounds(); L = max(hi_ - lo_)
    b = sc.render.bake; b.use_selected_to_active = True; b.cage_extrusion = O.get('bake_ext', 0.004) * L
    b.max_ray_distance = O.get('bake_ray', 0.01) * L; b.margin = 16; b.margin_type = 'EXTEND'; b.normal_space = 'TANGENT'
    def bake(kind, t, **kw):
        for n in nt.nodes: n.select = False
        t.select = True; nt.nodes.active = t
        for o in bpy.context.scene.objects: o.select_set(o in (lo_ob, hi_ob))
        bpy.context.view_layer.objects.active = lo_ob
        bpy.ops.object.bake(type=kind, **kw); t.image.pack()
    import time; t0 = time.time()
    ci, ct = img('base_baked', True); b.use_pass_direct = False; b.use_pass_indirect = False; b.use_pass_color = True
    bake('DIFFUSE', ct, pass_filter={'COLOR'})
    ri, rt = img('rough_baked', False); bake('ROUGHNESS', rt)
    ni, ntex = img('normal_baked', False); bake('NORMAL', ntex)
    print('REBAKE', size, round(time.time() - t0, 1), 's')
    nt.links.new(ct.outputs['Color'], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(rt.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Red'], bsdf.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(ntex.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Metallic'].default_value = 0
    mat.use_backface_culling = False
    bpy.data.objects.remove(hi_ob, do_unlink=True)

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
xf(Matrix.Translation((-c.x, -c.y, -lo.z))); xf(Matrix.Scale(s, 4))
# lengthen along y by stretching only the middle (ends, posts and boards keep their shape)
if O.get('stretch_y'):
    lo, hi = bounds(); L0 = hi.y - lo.y; cy = (lo.y + hi.y) / 2; a = L0 * O.get('mid', 0.3)
    sy = 1 + (O['stretch_y'] - L0) / (2 * a)
    for m_ in [me] + ([hp.data] if hp else []):
        for v in m_.vertices:
            y = v.co.y - cy
            v.co.y = cy + (y * sy if abs(y) < a else y + math.copysign(a * (sy - 1), y))
        m_.update()
# cut the base
if O.get('cut'):
    bm = bmesh.new(); bm.from_mesh(me)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, O['cut']), plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(me); bm.free(); me.update()
    lo, hi = bounds(); xf(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
# the high-poly source for the normal bake: the welded, cleaned, scaled model before decimation
if O.get('bake', 1) and not hp:
    hp = ob.copy(); hp.data = me.copy(); hp.name = 'hp'; bpy.context.scene.collection.objects.link(hp)
# split_nm: edges of 3+ faces (the bed's cloth folds) stop the collapse decimator; split them apart first and
# weld the copies again after decimation (within split_nm metres)
if O.get('split_nm'):
    bm = bmesh.new(); bm.from_mesh(me)
    nm_e = [e for e in bm.edges if len(e.link_faces) > 2]
    bmesh.ops.split_edges(bm, edges=nm_e); bm.to_mesh(me); bm.free(); me.update(); print('SPLIT', len(nm_e))
# decimate
n = tris(); tgt = O.get('tris', 30000)
for _ in range(3):   # a pass can stop short of the ratio; a second one usually gets there
    n = tris()
    if n <= tgt * 1.05: break
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = tgt / n; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='d')
    if tris() > n * 0.97: break   # no progress
if O.get('split_nm'):
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=float(O['split_nm'])); bm.to_mesh(me); bm.free(); me.update()
# collapsing can push a vertex past the old surface: nothing may poke below the ground (the hay's strands did, 16 cm)
for v in me.vertices:
    if v.co.z < 0: v.co.z = 0
me.update()
# normals
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
try: bpy.ops.mesh.customdata_custom_splitnormals_clear()
except Exception: pass
if O.get('smooth_angle'): bpy.ops.object.shade_smooth_by_angle(angle=math.radians(O['smooth_angle']), keep_sharp_edges=False)
else: bpy.ops.object.shade_smooth()
dec = tris()
# bake the full model's shading (its surface and its normal map) into a new normal map for the decimated one:
# smooth shading on the decimated mesh alone showed its facets (flat patches and wedges on beams and walls)
if hp and O.get('rebake'): rebake_all(ob, hp)
elif hp: bake_normals(ob, hp)
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
# de-light: flatten the baked low-frequency shading in the base colour (delight.py), strength delight (default .6)
if O.get('delight', 0.6):
    import numpy as np
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from delight import delight
    for mat in me.materials:
        if not mat or not mat.use_nodes: continue
        for b in [x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED']:
            inp = b.inputs['Base Color']
            if not inp.is_linked or inp.links[0].from_node.type != 'TEX_IMAGE': continue
            img = inp.links[0].from_node.image
            if img.get('delit'): continue
            w, h = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
            px[::-1, :, :3] = delight(px[::-1, :, :3].copy(), float(O.get('delight', 0.6)), int(O.get('delight_r', 40)))
            img.pixels[:] = px.ravel(); img['delit'] = 1; img.update(); img.file_format = 'PNG'; img.pack(); print('DELIGHT', img.name)
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
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_yup=True, export_apply=True, export_tangents=bool(O.get('bake', 1)))
print('STATS', json.dumps({'raw_tris': raw, 'dup_faces': DUP, 'tris': dec, 'removed_parts': removed[:12], 'n_removed': len(removed), 'size_xyz_blender': [round(v, 2) for v in hi - lo], 'tex': imgs, 'kb': os.path.getsize(DST) // 1024}))
