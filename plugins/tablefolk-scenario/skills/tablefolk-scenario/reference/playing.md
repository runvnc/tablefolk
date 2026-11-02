# Playing: the app, controls, brains and voices

The app is `/app/` (`app/index.html`). It needs desktop Chrome or Edge with
WebGPU. Opened without a scenario it shows the welcome screen (a few worlds
and "build your own"); the "worlds" button brings it back.

## First visit

The first time a character speaks, the page asks before downloading the
model, cached in the browser afterwards. A first visit starts with the best
model the graphics card holds (`app/llm_js/hardware.js`: the card is found by
name and its memory looked up in a table, since browsers never report free
memory): Gemma 4 E2B (about 2 GB) below 6 GB, E4B from 6 GB, Bonsai 2 27B from
10 GB. The menu marks that one "best fit for this device"; a model the player
picked is kept. The
question waits behind the welcome screen and the world's intro card. Never
approve the download on a user's behalf.

## Controls

| key | does |
|---|---|
| W A S D / arrows | move (in first person: W/S walk where you look, A/D turn) |
| click the ground | walk there (not in first person: there only the keys walk) |
| mouse wheel | zoom towards what the pointer is over (the follow camera zooms on you); at the closest the free camera moves on that way |
| E | use what is in front of you: open a chest (take everything; E on an open, empty one closes it), sit on a seat, lie on a bed, hammer at an anvil, chop a tree, pick up, read a note, search a body, open a locked door with its key, talk |
| F | attack the nearest foe |
| V | first person (your hands show the weapon and torch) |
| C | follow camera / free camera |
| H | window view: the webcam follows your head and the screen becomes a window onto the board: move your head and you see around things, lean in to see more (face tracking in the browser; a small preview shows while it runs; hold still for half a second at the start) |
| P | let them live (everyone acts on their own) / pause |
| I | the Adventurer pane |
| Enter | chat |
| \ | open / close the side panel |
| Esc | close the panel or a dialog |

Chat commands: `/attack grub`, `/wield sword`, `/cast heal me`, `/steal
rook` (skills). The 🎤 button talks by voice: click, speak, click again;
the words are sent like typed chat. By default the speech is turned into
text in the browser by Underdog Bark 3.0 (English; asked once before its
download of 0.9-1.3 GB; nothing leaves the computer). It runs on the graphics
card when there is room beside the characters' model, else on the processor
(about a second a sentence). The button names the recogniser it is using
(Bark GPU, Bark CPU, Chrome on-device, Chrome cloud, Gemma, or the llama.cpp
model), and its tooltip how long the last one took. The Voice pane's "Speech input" can pick the
processor, the server's Gemma (`litert-lm serve`), llama.cpp with a model
that hears (`tools/llama-server.sh --omni`), or the browser's own
recognition: Chrome's on-device one when it has it (it installs a language
pack of about 300 MB on the first click), else its makers' servers. When the
player declines Bark's download, Automatic takes the next of these that
answers.

**Cameras.** The free camera (the default with an avatar) orbits (drag) and
zooms freely and eases after the player; every wall stands at half height
there, so no one is hidden behind one. The follow camera (C) is a high,
fixed Diablo-style view behind the player; walls between it and the player
drop to a stub, and a roof in the way turns see-through. First person (V)
looks through the avatar's eyes, with walls at full height.

**Giving.** Drag an item (or the gold) from the Adventurer pane onto a
character close by, or press its "give" button (the nearest one). The
character gets it and is told. Every hand-over shows: the two face each
other, the giver reaches out with the thing (its picture, coins for gold, a
little parcel for anything else) and it passes into the other's hand.

**Talking.** A character turns to whoever it speaks to: someone near it names,
else whoever spoke to it last, else the player when close. The listener turns
back. It speaks softly to someone beside it and louder across a room.

## Panes and modes

User mode (the default) shows the player's panes: **Adventurer** (health,
gold, wielded weapon, goal, items with give / drink / read / wield / drop,
controls), **Messages** (the last 300 lines), **Voice** and **Graphics**.
**Dev mode** (`?dev=1`, remembered in the browser; `?dev=0` turns it off,
`?play=1` shows user mode for that page only) adds World, Character,
Scenario, Library and Debug, the brain loop buttons, turn controls and the
command box.

## Brains (the model menu)

