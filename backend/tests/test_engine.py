import random

import pytest

from game import content as C
from game import engine as E


def new(profile="staff_pikin", dept="csc", seed="t1"):
    return E.new_state(seed, dept, "Tester", profile=profile)


def clear_event(s):
    while s["phase"] == "event":
        choices = s["pending"]["choices"]
        s, _ = E.choose(s, next(i for i, c in enumerate(choices) if c["enabled"]))
    return s


def do(s, action):
    s = clear_event(s)
    s, msgs = E.act(s, action)
    return clear_event(s), msgs


def enabled_ids(s):
    return {a["id"] for a in E.available_actions(s) if a["enabled"]}


def test_admission_is_random_but_fixed_per_seed():
    a, b = E.new_state("same", "csc"), E.new_state("same", "csc")
    assert a["profile"] == b["profile"]
    profiles = {E.new_state(f"s{i}", "csc")["profile"] for i in range(40)}
    assert profiles == set(C.PROFILES)
    with pytest.raises(E.GameError):
        E.new_state("x", "medicine")


def test_courses_follow_department_and_level():
    s = new(dept="ecn")
    assert [c["code"] for c in s["courses"]] == ["ECN 101", "ECN 103", "ECN 105", "ECN 107", "ECN 109"]


def test_time_passes_one_slot_per_action_and_needs_decay():
    s = clear_event(new())
    hunger = s["needs"]["hunger"]
    s, _ = do(s, "scroll")
    assert s["slot"] == 1 and s["needs"]["hunger"] == hunger - 7
    for _ in range(2):
        s, _ = do(s, "scroll")
    s, _ = do(s, "sleep")
    assert s["slot"] == 0 and s["day"] == 2 and s["dow"] == 1


def test_actions_respect_time_of_day_and_money():
    s = clear_event(new())
    assert "sleep" not in enabled_ids(s)  # morning
    assert "lecture" in enabled_ids(s)    # Monday morning
    s["money"] = 100
    assert "amala" not in enabled_ids(s)
    with pytest.raises(E.GameError, match="Not enough money"):
        E.act(s, "amala")


def test_staff_pikin_eats_at_home_once_a_day():
    s = clear_event(new())
    s, _ = do(s, "home_food")
    assert "home_food" not in enabled_ids(s)
    with pytest.raises(E.GameError):
        E.act(s, "home_food")
    s2 = clear_event(new(profile="hustler"))
    assert "home_food" not in {a["id"] for a in E.available_actions(s2)}


def test_ca_test_morning_is_forced():
    s = clear_event(new())
    while not (s["day"] == C.CA_TEST_DAY and s["slot"] == 0):
        s, _ = do(s, "sleep" if s["slot"] == 3 else "scroll")
    assert [a["id"] for a in E.available_actions(s)] == ["write_ca"]
    with pytest.raises(E.GameError, match="test or exam"):
        E.act(s, "scroll")
    s, _ = E.act(s, "write_ca")
    assert s["ca"] is not None


def play_semester(s, study=True):
    """Play to the end of the semester with a simple sensible routine."""
    start = s["semester"]
    while s["semester"] == start and s["phase"] != "results" and s["status"] == "playing":
        s = clear_event(s)
        if s["phase"] == "results":
            break
        ids = enabled_ids(s)
        forced = E.forced_activity(s)
        if forced:
            choice = forced
        elif s["slot"] == 3:
            choice = "sleep"
        elif s["needs"]["hunger"] < 40 and ids & {"home_food", "rice", "cook"}:
            choice = next(i for i in ("home_food", "rice", "cook") if i in ids)
        elif s["needs"]["hygiene"] < 30 and "bath" in ids:
            choice = "bath"
        elif "pay_fees" in ids and not s["fees_paid"]:
            choice = "pay_fees"
        elif study:
            choice = next((i for i in ("lecture", "hol_read", "study_group", "read_room") if i in ids), "scroll")
        else:
            choice = "scroll"
        s, _ = E.act(s, choice)
    return s


def test_good_student_passes_lazy_student_fails():
    good = play_semester(clear_event(new(seed="g")))
    lazy = play_semester(clear_event(new(seed="g")), study=False)
    assert good["phase"] == lazy["phase"] == "results"
    assert good["last_result"]["gpa"] >= 3.0
    assert lazy["last_result"]["gpa"] < good["last_result"]["gpa"]
    assert len(good["last_result"]["courses"]) == 5


def test_unpaid_fees_means_no_exams():
    s = clear_event(new(profile="hustler", seed="fees"))
    s["money"] = 0
    while s["phase"] != "results":
        s = clear_event(s)
        if s["phase"] == "results":
            break
        forced = E.forced_activity(s)
        s, msgs = E.act(s, forced or ("sleep" if s["slot"] == 3 else "scroll"))
    assert all(c["exam"] == 0 for c in s["last_result"]["courses"])
    assert all(c["grade"] == "F" for c in s["last_result"]["courses"])
    assert any("No exam card" in line["text"] for line in s["log"])


