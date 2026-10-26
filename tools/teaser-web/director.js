/* Director del teaser en loop de «¿Está temblando?».
   El compositor carga la app REAL en un iframe (work/app/index.html) y la maneja con su propio
   código (onBig, renderAnswer…) a través de window.__TB. Todo es determinista cuadro a cuadro:
   - las animaciones y transiciones CSS de la app se pausan y se posicionan con currentTime;
   - el reloj de la página lo controla Playwright (clock.pause_at);
   - la cámara es una curva periódica: el último cuadro empalma con el primero.
   render.py llama  await init()  y luego  await frame(t)  para cada cuadro. */
'use strict';
const FPS = 30, T = 12.5, NF = Math.round(T * FPS);
const PW = 458, PH = 960, SCR = 14;            // teléfono: 430×932 de pantalla + bisel de 14
const PC = { x: PW / 2, y: PH / 2 };
const Z0 = 930 / PH;                           // alto del teléfono en pantalla con encuadre base
const $ = s => document.querySelector(s);
const IF = $('#app'), rig = $('#rig'), bg = $('#bg'), bx = bg.getContext('2d'), tapEl = $('#tap'), ringEl = $('#ring');
let W, D, TB, L = {}, evi = 0, bgBase = null;

/* ---------- utilidades ---------- */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const ticks = async () => { for (let i = 0; i < 6; i++) await new Promise(r => queueMicrotask(r)); };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- animaciones de la app: pausadas y posicionadas a mano ---------- */
const REG = new Map();
function track(birth) { for (const a of D.getAnimations()) if (!REG.has(a)) { a.pause(); REG.set(a, birth); } }
function seek(t) {
  for (const [a, b] of REG) {
    if (a.playState === 'idle') { REG.delete(a); continue; }
    const end = a.effect ? a.effect.getComputedTiming().endTime : 0, ct = Math.max(0, (t - b) * 1000);
    if (ct >= end) { try { a.currentTime = end; } catch (e) {} REG.delete(a); } else a.currentTime = ct;
  }
}
const finishAll = () => D.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });

/* ---------- guion (segundos) ---------- */
const TT = {
  shakeIn: 0.02, shakePeak: 0.38, shakeOut0: 0.95, shakeOut1: 1.95,   // temblor de apertura
  tapIn: 2.16, press: 2.47, tap: 2.58,                                  // el dedo y el toque
  measure: 2.62, data: 3.70, answer: 4.40,                              // revisando → respuesta
  scroll0: 6.10, scroll1: 7.30, unscroll0: 8.30, unscroll1: 9.00,      // la lista completa
  fade0: 9.05, reset: 9.50                                              // vuelta al estado inicial
};
const EV = [
  { t: TT.tap, fn: () => TB.onBig() },
  { t: TT.measure, fn: () => { TB.S.sensor = 'measuring'; TB.Sensor.trace.length = 0; TB.renderAnswer(); } },
  { t: TT.data, fn: () => { TB.S.data = SCN.si(); TB.S.fetching = false; TB.$wrap.classList.remove('checking'); TB.renderAnswer(); } },
  { t: TT.answer, fn: () => { TB.S.sensor = 'quiet'; TB.renderAnswer(); } },
  { t: TT.reset, fn: () => {
      TB.S.asked = false; TB.S.sensor = 'idle'; TB.renderShell(); TB.renderAnswer();
      D.getElementById('answer').style.opacity = ''; D.getElementById('recent').style.opacity = '';
    } }
];

