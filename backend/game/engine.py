"""The rules of Great Ife Life.

Pure Python: a game is a JSON-able dict, and every function takes a state and returns a new one.
The server is the only place these run, so players can't give themselves money, grades or time.

Time: state["clock"] counts game minutes since the first midnight of the game. While you're free,
1 real second is 1 game minute (the server works out how much real time passed since the last
request, capped so a closed app doesn't eat your day). Activities and journeys fast-forward the clock.

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

VERSION = 4
RATE = 1.0          # game minutes per real second while you're free
IDLE_CAP = 60       # at most this many game minutes pass between two requests
TIMELAPSE_SECONDS = 2.5   # how long the client shows an activity's time-lapse
JOURNEY_SPEEDUP = 3.0     # journeys play back at 3 game minutes per real second
JOURNEY_MAX_SECONDS = 25
DOOR_RADIUS = 34          # how close (world units) you must be to a door to go in
TEST_OPENS = C.H(7, 30)


class GameError(Exception):
    """A move that isn't allowed right now; the message is shown to the player."""


# --- Setup ----------------------------------------------------------------------------------------


def new_state(seed: str, department: str, name: str = "", profile: str | None = None, now: float = 0.0,
              look: dict | None = None) -> dict:
    if department not in C.DEPARTMENTS:
        raise GameError("Choose a department.")
    rng = random.Random(f"{seed}-admission")
    profile = profile or rng.choice(list(C.PROFILES))
    p = C.PROFILES[profile]
    look = clean_look(look) if look else random_look(seed)
    home = _home_for(profile, look)
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
        "day": 1,
        "dow": 0,
        "total_days": 1,
        "clock": C.WAKE_UP,
        "last_sync": now,
        "at": home,
        "pos": list(W.NODES[W.BUILDINGS[home]["node"]]),
        "pos_clock": C.WAKE_UP,
        "strike_days": 0,
        "strike_used": False,
        "money": p["money"],
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
        "flags": {"scholarship": profile == "scholarship", "seen": [], "attended_keys": []},
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
    _start_of_day(state, _rng(state, "day"))
    return state


def _home_for(profile: str, look: dict) -> str:
    p = C.PROFILES[profile]
    if p.get("halls"):
        return p["halls"]["female" if look.get("hall") == 1 else "male"]
    return p["home_building"]


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
    if state.get("version", 1) < 3:
        # v2 had four time slots a day. Put the player at home at that slot's time.
        slot = state.pop("slot", 0)
        state["clock"] = (state["total_days"] - 1) * 1440 + [C.H(7), C.H(12), C.H(17), C.H(21)][min(slot, 3)]
        home = C.PROFILES[state["profile"]]["home_building"]
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
        p = C.PROFILES[state["profile"]]
        state["look"].setdefault("hall", random_look(state["seed"])["hall"])
        state.setdefault("phone", {"model": p["phone"], "cracked": bool(p.get("phone_cracked"))})
        state.setdefault("items", list(p.get("items", [])))
        state.setdefault("pantry", 0)
        home = home_building(state)
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
    state["version"] = VERSION
    return state


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
    state["money"] += amount
    if amount > 0:
        state["stats"]["earned"] += amount
    else:
        state["stats"]["spent"] += -amount


def is_weekday(state) -> bool:
    return state["dow"] < 5


def week_key(state) -> str:
    return f"w{(state['total_days'] - 1) // 7}"


