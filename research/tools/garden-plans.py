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
