// Corrige la altura de los puntos con el mapa de relieve (las mismas teselas del relieve 3D).
//
// Por qué: la altura que da el GPS del móvil es poco fiable (puede fallar decenas de
// metros, y en Android viene medida sobre un elipsoide, no sobre el nivel del mar).
// El relieve da la altura del terreno en cada punto: el perfil y el desnivel salen mucho
// más parecidos a los de un mapa.
//
// Las teselas "terrarium" guardan la altura en el color de cada píxel:
//   altura = (rojo × 256 + verde + azul / 256) − 32768

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ZOOM = 12; // píxel de unos 25-38 m: de sobra para una ruta a pie o en bici
const SIZE = 256;

async function loadTile(z, x, y) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = TILE_URL(z, x, y);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

// Devuelve los puntos con la altura del relieve, o los mismos puntos si no hay conexión
// (o si tarda demasiado: con mala cobertura no queremos dejarte esperando)
export function withTerrainElevation(points, timeoutMs = 10000) {
  const fallback = new Promise((resolve) => setTimeout(() => resolve({ points, corrected: false }), timeoutMs));
  return Promise.race([correct(points), fallback]);
}

async function correct(points) {
  const n = 2 ** ZOOM;
  const tiles = new Map();
  try {
    const result = [];
    for (const p of points) {
      const x = ((p.lon + 180) / 360) * n;
      const latRad = (p.lat * Math.PI) / 180;
      const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
      const tx = Math.floor(x), ty = Math.floor(y);
      const key = `${tx}/${ty}`;
      if (!tiles.has(key)) tiles.set(key, loadTile(ZOOM, tx, ty));
      const data = await tiles.get(key);
      const px = Math.min(SIZE - 1, Math.floor((x - tx) * SIZE)), py = Math.min(SIZE - 1, Math.floor((y - ty) * SIZE));
      const i = (py * SIZE + px) * 4;
      const ele = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
      result.push({ ...p, ele: Math.round(ele) });
    }
    return { points: result, corrected: true };
  } catch {
    return { points, corrected: false };
  }
}
