// Ventana para elegir rutas que ya tienes y añadirlas a una carpeta.
// Devuelve una promesa con los ids elegidos, o null si se cancela.

import { activityOf } from "./activities.js";
import { applyFilters } from "./filters.js";
import { computeStats } from "./stats.js";
import { fmtDate, fmtKm, esc } from "./format.js";

const dialog = document.getElementById("pickerDialog");

export function pickRoutes({ folder, routes, folders }) {
  const candidates = routes
    .filter((r) => r.folderId !== folder.id)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const folderName = (id) => folders.find((f) => f.id === id)?.name;
  const chosen = new Set();

  dialog.innerHTML = `
    <form method="dialog" class="dialog-form">
      <h2>Add routes to “${esc(folder.name)}”</h2>
      <label class="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" placeholder="Search by name or notes…" aria-label="Search">
      </label>
      <ul class="picker-list"></ul>
      <div class="dialog-actions">
        <button class="btn secondary" value="cancel" formnovalidate>Cancel</button>
        <button class="btn primary" value="save" disabled>Add</button>
      </div>
    </form>`;

  const list = dialog.querySelector(".picker-list");
  const search = dialog.querySelector("input[type=search]");
  const addButton = dialog.querySelector('button[value="save"]');

  function render() {
    const visible = applyFilters(candidates, { query: search.value, activity: "all", period: "all" });
    if (!candidates.length) {
      list.innerHTML = `<li class="empty">All your routes are already in this folder.</li>`;
      return;
    }
    if (!visible.length) {
      list.innerHTML = `<li class="empty">No routes match “${esc(search.value)}”.</li>`;
      return;
    }
    list.innerHTML = visible.map((r) => {
      const other = folderName(r.folderId);
      return `
        <li>
          <label class="picker-item">
            <input type="checkbox" value="${r.id}" ${chosen.has(r.id) ? "checked" : ""}>
            <i class="activity-bar" style="background:${activityOf(r.activity).color}"></i>
            <span class="info">
              <strong>${esc(r.name)}</strong>
              <span>${fmtDate(r.date)} · ${fmtKm(computeStats(r.points).distanceKm)}${other ? ` · in “${esc(other)}”` : ""}</span>
            </span>
          </label>
        </li>`;
    }).join("");
    for (const box of list.querySelectorAll("input[type=checkbox]")) {
      box.addEventListener("change", () => {
        box.checked ? chosen.add(box.value) : chosen.delete(box.value);
        updateButton();
      });
    }
  }

  function updateButton() {
    addButton.disabled = chosen.size === 0;
    addButton.textContent = chosen.size ? `Add ${chosen.size} ${chosen.size === 1 ? "route" : "routes"}` : "Add";
  }

  // Al buscar, las rutas ya marcadas siguen marcadas aunque desaparezcan de la lista
  search.addEventListener("input", render);
  render();

  dialog.returnValue = "";
  dialog.showModal();
  search.focus();

  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "save" ? [...chosen] : null),
      { once: true }
    );
  });
}
