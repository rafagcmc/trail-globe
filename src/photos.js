// Reduce una foto antes de guardarla: las fotos del móvil pesan 3-8 MB y
// el navegador tiene espacio limitado. A 1600 px de lado se siguen viendo
// bien y ocupan unos 200-400 KB.

export async function resizeImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file); // respeta la orientación de la foto
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // toBlob funciona con un "callback"; lo envolvemos en una promesa para usar await
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}
