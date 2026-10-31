#!/usr/bin/env bash
# Build breeze-server (HoppouAI/Breeze-TTS-2.cpp v0.1.5, Vulkan) with
# te-cpu.patch: BREEZE_TE_CPU=1 keeps the 0.9 GB text encoder in system
# memory and runs it on the CPU (once per line, about 0.5 s on 6 threads),
# so Breeze needs about 2.1 GB of graphics memory instead of 3.0 (measured
# on an RTX 2060, 2026-10-31; same voice, clean speech). tools/breeze-server.sh
# uses this build when it exists.
#
#   tools/breeze-server/build.sh
# Needs cmake, ninja, a C++ compiler, the Vulkan headers and glslc; the
# SPIR-V headers are fetched into the work folder if the system has none.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${BREEZE_WORK:-$HOME/.cache/tablefolk-build}"; REV=v0.1.5
OUT="$HOME/.cache/tablefolk-breeze/build"; mkdir -p "$WORK" "$OUT"
SRC="$WORK/breeze-server-src"
if [ ! -d "$SRC" ]; then git clone -q --recurse-submodules https://github.com/HoppouAI/Breeze-TTS-2.cpp "$SRC"; fi
cd "$SRC" && git checkout -q -- . && git fetch -q --tags && git checkout -q "$REV" && git submodule update -q --init --recursive
git apply "$HERE/te-cpu.patch"
SPV="$WORK/spirv"
if [ ! -f /usr/include/spirv/unified1/spirv.hpp ] && [ ! -f "$SPV/include/spirv/unified1/spirv.hpp" ]; then
  git clone -q --depth 1 https://github.com/KhronosGroup/SPIRV-Headers.git "$WORK/SPIRV-Headers"
  cmake -S "$WORK/SPIRV-Headers" -B "$WORK/SPIRV-Headers/build" -DCMAKE_INSTALL_PREFIX="$SPV" >/dev/null && cmake --install "$WORK/SPIRV-Headers/build" >/dev/null
fi
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBREEZE_VULKAN=ON -DBREEZE_BUILD_SHARED=OFF -DBREEZE_MP3=ON \
  -DCMAKE_PREFIX_PATH="$SPV" -DCMAKE_CXX_FLAGS="-I$SPV/include" -DCMAKE_C_FLAGS="-I$SPV/include" >/dev/null
cmake --build build --target breeze-server breeze-cli -j "$(nproc)"
cp build/breeze-server build/breeze-cli "$OUT/"
echo "built $OUT/breeze-server ($REV + te-cpu.patch)"
