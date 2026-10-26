/* Se inyecta antes del código de cada página (compositor e iframe de la app).
   - Nada sale a internet: los fetch externos quedan pendientes (el director entrega los datos).
   - Sin sensor real: el director maneja S.sensor con estados reales de la app.
   - Lugares y preferencias de EJEMPLO en el localStorage de la app. */
(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const s = String((u && u.url) || u);
    if (/^https?:\/\//.test(s) && !s.startsWith(location.origin)) return new Promise(() => {});
    return realFetch(u, o);
  };
  try { Object.defineProperty(window, 'DeviceMotionEvent', { value: undefined, configurable: true, writable: true }); } catch (e) {}
  if (!location.pathname.includes('/app/') || !window.SCN) return;
  // dentro del compositor: el sismógrafo de la app se dibuja a 3× para que siga nítido con zoom
  if (window.top !== window) try { Object.defineProperty(window, 'devicePixelRatio', { get: () => 3, configurable: true }); } catch (e) {}
  const P = 'estatemblando:', q = new URLSearchParams(location.search);
  try {
    localStorage.clear();
    const places = {};
    SCN.places.forEach((p, i) => { places[p.id] = { name: p.name, lat: p.lat, lon: p.lon, label: p.label, order: i, created: '2026-09-30T12:00:0' + i + '.000Z' }; });
    localStorage.setItem(P + 'data:v1', JSON.stringify({ places }));
    localStorage.setItem(P + 'place', JSON.stringify(SCN.places[0].id));
    localStorage.setItem(P + 'theme', JSON.stringify(q.get('theme') || 'light'));
    localStorage.setItem(P + 'install-hint', 'true');
    if (q.get('hint') !== '1') localStorage.setItem(P + 'hint-done', 'true');
  } catch (e) {}
})();
