// Carta de una ruta: sustituye a los antiguos sellos.
// Marco y diamantes del color de su rareza, dibujo con la forma de la ruta sobre
// su perfil de altura, nombre, lugar y las tres cifras que deciden la rareza.

import { activityOf } from "./activities.js";
import { computeStats, elevationProfile } from "./stats.js";
import { rarityOf, gems } from "./rarity.js";
import { placesOf } from "./album.js";
import { fmtM, esc } from "./format.js";
import { dayRanges } from "./stages.js";

const km1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function cardHtml(route, number) {
  const { level, rarity } = rarityOf(route);
  const s = computeStats(route.points);
  const days = dayRanges(route.points, route.stageStarts ?? []).length;
  const place = placesOf(route);
  const where = [place.regions[0]?.name, place.countries.length > 1 ? `${place.countries.length} countries` : place.countries[0]?.name]
    .filter(Boolean).join(", ");
  return `
    <button class="card r-${rarity.id}" data-route="${route.id}" style="--rc:${rarity.color};--rs:${rarity.soft}" title="${esc(route.name)} · ${rarity.name}">
      <span class="card-top">${gems(level, rarity.color)}<span class="card-rarity">${rarity.name}</span><span class="card-no">#${String(number ?? 0).padStart(3, "0")}</span></span>
      <span class="card-art">${artSvg(route, rarity.color)}${days > 1 ? `<span class="card-days">${days} days</span>` : ""}</span>
      <span class="card-name">${esc(route.name)}</span>
      <span class="card-place"><i style="background:${activityOf(route.activity).color}"></i><span>${esc(where || activityOf(route.activity).label)}</span></span>
      <span class="card-stats">
        <span><b>${km1.format(s.distanceKm)}</b>km</span>
        <span><b>+${s.gainM == null ? "—" : fmtM(s.gainM)}</b>m</span>
        <span><b>${s.maxEleM == null ? "—" : fmtM(s.maxEleM)}</b>m max</span>
      </span>
    </button>`;
}

// Dibujo: perfil de altura de fondo (suave) y la forma de la ruta encima
const ART_W = 120, ART_H = 80;
function artSvg(route, color) {
  let profile = "";
  const prof = elevationProfile(route.points, 60);
  if (prof) {
    const maxD = prof[prof.length - 1].d || 1;
    const es = prof.map((p) => p.e);
    const lo = Math.min(...es), hi = Math.max(...es);
    const y = (e) => ART_H - 6 - ((e - lo) / (hi - lo || 1)) * (ART_H * 0.45);
    const line = prof.map((p, i) => `${i ? "L" : "M"}${((p.d / maxD) * ART_W).toFixed(1)} ${y(p.e).toFixed(1)}`).join(" ");
    profile = `<path d="${line} L${ART_W} ${ART_H} L0 ${ART_H} Z" fill="${color}" opacity="0.13"/>`;
  }

  // Forma de la ruta encajada con margen
  const W = ART_W - 28, H = ART_H - 22;
  const step = Math.max(1, Math.floor(route.points.length / 150));
  const pts = route.points.filter((_, i) => i % step === 0 || i === route.points.length - 1);
  const k = Math.cos((pts[0].lat * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * k), ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min(W / (maxX - minX || 1e-9), H / (maxY - minY || 1e-9));
  const ox = 14 + (W - (maxX - minX) * sc) / 2, oy = 9 + (H - (maxY - minY) * sc) / 2;
  const P = (i) => [(ox + (xs[i] - minX) * sc).toFixed(1), (oy + (ys[i] - minY) * sc).toFixed(1)];
  const d = xs.map((_, i) => `${i ? "L" : "M"}${P(i).join(" ")}`).join(" ");
  const [sx, sy] = P(0), [ex, ey] = P(xs.length - 1);

  return `<svg viewBox="0 0 ${ART_W} ${ART_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${profile}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx}" cy="${sy}" r="3" fill="#fff" stroke="${color}" stroke-width="1.6"/>
    <circle cx="${ex}" cy="${ey}" r="3" fill="${color}"/>
  </svg>`;
}
