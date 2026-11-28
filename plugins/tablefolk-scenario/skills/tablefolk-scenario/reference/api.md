# The API: making a game as a package

Everything a package author can use without editing the game, in one
place: the module contract, the `api` a module is handed, the supported
part of `window.tablefolk`, the events, and the data schemas with a
minimal example each. [packages.md](packages.md) says how packages are
named, found, trusted and published; `packages/nightwatch/` (its
`README.md` walks through it) is a whole small game built only from what
this chapter lists.

Names written here exist in the code: `node tools/check-api-doc.mjs` fails
when one of them no longer does.

## The module contract

A package's `"modules"` (and a skill's `"module"`) are ES modules whose
default export receives the `api` and returns what it adds. Every key is
optional.

```js
export default function (api) {
  return {
    commands:   { signal: { run(g, args, ctx) {}, help: 'signal() - light the beacon', usage: 'signal()', example: 'signal()', allowedBy: 'listed',
                            offer(g, world) { return 'signal the militia' /* or null */; } } },
    goals:      { beacon_burning(args, world) { return true; } },
    uses:       { tend_beacon(thing, who, api) { return 'feeds the fire'; } },
    threats:    { wolfpack(c, ctx) { return true; } },
    cards:      { beacon(g, data) { return 'The beacon burns.'; } },
    effects:    { kindle(g, value, target, how, ctx) { return 'it flares up'; } },
    behaviours: { hammer: { on: 'tablefolk-player-turn', run(g) {} } },
    steps:      { refuel(g, step, ctx) { return { done: true, ms: 3000 }; } },
    // God / Dungeon Keeper play (below, "Powers, resources, designations, demands, weather")
    designations: { shrine_ground: { label: 'shrine ground', shape: 'rect', work: { paint: 'flagstone' } } },
    powers:     { bread_gift: { label: 'Gift of bread', icon: '🍞', cost: { favour: 3 }, target: 'character', run(t, ctx) { api.give(t.who, 'bread', 2); return 'Two loaves appear.'; } } },
    resources:  { favour: { label: 'Favour', icon: '✨', start: 10, max: 60, perHour: (v, ctx) => 1 + 0.5 * (ctx.groups.faithful || 0) } },
    demands:    { offering: { label: 'an offering', keywords: ['offering'], parse(text, ctx) { return { text: 'Bring 2 bread to the temple.', met: { deliver: { item: 'bread', n: 2, to: 'temple' } } }; } } },
    weather:    { golden_rain: { base: 'rain', color: [1, .86, .45] } },
    dispose() {},
  };
}
```

