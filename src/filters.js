// Filtrado de rutas: buscador, tipo de actividad y periodo de fechas

// Quita acentos y pasa a minúsculas: así "penalara" encuentra "Peñalara"
const normalize = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DAY_MS = 24 * 60 * 60 * 1000;

export function applyFilters(routes, { query, activity, period }) {
  const q = normalize(query.trim());
  const now = Date.now();

  return routes.filter((r) => {
    if (activity !== "all" && r.activity !== activity) return false;
    if (q && !normalize(r.name).includes(q) && !normalize(r.notes).includes(q)) return false;

    if (period !== "all") {
      if (!r.date) return false;
      const age = now - new Date(`${r.date}T12:00:00`).getTime();
      if (period === "30d") return age <= 30 * DAY_MS;
      if (period === "12m") return age <= 365 * DAY_MS;
      return r.date.startsWith(period); // un año concreto, p. ej. "2026"
    }
    return true;
  });
}

// Opciones del filtro de fecha: fijas + un año por cada año en el que tengas rutas
export function periodOptions(routes) {
  const years = [...new Set(routes.map((r) => r.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  return [
    ["all", "Cualquier fecha"],
    ["30d", "Últimos 30 días"],
    ["12m", "Últimos 12 meses"],
    ...years.map((y) => [y, y]),
  ];
}

export const hasActiveFilters = (f) => f.query.trim() !== "" || f.activity !== "all" || f.period !== "all";
