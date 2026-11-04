// "Map as MapLibreMap": la clase del mapa se llama Map, igual que el Map de JavaScript
// (diccionario clave → valor). La renombramos para poder usar los dos sin confusión.
import { Map as MapLibreMap, NavigationControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre procesa las teselas en un "worker" (un hilo aparte para no congelar la página).
// Vite reempaqueta la librería y MapLibre deja de encontrar ese archivo, así que le
// decimos dónde está. "?url" hace que Vite nos dé la ruta final del archivo.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./style.css";
import { parseTrack } from "./parseTrack.js";
import { computeStats } from "./stats.js";
import {
  saveRoute, loadRoutes, deleteRoute, savePhoto, deletePhotos,
  saveFolder, loadFolders, deleteFolder,
} from "./storage.js";
import { resizeImage } from "./photos.js";
import { activityOf } from "./activities.js";
import { fmtKm, fmtM, fmtDuration, esc } from "./format.js";
import { renderHome, renderFolder, collectionSummary } from "./ui.js";
import { renderDetail } from "./detail.js";
import { detectStageStarts, cleanStarts, dayRanges, cumulativeKm, indexAtKm } from "./stages.js";
import { openRouteDialog } from "./routeDialog.js";
import { pickRoutes } from "./routePicker.js";
import { locateRoute, GEO_VERSION, continentsByIso } from "./geo.js";
import { buildAlbum } from "./album.js";
import { renderCollection } from "./collectionView.js";
import { computeAchievements, CATEGORIES } from "./achievements.js";
import { RARITIES } from "./rarity.js";
import { hexMedal } from "./medals.js";
import { initSheet } from "./sheet.js";
import { newId } from "./id.js";

setWorkerUrl(workerUrl);

// ======================= Mapa =======================
// Estilo vectorial de OpenFreeMap (gratis, sin clave). El mapa llega como
// formas y textos y se dibuja en tu pantalla: nítido a cualquier zoom.
const map = new MapLibreMap({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-3.7, 40.4], // [longitud, latitud]: empezamos sobre la península
  zoom: 2,
});
map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

// Relieve: datos de elevación públicos de AWS ("terrarium" = formato de esas teselas)
const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

