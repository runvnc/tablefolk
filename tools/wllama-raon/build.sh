#!/usr/bin/env bash
# The wllama WASM + JS in libs/brain/engines/wllama-raon/: llama.cpp in the
# browser that can load Raon-1 nano GGUFs (KRAFTON/Raon-1-nano-gguf), since
# upstream llama.cpp cannot load the raon1_nano architecture yet
# (ggml-org/llama.cpp PR #32200, open on 2026-11-21). Built 2026-11-21 on a
# rented Linux box (brains.md, "Raon-1 nano").
#
#   wllama  ngxson/wllama a24b3564dd (2026-11-06, package 3.12.0: the last glue
#           before realtime audio, which the fork lacks) + wllama-glue.patch
#   llama.cpp krafton-ai/llama.cpp branch raon-1-nano at b662635 + llama-fork.patch:
#           ggml-webgpu's gated delta net bound overlapping views of one tensor
#           (q, k, v...) as writable storage, which WebGPU refuses ("Writable
#           storage buffer binding aliasing"): the inputs are copied first, and
#           the fused cache write is off.
#   emsdk 4.0.20, emdawnwebgpu v20260317.182325, WebGPU + JSPI, wasm32
#   (the flags of wllama's own docker build).
#
#   tools/wllama-raon/build.sh [workdir]     (needs git, cmake, make, python3, node 18+, curl, xz)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="$HERE/../../libs/brain/engines/wllama-raon"
W="${1:-$HOME/.cache/tablefolk-build/wllama-raon}"; mkdir -p "$W"; cd "$W"
[ -d emsdk ] || git clone -q https://github.com/emscripten-core/emsdk.git
(cd emsdk && ./emsdk install 4.0.20 >/dev/null && ./emsdk activate 4.0.20 >/dev/null)
source emsdk/emsdk_env.sh >/dev/null
if [ ! -d wllama ]; then
  git init -q wllama && git -C wllama fetch -q --depth 1 https://github.com/ngxson/wllama.git a24b3564dd3c108af85a79a2c3b08a88bd2e7370
  git -C wllama checkout -q FETCH_HEAD && git -C wllama apply "$HERE/wllama-glue.patch"
  rm -rf wllama/llama.cpp && git clone -q --depth 1 -b raon-1-nano https://github.com/krafton-ai/llama.cpp wllama/llama.cpp
  git -C wllama/llama.cpp apply "$HERE/llama-fork.patch"
fi
cd wllama && mkdir -p build/emdawn && cd build
TAG=v20260317.182325
[ -d emdawn/emdawnwebgpu_pkg ] || { curl -sL -o emdawn.zip "https://github.com/google/dawn/releases/download/$TAG/emdawnwebgpu_pkg-$TAG.zip"; python3 -c "import zipfile; zipfile.ZipFile('emdawn.zip').extractall('emdawn')"; }
emcmake cmake .. -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm -DLLAMA_WASM_MEM64=OFF -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
  -DEMDAWNWEBGPU_DIR="$PWD/emdawn/emdawnwebgpu_pkg" -DWLLAMA_TEST_BACKEND=OFF >/dev/null
emmake make wllama -j"$(nproc)" >/dev/null
cd .. && mkdir -p src/wasm && cp build/wllama.js build/wllama.wasm src/wasm/
npm ci --silent && npm run build:glue >/dev/null && npm run build:worker >/dev/null && npx tsup src/index.ts --format esm --clean >/dev/null
mkdir -p "$OUT" && cp build/wllama.wasm "$OUT/wllama.wasm" && { echo '// vendored: wllama a24b356 (MIT) built against krafton-ai/llama.cpp raon-1-nano (MIT) by tools/wllama-raon/build.sh'; cat esm/index.js; } > "$OUT/index.js"
ls -la "$OUT"