def level_label(state) -> str:
    if state["semester"] > C.SEMESTERS:
        return "Extra year"
    level = ((state["semester"] - 1) // 2 + 1) * 100
    return f"{level} Level, {'First' if state['semester'] % 2 else 'Second'} Semester"


def home_building(state) -> str:
    return _home_for(state["profile"], state.get("look", {}))


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
    if state["strike_days"] or state["semester"] > C.SEMESTERS + C.MAX_EXTRA_SEMESTERS:
        return None
    if state["day"] == C.CA_TEST_DAY and state["semester"] <= C.SEMESTERS:
        return "ca"
    if state["day"] in C.EXAM_DAYS:
        return "exam"
    return None


def lectures_today(state) -> list[dict]:
    if state["strike_days"] or not is_weekday(state) or test_today(state) or state["day"] in C.EXAM_DAYS:
        return []
    if state["day"] > C.SEMESTER_DAYS:
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
    """Real time since the last request becomes game time (1 second = 1 minute), capped."""
    messages = messages if messages is not None else []
    if now is None:
        return messages
    last = state.get("last_sync")
    if last is None or state["status"] != "playing" or state["phase"] != "play":
        state["last_sync"] = now
        return messages
    elapsed = now - last
    if elapsed <= 0:
        return messages  # still inside a time-lapse or journey playback
    minutes = int(elapsed * RATE)
    if minutes > IDLE_CAP:
        minutes = IDLE_CAP
        state["last_sync"] = now
    else:
        state["last_sync"] = last + minutes / RATE
    if minutes:
        _pass_time(state, minutes, messages)
        _check_collapse(state, messages)
    return messages


def _boundaries(t: int) -> int:
    """Minutes until the next moment something happens: midnight, 1 AM (late night), 5 AM, 6 AM (new day)."""
    for b in (60, 300, 360, 1440):
        if t < b:
            return b - t
    return 1440 - t


def _pass_time(state, minutes: int, messages, kind: str = "awake", per_minute: dict | None = None):
    """Move the clock forward, letting needs fall and days turn over."""
    remaining = int(minutes)
    while remaining > 0 and state["phase"] != "results" and state["status"] == "playing":
        t = tod(state)
        step = min(remaining, _boundaries(t))
        hours = step / 60
        if kind == "sleep":
            decay = dict(C.SLEEP_DECAY_PER_HOUR)
            decay["energy"] = C.SLEEP_ENERGY_PER_HOUR
        else:
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
        effects = {k: v * hours for k, v in decay.items()}
        for k, v in (per_minute or {}).items():
            effects[k] = effects.get(k, 0) + v * step
        for k, v in effects.items():
            state["needs"][k] = round(_clamp(state["needs"][k] + v), 2)
        state["clock"] += step
        remaining -= step
        t = tod(state)
        if t == 0:
            _end_of_day(state, messages)
        elif t == 360:
            _start_of_day(state, _rng(state, f"day{state['total_days']}"), messages)


def _check_collapse(state, messages):
    if state["status"] != "playing" or state["phase"] == "results":
        return
    if state["needs"]["hunger"] > 0 and state["needs"]["energy"] > 0:
        return
    fee = min(1_000, state["money"])
    _add_money(state, -fee)
    state["stats"]["collapses"] += 1
    state["needs"]["hunger"] = max(state["needs"]["hunger"], 35.0)
    state["needs"]["energy"] = max(state["needs"]["energy"], 35.0)
    state["at"] = "health"
    state["pos"] = _door("health")
    messages.append(f"You collapsed and were taken to the Health Centre{f' (₦{fee:,})' if fee else ''}. "
                    "You lost two hours. Eat and sleep!")
    _pass_time(state, 120, messages, kind="sleep")
    state["pos_clock"] = state["clock"]


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
    else:
        state["day"] += 1
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
    if state["dow"] == 0 and p["allowance"] and (state["profile"] != "scholarship" or flags["scholarship"]):
        _add_money(state, p["allowance"])
        who = "stipend" if state["profile"] == "scholarship" else "allowance"
        messages.append(f"Monday! Your weekly {who} of ₦{p['allowance']:,} has arrived.")
        _add_moodlet(state, "mummys_alert")

    if flags.get("debt") and state["money"] > 0:
        take = min(flags["debt"], state["money"])
        _add_money(state, -take)
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
    for event in C.EVENTS:
        if event["when"] != "day" or event["id"] in flags["seen"]:
            continue
        req = event.get("requires", {})
        if req.get("hall") and W.BUILDINGS[home_building(state)]["style"] != "hall":
            continue
        if req.get("phone") and not state.get("phone"):
            continue
        if req.get("phone") == "smart" and not has_smartphone(state):
            continue
        if req.get("not_cracked") and state.get("phone") and state["phone"]["cracked"]:
            continue
        if req.get("min_money") and state["money"] < req["min_money"]:
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
    if state["money"] < action_cost(state, action):
        return "Not enough money"
    return None


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
        return (C.WAKE_UP - t) % 1440 or 1440
    if m == "till_dawn":
        return (C.H(5) - t) % 1440
    if m == "lecture":
        lec = current_lecture(state) or {"start": t}
        return max(0, lec["start"] - t) + max(30, C.LECTURE_MINUTES - max(0, t - lec["start"]))
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
    minutes = max(0, C.TEST_TIME - t) + (60 if kind == "ca" else 180)
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
            "ends": clock_text(state["clock"] + minutes), "test": True}


