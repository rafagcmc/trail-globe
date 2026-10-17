import { Ion, Viewer, Terrain } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

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