map.on("load", () => {
  map.setProjection({ type: "globe" });

  // Una fuente de elevación para el relieve 3D y otra para el sombreado
  const dem = { type: "raster-dem", tiles: DEM_TILES, tileSize: 256, maxzoom: 15, encoding: "terrarium" };
  map.addSource("terrain", { ...dem, attribution: "Terrain: Mapzen / AWS Open Data" });
  map.addSource("hillshade", dem);
  map.setTerrain({ source: "terrain", exaggeration: 1.3 });

  // Sombreado de montañas, metido por debajo de los textos del mapa
  const firstLabelLayer = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: "hillshade",
      type: "hillshade",
      source: "hillshade",
      paint: { "hillshade-exaggeration": 0.4, "hillshade-shadow-color": "#5a4a3a" },
    },
    firstLabelLayer
  );

  map.addSource("routes", { type: "geojson", data: emptyCollection() });
  map.addSource("starts", { type: "geojson", data: emptyCollection() });

  const lineLayout = { "line-join": "round", "line-cap": "round" };
  // Borde blanco debajo + línea de color encima: se lee sobre cualquier fondo.
  // ["get", "color"] lee el color de cada ruta de sus propiedades (según la actividad).
  map.addLayer({ id: "routes-casing", type: "line", source: "routes", layout: lineLayout,
    paint: { "line-color": "#ffffff", "line-width": 7 } });
  map.addLayer({ id: "routes-line", type: "line", source: "routes", layout: lineLayout,
    paint: { "line-color": ["get", "color"], "line-width": 4 } });
  // La ruta seleccionada, más gruesa. El filtro decide qué ruta se dibuja en esta capa.
  map.addLayer({ id: "route-selected", type: "line", source: "routes", layout: lineLayout,
    filter: ["==", ["get", "id"], ""],
    paint: { "line-color": ["get", "color"], "line-width": 7 } });

  // Rutas de varios días: el día elegido, los puntos donde dormiste y el cursor del editor
  map.addSource("stage", { type: "geojson", data: emptyCollection() });
  map.addSource("overnights", { type: "geojson", data: emptyCollection() });
  map.addSource("cursor", { type: "geojson", data: emptyCollection() });
  map.addLayer({ id: "stage-line", type: "line", source: "stage", layout: lineLayout,
    paint: { "line-color": ["get", "color"], "line-width": 8 } });

  // Chincheta en el inicio de cada ruta: visible aunque mires el globo entero
  map.addLayer({
    id: "starts",
    type: "circle",
    source: "starts",
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({ id: "overnights", type: "circle", source: "overnights",
    paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": "#1b1f1d", "circle-stroke-width": 2.5 } });
  map.addLayer({ id: "overnight-labels", type: "symbol", source: "overnights",
    layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top",
      "text-font": ["Noto Sans Bold"] },
    paint: { "text-color": "#1b1f1d", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
  map.addLayer({ id: "cursor", type: "circle", source: "cursor",
    paint: { "circle-radius": 6, "circle-color": "#e8890c", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });

  // Pulsar una chincheta abre su ruta
  map.on("click", "starts", (e) => {
    const route = routes.find((r) => r.id === e.features[0].properties.id);
    if (route) showDetail(route);
  });
  map.on("mouseenter", "starts", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "starts", () => (map.getCanvas().style.cursor = ""));

  refreshMap(); // por si las rutas se cargaron antes que el mapa
});

function emptyCollection() {
  return { type: "FeatureCollection", features: [] };
}

// ======================= Estado =======================
// Cada ruta: { id, name, date, activity, durationMin, notes, photoIds, folderId, points }
let routes = [];
let folders = []; // [{ id, name }]
let selectedId = null;
let shownRoutes = []; // las rutas que se ven ahora en el mapa (según filtros o carpeta)

// Estado de la interfaz: se conserva al ir y volver del detalle
const ui = {
  tab: "list", // "list" | "folders"
  folderId: undefined, // carpeta abierta: id, null = "Sin carpeta", undefined = ninguna
  filters: { query: "", activity: "all", period: "all", country: "all" },
};

const panel = document.getElementById("panel");
const sheet = initSheet(document.getElementById("sheet"), document.querySelector(".sheet-handle"));

// Margen para encuadrar rutas: que no queden debajo del panel (izquierda en el
// ordenador, hoja inferior en el móvil)
function mapPadding() {
  return sheet.isMobile()
    ? { top: 48, bottom: sheet.height() + 24, left: 32, right: 32 }
    : { top: 80, bottom: 80, left: 420, right: 80 };
}
const fileInput = document.getElementById("fileInput");
const toast = document.getElementById("toast");

// Vuelve a dibujar todas las rutas en el mapa a partir de la lista "routes"
function refreshMap() {
  if (!map.getSource("routes")) return; // el mapa aún no ha cargado: se dibujará al cargar
  // En el detalle se ve la ruta abierta aunque los filtros la oculten
  const selected = routes.find((r) => r.id === selectedId);
  const list = selected && !shownRoutes.includes(selected) ? [...shownRoutes, selected] : shownRoutes;
  const feature = (r, geometry) => ({
    type: "Feature",
    properties: { id: r.id, color: activityOf(r.activity).color },
    geometry,
  });
  map.getSource("routes").setData({
    type: "FeatureCollection",
    features: list.map((r) =>
      feature(r, { type: "LineString", coordinates: r.points.map((p) => [p.lon, p.lat]) })
    ),
  });
  map.getSource("starts").setData({
    type: "FeatureCollection",
    features: list.map((r) =>
      feature(r, { type: "Point", coordinates: [r.points[0].lon, r.points[0].lat] })
    ),
  });
  map.setFilter("route-selected", ["==", ["get", "id"], selectedId ?? ""]);
  if (!selected) showStageOnMap(null);
}

// Dibuja en el mapa las etapas de una ruta: el día elegido resaltado y las pernoctas.
// route = null limpia todo.
function showStageOnMap(route, dayIndex = -1) {
  if (!map.getSource("stage")) return;
  const color = route ? activityOf(route.activity).color : "#000";
  const days = route ? dayRanges(route.points, route.stageStarts) : [];
  const day = days.length > 1 && dayIndex >= 0 ? days[dayIndex] : null;

  map.getSource("stage").setData(day ? {
    type: "Feature",
    properties: { color },
    geometry: { type: "LineString", coordinates: route.points.slice(day.start, day.end + 1).map((p) => [p.lon, p.lat]) },
  } : emptyCollection());
  map.getSource("overnights").setData({
    type: "FeatureCollection",
    features: (route?.stageStarts ?? []).map((i, k) => ({
      type: "Feature",
      properties: { label: `Noche ${k + 1}` },
      geometry: { type: "Point", coordinates: [route.points[i].lon, route.points[i].lat] },
    })),
  });
  // Con un día elegido, el resto de la ruta se ve más apagado
  map.setPaintProperty("route-selected", "line-opacity", day ? 0.35 : 1);
}

function showCursor(point) {
  map.getSource("cursor")?.setData(point ? {
    type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point.lon, point.lat] },
  } : emptyCollection());
}

function flyToRoute(route, points = route.points) {
  const bounds = new LngLatBounds();
  for (const p of points) bounds.extend([p.lon, p.lat]);
  map.fitBounds(bounds, { padding: mapPadding(), pitch: 50, duration: 2500 });
}

function showError(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => (toast.hidden = true), 6000);
}

// ======================= Vistas =======================
const folderById = (id) => folders.find((f) => f.id === id);

function setShown(list) {
  shownRoutes = list;
  refreshMap();
}

function showHome(options = {}) {
  selectedId = null;
  panel.scrollTop = 0;
  ui.folderId = undefined;
  renderHome(panel, { routes, folders, filters: ui.filters, tab: ui.tab, ...options }, {
    onAdd: () => fileInput.click(),
    onOpen: showDetail,
    onTab: (tab, opts) => { ui.tab = tab; showHome(opts); },
    onVisibleChange: setShown,
    onAlbum: () => openAlbum(),
    onDemo: toggleDemo,
    hasDemo: routes.some((r) => r.demo),
    onOpenFolder: showFolder,
    onNewFolder: async () => {
      const name = prompt("Nombre de la carpeta:")?.trim();
      if (name) { await createFolder(name); showHome(); }
    },
  });
}

// id = carpeta, o null para las rutas "Sin carpeta"
function showFolder(id) {
  selectedId = null;
  panel.scrollTop = 0;
  ui.folderId = id;
  const folder = id ? folderById(id) : null;
  renderFolder(panel, { folder, routes: routes.filter((r) => (r.folderId ?? null) === id) }, {
    onBack: () => { ui.tab = "folders"; showHome(); },
    onOpen: showDetail,
    onVisibleChange: setShown,
    // Elegir rutas que ya tienes (pueden venir de otra carpeta: se mueven a esta)
    onAddExisting: async () => {
      const ids = await pickRoutes({ folder, routes, folders });
      if (!ids) return;
      for (const r of routes.filter((r) => ids.includes(r.id))) {
        r.folderId = id;
        await saveRoute(r);
      }
      showFolder(id);
    },
    onRemoveRoute: async (route) => {
      route.folderId = null;
      await saveRoute(route);
      showFolder(id);
    },
    onRename: async () => {
      const name = prompt("Nuevo nombre de la carpeta:", folder.name)?.trim();
      if (!name) return;
      folder.name = name;
      await saveFolder(folder);
      showFolder(id);
    },
    onDelete: async () => {
      if (!confirm(`¿Borrar la carpeta "${folder.name}"? Sus rutas no se borran: pasan a "Sin carpeta".`)) return;
      for (const r of routes.filter((r) => r.folderId === id)) {
        r.folderId = null;
        await saveRoute(r);
      }
      await deleteFolder(id);
      folders = folders.filter((f) => f.id !== id);
      ui.tab = "folders";
      showHome();
    },
  });
}

// view: { day: -1 (total) o índice del día, editing: modo editar etapas, fly: mover la cámara }
function showDetail(route, { day = -1, editing = false, fly = true } = {}) {
  selectedId = route.id;
  refreshMap();
  showStageOnMap(route, editing ? -1 : day);
  showCursor(null);
  const days = dayRanges(route.points, route.stageStarts);
  // En el móvil, al abrir una ruta la hoja se queda a media altura: ves la ruta y sus datos
  if (fly && sheet.isMobile()) sheet.setState(1);
  if (fly) panel.scrollTop = 0; // una ruta nueva se abre desde arriba
  if (fly) flyToRoute(route, day >= 0 && days[day] ? route.points.slice(days[day].start, days[day].end + 1) : route.points);

  // "Volver" lleva a donde estabas: la carpeta abierta o la lista
  const inFolder = ui.folderId !== undefined;
  const cum = cumulativeKm(route.points);
  const stay = { editing: true, fly: false };

  renderDetail(panel, route, {
    day,
    editing,
    backLabel: inFolder ? (folderById(ui.folderId)?.name ?? "Sin carpeta") : "Mis rutas",
    folderName: folderById(route.folderId)?.name ?? null,
  }, {
    onBack: () => (inFolder ? showFolder(ui.folderId) : showHome()),
    onEdit: () => editRoute(route),
    onDelete: () => removeRoute(route),
    onSelectDay: (d) => showDetail(route, { day: d }),
    onEditStages: () => showDetail(route, { editing: true, fly: false }),
    onDoneStages: () => showDetail(route, { fly: false }),
    onHoverKm: (km) => showCursor(km === null ? null : route.points[indexAtKm(cum, km)]),
    onAddSplit: async (km) => {
      const before = route.stageStarts.length;
      route.stageStarts = cleanStarts([...route.stageStarts, indexAtKm(cum, km)], route.points.length);
      if (route.stageStarts.length === before) return showError("Demasiado cerca de otra división o de un extremo de la ruta.");
      await saveRoute(route);
      showDetail(route, stay);
    },
    // Unir un día con el anterior: se quita la división y sus notas pasan al día anterior
    onRemoveSplit: async (start) => {
      const k = route.stageStarts.indexOf(start);
      const prevStart = k > 0 ? route.stageStarts[k - 1] : 0;
      const merged = [route.dayNotes[prevStart], route.dayNotes[start]].filter(Boolean).join("\n\n");
      if (merged) route.dayNotes[prevStart] = merged;
      delete route.dayNotes[start];
      route.stageStarts = route.stageStarts.filter((i) => i !== start);
      await saveRoute(route);
      showDetail(route, stay);
    },
    onSaveDayNotes: async (start, text) => {
      route.dayNotes[start] = text;
      await saveRoute(route);
    },
  });
}

// ======================= Acciones =======================
async function createFolder(name) {
  const folder = { id: newId(), name };
  await saveFolder(folder);
  folders.push(folder);
  return folder;
}

// Aplica lo que devuelve el formulario: crea la carpeta nueva si la pidió
async function resolveFolder(result) {
  if (result.newFolderName) result.values.folderId = (await createFolder(result.newFolderName)).id;
}

// Reduce y guarda las fotos nuevas; devuelve sus ids
async function storeNewPhotos(files) {
  const ids = [];
  for (const file of files) {
    try {
      ids.push(await savePhoto(await resizeImage(file)));
    } catch {
      showError(`No he podido leer la foto ${file.name}.`);
    }
  }
  return ids;
}

// 1) Eliges un archivo → 2) se lee → 3) se abre el formulario ya relleno
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = ""; // permite volver a elegir el mismo archivo
  if (!file) return;

  let parsed;
  try {
    parsed = parseTrack(await file.text(), file.name);
  } catch (err) {
    return showError(`${file.name}: ${err.message}`);
  }

  const stats = computeStats(parsed.points);
  const stageStarts = detectStageStarts(parsed.points, parsed.trackStarts);
  // En rutas de varios días, la duración es la suma de cada día (sin contar las noches)
  const durationMin = stageStarts.length
    ? dayRanges(parsed.points, stageStarts)
        .map((d) => computeStats(parsed.points.slice(d.start, d.end + 1)).durationMin ?? 0)
        .reduce((a, b) => a + b, 0) || null
    : stats.durationMin;
  const summary = [
    `${parsed.points.length} puntos`,
    fmtKm(stats.distanceKm),
    stats.gainM !== null ? `+${fmtM(stats.gainM)} m` : null,
    durationMin ? fmtDuration(durationMin) : null,
    stageStarts.length ? `${stageStarts.length + 1} días detectados` : null,
  ].filter(Boolean).join(" · ");

  const result = await openRouteDialog({
    title: "Añadir ruta",
    fileInfo: { name: file.name, summary },
    values: {
      name: file.name.replace(/\.(gpx|kml)$/i, "").replace(/[-_]+/g, " "),
      date: parsed.date,
      activity: "hiking",
      durationMin,
      notes: "",
      folderId: ui.folderId ?? null, // si añades desde una carpeta, va a esa carpeta
    },
    folders,
  });
  if (!result) return;
  await resolveFolder(result);

  const route = {
    id: newId(), // identificador único generado por el navegador
    ...result.values,
    photoIds: await storeNewPhotos(result.newPhotos),
    stageStarts,
    dayNotes: {},
    points: parsed.points,
  };
  await saveRoute(route);
  routes.push(route);
  showDetail(route);
  // En segundo plano: en qué país y región está (para el álbum y los filtros) y si desbloquea logros
  ensureGeo(route).then(announceAchievements);
});

