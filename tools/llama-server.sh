#!/usr/bin/env bash
# Start llama.cpp's llama-server with LFM3-1.7B for Tablefolk's endpoint brain
# (Brain options: "OpenAI-compatible endpoint", base URL http://127.0.0.1:8080/v1).
# Downloads once into ~/.cache/tablefolk-llm: ggml-org's official release
# (MIT; Vulkan build on Linux, Metal on Apple Silicon Macs) and Liquid AI's
# LFM3-1.7B Q4_K_M GGUF (1.1 GB; LFM Open License 1.0, free for organisations
# under $10M revenue). About 1.3 GB of graphics memory.
#
#   tools/llama-server.sh [port] [--download-only]
#   LLAMA_MODEL=/path/other.gguf tools/llama-server.sh     another model
# On Windows: tools/llama-server.ps1. On a Mac, double-click
# tools/llama-server.command.
set -euo pipefail
PORT=8080; ONLY_DL=0
for a in "$@"; do case "$a" in --download-only) ONLY_DL=1 ;; *[!0-9]*) ;; *) PORT="$a" ;; esac; done
VER=b12015
DIR="$HOME/.cache/tablefolk-llm"; mkdir -p "$DIR"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)  ASSET="llama-$VER-bin-ubuntu-vulkan-x64.tar.gz" ;;
  Linux-aarch64) ASSET="llama-$VER-bin-ubuntu-vulkan-arm64.tar.gz" ;;
  Darwin-arm64)  ASSET="llama-$VER-bin-macos-arm64.tar.gz" ;;
  Darwin-x86_64) ASSET="llama-$VER-bin-macos-x64.tar.gz" ;;
  *) echo "no llama.cpp build for $(uname -s) $(uname -m)"; exit 1 ;;
esac

BIN="$(find "$DIR/llama-$VER" -name llama-server -type f 2>/dev/null | head -1)"
if [ -z "$BIN" ]; then
  echo "downloading llama.cpp $VER ($ASSET)…"
  curl -fL --progress-bar "https://github.com/ggml-org/llama.cpp/releases/download/$VER/$ASSET" -o "$DIR/$ASSET"
  mkdir -p "$DIR/llama-$VER" && tar -xzf "$DIR/$ASSET" -C "$DIR/llama-$VER" && rm "$DIR/$ASSET"
  BIN="$(find "$DIR/llama-$VER" -name llama-server -type f | head -1)"; chmod +x "$BIN"
  # macOS: a downloaded binary is quarantined until cleared
  [ "$(uname -s)" = Darwin ] && xattr -dr com.apple.quarantine "$DIR/llama-$VER" 2>/dev/null || true
fi

MODEL="${LLAMA_MODEL:-$DIR/LFM3-1.7B-Q4_K_M.gguf}"
if [ ! -f "$MODEL" ]; then
  echo "downloading LFM3-1.7B Q4_K_M (1.1 GB, once)…"
  curl -fL --progress-bar "https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF/resolve/main/LFM3-1.7B-Q4_K_M.gguf" -o "$MODEL.part" && mv "$MODEL.part" "$MODEL"
fi
[ "$ONLY_DL" = 1 ] && { echo "ready: $BIN $MODEL"; exit 0; }
echo "llama-server on http://127.0.0.1:$PORT/v1 (Tablefolk: Brain options, OpenAI-compatible endpoint)"
# -ngl 99: every layer on the GPU; --jinja: the model's own chat template;
# llama-server answers CORS requests, so a page on another origin can call it
exec "$BIN" -m "$MODEL" --alias "$(basename "$MODEL" .gguf | sed "s/-Q[0-9].*//")" -ngl 99 -c 8192 --jinja --host 127.0.0.1 --port "$PORT"
