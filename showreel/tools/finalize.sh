#!/bin/bash
# Master (lossless RGB) + soundtrack -> delivery MP4s (H.264 High, BT.709, AAC 320k) + storyboard.
#   claude_showreel_2026.mp4     ~14.5 Mb/s video (< 30 MiB, for sharing/uploads)
#   claude_showreel_2026_HQ.mp4  ~22 Mb/s video
set -e
cd "$(dirname "$0")/../build"

VF="scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p"
COLOR="-color_primaries bt709 -color_trc bt709 -colorspace bt709"

encode() { # bitrate maxrate bufsize output
  local X264="-c:v libx264 -preset slow -tune film -profile:v high -level 4.2 -b:v $1 -maxrate $2 -bufsize $3 -x264-params keyint=60:min-keyint=30:aq-mode=3"
  ffmpeg -y -hide_banner -loglevel error -i master.mkv -vf "$VF" $X264 $COLOR -pass 1 -passlogfile x264pass -an -f null /dev/null
  # -1.5 dB before AAC keeps true peak at about -1.2 dBTP after encoding
  ffmpeg -y -hide_banner -loglevel error -i master.mkv -i soundtrack.wav -map 0:v -map 1:a -vf "$VF" $X264 $COLOR \
    -pass 2 -passlogfile x264pass -af "volume=-1.5dB" -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest "../$4"
}
encode 14500k 28M 40M claude_showreel_2026.mp4
encode 22M 40M 60M claude_showreel_2026_HQ.mp4

# storyboard: one hero frame per section
mkdir -p story
i=0
for f in 99 150 180 265 420 520 600 650 690 708 740 870; do
  ffmpeg -y -hide_banner -loglevel error -i master.mkv -vf "select=eq(n\,$f)" -frames:v 1 "story/s$(printf %02d $i).png"
  i=$((i+1))
done
cd ..
python3 - <<'EOF'
from PIL import Image
import glob
fs = sorted(glob.glob('build/story/s*.png'))
tw, th, pad, cols = 640, 360, 10, 3
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad), (14, 13, 11))
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    sheet.paste(im, (pad + (i % cols) * (tw + pad), pad + (i // cols) * (th + pad)))
sheet.save('storyboard.png')
EOF
ls -la claude_showreel_2026.mp4 claude_showreel_2026_HQ.mp4 storyboard.png
