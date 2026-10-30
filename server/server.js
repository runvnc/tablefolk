#!/usr/bin/env bun
// Tablefolk server (Bun).
//
//   bun server/server.js [port] [--litert] [--world-loading]
//
// Serves the project's static files (the app at /app/), and:
//   /api/llm/v1/...     OpenAI-compatible proxy for the characters' "endpoint"
//                       brain (LLM_* settings; the key never reaches the page)
//   /api/local/v1/...   the same, to litert-lm serve on this machine
//   /world/<prompt>     writes a scenario from a prompt and opens it (the
//                       builder page, or with --world-loading / WORLD_VIEW=loading
//                       a plain loading screen; ?view= overrides per link)
//   /api/generate       the generator itself (JSON or a server-sent-event stream)
//   /api/revise         POST {scenario, request}: the generator changes a scenario
//   /api/status         what is configured (never keys)
//   /admin              the admin page (password set on first start;
//                       delete .admin/password.json or pass --reset-admin to reset)
//   /api/voices         voice genders and descriptions (set on /admin)
//   /api/tts/breeze/... Breeze TTS 2's breeze-server on this machine (BREEZE_URL):
//                       health, voices, streamed speech, for the owner only
// See server/config.js for the settings.
import { join, normalize, extname } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { config, ROOT, LITERT_URL, SPEECH_MODEL, BREEZE_URL } from './config.js';
import { handleWorld, handleGenerate, handleRevise, handleFinish, worldgenOptions } from './generate.js';
import { setupAdmin, handleAdmin, savedWorld, isAdmin, ownerRequests, requestIps, overLimit } from './admin.js';

const args = process.argv.slice(2);
const port = +(args.find(a => /^\d+$/.test(a)) || config.port);
if (args.includes('--litert')) config.startLitert = true;
if (args.includes('--world-loading')) config.worldView = 'loading';
config.port = port;
await setupAdmin({ reset: args.includes('--reset-admin') });

function headersFor(path) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };
  // Entry points must be revalidated or browsers keep running an old build:
  // preflight.js carries every other file's ?v= version string. Assets too:
  // they have no version strings and get replaced in place.
  if (path.endsWith('.html') || path.endsWith('/') || path.endsWith('preflight.js') || path.includes('/assets/')) h['Cache-Control'] = 'no-cache';
  return h;
}

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.litertlm': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8' };

async function serveStatic(req, url) {
  let rel = decodeURIComponent(url.pathname);
  const file0 = normalize(join(ROOT, rel));
  if (!file0.startsWith(ROOT) || /(^|\/)\.(env|git|admin)(\/|$)/.test(rel)) return new Response('forbidden', { status: 403 });
  let file = file0;
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!rel.endsWith('/')) return Response.redirect(url.pathname + '/' + url.search, 301);
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) return new Response('not found', { status: 404, headers: headersFor(rel) });
  const f = Bun.file(file), type = TYPES[extname(file)] || f.type;
  return new Response(f, { headers: { ...headersFor(rel), 'Content-Type': type } });
}

// Forward an OpenAI-style request, filling in the endpoint's key and default
// model. Responses (streams included) pass straight through.
// Visitors who are not the admin: only when the admin page allows it
// (config.guestBrain), always the configured model with a capped reply, and
// at most RATE requests per client in RATE_MS (one turn is one request; a
// world living on its own makes about one every 5 s).
const RATE = 240, RATE_MS = 10 * 60e3, hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < RATE_MS);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > RATE_MS) hits.delete(k);
  return h.length > RATE;
}
async function proxy(req, url, prefix, ep, ip = '', which = 'cloud', local = false) {
  const sub = url.pathname.slice(prefix.length);
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
  if (!['/models', '/chat/completions'].includes(sub)) return Response.json({ error: { message: 'only /models and /chat/completions are proxied' } }, { status: 404 });
  // the admin, or anyone on this machine itself (the owner), is not a visitor
  const guest = !isAdmin(req) && !local;
  if (guest && !config.guestBrain?.[which]) return Response.json({ error: { message: which === 'local' ? 'this server\'s local model is not open to visitors' : 'the server\'s AI is not open to visitors: use the brain in your browser' } }, { status: 403 });
  if (guest && req.method === 'POST' && limited(ip)) return Response.json({ error: { message: 'too many requests: wait a few minutes' } }, { status: 429 });
  let body;
  if (req.method === 'POST') {
    body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: { message: 'JSON body required' } }, { status: 400 });
    if (!body.model || guest) body.model = ep.model;
    if (guest) body.max_tokens = Math.min(+body.max_tokens || 1024, 2048);
  }
  try {
    const up = await fetch(ep.baseURL + sub, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', ...(ep.apiKey ? { Authorization: 'Bearer ' + ep.apiKey } : {}), ...(ep.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return new Response(up.body, { status: up.status, headers: { 'Content-Type': up.headers.get('content-type') || 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' } });
  } catch (e) {
    return Response.json({ error: { message: `upstream ${ep.baseURL} unreachable: ${e.message}` } }, { status: 502 });
  }
}

