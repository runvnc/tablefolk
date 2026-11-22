# python pixal_run.py <model_dir> <out_dir> <steps> <res> <views_dir>:<seed,seed..> [...]
# Pixal3D multi-view (TencentARC, MIT) for the open image-to-3D trial: loads the pipeline once (pipeline_mv.json)
# and runs every views dir with each seed, at <res> (1536 = 512 -> 1536 cascade) with <steps> sampling steps in
# all three stages (default 12). Pixal3D poses its result in frame 0's camera frame when frame 0 is not the
# canonical front view (camera at az 0, el 0); ours is a concept seen from az ~45, el 5-10, so the mesh is turned
# back into the world frame (Rz(az) Rx(-el) of frame 0) before the glTF export. GLB at 300k vertices and a 2048
# texture (as the fal TRELLIS.2 runs), written as <out_dir>/<views name>_s<seed>.glb.
import sys, os, json, math, time
sys.path.insert(0, '/root/Pixal3D'); os.chdir('/root/Pixal3D')
os.environ.setdefault('ATTN_BACKEND', 'sdpa')
import numpy as np, torch
import inference_mv as im
import o_voxel

model_dir, out_dir, steps, res = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
jobs = [(a.split(':')[0], [int(s) for s in a.split(':')[1].split(',')]) for a in sys.argv[5:]]
os.makedirs(out_dir, exist_ok=True)
t0 = time.time(); pipeline = im.init_pipeline(model_dir, im.CONFIG_FILE, low_vram=bool(os.environ.get('LOW_VRAM'))); print('LOADED', int(time.time() - t0), 's', flush=True)
rot = np.array([[-1, 0, 0, 0], [0, 0, -1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=np.float64)
for vd, seeds in jobs:
    tf = json.load(open(os.path.join(vd, 'transforms.json')))
    p = np.array(tf['frames'][0]['transform_matrix'])[:3, 3]; d = np.linalg.norm(p)
    az = math.atan2(p[0], -p[1]); el = math.asin(p[2] / d)
    Rz = np.array([[math.cos(az), -math.sin(az), 0, 0], [math.sin(az), math.cos(az), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
    Rx = np.array([[1, 0, 0, 0], [0, math.cos(-el), -math.sin(-el), 0], [0, math.sin(-el), math.cos(-el), 0], [0, 0, 0, 1]])
    R = Rz @ Rx
    views = im.load_views(vd, None, rembg=im.make_rembg(pipeline)); im.check_main_view(views)
    for seed in seeds:
        t1 = time.time(); torch.manual_seed(seed)
        sp = {'steps': steps}
        mesh_list, (_, _, gres) = pipeline.run_mv(
            views, seed=seed,
            sparse_structure_sampler_params=dict(sp, guidance_strength=7.5, guidance_rescale=0.7, rescale_t=5.0),
            shape_slat_sampler_params=dict(sp, guidance_strength=7.5, guidance_rescale=0.5, rescale_t=3.0),
            tex_slat_sampler_params=dict(sp, guidance_strength=1.0, guidance_rescale=0.0, rescale_t=3.0),
            return_latent=True, pipeline_type=f'{res}_cascade', max_num_tokens=49152)
        t2 = time.time(); mesh = mesh_list[0]
        glb = o_voxel.postprocess.to_glb(vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs, coords=mesh.coords,
                                         attr_layout=pipeline.pbr_attr_layout, grid_size=gres, aabb=[[-0.5] * 3, [0.5] * 3],
                                         decimation_target=300000, texture_size=2048, remesh=True, remesh_band=1, remesh_project=0, use_tqdm=False)
        glb.apply_transform(R); glb.apply_transform(rot)
        out = os.path.join(out_dir, f'{os.path.basename(vd.rstrip("/"))}_s{seed}.glb'); glb.export(out, extension_webp=True)
        print('DONE', out, 'gen', int(t2 - t1), 's, glb', int(time.time() - t2), 's, az %.1f el %.1f' % (math.degrees(az), math.degrees(el)), flush=True)
        torch.cuda.empty_cache()
print('ALL_DONE', flush=True)
