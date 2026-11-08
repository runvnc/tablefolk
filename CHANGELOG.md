# Changelog

What changed, newest first. Dates are commit dates. Details of each feature
are in the scenario skill's chapters (users and authors) and the maintainer
skill (internals); `git log` has every commit.

## 2026-11-08

- **The Oracle, after a critique**: you start three squares from him (he was a speck from the door), the banner says to ask him anything, the room is dim so the lamps glow, his example spell is `spawn(gold)` (bread doesn't exist, so it made a random thing), and the unused gold and the personality his prompt never read are gone.
- **The Oracle looks the part**: wizard.glb has a tall, bent oracle's hat (navy, gold band and stars, the spiky hair pressed under it) on the head bone and a glowing blue orb on the staff (`tools/wizard-extras.mjs`; every world's wizard gets them). His chamber is open to the night sky, with stag statues on plinths, candelabras, a lectern, bookcases, a cabinet, tables, crystal lamps along the rug, chests, vases, candles, potions, a scroll and a chalice.
- **Loose things rest on rugs and raised floors**: rugs, planks, tiles and slabs have a collision surface now (app.js floorCollider), so a crate dropped on the Oracle's rug no longer sinks 3 cm into it.
- See the entries below: the camera, the Oracle's rug and glossy characters, hit reactions and the Oracle's spells were finished on the 8th.

## 2026-11-07

