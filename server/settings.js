// Settings changed on the admin page, saved in .admin/settings.json (the
// .admin folder is never served and is git-ignored). They override the
// environment / .env values in config.js while the server runs and after a
// restart. Delete the file to go back to the environment.
//
//   characters / generator   { baseURL, model, apiKey }  (empty = environment;
//                            baseURL "openrouter" | "openai" | "local" | a URL)
//   keys                     { openrouter, openai }  provider keys, used by both
//   worldView                "builder" | "loading"
//   ttsEngine                the players' default speech engine (TTS_ENGINES)
//   voices                   { alba: { gender, description }, ... }
//   worldgen                 the world builder's model choices:
//                            { cloudModels: [...], guest: { browser, server, cloud, cloudModels: [...] } }
//                            (an admin may use any; guests what "guest" allows)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT, endpoint, DEFAULT_MODELS } from './config.js';

export const ADMIN_DIR = join(ROOT, '.admin');
const FILE = join(ADMIN_DIR, 'settings.json');

// Pocket-TTS built-in voices (app/tts/pocket-tts-manager.js BUILTINS).
// Speech engines (app/tts/pocket-tts-manager.js ENGINES); players can pick
// another one in the app's voice pane.
export const TTS_ENGINES = ['pocket-18m', 'pocket-100m'];
// The world builder's models: where it runs and which. "cloud" is the
// generator endpoint (OpenRouter by default), "server" the local model
// server (litert-lm serve), "browser" Gemma in the visitor's own browser.
export const DEFAULT_WORLDGEN = {
  cloudModels: ['deepseek/deepseek-v4.1-flash-1017', 'google/gemma-4-26b-a4b-it'],
  guest: { browser: true, server: false, cloud: true, cloudModels: ['deepseek/deepseek-v4.1-flash-1017'] },
};
function cleanWorldgen(w = {}) {
  const list = v => Array.isArray(v) ? [...new Set(v.map(m => String(m).trim()).filter(m => /^[\w.:\/@,+-]{1,120}$/.test(m)))].slice(0, 40) : null;
  const cloudModels = list(w.cloudModels) || DEFAULT_WORLDGEN.cloudModels;
  const g = { ...DEFAULT_WORLDGEN.guest, ...(w.guest || {}) };
  return { cloudModels, guest: { browser: !!g.browser, server: !!g.server, cloud: !!g.cloud, cloudModels: (list(g.cloudModels) || []).filter(m => cloudModels.includes(m)) } };
}
export const VOICE_IDS = ['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius'];
const DEFAULT_GENDER = { alba: 'female', azelma: 'female', cosette: 'female', eponine: 'female', fantine: 'female', javert: 'male', jean: 'male', marius: 'male' };

// What config.js made from the environment, to fall back to.
const ENV = {
  characters: { ...config.characters, raw: { baseURL: process.env.LLM_BASE_URL || '', model: process.env.LLM_MODEL || '', apiKey: process.env.LLM_API_KEY || '' } },
  generator: { ...config.generator, raw: { baseURL: process.env.GEN_BASE_URL || '', model: process.env.GEN_MODEL || '', apiKey: process.env.GEN_API_KEY || '' } },
  worldView: config.worldView,
};

let saved = {};
try { if (existsSync(FILE)) saved = JSON.parse(readFileSync(FILE, 'utf8')) || {}; } catch (e) { console.warn('admin settings unreadable, ignored:', e.message); }

function apply() {
  for (const k of ['characters', 'generator']) {
    const s = saved[k] || {}, raw = ENV[k].raw;
    const keys = saved.keys || {};
    if (!s.baseURL && !s.model && !s.apiKey && !keys.openrouter && !keys.openai) { config[k] = ENV[k]; continue; }
    config[k] = endpoint(s.baseURL || raw.baseURL, s.apiKey || raw.apiKey, s.model || raw.model, DEFAULT_MODELS[k], keys);
  }
  config.worldView = saved.worldView === 'loading' || saved.worldView === 'builder' ? saved.worldView : ENV.worldView;
  config.ttsEngine = TTS_ENGINES.includes(saved.ttsEngine) ? saved.ttsEngine : TTS_ENGINES[0];
  config.worldgen = cleanWorldgen(saved.worldgen);
  // the characters' brain through this server, for visitors who are not the
  // admin: the endpoint (spends the key) and the local model server (its GPU)
  config.guestBrain = { cloud: saved.guestBrain?.cloud !== false, local: saved.guestBrain?.local === true };
}
apply();

