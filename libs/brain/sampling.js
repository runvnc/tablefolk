// Sampling settings each model's makers recommend (generation_config.json and
// the model cards, checked 2026-10-30). These are a model's starting point:
// some are trained for 1.0 and degrade colder, others want 0.1, so a character's
// chaos counts from them (withChaos). Matched by the brain's key or, for the
// endpoint brain, by the server's model name.
//
//   samplingFor('gemma4-e2b-litert')  -> { temperature: 1, top_p: .95, top_k: 64 }
const RECOMMENDED = [
  // google/gemma-4-E2B-it card, "Best Practices"; generation_config.json
  { match: /gemma[-_ ]?4|nemotron.*bolt/i, temperature: 1.0, top_p: 0.95, top_k: 64 },
  // openbmb/MiniCPM5-2B card: temperature 1.0, top_p 0.95, min_p 0 (llama.cpp's
  // default min_p 0.05 led to repetition); repetition_penalty 1.05 if it repeats
  { match: /minicpm[-_ ]?5/i, temperature: 1.0, top_p: 0.95, min_p: 0, repetition_penalty: 1.05 },
  // LiquidAI/LFM3-1.7B card, "General (chat, tool use, agents, coding)";
  // generation_config.json (1.0 is only for maths)
  { match: /lfm[-_ ]?3/i, temperature: 0.1, top_k: 50, repetition_penalty: 1.1 },
  // Ternary Bonsai 2 (Prism ML; made from Qwen3.5/3.6): Qwen's recommended
  // non-thinking settings. (The 27B's WebGPU engine decodes greedily only.)
  { match: /bonsai[-_ ]?2/i, temperature: 0.7, top_p: 0.8, top_k: 20 },
  // Qwen/Qwen1.5-0.5B-Chat generation_config.json (it names no temperature: Transformers' default, 1.0)
  { match: /qwen[-_ ]?1\.5/i, temperature: 1.0, top_p: 0.8, repetition_penalty: 1.1 },
  // Qwen/Qwen2.5-0.5B-Instruct generation_config.json
  { match: /qwen[-_ ]?2\.5/i, temperature: 0.7, top_p: 0.8, top_k: 20, repetition_penalty: 1.1 },
];

// A character's chaos (0-100), relative to its model: 0 and 1 (the default) are
// the makers' settings, unchanged. Above that the temperature climbs on a curve
// (gentle at first), further for a model recommended a high one: 0.1 reaches
// 1.25, 0.7 reaches 2.75, 1.0 reaches 3.5. top-p and top-k open up with it, since
// they cap how strange a pick can be whatever the temperature.
// A model with no recommendation counts from 0.3.
export function withChaos(rec, chaos) {
  const c = Math.min(100, Math.max(0, +chaos || 0));
  const base = rec?.temperature ?? 0.3;
  if (c <= 1) return rec ? { ...rec } : { temperature: base };
  const t = (c / 100) ** 2, out = { ...rec, temperature: +(base + t * (1 + 1.5 * base)).toFixed(3) };
  const topP = rec?.top_p ?? 0.95; out.top_p = +(topP + t * (1 - topP)).toFixed(3);
  if (rec?.top_k) out.top_k = Math.round(rec.top_k + t * 8 * rec.top_k);
  return out;
}

export function samplingFor(name) {
  const r = RECOMMENDED.find(x => x.match.test(String(name || '')));
  if (!r) return null;
  const { match, ...params } = r;
  return params;
}
