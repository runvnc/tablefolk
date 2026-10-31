# Breeze TTS 2 in the browser

HoppouAI/Breeze-TTS-2.cpp (ggml) compiled to WebAssembly with ggml's WebGPU
backend, so the same `breeze-tts-2-q4_k-dd2.gguf` mirrored on R2
(`breeze-tts-2/`) runs in the player's browser with no server.

Found (2026-10-30): nobody had done this (no ONNX, WebGPU or WASM build of
Breeze TTS 2 on Hugging Face or GitHub). Breeze's bundled ggml (2026-08-25)
has ggml-webgpu with Emscripten support (JSPI, Chrome 137+, Dawn's
emdawnwebgpu port).

## What the build needs (2026-10-31)

- **Breeze at 87b4366 (v0.1.6 work) or later.** Its vocoder writes the
  transposed convolution as a matmul and has no `ROLL`, the two ops
  ggml-webgpu lacks, so the old `portable-conv.patch` (for 2904b9a) is gone.
- **`ggml-webgpu-backports.patch`**, applied inside `third_party/ggml`: two
  fixes from llama.cpp that came after Breeze's ggml (#28382, #28045; #29471,
  unaligned set_tensor through a compute memset, hung generation under JSPI
  and is left out). The one that matters is #28382: a view into a block-quantized weight at an offset that the
  browser's 256-byte binding alignment splits mid-block read the wrong blocks.
  Breeze's depth decoder takes each codebook's head as such a view
  (Q2_K, 689,136 bytes apart), so in the browser only the first of the 15
  depth codes came out right and the speech was static and fragments. Native
  Dawn on NVIDIA asks for a smaller alignment, which hid it there.
- `tf_breeze.cpp` is the interface the worker (`app/tts/breeze-web-worker.js`)
  calls. Two diagnostics, run by the worker on `debug_stages` / `debug_hash`
  messages: `tf_stages` (`debug-stages.hpp`: every stage on fixed inputs, as
  stats; the same header builds natively to compare) and `tf_hash_tensors`
  (every weight's hash as read back from the GPU).

`build.sh` builds it (emsdk in `~/.cache/tablefolk-build/emsdk`) into
`app/tts/breeze-web/`.

## Testing it

`tools/browser-test/breeze-web-test.html` (served by the Tablefolk server)
loads the worker alone, speaks a line and shows the backend, load time,
first audio and speed, and plays the result.

WebGPU needs `shader-f16`. Chrome turns it off on Linux with NVIDIA (Dawn's
`vulkan_enable_f16_on_nvidia` toggle is off by default). Start Chrome with
`--enable-dawn-features=vulkan_enable_f16_on_nvidia` and it is offered. The
test Chrome (`tools/browser-test/launch-chrome.sh`) does that. Windows (D3D12)
and Macs offer it already.

Native comparison: build Breeze with `-DGGML_WEBGPU=ON` against Google's
prebuilt Dawn (`v20260317.182325` matches this ggml; clang, since the Dawn
headers need C++20 under GCC) and run `breeze-cli` with the same line.

Status and traps: the maintainer skill's brains.md ("Breeze TTS 2 in the
browser").
