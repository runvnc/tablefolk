#!/usr/bin/env python3
"""Compare two traces from trace-clone.hpp: compare-trace.py a.tsv b.tsv [threshold]
Prints where the two first disagree, stage by stage."""
import sys, collections
def rd(p):
    out = []
    for l in open(p):
        f = l.rstrip('\n').split('\t')
        if len(f) < 14: continue
        out.append({'stage': f[0], 'idx': int(f[1]), 'op': f[2], 'name': f[3], 'shape': f[4], 'n': int(f[5]), 'sum': float(f[6]), 'l2': float(f[7]), 'max': float(f[8]), 'bad': int(f[9]), 'v': [float(x) for x in f[10:14]]})
    return out
a, b = rd(sys.argv[1]), rd(sys.argv[2]); th = float(sys.argv[3]) if len(sys.argv) > 3 else 1e-3
stages = list(dict.fromkeys(x['stage'] for x in a))
def diff(x, y):
    if x['n'] != y['n'] or x['shape'] != y['shape']: return float('inf')
    s = max(x['l2'], y['l2'], 1e-9)
    return max(abs(x['l2'] - y['l2']) / s, abs(x['sum'] - y['sum']) / max(s * .1, 1e-9), *[abs(p - q) / max(x['max'], y['max'], 1e-9) for p, q in zip(x['v'], y['v'])], 1.0 if x['bad'] != y['bad'] else 0)
print(f'{len(a)} and {len(b)} lines; threshold {th}')
for st in stages:
    xs = [x for x in a if x['stage'] == st]; ys = [y for y in b if y['stage'] == st]
    if len(xs) != len(ys): print(f'{st}: DIFFERENT LENGTH {len(xs)} vs {len(ys)}'); 
    ds = [(diff(x, y), x, y) for x, y in zip(xs, ys)]
    first = next((d for d in ds if d[0] > th), None); worst = max(ds, key=lambda d: d[0]) if ds else None
    if not ds: continue
    if first:
        d, x, y = first
        print(f"{st}: {len(ds)} ops, FIRST DIFF at op #{x['idx']} {x['op']} {x['name'][:26]} {x['shape']} rel {d:.2e} | l2 {x['l2']:.5g}/{y['l2']:.5g} max {x['max']:.4g}/{y['max']:.4g} bad {x['bad']}/{y['bad']}; worst {worst[0]:.2e} at #{worst[1]['idx']} {worst[1]['op']}")
    else: print(f'{st}: {len(ds)} ops, all within {th} (worst {worst[0]:.1e})')
print('\nsteps, eos logit / best token (a | b):')
for st in stages:
    if not st.startswith('step'): continue
    g = lambda arr, n: next((x['v'][0] for x in arr if x['stage'] == st and x['name'] == n), None)
    print(f" {st} eos {g(a,'eos_logit'):.3f} | {g(b,'eos_logit'):.3f}   best {g(a,'best_token'):.0f} | {g(b,'best_token'):.0f}")
ops = collections.defaultdict(list)
for st in ('prefill', 'step000', 'step001', 'te-ref', 'te-text', 'audio-ref'):
    for x, y in zip([x for x in a if x['stage'] == st], [y for y in b if y['stage'] == st]):
        ops[(st, x['op'])].append(diff(x, y))
print('\nmedian and worst difference by operation:')
for (st, op), v in sorted(ops.items(), key=lambda kv: -max(kv[1]))[:16]:
    v.sort(); print(f'  {st:9} {op:14} n={len(v):4} median {v[len(v)//2]:.2e} worst {v[-1]:.2e}')
