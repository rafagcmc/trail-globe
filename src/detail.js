// Vista de detalle de una ruta, incluidas las rutas de varios días.
//
// view = { day, editing, backLabel, folderName }
//   day: -1 = "Total", 0..n-1 = un día concreto
//   editing: true = modo "Editar etapas" (dividir / unir días en el perfil)

import { activityOf } from "./activities.js";
import { computeStats, elevationProfile } from "./stats.js";
import { dayRanges, cumulativeKm, dayDate } from "./stages.js";
import { fmtKm, fmtM, fmtSpeed, fmtDuration, fmtDate, esc, backButton } from "./format.js";
import { getPhoto } from "./storage.js";
import { rarityOf, gems } from "./rarity.js";

const ICON_FOLDER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

// Las fotos se muestran con URLs temporales (blob:) que hay que liberar al salir
let photoUrls = [];
export function releasePhotos() {
  photoUrls.forEach((url) => URL.revokeObjectURL(url));
  photoUrls = [];
}

const stat = (value, label) =>
  `<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
const meters = (v, sign = "") => (v === null ? "—" : `${sign}${fmtM(v)} m`);

export async function renderDetail(panel, route, view, h) {
  releasePhotos();

  const activity = activityOf(route.activity);
  const days = dayRanges(route.points, route.stageStarts);
  const multiDay = days.length > 1;
  const cum = cumulativeKm(route.points);
  const totalKm = cum[cum.length - 1];
  const day = multiDay && view.day >= 0 ? days[view.day] : null;

  // Datos: de la ruta entera o solo del día elegido
  const points = day ? route.points.slice(day.start, day.end + 1) : route.points;
  const s = computeStats(points);
  const duration = day ? s.durationMin : route.durationMin;
  const speed = duration ? s.distanceKm / (duration / 60) : null;

  const profile = elevationProfile(route.points) ?? [{ d: 0, e: 0 }, { d: totalKm, e: 0 }];
  const splitsKm = route.stageStarts.map((i) => cum[i]);
  const highlight = day ? [cum[day.start], cum[day.end]] : null;

  panel.innerHTML = `
    ${backButton(view.editing ? "Volver a la ruta" : view.backLabel)}
    <div class="detail-title">
      <h2>${esc(route.name)}</h2>
      <div class="meta">
        <span class="chip"><i style="background:${activity.color}"></i>${activity.label}</span>
        ${rarityChip(route)}
        <span>${multiDay ? `${days.length} días · ` : ""}${fmtDate(route.date, true)}</span>
      </div>
      ${view.folderName ? `<div class="meta folder-meta">${ICON_FOLDER}<span>${esc(view.folderName)}</span></div>` : ""}
    </div>
    ${view.editing ? editorHtml(route, days, cum, profile, splitsKm, activity.color) : `
      ${multiDay ? dayTabsHtml(days.length, view.day) : ""}
      ${day ? dayHeaderHtml(route, days, view.day, cum) : ""}
      <div class="stat-grid">
        ${stat(fmtKm(s.distanceKm), "Distancia")}
        ${stat(fmtDuration(duration), "Duración")}
        ${stat(meters(s.gainM, "+"), "Desnivel +")}
        ${stat(meters(s.lossM, "−"), "Desnivel −")}
        ${stat(meters(s.maxEleM), "Altitud máx.")}
        ${stat(speed ? fmtSpeed(speed) : "—", "Velocidad media")}
      </div>
      <section>
        <div class="section-label">${day ? `Perfil · día ${view.day + 1} resaltado` : "Perfil de elevación"}</div>
        ${profileSvg(profile, activity.color, { splitsKm, highlight })}
        ${axisHtml(totalKm, multiDay ? days.length : 0)}
      </section>
      <button class="btn dashed" data-action="edit-stages">
        ${multiDay ? "✂ Editar etapas: dividir o unir días" : "✂ Dividir en días"}
      </button>
      ${day ? `
        <section>
          <div class="section-label">Notas del día ${view.day + 1}</div>
          <textarea class="day-notes" rows="3" placeholder="Qué pasó este día, dónde dormiste…">${esc(route.dayNotes[day.start] ?? "")}</textarea>
        </section>` : `
        ${route.notes ? `
          <section>
            <div class="section-label">Notas</div>
            <p class="notes">${esc(route.notes)}</p>
          </section>` : ""}
        ${route.photoIds.length ? `
          <section>
            <div class="section-label">Fotos · ${route.photoIds.length}</div>
            <div class="photo-grid" id="detailPhotos"></div>
          </section>` : ""}`}
      <div class="detail-actions">
        <button class="btn secondary" data-action="edit">Editar</button>
        <button class="btn danger" data-action="delete">Borrar</button>
      </div>`}`;

  const $ = (sel) => panel.querySelector(sel);
  $('[data-action="back"]').addEventListener("click", view.editing ? h.onDoneStages : h.onBack);

  if (view.editing) return bindEditor(panel, totalKm, h);

  $('[data-action="edit"]').addEventListener("click", h.onEdit);
  $('[data-action="delete"]').addEventListener("click", h.onDelete);
  $('[data-action="edit-stages"]').addEventListener("click", h.onEditStages);
  for (const b of panel.querySelectorAll("[data-day]")) {
    b.addEventListener("click", () => h.onSelectDay(Number(b.dataset.day)));
  }
  // Las notas del día se guardan solas al salir del cuadro de texto
  $(".day-notes")?.addEventListener("change", (e) => h.onSaveDayNotes(day.start, e.target.value.trim()));

  // Las fotos se leen de la base de datos después de pintar el resto,
  // para que el panel aparezca al instante
  const grid = $("#detailPhotos");
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

function dayTabsHtml(count, selected) {
  const tab = (value, label) =>
    `<button data-day="${value}" aria-selected="${value === selected}">${label}</button>`;
  return `<div class="day-tabs">${tab(-1, "Total")}${Array.from({ length: count }, (_, i) => tab(i, `D${i + 1}`)).join("")}</div>`;
}

function dayHeaderHtml(route, days, k, cum) {
  const d = days[k];
  const date = dayDate(route.points, d);
  return `
    <div class="day-header">
      <strong>Día ${k + 1} de ${days.length}</strong>
      <span>${date ? `${fmtDate(date, true)} · ` : ""}km ${fmtKm(cum[d.start]).replace(" km", "")} – ${fmtKm(cum[d.end])}</span>
    </div>`;
}

function axisHtml(totalKm, dayCount) {
  if (dayCount > 1 && dayCount <= 10) {
    return `<div class="axis">${Array.from({ length: dayCount }, (_, i) => `<span>D${i + 1}</span>`).join("")}</div>`;
  }
  return `<div class="axis"><span>0 km</span><span>${fmtKm(totalKm / 2)}</span><span>${fmtKm(totalKm)}</span></div>`;
}

// ---------- Editor de etapas ----------
function editorHtml(route, days, cum, profile, splitsKm, color) {
  return `
    <section class="stage-editor">
      <div class="section-label">Editar etapas</div>
      <p class="help">Pulsa en el perfil el punto donde terminó cada día para dividir la ruta. Al pasar el dedo o el ratón por el perfil, el punto se marca en el mapa.</p>
      <div class="profile-wrap" id="stageProfile">
        ${profileSvg(profile, color, { splitsKm, tall: true })}
        <div class="cursor" hidden><span></span></div>
      </div>
      <ul class="stage-list">
        ${days.map((d, k) => `
          <li>
            <strong>Día ${k + 1}</strong>
            <span>km ${fmtKm(cum[d.start]).replace(" km", "")} – ${fmtKm(cum[d.end])}</span>
            ${k > 0 ? `<button class="link" data-merge="${d.start}" title="Unir con el día ${k}">Unir con el día ${k}</button>` : ""}
          </li>`).join("")}
      </ul>
      <button class="btn primary" data-action="done">Listo</button>
    </section>`;
}

function bindEditor(panel, totalKm, h) {
  const wrap = panel.querySelector("#stageProfile");
  const cursor = wrap.querySelector(".cursor");
  const kmAt = (e) => {
    const rect = wrap.getBoundingClientRect();
    return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * totalKm;
  };
  wrap.addEventListener("pointermove", (e) => {
    const km = kmAt(e);
    cursor.hidden = false;
    cursor.style.left = `${(km / totalKm) * 100}%`;
    cursor.querySelector("span").textContent = fmtKm(km);
    h.onHoverKm(km);
  });
  wrap.addEventListener("pointerleave", () => {
    cursor.hidden = true;
    h.onHoverKm(null);
  });
  wrap.addEventListener("click", (e) => h.onAddSplit(kmAt(e)));
  for (const b of panel.querySelectorAll("[data-merge]")) {
    b.addEventListener("click", () => h.onRemoveSplit(Number(b.dataset.merge)));
  }
  panel.querySelector('[data-action="done"]').addEventListener("click", h.onDoneStages);
}

// ---------- Perfil ----------
// Línea + área degradada; opcionalmente con divisiones de días y un tramo resaltado
function profileSvg(profile, color, { splitsKm = [], highlight = null, tall = false } = {}) {
  const W = 304, H = tall ? 120 : 96, PAD = 6;
  const maxD = profile[profile.length - 1].d || 1;
  const eles = profile.map((p) => p.e);
  const minE = Math.min(...eles);
  const range = Math.max(Math.max(...eles) - minE, 1);
  const x = (d) => ((d / maxD) * W).toFixed(1);
  const y = (e) => (H - PAD - ((e - minE) / range) * (H - 2 * PAD)).toFixed(1);

  const line = profile.map((p, i) => `${i ? "L" : "M"}${x(p.d)} ${y(p.e)}`).join(" ");
  // Con un día resaltado, el resto del área se aclara
  const dim = highlight ? 0.08 : 0.35;
  return `
    <svg class="profile${tall ? " tall" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Perfil de elevación">
      <defs>
        <linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${color}" stop-opacity="${dim}"/>
          <stop offset="1" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
        ${highlight ? `<clipPath id="dayClip"><rect x="${x(highlight[0])}" y="0" width="${(x(highlight[1]) - x(highlight[0])).toFixed(1)}" height="${H}"/></clipPath>` : ""}
      </defs>
      <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#profileFill)"/>
      ${highlight ? `<path d="${line} L${W} ${H} L0 ${H} Z" fill="${color}" fill-opacity="0.3" clip-path="url(#dayClip)"/>` : ""}
      ${splitsKm.map((km) => `<line x1="${x(km)}" y1="0" x2="${x(km)}" y2="${H}" stroke="#9AA19D" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`).join("")}
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

// Rareza de la carta de la ruta, con el porqué al pasar el ratón
function rarityChip(route) {
  const { level, rarity, reasons } = rarityOf(route);
  return `<span class="chip rar-chip" style="--rc:${rarity.color}" title="${esc(reasons.join(" · "))}">${gems(level, rarity.color)}${rarity.name}</span>`;
}
