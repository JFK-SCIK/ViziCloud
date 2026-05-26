from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image
import io, os

SVG = """\
<svg width="512" height="512" viewBox="0 0 680 680" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="680" rx="120" fill="#1a1a2e"/>
  <line x1="213" y1="130" x2="340" y2="400" stroke="#e8c96a" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="468" y1="130" x2="340" y2="400" stroke="#e8c96a" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="213" cy="130" r="68" fill="#1a1a2e"/>
  <circle cx="213" cy="130" r="62" fill="#f5f0e8"/>
  <circle cx="229" cy="146" r="38" fill="#2a6fdb"/>
  <circle cx="229" cy="146" r="22" fill="#0a0a15"/>
  <circle cx="213" cy="130" r="66" fill="none" stroke="#e8c96a" stroke-width="5"/>
  <circle cx="468" cy="130" r="68" fill="#1a1a2e"/>
  <circle cx="468" cy="130" r="62" fill="#f5f0e8"/>
  <circle cx="452" cy="146" r="38" fill="#2a6fdb"/>
  <circle cx="452" cy="146" r="22" fill="#0a0a15"/>
  <circle cx="468" cy="130" r="66" fill="none" stroke="#e8c96a" stroke-width="5"/>
  <rect x="235" y="328" width="210" height="60" rx="30" fill="#007AFF"/>
  <circle cx="280" cy="328" r="36" fill="#007AFF"/>
  <circle cx="340" cy="302" r="48" fill="#007AFF"/>
  <circle cx="400" cy="328" r="36" fill="#007AFF"/>
  <ellipse cx="326" cy="288" rx="22" ry="12" fill="white" opacity="0.28"/>
  <path d="M310 415 Q340 440 370 415 Q360 480 340 540 Q320 480 310 415 Z" fill="#c9a84c"/>
  <path d="M325 450 Q340 480 355 450 Q348 505 340 540 Q332 505 325 450 Z" fill="#a0702a"/>
</svg>"""

TMP = "tools/_tmp_icon.svg"
with open(TMP, "w") as f:
    f.write(SVG)

def make_png(src, dst, size):
    drawing = svg2rlg(src)
    scale = size / max(drawing.width, drawing.height)
    drawing.width = size
    drawing.height = size
    drawing.transform = (scale, 0, 0, scale, 0, 0)
    buf = io.BytesIO()
    renderPM.drawToFile(drawing, buf, fmt="PNG")
    buf.seek(0)
    img = Image.open(buf).convert("RGBA").resize((size, size), Image.LANCZOS)
    img.save(dst, "PNG")
    print(f"OK {size}px -> {dst}")

make_png(TMP, "icons/icon-192.png", 192)
make_png(TMP, "icons/icon-512.png", 512)
os.remove(TMP)
