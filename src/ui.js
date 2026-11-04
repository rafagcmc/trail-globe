// Dibuja el contenido del panel lateral: la vista de inicio (lista) y la de detalle.
// Cada función recibe el panel, los datos y las acciones ("handlers") que debe llamar
// cuando el usuario pulsa algo. Así este archivo no sabe nada del mapa ni del guardado.

import { ACTIVITIES, activityOf } from "./activities.js";
import { applyFilters, periodOptions, countryOptions, hasActiveFilters } from "./filters.js";
import { computeStats } from "./stats.js";
import { fmtKm, fmtM, fmtDate, esc, backButton } from "./format.js";
import { placesOf } from "./album.js";
import { releasePhotos } from "./detail.js";

const ICON_SEARCH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_FOLDER = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;


// Insignia hexagonal con una montaña: el mismo dibujo que las insignias de la colección
const ICON_BADGE = `<svg class="cc-icon" width="40" height="44" viewBox="0 0 104 112" aria-hidden="true"><polygon points="52,4 97,30 97,82 52,108 7,82 7,30" fill="#e8890c"/><polygon points="52,13 89,34.5 89,77.5 52,99 15,77.5 15,34.5" fill="#fff4d6"/><path d="M26 74 L42 50 L50 60 L62 40 L80 74 Z" fill="#e8890c"/></svg>`;

// Resumen de la colección para la tarjeta de inicio: países y regiones (insignias) visitados
export function collectionSummary(routes) {
  const countries = new Set(), regions = new Set();
  for (const r of routes) {
    const p = placesOf(r);
    for (const c of p.countries) countries.add(c.iso);
  }
  // Igual que en la colección: solo cuentan las regiones de los países que cuentan
  for (const r of routes) for (const g of placesOf(r).regions) if (countries.has(g.iso)) regions.add(g.id);
  if (!countries.size) return routes.length ? "Calculando países y regiones…" : "Colecciona países y regiones con tus rutas";
  return `${countries.size} ${countries.size === 1 ? "país" : "países"} · ${regions.size} ${regions.size === 1 ? "insignia" : "insignias"}`;
}

