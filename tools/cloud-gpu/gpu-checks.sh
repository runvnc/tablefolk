#!/usr/bin/env bash
# gpu-checks.sh <log dir> <steps...>: run ON the rented box (no tunnel to drop). Steps are kind:model (probe, living, adventure, turnsg, turnsf, when, live12, godoff, godon, godauto, sweephigh, roleshigh, wg, god: god-village at guided for 10 game hours with god-player.mjs beside live-eval). Results in tools/browser-test/results; logs and peaks.txt in <log dir>. A fresh Chrome before each step, graphics memory sampled each second (peak per step).
L=$1; shift; mkdir -p "$L"; cd /root/tablefolk/tools/browser-test
command -v npm >/dev/null || { apt-get update -qq >/dev/null; apt-get install -y -qq nodejs npm >/dev/null 2>&1; }
[ -d node_modules/playwright-core ] || npm install playwright-core >/dev/null 2>&1
cp /root/tablefolk/tools/cloud-gpu/wg-run.mjs _wg-run.mjs   # it needs playwright-core from here
export CDP_PORT=9223 APPROVE_DOWNLOAD=1 READY_TIMEOUT=900 PROBE_TIMEOUT=1200
fresh() { bash /root/tablefolk/tools/cloud-gpu/chrome-restart.sh > /dev/null 2>&1; sleep 3; }
step() { # step <name> <timeout> <cmd...>
  local n=$1 to=$2; shift 2; fresh; echo "== $(date +%T) $n" >> "$L/queue.log"
  rm -f /root/mem-$n.txt; ( while true; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> /root/mem-$n.txt; sleep 1; done ) & local sp=$!
  timeout "$to" "$@" > "$L/$n.log" 2>&1; local rc=$?
  kill $sp 2>/dev/null; echo "$n rc=$rc peakMiB=$(sort -n /root/mem-$n.txt | tail -1) baseMiB=$(head -1 /root/mem-$n.txt)" >> "$L/peaks.txt"
}
for s in "$@"; do
  m=${s#*:}; k=${s%%:*}
  case $k in
    probe) step probe-$m 1500 node probe.mjs --model=$m ;;
    living) step living-$m 1200 node modes-eval.mjs --mode=living --autonomy=guided --model=$m --lines=4 --label=$m-guided ;;
    adventure) step adventure-$m 1200 node modes-eval.mjs --mode=adventure --model=$m --lines=4 --label=$m ;;
    turnsg) step turnsg-$m 1800 node modes-eval.mjs --mode=turns --autonomy=guided --model=$m --rounds=4 --label=$m-guided ;;
    turnsf) step turnsf-$m 1800 node modes-eval.mjs --mode=turns --autonomy=free --model=$m --rounds=3 --label=$m-free ;;
    when) step when-$m 900 node modes-eval.mjs --mode=when --autonomy=guided --model=$m --label=$m ;;
    live12) step live12-$m 1200 node live-eval.mjs scenarios/hearthvale.json --minutes=6 --autonomy=guided --model=$m --mode-radius=12 --label=$m-living12 ;;
    godoff) step godoff-$m 1500 node god-words-eval.mjs --model=$m --wait=900 --councils=2 --decider=off ;;
    godon) step godon-$m 1800 node god-words-eval.mjs --model=$m --wait=900 --councils=2 --decider=on --local=0 ;;
    godauto) step godauto-$m 1500 node god-words-eval.mjs --model=$m --wait=900 --councils=2 --decider=auto --local=0 ;;
    deciderrun) step deciderrun 600 node decider-run.mjs "engine=embeddings" --timeout=500 ;;
    sweephigh) step sweephigh-$m 1500 node llm-sweep.mjs --model=$m --gfx=high --scenario=scenarios/hearthvale.json --sizes=2000,8000,${SWEEPMAX:-15000} --limit=300 ;;
    roleshigh) step roleshigh-$m 900 node agenttest.mjs evals/roles.json evals/roles.txt 1 --base=http://localhost:8000 --model=$m --render=high --size=1280x720 ;;
    god) step god-$m 2700 bash -c "node live-eval.mjs scenarios/god-village.json --minutes=13 --autonomy=guided --model=$m --query=dayMinutes=24 --label=$m-god > $L/god-live-$m.log 2>&1 & node god-player.mjs --hours=10 --label=$m; wait" ;;
    wg) step wg-$m 1900 node _wg-run.mjs $m oneanswer ;;
  esac
done
echo "== $(date +%T) done" >> "$L/queue.log"; touch "$L/q.done"
