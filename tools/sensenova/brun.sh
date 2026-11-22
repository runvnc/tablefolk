#!/usr/bin/env bash
# On the rented box: one headless Chrome run of sensenova-test.html (served
# from the wllama checkout with COOP/COEP on :8080, a fresh profile, WebGPU on
# Vulkan); prints the page's "SN {...}" lines and the peak GPU memory.
#   brun.sh "<query string>" [cap seconds] [wllama dir]
Q="$1"; CAP="${2:-600}"; W="${3:-/root/snw/wllama}"
export PATH=$(ls -d /root/snw/emsdk/node/*/bin | head -1):$PATH
[ -f /root/wsrv.pid ] && kill "$(cat /root/wsrv.pid)" 2>/dev/null
[ -f /root/chrome.pid ] && kill "$(cat /root/chrome.pid)" 2>/dev/null; sleep 2; killall -q chrome; sleep 1
PROFILE=/root/sn-chrome-$(date +%s)
(cd "$W" && MULTITHREAD=1 setsid nohup node scripts/http_server.js > /root/wsrv.log 2>&1 < /dev/null & echo $! > /root/wsrv.pid)
sleep 2
setsid nohup google-chrome --headless=new --no-sandbox --user-data-dir=$PROFILE --remote-debugging-port=9224 \
  --no-first-run --no-default-browser-check --mute-audio --window-size=1280,800 --enable-logging=stderr --v=0 \
  --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist \
  --enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist,vulkan_enable_f16_on_nvidia \
  "http://localhost:8080/sensenova-test.html?$Q" > /root/chrome.log 2>&1 < /dev/null &
echo $! > /root/chrome.pid
peak=0; n=$((CAP / 3))
for i in $(seq 1 $n); do
  u=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1); [ "$u" -gt "$peak" ] && peak=$u
  grep -q 'SN {"done\|SN {"error\|[Dd]evice.*lost' /root/chrome.log && break
  sleep 3
done
echo "Q=$Q peakMiB=$peak adapter_fail=$(grep -c 'Failed to get an adapter' /root/chrome.log)"
grep -o 'SN .*' /root/chrome.log | grep -v '"dl"' | sed 's/", source: .*//' | cut -c1-600
grep -o 'graph: nodes = [0-9]*, splits = [0-9]*' /root/chrome.log | sort | uniq -c | head -4
grep -iE 'lost|out of memory' /root/chrome.log | head -3 | cut -c1-200
kill "$(cat /root/chrome.pid)" "$(cat /root/wsrv.pid)" 2>/dev/null; sleep 2; killall -q chrome; rm -rf /root/sn-chrome-*
