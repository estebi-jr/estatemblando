# Teaser y capturas para el portafolio

Material para la web personal: un loop horizontal sin audio, 5 capturas en bruto y los textos.
Todo sale de la app real (`index.html` de este repo), no de un dibujo.

## Versión actual — v1 (26-10-2026)

| Archivo | Qué es |
|---|---|
| `estatemblando-teaser.mp4` | Loop 1920×1080, 30 fps, **12,5 s**, sin pista de audio. H.264 high, crf 14, yuv420p, +faststart |
| `estatemblando-1.png` … `-5.png` | Capturas 1290×2796 (iPhone 15 Pro Max, 430×932 a 3×), sin marco ni textos añadidos |
| `estatemblando-teaser-hoja.png` | Hoja de contactos del MP4 ya codificado |

Orden de las capturas: 1 pantalla principal · 2 «No. Todo está bien.» · 3 «Sí. Tembló, pero ya pasó.» · 4 «Revisando…» midiendo · 5 Ajustes.

## Guion del loop (segundos)

| Tiempo | Qué se ve |
|---|---|
| 0,0 – 1,9 | **Temblor**: la cámara tiembla (órbita irregular de 3,4 + 5,3 Hz con desenfoque de movimiento) y la línea de sismógrafo del fondo ondula hacia afuera desde el teléfono. Pantalla principal con el botón. |
| 1,2 – 2,3 | La cámara se acerca al botón (×1,3). |
| 2,2 – 2,6 | Aparece el dedo, presiona (el botón baja a 0,965) y suelta. |
| 2,58 | `onBig()` real: el botón se achica y sube, ondas de «revisando». |
| 2,6 – 4,4 | «Revisando…» con el sismógrafo de la app midiendo. A los 3,7 s llegan los datos (se apagan las ondas y aparece la lista). |
| 4,4 | «**Sí.** Tembló, pero ya pasó.» + base del cálculo (M 5,1 a 124 km, ~80 %). |
| 6,1 – 7,3 | Scroll suave hasta ver la lista completa de sismos con su probabilidad. |
| 8,3 – 9,0 | Vuelve arriba mientras la cámara se aleja. |
| 9,05 – 10,1 | La respuesta se desvanece y el botón vuelve a su tamaño (con la transición real de la app). |
| 10,1 – 12,5 | Pantalla principal en calma; empalma con el cuadro 0. |

- Cámara: curva monótona (sin rebotes) que empieza y termina en el mismo encuadre + deriva periódica de 12,5 s. Por eso el último cuadro empalma con el primero sin fundidos.
- Fondo: gris claro de la app (#F2F2F7 con viñeta y grano fijo contra el banding) y una traza de sismógrafo que solo se mueve durante el temblor.
- Sin texto añadido en pantalla: todo lo que se lee es de la app.

## Supuestos y licencias

- **Tipografía**: Inter / Inter Display (SIL OFL) en lugar de SF Pro, que no existe en Linux. Solo afecta al video y las capturas.
- **Datos de ejemplo** (`scenario.js`): lugares Casa (Providencia), Universidad (Santiago Centro) y Abuela (Viña del Mar); sismos inventados con formato CSN. La probabilidad y los textos los calcula la app real. Hora fija: miércoles 21-10-2026, 16:42.
- **Safe areas** del iPhone 15 Pro Max (59 / 34 pt) fijadas en la copia de trabajo, para que la app se arme igual que instalada.
- La barra de estado, la isla y el teléfono son genéricos, sin marca.
- La vuelta al estado inicial (9–10 s) es un recurso del video: la app real no se reinicia sola.
- Sin audio, por pedido.

## Control de calidad v1

- ffprobe: 1920×1080, 30 fps, h264 High, yuv420p, 375 cuadros, 12,500 s, **0 pistas de audio**, 5,1 MB.
- Tirones: ninguno.
- Empalme del loop (diferencia media en gris a 480×270): último→primero **0,29** vs. cuadros consecutivos alrededor del empalme 0,14–0,43 (media 0,23). Mediana del video: 1,05.

## Cómo regenerarlo

Requisitos: Python 3 con `playwright` (Chromium instalado), `numpy`, `pillow`, `fonttools` y `brotli`; `ffmpeg`; la fuente Inter en `.otf` (en Linux: `/usr/share/fonts/opentype/inter`, o copia los `.otf` a `tools/teaser-web/fonts-src/`).

```bash
cd tools/teaser-web
python3 build.py            # copia la app con parches mínimos a work/ (falla con mensaje claro si la app cambió)
python3 render.py sheet     # hoja de contactos rápida (24 cuadros) en out/sheet-preview.png
python3 render.py video     # out/estatemblando-teaser.mp4 (~3 min)
python3 qc.py               # ffprobe + tirones + empalme + hoja de contactos del MP4
python3 render.py shots     # out/estatemblando-1.png … -5.png
```

Archivos:

- `build.py` — arma `work/`: la app con safe areas fijas, sin service worker, con Inter y con el gancho `window.__TB` (estado y funciones reales de render).
- `pre.js` — antes de cada página: bloquea internet (los datos los entrega el director), quita el sensor real y carga lugares de ejemplo.
- `scenario.js` — datos de ejemplo y hora fija.
- `compose.html` + `director.js` — teléfono genérico, fondo, cámara, dedo y el guion. Las animaciones CSS de la app se pausan y se posicionan con `currentTime`, y el reloj de la página está detenido, así que cada cuadro es determinista.
- `render.py` — hoja de contactos, video (sale directo a ffmpeg) y capturas.
- `qc.py` — control de calidad del MP4 ya codificado.

Para cambiar tiempos, edita `TT` y `KEYS` en `director.js`; para cambiar la duración, `T` (y revisa que la cámara termine en el encuadre inicial).
