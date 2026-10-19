import copy
import random

import pytest

from game import content as C
from game import engine as E
from game import world as W

from .bot import Bot

H = C.H


def new(profile="staff_pikin", dept="csc", seed="t1", now=0.0):
    return E.new_state(seed, dept, "Tester", profile=profile, now=now)


def clear_event(s):
    while s["phase"] == "event":
        choices = s["pending"]["choices"]
        s, _ = E.choose(s, next(i for i, c in enumerate(choices) if c["enabled"]))
    return s


KEEP = object()


def at(s, hour, minute=0, where=KEEP, day=None):
    """Put the player somewhere at a time of day (on the current day) for a test."""
    s = clear_event(copy.deepcopy(s))
    if day is not None:
        s["day"] = day
    s["clock"] = (s["total_days"] - 1) * 1440 + H(hour, minute)
    if where is not KEEP:
        s["at"] = where
        s["pos"] = E._door(where) if where else s["pos"]
    s["pos_clock"] = s["clock"]
    s["last_sync"] = None
    return s


def ids(s, enabled=True):
    acts = E.available_actions(s)
    return {a["id"] for a in acts if a["enabled"] or not enabled}


def action(s, action_id):
    return next(a for a in E.available_actions(s) if a["id"] == action_id)


# --- Setup ----------------------------------------------------------------------------------------


def test_admission_is_random_but_fixed_per_seed():
    profiles = {E.new_state(f"seed{i}", "csc")["profile"] for i in range(40)}
    assert profiles == set(C.PROFILES)
    assert E.new_state("same", "csc")["profile"] == E.new_state("same", "csc")["profile"]
    with pytest.raises(E.GameError):
        E.new_state("x", "law")


def test_you_wake_up_at_home_with_a_look():
    for profile, p in C.PROFILES.items():
        s = new(profile=profile)
        assert s["at"] == E.home_building(s) and E.tod(s) == C.WAKE_UP
        assert s["pos"] == list(W.NODES[W.BUILDINGS[s["at"]]["node"]])
    look = new()["look"]
    assert set(look) == set(C.LOOK_OPTIONS) and E.clean_look(look) == look
    with pytest.raises(E.GameError):
        E.clean_look({"skin": 99})
    with pytest.raises(E.GameError):
        E.clean_look({"skin": True})


def test_courses_follow_department_and_level():
    s = new(dept="eng")
    assert [c["code"] for c in s["courses"]] == ["ENG 101", "ENG 103", "ENG 105", "ENG 107", "ENG 109"]


def test_every_activity_is_somewhere_real():
    for a in C.ACTIONS:
        assert a["at"] in ("home", "phone", "dept", "lecture", "laptop") or a["at"] in W.BUILDINGS, a["id"]
        assert a["hours"] and (isinstance(a["minutes"], int) or a["minutes"] in ("sleep", "till_dawn", "lecture"))


# --- The clock ------------------------------------------------------------------------------------


def test_one_real_second_is_one_game_minute():
    s = clear_event(new(now=1000))
    start = s["clock"]
    s, _ = E.sync(s, 1030)
    assert s["clock"] == start + 30
    s, _ = E.sync(s, 1030.5)  # half a second: nothing yet, but it isn't lost
    s, _ = E.sync(s, 1031)
    assert s["clock"] == start + 31


def test_closed_app_only_loses_an_hour():
    s = clear_event(new(now=1000))
    start = s["clock"]
    s, _ = E.sync(s, 1000 + 86_400)
    assert s["clock"] == start + E.IDLE_CAP


def test_clock_stops_while_a_dialog_is_open():
    s = clear_event(new(now=0))
    s["last_sync"] = 0
    E._queue_event(s, "aunty")
    clock = s["clock"]
    s, _ = E.sync(s, 40)
    assert s["clock"] == clock
    s, _ = E.choose(s, 0, now=50)
    s, _ = E.sync(s, 60)
    assert s["clock"] == clock + 10


def test_needs_fall_with_time_and_sleep_restores_energy():
    s = at(new(), 14, where="staff")
    s["needs"]["energy"] = 50.0
    before = dict(s["needs"])
    s, _ = E.act(s, "nap")
    assert s["needs"]["hunger"] < before["hunger"] and s["needs"]["energy"] > before["energy"]
    s = at(s, 22, where="staff")
    s["needs"]["energy"] = 20
    day = s["total_days"]
    s, msgs = E.act(s, "sleep")
    s = clear_event(s)
    assert s["total_days"] == day + 1 and E.tod(s) == C.WAKE_UP
    assert s["needs"]["energy"] > 85


def test_sleeping_is_for_night():
    s = at(new(), 10, where="staff")
    assert "Starts" in action(s, "sleep")["reason"]


def test_activities_take_time_and_happen_in_their_building():
    s = at(new(), 10, where="staff")
    with pytest.raises(E.GameError, match="Go there first"):
        E.act(s, "hol_read")
    s = at(s, 10, where="hol")
    clock, prep = s["clock"], s["prep"]
    s, _ = E.act(s, "hol_read")
    assert s["clock"] == clock + 120 and s["prep"] > prep


