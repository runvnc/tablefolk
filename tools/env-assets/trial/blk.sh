#!/bin/bash
# tools/env-assets/trial/blk.sh <job> <command...>
# Runs one command under the shared Blender lock (work/.blender-lock with an `owner` file: job and `date +%s`).
# Waits up to 10 min for the lock; a lock older than 15 min is stale and taken over. Hold time is capped
# at 8 min by timeout(1). The lock is always released.
L=/mnt/files/tablefolk/work/.blender-lock; job="$1"; shift
for i in $(seq 1 ${LOCKWAIT:-120}); do
  if mkdir "$L" 2>/dev/null; then echo "$job $(date +%s)" > "$L/owner"; break; fi
  t=$(awk '{print $2}' "$L/owner" 2>/dev/null); now=$(date +%s)
  if [ -n "$t" ] && [ $((now - t)) -gt 900 ]; then echo "stale lock ($(cat $L/owner)), taking it"; rm -rf "$L"; continue; fi
  [ $((i % 6)) -eq 1 ] && echo "waiting for blender lock: $(cat $L/owner 2>/dev/null)"
  sleep 5
done
[ -d "$L" ] && grep -q "^$job " "$L/owner" 2>/dev/null || { echo "no lock"; exit 3; }
trap 'grep -q "^$job " "$L/owner" 2>/dev/null && rm -rf "$L"' EXIT
timeout 470 nice -n 19 "$@"
