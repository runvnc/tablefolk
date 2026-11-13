# Playing: the app, controls, brains and voices

The app is `/app/` (`app/index.html`). It needs WebGPU (see "Browsers"
below; desktop Chrome or Edge works best). Opened without a scenario it shows the welcome screen (a few worlds
and "build your own"); the "worlds" button brings it back.

## Browsers

Everything runs in Chrome or Edge 137 or newer, Safari 27 or newer, and
Firefox 153 or newer on Windows or an Apple Silicon Mac. The 3D world and the
characters need only WebGPU (Safari 26 has it; Firefox has none yet on Linux,
Android or Intel Macs). Two things need more:

| needs | for | without it |
|---|---|---|
| WebGPU | the 3D world, the characters (Gemma) | the page stops at a screen that says which browsers work and what it detected |
| JSPI (`WebAssembly.Suspending`): Chrome/Edge 137, Safari 27, Firefox 153 | Breeze in the browser; Qwen and other wllama models on the GPU | Breeze in the browser is greyed out with the reason; Qwen runs on the CPU |
| WebGPU `shader-f16` (the graphics card) | Breeze in the browser; speech input on the GPU | Breeze is greyed out; speech input runs on the CPU |

The Graphics pane's **This browser** section shows what was detected (browser,
operating system, graphics adapter, `shader-f16`, JSPI, threads, buffer
limits, memory), with ✓/✗ and what each enables, and lists what runs here.
A browser with WebGPU but no JSPI (Safari 26, older Chrome or Firefox) gets
one short toast after the world has loaded, once per browser version, with a
"details" button to that section; start-up is never held up. Scripts and
tests read the same values from `window.tablefolkBrowser`.

## First visit

