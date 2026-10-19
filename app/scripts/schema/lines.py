# Extract the diagram's stroked line paths per colour, route consecutive stop groups along them.
import re, json, sys, math, heapq, collections
svg, app, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(svg).read()
COL = {  # route -> rgb() fragment of its stroke
 'L1731': '97.50824%', 'L1732': '93.592834%', 'L1733': '31.558228%', 'L1736': '46.27533%',
 'L1737': '45.960999%', 'L1734': '0%, 65.098572%', 'L1735': '50%, 79.998779%'}
def num(t): return [float(x) for x in re.findall(r'-?[\d.]+(?:e-?\d+)?', t)]
def bez(p0, p1, p2, p3, n=12):
    return [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i/n for i in range(1, n+1))]
def parse(d):
    polys, cur, pos = [], [], (0, 0)
    for cmd, args in re.findall(r'([MLCZ])([^MLCZ]*)', d):
        a = num(args)
        if cmd == 'M':
            if len(cur) > 1: polys.append(cur)
            pos = (a[0], a[1]); cur = [pos]
        elif cmd == 'L':
            for i in range(0, len(a), 2): pos = (a[i], a[i+1]); cur.append(pos)
        elif cmd == 'C':
            for i in range(0, len(a), 6):
                cur += bez(pos, (a[i], a[i+1]), (a[i+2], a[i+3]), (a[i+4], a[i+5])); pos = cur[-1]
        elif cmd == 'Z' and cur: cur.append(cur[0])
    if len(cur) > 1: polys.append(cur)
    return polys
strokes = collections.defaultdict(list)
for el in re.findall(r'<path\b[^>]*>', s):
    m = re.search(r'stroke="rgb\(([^)]*)\)"', el); w = re.search(r'stroke-width="([\d.]+)"', el)
    if not m or not w or abs(float(w.group(1)) - 2.283) > .01: continue
    d = re.search(r' d="([^"]*)"', el).group(1)
    tr = re.search(r'transform="matrix\(([^)]*)\)"', el)
    A = num(tr.group(1)) if tr else [1, 0, 0, 1, 0, 0]
    for poly in parse(d):
        strokes[m.group(1)].append([(A[0]*x + A[2]*y + A[4], A[1]*x + A[3]*y + A[5]) for x, y in poly])
EXTRA = {'L1736': '64.828491%', 'L1734': '19.644165%'}
def polys_for(r): return [q for k in strokes if k.startswith(COL[r]) or (r in EXTRA and k.startswith(EXTRA[r])) for q in strokes[k]]
POS = json.load(open(f'{app}/src/v3/schemaStops.json'))
stops = json.load(open(f'{app}/public/data/stops.json'))['stops']
groups = json.load(open(f'{app}/public/data/groups.json')); groups = groups['groups'] if isinstance(groups, dict) else groups
pats = json.load(open(f'{app}/public/data/timetable.json'))['patterns']
lines = json.load(open(f'{app}/public/data/lines.json'))['lines']
seqs = collections.defaultdict(set)
for p in pats + [dict(routeId=l['routeId'], stops=d['stops']) for l in lines for d in l['directions']]:
    gs = [groups[stops[i]['group']]['id'] for i in p['stops']]
    gs = [g for i, g in enumerate(gs) if i == 0 or g != gs[i-1]]
    for a, b in zip(gs, gs[1:]): seqs[p['routeId']].add((a, b))
def build(polys):
    # nodes = rounded points; edges along polylines; join endpoints within 1.5 pt of any vertex
    nodes, adj = [], collections.defaultdict(list)
    idx = {}
    def node(p):
        k = (round(p[0], 2), round(p[1], 2))
        if k not in idx: idx[k] = len(nodes); nodes.append(p)
        return idx[k]
    for poly in polys:
        dense = [poly[0]]
        for q in poly[1:]:
            n = max(1, int(math.dist(dense[-1], q) / 1.0))
            a = dense[-1]; dense += [(a[0] + (q[0]-a[0])*i/n, a[1] + (q[1]-a[1])*i/n) for i in range(1, n+1)]
        ids = [node(p) for p in dense]
        for a, b in zip(ids, ids[1:]):
            if a != b:
                w = math.dist(nodes[a], nodes[b]); adj[a].append((b, w)); adj[b].append((a, w))
    ends = [i for i in range(len(nodes)) if len(adj[i]) <= 1]
    for e in ends:
        for j in range(len(nodes)):
            if j != e and math.dist(nodes[e], nodes[j]) < 2.5 and all(j != b for b, _ in adj[e]):
                w = math.dist(nodes[e], nodes[j]) + .01; adj[e].append((j, w)); adj[j].append((e, w))
    return nodes, adj
def nearest(nodes, p): return min(range(len(nodes)), key=lambda i: math.dist(nodes[i], p))
def dijkstra(nodes, adj, a, b):
    dist, prev, q = {a: 0}, {}, [(0, a)]
    while q:
        d, u = heapq.heappop(q)
        if u == b: break
        if d > dist[u]: continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18): dist[v] = d + w; prev[v] = u; heapq.heappush(q, (d + w, v))
    if b not in dist: return None
    path = [b]
    while path[-1] != a: path.append(prev[path[-1]])
    return [nodes[i] for i in reversed(path)], dist[b]
def rdp(pts, eps=.25):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; L = math.dist(a, b) or 1e-9
    dm, im = 0, 0
    for i in range(1, len(pts)-1):
        p = pts[i]; dd = abs((b[0]-a[0])*(a[1]-p[1]) - (a[0]-p[0])*(b[1]-a[1])) / L
        if dd > dm: dm, im = dd, i
    return rdp(pts[:im+1], eps)[:-1] + rdp(pts[im:], eps) if dm > eps else [a, b]
res, report, snap = {}, [], {}
for r, pairs in seqs.items():
    nodes, adj = build(polys_for(r))
    for ga, gb in sorted(pairs):
        if ga not in POS or gb not in POS: continue
        pa, pb = POS[ga], POS[gb]
        na, nb = nearest(nodes, pa), nearest(nodes, pb)
        da, db = math.dist(nodes[na], pa), math.dist(nodes[nb], pb)
        got = dijkstra(nodes, adj, na, nb)
        straight = math.dist(pa, pb)
        if not got or da > 26 or db > 26 or got[1] > 3 * straight + 15:
            report.append(f'{r} {ga}>{gb} FAIL snap {da:.1f}/{db:.1f} len {got and round(got[1])} vs {straight:.0f}'); continue
        pts = rdp(got[0])
        snap[f'{r}:{ga}'] = [round(nodes[na][0], 1), round(nodes[na][1], 1)]; snap[f'{r}:{gb}'] = [round(nodes[nb][0], 1), round(nodes[nb][1], 1)]
        res[f'{r}:{ga}>{gb}'] = [[round(x, 1), round(y, 1)] for x, y in pts]
        if got[1] > 1.6 * straight + 6: report.append(f'{r} {ga}>{gb} long {got[1]:.0f} vs {straight:.0f}')
json.dump({'at': snap, 'paths': res}, open(out, 'w'), separators=(',', ':'))
print(len(res), 'pairs;', sum(len(v) for v in res.values()), 'points'); print('\n'.join(report))
print({k: len(v) for k, v in strokes.items()})
