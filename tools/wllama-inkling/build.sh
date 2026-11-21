#!/usr/bin/env bash
# Trial build (2026-11-21, brains.md "Inkling 2 Mini"): wllama master with its
# llama.cpp submodule moved to ggml-org/llama.cpp master (at or after 690b87d,
# #32704: inkling2_loop), WebGPU + JSPI, wasm32. wllama master streams the
# GPU tensors through small buffers (async file read), so a 9 GB GGUF does not
# have to fit the 4 GB wasm heap when every layer is on the GPU.
#
# Measured: brains.md, "Inkling 2 Mini". Test page: inkling-test.html (copy it
# into the wllama checkout), run-chrome.sh.
#
#   tools/wllama-inkling/build.sh [workdir] [llama.cpp ref]   (built with wllama fa1019a451, llama.cpp afe77e18f)
#   (needs git, cmake, make, python3, node 18+, curl; run on a rented box)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${1:-$HOME/wllama-inkling}"; REF="${2:-master}"; mkdir -p "$W"; cd "$W"
[ -d emsdk ] || git clone -q https://github.com/emscripten-core/emsdk.git
(cd emsdk && ./emsdk install 4.0.20 >/dev/null && ./emsdk activate 4.0.20 >/dev/null)
source emsdk/emsdk_env.sh >/dev/null
if [ ! -d wllama ]; then
  git clone -q https://github.com/ngxson/wllama.git && git -C wllama checkout -q "${WLLAMA_REF:-fa1019a451}"
  rm -rf wllama/llama.cpp && git clone -q https://github.com/ggml-org/llama.cpp wllama/llama.cpp
  git -C wllama/llama.cpp checkout -q "$REF"
  git -C wllama apply "$HERE/wllama-glue.patch"   # parse_questions gained an argument upstream
fi
echo "wllama $(git -C wllama rev-parse --short HEAD), llama.cpp $(git -C wllama/llama.cpp log -1 --format='%h %cs')"
cd wllama && mkdir -p build/emdawn && cd build
TAG=v20260317.182325
[ -d emdawn/emdawnwebgpu_pkg ] || { curl -sL -o emdawn.zip "https://github.com/google/dawn/releases/download/$TAG/emdawnwebgpu_pkg-$TAG.zip"; python3 -c "import zipfile; zipfile.ZipFile('emdawn.zip').extractall('emdawn')"; }
emcmake cmake .. -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm -DLLAMA_WASM_MEM64=OFF -DGGML_RPC=ON -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
  -DEMDAWNWEBGPU_DIR="$PWD/emdawn/emdawnwebgpu_pkg" -DWLLAMA_TEST_BACKEND=OFF >/dev/null
emmake make wllama -j"$(nproc)" 2>&1 | grep -E "error|Error" | head -30 || true
export PATH="$(dirname "$EMSDK_NODE"):$PATH"   # emsdk's node 24 (has npm)
cd .. && mkdir -p src/wasm && node scripts/pack_wasm.js build/wllama.wasm src/wasm/wllama.wasm
npm ci --silent && npm run build:glue >/dev/null && npm run build:worker >/dev/null && npx tsup src/index.ts --format esm --clean >/dev/null
ls -la src/wasm esm