export function voices() {
  const v = saved.voices || {};
  return VOICE_IDS.map(id => ({ id, gender: v[id]?.gender || DEFAULT_GENDER[id], description: v[id]?.description || '' }));
}
// The designed voice library (assets/voices/voices.json, tools/fal-voices.py):
// ids as characters name them, "pack:<id>"
export function packVoices() {
  try { return JSON.parse(readFileSync(new URL('../assets/voices/voices.json', import.meta.url), 'utf8')).map(v => ({ id: 'pack:' + v.id, name: v.name, gender: v.gender, description: v.description, file: v.file, v: v.v, moods: v.moods })); } catch { return []; }
}
// For the generator's prompt: "alba (female, warm young woman), ..."
export function voicesText() {
  return voices().map(v => `builtin:${v.id} (${[v.gender, v.description].filter(Boolean).join(', ')})`).concat(packVoices().map(v => `${v.id} (${v.name}, ${v.gender}, ${v.description})`)).join(', ');
}

// What the admin page shows: keys only as "set" / not.
export function publicSettings() {
  const ep = k => ({ baseURL: saved[k]?.baseURL || '', model: saved[k]?.model || '', keySaved: !!saved[k]?.apiKey,
    effective: { baseURL: config[k].baseURL, model: config[k].model, key: !!config[k].apiKey, provider: config[k].provider } });
  const env = { openrouter: !!process.env.OPENROUTER_API_KEY, openai: !!process.env.OPENAI_API_KEY };
  const keys = Object.fromEntries(['openrouter', 'openai'].map(p => [p, { saved: !!saved.keys?.[p], env: env[p] }]));
  return { characters: ep('characters'), generator: ep('generator'), keys, defaults: DEFAULT_MODELS, worldView: config.worldView, ttsEngine: config.ttsEngine, voices: voices(), packVoices: packVoices(), worldgen: config.worldgen, guestBrain: config.guestBrain };
}

// patch: { characters: {baseURL, model, apiKey, clearKey}, generator: ..., worldView, voices: [{id, gender, description}] }
export function updateSettings(patch = {}) {
  for (const k of ['characters', 'generator']) {
    const p = patch[k]; if (!p) continue;
    const cur = saved[k] || {};
    const next = { baseURL: String(p.baseURL ?? cur.baseURL ?? '').trim(), model: String(p.model ?? cur.model ?? '').trim(), apiKey: cur.apiKey || '' };
    if (p.clearKey) next.apiKey = '';
    else if (p.apiKey) next.apiKey = String(p.apiKey).trim();
    saved[k] = next;
  }
  // keys: { openrouter: 'sk-...' | '' (keep) , clearOpenrouter: true, ... }
  if (patch.keys) {
    const k = { ...(saved.keys || {}) };
    for (const p of ['openrouter', 'openai']) {
      if (patch.keys['clear_' + p]) delete k[p];
      else if (patch.keys[p]) k[p] = String(patch.keys[p]).trim();
    }
    saved.keys = k;
  }
  if (patch.worldView === 'builder' || patch.worldView === 'loading' || patch.worldView === '') saved.worldView = patch.worldView || undefined;
  if (TTS_ENGINES.includes(patch.ttsEngine)) saved.ttsEngine = patch.ttsEngine;
  if (patch.guestBrain && typeof patch.guestBrain === 'object') saved.guestBrain = { cloud: patch.guestBrain.cloud !== false, local: patch.guestBrain.local === true };
  if (patch.worldgen && typeof patch.worldgen === 'object') saved.worldgen = cleanWorldgen({ ...config.worldgen, ...patch.worldgen, guest: { ...config.worldgen.guest, ...(patch.worldgen.guest || {}) } });
  if (Array.isArray(patch.voices)) {
    saved.voices = {};
    for (const v of patch.voices) if (VOICE_IDS.includes(v.id)) saved.voices[v.id] = { gender: v.gender === 'male' ? 'male' : 'female', description: String(v.description || '').slice(0, 200) };
  }
  mkdirSync(ADMIN_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600 });
  apply();
  return publicSettings();
}
