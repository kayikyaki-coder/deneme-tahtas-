# Contact sheet: python3 tools/sheet.py out.png cols width files...
import sys
from PIL import Image, ImageDraw
out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = sys.argv[4:]
th = tw * 9 // 16
ims = []
for f in files:
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 64, 16], fill=(0, 0, 0))
    d.text((3, 2), f.split('/')[-1].replace('.png', ''), fill=(255, 255, 0))
    ims.append(im)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols + 1) * 6, rows * th + (rows + 1) * 6), (60, 60, 60))
for i, im in enumerate(ims):
    sheet.paste(im, (6 + (i % cols) * (tw + 6), 6 + (i // cols) * (th + 6)))
sheet.save(out)
