# ตัดพื้นเขียวของภาพเกมจุดเทียนไล่ผี (ผี เทียน ตะเกียง คบไฟ) ครอปชิด ด้านยาวไม่เกิน 900 ไม่ขยาย
#   python art/key-ghost.py art/ghost_raw art/ghost  (ข้าม plate_* กับ ghost_face)
import sys, os
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or f.startswith('plate_') or f == 'ghost_face.png':
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
    s = min(1.0, 900 / max(img.width, img.height))
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    img.save(os.path.join(dst, f), optimize=True)
    print(f, img.size)
