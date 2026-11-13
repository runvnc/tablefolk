#!/usr/bin/env python3
"""Screenshot the app on a machine with no GPU and no display (a cloud VM).

Usage: python3 tools/browser-test/cloud-shot.py URL out.png [wait_seconds]
  e.g. bun server/server.js 8001 &   then
       python3 tools/browser-test/cloud-shot.py "http://localhost:8001/oracle?art=1" oracle.png 60

Writes out.png (the page, whose 3D canvas comes out blank) and out_3d.png
(the 3D frame, read from the GPU by cloud-gpucap.js), and prints the page's
last console lines.

What works (tested 2026-11-12): Playwright's own Chromium with Mesa's
lavapipe as the Vulkan driver (VK_ICD_FILENAMES). Google Chrome without its
SwiftShader Vulkan library, and SwiftShader itself, find an adapter and then
lose the device ("A valid external Instance reference no longer exists").
The compositor never shows a WebGPU canvas there, headless or under Xvfb, so
the frame is copied out of the GPU after the app's own submit instead.
The libraries must be in app/vendor/ (tools/vendor-fetch.sh) when the VM's
network blocks the CDNs. Software rendering: a few frames a second at most.
Paths: PW_CHROMIUM and LVP_ICD override the defaults below.
"""
import base64, glob, os, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PW = os.environ.get("PW_CHROMIUM") or next(iter(sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux64/chrome") + glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome")))), None)
ICD = os.environ.get("LVP_ICD", "/opt/lavapipe/lvp_icd.json")
ARGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan,SkiaGraphite", "--use-vulkan=native",
        "--use-angle=vulkan", "--ignore-gpu-blocklist", "--no-sandbox", "--mute-audio"]

url, out = sys.argv[1], sys.argv[2]
wait = int(sys.argv[3]) if len(sys.argv) > 3 else 60
env = {**os.environ}
if os.path.exists(ICD): env["VK_ICD_FILENAMES"] = ICD
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=PW, headless=True, args=ARGS, env=env)
    page = b.new_page(viewport={"width": 1280, "height": 800})
    logs = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"[:300]))
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"[:300]))
    page.add_init_script(path=os.path.join(HERE, "cloud-gpucap.js"))
    page.goto(url, timeout=60000)
    time.sleep(wait)
    page.screenshot(path=out)
    d = page.evaluate("() => window.__gpuCapture ? Promise.race([window.__gpuCapture(), new Promise(r => setTimeout(() => r(null), 30000))]) : null")
    if d:
        out3d = out[:-4] + "_3d.png" if out.endswith(".png") else out + "_3d.png"
        open(out3d, "wb").write(base64.b64decode(d.split(",")[1]))
        print("3D frame:", out3d)
    else:
        print("no 3D frame (the app drew nothing in 30 s)")
    print("\n".join(l for l in logs if not l.startswith("[verbose]"))[-4000:])
    b.close()
