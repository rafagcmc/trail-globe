// Identificador único para rutas, carpetas y fotos.
//
// crypto.randomUUID() solo existe en páginas "seguras" (https o localhost). Si abres la
// app desde el móvil con la IP del portátil (http://192.168…), el navegador la desactiva,
// así que en ese caso lo construimos a mano con crypto.getRandomValues(), que sí funciona.
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // marca de "UUID versión 4" (aleatorio)
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