// Breeze TTS 2 (breeze-server) on this machine, for the page's "Breeze" speech
// engine (app/tts/breeze-client.js). Through here the page needs no CORS from
// breeze-server and never asks the browser for local network access. Its GPU
// is the owner's: visitors only when the admin page opens this machine's local model to them.
async function breezeProxy(req, url, local) {
  const sub = url.pathname.slice('/api/tts/breeze'.length);
  if (!['/health', '/v1/voices', '/v1/audio/speech'].includes(sub)) return Response.json({ error: 'not proxied' }, { status: 404 });
  if (!local && !isAdmin(req) && !config.guestBrain?.local) return Response.json({ error: 'this server\'s Breeze voice is not open to visitors' }, { status: 403 });
  try {
    const up = await fetch(BREEZE_URL + sub, {
      method: req.method, headers: req.headers.get('content-type') ? { 'Content-Type': req.headers.get('content-type') } : {},
      body: req.method === 'POST' ? await req.arrayBuffer() : undefined, signal: sub === '/health' ? AbortSignal.timeout(1500) : undefined,
    });
    const h = { 'Content-Type': up.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' };
    for (const k of ['x-sample-rate', 'x-sample-format']) if (up.headers.get(k)) h[k] = up.headers.get(k);
    return new Response(up.body, { status: up.status, headers: h });
  } catch (e) {
    return Response.json({ error: `breeze-server at ${BREEZE_URL} unreachable: ${e.message}` }, { status: 502 });
  }
}

// Speech to text with Gemma 4's own audio input (litert-lm serve and a model
// with an audio encoder). The page posts 16 kHz mono WAV.
let speechChecked = null;
async function speechAvailable() {
  if (speechChecked && Date.now() - speechChecked.at < 30000) return speechChecked.ok;
  let ok = false;
  try { const r = await fetch(LITERT_URL + '/models', { signal: AbortSignal.timeout(1500) }); ok = (await r.json()).data?.some(m => m.id === SPEECH_MODEL.split(',')[0]); } catch {}
  speechChecked = { ok, at: Date.now() };
  return ok;
}
async function transcribe(req) {
  const wav = Buffer.from(await req.arrayBuffer());
  if (wav.length < 1000 || wav.length > 20e6) return Response.json({ error: 'expected a WAV recording up to 20 MB' }, { status: 400 });
  try {
    const t0 = Date.now();
    const r = await fetch(LITERT_URL + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: SPEECH_MODEL, max_tokens: 200, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'text', text: 'Transcribe this speech exactly. Output only the spoken words, nothing else.' },
        { type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } }] }] }),
    });
    const d = await r.json();
    if (!r.ok) return Response.json({ error: d.error?.message || 'transcription failed' }, { status: 502 });
    const text = String(d.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    return Response.json({ text, ms: Date.now() - t0, model: SPEECH_MODEL });
  } catch (e) {
    return Response.json({ error: 'local speech model unreachable (start litert-lm serve): ' + e.message }, { status: 503 });
  }
}

