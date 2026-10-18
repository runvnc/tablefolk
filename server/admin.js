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
  if (p === '/api/voices') return json({ voices: voices() });
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
:root{--bg:#f4efe4;--fg:#2b2620;--muted:#7a7064;--card:#fffaf0;--line:#e2d8c6;--accent:#6b4f2a;--ok:#2f7a45;--bad:#b5542e}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a16;--fg:#ece5d8;--muted:#a59a8a;--card:#272320;--line:#3a342d;--accent:#d7b07a;--ok:#7bc58f;--bad:#e08a66}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
header a{color:var(--accent)}header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line)}header h1{font-size:1.15rem;margin:0;flex:1}
main{max-width:980px;margin:0 auto;padding:18px 16px 60px;display:grid;gap:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}section h2{font-size:1rem;margin:0 0 .6rem}
label{display:block;font-size:.85rem;color:var(--muted);margin:.4rem 0 .15rem}
input,select,textarea,button{font:inherit;padding:.45rem .6rem;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
input,select{width:100%}button{background:var(--accent);color:var(--bg);border:none;cursor:pointer}button.ghost{background:none;color:var(--accent);border:1px solid var(--line)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media (max-width:720px){.grid2{grid-template-columns:1fr}}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:.6rem}.muted{color:var(--muted);font-size:.85rem}
.links a{display:inline-block;margin:0 14px 6px 0;color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:.88rem}td,th{text-align:left;padding:5px 6px;border-top:1px solid var(--line);vertical-align:top}
.ok{color:var(--ok)}.bad{color:var(--bad)}#login{max-width:360px;margin:12vh auto}
.voices td input{width:100%}.voices td select{width:7em}
</style></head><body>
<div id="login" hidden><section><h2>Tablefolk admin</h2><form id="lf"><label>Password</label><input type="password" name="pw" autofocus>
<div class="row"><button>log in</button><span id="lerr" class="bad"></span></div></form>
<p class="muted">Forgot it? Delete <code>.admin/password.json</code> on the server and restart it: it asks for a new one.</p></section></div>
<div id="app" hidden>
<header><h1>Tablefolk admin</h1><a href="/app/?dev=1">world (dev mode)</a><button class="ghost" id="logout">log out</button></header>
<main>
<section><h2>Server</h2><div id="status" class="muted"></div>
<div class="links" style="margin-top:.6rem"><a href="/app/">the world, as players see it</a><a href="/app/?dev=1">the world in admin/dev mode</a><a href="/world/">world builder</a><a href="/world/a+haunted+mill+with+a+ghost?view=loading">players' loading screen</a></div></section>
<section><h2>Language models</h2><p class="muted">Base URL: <code>openrouter</code>, <code>local</code> (litert-lm serve here) or any OpenAI-compatible URL. Empty fields use the server's environment (.env). Keys are stored on the server and never sent to pages.</p>
<div class="grid2" id="eps"></div></section>
<section><h2>World page</h2><label>What /world/&lt;prompt&gt; shows players</label>
<select id="worldView"><option value="builder">the world builder (prompt, progress, model)</option><option value="loading">a plain loading screen with a progress bar</option></select>
<div class="row"><button id="saveView">save</button><span id="viewMsg" class="muted"></span></div></section>
<section><h2>Voices</h2><p class="muted">Describe each Pocket-TTS voice. Characters without a voice get one of their body's gender; the generator reads the descriptions to cast scenarios; the app's voice menu shows them.</p>
<table class="voices"><thead><tr><th>voice</th><th>gender</th><th>description</th></tr></thead><tbody id="voices"></tbody></table>
<div class="row"><button id="saveVoices">save voices</button><span id="voiceMsg" class="muted"></span></div></section>
<section><h2>Recent generations</h2><table><tbody id="recent"></tbody></table></section>
<section><h2>Saved worlds <span class="muted">(generated/)</span></h2><table><tbody id="gen"></tbody></table></section>
<section><h2>Password</h2><div class="grid2"><div><label>Current</label><input type="password" id="pwCur"></div><div><label>New (6+ characters)</label><input type="password" id="pwNew"></div></div>
<div class="row"><button id="pwSave">change password</button><span id="pwMsg" class="muted"></span></div></section>
</main></div>
<script>
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(async r=>({ok:r.ok,status:r.status,...(await r.json().catch(()=>({})))}));
const ago=ms=>{const s=Math.round(ms/1000);return s<90?s+'s':s<5400?Math.round(s/60)+' min':s<172800?Math.round(s/3600)+' h':Math.round(s/86400)+' days';};
let S=null;
async function load(){
  const r=await fetch('/api/admin/state'); if(r.status===401){ $('login').hidden=false; $('app').hidden=true; return; }
  S=await r.json(); $('login').hidden=true; $('app').hidden=false; render();
}
function epBox(k,title){ const e=S.settings[k];
  return '<div><h3 style="margin:.2rem 0;font-size:.95rem">'+title+'</h3><div class="muted">now: '+esc(e.effective.baseURL)+' · '+esc(e.effective.model)+' · key '+(e.effective.key?'<span class=ok>set</span>':'<span class=bad>none</span>')+'</div>'
  +'<label>Base URL</label><input data-k="'+k+'" data-f="baseURL" value="'+esc(e.baseURL)+'" placeholder="(environment)">'
  +'<label>Model</label><input data-k="'+k+'" data-f="model" value="'+esc(e.model)+'" placeholder="(environment)">'
  +'<label>API key '+(e.keySaved?'(one is saved; leave empty to keep it)':'')+'</label><input type="password" data-k="'+k+'" data-f="apiKey" placeholder="(environment)" autocomplete="off">'
  +'<div class="row"><button data-save="'+k+'">save</button><button class="ghost" data-test="'+k+'">test</button>'+(e.keySaved?'<button class="ghost" data-clear="'+k+'">forget saved key</button>':'')+'<span class="muted" id="msg_'+k+'"></span></div></div>'; }
function render(){
  const st=S.status;
  $('status').innerHTML='listening on '+esc(st.host)+':'+st.port+' · up '+ago(st.uptime)+' · Bun '+esc(st.bun)+' · local model server ('+esc(st.local.url)+'): '+(st.local.up?'<span class=ok>running</span>':'not running')
    +(st.initialPassword?'<br><span class=bad>The password was made up at startup (.admin/initial-password.txt): change it below.</span>':'');
  $('eps').innerHTML=epBox('characters',"Characters' endpoint brain")+epBox('generator','Scenario generator (/world)');
  $('worldView').value=S.settings.worldView;
  $('voices').innerHTML=S.settings.voices.map(v=>'<tr data-v="'+v.id+'"><td>'+v.id+'</td><td><select><option'+(v.gender==='female'?' selected':'')+'>female</option><option'+(v.gender==='male'?' selected':'')+'>male</option></select></td><td><input value="'+esc(v.description)+'" placeholder="e.g. warm, young, a little husky"></td></tr>').join('');
  $('recent').innerHTML=S.recent.length?S.recent.map(g=>'<tr><td>'+ago(Date.now()-g.at)+' ago</td><td>'+esc(g.prompt)+'</td><td>'+esc(g.model)+'</td><td>'+(g.ok?'<span class=ok>'+(g.ms/1000).toFixed(1)+'s</span> '+esc(g.title||''):'<span class=bad>'+esc(g.error||'failed')+'</span>')+'</td></tr>').join(''):'<tr><td class=muted>none since the server started</td></tr>';
  $('gen').innerHTML=S.generated.length?S.generated.map(g=>'<tr><td>'+new Date(g.at).toLocaleString()+'</td><td><b>'+esc(g.title)+'</b><br><span class=muted>'+esc(g.prompt)+' · '+esc(g.model)+'</span></td><td style="white-space:nowrap">'+(g.link?'<a href="'+g.link+'">play</a> · <a href="'+g.link.replace('/app/#','/app/?dev=1#')+'">dev</a> · <a href="'+g.builder+'">edit</a> · ':'')+'<a href="#" data-del="'+esc(g.file)+'">delete</a></td></tr>').join(''):'<tr><td class=muted>none</td></tr>';
}
document.addEventListener('click',async e=>{
  const t=e.target, save=t.dataset.save, test=t.dataset.test, clear=t.dataset.clear, del=t.dataset.del;
  if(save||clear){ const k=save||clear, patch={}; patch[k]={}; for(const i of document.querySelectorAll('input[data-k="'+k+'"]')) patch[k][i.dataset.f]=i.value; if(clear) patch[k].clearKey=true;
    const r=await post('/api/admin/settings',patch); $('msg_'+k).textContent=r.ok?'saved':'failed: '+(r.error||r.status); if(r.ok){ S.settings=r.settings; render(); $('msg_'+k).textContent='saved'; } }
  if(test){ $('msg_'+test).textContent='testing…'; const r=await post('/api/admin/test',{which:test}); $('msg_'+test).innerHTML=r.ok?'<span class=ok>ok in '+(r.ms/1000).toFixed(1)+'s: '+esc(r.text)+'</span>':'<span class=bad>'+esc(r.error)+'</span>'; }
  if(del){ e.preventDefault(); if(!confirm('Delete '+del+'?')) return; const r=await post('/api/admin/generated',{remove:del}); if(r.ok) load(); }
});
$('saveView').onclick=async()=>{ const r=await post('/api/admin/settings',{worldView:$('worldView').value}); $('viewMsg').textContent=r.ok?'saved':'failed'; };
$('saveVoices').onclick=async()=>{ const v=[...document.querySelectorAll('#voices tr')].map(tr=>({id:tr.dataset.v,gender:tr.querySelector('select').value,description:tr.querySelector('input').value}));
  const r=await post('/api/admin/settings',{voices:v}); $('voiceMsg').textContent=r.ok?'saved':'failed'; };
$('pwSave').onclick=async()=>{ const r=await post('/api/admin/password',{current:$('pwCur').value,next:$('pwNew').value}); $('pwMsg').textContent=r.ok?'changed':(r.error||'failed'); if(r.ok){ $('pwCur').value=$('pwNew').value=''; load(); } };
$('logout').onclick=async()=>{ await post('/api/admin/logout'); load(); };
$('lf').onsubmit=async e=>{ e.preventDefault(); const r=await post('/api/admin/login',{password:e.target.pw.value}); if(r.ok) load(); else $('lerr').textContent=r.error||'failed'; };
load();
</script></body></html>`;
