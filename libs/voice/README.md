# @tablefolk/voice

Text to speech in the browser; nothing is sent anywhere.

| engine | model | size | runs on | licence |
|---|---|---|---|---|
| `pocket-18m` | Pocket-TTS small, English | ~40 MB | processor | CC-BY-4.0, Kyutai |
| `pocket-100m` | Pocket-TTS, five languages | ~120 MB | processor | CC-BY-4.0, Kyutai |
| `zonos-web` | ZONOS3-Mini (Zyphra; MoE, 100M active), 43 languages, the first choice | ~0.9 GB once | WebGPU (~1.5 GB of graphics memory; no shader-f16 or JSPI) | Apache-2.0 weights; engine MIT |
| `breeze-web` | Breeze TTS 2 (3B), much better | 2.5 GB once | WebGPU (needs ~3.5 GB free, shader-f16, JSPI) | **research and non-commercial only** |
| `browser` | the browser's `speechSynthesis` | none | the browser | – |

```js
import { createVoice } from '@tablefolk/voice';
const v = await createVoice({ engine: 'auto', freeGB: 3, onStatus: s => console.log(s) });
v.engine, v.why                          // 'pocket-18m', 'a phone or tablet: the small model'
await v.speak('Well met, traveller.', { voice: 'alba' })   // resolves when heard
for await (const pcm of v.stream('Hello')) {}              // Float32Array at v.sampleRate, no playback
const mine = await v.cloneVoice('me', pcm24k, 'the words said in it')   // then speak(text, { voice: mine })
v.level()                                // loudness now (a talking mouth)
v.stop(); v.unload();
```

`'auto'` works like this:

- a phone or tablet always gets Pocket-TTS small;
- elsewhere, ZONOS3-Mini when the graphics card has 2 GB free (`allowZonos: false` keeps it out);
- else Breeze when the graphics card has room. Pass `freeGB`, the
  graphics memory your other models leave; by default it counts all of it.
- `allowBreeze: false` keeps Breeze out (a commercial product).

Models download from Hugging Face (Tablefolk's mirror on tablefolk.world).
`zonos-web/` holds Zyphra's WebGPU engine (github.com/Zyphra/ZONOS3-Mini
`servers/web`, MIT), built; its weights come from Hugging Face
(Zyphra/ZONOS3-Mini `web/`, a pinned revision). It runs as nested workers,
so the library must be served from the page's own origin for this engine.
`breeze-web/` holds Breeze-TTS-2.cpp compiled to WebAssembly (HoppouAI,
Apache-2.0, with ggml's MIT licence).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