// Built-in skills (skills/<id>/skill.json), for discovery.
async function listSkills() {
  const { readdirSync, readFileSync } = await import('node:fs');
  const out = [];
  for (const d of readdirSync(join(ROOT, 'skills'), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try { const m = JSON.parse(readFileSync(join(ROOT, 'skills', d.name, 'skill.json'), 'utf8')); out.push({ ref: d.name, id: m.id, name: m.name, version: m.version, description: m.description, commands: Object.keys(m.commands || {}), code: !!m.module }); } catch {}
  }
  return Response.json({ skills: out });
}

async function listRoles() {
  const { readdirSync, readFileSync } = await import('node:fs');
  const out = [];
  for (const d of readdirSync(join(ROOT, 'roles'), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try { const m = JSON.parse(readFileSync(join(ROOT, 'roles', d.name, 'role.json'), 'utf8')); out.push({ ref: d.name, id: m.id, name: m.name, version: m.version, description: m.description, skills: m.skills || [], commands: m.commands || [] }); } catch {}
  }
  return Response.json({ roles: out });
}

const server = Bun.serve({
  port, hostname: config.host, idleTimeout: 255,
  async fetch(req, srv) {
    // Behind a reverse proxy or tunnel every request comes from 127.0.0.1:
    // the client's address is in its headers, and such a request is never
    // "this machine". Only a direct loopback request is the owner's.
    const fwd = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const url = new URL(req.url), ip = fwd || srv?.requestIP?.(req)?.address || '', local = !fwd && /^(127\.|::1$|::ffff:127\.)/.test(ip);
    if (local) ownerRequests.add(req);
    requestIps.set(req, ip);
    const p = url.pathname;
    // / is the landing page (index.html), served as a static file below
    if (p.startsWith('/api/llm/v1/')) return proxy(req, url, '/api/llm/v1', config.characters, ip, 'cloud', local);
    if (p.startsWith('/api/tts/breeze/')) return breezeProxy(req, url, local);
    if (p.startsWith('/api/local/v1/')) return proxy(req, url, '/api/local/v1', { baseURL: LITERT_URL, model: 'gemma4-e4b,gpu' }, ip, 'local', local);
    if (p === '/api/generate') return handleGenerate(req, url);
    if (p === '/api/worldgen/options') return Response.json(await worldgenOptions(req), { headers: { 'Cache-Control': 'no-store' } });
    if (p === '/api/revise') return handleRevise(req, url);
    if (p === '/api/finish') return handleFinish(req);
    if (p === '/api/transcribe' && req.method === 'POST') {
      if (!isAdmin(req) && !config.guestBrain?.local) return Response.json({ error: 'speech input through this server is not open to visitors' }, { status: 403 });
      if (overLimit(req, 'transcribe', 60, 600e3)) return Response.json({ error: 'too many requests: wait a few minutes' }, { status: 429 });
      return transcribe(req);
    }
    if (p === '/api/skills') return listSkills();
    if (p === '/api/roles') return listRoles();
    if (p === '/world' || p.startsWith('/world/')) return handleWorld(req, url, { saved: url.searchParams.get('edit') ? savedWorld(req, url.searchParams.get('edit')) : null });
    if (p === '/admin' || p === '/admin/' || p.startsWith('/api/admin/') || p === '/api/voices') return handleAdmin(req, url);
    if (p === '/api/status') return Response.json({
      characters: { baseURL: config.characters.baseURL, model: config.characters.model, key: !!config.characters.apiKey },
      generator: { baseURL: config.generator.baseURL, model: config.generator.model, key: !!config.generator.apiKey },
      local: LITERT_URL,
      speech: await speechAvailable(),
    });
    return serveStatic(req, url);
  },
});

let litert = null;
if (config.startLitert) {
  const port = new URL(LITERT_URL).port || '9379';
  litert = Bun.spawn(['litert-lm', 'serve', '--port', port], { stdout: 'inherit', stderr: 'inherit' });
  console.log(`started litert-lm serve on ${LITERT_URL}`);
  const stop = () => { try { litert.kill(); } catch {} process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

console.log(`Serving tablefolk.world on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${server.port}/app/`);
console.log(`  characters' endpoint brain -> ${config.characters.baseURL} (${config.characters.model})${config.characters.apiKey ? '' : ' [no key]'}`);
console.log(`  scenario generator         -> ${config.generator.baseURL} (${config.generator.model})${config.generator.apiKey || config.generator.local ? '' : ' [no key]'}`);
