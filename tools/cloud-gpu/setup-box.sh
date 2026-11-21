#!/usr/bin/env bash
# setup-box.sh <ssh port> <host> <log>: remote-setup.sh and chrome-up.sh on a fresh vast.ai box,
# each with a time limit (remote-setup's ssh can stay open after its work is done), then
# writes <log>.done. Prints the card, driver, Chrome and the repo's commit into <log>.
P=$1 H=$2 L=$3; cd "$(dirname "$0")"
timeout 360 ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 -p "$P" root@"$H" 'bash -s' < remote-setup.sh > "$L" 2>&1
timeout 300 ssh -o StrictHostKeyChecking=no -p "$P" root@"$H" 'bash -s' < chrome-up.sh >> "$L" 2>&1
ssh -o StrictHostKeyChecking=no -p "$P" root@"$H" 'nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader; google-chrome --version; cd tablefolk && git log --oneline -1; nohup bash -c "while true; do echo \$(date +%T) \$(nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader); sleep 15; done" > /root/gpu.log 2>&1 < /dev/null &' >> "$L" 2>&1
touch "$L.done"