| key | signature | what it does |
|---|---|---|
| `commands` | `run(g, args, ctx)` | a command characters (and the player, `/signal`) can use. `g` the actor, `args` the words between the brackets split on commas. Return a string (it worked: the result line everyone reads), `true` (worked; you called `ctx.narrate`), or `ctx.fail("why")` / `false` / throw (the actor's next prompt reads `signal FAILED: why`). `ctx`: `{ name, args, narrate(text), fail(text), findTarget(word), api }`. `help` is the prompt's line (start it with the usage, `signal() - ...`), `example` follows it. `allowedBy`: `"default"` every character with a mind in a scenario that loads the package, `"listed"` only those whose `allowed`, role `commands` or job `commands` name it. The player may always use them. |
| `commands[name].offer` | `(g, world)` | optional: a label (or `{ label, line }`) when the command fits the moment, else `null`; the game's short picks (a decision point, danger, a stuck job, an event; jobs.js) then include it as an option that runs `usage` (or `line`). Without code, `when` (a condition with `me`, flags and the variables `raiders`, `raider_near`, `hour`, `hungry`) and `offer` (the label) do the same. |
| `goals` | `(args, world)` | a goal predicate: `"win": { "beacon_burning": true }` calls it with `true`; return a boolean. |
| `uses` | `(thing, who, api)` | what using an item whose `"use"` is this name does: E by the player (`who` the player's avatar) or `use(thing)` by a character (`who` that character). Return a string (what happened), `true`, `false` (nothing happens), or `{ fail: "why" }`. |
| `threats` | `(c, ctx)` | one turn of a raider of the threat kind with this name. `ctx`: `{ spec, group, retreat(why), despawn(), walkTo(x, z), attack(target), api }`; `group.ids` are its pack. Return `false` to let the kind's `behaviour` (`raid`, `pilfer`, `rob`) take the turn. |
| `cards` | `(g, data)` | a state-card line for characters whose skills name it (`"card": ["beacon"]`); a line starting with `!` is urgent and goes at the very end of the prompt. Return a string, a list, or `''`. |
| `effects` | `(g, value, target, how, ctx)` | an effect any skill entry can list (`{"kindle": 3}`); return a string to add to the result line. `target`: `{ who, thing, kind, pos }`. |
| `behaviours` | `{ on: '<event>', run(g) }` | a routine run on a game event for characters whose role or skill lists it. |
| `steps` | `(g, step, ctx)` | a job step kind (`{"refuel": true}` in a job's `steps`). Return `{ busy, ms }` (still at it), `{ done, ms, worked }`, `{ skip }`, `{ fail: "why" }` or `{ need: { item, n } }` (out of something: the job's fallbacks). `ctx`: `{ state, job, setDoing(text), goTo(x, z, label), goDo(thing, line), runLine(line), things(kind), nearest(list), count(item) }`. |
| `designations`, `powers`, `resources`, `demands`, `weather` | objects | God / Dungeon Keeper play: new mark kinds with their work, player-side actions with a cost and a target, named world variables on a HUD, demand templates, weather kinds ([below](#powers-resources-designations-demands-weather)). All but `powers` may also be data in `tablefolk.json`. |
| `dispose` | `()` | the scenario that loaded the package has ended: remove what you made that is not part of the map (lights, particles). Listeners and timers made with `api.on` / `api.every` are removed for you. |

A module is called once per scenario that loads its package (the file is
imported once; the default export runs again with a fresh `api`), so keep
state inside the function, not at the top of the file.

## The `api` object

| member | what |
|---|---|
| `api.state`, `api.meta(mesh)` | the world (`state.characters`, `state.playerAvatar`, `state.player`...) and a thing's data (`meta(mesh).state`, `.opts`, `.type`). Read freely; change through the functions below where one exists. |
| `api.things(type?)` | the things on the map: `[{ type, x, z, mesh, state }]`, all or one type |
| `api.people()`, `api.player()` | the characters standing (not defeated); the player's avatar |
| `api.inventory(who)` | `{ gold, items: [{ name, qty }] }` of a character, the player's avatar or `'player'` |
| `api.give(who, item, n)`, `api.take(who, item, n)` | add or remove items (false when there were not enough) |
| `api.getBrainConfig(id)`, `api.setBrainConfig(id, patch)` | a character's settings: personality, hp, allowed, inventory, mind... |
| `api.runAs(id, line)` | a command line as that character, as if it chose it (`'walk(beacon)'`); awaits the result |
| `api.spawn(id, model, x, z, cfg)` | a new character (a unique id is made from `id`); `cfg`: `style, personality, hp, items, gold, allowed, role, hostile, facing` |
| `api.findTarget(g, word)` | a person or thing by name, as commands find them |
| `api.say(g, text, voiced)`, `api.narrate(g, text)`, `api.narrator(text)`, `api.log(text)` | a line from a character, a result line in its turn, the narrator's line, the log |
| `api.toast(text, type)`, `api.badge(g, text)` | a message to the player; a word over a character or thing |
| `api.playClip(target, name, { loop })` | a clip of a thing's model or a character's body (a body's own clip name, the file's clip name, or a game mode: `pickup`, `wave`, `hammer`...) |
| `api.sound(name, at)` | a sound by name (a package's `sounds` first, then the built-in ones) at a position or character |
| `api.flag(name)`, `api.flag(name, value)` | read or set a world flag (story.md conditions, goals, menus see it as `world.<name>`) |
| `api.clock()` | `{ min, day, hour }` or null |
| `api.addMemory(g, text, weight)` | something a character remembers |
| `api.combat` | `attack(g, target)`, `hurt(g, n, by, how)`, `heal(g, n)`, `wield(g, item)`, `hpOf(g)` |
| `api.effects` | the skill effects by name (`damage`, `heal`, `vfx`...) to call from code |
| `api.on(event, fn)`, `api.every(ms, fn)` | listen to a game event; run something every so often (both stop when the scenario ends) |
| `api.light(x, z, { y, color, intensity, range })` | a point light inside the scene's light budget; `dispose()` it |
| `api.freeCell(x, z, r)` | the nearest free, walkable cell, or null |
| `api.scene`, `api.BABYLON`, `api.vec(x, y, z)` | the Babylon.js scene and library for effects of your own |
| `api.bar.add({ id, label, icon, title, run })`, `api.bar.remove(id)` | a button on the power bar (removed when the scenario ends) |
| `api.resource(name)`, `api.resource(name, delta)` | a resource's value; add to it (clamped to its limits) |
| `api.decider()` | true when the decision model (the Strands Decider, `app/decider.js`) is loaded beside the brain on this device; off by default where it does not fit (see brains, "Strands Decider in the game") |
| `await api.choose(text, items, question, { min = .4, context })` | words to one of `items` (`[{ id, label }]`) by the decision model: `{ id, confidence, probabilities, ms }` (`id` null with `unsure` below `min`), or null when it is not loaded: fall back to your own rules, `tablefolkMenu.match` or the brain. 0.25-0.5 s on a 12 GB card, 1.2-2 s on a 6 GB one |
| `await api.decide(state, questions)` | the decision model's own call (`{ key: { type: 'choice', instructions, criteria: { id: description } } | { type: 'noul', instructions } }` -> `{ key: { choice, probabilities, confidence } | { noul } }`), or null when it is not loaded |
| `api.weather()`, `api.weather(kind, { intensity, duration, area, wind })` | the weather now; set it (a base kind or a package's) |
| `api.designate(spec)` | mark squares for work: `{ kind, cells: [{ x, z }], priority, who }` or a plan by relation `{ verb: "wall", around: "shrine", gate: "north" }`; returns the designation (a plan: `{ d, warnings }` or `{ error }`) |
| `api.demand(spec)` | make a demand (below); returns it, or `{ error }` |
| `api.groups()`, `api.groupOf(who)` | the world's groups `{ id: { name, members, autonomy } }`; the group ids a character belongs to |

## `window.tablefolk` and the other globals

The game's own scripts publish more than this; what is listed here is the
supported part (other members are internal and may change).

| function | what |
|---|---|
| `window.tablefolk.getAgents()`, `.getPlayerAvatar()`, `.getPlayer()` | the characters; the player's avatar and gold and items |
| `window.tablefolk.getBrainConfig(id)`, `.setBrainConfig(id, patch)` | a character's settings |
| `window.tablefolk.getObjects()`, `.findItem(items, name)` | the things on the map; an item in a list by name |
| `window.tablefolk.spawnAgent(id, x, z, facing, model)`, `.makeObject(type, x, z, opts)`, `.disposeWorldObject(mesh)` | add a character or a thing; remove a thing |
| `window.tablefolk.runAs(id, line)`, `.parseLLMCommandLine(line)` | run a command as a character; parse one |
| `window.tablefolk.getAllowedCommands(id)`, `.getAgentPerception(id, radius)`, `.buildAgentPrompt(g, cfg)` | what it may do, what it sees, its whole prompt |
| `window.tablefolk.isFailedEntry(entry)`, `.markFailed(g)` | whether a history line was a failure; mark the actor's last one |
| `window.tablefolk.isTurnReady()`, `.saveWorldState()`, `.worldStateData()`, `.restoreWorldState(data)` | turns; saving and loading |
| `window.tablefolk.setLighting(mode)`, `.setCameraView(view)`, `.log(text)` | `bright`/`dim`/`night`; `overview`/`follow`/`first`; the log |
| `tablefolkScenario.playScenario(json)`, `tablefolkScenario.active` | start a scenario; the running one (`scn`, `ended`, `result`) |
| `tablefolkStory.get(name)`, `.set(name, value)`, `.check(expr, { me })` | flags and conditions |
| `tablefolkWorkflows.start(id, name, input)`, `.drive(id)`, `.active(id)` | workflows |
| `tablefolkMenu.open(menu, { agentId })`, `.offer(words)` | menus; answer the open one with words |
| `tablefolkClock.now()`, `.set(min, day)`, `.isNight()` | the time of day |
| `tablefolkThreats.now(kind)`, `.active()`, `.retreat(why)`, `.registerKind(kind, def)`, `.registerBehaviour(kind, fn)` | threats (`retreat`: every group about turns for the edge) |
| `tablefolkSpells.strike(x, z)` | a bolt of lightning from the sky on a square (sound and light; the damage is yours to do) |
| `tablefolkModes.speed`, `.setSpeed(k)` | the world's speed (1, 2, 4: the clock, everyone's turns, walks (a walk's `turnMove.dur` is divided when it starts), body clips (`scene.animationTimeScale`) and physics (fixed 1/60 s steps, that many more a frame) that much faster), for time controls; `tablefolkLive.start()`, `.stop()`, `.toggle()`, `.on` pause it |
| `tablefolkJobs.jobOf(g)`, `.register(manifest)`, `.registerStep(name, fn)`, `.tick(g)` | jobs |
| `tablefolkProfile.normalize(v)`, `.resolve(sources)`, `.describe(p)`, `.PRESETS`, `.DOMAINS` | autonomy profiles: a preset or an object to a profile of six domains, `code` or `model` |
| `tablefolkAgency.profile(g)`, `.domain(g, name)`, `.level(g)`, `.why(g)`, `.setting()`, `.setSetting(v)`, `.options(g, state, job)`, `.stats()`, `.probe.run()`, `.probe.result()` | autonomy: `rails`, `guided` or `free` for a character and why; the player's setting (`auto` or a level); the activities it could start now; plans and results; the capability check (living.md, "How much characters decide") |
| `tablefolkUses.register(kind, def)`, `.stockOf(thing)` | kinds of use; what a thing has left |
| `tablefolkChatter.say(g, kind, slots, { to })`, `.add(pools)` | a templated line from a pool (living.md, "Spoken life"); add pools |
| `tablefolkTalk.speak(g, text, { to, answer })` | a line as the character's own, told to those in earshot; `answer`: the one it is said to answers it |
| `tablefolkBodies.add(id, def, baseUrl)`, `.get(id)`, `.playClip(g, name, { loop })`, `.emote(g, name, loop)` | bodies and character clips |
| `tablefolkSfx.play(name, pos)`, `.register(name, url)`, `.requested` | sounds; the last ones asked for |
| `tablefolkSkills.addCommand(name, def)`, `.commandLines(g)`, `.cardLines(g)`, `.run(g, name, args)` | commands and skills |
| `tablefolkPackages.load(ref)`, `.refUrl(ref, kind)`, `.api()`, `.useThing(mesh, who)`, `.allowedList()`, `.untrust(scope)` | packages and code trust |
| `tablefolkCombat.attack(g, target)`, `.hurt(g, n, by, how)`, `.heal(g, n)` | combat |
| `tablefolkDesignate.add(spec)`, `.addPlan(plan, opts)`, `.cancel(id)`, `.list()`, `.setPriority(id, p)`, `.kinds()`, `.registerKind(id, def)`, `.planWords(text)`, `.gameMap()` | designations: squares marked for work, the kinds, the plan language on this map |
| `tablefolkDemands.create(spec)`, `.cancel(id)`, `.refuse(id, who, why)`, `.list()`, `.open()`, `.templates()`, `.registerTemplate(name, def)`, `.forCharacter(g)` | demands |
| `tablefolkOrders.add(rule)`, `.remove(id)`, `.list()`, `.fromWords(text)`, `.describe(rule)` | standing orders |
| `tablefolkGroups.all()`, `.get(id)`, `.of(charId)`, `.members(id)`, `.autonomyOf(charId)`, `.join(id, charId)`, `.leave(id, charId)` | groups |
| `tablefolkPowers.register(name, def)`, `.use(name, target)`, `.list()` | powers |
| `tablefolkResources.declare(name, def)`, `.get(name)`, `.add(name, n)`, `.set(name, v)`, `.can(name, n)`, `.list()` | resources |
| `tablefolkWeather.set(kind, opts)`, `.clear()`, `.now()`, `.kinds()`, `.register(kind, def)` | the weather |
| `tablefolkBar.add(button)`, `.remove(id)`, `.list()` | the power bar |
| `tablefolkJobs.addWork(fn)`, `.addUrgent(fn)`, `tablefolkAgency.addOptions(fn)` | work before a worker's own steps on rails, before everything but its danger, and activities offered above rails: `fn(g, s, j)`; `.removeWork(fn)`, `.removeUrgent(fn)`, `.removeOptions(fn)` take them off again (a package's `dispose()`) |
| `tablefolkScenario.travel(link)`, `.section`, `.here()`, `.links()`, `.sections()` | a world in sections: follow a link (`{ to: "back" }` goes back), the id of the section the player is in, its scenario, its links, every section with its links (things.md) |
| `tablefolkDark.mode()`, `.visible(x, z)`, `.save()`, `.restore(data)` | fog of war and reveal: the mode, whether the player sees a square, the explored state |

## Events

All on `window`, as `CustomEvent`s; read `e.detail`.

| event | detail | when |
|---|---|---|
| `tablefolk-scene-ready` | `{ meshes, materials }` | the 3D scene is up (once) |
| `tablefolk-scenario-started` | `{ title, live, sub, section }` | a scenario has been built (`sub`: a section walked into; `section`: its id, `''` for the top map) |
| `tablefolk-section` | `{ from, to, title, kind, via, followers }` | the player went from one section to another (ids; `kind`: the link's, or `back`; `followers`: who came along) |
| `tablefolk-clock` | `{ min, day, hour }` | every game quarter hour of a living world |
| `tablefolk-player-turn` | `{ kind }` | the player acted (moved, used, attacked...) |
| `tablefolk-player-chat` | `{ agentId, text }` | the player said something to a character |
| `tablefolk-agent-turn` | `{ agentId, line }` | a character's turn ended |
| `tablefolk-say` | `{ agentId, text, voiced, templated, to }` | a character spoke (or an action line, `voiced: false`); `templated`: the pool kind of a line said by code (`sale`, `raid`...), else false; `to`: who it was said to |
| `tablefolk-attacked` | `{ agentId }` | a character was attacked |
| `tablefolk-defeated` | `{ id, by }` | someone was struck down (`id` may be `player`) |
| `tablefolk-approached` | `{ agentId, by }` | someone came up to a character |
| `tablefolk-flag` | `{ name, value, was }` | a world flag changed |
| `tablefolk-menu` | `{ menu, item, agentId, how, text }` | a menu choice was taken |
| `tablefolk-workflow` | `{ agentId, name, ended, vars }` | a workflow ended |
| `tablefolk-model-call` | `{ agentId, kind }` | the language model was asked something (`reply`, `pick`, `cause`, `remark`; above rails `choose`, `plan`, `reaction`, `raidpick`, `free`, `talk`, `react`...) |
| `tablefolk-activity` | `{ agentId, phase, key, kind, label, by, routine, outcome, reason, why, minutes }` | above rails: an activity started or ended (`by`: `model`, `plan`, `code`, `safety`, `fallback`; `outcome`: `done`, `failed`, `interrupted`) |
| `tablefolk-plan` | `{ agentId, items, why, revised, reason, notes }` | above rails: a day plan written or revised (with the reason), or notes rewritten with `plan(...)` |
| `tablefolk-agency` | `{ agentId, what, kind, detail }` | above rails: a pick and its answer, a nonsense answer, a safety net, a loop set aside, the turn budget |
| `tablefolk-thinking` | `{ agentId, thinking }` | the model started or stopped thinking |
| `tablefolk-load` | `{ key, label, state, ... }` | a download's progress (speech input) |
| `tablefolk-designation` | `{ id, kind, status, done, total, by }` | squares were marked, worked, finished or cancelled |
| `tablefolk-demand` | `{ id, status, text, of, by }` | a demand was made (`open`), `met`, `missed`, `refused` or `cancelled` |
| `tablefolk-order` | `{ id, text, when }` | a standing order fired |
| `tablefolk-power` | `{ name, target, from }` | the player used a power |
| `tablefolk-weather` | `{ kind, intensity, area }` | the weather changed |

## The data schemas

Everything below is data: it loads from any site without asking. Paths are
relative to the manifest (`pack.json` or `tablefolk.json`).

### Items (object types)

```json
"items": { "woodpile": { "file": "models/woodpile.glb", "w": 1.3, "h": 0.45, "d": 0.8, "fit": "footprint", "static": true,
  "stock": { "item": "firewood", "count": 6, "regrow": 0 },
  "gather": { "gives": "firewood", "time": 3, "anim": "pickup", "verb": "takes {a} from the {t}" } } }
```

`file` (glTF/GLB), size `w h d` in cells, `fit` (`height`, `footprint`),
`scale`, `visualYOffset`, `visualRy`, `mass`, `static`, `flammable`,
`material`, `aliases`, `tags`; `loop` (a clip played from the start, `true`
for the first); `use` (below); `stock`, `gather`, `station` (things.md,
"Stock and stores"). Clip names may be written without the armature prefix
(`Rat_Idle` for `RatArmature|Rat_Idle`).

### Use

```json
"use": { "text": "{{player}} winds the music box", "anim": "Rat_Jump", "loopAnim": false, "who": "pickup",
         "give": "silver coin", "gold": 2, "once": true, "state": "played", "sound": "chime", "what": "wind it" }
```

Or a module's name: `"use": "tend_beacon"`. `anim` plays on the thing,
`who` on whoever used it, `state` becomes the thing's state (goals:
`prop_state`), `once` refuses a second use, `what` offers it in the
characters' prompt.

### Bodies

```json
"bodies": { "dire_wolf": { "model": "models/dire_wolf.glb", "h": 0.95, "kind": "monster", "mindless": true,
  "clips": { "idle": "Idle", "walk": "Walk", "run": "Gallop", "attack": "Attack", "hit": "Idle_HitReact_Left", "death": "Death", "howl": "Idle_2" },
  "emotes": ["howl"], "natural": { "dmg": 3, "name": "great fangs" }, "hp": 8, "gender": "m" } }
```

`model` (a rigged glTF/GLB with its clips), `h` (standing height in cells:
a person is 1.3), `clips` (the game's names `idle walk run attack hit death
sit sleep work talk cast pickup` and any of your own, mapped to the file's
clip names; a missing one falls back as for the built-in bodies), `emotes`
(custom clips `emote(name)` plays; `emote(name, loop)` keeps it going),
`kind` (`person`, `monster`, `animal`), `mindless` (fights with no model;
default for monsters), `natural` (its attack), `hp`, `gender` and `voice`
(a voice id for speaking bodies), `footprint` ([w, d] cells it blocks, for
big bodies), `lift` (hover height), `ry` (a model made facing another way),
`tile` (accepted; the world builder's map editor still draws a lettered
token). A model with a `mouth_open` morph target talks with it. A scenario
using one lists its id in `"bodies": ["dire_wolf"]`: the world builder and
`scenario_link.py` cannot fetch packages, and keep a listed body.

### Sounds

```json
"sounds": { "howl": "sounds/howl.ogg", "clang": ["sounds/clang1.ogg", "sounds/clang2.ogg"] }
```

A list is picked from at random. Fetched on first use and cached; a
package's sounds are forgotten when its scenario ends. `use.sound`, a job
step's `sound`, a threat's `sound`, a `do` action's `sound` and
`api.sound()` find them first.

### Jobs

```json
"jobs": { "beacon_keeper": { "match": "\\b(beacon|keeper)\\b", "hours": [16, 8], "sleep": [9, 15], "watch": "night",
  "workplace": ["signal_beacon"], "commands": ["signal"],
  "steps": [
    { "gather": "woodpile", "when": "world.beacon_fuel < 5 and not me has firewood" },
    { "use": "signal_beacon", "needs": { "firewood": 1 }, "optional": true, "anim": "pickup", "doing": "feeding the beacon" },
    { "pace": "square" } ],
  "fallback": [{ "gather": true }, { "idle": "pace" }] } }
```

Steps and fields: [skills-and-roles.md](skills-and-roles.md#jobs). Any step
takes `when` (a story.md condition, `me` the worker), `anim` and `sound`
(once it is done); `use` goes to a thing and uses it; a module's `steps`
add kinds. `commands` lets the job's workers use package commands with
`allowedBy: "listed"`, and its rules run one by code:

```json
"commands": ["signal", { "run": "signal()", "at": "signal_beacon", "when": "world.beacon_lit and raiders > 0 and not world.militia_called" }],
"defends": "signal_beacon"
```

`defends` (fighters): stay by that thing, place or person and take on the
raiders near it. `lines`: the job's own templated lines.

### Threats

```json
"threats": { "wolfpack": { "who": "dire_wolf", "name": "direwolf", "count": 3, "when": "night", "every": 1, "from": "edge",
  "behaviour": "raid", "retreat": "dawn half", "scares": true, "hp": 8, "sound": "howl",
  "announce": "Howling below the walls: {name}s are circling the fort!" } }
```

Fields: [living.md](living.md#threats-threats). A module function of the
same name runs each raider's turn.

### Lines

```json
"lines": { "sale": ["Mind, it's hot from the forge, {name}."], "raid": { "gruff": ["{raiders}! Grab a hammer!"] } }
```

Kinds and slots: [living.md](living.md#spoken-life-templated-lines). A
job's `"lines"` has the same form.

### Stock and uses

`stock` and `gather` on items (above). A package's `uses` adds kinds
characters can use: `{ "loom": { "types": ["loom"], "anim": "saw", "time":
4, "verb": "weaves at the {t}", "gives": "cloth", "what": "weave" } }`.

### Skills

```json
"skills": { "watchkeeping": { "prompt": "You keep the watch.", "card": ["beacon"],
  "commands": { "kindle": { "usage": "kindle()", "help": "feed the beacon a log", "target": "none", "needs": "firewood",
                            "effects": [{ "take": "firewood" }, { "kindle": 3 }] } } } }
```

Fields: [skills-and-roles.md](skills-and-roles.md#writing-a-skill).

### Roles

```json
"roles": { "keeper": { "duty": "You keep the beacon burning.", "commands": ["say", "signal"], "skills": ["watchkeeping"], "temperament": "gruff",
  "on": { "event": "approached", "start": "briefing", "once": true } } }
```

`on` (roles and skills): start a workflow when an event happens to the
character (`agentId`), `when` a condition holds, `once` at most.

### Workflows, menus and triggers

```json
"workflows": { "briefing": { "steps": [
  { "id": "ask", "menu": { "items": [{ "id": "duty", "label": "What is my duty?" }, { "id": "ready", "label": "Ready." }] },
    "options": { "duty": "duty", "ready": "done" } },
  { "id": "duty", "command": "say(\"Keep the fire burning.\")", "goto": "ask" },
  { "id": "done", "do": { "set": { "world.briefed": true }, "anim": "wave" }, "end": true } ] } }
```

A package's workflows work in every scenario that loads it (a scenario's
own win on a name). A step's `menu` may be written inline. `do` actions
(menus, workflows, triggers) take `anim` (a clip of the character's body)
and `sound`. Start one from the scenario: `"triggers": [{ "on": "start",
"as": "brenna", "do": { "start": "briefing" } }]`. Fields:
[workflows.md](workflows.md), [story.md](story.md).

## Powers, resources, designations, demands, weather

The foundations for God / Dungeon Keeper play are in the game; what a
particular game adds (its powers, plagues, blights, weather, sacrifices,
belief rules, lair rooms) is content in a package. `packages/hearth-spirit/`
uses one of each below (its `README.md`); `scenarios/hearth-spirit.json`
plays it. `packages/god/` is a whole God game made of them ([god.md](god.md)). How players see them: [living.md](living.md#marks-orders-and-demands-the-players-say).

### Designations (`designations`)

New kinds of marks for the Mark tool (and `api.designate`), with their work.
Characters whose job allows take the squares by code (on rails, in their
working hours, before their own steps; above rails as an activity they may
choose), one square each, nearest first, the highest priority first.

```json
"designations": { "shrine_ground": { "label": "shrine ground", "shape": "rect", "color": "#d9c27a", "jobs": ["*"], "maxWorkers": 2,
  "needs": { "stone": 1 }, "work": { "paint": "flagstone", "crop": "flowers", "anim": "pickup", "time": 2, "verb": "lays a flagstone" } } }
```

`shape`: `ring` (around a place, a gate), `line`, `rect`, `posts`, `path`,
`cells`; `like`: a core kind to start from (`wall`, `fence`, `dig`,
`stockpile`, `farm`, `clear`, `guard`, `patrol`); `jobs` (`"*"`: anyone),
`fighters: true` (any fighter too), `needs` (fetched per square: the job's
fallbacks gather or buy it), `maxWorkers`, `standing` (never done: posts,
routes). `work` in data: `build` (a thing's type, `gate` the type at the
gate or null for a gap), `dig`, `clear`, `paint` (a floor material), `crop`
(a type on every other square), `stand` (game minutes at a post), `anim`,
`time` (seconds), `sound`, `verb`. In a module, `run(g, cell, ctx)` does
the work instead (return a job step result; `ctx`: `{ d, cell, setDoing,
goTo, runLine, build(type), paint(mat), remove(), api }`) and `done(d, ctx)`
runs when every square is done.

Three more fields steer where a kind can be marked and when a square can be
worked: `ground` (`"rock"`: walls and rocks may be marked and need not be
reachable, digging into rock; `"floor"`: any walkable floor, roads, paved and
painted squares and the insides of walled rooms; default: open ground as the
core kinds), `accept(x, z)` in a module (`true`, or the reason a square is
left out, shown by the Mark tool) and `ready(cell, d)` (workers pass a square
over until it returns true: rock with no open side yet). `packages/keeper/`
uses all three.

### Powers (`powers`, a module's)

Player-side actions on the power bar, paid in a resource.

```js
powers: { golden_rain: { label: 'Golden rain', icon: '🌧', cost: { favour: 5 }, target: 'place', cooldown: 20,
  run(t, ctx) { api.weather('golden_rain', { area: { x: t.x, z: t.z, r: 7 }, duration: 45 }); return 'A golden rain falls.'; } } }
```

`target`: `none`, `place` (`{ x, z, place }`: a square clicked), `area`
(`{ cells, rect, x, z }`: dragged), `character` (`{ who, x, z }`), `group`
(`{ group, members }`: chosen from a list). `cost`: `{ resource: n }` (or a
number with `"resource"`); paid before `run`, refunded when it returns
`false` or `{ fail: "why" }`; a string is the narrator's line. `when(ctx)`:
show the button only while it returns true. `ctx`: `{ api, resources,
weather, designate, demands, groups, say, toast }`. Other buttons:
`api.bar.add({ id, label, icon, title, run })`.

### Resources (`resources`)

Named world variables on a small HUD (top left). Each is also the world flag
of its name, so conditions (`world.favour >= 10`), triggers and saves see it.

```json
"resources": { "favour": { "label": "Favour", "icon": "✨", "start": 12, "min": 0, "max": 60, "perHour": 1, "color": "#e8c25a" } }
```

`perHour`: a number, or in a module `(value, ctx) => change` (`ctx`: `{ api,
people, groups: { id: members }, flags }`), applied every game quarter hour.
`show: false` keeps it off the HUD. A scenario's `"resources": { "favour":
{ "start": 5 } }` sets the start. `api.resource(name, delta)` changes it.

### Demands (`demands`)

A world-state object any source can create (the player's Orders tool, a
power, the director, a scenario's `"demands"`): what, of whom, by when, what
counts as met, what follows. A character (`via`, else an elder, priest or
chief) says it aloud; every member remembers it and sees it on the state
card; on rails code does the obvious job (fetches the item and leaves it at
the place; a work demand's designations are marked for the group); above
rails "do as demanded" and "refuse" are among the activities.

```js
api.demand({ text: 'Bring 3 bread to the temple.', of: { group: 'faithful' }, by: { in: 360 }, via: 'elder_ada',
  met: { deliver: { item: 'bread', n: 3, to: 'temple' } },
  onMet: { resource: { favour: 10 }, set: { pleased: true } }, onMissed: { weather: { kind: 'storm', duration: 60 } } });
```

`of`: `"all"`, `{ group }`, `{ id }`. `by`: a game minute or `{ in: minutes }`.
`met`: `{ flag }`, `{ if: "<condition>" }`, `{ deliver: { item, n, to: a
place or a character } }`, `{ designation: true }` with `plan` (words or a
plan by relation) or `designation` (plans), or `{ check: "<template>" }`.
`"of": "player"` is a demand made of the player (a keeper's creatures want
their wages): it binds no character, the messenger (`via`) says it, and the
player sees it in the Orders tool and a toast; `met: { flag }` with a flag the
package sets is the usual way to meet it.
`onMet` / `onMissed`: script actions (`set`, `reply`...) plus `resource`,
`weather`, `narrate`. A package's demand templates read the player's words:

```js
demands: { offering: { label: 'an offering at the shrine', keywords: ['offering', 'sacrifice'],
  parse(text, ctx) { return { text: 'Bring 2 bread to the temple.', met: { deliver: { item: 'bread', n: 2, to: 'temple' } } }; },
  check(d, api) { return false; }, onMet(d, api) {}, onMissed(d, api) {} } }
```

The words go to the template the menus' matcher picks (keywords, meaning,
then the brain); `parse` gets `{ now, items, places, groups, people, api }`.

### Weather (`weather`)

Core draws and plays `rain`, `snow`, `fog`, `storm` (lightning, thunder),
`wind` and `dark` (and `clear`); a package names kinds on top of them:

```json
"weather": { "golden_rain": { "base": "rain", "label": "golden rain", "color": [1.0, 0.86, 0.45], "intensity": 0.8 } }
```

In a module a kind may add `onStart(w, api)`, `onTick(w, api)` (each game
quarter hour while it lasts) and `onEnd(w, api)`, and `sound` (a package
sound, looped). `api.weather(kind, { intensity, duration (seconds), area: {
x, z, r }, wind: [x, z] })` sets it; the flag `weather` holds the kind. A
scenario's `"weather": "fog"` (or `{ "kind", "intensity" }`) is its start.

### Groups, standing orders, the plan language

Data in the scenario, not the package ([format.md](format.md),
[living.md](living.md#marks-orders-and-demands-the-players-say)); a module
reads them with `api.groups()` / `api.groupOf(who)`, adds standing orders
with `tablefolkOrders.add({ when, do })` and turns relations into squares
with `api.designate({ verb, around, near, side, ... })` (the plan language:
`app/plan-core.js`).

## What a package cannot do yet

- Change rendering: walls, floors, lighting, the camera (the `api.scene`
  is there, but nothing is managed for you beyond `api.light` and the weather).
- Add panes to the game's interface (buttons on the power bar, a toast, the
  menus and the pick strip of powers are the ways to talk to the player).
- Replace the prompt's built-in parts or the reply parser; only add lines
  (cards, a skill's prompt, command help).
- New map generators or base maps.