def test_carryovers_are_capped_and_cleared():
    s = new(seed="carry")
    s["carryovers"] = ["CSC 101", "CSC 103", "CSC 105", "CSC 107", "CSC 109", "CSC 102"]
    s["semester"] = 3
    courses = E._semester_courses(s)
    assert len([c for c in courses if c["carry"]]) == C.MAX_CARRYOVERS_PER_SEMESTER
    assert len(courses) == 5 + C.MAX_CARRYOVERS_PER_SEMESTER


def test_grades_and_classes():
    assert E.grade_for(70) == ("A", 5) and E.grade_for(69) == ("B", 4) and E.grade_for(39) == ("F", 0)
    assert E.degree_class(4.5) == "First Class" and E.degree_class(4.49) == "Second Class Upper"
    assert E.degree_class(2.4) == "Second Class Lower" and E.degree_class(0.5) == "No degree yet"


def test_hustle_income_counts_only_hustles():
    s = clear_event(new(profile="hustler"))
    s, _ = do(s, "sell_data")
    assert s["stats"]["hustle_income"] > 0
    s2 = clear_event(new(profile="staff_pikin"))
    s2, _ = do(s2, "call_home")
    assert s2["stats"]["hustle_income"] == 0


def test_same_move_same_luck():
    s = clear_event(new(seed="luck"))
    a, _ = E.act(s, "sell_data")
    b, _ = E.act(s, "sell_data")
    assert a["money"] == b["money"]


def test_event_blocks_actions_until_answered():
    s = clear_event(new())
    E._queue_event(s, "aunty")
    with pytest.raises(E.GameError):
        E.act(s, "scroll")
    money = s["money"]
    s, msgs = E.choose(s, 0)
    assert s["money"] == money + 5_000 and s["phase"] == "play"


def test_loan_is_repaid_later():
    s = clear_event(new())
    s["money"] = 10_000
    E._queue_event(s, "roommate_borrow")
    s, _ = E.choose(s, 0)
    assert s["money"] == 7_000 and s["flags"]["loan_out"] == 3_000
    E._queue_event(s, "repay")
    s, _ = E.choose(s, 0)
    assert s["money"] == 10_000 and "loan_out" not in s["flags"]


def test_strike_pauses_the_semester():
    s = clear_event(new())
    s["strike_days"] = 2
    day = s["day"]
    assert "lecture" not in enabled_ids(s)
    for _ in range(4):
        s, _ = do(s, "sleep" if s["slot"] == 3 else "scroll")
    assert s["day"] == day and s["strike_days"] == 1


def test_scholarship_stipend_stops_below_350():
    s = clear_event(new(profile="scholarship", seed="sch"))
    s = play_semester(s, study=False)
    assert s["last_result"]["cgpa"] < 3.5
    assert s["flags"]["scholarship"] is False
    assert "stipend" in s["last_result"]["note"]


def test_full_degree_random_play_keeps_invariants():
    """Fuzz: random legal moves for whole degrees, every profile; nothing crashes or goes out of range."""
    for profile in C.PROFILES:
        rng = random.Random(profile)
        s = new(profile=profile, seed=f"fuzz-{profile}")
        for _ in range(4000):
            if s["status"] != "playing":
                break
            if s["phase"] == "event":
                choices = s["pending"]["choices"]
                s, _ = E.choose(s, rng.choice([i for i, c in enumerate(choices) if c["enabled"]]))
            elif s["phase"] == "results":
                s, _ = E.continue_after_results(s)
            else:
                acts = [a["id"] for a in E.available_actions(s) if a["enabled"]]
                s, _ = E.act(s, rng.choice(acts))
            assert s["money"] >= 0
            assert all(0 <= v <= 100 for v in s["needs"].values())
            assert 0 <= s["prep"] <= 100
        assert s["status"] == "graduated", profile
        assert C.SEMESTERS <= s["final"]["semesters"] <= C.SEMESTERS + C.MAX_EXTRA_SEMESTERS
        assert 0 <= s["final"]["cgpa"] <= 5
        E.view(s)  # the finished game still renders


def to_day(s, day):
    while s["day"] < day:
        s = clear_event(s) if s["pending"] and s["pending"]["id"] != "fees_deadline" else s
        if s["phase"] == "event":
            return s
        forced = E.forced_activity(s)
        s, _ = E.act(s, forced or ("sleep" if s["slot"] == 3 else "scroll"))
    return s


def test_fees_deadline_offers_a_costly_loan():
    s = clear_event(new(profile="hustler", seed="loan"))
    s["money"] = 3_000
    s = to_day(s, C.EXAM_DAYS[0] - 2)
    while s["pending"]["id"] != "fees_deadline":
        s, _ = E.choose(s, 0)
        s = to_day(s, C.EXAM_DAYS[0] - 1)
    short = s["pending"]["short"]
    money = s["money"]
    s, msgs = E.choose(s, 1)
    assert s["money"] == money + short == C.SCHOOL_CHARGES
    assert s["flags"]["debt"] == round(short * 1.3 / 50) * 50
    s, _ = do(s, "pay_fees")
    assert s["fees_paid"]
    # repayment comes out of future money, never below zero
    s["money"] = 500
    E._start_of_day(s, random.Random(1), [])
    assert s["money"] == 0 and s["flags"]["debt"] == round(short * 1.3 / 50) * 50 - 500


