# Modular building kit: assemble a house from the game's own description (2026-11-27).
#   blender -b --factory-startup -P tools/kit/build_house.py -- house.json out.glb [--notex]
# house.json: {"name", "seed", "style", "grid": [rows], "storeys", "jetty": {"sides": [...], "d"},
#   "roof": "shingle"|"thatch", "pitch" (deg), "bay" (1|2), "braces", "chimney", "porch", "sign",
#   "dormers", "upperDoors": [[r, c]], "stair"}
# The grid uses the game's map letters: '#' wall, '+' door, '.' floor, ' ' outside. One square = 1 unit;
# rows run back (+Y in Blender, -Z in glTF... the front is the last row, Blender -Y = glTF +Z).
# Rooms are found as roofs.js finds them (flood fill from the edge over non-walls); walls run through the
# wall cells' centres, as walls.js draws them. Three layers:
#   1 structure (exact, procedural): wall panels T thick with both faces finished, cut for doors and
#     windows; plinth; floors; gable roofs per room rectangle (an L gets a main roof and a wing roof that
#     runs into it), overhang, eave thickness, pitch; gable walls
#   2 frame (procedural): sill and top plates, corner/bay/jamb posts, rails, seeded braces, the floor
#     beam and joist ends of a jetty, king post and collar in the gables, bargeboards; quoins on stone
#   3 hero pieces (work/kit/pieces/<name>.glb, normalised by proc_piece.py; boxes if missing): door frame
#     + hinged leaf, windows, chimney, dormer, porch, sign, corbels, outside stair
# Output: one object per material for the structure (<name>_<mat>), one per material for the roof
# (<name>_roof_<mat>, so it can fade alone), hero pieces as linked duplicates (glTF instances), the door
# leaves as their own nodes with the pivot on the hinge. Vertex colours carry dirt at the base and the
# per-building tint, so every building shares the same materials. Prints STATS {...}.
import bpy, bmesh, sys, json, math, os, random
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX = os.path.join(ROOT, 'work/kit/tex')
PIECES = os.environ.get('KIT_PIECES', os.path.join(ROOT, 'work/kit/pieces'))
bpy.ops.wm.read_factory_settings(use_empty=True)   # no default cube, camera or light
a = sys.argv[sys.argv.index('--') + 1:]
SPEC = json.load(open(a[0])); OUT = a[1]; NOTEX = '--notex' in a
NAME = SPEC.get('name', 'house'); RNG = random.Random(SPEC.get('seed', 1))

# ---- dimensions (game units: a square is 1, a character 1.3 tall) ----
H = SPEC.get('storeyH', 2.2)          # storey height = the game's wall height (wallHeight 2)
T = SPEC.get('wallT', .18)            # wall thickness
BT = .045                             # beams stand this far proud of each face
DW, DH = .78, 1.62                    # door opening
WW, WH, WSILL = .56, .66, .82         # window opening and sill height
PLINTH = .42
STYLE = SPEC.get('style', 'plaster_timber')
STOREYS = SPEC.get('storeys', 1)
ROOF = SPEC.get('roof', 'shingle')
PITCH = math.radians(SPEC.get('pitch', 50))
OV = .38 if ROOF != 'thatch' else .48          # eave overhang (horizontal)
VERGE = .28 if ROOF != 'thatch' else .34       # gable overhang
RT = .12 if ROOF != 'thatch' else .36          # roof (eave) thickness
JET = SPEC.get('jetty', {})
JD = JET.get('d', .3) if JET else 0
TINT = SPEC.get('tint') or [RNG.uniform(.92, 1.04), RNG.uniform(.9, 1.0), RNG.uniform(.84, .96)]

# storey looks: (outer, inner, framed)
LOOK = {
    'plaster_timber': [('plaster', 'plaster', True)],
    'stone_timber':   [('fieldstone', 'plaster', False), ('plaster', 'plaster', True)],
    'plank_barn':     [('siding', 'siding', True)],
    'stone_cottage':  [('fieldstone', 'plaster', False)],
}[STYLE]
def look(k): return LOOK[min(k, len(LOOK) - 1)]
GABLE = {'plaster_timber': 'plaster', 'stone_timber': 'plaster', 'plank_barn': 'siding', 'stone_cottage': 'fieldstone'}[STYLE]
ROOFMAT = {'shingle': 'shingle', 'thatch': 'thatch'}[ROOF]
TILES = json.load(open(os.path.join(TEX, 'manifest.json'))) if os.path.exists(os.path.join(TEX, 'manifest.json')) else {}
def tile(m): return TILES.get(m, {}).get('tileMeters', [2, 2])
MATS = ['plaster', 'fieldstone', 'quoin', 'timber', 'siding', 'floor', 'shingle', 'thatch']
MI = {m: i for i, m in enumerate(MATS)}

# ---- grid, rooms, runs ----
G = [r for r in SPEC['grid']]; R = len(G); C = max(len(r) for r in G); G = [r.ljust(C) for r in G]
def cell(r, c): return G[r][c] if 0 <= r < R and 0 <= c < C else ' '
def isw(r, c): return cell(r, c) in '#+'
outside = set(); st = [(r, c) for r in range(R) for c in range(C) if (r in (0, R - 1) or c in (0, C - 1)) and not isw(r, c)]
while st:
    p = st.pop()
    if p in outside: continue
    outside.add(p); r, c = p
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        q = (r + dr, c + dc)
        if 0 <= q[0] < R and 0 <= q[1] < C and q not in outside and not isw(*q): st.append(q)
