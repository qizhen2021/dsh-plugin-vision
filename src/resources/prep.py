import os
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src)
if img.mode not in ("RGB", "L"):
    img = img.convert("RGB")
max_side = int(os.environ.get("SEE_MAX_SIDE", "1600"))
if max(img.size) > max_side:
    img.thumbnail((max_side, max_side))
img.save(dst, "JPEG", quality=88)
print(img.size[0], img.size[1])
