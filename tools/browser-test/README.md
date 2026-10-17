# Browser tests (real Chrome + WebGPU)

These scripts drive a real Google Chrome window over the DevTools protocol
(Playwright `connectOverCDP`), so tests run with the actual in-browser model
(Gemma 4 E2B on LiteRT-LM, WebGPU), not a mock.

## One-time setup

```bash
cd tools/browser-test && npm install        # playwright-core only, no browser download
```

## Run

1. Start the dev server (if it isn't running): `python3 tablefolk_server.py 8000` in the repo root.
2. Launch the test Chrome (keep it running; it's a normal window on the desktop):
   `./launch-chrome.sh` (opens `http://localhost:8000/app/?norender=1`).
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
