#!/usr/bin/env python3
"""Control de calidad del teaser YA CODIFICADO.

  python3 qc.py [out/estatemblando-teaser.mp4]

- ffprobe: 1920×1080, 30 fps, sin pista de audio.
- Detector de tirones: cuadro casi quieto entre dos que se mueven.
- Empalme del loop: diferencia último→primero vs. diferencias entre cuadros consecutivos.
- Hoja de contactos del MP4 (out/<slug>-teaser-hoja.png).
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MP4 = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'estatemblando-teaser.mp4')
sys.path.insert(0, HERE)
from render import contact_sheet  # noqa: E402

probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', MP4]))
vs = [s for s in probe['streams'] if s['codec_type'] == 'video']
au = [s for s in probe['streams'] if s['codec_type'] == 'audio']
v = vs[0]
num, den = map(int, v['r_frame_rate'].split('/'))
print(f"ffprobe: {v['width']}×{v['height']}, {num / den:g} fps, {v['codec_name']} {v.get('profile')}, {v['pix_fmt']}, "
      f"{int(v['nb_frames'])} cuadros, {float(probe['format']['duration']):.3f} s, pistas de audio: {len(au)}, "
      f"{int(probe['format']['size']) / 1e6:.1f} MB")
ok = v['width'] == 1920 and v['height'] == 1080 and num / den == 30 and not au

raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', MP4, '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
f = np.frombuffer(raw, np.uint8).reshape(-1, 270, 480).astype(np.float32)
d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
bad = [round((i + 1) / 30, 2) for i in range(2, len(d) - 2) if d[i] < 0.35 * min(d[i - 1], d[i + 1]) and min(d[i - 1], d[i + 1]) > 2]
print(f'tirones: {bad if bad else "ninguno"}')

wrap = np.abs(f[0] - f[-1]).mean()
near = np.concatenate([d[:5], d[-5:]])
print(f'empalme del loop: último→primero = {wrap:.3f}  |  consecutivos alrededor del empalme = {near.mean():.3f} '
      f'(rango {near.min():.3f}–{near.max():.3f})  |  mediana de todo el video = {np.median(d):.3f}  |  máximo = {d.max():.3f}')
ok = ok and not bad and wrap <= max(2.5 * near.max(), 0.5)

n = len(f)
idx = [round(k * (n - 1) / 23) for k in range(24)]
sel = '+'.join(f'eq(n\\,{i})' for i in idx)
full = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', MP4, '-vf', f"select='{sel}'", '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
frames = np.frombuffer(full, np.uint8).reshape(-1, 1080, 1920, 3)
sheet = os.path.join(os.path.dirname(MP4), os.path.basename(MP4).replace('.mp4', '-hoja.png'))
contact_sheet([(f'{i / 30:5.2f} s · #{i}', frames[k]) for k, i in enumerate(idx)], sheet)
print('hoja de contactos:', sheet)
print('RESULTADO:', 'OK' if ok else 'REVISAR')