def available_actions(state) -> list[dict]:
    """Everything you could do where you are (and on your phone), with why not if you can't."""
    if state["phase"] != "play" or state["status"] != "playing":
        return []
    out = []
    test = _test_action(state)
    if test and state["at"] == test["at"]:
        out.append(test)
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
        })
    return out


# --- Doing things ---------------------------------------------------------------------------------


def _begin(state, now) -> list[str]:
    """Every move starts by catching the clock up with real time."""
    if state["status"] != "playing":
        raise GameError("This game is over. Start a new one!")
    messages: list[str] = []
    tick(state, now, messages)
    _daily_streak(state, now, messages)
    _prune_moodlets(state)
    return messages


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
        state["last_sync"] = now + playback_seconds  # the playback itself isn't free time
    return state, messages


def act(state: dict, action_id: str, now: float | None = None) -> tuple[dict, list[str]]:
    state = upgrade(copy.deepcopy(state))
    messages = _begin(state, now)
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    if action_id in ("write_ca", "write_exam"):
        test = _test_action(state)
        if not test or test["id"] != action_id:
            raise GameError("There's no test to write right now.")
        if not test["enabled"]:
            raise GameError(test["reason"])
        wait = max(0, C.TEST_TIME - tod(state))
        _pass_time(state, wait, messages)
        (_write_ca if action_id == "write_ca" else _write_exam)(state, messages)
        _pass_time(state, test["minutes"] - wait, messages)
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
    return _finish(state, messages, now, TIMELAPSE_SECONDS)


def _do_action(state, action, messages):
    rng = _rng(state, action["id"])
    income_before = state["stats"]["hustle_income"]
    flags = state["flags"]
    cost = action_cost(state, action)
    minutes = duration(state, action)
    if cost:
        _add_money(state, -cost)

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
            minutes = max(0, lec["start"] - t0) + 45
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
    elif special == "call_home":
        flags["called_week"] = week_key(state)
        lo, hi = {"staff_pikin": (3_000, 10_000), "scholarship": (1_000, 4_000), "hustler": (0, 2_500),
                  "off_campus": (1_000, 5_000)}[state["profile"]]
        amount = rng.randint(lo // 500, hi // 500) * 500
        if amount:
            _add_money(state, amount)
            _add_moodlet(state, "mummys_alert")
            line = f"Called home. They sent ₦{amount:,}."
        else:
            line = "Called home. 'Things are hard, my child. Next week.'"
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
    elif special == "sell_business":
        b = C.BUSINESSES[action["business"]]
        back = int(b["price"] * C.BUSINESS_RESALE)
        del state["businesses"][action["business"]]
        _add_money(state, back)
        line = f"Sold your {b['name'].lower()} for ₦{back:,}."
    elif special == "sleep":
        line = f"You slept and woke up at {clock_text(C.WAKE_UP)}."
        if t0 >= C.H(23) or t0 < C.H(5):
            line = f"Late night. You slept until {clock_text(C.WAKE_UP)}."
    if action["id"] == "hol_tdb":
        state["stats"]["tdb"] += 1

    if action.get("earn"):
        earn = _hustle_pay(state, action["earn"], action.get("skill"))
        _add_money(state, earn)
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
        effects["prep"] *= 1 + C.PROFILES[state["profile"]].get("home_study_bonus", 0)
    study_effects = {k: v for k, v in effects.items() if k == "prep"}
    _apply_effects(state, study_effects, study=bool(action.get("study")))
    _pass_time(state, minutes, messages, kind="sleep" if special == "sleep" else "awake")
    _apply_effects(state, {k: v for k, v in effects.items() if k != "prep"})
    if special == "sleep" and state["needs"]["energy"] >= 85:
        _add_moodlet(state, "slept_well")
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
        "broke": state["money"] == 0,
        "health_centre": s["collapses"] >= 3,
        "clean_sheet": state["status"] == "graduated" and "F" not in grades,
        "first_class": state["status"] == "graduated" and state.get("final", {}).get("class") == "First Class",
        "trekker": s["trekked"] * W.METRES_PER_UNIT >= 20_000,
        "early_bird": s["early"] >= 10,
        "own_ride": "bike" in state["items"] or "car" in state["items"],
        "upgrade": s.get("phones", 0) > 0,
        "dream": bool((dream_progress(state) or {}).get("done")),
        "legend": rep_level(state.get("rep", 0))[0] >= 16,
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
    if state["money"] < 500:
        live.append("sapa")
    elif state["money"] >= 200_000:
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


def _plausible(state, pos) -> bool:
    """Could you have walked from where we last saw you to here in the time that passed?"""
    elapsed = max(0, state["clock"] - state.get("pos_clock", state["clock"]))
    return _dist_xy(state["pos"], pos) <= elapsed * W.MODES["trek"]["speed"] * 1.6 + 30


def _clean_pos(pos):
    if (not isinstance(pos, (list, tuple)) or len(pos) != 2
            or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in pos)):
        raise GameError("Where are you?")
    x, z = float(pos[0]), float(pos[1])
    if not (-280 <= x <= 500 and -80 <= z <= 400):
        raise GameError("That's off the map.")
    return [round(x, 1), round(z, 1)]


