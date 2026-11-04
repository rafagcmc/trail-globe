// Grabación de una ruta con el GPS: guarda los puntos, las pausas y el tiempo en movimiento.
//
// La grabación en curso se guarda en IndexedDB cada pocos segundos: si el móvil cierra
// la app (batería, memoria) o recargas la página, al volver a abrirla sigue donde estaba.
//
// Uso:
//   const rec = createRecorder({ onChange });   onChange() se llama con cada cambio
//   await rec.restore()      → true si había una grabación a medias
//   rec.watch()              → empieza a escuchar el GPS (para ver la señal antes de empezar)
//   rec.start("hiking") / rec.pause() / rec.resume()
//   const data = await rec.finish()   → { points, activity, startedAt, movingMin } o null
//   rec.discard()

import { get, set, del, createStore } from "idb-keyval";
import { startTracking } from "./tracker.js";
import { haversine, computeStats } from "./stats.js";

const store = createStore("trail-globe-recording", "recording");
const KEY = "current";

// Filtros para que el ruido del GPS no ensucie la ruta
const MAX_ACCURACY_M = 35; // posiciones con más error que esto se descartan
const MIN_STEP_M = 4; // si no te has movido ni 4 m, no se añade punto…
const KEEPALIVE_MS = 30000; // …salvo cada 30 s, para que la hora siga avanzando
const MAX_SPEED_MS = 45; // saltos imposibles (más de 160 km/h): error del GPS
const SAVE_EVERY_MS = 5000;

export function createRecorder({ onChange }) {
  // state: null o { status: "recording" | "paused", activity, startedAt, points, segments }
  //   segments: [{ start, end }] tramos grabando (end = null en el tramo actual)
  let state = null;
  let stop = null; // función para dejar de escuchar el GPS
  let gps = { acc: null, error: null, last: null }; // última señal, para mostrarla
  let lastSave = 0;

  const persist = (force = false) => {
    if (!state || (!force && Date.now() - lastSave < SAVE_EVERY_MS)) return;
    lastSave = Date.now();
    set(KEY, state, store).catch(() => {});
  };

  // Al salir de la app o recargar se guarda ya, sin esperar a los 5 s
  const saveNow = () => persist(true);
  addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveNow());

  function onFix(fix) {
    gps = { acc: fix.acc, error: null, last: fix };
    if (state?.status === "recording" && fix.acc <= MAX_ACCURACY_M) {
      const prev = state.points[state.points.length - 1];
      const point = { lon: fix.lon, lat: fix.lat, ele: fix.ele == null ? null : Math.round(fix.ele), t: fix.t };
      if (!prev) state.points.push(point);
      else {
        // Velocidad desde el punto anterior (mínimo 1 s, por si dos posiciones llegan casi a la vez)
        const d = haversine(prev, point), dt = Math.max(1, (point.t - prev.t) / 1000);
        const jump = d / dt > MAX_SPEED_MS;
        if (!jump && (d >= MIN_STEP_M || point.t - prev.t >= KEEPALIVE_MS)) state.points.push(point);
      }
      persist();
    }
    onChange();
  }

  // Solo importan los errores que impiden grabar; "señal no disponible un momento" es normal
  function onError(error) {
    if (error !== "denied" && error !== "unsupported") return;
    gps = { ...gps, error };
    onChange();
  }

  async function watch() {
    if (stop) return;
    stop = () => {}; // evita arrancar dos veces mientras se espera
    try {
      stop = await startTracking(onFix, onError);
    } catch (err) {
      stop = null;
      onError(err.message);
    }
  }

  function unwatch() {
    stop?.();
    stop = null;
    gps = { acc: null, error: null, last: null };
  }

  return {
    get state() { return state; },
    get gps() { return gps; },
    get active() { return !!state; },

    async restore() {
      try { state = (await get(KEY, store)) ?? null; } catch { state = null; }
      if (state) {
        // Si la app se cerró grabando, el tramo abierto se cierra en el último punto
        const open = state.segments[state.segments.length - 1];
        if (open && open.end == null && state.status === "recording") {
          open.end = state.points[state.points.length - 1]?.t ?? open.start;
          state.segments.push({ start: Date.now(), end: null });
        }
        watch();
      }
      return !!state;
    },

    watch,
    unwatch,

    start(activity) {
      const now = Date.now();
      state = { status: "recording", activity, startedAt: now, points: [], segments: [{ start: now, end: null }] };
      // La posición que ya teníamos cuenta como punto de salida si es reciente y precisa
      if (gps.last && now - gps.last.t < 15000 && gps.acc <= MAX_ACCURACY_M) {
        state.points.push({ lon: gps.last.lon, lat: gps.last.lat, ele: gps.last.ele == null ? null : Math.round(gps.last.ele), t: gps.last.t });
      }
      watch();
      persist(true);
      onChange();
    },

    pause() {
      if (state?.status !== "recording") return;
      state.status = "paused";
      state.segments[state.segments.length - 1].end = Date.now();
      persist(true);
      onChange();
    },

    resume() {
      if (state?.status !== "paused") return;
      state.status = "recording";
      state.segments.push({ start: Date.now(), end: null });
      persist(true);
      onChange();
    },

    setActivity(activity) {
      if (!state) return;
      state.activity = activity;
      persist(true);
      onChange();
    },

    // Tiempo en movimiento (sin pausas), en milisegundos
    movingMs() {
      if (!state) return 0;
      return state.segments.reduce((sum, s) => sum + ((s.end ?? Date.now()) - s.start), 0);
    },

    stats() {
      return state && state.points.length ? computeStats(state.points) : { distanceKm: 0, gainM: null, maxEleM: null };
    },

    async finish() {
      // No cambia nada: si al final no guardas, la grabación sigue como estaba
      if (!state) return null;
      return { points: [...state.points], activity: state.activity, startedAt: state.startedAt, movingMin: Math.round(this.movingMs() / 60000) };
    },

    // Borra la grabación guardada (después de guardarla como ruta o al descartarla)
    async discard() {
      state = null;
      unwatch();
      await del(KEY, store).catch(() => {});
      onChange();
    },
  };
}
