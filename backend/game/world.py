"""The Great Ife campus: buildings, roads, the CNG bus route and how people move around.

One map, used twice: the server uses it for travel times and fares, and the 3D client draws it
(GET /api/world/). Units are world units; 1 unit = 10 metres. The arrangement follows the real OAU campus
(OpenStreetMap positions of the halls, Oduduwa Hall, HOL, the Senate, the faculties and the Sports Centre),
stretched about three times so the buildings, roads and crowds fit; a few spots without map data are estimated.
"""

from __future__ import annotations

import functools
import heapq
import math

METRES_PER_UNIT = 10

# Road junctions and stops (x, z)
NODES = {
    "town": (-420, 190), # off campus: Asherifa
    "gate": (-320, 190), # Main Gate (towards the Ibadan road)
    "w": (-160, 15),     # hall junction by ETF
    "awo": (-160, -95),  # Awo Hall road
    "angm": (-250, -125), # AngloMoz (Angola and Mozambique halls)
    "hc": (-100, -60),   # Health Centre
    "faj": (-115, 30),   # Fajuyi / ETF
    "mor": (-100, 10),   # Moremi Hall
    "buka": (-180, 130), # junction by the new buka
    "mkt": (-100, 130),  # Ojaja / New Market
    "c": (-20, 20),      # central junction
    "sci": (-30, -60),   # 1000 Seater and Science
    "ne": (-60, -130),   # BOO theatres
    "n": (75, -125),     # Social Sciences
    "amp": (95, -70),    # Science / Social Sciences road
    "odu": (105, 62),    # Oduduwa Hall, ODLT
    "subn": (-15, 95),   # SUB and the shuttle park
    "sport": (90, 125),  # Sports Complex
    "hol": (100, -5),    # Hezekiah Oluwasanmi Library, Amphitheatre
    "sen": (175, 10),    # Senate, Humanities
    "e": (270, 0),       # road to Technology
    "tech": (295, 15),   # Faculty of Technology, Tech LT
    "staff": (380, -120), # Road 7 / Staff Quarters
    "bank": (165, 135),  # Banking Area
    "akn": (-235, 95),   # Akintola Hall
    "aj": (250, -65),    # Ajose LT
}

# Two-way roads. "town" roads are outside campus: no campus bus.
EDGES = [
    ("town", "gate", "town"), ("gate", "buka", "road"), ("buka", "w", "road"), ("w", "awo", "road"), ("awo", "angm", "road"),
    ("awo", "hc", "road"), ("hc", "mor", "road"), ("mor", "faj", "road"), ("w", "faj", "road"), ("buka", "mkt", "road"),
    ("mkt", "faj", "road"), ("mor", "c", "road"), ("c", "sci", "road"), ("sci", "ne", "road"), ("ne", "n", "road"),
    ("sci", "amp", "road"), ("amp", "n", "road"), ("c", "hol", "road"), ("odu", "hol", "road"), ("hol", "amp", "road"),
    ("hol", "sen", "road"), ("sen", "e", "road"), ("e", "tech", "road"), ("e", "staff", "road"), ("mkt", "subn", "road"),
    ("subn", "odu", "road"), ("subn", "sport", "road"), ("sport", "bank", "road"), ("bank", "sen", "road"), ("c", "subn", "road"),
    ("akn", "buka", "road"), ("e", "aj", "road"),
]

H = 60  # minutes in an hour, for opening hours below

