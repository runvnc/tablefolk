# @tablefolk/decider

The [Strands Decider](https://huggingface.co/StrandsAgents/strands-decider-2B-qwen3.5-v1-2610)
in the browser: a 2B decision model (Apache-2.0) that picks one of a list of
options, or answers yes/no, with calibrated probabilities instead of text. It
runs on wllama (llama.cpp, WebGPU) with its pointer head in JavaScript. The
download is 2.0 GB (Q8_0).

```js
import { loadDecider } from '@tablefolk/decider';
const d = await loadDecider(s => console.log(s));
const r = await d.decide('The goblin is two steps west. Its club is raised.', {
  move: { type: 'choice', instructions: 'Which way should the farmer go?', criteria: { north: 'go north', east: 'go east', west: 'go west' } },
  scared: { type: 'noul', instructions: 'The farmer is in danger.' },
});
r.move   // { choice: 'east', probabilities: {...}, confidence: 0.71 }
r.scared // { noul: 0.93 }
```

`await deciderCached()` says whether this browser already holds the model
(a load would not download it); `NEED_GB` (2.6) is the graphics memory it
takes, for deciding whether it fits beside another model. Tablefolk loads
it beside the characters' brain only when it fits and is downloaded, or
when the player turns it on (`app/decider.js`).

Measured (2026-11-12, RTX 2060): 17 of 18 menu choices right; its confidence
is honest (every answer at 0.5 or above was right). Pass it to
`@tablefolk/brain` (`createBrain({ decider })`) and `pick()` and `yesno()` use
it.

**Speed (2026-11-27).** A question is one forward pass: the prompt goes
through once and the hidden states are read at the end of each option's line
and at the last token (the model is causal, so these are exactly the states
decide.py gets from one cut prompt per option). That needs an action wllama
does not have: `./wllama/` is libs/brain's wllama-fast build (wllama 4.0.0 +
the WebGPU patches) with `tools/wllama-inkling/wllama-hidden.patch` (the
"hidden" action). The state before the question is kept as a snapshot, so
further questions about the same state evaluate only their own ~60-100
tokens. Chrome 158, the 18 menu items and the timing loop of
`tools/browser-test/decider-test.html?local=1`:

| a question | RTX 4070 12 GB | RTX 2060 6 GB |
|---|---|---|
| menu, 6 options, new state (before: a forward per option) | 0.53 s (2.0 s) | 1.9-2.0 s (7.3-7.7 s) |
| 4 / 6 options, state already seen | 0.24 / 0.26 s (1.06 / 1.65 s) | 0.85 / 0.89 s (4.3 / 6.7 s) |
| yes/no, new short state | 0.30-0.35 s (0.5 s) | 0.9-1.2 s (1.8-2.0 s) |

The time is now prompt reading, about 2 ms a token on the 4070 (8.5 ms on the
2060), most of it the Q8_0 matrix multiplies (natively on Dawn: 71% of GPU
time; the recurrent layers 4.5%). Same choices as before and probabilities
within 0.001 of the forward-per-option path; hidden states are raw, as in
decide.py (`embd_normalize: -1`; the old browser path L2-normalized them,
which moved probabilities by up to 0.008). `loadDecider(cb, { engine:
'embeddings' })` is the old way.

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
