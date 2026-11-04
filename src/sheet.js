// En el móvil, el panel lateral se convierte en una "hoja" que sube desde abajo,
// como en Google Maps: se arrastra desde el asa y se queda en una de tres alturas.
//   0 = mínima (solo la cabecera, para ver el mapa)
//   1 = media  (mapa arriba, contenido abajo)
//   2 = casi pantalla completa
// En el ordenador no hace nada: el panel sigue siendo la tarjeta de la izquierda.

const MOBILE = matchMedia("(max-width: 720px)");

export function initSheet(sheet, handle) {
  let state = 1;
  const snaps = () => [104, Math.round(innerHeight * 0.46), innerHeight - 64];
  const apply = (px) => sheet.style.setProperty("--sheet-h", `${px}px`);

  function setState(i) {
    state = i;
    apply(snaps()[i]);
  }

  // Arrastrar el asa: la hoja sigue al dedo y al soltar se va a la altura más cercana
  // (o a la siguiente si el gesto ha sido rápido, como un "lanzamiento")
  let start = null;
  handle.addEventListener("pointerdown", (e) => {
    if (!MOBILE.matches) return;
    start = { y: e.clientY, h: sheet.getBoundingClientRect().height, t: performance.now() };
    handle.setPointerCapture(e.pointerId);
    sheet.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!start) return;
    const max = snaps()[2];
    apply(Math.min(Math.max(start.h - (e.clientY - start.y), 80), max));
  });
  const end = (e) => {
    if (!start) return;
    sheet.classList.remove("dragging");
    const dy = e.clientY - start.y;
    const speed = dy / (performance.now() - start.t); // píxeles por milisegundo
    start = null;
    if (Math.abs(dy) < 6) return setState(state === 1 ? 2 : 1); // un toque: alterna media / grande
    if (speed < -0.5) return setState(Math.min(state + 1, 2));
    if (speed > 0.5) return setState(Math.max(state - 1, 0));
    const h = sheet.getBoundingClientRect().height;
    const s = snaps();
    setState(s.indexOf(s.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a))));
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);

  addEventListener("resize", () => setState(state));
  setState(state);

  return {
    isMobile: () => MOBILE.matches,
    setState,
    // Altura que tendrá la hoja (sin esperar a que acabe la animación)
    height: () => (MOBILE.matches ? snaps()[state] : 0),
  };
}
