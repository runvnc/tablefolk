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
`?mode=map` (layout lines), or the default `auto`. Generated worlds come out
living (`live`, events, a turning point), with personalities written as a
name sentence plus traits, conflicts between characters, and double-height
walls.

**Where the model runs** (the form's menus; `GET /api/worldgen/options`):

- *in this browser*: the local Gemma this browser last loaded (LiteRT, it
  must already be downloaded) writes it in small steps
  (`app/worldgen-browser.js`): a plan (text), the map (a little JSON; code
  builds it with `procgen.js`, or layout lines outdoors), a review of the map
  that was built (its rooms and contents as text; it may add things), the
  characters, then the server's checks (`POST /api/finish`) with up to two
  fix rounds. 20-45 s with E2B on an RTX 2060.
  `tools/browser-test/worldgen-test.html?prompt=...` runs it on its own.
- *on this server*: the local model server (`litert-lm serve`, Gemma 4 E4B;
  ~22 s on an RTX 2060).
- *cloud*: the generator endpoint (OpenRouter by default, model
  `deepseek/deepseek-v4.1-flash-1017`; `gpt-6-luna` on OpenAI takes 6-14 s).
  Replies may run to 17000 tokens for models that think at length.

An admin can use all of them and type any model; guests get what the admin
page allows, and the server refuses the rest. Other URL options: `?model=`,
`?endpoint=local`, `?art=1` and `?brain=endpoint` (passed on to the app),
`?go` (open the world as soon as it is ready), `?view=builder|loading`.

The page shows the model's thoughts and a token count while it works. With
`--world-loading` (or `WORLD_VIEW=loading`) players see a plain loading screen
with a progress bar instead: it never slows down, laps and restarts with a new
status line, and jumps ahead as tokens arrive. Every result is saved in
`generated/` (git-ignored). `/api/generate?prompt=...` returns the JSON
(`&stream=1` for progress events).

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
- The first edit turns any layout (generated rooms, a drawn grid) into fixed
  positions (`size`, `objects` with walls and doors, `paint`, everyone's
  `at`, `locked` by position); a world laid out by map lines is laid out once
  by the app in a hidden frame first.
- **Ask the AI for changes** (`POST /api/revise` with the same model choice;
  **undo** steps back through 20).
- The story, player, characters, layout and raw JSON as forms.
- **Play**, **play in dev mode**, **print / tabletop** (the `?tabletop=1`
  view in a frame), **copy link**, **download**.

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
