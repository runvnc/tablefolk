"""Ground-cover meshes: grass tufts, wildflower clumps, pebbles.

    python3 -I tools/blender/make-cover-atlas.py             # the atlas first
    blender -b --factory-startup -P tools/blender/make-cover.py
    python3 tools/blender/pack-trees.py cover                 # AVIF + meshopt into assets/.../env-nature/cover/

Writes work/env-nature/cover/{grass_tufts,flowers,pebbles}.gltf. Each tuft and
flower clump is three crossed cards (two rows of quads, leaning out a little)
with every normal pointing straight up, so a tuft is lit exactly like the
ground it stands on; vertex colour darkens the roots. One node per kind:
tuft_fine, tuft_wispy, tuft_clump, tuft_broad, flower_daisy, flower_yellow,
flower_blue, pebble_a..e (pebbles: vertex-coloured stones, 4-14 cm).
"""
import bpy, bmesh, os, math, random
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, 'work', 'env-nature', 'cover')

# name: (atlas rect x, y, w, h in px of the 1024 atlas, card width m, height m)
TUFTS = {'tuft_fine': (0, 0, 512, 384, 0.55, 0.41), 'tuft_wispy': (512, 0, 512, 384, 0.6, 0.47),
         'tuft_clump': (0, 384, 512, 384, 0.5, 0.36), 'tuft_broad': (512, 384, 512, 384, 0.62, 0.46)}
FLOWERS = {'flower_daisy': (0, 768, 341, 256, 0.4, 0.3), 'flower_yellow': (341, 768, 341, 256, 0.4, 0.3),
           'flower_blue': (682, 768, 341, 256, 0.4, 0.3)}


def atlas_material():
    m = bpy.data.materials.new('cover'); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(f'{D}/cover_atlas.png'); t.image.name = 'cover_atlas'
    va = nt.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Col'
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
    L(t.outputs['Color'], mx.inputs['A']); L(va.outputs['Color'], mx.inputs['B']); L(mx.outputs['Result'], b.inputs['Base Color'])
    r = nt.nodes.new('ShaderNodeMath'); r.operation = 'ROUND'; L(t.outputs['Alpha'], r.inputs[0]); L(r.outputs[0], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.85; m.use_backface_culling = False; m.surface_render_method = 'DITHERED'
    return m


def cards(name, rect, seed, mat):
    x, y, w, h, W, H = rect; rnd = random.Random(seed)
    u0, u1 = x / 1024 + 0.002, (x + w) / 1024 - 0.002; v1, v0 = 1 - y / 1024 - 0.002, 1 - (y + h) / 1024 + 0.002
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); col = bm.verts.layers.float_color.new('Col')
    for k in range(3):
        a = math.radians(k * 60 + rnd.uniform(-12, 12)); d = Vector((math.cos(a), math.sin(a), 0))
        out = Vector((-d.y, d.x, 0)) * rnd.choice((-1, 1))
        rows = []
        for j, fy in enumerate((0.0, 0.45, 1.0)):
            lean = out * (fy ** 1.5) * H * 0.12 + out * 0.02
            row = []
            for fx in (0.0, 0.5, 1.0):
                p = d * (fx - 0.5) * W * (1 + 0.1 * fy) + Vector((0, 0, fy * H)) + lean
                v = bm.verts.new(p); s = 0.62 + 0.38 * fy ** 0.6; v[col] = (s, s, s, 1)
                row.append((v, (u0 + (u1 - u0) * fx, v0 + (v1 - v0) * fy)))
            rows.append(row)
        for j in range(2):
            for i in range(2):
                q = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]
                f = bm.faces.new([e[0] for e in q])
                for lp, e in zip(f.loops, q): lp[uvl].uv = e[1]
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.normals_split_custom_set_from_vertices([(0, 0, 1)] * len(me.vertices))
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o


def pebble(name, seed, size, mat):
    rnd = random.Random(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    col = bm.verts.layers.float_color.new('Col')
    sx, sy, sz = rnd.uniform(0.8, 1.2), rnd.uniform(0.6, 1.0), rnd.uniform(0.35, 0.6)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    base = Vector((rnd.uniform(0.42, 0.55), rnd.uniform(0.4, 0.5), rnd.uniform(0.34, 0.44)))
    for v in bm.verts:
        n = noise.noise(v.co * 1.3 + off) * 0.22 + noise.noise(v.co * 3.1 + off) * 0.06
        c = v.co * (1 + n); c.x *= sx; c.y *= sy; c.z *= sz
        if c.z < -0.25 * sz: c.z = -0.25 * sz + (c.z + 0.25 * sz) * 0.3     # flat underside, sits in the ground
        v.co = c * size / 2
        t = 0.75 + 0.25 * min(1, max(0, (v.co.z / (size * sz / 2) + 0.4)))   # darker toward the ground
        g = 0.9 + 0.2 * noise.noise(v.co * 40 + off)
        v[col] = (base.x * t * g, base.y * t * g, base.z * t * g, 1)
    for v in bm.verts: v.co.z += size * sz * 0.12
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o


def stone_material():
    m = bpy.data.materials.new('pebble'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; va = nt.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Col'
    nt.links.new(va.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.88
    return m


def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for i, o in enumerate(objs):
        o.location.x = i * 0.0   # all at the origin: each node is its own instance source
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLTF_SEPARATE', use_selection=True, export_yup=True,
                              export_vertex_color='MATERIAL', export_texture_dir='tex', export_animations=False)
    print('WROTE', path, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    am = atlas_material(); sm = stone_material()
    tufts = [cards(n, r, i, am) for i, (n, r) in enumerate(TUFTS.items())]
    export(tufts, f'{D}/grass_tufts.gltf')
    for o in tufts: bpy.data.objects.remove(o)
    fl = [cards(n, r, 10 + i, am) for i, (n, r) in enumerate(FLOWERS.items())]
    export(fl, f'{D}/flowers.gltf')
    for o in fl: bpy.data.objects.remove(o)
    pb = [pebble(f'pebble_{c}', i, s, sm) for i, (c, s) in enumerate(zip('abcde', (0.05, 0.08, 0.11, 0.14, 0.07)))]
    export(pb, f'{D}/pebbles.gltf')


main()
