# Tablefolk's libraries (`@tablefolk/*`)

The parts of Tablefolk that are useful on their own, as plain ES modules
with no build step. The game uses them from here, and each one is published
to npm as its own package.

| package | what it does | needs |
|---|---|---|
| [`@tablefolk/models`](models/) | where model files come from (the mirror rule), workers from a CDN, settings keys, status notes | – |
| [`@tablefolk/device`](device/) | what this device can run: GPU, memory estimate with its reason, measured bandwidth, phone/tablet/computer, the biggest model that fits and is fast enough | models |
| [`@tablefolk/brain`](brain/) | a language model with one call: Gemma 4 (WebGPU), a tiny Qwen, Chrome's built-in model, or an OpenAI-compatible server (OpenRouter sign-in included); `chat`, `stream`, `pick`, `yesno`, `json`, and a Prompt-API-shaped session | models, device |
| [`@tablefolk/decider`](decider/) | the Strands Decider (2B): one of a list, or yes/no, with calibrated probabilities | – |
| [`@tablefolk/voice`](voice/) | text to speech: Pocket-TTS (small, CPU), Breeze TTS 2 (WebGPU), or the browser's own | models, device |
| [`@tablefolk/hear`](hear/) | speech to text: Underdog Bark 3.0 (WebGPU or CPU) or the browser's SpeechRecognition | models, device |
| [`@tablefolk/menus`](menus/) | JRPG-style menus: click, press a number, type or say a choice; words matched by number, label, keyword, meaning or a model | – |

## Using them

With npm and a bundler (Vite handles the workers and `.wasm` files next to
the modules):

```bash
npm i @tablefolk/brain @tablefolk/voice
```
```js
import { createBrain } from '@tablefolk/brain';
const brain = await createBrain({ onStatus: s => console.log(s) });
console.log(brain.why, await brain.chat('Say hi as a blacksmith'));
```

With no build, from a CDN, with an import map so the packages find each other:

```html
<script type="importmap">
{ "imports": {
  "@tablefolk/models": "https://cdn.jsdelivr.net/npm/@tablefolk/models@0.1/index.js",
  "@tablefolk/device": "https://cdn.jsdelivr.net/npm/@tablefolk/device@0.1/index.js",
  "@tablefolk/brain":  "https://cdn.jsdelivr.net/npm/@tablefolk/brain@0.1/index.js"
} }
</script>
<script type="module">
  import { createBrain } from '@tablefolk/brain';
</script>
```

Use the raw files (`/index.js`), not jsDelivr's `/+esm` bundles: the
libraries find their workers and `.wasm` files next to their own modules.
Workers from another origin are started through a small blob
(`@tablefolk/models` `workerUrl`), since browsers refuse them otherwise.

The models need WebGPU, and the pages that use them need cross-origin
isolation for threads (`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`). Without it they still run,
on one thread.

## Where models download from

Tablefolk keeps byte-identical copies of the models it uses on its own
Cloudflare R2 bucket (`geebr-models.mindroot.io` and three more hostnames).
**Only pages on tablefolk.world use it** (`mirrorAllowed()`); everywhere else
the libraries download from Hugging Face. The Tablefolk game also uses the
mirror when served from this repository on localhost (the maintainer's
tests: `app/llm_js/world-integration.js`). A page can force either with
`setMirror(true | false)`.

Files that exist only on the mirror always come from there. That means
Tablefolk's own conversions, such as Nemotron 3.5 Bolt E4B; Hugging Face has
no copy of them.

## Rules for code in libs/

`node tools/libs.mjs check` enforces them, and `build` and `publish` run it
first.

- **No game.** Nothing reads `window.tablefolk*` or loads `/app/...`. A
  library takes what it needs as options, reports through `note()`
  (`@tablefolk/models`) or callbacks, and keeps settings through `local`
  (localStorage keys under a prefix, `'tablefolk'` by default:
  `configure({ prefix })`). The game's glue lives in `app/`. It forwards
  notes to "This device", passes the game's numbers in, and sets the
  mirror rule.
- **Imports:**
  - a library's own files, relative;
  - another library as `../<name>/...`, and that library listed in
    `dependencies`;
  - anything else as a full https URL with an exact version.

  No bare names: browsers can't resolve them without a build.
- **No `?v=` version strings.** `/libs/` is served with
  `Cache-Control: no-cache`, both by `server/server.js` and by the public
  site's `_headers` (`cloud/build.mjs`). Browsers revalidate each file instead
  of relying on version strings. The game imports libraries without them
  too, so each library loads once (`tools/bump.py` does not touch `libs/`).

## Publishing

```bash
node tools/libs.mjs list                 # names, versions, dependencies
node tools/libs.mjs check
node tools/libs.mjs version patch brain  # or minor, major, x.y.z; no names: all
node tools/libs.mjs build                # dist/libs/<name>/: ../<other>/ imports become @tablefolk/<other>
node tools/libs.mjs publish --dry-run    # what npm would get
npm login && node tools/libs.mjs publish # the ones others depend on first
```

`dist/` is git-ignored. Raise a library's version before publishing it again.

## Licences

The code is MIT, like the rest of the repository. The models are not ours:

| model | licence |
|---|---|
| Gemma 4 | Gemma terms |
| Qwen | Apache-2.0 / Tongyi Qianwen |
| Bonsai 2 | Apache-2.0 |
| Pocket-TTS | CC-BY-4.0 (Kyutai) |
| Underdog Bark 3.0 | CC-BY-4.0 |
| Strands Decider | Apache-2.0 |
| **Breeze TTS 2** | **research and non-commercial only** (BreezeBlue) |

`@tablefolk/voice` takes `allowBreeze: false` for a commercial product.

Tests: `tools/browser-test/libs-test.html` imports every library and checks
what runs without a download. The full end-to-end checks are in the
maintainer skill's `architecture.md`.
