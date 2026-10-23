// registry/index.json: the official list of Tablefolk packages, skills,
// roles and asset packs (the app's Library pane shows it first).
//
//   node tools/registry.mjs          rebuild the built-in entries from skills/,
//                                    roles/ and packages/, keep community ones
//   node tools/registry.mjs --check  also fetch every community entry's
//                                    manifest and check it (for PR review)
//
// To list something, add an entry to "community" in a PR:
//   { "kind": "skill" | "role" | "package" | "pack", "ref": "npm:tablefolk-skill-alchemy@1",
//     "name": "Alchemy", "description": "...", "author": "...", "homepage": "https://..." }
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(ROOT, 'registry/index.json');
const KINDS = { skill: ['skills', 'skill.json'], role: ['roles', 'role.json'], package: ['packages', 'tablefolk.json'] };
const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

const builtin = [];
for (const [kind, [dir, file]] of Object.entries(KINDS)) {
  const base = path.join(ROOT, dir); if (!fs.existsSync(base)) continue;
  for (const d of fs.readdirSync(base).sort()) {
    const f = path.join(base, d, file); if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    const code = !!(m.module || m.modules?.length);
    builtin.push({ kind, ref: d, name: m.name || m.id, description: m.description || '', version: m.version || '', code,
      ...(kind === 'package' ? { has: ['items', 'skills', 'roles', 'workflows', 'modules'].filter(k => m[k] && Object.keys(m[k]).length) } : {}) });
  }
}
const community = old.community || [];

function urlFor(ref, kind) {
  const file = kind === 'pack' ? 'pack.json' : KINDS[kind][1];
  if (/^https?:\/\//.test(ref)) return ref.endsWith('.json') ? ref : ref.replace(/\/?$/, '/' + file);
  if (ref.startsWith('npm:')) return `https://cdn.jsdelivr.net/npm/${ref.slice(4)}/${file}`;
  const m = ref.match(/^gh:([^/]+\/[^@/]+)(?:@([^/]+))?(\/.*)?$/);
  if (m) return `https://cdn.jsdelivr.net/gh/${m[1]}@${m[2] || 'main'}${m[3] || ''}/${file}`;
  throw new Error('community refs must be a URL, npm: or gh:');
}
let bad = 0;
const seen = new Set();
for (const e of community) {
  const where = `${e.kind} ${e.ref}`;
  if (!['skill', 'role', 'package', 'pack'].includes(e.kind)) { console.log('BAD', where, ': kind must be skill, role, package or pack'); bad++; continue; }
  if (!e.ref || !e.name || !e.description) { console.log('BAD', where, ': needs ref, name and description'); bad++; continue; }
  if (seen.has(e.ref)) { console.log('BAD', where, ': listed twice'); bad++; } seen.add(e.ref);
  if (process.argv.includes('--check')) {
    try {
      const r = await fetch(urlFor(e.ref, e.kind)); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = await r.json(); if (e.kind !== 'pack' && !m.id) throw new Error('manifest has no "id"');
      e.code = !!(m.module || m.modules?.length);
      console.log('ok ', where, m.version || '');
    } catch (err) { console.log('BAD', where, ':', err.message); bad++; }
  }
}
const out = {
  about: 'The official list of Tablefolk packages. Built-in entries are rebuilt by tools/registry.mjs; add yours to "community" in a pull request. Also found in the app: npm packages and GitHub repos with the keyword/topic "tablefolk".',
  version: 1, builtin, community,
};
fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
console.log(`registry/index.json: ${builtin.length} built in, ${community.length} community${bad ? `, ${bad} problems` : ''}`);
process.exit(bad ? 1 : 0);
