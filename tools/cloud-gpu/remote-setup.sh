#!/usr/bin/env bash
# Run on the cloud GPU box: a headless Chrome with WebGPU on the card, and a
# Tablefolk server from the public repo on :8000 (no keys: in-browser models only).
set -u
cd /root
export DEBIAN_FRONTEND=noninteractive
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
if ! command -v google-chrome >/dev/null; then
  wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O chrome.deb
  apt-get update -qq >/dev/null && apt-get install -y -qq ./chrome.deb >/dev/null 2>&1 || apt-get -f install -y -qq >/dev/null 2>&1
fi
google-chrome --version
if ! command -v bun >/dev/null && [ ! -x /root/.bun/bin/bun ]; then
  apt-get install -y -qq unzip git >/dev/null 2>&1
  curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1
fi
export PATH=/root/.bun/bin:$PATH
[ -d tablefolk ] || git clone -q --depth 1 https://github.com/runvnc/tablefolk.git
cd tablefolk && git pull -q --ff-only; cd /root
pkill -f "server/server.js 8000" 2>/dev/null
(cd tablefolk && BREEZE_AUTOSTART=0 setsid nohup bun server/server.js 8000 > /root/server.log 2>&1 < /dev/null &)
pkill -f remote-debugging-port=9223 2>/dev/null; sleep 1
setsid nohup google-chrome --headless=new --no-sandbox --user-data-dir=/root/tf-chrome --remote-debugging-port=9223 \
  --no-first-run --no-default-browser-check --mute-audio --window-size=1280,800 \
  --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist \
  --enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist,vulkan_enable_f16_on_nvidia about:blank > /root/chrome.log 2>&1 < /dev/null &
sleep 4
curl -s localhost:8000/app/ | head -c 80; echo
curl -s localhost:9223/json/version | head -c 200; echo
