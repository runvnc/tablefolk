#!/usr/bin/env bash
# Launch a dedicated test Chrome with remote debugging on port 9223.
# Chrome 136+ refuses remote debugging on the default profile, so this uses
# its own profile (~/.cache/tablefolk-test-chrome). The first run copies the
# chrome://flags (WebGPU/Vulkan) from your normal profile; the model is
# downloaded once into this profile's storage and reused afterwards.
#
# Window size: a tiling window manager ignores --window-size, so under
# Hyprland the window (class "tablefolk-test") is floated and sized with
# hyprctl once it appears. TEST_WIN_W/TEST_WIN_H set the window size (default
# 1280x887, a 1280x800 page), TEST_WIN_X/TEST_WIN_Y its position.
#
# HEADLESS=1: no window at all (Chrome's new headless mode). WebGPU still runs
# on the real GPU with the Vulkan flags below (checked: NVIDIA, not the
# SwiftShader CPU fallback headless gets without them). Same profile, so the
# cached model is reused; it can't run alongside the visible test Chrome.
# Its output goes to ~/.cache/tablefolk-test-chrome.log (TEST_CHROME_LOG), capped at 200 MB.
# Muted (--mute-audio): its sounds otherwise play through your speakers.
# --enable-dawn-features=vulkan_enable_f16_on_nvidia: WebGPU shader-f16 on
# NVIDIA under Linux (Chrome hides it otherwise; Breeze in the browser needs it).
# CHROME_EXTRA: more flags, e.g. a WAV file as the microphone:
#   CHROME_EXTRA="--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=/path/clip.wav"
set -u
PROFILE="$HOME/.cache/tablefolk-test-chrome"
URL="${1:-http://localhost:8000/app/?norender=1}"
W="${TEST_WIN_W:-1280}" H="${TEST_WIN_H:-887}" X="${TEST_WIN_X:-620}" Y="${TEST_WIN_Y:-40}"
CLASS=tablefolk-test
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

place_window() {
  command -v hyprctl >/dev/null || return 0
  for _ in $(seq 1 40); do
    hyprctl clients -j 2>/dev/null | grep -q "\"class\": \"$CLASS\"" && break
    sleep 0.25
  done
  local win="\"class:^($CLASS)\$\""
  # Hyprland 0.56+ (Lua config) takes Lua dispatchers; older ones the classic form.
  if hyprctl dispatch "hl.dsp.window.float({ action = \"on\", window = $win })" 2>/dev/null | grep -q '^ok'; then
    hyprctl dispatch "hl.dsp.window.resize({ x = $W, y = $H, relative = false, window = $win })" >/dev/null
    hyprctl dispatch "hl.dsp.window.move({ x = $X, y = $Y, relative = false, window = $win })" >/dev/null
  else
    local sel="class:^($CLASS)\$"
    hyprctl dispatch setfloating "$sel" >/dev/null
    hyprctl dispatch resizewindowpixel "exact $W $H,$sel" >/dev/null
    hyprctl dispatch movewindowpixel "exact $X $Y,$sel" >/dev/null
  fi
}
if [ "${HEADLESS:-}" = 1 ]; then
  # Chrome's output goes to a log in ~/.cache (never /tmp: a RAM disk here, and
  # a GPU-error flood once filled it with 7 GB), kept under 200 MB: when it
  # grows past that, the commonest lines are noted in tablefolk-chromelog-flood.txt
  # and the log starts again. The guard ends with Chrome (exec keeps this PID).
  LOG="${TEST_CHROME_LOG:-$HOME/.cache/tablefolk-test-chrome.log}"; : > "$LOG"
  ( while kill -0 $$ 2>/dev/null; do
      if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 209715200 ]; then
        { date; head -c 50000000 "$LOG" | cut -c1-140 | sed -E 's/[0-9]+/N/g' | sort | uniq -c | sort -rn | head -8; } >> "$HOME/.cache/tablefolk-chromelog-flood.txt"
        truncate -s 0 "$LOG"
      fi
      sleep 20
    done ) >/dev/null 2>&1 &
  exec >> "$LOG" 2>&1
  exec "$CHROME" --headless=new --user-data-dir="$PROFILE" --remote-debugging-port=9223 \
    --no-first-run --no-default-browser-check --window-size="$W,$((H - 87))" --mute-audio \
    --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan \
    --disable-vulkan-surface --ignore-gpu-blocklist --enable-dawn-features=vulkan_enable_f16_on_nvidia ${CHROME_EXTRA:-} "$URL"
fi
place_window &

exec "$CHROME" --user-data-dir="$PROFILE" --remote-debugging-port=9223 \
  --no-first-run --no-default-browser-check --class="$CLASS" --enable-dawn-features=vulkan_enable_f16_on_nvidia \
  --window-size="$W,$H" ${CHROME_EXTRA:-} --new-window "$URL"
