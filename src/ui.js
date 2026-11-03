// Dibuja el contenido del panel lateral: la vista de inicio (lista) y la de detalle.
// Cada función recibe el panel, los datos y las acciones ("handlers") que debe llamar
// cuando el usuario pulsa algo. Así este archivo no sabe nada del mapa ni del guardado.

import { activityOf } from "./activities.js";
import { computeStats, elevationProfile } from "./stats.js";
import { fmtKm, fmtM, fmtSpeed, fmtDuration, fmtDate, esc } from "./format.js";
import { getPhoto } from "./storage.js";

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
export function renderHome(panel, routes, { onAdd, onOpen }) {
  releasePhotos();

  const items = routes.map((route) => ({ route, stats: computeStats(route.points) }));
  const totalKm = items.reduce((sum, i) => sum + i.stats.distanceKm, 0);
  const totalGain = items.reduce((sum, i) => sum + (i.stats.gainM ?? 0), 0);
  // Más recientes arriba; las rutas sin fecha, al final
  items.sort((a, b) => (b.route.date ?? "").localeCompare(a.route.date ?? ""));

  const list = items.length
    ? `<ul class="route-list">${items.map(routeItem).join("")}</ul>`
    : `<p class="empty">Aún no tienes rutas. Pulsa <b>+ Añadir ruta</b> y sube un archivo GPX o KML.</p>`;

  panel.innerHTML = `
    <header class="panel-header">
      <h1>Trail Globe</h1>
      <button class="btn primary" data-action="add">+ Añadir ruta</button>
    </header>
    <div class="stat-row">
      ${stat(routes.length, "Rutas")}
      ${stat(fmtKm(totalKm), "Distancia")}
      ${stat(fmtM(totalGain), "Desnivel + (m)")}
    </div>
    <div class="section-label">Mis rutas</div>
    ${list}`;

  panel.querySelector('[data-action="add"]').addEventListener("click", onAdd);
  for (const el of panel.querySelectorAll(".route-item")) {
    el.addEventListener("click", () => onOpen(routes.find((r) => r.id === el.dataset.id)));
  }
}

function routeItem({ route, stats }) {
  const gain = stats.gainM !== null ? ` · +${fmtM(stats.gainM)} m` : "";
  return `
    <li>
      <button class="route-item" data-id="${route.id}">
        <i class="activity-bar" style="background:${activityOf(route.activity).color}"></i>
        <span class="info">
          <strong>${esc(route.name)}</strong>
          <span>${fmtDate(route.date)} · ${fmtKm(stats.distanceKm)}${gain}</span>
        </span>
        ${CHEVRON}
      </button>
    </li>`;
}

// ---------- Detalle ----------
export async function renderDetail(panel, route, { onBack, onEdit, onDelete }) {
  releasePhotos();

  const s = computeStats(route.points);
  const activity = activityOf(route.activity);
  const speed = route.durationMin ? s.distanceKm / (route.durationMin / 60) : null;
  const profile = elevationProfile(route.points);
  const meters = (v, sign = "") => (v === null ? "—" : `${sign}${fmtM(v)} m`);

  panel.innerHTML = `
    <button class="link-back" data-action="back">← Mis rutas</button>
    <div class="detail-title">
      <h2>${esc(route.name)}</h2>
      <div class="meta">
        <span class="chip"><i style="background:${activity.color}"></i>${activity.label}</span>
        <span>${fmtDate(route.date, true)}</span>
      </div>
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