async function editRoute(route) {
  const result = await openRouteDialog({ title: "Editar ruta", values: route, photoIds: route.photoIds, folders });
  if (!result) return;
  await resolveFolder(result);

  await deletePhotos(result.removedPhotoIds);
  const newIds = await storeNewPhotos(result.newPhotos);
  Object.assign(route, result.values, {
    photoIds: [...route.photoIds.filter((id) => !result.removedPhotoIds.includes(id)), ...newIds],
  });
  await saveRoute(route);
  showDetail(route);
  announceAchievements(); // cambiar la actividad o la fecha puede desbloquear alguno
}

async function removeRoute(route) {
  if (!confirm(`¿Borrar "${route.name}"? No se puede deshacer.`)) return;
  await deletePhotos(route.photoIds);
  await deleteRoute(route.id);
  routes = routes.filter((r) => r.id !== route.id);
  ui.folderId !== undefined ? showFolder(ui.folderId) : showHome();
}

// Las rutas guardadas con versiones anteriores no tienen todos los campos:
// les damos valores por defecto para que el resto del código no tenga que comprobarlo.
function withDefaults(route) {
  return {
    activity: "hiking",
    notes: "",
    photoIds: [],
    folderId: null,
    stageStarts: [],
    dayNotes: {},
    durationMin: computeStats(route.points).durationMin,
    ...route,
  };
}

