#!/bin/bash
# tools/env-assets/finish.sh <name> [<name> ...]
#  Rebuilds assets/models/props/env/<name>.glb (2048 px) and <name>.1k.glb (1024 px) from the raw Meshy GLB,
#  with the options in options.json:
#  $ENV_WORK/raw/<name>.glb -> proc.py (weld, clean, scale, decimate) -> $ENV_WORK/proc/<name>.glb
#  -> tools/compress-glb.sh -> the two assets -> $ENV_WORK/proc/<name>.check.glb (decompressed final)
#  -> $ENV_WORK/renders/<name>_v0/_v90/_v180/_v270/_close.png and <name>_sheet.jpg.
#  Then run check.py <name> (the torn-mesh gate) before committing.
# ENV_WORK defaults to work/env (git-ignored: the raw files are large). SAMPLES (render) defaults to 12.
# Needs blender on PATH, and ~/.cache/tablefolk-gltf with @gltf-transform/core, extensions, functions,
# meshoptimizer and sharp installed (npm i there); decomp.mjs is copied there. A model with "presimplify" also needs
# ~/.cache/tablefolk-meshopt with meshoptimizer 1.x and @gltf-transform/core + extensions (simplify.mjs is copied there).
set -e
T="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$T/../.." && pwd)"
W="${ENV_WORK:-$R/work/env}"; A="$R/assets/models/props/env"
G="${GLTF_DIR:-$HOME/.cache/tablefolk-gltf}"; MO="${MESHOPT_DIR:-$HOME/.cache/tablefolk-meshopt}"
[ -f "$MO/simplify.mjs" ] && cmp -s "$T/simplify.mjs" "$MO/simplify.mjs" || { mkdir -p "$MO"; cp "$T/simplify.mjs" "$MO/"; }
mkdir -p "$W/proc" "$W/renders" "$A"; cmp -s "$T/decomp.mjs" "$G/env-decomp.mjs" || cp "$T/decomp.mjs" "$G/env-decomp.mjs"
for n in "$@"; do
  read -r raw opts dx < <(python3 - "$T/options.json" "$n" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))['models'][sys.argv[2]]
o = dict(m['opts']); o.setdefault('name', sys.argv[2])
print(m.get('raw', 'raw/%s.glb' % sys.argv[2]), json.dumps(o, separators=(',', ':')), m.get('door_x', 0))
PY
)
  echo "== $n $opts"
  src="$W/$raw"
  # presimplify (tris): meshoptimizer 1.x, permissive, before Blender (the bed: Blender's collapse stops at its
  # 3-face cloth edges); proc.py then rebakes from the raw (hp_src)
  pre=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('presimplify', ''))" "$opts")
  if [ -n "$pre" ]; then
    (cd "$MO" && node simplify.mjs "$src" "$W/proc/$n.pre.glb" "$pre" 0.05 0) | tail -1
    opts=$(python3 -c "import json,sys; o=json.loads(sys.argv[1]); o['hp_src']=sys.argv[2]; print(json.dumps(o,separators=(',',':')))" "$opts" "$src")
    src="$W/proc/$n.pre.glb"
  fi
  nice blender -b --factory-startup -P "$T/proc.py" -- "$src" "$W/proc/$n.glb" "$opts" 2>&1 | grep -E "STATS|CREAM|BAKE|DELIGHT" > "$W/proc/$n.stats"
  cut -c1-300 "$W/proc/$n.stats"
  nice "$R/tools/compress-glb.sh" --max 2048 "$W/proc/$n.glb" "$A/$n.glb" >/dev/null 2>&1
  nice "$R/tools/compress-glb.sh" "$W/proc/$n.glb" "$A/$n.1k.glb" >/dev/null 2>&1
  ls -l "$A/$n.glb" "$A/$n.1k.glb" | awk '{print $5, $9}'
  (cd "$G" && node env-decomp.mjs "$A/$n.glb" "$W/proc/$n.check.glb" >/dev/null)
  [ -n "$NORENDER" ] && continue
  SAMPLES=${SAMPLES:-12} nice blender -b --factory-startup -P "$T/render2.py" -- "$W/proc/$n.check.glb" "$W/renders/$n" "$dx" 2>&1 | grep -E "^SIZE|Error" | head -3
  python3 - "$W/renders/$n" "$n" <<'PY'
import sys
from PIL import Image, ImageDraw
p, n = sys.argv[1], sys.argv[2]
m = Image.new('RGB', (2000, 800), 'white'); d = ImageDraw.Draw(m)
for i, y in enumerate((0, 90, 180, 270)):
    im = Image.open(f'{p}_v{y}.png').convert('RGB').resize((400, 400)); m.paste(im, ((i % 2) * 400, (i // 2) * 400)); d.text(((i % 2) * 400 + 6, (i // 2) * 400 + 6), f'{n} view {y}', fill='black')
cl = Image.open(f'{p}_close.png').convert('RGB').resize((1200, 800)); m.paste(cl, (800, 0))
m.save(p + '_sheet.jpg', quality=86)
PY
done