def _update_pos(state, pos):
    """Accept the client's position if it's believable; otherwise keep the last one we trusted."""
    if pos is None or state["at"]:
        return
    pos = _clean_pos(pos)
    if _plausible(state, pos):
        state["pos"] = pos
        state["pos_clock"] = state["clock"]


def sync(state: dict, now: float, pos=None) -> dict:
    """Heartbeat while the player roams: the clock catches up, and we note where they walked to."""
    state = upgrade(copy.deepcopy(state))
    messages: list[str] = []
    if state["status"] == "playing":
        tick(state, now, messages)
        _daily_streak(state, now, messages)
        _prune_moodlets(state)
        _update_pos(state, pos)
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
    state["pos_clock"] = state["clock"]
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
    if not _plausible(state, pos):
        raise GameError("You can't get there that fast. Walk, or take a ride.")
    if not building_open(building, tod(state)):
        lo, hi = W.BUILDINGS[building]["hours"]
        raise GameError(f"{W.BUILDINGS[building]['name']} is closed. Open {clock_text(lo)} to {clock_text(hi)}.")
    state["at"] = building
    state["pos"] = door
    state["pos_clock"] = state["clock"]
    _mission_progress(state, messages, visit=building)
    return _finish(state, messages, now)


def _origin(state, pos=None) -> tuple[str, list[float] | None]:
    """The road node a trip starts from, plus where you're standing if you're not at a door."""
    if state["at"]:
        return W.BUILDINGS[state["at"]]["node"], None
    here = state["pos"]
    if pos is not None:
        p = _clean_pos(pos)
        if _plausible(state, p):
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