def test_phone_works_anywhere():
    for where in ("staff", "hol", None):
        s = at(new(), 15, where=where)
        assert "scroll" in ids(s)


def test_opening_hours():
    assert E.building_open("hol", H(23)) and E.building_open("hol", H(3)) and not E.building_open("hol", H(6))
    assert not E.building_open("senate", H(18)) and E.building_open("staff", H(3))
    s = at(new(), 23, where=None)
    s["pos"] = E._door("senate")
    with pytest.raises(E.GameError, match="closed"):
        E.enter_building(s, "senate", E._door("senate"))


def test_collapse_sends_you_to_the_health_centre():
    s = at(new(), 14, where="staff")
    s["needs"]["energy"] = 1
    money = s["money"]
    s, msgs = E.act(s, "scroll")
    assert s["at"] == "health" and s["money"] == money - 1_000
    assert any("collapsed" in m for m in msgs)


def test_late_nights_drain_energy_faster():
    a = at(new(), 21, where="staff")
    b = at(new(), 2, where="staff")
    a, _ = E.act(a, "scroll")
    b, _ = E.act(b, "scroll")
    assert 100 - b["needs"]["energy"] > 0 and (a["needs"]["energy"] - b["needs"]["energy"]) > 1


# --- Lectures, tests and exams --------------------------------------------------------------------


def test_timetable_has_two_lectures_each_weekday_and_repeats():
    s = new(seed="tt")
    assert len(s["timetable"]) == 5
    for row in s["timetable"]:
        assert len(row) == 2 and all(lec["start"] in C.LECTURE_TIMES for lec in row)
    assert E._make_timetable(s) == s["timetable"]


def test_lecture_only_when_its_on_and_late_costs_you():
    s = new(seed="lect")
    lec = s["timetable"][0][0]
    venue = lec["venue"]
    assert venue in C.DEPARTMENTS["csc"]["venues"]
    other = next(v for v in C.DEPARTMENTS["csc"]["venues"] if v != venue)
    wrong = at(s, 0, lec["start"] - 30, where=other)
    assert "is at" in action(wrong, "lecture")["reason"]
    early = at(s, 0, lec["start"] - 30, where=venue)
    assert "lecture" in ids(early)
    wait = at(s, 0, lec["start"] - 120, where=venue)
    assert "Next lecture" in action(wait, "lecture")["reason"]
    on_time, _ = E.act(early, "lecture")
    late, msgs = E.act(at(s, 0, lec["start"] + 35, where=venue), "lecture")
    assert on_time["attended"] == late["attended"] == 1
    assert "late" in msgs[0]
    assert late["prep"] <= on_time["prep"]
    shut = at(s, 0, lec["start"] + C.LECTURE_DOORS_CLOSE + 5, where=venue)
    assert action(shut, "lecture")["enabled"] is False
    again = at(on_time, 0, lec["start"] + 10, where=venue)
    assert E.current_lecture(again) is None or E.current_lecture(again)["start"] != lec["start"]


def test_lectures_held_count_up_at_midnight():
    s = at(new(seed="held"), 23, 50, where="staff")
    s, _ = E.sync({**s, "last_sync": 0}, 20 * 60)
    assert s["lectures_held"] == 2 and s["day"] == 2


def test_ca_test_is_at_nine_in_your_exam_hall():
    s = at(new(seed="ca"), 8, where="staff", day=C.CA_TEST_DAY)
    s["dow"] = 3
    assert E.test_today(s) == "ca"
    assert "write_ca" not in ids(s, enabled=False)
    hall = C.DEPARTMENTS["csc"]["exams"]
    f = at(s, 7, where=hall)
    assert "Doors open" in action(f, "write_ca")["reason"]
    f = at(s, 8, 40, where=hall)
    f, msgs = E.act(f, "write_ca")
    assert f["ca"] is not None and E.tod(f) == H(10)
    late = at(s, 9, 45, where=hall)
    assert not action(late, "write_ca")["enabled"]


def test_missing_the_ca_test_scores_zero():
    s = at(new(seed="missca"), 23, 50, where="staff", day=C.CA_TEST_DAY)
    s["dow"] = 3
    s, msgs = E.sync({**s, "last_sync": 0}, 20 * 60)
    assert s["ca"] is None and any("missed the CA test" in m for m in msgs)


def test_unpaid_fees_means_no_exams():
    s = at(new(profile="hustler", seed="fees"), 8, 30, where=C.DEPARTMENTS["csc"]["exams"], day=C.EXAM_DAYS[0])
    s["dow"] = 1
    assert not s["fees_paid"]
    s, msgs = E.act(s, "write_exam")
    assert any("No exam card" in m for m in msgs)
    assert all(v == 0 for v in s["exam_scores"].values())


