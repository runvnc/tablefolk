# The world builder (`/world/`)

A page on the Tablefolk server that writes a whole scenario from a prompt,
then lets you edit it by hand or by asking the AI, and play it.

```
http://localhost:8000/world/a+small+dungeon+with+a+sorceress+and+goblins
```

## Writing a world

A built-in agent runs a condensed scenario skill (`server/fast-skill.md`) in
one pass, plus one repair round if the server's checks fail
(`server/generate.js`). Map methods: `?mode=generate` (procedural dungeon or
village, characters put in rooms by role), `?mode=grid` (ASCII map),
`?mode=map` (layout lines), or the default `auto`.

**What it makes**: unless the request is a talk-only scene (an interview, a
trial, a conversation, a date, "no combat": then `"talk": true` and one room
drawn as a grid, sized to the cast; a model that builds more is cut back to
that one room), a living world: a **place** (a generated village, farm, forest, cave
or dungeon with several buildings or rooms), **people with work** (each with
a `job`, a `home` and a `workplace` the map has), a **pressure** (threats on
the clock, low stores, a deadline, a rival) and a **goal** tied to it that
the game checks (`survived_days`, `stock_at_least`, `threat_defeated`,
`agents_alive`: [goals.md](goals.md)). The model is offered archetypes by
name (working village, frontier outpost under raids, dungeon delve with a
camp at the entrance, wilderness camp, mining camp, market town with bandits
on the road, farmstead, haunted manor or mystery); the request always wins.
Each person gets one want, one opinion of a neighbour, maybe a secret or an
agenda. Then the server's checks make it true rather than hope: a missing job
is inferred from the role, a workplace and a home are picked from the map,
the job's station (anvil, cauldron, trees, rocks, a field), a store, a bed
per resident and food are added where missing and where they can be reached,
a world with no pressure gets a mild threat (wolves at night), a goal it can
check, and what fighters and sellers must be allowed. Each repair is listed
(`repairs` in the answer and the saved generation). Every path (cloud, your
own key, in this browser) goes through the same checks. Walls are
double-height.

