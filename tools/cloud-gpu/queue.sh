#!/usr/bin/env bash
# queue.sh <cdp port> <log dir> <model> [think]
cd "$(dirname "$0")/../browser-test"
export CDP_PORT=$1 APPROVE_DOWNLOAD=1; L=$2; M=$3; T=${4:+--think}; mkdir -p $L
timeout 2400 node survival-test.mjs evals/survival-one.json --model=$M --rounds=14 --runs=3 > $L/one.log 2>&1
timeout 1500 node survival-test.mjs --model=$M --rounds=18 --runs=3 > $L/two.log 2>&1
timeout 900 node survival-test.mjs evals/hunger.json --model=$M --rounds=16 --runs=2 --hunger=0.85 > $L/hunger.log 2>&1
timeout 1200 node agenttest.mjs evals/know-you.json evals/know-you.txt 1 --base=http://localhost:8000 --model=$M $T > $L/knowyou.log 2>&1
timeout 1200 node agenttest.mjs evals/uses.json evals/uses.txt 1 --base=http://localhost:8000 --model=$M $T > $L/uses.log 2>&1
timeout 1200 node agenttest.mjs evals/shop-role.json evals/shop-role.txt 1 --base=http://localhost:8000 --model=$M $T > $L/shop.log 2>&1
timeout 1200 node agenttest.mjs evals/roles.json evals/roles.txt 1 --base=http://localhost:8000 --model=$M $T > $L/roles.log 2>&1
timeout 600 node mind-check.mjs --model=$M > $L/mindcheck.log 2>&1
echo done > $L/DONE
