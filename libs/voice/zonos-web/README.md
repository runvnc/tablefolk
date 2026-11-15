# ZONOS3-Mini's WebGPU engine (vendored)

`engine-worker.js` and `codec-worker.js` are `dist/worker.js` and
`dist/codec-worker.js` of `servers/web` in
[Zyphra/ZONOS3-Mini](https://github.com/Zyphra/ZONOS3-Mini) at commit
96d9e0e (MIT, `LICENSE-ZONOS3-Mini.txt`), built with vite:

```bash
git clone https://github.com/Zyphra/ZONOS3-Mini && cd ZONOS3-Mini
npx pnpm@10.34.9 install --filter zonos3-web...
cd servers/web && npx pnpm@10.34.9 build
```

Each file's first line (`// vendored: ...`) was added here; `tools/libs.mjs
check` skips files that start with it. `../zonos-web-worker.js` starts both
as nested workers and talks to the engine's HTTP API over messages. The
weights (Apache-2.0) are not here: they load from the `web/` folder of
[Zyphra/ZONOS3-Mini on Hugging Face](https://huggingface.co/Zyphra/ZONOS3-Mini/tree/main/web)
at the revision pinned in `zonos-web-worker.js`. A new engine build may need
a new export: bump both together.
