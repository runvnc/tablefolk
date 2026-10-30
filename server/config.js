// Server settings, from the environment (Bun reads .env from the working
// directory; the repo's .env is read here too, so the server can start from
// anywhere). Two independent LLM endpoints:
//
//   characters  LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
//               what the browser's "endpoint" brain uses through /api/llm/v1
//   generator   GEN_BASE_URL, GEN_API_KEY, GEN_MODEL
//               what /world/<prompt> uses to write scenarios
//
// A base URL may be the shorthand "openrouter", "openai" (api.openai.com) or
// "local" (litert-lm serve on this machine, LITERT_URL). Keys default to
// OPENROUTER_API_KEY for OpenRouter and OPENAI_API_KEY for OpenAI.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const env = (k, d = '') => process.env[k] ?? d;

export const LITERT_URL = env('LITERT_URL', 'http://127.0.0.1:9379/v1');
// Native multimodal model for speech (and image) input: litert-lm import
// --from-huggingface-repo litert-community/gemma-4-E2B-it-litert-lm gemma-4-E2B-it.litertlm gemma4-e2b-mm
export const SPEECH_MODEL = env('LITERT_SPEECH_MODEL', 'gemma4-e2b-mm');
// Breeze TTS 2 on this machine (breeze-server from HoppouAI/Breeze-TTS-2.cpp,
// tools/breeze-server.sh): the page's "Breeze" speech engine, via /api/tts/breeze/
export const BREEZE_URL = env('BREEZE_URL', 'http://127.0.0.1:8137');
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
export const OPENAI_URL = 'https://api.openai.com/v1';

// Default models by provider (fallbackModel may be one of these objects).
export const DEFAULT_MODELS = {
  characters: { openrouter: 'google/gemma-4-26b-a4b-it', openai: 'gpt-6-luna' },
  generator: { openrouter: 'deepseek/deepseek-v4.1-flash-1017', openai: 'gpt-6-luna' },
};

// Resolve a base URL shorthand and pick a matching default key and model.
// keys: { openrouter, openai } saved on the admin page, before the environment.
export function endpoint(baseURL, apiKey, model, fallbackModel, keys = {}) {
  const short = String(baseURL || 'openrouter').toLowerCase();
  if (short === 'local' || short === 'litert') return { baseURL: LITERT_URL, apiKey: apiKey || '', model: model || env('LITERT_MODEL', 'gemma4-e4b,gpu'), local: true, provider: 'local' };
  const url = short === 'openrouter' ? OPENROUTER_URL : short === 'openai' ? OPENAI_URL : baseURL;
  const provider = url.includes('openrouter.ai') ? 'openrouter' : url.includes('api.openai.com') ? 'openai' : 'custom';
  const key = apiKey || (provider === 'openrouter' ? keys.openrouter || env('OPENROUTER_API_KEY') : provider === 'openai' ? keys.openai || env('OPENAI_API_KEY') : '');
  const fb = typeof fallbackModel === 'object' ? fallbackModel[provider] || fallbackModel.openrouter : fallbackModel;
  return { baseURL: url, apiKey: key, model: model || fb, local: false, provider,
    headers: provider === 'openrouter' ? { 'HTTP-Referer': 'https://tablefolk.world', 'X-Title': 'Tablefolk' } : {} };
}

export const config = {
  port: +env('PORT', '8000'),
  // The proxy spends your API key: only this machine by default.
  host: env('HOST', '127.0.0.1'),
  characters: endpoint(env('LLM_BASE_URL'), env('LLM_API_KEY'), env('LLM_MODEL'), DEFAULT_MODELS.characters),
  generator: endpoint(env('GEN_BASE_URL'), env('GEN_API_KEY'), env('GEN_MODEL'), DEFAULT_MODELS.generator),
  // Start `litert-lm serve` with the server (or pass --litert).
  startLitert: env('START_LITERT') === '1',
  // What /world/<prompt> shows while it builds: "builder" (the prompt form and
  // live progress) or "loading" (a plain progress bar for players).
  worldView: env('WORLD_VIEW', 'builder') === 'loading' ? 'loading' : 'builder',
};
