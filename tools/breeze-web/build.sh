#!/usr/bin/env bash
# Build Breeze TTS 2 for the browser (WebAssembly + ggml's WebGPU backend)
# into libs/voice/breeze-web/ (breeze.mjs, breeze.wasm). See README.md here.
#
#   tools/breeze-web/build.sh            (needs emsdk: ~/.cache/tablefolk-build/emsdk)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${BREEZE_WORK:-$HOME/.cache/tablefolk-build}"; REV=87b4366
source "$WORK/emsdk/emsdk_env.sh" >/dev/null 2>&1
SRC="$WORK/breeze"
if [ ! -d "$SRC" ]; then git clone -q --recurse-submodules https://github.com/HoppouAI/Breeze-TTS-2.cpp "$SRC"; fi
cd "$SRC"
# a rerun: drop the patch applied last time
[ -d third_party/ggml/.git ] || [ -f third_party/ggml/.git ] && git -C third_party/ggml checkout -q -- . 
if ! git diff --quiet; then git checkout -- .; fi
git fetch -q origin
git checkout -q "$REV"
git submodule update -q --init --recursive
# current ggml (v0.28.0) instead of the one Breeze bundles (2026-08-25): it has
# the WebGPU fixes the browser needs (llama.cpp #28382: block-quantized views at
# the browser's 256-byte binding alignment) and faster kernels
GGML_REV=facdc44a67da17df4433adcc468b424f48e9ded2
git -C third_party/ggml checkout -q -- .
git -C third_party/ggml cat-file -e "$GGML_REV^{commit}" 2>/dev/null || git -C third_party/ggml fetch -q https://github.com/ggml-org/ggml "$GGML_REV"
git -C third_party/ggml checkout -q "$GGML_REV"
# ggml-webgpu-fast.patch: sum_rows writes every row past 65,535 workgroups (cloned voices were garbage without it),
# bind groups kept, one parameter write a batch, mat-vec workgroups of 64 (README.md)
git -C third_party/ggml apply "$HERE/ggml-webgpu-fast.patch"
# breeze-trace.patch: the hook trace-clone.hpp uses to see every operation
git apply "$HERE/breeze-trace.patch"
# te-cpu.patch (from the native build): the 0.9 GB text encoder on the CPU backend
# when tf_set_te_cpu(1) is called before tf_init: ~1 GB less graphics memory
git apply "$ROOT/tools/breeze-server/te-cpu.patch" || git apply --3way "$ROOT/tools/breeze-server/te-cpu.patch"
grep -q convtr1d_stream src/codec_decoder.cpp || { echo "expected Breeze with the matmul vocoder (v0.1.6 work, 87b4366 or later)"; exit 1; }
emcmake cmake -S . -B build-web -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DBREEZE_VULKAN=OFF -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF \
  -DBREEZE_BUILD_CLI=OFF -DBREEZE_BUILD_SERVER=OFF -DBREEZE_BUILD_SHARED=OFF -DBREEZE_MP3=OFF \
  -DCMAKE_C_FLAGS="-fwasm-exceptions -msimd128" -DCMAKE_CXX_FLAGS="-fwasm-exceptions -msimd128" > build-web.cmake.log
cmake --build build-web --target breeze_core -j "$(nproc)"
LIBS=$(find build-web -name '*.a' | sort)
OUT="$ROOT/libs/voice/breeze-web"; mkdir -p "$OUT"
em++ -O3 -fwasm-exceptions -msimd128 -std=c++17 -I "$HERE" -I include -I third_party/ggml/include "$HERE/tf_breeze.cpp" \
  -Wl,--start-group $LIBS -Wl,--end-group \
  --use-port=emdawnwebgpu -sJSPI -sJSPI_EXPORTS="['tf_init','tf_encode','tf_generate','tf_hash_tensors','tf_stages','tf_matvec_check','tf_trace']" \
  -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=8MB \
  -sFORCE_FILESYSTEM -lworkerfs.js \
  -sEXPORTED_FUNCTIONS="['_malloc','_free','_tf_init','_tf_error','_tf_stop_flag','_tf_sample_rate','_tf_backend','_tf_devices','_tf_encode','_tf_codes','_tf_codes_len','_tf_generate','_tf_hash_tensors','_tf_stages','_tf_matvec_check','_tf_trace','_tf_set_te_cpu']" \
  -sEXPORTED_RUNTIME_METHODS="['ccall','FS','WORKERFS','wasmMemory','HEAPF32','HEAP32','UTF8ToString','stringToNewUTF8']" \
  -o "$OUT/breeze.mjs"
ls -la "$OUT"
