# ตัดพื้นเขียว (#00FF00) ออกจากภาพคนกราบที่ Codex วาด ล้างขอบเขียว ครอปชิดตัว ย่อด้านยาวเหลือ 384
#   python art/key-temple.py art/temple_raw art/temple
# พิมพ์ขนาดภาพออกมาเป็น JSON ไว้ใส่ KSIZE ใน temple.html
import sys, os, json
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
sizes = {}
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    im = np.asarray(Image.open(os.path.join(src, f)).convert('RGB')).astype(np.float32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    spill = g - np.maximum(r, b)
    a = np.clip((90 - spill) / (90 - 25), 0, 1)
    g2 = np.minimum(g, np.maximum(r, b) + 12)
    out = np.dstack([r, g2, b, a * 255]).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(a > 0.5)
    pad = 6
    y0, y1 = max(0, ys.min() - pad), min(out.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(out.shape[1], xs.max() + pad)
    img = Image.fromarray(out[y0:y1, x0:x1], 'RGBA')
    k = 384 / max(img.width, img.height)
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    img.save(os.path.join(dst, f), optimize=True)
    sizes[f[:-4]] = [img.width, img.height]
print(json.dumps(sizes))
