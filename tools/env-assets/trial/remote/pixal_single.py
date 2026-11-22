# python pixal_single.py <model_dir> <out_dir> <steps> <res> <name>=<image>:<seed,seed..> [...]
# Pixal3D single-image (pipeline.json; camera from MoGe-2) for the open image-to-3D trial: inference.py's
# run_inference with the pipeline and MoGe loaded once, <steps> in all three stages, the <res> cascade, and the GLB
# at 300k vertices with a 2048 texture (as the fal TRELLIS.2 runs). Writes <out_dir>/<name>_s<seed>.glb.
import sys, os, time
sys.path.insert(0, '/root/Pixal3D'); os.chdir('/root/Pixal3D')
os.environ.setdefault('ATTN_BACKEND', 'sdpa')
import inference as inf
import o_voxel
model_dir, out_dir, steps, res = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
os.makedirs(out_dir, exist_ok=True)
t0 = time.time(); P = inf.init_pipeline(model_dir, low_vram=bool(os.environ.get('LOW_VRAM'))); print('LOADED', int(time.time() - t0), flush=True)
inf.init_pipeline = lambda *a, **k: P
_moge = {}
_lm = inf.load_moge_model
def lm(*a, **k):
    if 'm' not in _moge: _moge['m'] = _lm(*a, **k)
    return _moge['m']
inf.load_moge_model = lm
_tg = o_voxel.postprocess.to_glb
def tg(**kw): kw.update(decimation_target=300000, texture_size=2048, use_tqdm=False); return _tg(**kw)
o_voxel.postprocess.to_glb = tg
for job in sys.argv[5:]:
    name, rest = job.split('=', 1); img, seeds = rest.rsplit(':', 1)
    for s in [int(x) for x in seeds.split(',')]:
        t1 = time.time(); out = os.path.join(out_dir, f'{name}_s{s}.glb')
        inf.run_inference(img, out, seed=s, ss_sampling_steps=steps, shape_slat_sampling_steps=steps, tex_slat_sampling_steps=steps,
                          model_path=model_dir, low_vram=bool(os.environ.get('LOW_VRAM')), resolution=res)
        print('DONE', out, int(time.time() - t1), 's', flush=True)
print('ALL_DONE', flush=True)
