#!/usr/bin/env bash
# Run every eval in evals/ (scenario + tactics pairs) and print the score
# lines. RUNS=2 by default; BASE=http://localhost:8000 (the model is cached
# per origin). Full transcripts: results/agent-*.json and the log.
#   ./run-evals.sh [name ...]      e.g. ./run-evals.sh roles smithy
cd "$(dirname "$0")"
RUNS="${RUNS:-2}" BASE="${BASE:-http://localhost:8000}"
names=("$@"); [ ${#names[@]} -eq 0 ] && names=(shop-role-chaos shop-chaos feelings-chaos smithy roles companion)
for n in "${names[@]}"; do
  t="evals/${n%-chaos}.txt"
  echo "=== $n"
  timeout 1200 node agenttest.mjs "evals/$n.json" "$t" "$RUNS" --base="$BASE" | tee -a results/run-evals.log | grep -E "won$|ERROR|timed out|not cached"
done
