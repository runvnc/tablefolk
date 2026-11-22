#!/usr/bin/env bash
# crun.sh PAGE "<query>" [cap s] [TAG]: one headless Chrome run on the box; prints tagged lines, stats, peak GPU MiB
PAGE=$1; Q="$2"; CAP="${3:-600}"; TAG="${4:-INK}"; W=/root/wl/wllama
export PATH=$(ls -d /root/wl/emsdk/node/*/bin | head -1):$PATH
[ -f /root/wsrv.pid ] && kill "$(cat /root/wsrv.pid)" 2>/dev/null
[ -f /root/chrome.pid ] && kill "$(cat /root/chrome.pid)" 2>/dev/null; sleep 1; killall -q chrome; sleep 1
PROFILE=/root/cr-$(date +%s)
(cd "$W" && MULTITHREAD=1 setsid nohup node scripts/http_server.js > /root/wsrv.log 2>&1 < /dev/null & echo $! > /root/wsrv.pid)
sleep 2
setsid nohup google-chrome --headless=new --no-sandbox --user-data-dir=$PROFILE --remote-debugging-port=9223 \
  --no-first-run --no-default-browser-check --mute-audio --window-size=1280,800 --enable-logging=stderr --v=0 \
  --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist \
  --enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist,vulkan_enable_f16_on_nvidia \
  "http://localhost:8080/$PAGE?$Q" > /root/chrome.log 2>&1 < /dev/null &
echo $! > /root/chrome.pid
peak=0; n=$((CAP / 3))
for i in $(seq 1 $n); do
  u=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1); [ "$u" -gt "$peak" ] && peak=$u
  grep -q "$TAG {\"done\|$TAG {\"error\|[Dd]evice.*lost" /root/chrome.log && break
  sleep 3
done
echo "Q=$Q peakMiB=$peak"
grep -o "$TAG .*" /root/chrome.log | grep -v '"dl"' | sed 's/", source: .*//' | cut -c1-500
grep -o 'graph: nodes = [0-9]*, splits = [0-9]*' /root/chrome.log | sort | uniq -c | head -3
grep -o 'ggml_webgpu stats:.*' /root/chrome.log | sed 's/\\n.*//; s/", source.*//' | tail -${STATS:-4} | cut -c1-420
grep -iE 'lost|out of memory|Uncaught' /root/chrome.log | head -3 | cut -c1-200
kill "$(cat /root/chrome.pid)" "$(cat /root/wsrv.pid)" 2>/dev/null; sleep 1; killall -q chrome; rm -rf /root/cr-*
