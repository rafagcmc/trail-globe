import {
  Ion,
  Viewer,
  Terrain,
  Cartesian3,
  Color,
  ImageryLayer,
  IonWorldImageryStyle,
  HeightReference,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
import { parseTrack } from "./parseTrack.js";
import { computeStats } from "./stats.js";

// Dónde están los recursos que copió vite.config.js
window.CESIUM_BASE_URL = "/cesiumStatic";

// Token de Cesium ion, leído de .env.local (no se sube a GitHub)
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

// Mapa de carreteras (Bing Maps, servido por Cesium ion con tu mismo token):
// aspecto de mapa ilustrado en vez de foto de satélite.
// (CARTO, que usé antes, ahora exige su propia clave de API.)
const mapLayer = ImageryLayer.fromWorldImagery({
  style: IonWorldImageryStyle.ROAD,
});

// Crea el globo: mapa ilustrado encima del relieve real
const viewer = new Viewer("cesiumContainer", {
  terrain: Terrain.fromWorldTerrain(),
  baseLayer: mapLayer,
  baseLayerPicker: false, // quita el selector de capas (si no, vuelve a poner el satélite)
  animation: false,
  timeline: false,
  // Renderiza a la resolución real de la pantalla. Por defecto Cesium la baja
  // en pantallas con escalado (125 %, 150 %...) y por eso se veía borroso.
  useBrowserRecommendedResolution: false,
});

// --- Calidad de imagen ---
// Cesium decide qué nivel de detalle de mapa cargar según cuántos píxeles de error
// tolera (por defecto 2). Con 1 carga teselas más detalladas: más nítido, algo más pesado.
viewer.scene.globe.maximumScreenSpaceError = 1;
// Suavizado de bordes (antialiasing): las rutas y el contorno del globo sin "dientes de sierra"
viewer.scene.msaaSamples = 4;

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

  // Chincheta en el inicio de la ruta: se ve aunque estés mirando el globo
  // entero, cuando la línea es demasiado pequeña para distinguirse.
  viewer.entities.add({
    position: Cartesian3.fromDegrees(points[0].lon, points[0].lat),
    point: {
      pixelSize: 10,
      color: Color.ORANGE,
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY, // que no la tape el relieve
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
