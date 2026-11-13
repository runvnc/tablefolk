# @tablefolk/voice

Text to speech in the browser; nothing is sent anywhere.

| engine | model | size | runs on | licence |
|---|---|---|---|---|
| `pocket-18m` | Pocket-TTS small, English | ~40 MB | processor | CC-BY-4.0, Kyutai |
| `pocket-100m` | Pocket-TTS, five languages | ~120 MB | processor | CC-BY-4.0, Kyutai |
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
- elsewhere, Breeze when the graphics card has room. Pass `freeGB`, the
  graphics memory your other models leave; by default it counts all of it.
- `allowBreeze: false` keeps Breeze out (a commercial product).

Models download from Hugging Face (Tablefolk's mirror on tablefolk.world).
`breeze-web/` holds Breeze-TTS-2.cpp compiled to WebAssembly (HoppouAI,
Apache-2.0, with ggml's MIT licence).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
