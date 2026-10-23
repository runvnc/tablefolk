/* packages.js -- where shareable things come from: one way to name a skill,
 * a role (and, later, a whole package) wherever it is published.
 *
 *   magic                    built in: <site>/skills/magic/skill.json
 *   https://.../skill.json   any URL (CORS); a folder URL gets the file name added
 *   npm:pkg@1.2[/dir]        npm through jsDelivr: cdn.jsdelivr.net/npm/pkg@1.2/skill.json
 *   gh:user/repo@tag[/dir]   GitHub through jsDelivr
 *
 *   window.tablefolkPackages.refUrl(ref, kind)   kind: 'skill' | 'role'
 *   window.tablefolkPackages.trusted(url)        may code from this URL run?
 *
 * Data (JSON) loads from anywhere; code modules only from this site unless
 * the page is opened with ?trustSkills=1.
 */
(function () {
  const ROOT = new URL('../', location.href).href;
  const KINDS = { skill: { dir: 'skills', file: 'skill.json' }, role: { dir: 'roles', file: 'role.json' } };

  function refUrl(ref, kind) {
    const k = KINDS[kind]; if (!k) throw new Error(`unknown package kind "${kind}"`);
    const r = String(ref).trim(), file = k.file;
    if (/^https?:\/\//.test(r)) return r.endsWith('.json') ? r : r.replace(/\/?$/, '/' + file);
    if (r.startsWith('npm:')) return `https://cdn.jsdelivr.net/npm/${r.slice(4).replace(/\/$/, '')}/${file}`;
    if (r.startsWith('gh:')) {
      const m = r.slice(3).match(/^([^/]+\/[^@/]+)(?:@([^/]+))?(\/.*)?$/);
      if (m) return `https://cdn.jsdelivr.net/gh/${m[1]}@${m[2] || 'main'}${(m[3] || '').replace(/\/$/, '')}/${file}`;
    }
    return ROOT + k.dir + '/' + encodeURIComponent(r.toLowerCase().replace(/[^a-z0-9_-]/g, '')) + '/' + file;
  }
  function trusted(url) {
    return new URL(url, location.href).origin === location.origin || new URLSearchParams(location.search).has('trustSkills');
  }

  window.tablefolkPackages = { refUrl, trusted, ROOT };
})();