// ======================= Colección =======================
// (El elemento sigue llamándose #album y la función openAlbum por historia del proyecto)
const albumEl = document.getElementById("album");
// iso = país que se ve; regionId = región con el panel desplegado (o "specials", o null)
// view = "map" | "cards" | "achievements"; rarity = filtro de las cartas
const collection = { data: null, achievements: [], view: "map", rarity: null, continent: null, iso: null, regionId: null };

// Calcula (una vez) por qué países y regiones pasa una ruta y lo guarda con ella
const geoJobs = new Map();
function ensureGeo(route) {
  if (route.geo?.version === GEO_VERSION) return Promise.resolve();
  if (!geoJobs.has(route.id)) {
    geoJobs.set(route.id, locateRoute(route.points)
      .then(async (geo) => { route.geo = geo; await saveRoute(route); })
      .catch(() => {}) // sin conexión: se reintentará la próxima vez
      .finally(() => geoJobs.delete(route.id)));
  }
  return geoJobs.get(route.id);
}

async function openAlbum() {
  albumEl.hidden = false;
  albumEl.innerHTML = `<p class="album-loading">Preparando la colección…</p>`;
  await Promise.all(routes.map(ensureGeo));
  collection.data = await buildAlbum(routes);
  collection.achievements = await achievementsNow(collection.data);
  drawCollection();
}

