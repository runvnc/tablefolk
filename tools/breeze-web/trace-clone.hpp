// Diagnostics: every operation of a cloned voice's prompt and first frames, on fixed
// inputs, as lines to compare between two backends (compare-trace.py). The audio frames are
// fixed too, so one difference can't change what the next step is given.
// Built into tf_breeze.cpp (browser) and trace_main.cpp (native). See README.md here.
#pragma once
#include "breeze/backbone.h"
#include "breeze/common.h"
#include "breeze/model.h"
#include "breeze/text_encoder.h"
#include "ggml-backend.h"
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

static std::string g_tr_out; static std::string g_tr_stage;
static void tr_line(const char * op, const char * name, int idx, const ggml_tensor * t, const std::vector<float> & v) {
    double s = 0, l2 = 0, mx = 0; int bad = 0;
    for (float x : v) { if (!std::isfinite(x)) { bad++; continue; } s += x; l2 += (double) x * x; mx = std::fmax(mx, std::fabs(x)); }
    char b[420]; snprintf(b, sizeof b, "%s\t%d\t%s\t%s\t%lldx%lldx%lld\t%zu\t%.7g\t%.7g\t%.7g\t%d\t%.7g\t%.7g\t%.7g\t%.7g\n", g_tr_stage.c_str(), idx, op, name,
        t ? (long long) t->ne[0] : 0, t ? (long long) t->ne[1] : 0, t ? (long long) t->ne[2] : 0, v.size(), s, std::sqrt(l2), mx, bad,
        v.size() > 0 ? v[0] : 0, v.size() > 1 ? v[v.size() / 3] : 0, v.size() > 2 ? v[v.size() / 2] : 0, v.size() > 3 ? v.back() : 0);
    g_tr_out += b;
}
static void tr_graph(ggml_cgraph * gf) {
    std::vector<float> v;
    for (int i = 0; i < ggml_graph_n_nodes(gf); i++) {
        ggml_tensor * t = ggml_graph_node(gf, i);
        if (t->type != GGML_TYPE_F32 || !t->buffer) continue;
        v.resize(ggml_nelements(t)); ggml_backend_tensor_get(t, v.data(), 0, v.size() * 4);
        tr_line(ggml_op_name(t->op), t->name, i, t, v);
    }
}
static void tr_vec(const char * name, const std::vector<float> & v) { tr_line("RESULT", name, -1, nullptr, v); }

// ref: codes [frames * books], its transcript. The prompt is as generation.cpp builds it.
static std::string tf_trace_clone(breeze::BreezeModel & m, const std::vector<int> & codes, int frames, const std::string & ref_text, int use_ref, int steps) {
    using namespace breeze;
    g_tr_out.clear(); g_trace = tr_graph;
    const std::string spk = "[S0]", text = "The capital of the moon is a small town full of very confused people.";
    const std::string tail = spk + "<ins_bos>Speak clearly and naturally.<ins_eos>" + text;
    const int H = m.cfg.hidden_size, NCB = m.cfg.num_codebooks;
    std::vector<float> emb; int total = 0;
    auto add = [&](const std::vector<float> & e, int n) { emb.insert(emb.end(), e.begin(), e.end()); total += n; };
    if (use_ref) {
        g_tr_stage = "te-ref"; std::vector<int> t = m.tok.encode(spk + ref_text, true); { std::vector<float> f(t.begin(), t.end()); tr_vec("tokens", f); }
        add(text_encoder_forward(m, t), (int) t.size());
        g_tr_stage = "audio-ref"; add(audio_embed_forward(m, codes, frames), frames);
        std::vector<int> eos(NCB, m.cfg.codebook_eos_token_id); add(audio_embed_forward(m, eos, 1), 1);
    }
    g_tr_stage = "te-text"; std::vector<int> t = m.tok.encode(tail, true); { std::vector<float> f(t.begin(), t.end()); tr_vec("tokens", f); }
    add(text_encoder_forward(m, t), (int) t.size());
    g_tr_stage = "prompt"; tr_vec("assembled", emb);
    char note[100]; snprintf(note, sizeof note, "total=%d H=%d", total, H); tr_line("NOTE", note, -1, nullptr, {});
    BackboneState st; st.init(m, total + steps + 8);
    g_tr_stage = "prefill"; StepOut o = backbone_run(m, st, emb, total);
    tr_vec("hidden", o.hidden); tr_vec("logits", o.logits);
    const int eos_id = m.cfg.backbone_eos_token_id;
    for (int s = 0; s < steps; s++) {
        char st_name[32]; snprintf(st_name, sizeof st_name, "step%03d", s); g_tr_stage = st_name;
        std::vector<int> fr(NCB); for (int c = 0; c < NCB; c++) fr[c] = ((s * 131 + c * 37) % 2000) + 7;   // the same frames on both sides
        if (s > 2) { g_trace = nullptr; }
        std::vector<float> e = audio_embed_forward(m, fr, 1);
        StepOut x = backbone_run(m, st, e, 1);
        tr_vec("hidden", x.hidden); tr_vec("logits", x.logits);
        std::vector<float> eosv(1, x.logits[eos_id]); tr_vec("eos_logit", eosv);
        int best = 0; for (size_t i = 0; i < x.logits.size(); i++) if (x.logits[i] > x.logits[best]) best = (int) i;
        std::vector<float> bv(1, (float) best); tr_vec("best_token", bv);
    }
    g_trace = nullptr;
    return g_tr_out;
}
