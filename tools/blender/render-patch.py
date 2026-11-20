"""A 20 x 20 m test patch: meadow with a dirt path, grass tufts, flowers, pebbles,
two trees and the swordswoman, from the game's follow camera.

    blender -b --factory-startup -P tools/blender/render-patch.py -- [out.png] [tree1,tree2]
Reads the unpacked models (work/env-nature/out, work/env-nature/cover) and the
ground textures in assets/textures/env/ (tile sizes from its manifest.json).
"""
import bpy, sys, os, math, random, json
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, 'work', 'env-nature')
ENV = os.path.join(ROOT, 'assets', 'textures', 'env')
A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTP = A[0] if A else os.path.join(WORK, 'renders', 'patch.png')
TREES = (A[1] if len(A) > 1 else 'oak_tree,pine_tree').split(',')
SAMPLES = int(os.environ.get('SAMPLES', 24))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
rnd = random.Random(3)

render_trees = {}
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render-trees.py')).read().split("os.makedirs(OUTD, exist_ok=True)")[0]
     .replace("bpy.ops.wm.read_factory_settings(use_empty=True)", ""), render_trees)
imp, group, figure, light_and_sky, settings, camera, shoot, matte_all = (render_trees[k] for k in
    ('imp', 'group', 'figure', 'light_and_sky', 'settings', 'camera', 'shoot', 'matte_all'))


def tile_m(name, d=2.0):
    try:
        man = json.load(open(os.path.join(ENV, 'manifest.json')))
        items = man.get('materials', man) if isinstance(man, dict) else man
        for it in (items.values() if isinstance(items, dict) else items):
            if it.get('name') == name:
                for k in ('tile_m', 'tile_size_m', 'tileSize', 'tile_size', 'size_m'):
                    if k in it: return float(it[k])
    except Exception as e: print('manifest', e)
    return d


def path_x(y): return 1.8 * math.sin(y / 6.0) - 0.5


def path_mask_node(nt):
    """1 on the path, 0 on the meadow (object-space x vs a sine of y, with a noisy edge)"""
    L = nt.links.new
    tc = nt.nodes.new('ShaderNodeTexCoord'); sx = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sx.inputs[0])
    m = lambda op, a=None, b=None: (lambda n: (setattr(n, 'operation', op), n)[1])(nt.nodes.new('ShaderNodeMath'))
    d = m('DIVIDE'); L(sx.outputs['Y'], d.inputs[0]); d.inputs[1].default_value = 6.0
    s = m('SINE'); L(d.outputs[0], s.inputs[0])
    k = m('MULTIPLY'); L(s.outputs[0], k.inputs[0]); k.inputs[1].default_value = 1.8
    k2 = m('ADD'); L(k.outputs[0], k2.inputs[0]); k2.inputs[1].default_value = -0.5
    df = m('SUBTRACT'); L(sx.outputs['X'], df.inputs[0]); L(k2.outputs[0], df.inputs[1])
    ab = m('ABSOLUTE'); L(df.outputs[0], ab.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.4; nz.inputs['Detail'].default_value = 6
    L(tc.outputs['Object'], nz.inputs['Vector'])
    nn = m('MULTIPLY'); L(nz.outputs['Fac'], nn.inputs[0]); nn.inputs[1].default_value = 0.9
    e = m('ADD'); L(ab.outputs[0], e.inputs[0]); L(nn.outputs[0], e.inputs[1])
    mr = nt.nodes.new('ShaderNodeMapRange'); L(e.outputs[0], mr.inputs[0]); mr.inputs[1].default_value = 1.55; mr.inputs[2].default_value = 1.15
    return mr.outputs[0]


def pbr_layer(nt, name, scale):
    L = nt.links.new
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / scale,) * 3
    L(tc.outputs['Object'], mp.inputs[0]); out = {}
    for k, col in (('color', True), ('normal', False), ('rough', False)):
        f = os.path.join(ENV, f'{name}_{k}.webp')
        if not os.path.exists(f): continue
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(f, check_existing=True)
        t.image.colorspace_settings.name = 'sRGB' if col else 'Non-Color'; L(mp.outputs[0], t.inputs[0]); out[k] = t.outputs['Color']
    return out


