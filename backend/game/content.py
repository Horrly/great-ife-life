"""Everything players see: profiles, departments, places, actions and events.

Edit this file to add campus jokes, places and events. The engine (engine.py) reads it.
Effects use these keys: money (naira), hunger, energy, hygiene, fun, social (needs, 0-100,
higher is better) and prep (how ready you are for this semester's tests and exams, 0-100).
"""

SLOTS = ["Morning", "Afternoon", "Evening", "Night"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NEEDS = ["hunger", "energy", "hygiene", "fun", "social"]

SEMESTER_DAYS = 10          # Mon..Sun, Mon..Wed
CA_TEST_DAY = 4             # Thursday of week one, morning
EXAM_DAYS = (9, 10)         # Tuesday and Wednesday of week two, mornings
SEMESTERS = 8               # 100 to 400 level, two semesters each
MAX_EXTRA_SEMESTERS = 2     # "extra year" to clear carryovers
COURSES_PER_SEMESTER = 5
MAX_CARRYOVERS_PER_SEMESTER = 4  # the rest wait for a later semester
SCHOOL_CHARGES = 10_000

# Hourly decay of needs, applied after every action (one time slot passes).
DECAY = {"hunger": -7, "energy": -5, "hygiene": -4, "fun": -3, "social": -2}

PROFILES = {
    "staff_pikin": {
        "name": "Staff Pikin",
        "tagline": "Your daddy is a lecturer. You live in the staff quarters and everybody knows your surname.",
        "home": "Staff quarters",
        "money": 40_000,
        "allowance": 20_000,
        "fees_covered": True,
        "perks": ["Free food at home once a day", "School charges paid by Daddy"],
    },
    "scholarship": {
        "name": "Scholarship Kid",
        "tagline": "You got in on brains. A foundation pays your stipend, as long as your CGPA stays at 3.50 or above.",
        "home": "Moremi Hall",
        "money": 18_000,
        "allowance": 12_000,
        "fees_covered": True,
        "study_bonus": 0.25,
        "perks": ["Study 25% faster", "Stipend stops if CGPA drops below 3.50"],
    },
    "hustler": {
        "name": "Hustler Fresher",
        "tagline": "Nobody is sending you money. You came with one bag, a phone with a cracked screen and big dreams.",
        "home": "Awo Hall",
        "money": 8_000,
        "allowance": 0,
        "fees_covered": False,
        "hustle_bonus": 0.5,
        "study_bonus": 0.2,
        "perks": ["Hustles pay 50% more", "Struggle made you sharp: study 20% faster", "You pay your own school charges"],
    },
    "off_campus": {
        "name": "Off-Campus Student",
        "tagline": "No hall space, so you squat in a self-con in town. Freedom, but every trip to campus costs money.",
        "home": "Self-con in town",
        "money": 15_000,
        "allowance": 10_000,
        "fees_covered": False,
        "transport": 300,
        "perks": ["Your own room, cook anytime", "₦300 transport on days you go to campus"],
    },
}

DEPARTMENTS = {
    "csc": {"name": "Computer Science", "code": "CSC", "difficulty": -3},
    "ecn": {"name": "Economics", "code": "ECN", "difficulty": -1},
    "acc": {"name": "Accounting", "code": "ACC", "difficulty": -2},
    "mcb": {"name": "Microbiology", "code": "MCB", "difficulty": -2},
    "pol": {"name": "Political Science", "code": "POL", "difficulty": 0},
    "eng": {"name": "English", "code": "ENG", "difficulty": 1},
}

PLACES = {
    "room": {"name": "Your room", "blurb": "Home base. Bed, bucket, and a roommate who never sleeps."},
    "faculty": {"name": "Faculty", "blurb": "Lecture theatres. Come early or stand at the back."},
    "hol": {"name": "HOL", "blurb": "Hezekiah Oluwasanmi Library. Quiet, cold, and full before 9am."},
    "amphi": {"name": "Amphitheatre", "blurb": "Tutorials in the evening, gist all day."},
    "buka": {"name": "Buka", "blurb": "Amala, ewedu and gbegiri. The best value on campus."},
    "sub": {"name": "SUB", "blurb": "Student Union Building: business centre, snacks and everybody's business."},
    "senate": {"name": "Senate Building", "blurb": "Forms, stamps and very long queues."},
    "oduduwa": {"name": "Oduduwa Hall", "blurb": "Shows, concerts and the big weekend events."},
    "sports": {"name": "Sports Complex", "blurb": "Football, athletics and evening workouts."},
    "phone": {"name": "Phone", "blurb": "Hustles, calls home and doomscrolling."},
    "skills": {"name": "Learn a skill", "blurb": "Every gig you do and every hour you practise levels you up. Higher levels pay more and unlock bigger jobs."},
    "biz": {"name": "Businesses", "blurb": "Invest your money. Businesses pay out every night, but some days are bad days. Selling gets you back 60%."},
}

ALL_DAYS = "all"
WEEKDAYS_ONLY = "weekdays"
WEEKEND = "weekend"
FRI_SAT = "fri_sat"

# slots: which time slots it is available (0 Morning .. 3 Night)
ACTIONS = [
    # --- Your room
    {"id": "sleep", "done": "You slept like a baby.", "place": "room", "label": "Sleep", "slots": [3], "effects": {"energy": 60, "hunger": -4},
     "blurb": "A proper night's sleep. Morning comes fast."},
    {"id": "nap", "done": "Short nap. You feel better.", "place": "room", "label": "Nap", "slots": [0, 1, 2], "effects": {"energy": 22, "fun": 2},
     "blurb": "Just 30 minutes. (It's never 30 minutes.)"},
    {"id": "bath", "done": "Fresh. You feel like a person again.", "place": "room", "label": "Have a bath", "slots": [0, 1, 2, 3], "effects": {"hygiene": 60, "energy": 3},
     "blurb": "Fetch water, bathe, feel like a person again.", "special": "bath"},
    {"id": "home_food", "done": "Mummy's pot did not disappoint.", "place": "room", "label": "Eat at home", "slots": [0, 1, 2], "effects": {"hunger": 60, "social": 5},
     "blurb": "Mummy's pot. Free, and with extra meat.", "profiles": ["staff_pikin"], "once_per_day": True},
    {"id": "cook", "done": "Noodles and egg: chef of the year.", "place": "room", "label": "Cook noodles and egg", "slots": [0, 1, 2, 3], "cost": 500,
     "effects": {"hunger": 38}, "blurb": "Two packs, one egg, zero shame.", "special": "cook"},
    {"id": "read_room", "place": "room", "label": "Read in your room", "slots": [1, 2, 3],
     "effects": {"prep": 6, "energy": -8, "fun": -5}, "blurb": "Your bed is right there. Focus.", "study": True,
     "special": "read_room"},
    {"id": "gist", "done": "You gisted until somebody said 'we should sleep'.", "place": "room", "label": "Gist with roommates", "slots": [2, 3],
     "effects": {"social": 22, "fun": 12, "energy": -4}, "blurb": "Who is dating who, who failed what."},

    # --- Faculty
    {"id": "lecture", "place": "faculty", "label": "Attend lecture", "slots": [0, 1], "days": WEEKDAYS_ONLY,
     "effects": {"prep": 6, "energy": -8, "social": 4}, "blurb": "Sign the attendance sheet. It counts.",
     "study": True, "special": "lecture", "campus": True},
    {"id": "study_group", "place": "faculty", "label": "Study group", "slots": [1, 2],
     "effects": {"prep": 8, "social": 10, "energy": -10}, "blurb": "Half studying, half gisting. Still counts.",
     "study": True, "campus": True, "skill": "tutoring", "xp": 3},

    # --- HOL
    {"id": "hol_read", "place": "hol", "label": "Read at HOL", "slots": [0, 1, 2],
     "effects": {"prep": 11, "energy": -12, "fun": -8}, "blurb": "Find a seat, guard your seat, read.",
     "study": True, "campus": True},
    {"id": "hol_tdb", "place": "hol", "label": "Read till dawn (TDB)", "slots": [3],
     "effects": {"prep": 15, "energy": -28, "fun": -6}, "blurb": "Night reading room. Coffee is a food group.",
     "study": True, "campus": True},

    # --- Amphitheatre
    {"id": "tutorial", "place": "amphi", "label": "Attend tutorial class", "slots": [2], "cost": 1_000,
     "effects": {"prep": 14, "energy": -8}, "blurb": "A 400-level 'tutorial master' explains the whole course in 2 hours.",
     "study": True, "campus": True},
    {"id": "teach_tutorial", "place": "amphi", "label": "Run your own tutorial", "slots": [2], "earn": 4_000,
     "effects": {"prep": 4, "energy": -15, "social": 10}, "blurb": "You know this course well enough to charge for it.",
     "hustle": True, "campus": True, "requires": {"min_prep": 60}, "skill": "tutoring", "xp": 10},

    # --- Buka
    {"id": "amala", "done": "Amala hit the spot.", "place": "buka", "label": "Amala, ewedu and gbegiri", "slots": [0, 1, 2], "cost": 900,
     "effects": {"hunger": 55, "social": 4, "fun": 4}, "blurb": "Add meat? That's another conversation.", "campus": True},
    {"id": "rice", "done": "Rice and beans. Reliable as ever.", "place": "buka", "label": "Rice and beans", "slots": [0, 1, 2], "cost": 600,
     "effects": {"hunger": 42}, "blurb": "Reliable. Like your one friend who always comes to class.", "campus": True},

    # --- SUB
    {"id": "snacks", "done": "Gala and a drink. It will hold you.", "place": "sub", "label": "Buy snacks", "slots": [0, 1, 2], "cost": 350,
     "effects": {"hunger": 18, "fun": 3}, "blurb": "Gala and a cold drink.", "campus": True},
    {"id": "hangout", "done": "SUB was buzzing. You caught up with everyone.", "place": "sub", "label": "Hang out at SUB", "slots": [1, 2], "cost": 300,
     "effects": {"social": 22, "fun": 14, "energy": -5}, "blurb": "See and be seen.", "campus": True},
    {"id": "business_centre", "place": "sub", "label": "Work at a business centre", "slots": [0, 1],
     "days": WEEKDAYS_ONLY, "earn": 2_200, "effects": {"energy": -18, "fun": -6},
     "blurb": "Typing, printing, binding. Somebody's project is always due today.", "hustle": True, "campus": True},

    # --- Senate
    {"id": "clearance", "done": "Two hours on the queue. One stamp. Victory.", "place": "senate", "label": "Queue for course registration clearance", "slots": [0, 1],
     "days": WEEKDAYS_ONLY, "effects": {"energy": -12, "fun": -12, "social": 6},
     "blurb": "Nobody knows why you need this stamp. You need this stamp.", "campus": True},

    # --- Oduduwa Hall
    {"id": "show", "done": "What a night at Oduduwa Hall!", "place": "oduduwa", "label": "Go to a show", "slots": [2], "days": FRI_SAT, "cost": 1_500,
     "effects": {"fun": 45, "social": 25, "energy": -15}, "blurb": "Drama, music, and everybody dressed to kill.",
     "campus": True},

    # --- Sports complex
    {"id": "football", "done": "Ninety minutes of departmental glory.", "place": "sports", "label": "Play football", "slots": [2], "effects": {
        "fun": 28, "social": 12, "energy": -20, "hygiene": -25, "hunger": -8}, "blurb": "Departmental match. Bragging rights only.",
     "campus": True},
    {"id": "jog", "done": "A few laps round the track.", "place": "sports", "label": "Evening jog", "slots": [0, 2], "effects": {
        "fun": 12, "energy": -12, "hygiene": -15}, "blurb": "Round the track while the sun goes down.", "campus": True},

    # --- Phone (anywhere)
    {"id": "sell_data", "place": "phone", "label": "Sell data bundles", "slots": [0, 1, 2, 3],
     "effects": {"energy": -5, "social": 3}, "blurb": "Your hall's unofficial data plug.", "hustle": True,
     "special": "sell_data"},
    {"id": "braids", "place": "phone", "label": "Braid hair for a client", "slots": [1, 2], "earn": 3_500,
     "effects": {"energy": -22, "fun": -4, "social": 8}, "blurb": "Four hours, two cramps, one happy client.",
     "hustle": True, "skill": "hair", "xp": 8},
    {"id": "design_gig", "place": "phone", "label": "Design a flyer", "slots": [1, 2, 3], "earn": 2_500,
     "effects": {"energy": -14, "fun": 4}, "blurb": "Birthday flyer for a 200-level 'celebrity'.", "hustle": True,
     "skill": "design", "xp": 8},
    {"id": "pay_fees", "place": "phone", "label": "Pay school charges on the portal", "slots": [0, 1, 2, 3],
     "effects": {"fun": -5}, "blurb": "Without this, no exam card. No exam card, no exams.", "special": "pay_fees"},
    {"id": "call_home", "place": "phone", "label": "Call home for money", "slots": [0, 1, 2],
     "effects": {"social": 6}, "blurb": "'Mummy, the textbook is ₦8,000.' Once a week.", "special": "call_home"},
    {"id": "scroll", "done": "You scrolled. Time disappeared.", "place": "phone", "label": "Scroll social media", "slots": [0, 1, 2, 3],
     "effects": {"fun": 14, "energy": -3, "prep": -1}, "blurb": "Five minutes. Two hours later..."},
]

# --- Skills: like careers in Lagos Life, five levels each. Higher levels pay more and unlock bigger gigs.
SKILLS = {
    "design": {"name": "Graphic design"},
    "coding": {"name": "Coding"},
    "hair": {"name": "Hairdressing"},
    "content": {"name": "Content creation"},
    "tutoring": {"name": "Teaching"},
}
SKILL_LEVELS = [0, 30, 80, 160, 280]   # XP needed for levels 1..5
SKILL_PAY_PER_LEVEL = 0.25            # each level above 1 adds 25% to that skill's gigs

ACTIONS += [
    # Practice: costs time (and sometimes data), earns XP
    {"id": "learn_design", "place": "skills", "label": "Practise design on Canva", "slots": [1, 2, 3], "cost": 200,
     "effects": {"energy": -10, "fun": 2}, "skill": "design", "xp": 12, "learn": True,
     "blurb": "Recreate posters you like until yours look better.", "done": "Two hours on Canva. Your eye is getting sharper."},
    {"id": "learn_coding", "place": "skills", "label": "Follow a coding tutorial", "slots": [0, 1, 2, 3], "cost": 300,
     "effects": {"energy": -12, "fun": -2}, "skill": "coding", "xp": 12, "learn": True,
     "blurb": "YouTube, free courses and a lot of error messages.", "done": "Your code finally ran. You feel unstoppable."},
    {"id": "learn_hair", "place": "skills", "label": "Practise braids on a mannequin", "slots": [1, 2], "cost": 500,
     "effects": {"energy": -10, "social": 2}, "skill": "hair", "xp": 12, "learn": True,
     "blurb": "Knotless, cornrows, Ghana weaving. Practice makes neat.", "done": "Neater parting than last week."},
    {"id": "skit", "place": "skills", "label": "Shoot and post a skit", "slots": [1, 2], "cost": 0,
     "effects": {"energy": -10, "fun": 12, "social": 6}, "skill": "content", "xp": 10, "learn": True, "special": "skit",
     "blurb": "You, your roommate and a ring light. Will it blow?"},

    # Bigger gigs that need a skill level
    {"id": "bug_fix", "place": "phone", "label": "Fix bugs for a startup", "slots": [1, 2, 3], "earn": 6_000,
     "effects": {"energy": -20, "fun": -4}, "skill": "coding", "xp": 10, "min_level": 2, "hustle": True,
     "blurb": "Remote gig for a Lagos startup. They pay on time. Mostly."},
    {"id": "logo_gig", "place": "phone", "label": "Design a logo for a business", "slots": [1, 2], "earn": 9_000,
     "effects": {"energy": -20, "fun": 3}, "skill": "design", "xp": 14, "min_level": 3, "hustle": True,
     "weekly": True, "blurb": "A shawarma spot in town wants a whole brand."},
    {"id": "website_gig", "place": "phone", "label": "Build a website for a business", "slots": [1, 2], "earn": 22_000,
     "effects": {"energy": -35, "fun": -10}, "skill": "coding", "xp": 20, "min_level": 3, "hustle": True,
     "weekly": True, "blurb": "A real client, a real deadline, real money."},
    {"id": "bridal_hair", "place": "phone", "label": "Make hair for a wedding", "slots": [0, 1], "days": "weekend",
     "earn": 12_000, "effects": {"energy": -30, "social": 10}, "skill": "hair", "xp": 16, "min_level": 3,
     "hustle": True, "weekly": True, "blurb": "The bride, her mother and six aunties."},
    {"id": "brand_deal", "place": "phone", "label": "Promote a brand on your page", "slots": [1, 2, 3], "earn": 15_000,
     "effects": {"energy": -12, "fun": 6}, "skill": "content", "xp": 12, "min_level": 4, "hustle": True,
     "weekly": True, "blurb": "A food delivery app wants your followers."},
]

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
BUSINESS_RESALE = 0.6

for _bid, _b in BUSINESSES.items():
    ACTIONS.append({"id": f"buy_{_bid}", "place": "biz", "label": f"Start a {_b['name'].lower()}", "slots": [0, 1, 2],
                    "cost": _b["price"], "effects": {"energy": -10}, "special": "buy_business", "business": _bid,
                    "blurb": f"{_b['blurb']} Makes about ₦{_b['income'][0]:,} to ₦{_b['income'][1]:,} a day."})
    ACTIONS.append({"id": f"sell_{_bid}", "place": "biz", "label": f"Sell your {_b['name'].lower()}", "slots": [0, 1, 2],
                    "effects": {}, "special": "sell_business", "business": _bid,
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
    "tycoon": ("Tycoon", "Own all three businesses at once"),
    "master": ("Master of your craft", "Reach level 5 in any skill"),
    "viral": ("Gone viral", "Have a skit blow up"),
    "strike": ("Survived ASUU", "Live through an ASUU strike"),
    "loan_app": ("Loan app victim", "Borrow from a loan app"),
    "broke": ("Down to ₦0", "Spend your very last naira"),
    "health_centre": ("Health Centre regular", "Collapse three times"),
    "clean_sheet": ("Clean sheet", "Graduate without ever failing a course"),
    "first_class": ("First Class", "Graduate with a First"),
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
        "id": "water", "title": "No water in the hall", "weight": 9, "when": "day", "homes": ["Moremi Hall", "Awo Hall"],
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
        "text": "Face down on the pavement outside the faculty. The screen is a spider web.",
        "choices": [
            {"label": "Fix it at SUB (₦4,000)", "cost": 4_000, "result": "Good as new. Almost."},
            {"label": "Live with it", "effects": {"fun": -12}, "result": "You can still see half the screen."},
        ],
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
