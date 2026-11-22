#!/usr/bin/env bash
# The faster Inkling / SenseNova WebGPU build (brains.md, "Inkling 2 Mini", 2026-11-22 speed work), on a rented box:
# wllama 4.0.0 with its llama.cpp replaced by ggml-org/llama.cpp 5bacb7c (5 commits past wllama's pin) plus
#   llama-webgpu.patch                MUL_MAT_ID f32 accumulation + Q2_0 (the earlier fix)
#   webgpu-01-dispatch-cache.patch    per-token counters (GGML_WEBGPU_STATS), cached bind groups, one parameter
#                                     WriteBuffer per submit, no repeated SetPipeline
#   webgpu-02-inkling-fusions.patch   fused Inkling glue kernels (when present)
# Also a native Dawn build (llama-completion, llama-bench, test-backend-ops) for quick checks: nrun.sh.
#   build-fast.sh [native|wasm NAME "CXXFLAGS"]...
#   e.g. build-fast.sh native wasm fast "" wasm stats "-DGGML_WEBGPU_STATS=16"
# Switches (env natively, -D in the browser): GGML_WEBGPU_STATS=N (print every N graphs), GGML_WEBGPU_BIND_GROUP_CACHE=0,
# GGML_WEBGPU_PARAM_BATCH_WRITE=0 (the old per-dispatch path), GGML_WEBGPU_SUBMIT_BATCH, GGML_WEBGPU_FUSE=0.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd /root
[ -d lc ] || { git clone -q --filter=blob:none https://github.com/ggml-org/llama.cpp lc && git -C lc checkout -q "${LLAMA_REF:-5bacb7c}";
  for p in llama-webgpu.patch webgpu-01-dispatch-cache.patch webgpu-02-inkling-fusions.patch; do [ -f "$HERE/$p" ] && git -C lc apply "$HERE/$p"; done; }
[ -d dawn ] || { curl -sL -o dawn.tgz https://github.com/google/dawn/releases/download/v20260908.214631/Dawn-94c3c9cc0d5fb2e85aebb370fa8d37b71aa34655-ubuntu-latest-Release.tar.gz && mkdir -p dawn && tar -xzf dawn.tgz -C dawn --strip-components=1; }
mkdir -p wl
[ -d wl/emsdk ] || (cd wl && git clone -q https://github.com/emscripten-core/emsdk.git && cd emsdk && ./emsdk install 4.0.20 >/dev/null && ./emsdk activate 4.0.20 >/dev/null)
[ -d wl/wllama ] || (cd wl && git clone -q https://github.com/ngxson/wllama.git && git -C wllama checkout -q 4.0.0 && rm -rf wllama/llama.cpp && ln -s /root/lc wllama/llama.cpp)
while [ $# -gt 0 ]; do
  case "$1" in
    native)
      (cd lc && cmake -B bw -DGGML_WEBGPU=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_HTML=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DDawn_DIR=/root/dawn/lib64/cmake/Dawn >/dev/null &&
        cmake --build bw -j"$(nproc)" --target llama-bench llama-completion test-backend-ops >/dev/null)
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
       [ -f esm/index.js ] || { npm ci --silent && npm run build:glue >/dev/null && npm run build:worker >/dev/null && npx tsup src/index.ts --format esm --clean >/dev/null; }
       cp "$HERE/inkling-test.html" "$HERE/../sensenova/sensenova-test.html" .) ;;
    *) echo "unknown step $1"; exit 1 ;;
  esac
done
