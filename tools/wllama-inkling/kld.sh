#!/usr/bin/env bash
# kld.sh base|TAG [env...]: llama-perplexity over 2 x 512 tokens of a fixed text; base = CPU logits, else KLD of WebGPU vs CPU
export LD_LIBRARY_PATH=/root/dawn/lib64:/root/dawn/lib
T=$1; shift
cd /root/lc
[ -f /root/kld.txt ] || { cat README.md docs/build.md 2>/dev/null | head -c 60000 > /root/kld.txt; }
if [ "$T" = base ]; then
  timeout 1200 bw/bin/llama-perplexity -m ${M:-/root/m/ink.gguf} -dev none -ngl 0 -t 16 -c 512 --chunks ${CH:-2} -b 512 -f /root/kld.txt --kl-divergence-base /root/kld-base.bin > /root/kld-base.log 2>&1
  grep -a "Final estimate\|PPL" /root/kld-base.log | tail -2
else
  env "$@" timeout 1200 bw/bin/llama-perplexity -m ${M:-/root/m/ink.gguf} -ngl 99 -c 512 --chunks ${CH:-2} -b ${UB:-512} -ub ${UB:-512} -f /root/kld.txt --kl-divergence-base /root/kld-base.bin --kl-divergence > /root/kld-$T.log 2>&1
  echo "== $T $*"; grep -a -A3 "Mean    KLD\|Mean PPL(Q)\|Same top p" /root/kld-$T.log | grep -a "Mean\|Same top" | head -4
fi
