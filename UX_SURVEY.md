# tablefolk.world UX Survey & Improvement Plan

## What this project is

A fully browser-local 3D "agent toybox": a Babylon.js (WebGPU) diorama where small
on-device LLM brains (Gemma 4 E2B via LiteRT-LM) drive little characters ("characters")
through a turn-based loop — one constrained grammar command per turn, physics
settles, next turn. The human plays "God": spawning props, chatting with agents,
tuning personalities (brain style, chaos, fireball temptation, quests), recording
runs as APNG "incidents", and listening to agents via local Pocket-TTS voices.

The UX goal that follows from that: **setup should be fast and playful, and the
world itself (not the panel) should be the star.** The user is a tinkerer running
experiments, so feedback about *what just happened* matters more than chrome.

## Current UX inventory

- One long 340px left panel: 5 collapsible sections (World setup, Agent
  customization, Pocket-TTS, Agent info & prompt, History) + record bar on top.
- Floating extras: model-load notice card (top-left), compass HUD (top-right),
  hint card (bottom-right), speech bubbles/badges over agents.
- Feedback: a `log()` that writes into the collapsed **History** section (44 call
  sites) — effectively invisible unless the user opened it; 6 separate status
  widgets (`#brainStatus`, `#ttsStatus`, `#cacheStatus`, `#recordingStatus`,
  `#turnStatus`, model notice).
- Destructive ops were native `confirm()` (now the new glass dialog) and several
  `alert()`s remain in tts-ui.js.

## Findings (worst first)

1. **Feedback is invisible.** All confirmations/results go to `#log` inside a
   collapsed `<details>`. Clear map, spawn, state saved — user gets no signal.
2. **Stale copy.** `#hint` still says "tiny local Qwen brains"; model is now
   Gemma 4 E2B. The `<details>` closed-state also hides the primary workflow
   (spawn -> customize -> start agents) behind a click each reload.
3. **Destructive ops have no undo.** reset/clear are one-shot; a snapshot-based
   "undo" is feasible because world state is already serialized
   (`saveWorldState`/localStorage + APNG incident states).
4. **Six status readouts** scattered across the panel; no single glanceable
   "what is the app doing right now".
5. **Customization controls are mushy**: sliders (chaos, fireball temptation,
   TTS volume) have no numeric readout; personality textarea/commits unclear
   when changes apply; agent select vs. click-to-spawn cursor conflicts.
6. **Click-to-spawn has no exit affordance** (no Esc-to-cancel, cursor stays
   crosshair until you uncheck).
7. **Layout**: panel fixed 340px with inner scroll; on short viewports sections
   compete; hint card overlaps world on small screens; no panel collapse toggle
   to give the world full screen.
8. **Model-load notice is the best-designed surface** (progress, consent, states)
   — the rest of the app should copy its patterns (already reused for the new
   confirm dialog).
9. Chat works and Enter-to-send exists (world-integration.js:510), but there is
   no visible chat transcript near the input; replies only appear as fleeting
   bubbles + hidden history.

## Done now

- ✅ Reusable promise-based confirm dialog (`app/confirm-dialog.js`), styled to
  match the glass/lime design language, anchored over the left panel, danger
  variant, Enter/Esc/backdrop-click, focus restore. Wired into clear map, reset
  state, clear history, delete custom voice.
- ✅ Feedback & forgiveness pack: `app/toast.js` glass toast stack (bottom-left,
  types, action buttons), `log()` mirrored to toasts, one-slot undo snapshots
  for clear map / reset state, remaining `alert()`s gone, TTS failure statuses
  surface as error toasts, `app/ui-polish.js` adds slider numeric readouts,
  Esc exits click-to-spawn, panel section open-state persists (World setup
  open on first visit), stale Qwen hint copy fixed.

## v15 features (done)

- ✅ Multi-command plans: agents can emit 1-3 command lines per turn
  (grammar `@max 3`, prompts updated, world-integration parses each line and
  runs them sequentially via stepAgentTurn; say-then-act works, e.g.
  say("On it!") / walk(n) / carry()). maxTokens 48->96 for plan room.
- ✅ Chat dock: chat UI moved out of World setup into an always-visible
  floating dock bottom-left with a live 'to: <agent>' indicator.
- ✅ Library (new panel section + library.js): save/load/delete named world
  setups (full snapshots) and save/spawn/delete named character templates
  (brain config + traits; spawned copies get fresh conversation).
- ✅ Full spawn palette: mushroom + lamp buttons wired through spawnProp.

## Proposed plan

**P0 — feedback loop (cheap, high impact)**
1. Toast/inline status system modeled on the model-load notice: transient
   bottom-left-of-panel toasts for `log()` events (mirror, not replace, History).
2. Replace remaining `alert()`s in tts-ui.js with toasts/inline errors.
3. Update `#hint` copy (Gemma 4 E2B), and auto-open the World setup section on
   first visit (remember open sections in localStorage).

**P1 — control clarity**
4. Numeric readouts on sliders; "applied" flash on personality/quest commit.
5. Esc exits click-to-spawn; while active show a small floating "spawning: X —
   Esc to stop" pill near the cursor/panel.
6. Undo for clear map / reset state (one-slot snapshot before the op,
   "undo" button in the toast that follows).
7. Unify status: one status strip (turn + brain + tts + recording icons)
   replacing 4–6 separate boxes.

**P2 — layout & polish**
8. Panel collapse handle (world goes full-bleed); hint card dismissible and
   responsive; better short-viewport behavior.
9. Visible recent-chat line near the chat input (last message + reply).
10. Keyboard shortcuts legend (?, step, settle, etc.).

Non-goals for now: onboarding wizard, mobile touch layout — the toybox is a
desktop tinker tool.
