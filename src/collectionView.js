// Colección en tres niveles, como un zoom:
//   Mundo      → mapa mundi; cada continente se ilumina entero y al pulsarlo entras en él
//   Continente → sus países coloreados según cuántas rutas tienes en cada uno
//   País       → sus regiones; al pulsar una se despliega un panel con su insignia
//                (que sube de nivel con más rutas) y un sello por cada ruta hecha allí
//
// Además del mapa hay otras dos vistas, con pestañas arriba:
//   Cartas → todas tus rutas como cartas, filtrables por rareza
//   Logros → retos desbloqueados y por desbloquear
//
// state = { album, achievements, view, rarity, continent, iso, regionId }
//   view = "map" | "cards" | "achievements"; rarity = filtro de cartas (0-3 o null)
//   regionId = "specials" para las ediciones especiales
// Si hay iso estás en un país; si solo hay continent, en un continente; si no, en el mundo.

import { computeStats } from "./stats.js";
import { loadRegions, loadCountries } from "./geo.js";
import { fmtKm, fmtM, fmtDate, esc, backButton } from "./format.js";
import { cardHtml } from "./cards.js";
import { RARITIES, rarityOf, gems } from "./rarity.js";
import { CATEGORIES } from "./achievements.js";
import { hexMedal } from "./medals.js";

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
  const view = state.view ?? "map";
  if (!album.routes.length) {
    root.innerHTML = `${topBar("world", null, null, view)}<div class="col-empty">Tu colección está vacía. Sube rutas y aquí irán apareciendo tus cartas, los países y regiones por los que has pasado y tus logros.</div>`;
    root.onclick = (e) => {
      if (e.target.closest("[data-close]")) return h.onClose();
      const v = e.target.closest("[data-view]");
      if (v) h.onNavigate({ view: v.dataset.view });
    };
    return;
  }
  if (view !== "map") {
    root.innerHTML = `${topBar("world", null, null, view)}
      ${view === "cards" ? cardsView(album, state.rarity ?? null) : achievementsView(state.achievements)}`;
    root.onclick = (e) => {
      const el = e.target.closest("[data-close], [data-view], [data-rarity], [data-route]");
      if (!el) return;
      const d = el.dataset;
      if (d.close !== undefined) return h.onClose();
      if (d.view) return h.onNavigate({ view: d.view });
      if (d.rarity !== undefined) return h.onNavigate({ rarity: d.rarity === "" || +d.rarity === state.rarity ? null : +d.rarity });
      if (d.route) return h.onOpenRoute(d.route);
    };
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

  root.innerHTML = `
    ${topBar(level, continent, country, view)}
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
    const el = e.target.closest("[data-close], [data-view], [data-world], [data-continent], [data-country], [data-region], [data-route], [data-specials], [data-drawer-close]");
    if (!el) return;
    const d = el.dataset;
    if (d.close !== undefined) return h.onClose();
    if (d.view) return h.onNavigate({ view: d.view });
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

// Barra superior: botón grande para subir un nivel, migas de pan para orientarte
// (Colección › Europa › España) y una X para cerrar la colección desde cualquier nivel
const VIEWS = [["map", "Mapa"], ["cards", "Cartas"], ["achievements", "Logros"]];

function topBar(level, continent, country, view = "map") {
  const back = view === "map" && level === "country" ? backButton(continent, `data-continent="${esc(continent)}"`)
    : view === "map" && level === "continent" ? backButton("Mundo", "data-world")
    : backButton("Globo", "data-close");
  const tabs = `<nav class="col-tabs">${VIEWS.map(([id, label]) =>
    `<button data-view="${id}"${id === view ? ' class="on" aria-current="page"' : ""}>${label}</button>`).join("")}</nav>`;
  if (view !== "map") {
    return `<div class="col-top">${back}${tabs}${closeButton}</div>`;
  }
  const crumbs = [
    level === "world" ? `<strong>Colección</strong>` : `<button class="crumb" data-world>Colección</button>`,
    level === "continent" && `<strong>${esc(continent)}</strong>`,
    level === "country" && `<button class="crumb" data-continent="${esc(continent)}">${esc(continent)}</button>`,
    level === "country" && `<strong>${esc(country.name)}</strong>`,
  ].filter(Boolean);
  return `
    <div class="col-top">
      ${back}
      <nav class="crumbs">${crumbs.join("<span>›</span>")}</nav>
      ${tabs}
      ${closeButton}
    </div>`;
}

const closeButton = `
  <button class="col-close" data-close aria-label="Cerrar colección" title="Cerrar colección">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
  </button>`;

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
      <div class="cards">${album.specials.map((r) => cardHtml(r, album.numbers.get(r.id))).join("")}</div>`;
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
      <div class="drawer-label">Cartas · ${plural(n, "ruta", "rutas")}</div>
      <div class="cards">${region.routes.map((r) => cardHtml(r, album.numbers.get(r.id))).join("")}</div>` : ""}`;
}

