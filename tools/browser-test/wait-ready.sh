#!/usr/bin/env bash
# Wait until the page's brain status says the Gemma model is ready, clicking
# "Download & run" if the consent prompt is showing. Prints READY or TIMEOUT.
cd "$(dirname "$0")"
for i in $(seq 1 80); do
  out=$(node eval.mjs 2>/dev/null)
  echo "$out" | grep -q '"brain": "Gemma 4 E[24]B (LiteRT-LM[^"]*) ready' && { echo READY; exit 0; }
  # Only approve a model download when asked to (APPROVE_DOWNLOAD=1): it may
  # be a multi-GB download over a metered connection.
  if echo "$out" | grep -q '"consent": true'; then
    if [ "${APPROVE_DOWNLOAD:-0}" = "1" ]; then node eval.mjs "(document.getElementById('approveModelDownload')?.click(),1)" >/dev/null
    else echo "CONSENT PROMPT SHOWING (model not cached); not approving. Re-run with APPROVE_DOWNLOAD=1 to download."; exit 2; fi
  fi
  sleep 3
done
echo TIMEOUT; node eval.mjs