def test_good_student_does_well_and_neglect_fails():
    good = Bot("good", "csc", "staff_pikin", "scholar").play()
    bad = Bot("bad", "csc", "staff_pikin", "neglect").play()
    assert good["status"] == bad["status"] == "graduated"
    assert good["final"]["cgpa"] >= 3.5
    assert bad["final"]["cgpa"] < 1.0


def test_grades_and_classes():
    assert E.grade_for(70) == ("A", 5) and E.grade_for(69) == ("B", 4) and E.grade_for(39) == ("F", 0)
    assert E.degree_class(4.5) == "First Class" and E.degree_class(4.49) == "Second Class Upper"
    assert E.degree_class(2.4) == "Second Class Lower" and E.degree_class(0.5) == "No degree yet"


def test_carryovers_are_capped_and_cleared():
    s = new(seed="carry")
    s["carryovers"] = ["CSC 101", "CSC 103", "CSC 105", "CSC 107", "CSC 109", "CSC 102"]
    s["semester"] = 3
    courses = E._semester_courses(s)
    assert len([c for c in courses if c["carry"]]) == C.MAX_CARRYOVERS_PER_SEMESTER
    assert len(courses) == 5 + C.MAX_CARRYOVERS_PER_SEMESTER


# --- Travel ---------------------------------------------------------------------------------------


def test_every_way_to_get_there_is_quoted():
    s = at(new(profile="hustler", seed="plan"), 11, where="awo")
    p = E.plan(s, "market")
    modes = {o["mode"]: o for o in p["options"]}
    assert set(modes) == {"trek", "bus", "keke", "cab"}
    assert modes["trek"]["cost"] == 0 and modes["bus"]["cost"] == 100
    assert 100 <= modes["keke"]["cost"] <= 200
    assert modes["keke"]["minutes"] < modes["trek"]["minutes"]
    assert not modes["cab"]["available"] and "9:00 PM" in modes["cab"]["reason"]
    assert any(seg["kind"] == "wait" for seg in modes["bus"]["segments"])


def test_the_cng_bus_skips_the_faculties_so_you_take_a_keke():
    s = at(new(profile="hustler", seed="faculty"), 11, where="awo")
    modes = {o["mode"]: o for o in E.plan(s, "techlt")["options"]}
    assert modes["keke"]["available"] and modes["keke"]["minutes"] < modes["trek"]["minutes"]
    if modes["bus"]["available"]:  # it can only drop you at a stop on its roads, then you walk
        ride = [seg for seg in modes["bus"]["segments"] if seg["kind"] == "ride"][-1]
        assert ride["points"][-1] in [list(W.NODES[x]) for x in W.BUS_STOPS]
        assert modes["bus"]["segments"][-1]["kind"] == "walk"
    assert "tech" not in W.BUS_ROUTE and "sci" not in W.BUS_ROUTE
    assert {"gate", "mkt", "subn", "angm", "faj", "mor"} <= set(W.BUS_STOPS)


def test_keke_fares_go_by_distance_and_never_pass_200():
    s = at(new(seed="kekefare"), 11, where="sub")
    near = next(o for o in E.plan(s, "buka")["options"] if o["mode"] == "keke")
    far = next(o for o in E.plan(s, "fajuyi")["options"] if o["mode"] == "keke")
    assert near["cost"] == 100 and far["cost"] > near["cost"]
    for to in W.BUILDINGS:
        if to == "sub":
            continue
        keke = next(o for o in E.plan(s, to)["options"] if o["mode"] == "keke")
        assert keke["cost"] <= 200


def test_the_quote_is_the_trip():
    s = at(new(profile="hustler", seed="quote"), 11, where="awo")
    for mode in ("trek", "bus", "keke"):
        quote = next(o for o in E.plan(s, "booc")["options"] if o["mode"] == mode)
        after, msgs = E.travel(s, "booc", mode)
        assert after["clock"] == s["clock"] + quote["minutes"]
        assert after["money"] == s["money"] - quote["cost"]
        assert after["at"] == "booc" and after["last_trip"]["mode"] == mode


def test_trekking_tires_you_more_than_riding():
    s = at(new(profile="hustler", seed="tired"), 11, where="awo")
    s["money"] = 10_000
    walked, _ = E.travel(s, "sports", "trek")
    rode, _ = E.travel(s, "sports", "keke")
    assert walked["needs"]["energy"] < rode["needs"]["energy"]
    assert walked["stats"]["trekked"] > 0 and rode["stats"]["trekked"] == 0


def test_cng_rides_follow_the_roads_both_ways():
    there = E.BUS_RIDES[("mkt", "subn")]
    back = E.BUS_RIDES[("subn", "mkt")]
    assert abs(there[0] - back[0]) < 1e-6  # buses run both directions
    for (a, b), (length, nodes) in E.BUS_RIDES.items():
        assert nodes[0] == a and nodes[-1] == b
        for x, y in zip(nodes, nodes[1:]):
            assert y in {m for m, _, _ in W.GRAPH[x]}, (x, y)


