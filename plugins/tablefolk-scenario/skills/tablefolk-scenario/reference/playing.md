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
| mouse wheel | zoom along the view: the middle of the screen stays put, and at the closest the free camera moves on that way |
| E | use what is in front of you: open a chest, pick up, read a note, search a body, open a locked door with its key, talk |
| F | attack the nearest foe |
| V | first person (your hands show the weapon and torch) |
| C | follow camera / free camera |
| P | let them live (everyone acts on their own) / pause |
| I | the Adventurer pane |
| Enter | chat |
| \ | open / close the side panel |
| Esc | close the panel or a dialog |

Chat commands: `/attack grub`, `/wield sword`, `/cast heal me`, `/steal
rook` (skills). The 🎤 button talks by voice (`app/speech-input.js`: the
server's Gemma when it runs `litert-lm serve`, else the browser's speech
recognition).

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
| OpenAI-compatible endpoint | any server: this Tablefolk server's proxy (default), OpenRouter, OpenAI, `litert-lm serve`, llama.cpp, Ollama. Picking it opens a panel under the top bar (base URL, API key, model, presets; the ⚙ endpoint button reopens it); "done" starts it. Vision sends pictures |

Hidden test engines (MiniCPM, Transformers.js) are listed in
`app/llm_js/agent-brain.js`. One model runs for all characters, in one shared
worker that stays loaded two minutes after the last tab closes, so a reload
is fast.

## Voices

Speech is on by default (unless the player turned it off). Engines (Voice
pane; the server's admin page sets the default): Pocket-TTS small (18M
parameters, about 40 MB, English) and the 100M one (about 120 MB, five
languages). Voices are placed in space. The slider beside the speaker
button in the top bar (and the Voice pane) sets their volume. The Voice pane
can clone a voice from a sample.

## Graphics

The Graphics pane sets quality, shadows, the sea and "smart memory" (the
embedding model). URL flags for weak machines and testing:

| flag | effect |
|---|---|
| `?gfx=light\|medium\|high` | quality for this page (shadows and moving sea off below high) |
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
