// Diagnostics for tf_breeze.cpp (tf_stages): each stage of Breeze on fixed inputs,
// printed as stats, to compare the browser build with a native one. The same
// header builds natively (see README.md here).
#pragma once
#include "breeze/backbone.h"
#include "breeze/codec.h"
#include "breeze/depth_decoder.h"
#include <random>
#include "breeze/model.h"
#include "breeze/text_encoder.h"
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>
static std::string tf_stat(const char * name, const std::vector<float> & v) {
    double s = 0, a = 0, mx = 0; int nan = 0;
    for (float x : v) { if (std::isnan(x) || std::isinf(x)) { nan++; continue; } s += x; a += std::fabs(x); mx = std::fmax(mx, std::fabs(x)); }
    char b[400]; snprintf(b, sizeof b, "%-10s n=%zu sum=%.5g abs=%.5g max=%.5g nan=%d v=[%.5g %.5g %.5g %.5g]\n", name, v.size(), s, a, mx, nan,
        v.size() > 0 ? v[0] : 0, v.size() > 1 ? v[1] : 0, v.size() > 100 ? v[100] : 0, v.size() > 1000 ? v[1000] : 0);
    return b;
}
static std::string tf_stages(breeze::BreezeModel & m, breeze::MimiCodec & codec) {
    using namespace breeze;
    std::string out;
    std::vector<int> tok; for (int i = 0; i < 24; i++) tok.push_back(1000 + i * 357);
    out += tf_stat("te", text_encoder_forward(m, tok));
    const int F = 8, NCB = m.cfg.num_codebooks;
    std::vector<int> codes; for (int f = 0; f < F; f++) for (int c = 0; c < NCB; c++) codes.push_back((f * 131 + c * 37) % 2048);
    std::vector<float> ae = audio_embed_forward(m, codes, F);
    out += tf_stat("ae", ae);
    { BackboneState st; st.init(m, 64); StepOut o = backbone_run(m, st, ae, F); out += tf_stat("bb.hidden", o.hidden); out += tf_stat("bb.logits", o.logits);
      std::vector<float> one(ae.begin(), ae.begin() + ae.size() / F); StepOut o2 = backbone_run(m, st, one, 1); out += tf_stat("bb.step", o2.logits);
      DepthRunner dr; dr.init(m, 1);
      for (float temp : { 0.05f, 0.8f }) {
          std::mt19937 rng(7); DepthItem it; it.hidden[0] = &o.hidden; it.cb0 = 5; it.temperature = temp; it.rng = &rng;
          std::vector<int> dc = dr.run_batch(m, { it }, m.cfg.depth_top_k)[0];
          out += temp < 0.1f ? "depth.t05 " : "depth.t80 "; for (int c : dc) out += std::to_string(c) + " "; out += "\n";
      }
      { SampleParams sp; sp.top_k = 1; std::mt19937 rng(7); std::vector<int> dc = dr.run(m, { o.hidden }, 5, 1.0f, rng, &sp);
        out += "depth.k1  "; for (int c : dc) out += std::to_string(c) + " "; out += "\n"; } }
    out += tf_stat("voc", codec.decode(codes, F));
    { std::vector<float> wave(24000); for (int i = 0; i < 24000; i++) wave[i] = 0.3f * std::sin(i * 0.05f) + 0.1f * std::sin(i * 0.31f);
      int nf = 0; std::vector<int> c = codec.encode(wave, nf); std::vector<float> cf(c.begin(), c.end()); out += tf_stat("enc", cf); }
    return out;
}
