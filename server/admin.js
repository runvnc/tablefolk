// Admin page: /admin (password protected).
//
// The password: the first time the server starts it asks for one in the
// terminal (or, without a terminal, makes one up and writes it to
// .admin/initial-password.txt). Only its hash is kept, in
// .admin/password.json. Forgot it? Delete .admin/password.json (or start
// with --reset-admin) and the server asks again on the next start.
//
// The page: server status, links (the world as players see it, the world in
// dev mode, the world builder), the LLM endpoints for the characters and the
// generator (with a test button), the /world view players get, voice
// descriptions (also used by the generator and the app's voice picker),
// recent generations, the saved worlds in generated/, and the password.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config, ROOT, LITERT_URL } from './config.js';
import { ADMIN_DIR, publicSettings, updateSettings, voices } from './settings.js';
import { encodeScenario, recent } from './generate.js';
import { OpenAI } from '../app/llm_js/openai-client.js';

const PW_FILE = join(ADMIN_DIR, 'password.json');
const INITIAL_FILE = join(ADMIN_DIR, 'initial-password.txt');
const STARTED = Date.now();
const sessions = new Map();   // token -> expiry (ms); lost on restart
const SESSION_MS = 7 * 24 * 3600e3;

function readHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin; let s = '';
    process.stdout.write(question);
    stdin.setRawMode?.(true); stdin.resume();
    const on = buf => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', on); process.stdout.write('\n'); resolve(s); return; }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); }
        if (ch === '\u007f' || ch === '\b') { s = s.slice(0, -1); continue; }
        s += ch;
      }
    };
    stdin.on('data', on);
  });
}
async function savePassword(pw) {
  mkdirSync(ADMIN_DIR, { recursive: true });
  writeFileSync(PW_FILE, JSON.stringify({ hash: await Bun.password.hash(pw), set: new Date().toISOString() }) + '\n', { mode: 0o600 });
}

// Called once before the server starts listening.
export async function setupAdmin({ reset = false } = {}) {
  if (reset && existsSync(PW_FILE)) { unlinkSync(PW_FILE); console.log('admin password removed (--reset-admin)'); }
  if (existsSync(PW_FILE)) return;
  if (process.stdin.isTTY) {
    console.log('\nNo admin password yet (for http://.../admin). Choose one (at least 6 characters).');
    for (;;) {
      const a = await readHidden('  admin password: ');
      if (a.length < 6) { console.log('  too short'); continue; }
      const b = await readHidden('  again: ');
      if (a !== b) { console.log('  they differ, try again'); continue; }
      await savePassword(a); break;
    }
    console.log(`  saved (hash only) in ${PW_FILE}; delete that file to reset it.\n`);
  } else {
    const pw = randomBytes(9).toString('base64url');
    await savePassword(pw);
    writeFileSync(INITIAL_FILE, pw + '\n', { mode: 0o600 });
    console.log(`No admin password was set and there is no terminal to ask: made one up, in ${INITIAL_FILE}. Change it on /admin (that deletes the file).`);
  }
}

function cookies(req) { return Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; })); }
// The owner: logged in, or at this machine itself (a direct loopback request,
// not one through a reverse proxy: server.js marks those in ownerRequests).
// Used for model choices and the AI proxies; the admin page itself always
// needs the password.
export const ownerRequests = new WeakSet();
// Each request's client address (server.js), and a per-address limiter for
// the costly endpoints: limit(req, 'generate', 6, 3600e3) is false while the
// visitor has made fewer than 6 such requests in the last hour.
export const requestIps = new WeakMap();
const buckets = new Map();
export function overLimit(req, name, n, ms) {
  if (isAdmin(req)) return false;
  const key = name + '|' + (requestIps.get(req) || '?'), now = Date.now();
  const h = (buckets.get(key) || []).filter(t => now - t < ms); h.push(now); buckets.set(key, h);
  if (buckets.size > 20000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 864e5) buckets.delete(k);
  return h.length > n;
}
export function isAdmin(req) { return authed(req) || ownerRequests.has(req); }
function authed(req) {
  const t = cookies(req).tf_admin, exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

function generatedList() {
  const dir = join(ROOT, 'generated'); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 60).map(({ f, t }) => {
    try {
      const { prompt, mode, model, ...scn } = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      return { file: f, at: t, title: scn.title || f, prompt: prompt || '', model: model || '', link: '/app/#s=' + encodeScenario(scn), builder: '/world/?edit=' + encodeURIComponent(f) };
    } catch { return { file: f, at: t, title: f + ' (unreadable)', prompt: '', model: '', link: '' }; }
  });
}
async function testEndpoint(which) {
  const ep = config[which]; const t0 = Date.now();
  try {
    const client = new OpenAI({ baseURL: ep.baseURL, apiKey: ep.apiKey, defaultHeaders: ep.headers || {}, timeout: 60000 });
    const r = await client.chat.completions.create({ model: ep.model, messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 400 });
    return { ok: true, ms: Date.now() - t0, model: ep.model, text: String(r.choices?.[0]?.message?.content || '').trim().slice(0, 200) };
  } catch (e) { return { ok: false, ms: Date.now() - t0, model: ep.model, error: e.message }; }
}
async function localUp() { try { await fetch(LITERT_URL + '/models', { signal: AbortSignal.timeout(1200) }); return true; } catch { return false; } }