def test_off_campus_trips_take_the_town_bus():
    s = at(new(profile="off_campus", seed="town"), 11, where="offcampus")
    bus = next(o for o in E.plan(s, "market")["options"] if o["mode"] == "bus")
    assert bus["available"] and any(seg["mode"] == "town_bus" for seg in bus["segments"])
    assert bus["cost"] == W.MODES["town_bus"]["fare"] + W.MODES["bus"]["fare"]


def test_night_cabs_only_run_between_the_gate_and_bus_stops():
    s = at(new(seed="night"), 23, 30, where="hol")
    s["money"] = 10_000
    opts = {o["mode"]: o for o in E.plan(s, "staff")["options"]}
    assert not opts["keke"]["available"] and not opts["bus"]["available"]
    assert not opts["cab"]["available"] and "Main Gate" in opts["cab"]["reason"]  # campus to campus: no cab
    out = next(o for o in E.plan(s, "offcampus")["options"] if o["mode"] == "cab")
    assert out["available"] and 250 <= out["cost"] <= 300
    rides = [seg for seg in out["segments"] if seg["kind"] == "ride"]
    assert len(rides) == 1 and rides[0]["points"][-1] == list(W.NODES["gate"])
    home = at(new(profile="off_campus", seed="nightin"), 22, where="offcampus")
    inbound = next(o for o in E.plan(home, "moremi")["options"] if o["mode"] == "cab")
    assert inbound["available"] and 250 <= inbound["cost"] <= 300
    ride = next(seg for seg in inbound["segments"] if seg["kind"] == "ride")
    assert ride["points"][0] == list(W.NODES["gate"]) and ride["points"][-1] in [list(W.NODES[x]) for x in W.BUS_STOPS]
    day = at(home, 15, where="offcampus")
    assert not next(o for o in E.plan(day, "moremi")["options"] if o["mode"] == "cab")["available"]


def test_rush_hour_means_longer_queues():
    s = new(seed="rush")
    rush = [E._wait(s, "bus", "subn", (s["total_days"] - 1) * 1440 + H(8) + 30 * i) for i in range(4)]
    calm = [E._wait(s, "bus", "subn", (s["total_days"] - 1) * 1440 + H(13) + 30 * i) for i in range(4)]
    assert min(rush) >= 12 and max(calm) <= 12


def test_arriving_after_closing_leaves_you_outside():
    s = at(new(seed="closed"), 15, 55, where="staff")
    s, msgs = E.travel(s, "senate", "trek")
    assert s["at"] is None and any("closed" in m for m in msgs)


def test_cant_pay_cant_ride():
    s = at(new(profile="hustler", seed="broke"), 11, where="awo")
    s["money"] = 50
    keke = next(o for o in E.plan(s, "techlt")["options"] if o["mode"] == "keke")
    assert not keke["available"] and keke["reason"] == "Not enough money"
    with pytest.raises(E.GameError):
        E.travel(s, "techlt", "keke")


# --- Walking around -------------------------------------------------------------------------------


def test_walk_out_and_in():
    s = at(new(seed="walk"), 12, where="staff")
    s, _ = E.exit_building(s)
    assert s["at"] is None
    with pytest.raises(E.GameError, match="entrance"):
        E.enter_building(s, "buka", [s["pos"][0], s["pos"][1]])
    # walk to the buka: 20 game minutes later, standing at its door
    s["clock"] += 20
    s, _ = E.enter_building(s, "buka", E._door("buka"))
    assert s["at"] == "buka"


def test_no_teleporting():
    s = at(new(seed="tele"), 12, where="staff")
    s, _ = E.exit_building(s)
    with pytest.raises(E.GameError, match="that fast"):
        E.enter_building(s, "offcampus", E._door("offcampus"))
    # a heartbeat with an impossible position is ignored
    s["last_sync"] = 0
    s2, _ = E.sync(s, 1, pos=E._door("offcampus"))
    assert s2["pos"] == s["pos"]
    s3, _ = E.sync(s, 10, pos=[s["pos"][0] + 30, s["pos"][1]])
    assert s3["pos"] == [s["pos"][0] + 30, s["pos"][1]]
    with pytest.raises(E.GameError):
        E.sync(s, 10, pos=["a", 1])
    with pytest.raises(E.GameError):
        E.sync(s, 10, pos=[1e9, 0])


def test_travel_from_where_you_stand():
    s = at(new(seed="stand"), 12, where="staff")
    s, _ = E.exit_building(s)
    s["clock"] += 5
    here = [s["pos"][0] - 20, s["pos"][1]]
    trip = next(o for o in E.plan(s, "sub", pos=here)["options"] if o["mode"] == "trek")
    assert trip["segments"][0]["points"][0] == here


# --- Events, money, skills ------------------------------------------------------------------------


