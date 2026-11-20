// Fails when the API chapter (the scenario skill's reference/api.md) names a
// function, api member or event the code no longer has. Grep-level:
//   window.tablefolk.<name>   a member of installWorldAPI (app.js) or world.<name> = (world-integration.js)
//   tablefolkX.<name>         <name> on the line that publishes window.tablefolkX = { ... }
//   api.<name>                a key of the module api (packages.js api(), skills.js api())
//   tablefolk-<event>         dispatched somewhere in app/ or libs/
//   node tools/check-api-doc.mjs        prints what is missing; exit 1 if anything is
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const doc = fs.readFileSync(path.join(ROOT, 'plugins/tablefolk-scenario/skills/tablefolk-scenario/reference/api.md'), 'utf8');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const appFiles = fs.readdirSync(path.join(ROOT, 'app')).filter(f => f.endsWith('.js')).map(f => 'app/' + f).concat(['app/llm_js/world-integration.js']);
const all = Object.fromEntries(appFiles.map(f => [f, read(f)]));
const code = Object.values(all).join('\n') + fs.readdirSync(path.join(ROOT, 'libs/script')).filter(f => f.endsWith('.js')).map(f => read('libs/script/' + f)).join('\n');
const missing = [];
// only names inside `code spans`, outside fenced blocks, line by line (a span that
// starts with "." continues the object named earlier on its line: `.getPlayer()`)
const lines = doc.replace(/```[^]*?```/g, '').split('\n');

// window.tablefolk.<name> and, in the same span, .<name>( continuations ("window.tablefolk.getAgents()`, `.getPlayer()")
const appJs = all['app/app.js'], api0 = appJs.slice(appJs.indexOf('function installWorldAPI'), appJs.indexOf('function setupUI'));
const worldHas = n => new RegExp(`[\\s,{]${n}\\s*[:,]|[\\s,{]${n}\\s*\\(|\\b${n}\\b\\s*}`).test(api0) || new RegExp(`world\\.${n}\\s*=`).test(all['app/llm_js/world-integration.js']);
// tablefolkX.<name>: on the line(s) that publish it
const pub = {};
for (const src of Object.values(all)) for (const m of src.matchAll(/window\.(tablefolk[A-Z]\w*)\s*=\s*\{([^]*?)\};/g)) pub[m[1]] = (pub[m[1]] || '') + m[2];
const pubHas = (obj, n) => pub[obj] != null && new RegExp(`\\b${n}\\b`).test(pub[obj]);
// api.<name>: packages.js api() body and skills.js api()
const pk = all['app/packages.js'], apiBody = pk.slice(pk.indexOf('function api()'), pk.indexOf('function giveItem')) + all['app/skills.js'].slice(all['app/skills.js'].lastIndexOf('function api()'));
const apiHas = n => new RegExp(`\\b${n}\\b`).test(apiBody);

let checked = 0, obj = null;
for (const line of lines) for (const s of [...line.matchAll(/`([^`]+)`/g)].map(m => m[1])) {
  if (!s.startsWith('.')) obj = null;
  for (const m of s.matchAll(/(window\.tablefolk|tablefolk[A-Z]\w*|\bapi)?\.(\w+)\s*\(?/g)) {
    if (m[1]) obj = m[1];
    if (!obj || /^\d/.test(m[2])) continue;
    const n = m[2]; checked++;
    const ok = obj === 'window.tablefolk' ? worldHas(n) : obj === 'api' ? apiHas(n) : pubHas(obj, n);
    if (!ok) missing.push(`${obj}.${n}`);
  }
}
for (const m of lines.join('\n').matchAll(/`(tablefolk-[a-z-]+)`/g)) { checked++; if (!code.includes(`'${m[1]}'`)) missing.push('event ' + m[1]); }
const uniq = [...new Set(missing)];
console.log(uniq.length ? `api.md names ${uniq.length} that the code does not have:\n  ${uniq.join('\n  ')}` : `api.md: ${checked} names checked, all found`);
process.exit(uniq.length ? 1 : 0);
