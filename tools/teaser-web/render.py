#!/usr/bin/env python3
"""Render del teaser en loop y de las capturas de «¿Está temblando?».

  python3 build.py                       # primero: arma work/
  python3 render.py sheet                # hoja de contactos rápida (24 cuadros)
  python3 render.py sheet 2.0 2.6 3.0    # cuadros puntuales (segundos)
  python3 render.py video                # out/estatemblando-teaser.mp4 (1920×1080, 30 fps, sin audio)
  python3 render.py shots                # out/estatemblando-1.png … -5.png (1290×2796)

Todo es determinista: el reloj de la página está pausado y las animaciones se posicionan a mano.
"""
import io, json, os, subprocess, sys, threading, time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
OUT = os.path.join(HERE, 'out')
SLUG = 'estatemblando'
FPS, W, H = 30, 1920, 1080
T0_MS = 1792611740000          # SCN.T0 = 21-10-2026 16:42:20 en Santiago (se valida contra scenario.js)
SHAKE_END = 2.05               # durante el temblor se promedian subcuadros (desenfoque de movimiento)
SUB = 3


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=WORK))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}'


def new_page(pw, base, viewport, dpr, url):
    browser = pw.chromium.launch(args=['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'])
    ctx = browser.new_context(viewport=viewport, device_scale_factor=dpr, color_scheme='light', reduced_motion='no-preference',
                              locale='es-CL', timezone_id='America/Santiago')
    ctx.add_init_script(path=os.path.join(WORK, 'scenario.js'))
    ctx.add_init_script(path=os.path.join(WORK, 'pre.js'))
    page = ctx.new_page()
    page.clock.install(time=(T0_MS - 120000) / 1000)   # Python: segundos
    page.goto(base + url, wait_until='load')
    page.clock.pause_at(T0_MS / 1000)
    t0 = page.evaluate('window.SCN ? SCN.T0 : (document.getElementById("app") ? document.getElementById("app").contentWindow.SCN.T0 : 0)')
    assert t0 == T0_MS, f'T0 de scenario.js ({t0}) no coincide con render.py ({T0_MS})'
    now = page.evaluate('Date.now()')
    assert abs(now - T0_MS) < 2, f'El reloj de la página no quedó en T0 ({now})'
    return browser, page


def grab(page):
    return np.asarray(Image.open(io.BytesIO(page.screenshot(type='png', animations='allow', caret='hide'))).convert('RGB'))


def render_frame(page, i, dpr):
    t = i / FPS
    if t < SHAKE_END:
        acc = None
        for j in range(SUB):
            tj = t + (j - (SUB - 1) / 2) * (0.5 / FPS) / SUB   # obturador de 180°
            page.evaluate(f'frame({tj:.6f})')
            im = grab(page).astype(np.float32)
            acc = im if acc is None else acc + im
        img = (acc / SUB + 0.5).clip(0, 255).astype(np.uint8)
    else:
        page.evaluate(f'frame({t:.6f})')
        img = grab(page)
    if dpr != 1:
        img = np.asarray(Image.fromarray(img).resize((W, H), Image.LANCZOS))
    return img


def composer(pw, base, dpr):
    browser, page = new_page(pw, base, {'width': W, 'height': H}, dpr, '/compose.html')
    info = page.evaluate('init()')
    return browser, page, info


