#!/usr/bin/env bash
# Download the third-party libraries the app otherwise loads from CDNs into
# app/vendor/, and write app/vendor/manifest.json, which maps each CDN URL to
# its local copy. app/preflight.js reads the manifest and loads the local
# copies first (the CDN stays the fallback), so the app runs with no outside
# network: cloud test machines whose network allows only git, and the public
# site, which no longer depends on Babylon's CDN (Babylon asks that its CDN
# not be used in production).
#
# Usage: tools/vendor-fetch.sh            (then commit app/vendor/)
# Run it again to update Babylon: its CDN serves the newest release at these
# URLs; the version fetched is written to the manifest.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=app/vendor
mkdir -p "$OUT"

# CDN URL  ->  file name under app/vendor/
FILES=(
  "https://cdn.babylonjs.com/babylon.js babylon.js"
  "https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js babylonjs.loaders.min.js"
  "https://cdn.babylonjs.com/havok/HavokPhysics_umd.js HavokPhysics_umd.js"
  "https://cdn.babylonjs.com/havok/HavokPhysics.wasm HavokPhysics.wasm"
  "https://assets.babylonjs.com/environments/studio.env studio.env"
  "https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako_deflate.min.js pako_deflate.min.js"
  "https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js UPNG.js"
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js html2canvas.min.js"
)

entries=()
for pair in "${FILES[@]}"; do
  url=${pair% *}; name=${pair##* }
  printf '%-70s ' "$url"
  if curl -fsSL --retry 3 -o "$OUT/$name.tmp" "$url"; then
    mv "$OUT/$name.tmp" "$OUT/$name"
    echo "ok ($(du -h "$OUT/$name" | cut -f1))"
  else
    rm -f "$OUT/$name.tmp"; echo "FAILED"
  fi
  [ -f "$OUT/$name" ] && entries+=("    \"$url\": \"$name\"")
done

# Babylon's version, read from the downloaded build
ver=$(grep -oE 'get Version\(\)\{return"[0-9][^"]*"' "$OUT/babylon.js" 2>/dev/null | grep -oE '[0-9][^"]*' | head -1 || true)
[ -z "$ver" ] && ver=$(grep -oE '"[0-9]+\.[0-9]+\.[0-9]+(-[a-z.0-9]+)?"' "$OUT/babylon.js" 2>/dev/null | head -1 | tr -d '"' || true)

{
  echo '{'
  echo "  \"fetched\": \"$(date -u +%Y-%m-%d)\","
  echo "  \"babylon\": \"${ver:-unknown}\","
  echo '  "files": {'
  ( IFS=$'\n'; echo "${entries[*]}" | sed '$!s/$/,/' )
  echo '  }'
  echo '}'
} > "$OUT/manifest.json"
echo "wrote $OUT/manifest.json (Babylon ${ver:-unknown}). Commit app/vendor/ to use it."
