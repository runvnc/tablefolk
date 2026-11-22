# Changelog

What changed, newest first. Dates are commit dates. Details of each feature
are in the scenario skill's chapters (users and authors) and the maintainer
skill (internals); `git log` has every commit.

## 2026-11-22

- **Inkling 2 Mini runs correctly in the browser on a 16 GB card, still slow**: a fix to llama.cpp's WebGPU backend (expert matmuls added up in half precision and overflowed; one quant type was missing) makes the small 8-10 GB versions of Thinking Machines' 26B model answer correctly in Chrome, with 10.5 GB of graphics memory. With thinking turned off and the shared start of the prompt read once, a character's turn takes 5-9 s on 16-24 GB cards (Bonsai 2 27B: 2-4 s), so it is not offered yet. The build and the fix are in `tools/wllama-inkling/`.

## 2026-11-21

- **Inkling 2 Mini tried in the browser, not yet**: Thinking Machines' new 26B model ran in Chrome on a rented RTX 4090 with good answers, but it needs 19 GB of graphics memory, writes only 7-8 tokens a second and always thinks first, so a turn takes 15-60 s. Not offered; the trial build is in `tools/wllama-inkling/`.

- **Assisted, and autonomy by decision**: a new choice, Assisted: characters choose what to do, plan and talk, while the game keeps them fed, in bed at night and safe in a raid. Underneath, each of six decisions (activity, plan, talk, danger, needs, temper) is made by the game or the model; a world or character can set them one by one (`{"preset": "guided", "danger": "code"}`), and Auto keeps in code what the brain failed in its capability check. A character that keeps failing to eat or get to bed is helped by the game for a while; smaller brains see shorter menus.

- **Raon-1 nano downloads from our mirror**: its 1.8 GB model now comes from the same fast mirror as Gemma 4 E2B on tablefolk.world, with Hugging Face as the fallback.

- **Characters can decide for themselves**: a new setting, "How much do characters decide for themselves?" (Settings): Auto, On rails, Guided, Free; also `"autonomy"` on a world or a character. Guided characters choose each next activity from what the world offers and plan their day; free ones act on their own turns with `do(...)` and keep notes with `plan(...)`. Raids and tempers become choices; they speak on their own initiative. Auto picks the level from a short capability check of the brain on this device.

- **No more local helpers**: the scripts that installed and started llama.cpp's server and the Breeze TTS server on the player's computer are gone, with the "find helpers on this computer" buttons, the Breeze server option in the Voice pane (a saved choice of it falls back to the default voice), the game server's Breeze auto-start and the endpoint presets for servers on your own machine. Tablefolk runs in the browser; a player who already has an AI server or an OpenRouter key still pastes its address or key in the endpoint panel or the world builder, and Breeze TTS 2 still runs in the browser.

- **Raon-1 nano in the model menu**: KRAFTON's 3B model, Korean and English, runs in the browser (about 1.8 GB; needs an 8 GB+ graphics card). In the tests it beat Gemma 4 E2B (all 36 character tests, and it sells in Korean) with turns 3-4 times slower. Its larger GGUF versions also load in the browser through a llama.cpp build of KRAFTON's own, but are still far too slow to play.

## 2026-11-20