def plan_trip(state, to: str, mode: str, pos=None) -> dict:
    """One way to get somewhere: segments (walk, wait, ride) with minutes, the fare and the arrival time."""
    if to not in W.BUILDINGS:
        raise GameError("No such place.")
    if mode not in modes_for(state):
        raise GameError("Pick a way to travel.")
    start, here = _origin(state, pos)
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
            return unavailable("Night cabs start at 9:00 PM")
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
    arrive = clock + minutes
    reason = None
    if state["money"] < cost:
        reason = "Not enough money"
    return {"mode": mode, "name": name, "available": reason is None, "reason": reason, "blurb": info.get("blurb", ""),
            "minutes": minutes, "walk": walk_m, "wait": wait_m, "cost": cost, "arrive_at": arrive,
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
    options = [plan_trip(state, to, m, pos) for m in modes_for(state)]
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
    trip = plan_trip(state, to, mode, pos)
    if not trip["available"]:
        raise GameError(trip["reason"])
    if trip["cost"]:
        _add_money(state, -trip["cost"])
    depart = state["clock"]
    for seg in trip["segments"]:
        kind = "cycle" if seg["mode"] == "bike" else seg["kind"]
        per_minute = C.TRAVEL_EFFECTS[kind]
        _pass_time(state, seg["minutes"], messages, per_minute=per_minute)
    state["stats"]["trekked"] = round(state["stats"]["trekked"] + trip["trekked"], 1)
    state["stats"]["trips"] += 1
    state["stats"]["modes"][mode] = state["stats"]["modes"].get(mode, 0) + 1
    b = W.BUILDINGS[to]
    state["pos"] = _door(to)
    state["pos_clock"] = state["clock"]
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
    messages.insert(0, f"{how} to {b['name']}: {trip['minutes']} min" + (f", ₦{trip['cost']:,}" if trip["cost"] else "")
                    + (f" ({trip['wait']} min waiting)" if trip["wait"] >= 10 else "") + ".")
    state["last_trip"] = {"mode": mode, "name": trip["name"], "segments": trip["segments"], "depart": depart,
                          "arrive": state["clock"], "to": to, "turn": state["turn"] + 1}
    seconds = min(JOURNEY_MAX_SECONDS, trip["minutes"] / JOURNEY_SPEEDUP)
    return _finish(state, messages, now, seconds)


def set_look(state: dict, look, traits=None, dream=None) -> dict:
    """Change how you look. Your hall, traits and dream can only change before you've settled in (day one)."""
    state = upgrade(copy.deepcopy(state))
    new = clean_look(look)
    old_home = home_building(state)
    settling_in = state["semester"] == 1 and state["day"] == 1
    if traits is not None or dream is not None:
        if not settling_in:
            raise GameError("Your traits and dream are set once you've settled in.")
        state["traits"], state["dream"] = clean_identity(traits if traits is not None else state["traits"],
                                                         dream if dream is not None else state["dream"])
    if not settling_in:
        new["hall"] = state["look"].get("hall", 0)
    state["look"] = new
    home = home_building(state)
    if home != old_home and state["at"] == old_home:
        state["at"] = home
        state["pos"] = _door(home)
        state["pos_clock"] = state["clock"]
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

    if state["profile"] == "scholarship" and state["flags"]["scholarship"] and result["cgpa"] < 3.5:
        state["flags"]["scholarship"] = False
        result["note"] = "Your CGPA fell below 3.50, so the foundation has stopped your stipend."
    elif failed:
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
        # A short break, then Monday morning at home.
        state["semester"] += 1
        state["total_days"] += 1
        home = home_building(state)
        state.update(day=1, dow=0, prep=min(25, 8 + state["prep"] // 8), attended=0, lectures_held=0,
                     ca=None, exam_scores={}, phase="play", last_result=None, at=home, pos=_door(home),
                     clock=(state["total_days"] - 1) * 1440 + C.WAKE_UP)
        state["pos_clock"] = state["clock"]
        state["fees_paid"] = bool(C.PROFILES[state["profile"]]["fees_covered"])
        state["flags"]["seen"] = []
        state["flags"]["attended_keys"] = []
        state["courses"] = _semester_courses(state)
        state["timetable"] = _make_timetable(state)
        messages.append(f"New semester: {level_label(state)}.")
        _start_of_day(state, _rng(state, "day"), messages)
        _check_badges(state, messages)
    if now is not None:
        state["last_sync"] = now
    for m in messages:
        _log(state, m)
    return state, messages


def _queue_fees_deadline(state):
    days = C.EXAM_DAYS[0] - state["day"]
    short = C.SCHOOL_CHARGES - state["money"]
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
        choices.append({"label": c["label"], "enabled": state["money"] >= cost,
                        "reason": None if state["money"] >= cost else "Not enough money"})
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
    elif pending["id"] == "fees_deadline":
        if index not in (0, 1):
            raise GameError("Pick one of the options.")
        short = pending.get("short", 0)
        if index == 1 and short == 0:
            messages.append("Okay. Don't forget: pay on the portal before exams.")
        elif index == 1:
            repay = round(short * (1 + C.LOAN_APP_INTEREST) / 50) * 50
            _add_money(state, short)
            state["flags"]["debt"] = state["flags"].get("debt", 0) + repay
            state["stats"]["loans"] += 1
            messages.append(f"₦{short:,} landed. The loan app will take back ₦{repay:,} from any money you get.")
        elif short == 0:
            _add_money(state, -C.SCHOOL_CHARGES)
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
        cost = min(choice.get("cost", 0), state["money"])
        if cost:
            _add_money(state, -cost)
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
        state["last_sync"] = now  # time was paused while the dialog was open
    _check_badges(state, messages)
    for m in messages:
        _log(state, m)
    return state, messages


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
        "profile": {"id": state["profile"], "name": p["name"], "tagline": p["tagline"], "home": place_name(home),
                    "perks": p["perks"]},
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
        "idle_cap": IDLE_CAP,
        "at": state["at"],
        "at_name": W.BUILDINGS[state["at"]]["name"] if state["at"] else None,
        "home": home,
        "pos": state["pos"],
        "look": state["look"],
        "traits": [{"id": t, **C.TRAITS[t]} for t in state["traits"]],
        "dream": dream_progress(state),
        "rep": dict(zip(("level", "floor", "next"), rep_level(state["rep"])), xp=state["rep"],
                    title=rep_title(rep_level(state["rep"])[0])),
        "missions": [{**item, "label": _mission_def(item["id"])["label"], "reward": C.MISSION_REWARDS[item["tier"]][0]}
                     for item in state["missions"]["list"]] if state["missions"]["day"] == state["total_days"] else [],
        "missions_bonus": state["missions"]["bonus"],
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
