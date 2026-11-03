// Convierte el texto de un archivo GPX o KML en:
// { points: [{ lat, lon, ele, t }], date }
// (ele = altura o null; t = hora del punto en milisegundos o null; date = "AAAA-MM-DD" o null)

export function parseTrack(text, fileName) {
  const xml = new DOMParser().parseFromString(text, "application/xml");

  if (xml.getElementsByTagName("parsererror").length > 0) {
    throw new Error("El archivo no es un XML válido.");
  }

  const ext = fileName.toLowerCase().split(".").pop();
  const points = ext === "kml" ? parseKml(xml) : parseGpx(xml);

  if (points.length < 2) {
    throw new Error("No he encontrado una ruta (hacen falta al menos 2 puntos).");
  }
  return { points, date: findDate(xml) };
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
  // "trkpt" = punto de un track grabado; "rtept" = punto de una ruta planificada.
  // Usamos "*" como namespace para que funcione con cualquier versión de GPX.
  let nodes = [...xml.getElementsByTagNameNS("*", "trkpt")];
  if (nodes.length === 0) nodes = [...xml.getElementsByTagNameNS("*", "rtept")];

  return nodes.map((node) => {
    const eleNode = node.getElementsByTagNameNS("*", "ele")[0];
    const timeNode = node.getElementsByTagNameNS("*", "time")[0];
    return {
      lat: parseFloat(node.getAttribute("lat")),
      lon: parseFloat(node.getAttribute("lon")),
      ele: eleNode ? parseFloat(eleNode.textContent) : null,
      t: timeNode ? parseTime(timeNode.textContent) : null,
    };
  });
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
