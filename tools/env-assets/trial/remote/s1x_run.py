# python s1x_run.py <w dir> <out_dir> <seeds> <name>=<image> [...] [--tex <name>=<image>=<mesh.glb> ...]
# Step1X-3D (StepFun, Apache-2.0) for the open image-to-3D trial: geometry (Step1X-3D-Geometry-1300m: 50 steps,
# guidance 7.5, octree 512, up to 400k faces) for each image and seed, then Step1X-3D-Texture on each result
# (seed as the geometry's), and texturing of given meshes (--tex: Meshy's shapes). Models load once, from local
# copies (<w dir>/stepfun-ai/Step1X-3D, and SDXL base under <w dir>/stabilityai, patched into the texture pipeline).
# Writes <out_dir>/<name>_s<seed>_geo.glb, <name>_s<seed>.glb (textured) and tex_<name>.glb.
import sys, os, time, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, '/root/Step1X-3D'); os.chdir('/root/Step1X-3D')
import torch, trimesh
W, OUT = sys.argv[1], sys.argv[2]; seeds = [int(s) for s in sys.argv[3].split(',')]
args = sys.argv[4:]; k = args.index('--tex') if '--tex' in args else len(args)
gen = [a.split('=') for a in args[:k]]; tex = [a.split('=') for a in args[k + 1:]]
os.makedirs(OUT, exist_ok=True)
from step1x3d_geometry.models.pipelines.pipeline import Step1X3DGeometryPipeline
from step1x3d_geometry.models.pipelines.pipeline_utils import reduce_face, remove_degenerate_face
REPO = os.path.join(W, 'stepfun-ai/Step1X-3D')
done = []
if gen:
    t0 = time.time(); geo = Step1X3DGeometryPipeline.from_pretrained(REPO, subfolder='Step1X-3D-Geometry-1300m').to('cuda'); print('GEO_LOADED', int(time.time() - t0), flush=True)
    for name, img in gen:
        for s in seeds:
            t1 = time.time(); g = torch.Generator(device=geo.device); g.manual_seed(s)
            out = geo(img, guidance_scale=7.5, num_inference_steps=50, octree_resolution=512, max_facenum=400000, generator=g)
            p = os.path.join(OUT, f'{name}_s{s}_geo.glb'); out.mesh[0].export(p); done.append((name, img, s, p))
            print('GEO_DONE', p, int(time.time() - t1), 's', flush=True)
    del geo; torch.cuda.empty_cache()
from step1x3d_texture.pipelines.step1x_3d_texture_synthesis_pipeline import Step1X3DTexturePipeline
t0 = time.time(); texp = Step1X3DTexturePipeline.from_pretrained(REPO, subfolder='Step1X-3D-Texture'); print('TEX_LOADED', int(time.time() - t0), flush=True)
def texture(img, mesh_path, out, seed):
    t1 = time.time(); m = trimesh.load(mesh_path, force='mesh'); m = remove_degenerate_face(m); m = reduce_face(m)
    texp(img, m, seed=seed).export(out); print('TEX_DONE', out, int(time.time() - t1), 's', flush=True)
for name, img, mp in tex:
    try: texture(img, mp, os.path.join(OUT, f'tex_{name}.glb'), 1)
    except Exception as e: print('TEX_FAILED', name, repr(e)[:300], flush=True)
for name, img, s, p in done:
    try: texture(img, p, os.path.join(OUT, f'{name}_s{s}.glb'), s)
    except Exception as e: print('TEX_FAILED', name, s, repr(e)[:300], flush=True)
print('ALL_DONE', flush=True)