function drawerHead(title, sub) {
  return `
    <div class="drawer-head">
      <div><h3>${esc(title)}</h3><span>${esc(sub)}</span></div>
      <button data-drawer-close aria-label="Cerrar">×</button>
    </div>`;
}

// Insignia de región: la misma medalla hexagonal que los logros, del color de su nivel
const badgeSvg = (tier) => tier
  ? hexMedal({ color: tier.color, soft: tier.bg, icon: "peak", size: 84, cls: "badge" })
  : hexMedal({ icon: "lock", locked: true, size: 84, cls: "badge" });

// ---------- Vista Cartas ----------
function cardsView(album, filter) {
  const all = [...album.routes].sort((a, b) => rarityOf(b).level - rarityOf(a).level || album.numbers.get(a.id) - album.numbers.get(b.id));
  const counts = [0, 0, 0, 0];
  for (const r of all) counts[rarityOf(r).level] += 1;
  const shown = filter == null ? all : all.filter((r) => rarityOf(r).level === filter);
  return `
    <div class="cv-layout">
      <aside class="cv-side">
        <h2>Cartas</h2>
        <p class="col-sub">${plural(all.length, "carta", "cartas")} · una por ruta</p>
        <div class="rar-filters">
          <button class="rar-filter${filter == null ? " on" : ""}" data-rarity=""><span class="rf-name">Todas</span><b>${all.length}</b></button>
          ${[...RARITIES].reverse().map((r) => {
            const lvl = RARITIES.indexOf(r);
            return `<button class="rar-filter${filter === lvl ? " on" : ""}" data-rarity="${lvl}" style="--rc:${r.color}" ${counts[lvl] ? "" : "disabled"}>
              ${gems(lvl, r.color)}<span class="rf-name">${r.name}</span><b>${counts[lvl]}</b></button>`;
          }).join("")}
        </div>
        <details class="rar-help">
          <summary>¿Cómo se decide la rareza?</summary>
          <p>Por el día más duro de la ruta, en <b>km-esfuerzo</b>: cada 100 m de subida cuentan como 1 km llano (en bici, el km llano cuenta ¼).</p>
          <ul>
            <li>Común: menos de 12</li><li>Rara: 12 o más</li><li>Épica: 22 o más</li><li>Legendaria: 35 o más</li>
          </ul>
          <p>Sube un nivel si pasas de 3.000 m de altitud o si es una travesía de 3 días o más. Por encima de 5.000 m siempre es Legendaria.</p>
        </details>
      </aside>
      <main class="cv-main">
        <div class="cards cards-wide">${shown.map((r) => cardHtml(r, album.numbers.get(r.id))).join("")}</div>
      </main>
    </div>`;
}

// ---------- Vista Logros ----------
function achievementsView(list) {
  const done = list.filter((a) => a.done).length;
  const byLevel = [0, 0, 0, 0];
  for (const a of list) if (a.done) byLevel[a.level] += 1;
  return `
    <div class="ach-view">
      <header class="ach-head">
        <div>
          <h1>Logros</h1>
          <p>${done} de ${list.length} conseguidos</p>
          <div class="ach-total"><i style="width:${(done / list.length) * 100}%"></i></div>
        </div>
        <div class="ach-counts">${[...RARITIES].reverse().map((r) => {
          const lvl = RARITIES.indexOf(r);
          return `<span style="--rc:${r.color}">${gems(lvl, r.color)}<b>${byLevel[lvl]}</b> ${r.males}</span>`;
        }).join("")}</div>
      </header>
      ${CATEGORIES.map((cat) => {
        const items = list.filter((a) => a.cat === cat.id).sort((a, b) => b.done - a.done || a.level - b.level);
        return `
          <section class="ach-section">
            <h2>${esc(cat.name)} <span>${items.filter((a) => a.done).length}/${items.length}</span></h2>
            <div class="ach-grid">${items.map((a) => achievementTile(a, cat.icon)).join("")}</div>
          </section>`;
      }).join("")}
    </div>`;
}

function achievementTile(a, icon) {
  const r = RARITIES[a.level];
  const pct = Math.min(100, (a.value / a.goal) * 100);
  return `
    <article class="ach${a.done ? " done" : ""}" style="--rc:${r.color};--rs:${r.soft}">
      ${hexMedal({ color: r.color, soft: r.soft, icon, locked: !a.done, size: 52 })}
      <div class="ach-body">
        <span class="ach-rarity">${gems(a.level, a.done ? r.color : "#b9c0b7")}${r.male}</span>
        <strong>${esc(a.name)}</strong>
        <span class="ach-desc">${esc(a.desc)}</span>
        ${a.done
          ? `<span class="ach-when">${a.unlock?.date ? `Conseguido el ${fmtDate(a.unlock.date).toLowerCase()}` : "Conseguido"}</span>`
          : `<span class="ach-progress"><i style="width:${pct}%"></i></span><span class="ach-when">${a.unit(a.value)} / ${a.unit(a.goal)}</span>`}
      </div>
    </article>`;
}
