#!/usr/bin/env bash
# memrun.sh <ssh port> <cdp port> <gfx> <model> <tag>   (SSH_HOST: the vast.ai ssh host, default ssh1.vast.ai)
Q=${Q:-$(dirname "$0")}
timeout 60 ssh -o ConnectTimeout=15 -p $1 root@${SSH_HOST:-ssh1.vast.ai} 'bash -s' < $Q/chrome-restart.sh >/dev/null 2>&1
timeout 900 ssh -p $1 root@${SSH_HOST:-ssh1.vast.ai} 'rm -f /root/mem.txt; for i in $(seq 1 700); do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> /root/mem.txt; sleep 1; done' >/dev/null 2>&1 &
SP=$!
cd "$(dirname "$0")/../browser-test"
CDP_PORT=$2 timeout 800 node agenttest.mjs evals/roles.json evals/roles.txt 1 --base=http://localhost:8000 --model=$4 --render=$3 --size=1280x720 > $Q/render-$5.log 2>&1
kill $SP 2>/dev/null
peak=$(timeout 30 ssh -p $1 root@${SSH_HOST:-ssh1.vast.ai} 'sort -n /root/mem.txt | tail -1' 2>/dev/null | tail -1)
echo "$5: $(grep -cE '^## .* 1/1' $Q/render-$5.log)/4 won, peak MiB $peak" | tee $Q/mem-$5.result
