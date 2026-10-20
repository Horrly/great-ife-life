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
HALLS = {"male": ["awo", "fajuyi", "etf", "akintola", "angola"], "female": ["moremi", "mozambique"]}
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
             "Enyimba", "Shooting Stars", "Rangers", "Kano Pillars", "Remo Stars", "Sunshine Stars", "PSG", "Bayern"]

# Each course has a faculty building (classrooms, study groups) and lecture theatres it uses.
# Tests and exams are written in "exams".
DEPARTMENTS = {
    "csc": {"name": "Computer Science", "code": "CSC", "difficulty": -3, "faculty": "tech",
            "venues": ["tech", "techlt", "thousand"], "exams": "thousand"},
    "ecn": {"name": "Economics", "code": "ECN", "difficulty": -1, "faculty": "socsci",
            "venues": ["socsci", "odlt", "thousand"], "exams": "odlt"},
    "acc": {"name": "Accounting", "code": "ACC", "difficulty": -2, "faculty": "socsci",
            "venues": ["socsci", "ajose", "odlt"], "exams": "ajose"},
    "mcb": {"name": "Microbiology", "code": "MCB", "difficulty": -2, "faculty": "science",
            "venues": ["science", "booc", "thousand"], "exams": "booc"},
    "pol": {"name": "Political Science", "code": "POL", "difficulty": 0, "faculty": "socsci",
            "venues": ["socsci", "odlt", "ajose"], "exams": "odlt"},
    "eng": {"name": "English", "code": "ENG", "difficulty": 1, "faculty": "arts",
            "venues": ["arts", "ajose", "odlt"], "exams": "ajose"},
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
    {"id": "sleep", "at": "home", "label": "Sleep", "hours": [(H(20), H(32))], "minutes": "sleep",
     "effects": {}, "special": "sleep", "blurb": "Lights off till your alarm. Sleep takes real hours.", "done": "You slept like a baby."},
    {"id": "nap", "at": "home", "label": "Nap (1 hour)", "hours": [(H(9), H(20))], "minutes": 60,
     "effects": {"energy": 14, "fun": 2}, "blurb": "Just one hour. (It's never one hour.)", "done": "Short nap. You feel better."},
    {"id": "bath", "at": "home", "label": "Have a bath", "hours": [(H(5), H(24))], "minutes": 20,
     "effects": {"hygiene": 60, "energy": 3}, "special": "bath", "blurb": "Fetch water, bathe, feel like a person again.",
     "done": "Fresh. You feel like a person again."},
    {"id": "cook", "at": "home", "label": "Cook noodles and egg", "hours": [(H(6), H(24))], "minutes": 40, "cost": 600,
     "effects": {"hunger": 40}, "special": "cook",
     "blurb": "Two packs, one egg, zero shame. Free if you have foodstuff from the market.",
     "done": "Noodles and egg: chef of the year."},
    {"id": "garri", "at": "home", "label": "Soak garri", "hours": [(0, H(24))], "minutes": 10,
     "effects": {"hunger": 28, "fun": 2}, "requires": {"pantry": 1}, "special": "use_pantry",
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
     "effects": {"prep": 16, "energy": -20, "fun": -6}, "study": True,
     "blurb": "Night reading room till 5 AM. Coffee is a food group."},

    # --- Amphitheatre
    {"id": "tutorial", "at": "amphi", "label": "Attend tutorial class", "hours": [(H(17), H(18, 30))], "minutes": 120,
     "cost": 1_000, "effects": {"prep": 13, "energy": -6}, "study": True,
     "blurb": "A 400-level 'tutorial master' explains the whole course in 2 hours."},
    {"id": "teach_tutorial", "once_per_day": True, "at": "amphi", "label": "Run your own tutorial", "hours": [(H(17), H(19))], "minutes": 120,
     "earn": 4_000, "effects": {"prep": 4, "energy": -12, "social": 10}, "hustle": True,
     "requires": {"min_prep": 60}, "skill": "tutoring", "xp": 10,
     "blurb": "You know this course well enough to charge for it."},

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
    {"id": "foodstuff", "at": "market", "label": "Buy foodstuff", "hours": [(H(7), H(20, 30))], "minutes": 30,
     "cost": 4_500, "effects": {"energy": -3}, "special": "foodstuff",
     "blurb": "Garri, rice, noodles, eggs and pepper: six meals' worth. Cheaper than buying food every time."},
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

# --- Businesses: pay out every night after costs (like Lagos Life). Some days are bad days.
BUSINESSES = {
    "kiosk": {"name": "Data and recharge kiosk", "price": 30_000, "income": (500, 1_200),
              "bad_chance": 0.10, "bad_loss": 400, "bad_text": "The network was down all day. No sales.",
              "blurb": "A table, an umbrella and every network's cards. Students always need data."},
    "printer": {"name": "Printing and typing stand", "price": 60_000, "income": (1_000, 2_600), "exam_boost": 1.6,
                "bad_chance": 0.12, "bad_loss": 1_000, "bad_text": "The printer jammed. Repairs cost you.",
                "blurb": "Projects, assignments and past questions. Busiest just before exams."},
    "food": {"name": "Food stall at the hall junction", "price": 150_000, "income": (2_500, 6_000),
             "bad_chance": 0.15, "bad_loss": 3_000, "bad_text": "NEPA took light and your stock spoiled.",
             "blurb": "Jollof, plantain and late-night noodles. Big money, big risk."},
}
BUSINESSES.update({
    "chinchin": {"name": "Chin-chin supply to hall shops", "price": 20_000, "income": (400, 1_000),
                 "bad_chance": 0.10, "bad_loss": 500, "bad_text": "A whole batch got soft in the rain.",
                 "blurb": "You fry, a younger student delivers to the hall shops."},
    "cobbler": {"name": "Shoe repair stand at Ojaja", "price": 35_000, "income": (600, 1_500),
                "bad_chance": 0.10, "bad_loss": 600, "bad_text": "Your apprentice glued a sole on backwards.",
                "blurb": "An umbrella, a stool and an apprentice."},
    "barbershop": {"name": "Barbing salon at Ojaja", "price": 90_000, "income": (1_500, 3_500),
                   "bad_chance": 0.12, "bad_loss": 1_500, "bad_text": "NEPA took light; the generator drank your profit.",
                   "blurb": "Two chairs, a mirror, a generator and loud music."},
})
BUSINESS_RESALE = 0.6

for _bid, _b in BUSINESSES.items():
    ACTIONS.append({"id": f"buy_{_bid}", "at": "phone", "label": f"Start a {_b['name'].lower()}",
                    "hours": [(H(8), H(18))], "minutes": 60, "cost": _b["price"], "effects": {"energy": -6},
                    "special": "buy_business", "business": _bid,
                    "blurb": f"{_b['blurb']} Makes about ₦{_b['income'][0]:,} to ₦{_b['income'][1]:,} a day."})
    ACTIONS.append({"id": f"sell_{_bid}", "at": "phone", "label": f"Sell your {_b['name'].lower()}",
                    "hours": [(H(8), H(18))], "minutes": 30, "effects": {}, "special": "sell_business", "business": _bid,
                    "blurb": f"Get ₦{int(_b['price'] * BUSINESS_RESALE):,} back (60% of what you paid)."})

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
        "id": "stove", "title": "The porter seized your stove", "weight": 0, "when": "cook",
        "text": "Cooking in the hall is not allowed. The porter has taken your burner to the hall office.",
        "choices": [{"label": "Pay the fine and collect it (₦1,000)", "cost": 1_000, "effects": {"fun": -6},
                     "result": "Lesson learned. Cook quietly."}],
    },
    {
        "id": "free_food", "title": "Free food at a departmental event", "weight": 5, "when": "day",
        "text": "Your department is hosting a seminar. The real attraction: jollof rice for attendees.",
        "choices": [
            {"label": "Attend for the jollof", "effects": {"hunger": 45, "social": 10, "prep": 3},
             "result": "Learned something, ate something."},
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
    "skin": ["#8d5524", "#a86b3c", "#6b3e1f", "#c68642", "#4a2a14"],
    "hair": ["low_cut", "afro", "braids", "bun", "dreads", "bald"],
    "top": ["#1f6f4a", "#b03a2e", "#f2c230", "#2f5f9e", "#f4f4f2", "#222222", "#7a3e9d"],
    "bottom": ["#26324a", "#3b3b3b", "#6b4f2a", "#e8e2d4", "#1f6f4a"],
    "style": ["trousers", "skirt"],
    "hall": ["male", "female"],   # which halls you can live in
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
        {"id": "garri", "label": "Soak garri or cook", "kind": "action", "ids": ["garri", "cook"]},
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
}

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
QUIZZES = {
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
