#!/usr/bin/env python3
"""Read the documentation a section at a time.

  tools/docs.py --list               every chapter and its headings (with line numbers)
  tools/docs.py walk-in buildings    print the sections whose heading has all these words
                                     (or, if none, the sections whose text has them)
  tools/docs.py -f roofs             only list where they match (file:line heading)

Chapters: the scenario skill (plugins/tablefolk-scenario/skills/tablefolk-scenario/),
the maintainer skill (.claude/skills/tablefolk-dev/), CHANGELOG.md, the plans in
docs/ and the browser test manual.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = ['plugins/tablefolk-scenario/skills/tablefolk-scenario', '.claude/skills/tablefolk-dev']


def chapters():
    files = []
    for s in SKILLS:
        files.append(f'{s}/SKILL.md')
        files += sorted(glob.glob(f'{s}/reference/*.md', root_dir=ROOT))
    files += ['CHANGELOG.md', 'docs/LAUNCH-PLAN.md', 'docs/REQUESTS.md', 'tools/browser-test/README.md']
    return [f for f in files if os.path.exists(os.path.join(ROOT, f))]


def sections(path):
    """(level, heading, first line, lines) for each heading; code blocks are skipped."""
    lines = open(os.path.join(ROOT, path), encoding='utf-8').read().split('\n')
    out, fence = [], False
    for i, line in enumerate(lines):
        if line.startswith('```'):
            fence = not fence
        m = None if fence else re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            out.append([len(m.group(1)), m.group(2).strip(), i + 1, []])
        if out:
            out[-1][3].append(line)
    # a section runs until the next heading of the same or a higher level
    full = []
    for k, (lvl, head, start, _) in enumerate(out):
        end = len(lines)
        for lvl2, _, start2, _ in out[k + 1:]:
            if lvl2 <= lvl:
                end = start2 - 1
                break
        full.append((lvl, head, start, lines[start - 1:end]))
    return full


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__.strip())
        return
    if argv[0] == '--list':
        for f in chapters():
            print(f)
            for lvl, head, start, _ in sections(f):
                print(f'  {start:4d} {"  " * (lvl - 1)}{head}')
        return
    only_list = argv[0] == '-f'
    words = [w.lower() for w in (argv[1:] if only_list else argv)]
    hits = [(f, s) for f in chapters() for s in sections(f) if all(w in s[1].lower() for w in words)]
    if not hits:
        hits = [(f, s) for f in chapters() for s in sections(f) if s[0] >= 2 and all(w in '\n'.join(s[3]).lower() for w in words)]
        # keep the innermost matching sections
        hits = [(f, s) for f, s in hits if not any(f2 == f and s2[2] > s[2] and s2[2] < s[2] + len(s[3]) for f2, s2 in hits)]
    if not hits:
        print('no section mentions: ' + ' '.join(words))
        return
    for f, (lvl, head, start, body) in hits:
        if only_list:
            print(f'{f}:{start} {head}')
        else:
            print(f'===== {f}:{start}')
            print('\n'.join(body).rstrip() + '\n')


if __name__ == '__main__':
    main(sys.argv[1:])
