# Genera public/demo/routes.json: rutas de ejemplo para ver la app llena de datos.
#
#   python3 scripts/build-demo.py
#
# Las rutas siguen recorridos reales aproximados (puntos de paso conocidos), pero los
# tracks son sintéticos: entre punto y punto se dibuja una línea con curvas suaves y
# un perfil de altura inventado pero creíble. Sirven para probar, no para navegar.

import json, math, random
from datetime import datetime, timedelta

random.seed(7)  # misma "aleatoriedad" en cada ejecución: el archivo sale siempre igual

STEP_KM = 0.2  # un punto cada 200 m
SPEED = {"hiking": 4.0, "camino": 4.5, "bike": 16.0}  # km/h para calcular horas


def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def track(waypoints, ele_base, ele_amp):
    """Une los puntos de paso con tramos ondulados cada STEP_KM y les da altura."""
    pts = []
    phase = random.random() * 10
    for (a, b) in zip(waypoints, waypoints[1:]):
        d = haversine(a, b)
        n = max(2, int(d / STEP_KM))
        # perpendicular para hacer curvas
        dx, dy = b[1] - a[1], b[0] - a[0]
        length = math.hypot(dx, dy) or 1e-9
        px, py = -dy / length, dx / length
        wiggle = min(0.004, d / 400) + 0.0008
        for i in range(n):
            t = i / n
            off = wiggle * (math.sin(t * math.pi * 3 + phase) * 0.7 + math.sin(t * math.pi * 7 + phase * 2) * 0.3) * math.sin(t * math.pi)
            lat = a[0] + dy * t + py * off
            lon = a[1] + dx * t + px * off
            pts.append([lat, lon])
        phase += 1.3
    pts.append(list(waypoints[-1]))
    # Perfil: varias "montañas" + ruido pequeño
    n = len(pts)
    bumps = [(random.random(), random.uniform(0.3, 1.0), random.uniform(0.05, 0.25)) for _ in range(random.randint(1, 4))]
    # Las montañas se suman y pueden pasarse: se escala para que la cima sea justo base + amp
    shape = [sum(h * math.exp(-(((i / max(1, n - 1)) - c) ** 2) / (2 * w * w)) for c, h, w in bumps) for i in range(n)]
    top = max(shape) or 1
    for i, p in enumerate(pts):
        e = ele_base + ele_amp * shape[i] / top
        e += math.sin(i * 0.7) * 2 + random.uniform(-1.5, 1.5)
        p.append(round(max(0, e)))
    return pts


def add_times(pts, start, activity, day_breaks=()):
    """Hora de cada punto según la velocidad; en cada división de día, salta a las 8:00 del día siguiente."""
    t = start
    out = []
    breaks = set(day_breaks)
    for i, p in enumerate(pts):
        if i in breaks:
            t = (t + timedelta(days=1)).replace(hour=8, minute=0, second=0)
        elif i:
            km = haversine(pts[i - 1], p)
            climb = max(0, p[2] - pts[i - 1][2])
            hours = km / SPEED[activity] + climb / (600 if activity != "bike" else 1500)
            t += timedelta(hours=hours)
        out.append([round(p[1], 5), round(p[0], 5), p[2], int(t.timestamp() * 1000)])
    return out


ROUTES = []


def route(name, activity, date, waypoints, ele=(400, 600), folder=None, notes="", days=1):
    pts = track(waypoints, *ele)
    breaks = [round(len(pts) * k / days) for k in range(1, days)] if days > 1 else []
    start = datetime.fromisoformat(date + "T08:00:00")
    ROUTES.append({
        "name": name,
        "activity": activity,
        "date": date,
        "folder": folder,
        "notes": notes,
        "stageStarts": breaks,
        "points": add_times(pts, start, activity, breaks),
    })