def test_hustle_income_counts_only_hustles():
    s = at(new(profile="hustler"), 12)
    s, _ = E.act(s, "sell_data")
    assert s["stats"]["hustle_income"] > 0
    assert "Already done today" in action(s, "sell_data")["reason"]
    s2 = at(new(profile="staff_pikin"), 12)
    s2, _ = E.act(s2, "call_home")
    assert s2["stats"]["hustle_income"] == 0


def test_same_move_same_luck():
    s = at(new(seed="luck"), 12)
    a, _ = E.act(s, "sell_data")
    b, _ = E.act(s, "sell_data")
    assert a["money"] == b["money"]


def test_event_blocks_actions_until_answered():
    s = at(new(), 12)
    E._queue_event(s, "aunty")
    with pytest.raises(E.GameError):
        E.act(s, "scroll")
    with pytest.raises(E.GameError):
        E.travel(s, "sub", "trek")
    money = s["money"]
    s, msgs = E.choose(s, 0)
    assert s["money"] == money + 5_000 and s["phase"] == "play"


def test_loan_is_repaid_later():
    s = at(new(), 12)
    s["money"] = 10_000
    E._queue_event(s, "roommate_borrow")
    s, _ = E.choose(s, 0)
    assert s["money"] == 7_000 and s["flags"]["loan_out"] == 3_000
    E._queue_event(s, "repay")
    s, _ = E.choose(s, 0)
    assert s["money"] == 10_000 and "loan_out" not in s["flags"]


def test_strike_pauses_the_semester():
    s = at(new(), 23, 30, where="staff")
    s["strike_days"] = 2
    s = at(s, 9, where="tech")
    assert E.lectures_today(s) == [] and "lecture" not in ids(s)
    day = s["day"]
    s = at(s, 23, 50, where="staff")
    s, _ = E.sync({**s, "last_sync": 0}, 20 * 60)
    assert s["day"] == day and s["strike_days"] == 1


def test_fees_deadline_offers_a_costly_loan():
    s = at(new(profile="hustler", seed="loan"), 5, 50, day=C.EXAM_DAYS[0] - 2)
    s["money"] = 3_000
    s["flags"]["seen"] = [e["id"] for e in C.EVENTS]
    s, _ = E.sync({**s, "last_sync": 0}, 20 * 60)
    assert s["pending"]["id"] == "fees_deadline"
    short = s["pending"]["short"]
    money = s["money"]
    s, msgs = E.choose(s, 1)
    assert s["money"] == money + short
    assert s["flags"]["debt"] == round(short * 1.3 / 50) * 50
    s, _ = E.act(s, "pay_fees")
    assert s["fees_paid"]
    s["money"] = 500
    E._start_of_day(s, random.Random(1), [])
    assert s["money"] == 0 and s["flags"]["debt"] == round(short * 1.3 / 50) * 50 - 500


def test_scholarship_stipend_stops_below_350():
    s = new(profile="scholarship", seed="sch")
    s["results"] = [{"courses": [{"points": 2, "grade": "C"}] * 5, "gpa": 2.0}]
    s["day"] = C.SEMESTER_DAYS + 1
    E._compute_results(s, [])
    assert s["flags"]["scholarship"] is False and "stipend" in s["last_result"]["note"]


def test_practice_levels_up_skills_and_unlocks_gigs():
    s = at(new(profile="staff_pikin", seed="skill"), 12, where="hol")
    assert E.skill_level(s, "coding") == 1
    assert action(s, "bug_fix")["locked"] and "level 3" in action(s, "bug_fix")["reason"]
    s["skills"]["coding"] = C.SKILL_LEVELS[2] - 5
    s, msgs = E.act(s, "learn_coding")
    assert E.skill_level(s, "coding") == 3 and any("Coding is now level 3" in m for m in msgs)
    assert "bug_fix" in ids(at(s, 15))


def test_higher_skill_level_pays_more():
    s = new(profile="staff_pikin", seed="pay")
    low = E._hustle_pay(s, 2_500, "design")
    s["skills"]["design"] = C.SKILL_LEVELS[-1]
    assert E.skill_level(s, "design") == 10
    assert E._hustle_pay(s, 2_500, "design") >= 2 * low


def test_big_gigs_are_weekly():
    s = at(new(profile="staff_pikin", seed="weekly"), 9)
    s["skills"]["coding"] = C.SKILL_LEVELS[4]
    money = s["money"]
    s, _ = E.act(s, "website_gig")
    assert s["money"] > money
    assert "Once a week" in action(at(s, 9), "website_gig")["reason"]


def test_business_pays_every_night_and_resells_for_60_percent():
    s = at(new(profile="staff_pikin", seed="biz"), 9)
    s["money"] = 100_000
    s, msgs = E.act(s, "buy_kiosk")
    assert "kiosk" in s["businesses"] and s["money"] == 70_000
    assert "Badge unlocked: Oga at the top!" in msgs
    names = [a["id"] for a in E.available_actions(s)]
    assert "buy_kiosk" not in names and "sell_kiosk" in names
    s = at(s, 22, where="staff")
    s, msgs = E.act(s, "sleep")
    assert any("business" in m.lower() for m in msgs)
    s = at(s, 10)
    s["needs"] = {k: 90.0 for k in s["needs"]}
    money = s["money"]
    s, _ = E.act(s, "sell_kiosk")
    assert s["money"] == money + 18_000 and "kiosk" not in s["businesses"]


