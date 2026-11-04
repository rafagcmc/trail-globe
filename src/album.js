// Organiza las rutas en el álbum: país → región → rutas, y las ediciones especiales.
// Solo datos (sin HTML): lo pinta collectionView.js.

import { loadRegions, continentsByIso } from "./geo.js";

// Una ruta "cuenta" en una región si recorre al menos 1 km o el 10 % de la ruta en ella.
// Así, pisar una frontera 200 m no rellena un cromo.
const MIN_KM = 1;
const MIN_SHARE = 0.1;

export function placesOf(route) {
  const geo = route.geo;
  if (!geo) return { countries: [], regions: [] };
  const total = geo.regions.reduce((sum, r) => sum + r.km, 0) || 1;
  const keep = (p) => p.km >= MIN_KM || p.km / total >= MIN_SHARE;
  const regions = geo.regions.filter(keep);
  const countries = geo.countries.filter(keep);
  // Una ruta muy corta (menos de 1 km) se queda al menos con su región principal
  return {
    regions: regions.length ? regions : geo.regions.slice(0, 1),
    countries: countries.length ? countries : geo.countries.slice(0, 1),
  };
}

// Edición especial: cruza varias regiones o varios países
export const isSpecial = (route) => {
  const p = placesOf(route);
  return p.regions.length > 1 || p.countries.length > 1;
};

const byDateDesc = (a, b) => (b.date ?? "").localeCompare(a.date ?? "");

// Devuelve {
//   continents: [{ name, countries: [...] }],   ← el orden en que salen en el libro
//   countries: [{ iso, name, continent, regions: [{ id, name, number, routes }], visited, routeCount }],
//   specials: [rutas]
// }
export async function buildAlbum(routes) {
  const countries = new Map();
  for (const route of routes) {
    const places = placesOf(route);
    for (const c of places.countries) {
      if (!countries.has(c.iso)) countries.set(c.iso, { iso: c.iso, name: c.name, routes: new Set() });
      countries.get(c.iso).routes.add(route);
    }
  }

  const continentOf = await continentsByIso();
  const result = [];
  for (const c of countries.values()) {
    const shapes = (await loadRegions(c.iso)).features;
    // Todas las regiones del país, numeradas como en un álbum; se rellenan las visitadas
    const regions = shapes.map((f, i) => ({
      id: f.properties.id,
      name: f.properties.name,
      number: i + 1,
      routes: [...c.routes].filter((r) => placesOf(r).regions.some((p) => p.id === f.properties.id)).sort(byDateDesc),
    }));
    result.push({
      iso: c.iso,
      name: c.name,
      continent: continentOf.get(c.iso) ?? "Otros",
      regions,
      visited: regions.filter((r) => r.routes.length).length,
      routeCount: c.routes.size,
    });
  }
  // Continentes con más rutas primero; dentro de cada uno, los países con más rutas primero
  const groups = new Map();
  for (const c of result) {
    if (!groups.has(c.continent)) groups.set(c.continent, { name: c.continent, countries: [], routeCount: 0 });
    const g = groups.get(c.continent);
    g.countries.push(c);
    g.routeCount += c.routeCount;
  }
  const continents = [...groups.values()].sort((a, b) => b.routeCount - a.routeCount);
  for (const g of continents) g.countries.sort((a, b) => b.routeCount - a.routeCount || a.name.localeCompare(b.name, "es"));

  return {
    continents,
    countries: continents.flatMap((g) => g.countries), // mismo orden que el libro
    specials: routes.filter(isSpecial).sort(byDateDesc),
  };
}
