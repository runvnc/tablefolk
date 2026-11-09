// tablefolk.world on Cloudflare: the static site (cloud/public/, served by
// Cloudflare before this Worker runs) plus what the Bun server does that a
// visitor needs, in "bring your own model" form: nothing here holds a key or
// runs a model. The world builder runs in the visitor's browser (their GPU)
// or on their own key / server (app/worldgen-own.js); this Worker hands out
// the generator's prompt and checks the result, with the server's own code
// (server/worldgen-core.js). Requests reach it only when no file matches.
//
//   /world, /world/<prompt>     the builder page (worldPage)
//   /api/worldgen/options       in this browser, your own key
//   /api/worldgen/messages      POST: the generator's messages for your own model
//   /api/finish                 POST: checks a world (nothing is saved)
//   /api/voices, /api/status, /api/skills, /api/roles   from cloud/data.js
//   /<world>                    short links to scenarios/<world>.json (as server.js)
//   /api/generate, /api/revise, /api/llm, /api/local, /api/transcribe, /api/tts, /admin
//                               not here: a refusal that says what to use instead
import { worldPage, finishScenario, systemPrompt, generateUser, reviseRequest, BROWSER_MODELS, OWN_MODELS } from '../server/worldgen-core.js';
import DATA from './data.js';

const ISOLATE = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Referrer-Policy': 'no-referrer' };   // (no Referer: see build.mjs)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (data, status = 200) => Response.json(data, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } });
const NO_SERVER_AI = 'this site does not run AI models: build in your browser or with your own key (OpenRouter or your own server)';

function options() {
  return {
    admin: false, byo: true, default: 'own',
    where: [
      { id: 'browser', label: 'In this browser', note: 'free and private: the model runs on your own graphics card (downloaded once, then kept)', models: BROWSER_MODELS.map(([id, label]) => ({ id, label })) },
      { id: 'own', label: 'Your own key', note: 'your OpenRouter key, or any OpenAI-compatible server (a local one too); your browser calls it directly, the key never reaches this site', models: OWN_MODELS.map(id => ({ id, label: id })) },
    ],
  };
}

async function messages(req) {
  const text = await req.text().catch(() => '');
  if (text.length > 400000) return json({ error: 'scenario too large' }, 413);
  let b = {}; try { b = JSON.parse(text) || {}; } catch {}
  const system = { role: 'system', content: systemPrompt(DATA.skill, DATA.voicesText) };
  if (b.scenario && typeof b.scenario === 'object') {
    const request = String(b.request || '').trim().slice(0, 2000); if (!request) return json({ error: 'request required' }, 400);
    const { kept, maxTokens, user } = reviseRequest(b.scenario, request);
    return json({ messages: [system, { role: 'user', content: user }], maxTokens, temperature: 0.7, kept });
  }
  const prompt = String(b.prompt || '').trim().slice(0, 2000); if (!prompt) return json({ error: 'prompt required' }, 400);
  return json({ messages: [system, { role: 'user', content: generateUser(prompt, String(b.mode || 'auto')) }], maxTokens: 17000, temperature: 0.7 });
}

async function finish(req) {
  const text = await req.text().catch(() => '');
  if (text.length > 400000) return json({ error: 'scenario too large' }, 413);
  let body = {}; try { body = JSON.parse(text) || {}; } catch {}
  const r = finishScenario(body, DATA.packVoices);
  if (r.problems) return json({ problems: r.problems });
  return json({ scenario: r.scenario, code: r.code, link: '/app/#s=' + r.code, ms: body.ms || 0, model: body.model || 'browser', warnings: [] });
}

// /oracle, /goblin-bakery: scenarios/<word>.json or scenarios/the-<word>.json
function shortLink(url) {
  const m = url.pathname.match(/^\/([a-z0-9][a-z0-9-]{1,60})\/?$/i); if (!m) return null;
  const word = m[1].toLowerCase();
  for (const name of [word, 'the-' + word]) {
    if (!DATA.scenarios.includes(name)) continue;
    const q = new URLSearchParams(url.search); q.set('scenario', '../scenarios/' + name + '.json');
    return Response.redirect(url.origin + '/app/?' + q.toString().replace(/%2F/g, '/'), 302);
  }
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    // www. and the workers.dev name lead to the one address
    if (url.hostname === 'www.tablefolk.world') return Response.redirect('https://tablefolk.world' + p + url.search, 301);
    if (p === '/world' || p.startsWith('/world/')) return new Response(worldPage(url, { admin: false, defaultView: 'builder' }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...ISOLATE } });
    if (p === '/api/worldgen/options') return json(options());
    if (p === '/api/worldgen/messages') return req.method === 'POST' ? messages(req) : json({ error: 'POST {prompt, mode} or {scenario, request}' }, 405);
    if (p === '/api/finish') return req.method === 'POST' ? finish(req) : json({ error: 'POST {scenario}' }, 405);
    if (p === '/api/voices') return json(DATA.voices);
    if (p === '/api/skills') return json({ skills: DATA.skills });
    if (p === '/api/roles') return json({ roles: DATA.roles });
    if (p === '/api/status') return json({ characters: { key: false }, generator: { key: false }, speech: false, site: 'cloudflare', built: DATA.built });
    // the server's AI: a stream (EventSource) gets its refusal as the "failed" event
    if (p === '/api/generate') return url.searchParams.get('stream') === '1'
      ? new Response(`event: failed\ndata: ${JSON.stringify({ error: NO_SERVER_AI })}\n\n`, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS } })
      : json({ error: NO_SERVER_AI }, 403);
    if (p === '/api/revise') return json({ error: NO_SERVER_AI }, 403);
    if (p.startsWith('/api/llm/') || p.startsWith('/api/local/')) return json({ error: { message: 'this site does not run AI models: use a model in your browser, or your own key or server (Brain options)' } }, 403);
    if (p === '/api/transcribe' || p.startsWith('/api/tts/') || p.startsWith('/api/admin')) return json({ error: 'not available on this site' }, 404);
    if (p === '/admin' || p === '/admin/') return new Response('The admin page is on your own Tablefolk server, not on tablefolk.world.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const short = shortLink(url); if (short) return short;
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
  },
};
