#!/usr/bin/env python3
"""Bump cache-busting versions (?v=) after editing app files.

  tools/bump.py app/senses.js app/llm_js/litert-worker.js ...

Each named file gets a new version wherever it is referenced (preflight.js,
other modules' imports, server/generate.js, the worker URL), and every
importer up the chain is bumped too, so all importers share one module
instance; preflight.js's own version in index.html is bumped when it
changes. Versions look like 20261025a: today's date and a letter.
"""
import re, sys, os, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFS = ['app/preflight.js', 'app/index.html', 'server/generate.js', 'app/worldgen-browser.js'] + \
       ['app/llm_js/' + f for f in os.listdir(os.path.join(ROOT, 'app/llm_js')) if f.endswith('.js')]
today = datetime.date.today().strftime('%Y%m%d')
def nextv(cur):
    # never go back: a version already in use (by date) keeps counting up
    if len(cur) > 8 and cur[:8].isdigit() and cur[:8] >= today:
        suf = cur[8:]
        n = 0
        for ch in suf: n = n * 26 + (ord(ch) - 96)
        n += 1; out = ''
        while n: n, r = divmod(n - 1, 26); out = chr(97 + r) + out
        return cur[:8] + out
    return today + 'a'
changed = set()
def bump(name):
    base = os.path.basename(name)
    for ref in REFS:
        p = os.path.join(ROOT, ref)
        if not os.path.exists(p): continue
        s = open(p).read()
        pat = re.compile(re.escape(base) + r'\?v=(\w+)')
        if not pat.search(s): continue
        s2 = pat.sub(lambda m: base + '?v=' + nextv(m.group(1)), s)
        if s2 != s:
            open(p, 'w').write(s2)
            if ref not in changed:
                changed.add(ref)
                if ref.startswith('app/llm_js/') or ref in ('app/worldgen-browser.js', 'app/preflight.js'): bump(ref)
for f in sys.argv[1:]: bump(f)
print('bumped references in:', ', '.join(sorted(changed)) or 'nothing')
