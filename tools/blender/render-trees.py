"""Check renders of the generated trees (EEVEE, one warm sun + sky, matte).

    blender -b --factory-startup -P tools/blender/render-trees.py -- <mode> [names] [outdir]
modes:
  views  <name>        game camera, eye height beside a 1.7 m figure, from below, from above
  sheet  <a,b,c,...>   all in a row from the game's follow camera, figure for scale
  lights <a,b,...>     the same row, light (.med) versions
Models are read from work/env-nature/out/<name>.gltf (TREES_IN overrides),
renders go to work/env-nature/renders/ unless outdir is given.
Ground: assets/textures/env/grass_meadow_color.webp when it exists, else flat green.
"""
import bpy, sys, os, math
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, 'work', 'env-nature')
IN = os.environ.get('TREES_IN', os.path.join(WORK, 'out'))
A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MODE = A[0] if A else 'views'
NAMES = (A[1] if len(A) > 1 else 'oak_tree').split(',')
OUTD = A[2] if len(A) > 2 else os.path.join(WORK, 'renders')
SAMPLES = int(os.environ.get('SAMPLES', 16))
FIGURE = os.path.join(ROOT, 'work', 'people', 'swordswoman', 'clip_Idle.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def imp(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def group(objs, name, loc=(0, 0, 0), rot=0.0):
    root = bpy.data.objects.new(name, None); sc.collection.objects.link(root)
    for o in objs:
        if o.parent is None: o.parent = root
    root.location = loc; root.rotation_euler = (0, 0, rot); return root


def matte_all():
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        for b in m.node_tree.nodes:
            if b.type == 'BSDF_PRINCIPLED':
                for k in ('Coat Weight', 'Sheen Weight'):
                    if k in b.inputs: b.inputs[k].default_value = 0
                if not b.inputs['Metallic'].is_linked: b.inputs['Metallic'].default_value = 0


def ground(size=80):
    bpy.ops.mesh.primitive_plane_add(size=size); g = bpy.context.active_object; g.name = 'ground'
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tex = os.path.join(ROOT, 'assets', 'textures', 'env', 'grass_meadow_color.webp')
    if os.path.exists(tex) and not os.environ.get('FLATGROUND'):
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (size / 2.5, size / 2.5, 1)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex)
        nt.links.new(tc.outputs['UV'], mp.inputs[0]); nt.links.new(mp.outputs[0], t.inputs[0]); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (0.13, 0.19, 0.06, 1)
    b.inputs['Roughness'].default_value = 0.95
    g.data.materials.append(m); return g


def figure(loc, face_to=None):
    objs = imp(FIGURE)
    for o in objs:
        if o.type == 'MESH' and o.name.startswith('Icosphere'): o.hide_render = True
    r = group(objs, 'figure', loc)
    if face_to is not None:
        d = Vector(face_to) - Vector(loc); r.rotation_euler = (0, 0, math.atan2(d.x, -d.y))
    return r


def light_and_sky():
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = float(os.environ.get('SUN', 4.2)); sun.color = (1.0, 0.86, 0.68); sun.angle = math.radians(2)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(float(os.environ.get('SUN_EL', 48))), 0, math.radians(float(os.environ.get('SUN_AZ', -40))))
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; nt = w.node_tree
    bg = nt.nodes['Background']; bg.inputs['Strength'].default_value = float(os.environ.get('SKY', 0.9))
    tc = nt.nodes.new('ShaderNodeTexCoord'); sx = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sx.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(sx.outputs['Z'], ramp.inputs[0]); cr = ramp.color_ramp
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.42, 0.40, 0.34, 1)       # ground bounce below the horizon
    cr.elements[1].position = 0.6; cr.elements[1].color = (0.30, 0.46, 0.75, 1)
    e = cr.elements.new(0.5); e.color = (0.42, 0.40, 0.34, 1)
    e = cr.elements.new(0.52); e.color = (0.92, 0.84, 0.72, 1)
    e = cr.elements.new(0.62); e.color = (0.6, 0.7, 0.84, 1)
    # Generated z of the world runs 0 (down) .. 1 (up): remap
    mr = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(sx.outputs['Z'], mr.inputs[0]); mr.inputs[1].default_value = -1; mr.inputs[2].default_value = 1
    nt.links.new(mr.outputs[0], ramp.inputs[0]); nt.links.new(ramp.outputs[0], bg.inputs['Color'])


