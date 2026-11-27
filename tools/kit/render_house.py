# blender -b --factory-startup -P tools/kit/render_house.py -- out_prefix scale W D H model.glb
# The cameras of tools/env-assets/trial/render_trial.py (the old Meshy inn renders: far, back, door at
# 4.5 m, close on the front-left eave; metric, front = Blender -Y, origin at the footprint centre on the
# ground) plus three: inside (eye 1.6 m in the room, towards the front-left corner, a lamp in the room),
# fp (first person at the front-left, eye 1.6 m, looking along the front) and noroof (far, roof objects
# hidden: the cutaway). scale: model units to metres (kit houses: 1.7 / 1.3, a character is 1.3 units);
# W D H: the reference box in metres (0 0 0 = the model's own bounds). A 1.7 m figure stands by the door.
# Writes <out>_{far,back,door,close,corner,inside,fp,noroof}.png (corner: 1.9 m from the
# front-left wall corner at eye height); RES (640), SAMPLES (16).
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
OUT = a[0]; SC = float(a[1]); W, D, H = map(float, a[2:5]); SRC = a[5]
RES = int(os.environ.get('RES', 640)); SAMPLES = int(os.environ.get('SAMPLES', 16))
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = SAMPLES; sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.62, 0.70, 0.82, 1); bg.inputs[1].default_value = 0.6
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=SRC)
new = [o for o in bpy.data.objects if o not in before]
root = bpy.data.objects.new('scale', None); sc.collection.objects.link(root); root.scale = (SC, SC, SC)
for o in new:
    if o.parent is None: o.parent = root
for o in new:   # the same roughness floor as render_trial (glTF roughness maps read glossy in EEVEE)
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
bpy.context.view_layer.update()
meshes = [o for o in new if o.type == 'MESH']
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
if W == 0: W, D, H = hi.x - lo.x, hi.y - lo.y, hi.z - lo.z
print('BOX', W, D, H)
bpy.ops.mesh.primitive_plane_add(size=400); g = bpy.context.object
gm = bpy.data.materials.new('g'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.32, 0.31, 0.27, 1); gb.inputs['Roughness'].default_value = 1; g.data.materials.append(gm)
bpy.ops.mesh.primitive_cylinder_add(radius=.2, depth=1.7, location=(1.3, -D / 2 - .9, .85)); fig = bpy.context.object
fm = bpy.data.materials.new('f'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.55, .2, .15, 1)
fig.data.materials.append(fm)
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; sun.angle = math.radians(3)
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(45), 0, math.radians(-35))
cd = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co); sc.camera = co; cd.clip_end = 1000; cd.clip_start = .05
sc.render.resolution_x = sc.render.resolution_y = RES
ONLY = os.environ.get('ONLY')   # render only these shots (comma list)
def shot(tag, loc, tgt, lens):
    if ONLY and tag not in ONLY.split(','): return
    cd.lens = lens; co.location = Vector(loc); co.rotation_euler = (Vector(tgt) - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{OUT}_{tag}.png'; bpy.ops.render.render(write_still=True)
shot('far', (-0.45 * 22, -22 * 0.9, 22 * 0.62), (0, 0, H * 0.4), 50)
shot('back', (0.45 * 22, 22 * 0.9, 22 * 0.62), (0, 0, H * 0.4), 50)
shot('door', (-0.6, -D / 2 - 4.5, 1.6), (0, -D / 2, 1.8), 24)
shot('close', (-W / 2 + 0.2, -D / 2 - 1.6, H * 0.5), (-W / 2 + 1.4, -D / 2 + 0.3, H * 0.62), 28)
shot('corner', (-W / 2 - 1.1, -D / 2 - 1.5, 1.6), (-W / 2, -D / 2, 1.9), 28)
shot('fp', (-W / 2 - 1.2, -D / 2 - 2.2, 1.6), (W * .1, -D / 2, 1.7), 24)
fig.hide_render = True
lamp = bpy.data.lights.new('lamp', 'POINT'); lamp.energy = 400; lamp.shadow_soft_size = .3
lo_ = bpy.data.objects.new('lamp', lamp); sc.collection.objects.link(lo_); lo_.location = (W * .05, 0, 2.1)
shot('inside', (W * .12, 0, 1.6), (-W / 2, -D / 2, 1.2), 16)
for o in new:
    if '_roof_' in o.name: o.hide_render = True
fig.hide_render = False
shot('noroof', (-0.45 * 22, -22 * 0.9, 22 * 0.62), (0, 0, H * 0.3), 50)
