"""The rules of Great Ife Life.

Pure Python: a game is a JSON-able dict, and every function takes a state and returns a new one.
The server is the only place these run, so players can't give themselves money or grades.
Randomness is seeded from the game's seed and turn number, so replaying a request can't reroll luck.
"""

from __future__ import annotations

import copy
import random

from . import content as C


class GameError(Exception):
    """A move that isn't allowed right now; the message is shown to the player."""


# --- Setup ----------------------------------------------------------------------------------------


def new_state(seed: str, department: str, name: str = "", profile: str | None = None) -> dict:
    if department not in C.DEPARTMENTS:
        raise GameError("Choose a department.")
    rng = random.Random(f"{seed}-admission")
    profile = profile or rng.choice(list(C.PROFILES))
    p = C.PROFILES[profile]
    state = {
        "version": 1,
        "seed": seed,
        "turn": 0,
        "name": name,
        "profile": profile,
        "department": department,
        "status": "playing",
        "phase": "play",
        "semester": 1,
        "day": 1,
        "slot": 0,
        "dow": 0,
        "total_days": 1,
        "strike_days": 0,
        "strike_used": False,
        "money": p["money"],
        "needs": {"hunger": 70, "energy": 85, "hygiene": 75, "fun": 60, "social": 45},
        "prep": 10,
        "attended": 0,
        "lectures_held": 0,
        "ca": None,
        "exam_scores": {},
        "fees_paid": bool(p["fees_covered"]),
        "courses": [],
        "carryovers": [],
        "results": [],
        "flags": {"scholarship": profile == "scholarship", "seen": []},
        "pending": None,
        "last_result": None,
        "log": [],
        "stats": {"earned": 0, "spent": 0, "lectures": 0, "hustles": 0, "hustle_income": 0, "study_slots": 0},
    }
    upgrade(state)
    state["courses"] = _semester_courses(state)
    _log(state, f"Welcome to Great Ife! You're a {p['name']} in {C.DEPARTMENTS[department]['name']}.")
    _start_of_day(state, rng)
    return state


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


def upgrade(state: dict) -> dict:
    """Bring a saved game up to the current version, so players never lose progress after an update."""
    state.setdefault("skills", {k: 0 for k in C.SKILLS})
    for k in C.SKILLS:
        state["skills"].setdefault(k, 0)
    state.setdefault("businesses", {})
    state.setdefault("badges", [])
    for key in ("tdb", "collapses", "business_income", "loans", "skits"):
        state["stats"].setdefault(key, 0)
    state["version"] = 2
    return state


def skill_level(state, skill: str) -> int:
    xp = state["skills"].get(skill, 0)
    return sum(1 for need in C.SKILL_LEVELS if xp >= need)


# --- Helpers --------------------------------------------------------------------------------------


def _rng(state, tag: str) -> random.Random:
    return random.Random(f"{state['seed']}-{state['turn']}-{tag}")


def _clamp(value, lo=0, hi=100):
    return max(lo, min(hi, value))


def _log(state, text: str):
    state["log"].append({"day": state["total_days"], "slot": state["slot"], "text": text})
    del state["log"][:-40]


def mood(state) -> int:
    return round(sum(state["needs"].values()) / len(state["needs"]))


def burnt_out(state) -> bool:
    """All work and no play: no fun or no friends makes reading and exams harder."""
    return state["needs"]["fun"] < 15 or state["needs"]["social"] < 10


def _study_multiplier(state) -> float:
    m = 0.6 + mood(state) / 250  # 0.6 when miserable, 1.0 when everything is full
    if burnt_out(state):
        m *= 0.8
    if state["needs"]["energy"] < 20:
        m *= 0.5
    return m * (1 + C.PROFILES[state["profile"]].get("study_bonus", 0))


