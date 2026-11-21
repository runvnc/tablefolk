#!/usr/bin/env bash
# On the rented box: serve the wllama checkout (COOP/COEP) on :8080 and open
# inkling-test.html in a fresh headless Chrome with WebGPU on Vulkan; the
# page's "INK {...}" console lines land in /root/chrome.log.
#   run-chrome.sh [wllama dir] [query string]
W="${1:-/root/wl/wllama}"; Q="${2:-ub=2048&fa=1&ctx=8192&effort=0&n=64}"
export PATH=/root/wl/emsdk/node/24.19.0_64bit/bin:$PATH
[ -f /root/wsrv.pid ] && kill "$(cat /root/wsrv.pid)" 2>/dev/null
[ -f /root/chrome.pid ] && kill "$(cat /root/chrome.pid)" 2>/dev/null; sleep 2; killall -q chrome; sleep 1
PROFILE=/root/ink-chrome-$(date +%s)  # a fresh profile: a killed run can leave WebGPU unavailable in the old one
(cd "$W" && MULTITHREAD=1 setsid nohup node scripts/http_server.js > /root/wsrv.log 2>&1 < /dev/null & echo $! > /root/wsrv.pid)
sleep 2
setsid nohup google-chrome --headless=new --no-sandbox --user-data-dir=$PROFILE --remote-debugging-port=9223 \
  --no-first-run --no-default-browser-check --mute-audio --window-size=1280,800 --enable-logging=stderr --v=0 \
  --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist \
  --enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist,vulkan_enable_f16_on_nvidia \
  "http://localhost:8080/inkling-test.html?$Q" > /root/chrome.log 2>&1 < /dev/null &
echo $! > /root/chrome.pid
echo "chrome $(cat /root/chrome.pid), server $(cat /root/wsrv.pid)"