def out(r, c): return not (0 <= r < R and 0 <= c < C) or (r, c) in outside
inside = {(r, c) for r in range(R) for c in range(C) if not isw(r, c) and not out(r, c)}
foot = inside | {(r, c) for r in range(R) for c in range(C) if isw(r, c)}
CX, CY = (C - 1) / 2, (R - 1) / 2
def X(c): return c - CX
def Y(r): return CY - r
XMIN, XMAX = min(X(c) for r, c in foot), max(X(c) for r, c in foot)
YMIN, YMAX = min(Y(r) for r, c in foot), max(Y(r) for r, c in foot)

runs = []
for axis in 'xy':
    lines = range(R) if axis == 'x' else range(C)
    for L in lines:
        n = C if axis == 'x' else R
        k = 0
        while k < n - 1:
            rc = (lambda i: (L, i)) if axis == 'x' else (lambda i: (i, L))
            if isw(*rc(k)) and isw(*rc(k + 1)):
                j = k
                while j + 1 < n and isw(*rc(j + 1)): j += 1
                cells = [rc(i) for i in range(k, j + 1)]
                # which side is outside: + side is row-1 (axis x, +Y) or col+1 (axis y, +X)
                def side(sg):
                    o = 0
                    for (r, c) in cells[1:-1] or cells:
                        q = (r - sg, c) if axis == 'x' else (r, c + sg)
                        o += 1 if out(*q) else 0
                    return o
                po, no = side(1), side(-1)
                kind = 'inner' if po == 0 and no == 0 else 'outer'
                sgn = 1 if po >= no else -1
                fixed = Y(L) if axis == 'x' else X(L)
                s0 = X(k) if axis == 'x' else Y(j)
                s1 = X(j) if axis == 'x' else Y(k)
                runs.append(dict(axis=axis, fixed=fixed, s0=s0, s1=s1, cells=cells, sgn=sgn, kind=kind))
                k = j
            else: k += 1

def jettied(run, k):
    """the run's line on storey k (jetty: outer runs on a jettied bbox side move out; runs meeting them grow)"""
    f, s0, s1 = run['fixed'], run['s0'], run['s1']
    if k == 0 or not JD: return f, s0, s1
    sides = JET.get('sides', ['front'])
    lim = {'front': ('x', YMIN, -1), 'back': ('x', YMAX, 1), 'left': ('y', XMIN, -1), 'right': ('y', XMAX, 1)}
    for sd in sides:
        ax, v, sg = lim[sd]
        if run['axis'] == ax and abs(f - v) < 1e-6 and run['kind'] == 'outer': f += sg * JD
        if run['axis'] != ax:
            if abs(s0 - v) < 1e-6 and sg < 0: s0 -= JD
            if abs(s1 - v) < 1e-6 and sg > 0: s1 += JD
    return f, s0, s1

def frame_of(run, f):
    """(origin at s=0 on the line, along, outward normal)"""
    if run['axis'] == 'x': return Vector((0, f, 0)), Vector((1, 0, 0)), Vector((0, run['sgn'], 0))
    return Vector((f, 0, 0)), Vector((0, 1, 0)), Vector((run['sgn'], 0, 0))

def s_of(run, rc):
    r, c = rc; return X(c) if run['axis'] == 'x' else Y(r)

# ---- openings ----
doors = [(r, c) for r in range(R) for c in range(C) if cell(r, c) == '+']
updoors = [tuple(x) for x in SPEC.get('upperDoors', [])]
def openings(run, k):
    ops = []
    cells = run['cells']; ends = {cells[0], cells[-1]}
    if k == 0:
        for rc in cells:
            if rc in doors and rc not in ends: ops.append(dict(kind='door', s=s_of(run, rc), w=DW, zb=0, zt=DH, rc=rc))
    for rc in cells:
        if k > 0 and rc in updoors and rc not in ends: ops.append(dict(kind='door', s=s_of(run, rc), w=DW, zb=0, zt=DH, rc=rc, upper=True))
    if run['kind'] != 'outer': return ops
    if STYLE == 'plank_barn' and k == 0 and len(cells) < 6: return ops
    # windows: on cells that are not corners, not next to a corner or a door, spaced by the rhythm
    step = SPEC.get('winStep', 2)
    taken = [o['s'] for o in ops]
    cand = [rc for rc in cells[2:-2] if rc not in doors and rc not in updoors]
    if not cand: cand = [rc for rc in cells[1:-1] if rc not in doors and rc not in updoors] if len(cells) >= 4 else []
    # symmetric about the run's middle
    mid = (s_of(run, cells[0]) + s_of(run, cells[-1])) / 2
    cand.sort(key=lambda rc: abs(s_of(run, rc) - mid))
    for rc in cand:
        s = s_of(run, rc)
        if all(abs(s - t) >= step - 1e-6 for t in taken) and all(abs(s - t) > 1.2 for t in [o['s'] for o in ops if o['kind'] == 'door']):
            taken.append(s); ops.append(dict(kind='window', s=s, w=WW, zb=WSILL, zt=WSILL + WH, rc=rc))
    return ops

# ---- geometry buckets ----
class Bucket:
    def __init__(self, name):
        self.bm = bmesh.new(); self.uv = self.bm.loops.layers.uv.new('UVMap'); self.col = self.bm.loops.layers.float_color.new('Col'); self.name = name
S = Bucket('struct'); RF = Bucket('roof')

def dirt(z, m):
    if m in ('timber', 'floor', 'shingle', 'thatch'): return 1.0
    return 1 - .32 * max(0.0, 1 - z / .75) ** 1.5

