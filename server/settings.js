// Settings changed on the admin page, saved in .admin/settings.json (the
// .admin folder is never served and is git-ignored). They override the
// environment / .env values in config.js while the server runs and after a
// restart. Delete the file to go back to the environment.
//
//   characters / generator   { baseURL, model, apiKey }  (empty = environment)
//   worldView                "builder" | "loading"
//   voices                   { alba: { gender, description }, ... }
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT, endpoint } from './config.js';

export const ADMIN_DIR = join(ROOT, '.admin');
const FILE = join(ADMIN_DIR, 'settings.json');

// Pocket-TTS built-in voices (app/tts/pocket-tts-manager.js BUILTINS).
export const VOICE_IDS = ['alba', 'azelma', 'cosette', 'eponine', 'fantine', 'javert', 'jean', 'marius'];
const DEFAULT_GENDER = { alba: 'female', azelma: 'female', cosette: 'female', eponine: 'female', fantine: 'female', javert: 'male', jean: 'male', marius: 'male' };

// What config.js made from the environment, to fall back to.
const ENV = {
  characters: { ...config.characters, raw: { baseURL: process.env.LLM_BASE_URL || '', model: process.env.LLM_MODEL || '', apiKey: process.env.LLM_API_KEY || '' } },
  generator: { ...config.generator, raw: { baseURL: process.env.GEN_BASE_URL || '', model: process.env.GEN_MODEL || '', apiKey: process.env.GEN_API_KEY || '' } },
  worldView: config.worldView,
};
const DEFAULT_MODEL = { characters: 'google/gemma-4-26b-a4b-it', generator: 'openai/gpt-6-luna' };

let saved = {};
try { if (existsSync(FILE)) saved = JSON.parse(readFileSync(FILE, 'utf8')) || {}; } catch (e) { console.warn('admin settings unreadable, ignored:', e.message); }

function apply() {
  for (const k of ['characters', 'generator']) {
    const s = saved[k] || {}, raw = ENV[k].raw;
    if (!s.baseURL && !s.model && !s.apiKey) { config[k] = ENV[k]; continue; }
    config[k] = endpoint(s.baseURL || raw.baseURL, s.apiKey || raw.apiKey, s.model || raw.model, DEFAULT_MODEL[k]);
  }
  config.worldView = saved.worldView === 'loading' || saved.worldView === 'builder' ? saved.worldView : ENV.worldView;
}
apply();

export function voices() {
  const v = saved.voices || {};
  return VOICE_IDS.map(id => ({ id, gender: v[id]?.gender || DEFAULT_GENDER[id], description: v[id]?.description || '' }));
}
// For the generator's prompt: "alba (female, warm young woman), ..."
export function voicesText() {
  return voices().map(v => `${v.id} (${[v.gender, v.description].filter(Boolean).join(', ')})`).join(', ');
}

// What the admin page shows: keys only as "set" / not.
export function publicSettings() {
  const ep = k => ({ baseURL: saved[k]?.baseURL || '', model: saved[k]?.model || '', keySaved: !!saved[k]?.apiKey,
    effective: { baseURL: config[k].baseURL, model: config[k].model, key: !!config[k].apiKey } });
  return { characters: ep('characters'), generator: ep('generator'), worldView: config.worldView, voices: voices() };
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
  if (patch.worldView === 'builder' || patch.worldView === 'loading' || patch.worldView === '') saved.worldView = patch.worldView || undefined;
  if (Array.isArray(patch.voices)) {
    saved.voices = {};
    for (const v of patch.voices) if (VOICE_IDS.includes(v.id)) saved.voices[v.id] = { gender: v.gender === 'male' ? 'male' : 'female', description: String(v.description || '').slice(0, 200) };
  }
  mkdirSync(ADMIN_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600 });
  apply();
  return publicSettings();
}
