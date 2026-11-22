#!/usr/bin/env bash
# SenseNova-Loop-9B in Chrome (brains.md, "SenseNova-Loop-9B"): wllama fa1019a
# (as tools/wllama-inkling/build.sh) with its llama.cpp replaced by SenseNova's
# fork (OpenSenseNova/llama.cpp 24ea7bb), WebGPU + JSPI, wasm32. The glue patch
# from the Inkling build is applied only when the fork already has the newer
# parse_questions signature. SINKHORN=POW|CLOSED bakes in a trial Sinkhorn form
# (sinkhorn-trial.patch; WASM has no environment variables).
#   build-wllama.sh [workdir]   (needs git, cmake, make, python3, curl; run on a rented box)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${1:-/root/snw}"; REF="${REF:-24ea7bb78410e0f0f7bbb362e37c60cd9ecfc761}"; mkdir -p "$W"; cd "$W"
[ -d emsdk ] || git clone -q https://github.com/emscripten-core/emsdk.git
(cd emsdk && ./emsdk install 4.0.20 >/dev/null && ./emsdk activate 4.0.20 >/dev/null)
source emsdk/emsdk_env.sh >/dev/null
if [ ! -d wllama ]; then
  git clone -q https://github.com/ngxson/wllama.git && git -C wllama checkout -q "${WLLAMA_REF:-fa1019a451}"
  rm -rf wllama/llama.cpp && git clone -q https://github.com/OpenSenseNova/llama.cpp wllama/llama.cpp
  git -C wllama/llama.cpp fetch -q origin "$REF" && git -C wllama/llama.cpp checkout -q FETCH_HEAD   # the commit is on no branch
  git -C wllama/llama.cpp apply "$HERE/llama-webgpu.patch"   # F32 router matmuls on the GPU (brains.md)
  if [ -n "$SINKHORN" ]; then git -C wllama/llama.cpp apply "$HERE/sinkhorn-trial.patch" && sed -i "s|getenv(\"SN_SINKHORN_$SINKHORN\") != nullptr;|true;|" wllama/llama.cpp/src/models/sensenova-loop.cpp; fi   # SINKHORN=POW or CLOSED: trial builds
  git -C wllama apply --check "$HERE/../wllama-inkling/wllama-glue.patch" 2>/dev/null && \
    grep -q "parse_questions(const json & body, bool" wllama/llama.cpp/tools/server/*.h wllama/llama.cpp/common/*.h 2>/dev/null && \
    git -C wllama apply "$HERE/../wllama-inkling/wllama-glue.patch" || true
fi
echo "wllama $(git -C wllama rev-parse --short HEAD), llama.cpp $(git -C wllama/llama.cpp log -1 --format='%h %cs')"
cd wllama && mkdir -p build/emdawn && cd build
TAG=v20260317.182325
[ -d emdawn/emdawnwebgpu_pkg ] || { curl -sL -o emdawn.zip "https://github.com/google/dawn/releases/download/$TAG/emdawnwebgpu_pkg-$TAG.zip"; python3 -c "import zipfile; zipfile.ZipFile('emdawn.zip').extractall('emdawn')"; }
emcmake cmake .. -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm -DLLAMA_WASM_MEM64=OFF -DGGML_RPC=ON -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
  -DEMDAWNWEBGPU_DIR="$PWD/emdawn/emdawnwebgpu_pkg" -DWLLAMA_TEST_BACKEND=OFF >/dev/null
emmake make wllama -j"${JOBS:-$(nproc)}" 2>&1 | grep -E "error|Error" | head -30 || true
export PATH="$(dirname "$EMSDK_NODE"):$PATH"
cd .. && mkdir -p src/wasm && node scripts/pack_wasm.js build/wllama.wasm src/wasm/wllama.wasm
npm ci --silent && npm run build:glue >/dev/null && npm run build:worker >/dev/null && npx tsup src/index.ts --format esm --clean >/dev/null
cp "$HERE/sensenova-test.html" .
ls -la src/wasm esm
