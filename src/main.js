import { Map, NavigationControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";
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
import { fmtKm, fmtM, fmtDuration } from "./format.js";
import { renderHome, renderFolder, renderDetail } from "./ui.js";
import { openRouteDialog } from "./routeDialog.js";
import { pickRoutes } from "./routePicker.js";

setWorkerUrl(workerUrl);

// ======================= Mapa =======================
// Estilo vectorial de OpenFreeMap (gratis, sin clave). El mapa llega como
// formas y textos y se dibuja en tu pantalla: nítido a cualquier zoom.
const map = new Map({
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
  filters: { query: "", activity: "all", period: "all" },
};

const panel = document.getElementById("panel");
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
}

function flyToRoute(route) {
  const bounds = new LngLatBounds();
  for (const p of route.points) bounds.extend([p.lon, p.lat]);
  // Margen izquierdo grande para que el panel no tape la ruta
  map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 420, right: 80 }, pitch: 50, duration: 2500 });
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
  ui.folderId = undefined;
  renderHome(panel, { routes, folders, filters: ui.filters, tab: ui.tab, ...options }, {
    onAdd: () => fileInput.click(),
    onOpen: showDetail,
    onTab: (tab, opts) => { ui.tab = tab; showHome(opts); },
    onVisibleChange: setShown,
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

function showDetail(route) {
  selectedId = route.id;
  refreshMap();
  flyToRoute(route);
  // "Volver" lleva a donde estabas: la carpeta abierta o la lista
  const inFolder = ui.folderId !== undefined;
  renderDetail(panel, route, {
    backLabel: inFolder ? (folderById(ui.folderId)?.name ?? "Sin carpeta") : "Mis rutas",
    folderName: folderById(route.folderId)?.name ?? null,
    onBack: () => (inFolder ? showFolder(ui.folderId) : showHome()),
    onEdit: () => editRoute(route),
    onDelete: () => removeRoute(route),
  });
}

// ======================= Acciones =======================
async function createFolder(name) {
  const folder = { id: crypto.randomUUID(), name };
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
  const summary = [
    `${parsed.points.length} puntos`,
    fmtKm(stats.distanceKm),
    stats.gainM !== null ? `+${fmtM(stats.gainM)} m` : null,
    stats.durationMin ? fmtDuration(stats.durationMin) : null,
  ].filter(Boolean).join(" · ");

  const result = await openRouteDialog({
    title: "Añadir ruta",
    fileInfo: { name: file.name, summary },
    values: {
      name: file.name.replace(/\.(gpx|kml)$/i, "").replace(/[-_]+/g, " "),
      date: parsed.date,
      activity: "hiking",
      durationMin: stats.durationMin,
      notes: "",
      folderId: ui.folderId ?? null, // si añades desde una carpeta, va a esa carpeta
    },
    folders,
  });
  if (!result) return;
  await resolveFolder(result);

  const route = {
    id: crypto.randomUUID(), // identificador único generado por el navegador
    ...result.values,
    photoIds: await storeNewPhotos(result.newPhotos),
    points: parsed.points,
  };
  await saveRoute(route);
  routes.push(route);
  showDetail(route);
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
    durationMin: computeStats(route.points).durationMin,
    ...route,
  };
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
}

init();
