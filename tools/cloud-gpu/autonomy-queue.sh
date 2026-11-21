#!/usr/bin/env bash
# autonomy-queue.sh <ssh port> <ssh host> <cdp port> <log dir> [steps...]
# The autonomy comparison on a rented card (2026-11-21): capability checks,
# hearthvale's day and the goblin bakery at rails / guided / free on Bonsai 2
# 27B, E4B guided, E2B's regression evals. Needs the tunnel
# (ssh -N -L <cdp port>:localhost:9223 ...) and remote-setup.sh + chrome-up.sh done.
# A fresh Chrome before each run (chrome-restart.sh): the GPU is not freed by navigating.
P=$1 H=$2 C=$3 L=$4; shift 4
cd "$(dirname "$0")/../browser-test"; mkdir -p "$L"
export CDP_PORT=$C APPROVE_DOWNLOAD=1 READY_TIMEOUT=900 PROBE_TIMEOUT=1200
fresh() { ssh -o StrictHostKeyChecking=no -p "$P" root@"$H" 'bash -s' < ../cloud-gpu/chrome-restart.sh > /dev/null 2>&1; sleep 3; }
run() { echo "== $(date +%T) $*" >> "$L/queue.log"; }
for s in "$@"; do
  case $s in
    probe-*) m=${s#probe-}; fresh; run probe $m; timeout 1500 node probe.mjs --model=$m > "$L/probe-$m.log" 2>&1 ;;
    day-*) lv=${s##*-}; r=${s#*-}; m=${r%-*}; fresh; run day $m $lv; timeout 2400 node live-eval.mjs scenarios/hearthvale.json --day --day-minutes=12 --model=$m --autonomy=$lv --label=$m-$lv > "$L/day-$m-$lv.log" 2>&1 ;;
    bakery-*) lv=${s##*-}; r=${s#*-}; m=${r%-*}; fresh; run bakery $m $lv; timeout 1500 node live-eval.mjs scenarios/goblin-bakery.json --minutes=6 --model=$m --autonomy=$lv --label=$m-$lv > "$L/bakery-$m-$lv.log" 2>&1 ;;
    evals-*) m=${s#evals-}; fresh; run evals $m; EVAL_ARGS="--model=$m" RUNS=2 timeout 2400 bash run-evals.sh > "$L/evals-$m.log" 2>&1 ;;
  esac
done
run done
