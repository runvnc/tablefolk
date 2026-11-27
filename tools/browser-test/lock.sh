#!/usr/bin/env bash
# lock.sh: the one-test-Chrome-at-a-time lock shared by agents on this laptop.
#   tools/browser-test/lock.sh take <job> [wait-seconds]   exit 0 = you hold it; 1 = timed out
#   tools/browser-test/lock.sh drop <job>                  removes it only if <job> holds it
#   tools/browser-test/lock.sh who                         prints the holder
# A lock older than 15 minutes is stale and may be taken. Never connect to a
# Chrome (or close one) unless `take` returned 0 for your job; check `who`
# again before closing if you held it a long time.
L=/mnt/files/tablefolk/work/.chrome-lock
cmd=$1 job=$2 wait=${3:-600}
case "$cmd" in
  take)
    [ -n "$job" ] || { echo "usage: lock.sh take <job>"; exit 2; }
    end=$(( $(date +%s) + wait ))
    while :; do
      if mkdir "$L" 2>/dev/null; then echo "$job $(date +%s)" > "$L/owner"; echo "lock: taken by $job"; exit 0; fi
      read -r who t < "$L/owner" 2>/dev/null
      if [ -n "$t" ] && [ $(( $(date +%s) - t )) -gt 900 ]; then
        echo "lock: removing stale lock of $who"; rm -rf "$L"; continue
      fi
      [ "$who" = "$job" ] && { echo "lock: $job already holds it"; exit 0; }
      [ "$(date +%s)" -ge "$end" ] && { echo "lock: still held by ${who:-?}, gave up"; exit 1; }
      sleep 5
    done ;;
  drop)
    read -r who t < "$L/owner" 2>/dev/null
    if [ "$who" = "$job" ]; then rm -rf "$L"; echo "lock: dropped by $job"; else echo "lock: not yours (held by ${who:-nobody}); left alone"; exit 1; fi ;;
  who) cat "$L/owner" 2>/dev/null || echo nobody ;;
  *) echo "usage: lock.sh take|drop|who <job>"; exit 2 ;;
esac