# ---------------- España ----------------
G = "Sierra de Guadarrama"
route("Peñalara via Laguna Grande", "hiking", "2026-10-12", [(40.789, -3.956), (40.808, -3.958), (40.850, -3.955), (40.833, -3.947), (40.789, -3.956)], (1800, 600), G, "Left Cotos at 8:00. Very windy on the summit.")
route("Cuerda Larga", "hiking", "2026-06-21", [(40.790, -3.950), (40.795, -3.900), (40.805, -3.850), (40.790, -3.800)], (1900, 400), G)
route("La Pedriza: Collado de la Ventana", "hiking", "2026-04-19", [(40.750, -3.890), (40.770, -3.880), (40.775, -3.860), (40.752, -3.872)], (1000, 600), G)
route("Siete Picos", "hiking", "2026-03-08", [(40.790, -4.010), (40.800, -4.000), (40.795, -3.975), (40.789, -3.990)], (1700, 450), G)
route("La Maliciosa", "hiking", "2026-01-03", [(40.735, -3.940), (40.765, -3.945), (40.770, -3.930), (40.740, -3.925)], (1100, 1000), G, "First snow of the year.")
route("Hayedo de Montejo", "hiking", "2025-11-09", [(41.110, -3.500), (41.120, -3.510), (41.115, -3.525), (41.108, -3.505)], (1250, 120), G)
route("Pico del Lobo", "hiking", "2025-10-18", [(41.170, -3.440), (41.180, -3.425), (41.190, -3.400)], (1700, 550))
route("Ruta del Cares", "hiking", "2025-08-15", [(43.260, -4.840), (43.240, -4.860), (43.220, -4.840)], (400, 200), None, "Stunning gorge, very crowded.")
route("Lagos de Covadonga", "hiking", "2025-08-16", [(43.270, -4.980), (43.265, -4.960), (43.255, -4.950), (43.270, -4.980)], (1100, 300))
route("Ordesa: Cola de Caballo", "hiking", "2025-07-03", [(42.640, -0.060), (42.650, -0.030), (42.660, 0.000), (42.668, 0.020)], (1300, 500))
route("Aneto from La Besurta", "hiking", "2025-07-05", [(42.660, 0.640), (42.645, 0.650), (42.631, 0.657)], (1900, 1500), None, "Roped up for the Mahoma bridge. Summit at 11.")
route("Caminito del Rey", "hiking", "2026-04-02", [(36.910, -4.770), (36.930, -4.780), (36.950, -4.790)], (200, 150))
route("Mulhacén from Capileira", "hiking", "2025-09-12", [(36.970, -3.360), (37.010, -3.330), (37.050, -3.311)], (1500, 1900))
route("Tajuña Greenway", "bike", "2026-05-02", [(40.330, -3.520), (40.300, -3.380), (40.270, -3.200), (40.240, -3.050)], (600, 120))
route("La Jara Greenway", "bike", "2025-05-24", [(39.770, -4.900), (39.700, -5.000), (39.600, -5.050)], (450, 150))
route("Montserrat: Sant Jeroni", "hiking", "2025-03-15", [(41.590, 1.830), (41.605, 1.810), (41.602, 1.800)], (700, 550))
route("Teide via Montaña Blanca", "hiking", "2025-02-20", [(28.270, -16.590), (28.270, -16.610), (28.272, -16.642)], (2300, 1400), None, "Summit permit booked two months ahead.")
route("Torrent de Pareis", "hiking", "2024-10-05", [(39.840, 2.810), (39.850, 2.790), (39.856, 2.795)], (300, 300))
route("Caras de Buendía loop", "bike", "2024-09-21", [(40.380, -2.770), (40.330, -2.800), (40.280, -2.750)], (700, 100))

CI = "Camino Inglés 2026"
route("Camino Inglés · Ferrol – Santiago", "camino", "2026-08-02", [(43.484, -8.235), (43.408, -8.170), (43.370, -8.200), (43.288, -8.215), (43.180, -8.360), (43.000, -8.450), (42.880, -8.545)], (80, 250), CI, "Five days with friends. Hostels almost always full.", days=5)
route("Camino Francés · Sarria – Santiago", "camino", "2024-07-20", [(42.780, -7.414), (42.807, -7.615), (42.873, -7.869), (42.928, -8.161), (42.880, -8.545)], (500, 300), None, "The short version of the Francés: the last 115 km.", days=5)
route("Transpirenaica · Roncesvalles – Ordesa", "hiking", "2025-07-10", [(43.010, -1.320), (42.950, -1.000), (42.880, -0.700), (42.800, -0.400), (42.650, -0.030)], (1100, 900), None, "Six days on the GR11 through Navarre and Aragón.", days=6)

