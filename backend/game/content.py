"""Everything players see: profiles, departments, activities, events, skills, businesses and badges.

Edit this file to add campus jokes, activities and events. The engine (engine.py) reads it, and the
map (world.py) says where each building is.

Time is in minutes after midnight (8:00 AM = 480). The game clock is real Lagos time, but actions play out in
a few seconds (like Lagos Life); only sleep takes real hours.
Effects use these keys: money (naira), hunger, energy, hygiene, fun, social (needs, 0-100, higher is
better) and prep (how ready you are for this semester's tests and exams, 0-100).
"""


def H(hours: int, minutes: int = 0) -> int:
    """Clock time to game minutes: H(8, 30) == 510."""
    return hours * 60 + minutes


WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NEEDS = ["hunger", "energy", "hygiene", "fun", "social"]

SEMESTER_DAYS = 10          # school days (weekdays): two real weeks
CA_TEST_DAY = 4             # the 4th school day
EXAM_DAYS = (9, 10)         # the 9th and 10th school days
TEST_TIME = H(9)            # tests and exams start at 9:00 at the Faculty
TEST_DOORS_CLOSE = H(9, 30)  # arrive after this and you've missed it
LECTURE_TIMES = [H(8), H(10), H(12), H(14)]
LECTURES_PER_WEEKDAY = 2
LECTURE_MINUTES = 110
LATE_GRACE = 15             # minutes late before it counts as "late"
SEAT_EARLY = 20             # come this early and you keep a seat in front (readiness bonus)
LECTURE_DOORS_OPEN = 60     # the hall opens an hour before; people come early to keep seats
LECTURE_DOORS_CLOSE = 40    # minutes after start when they stop letting people in
SEMESTERS = 8               # 100 to 400 level, two semesters each
MAX_EXTRA_SEMESTERS = 2     # "extra year" to clear carryovers
COURSES_PER_SEMESTER = 5
MAX_CARRYOVERS_PER_SEMESTER = 4  # the rest wait for a later semester
SCHOOL_CHARGES = 10_000
WAKE_UP = H(6, 30)          # a new day's events happen when the clock passes 6:00

# Needs fall every hour you're awake (asleep they fall slower: see SLEEP_DECAY).
# Needs fall little by little: a full stomach lasts most of a day.
DECAY_PER_HOUR = {"hunger": -1.6, "energy": -1.8, "hygiene": -1.0, "fun": -0.8, "social": -0.5}
SLEEP_DECAY_PER_HOUR = {"hunger": -0.6, "energy": 0.0, "hygiene": -0.3, "fun": 0.0, "social": 0.0}
SLEEP_ENERGY_PER_HOUR = 10
LATE_NIGHT = H(25)          # awake past 1 AM: energy drains twice as fast

# A day has far more hours than the old four slots, so each hour of reading counts for less.
STUDY_GAIN = 0.2

# Travelling costs you something too (per game minute of each kind of travel).
TRAVEL_EFFECTS = {
    "walk": {"energy": -0.07, "hygiene": -0.05, "hunger": -0.02},
    "wait": {"fun": -0.10},
    "ride": {"energy": -0.03},
    "cycle": {"energy": -0.04, "hygiene": -0.03},
}

# Your money status is rolled when you get admitted, like Lagos Life's birth lottery.
# "weight": how often it comes up (Lapo Baby is common, Odogwu is rare).
# "parent_cap": the most your parents will send when you call them, however much you ask.
# "rent_budget": what your parents will put towards your first year's accommodation.
PROFILES = {
    "lapo_baby": {
        "name": "Lapo Baby",
        "weight": 60,
        "tagline": "Mummy took a LAPO loan to send you to Ife. Every naira has a job, and the job is survival.",
        "phone": "itel",
        "phone_cracked": True,
        "items": [],
        "money": 100_000,
        "allowance": 0,
        "parent_cap": 20_000,
        "parent_no_money": 0.35,
        "rent_budget": 30_000,
        "fees_covered": False,
        "hustle_bonus": 0.3,
        "perks": ["Start with ₦100,000", "Hustles pay 30% more", "Parents send ₦20,000 at most", "You pay your own school charges"],
    },
    "nepo_baby": {
        "name": "Nepo Baby",
        "weight": 32,
        "tagline": "Your parents know people. There's money at home, but they still ask what you did with the last one.",
        "phone": "infinix",
        "items": ["laptop"],
        "money": 200_000,
        "allowance": 10_000,
        "parent_cap": 100_000,
        "parent_no_money": 0.15,
        "rent_budget": 450_000,
        "fees_covered": True,
        "perks": ["Start with ₦200,000", "₦10,000 every Monday", "Parents send up to ₦100,000", "School charges paid", "You have a laptop"],
    },
    "odogwu": {
        "name": "Odogwu",
        "weight": 8,
        "tagline": "Your father's name opens doors in Ife. Money lands before you finish asking.",
        "phone": "iphone",
        "items": ["laptop", "car"],
        "money": 300_000,
        "allowance": 40_000,
        "parent_cap": 300_000,
        "parent_no_money": 0.05,
        "rent_budget": 1_500_000,
        "fees_covered": True,
        "perks": ["Start with ₦300,000", "₦40,000 every Monday", "Parents send up to ₦300,000", "School charges paid",
                  "You drive your own Corolla", "You have a laptop"],
    },
}

# --- Where you live ---------------------------------------------------------------------------------
# Rent is for a whole session (two semesters) and falls due again when a new session starts.
# Halls take four in a room; off campus, landlords allow two tenants at most.
HALLS = {"male": ["awo", "fajuyi", "etf", "angola"], "female": ["akintola", "moremi", "mozambique", "alumni"]}
HOUSING = {
    "hostel": {"name": "Hall bunk", "capacity": 4, "rent": (30_000, 30_000), "emoji": "🛏",
               "blurb": "Four in a room, bunk beds, one socket, endless gist. The cheapest way to live.",
               "perks": ["Cheapest", "Roommates to gist with", "Hall life: light and water come and go"]},
    "single": {"name": "Single room", "capacity": 2, "rent": (120_000, 150_000), "emoji": "🚪",
               "blurb": "A room in a face-me-I-face-you. Shared toilet, but your door has a key.",
               "perks": ["Quieter: reading at home 20% better", "Up to 2 tenants"]},
    "self_con": {"name": "Self-contain", "capacity": 2, "rent": (250_000, 600_000), "emoji": "🏠",
                 "blurb": "Your own room, kitchen and bathroom. Off-campus freedom.",
                 "perks": ["Own bathroom and kitchen", "Reading at home 30% better", "Up to 2 tenants"]},
    "flat": {"name": "2-bedroom flat", "capacity": 2, "rent": (800_000, 1_500_000), "emoji": "🏡",
             "blurb": "Parlour, two bedrooms, a generator and a gateman. The highest a student can live.",
             "perks": ["Generator: no 'no light' days", "Reading at home 40% better", "Soft life every day",
                       "Up to 2 tenants"]},
}
HOME_STUDY_BONUS = {"hostel": 0.0, "single": 0.2, "self_con": 0.3, "flat": 0.4}
OFF_CAMPUS_AREAS = ["Asherifa", "Damico", "Mayfair", "Fine Fare", "Parakin", "Oduduwa Estate", "Lagere", "Ibadan Road"]
ROOM_NOTES = ["Good morning, roomies 👋", "Who finished my garri?! 😤", "NEPA has taken light again 🕯",
              "I'm reading tonight, small noise please 📚", "Who's coming for TDB? 🌙", "Buying bread, who wants? 🍞",
              "Happy birthday, roomie! 🎉", "Please wash your plates 🍽", "Exam is close, let's form a reading group",
              "Gist me when you're back 😂"]

# --- Calling home ------------------------------------------------------------------------------------
PARENT_ASKS = [5_000, 20_000, 50_000, 100_000, 300_000, 500_000]

# --- Banking ------------------------------------------------------------------------------------------
# You arrive with cash. Open an account at the Banking Area (or a fintech app on a smartphone) so your
# parents, your allowance and freelance clients can pay you, and other students can send you money.
# "app": opened on your phone, no branch and no debit card (you cash out at POS agents by transfer).
BANKS = {
    "firstbank": {"name": "First Bank", "color": "#0d2f6e", "fg": "#f2c230", "prefix": "30", "app": False},
    "gtbank": {"name": "GTBank", "color": "#dd4f05", "fg": "#ffffff", "prefix": "01", "app": False},
    "access": {"name": "Access Bank", "color": "#183a6b", "fg": "#f58220", "prefix": "14", "app": False},
    "uba": {"name": "UBA", "color": "#c8102e", "fg": "#ffffff", "prefix": "20", "app": False},
    "zenith": {"name": "Zenith Bank", "color": "#3b3b3d", "fg": "#e3242b", "prefix": "22", "app": False},
    "wema": {"name": "Wema Bank", "color": "#6d1f73", "fg": "#ffffff", "prefix": "02", "app": False},
    "opay": {"name": "OPay", "color": "#1dbf8d", "fg": "#ffffff", "prefix": "8", "app": True},
    "moniepoint": {"name": "Moniepoint", "color": "#0a4bd6", "fg": "#ffffff", "prefix": "5", "app": True},
}
BANK_OPEN_DEPOSIT = 1_000       # minimum opening deposit, from your cash into the account
CARD_FEE = 1_000                # instant debit card at the branch
BANK_HOURS = (8 * 60, 16 * 60)  # branches: weekdays, 8 AM to 4 PM
ATM_AMOUNTS = [1_000, 2_000, 5_000, 10_000, 20_000]   # quick picks; any multiple of ₦500 works
ATM_MAX = 20_000                # per withdrawal
ATM_STEP = 500                  # ATMs only have ₦500 and ₦1,000 notes
ATM_DAILY = 100_000
ATM_OTHER_BANK_FEE = 35         # using another bank's ATM
ATM_FAIL = 0.12                 # "Unable to dispense cash"
ATM_SPOTS = {"banks": None, "sub": "firstbank"}   # building -> whose ATM (None: every bank has one there)
POS_AMOUNTS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000]   # quick picks
POS_MIN, POS_MAX = 100, 50_000
POS_FEE_PER = (5_000, 100)      # ₦100 for every ₦5,000 (or part of it)
POS_NIGHT_FEE = 50              # after 8 PM the hall POS guy adds a little something
POS_HOURS = (7 * 60, 23 * 60)
POS_KINDS = ("hall", "home", "faculty", "lecture")          # plus the places below
POS_PLACES = ("market", "sub", "buka", "banks")
COUNTER_AMOUNTS = [1_000, 5_000, 10_000, 20_000, 50_000, 100_000]   # quick picks
COUNTER_MIN, COUNTER_MAX = 100, 2_000_000
TRANSFER_AMOUNTS = [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000]   # quick picks
TRANSFER_MIN = 100
TRANSFER_DAILY = 200_000
CASH_THEFT_FROM = 50_000        # carrying this much cash around tempts thieves
CASH_THEFT_CHANCE = 0.05


def transfer_fee(amount: int) -> int:
    """Interbank transfer charge, like NIP: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above."""
    return 10 if amount <= 5_000 else 25 if amount <= 50_000 else 50


