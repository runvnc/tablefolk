# Testing on a rented GPU (vast.ai)

How the 12 GB tests of 2026-11-15 were run (maintainer skill, brains.md,
"Bonsai 2 on 12 GB cards"). Needs the `vastai` CLI (`uvx vastai`, key in
`.env` as `VASTAI_API_KEY` or `~/.vast_api_key`) and your SSH key on the
vast.ai account.

1. Rent: `uvx vastai search offers 'gpu_name=RTX_4070 num_gpus=1 reliability>0.98 rentable=true' -o dph+`,
   then `uvx vastai create instance <id> --image vastai/linux-desktop:cuda-12.9-ubuntu24.04-2026-02-05 --env '-e NVIDIA_DRIVER_CAPABILITIES=all' --disk 40 --ssh --direct`.
   Some hosts take 20+ minutes to pull the image; take another.
2. `ssh -p <port> root@<host> 'bash -s' < remote-setup.sh`: the public repo
   served on the box's :8000 (no voices), a headless Chrome with WebGPU on
   :9223. Then `bash -s < chrome-up.sh` once: the image's Chrome 144 cannot
   compile Bonsai 2's kernels; the current one can.
3. Tunnel the debugging port: `ssh -N -L 9231:localhost:9223 -p <port> root@<host>`.
   The test scripts take `CDP_PORT=9231`; `--base=http://localhost:8000`
   means the box's own server.
4. `queue.sh 9231 <log dir> bonsai2-27b`: survival (one wolf, two
   skeletons), hunger, knowing the player, using things, shop, roles,
   mind-check. `memrun.sh <ssh port> 9231 high bonsai2-27b <tag>`: peak
   graphics memory with the game drawing. `remote-update.sh` pulls the
   repo there and restarts its server; `chrome-restart.sh` gives a fresh
   Chrome (do it between models: the GPU is not freed by navigating).
5. `echo y | uvx vastai destroy instance <id>` when done.