def colour(m, z, jit):
    t = TINT if m in ('plaster', 'siding', 'fieldstone', 'thatch', 'shingle') else (1, 1, 1)
    d = dirt(z, m); return (t[0] * d * jit, t[1] * d * jit, t[2] * d * jit, 1.0)

def uv_world(p, n, m):
    tu, tv = tile(m); an = [abs(n.x), abs(n.y), abs(n.z)]; i = an.index(max(an))
    if i == 0: u, v = (p.y if n.x > 0 else -p.y), p.z
    elif i == 1: u, v = (-p.x if n.y > 0 else p.x), p.z
    else: u, v = p.x, p.y
    return u / tu, v / tv

def add_face(B, pts, m, uvs, jit=1.0):
    vs = [B.bm.verts.new(p) for p in pts]
    f = B.bm.faces.new(vs); f.material_index = MI[m]
    for lp, (u, v), p in zip(f.loops, uvs, pts):
        lp[B.uv].uv = (u, v); lp[B.col] = colour(m, p.z, jit)
    return f

def box(B, c, ax, ay, az, hx, hy, hz, matf, uv='world', jit=1.0, zcuts=(), uvoff=(0, 0)):
    """box from centre and three orthonormal axes; matf(normal) -> material; uv 'world' (box projection in
    world space) or 'local' (u along ax, the long axis: beams, roof slabs); zcuts split the side faces."""
    lv = [-hz] + sorted(z for z in zcuts if -hz < z < hz) + [hz]
    ring = lambda t: [c + az * t + ax * sx * hx + ay * sy * hy for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    rings = [ring(t) for t in lv]
    faces = []
    for a_, b_ in zip(rings[:-1], rings[1:]):
        for i in range(4): faces.append([a_[i], a_[(i + 1) % 4], b_[(i + 1) % 4], b_[i]])
    faces.append(list(reversed(rings[0]))); faces.append(rings[-1])
    for q in faces:
        n = (q[1] - q[0]).cross(q[2] - q[0]).normalized(); ctr = sum(q, Vector()) / len(q)
        if n.dot(ctr - c) < 0: q.reverse(); n = -n
        m = matf(n)
        if uv == 'world': uvs = [uv_world(p, n, m) for p in q]
        else:
            tu, tv = tile(m)
            if abs(n.dot(ax)) > .7: e1, e2 = ay, az
            elif abs(n.dot(ay)) > .7: e1, e2 = ax, az
            else: e1, e2 = ax, ay
            uvs = [(uvoff[0] + (p - c).dot(e1) / tu, uvoff[1] + (p - c).dot(e2) / tv) for p in q]
        add_face(B, q, m, uvs, jit)

def prism(B, pts2, o, along, nrm, th, matf_front, mat_side):
    """a flat polygon (pts2 in (s, z) on the plane through o spanned by along and up) extruded th across nrm"""
    up = Vector((0, 0, 1))
    P = lambda s, z, d: o + along * s + up * z + nrm * d
    fr = [P(s, z, th / 2) for s, z in pts2]; bk = [P(s, z, -th / 2) for s, z in pts2]
    for q, n in ((fr, nrm), (list(reversed(bk)), -nrm)):
        ctr = sum(q, Vector()) / len(q); nn = (q[1] - q[0]).cross(q[2] - q[0])
        if nn.dot(n) < 0: q = list(reversed(q))
        m = matf_front(n); add_face(B, q, m, [uv_world(p, n, m) for p in q])
    k = len(pts2)
    for i in range(k):
        q = [fr[i], fr[(i + 1) % k], bk[(i + 1) % k], bk[i]]
        n = (q[1] - q[0]).cross(q[2] - q[0]).normalized(); ctr = sum(q, Vector()) / 4
        cen = sum(fr + bk, Vector()) / (2 * k)
        if n.dot(ctr - cen) < 0: q.reverse(); n = -n
        add_face(B, q, mat_side, [uv_world(p, n, mat_side) for p in q])

def beam(B, p0, p1, nrm, w, d, jit=None, m='timber'):
    """a timber from p0 to p1, w wide (in the wall plane), d deep (across it, along nrm)"""
    ax = (p1 - p0); L = ax.length; ax.normalize(); az = nrm.normalized(); ay = az.cross(ax).normalized()
    box(B, (p0 + p1) / 2, ax, ay, az, L / 2, w / 2, d / 2, lambda n: m, uv='local', jit=jit or RNG.uniform(.82, 1.1),
        uvoff=(RNG.random(), RNG.random()))

def cyl(B, p0, p1, r, m, sides=10, squash=1.0):
    """a round timber or a thatch roll from p0 to p1 (u along it, v round it)"""
    ax = (p1 - p0); L = ax.length; ax.normalize()
    e1 = ax.cross(Vector((0, 0, 1))); e1 = e1.normalized() if e1.length > 1e-6 else Vector((1, 0, 0)); e2 = e1.cross(ax).normalized()
    tu, tv = tile(m)
    ring = lambda p, i: p + (e1 * math.cos(2 * math.pi * i / sides) + e2 * math.sin(2 * math.pi * i / sides) * squash) * r
    for i in range(sides):
        q = [ring(p0, i), ring(p0, i + 1), ring(p1, i + 1), ring(p1, i)]
        n = (q[1] - q[0]).cross(q[2] - q[0])
        if n.dot((q[0] + q[1]) / 2 - p0 - ax * (q[0] - p0).dot(ax)) < 0: q.reverse(); uvs = [(L / tu, (i + 1) * r * 2 * math.pi / sides / tv), (L / tu, i * r * 2 * math.pi / sides / tv), (0, i * r * 2 * math.pi / sides / tv), (0, (i + 1) * r * 2 * math.pi / sides / tv)]
        else: uvs = [(0, i * r * 2 * math.pi / sides / tv), (0, (i + 1) * r * 2 * math.pi / sides / tv), (L / tu, (i + 1) * r * 2 * math.pi / sides / tv), (L / tu, i * r * 2 * math.pi / sides / tv)]
        add_face(B, q, m, uvs)
    for p, sg in ((p0, -1), (p1, 1)):
        q = [ring(p, i) for i in range(sides)]
        n = (q[1] - q[0]).cross(q[2] - q[0])
        if n.dot(ax * sg) < 0: q.reverse()
        add_face(B, q, m, [((v - p).dot(e1) / tu, (v - p).dot(e2) / tv) for v in q])

# ---- pieces placed (layer 3) ----
PMETA = json.load(open(os.path.join(PIECES, 'pieces.json'))) if os.path.exists(os.path.join(PIECES, 'pieces.json')) else {}
placed = []   # (piece name, matrix_world, extra)
def place(name, loc, nrm, scale=(1, 1, 1), part=None, roof=False):
    ang = math.atan2(nrm.y, nrm.x) + math.pi / 2
    M = Matrix.Translation(loc) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Diagonal((*scale, 1))
    placed.append((name, M, 'roof' if roof else part))

# ---- layer 1 + 2: walls by storey ----
stats = dict(windows=0, doors=0)
corner_posts = set()
for k in range(STOREYS):
    outer, inner, framed = look(k); z0 = k * H
    for run in runs:
        f, s0, s1 = jettied(run, k)
        O, A, N = frame_of(run, f)
        if run['kind'] == 'inner': N = N  # partition: both faces inner
        e0, e1 = s0 - T / 2, s1 + T / 2
        ops = sorted(openings(run, k), key=lambda o: o['s'])
        mo = outer if run['kind'] == 'outer' else inner
        def matf(n, mo=mo, N=N, run=run):
            if run['kind'] == 'inner': return inner
            d = n.dot(N)
            return mo if d > -.5 else inner
        zc = [.4 - H / 2] if k == 0 else []
        def wbox(sa, sb, za, zb):
            if sb - sa < 1e-4 or zb - za < 1e-4: return
            c = O + A * ((sa + sb) / 2) + Vector((0, 0, z0 + (za + zb) / 2))
            box(S, c, A, N, Vector((0, 0, 1)), (sb - sa) / 2, T / 2, (zb - za) / 2, matf, zcuts=[z - (za + zb) / 2 for z in ([.4] if k == 0 else []) if za < z < zb])
        cur = e0
        for o in ops:
            a0, a1 = o['s'] - o['w'] / 2, o['s'] + o['w'] / 2
            wbox(cur, a0, 0, H); wbox(a0, a1, 0, o['zb']); wbox(a0, a1, o['zt'], H); cur = a1
            if o['kind'] == 'window': stats['windows'] += 1
            else: stats['doors'] += 1
        wbox(cur, e1, 0, H)
        # plinth: stone along the outside of a ground storey that is not stone already (broken at doors)
        if k == 0 and run['kind'] == 'outer' and outer != 'fieldstone':
            pd = T / 2 + .07; cur = e0 - .05
            for o in [o for o in ops if o['kind'] == 'door'] + [dict(s=e1 + 10, w=0)]:
                end = min(o['s'] - o['w'] / 2, e1 + .05)
                if end > cur:
                    c = O + A * ((cur + end) / 2) + N * (pd / 2) + Vector((0, 0, PLINTH / 2))
                    box(S, c, A, N, Vector((0, 0, 1)), (end - cur) / 2, pd / 2, PLINTH / 2, lambda n: 'fieldstone')
                cur = o['s'] + o['w'] / 2
        # pieces in the openings
        for o in ops:
            loc = O + A * o['s'] + Vector((0, 0, z0 + o['zb']))
            if o['kind'] == 'door':
                place('door', loc, N); place('door_leaf', loc, N, part='leaf')
                if k == 0 and run['kind'] == 'outer' and SPEC.get('porch') and o['rc'] in doors:
                    place('porch', O + A * o['s'] + N * (T / 2 + BT) + Vector((0, 0, z0 + DH + .55)), N)
            else:
                kind = 'window' if (RNG.random() < SPEC.get('leaded', .6) or k > 0) else 'window_shut'
                if k == 0 and STYLE in ('stone_cottage', 'plank_barn'): kind = 'window_shut'
                place(kind, loc + Vector((0, 0, -.06)), N)
        # ---- frame on timber storeys ----
        if framed:
            dpt = T + 2 * BT; zb0 = z0 + (PLINTH if k == 0 and outer != 'siding' else 0)
            PW, PL = .17, .15
            def P(s, z): return O + A * s + Vector((0, 0, z))
            # sill plate (broken at doors) and top plate
            cur = e0
            for o in [o for o in ops if o['kind'] == 'door' and not o.get('upper')] + [dict(s=e1 + 10, w=0)]:
                end = min(o['s'] - o['w'] / 2 - .09, e1)
                if end > cur: beam(S, P(cur, zb0 + PL / 2), P(end, zb0 + PL / 2), N, PL, dpt)
                cur = o['s'] + o['w'] / 2 + .09
            beam(S, P(e0, z0 + H - PL / 2), P(e1, z0 + H - PL / 2), N, PL, dpt)
            # posts: corners, jambs, bays
            posts = [(e0 + PW / 2, .2), (e1 - PW / 2, .2)]
            for o in ops:
                posts += [(o['s'] - o['w'] / 2 - .075, .15), (o['s'] + o['w'] / 2 + .075, .15)]
            bay = SPEC.get('bay', 2) if STYLE != 'plank_barn' else 1
            s = round(s0) + .5
            while s < s1:
                if (s - round(s0) - .5) % bay < 1e-6 and all(abs(s - p) > .45 for p, _ in posts): posts.append((s, .16))
                s += 1
            posts.sort()
            for p, w in posts: beam(S, P(p, zb0 + PL), P(p, z0 + H - PL), N, w, dpt + .01)
            # rails round openings and braces in the panels between posts
            mid = z0 + H * .5
            for o in ops:
                a0, a1 = o['s'] - o['w'] / 2 - .15, o['s'] + o['w'] / 2 + .15
                if o['kind'] == 'window': beam(S, P(a0, z0 + o['zb'] - .05), P(a1, z0 + o['zb'] - .05), N, .1, dpt)
                beam(S, P(a0, z0 + o['zt'] + .06), P(a1, z0 + o['zt'] + .06), N, .12, dpt)
            pat = SPEC.get('braces', 'corner')
            for (pa, wa), (pb, wb) in zip(posts[:-1], posts[1:]):
                sa, sb = pa + wa / 2, pb - wb / 2
                if sb - sa < .45: continue
                if any(sa - .05 < o['s'] < sb + .05 for o in ops): continue
                lo, hi = zb0 + PL, z0 + H - PL
                first, last = abs(pa - (e0 + PW / 2)) < 1e-6, abs(pb - (e1 - PW / 2)) < 1e-6
                if pat == 'corner' or (pat == 'chevron' and (first or last)):
                    if first: beam(S, P(sa + .05, hi - .05), P(sb - .05, lo + .05), N, .13, dpt)
                    elif last: beam(S, P(sa + .05, lo + .05), P(sb - .05, hi - .05), N, .13, dpt)
                    else: beam(S, P(sa, mid), P(sb, mid), N, .11, dpt)
                elif pat == 'chevron':
                    m_ = (sa + sb) / 2; beam(S, P(sa + .05, lo + .05), P(m_, hi - .05), N, .12, dpt); beam(S, P(m_, hi - .05), P(sb - .05, lo + .05), N, .12, dpt)
                elif pat == 'cross':
                    beam(S, P(sa, mid), P(sb, mid), N, .11, dpt)
                    beam(S, P(sa + .04, lo + .04), P(sb - .04, mid - .04), N, .1, dpt); beam(S, P(sa + .04, mid - .04), P(sb - .04, lo + .04), N, .1, dpt + .005)
                elif pat == 'herringbone':
                    beam(S, P(sa, mid), P(sb, mid), N, .11, dpt)
                    beam(S, P(sa + .04, lo + .04), P(sb - .04, mid - .04), N, .1, dpt)
                    beam(S, P(sa + .04, mid + .04), P(sb - .04, hi - .04), N, .1, dpt)
            # jetty: joist ends under a moved line, corbels at the lower storey's posts
            if k > 0 and abs(f - run['fixed']) > 1e-6:
                Ol, _, _ = frame_of(run, run['fixed'])
                s = s0
                while s <= s1 + 1e-6:
                    p0 = Ol + A * s + Vector((0, 0, z0 - .07)); beam(S, p0 - N * (T / 2), p0 + N * (JD + T / 2 + .06), Vector((0, 0, 1)), .12, .12)
                    s += .5
                beam(S, Ol + A * e0 + N * (JD + T / 2 + .06) + Vector((0, 0, z0 - .07)), Ol + A * e1 + N * (JD + T / 2 + .06) + Vector((0, 0, z0 - .07)), N, .14, .1)
                for p in [s0 + .1, s1 - .1] + [x for x in [round(s0) + .5 + i for i in range(int(s1 - s0))] if (x - round(s0) - .5) % 2 < 1e-6 and s0 + .5 < x < s1 - .5]:
                    place('corbel', Ol + A * p + N * (T / 2) + Vector((0, 0, z0 - .13)), N)
        # stone: quoins at the outer corners, timber lintels over openings
        if outer == 'fieldstone' and run['kind'] == 'outer':
            for o in ops:
                beam(S, O + A * (o['s'] - o['w'] / 2 - .14) + Vector((0, 0, z0 + o['zt'] + .08)),
                     O + A * (o['s'] + o['w'] / 2 + .14) + Vector((0, 0, z0 + o['zt'] + .08)), N, .16, T + .03)
            for e, sg in ((e0, 1), (e1, -1)):
                z = z0; i = 0
                while z < z0 + H - .05:
                    hq = min(.26, z0 + H - z); lq = .42 if i % 2 == 0 else .26
                    c = O + A * (e + sg * lq / 2) + N * .0 + Vector((0, 0, z + hq / 2))
                    box(S, c, A, N, Vector((0, 0, 1)), lq / 2 + .012, T / 2 + .022, hq / 2 - .006, lambda n: 'quoin', jit=RNG.uniform(.85, 1.08))
                    z += hq; i += 1
    # floors: ground slab over the inside, a timber floor between storeys
    pass

# ---- floors and roofs per rectangle ----
def rects(cells):
    cells = set(cells); res = []
    rem = set(cells)
    while rem:
        best = None
        for (r, c) in rem:
            for r1 in range(r, R):
                if (r1, c) not in cells: break
                c1 = c
                while all((rr, c1 + 1) in cells for rr in range(r, r1 + 1)): c1 += 1
                a_ = (r1 - r + 1) * (c1 - c + 1)
                if all((rr, cc) in rem for rr in range(r, r1 + 1) for cc in (c, c1)) and (not best or a_ > best[0]): best = (a_, r, c, r1, c1)
        _, r0, c0, r1, c1 = best
        # grow by one cell into neighbours (the shared wall line) where the whole edge is in the footprint
        if res:
            if all((r0 - 1, cc) in cells for cc in range(c0, c1 + 1)): r0 -= 1
            if all((r1 + 1, cc) in cells for cc in range(c0, c1 + 1)): r1 += 1
            if all((rr, c0 - 1) in cells for rr in range(r0, r1 + 1)): c0 -= 1
            if all((rr, c1 + 1) in cells for rr in range(r0, r1 + 1)): c1 += 1
        res.append((r0, c0, r1, c1))
        for rr in range(r0, r1 + 1):
            for cc in range(c0, c1 + 1): rem.discard((rr, cc))
        if len(res) > 6: break
    return res

RECTS = rects(foot)
def rect_xy(rc, k):
    r0, c0, r1, c1 = rc; x0, x1, y0, y1 = X(c0), X(c1), Y(r1), Y(r0)
    if k > 0 and JD:
        for sd in JET.get('sides', ['front']):
            if sd == 'front' and abs(y0 - YMIN) < 1e-6: y0 -= JD
            if sd == 'back' and abs(y1 - YMAX) < 1e-6: y1 += JD
            if sd == 'left' and abs(x0 - XMIN) < 1e-6: x0 -= JD
            if sd == 'right' and abs(x1 - XMAX) < 1e-6: x1 += JD
    return x0, x1, y0, y1

UPZ = Vector((0, 0, 1))
for k in range(STOREYS):
    for rc in RECTS:
        x0, x1, y0, y1 = rect_xy(rc, k)
        if k == 0:
            box(S, Vector(((x0 + x1) / 2, (y0 + y1) / 2, .025)), Vector((1, 0, 0)), Vector((0, 1, 0)), UPZ, (x1 - x0) / 2, (y1 - y0) / 2, .025, lambda n: 'floor')
        else:
            z = k * H
            box(S, Vector(((x0 + x1) / 2, (y0 + y1) / 2, z + .0)), Vector((1, 0, 0)), Vector((0, 1, 0)), UPZ, (x1 - x0) / 2, (y1 - y0) / 2, .05, lambda n: 'floor')
            # joists under it, across the short span
            if x1 - x0 < y1 - y0:
                y = y0 + .3
                while y < y1 - .2: beam(S, Vector((x0, y, z - .12)), Vector((x1, y, z - .12)), Vector((0, 1, 0)), .14, .12); y += .6
            else:
                x = x0 + .3
                while x < x1 - .2: beam(S, Vector((x, y0, z - .12)), Vector((x, y1, z - .12)), Vector((1, 0, 0)), .14, .12); x += .6

# roofs: the biggest rectangle is the main roof; others are wings, their ridge running away from it into
# the main roof up to its ridge line
ZT = STOREYS * H
roof_info = []
main = None
for i, rc in enumerate(RECTS):
    x0, x1, y0, y1 = rect_xy(rc, STOREYS - 1)
    x0 -= T / 2; x1 += T / 2; y0 -= T / 2; y1 += T / 2
    if i == 0:
        main = (x0, x1, y0, y1)
        along = 'x' if (x1 - x0) >= (y1 - y0) else 'y'
        if len(RECTS) > 1:   # ridge perpendicular to the wing
            w = rect_xy(RECTS[1], STOREYS - 1); wing_dir = 'x' if (w[0] >= x1 - T or w[1] <= x0 + T) else 'y'
            along = 'y' if wing_dir == 'x' else 'x'
        if 'ridge' in SPEC: along = SPEC['ridge']
        roof_info.append(dict(x0=x0, x1=x1, y0=y0, y1=y1, along=along, ext={}))
    else:
        mx0, mx1, my0, my1 = main; ma = roof_info[0]['along']
        along = 'x' if ma == 'y' else 'y'
        ext = {}
        if along == 'x':
            mid = (mx0 + mx1) / 2
            if x0 >= mx0 + T and x0 > mid: ext['lo'] = x0 - mid; x0 = mid   # runs into the main roof from +x
            elif x1 <= mx1 - T and x1 < mid: ext['hi'] = mid - x1; x1 = mid
            else:
                if (x0 + x1) / 2 > mid: x0 = mid; ext['lo'] = 1
                else: x1 = mid; ext['hi'] = 1
        else:
            mid = (my0 + my1) / 2
            if (y0 + y1) / 2 > mid: y0 = mid; ext['lo'] = 1
            else: y1 = mid; ext['hi'] = 1
        roof_info.append(dict(x0=x0, x1=x1, y0=y0, y1=y1, along=along, ext=ext))

def roof(ri):
    x0, x1, y0, y1, al = ri['x0'], ri['x1'], ri['y0'], ri['y1'], ri['along']
    # work in a frame where the ridge runs along +u: (u, v) -> world
    if al == 'x': u0, u1, v0, v1 = x0, x1, y0, y1; U = Vector((1, 0, 0)); V = Vector((0, 1, 0))
    else: u0, u1, v0, v1 = y0, y1, x0, x1; U = Vector((0, 1, 0)); V = Vector((1, 0, 0))
    W = lambda u, v, z: U * u + V * v + Vector((0, 0, z))
    half = (v1 - v0) / 2; vc = (v0 + v1) / 2; tn = math.tan(PITCH)
    zr = ZT + half * tn
    lo_ext = VERGE if 'lo' not in ri['ext'] else 0
    hi_ext = VERGE if 'hi' not in ri['ext'] else 0
    ul, uh = u0 - lo_ext, u1 + hi_ext
    rm = lambda n: ROOFMAT if n.z > .3 else ('floor' if n.z < -.3 else (ROOFMAT if ROOF == 'thatch' else 'timber'))
    for sg in (-1, 1):   # the two slopes: sg -1 eave at v0
        ve = vc + sg * (half + OV); ze = ZT - OV * tn
        ext = RT * tn * .9
        vr = vc - sg * ext; zrr = zr + ext * tn
        pe, pr = W(0, ve, ze), W(0, vr, zrr)
        up = (pr - pe).normalized()
        nrm = (V * sg * math.sin(PITCH) + Vector((0, 0, math.cos(PITCH)))).normalized()
        c = (pe + pr) / 2 + nrm * (RT / 2) + U * ((ul + uh) / 2)
        box(RF, c, U, -up, nrm, (uh - ul) / 2, (pr - pe).length / 2, RT / 2, rm, uv='local')
        if ROOF == 'thatch':   # a rolled eave: the thatch's thick, rounded lower edge
            pe2 = pe + nrm * (RT * .5) - up * .02
            cyl(RF, W(ul, 0, 0) + pe2, W(uh, 0, 0) + pe2, RT * .62, 'thatch', squash=.8)
        if ROOF != 'thatch':
            for uu, ext_ in ((ul, lo_ext), (uh, hi_ext)):
                if not ext_: continue
                beam(RF, W(uu, ve, ze) + nrm * (RT - .11), W(uu, vc, zr) + nrm * (RT - .11), U, .24, .06)
    # ridge
    zc = zr + RT / math.cos(PITCH) - .02
    rr = .16 if ROOF != 'thatch' else .3
    d1 = (V + Vector((0, 0, 1))).normalized(); d2 = (-V + Vector((0, 0, 1))).normalized()
    if ROOF == 'thatch': cyl(RF, W(ul + .05, vc, zc - rr * .45), W(uh - .05, vc, zc - rr * .45), rr * .75, 'thatch', squash=.7)
    else: box(RF, W((ul + uh) / 2, vc, zc - rr * .3), U, d1, d2, (uh - ul) / 2 + .02, rr / 2, rr / 2, lambda n: 'timber', uv='local')
    # gables (not at an end that runs into another roof)
    for uu, key, sg in ((u0, 'lo', -1), (u1, 'hi', 1)):
        if key in ri['ext']: continue
        uw = uu - sg * T / 2
        o = W(uw, 0, 0)
        if al == 'x': along_v, nrm_g = Vector((0, 1, 0)), Vector((sg, 0, 0))
        else: along_v, nrm_g = Vector((1, 0, 0)), Vector((0, sg, 0))
        pts = [(v0, ZT), (v1, ZT), (vc, zr)]
        prism(RF, pts, o, along_v, nrm_g, T, lambda n: GABLE if n.dot(nrm_g) > 0 else ('plaster' if GABLE != 'siding' else 'siding'), GABLE)
        if look(STOREYS - 1)[2] or STYLE == 'stone_timber':
            dpt = T + 2 * BT
            P = lambda v, z: o + along_v * v + Vector((0, 0, z))
            beam(RF, P(v0, ZT + .07), P(v1, ZT + .07), nrm_g, .14, dpt)
            beam(RF, P(vc, ZT + .14), P(vc, zr - .05), nrm_g, .16, dpt)
            zcol = ZT + (zr - ZT) * .55; hw = half * .45
            beam(RF, P(vc - hw, zcol), P(vc + hw, zcol), nrm_g, .12, dpt)
            if STYLE != 'plank_barn':
                beam(RF, P(vc - .08, ZT + (zcol - ZT) * .25), P(vc - hw * .8, ZT + .14), nrm_g, .1, dpt)
                beam(RF, P(vc + .08, ZT + (zcol - ZT) * .25), P(vc + hw * .8, ZT + .14), nrm_g, .1, dpt)
            if 'window' and half > 1.6 and SPEC.get('gableWindow', True):
                place('window_shut' if STYLE == 'plank_barn' else 'window', P(vc, ZT + .3) + nrm_g * .0, nrm_g, (.85, 1, .85), roof=True)
    ri.update(zr=zr, vc=vc, U=U, V=V, u0=u0, u1=u1, v0=v0, v1=v1)

for ri in roof_info: roof(ri)

# chimney, dormers, sign, stair on the main roof / walls
m0 = roof_info[0]
if SPEC.get('chimney'):
    sg = 1 if SPEC['chimney'] == 'right' else -1
    U, V = m0['U'], m0['V']
    uu = (m0['u1'] - .7) if sg > 0 else (m0['u0'] + .7)
    ztop = m0['zr'] + .9; zb = max(ZT - .2, ztop - 2.6 * 1.25)   # stretched at most 1.25x; the foot is hidden in the roof
    place('chimney', U * uu + V * (m0['vc'] + .25) + Vector((0, 0, zb)), -V, (1, 1, (ztop - zb) / 2.6), roof=True)
for i in range(SPEC.get('dormers', 0)):
    U, V = m0['U'], m0['V']; L = m0['u1'] - m0['u0']
    uu = m0['u0'] + L * (i + 1) / (SPEC['dormers'] + 1)
    half = (m0['v1'] - m0['v0']) / 2; tn = math.tan(PITCH)
    dd = PMETA.get('dormer', {}).get('box', [1.1, 1.17, 1.25])[1]   # its depth: the front stands at the wall face,
    vv = m0['v0'] + .05 + dd; zz = ZT + .05 * tn - .05                 # the back buried in the roof
    place('dormer', U * uu + V * vv + Vector((0, 0, zz)), -V, roof=True)
if SPEC.get('sign'):
    rc = SPEC['sign']; run = [r for r in runs if tuple(rc) in r['cells'] and r['kind'] == 'outer'][0]
    f, s0, s1 = jettied(run, 0); O, A, N = frame_of(run, f)
    place('sign', O + A * s_of(run, tuple(rc)) + N * (T / 2 + BT) + Vector((0, 0, H - .25)), N)
if SPEC.get('stair'):
    st_ = SPEC['stair']; rc = tuple(st_['cell']); run = [r for r in runs if rc in r['cells'] and r['kind'] == 'outer'][0]
    f, s0, s1 = jettied(run, 0); O, A, N = frame_of(run, f)
    sgn = st_.get('dir', -1)
    # the top step at the upper door, the flight running along the wall
    L = PMETA.get('stair', {}).get('box', [2.7])[0]   # the flight spans +x from its origin, the top step at +x
    place('stair', O + A * (s_of(run, rc) - .5 - L) + N * (T / 2 + .01), N)

# ---- objects per material ----
def make_mat(m):
    mat = bpy.data.materials.get('kit_' + m)
    if mat: return mat
    mat = bpy.data.materials.new('kit_' + m); mat.use_nodes = True; nt = mat.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = .9
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    nt.links.new(ca.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    if not NOTEX and os.path.exists(f'{TEX}/{m}_color.jpg'):
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(f'{TEX}/{m}_color.jpg'); nt.links.new(ti.outputs['Color'], mix.inputs[6])
        tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = bpy.data.images.load(f'{TEX}/{m}_rough.jpg'); tr.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(tr.outputs['Color'], b.inputs['Roughness'])
        tn_ = nt.nodes.new('ShaderNodeTexImage'); tn_.image = bpy.data.images.load(f'{TEX}/{m}_normal.png'); tn_.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn_.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    else:
        mix.inputs[6].default_value = {'plaster': (.8, .74, .6, 1), 'timber': (.2, .14, .1, 1)}.get(m, (.5, .5, .5, 1))
    return mat

coll = bpy.context.scene.collection
root = bpy.data.objects.new(NAME, None); coll.objects.link(root)
tris = {}
for B, pre in ((S, ''), (RF, 'roof_')):
    bm = B.bm
    for m in MATS:
        fs = [f for f in bm.faces if f.material_index == MI[m]]
        if not fs: continue
        nb = bm.copy()
        bmesh.ops.delete(nb, geom=[f for f in nb.faces if f.material_index != MI[m]], context='FACES')
        bmesh.ops.remove_doubles(nb, verts=nb.verts[:], dist=1e-5)
        for f in nb.faces: f.material_index = 0
        me = bpy.data.meshes.new(f'{NAME}_{pre}{m}'); nb.to_mesh(me); nb.free()
        me.materials.append(make_mat(m))
        ob = bpy.data.objects.new(f'{NAME}_{pre}{m}', me); coll.objects.link(ob); ob.parent = root
        tris[pre + m] = sum(len(p.vertices) - 2 for p in me.polygons)

# hero pieces: one mesh each, linked duplicates
srcs = {}
def piece_src(name):
    if name in srcs: return srcs[name]
    p = os.path.join(PIECES, name + '.glb')
    obs = []
    if os.path.exists(p):
        before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=p)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
        for o in obs:
            o.parent = None; o.matrix_world = Matrix()
            coll.objects.unlink(o) if o.name in coll.objects else [c.objects.unlink(o) for c in o.users_collection]
    else:   # a stand-in box of the piece's size
        dims = {'door': (1.0, .3, 1.8), 'door_leaf': (.8, .06, 1.6), 'window': (.8, .3, .86), 'window_shut': (.8, .3, .86),
                'chimney': (.75, .6, 2.6), 'dormer': (1.1, 1.0, 1.3), 'porch': (1.4, .8, .5), 'sign': (.7, .7, .9),
                'corbel': (.16, .35, .4), 'stair': (2.4, .8, 2.2)}[name]
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts: v.co = Vector((v.co.x * dims[0], v.co.y * dims[1], (v.co.z + .5) * dims[2]))
        me = bpy.data.meshes.new('piece_' + name); bm.to_mesh(me); bm.free(); me.materials.append(make_mat('timber'))
        obs = [bpy.data.objects.new('piece_' + name, me)]
    srcs[name] = obs
    return obs

counts = {}
for name, M, part in placed:
    off = Matrix.Translation(Vector(PMETA.get(name, {}).get('offset', (0, 0, 0))))
    for o in piece_src(name):
        d = o.copy(); d.data = o.data; d.matrix_world = M @ off @ o.matrix_world
        d.name = f'{NAME}_{"roof_" if part == "roof" else ""}{name}_{counts.get(name, 0)}'; coll.objects.link(d); d.parent = root; d.matrix_parent_inverse = Matrix()
    counts[name] = counts.get(name, 0) + 1
piece_tris = {n: sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs) for n, obs in srcs.items()}

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='JPEG' if not NOTEX else 'NONE',
                          export_materials='EXPORT', export_apply=False, export_vertex_color='MATERIAL', export_tangents=False)
total = sum(tris.values()) + sum(piece_tris[n] * c for n, c in counts.items())
print('STATS ' + json.dumps(dict(name=NAME, struct_tris=tris, piece_tris=piece_tris, piece_counts=counts, total_tris=total,
                                 rects=RECTS, runs=len(runs), size=os.path.getsize(OUT), **stats)))
