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
#include "debug-stages.hpp"
#include "trace-clone.hpp"

#include "ggml-backend.h"
#include "ggml.h"

#include <emscripten.h>

#include <algorithm>
#include <cstdlib>
#include <cmath>
#include <cstdio>
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

// diagnostics: "name bytes fnv1a64" for every weight as read back from the
// GPU, sorted by name (compare with a native build to find bad loads)
EMSCRIPTEN_KEEPALIVE const char * tf_hash_tensors(void) {
    static std::string out; out.clear();
    std::vector<std::string> names;
    for (auto & kv : g_model.gg.tensors) names.push_back(kv.first);
    std::sort(names.begin(), names.end());
    std::vector<unsigned char> buf;
    for (auto & n : names) {
        ggml_tensor * t = g_model.gg.tensors[n];
        const size_t sz = ggml_nbytes(t); buf.resize(sz);
        ggml_backend_tensor_get(t, buf.data(), 0, sz);
        unsigned long long h = 1469598103934665603ULL;
        for (size_t i = 0; i < sz; i++) { h ^= buf[i]; h *= 1099511628211ULL; }
        char line[512]; snprintf(line, sizeof line, "%s %zu %016llx\n", n.c_str(), sz, h); out += line;
    }
    return out.c_str();
}

EMSCRIPTEN_KEEPALIVE const char * tf_stages(void) {
    static std::string out;
    try { out = tf_stages(g_model, g_codec); } catch (const std::exception & e) { out = std::string("error: ") + e.what(); }
    return out.c_str();
}

// diagnostics: the WebGPU mat-vec kernel against ggml's CPU code, on the model's own
// quantized weights and fixed vectors: largest error per tensor, and whether repeats agree
EMSCRIPTEN_KEEPALIVE const char * tf_matvec_check(int repeats) {
    static std::string out; out.clear();
    ggml_backend_t gpu = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_GPU, nullptr);
    ggml_backend_t cpu = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_CPU, nullptr);
    if (!gpu || !cpu) return "no backend";
    int shown[GGML_TYPE_COUNT] = { 0 };
    std::vector<std::string> names;
    for (auto & kv : g_model.gg.tensors) names.push_back(kv.first);
    std::sort(names.begin(), names.end());
    for (auto & name : names) {
        ggml_tensor * A = g_model.gg.tensors[name];
        if (A->ne[1] < 2 || A->ne[2] != 1 || A->ne[0] < 4 || A->ne[0] % ggml_blck_size(A->type) || shown[A->type] >= 8) continue;
        if (A->type != GGML_TYPE_F32 && A->type != GGML_TYPE_F16 && !ggml_is_quantized(A->type)) continue;
        shown[A->type]++;
        std::vector<unsigned char> raw(ggml_nbytes(A)); ggml_backend_tensor_get(A, raw.data(), 0, raw.size());
        for (int cols : { 1, 3 }) {
            std::vector<float> x(A->ne[0] * cols);
            unsigned r = 12345; for (auto & v : x) { r = r * 1103515245u + 12345u; v = ((r >> 16) & 0x7fff) / 16384.0f - 1.0f; }
            ggml_init_params pc = { ggml_tensor_overhead() * 8 + ggml_graph_overhead(), nullptr, true };
            // on the GPU the model's own tensor, where it lies in its shared buffer
            auto make = [&](ggml_context * c, ggml_backend_t be, ggml_tensor *& X, ggml_tensor *& Y, ggml_cgraph *& G, ggml_backend_buffer_t & buf) {
                const bool own = be == cpu;
                ggml_tensor * M = own ? ggml_new_tensor_2d(c, A->type, A->ne[0], A->ne[1]) : A;
                X = ggml_new_tensor_2d(c, GGML_TYPE_F32, A->ne[0], cols); Y = ggml_mul_mat(c, M, X);
                G = ggml_new_graph(c); ggml_build_forward_expand(G, Y);
                buf = ggml_backend_alloc_ctx_tensors(c, be);
                if (own) ggml_backend_tensor_set(M, raw.data(), 0, raw.size());
                ggml_backend_tensor_set(X, x.data(), 0, x.size() * 4);
            };
            ggml_context * cc = ggml_init(pc), * gg = ggml_init(pc);
            ggml_tensor * Xc, * Yc, * Xg, * Yg; ggml_cgraph * Gc, * Gg; ggml_backend_buffer_t bc, bg;
            make(cc, cpu, Xc, Yc, Gc, bc); make(gg, gpu, Xg, Yg, Gg, bg);
            ggml_backend_graph_compute(cpu, Gc);
            std::vector<float> want(ggml_nelements(Yc)), got(want.size()), first; ggml_backend_tensor_get(Yc, want.data(), 0, want.size() * 4);
            double maxerr = 0, scale = 0; int distinct = 0;
            for (int t = 0; t < repeats; t++) {
                ggml_backend_graph_compute(gpu, Gg); ggml_backend_tensor_get(Yg, got.data(), 0, got.size() * 4);
                if (first.empty()) first = got; else if (got != first) distinct++;
                for (size_t i = 0; i < got.size(); i++) { maxerr = std::max(maxerr, (double) std::abs(got[i] - want[i])); scale = std::max(scale, (double) std::abs(want[i])); }
            }
            char line[260]; snprintf(line, sizeof line, "%-30s %-5s %5lldx%-5lld cols %d  max output %8.3f  max error %9.6f (%.3f%%)  differing %d/%d\n", name.substr(0, 30).c_str(), ggml_type_name(A->type), (long long) A->ne[0], (long long) A->ne[1], cols, scale, maxerr, 100 * maxerr / std::max(scale, 1e-9), distinct, repeats - 1);
            out += line; printf("%s", line); fflush(stdout);
            ggml_backend_buffer_free(bc); ggml_backend_buffer_free(bg); ggml_free(cc); ggml_free(gg);
        }
    }
    return out.c_str();
}

// diagnostics: trace-clone.hpp, from codes and a transcript (use_ref 0: the same prompt without them)
EMSCRIPTEN_KEEPALIVE const char * tf_trace(const int * codes, int n_codes, int frames, const char * ref_text, int use_ref, int steps) {
    static std::string out;
    try { out = tf_trace_clone(g_model, std::vector<int>(codes, codes + n_codes), frames, ref_text ? ref_text : "", use_ref, steps); } catch (const std::exception & e) { out = std::string("error: ") + e.what(); }
    return out.c_str();
}

// 0 on success
// 1: the text encoder (0.9 GB, run once per line) on the CPU in this module's memory
// instead of the GPU (te-cpu.patch reads BREEZE_TE_CPU); call before tf_init
EMSCRIPTEN_KEEPALIVE void tf_set_te_cpu(int on) { setenv("BREEZE_TE_CPU", on ? "1" : "0", 1); }

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
