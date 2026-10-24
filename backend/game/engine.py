"""The rules of Great Ife Life.

Pure Python: a game is a JSON-able dict, and every function takes a state and returns a new one.
The server is the only place these run, so players can't give themselves money, grades or time.

Time: the game clock is real Lagos time (WAT). state["clock"] counts minutes since the Lagos midnight of the
day the game started, so clock % 1440 is the time on a Nigerian wall clock right now. Like Lagos Life, actions
and journeys play out in a few real seconds (they cost needs as if their time had passed); only sleep takes
real hours. While the app is closed, life goes on gently: needs fall but don't crash, and nights count as sleep.

Randomness is seeded from the game's seed and turn number (or the time of day, for bus queues), so
replaying a request can't reroll luck.
"""

from __future__ import annotations

import copy
import math
import random
import time

from . import content as C
from . import world as W

VERSION = 6
RATE = 1 / 60       # game minutes per real second: the clock is the real clock
WAT = 3600          # Lagos is UTC+1 all year
OFFLINE_AFTER = 45  # no request for this many minutes: you were away, and life went on gently
AWAY_FLOOR = 20     # while you're away, needs don't fall below this
FATIGUE = 0.5       # an action costs this share of the needs its nominal time would have taken
ACTION_SECONDS = (5.0, 30.0)  # actions play out over real seconds: long enough to watch, never rushed
JOURNEY_SPEEDUP = 1.5     # journeys play back at 1.5 nominal minutes per real second
JOURNEY_MIN_SECONDS = 5
JOURNEY_MAX_SECONDS = 35
BET_MATCH_SECONDS = 45     # a virtual match plays out over 45 real seconds (two halves), not in a blink
RECOVER_MINUTES = 45      # a collapse keeps you at the Health Centre this long (real minutes)
WALK_UNITS_PER_SECOND = 7.5  # the fastest the 3D student may move (a jog is ~6); used to reject teleports
DOOR_RADIUS = 34          # how close (world units) you must be to a door to go in
TEST_OPENS = C.H(7, 30)


class GameError(Exception):
    """A move that isn't allowed right now; the message is shown to the player."""


# --- Setup ----------------------------------------------------------------------------------------


# --- Real Lagos time ------------------------------------------------------------------------------


def lagos_midnight(now: float) -> float:
    """The real timestamp of the most recent midnight in Lagos."""
    return now - ((now + WAT) % 86_400)


def lagos_weekday(now: float) -> int:
    return time.gmtime(now + WAT).tm_wday  # Monday is 0