def settings(w=1280, h=720):
    sc.render.engine = 'BLENDER_EEVEE'; ee = sc.eevee
    ee.taa_render_samples = SAMPLES; ee.use_shadows = True; ee.shadow_ray_count = 1; ee.shadow_step_count = 6
    try: ee.use_raytracing = False
    except Exception: pass
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.image_settings.file_format = 'PNG'


def camera(name, loc, tgt, fov=35):
    cd = bpy.data.cameras.new(name); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(fov); cd.clip_start = 0.05; cd.clip_end = 500
    co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co); co.location = loc
    co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return co


def shoot(cam, path):
    sc.camera = cam; sc.render.filepath = path; bpy.ops.render.render(write_still=True); print('WROTE', path, flush=True)


def bounds(objs):
    lo = Vector((1e9,) * 3); hi = -lo
    for o in objs:
        if o.type != 'MESH': continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


os.makedirs(OUTD, exist_ok=True)
light_and_sky(); settings(); G = ground(200)
if MODE == 'views':
    name = NAMES[0]
    objs = imp(f'{IN}/{name}.gltf'); group(objs, name); bpy.context.view_layer.update(); matte_all()
    lo, hi = bounds(objs); H = hi.z; R = max(hi.x, hi.y, -lo.x, -lo.y)
    fx = (R * 0.55 + 0.8, -R * 0.55 - 0.8, 0)
    figure(fx, face_to=(0, -10, 0)); sc.frame_set(20)
    pitch = math.radians(38); dist = max(14, H * 2.0)
    tgt = Vector((0, 0, H * 0.45))
    shoot(camera('game', tgt + Vector((0, -dist * math.cos(pitch), dist * math.sin(pitch))), tgt, 35), f'{OUTD}/{name}-game.png')
    eye = Vector((fx[0] + 0.6, fx[1] - max(5.0, R * 1.3), 1.6))
    shoot(camera('eye', eye, (0, 0, H * 0.42), 50), f'{OUTD}/{name}-eye.png')
    shoot(camera('below', (R * 0.25, -R * 0.2, 1.4), (0.2, 0.15, H), 75), f'{OUTD}/{name}-below.png')
    shoot(camera('above', (0, -0.01, H + max(14, R * 3.5)), (0, 0, H * 0.6), 35), f'{OUTD}/{name}-above.png')
else:
    suffix = '.med' if MODE == 'lights' else ''
    x = 0.0; tops = []
    for name in NAMES:
        objs = imp(f'{IN}/{name}{suffix}.gltf'); bpy.context.view_layer.update()
        lo, hi = bounds(objs); R = max(hi.x - lo.x, hi.y - lo.y) / 2
        x += R; group(objs, name, (x, 0, 0)); tops.append(hi.z); x += R + 1.0
    matte_all()
    figure((-1.5, -2.0, 0), face_to=(0, -10, 0)); sc.frame_set(20)
    W = x; cx = W / 2 - 1.0; G.location.x = cx
    settings(1920, 820)
    pitch = math.radians(float(os.environ.get('PITCH', 32)))
    dist = W * 0.95
    tgt = Vector((cx, 0, max(tops) * 0.35))
    shoot(camera('game', tgt + Vector((0, -dist * math.cos(pitch), dist * math.sin(pitch))), tgt, 30), f'{OUTD}/sheet{suffix}-{MODE}.png')
