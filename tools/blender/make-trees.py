"""Procedural trees and plants for Tablefolk (assets/models/props/env-nature/).

    python3 tools/blender/env-fetch.py                     # once: CC0 bark/leaf sources (Poly Haven)
    python3 -I tools/blender/make-leaf-atlases.py          # leaf-cluster atlases
    BLENDER_USER_RESOURCES=work/env-nature/blender-user \\
      blender -b --factory-startup -P tools/blender/make-trees.py -- [names,...]
    python3 tools/blender/pack-trees.py                    # AVIF + meshopt into assets/

Sapling Tree Gen (extensions.blender.org, GPL; its output is ours to release)
must be installed once into the private user dir above:
    BLENDER_USER_RESOURCES=work/env-nature/blender-user blender --command \\
      extension install-file -r user_default -e <add-on-sapling-tree-gen-v1.0.0.zip>

Sapling grows the branch skeleton (Weber-Penn presets ported from tree-gen)
and its leaf positions. This script then builds the game meshes itself:
  - bark: tubes along Sapling's Bezier curves, thick ones first until the
    bark triangle budget is spent, sides by radius, tiled bark UVs;
  - foliage: leaf-cluster cards (atlases from make-leaf-atlases.py) planted
    at Poisson-spaced leaf positions, pointing out from their twig; cupped
    (a 2x2 grid with a raised spine) in the full version, folded once in the
    light one; normals bent toward the card's clump centre and the crown
    centre (plus a little up) so the canopy shades as lumps, not planes;
  - vertex-colour occlusion: darker toward the crown and clump interiors and
    underneath (COLOR_0, multiplied into the base colour by glTF).
Each type is written twice: <type>.gltf (full, 6-10k triangles, cupped
cards) and <type>.med.gltf (light, 2-3k: fewer, larger cards folded once,
fewer bark sides and branches), to work/env-nature/out/.
Origin at the trunk base, metres, +Y up after export.
"""
import bpy, bmesh, sys, os, math, random, json, addon_utils
from mathutils import Vector, Matrix, kdtree, noise

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, 'work', 'env-nature')
DL = os.path.join(WORK, 'dl')
ATL = os.path.join(WORK, 'atlases')
OUT = os.environ.get('TREES_OUT', os.path.join(WORK, 'out'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(ARGS[0].split(',')) if ARGS and ARGS[0] else None

# bark: (Poly Haven texture id, metres per repeat around, metres per repeat along)
BARKS = {
    'oak':    ('jolcham_oak_bark_01', 0.9, 1.2),
    'pine':   ('pine_bark', 0.8, 1.2),
    'smooth': ('tree_bark_03', 0.9, 1.4),
    'brown':  ('bark_brown_02', 0.8, 1.1),
    'dead':   ('bark_willow_02', 0.9, 1.4),
}
ATLAS_CELLS = {'broadleaf': 4, 'autumn': 4, 'conifer': 4}

# species. preset: Sapling preset; height: metres; bark; atlas + cells used;
# card: card edge in metres (full; light uses card * light_scale); cards: full card count;
# bark_tris: full bark budget; conifer: flat, drooping sprays; tint: per-card colour jitter
SPECIES = {
    'oak_tree':    dict(preset='cambridge_oak', seed=3, sap=dict(baseSize=0.36), height=9.0, bark='oak', atlas='broadleaf', cells=[0], card=1.1, cards=700, bark_tris=3000, lobes=11),
    'oak_tree_b':  dict(preset='cambridge_oak', seed=11, sap=dict(baseSize=0.3), height=8.5, bark='oak', atlas='broadleaf', cells=[0], card=1.1, cards=700, bark_tris=3000, lobes=10),
    'oak_tree_c':  dict(preset='coast_live_oak', seed=5, height=8.0, bark='oak', atlas='broadleaf', cells=[0], card=1.1, cards=700, bark_tris=3000, lobes=12),
    'tree':        dict(preset='acer', seed=2, sap=dict(baseSize=0.3), height=7.0, bark='brown', atlas='broadleaf', cells=[1], card=1.0, cards=560, bark_tris=2600, lobes=9),
    'tall_tree':   dict(preset='black_tupelo', seed=4, height=12.0, bark='smooth', atlas='broadleaf', cells=[2], card=1.25, cards=620, bark_tris=2800, lobes=9),
    'autumn_tree': dict(preset='acer', seed=6, height=7.5, bark='brown', atlas='autumn', cells=[0, 1, 3], card=1.05, cards=560, bark_tris=2600, lobes=9),
    'pine_tree':   dict(preset='european_larch', seed=1, height=9.0, bark='pine', atlas='conifer', cells=[0, 1], card=1.1, cards=640, bark_tris=2200, conifer=True),
    'pine_tree_b': dict(preset='european_larch', seed=8, height=8.0, bark='pine', atlas='conifer', cells=[0, 1], card=1.1, cards=640, bark_tris=2200, conifer=True),
    'pine_tree_c': dict(preset='balsam_fir', seed=2, height=8.5, bark='pine', atlas='conifer', cells=[0, 1], card=1.1, cards=640, bark_tris=2200, conifer=True),
    'tall_pine':   dict(preset='douglas_fir', seed=3, height=15.0, bark='pine', atlas='conifer', cells=[0, 1, 2], card=1.35, cards=680, bark_tris=2200, conifer=True),
    'dead_tree':   dict(preset='cambridge_oak', seed=7, sap=dict(showLeaves=False, baseSize=0.3), bark_tint=0.7, height=7.0, bark='dead', atlas=None, cells=[], card=0, cards=0, bark_tris=7000),
    'flower_bush': dict(preset='coyote_brush', seed=2, height=1.1, bark='brown', atlas='broadleaf', cells=[3], card=0.42, cards=300, bark_tris=500, bush=True, lobes=5),
    'red_bush':    dict(preset='coyote_brush', seed=9, height=1.0, bark='brown', atlas='autumn', cells=[2], card=0.42, cards=300, bark_tris=500, bush=True, lobes=5),
    'fern':        dict(fern=True, height=0.75, atlas='conifer', cells=[3]),
}
LIGHT = dict(card_scale=1.4, card_frac=0.5, bark_frac=0.36)


# ------------------------------------------------------------------ Sapling
def sapling(preset, seed, overrides=None):
    """grow a Sapling preset (its settings dict, with our overrides) and return its objects"""
    mod = addon_utils.enable('bl_ext.user_default.sapling_tree_gen', default_set=True)
    import ast
    src = open(os.path.join(os.path.dirname(mod.__file__), 'presets', preset + '.py')).read()
    kw = ast.literal_eval(src[src.index('{'):])
    kw.update(overrides or {}); kw['seed'] = seed
    before = set(bpy.data.objects)
    op = bpy.ops.curve.tree_add.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in op}
    r = bpy.ops.curve.tree_add(do_update=True, **kw)
    assert r == {'FINISHED'}, r
    new = [o for o in bpy.data.objects if o not in before]
    curves = next(o for o in new if o.type == 'CURVES')
    leaves = next((o for o in new if o.type == 'MESH' and o.name.startswith('leaves')), None)
    return new, curves, leaves


def read_curves(obj):
    """[(points [Vector], radii [float])] sampled along each Bezier curve, world space"""
    cd = obj.data; M = obj.matrix_world
    n = len(cd.points)
    def attr(name, size):
        a = cd.attributes.get(name)
        if a is None: return None
        buf = [0.0] * (n * size); a.data.foreach_get('vector' if size == 3 else 'value', buf)
        return [Vector(buf[i * size:(i + 1) * size]) for i in range(n)] if size == 3 else buf
    pos = attr('position', 3); hl = attr('handle_left', 3); hr = attr('handle_right', 3); rad = attr('radius', 1)
    out = []
    from mathutils.geometry import interpolate_bezier
    for c in cd.curves:
        i0, k = c.first_point_index, c.points_length
        if k < 2: continue
        pts, rr = [], []
        for j in range(i0, i0 + k - 1):
            seg = Vector(pos[j + 1]) - Vector(pos[j]); res = 4 if seg.length > 0.6 else 3
            if hl is not None:
                b = interpolate_bezier(pos[j], hr[j], hl[j + 1], pos[j + 1], res + 1)
            else:
                b = [pos[j].lerp(pos[j + 1], t / res) for t in range(res + 1)]
            for t, p in enumerate(b[:-1]):
                pts.append(M @ p); rr.append(rad[j] + (rad[j + 1] - rad[j]) * t / res)
        pts.append(M @ pos[i0 + k - 1]); rr.append(rad[i0 + k - 1])
        out.append((pts, rr))
    return out


def simplify(pts, rr, ang=9.0):
    """drop samples where the tube barely bends or tapers"""
    if len(pts) <= 2: return pts, rr
    P, R = [pts[0]], [rr[0]]
    for i in range(1, len(pts) - 1):
        d0 = (pts[i] - P[-1]); d1 = (pts[i + 1] - pts[i])
        if d0.length < 1e-6 or d1.length < 1e-6: continue
        bend = math.degrees(d0.angle(d1, 0))
        acc = (pts[i] - P[-1]).length
        if bend > ang or abs(rr[i] - R[-1]) > 0.25 * max(R[-1], 1e-4) or acc > 1.6:
            P.append(pts[i]); R.append(rr[i])
    P.append(pts[-1]); R.append(rr[-1]); return P, R


# ------------------------------------------------------------------ bark
def sides_for(r, R0, light):
    f = r / max(R0, 1e-6)
    if light: return 7 if f > 0.6 else 5 if f > 0.3 else 4 if f > 0.12 else 3
    return 10 if f > 0.6 else 7 if f > 0.3 else 5 if f > 0.12 else 4


def build_bark(curves, budget, light, bark_key, ao_fn, scale):
    """tubes along curves, thickest first, until the triangle budget is spent"""
    _, tu, tv = BARKS[bark_key]
    R0 = max(r[0] for _, r in curves) if curves else 1
    order = sorted(range(len(curves)), key=lambda i: -curves[i][1][0])
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); col = bm.verts.layers.float_color.new('Col')
    tris = 0; used = 0
    for ci in order:
        pts, rr = curves[ci]
        if rr[0] * scale < 0.004: break
        pts, rr = simplify(pts, rr, 12 if light else 8)
        sides = sides_for(rr[0], R0, light)
        cost = (len(pts) - 1) * sides * 2 + sides
        if tris + cost > budget: continue
        tris += cost; used += 1
        # parallel-transport frames
        t0 = (pts[1] - pts[0]).normalized()
        nrm = t0.orthogonal().normalized()
        rings = []; vacc = 0.0
        circ = 2 * math.pi * rr[0] * scale; ku = max(1, round(circ / tu))
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            nrm = (nrm - t * nrm.dot(t)).normalized(); bin_ = t.cross(nrm)
            if i: vacc += (p - pts[i - 1]).length * scale
            r = max(rr[i], 0.0015 / scale)
            ring = []
            for s in range(sides + 1):
                a = 2 * math.pi * s / sides
                d = nrm * math.cos(a) + bin_ * math.sin(a)
                ring.append((p + d * r, s / sides * ku, vacc / tv, d))
            rings.append(ring)
        vs = [[bm.verts.new(q[0]) for q in ring[:-1]] for ring in rings]
        for i in range(len(rings) - 1):
            for s in range(sides):
                s1 = (s + 1) % sides
                f = bm.faces.new((vs[i][s], vs[i][s1], vs[i + 1][s1], vs[i + 1][s]))
                for lp, (ri, si, wrap) in zip(f.loops, ((i, s, False), (i, s1, s1 == 0), (i + 1, s1, s1 == 0), (i + 1, s, False))):
                    q = rings[ri][sides if wrap else si]; lp[uvl].uv = (q[1], q[2])
        # close the tip with a point
        tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * rr[-1] * 1.5)
        for s in range(sides):
            s1 = (s + 1) % sides
            f = bm.faces.new((vs[-1][s], vs[-1][s1], tip))
            for lp, uu in zip(f.loops, (rings[-1][s][1:3], rings[-1][s1 if s1 else sides][1:3], (rings[-1][s][1], rings[-1][s][2] + 0.05))):
                lp[uvl].uv = uu
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for v in bm.verts:
        a = ao_fn(v.co, bark=True); v[col] = (a, a, a, 1.0)
    me = bpy.data.meshes.new('bark'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me, used


# ------------------------------------------------------------------ foliage
def poisson(points, dmin, cap):
    """greedy Poisson-disc subset (grid hash)"""
    random.shuffle(points)
    cell = dmin / math.sqrt(3); grid = {}; out = []
    for p in points:
        k = (int(p.x // cell), int(p.y // cell), int(p.z // cell))
        ok = True
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for dz in (-2, -1, 0, 1, 2):
                    for q in grid.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        if (q - p).length < dmin: ok = False; break
                    if not ok: break
                if not ok: break
            if not ok: break
        if ok:
            out.append(p); grid.setdefault(k, []).append(p)
            if len(out) >= cap: break
    return out


def kmeans(pts, k, iters=12):
    random.seed(1); C = random.sample(pts, min(k, len(pts)))
    for _ in range(iters):
        groups = [[] for _ in C]
        kd = kdtree.KDTree(len(C))
        for i, c in enumerate(C): kd.insert(c, i)
        kd.balance()
        lab = [kd.find(p)[1] for p in pts]
        for p, l in zip(pts, lab): groups[l].append(p)
        C = [sum(g, Vector()) / len(g) if g else C[i] for i, g in enumerate(groups)]
    kd = kdtree.KDTree(len(C))
    for i, c in enumerate(C): kd.insert(c, i)
    kd.balance()
    lab = [kd.find(p)[1] for p in pts]
    rad = [0.0] * len(C)
    for p, l in zip(pts, lab): rad[l] = max(rad[l], (p - C[l]).length)
    return C, lab, rad, kd


class Crown:
    """crown centre, per-direction outer radius (for occlusion), clumps"""
    def __init__(self, pts, height):
        self.c = sum(pts, Vector()) / len(pts)
        zs = [p.z for p in pts]; self.zmin, self.zmax = min(zs), max(zs)
        self.H = height
        ico = bmesh.new(); bmesh.ops.create_icosphere(ico, subdivisions=2, radius=1.0)
        self.dirs = [v.co.normalized() for v in ico.verts]; ico.free()
        self.kd = kdtree.KDTree(len(self.dirs))
        for i, d in enumerate(self.dirs): self.kd.insert(d, i)
        self.kd.balance()
        rmax = [0.0] * len(self.dirs)
        for p in pts:
            d = p - self.c
            if d.length < 1e-6: continue
            i = self.kd.find(d.normalized())[1]; rmax[i] = max(rmax[i], d.length)
        # fill empty directions and smooth
        avg = sum(rmax) / max(1, sum(1 for r in rmax if r > 0))
        rmax = [r if r > 0 else avg * 0.6 for r in rmax]
        for _ in range(2):
            rmax = [0.5 * rmax[i] + 0.5 * sum(rmax[j] for _, j, _ in self.kd.find_n(self.dirs[i], 6)) / 6 for i in range(len(rmax))]
        self.rmax = rmax

    def depth(self, p):
        d = p - self.c
        if d.length < 1e-6: return 0.0
        return d.length / self.rmax[self.kd.find(d.normalized())[1]]


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)


def build_cards(spec, samples, branch_kd, crown, light, scale):
    """leaf-cluster cards. samples: leaf positions (world, unscaled)"""
    size = spec['card'] * (LIGHT['card_scale'] if light else 1.0)
    n = int(spec['cards'] * (LIGHT['card_frac'] if light else 1.0))
    conifer = spec.get('conifer', False); bush = spec.get('bush', False)
    pts = [p * scale for p in samples]
    lobes = spec.get('lobes', 0)
    if lobes:
        # bough masses: cluster the leaves and pull each cluster in toward its centre, so the
        # crown breaks into separate clouds with gaps and a lumpy outline instead of one dome
        sub = random.Random(5).sample(pts, min(3000, len(pts)))
        LC, _, _, lkd = kmeans(sub, lobes)
        lr = random.Random(spec.get('seed', 0))
        shrink = [lr.uniform(0.62, 0.82) for _ in LC]
        pts = [LC[i] + (p - LC[i]) * shrink[i] for p in pts for i in (lkd.find(p)[1],)]
    dmin = size * 0.22
    sel = poisson(list(pts), dmin, 10 ** 9)
    while len(sel) > n * 1.02:
        dmin *= 1.07; sel = poisson(list(pts), dmin, 10 ** 9)
    sel = sel[:n]
    C, lab, crad, ckd = kmeans(sel, max(6, len(sel) // (10 if light else 14)))
    up = Vector((0, 0, 1)); rnd = random.Random(spec.get('seed', 0) * 7 + (1 if light else 0))
    cells = spec['cells']; gx, gy = (2, 1) if light else (2, 2)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); col = bm.verts.layers.float_color.new('Col')
    normals = {}
    cc = crown.c.copy(); cc.z -= 0.12 * (crown.zmax - crown.zmin)
    for idx, p in enumerate(sel):
        q = branch_kd.find(p / scale)[0] * scale if branch_kd else cc
        axis = Vector((cc.x, cc.y, p.z))
        out = (p - q); out = out.normalized() if out.length > 1e-4 else Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0.3)).normalized()
        radial = (p - axis); radial = radial.normalized() if radial.length > 1e-4 else out
        if conifer:
            # sprays reach out from the stem, flat-ish, drooping a little
            dirv = (radial * 0.85 + out * 0.15); dirv.z = 0; dirv = dirv.normalized() if dirv.length > 1e-4 else radial
            dirv = (dirv + Vector((0, 0, rnd.uniform(-0.35, 0.05)))).normalized()
            side = dirv.cross(up).normalized()
            tilt = rnd.uniform(-0.35, 0.35)
            nrm = (up * math.cos(tilt) + side * math.sin(tilt)).normalized()
            nrm = (nrm - dirv * nrm.dot(dirv)).normalized()
            xaxis = dirv.cross(nrm).normalized()
            base = p - dirv * size * 0.35
        else:
            dirv = (out * 0.5 + radial * 0.35 + up * rnd.uniform(0.0, 0.45)).normalized()
            if bush: dirv = (dirv + up * 0.4).normalized()
            # random roll about the spray's axis, biased toward facing up/out so tops are not edge-on
            a = rnd.uniform(0, 2 * math.pi)
            t1 = dirv.orthogonal().normalized(); t2 = dirv.cross(t1)
            nrm = (t1 * math.cos(a) + t2 * math.sin(a))
            if nrm.dot(up) < -0.2 and rnd.random() < 0.6: nrm = -nrm
            xaxis = dirv.cross(nrm).normalized()
            base = p - dirv * size * 0.3
        s = size * rnd.uniform(0.82, 1.18)
        cell = rnd.choice(cells); cu, cv = cell % 2, cell // 2
        u0, v0 = cu * 0.5 + 0.004, 1 - (cv + 1) * 0.5 + 0.004; du = dv = 0.5 - 0.008
        flip = rnd.random() < 0.5
        cup = s * (rnd.uniform(0.1, 0.16) if light else rnd.uniform(0.12, 0.2))
        verts = [[None] * (gy + 1) for _ in range(gx + 1)]
        for i in range(gx + 1):
            for j in range(gy + 1):
                fx, fy = i / gx, j / gy
                pos = base + xaxis * (fx - 0.5) * s + dirv * fy * s
                if i == 1: pos += nrm * cup * (0.5 + 0.5 * fy)       # fold along the spray's spine
                if conifer: pos.z -= (fy ** 2) * s * 0.18                            # drooping tip
                v = bm.verts.new(pos); verts[i][j] = (v, ((1 - fx) if flip else fx, fy))
        k = lab[idx]
        for i in range(gx):
            for j in range(gy):
                quad = [verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]]
                f = bm.faces.new([qq[0] for qq in quad])
                for lp, qq in zip(f.loops, quad):
                    lp[uvl].uv = (u0 + qq[1][0] * du, v0 + qq[1][1] * dv)
        for row in verts:
            for v, _ in row:
                pc = v.co - C[k]; pw = v.co - cc
                n_ = (pc.normalized() * 0.55 if pc.length > 1e-4 else Vector()) + (pw.normalized() * 0.6 if pw.length > 1e-4 else Vector()) + up * 0.5
                normals[v] = n_.normalized()
                # occlusion: crown interior, clump interior, underneath
                dcr = crown.depth(v.co / scale)
                dcl = pc.length / max(crad[k], size * 0.5)
                hz = (v.co.z / scale - crown.zmin) / max(1e-3, crown.zmax - crown.zmin)
                a = (0.6 + 0.4 * smooth(0.3, 0.95, dcr)) * (0.8 + 0.2 * smooth(0.15, 0.9, dcl)) * (0.84 + 0.16 * smooth(0.0, 0.7, hz))
                jitter = rnd.uniform(0.94, 1.06) if (i, j) == (0, 0) else 1.0
                v[col] = (a, a, a, 1.0)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('leaves'); bm.verts.index_update()
    nl = [normals[v] for v in bm.verts]
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set_from_vertices(nl)
    return me, len(sel)


