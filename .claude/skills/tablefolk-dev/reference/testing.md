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
- **Voices off in model evals**: a voice that takes graphics memory (Breeze
  or ZONOS3-Mini in the browser) beside Gemma E4B on a 6 GB card can leave
  the model answering nothing (seen 2026-11-15 with the native Breeze
  server, removed since). `survival-test.mjs` and `mind-check.mjs` set
  `tablefolkTtsEnabled=0` before the page loads.
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
| `live-eval.mjs --autonomy=rails\|guided\|free`, `interest-report.mjs`, `judge.mjs`, `probe.mjs` | agency.js levels: the interest report (activities, who chose them, self-started interactions, plans, surprises, depth, failures, cost per game hour) after every live-eval run; an LLM judge over transcripts (OpenRouter, ledger in work/openrouter-spend.json, $2 cap); the capability check for one brain. Results: brains.md, "Autonomy"; `tools/cloud-gpu/autonomy-queue.sh` runs the set on a rented card |
| `live-pending-test.mjs` | a monster told something must not starve the others' live turns |
| `modes-test.mjs` | the game modes' rules in Node (`app/modes-core.js`): which mode runs, who may use the model, turn order, the encounter switch, early turns, the model queue and turn lock order (51 checks, under a second) |
| `scenario-smoke.mjs <scn.json> --mode=living\|adventure\|turns [--shot=out.png]` | a scenario with no model in a game mode, the mode's rules checked in the page (turns: nothing moves between turns, a round in order, the clock jump; adventure: no model until engaged, the encounter opens and closes on walking away, the memory; living: the radius) |
| `modes-eval.mjs --mode=adventure\|living\|turns [--model=] [--autonomy=]` | the game modes with a real brain: calls while exploring, seconds to the first streamed words and to the line, the queue at each line, calls by far characters, seconds a round and a turn, early turns (results/modes-*.json; brains.md, "Game modes") |
| `editor-test.mjs` | the world builder's map editor: every tool against the scenario it writes (18 checks) |
| `package-test.mjs` | packages with no model (`?art=1`, `brain: none`): the Night Watch from this site and from a second origin (its own CORS server on 8014: the trust question answered in the page, data only, allowed, remembered, revoked), the documented options on `fixtures/pkg-extra` and `pkg-dep`, a skill's code from another site, `npm:`/`gh:` mapping, the Library's npm filter, command offers, job command rules, `defends`, skill cues, module goals, package lines (59 checks, about 60 s) |
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

Reply parsing (no browser): `node tools/browser-test/reply-parse-test.mjs` checks
`app/llm_js/reply-clean.js`: a stray quote after a command's bracket
(`say("...")". walk(tam)`, Raon-1 nano) and code-style endings split into
clean command lines; spoken words are counted in any script (a Korean line
counted 0 words and was turned into an emote, for Raon and E2B alike).

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

## Packages (`package-test.mjs`, `tools/check-api-doc.mjs`)

