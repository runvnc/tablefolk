cd /root/tablefolk && git pull -q --ff-only && git log --oneline -1
pkill -f "server/server.js 8000"; sleep 1
(BREEZE_AUTOSTART=0 setsid /root/.bun/bin/bun server/server.js 8000 > /root/server.log 2>&1 < /dev/null &)
sleep 3; curl -s localhost:8000/app/llm_js/world-integration.js | grep -c "thinking gave no answer"
