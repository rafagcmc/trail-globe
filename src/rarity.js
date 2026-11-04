// Rareza de cada ruta, como en un juego de cartas: Común, Rara, Épica o Legendaria.
//
// Se calcula solo con los datos del track, sin que tengas que decir nada:
//   1. Esfuerzo del día más duro, en "km-esfuerzo": cada 100 m de subida cuentan
//      como 1 km llano (la regla de Naismith que usan los montañeros).
//      En bici un km llano cuesta mucho menos andando, así que cuenta 1/4.
//   2. Alta montaña: pasar de 3.000 m sube un nivel; pasar de 5.000 m es Legendaria.
//   3. Travesía de 3 días o más: sube un nivel.
// Limitación honesta: no sabe si el terreno era técnico (trepadas, nieve, vías ferratas),
// solo distancia, desnivel, altitud y días.

import { computeStats } from "./stats.js";
import { dayRanges } from "./stages.js";
import { fmtM } from "./format.js";

export const RARITIES = [
  // name = para cartas (femenino); male / males = para logros ("logro épico", "3 épicos")
  { id: "common", name: "Común", male: "Común", males: "comunes", color: "#7d8681", soft: "#f2f3f1" },
  { id: "rare", name: "Rara", male: "Raro", males: "raros", color: "#2f7bbf", soft: "#e9f2fa" },
  { id: "epic", name: "Épica", male: "Épico", males: "épicos", color: "#7a4cc2", soft: "#f1ebfa" },
  { id: "legendary", name: "Legendaria", male: "Legendario", males: "legendarios", color: "#c98a12", soft: "#fdf3dc" },
];

// Km-esfuerzo del día más duro a partir del cual sube la rareza
const EFFORT_STEPS = [12, 22, 35];
const HIGH_M = 3000;
const VERY_HIGH_M = 5000;
const LONG_TRIP_DAYS = 3;

export function effortKm(stats, activity) {
  const flat = activity === "bike" ? stats.distanceKm / 4 : stats.distanceKm;
  return flat + (stats.gainM ?? 0) / 100;
}

// Cache por ruta: los puntos no cambian, pero sí las etapas (se pueden editar)
const cache = new WeakMap();

// Devuelve { level (0-3), rarity, effort, reasons: [textos que explican la rareza] }
export function rarityOf(route) {
  const key = `${route.activity}|${route.stageStarts?.join(",")}`;
  const hit = cache.get(route);
  if (hit?.key === key) return hit.value;

  const days = dayRanges(route.points, route.stageStarts ?? []);
  const dayEfforts = days.map(({ start, end }) => effortKm(computeStats(route.points.slice(start, end + 1)), route.activity));
  const hardest = Math.max(...dayEfforts);
  const total = computeStats(route.points);

  let level = EFFORT_STEPS.filter((step) => hardest >= step).length;
  const reasons = [`${days.length > 1 ? "Día más duro" : "Esfuerzo"}: ${Math.round(hardest)} km-esfuerzo`];
  if (total.maxEleM >= VERY_HIGH_M) {
    level = 3;
    reasons.push(`Altitud extrema: ${fmtM(total.maxEleM)} m`);
  } else if (total.maxEleM >= HIGH_M) {
    level += 1;
    reasons.push(`Alta montaña: ${fmtM(total.maxEleM)} m`);
  }
  if (days.length >= LONG_TRIP_DAYS) {
    level += 1;
    reasons.push(`Travesía de ${days.length} días`);
  }
  level = Math.min(level, 3);

  const value = { level, rarity: RARITIES[level], effort: effortKm(total, route.activity), hardest, reasons };
  cache.set(route, { key, value });
  return value;
}

// Diamantes que marcan la rareza (1 a 4), del color de la rareza
export const gems = (level, color) =>
  `<span class="gems" aria-hidden="true">${Array.from({ length: 4 }, (_, i) =>
    `<svg viewBox="0 0 10 10" width="9" height="9"><path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" fill="${i <= level ? color : "none"}" stroke="${color}" stroke-width="1.2" opacity="${i <= level ? 1 : 0.35}"/></svg>`).join("")}</span>`;