/* ---------- cámara: curva periódica (monótona, sin rebotes) + deriva + temblor ---------- */
let KEYS = null;
function buildKeys() {
  const B = { x: L.btn.x + SCR, y: L.btn.y + SCR };
  const mid = { x: PC.x, y: (L.big2.top + L.ans.bottom) / 2 + SCR };
  const ans = { x: PC.x, y: (L.big2.top + L.ans.bottom) / 2 + SCR + 40 };
  const lst = { x: PC.x, y: L.list.y - L.scrollMax + SCR - 20 };
  KEYS = [ // [t, fx, fy, zoom relativo]
    [0.00, PC.x, PC.y, 1.00],
    [1.15, PC.x, PC.y, 1.00],
    [2.30, B.x, B.y, 1.30],
    [2.80, B.x, B.y - 6, 1.30],
    [3.90, mid.x, mid.y, 1.17],
    [5.40, ans.x, ans.y, 1.21],
    [7.30, lst.x, lst.y, 1.20],
    [8.30, lst.x, lst.y - 8, 1.19],
    [9.90, PC.x, PC.y, 1.00],
    [T, PC.x, PC.y, 1.00]
  ];
}
function monotone(ts, ys) {               // Fritsch–Carlson: tangentes sin sobrepaso
  const n = ts.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = ts[i + 1] - ts[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else m[i] = 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  }
  return t => {
    let i = 0; while (i < n - 2 && t > ts[i + 1]) i++;
    const u = clamp((t - ts[i]) / h[i], 0, 1), u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h[i] * m[i + 1];
  };
}
let CX, CY, CZ;
function shakeEnv(t) { return sstep(TT.shakeIn, TT.shakePeak, t) * (1 - sstep(TT.shakeOut0, TT.shakeOut1, t)); }
function shake(t) {                         // órbita irregular (3,4 + 5,3 Hz): se siente temblor, sin tirones
  const e = shakeEnv(t); if (e <= 0) return { x: 0, y: 0, r: 0 };
  const p = 2 * Math.PI * t, k = e * (0.9 + 0.1 * Math.sin(p * 1.3));
  return {
    x: k * (8.5 * Math.cos(p * 3.4) + 2.4 * Math.cos(p * 5.3 + 1.1)),
    y: k * (8.5 * Math.sin(p * 3.4) + 2.4 * Math.sin(p * 5.3 + 1.1) + 1.4 * Math.sin(p * 7.2 + .4)),
    r: k * 0.004 * Math.sin(p * 1.7 + 1.0)
  };
}
function camera(t) {
  const w = 2 * Math.PI * t / T, sh = shake(t);
  return {
    fx: CX(t), fy: CY(t), z: Z0 * CZ(t) * (1 + 0.008 * Math.sin(w + 2.0)),
    dx: 9 * Math.sin(w) , dy: 5 * Math.sin(2 * w + .7), r: 0.0035 * Math.sin(w + 1.1),
    sh
  };
}
function mat(fx, fy, z, r, ox, oy) {          // pantalla = R·z·(p − f) + o
  const a = Math.cos(r) * z, b = Math.sin(r) * z;
  return [a, b, -b, a, ox - (a * fx - b * fy), oy - (b * fx + a * fy)];
}
function applyCam(c) {
  const m = mat(c.fx, c.fy, c.z, c.r + c.sh.r, 960 + c.dx + c.sh.x, 540 + c.dy + c.sh.y);
  rig.style.transform = `matrix(${m.map(v => v.toFixed(5)).join(',')})`;
}

