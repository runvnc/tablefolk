# Real task times

How long tasks really took (wall clock, start to commit), next to the
estimate given beforehand, so later estimates can be calibrated.

| date | task | estimate | real | notes |
|---|---|---|---|---|
| 2026-11-12 | JRPG menus (`app/menus.js`): menu JSON in scenarios (`menus`, a character's `menu`), the menu box (click, 1-9, arrows, Esc), matching typed or spoken words (number, label, keyword, shared words, EmbeddingGemma, the brain picking greedily), `pick()` for the brain choosing from a list, E opens a character's menu, export, docs | ~1 hour | 8 min 40 s (21:54:43-22:03:23) | Three browser test rounds found three bugs (item lookup by copy, scenario menu ids, weak stemming); one threshold recalibrated from measured EmbeddingGemma scores (12/12 with Gemma E2B). The visual check took one fix (the ✕). |
| 2026-11-12 | Strands Decider trial: research (wllama System One, llama.cpp converters, community GGUFs), 2.0 GB download, native llama-server menu test, browser port (`decider.js`: wllama embeddings, tokenizer byte spans, JS head) debugged (tokenizer API, GPU out of memory at batch 4096, a comment that swallowed options), browser menu test, character direction/command test, docs | not estimated | 47 min 16 s (22:25:33-23:12:49) | Download ~5 min. The browser debugging took the longest (four failed runs). |
| 2026-11-13 | Standalone libraries (`libs/`): models (mirror policy, workers), device, menus, brain, decider, voice, hear as `@tablefolk/*` packages the game uses through adapters; `tools/libs.mjs` check/build/publish | ~2.5-3 hours | (running: started 02:10:08) | |