function drawCollection() {
  const { data, achievements, view, rarity, continent, iso, regionId } = collection;
  return renderCollection(albumEl, { album: data, achievements, view, rarity, continent, iso, regionId }, {
    onClose: closeAlbum,
    // Moverse entre niveles (mundo → continente → país) o abrir el panel de una región
    onNavigate: (next) => {
      Object.assign(collection, next);
      drawCollection();
      if (next.view) albumEl.scrollTop = 0;
    },
    onOpenRoute: (id) => {
      closeAlbum();
      const route = routes.find((r) => r.id === id);
      if (route) showDetail(route);
    },
  });
}

function closeAlbum() {
  albumEl.hidden = true;
}

// Teclado: Esc cierra el panel de la región, luego sube un nivel (país → continente →
// mundo) y por último cierra la colección
document.addEventListener("keydown", (e) => {
  if (albumEl.hidden || document.querySelector("dialog[open]") || e.key !== "Escape") return;
  if (collection.regionId) collection.regionId = null;
  else if (collection.iso) {
    collection.continent = collection.data.countries.find((c) => c.iso === collection.iso)?.continent ?? null;
    collection.iso = null;
  } else if (collection.continent) collection.continent = null;
  else return closeAlbum();
  drawCollection();
});

// ======================= Logros =======================
// album (opcional) ya trae cuántas regiones tiene cada país visitado
async function achievementsNow(album) {
  album ??= await buildAlbum(routes);
  const regionTotals = new Map(album.countries.map((c) => [c.iso, c.regions.length]));
  return computeAchievements(routes, await continentsByIso(), regionTotals);
}

