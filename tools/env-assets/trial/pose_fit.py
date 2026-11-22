# blender -b --factory-startup -P pose_fit.py -- mesh.glb out_dir az0:az1:step el0:el1:step fov1,fov2,.. name
# Silhouette masks of a model for a grid of cameras, to estimate the pose of a concept picture (Pixal3D's
# multi-view input needs a camera-to-world matrix and FOV per view). The model is normalised: bounding-box centre
# at the origin, largest extent 1, front = -Y (glTF +Z), Z up. Cameras look at the origin from distance
# D = 0.75 / tan(fov/2) (the whole unit box in view), azimuth 0 = camera at -Y (the front), 90 = +X.
# TEX=1 RES=1024: textured RGBA views instead of masks (Pixal3D views rendered from a mesh).
# Writes <out_dir>/<name>_<az>_<el>_<fov>.png (128 px masks) and <out_dir>/<name>_cams.json
# ({file: {az, el, fov, d, c2w}}).
import bpy, sys, math, json, os
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]; os.makedirs(OUT, exist_ok=True)
rng = lambda s: [float(x) for x in s.split(':')]
az0, az1, azs = rng(a[2]); el0, el1, els = rng(a[3]); fovs = [float(x) for x in a[4].split(',')]; NAME = a[5]
RES = int(os.environ.get('RES', 128))
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)
objs = [o for o in sc.objects if o.type == 'MESH']
lo = Vector((1e9,) * 3); hi = -lo
for o in objs:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
c = (lo + hi) / 2; s = 1 / max(hi - lo)
root = bpy.data.objects.new('root', None); sc.collection.objects.link(root)
for o in sc.objects:
    if o.parent is None and o != root: o.parent = root
root.matrix_world = Matrix.Scale(s, 4) @ Matrix.Translation(-c)
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'
sc.display.shading.single_color = (1, 1, 1); sc.render.film_transparent = True
TEX = os.environ.get('TEX')   # textured RGBA views (Eevee, soft light from the camera) instead of masks
if TEX:
    sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 16; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.55
    sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 1.6; so = bpy.data.objects.new('s', sun); sc.collection.objects.link(so)
sc.render.resolution_x = sc.render.resolution_y = RES; sc.render.image_settings.color_mode = 'RGBA'
cd = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co); sc.camera = co
cd.sensor_fit = 'HORIZONTAL'; cd.clip_start = 0.01
cams = {}
az = az0
while az <= az1 + 1e-6:
    el = el0
    while el <= el1 + 1e-6:
        for fov in fovs:
            cd.angle = math.radians(fov); d = 0.75 / math.tan(math.radians(fov) / 2)
            t, e = math.radians(az), math.radians(el)
            co.location = Vector((math.sin(t) * math.cos(e) * d, -math.cos(t) * math.cos(e) * d, math.sin(e) * d))
            co.rotation_euler = (-co.location).to_track_quat('-Z', 'Y').to_euler()
            if TEX: so.rotation_euler = co.rotation_euler
            f = f'{NAME}_{int(az)}_{int(el)}_{int(fov)}.png'
            sc.render.filepath = os.path.join(OUT, f); bpy.ops.render.render(write_still=True)
            bpy.context.view_layer.update()
            cams[f] = dict(az=az, el=el, fov=fov, d=d, c2w=[list(r) for r in co.matrix_world])
        el += els
    az += azs
json.dump(dict(norm_center=list(c), norm_scale=s, cams=cams), open(os.path.join(OUT, NAME + '_cams.json'), 'w'))
print('POSEFIT', len(cams))
