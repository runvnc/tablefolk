# @tablefolk/brain

A language model in the browser with one call. It picks what this device can
run, downloads and caches it, and gives you plain methods:

- **Gemma 4 E2B/E4B** on WebGPU (LiteRT-LM, in a worker, cached in OPFS);
- **Bonsai 2 9B** for 6 GB+ cards (fast; best with thinking on), **Bonsai 2 27B** and **Gemma 4 12B** for 10 GB+ cards;
- a **tiny Qwen** where there is no GPU;
- **Chrome's built-in model**;
- any **OpenAI-compatible server**.

```js
import { createBrain } from '@tablefolk/brain';

const brain = await createBrain({ onStatus: s => console.log(s) });
brain.why                                        // "Gemma 4 E2B: 8 GB usable, 210 GB/s"
await brain.chat('Say hi as a blacksmith')
for await (const piece of brain.stream('Tell a short story')) el.textContent += piece;
await brain.pick('Which fits "mend my blade"?', ['buy', 'repair', 'leave'])   // { index: 1, choice: 'repair', by: 'model' }
await brain.yesno('The player is angry.', { context: 'Player: "Give it back NOW!"' })   // 1 or 0 (a probability with a decider)
await brain.json('Invent a tavern keeper', { example: { name: 'Mara', age: 40 } })      // { name, age }

// Chrome's Prompt API shape, on whatever runs here
const s = await brain.languageModel.create({ initialPrompts: [{ role: 'system', content: 'Be brief.' }] });
await s.prompt('Hello'); s.promptStreaming('More');
```

Options:

| option | what it does |
|---|---|
| `model` | `'auto'`, `'gemma4-e2b'`, `'gemma4-e4b'`, `'bonsai2-9b'`, `'gemma4-12b'`, `'bonsai2-27b'`, `'qwen1.5-0.5b'`, `'chrome'` or `'endpoint'` |
| `endpoint` | `{ baseURL, apiKey, model }` |
| `fallback` | the order tried when loading fails: `['chrome', 'endpoint', 'qwen1.5-0.5b']` by default |
| `ask` | `async model => true`: approve a download |
| `engine` | your own `{ generate(messages, opts), unload() }` |
| `decider` | a `@tablefolk/decider`: `pick` and `yesno` get calibrated probabilities |

Visitors can use their own OpenRouter account (OAuth PKCE, no server needed):

```js
import { signIn, finishSignIn, openRouterEndpoint } from '@tablefolk/brain/openrouter.js';
signInButton.onclick = () => signIn();
const key = await finishSignIn();   // on the way back (?code=...)
if (key) brain = await createBrain({ model: 'endpoint', endpoint: openRouterEndpoint(key) });
```

The models download from Hugging Face (Tablefolk's mirror on tablefolk.world).
Each model's own licence applies: Gemma 4 and Bonsai 2 are Apache-2.0;
the tiny fallback, Qwen1.5 0.5B, is under the Tongyi Qianwen **research**
licence (not for commercial use: pass `fallback` without `'qwen1.5-0.5b'`).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
