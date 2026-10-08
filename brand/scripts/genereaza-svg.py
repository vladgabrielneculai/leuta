"""Generează sigla Leuța în SVG, cu textul convertit în contururi (nu depinde de fonturi instalate).

Rulare din rădăcina proiectului:  python3 brand/scripts/genereaza-svg.py brand/svg
Necesită fontTools (pip install fonttools).
"""
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = os.path.join(ROOT, "src/lib/receipt/fonts/IBMPlexMono-Bold.ttf")
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

INK = "#1F1D1A"
CREAM = "#F7F0DA"
BARS = ["#3D7A4E", "#6A4E99", "#B5456A", "#A87C10", "#2E5C8A"]  # 1, 5, 10, 50, 100 lei
BARS_ON_DARK = ["#62BA80", "#A38DDE", "#E87CA0", "#E4B74C", "#6EA4DC"]

L_PATH = "M22.5 15.5h7v22.2l13.2-6.6 2.9 6.3-17.6 8.9c-2.6 1.3-5.5-.6-5.5-3.5V15.5z"


def coin_color(p: str) -> str:
    """Moneda în culori, exact ca în aplicație (src/components/Logo.tsx), pe un pătrat 64×64."""
    return f"""
  <defs>
    <linearGradient id="{p}g" x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5FA374"/><stop offset="0.55" stop-color="#3D7A4E"/><stop offset="1" stop-color="#24502F"/></linearGradient>
    <linearGradient id="{p}s" x1="32" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#{p}g)"/>
  <circle cx="32" cy="32" r="26.5" fill="none" stroke="#F3EBD3" stroke-opacity="0.55" stroke-width="1.1" stroke-dasharray="1.5933 2.1908"/>
  <circle cx="32" cy="32" r="24.6" fill="none" stroke="#F3EBD3" stroke-opacity="0.3" stroke-width="0.8" stroke-dasharray="2.381 1.3889"/>
  <ellipse cx="32" cy="18" rx="22" ry="13" fill="url(#{p}s)"/>
  <path d="{L_PATH}" fill="{CREAM}"/>
  <circle cx="46.3" cy="27.6" r="3.1" fill="#E4B74C"/>"""


def coin_mono(p: str, color: str) -> str:
    """Moneda într-o singură culoare: „L”-ul, punctul și chenarul sunt decupate (transparente)."""
    return f"""
  <defs>
    <mask id="{p}m" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
      <rect width="64" height="64" fill="#fff"/>
      <circle cx="32" cy="32" r="26.5" fill="none" stroke="#000" stroke-width="1.1" stroke-dasharray="1.5933 2.1908"/>
      <circle cx="32" cy="32" r="24.6" fill="none" stroke="#000" stroke-width="0.8" stroke-dasharray="2.381 1.3889"/>
      <path d="{L_PATH}" fill="#000"/>
      <circle cx="46.3" cy="27.6" r="3.1" fill="#000"/>
    </mask>
  </defs>
  <circle cx="32" cy="32" r="30" fill="{color}" mask="url(#{p}m)"/>"""


# ---- cuvântul „Leuța” în contururi ----
font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
UPM = 1000
TRACK = -30  # tracking -0.03em, ca în aplicație


def word_path(text: str, size: float, x0: float, baseline: float) -> tuple[str, float]:
    s = size / UPM
    pen = SVGPathPen(gs)
    x = 0.0
    for i, ch in enumerate(text):
        g = gs[cmap[ord(ch)]]
        g.draw(TransformPen(pen, (s, 0, 0, -s, x0 + x * s, baseline)))
        x += g.width + (TRACK if i < len(text) - 1 else 0)
    # lățimea vizuală: de la marginea „L” (92) la marginea „a” (572) în ultima casetă
    first_lsb = 92
    last_rsb = 600 - 572
    width = (x - first_lsb - last_rsb) * s
    return pen.getCommands(), width


def svg(w: float, h: float, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}">\n'
        f"  <title>{title}</title>{body}\n</svg>\n"
    )


def write(name: str, content: str):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)


# ---- simbolul (moneda) ----
write("leuta-simbol.svg", svg(64, 64, coin_color("c"), "Leuța — simbol"))
write("leuta-simbol-negru.svg", svg(64, 64, coin_mono("k", INK), "Leuța — simbol, negru"))
write("leuta-simbol-alb.svg", svg(64, 64, coin_mono("w", "#FFFFFF"), "Leuța — simbol, alb"))

# ---- logo orizontal: monedă + „Leuța” + cele cinci bancnote ----
ICON = 64
GAP = 15
SIZE = 38  # corpul literei
CAP = 0.698 * SIZE
DESC = 0.269 * SIZE  # virgula de sub „ț”
BAR_GAP_TOP = 7
BAR_H = 4.6
x_text = ICON + GAP - 0.092 * SIZE  # aliniem marginea vizuală a „L”-ului
_, text_w = word_path("Leuța", SIZE, 0, 0)
block_h = CAP + DESC + BAR_GAP_TOP + BAR_H
top = (ICON - block_h) / 2
baseline = top + CAP
bars_y = baseline + DESC + BAR_GAP_TOP
bar_gap = 4
bar_w = (text_w - 4 * bar_gap) / 5
W = ICON + GAP + text_w


def lockup(coin: str, text_color: str, bars: list[str]) -> str:
    d, _ = word_path("Leuța", SIZE, x_text, baseline)
    rects = "".join(
        f'\n  <rect x="{ICON + GAP + i * (bar_w + bar_gap):.3f}" y="{bars_y:.3f}" width="{bar_w:.3f}" height="{BAR_H}" rx="{BAR_H / 2}" fill="{c}"/>'
        for i, c in enumerate(bars)
    )
    return f"{coin}\n  <path d=\"{d}\" fill=\"{text_color}\"/>{rects}"


write("leuta-logo.svg", svg(W, ICON, lockup(coin_color("c"), INK, BARS), "Leuța — logo"))
write("leuta-logo-fundal-inchis.svg", svg(W, ICON, lockup(coin_color("c"), "#EDE7DB", BARS_ON_DARK), "Leuța — logo pe fundal închis"))
write("leuta-logo-negru.svg", svg(W, ICON, lockup(coin_mono("k", INK), INK, [INK] * 5), "Leuța — logo, negru"))
write("leuta-logo-alb.svg", svg(W, ICON, lockup(coin_mono("w", "#FFFFFF"), "#FFFFFF", ["#FFFFFF"] * 5), "Leuța — logo, alb"))

# ---- iconița de aplicație (pătrat rotunjit), aceeași ca src/app/icon.svg ----
with open(os.path.join(ROOT, "src/app/icon.svg")) as f:
    write("leuta-icon-aplicatie.svg", f.read())

print(f"logo: {W:.2f} x {ICON}, text {text_w:.2f}")
