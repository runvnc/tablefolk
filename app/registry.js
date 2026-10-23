/* registry.js -- finding packages, skills, roles and asset packs to use.
 *
 * Three places, all read from the browser (no server of our own):
 *   official   registry/index.json in this repo: the built-in ones, and
 *              community entries added by pull request (reviewed)
 *   npm        packages with the keyword "tablefolk" (and one of
 *              tablefolk-package / -skill / -role / -pack for the kind;
 *              package if none). Referenced as npm:<name>@<version>.
 *   GitHub     repos with the topic "tablefolk" (kind topics as above),
 *              manifest at the repo root: gh:<owner>/<repo>@<branch>.
 *              Without a login GitHub allows 10 searches a minute, so it
 *              is searched only when asked, and cached.
 *
 * The Library pane lists them: add one to the scenario being edited, copy
 * its reference, and see which packages' code this browser allows.
 *
 *   window.tablefolkRegistry.search(text, { github })  -> [{ kind, ref, name, description, source, code }]
 */
(function () {
  const ROOT = new URL('../', location.href).href;
  const KINDS = ['package', 'skill', 'role', 'pack'];
  const kindFrom = words => KINDS.find(k => (words || []).includes('tablefolk-' + k)) || 'package';
  const cache = new Map();
  async function cached(key, ms, fn) {
    const c = cache.get(key); if (c && Date.now() - c.at < ms) return c.value;
    try { const s = JSON.parse(sessionStorage.getItem('tfreg:' + key) || 'null'); if (s && Date.now() - s.at < ms) { cache.set(key, s); return s.value; } } catch {}
    const value = await fn(); const e = { at: Date.now(), value }; cache.set(key, e);
    try { sessionStorage.setItem('tfreg:' + key, JSON.stringify(e)); } catch {}
    return value;
  }

  async function official() {
    return cached('official', 5 * 60e3, async () => {
      const r = await fetch(ROOT + 'registry/index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('registry/index.json: ' + r.status);
      const d = await r.json();
      return [...(d.builtin || []).map(e => ({ ...e, source: 'built in' })), ...(d.community || []).map(e => ({ ...e, source: 'official' }))];
    });
  }
  async function npm(text) {
    return cached('npm:' + text, 10 * 60e3, async () => {
      const r = await fetch(`https://registry.npmjs.org/-/v1/search?size=50&text=${encodeURIComponent(('keywords:tablefolk ' + text).trim())}`);
      if (!r.ok) throw new Error('npm search: ' + r.status);
      return (await r.json()).objects.map(o => o.package).map(p => ({ kind: kindFrom(p.keywords), ref: `npm:${p.name}@${p.version}`, name: p.name, description: p.description || '', version: p.version, author: p.publisher?.username || '', homepage: p.links?.homepage || p.links?.repository || '', source: 'npm' }));
    });
  }
  async function github(text) {
    return cached('gh:' + text, 10 * 60e3, async () => {
      const r = await fetch(`https://api.github.com/search/repositories?per_page=50&q=${encodeURIComponent((text + ' topic:tablefolk').trim())}`);
      if (r.status === 403 || r.status === 429) throw new Error('GitHub search limit reached (10 a minute without a login); try again in a minute');
      if (!r.ok) throw new Error('GitHub search: ' + r.status);
      return (await r.json()).items.map(x => ({ kind: kindFrom(x.topics), ref: `gh:${x.full_name}@${x.default_branch}`, name: x.name, description: x.description || '', author: x.owner?.login || '', homepage: x.html_url, stars: x.stargazers_count, source: 'GitHub' }));
    });
  }
  // Everything that matches: official first, then npm, then GitHub (if asked).
  async function search(text = '', { github: gh = false } = {}) {
    const t = String(text).trim().toLowerCase(), errors = [];
    const match = e => !t || [e.name, e.description, e.ref, e.kind].join(' ').toLowerCase().includes(t);
    const parts = await Promise.all([
      official().then(l => l.filter(match)).catch(e => (errors.push(e.message), [])),
      npm(t).catch(e => (errors.push(e.message), [])),
      gh ? github(t).catch(e => (errors.push(e.message), [])) : [],
    ]);
    const seen = new Set(), out = [];
    for (const e of parts.flat()) { const k = e.ref.replace(/@[^/]*$/, ''); if (seen.has(k)) continue; seen.add(k); out.push(e); }
    return { results: out, errors };
  }

  // ---- the Library pane ----
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LIST = { package: 'packages', skill: 'skills', pack: 'packs' };
  // Add a reference to the scenario in the Scenario pane's editor.
  function addToScenario(e) {
    const box = $('scnJson'); if (!box) return 'no scenario editor';
    let scn; try { scn = JSON.parse(box.value || '{}'); } catch { return 'the scenario JSON has an error; fix it first'; }
    if (e.kind === 'role') {
      const a = (scn.agents || [])[0]; if (!a) return 'add a character first, then give it this role';
      a.role = e.ref; box.value = JSON.stringify(scn, null, 2); return `${a.id} now has the role ${e.name}`;
    }
    const k = LIST[e.kind], list = (scn[k] ||= []);
    if (list.includes(e.ref)) return 'already in the scenario';
    list.push(e.ref); box.value = JSON.stringify(scn, null, 2);
    return `added to the scenario's "${k}"`;
  }
  function renderTrust() {
    const box = $('pkgTrust'); if (!box) return;
    const list = window.tablefolkPackages?.allowedList() || [];
    box.innerHTML = list.length ? list.map((s, i) => `<div class="pkg-trust-row"><code>${esc(s)}</code><button type="button" data-revoke="${i}">revoke</button></div>`).join('') : '<small class="pane-note">No other site\'s code is allowed.</small>';
    box.querySelectorAll('[data-revoke]').forEach(b => b.onclick = () => { window.tablefolkPackages.untrust(list[+b.dataset.revoke]); renderTrust(); });
  }
  async function run() {
    const out = $('pkgResults'), status = $('pkgStatus'); if (!out) return;
    status.textContent = 'searching…';
    const kind = $('pkgKind').value;
    const { results, errors } = await search($('pkgSearch').value, { github: $('pkgGithub').checked });
    const shown = results.filter(e => !kind || e.kind === kind);
    status.textContent = `${shown.length} found${errors.length ? ' · ' + errors.join(' · ') : ''}`;
    out.innerHTML = shown.map((e, i) => `<div class="pkg-row">
      <div class="pkg-head"><b>${esc(e.name)}</b> <span class="pkg-tag">${esc(e.kind)}</span> <span class="pkg-tag pkg-src-${esc(e.source.replace(/\s/g, ''))}">${esc(e.source)}</span>${e.code ? ' <span class="pkg-tag pkg-code" title="brings its own code: you are asked before it runs">code</span>' : ''}</div>
      <div class="pkg-desc">${esc(e.description)}</div>
      <div class="pkg-ref"><code>${esc(e.ref)}</code>${e.homepage ? ` · <a href="${esc(e.homepage)}" target="_blank" rel="noopener">page</a>` : ''}</div>
      <div class="row"><button type="button" data-add="${i}">add to scenario</button><button type="button" data-copy="${i}">copy reference</button></div>
    </div>`).join('');
    out.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { status.textContent = addToScenario(shown[+b.dataset.add]); });
    out.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(shown[+b.dataset.copy].ref); status.textContent = 'copied ' + shown[+b.dataset.copy].ref; });
  }
  function init() {
    if (!$('pkgSearchGo')) return;
    $('pkgSearchGo').onclick = run;
    $('pkgSearch').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    $('pkgKind').onchange = run;
    renderTrust();
    document.querySelector('#rail .rail-btn[data-tab="library"]')?.addEventListener('click', () => { renderTrust(); if (!$('pkgResults').children.length) run(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.tablefolkRegistry = { search, official, npm, github, addToScenario };
})();