def pos_fee(amount: int) -> int:
    per, fee = POS_FEE_PER
    return -(-amount // per) * fee


# --- Betting (the house always wins in the long run) --------------------------------------------------
BET_STAKES = [100, 500, 1_000, 5_000, 20_000]
BET_MARGIN = 0.12          # the bookie keeps about 12% of every naira staked
BET_TEAMS = ["Arsenal", "Chelsea", "Man United", "Man City", "Liverpool", "Spurs", "Real Madrid", "Barcelona",
             "Enyimba", "Shooting Stars", "Rangers", "Kano Pillars", "Remo Stars", "Sunshine Stars", "PSG", "Bayern",
             "Juventus", "AC Milan", "Inter", "Dortmund", "Ajax", "Lobi Stars", "Plateau United", "Bendel Insurance"]
BET_MATCHES = 8            # matches on the board at once
BET_MIN, BET_MAX = 100, 50_000

# Each course has a faculty building (classrooms, study groups) and lecture theatres it uses.
# Tests and exams are written in "exams".
# OAU faculties (the building their department belongs to) and the courses you can be admitted to.
FACULTIES = {
    "tech": "Technology", "science": "Science", "socsci": "Social Sciences", "admin": "Administration",
    "arts": "Arts", "law": "Law", "education": "Education", "pharm": "Pharmacy", "chs": "Health Sciences",
    "agric": "Agriculture", "edm": "Environmental Design & Management",
}
# group: the faculty a course sits under. building: where its offices and classrooms are.
# difficulty: lower is harder (medicine and engineering are tough; most arts courses are kinder).
_VENUES = {
    "tech": (["tech", "techlt", "thousand"], "thousand"), "science": (["science", "booc", "thousand"], "booc"),
    "socsci": (["socsci", "odlt", "thousand"], "odlt"), "admin": (["socsci", "ajose", "odlt"], "ajose"),
    "arts": (["arts", "ajose", "odlt"], "ajose"), "law": (["law", "odlt", "ajose"], "odlt"),
    "education": (["education", "odlt", "thousand"], "thousand"), "pharm": (["pharm", "booc", "thousand"], "booc"),
    "chs": (["chs", "booc", "thousand"], "booc"), "agric": (["agric", "ajose", "thousand"], "ajose"),
    "edm": (["edm", "techlt", "ajose"], "techlt"),
}
_BUILDING = {"admin": "socsci"}
_COURSES = [
    # id, name, code, faculty group, difficulty
    ("csc", "Computer Science", "CSC", "tech", -3), ("eee", "Electronic & Electrical Engineering", "EEE", "tech", -3),
    ("mee", "Mechanical Engineering", "MEE", "tech", -3), ("cve", "Civil Engineering", "CVE", "tech", -3),
    ("che", "Chemical Engineering", "CHE", "tech", -3), ("age", "Agricultural & Environmental Engineering", "AGE", "tech", -2),
    ("mse", "Materials Science & Engineering", "MSE", "tech", -2), ("fst", "Food Science & Technology", "FST", "tech", -2),
    ("mcb", "Microbiology", "MCB", "science", -2), ("bch", "Biochemistry", "BCH", "science", -2),
    ("chm", "Chemistry", "CHM", "science", -2), ("phy", "Physics", "PHY", "science", -3),
    ("mth", "Mathematics", "MTH", "science", -3), ("gly", "Geology", "GLY", "science", -2),
    ("zoo", "Zoology", "ZOO", "science", -1), ("bot", "Botany", "BOT", "science", -1),
    ("ecn", "Economics", "ECN", "socsci", -1), ("pol", "Political Science", "POL", "socsci", 0),
    ("psy", "Psychology", "PSY", "socsci", -1), ("soc", "Sociology & Anthropology", "SOA", "socsci", 0),
    ("geo", "Geography", "GEO", "socsci", 0), ("dss", "Demography & Social Statistics", "DSS", "socsci", -1),
    ("acc", "Accounting", "ACC", "admin", -2), ("mgt", "Management & Accounting", "MGT", "admin", -1),
    ("pub", "Public Administration", "PUB", "admin", 0), ("inr", "International Relations", "INR", "admin", 0),
    ("lgs", "Local Government Studies", "LGS", "admin", 1),
    ("eng", "English", "ENG", "arts", 1), ("his", "History", "HIS", "arts", 1), ("phl", "Philosophy", "PHL", "arts", 0),
    ("yor", "Linguistics & African Languages", "LAL", "arts", 1), ("frn", "Foreign Languages (French)", "FRN", "arts", 0),
    ("rel", "Religious Studies", "REL", "arts", 1), ("dra", "Dramatic Arts", "DRA", "arts", 1),
    ("mus", "Music", "MUS", "arts", 0), ("faa", "Fine & Applied Arts", "FAA", "arts", 0),
    ("law", "Law", "LAW", "law", -3),
    ("edu", "Educational Management", "EDM", "education", 1), ("gac", "Guidance & Counselling", "EFC", "education", 1),
    ("ste", "Science & Technology Education", "STE", "education", 0), ("phe", "Physical & Health Education", "PHE", "education", 1),
    ("edt", "Educational Technology", "EDT", "education", 1),
    ("phm", "Pharmacy", "PHM", "pharm", -3),
    ("med", "Medicine & Surgery", "MBS", "chs", -4), ("dnt", "Dentistry", "DNT", "chs", -4),
    ("nsc", "Nursing Science", "NSC", "chs", -2), ("mrh", "Medical Rehabilitation", "MRH", "chs", -2),
    ("ana", "Anatomy", "ANA", "chs", -2), ("phs", "Physiology", "PHS", "chs", -2),
    ("aec", "Agricultural Economics", "AEC", "agric", 0), ("ans", "Animal Science", "ANS", "agric", 0),
    ("cpp", "Crop Production & Protection", "CPP", "agric", 0), ("ssc", "Soil Science", "SSC", "agric", 0),
    ("fnc", "Family, Nutrition & Consumer Sciences", "FNC", "agric", 1),
    ("arc", "Architecture", "ARC", "edm", -2), ("esm", "Estate Management", "ESM", "edm", -1),
    ("urp", "Urban & Regional Planning", "URP", "edm", -1), ("qsv", "Quantity Surveying", "QSV", "edm", -1),
    ("bld", "Building", "BLD", "edm", -1), ("fad", "Fine Arts & Design (EDM)", "FAD", "edm", 0),
]
DEPARTMENTS = {
    did: {"name": name, "code": code, "difficulty": diff, "faculty": _BUILDING.get(group, group), "group": group,
          "venues": list(_VENUES[group][0]), "exams": _VENUES[group][1]}
    for did, name, code, group, diff in _COURSES
}


ALL_DAYS = "all"
WEEKDAYS_ONLY = "weekdays"
WEEKEND = "weekend"
FRI_SAT = "fri_sat"

DAY = [(H(6), H(23, 59))]
# "at": a building id, "home" (wherever you live) or "phone" (anywhere you're not travelling).
# "hours": windows when you can START it; an end past H(24) runs into the next morning.
# "minutes": how long it takes (the clock jumps forward; needs keep falling meanwhile).
ACTIONS = [
    # --- Home
    {"id": "sleep", "at": "home", "label": "Sleep", "hours": [(0, H(24))], "minutes": "sleep",
     "effects": {}, "special": "sleep", "blurb": "Lights off. A full night's sleep in about 15 seconds: energy right back up.",
     "done": "You slept like a baby."},
    {"id": "nap", "at": "home", "label": "Nap (1 hour)", "hours": [(0, H(24))], "minutes": 60,
     "effects": {"energy": 14, "fun": 2}, "blurb": "Just one hour. (It's never one hour.)", "done": "Short nap. You feel better."},
    {"id": "bath", "at": "home", "label": "Have a bath", "hours": [(0, H(24))], "minutes": 20,
     "effects": {"hygiene": 60, "energy": 3}, "special": "bath", "blurb": "Bucket bath with a sponge and black soap. Feel like a person again.",
     "done": "Fresh. You feel like a person again."},
    {"id": "fetch_water", "at": "home", "label": "Fetch water", "hours": [(H(5), H(23))], "minutes": 25,
     "effects": {"hygiene": 10, "social": 6, "energy": -6}, "special": "fetch_water", "requires": {"no_tank": True},
     "blurb": "Two buckets from the tap downstairs, or the borehole when the taps are dry. You wash your face and "
              "catch up on gist in the queue. Saved water means a free bath when there's no water.",
     "done": "Two full buckets, a cool face and fresh gist from the tap."},
    {"id": "cook", "at": "home", "label": "Cook noodles and egg", "hours": [(0, H(24))], "minutes": 40, "cost": 600,
     "effects": {"hunger": 40}, "special": "cook",
     "blurb": "Two packs, one egg, zero shame. Free if you have noodles and eggs from the market.",
     "done": "Noodles and egg: chef of the year."},
    {"id": "garri", "at": "home", "label": "Soak garri", "hours": [(0, H(24))], "minutes": 10,
     "effects": {"hunger": 28, "fun": 2}, "requires": {"food": {"garri": 1}}, "special": "recipe",
     "blurb": "Garri, sugar, groundnut and cold water. The national student meal.",
     "done": "Soaked garri. Filling, cheap, legendary."},
    {"id": "chinchin", "once_per_day": True, "at": "home", "label": "Fry and sell chin-chin (3 hrs)",
     "hours": [(H(8), H(20))], "minutes": 180, "cost": 2_500, "earn": 5_000, "effects": {"energy": -12, "hunger": -4},
     "hustle": True, "blurb": "Flour, sugar, oil, small nylons. Your hall-mates buy it all by evening."},
    {"id": "barb", "once_per_day": True, "at": "home", "label": "Barb for hall-mates (2 hrs)", "hours": [(H(9), H(22))],
     "minutes": 120, "earn": 1_500, "effects": {"energy": -8, "social": 10}, "hustle": True, "skill": "barbing", "xp": 8,
     "requires": {"item": "clippers"}, "blurb": "₦500 a head, fade or low cut. Needs clippers."},
    {"id": "read_room", "at": "home", "label": "Read in your room (2 hrs)", "hours": [(H(8), H(26))], "minutes": 120,
     "effects": {"prep": 6, "energy": -6, "fun": -4}, "study": True, "special": "read_room",
     "blurb": "Your bed is right there. Focus."},
    {"id": "gist", "at": "home", "label": "Gist with roommates", "hours": [(H(18), H(25))], "minutes": 60,
     "effects": {"social": 22, "fun": 12}, "blurb": "Who is dating who, who failed what.",
     "done": "You gisted until somebody said 'we should sleep'."},

    # --- Faculty (lectures follow your timetable; tests and exams are 9:00 sharp)
    {"id": "lecture", "at": "lecture", "label": "Attend lecture", "hours": DAY, "minutes": "lecture",
     "effects": {"prep": 7, "energy": -6, "social": 4}, "study": True, "special": "lecture",
     "blurb": "Sign the attendance sheet. It counts."},
    {"id": "study_group", "at": "dept", "label": "Study group in a classroom (2 hrs)", "hours": [(H(12), H(19))], "minutes": 120,
     "effects": {"prep": 7, "social": 10, "energy": -8}, "study": True, "skill": "tutoring", "xp": 3,
     "blurb": "Half studying, half gisting. Still counts."},

    # --- HOL
    {"id": "hol_read", "at": "hol", "label": "Read at HOL (2 hrs)", "hours": [(H(8), H(20))], "minutes": 120,
     "effects": {"prep": 10, "energy": -9, "fun": -6}, "study": True, "blurb": "Find a seat, guard your seat, read."},
    {"id": "hol_tdb", "at": "hol", "label": "Read till dawn (TDB)", "hours": [(H(21), H(25))], "minutes": "till_dawn",
     "effects": {"prep": 16, "energy": -20, "fun": -6}, "study": True, "tdb": True,
     "blurb": "Night reading room till 5 AM. Coffee is a food group."},

    # --- Amphitheatre
    {"id": "tutorial", "at": "amphi", "label": "Attend tutorial class", "hours": [(H(17), H(18, 30))], "minutes": 120,
     "cost": 1_000, "effects": {"prep": 13, "energy": -6}, "study": True,
     "blurb": "A 400-level 'tutorial master' explains the whole course in 2 hours."},
    {"id": "teach_tutorial", "once_per_day": True, "at": "amphi", "label": "Run your own tutorial", "hours": [(H(17), H(19))], "minutes": 120,
     "earn": 4_000, "effects": {"prep": 4, "energy": -12, "social": 10}, "hustle": True,
     "requires": {"min_prep": 60}, "skill": "tutoring", "xp": 10,
     "blurb": "You know this course well enough to charge for it."},

    # --- Night reading: the 1000 Seater and ODLT stay open all night
    {"id": "lt_read", "at": "thousand", "label": "Night reading in the LT (2 hrs)", "hours": [(H(18), H(28))], "minutes": 120,
     "effects": {"prep": 9, "energy": -10, "fun": -5, "social": 3}, "study": True,
     "blurb": "Fans on, lights on, a hundred students reading in silence."},
    {"id": "lt_tdb", "at": "thousand", "label": "Read till dawn in the LT (TDB)", "hours": [(H(21), H(26))], "minutes": "till_dawn",
     "effects": {"prep": 15, "energy": -20, "fun": -6}, "study": True, "tdb": True,
     "blurb": "Bring a sweater, a torch and your notes. Security walks past at 2 AM."},
    {"id": "odlt_read", "at": "odlt", "label": "Night reading at ODLT (2 hrs)", "hours": [(H(18), H(28))], "minutes": 120,
     "effects": {"prep": 9, "energy": -10, "fun": -5, "social": 3}, "study": True,
     "blurb": "The back rows are for sleeping. The front rows are for reading."},
    {"id": "odlt_tdb", "at": "odlt", "label": "Read till dawn at ODLT (TDB)", "hours": [(H(21), H(26))], "minutes": "till_dawn",
     "effects": {"prep": 15, "energy": -20, "fun": -6}, "study": True, "tdb": True,
     "blurb": "Exam season TDB. Somebody always has a kettle."},

    # --- Buka
    {"id": "amala", "at": "buka", "label": "Amala, ewedu and gbegiri", "hours": [(H(7), H(20, 30))], "minutes": 30,
     "cost": 900, "effects": {"hunger": 55, "social": 4, "fun": 4}, "blurb": "Add meat? That's another conversation.",
     "done": "Amala hit the spot."},
    {"id": "rice", "at": "buka", "label": "Rice and beans", "hours": [(H(7), H(20, 30))], "minutes": 25, "cost": 600,
     "effects": {"hunger": 42}, "blurb": "Reliable. Like your one friend who always comes to class.",
     "done": "Rice and beans. Reliable as ever."},

    # --- SUB
    {"id": "pay_fees_bc", "at": "sub", "label": "Pay school charges at a business centre", "hours": [(H(8), H(17))],
     "minutes": 40, "effects": {"fun": -5}, "special": "pay_fees",
     "blurb": "No smartphone? The business centre pays on the portal for you (₦200 charge)."},
    {"id": "snacks", "at": "sub", "label": "Buy snacks", "hours": [(H(7), H(21))], "minutes": 10, "cost": 350,
     "effects": {"hunger": 18, "fun": 3}, "blurb": "Gala and a cold drink.", "done": "Gala and a drink. It will hold you."},
    {"id": "hangout", "at": "sub", "label": "Hang out at SUB", "hours": [(H(11), H(20))], "minutes": 90, "cost": 300,
     "effects": {"social": 22, "fun": 14, "energy": -4}, "blurb": "See and be seen.",
     "done": "SUB was buzzing. You caught up with everyone."},
    {"id": "business_centre", "once_per_day": True, "at": "sub", "label": "Work at a business centre (3 hrs)", "hours": [(H(8), H(16))],
     "minutes": 180, "days": WEEKDAYS_ONLY, "earn": 2_200, "effects": {"energy": -14, "fun": -5}, "hustle": True,
     "blurb": "Typing, printing, binding. Somebody's project is always due today."},

    # --- Senate
    {"id": "clearance", "at": "senate", "label": "Queue for clearance", "hours": [(H(8), H(14))], "minutes": 120,
     "days": WEEKDAYS_ONLY, "effects": {"energy": -10, "fun": -12, "social": 6},
     "blurb": "Nobody knows why you need this stamp. You need this stamp.",
     "done": "Two hours on the queue. One stamp. Victory."},

    # --- Oduduwa Hall
    {"id": "show", "at": "oduduwa", "label": "Watch tonight's show", "hours": [(H(19), H(21))], "minutes": 180,
     "days": FRI_SAT, "cost": 1_500, "effects": {"fun": 45, "social": 25, "energy": -12},
     "blurb": "Drama, music, and everybody dressed to kill.", "done": "What a night at Oduduwa Hall!"},

    # --- Sports complex
    {"id": "football", "at": "sports", "label": "Play football", "hours": [(H(16), H(18, 30))], "minutes": 90,
     "effects": {"fun": 28, "social": 12, "energy": -16, "hygiene": -25, "hunger": -8},
     "blurb": "Departmental match. Bragging rights only.", "done": "Ninety minutes of departmental glory."},
    {"id": "jog", "at": "sports", "label": "Jog round the track", "hours": [(H(6), H(8)), (H(17), H(19))], "minutes": 45,
     "effects": {"fun": 12, "energy": -10, "hygiene": -15}, "blurb": "Round the track while the sun comes up or goes down.",
     "done": "A few laps round the track."},

    # --- Health Centre
    {"id": "checkup", "at": "health", "label": "See the nurse", "hours": [(H(7), H(22))], "minutes": 60, "cost": 500,
     "effects": {"energy": 15, "fun": -3}, "blurb": "Paracetamol, a lecture about sleep, and a long wait.",
     "done": "The nurse says: eat well and sleep. You feel a bit better."},

    # --- Phone (anywhere you're not travelling)
    {"id": "snake", "at": "phone", "label": "Play Snake", "hours": [(0, H(24))], "minutes": 20, "effects": {"fun": 8},
     "requires": {"keypad": True}, "blurb": "The torchlight phone's one game. Still undefeated.",
     "done": "You played Snake. New high score."},
    {"id": "order_food", "at": "phone", "label": "Order food delivery (any time)", "hours": [(0, H(24))], "minutes": 35,
     "cost": 2_200, "effects": {"hunger": 50, "fun": 3}, "requires": {"smartphone": True},
     "blurb": "Jollof and chicken from a campus kitchen, delivered to wherever you are. Costs more than the buka.",
     "done": "Delivery came hot. Jollof and chicken: sorted."},
    {"id": "sell_data", "once_per_day": True, "requires": {"smartphone": True}, "at": "phone", "label": "Sell data bundles", "hours": DAY, "minutes": 60,
     "effects": {"energy": -4, "social": 3}, "hustle": True, "special": "sell_data",
     "blurb": "Your hall's unofficial data plug."},
    {"id": "braids", "once_per_day": True, "at": "home", "label": "Braid hair for a client (4 hrs)", "hours": [(H(9), H(19))], "minutes": 240,
     "earn": 3_500, "effects": {"energy": -18, "fun": -4, "social": 8}, "hustle": True, "skill": "hair", "xp": 8,
     "blurb": "Four hours, two cramps, one happy client."},
    {"id": "design_gig", "once_per_day": True, "freelance": True, "requires": {"smartphone": True}, "at": "phone", "label": "Design a flyer (2 hrs)", "hours": [(H(9), H(24))], "minutes": 120,
     "earn": 2_500, "effects": {"energy": -10, "fun": 4}, "hustle": True, "skill": "design", "xp": 8,
     "blurb": "Birthday flyer for a 200-level 'celebrity'."},
    {"id": "pay_fees", "requires": {"smartphone": True}, "at": "phone", "label": "Pay school charges on the portal", "hours": [(0, H(24))], "minutes": 10,
     "effects": {"fun": -5}, "special": "pay_fees", "blurb": "Without this, no exam card. No exam card, no exams."},
    {"id": "scroll", "requires": {"smartphone": True}, "at": "phone", "label": "Scroll social media (1 hr)", "hours": [(0, H(24))], "minutes": 60,
     "effects": {"fun": 12, "energy": -2, "prep": -1}, "blurb": "Five minutes. One hour later...",
     "done": "You scrolled. Time disappeared."},
]

# --- Skills: like careers in Lagos Life, five levels each. Higher levels pay more and unlock bigger gigs.
SKILLS = {
    "design": {"name": "Graphic design"},
    "coding": {"name": "Coding"},
    "hair": {"name": "Hairdressing"},
    "content": {"name": "Content creation"},
    "tutoring": {"name": "Teaching"},
    "barbing": {"name": "Barbing"},
    "shoes": {"name": "Shoemaking"},
    "hustling": {"name": "Hustling", "blurb": "Grows with every hustle. Makes all hustles and businesses pay more."},
    "charisma": {"name": "Charisma", "blurb": "Grows when you're social. Friends, fans and customers like you more."},
    "data": {"name": "Data analysis", "blurb": "Excel, dashboards and numbers. Practise on a laptop; opens remote analyst work."},
}
# Ten levels per skill. Each level is one bar to fill; a full bar takes you to the next level.
SKILL_LEVELS = [0, 20, 50, 90, 140, 200, 270, 350, 440, 540]   # XP needed for levels 1..10
SKILL_PAY_PER_LEVEL = 0.12            # each level above 1 adds 12% to that skill's gigs
HUSTLE_XP = 4                         # every hustle also trains Hustling
HUSTLING_BONUS = 0.05                 # per Hustling level: all hustles and businesses pay 5% more
CHARISMA_XP = 4                       # being social trains Charisma
CHARISMA_BONUS = 0.04                 # per Charisma level: social gains and people-facing hustles go up


ACTIONS += [
    # Practice: costs time (and sometimes data), earns XP
    {"id": "learn_design", "at": "home", "label": "Practise design on Canva (2 hrs)", "hours": [(H(9), H(25))],
     "minutes": 120, "cost": 200, "effects": {"energy": -8, "fun": 2}, "skill": "design", "xp": 12, "learn": True,
     "blurb": "Recreate posters you like until yours look better.", "done": "Two hours on Canva. Your eye is getting sharper."},
    # Freelancing: online gigs for clients outside campus (Fiverr, Upwork, a Lagos startup's WhatsApp)
    {"id": "fl_article", "once_per_day": True, "freelance": True, "requires": {"smartphone": True}, "at": "phone",
     "label": "Freelance: write a blog article (2 hrs)", "hours": [(H(7), H(25))], "minutes": 120, "earn": 2_000,
     "effects": {"energy": -8, "fun": -3}, "hustle": True, "skill": "charisma", "xp": 4,
     "blurb": "1,000 words on 'Top 10 Fintech Apps'. The client wants it yesterday."},
    {"id": "fl_transcribe", "once_per_day": True, "freelance": True, "at": "laptop",
     "label": "Freelance: transcribe a podcast (2 hrs)", "hours": [(H(7), H(25))], "minutes": 120, "earn": 3_500,
     "effects": {"energy": -9, "fun": -5}, "hustle": True,
     "blurb": "Two Americans arguing about crypto. Paid in dollars, so it's sweet."},
    {"id": "fl_landing", "once_per_day": True, "freelance": True, "at": "laptop",
     "label": "Freelance: build a landing page (4 hrs)", "hours": [(H(8), H(24))], "minutes": 240, "earn": 15_000,
     "effects": {"energy": -18, "fun": -4}, "hustle": True, "skill": "coding", "xp": 14, "min_level": 4,
     "blurb": "A client on Upwork. Five-star review if you deliver."},
    {"id": "learn_coding", "at": "laptop", "label": "Practise coding on your laptop (2 hrs)", "hours": [(H(6), H(26))],
     "minutes": 120, "cost": 0, "effects": {"energy": -7, "fun": -2}, "skill": "coding", "xp": 12, "learn": True,
     "blurb": "YouTube, free courses and a lot of error messages.", "done": "Your code finally ran. You feel unstoppable."},
    {"id": "learn_hair", "at": "home", "label": "Practise braids on a mannequin (2 hrs)", "hours": [(H(9), H(21))],
     "minutes": 120, "cost": 500, "effects": {"energy": -8, "social": 2}, "skill": "hair", "xp": 12, "learn": True,
     "blurb": "Knotless, cornrows, Ghana weaving. Practice makes neat.", "done": "Neater parting than last week."},
    {"id": "skit", "requires": {"smartphone": True}, "at": "sub", "label": "Shoot and post a skit", "hours": [(H(10), H(20))], "minutes": 120,
     "effects": {"energy": -8, "fun": 12, "social": 6}, "skill": "content", "xp": 10, "learn": True, "special": "skit",
     "blurb": "You, your friends, the SUB crowd and a ring light. Will it blow?"},

    # Bigger gigs that need a skill level
    {"id": "bug_fix", "once_per_day": True, "freelance": True, "at": "laptop", "label": "Fix bugs for a startup (3 hrs)", "hours": [(H(9), H(24))], "minutes": 180,
     "earn": 6_000, "effects": {"energy": -15, "fun": -4}, "skill": "coding", "xp": 10, "min_level": 3, "hustle": True,
     "blurb": "Remote gig for a Lagos startup. They pay on time. Mostly."},
    {"id": "logo_gig", "freelance": True, "at": "laptop", "label": "Design a logo for a business (3 hrs)", "hours": [(H(9), H(22))],
     "minutes": 180, "earn": 9_000, "effects": {"energy": -15, "fun": 3}, "skill": "design", "xp": 14, "min_level": 5,
     "hustle": True, "weekly": True, "blurb": "A shawarma spot in town wants a whole brand."},
    {"id": "website_gig", "freelance": True, "at": "laptop", "label": "Build a website for a business (6 hrs)", "hours": [(H(8), H(17))],
     "minutes": 360, "earn": 22_000, "effects": {"energy": -28, "fun": -10}, "skill": "coding", "xp": 20, "min_level": 5,
     "hustle": True, "weekly": True, "blurb": "A real client, a real deadline, real money."},
    {"id": "bridal_hair", "requires": {"smartphone": True}, "at": "phone", "label": "Make hair for a wedding (5 hrs)", "hours": [(H(6), H(9))],
     "minutes": 300, "days": "weekend", "earn": 12_000, "effects": {"energy": -24, "social": 10}, "skill": "hair",
     "xp": 16, "min_level": 5, "hustle": True, "weekly": True, "blurb": "The bride, her mother and six aunties."},
    {"id": "brand_deal", "requires": {"smartphone": True, "camera": 3}, "at": "phone", "label": "Promote a brand on your page", "hours": [(H(9), H(24))], "minutes": 90,
     "earn": 15_000, "effects": {"energy": -8, "fun": 6}, "skill": "content", "xp": 12, "min_level": 7,
     "hustle": True, "weekly": True, "blurb": "A food delivery app wants your followers."},
]

# --- New Market (Ojaja): phones, foodstuff, tools, a bicycle, and hustles of its own
ACTIONS += [
    {"id": "foodstuff", "at": "market", "label": "Buy a foodstuff basket (mixed)", "hours": [(H(7), H(20, 30))], "minutes": 30,
     "cost": 6_000, "effects": {"energy": -3}, "special": "foodstuff",
     "blurb": "A bit of everything: rice, beans, garri, noodles, eggs, plantain and stew ingredients."},
    {"id": "puff", "at": "market", "label": "Puff-puff and zobo", "hours": [(H(7), H(20, 30))], "minutes": 15, "cost": 500,
     "effects": {"hunger": 20, "fun": 4}, "blurb": "Hot puff-puff from the woman by the gate.",
     "done": "Puff-puff and cold zobo. Small chops of champions."},
    {"id": "fix_screen", "at": "market", "label": "Fix your cracked screen", "hours": [(H(8), H(19))], "minutes": 60,
     "effects": {}, "special": "fix_screen", "blurb": "The phone repairers at Ojaja can change your screen."},
    {"id": "buy_bike", "at": "market", "label": "Buy a fairly-used bicycle", "hours": [(H(8), H(19))], "minutes": 30,
     "cost": 45_000, "effects": {}, "special": "buy_item", "item": "bike",
     "blurb": "Ride anywhere on campus for free. No more waiting at the park."},
    {"id": "buy_clippers", "at": "market", "label": "Buy barbing clippers", "hours": [(H(8), H(19))], "minutes": 20,
     "cost": 18_000, "effects": {}, "special": "buy_item", "item": "clippers",
     "blurb": "Wahl clippers and a cape. Barb your hall-mates for money."},
    {"id": "buy_cobbler_kit", "at": "market", "label": "Buy a shoemaker's kit", "hours": [(H(8), H(19))], "minutes": 20,
     "cost": 12_000, "effects": {}, "special": "buy_item", "item": "cobbler_kit",
     "blurb": "Awl, thread, glue and leather offcuts. Mend shoes and make palm slippers."},
    {"id": "learn_barbing", "at": "market", "label": "Learn barbing at a barber's shop (2 hrs)", "hours": [(H(9), H(19))],
     "minutes": 120, "cost": 1_000, "effects": {"energy": -6, "social": 6}, "skill": "barbing", "xp": 12, "learn": True,
     "blurb": "Sweep the floor, watch closely, try a low cut on a brave customer.",
     "done": "Two hours at the barber's. Your lines are getting straighter."},
    {"id": "learn_shoes", "at": "market", "label": "Learn from the shoemaker (2 hrs)", "hours": [(H(9), H(19))],
     "minutes": 120, "cost": 800, "effects": {"energy": -6}, "skill": "shoes", "xp": 12, "learn": True,
     "blurb": "Baba Cobbler shows you how to stitch a sole that won't open in the rain.",
     "done": "You stitched your first sole. Baba nodded. Once."},
    {"id": "mend_shoes", "once_per_day": True, "at": "market", "label": "Mend shoes and sandals (2 hrs)",
     "hours": [(H(9), H(18))], "minutes": 120, "earn": 1_800, "effects": {"energy": -8}, "hustle": True,
     "skill": "shoes", "xp": 8, "requires": {"item": "cobbler_kit"},
     "blurb": "Students' sandals always cut on the way to lectures."},
    {"id": "palm_slippers", "at": "market", "label": "Make palm slippers to order (4 hrs)", "hours": [(H(9), H(16))],
     "minutes": 240, "earn": 9_000, "effects": {"energy": -14}, "hustle": True, "weekly": True, "skill": "shoes",
     "xp": 14, "min_level": 5, "requires": {"item": "cobbler_kit"},
     "blurb": "Six pairs for a departmental dinner."},
    {"id": "shop_assistant", "once_per_day": True, "at": "market", "label": "Help at a phone accessories shop (3 hrs)",
     "hours": [(H(8), H(15))], "minutes": 180, "days": "weekdays", "earn": 2_000, "effects": {"energy": -10, "social": 4},
     "hustle": True, "blurb": "Screen guards, chargers and earpieces. Somebody always needs a charger."},
    {"id": "barb_wedding", "at": "phone", "label": "Barb a groom and his friends (3 hrs)", "hours": [(H(7), H(11))],
     "minutes": 180, "days": "weekend", "earn": 8_000, "effects": {"energy": -12, "social": 8}, "hustle": True,
     "weekly": True, "skill": "barbing", "xp": 14, "min_level": 5, "requires": {"item": "clippers", "smartphone": True},
     "blurb": "Booked through WhatsApp. Fresh cuts for the whole squad."},
]

ACTIONS.append({"id": "buy_car", "at": "phone", "label": "Buy a Tokunbo Corolla on Jiji", "hours": [(H(8), H(20))],
                "minutes": 120, "cost": 3_500_000, "effects": {"fun": 30}, "special": "buy_item", "item": "car",
                "requires": {"smartphone": True},
                "blurb": "Your own ride. Drive from your house to lectures. Petrol is ₦100 to ₦200 a trip."})

# Phones: what you can do with one depends on which one you have. Prices are what Ojaja sellers ask.
PHONES = {
    "nokia": {"name": "Nokia 105 (torchlight phone)", "price": 15_000, "smart": False, "camera": 0, "os": "keypad",
              "screen_fix": 3_000, "blurb": "Calls, SMS, a torchlight and Snake. Battery lasts a week."},
    "itel": {"name": "itel A70", "price": 75_000, "smart": True, "camera": 1, "os": "android", "brand": "itel",
             "screen_fix": 8_000, "blurb": "It does WhatsApp. Slowly."},
    "tecno": {"name": "Tecno Spark 20", "price": 145_000, "smart": True, "camera": 2, "os": "android", "brand": "tecno",
              "screen_fix": 15_000, "blurb": "Every second student has one."},
    "infinix": {"name": "Infinix Note 40", "price": 240_000, "smart": True, "camera": 2, "os": "android",
                "brand": "infinix", "screen_fix": 22_000, "blurb": "Big screen, fast charging, good for skits."},
    "samsung": {"name": "Samsung Galaxy A35", "price": 420_000, "smart": True, "camera": 3, "os": "android",
                "brand": "samsung", "screen_fix": 45_000, "blurb": "Clean camera. Brands notice your videos."},
    "iphone": {"name": "iPhone 12 (UK used)", "price": 520_000, "smart": True, "camera": 4, "os": "ios",
               "screen_fix": 60_000, "blurb": "The campus status symbol. Skits look expensive."},
}
for _pid, _ph in PHONES.items():
    ACTIONS.append({"id": f"buy_phone_{_pid}", "at": "market", "label": f"Buy {_ph['name']}", "hours": [(H(8), H(19))],
                    "minutes": 45, "cost": _ph["price"], "effects": {"fun": 10}, "special": "buy_phone", "phone": _pid,
                    "blurb": _ph["blurb"]})

ACTIONS.append({"id": "buy_laptop", "at": "market", "label": "Buy a fairly-used HP laptop", "hours": [(H(8), H(19))],
                "minutes": 45, "cost": 280_000, "effects": {"fun": 10}, "special": "buy_item", "item": "laptop",
                "blurb": "Core i5, 8 GB RAM, battery lasts 2 hours. Enough to learn to code and take gigs."})

ITEMS = {
    "laptop": {"name": "Laptop"},
    "bike": {"name": "Bicycle"},
    "car": {"name": "Car"},
    "clippers": {"name": "Barbing clippers"},
    "cobbler_kit": {"name": "Shoemaker's kit"},
}

# --- Businesses and investments (the Businesses app). Capital is the price you pay to start.
# Every evening at BUSINESS_PAYOUT_AT your takings come in, and rent (if any) goes out. Some days are bad days.
BUSINESS_PAYOUT_AT = H(20)     # 8 PM: "Evening takings" land in your account
BUSINESS_CATS = {
    "fashion": {"name": "Fashion and perfume", "emoji": "👔"},
    "gadgets": {"name": "Gadgets", "emoji": "📱"},
    "food": {"name": "Food and drink", "emoji": "🍢"},
    "services": {"name": "Services", "emoji": "✂️"},
    "airtime": {"name": "Data and airtime", "emoji": "📶"},
}
# place: "campus" (market, halls, SUB, Ojaja) or "off" (Ife town, rent every evening)
BUSINESSES = {
    "perfume_stall": {"name": "Perfume and body spray stall", "place": "campus", "cat": "fashion", "price": 25_000,
                      "income": (700, 1_800), "bad_chance": 0.10, "bad_loss": 500,
                      "bad_text": "A supplier sold you fake oil. Customers came back angry.",
                      "blurb": "A table at the Ojaja market with oils, sprays and a mirror. Students buy before every party."},
    "shirts": {"name": "Shirt and tie-dye table", "place": "campus", "cat": "fashion", "price": 40_000,
               "income": (900, 2_400), "bad_chance": 0.12, "bad_loss": 800,
               "bad_text": "Rain soaked the stock. Half the shirts were spoiled.",
               "blurb": "Plain tees, tie-dye and Ankara shirts sold at the market. Cheap to start, busy on weekends."},
    "gadget_tray": {"name": "Phone accessories tray at the SUB", "place": "campus", "cat": "gadgets", "price": 50_000,
                    "income": (1_000, 2_800), "bad_chance": 0.14, "bad_loss": 1_000,
                    "bad_text": "A batch of chargers was fake and got returned.",
                    "blurb": "Earphones, chargers, power banks and screen guards. Everyone's phone breaks eventually."},
    "kiosk": {"name": "Data and recharge kiosk", "place": "campus", "cat": "airtime", "price": 30_000,
              "income": (500, 1_200), "bad_chance": 0.10, "bad_loss": 400,
              "bad_text": "The network was down all day. No sales.",
              "blurb": "A table, an umbrella and every network's cards. Students always need data."},
    "printer": {"name": "Printing and typing stand", "place": "campus", "cat": "services", "price": 60_000,
                "income": (1_000, 2_600), "exam_boost": 1.6, "bad_chance": 0.12, "bad_loss": 1_000,
                "bad_text": "The printer jammed. Repairs cost you.",
                "blurb": "Projects, assignments and past questions. Busiest just before exams."},
    "food": {"name": "Food stall at the hall junction", "place": "campus", "cat": "food", "price": 150_000,
             "income": (2_500, 6_000), "bad_chance": 0.15, "bad_loss": 3_000,
             "bad_text": "NEPA took light and your stock spoiled.",
             "blurb": "Jollof, plantain and late-night noodles. Big money, big risk."},
    "chinchin": {"name": "Chin-chin supply to hall shops", "place": "campus", "cat": "food", "price": 20_000,
                 "income": (400, 1_000), "bad_chance": 0.10, "bad_loss": 500,
                 "bad_text": "A whole batch got soft in the rain.",
                 "blurb": "You fry, a younger student delivers to the hall shops."},
    "puffpuff": {"name": "Puff-puff and buns stand", "place": "campus", "cat": "food", "price": 15_000,
                 "income": (300, 900), "bad_chance": 0.10, "bad_loss": 300,
                 "bad_text": "The oil burnt and the dough didn't rise.",
                 "blurb": "Hot puff-puff in nylon at the hall gate. Morning rush and late-night readers."},
    "cobbler": {"name": "Shoe repair stand at Ojaja", "place": "campus", "cat": "services", "price": 35_000,
                "income": (600, 1_500), "bad_chance": 0.10, "bad_loss": 600,
                "bad_text": "Your apprentice glued a sole on backwards.",
                "blurb": "An umbrella, a stool and an apprentice."},
    "barbershop": {"name": "Barbing salon at Ojaja", "place": "campus", "cat": "services", "price": 90_000,
                   "income": (1_500, 3_500), "bad_chance": 0.12, "bad_loss": 1_500,
                   "bad_text": "NEPA took light; the generator drank your profit.",
                   "blurb": "Two chairs, a mirror, a generator and loud music."},
    "perfume_shop": {"name": "Perfume shop in Ife town", "place": "off", "cat": "fashion", "price": 200_000,
                     "rent": 1_000, "income": (4_000, 9_000), "bad_chance": 0.12, "bad_loss": 3_000,
                     "bad_text": "Someone broke the back door and took the best bottles.",
                     "blurb": "A proper shop with a glass counter, a fan and a landlord who wants his rent."},
    "boutique": {"name": "Clothing boutique in Ife town", "place": "off", "cat": "fashion", "price": 300_000,
                 "rent": 1_500, "income": (5_500, 12_000), "bad_chance": 0.13, "bad_loss": 4_000,
                 "bad_text": "A big order came back, and the tailor ran off with the fabric.",
                 "blurb": "Ready-made kaftans, jeans and aso-ebi for owambe. Students and lecturers both shop here."},
    "gadget_shop": {"name": "Gadget shop in Ife town", "place": "off", "cat": "gadgets", "price": 450_000,
                    "rent": 2_000, "income": (7_000, 16_000), "bad_chance": 0.15, "bad_loss": 6_000,
                    "bad_text": "NEPA took light and a customer's phone got damaged in your shop. You paid for it.",
                    "blurb": "Phones, laptops, power banks and a solar lamp in the window. Serious money, serious stock."},
    "provision": {"name": "Provision store off campus", "place": "off", "cat": "food", "price": 250_000,
                  "rent": 1_200, "income": (4_500, 9_500), "bad_chance": 0.12, "bad_loss": 3_000,
                  "bad_text": "The fridge failed overnight and your stock spoiled.",
                  "blurb": "Bread, eggs, milk, sugar and recharge cards. The whole street shops here."},
}
BUSINESS_RESALE = 0.6
# Push your businesses for a few nights (like Lagos Life's flyers, radio and influencers)
PROMOS = {
    "flyers": {"label": "Print and share flyers", "cost": 1_500, "boost": 0.20, "nights": 1,
               "blurb": "Flyers on every hall notice board. +20% business takings tonight."},
    "status": {"label": "Post on WhatsApp status and the hall group chats", "cost": 500, "boost": 0.10, "nights": 1,
               "blurb": "Cheap and quick. +10% business takings tonight."},
    "influencer": {"label": "Pay a campus influencer to shout you out", "cost": 6_000, "boost": 0.50, "nights": 2,
                   "blurb": "A big OAU account tells everyone about you. +50% business takings for 2 nights."},
}

for _bid, _b in BUSINESSES.items():
    ACTIONS.append({"id": f"buy_{_bid}", "at": "phone", "label": f"Start: {_b['name']}", "place": _b["place"], "cat": _b["cat"],
                    "hours": [(H(8), H(18))], "minutes": 60, "cost": _b["price"], "effects": {"energy": -6},
                    "special": "buy_business", "business": _bid,
                    "blurb": f"{_b['blurb']} Capital ₦{_b['price']:,}. Takings ₦{_b['income'][0]:,} to ₦{_b['income'][1]:,} every evening"
                             + (f", minus ₦{_b['rent']:,} rent." if _b.get("rent") else ".")})
    ACTIONS.append({"id": f"sell_{_bid}", "at": "phone", "label": f"Sell your {_b['name'].lower()}",
                    "hours": [(H(8), H(18))], "minutes": 30, "effects": {}, "special": "sell_business", "business": _bid,
                    "blurb": f"Get ₦{int(_b['price'] * BUSINESS_RESALE):,} back (60% of what you paid)."})

for _pid, _p in PROMOS.items():
    ACTIONS.append({"id": f"promo_{_pid}", "at": "phone", "label": _p["label"], "hours": [(H(7), H(22))], "minutes": 15,
                    "cost": _p["cost"], "effects": {}, "special": "promote", "promo": _pid, "blurb": _p["blurb"]})

ACTIONS_BY_ID = {a["id"]: a for a in ACTIONS}

# --- Foodstuff from Ojaja and what you can cook with it (cooking in your room is allowed) -----------------
FOODSTUFF = {
    "rice": {"name": "Rice", "unit": "cup", "pack": "Half paint-bucket of rice", "price": 3_000, "units": 6},
    "beans": {"name": "Beans", "unit": "cup", "pack": "Half paint-bucket of beans", "price": 2_400, "units": 6},
    "garri": {"name": "Garri", "unit": "cup", "pack": "Paint-bucket of garri", "price": 1_500, "units": 8},
    "yam": {"name": "Yam", "unit": "portion", "pack": "A big yam tuber", "price": 2_000, "units": 4},
    "spaghetti": {"name": "Spaghetti", "unit": "pack", "pack": "Three packs of spaghetti", "price": 1_800, "units": 3},
    "noodles": {"name": "Noodles", "unit": "pack", "pack": "Five packs of noodles", "price": 1_500, "units": 5},
    "egg": {"name": "Eggs", "unit": "egg", "pack": "Six eggs", "price": 1_200, "units": 6},
    "plantain": {"name": "Plantain", "unit": "finger", "pack": "A bunch of four plantains", "price": 1_600, "units": 4},
    "stew": {"name": "Stew ingredients", "unit": "pot", "pack": "Tomatoes, pepper, onions and oil", "price": 1_500, "units": 4},
    "soup": {"name": "Egusi and ugwu", "unit": "pot", "pack": "Egusi, ugwu, crayfish and palm oil", "price": 2_000, "units": 3},
    "protein": {"name": "Chicken or fish", "unit": "piece", "pack": "Frozen chicken or fish", "price": 3_500, "units": 4},
}
BASKET = {"rice": 2, "beans": 2, "garri": 2, "noodles": 2, "egg": 3, "plantain": 2, "stew": 2}
RECIPES = [
    # id, label, ingredients, minutes, effects, blurb
    ("jollof", "Cook jollof rice", {"rice": 1, "stew": 1}, 50, {"hunger": 55, "fun": 6},
     "Party jollof in a student pot. The bottom-pot is the best part."),
    ("rice_stew", "Cook rice and stew with chicken", {"rice": 1, "stew": 1, "protein": 1}, 60, {"hunger": 65, "fun": 8},
     "White rice, red stew and a proper piece of chicken. Sunday in the hostel."),
    ("beans_dodo", "Cook beans and fried plantain", {"beans": 1, "plantain": 1}, 60, {"hunger": 60, "fun": 4},
     "Ewa and dodo. Heavy, sweet, and it keeps you till evening."),
    ("yam_egg", "Cook boiled yam and egg sauce", {"yam": 1, "egg": 1, "stew": 1}, 40, {"hunger": 55, "fun": 4},
     "Yam and egg sauce: the breakfast of champions."),
    ("spag", "Cook jollof spaghetti", {"spaghetti": 1, "stew": 1}, 35, {"hunger": 50, "fun": 4},
     "Spaghetti cooked like jollof. Don't let anyone from Italy see."),
    ("eba_egusi", "Make eba and egusi soup", {"garri": 1, "soup": 1}, 55, {"hunger": 62, "fun": 5},
     "Egusi with ugwu, eba to swallow. Mama would be proud."),
    ("dodo_egg", "Fry plantain and egg", {"plantain": 1, "egg": 1}, 25, {"hunger": 38, "fun": 4},
     "Dodo and fried egg. Quick, cheap, sweet."),
]


def food_text(need: dict) -> str:
    names = [FOODSTUFF[k]["name"].lower() for k in need]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


for _id, _label, _need, _mins, _eff, _blurb in RECIPES:
    ACTIONS.append({"id": _id, "at": "home", "label": _label, "hours": [(0, H(24))], "minutes": _mins, "effects": dict(_eff),
                    "requires": {"food": dict(_need)}, "special": "recipe", "station": "food",
                    "blurb": f"{_blurb} Uses {food_text(_need)} from your foodstuff.", "done": f"{_label.replace('Cook ', '').replace('Make ', '').replace('Fry ', '').capitalize()}: done. Chop!"})
for _fid, _f in FOODSTUFF.items():
    ACTIONS.append({"id": f"shop_{_fid}", "at": "market", "label": f"Buy {_f['pack'].lower()}", "hours": [(H(7), H(20, 30))],
                    "minutes": 10, "cost": _f["price"], "effects": {}, "special": "grocery", "food": _fid,
                    "blurb": f"{_f['units']} {_f['unit']}{'s' if _f['units'] > 1 else ''} of {_f['name'].lower()} for cooking at home."})
ACTIONS_BY_ID = {a["id"]: a for a in ACTIONS}

# --- More with what you own: laptop courses, remote jobs, WhatsApp hustles and quick pick-me-ups ------------
ACTIONS += [
    {"id": "learn_data", "at": "laptop", "label": "Take an online data analysis course", "hours": [(H(6), H(26))],
     "minutes": 120, "cost": 300, "effects": {"energy": -7, "fun": -2}, "skill": "data", "xp": 12, "learn": True,
     "blurb": "Excel, pivot tables and your first dashboard. ₦300 of data.", "done": "Your first chart came out right."},
    {"id": "learn_uiux", "at": "laptop", "label": "Learn UI design in Figma", "hours": [(H(6), H(26))],
     "minutes": 120, "cost": 200, "effects": {"energy": -6, "fun": 3}, "skill": "design", "xp": 14, "learn": True,
     "blurb": "Redesign an app you hate. Free tutorials, ₦200 of data.", "done": "Your screens look like a real app now."},
    {"id": "learn_video", "at": "laptop", "label": "Edit videos and learn motion graphics", "hours": [(H(6), H(26))],
     "minutes": 120, "cost": 200, "effects": {"energy": -7, "fun": 6}, "skill": "content", "xp": 12, "learn": True,
     "blurb": "CapCut on the phone was the start. Now: proper editing.", "done": "That transition was clean."},
    # WhatsApp hustles (any smartphone)
    {"id": "wa_thrift", "once_per_day": True, "requires": {"smartphone": True}, "at": "phone",
     "label": "Sell thrift clothes on your WhatsApp status", "hours": [(H(7), H(23))], "minutes": 90, "cost": 1_000, "earn": 3_200,
     "effects": {"energy": -4, "social": 6}, "hustle": True, "skill": "hustling", "xp": 3,
     "blurb": "Okrika from Ojaja, photos on your bed, 'DM for price'. ₦1,000 for stock."},
    {"id": "wa_food", "once_per_day": True, "requires": {"smartphone": True}, "at": "phone",
     "label": "Take food orders in the hall WhatsApp group", "hours": [(H(10), H(21))], "minutes": 90, "earn": 2_000,
     "effects": {"energy": -6, "social": 8}, "hustle": True,
     "blurb": "You collect orders, a buka cooks, you deliver and keep the margin."},
    {"id": "wa_tv", "once_per_day": True, "requires": {"smartphone": True}, "at": "phone",
     "label": "Post paid adverts on your WhatsApp TV", "hours": [(H(7), H(24))], "minutes": 45, "earn": 1_500,
     "effects": {"energy": -2, "fun": 2}, "hustle": True, "skill": "content", "xp": 3,
     "blurb": "Your status views are your billboard. Hostels, gadgets, hair: ₦500 a post."},
    # quick pick-me-ups for your needs
    {"id": "call_friend", "requires": {"phone": True}, "at": "phone", "label": "Call a friend", "hours": [(H(7), H(24))],
     "minutes": 20, "effects": {"social": 18, "fun": 5}, "blurb": "Twenty minutes of gist with your secondary school person."},
    {"id": "music", "requires": {"smartphone": True}, "at": "phone", "label": "Listen to Afrobeats with your earphones",
     "hours": [(0, H(24))], "minutes": 20, "effects": {"fun": 14, "energy": 2}, "blurb": "Asake, Burna, Tems. Volume up."},
    {"id": "phone_game", "requires": {"smartphone": True}, "at": "phone", "label": "Play a game on your phone", "hours": [(0, H(24))],
     "minutes": 20, "effects": {"fun": 16, "energy": -2}, "blurb": "eFootball, Ludo, Candy Crush. Just one more round."},
    {"id": "skits", "requires": {"smartphone": True}, "at": "phone", "label": "Watch comedy skits", "hours": [(0, H(24))],
     "minutes": 20, "effects": {"fun": 15, "social": 3}, "blurb": "Sabinus, Taaooma and your hall's own skit makers."},
    {"id": "wipes", "requires": {"phone": True}, "at": "phone", "label": "Freshen up with wipes and roll-on", "hours": [(0, H(24))],
     "minutes": 5, "cost": 200, "effects": {"hygiene": 14}, "blurb": "Not a bath, but it'll carry you till evening."},
    {"id": "order_snacks", "requires": {"smartphone": True}, "at": "phone", "label": "Order snacks (gala, chin-chin, drink)",
     "hours": [(0, H(24))], "minutes": 20, "cost": 900, "effects": {"hunger": 24, "fun": 3},
     "blurb": "Delivered by the boy who sells everything in your hall."},
    {"id": "energy_drink", "requires": {"smartphone": True}, "at": "phone", "label": "Order an energy drink", "hours": [(0, H(24))],
     "minutes": 10, "cost": 600, "effects": {"energy": 16, "fun": 2}, "blurb": "Fearless or Power Horse. Don't make it a habit."},
    {"id": "splash", "at": "home", "label": "Splash water on your face", "hours": [(0, H(24))], "minutes": 5,
     "effects": {"hygiene": 12, "energy": 4}, "blurb": "Wakes you up, cools you down."},
    {"id": "power_nap", "at": "home", "label": "Power nap", "hours": [(0, H(24))], "minutes": 20,
     "effects": {"energy": 14}, "blurb": "Twenty minutes, alarm set. Back on your feet."},
    {"id": "stretch", "at": "home", "label": "Stretch and do push-ups", "hours": [(H(5), H(23))], "minutes": 15,
     "effects": {"energy": 6, "fun": 6}, "blurb": "A few push-ups between the bunks."},
]

# Remote jobs: apply on your laptop once you have the skill, then work a shift a day from anywhere with a roof.
REMOTE_JOBS = {
    "data_entry": {"name": "Data entry assistant", "pay": 3_000, "needs": None, "skill": "data"},
    "support": {"name": "Customer support agent", "pay": 5_000, "needs": ("charisma", 3), "skill": "charisma"},
    "social_media": {"name": "Social media manager", "pay": 6_500, "needs": ("content", 3), "skill": "content"},
    "designer": {"name": "Junior designer", "pay": 9_000, "needs": ("design", 4), "skill": "design"},
    "data_analyst": {"name": "Junior data analyst", "pay": 11_000, "needs": ("data", 4), "skill": "data"},
    "junior_dev": {"name": "Junior developer", "pay": 14_000, "needs": ("coding", 4), "skill": "coding"},
}
for _jid, _j in REMOTE_JOBS.items():
    _need = f" Needs {SKILLS[_j['needs'][0]]['name']} level {_j['needs'][1]}." if _j["needs"] else " Anyone with a laptop can start here."
    ACTIONS.append({"id": f"job_{_jid}", "at": "laptop", "label": f"Apply: {_j['name']} (remote)", "hours": [(H(8), H(22))],
                    "minutes": 60, "effects": {"energy": -4}, "special": "remote_apply", "job": _jid,
                    "blurb": f"Pays about ₦{_j['pay']:,} a shift, weekdays.{_need}"})
ACTIONS.append({"id": "remote_shift", "at": "laptop", "label": "Work your remote job shift", "hours": [(H(7), H(24))],
                "minutes": 240, "once_per_day": True, "days": WEEKDAYS_ONLY, "effects": {"energy": -14, "fun": -4},
                "special": "remote_shift", "hustle": True, "freelance": True,
                "blurb": "Log in, clear your tasks, log off. Paid into your account."})

# Durations in labels ("(2 hrs)") made no sense once every action plays out in seconds; the card shows the time.
import re as _re  # noqa: E402
for _a in ACTIONS:
    _a["label"] = _re.sub(r"\s*\((\d+(\.\d+)?|one|two|half an?)\s*(hrs?|hours?|mins?|minutes?)\)", "", _a["label"])
ACTIONS_BY_ID = {a["id"]: a for a in ACTIONS}

# --- Badges: little goals that make people play "one more day".
BADGES = {
    "first_a": ("First A", "Score an A in any course"),
    "straight_as": ("Straight As", "Get a 5.00 GPA in a semester"),
    "front_row": ("Front row", "Attend every lecture in a semester"),
    "night_crawler": ("Night crawler", "Read till dawn at HOL 5 times"),
    "hustle_king": ("Hustle king", "Make ₦100,000 from hustles"),
    "oga": ("Oga at the top", "Own a business"),
    "tycoon": ("Tycoon", "Own three businesses at once"),
    "master": ("Master of your craft", "Reach level 10 in any skill"),
    "viral": ("Gone viral", "Have a skit blow up"),
    "strike": ("Survived ASUU", "Live through an ASUU strike"),
    "loan_app": ("Loan app victim", "Borrow from a loan app"),
    "broke": ("Down to ₦0", "Spend your very last naira"),
    "health_centre": ("Health Centre regular", "Collapse three times"),
    "clean_sheet": ("Clean sheet", "Graduate without ever failing a course"),
    "first_class": ("First Class", "Graduate with a First"),
    "trekker": ("Legs of steel", "Trek 20 km around campus"),
    "early_bird": ("Early bird", "Be in the lecture hall before 8:00 for a morning lecture 10 times"),
    "own_ride": ("Own your ride", "Get a bicycle or a car"),
    "upgrade": ("New phone, who dis?", "Buy a new phone at Ojaja"),
    "dream": ("Living the dream", "Achieve the dream you picked at admission"),
    "legend": ("Great Ife Legend", "Reach Campus Rep level 16"),
    "landlord": ("Off-campus boss", "Rent your own place off campus"),
    "full_room": ("Full room", "Share a room with real players"),
    "odds": ("Odds landed", "Win a bet"),
    "freelancer": ("Freelancer", "Finish 10 freelance gigs"),
}

# Random events. "when": "day" rolls at the start of a day, "after": after certain actions.
# Each choice has effects, an optional cost, a result line, and optional flags it sets.
EVENTS = [
    {
        "id": "nepa", "title": "NEPA has taken light", "weight": 10, "when": "day",
        "text": "The whole hall is dark and the power bank is at 20%. No reading in your room for two days.",
        "choices": [
            {"label": "Fine. HOL it is.", "result": "You'll read at HOL until light comes back.", "flags": {"no_light": 2}},
            {"label": "Buy fuel for a friend's gen (₦1,500)", "cost": 1_500, "effects": {"social": 10},
             "result": "Light! And now everybody on your floor owes you."},
        ],
    },
    {
        "id": "water", "title": "No water in the hall", "weight": 9, "when": "day", "requires": {"hall": True},
        "text": "The taps are dry again. Water vendors are charging ₦300 a bucket.",
        "choices": [
            {"label": "Buy water when you need to bathe", "result": "Baths cost ₦300 for the next 3 days.",
             "flags": {"no_water": 3}},
        ],
    },
    {
        "id": "no_lecturer", "title": "Lecturer no show", "weight": 7, "when": "lecture",
        "text": "You waited 45 minutes. The class rep finally announces: 'Prof is at a conference in Abuja.'",
        "choices": [{"label": "Free period!", "effects": {"fun": 10}, "result": "No new notes today, but you got gist."}],
        "cancel_prep": True,
    },
    {
        "id": "aunty", "title": "Your aunty is in town", "weight": 5, "when": "day",
        "text": "She came with a bag of garri, a tuber of yam and an envelope.",
        "choices": [{"label": "Thank you ma!", "effects": {"hunger": 30, "fun": 10}, "money": 5_000,
                     "result": "₦5,000 and foodstuff. God bless aunties."}],
    },
    {
        "id": "roommate_borrow", "title": "Your roommate needs a loan", "weight": 7, "when": "day",
        "text": "'Abeg, lend me ₦3,000. I'll pay you back on Monday, I swear.'",
        "choices": [
            {"label": "Lend it", "cost": 3_000, "effects": {"social": 12}, "result": "You're a good person. Maybe a poor one now.",
             "flags": {"loan_out": 3_000}},
            {"label": "Say you're broke too", "effects": {"social": -8}, "result": "The room is a bit cold tonight."},
        ],
        "requires": {"min_money": 4_000},
    },
    {
        "id": "repay", "title": "Your roommate paid you back", "weight": 30, "when": "day",
        "text": "Shock of the semester: they actually paid.",
        "choices": [{"label": "Faith in humanity restored", "money_from_flag": "loan_out", "effects": {"fun": 8},
                     "result": "Your money is back.", "clear_flags": ["loan_out"]}],
        "requires": {"flag": "loan_out"},
    },
    {
        "id": "phone_cracked", "title": "You dropped your phone", "weight": 4, "when": "day",
        "text": "Face down on the pavement outside the lecture theatre. The screen is a spider web.",
        "choices": [{"label": "Pray and pick it up", "phone": "crack",
                     "result": "Cracked. It still works. You can change the screen at Ojaja."}],
        "requires": {"phone": "smart", "not_cracked": True},
    },
    {
        "id": "phone_stolen", "title": "Your phone is gone", "weight": 3, "when": "day",
        "text": "You put it down at the SUB for one second. One second. It's gone.",
        "choices": [{"label": "Report at the security post", "phone": "lose", "effects": {"fun": -15},
                     "result": "They took your statement. Until you buy another one at Ojaja, you have no phone."}],
        "requires": {"phone": True},
    },
    {
        "id": "phone_dead", "title": "Your phone fell in the bucket", "weight": 2, "when": "day",
        "text": "Bathing time. Phone on the edge of the bucket. Splash. Rice didn't save it.",
        "choices": [{"label": "RIP", "phone": "lose", "effects": {"fun": -12},
                     "result": "Your phone is dead. Ojaja sells new and fairly-used ones."}],
        "requires": {"phone": True},
    },
    {
        "id": "free_food", "title": "Free food at a departmental event", "weight": 5, "when": "day",
        "text": "Your department is hosting a seminar. The real attraction: jollof rice for attendees.",
        "choices": [
            {"label": "Attend for the jollof", "effects": {"hunger": 45, "social": 10, "prep": 3},
             "result": "You sat through the seminar, took notes, and left with a full plate of jollof."},
            {"label": "Skip it", "result": "Your stomach will remember this."},
        ],
    },
    {
        "id": "aluta", "title": "SU elections are here", "weight": 5, "when": "day",
        "text": "Campaign posters everywhere. A candidate is sharing free Indomie and promising 24-hour light.",
        "choices": [
            {"label": "Collect the Indomie, vote your conscience", "effects": {"hunger": 25, "fun": 8},
             "result": "Aluta continua!"},
            {"label": "Volunteer for a campaign", "effects": {"social": 25, "energy": -15, "prep": -4}, "money": 2_000,
             "result": "You're in politics now. They paid ₦2,000 'mobilisation'."},
        ],
    },
    {
        "id": "rain", "title": "Heavy rain", "weight": 6, "when": "day",
        "text": "The rain started at 7am and has no plans to stop.",
        "choices": [
            {"label": "Stay in and sleep", "effects": {"energy": 20, "prep": -2}, "result": "Best sleep of the semester."},
            {"label": "Brave it with a nylon bag on your head", "effects": {"hygiene": -15, "prep": 2},
             "result": "You made it to class. Your shoes did not."},
        ],
    },
    {
        "id": "missing_script", "title": "Your test script is missing", "weight": 0, "when": "results",
        "text": "Your name isn't on the CA result sheet. The lecturer says to come and see him.",
        "choices": [{"label": "Go and plead your case", "effects": {"energy": -10, "fun": -10},
                     "result": "After two visits, your script was 'found'."}],
    },
]

EVENTS_BY_ID = {e["id"]: e for e in EVENTS}

STRIKE = {
    "id": "strike",
    "title": "ASUU has declared a strike",
    "text": ("Lecturers have downed tools. Nobody knows how long it will last. The semester is paused: "
             "no lectures, no tests, and you'll forget some of what you read."),
    "days": 5,
    "chance": 0.06,  # per semester from 200 level, once per degree: about 1 in 3 degrees
    "choices": [
        {"label": "Stay on campus and hustle", "result": "Strike days: lectures are off. Hustle, rest, read if you can."},
    ],
}

LOAN_APP_INTEREST = 0.3  # borrow ₦10,000, repay ₦13,000 out of your next income

# Degree classes on the 5-point scale used by Nigerian universities.
DEGREE_CLASSES = [
    (4.50, "First Class"),
    (3.50, "Second Class Upper"),
    (2.40, "Second Class Lower"),
    (1.50, "Third Class"),
    (1.00, "Pass"),
    (0.00, "No degree yet"),
]

GRADE_BANDS = [(70, "A", 5), (60, "B", 4), (50, "C", 3), (45, "D", 2), (40, "E", 1), (0, "F", 0)]

# How your student looks (picked on the admission screen, drawn by the 3D client).
LOOK_OPTIONS = {
    # indexes into these lists are what a save stores; only ever add to the end of a list
    "skin": ["#8d5524", "#a86b3c", "#6b3e1f", "#c68642", "#4a2a14", "#3b2210", "#e0ac69", "#5c3a21"],
    "hair": ["low_cut", "afro", "braids", "bun", "dreads", "bald", "classic", "long"],
    "top": ["#1f6f4a", "#b03a2e", "#f2c230", "#2f5f9e", "#f4f4f2", "#222222", "#7a3e9d", "#e07b39", "#8fb8de"],
    "bottom": ["#26324a", "#3b3b3b", "#6b4f2a", "#e8e2d4", "#1f6f4a", "#4a6fa5"],
    "style": ["trousers", "skirt"],
    "hall": ["male", "female"],   # which halls you can live in
    "hair_color": ["#141010", "#3b2314", "#6b4226", "#7a1f2b", "#c9a227", "#4b2a6b"],
    "print": ["plain", "ankara", "adire", "aso_oke"],
    "beard": ["none", "beard"],
    "shoes": ["#f2f2ee", "#1c1c1c", "#6b4a2a", "#2f5f9e", "#b03a2e"],
}


# --- Who you are: traits (pick 2) and a dream (pick 1) ------------------------------------------
TRAITS = {
    "hustler": {"name": "Hustler", "emoji": "💼", "text": "Hustling grows 1.5× faster and hustles pay 10% more."},
    "bookworm": {"name": "Bookworm", "emoji": "📚", "text": "Reading works 15% better, but fun drops 20% faster."},
    "owambe": {"name": "Owambe Spirit", "emoji": "🎉", "text": "Fun drops 30% faster, but shows, hangouts and parties are 50% more fun."},
    "gym_rat": {"name": "Gym Rat", "emoji": "🏋️", "text": "Football and jogging give +12 fun; energy drops 10% slower."},
    "smooth_talker": {"name": "Smooth Talker", "emoji": "😎", "text": "Charisma grows 1.5× faster and social gains are 15% bigger."},
    "lazy_bone": {"name": "Lazy Bone", "emoji": "🛌", "text": "Energy drops 30% slower, but reading works 10% worse."},
    "clean_pikin": {"name": "Clean Pikin", "emoji": "🧼", "text": "Hygiene drops 35% slower."},
    "night_crawler": {"name": "Night Crawler", "emoji": "🌙", "text": "Energy drops 40% slower from 8 PM to 4 AM; TDB at HOL works 15% better."},
    "tech": {"name": "Tech Bro/Sis", "emoji": "💻", "text": "Coding grows 1.6× faster."},
    "foodie": {"name": "Foodie", "emoji": "🍲", "text": "Every proper meal gives +12 fun."},
}
DREAMS = {
    "first_class": {"name": "First Class", "emoji": "🎓", "text": "Graduate with a First Class."},
    "celeb": {"name": "Campus Celeb", "emoji": "⭐", "text": "Reach Campus Celeb on Campus Rep."},
    "tech": {"name": "Tech Bro/Sis", "emoji": "💻", "text": "Reach level 10 in Coding."},
    "odogwu": {"name": "Odogwu Hustler", "emoji": "💰", "text": "Make ₦300,000 from hustles."},
    "mogul": {"name": "Business Mogul", "emoji": "🏪", "text": "Own three businesses at once."},
}

# --- Campus Rep: everything you do on campus builds your name ------------------------------------
# Level n needs 100 + 60 × (n − 1) XP to pass.
REP_TITLES = [(1, "JJC"), (2, "Fresher"), (3, "Stalite"), (5, "Aluta Soldier"), (8, "Big Shot"),
              (12, "Campus Celeb"), (16, "Great Ife Legend")]
REP_FOR = {"lecture": 3, "mission": None, "event": 5, "hustle": 2, "a_grade": 15}

# --- Today on campus: three missions a day ------------------------------------------------------
# kind: "action" (any of ids), "cat" (a kind of activity), "visit" (be in a building), "earn" (hustle income today)
MISSIONS = {
    "easy": [
        {"id": "freshen", "label": "Freshen up", "kind": "action", "ids": ["bath"]},
        {"id": "eat_well", "label": "Eat a proper meal", "kind": "cat", "cat": "meal"},
        {"id": "call_home", "label": "Call home", "kind": "action", "ids": ["call_home"]},
        {"id": "garri", "label": "Cook something at home", "kind": "action",
         "ids": ["garri", "cook", "jollof", "rice_stew", "beans_dodo", "yam_egg", "spag", "eba_egusi", "dodo_egg"]},
    ],
    "campus": [
        {"id": "lecture", "label": "Attend a lecture", "kind": "action", "ids": ["lecture"]},
        {"id": "hol", "label": "Read at HOL", "kind": "action", "ids": ["hol_read", "hol_tdb"]},
        {"id": "sub", "label": "Go to SUB", "kind": "visit", "where": "sub"},
        {"id": "market", "label": "Pass through Ojaja market", "kind": "visit", "where": "market"},
        {"id": "social", "label": "Gist, hang out or play ball", "kind": "cat", "cat": "social"},
    ],
    "hustle": [
        {"id": "any_hustle", "label": "Do any hustle", "kind": "cat", "cat": "hustle"},
        {"id": "practise", "label": "Practise a skill", "kind": "cat", "cat": "learn"},
        {"id": "earn", "label": "Make ₦2,500 from hustles today", "kind": "earn", "amount": 2_500},
    ],
}
MISSION_REWARDS = {"easy": (500, 20), "campus": (1_000, 35), "hustle": (1_500, 50)}  # naira, rep
MISSION_BONUS = (1_500, 80)

# --- Daily streak: come back each real day -------------------------------------------------------
STREAK_REWARDS = [(1_000, 10, "₦1,000"), (1_500, 15, "₦1,500"), (0, 40, "+40 Campus Rep"), (2_500, 20, "₦2,500"),
                  (3_000, 25, "₦3,000"), (0, 60, "+60 Campus Rep"), (8_000, 150, "Sunday chest: ₦8,000 and +150 Rep")]

# --- Moodlets: short good or bad feelings that change your mood ----------------------------------
MOODLETS = {
    "belle_full": ("Belle Full", "😋", 8, 4),
    "mummys_alert": ("Mummy's Alert", "📲", 10, 12),
    "front_seat": ("Front Seat", "🪑", 6, 3),
    "slept_well": ("Slept Like an Oba", "😴", 8, 6),
    "hall_pride": ("Hall Pride", "🏆", 10, 6),
    "straight_as": ("Straight A's", "🅰️", 15, 48),
    "carry_over": ("Carry-Over", "😩", -15, 48),
    "viral": ("Gone Viral", "🔥", 15, 24),
    "embarrassed": ("Embarrassed", "😳", -8, 3),
    "sharp": ("Sharp Brain", "🧠", 6, 3),
    "new_phone": ("New Phone Joy", "📱", 12, 24),
    "odds_landed": ("Odds Landed", "🤑", 12, 6),
    "bet_cut": ("Bet Cut", "😭", -10, 6),
    "lecture_from_home": ("Parents' Lecture", "📞", -4, 4),
    "new_place": ("New Place Vibes", "🗝", 12, 48),
    "roomie_gist": ("Roomie Gist", "🛏", 6, 4),
}
# Moodlets that depend on how things are right now (not timed)
LIVE_MOODLETS = {
    "sapa": ("Sapa Don Hold Me", "🫥", -10),
    "no_light": ("No Light", "🕯️", -6),
    "soft_life": ("Soft Life", "😌", 8),
    "flat_life": ("Flat Life", "🏡", 6),
    "cosy_home": ("Cosy Home", "🛋", 6),
    "dream_home": ("Dream Home", "🏰", 12),
}
WATER_MAX = 4          # buckets you can keep in your room
WATER_PER_TRIP = 2

# --- Moments in a lecture -------------------------------------------------------------------------
CLASS_MOMENT_CHANCE = 0.55
CLASS_MOMENTS = [
    {
        "id": "lecturer_question", "title": "The lecturer points at you",
        "text": "\"You there, in the {seat}. Tell the class what we just discussed.\" Two hundred heads turn.",
        "choices": [
            {"label": "Stand up and answer boldly", "chance": 0.45, "per_prep": 0.005,
             "success": {"effects": {"prep": 3, "social": 6}, "rep": 12, "charisma": 6,
                         "result": "Nailed it. The lecturer nodded: \"Good. At least someone is reading.\""},
             "fail": {"effects": {"fun": -6}, "moodlet": "embarrassed",
                      "result": "You mixed up two topics. Somebody at the back laughed. Loudly."}},
            {"label": "Mumble and look at your notes", "result": "\"Sit down.\" You survived.",
             "effects": {}},
        ],
    },
    {
        "id": "roll_call", "title": "Roll call",
        "text": "The class rep is calling names. Your friend Tobi isn't here and is begging you on WhatsApp to answer for him.",
        "choices": [
            {"label": "Just answer for yourself", "result": "Present. Honest and boring.", "effects": {}, "rep": 2},
            {"label": "Answer for Tobi too", "chance": 0.6,
             "success": {"effects": {"social": 8}, "result": "Nobody noticed. Tobi owes you one."},
             "fail": {"effects": {"fun": -10, "prep": -2}, "moodlet": "embarrassed",
                      "result": "\"Tobi, stand up.\" Nobody stood. The lecturer cancelled both your attendance marks."}},
        ],
    },
    {
        "id": "phone_rings", "title": "Your phone is ringing in class",
        "text": "Full volume. Your ringtone is a Burna Boy song. The lecturer stops mid-sentence.",
        "choices": [
            {"label": "Silence it quickly and apologise", "chance": 0.7,
             "success": {"result": "\"Put it on silent.\" You did. Crisis averted.", "effects": {}},
             "fail": {"effects": {"prep": -2, "fun": -6}, "moodlet": "embarrassed",
                      "result": "\"Bring that phone here.\" You'll collect it after class. Shame."}},
            {"label": "Pick it up and whisper", "chance": 0.15,
             "success": {"effects": {"social": 4}, "result": "Somehow, nobody cared. Lucky you."},
             "fail": {"effects": {"prep": -4, "fun": -8}, "moodlet": "embarrassed",
                      "result": "\"Get out of my class.\" You stood outside for the rest of the lecture."}},
        ],
    },
    {
        "id": "group_work", "title": "Find a partner",
        "text": "\"Pair up and solve the question on the board. Five minutes.\"",
        "choices": [
            {"label": "Pair with the brilliant quiet one", "chance": 0.55, "per_prep": 0.004,
             "success": {"effects": {"prep": 3, "social": 6}, "charisma": 4, "result": "You solved it together. New study partner unlocked."},
             "fail": {"effects": {"social": 2}, "result": "They solved it. You copied. At least you understand it now."}},
            {"label": "Pair with your gist partner", "result": "You discussed everything except the question.",
             "effects": {"social": 10, "fun": 6}, "charisma": 3},
        ],
    },
]

# Pop quizzes: real questions for each course (and general studies). index = correct option.
# "fac:<group>" sets are shared by every course in that faculty.
QUIZZES = {
    "fac:tech": [
        ("Ohm's law says voltage equals…", ["Current × resistance", "Current ÷ resistance", "Power × time", "Resistance ÷ current"], 0),
        ("The SI unit of force is the…", ["Joule", "Watt", "Newton", "Pascal"], 2),
        ("Which of these is a vector quantity?", ["Mass", "Speed", "Velocity", "Temperature"], 2),
        ("1 kilowatt is…", ["10 W", "100 W", "1,000 W", "1,000,000 W"], 2),
        ("Engineering drawings at OAU are done in…", ["TDB", "The drawing studio", "Oduduwa Hall", "The SUB"], 1),
    ],
    "fac:science": [
        ("The chemical symbol for sodium is…", ["S", "So", "Na", "Sd"], 2),
        ("Which organelle is called the powerhouse of the cell?", ["Nucleus", "Ribosome", "Mitochondrion", "Golgi body"], 2),
        ("The derivative of x² is…", ["x", "2x", "x³/3", "2"], 1),
        ("Acceleration due to gravity is about…", ["1.6 m/s²", "9.8 m/s²", "98 m/s²", "0.98 m/s²"], 1),
        ("pH 7 is…", ["Acidic", "Neutral", "Basic", "Salty"], 1),
    ],
    "fac:socsci": [
        ("The father of sociology is often said to be…", ["Auguste Comte", "Adam Smith", "Karl Marx", "Plato"], 0),
        ("Nigeria became a republic in…", ["1960", "1963", "1966", "1979"], 1),
        ("A census counts…", ["Votes", "The population", "Taxes", "Schools"], 1),
        ("Which is a primary research method?", ["Reading a textbook", "A questionnaire", "A news summary", "A Wikipedia page"], 1),
        ("The study of the mind and behaviour is…", ["Psychology", "Geology", "Philology", "Ecology"], 0),
    ],
    "fac:admin": [
        ("The accounting equation is Assets = …", ["Liabilities − Equity", "Liabilities + Equity", "Income − Expenses", "Cash + Bank"], 1),
        ("The UN headquarters is in…", ["Geneva", "Paris", "New York", "Addis Ababa"], 2),
        ("Nigeria has how many local government areas?", ["36", "300", "774", "1,000"], 2),
        ("ECOWAS is a body of…", ["West African states", "Oil producers", "Commonwealth nations", "African banks"], 0),
        ("POSDCORB is a classic acronym in…", ["Public administration", "Accounting", "Chemistry", "Law"], 0),
    ],
    "fac:arts": [
        ("Who wrote 'Things Fall Apart'?", ["Wole Soyinka", "Chinua Achebe", "Chimamanda Adichie", "Ben Okri"], 1),
        ("Wole Soyinka won the Nobel Prize in Literature in…", ["1976", "1986", "1996", "2006"], 1),
        ("'Ẹ káàárọ̀' in Yoruba means…", ["Good night", "Good morning", "Thank you", "Welcome"], 1),
        ("'Bonjour' is French for…", ["Goodbye", "Hello / good day", "Please", "Thank you"], 1),
        ("The Ife bronze heads were made by artists of…", ["Benin", "Ancient Ile-Ife", "Nok", "Igbo-Ukwu"], 1),
    ],
    "fac:law": [
        ("The highest court in Nigeria is the…", ["Court of Appeal", "Federal High Court", "Supreme Court", "Magistrate Court"], 2),
        ("'Ignorantia juris non excusat' means…", ["Ignorance of the law is no excuse", "The law is blind", "Let the buyer beware", "Innocent until proven guilty"], 0),
        ("After the LL.B, Nigerian lawyers attend…", ["NYSC first", "The Nigerian Law School", "Senate", "Law Society only"], 1),
        ("A binding agreement between parties is a…", ["Tort", "Contract", "Statute", "Writ"], 1),
        ("The 1999 Constitution is Nigeria's…", ["Highest law", "Penal code", "Customary law", "Bylaw"], 0),
    ],
    "fac:education": [
        ("Teaching practice is often called…", ["IT", "SIWES", "TP", "NYSC"], 2),
        ("Bloom's taxonomy classifies…", ["Learning objectives", "School buildings", "Exam halls", "Teachers' pay"], 0),
        ("Nigeria's 6-3-3-4 system: the '4' is…", ["Primary school", "Junior secondary", "Senior secondary", "University"], 3),
        ("A lesson plan is written…", ["After teaching", "Before teaching", "Only for exams", "By the students"], 1),
        ("Guidance and counselling helps students with…", ["Personal, academic and career choices", "Fees only", "Sports only", "Hostel allocation"], 0),
    ],
    "fac:pharm": [
        ("Paracetamol is mainly used to…", ["Fight bacteria", "Relieve pain and fever", "Lower blood sugar", "Treat malaria"], 1),
        ("Antibiotics work against…", ["Viruses", "Bacteria", "All infections", "Allergies"], 1),
        ("Nigeria's drug regulator is…", ["NAFDAC", "NCC", "NDLEA", "SON"], 0),
        ("Artemisinin-based drugs treat…", ["Typhoid", "Malaria", "Diabetes", "Asthma"], 1),
        ("The pharmacy degree at OAU is the…", ["B.Sc. Pharmacy", "B.Pharm", "MBBS", "B.NSc"], 1),
    ],
    "fac:chs": [
        ("A normal adult resting heart rate is about…", ["20–40 bpm", "60–100 bpm", "120–160 bpm", "200 bpm"], 1),
        ("The largest organ of the human body is the…", ["Liver", "Brain", "Skin", "Heart"], 2),
        ("Red blood cells carry oxygen using…", ["Insulin", "Haemoglobin", "Keratin", "Melanin"], 1),
        ("OAU's teaching hospital is…", ["UCH", "LUTH", "OAUTHC", "UNTH"], 2),
        ("The femur is found in the…", ["Arm", "Thigh", "Skull", "Chest"], 1),
    ],
    "fac:agric": [
        ("Cassava is a…", ["Cereal", "Root crop", "Legume", "Fruit"], 1),
        ("Nitrogen is fixed in the soil by bacteria in the roots of…", ["Maize", "Legumes", "Yam", "Cassava"], 1),
        ("A castrated male cattle raised for work or meat is a…", ["Bull", "Heifer", "Steer", "Ram"], 2),
        ("Soil pH affects…", ["Nutrient availability", "Rainfall", "Sunlight", "Wind"], 0),
        ("Nigeria's biggest export crop in the 1950s–60s alongside cocoa was…", ["Rice", "Groundnut", "Wheat", "Tea"], 1),
    ],
    "fac:edm": [
        ("A drawing of a building seen from above is a…", ["Section", "Elevation", "Plan", "Perspective"], 2),
        ("A Bill of Quantities is prepared by a…", ["Quantity surveyor", "Pharmacist", "Lawyer", "Geologist"], 0),
        ("Estate surveyors value…", ["Land and buildings", "Crops", "Shares only", "Cars"], 0),
        ("A 1:100 scale means 1 cm on paper is…", ["1 m in reality", "10 m in reality", "100 m in reality", "1 cm in reality"], 0),
        ("Zoning laws are part of…", ["Urban planning", "Pharmacy", "Music", "Botany"], 0),
    ],
    "csc": [
        ("What does CPU stand for?", ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Core Processing Utility"], 0),
        ("Which of these is NOT a programming language?", ["Python", "Java", "HTML", "C"], 2),
        ("What is the binary for decimal 5?", ["110", "101", "111", "100"], 1),
        ("Which data structure works first-in, first-out?", ["Stack", "Queue", "Tree", "Graph"], 1),
        ("What is the time complexity of binary search?", ["O(n)", "O(n²)", "O(log n)", "O(1)"], 2),
        ("1 byte is how many bits?", ["4", "8", "16", "32"], 1),
    ],
    "ecn": [
        ("When price rises and everything else is equal, quantity demanded usually…", ["Rises", "Falls", "Stays the same", "Doubles"], 1),
        ("GDP stands for…", ["Gross Domestic Product", "General Development Plan", "Gross Demand Price", "Government Debt Payment"], 0),
        ("Nigeria's central bank is the…", ["NDIC", "SEC", "CBN", "FIRS"], 2),
        ("A general rise in prices over time is called…", ["Deflation", "Inflation", "Recession", "Devaluation"], 1),
        ("Opportunity cost is…", ["The price you pay", "The next best alternative given up", "Tax on goods", "Total cost of production"], 1),
    ],
    "acc": [
        ("Assets = Liabilities + …", ["Expenses", "Equity", "Revenue", "Drawings"], 1),
        ("A debit entry increases which of these?", ["Liabilities", "Revenue", "Assets", "Capital"], 2),
        ("The statement showing profit or loss for a period is the…", ["Balance sheet", "Income statement", "Cash book", "Trial balance"], 1),
        ("Depreciation is applied to…", ["Inventory", "Cash", "Non-current assets", "Trade payables"], 2),
        ("A trial balance checks that…", ["Profit is correct", "Total debits equal total credits", "Cash equals bank", "Assets equal revenue"], 1),
    ],
    "mcb": [
        ("Which of these is a prokaryote?", ["Yeast", "Bacterium", "Amoeba", "Mould"], 1),
        ("Gram-positive bacteria stain…", ["Pink/red", "Purple", "Green", "Yellow"], 1),
        ("Who is called the father of microbiology?", ["Darwin", "Mendel", "Antonie van Leeuwenhoek", "Newton"], 2),
        ("Malaria is caused by…", ["A virus", "A bacterium", "Plasmodium (a protozoan)", "A fungus"], 2),
        ("Penicillin was discovered by…", ["Louis Pasteur", "Alexander Fleming", "Robert Koch", "Edward Jenner"], 1),
    ],
    "pol": [
        ("Nigeria became independent in…", ["1957", "1960", "1963", "1966"], 1),
        ("The three arms of government are executive, legislature and…", ["Military", "Judiciary", "Civil service", "Police"], 1),
        ("Nigeria's National Assembly has the Senate and the…", ["House of Lords", "House of Representatives", "Council of States", "House of Chiefs"], 1),
        ("Separation of powers is associated with…", ["Montesquieu", "Karl Marx", "Plato", "Machiavelli"], 0),
        ("How many states does Nigeria have?", ["30", "36", "37", "40"], 1),
    ],
    "eng": [
        ("Who wrote 'Things Fall Apart'?", ["Wole Soyinka", "Chinua Achebe", "Chimamanda Adichie", "Ben Okri"], 1),
        ("Which is a synonym of 'benevolent'?", ["Cruel", "Kind", "Lazy", "Angry"], 1),
        ("'The sun smiled at us' is an example of…", ["Simile", "Personification", "Alliteration", "Hyperbole"], 1),
        ("Wole Soyinka won the Nobel Prize in Literature in…", ["1976", "1986", "1996", "2006"], 1),
        ("Which sentence is correct?", ["She don't know", "She doesn't knows", "She doesn't know", "She not know"], 2),
    ],
    "gst": [
        ("OAU was formerly called…", ["University of Lagos", "University of Ife", "Ife Polytechnic", "Western University"], 1),
        ("The Hezekiah Oluwasanmi Library is named after OAU's…", ["First chancellor", "Vice-chancellor", "Founder", "First student"], 1),
        ("Obafemi Awolowo was the first Premier of the…", ["Northern Region", "Western Region", "Eastern Region", "Mid-West"], 1),
    ],
}
QUIZ_CHANCE = 0.4   # of class moments, this many are pop quizzes


# --- People: what you can do with someone you tap ------------------------------------------------
SOCIAL = {
    # bond: how much closer it brings you; needs: how close you must be first (see FRIEND_LEVELS)
    "hello": {"label": "Say hello", "emoji": "👋🏾", "effects": {"social": 4}, "seconds": 3, "cooldown": 20, "bond": 2},
    "gist": {"label": "Gist", "emoji": "💬", "effects": {"social": 12, "fun": 6}, "seconds": 7, "cooldown": 45, "bond": 4},
    "joke": {"label": "Crack a joke", "emoji": "😂", "effects": {"social": 9, "fun": 10}, "seconds": 5, "cooldown": 45,
             "chance": True, "bond": 4},
    "hype": {"label": "Hype them up", "emoji": "🙌🏾", "effects": {"social": 10, "fun": 5}, "seconds": 5, "cooldown": 45,
             "bond": 4, "needs": 10},
    "life": {"label": "Talk about life", "emoji": "🫶🏾", "effects": {"social": 18, "fun": 4}, "seconds": 9, "cooldown": 90,
             "bond": 6, "needs": 30},
    "hang": {"label": "Hang out", "emoji": "🚶🏾", "effects": {"social": 20, "fun": 14, "energy": -4}, "seconds": 12,
             "cooldown": 120, "bond": 7, "needs": 30},
    "borrow": {"label": "Ask for small money", "emoji": "🙏🏾", "effects": {"social": -2}, "seconds": 5, "cooldown": 1440,
               "bond": -3, "needs": 60, "npc_only": True},
    "shade": {"label": "Throw shade", "emoji": "😒", "effects": {"fun": 4, "social": -6}, "seconds": 4, "cooldown": 60,
              "bond": -8},
}
SOCIAL_ORDER = ["hello", "gist", "joke", "hype", "life", "hang", "borrow", "shade"]
# how close you are to someone, from the bond score that greetings, gists and hangouts build
FRIEND_LEVELS = [(0, "Stranger"), (10, "Acquaintance"), (30, "Friend"), (60, "Close friend"), (100, "Bestie")]
BOND_MAX = 120
PEOPLE_KEEP = 60          # people you remember; the ones you haven't seen in longest are forgotten first
BORROW_RANGE = (300, 1_500)
SOCIAL_LINES = {
    "hello": ["{who} waved back. 👋🏾", "{who}: \"How far!\"", "{who} nodded and smiled."],
    "gist": ["You and {who} gisted about everything and nothing.", "{who} told you who is dating who in your department.",
             "{who} gave you the full gist of last night's hall party."],
    "joke_win": ["{who} laughed till they cried 😂", "{who}: \"You no well!\" 😂", "That one cracked {who} up."],
    "joke_fail": ["{who} didn't laugh. Tough crowd.", "{who} stared at you. Awkward.", "Crickets. {who} has heard that one."],
    "hype": ["You hyped {who} up. They're walking taller now. 🙌🏾", "{who}: \"Odogwu! You too much!\"",
             "You told {who} they're the main character. They believed it."],
    "life": ["You and {who} talked about home, school and what comes after.", "{who} told you what they really want to do after OAU.",
             "Deep talk with {who}. You both feel lighter."],
    "hang": ["You and {who} walked round campus, bought gala and talked rubbish. Good times.",
             "You hung out with {who} till the sun went down.", "{who} showed you their favourite spot on campus."],
    "borrow_yes": ["{who} sent you ₦{amount:,}. \"Pay me back o!\"", "{who} squeezed out ₦{amount:,} for you."],
    "borrow_no": ["{who}: \"Me sef I'm broke 😭\"", "{who} laughed and changed the topic."],
    "shade": ["You threw shade at {who}. They'll remember that.", "{who} hissed and walked off.",
              "{who}: \"Who send you?\""],
}

# --- The SUG election in the OAU Portal (a new race every real week) ----------------------------------
SUG_CANDIDATES = [
    {"id": "light", "name": "Comrade Ifeoluwa", "slogan": "Light & Water", "promise": "Every hall gets light and running water before exams."},
    {"id": "shuttle", "name": "Hauwa 'Shuttle'", "slogan": "Free Shuttle", "promise": "Free campus shuttle from Moremi to the Faculties at 7 AM."},
    {"id": "buka", "name": "Seyi Buka-Prices", "slogan": "Cheap Food", "promise": "Bring back ₦300 rice and beans at every buka."},
    {"id": "wifi", "name": "Comrade Tobi", "slogan": "Campus Wi-Fi", "promise": "Free Wi-Fi in HOL, SUB and every lecture theatre."},
    {"id": "sports", "name": "Musa 'Goals'", "slogan": "Sports for All", "promise": "Floodlights on the pitch and inter-hall games every month."},
    {"id": "safety", "name": "Adaeze Safe-Campus", "slogan": "Safe Nights", "promise": "Street lights on every road and night cabs that are fair."},
    {"id": "fees", "name": "Comrade Kunle", "slogan": "No Fee Hike", "promise": "Fight every fee increase. Aluta continua!"},
    {"id": "hostel", "name": "Bisi Bed-Space", "slogan": "More Bed Spaces", "promise": "Two new hostels and no more squatting."},
]

# --- The daily campus riddle: a clue each day, the first finders win ----------------------------------
RIDDLES = {
    "hol": "Silence is the rule, the cold air is free, and TDB students sleep here at three.",
    "oduduwa": "Convocation gowns, concerts and calls: the biggest stage of all Great Ife's halls.",
    "senate": "Fees and files and very long lines: the white tower where the VC signs.",
    "market": "Phones get fixed and garri gets sold; Ojaja is noisy, so I'm told.",
    "sports": "Round and round the track they run; the goalposts stand in the evening sun.",
    "amphi": "Steps like a bowl where the drama is played; at night the music won't fade.",
    "buka": "Amala hot and ewedu green; Mama's pot is the best you've seen.",
    "health": "Fever or headache, they'll check your pressure; the pharmacy's out of everything, for sure.",
    "sub": "Union of students, cafeteria queues: the SUG office is where they share the news.",
    "thousand": "A thousand seats and nowhere to hide: general courses happen inside.",
    "banks": "Six banks in a row, ATMs that queue: withdraw your allowance, there's POS too.",
}
RIDDLE_PRIZES = [(1, 5_000), (3, 2_500), (10, 1_000), (10**9, 300)]   # (up to rank, prize)

# --- Big moments everyone in the room sees ----------------------------------------------------------
ACTIONS += [
    {"id": "round_buka", "at": "buka", "label": "Buy food for everyone here", "hours": [(H(8), H(21))], "minutes": 20,
     "cost": 10_000, "effects": {"social": 35, "fun": 15, "hunger": 20}, "pay": "any",
     "blurb": "Plates for the whole buka. They'll be singing your name.", "done": "The whole buka is eating on you. Odogwu!",
     "spectacle": {"emoji": "🍲", "text": "{name} just bought food for EVERYONE at Mama Put! Eat on them!"}},
    {"id": "round_sub", "at": "sub", "label": "Buy drinks for the whole SUB", "hours": [(H(9), H(21))], "minutes": 20,
     "cost": 15_000, "effects": {"social": 40, "fun": 20}, "pay": "any",
     "blurb": "Chilled drinks for every table in the SUB.", "done": "Drinks are on you. The SUB is cheering.",
     "spectacle": {"emoji": "🥤", "text": "{name} is buying drinks for the WHOLE SUB! Cold ones on them!"}},
    {"id": "spray_amphi", "at": "amphi", "label": "Spray money at the show", "hours": [(H(18), H(23))], "minutes": 15,
     "cost": 5_000, "effects": {"fun": 30, "social": 25}, "pay": "cash",
     "blurb": "Naira notes in the air while the band plays.", "done": "You sprayed the stage. The DJ called your name!",
     "spectacle": {"emoji": "💸", "text": "MAKE IT RAIN! {name} is spraying money at the Amphitheatre!"}},
]
# shared campus moments: everyone there sees the banner
ACTIONS += [
    {"id": "rally_sub", "at": "sub", "label": "Lead an SUG rally", "hours": [(H(15), H(19))], "minutes": 45,
     "days": WEEKDAYS_ONLY, "cost": 2_000, "effects": {"social": 30, "fun": 15, "energy": -10}, "pay": "any",
     "blurb": "Placards, a megaphone and a crowd. Aluta continua!", "done": "Your rally shook the SUB. Students are chanting your slogan.",
     "spectacle": {"emoji": "✊🏾", "text": "ALUTA! {name} is leading a rally at the SUB!"}},
    {"id": "war_cry", "at": "sports", "label": "Lead your hall's war cry", "hours": [(H(16), H(20))], "minutes": 30,
     "effects": {"social": 25, "fun": 25, "energy": -12},
     "blurb": "Inter-hall games: drums, flags and your hall's loudest song.", "done": "Your hall's war cry drowned out everyone. Great Ife!",
     "spectacle": {"emoji": "📣", "text": "{name} is leading the war cry at the Sports Complex! Great Ife!"}},
    {"id": "dept_dinner", "at": "oduduwa", "label": "Walk the red carpet at the departmental dinner", "hours": [(H(19), H(23))],
     "minutes": 120, "days": FRI_SAT, "cost": 4_000, "effects": {"social": 40, "fun": 35, "hunger": 30, "energy": -10}, "pay": "any",
     "blurb": "Owambe for your department: food, awards and photos.", "done": "You won 'Best Dressed' at the departmental dinner! 📸",
     "spectacle": {"emoji": "🍽️", "text": "{name} just walked the red carpet at the departmental dinner!"}},
]
ACTIONS_BY_ID = {a["id"]: a for a in ACTIONS}   # again, now the big-moment actions are in

# --- Furnish your place (the 🛋 tab) -------------------------------------------------------------------
# Off campus you can turn a bare room into a home. Each item fills one slot (a better mattress replaces the old
# one, which a used-furniture buyer takes off your hands). What an item can do:
#   decay      needs fall slower ({"energy": 0.9} = 10% slower)       sleep_fun  extra fun when you wake
#   study      reading at home works better (+0.1 = 10%)              learn      laptop practice earns more XP
#   cook       home cooking is quicker (fraction of the time saved)   meal       home meals fill you more
#   bath       extra needs from a bath                                water      baths are free when the taps are dry
#   light      "lamp": you can read when NEPA takes light; "backup": everything keeps working (fuel = ₦ per dark day)
#   theft      chance of a break-in is multiplied by this             comfort    makes home feel good (Cosy/Dream Home)
#   bill       ₦ a week on the prepaid meter or subscription          power      needs electricity to work
#   fit        smallest home it fits in (0 hall bunk, 1 single room, 2 self-contain, 3 flat)
HOME_RANK = {"hostel": 0, "single": 1, "self_con": 2, "flat": 3}
FIT_NAMES = {0: "a hall bunk", 1: "a single room", 2: "a self-contain", 3: "a flat"}
FURNISH_CATEGORIES = [
    {"id": "sleep", "name": "Sleep", "emoji": "🛏", "blurb": "Better sleep keeps your energy up all day."},
    {"id": "comfort", "name": "Power & cooling", "emoji": "⚡", "blurb": "Beat NEPA and the Ife heat."},
    {"id": "enjoy", "name": "Enjoyment", "emoji": "🎮", "blurb": "TV, PlayStation and sound. Fun at home, and a FIFA hustle."},
    {"id": "kitchen", "name": "Kitchen", "emoji": "🍳", "blurb": "Cook faster, eat better, keep drinks cold."},
    {"id": "bath", "name": "Bath & laundry", "emoji": "🚿", "blurb": "Water when the taps are dry, and hot baths."},
    {"id": "living", "name": "Living room", "emoji": "🛋", "blurb": "Somewhere for friends to sit. Your place, your style."},
    {"id": "study", "name": "Study & work", "emoji": "📚", "blurb": "Read better at home and earn more on your laptop."},
    {"id": "security", "name": "Security", "emoji": "🔒", "blurb": "Thieves love student areas. Make yours the hard one."},
]
# (id, category, slot, name, emoji, price, blurb, effects)
_FURNITURE = [
    # Sleep
    ("foam_pad", "sleep", "bed", "Thick foam topper", "🧽", 18_000,
     "Goes on top of the hall's thin foam. Your back will thank you.", {"decay": {"energy": 0.96}, "sleep_fun": 2, "comfort": 1, "fit": 0}),
    ("foam6", "sleep", "bed", "6-inch foam mattress", "🛏", 65_000,
     "A proper mattress on the floor. No more waking up with springs in your ribs.",
     {"decay": {"energy": 0.94}, "sleep_fun": 3, "comfort": 2, "fit": 1}),
    ("ortho", "sleep", "bed", "Orthopaedic mattress", "🛏", 180_000,
     "Firm, even support. You wake up ready, not sore.", {"decay": {"energy": 0.9}, "sleep_fun": 5, "comfort": 3, "fit": 1}),
    ("bedframe", "sleep", "bed", "Wooden bed with orthopaedic mattress", "🪵", 380_000,
     "A carpenter-made frame off the floor, with a good mattress. Feels like home.",
     {"decay": {"energy": 0.87}, "sleep_fun": 7, "comfort": 5, "fit": 1}),
    ("kingbed", "sleep", "bed", "King-size upholstered bed", "👑", 1_200_000,
     "Padded headboard, deep mattress, room to stretch out. Oba-level sleep.",
     {"decay": {"energy": 0.83}, "sleep_fun": 10, "comfort": 8, "fit": 2}),
    ("smartbed", "sleep", "bed", "Memory-foam king bed with massage", "✨", 3_500_000,
     "Memory foam, a massage setting and soft lights under the frame. Nobody on campus sleeps like you.",
     {"decay": {"energy": 0.78}, "sleep_fun": 14, "comfort": 12, "power": True, "bill": 500, "fit": 3}),
    ("bedding", "sleep", "linen", "Fresh bedsheets and pillows", "🛌", 25_000,
     "A matching set and two soft pillows.", {"sleep_fun": 3, "comfort": 1, "fit": 0}),
    ("duvet", "sleep", "linen", "Luxury duvet set", "☁️", 95_000,
     "Hotel-white duvet, four pillows and a throw. Lying in it is a mood.", {"sleep_fun": 6, "comfort": 3, "fit": 1}),
    ("net", "sleep", "net", "Treated mosquito net", "🦟", 9_000,
     "No more slapping yourself at 3 AM.", {"decay": {"energy": 0.97}, "comfort": 1, "fit": 0}),

    # Power & cooling
    ("lamp", "comfort", "lamp", "Rechargeable lamp", "🔦", 9_000,
     "Charge it when there's light; read with it when there isn't.", {"light": "lamp", "fit": 0}),
    ("rfan", "comfort", "fan", "Rechargeable fan", "🪭", 32_000,
     "Runs for hours without light. Hot nights get easier.", {"decay": {"energy": 0.97, "hygiene": 0.95}, "sleep_fun": 2, "comfort": 1, "fit": 0}),
    ("standfan", "comfort", "fan", "Standing fan", "🌀", 45_000,
     "Strong breeze on full speed. Needs light.",
     {"decay": {"energy": 0.95, "hygiene": 0.92}, "sleep_fun": 3, "comfort": 2, "power": True, "bill": 300, "fit": 1}),
    ("ac1", "comfort", "fan", "1HP air conditioner", "❄️", 480_000,
     "Cold room, deep sleep, no sweat. The meter feels it.",
     {"decay": {"energy": 0.9, "hygiene": 0.82, "fun": 0.95}, "sleep_fun": 6, "comfort": 6, "power": True, "bill": 3_000, "fit": 1}),
    ("ac15", "comfort", "fan", "1.5HP inverter AC", "🧊", 850_000,
     "Quiet, very cold and easier on the meter than the old ones.",
     {"decay": {"energy": 0.87, "hygiene": 0.78, "fun": 0.93}, "sleep_fun": 8, "comfort": 8, "power": True, "bill": 2_200, "fit": 2}),
    ("gen_small", "comfort", "power", "Small petrol generator", "⛽", 140_000,
     "The famous 'I better pass my neighbour'. Light when NEPA takes it, but you buy fuel.",
     {"light": "backup", "fuel": 2_500, "fit": 1}),
    ("gen_big", "comfort", "power", "Big petrol generator", "🔌", 520_000,
     "Carries the AC, fridge and TV together. Drinks fuel.", {"light": "backup", "fuel": 4_500, "comfort": 1, "fit": 2}),
    ("inverter", "comfort", "power", "Inverter and batteries", "🔋", 1_100_000,
     "Charges when there's light, carries you when there isn't. No noise, no fuel.",
     {"light": "backup", "comfort": 3, "fit": 1}),
    ("solar", "comfort", "power", "Solar panels with inverter", "☀️", 2_600_000,
     "Panels on the roof, batteries inside. Free light and a much smaller bill.",
     {"light": "backup", "solar": True, "comfort": 4, "fit": 2}),

    # Enjoyment
    ("tv32", "enjoy", "tv", '32" LED TV', "📺", 135_000,
     "Small but sharp. Movies, music videos, the news your dad watches.", {"watch": 14, "comfort": 1, "power": True, "bill": 300, "fit": 1}),
    ("tv43", "enjoy", "tv", '43" smart TV', "📺", 320_000,
     "YouTube and streaming apps built in.", {"watch": 18, "comfort": 2, "power": True, "bill": 400, "fit": 1}),
    ("tv55", "enjoy", "tv", '55" 4K smart TV', "🖥", 650_000,
     "Big enough for movie nights. Football looks like you're in the stadium.",
     {"watch": 22, "comfort": 4, "power": True, "bill": 500, "fit": 2}),
    ("tv75", "enjoy", "tv", '75" QLED TV', "🎬", 1_800_000,
     "A wall of picture. Your friends will start 'checking on you' every weekend.",
     {"watch": 28, "comfort": 7, "power": True, "bill": 700, "fit": 3}),
    ("decoder", "enjoy", "decoder", "Satellite TV decoder", "📡", 40_000,
     "Live football, Big Brother and every channel. Monthly subscription.", {"comfort": 1, "power": True, "bill": 4_000, "fit": 1}),
    ("ps4", "enjoy", "console", "PS4 Slim (fairly used)", "🎮", 280_000,
     "Two pads, FIFA and Mortal Kombat. Still plenty of fun.", {"play": 18, "earn": 2_000, "comfort": 1, "power": True, "bill": 200, "fit": 1}),
    ("ps5", "enjoy", "console", "PS5", "🎮", 950_000,
     "Fast, beautiful and the newest FIFA. Your room becomes the hangout.",
     {"play": 24, "earn": 3_500, "comfort": 3, "power": True, "bill": 300, "fit": 1}),
    ("ps5pro", "enjoy", "console", "PS5 Pro with VR", "🕹", 1_500_000,
     "The best console money can buy, and a VR headset.", {"play": 30, "earn": 4_500, "comfort": 5, "power": True, "bill": 400, "fit": 2}),
    ("speaker", "enjoy", "sound", "Bluetooth speaker", "🔊", 45_000,
     "Loud enough for the whole compound to know your playlist.", {"boost": 4, "comfort": 1, "fit": 0}),
    ("theatre", "enjoy", "sound", "Home theatre system", "🎵", 250_000,
     "Five speakers and a woofer. Movies hit different.", {"boost": 8, "comfort": 2, "power": True, "bill": 200, "fit": 2}),
    ("soundbar", "enjoy", "sound", "Soundbar with subwoofer", "🎶", 600_000,
     "Cinema sound from one slim bar. Clean and loud.", {"boost": 11, "comfort": 4, "power": True, "bill": 200, "fit": 2}),

    # Kitchen
    ("burner", "kitchen", "cooker", "Single-burner gas stove", "🔥", 28_000,
     "Faster than a kerosene stove and no black pots.", {"cook": 0.15, "fit": 1}),
    ("cooker4", "kitchen", "cooker", "4-burner gas cooker with oven", "🍳", 320_000,
     "Rice, stew and plantain all at once. You can even bake.", {"cook": 0.35, "meal": 0.05, "comfort": 2, "fit": 2}),
    ("fridge", "kitchen", "cold", "Fridge", "🧊", 290_000,
     "Cold water, cold drinks and soup that lasts the week.",
     {"meal": 0.1, "comfort": 2, "power": True, "bill": 1_200, "fit": 1}),
    ("freezer", "kitchen", "cold", "Fridge and chest freezer", "❄️", 650_000,
     "Buy chicken and fish in bulk; cook like a proper home.",
     {"meal": 0.18, "comfort": 3, "power": True, "bill": 2_000, "fit": 2}),
    ("microwave", "kitchen", "microwave", "Microwave", "♨️", 95_000,
     "Warm last night's food in two minutes.", {"comfort": 1, "power": True, "bill": 300, "fit": 1}),
    ("blender", "kitchen", "blender", "Blender", "🥤", 35_000,
     "Smoothies, zobo, and pepper for your stew without the grinding stone.", {"meal": 0.03, "power": True, "fit": 1}),
    ("airfryer", "kitchen", "airfryer", "Air fryer", "🍟", 110_000,
     "Crunchy plantain and chicken with almost no oil.", {"meal": 0.05, "comfort": 1, "power": True, "bill": 300, "fit": 1}),

    # Bath and laundry
    ("drum", "bath", "water", "Big water drum", "🛢", 18_000,
     "Fill it when water runs. When the taps are dry, you still bathe for free.", {"water": True, "fit": 1}),
    ("tank", "bath", "water", "Overhead tank and pumping machine", "🚰", 420_000,
     "Your own tank on a stand. Running water every day.", {"water": True, "bath": {"fun": 4}, "comfort": 3, "power": True, "bill": 300, "fit": 2}),
    ("heater", "bath", "heater", "Instant water heater", "♨️", 85_000,
     "A hot shower on a cold harmattan morning.", {"bath": {"energy": 6, "fun": 6}, "comfort": 2, "power": True, "bill": 600, "fit": 2}),
    ("toiletries", "bath", "vanity", "Mirror, shelf and nice toiletries", "🪞", 35_000,
     "Good soap, lotion and perfume, all in one place.", {"decay": {"hygiene": 0.92}, "bath": {"fun": 3}, "comfort": 1, "fit": 1}),
    ("washer", "bath", "laundry", "Washing machine", "🧺", 380_000,
     "No more Saturday hand-washing. Your clothes always smell fresh.",
     {"decay": {"hygiene": 0.85}, "comfort": 3, "power": True, "bill": 500, "fit": 2}),

    # Living room
    ("sofa3", "living", "sofa", "3-seater fabric sofa", "🛋", 220_000,
     "Somewhere for visitors to sit that isn't your bed.", {"comfort": 3, "fit": 1}),
    ("sofaL", "living", "sofa", "L-shaped sofa set", "🛋", 650_000,
     "Sits six. Movie nights are now officially at your place.", {"comfort": 5, "fit": 2}),
    ("leather", "living", "sofa", "Italian leather sofa set", "💺", 2_200_000,
     "Cream leather and a glass centre table. Your landlord is now scared of you.", {"comfort": 9, "fit": 3}),
    ("rug", "living", "rug", "Soft rug", "🟥", 30_000, "Warm under your feet; it ties the room together.", {"comfort": 1, "fit": 1}),
    ("curtains", "living", "curtains", "Curtains and blinds", "🪟", 45_000,
     "Keeps the morning sun out so you sleep in.", {"sleep_fun": 2, "comfort": 1, "fit": 1}),
    ("art", "living", "decor", "Wall art and LED strips", "🖼", 38_000,
     "Frames, a neon sign and colour-changing lights. Your room has a vibe.", {"decay": {"fun": 0.96}, "comfort": 2, "fit": 0}),
    ("plants", "living", "plants", "Indoor plants", "🪴", 20_000, "Snake plant and a small palm. Cleaner air, calmer you.",
     {"decay": {"fun": 0.98}, "comfort": 1, "fit": 1}),

    # Study and work
    ("desk", "study", "desk", "Reading table and chair", "🪑", 55_000,
     "A proper table, a lamp and a chair that isn't plastic.", {"study": 0.1, "learn": 0.05, "comfort": 1, "fit": 1}),
    ("ergo", "study", "desk", "Big desk and ergonomic chair", "💺", 260_000,
     "Hours of reading without back pain. Feels like an office.", {"study": 0.18, "learn": 0.12, "comfort": 2, "fit": 1}),
    ("standing", "study", "desk", "Standing desk and monitor", "🖥", 520_000,
     "A second screen, a desk that rises and falls. Coders' dream.", {"study": 0.22, "learn": 0.2, "comfort": 3, "power": True, "fit": 2}),
    ("shelf", "study", "shelf", "Bookshelf", "📚", 40_000, "Your textbooks and handouts, finally off the floor.", {"study": 0.05, "comfort": 1, "fit": 1}),
    ("router", "study", "net_box", "Unlimited Wi-Fi router", "📶", 75_000,
     "Fast internet at home. Tutorials load, gigs get done.", {"learn": 0.1, "comfort": 1, "power": True, "bill": 5_000, "fit": 1}),

    # Security
    ("padlock", "security", "lock", "Heavy padlock and burglary-proof bars", "🔐", 25_000,
     "The cheapest way to stop a break-in.", {"theft": 0.7, "fit": 0}),
    ("steeldoor", "security", "door", "Steel security door", "🚪", 180_000,
     "Thieves will try your neighbour instead.", {"theft": 0.45, "comfort": 1, "fit": 1}),
    ("cctv", "security", "camera", "CCTV camera on your phone", "📹", 260_000,
     "Watch your room from your phone. Thieves hate cameras.", {"theft": 0.55, "comfort": 1, "power": True, "bill": 300, "fit": 1}),
]
FURNITURE = {fid: {"id": fid, "cat": cat, "slot": slot, "name": name, "emoji": emoji, "price": price, "blurb": blurb, **fx}
             for fid, cat, slot, name, emoji, price, blurb, fx in _FURNITURE}
FURNITURE_RESALE = 0.4        # a used-furniture buyer pays 40% of the price
FURNISH_HOURS = (H(7), H(21))  # shops deliver and install from 7 AM to 9 PM
FURNITURE_TIERS = {}          # slot -> item ids from cheapest to dearest
for _f in FURNITURE.values():
    FURNITURE_TIERS.setdefault(_f["slot"], []).append(_f["id"])
for _ids in FURNITURE_TIERS.values():
    _ids.sort(key=lambda i: FURNITURE[i]["price"])
COMFORT_LEVELS = [(30, "dream_home"), (12, "cosy_home")]   # comfort points for each feeling

# Things you can do at home once you have the right things
ACTIONS += [
    {"id": "watch_tv", "at": "home", "label": "Watch TV", "hours": [(0, H(24))], "minutes": 60, "effects": {"fun": 14},
     "requires": {"furnish": ["tv"]}, "special": "watch_tv",
     "blurb": "Nollywood, music videos or a series. A bigger TV and good sound make it more fun.",
     "done": "You watched TV and forgot about school for an hour."},
    {"id": "watch_football", "at": "home", "label": "Watch live football", "hours": [(H(13), H(23))], "minutes": 120,
     "days": WEEKEND, "effects": {"fun": 24, "social": 8, "energy": -4}, "requires": {"furnish": ["tv", "decoder"]},
     "special": "watch_tv", "blurb": "Premier League on your own decoder. Your neighbours come to watch.",
     "done": "Full time! You and your neighbours shouted the whole compound down."},
    {"id": "play_console", "at": "home", "label": "Play PlayStation", "hours": [(0, H(24))], "minutes": 60,
     "effects": {"fun": 18, "energy": -3}, "requires": {"furnish": ["tv", "console"]}, "special": "play_console",
     "blurb": "FIFA, Mortal Kombat or a story game. One more match. Okay, one more.",
     "done": "Gaming session done. You definitely won more than you lost."},
    {"id": "fifa_centre", "at": "home", "label": "Run a FIFA centre for the street", "hours": [(H(12), H(22))], "minutes": 180,
     "once_per_day": True, "effects": {"social": 12, "fun": 6, "energy": -10}, "requires": {"furnish": ["tv", "console"]},
     "special": "fifa_centre", "hustle": True,
     "blurb": "₦300 a match. The boys from your street queue at your door with their own pads."},
    {"id": "movie_night", "at": "home", "label": "Host a movie night", "hours": [(H(18), H(24))], "minutes": 150,
     "once_per_day": True, "cost": 3_000, "effects": {"social": 26, "fun": 20, "hunger": 12},
     "requires": {"furnish": ["tv", "sofa"]}, "special": "watch_tv",
     "blurb": "Popcorn, chin-chin and a big movie. Your friends fill the sofa.",
     "done": "Movie night was a hit. Everyone wants to come back next week."},
    {"id": "host_friends", "at": "home", "label": "Invite friends over to hang out", "hours": [(H(10), H(23))], "minutes": 90,
     "effects": {"social": 22, "fun": 10}, "requires": {"furnish": ["sofa"]},
     "blurb": "Drinks, music and gist on your sofa.", "done": "Your friends stayed till late. Your place is the spot now."},
    {"id": "ac_chill", "at": "home", "label": "Relax in the AC", "hours": [(0, H(24))], "minutes": 30,
     "effects": {"energy": 8, "fun": 8, "hygiene": 4}, "requires": {"furnish": ["fan:ac"]},
     "blurb": "Lie down in the cold room. The Ife sun can't reach you here.", "done": "Cool, calm and recharged."},
    {"id": "cold_drink", "at": "home", "label": "Drink something cold from the fridge", "hours": [(0, H(24))], "minutes": 5,
     "cost": 300, "effects": {"fun": 8, "hunger": 4, "energy": 3}, "requires": {"furnish": ["cold"]},
     "blurb": "Chilled malt or zobo from your own fridge.", "done": "Ice cold. Exactly what you needed."},
    {"id": "warm_leftovers", "at": "home", "label": "Warm leftovers in the microwave", "hours": [(0, H(24))], "minutes": 5,
     "once_per_day": True, "effects": {"hunger": 30}, "requires": {"furnish": ["microwave"]},
     "blurb": "Last night's food, hot in two minutes. Once a day.", "done": "Leftovers, hot and tasty. Zero effort."},
    {"id": "smoothie", "at": "home", "label": "Blend a fruit smoothie", "hours": [(0, H(24))], "minutes": 10, "cost": 1_200,
     "effects": {"hunger": 16, "fun": 6, "energy": 4}, "requires": {"furnish": ["blender"]},
     "blurb": "Banana, pineapple, watermelon and ice.", "done": "Fresh smoothie. You feel healthy."},
    {"id": "air_fry", "at": "home", "label": "Air-fry plantain chips", "hours": [(0, H(24))], "minutes": 15,
     "effects": {"hunger": 22, "fun": 6}, "requires": {"furnish": ["airfryer"], "food": {"plantain": 1}}, "special": "recipe",
     "blurb": "Crunchy plantain with almost no oil. Needs a plantain.", "done": "Crunchy, golden and gone in 2 minutes."},
]
ACTIONS_BY_ID = {a["id"]: a for a in ACTIONS}
# More ways to get ready for exams (about +10 readiness each, before your mood and tiredness scale it)
# and more ways to have fun and see people.
ACTIONS += [
    {"id": "past_qs_phone", "at": "phone", "label": "Work through past questions on your phone", "hours": [(0, H(24))],
     "minutes": 60, "cost": 300, "pay": "any", "requires": {"smartphone": True},
     "effects": {"prep": 10, "energy": -6, "fun": -2}, "study": True,
     "blurb": "Old exam papers with the answers explained. Your data bundle pays for it."},
    {"id": "revise_laptop", "at": "laptop", "label": "Revise your course notes on your laptop", "hours": [(H(8), H(26))],
     "minutes": 120, "effects": {"prep": 10, "energy": -8}, "study": True,
     "blurb": "Typed notes, flashcards and a timer. Your laptop never gets tired."},
    {"id": "office_hours", "at": "dept", "label": "Ask your lecturer in office hours", "hours": [(H(10), H(16))],
     "minutes": 60, "effects": {"prep": 10, "social": 4, "energy": -5}, "study": True,
     "blurb": "Bring the questions you couldn't answer in class. They'll answer, if you're polite."},
    {"id": "senior_drill", "at": "dept", "label": "Past-questions drill with a senior", "hours": [(H(12), H(19))],
     "minutes": 90, "effects": {"prep": 10, "social": 8, "energy": -8}, "study": True,
     "blurb": "A 400-level student who scored an A shows you how the questions really come."},
    {"id": "home_timetable", "at": "home", "label": "Make a revision timetable at home", "hours": [(0, H(24))],
     "minutes": 45, "effects": {"prep": 10, "energy": -4, "fun": -3}, "study": True,
     "blurb": "Plan each course, each day. A plan you can see is half the battle."},
    {"id": "mock_exam", "at": "home", "label": "Mock exam with your roommates", "hours": [(H(18), H(24))],
     "minutes": 90, "once_per_day": True, "effects": {"prep": 10, "energy": -10, "social": 6}, "study": True,
     "blurb": "Timed questions, no notes, and whoever scores lowest buys the chin-chin.",
     "done": "Timed and marked. You know exactly where you're weak now."},

    {"id": "buka_drinks", "at": "buka", "label": "Suya and cold drinks with friends", "hours": [(H(17), H(23))],
     "minutes": 90, "cost": 1_500, "effects": {"social": 20, "fun": 16, "hunger": 8, "energy": -4},
     "blurb": "Suya, pepper, cold Chapman and everybody's gist at once.", "done": "The table was loud and the suya was perfect."},
    {"id": "card_game", "at": "home", "label": "Play cards with roommates", "hours": [(H(18), H(25))],
     "minutes": 45, "effects": {"social": 12, "fun": 14, "energy": -2},
     "blurb": "Ludo, whot or cards. Somebody always cheats.", "done": "Cards, laughter and an argument about the last trick."},
    {"id": "table_tennis", "at": "sub", "label": "Table tennis at the SUB", "hours": [(H(11), H(20))],
     "minutes": 40, "cost": 200, "effects": {"fun": 14, "social": 10, "energy": -6, "hygiene": -4},
     "blurb": "Two bats, one ball that's seen better days.", "done": "Winner stays on. You stayed on."},
    {"id": "karaoke", "at": "sub", "label": "Karaoke night at the SUB", "hours": [(H(19), H(23))], "minutes": 120,
     "days": FRI_SAT, "cost": 1_000, "effects": {"fun": 35, "social": 22, "energy": -10},
     "blurb": "Everybody thinks they can sing. Some of them can.",
     "done": "You sang with the whole SUB. Nobody will forget it."},
    {"id": "pepper_soup", "at": "buka", "label": "Pepper soup night with your hall friends", "hours": [(H(19), H(24))],
     "minutes": 60, "cost": 1_200, "effects": {"social": 18, "fun": 10, "hunger": 30},
     "blurb": "Catfish or goat meat, hot enough to make you cry, and the gist that follows.",
     "done": "Full stomach, full gist, and the soup was too hot to finish."},
    {"id": "campus_stroll", "at": "sub", "label": "Stroll round campus with a friend", "hours": [(H(17), H(20))],
     "minutes": 40, "effects": {"social": 10, "fun": 8, "energy": -4},
     "blurb": "Cool evening air, a friend and the day's news.", "done": "A long walk and better mood."},
]
ACTIONS_BY_ID = {a["id"]: a for a in ACTIONS}
MOODLETS = globals().get("MOODLETS", {})
