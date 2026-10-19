"""The Great Ife campus: buildings, roads, the CNG bus route and how people move around.

One map, used twice: the server uses it for travel times and fares, and the 3D client draws it
(GET /api/world/). Units are world units; 1 unit = 10 metres. The layout is inspired by OAU (halls,
lecture theatres and bus stops have their real names), not a survey.
"""

from __future__ import annotations

import functools
import heapq
import math

METRES_PER_UNIT = 10

# Road junctions and stops (x, z)
NODES = {
    "town": (-140, 150),    # off campus: Asherifa / Mayfair
    "gate": (20, 150),      # Main Gate
    "w": (70, 150),         # hall junction
    "awo": (70, 85),        # Awo Hall
    "faj": (70, 25),        # Fajuyi / ETF
    "mor": (70, 235),       # Moremi / Akintola
    "angm": (70, 310),      # AngloMoz (Angola and Mozambique halls)
    "odu": (130, 150),      # Oduduwa Hall, ODLT
    "hc": (130, 90),        # Health Centre
    "mkt": (130, 205),      # Ojaja / New Market
    "n": (190, 30),         # Humanities and Social Sciences
    "sen": (190, 90),       # Senate, Ajose LT
    "c": (190, 150),        # central junction
    "subn": (190, 205),     # SUB and the shuttle park
    "hol": (190, 260),      # Hezekiah Oluwasanmi Library
    "tech": (255, 90),      # Faculty of Technology, Tech LT
    "amp": (255, 150),      # Amphitheatre
    "buka": (255, 205),     # Mama Put
    "sci": (320, 90),       # Faculty of Science, 1000 Seater
    "e": (320, 150),
    "ne": (320, 205),       # BOO lecture theatres
    "staff": (320, 260),    # Road 7 / Staff Quarters
    "sport": (380, 150),    # Sports Complex
}

# Two-way roads. "town" roads are outside campus: no campus bus.
EDGES = [
    ("town", "gate", "town"),
    ("gate", "w", "road"), ("w", "awo", "road"), ("awo", "faj", "road"), ("w", "mor", "road"), ("mor", "angm", "road"),
    ("w", "odu", "road"), ("odu", "c", "road"), ("c", "amp", "road"), ("amp", "e", "road"), ("e", "sport", "road"),
    ("odu", "hc", "road"), ("hc", "sen", "road"), ("sen", "tech", "road"), ("tech", "sci", "road"), ("sci", "e", "road"),
    ("e", "ne", "road"), ("ne", "staff", "road"), ("c", "sen", "road"), ("sen", "n", "road"), ("faj", "n", "road"),
    ("odu", "mkt", "road"), ("mkt", "subn", "road"), ("subn", "buka", "road"), ("buka", "ne", "road"),
    ("c", "subn", "road"), ("subn", "hol", "road"), ("amp", "tech", "road"), ("amp", "buka", "road"),
]

H = 60  # minutes in an hour, for opening hours below

