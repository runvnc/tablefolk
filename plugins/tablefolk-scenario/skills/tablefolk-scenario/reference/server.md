# Running the server

Tablefolk is static files plus an optional Bun server. Scenario links need
only something that serves the app; the server adds the world builder, the
admin page, the AI proxies and speech input.

```bash
git clone --depth 1 https://github.com/runvnc/tablefolk.git
cd tablefolk
bun server/server.js 8000                    # http://localhost:8000/ (landing), /app/ (the app)
bun server/server.js 8000 --litert           # also start `litert-lm serve` (native Gemma on this machine)
bun server/server.js 8000 --world-loading    # /world/ shows players a loading bar, not the builder
bun server/server.js 8000 --reset-admin      # ask for a new admin password
```

Without Bun, any static server works for playing links (`python3 -m
http.server 8000` in the repo, then `/app/`), but not for `/world/`,
`/admin` or the endpoint brain's proxy.

## Settings

From the environment or `.env` in the repo (git-ignored; the server never
serves `.env`, `.git` or `.admin`). The admin page's saved settings
(`.admin/settings.json`) win over the environment. Full list:
`server/config.js`.

| setting | meaning |
|---|---|
| `PORT`, `HOST` | default 8000 and 127.0.0.1: only this machine, since the proxy spends your key |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | the characters' endpoint brain (`/api/llm/v1`); base `openrouter` (default), `openai`, `local` or a URL; default model `google/gemma-4-26b-a4b-it` on OpenRouter |
| `GEN_BASE_URL`, `GEN_API_KEY`, `GEN_MODEL` | the world builder's generator; default `deepseek/deepseek-v4.1-flash-1017` on OpenRouter, `gpt-6-luna` on OpenAI |
| `OPENROUTER_API_KEY`, `OPENAI_API_KEY` | provider keys (also settable on the admin page) |
| `LITERT_URL`, `LITERT_MODEL`, `START_LITERT=1` | the local model server (`litert-lm serve`, default `http://127.0.0.1:9379/v1`, `gemma4-e4b,gpu`) |
| `LITERT_SPEECH_MODEL` | the multimodal model for speech input (default `gemma4-e2b-mm`) |
| `WORLD_VIEW=loading` | same as `--world-loading` |

Native local models:

```bash
uv tool install litert-lm
litert-lm import --from-huggingface-repo litert-community/gemma-4-E4B-it-litert-lm gemma-4-E4B-it-gpu.litertlm gemma4-e4b
litert-lm import --from-huggingface-repo litert-community/gemma-4-E2B-it-litert-lm gemma-4-E2B-it.litertlm gemma4-e2b-mm
```

## Routes

| route | what |
|---|---|
| `/` | landing page (`index.html`, `home.js`) |
| `/app/` | the app |
| `/world/<prompt>` | the world builder ([world-builder.md](world-builder.md)) |
| `/admin` | the admin page |
| `/api/llm/v1/...` | OpenAI-compatible proxy for the characters' endpoint brain |
| `/api/local/v1/...` | the same, to `litert-lm serve` |
| `/api/generate`, `/api/revise`, `/api/finish` | write, change and check scenarios |
| `/api/worldgen/options` | where the builder's model may run, and which models |
| `/api/transcribe` | speech input (Gemma on `litert-lm serve`) |
| `/api/skills`, `/api/roles` | the built-in skills and roles |
| `/api/voices` | voice genders and descriptions |
| `/api/status` | what is configured (never keys) |

The routes are listed at the top of `server/server.js`.

## The admin page (`/admin`)

The first start asks for an admin password in the terminal (without a
terminal it makes one up and writes it to `.admin/initial-password.txt`); only
a hash is kept, in `.admin/password.json`. Delete that file (or start with
`--reset-admin`) to set a new one.

The page has: an overview (status, links to the world for players, the world
in dev mode `/app/?dev=1`, the world builder); both LLM endpoints with a
provider select, custom URL, test button, and saved OpenRouter and OpenAI
keys; the world builder's models (cloud models offered, what guests may use)
and what `/world/` shows players; what visitors may use for characters (the
endpoint brain on by default, the local model off); the players' speech
engine; voice genders and descriptions (used to cast voices and by the
generator); recent generations and the saved worlds in `generated/` (play,
play in dev mode, edit in the builder, delete); and a password change.

## Visitors and limits

Only a direct request from this machine counts as the owner (model choices,
the AI proxies). Requests through a reverse proxy or tunnel (forwarding
headers) are visitors, rate-limited by their real address: the characters'
endpoint brain 240 requests per 10 minutes each (always the configured model,
replies capped), 8 worlds built an hour with the server's models, 20 AI
changes, 30 saved, 60 speech inputs per 10 minutes (speech only when the local
model is open to visitors). Guests get only the world builder options the
admin page allows.

## Models for players

The browser models download from the `geebr-models` R2 bucket under four
hostnames (`geebr-models[-2|-3|-4].mindroot.io`, `MODEL_MIRRORS` in
`app/llm_js/litert-worker.js`): Chrome opens one connection per host, so four
hosts reach line speed. A self-hosted copy can point them elsewhere. The
"with sight" model still downloads from Hugging Face.
