# Claude — Motion Showreel 2026

A 15-second, 1920×1080 / 60 fps motion-design showreel, **100% procedural**: every frame is drawn by
code and every sound is synthesized. No footage, no stock, no samples, no AI video/audio generation.

- `claude_showreel_2026.mp4` — 1920×1080 · 60 fps · H.264 High (BT.709) ~14.5 Mb/s + AAC 320 kb/s (< 30 MiB)
- `claude_showreel_2026_HQ.mp4` — same, ~22 Mb/s
- `storyboard.png` — one frame per section

## Structure (locked to the beat: 28 frames = 1 beat = 128.57 BPM, 48 kHz = 22 400 samples/beat)

| Time | Section | Techniques |
|---|---|---|
| 0.00 | 00 Boot | dot → squash & stretch → baseline; masked type rolls; slot-machine digits; camera dive through the period |
| 1.87 | 01 Kinetic type | variable font (wght + wdth) at constant width, travelling axis waves, echo rows, fly-through the O counter |
| 3.73 | 02 Shape systems | Bauhaus grid, beat-locked ripples: rotate, card-flip recolour, collapse |
| 5.60 | 03 3D / depth | same grid through a perspective camera (exact top-down match), extrusion, orbit, shockwaves, whip-pan |
| 7.47 | 04 Liquid | SDF metaballs (smooth-min) + CPU-built SDF of the word, glossy jelly shading (WebGL) |
| 9.33 | 05 Particles + glitch | 9 000 analytic particles → torus knot → explosion; beat-repeat stutter mirrored from the audio; RGB-split sliced type |
| 11.20 | 06 Everything | eight 14-frame cards on 8th notes |
| 13.07 | 07 End card | variable-axis unfold, returning coral line + brand dot, fade |

Post chain: true motion blur (sub-frame accumulation in linear light, 4–32 samples/frame, 180° shutter),
bloom, beat-driven lens punch and chromatic aberration, glitch displacement, film grain, dithering.

## Render

```bash
npm install && npm run build                       # bundle (fontkit + scenes)
python3 audio/soundtrack.py                        # -> build/soundtrack.wav + glitch_schedule.json
python3 tools/stutter.py                           # audio glitch schedule -> visual time remap
node render.mjs --range 0:900:1 --video build/master.mkv --lossless --mb 8 --workers 4
tools/finalize.sh                                  # -> both MP4s + storyboard.png
tools/preview.sh 112 336 14                        # quick half-res contact sheet of a frame range
```

Needs Node 18+, Python 3 (numpy, scipy, pillow), ffmpeg with libx264, and a Playwright Chromium.
Fonts (OFL): Archivo (variable), Instrument Serif, JetBrains Mono — from google/fonts.
