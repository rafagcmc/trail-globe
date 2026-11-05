// Pantalla de grabación (en el panel lateral o la hoja inferior del móvil).
//   Antes de empezar: elegir actividad y esperar a tener buena señal GPS
//   Grabando: tiempo, distancia, desnivel, altitud y velocidad; pausar y terminar
//
// h = { onBack, onStart(activity), onPause, onResume, onFinish, onDiscard, onActivity(activity), onSettings }

import { ACTIVITIES } from "./activities.js";
import { fmtM, esc, backButton } from "./format.js";
import { isNativeApp } from "./tracker.js";

const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

// Calidad de la señal: buena (≤ 10 m), regular (≤ 35 m: se graba), mala (no se graba)
function gpsLine(gps) {
  if (gps.error === "denied") return { cls: "bad", text: "No location permission" };
  if (gps.error === "unsupported") return { cls: "bad", text: "This browser has no GPS" };
  if (gps.acc == null) return { cls: "wait", text: "Looking for GPS signal…" };
  const m = Math.round(gps.acc);
  if (gps.acc <= 10) return { cls: "good", text: `Good GPS · ±${m} m` };
  if (gps.acc <= 35) return { cls: "ok", text: `Fair GPS · ±${m} m` };
  return { cls: "bad", text: `Weak GPS · ±${m} m · waiting for better accuracy` };
}

const webNote = () => isNativeApp() ? "" : `
  <p class="rec-note">On the web, <b>keep the screen on</b> and this page open: if the screen turns off, the browser stops receiving GPS. The Android app keeps recording with the screen off.</p>`;

export function renderRecordStart(panel, { gps, activity }, h) {
  const g = gpsLine(gps);
  panel.innerHTML = `
    ${backButton("My routes")}
    <div class="rec-start">
      <h2>Record a route</h2>
      <div class="rec-acts" role="radiogroup" aria-label="Activity">
        ${Object.entries(ACTIVITIES).map(([k, a]) => `
          <button role="radio" aria-checked="${k === activity}" data-act="${k}" style="--ac:${a.color}">
            <i></i>${a.label}
          </button>`).join("")}
      </div>
      <div class="rec-gps ${g.cls}"><i></i><span>${esc(g.text)}</span></div>
      ${gps.error === "denied" ? `<p class="rec-note">Allow location for Trail Globe in ${isNativeApp() ? `the settings (<button class="link" data-action="settings">open settings</button>)` : "the browser settings (the padlock next to the address)"} and try again.</p>` : ""}
      <button class="rec-go" data-action="start" ${gps.error ? "disabled" : ""}>
        <span class="rec-dot"></span>Start
      </button>
      ${gps.acc == null && !gps.error ? `<p class="rec-hint">You can start now: points are saved as soon as there is a signal.</p>` : ""}
      ${webNote()}
    </div>`;
  panel.querySelector("[data-action=back]").onclick = h.onBack;
  panel.querySelector("[data-action=start]").onclick = () => h.onStart(activity);
  panel.querySelector("[data-action=settings]")?.addEventListener("click", h.onSettings);
  for (const b of panel.querySelectorAll("[data-act]")) b.onclick = () => h.onActivity(b.dataset.act);
}

export function renderRecording(panel, rec, h) {
  const { state, gps } = rec;
  const s = rec.stats();
  const moving = rec.movingMs();
  const speed = moving > 60000 ? s.distanceKm / (moving / 3600000) : null;
  const paused = state.status === "paused";
  const a = ACTIVITIES[state.activity];
  const g = gpsLine(gps);
  const last = state.points[state.points.length - 1];

  // Solo se rehace el HTML la primera vez; luego se actualizan los números (sin parpadeos)
  if (!panel.querySelector(".rec-live")) {
    panel.innerHTML = `
      ${backButton("My routes")}
      <div class="rec-live">
        <div class="rec-status"><span class="rec-dot"></span><strong data-f="status"></strong><span class="chip"><i style="background:${a.color}"></i>${esc(a.label)}</span></div>
        <div class="rec-clock" data-f="clock"></div>
        <div class="rec-grid">
          <div><strong data-f="km"></strong><span>km</span></div>
          <div><strong data-f="gain"></strong><span>m gain</span></div>
          <div><strong data-f="ele"></strong><span>m altitude</span></div>
          <div><strong data-f="speed"></strong><span>km/h avg</span></div>
        </div>
        <div class="rec-gps" data-f="gps"><i></i><span></span></div>
        <div class="rec-actions">
          <button class="rec-btn" data-action="toggle"></button>
          <button class="rec-btn finish" data-action="finish">Finish</button>
        </div>
        <p class="rec-hint">Elevation is corrected with the terrain model when you save.</p>
        ${webNote()}
      </div>`;
    panel.querySelector("[data-action=back]").onclick = h.onBack;
    panel.querySelector("[data-action=finish]").onclick = h.onFinish;
    panel.querySelector("[data-action=toggle]").onclick = () => (rec.state.status === "paused" ? h.onResume() : h.onPause());
  }
  const set = (f, v) => { const el = panel.querySelector(`[data-f=${f}]`); if (el && el.textContent !== v) el.textContent = v; };
  panel.querySelector(".rec-live").classList.toggle("paused", paused);
  set("status", paused ? "Paused" : "Recording");
  set("clock", clock(moving));
  set("km", s.distanceKm >= 10 ? oneDecimal.format(s.distanceKm) : twoDecimals.format(s.distanceKm));
  set("gain", s.gainM == null ? "—" : fmtM(s.gainM));
  set("ele", last?.ele == null ? "—" : fmtM(last.ele));
  set("speed", speed == null ? "—" : oneDecimal.format(speed));
  const gpsEl = panel.querySelector("[data-f=gps]");
  gpsEl.className = `rec-gps ${g.cls}`;
  gpsEl.querySelector("span").textContent = g.text;
  const toggle = panel.querySelector("[data-action=toggle]");
  toggle.textContent = paused ? "Resume" : "Pause";
  toggle.classList.toggle("resume", paused);
}

// Barra en el inicio mientras se graba: para volver a la pantalla de grabación
export function recordingBanner(rec) {
  if (!rec.active) return "";
  const paused = rec.state.status === "paused";
  return `<button class="rec-banner${paused ? " paused" : ""}" data-action="recording">
    <span class="rec-dot"></span><strong>${paused ? "Recording paused" : "Recording"}</strong>
    <span data-f="banner">${clock(rec.movingMs())} · ${twoDecimals.format(rec.stats().distanceKm)} km</span>
    <span class="rb-open">View ›</span></button>`;
}