# Buildings: footprint centre, size, height, the road node they open onto, style for the 3D client,
# kind (for the map), and opening hours (minutes after midnight; None = always open).
BUILDINGS = {
    # --- Halls of residence
    "awo": {"name": "Awo Hall", "node": "awo", "x": -205, "z": -60, "w": 30, "d": 38, "h": 16, "style": "hall",
            "kind": "hall", "wall": "#e6d7b9", "roof": "#8f3b3b", "hours": None, "sign": "AWOLOWO HALL"},
    "fajuyi": {"name": "Fajuyi Hall", "node": "faj", "x": -75, "z": 60, "w": 30, "d": 30, "h": 14, "style": "hall",
               "kind": "hall", "wall": "#dfe3d0", "roof": "#3b6e5a", "hours": None, "sign": "FAJUYI HALL"},
    "etf": {"name": "ETF Hall", "node": "w", "x": -200, "z": 20, "w": 26, "d": 24, "h": 14, "style": "hall",
            "kind": "hall", "wall": "#e9e0cc", "roof": "#5a4a8f", "hours": None, "sign": "ETF HALL"},
    "moremi": {"name": "Moremi Hall", "node": "sci", "x": -60, "z": -30, "w": 30, "d": 40, "h": 16, "style": "hall",
               "kind": "hall", "wall": "#e9dcc3", "roof": "#3b6e8f", "hours": None, "sign": "MOREMI HALL"},
    "akintola": {"name": "Akintola Hall", "node": "akn", "x": -262, "z": 62, "w": 26, "d": 30, "h": 14, "style": "hall",
                 "kind": "hall", "wall": "#f0dccf", "roof": "#8f5a3b", "hours": None, "sign": "LADOKE AKINTOLA HALL"},
    "mozambique": {"name": "Mozambique Hall", "node": "angm", "x": -225, "z": -150, "w": 28, "d": 28, "h": 13,
                   "style": "hall", "kind": "hall", "wall": "#e8d8e0", "roof": "#7a3e6a", "hours": None,
                   "sign": "MOZAMBIQUE HALL"},
    "angola": {"name": "Angola Hall", "node": "angm", "x": -285, "z": -100, "w": 26, "d": 28, "h": 13, "style": "hall",
               "kind": "hall", "wall": "#d8e0e8", "roof": "#2f5f8e", "hours": None, "sign": "ANGOLA HALL"},
    "staff": {"name": "Staff Quarters (Road 7)", "node": "staff", "x": 390, "z": -160, "w": 36, "d": 22, "h": 6,
              "style": "bungalows", "kind": "home", "wall": "#f1ece2", "roof": "#7a4a2a", "hours": None,
              "sign": "ROAD 7"},
    "offcampus": {"name": "Your self-con (Asherifa)", "node": "town", "x": -420, "z": 218, "w": 18, "d": 14, "h": 6,
                  "style": "house", "kind": "home", "wall": "#d9c9a8", "roof": "#6b6b6b", "hours": None,
                  "sign": "ASHERIFA"},

    # --- Lecture theatres and faculties
    "odlt": {"name": "ODLT", "node": "odu", "x": 130, "z": 90, "w": 30, "d": 22, "h": 10, "style": "theatre",
             "kind": "lecture", "wall": "#d9cfbd", "roof": "#5f6b5a", "hours": (7 * H, 21 * H),
             "sign": "ODUDUWA LECTURE THEATRES"},
    "ajose": {"name": "Ajose LT", "node": "aj", "x": 240, "z": -95, "w": 28, "d": 22, "h": 10, "style": "theatre",
              "kind": "lecture", "wall": "#e2d6c2", "roof": "#6b5a3f", "hours": (7 * H, 21 * H),
              "sign": "AJOSE LECTURE THEATRE"},
    "thousand": {"name": "1000 Seater LT", "node": "sci", "x": -5, "z": -95, "w": 36, "d": 28, "h": 13,
                 "style": "theatre", "kind": "lecture", "wall": "#cfc6b4", "roof": "#3f5f4a", "hours": (7 * H, 21 * H),
                 "sign": "1000 SEATER LECTURE THEATRE"},
    "booc": {"name": "BOO Theatres", "node": "ne", "x": -25, "z": -155, "w": 30, "d": 22, "h": 10, "style": "theatre",
             "kind": "lecture", "wall": "#dccfbf", "roof": "#4a5f6b", "hours": (7 * H, 21 * H),
             "sign": "BOOA · BOOB · BOOC"},
    "techlt": {"name": "Tech LT", "node": "tech", "x": 330, "z": -15, "w": 30, "d": 22, "h": 10, "style": "theatre",
               "kind": "lecture", "wall": "#d6d0c4", "roof": "#3f4f6b", "hours": (7 * H, 21 * H),
               "sign": "TECH LECTURE THEATRE (TCHS)"},
    "tech": {"name": "Faculty of Technology", "node": "tech", "x": 330, "z": 45, "w": 36, "d": 26, "h": 13,
             "style": "faculty", "kind": "faculty", "wall": "#e2d6c2", "roof": "#3f5f4a", "hours": (7 * H, 20 * H),
             "sign": "FACULTY OF TECHNOLOGY"},
    "science": {"name": "Faculty of Science", "node": "n", "x": 50, "z": -95, "w": 34, "d": 24, "h": 13,
                "style": "faculty", "kind": "faculty", "wall": "#e6dcc8", "roof": "#5a3f3f", "hours": (7 * H, 20 * H),
                "sign": "FACULTY OF SCIENCE"},
    "socsci": {"name": "Social Sciences & Admin", "node": "n", "x": 125, "z": -125, "w": 32, "d": 22, "h": 13,
               "style": "faculty", "kind": "faculty", "wall": "#e0d9c9", "roof": "#4a3f5f", "hours": (7 * H, 20 * H),
               "sign": "SOCIAL SCIENCES · ADMINISTRATION"},
    "arts": {"name": "Humanities (Arts)", "node": "sen", "x": 205, "z": -32, "w": 32, "d": 22, "h": 13,
             "style": "faculty", "kind": "faculty", "wall": "#e9dfcb", "roof": "#6b4a3f", "hours": (7 * H, 20 * H),
             "sign": "HUMANITIES BLOCKS"},

    # --- Campus life
    "oduduwa": {"name": "Oduduwa Hall", "node": "odu", "x": 75, "z": 30, "w": 36, "d": 28, "h": 14,
                "style": "auditorium", "kind": "campus", "wall": "#cfc6b8", "roof": "#5a5a5a", "hours": (8 * H, 23 * H),
                "sign": "ODUDUWA HALL"},
    "health": {"name": "Health Centre", "node": "hc", "x": -135, "z": -55, "w": 18, "d": 14, "h": 7, "style": "clinic",
               "kind": "campus", "wall": "#f4f4f2", "roof": "#2f7a5a", "hours": None, "sign": "HEALTH CENTRE"},
    "market": {"name": "New Market (Ojaja)", "node": "mkt", "x": -135, "z": 100, "w": 30, "d": 30, "h": 5,
               "style": "market", "kind": "food", "wall": "#c9a46a", "roof": "#8e979c", "hours": (7 * H, 21 * H),
               "sign": "OJAJA NEW MARKET"},
    "sub": {"name": "SUB", "node": "c", "x": 15, "z": 50, "w": 30, "d": 22, "h": 9, "style": "sub",
            "kind": "food", "wall": "#e3d3b0", "roof": "#b5482a", "hours": (7 * H, 21 * H),
            "sign": "STUDENTS' UNION BUILDING"},
    "buka": {"name": "Mama Put (Buka)", "node": "akn", "x": -205, "z": 82, "w": 14, "d": 12, "h": 5, "style": "buka",
             "kind": "food", "wall": "#b98a52", "roof": "#9aa3a8", "hours": (7 * H, 21 * H), "sign": "MAMA PUT"},
    "hol": {"name": "HOL (Library)", "node": "amp", "x": 130, "z": -40, "w": 38, "d": 24, "h": 15, "style": "library",
            "kind": "campus", "wall": "#c9c2b4", "roof": "#6d6d6d", "hours": (8 * H, 29 * H),  # night reading till 5am
            "sign": "HEZEKIAH OLUWASANMI LIBRARY"},
    "senate": {"name": "Senate Building", "node": "sen", "x": 150, "z": 32, "w": 22, "d": 22, "h": 58, "style": "tower",
               "kind": "campus", "wall": "#d8d2c6", "roof": "#8c8c8c", "hours": (8 * H, 16 * H), "sign": "SENATE"},
    "amphi": {"name": "Amphitheatre", "node": "hol", "x": 60, "z": -30, "w": 26, "d": 26, "h": 4,
              "style": "amphitheatre", "kind": "campus", "wall": "#cbbfa8", "roof": "#cbbfa8", "hours": (7 * H, 22 * H),
              "sign": "AMPHITHEATRE"},
    "banks": {"name": "Banking Area", "node": "bank", "x": 140, "z": 160, "w": 30, "d": 14, "h": 7, "style": "banks",
              "kind": "bank", "wall": "#ece6da", "roof": "#7d8790", "hours": None, "sign": "BANKING AREA"},
    "sports": {"name": "Sports Complex", "node": "sport", "x": 40, "z": 155, "w": 44, "d": 50, "h": 6,
               "style": "sports", "kind": "campus", "wall": "#e0e0e0", "roof": "#2f6fae", "hours": (6 * H, 20 * H),
               "sign": "SPORTS COMPLEX"},
}

