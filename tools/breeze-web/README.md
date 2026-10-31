# Breeze TTS 2 in the browser (work in progress)

Goal: HoppouAI/Breeze-TTS-2.cpp (ggml) compiled to WebAssembly with ggml's
WebGPU backend, so the same `breeze-tts-2-q4_k-dd2.gguf` mirrored on R2
(`breeze-tts-2/`) runs in the player's browser with no server.

Found (2026-10-30): nobody has done this (no ONNX, WebGPU or WASM build of
Breeze TTS 2 on Hugging Face or GitHub; speech.cpp issue #136 plans the same
for its models). Breeze's bundled ggml (2026-08-25) has ggml-webgpu with
Emscripten support (JSPI by default, Chrome 137+, Dawn's emdawnwebgpu port).
Breeze runs each graph on one backend, so every op must exist there; two did
not: `ROLL` and `CONV_TRANSPOSE_1D`, both only in the audio codec.

`portable-conv.patch` (against Breeze-TTS-2.cpp 2904b9a, `src/codec_conv.cpp`)
writes them with ops ggml-webgpu has: the pad-and-roll becomes a left pad, and
the transposed convolution a mul_mat plus shifted pads and adds (K a multiple
of the stride, F32 kernels: true for the codec). On under `__EMSCRIPTEN__`,
natively with `BREEZE_PORTABLE_CONV=1`. Checked on the CPU build: the audio is
bit-identical to the native ops (38400 samples, seed 7).

Next: build with Emscripten (`-DGGML_WEBGPU=ON -DBREEZE_VULKAN=OFF`), export
the C API (`include/breeze/`), load the GGUF from a fetched buffer (no mmap;
the 4 GB wasm32 heap: stream tensors to the GPU), and plug it into
`app/tts/breeze-client.js` as an in-browser engine.
