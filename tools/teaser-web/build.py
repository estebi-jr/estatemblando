#!/usr/bin/env python3
"""Arma work/ para el teaser y las capturas a partir de la app REAL (../../index.html).

- work/app/index.html : copia de la app con parches mínimos (cada parche busca un texto exacto
  y falla con un mensaje claro si la app cambió).
- work/fonts/         : Inter / Inter Display en woff2 (sustituto libre de SF Pro, que no existe en Linux).
- work/compose.html   : el compositor horizontal (teléfono + fondo) que maneja director.js.

Uso:  python3 build.py
"""
import os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(HERE, 'work')

# Inset del iPhone 15 Pro Max en modo standalone (pt): así la app se arma igual que instalada.
SAFE_TOP, SAFE_BOTTOM = 59, 34


def patch(src, old, new, count=1, what=''):
    n = src.count(old)
    if n != count:
        sys.exit(f'[build] El parche "{what}" esperaba {count} coincidencia(s) de {old!r} y encontró {n}. '
                 'La app cambió: revisa build.py.')
    return src.replace(old, new)


def build_app():
    src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    # 1) safe areas fijas (en Chromium de escritorio env() vale 0)
    src = patch(src, 'env(safe-area-inset-top,0px)', f'{SAFE_TOP}px', 6, 'safe-top')
    src = patch(src, 'env(safe-area-inset-bottom,0px)', f'{SAFE_BOTTOM}px', 8, 'safe-bottom')
    src = patch(src, 'env(safe-area-inset-right,0px)', '0px', 1, 'safe-right')
    # 2) sin service worker en el taller
    src = patch(src, "navigator.serviceWorker.register('./sw.js').catch(()=>{})", 'void 0', 1, 'sw')
    # 3) tipografía: Inter / Inter Display en lugar de SF Pro (solo para el video)
    fonts = ('<link rel="stylesheet" href="../fonts/fonts.css">\n<style id="teaser-fonts">:root{'
             '--font-ui:"Inter Teaser","Inter",sans-serif;'
             '--font-display:"Inter Display Teaser","Inter Display","Inter Teaser",sans-serif}</style>\n</head>')
    src = patch(src, '</head>', fonts, 1, 'fonts')
    # 4) gancho para el director: acceso al estado y a las funciones reales de render
    hook = ('renderShell();\nwindow.__TB={S,Sensor,Store,renderAnswer,renderShell,renderChips,drawSeis,onBig,'
            'onSensor,places,curPlace,ACTIONS,$wrap,$big,CFG,evaluate,decide};\n})();\n</script>')
    src = patch(src, 'renderShell();\n})();\n</script>', hook, 1, 'hook')
    os.makedirs(os.path.join(WORK, 'app'), exist_ok=True)
    open(os.path.join(WORK, 'app', 'index.html'), 'w', encoding='utf-8').write(src)
    for f in ('icon-192.png', 'icon-180.png', 'manifest.webmanifest'):
        shutil.copy(os.path.join(ROOT, f), os.path.join(WORK, 'app', f))


FONT_SETS = [  # (archivo, familia, peso)
    ('Inter-Regular', 'Inter Teaser', 400), ('Inter-Medium', 'Inter Teaser', 500),
    ('Inter-SemiBold', 'Inter Teaser', 600), ('Inter-Bold', 'Inter Teaser', 700),
    ('InterDisplay-SemiBold', 'Inter Display Teaser', 600), ('InterDisplay-Bold', 'Inter Display Teaser', 700),
]
FONT_DIRS = ['/usr/share/fonts/opentype/inter', os.path.join(HERE, 'fonts-src')]


def build_fonts():
    out = os.path.join(WORK, 'fonts')
    os.makedirs(out, exist_ok=True)
    css = []
    for name, fam, w in FONT_SETS:
        dst = os.path.join(out, name + '.woff2')
        if not os.path.exists(dst):
            src = next((os.path.join(d, name + '.otf') for d in FONT_DIRS if os.path.exists(os.path.join(d, name + '.otf'))), None)
            if not src:
                print(f'[build] Aviso: no encontré {name}.otf; se usará la fuente local "Inter" si existe.')
                continue
            subprocess.run([sys.executable, '-m', 'fontTools.subset', src, '--flavor=woff2', f'--output-file={dst}',
                            '--unicodes=U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+20AC,U+2190-2193,U+2212',
                            '--layout-features=*'], check=True)
        css.append(f'@font-face{{font-family:"{fam}";font-weight:{w};font-style:normal;font-display:block;'
                   f'src:url("{name}.woff2") format("woff2")}}')
    open(os.path.join(out, 'fonts.css'), 'w').write('\n'.join(css) + '\n')


def build_composer():
    for f in ('compose.html', 'director.js', 'scenario.js', 'pre.js'):
        shutil.copy(os.path.join(HERE, f), os.path.join(WORK, f))


if __name__ == '__main__':
    build_app()
    build_fonts()
    build_composer()
    print('[build] listo:', WORK)
