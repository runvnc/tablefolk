// Sampling settings each model's makers recommend (generation_config.json and
// the model cards, checked 2026-10-30). A model listed here is always run with
// these, whatever the game would pick (the character's chaos used to set the
// temperature: 0.3 / 0.5 / 0.8); some are trained for 1.0 and degrade colder,
// others want 0.1. Matched by the brain's key or, for the endpoint brain, by
// the server's model name.
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
];

export function samplingFor(name) {
  const r = RECOMMENDED.find(x => x.match.test(String(name || '')));
  if (!r) return null;
  const { match, ...params } = r;
  return params;
}
