#!/usr/bin/env bash
# The fast WebGPU build for Inkling 2 Mini and SenseNova-Loop-9B (brains.md, "Faster in Chrome", 2026-11-22), on a
# rented box. One llama.cpp tree runs both models:
#   ggml-org/llama.cpp 5bacb7c (master 2026-11-22, 5 commits past wllama 4.0.0's pin)
#   + PR #32588 merged (blueswhen sensenova-loop, head 0ba8e4a: SenseNova Loop, the exact powered Sinkhorn)
#   + llama-webgpu.patch                  MUL_MAT_ID f32 accumulation + Q2_0 (the earlier Inkling fix)
#   + webgpu-01-dispatch-cache.patch      per-token counters (GGML_WEBGPU_STATS), cached bind groups, one parameter
#                                         WriteBuffer per submit, no repeated SetPipeline
#   + webgpu-02-inkling-fusions.patch     fused kernels (ggml-webgpu-fuse.hpp: Inkling's glue chains + a generic
#                                         element-wise run fusion), IQ2_XXS tables in workgroup memory, MUL_MAT_ID
#                                         mat-vec path for batches up to 64 tokens, GGML_WEBGPU_MMVQ switch
#   + ../sensenova/llama-webgpu.patch     F32 x F32 router matmuls on the GPU
#   + webgpu-03-replay.patch              record and replay: a decode graph seen twice in a row is recorded (pipelines,
#                                         bind groups, workgroups; parameters in the recording's own buffer) and replayed
#                                         without re-encoding (GGML_WEBGPU_REPLAY=0 off, GGML_WEBGPU_REPLAY_BATCH)
#   + server-checkpoints.patch            a request field "checkpoints" (false: the request makes no context checkpoints),
#                                         for the runner's prefix checkpoints (wllama-runner.js)
# and wllama 4.0.0 with its llama.cpp replaced by that tree, + wllama-hidden.patch (the "hidden" action: hidden states at
# chosen positions of one prompt in one pass, for the Strands Decider, libs/decider). Also a native Dawn build for quick checks
# (nrun.sh, mrun.sh, kld.sh, prof.sh with a -DGGML_WEBGPU_GPU_PROFILE build).
#   build-fast.sh [native] [wasm NAME "CXXFLAGS"]...
#   e.g. build-fast.sh native wasm fast "-DGGML_WEBGPU_MMVQ=0" wasm stats "-DGGML_WEBGPU_STATS=16 -DGGML_WEBGPU_MMVQ=0"
# Switches (env natively, -D in the browser): GGML_WEBGPU_STATS=N (print every N graphs), GGML_WEBGPU_BIND_GROUP_CACHE=0,
# GGML_WEBGPU_PARAM_BATCH_WRITE=0 (the old per-dispatch path), GGML_WEBGPU_SUBMIT_BATCH, GGML_WEBGPU_FUSE=0,
# GGML_WEBGPU_FUSE_MASK=bits (wf_type), GGML_WEBGPU_MMVQ=0 (no q8 activation pre-pass: fewer dispatches),
# GGML_WEBGPU_MMID_VEC_MAX_TOKENS (64), GGML_WEBGPU_IQ2XXS_ROWS (8); GGML_WEBGPU_DUMP=file writes a big graph's nodes.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd /root
if [ ! -d lc ]; then
  git clone -q --filter=blob:none https://github.com/ggml-org/llama.cpp lc
  git -C lc checkout -q "${LLAMA_REF:-5bacb7c}"
  git -C lc fetch -q origin pull/32588/head:pr32588
  git -C lc -c user.name=x -c user.email=x@x merge -q --no-edit pr32588
  for p in "$HERE/llama-webgpu.patch" "$HERE/webgpu-01-dispatch-cache.patch" "$HERE/webgpu-02-inkling-fusions.patch" \
           "$HERE/../sensenova/llama-webgpu.patch" "$HERE/webgpu-03-replay.patch" "$HERE/server-checkpoints.patch"; do
    git -C lc apply "$p"; done
fi
[ -d dawn ] || { curl -sL -o dawn.tgz https://github.com/google/dawn/releases/download/v20260908.214631/Dawn-94c3c9cc0d5fb2e85aebb370fa8d37b71aa34655-ubuntu-latest-Release.tar.gz && mkdir -p dawn && tar -xzf dawn.tgz -C dawn --strip-components=1; }
mkdir -p wl
[ -d wl/emsdk ] || (cd wl && git clone -q https://github.com/emscripten-core/emsdk.git && cd emsdk && ./emsdk install 4.0.20 >/dev/null && ./emsdk activate 4.0.20 >/dev/null)
[ -d wl/wllama ] || (cd wl && git clone -q https://github.com/ngxson/wllama.git && git -C wllama checkout -q 4.0.0 && git -C wllama apply "$HERE/wllama-hidden.patch" && rm -rf wllama/llama.cpp && ln -s /root/lc wllama/llama.cpp)
while [ $# -gt 0 ]; do
  case "$1" in
    native)
      (cd lc && cmake -B bw -DGGML_WEBGPU=ON -DLLAMA_CURL=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DDawn_DIR=/root/dawn/lib64/cmake/Dawn >/dev/null &&
        cmake --build bw -j"$(nproc)" --target llama-completion llama-perplexity llama-bench >/dev/null)
      shift ;;
    wasm)
      N=$2; F=$3; shift 3
      (source wl/emsdk/emsdk_env.sh >/dev/null 2>&1; cd wl/wllama && mkdir -p build-$N/emdawn && cd build-$N
       TAG=v20260317.182325
       [ -d emdawn/emdawnwebgpu_pkg ] || { curl -sL -o emdawn.zip "https://github.com/google/dawn/releases/download/$TAG/emdawnwebgpu_pkg-$TAG.zip"; python3 -c "import zipfile; zipfile.ZipFile('emdawn.zip').extractall('emdawn')"; }
       emcmake cmake .. -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm -DLLAMA_WASM_MEM64=OFF -DGGML_RPC=ON -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
         -DEMDAWNWEBGPU_DIR="$PWD/emdawn/emdawnwebgpu_pkg" -DWLLAMA_TEST_BACKEND=OFF -DCMAKE_CXX_FLAGS="$F" >/dev/null
       emmake make wllama -j"$(nproc)" 2>&1 | grep -E " error" | head -20 || true
       export PATH="$(dirname "$EMSDK_NODE"):$PATH"
       cd .. && mkdir -p src/wasm && node scripts/pack_wasm.js build-$N/wllama.wasm src/wasm/$N.wasm
       # the JS checks the wasm's llama.cpp version: rebuild it against this tree
       [ -f esm/index.js ] || npm ci --silent
       npm run build:glue >/dev/null && npm run build:worker >/dev/null && npx tsup src/index.ts --format esm --clean >/dev/null
       cp "$HERE/inkling-test.html" "$HERE/replay-test.html" "$HERE/../sensenova/sensenova-test.html" .) ;;
    *) echo "unknown step $1"; exit 1 ;;
  esac
done
