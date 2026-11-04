// Funciones para mostrar números, fechas y textos con formato español

// useGrouping "always": en español los números de 4 cifras no llevan punto
// por defecto (2428); lo forzamos para que se lea mejor (2.428).
const integer = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtKm = (km) => `${oneDecimal.format(km)} km`;
export const fmtM = (m) => integer.format(m);
export const fmtSpeed = (kmh) => `${oneDecimal.format(kmh)} km/h`;

export function fmtDuration(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

export function fmtDate(iso, long = false) {
  if (!iso) return "sin fecha";
  // "T12:00" evita que la fecha salga un día antes en zonas horarias como la de EE. UU.
  const date = new Date(`${iso}T12:00:00`);
  const options = long
    ? { weekday: "long", day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short", year: "numeric" };
  const text = date.toLocaleDateString("es-ES", options);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Escapa un texto para meterlo en HTML sin que se interprete como código.
// Importante con nombres y notas que escribe el usuario.
export function esc(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

// Botón "Volver" grande y visible, igual en toda la app. attrs = qué hace al pulsarlo.
const ICON_BACK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const backButton = (label, attrs = 'data-action="back"') =>
  `<button class="back-btn" ${attrs}>${ICON_BACK}<span>${esc(label)}</span></button>`;