// Avisa de los logros nuevos. Los ya vistos se recuerdan en este navegador; la primera
// vez solo se apuntan (si no, al abrir la app con rutas antiguas saldrían todos de golpe).
const SEEN_KEY = "trail-globe:seen-achievements";
async function announceAchievements() {
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)); } catch { /* sin almacenamiento */ }
  const list = await achievementsNow();
  const done = list.filter((a) => a.done);
  const fresh = seen ? done.filter((a) => !seen.includes(a.id)) : [];
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(done.map((a) => a.id))); } catch { /* da igual */ }
  if (!fresh.length) return;
  const best = fresh.reduce((a, b) => (b.level > a.level ? b : a));
  showAchievementToast(best, fresh.length);
}

function showAchievementToast(a, count) {
  const r = RARITIES[a.level];
  achToast.innerHTML = `
    ${hexMedal({ color: r.color, soft: r.soft, icon: CATEGORIES.find((c) => c.id === a.cat).icon, size: 40 })}
    <span><small style="color:${r.color}">Logro ${r.male.toLowerCase()} desbloqueado</small>
    <strong>${esc(a.name)}</strong>${count > 1 ? `<em>y ${count - 1} ${count === 2 ? "logro más" : "logros más"}</em>` : ""}</span>`;
  achToast.hidden = false;
  clearTimeout(showAchievementToast.timer);
  showAchievementToast.timer = setTimeout(() => (achToast.hidden = true), 5000);
}
const achToast = document.getElementById("achToast");
achToast.addEventListener("click", () => {
  achToast.hidden = true;
  collection.view = "achievements";
  openAlbum();
});

