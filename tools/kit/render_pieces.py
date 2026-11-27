# blender -b --factory-startup -P tools/kit/render_pieces.py -- outdir a.glb [b.glb ...]
# Fixed views for judging hero pieces (front = Blender -Y): <out>/<name>_front.png (front-left, 25 deg up),
# _back.png (back-right), _close.png (eye 0.5 x the size from the front-left, at the upper third: texture
# sharpness), _clay.png (front, plain grey material: geometry only). RES (default 480), SAMPLES (8).
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; OUT = a[0]; SRCS = a[1:]
RES = int(os.environ.get('RES', 480)); SAMPLES = int(os.environ.get('SAMPLES', 8))
os.makedirs(OUT, exist_ok=True)
for src in SRCS:
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = SAMPLES; sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x = sc.render.resolution_y = RES
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (.62, .66, .72, 1); bg.inputs[1].default_value = .8
    bpy.ops.import_scene.gltf(filepath=src)
    obs = [o for o in sc.objects if o.type == 'MESH']
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in obs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    ctr = (lo + hi) / 2; size = (hi - lo).length
    sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 3.5; sun.angle = math.radians(4)
    so = bpy.data.objects.new('s', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(-30))
    cd = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co); sc.camera = co
    name = os.path.splitext(os.path.basename(src))[0]
    def shot(tag, d, el, az, tgt, lens=50):
        t = math.radians(az); e = math.radians(el)
        co.location = tgt + Vector((math.sin(t) * math.cos(e), -math.cos(t) * math.cos(e), math.sin(e))) * d
        co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler(); cd.lens = lens
        sc.render.filepath = os.path.join(OUT, f'{name}_{tag}.png'); bpy.ops.render.render(write_still=True)
    D = size * 1.55
    shot('front', D, 18, -28, ctr)
    shot('back', D, 18, 152, ctr)
    shot('close', size * .42, 8, -20, Vector((ctr.x, lo.y, lo.z + (hi.z - lo.z) * .62)))
    clay = bpy.data.materials.new('clay'); clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.6, .6, .6, 1)
    for o in obs:
        for i in range(len(o.material_slots)): o.material_slots[i].material = clay
        if not o.material_slots: o.data.materials.append(clay)
    shot('clay', D, 18, -28, ctr)
