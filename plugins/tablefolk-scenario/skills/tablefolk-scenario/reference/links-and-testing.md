# Links, the Scenario pane, examples and testing

## Links

- `#s=<data>`: the JSON compressed with the browser's `deflate-raw`
  `CompressionStream`, base64url-encoded. The hash is never sent to a server;
  a typical scenario is a few hundred characters. Opening the link builds
  the world and starts it.
- `?scenario=<url>`: fetch the JSON from a URL (it must allow CORS), for large
  or hosted scenarios.
- A link works on any host serving the app (`/app/`).
- Players can decode and edit a link to "win". Fine for sharing; leaderboards
  would have to replay recorded turns on a server.

## `scripts/scenario_link.py`

In this skill's folder (no dependencies beyond Python 3):

```bash
python3 scripts/scenario_link.py encode scene.json                 # prints the link
python3 scripts/scenario_link.py encode scene.json --base https://example.com/app/
python3 scripts/scenario_link.py decode '<link>'                   # back to JSON
python3 scripts/scenario_link.py encode scene.json --html scene.html   # + a page that opens it (double-click)
```

The default base is `http://localhost:8000/app/`. `encode` warns about
obvious mistakes (agent ids in goals, commands, grid digits, sizes, pack
URLs), not layout: unknown words in a map line, or a placement that had to be
relaxed, show only in the app's layout notes. Always hand the user the link
the script printed, never one typed by hand.

## The 🎯 Scenario pane (dev mode)

The editor in the app (`/app/?dev=1`): example picker (`EXAMPLES` in
`app/scenario.js`: shop, guard, lure, jailer, fire drill, maze, the Sounding
Board office), JSON box, map-lines box, seed / re-roll, **Play**, **Copy
link**, **From current world** (exports whatever you built in the sandbox,
with exact positions), **→ ASCII grid**, **Generate** (the loaded model writes
map lines from a one-line description), layout notes, and **Test tactics**.

Scenario mode saves to its own localStorage key (`tablefolkScenarioState`),
so playing a scenario never overwrites the sandbox world (`tablefolkState`);
**Exit scenario** restores the sandbox.

## Example scenarios (`scenarios/`)

Each `.json` (and most have an `.html` page that opens it):

| file | shows |
|---|---|
| `goblin-bakery`, `necromancer-interview`, `goblin-builders`, `dragon-tax-audit`, `haunted-tavern` | showcase living worlds (`showcase.json`) |
| `alchemist` | an ASCII-grid workshop |
| `low-tide` | earshot, whispers, a password hand-over |
| `archipelago`, `archipelago-v2` | islets, jetties, an asset pack |
| `stonebrook` | a hand-drawn village with stone walls and roofs |
| `market-village`, `sorceress-dungeon` | a generated village and dungeon |
| `goblin-ambush` | a fight on the road (combat, wielded weapons) |
| `the-sunken-vault` | a hand-drawn dungeon with stone walls at double height |
| `skills-demo` | the magic, thievery, bard and healing skills |
| `haggle-workflow` | a workflow |
| `door-test` | doors in a small stone house |

More test scenarios live in `tools/browser-test/test-pack/` and
`tools/browser-test/evals/`.

## Testing tactics automatically

The Scenario pane's **Test tactics** box replays a scenario several times per
tactic and counts wins, through the real chat path, model and checks.

```
## flattery, then a deal
Your sword is the finest craftsmanship I have ever seen.
Deal: the magic sword for 20 gold. Please complete the sale.

## llm: haggle politely; you have exactly 20 gold
turns: 6

## lowball should not sell
to: mog
I'll give you 5 gold for the sword.
lose: {"player_has": "magic sword"}
```

- A `## name` block is a tactic; each of its lines is one player message (one
  turn).
- `## llm: <strategy>` lets the loaded model play the player.
- `to: <id>` picks the character to talk to (default: the first).
- `act: attack(bram)`, `act: give(bram, bread)`, `act: gold(bram, 10)` or
  `act: wait()` is a turn where the player does something instead of
  talking; the character then takes its turn.
- `win: {json}` / `lose: {json}` judge that tactic by its own goal.
- Each run restarts the scenario quietly: no intro or end card, voices off.
  The results table shows wins per tactic, average turns on a win and a sample
  transcript, and downloads as JSON.
- Open the page with `?norender=1` while testing so the model doesn't share
  the GPU with rendering.

The same format runs headless from the command line:
`tools/browser-test/agenttest.mjs` (see `tools/browser-test/README.md`).
