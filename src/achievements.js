// Logros: retos que se desbloquean solos con tus rutas. Cada uno tiene una rareza
// fija (la misma escala que las cartas) según lo difícil que es conseguirlo.
//
// Se recalculan siempre a partir de las rutas, recorriéndolas por fecha: así se sabe
// qué ruta desbloqueó cada logro y cuándo, sin guardar nada aparte.

import { computeStats, haversine } from "./stats.js";
import { dayRanges } from "./stages.js";
import { rarityOf } from "./rarity.js";
import { placesOf } from "./album.js";
import { fmtM } from "./format.js";

export const CATEGORIES = [
  { id: "total", name: "Totals", icon: "boot" },
  { id: "explore", name: "Exploration", icon: "globe" },
  { id: "feat", name: "Feats", icon: "peak" },
  { id: "cards", name: "Cards", icon: "card" },
  { id: "habit", name: "Consistency and variety", icon: "calendar" },
];

const SANTIAGO = { lat: 42.8806, lon: -8.5446 };
const km = (v) => `${fmtM(Math.floor(v))} km`;
const m = (v) => `${fmtM(Math.floor(v))} m`;
const n = (v) => fmtM(Math.floor(v));

// level = rareza (0 Común, 1 Rara, 2 Épica, 3 Legendaria)
// value(acc) = cuánto llevas; goal = cuánto hace falta; unit = cómo se muestra
export const ACHIEVEMENTS = [
  // Acumulados
  { id: "routes-1", cat: "total", level: 0, name: "First steps", desc: "Save your first route", goal: 1, value: (a) => a.routes, unit: n },
  { id: "routes-10", cat: "total", level: 1, name: "Regular", desc: "Save 10 routes", goal: 10, value: (a) => a.routes, unit: n },
  { id: "routes-50", cat: "total", level: 2, name: "Veteran", desc: "Save 50 routes", goal: 50, value: (a) => a.routes, unit: n },
  { id: "km-100", cat: "total", level: 0, name: "Century", desc: "Cover 100 km in total", goal: 100, value: (a) => a.km, unit: km },
  { id: "km-500", cat: "total", level: 1, name: "Five hundred", desc: "Cover 500 km in total", goal: 500, value: (a) => a.km, unit: km },
  { id: "km-1000", cat: "total", level: 2, name: "A thousand kilometres", desc: "Cover 1,000 km in total", goal: 1000, value: (a) => a.km, unit: km },
  { id: "km-3000", cat: "total", level: 3, name: "End to end", desc: "Cover 3,000 km in total", goal: 3000, value: (a) => a.km, unit: km },
  { id: "gain-1000", cat: "total", level: 0, name: "First thousand", desc: "Climb 1,000 m in total", goal: 1000, value: (a) => a.gain, unit: m },
  { id: "gain-everest", cat: "total", level: 1, name: "Everesting", desc: "Climb 8,849 m in total, the height of Everest", goal: 8849, value: (a) => a.gain, unit: m },
  { id: "gain-3everest", cat: "total", level: 2, name: "Three Everests", desc: "Climb 26,547 m in total", goal: 26547, value: (a) => a.gain, unit: m },

  // Exploración
  { id: "countries-3", cat: "explore", level: 0, name: "Border crosser", desc: "Do routes in 3 countries", goal: 3, value: (a) => a.countries.size, unit: n },
  { id: "countries-10", cat: "explore", level: 2, name: "Full passport", desc: "Do routes in 10 countries", goal: 10, value: (a) => a.countries.size, unit: n },
  { id: "countries-25", cat: "explore", level: 3, name: "Citizen of the world", desc: "Do routes in 25 countries", goal: 25, value: (a) => a.countries.size, unit: n },
  { id: "continents-3", cat: "explore", level: 1, name: "Three continents", desc: "Do routes on 3 continents", goal: 3, value: (a) => a.continents.size, unit: n },
  { id: "continents-6", cat: "explore", level: 3, name: "Six continents", desc: "Do routes on every inhabited continent", goal: 6, value: (a) => a.continents.size, unit: n },
  { id: "regions-10", cat: "explore", level: 0, name: "Collector", desc: "Earn 10 region badges", goal: 10, value: (a) => a.regions.size, unit: n },
  { id: "regions-40", cat: "explore", level: 2, name: "Master collector", desc: "Earn 40 region badges", goal: 40, value: (a) => a.regions.size, unit: n },
  { id: "country-full", cat: "explore", level: 2, name: "Whole country", desc: "Earn every badge in a country", goal: 1, value: (a) => a.fullCountries, unit: n },

  // Hazañas en una sola ruta (o un solo día de una travesía)
  { id: "day-25", cat: "feat", level: 1, name: "Long day", desc: "Walk 25 km in a day", goal: 25, value: (a) => a.bestWalkDay, unit: km },
  { id: "day-40", cat: "feat", level: 2, name: "Ultra", desc: "Walk 40 km in a day", goal: 40, value: (a) => a.bestWalkDay, unit: km },
  { id: "bike-100", cat: "feat", level: 2, name: "Century ride", desc: "Ride 100 km in a day", goal: 100, value: (a) => a.bestBikeDay, unit: km },
  { id: "climb-1000", cat: "feat", level: 1, name: "Thousand-metre day", desc: "Climb 1,000 m in a day", goal: 1000, value: (a) => a.bestDayGain, unit: m },
  { id: "climb-2000", cat: "feat", level: 2, name: "The wall", desc: "Climb 2,000 m in a day", goal: 2000, value: (a) => a.bestDayGain, unit: m },
  { id: "alt-3000", cat: "feat", level: 1, name: "Three-thousander", desc: "Go above 3,000 m", goal: 3000, value: (a) => a.maxEle, unit: m },
  { id: "alt-5000", cat: "feat", level: 3, name: "Thin air", desc: "Go above 5,000 m", goal: 5000, value: (a) => a.maxEle, unit: m },
  { id: "trip-5", cat: "feat", level: 1, name: "Long trip", desc: "Complete a route of 5 days or more", goal: 5, value: (a) => a.longestTrip, unit: n },

  // Cartas
  { id: "card-rare", cat: "cards", level: 0, name: "Something special", desc: "Get your first Rare card", goal: 1, value: (a) => a.byRarity[1] + a.byRarity[2] + a.byRarity[3], unit: n },
  { id: "card-epic", cat: "cards", level: 1, name: "Epic", desc: "Get your first Epic card", goal: 1, value: (a) => a.byRarity[2] + a.byRarity[3], unit: n },
  { id: "card-legendary", cat: "cards", level: 2, name: "Legend", desc: "Get your first Legendary card", goal: 1, value: (a) => a.byRarity[3], unit: n },
  { id: "card-legendary-5", cat: "cards", level: 3, name: "Legendary hand", desc: "Collect 5 Legendary cards", goal: 5, value: (a) => a.byRarity[3], unit: n },

  // Constancia y variedad
  { id: "all-activities", cat: "habit", level: 1, name: "All-rounder", desc: "Do hiking, biking and a Camino", goal: 3, value: (a) => a.activities.size, unit: n },
  { id: "seasons", cat: "habit", level: 2, name: "Four seasons", desc: "Get out in spring, summer, autumn and winter", goal: 4, value: (a) => a.seasons.size, unit: n },
  { id: "streak-3", cat: "habit", level: 0, name: "Steady", desc: "Do routes 3 months in a row", goal: 3, value: (a) => a.bestStreak, unit: n },
  { id: "streak-12", cat: "habit", level: 3, name: "A year on the trail", desc: "Do routes 12 months in a row", goal: 12, value: (a) => a.bestStreak, unit: n },
  { id: "santiago", cat: "habit", level: 2, name: "Pilgrim", desc: "Reach Santiago on a multi-day Camino route", goal: 1, value: (a) => a.santiago, unit: n },
];

