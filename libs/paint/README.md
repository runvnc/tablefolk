# @tablefolk/paint

Pictures from a sentence, in the browser: nothing is sent anywhere. Two small
models, chosen for the device:

| model | picture | download | where it runs | licence |
|---|---|---|---|---|
| **tiny-sd** (segmind, a distilled Stable Diffusion 1.5) | 512×512, recognisable | ~0.9 GB once | WebGPU, ~11 s (RTX 2060) | CreativeML Open RAIL-M: commercial use allowed, with use restrictions you must pass on |
| **Chitra Tiny** (Udgam Labs, 212M, trained only on public-domain and CC0 images) | 256×256, rough and dreamy | ~745 MB once | WebGPU, ~6 s; or the processor, ~40 s | Apache-2.0 |

```js
import { createPainter, choosePainter } from '@tablefolk/paint';
const p = await createPainter({ model: 'auto', freeGB: 3, onStatus: s => console.log(s) });
p.model, p.cpu, p.why        // 'chitra', true, '3 GB free on the graphics card: the small painter, on the processor (slower)'
const { blob, url, seconds } = await p.paint('a lighthouse at sunset, oil painting', { seed: 7 });
img.src = url;
```

`'auto'` picks, in order:
- **tiny-sd** when the graphics card has 4 GB free;
- **Chitra on the card** with 3.5 GB free;
- **Chitra on the processor** otherwise.

Pass `freeGB`: the graphics memory your other models leave. The default is all of
what `@tablefolk/device` finds. `cpu: true` forces the processor, which works
without WebGPU too.

If a painting fails for lack of graphics memory, step down the same way: the
Tablefolk game's painting skill does this. Measured on a 6 GB card beside Gemma
4 E2B and a 3D world, only the processor had room.

The models come from Hugging Face:
- [mrfakename/Chitra-Tiny-ONNX](https://huggingface.co/mrfakename/Chitra-Tiny-ONNX);
- [danyalmalik/tiny-sd-ONNX-WebGPU](https://huggingface.co/danyalmalik/tiny-sd-ONNX-WebGPU), with the
  [TAESD](https://huggingface.co/julienkay/taesd) decoder (MIT, 5 MB) in place of SD's own. The
  512 px decoder ran a 6 GB card out of memory.

They're kept in the browser's Cache API. The Chitra sampling follows mrfakename's
Apache-2.0 [WebGPU Space](https://huggingface.co/spaces/mrfakename/chitra-tiny-webgpu).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
