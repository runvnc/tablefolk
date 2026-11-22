#!/bin/bash
# Step1X-3D (StepFun, Apache-2.0) in its own conda env (python 3.10, torch 2.5.1 cu124, as its README).
# Log: /root/step1x-setup.log
set -x
export TORCH_CUDA_ARCH_LIST=8.9 MAX_JOBS=24 FORCE_CUDA=1
source /opt/conda/etc/profile.d/conda.sh
conda env list | grep -q '^s1x ' || conda create -y -q -n s1x python=3.10 >/dev/null; conda activate s1x
cd /root; for i in 1 2 3 4 5 6 7 8; do [ -d Step1X-3D/.git ] && break; rm -rf Step1X-3D; git clone -q --depth 1 https://github.com/stepfun-ai/Step1X-3D.git && break; sleep 10; done   # GitHub refuses connections now and then from some hosts
cd Step1X-3D
pip install -q torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124
grep -v -E '^git\+|^deepspeed|^sageattention|^wandb|^mosaicml|^prodigyopt|^spaces|^gradio' requirements.txt > /root/s1x-req.txt   # git+ ones need torch at build time; the rest are training-only
pip install -q -r /root/s1x-req.txt || echo REQ_FAILED
pip install -q --no-build-isolation git+https://github.com/NVlabs/nvdiffrast.git || echo NVDR_FAILED
pip install -q torch-cluster -f https://data.pyg.org/whl/torch-2.5.1+cu124.html || echo CLUSTER_FAILED
pip install -q kaolin==0.17.0 -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.5.1_cu124.html || echo KAOLIN_FAILED
(cd step1x3d_texture/custom_rasterizer && python setup.py install >/dev/null) || echo RAST_FAILED
(cd step1x3d_texture/differentiable_renderer && python setup.py install >/dev/null) || echo DIFFR_FAILED
pip install -q --no-build-isolation "git+https://github.com/facebookresearch/pytorch3d.git@stable" || echo P3D_FAILED
python -c "import torch, kaolin, pytorch3d, torch_cluster; print('S1X_IMPORTS_OK', torch.__version__)"
echo S1X_SETUP_DONE
