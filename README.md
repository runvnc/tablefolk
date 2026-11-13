# Tablefolk

**Set up a little world, then let the characters live in it.** Tablefolk
(tablefolk.world) is a browser toybox and platform where small language
models running on your own graphics card (Gemma 4 on WebGPU) play the
characters of little 3D worlds: they talk, trade, fight, carry notes, dig
through walls and get on each other's nerves, while you watch or join in.

- A world is a **scenario**: JSON shared as a link (`#s=...`), so the link
  is the world. Write one by hand, with the agent skill, or from a prompt in
  the **world builder** (`/world/<prompt>`).
- Characters can run on a model in your browser (free, private, no server),
  on your own OpenRouter account, or on any OpenAI-compatible server. Worlds
  can also be fully **scripted, with no language model at all**: menus,
  flags and step-by-step workflows, with typed or spoken words matched by
  meaning.
- They speak with local voices and hear you through the 🎤, also in the
  browser.
- Worlds are built from things anyone can publish: asset packs (models),
  skills (what characters can do), roles (their jobs) and packages, loaded
  from this site, any URL, npm or GitHub.
- It also prints: the tabletop view renders a map for a tabletop
  role-playing game at one inch per square.

## Run it

Play at **https://tablefolk.world**, or run your own copy:

```bash
git clone --depth 1 https://github.com/runvnc/tablefolk.git
cd tablefolk
bun server/server.js 8000        # http://localhost:8000/
```

Settings, the admin page and local models: the scenario skill's
`reference/server.md`.

## Devices

| | |
|---|---|
| **Needs** | a browser with **WebGPU** (the 3D world is drawn with it): Chrome or Edge 137+, Safari 27+, Firefox 153+ |
| **Windows, macOS** | the browsers above |
| **Linux** | Chrome with WebGPU enabled in `chrome://flags` (`#enable-unsafe-webgpu`, `#enable-vulkan`); NVIDIA cards need `--enable-dawn-features=vulkan_enable_f16_on_nvidia` for the Breeze voice |
| **Phones and tablets** | Android Chrome with WebGPU; Safari 27+ on iOS. They get the light choices by default: Pocket-TTS voices and the browser's own speech recognition |
| **Graphics memory** | the app measures the device and picks the biggest model that fits and runs fast enough (Settings, "This device", says what it found and why) |

Without WebGPU, or with too little memory for a model, a world can still run:

- **Scripted worlds** (`"brain": "none"`) need no language model at all.
- **Characters can think online:** sign in with OpenRouter in Settings, or
  point them at any OpenAI-compatible server.

The world itself still needs WebGPU to draw.

Downloads happen once, after asking, and are cached in the browser. The
default characters' model is about 2 GB, a voice 40 MB to 2.5 GB, and speech
input about 1 GB.

## What runs where, and the models' licences

| part | model | runs | licence |
|---|---|---|---|
| characters (default) | Gemma 4 E2B / E4B, E2B with sight | browser (WebGPU) | Apache-2.0 |
| characters (10 GB+ cards) | Ternary Bonsai 2 27B | browser (WebGPU) | Apache-2.0 |
| characters (tiny) | Qwen1.5 0.5B Chat | browser (WebGPU or CPU) | **Tongyi Qianwen research licence: not for commercial use** |
| characters (online) | any model on OpenRouter or your own server | their servers | the provider's terms |
| meaning (menus, memory) | EmbeddingGemma | browser | Apache-2.0 |
| voices (default) | Pocket-TTS (Kyutai), small and standard | browser (CPU) | CC-BY-4.0 |
| voices (optional, better) | Breeze TTS 2 | browser (WebGPU) or a local server | **BreezeBlue research and non-commercial licence** |
| speech input | Underdog Bark 3.0 (Parakeet TDT) | browser (WebGPU or CPU) | CC-BY-4.0 |
| speech input (phones) | the browser's own recognition | the browser | – |
| painting (artist characters) | tiny-sd 512 px, with the TAESD decoder | browser (WebGPU) | CreativeML Open RAIL-M (use restrictions); TAESD MIT |
| painting (smaller cards) | Chitra Tiny 256 px | browser (WebGPU or CPU) | Apache-2.0 |

For anything commercial, keep to the Apache-2.0 and CC-BY-4.0 models above
(the defaults are): don't use Breeze TTS 2 or Qwen1.5. CC-BY-4.0 asks for
credit to the model's authors.

## Toolkit: use the parts in your own projects

The engine's parts are standalone JavaScript libraries, MIT-licensed, with no
build step. They're on npm as **`@tablefolk/*`** (sources in [`libs/`](libs/README.md)):

| package | what it does |
|---|---|
| `@tablefolk/brain` | a language model in one call (Gemma in the browser, a tiny fallback, Chrome's built-in model, or OpenRouter): chat, streaming, pick one of, yes/no, JSON, and Chrome's Prompt API shape |
| `@tablefolk/device` | what this device can run: graphics card, memory with the reason, measured bandwidth, the best model that fits |
| `@tablefolk/voice` | text to speech (Pocket-TTS, Breeze TTS 2, the browser's), chosen for the device |
| `@tablefolk/hear` | speech to text (Underdog Bark, the browser's), chosen for the device |
| `@tablefolk/paint` | pictures from a sentence (tiny-sd or Chitra Tiny), on the graphics card or the processor |
| `@tablefolk/menus` | JRPG-style menus: click, press a number, type or say it; matched by meaning |
| `@tablefolk/script` | scripted stories: world flags, conditions, triggers, workflows, a validator; runs in Node too |
| `@tablefolk/decider` | a 2B decision model: one of a list, or yes/no, with calibrated probabilities |
| `@tablefolk/models` | where model files come from, workers from a CDN, settings keys |

```js
import { createBrain } from '@tablefolk/brain';
const brain = await createBrain();
console.log(brain.why, await brain.chat('Say hi as a blacksmith'));
```

[`libs/README.md`](libs/README.md) covers using them from npm or a CDN, and
each package has its own README.

## Make worlds with an agent

The Claude Code plugin teaches an agent to write scenarios and turn them into
links:

```
/plugin install tablefolk-scenario --marketplace runvnc/tablefolk
```

Then ask, e.g., "make a tablefolk.world scenario: a night market with a
fortune teller and a pickpocket, and give me the link".

## Documentation

| for | where |
|---|---|
| scenario authors, players, world builder users, server operators | the scenario skill: `plugins/tablefolk-scenario/skills/tablefolk-scenario/SKILL.md` and its `reference/` chapters |
| using the libraries | [libs/README.md](libs/README.md) and each package's README |
| people working on the code | the maintainer skill: `.claude/skills/tablefolk-dev/SKILL.md` and its `reference/` chapters |
| what changed | [CHANGELOG.md](CHANGELOG.md) |
| roadmap | [docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md) |
| the documentation site (built from the same chapters) | [docs/README.md](docs/README.md) |
| browser tests | [tools/browser-test/README.md](tools/browser-test/README.md) |

`python3 tools/docs.py <words>` prints the sections about a topic from all of
them; `python3 tools/docs.py --list` lists every heading.

## Status

Tablefolk is young and changes quickly: the libraries start at version 0.1,
and what changed is in [CHANGELOG.md](CHANGELOG.md).

## Licence

Code: MIT ([LICENSE](LICENSE)). Assets (3D models, sounds) are CC0 or
similar; each folder under `assets/` carries its own licence file. The AI
models each have their own licence: see [the table above](#what-runs-where-and-the-models-licences).