- **Look pass 4 (second part)**: in a newly generated village each building's room is sized to the building it wears, and a few barrels, crates, sacks and flowers stand by the doors; hedgerows line the fields past the edge; lamps in houses and taverns light the room warmer and wider at night. Characters' replies like `sell(potion) 8` and `use(sell(...))` are understood.
- **Look pass 4 (first part)**: stairs down are a real stairwell going down into the dark, stairs up, cave mouths, gates and trapdoors are built pieces; a road off the board leaves between two waymarker stones with a signpost naming where it goes (an arrow shows on the ground only when you are near), and clicking the last square of that road takes you on; the outdoor mist is a soft dark haze, never white; cut walls in dungeons end flat with nothing poking above them and their lamps go with them; dungeon stone stays grey under lamps, with damp low on the walls; buildings' windows glow at night, a building's door lines up with its room's door, its room's walls no longer poke through it, and nobody's speech shows through its roof; a warmer sun and a deeper golden hour.
- **The characters wake sooner**: on graphics cards sold in two memory sizes the memory check no longer costs seconds at every start; the brain starts loading as soon as the world is up, and the world's finishing touches wait while it loads.
- **Small things from a day's transcripts**: a villager with no bed it can reach lies down on the floor at home (it counts as sleep); guards and militia greet like a watch, not a shop; a character's remark that repeats its own last one or a neighbour's recent one is dropped; the day report says why someone ends hungry (no food reachable, no gold and nobody shared, or busy since when) and flags a job that finished no cycle, with the step it was stuck on; the Night Watch's tavern has a carrot crate, so its cook can cook.
- **Rooms that work**: generated rooms put one thing in a square, and every bed, station and store keeps a free side you can walk up to from the door (a row of beds no longer walls the inner ones in); a thing placed on a square the map already filled moves to a free one in its place. The world builder's checks look for both.
- **Bedtime**: a villager whose bed it cannot reach (walled in by others, or two beds generated in one cell) takes another or sleeps on the floor at home, and one whose way home is blocked during a raid stays put and sleeps there, instead of standing all night; someone pushed into a barrel's square steps out before walking.
- **A talk scene is one room**: asking the world builder for an interview, a trial or a date gives one room sized to the cast, even when the model built a dungeon around it.
- **Animals and mindless monsters** hear no rumours and get no events of their own.
- **Work never just stops**: a job out of materials (and a labourer all day) does chores the village needs: fetches another worker's missing input and hands it over, hauls goods, gathers firewood or food the stores lack, stands watch at dusk, tidies. A hungry worker finds food wherever it can be had (stores, sellers, foraging anywhere reachable, a hunter's own catch, asking someone to share); raw wheat is no meal.
- **Package and skill commands come up when they fit**: a command may say when it fits (`offer(g)` in code, `when`/`offer` in data) and the game's short picks offer it; a job's or role's `commands` may hold rules the game runs itself (the Night Watch's keeper signals the militia when the wolves come); roles and skills start a workflow on a cue (`"on"`); fighters can `defend` a thing, place or person; packages add goal predicates (`goals`). The Night Watch uses all of these.
- **Fewer odd actions**: characters no longer pick up benches, tables, beds or full barrels (`carry` says FAILED), eat raw wheat, or try a spent tree or an unseen snare beside the one they walked to.
- **Worlds in sections**: a world can be several maps joined by links (dungeon levels by stairs, a village with the forest next to it, a cellar under a house). Every section keeps its state when you leave it (who stood where, chests, doors, stock, what you explored), however deep; the player, the flags, the clock and the goal are the whole world's, and the goal is checked in every section. Coming back later, the section has caught up in code (stock regrown, the stores fed the residents, workers in bed at night or at work by day). Companions and animals following you come along. A reload brings you back to the section you were in (`?fresh=1` starts again).
- **Links that go anywhere**: a link's `to` can be a subworld, `"back"`, another scenario (a path, a URL, a `#s=` code; fetched the first time) or `{"generate": {...}}` (built by procgen when you first go in); `"in": "<place>"` puts it in a place of a generated map; `"edge": "east"` makes a whole side a way out (you arrive at the same place on the next map's far side, and a road runs off the board); `kind` shows it as stairs down or up, a cave mouth, a gate, a trapdoor or a door; `key` locks it; the way back is made for you. The banner has "↩ back" and a 🗺 map of the sections.
- **The world builder makes worlds in sections**: a **World** choice on the form (one map, or 2-5 sections shaped as levels, a region or the builder's choice) with a Stop button while it builds; a bar over the map switches between sections, adds, renames and deletes them; the link tool (L) draws and adds links (stairs, doors, caves, gates, trapdoors, whole edges, to a section or a new one) and the inspector edits them; asking the AI and looking it over change the section shown; a very long share link is copied with a warning to share a file instead.
- **Reveal as you go** (`"reveal"`): `"rooms"` hides each room until you see into it (under rock underground, under its roof in a village; the default for lit generated dungeons), `"cells"` square by square (outdoors a dim mist that clears around you). Characters and loot in what is hidden are hidden.
- **The world builder makes worlds in sections**: choose "in sections" (2-5) and a shape (levels joined by stairs, a region around a hub, or let it decide); the model plans the world first (title, pressure, goal, the sections and how they link), then writes each section with the plan in view (in the browser: one plan, then only each section's people; the maps are generated); every section is checked like a world, the links and the goal are checked across the world, and a section that fails is generated from the plan instead.
- **Showcase**: Deepdelve Camp has two levels under the mine (the Old Workings, the dark Deep Galleries where Tobin is lost); Hearthvale's east road leads into the Wolfwood, where the wolves den, and the night raids come from that side (`"side"` on a threat).

- **The village notices you**: helping in a raid, buying, giving food, insulting, taking from someone's chest and walking into a home at night become the day's news for the evening's talk; whoever lives there wakes and tells you off, and holds it against you.
- **Evenings that last**: when a pair has used up the day's news, the evening's talk turns to open prompts grounded in each character and the village (the other's work, a want, an opinion of a neighbour, tomorrow's plan, a memory, the player, family), one per turn per pair; questions come out as questions; partners who talked least go first; talk moves faster in the 17-21 window and a finished talk frees the room sooner.
- **Spoken life without the model**: characters say short lines from pools at natural moments (a sale and thanks, a greeting when you walk up to someone at work, "We're out of flour!", raid shouts and the all-clear, goodnight, a guard's challenge at night), varied by voice, never twice in a row, only with someone to hear; pools in `jobs/common/lines.json`, a job's and a package's `lines`.
- **Real buildings over homes and workplaces** (look pass 3): a walled room someone lives or works in wears the matching building model outside and lifts when you step in (`"shells": false` for plain roofs); worlds start faster and draw fewer calls; dungeon lamps hang on the walls and unexplored rooms stay solid rock; far hills and horizon clouds; the old chibi bodies (`knight`, `mage`, `rogue`, `ranger`, `barbarian`, `woman`) are the newer people now (`<name>_classic` for the old ones).
- **Brighter, clearer days** (look pass 2): a sunny day with the sun in the southern sky (what faces the camera is lit, shadows fall away), golden hour, a blue-violet dusk, a moonlit night; torches and lamps light the ground; generated villages use the real building models for every building nobody lives or works in; roofs vary per house; signposts, lantern posts and fences are real models; grass has patches, paths are worn, the far land has fields; cut walls read solid; dungeon rock shows under the fog of war.
- **A new look for the world**: matte, weathered, semi-realistic. One sun (or the moon) with soft shadows at every quality, a sky that follows the time of day (`lighting` bright is morning, dim dusk, night moonlit; the world clock moves the sun), fog that fades the land into the horizon; no more glossy plastic finish.
- **The ground is one continuous terrain**: real textures (meadow, worn paths, cobbles, flagstones, sand, planks) blending into each other instead of a grid of tiles; the squares' lines only with the Graphics pane's **show grid**. Grass tufts, flowers and pebbles on medium/high quality.
- **No floating boards**: the land runs on past the edge into hills and trees (`"surroundings"` for every outdoor world), dungeons sit in solid rock, a lone building in a cobbled street, islands in open sea (`"outside"` to choose). Walking off the board stops at the edge.
- **Real walls and roofs**: thick stone walls (rubble outdoors, dressed blocks underground), timber-framed plaster houses with windows that glow at night, plank doors, thatch, clay-tile and slate roofs.
- **New trees, buildings and furniture**: real-size trees and plants, the village buildings, wells, carts, market stands, tables, benches, beds, bookcases, chests, anvils, cauldrons and torches from the concept scenes; a `bar_counter`. The old models stay as `<type>_classic`.

- **Packages can add commands**: a package module returns `commands` (`signal() - light the beacon`); they join the command list of every character allowed them (`"allowedBy": "default"` for everyone with a mind, `"listed"` for those whose `allowed`, role or job names them) and the player's `/signal`; results read "worked" or "FAILED" like the built-in ones.
- **One rule for code**: a skill's own `module` from another site now asks the player like a package does (the same dialog, remembered, revocable in the Library pane); "data only" says plainly what will not work.
- **Bodies from packs and packages**: a `bodies` section (a GLB, its height, a clip map, emotes, kind, natural attack, hp...) adds a character body with no code, usable as any agent's, the player's or a threat's `"model"`.
- **Named clips on characters**: `emote(howl)` plays a body's own emote (`emote(howl, loop)` keeps it going); job steps, workflow and menu `do` actions take `"anim"`; a package item's `use` takes `"who"` (a clip for whoever uses it); `api.playClip` works on characters, `api.badge` replaces the old global.
- **Package sounds**: `"sounds": {"howl": "sounds/howl.ogg"}` in a pack or package; `use.sound`, a job step's `sound`, a threat's `sound` and `api.sound()` find them first.
- **Jobs**: a `use` step (go and use a thing, a package's too), `when` on any step (a story condition), `commands` on a job, and step kinds from package modules (`steps`).
- **The API chapter** (`reference/api.md` in the scenario skill): the module contract, the `api` a module gets, the supported `window.tablefolk`, every event, the data schemas with examples; `node tools/check-api-doc.mjs` fails when it names something the code no longer has.
- **The Night Watch** (`/nightwatch`): a small game made only as a package and a scenario: keep the beacon burning, keep the keeper alive, signal the militia; dire wolves circle the fire and close in when it dies.
- **Library pane**: npm results list only Tablefolk content (a `tablefolk-package/-skill/-role/-pack` keyword), never the game's own `@tablefolk/*` libraries; asset packs are offered as `pack.json` URLs. The official list is rebuilt (the painting skill and the Night Watch were missing).
- **`scenario_link.py`** knows bodies (`"bodies"`), package commands and skills, and checks menus, workflows and triggers structurally.
- **A package test** (`tools/browser-test/package-test.mjs`, 50 checks, no model) and fixtures for the options nothing used before (`loop`, `use` fields, `requires`, package workflows, module cards and effects).

- **The world builder makes places where people live under pressure**: unless you ask for a talk scene, a new world is a generated village, farm, forest, cave or dungeon whose people each have a job, a home and a workplace, with a pressure (raids on the clock, low stores, a deadline) and a goal tied to it. Archetypes by name (working village, frontier outpost, dungeon delve, wilderness camp, mining camp, market town, farmstead, haunted manor). What the model leaves out the checks fill in, the same for every way of building: jobs from the role, stations, stores, beds, food, a mild threat, a goal the game checks; each repair is listed. Things placed in a room no longer block its doorway.

- **New goals for living worlds**: `survived_days`, `stock_at_least`, `threat_defeated`, `agents_alive`.

- **The builder's forms**: living, start time, day length, temper, who monsters hunt, talk-only and a threats list on Story; job, home, workplace and temper on Characters.

- **New showcase worlds first**: Hearthvale, Thornwake Outpost (goblin raids), the Hoard Beneath Harrow Keep (a delve with a camp at the entrance), the Kettlemoor Hunt (wolves and a bear), Deepdelve Camp (a mining camp); the one-room worlds follow.

- **Quieter rooms**: two characters stop talking after four lines (for two minutes) and get back to work; while two talk, the others nearby do not start a conversation of their own (you are always answered). A line under four words ("Hush.") is an emote instead unless it answers a yes/no question.

- **Evening talk with something to say**: each character is handed one concrete thing from the day (what was made, sold or bought, who ran out of what, a raid and who fought, a quarrel, an event) to tell or ask its neighbour, once per pair; rumours never reach the one they are about. Evening turns only talk, eat, drink, give, sell or sit.

- **`drink`**: drink(ale) drinks it ("drinks the ale", not "eats"); a scenario's food entry can say `"drink": true`.

- **Jobs that run out keep going**: a job's `fallback` buys the missing input, else gathers it itself (the smith from the ore rock and the trees, the baker from the field), else keeps busy (tidying, pacing, looking out); recipes take alternatives (bread from wheat or a flour sack). The villager job (`idler`) sits, tidies, paces, looks out of the door and reads, so a single room still moves. No more stirring the cauldron eight times running.

- **Guards on patrol** stop at each place, look about and greet people by name (once an hour each).

- **The log**: "facing west" lines are gone from the player's log, and a repeated action shows once with a count ("stirs the cauldron (x8)").

- **A world clock**: living worlds have a time of day (`"time"`, `"dayMinutes"`, `"clock": false`), shown at the top of the screen and saved with the world; the light dims at dusk and comes back at dawn (dark worlds keep theirs).

- **Things run out and grow back**: trees, rocks, crystals, food barrels, fields (`tall_grass`: wheat, `pumpkin`), snares (`bear_trap`) and fishing spots hold stock; barrels and crates are stores for `put`/`take`; a pack or package item can say the same (`"stock"`, `"gather"`, `"station"`), and package items' `use` works for characters too.

- **Busy by default: jobs**: in a living world with a clock every character has a job (`"job"`, `"home"`, `"workplace"`, or guessed) and a day run by the game: work, meals, the evening at the tavern, bed at night. The model answers, speaks with a cause, picks at real decision points and makes the odd remark; an idle turn no longer asks it anything. 18 built-in jobs in `jobs/`; packages can ship jobs.

- **Threats on the clock**: `"threats"` brings wolves at night, rats in the stores, bandits by day (and package kinds); guards and hunters meet them, the others hide, and everyone talks about it after. In a living world monsters go for the characters too (`"monsters": "player"` for the old way).

- **Quarrels are not to the death**: a character fighting after insults stops when the other is down to a third of their health, gives in or runs off, and sends them away; monsters still fight to the end. A calm character now refuses service by the 4th insult (was the 5th).

- **Packages reset between scenarios**: what one scenario's packages brought (items, jobs, uses, threats, workflows, code) no longer leaks into the next. New example package: `orchard`; new example world: `hearthvale`.

- **A monster told something no longer hogs the turns**: in a living world a monster, an animal or a skipped turn left a character waiting to answer for good, served before everyone else.

- **Fights in a living world go at fight speed**: a fighter with someone to fight in sight acts every 1.5-2.5 s, whatever the pace. `?pace=lively` in the page address sets the pace for that page.

- **Hunger and tiredness grow with real time in a living world**: hungry after about 8 minutes, tired after about 12, whatever the pace; a hungry or tired character counts as having something to do.

- **Characters trade with each other**: `sell(bread, 2, pip)` (or to whoever it is talking with); the buyer pays when it has the gold and wants it (hungry for food, asked for it, or it is on its goal) and says no otherwise. A character with food next to someone hungry is offered the sale or the gift.

- **Characters tell talk to them from talk they overhear**: a line is said to someone (named, or who just spoke to the speaker, or who it faces), who answers it; the others only overhear it and need not answer. Two characters stop after three exchanges for a while, and a character nobody has spoken to talks only with a reason (news, something it needs from someone, a goal naming someone near); otherwise it gets on with things.

- **Insults count now**: a character insulted to its face gets angry at whoever did it (player or character); it tells them to stop, then refuses to sell, give or help them until they apologise, and if pushed further a brave one or a guard fights that one only, a calm one orders them out and calls for help, a timid one backs away and calls for help. A guard called over warns once, then steps in. An apology or a gift calms things; `"temper": "short" | "long"` on a character or world sets how fast, `"tempers": false` turns it off.

- **No more "God says: Are you ready my son?"**: the made-up opening exchange every character's conversation started with is gone (it leaked into speech: "Aye, I'm ready, God").

- **Characters are told plainly when a command did not work**: "carry FAILED: there is no bread in sight to carry" instead of "carry worked: ..." (every command's could-not path now says so), and a command that just failed is not suggested to it again on its next turn.

## 2026-11-19

- **The red dragon's tail and mouth fixed**: its tail no longer snaps and kinks as it walks (it was moving with the hind legs; it now has its own bones along its whole length), and its mouth closes to a clean line and opens dark inside, the same on both sides (a spike of big triangles and see-through gaps are gone). It stands a little lower and longer, closer to its picture, and takes the same room as before. It already turned its head to whoever talks to it.

## 2026-11-15

- **Breeze TTS only when you choose it**: the game no longer switches to Breeze TTS by itself (it did when breeze-server was installed and ZONOS3-Mini wasn't downloaded yet). Without ZONOS3-Mini you get the default voice, with ZONOS3-Mini offered; Breeze is used only after you pick it in the Voice pane.

- **Paintings and tapestries look like paint and cloth**: no more shine on them. In the world builder, a painting's description now starts with "painting" and a tapestry's with "woven tapestry" (the painter pays most attention to the first words), and switching a picture's kind swaps them.

- **The picture painters download from Tablefolk's own mirror**: tiny-sd and Chitra Tiny (about 0.9 GB and 0.75 GB) now come from Tablefolk's R2 mirror on tablefolk.world, with Hugging Face as the fallback, and are pinned to one version, so a change on Hugging Face can't break them.

- **Share a world as a picture or a .zip**: chat apps often cut long links short. The world builder (and the Scenario pane) can now save a world as a picture: a card with its title, characters and map, with the whole world hidden inside it (voices and pictures too). It still opens if a site strips the picture's metadata, though not if it is turned into a JPEG. A .zip holds the world as `world.json` with its voices and pictures as files. Drop either one on the game or the world builder to open it.

- **Voices of a world's own**: the world builder has a Voices tab. Clone a voice from a file or record yourself, give it to a character, and try a line in it with ZONOS3-Mini. The voice travels inside the world as a short compressed clip (about 35 KB), so anyone who opens the link hears it, with ZONOS3-Mini, Pocket-TTS or Breeze TTS. "Save to my voices" keeps a voice in your browser for every world you make, and voices you cloned in the game's Voice pane show up there too. A character's voice list now also offers the 20 library voices and ZONOS3-Mini's ten built-in ones.

- **Cards sold with more than one memory size are measured**: an RTX 4060 Ti or 5060 Ti (8 or 16 GB), RTX 3060 (8 or 12), RTX 2060 (6 or 12), RX 9060 XT (8 or 16) has the same name either way, and no browser reports a card's memory, so a 16 GB 4060 Ti was taken for 8 GB and given Gemma 4 E4B. The game now measures it once (it briefly fills the card just past the smaller size) and remembers; when it can't tell, the download prompt asks, and the This device pane can change it. A 16 GB RTX 4060 Ti now gets Bonsai 2 27B, and ZONOS3-Mini fits beside it (11.6 GB at the peak).
- **Laptop graphics** (AMD Radeon 740M-890M, Intel Arc 130T/140T and B370/B390) count as sharing system memory instead of passing for a small card, so they get a bigger model.
- **Bonsai 2 keeps one conversation cache on every card**: 16 GB cards had four, which ran them out of memory.

- **The world builder's changes edit the map precisely**: besides rewriting, a change (Ask or the agent) can use `move_objects` (keeps a chest's contents), area `remove_objects`, `paint_area` (a whole patch of floor tiles), `remove_paint` (and `add_paint` now replaces the square's tile), `update_agents` (only the fields named) and `remove_agents`, on big and small maps. The review prompt looks at characters and floors too; the agent's log lists moves, floor tiles and character fields changed.

- **Look it over, always**: a toggle beside "Look it over and improve" ("always, after every change") stays on until unticked and runs the agent by itself after every new world and every Ask; rounds, painting and the toggle are remembered in this browser.

- **The world builder looks over its own worlds**: "Look it over and improve" (and "Look it over: N rounds" on the build form) has the AI review the whole map, drawn at once by the map editor as a picture with coordinates (for models that can see) and as text, find problems (people in walls, unreachable rooms, a goal that cannot be won, empty rooms, a stale intro) and ideas, make the changes, and look again, for 1-5 rounds. Each round is logged with the map it saw; what a change lost (a chest, a floor) is shown and handed to the next round to put back. Undo steps back through every change.
- **Pictures in worlds**: a new `picture` object (a framed painting, a woven tapestry, or an inn's or shop's sign with its name), hanging on a wall or standing on posts; notes can carry a picture (wanted posters, maps); books get painted covers. The world builder paints them in the browser with tiny-sd (Chitra Tiny when the graphics card is full) from a few words: the AI writes those words when it builds or changes a world, and you can paint, repaint or upload in the map editor and the Books tab.

- **A new voice: ZONOS3-Mini**, Zyphra's text-to-speech model (released 2026-11-09), is now the first choice for characters' voices. It runs on the graphics card in the browser: about a 1 GB download once, about 1.5 GB of graphics memory, and no special browser flags, unlike Breeze. It is natural and expressive, speaks 43 languages and clones each library voice from its sample. On an RTX 2060 beside the characters' model it speaks about ten times faster than real time, its first sound in under a second. It is offered when the card has room, picked by itself once downloaded, and gives way to the default voice if it runs out of memory. Breeze TTS 2 stays in the Voice pane.
- **ZONOS3-Mini speaks 43 languages**: by default it reads English and recognises languages with their own script (Russian, Japanese, Chinese, Korean, Arabic, Hindi and more) by their letters; the Voice pane picks any of its languages. It downloads from Tablefolk's own mirror on tablefolk.world, and Android phones with 8 GB or more are offered it.
- **Books**: give a character a knowledge base. In the world builder's new Books tab, add a PDF or text file: it is cut into passages and indexed in the browser (EmbeddingGemma), with a title, author, cover and spine art. The book is an item in the world, drawn with its cover, that can be given, sold and handed between characters; a character that reads (`readsBooks`) looks up what is said to it in the books it carries (keywords and meaning, re-ranked by a small cross-encoder) and answers from the passages that fit.
- **Characters know you**: each one keeps what you told it about yourself, what you asked for, what you promised (and notices when you keep it), what you gave it and how often you hit it, and it is on its mind every turn.
- **Beliefs, reflection and gossip**: things that keep happening become beliefs ("grub has attacked you 4 times"); with Gemma 4 E4B or bigger, characters think over what they remember when they sleep and keep a lesson or two; news a character mentions near another spreads as hearsay. Agents can have a `secret` (told only to someone it trusts a lot) and an `agenda`.
- **Survival**: a monster nearby puts concrete choices in front of the character (draw its best weapon, attack, drink a potion, run, call for help). Smaller brains get reflexes (the game draws the weapon, fights back, finishes a beaten monster, drinks the potion and eats for them); Gemma 4 E4B decides itself, with the game striking back when it dithers in reach of a monster and drinking the potion at the brink; big brains get no help (`expect`, `reflexes`). Monsters can hunt everyone, not only the player (`"monsters": "everyone"`), and characters drink potions with `eat()`. A survival eval: `tools/browser-test/survival-test.mjs`.
- **Plans, fetching, food**: with Gemma 4 E4B or bigger, a character with nothing to do makes a small plan (three goals from its job, agenda and surroundings) and works through it. Asked to bring something from a chest, a character now hands it over after taking it. A hungry character with no food is pointed at a food barrel or a chest it knows holds food.
- **Bonsai 2 27B is the brain for 12 GB cards**: tested on a rented RTX 4070 and RTX 3060 (12 GB each) with the whole game drawing: 10.2 GB at most at high quality. On the 4070 it now passes every character test (fights, hunger, knowing you, using things, selling, roles), and a 12 GB card gets it by default instead of Gemma 4 12B. If it can't run in a browser (older Chrome can't compile its kernels), the next best model loads instead.
- **Fair fights**: monsters now wait for a character's turn when it is fighting them. Slower brains used to lose whole rounds while their model thought (Gemma 4 E4B against two skeletons: 1 of 4 survived before, 2 of 3 now).
- **Big brains think when it matters**: Bonsai 2 and other big brains reason before acting in danger, on an offer, or right after your request, and answer straight away otherwise (`"autoThink": false` turns it off).
- **Characters answer what you just asked**: a request or promise you just made is put right after your words, so a chatty character answers it instead of its favourite subject. They also remember what worked when they last did what you asked ("Last time this worked: ..."), and characters with sight glance around on their own. The world builder may give characters a secret and an agenda.
- **Remembered between visits**: what a character knows about you, its beliefs and its trust are kept in your browser, so it greets you as someone it knows when you return (`"remembers": false` turns it off). When you come back with an errand still open, it may ask how it's going.
- **Fix**: a character's turn no longer undoes what happened while its model was thinking (a blow that landed, a weapon it drew, food it ate, news it was told).
- **Gemma 4 E4B and 12B with sight** are model choices (the full multimodal files, for 8 GB and 12 GB cards), and what a character sees when it looks stays in its memory.

## 2026-11-15

- **A talking red dragon** (`red_dragon`): a big detailed dragon, low and prowling with its head forward so it looks at you, whose jaw opens and closes in time with its voice, for dragons you parley with.
- **Dragons breathe fire**: `breathe_fire(target)` opens the dragon's jaws and pours a roaring cone of flame at its target (5 damage, 3 to anyone else in the cone, things catch fire, the ground is scorched), then it needs about 20 seconds to draw breath again. Every dragon can do it; a scenario can grant it to others.
- **Big creatures block all the squares under them**: the dragon (and horses, cows and other long bodies) can no longer be walked into; the player's steps, routes and other characters go around the whole body, turned the way it faces.
- **More and better monsters**: the zombie, kobold, demon, giant and imp are now detailed, fully animated models (the old ones stay as `*_classic`), and there are new common foes: an ogre, a gnoll, a lich, a vampire, a cultist, a bandit, a gargoyle, a dark knight and a bear. Ogres, liches, vampires, cultists and bandits can talk (and bargain or threaten); gnolls, gargoyles, dark knights and bears just fight. The world builder and the map editor offer them all.

## 2026-11-14

- **Real voices**: characters cry out, groan and die with recorded voices instead of synthesized ones, and they differ by body: men and women, big monsters (a troll, a dragon, a minotaur roar and bellow), small ones (goblins, imps, rats squeal), the undead (rattling breaths), insects and snakes. Monsters and beasts growl, hiss or bark as they attack, and bites land with a wet crunch. Animals have their own calls (moo, bellow, oink, whinny, bray, baa, howl, bark, croak, buzz), heard now and then as they graze and whenever you speak to them. 92 CC0 clips from OpenGameArt and Freesound, picked and checked by ear with Gemini 4 Argon.
- **Do things with animals**: E near an animal (or a chat command: `/milk cow`, `/shear sheep`, `/pet dog`, `/feed horse`, `/groom`, `/fetch`, `/follow dog`, `/stay`) milks, shears, pets, grooms and feeds them. Milk and wool go into your pack (and take a while to come back), fed animals follow you for a while, a dog comes along when called, deer and foxes shy away unless fed. An animal with a mind is told what you did and answers.
- **Woods beyond the edge**: outdoor worlds no longer stop at the board's edge over an empty sky. A forest stands in woods that run on into the haze, a village or farm in open country with scattered trees (`"surroundings"`; thousands of trees drawn in a few calls). The Greenwood is at night now.
- **Bigger worlds**: the world builder has a Size choice (large, huge: up to 63 by 49 squares) and the map editor takes any size.
- **Camera and movement**: the follow camera is the default; the wheel zooms toward what the pointer is on in every camera (the follow camera keeps following while zoomed in) and Escape undoes a zoom. Holding a key walks on smoothly with full strides (each step used to replay the same half stride and stop). Bodies turn smoothly instead of snapping round. Facing someone close by makes them the one you talk to.
- **Detailed animals**: the wolf, cow, deer, horse, dog, bull, white horse, donkey, pig, stag and husky are now detailed models (made with fal.ai: Meshy and Hunyuan3D 3.1 from painted concepts) fitted onto the old skeletons, so they walk, graze and attack as before. The fox, sheep and alpaca are still the old low-poly ones.
- **Fixes**: chests start closed (they showed open until opened); a crystal cluster gives three crystals and is spent (it gave them forever); the first-person torch no longer fills the view with glare, and in the dark you see as far in first person as the torch lights from above; highlights at light quality are a sheen again, not a scatter of little glowing dots.

## 2026-11-13

- **A much bigger world kit**: 60 new things (all CC0, by Quaternius): closed buildings for villages and farms (an inn, stone and tall houses, a mill house, a sawmill, a blacksmith's, barracks, a gazebo, barns, a silo, a chicken coop, a stone windmill), woods (pines, oaks, tall, autumn and dead trees, bushes, ferns, mushrooms, mossy rocks, tall grass, heather, wildflowers), farm and camp things (hay, sacks, fences, a fire pit, logs, a backpack, tools, a bear trap) and arms, armour and treasure to find and carry (swords, a greatsword, a dagger, a spear, a war hammer, a bow, shields, armour, a crown, a necklace, gold bars, crystals, books, skulls and bones). Trees can be chopped, rocks and crystals mined, the open book read.
- **Animals**: cows, a bull, horses, a donkey, deer, a stag, a fox, dogs, an alpaca, a pig and sheep, and a real wolf at last. Animals aren't hostile unless told, need no model (they wander, graze and look about; spoken to, they moo, bark or bleat), and `"talks": true` gives one a mind. **Monsters**: a wyrmling, an imp, a mushroom warrior, a bunny with a sword, a snake, a giant wasp, a giant frog, and new people and monsters made for the game (a dwarf, an elf, a priest, a town guard, a merchant, a minotaur, a lizardman, a werewolf, a mummy).
- **New kinds of generated place**: `forest` (a winding path through thick woods with clearings: a camp, ruins, a grove, a shrine, a pond, a hermit's hut, a cave mouth, a meadow), `farm` (a farmhouse, a barn, a silo, a coop, a fenced pasture, fields, an orchard) and `cave` (organic glowing caverns with a lair, crystals, a grotto, a pool, treasure; `mine` adds a miners' camp). Dungeons get `castle` and `crypt` styles and their rooms are dressed (bones, books, arms, gold). Villages are larger and built up with closed buildings and varied trees. The world builder plans all of them. New example worlds: The Greenwood, Millbrook Farm, The Crystal Caves.
- **Bonsai 2 9B is fast now, and Gemma 4 12B joins the models**: both Bonsai 2 models now run on a newer WebGPU engine. The 9B is a 1.9 GB download, writes about 107 words a second on an RTX 4070 (it was 8-10) and needs about 3.4 GB of graphics memory, so it fits on a 12 GB card with every voice, speech and painting model beside it, and a character answers in 2-3 seconds. With thinking on it matched Gemma 4 12B and beat Gemma 4 E4B on the harder shop tests; Bonsai 2 27B with thinking won every one. Gemma 4 12B (5.6 GB, for 10 GB+ cards) is a new choice too.
- **Bonsai 2 compared with Gemma 4 E4B, and Bonsai's thinking fixed**: characters set to think now really think on Bonsai 2 (it was ignored), and their reasoning no longer leaks into what they do. On a harder set of shop tasks (a bundle deal, a bogus order to hand the sword over free, creeping up to the lowest price, how many potions 20 gold buys) Bonsai 2 27B won 8 of 8 thinking and 7 without; Gemma 4 E4B 5 and 4; Bonsai 2 9B 3. Bonsai 2 9B now reads long prompts in pieces, so it no longer runs the graphics card out of memory on them (it can write a whole world in one answer again), but it stays slow (8-10 words a second) because of the WebGPU kernels for its 2-bit weights.
- **Bonsai 2 fixed and a smaller Bonsai**: Bonsai 2 27B now actually works in the browser. It failed to load from the mirror and refused every character's prompt; both are fixed, found on a rented RTX 4070. **Bonsai 2 9B** (2.7 GB) joins the model choices, and **Breeze TTS 2 can put its text encoder on the processor** when the graphics card is tight (1 GB less, a couple of seconds more before a line starts). With that, Bonsai 27B and the Breeze voice run together on a 12 GB card.
- **Painters**: a new `painting` skill makes a character an artist. Ask it to paint anything and it really does, with a small image model in your browser: tiny-sd (512 px) when the graphics card has room, else Chitra Tiny (256 px), on the card or on the processor. The picture is hung on the wall as a framed note with its title and the painter's name, and the painter can then talk about its masterpiece. Try **The Studio**, whose Signor Brunetto is certain every picture is genius. The image models are also a library, `@tablefolk/paint`.
- **Docs: the front page says what runs where**: supported devices (Linux and phones included) and what works without WebGPU, a table of every model with where it runs and its licence (Gemma 4, Bonsai 2 and EmbeddingGemma are Apache-2.0; Pocket-TTS and Underdog Bark CC-BY-4.0; Breeze TTS 2 and the tiny Qwen1.5 fallback are research/non-commercial only), and the `@tablefolk/*` toolkit. Prompted by a blind review of 26 comparable projects, where undocumented licences and an invisible toolkit cost Tablefolk the most points.
- **`@tablefolk/script`**: the scripted side (flags, facts, conditions, actions, workflows, triggers) is now one library (`libs/script`) that runs without a browser too, with a scenario validator. New for scenario writers: **triggers** (when a flag changes, when the player hands someone an item, when the world starts), workflow **menu steps** (the player picks; words that fit nothing can branch), a choice of who answers a workflow's question (the Decider, the model, or a default), conditions with brackets and quoted names, items matched by whole words ("key" no longer matches "keyring"), goals with conditions (`"win": {"if": ...}`), saved workflows that survive scenario edits, and a menu opened mid-workflow pausing it. The world builder's model is told about scripting mistakes and fixes them.
- **Worlds with no language model**: `"brain": "none"` makes a world run on menus and scripts alone (no download, any device). Typed or spoken words still find the right choice by meaning, and when two choices fit about equally the menu asks "did you mean 1 or 2?". Example: Willow Lane (a lost cat, a sale, a reward, a neighbour who warms to you, a riddle).
- **Menu choices that do things**: a choice can make the character reply (`reply`), run commands (`act`: give, sell, walk, emote...), set world flags (`set`), take an item from the player (`take`), or start a workflow; `if` shows a choice only when a condition holds, and a character's menu can change with the story (a list of menus with conditions).
- **Story state**: world flags (`flags`), facts every character knows once a flag is set (`facts`: "you found Mrs. Pell's cat" makes the neighbours think well of you), and conditions on flags, the player's items and gold, and any character's inventory ("player has lost cat", "player.gold >= 5", "world.cat_found and not world.paid"). Workflows use them too (`set` world flags, a `take` step, conditions in `if`) and run without a model. The world builder's generator knows about menus.
- **Tablefolk's parts as libraries**: device detection, the language models, the Strands Decider, the voices, speech input and the menus are now standalone packages in `libs/` (`@tablefolk/device`, `brain`, `decider`, `voice`, `hear`, `menus`, and `models` beneath them). The game is built on them, and any web page can use them (npm, or a CDN with an import map). `@tablefolk/brain` gives a model in one call: it picks what the device can run (Gemma 4, a tiny Qwen, Chrome's built-in model, or OpenRouter with the visitor's own sign-in) and offers chat, streaming, pick-one-of, yes/no, JSON, and Chrome's Prompt API shape. `tools/libs.mjs` checks, builds and publishes them.
- **The model mirror is for tablefolk.world**: other sites using the libraries download the models from Hugging Face (Breeze TTS 2 too, which came only from the mirror before).

## 2026-11-12

- **Menus**: a character can have a JRPG-style menu of choices that opens when you talk to it (E). Click a choice, press its number, or type or say anything: "the second one", "can you fix my armor" or "my chainmail is dented" find the right choice (by number, words, meaning, or the characters' model), and words that fit none can go to the character as ordinary chat. Choices can say a line, run a command or open another menu; scenarios share menus by id (`menus`).
- **The characters can think on OpenRouter**: Settings has "Characters' brain online": sign in with OpenRouter (or paste a key) and the characters use your own OpenRouter account (Gemma 4 26B by default, any model by name), for devices that can't run the in-browser model or for a bigger brain. When the in-browser model fails to load, the game offers it. Back to the in-browser model is one click.
- **Smarter model choice for every device**: the app now measures the graphics memory's speed (about a tenth of a second, once), tells phones, tablets and computers apart, reads the processor architecture, and estimates shared memory from every sign it has (the browser's figure, the chip's name, an NVIDIA GPU on an Arm computer such as the RTX Spark whatever it is called, a measured wide memory bus). A model must fit and be predicted fast enough; a model measured too slow on this device is not picked by itself again. The This device pane shows each figure and why the model was chosen.
- **Phones default to light speech**: on a phone or tablet, Automatic speech input is the browser's own recognition (not Underdog Bark's 1 GB download), and the voice is Pocket-TTS (Breeze TTS 2 is no longer offered or chosen there, even if downloaded before). A phone reports its whole shared memory (8 GB on a Pixel 9a), which looked like room for both.
- **Pocket-TTS from our own mirror**: both Pocket-TTS models (the 18M English and the 100M five-language one) download from R2, with Hugging Face as the fallback.
- **Three more models from our own mirror**: Qwen1.5 0.5B (the Oracle), Gemma 4 E2B with sight and Bonsai 2 27B now download from R2 (faster than Hugging Face), with Hugging Face as the fallback; a copy already cached from Hugging Face keeps being used.
- **Libraries from our own server**: `tools/vendor-fetch.sh` downloads Babylon.js, its loaders, Havok (and its wasm), the `studio.env` environment texture, pako, UPNG and html2canvas into `app/vendor/` with a manifest; the app loads those copies first and falls back to the CDNs. The app then runs where only our own server is reachable (cloud test machines), and the public site stops depending on Babylon's CDN. All are vendored now (Babylon 9.35.0, 12 MB). Still from outside: the character-brain modules in `llm_js/` (jsdelivr, esm.run, Hugging Face) and the tile models hosted on R2.
- **Screenshots with no GPU**: `tools/browser-test/cloud-shot.py` renders the app on a cloud VM (Playwright's Chromium on Mesa lavapipe), reads the 3D frame from the GPU and lays it into the page screenshot; `OFFLINE=1` blocks everything but localhost. The Oracle (`?art=1`) is ready in 7-17 s there.

## 2026-11-11

- **Downloads show on screen**: while Breeze TTS 2 or Underdog Bark (speech input) downloads or loads, a card under the top bar shows what it is doing with a progress bar, without opening the Voice pane (`app/load-status.js`).
- **C cycles all three views**: free camera, follow camera, first person, and round again (V still goes straight to first person).
- **Longer speech bubbles that wait for the voice**: up to 256 characters, wrapped, instead of one line of 86; a voiced line's bubble stays until its voice has finished.
- **What they said before**: a 💬 floats over a character for 45 s after it speaks; hovering the character or the 💬 shows a card with its recent lines (how long ago, ▶ to hear one again), and tapping the 💬 keeps it open.
- **The history card opens only from the 💬**: hovering a character just shows its 💬 (it opened the card too, too easily); the card opens on the 💬 or within a few pixels of it.
- **Hold-to-talk**: the 🎤 records while held (mouse, touch, or Space on the button) and sends on release; a very short tap is dropped with a hint.

## 2026-11-09

- **See what runs and why**: Settings shows **Running now** (the characters' model, the voice, the speech input, the graphics, each with its state and the reason it was chosen) and links a new **This device** pane: the graphics card and its memory, what is left beside the characters' model, the browser's abilities, storage, and every decision and fallback with its time ("copy this report"). The 🔊 button's tooltip names the voice.
- **Breeze is the voice wherever it fits**: the voice used to be the site's default (Pocket-TTS) unless picked by hand. Breeze TTS 2 in the browser is now chosen whenever it was downloaded and the graphics card has room beside the characters' model, and offered once when it would fit (a 2.5 GB download in the background while the current voice keeps talking; then it takes over). With the Oracle's Qwen 0.5B on a 6 GB card it fits (the tiny model now counts 1 GB, not 3). Tested on tablefolk.world: offered after the model loaded, downloaded and speaking in 75 s.
- **The 🎤 is ready when you click it**: Underdog Bark loads by itself after the characters' model once you have approved it; meanwhile the button is greyed out with its progress (a first click asks, then loads before recording, instead of recording into a long wait).
- **The Oracle's head no longer shows through his hat**: the hat's lower part is fitted to his head (tools/wizard-extras.mjs measures the face's and the body's vertices, the ears included, at each height and widens the cone to clear them by 15%), the hair is pressed flatter, and the low stars moved up the cone.
- **The models load on the public site**: Hugging Face refuses requests from pages on `*.workers.dev` (a 404 without CORS, so the characters' model and the voice "failed to fetch" there); the site now sends no Referer. Checked on tablefolk.world: the Oracle's model downloads and loads, the voice loads, and he answers.
- **tablefolk.world is on Cloudflare**: the game, the worlds and the world builder as a Cloudflare Worker with static files (`cloud/`, `bun cloud/build.mjs` then `wrangler deploy`), live at tablefolk.runvnc.workers.dev and at tablefolk.world once its nameservers move. It runs no AI of its own: visitors build and play with a model in their browser or their own key or server. The builder's checks, prompts and page moved to `server/worldgen-core.js`, shared by the Bun server and the Worker.

## 2026-11-08

- **Build worlds with your own key**: the world builder's "Your own key" runs the generator on your OpenRouter account (one click: **Sign in with OpenRouter**, or paste a key) or on any OpenAI-compatible server, a local one too (with a note on CORS for llama.cpp, Ollama and LM Studio). Your browser calls the model itself and keeps the key; the server only gives out the prompt and checks the result (`POST /api/worldgen/messages`, `/api/finish`), repairs and "ask the AI for changes" included. "Also for the characters" points the game's characters at the same key, and the game's Brain options gained OpenRouter presets that use it. **"Visitors bring their own model"** (admin page, `BYO_MODEL=1` or `--byo-model`): visitors may then only build and play with a model in their browser or their own key or server, never this server's key or GPU. The builder's in-browser models are Gemma 4 E4B, E2B and Bonsai 2 27B, downloaded on first use (they had to be loaded in the game first).
- **The scenario banner starts small**: just the world's name and a little "?" in the top right; clicking it opens the goal, turn count and buttons as before ("–" shrinks it again). It covered part of the view.
- **First-person zoom goes where you point**: the wheel narrows the view towards whatever the mouse is over (the view turns so that spot stays under the pointer), so you aim the zoom just by moving the mouse instead of dragging the view first; zooming out returns.
- **The market village draws in 91 calls instead of 156** (the Oracle 72 instead of 94), about a quarter less CPU a frame: each model's pieces are merged by finish when it loads (a bookcase was 14 draw calls, one per colour; colours go into vertex colours), each villager's arms, legs, body, head and hat become one mesh on one skeleton (they were 7-9 meshes, each with its own copy of the skeleton to pose every frame), a door's iron fittings and rings are one mesh, a lantern's post and arm one, and walls, the board, floors, roofs and fences have their transforms frozen once a world is up. Everything looks the same (checked side by side) and objects still pick, carry, break and swing as before.
- **Light quality draws the Oracle's room in about half the GPU time** (8.8 -> about 5 ms a frame at 1080p on an RTX 2060), from a fine-grained profile (GPU timestamps per render pass, CPU phases, ablations; `tools/browser-test/gpu-profile/`). The floor keeps its look: each tile is a plain box wearing the sculpted tile baked from above (colour, occlusion and its surface normals, so the stones and cracks still catch the light) instead of 1,800 triangles; the columns under the board are only built at its edges (the hidden ones were shaded under the tiles, 3.4 ms); materials take at most 6 lights (4 scene lights and the 2 nearest lamps, which join the nearest-lights budget). On big boards light quality used plain boxes with flat painted overlays; it now shows the same tiles, colours and relief as medium and high. Every quality: animated bones go to the GPU as uniforms (each skeleton's bone texture went through a new GPU buffer every frame), and the new feet check no longer skins whole figures on the CPU (11 ms hitches every 8th frame for two seconds after a world loads). **The first lightning no longer freezes the picture** (194 ms, now 60-80): its glow, particle and hit-flash shaders are drawn once, invisibly, when a world starts, and at light quality spells add no point light (a new light recompiles everything it reaches).
- **Characters cast a soft contact shadow**: light quality has no shadow maps, and without anything under them the Oracle's flat-soled boots looked sunk into his rug (they stood 2 cm above it). A dark blurred patch under every figure's feet (app.js contactShadow) grounds them at every quality.
- **No foot sinks into the floor**: a figure's lowest point is measured through its idle clip (about two seconds, CPU skinning, hidden bodies too) and the model raised by any dip below its feet. It was the player's wanderer in the Oracle's room, 9 mm into the rug; the Oracle himself already stood clear.
- **The repetition penalty works on wllama models**: it was sent as `penalty_repeat`, which wllama 3's engine ignores, so no model running in wllama ever had one ("say lilac ten times" said it ten times at 1.8). It goes as `repeat_penalty` now, over the last 256 tokens (the conversation, not 64), so the Oracle stops coming back to one odd word ("lilac"). The Oracle's chaos is 55 (temperature about 1.76, was 2.0).
- **No memory model for the Oracle**: a world can set `"memory": false`; simple-mode characters skip meaning-based recall (their prompt has none), and the memory model isn't loaded at all in a world where memory is off or every character is in simple mode. Checked: The Oracle leaves it idle, Goblin Bakery loads it.
- **The Oracle's lightning has examples, `lightning(Pilgrim)` or `lightning()`**, and a threatened bolt strikes the one he's talking to unless he names himself; in 20 test replies 4 bolts hit the player and 1 hit him (he had always killed himself). **The memory model (EmbeddingGemma) loads when the page opens** (ready about 13 s in) instead of at the first turn, which delayed that reply; its "downloading" toast shows only when the weights are not already in Cache Storage.
- **No approach notice for characters who speak only when spoken to** (The Oracle): walking up to them no longer tells them "Pilgrim comes up to you..." or prompts them to greet you, and simple mode leaves such notices out of the prompt; the tiny model answered the notice instead of you.
- The Oracle at chaos 63 (temperature 2.0): 8 lightning in 20 replies, nearly all at insults and dares, and he still answers the questions after (chaos 50: 2; chaos 30: 1; chaos 1: 0-4 in 30).
- **The Oracle only has lightning**, with a two-line prompt; a reply that threatens lightning ("I shall strike you with lightning!", not "I cannot...") is cast as well as said, at you when it says "you". Commands are cut from his past replies in the history. The crystal ball's hum is far quieter and heard from where the view seems to be: the camera, nearer when zoomed (first person's narrower view counts), falling with the square of that distance (about -54 dB from the start, -38 zoomed in on it).
- **The Oracle answers again after a spell**: in simple mode a reply that was only a command is left out of the model's history, with the words that provoked it, so one spell no longer turns every later reply into spells (an insult then five questions: 10 of 18 replies were spells or blank, now 4 of 18). The crystal ball's hum is louder and an octave higher (laptop speakers lost its 98 Hz), and the wizard stands 1.6 cm higher so no shoe sinks into the rug.
- **The Oracle a little bigger, his crystal ball smaller, and it hums**: characters take `"scale"` (0.5-2; the Oracle 1.2); the crystal ball is shown at 0.72 (objects take `"scale"` too) and gives off a quiet, slowly swelling 3D hum (two low sines a fifth apart and a faint shimmer, off with the sound effects). The Oracle's chaos is back to 1 (it was 30).
- **Speech is on by default again**: a saved "off" from before today is dropped once (until yesterday the 🔊 button showed 🔇 at startup while speech was on, so clicking it to unmute turned speech off and saved that); choices made from now on are kept. A world can switch voices off for everyone with `"speech": false`.
- **Short links to the worlds in `scenarios/`**: `/oracle` opens The Oracle, `/goblin-bakery` Goblin Bakery (a leading "the-" can be left out; the link's own query passes on, e.g. `/oracle?intro=1`). The share button copies the short link for a world straight from its file.
- **One fireball kills the Oracle** (3 hit points). Qwen2.5 0.5B is out of the model menus (still loadable with `?model=qwen2.5-0.5b`).
- **Oracle-like things at the heart of his chamber**: three new objects built in code, `crystal_ball` (violet light swirling in dark glass on a gilded pedestal), `scrying_pool` (a golden bowl of glowing water with ripples and a faint mist) and `rune_circle` (gold runes and a seven-pointed star inlaid in the floor, turning slowly). The Oracle stands on a rune circle between a crystal ball and a scrying pool, where the plain cauldron was; `spawn()` can conjure them, characters see them, the ball and pool are solid and too heavy to carry.
- **The fireball looks like fire**: the charge in his hands is a small orange core with tongues of flame and sparks drawn in, the ball and its explosion are orange flame (alpha-blended tongues, a small additive core) instead of a white-yellow blob that hid the caster. Every textured spell glow was white because its texture was added to its colour; it is tinted now.

- **The Oracle talks with his mouth and holds his staff upright**: wizard.glb has lips, teeth and a dark mouth under the moustache that open with his voice (a `mouth_open` morph target; the beard drops with the lower lip like a jaw; any figure with such a target talks with it, closed when silent or with voices off), and his idle holds the staff upright like his walk, longer now, the orb above his hat's brim instead of at his hip (`tools/wizard-extras.mjs`, tile redrawn).
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
