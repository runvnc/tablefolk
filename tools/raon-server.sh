#!/usr/bin/env bash
# Raon-1 nano (KRAFTON, Apache-2.0; Korean and English) as Tablefolk's
# endpoint brain on this computer: KRAFTON's llama.cpp fork (upstream
# llama.cpp cannot load the raon1_nano architecture yet: ggml-org/llama.cpp
# PR #32200, open on 2026-11-21) built with Vulkan, and one GGUF from
# KRAFTON/Raon-1-nano-gguf (Q8_0 3.39 GB by default; Q6_K 2.65, Q4_K_M 2.08).
# Everything goes to ~/.cache/tablefolk-llm/raon. Needs git, cmake, a C++
# compiler, the Vulkan headers, glslc and the SPIR-V headers
# (CMAKE_PREFIX_PATH / CXXFLAGS=-I... if they are not installed system-wide).
#
#   tools/raon-server.sh [port] [--download-only] [--think]
#   RAON_QUANT=Q4_K_M  RAON_NGL=99  RAON_CTX=8192  tools/raon-server.sh
#
# Then Brain options > "OpenAI-compatible endpoint": http://127.0.0.1:8092/v1,
# model Raon-1-nano (the game sends the card's sampling, temperature 0.1 and
# presence_penalty 1.5, by that name: libs/brain/sampling.js). Thinking is off
# unless --think (the game turns it on per request where a character thinks).
# RAON_NGL: layers on the graphics card (all by default; 14 fit about 3.5 GB
# of an RTX 2060 beside the game: brains.md, "Raon-1 nano").
set -euo pipefail
PORT=8092; ONLY_DL=0; THINK=false
for a in "$@"; do case "$a" in --download-only) ONLY_DL=1 ;; --think) THINK=true ;; *[!0-9]*) ;; *) PORT="$a" ;; esac; done
QUANT="${RAON_QUANT:-Q8_0}"; NGL="${RAON_NGL:-99}"; CTX="${RAON_CTX:-8192}"
DIR="$HOME/.cache/tablefolk-llm/raon"; mkdir -p "$DIR"
SRC="$DIR/llama.cpp"; BIN="$SRC/build/bin/llama-server"
if [ ! -x "$BIN" ]; then
  [ -d "$SRC" ] || git clone --depth 1 -b raon-1-nano https://github.com/krafton-ai/llama.cpp "$SRC"
  # the branch's web UI asset check fails against the current UI bundle: no UI
  sed -i '/message(FATAL_ERROR/{N;s/message(FATAL_ERROR\(\n *"UI: current asset files\)/message(WARNING\1/}' "$SRC/scripts/ui-assets.cmake"
  cmake -S "$SRC" -B "$SRC/build" -DGGML_VULKAN=ON -DCMAKE_BUILD_TYPE=Release -DLLAMA_CURL=OFF \
    -DLLAMA_BUILD_HTML=OFF -DLLAMA_USE_PREBUILT_UI=OFF ${RAON_CMAKE:-}
  cmake --build "$SRC/build" -j "$(nproc)" --target llama-server
fi
GGUF="$DIR/raon-1-nano-$QUANT.gguf"
if [ ! -s "$GGUF" ]; then
  URL="https://huggingface.co/KRAFTON/Raon-1-nano-gguf/resolve/main/raon-1-nano-$QUANT.gguf"
  # resumes: the download is several GB
  for i in $(seq 1 30); do curl -fL -C - --speed-limit 100000 --speed-time 20 -o "$GGUF.part" "$URL" && break; sleep 3; done
  want=$(curl -fsL https://huggingface.co/KRAFTON/Raon-1-nano-gguf/raw/main/SHA256SUMS | awk -v f="raon-1-nano-$QUANT.gguf" '$2==f {print $1}')
  got=$(sha256sum "$GGUF.part" | cut -d' ' -f1)
  [ -z "$want" ] || [ "$want" = "$got" ] || { echo "checksum mismatch for $GGUF"; exit 1; }
  mv "$GGUF.part" "$GGUF"
fi
[ "$ONLY_DL" = 1 ] && { echo "ready: $BIN $GGUF"; exit 0; }
exec "$BIN" -m "$GGUF" --host 127.0.0.1 --port "$PORT" --alias Raon-1-nano \
  -ngl "$NGL" -c "$CTX" --parallel 1 --temp 0.1 --presence-penalty 1.5 \
  --reasoning "$([ "$THINK" = true ] && echo on || echo off)" \
  --chat-template-kwargs "{\"enable_thinking\": $THINK}"
