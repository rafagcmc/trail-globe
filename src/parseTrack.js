// Convierte el texto de un archivo GPX o KML en una lista de puntos:
// [{ lat, lon, ele }]  (ele puede ser null si el archivo no trae altura)

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
  return points;
}

function parseGpx(xml) {
  // "trkpt" = punto de un track grabado; "rtept" = punto de una ruta planificada.
  // Usamos "*" como namespace para que funcione con cualquier versión de GPX.
  let nodes = [...xml.getElementsByTagNameNS("*", "trkpt")];
  if (nodes.length === 0) nodes = [...xml.getElementsByTagNameNS("*", "rtept")];

  return nodes.map((node) => {
    const eleNode = node.getElementsByTagNameNS("*", "ele")[0];
    return {
      lat: parseFloat(node.getAttribute("lat")),
      lon: parseFloat(node.getAttribute("lon")),
      ele: eleNode ? parseFloat(eleNode.textContent) : null,
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
      points.push({ lat, lon, ele: Number.isFinite(alt) && alt !== 0 ? alt : null });
    }
  }

  // Formato de Google Earth al grabar tracks: <gx:coord>lon lat alt</gx:coord>
  if (points.length === 0) {
    for (const node of xml.getElementsByTagNameNS("*", "coord")) {
      const [lon, lat, alt] = node.textContent.trim().split(/\s+/).map(Number);
      points.push({ lat, lon, ele: Number.isFinite(alt) ? alt : null });
    }
  }

  return points;
}
