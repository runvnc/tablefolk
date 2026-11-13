# @tablefolk/hear

Speech to text in the browser, from either of two engines:

- **Underdog Bark 3.0** (ai-ecoverse, CC-BY-4.0, a Parakeet-TDT 0.6B
  fine-tune). It runs fp16 on WebGPU (1.3 GB once, ~0.4 s a sentence) or int8
  on the processor (0.9 GB, ~1.2 s). 1.3% WER on LibriSpeech; the voice never
  leaves the machine.
- **the browser's SpeechRecognition** (Chrome: on this device when it has the
  language pack).

```js
import { createListener } from '@tablefolk/hear';
const ear = await createListener({ engine: 'auto', ask: async ({ gb }) => confirm(`Download ${gb} GB?`) });
await ear.start();             // hold to talk...
const text = await ear.stop(); // ...release: the words
await ear.transcribe(pcm16k)   // Bark: your own 16 kHz Float32Array
```

`'auto'` picks the browser's recognition on a phone or tablet (lighter), Bark
elsewhere. Helpers: `recorder()`, `toPcm16k(blob)`, `level(pcm)` (whether a
clip is silent). Bark downloads from Hugging Face (Tablefolk's mirror on
tablefolk.world).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
