import sys
from PIL import Image
img = Image.open(sys.argv[1])
print(img.size[0], img.size[1])
