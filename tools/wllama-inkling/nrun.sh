#!/usr/bin/env bash
# nrun.sh TAG [env...]: native WebGPU (Dawn) greedy completion, 48 tokens, stats every 16 graphs
T=$1; shift
export LD_LIBRARY_PATH=/root/dawn/lib64:/root/dawn/lib
B=${B:-/root/lc/bw/bin}; M=${M:-/root/m/ink.gguf}
env GGML_WEBGPU_STATS=16 "$@" timeout 300 $B/llama-completion -m $M -ngl 99 -c 2048 -n 48 --temp 0 -no-cnv -fa on -lv 4 \
  -p "${P:-The capital of France is Paris. The capital of Germany is}" > /root/n-$T.log 2>&1
echo "== $T $*"
grep -o "The capital of Germany is.*" /root/n-$T.log | head -1 | cut -c1-200
grep -E "graph: nodes" /root/n-$T.log | head -1 | sed 's/.*graph:/  graph:/'
grep "ggml_webgpu stats" /root/n-$T.log | sed -n '2p;3p' | cut -c1-400
grep -E "eval time" /root/n-$T.log | sed 's/.*common_perf_print: */  /' | cut -c1-110
