#!/usr/bin/env bash
# Compress glTF/GLB models for Tablefolk: AVIF textures (EXT_texture_avif),
# meshopt geometry (EXT_meshopt_compression), textures capped at 1024 px.
# Babylon's loader decodes both. Typical result: 60-90% smaller.
#
#   tools/compress-glb.sh in.glb [out.glb]      (default: overwrite in.glb)
#   tools/compress-glb.sh --max 2048 in.glb out.glb   (another texture cap)
#
# Needs Node (runs @gltf-transform/cli through npx).
set -euo pipefail
max=1024
if [ "${1:-}" = "--max" ]; then max="$2"; shift 2; fi
in="$1"; out="${2:-$1}"
tmp="$(mktemp --suffix=.glb)"; trap 'rm -f "$tmp"' EXIT
gt() { npx -y @gltf-transform/cli@4.5.1 "$@"; }
gt resize "$in" "$tmp" --width "$max" --height "$max"
gt avif "$tmp" "$tmp" --quality 75
gt meshopt "$tmp" "$out" --level medium
ls -l "$in" "$out" | awk '{print $5, $9}'
