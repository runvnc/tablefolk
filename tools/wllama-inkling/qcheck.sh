#!/usr/bin/env bash
# qcheck.sh <bin dir> <model> [extra args...]: correctness + splits + speed on a short prompt
B=$1; M=$2; shift 2
export LD_LIBRARY_PATH=/root/dawn/lib64:/root/dawn/lib
L=/root/qc-$(basename $M .gguf)-$(basename $(dirname $B)).log
timeout 300 $B/llama-completion -m $M -ngl 99 -c 2048 -n 12 --temp 0 -no-cnv -lv 4 "$@" \
  -p "The capital of France is Paris. The capital of Germany is" > $L 2>&1
echo "$(basename $M) [$(basename $(dirname $B))] $*"
grep -o "The capital of Germany is.*" $L | head -1 | cut -c1-90
grep -E "graph: nodes" $L | head -1 | sed 's/.*graph:/  graph:/'
echo "  cpu weight MiB: $(grep 'CPU_Mapped model buffer' $L | awk '{s+=$(NF-1)} END {print s+0}')"
grep -E "eval time" $L | sed 's/.*common_perf_print: */  /' | cut -c1-110