# Buildings: footprint centre, size, height, the road node they open onto, style for the 3D client,
# kind (for the map), and opening hours (minutes after midnight; None = always open).
BUILDINGS = {
    # --- Halls of residence
    "awo": {"name": "Awo Hall", "node": "awo", "x": 38, "z": 85, "w": 30, "d": 40, "h": 16, "style": "hall",
            "kind": "hall", "wall": "#e6d7b9", "roof": "#8f3b3b", "hours": None, "sign": "AWOLOWO HALL"},
    "fajuyi": {"name": "Fajuyi Hall", "node": "faj", "x": 38, "z": 22, "w": 30, "d": 30, "h": 14, "style": "hall",
               "kind": "hall", "wall": "#dfe3d0", "roof": "#3b6e5a", "hours": None, "sign": "FAJUYI HALL"},
    "etf": {"name": "ETF Hall", "node": "faj", "x": 100, "z": 55, "w": 26, "d": 24, "h": 14, "style": "hall",
            "kind": "hall", "wall": "#e9e0cc", "roof": "#5a4a8f", "hours": None, "sign": "ETF HALL"},
    "moremi": {"name": "Moremi Hall", "node": "mor", "x": 38, "z": 235, "w": 30, "d": 44, "h": 16, "style": "hall",
               "kind": "hall", "wall": "#e9dcc3", "roof": "#3b6e8f", "hours": None, "sign": "MOREMI HALL"},
    "akintola": {"name": "Akintola Hall", "node": "mor", "x": 100, "z": 240, "w": 26, "d": 34, "h": 14, "style": "hall",
                 "kind": "hall", "wall": "#f0dccf", "roof": "#8f5a3b", "hours": None, "sign": "LADOKE AKINTOLA HALL"},
    "mozambique": {"name": "Mozambique Hall", "node": "angm", "x": 38, "z": 302, "w": 30, "d": 30, "h": 13,
                   "style": "hall", "kind": "hall", "wall": "#e8d8e0", "roof": "#7a3e6a", "hours": None,
                   "sign": "MOZAMBIQUE HALL"},
    "angola": {"name": "Angola Hall", "node": "angm", "x": 102, "z": 304, "w": 26, "d": 30, "h": 13, "style": "hall",
               "kind": "hall", "wall": "#d8e0e8", "roof": "#2f5f8e", "hours": None, "sign": "ANGOLA HALL"},
    "staff": {"name": "Staff Quarters (Road 7)", "node": "staff", "x": 355, "z": 284, "w": 40, "d": 24, "h": 6,
              "style": "bungalows", "kind": "home", "wall": "#f1ece2", "roof": "#7a4a2a", "hours": None,
              "sign": "ROAD 7"},
    "offcampus": {"name": "Your self-con (Asherifa)", "node": "town", "x": -140, "z": 178, "w": 18, "d": 14, "h": 6,
                  "style": "house", "kind": "home", "wall": "#d9c9a8", "roof": "#6b6b6b", "hours": None,
                  "sign": "ASHERIFA"},

    # --- Lecture theatres and faculties
    "odlt": {"name": "ODLT", "node": "odu", "x": 160, "z": 120, "w": 36, "d": 28, "h": 10, "style": "theatre",
             "kind": "lecture", "wall": "#d9cfbd", "roof": "#5f6b5a", "hours": (7 * H, 21 * H),
             "sign": "ODUDUWA LECTURE THEATRES"},
    "ajose": {"name": "Ajose LT", "node": "sen", "x": 222, "z": 120, "w": 32, "d": 26, "h": 10, "style": "theatre",
              "kind": "lecture", "wall": "#e2d6c2", "roof": "#6b5a3f", "hours": (7 * H, 21 * H),
              "sign": "AJOSE LECTURE THEATRE"},
    "thousand": {"name": "1000 Seater LT", "node": "sci", "x": 355, "z": 55, "w": 44, "d": 36, "h": 13,
                 "style": "theatre", "kind": "lecture", "wall": "#cfc6b4", "roof": "#3f5f4a", "hours": (7 * H, 21 * H),
                 "sign": "1000 SEATER LECTURE THEATRE"},
    "booc": {"name": "BOO Theatres", "node": "ne", "x": 355, "z": 232, "w": 36, "d": 28, "h": 10, "style": "theatre",
             "kind": "lecture", "wall": "#dccfbf", "roof": "#4a5f6b", "hours": (7 * H, 21 * H),
             "sign": "BOOA · BOOB · BOOC"},
    "techlt": {"name": "Tech LT", "node": "tech", "x": 288, "z": 60, "w": 36, "d": 26, "h": 10, "style": "theatre",
               "kind": "lecture", "wall": "#d6d0c4", "roof": "#3f4f6b", "hours": (7 * H, 21 * H),
               "sign": "TECH LECTURE THEATRE (TCHS)"},
    "tech": {"name": "Faculty of Technology", "node": "tech", "x": 288, "z": 122, "w": 40, "d": 30, "h": 13,
             "style": "faculty", "kind": "faculty", "wall": "#e2d6c2", "roof": "#3f5f4a", "hours": (7 * H, 20 * H),
             "sign": "FACULTY OF TECHNOLOGY"},
    "science": {"name": "Faculty of Science", "node": "sci", "x": 355, "z": 118, "w": 40, "d": 28, "h": 13,
                "style": "faculty", "kind": "faculty", "wall": "#e6dcc8", "roof": "#5a3f3f", "hours": (7 * H, 20 * H),
                "sign": "FACULTY OF SCIENCE"},
    "socsci": {"name": "Social Sciences & Admin", "node": "n", "x": 232, "z": 15, "w": 36, "d": 26, "h": 13,
               "style": "faculty", "kind": "faculty", "wall": "#e0d9c9", "roof": "#4a3f5f", "hours": (7 * H, 20 * H),
               "sign": "SOCIAL SCIENCES · ADMINISTRATION"},
    "arts": {"name": "Humanities (Arts)", "node": "n", "x": 150, "z": 55, "w": 36, "d": 24, "h": 13,
             "style": "faculty", "kind": "faculty", "wall": "#e9dfcb", "roof": "#6b4a3f", "hours": (7 * H, 20 * H),
             "sign": "HUMANITIES BLOCKS"},

    # --- Campus life
    "oduduwa": {"name": "Oduduwa Hall", "node": "odu", "x": 160, "z": 178, "w": 40, "d": 32, "h": 14,
                "style": "auditorium", "kind": "campus", "wall": "#cfc6b8", "roof": "#5a5a5a", "hours": (8 * H, 23 * H),
                "sign": "ODUDUWA HALL"},
    "health": {"name": "Health Centre", "node": "hc", "x": 105, "z": 108, "w": 20, "d": 16, "h": 7, "style": "clinic",
               "kind": "campus", "wall": "#f4f4f2", "roof": "#2f7a5a", "hours": None, "sign": "HEALTH CENTRE"},
    "market": {"name": "New Market (Ojaja)", "node": "mkt", "x": 152, "z": 245, "w": 34, "d": 40, "h": 5,
               "style": "market", "kind": "food", "wall": "#c9a46a", "roof": "#8e979c", "hours": (7 * H, 21 * H),
               "sign": "OJAJA NEW MARKET"},
    "sub": {"name": "SUB", "node": "subn", "x": 222, "z": 232, "w": 36, "d": 28, "h": 9, "style": "sub",
            "kind": "food", "wall": "#e3d3b0", "roof": "#b5482a", "hours": (7 * H, 21 * H),
            "sign": "STUDENTS' UNION BUILDING"},
    "buka": {"name": "Mama Put (Buka)", "node": "buka", "x": 280, "z": 228, "w": 16, "d": 12, "h": 5, "style": "buka",
             "kind": "food", "wall": "#b98a52", "roof": "#9aa3a8", "hours": (7 * H, 21 * H), "sign": "MAMA PUT"},
    "hol": {"name": "HOL (Library)", "node": "hol", "x": 228, "z": 282, "w": 44, "d": 28, "h": 15, "style": "library",
            "kind": "campus", "wall": "#c9c2b4", "roof": "#6d6d6d", "hours": (8 * H, 29 * H),  # night reading till 5am
            "sign": "HEZEKIAH OLUWASANMI LIBRARY"},
    "senate": {"name": "Senate Building", "node": "sen", "x": 222, "z": 62, "w": 24, "d": 24, "h": 58, "style": "tower",
               "kind": "campus", "wall": "#d8d2c6", "roof": "#8c8c8c", "hours": (8 * H, 16 * H), "sign": "SENATE"},
    "amphi": {"name": "Amphitheatre", "node": "amp", "x": 285, "z": 180, "w": 30, "d": 30, "h": 4,
              "style": "amphitheatre", "kind": "campus", "wall": "#cbbfa8", "roof": "#cbbfa8", "hours": (7 * H, 22 * H),
              "sign": "AMPHITHEATRE"},
    "banks": {"name": "Banking Area", "node": "c", "x": 228, "z": 178, "w": 34, "d": 16, "h": 7, "style": "banks",
              "kind": "bank", "wall": "#ece6da", "roof": "#7d8790", "hours": None, "sign": "BANKING AREA"},
    "sports": {"name": "Sports Complex", "node": "sport", "x": 410, "z": 190, "w": 44, "d": 56, "h": 6,
               "style": "sports", "kind": "campus", "wall": "#e0e0e0", "roof": "#2f6fae", "hours": (6 * H, 20 * H),
               "sign": "SPORTS COMPLEX"},
}

