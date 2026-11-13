#!/usr/bin/env node
// The @tablefolk/* libraries in libs/: check them, build their npm packages,
// publish them. (libs/README.md has the why and the rules.)
//
//   node tools/libs.mjs check              each library imports only itself, the
//                                          libraries it lists, and https URLs; no
//                                          game globals, no ?v= version strings
//   node tools/libs.mjs build [names]      dist/libs/<name>/: the package as npm
//                                          gets it (imports of ../<other>/ become
//                                          @tablefolk/<other>, versions filled in)
//   node tools/libs.mjs version <patch|minor|major|x.y.z> [names]
//   node tools/libs.mjs publish [names] [--dry-run] [--otp=123456]
//                                          build, then npm publish each, the ones
//                                          others depend on first (needs npm login)
//   node tools/libs.mjs list               names, versions, dependencies
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIBS = join(ROOT, 'libs'), DIST = join(ROOT, 'dist/libs');
const SCOPE = '@tablefolk/';
const names = () => readdirSync(LIBS).filter(n => existsSync(join(LIBS, n, 'package.json'))).sort();
const pkg = n => JSON.parse(readFileSync(join(LIBS, n, 'package.json'), 'utf8'));
const savePkg = (n, p) => writeFileSync(join(LIBS, n, 'package.json'), JSON.stringify(p, null, 2) + '\n');
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const deps = n => Object.keys(pkg(n).dependencies || {}).filter(d => d.startsWith(SCOPE)).map(d => d.slice(SCOPE.length));

