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

Measured (2026-11-12, RTX 2060): 17 of 18 menu choices right. In the browser
a question takes 6-8 s (one forward pass per option); native llama.cpp takes
0.5 s. Its confidence is honest: every answer at 0.5 or above was right. Pass
it to `@tablefolk/brain` (`createBrain({ decider })`) and `pick()` and
`yesno()` use it.

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