def _apply_effects(state, effects: dict, *, study=False):
    for key, value in effects.items():
        if key == "prep":
            if study and value > 0:
                value = value * _study_multiplier(state) * (1 - state["prep"] / 150)
            state["prep"] = _clamp(round(state["prep"] + value))
        elif key in state["needs"]:
            state["needs"][key] = _clamp(state["needs"][key] + value)


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


def forced_activity(state) -> str | None:
    """Tests and exams take the morning slot on their days."""
    if state["strike_days"] or state["slot"] != 0:
        return None
    if state["day"] == C.CA_TEST_DAY and state["ca"] is None and state["semester"] <= C.SEMESTERS:
        return "write_ca"
    if state["day"] in C.EXAM_DAYS:
        return "write_exam"
    return None


def level_label(state) -> str:
    if state["semester"] > C.SEMESTERS:
        return "Extra year"
    level = ((state["semester"] - 1) // 2 + 1) * 100
    return f"{level} Level, {'First' if state['semester'] % 2 else 'Second'} Semester"


# --- What can I do now? --------------------------------------------------------------------------


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


def _check(state, action) -> str | None:
    """Return why an action can't be done now, or None if it can."""
    p = C.PROFILES[state["profile"]]
    if state["slot"] not in action["slots"]:
        return f"Only in the {' / '.join(C.SLOTS[s].lower() for s in action['slots'])}"
    if not _day_ok(action.get("days"), state):
        return {"weekdays": "Weekdays only", "fri_sat": "Fridays and Saturdays only", "weekend": "Weekends only"}[
            action["days"]]
    if action["id"] in ("lecture", "study_group", "tutorial", "teach_tutorial") and state["strike_days"]:
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
    if action["id"] == "pay_fees":
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
    cost = action_cost(state, action)
    if state["money"] < cost:
        return "Not enough money"
    return None


def action_cost(state, action) -> int:
    cost = action.get("cost", 0)
    if action["id"] == "pay_fees":
        cost = C.SCHOOL_CHARGES
    if action["id"] == "bath" and state["flags"].get("no_water"):
        cost += 300
    if action.get("campus"):
        cost += _transport_due(state)
    return cost


def _transport_due(state) -> int:
    fare = C.PROFILES[state["profile"]].get("transport", 0)
    return fare if fare and state["flags"].get("transport_day") != state["total_days"] else 0


def _hustle_pay(state, base: int, skill: str | None = None) -> int:
    bonus = 1 + C.PROFILES[state["profile"]].get("hustle_bonus", 0)
    if skill:
        bonus *= 1 + C.SKILL_PAY_PER_LEVEL * (skill_level(state, skill) - 1)
    tired = 0.6 if state["needs"]["energy"] < 15 else 1.0
    return int(round(base * bonus * tired / 50) * 50)


def available_actions(state) -> list[dict]:
    if state["phase"] != "play":
        return []
    forced = forced_activity(state)
    if forced:
        return [_forced_view(state, forced)]
    out = []
    for action in C.ACTIONS:
        if action.get("profiles") and state["profile"] not in action["profiles"]:
            continue
        if action["id"] == "pay_fees" and C.PROFILES[state["profile"]]["fees_covered"]:
            continue
        owned = action.get("business") in state["businesses"]
        if (action.get("special") == "buy_business" and owned) or (action.get("special") == "sell_business" and not owned):
            continue
        reason = _check(state, action)
        skill = action.get("skill")
        out.append({
            "id": action["id"], "place": action["place"], "label": action["label"], "blurb": action["blurb"],
            "cost": action_cost(state, action),
            "earn": _hustle_pay(state, action["earn"], skill) if action.get("earn") else 0,
            "effects": action.get("effects", {}), "hustle": bool(action.get("hustle")), "study": bool(action.get("study")),
            "skill": C.SKILLS[skill]["name"] if skill else None, "xp": action.get("xp", 0),
            "locked": bool(action.get("min_level") and skill_level(state, skill) < action["min_level"]),
            "enabled": reason is None, "reason": reason,
        })
    return out


def _forced_view(state, forced):
    if forced == "write_ca":
        return {"id": "write_ca", "place": "exam", "label": "Write the CA test", "enabled": True, "reason": None,
                "blurb": "30% of every course. Your readiness decides how it goes.", "cost": 0, "earn": 0, "effects": {}}
    first_day = state["day"] == C.EXAM_DAYS[0]
    blocked = not state["fees_paid"]
    return {"id": "write_exam", "place": "exam", "enabled": True, "reason": None, "cost": 0, "earn": 0, "effects": {},
            "label": "Go to the exam hall" if blocked else f"Write exams (day {1 if first_day else 2} of 2)",
            "blurb": ("You haven't paid school charges. They may not let you in." if blocked
                      else "70% of every course. Good luck!")}


# --- Taking a turn --------------------------------------------------------------------------------


def act(state: dict, action_id: str) -> tuple[dict, list[str]]:
    state = upgrade(copy.deepcopy(state))
    if state["status"] != "playing":
        raise GameError("This game is over. Start a new one!")
    if state["phase"] != "play":
        raise GameError("Finish what's on screen first.")
    messages: list[str] = []
    forced = forced_activity(state)
    if forced:
        if action_id != forced:
            raise GameError("You have a test or exam this morning!")
        (_write_ca if forced == "write_ca" else _write_exam)(state, messages)
    else:
        action = C.ACTIONS_BY_ID.get(action_id)
        if not action:
            raise GameError("Unknown action.")
        if action.get("profiles") and state["profile"] not in action["profiles"]:
            raise GameError("That's not available to you.")
        reason = _check(state, action)
        if reason:
            raise GameError(reason)
        _do_action(state, action, messages)

    state["turn"] += 1
    _advance(state, messages)
    # An event caused by the action (e.g. the porter seizing your stove) shows after time passes,
    # unless the next day already opened with its own event or the semester ended.
    queued = state.pop("queued_event", None)
    if queued and state["phase"] == "play":
        _queue_event(state, queued)
    _check_badges(state, messages)
    for m in messages:
        _log(state, m)
    return state, messages


def _do_action(state, action, messages):
    rng = _rng(state, action["id"])
    flags = state["flags"]
    cost = action_cost(state, action)
    if action.get("campus") and _transport_due(state):
        flags["transport_day"] = state["total_days"]
        messages.append(f"Paid ₦{_transport_due_amount(state):,} transport to campus.")
    if cost:
        _add_money(state, -cost)

    effects = dict(action.get("effects", {}))
    special = action.get("special")
    line = action.get("done", action["label"])

    if special == "lecture":
        state["attended"] += 1
        state["stats"]["lectures"] += 1
        if rng.random() < 0.12:
            effects.pop("prep", None)
            state["queued_event"] = "no_lecturer"
    elif special == "cook" and C.PROFILES[state["profile"]]["home"].endswith("Hall") and rng.random() < 0.12:
        state["queued_event"] = "stove"
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
            line = f"Called home. They sent ₦{amount:,}."
        else:
            line = "Called home. 'Things are hard, my child. Next week.'"
    elif special == "pay_fees":
        state["fees_paid"] = True
        line = f"Paid school charges (₦{C.SCHOOL_CHARGES:,}). Exam card collected!"
    elif special == "bath" and flags.get("no_water"):
        line = "Bought a bucket of water and had a bath (₦300)."
    elif special == "skit":
        state["stats"]["skits"] += 1
        level = skill_level(state, "content")
        if level >= 2 and rng.random() < 0.08 + 0.04 * level:
            earn = _hustle_pay(state, rng.randint(4, 10) * 500 * level)
            _add_money(state, earn)
            state["stats"]["hustle_income"] += earn
            flags["viral"] = True
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
    if action["id"] == "hol_tdb":
        state["stats"]["tdb"] += 1

    if action.get("earn"):
        earn = _hustle_pay(state, action["earn"], action.get("skill"))
        _add_money(state, earn)
        state["stats"]["hustle_income"] += earn
        line = f"{action['label']}: +₦{earn:,}"
    if action.get("hustle"):
        state["stats"]["hustles"] += 1
    if action.get("study"):
        state["stats"]["study_slots"] += 1
    if action.get("once_per_day"):
        flags[f"done_{action['id']}"] = state["total_days"]
    if action.get("weekly"):
        flags[f"week_{action['id']}"] = week_key(state)
    if action.get("skill") and action.get("xp"):
        _gain_xp(state, action["skill"], action["xp"], messages)

    before = state["prep"]
    _apply_effects(state, effects, study=bool(action.get("study")))
    if action.get("study") and state["prep"] > before:
        line += f" (readiness +{state['prep'] - before})"
    elif cost and not action.get("earn") and special not in ("pay_fees", "bath", "buy_business"):
        line += f" (₦{cost:,})"
    messages.insert(0, line)


def _gain_xp(state, skill, xp, messages):
    before = skill_level(state, skill)
    state["skills"][skill] += xp
    after = skill_level(state, skill)
    if after > before:
        messages.append(f"Level up! {C.SKILLS[skill]['name']} is now level {after}.")


def _business_payouts(state, messages):
    """Every night each business makes money after costs, or has a bad day."""
    if not state["businesses"]:
        return
    rng = _rng(state, "biz")
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
        "tycoon": len(state["businesses"]) == len(C.BUSINESSES),
        "master": any(skill_level(state, k) >= 5 for k in C.SKILLS),
        "viral": bool(state["flags"].get("viral")),
        "strike": state["strike_used"] and not state["strike_days"] and state["phase"] != "event",
        "loan_app": s["loans"] > 0,
        "broke": state["money"] == 0,
        "health_centre": s["collapses"] >= 3,
        "clean_sheet": state["status"] == "graduated" and "F" not in grades,
        "first_class": state["status"] == "graduated" and state.get("final", {}).get("class") == "First Class",
    }
    for badge, ok in earned.items():
        if ok and badge not in have:
            state["badges"].append(badge)
            messages.append(f"Badge unlocked: {C.BADGES[badge][0]}!")