def font(sz):
    for f in ('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def contact_sheet(frames, path, cols=4, tw=480):
    th = int(tw * frames[0][1].shape[0] / frames[0][1].shape[1])
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw + (cols + 1) * 8, rows * (th + 30) + 8), (24, 24, 26))
    d, f = ImageDraw.Draw(sheet), font(18)
    for k, (label, im) in enumerate(frames):
        x, y = 8 + (k % cols) * (tw + 8), 8 + (k // cols) * (th + 30)
        sheet.paste(Image.fromarray(im).resize((tw, th), Image.LANCZOS), (x, y + 24))
        d.text((x + 2, y + 2), label, fill=(235, 235, 240), font=f)
    sheet.save(path)
    return path


def cmd_sheet(times, dpr=1):
    os.makedirs(OUT, exist_ok=True)
    httpd, base = serve()
    with sync_playwright() as pw:
        browser, page, info = composer(pw, base, dpr)
        print(json.dumps(info['L'], indent=1))
        nf = info['NF']
        if not times:
            times = [round(k * nf / 24) / FPS for k in range(24)]
        frames = []
        for t in sorted(times):
            i = round(t * FPS)
            frames.append((f'{i / FPS:5.2f} s', render_frame(page, i, dpr)))
        browser.close()
    httpd.shutdown()
    print(contact_sheet(frames, os.path.join(OUT, 'sheet-preview.png')))


def cmd_video(dpr=1):
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f'{SLUG}-teaser.mp4')
    httpd, base = serve()
    with sync_playwright() as pw:
        browser, page, info = composer(pw, base, dpr)
        nf = info['NF']
        ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                               '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-profile:v', 'high',
                               '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
        t0 = time.time()
        for i in range(nf):
            ff.stdin.write(render_frame(page, i, dpr).tobytes())
            if i % 30 == 0:
                print(f'  cuadro {i}/{nf}  ({time.time() - t0:.0f} s)', flush=True)
        ff.stdin.close(); ff.wait()
        browser.close()
    httpd.shutdown()
    print(out)


SHOT_JS = r'''async (name) => {
  const TB = window.__TB, S = TB.S, D = document;
  await D.fonts.ready;
  const fin = () => D.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });
  const R = (s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(42);
  const quiet = n => { let a = 0, b = 0; TB.Sensor.trace.length = 0; for (let i = 0; i < n; i++) { a = .82 * a + (R() - .5) * .012; b = .5 * b + (R() - .5) * .010; TB.Sensor.trace.push(a + b + .004 * Math.sin(i * .9)); } };
  const answer = (data) => { quiet(300); S.asked = true; S.data = data; S.sensor = 'quiet'; S.sensorPlace = TB.curPlace().id; TB.renderShell(); TB.renderAnswer(); fin(); };
  if (name === 'main') { TB.renderShell(); fin(); }
  if (name === 'no') answer(SCN.no());
  if (name === 'si') answer(SCN.si());
  if (name === 'checking') {
    quiet(150); S.asked = true; S.data = null; S.sensor = 'measuring'; S.sensorPlace = TB.curPlace().id;
    TB.$wrap.classList.add('checking'); TB.renderShell(); TB.renderAnswer();
    D.getAnimations().forEach(a => { const it = a.effect.getComputedTiming().iterations; if (it === Infinity) { a.pause(); a.currentTime = 1500; } else { try { a.finish(); } catch (e) {} } });
    TB.drawSeis(true);
  }
  if (name === 'settings') { TB.ACTIONS.settings(); fin(); }
  return D.documentElement.scrollHeight;
}'''

SHOTS = [('main', 1, '?hint=1'), ('no', 2, ''), ('si', 3, ''), ('checking', 4, ''), ('settings', 5, '')]


def cmd_shots():
    os.makedirs(OUT, exist_ok=True)
    httpd, base = serve()
    with sync_playwright() as pw:
        for name, n, q in SHOTS:
            browser, page = new_page(pw, base, {'width': 430, 'height': 932}, 3, '/app/index.html' + q)
            sh = page.evaluate(SHOT_JS, name)
            path = os.path.join(OUT, f'{SLUG}-{n}.png')
            page.screenshot(path=path, type='png', animations='allow', caret='hide')
            print(path, Image.open(path).size, 'scrollH', sh)
            browser.close()
    httpd.shutdown()


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'sheet'
    args = sys.argv[2:]
    dpr = 1
    if '--dpr' in args:
        k = args.index('--dpr'); dpr = float(args[k + 1]); del args[k:k + 2]
    if mode == 'sheet':
        cmd_sheet([float(a) for a in args], dpr)
    elif mode == 'video':
        cmd_video(dpr)
    elif mode == 'shots':
        cmd_shots()
    else:
        sys.exit(__doc__)