// ======================= Rutas de ejemplo =======================
// public/demo/routes.json (generado con scripts/build-demo.py) trae ~60 rutas por todo
// el mundo para ver cómo queda la app llena. Se marcan con demo: true para poder
// quitarlas de golpe sin tocar las tuyas.
async function toggleDemo() {
  try {
    await (routes.some((r) => r.demo) ? removeDemo() : loadDemo());
  } catch (err) {
    showError(`No he podido cargar las rutas de ejemplo: ${err.message}`);
  }
}

async function loadDemo() {
  let data;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}demo/routes.json`);
    data = await res.json();
  } catch (err) {
    return showError(`No he podido cargar las rutas de ejemplo: ${err.message}`);
  }
  const folderIds = {};
  for (const name of new Set(data.routes.map((r) => r.folder).filter(Boolean))) {
    const folder = { id: newId(), name, demo: true };
    await saveFolder(folder);
    folders.push(folder);
    folderIds[name] = folder.id;
  }
  const added = data.routes.map(({ folder, points, ...r }) => withDefaults({
    ...r,
    id: newId(),
    demo: true,
    folderId: folder ? folderIds[folder] : null,
    points: points.map(([lon, lat, ele, t]) => ({ lon, lat, ele, t })),
  }));
  for (const r of added) {
    // Rutas de varios días: la duración es la suma de los días (sin contar las noches)
    if (r.stageStarts.length) {
      r.durationMin = dayRanges(r.points, r.stageStarts)
        .map((d) => computeStats(r.points.slice(d.start, d.end + 1)).durationMin ?? 0)
        .reduce((a, b) => a + b, 0);
    }
    await saveRoute(r);
  }
  routes.push(...added);
  showHome();
  map.flyTo({ center: [10, 25], zoom: 1.4, pitch: 0, bearing: 0, duration: 2000 }); // vista del globo entero
  for (const r of added) await ensureGeo(r);
  updateCollectionCard();
  announceAchievements();
}

async function removeDemo() {
  const demo = routes.filter((r) => r.demo);
  if (!confirm(`¿Quitar las ${demo.length} rutas de ejemplo? Tus rutas no se tocan.`)) return;
  for (const r of demo) await deleteRoute(r.id);
  for (const f of folders.filter((f) => f.demo)) await deleteFolder(f.id);
  routes = routes.filter((r) => !r.demo);
  folders = folders.filter((f) => !f.demo);
  showHome();
}

// ======================= Arranque =======================
async function init() {
  try {
    routes = (await loadRoutes()).map(withDefaults);
    folders = await loadFolders();
  } catch (err) {
    showError(`No he podido leer las rutas guardadas: ${err.message}`);
  }
  // No esperamos al mapa: el panel aparece al instante y las rutas
  // se dibujan en cuanto el mapa termine de cargar (ver map.on("load"))
  showHome();
  // Rutas guardadas antes de existir el álbum: calculamos su país y región poco a poco
  for (const r of routes) await ensureGeo(r);
  updateCollectionCard();
  announceAchievements();
}

// La tarjeta "Mi colección" del inicio se actualiza cuando terminan de calcularse los países
function updateCollectionCard() {
  const sub = panel.querySelector(".cc-sub");
  if (sub) sub.textContent = collectionSummary(routes);
}

init();

// App instalable (PWA): el service worker guarda la app para abrirla sin conexión.
// Solo en la versión publicada: en desarrollo, la caché haría que no vieras tus cambios.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