`node package-test.mjs` (the test Chrome on any app origin, `BASE=` for
another port) needs no model: it plays `scenarios/nightwatch.json` with
`"brain": "none"` and drives what a model would (commands through
`tablefolk.runAs`, the keeper's job through `tablefolkJobs.tick`, since
`?art=1` has no brain and live.js waits for one), then the fixtures, then
the same package from `http://localhost:8014` (a static server the test
starts and stops) to exercise URL resolution and the code question. 50/50
on 2026-11-20. After a change to the module API, an event or a supported
`window.tablefolk` member, run `node tools/check-api-doc.mjs` (the
scenario skill's `api.md` against the code, grep-level).

One game day with Gemma E2B (`live-eval.mjs scenarios/nightwatch.json --day
--day-minutes=8`, 2026-11-20): odo (beacon_keeper) ran 18 job cycles,
gathered 8 firewood and fed the beacon 6 times (it burnt out twice in the
night and he relit it); 8 model calls in the day (pick 6, danger 1, remark
1), every live tick in code; nobody used `signal()` (it is offered only by
the model's own turns, and the day had almost none); the wolfpack came (3),
circled, none was struck down, all fled at dawn, 84% of the others indoors;
the idle player standing outside was struck down by direwolf1 while the
fire was out (the scenario's lose condition).

Traps found writing it: a scenario with `"brain": "none"` switches the
page's brain, which clears the conversation history once, a moment after
the start (wait for `tablefolkBrainInfo().key === 'none'`); a confirm
dialog stays in the page for a moment after a click (count each element
once).

## Sections (`sections-test.mjs`, 2026-11-20)

`node sections-test.mjs` (no model; `fixtures/sections/top.json` with
`"brain": "none"`, then `deepdelve-camp` and `hearthvale`) walks the player
through every link kind (stepping onto a link's square, `playerStep` off an
edge, `tablefolkScenario.travel`), changes a section (a chest emptied, a
barrel moved, a rat defeated, a flag set), goes two deep, reloads the page
inside the cellar and checks everything came back, then: the clock and
flags carry, a locked trapdoor needs its key, the field's mist and hidden
crown, explored squares kept, the goal won from inside the field, a gate to
another scenario file, a missing file (the player stays), a generated cave
(the same on return), the catch-up (the farmer in bed at 23:00), the map
card, and both showcase worlds in and out. 37/37 on 2026-11-20 in about 80
s (`SHOTS=dir` saves pictures). Run it on its own server and Chrome when
another session uses 8000:

```bash
bun server/server.js 8003
TEST_PROFILE=~/.cache/tablefolk-sections-chrome TEST_CDP_PORT=9231 HEADLESS=1 ./launch-chrome.sh "http://localhost:8003/app/?art=1"
CDP_PORT=9231 BASE=http://localhost:8003 node sections-test.mjs
```

Traps: app.js disposes the engine on `pagehide`, so the journey is saved
on `beforeunload` and `visibilitychange` (a save at `pagehide` found no
objects); a companion follows only when within 7 squares of the player when
they travel; the test waits for the section id to change before waiting for
the curtain (the travel starts asynchronously).

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
(the native one, removed 2026-11-21) started for the page beside the test Chrome filled the 6 GB card and the
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
After the table: `NO JOB CYCLES` for every working job that finished none
(its step at the end and the last thing that held a step up, from
`tablefolkJobs.stats()` `step`/`stuck`) and `HUNGRY at the end` with the
reason (`stats().hungerWhy`).

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

## Quieter rooms, one topic, fallbacks (2026-11-20, later)

Same settings (E2B, lively, player idle), code at the Part A commit plus
the flour ping-pong fix (bakers no longer buy an input from someone whose
own work needs it). The bakery now has 3 flour sacks (bread from a flour
sack works), hearthvale two ore rocks by the smithy.

| | bakery before | bakery after | market before | market after |
|---|---|---|---|---|
| model turns (6 min) | 26 | 9 | 9 | 16 |
| spoken lines a minute | 4.3 | 1.3 | 1.2 | 1.5 |
| tasks done / failed | 40 / 0 | 18 / 1 | 92 / 1 | 56 / 0 |
| malformed replies | 0% | 0% | 0% | 0% |

(An intermediate run, before the floor rule and with every character near an
event offered "say something": 2.5 a minute. The first run with fallbacks
had the two bakers selling one flour sack back and forth every two seconds:
fixed.) After the flour runs out the bakers sit or tidy; the room is quiet
rather than chatty.

| hearthvale, one game day (8 min) | final before | after |
|---|---|---|
| model calls (a game hour) | 53 (2.2) | 26 (1.1) |
| idle open turns / ticks in code | 0% / 96% | 0% / 98% |
| job cycles farmer, baker, innkeeper, smith, woodcutter, guard, hunter, picker | 6, 2, 4, 3, 3, 1, 4, 7 | 7, 3, 4, 6, 4, 14 (places visited), 4, 7 |
| sales between characters | 11 | 17 |
| meals | everyone once | everyone once or more |
| spoken lines a game hour | 1.0 | 0.6 |
| raid | 4 came, 1 down, 3 fled, 74% indoors | 4 came, 1 down, 3 fled, 90% indoors; hector hurt |

The smith works all day now (ore from the rocks, firewood bought from jory
or chopped). Evening talk has topics ("Odo paid me one gold for the wheat
today.", "Rosa sold you ale for two gold, tam."), but only two social turns
came in the evening window.

## The world builder (`gen-eval.mjs`, 2026-11-20)

Worlds in sections (`node gen-eval.mjs --sections --base=http://localhost:8003`,
the server path, deepseek-v4.1-flash): `delve3` ("a mining camp above an old
dwarf delve, where a young miner went missing two levels down", 3, levels)
built in 20 s: a hamlet (4 people with job, home and work, a rat threat, low
stores, goal `agent_near tobin` + `player_defeated`), a mine level (2 people,
spiders and rats, stairs down in its lair), a crypt level (tobin, skeletons,
a ghost); structure: 3 sections, 2 links, all reachable, the goal's tobin in
level 2, no problems, nothing repaired. `region3` ("a village by a dark
forest, with a cave in the hills where the wolves den", 3, region) in 13 s:
the village with an edge east to the forest and a cave mouth in its garden
to the den, the goal `agent_defeated wolf_alpha` in the den, no problems.
Both together cost $0.0055 on OpenRouter. The delve world played: down two
flights of stairs and back with every section kept.

Eight one-line requests through `/api/generate` (deepseek-v4.1-flash on
OpenRouter, the default), structure only. Before (the old fast-skill and
checks): every world a generated map with 5-11 places, `live` but no clock
time, **no character with a job, home or workplace**, a pressure only where
the request had monsters (4 of 8 none), goals `player_has`/`said`, the talk
request a one-room grid.

| request | before: pressure / goal | after: places, people with job+home+work (reachable), pressure, goal, repairs |
|---|---|---|
| village | none / player_has | 10, 5/5 (5), wolves + low stores, stock_at_least + survived_days + agents_alive, 7 |
| outpost | none / player_has | 12, 5/5 (5), goblins + low stores, survived_days + agents_alive, 7 |
| dungeon | monsters / player_has | 9, 4/4 (4), skeletons + monsters, player_has + player_defeated, 4 |
| forest | monsters / player_has, said | 8, 3/3 (3), wolves, survived_days + agents_alive, 7 |
| mine | monsters / player_has | 5, 5/5 (5), spiders + low stores, agent_near + agents_alive, 0 |
| market | none / said | 11, 6/6 (6), bandits + low stores, threat_defeated + agents_alive, 6 |
| farm | none / player_has | 5, 4/4 (4), wolves + rats + low stores, survived_days + stock_at_least, 4 |
| talk (interview) | grid, 1 room | `"talk": true`, a 4-room dungeon, no jobs or threats added |

Repairs are mostly stations (a cauldron in a tavern, a target for a guard),
beds, a store by the work, and `allowed` for fighters and sellers; the model
writes jobs, homes, workplaces, threats and the goal itself. In-browser step
by step (E2B, 25-60 s a world): village 9 places, 4/4 with work, monsters +
low stores, survived_days (10 repairs); forest 7 places, 3/3, wolves (6);
talk kept talk-only. Cost of all the cloud runs: $0.04.

One game day (`--day --day-minutes=6`, E2B) on three of the generated worlds
as they came out (no hand tuning):

| | Harvestmere (village, 5) | Watchpost Kestrel (outpost, 5) | Thornwood Camp (forest, 3) |
|---|---|---|---|
| job cycles | farmer 6, baker 4, innkeeper 4, guard 7 places, smith 2 | guard 9, hunter 2, cook 1, smith 3, labourer 0 | hunter 2, cook 3, woodcutter 7 |
| made / gathered / sold between them | 11 / 22 / 3 | 4 / 8 / 1 | 2 / 19 / 3 |
| meals (of people) | 3 of 5 | 3 of 5 | 2 of 3 |
| slept at night | 2 of 4 (+ the guard's watch) | 3 of 4 | 3 of 3 (kestrel 36 min) |
| raid | 2 wolves, 1 down, 1 fled, all others indoors | 3 goblins, 2 down, 1 fled, 89% indoors, guard and hunter hurt | 2 wolves fled, all indoors; the hunter never reached them (12.6 cells) |
| model calls a game hour | 0.7 | 1.2 | 0.6 |
| spoken lines a real minute | 2.3 | 2.3 | 0.2 |

Found and fixed from these: villagers who reached home after the raid
began hid indoors standing all night (now they go to bed when it is
bedtime). Left: a single snare starves a hunter (one meat every 4 game
hours), a labourer with nothing to haul does nothing, a cook without meat
cooks once.


## Spoken life, evenings, chores, commands in code (2026-11-20, evening)

`live-eval.mjs` now ends with a talk report (`talk-report.mjs`, also run
over saved results): lines split into templated (said by code from a pool)
and model lines, by day (05-17), evening (17-21) and night per game hour,
the pairs that talked and the biggest pair's share, questions, and (with
`--day`) everyone who ends hungry with the reason. The "before" columns are
today's earlier runs re-scored (hearthvale `a3`, the generated village
`after2`, the bakery `a3`, the Night Watch run above); E2B, lively, the
player idle, the test worktree served on :8000.

| hearthvale, one game day (8 min) | before | after (final code) |
|---|---|---|
| spoken lines a game hour (templated / model) | 0.6 (0.1 / 0.5) | 1.6 (0.8 / 0.8) |
| model lines a game hour: day / evening / night | 0.2 / 1.5 / 0.4 | 0.3 / 4.0 / 0.1 |
| templated lines a game hour: day / evening / night | 0 / 0.2 / 0.1 | 0.8 / 1.0 / 0.6 |
| pairs that talked (in the evening), top pair's share | 3 (2), .50 | 7 (5), .21 |
| questions (to characters) | 1 (0) | 7 (7) |
| model calls (a game hour) | 26 (1.1) | 36 (1.5) |
| job cycles farmer, baker, innkeeper, smith, woodcutter, guard, hunter, picker | 7, 3, 4, 6, 4, 14, 4, 7 | 7, 4, 7, 7, 6, 4, 3, 8 |
| sales between characters | 17 | 18 |
| slept at night (of 7, the guard keeps watch) | 7 | 6 (rosa on the floor: her bed taken; fixed after) |
| hungry at the end | nobody | nobody |

(Earlier after-runs on the way: evening 2.2 and 3.7 model lines a game
hour; up to four villagers stood all night, fixed below.)

| generated village (Harvestmere, 6 min day) | before | after |
|---|---|---|
| spoken lines a game hour (templated / model) | 0.6 (0.1 / 0.5) | 1.3 (0.6 / 0.6) |
| model lines in the evening a game hour | 1.0 | 2.5 |
| pairs / questions | 3 / 0 | 4 / 5 |
| model calls | 18 | 25 |
| slept at night (of 4 sleepers) | 2 | 3 (hob and odo had stood all night in the first after-run: a row of beds walled in) |
| hungry at the end | nobody | hob .68 |

The bakery (6 minutes): model lines 1.3 a minute before and after (the
limit is 2.0; 3.2 in the first after-run, when the quicker evening pace
applied to every room: now only to a gathering of four or more), templated
0.5 a minute, malformed 0%, tasks 18 / 17. Provocations unchanged: grub
refuses at 3, orders out and strikes at 4; hector calls for help at 1,
orders out at 3, refuses at 3, first blow at 4; greta refuses at 4, hostile
at 5.

The Night Watch day: before, nobody used `signal()` (8 model calls all
day), no wolf struck down, the player struck down; after (the keeper's
command rule, the militia's `defends`): Odo signalled at 22:04 as the
wolves came, the two spearmen shouted and held the beacon, all three dire
wolves struck down, nobody hurt; 18 model calls; 0.7 spoken lines a game
hour (was 0.04).

The world builder (`gen-eval --only=talk,village,forest`, after): the
interview is one 7x7 grid room (was a 4-room dungeon); village 9 places
5/5 with work, forest 5 places 4/4.

Found while measuring: four of eight villagers in hearthvale and two in the
generated village stood all night "going home to bed" (a row of beds
walled in by each other, two beds generated in one cell): bedtime now
skips beds it failed to reach or that share a cell with an occupied one,
else sleeps on the floor at home. Then two stood all night "running home to
hide" from a raid (the route home never worked): they now stay put and
sleep where they are. The first full run stalled with 100 s model calls
(the test Chrome's GPU state after many reloads, with the rendering job's
Chrome on the same card): a fresh Chrome per run fixed it.

## Integration checks after the merges (2026-11-21)

No-model suites on the merged code: `sections-test` 37/37 (marker names
are now `link_<kind>_<material>`), `package-test` 59/59, `libs/script`
35/35, `libs.mjs check` ok, `check-api-doc` 135 names found. `uses-test`
ran through (GPU out-of-memory noise from another job's model on the same
card). `willow-lane-test` and `live-pending-test` need EmbeddingGemma or
Gemma: with another job's 3-4 GB model on the 6 GB card they failed or
hung (menu matching by meaning got no embeddings); rerun them on a free
card.

`run-evals.sh` (E2B, RUNS=2, the card free): 33/36: shop-role-chaos 8/8,
shop-chaos 7/8 (haggle to 45 2/2 now that `sell(x) N` and `use(sell(...))`
parse), feelings-chaos 4/4, smithy 4/4, roles 6/8 (quest giver 0/2: old_tom
never named the hollow or the den: "Could you give_quest(find missing
sheep)?" inside a say line), companion 4/4. shop-chaos twice more: 6/8
(potion 1/2: `give(healing potion) 8`, left unparsed on purpose; haggle 1/2:
sold at 50 after agreeing to 45) and 8/8.

Hearthvale's day with a trip to the Wolfwood at 12:00 for 1.5 game hours
(`live-eval --day --day-minutes=8 --label=sections` beside `sections-day.mjs
--at=12 --hours=1.5`): while away 0 model calls and 0 lines from the
village; the catch-up for 109 game minutes moved 7 workers to their places,
put the night-watch guard to bed, regrew 3 things, fed nobody; job cycles
farmer 6, baker 2, innkeeper 4, smith 3, woodcutter 4, guard 14 (places),
hunter 2, child 9 (last hearthvale day: 7, 4, 7, 7, 6, 4, 3, 8); 27 model
calls (1.1 a game hour, was 1.5); evening model lines 2.3 a game hour (was
4.0); 6 sales; three slept on the floor at home (counted as sleep); five
ended the day hungry (.59-.69), all having just woken at 05:35 with the
day ending at 06:41 (the catch-up had set their hunger as if they ate at
midday, so they got hungry in the night). A control day without the trip
could not be run cleanly (the other job's model on the card: the brain took
110-190 s to load and the world stalled).

