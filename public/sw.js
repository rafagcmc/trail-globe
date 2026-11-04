// Service worker: guarda una copia de la app para que abra rápido y funcione sin conexión.
// Se ejecuta aparte de la página e intercepta sus peticiones de red.
//
// - La página (index.html): primero red, y si no hay conexión, la copia guardada.
//   Así siempre ves la última versión cuando hay internet.
// - Código, estilos, iconos y fronteras (/assets, /geo…): primero la copia guardada.
//   Los archivos de /assets llevan un "hash" en el nombre, así que nunca cambian.
// - Mapas y relieve: no se guardan (ocuparían cientos de MB). Sin conexión verás tus
//   rutas y datos, pero el fondo del mapa solo donde el navegador lo tenga en caché.

const CACHE = "trail-globe-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "manifest.webmanifest", "icons/icon-192.png"])));
  self.skipWaiting();
});

// Al activarse una versión nueva, borra las copias de versiones anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // lo de fuera, normal

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put("./", res.clone())); return res; })
        .catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
