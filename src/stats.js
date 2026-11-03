// Cálculos sobre una lista de puntos [{ lat, lon, ele, t }]
// (ele = altura en metros o null; t = hora en milisegundos o null)

const EARTH_RADIUS_M = 6371000;

// Para el desnivel solo contamos cambios de al menos 3 m respecto a la última
// altura "aceptada". Así el ruido del GPS (subir y bajar 1 m sin parar)
// no infla el desnivel.
const ELEVATION_THRESHOLD_M = 3;

// Distancia entre dos puntos sobre la esfera (fórmula del haversine), en metros
export function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function computeStats(points) {
  let distance = 0;
  let gain = 0;
  let loss = 0;
  let reference = null;
  let maxEle = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) distance += haversine(points[i - 1], p);

    if (p.ele !== null) {
      maxEle = maxEle === null ? p.ele : Math.max(maxEle, p.ele);
      if (reference === null) reference = p.ele;
      const diff = p.ele - reference;
      if (diff >= ELEVATION_THRESHOLD_M) {
        gain += diff;
        reference = p.ele;
      } else if (diff <= -ELEVATION_THRESHOLD_M) {
        loss -= diff;
        reference = p.ele;
      }
    }
  }

  // Duración: de la primera a la última hora registrada (si el archivo trae horas)
  const times = points.map((p) => p.t).filter((t) => t != null);
  const durationMin =
    times.length >= 2 ? Math.round((times[times.length - 1] - times[0]) / 60000) : null;

  const hasElevation = maxEle !== null;
  return {
    distanceKm: distance / 1000,
    gainM: hasElevation ? Math.round(gain) : null,
    lossM: hasElevation ? Math.round(loss) : null,
    maxEleM: hasElevation ? Math.round(maxEle) : null,
    durationMin: durationMin > 0 ? durationMin : null,
  };
}

// Perfil de elevación: lista de { d: km recorridos, e: altura }.
// Nos quedamos con unos ~120 puntos: de sobra para dibujarlo y mucho más ligero.
export function elevationProfile(points, samples = 120) {
  const all = [];
  let d = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) d += haversine(points[i - 1], points[i]);
    if (points[i].ele !== null) all.push({ d: d / 1000, e: points[i].ele });
  }
  if (all.length < 2) return null;

  const step = Math.max(1, Math.floor(all.length / samples));
  const result = all.filter((_, i) => i % step === 0);
  if (result[result.length - 1] !== all[all.length - 1]) result.push(all[all.length - 1]);
  return result;
}
