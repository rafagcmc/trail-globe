// Medalla hexagonal: la usan las insignias de región y los logros.
// Doble hexágono (canto de color + cara clara), un bisel fino y el icono en el centro.

const ICONS = {
  // Montaña con nieve en la cima
  peak: (c) => `<path d="M3 20 L10 8 L14 14 L16.5 10.5 L22 20 Z" fill="${c}"/><path d="M8.2 11 L10 8 L11.8 11" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`,
  // Camino que serpentea entre dos puntos
  boot: (c) => `<path d="M5 19c4 0 3-6 7-6s3-6 7-6" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><circle cx="5" cy="19" r="2.2" fill="${c}"/><circle cx="19" cy="7" r="2.2" fill="${c}"/>`,
  globe: (c) => `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${c}" stroke-width="2"/><ellipse cx="12" cy="12" rx="3.6" ry="8.5" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M3.5 12h17" stroke="${c}" stroke-width="1.6"/>`,
  card: (c) => `<rect x="5" y="3.5" width="11" height="15" rx="2" fill="none" stroke="${c}" stroke-width="1.8" transform="rotate(-8 10 11)"/><rect x="9" y="5.5" width="11" height="15" rx="2" fill="${c}" transform="rotate(8 14 13)"/>`,
  calendar: (c) => `<rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="${c}" stroke-width="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="${c}" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14.8" r="1.8" fill="${c}"/>`,
  lock: (c) => `<rect x="6" y="11" width="12" height="9" rx="2" fill="${c}"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="${c}" stroke-width="2.2"/>`,
};

const hex = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((60 * k - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

// Brillo fijo en la mitad superior izquierda del canto: da volumen sin efectos
const shine = (cx, cy, r) => {
  const v = hex(cx, cy, r).split(" ");
  return [v[0], v[5], v[4], `${cx},${cy}`].join(" "); // arriba, arriba-izq., abajo-izq., centro
};

// color = canto e icono; soft = cara. locked = gris y con candado (o con su icono en gris)
export function hexMedal({ color, soft, icon = "peak", locked = false, size = 56, cls = "medal" }) {
  const W = 64, H = 70, cx = 32, cy = 35;
  if (locked) {
    return `<svg class="${cls} locked" viewBox="0 0 ${W} ${H}" width="${size}" aria-hidden="true">
      <polygon points="${hex(cx, cy, 31)}" fill="#f1f3f0" stroke="#d3d9d1" stroke-width="1.5" stroke-dasharray="4 3"/>
      <g transform="translate(${cx - 12} ${cy - 12})">${ICONS[icon]("#c9cfc7")}</g>
    </svg>`;
  }
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" width="${size}" aria-hidden="true">
    <polygon points="${hex(cx, cy, 31)}" fill="${color}"/>
    <polygon points="${shine(cx, cy, 31)}" fill="#fff" opacity="0.2"/>
    <polygon points="${hex(cx, cy, 25.5)}" fill="${soft}"/>
    <polygon points="${hex(cx, cy, 23)}" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.35"/>
    <g transform="translate(${cx - 12} ${cy - 12})">${ICONS[icon](color)}</g>
  </svg>`;
}
