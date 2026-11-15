export DEBIAN_FRONTEND=noninteractive
cd /root && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O chrome.deb && (apt-get install -y -qq ./chrome.deb >/dev/null 2>&1 || (apt-get update -qq >/dev/null; apt-get install -y -qq ./chrome.deb >/dev/null 2>&1))
google-chrome --version
pkill -f remote-debugging-port=9223; sleep 2
setsid nohup google-chrome --headless=new --no-sandbox --user-data-dir=/root/tf-chrome --remote-debugging-port=9223 --no-first-run --no-default-browser-check --mute-audio --window-size=1280,800 --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist --enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist,vulkan_enable_f16_on_nvidia about:blank > /root/chrome.log 2>&1 < /dev/null &
sleep 3; curl -s localhost:9223/json/version | grep Browser
