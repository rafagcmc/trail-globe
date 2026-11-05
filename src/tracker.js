// De dónde salen las posiciones GPS mientras grabas una ruta.
//
// Dos fuentes, misma forma de usarlas (startTracking → función para parar):
//   · App de Android (Capacitor): plugin de geolocalización en segundo plano. Sigue
//     grabando con la pantalla apagada gracias a un "servicio en primer plano", que es
//     la notificación fija "Grabando ruta" que Android obliga a mostrar.
//   · Navegador: navigator.geolocation. Solo funciona con la pantalla encendida y la
//     página abierta, así que pedimos al móvil que no apague la pantalla (Wake Lock).

import { Capacitor, registerPlugin } from "@capacitor/core";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

export const isNativeApp = () => Capacitor.isNativePlatform();

// onFix({ lat, lon, ele, acc, t }) por cada posición nueva
// onError("denied" | "unsupported" | texto) si algo falla
// Devuelve una promesa con la función para dejar de escuchar.
export async function startTracking(onFix, onError) {
  return isNativeApp() ? startNative(onFix, onError) : startWeb(onFix, onError);
}

async function startNative(onFix, onError) {
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: "Recording route",
      backgroundMessage: "Trail Globe is recording your route. Tap to return to the app.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 3, // metros mínimos entre posiciones
    },
    (loc, err) => {
      if (err) return onError(err.code === "NOT_AUTHORIZED" ? "denied" : err.message);
      onFix({ lat: loc.latitude, lon: loc.longitude, ele: loc.altitude ?? null, acc: loc.accuracy, t: loc.time ?? Date.now() });
    }
  );
  return () => BackgroundGeolocation.removeWatcher({ id });
}

export function openLocationSettings() {
  if (isNativeApp()) BackgroundGeolocation.openSettings();
}

async function startWeb(onFix, onError) {
  if (!("geolocation" in navigator)) {
    onError("unsupported");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onFix({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      ele: pos.coords.altitude ?? null,
      acc: pos.coords.accuracy,
      t: pos.timestamp,
    }),
    (err) => onError(err.code === err.PERMISSION_DENIED ? "denied" : err.message),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );

  // Pantalla siempre encendida mientras se graba (si el navegador lo permite).
  // El bloqueo se pierde al cambiar de app, así que se vuelve a pedir al volver.
  let lock = null;
  const keepAwake = async () => {
    try { lock = await navigator.wakeLock?.request("screen"); } catch { /* sin permiso: da igual */ }
  };
  const onVisible = () => document.visibilityState === "visible" && keepAwake();
  keepAwake();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    navigator.geolocation.clearWatch(id);
    document.removeEventListener("visibilitychange", onVisible);
    lock?.release().catch(() => {});
  };
}
