# ตัดพื้นเขียว (#00FF00) ออกจากภาพปลาที่ Codex วาด ล้างขอบเขียว ครอปชิดตัวปลา แล้วย่อเหลือกว้าง 640
#   python art/key-fish.py art/fish_raw art/fish
import sys, os
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    im = np.asarray(Image.open(os.path.join(src, f)).convert('RGB')).astype(np.float32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # ความเขียวเกินสีอื่น: มากกว่า 90 = พื้นแน่นอน, น้อยกว่า 25 = ตัวปลา, ระหว่างนั้นโปร่งบางส่วน (ขอบ)
    spill = g - np.maximum(r, b)
    a = np.clip((90 - spill) / (90 - 25), 0, 1)
    # ล้างสีเขียวที่ติดขอบ: ไม่ให้เขียวเกินสีที่สว่างกว่าระหว่างแดงกับน้ำเงิน
    g2 = np.minimum(g, np.maximum(r, b) + 12)
    out = np.dstack([r, g2, b, a * 255]).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(a > 0.1)
    pad = 12
    y0, y1 = max(0, ys.min() - pad), min(out.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(out.shape[1], xs.max() + pad)
    img = Image.fromarray(out[y0:y1, x0:x1], 'RGBA')
    w = 640
    img = img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)
    img.save(os.path.join(dst, f), optimize=True)
    print(f, img.size)
