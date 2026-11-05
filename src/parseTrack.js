// Convierte el texto de un archivo GPX o KML en:
// { points: [{ lat, lon, ele, t }], date, trackStarts }
// (ele = altura o null; t = hora del punto en milisegundos o null; date = "AAAA-MM-DD" o null;
//  trackStarts = posiciones donde empieza cada <trk> de un GPX, útil para detectar etapas)

export function parseTrack(text, fileName) {
  const xml = new DOMParser().parseFromString(text, "application/xml");

  if (xml.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The file is not valid XML.");
  }

  const ext = fileName.toLowerCase().split(".").pop();
  const { points, trackStarts } = ext === "kml" ? { points: parseKml(xml), trackStarts: [] } : parseGpx(xml);

  if (points.length < 2) {
    throw new Error("No route found (at least 2 points are needed).");
  }
  return { points, date: findDate(xml), trackStarts };
}

// Primera fecha que aparezca en el archivo: <time> en GPX, <when> en KML.
// Devuelve "AAAA-MM-DD" o null.
function findDate(xml) {
  const node =
    xml.getElementsByTagNameNS("*", "time")[0] ?? xml.getElementsByTagNameNS("*", "when")[0];
  const date = node ? new Date(node.textContent.trim()) : null;
  return date && !isNaN(date) ? date.toISOString().slice(0, 10) : null;
}

function parseGpx(xml) {
  // Un GPX puede traer varios <trk> (por ejemplo, uno por etapa). Recorremos cada uno
  // y apuntamos en qué posición empieza, para proponer luego la división en días.
  const points = [];
  const trackStarts = [];
  for (const trk of xml.getElementsByTagNameNS("*", "trk")) {
    const nodes = [...trk.getElementsByTagNameNS("*", "trkpt")];
    if (nodes.length === 0) continue;
    if (points.length > 0) trackStarts.push(points.length);
    points.push(...nodes.map(readPoint));
  }
  // "rtept" = punto de una ruta planificada (sin <trk>)
  if (points.length === 0) points.push(...[...xml.getElementsByTagNameNS("*", "rtept")].map(readPoint));
  return { points, trackStarts };
}

// Usamos "*" como namespace para que funcione con cualquier versión de GPX
function readPoint(node) {
  const eleNode = node.getElementsByTagNameNS("*", "ele")[0];
  const timeNode = node.getElementsByTagNameNS("*", "time")[0];
  return {
    lat: parseFloat(node.getAttribute("lat")),
    lon: parseFloat(node.getAttribute("lon")),
    ele: eleNode ? parseFloat(eleNode.textContent) : null,
    t: timeNode ? parseTime(timeNode.textContent) : null,
  };
}

function parseKml(xml) {
  const points = [];

  // Formato clásico: <coordinates>lon,lat,alt lon,lat,alt ...</coordinates>
  for (const node of xml.getElementsByTagNameNS("*", "coordinates")) {
    const tuples = node.textContent.trim().split(/\s+/);
    if (tuples.length < 2) continue; // un solo punto = marcador, no ruta
    for (const tuple of tuples) {
      const [lon, lat, alt] = tuple.split(",").map(Number);
      points.push({ lat, lon, ele: Number.isFinite(alt) && alt !== 0 ? alt : null, t: null });
    }
  }

  // Formato de Google Earth al grabar tracks: <gx:coord>lon lat alt</gx:coord>
  if (points.length === 0) {
    // Cada <gx:coord> va emparejado, en el mismo orden, con un <when> (su hora)
    const whens = [...xml.getElementsByTagNameNS("*", "when")];
    [...xml.getElementsByTagNameNS("*", "coord")].forEach((node, i) => {
      const [lon, lat, alt] = node.textContent.trim().split(/\s+/).map(Number);
      points.push({
        lat,
        lon,
        ele: Number.isFinite(alt) ? alt : null,
        t: whens[i] ? parseTime(whens[i].textContent) : null,
      });
    });
  }

  return points;
}

// Convierte una fecha ISO ("2026-10-12T08:03:11Z") en milisegundos, o null si no es válida
function parseTime(text) {
  const ms = Date.parse(text.trim());
  return Number.isNaN(ms) ? null : ms;
}
