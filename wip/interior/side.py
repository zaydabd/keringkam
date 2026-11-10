import sys
from PIL import Image, ImageDraw, ImageFont
S, tag = sys.argv[1], sys.argv[2]
refs = sys.argv[3:] or [S + '/sarawak/big/in_veranda1.jpg']
shot = Image.open(f'{S}/in-{tag}.png').convert('RGB')
H = 520
tiles = [Image.open(r).convert('RGB') for r in refs] + [shot]
tiles = [t.resize((int(t.width * H / t.height), H)) for t in tiles]
W = sum(t.width for t in tiles) + 16 * (len(tiles) + 1)
out = Image.new('RGB', (W, H + 32), (24, 22, 20)); x = 16
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16); d = ImageDraw.Draw(out)
names = [r.split('/')[-1] for r in refs] + [f'render: {tag}']
for t, n in zip(tiles, names):
    out.paste(t, (x, 8)); d.text((x, H + 10), n, fill=(236, 229, 218), font=f); x += t.width + 16
out.save(f'{S}/side-{tag}.jpg', quality=85)
