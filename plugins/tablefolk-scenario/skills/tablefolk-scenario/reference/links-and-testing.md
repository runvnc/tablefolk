# Links, the Scenario pane, examples and testing

## Links

- `#s=<data>`: the JSON compressed with the browser's `deflate-raw`
  `CompressionStream`, base64url-encoded. The hash is never sent to a server;
  a typical scenario is a few hundred characters. Opening the link builds
  the world and starts it.
- `?intro=0` or `?intro=1`: skip or show the intro card, whatever the world's `showIntro` and the player's "don't show intros" say (`&intro=0` also works after a `#s=` link's code).
- `?view=overview`, `?view=follow` or `?view=first`: the camera the world starts in, whatever its `"view"` says (`&view=first` also works after a `#s=` link's code).
- `?scenario=<url>` wins over a `#s=` code in the same address, so a reload opens the file's latest version; a `#s=` link alone is a copy of the world as it was when the link was made.
- `?scenario=<url>`: fetch the JSON from a URL (it must allow CORS), for large
  or hosted scenarios.
- A link works on any host serving the app (`/app/`).

## World files: a picture or a .zip

Chat apps and some sites cut long links short or drop the part after `#`.
A world can travel as a file instead (`app/world-file.js`; the world
builder's **Share as a picture**, **.zip** and **.json**, and the same in the
Scenario pane). Drop the file on the game or the world builder, or use
**open a world file** / **Open a file**, to open it; the game puts its `#s=`
link in the address bar.

- **The picture** (PNG, 1200 x 675, about 0.8 MB): a card with the title,
  the characters, the map and how to open it, with the whole world inside
  it twice: in a private PNG chunk `tfWd` (the JSON, deflated) and in the
  two low bits of each pixel's red, green and blue (`TFW1`, the length, a
  CRC-32, the same data). So it still opens when a site strips the PNG's
  metadata or re-saves it losslessly; a site that turns it into a JPEG
  loses the world, and the page says so. Send the file itself (as a file
  or a document, not a photo that the app may shrink).
- **The .zip**: `world.json`, its voices as `voices/<id>.ogg` and its
  pictures as `media/<n>.<ext>` (each named in `world.json` as
  `"zip:<path>"`), and a `README.txt`. A zip with a single `.json` in it
  opens too.
- A `.json` file, or a text with a `#s=` link in it, opens the same way.
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
| `hearthvale`, `frontier-outpost`, `harrow-keep`, `kettlemoor-hunt`, `deepdelve-camp` | the first showcase worlds (`showcase.json`): a working village, a frontier outpost under goblin raids, a dungeon delve with a camp at the entrance, a hunters' camp with wolves and a bear, a mining camp; made by the world builder (2026-11-20) and lightly hand-tuned |
| `goblin-bakery`, `necromancer-interview`, `goblin-builders`, `dragon-tax-audit`, `haunted-tavern` | the older one-room showcase worlds, after the new ones |
| `free-two-by-the-hearth`, `free-flooded-ferry`, `free-snowbound-inn` | worlds made for `"autonomy": "free"` ([living.md](living.md#worlds-made-for-free)): two, three and four characters in one room with food and beds at hand, no raids, a 24-minute day, one shared problem and a private aim each (a cottage two siblings must agree on; one ferry crossing at dawn; a stolen map out of a snowed-in inn). The two-character cottage is the one for smaller machines |
| `the-oracle` | a very small brain (`defaultModel`, `simple`, `systemPrompt`): he knows everything and is wrong |
| `alchemist` | an ASCII-grid workshop |
| `low-tide` | earshot, whispers, a password hand-over |
| `archipelago`, `archipelago-v2` | islets, jetties, an asset pack |
| `stonebrook` | a hand-drawn village with stone walls and roofs |
| `market-village`, `sorceress-dungeon` | a generated village and dungeon |
| `hearthvale` | a living village with jobs, stock, a clock, wolves at night and crows by day (the orchard package) |
| `goblin-ambush` | a fight on the road (combat, wielded weapons) |
| `the-sunken-vault` | a hand-drawn dungeon with stone walls at double height |
| `skills-demo` | the magic, thievery, bard and healing skills |
| `haggle-workflow` | a workflow |
| `door-test` | doors in a small stone house |
| `nightwatch` | a small game made only as a package and a scenario (`packages/nightwatch`): a beacon to keep burning, a keeper's job, dire wolves that circle it, `signal()` ([api.md](api.md)) |
| `willow-lane` | a world with no language model: menus, flags, a riddle workflow ([story.md](story.md)) |
| `the-studio` | the painting skill: a painter certain of his own genius |
| `crystal-caves`, `greenwood`, `millbrook-farm` | a generated cave with a wyrmling, woods with a camp and ruins, a farmstead |

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

## Short links

Every world in `scenarios/` has a short link: its file name without `.json`, and without a leading `the-` (`/oracle` for `scenarios/the-oracle.json`, `/goblin-bakery`). The server redirects it to `/app/?scenario=../scenarios/<file>.json`, keeping the link's own query (`/oracle?intro=1&view=follow`). Names that are real files or folders (`/app`, `/world`, `/admin`...) are never short links. The scenario banner's **share link** copies the short link while the world is unchanged from its file, else a `#s=` link with the world inside.
