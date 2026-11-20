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
- **Voices off in model evals**: a test profile that remembers the Breeze
  voice makes the test server start `breeze-server` (2+ GB of the card);
  beside Gemma E4B on a 6 GB card the model then answers nothing (seen
  2026-11-15). `survival-test.mjs` and `mind-check.mjs` set
  `tablefolkTtsEnabled=0` before the page loads; `pgrep -fa breeze-server`.
- **A fresh test Chrome per model**: after E4B ran in a test Chrome,
  switching that Chrome to E2B (`?model=`) gave empty answers after ~50 s a
  turn (2026-11-15; Breeze had also run beside it). Close and relaunch
  between models.
- Two sessions at once: `TEST_CDP_PORT=9225 TEST_PROFILE=~/.cache/tablefolk-test-chrome-d0`
  for `launch-chrome.sh` gives a second test Chrome (its own model cache: a
  download), and `CDP_PORT=9225` points the scripts at it. They share the
  GPU, so only one should run a model on a 6 GB card.
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
| `live-eval.mjs <scenario> [--minutes=6] [--provoke=<id>]` | a living world scored: speech share, replies to overheard talk, trades, tasks, failures, malformed replies; or K insults to one character and when it refuses, calls for help or attacks (README) |
| `gen-eval.mjs [--browser] [--only=village,talk] [--label=]` | the world builder on 8 one-line requests (village, outpost, dungeon, forest, mine, market, farm, a talk scene) through `/api/generate` (the server's cloud model) or the in-browser step-by-step path; per world: places, people with job/home/workplace set and reachable, pressure, goal predicates, live/time, repairs; saves `results/gen-<label>-<key>.json` to play with live-eval |
| `live-pending-test.mjs` | a monster told something must not starve the others' live turns |
| `editor-test.mjs` | the world builder's map editor: every tool against the scenario it writes (18 checks) |
| `render-tiles.mjs [base] [only=a,b] [ppu]` | render the 2D tiles into `assets/tiles/` (about 4 minutes) |
| `jank.mjs [url] [seconds]` | frame gaps, GPU frame time and input delay during start-up |
| `gpu-profile/profile.mjs <url> <out.json>` | graphics profile: GPU time per frame (timestamp queries), CPU phases, per-callback cost, JS profile, ablations (usage in its header; findings in rendering.md, Light quality) |
| `worldgen-test.html?prompt=` | the in-browser world builder run on its own |
| `vision/index.html` | the in-browser vision model on its own |
| `tts-engine-test.html` | the speech engines |
| `viewer.html`, `vshot.mjs` | look at one model file, screenshot it |
| `itchdl.mjs` | download from itch.io through Chrome (the HTTP flow says "invalid key") |
| `test-pack/` | a minimal asset pack and test scenarios (bodies, props, dungeon, village, two rooms) |
| `cloud-shot.py <url> <out.png> [s]`, `cloud-gpucap.js` | screenshot on a machine with no GPU or display (a cloud VM): Playwright's Chromium on Mesa lavapipe, the 3D frame read from the GPU and laid into the page (`out_full.png`); `OFFLINE=1` blocks all but localhost (details in its header) |
| `_*.mjs` | one-off scratch scripts from past sessions; not maintained |

## Evals (`tools/browser-test/evals/`)

Speech input: `asr-test.mjs` runs the voice library's samples (their
transcripts are in `voices.json`) or any clips (`--clips=list.json`, e.g.
LibriSpeech) through Bark in the page and the server's Gemma
(`--engines=bark,gemma`, a server with `--litert`), clean and through a
laptop-mic filter (`--noisy`), and prints word error rates and times.
`?asrvariant=q8|fp16|q4` forces a Bark build (`--query=asrvariant=q8`). The
whole microphone path: `CHROME_EXTRA="--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>"`
for `launch-chrome.sh`, then click `#micBtn` twice.

Scripted (no model): `uses-test.mjs` drives every kind of `use`, `put`, `take`, `close` and the player's E, with shots in `results/uses`.


