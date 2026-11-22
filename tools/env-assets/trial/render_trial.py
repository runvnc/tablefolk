# blender -b --factory-startup -P render_trial.py -- out_prefix W D H model.glb [model2.glb ...]
# Fixed cameras for comparing processed building models (metric, front = glTF +Z = Blender -Y, origin at the
# footprint centre on the ground). W, D, H are the reference box (the Meshy baseline's), so every candidate is
# shot from the same places: <out>_<i>_far.png (game scale, front-left, 35 deg down), _back.png (back-right),
# _door.png (eye height 1.6 m, 4.5 m in front of the facade), _close.png (1.6 m from the front-left eave).
# With several models each gets its own index i. MV=1: instead renders unlit-ish RGBA views for multi-view
# models: <out>_mv<az>.png at the azimuths in MVAZ (default "0,90,180,270,45,135,225,315"), elevation MVEL.
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
OUT = a[0]; W, D, H = map(float, a[1:4]); SRCS = a[4:]
RES = int(os.environ.get('RES', 640)); SAMPLES = int(os.environ.get('SAMPLES', 8))

def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = SAMPLES; sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    return sc

def load(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for sl in getattr(o, 'material_slots', []):
            m = sl.material
            if not (m and m.use_nodes) or m.get('m'): continue
            for b in [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']:
                r = b.inputs['Roughness']
                if r.is_linked:
                    mx = m.node_tree.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = 0.6
                    m.node_tree.links.new(r.links[0].from_socket, mx.inputs[0]); m.node_tree.links.new(mx.outputs[0], r)
                else: r.default_value = max(0.6, r.default_value)
            m['m'] = 1
    return new

def cam(sc):
    cd = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co); sc.camera = co; cd.clip_end = 1000
    return cd, co

def shot(sc, cd, co, path, loc, tgt, lens, wpx, hpx):
    sc.render.resolution_x, sc.render.resolution_y = wpx, hpx
    cd.lens = lens; co.location = Vector(loc); co.rotation_euler = (Vector(tgt) - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

if os.environ.get('MV'):
    el = math.radians(float(os.environ.get('MVEL', 20)))
    for i, src in enumerate(SRCS):
        sc = setup(); load(src); sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'
        bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.55
        sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 1.6; so = bpy.data.objects.new('s', sun); sc.collection.objects.link(so)
        cd, co = cam(sc); c = Vector((0, 0, H / 2)); R = math.sqrt(W * W + D * D + H * H) / 2
        d = R / math.sin(math.atan(36 / 2 / 85)) * 1.08
        for az in [int(x) for x in os.environ.get('MVAZ', '0,90,180,270,45,135,225,315').split(',')]:
            t = math.radians(az)
            loc = c + Vector((math.sin(t) * math.cos(el) * d, -math.cos(t) * math.cos(el) * d, math.sin(el) * d))
            so.rotation_euler = (Vector(loc) - c).to_track_quat('Z', 'Y').to_euler()   # light from the camera: no cast shadows seen
            shot(sc, cd, co, f'{OUT}_mv{az}.png', loc, c, 85, 1024, 1024)
    sys.exit(0)

for i, src in enumerate(SRCS):
    sc = setup(); objs = load(src)
    bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.62, 0.70, 0.82, 1); bg.inputs[1].default_value = 0.6
    bpy.ops.mesh.primitive_plane_add(size=400); g = bpy.context.object
    gm = bpy.data.materials.new('g'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']
    gb.inputs['Base Color'].default_value = (0.32, 0.31, 0.27, 1); gb.inputs['Roughness'].default_value = 1; g.data.materials.append(gm)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; sun.angle = math.radians(3)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(45), 0, math.radians(-35))
    cd, co = cam(sc); p = f'{OUT}_{i}'
    shot(sc, cd, co, p + '_far.png', (-0.45 * 22, -22 * 0.9, 22 * 0.62), (0, 0, H * 0.4), 50, RES, RES)
    shot(sc, cd, co, p + '_back.png', (0.45 * 22, 22 * 0.9, 22 * 0.62), (0, 0, H * 0.4), 50, RES, RES)
    shot(sc, cd, co, p + '_door.png', (-0.6, -D / 2 - 4.5, 1.6), (0, -D / 2, 1.8), 24, RES, RES)
    shot(sc, cd, co, p + '_close.png', (-W / 2 + 0.2, -D / 2 - 1.6, H * 0.5), (-W / 2 + 1.4, -D / 2 + 0.3, H * 0.62), 28, RES, RES)
