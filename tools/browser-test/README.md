# Browser tests (real Chrome + WebGPU)

These scripts drive a real Google Chrome window over the DevTools protocol
(Playwright `connectOverCDP`), so tests run with the actual in-browser model
(Gemma 4 E2B on LiteRT-LM, WebGPU), not a mock.

## One-time setup

```bash
cd tools/browser-test && npm install        # playwright-core only, no browser download
```

## Run

1. Start the dev server (if it isn't running): `bun server/server.js 8000` in the repo root.
2. Launch the test Chrome (keep it running; it's a normal window on the desktop):
   `./launch-chrome.sh` (opens `http://localhost:8000/app/?norender=1`).
   Under Hyprland the window (class `tablefolk-test`) is floated and sized
   with `hyprctl`, since tiling ignores `--window-size`: 1280x887 at
   (620, 40) by default, a 1280x800 page (`TEST_WIN_W`, `TEST_WIN_H`,
   `TEST_WIN_X`, `TEST_WIN_Y` change it). `?art=1` also skips the scenario
   intro card, so it doesn't cover screenshots.
   - It uses its own profile at `~/.cache/tablefolk-test-chrome`, because Chrome 136+
     refuses remote debugging on the default profile. Your `chrome://flags`
     (WebGPU/Vulkan) are copied from your normal profile.
   - The first time, the 2 GB model downloads once into that profile; later
     runs reuse it. A fresh profile defaults to whatever the app's default model
     is; set it with `node eval.mjs "localStorage.setItem('tablefolk_model','gemma4-e2b-litert')"`
     and reload if needed.
3. `./wait-ready.sh` waits for the model to be ready. It does **not** approve a
   download: if the "Download & run" prompt shows, it stops. Run
   `APPROVE_DOWNLOAD=1 ./wait-ready.sh` to allow it (multi-GB, possibly metered).
4. `node runtests.mjs 3 shop` runs the Scenario pane's **Test tactics** box 3
   times per tactic against the built-in `shop` example (`guard`, `lure` also
   exist), printing progress and saving `results/results-<timestamp>.json`
   (wins, turns, transcripts with what was said and the commands issued).

## Headless (nothing on screen)

`HEADLESS=1 ./launch-chrome.sh "http://localhost:8000/app/?norender=1"` runs
the same test Chrome with no window, still on the real GPU (Vulkan flags;
without them headless falls back to the SwiftShader CPU renderer). It shares
the profile, so it can't run alongside the visible one. The model is cached
per origin: use the port it was downloaded on (8000).

## Agent evals (`agenttest.mjs`)

```bash
node agenttest.mjs evals/shop-role.json evals/shop-role.txt 3 --base=http://localhost:8000 [--prompts]
```

Loads `<base>/app/?norender=1` fresh, waits for the cached model (never
approves a download), plays the scenario file with the tactics file (the
Scenario pane's format, plus `act:` lines and per-tactic `win:`/`lose:`, see
docs/SCENARIOS.md section 7) and prints every turn: what the player said,
what the character said and the commands it ran. `--prompts` keeps the full
prompt of each turn in the saved JSON (`results/agent-<name>-<ts>.json`).
`--render` plays it with the 3D scene drawing too, cheaply: light quality
(`?gfx=light`: voxel look, no shadow maps or moving sea), 10 fps
(`?fps=10`), a 640x360 page (`--render=medium`, `--fps=N`, `--size=WxH`
change them), and saves an image of the scene after each turn to
`results/shots-<name>-<ts>/`. Use it for anything that needs everything
working together (walking, combat, darkness, objects); about 2.1 GB of GPU
memory with the model. Headless Chrome leaves the WebGPU canvas black in
page screenshots, so the images are read from the canvas (no UI in them);
`SHOT_CANVAS=1 node shot.mjs out.jpg` does the same by hand.

**Jank** (`node jank.mjs [url] [seconds]`, with a freshly launched Chrome
for a cold start): every 0.5 s the frames drawn, the longest frame gap, the
longest time the GPU took to finish a frame (a frozen picture even when the
main thread is fine) and the longest delay of real mouse moves sent every
100 ms, next to the model's status lines. Watching only the main thread
missed the freeze while the model set up: its frames took 1-6.5 s on the GPU.
**Tiles** (`node render-tiles.mjs [base] [only=a,b] [ppu]`): renders the 2D
tiles of every object, body and floor in the test Chrome
(`/app/?tabletop=1&tiles=1`) and writes `assets/tiles/` and its `tiles.json`;
about 4 minutes for all of them, or pass a comma list.
Evals live in `evals/`: `shop` (prices in the personality), `shop-role` (the
shopkeeper role), `feelings` (does a character remember being hit or given
gold, five turns later).

## Poking at the page

`node eval.mjs` prints a status summary; `node eval.mjs "<js expression>"`
evaluates anything in the page and prints the JSON result, e.g.

```bash
node eval.mjs "(location.reload(), 1)"
node eval.mjs "tablefolk.getBrainConfig('mog').messages"
node eval.mjs "llm('Say hi', {raw:true, silent:true})"
```

## Notes

- When done, `node close.mjs` closes the test Chrome (it holds GPU memory the
  user's own tab needs).

- `?norender=1` skips the 3D render loop so the model gets the GPU; walks snap
  to their destination at turn end, goals/inventory/sell work normally.
- Repeat runs are near-identical at low chaos (temperature 0.3). Raise a
  character's `chaos` in the scenario JSON to measure reliability.
- If the page shows "This browser cannot run Tablefolk yet … Could not load
  …cdn.babylonjs.com…", it was a CDN blip: `node eval.mjs "(location.reload(),1)"`.
- From Claude Code: run `launch-chrome.sh` with `run_in_background`; it works
  inside the sandbox (no sandbox bypass needed). Stream `runtests.mjs` output
  through a Monitor.
