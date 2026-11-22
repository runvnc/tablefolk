#!/usr/bin/env bash
# On the rented box (after run-chrome.sh is in /root): one Chrome run of inkling-test.html.
# brun.sh "<query>" [cap seconds]: one browser run on the box, prints INK lines and peak GPU memory
Q="$1"; CAP="${2:-600}"
bash /root/run-chrome.sh /root/wl/wllama "$Q" >/dev/null
peak=0; n=$((CAP / 3))
for i in $(seq 1 $n); do
  u=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1); [ "$u" -gt "$peak" ] && peak=$u
  grep -q 'INK {"done\|INK {"error\|[Dd]evice.*lost' /root/chrome.log && break
  sleep 3
done
echo "Q=$Q peakMiB=$peak adapter_fail=$(grep -c 'Failed to get an adapter' /root/chrome.log)"
grep -o 'INK .*' /root/chrome.log | grep -v '"dl"' | sed 's/", source: .*//' | cut -c1-600
grep -o 'graph: nodes = [0-9]*, splits = [0-9]*' /root/chrome.log | head -1
grep -iE 'lost|out of memory' /root/chrome.log | head -3 | cut -c1-200
killall -q chrome; sleep 2; rm -rf /root/ink-chrome-*
