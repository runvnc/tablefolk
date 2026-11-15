#!/usr/bin/env bash
# voicerun.sh <ssh port> <cdp port> <model> <voice|''> <seconds> <tag>   (SSH_HOST, default ssh1.vast.ai)
# A fresh Chrome, then the market village live for <seconds> with that brain and voice engine,
# sampling the card's memory each second: events, the voice's speed, and the peak.
Q=${Q:-$(dirname "$0")}; H=${SSH_HOST:-ssh1.vast.ai}; OUT=${OUT:-$Q}
timeout 60 ssh -o ConnectTimeout=15 -p $1 root@$H 'bash -s' < $Q/chrome-restart.sh >/dev/null 2>&1
timeout $(( $5 + 600 )) ssh -p $1 root@$H "rm -f /root/mem.txt; for i in \$(seq 1 $(( $5 + 500 ))); do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> /root/mem.txt; sleep 1; done" >/dev/null 2>&1 &
SP=$!
cd "$(dirname "$0")/../browser-test"
CDP_PORT=$2 MODEL=$3 VOICE=$4 timeout $(( $5 + 480 )) node live-watch.mjs ../../scenarios/market-village.json $5 http://localhost:8000 > $OUT/voice-$6.log 2>&1
kill $SP 2>/dev/null
peak=$(timeout 30 ssh -p $1 root@$H 'sort -n /root/mem.txt | tail -1' 2>/dev/null | tail -1)
echo "$6: $(grep -E '^[0-9]+ events' $OUT/voice-$6.log) | $(grep '^VOICE' $OUT/voice-$6.log | cut -c1-300) | peak MiB $peak" | tee $OUT/voice-$6.result
