// Rutas de varios días ("etapas").
//
// Una ruta guarda route.stageStarts: las posiciones (índices de punto) donde
// empieza cada día a partir del segundo. Ejemplo: [812, 1630] = 3 días.
// Cada día va desde su punto de inicio hasta el punto anterior al inicio del
// siguiente. El tramo entre ambos (normalmente la noche) no cuenta en ningún día,
// así la duración de cada día no incluye las horas que pasaste durmiendo.

import { haversine } from "./stats.js";

const HOUR_MS = 60 * 60 * 1000;
const LONG_GAP_MS = 6 * HOUR_MS; // 6 h sin moverte = casi seguro has dormido
const NIGHT_GAP_MS = 3 * HOUR_MS; // 3 h si además cambia el día del calendario
const MIN_POINTS_PER_DAY = 2; // cada día necesita al menos 2 puntos

// Propone dónde empieza cada día: donde empieza un <trk> nuevo del GPX, o donde
// hay un hueco largo entre la hora de dos puntos seguidos.
export function detectStageStarts(points, trackStarts = []) {
  const starts = new Set(trackStarts);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].t, b = points[i].t;
    if (a == null || b == null) continue;
    const gap = b - a;
    const newCalendarDay = new Date(a).toDateString() !== new Date(b).toDateString();
    if (gap >= LONG_GAP_MS || (gap >= NIGHT_GAP_MS && newCalendarDay)) starts.add(i);
  }
  return cleanStarts([...starts], points.length);
}

// Ordena, quita repetidos y descarta divisiones pegadas al principio, al final o entre sí
export function cleanStarts(starts, length) {
  const result = [];
  for (const i of [...new Set(starts)].sort((a, b) => a - b)) {
    const prev = result.length ? result[result.length - 1] : 0;
    if (i - prev >= MIN_POINTS_PER_DAY && length - 1 - i >= MIN_POINTS_PER_DAY) result.push(i);
  }
  return result;
}

// [{ start, end }] de cada día (índices de punto, ambos incluidos)
export function dayRanges(points, starts) {
  const bounds = [0, ...starts, points.length];
  return bounds.slice(0, -1).map((start, k) => ({ start, end: bounds[k + 1] - 1 }));
}

// Kilómetros recorridos hasta cada punto: [0, 0.03, 0.07, ...]
export function cumulativeKm(points) {
  const km = [0];
  for (let i = 1; i < points.length; i++) km.push(km[i - 1] + haversine(points[i - 1], points[i]) / 1000);
  return km;
}

// Índice del punto más cercano a un kilómetro dado (búsqueda binaria: la lista está ordenada)
export function indexAtKm(cum, km) {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && km - cum[lo - 1] < cum[lo] - km ? lo - 1 : lo;
}

// Fecha local ("AAAA-MM-DD") del primer punto con hora de ese día, o null
export function dayDate(points, { start, end }) {
  for (let i = start; i <= end; i++) {
    if (points[i].t != null) {
      const d = new Date(points[i].t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return null;
}
