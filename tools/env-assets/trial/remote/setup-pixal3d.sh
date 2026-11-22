#!/bin/bash
# Pixal3D (TencentARC, MIT) on a vast.ai box with pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel (base env: torch 2.6 cu124).
# Base environment per TRELLIS.2's setup.sh (without flash-attn: ATTN_BACKEND=sdpa), then Pixal3D's requirements,
# NATTEN 0.21.0 built for sm_89 and its utils3d wheel. Log: /root/pixal-setup.log
set -x
export TORCH_CUDA_ARCH_LIST=8.9 MAX_JOBS=24 DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq libjpeg-dev libgl1 libglib2.0-0 git-lfs >/dev/null
cd /root && git clone -q --recursive https://github.com/microsoft/TRELLIS.2.git && git clone -q https://github.com/TencentARC/Pixal3D.git
cd /root/TRELLIS.2
pip install -q imageio imageio-ffmpeg tqdm easydict opencv-python-headless ninja trimesh transformers gradio==6.0.1 tensorboard pandas lpips zstandard kornia timm
pip install -q git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8
mkdir -p /tmp/extensions
git clone -q -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git /tmp/extensions/nvdiffrast && pip install -q /tmp/extensions/nvdiffrast --no-build-isolation
git clone -q -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git /tmp/extensions/nvdiffrec && pip install -q /tmp/extensions/nvdiffrec --no-build-isolation
git clone -q --recursive https://github.com/JeffreyXiang/CuMesh.git /tmp/extensions/CuMesh && pip install -q /tmp/extensions/CuMesh --no-build-isolation
git clone -q --recursive https://github.com/JeffreyXiang/FlexGEMM.git /tmp/extensions/FlexGEMM && pip install -q /tmp/extensions/FlexGEMM --no-build-isolation
cp -r o-voxel /tmp/extensions/o-voxel && pip install -q /tmp/extensions/o-voxel --no-build-isolation
cd /root/Pixal3D && pip install -q -r requirements.txt || echo REQ_FAILED
NATTEN_CUDA_ARCH="8.9" NATTEN_N_WORKERS=24 pip install -q natten==0.21.0 --no-build-isolation || echo NATTEN_FAILED
pip install -q https://github.com/LDYang694/Storages/releases/download/20260430/utils3d-0.0.2-py3-none-any.whl || echo UTILS3D_FAILED
python -c "import torch, natten, cumesh, flex_gemm, o_voxel, nvdiffrast; print('PIXAL_IMPORTS_OK', torch.__version__)"
echo PIXAL_SETUP_DONE
