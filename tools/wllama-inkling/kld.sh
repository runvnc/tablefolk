#!/usr/bin/env bash
# kld.sh base|TAG [env...]: llama-perplexity over 2 x 512 tokens of a fixed text (llama.cpp's README);
# base = CPU logits saved to $KB, else KLD / same-top-token of WebGPU against them.
# LC = llama.cpp tree (default /root/lc), M = model, KB = base logits file.
export LD_LIBRARY_PATH=/root/dawn/lib64:/root/dawn/lib
T=$1; shift
LC=${LC:-/root/lc}; KB=${KB:-/root/kld-base.bin}; cd $LC
[ -f /root/kld.txt ] || head -c 60000 README.md > /root/kld.txt
if [ "$T" = base ]; then
  timeout 1500 bw/bin/llama-perplexity -m ${M:-/root/m/ink.gguf} -dev none -ngl 0 -t 16 -c 512 --chunks ${CH:-2} -b 512 -f /root/kld.txt --kl-divergence-base $KB > $KB.log 2>&1
  grep -a "Final estimate" $KB.log | tail -1
else
  env "$@" timeout 1500 bw/bin/llama-perplexity -m ${M:-/root/m/ink.gguf} -ngl 99 -c 512 --chunks ${CH:-2} -b ${UB:-512} -ub ${UB:-512} -f /root/kld.txt --kl-divergence-base $KB --kl-divergence > /root/kld-$T.log 2>&1
  echo "== $T $*"; grep -a "Mean    KLD\|Same top p" /root/kld-$T.log | tail -2
fi