def real_clock(state, now: float) -> int:
    return int((now - state["epoch"]) // 60)


def roll_status(seed: str) -> str:
    rng = random.Random(f"{seed}-admission")
    ids = list(C.PROFILES)
    return rng.choices(ids, weights=[C.PROFILES[i]["weight"] for i in ids])[0]


def gender(look) -> str:
    return "female" if (look or {}).get("hall") == 1 else "male"


def default_housing(seed: str, look) -> dict:
    halls = C.HALLS[gender(look)]
    hall = halls[random.Random(f"{seed}-hall").randrange(len(halls))]
    return hostel_housing(hall)


def hostel_housing(hall: str, room=None, label=None, session: int = 1) -> dict:
    return {"kind": "hostel", "building": hall, "area": None, "rent": C.HOUSING["hostel"]["rent"][0], "room": room,
            "label": label or W.BUILDINGS[hall]["name"], "session": session}


def new_state(seed: str, department: str, name: str = "", profile: str | None = None, now: float | None = None,
              look: dict | None = None) -> dict:
    if department not in C.DEPARTMENTS:
        raise GameError("Choose a department.")
    now = time.time() if now is None else now
    profile = profile or roll_status(seed)
    p = C.PROFILES[profile]
    look = clean_look(look) if look else random_look(seed)
    housing = default_housing(seed, look)
    home = housing["building"]
    epoch = lagos_midnight(now)
    dow = lagos_weekday(now)
    clock = int((now - epoch) // 60)
    state = {
        "version": VERSION,
        "seed": seed,
        "turn": 0,
        "name": name,
        "profile": profile,
        "department": department,
        "status": "playing",
        "phase": "play",
        "semester": 1,
        "day": 1 if dow < 5 else 0,   # day 0: the weekend before lectures start
        "dow": dow,
        "total_days": 1,
        "epoch": epoch,
        "clock": clock,
        "last_sync": now,
        "last_tick": now,
        "busy_until": 0,
        "asleep": None,
        "housing": housing,
        "at": home,
        "pos": list(W.NODES[W.BUILDINGS[home]["node"]]),
        "pos_time": now,
        "strike_days": 0,
        "strike_used": False,
        "money": p["money"],          # cash in hand
        "bank": None,                 # no account until you open one
        "needs": {"hunger": 70.0, "energy": 85.0, "hygiene": 75.0, "fun": 60.0, "social": 45.0},
        "prep": 10,
        "attended": 0,
        "lectures_held": 0,
        "ca": None,
        "exam_scores": {},
        "fees_paid": bool(p["fees_covered"]),
        "courses": [],
        "carryovers": [],
        "results": [],
        "flags": {"seen": [], "attended_keys": []},
        "pending": None,
        "last_result": None,
        "last_trip": None,
        "log": [],
        "stats": {"earned": 0, "spent": 0, "lectures": 0, "hustles": 0, "hustle_income": 0, "study_slots": 0},
        "look": look,
        "phone": {"model": p["phone"], "cracked": bool(p.get("phone_cracked"))},
        "traits": random_traits(seed),
        "dream": random.Random(f"{seed}-dream").choice(sorted(C.DREAMS)),
        "rep": 0,
        "moodlets": [],
        "streak": {"date": None, "day": 0},
        "items": list(p.get("items", [])),
        "pantry": 0,
    }
    upgrade(state)
    state["courses"] = _semester_courses(state)
    state["timetable"] = _make_timetable(state)
    _new_missions(state)
    _log(state, f"Welcome to Great Ife! You're a {p['name']} in {C.DEPARTMENTS[department]['name']}.")
    state["stats"].update(bets=0, staked=0, bet_won=0, freelance=0, parents_sent=0)
    _start_of_day(state, _rng(state, "day"))
    return state


def random_look(seed: str) -> dict:
    rng = random.Random(f"{seed}-look")
    return {k: rng.randrange(len(v)) for k, v in C.LOOK_OPTIONS.items()}


def clean_look(look) -> dict:
    if not isinstance(look, dict):
        raise GameError("Pick how your student looks.")
    out = {}
    for key, options in C.LOOK_OPTIONS.items():
        value = look.get(key, 0)
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < len(options):
            raise GameError("Pick how your student looks.")
        out[key] = value
    return out


def _semester_courses(state) -> list[dict]:
    dept = C.DEPARTMENTS[state["department"]]
    limit = len(state["carryovers"]) if state["semester"] > C.SEMESTERS else C.MAX_CARRYOVERS_PER_SEMESTER
    carry = [{"code": code, "carry": True} for code in state["carryovers"][:limit]]
    if state["semester"] > C.SEMESTERS:  # extra year: only carryovers
        return carry
    level = (state["semester"] - 1) // 2 + 1
    first = state["semester"] % 2 == 1
    numbers = [1, 3, 5, 7, 9] if first else [2, 4, 6, 8, 10]
    own = [{"code": f"{dept['code']} {level}{n:02d}", "carry": False} for n in numbers[: C.COURSES_PER_SEMESTER]]
    return own + carry


def _make_timetable(state) -> list[list[dict]]:
    """Two lectures each weekday, at 8, 10, 12 or 2, the same every week of the semester."""
    rng = random.Random(f"{state['seed']}-timetable-{state['semester']}")
    codes = [c["code"] for c in state["courses"]] or ["GST 101"]
    table, i = [], rng.randrange(len(codes))
    for _ in range(5):
        times = sorted(rng.sample(C.LECTURE_TIMES, C.LECTURES_PER_WEEKDAY))
        row = []
        venues = C.DEPARTMENTS[state["department"]]["venues"]
        for t in times:
            row.append({"start": t, "code": codes[i % len(codes)], "venue": venues[rng.randrange(len(venues))]})
            i += 1
        table.append(row)
    return table


def upgrade(state: dict) -> dict:
    """Bring a saved game up to the current version, so players never lose progress after an update."""
    state.setdefault("skills", {k: 0 for k in C.SKILLS})
    for k in C.SKILLS:
        state["skills"].setdefault(k, 0)
    state.setdefault("businesses", {})
    state.setdefault("badges", [])
    for key in ("tdb", "collapses", "business_income", "loans", "skits", "trekked", "early", "trips"):
        state["stats"].setdefault(key, 0)
    state["stats"].setdefault("modes", {})
    if state.get("map", 1) < 3:
        # the campus was rearranged to match the real OAU map (v3: Akintola moved beside Fajuyi):
        # stand at the door of wherever you are
        state["map"] = 3
        where = state.get("at") if state.get("at") in W.BUILDINGS else state.get("housing", {}).get("building")
        if where in W.BUILDINGS:
            state["pos"] = list(W.NODES[W.BUILDINGS[where]["node"]])
    if state.get("version", 1) < 3:
        # v2 had four time slots a day. Put the player at home at that slot's time.
        slot = state.pop("slot", 0)
        state["clock"] = (state["total_days"] - 1) * 1440 + [C.H(7), C.H(12), C.H(17), C.H(21)][min(slot, 3)]
        home = OLD_HOMES.get(state["profile"], "awo")
        home = home["male"] if isinstance(home, dict) else home
        state["at"] = home
        state["pos"] = list(W.NODES[W.BUILDINGS[home]["node"]])
        state["pos_clock"] = state["clock"]
        state["last_sync"] = None
        state["needs"] = {k: float(v) for k, v in state["needs"].items()}
        state["flags"].setdefault("attended_keys", [])
        state.setdefault("look", random_look(state["seed"]))
        state.setdefault("last_trip", None)
        state["timetable"] = _make_timetable(state)
    state["flags"].setdefault("attended_keys", [])
    state.setdefault("look", random_look(state["seed"]))
    if state.get("version", 1) < 4:
        # v4: the real campus (more halls, lecture theatres, the market), phones and items.
        p = OLD_PROFILES.get(state["profile"], {})
        state["look"].setdefault("hall", random_look(state["seed"])["hall"])
        state.setdefault("phone", {"model": p.get("phone", "itel"), "cracked": bool(p.get("phone_cracked"))})
        state.setdefault("items", list(p.get("items", [])))
        state.setdefault("pantry", 0)
        home = OLD_HOMES.get(state["profile"], "awo")
        if isinstance(home, dict):
            home = home[gender(state["look"])]
        if state.get("phase") == "play" or state.get("at") not in W.BUILDINGS:
            state["at"] = home
            state["pos"] = list(W.NODES[W.BUILDINGS[home]["node"]])
            state["pos_clock"] = state["clock"]
        state["timetable"] = _make_timetable(state)
        state["flags"]["attended_keys"] = []
    for key in ("phones",):
        state["stats"].setdefault(key, 0)
    state.setdefault("traits", random_traits(state["seed"]))
    state.setdefault("dream", random.Random(f"{state['seed']}-dream").choice(sorted(C.DREAMS)))
    state.setdefault("rep", 0)
    state.setdefault("moodlets", [])
    state.setdefault("streak", {"date": None, "day": 0})
    if "missions" not in state:
        _new_missions(state)
    if state.get("version", 1) < 5:
        _upgrade_v5(state)
    state.setdefault("bank", None)   # v6: cash in hand and a bank account are separate
    state["stats"].setdefault("thefts", 0)
    state["version"] = VERSION
    return state


# Before v5 you picked a background; now your money status is rolled and housing is separate.
OLD_PROFILES = {"staff_pikin": {"phone": "iphone", "items": ["car", "laptop"]},
                "scholarship": {"phone": "tecno", "items": ["laptop"]},
                "hustler": {"phone": "itel", "phone_cracked": True},
                "off_campus": {"phone": "infinix"}}
OLD_HOMES = {"staff_pikin": "staff", "off_campus": "offcampus",
             "scholarship": {"male": "awo", "female": "moremi"}, "hustler": {"male": "angola", "female": "mozambique"}}
OLD_STATUS = {"staff_pikin": "nepo_baby", "scholarship": "lapo_baby", "hustler": "lapo_baby", "off_campus": "nepo_baby"}


def _upgrade_v5(state):
    old = state["profile"]
    if old in OLD_STATUS:
        home = OLD_HOMES[old]
        home = home[gender(state["look"])] if isinstance(home, dict) else home
        if old == "staff_pikin":
            housing = {"kind": "flat", "building": "staff", "area": "Road 7", "rent": 0, "room": None,
                       "label": "Staff Quarters (Road 7)", "session": 99}
        elif old == "off_campus":
            housing = {"kind": "self_con", "building": "offcampus", "area": "Asherifa", "rent": 250_000, "room": None,
                       "label": "Self-contain in Asherifa", "session": (state["semester"] + 1) // 2}
        else:
            housing = hostel_housing(home, session=(state["semester"] + 1) // 2)
        state["profile"] = OLD_STATUS[old]
        state["housing"] = housing
    state.setdefault("housing", default_housing(state["seed"], state["look"]))
    state.setdefault("epoch", None)   # anchored to real Lagos time on the next request
    state.setdefault("last_tick", None)
    state.setdefault("busy_until", 0)
    state.setdefault("asleep", None)
    state.pop("pos_clock", None)
    state.setdefault("pos_time", None)
    for key in ("bets", "staked", "bet_won", "freelance", "parents_sent"):
        state["stats"].setdefault(key, 0)


def _anchor(state, now: float):
    """Old saves (and saves from before the real clock) join real Lagos time today."""
    state["epoch"] = lagos_midnight(now) - (state["total_days"] - 1) * 86_400
    state["clock"] = real_clock(state, now)
    state["dow"] = lagos_weekday(now)
    state["last_tick"] = now
    state["pos_time"] = now


def skill_level(state, skill: str) -> int:
    xp = state["skills"].get(skill, 0)
    return sum(1 for need in C.SKILL_LEVELS if xp >= need)


# --- Helpers --------------------------------------------------------------------------------------


def _rng(state, tag: str) -> random.Random:
    return random.Random(f"{state['seed']}-{state['turn']}-{tag}")


def _clamp(value, lo=0, hi=100):
    return max(lo, min(hi, value))


def tod(state) -> int:
    """Minutes after midnight today."""
    return state["clock"] % 1440


def clock_text(minutes: int) -> str:
    m = int(minutes) % 1440
    h, mm = divmod(m, 60)
    return f"{(h % 12) or 12}:{mm:02d} {'AM' if h < 12 else 'PM'}"


def _log(state, text: str):
    state["log"].append({"day": state["total_days"], "time": clock_text(state["clock"]), "text": text})
    del state["log"][:-40]


def mood(state) -> int:
    base = sum(state["needs"].values()) / len(state["needs"])
    return round(_clamp(base + 0.5 * sum(m["value"] for m in active_moodlets(state))))


def burnt_out(state) -> bool:
    """All work and no play: no fun or no friends makes reading and exams harder."""
    return state["needs"]["fun"] < 15 or state["needs"]["social"] < 10


def _study_multiplier(state) -> float:
    m = 0.6 + mood(state) / 250  # 0.6 when miserable, 1.0 when everything is full
    if burnt_out(state):
        m *= 0.8
    if state["needs"]["energy"] < 20:
        m *= 0.5
    if has_trait(state, "bookworm"):
        m *= 1.15
    if has_trait(state, "lazy_bone"):
        m *= 0.9
    return m * (1 + C.PROFILES[state["profile"]].get("study_bonus", 0))


def _apply_effects(state, effects: dict, *, study=False):
    for key, value in effects.items():
        if key == "prep":
            if study and value > 0:
                value = value * C.STUDY_GAIN * _study_multiplier(state) * (1 - state["prep"] / 150)
            state["prep"] = _clamp(round(state["prep"] + value))
        elif key in state["needs"]:
            state["needs"][key] = round(_clamp(state["needs"][key] + value), 2)


def _add_money(state, amount: int):
    """Cash in hand."""
    state["money"] += amount
    if amount > 0:
        state["stats"]["earned"] += amount
    else:
        state["stats"]["spent"] += -amount


# --- Money: cash in hand and a bank account ------------------------------------------------------
# Paying: shops, kekes and mama put take cash, and most take a transfer too ("any": cash first, then a
# transfer from your account if you have one and a phone). Online payments (the portal, Jiji, betting,
# data) come from the bank. Parents, allowances and freelance clients pay into your account.


def bank_balance(state) -> int:
    return (state.get("bank") or {}).get("balance", 0)


def total_money(state) -> int:
    return state["money"] + bank_balance(state)


def can_transfer(state) -> bool:
    """Any phone can send a transfer (by app or USSD), as long as you have an account."""
    return bool(state.get("bank")) and state.get("phone") is not None


def spendable(state, how: str = "any") -> int:
    if how == "cash":
        return state["money"]
    bank = bank_balance(state) if can_transfer(state) else 0
    return bank if how == "bank" else state["money"] + bank


def pay_reason(state, amount: int, how: str = "any") -> str | None:
    """Why you can't pay this, or None if you can."""
    if amount <= 0 or spendable(state, how) >= amount:
        return None
    if how == "bank" and not state.get("bank"):
        return "Pay online: open a bank account first"
    if how == "bank" and not state.get("phone"):
        return "You need a phone to pay online"
    if how == "cash" and total_money(state) >= amount:
        return "Cash only: withdraw at an ATM or POS"
    return "Not enough money"


def _bank_move(state, amount: int, text: str):
    """Money in (+) or out (-) of your account, written on your statement."""
    b = state["bank"]
    b["balance"] += amount
    b["history"] = ([{"day": state["total_days"], "time": clock_text(state["clock"]), "text": text,
                      "amount": amount, "balance": b["balance"]}] + b.get("history", []))[:25]


def _spend(state, amount: int, how: str = "any", text: str = "Payment"):
    """Pay: cash first, then a transfer from the bank (or only one, if `how` says so)."""
    if amount <= 0:
        return
    reason = pay_reason(state, amount, how)
    if reason:
        raise GameError(reason + ".")
    cash = 0 if how == "bank" else min(state["money"], amount)
    state["money"] -= cash
    if amount - cash:
        _bank_move(state, -(amount - cash), text)
    state["stats"]["spent"] += amount


def _take(state, amount: int, text: str) -> int:
    """Take up to `amount` from whatever you have (bank first, like a loan app's direct debit). Returns it."""
    from_bank = min(bank_balance(state), amount)
    if from_bank:
        _bank_move(state, -from_bank, text)
    from_cash = min(state["money"], amount - from_bank)
    state["money"] -= from_cash
    state["stats"]["spent"] += from_bank + from_cash
    return from_bank + from_cash


def _receive(state, amount: int, text: str, prefer: str = "bank") -> str:
    """Money coming to you: into your account if you have one (and it should go there), else cash."""
    if amount <= 0:
        return "cash"
    if prefer == "bank" and state.get("bank"):
        _bank_move(state, amount, text)
        state["stats"]["earned"] += amount
        return "bank"
    _add_money(state, amount)
    return "cash"


def is_weekday(state) -> bool:
    return state["dow"] < 5


def week_key(state) -> str:
    """The same for every day of one Monday-to-Sunday week."""
    return f"w{state['total_days'] - state['dow']}"


def level_label(state) -> str:
    if state["semester"] > C.SEMESTERS:
        return "Extra year"
    level = ((state["semester"] - 1) // 2 + 1) * 100
    return f"{level} Level, {'First' if state['semester'] % 2 else 'Second'} Semester"


def home_building(state) -> str:
    return state["housing"]["building"]


def housing_kind(state) -> str:
    return state["housing"]["kind"]


def home_name(state) -> str:
    h = state["housing"]
    if h["kind"] == "hostel":
        return h["label"]
    return h["label"] or f"{C.HOUSING[h['kind']]['name']} in {h['area']}"


def phone_info(state) -> dict | None:
    ph = state.get("phone")
    if not ph:
        return None
    return {**C.PHONES[ph["model"]], "model": ph["model"], "cracked": ph["cracked"]}


def has_smartphone(state) -> bool:
    info = phone_info(state)
    return bool(info and info["smart"])


def dept(state) -> dict:
    return C.DEPARTMENTS[state["department"]]


def place_name(building_id: str) -> str:
    return W.BUILDINGS[building_id]["name"]


def _in_window(t: int, windows) -> bool:
    return any(lo <= t < hi or lo <= t + 1440 < hi for lo, hi in windows)


def building_open(building_id: str, t: int) -> bool:
    hours = W.BUILDINGS[building_id]["hours"]
    return hours is None or _in_window(t, [hours])


def _door(building_id: str) -> list[float]:
    return list(W.NODES[W.BUILDINGS[building_id]["node"]])


def _dist_xy(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


# --- The timetable --------------------------------------------------------------------------------


def test_today(state) -> str | None:
    if state["strike_days"] or state["semester"] > C.SEMESTERS + C.MAX_EXTRA_SEMESTERS or not is_weekday(state):
        return None
    if state["day"] == C.CA_TEST_DAY and state["semester"] <= C.SEMESTERS:
        return "ca"
    if state["day"] in C.EXAM_DAYS:
        return "exam"
    return None


def lectures_today(state) -> list[dict]:
    if state["strike_days"] or not is_weekday(state) or test_today(state) or state["day"] in C.EXAM_DAYS:
        return []
    if not 1 <= state["day"] <= C.SEMESTER_DAYS:
        return []
    return state["timetable"][state["dow"]]


def _lecture_key(state, lecture) -> str:
    return f"{state['total_days']}-{lecture['start']}"


def current_lecture(state) -> dict | None:
    """The lecture you could walk into right now (doors open 45 minutes before)."""
    t = tod(state)
    for lec in lectures_today(state):
        if lec["start"] - C.LECTURE_DOORS_OPEN <= t <= lec["start"] + C.LECTURE_DOORS_CLOSE and \
                _lecture_key(state, lec) not in state["flags"]["attended_keys"]:
            return lec
    return None


def next_lecture(state) -> dict | None:
    t = tod(state)
    for lec in lectures_today(state):
        if t <= lec["start"] + C.LECTURE_DOORS_CLOSE and _lecture_key(state, lec) not in state["flags"]["attended_keys"]:
            return lec
    return None


def lectures_held_now(state) -> int:
    t = tod(state)
    return state["lectures_held"] + sum(1 for lec in lectures_today(state) if lec["start"] + C.LECTURE_DOORS_CLOSE < t)


def test_written(state) -> bool:
    kind = test_today(state)
    if kind == "ca":
        return state["ca"] is not None
    if kind == "exam":
        return state["flags"].get("exam_day_done") == state["total_days"]
    return True


# --- Time passing ---------------------------------------------------------------------------------


def tick(state, now: float | None, messages=None):
    """Catch the game clock up with real Lagos time."""
    messages = messages if messages is not None else []
    if now is None:
        return messages
    if state.get("epoch") is None:
        _anchor(state, now)
    state["last_sync"] = now
    if state["status"] != "playing" or state["phase"] != "play":
        return messages  # results and dialogs: the clock catches up once you're back
    minutes = real_clock(state, now) - state["clock"]
    if minutes <= 0:
        return messages
    last = state.get("last_tick") or now
    away = (now - last) / 60 > OFFLINE_AFTER
    state["last_tick"] = now
    _pass_time(state, minutes, messages, away=away)
    if away:
        home = home_building(state)
        if minutes >= 180 and state["at"] != home and not state.get("asleep") and state["phase"] == "play":
            state["at"] = home
            state["pos"] = _door(home)
            state["pos_time"] = now
            messages.append(f"While you were away you went back to {home_name(state)}.")
    else:
        _check_collapse(state, messages)
    return messages


def _boundaries(t: int) -> int:
    """Minutes until the next moment something happens: 1 AM, 5 AM, 6 AM (new day), 6:30, 11 AM, midnight."""
    for b in (60, 300, 360, C.WAKE_UP, C.H(11), 1440):
        if t < b:
            return b - t
    return 1440 - t


def _night(t: int) -> bool:
    return t >= C.H(22) or t < C.WAKE_UP


def _decay(state, t: int) -> dict:
    decay = dict(C.DECAY_PER_HOUR)
    if 60 <= t < 300:
        decay["energy"] *= 2  # awake past 1 AM
    if has_trait(state, "bookworm"):
        decay["fun"] *= 1.2
    if has_trait(state, "owambe"):
        decay["fun"] *= 1.3
    if has_trait(state, "gym_rat"):
        decay["energy"] *= 0.9
    if has_trait(state, "lazy_bone"):
        decay["energy"] *= 0.7
    if has_trait(state, "clean_pikin"):
        decay["hygiene"] *= 0.65
    if has_trait(state, "night_crawler") and (t >= 1200 or t < 240):
        decay["energy"] *= 0.6
    return decay


def _pass_time(state, minutes: int, messages, away: bool = False):
    """Move the clock forward to match real time, letting needs fall and days turn over."""
    remaining = int(minutes)
    while remaining > 0 and state["phase"] != "results" and state["status"] == "playing":
        t = tod(state)
        step = min(remaining, _boundaries(t))
        asleep = state.get("asleep")
        if asleep:
            step = min(step, 60)
            if asleep.get("until"):
                step = max(1, min(step, asleep["until"] - state["clock"]))
        sleeping = bool(asleep) or (away and _night(t))
        hours = step / 60
        if sleeping:
            effects = {k: v * hours for k, v in C.SLEEP_DECAY_PER_HOUR.items()}
            effects["energy"] = C.SLEEP_ENERGY_PER_HOUR * hours
        else:
            effects = {k: v * hours for k, v in _decay(state, t).items()}
        for k, v in effects.items():
            before = state["needs"][k]
            after = _clamp(before + v)
            if away and v < 0 and not asleep:
                after = max(after, min(before, AWAY_FLOOR))  # life went on: you ate something, somewhere
            state["needs"][k] = round(after, 2)
        state["clock"] += step
        remaining -= step
        t = tod(state)
        if t == 0:
            _end_of_day(state, messages)
        elif t == 360:
            _start_of_day(state, _rng(state, f"day{state['total_days']}"), messages)
        _maybe_wake(state, messages)


def _maybe_wake(state, messages):
    asleep = state.get("asleep")
    if not asleep:
        return
    t = tod(state)
    energy = state["needs"]["energy"]
    if asleep.get("until"):
        if state["clock"] >= asleep["until"]:
            state["asleep"] = None
            messages.append("The nurse says you can go. Eat something and rest properly.")
        return
    woke = None
    if C.WAKE_UP <= t < C.H(20) and energy >= 99.5:
        woke = "You woke up fully rested."
    elif C.WAKE_UP <= t < C.H(20) and energy >= 80 and asleep.get("night"):
        woke = f"Your alarm went off. Good morning, it's {clock_text(t)}!"
    elif C.H(11) <= t < C.H(20):
        woke = f"You overslept! It's {clock_text(t)}."
    if woke:
        state["asleep"] = None
        if energy >= 85:
            _add_moodlet(state, "slept_well")
        messages.append(woke)


def _fatigue(state, minutes: float, per_minute: dict | None = None):
    """What an action or journey costs your needs, without moving the clock (it plays out in seconds)."""
    effects = {k: v * minutes / 60 * FATIGUE for k, v in _decay(state, tod(state)).items()}
    for k, v in (per_minute or {}).items():
        effects[k] = effects.get(k, 0) + v * minutes
    for k, v in effects.items():
        state["needs"][k] = round(_clamp(state["needs"][k] + v), 2)


def _check_collapse(state, messages):
    if state["status"] != "playing" or state["phase"] == "results" or state.get("asleep"):
        return
    if state["needs"]["hunger"] > 0 and state["needs"]["energy"] > 0:
        return
    fee = _take(state, 1_000, "Health Centre")
    state["stats"]["collapses"] += 1
    state["needs"]["hunger"] = max(state["needs"]["hunger"], 35.0)
    state["needs"]["energy"] = max(state["needs"]["energy"], 35.0)
    state["at"] = "health"
    state["pos"] = _door("health")
    state["asleep"] = {"kind": "recover", "until": state["clock"] + RECOVER_MINUTES}
    messages.append(f"You collapsed and were taken to the Health Centre{f' (₦{fee:,})' if fee else ''}. "
                    f"They'll discharge you at {clock_text(state['clock'] + RECOVER_MINUTES)}. Eat and sleep!")


def _end_of_day(state, messages):
    """Midnight: businesses pay out, the day turns over, and the semester may end."""
    held_today = len(lectures_today(state))
    kind = test_today(state)
    if kind == "ca" and state["ca"] is None:
        messages.append("You missed the CA test! That's 0 for 30% of every course.")
    if kind == "exam" and not test_written(state):
        messages.append("You missed today's exams. Those courses get 0.")
    state["lectures_held"] += held_today
    _business_payouts(state, messages)
    state["total_days"] += 1
    state["dow"] = (state["dow"] + 1) % 7
    state["flags"]["attended_keys"] = []
    if state["strike_days"]:
        state["strike_days"] -= 1
        state["prep"] = _clamp(state["prep"] - 2)
        if not state["strike_days"]:
            messages.append("ASUU has called off the strike! Back to class.")
    elif state["dow"] < 5:
        state["day"] += 1  # semester days are school days; weekends don't count
    if state["day"] > C.SEMESTER_DAYS:
        _compute_results(state, messages)


def _start_of_day(state, rng, messages=None):
    """6 AM: allowance, debts, strikes, deadlines and the day's random event."""
    messages = messages if messages is not None else []
    flags = state["flags"]
    _new_missions(state)
    for key in ("no_light", "no_water"):
        if flags.get(key):
            flags[key] -= 1
    p = C.PROFILES[state["profile"]]
    if state["dow"] == 0 and p["allowance"] and flags.get("allowance_week") != week_key(state):
        flags["allowance_week"] = week_key(state)
        if state.get("bank"):
            _receive(state, p["allowance"], "Weekly allowance from home")
            messages.append(f"Credit alert! Your weekly allowance of ₦{p['allowance']:,} has landed in your account.")
            _add_moodlet(state, "mummys_alert")
        else:
            flags["held_allowance"] = flags.get("held_allowance", 0) + p["allowance"]
            messages.append(f"Your parents are holding your ₦{p['allowance']:,} allowance: "
                            "'Open a bank account so we can send it.'")

    # Carrying a lot of cash is asking for trouble in a hostel.
    if state["money"] >= C.CASH_THEFT_FROM and _rng(state, "theft").random() < C.CASH_THEFT_CHANCE:
        lost = int(state["money"] * _rng(state, "theft-amt").uniform(0.3, 0.5) // 500 * 500)
        state["money"] -= lost
        state["stats"]["thefts"] += 1
        state["stats"]["spent"] += lost
        where = "Someone broke into your room" if housing_kind(state) == "hostel" else "Thieves broke into your place"
        messages.append(f"{where} overnight and took ₦{lost:,} of your cash. Money in the bank is safer.")

    if flags.get("debt") and total_money(state) > 0:
        take = _take(state, flags["debt"], "Loan app debit")
        flags["debt"] -= take
        messages.append(f"The loan app took ₦{take:,}." + ("" if flags["debt"] else " Loan fully repaid!"))

    # The strike can only start at the beginning of a semester, once per degree.
    if (state["day"] == 1 and state["semester"] >= 2 and not state["strike_used"]
            and state["semester"] <= C.SEMESTERS and rng.random() < C.STRIKE["chance"]):
        state["strike_used"] = True
        state["strike_days"] = C.STRIKE["days"]
        state["pending"] = {"id": "strike", "title": C.STRIKE["title"], "text": C.STRIKE["text"],
                            "choices": [{"label": c["label"], "enabled": True, "reason": None}
                                        for c in C.STRIKE["choices"]]}
        state["phase"] = "event"
        return

    if (not state["fees_paid"] and state["day"] in (C.EXAM_DAYS[0] - 2, C.EXAM_DAYS[0] - 1)
            and not state["strike_days"]):
        _queue_fees_deadline(state)
        return

    if test_today(state) or rng.random() > 0.38:
        return
    eligible = []
    if state["phase"] != "play":
        return
    for event in C.EVENTS:
        if event["when"] != "day" or event["id"] in flags["seen"]:
            continue
        req = event.get("requires", {})
        if req.get("hall") and housing_kind(state) != "hostel":
            continue
        if event["id"] == "nepa" and housing_kind(state) == "flat":
            continue  # the flat has a generator
        if req.get("phone") and not state.get("phone"):
            continue
        if req.get("phone") == "smart" and not has_smartphone(state):
            continue
        if req.get("not_cracked") and state.get("phone") and state["phone"]["cracked"]:
            continue
        if req.get("min_money") and total_money(state) < req["min_money"]:
            continue
        if req.get("flag") and not (flags.get(req["flag"]) and flags.get(f"{req['flag']}_day", 0) < state["total_days"]):
            continue
        if event["weight"]:
            eligible.append(event)
    if eligible:
        event = rng.choices(eligible, weights=[e["weight"] for e in eligible])[0]
        _queue_event(state, event["id"])


# --- What can I do here, now? ---------------------------------------------------------------------


def _day_ok(rule, state) -> bool:
    if rule in (None, C.ALL_DAYS):
        return True
    if rule == C.WEEKDAYS_ONLY:
        return is_weekday(state)
    if rule == C.WEEKEND:
        return state["dow"] >= 5
    if rule == C.FRI_SAT:
        return state["dow"] in (4, 5)
    return True


def _where_ok(state, action) -> bool:
    at = action["at"]
    if at == "phone":
        return state.get("phone") is not None
    if at == "home":
        return state["at"] == home_building(state)
    if at == "dept":
        return state["at"] == dept(state)["faculty"]
    if at == "lecture":
        return state["at"] in dept(state)["venues"]
    if at == "laptop":
        return "laptop" in state["items"] and state["at"] is not None
    return state["at"] == at


def _window_text(windows) -> str:
    return " or ".join(f"{clock_text(lo)} to {clock_text(hi)}" for lo, hi in windows)


def _check(state, action) -> str | None:
    """Return why an action can't be done now, or None if it can."""
    p = C.PROFILES[state["profile"]]
    if not _where_ok(state, action):
        return "Not here"
    if action["id"] == "lecture":
        if state["strike_days"]:
            return "Strike: no lectures"
        lec = current_lecture(state)
        if not lec:
            nxt = next_lecture(state)
            return (f"Next lecture: {nxt['code']} at {clock_text(nxt['start'])}, {place_name(nxt['venue'])}" if nxt
                    else "No more lectures today")
        if state["at"] != lec["venue"]:
            return f"{lec['code']} is at {place_name(lec['venue'])}"
    elif not _in_window(tod(state), action["hours"]):
        return f"Starts {_window_text(action['hours'])}"
    if not _day_ok(action.get("days"), state):
        return {"weekdays": "Weekdays only", "fri_sat": "Fridays and Saturdays only", "weekend": "Weekends only"}[
            action["days"]]
    if action["id"] in ("study_group", "tutorial", "teach_tutorial") and state["strike_days"]:
        return "Strike: no academic activities"
    if action.get("profiles") and state["profile"] not in action["profiles"]:
        return "Not for you"
    flags = state["flags"]
    if action.get("once_per_day") and flags.get(f"done_{action['id']}") == state["total_days"]:
        return "Already done today"
    if action["id"] == "read_room" and flags.get("no_light"):
        return "No light in your room"
    if action["id"] == "call_home" and flags.get("called_week") == week_key(state):
        return "Already called this week"
    if action.get("special") == "pay_fees":
        if p["fees_covered"]:
            return "Covered for you"
        if state["fees_paid"]:
            return "Paid for this semester"
    if action.get("min_level") and skill_level(state, action["skill"]) < action["min_level"]:
        return f"Needs {C.SKILLS[action['skill']]['name']} level {action['min_level']}"
    if action.get("weekly") and flags.get(f"week_{action['id']}") == week_key(state):
        return "Once a week. Come back next week"
    special = action.get("special")
    if special == "buy_business" and action["business"] in state["businesses"]:
        return "You already own one"
    if special == "sell_business" and action["business"] not in state["businesses"]:
        return "You don't own this"
    if special == "promote":
        if not state["businesses"]:
            return "Start a business first"
        if (state.get("promo") or {}).get("until", 0) > state["total_days"]:
            return "A promotion is already running"
    req = action.get("requires", {})
    if req.get("min_prep") and state["prep"] < req["min_prep"]:
        return f"You need {req['min_prep']}% readiness to teach"
    if req.get("smartphone") and not has_smartphone(state):
        return "Needs a smartphone"
    if req.get("keypad") and (phone_info(state) or {}).get("os") != "keypad":
        return "Only on a torchlight phone"
    if req.get("camera") and (phone_info(state) or {}).get("camera", 0) < req["camera"]:
        return "Your phone's camera isn't good enough for brands"
    if req.get("item") and req["item"] not in state["items"]:
        return f"You need {C.ITEMS[req['item']]['name'].lower()} (Ojaja market)"
    if req.get("pantry") and state["pantry"] < req["pantry"]:
        return "No foodstuff. Buy some at Ojaja"
    if special == "fix_screen" and not (state.get("phone") and state["phone"]["cracked"]):
        return "Your screen isn't cracked"
    if special == "buy_item" and action["item"] in state["items"]:
        return "You already have one"
    if special == "buy_phone" and state.get("phone") and state["phone"]["model"] == action["phone"] \
            and not state["phone"]["cracked"]:
        return "You already have this phone"
    if action.get("freelance") and not state.get("bank"):
        return "Clients pay by transfer: open a bank account"
    return pay_reason(state, action_cost(state, action), pay_method(action))


def pay_method(action) -> str:
    """Online things are paid from the bank; everything else takes cash or a transfer."""
    return action.get("pay") or ("bank" if action["at"] == "phone" else "any")


def action_cost(state, action) -> int:
    cost = action.get("cost", 0)
    if action["id"] == "pay_fees":
        cost = C.SCHOOL_CHARGES
    if action["id"] == "pay_fees_bc":
        cost = C.SCHOOL_CHARGES + 200
    if action["id"] == "cook" and state.get("pantry", 0) > 0:
        cost = 0
    if action.get("special") == "fix_screen" and state.get("phone"):
        cost = C.PHONES[state["phone"]["model"]]["screen_fix"]
    if action["id"] == "bath" and state["flags"].get("no_water"):
        cost += 300
    return cost


def duration(state, action) -> int:
    """How many game minutes an action takes if you start it now."""
    t = tod(state)
    m = action["minutes"]
    if m == "sleep":
        return 15
    if m == "till_dawn":
        return (C.H(5) - t) % 1440
    if m == "lecture":
        lec = current_lecture(state) or {"start": t}
        return max(30, C.LECTURE_MINUTES - max(0, t - lec["start"]))
    return m


def _hustle_pay(state, base: int, skill: str | None = None) -> int:
    bonus = 1 + C.PROFILES[state["profile"]].get("hustle_bonus", 0)
    bonus *= 1 + C.HUSTLING_BONUS * (skill_level(state, "hustling") - 1)
    if has_trait(state, "hustler"):
        bonus *= 1.1
    bonus *= 1 + C.CHARISMA_BONUS / 2 * (skill_level(state, "charisma") - 1)
    if skill:
        bonus *= 1 + C.SKILL_PAY_PER_LEVEL * (skill_level(state, skill) - 1)
    tired = 0.6 if state["needs"]["energy"] < 15 else 1.0
    return int(round(base * bonus * tired / 50) * 50)


def _test_action(state) -> dict | None:
    """The CA test or exam, at the Faculty from 7:30, starting 9:00 sharp."""
    kind = test_today(state)
    if not kind or test_written(state):
        return None
    t = tod(state)
    venue = dept(state)["exams"]
    here = state["at"] == venue
    reason = None
    if not here:
        reason = f"At {place_name(venue)}"
    elif t < TEST_OPENS:
        reason = f"Doors open {clock_text(TEST_OPENS)}"
    elif t > C.TEST_DOORS_CLOSE:
        reason = "Too late. The doors are shut"
    minutes = 60 if kind == "ca" else 180
    if kind == "ca":
        label, blurb = "Write the CA test", "30% of every course. Your readiness decides how it goes."
    else:
        first = state["day"] == C.EXAM_DAYS[0]
        blocked = not state["fees_paid"]
        label = "Go into the exam hall" if blocked else f"Write exams (day {1 if first else 2} of 2)"
        blurb = ("You haven't paid school charges. They may not let you in." if blocked
                 else "70% of every course. Good luck!")
    return {"id": "write_ca" if kind == "ca" else "write_exam", "at": venue, "label": label, "blurb": blurb,
            "cost": 0, "earn": 0, "effects": {}, "hustle": False, "study": False, "skill": None, "xp": 0,
            "locked": False, "enabled": reason is None, "reason": reason, "minutes": minutes,
            "ends": clock_text(state["clock"] + minutes), "test": True, "seconds": ACTION_SECONDS[1]}


def available_actions(state) -> list[dict]:
    """Everything you could do where you are (and on your phone), with why not if you can't."""
    if state["phase"] != "play" or state["status"] != "playing":
        return []
    asleep = state.get("asleep")
    if asleep:
        if asleep.get("until"):
            return []
        return [{"id": "wake", "at": state["at"], "label": "Wake up", "cost": 0, "earn": 0, "effects": {},
                 "blurb": f"Energy {round(state['needs']['energy'])}. Your alarm is set for {clock_text(C.WAKE_UP)}.",
                 "hustle": False, "study": False, "skill": None, "xp": 0, "locked": False, "enabled": True,
                 "reason": None, "minutes": 0, "ends": clock_text(state["clock"]), "seconds": ACTION_SECONDS[0]}]
    out = []
    test = _test_action(state)
    if test and state["at"] == test["at"]:
        out.append({**test, "station": "class"})
    for action in C.ACTIONS:
        if action.get("profiles") and state["profile"] not in action["profiles"]:
            continue
        if action.get("special") == "pay_fees" and C.PROFILES[state["profile"]]["fees_covered"]:
            continue
        if not _where_ok(state, action):
            continue
        if action.get("special") == "fix_screen" and not (state.get("phone") and state["phone"]["cracked"]):
            continue
        if action.get("special") == "buy_item" and action["item"] in state["items"]:
            continue
        req = action.get("requires", {})
        if action["at"] == "phone" and req.get("keypad") and (phone_info(state) or {}).get("os") != "keypad":
            continue
        owned = action.get("business") in state["businesses"]
        if (action.get("special") == "buy_business" and owned) or (action.get("special") == "sell_business" and not owned):
            continue
        reason = _check(state, action)
        skill = action.get("skill")
        minutes = duration(state, action)
        out.append({
            "id": action["id"], "at": action["at"], "label": action["label"], "blurb": action["blurb"],
            "cost": action_cost(state, action),
            "earn": _hustle_pay(state, action["earn"], skill) if action.get("earn") else 0,
            "effects": action.get("effects", {}), "hustle": bool(action.get("hustle")), "study": bool(action.get("study")),
            "skill": C.SKILLS[skill]["name"] if skill else None, "xp": action.get("xp", 0),
            "locked": bool(action.get("min_level") and skill_level(state, skill) < action["min_level"]),
            "enabled": reason is None, "reason": reason, "minutes": minutes,
            "ends": clock_text(state["clock"] + minutes),
            "seconds": ACTION_SECONDS[0] if action.get("special") == "sleep" else action_seconds(minutes),
            "freelance": bool(action.get("freelance")),
            "station": station(action),
        })
    return out


def station(action) -> str:
    """Which station of a place an action belongs to (Food, Study, Hustle...), for grouping action cards."""
    aid, special, eff = action["id"], action.get("special"), action.get("effects", {})
    if special == "lecture" or aid in ("lecture", "write_ca", "write_exam") or action.get("test"):
        return "class"
    if action.get("study") or action.get("learn") or eff.get("prep", 0) > 0:
        return "study"
    if action.get("hustle") or action.get("earn") or action.get("freelance") or special in ("buy_business", "sell_business"):
        return "hustle"
    if special in ("buy_item", "buy_phone", "fix_screen", "foodstuff") or aid.startswith("buy_") or special == "pay_fees":
        return "shop"
    if special in ("sleep",) or aid in ("nap", "wake") or eff.get("energy", 0) >= 15:
        return "rest"
    if eff.get("hunger", 0) >= 10 or special in ("cook", "use_pantry"):
        return "food"
    if eff.get("hygiene", 0) >= 10:
        return "care"
    return "fun"


# --- Doing things ---------------------------------------------------------------------------------


def _begin(state, now, *, waking=False) -> list[str]:
    """Every move starts by catching the clock up with real time."""
    if state["status"] != "playing":
        raise GameError("This game is over. Start a new one!")
    messages: list[str] = []
    tick(state, now, messages)
    _daily_streak(state, now, messages)
    _prune_moodlets(state)
    if now is not None and now < state.get("busy_until", 0) - 0.5:
        raise GameError("Hold on, you're still busy.")
    asleep = state.get("asleep")
    if asleep and not waking:
        if asleep.get("until"):
            raise GameError(f"You're resting at the Health Centre until {clock_text(asleep['until'])}.")
        raise GameError("You're asleep. Wake up first.")
    return messages


def action_seconds(minutes: float) -> float:
    """How long an action plays out on screen (it 'takes' its minutes, but you don't wait them)."""
    lo, hi = ACTION_SECONDS
    return round(max(lo, min(hi, minutes / 4)), 1)  # an hour's work takes 15 s; a long shift 30 s


def journey_seconds(minutes: float) -> float:
    return round(max(JOURNEY_MIN_SECONDS, min(JOURNEY_MAX_SECONDS, minutes / JOURNEY_SPEEDUP)), 1)


def _finish(state, messages, now, playback_seconds: float = 0.0):
    state["turn"] += 1
    _check_collapse(state, messages)
    queued = state.pop("queued_event", None)
    if queued and state["phase"] == "play":
        _queue_event(state, queued)
    _check_badges(state, messages)
    for m in messages:
        _log(state, m)
    if now is not None:
        state["last_sync"] = now
        state["busy_until"] = now + playback_seconds
    state["playback"] = playback_seconds
    return state, messages


def skip_playback(state: dict, now: float) -> tuple[dict, list[str]]:
    """Stop watching what you're doing (Lagos Life's "tap to cancel"). The result is already in, so this only
    lets you move on straight away; nothing is gained or lost by skipping."""
    state = copy.deepcopy(state)
    if state.get("busy_until", 0) > now:
        state["busy_until"] = now
        state["playback"] = 0
    return state, []


def act(state: dict, action_id: str, now: float | None = None) -> tuple[dict, list[str]]:
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now, waking=action_id == "wake")
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    seconds = ACTION_SECONDS[0]
    if action_id == "wake":
        if not state.get("asleep"):
            raise GameError("You're already awake.")
        if state["asleep"].get("until"):
            raise GameError(f"You're resting at the Health Centre until {clock_text(state['asleep']['until'])}.")
        state["asleep"] = None
        messages.insert(0, f"You got up at {clock_text(tod(state))}." +
                        (" Still tired, though." if state["needs"]["energy"] < 60 else ""))
    elif action_id in ("write_ca", "write_exam"):
        test = _test_action(state)
        if not test or test["id"] != action_id:
            raise GameError("There's no test to write right now.")
        if not test["enabled"]:
            raise GameError(test["reason"])
        (_write_ca if action_id == "write_ca" else _write_exam)(state, messages)
        _fatigue(state, test["minutes"])
        seconds = ACTION_SECONDS[1]
    else:
        action = C.ACTIONS_BY_ID.get(action_id)
        if not action:
            raise GameError("Unknown action.")
        if action.get("profiles") and state["profile"] not in action["profiles"]:
            raise GameError("That's not available to you.")
        reason = _check(state, action)
        if reason == "Not here":
            raise GameError("You can't do that here. Go there first.")
        if reason:
            raise GameError(reason)
        _do_action(state, action, messages)
        seconds = action_seconds(duration(state, action)) if action.get("special") != "sleep" else ACTION_SECONDS[0]
    return _finish(state, messages, now, seconds)


def _do_action(state, action, messages):
    rng = _rng(state, action["id"])
    income_before = state["stats"]["hustle_income"]
    flags = state["flags"]
    cost = action_cost(state, action)
    minutes = duration(state, action)
    if cost:
        _spend(state, cost, pay_method(action), action["label"])

    effects = dict(action.get("effects", {}))
    special = action.get("special")
    line = action.get("done", action["label"])
    t0 = tod(state)

    if special == "lecture":
        lec = current_lecture(state)
        flags["attended_keys"].append(_lecture_key(state, lec))
        state["attended"] += 1
        state["stats"]["lectures"] += 1
        late = t0 - lec["start"]
        if lec["start"] == C.H(8) and t0 < C.H(8):
            state["stats"]["early"] += 1
        if late > C.LATE_GRACE:
            effects["prep"] = round(effects["prep"] * 0.8 * (1 - late / (C.LECTURE_MINUTES + 20)))
            line = f"{lec['code']}: {late} minutes late. No seat, so you stood by the window."
        elif -late >= C.SEAT_EARLY:
            effects["prep"] = round(effects["prep"] * 1.25)
            line = f"{lec['code']}: you came early and kept a seat in front."
            _add_moodlet(state, "front_seat")
        else:
            line = f"{lec['code']}: you found a seat at the back and signed the attendance sheet."
        _gain_rep(state, C.REP_FOR["lecture"], messages)
        if rng.random() < 0.12:
            effects.pop("prep", None)
            state["queued_event"] = "no_lecturer"
            minutes = 45
        else:
            state["class_moment"] = line
    elif special == "cook":
        if state["pantry"] > 0:
            state["pantry"] -= 1
            line = f"Cooked with your own foodstuff ({state['pantry']} meal{'s' if state['pantry'] != 1 else ''} left)."
        if W.BUILDINGS[home_building(state)]["style"] == "hall" and rng.random() < 0.12:
            state["queued_event"] = "stove"
    elif special == "use_pantry":
        state["pantry"] -= 1
    elif special == "foodstuff":
        state["pantry"] += 6
        line = f"Bought foodstuff: {state['pantry']} meals in your room. Cooking at home is free now."
    elif special == "fix_screen":
        state["phone"]["cracked"] = False
        line = f"New screen on your {C.PHONES[state['phone']['model']]['name']}. Like new."
    elif special == "buy_item":
        state["items"].append(action["item"])
        line = f"You bought {C.ITEMS[action['item']]['name'].lower()}!"
    elif special == "buy_phone":
        _add_moodlet(state, "new_phone")
        state["phone"] = {"model": action["phone"], "cracked": False}
        state["stats"]["phones"] += 1
        line = f"New phone: {C.PHONES[action['phone']]['name']}. Your apps are back."
    elif special == "sell_data":
        earn = _hustle_pay(state, rng.randint(10, 26) * 50)
        _add_money(state, earn)
        state["stats"]["hustle_income"] += earn
        line = f"Sold data bundles: +₦{earn:,}"
    elif special == "pay_fees":
        state["fees_paid"] = True
        line = f"Paid school charges (₦{C.SCHOOL_CHARGES:,}). Exam card collected!"
        if action["id"] == "pay_fees_bc":
            line = f"The business centre paid your school charges (₦{C.SCHOOL_CHARGES:,} + ₦200). Exam card collected!"
    elif special == "bath" and flags.get("no_water"):
        line = "Bought a bucket of water and had a bath (₦300)."
    elif special == "skit":
        state["stats"]["skits"] += 1
        level = skill_level(state, "content")
        camera = (phone_info(state) or {}).get("camera", 0)
        if level >= 2 and rng.random() < 0.06 + 0.04 * level + 0.02 * camera:
            earn = _hustle_pay(state, rng.randint(4, 10) * 500 * level)
            _add_money(state, earn)
            state["stats"]["hustle_income"] += earn
            flags["viral"] = True
            _add_moodlet(state, "viral")
            effects["social"] = effects.get("social", 0) + 25
            line = f"Your skit blew up! 200k views, new followers and ₦{earn:,} from gifts and promos."
        else:
            line = "Posted your skit. A few hundred views. Your mum shared it."
    elif special == "buy_business":
        state["businesses"][action["business"]] = state["total_days"]
        line = f"You started a {C.BUSINESSES[action['business']]['name'].lower()}! It pays out every night."
    elif special == "promote":
        p = C.PROMOS[action["promo"]]
        state["promo"] = {"boost": p["boost"], "until": state["total_days"] + p["nights"], "label": p["label"]}
        line = f"{p['label']}: done! Your business takings are up {int(p['boost'] * 100)}% for {p['nights']} night{'s' if p['nights'] > 1 else ''}."
    elif special == "sell_business":
        b = C.BUSINESSES[action["business"]]
        back = int(b["price"] * C.BUSINESS_RESALE)
        del state["businesses"][action["business"]]
        _add_money(state, back)
        line = f"Sold your {b['name'].lower()} for ₦{back:,}."
    elif special == "sleep":
        state["asleep"] = {"kind": "sleep", "since": state["clock"], "night": not C.WAKE_UP <= t0 < C.H(20)}
        line = (f"Lights off. Your alarm is set for {clock_text(C.WAKE_UP)}. "
                "Sleep takes real hours: come back in the morning, or wake up any time.")
    if action["id"] == "hol_tdb":
        state["stats"]["tdb"] += 1

    if action.get("earn"):
        earn = _hustle_pay(state, action["earn"], action.get("skill"))
        _receive(state, earn, f"Client payment: {action['label']}", "bank" if action.get("freelance") else "cash")
        state["stats"]["hustle_income"] += earn
        line = f"{action['label']}: +₦{earn:,}"
    if action.get("hustle"):
        state["stats"]["hustles"] += 1
        _gain_xp(state, "hustling", C.HUSTLE_XP, messages)
        _gain_rep(state, C.REP_FOR["hustle"], messages)
    # who you are changes how things feel
    if effects.get("hunger", 0) >= 25:
        _add_moodlet(state, "belle_full")
        if has_trait(state, "foodie"):
            effects["fun"] = effects.get("fun", 0) + 12
    if action["id"] in ("show", "hangout") and has_trait(state, "owambe"):
        effects["fun"] = effects.get("fun", 0) * 1.5
    if action["id"] in ("football", "jog"):
        _add_moodlet(state, "hall_pride") if action["id"] == "football" else None
        if has_trait(state, "gym_rat"):
            effects["fun"] = effects.get("fun", 0) + 12
    if action["id"] == "show":
        _add_moodlet(state, "hall_pride")
    if action["id"] == "hol_tdb" and has_trait(state, "night_crawler") and effects.get("prep"):
        effects["prep"] *= 1.15
    if effects.get("social", 0) > 0:
        _gain_xp(state, "charisma", max(2, round(effects["social"] / 5)), messages)
        effects["social"] = effects["social"] * (1 + C.CHARISMA_BONUS * (skill_level(state, "charisma") - 1))
        if has_trait(state, "smooth_talker"):
            effects["social"] *= 1.15
    if action.get("study"):
        state["stats"]["study_slots"] += 1
    if action.get("once_per_day"):
        flags[f"done_{action['id']}"] = state["total_days"]
    if action.get("weekly"):
        flags[f"week_{action['id']}"] = week_key(state)
    if action.get("skill") and action.get("xp"):
        _gain_xp(state, action["skill"], action["xp"], messages)

    # Reading counts for how you felt when you sat down, not after the time has gone.
    before = state["prep"]
    if action["id"] == "read_room" and effects.get("prep"):
        effects["prep"] *= 1 + C.HOME_STUDY_BONUS.get(housing_kind(state), 0)
    if action.get("study") and special != "lecture" and effects.get("prep", 0) > 0:
        effects["prep"] *= _brain(state, minutes)
    study_effects = {k: v for k, v in effects.items() if k == "prep"}
    _apply_effects(state, study_effects, study=bool(action.get("study")))
    if special != "sleep":
        _fatigue(state, minutes)
    _apply_effects(state, {k: v for k, v in effects.items() if k != "prep"})
    if action.get("freelance"):
        state["stats"]["freelance"] += 1
    if state.get("missions"):
        state["missions"]["earned"] += state["stats"]["hustle_income"] - income_before
    _mission_progress(state, messages, action=action)
    moment = state.pop("class_moment", None)
    if moment and state["phase"] == "play":
        _maybe_class_moment(state, rng, moment)
    if action.get("study") and state["prep"] > before:
        line += f" (readiness +{state['prep'] - before})"
    elif cost and not action.get("earn") and special not in ("pay_fees", "bath", "buy_business", "buy_phone",
                                                                "buy_item", "foodstuff", "fix_screen"):
        line += f" (₦{cost:,})"
    messages.insert(0, line)


def _brain(state, minutes: int) -> float:
    """Reading has diminishing returns in one day: after two and a half hours it slows, after five your brain is full."""
    flags = state["flags"]
    if flags.get("study_day") != state["total_days"]:
        flags["study_day"], flags["study_minutes"] = state["total_days"], 0
    done = flags["study_minutes"]
    flags["study_minutes"] = done + minutes
    return 1.0 if done < 150 else 0.5 if done < 300 else 0.15


def _gain_xp(state, skill, xp, messages):
    mult = {"hustling": "hustler", "charisma": "smooth_talker", "coding": "tech"}
    if skill in mult and has_trait(state, mult[skill]):
        xp = round(xp * (1.6 if skill == "coding" else 1.5))
    before = skill_level(state, skill)
    state["skills"][skill] += xp
    after = skill_level(state, skill)
    if after > before:
        messages.append(f"Level up! {C.SKILLS[skill]['name']} is now level {after}.")


def _business_payouts(state, messages):
    """Every night each business makes money after costs, or has a bad day."""
    if not state["businesses"]:
        return
    rng = _rng(state, f"biz{state['total_days']}")
    total, bad = 0, []
    for bid in sorted(state["businesses"]):
        b = C.BUSINESSES[bid]
        if rng.random() < b["bad_chance"]:
            loss = min(b["bad_loss"], state["money"] + total)
            total -= loss
            bad.append(b["bad_text"])
            continue
        amount = rng.randint(b["income"][0] // 50, b["income"][1] // 50) * 50
        if b.get("exam_boost") and state["day"] >= C.EXAM_DAYS[0] - 3:
            amount = int(amount * b["exam_boost"])
        if state["strike_days"]:
            amount //= 2  # campus is half empty during a strike
        amount = int(amount * (1 + C.HUSTLING_BONUS * (skill_level(state, "hustling") - 1)))
        promo = state.get("promo") or {}
        if promo.get("until", 0) > state["total_days"]:
            amount = int(amount * (1 + promo["boost"]))
        total += amount
    if total > 0:
        _add_money(state, total)
        state["stats"]["business_income"] += total
    elif total < 0:
        _add_money(state, total)
    line = f"Your business{'es' if len(state['businesses']) > 1 else ''} made ₦{total:,} today." if total >= 0 else \
        f"Bad day for business: you lost ₦{-total:,}."
    messages.append(" ".join([line] + bad))


def _check_badges(state, messages):
    have = set(state["badges"])
    s = state["stats"]
    grades = [c["grade"] for r in state["results"] for c in r["courses"]]
    earned = {
        "first_a": "A" in grades,
        "straight_as": any(r["gpa"] == 5.0 for r in state["results"]),
        "front_row": any(r.get("attendance") == 100 for r in state["results"]),
        "night_crawler": s["tdb"] >= 5,
        "hustle_king": s["hustle_income"] >= 100_000,
        "oga": bool(state["businesses"]),
        "tycoon": len(state["businesses"]) >= 3,
        "master": any(skill_level(state, k) >= len(C.SKILL_LEVELS) for k in C.SKILLS),
        "viral": bool(state["flags"].get("viral")),
        "strike": state["strike_used"] and not state["strike_days"] and state["phase"] != "event",
        "loan_app": s["loans"] > 0,
        "broke": total_money(state) == 0,
        "health_centre": s["collapses"] >= 3,
        "clean_sheet": state["status"] == "graduated" and "F" not in grades,
        "first_class": state["status"] == "graduated" and state.get("final", {}).get("class") == "First Class",
        "trekker": s["trekked"] * W.METRES_PER_UNIT >= 20_000,
        "early_bird": s["early"] >= 10,
        "own_ride": "bike" in state["items"] or "car" in state["items"],
        "upgrade": s.get("phones", 0) > 0,
        "dream": bool((dream_progress(state) or {}).get("done")),
        "legend": rep_level(state.get("rep", 0))[0] >= 16,
        "landlord": housing_kind(state) in ("single", "self_con", "flat"),
        "full_room": state["housing"].get("tenants", 1) >= 2,
        "odds": bool(state["flags"].get("bet_ever_won")),
        "freelancer": s.get("freelance", 0) >= 10,
    }
    for badge, ok in earned.items():
        if ok and badge not in have:
            state["badges"].append(badge)
            messages.append(f"Badge unlocked: {C.BADGES[badge][0]}!")



# --- Who you are, Campus Rep, missions, streaks, moodlets and lecture moments --------------------


def has_trait(state, trait: str) -> bool:
    return trait in state.get("traits", [])


def random_traits(seed: str) -> list[str]:
    return random.Random(f"{seed}-traits").sample(sorted(C.TRAITS), 2)


def clean_identity(traits, dream):
    if not isinstance(traits, list) or len(traits) != 2 or len(set(traits)) != 2 or any(t not in C.TRAITS for t in traits):
        raise GameError("Pick two different traits.")
    if dream not in C.DREAMS:
        raise GameError("Pick a dream.")
    return list(traits), dream


def rep_level(xp: int) -> tuple[int, int, int]:
    """(level, xp at the start of this level, xp needed for the next)."""
    level, floor = 1, 0
    while True:
        need = 100 + 60 * (level - 1)
        if xp < floor + need:
            return level, floor, floor + need
        floor += need
        level += 1


def rep_title(level: int) -> str:
    title = C.REP_TITLES[0][1]
    for at, name in C.REP_TITLES:
        if level >= at:
            title = name
    return title


def _gain_rep(state, amount: int, messages):
    if amount <= 0:
        return
    before = rep_level(state["rep"])[0]
    state["rep"] += amount
    after = rep_level(state["rep"])[0]
    if after > before:
        old, new = rep_title(before), rep_title(after)
        messages.append(f"Campus Rep level {after}!" + (f" You're now a {new}." if new != old else ""))


# Moodlets ------------------------------------------------------------------------------------------

def _add_moodlet(state, mid: str):
    name, emoji, value, hours = C.MOODLETS[mid]
    state["moodlets"] = [m for m in state["moodlets"] if m["id"] != mid]
    state["moodlets"].append({"id": mid, "until": state["clock"] + hours * 60})


def active_moodlets(state) -> list[dict]:
    out = []
    for m in state.get("moodlets", []):
        if m["until"] > state["clock"]:
            name, emoji, value, _ = C.MOODLETS[m["id"]]
            out.append({"id": m["id"], "name": name, "emoji": emoji, "value": value, "left": m["until"] - state["clock"]})
    live = []
    if total_money(state) < 500:
        live.append("sapa")
    elif total_money(state) >= 200_000:
        live.append("soft_life")
    if state["flags"].get("no_light"):
        live.append("no_light")
    for lid in live:
        name, emoji, value = C.LIVE_MOODLETS[lid]
        out.append({"id": lid, "name": name, "emoji": emoji, "value": value, "left": None})
    return out


def _prune_moodlets(state):
    state["moodlets"] = [m for m in state.get("moodlets", []) if m["until"] > state["clock"]]


# Missions and streak ------------------------------------------------------------------------------

def _new_missions(state):
    rng = random.Random(f"{state['seed']}-missions-{state['total_days']}")
    picks = []
    for tier in ("easy", "campus", "hustle"):
        m = rng.choice(C.MISSIONS[tier])
        picks.append({"id": m["id"], "tier": tier, "done": False})
    state["missions"] = {"day": state["total_days"], "list": picks, "bonus": False, "earned": 0}


def _mission_def(mid):
    for tier, items in C.MISSIONS.items():
        for m in items:
            if m["id"] == mid:
                return m
    return None


def _categories(action) -> set[str]:
    cats = set()
    eff = action.get("effects", {})
    if eff.get("hunger", 0) >= 25:
        cats.add("meal")
    if eff.get("social", 0) >= 8 or eff.get("fun", 0) >= 12:
        cats.add("social")
    if action.get("hustle"):
        cats.add("hustle")
    if action.get("learn"):
        cats.add("learn")
    if action.get("study"):
        cats.add("study")
    return cats


def _mission_progress(state, messages, *, action=None, visit=None):
    ms = state.get("missions")
    if not ms or ms["day"] != state["total_days"]:
        return
    for item in ms["list"]:
        if item["done"]:
            continue
        m = _mission_def(item["id"])
        hit = False
        if m["kind"] == "action" and action and action["id"] in m["ids"]:
            hit = True
        elif m["kind"] == "cat" and action and m["cat"] in _categories(action):
            hit = True
        elif m["kind"] == "visit" and visit == m["where"]:
            hit = True
        elif m["kind"] == "earn" and ms["earned"] >= m["amount"]:
            hit = True
        if hit:
            item["done"] = True
            money, rep = C.MISSION_REWARDS[item["tier"]]
            _add_money(state, money)
            _gain_rep(state, rep, messages)
            messages.append(f"Mission done: {m['label']}! +₦{money:,}, +{rep} Rep")
    if not ms["bonus"] and all(i["done"] for i in ms["list"]):
        ms["bonus"] = True
        money, rep = C.MISSION_BONUS
        _add_money(state, money)
        _gain_rep(state, rep, messages)
        messages.append(f"All three missions done today! Bonus ₦{money:,} and +{rep} Rep")


def lagos_date(now: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(now + 3600))  # Nigerian time, UTC+1


def _daily_streak(state, now, messages):
    """Come back on a new real day: the streak grows; miss a day and it starts again."""
    if now is None or state["status"] != "playing":
        return
    today = lagos_date(now)
    st = state.setdefault("streak", {"date": None, "day": 0})
    if st["date"] == today:
        return
    yesterday = lagos_date(now - 86_400)
    st["day"] = st["day"] % 7 + 1 if st["date"] == yesterday else 1
    st["date"] = today
    money, rep, text = C.STREAK_REWARDS[st["day"] - 1]
    if money:
        _add_money(state, money)
    _gain_rep(state, rep, messages)
    messages.append(f"Daily streak, day {st['day']} of 7: {text}!")


# Lecture moments ---------------------------------------------------------------------------------

def _maybe_class_moment(state, rng, lecture_line):
    if rng.random() >= C.CLASS_MOMENT_CHANCE:
        return
    if rng.random() < C.QUIZ_CHANCE:
        bank = C.QUIZZES.get(state["department"], []) + C.QUIZZES["gst"]
        q, options, answer = bank[rng.randrange(len(bank))]
        state["pending"] = {"id": "pop_quiz", "title": "Pop quiz!",
                            "text": f"The lecturer fires a question at the class: {q}",
                            "choices": [{"label": o, "enabled": True, "reason": None} for o in options],
                            "answer": answer}
    else:
        m = C.CLASS_MOMENTS[rng.randrange(len(C.CLASS_MOMENTS))]
        seat = "front row" if "front" in lecture_line else "back" if "back" in lecture_line else "window"
        state["pending"] = {"id": "class:" + m["id"], "title": m["title"], "text": m["text"].format(seat=seat),
                            "choices": [{"label": c["label"], "enabled": True, "reason": None} for c in m["choices"]]}
    state["phase"] = "event"


def _resolve_outcome(state, out, messages):
    _apply_effects(state, out.get("effects", {}))
    if out.get("moodlet"):
        _add_moodlet(state, out["moodlet"])
    if out.get("rep"):
        _gain_rep(state, out["rep"], messages)
    if out.get("charisma"):
        _gain_xp(state, "charisma", out["charisma"], messages)
    messages.append(out["result"])


def _choose_class(state, pending, index, messages):
    if pending["id"] == "pop_quiz":
        if not 0 <= index < len(pending["choices"]):
            raise GameError("Pick an answer.")
        right = pending["choices"][pending["answer"]]["label"]
        if index == pending["answer"]:
            _apply_effects(state, {"prep": 3, "fun": 4})
            _add_moodlet(state, "sharp")
            _gain_rep(state, 10, messages)
            messages.append(f"Correct: {right}. The lecturer wrote your name down. In a good way.")
        else:
            _apply_effects(state, {"fun": -4})
            messages.append(f"Wrong. The answer was: {right}. Now you'll never forget it.")
        return
    moment = next(m for m in C.CLASS_MOMENTS if "class:" + m["id"] == pending["id"])
    if not 0 <= index < len(moment["choices"]):
        raise GameError("Pick one of the options.")
    choice = moment["choices"][index]
    if "chance" in choice:
        chance = choice["chance"] + choice.get("per_prep", 0) * state["prep"]
        chance += 0.02 * (skill_level(state, "charisma") - 1)
        out = choice["success"] if _rng(state, pending["id"]).random() < min(0.9, chance) else choice["fail"]
    else:
        out = choice
    _resolve_outcome(state, out, messages)


def dream_progress(state) -> dict:
    d = state.get("dream")
    if not d:
        return None
    info = C.DREAMS[d]
    s = state["stats"]
    if d == "first_class":
        done = state.get("final", {}).get("class") == "First Class"
        note = f"CGPA {cgpa(state):.2f} of 4.50 needed" if state["results"] else "Get your first results"
    elif d == "celeb":
        lvl = rep_level(state["rep"])[0]
        done, note = lvl >= 12, f"Rep level {lvl} of 12"
    elif d == "tech":
        lvl = skill_level(state, "coding")
        done, note = lvl >= 10, f"Coding level {lvl} of 10"
    elif d == "odogwu":
        done, note = s["hustle_income"] >= 300_000, f"₦{s['hustle_income']:,} of ₦300,000 from hustles"
    else:
        done, note = len(state["businesses"]) >= 3, f"{len(state['businesses'])} of 3 businesses"
    return {"id": d, "name": info["name"], "emoji": info["emoji"], "text": info["text"], "done": done, "note": note}


# --- Moving around --------------------------------------------------------------------------------


def _plausible(state, pos, now=None) -> bool:
    """Could you have walked from where we last saw you to here in the real time that passed?"""
    if now is None or state.get("pos_time") is None:
        return True
    elapsed = max(0.0, now - state["pos_time"])
    return _dist_xy(state["pos"], pos) <= elapsed * WALK_UNITS_PER_SECOND * 1.6 + 30


def _clean_pos(pos):
    if (not isinstance(pos, (list, tuple)) or len(pos) != 2
            or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in pos)):
        raise GameError("Where are you?")
    x, z = float(pos[0]), float(pos[1])
    b = W.bounds()
    if not (b["x0"] - 40 <= x <= b["x1"] + 40 and b["z0"] - 40 <= z <= b["z1"] + 40):
        raise GameError("That's off the map.")
    return [round(x, 1), round(z, 1)]


def _update_pos(state, pos, now=None):
    """Accept the client's position if it's believable; otherwise keep the last one we trusted."""
    if pos is None or state["at"] or state.get("asleep"):
        return
    pos = _clean_pos(pos)
    if now is not None and now < state.get("busy_until", 0):
        return  # still on a journey
    if _plausible(state, pos, now):
        state["pos"] = pos
        state["pos_time"] = now


def sync(state: dict, now: float, pos=None) -> dict:
    """Heartbeat while the player roams: the clock catches up, and we note where they walked to."""
    state = upgrade(copy.deepcopy(state))
    messages: list[str] = []
    if state["status"] == "playing":
        tick(state, now, messages)
        _daily_streak(state, now, messages)
        _prune_moodlets(state)
        _update_pos(state, pos, now)
        queued = state.pop("queued_event", None)
        if queued and state["phase"] == "play":
            _queue_event(state, queued)
        _check_badges(state, messages)
        for m in messages:
            _log(state, m)
    return state, messages


def exit_building(state: dict, now: float | None = None):
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    if not state["at"]:
        raise GameError("You're already outside.")
    state["pos"] = _door(state["at"])
    state["pos_time"] = now
    state["at"] = None
    return _finish(state, messages, now)


def enter_building(state: dict, building: str, pos=None, now: float | None = None):
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    if building not in W.BUILDINGS:
        raise GameError("No such place.")
    if state["at"] == building:
        raise GameError("You're already inside.")
    if state["at"]:
        raise GameError("Step outside first.")
    door = _door(building)
    pos = _clean_pos(pos) if pos is not None else state["pos"]
    if _dist_xy(pos, door) > DOOR_RADIUS and W.distance_to_building(building, *pos) > 16:
        raise GameError("Walk up to the entrance first.")
    if not _plausible(state, pos, now):
        raise GameError("You can't get there that fast. Walk, or take a ride.")
    if not building_open(building, tod(state)):
        lo, hi = W.BUILDINGS[building]["hours"]
        raise GameError(f"{W.BUILDINGS[building]['name']} is closed. Open {clock_text(lo)} to {clock_text(hi)}.")
    state["at"] = building
    state["pos"] = door
    state["pos_time"] = now
    _mission_progress(state, messages, visit=building)
    return _finish(state, messages, now)


def _origin(state, pos=None, now=None) -> tuple[str, list[float] | None]:
    """The road node a trip starts from, plus where you're standing if you're not at a door."""
    if state["at"]:
        return W.BUILDINGS[state["at"]]["node"], None
    here = state["pos"]
    if pos is not None:
        p = _clean_pos(pos)
        if _plausible(state, p, now):
            here = p
    node = W.nearest_node(*here)
    return node, here


BUS_LOOP = W.BUS_ROUTE[:-1]  # the route starts and ends at the gate


BUS_ROADS = {frozenset(pair) for pair in zip(W.BUS_ROUTE, W.BUS_ROUTE[1:])}


def _bus_ride(s1: str, s2: str):
    """CNG buses run both ways along their roads (gate, halls, New Market, SUB): the shortest ride between stops."""
    import heapq
    best = {s1: 0.0}
    prev = {}
    heap = [(0.0, s1)]
    while heap:
        d, n = heapq.heappop(heap)
        if n == s2:
            break
        if d > best.get(n, math.inf):
            continue
        for m, w, _ in W.GRAPH[n]:
            if frozenset((n, m)) not in BUS_ROADS:
                continue
            if d + w < best.get(m, math.inf):
                best[m] = d + w
                prev[m] = n
                heapq.heappush(heap, (d + w, m))
    if s2 not in best:
        return None
    nodes = [s2]
    while nodes[-1] != s1:
        nodes.append(prev[nodes[-1]])
    return best[s2], nodes[::-1]


BUS_RIDES = {(a, b): r for a in W.BUS_STOPS for b in W.BUS_STOPS if a != b and (r := _bus_ride(a, b))}


def _rush(t: int) -> bool:
    return any(lo <= t < hi for lo, hi in W.RUSH_HOURS)


def _wait(state, mode: str, where: str, t_abs: int) -> int:
    """How long you'll stand at the park. Same answer for the same half hour, so quotes are honest."""
    rng = random.Random(f"{state['seed']}-wait-{mode}-{where}-{t_abs // 30}")
    t = t_abs % 1440
    rush = _rush(t)
    lo, hi = {"bus": (12, 35) if rush else (4, 12), "keke": (5, 14) if rush else (2, 7),
              "cab": (5, 10), "town_bus": (10, 25) if rush else (5, 14)}[mode]
    if mode == "keke" and where in W.KEKE_PARKS:
        lo, hi = max(1, lo // 2), max(3, hi // 2)  # kekes queue at the parks
    wait = rng.randint(lo, hi)
    if state["dow"] == 6 and mode in ("bus", "town_bus"):
        wait = round(wait * 1.6)  # Sunday: fewer buses
    return wait


def _segment(kind, points, minutes, mode=None, label=""):
    return {"kind": kind, "points": [list(p) for p in points], "minutes": int(minutes), "mode": mode, "label": label}


def _walk_minutes(length: float) -> int:
    return math.ceil(length / W.MODES["trek"]["speed"]) if length > 0.5 else 0


def _walk_segment(a: str, b: str, label=""):
    length, nodes = W.shortest_path(a, b)
    return _segment("walk", W.path_points(nodes), _walk_minutes(length), "trek", label), length


def _fare(amount: float) -> int:
    return int(math.ceil(amount / 50) * 50)


def _name(node: str) -> str:
    for b in W.BUILDINGS.values():
        if b["node"] == node:
            return b["name"]
    return {"gate": "the school gate", "c": "the central junction", "w": "the hall junction"}.get(node, "the junction")


def _night(t: int) -> bool:
    lo, hi = W.MODES["cab"]["night"]
    return t >= lo or t < hi


def modes_for(state) -> list[str]:
    """The ways you can travel: everyone can trek, bus, keke or cab; a bicycle or car if you own one."""
    out = ["trek", "bus", "keke", "cab"]
    for item in ("bike", "car"):
        if item in state["items"]:
            out.insert(1, item)
    return out


def _nearest_stop(node: str, exclude=("gate",)) -> str:
    stops = [s for s in W.BUS_STOPS if s not in exclude]
    return min(stops, key=lambda s: W.shortest_path(node, s)[0])


def plan_trip(state, to: str, mode: str, pos=None, now=None) -> dict:
    """One way to get somewhere: segments (walk, wait, ride) with minutes, the fare and the arrival time."""
    if to not in W.BUILDINGS:
        raise GameError("No such place.")
    if mode not in modes_for(state):
        raise GameError("Pick a way to travel.")
    start, here = _origin(state, pos, now)
    dest = W.BUILDINGS[to]["node"]
    clock = state["clock"]
    t = tod(state)
    info = W.MODES[mode]
    segments, cost = [], 0
    trekked = 0.0

    if here is not None:  # walk from where you're standing to the road
        first = _dist_xy(here, W.NODES[start])
        if first > 0.5:
            segments.append(_segment("walk", [here, W.NODES[start]], _walk_minutes(first), "trek"))
            trekked += first

    def unavailable(reason):
        return {"mode": mode, "name": info["name"], "available": False, "reason": reason, "blurb": info.get("blurb", "")}

    def walk(a, b, label=""):
        nonlocal trekked
        seg, length = _walk_segment(a, b, label)
        if seg["minutes"]:
            segments.append(seg)
            trekked += length

    def ride(a, b, m, wait_label=None, wait_at_clock=None):
        length, nodes = W.shortest_path(a, b)
        if wait_label:
            wait = _wait(state, m, a, wait_at_clock if wait_at_clock is not None else clock)
            segments.append(_segment("wait", [W.NODES[a]], wait, m, wait_label))
        segments.append(_segment("ride", W.path_points(nodes), max(1, math.ceil(length / W.MODES[m]["speed"])), m))
        return length

    if state["at"] == to:
        return unavailable("You're already here")
    if mode == "trek":
        walk(start, dest)
    elif mode in ("bike", "car"):
        length = ride(start, dest, mode)
        if mode == "car":
            cost = W.tiered(info["fuel"], length)
    elif mode == "keke":
        lo, hi = info["hours"]
        if not lo <= t < hi:
            return unavailable(f"Kekes run {clock_text(lo)} to {clock_text(hi)}")
        length = ride(start, dest, "keke", "Waiting for a keke")
        cost = W.tiered(info["fares"], length)
    elif mode == "cab":
        if not _night(t):
            return unavailable("Night cabs run from 9 PM to 6 AM")
        inbound = start in ("town", "gate") and dest not in ("town", "gate")
        outbound = dest in ("town", "gate") and start not in ("town", "gate")
        if not (inbound or outbound):
            return unavailable("Night cabs only go between the Main Gate and the bus stops")
        if inbound:
            if start == "town":
                walk("town", "gate", "Walk to the Main Gate")
            stop = _nearest_stop(dest)
            length = ride("gate", stop, "cab", "Waiting for a cab at the gate",
                          clock + sum(s["minutes"] for s in segments))
            walk(stop, dest)
        else:
            stop = _nearest_stop(start)
            walk(start, stop, f"Walk to the bus stop at {W.STOP_NAMES[stop]}")
            length = ride(stop, "gate", "cab", f"Waiting for a cab at {W.STOP_NAMES[stop]}",
                          clock + sum(s["minutes"] for s in segments))
            if dest == "town":
                walk("gate", "town", "Walk to Asherifa")
        cost = W.tiered(info["fares"], length)
    else:  # bus: town bus to/from the gate if you live in town, and the CNG campus bus inside
        bus_lo, bus_hi = info["hours"]
        tb = W.MODES["town_bus"]
        here_node, at_clock = start, clock
        legs_end = dest
        if start == "town" or dest == "town":
            if not tb["hours"][0] <= t < tb["hours"][1]:
                return unavailable(f"Town buses run {clock_text(tb['hours'][0])} to {clock_text(tb['hours'][1])}")
        if start == "town":
            ride("town", "gate", "town_bus", "Waiting for a town bus")
            cost += tb["fare"]
            here_node, at_clock = "gate", clock + sum(s["minutes"] for s in segments)
        if dest == "town":
            legs_end = "gate"
        campus = None
        if here_node != legs_end:
            ct = at_clock % 1440
            walk_all = W.shortest_path(here_node, legs_end)[0]
            if bus_lo <= ct < bus_hi:
                for (s1, s2), (ride_len, ride_nodes) in BUS_RIDES.items():
                    w1 = W.shortest_path(here_node, s1)[0]
                    w2 = W.shortest_path(s2, legs_end)[0]
                    wait = _wait(state, "bus", s1, at_clock + _walk_minutes(w1))
                    total = _walk_minutes(w1) + wait + math.ceil(ride_len / info["speed"]) + _walk_minutes(w2)
                    if campus is None or total < campus[0]:
                        campus = (total, s1, s2, wait, ride_len, ride_nodes)
            if campus is None and start != "town" and dest != "town":
                return unavailable(f"CNG buses run {clock_text(bus_lo)} to {clock_text(bus_hi)}")
            if campus and campus[0] >= _walk_minutes(walk_all) and start != "town" and dest != "town":
                return unavailable("No bus goes that way. It's quicker to walk")
            if campus and campus[0] < _walk_minutes(walk_all):
                _, s1, s2, wait, ride_len, ride_nodes = campus
                walk(here_node, s1, f"Walk to the bus stop at {W.STOP_NAMES[s1]}")
                segments.append(_segment("wait", [W.NODES[s1]], wait, "bus", "Queueing for the CNG bus"))
                segments.append(_segment("ride", W.path_points(ride_nodes), math.ceil(ride_len / info["speed"]), "bus"))
                cost += info["fare"]
                walk(s2, legs_end)
            else:
                walk(here_node, legs_end)
        if dest == "town":
            ride("gate", "town", "town_bus", "Waiting for a town bus", clock + sum(s["minutes"] for s in segments))
            cost += tb["fare"]
        if not any(s["kind"] == "ride" for s in segments):
            return unavailable("No bus goes that way. It's quicker to walk")

    minutes = sum(s["minutes"] for s in segments)
    walk_m = sum(s["minutes"] for s in segments if s["kind"] == "walk")
    wait_m = sum(s["minutes"] for s in segments if s["kind"] == "wait")
    name = info["name"]
    if mode == "bus" and any(s["mode"] == "town_bus" for s in segments):
        name = "Town bus + CNG bus" if any(s["mode"] == "bus" for s in segments) else "Town bus + trek"
    seconds = journey_seconds(minutes)
    arrive = clock + math.ceil(seconds / 60)
    reason = pay_reason(state, cost, "any" if mode == "car" else "cash")
    if reason and mode != "car" and total_money(state) >= cost:
        reason = "Fares are cash only: withdraw at an ATM or POS first"
    return {"mode": mode, "name": name, "available": reason is None, "reason": reason, "blurb": info.get("blurb", ""),
            "minutes": minutes, "walk": walk_m, "wait": wait_m, "cost": cost, "arrive_at": arrive, "seconds": seconds,
            "arrive": clock_text(arrive), "segments": segments, "trekked": round(trekked, 1), "to": to,
            "rush": _rush(t) and mode == "bus"}


def plan(state: dict, to: str, pos=None, now: float | None = None) -> dict:
    """All the ways to get there from here, for the travel picker. Doesn't change the game."""
    state = upgrade(copy.deepcopy(state))
    tick(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    b = W.BUILDINGS.get(to)
    if not b:
        raise GameError("No such place.")
    options = [plan_trip(state, to, m, pos, now) for m in modes_for(state)]
    arrive = next((o["arrive_at"] for o in options if o.get("arrive_at")), state["clock"])
    return {"to": to, "name": b["name"], "now": clock_text(state["clock"]), "options": options,
            "open_on_arrival": building_open(to, arrive % 1440),
            "hours": [clock_text(h) for h in b["hours"]] if b["hours"] else None}


def travel(state: dict, to: str, mode: str, pos=None, now: float | None = None):
    """Take the trip: pay, let the journey's time pass, and arrive (inside, if it's open)."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    trip = plan_trip(state, to, mode, pos, now)
    if not trip["available"]:
        raise GameError(trip["reason"])
    if trip["cost"]:
        _spend(state, trip["cost"], "any" if mode == "car" else "cash", "Fuel")
    depart = state["clock"]
    for seg in trip["segments"]:
        kind = "cycle" if seg["mode"] == "bike" else seg["kind"]
        _fatigue(state, seg["minutes"], C.TRAVEL_EFFECTS[kind])
    state["stats"]["trekked"] = round(state["stats"]["trekked"] + trip["trekked"], 1)
    state["stats"]["trips"] += 1
    state["stats"]["modes"][mode] = state["stats"]["modes"].get(mode, 0) + 1
    b = W.BUILDINGS[to]
    seconds = trip["seconds"]
    state["pos"] = _door(to)
    state["pos_time"] = (now + seconds) if now is not None else None
    if state["phase"] == "results":
        state["at"] = None
    elif building_open(to, tod(state)):
        state["at"] = to
        _mission_progress(state, messages, visit=to)
    else:
        state["at"] = None
        lo, hi = b["hours"]
        messages.append(f"{b['name']} is closed. It opens {clock_text(lo)} to {clock_text(hi)}.")
    how = {"trek": "Trekked", "bus": "Took the bus", "keke": "Took a keke", "cab": "Took a night cab",
           "bike": "Cycled", "car": "Drove"}[mode]
    name = home_name(state) if to == home_building(state) else b["name"]
    messages.insert(0, f"{how} to {name}" + (f", ₦{trip['cost']:,}" if trip["cost"] else "")
                    + (f" (the queue was long)" if trip["wait"] >= 10 else "") + ".")
    state["last_trip"] = {"mode": mode, "name": trip["name"], "segments": trip["segments"], "depart": depart,
                          "arrive": state["clock"], "to": to, "turn": state["turn"] + 1, "seconds": seconds,
                          "minutes": trip["minutes"]}
    return _finish(state, messages, now, seconds)


def set_look(state: dict, look, traits=None, dream=None) -> dict:
    """Change how you look. Your hall, traits and dream can only change before you've settled in (day one)."""
    state = upgrade(copy.deepcopy(state))
    new = clean_look(look)
    old_home = home_building(state)
    settling_in = settling(state)
    if traits is not None or dream is not None:
        if not settling_in:
            raise GameError("Your traits and dream are set once you've settled in.")
        state["traits"], state["dream"] = clean_identity(traits if traits is not None else state["traits"],
                                                         dream if dream is not None else state["dream"])
    if not settling_in:
        new["hall"] = state["look"].get("hall", 0)
    state["look"] = new
    home = home_building(state)
    if housing_kind(state) == "hostel" and state["housing"]["building"] not in C.HALLS[gender(new)]:
        state["housing"] = default_housing(state["seed"], new)  # the server finds you a room in the new hall
        home = home_building(state)
    if home != old_home and state["at"] == old_home:
        state["at"] = home
        state["pos"] = _door(home)
    return state


# --- Tests, exams and results ---------------------------------------------------------------------


def _performance(state, rng, weight: float) -> float:
    """A test/exam score from readiness, attendance and how you feel."""
    n = len(state["courses"])
    prep = state["prep"] / (1 + 0.03 * max(0, n - C.COURSES_PER_SEMESTER))
    held = max(1, lectures_held_now(state))
    attendance = min(1, state["attended"] / held)
    level = min((state["semester"] - 1) // 2, 3)
    score = (
        19 + prep * 0.69
        + (attendance * 12 - 6) * weight
        + (mood(state) - 60) / 5
        - (8 if state["needs"]["energy"] < 25 else 0)
        - (6 if burnt_out(state) else 0)
        - C.DEPARTMENTS[state["department"]]["difficulty"]
        - level * 0.5
    )
    return score


def _write_ca(state, messages):
    rng = _rng(state, "ca")
    # The CA covers only the first few days of work, so less readiness is expected than for exams.
    state["ca"] = _clamp(round(_performance(state, rng, 0.5) + 14 + rng.uniform(-6, 6)))
    _apply_effects(state, {"energy": -8, "fun": -5})
    verdict = "You flew through it!" if state["ca"] >= 70 else "Not bad." if state["ca"] >= 50 else "That was rough."
    messages.append(f"Wrote the CA test. {verdict} You'll see your score on the result slip.")


def _write_exam(state, messages):
    rng = _rng(state, "exam")
    courses = state["courses"]
    half = (len(courses) + 1) // 2
    today = courses[:half] if state["day"] == C.EXAM_DAYS[0] else courses[half:]
    state["flags"]["exam_day_done"] = state["total_days"]
    if not state["fees_paid"]:
        for c in today:
            state["exam_scores"][c["code"]] = 0
        messages.append("No exam card! You were turned back at the exam hall. Pay your school charges.")
        _apply_effects(state, {"fun": -25, "energy": -5})
        return
    base = _performance(state, rng, 1.0)
    for c in today:
        state["exam_scores"][c["code"]] = _clamp(round(base + rng.uniform(-8, 8)))
    _apply_effects(state, {"energy": -10, "fun": -6})
    messages.append(f"Wrote {', '.join(c['code'] for c in today)}.")


def grade_for(total: int) -> tuple[str, int]:
    for floor, grade, points in C.GRADE_BANDS:
        if total >= floor:
            return grade, points
    return "F", 0


def _compute_results(state, messages):
    rng = _rng(state, "results")
    rows = []
    ca_base = state["ca"] if state["ca"] is not None else 0
    for c in state["courses"]:
        ca = _clamp(round(ca_base + rng.uniform(-5, 5))) if state["ca"] is not None else 0
        exam = state["exam_scores"].get(c["code"], 0)
        total = round(ca * 0.3 + exam * 0.7)
        grade, points = grade_for(total)
        rows.append({"code": c["code"], "carry": c["carry"], "ca": round(ca * 0.3), "exam": round(exam * 0.7),
                     "total": total, "grade": grade, "points": points})
    gpa = round(sum(r["points"] for r in rows) / len(rows), 2) if rows else 0.0
    result = {"semester": state["semester"], "label": level_label(state), "courses": rows, "gpa": gpa,
              "attendance": round(100 * min(1, state["attended"] / max(1, state["lectures_held"])))}
    state["results"].append(result)

    failed = [r["code"] for r in rows if r["grade"] == "F"]
    passed = {r["code"] for r in rows if r["grade"] != "F"}
    state["carryovers"] = [c for c in state["carryovers"] if c not in passed] + [
        c for c in failed if c not in state["carryovers"]]

    result["cgpa"] = cgpa(state)
    state["last_result"] = result
    _gain_rep(state, C.REP_FOR["a_grade"] * sum(1 for r in rows if r["grade"] == "A"), messages)
    if failed:
        _add_moodlet(state, "carry_over")
    elif gpa >= 4.5:
        _add_moodlet(state, "straight_as")
    state["phase"] = "results"
    messages.append(f"Results are out: GPA {gpa:.2f}, CGPA {result['cgpa']:.2f}.")

    if failed:
        result["note"] = f"{len(failed)} carryover{'s' if len(failed) > 1 else ''}: you'll rewrite {', '.join(failed)}."


def cgpa(state) -> float:
    points = [r["points"] for res in state["results"] for r in res["courses"]]
    return round(sum(points) / len(points), 2) if points else 0.0


def degree_class(value: float) -> str:
    for floor, name in C.DEGREE_CLASSES:
        if value >= floor:
            return name
    return C.DEGREE_CLASSES[-1][1]


def graduates_now(state) -> bool:
    """After this semester's results, is the degree over?"""
    return state["semester"] >= C.SEMESTERS and (
        not state["carryovers"] or state["semester"] >= C.SEMESTERS + C.MAX_EXTRA_SEMESTERS)


def continue_after_results(state: dict, now: float | None = None) -> tuple[dict, list[str]]:
    state = upgrade(copy.deepcopy(state))
    if state["phase"] != "results":
        raise GameError("Nothing to continue.")
    state["turn"] += 1
    messages = []
    if graduates_now(state):
        final = cgpa(state)
        state["status"] = "graduated"
        state["phase"] = "graduated"
        state["final"] = {"cgpa": final, "class": degree_class(final), "outstanding": list(state["carryovers"]),
                          "semesters": state["semester"], "days": state["total_days"],
                          "earned": state["stats"]["hustle_income"], "hustles": state["stats"]["hustles"],
                          "lectures": state["stats"]["lectures"], "strike": state["strike_used"],
                          "trekked_km": round(state["stats"]["trekked"] * W.METRES_PER_UNIT / 1000, 1)}
        messages.append(f"You've finished! Final CGPA {final:.2f}: {degree_class(final)}.")
        _check_badges(state, messages)
        state["final"]["badges"] = len(state["badges"])
        state["final"]["business_income"] = state["stats"]["business_income"]
    else:
        # A short break: lectures start on the next school day. The break doesn't wear you out.
        state["semester"] += 1
        if now is not None and state.get("epoch") is not None:
            target = real_clock(state, now)
            gap = max(0, target // 1440 - state["clock"] // 1440)
            state["total_days"] += gap
            state["dow"] = (state["dow"] + gap) % 7
            state["clock"] = max(state["clock"], target)
            state["last_tick"] = now
        home = home_building(state)
        state.update(day=0, prep=min(25, 8 + state["prep"] // 8), attended=0, lectures_held=0,
                     ca=None, exam_scores={}, phase="play", last_result=None, at=home, pos=_door(home), asleep=None)
        state["pos_time"] = now
        state["fees_paid"] = bool(C.PROFILES[state["profile"]]["fees_covered"])
        state["flags"]["seen"] = []
        state["flags"]["attended_keys"] = []
        state["courses"] = _semester_courses(state)
        state["timetable"] = _make_timetable(state)
        messages.append(f"New semester: {level_label(state)}. Lectures start on the next school day.")
        _start_of_day(state, _rng(state, "day"), messages)
        if state["semester"] % 2 == 1 and state["phase"] == "play":
            _queue_rent(state)
        _check_badges(state, messages)
    if now is not None:
        state["last_sync"] = now
    for m in messages:
        _log(state, m)
    return state, messages


def _queue_fees_deadline(state):
    days = C.EXAM_DAYS[0] - state["day"]
    short = C.SCHOOL_CHARGES - spendable(state)
    when = "tomorrow" if days == 1 else f"in {days} days"
    if short <= 0:
        text = f"Exams start {when}. You still haven't paid your school charges, and without an exam card you can't write."
        choices = [{"label": f"Pay ₦{C.SCHOOL_CHARGES:,} on the portal now", "enabled": True, "reason": None},
                   {"label": "Later", "enabled": True, "reason": None}]
    else:
        repay = round(short * (1 + C.LOAN_APP_INTEREST) / 50) * 50
        text = (f"Exams start {when}. You need ₦{C.SCHOOL_CHARGES:,} for school charges and you're ₦{short:,} short. "
                "No exam card, no exams.")
        choices = [{"label": "I'll hustle the money", "enabled": True, "reason": None},
                   {"label": f"Borrow ₦{short:,} from a loan app (repay ₦{repay:,})", "enabled": True, "reason": None}]
    state["pending"] = {"id": "fees_deadline", "title": "No exam card yet", "text": text, "choices": choices,
                        "short": max(0, short)}
    state["phase"] = "event"


def _queue_event(state, event_id):
    event = C.EVENTS_BY_ID[event_id]
    state["flags"]["seen"].append(event_id)
    choices = []
    for c in event["choices"]:
        cost = c.get("cost", 0)
        choices.append({"label": c["label"], "enabled": spendable(state) >= cost,
                        "reason": None if spendable(state) >= cost else "Not enough money"})
    if not any(ch["enabled"] for ch in choices):  # always leave a way out
        choices[-1].update(enabled=True, reason=None)
    state["pending"] = {"id": event_id, "title": event["title"], "text": event["text"], "choices": choices}
    state["phase"] = "event"


def choose(state: dict, index: int, now: float | None = None) -> tuple[dict, list[str]]:
    state = upgrade(copy.deepcopy(state))
    pending = state.get("pending")
    if state["phase"] != "event" or not pending:
        raise GameError("No event to respond to.")
    messages = []
    if pending["id"] == "pop_quiz" or pending["id"].startswith("class:"):
        _choose_class(state, pending, index, messages)
    elif pending["id"] == "strike":
        messages.append(C.STRIKE["choices"][0]["result"])
    elif pending["id"] == "rent_due":
        _choose_rent(state, pending, index, messages)
    elif pending["id"] == "fees_deadline":
        if index not in (0, 1):
            raise GameError("Pick one of the options.")
        short = pending.get("short", 0)
        if index == 1 and short == 0:
            messages.append("Okay. Don't forget: pay on the portal before exams.")
        elif index == 1:
            repay = round(short * (1 + C.LOAN_APP_INTEREST) / 50) * 50
            _receive(state, short, "Loan app")
            state["flags"]["debt"] = state["flags"].get("debt", 0) + repay
            state["stats"]["loans"] += 1
            messages.append(f"₦{short:,} landed. The loan app will take back ₦{repay:,} from any money you get.")
        elif short == 0:
            _spend(state, C.SCHOOL_CHARGES, "any", "School charges")
            state["fees_paid"] = True
            messages.append(f"Paid school charges (₦{C.SCHOOL_CHARGES:,}). Exam card collected!")
        else:
            messages.append("Exams are coming. Hustle hard, then pay on the portal.")
    else:
        event = C.EVENTS_BY_ID[pending["id"]]
        if not 0 <= index < len(event["choices"]):
            raise GameError("Pick one of the options.")
        if not pending["choices"][index]["enabled"]:
            raise GameError(pending["choices"][index]["reason"] or "You can't pick that.")
        choice = event["choices"][index]
        cost = min(choice.get("cost", 0), spendable(state))
        if cost:
            _spend(state, cost, "any", pending["title"])
        if choice.get("money"):
            _add_money(state, choice["money"])
        if choice.get("money_from_flag"):
            _add_money(state, state["flags"].get(choice["money_from_flag"], 0))
        for key in choice.get("clear_flags", []):
            state["flags"].pop(key, None)
            state["flags"].pop(f"{key}_day", None)
        for key, value in choice.get("flags", {}).items():
            state["flags"][key] = value
            state["flags"][f"{key}_day"] = state["total_days"]
        _apply_effects(state, choice.get("effects", {}))
        if choice.get("phone") == "crack" and state.get("phone"):
            state["phone"]["cracked"] = True
        elif choice.get("phone") == "lose":
            state["phone"] = None
        messages.append(choice["result"])
        _gain_rep(state, C.REP_FOR["event"], messages)
    state["pending"] = None
    state["phase"] = "play"
    state["turn"] += 1
    if now is not None:
        state["last_sync"] = now
    _check_badges(state, messages)
    for m in messages:
        _log(state, m)
    return state, messages


# --- Money from home, betting and where you live -----------------------------------------------------


NO_MONEY = ["'Things are hard, my child. Next week, by God's grace.'",
            "'Your daddy's salary hasn't entered. Manage, ehn.'",
            "'Did you finish the one we sent last week? What are you doing with money in that school?'",
            "Network was bad. They said they'll call you back. They didn't."]


def ask_parents(state: dict, amount: int, now: float | None = None) -> tuple[dict, list[str]]:
    """Call home for money. Parents never send everything you ask for, and never more than their cap."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    if not state.get("phone"):
        raise GameError("You need a phone to call home.")
    if amount not in C.PARENT_ASKS:
        raise GameError("Pick how much to ask for.")
    if not state.get("bank"):
        raise GameError("'Send me your account number.' Open a bank account first so your parents can send money.")
    if not C.H(7) <= tod(state) < C.H(22):
        raise GameError("It's too late to call home. Try after 7:00 AM.")
    flags = state["flags"]
    if flags.get("parents_week") == week_key(state):
        raise GameError("You've already called home this week. Try again next Monday.")
    flags["parents_week"] = week_key(state)
    p = C.PROFILES[state["profile"]]
    rng = _rng(state, "parents")
    cap = p["parent_cap"]
    if rng.random() < p["parent_no_money"]:
        give = 0
        line = f"You asked for ₦{amount:,}. {rng.choice(NO_MONEY)}"
    else:
        floor = {"lapo_baby": 0.4, "nepo_baby": 0.6, "odogwu": 0.85}.get(state["profile"], 0.5)
        give = max(500, int(min(amount, cap) * rng.uniform(floor, 1.0) // 500 * 500))
        if amount > cap:
            line = (f"'₦{amount:,}? Do you think money grows on trees?' After a long lecture, they sent ₦{give:,}.")
            _add_moodlet(state, "lecture_from_home")
        elif give < amount:
            line = f"You asked for ₦{amount:,}. They sent ₦{give:,}. 'Manage it well.'"
        else:
            line = f"They sent the full ₦{give:,}. 'Make us proud.'"
    if give:
        _receive(state, give, "Transfer from home")
        state["stats"]["parents_sent"] += give
        _add_moodlet(state, "mummys_alert")
    _apply_effects(state, {"social": 6})
    messages.insert(0, line)
    return _finish(state, messages, now, 5)


def fixtures(state, now: float | None = None) -> list[dict]:
    """Four virtual matches. They change every 10 minutes and everyone sees the same ones."""
    slot = int(now // 600) if now is not None else state["clock"] // 10
    rng = random.Random(f"fixtures-{slot}")
    teams = rng.sample(C.BET_TEAMS, 8)
    out = []
    for i in range(4):
        home, away = teams[2 * i], teams[2 * i + 1]
        h, a = rng.uniform(0.8, 1.6), rng.uniform(0.6, 1.4)
        draw = 0.27
        p_home = (1 - draw) * h / (h + a)
        probs = {"1": p_home, "X": draw, "2": 1 - draw - p_home}
        odds = {k: max(1.05, round(1 / (v * (1 + C.BET_MARGIN)), 2)) for k, v in probs.items()}
        out.append({"index": i, "home": home, "away": away, "odds": odds, "probs": probs, "slot": slot})
    return out


def place_bet(state: dict, match: int, pick: str, stake: int, adult: bool = False,
              now: float | None = None) -> tuple[dict, list[str]]:
    """A bet on a virtual match: settled in seconds. The odds are fair minus the bookie's cut."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    if not has_smartphone(state):
        raise GameError("Betting apps need a smartphone.")
    flags = state["flags"]
    if not flags.get("bet_adult"):
        if not adult:
            raise GameError("Betting is for 18 and over. Confirm your age first.")
        flags["bet_adult"] = True
    if stake not in C.BET_STAKES:
        raise GameError("Pick a stake.")
    if not state.get("bank"):
        raise GameError("Fund your betting wallet from a bank account. Open one first.")
    if bank_balance(state) < stake:
        raise GameError("Not enough in your account for that stake.")
    if flags.get("bet_day") != state["total_days"]:
        flags["bet_day"], flags["bets_today"] = state["total_days"], 0
    if flags["bets_today"] >= 10:
        raise GameError("That's 10 bets today. The app has locked you out until tomorrow.")
    games = fixtures(state, now)
    if not 0 <= match < len(games) or pick not in ("1", "X", "2"):
        raise GameError("Pick a match and a result.")
    g = games[match]
    rng = _rng(state, "bet")
    r = rng.random()
    result = "1" if r < g["probs"]["1"] else "X" if r < g["probs"]["1"] + g["probs"]["X"] else "2"
    goals = {"1": (rng.randint(1, 3), 0), "X": (rng.randint(0, 2),) * 2, "2": (0, rng.randint(1, 3))}[result]
    if result == "1":
        goals = (goals[0], rng.randint(0, goals[0] - 1))
    elif result == "2":
        goals = (rng.randint(0, goals[1] - 1), goals[1])
    score = f"{g['home']} {goals[0]}-{goals[1]} {g['away']}"
    flags["bets_today"] += 1
    _bank_move(state, -stake, "Bet stake")
    state["stats"]["bets"] += 1
    state["stats"]["staked"] += stake
    if pick == result:
        win = int(round(stake * g["odds"][pick]))
        _bank_move(state, win, "Bet winnings")
        state["stats"]["bet_won"] += win
        _add_moodlet(state, "odds_landed")
        flags["bet_ever_won"] = True
        messages.insert(0, f"{score}. Odds landed! ₦{stake:,} became ₦{win:,}.")
    else:
        _add_moodlet(state, "bet_cut")
        messages.insert(0, f"{score}. Bet cut. You lost ₦{stake:,}.")
    # when the goals went in, so the phone can play the match out minute by minute instead of in a blink
    minutes = sorted(rng.sample(range(2, 90), goals[0] + goals[1]))
    sides = ["home"] * goals[0] + ["away"] * goals[1]
    rng.shuffle(sides)
    state["last_bet"] = {"score": score, "won": pick == result, "pick": pick, "result": result,
                         "home": g["home"], "away": g["away"], "stake": stake,
                         "goals": [[m, side] for m, side in zip(minutes, sides)], "at": now}
    return _finish(state, messages, now, BET_MATCH_SECONDS)


# --- Banking: accounts, the counter, ATMs, POS agents and transfers -----------------------------


def at_branch(state) -> bool:
    return state["at"] == "banks"


def branch_open(state) -> bool:
    lo, hi = C.BANK_HOURS
    return state["dow"] < 5 and lo <= tod(state) < hi


def atm_here(state):
    """The ATM where you are: "" for the Banking Area (every bank has one), a bank id, or None."""
    if state["at"] not in C.ATM_SPOTS:
        return None
    return C.ATM_SPOTS[state["at"]] or ""


def pos_here(state) -> bool:
    at = state["at"]
    if not at:
        return False
    return W.BUILDINGS[at]["kind"] in C.POS_KINDS or at in C.POS_PLACES


def pos_charge(state, amount: int) -> int:
    night = tod(state) >= C.H(20) and W.BUILDINGS[state["at"]]["kind"] in ("hall", "home")
    return C.pos_fee(amount) + (C.POS_NIGHT_FEE if night else 0)


def _daily(bank, key: str, day: int) -> int:
    if bank.get(f"{key}_day") != day:
        bank[f"{key}_day"], bank[f"{key}_today"] = day, 0
    return bank[f"{key}_today"]


def _amount(amount, lo, hi, step=1, what="amount") -> int:
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        raise GameError("Enter an amount.")
    if amount < lo:
        raise GameError(f"The smallest {what} is ₦{lo:,}.")
    if amount > hi:
        raise GameError(f"The most you can do at once is ₦{hi:,}.")
    if amount % step:
        raise GameError(f"Use a multiple of ₦{step:,}.")
    return amount


def _bank_open_check(state):
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")


def open_account(state: dict, bank_id: str, number: str, now: float | None = None) -> tuple[dict, list[str]]:
    """Open an account: at a branch in the Banking Area, or in a fintech app on a smartphone."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    _bank_open_check(state)
    if bank_id not in C.BANKS:
        raise GameError("Pick a bank.")
    if state.get("bank"):
        raise GameError(f"You already have a {C.BANKS[state['bank']['bank']]['name']} account.")
    b = C.BANKS[bank_id]
    if b["app"]:
        if not has_smartphone(state):
            raise GameError(f"{b['name']} is an app. You need a smartphone to open an account.")
        need = 0
    else:
        if not at_branch(state):
            raise GameError(f"Go to the {b['name']} branch in the Banking Area to open an account.")
        if not branch_open(state):
            raise GameError("Banks open 8:00 AM to 4:00 PM, Monday to Friday.")
        need = C.BANK_OPEN_DEPOSIT + C.CARD_FEE
    if state["money"] < need:
        raise GameError(f"Bring ₦{need:,} cash: ₦{C.BANK_OPEN_DEPOSIT:,} opening deposit and ₦{C.CARD_FEE:,} for "
                        "your debit card.")
    state["money"] -= need
    state["stats"]["spent"] += C.CARD_FEE if need else 0
    state["bank"] = {"bank": bank_id, "number": number, "balance": 0, "card": not b["app"], "history": []}
    if need:
        _bank_move(state, C.BANK_OPEN_DEPOSIT, "Opening deposit")
    messages.insert(0, f"Account opened! {b['name']}, account number {number}." +
                    (" Your debit card is ready: use it at ATMs and POS." if not b["app"]
                     else " Cash out at any POS agent by transfer."))
    held = state["flags"].pop("held_allowance", 0)
    if held:
        _receive(state, held, "Allowance from home")
        messages.append(f"Credit alert! Your parents sent the ₦{held:,} allowance they were holding.")
        _add_moodlet(state, "mummys_alert")
    _mission_progress(state, messages, visit="banks")
    return _finish(state, messages, now, 6)


def bank_counter(state: dict, kind: str, amount: int, now: float | None = None, hall: str | None = None) -> tuple[dict, list[str]]:
    """Deposit cash or withdraw over the counter in your own bank's hall. Free, but only in banking hours."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    _bank_open_check(state)
    bank = state.get("bank")
    if not bank:
        raise GameError("Open an account first.")
    name = C.BANKS[bank["bank"]]["name"]
    if C.BANKS[bank["bank"]]["app"]:
        raise GameError(f"{name} has no branch. Use a POS agent to deposit or withdraw.")
    if not at_branch(state):
        raise GameError("Go to the Banking Area.")
    if hall and hall != bank["bank"]:
        raise GameError(f"You bank with {name}. Use the {name} hall, or the ATM.")
    if not branch_open(state):
        raise GameError("The banking hall is closed. Banks open 8:00 AM to 4:00 PM, Monday to Friday.")
    amount = _amount(amount, C.COUNTER_MIN, C.COUNTER_MAX)
    if kind == "deposit":
        if state["money"] < amount:
            raise GameError("You don't have that much cash.")
        state["money"] -= amount
        _bank_move(state, amount, "Cash deposit")
        messages.insert(0, f"Deposited ₦{amount:,}. Balance: ₦{bank_balance(state):,}.")
    elif kind == "withdraw":
        if bank_balance(state) < amount:
            raise GameError("Insufficient funds.")
        _bank_move(state, -amount, "Counter withdrawal")
        state["money"] += amount
        messages.insert(0, f"The cashier counted out ₦{amount:,}. Balance: ₦{bank_balance(state):,}.")
    else:
        raise GameError("Deposit or withdraw?")
    return _finish(state, messages, now, 8)


def atm_withdraw(state: dict, amount: int, now: float | None = None, machine: str | None = None) -> tuple[dict, list[str]]:
    """Withdraw with your debit card. Your own bank's ATM is free; another bank's ATM charges ₦35."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    _bank_open_check(state)
    owner = atm_here(state)
    if owner is None:
        raise GameError("There's no ATM here. Try the Banking Area or SUB.")
    bank = state.get("bank")
    if not bank:
        raise GameError("You need a bank account and a debit card.")
    if not bank.get("card"):
        raise GameError(f"{C.BANKS[bank['bank']]['name']} has no card. Cash out at a POS agent by transfer.")
    amount = _amount(amount, C.ATM_STEP, C.ATM_MAX, C.ATM_STEP)
    if owner == "":   # the Banking Area has every bank's ATM: you pick one
        owner = machine if machine in C.BANKS and not C.BANKS[machine]["app"] else bank["bank"]
    used = _daily(bank, "atm", state["total_days"])
    if used + amount > C.ATM_DAILY:
        raise GameError(f"Daily ATM limit reached (₦{C.ATM_DAILY:,}). Try a POS agent or tomorrow.")
    fee = C.ATM_OTHER_BANK_FEE if owner and owner != bank["bank"] else 0
    machine_name = C.BANKS[owner]["name"] if owner else "the"
    if bank_balance(state) < amount + fee:
        raise GameError("Insufficient funds.")
    if _rng(state, "atm").random() < C.ATM_FAIL:
        messages.insert(0, "'Unable to dispense cash. Please contact your bank.' The ATM is acting up. "
                           "Try again, or use a POS agent.")
        return _finish(state, messages, now, 5)
    _bank_move(state, -amount, "ATM withdrawal")
    if fee:
        _bank_move(state, -fee, "ATM fee (another bank's ATM)")
    bank["atm_today"] += amount
    state["money"] += amount
    messages.insert(0, f"The {machine_name} ATM counted out ₦{amount:,}." + (f" (₦{fee} fee: another bank's ATM.)" if fee else "")
                    + f" Balance: ₦{bank_balance(state):,}.")
    return _finish(state, messages, now, 5)


def pos_cash(state: dict, kind: str, amount: int, method: str = "card",
             now: float | None = None) -> tuple[dict, list[str]]:
    """POS agents: withdraw (by card, or by transferring to them) or deposit cash, for a charge."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    _bank_open_check(state)
    if not pos_here(state):
        raise GameError("No POS agent here. There's one in every hall, faculty and the market.")
    lo, hi = C.POS_HOURS
    if not lo <= tod(state) < hi:
        raise GameError("The POS agent has closed for the night. They open at 7:00 AM.")
    bank = state.get("bank")
    if not bank:
        raise GameError("You need a bank account to use POS.")
    amount = _amount(amount, C.POS_MIN, C.POS_MAX)
    charge = pos_charge(state, amount)
    bank_name = C.BANKS[bank["bank"]]["name"]
    if kind == "withdraw":
        if method == "card":
            if not bank.get("card"):
                raise GameError(f"{bank_name} has no card. Pay the agent by transfer instead.")
            fee = 0
        elif method == "transfer":
            if not state.get("phone"):
                raise GameError("You need a phone to transfer.")
            fee = C.transfer_fee(amount)
        else:
            raise GameError("Card or transfer?")
        if bank_balance(state) < amount + charge + fee:
            raise GameError("Insufficient funds (remember the agent's charge).")
        _bank_move(state, -amount, "POS withdrawal" if method == "card" else "Transfer to POS agent")
        _bank_move(state, -charge, "POS charge")
        if fee:
            _bank_move(state, -fee, "Transfer fee")
        state["money"] += amount
        state["stats"]["spent"] += charge + fee
        how = "swiped your card" if method == "card" else "confirmed your transfer"
        messages.insert(0, f"The POS agent {how} and gave you ₦{amount:,} cash (charge ₦{charge + fee:,}).")
    elif kind == "deposit":
        if state["money"] < amount + charge:
            raise GameError(f"You need ₦{amount + charge:,} cash: ₦{amount:,} plus the agent's ₦{charge:,} charge.")
        state["money"] -= amount + charge
        state["stats"]["spent"] += charge
        _bank_move(state, amount, "Deposit via POS agent")
        messages.insert(0, f"The POS agent sent ₦{amount:,} to your {bank_name} account (charge ₦{charge:,}).")
    else:
        raise GameError("Withdraw or deposit?")
    return _finish(state, messages, now, 5)


def send_transfer(state: dict, amount: int, to_label: str, now: float | None = None, note: str = "") -> tuple[dict, list[str]]:
    """Send money from your account. The server credits the other student's account."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    _bank_open_check(state)
    bank = state.get("bank")
    if not bank:
        raise GameError("Open a bank account first.")
    if not state.get("phone"):
        raise GameError("You need a phone to send a transfer.")
    amount = _amount(amount, C.TRANSFER_MIN, C.TRANSFER_DAILY)
    used = _daily(bank, "sent", state["total_days"])
    if used + amount > C.TRANSFER_DAILY:
        raise GameError(f"Daily transfer limit reached (₦{C.TRANSFER_DAILY:,}).")
    fee = C.transfer_fee(amount)
    if bank_balance(state) < amount + fee:
        raise GameError("Insufficient funds.")
    _bank_move(state, -amount, f"Transfer to {to_label}" + (f" · {note}" if note else ""))
    _bank_move(state, -fee, "Transfer fee")
    bank["sent_today"] += amount
    state["stats"]["spent"] += fee
    messages.insert(0, f"Sent ₦{amount:,} to {to_label}. (₦{fee} fee.)")
    return _finish(state, messages, now, 4)


def receive_transfer(state: dict, amount: int, sender: str) -> tuple[dict, str]:
    """Another student's transfer lands. Not a move: it arrives whenever the server sees your game."""
    state = upgrade(copy.deepcopy(state))
    if not state.get("bank"):
        state["money"] += amount   # can't happen: you need an account number to be sent money
        return state, f"₦{amount:,} from {sender}."
    _bank_move(state, amount, f"Transfer from {sender}")
    state["stats"]["earned"] += amount
    line = f"Credit alert! ₦{amount:,} from {sender}."
    _log(state, line)
    return state, line


def bank_view(state) -> dict | None:
    bank = state.get("bank")
    if not bank:
        return None
    b = C.BANKS[bank["bank"]]
    return {"bank": bank["bank"], "name": b["name"], "color": b["color"], "fg": b["fg"], "app": b["app"],
            "number": bank["number"], "balance": bank["balance"], "card": bank.get("card", False),
            "history": bank.get("history", [])[:15],
            "atm_left": C.ATM_DAILY - (bank.get("atm_today", 0) if bank.get("atm_day") == state["total_days"] else 0),
            "sent_left": C.TRANSFER_DAILY - (bank.get("sent_today", 0)
                                             if bank.get("sent_day") == state["total_days"] else 0)}


def banking_view(state) -> dict:
    owner = atm_here(state)
    here_pos = pos_here(state) and C.POS_HOURS[0] <= tod(state) < C.POS_HOURS[1]
    return {
        "banks": [{"id": k, **v} for k, v in C.BANKS.items()],
        "branch": at_branch(state), "branch_open": branch_open(state),
        "atm": None if owner is None else {"owner": owner or None,
                                           "owner_name": C.BANKS[owner]["name"] if owner else "Every bank"},
        "pos": here_pos,
        "pos_charges": {a: pos_charge(state, a) for a in C.POS_AMOUNTS} if pos_here(state) else {},
        "atm_amounts": C.ATM_AMOUNTS, "pos_amounts": C.POS_AMOUNTS, "counter_amounts": C.COUNTER_AMOUNTS,
        "transfer_amounts": C.TRANSFER_AMOUNTS,
        "transfer_fees": {a: C.transfer_fee(a) for a in C.TRANSFER_AMOUNTS},
        "open_cost": C.BANK_OPEN_DEPOSIT + C.CARD_FEE, "atm_fee": C.ATM_OTHER_BANK_FEE,
        "limits": {"atm_max": C.ATM_MAX, "atm_step": C.ATM_STEP, "pos_min": C.POS_MIN, "pos_max": C.POS_MAX,
                   "counter_min": C.COUNTER_MIN, "counter_max": C.COUNTER_MAX, "transfer_min": C.TRANSFER_MIN,
                   "pos_per": C.POS_FEE_PER[0], "pos_fee": C.POS_FEE_PER[1],
                   "pos_night": C.POS_NIGHT_FEE if tod(state) >= C.H(20) and state["at"]
                   and W.BUILDINGS[state["at"]]["kind"] in ("hall", "home") else 0},
        "held_allowance": state["flags"].get("held_allowance", 0),
    }


def settling(state) -> bool:
    """The first day or two of your first semester, when you can still change your hall and traits."""
    return state["semester"] == 1 and state["total_days"] <= 2


def session_of(state) -> int:
    return (state["semester"] + 1) // 2


def listings(now: float | None = None) -> list[dict]:
    """Off-campus places to let this week. Everyone sees the same list."""
    week = int(((now or 0) + WAT) // (7 * 86_400))
    rng = random.Random(f"listings-{week}")
    out = []
    for kind in ("single", "self_con", "flat"):
        lo, hi = C.HOUSING[kind]["rent"]
        for area in rng.sample(C.OFF_CAMPUS_AREAS, 3):
            rent = int(round(rng.uniform(lo, hi) / 5_000) * 5_000)
            out.append({"id": f"{kind}:{area}:{rent}", "kind": kind, "area": area, "rent": rent,
                        "name": f"{C.HOUSING[kind]['name']} in {area}"})
    return sorted(out, key=lambda x: x["rent"])


def rent_share(state) -> int:
    h = state["housing"]
    return h["rent"] // max(1, h.get("tenants", 1))


def move_quote(state, kind: str, rent: int, share: bool = False) -> dict:
    """What moving costs you, and how much your parents put in (first year only)."""
    pay = rent // 2 if share else rent
    if kind == "hostel" and housing_kind(state) == "hostel" and state["housing"].get("session") == session_of(state):
        pay = 0  # changing rooms or halls in the same session
    cover = 0
    if settling(state) and not state["flags"].get("parents_rent_used"):
        cover = min(pay, C.PROFILES[state["profile"]]["rent_budget"])
    return {"pay": pay, "cover": cover, "you": pay - cover}


def move_home(state: dict, kind: str, building: str, rent: int, *, area=None, room=None, label=None,
              share: bool = False, tenants: int = 1, now: float | None = None) -> tuple[dict, list[str]]:
    """Move into a hall bunk or an off-campus place. The server picks the actual room (and roommates)."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    if kind not in C.HOUSING or building not in W.BUILDINGS:
        raise GameError("No such place.")
    if kind == "hostel" and building not in C.HALLS[gender(state["look"])]:
        raise GameError("That hall isn't for you.")
    if state["housing"].get("room") == room and room is not None:
        raise GameError("You already live here.")
    q = move_quote(state, kind, rent, share)
    if spendable(state) < q["you"]:
        raise GameError(f"You need ₦{q['you']:,} to move in." + (f" (Your parents are putting in ₦{q['cover']:,}.)"
                                                                     if q["cover"] else ""))
    if q["you"]:
        _spend(state, q["you"], "any", "Rent")
    if q["cover"]:
        state["flags"]["parents_rent_used"] = True
    old_home = home_building(state)
    state["housing"] = {"kind": kind, "building": building, "area": area, "rent": rent, "room": room,
                        "label": label or (W.BUILDINGS[building]["name"] if kind == "hostel"
                                           else f"{C.HOUSING[kind]['name']} in {area}"),
                        "session": session_of(state), "tenants": tenants}
    if state["at"] == old_home:
        state["at"] = building
        state["pos"] = _door(building)
        state["pos_time"] = now
    if kind != "hostel":
        _add_moodlet(state, "new_place")
    paid = f" You paid ₦{q['you']:,}." if q["you"] else ""
    if q["cover"]:
        paid += f" Your parents paid ₦{q['cover']:,}."
    messages.insert(0, f"You moved into {home_name(state)}!{paid}")
    return _finish(state, messages, now, 4)


def _queue_rent(state):
    """A new session: rent (or the hall fee) is due again."""
    h = state["housing"]
    if h.get("session", 0) >= session_of(state) or h["rent"] <= 0:
        return
    due = rent_share(state)
    hall_fee = C.HOUSING["hostel"]["rent"][0]
    choices = [{"label": f"Pay ₦{due:,}", "enabled": spendable(state) >= due,
                "reason": None if spendable(state) >= due else "Not enough money"},
               {"label": "Ask your parents to pay", "enabled": True, "reason": None}]
    if h["kind"] == "hostel":
        choices.append({"label": f"Borrow ₦{due:,} from a loan app", "enabled": True, "reason": None})
        text = f"A new session has started. The hall accommodation fee of ₦{due:,} is due."
    else:
        choices.append({"label": f"Move into a hall bunk (₦{hall_fee:,})", "enabled": True, "reason": None})
        text = (f"New session, new rent. Your landlord wants ₦{due:,} for {home_name(state)} "
                "or he'll give the place to someone else.")
    state["pending"] = {"id": "rent_due", "title": "Rent is due", "text": text, "choices": choices, "due": due}
    state["phase"] = "event"


def _borrow(state, amount: int, messages):
    repay = round(amount * (1 + C.LOAN_APP_INTEREST) / 50) * 50
    state["flags"]["debt"] = state["flags"].get("debt", 0) + repay
    state["stats"]["loans"] += 1
    # the loan pays the bill directly, so nothing lands with you
    messages.append(f"The loan app sent ₦{amount:,}. It will take back ₦{repay:,} from any money you get.")


def _to_hall(state, messages, paid_by_parents: bool):
    fee = C.HOUSING["hostel"]["rent"][0]
    if not paid_by_parents:
        if spendable(state) >= fee:
            _spend(state, fee, "any", "Hall accommodation fee")
        else:
            _borrow(state, fee, messages)
    old = home_building(state)
    state["housing"] = {**default_housing(f"{state['seed']}-{state['semester']}", state["look"]),
                        "session": session_of(state)}
    if state["at"] == old:
        state["at"] = home_building(state)
        state["pos"] = _door(state["at"])
    messages.append(f"You moved into a bunk in {home_name(state)}.")


def _choose_rent(state, pending, index, messages):
    h = state["housing"]
    due = pending["due"]
    p = C.PROFILES[state["profile"]]
    if index == 0:
        _spend(state, due, "any", "Rent")
        h["session"] = session_of(state)
        messages.append(f"Paid ₦{due:,}. You're good for this session.")
    elif index == 1:
        rng = _rng(state, "rent")
        cover = 0 if rng.random() < p["parent_no_money"] else min(due, p["rent_budget"])
        rest = due - cover
        if cover and rest <= spendable(state):
            _spend(state, rest, "any", "Rent")
            h["session"] = session_of(state)
            messages.append(f"Your parents paid ₦{cover:,}" + (f" and you added ₦{rest:,}." if rest else ".")
                            + " Rent sorted.")
        elif h["kind"] == "hostel":
            messages.append("Your parents couldn't pay this time.")
            _borrow(state, due, messages)
            h["session"] = session_of(state)
        else:
            messages.append(f"Your parents could only manage ₦{cover:,}, and you can't cover the rest. "
                            "The landlord has given your place to someone else.")
            _to_hall(state, messages, paid_by_parents=cover >= C.HOUSING["hostel"]["rent"][0])
    elif index == 2:
        if h["kind"] == "hostel":
            _borrow(state, due, messages)
            h["session"] = session_of(state)
        else:
            _to_hall(state, messages, paid_by_parents=False)
    else:
        raise GameError("Pick one of the options.")


# --- What the player sees -------------------------------------------------------------------------


def upcoming(state) -> list[str]:
    notes = []
    if state["strike_days"]:
        notes.append(f"ASUU strike: {state['strike_days']} more day{'s' if state['strike_days'] > 1 else ''}")
        return notes
    day = state["day"]
    kind = test_today(state)
    venue = place_name(dept(state)["exams"])
    if kind and not test_written(state):
        what = "CA test" if kind == "ca" else "Exams"
        if tod(state) <= C.TEST_DOORS_CLOSE:
            notes.append(f"{what} today, 9:00 AM at {venue}. Doors close 9:30")
    elif state["ca"] is None and day < C.CA_TEST_DAY and state["semester"] <= C.SEMESTERS:
        n = C.CA_TEST_DAY - day
        notes.append(f"CA test {'tomorrow' if n == 1 else f'in {n} days'}, 9:00 AM at {venue}")
    if day < C.EXAM_DAYS[0] and (state["ca"] is not None or state["semester"] > C.SEMESTERS):
        n = C.EXAM_DAYS[0] - day
        notes.append(f"Exams {'tomorrow' if n == 1 else f'in {n} days'}, 9:00 AM at {venue}")
    nxt = next_lecture(state)
    if nxt:
        notes.append(f"Next lecture: {nxt['code']} at {clock_text(nxt['start'])}, {place_name(nxt['venue'])}")
    if not state.get("phone"):
        notes.append("No phone: buy one at Ojaja market")
    if not state["fees_paid"]:
        notes.append(f"School charges unpaid (₦{C.SCHOOL_CHARGES:,}): pay on the portal before exams")
    if burnt_out(state):
        notes.append("Burnt out: have some fun or see friends, or your reading suffers")
    if state["day"] == 0 and state["phase"] == "play":
        notes.insert(0, "No lectures today. They start on the next school day")
    if state.get("asleep") and not state["asleep"].get("until"):
        notes.insert(0, f"Asleep. Alarm at {clock_text(C.WAKE_UP)}")
    if state["flags"].get("debt"):
        notes.append(f"Loan app debt: ₦{state['flags']['debt']:,}")
    if state["flags"].get("no_light"):
        notes.append("No light in your room")
    if state["flags"].get("no_water"):
        notes.append("No water: baths cost ₦300")
    return notes


def view(state: dict, now: float | None = None) -> dict:
    state = upgrade(copy.deepcopy(state))
    p = C.PROFILES[state["profile"]]
    actions = available_actions(state)
    here = [a for a in actions if a["at"] not in ("phone", "laptop")]
    phone = [a for a in actions if a["at"] == "phone"]
    laptop = [a for a in actions if a["at"] == "laptop"]
    held = lectures_held_now(state)
    t = tod(state)
    home = home_building(state)
    return {
        "name": state["name"],
        "status": state["status"],
        "phase": state["phase"],
        "turn": state["turn"],
        "profile": {"id": state["profile"], "name": p["name"], "tagline": p["tagline"], "home": home_name(state),
                    "perks": p["perks"], "parent_cap": p["parent_cap"], "rent_budget": p["rent_budget"]},
        "department": {"id": state["department"], **C.DEPARTMENTS[state["department"]]},
        "semester": state["semester"],
        "level": level_label(state),
        "day": state["day"],
        "days_in_semester": C.SEMESTER_DAYS,
        "weekday": C.WEEKDAYS[state["dow"]],
        "dow": state["dow"],
        "total_days": state["total_days"],
        "clock": state["clock"],
        "minute": t,
        "time": clock_text(t),
        "server_time": now,
        "ticking": state["status"] == "playing" and state["phase"] == "play",
        "rate": RATE,
        "asleep": ({**state["asleep"], "until_text": clock_text(state["asleep"]["until"])
                    if state["asleep"].get("until") else None} if state.get("asleep") else None),
        "busy_for": max(0.0, round(state.get("busy_until", 0) - now, 1)) if now is not None else 0,
        "playback": state.get("playback", 0),
        "at": state["at"],
        "at_name": W.BUILDINGS[state["at"]]["name"] if state["at"] else None,
        "home": home,
        "home_name": home_name(state),
        "housing": {**state["housing"], "name": C.HOUSING[housing_kind(state)]["name"],
                    "capacity": C.HOUSING[housing_kind(state)]["capacity"], "share": rent_share(state),
                    "due_session": state["housing"].get("session", 0) < session_of(state)},
        "settling": settling(state),
        "parents": {"asks": C.PARENT_ASKS, "cap": p["parent_cap"],
                    "called": state["flags"].get("parents_week") == week_key(state)},
        "betting": {"stakes": C.BET_STAKES, "adult": bool(state["flags"].get("bet_adult")),
                    "fixtures": [{k: v for k, v in f.items() if k != "probs"} for f in fixtures(state, now)],
                    "staked": state["stats"].get("staked", 0), "won": state["stats"].get("bet_won", 0),
                    "today": state["flags"].get("bets_today", 0) if state["flags"].get("bet_day") == state["total_days"] else 0,
                    "last": state.get("last_bet")},
        "pos": state["pos"],
        "look": state["look"],
        "traits": [{"id": t, **C.TRAITS[t]} for t in state["traits"]],
        "dream": dream_progress(state),
        "rep": dict(zip(("level", "floor", "next"), rep_level(state["rep"])), xp=state["rep"],
                    title=rep_title(rep_level(state["rep"])[0])),
        "missions": [{**item, "label": _mission_def(item["id"])["label"], "reward": C.MISSION_REWARDS[item["tier"]][0]}
                     for item in state["missions"]["list"]] if state["missions"]["day"] == state["total_days"] else [],
        "missions_bonus": state["missions"]["bonus"],
        "people": people_list(state),
        "streak": state["streak"]["day"],
        "moodlets": active_moodlets(state),
        "phone_info": phone_info(state),
        "items": [{"id": i, "name": C.ITEMS[i]["name"]} for i in state["items"]],
        "pantry": state["pantry"],
        "next_venue": (next_lecture(state) or {}).get("venue"),
        "exam_venue": dept(state)["exams"],
        "faculty": dept(state)["faculty"],
        "strike_days": state["strike_days"],
        "money": state["money"],
        "cash": state["money"],
        "bank": bank_view(state),
        "total_money": total_money(state),
        "banking": banking_view(state),
        "needs": {k: round(v) for k, v in state["needs"].items()},
        "mood": mood(state),
        "prep": state["prep"],
        "attendance": round(100 * min(1, state["attended"] / held)) if held else None,
        "cgpa": cgpa(state) if state["results"] else None,
        "fees_paid": state["fees_paid"],
        "fees_covered": bool(p["fees_covered"]),
        "courses": state["courses"],
        "carryovers": state["carryovers"],
        "timetable": [[{"start": lec["start"], "time": clock_text(lec["start"]), "code": lec["code"],
                        "venue": lec["venue"], "venue_name": place_name(lec["venue"])} for lec in row]
                      for row in state["timetable"]],
        "today": [{"time": clock_text(lec["start"]), "start": lec["start"], "code": lec["code"], "venue": lec["venue"],
                   "venue_name": place_name(lec["venue"]),
                   "attended": _lecture_key(state, lec) in state["flags"]["attended_keys"],
                   "missed": lec["start"] + C.LECTURE_DOORS_CLOSE < t
                   and _lecture_key(state, lec) not in state["flags"]["attended_keys"]}
                  for lec in lectures_today(state)],
        "test": _test_action(state),
        "upcoming": upcoming(state),
        "actions": here,
        "phone": phone,
        "laptop": laptop,
        "has_laptop": "laptop" in state["items"],
        "open": {bid: building_open(bid, t) for bid in W.BUILDINGS},
        "pending": state["pending"],
        "last_result": state["last_result"],
        "last_trip": state.get("last_trip"),
        "graduates_next": state["phase"] == "results" and graduates_now(state),
        "results": state["results"],
        "final": state.get("final"),
        "skills": [{"id": k, "name": v["name"], "blurb": v.get("blurb", ""), "max": len(C.SKILL_LEVELS),
                    "level": skill_level(state, k), "xp": state["skills"][k],
                    "next": C.SKILL_LEVELS[skill_level(state, k)] if skill_level(state, k) < len(C.SKILL_LEVELS) else None,
                    "floor": C.SKILL_LEVELS[skill_level(state, k) - 1]}
                   for k, v in C.SKILLS.items()],
        "businesses": [{"id": k, "name": C.BUSINESSES[k]["name"]} for k in state["businesses"]],
        "business_income": state["stats"]["business_income"],
        "trekked_km": round(state["stats"]["trekked"] * W.METRES_PER_UNIT / 1000, 1),
        "badges": [{"id": k, "name": n, "description": d, "earned": k in state["badges"]} for k, (n, d) in C.BADGES.items()],
        "log": state["log"][-12:][::-1],
    }


# --- People you tap ----------------------------------------------------------------------------------

def social_chance(state) -> int:
    """The chance a joke lands, in percent: charisma helps."""
    bonus = 6 if has_trait(state, "smooth_talker") else 0
    return min(95, 52 + 5 * skill_level(state, "charisma") + bonus)


def friend_level(bond: float) -> dict:
    """Stranger → Acquaintance → Friend → Close friend → Bestie, with how far to the next one."""
    name, floor, nxt = C.FRIEND_LEVELS[0][1], 0, None
    for i, (at, label) in enumerate(C.FRIEND_LEVELS):
        if bond >= at:
            name, floor = label, at
            nxt = C.FRIEND_LEVELS[i + 1] if i + 1 < len(C.FRIEND_LEVELS) else None
    return {"level": name, "floor": floor, "next": nxt[0] if nxt else None, "next_name": nxt[1] if nxt else None}


def _person(state, who):
    return state.setdefault("people", {}).get(who) or {"bond": 0}


def social(state: dict, kind: str, who: str, now: float | None = None, role: str = "", player: bool = False
           ) -> tuple[dict, list[str]]:
    """Say hello, gist, joke, hang out (and more, as you get closer) with someone where you are."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    spec = C.SOCIAL.get(kind)
    if not spec:
        raise GameError("Unknown thing to do.")
    who = " ".join(str(who or "").split())[:24] or "Someone"
    if not state.get("at"):
        raise GameError("Go somewhere with people first.")
    if spec.get("npc_only") and player:
        raise GameError("You can't beg real students for money here. Ask them in chat if you must.")
    bond = _person(state, who)["bond"]
    if bond < spec.get("needs", 0):
        need = friend_level(spec["needs"])["level"]
        raise GameError(f"{spec['label']} opens when you and {who} are {need}s ({int(bond)}/{spec['needs']}).")
    cds = state["flags"].setdefault("social_cd", {})
    key = f"{kind}:{who}"
    last = cds.get(key)
    if last is not None and state["clock"] - last < spec["cooldown"]:
        wait = int(spec["cooldown"] - (state["clock"] - last)) + 1
        raise GameError(f"You just did that with {who}. Give it {wait} min." if wait < 120
                        else f"You asked {who} already. Try again tomorrow.")
    cds[key] = state["clock"]
    if len(cds) > 40:  # keep the save small
        for k in sorted(cds, key=cds.get)[:len(cds) - 40]:
            cds.pop(k)
    rng = _rng(state, f"social-{key}")
    effects = dict(spec["effects"])
    gain = spec.get("bond", 0)
    fmt = {"who": who}
    if spec.get("chance"):
        won = rng.random() * 100 < social_chance(state)
        lines = C.SOCIAL_LINES["joke_win" if won else "joke_fail"]
        if not won:
            effects = {"social": -2, "fun": 2}
            gain = -1
    elif kind == "borrow":
        yes = rng.random() < 0.35 + bond / 300
        lines = C.SOCIAL_LINES["borrow_yes" if yes else "borrow_no"]
        if yes:
            fmt["amount"] = rng.randrange(C.BORROW_RANGE[0], C.BORROW_RANGE[1] + 1, 50)
            _receive(state, fmt["amount"], f"From {who}", prefer="cash")
        else:
            gain = 0
    else:
        lines = C.SOCIAL_LINES[kind]
    if effects.get("social", 0) > 0:
        _gain_xp(state, "charisma", max(1, round(effects["social"] / 5)), messages)
        effects["social"] = effects["social"] * (1 + C.CHARISMA_BONUS * (skill_level(state, "charisma") - 1))
    _apply_effects(state, effects)
    messages.insert(0, rng.choice(lines).format(**fmt))
    # how close you are now
    people = state.setdefault("people", {})
    p = people.get(who) or {"bond": 0, "met": state["total_days"]}
    before = friend_level(p["bond"])["level"]
    p["bond"] = max(0, min(C.BOND_MAX, p["bond"] + gain))
    p["last"] = state["clock"] + 1440 * state["total_days"]
    p["role"] = (" ".join(str(role or "").split())[:40]) or p.get("role", "")
    p["player"] = bool(player)
    people[who] = p
    after = friend_level(p["bond"])["level"]
    if after != before:
        up = p["bond"] > 0 and [lv for _, lv in C.FRIEND_LEVELS].index(after) > [lv for _, lv in C.FRIEND_LEVELS].index(before)
        messages.append(f"🤝 You and {who} are {after}s now!" if up else f"💔 You and {who} are only {after}s now.")
    if len(people) > C.PEOPLE_KEEP:
        for k in sorted(people, key=lambda n: people[n].get("last", 0))[:len(people) - C.PEOPLE_KEEP]:
            people.pop(k)
    return _finish(state, messages, now, spec["seconds"])


def people_list(state) -> list[dict]:
    out = []
    for name, p in state.get("people", {}).items():
        out.append({"name": name, "bond": p["bond"], "role": p.get("role", ""), "player": p.get("player", False),
                    **friend_level(p["bond"])})
    out.sort(key=lambda x: -x["bond"])
    return out


def gift(state: dict, amount: int, label: str, now: float | None = None) -> tuple[dict, list[str]]:
    """Money that comes from the game itself (a riddle prize): into your account if you have one."""
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    _receive(state, int(amount), label)
    messages.append(f"+₦{int(amount):,} · {label}")
    return _finish(state, messages, now, 0)