def test_badges_are_awarded_once():
    s = at(new(profile="staff_pikin", seed="badge"), 22, where="hol")
    s["stats"]["tdb"] = 4
    s, msgs = E.act(s, "hol_tdb")
    assert "night_crawler" in s["badges"] and "Badge unlocked: Night crawler!" in msgs
    s, msgs = E.act(at(s, 22, where="hol"), "hol_tdb")
    assert s["badges"].count("night_crawler") == 1 and not any("Night crawler" in m for m in msgs)


def test_burnout_slows_reading():
    a = at(new(seed="burn"), 10, where="hol")
    b = copy.deepcopy(a)
    b["needs"]["fun"] = 5
    assert E._study_multiplier(b) < E._study_multiplier(a)
    assert any("Burnt out" in n for n in E.upcoming(b))


# --- Saves ----------------------------------------------------------------------------------------


def test_v2_saves_are_upgraded_to_the_clock():
    s = clear_event(new(profile="hustler", seed="old"))
    for key in ("clock", "at", "pos", "pos_clock", "last_sync", "timetable", "look", "last_trip"):
        s.pop(key)
    s["flags"].pop("attended_keys")
    s["stats"].pop("trekked")
    s["slot"] = 2
    s["version"] = 2
    s["needs"] = {k: int(v) for k, v in s["needs"].items()}
    v = E.view(s)
    assert v["at"] == v["home"] and v["minute"] == H(17)
    s2, _ = E.act(s, "scroll")
    assert s2["version"] == E.VERSION and "slot" not in s2


def test_whole_degrees_keep_invariants():
    """Fuzz: bots with different habits play whole degrees; nothing crashes or goes out of range."""
    for i, (profile, style) in enumerate([("hustler", "lazy"), ("off_campus", "balanced"), ("scholarship", "builder")]):
        bot = Bot(f"fuzz{i}", "mcb", profile, style)
        while bot.s["status"] == "playing" and bot.moves < 40_000:
            bot.step()
            s = bot.s
            assert s["money"] >= 0 and 0 <= s["prep"] <= 100
            assert all(0 <= v <= 100 for v in s["needs"].values())
            assert s["total_days"] == s["clock"] // 1440 + 1
        assert s["status"] == "graduated", (profile, style)
        assert C.SEMESTERS <= s["final"]["semesters"] <= C.SEMESTERS + C.MAX_EXTRA_SEMESTERS
        E.view(s)


# --- Phones, the market, your own ride ------------------------------------------------------------


def test_halls_follow_your_choice():
    girl = E.new_state("hall1", "csc", profile="hustler", look={**E.random_look("x"), "hall": 1})
    boy = E.new_state("hall2", "csc", profile="hustler", look={**E.random_look("x"), "hall": 0})
    assert girl["at"] == "mozambique" and boy["at"] == "angola"


def test_no_phone_no_phone_apps_until_you_buy_one():
    s = at(new(profile="tecno" and "scholarship", seed="lost"), 12, where="sub")
    E._queue_event(s, "phone_stolen")
    s, _ = E.choose(s, 0)
    assert s["phone"] is None and E.view(s)["phone"] == []
    assert any("No phone" in u for u in E.upcoming(s))
    s = at(s, 12, where="market")
    s["money"] = 100_000
    names = {a["id"] for a in E.available_actions(s) if a["enabled"]}
    assert "buy_phone_itel" in names and "buy_phone_iphone" not in names  # can't afford it
    s, msgs = E.act(s, "buy_phone_itel")
    assert s["phone"] == {"model": "itel", "cracked": False} and "upgrade" in s["badges"]
    assert E.view(s)["phone"]


def test_a_torchlight_phone_can_call_home_but_not_do_gigs():
    s = at(new(profile="hustler", seed="nokia"), 12)
    s["at"] = E.home_building(s)
    s["phone"] = {"model": "nokia", "cracked": False}
    phone = {a["id"]: a for a in E.view(s)["phone"]}
    assert phone["call_home"]["enabled"] and phone["snake"]["enabled"]
    assert phone["design_gig"]["reason"] == "Needs a smartphone"
    assert not phone["pay_fees"]["enabled"]
    s = at(s, 12, where="sub")
    s["money"] = 20_000
    s, _ = E.act(s, "pay_fees_bc")
    assert s["fees_paid"] and s["money"] == 20_000 - C.SCHOOL_CHARGES - 200


