// Cálculos sobre una lista de puntos [{ lat, lon, ele }]

const EARTH_RADIUS_M = 6371000;

// Distancia entre dos puntos sobre la esfera (fórmula del haversine), en metros
function haversine(a, b) {
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

  for (let i = 1; i < points.length; i++) {
    distance += haversine(points[i - 1], points[i]);

    const prev = points[i - 1].ele;
    const curr = points[i].ele;
    // El GPS da pequeños saltos de altura; ignoramos subidas de menos de 1 m
    // para no inflar el desnivel con ruido.
    if (prev !== null && curr !== null && curr - prev > 1) {
      gain += curr - prev;
    }
  }

  const hasElevation = points.some((p) => p.ele !== null);
  return {
    distanceKm: distance / 1000,
    gainM: hasElevation ? Math.round(gain) : null,
  };
}
