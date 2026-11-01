#!/usr/bin/env bash
# Add the KayKit clips (tools/retarget-kaykit.mjs) to every Meshy model in
# assets/models/characters/meshy/, in place, recompressed with meshopt.
#
#   tools/retarget-people.sh <gltf-transform module dir> [model ...]
#
# <module dir> has node_modules/@gltf-transform/{core,extensions}@4.5.1 and
# meshoptimizer (the maintainer's: ~/.cache/tablefolk-gltf). Bump the
# models' v: in app.js FIGURES afterwards.
set -euo pipefail
M="$1"; shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DIR="$ROOT/assets/models/characters/meshy"
cp "$ROOT/tools/retarget-kaykit.mjs" "$M/"
models=("$@"); [ ${#models[@]} -gt 0 ] || models=($(cd "$DIR" && ls *.glb | sed 's/\.glb$//'))
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for m in "${models[@]}"; do
  node "$M/retarget-kaykit.mjs" "$DIR/$m.glb" "$tmp/$m.glb" "$ROOT/assets/models/animations/kaykit" | tail -1
  # resample drops keys a straight line between neighbours already gives;
  # meshopt high adds the quaternion filters (about 600 KB of clips -> 130 KB)
  npx -y @gltf-transform/cli@4.5.1 resample "$tmp/$m.glb" "$tmp/$m.rs.glb" --tolerance 0.0005 > /dev/null
  npx -y @gltf-transform/cli@4.5.1 meshopt "$tmp/$m.rs.glb" "$tmp/$m.min.glb" --level high > /dev/null
  echo "$m: $(stat -c %s "$DIR/$m.glb") -> $(stat -c %s "$tmp/$m.min.glb") bytes"
  cp "$tmp/$m.min.glb" "$DIR/$m.glb"
done