The first time a character speaks, the page asks before downloading the
model, cached in the browser afterwards. A first visit starts with the best
model the graphics card holds (`libs/device/index.js`: the card is found by
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
| mouse wheel | zoom towards what the pointer is over, close enough to read a face (the follow camera zooms on you; in first person it narrows the view towards what the pointer is on: point and scroll, no dragging) |
| drag | turn the free camera about what the pointer is over when you start dragging (right-drag slides it); in the follow camera, turn the view around you (it keeps that angle while it follows you) |
| E | use what is in front of you: open a chest (take everything; E on an open, empty one closes it), sit on a seat, lie on a bed, hammer at an anvil, chop a tree, pick up, read a note, search a body, open a locked door with its key, talk |
| F | attack the nearest foe |
| C | camera: the free camera, the follow camera and first person in turn (in first person your hands show the weapon and torch) |
| V | first person and back (C reaches it too) |
| H | window view: the webcam follows your head and the screen becomes a window onto the board: move your head and the board slides behind the frame; lean in to bring it closer (or, with the Graphics pane's "leaning in", to see more as through a real window) (face tracking in the browser; a small preview shows while it runs; hold still for half a second at the start) |
| P | let them live (everyone acts on their own) / pause |
| I | the Adventurer pane |
| Enter | chat |
| \ | open / close the side panel |
| Esc | close the panel or a dialog |

Chat commands: `/attack grub`, `/wield sword`, `/cast heal me`, `/steal
rook` (skills). The 🎤 button is hold-to-talk: hold it down (mouse, finger, or
Space on the focused button) while you speak and let go to send; the words
go like typed chat (a tap under a third of a second is dropped with a hint). On a phone or tablet the
browser's own recognition is the default (and the voice is Pocket-TTS:
Breeze is too heavy there). Elsewhere, by default the speech is turned into
text in the browser by Underdog Bark 3.0 (English; asked once before its
download of 0.9-1.3 GB; nothing leaves the computer). Once approved it loads
by itself after the characters' model on later visits; while it loads the 🎤
is greyed out and shows its progress, so a press never waits on it. It runs on the graphics
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
zooms freely and stays where you put it; every wall stands at half height
there, so no one is hidden behind one. The follow camera (C from the free
camera) starts as a high Diablo-style view behind the player and stays
centred on you; drag to turn it around you (from any side, tilted within the
free camera's limits) and it keeps that angle as you walk. Seen from behind,
walls between it and the player drop to a stub; turned elsewhere, every wall
stands at half height; a roof in the way turns see-through. C from first
person goes to the free camera. First person (C from the follow camera, or V)
looks through the avatar's eyes, with walls at full height. A world can start
in any of them (`"view"`: `overview`, `follow` or `first`); a door into a
subworld and back keeps the view you had.

**Giving.** Drag an item (or the gold) from the Adventurer pane onto a
character close by, or press its "give" button (the nearest one). The
character gets it and is told. Every hand-over shows: the two face each
other, the giver reaches out with the thing (its picture, coins for gold, a
little parcel for anything else) and it passes into the other's hand.

**Talking.** A character turns to whoever it speaks to: someone near it names,
else whoever spoke to it last, else the player when close. The listener turns
back. It speaks softly to someone beside it and louder across a room.

## Panes and modes

User mode (the default) keeps the screen for the world. The left rail has
two icons: **Adventurer** (`I`: health, gold, wielded weapon, goal, items
with give / drink / read / wield / drop, then the view buttons, pace and
"let them live", then the controls) and **Settings** (your chat name;
**Running now**: the characters' model, the voice, the speech input and the
graphics, each with its state and why it was chosen; **Characters' brain online**: sign in with OpenRouter (or paste an OpenRouter key) and the characters think there, on your own account, when this device can't run their model or you want a bigger one; offered by itself when the model fails to load; links to the **Voice**
and **Graphics** panes, **This device** and **Messages**; and the switch to
developer mode). **This device** shows what was detected (the graphics card
and its memory, what is left beside the characters' model, the browser's
abilities, storage), what runs now, and every choice of model and every
fallback with its time; "copy this report" puts it on the clipboard. The chat box at the bottom right is just the
conversation: the messages button (the last 300 lines), the message, the 🎤
and send. The "to:" picker shows only when there is more than one character
to talk to (the box says who listens: "Talk to Oracle…"), and a slim health
bar only while you are hurt. All the keys work as before.

**Downloads on screen.** While Breeze TTS 2 (the voice) or Underdog Bark
(speech input) downloads or loads, a small card under the top bar on the
right shows what it is doing with a progress bar; it says "ready" for a few
seconds and goes (an error stays a little longer; click to dismiss). The
Voice pane has the details.

**Speech bubbles.** A line shows in full up to 256 characters, wrapped. A
voiced line's bubble stays until its voice has finished (it waits its turn
while others speak); an unvoiced one stays for a reading time by its length.
**What they said before**: for 45 seconds after a character speaks, a small
💬 floats over its head (hovering the character shows it again later).
Hover the 💬 itself and a card above its head lists its last lines (newest at the bottom, with how long ago, and
▶ to hear one again); tap the 💬 to keep the card open (tap again, Esc or a
click elsewhere closes it). The messages button has the whole conversation.
Breeze in the browser shares the graphics card with the picture, so the picture drops to 15 fps while it speaks (Graphics pane, "While Breeze speaks").

**Dev mode** (Settings → "Turn on developer mode", or `?dev=1`, remembered in the browser; the DEV button on the rail turns it off again, as does `?dev=0`;
`?play=1` shows user mode for that page only) puts every pane on the rail
(Messages, World, Character, Scenario, Library, Voice, Graphics, Debug) and
adds the brain loop buttons, turn controls and the command box; the chat
box keeps the chat name, gold, pace, view buttons and controls line as
before.

## Brains (the model menu)

| choice | what |
|---|---|
| Gemma 4 E2B (LiteRT-LM) | the default, ~2 GB, in the browser on WebGPU |
| Gemma 4 E4B | larger (~3 GB), better at following rules |
| Gemma 4 E2B with sight | the full multimodal model (~2.6 GB, needs a 6 GB graphics card): characters see when they `look` |
| Bonsai 2 27B | Prism ML's ternary 27B (~5.9 GB), much smarter; needs a 10 GB+ graphics card (or an Apple Pro/Max chip); runs on the webml-community WebGPU kernels |
| Qwen1.5 0.5B | the older 0.5B chat model (Q4_0 GGUF, ~395 MB, on wllama) people laugh at: "10 + 10 = 11", "The Earth has 46,942 moons". Simple mode by default; The Oracle runs on it. If the graphics card is too full it loads on the CPU, about 3x slower |
| Qwen2.5 0.5B | Alibaba's smallest chat model (Q4_K_M GGUF, ~490 MB, on wllama), about 50 tokens a second: gets facts wrong with confidence. Simple mode by default (see "Very small brains" in [characters.md](characters.md)) |
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
first), on the graphics card through WebGPU (it needs JSPI (see "Browsers") and the `shader-f16`
feature, which Chrome on Linux with NVIDIA hides unless it is started with
`--enable-dawn-features=vulkan_enable_f16_on_nvidia`; without either the option is greyed
out and says which is missing, and the worker checks both before the download; about 0.6x realtime on an RTX 2060, so best on bigger cards). **Find helpers on this computer** (a button in the Voice pane and in the
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
embedding model). Light is the default; every quality uses the simple sea and
sky (the detailed ocean and island only come with `?island=1`). The 🔊/🔇
button at the top turns speech on and off; its tooltip names the voice in
use. The voice is the one picked in the Voice pane, else Breeze running on
this computer, else **Breeze TTS 2 in the browser** when it was downloaded
and the graphics card has room beside the characters' model (3.5 GB), else
the site's default (Pocket-TTS). When Breeze would fit but isn't downloaded,
the game offers it once (twice at most) after the characters' model is
ready, also from Settings; it downloads (2.5 GB) and starts in the
background while the current voice keeps talking, then takes over. The ⏺ button beside it records a video of the 3D view with
the voices and sound effects (about 30 fps; MP4 with H.264, or WebM where
MP4 isn't available); click it again to stop, and the file downloads. Panels
and the chat box are not in the picture. The Debug pane's APNG recorder is
the older debugging one (4 fps, no sound, the world's state inside the file). URL flags for weak machines and
testing:

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