MAP_KINDS = {"lecture": "Lecture theatres", "faculty": "Faculties", "hall": "Halls", "home": "Home",
             "food": "Food & market", "bank": "Banks & ATMs", "campus": "Around campus"}

# The CNG campus bus links the Main Gate, the halls, New Market and SUB. It doesn't go round the faculties:
# it only drops you at one it passes in front of (ODLT, on the main road). Kekes carry people to their faculties.
BUS_ROUTE = ["gate", "w", "awo", "faj", "awo", "w", "mor", "angm", "mor", "w", "odu", "mkt", "subn", "c", "odu", "w",
             "gate"]
BUS_STOPS = ["gate", "awo", "faj", "mor", "angm", "odu", "mkt", "subn"]
STOP_NAMES = {"gate": "Main Gate", "awo": "Awo", "faj": "Fajuyi", "mor": "Moremi", "angm": "AngloMoz",
              "odu": "ODLT", "mkt": "New Market", "subn": "SUB"}
KEKE_PARKS = ["mkt", "subn", "faj", "angm", "mor", "gate"]

# How people get around. Speeds in units per game minute. Fares in naira.
MODES = {
    "trek": {"name": "Trek", "speed": 7.5, "blurb": "Free, but you'll sweat. Great Ife is not small."},
    "bus": {"name": "CNG campus bus", "speed": 30, "fare": 100, "hours": (6 * H + 30, 21 * H),
            "blurb": "₦100 a ride, but the queue at the park can be long in the morning rush."},
    "keke": {"name": "Keke", "speed": 28, "fares": [(120, 100), (240, 150), (10_000, 200)], "hours": (6 * H, 22 * H),
             "blurb": "Door to door: ₦100 to ₦200 depending on how far."},
    "cab": {"name": "Night cab", "speed": 36, "fares": [(200, 250), (10_000, 300)], "night": (21 * H, 6 * H),
            "blurb": "Only at night, only between the Main Gate and a bus stop."},
    "town_bus": {"name": "Town bus", "speed": 30, "fare": 200, "hours": (6 * H, 21 * H)},
    "bike": {"name": "Your bicycle", "speed": 16, "blurb": "Free and quick. Your legs will feel it a little."},
    "car": {"name": "Your car", "speed": 36, "fuel": [(150, 100), (10_000, 200)],
            "blurb": "Your own ride, door to door. Petrol isn't free."},
}
RUSH_HOURS = [(7 * H, 10 * H), (16 * H, 18 * H)]


