# @tablefolk/models

What the other `@tablefolk/*` libraries share for model files. It covers
where to download from, workers loaded from a CDN, settings keys, and
status notes.

```js
import { mirrorAllowed, setMirror, sources, firstReachable, createWorker, configure, local, on } from '@tablefolk/models';

sources({ mirror: 'https://geebr-models.mindroot.io/x.gguf', hf: 'https://huggingface.co/.../x.gguf' })
// -> [hf] on any site; [mirror, hf] on tablefolk.world (mirrorAllowed())
configure({ prefix: 'myapp' })           // localStorage keys the libraries keep: myappGpuBandwidth, ...
on(n => console.log(n.lib, n.text))      // what the libraries chose and why
const w = createWorker(new URL('./worker.js', import.meta.url))   // works from a CDN too
```

Tablefolk's model mirror (Cloudflare R2) is for tablefolk.world. Other pages
download from Hugging Face unless they call `setMirror(true)`.

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