| choice | what |
|---|---|
| Gemma 4 E2B (LiteRT-LM) | the default, ~2 GB, in the browser on WebGPU |
| Gemma 4 E4B | larger (~3 GB), better at following rules |
| Gemma 4 E2B with sight | the full multimodal model (~2.6 GB, needs a 6 GB graphics card): characters see when they `look` |
| Bonsai 2 27B | Prism ML's ternary 27B (~5.9 GB), much smarter; needs a 10 GB+ graphics card (or an Apple Pro/Max chip); runs on the webml-community WebGPU kernels |
| OpenAI-compatible endpoint | any server: this Tablefolk server's proxy (default), OpenRouter, OpenAI, `litert-lm serve`, llama.cpp (`tools/llama-server.sh`, `.ps1` on Windows, `.command` on a Mac: LFM3-1.7B on http://127.0.0.1:8080/v1, about 1.3 GB of graphics memory; `--omni` (`-Omni` on Windows) runs LFM3-Omni-2B instead, which also hears, so the 🎤 button can use it), Ollama. Picking it opens a panel under the top bar (base URL, API key, model, presets; the ⚙ endpoint button reopens it), which lists the server's models (`GET /models`) in a picker and as suggestions while typing; "done" starts it. Vision sends pictures |

Hidden test engines (MiniCPM, Transformers.js) are listed in
`app/llm_js/agent-brain.js`. One model runs for all characters, in one shared
worker that stays loaded two minutes after the last tab closes, so a reload
is fast.

## Voices

Speech is on by default (unless the player turned it off). Engines (Voice
pane; the server's admin page sets the default): Pocket-TTS small (18M
parameters, about 40 MB, English) and the 100M one (about 120 MB, five
languages), and **Breeze TTS 2** (3B, much more natural and acted; it runs
outside the browser in `breeze-server` on your own computer, about 3 GB of
graphics memory: install it once with `tools/breeze-server.sh` (Windows:
`tools/breeze-server.ps1`; no Mac build yet); after that the Tablefolk
server starts it by itself when it is wanted and stops it after half an
hour of quiet. It is picked by itself when the card has room beside the
chat model and it speaks faster than real time on this computer; or pick it
under Engine. Its weights are for non-commercial use). **Breeze TTS 2 in this
browser** is the same model with no server: a 2.5 GB download once (asked
first), on the graphics card through WebGPU (it needs the `shader-f16`
feature, which Chrome on Linux with NVIDIA hides unless it is started with
`--enable-dawn-features=vulkan_enable_f16_on_nvidia`; the option is greyed
out without it; about 0.6x realtime on an RTX 2060, so best on bigger cards). **Find helpers on this computer** (a button in the Voice pane and in the
endpoint panel) looks for breeze-server (port 8137) and llama.cpp (port 8080)
on the player's own machine, which works from tablefolk.world too: the
browser asks once to allow local network access. Breeze found is used
directly when this server cannot reach it; llama.cpp found offers itself as
the brain (the LFM3 preset). After the first time it looks again quietly
on each visit. Voices are placed in space. The slider beside the speaker
button in the top bar (and the Voice pane) sets their volume. The Voice pane
can clone a voice from a sample.

## Graphics

The Graphics pane sets quality, shadows, the sea and "smart memory" (the
embedding model). URL flags for weak machines and testing:

| flag | effect |
|---|---|
| `?gfx=light\|medium\|high` | quality for this page (shadows and moving sea off below high). Light is for small graphics cards: the simple island, no shadow maps or post effects, one pixel per screen point, lighter wall stones and floor tiles, 1024 px character textures (about 280 MB of graphics memory for the tavern scene, against 620 MB at medium) |
| `?fps=N` | cap the frame rate |
| `?norender=1` | no 3D drawing at all (the model gets the GPU) |
| `?art=1` | no model, no voices, no intro card: art review |
| `?nofog=1` | no fog of war |
| `?webgl=1` | WebGL2 instead of WebGPU |
| `?tabletop=1` | the top-down tabletop view ([world-builder.md](world-builder.md)) |
| `?assets=<url>` | load assets (the core pack) from elsewhere |
| `?trustSkills=1` | run skill and package code from anywhere |
| `?embed=wasm` | smart memory on the CPU |
| `?nowelcome` | skip the welcome screen |
| `?island=1` | the old fixed HD island |

## Tabletop view

`/app/?tabletop=1#s=...`: the board from straight above for a tabletop
role-playing game, printed or shown on a screen laid flat. Name labels, a
square grid, a list to show or hide each character (a game master can keep
monsters hidden), save PNG (100/150/300 px a square), print at one inch per
square (tiled over pages) or fitted to one page, full screen. Wheel zooms
about the pointer, drag pans, double-click / 0 / "fit" fits, +/- and arrows.
In edit mode drag things to move them, R turns, Delete removes; "use this
layout" sends the fixed layout back to the world builder (`app/tabletop.js`).