def test_cracked_screens_get_fixed_at_the_market():
    s = at(new(profile="hustler", seed="crack"), 12, where="market")
    assert s["phone"]["cracked"]
    s["money"] = 50_000
    s, _ = E.act(s, "fix_screen")
    assert not s["phone"]["cracked"] and s["money"] == 50_000 - C.PHONES["itel"]["screen_fix"]


def test_foodstuff_makes_cooking_free():
    s = at(new(seed="pantry"), 12, where="market")
    s, _ = E.act(s, "foodstuff")
    assert s["pantry"] == 6
    s = at(s, 19, where=E.home_building(s))
    money = s["money"]
    s, _ = E.act(s, "cook")
    s = clear_event(s)
    assert s["money"] == money and s["pantry"] == 5
    s, _ = E.act(at(s, 20), "garri")
    assert s["pantry"] == 4


def test_your_own_ride_goes_door_to_door():
    s = at(new(profile="staff_pikin", seed="car"), 11, where="staff")
    modes = {o["mode"]: o for o in E.plan(s, "techlt")["options"]}
    assert "car" in modes and "bike" not in modes
    car = modes["car"]
    assert car["available"] and car["wait"] == 0 and car["cost"] in (100, 200)
    assert car["minutes"] < modes["trek"]["minutes"]
    night = at(s, 23, where="staff")
    assert next(o for o in E.plan(night, "techlt")["options"] if o["mode"] == "car")["available"]
    b = at(new(profile="hustler", seed="bike"), 11, where="market")
    b["money"] = 60_000
    b, msgs = E.act(b, "buy_bike")
    assert "bike" in b["items"] and "own_ride" in b["badges"]
    bike = next(o for o in E.plan(b, "techlt")["options"] if o["mode"] == "bike")
    assert bike["available"] and bike["cost"] == 0


def test_campus_hustles_need_their_tools():
    s = at(new(profile="hustler", seed="barb"), 12, where=None)
    s["at"] = E.home_building(s)
    barb = action(s, "barb")
    assert not barb["enabled"] and "clippers" in barb["reason"]
    s["items"].append("clippers")
    s, msgs = E.act(s, "barb")
    assert s["stats"]["hustle_income"] > 0 and s["skills"]["barbing"] > 0
    c = at(new(profile="hustler", seed="chin"), 12)
    c["at"] = E.home_building(c)
    c["money"] = 5_000
    c, _ = E.act(c, "chinchin")
    assert c["money"] > 5_000


# --- Seats, laptops, Hustling and Charisma --------------------------------------------------------


def test_come_early_to_keep_a_seat():
    s = new(seed="seat")
    lec = s["timetable"][0][0]
    early, m1 = E.act(at(s, 0, lec["start"] - 40, where=lec["venue"]), "lecture")
    back, m2 = E.act(at(s, 0, lec["start"] - 5, where=lec["venue"]), "lecture")
    late, m3 = E.act(at(s, 0, lec["start"] + 30, where=lec["venue"]), "lecture")
    assert "seat in front" in m1[0] and "back" in m2[0] and "window" in m3[0]
    assert early["prep"] >= back["prep"] >= late["prep"]


def test_needs_fall_slowly():
    s = at(new(seed="slow"), 8, where="staff")
    s["needs"] = {k: 80.0 for k in s["needs"]}
    s["last_sync"] = 0
    s, _ = E.sync(s, 60 * 60)  # an hour passes, a minute per second, in steps the cap allows
    for _ in range(3):
        s, _ = E.sync(s, s["last_sync"] + 60 * 60)
    assert all(v > 70 for v in s["needs"].values()), s["needs"]


def test_coding_needs_a_laptop():
    s = at(new(profile="hustler", seed="laptop"), 12)
    s["at"] = E.home_building(s)
    assert E.view(s)["laptop"] == [] and not E.view(s)["has_laptop"]
    s = at(s, 12, where="market")
    s["money"] = 300_000
    s, _ = E.act(s, "buy_laptop")
    assert "laptop" in s["items"]
    v = E.view(s)
    assert {a["id"] for a in v["laptop"]} >= {"learn_coding", "bug_fix", "website_gig"}
    s, msgs = E.act(s, "learn_coding")
    assert s["skills"]["coding"] == 12


def test_hustles_train_hustling_and_it_pays():
    s = at(new(profile="hustler", seed="hus"), 12, where="market")
    low = E._hustle_pay(s, 2_000)
    s, msgs = E.act(s, "shop_assistant") if E.is_weekday(s) else E.act(s, "puff")
    assert s["skills"]["hustling"] >= C.HUSTLE_XP or not E.is_weekday(s)
    s["skills"]["hustling"] = C.SKILL_LEVELS[5]
    assert E._hustle_pay(s, 2_000) > low


def test_being_social_trains_charisma():
    s = at(new(seed="cha"), 19, where="staff")
    s, msgs = E.act(s, "gist")
    assert s["skills"]["charisma"] > 0


# --- Traits, dream, Rep, missions, streak, moodlets, lecture moments ------------------------------