def ground():
    bpy.ops.mesh.primitive_plane_add(size=60); g = bpy.context.active_object
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree; L = nt.links.new; b = nt.nodes['Principled BSDF']
    gm = pbr_layer(nt, 'grass_meadow', tile_m('grass_meadow', 2.0)); dp = pbr_layer(nt, 'dirt_path', tile_m('dirt_path', 2.0))
    mask = path_mask_node(nt)
    def mix(a, b_, dt='RGBA'):
        n = nt.nodes.new('ShaderNodeMix'); n.data_type = dt; L(mask, n.inputs['Factor'])
        L(a, n.inputs['A' if dt != 'RGBA' else 6]); L(b_, n.inputs['B' if dt != 'RGBA' else 7]); return n.outputs[2 if dt == 'RGBA' else 0]
    L(mix(gm['color'], dp['color']), b.inputs['Base Color'])
    if 'normal' in gm and 'normal' in dp:
        nm = nt.nodes.new('ShaderNodeNormalMap'); L(mix(gm['normal'], dp['normal']), nm.inputs['Color']); L(nm.outputs[0], b.inputs['Normal'])
    if 'rough' in gm and 'rough' in dp:
        sp = nt.nodes.new('ShaderNodeSeparateColor'); L(mix(gm['rough'], dp['rough']), sp.inputs[0]); L(sp.outputs[0], b.inputs['Roughness'])
    g.data.materials.append(m)


def on_path(x, y, pad=0.0): return abs(x - path_x(y)) < 1.3 + pad


ground(); light_and_sky(); settings(1600, 900)
cover = {}
for f in ('grass_tufts', 'flowers', 'pebbles'):
    for o in imp(os.path.join(WORK, 'cover', f + '.gltf')):
        if o.type == 'MESH': cover[o.name.split('.')[0]] = o.data; bpy.data.objects.remove(o)


def put(mesh, x, y, s, r):
    o = bpy.data.objects.new(mesh.name, mesh); sc.collection.objects.link(o)
    o.location = (x, y, 0); o.scale = (s, s, s); o.rotation_euler = (0, 0, r)


tufts = [cover[k] for k in ('tuft_fine', 'tuft_wispy', 'tuft_clump', 'tuft_broad')]
flowers = [cover[k] for k in ('flower_daisy', 'flower_yellow', 'flower_blue')]
pebbles = [cover[k] for k in cover if k.startswith('pebble')]
n_t = n_f = n_p = 0
for i in range(5200):
    x, y = rnd.uniform(-10, 10), rnd.uniform(-10, 14)
    if on_path(x, y): continue
    dens = 0.35 + 0.65 * (noise.noise(Vector((x * 0.25, y * 0.25, 1.3))) * 0.5 + 0.5)
    edge = on_path(x, y, 0.9)
    if rnd.random() < dens * (0.55 if not edge else 1.0):
        put(rnd.choice(tufts), x, y, rnd.uniform(0.7, 1.35), rnd.uniform(0, 6.3)); n_t += 1
for c in range(16):   # flowers in loose drifts
    cx, cy = rnd.uniform(-9, 9), rnd.uniform(-9, 13); kind = rnd.choice(flowers)
    for k in range(rnd.randint(3, 8)):
        x, y = cx + rnd.gauss(0, 0.8), cy + rnd.gauss(0, 0.8)
        if not on_path(x, y): put(kind, x, y, rnd.uniform(0.8, 1.2), rnd.uniform(0, 6.3)); n_f += 1
for i in range(70):
    y = rnd.uniform(-10, 14); x = path_x(y) + rnd.choice((-1, 1)) * rnd.uniform(0.6, 1.8)
    put(rnd.choice(pebbles), x, y, rnd.uniform(0.6, 1.4), rnd.uniform(0, 6.3)); n_p += 1
print('cover', n_t, n_f, n_p)
for name, pos in zip(TREES, ((-6.0, 7.5), (6.5, 10.5))):
    objs = imp(os.path.join(WORK, 'out', name + '.gltf')); group(objs, name, (pos[0], pos[1], 0), rnd.uniform(0, 6.3))
matte_all()
sw = (path_x(0) + 0.2, 0.0)
figure((sw[0], sw[1], 0), face_to=(path_x(5), 5, 0)); sc.frame_set(20)
pitch = math.radians(float(os.environ.get('PITCH', 38))); dist = float(os.environ.get('DIST', 14))
tgt = Vector((sw[0], sw[1] + 4.5, 0.8))
cam = camera('follow', tgt + Vector((0, -dist * math.cos(pitch), dist * math.sin(pitch))), tgt, 40)
os.makedirs(os.path.dirname(OUTP), exist_ok=True)
shoot(cam, OUTP)
