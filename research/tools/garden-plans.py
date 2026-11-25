# Draws the garden layouts as top-down plans, river at the top (from garden-plans.mjs's JSON).
#   node research/tools/garden-plans.mjs > plans.json && python3 research/tools/garden-plans.py plans.json out.png
import json, sys
from PIL import Image, ImageDraw, ImageFont

data = json.load(open(sys.argv[1]))
out = sys.argv[2]
S = 62  # pixels a metre
XMIN, XMAX, ZMIN, ZMAX = -7.2, 4.6, -9.2, 2.4
W, H = int((XMAX - XMIN) * S), int((ZMAX - ZMIN) * S)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except OSError:
    font = big = ImageFont.load_default()

def P(x, z):
    return ((x - XMIN) * S, (z - ZMIN) * S)

def plan(key, lay):
    im = Image.new('RGB', (W, H + 40), '#ffffff')
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle([0, 0, W, H], fill='#cfe3a8')  # the terrace's grass
    d.rectangle([*P(XMIN, ZMIN), *P(XMAX, data['bankFoot'])], fill='#b9cf8e')  # the street's grass
    d.rectangle([*P(XMIN, data['bankFoot']), *P(XMAX, data['terraceEdge'])], fill='#a9c27c')  # the bank
    d.text(P(XMIN + 0.2, ZMIN + 0.15), 'to the street and the river', fill='#3b5a2a', font=font)
    d.text(P(XMIN + 0.2, data['bankFoot'] + 0.25), 'grass bank', fill='#3b5a2a', font=font)
    for bed in lay['beds']:
        d.polygon([P(x, z) for x, z in bed], fill='#8a6a4a', outline='#5a4630')
    w = data['walls']
    d.rectangle([*P(w['X0'], w['Z0']), *P(w['X1'], w['Z1'])], fill='#e9d3a6', outline='#6b4a2a', width=5)
    for win in data['windows']:
        if win['wall'] == 'river':
            d.line([P(win['a0'], w['Z0']), P(win['a1'], w['Z0'])], fill='#4aa3df', width=7)
        else:
            d.line([P(w['X1'], win['a0']), P(w['X1'], win['a1'])], fill='#4aa3df', width=7)
    dr = data['door']
    d.line([P(dr['x'] - dr['w'] / 2, w['Z1']), P(dr['x'] + dr['w'] / 2, w['Z1'])], fill='#7a3b1e', width=8)
    d.text(P(-2.4, -2.4), 'HOUSE', fill='#6b4a2a', font=big)
    d.text(P(dr['x'] - 0.4, w['Z1'] + 0.15), 'door', fill='#7a3b1e', font=font)
    d.ellipse([*P(-0.08, -0.08), *P(0.08, 0.08)], fill='#333')
    d.text(P(0.12, -0.25), 'seat', fill='#333', font=font)
    # plant slots, tallest last so they draw on top
    for sl in sorted(lay['slots'], key=lambda s: s['h']):
        col = data['layers'][sl['layer']]['colour']
        x, z = sl['at']
        if sl.get('shape') == 'box':
            d.rectangle([*P(x - sl['w'] / 2, z - sl['d'] / 2), *P(x + sl['w'] / 2, z + sl['d'] / 2)], fill=col + 'd0', outline='#2a3a20')
        else:
            d.ellipse([*P(x - sl['rx'], z - sl['rz']), *P(x + sl['rx'], z + sl['rz'])], fill=col + 'c8', outline='#2a3a20')
    d.rectangle([0, H, W, H + 40], fill='#ffffff')
    d.text((10, H + 8), lay['label'], fill='#111', font=big)
    return im

