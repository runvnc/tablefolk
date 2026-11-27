#!/usr/bin/env python3
"""fal.ai calls for the modular building kit (2026-11-27). Every paid call goes into
work/kit/ledger.jsonl ('sub' when queued, with its request id and URLs; 'done' when finished),
so a dropped poll is resumed (`resume <label>`), never paid twice. Refuses a call that would take
the ledger past BUDGET (default $12, the owner's cap for the kit).
  fal_kit.py call <endpoint> <label> <cost> '<json args>' [outdir]
      args values "@path" (also inside lists) are replaced by a URL for that local file (fal storage)
      every file URL in the result is downloaded to outdir/<label>_<i>.<ext> (default work/kit/raw)
  fal_kit.py resume <label> [outdir]
  fal_kit.py spent
The result JSON is saved as work/kit/raw/<label>.json. The key is read from .env, never printed.
"""
import sys, os, json, time, urllib.request, urllib.error, mimetypes
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = os.path.join(ROOT, 'work/kit')
LEDGER = os.path.join(W, 'ledger.jsonl')
BUDGET = float(os.environ.get('BUDGET', 12.0))


def key():
    for l in open(os.path.join(ROOT, '.env')):
        if l.startswith('FAL_API_KEY='): return l.split('=', 1)[1].strip().strip('"\'')


def ledger():
    return [json.loads(l) for l in open(LEDGER)] if os.path.exists(LEDGER) else []


def spent():
    subs, done = {}, {}
    for r in ledger():
        (subs if r['kind'] == 'sub' else done)[r['label']] = r
    return sum(s['est_cost'] for lab, s in subs.items() if done.get(lab) is None or done[lab].get('ok') or done[lab].get('charged'))


def log(rec):
    with open(LEDGER, 'a') as f: f.write(json.dumps(rec) + '\n')


def req(url, k, data=None, method=None, ctype='application/json'):
    h = {'Authorization': f'Key {k}'}
    if data is not None: h['Content-Type'] = ctype
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h, method=method), timeout=120)


def upload(path, k):
    ct = mimetypes.guess_type(path)[0] or ('model/gltf-binary' if path.endswith('.glb') else 'application/octet-stream')
    r = json.load(req('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', k,
                      json.dumps({'content_type': ct, 'file_name': os.path.basename(path)}).encode(), 'POST'))
    put = urllib.request.Request(r['upload_url'], data=open(path, 'rb').read(), headers={'Content-Type': ct}, method='PUT')
    urllib.request.urlopen(put, timeout=600).read()
    return r['file_url']


def get(url, k, tries=40):
    for i in range(tries):
        try: return json.load(req(url, k))
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 402, 403, 404, 422): raise
            print('get err', e.code, flush=True)
        except Exception as e: print('get err', e, flush=True)
        time.sleep(8)
    sys.exit('network gone')


def files(res):
    out = []
    def walk(x, tag=''):
        if isinstance(x, dict):
            u = x.get('url')
            if isinstance(u, str) and u.startswith('http'):
                out.append((u, x.get('map_type') or x.get('file_name') or tag))
            for kk, v in x.items():
                if kk != 'url': walk(v, kk)
        elif isinstance(x, list):
            for v in x: walk(v, tag)
    walk(res)
    return out


def finish(sub, label, k, outdir):
    t0 = time.time()
    while True:
        st = get(sub['status_url'], k)
        if st['status'] == 'COMPLETED': break
        if time.time() - t0 > 1500: sys.exit('timeout ' + label + ' (resume later)')
        time.sleep(4)
    try: res = get(sub['response_url'], k); ok = True
    except urllib.error.HTTPError as e: res = {'error': e.code, 'body': e.read().decode()[:1500]}; ok = False
    secs = int(time.time() - sub.get('t0', t0))
    log({'kind': 'done', 't': time.strftime('%H:%M:%S'), 'label': label, 'ok': ok, 'secs': secs})
    json.dump(res, open(os.path.join(W, 'raw', label + '.json'), 'w'), indent=1)
    print(label, 'done' if ok else 'FAILED', secs, 's', '' if ok else json.dumps(res)[:800], flush=True)
    if not ok: sys.exit(1)
    os.makedirs(outdir, exist_ok=True)
    for i, (u, tag) in enumerate(files(res)):
        ext = os.path.splitext(u.split('?')[0])[1] or '.bin'
        tag = ''.join(c for c in str(tag) if c.isalnum() or c in '_-')[:24]
        p = os.path.join(outdir, f'{label}_{i}{"_" + tag if tag else ""}{ext}')
        try: urllib.request.urlretrieve(u, p); print('saved', p, os.path.getsize(p) // 1024, 'KB')
        except Exception as e: print('download failed', u[:80], e)


def main(a):
    os.makedirs(os.path.join(W, 'raw'), exist_ok=True)
    k = key()
    if a[0] == 'spent': print('%.3f of %.2f' % (spent(), BUDGET)); return
    if a[0] == 'resume':
        sub = [r for r in ledger() if r['kind'] == 'sub' and r['label'] == a[1]][-1]
        return finish(sub, a[1], k, a[2] if len(a) > 2 else os.path.join(W, 'raw'))
    ep, label, cost, args = a[1], a[2], float(a[3]), json.loads(a[4])
    outdir = a[5] if len(a) > 5 else os.path.join(W, 'raw')
    if any(r['kind'] == 'sub' and r['label'] == label for r in ledger()): sys.exit(f'{label} already queued: resume it')
    s = spent()
    if s + cost > BUDGET + 1e-9: sys.exit(f'BUDGET: spent {s:.3f} + {cost} > {BUDGET}')
    def fix(v):
        if isinstance(v, str) and v.startswith('@'): return upload(v[1:], k)
        if isinstance(v, list): return [fix(x) for x in v]
        return v
    args = {kk: fix(v) for kk, v in args.items()}
    try: sub = json.load(req(f'https://queue.fal.run/{ep}', k, json.dumps(args).encode(), 'POST'))
    except urllib.error.HTTPError as e: sys.exit(f'SUBMIT FAILED {e.code} {e.read().decode()[:800]}')
    rec = {'kind': 'sub', 't': time.strftime('%Y-%m-%d %H:%M:%S'), 't0': time.time(), 'endpoint': ep, 'label': label,
           'est_cost': cost, 'request_id': sub.get('request_id'),
           'args': {kk: (v if not (isinstance(v, str) and v.startswith('http')) else '<url>') for kk, v in args.items()},
           'status_url': sub['status_url'], 'response_url': sub['response_url']}
    log(rec); print(label, 'queued', f'(ledger {s + cost:.3f})', flush=True)
    finish(rec, label, k, outdir)


if __name__ == '__main__':
    main(sys.argv[1:])
