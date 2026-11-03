// Dibuja el contenido del panel lateral: la vista de inicio (lista) y la de detalle.
// Cada función recibe el panel, los datos y las acciones ("handlers") que debe llamar
// cuando el usuario pulsa algo. Así este archivo no sabe nada del mapa ni del guardado.

import { ACTIVITIES, activityOf } from "./activities.js";
import { applyFilters, periodOptions, hasActiveFilters } from "./filters.js";
import { computeStats, elevationProfile } from "./stats.js";
import { fmtKm, fmtM, fmtSpeed, fmtDuration, fmtDate, esc } from "./format.js";
import { getPhoto } from "./storage.js";

const ICON_SEARCH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_FOLDER = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Las fotos se muestran con URLs temporales (blob:) que hay que liberar al salir
let photoUrls = [];
function releasePhotos() {
  photoUrls.forEach((url) => URL.revokeObjectURL(url));
  photoUrls = [];
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
      <button class="btn primary" data-action="add">+ Añadir ruta</button>
    </header>
    <label class="search">
      ${ICON_SEARCH}
      <input type="search" placeholder="Buscar ruta o notas…" value="${esc(filters.query)}" aria-label="Buscar">
    </label>
    <div class="stat-row" id="totals"></div>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="list" aria-selected="${tab === "list"}">Lista</button>
      <button role="tab" data-tab="folders" aria-selected="${tab === "folders"}">Carpetas</button>
      <button role="tab" disabled title="Próximamente">Álbum</button>
    </div>
    <div id="homeContent"></div>`;

  panel.querySelector('[data-action="add"]').addEventListener("click", handlers.onAdd);
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
        : "Aún no tienes rutas. Pulsa <b>+ Añadir ruta</b> y sube un archivo GPX o KML."
    );
    bindRouteItems(results, routes, handlers.onOpen);
    handlers.onVisibleChange(visible);
  }

  search.addEventListener("input", () => { filters.query = search.value; update(); });
  for (const sel of selects) {
    sel.addEventListener("change", () => { filters[sel.dataset.filter] = sel.value; update(); });
  }
  clear.addEventListener("click", () => {
    Object.assign(filters, { query: "", activity: "all", period: "all" });
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
    <button class="link-back" data-action="back">← Carpetas</button>
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
  return stat(routes.length, "Rutas") + stat(fmtKm(km), "Distancia") + stat(`+${fmtM(gain)} m`, "Desnivel +");
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
  return `
    <li class="${removable ? "removable" : ""}">
      <button class="route-item" data-id="${route.id}">
        <i class="activity-bar" style="background:${activityOf(route.activity).color}"></i>
        <span class="info">
          <strong>${esc(route.name)}</strong>
          <span>${fmtDate(route.date)} · ${fmtKm(stats.distanceKm)}${gain}</span>
        </span>
        ${CHEVRON}
      </button>
      ${removable ? `<button class="remove-from-folder" data-id="${route.id}" title="Quitar de la carpeta" aria-label="Quitar de la carpeta">×</button>` : ""}
    </li>`;
}

// ---------- Detalle ----------
export async function renderDetail(panel, route, { onBack, onEdit, onDelete, backLabel = "Mis rutas", folderName = null }) {
  releasePhotos();

  const s = computeStats(route.points);
  const activity = activityOf(route.activity);
  const speed = route.durationMin ? s.distanceKm / (route.durationMin / 60) : null;
  const profile = elevationProfile(route.points);
  const meters = (v, sign = "") => (v === null ? "—" : `${sign}${fmtM(v)} m`);

  panel.innerHTML = `
    <button class="link-back" data-action="back">← ${esc(backLabel)}</button>
    <div class="detail-title">
      <h2>${esc(route.name)}</h2>
      <div class="meta">
        <span class="chip"><i style="background:${activity.color}"></i>${activity.label}</span>
        <span>${fmtDate(route.date, true)}</span>
      </div>
      ${folderName ? `<div class="meta folder-meta">${ICON_FOLDER}<span>${esc(folderName)}</span></div>` : ""}
    </div>
    <div class="stat-grid">
      ${stat(fmtKm(s.distanceKm), "Distancia")}
      ${stat(fmtDuration(route.durationMin), "Duración")}
      ${stat(meters(s.gainM, "+"), "Desnivel +")}
      ${stat(meters(s.lossM, "−"), "Desnivel −")}
      ${stat(meters(s.maxEleM), "Altitud máx.")}
      ${stat(speed ? fmtSpeed(speed) : "—", "Velocidad media")}
    </div>
    ${profile ? `
      <section>
        <div class="section-label">Perfil de elevación</div>
        ${profileSvg(profile, activity.color)}
        <div class="axis"><span>0 km</span><span>${fmtKm(s.distanceKm / 2)}</span><span>${fmtKm(s.distanceKm)}</span></div>
      </section>` : ""}
    ${route.notes ? `
      <section>
        <div class="section-label">Notas</div>
        <p class="notes">${esc(route.notes)}</p>
      </section>` : ""}
    ${route.photoIds.length ? `
      <section>
        <div class="section-label">Fotos · ${route.photoIds.length}</div>
        <div class="photo-grid" id="detailPhotos"></div>
      </section>` : ""}
    <div class="detail-actions">
      <button class="btn secondary" data-action="edit">Editar</button>
      <button class="btn danger" data-action="delete">Borrar</button>
    </div>`;

  panel.querySelector('[data-action="back"]').addEventListener("click", onBack);
  panel.querySelector('[data-action="edit"]').addEventListener("click", onEdit);
  panel.querySelector('[data-action="delete"]').addEventListener("click", onDelete);

  // Las fotos se leen de la base de datos después de pintar el resto,
  // para que el panel aparezca al instante
  const grid = panel.querySelector("#detailPhotos");
  if (!grid) return;
  for (const id of route.photoIds) {
    const blob = await getPhoto(id);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    photoUrls.push(url);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.innerHTML = `<img src="${url}" alt="Foto de la ruta">`;
    grid.appendChild(link);
  }
}

// Dibuja el perfil como un SVG: línea + área degradada debajo
function profileSvg(profile, color) {
  const W = 304, H = 96, PAD = 6;
  const maxD = profile[profile.length - 1].d || 1;
  const eles = profile.map((p) => p.e);
  const minE = Math.min(...eles);
  const range = Math.max(Math.max(...eles) - minE, 1);
  const x = (d) => ((d / maxD) * W).toFixed(1);
  const y = (e) => (H - PAD - ((e - minE) / range) * (H - 2 * PAD)).toFixed(1);

  const line = profile.map((p, i) => `${i ? "L" : "M"}${x(p.d)} ${y(p.e)}`).join(" ");
  return `
    <svg class="profile" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Perfil de elevación">
      <defs>
        <linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="1" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#profileFill)"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
}