ims = [plan(k, v) for k, v in data['layouts'].items()]
cols = 2
rows = (len(ims) + 1) // 2
legend_h = 34 * (len(data['layers']) + 1)
sheet = Image.new('RGB', (cols * W + 30, rows * (H + 40) + 30 + legend_h), '#ffffff')
for i, im in enumerate(ims):
    sheet.paste(im, (10 + (i % cols) * (W + 10), 10 + (i // cols) * (H + 50)))
d = ImageDraw.Draw(sheet)
y = rows * (H + 50) + 10
d.text((20, y), 'Legend (plan only: no plants yet). Brown = bed, blue = window, 1 square metre = %d px' % S, fill='#111', font=font)
for k, L in data['layers'].items():
    y += 30
    d.rectangle([20, y, 44, y + 20], fill=L['colour'], outline='#333')
    d.text((54, y + 2), '%s: %s' % (k, L['label']), fill='#111', font=font)
sheet.save(out)
print(out, sheet.size)

# --- One layout in detail (third argument: its key): plan, front view and side section ----------
if len(sys.argv) > 3:
    key = sys.argv[3]
    lay = data['layouts'][key]
    w = data['walls']
    T = data['terrace']
    E = 70  # px a metre in the two views

    class Fixed:
        # ImageDraw with boxes given corner to corner in any order (the front view runs x backwards)
        def __init__(self, d):
            self.d = d
        def _box(self, c):
            x0, y0, x1, y1 = c
            return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]
        def rectangle(self, c, **k):
            self.d.rectangle(self._box(c), **k)
        def ellipse(self, c, **k):
            self.d.ellipse(self._box(c), **k)
        def __getattr__(self, n):
            return getattr(self.d, n)

    def front():
        # the river wall seen from the river: x runs right to left (we stand at -z looking +z)
        xa, xb, ya, yb = 4.6 + 9, -7.2 - 9, -1.0, 10.0
        Wd, Hd = int((xa - xb) * E * 0.55), int((yb - ya) * E * 0.55)
        k = E * 0.55
        F = lambda x, y: ((xa - x) * k, (yb - y) * k)
        im = Image.new('RGB', (Wd, Hd + 40), '#ffffff')
        d = Fixed(ImageDraw.Draw(im, 'RGBA'))
        d.rectangle([0, 0, Wd, Hd], fill='#dfeefa')
        d.rectangle([*F(xa, T), *F(xb, ya)], fill='#cfe3a8')
        # the wall, windows, eaves and roof
        d.rectangle([*F(w['X0'], 3.1), *F(w['X1'], -0.12)], fill='#d9a352', outline='#6b4a2a', width=2)
        d.rectangle([*F(w['X0'], -0.12), *F(w['X1'], T)], fill='#a29d93')
        d.polygon([F(w['X0'] - data['eaveOut'], data['eave']), F(w['X1'] + data['eaveOut'], data['eave']), F((w['X0'] + w['X1']) / 2 + 1.2, data['ridge']), F((w['X0'] + w['X1']) / 2 - 1.2, data['ridge'])], fill='#a4442c')
        for win in data['windows']:
            if win['wall'] == 'river':
                d.rectangle([*F(win['a0'], data['window']['y1']), *F(win['a1'], 0)], fill='#4a5866', outline='#ffffff', width=3)
                d.line([F(win['a0'], data['window']['lattice']), F(win['a1'], data['window']['lattice'])], fill='#8a5a3a', width=3)
        d.line([F(xa, 0), F(xb, 0)], fill='#999', width=1)
        d.text(F(xa - 0.1, 0.15), 'floor 0 m', fill='#555', font=font)
        d.text(F(xa - 0.1, 1.25), 'lattice top 1.1 m', fill='#8a5a3a', font=font)
        for sl in sorted(lay['slots'], key=lambda s: -s['at'][1]):  # far ones first
            col = data['layers'][sl['layer']]['colour']
            x, h = sl['at'][0], sl['h']
            rx = sl.get('rx', sl.get('w', 1) / 2)
            d.ellipse([*F(x - rx, T + h), *F(x + rx, T)], fill=col + 'c0', outline='#2a3a20')
        d.text((10, Hd + 8), 'Front: the river wall seen from the river', fill='#111', font=big)
        return im

    def section():
        # a cut through the middle window, looking along -x: z runs left (river) to right (room)
        za, zb, ya, yb = -9.0, 1.5, -2.2, 4.4
        k = E * 0.95
        Wd, Hd = int((zb - za) * k), int((yb - ya) * k)
        F = lambda z, y: ((z - za) * k, (yb - y) * k)
        im = Image.new('RGB', (Wd, Hd + 40), '#ffffff')
        d = Fixed(ImageDraw.Draw(im, 'RGBA'))
        d.rectangle([0, 0, Wd, Hd], fill='#dfeefa')
        d.polygon([F(za, data['street']), F(data['bankFoot'], data['street']), F(data['terraceEdge'], T), F(zb, T), F(zb, ya), F(za, ya)], fill='#cfe3a8')
        r = data['room']
        d.rectangle([*F(w['Z0'], 0), *F(zb, -0.12)], fill='#a06e50')  # floor
        d.rectangle([*F(w['Z0'], -0.12), *F(w['Z0'] + 0.2, T)], fill='#a29d93')  # plinth
        d.rectangle([*F(w['Z0'], 3.1), *F(r['z0'], data['window']['y1'])], fill='#d9a352')  # wall above the window
        d.rectangle([*F(r['z0'] - 0.03, data['window']['lattice']), *F(r['z0'] + 0.03, 0)], fill='#8a5a3a')  # lattice
        d.line([F(w['Z0'] - data['eaveOut'], data['eave']), F(w['Z0'] + 2.2, data['eave'] + 2.2 * 0.7)], fill='#a4442c', width=6)
        d.rectangle([*F(r['z0'], r['top']), *F(zb, r['top'] - 0.03)], fill='#6e5646')  # ceiling
        x = -0.475
        for sl in lay['slots']:
            rx = sl.get('rx', sl.get('w', 1) / 2)
            if abs(sl['at'][0] - x) > rx or sl['layer'] == 'tree':
                continue
            col = data['layers'][sl['layer']]['colour']
            rz = sl.get('rz', sl.get('d', 1) / 2)
            d.ellipse([*F(sl['at'][1] - rz, T + sl['h']), *F(sl['at'][1] + rz, T)], fill=col + 'c0', outline='#2a3a20')
        import math
        def ray(eye, deg, colour, label):
            ez, ey = eye[2], eye[1]
            t = math.tan(math.radians(deg))
            z1 = za
            d.line([F(ez, ey), F(z1, ey + (ez - z1) * t)], fill=colour, width=2)
            d.ellipse([*F(ez - 0.06, ey + 0.06), *F(ez + 0.06, ey - 0.06)], fill=colour)
            d.text(F(ez + 0.08, ey + 0.25), label, fill=colour, font=font)
        se, we = data['eyes']['seat'], data['eyes']['window']
        # seat: rays through the window's bottom and over the lattice; window shot: its lowest ray
        for y, lab in [(0, ''), (data['window']['lattice'], '')]:
            deg = math.degrees(math.atan2(y - se['at'][1], -(r['z0'] - se['at'][2])))
            ray(se['at'], deg, '#1f4e9a', 'seat eye (0.9 m)' if y == 0 else '')
        ray(we['at'], we['bottom'], '#b0302a', 'window-shot eye (1.5 m): lowest ray')
        d.text(F(za + 0.1, data['street'] + 0.25), 'street', fill='#3b5a2a', font=font)
        d.text(F(data['terraceEdge'] + 0.2, T + 0.25), 'terrace', fill='#3b5a2a', font=font)
        d.text((10, Hd + 8), 'Side cut through the middle window (river on the left)', fill='#111', font=big)
        return im

    p = plan(key, lay)
    f = front()
    c = section()
    Wt = max(p.width + c.width, f.width) + 30
    sheet = Image.new('RGB', (Wt, max(p.height, c.height) + f.height + 40 + legend_h), '#ffffff')
    sheet.paste(p, (10, 10))
    sheet.paste(c, (p.width + 20, 10))
    sheet.paste(f, (10, max(p.height, c.height) + 20))
    d = ImageDraw.Draw(sheet)
    y = max(p.height, c.height) + f.height + 30
    for k2 in sorted({s['layer'] for s in lay['slots']}):
        L = data['layers'][k2]
        d.rectangle([20, y, 44, y + 20], fill=L['colour'], outline='#333')
        d.text((54, y + 2), '%s: %s' % (k2, L['label']), fill='#111', font=font)
        y += 30
    sheet.save(sys.argv[2].replace('.png', '-%s.png' % key))
    print('detail', sheet.size)
