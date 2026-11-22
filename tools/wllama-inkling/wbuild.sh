#!/usr/bin/env bash
# wbuild.sh NAME "-DFOO=1 ...": wllama (WebGPU+JSPI, wasm32) against /root/lc into src/wasm/NAME.wasm
set -e
N=$1; F="$2"
cd /root/wl && source emsdk/emsdk_env.sh >/dev/null 2>&1
cd ${WLDIR:-wllama}
[ -e llama.cpp/CMakeLists.txt ] || { rm -rf llama.cpp; ln -s /root/lc llama.cpp; git apply /root/wllama-glue.patch || true; }
mkdir -p build-$N/emdawn && cd build-$N
TAG=v20260317.182325
[ -d emdawn/emdawnwebgpu_pkg ] || { curl -sL -o emdawn.zip "https://github.com/google/dawn/releases/download/$TAG/emdawnwebgpu_pkg-$TAG.zip"; python3 -c "import zipfile; zipfile.ZipFile('emdawn.zip').extractall('emdawn')"; }
emcmake cmake .. -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm -DLLAMA_WASM_MEM64=OFF -DGGML_RPC=ON -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
  -DEMDAWNWEBGPU_DIR="$PWD/emdawn/emdawnwebgpu_pkg" -DWLLAMA_TEST_BACKEND=OFF -DCMAKE_CXX_FLAGS="$F" >/dev/null
emmake make wllama -j32 2>&1 | grep -E "error|Error" | head -30 || true
export PATH="$(dirname "$EMSDK_NODE"):$PATH"
cd .. && mkdir -p src/wasm && node scripts/pack_wasm.js build-$N/wllama.wasm src/wasm/$N.wasm
ls -la src/wasm/$N.wasm
[ -f esm/index.js ] || { npm ci --silent && npm run build:glue >/dev/null && npm run build:worker >/dev/null && npx tsup src/index.ts --format esm --clean >/dev/null; }
cp /root/inkling-test.html /root/sensenova-test.html .
