// Colección en tres niveles, como un zoom:
//   Mundo      → mapa mundi; cada continente se ilumina entero y al pulsarlo entras en él
//   Continente → sus países coloreados según cuántas rutas tienes en cada uno
//   País       → sus regiones; al pulsar una se despliega un panel con su insignia
//                (que sube de nivel con más rutas) y un sello por cada ruta hecha allí
//
// state = { album, continent, iso, regionId }   (regionId = "specials" para las ediciones especiales)
// Si hay iso estás en un país; si solo hay continent, en un continente; si no, en el mundo.

import { activityOf } from "./activities.js";
import { computeStats } from "./stats.js";
import { loadRegions, loadCountries } from "./geo.js";
import { isSpecial } from "./album.js";
import { fmtKm, fmtM, fmtDate, esc } from "./format.js";

// Niveles de insignia según el número de rutas en la región
const TIERS = [
  { min: 10, name: "Platino", color: "#5f7d8c", bg: "#e8f0f3" },
  { min: 5, name: "Oro", color: "#d9a21b", bg: "#fff4d6" },
  { min: 2, name: "Plata", color: "#98a2aa", bg: "#eef1f3" },
  { min: 1, name: "Bronce", color: "#b8763e", bg: "#f8eadf" },
];
const tierOf = (n) => TIERS.find((t) => n >= t.min) ?? null;
const nextTier = (n) => [...TIERS].reverse().find((t) => t.min > n) ?? null;

// Color en el mapa: más intenso cuantas más rutas
const shade = (n) => (n >= 5 ? "#e8890c" : n >= 2 ? "#f0a954" : n >= 1 ? "#f7cf9a" : "#e4e8e2");

// Encuadre de cada continente [oeste, sur, este, norte] y dónde va su nombre en el mapa mundi.
// Se recorta a mano porque algunos países tienen territorios lejos (Francia en Sudamérica,
// Rusia hasta el Pacífico) y encuadrarlos enteros dejaría el continente diminuto.
const CONTINENTS = {
  "Europa": { view: [-25, 35, 45, 71.5], label: [15, 54] },
  "Asia": { view: [25, -11, 150, 56], label: [92, 46] },
  "África": { view: [-20, -36, 55, 38], label: [18, 6] },
  "América del Norte": { view: [-170, 6, -50, 75], label: [-102, 44] },
  "América del Sur": { view: [-85, -56, -33, 13], label: [-60, -16] },
  "Oceanía": { view: [110, -48, 180, -5], label: [135, -25] },
};
const WORLD_VIEW = [-170, -56, 190, 80];