const stat = (value, label) =>
  `<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;

// ---------- Inicio ----------
// state: { routes, folders, filters, tab }   (tab = "list" | "folders")
// handlers: onAdd, onOpen, onTab, onVisibleChange, onOpenFolder, onNewFolder
export function renderHome(panel, state, handlers) {
  releasePhotos();
  const { routes, folders, filters, tab } = state;

  panel.innerHTML = `
    <header class="panel-header">
      <h1>Trail Globe</h1>
      <button class="btn secondary" data-action="add" title="Añadir una ruta desde un archivo GPX o KML">Importar</button>
      <button class="btn primary rec-cta" data-action="record"><span class="rec-dot"></span>Grabar</button>
    </header>
    ${state.recBanner ?? ""}
    <label class="search">
      ${ICON_SEARCH}
      <input type="search" placeholder="Buscar ruta, lugar o país…" value="${esc(filters.query)}" aria-label="Buscar">
    </label>
    <div class="stat-row" id="totals"></div>
    <button class="collection-card" data-action="album">
      ${ICON_BADGE}
      <span class="cc-text"><strong>Mi colección</strong><span class="cc-sub">${esc(collectionSummary(routes))}</span></span>
      <span class="cc-open">Abrir ${CHEVRON}</span>
    </button>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="list" aria-selected="${tab === "list"}">Lista</button>
      <button role="tab" data-tab="folders" aria-selected="${tab === "folders"}">Carpetas</button>
    </div>
    <div id="homeContent"></div>
    <footer class="panel-foot">
      <button class="link" data-action="demo">${state.hasDemo ? "Quitar rutas de ejemplo" : "Cargar rutas de ejemplo"}</button>
    </footer>`;

  panel.querySelector('[data-action="demo"]').addEventListener("click", handlers.onDemo);
  panel.querySelector('[data-action="add"]').addEventListener("click", handlers.onAdd);
  panel.querySelector('[data-action="record"]').addEventListener("click", handlers.onRecord);
  panel.querySelector('[data-action="recording"]')?.addEventListener("click", handlers.onRecord);
  panel.querySelector('[data-action="album"]').addEventListener("click", handlers.onAlbum);
  for (const b of panel.querySelectorAll("[data-tab]")) {
    b.addEventListener("click", () => handlers.onTab(b.dataset.tab));
  }

  const content = panel.querySelector("#homeContent");
  const totals = panel.querySelector("#totals");
  const search = panel.querySelector(".search input");

  if (tab === "folders") {
    renderFolderList(content, routes, folders, handlers);
    totals.innerHTML = totalsHtml(routes);
    handlers.onVisibleChange(routes);
    // Escribir en el buscador te lleva a la lista, que es donde se filtra
    search.addEventListener("input", () => {
      filters.query = search.value;
      handlers.onTab("list", { focusSearch: true });
    });
    return;
  }

  // Pestaña Lista: filtros + resultados
  content.innerHTML = `
    <div class="filters">
      <select class="pill" data-filter="activity" aria-label="Actividad">
        <option value="all">Actividad</option>
        ${Object.entries(ACTIVITIES).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join("")}
      </select>
      ${countryOptions(routes).length ? `
        <select class="pill" data-filter="country" aria-label="País">
          <option value="all">País</option>
          ${countryOptions(routes).map(([iso, name]) => `<option value="${iso}">${esc(name)}</option>`).join("")}
        </select>` : ""}
      <select class="pill" data-filter="period" aria-label="Fecha">
        ${periodOptions(routes).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
      </select>
      <button class="clear" hidden>Quitar filtros</button>
    </div>
    <div class="section-label" id="resultsLabel"></div>
    <div id="results"></div>`;

  const selects = content.querySelectorAll("select[data-filter]");
  const clear = content.querySelector(".clear");
  for (const sel of selects) sel.value = filters[sel.dataset.filter];

  // Solo se vuelve a pintar la lista (no el panel entero), para no perder
  // lo que estás escribiendo en el buscador
  function update() {
    const visible = applyFilters(routes, filters);
    totals.innerHTML = totalsHtml(visible);
    for (const sel of selects) sel.classList.toggle("active", sel.value !== "all");
    clear.hidden = !hasActiveFilters(filters);
    content.querySelector("#resultsLabel").textContent = hasActiveFilters(filters)
      ? `${visible.length} de ${routes.length} rutas`
      : "Mis rutas";
    const results = content.querySelector("#results");
    results.innerHTML = routeListHtml(
      visible,
      routes.length
        ? "Ninguna ruta coincide con los filtros."
        : "Aún no tienes rutas. Pulsa <b>+ Añadir ruta</b> y sube un archivo GPX o KML, o carga las rutas de ejemplo para probar."
    );
    bindRouteItems(results, routes, handlers.onOpen);
    handlers.onVisibleChange(visible);
  }

  search.addEventListener("input", () => { filters.query = search.value; update(); });
  for (const sel of selects) {
    sel.addEventListener("change", () => { filters[sel.dataset.filter] = sel.value; update(); });
  }
  clear.addEventListener("click", () => {
    Object.assign(filters, { query: "", activity: "all", period: "all", country: "all" });
    search.value = "";
    for (const sel of selects) sel.value = "all";
    update();
  });
  update();
  if (state.focusSearch) search.focus();
}

function renderFolderList(content, routes, folders, { onOpenFolder, onNewFolder }) {
  const rows = [...folders]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((f) => {
      const inFolder = routes.filter((r) => r.folderId === f.id);
      const km = inFolder.reduce((sum, r) => sum + computeStats(r.points).distanceKm, 0);
      const count = `${inFolder.length} ${inFolder.length === 1 ? "ruta" : "rutas"}`;
      return folderRow(f.id, f.name, inFolder.length ? `${count} · ${fmtKm(km)}` : "Vacía");
    });
  const loose = routes.filter((r) => !r.folderId).length;
  if (loose) rows.push(folderRow("", "Sin carpeta", `${loose} ${loose === 1 ? "ruta" : "rutas"}`, true));

  content.innerHTML = `
    <div class="section-header">
      <div class="section-label">Carpetas</div>
      <button class="link" data-action="new-folder">+ Nueva</button>
    </div>
    ${rows.length ? `<ul class="route-list">${rows.join("")}</ul>`
      : `<p class="empty">Crea carpetas para agrupar rutas: un viaje, una sierra, un Camino…</p>`}`;

  content.querySelector('[data-action="new-folder"]').addEventListener("click", onNewFolder);
  for (const el of content.querySelectorAll(".folder-row")) {
    el.addEventListener("click", () => onOpenFolder(el.dataset.id || null));
  }
}

function folderRow(id, name, meta, muted = false) {
  return `
    <li>
      <button class="route-item folder-row" data-id="${id}">
        <span class="folder-icon${muted ? " muted" : ""}">${ICON_FOLDER}</span>
        <span class="info"><strong>${esc(name)}</strong><span>${esc(meta)}</span></span>
        ${CHEVRON}
      </button>
    </li>`;
}

// ---------- Carpeta ----------
// folder = { id, name } o null para "Sin carpeta"
export function renderFolder(panel, { folder, routes }, handlers) {
  const { onBack, onOpen, onRename, onDelete, onVisibleChange, onAddExisting, onRemoveRoute } = handlers;
  releasePhotos();
  panel.innerHTML = `
    ${backButton("Carpetas")}
    <div class="detail-title"><h2>${esc(folder ? folder.name : "Sin carpeta")}</h2></div>
    <div class="stat-row">${totalsHtml(routes)}</div>
    ${folder ? `
      <div class="folder-actions">
        <button class="btn primary" data-action="add-existing">+ Añadir rutas</button>
      </div>` : ""}
    <div class="section-label">Rutas</div>
    <div id="results">${routeListHtml(
      routes,
      "Esta carpeta está vacía. Pulsa <b>+ Añadir rutas</b> para elegir entre las que ya tienes.",
      { removable: !!folder }
    )}</div>
    ${folder ? `
      <div class="detail-actions">
        <button class="btn secondary" data-action="rename">Renombrar</button>
        <button class="btn danger" data-action="delete">Borrar carpeta</button>
      </div>` : ""}`;

  const results = panel.querySelector("#results");
  panel.querySelector('[data-action="back"]').addEventListener("click", onBack);
  bindRouteItems(results, routes, onOpen);
  if (folder) {
    panel.querySelector('[data-action="add-existing"]').addEventListener("click", onAddExisting);
    panel.querySelector('[data-action="rename"]').addEventListener("click", onRename);
    panel.querySelector('[data-action="delete"]').addEventListener("click", onDelete);
    for (const b of results.querySelectorAll(".remove-from-folder")) {
      b.addEventListener("click", () => onRemoveRoute(routes.find((r) => r.id === b.dataset.id)));
    }
  }
  onVisibleChange(routes);
}

// ---------- Piezas compartidas ----------
function totalsHtml(routes) {
  let km = 0, gain = 0;
  for (const r of routes) {
    const s = computeStats(r.points);
    km += s.distanceKm;
    gain += s.gainM ?? 0;
  }
  // Con muchas rutas los totales crecen: sin decimales a partir de 100 km para que quepan
  const kmText = km >= 100 ? `${fmtM(km)} km` : fmtKm(km);
  return stat(routes.length, "Rutas") + stat(kmText, "Distancia") + stat(`${fmtM(gain)} m`, "Desnivel +");
}

function routeListHtml(routes, emptyText, { removable = false } = {}) {
  if (!routes.length) return `<p class="empty">${emptyText}</p>`;
  const items = routes.map((route) => ({ route, stats: computeStats(route.points) }));
  // Más recientes arriba; las rutas sin fecha, al final
  items.sort((a, b) => (b.route.date ?? "").localeCompare(a.route.date ?? ""));
  return `<ul class="route-list">${items.map((i) => routeItem(i, removable)).join("")}</ul>`;
}

function bindRouteItems(container, routes, onOpen) {
  for (const el of container.querySelectorAll(".route-item[data-id]")) {
    el.addEventListener("click", () => onOpen(routes.find((r) => r.id === el.dataset.id)));
  }
}

function routeItem({ route, stats }, removable = false) {
  const gain = stats.gainM !== null ? ` · +${fmtM(stats.gainM)} m` : "";
  const days = route.stageStarts?.length ? ` · ${route.stageStarts.length + 1} días` : "";
  return `
    <li class="${removable ? "removable" : ""}">
      <button class="route-item" data-id="${route.id}">
        <i class="activity-bar" style="background:${activityOf(route.activity).color}"></i>
        <span class="info">
          <strong>${esc(route.name)}</strong>
          <span>${fmtDate(route.date)}${days} · ${fmtKm(stats.distanceKm)}${gain}</span>
        </span>
        ${CHEVRON}
      </button>
      ${removable ? `<button class="remove-from-folder" data-id="${route.id}" title="Quitar de la carpeta" aria-label="Quitar de la carpeta">×</button>` : ""}
    </li>`;
}
