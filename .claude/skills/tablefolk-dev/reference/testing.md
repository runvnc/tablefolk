# Testing

There are no unit tests; everything is tested in a real Chrome with the real
WebGPU model, driven over the DevTools protocol by the scripts in
`tools/browser-test/` (Playwright `connectOverCDP`, CDP port 9223). Its
`README.md` is the full manual; this chapter is the short version and the
traps.

## Setup and the usual loop

```bash
bun server/server.js 8001                             # a test server (8000 may be someone's own)
cd tools/browser-test
npm install                                           # once: playwright-core only
HEADLESS=1 ./launch-chrome.sh "http://localhost:8001/app/?art=1"   # run in the background
node eval.mjs "tablefolk.getAgents().length"          # evaluate in the page
node shot.mjs out.jpg                                  # screenshot (SHOT_CANVAS=1 in headless)
node close.mjs                                         # always close it: it holds GPU memory
```

- `launch-chrome.sh` uses its own profile (`~/.cache/tablefolk-test-chrome`,
  Chrome 136+ refuses remote debugging on the default profile). Headless runs
  on the real GPU only with the Vulkan flags it passes; plain headless falls
  back to SwiftShader. `--mute-audio` keeps game sounds off the speakers.
  Visible mode floats and sizes the window with `hyprctl` under Hyprland
  (tiling ignores `--window-size`).
- `?art=1`: no model, no voices, no intro card. Use it for anything visual.
- `?norender=1`: no 3D drawing, so the model has the GPU (agent tests).
- `?gfx=light&fps=10`: cheap rendering when both are needed.
- Never approve a model download in a test (`wait-ready.sh` stops at the
  download question; `APPROVE_DOWNLOAD=1` exists for a human to use).
- The downloaded model is cached **per origin**: it exists only for the port
  it was downloaded on (8000 on the maintainer's machine). Model tests must
  run on that origin.

## Tools

| script | does |
|---|---|
| `eval.mjs`, `console.mjs`, `reload.mjs`, `shot.mjs`, `close.mjs`, `clearcache.mjs`, `workerlog.mjs` | poke the page: evaluate, console log, reload, screenshot, close, clear caches, the LLM worker's log |
| `wait-ready.sh` | wait for the model (never approves a download) |
| `runtests.mjs <n> <example>` | the Scenario pane's Test tactics on a built-in example |
| `agenttest.mjs <scn.json> <tactics.txt> [runs] [--prompts] [--render] [--base=URL]` | play a scenario file with tactics, print every turn, save `results/agent-*.json` |
| `run-evals.sh` | all evals in `evals/` (run it with `bash -c` from fish) |
| `live-watch.mjs <scenario> [seconds]` | play a scenario live and keep the transcript |
| `editor-test.mjs` | the world builder's map editor: every tool against the scenario it writes (18 checks) |
| `render-tiles.mjs [base] [only=a,b] [ppu]` | render the 2D tiles into `assets/tiles/` (about 4 minutes) |
| `jank.mjs [url] [seconds]` | frame gaps, GPU frame time and input delay during start-up |
| `worldgen-test.html?prompt=` | the in-browser world builder run on its own |
| `vision/index.html` | the in-browser vision model on its own |
| `tts-engine-test.html` | the speech engines |
| `viewer.html`, `vshot.mjs` | look at one model file, screenshot it |
| `itchdl.mjs` | download from itch.io through Chrome (the HTTP flow says "invalid key") |
| `test-pack/` | a minimal asset pack and test scenarios (bodies, props, dungeon, village, two rooms) |
| `_*.mjs` | one-off scratch scripts from past sessions; not maintained |

## Evals (`tools/browser-test/evals/`)

`shop` (prices in the personality), `shop-role` (the shopkeeper role),
`roles`, `smithy` (a package's role and skill), `companion`, `feelings`
(remembering being hit or given gold five turns later), and `*-chaos`
copies at chaos 50. Point the test Chrome's output at a file on disk, not
in /tmp: headless Chrome's log grew to 7 GB in two hours of evals and filled
the 7.8 GB RAM disk (Claude Code's temp folder is there too). 2026-10-30 (RUNS=2, 36 scenario runs, each model at its
makers' recommended sampling, sampling.js): Gemma 4 E2B on LiteRT-LM 0.19.0
35/36 (one lowball sale); LFM3-1.7B on the WebGPU kernels (greedy) 30/36
(misses: haggling and list prices from the personality alone, recalling a
gift, one dagger commission); MiniCPM5-2B int4 on the LiteRT nightly at
temperature 1.0 25/36 (haggle to 45 0/4, potion at list price 0/2, dagger
0/2, quest giver 0/2), against 31/36 the same day with the bundle's own
sampler. `agenttest.mjs --model=<key>` picks the brain; `--llm=<url>
--llm-model=<name>` an endpoint. The full set takes 6-10 minutes a model.
Before that (2026-10-24, E2B): shop-role 2/2, roles
4/4, smithy and companion pass, feelings 'hit' 3/3. Run them after any
prompt change: the feelings eval fell to 0/2 once just from moving the
"Stay yourself" line below the feelings.

Tactics files use the Scenario pane's format plus `act:` lines and
per-tactic `win:` / `lose:` (scenario skill, `links-and-testing.md`).

## Traps

- A page that keeps old code: bump versions (`conventions.md`); in tests,
  open `index.html` with `?t=<Date.now()>`, and fetch test scenario JSON
  with a cache-busting query.
- `reload.mjs` on a page that redirects fails with `ERR_ABORTED`: pass the
  `/app/?art=1#s=...` URL directly. Changing only the hash doesn't reload.
- Headless page screenshots of the WebGPU canvas are black: read the canvas
  (`SHOT_CANVAS=1`, `agenttest --render`).
- After many reloads the test Chrome's GPU state can go bad: `<pad>` output,
  `QueueWorkDoneStatus` errors, or `Failed to send
  GpuControl.CreateCommandBuffer` and a hung page. Restart Chrome.
- Two Chromes on one profile don't work: close the visible one before a
  headless run.
- A teleported player in a test: set `camera.target` too, or the camera
  stays behind.
- Sight results are cached per task: separate `eval.mjs` calls see fresh
  values, one long script doesn't.
- `runAgentCommand` takes the space syntax (`walk n`), not `walk(n)`.
- From Claude Code: run `launch-chrome.sh` with `run_in_background`, and
  stream long runs through a Monitor.