export async function renderCollection(root, state, h) {
  const { album } = state;
  if (!album.countries.length) {
    root.innerHTML = `${topBar([])}<div class="col-empty">Tu colección está vacía. Sube rutas y aquí irán apareciendo los países y regiones por los que has pasado.</div>`;
    root.onclick = (e) => e.target.closest("[data-close]") && h.onClose();
    return;
  }
  const world = await loadCountries();
  const country = album.countries.find((c) => c.iso === state.iso) ?? null;
  const continent = country?.continent ?? (CONTINENTS[state.continent] ? state.continent : null);
  const level = country ? "country" : continent ? "continent" : "world";
  const nav = (patch) => h.onNavigate({ continent, iso: country?.iso ?? null, regionId: null, ...patch });

  let head, map;
  if (level === "country") {
    const shapes = await loadRegions(country.iso);
    head = `<h1>${esc(country.name)}</h1>
      <p>${country.visited} de ${country.regions.length} regiones · ${totals(countryRoutes(country))}</p>`;
    map = regionsSvg(shapes.features, country, state.regionId);
  } else if (level === "continent") {
    const group = album.continents.find((g) => g.name === continent);
    const total = world.features.filter((f) => f.properties.continent === continent).length;
    head = `<h1>${esc(continent)}</h1>
      <p>${group ? `${group.countries.length} de ${total} países · ${totals(continentRoutes(group))}` : "Aún no tienes rutas en este continente"}</p>`;
    map = countriesSvg(world.features, album, continent);
  } else {
    const routes = [...new Set(album.countries.flatMap(countryRoutes))];
    head = `<h1>Mundo</h1>
      <p>${plural(album.countries.length, "país", "países")} en ${plural(album.continents.length, "continente", "continentes")} · ${totals(routes)}</p>`;
    map = countriesSvg(world.features, album, null);
  }

  const crumbs = [
    level !== "world" && ["Colección", "data-world"],
    level === "country" && [continent, `data-continent="${esc(continent)}"`],
  ].filter(Boolean);
  const current = level === "world" ? "Colección" : level === "continent" ? continent : country.name;

  root.innerHTML = `
    ${topBar(crumbs, current)}
    <div class="col-layout">
      <aside class="col-side">${level === "world" ? continentList(album, world) : countryList(album, continent, country)}</aside>
      <main class="col-main">
        <header class="col-head">${head}</header>
        <div class="col-map">${map}</div>
        <div class="col-legend">
          ${[[0, "Sin visitar"], [1, "1 ruta"], [2, "2–4 rutas"], [5, "5 o más"]].map(([n, l]) => `<span><i style="background:${shade(n)}"></i>${l}</span>`).join("")}
        </div>
        <div class="col-tooltip" hidden></div>
      </main>
      <aside class="col-drawer${state.regionId ? " open" : ""}">${state.regionId ? drawerHtml(album, country, state.regionId) : ""}</aside>
    </div>`;

  // Delegación de eventos: un solo "escuchador" para toda la vista
  root.onclick = (e) => {
    const el = e.target.closest("[data-close], [data-world], [data-continent], [data-country], [data-region], [data-route], [data-specials], [data-drawer-close]");
    if (!el) return;
    const d = el.dataset;
    if (d.close !== undefined) return h.onClose();
    if (d.drawerClose !== undefined) return nav({});
    if (d.world !== undefined) return nav({ continent: null, iso: null });
    if (d.continent) return nav({ continent: d.continent, iso: null });
    if (d.country) return nav({ iso: d.country });
    if (d.specials !== undefined) return nav({ regionId: "specials" });
    if (d.region) return nav({ regionId: d.region });
    if (d.route) return h.onOpenRoute(d.route);
  };

  // Al pasar el ratón por el mapa: nombre y número de rutas junto al cursor
  const tip = root.querySelector(".col-tooltip");
  const main = root.querySelector(".col-main");
  main.addEventListener("mousemove", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return (tip.hidden = true);
    tip.hidden = false;
    tip.textContent = el.dataset.tip;
    const box = main.getBoundingClientRect();
    tip.style.left = `${e.clientX - box.left + 14}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
  });
  main.addEventListener("mouseleave", () => (tip.hidden = true));
}

// ---------- Piezas ----------
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const countryRoutes = (c) => [...new Set(c.regions.flatMap((r) => r.routes))];
// Sin repetir: una ruta que cruza dos países del mismo continente cuenta una vez
const continentRoutes = (g) => [...new Set(g.countries.flatMap(countryRoutes))];
const routesTip = (name, n) => `${name} · ${n ? plural(n, "ruta", "rutas") : "sin visitar"}`;

function totals(routes) {
  let km = 0, gain = 0;
  for (const r of routes) { const s = computeStats(r.points); km += s.distanceKm; gain += s.gainM ?? 0; }
  return `${plural(routes.length, "ruta", "rutas")} · ${fmtKm(km)} · +${fmtM(gain)} m`;
}

// Migas de pan: Globo › Colección › Europa › España (las anteriores se pueden pulsar)
function topBar(links, current = "Colección") {
  return `
    <div class="col-top">
      <nav class="crumbs">
        <button class="crumb" data-close>Globo</button>
        ${links.map(([label, attr]) => `<span>›</span><button class="crumb" ${attr}>${esc(label)}</button>`).join("")}
        <span>›</span><strong>${esc(current)}</strong>
      </nav>
    </div>`;
}

const summary = (album) => `
  <h2>Colección</h2>
  <p class="col-sub">${plural(album.countries.length, "país", "países")} · ${album.countries.reduce((s, c) => s + c.visited, 0)} insignias</p>`;

const specialsButton = (album) => album.specials.length
  ? `<button class="col-specials" data-specials>★ Ediciones especiales <span>${album.specials.length}</span></button>` : "";

// Nivel mundo: solo los continentes (con rutas primero), así la lista es corta
function continentList(album, world) {
  const names = Object.keys(CONTINENTS).sort((a, b) =>
    (album.continents.find((g) => g.name === b)?.countries.length ?? 0) - (album.continents.find((g) => g.name === a)?.countries.length ?? 0));
  return `
    ${summary(album)}
    <div class="col-group">Continentes</div>
    ${names.map((name) => {
      const done = album.continents.find((g) => g.name === name)?.countries.length ?? 0;
      const total = world.features.filter((f) => f.properties.continent === name).length;
      return `
        <button class="col-country${done ? "" : " empty"}" data-continent="${esc(name)}">
          <span class="row"><strong>${esc(name)}</strong><span>${done}/${total} países</span></span>
          <span class="bar"><i style="width:${done ? Math.max(3, (done / total) * 100) : 0}%"></i></span>
        </button>`;
    }).join("")}
    ${specialsButton(album)}`;
}

// Nivel continente o país: solo los países de ese continente
function countryList(album, continent, current) {
  const group = album.continents.find((g) => g.name === continent);
  return `
    ${summary(album)}
    <button class="col-back" data-world>← Todos los continentes</button>
    <div class="col-group">${esc(continent)}</div>
    ${group ? group.countries.map((c) => `
      <button class="col-country${c.iso === current?.iso ? " on" : ""}" data-country="${c.iso}">
        <span class="row"><strong>${esc(c.name)}</strong><span>${c.visited}/${c.regions.length}</span></span>
        <span class="bar"><i style="width:${Math.max(3, (c.visited / c.regions.length) * 100)}%"></i></span>
      </button>`).join("") : `<p class="col-none">Aún no tienes rutas aquí.</p>`}
    ${specialsButton(album)}`;
}

// ---------- Mapa de países (mundo o continente) ----------
// Proyección de Mercator: la de los mapas de siempre, así los continentes se reconocen
const MAP_W = 760, MAP_H = 520, INSET_W = 150, INSET_H = 100;
const mercY = (lat) => -Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * (180 / Math.PI);

function countriesSvg(features, album, focus) {
  const [w, s, e, n] = focus ? CONTINENTS[focus].view : WORLD_VIEW;
  const top = mercY(n), bottom = mercY(s);
  // En un continente se deja un margen alrededor del encuadre donde el mapa se difumina
  const PAD = focus ? 36 : 0;
  const k = Math.min((MAP_W - 2 * PAD) / (e - w), (MAP_H - 2 * PAD) / (bottom - top));
  const ox = (MAP_W - (e - w) * k) / 2, oy = (MAP_H - (bottom - top) * k) / 2;
  // En el mapa mundi, lo que queda al oeste de -170° (puntas de Rusia, islas) se pasa al otro lado
  const shift = (x) => (!focus && x < w ? x + 360 : x);
  const proj = ([x, y]) => [ox + (shift(x) - w) * k, oy + (mercY(y) - top) * k];
  const visible = (f) => !focus || (f.bbox[2] > w - 5 && f.bbox[0] < e + 5 && f.bbox[3] > s - 5 && f.bbox[1] < n + 5);
  const pathOf = (f) => f.polys.map((poly) => poly.map((ring) => {
    // Los anillos que cruzan el corte del mapa mundi se dibujan sin desplazar para no partirlos
    const crosses = !focus && ring.some(([x]) => x < w) && ring.some(([x]) => x > w);
    return "M" + ring.map((pt) => (crosses ? [ox + (pt[0] - w) * k, oy + (mercY(pt[1]) - top) * k] : proj(pt)).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z";
  }).join("")).join("");

  const routesOf = new Map(album.countries.map((c) => [c.iso, countryRoutes(c).length]));
  const byIso = new Map(album.countries.map((c) => [c.iso, c]));

  let svg = "";
  if (focus) {
    // Continente: los países de alrededor en gris claro, como contexto
    for (const f of features) {
      if (!visible(f) || f.properties.continent === "Antártida") continue;
      const { iso, name, continent } = f.properties;
      if (continent !== focus) { svg += `<path d="${pathOf(f)}" class="ctx"/>`; continue; }
      const count = routesOf.get(iso) ?? 0;
      svg += byIso.has(iso)
        ? `<path d="${pathOf(f)}" fill="${shade(count)}" class="visited" data-country="${iso}" data-tip="${esc(routesTip(name, count))}"/>`
        : `<path d="${pathOf(f)}" fill="${shade(0)}" class="muted" data-tip="${esc(routesTip(name, 0))}"/>`;
    }
  } else {
    // Mundo: los países de cada continente juntos en un <g>, que se ilumina y se pulsa entero
    for (const [name, { label }] of Object.entries(CONTINENTS)) {
      const group = album.continents.find((g) => g.name === name);
      const tipText = group
        ? `${name} · ${plural(group.countries.length, "país", "países")} · ${plural(continentRoutes(group).length, "ruta", "rutas")}`
        : `${name} · sin visitar`;
      const paths = features.filter((f) => f.properties.continent === name)
        .map((f) => `<path d="${pathOf(f)}" fill="${shade(routesOf.get(f.properties.iso) ?? 0)}"/>`).join("");
      svg += `<g class="continent" data-continent="${esc(name)}" data-tip="${esc(tipText)}">${paths}</g>`;
    }
    for (const [name, { label }] of Object.entries(CONTINENTS)) {
      const [x, y] = proj(label);
      svg += `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" class="col-label">${esc(name)}</text>`;
    }
  }
  if (focus) {
    // El recorte del continente se difumina en los bordes en vez de acabar en línea recta
    const x0 = ox - PAD, y0 = oy - PAD, w0 = (e - w) * k + 2 * PAD, h0 = (bottom - top) * k + 2 * PAD;
    const fade = (id, x2, y2) => {
      const edge = (PAD / (x2 ? w0 : h0)).toFixed(3); // el difuminado ocupa solo el margen
      return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${edge}" stop-color="#fff"/>
        <stop offset="${1 - edge}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    };
    const mask = (id, grad) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${w0}" height="${h0}">
      <rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" fill="url(#${grad})"/></mask>`;
    svg = `<defs>${fade("fadeX", 1, 0)}${fade("fadeY", 0, 1)}${mask("maskX", "fadeX")}${mask("maskY", "fadeY")}</defs>
      <g mask="url(#maskX)"><g mask="url(#maskY)">${svg}</g></g>`;
  }
  return `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" class="${focus ? "continent-map" : "world-map"}" role="img" aria-label="Mapa">${svg}</svg>`;
}

// ---------- Mapa de regiones (país) ----------
// Proyección sencilla (longitud corregida por la latitud). Las islas y territorios lejanos
// (Canarias, Alaska, Hawái…) se dibujan en recuadros aparte para que el mapa no se encoja.

function regionsSvg(features, country, selectedId) {
  const polysOf = (f) => (f.geometry?.type === "Polygon" ? [f.geometry.coordinates] : f.geometry?.type === "MultiPolygon" ? f.geometry.coordinates : []);
  const bbox = (rings) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
    return [a, b, c, d];
  };
  const area = ([a, b, c, d]) => (c - a) * (d - b);

  // Agrupamos los polígonos en "islas" de tierra: dos polígonos van juntos si sus
  // rectángulos están a menos de 1,5° entre sí. La isla con más regiones es el mapa
  // principal; las demás (Canarias, Alaska, Hawái…) van en recuadros aparte.
  const all = features.flatMap((f) => polysOf(f).map((poly) => ({ f, poly, box: bbox([poly[0]]) })));
  const GAP = 1.5;
  const near = (a, b) => a.box[0] - GAP < b.box[2] && b.box[0] - GAP < a.box[2] && a.box[1] - GAP < b.box[3] && b.box[1] - GAP < a.box[3];
  const parent = all.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (near(all[i], all[j])) parent[root(i)] = root(j);
  const clusters = new Map();
  all.forEach((p, i) => { const r = root(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(p); });
  const regionsIn = (parts) => new Set(parts.map((p) => p.f.properties.id));
  const sorted = [...clusters.values()].sort((a, b) => regionsIn(b).size - regionsIn(a).size || area(bbox(b.map((p) => p.poly[0]))) - area(bbox(a.map((p) => p.poly[0]))));
  const main = sorted[0];
  const inMain = regionsIn(main);
  // Solo merecen recuadro las islas con alguna región que no aparezca ya en el mapa principal
  const insets = sorted.slice(1).filter((parts) => [...regionsIn(parts)].some((id) => !inMain.has(id))).slice(0, 5);

  const fit = (parts, x0, y0, w, h) => {
    const [a, b, c, d] = bbox(parts.map((p) => p.poly[0]));
    const k = Math.cos((((b + d) / 2) * Math.PI) / 180);
    const s = Math.min(w / ((c - a) * k || 1e-9), h / (d - b || 1e-9));
    const ox = x0 + (w - (c - a) * k * s) / 2, oy = y0 + (h - (d - b) * s) / 2;
    return ([x, y]) => [ox + (x - a) * k * s, oy + (d - y) * s];
  };
  const pathOf = (poly, proj) =>
    poly.map((ring) => "M" + ring.map((pt) => proj(pt).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z").join("");

  // Agrupamos por región para que cada región sea un único <path> pulsable
  const draw = (parts, proj) => {
    const byRegion = new Map();
    for (const p of parts) byRegion.set(p.f.properties.id, (byRegion.get(p.f.properties.id) ?? "") + pathOf(p.poly, proj));
    return [...byRegion].map(([id, d]) => {
      const region = country.regions.find((r) => r.id === id);
      const n = region?.routes.length ?? 0;
      const cls = [n ? "visited" : "", id === selectedId ? "selected" : ""].join(" ").trim();
      return `<path d="${d}" data-region="${esc(id)}" data-tip="${esc(routesTip(region?.name ?? "", n))}" fill="${shade(n)}" class="${cls}"/>`;
    }).join("");
  };

  const insetRows = insets.length ? INSET_H + 16 : 0;
  let svg = draw(main, fit(main, 0, 0, MAP_W, MAP_H - insetRows));
  insets.forEach((parts, i) => {
    const x = i * (INSET_W + 12), y = MAP_H - INSET_H;
    svg += `<rect x="${x}" y="${y}" width="${INSET_W}" height="${INSET_H}" rx="8" class="inset"/>`;
    svg += draw(parts, fit(parts, x + 8, y + 8, INSET_W - 16, INSET_H - 16));
  });

  return `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="Mapa de regiones">${svg}</svg>`;
}

// ---------- Panel desplegable: insignia + sellos ----------
function drawerHtml(album, country, regionId) {
  if (regionId === "specials") {
    return `
      ${drawerHead("Ediciones especiales", "Rutas que cruzan varias regiones o países")}
      <div class="stamps">${album.specials.map((r) => stamp(r, true)).join("")}</div>`;
  }
  const region = country.regions.find((r) => r.id === regionId);
  if (!region) return "";
  const n = region.routes.length;
  const tier = tierOf(n);
  const next = nextTier(n);

  return `
    ${drawerHead(region.name, country.name)}
    <div class="badge-block">
      ${badgeSvg(tier)}
      <div>
        <strong>${tier ? `Insignia de ${tier.name.toLowerCase()}` : "Insignia bloqueada"}</strong>
        <span>${n ? totals(region.routes) : "Aún no tienes rutas en esta región"}</span>
        ${next ? `
          <div class="tier-progress"><i style="width:${(n / next.min) * 100}%;background:${next.color}"></i></div>
          <small>${n ? `${plural(next.min - n, "ruta más", "rutas más")} para ${next.name}` : "Haz tu primera ruta aquí para conseguirla"}</small>` : "<small>Nivel máximo conseguido</small>"}
      </div>
    </div>
    ${n ? `
      <div class="drawer-label">Sellos · ${plural(n, "ruta", "rutas")}</div>
      <div class="stamps">${region.routes.map((r) => stamp(r, isSpecial(r))).join("")}</div>` : ""}`;
}

function drawerHead(title, sub) {
  return `
    <div class="drawer-head">
      <div><h3>${esc(title)}</h3><span>${esc(sub)}</span></div>
      <button data-drawer-close aria-label="Cerrar">×</button>
    </div>`;
}

const hexPoints = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((60 * k - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");

function badgeSvg(tier) {
  if (!tier) {
    return `<svg class="badge" viewBox="0 0 104 112"><polygon points="${hexPoints(52, 56, 50)}" fill="#f4f5f3" stroke="#d9ddd7" stroke-width="2" stroke-dasharray="5 5"/>
      <rect x="42" y="54" width="20" height="16" rx="3" fill="#d3d8d1"/><path d="M45 54 v-5 a7 7 0 0 1 14 0 v5" fill="none" stroke="#d3d8d1" stroke-width="3"/></svg>`;
  }
  return `<svg class="badge" viewBox="0 0 104 112"><polygon points="${hexPoints(52, 56, 52)}" fill="${tier.color}"/><polygon points="${hexPoints(52, 56, 44)}" fill="${tier.bg}"/>
    <path d="M26 74 L42 50 L50 60 L62 40 L80 74 Z" fill="${tier.color}"/><path d="M58 46 L62 40 L66 46" fill="none" stroke="#fff" stroke-width="2"/></svg>`;
}

// Sello de una ruta: círculo "estampado" con su forma, fecha y kilómetros, un poco torcido
function stamp(route, special) {
  const color = activityOf(route.activity).color;
  const km = fmtKm(computeStats(route.points).distanceKm).toUpperCase();
  const date = route.date ? fmtDate(route.date).toUpperCase() : "SIN FECHA";
  // Inclinación "aleatoria" pero estable: depende del id de la ruta
  const tilt = ((parseInt(route.id.slice(0, 4), 16) % 15) - 7).toFixed(0);
  return `
    <button class="stamp" data-route="${route.id}" title="${esc(route.name)}" style="--tilt:${tilt}deg">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r="64" fill="none" stroke="${special ? "#d9a21b" : color}" stroke-width="3"/>
        <circle cx="70" cy="70" r="56" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>
        <g transform="translate(32 40)">${routeShape(route, color)}</g>
        <text x="70" y="30" text-anchor="middle" font-size="9" font-weight="600" letter-spacing="1.5" fill="${color}">${esc(date)}</text>
        <text x="70" y="114" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1" fill="${color}">${special ? "★ " : ""}${esc(km)}</text>
      </svg>
      <span>${esc(route.name)}</span>
    </button>`;
}

// Forma de la ruta encajada en 76 × 56 dentro del sello
function routeShape(route, color) {
  const W = 76, H = 56;
  const step = Math.max(1, Math.floor(route.points.length / 120));
  const pts = route.points.filter((_, i) => i % step === 0);
  const k = Math.cos((pts[0].lat * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * k), ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min(W / (maxX - minX || 1e-9), H / (maxY - minY || 1e-9));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  const d = xs.map((x, i) => `${i ? "L" : "M"}${(ox + (x - minX) * s).toFixed(1)} ${(oy + (ys[i] - minY) * s).toFixed(1)}`).join(" ");
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}