# ---------------- Portugal ----------------
route("Camino Portugués · Porto – Santiago", "camino", "2025-06-01", [(41.150, -8.610), (41.530, -8.620), (41.770, -8.580), (42.030, -8.640), (42.260, -8.650), (42.430, -8.640), (42.880, -8.545)], (50, 250), None, "Ten days. Crossing the Miño at Tui was the highlight.", days=10)
route("Levada do Caldeirão Verde", "hiking", "2024-04-12", [(32.780, -16.900), (32.790, -16.920), (32.800, -16.930)], (900, 150))
route("Serra da Estrela: Torre", "hiking", "2024-05-02", [(40.300, -7.620), (40.320, -7.610), (40.321, -7.613)], (1500, 450))
route("Rota Vicentina · Trilho dos Pescadores", "hiking", "2024-05-18", [(37.730, -8.790), (37.600, -8.800), (37.480, -8.790)], (50, 80), None, "", days=3)

# ---------------- Francia / Italia / Suiza ----------------
TMB = "Alps 2025"
route("Tour du Mont Blanc", "hiking", "2025-08-20", [(45.900, 6.790), (45.780, 6.860), (45.800, 6.960), (45.820, 7.050), (45.920, 7.120), (46.020, 7.060), (46.000, 6.920), (45.920, 6.870)], (1500, 1200), TMB, "France, Italy and Switzerland in ten days.", days=10)
route("Lac Blanc from La Flégère", "hiking", "2025-08-18", [(45.950, 6.880), (45.970, 6.890), (45.980, 6.890)], (1900, 450), TMB)
route("Zermatt: 5 Lakes Walk", "hiking", "2025-08-31", [(46.010, 7.750), (46.020, 7.780), (46.010, 7.800)], (2500, 300), TMB)
route("Tre Cime di Lavaredo", "hiking", "2024-07-28", [(46.610, 12.300), (46.620, 12.310), (46.630, 12.295), (46.610, 12.300)], (2300, 200))
route("Seceda", "hiking", "2024-07-30", [(46.590, 11.720), (46.600, 11.730), (46.605, 11.725)], (2100, 400))
route("Cinque Terre: Sentiero Azzurro", "hiking", "2023-09-10", [(44.130, 9.710), (44.120, 9.690), (44.110, 9.660)], (100, 200))
route("GR20 North", "hiking", "2024-06-10", [(42.560, 8.850), (42.400, 8.950), (42.250, 9.050)], (1200, 1200), None, "Brutal. Back for the south another year.", days=7)
route("Gorges du Verdon: Sentier Blanc-Martel", "hiking", "2023-07-14", [(43.770, 6.400), (43.760, 6.350), (43.750, 6.330)], (700, 250))
route("Loire by bike: Tours – Saumur", "bike", "2023-08-05", [(47.390, 0.680), (47.300, 0.350), (47.260, -0.080)], (60, 40), None, "", days=2)

# ---------------- Resto de Europa ----------------
route("Preikestolen", "hiking", "2024-08-04", [(58.990, 6.190), (58.985, 6.180), (58.986, 6.190)], (300, 350))
route("Trolltunga", "hiking", "2024-08-06", [(60.120, 6.750), (60.125, 6.720), (60.124, 6.740)], (800, 500))
route("Laugavegur", "hiking", "2023-07-20", [(63.990, -19.060), (63.900, -19.150), (63.780, -19.300), (63.680, -19.470)], (600, 500), None, "Four days of lunar landscapes.", days=4)
route("West Highland Way (final stretch)", "hiking", "2023-05-27", [(56.680, -5.100), (56.750, -5.000), (56.820, -5.110)], (200, 300), None, "", days=2)
route("Samaria", "hiking", "2022-05-15", [(35.300, 23.960), (35.270, 23.970), (35.230, 23.960)], (900, 400))
route("Tatras: Rysy", "hiking", "2023-08-12", [(49.200, 20.070), (49.180, 20.080), (49.179, 20.088)], (1400, 1000))

