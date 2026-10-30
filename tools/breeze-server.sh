#!/usr/bin/env bash
# Start Breeze TTS 2 for Tablefolk's "Breeze" speech engine: breeze-server
# from HoppouAI/Breeze-TTS-2.cpp (Apache-2.0, Vulkan) with a quantised model
# from huggingface.co/HoppouAI/Breeze-TTS-2.cpp, downloaded once into
# ~/.cache/tablefolk-breeze (the binary ~72 MB; the model 2.5 GB).
#
#   tools/breeze-server.sh [q4_k-dd2|q4_k|q6_k|q8_0] [port]
#
# q4_k-dd2 (default, 2.46 GB, the smallest: a Q2_K depth decoder, a little
# duller highs) and q4_k (2.54 GB) take about 3 GB of graphics memory.
# The Tablefolk server reaches it at BREEZE_URL (default
# http://127.0.0.1:8137); --cors also lets a page talk to it directly.
# Breeze TTS 2's weights are for research and non-commercial use only
# (BreezeBlue's licence); the code is Apache-2.0. Linux x64 (on Windows use
# the release's windows zip and run breeze-server.exe with the same flags).
set -euo pipefail
QUANT="${1:-q4_k-dd2}"; PORT="${2:-8137}"; VER=v0.1.3
DIR="$HOME/.cache/tablefolk-breeze"; mkdir -p "$DIR/voices"
BIN="$(find "$DIR" -name breeze-server -type f -perm -u+x 2>/dev/null | head -1)"
if [ -z "$BIN" ]; then
  echo "downloading breeze-server $VER (linux x64, Vulkan)…"
  curl -fL --progress-bar "https://github.com/HoppouAI/Breeze-TTS-2.cpp/releases/download/$VER/breeze-tts-2-$VER-linux-x64-vulkan.tar.gz" -o "$DIR/breeze.tar.gz"
  tar -xzf "$DIR/breeze.tar.gz" -C "$DIR" && rm "$DIR/breeze.tar.gz"
  BIN="$(find "$DIR" -name breeze-server -type f | head -1)"; chmod +x "$BIN"
fi
MODEL="$DIR/breeze-tts-2-$QUANT.gguf"
if [ ! -f "$MODEL" ]; then
  echo "downloading breeze-tts-2-$QUANT.gguf (about 2.5 GB)…"
  curl -fL --progress-bar "https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/breeze-tts-2-$QUANT.gguf" -o "$MODEL.part" && mv "$MODEL.part" "$MODEL"
fi
cd "$DIR"
exec "$BIN" "$MODEL" --host 127.0.0.1 --port "$PORT" --cors --chunk-max 40 --voices-dir "$DIR/voices"