export async function handleAdmin(req, url) {
  const p = url.pathname;
  if (p === '/api/voices') return json({ voices: voices(), ttsEngine: config.ttsEngine });
  if (p === '/admin' || p === '/admin/') return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method === 'POST' && !(req.headers.get('content-type') || '').includes('application/json')) return json({ error: 'JSON only' }, 415);
  if (p === '/api/admin/login' && req.method === 'POST') {
    const { password } = await req.json().catch(() => ({}));
    const rec = existsSync(PW_FILE) ? JSON.parse(readFileSync(PW_FILE, 'utf8')) : null;
    if (!rec || !password || !(await Bun.password.verify(String(password), rec.hash))) { await Bun.sleep(600); return json({ error: 'wrong password' }, 401); }
    const token = randomBytes(24).toString('base64url'); sessions.set(token, Date.now() + SESSION_MS);
    return json({ ok: true }, 200, { 'Set-Cookie': `tf_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
  }
  if (!authed(req)) return json({ error: 'not logged in' }, 401);
  if (p === '/api/admin/logout' && req.method === 'POST') { sessions.delete(cookies(req).tf_admin); return json({ ok: true }, 200, { 'Set-Cookie': 'tf_admin=; Path=/; Max-Age=0' }); }
  if (p === '/api/admin/state') return json({
    status: { started: STARTED, uptime: Date.now() - STARTED, host: config.host, port: config.port, bun: Bun.version, local: { url: LITERT_URL, up: await localUp() }, initialPassword: existsSync(INITIAL_FILE) },
    settings: publicSettings(), recent: recent.slice(-30).reverse(), generated: generatedList(),
  });
  if (p === '/api/admin/settings' && req.method === 'POST') return json({ settings: updateSettings(await req.json()) });
  if (p === '/api/admin/test' && req.method === 'POST') { const { which } = await req.json(); return json(await testEndpoint(which === 'generator' ? 'generator' : 'characters')); }
  if (p === '/api/admin/password' && req.method === 'POST') {
    const { current, next } = await req.json();
    const rec = JSON.parse(readFileSync(PW_FILE, 'utf8'));
    if (!(await Bun.password.verify(String(current || ''), rec.hash))) { await Bun.sleep(600); return json({ error: 'the current password is wrong' }, 403); }
    if (String(next || '').length < 6) return json({ error: 'at least 6 characters' }, 400);
    await savePassword(String(next)); try { rmSync(INITIAL_FILE, { force: true }); } catch {}
    return json({ ok: true });
  }
  // a tile rendered in an admin's browser (app/map-editor.js): kept for everyone
  if (p === '/api/admin/tiles' && req.method === 'POST') {
    const t = await req.json().catch(() => ({}));
    const kind = String(t.kind || ''), name = String(t.name || ''), m = String(t.url || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!['objects', 'characters', 'floors'].includes(kind) || !/^[a-z][a-z0-9_]{0,40}$/.test(name) || !m) return json({ error: 'kind, name and a PNG data URL' }, 400);
    const png = Buffer.from(m[1], 'base64'); if (png.length > 2e6) return json({ error: 'too large' }, 413);
    const dir = join(ROOT, 'assets', 'tiles'), mf = join(dir, 'tiles.json');
    mkdirSync(join(dir, kind), { recursive: true });
    writeFileSync(join(dir, kind, name + '.png'), png);
    const man = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : {};
    (man[kind] ||= {})[name] = { file: `${kind}/${name}.png`, w: +t.w || 0, h: +t.h || 0, anchor: Array.isArray(t.anchor) ? t.anchor.map(Number) : [0, 0] };
    writeFileSync(mf, JSON.stringify(man, null, 1) + '\n');
    return json({ ok: true });
  }
  if (p === '/api/admin/generated' && req.method === 'POST') {
    const { remove } = await req.json(); const f = basename(String(remove || ''));
    const file = join(ROOT, 'generated', f);
    if (!f.endsWith('.json') || !existsSync(file)) return json({ error: 'no such file' }, 404);
    unlinkSync(file); return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
// For the builder's ?edit=<file>: a saved world, if the admin is logged in.
export function savedWorld(req, file) {
  if (!authed(req)) return null;
  const f = join(ROOT, 'generated', basename(String(file)));
  if (!f.endsWith('.json') || !existsSync(f)) return null;
  try { const { prompt, mode, model, ...scn } = JSON.parse(readFileSync(f, 'utf8')); return { scenario: scn, prompt, model }; } catch { return null; }
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tablefolk admin</title>
<style>
:root{--bg:#f3eee4;--fg:#2a251f;--muted:#7a6f62;--card:#fffbf3;--line:#e3d9c7;--accent:#7a5426;--accent2:#a8732f;--soft:#efe6d6;--ok:#2f7a45;--okbg:#e3f1e5;--bad:#b5442e;--badbg:#f8e3dc;--shadow:0 1px 2px rgba(60,40,10,.06),0 6px 20px rgba(60,40,10,.07)}
@media (prefers-color-scheme:dark){:root{--bg:#191612;--fg:#ede6d9;--muted:#a39886;--card:#24201b;--line:#3a332b;--accent:#d9ae6f;--accent2:#e7c48e;--soft:#2d2822;--ok:#7bc58f;--okbg:#1f3325;--bad:#e08a66;--badbg:#3a2219;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25)}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:76px}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}button,input,select,textarea{font:inherit;color:inherit}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:12px 24px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-size:1.05rem}.brand svg{width:26px;height:26px}.brand span{color:var(--muted)}
header nav{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:.42rem .85rem;font-weight:600;font-size:.88rem;cursor:pointer;text-decoration:none;color:var(--fg);white-space:nowrap}
.btn:hover{border-color:var(--accent)}.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--bg)}.btn.primary:hover{background:var(--accent2)}.btn.danger{color:var(--bad)}.btn.danger:hover{border-color:var(--bad)}.btn.quiet{border-color:transparent;background:none}.btn:disabled{opacity:.5;cursor:default}
.btn svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wrap{max-width:1180px;margin:0 auto;padding:22px 24px 80px;display:grid;grid-template-columns:200px 1fr;gap:28px}
aside.side{position:sticky;top:84px;align-self:start;display:flex;flex-direction:column;gap:2px}
aside.side a{padding:.42rem .7rem;border-radius:9px;color:var(--muted);text-decoration:none;font-weight:600;font-size:.92rem}aside.side a:hover{background:var(--soft);color:var(--fg)}aside.side a.on{background:var(--card);color:var(--fg);box-shadow:var(--shadow)}
main{display:grid;gap:22px;min-width:0}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;box-shadow:var(--shadow)}
section>h2{font-size:1.1rem;margin:0 0 4px}section>p.lead{color:var(--muted);margin:0 0 16px;font-size:.9rem}
h3{font-size:.95rem;margin:0 0 8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.stat{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.stat .k{font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}.stat .v{font-weight:700;margin-top:2px;overflow-wrap:anywhere}.stat .s{color:var(--muted);font-size:.84rem;overflow-wrap:anywhere}
.go{display:flex;flex-direction:column;gap:4px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px;text-decoration:none;color:var(--fg)}.go:hover{border-color:var(--accent);transform:translateY(-1px)}.go b{display:flex;align-items:center;gap:6px}.go span{color:var(--muted);font-size:.85rem}
.go svg{width:16px;height:16px;fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pill{display:inline-flex;align-items:center;gap:5px;padding:.08rem .55rem;border-radius:999px;font-size:.78rem;font-weight:700}.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.off{background:var(--soft);color:var(--muted)}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
label{display:block;font-size:.8rem;font-weight:600;color:var(--muted);margin:.75rem 0 .25rem}
input,select,textarea{width:100%;padding:.5rem .65rem;border-radius:10px;border:1px solid var(--line);background:var(--bg)}textarea{resize:vertical;line-height:1.4}
input:focus,select:focus,textarea:focus,.btn:focus-visible{outline:2px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:1px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card2{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}.muted{color:var(--muted);font-size:.86rem}.ok{color:var(--ok)}.bad{color:var(--bad)}
.checks{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:4px}.check{display:inline-flex;align-items:center;gap:7px;font-weight:600;color:var(--fg);margin:0;font-size:.9rem;cursor:pointer}.check input{width:auto;accent-color:var(--accent)}
.check small{color:var(--muted);font-weight:500}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{text-align:left;padding:9px 8px;border-top:1px solid var(--line);vertical-align:middle}th{font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-top:0}
td .acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.voices td input{min-width:200px}.voices td select{width:7.5em}
.empty{color:var(--muted);text-align:center;padding:18px}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;transition:.2s;background:var(--fg);color:var(--bg);padding:.6rem 1rem;border-radius:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:20;pointer-events:none}#toast.on{opacity:1;transform:translateX(-50%)}#toast.bad{background:var(--bad);color:#fff}
#login{max-width:400px;margin:14vh auto;padding:0 16px}#login section{padding:28px}
@media (max-width:860px){.wrap{grid-template-columns:1fr;padding:16px 14px 60px}aside.side{position:static;flex-direction:row;flex-wrap:wrap}.grid2{grid-template-columns:1fr}header{padding:10px 14px}.voices td input{min-width:120px}}
</style></head><body>
<div id="login" hidden><section><div class="brand" style="margin-bottom:14px"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 22l12 7 12-7-12-7z" fill="var(--accent)" opacity=".35"/><path d="M4 16l12 7 12-7-12-7z" fill="var(--accent)" opacity=".6"/><path d="M4 10l12 7 12-7L16 3z" fill="var(--accent)"/></svg><b>Tablefolk</b><span>admin</span></div>
<form id="lf"><label for="pw">Password</label><input type="password" id="pw" name="pw" autofocus autocomplete="current-password">
<div class="row"><button class="btn primary">Log in</button><span id="lerr" class="bad"></span></div></form>
<p class="muted" style="margin-top:18px">Forgot it? Delete <code>.admin/password.json</code> on the server and restart it: it asks for a new one.</p></section></div>
<div id="app" hidden>
<header><div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 22l12 7 12-7-12-7z" fill="var(--accent)" opacity=".35"/><path d="M4 16l12 7 12-7-12-7z" fill="var(--accent)" opacity=".6"/><path d="M4 10l12 7 12-7L16 3z" fill="var(--accent)"/></svg><b>Tablefolk</b><span>admin</span></div>
<nav><a class="btn" href="/world/" target="_blank">World builder ↗</a><a class="btn" href="/app/?play=1" target="_blank">Play ↗</a><button class="btn quiet" id="logout">Log out</button></nav></header>
<div class="wrap"><aside class="side" aria-label="sections"><a href="#overview">Overview</a><a href="#models">Language models</a><a href="#builder">World builder</a><a href="#speech">Speech &amp; voices</a><a href="#worlds">Worlds</a><a href="#security">Password</a></aside>
<main>
<section id="overview"><h2>Overview</h2><p class="lead" id="status"></p>
<div class="tiles" id="stats"></div>
<h3 style="margin-top:18px">Open</h3>
<div class="tiles">
<a class="go" href="/app/?play=1" target="_blank"><b><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>The world, as players see it</b><span>No developer panels.</span></a>
<a class="go" href="/app/?dev=1" target="_blank"><b><svg viewBox="0 0 24 24"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/></svg>The world in dev mode</b><span>Every panel: brains, prompts, tests.</span></a>
<a class="go" href="/world/" target="_blank"><b><svg viewBox="0 0 24 24"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>World builder</b><span>Write, draw and edit worlds.</span></a>
<a class="go" href="/world/a+haunted+mill+with+a+ghost?view=loading" target="_blank"><b><svg viewBox="0 0 24 24"><path d="M4 12h16M4 12a8 8 0 0116 0"/></svg>Players' loading screen</b><span>What a /world link shows players.</span></a>
</div></section>
<section id="models"><h2>Language models</h2><p class="lead">Each endpoint uses OpenRouter, OpenAI, the local model server (litert-lm serve on this machine) or any OpenAI-compatible URL. Empty fields use the server's environment (.env). Keys stay on the server and are never sent to pages.</p>
<div class="grid2" id="eps"></div>
<div class="card2" style="margin-top:18px"><h3>Visitors may use</h3><div class="checks" style="flex-direction:column">
<label class="check"><input type="checkbox" id="gbCloud"> The characters' endpoint brain <small>for players without a graphics card; spends your key (always the model above, 240 requests per 10 minutes each)</small></label>
<label class="check"><input type="checkbox" id="gbLocal"> This server's local model <small>uses this machine's GPU</small></label></div>
<div class="row"><button class="btn primary" id="saveGuestBrain">Save</button></div></div>
<h3 style="margin-top:20px">Provider API keys</h3><p class="muted" style="margin:0 0 4px">Used by both endpoints with that provider (an endpoint's own key wins).</p>
<div class="grid2" id="keys"></div></section>
<section id="builder"><h2>World builder</h2><p class="lead">Which models the builder offers, and what visitors who are not logged in may use. As admin you can use every option, and type in any model.</p>
<div class="grid2"><div>
<label for="cloudModels">Cloud models offered (one per line, as the provider names them)</label><textarea id="cloudModels" rows="5" spellcheck="false" placeholder="deepseek/deepseek-v4.1-flash-1017"></textarea>
<p class="muted" style="margin:.4rem 0 0">The scenario generator's model (above) is always offered too.</p>
<label for="worldView">What a /world/&lt;prompt&gt; link shows</label>
<select id="worldView"><option value="builder">the world builder: prompt, progress, map editor</option><option value="loading">a plain loading screen with a progress bar, then the game</option></select></div>
<div class="card2"><h3>Guests may use</h3>
<div class="checks" style="flex-direction:column">
<label class="check"><input type="checkbox" id="gBrowser"> In their own browser <small>free for you: Gemma runs on their GPU</small></label>
<label class="check"><input type="checkbox" id="gServer"> This server's local model <small>uses this machine's GPU</small></label>
<label class="check"><input type="checkbox" id="gCloud"> Cloud models <small>spends your API credit</small></label></div>
<div id="gModelsBox"><label>Cloud models guests may pick</label><div class="checks" id="gModels"></div></div></div></div>
<div class="row"><button class="btn primary" id="saveBuilder">Save world builder settings</button></div></section>
<section id="speech"><h2>Speech &amp; voices</h2><p class="lead">The engine players hear by default (each can pick another in the app's voice pane), and how each voice is described: characters without a voice get one of their body's gender, the generator reads the descriptions when it casts a world, and the voice menu shows them.</p>
<label for="ttsEngine">Players' speech engine</label>
<select id="ttsEngine"><option value="pocket-18m">Pocket-TTS small: 18M parameters, about 40 MB, English</option><option value="pocket-100m">Pocket-TTS: 100M parameters, about 120 MB, 5 languages</option></select>
<table class="voices" style="margin-top:14px"><thead><tr><th>Voice</th><th>Gender</th><th>Description</th></tr></thead><tbody id="voices"></tbody></table>
<div class="row"><button class="btn primary" id="saveSpeech">Save speech settings</button></div></section>
<section id="worlds"><h2>Worlds</h2><p class="lead">Every world built here is saved in <code>generated/</code>. Recent runs since the server started are listed first.</p>
<h3>Recent runs</h3><table><thead><tr><th>When</th><th>Prompt</th><th>Model</th><th>Result</th></tr></thead><tbody id="recent"></tbody></table>
<h3 style="margin-top:22px">Saved worlds</h3><table><thead><tr><th>World</th><th>Saved</th><th></th></tr></thead><tbody id="gen"></tbody></table></section>
<section id="security"><h2>Password</h2><p class="lead">For this page. Sessions last a week, or until the server restarts.</p>
<div class="grid2"><div><label for="pwCur">Current password</label><input type="password" id="pwCur" autocomplete="current-password"></div><div><label for="pwNew">New password (6+ characters)</label><input type="password" id="pwNew" autocomplete="new-password"></div></div>
<div class="row"><button class="btn primary" id="pwSave">Change password</button></div></section>
</main></div></div>
<div id="toast" role="status" aria-live="polite"></div>
<script>
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(async r=>({ok:r.ok,status:r.status,...(await r.json().catch(()=>({})))}));
const ago=ms=>{const s=Math.round(ms/1000);return s<90?s+' s':s<5400?Math.round(s/60)+' min':s<172800?Math.round(s/3600)+' h':Math.round(s/86400)+' days';};
let toastT=0; const toast=(t,bad)=>{ const el=$('toast'); el.textContent=t; el.className='on'+(bad?' bad':''); clearTimeout(toastT); toastT=setTimeout(()=>el.className='',2600); };
const saved=(r,what)=>{ if(r.ok){ toast(what+' saved'); if(r.settings){ S.settings=r.settings; render(); } } else toast('Could not save: '+(r.error||r.status),true); };
let S=null;
async function load(){
  const r=await fetch('/api/admin/state'); if(r.status===401){ $('login').hidden=false; $('app').hidden=true; return; }
  S=await r.json(); $('login').hidden=true; $('app').hidden=false; render();
}
const PROVIDERS=[['','(environment)'],['openrouter','OpenRouter'],['openai','OpenAI'],['local','local model server'],['custom','other URL']];
function provOf(u){ u=String(u||'').toLowerCase(); return !u?'':['openrouter','openai','local','litert'].includes(u)?(u==='litert'?'local':u):'custom'; }
function epBox(k,title,sub){ const e=S.settings[k], pv=provOf(e.baseURL), def=S.settings.defaults?.[k]||{};
  return '<div class="card2"><h3>'+title+'</h3><p class="muted" style="margin:0">'+sub+'</p><p class="muted" style="margin:.5rem 0 0">Now: <b>'+esc(e.effective.model)+'</b> at '+esc(e.effective.baseURL)+' · key '+(e.effective.key?'<span class="pill ok">set</span>':'<span class="pill bad">none</span>')+'</p>'
  +'<label>Provider</label><select data-prov="'+k+'">'+PROVIDERS.map(([v,t])=>'<option value="'+v+'"'+(v===pv?' selected':'')+'>'+t+'</option>').join('')+'</select>'
  +'<div data-urlbox="'+k+'"'+(pv==='custom'?'':' hidden')+'><label>Base URL</label><input data-k="'+k+'" data-f="url" value="'+esc(pv==='custom'?e.baseURL:'')+'" placeholder="https://.../v1"></div>'
  +'<label>Model</label><input data-k="'+k+'" data-f="model" value="'+esc(e.model)+'" placeholder="'+esc(pv==='openai'?def.openai||'':pv==='local'?'(local default)':def.openrouter||'(environment)')+'">'
  +'<label>API key '+(e.keySaved?'<span class="muted">(one is saved; leave empty to keep it)</span>':'')+'</label><input type="password" data-k="'+k+'" data-f="apiKey" placeholder="(environment)" autocomplete="off">'
  +'<div class="row"><button class="btn primary" data-save="'+k+'">Save</button><button class="btn" data-test="'+k+'">Test</button>'+(e.keySaved?'<button class="btn danger" data-clear="'+k+'">Forget saved key</button>':'')+'<span class="muted" id="msg_'+k+'"></span></div></div>'; }
function render(){
  const st=S.status, se=S.settings;
  $('status').textContent='Listening on '+st.host+':'+st.port+', up '+ago(st.uptime)+', Bun '+st.bun+'.';
  const stat=(k,v,s)=>'<div class="stat"><div class="k">'+k+'</div><div class="v">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':'')+'</div>';
  $('stats').innerHTML=stat('Characters\\u2019 brain (endpoint)',esc(se.characters.effective.model),esc(se.characters.effective.provider||''))
    +stat('Scenario generator',esc(se.generator.effective.model),esc(se.generator.effective.provider||''))
    +stat('Local model server',st.local.up?'<span class="pill ok">running</span>':'<span class="pill off">not running</span>',esc(st.local.url))
    +stat('Saved worlds',String(S.generated.length),S.recent.length?S.recent.length+' run'+(S.recent.length===1?'':'s')+' since start':'none since start')
    +(st.initialPassword?stat('Password','<span class="pill bad">made up at startup</span>','<a href="#security">change it</a>'):'');
  $('eps').innerHTML=epBox('characters',"Characters' endpoint brain",'What characters think with when a player picks the server brain.')+epBox('generator','Scenario generator','What writes worlds in the cloud (/world).');
  const kb=(p,t)=>{ const x=se.keys?.[p]||{}; return '<div class="card2"><label style="margin-top:0">'+t+' key '+(x.saved?'<span class="pill ok">saved</span>':x.env?'<span class="pill ok">from .env</span>':'<span class="pill bad">none</span>')+'</label><input type="password" data-key="'+p+'" autocomplete="off" placeholder="'+(x.saved?'leave empty to keep the saved key':(p==='openai'?'sk-...':'sk-or-...'))+'">'
    +'<div class="row"><button class="btn primary" data-savekey="'+p+'">Save</button>'+(x.saved?'<button class="btn danger" data-clearkey="'+p+'">Forget saved key</button>':'')+'</div></div>'; };
  $('keys').innerHTML=kb('openrouter','OpenRouter')+kb('openai','OpenAI');
  const wg=se.worldgen||{cloudModels:[],guest:{}};
  $('cloudModels').value=wg.cloudModels.join('\\n'); $('worldView').value=se.worldView;
  $('gBrowser').checked=!!wg.guest.browser; $('gServer').checked=!!wg.guest.server; $('gCloud').checked=!!wg.guest.cloud;
  const all=[...new Set([se.generator.effective.model,...wg.cloudModels].filter(Boolean))];
  $('gModels').innerHTML=all.map(m=>'<label class="check"><input type="checkbox" value="'+esc(m)+'"'+(wg.guest.cloudModels.includes(m)?' checked':'')+'> '+esc(m)+'</label>').join('');
  $('gModelsBox').hidden=!wg.guest.cloud;
  $('ttsEngine').value=se.ttsEngine;
  $('gbCloud').checked=se.guestBrain?.cloud!==false; $('gbLocal').checked=!!se.guestBrain?.local;
  $('voices').innerHTML=se.voices.map(v=>'<tr data-v="'+v.id+'"><td><b>'+v.id+'</b></td><td><select><option'+(v.gender==='female'?' selected':'')+'>female</option><option'+(v.gender==='male'?' selected':'')+'>male</option></select></td><td><input value="'+esc(v.description)+'" placeholder="e.g. warm, young, a little husky"></td></tr>').join('');
  $('recent').innerHTML=S.recent.length?S.recent.map(g=>'<tr><td class="muted">'+ago(Date.now()-g.at)+' ago</td><td>'+esc(g.prompt)+'</td><td class="muted">'+esc(g.model)+'</td><td>'+(g.ok?'<span class="pill ok">'+(g.ms/1000).toFixed(1)+' s</span> '+esc(g.title||''):'<span class="pill bad">failed</span> <span class="muted">'+esc(g.error||'')+'</span>')+'</td></tr>').join(''):'<tr><td colspan="4" class="empty">None since the server started.</td></tr>';
  $('gen').innerHTML=S.generated.length?S.generated.map(g=>'<tr><td><b>'+esc(g.title)+'</b><br><span class="muted">'+esc(g.prompt)+(g.model?' · '+esc(g.model):'')+'</span></td><td class="muted" style="white-space:nowrap">'+new Date(g.at).toLocaleDateString()+'</td><td><div class="acts">'+(g.link?'<a class="btn primary" href="'+g.link.replace('/app/#','/app/?play=1#')+'" target="_blank">Play</a><a class="btn" href="'+g.builder+'" target="_blank">Edit</a><a class="btn" href="'+g.link.replace('/app/#','/app/?dev=1#')+'" target="_blank">Dev</a>':'')+'<button class="btn danger" data-del="'+esc(g.file)+'">Delete</button></div></td></tr>').join(''):'<tr><td colspan="3" class="empty">No saved worlds yet.</td></tr>';
}
// the side menu follows the scroll
const io=new IntersectionObserver(es=>{ for(const e of es) if(e.isIntersecting){ document.querySelectorAll('aside.side a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)); } },{rootMargin:'-30% 0px -60% 0px'});
document.querySelectorAll('main section').forEach(s=>io.observe(s));
document.addEventListener('change',e=>{ if(e.target.id==='gCloud') $('gModelsBox').hidden=!e.target.checked;
  const k=e.target.dataset.prov; if(!k) return; document.querySelector('[data-urlbox="'+k+'"]').hidden=e.target.value!=='custom';
  const def=S.settings.defaults?.[k]||{}, m=document.querySelector('input[data-k="'+k+'"][data-f="model"]'); m.placeholder=e.target.value==='openai'?def.openai||'':e.target.value==='local'?'(local default)':def.openrouter||''; });
document.addEventListener('click',async e=>{
  const t=e.target.closest('button'); if(!t) return;
  const save=t.dataset.save, test=t.dataset.test, clear=t.dataset.clear, del=t.dataset.del, sk=t.dataset.savekey||t.dataset.clearkey;
  if(sk){ const keys={}; if(t.dataset.clearkey) keys['clear_'+sk]=true; else keys[sk]=document.querySelector('input[data-key="'+sk+'"]').value;
    saved(await post('/api/admin/settings',{keys}),'Key'); }
  if(save||clear){ const k=save||clear, patch={}; patch[k]={}; for(const i of document.querySelectorAll('input[data-k="'+k+'"]')) patch[k][i.dataset.f]=i.value; if(clear) patch[k].clearKey=true;
    const pv=document.querySelector('select[data-prov="'+k+'"]').value; patch[k].baseURL=pv==='custom'?patch[k].url:pv; delete patch[k].url;
    saved(await post('/api/admin/settings',patch),'Endpoint'); }
  if(test){ $('msg_'+test).textContent='testing…'; t.disabled=true; const r=await post('/api/admin/test',{which:test}); t.disabled=false; $('msg_'+test).innerHTML=r.ok?'<span class="pill ok">ok in '+(r.ms/1000).toFixed(1)+' s</span> '+esc(r.text):'<span class="pill bad">failed</span> '+esc(r.error); }
  if(del){ if(!confirm('Delete '+del+'? This cannot be undone.')) return; const r=await post('/api/admin/generated',{remove:del}); if(r.ok){ toast('Deleted'); load(); } else toast('Could not delete',true); }
});
$('saveBuilder').onclick=async()=>{ const cloudModels=$('cloudModels').value.split('\\n').map(s=>s.trim()).filter(Boolean);
  const guest={browser:$('gBrowser').checked,server:$('gServer').checked,cloud:$('gCloud').checked,cloudModels:[...$('gModels').querySelectorAll('input:checked')].map(i=>i.value)};
  saved(await post('/api/admin/settings',{worldgen:{cloudModels,guest},worldView:$('worldView').value}),'World builder settings'); };
$('saveGuestBrain').onclick=async()=>saved(await post('/api/admin/settings',{guestBrain:{cloud:$('gbCloud').checked,local:$('gbLocal').checked}}),'Visitor brain settings');
$('saveSpeech').onclick=async()=>{ const v=[...document.querySelectorAll('#voices tr')].map(tr=>({id:tr.dataset.v,gender:tr.querySelector('select').value,description:tr.querySelector('input').value}));
  saved(await post('/api/admin/settings',{ttsEngine:$('ttsEngine').value,voices:v}),'Speech settings'); };
$('pwSave').onclick=async()=>{ const r=await post('/api/admin/password',{current:$('pwCur').value,next:$('pwNew').value}); if(r.ok){ toast('Password changed'); $('pwCur').value=$('pwNew').value=''; load(); } else toast(r.error||'Could not change it',true); };
$('logout').onclick=async()=>{ await post('/api/admin/logout'); load(); };
$('lf').onsubmit=async e=>{ e.preventDefault(); const r=await post('/api/admin/login',{password:e.target.pw.value}); if(r.ok) load(); else $('lerr').textContent=r.error||'failed'; };
load();
</script></body></html>`;
