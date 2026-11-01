#!/usr/bin/env bash
# Micro-eval: five tactics from the full set, two easy and three hard, for a
# quick look at a brain change (about 2-4 minutes a run).
#   easy: villager small talk (roles), buy a horseshoe (smithy)
#   hard: haggle to 45, lowball must not sell (shop at chaos 50),
#         remembering being hit through small talk (feelings at chaos 50)
#
#   ./micro-eval.sh [agenttest flags]       RUNS=2 by default
#   ./micro-eval.sh --think --llm=http://127.0.0.1:8080/v1 --llm-model=LFM3-1.7B
# --think makes every character reason before acting; with an endpoint brain
# it also prints tokens and seconds per turn (to size the thinking budget).
cd "$(dirname "$0")"
RUNS="${RUNS:-2}" BASE="${BASE:-http://localhost:8000}"
run() {   # eval file, tactics file, name pattern
  echo "=== $1: $3"
  timeout 1500 node agenttest.mjs "evals/$1.json" "evals/$2.txt" "$RUNS" --base="$BASE" --only="$3" "${@:4}" \
    | tee -a results/micro-eval.log | grep -E "won$|ERROR|timed out|not cached|endpoint turns|min/median"
}
run roles roles '^villager' "$@"
run smithy smithy 'horseshoe' "$@"
run shop-chaos shop '^(haggle to 45|lowball must not sell)$' "$@"
run feelings-chaos feelings '^hit, then' "$@"
