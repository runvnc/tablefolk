#!/usr/bin/env python3
# On the rented box: llama-eval-callback logs of the same prompt on two backends (Vulkan, WebGPU), matched by node
# name; prints the first nodes whose sums differ. This found the f16 overflow in mul_mat_id.wgsl (brains.md).
#   python3 ecdiff.py vk.log wgpu.log [from to]
# ecdiff.py a.log b.log: first nodes whose sums differ (relative) between two llama-eval-callback logs
import re, sys, math
def parse(p):
    out, name = [], None
    for line in open(p, errors='replace'):
        m = re.match(r'common_debug_cb_eval:\s+(.*?) = \((\w+)\)\s+(\w+)\((.*)', line)
        if m:
            name = (m.group(1), m.group(3), m.group(4)[:140])
            continue
        m = re.match(r'\s+sum = (\S+)', line)
        if m and name:
            out.append((name, m.group(1))); name = None
    return out
a, b = parse(sys.argv[1]), parse(sys.argv[2])
print(len(a), len(b))
from collections import defaultdict
def keyed(lst):
    seen = defaultdict(int); d = {}
    for n, v in lst:
        k = (n[0], n[1], re.sub(r'\w+\d#', '', n[2])); seen[k] += 1; d[k + (seen[k],)] = (n, v)
    return d
kb = keyed(b)
pairs = []
seen = defaultdict(int)
for n, v in a:
    k = (n[0], n[1], re.sub(r'\w+\d#', '', n[2])); seen[k] += 1
    if k + (seen[k],) in kb: pairs.append(((n, v), kb[k + (seen[k],)]))
print('matched', len(pairs))
shown = 0
for i, ((na, sa), (nb, sb)) in enumerate(pairs):
    try:
        fa, fb = float(sa), float(sb)
        bad = math.isnan(fa) != math.isnan(fb) or (not math.isnan(fa) and abs(fa - fb) > 0.02 * max(1.0, abs(fa), abs(fb)))
    except ValueError:
        bad = sa != sb
    if bad or na[0] != nb[0]:
        print(i, na[0], na[1], '|', na[2], '| a', sa, 'b', sb, '' if na[0] == nb[0] else f'(b node {nb[0]})')
        shown += 1
        if shown >= 15: break
if len(sys.argv) > 4:
    lo, hi = int(sys.argv[3]), int(sys.argv[4])
    for i, ((na, sa), (nb, sb)) in enumerate(pairs[lo:hi], lo):
        print(i, na[0], na[1], '|', na[2], '| a', sa, 'b', sb)
