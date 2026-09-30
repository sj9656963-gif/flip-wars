# 앱 아이콘 만들기: python pwa/make_icons.py
# 어두운 배경 위에 파랑·빨강으로 반씩 나뉜 격자 판, 경계를 뚫고 가는 빛나는 공.
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

BG = (10, 15, 30)
BLUE = (59, 130, 246)
RED = (239, 68, 68)
GRAY = (139, 146, 158)


def draw(size: int, pad: float) -> Image.Image:
    s = size * 4
    im = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(im)
    # 판 아래 푸른 빛
    glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([s * 0.12, s * 0.12, s * 0.88, s * 0.88], fill=(60, 120, 255, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.08))
    im.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(im)
    n = 6
    x0 = y0 = s * pad
    w = s * (1 - 2 * pad)
    cell = w / n
    gap = cell * 0.1
    # 흰 테두리
    d.rounded_rectangle([x0 - cell * 0.18, y0 - cell * 0.18, x0 + w + cell * 0.18, y0 + w + cell * 0.18], radius=cell * 0.35, fill=(238, 242, 248))
    d.rounded_rectangle([x0 - cell * 0.06, y0 - cell * 0.06, x0 + w + cell * 0.06, y0 + w + cell * 0.06], radius=cell * 0.25, fill=(20, 25, 37))
    # 경계선(지그재그): 열마다 빨강이 끝나는 행
    front = [3, 2, 3, 4, 3, 2]
    for r in range(n):
        for c in range(n):
            col = RED if r < front[c] else BLUE
            if (r, c) in ((2, 1), (3, 5)):
                col = GRAY
            cx = x0 + c * cell
            cy = y0 + r * cell
            d.rounded_rectangle([cx + gap, cy + gap, cx + cell - gap, cy + cell - gap], radius=cell * 0.16, fill=col)
            # 윗면 밝게
            hl = tuple(min(255, int(v * 1.18)) for v in col)
            d.rounded_rectangle([cx + gap, cy + gap, cx + cell - gap, cy + gap + cell * 0.18], radius=cell * 0.12, fill=hl)
    # 빛나는 공 + 꼬리
    bx, by = x0 + cell * 3.5, y0 + cell * 3.1
    trail = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    td = ImageDraw.Draw(trail)
    for k in range(14):
        t = k / 13
        r = cell * (0.12 + 0.2 * t)
        px = bx - cell * 0.1 * (1 - t)
        py = by + cell * 2.0 * (1 - t)
        td.ellipse([px - r, py - r, px + r, py + r], fill=(200, 230, 255, int(40 + 150 * t)))
    trail = trail.filter(ImageFilter.GaussianBlur(cell * 0.12))
    im.paste(trail, (0, 0), trail)
    d = ImageDraw.Draw(im)
    halo = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([bx - cell * 0.75, by - cell * 0.75, bx + cell * 0.75, by + cell * 0.75], fill=(150, 200, 255, 170))
    halo = halo.filter(ImageFilter.GaussianBlur(cell * 0.25))
    im.paste(halo, (0, 0), halo)
    d = ImageDraw.Draw(im)
    r = cell * 0.36
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=(245, 250, 255))
    return im.resize((size, size), Image.LANCZOS)


for name, size, pad in [('icon-192.png', 192, 0.16), ('icon-512.png', 512, 0.16), ('apple-touch-icon.png', 180, 0.14), ('icon-maskable-512.png', 512, 0.24)]:
    draw(size, pad).save(OUT / name, optimize=True)

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0a0f1e"/>
<rect x="8" y="8" width="48" height="48" rx="6" fill="#eef2f8"/>
<rect x="10" y="10" width="44" height="44" rx="4" fill="#141925"/>
<g fill="#ef4444"><rect x="11" y="11" width="6.5" height="6.5" rx="1.4"/><rect x="18.3" y="11" width="6.5" height="6.5" rx="1.4"/><rect x="25.6" y="11" width="6.5" height="6.5" rx="1.4"/><rect x="32.9" y="11" width="6.5" height="6.5" rx="1.4"/><rect x="40.2" y="11" width="6.5" height="6.5" rx="1.4"/><rect x="47.5" y="11" width="6.5" height="6.5" rx="1.4"/>
<rect x="11" y="18.3" width="6.5" height="6.5" rx="1.4"/><rect x="25.6" y="18.3" width="6.5" height="6.5" rx="1.4"/><rect x="32.9" y="18.3" width="6.5" height="6.5" rx="1.4"/><rect x="40.2" y="18.3" width="6.5" height="6.5" rx="1.4"/><rect x="47.5" y="18.3" width="6.5" height="6.5" rx="1.4"/>
<rect x="11" y="25.6" width="6.5" height="6.5" rx="1.4"/><rect x="25.6" y="25.6" width="6.5" height="6.5" rx="1.4"/><rect x="40.2" y="25.6" width="6.5" height="6.5" rx="1.4"/></g>
<g fill="#3b82f6"><rect x="18.3" y="25.6" width="6.5" height="6.5" rx="1.4"/><rect x="32.9" y="25.6" width="6.5" height="6.5" rx="1.4"/><rect x="47.5" y="25.6" width="6.5" height="6.5" rx="1.4"/>
<rect x="11" y="32.9" width="6.5" height="6.5" rx="1.4"/><rect x="18.3" y="32.9" width="6.5" height="6.5" rx="1.4"/><rect x="25.6" y="32.9" width="6.5" height="6.5" rx="1.4"/><rect x="32.9" y="32.9" width="6.5" height="6.5" rx="1.4"/><rect x="40.2" y="32.9" width="6.5" height="6.5" rx="1.4"/><rect x="47.5" y="32.9" width="6.5" height="6.5" rx="1.4"/>
<rect x="11" y="40.2" width="6.5" height="6.5" rx="1.4"/><rect x="18.3" y="40.2" width="6.5" height="6.5" rx="1.4"/><rect x="25.6" y="40.2" width="6.5" height="6.5" rx="1.4"/><rect x="32.9" y="40.2" width="6.5" height="6.5" rx="1.4"/><rect x="40.2" y="40.2" width="6.5" height="6.5" rx="1.4"/><rect x="47.5" y="40.2" width="6.5" height="6.5" rx="1.4"/>
<rect x="11" y="47.5" width="6.5" height="6.5" rx="1.4"/><rect x="18.3" y="47.5" width="6.5" height="6.5" rx="1.4"/><rect x="25.6" y="47.5" width="6.5" height="6.5" rx="1.4"/><rect x="32.9" y="47.5" width="6.5" height="6.5" rx="1.4"/><rect x="40.2" y="47.5" width="6.5" height="6.5" rx="1.4"/><rect x="47.5" y="47.5" width="6.5" height="6.5" rx="1.4"/></g>
<circle cx="36" cy="30" r="5.5" fill="#9cc8ff" opacity=".45"/><circle cx="36" cy="30" r="2.8" fill="#fff"/>
</svg>
'''
(OUT / 'icon.svg').write_text(svg, encoding='utf-8')
print('icons written to', OUT)