def dist(a: str, b: str) -> float:
    (x1, z1), (x2, z2) = NODES[a], NODES[b]
    return math.hypot(x2 - x1, z2 - z1)


def _graph():
    g: dict[str, list[tuple[str, float, str]]] = {n: [] for n in NODES}
    for a, b, kind in EDGES:
        d = dist(a, b)
        g[a].append((b, d, kind))
        g[b].append((a, d, kind))
    return g


GRAPH = _graph()


def shortest_path(a: str, b: str) -> tuple[float, list[str]]:
    """Dijkstra over the road network: (length in units, list of nodes)."""
    length, nodes = _shortest(a, b)
    return length, list(nodes)


@functools.lru_cache(maxsize=None)
def _shortest(a: str, b: str) -> tuple[float, tuple[str, ...]]:
    if a == b:
        return 0.0, (a,)
    best = {a: 0.0}
    prev: dict[str, str] = {}
    heap = [(0.0, a)]
    while heap:
        d, n = heapq.heappop(heap)
        if n == b:
            break
        if d > best.get(n, math.inf):
            continue
        for m, w, _ in GRAPH[n]:
            nd = d + w
            if nd < best.get(m, math.inf):
                best[m] = nd
                prev[m] = n
                heapq.heappush(heap, (nd, m))
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    return best[b], tuple(path[::-1])


def nearest_node(x: float, z: float, among=None) -> str:
    return min(among or NODES, key=lambda n: math.hypot(NODES[n][0] - x, NODES[n][1] - z))


def path_points(nodes: list[str]) -> list[list[float]]:
    return [list(NODES[n]) for n in nodes]


def distance_to_building(building_id: str, x: float, z: float) -> float:
    b = BUILDINGS[building_id]
    dx = max(abs(x - b["x"]) - b["w"] / 2, 0)
    dz = max(abs(z - b["z"]) - b["d"] / 2, 0)
    return math.hypot(dx, dz)


def tiered(tiers, length: float) -> int:
    for limit, price in tiers:
        if length <= limit:
            return price
    return tiers[-1][1]


def bounds() -> dict:
    xs = [b["x"] - b["w"] / 2 for b in BUILDINGS.values()] + [b["x"] + b["w"] / 2 for b in BUILDINGS.values()]
    zs = [b["z"] - b["d"] / 2 for b in BUILDINGS.values()] + [b["z"] + b["d"] / 2 for b in BUILDINGS.values()]
    xs += [p[0] for p in NODES.values()]
    zs += [p[1] for p in NODES.values()]
    return {"x0": min(xs) - 20, "x1": max(xs) + 20, "z0": min(zs) - 20, "z1": max(zs) + 20}


def public_map() -> dict:
    """Everything the 3D client needs to draw the campus."""
    return {
        "metres_per_unit": METRES_PER_UNIT,
        "nodes": {k: list(v) for k, v in NODES.items()},
        "edges": [[a, b, kind] for a, b, kind in EDGES],
        "buildings": {k: dict(v) for k, v in BUILDINGS.items()},
        "kinds": MAP_KINDS,
        "bus_route": BUS_ROUTE,
        "bus_stops": BUS_STOPS,
        "stop_names": STOP_NAMES,
        "keke_parks": KEKE_PARKS,
        "bounds": bounds(),
        "modes": {k: {"name": v["name"], "speed": v["speed"]} for k, v in MODES.items()},
    }
