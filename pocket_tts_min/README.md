# Pocket TTS minimal browser demo

This is a tiny browser-compute-only Pocket TTS demo. It runs ONNX Runtime Web/WASM locally in the browser and fetches the model bundle from the public Hugging Face Space at runtime.

## Run

Use the included server, not `python -m http.server`:

```bash
cd pocket_tts_min
python3 server.py
```

Open:

```text
http://127.0.0.1:8000
```

The custom server adds COOP/COEP headers so `crossOriginIsolated` becomes true and ONNX Runtime Web can use threaded WASM. Without those headers, ORT falls back to one WASM thread and generation is much slower.

## Why this version is smoother

The previous minimal version scheduled each PCM chunk with `AudioBufferSourceNode`. That can create gaps when generation is slower than playback or the browser event loop stalls.

This version uses an `AudioWorklet` ring buffer, closer to the Hugging Face demo’s playback design. The UI buffer slider controls the minimum buffered audio before playback starts.

Start with 600–900 ms. Lower it once the model is warm.