**Where the model runs** (the form's menus; `GET /api/worldgen/options`):

- *in this browser*: Gemma 4 E4B (about 3 GB), E2B (2 GB, quicker, simpler
  worlds), Bonsai 2 9B (1.9 GB, fast, a 6 GB+ graphics card), Gemma 4 12B
  (5.6 GB) or Bonsai 2 27B (6 GB, the smartest; both 10 GB+ cards),
  downloaded the first time and kept (the game uses the same copy). **How**:
  *step by step* (the default, for every model) or *whole world at once*
  (`?oneanswer=1`: the generator's whole guide in one prompt and the world as
  one JSON answer, checked and fixed up to twice; for Bonsai 2 and Gemma 4
  12B). **Think first** (`?think=1`, off by default): the model reasons
  before each answer; slower, better plans (Bonsai 2 9B gains the most).
  **Size** (every way of building; `?size=large|huge`): a generated map
  made bigger (large 51 by 39, huge 63 by 49; normal leaves it to the
  model). The map editor's generate panel takes any `[cols, rows]`.
  **World** (`?sections=2..5&shape=levels|region|auto`; on this server
  and in the browser): one map, or a world **in sections**: several maps
  joined by links ([things.md](things.md#sections-worlds-bigger-than-one-map-subworlds-links)).
  **Shape**: *levels* (dungeon levels joined by stairs), *a region* (a hub
  such as a village with the forest, farmland or cave around it, joined by
  edges) or *let the builder decide*. The model plans the whole world
  first, then each section is built as its own map; progress names the
  section being built, and **■ Stop** on the progress card ends the build.
  With your own key the builder makes one map for now (a note says so).
  Step by step writes it in small steps
  (`app/worldgen-browser.js`): a plan (text), the map (a little JSON; code
  builds it with `procgen.js`, or layout lines outdoors), a review of the map
  that was built (its rooms and contents as text; it may add things), the
  characters, then the server's checks (`POST /api/finish`) with up to two
  fix rounds. 20-45 s with E2B on an RTX 2060.
  `tools/browser-test/worldgen-test.html?prompt=...` runs it on its own.
- *your own key*: your OpenRouter account (the **Sign in with OpenRouter**
  button makes a key for this site and brings you back; or paste one from
  openrouter.ai/keys), or the address of an AI server you already run (any
  OpenAI-compatible one; the address ends in `/v1`). Your browser calls
  it directly and the key is kept only in this browser; the server only
  hands out the same prompt its own model would get and checks the answer.
  A server on your own computer must allow the page's requests (CORS); the
  browser may ask to reach the local network. Type any model the provider has (presets for OpenRouter); a
  reasoning model like DeepSeek V4.1 Flash writes the best worlds. Tick
  "also for the characters when I play" to have the game's characters use
  the same key (with Gemma 4 26B, quick and cheap). The game's Brain options
  have OpenRouter presets that use this key too.
- *on this server*: a local model the server's operator runs beside it
  (`litert-lm serve`, Gemma 4 E4B; ~22 s on an RTX 2060), when there is one.
- *cloud*: the generator endpoint (OpenRouter by default, model
  `deepseek/deepseek-v4.1-flash-1017`; `gpt-6-luna` on OpenAI takes 6-14 s).
  Replies may run to 17000 tokens for models that think at length.

An admin can use all of them and type any model; guests get what the admin
page allows, and the server refuses the rest. A server run with "visitors
bring their own model" (admin page, `BYO_MODEL=1` or `--byo-model`) offers
visitors only *in this browser* and *your own key*, and its characters'
brain is closed to them too: nobody spends the owner's credit. Other URL options: `?model=`,
`?endpoint=local`, `?art=1` and `?brain=endpoint` (passed on to the app),
`?go` (open the world as soon as it is ready), `?view=builder|loading`.

The page shows the model's thoughts and a token count while it works. With
`--world-loading` (or `WORLD_VIEW=loading`) players see a plain loading screen
with a progress bar instead: it never slows down, laps and restarts with a new
status line, and jumps ahead as tokens arrive. Every result is saved in
`generated/` (git-ignored). `/api/generate?prompt=...` returns the JSON
(`&stream=1` for progress events).

The **Story** tab edits living (`live`), the start time, the day length,
the temper, who monsters hunt, talk-only, and the threats (kind, body,
count, when, every); the **Characters** tab each one's job (a list of the
jobs), home, workplace and temper.

## The workspace

When a world is ready the builder stays on the page (`app/builder.js`):

- **Map editor** (`app/map-editor.js`): the board drawn from 2D tiles on a
  canvas (no 3D, so it is instant even for big maps). Drag monsters, people
  and things from the palette onto the map (or pick one and click), drag
  them around, select one to change it on the right (name, body, hostile or
  talking, hit points, weapon, gold, items, brief; a chest's gold and items,
  a note's text). Select (V), draw walls (W, drag; on a wall it removes),
  make doors and lock them with a named key (D), paint floors (G), erase
  (X); R turns the selected thing, Delete removes it, Esc deselects; undo and
  redo (Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y); wheel or +/- to zoom, drag the
  floor (or hold space) to pan, F to fit. Hover shows a tooltip. Walk-in buildings show their walls,
  door, floor and a ghost of their standard furniture, so things can be
  placed inside ([things.md](things.md)).
- **Sections**: the bar over the map picks the map being edited: the top
  map, each section and the sections inside them (a kept building's inside
  is one too). **+ add a section** makes one (a kind: dungeon, castle,
  crypt, cave, forest, village, farm, or an empty floor; a size; a title),
  **Rename** changes its title, **Delete this section** removes it and every
  way to it. The forms below (story, player, characters) stay the top
  map's: the world's.
- **Links** (L, the chain tool): the map's links are drawn on it (a round
  marker by kind: D door, ↓ stairs down, ↑ stairs up, C cave, G gate, T
  trapdoor, with its destination; dashed for a link "in" a place, whose
  square the game picks; a band along an edge that leads on). Click a
  square to add one: its kind, where it leads (a section of the world,
  **a new section…** made on the spot with a kind and size, or back where
  the player came from), its name and, if locked, the key it needs; or one
  of the **north / south / east / west edge** buttons for a whole edge. The
  way back is made by the game. Click a link (with this tool or Select) to
  change its name, kind or edge, where it leads (or another scenario's
  path, URL or `#s=` code), where the player arrives, or its key, or to
  remove it; the panel on the right lists every way out of the map.
- The first edit turns any layout (generated rooms, a drawn grid) into fixed
  positions (`size`, `objects` with walls and doors, `paint`, everyone's
  `at`, `locked` by position); a world laid out by map lines is laid out once
  by the app in a hidden frame first.
- **Ask the AI for changes** (`POST /api/revise` with the same model choice;
  **undo** steps back through 20). In a world of sections it changes the
  section shown: it gets that map (without the sections inside it) and a
  few lines about the whole world, and its answer goes back in that place;
  the other sections are never sent. **Look it over** works the same way,
  on the section shown.
- **Look it over and improve** (beside Ask; on the build form, **Look it
  over**: 2, 3 or 5 rounds, `?improve=N`, for every way of building except
  in this browser): an agent. Each round the map editor draws the whole map
  at once (2D tiles, coordinates along the edges) and writes it out as text
  (a glyph map, the rooms, who and what stands where); the model reviews it
  with the scenario (the picture goes along to models that can see; others
  read the text) and answers with problems, ideas and the changes to make,
  which go through the same revision as Ask. It stops when the model calls
  the world good or the rounds run out. The log shows each round's map
  (click to enlarge), what it found and what changed; what a change lost
  (a chest, a floor, a character) is marked and handed to the next round.
  Then, with **then paint the pictures** ticked, the pictures it asked for
  are painted. **always, after every change** keeps it on until unticked:
  every new world and every change asked for is looked over by itself (the
  rounds, painting and this choice are remembered in this browser).
  Its changes can move things (keeping their contents), remove or add them,
  repaint a whole patch of floor at once and change any field of a character
  (see [generated.md](generated.md)); the log says what moved, how many floor
  tiles changed and which character fields.
- **Pictures** ([things.md](things.md)): signs, paintings, tapestries, notes
  with a picture and book covers are painted in this browser by a small
  image model from their `prompt` (tiny-sd, 512 px, about 0.9 GB once; on a
  full graphics card Chitra Tiny, then the processor). A bar above the tabs
  counts the pictures still to paint and paints them all; in the map editor,
  select a picture or note to write what it shows, paint it, paint it again
  or upload a file; the Books tab paints a book's cover. The AI never sees
  the pictures' data, only their prompts.
- **Voices** (a tab): a world's own voices from a file or a recording (read
  the line shown; its words are kept for Breeze TTS), each with a name,
  gender, a few words on how it sounds, the sample to play, who it speaks
  for, and **try it** (a line in that voice by ZONOS3-Mini, when it is
  downloaded in this browser). **Save to my voices** keeps one in this
  browser for every world; voices made in the game's Voice pane are listed
  too. A character's voice list (Characters tab) has the world's voices, my
  voices, "a new voice from a sample", the library and the built-in ones of
  ZONOS3-Mini and Pocket-TTS. The AI sees each voice without its sample and
  may cast it ([characters.md](characters.md), "Voices").
- The story, player, characters, layout and raw JSON as forms.
- **Play**, **play in dev mode**, **print / tabletop** (the `?tabletop=1`
  view in a frame), **copy link** (a link over 8 KB, common for a world in
  sections or with voices and pictures, is copied with a warning that chat
  apps may cut it: share it as a picture or a .zip), **Share as a picture** (a PNG with the
  whole world inside), **.zip**, **.json**, and **Open a file** (a picture,
  .zip or .json; or drop one on the page, also before building anything):
  [links-and-testing.md](links-and-testing.md), "World files".

`/world/?edit=<file>` (admin) edits a saved world from `generated/`.

## Tiles

`assets/tiles/`: a picture of every object, body and floor, seen from the
south about 58 degrees up (floors straight down), on a transparent
background, 128 pixels per square, rendered from the 3D models by the app
itself (`/app/?tabletop=1&tiles=1[&only=a,b]`, `app/tile-render.js`) and
saved by `tools/browser-test/render-tiles.mjs` (about 4 minutes for all).
`tiles.json` lists each one with its size and anchor (where the middle of its
square, on the floor, falls in the image). Anything without a tile (a new pack
item, a new body) is rendered on the spot by the map editor in a hidden frame,
kept in that browser, and for a logged-in admin saved on the server
(`POST /api/admin/tiles`).
