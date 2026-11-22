# blender -b --factory-startup -P render2.py -- model.glb out_prefix [door_x]
# The model at its own (metric) scale. Renders <out>_v0/_v90/_v180/_v270.png (view 0 looks at the front,
# glTF +Z = Blender -Y) and <out>_close.png with the swordswoman (1.7 m) at the front, beside the door.
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]; DOORX = float(a[2]) if len(a) > 2 else 0.0
SAMPLES = int(os.environ.get('SAMPLES', 16))
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene

def matte(mat):
    nt = mat.node_tree
    for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
        r = b.inputs['Roughness']
        if r.is_linked:
            s = r.links[0].from_socket
            mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = 0.6
            nt.links.new(s, mx.inputs[0]); nt.links.new(mx.outputs[0], r)
        else: r.default_value = max(0.6, r.default_value)

def load(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == 'MESH' and o.name.startswith('Icosphere'): o.hide_render = True
        for sl in getattr(o, 'material_slots', []):
            if sl.material and sl.material.use_nodes and not sl.material.get('m'): matte(sl.material); sl.material['m'] = 1
    root = bpy.data.objects.new(os.path.basename(path), None); sc.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
    bpy.context.view_layer.update(); return root, new

def bbox(objs):
    lo = Vector((1e9,) * 3); hi = -lo; dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != 'MESH' or o.hide_render: continue
        e = o.evaluated_get(dg); m = e.to_mesh()
        for v in m.vertices:
            w = e.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        e.to_mesh_clear()
    return lo, hi

root, objs = load(SRC)
lo, hi = bbox(objs); c = (lo + hi) / 2; R = (hi - lo).length / 2
print('SIZE', tuple(round(v, 2) for v in hi - lo), 'MIN', tuple(round(v, 2) for v in lo))
bpy.ops.mesh.primitive_plane_add(size=400); g = bpy.context.object
gm = bpy.data.materials.new('g'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.32, 0.31, 0.27, 1); gb.inputs['Roughness'].default_value = 1; g.data.materials.append(gm)
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; sun.angle = math.radians(3)
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(45), 0, math.radians(-35))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.62, 0.70, 0.82, 1); bg.inputs[1].default_value = 0.6
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = SAMPLES
sc.view_settings.view_transform = 'AgX'
cd = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co); sc.camera = co
cd.clip_end = 1000

def shot(path, loc, tgt, lens, wpx=800, hpx=800):
    sc.render.resolution_x, sc.render.resolution_y = wpx, hpx
    cd.lens = lens; co.location = loc; co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

fov = 2 * math.atan(36 / 2 / 50); d = R / math.sin(fov / 2) * 1.02
if not os.environ.get('NOVIEWS'):
    for yaw in (0, 90, 180, 270):
        t = math.radians(yaw); el = math.radians(20)
        loc = c + Vector((math.sin(t) * math.cos(el) * d, -math.cos(t) * math.cos(el) * d, math.sin(el) * d))
        shot(f'{OUT}_v{yaw}.png', loc, c, 50)

FIG = os.environ.get('FIGURE', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../work/people/swordswoman/clip_Idle.glb'))
if not os.path.exists(FIG): print('no figure', FIG); sys.exit(0)
r2, o2 = load(FIG)
sc.frame_set(20); bpy.context.view_layer.update()
l2, h2 = bbox(o2); print('SWORDSWOMAN', round(h2.z - l2.z, 2))
H = hi.z - lo.z; W = hi.x - lo.x
big = H > 2.2
wx = DOORX + (0.9 if big else 0) if big else hi.x + 0.35
wy = lo.y - (0.6 if big else 0.0) + (0 if big else (hi.y - lo.y) / 2)
r2.location = (wx - (l2.x + h2.x) / 2, wy - (l2.y + h2.y) / 2, -l2.z); r2.rotation_euler = (0, 0, math.radians(-20)); bpy.context.view_layer.update()
span = max(H, W * 0.75, 2.0)
tgt = Vector(((lo.x + max(hi.x, wx)) / 2, (lo.y + hi.y) / 2 if not big else lo.y, min(H, 1.8) * 0.5 if not big else H * 0.4))
dist = span * 1.45 + 1.0
cam = tgt + Vector((-dist * 0.35, -dist, max(1.6, dist * 0.35)))
shot(f'{OUT}_close.png', cam, tgt, 35, 1200, 800)