/* ---------- fondo: claro como la app + la traza de un sismógrafo que tiembla ---------- */
function makeBgBase() {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const x = c.getContext('2d');
  const g = x.createRadialGradient(960, 470, 60, 960, 560, 1250);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(.42, '#F4F4F8'); g.addColorStop(1, '#E3E3E9');
  x.fillStyle = g; x.fillRect(0, 0, 1920, 1080);
  const id = x.getImageData(0, 0, 1920, 1080), px = id.data, R = rng(7);   // grano fijo contra el banding
  for (let i = 0; i < px.length; i += 4) { const n = (R() + R() - 1) * 2.2; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
  x.putImageData(id, 0, 0); return c;
}
function lineEnv(tau) { return tau <= 0 ? 0 : shakeEnv(tau); }
function drawBG(c, t) {
  bx.setTransform(1, 0, 0, 1, 0, 0); bx.drawImage(bgBase, 0, 0);
  const k = 0.45, zr = c.z / Z0;                       // paralaje: el fondo se mueve menos que el teléfono
  const fx = PC.x + (c.fx - PC.x) * k, fy = PC.y + (c.fy - PC.y) * k, z = Z0 * (1 + (zr - 1) * k);
  const m = mat(fx, fy, z, (c.r + c.sh.r) * .6, 960 + (c.dx + c.sh.x) * .6, 540 + (c.dy + c.sh.y) * .6);
  bx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  const y0 = PC.y + 6, cv = 1500;                       // la onda viaja hacia afuera desde el teléfono
  bx.beginPath();
  for (let x = -1700; x <= PW + 1700; x += 2) {
    const dist = Math.abs(x - PC.x), tau = t - dist / cv, e = lineEnv(tau);
    let y = y0;
    if (e > 0) {
      const p = 2 * Math.PI * tau, fall = 1 / (1 + dist / 1300);
      y += e * fall * (21 * Math.sin(p * 6.3 + x * .010) + 10 * Math.sin(p * 10.1 + x * .023 + 1.2) + 4.5 * Math.sin(p * 15.7 + x * .041 + 2.5));
    }
    x === -1700 ? bx.moveTo(x, y) : bx.lineTo(x, y);
  }
  bx.lineWidth = 2.2 / z; bx.lineJoin = 'round'; bx.strokeStyle = '#BCBCC4'; bx.stroke();
}

/* ---------- el dedo, el botón presionado, la traza del sensor y el fundido ---------- */
function tapFx(t) {
  let P = { x: L.btn.x + .05 * L.btn.w, y: L.btn.y + .2 * L.btn.h };    // el pulgar, bajo el texto del botón
  if (t >= TT.tap) { const r = TB.$big.getBoundingClientRect(); P = { x: r.left + r.width * .55, y: r.top + r.height * .7 }; }
  let o = 0, s = 1;
  if (t >= TT.tapIn && t < TT.tap) {
    o = sstep(TT.tapIn, TT.tapIn + .18, t); s = lerp(1.22, 1, ease(TT.tapIn, TT.tapIn + .22, t));
    if (t >= TT.press) s = lerp(1, .84, ease(TT.press, TT.press + .09, t));
  } else if (t >= TT.tap && t < TT.tap + .3) { o = 1 - sstep(TT.tap, TT.tap + .22, t); s = lerp(.84, .95, ease(TT.tap, TT.tap + .22, t)); }
  tapEl.style.opacity = o.toFixed(4);
  tapEl.style.transform = `translate(${P.x.toFixed(2)}px,${P.y.toFixed(2)}px) scale(${s.toFixed(4)})`;
  let ro = 0, rs = 1;
  if (t >= TT.tap && t < TT.tap + .5) { const k = ease(TT.tap, TT.tap + .5, t); ro = .5 * (1 - k); rs = lerp(.9, 1.9, k); }
  ringEl.style.opacity = ro.toFixed(4);
  ringEl.style.transform = `translate(${P.x.toFixed(2)}px,${P.y.toFixed(2)}px) scale(${rs.toFixed(4)})`;
}
function pressFx(t) {
  let s = 1;
  if (t >= TT.press && t < TT.tap) s = lerp(1, .965, ease(TT.press, TT.press + .08, t));
  else if (t >= TT.tap && t < TT.tap + .16) s = lerp(.965, 1, ease(TT.tap, TT.tap + .16, t));
  TB.$big.style.transform = s === 1 ? '' : `scale(${s.toFixed(4)})`;
}
const TRACE = (() => { const R = rng(42), out = []; let a = 0, b = 0;      // quietud: ruido de fondo del sensor
  for (let i = 0; i < 400; i++) { a = .82 * a + (R() - .5) * .012; b = .5 * b + (R() - .5) * .010; out.push(a + b + .004 * Math.sin(i * .9)); }
  return out; })();
function traceFx(t) {
  if (t < TT.measure || t >= TT.answer) return;
  const n = Math.min(TRACE.length, Math.floor((t - TT.measure) * 60)), tr = TB.Sensor.trace;
  while (tr.length < n) tr.push(TRACE[tr.length]);
  TB.drawSeis(true);
}
function scrollFx(t) {
  if (t < TT.scroll0 || t >= TT.unscroll1 + .1) return;
  const y = t < TT.unscroll0 ? L.scrollMax * ease(TT.scroll0, TT.scroll1, t) : L.scrollMax * (1 - ease(TT.unscroll0, TT.unscroll1, t));
  W.scrollTo(0, Math.round(y * 4) / 4);
}
function fadeFx(t) {
  if (t < TT.fade0 || t >= TT.reset) return;
  const o = (1 - ease(TT.fade0, TT.reset - .03, t)).toFixed(4);
  D.getElementById('answer').style.opacity = o; D.getElementById('recent').style.opacity = o;
}

/* ---------- API para render.py ---------- */
async function init() {
  await new Promise(r => { if (IF.contentWindow && IF.contentWindow.__TB && IF.contentDocument.readyState === 'complete') r(); else IF.addEventListener('load', r, { once: true }); });
  W = IF.contentWindow; D = IF.contentDocument; TB = W.__TB;
  await D.fonts.ready; await document.fonts.ready;
  TB.$big.style.transition = 'none';                   // el «presionado» lo maneja pressFx
  finishAll();
  const rc = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
  L.btn = rc(TB.$big);
  const S = TB.S;                                     // pasada de medición: diseño con respuesta
  S.asked = true; S.data = SCN.si(); S.sensor = 'quiet'; S.sensorPlace = TB.curPlace().id; TB.renderShell(); TB.renderAnswer(); finishAll();
  L.big2 = rc(TB.$big); L.ans = rc(D.getElementById('answer')); L.list = rc(D.getElementById('recent'));
  L.title = rc(D.getElementById('aTitle')); L.chips = rc(D.getElementById('chips'));
  L.scrollH = D.documentElement.scrollHeight; L.scrollMax = Math.max(0, L.scrollH - W.innerHeight);
  S.asked = false; S.data = null; S.sensor = 'idle'; S.sensorPlace = null; S.lastK = ''; TB.renderShell(); TB.renderAnswer(); finishAll();
  L.btnBack = rc(TB.$big);
  buildKeys();
  const ts = KEYS.map(k => k[0]);
  CX = monotone(ts, KEYS.map(k => k[1])); CY = monotone(ts, KEYS.map(k => k[2])); CZ = monotone(ts, KEYS.map(k => k[3]));
  bgBase = makeBgBase();
  return { L, NF, FPS, T };
}
async function frame(t) {
  while (evi < EV.length && EV[evi].t <= t + 1e-6) { const e = EV[evi++]; seek(e.t); e.fn(); await ticks(); track(e.t); }
  track(t); seek(t);
  pressFx(t); traceFx(t); scrollFx(t); fadeFx(t); tapFx(t);
  const c = camera(t); applyCam(c); drawBG(c, t);
  return true;
}
window.init = init; window.frame = frame;
