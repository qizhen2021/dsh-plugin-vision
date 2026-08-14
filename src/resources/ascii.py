import os
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("L")
W = int(os.environ.get("SEE_ASCII_WIDTH", "88"))
r = img.size[1] / img.size[0] * 0.55
H = max(8, int(W * r))
img = img.resize((W, H))
chars = " .:-=+*#%@"
for y in range(H):
    print("".join(chars[min(len(chars) - 1, img.getpixel((x, y)) * len(chars) // 256)] for x in range(W)))
