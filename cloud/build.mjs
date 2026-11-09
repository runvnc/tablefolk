#!/usr/bin/env bun
// Builds the public site for Cloudflare (cloud/worker.js + static assets):
//
//   bun cloud/build.mjs            stage cloud/public/ and write cloud/data.js
//   cd cloud && wrangler deploy    (or: bun cloud/build.mjs --deploy)
//
// cloud/public/ gets the files the site serves, copied from git's list of
// tracked files (so nothing ignored, no .env, no .admin), without the server,
// tools, docs and notes. cloud/data.js is what the Worker needs from the
// server's files and the admin page's settings: the generator's prompt
// (fast-skill.md), the voices, the worlds in scenarios/ (short links), the
// built-in skills and roles. Both are git-ignored: rebuild before deploying.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync, readdirSync, existsSync, lstatSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'cloud/public');
// what the site serves (top-level folders and files); everything else stays home
const PUBLIC = /^(app|assets|scenarios|llm_js|pocket_tts_min|packages|skills|roles|plugins)\/|^(index\.html|home\.css|home\.js|llm\.html|LICENSE)$/;

const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString().split('\0').filter(f => f && PUBLIC.test(f));
rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
const copy = (src, dest) => { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(src, dest); bytes += statSync(src).size; n++; };
let n = 0;
for (const f of files) {
  const src = join(ROOT, f); if (!existsSync(src)) continue;
  // a tracked link to a folder (app/assets -> ../assets): its tracked files again under the link's path
  if (lstatSync(src).isSymbolicLink() && statSync(src).isDirectory()) {
    const target = relative(ROOT, realpathSync(src));
    for (const g of execFileSync('git', ['ls-files', '-z', target], { cwd: ROOT }).toString().split('\0').filter(Boolean)) copy(join(ROOT, g), join(OUT, f, relative(target, g)));
    continue;
  }
  copy(src, join(OUT, f));
}
// Static files get the same headers as the Bun server's (server.js headersFor):
// cross-origin isolation (the models' threads need it) and open CORS.
writeFileSync(join(OUT, '_headers'), `/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
`);

// The Worker's data. settings.js reads .admin/settings.json (voice
// descriptions, the speech engine): only those go into the bundle, never keys.
const { voicesText, packVoices, voices } = await import('../server/settings.js');
const { config } = await import('../server/config.js');
const list = (dir, file) => readdirSync(join(ROOT, dir), { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d => {
  try { const m = JSON.parse(readFileSync(join(ROOT, dir, d.name, file), 'utf8')); return [{ ref: d.name, ...m }]; } catch { return []; }
});
const data = {
  skill: readFileSync(join(ROOT, 'server/fast-skill.md'), 'utf8'),
  voicesText: voicesText(),
  packVoices: packVoices(),
  voices: { voices: voices(), ttsEngine: config.ttsEngine },
  scenarios: readdirSync(join(ROOT, 'scenarios')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)),
  skills: list('skills', 'skill.json'),
  roles: list('roles', 'role.json'),
  built: new Date().toISOString(),
};
writeFileSync(join(ROOT, 'cloud/data.js'), '// Written by cloud/build.mjs: do not edit.\nexport default ' + JSON.stringify(data) + ';\n');
console.log(`cloud/public: ${n} files, ${(bytes / 1048576).toFixed(1)} MB; cloud/data.js: ${data.scenarios.length} worlds, ${data.packVoices.length} designed voices`);

if (process.argv.includes('--deploy')) execFileSync('wrangler', ['deploy'], { cwd: join(ROOT, 'cloud'), stdio: 'inherit' });