def test_traits_and_dream_are_chosen_on_day_one_only():
    s = clear_event(new(seed="who"))
    assert len(s["traits"]) == 2 and s["dream"] in C.DREAMS
    s2 = E.set_look(s, s["look"], ["clean_pikin", "tech"], "tech")
    assert s2["traits"] == ["clean_pikin", "tech"] and s2["dream"] == "tech"
    with pytest.raises(E.GameError):
        E.set_look(s, s["look"], ["tech", "tech"], "tech")
    with pytest.raises(E.GameError):
        E.set_look(s, s["look"], ["tech"], "nope")
    later = dict(s2, day=3)
    with pytest.raises(E.GameError):
        E.set_look(later, s["look"], ["hustler", "foodie"], "odogwu")


def test_traits_change_how_needs_fall():
    a = at(new(seed="clean"), 9, where="staff")
    b = copy.deepcopy(a)
    a["traits"] = ["clean_pikin", "tech"]
    b["traits"] = ["hustler", "tech"]
    a, _ = E.act(a, "scroll")
    b, _ = E.act(b, "scroll")
    assert a["needs"]["hygiene"] > b["needs"]["hygiene"]


def test_rep_levels_and_titles():
    assert E.rep_level(0) == (1, 0, 100)
    assert E.rep_level(100) == (2, 100, 260)
    assert E.rep_title(1) == "JJC" and E.rep_title(3) == "Stalite" and E.rep_title(16) == "Great Ife Legend"


def test_daily_missions_pay_and_the_bonus_comes_once():
    s = at(new(seed="missions"), 10, where="staff")
    s["missions"]["list"] = [{"id": "freshen", "tier": "easy", "done": False},
                             {"id": "sub", "tier": "campus", "done": False},
                             {"id": "any_hustle", "tier": "hustle", "done": False}]
    money, rep = s["money"], s["rep"]
    s, msgs = E.act(s, "bath")
    assert s["missions"]["list"][0]["done"] and any("Mission done" in m for m in msgs)
    s, msgs = E.travel(s, "sub", "keke")
    assert s["missions"]["list"][1]["done"]
    s, msgs = E.act(s, "sell_data") if E.has_smartphone(s) else E.act(s, "business_centre")
    assert s["missions"]["bonus"] and any("All three missions" in m for m in msgs)
    assert s["rep"] > rep


def test_new_missions_every_morning():
    s = at(new(seed="newday"), 23, 50, where="staff")
    day = s["missions"]["day"]
    s["last_sync"] = 0
    s, _ = E.sync(s, 60 * 60)
    for _ in range(8):
        s, _ = E.sync(s, s["last_sync"] + 60 * 60)
    s = clear_event(s)
    assert s["missions"]["day"] == day + 1 and len(s["missions"]["list"]) == 3


def test_daily_streak_counts_real_days():
    s = clear_event(new(seed="streak", now=0))
    day1 = 1_800_000_000.0
    s, msgs = E.sync(s, day1)
    assert s["streak"]["day"] == 1 and any("day 1 of 7" in m for m in msgs)
    s, msgs = E.sync(s, day1 + 3600)
    assert s["streak"]["day"] == 1 and not any("streak" in m for m in msgs)
    s, _ = E.sync(s, day1 + 86_400)
    assert s["streak"]["day"] == 2
    s, _ = E.sync(s, day1 + 3 * 86_400)  # missed a day
    assert s["streak"]["day"] == 1


def test_moodlets_lift_or_drop_your_mood():
    s = at(new(seed="mood"), 10, where="staff")
    base = E.mood(s)
    E._add_moodlet(s, "straight_as")
    assert E.mood(s) > base
    s["clock"] += 49 * 60
    assert all(m["id"] != "straight_as" for m in E.active_moodlets(s))
    s["money"] = 100
    assert any(m["id"] == "sapa" for m in E.active_moodlets(s))


def test_lecture_moments_and_pop_quizzes():
    seen = set()
    for i in range(30):
        s = new(seed=f"moment{i}")
        lec = s["timetable"][0][0]
        s, _ = E.act(at(s, 0, lec["start"] - 30, where=lec["venue"]), "lecture")
        if s["phase"] == "event" and s["pending"]["id"] == "pop_quiz":
            seen.add("quiz")
            right, _ = E.choose(s, s["pending"]["answer"])
            wrong, _ = E.choose(s, (s["pending"]["answer"] + 1) % len(s["pending"]["choices"]))
            assert right["prep"] > wrong["prep"] and right["rep"] > wrong["rep"]
        elif s["phase"] == "event" and s["pending"]["id"].startswith("class:"):
            seen.add("moment")
            s, msgs = E.choose(s, 0)
            assert s["phase"] == "play" and msgs
    assert seen == {"quiz", "moment"}


def test_quiz_answers_are_valid():
    for dept, bank in C.QUIZZES.items():
        for q, options, answer in bank:
            assert 0 <= answer < len(options) and len(set(options)) == len(options), (dept, q)
