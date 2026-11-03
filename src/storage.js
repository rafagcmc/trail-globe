// Guarda las rutas y las fotos en IndexedDB, la base de datos del navegador.
// idb-keyval la convierte en un simple "guardar/leer por clave".
// Todo es asíncrono: cada función devuelve una promesa.
//
// Por qué no localStorage: solo admite unos 5 MB, y un GPX largo
// puede tener decenas de miles de puntos (y las fotos pesan mucho más).

import { createStore, get, set, del, delMany, values } from "idb-keyval";

// Dos bases de datos separadas: rutas y fotos. Así cargar la lista de rutas
// no obliga a leer también todas las fotos.
const routeStore = createStore("trail-globe", "routes");
const photoStore = createStore("trail-globe-photos", "photos");

// Para ocupar menos, cada punto se guarda como [lon, lat, ele, t] en vez de un objeto,
// redondeando a 5 decimales (≈ 1 metro de precisión, de sobra para una ruta a pie).
function compact(points) {
  return points.map((p) => [
    +p.lon.toFixed(5),
    +p.lat.toFixed(5),
    p.ele === null ? null : Math.round(p.ele),
    p.t ?? null,
  ]);
}

function expand(stored) {
  // "t = null" por si la ruta se guardó con una versión anterior sin horas
  return stored.map(([lon, lat, ele, t = null]) => ({ lon, lat, ele, t }));
}

export async function saveRoute(route) {
  await set(route.id, { ...route, points: compact(route.points) }, routeStore);
}

export async function loadRoutes() {
  const stored = await values(routeStore);
  return stored.map((r) => ({ ...r, points: expand(r.points) }));
}

export async function deleteRoute(id) {
  await del(id, routeStore);
}

export async function savePhoto(blob) {
  const id = crypto.randomUUID();
  await set(id, blob, photoStore);
  return id;
}

export function getPhoto(id) {
  return get(id, photoStore);
}

export async function deletePhotos(ids) {
  if (ids.length > 0) await delMany(ids, photoStore);
}
