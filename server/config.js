// Server settings, from the environment (Bun reads .env from the working
// directory; the repo's .env is read here too, so the server can start from
// anywhere). Two independent LLM endpoints:
//
//   characters  LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
//               what the browser's "endpoint" brain uses through /api/llm/v1
//   generator   GEN_BASE_URL, GEN_API_KEY, GEN_MODEL
//               what /world/<prompt> uses to write scenarios
//
// A base URL may be the shorthand "openrouter" or "local" (litert-lm serve on
// this machine, LITERT_URL). Keys default to OPENROUTER_API_KEY for OpenRouter.
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
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

// Resolve a base URL shorthand and pick a matching default key and model.
export function endpoint(baseURL, apiKey, model, fallbackModel) {
  const short = String(baseURL || 'openrouter').toLowerCase();
  if (short === 'local' || short === 'litert') return { baseURL: LITERT_URL, apiKey: apiKey || '', model: model || env('LITERT_MODEL', 'gemma4-e4b,gpu'), local: true };
  const url = short === 'openrouter' ? OPENROUTER_URL : baseURL;
  const isOR = url.includes('openrouter.ai');
  return { baseURL: url, apiKey: apiKey || (isOR ? env('OPENROUTER_API_KEY') : ''), model: model || fallbackModel, local: false,
    headers: isOR ? { 'HTTP-Referer': 'https://tablefolk.world', 'X-Title': 'Tablefolk' } : {} };
}

export const config = {
  port: +env('PORT', '8000'),
  // The proxy spends your API key: only this machine by default.
  host: env('HOST', '127.0.0.1'),
  characters: endpoint(env('LLM_BASE_URL'), env('LLM_API_KEY'), env('LLM_MODEL'), 'google/gemma-4-26b-a4b-it'),
  generator: endpoint(env('GEN_BASE_URL'), env('GEN_API_KEY'), env('GEN_MODEL'), 'openai/gpt-6-luna'),
  // Start `litert-lm serve` with the server (or pass --litert).
  startLitert: env('START_LITERT') === '1',
};
