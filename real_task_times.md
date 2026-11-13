# Real task times

How long tasks really took (wall clock, start to commit), next to the
estimate given beforehand, so later estimates can be calibrated.

| date | task | estimate | real | notes |
|---|---|---|---|---|
| 2026-11-12 | JRPG menus (`app/menus.js`): menu JSON in scenarios (`menus`, a character's `menu`), the menu box (click, 1-9, arrows, Esc), matching typed or spoken words (number, label, keyword, shared words, EmbeddingGemma, the brain picking greedily), `pick()` for the brain choosing from a list, E opens a character's menu, export, docs | ~1 hour | 8 min 40 s (21:54:43-22:03:23) | Three browser test rounds found three bugs (item lookup by copy, scenario menu ids, weak stemming); one threshold recalibrated from measured EmbeddingGemma scores (12/12 with Gemma E2B). The visual check took one fix (the ✕). |