- **Casters move their arms, hits show and are heard**: a spell plays the caster's cast clip (the Oracle raises his staff and thrusts it at the target) and holds it for the whole spell; the end of the turn used to cut it back to idle within 0.1 s, so the arms hardly moved. Rigs without a cast clip raise the arm procedurally. Every hit makes the character flinch (its hit clip, or a jolt backwards), flash red and cry out: a synthesized grunt pitched for the character (and squeaks, yelps, hisses, rattles for creatures), a louder cry when it falls, in 3D (`app/reactions.js`). **The Oracle has 9 hp** (three fireballs) and casts when insulted: his prompt says "asks for magic, insults you or attacks you" and shows `fireball(you)`; Qwen1.5 0.5B cast in 10 of 12 replies to insults (0 of 12 before).
- **Rugs instead of grey gravel, glossy figures, feet on the floor**: carpet is now a woven rug (royal blue by default, or the paint tint) with a gold-and-crimson border that frames each patch and turns its corners, a diamond lattice with medallions, a fine weave and the glossy miniature finish (`buildRug`). Every character has the toy-plastic finish of the tiles and props (`toyFinish`). Characters and objects stand on rugs, planks and tiles instead of sinking into them (`floorLiftAt`); the Oracle stands on his rug.
- **Turn the follow camera with the mouse**: drag in the follow camera to look at you from any side and tilt; it keeps that angle while it follows you (and when you come back to it), the wheel still zooms, and a click still walks or selects. **C from first person goes to the free camera** (it went straight to the follow camera, so The Oracle's first C skipped the free view); then C switches free and follow.
- **Voices are ready before anyone speaks**: when a world loads, the voice engine, the audio graph (it starts at your first click or key) and each character's voice are prepared, and Breeze in the browser speaks one silent warm-up line. The first line started 8.3 s after it was asked for; now about 3.9 s, like the rest. Breeze in the browser plays the moment its first audio arrives (within about 15 ms) and streams while it generates.
- **The start of each line is no longer lost**: between lines the voice player sends a faint, inaudible noise instead of exact silence. Chrome closed its audio stream when the output was all zeros, the system then suspended the speaker (PipeWire after 5 s, the laptop's codec after 10 s), and waking it swallowed the first part of the next line.
- **A spell cast at nobody comes back on the caster** (fireball 3, lightning 4), so the Oracle can forget the target and finish himself off. **The free camera no longer glides after you** when you walk; C is the follow camera.
- **A simpler screen for players**: in user mode the left rail has two icons, Adventurer (health, gold, items, then the view buttons, pace and let them live, then the controls) and Settings (your name, links to Voice, Graphics and Messages, and the developer-mode switch); the chat box is just the conversation (messages button, message, 🎤, send), with "to:" only when there is more than one character and health only while you are hurt. The 🎤 button's recogniser label no longer runs under "send", at any width; the Voice pane fits its panel. Dev mode keeps every panel and the full chat box.
- **Record videos with sound**: the ⏺ button in the top bar records the 3D view at about 30 fps with the voices and sound effects, and downloads an MP4 (H.264) or WebM (`app/video-recorder.js`).
- **The Oracle can cast fireball and lightning and conjure things** (`fireball(target?)`, `lightning(target?)`, `spawn(thing[, n])`, `app/spells.js`): particle fire and branching bolts with flickering light and 3D sound; a spell with a target also hurts the caster. His prompt lists them for when he's asked for magic or insulted (Qwen1.5 0.5B cast 4-5 times in 33 replies, all when provoked). A character's failed command is no longer spoken or shown.
- **A world can start in first person, and the cameras get close**: the scenario field `"view"` (`overview`, `follow`, `first`; `?view=` overrides, builder: Story tab) picks the starting camera, and The Oracle starts in first person. The wheel zooms about exactly what the pointer is over (no more slipping off it) down to under half a square away, the follow camera to 2.5 and first person further; dragging orbits about the point under the pointer instead of a far-off target.
- **What this browser can do, shown**: the Graphics pane's "This browser" lists what was detected (browser, system, graphics adapter, `shader-f16`, JSPI, threads, buffer limits) and what runs here; it is also `window.tablefolkBrowser` (`app/browser-check.js`). Safari 26 and other WebGPU browsers without JSPI get one short toast after the world loads (once per version): voices in the browser and Qwen on the GPU need Safari 27, Chrome/Edge 137 or Firefox 153. Breeze in the browser says which of JSPI or `shader-f16` is missing, and checks both before its download. The no-WebGPU screen names the browsers that work and what it detected.
- **Light graphics are the default**, and no quality builds the detailed ocean any more: every setting has the simple sea and sky. The speech button at the top no longer shows 🔇 at startup while speech is on.
- **Library voices in Breeze in the browser use natively encoded codes** (`assets/voices/breeze-codes`, `tools/breeze-web/build-voice-codes.mjs`): no encoding step, and closer to native. Its speed figure now leaves out the wait before audio starts, which had added seconds of silence before each line.
- **Cloned voices work in the browser**: Breeze in the browser garbled library voices (wrong words, shifting speakers, lines far too long or cut short) because of a bug in ggml's WebGPU `sum_rows` on long reference clips. In a blind listening test they now rate about the same as native. References are also resampled properly now.

## 2026-11-06

- **Breeze in the browser reaches real time on an RTX 2060**: it was remaking thousands of GPU objects for every 80 ms of audio; ggml's WebGPU backend now keeps them (`tools/breeze-web/ggml-webgpu-fast.patch`, 0.70x to 1.0-1.1x alone). In the game the picture drops to 15 fps while it speaks (Graphics pane), which took it from under 0.38x to about 1.0x after the first sound, with no stutter.
- **Characters can speak only when spoken to** (`onlySpokenTo`, for a world or a character; on by default in simple mode), which stops The Oracle's unprompted "As an AI language model...". The world builder's Story tab also has the director switch now.
- **The Oracle runs on Qwen1.5 0.5B**, the older model behind the "10 + 10 = 11" screenshots, at chaos 30. It joins the model menu and the world builder's default brain list.
- **A wllama model falls back to the CPU** when the graphics card can't hold it, instead of failing to load.
- **Chaos counts from each model's recommended settings**: 0 and 1 (the default) are the makers' settings, and higher values open up temperature, top-p and top-k from there, on Gemma, LFM3 and MiniCPM too (they used to ignore it). Qwen now starts from its recommended 0.7. A rougher Qwen 0.5B Q2_K is available with `?model=qwen2.5-0.5b-q2`.
- **A reload opens a scenario file's latest version**: with `?scenario=` in the address, the file now wins over the `#s=` copy the page writes beside it; before, a reload replayed the old copy and ignored changes to the file. Worlds picked from the Worlds screen keep their file in the address too.
- **A world can skip its intro card** (`showIntro: false`, also on the world builder's Story tab), as The Oracle now does; `?intro=0` or `?intro=1` on a link overrides it.
- **The wizard's face is corrected in the model**: it came with empty eye sockets and a flat slab of a nose; `wizard.glb` now has eyes and a nose with a ridge and a tip (`tools/fix-wizard-face.mjs`).
- **A DEV button on the left rail** switches developer mode on and off at once, with no reload, and remembers it.
- **The chaos slider**: its number now follows the character shown (it stayed at the old value), and it works smoothly: 0 to 100 is temperature 0.3 to 1.2, instead of three steps.
- **The download question no longer appears twice** when a link opens a world: it waits until you press start on the intro card.
- **The Oracle**: a new world where a very pompous man answers everything on a 490 MB brain ("The capital of the moon is Ia Cardaminaca"). Ask him anything.
- **Qwen2.5 0.5B as a brain**: the newest official 0.5B Qwen, Q4_K_M GGUF on wllama, every layer on WebGPU; 1-2 s a reply on an RTX 2060.
- **Simple mode for very small models**: a short prompt, and whatever the model writes is spoken. On by itself for Qwen 0.5B; `simple` in a scenario or on a character, `?simple=` on a link.
- **A world can name its default brain** (`defaultModel`, in the link and on the world builder's Story tab); it asks before downloading and doesn't replace the player's own choice. **A full system prompt can replace the built one** (`systemPrompt`, for a world or a character, with `{name}`-style fillers).

## 2026-11-01

- **Window view responds to leaning in**: the glass now stands in front of the board, so moving your head slides the whole board behind the frame, and leaning in (or back) visibly changes the view: by default it brings the board closer; the Graphics pane's "leaning in" can make it show more instead, as a real window does. Ambient occlusion is off while the view runs (it drew black blocks under the skewed lens).
- **A silent microphone is no longer sent**: Bark hears "Yeah" in silence, so a recording whose peak stays under 0.015 (or with almost nothing above -40 dBFS) gives a message instead; the console logs each clip's length and level, the tooltip the peak, and `tablefolkSpeech.playLast()` plays back what the microphone recorded.
- **Window view feels like a window**: the head now moves the eye behind a fixed screen (an off-axis projection) instead of turning the camera around its target, so the ground stays put while things standing on it slide, and leaning in widens the view rather than magnifying it. A One Euro filter and the face box (not only the eye points) steady the tracking; the effect is stronger (`tablefolkHeadWindow.strength`, default 2.4) and works with the follow camera too.
- **The wheel zooms towards the pointer** in the free camera, not towards the screen's centre (the selected character).
- **The 🎤 button names its recogniser** (Bark GPU or CPU, Chrome on-device or cloud, Gemma, the llama.cpp model) in every mode, with the last transcription's time in its tooltip; a fallback says so in a toast.
- **Breeze starts by itself**: once installed with `tools/breeze-server.sh`, the Tablefolk server starts breeze-server when the page wants it and stops it after 30 idle minutes (`--no-breeze` turns that off). Automatic picks Breeze when its graphics memory (2.1 GB for the local build) fits beside the chat model and it measured faster than 0.9x real time here; every voice engine's measured speed now sets how much audio is held before a line plays, so a slow engine waits instead of stuttering.

- **Speech input in the browser by default**: the 🎤 button uses Underdog Bark 3.0 (Parakeet-TDT 0.6B) in the page unless the player declines its download, which is asked before recording now. 1.3% word errors on LibriSpeech (1.8% through a laptop-mic filter), 0.4 s a sentence on the graphics card, 1.2 s on the processor; Gemma 4 E2B's audio input made 4.0% at ten times the time. It runs on the processor (int8, no graphics memory) when the card has less than 1.5 GB left beside the chat model. The setting moved to the Voice pane. Fixed: transcription through the server's Gemma always failed (a WAV header bug). When the graphics card is full (other programs on it), the first WebGPU error moves Bark to the processor. Two more choices: the browser's recognition now runs on the device in Chrome when it can (Google's language pack, about 300 MB, installed on the first click; 3.6% word errors), and llama.cpp with LFM3-Omni-2B (`tools/llama-server.sh --omni`), one model that both plays the characters and hears the player (1.6%, 0.7 s).
- **Characters use things**: `use(thing)` opens and closes chests, sits on benches, stools and chairs, lies down on beds to rest, hammers at an anvil, works at a workbench, stirs a cauldron, chops a tree (firewood), breaks stone off a boulder, drinks from a well, reads at a lectern, practises on a dummy, takes an apple from a barrel; `take(item, chest)` and `put(item, chest)` take from and store in an open chest, which keeps what it holds (the player finds a ring a character put away). Sitting and lying last through talk; anything else gets the character up beside the seat. A tired character is told to use a bed nearby. The player does the same with E (E on an open, empty chest closes it). Offered in the "you could, right here" menu only with such a thing close by.
- **Routines in a living world**: idle turns use the things around: at night (the `night` lighting) characters go to bed in a bed nearby and get up by day; a smith works at the anvil, a cook at the cauldron, a scholar at the lectern, a guard at the dummy (by role, look or personality); others sit on a bench now and then.
- **The Meshy people and monsters carry 42 more clips**: KayKit's CC0 animation library retargeted onto their skeletons (`tools/retarget-people.sh`): sitting on chairs and the floor, lying down, chopping, hammering, sawing, digging, picking up, running, waving, cheering, casting, bow and melee moves. Running and waving no longer fall back to walking and idle. About 100 KB more per model.
- **Chests, anvils and cauldrons stay put**: they are static now (too heavy to carry anyway); a character walking through one could fling it across the map.

## 2026-10-31

- **Thinking characters get 4096 tokens to think** (was 1024) and are told to keep it short; tool calls in a model's own format (`<tool_call><function=say>...`, or JSON) now run as commands. Measured on LFM3-1.7B: thinking gives the same micro-eval score (9/10) at 16-32 s a turn against 0.6-4 s without, so it stays off by default.
- **Find helpers on this computer**: one button (Voice pane, endpoint panel) finds breeze-server and llama.cpp running on your own machine, also from tablefolk.world (the browser asks once for local network access), and offers llama.cpp as the brain.
- **First person inside a building keeps its roof as the ceiling** (it faded away as it does for the overhead view, leaving the night sky above). Walk-in houses checked in first person: door, furniture and walls look right at `wallHeight` 2; at 1 the lintel sits at eye level.
- **Confirmation dialogs show above the welcome screen** (they were hidden behind it on a first visit).
- **Launch scripts**: `tools/llama-server.sh` (Linux, macOS; `.command` to double-click on a Mac) and `.ps1` (Windows) fetch llama.cpp and LFM3-1.7B and start them for the endpoint brain; `tools/breeze-server.ps1` does Breeze on Windows (the Windows scripts are untested).
- **Small models no longer speak their planning aloud**: lines like "Say that she's hungry. Then offer food." or "As hector, I should question her" written beside the commands are dropped, as is anything before a stray `</think>`. LFM3-1.7B on llama.cpp: 35/36 in the evals (32 before).
- **Breeze TTS 2 in the browser speaks properly on the GPU**: rebuilt on Breeze-TTS-2.cpp's latest (87b4366, its codec no longer needs our convolution rewrite) with current ggml (v0.28.0; Breeze's bundled one lacks a WebGPU fix: block-quantized weight views at the browser's 256-byte alignment read the wrong blocks, so all but the first of each frame's 15 depth codes came out wrong and the speech was static). Clean speech in Chrome on an RTX 2060 at 0.62x realtime, first sound after 2.8 s, about 3 GB of graphics memory. Chrome on Linux with NVIDIA needs `--enable-dawn-features=vulkan_enable_f16_on_nvidia` for WebGPU's shader-f16; the Voice pane says so. Test page: `tools/browser-test/breeze-web-test.html`.
- **Breeze's text-encoder-on-the-CPU option proposed upstream** as `--te-cpu` ([HoppouAI/Breeze-TTS-2.cpp#17](https://github.com/HoppouAI/Breeze-TTS-2.cpp/pull/17)); checked first that nothing upstream does it (still 914 MiB less on their latest).

## 2026-10-30

- **Lighter light mode**: no shadow maps at all, one pixel per screen point, lighter wall stones and floor tiles, 1024 px critter textures; the critter's walking clip no longer keeps its own textures in any mode. The tavern scene: 281 MB of graphics memory at light (620 at medium), half the vertices.
- **Breeze needs 0.9 GB less graphics memory**: its text encoder runs on the CPU (a small patch on Breeze-TTS-2.cpp v0.1.5, `tools/breeze-server/build.sh`), 2.1 GB instead of 3.0, about half a second more before speech; with both Breeze and Gemma on a 6 GB card the GPU had run out and the speech came out scrambled.
- **Window view (H)**: the webcam follows your head (MediaPipe face tracking in the browser) and the free camera moves with it, like looking into the diorama through a window.
- **Recommended sampling per model** (Gemma 1.0, MiniCPM5 1.0, LFM3 0.1 ...) instead of the game's temperature; the LiteRT models had been running on hidden bundle defaults.
- **Latest libraries**: LiteRT-LM 0.19.0, Transformers.js 4.3.2 everywhere, onnxruntime-web 1.31.1, wllama 3.8.1.
- **Smaller brains on trial** (hidden): MiniCPM5-2B on LiteRT-LM and LFM3-1.7B on WebGPU kernels (runs without shader-f16); evals: Gemma E2B 35/36, LFM3 30/36, MiniCPM5 25/36.
- **Breeze TTS 2 in the browser**: Breeze-TTS-2.cpp compiled to WebAssembly with ggml's WebGPU backend (two codec ops rewritten, bit-identical), the 2.5 GB model downloaded once from R2 into the browser's storage; an opt-in Voice-pane engine. Proven end to end on the CPU; GPU speed still to be measured on a machine whose Chrome offers shader-f16.
- **Breeze TTS 2 as a speech engine**: BreezeBlue's 3B voice model, run by `breeze-server` on your own machine (`tools/breeze-server.sh` fetches it and the 2.46 GB Q4 model), cloning the library voices from their samples and transcripts; chosen by itself when it runs and the graphics card has room, otherwise an option in the Voice pane.
- **The endpoint panel lists the server's models** (`GET /models`) in a picker and as suggestions in the model box.
- **Newer chips in the device check**: RTX Spark (N1X), DGX Spark (GB10) and any Apple M-series by name (M6 and later included), with the smallest memory each ships with.
- **Bonsai 2 27B replaces Bonsai 1.7B** in the model menu: Prism ML's ternary 27B (5.9 GB) on the webml-community WebGPU kernels, for graphics cards with 10 GB or more.
- **The best model for the device**: a first visit starts with the biggest brain the graphics card holds (the card found by name in a table of 1546 cards from onepunk/llmsizer and open-gpu-db), and the menu marks it.
- **Endpoint settings in the top bar**: picking "OpenAI-compatible endpoint" opens a panel for the base URL, API key and model; it starts on "done".
- **Free camera by default**, with every wall at half height so no one hides behind one; first person keeps full walls and a click there no longer walks; the wheel zooms along the view instead of drifting to the last clicked square.
- **Characters face whom they talk to** (named, last speaker, or the player), speak softly up close and louder across a room; a **voice volume slider** sits in the top bar (the old one was overridden by the spatial gain).
- **Hand-overs show**: giver and receiver reach out and the thing (its picture, coins, a parcel) passes between their hands.
- **Calmer idles**: the Meshy people's idle clip keeps 30% of its motion (the head and hips swung about 90 degrees).
- **New villager woman and king** (Meshy): the red-haired villager's limbs were deformed; the king is now an older king in red and gold (the old one is `king_classic`).
- **Voices**: anger samples redone as cold anger (shouted lines cloned squeaky); the tavern keeper and rogue re-recorded for steadier identity (9 and 7-8 of 10); `hooded_x` is male.

## 2026-10-25

- **Voice states are one file each** on R2 (`pocket-tts/states-v6/<voice>[@<mood>].bin`): no index, no bundles; the build tool takes voice ids, so a changed voice means re-uploading 6-7 small files. The old bundles are deleted from the bucket.

- **All 22 library voices acted**, with mood samples; new monster voices (`undead_m`, `dragon_m`) used by default for skeletons, zombies and ghosts, and dragons, giants, trolls, orcs and demons; a `seductive` mood for characters written that way. States in `voices-state-18m-v5-*.bin` on R2 (about 325 MB, a voice starts in about 90 ms).

- **Steadier voice identity**: mood and main samples of a voice share one seed and steadier ElevenLabs settings; Gemini 4 Argon rates "same speaker" 9-10 of 10 across a voice's samples and its clones (the dwarf was 5). States rebuilt (`-v4`).

- **Mood voices** (a test): the five acted voices have a sample per mood; a character speaks in the clone for its strongest feeling (fear whispers, sadness is slow and breathy). The admin page has a button per mood. Anger needs a redo.

- **Acted voice samples**: five voices (breathless young woman, old crone, old wizard, dwarf, sorceress) redesigned with ElevenLabs Voice Design and recorded by Eleven v4 doing three emotions each (Gemini 4 Argon rates them 9-10 for expressiveness, against 5-6 before); samples may run to 16 s; precomputed states rebuilt (`-v2` on R2).

- **Admin "Try it"**: each designed voice has a button that speaks a line you type with the game's own engine (the clone, from the cached or precomputed state), through a hidden frame (`app/voice-try.html`); the page's player still plays the original sample.

- **Voice states are cached**: a cloned voice (the designed library and the Voice pane's own) is processed once per browser; later visits start it in about 100 ms instead of 1.5-1.8 s. The 20 library voices' states are also precomputed on R2, so even a first visit starts in about 100 ms.

- **New people**: six JRPG-style Meshy characters (swordswoman, sorceress with
  a split dress, huntress, village woman, swordsman, wanderer) from concept
  art; `adventurer`, `adventurer_woman`, `witch`, `huntress`, `peasant_woman`,
  `villager` and `woodsman` now use them (the old bodies are `*_classic`).
- **Designed voices**: 20 voices described in text (fal.ai Qwen3-TTS Voice
  Design), cloned by Pocket-TTS; characters get one by gender, the generator
  casts from them (`pack:<id>`).
- **Speech input in the browser**: Underdog Bark 3.0 (Parakeet-TDT, ONNX) on
  onnxruntime-web, chosen in Brain options (`app/asr/`).
- **Models**: Bonsai 1-bit 1.7B (Transformers.js, WebGPU, tested) in the picker
  (the LiteRT-LM Bonsai bundles don't run in the web engine yet: hidden);
  Nemotron 3.5 Bolt E4B registered (hidden until converted and mirrored:
  `tools/convert-litertlm.sh`); endpoint presets for Nemotron (Ollama,
  llama.cpp) and Bonsai.

- **Subworlds and kept models**: `"keep": true` on a walk-in building leaves
  its 3D model standing and makes the inside a separate map, entered by
  stepping on the glowing square in front of the door (and left the same
  way). General `links` and `subworlds` fields (a cellar, a dungeon) use the
  same swap; the left map is kept as a snapshot. The world builder has a
  "keep building models" option (default on) and a per-building box.

- **Walk-in buildings**: `house`, `fantasy_house` and `stable` become walled
  rooms (5x5, 6x5, 7x5) with a door, a floor and standard furniture; things
  placed inside replace the furniture; the world builder draws their walls
  and a ghost of the furniture; `"enter": false` keeps the closed model.
- **Thatched roofs** on the walled rooms of worlds with an outside: courses
  of thatch with a normal map, rolled eaves and ridge, timber-trimmed gables,
  chimneys on some. The roof over the player's room fades; the follow camera
  sees through one in its way; the free camera never peeks. `"roofs"`
  (true/false) now works (it was dropped by `normalizeScenario`).
- **Pacing** of living worlds on real time: each character its own next
  turn (calm 20-36 s), a quiet gap after every spoken line, characters with
  nothing to react to mostly idle without the model, faster for 30 s after
  the player acts and slower after 3 minutes without; director events spaced
  by the pace; a calm / lively / busy select by the live button; `"pace"` in
  a scenario.
- **Notes**: one paper-shaped sheet at three sizes: on the floor, pinned
  upright on a wall (`"wall": "north"`, or written facing a wall, sized to the
  wall), and paper-sized in a hand (no more notes on heads); readable
  writing; no glow.
- Hunger and tiredness grow half as fast; "eats the bread".
- Showcase worlds and the alchemist and Stonebrook examples use
  person-height walls (`wallHeight` 2).
- `/` serves the landing page instead of redirecting to `/app/`.
- Documentation reorganised: the scenario skill split into chapters (also
  the user guide), a maintainer skill (`.claude/skills/tablefolk-dev/`), this
  changelog, `tools/docs.py`, and a VitePress site in `docs/` built from the
  same files.

## 2026-10-24

- **Let them live** (P): everyone acts on their own while the player watches
  or joins in; `"live": true`. **The director**: now and then something
  happens next to a character (a note, coins, a rat, the scenario's own
  `events`, timed turning points).
- **Sight in the browser**: the "Gemma 4 E2B with sight" brain (the full
  multimodal model on the LiteRT-LM nightly) makes `look` send the
  character's own view.
- Characters: a menu of what they could do right here, `carry(name)` walks
  over and picks it up, `dig(north)`, diagonal walks, `walk(name)`, giving
  things and gold to each other (and failing when they don't have it),
  opinions of each other from gifts and blows.
- **Welcome screen** with showcase worlds (goblin bakery, necromancer's job
  interview, goblin builders, dragon tax audit, haunted tavern); the
  download question waits behind it and the intro card.
- **World builder**: a map editor drawn from 2D tiles (drag monsters, people
  and things in, move them, draw walls and doors, lock doors, paint floors,
  undo); tiles rendered from the 3D models (`app/tile-render.js`); separate
  choice of where the model runs (browser, server, cloud) and which model;
  guest rights on the admin page; the generator writes living worlds.
- **Admin page** redesigned (sections, overview, saved toasts).
- **Server for a public launch**: visitors' use of the server AI gated by
  the admin page and rate-limited per address; requests through a proxy or
  tunnel count as visitors.
- Wall cutaway done per pixel in the wall materials; camera buttons beside
  first person; follow camera starts further out.
- No frozen picture while the model sets up (render held, GPU back-pressure);
  `jank.mjs`.
- Generator replies up to 17000 tokens for reasoning models.
- Fixes: plain-string inventories crashed a world; the map editor made
  things into characters; players no longer get a toast for every line;
  the wolf is a big grey rat (broken skinning); landing page pitch.

## 2026-10-23

- **Minds for tiny models**: the game keeps feelings, needs, memories and
  goal turns and puts a short state card in each prompt (`remember()`,
  `eat()`, `goal()` on by default); who takes a model turn and when.
- **Roles** as packages (`roles/*/role.json`), selling as the `trade` skill
  (prices, lowest price, the buyer's agreement); **packages**
  (`tablefolk.json`) with items, skills, roles, workflows and code; the
  **registry** (`registry/index.json`, npm and GitHub search, Library pane).
- **Smart memory**: EmbeddingGemma 2 in the browser, blended with keyword
  recall.
- **Dark dungeons**: fog of war, sight that needs light and line of sight,
  carried torches; characters see only what they could see (line of sight
  all round, 13 squares).
- Combat: one blow a round, loot bodies, talking enemies, locked doors and
  keys; attack animations; weapons follow the hand on more bodies.
- **Meshy monsters** (orc, goblin, skeleton, skeleton warrior, troll,
  skeleton farmer) via fal.ai; `tools/fal-monster.py`,
  `tools/finish-monster.sh`.
- First person: hands, punches, held weapon and torch; swing and hit sounds.
- Small Pocket-TTS engine (18M) with swappable speech engines; TTS on by
  default; the dead say nothing; a talk budget; talk like a real person.
- Shared LLM worker, kept two minutes after the last page; step-by-step world
  building with Gemma in the browser; Diablo-style follow camera with wall
  cutaway.
- Generator and character endpoints: OpenRouter, OpenAI, local or a URL,
  with saved keys; default generator `deepseek/deepseek-v4.1-flash-1017`.
- Give things to characters by dragging from the Adventurer pane; quick map
  tooltips; tabletop zoom and pan.
- Headless tests with the scene drawing (`?gfx=`, `?fps=`,
  `agenttest.mjs --render`); evals; `docs/MINDS.md`, `docs/REQUESTS.md`.

## 2026-10-18

- **Bun server**, an OpenAI-compatible LLM client and the endpoint brain.
- **Procedural dungeons and villages** (`generate`) with characters placed
  by role; doors and double-height walls in generated maps.
- **`/world/<prompt>`**: the scenario generator agent; its loading view.
- Combat (hit points, wield, attack, defeat); senses and speech input; a
  vision option for endpoint brains; JSON workflows; skills from packages,
  npm or GitHub; per-character allowed commands.
- Quaternius characters and monsters; village props; dungeon dressing
  (Fantasy Props MegaKit); realistic Universal-rig figures.
- Play: open chests, pick things up, gold on walk-over, inventory pane, NPC
  turns after yours; door and combat sounds (Kenney, CC0); user / dev mode;
  Messages pane, defeat card.
- **Admin page**; world builder editor with a top-down map; voice
  descriptions.
- **Tabletop view** (`?tabletop=1`): top-down, names, grid, PNG and print,
  move things; ask the AI for changes (`/api/revise`).
- Doors (person-height leaf, wall over the top); flatter stone walls; lava
  lights and flows; water flows one way; `lighting: "dim"`; `wallHeight`.
- LLM characters think and talk without freezing the player; repeated lines
  dropped; friendly characters take turns only while they can see the
  player.

## 2026-10-17

- **Tablefolk** (renamed from geebr.world): living maps with local AI
  characters; history reset.
- Scenarios as `#s=` links; ASCII grid scenarios with lossless export; demo
  scenarios; `scenario_link.py --html`; the scenario agent skill and plugin.
- The board world: sized per scenario in the sea, no built-in island; island
  pieces as objects.
- Chat: pick who you talk to; leaner prompts; earshot, overhearing and
  `whisper()`; plain-text replies are spoken.
- Fast model downloads from four R2 hostnames; GPU memory freed on reload.
- First-person and overview movement fixes.
- Sculpted grass tiles for every cell, real floors (planks, tile, carpet,
  lava, rippling water), natural stone walls, the Stonebrook test village.

## Before October 2026 (v14)

- **v14.6**: speaking animation driven by TTS events (`speechstart` /
  `speechend`, the `talk` clip, a mouth-flap on the head bone); `say()` uses
  Pocket-TTS; speech bubbles at a fixed 42 px above the head; all 8 KayKit
  animation packs; `emote(name)` (dance, laugh, sit, wave, clap, cheer,
  sleep, bow); duplicate root-level files removed.
- **v14.5**: perception panel fixed north-up; hidden cells stay blank.
- **v14.4**: hidden cells render as blank spaces; the perception grid rotated
  with facing (undone in 14.5).
- **v14.3**: facing-aware perception cone; a one-tile awareness bubble; line
  of sight through walls blocked.
- **v14.2**: characters face where they walk; line-of-sight occlusion in the
  perception grid (walls, stone, rubble and buildings block sight).
- **v14.1**: turn-based walking no longer snaps back; an authoritative
  `logicalPos` per character, the Havok collider follows it.
- **v14**: a turn-based command loop for LLM control (one command runs,
  physics settles, the world freezes); tile-by-tile tweened walking instead
  of physics impulses; the public API `window.runCommand`,
  `executeCommand`, `stepTurn`, `endTurn`, `getAgentPerception`.
