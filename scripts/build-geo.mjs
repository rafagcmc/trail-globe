// Genera los datos de fronteras que usa el álbum (public/geo/).
//
//   npm run build:geo
//
// Descarga Natural Earth (dominio público), simplifica las formas para que pesen
// poco y crea:
//   public/geo/countries.json      → países del mundo (para saber en qué país cae un punto)
//   public/geo/regions/XX.json     → regiones de cada país (XX = código ISO, p. ej. ES)
//
// Solo hace falta volver a ejecutarlo si quieres cambiar cómo se agrupan las regiones.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import mapshaper from "mapshaper";

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const CACHE = "scripts/.cache";
const OUT = "public/geo";

// En algunos países la unidad de Natural Earth es la provincia; para el álbum
// tiene más sentido agruparlas en algo más grande (comunidades, regiones…).
const GROUP_BY = {
  ES: "region", // provincias → comunidades autónomas
  IT: "region", // provincias → regiones
  FR: "region", // departamentos → regiones
  GB: "geonunit", // distritos → Inglaterra, Escocia, Gales, Irlanda del Norte
  IE: "region",
  PT: null,
};

// Nombres que Natural Earth no trae bien (la app está en inglés)
const RENAME = {
  ES: {
    "Canary Is.": "Canary Islands",
    Valenciana: "Valencia",
    "Foral de Navarra": "Navarre",
    "Islas Baleares": "Balearic Islands",
    Andalucía: "Andalusia",
    Cataluña: "Catalonia",
    "País Vasco": "Basque Country",
    "Castilla y León": "Castile and León",
    "Castilla-La Mancha": "Castile-La Mancha",
  },
  FR: { Bretagne: "Brittany", Corse: "Corsica", "Guyane française": "French Guiana", Normandie: "Normandy" },
  IT: { Lombardia: "Lombardy", Piemonte: "Piedmont", Toscana: "Tuscany", Sicilia: "Sicily", Sardegna: "Sardinia", "Trentino-Alto Adige": "Trentino-South Tyrol" },
};

// Nombres de país más cortos o más habituales que los de Natural Earth
const COUNTRY_NAMES = {
  "United States of America": "United States",
  "People's Republic of China": "China",
  "Republic of the Congo": "Congo",
  "Democratic Republic of the Congo": "DR Congo",
};

const CONTINENTS = {
  "Seven seas (open ocean)": "Remote islands",
};

async function download(name) {
  const file = `${CACHE}/${name}.geojson`;
  if (!existsSync(file)) {
    console.log(`Descargando ${name}…`);
    const res = await fetch(`${NE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(await readFile(file, "utf8"));
}

// Ejecuta mapshaper sobre un GeoJSON en memoria y devuelve el resultado
async function shape(geojson, commands) {
  const out = await mapshaper.applyCommands(`-i in.json ${commands} -o out.json format=geojson precision=0.0001`, {
    "in.json": JSON.stringify(geojson),
  });
  return JSON.parse(out["out.json"]);
}

await mkdir(CACHE, { recursive: true });
await mkdir(`${OUT}/regions`, { recursive: true });

// ---------- Países ----------
const countries = await download("ne_50m_admin_0_countries");
for (const f of countries.features) {
  const p = f.properties;
  f.properties = {
    iso: p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ADM0_A3,
    name: COUNTRY_NAMES[p.NAME_EN] ?? (p.NAME_EN || p.NAME),
    continent: CONTINENTS[p.CONTINENT] ?? p.CONTINENT, // para organizar el álbum por continentes
  };
}
const countriesOut = await shape(countries, "-simplify 20% keep-shapes -filter-fields iso,name,continent");
await writeFile(`${OUT}/countries.json`, JSON.stringify(countriesOut));

// ---------- Regiones ----------
const admin1 = await download("ne_10m_admin_1_states_provinces");
const byCountry = {};
for (const f of admin1.features) {
  const iso = f.properties.iso_a2;
  if (!iso || iso === "-1" || iso === "-99") continue;
  (byCountry[iso] ??= []).push(f);
}

const index = {};
for (const [iso, features] of Object.entries(byCountry)) {
  const field = GROUP_BY[iso];
  for (const f of features) {
    const p = f.properties;
    const raw = (field && p[field]) || p.name_en || p.name || "Unnamed";
    const name = RENAME[iso]?.[raw] ?? raw;
    f.properties = { label: name }; // "label" y no "name": "name" es una palabra reservada de mapshaper
  }
  const fc = { type: "FeatureCollection", features };
  // -dissolve une las provincias que pertenecen a la misma región
  const out = await shape(fc, "-dissolve label -simplify 8% keep-shapes -clean");
  for (const f of out.features) f.properties = { name: f.properties.label ?? "Unnamed" };
  out.features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, "en"));
  // El id de cada región es "país/nombre": legible y estable entre ejecuciones
  for (const f of out.features) f.properties.id = `${iso}/${f.properties.name}`;
  await writeFile(`${OUT}/regions/${iso}.json`, JSON.stringify(out));
  index[iso] = out.features.length;
}

console.log(`Listo: ${Object.keys(index).length} países. España tiene ${index.ES} regiones.`);