MAP_KINDS = {"lecture": "Lecture theatres", "faculty": "Faculties", "hall": "Halls", "home": "Home",
             "food": "Food & market", "bank": "Banks & ATMs", "campus": "Around campus"}

# The CNG campus bus links the Main Gate, the halls, New Market, SUB and Oduduwa Hall. It doesn't go round the
# faculties: kekes carry people to their faculties.
BUS_ROUTE = ["gate", "buka", "w", "awo", "angm", "awo", "hc", "mor", "faj", "mkt", "subn", "odu", "subn", "mkt", "buka",
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


# One line about each place, shown before you travel there.
BLURBS = {
    "awo": "The oldest male hall. Loud, proud and political: if there's a protest, it started here.",
    "fajuyi": "Fajuyi boys never sleep. Late-night gist, ball on the court, and the occasional block party.",
    "etf": "The newer hall by the road: cleaner toilets, stronger water, and everybody wants a bed here.",
    "moremi": "Moremi babes run the female halls. Strict porters, fine rooms, long queues at the tap.",
    "akintola": "Akintola is quiet in the day and alive at night. Bring your own bucket.",
    "mozambique": "Mozambique Hall, Mozzy for short. Busy corridors and the best hall week.",
    "angola": "Angola Hall, next door to Mozambique at AngloMoz. Close-knit, loud on hall week, far from the faculties.",
    "staff": "Staff Quarters on Road 7. Leafy, calm, and a long walk from everything.",
    "offcampus": "Your self-con in Asherifa. Your own key, your own light bill, your own peace.",
    "odlt": "The big lecture theatre. Come early or stand at the back.",
    "ajose": "Ajose LT: fans that work sometimes, and lecturers who never miss a class.",
    "thousand": "The 1000 Seater. General courses, big exams, and nowhere to hide.",
    "booc": "BOO Theatres: science lectures and practicals.",
    "techlt": "Tech LT, where engineering students suffer together.",
    "tech": "Faculty of Technology. Drawing boards, workshops and departmental notices.",
    "science": "Faculty of Science. Labs, practicals and the smell of reagents.",
    "socsci": "Social Sciences & Admin. Debates in the corridor, case studies in the hall.",
    "arts": "Humanities. Beautiful buildings, deep arguments, and the best campus photos.",
    "oduduwa": "Oduduwa Hall: convocation, concerts and every big event on campus.",
    "health": "The Health Centre. Free check-ups for students, and a pharmacy that is out of everything.",
    "market": "New Market, Ojaja to everyone. Foodstuff, phone repairs, printing, and noise.",
    "sub": "The Student Union Building. Cafeterias, shops, and the SUG office.",
    "buka": "Mama Put's buka. Hot amala, rice and beans, and credit if Mama likes you.",
    "hol": "Hezekiah Oluwasanmi Library. Silence, air conditioning, and night reading (TDB).",
    "senate": "The Senate Building. Fees, transcripts, and very long queues.",
    "amphi": "The Amphitheatre. Rehearsals by day, shows and parties at night.",
    "banks": "The Banking Area: six banks, ATMs that work all day, and POS agents outside.",
    "sports": "The Sports Complex. Football, jogging round the track, and inter-hall games.",
}


# Ile-Ife town outside the Main Gate, where most students rent. Drawn on the map and in 3D; you live in one of
# these if you rent off campus. Positions are approximate: Asherifa sits by the gate on the Ibadan road, and the
# town (Mayfair, Lagere) is further out, the way students describe it.
TOWN_AREAS = [
    {"name": "Asherifa", "x": -430, "z": 150, "blurb": "Right outside the Main Gate on the Ibadan road. Cheap rooms, packed with students."},
    {"name": "Ibadan Road", "x": -560, "z": 140, "blurb": "Shops, filling stations and newer lodges along the road to Ibadan."},
    {"name": "Damico", "x": -500, "z": 250, "blurb": "Quiet lodges and big compounds, a keke ride from the gate."},
    {"name": "Fine Fare", "x": -410, "z": 300, "blurb": "Busy junction with food spots, printers and POS stands."},
    {"name": "Mayfair", "x": -300, "z": 330, "blurb": "The roundabout into town. Banks, eateries and the road to Lagere."},
    {"name": "Lagere", "x": -200, "z": 420, "blurb": "The market side of town: phones, clothes and everything in between."},
    {"name": "Parakin", "x": -90, "z": 380, "blurb": "Leafy estate with self-cons and flats. Pricier, calmer."},
    {"name": "Oduduwa Estate", "x": 10, "z": 330, "blurb": "Flats and duplexes for students who want space."},
]
TOWN_ROADS = [  # drawn only: you travel to town with the town bus or a keke
    [[-420, 190], [-470, 160], [-600, 140]],
    [[-420, 190], [-500, 250], [-410, 300], [-300, 330]],
    [[-300, 330], [-200, 420]],
    [[-300, 330], [-90, 380], [10, 330]],
]


def things_at(building: str) -> list[str]:
    """What you can do at a place, in a few words each."""
    from . import content as C  # noqa: PLC0415 (content imports world)
    b = BUILDINGS[building]
    out = []
    if b["kind"] == "lecture":
        out += ["Attend lectures", "Write exams"]
    if b["kind"] == "faculty":
        out += ["Your department", "Lectures"]
    if b["kind"] in ("hall", "home"):
        out += ["Sleep", "Bath", "Cook", "Hang out with roommates"]
    if b["kind"] == "bank":
        out += ["Open an account", "Deposit", "Withdraw", "ATM"]
    for a in C.ACTIONS:
        if a["at"] == building and len(out) < 9:
            label = a["label"].split(" (")[0]
            if label not in out:
                out.append(label)
    if building in C.POS_PLACES or b["kind"] in C.POS_KINDS:
        out.append("POS agent")
    return out


def public_map() -> dict:
    """Everything the 3D client needs to draw the campus."""
    buildings = {}
    for k, v in BUILDINGS.items():
        buildings[k] = {**v, "blurb": BLURBS.get(k, ""), "things": things_at(k)}
    return {
        "metres_per_unit": METRES_PER_UNIT,
        "nodes": {k: list(v) for k, v in NODES.items()},
        "edges": [[a, b, kind] for a, b, kind in EDGES],
        "buildings": buildings,
        "kinds": MAP_KINDS,
        "bus_route": BUS_ROUTE,
        "bus_stops": BUS_STOPS,
        "stop_names": STOP_NAMES,
        "keke_parks": KEKE_PARKS,
        "bounds": bounds(),
        "modes": {k: {"name": v["name"], "speed": v["speed"]} for k, v in MODES.items()},
        "town_areas": TOWN_AREAS,
        "town_roads": TOWN_ROADS,
    }
