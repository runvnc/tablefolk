#!/usr/bin/env bash
# SenseNova-Loop-9B trial (brains.md, "SenseNova-Loop-9B"), on a rented box:
# SenseNova's llama.cpp fork (OpenSenseNova/llama.cpp 24ea7bb, the commit its
# GGUF card names; upstream PR ggml-org/llama.cpp#32588 is still open) built
# twice: CUDA (the reference, llama-server for the capability check) and
# native WebGPU on Dawn (the browser's backend without the browser).
#   build-native.sh [workdir]     (needs git, cmake, a CUDA toolkit, curl)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v nvcc >/dev/null || export PATH=/usr/local/cuda/bin:$PATH
ls /usr/local/cuda/lib64/libcublas.so >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libcublas-dev-12-9 >/dev/null  # the linux-desktop image has nvcc but no cuBLAS
W="${1:-/root/sn}"; REF="${REF:-24ea7bb78410e0f0f7bbb362e37c60cd9ecfc761}"; mkdir -p "$W"; cd "$W"
[ -d llama.cpp ] || { git clone -q https://github.com/OpenSenseNova/llama.cpp && git -C llama.cpp fetch -q origin "$REF" && git -C llama.cpp checkout -q FETCH_HEAD && git -C llama.cpp apply "$HERE/llama-webgpu.patch" "$HERE/sinkhorn-trial.patch"; }  # trial forms: SN_SINKHORN_POW=1 / SN_SINKHORN_CLOSED=1 at run time
if [ ! -d dawn ]; then  # the prebuilt Dawn llama.cpp's WebGPU CI uses
  curl -sL -o dawn.tgz https://github.com/google/dawn/releases/download/v20260908.214631/Dawn-94c3c9cc0d5fb2e85aebb370fa8d37b71aa34655-ubuntu-latest-Release.tar.gz
  mkdir dawn && tar -xzf dawn.tgz -C dawn --strip-components=1
fi
cd llama.cpp
T="llama-server llama-cli llama-completion llama-bench llama-eval-callback"
[ -x build-cuda/bin/llama-server ] || { cmake -B build-cuda -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=89 -DLLAMA_CURL=OFF -DLLAMA_BUILD_HTML=OFF -DLLAMA_USE_PREBUILT_UI=OFF >/dev/null && cmake --build build-cuda -j"$(nproc)" --target $T >/dev/null; }
[ -x build-webgpu/bin/llama-server ] || { cmake -B build-webgpu -DGGML_WEBGPU=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_HTML=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DDawn_DIR="$W/dawn/lib64/cmake/Dawn" >/dev/null && cmake --build build-webgpu -j"$(nproc)" --target $T >/dev/null; }
ls -la build-cuda/bin/llama-server build-webgpu/bin/llama-server
