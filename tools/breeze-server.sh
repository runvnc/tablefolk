#!/usr/bin/env bash
# Start Breeze TTS 2 for Tablefolk's "Breeze" speech engine: breeze-server
# from HoppouAI/Breeze-TTS-2.cpp (Apache-2.0, Vulkan) with the 2.46 GB
# q4_k-dd2 model (Q4_K, Q2_K depth decoder: the smallest; about 3 GB of
# graphics memory), downloaded once into ~/.cache/tablefolk-breeze.
#
#   tools/breeze-server.sh [port] [--download-only]
#
# Files come from Tablefolk's mirror on R2 (geebr-models, breeze-tts-2/: the
# model in 64 MiB parts fetched four at a time from the four hostnames, then
# checked against the SHA-256 in its parts.json), else from Hugging Face
# (HoppouAI/Breeze-TTS-2.cpp) and the GitHub release. The Tablefolk server
# reaches it at BREEZE_URL (default http://127.0.0.1:8137); --cors also lets a
# page talk to it directly.
#
# Breeze TTS 2's weights are for research and non-commercial use only
# (BreezeBlue's licence, LICENSE-model.txt and NOTICE.txt beside the mirror);
# the runtime is Apache-2.0. Linux x64; on Windows unzip the windows build
# from the mirror and run breeze-server.exe with the flags at the end.
set -euo pipefail
PORT=8137; ONLY_DL=0
for a in "$@"; do case "$a" in --download-only) ONLY_DL=1 ;; *[!0-9]*) ;; *) PORT="$a" ;; esac; done
VER=v0.1.3; MODEL_NAME=breeze-tts-2-q4_k-dd2.gguf
R2=(https://geebr-models.mindroot.io https://geebr-models-2.mindroot.io https://geebr-models-3.mindroot.io https://geebr-models-4.mindroot.io)
DIR="$HOME/.cache/tablefolk-breeze"; mkdir -p "$DIR/voices"

BIN="$(find "$DIR" -path "$DIR/mirror" -prune -o -name breeze-server -type f -print 2>/dev/null | head -1)"
if [ -z "$BIN" ]; then
  TGZ="breeze-tts-2-$VER-linux-x64-vulkan.tar.gz"
  echo "downloading breeze-server $VER (linux x64, Vulkan, 72 MB)…"
  curl -fL --progress-bar "${R2[0]}/breeze-tts-2/$TGZ" -o "$DIR/$TGZ" \
    || curl -fL --progress-bar "https://github.com/HoppouAI/Breeze-TTS-2.cpp/releases/download/$VER/$TGZ" -o "$DIR/$TGZ"
  tar -xzf "$DIR/$TGZ" -C "$DIR" && rm "$DIR/$TGZ"
  BIN="$(find "$DIR" -path "$DIR/mirror" -prune -o -name breeze-server -type f -print | head -1)"; chmod +x "$BIN"
fi

MODEL="$DIR/$MODEL_NAME"
fetch_r2() {   # the model's parts from R2, four at a time over the four hostnames
  local man="$DIR/$MODEL_NAME.parts.json" tmp="$DIR/parts"; mkdir -p "$tmp"
  curl -fsL "${R2[0]}/breeze-tts-2/$MODEL_NAME.parts.json" -o "$man" || return 1
  local parts sha; parts=$(python3 -c "import json,sys;print(' '.join(json.load(open(sys.argv[1]))['parts']))" "$man"); sha=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['sha256'])" "$man")
  echo "downloading $MODEL_NAME from the Tablefolk mirror ($(echo $parts | wc -w) parts, 2.46 GB)…"
  local i=0 jobs=()
  for p in $parts; do
    local host=${R2[$((i % 4))]}; i=$((i + 1))
    [ -s "$tmp/$p" ] && continue
    ( curl -fsL --retry 3 "$host/breeze-tts-2/$p" -o "$tmp/$p.part" && mv "$tmp/$p.part" "$tmp/$p" ) &
    jobs+=($!); if [ ${#jobs[@]} -ge 4 ]; then wait "${jobs[0]}" || return 1; jobs=("${jobs[@]:1}"); printf '.'; fi
  done
  for j in "${jobs[@]}"; do wait "$j" || return 1; done; echo
  ( cd "$tmp" && cat $parts ) > "$MODEL.part"
  echo "$sha  $MODEL.part" | sha256sum -c --quiet - || { echo "checksum mismatch"; rm -f "$MODEL.part"; return 1; }
  mv "$MODEL.part" "$MODEL"; rm -rf "$tmp" "$man"
}
if [ ! -f "$MODEL" ]; then
  fetch_r2 || { echo "mirror failed; downloading from Hugging Face…"; curl -fL --progress-bar "https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/$MODEL_NAME" -o "$MODEL.part" && mv "$MODEL.part" "$MODEL"; }
fi
[ "$ONLY_DL" = 1 ] && { echo "ready: $BIN $MODEL"; exit 0; }
cd "$DIR"
exec "$BIN" "$MODEL" --host 127.0.0.1 --port "$PORT" --cors --chunk-max 40 --voices-dir "$DIR/voices"
