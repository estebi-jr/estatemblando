/* Datos de EJEMPLO para el teaser y las capturas (nada personal).
   Hora fija: miércoles 21-10-2026, 16:42:20 en Santiago (UTC-3, horario de verano).
   Los sismos imitan el formato del CSN; la probabilidad la calcula la app real. */
window.SCN = (() => {
  const T0 = Date.UTC(2026, 9, 21, 19, 42, 20);
  const s = 1e3, min = 60 * s, h = 60 * min;
  const places = [
    { id: 'pcasa', name: 'Casa', lat: -33.437, lon: -70.617, label: 'Providencia, Santiago' },
    { id: 'puni', name: 'Universidad', lat: -33.448, lon: -70.662, label: 'Santiago Centro, Santiago' },
    { id: 'pabuela', name: 'Abuela', lat: -33.025, lon: -71.552, label: 'Viña del Mar, Valparaíso' }
  ];
  const ev = (id, ago, lat, lon, depth, mag, place, felt) =>
    ({ id: 'csn-' + id, src: 'csn', t: T0 - ago, lat, lon, depth, mag, magType: 'Ml', place, felt: !!felt, url: '' });
  // el temblor del video: hace 2 min, frente a la costa
  const now = ev('m51', 2 * min + 15 * s, -33.66, -71.93, 28, 5.1, '30 km al O de San Antonio', true);
  const week = [
    ev('x1', 5 * h + 12 * min, -20.21, -70.55, 41, 3.6, '48 km al O de Iquique'),
    ev('x2', 9 * h + 3 * min, -23.70, -67.20, 228, 4.1, '62 km al SE de San Pedro de Atacama'),
    ev('m44', 17 * h + 24 * min + 20 * s, -33.57, -71.36, 62, 4.4, '18 km al NO de Melipilla', true),
    ev('x3', 26 * h + 41 * min, -30.45, -71.80, 35, 3.9, '40 km al O de Ovalle'),
    ev('x4', 40 * h + 7 * min, -36.62, -73.35, 22, 3.4, '25 km al NO de Talcahuano'),
    ev('m42', 50 * h + 37 * min + 20 * s, -34.33, -70.92, 75, 4.2, '22 km al SO de Rancagua'),
    ev('m39', 80 * h + 51 * min + 20 * s, -33.64, -70.22, 9, 3.9, '35 km al E de San José de Maipo'),
    ev('x5', 101 * h + 15 * min, -18.95, -69.70, 112, 4.3, '71 km al E de Arica')
  ];
  const data = evs => ({ events: JSON.parse(JSON.stringify(evs)).sort((a, b) => b.t - a.t), quality: 'full', src: 'csn', at: T0 });
  return { T0, places, si: () => data([now, ...week]), no: () => data(week) };
})();
