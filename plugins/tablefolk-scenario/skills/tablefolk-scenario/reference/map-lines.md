# Map lines and the layout engine

`map` is a list of plain-language lines that code turns into positions, so
the result is always a valid map. A tiny model can write these, a person can
type them, and a bigger model can produce them. The engine is in
`app/scenario.js`.

## The language

```
place <thing> [xN] [row|cluster|scattered] [<placement>]
paint <material> [xN] [<placement>]
path from <ref|area> to <ref|area>        ("stone path from ..."; dirt by default)
floor <material>
```

- **things**: any object type ([things.md](things.md)), `note "<text>"`, the
  composite `counter` (a row of three wall sections), `light`, an agent id
  (places that character), or `player`.
- **placements**: `at center|north|south|east|west|northeast|northwest|
  southeast|southwest|random`, `against north_wall` (any edge: along that
  edge of the land), `beside X`, `near X`, `behind X`, `in_front_of X`,
  `around X`.
- **arrangements**, combined with the above: `row`, `cluster`, `scattered`
  (`place barrel x4 row against west_wall`).
- **refs** (X): anything placed earlier (`house`, `campfire`, `tree`,
  painted patches like `water`), an agent id, or `player`.
- "Front" of a thing is the side facing the middle of the board; "behind" is
  the side away from it.
- Unknown words are ignored and reported in the 🎯 Scenario pane's layout
  notes, never fatal, because small models improvise. Impossible placements
  are relaxed. Change `seed` to re-roll a layout.

```json
"map": [
  "place counter against north_wall",
  "place mog behind counter",
  "place barrel x3 beside counter",
  "place note \"No refunds\" in_front_of counter",
  "paint water x6 cluster at east",
  "stone path from player to counter"
]
```

Use explicit `objects` for rooms that must look exact; use map lines for
quick, natural-looking scenes. Explicit objects go first and the layout
engine works around them.

## How the engine places things (deterministic)

1. **Grid.** Integer cells of the board. A cell is *solid* when it has a
   tile (not `sea`) under its centre and four probes 0.35 out.
2. **Parse** lines into entities `{thing, count, relation, ref, arrangement}`.
3. **Order.** Explicit objects first, then lines whose refs are resolved, in
   written order. Lines waiting on a ref are deferred and retried, and
   `path` lines run as soon as both ends exist. `scattered` and `random`
   lines go last. Anything still unresolved is placed with its ref ignored,
   with a warning.
4. **Candidates → score → pick.** For each entity, take the free solid cells
   that satisfy the relation's hard filter (`beside` = touching the ref's
   cells, `against north_wall` = the northern band), score them by the soft
   preference (closeness, front/behind side, spread from others), add a
   small seeded jitter, and take the best. Same text and seed, same map.
5. **Arrangements.** `row` searches for N free cells in a straight line
   parallel to the edge or ref; `cluster` grows outward from the first cell;
   `scattered` uses farthest-point sampling with a minimum gap.
6. **Paths** run A* over solid, unblocked cells, reserve the result so later
   objects never block it, and paint it.
7. **Reachability.** Every interactive object keeps at least one free
   neighbouring cell, or it is moved to the nearest cell that has one.
8. **Relaxation.** If a hard filter leaves no candidates, the constraint is
   loosened step by step (`beside` → within 2 → within 4 → anywhere in the
   area → anywhere), recorded as a warning.
9. **Output** is ordinary world objects and agent positions, built through
   the same spawn functions as the sandbox.

## Generating map lines with the model

The Scenario pane's **Generate** button sends a one-line description to the
loaded model with the vocabulary and two examples, and asks for map lines
only. The reply is parsed leniently (bullets, numbering and stray prose are
dropped) into the map box, to edit, lay out again, or re-roll with a new
seed. For whole worlds, the world builder ([world-builder.md](world-builder.md))
is the better tool.
