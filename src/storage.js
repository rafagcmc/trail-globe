// Guarda las rutas en IndexedDB, una base de datos que tiene el propio navegador.
// Usamos idb-keyval, una librería mínima que la convierte en un simple
// "guardar/leer por clave". Todo es asíncrono: cada función devuelve una promesa.
//
// Por qué no localStorage: solo admite unos 5 MB, y un GPX largo
// puede tener decenas de miles de puntos.

import { createStore, set, del, values } from "idb-keyval";

const store = createStore("trail-globe", "routes");

// Para ocupar menos, cada punto se guarda como [lon, lat, ele] en vez de un objeto,
// redondeando a 5 decimales (≈ 1 metro de precisión, de sobra para una ruta a pie).
function compact(points) {
  return points.map((p) => [
    +p.lon.toFixed(5),
    +p.lat.toFixed(5),
    p.ele === null ? null : Math.round(p.ele),
  ]);
}

function expand(stored) {
  return stored.map(([lon, lat, ele]) => ({ lon, lat, ele }));
}

export async function saveRoute(route) {
  await set(route.id, { ...route, points: compact(route.points) }, store);
}

export async function loadRoutes() {
  const stored = await values(store);
  return stored.map((r) => ({ ...r, points: expand(r.points) }));
}

export async function deleteRoute(id) {
  await del(id, store);
}
