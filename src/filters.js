// Filtrado de rutas: buscador, tipo de actividad, país y periodo de fechas

// Quita acentos y pasa a minúsculas: así "penalara" encuentra "Peñalara"
const normalize = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DAY_MS = 24 * 60 * 60 * 1000;

// Texto en el que busca el buscador: nombre, notas y los lugares por los que pasa
const searchText = (r) =>
  normalize([r.name, r.notes, ...(r.geo?.countries ?? []).map((c) => c.name), ...(r.geo?.regions ?? []).map((g) => g.name)].join(" "));

export function applyFilters(routes, { query, activity, period, country = "all" }) {
  const q = normalize(query.trim());
  const now = Date.now();

  return routes.filter((r) => {
    if (activity !== "all" && r.activity !== activity) return false;
    if (q && !searchText(r).includes(q)) return false;
    if (country !== "all" && !r.geo?.countries.some((c) => c.iso === country)) return false;

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
    ["all", "Any date"],
    ["30d", "Last 30 days"],
    ["12m", "Last 12 months"],
    ...years.map((y) => [y, y]),
  ];
}

// Opciones del filtro de país: los países por los que pasan tus rutas
export function countryOptions(routes) {
  const names = new Map();
  for (const r of routes) for (const c of r.geo?.countries ?? []) names.set(c.iso, c.name);
  return [...names].sort((a, b) => a[1].localeCompare(b[1], "en"));
}

export const hasActiveFilters = (f) =>
  f.query.trim() !== "" || f.activity !== "all" || f.period !== "all" || f.country !== "all";
