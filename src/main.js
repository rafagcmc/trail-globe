import { Map, NavigationControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre procesa las teselas en un "worker" (un hilo aparte para no congelar la página).
// Vite reempaqueta la librería y MapLibre deja de encontrar ese archivo, así que le
// decimos dónde está. "?url" hace que Vite nos dé la ruta final del archivo.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
import "./style.css";
import { parseTrack } from "./parseTrack.js";
import { computeStats } from "./stats.js";

// --- Mapa ---
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
const DEM_ATTRIBUTION = "Terrain: Mapzen / AWS Open Data";

// Cuando el estilo termina de cargar ponemos el globo, el relieve y nuestras capas.
// (Añadir capas antes de este momento da error: el mapa aún no existe.)
// Promesa que se cumple cuando el mapa está listo. Si subes una ruta antes,
// addRoute espera a que lo esté en vez de fallar.
let resolveMapReady;
const mapReady = new Promise((resolve) => (resolveMapReady = resolve));

map.on("load", () => {
  map.setProjection({ type: "globe" });

  // Una fuente de elevación para el relieve 3D y otra para el sombreado
  map.addSource("terrain", {
    type: "raster-dem",
    tiles: DEM_TILES,
    tileSize: 256,
    maxzoom: 15,
    encoding: "terrarium",
    attribution: DEM_ATTRIBUTION,
  });
  map.addSource("hillshade", {
    type: "raster-dem",
    tiles: DEM_TILES,
    tileSize: 256,
    maxzoom: 15,
    encoding: "terrarium",
  });
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

  // Una sola fuente con todas las rutas; al añadir una, actualizamos sus datos
  map.addSource("routes", { type: "geojson", data: emptyCollection() });
  map.addSource("starts", { type: "geojson", data: emptyCollection() });

  // Borde blanco debajo + línea naranja encima: se lee sobre cualquier fondo
  map.addLayer({
    id: "routes-casing",
    type: "line",
    source: "routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#ffffff", "line-width": 7 },
  });
  map.addLayer({
    id: "routes-line",
    type: "line",
    source: "routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#e8890c", "line-width": 4 },
  });

  // Chincheta en el inicio de cada ruta: visible aunque mires el globo entero
  map.addLayer({
    id: "starts",
    type: "circle",
    source: "starts",
    paint: {
      "circle-radius": 6,
      "circle-color": "#e8890c",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  resolveMapReady();
});

// --- Rutas ---
const routes = []; // [{ name, points, bounds }]

function emptyCollection() {
  return { type: "FeatureCollection", features: [] };
}

// Vuelve a dibujar todas las rutas a partir de la lista "routes"
function refreshMap() {
  map.getSource("routes").setData({
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      properties: { name: r.name },
      geometry: { type: "LineString", coordinates: r.points.map((p) => [p.lon, p.lat]) },
    })),
  });
  map.getSource("starts").setData({
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      properties: { name: r.name },
      geometry: { type: "Point", coordinates: [r.points[0].lon, r.points[0].lat] },
    })),
  });
}

function flyToRoute(route) {
  map.fitBounds(route.bounds, { padding: 80, pitch: 50, duration: 2500 });
}

const fileInput = document.getElementById("fileInput");
const routeList = document.getElementById("routeList");
const errorBox = document.getElementById("error");

// Se ejecuta cada vez que eliges uno o varios archivos
fileInput.addEventListener("change", async () => {
  errorBox.textContent = "";

  for (const file of fileInput.files) {
    try {
      // Leer un archivo tarda un poco: "await" espera a que termine
      // sin bloquear la página.
      const text = await file.text();
      const points = parseTrack(text, file.name);
      await mapReady;
      addRoute(file.name.replace(/\.(gpx|kml)$/i, ""), points);
    } catch (err) {
      errorBox.textContent = `${file.name}: ${err.message}`;
    }
  }

  fileInput.value = ""; // permite volver a subir el mismo archivo
});

function addRoute(name, points) {
  // Rectángulo que contiene toda la ruta, para encuadrarla con la cámara
  const bounds = new LngLatBounds();
  for (const p of points) bounds.extend([p.lon, p.lat]);

  const route = { name, points, bounds };
  routes.push(route);
  refreshMap();

  const stats = computeStats(points);
  const gainText = stats.gainM === null ? "sin datos de altura" : `+${stats.gainM} m`;

  const item = document.createElement("li");
  item.innerHTML = `<strong></strong><span>${stats.distanceKm.toFixed(1)} km · ${gainText}</span>`;
  item.querySelector("strong").textContent = name; // textContent evita inyectar HTML
  item.addEventListener("click", () => flyToRoute(route));
  routeList.appendChild(item);

  flyToRoute(route);
}
