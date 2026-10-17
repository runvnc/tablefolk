#!/usr/bin/env bash
# Launch a dedicated test Chrome with remote debugging on port 9223.
# Chrome 136+ refuses remote debugging on the default profile, so this uses
# its own profile (~/.cache/tablefolk-test-chrome). The first run copies the
# chrome://flags (WebGPU/Vulkan) from your normal profile; the model is
# downloaded once into this profile's storage and reused afterwards.
set -u
PROFILE="$HOME/.cache/tablefolk-test-chrome"
URL="${1:-http://localhost:8000/app/?norender=1}"
mkdir -p "$PROFILE"
python3 - "$PROFILE" <<'PY'
import json, os, sys
src = os.path.expanduser('~/.config/google-chrome/Local State')
dst = os.path.join(sys.argv[1], 'Local State')
flags = json.load(open(src)).get('browser', {}).get('enabled_labs_experiments', []) if os.path.exists(src) else []
d = json.load(open(dst)) if os.path.exists(dst) else {}
d.setdefault('browser', {})['enabled_labs_experiments'] = flags
json.dump(d, open(dst, 'w'))
PY
CHROME=$(command -v google-chrome || command -v google-chrome-stable)
exec "$CHROME" --user-data-dir="$PROFILE" --remote-debugging-port=9223 \
  --no-first-run --no-default-browser-check --new-window "$URL"