def _transport_due_amount(state):
    return C.PROFILES[state["profile"]].get("transport", 0)


# --- Tests, exams and results ---------------------------------------------------------------------


def _performance(state, rng, weight: float) -> float:
    """A test/exam score from readiness, attendance and how you feel."""
    n = len(state["courses"])
    prep = state["prep"] / (1 + 0.03 * max(0, n - C.COURSES_PER_SEMESTER))
    held = max(1, state["lectures_held"])
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
    _apply_effects(state, {"energy": -10, "fun": -5})
    verdict = "You flew through it!" if state["ca"] >= 70 else "Not bad." if state["ca"] >= 50 else "That was rough."
    messages.append(f"Wrote the CA test. {verdict} You'll see your score on the result slip.")


def _write_exam(state, messages):
    rng = _rng(state, "exam")
    courses = state["courses"]
    half = (len(courses) + 1) // 2
    today = courses[:half] if state["day"] == C.EXAM_DAYS[0] else courses[half:]
    if not state["fees_paid"]:
        for c in today:
            state["exam_scores"][c["code"]] = 0
        messages.append("No exam card! You were turned back at the exam hall. Pay your school charges.")
        _apply_effects(state, {"fun": -25, "energy": -5})
        return
    base = _performance(state, rng, 1.0)
    for c in today:
        state["exam_scores"][c["code"]] = _clamp(round(base + rng.uniform(-8, 8)))
    _apply_effects(state, {"energy": -15, "fun": -8, "hunger": -6})
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