// Estación por mes, al revés en el hemisferio sur
function seasonOf(date, lat) {
  const month = +date.slice(5, 7);
  const north = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][month - 1]; // 0 primavera … 3 invierno
  return lat < 0 ? (north + 2) % 4 : north;
}

// Recorre las rutas de la más antigua a la más reciente.
// continentOf: Map iso → continente; regionTotals: Map iso → nº de regiones del país
export function computeAchievements(routes, continentOf, regionTotals = new Map()) {
  const acc = {
    routes: 0, km: 0, gain: 0, countries: new Set(), continents: new Set(), regions: new Set(),
    regionsByCountry: new Map(), fullCountries: 0, bestWalkDay: 0, bestBikeDay: 0, bestDayGain: 0,
    maxEle: 0, longestTrip: 0, byRarity: [0, 0, 0, 0], activities: new Set(), seasons: new Set(),
    months: new Set(), bestStreak: 0, santiago: 0,
  };
  const unlocked = new Map(); // id → { date, routeId }
  const sorted = [...routes].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  for (const route of sorted) {
    const total = computeStats(route.points);
    acc.routes += 1;
    acc.km += total.distanceKm;
    acc.gain += total.gainM ?? 0;
    acc.maxEle = Math.max(acc.maxEle, total.maxEleM ?? 0);
    acc.activities.add(route.activity);
    acc.byRarity[rarityOf(route).level] += 1;

    const days = dayRanges(route.points, route.stageStarts ?? []);
    acc.longestTrip = Math.max(acc.longestTrip, days.length);
    for (const { start, end } of days) {
      const s = computeStats(route.points.slice(start, end + 1));
      if (route.activity === "bike") acc.bestBikeDay = Math.max(acc.bestBikeDay, s.distanceKm);
      else acc.bestWalkDay = Math.max(acc.bestWalkDay, s.distanceKm);
      acc.bestDayGain = Math.max(acc.bestDayGain, s.gainM ?? 0);
    }

    const places = placesOf(route);
    for (const c of places.countries) {
      acc.countries.add(c.iso);
      if (continentOf.get(c.iso)) acc.continents.add(continentOf.get(c.iso));
    }
    for (const r of places.regions) {
      acc.regions.add(r.id);
      if (!acc.regionsByCountry.has(r.iso)) acc.regionsByCountry.set(r.iso, new Set());
      acc.regionsByCountry.get(r.iso).add(r.id);
    }
    acc.fullCountries = [...acc.regionsByCountry].filter(([iso, set]) => regionTotals.get(iso) && set.size >= regionTotals.get(iso)).length;

    if (route.date) {
      acc.seasons.add(seasonOf(route.date, route.points[0].lat));
      acc.months.add(route.date.slice(0, 7));
      acc.bestStreak = Math.max(acc.bestStreak, streakEndingAt(acc.months, route.date.slice(0, 7)));
    }
    const last = route.points[route.points.length - 1];
    if (route.activity === "camino" && days.length > 1 && haversine(last, SANTIAGO) < 3000) acc.santiago = 1;

    for (const a of ACHIEVEMENTS) {
      if (!unlocked.has(a.id) && a.value(acc) >= a.goal) unlocked.set(a.id, { date: route.date, routeId: route.id });
    }
  }

  // Las rachas se recalculan al final: una ruta antigua puede unir dos rachas
  acc.bestStreak = Math.max(0, ...[...acc.months].map((mo) => streakEndingAt(acc.months, mo)));

  return ACHIEVEMENTS.map((a) => {
    const value = a.value(acc);
    return { ...a, value, done: unlocked.has(a.id) || value >= a.goal, unlock: unlocked.get(a.id) ?? null };
  });
}

// Meses seguidos con rutas que terminan en "AAAA-MM"
function streakEndingAt(months, ym) {
  let [y, mo] = ym.split("-").map(Number), count = 0;
  while (months.has(`${y}-${String(mo).padStart(2, "0")}`)) {
    count += 1;
    mo -= 1;
    if (mo === 0) { mo = 12; y -= 1; }
  }
  return count;
}