def test_fees_deadline_can_pay_directly():
    s = clear_event(new(profile="off_campus", seed="pay"))
    s["money"] = 20_000
    E._queue_fees_deadline(s)
    s, _ = E.choose(s, 0)
    assert s["fees_paid"] and s["money"] == 10_000


def test_burnout_slows_reading():
    a = clear_event(new(seed="burn"))
    b = clear_event(new(seed="burn"))
    b["needs"]["fun"] = 5
    a, _ = E.act(a, "lecture")
    b, _ = E.act(b, "lecture")
    assert b["prep"] < a["prep"]
    assert any("Burnt out" in n for n in E.upcoming(b))


# --- Skills, businesses and badges -------------------------------------------------------------


def at_slot(s, slot):
    while s["slot"] != slot or s["phase"] != "play" or E.forced_activity(s):
        s = clear_event(s)
        forced = E.forced_activity(s)
        if s["phase"] == "results":
            s, _ = E.continue_after_results(s)
            continue
        s, _ = E.act(s, forced or ("sleep" if s["slot"] == 3 else "scroll"))
    return s


def test_practice_levels_up_skills_and_unlocks_gigs():
    s = clear_event(new(profile="staff_pikin", seed="skill"))
    assert E.skill_level(s, "coding") == 1
    ids = {a["id"]: a for a in E.available_actions(at_slot(s, 1))}
    assert ids["bug_fix"]["locked"] and "level 2" in ids["bug_fix"]["reason"]
    s["skills"]["coding"] = C.SKILL_LEVELS[1] - 5
    s = at_slot(s, 1)
    s, msgs = E.act(s, "learn_coding")
    assert E.skill_level(s, "coding") == 2
    assert any("Level up! Coding is now level 2" in m for m in msgs)
    s = at_slot(s, 1)
    assert "bug_fix" in enabled_ids(s)


def test_higher_skill_level_pays_more():
    s = clear_event(new(profile="staff_pikin", seed="pay"))
    low = E._hustle_pay(s, 2_500, "design")
    s["skills"]["design"] = C.SKILL_LEVELS[4]
    assert E.skill_level(s, "design") == 5
    assert E._hustle_pay(s, 2_500, "design") == 2 * low


def test_big_gigs_are_weekly():
    s = clear_event(new(profile="staff_pikin", seed="weekly"))
    s["skills"]["coding"] = C.SKILL_LEVELS[2]
    s = at_slot(s, 1)
    money = s["money"]
    s, _ = E.act(s, "website_gig")
    assert s["money"] > money
    s = at_slot(s, 1)
    action = next(a for a in E.available_actions(s) if a["id"] == "website_gig")
    assert not action["enabled"] and "Once a week" in action["reason"]


def test_business_pays_every_night_and_resells_for_60_percent():
    s = clear_event(new(profile="staff_pikin", seed="biz"))
    s["money"] = 100_000
    s = at_slot(s, 0)
    s, msgs = E.act(s, "buy_kiosk")
    assert "kiosk" in s["businesses"] and s["money"] == 70_000
    assert "Badge unlocked: Oga at the top!" in msgs
    ids = [a["id"] for a in E.available_actions(s)]
    assert "buy_kiosk" not in ids and "sell_kiosk" in ids
    before = s["money"]
    s = at_slot(s, 3)
    s, msgs = E.act(s, "sleep")
    assert any("business" in m.lower() for m in msgs)
    assert s["stats"]["business_income"] != 0 or s["money"] < before
    s = at_slot(s, 0)
    s["needs"] = {k: 90 for k in s["needs"]}  # nobody collapses mid-sale
    money = s["money"]
    s, _ = E.act(s, "sell_kiosk")
    assert s["money"] == money + 18_000 and "kiosk" not in s["businesses"]


def test_badges_are_awarded_once():
    s = clear_event(new(profile="staff_pikin", seed="badge"))
    s["stats"]["tdb"] = 4
    s = at_slot(s, 3)
    s, msgs = E.act(s, "hol_tdb")
    assert "night_crawler" in s["badges"] and "Badge unlocked: Night crawler!" in msgs
    s = at_slot(s, 3)
    s, msgs = E.act(s, "hol_tdb")
    assert s["badges"].count("night_crawler") == 1
    assert not any("Night crawler" in m for m in msgs)


def test_old_saves_are_upgraded():
    s = clear_event(new(seed="old"))
    for key in ("skills", "businesses", "badges"):
        s.pop(key)
    for key in ("tdb", "collapses", "business_income", "loans", "skits"):
        s["stats"].pop(key)
    s["version"] = 1
    E.view(s)  # renders without crashing
    s, _ = E.act(s, "scroll")
    assert s["version"] == 2 and s["skills"]["coding"] == 0
