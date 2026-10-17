import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";
// v4 del plugin conserva la ruta completa; stripBase: 4 quita "node_modules/cesium/Build/Cesium"

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: "cesiumStatic", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Workers`, dest: "cesiumStatic", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: "cesiumStatic", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: "cesiumStatic", rename: { stripBase: 4 } },
      ],
    }),
  ],
});
