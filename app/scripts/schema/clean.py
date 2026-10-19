# Strip the diagram down to lines, stops and their names (python3 clean.py in.svg out.svg)
import sys; sys.path.insert(0, __file__.rsplit('/', 1)[0])
from svgel import *
tree, root, parent, leaves = load(sys.argv[1])
DROP = {  # colour prefixes of things that are not the network
    '87.059021%': 'roads, D1', '43.061829%': 'other towns', '61.178589%': 'POIs, pictograms, footpath, validity',
    '69.805908%': 'pictogram box', '95.68634%': 'legend panel', '39.610291%': 'legend text',
    '75%, 91.7': 'water', '48.170471%': 'water names', '0%, 0%, 0%': 'crop marks'}
def drop(el, tag, col, bb):
    el_sw = lambda _: el.get('stroke-width')
    if col and any(col.startswith('rgb(' + k) for k in DROP): return True
    x0, y0, x1, y1 = bb
    dark = col and col.startswith('rgb(13.729858%')
    # the railway (hatched) with its arrowheads and the PRAHA / BENEŠOV labels at its ends
    if dark and tag == 'path' and el_sw(bb) == '3.806': return True
    if dark and (255 <= x0 and x1 <= 285 and 50 <= y0 and y1 <= 75): return True
    if dark and (455 <= x0 and x1 <= 495 and 400 <= y0 and y1 <= 425): return True
    if x1 < 205 and y1 < 350: return True          # logo, legend, QR code
    if x1 < 30 or x0 > 705 or y1 < 22 or y0 > 508: return True  # crop marks
    return False
gone = 0
for el, tag, col, bb in leaves:
    if drop(el, tag, col, bb): parent[el].remove(el); gone += 1
# empty groups
changed = True
while changed:
    changed = False
    for p in list(root.iter()):
        for c in list(p):
            if c.tag == NS + 'g' and len(c) == 0: p.remove(c); changed = True
tree.write(sys.argv[2], xml_declaration=True, encoding='UTF-8')
print('dropped', gone)
# drop glyphs and clip paths nothing uses any more
tree, root, parent, leaves = load(sys.argv[2])
s = open(sys.argv[2]).read()
used = set(re.findall(r'(?:href="#|url\(#)([^")]+)', s))
n = 0
for el in list(root.iter()):
    i = el.get('id')
    if i and i not in used and el in parent and (i.startswith('glyph') or i.startswith('clip')):
        parent[el].remove(el); n += 1
tree.write(sys.argv[2], xml_declaration=True, encoding='UTF-8')
s = re.sub(r'>\s+<', '><', open(sys.argv[2]).read()); open(sys.argv[2], 'w').write(s)
print('pruned defs', n)
