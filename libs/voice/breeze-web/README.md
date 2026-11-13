# breeze-web: Breeze TTS 2 compiled for the browser

`breeze.wasm` and `breeze.mjs` are built by `tools/breeze-web/build.sh` from
HoppouAI/Breeze-TTS-2.cpp (Apache-2.0, `LICENSE-Breeze-TTS-2.cpp.txt`) and its
ggml (MIT, `LICENSE-ggml.txt`) with ggml's WebGPU backend, Emscripten and
Dawn's emdawnwebgpu port, plus `tools/breeze-web/portable-conv.patch` and the
`tf_breeze.cpp` interface. `app/tts/breeze-web-worker.js` runs it.

The model it loads is not here: BreezeBlue's Breeze TTS 2 (HoppouAI's
q4_k-dd2 GGUF) comes from the R2 mirror `breeze-tts-2/`, with its licence
(research and non-commercial use only) and NOTICE beside it.
