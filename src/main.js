import { Ion, Viewer, Terrain, Cartesian3, Color } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import { parseTrack } from "./parseTrack.js";
import { computeStats } from "./stats.js";

// Dónde están los recursos que copió vite.config.js
window.CESIUM_BASE_URL = "/cesiumStatic";

// Token de Cesium ion, leído de .env.local (no se sube a GitHub)
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

// Crea el globo con relieve real
const viewer = new Viewer("cesiumContainer", {
  terrain: Terrain.fromWorldTerrain(),
  animation: false,
  timeline: false,
});

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
      addRoute(file.name.replace(/\.(gpx|kml)$/i, ""), points);
    } catch (err) {
      errorBox.textContent = `${file.name}: ${err.message}`;
    }
  }

  fileInput.value = ""; // permite volver a subir el mismo archivo
});

function addRoute(name, points) {
  // Cesium quiere los puntos como [lon, lat, lon, lat, ...]
  const flat = points.flatMap((p) => [p.lon, p.lat]);

  const entity = viewer.entities.add({
    name,
    polyline: {
      positions: Cartesian3.fromDegreesArray(flat),
      width: 4,
      material: Color.ORANGE,
      // Pega la línea al relieve: no nos fiamos de la altura del archivo,
      // que a veces falta o viene mal.
      clampToGround: true,
    },
  });

  const stats = computeStats(points);
  const gainText = stats.gainM === null ? "sin datos de altura" : `+${stats.gainM} m`;

  const item = document.createElement("li");
  item.innerHTML = `<strong></strong><span>${stats.distanceKm.toFixed(1)} km · ${gainText}</span>`;
  item.querySelector("strong").textContent = name; // textContent evita inyectar HTML
  item.addEventListener("click", () => viewer.flyTo(entity));
  routeList.appendChild(item);

  viewer.flyTo(entity);
}