`shop` (prices in the personality), `shop-role` (the shopkeeper role),
`roles`, `smithy` (a package's role and skill), `companion`, `feelings`
(remembering being hit or given gold five turns later), `uses` (sit, lie down, store in and fetch from a chest; Gemma E2B 10/15 on 2026-11-01, fetching 0/3), and `*-chaos`
copies at chaos 50. Point the test Chrome's output at a file on disk, not
in /tmp: headless Chrome's log grew to 7 GB in two hours of evals and filled
the 7.8 GB RAM disk (Claude Code's temp folder is there too). 2026-10-30 (RUNS=2, 36 scenario runs, each model at its
makers' recommended sampling, libs/brain/sampling.js): Gemma 4 E2B on LiteRT-LM 0.19.0
35/36 (one lowball sale); LFM3-1.7B on the WebGPU kernels (greedy) 30/36
(misses: haggling and list prices from the personality alone, recalling a
gift, one dagger commission); MiniCPM5-2B int4 on the LiteRT nightly at
temperature 1.0 25/36 (haggle to 45 0/4, potion at list price 0/2, dagger
0/2, quest giver 0/2), against 31/36 the same day with the bundle's own
sampler. `agenttest.mjs --model=<key>` picks the brain; `--llm=<url>
--llm-model=<name>` an endpoint. The full set takes 6-10 minutes a model.
2026-10-31, after the planning filter: LFM3-1.7B on llama.cpp (temperature
0.1) 35/36 (32 before; one lowball sale), Gemma E2B 33/36 (the misses were
all its own command lines, untouched by the filter: a lowball sale, settling
at 40, not recalling a hit). `EVAL_ARGS` passes flags to agenttest.mjs
(`--llm=http://127.0.0.1:8080/v1 --llm-model=LFM3-1.7B`).
LFM3-Omni-2B (Q4_K_M, llama.cpp, `--model=endpoint --llm=... --llm-model=LFM3-Omni-2B`;
without `--model=endpoint` the profile's saved brain wants its download),
2026-11-01: micro-eval 7/10 (small talk 2/2, horseshoe 2/2, lowball 2/2,
haggle to 45 0/2, remembering a hit 1/2), 0.3-1.3 s a turn: weaker than
LFM3-1.7B as a brain, but it also hears (vision-speech.md).
Micro-eval (`micro-eval.sh`: villager small talk, horseshoe, haggle to 45,
lowball, remembering a hit; `--think` makes everyone reason first and prints
tokens and seconds per turn), LFM3-1.7B on llama.cpp, RTX 2060, 2026-10-31:
thinking off 9/10 at 0.6-4 s a turn (8 of 10 haggling turns still ran to the
256-token cap writing visible reasoning, which the planning filter strips);
thinking on with a 2048 budget 9/10 but 7 of 17 hard turns hit the cap with
no answer; with 4096, hard tests 6/6, 1 of 15 capped, median 1600-1900
tokens, 16-32 s a turn (up to 41). The capped reasoning goes in circles
(the reply format, what give and sell do, side issues), so more budget buys
little. Thinking stays off by default for LFM3; per character it gets 4096.
With thinking on LFM3 also writes its trained tool-call format
(`<tool_call><function=say><parameter=text>...`), translated to commands in
world-integration.js.
Before that (2026-10-24, E2B): shop-role 2/2, roles
4/4, smithy and companion pass, feelings 'hit' 3/3. Run them after any
prompt change: the feelings eval fell to 0/2 once just from moving the
"Stay yourself" line below the feelings.

Living worlds (`live-eval.mjs`, Gemma 4 E2B in the headless test Chrome,
pace lively, player idle, 6 minutes; 2026-11-20 baseline before the
addressed-speech, tempers and results changes):

| | bakery | market-village |
|---|---|---|
| model turns | 42 | 45 |
| turns with speech / speech only | 86% / 2% | 93% / 64% |
| spoken lines a minute | 4.7 | 4.0 |
| replies to overheard talk / to nobody | 22 / 8 | 0 / 36 |
| trades or gifts between characters | 0 | 0 |
| tasks done / failed commands (labelled FAILED) | 12 / 4 (0) | 4 / 4 (0) |
| malformed replies | 1 (2%) | 0 |
| seconds a turn (median) | 2.2 | 1.5 |

Provocation (8 insults, no threats): grub (bakery) never refused, called for
help or attacked; his anger read .6 after insult 2 only because he wrote
`feel(angry)`, then faded to .36 while the insults went on, and trust rose
.50 to .53; the first "order off" in words came at insult 4 ("Keep your
disgusting presence away from my kitchen!"). hector (a guard, `evals/roles.json`):
anger 0 throughout, trust .50 to .53, polite answers, no attack.

After the changes (same day, same settings, final code):

| | bakery before | bakery after | market before | market after |
|---|---|---|---|---|
| model turns | 42 | 60 | 45 | 59 |
| turns with speech written / actually spoken | 86% / - | 44% / 23% | 93% / - | 41% / 14% |
| speech-only turns | 2% | 2% | 64% | 41% |
| spoken lines a minute | 4.7 | 2.0 | 4.0 | 1.3 |
| replies to overheard talk | 22 | 0 | 0 | 0 |
| turns muted (no reason to talk) | - | 39 | - | 46 |
| trades or gifts between characters | 0 | 1 (thistle gives grub a bun) | 0 | 0 |
| tasks done / failed | 12 / 4 | 15 / 4 | 4 / 4 | 10 / 9 |
| failures reported as "worked" | 1 | 0 | 0 | 0 |
| malformed replies | 2% | 2% | 0 | 2% |
| "God"/"ready" leaks | 0 | 0 | 0 | 0 |

("Speech written" counts say lines the model wrote; on a muted turn E2B
still often writes one and the game drops it.) The first after-run (before
the last tweak, which stopped "comes up to you" counting as a reason to talk) had 65% speech turns, mostly 6-line
conversations between characters started by approach notices and director
events. Seed variants on the bakery (60 turns each): none 1 malformed reply,
the neutral "(You look around.)" seed 0 (kept). Provocation after: grub
(brave) refuses service by code at insult 3, says "leave" at 3, turns
hostile at 4, first blow lands at 5; hector (guard) refuses at 3, attacks
and lands a blow at 4 (the player is beaten down by insult 8); greta (calm
innkeeper) refuses at 5, orders the player out at 6, calls for help at 7
(hector got the call but `evals/roles.json` does not allow `walk`, so he
could not come over). Run memories: live-eval clears `tablefolk-mind:*`
first (a run started with trust .16 from an earlier run's insults).

Regressions after these changes (`run-evals.sh`, E2B, RUNS=2): 33/36 at
first (shop-chaos haggle to 45 1/2, smithy commission a dagger 0/2: with
the honest result "skill FAILED: bram doesn't know iron_bar" bram tried
`use(iron_bar)` instead of `forge(dagger)`; history entries now name the
skill, "forge FAILED: ...", and the dagger went back to 2/2).

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
- With no GPU (cloud VMs): Google Chrome and SwiftShader lose the WebGPU
  device right after the adapter; Playwright's Chromium with lavapipe
  works, and the canvas never reaches the page, so `cloud-shot.py` copies
  the frame out after the app's submit.
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

## The libraries (libs/)

`node tools/libs.mjs check` (imports and no game globals), then
`/tools/browser-test/libs-test.html` on a test server: it imports every
library and checks what needs no download (the mirror rule, device
detection, menu matching and the menu box, `createBrain` with a stand-in
engine: chat, stream, pick, yes/no, json, the Prompt-API session, a decider
stand-in; the voice and speech choices). With models cached (the :8000
origin), `createBrain({ model: "gemma4-e2b" })`, `createVoice` and
`createListener` were checked end to end on 2026-11-13 (Pocket-TTS line
transcribed word for word by Bark).

## Scripted worlds

`node libs/script/test.mjs`: 35 checks in Node, no browser (the expression
language, Willow Lane played with an in-memory host, old saves, pausing, menu
steps, triggers, `validate` over every scenario). Then, in the game:
`willow-lane-test.mjs` plays `scenarios/willow-lane.json` (`"brain": "none"`)
through its menus, flags, inventory conditions and riddle workflow (23
checks; load `http://localhost:8001/willow-lane` in the test Chrome first,
with EmbeddingGemma on). A world with a model: `haggle-workflow` on :8000
(Gemma cached), chat 20 then 45 gold: Mog counters, then sells at 45. Turn
voices off in the test profile (`tablefolkTtsEnabled` 0): a Breeze server
started for the page beside the test Chrome filled the 6 GB card and the
LiteRT worker hung (2026-11-13); after that the shared worker needs a Chrome
restart.

## A whole day (`live-eval.mjs --day`)

`node live-eval.mjs scenarios/hearthvale.json --day [--day-minutes=8]`
plays one game day (the page gets `?dayMinutes=8`: 8 real minutes) and
prints a table per character (job cycles, made / gathered / stored / sold /
bought, meals, game minutes asleep at night, hunger at the end, model calls
by kind) and totals (model calls per game hour, idle open turns' share,
live ticks handled in code, spoken lines per game hour, stores at the start
and the end, raids, who was hurt, who was indoors while raiders were about).
A world without a clock is timed from its `time` and the real minutes.

Baseline, before jobs (2026-11-20, E2B, hearthvale, pace lively, 8 minutes,
code at ccae1fd): 113 model calls (4.7 a game hour), 73% of them idle open
turns ("Nobody has spoken to you: do something"), 41% of live ticks handled
without the model; no job cycles, nothing made, 0 sales between characters,
5 meals for 8 people (3 of them `eat` lines the model wrote), nobody slept
(no clock: the lighting never turns to night), hunger at the end .36-.73;
0.7 spoken lines a game hour; no raids (no threats). Stores at the end: 17
items in chests (about 18 at the start: the first run counted 0 because
chests fill lazily; fixed in the tool), 10 firewood carried by jory.

After the clock, stock, jobs and threats (same day, same settings; final
code for hearthvale except the last two fixes, which touch quarrels and
`say(...);` lines):

| hearthvale, one game day | before | after |
|---|---|---|
| model calls (a game hour) | 113 (4.7) | 58 (2.4) |
| idle open turns | 73% | 0% |
| live ticks handled in code | 41% | 95% |
| job cycles (farmer, baker, innkeeper, smith, woodcutter, guard, hunter, picker) | none | 6, 3, 5, 3, 3, 1 (a patrol loop of 7 places), 4, 7 |
| things made / gathered / stored | 0 / 11 / 4 | 13 / 51 / 69 |
| sales between characters | 0 | 13 |
| meals (people who ate) | 5 (3 of 8) | 9 (7 of 8: tam ended at hunger .64) |
| slept at night (game minutes, of 480) | nobody | 6 of 8 (243-441); hector keeps the night watch and sleeps by day; tam 0 in the first run (the nearer bed was taken: fixed, 423 after) |
| hunger at the end | .36-.73 | .03-.64 |
| spoken lines a game hour (a real minute per person) | 0.7 (0.25) | 1.5 (0.58; the bakery's 2.0 a minute for 3 was 0.67) |
| model calls by kind | open 83, reply 14, event 8, cause 8 | reply 24, pick 18, cause 8, remark 3, social 2, event 2, danger 1 |
| stores: in chests / carried at the end (start: 18 / 8) | 17 / 18 | 62 / 10 |
| raids | none | 2 wolves at night, 2 crows by day: 2 struck down, 2 fled; hector and wren came within a cell; 85% of the others indoors while raiders were about; hector and wren hurt |

The evening talk is still thin ("Hush." "Hmph." "Keep working."): it has a
cue with the day's news since (jobs.js evening), not measured yet.

Final code (after the quarrel, `say(...);`, ask, evening cue, quiet-gap and
seat fixes; hearthvale `final`): 53 model calls (2.2 a game hour), 0% idle
open turns, 96% of ticks in code; cycles farmer 6, baker 2, innkeeper 4,
smith 3, woodcutter 3, guard 1, hunter 4, picker 7; 11 sales; everyone ate
once, nobody above hunger .66; all but hector (night watch) slept at night
(108-396 game minutes); 1.0 spoken lines a game hour (0.36 a real minute
per person); raid: 4 spawned, 1 struck down, 3 fled, 74% of the others
indoors meanwhile, nobody hurt.

Old evals on the final code (E2B, same day):

| | bakery before (prev. job) | bakery after | market before | market after |
|---|---|---|---|---|
| model turns (6 min) | 60 | 26 | 59 | 9 |
| muted (idle) model turns | 39 | 0 | 46 | 2 |
| spoken lines a minute | 2.0 | 4.3 | 1.3 | 1.2 |
| tasks done / failed | 15 / 4 | 40 / 0 | 10 / 9 | 92 / 1 |
| trades between characters | 1 | 0 | 0 | 0 |
| malformed replies | 2% | 0% | 2% | 0% |

The bakery talks more than after the last job: with no idle model turns
filling the time, its three characters stand together and talk back to
back (6.7 lines a minute before the quiet-gap change, 4.3 after); worse
than the 2.0 target. Provocation: grub refuses at insult 3, hostile and
first blow at 4, stops at a third of the player's health ("That's enough.
Get out of here"); hector refuses at 3, orders out at 2, attacks at 4,
stood down at 5 hp but was pushed into a second fight and beat the player
to 0 (fixed: no new fight or blow at someone at a third of their health;
re-run: the player ends at 3/20); greta (calm) refuses at 4 (was 5) and
calls for help. `run-evals.sh`: 30/36 on the first pass (smithy ran out of
GPU memory beside the Blender jobs; dagger 0/2 twice: a package anvil
suggested as `use()`, fixed, 2/2); shop-chaos potion 0/2 then 2/2;
feelings 'hit' 0/2, 1/2, 1/2, and 1/4 on the code from before this work
(ccae1fd), so noise there, not a regression. With the fixes: 36 - 1 to 3
(feelings 'hit').
