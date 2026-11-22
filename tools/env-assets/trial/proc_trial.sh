#!/bin/bash
# tools/env-assets/trial/proc_trial.sh <label> <inn|bs> [extra proc.py json, merged over options.json's] [out label]
# A trial model through the shipping pipeline, without touching shipped files:
# work/img3d-trial/raw/<label>.glb -> matfix.py -> proc.py (the building's options.json opts + extras: weld,
# clean, scale, decimate, bake...) -> proc/<out>.glb -> compress-glb.sh --max 2048 -> final/<out>.glb
# -> decomp.mjs -> proc/<out>.check.glb -> render_trial.py -> renders/<out>_0_{far,back,door,close}.png
# PIPE=<dir> takes proc.py, delight.py and options.json from a frozen copy (the shared ones were being changed
# during the trial; work/img3d-trial/pipe/ holds the 2026-11-22 afternoon version: 40k, normal bake, de-light).
# Blender runs under the shared lock (blk.sh). Prints STATS and the final size.
set -e
T="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$T/../../.." && pwd)"; W="$R/work/img3d-trial"
G="${GLTF_DIR:-$HOME/.cache/tablefolk-gltf}"; PIPE="${PIPE:-$T/..}"
l="$1"; b="$2"; extra="${3:-{\}}"; o="${4:-$1}"
case $b in inn) name=inn; box="6.67 8 6.43";; bs) name=blacksmith; box="6.94 6 6.95";; esac
opts=$(python3 -c "import json,sys;o=json.load(open('$PIPE/options.json'))['models']['$name']['opts'];o.update(json.loads(sys.argv[1]));o['name']='$name';print(json.dumps(o))" "$extra")
mkdir -p "$W/proc" "$W/final" "$W/renders"
python3 "$T/matfix.py" "$W/raw/$l.glb" "$W/proc/$o.in.glb"   # metallic 0 where the file leaves glTF's default of 1
t0=$(date +%s)
"$T/blk.sh" "img3d-trial-$o" blender -b --factory-startup -P "$PIPE/proc.py" -- "$W/proc/$o.in.glb" "$W/proc/$o.glb" "$opts" 2>&1 | grep -E "^STATS|^BAKE|^DELIGHT|Error|no lock" | cut -c1-400
echo "PROC $o $(( $(date +%s) - t0 )) s (with lock wait)"
nice -n 19 "$R/tools/compress-glb.sh" --max 2048 "$W/proc/$o.glb" "$W/final/$o.glb" >/dev/null 2>&1
echo "FINAL $o $(stat -c %s "$W/final/$o.glb") bytes"; rm -f "$W/proc/$o.in.glb"
(cd "$G" && node env-decomp.mjs "$W/final/$o.glb" "$W/proc/$o.check.glb" >/dev/null)
[ -n "$NORENDER" ] || "$T/blk.sh" "img3d-trial-$o-r" blender -b --factory-startup -P "$T/render_trial.py" -- "$W/renders/$o" $box "$W/proc/$o.check.glb" >/dev/null 2>&1