# ------------------------------------------------------------------ materials
def img(path, colour):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'; return im


def bark_material(key):
    pid = BARKS[key][0]; d = f'{DL}/tex/{pid}'
    m = bpy.data.materials.get('bark_' + key)
    if m: return m
    m = bpy.data.materials.new('bark_' + key); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img(f'{d}/{pid}_diff_2k.jpg', True); tc.image.name = f'bark_{key}_color'
    va = nt.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Col'
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
    L(tc.outputs['Color'], mx.inputs['A']); L(va.outputs['Color'], mx.inputs['B']); L(mx.outputs['Result'], b.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img(f'{d}/{pid}_nor_gl_2k.jpg', False); tn.image.name = f'bark_{key}_normal'
    nm = nt.nodes.new('ShaderNodeNormalMap'); L(tn.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], b.inputs['Normal'])
    rough = f'{d}/{pid}_rough_2k.jpg'
    if os.path.exists(rough):
        tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = img(rough, False); tr.image.name = f'bark_{key}_rough'
        sp = nt.nodes.new('ShaderNodeSeparateColor'); L(tr.outputs['Color'], sp.inputs['Color']); L(sp.outputs['Green'], b.inputs['Roughness'])
    else: b.inputs['Roughness'].default_value = 0.9
    b.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = True
    return m


