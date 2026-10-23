#!/usr/bin/env bash
# After tools/fal-monster.py: merge the clips into one GLB, compress it and
# put it in assets/models/characters/meshy/<name>.glb.
#   tools/finish-monster.sh <name> [work/monsters]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; name="$1"; d="${2:-$ROOT/work/monsters}/$name"
GT="$HOME/.cache/tablefolk-gltf"
if [ ! -d "$GT/node_modules/@gltf-transform/functions" ]; then
  mkdir -p "$GT" && (cd "$GT" && npm i -s @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 >/dev/null)
fi
cp "$ROOT/tools/merge-clips.mjs" "$GT/"
args=(); for c in Idle Walk Attack HitReact Death; do [ -f "$d/clip_$c.glb" ] && args+=("$c=$d/clip_$c.glb"); done
node "$GT/merge-clips.mjs" "$d/rigged.glb" "$d/${name}_raw.glb" "${args[@]}"
bash "$ROOT/tools/compress-glb.sh" "$d/${name}_raw.glb" "$ROOT/assets/models/characters/meshy/$name.glb"