// every specifier a file names: static imports and exports, import(), new URL(.., import.meta.url)
const SPEC = [/\b(?:import|export)\s[^'"`;]*?\sfrom\s*(['"])([^'"]+)\1/g, /\bimport\s*(['"])([^'"]+)\1/g, /\bimport\(\s*(['"`])([^'"`]+)\1\s*\)/g, /new URL\(\s*(['"`])([^'"`]+)\1\s*,\s*import\.meta\.url/g];
const specs = src => SPEC.flatMap(re => [...src.matchAll(re)].map(m => m[2]));

function check() {
  let bad = 0;
  const say = (f, msg) => { bad++; console.log(`  ${relative(ROOT, f)}: ${msg}`); };
  for (const n of names()) {
    const p = pkg(n), mine = new Set(deps(n));
    if (p.name !== SCOPE + n) say(join(LIBS, n, 'package.json'), `name should be ${SCOPE}${n}`);
    // test.mjs runs in Node (node:fs, the repository's scenarios): not checked, not published
    for (const f of walk(join(LIBS, n)).filter(f => /\.m?js$/.test(f) && !/(^|\/)test\.mjs$/.test(f))) {
      // without comments (their examples import the packages by name)
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
      for (let s of specs(src)) {
        if (/^(https?:|blob:|data:)/.test(s) || s.startsWith('${')) continue;
        if (/\?v=/.test(s)) say(f, `version string in ${s} (libs are served without them)`);
        // a plain file name (emscripten's new URL('x.wasm', import.meta.url)) is relative too
        if (!s.startsWith('.') && /^[\w.-]+\.(wasm|json|js|mjs|data)$/.test(s)) s = './' + s;
        if (!s.startsWith('.')) { say(f, `bare import ${s} (use a relative path or an https URL)`); continue; }
        const target = relative(LIBS, join(dirname(f), s.replace(/\?.*$/, '')));
        const lib = target.split('/')[0];
        if (target.startsWith('..')) say(f, `${s} leaves libs/`);
        else if (lib !== n && !mine.has(lib)) say(f, `${s}: ${lib} is not in package.json dependencies`);
        else if (!existsSync(join(LIBS, target)) && !s.includes('${')) say(f, `${s} does not exist`);
      }
      if (/\bwindow\.(tablefolk|TABLEFOLK_)|['"`]\/app\//.test(src)) say(f, 'uses the game (window.tablefolk*, TABLEFOLK_*, /app/): pass it in as an option instead');
    }
  }
  console.log(bad ? `${bad} problem(s)` : `libs ok: ${names().join(', ')}`);
  return bad;
}

function order(list) {
  const out = [], seen = new Set();
  const visit = n => { if (seen.has(n)) return; seen.add(n); deps(n).forEach(visit); out.push(n); };
  list.forEach(visit);
  return out.filter(n => list.includes(n));
}

function build(list) {
  const all = names();
  for (const n of list) {
    const src = join(LIBS, n), out = join(DIST, n), p = pkg(n);
    rmSync(out, { recursive: true, force: true });
    for (const f of walk(src).filter(f => !/(^|\/)test\.mjs$/.test(f))) {
      const rel = relative(src, f), dest = join(out, rel);
      mkdirSync(dirname(dest), { recursive: true });
      if (/\.m?js$/.test(f)) {
        // ../<other>/index.js -> @tablefolk/<other>; ../<other>/x.js -> @tablefolk/<other>/x.js
        let s = readFileSync(f, 'utf8');
        const depth = rel.split('/').length - 1, up = '../'.repeat(depth + 1);
        for (const o of all) if (o !== n) {
          s = s.replaceAll(`'${up}${o}/index.js'`, `'${SCOPE}${o}'`).replaceAll(`"${up}${o}/index.js"`, `"${SCOPE}${o}"`)
               .replaceAll(`'${up}${o}/`, `'${SCOPE}${o}/`).replaceAll(`"${up}${o}/`, `"${SCOPE}${o}/`);
        }
        writeFileSync(dest, s);
      } else copyFileSync(f, dest);
    }
    // dependencies at the versions in the repo now
    for (const d of Object.keys(p.dependencies || {})) if (d.startsWith(SCOPE)) p.dependencies[d] = '^' + pkg(d.slice(SCOPE.length)).version;
    writeFileSync(join(out, 'package.json'), JSON.stringify(p, null, 2) + '\n');
    if (!existsSync(join(out, 'LICENSE'))) copyFileSync(join(ROOT, 'LICENSE'), join(out, 'LICENSE'));
    console.log(`built ${p.name}@${p.version} -> ${relative(ROOT, out)}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter(a => a.startsWith('--')), args = rest.filter(a => !a.startsWith('--'));
if (cmd === 'check') process.exit(check() ? 1 : 0);
else if (cmd === 'list') for (const n of names()) console.log(`${SCOPE}${n}@${pkg(n).version}${deps(n).length ? '  needs ' + deps(n).join(', ') : ''}`);
else if (cmd === 'build') { if (check()) process.exit(1); build(order(args.length ? args : names())); }
else if (cmd === 'version') {
  const [how, ...which] = args;
  for (const n of which.length ? which : names()) {
    const p = pkg(n), [a, b, c] = p.version.split('.').map(Number);
    p.version = how === 'major' ? `${a + 1}.0.0` : how === 'minor' ? `${a}.${b + 1}.0` : how === 'patch' ? `${a}.${b}.${c + 1}` : how;
    savePkg(n, p); console.log(`${p.name} ${p.version}`);
  }
} else if (cmd === 'publish') {
  if (check()) process.exit(1);
  const list = order(args.length ? args : names());
  build(list);
  // --otp=123456: npm's one-time code (two-factor accounts). A code lasts ~30 s:
  // packages already on npm at this version are skipped, so run it again with a
  // fresh code if it expires partway through.
  const otp = flags.find(f => f.startsWith('--otp='));
  for (const n of list) {
    const { name, version } = pkg(n);
    let have = '';
    try { have = execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
    if (have === version && !flags.includes('--dry-run')) { console.log(`${name}@${version} is already on npm: skipped`); continue; }
    execFileSync('npm', ['publish', '--access', 'public', ...(otp ? [otp] : []), ...(flags.includes('--dry-run') ? ['--dry-run'] : [])], { cwd: join(DIST, n), stdio: 'inherit' });
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}
