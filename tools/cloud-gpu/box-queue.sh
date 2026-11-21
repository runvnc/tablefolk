#!/usr/bin/env bash
# box-queue.sh <log dir> [steps...]: autonomy-queue.sh's steps run ON the rented box (no SSH
# tunnel to drop mid-run): Node and playwright-core installed once, a fresh Chrome before each
# step (chrome-restart.sh), results in tools/browser-test/results. Steps as in autonomy-queue.sh;
# TAG adds a card tag to the labels. Writes <log dir>/q.done at the end.
L=$1; shift; mkdir -p "$L"; cd /root/tablefolk/tools/browser-test
command -v node >/dev/null || { apt-get update -qq >/dev/null; apt-get install -y -qq nodejs npm >/dev/null 2>&1; }
[ -d node_modules/playwright-core ] || npm install -q playwright-core >/dev/null 2>&1
export CDP_PORT=9223 APPROVE_DOWNLOAD=1 READY_TIMEOUT=900 PROBE_TIMEOUT=1200
fresh() { bash /root/tablefolk/tools/cloud-gpu/chrome-restart.sh > /dev/null 2>&1; sleep 3; }
run() { echo "== $(date +%T) $*" >> "$L/queue.log"; }
for s in "$@"; do
  case $s in
    probe-*) m=${s#probe-}; fresh; run probe $m; timeout 1500 node probe.mjs --model=$m > "$L/probe-$m.log" 2>&1 ;;
    day-*) lv=${s##*-}; r=${s#*-}; m=${r%-*}; fresh; run day $m $lv; timeout 2400 node live-eval.mjs scenarios/hearthvale.json --day --day-minutes=12 --model=$m $([ "$lv" = auto ] || echo --autonomy=$lv) --label=$m-$lv${TAG:+-$TAG} > "$L/day-$m-$lv.log" 2>&1 ;;
  esac
done
run done; touch "$L/q.done"
