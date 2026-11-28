#!/usr/bin/env bash
# levers-queue.sh <log dir> <steps...>: run ON the rented box (as gpu-checks.sh): the prompt and concurrency levers
# before and after (2026-11-27, brains.md "Fewer prompt tokens, two calls at once"). A step is kind:model:tag[:query]
#   probe:inkling2-mini-wllama:after                 the capability check
#   evals:bonsai2-27b:before:lean=0&wpin=0&llmpar=1  the 36 evals (run-evals.sh, RUNS=2) with those URL parameters
#   day:inkling2-mini-wllama:after-par1:llmpar=1     a free day on free-two-by-the-hearth (24 minutes)
# Logs, graphics-memory peaks (peaks.txt) and copies of the results in <log dir>; a fresh Chrome before each step.
L=$1; shift; mkdir -p "$L"; cd /root/tablefolk/tools/browser-test
command -v npm >/dev/null || { apt-get update -qq >/dev/null; apt-get install -y -qq nodejs npm >/dev/null 2>&1; }
[ -d node_modules/playwright-core ] || npm install playwright-core >/dev/null 2>&1
export CDP_PORT=9223 APPROVE_DOWNLOAD=1 READY_TIMEOUT=900 PROBE_TIMEOUT=1200
fresh() { bash /root/tablefolk/tools/cloud-gpu/chrome-restart.sh > /dev/null 2>&1; sleep 3; }
step() { # step <name> <timeout> <cmd...>
  local n=$1 to=$2; shift 2; fresh; echo "== $(date +%T) $n" >> "$L/queue.log"
  rm -f /root/mem-$n.txt; ( while true; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> /root/mem-$n.txt; sleep 1; done ) & local sp=$!
  timeout "$to" "$@" > "$L/$n.log" 2>&1; local rc=$?
  kill $sp 2>/dev/null; cp /root/mem-$n.txt "$L/mem-$n.txt"; echo "$n rc=$rc peakMiB=$(sort -n /root/mem-$n.txt | tail -1)" >> "$L/peaks.txt"
}
for s in "$@"; do
  IFS=: read -r k m tag q <<< "$s"
  case $k in
    probe) step probe-$m-$tag 1500 env PAGE_QUERY="$q" node probe.mjs --model=$m ;;
    evals) : > results/run-evals.log; step evals-$m-$tag 4800 env PAGE_QUERY="$q" EVAL_ARGS="--model=$m" RUNS=2 bash run-evals.sh; cp results/run-evals.log "$L/run-evals-$m-$tag.log" ;;
    day) step day-$m-$tag 2400 node live-eval.mjs scenarios/free-two-by-the-hearth.json --day --day-minutes=24 --autonomy=free --model=$m --label=$m-$tag ${q:+--query=$q}
         cp $(ls -t results/live-free-two-by-the-hearth-$m-$tag-*.json 2>/dev/null | head -1) "$L/" 2>/dev/null ;;
  esac
done
echo "== $(date +%T) done" >> "$L/queue.log"; touch "$L/q.done"
