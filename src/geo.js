// Saber en qué país y región está una ruta, sin depender de ningún servicio externo.
//
// Usa los archivos de public/geo/ (fronteras simplificadas de Natural Earth,
// generadas con scripts/build-geo.mjs). Se descargan solo cuando hacen falta
// y se guardan en memoria para no repetir la descarga.

import { haversine } from "./stats.js";

// Si cambian los datos o el método, sube este número: las rutas se recalculan solas
export const GEO_VERSION = 1;

const SAMPLE_EVERY_KM = 0.5; // comprobamos un punto cada medio kilómetro
const BASE = `${import.meta.env.BASE_URL}geo`;

const cache = new Map();
function loadJson(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${BASE}/${path}`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
      return r.json();
    }).then(prepare));
  }
  return cache.get(path);
}

export const loadCountries = () => loadJson("countries.json");

// Continente de cada país (código ISO → "Europa", "Asia"…), para organizar el álbum
export async function continentsByIso() {
  const { features } = await loadCountries();
  return new Map(features.map((f) => [f.properties.iso, f.properties.continent]));
}
export const loadRegions = (iso) => loadJson(`regions/${iso}.json`).catch(() => ({ features: [] }));

// Calcula de antemano el rectángulo (bbox) de cada forma: comprobar si un punto está
// dentro de un rectángulo es muy rápido y descarta casi todas las formas
function prepare(fc) {
  for (const f of fc.features) {
    const polys = f.geometry?.type === "Polygon" ? [f.geometry.coordinates]
      : f.geometry?.type === "MultiPolygon" ? f.geometry.coordinates : [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of polys) for (const [x, y] of poly[0]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    f.polys = polys;
    f.bbox = [minX, minY, maxX, maxY];
  }
  return fc;
}

// Algoritmo del "rayo": desde el punto se traza una línea hacia la derecha y se cuentan
// los cruces con el borde. Número impar de cruces = el punto está dentro.
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(feature, x, y) {
  const [minX, minY, maxX, maxY] = feature.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  // Un polígono = contorno exterior + posibles agujeros (lagos, enclaves…)
  return feature.polys.some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((hole) => inRing(x, y, hole)));
}

function find(features, x, y, last) {
  if (last && contains(last, x, y)) return last; // casi siempre el punto sigue en la misma
  return features.find((f) => contains(f, x, y)) ?? null;
}

// Si la simplificación deja un punto justo fuera de todas las regiones del país
// (pasa en costas y fronteras), elegimos la región con el centro más cercano
function nearest(features, x, y) {
  let best = null, bestD = Infinity;
  for (const f of features) {
    const cx = (f.bbox[0] + f.bbox[2]) / 2, cy = (f.bbox[1] + f.bbox[3]) / 2;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

// Devuelve { version, countries: [{ iso, name, km }], regions: [{ id, iso, name, km }] },
// ordenados de más a menos kilómetros
export async function locateRoute(points) {
  const countries = await loadCountries();
  const kmByCountry = new Map(), kmByRegion = new Map();
  let lastCountry = null, lastRegion = null, sinceSample = SAMPLE_EVERY_KM, pending = 0;

  for (let i = 0; i < points.length; i++) {
    const step = i ? haversine(points[i - 1], points[i]) / 1000 : 0;
    sinceSample += step;
    pending += step;
    if (sinceSample < SAMPLE_EVERY_KM && i !== points.length - 1) continue;
    sinceSample = 0;

    const { lon, lat } = points[i];
    const country = find(countries.features, lon, lat, lastCountry);
    if (!country) { pending = 0; continue; } // en el mar: no cuenta
    lastCountry = country;
    const { iso, name } = country.properties;
    const regions = (await loadRegions(iso)).features;
    const region = find(regions, lon, lat, lastRegion) ?? nearest(regions, lon, lat);
    lastRegion = region;

    // El primer punto también cuenta (con 0 km) para que una ruta muy corta tenga país
    const km = pending;
    pending = 0;
    add(kmByCountry, iso, { iso, name }, km);
    if (region) add(kmByRegion, region.properties.id, { id: region.properties.id, iso, name: region.properties.name }, km);
  }

  const sorted = (m) => [...m.values()].sort((a, b) => b.km - a.km).map((v) => ({ ...v, km: +v.km.toFixed(2) }));
  return { version: GEO_VERSION, countries: sorted(kmByCountry), regions: sorted(kmByRegion) };
}

function add(map, key, data, km) {
  const entry = map.get(key) ?? { ...data, km: 0 };
  entry.km += km;
  map.set(key, entry);
}
