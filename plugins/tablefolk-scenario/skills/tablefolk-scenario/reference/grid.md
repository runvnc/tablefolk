# ASCII grid

`grid` draws the board directly, one glyph per cell: the easiest way to get
exact rooms and buildings. **Top row = north, left = west**, centred on the
board.

```jsonc
"grid": [
  "#########",
  "#KK...v.#",
  "#.tt..F.#",
  "#.1...F.#",
  "#RRR..2.#",
  "#x..N.~~#",
  "#..Y..~~#"
],
"legend": { "R": "carpet", "x": "chest on stone", "N": "note \"Quiet please\"" }
```

## Size

Without `"size"` the board is the grid plus two cells on every side, or
exactly the grid when its outer ring is all `-` sea. With a `size`, cells
outside it are skipped with a warning. Use odd sizes so the grid centres
exactly. Rows of different lengths are fine (the longest sets the width).

## Default glyphs

The same ones characters see in their vision map (`GRID_GLYPHS` in
`app/scenario.js`; generated maps add more, `GEN_LEGEND` in
`app/procgen.js`).

| floor | | objects | | | | | | |
|---|---|---|---|---|---|---|---|---|
| `~` water | `,` grass | `#` wall | `+` door | `C` crate | `B` barrel | `M` mushroom | `L` lamp | `N` note |
| `:` dirt | `^` stone | `h` chest | `w` workbench | `t` table | `n` bench | `s` stool | `o` cauldron |
| `&` lava | `=` wood | `a` anvil | `W` weapon stand | `/` axe | `p` pickaxe | `u` bucket | `b` bag |
| `_` oak | | `P` potion | `S` scroll | `$` coins | `D` desk | `c` office chair | `A` armchair |
| | | `F` sofa | `T` coffee table | `l` floor lamp | `v` plant | `K` bookcase | |
| `-` sea | | `%` tree | `H` house | `r` boulder | `X` campfire | `f` fence | `I` signpost |
| | | `j` lantern | `*` flowers | `;` grass tuft | `q` lily pad (on sea) | | |

Generated maps write their own `legend` (`GEN_LEGEND`), with more glyphs
such as `Z` bed, `G` well, `O` market stand, `!` candelabra, `?` lectern, `(`
cabinet, `)` nightstand, `[` cage, `]` iron crate, `{` chains, `}` vase, `<`
broken pot, `>` chalice, `|` apple barrel, `z` wooden chair, and floors `R`
carpet, `E` tile, `Q` concrete, `U` flagstone. In your own grid, put any of
these in `legend`.

- `.` and spaces are empty. `1`-`9` are the scenario's agents in order; `Y`
  (or `@`) is the player.
- `legend` adds or overrides single-character glyphs. A value is an object
  type (any loaded pack's too), a floor material, an agent id, `player`,
  `"<thing> on <material>"` (`"chest on stone"`, `"wren on carpet"`), or
  `note "text"`.
- Two adjacent equal glyphs of a wide item (`table bench workbench desk
  sofa`) make one item across both cells: `tt` side by side, or one above
  the other for a turned one.
- Rotation doesn't fit in a glyph: modern furniture faces south, other
  things their default. Put a turned piece in `objects` with `ry`.
- Unknown glyphs are skipped and listed in the layout notes.
- A `house`, `fantasy_house` or `stable` glyph becomes a walk-in building
  ([things.md](things.md)).

## Combining

The grid is laid down first; `objects` and `map` lines are added on top, and
map lines can refer to what the grid placed (`place lamp beside water`).
Prefer the grid for rooms and buildings; use map lines for loose, natural
scatter.

## Export

The Scenario pane's **→ ASCII grid** button rewrites the JSON in the box as a
grid (after **From current world**, that exports the sandbox). Whatever a
glyph can't say exactly (turned or off-cell objects, tinted paint) stays in
`objects` / `paint`, so the conversion loses nothing.
