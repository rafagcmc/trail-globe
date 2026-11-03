// Tipos de actividad: etiqueta y color (los mismos que en el diseño de Figma)
export const ACTIVITIES = {
  hiking: { label: "Senderismo", color: "#2F855A" },
  bike: { label: "Bici", color: "#2B6CB0" },
  camino: { label: "Camino", color: "#C05621" },
};

export function activityOf(key) {
  return ACTIVITIES[key] ?? ACTIVITIES.hiking;
}
