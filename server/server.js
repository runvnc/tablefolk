#!/usr/bin/env bun
// Tablefolk server (Bun).
//
//   bun server/server.js [port] [--litert]
//
// Serves the project's static files (the app at /app/), and:
//   /api/llm/v1/...     OpenAI-compatible proxy for the characters' "endpoint"
//                       brain (LLM_* settings; the key never reaches the page)
//   /api/local/v1/...   the same, to litert-lm serve on this machine
//   /world/<prompt>     writes a scenario from a prompt and opens it
//   /api/generate       the generator itself (JSON or a server-sent-event stream)
//   /api/status         what is configured (never keys)
// See server/config.js for the settings.
import { join, normalize, extname } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { config, ROOT, LITERT_URL } from './config.js';
import { handleWorld, handleGenerate } from './generate.js';

const args = process.argv.slice(2);
const port = +(args.find(a => /^\d+$/.test(a)) || config.port);
if (args.includes('--litert')) config.startLitert = true;

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
  if (!file0.startsWith(ROOT) || /(^|\/)\.(env|git)(\/|$)/.test(rel)) return new Response('forbidden', { status: 403 });
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
async function proxy(req, url, prefix, ep) {
  const sub = url.pathname.slice(prefix.length);
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
  if (!['/models', '/chat/completions'].includes(sub)) return Response.json({ error: { message: 'only /models and /chat/completions are proxied' } }, { status: 404 });
  let body;
  if (req.method === 'POST') {
    body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: { message: 'JSON body required' } }, { status: 400 });
    if (!body.model) body.model = ep.model;
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

const server = Bun.serve({
  port, hostname: config.host, idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/') return Response.redirect('/app/', 302);
    if (p.startsWith('/api/llm/v1/')) return proxy(req, url, '/api/llm/v1', config.characters);
    if (p.startsWith('/api/local/v1/')) return proxy(req, url, '/api/local/v1', { baseURL: LITERT_URL, model: 'gemma4-e4b,gpu' });
    if (p === '/api/generate') return handleGenerate(req, url);
    if (p === '/world' || p.startsWith('/world/')) return handleWorld(req, url);
    if (p === '/api/status') return Response.json({
      characters: { baseURL: config.characters.baseURL, model: config.characters.model, key: !!config.characters.apiKey },
      generator: { baseURL: config.generator.baseURL, model: config.generator.model, key: !!config.generator.apiKey },
      local: LITERT_URL,
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
