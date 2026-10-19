# shared: parse the diagram SVG into leaf elements with colour and bbox
import re, xml.etree.ElementTree as ET
NS = '{http://www.w3.org/2000/svg}'; XL = '{http://www.w3.org/1999/xlink}href'
ET.register_namespace('', 'http://www.w3.org/2000/svg'); ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
def nums(t): return [float(x) for x in re.findall(r'-?[\d.]+(?:e-?\d+)?', t)]
def load(path):
    tree = ET.parse(path); root = tree.getroot()
    parent = {c: p for p in root.iter() for c in p}
    leaves = []
    def walk(el, fill, stroke, defs):
        tag = el.tag.replace(NS, '')
        if tag == 'defs': defs = True
        f = el.get('fill', fill); st = el.get('stroke', stroke)
        if tag in ('path', 'use', 'rect', 'image') and not defs:
            col = f if f and f != 'none' else st
            leaves.append((el, tag, col, bbox(el, tag)))
        for c in el: walk(c, f, st, defs)
    walk(root, None, None, False)
    return tree, root, parent, leaves
def bbox(el, tag):
    if tag == 'use':
        x, y = float(el.get('x', 0)), float(el.get('y', 0)); return (x, y - 7, x + 6, y + 2)
    if tag == 'rect':
        x, y = float(el.get('x', 0)), float(el.get('y', 0)); return (x, y, x + float(el.get('width', 0)), y + float(el.get('height', 0)))
    n = nums(el.get('d', '')); xs, ys = n[0::2], n[1::2]
    if not xs: return (0, 0, 0, 0)
    tr = el.get('transform')
    A = nums(tr) if tr and 'matrix' in tr else [1, 0, 0, 1, 0, 0]
    X = [A[0]*x + A[2]*y + A[4] for x, y in zip(xs, ys)]; Y = [A[1]*x + A[3]*y + A[5] for x, y in zip(xs, ys)]
    return (min(X), min(Y), max(X), max(Y))