def leaf_material(atlas):
    m = bpy.data.materials.get('leaves_' + atlas)
    if m: return m
    m = bpy.data.materials.new('leaves_' + atlas); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(f'{ATL}/leaves_{atlas}.png', True); t.image.name = f'leaves_{atlas}'
    t.image.alpha_mode = 'STRAIGHT'
    va = nt.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Col'
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
    L(t.outputs['Color'], mx.inputs['A']); L(va.outputs['Color'], mx.inputs['B']); L(mx.outputs['Result'], b.inputs['Base Color'])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'ROUND'
    L(t.outputs['Alpha'], gt.inputs[0]); L(gt.outputs[0], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.78; b.inputs['Metallic'].default_value = 0.0
    try: b.inputs['Specular IOR Level'].default_value = 0.3
    except Exception: pass
    m.use_backface_culling = False; m.surface_render_method = 'DITHERED'
    return m


# ------------------------------------------------------------------ fern
def build_fern(spec, light):
    rnd = random.Random(4)
    fronds = 12 if light else 22; segs = 3 if light else 6
    H = spec['height']
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); col = bm.verts.layers.float_color.new('Col')
    normals = {}
    for f in range(fronds):
        az = 2 * math.pi * f / fronds + rnd.uniform(-0.25, 0.25)
        L_ = H * rnd.uniform(1.0, 1.35); w = L_ * 0.42
        pitch0 = math.radians(rnd.uniform(12, 30)) if f % 3 else math.radians(rnd.uniform(3, 12))
        curl = math.radians(rnd.uniform(38, 62))
        d = Vector((math.cos(az), math.sin(az), 0)); side = Vector((-d.y, d.x, 0))
        half = rnd.random() < 0.5; u0 = 0.5 + (0.25 if half else 0.0)
        p = Vector((0, 0, 0)) + d * 0.03; rows = []
        for s in range(segs + 1):
            t = s / segs; ang = pitch0 + curl * t ** 1.4
            if s: p = p + (d * math.sin(ang) + Vector((0, 0, math.cos(ang)))) * (L_ / segs)
            dirv = d * math.sin(ang) + Vector((0, 0, math.cos(ang)))
            nrm = dirv.cross(side).normalized()
            if nrm.z < 0: nrm = -nrm
            wt = w * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.1 + 0.15)))
            twist = side * (1.0 - 0.15 * t)
            a, b_ = bm.verts.new(p - twist * wt / 2), bm.verts.new(p + twist * wt / 2)
            for v in (a, b_):
                normals[v] = (nrm * 0.6 + (v.co - Vector((0, 0, H * 0.25))).normalized() * 0.4).normalized()
                ao = 0.62 + 0.38 * smooth(0.0, 0.5, t); v[col] = (ao, ao, ao, 1)
            rows.append((a, b_, t))
        for s in range(segs):
            a0, b0, t0 = rows[s]; a1, b1, t1 = rows[s + 1]
            fc = bm.faces.new((a0, b0, b1, a1))
            # half a cell per frond (cell 3: two fronds side by side)
            for lp, uv in zip(fc.loops, ((u0, t0), (u0 + 0.25, t0), (u0 + 0.25, t1), (u0, t1))):
                lp[uvl].uv = (uv[0] + (0.004 if uv[0] == u0 else -0.004), 0.004 + uv[1] * 0.492)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    nl = [normals[v] for v in bm.verts]
    me = bpy.data.meshes.new('fern'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set_from_vertices(nl)
    return me


# ------------------------------------------------------------------ driver
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_tris(me): return sum(len(p.vertices) - 2 for p in me.polygons)


def export(name, objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLTF_SEPARATE', use_selection=True, export_yup=True,
                              export_vertex_color='MATERIAL', export_image_format='AUTO', export_texture_dir='tex',
                              export_animations=False, export_skins=False, export_morph=False, export_extras=False)


def make(name, spec, report):
    for light in (False, True):
        clear()
        sc = bpy.context.scene; objs = []
        tag = name + ('.med' if light else '')
        if spec.get('fern'):
            me = build_fern(spec, light); me.materials.append(leaf_material(spec['atlas']))
            o = bpy.data.objects.new(tag, me); sc.collection.objects.link(o); objs = [o]
            info = dict(tris=mesh_tris(me), height=spec['height'], canopy_radius=round(max((Vector(v.co[:2]).length for v in me.vertices)), 2))
        else:
            new, curves_ob, leaves_ob = sapling(spec['preset'], spec['seed'], spec.get('sap'))
            curves = read_curves(curves_ob)
            hz = max(max(p.z for p in pts) for pts, _ in curves)
            leaf_pts = []
            if leaves_ob is not None and spec['cards']:
                me = leaves_ob.data; M = leaves_ob.matrix_world
                buf = [0.0] * (len(me.polygons) * 3); me.polygons.foreach_get('center', buf)
                step = max(1, len(me.polygons) // 60000)
                leaf_pts = [M @ Vector(buf[i * 3:i * 3 + 3]) for i in range(0, len(me.polygons), step)]
                hz = max(hz, max(p.z for p in leaf_pts))
            scale = spec['height'] / hz
            curves = [([p * scale for p in pts], [r * scale for r in rr]) for pts, rr in curves]
            leaf_pts = [p * scale for p in leaf_pts]; hz = spec['height']
            # branch points (not the finest twigs) to tell which way a leaf sprouts
            R0 = max(r[0] for _, r in curves)
            bp = [(p) for pts, rr in curves if rr[0] > R0 * 0.04 for p in pts]
            bkd = kdtree.KDTree(len(bp))
            for i, p in enumerate(bp): bkd.insert(p, i)
            bkd.balance()
            crown = Crown(leaf_pts if leaf_pts else [p for pts, _ in curves for p in pts], hz)
            def ao_fn(co, bark=False):
                h = co.z / hz
                if not leaf_pts: return 0.75 + 0.25 * smooth(0.0, 0.35, h)
                return (0.55 + 0.45 * smooth(0.3, 1.0, crown.depth(co))) * (0.82 + 0.18 * smooth(0.0, 0.25, h)) if h > crown.zmin / hz * 0.9 else (0.82 + 0.18 * smooth(0.0, 0.25, h))
            for o in new: bpy.data.objects.remove(o, do_unlink=True)
            budget = int(spec['bark_tris'] * (LIGHT['bark_frac'] if light else 1.0))
            tint = spec.get('bark_tint', 1.0)
            bme, used = build_bark(curves, budget, light, spec['bark'], lambda co, bark=True: ao_fn(co, bark) * tint, 1.0)
            bme.materials.append(bark_material(spec['bark']))
            ob = bpy.data.objects.new(tag + '_bark', bme); sc.collection.objects.link(ob); objs.append(ob)
            info = dict(bark_tris=mesh_tris(bme), branches=used)
            if leaf_pts:
                lme, ncards = build_cards(spec, leaf_pts, bkd, crown, light, 1.0)
                lme.materials.append(leaf_material(spec['atlas']))
                ol = bpy.data.objects.new(tag + '_leaves', lme); sc.collection.objects.link(ol); objs.append(ol)
                info.update(leaf_tris=mesh_tris(lme), cards=ncards)
            allv = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
            info['tris'] = sum(mesh_tris(o.data) for o in objs)
            info['height'] = round(max(v.z for v in allv), 2)
            info['canopy_radius'] = round(max(Vector((v.x, v.y)).length for v in allv), 2)
        path = f'{OUT}/{tag}.gltf'
        export(tag, objs, path)
        report[tag] = info; print('MADE', tag, info, flush=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    rep_path = f'{OUT}/report.json'
    report = json.load(open(rep_path)) if os.path.exists(rep_path) else {}
    for name, spec in SPECIES.items():
        if ONLY and name not in ONLY: continue
        make(name, spec, report)
        json.dump(report, open(rep_path, 'w'), indent=1)


main()