def continue_after_results(state: dict) -> tuple[dict, list[str]]:
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
                          "lectures": state["stats"]["lectures"], "strike": state["strike_used"]}
        messages.append(f"You've finished! Final CGPA {final:.2f}: {degree_class(final)}.")
        _check_badges(state, messages)
        state["final"]["badges"] = len(state["badges"])
        state["final"]["business_income"] = state["stats"]["business_income"]
    else:
        state["semester"] += 1
        state.update(day=1, slot=0, dow=0, prep=min(25, 8 + state["prep"] // 8), attended=0, lectures_held=0,
                     ca=None, exam_scores={}, phase="play", last_result=None)
        state["total_days"] += 1
        state["fees_paid"] = bool(C.PROFILES[state["profile"]]["fees_covered"])
        state["flags"]["seen"] = []
        state["courses"] = _semester_courses(state)
        messages.append(f"New semester: {level_label(state)}.")
        _start_of_day(state, _rng(state, "day"))
        _check_badges(state, messages)
    for m in messages:
        _log(state, m)
    return state, messages


# --- Time passing ---------------------------------------------------------------------------------


def _advance(state, messages, depth=0):
    """One time slot passes."""
    if state["slot"] in (0, 1) and is_weekday(state) and not state["strike_days"] and not forced_activity(state):
        state["lectures_held"] += 1
    for need, delta in C.DECAY.items():
        state["needs"][need] = _clamp(state["needs"][need] + delta)

    if (state["needs"]["hunger"] == 0 or state["needs"]["energy"] == 0) and depth == 0:
        fee = min(1_000, state["money"])
        _add_money(state, -fee)
        state["stats"]["collapses"] = state["stats"].get("collapses", 0) + 1
        state["needs"]["hunger"] = max(state["needs"]["hunger"], 35)
        state["needs"]["energy"] = max(state["needs"]["energy"], 35)
        messages.append(f"You collapsed and were taken to the Health Centre{f' (₦{fee:,})' if fee else ''}. "
                        "You lost a few hours. Eat and sleep!")
        state["slot"] += 1
        if state["slot"] > 3:
            _end_of_day(state, messages)
            return
        _advance(state, messages, depth=1)
        return

    state["slot"] += 1
    if state["slot"] > 3:
        _end_of_day(state, messages)


def _end_of_day(state, messages):
    _business_payouts(state, messages)
    state["slot"] = 0
    state["total_days"] += 1
    state["dow"] = (state["dow"] + 1) % 7
    if state["strike_days"]:
        state["strike_days"] -= 1
        state["prep"] = _clamp(state["prep"] - 2)
        if not state["strike_days"]:
            messages.append("ASUU has called off the strike! Back to class.")
    else:
        state["day"] += 1
    if state["day"] > C.SEMESTER_DAYS:
        _compute_results(state, messages)
        return
    _start_of_day(state, _rng(state, "day"), messages)


def _start_of_day(state, rng, messages=None):
    messages = messages if messages is not None else []
    flags = state["flags"]
    for key in ("no_light", "no_water"):
        if flags.get(key):
            flags[key] -= 1
    p = C.PROFILES[state["profile"]]
    if state["dow"] == 0 and p["allowance"] and (state["profile"] != "scholarship" or flags["scholarship"]):
        _add_money(state, p["allowance"])
        who = "stipend" if state["profile"] == "scholarship" else "allowance"
        messages.append(f"Monday! Your weekly {who} of ₦{p['allowance']:,} has arrived.")
        _log(state, messages[-1])

    if flags.get("debt") and state["money"] > 0:
        take = min(flags["debt"], state["money"])
        _add_money(state, -take)
        flags["debt"] -= take
        messages.append(f"The loan app took ₦{take:,}." + ("" if flags["debt"] else " Loan fully repaid!"))
        _log(state, messages[-1])

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

    if forced_activity(state) or rng.random() > 0.38:
        return
    eligible = []
    for event in C.EVENTS:
        if event["when"] != "day" or event["id"] in flags["seen"]:
            continue
        if event.get("homes") and p["home"] not in event["homes"]:
            continue
        req = event.get("requires", {})
        if req.get("min_money") and state["money"] < req["min_money"]:
            continue
        if req.get("flag") and not (flags.get(req["flag"]) and flags.get(f"{req['flag']}_day", 0) < state["total_days"]):
            continue
        if event["weight"]:
            eligible.append(event)
    if eligible:
        event = rng.choices(eligible, weights=[e["weight"] for e in eligible])[0]
        _queue_event(state, event["id"])


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


def choose(state: dict, index: int) -> tuple[dict, list[str]]:
    state = upgrade(copy.deepcopy(state))
    pending = state.get("pending")
    if state["phase"] != "event" or not pending:
        raise GameError("No event to respond to.")
    messages = []
    if pending["id"] == "strike":
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
        messages.append(choice["result"])
    state["pending"] = None
    state["phase"] = "play"
    state["turn"] += 1
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
    if state["ca"] is None and day <= C.CA_TEST_DAY and state["semester"] <= C.SEMESTERS:
        n = C.CA_TEST_DAY - day
        notes.append("CA test this morning" if n == 0 else f"CA test in {n} day{'s' if n > 1 else ''}")
    first_exam = C.EXAM_DAYS[0]
    if day <= C.EXAM_DAYS[-1]:
        n = first_exam - day
        notes.append("Exams today" if n <= 0 else f"Exams in {n} day{'s' if n > 1 else ''}")
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


def view(state: dict) -> dict:
    state = upgrade(copy.deepcopy(state))
    p = C.PROFILES[state["profile"]]
    actions = available_actions(state)
    places = []
    for place_id, place in C.PLACES.items():
        acts = [a for a in actions if a["place"] == place_id]
        if acts:
            places.append({"id": place_id, "name": place["name"], "blurb": place["blurb"], "actions": acts})
    exam = [a for a in actions if a["place"] == "exam"]
    held = state["lectures_held"]
    return {
        "name": state["name"],
        "status": state["status"],
        "phase": state["phase"],
        "turn": state["turn"],
        "profile": {"id": state["profile"], "name": p["name"], "tagline": p["tagline"], "home": p["home"],
                    "perks": p["perks"]},
        "department": {"id": state["department"], **C.DEPARTMENTS[state["department"]]},
        "semester": state["semester"],
        "level": level_label(state),
        "day": state["day"],
        "days_in_semester": C.SEMESTER_DAYS,
        "weekday": C.WEEKDAYS[state["dow"]],
        "slot": C.SLOTS[state["slot"]],
        "slot_index": state["slot"],
        "strike_days": state["strike_days"],
        "money": state["money"],
        "needs": state["needs"],
        "mood": mood(state),
        "prep": state["prep"],
        "attendance": round(100 * state["attended"] / held) if held else None,
        "cgpa": cgpa(state) if state["results"] else None,
        "fees_paid": state["fees_paid"],
        "fees_covered": bool(p["fees_covered"]),
        "courses": state["courses"],
        "carryovers": state["carryovers"],
        "upcoming": upcoming(state),
        "forced": exam[0] if exam else None,
        "places": places,
        "pending": state["pending"],
        "last_result": state["last_result"],
        "graduates_next": state["phase"] == "results" and graduates_now(state),
        "results": state["results"],
        "final": state.get("final"),
        "skills": [{"id": k, "name": v["name"], "level": skill_level(state, k), "xp": state["skills"][k],
                    "next": C.SKILL_LEVELS[skill_level(state, k)] if skill_level(state, k) < len(C.SKILL_LEVELS) else None,
                    "floor": C.SKILL_LEVELS[skill_level(state, k) - 1]}
                   for k, v in C.SKILLS.items()],
        "businesses": [{"id": k, "name": C.BUSINESSES[k]["name"]} for k in state["businesses"]],
        "business_income": state["stats"]["business_income"],
        "badges": [{"id": k, "name": n, "description": d, "earned": k in state["badges"]} for k, (n, d) in C.BADGES.items()],
        "log": state["log"][-12:][::-1],
    }
