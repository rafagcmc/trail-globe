// Ventana para añadir o editar una ruta. Usa <dialog>, el elemento nativo del
// navegador para ventanas modales (gestiona el fondo, la tecla Esc y el foco).
//
// openRouteDialog devuelve una promesa que se cumple cuando se cierra la ventana:
//   - con los datos del formulario si se pulsa "Guardar"
//   - con null si se cancela

import { ACTIVITIES } from "./activities.js";
import { getPhoto } from "./storage.js";
import { esc } from "./format.js";

const dialog = document.getElementById("routeDialog");

export function openRouteDialog({ title, fileInfo = null, values, photoIds = [], folders = [] }) {
  const duration = values.durationMin;
  const hours = duration == null ? "" : Math.floor(duration / 60);
  const minutes = duration == null ? "" : duration % 60;

  dialog.innerHTML = `
    <form method="dialog" class="dialog-form">
      <h2>${esc(title)}</h2>
      ${fileInfo ? `
        <div class="file-card">
          <strong>${esc(fileInfo.name)}</strong>
          <span>${esc(fileInfo.summary)}</span>
        </div>` : ""}
      <label class="field">
        <span>Name</span>
        <input name="name" required maxlength="120" value="${esc(values.name)}">
      </label>
      <div class="field-row">
        <label class="field">
          <span>Date</span>
          <input type="date" name="date" value="${values.date ?? ""}">
        </label>
        <div class="field">
          <span>Duration</span>
          <div class="duration">
            <input type="number" name="hours" min="0" max="999" value="${hours}" aria-label="Hours"> h
            <input type="number" name="minutes" min="0" max="59" value="${minutes}" aria-label="Minutes"> min
          </div>
        </div>
      </div>
      <fieldset class="field">
        <span>Activity</span>
        <div class="chips">
          ${Object.entries(ACTIVITIES).map(([key, a]) => `
            <label class="chip selectable">
              <input type="radio" name="activity" value="${key}" ${key === values.activity ? "checked" : ""}>
              <i style="background:${a.color}"></i>${a.label}
            </label>`).join("")}
        </div>
      </fieldset>
      <div class="field">
        <span>Folder</span>
        <select name="folderId">
          <option value="">None</option>
          ${[...folders].sort((a, b) => a.name.localeCompare(b.name, "en")).map((f) => `
            <option value="${f.id}" ${f.id === values.folderId ? "selected" : ""}>${esc(f.name)}</option>`).join("")}
          <option value="__new">+ New folder…</option>
        </select>
        <input name="newFolderName" placeholder="New folder name" maxlength="60" hidden>
      </div>
      <label class="field">
        <span>Notes</span>
        <textarea name="notes" rows="3" placeholder="How it went, who you went with, what to remember…">${esc(values.notes)}</textarea>
      </label>
      <div class="field">
        <span>Photos</span>
        <div class="photo-grid editable" id="dialogPhotos"></div>
      </div>
      <div class="dialog-actions">
        <button class="btn secondary" value="cancel" formnovalidate>Cancel</button>
        <button class="btn primary" value="save">Save route</button>
      </div>
    </form>`;

  const form = dialog.querySelector("form");

  // Al elegir "+ New folder…" aparece un campo para escribir su nombre
  const folderSelect = form.querySelector('select[name="folderId"]');
  const newFolderInput = form.querySelector('input[name="newFolderName"]');
  folderSelect.addEventListener("change", () => {
    const isNew = folderSelect.value === "__new";
    newFolderInput.hidden = !isNew;
    newFolderInput.required = isNew;
    if (isNew) newFolderInput.focus();
  });
  const grid = dialog.querySelector("#dialogPhotos");
  const newPhotos = []; // archivos que el usuario añade ahora
  const removed = new Set(); // ids de fotos ya guardadas que quiere quitar
  const urls = []; // URLs temporales para las miniaturas

  // Las miniaturas de las fotos ya guardadas se cargan una vez
  const existing = photoIds.map((id) => ({ id, url: null }));
  Promise.all(
    existing.map(async (p) => {
      const blob = await getPhoto(p.id);
      if (blob) urls.push((p.url = URL.createObjectURL(blob)));
    })
  ).then(renderPhotos);

  function thumb(url, onRemove) {
    const div = document.createElement("div");
    div.className = "thumb";
    div.innerHTML = `<img src="${url}" alt=""><button type="button" aria-label="Remove photo">×</button>`;
    div.querySelector("button").addEventListener("click", onRemove);
    return div;
  }

  function renderPhotos() {
    grid.replaceChildren();
    for (const p of existing) {
      if (removed.has(p.id) || !p.url) continue;
      grid.appendChild(thumb(p.url, () => { removed.add(p.id); renderPhotos(); }));
    }
    newPhotos.forEach((photo, i) => {
      grid.appendChild(thumb(photo.url, () => { newPhotos.splice(i, 1); renderPhotos(); }));
    });
    const add = document.createElement("label");
    add.className = "thumb add";
    add.innerHTML = `+<input type="file" accept="image/*" multiple hidden>`;
    add.querySelector("input").addEventListener("change", (e) => {
      for (const file of e.target.files) {
        const url = URL.createObjectURL(file);
        urls.push(url);
        newPhotos.push({ file, url });
      }
      renderPhotos();
    });
    grid.appendChild(add);
  }
  renderPhotos();

  dialog.returnValue = ""; // por si quedó el valor de la vez anterior
  dialog.showModal();

  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        urls.forEach((url) => URL.revokeObjectURL(url));
        if (dialog.returnValue !== "save") return resolve(null);

        const data = new FormData(form);
        const h = data.get("hours"), m = data.get("minutes");
        resolve({
          values: {
            name: data.get("name").trim(),
            date: data.get("date") || null,
            durationMin: h === "" && m === "" ? null : Number(h || 0) * 60 + Number(m || 0),
            activity: data.get("activity") ?? "hiking",
            notes: data.get("notes").trim(),
            folderId: data.get("folderId") === "__new" ? null : data.get("folderId") || null,
          },
          // Si eligió crear carpeta, main.js la crea y asigna la ruta a ella
          newFolderName: data.get("folderId") === "__new" ? data.get("newFolderName").trim() : null,
          newPhotos: newPhotos.map((p) => p.file),
          removedPhotoIds: [...removed],
        });
      },
      { once: true }
    );
  });
}
