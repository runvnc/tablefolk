#!/usr/bin/env python3
"""Turn a tablefolk.world scenario JSON file into a playable link, or a link back into JSON.

  scenario_link.py encode my-scenario.json [--base URL]   -> prints the link
  scenario_link.py decode '<link or code>'                -> prints the JSON

The link format is the app's own: #s=<base64url(deflate-raw(JSON))>, no padding.
Only the standard library is used.
"""
import argparse, base64, html, json, re, sys, zlib

DEFAULT_BASE = 'http://localhost:8000/app/'
BASES = {'island', 'clearing', 'dungeon', 'plain'}


def encode(obj):
    data = json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode()
    c = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw deflate, like CompressionStream('deflate-raw')
    raw = c.compress(data) + c.flush()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def decode(code):
    m = re.search(r's(?:cenario)?=([A-Za-z0-9_-]+)', code)
    code = m.group(1) if m else code.strip()
    raw = base64.urlsafe_b64decode(code + '=' * (-len(code) % 4))
    return json.loads(zlib.decompress(raw, -15))


def check(obj):
    """Cheap sanity checks; the app itself is lenient and reports layout problems in the pane."""
    problems = []
    if not isinstance(obj, dict): return ['scenario must be a JSON object']
    if obj.get('v', 1) != 1: problems.append('"v" must be 1')
    if obj.get('base', 'island') not in BASES: problems.append(f'"base" must be one of {sorted(BASES)}')
    ids = [a.get('id') for a in obj.get('agents', [])]
    if not ids: problems.append('no agents: add at least one character with an "id"')
    for i in ids:
        if not i or not re.fullmatch(r'[A-Za-z0-9_-]{1,24}', str(i)): problems.append(f'agent id {i!r}: use 1-24 letters, digits, _ or -')
    if len(set(ids)) != len(ids): problems.append('agent ids must be unique')
    for o in obj.get('objects', []):
        if not all(isinstance(o.get(k), (int, float)) for k in ('x', 'z')) or not o.get('type'):
            problems.append(f'object {o!r} needs "type", numeric "x" and "z"')
    grid = obj.get('grid') or []
    if isinstance(grid, str): grid = grid.split('\n')
    size = obj.get('size')
    if size is not None and not (isinstance(size, list) and len(size) == 2 and all(isinstance(n, int) and 5 <= n <= 63 for n in size)):
        problems.append('"size" must be [cols, rows], whole numbers 5-63 (odd numbers centre exactly)')
    gw, gh = max(map(len, grid), default=0), len(grid)
    if gw > 63 or gh > 63:
        problems.append(f'"grid" is {gw} x {gh}; the board is at most 63 x 63')
    elif grid and isinstance(size, list) and len(size) == 2 and (gw > size[0] or gh > size[1]):
        problems.append(f'"grid" is {gw} x {gh} but "size" is {size[0]} x {size[1]}; cells outside the board are dropped')
    if not isinstance(obj.get('map', []), list): problems.append('"map" must be a list of lines')
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    e = sub.add_parser('encode'); e.add_argument('file', help='scenario JSON file, or - for stdin'); e.add_argument('--base', default=DEFAULT_BASE)
    e.add_argument('--html', metavar='OUT.html', help='also write a page that opens the link (double-click it)')
    d = sub.add_parser('decode'); d.add_argument('link')
    a = ap.parse_args()
    if a.cmd == 'encode':
        obj = json.load(sys.stdin if a.file == '-' else open(a.file))
        for p in check(obj): print('warning:', p, file=sys.stderr)
        base = a.base.split('#')[0]
        link = f'{base}#s={encode(obj)}'
        print(link)
        if a.html:
            title = html.escape(str(obj.get('title', 'Tablefolk scenario')))
            with open(a.html, 'w') as f:
                f.write(f'<!doctype html><meta charset="utf-8"><title>{title}</title>'
                        f'<meta http-equiv="refresh" content="0;url={html.escape(link)}">'
                        f'<p>Opening <a href="{html.escape(link)}">{title}</a>...</p>\n')
    else:
        print(json.dumps(decode(a.link), indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
