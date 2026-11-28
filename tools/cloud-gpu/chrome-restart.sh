# SIGTERM, then wait for Chrome to exit (up to 20 s): killed early it loses its localStorage writes
# (Bonsai's "cached" flag: the next page asked to download a model already in the cache)
pkill -f remote-debugging-port=9223; for i in $(seq 1 20); do pgrep -f remote-debugging-port=9223 >/dev/null || break; sleep 1; done; pkill -9 -f remote-debugging-port=9223; sleep 1
setsid nohup google-chrome --headless=new --no-sandbox --user-data-dir=/root/tf-chrome --remote-debugging-port=9223 --no-first-run --no-default-browser-check --mute-audio --window-size=1280,800 --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist --enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist,vulkan_enable_f16_on_nvidia about:blank > /root/chrome.log 2>&1 < /dev/null &
sleep 3; nvidia-smi --query-gpu=memory.used --format=csv,noheader; curl -s localhost:9223/json/version | grep -c Browser