# ---------------- América ----------------
route("Purdue: Celery Bog", "hiking", "2026-09-06", [(40.460, -86.930), (40.465, -86.925), (40.462, -86.920)], (200, 10), None, "First route in Indiana.")
route("Turkey Run State Park", "hiking", "2026-09-20", [(39.880, -87.200), (39.890, -87.210), (39.885, -87.220)], (180, 40))
route("Wabash Heritage Trail", "bike", "2026-10-04", [(40.440, -86.900), (40.470, -86.950), (40.500, -86.990)], (170, 20))
route("Angels Landing", "hiking", "2025-12-28", [(37.260, -112.950), (37.268, -112.947), (37.269, -112.948)], (1300, 450))
route("Half Dome", "hiking", "2024-09-15", [(37.730, -119.560), (37.740, -119.540), (37.746, -119.533)], (1200, 1400))
route("Grand Canyon: Bright Angel", "hiking", "2025-12-30", [(36.060, -112.140), (36.080, -112.120), (36.100, -112.100)], (2100, -1200))
route("Lake Agnes Tea House", "hiking", "2025-07-28", [(51.420, -116.220), (51.420, -116.240), (51.418, -116.250)], (1750, 400))
route("W Trek · Torres del Paine", "hiking", "2024-12-10", [(-50.950, -72.960), (-51.000, -73.050), (-51.050, -73.100), (-51.100, -73.150)], (100, 700), None, "Five days, brutal wind at Grey.", days=5)
route("Inca Trail", "hiking", "2024-11-20", [(-13.250, -72.420), (-13.220, -72.480), (-13.200, -72.520), (-13.163, -72.545)], (2700, 1500), None, "", days=4)
route("Laguna 69", "hiking", "2024-11-25", [(-9.040, -77.620), (-9.030, -77.600), (-9.015, -77.610)], (3900, 700))
route("Fitz Roy: Laguna de los Tres", "hiking", "2024-12-18", [(-49.330, -72.890), (-49.300, -72.950), (-49.270, -73.000)], (400, 800))

# ---------------- Asia / África / Oceanía ----------------
route("Everest Base Camp", "hiking", "2023-10-15", [(27.690, 86.730), (27.800, 86.710), (27.890, 86.830), (27.960, 86.810), (28.000, 86.850)], (2800, 2400), None, "Twelve days. The altitude hit hard at Lobuche.", days=12)
route("Fushimi Inari", "hiking", "2023-04-02", [(34.967, 135.772), (34.968, 135.785), (34.966, 135.775)], (50, 200))
route("Mount Fuji: Yoshida Trail", "hiking", "2023-08-10", [(35.395, 138.735), (35.370, 138.735), (35.361, 138.727)], (2300, 1400))
route("Kumano Kodo", "hiking", "2023-04-06", [(33.800, 135.500), (33.830, 135.650), (33.840, 135.770)], (300, 500), None, "", days=3)
route("Great Wall: Jinshanling – Simatai", "hiking", "2022-09-18", [(40.680, 117.240), (40.670, 117.270), (40.660, 117.290)], (600, 300))
route("Kilimanjaro: Machame Route", "hiking", "2022-07-01", [(-3.170, 37.240), (-3.100, 37.260), (-3.080, 37.300), (-3.076, 37.353)], (1800, 4000), None, "Uhuru Peak at sunrise.", days=6)
route("Toubkal", "hiking", "2023-03-25", [(31.140, -7.920), (31.090, -7.910), (31.060, -7.915)], (1700, 2400), None, "", days=2)
route("Tongariro Alpine Crossing", "hiking", "2022-12-02", [(-39.130, 175.600), (-39.140, 175.650), (-39.100, 175.680)], (1100, 800))
route("Blue Mountains: Grand Canyon Track", "hiking", "2022-11-20", [(-33.640, 150.290), (-33.650, 150.300), (-33.645, 150.310)], (900, 200))

import os
os.makedirs("public/demo", exist_ok=True)
with open("public/demo/routes.json", "w") as f:
    json.dump({"version": 1, "routes": ROUTES}, f, separators=(",", ":"))
total = sum(len(r["points"]) for r in ROUTES)
print(f"{len(ROUTES)} rutas, {total} puntos, {os.path.getsize('public/demo/routes.json') // 1024} KB")
