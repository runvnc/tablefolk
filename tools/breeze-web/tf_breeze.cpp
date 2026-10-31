// Breeze TTS 2 for the browser: a thin WebAssembly interface over
// Breeze-TTS-2.cpp (HoppouAI, Apache-2.0) built with ggml's WebGPU backend.
// Used by app/tts/breeze-web-worker.js; built by tools/breeze-web/build.sh.
//
// Calls that touch the GPU suspend (JSPI), so JS calls them as async
// exports: tf_init, tf_encode, tf_generate. Audio goes out through
// Module.onAudio(Float32Array) as it is decoded; writing 1 to the int at
// tf_stop_flag() stops a generation at its next chunk.
#include "breeze/generation.h"
#include "breeze/model.h"

#include "ggml-backend.h"

#include <emscripten.h>

#include <exception>
#include <string>
#include <vector>

using namespace breeze;

static BreezeModel g_model;
static MimiCodec g_codec;
static std::string g_err;
static std::vector<int> g_codes;
static int g_frames = 0;
static volatile int g_stop = 0;

EM_JS(void, tf_emit, (const float * p, int n), {
    if (Module.onAudio) Module.onAudio(HEAPF32.slice(p >>> 2, (p >>> 2) + n));
});

extern "C" {

EMSCRIPTEN_KEEPALIVE const char * tf_error(void) { return g_err.c_str(); }
EMSCRIPTEN_KEEPALIVE int * tf_stop_flag(void) { return (int *) &g_stop; }
EMSCRIPTEN_KEEPALIVE int tf_sample_rate(void) { return g_model.cfg.sample_rate; }
EMSCRIPTEN_KEEPALIVE const char * tf_backend(void) { return g_model.backend.name(); }

// the devices ggml registered: "name (type), ..." (diagnostics)
EMSCRIPTEN_KEEPALIVE const char * tf_devices(void) {
    static std::string s; s.clear();
    for (size_t i = 0; i < ggml_backend_dev_count(); i++) {
        ggml_backend_dev_t d = ggml_backend_dev_get(i);
        s += std::string(i ? ", " : "") + ggml_backend_dev_name(d) + " (" + std::to_string((int) ggml_backend_dev_type(d)) + ": " + ggml_backend_dev_description(d) + ")";
    }
    return s.c_str();
}

// 0 on success
EMSCRIPTEN_KEEPALIVE int tf_init(const char * path) {
    try {
        if (!g_model.load(path, true)) { g_err = "failed to load the model"; return 1; }
        g_codec.init(g_model);
        return 0;
    } catch (const std::exception & e) { g_err = e.what(); return 1; }
}

// a reference clip (mono, 24 kHz) to voice codes: returns the frame count
// (codes at tf_codes(), tf_codes_len() of them), or -1
EMSCRIPTEN_KEEPALIVE int tf_encode(const float * audio, int n) {
    try {
        g_codes = g_codec.encode(std::vector<float>(audio, audio + n), g_frames);
        return g_frames;
    } catch (const std::exception & e) { g_err = e.what(); return -1; }
}
EMSCRIPTEN_KEEPALIVE int * tf_codes(void) { return g_codes.data(); }
EMSCRIPTEN_KEEPALIVE int tf_codes_len(void) { return (int) g_codes.size(); }

// speak text: a clone when codes and their transcript are given, else a voice
// designed from the instruction. 0 done, 2 stopped, 1 error
EMSCRIPTEN_KEEPALIVE int tf_generate(const char * text, const char * instruction, const char * ref_text,
                                     const int * codes, int n_codes, int frames, int seed, float cfg,
                                     int chunk_first, int chunk_max) {
    try {
        GenRequest g;
        g.text = text ? text : "";
        if (instruction && *instruction) g.instruction = instruction;
        if (codes && n_codes > 0 && frames > 0 && ref_text && *ref_text) {
            g.ref_codes.assign(codes, codes + n_codes);
            g.ref_frames = frames;
            g.ref_text = ref_text;
        }
        g.seed = seed;
        g.cfg_scale = cfg > 0 ? cfg : 1.0f;
        if (chunk_first > 0) g.chunk_first = chunk_first;
        if (chunk_max > 0) g.chunk_max = chunk_max;
        g_stop = 0;
        bool stopped = false;
        generate(g_model, g_codec, g, [&](const float * s, int n) {
            tf_emit(s, n);
            if (g_stop) { stopped = true; return false; }
            return true;
        });
        return stopped ? 2 : 0;
    } catch (const std::exception & e) { g_err = e.what(); return 1; }
}

}
