#!/usr/bin/env python3
"""Acceptance gate: is a shipped model torn compared with the raw model it was made from?

  python3 tools/env-assets/check.py [name ...]           env models (options.json), default all
  python3 tools/env-assets/check.py --pair raw.glb final.glb [--pair ...]

The final (meshopt-compressed) GLB is decompressed with decomp.mjs, then analyze.py counts open
(boundary) edges and connected parts after welding by position. A model fails when
  open edges > 2 x raw + 500   or   parts > raw parts + max(5, raw parts)
(decimation and the loose-part filter may close or drop a few; a torn decimation opens tens of thousands).
Exit status 1 when any model fails. Needs blender on PATH and node with ~/.cache/tablefolk-gltf set up
(see finish.sh). Runs one Blender, niced.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WORK = os.environ.get('ENV_WORK', os.path.join(ROOT, 'work/env'))
ASSETS = os.path.join(ROOT, 'assets/models/props/env')
GLTF = os.path.expanduser(os.environ.get('GLTF_DIR', '~/.cache/tablefolk-gltf'))


def decomp(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    helper = os.path.join(GLTF, 'env-decomp.mjs')
    if not os.path.exists(helper) or open(helper).read() != open(os.path.join(HERE, 'decomp.mjs')).read():
        open(helper, 'w').write(open(os.path.join(HERE, 'decomp.mjs')).read())
    subprocess.run(['node', helper, src, dst], check=True, stdout=subprocess.DEVNULL, cwd=GLTF)


def analyze(paths):
    out = subprocess.run(['nice', 'blender', '-b', '--factory-startup', '-P', os.path.join(HERE, 'analyze.py'), '--'] + paths,
                         capture_output=True, text=True).stdout
    res = {}
    for line in out.splitlines():
        if line.startswith('ANALYZE '):
            d = json.loads(line[8:]); res[d['file']] = d
    return res


def gate(raw, new):
    r, n = raw['welded'], new['welded']
    why = []
    if n['boundary_edges'] > 2 * r['boundary_edges'] + 500: why.append('open edges %d > 2x%d+500' % (n['boundary_edges'], r['boundary_edges']))
    if n['parts'] > r['parts'] + max(5, r['parts']): why.append('parts %d vs raw %d' % (n['parts'], r['parts']))
    return why


def main(argv):
    pairs = []
    if '--pair' in argv:
        i = 0
        while i < len(argv):
            if argv[i] == '--pair': pairs.append((os.path.basename(argv[i + 2]), argv[i + 1], argv[i + 2])); i += 3
            else: i += 1
    else:
        opts = json.load(open(os.path.join(HERE, 'options.json')))['models']
        for n in (argv or list(opts)):
            raw = os.path.join(WORK, opts[n].get('raw', 'raw/%s.glb' % n))
            pairs.append((n, raw, os.path.join(ASSETS, n + '.glb')))
    todo = []
    for name, raw, fin in pairs:
        chk = os.path.join(WORK, 'proc', os.path.basename(fin).replace('.glb', '') + '.check.glb') if fin.startswith(ASSETS) \
            else os.path.join(WORK, 'check', os.path.basename(fin))
        decomp(fin, chk)
        todo.append((name, raw, chk))
    res = analyze(sorted({p for _, r, c in todo for p in (r, c)}))
    bad = 0
    print('%-16s %8s %6s | %8s %6s  %s' % ('model', 'raw open', 'parts', 'new open', 'parts', 'verdict'))
    for name, raw, chk in todo:
        a, b = res.get(raw), res.get(chk)
        if not a or not b or 'error' in a or 'error' in b:
            print('%-16s analyze failed %s' % (name, (a or {}).get('error') or (b or {}).get('error') or '')); bad += 1; continue
        why = gate(a, b); bad += bool(why)
        print('%-16s %8d %6d | %8d %6d  %s' % (name, a['welded']['boundary_edges'], a['welded']['parts'],
                                             b['welded']['boundary_edges'], b['welded']['parts'], 'FAIL ' + '; '.join(why) if why else 'ok'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
