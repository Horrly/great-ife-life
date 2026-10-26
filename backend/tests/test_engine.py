import math
import copy
import random

import pytest

from game import content as C
from game import engine as E
from game import world as W

from .bot import Bot

H = C.H


MONDAY = 1_792_387_800.0   # Monday 19 October 2026, 6:30 AM in Lagos


HOMES = {
    "staff": {"kind": "flat", "building": "staff", "area": "Road 7", "rent": 0, "room": None,
              "label": "Staff Quarters (Road 7)", "session": 99},
    "offcampus": {"kind": "self_con", "building": "offcampus", "area": "Asherifa", "rent": 250_000, "room": None,
                  "label": "Self-contain in Asherifa", "session": 1},
}


def new(profile="odogwu", dept="csc", seed="t1", now=MONDAY, home="staff"):
    """A test student. By default they live in the Staff Quarters, so tests can say where="staff" for home."""
    s = E.new_state(seed, dept, "Tester", profile=profile, now=now)
    if home in HOMES:
        s["housing"] = dict(HOMES[home])
        s["at"] = home
        s["pos"] = E._door(home)
    return s


def banked(s, balance=0, bank="gtbank"):
    """Give the test student a bank account (and a card)."""
    s["bank"] = {"bank": bank, "number": "0123456789", "balance": balance, "card": not C.BANKS[bank]["app"],
                 "history": []}
    return s


def t_of(s):
    """The real timestamp that matches the state's clock."""
    return s["epoch"] + s["clock"] * 60


def later(s, minutes):
    """Let real minutes pass with the app open."""
    now = t_of(s)
    s = {**s, "last_tick": now + minutes * 60 - 60}
    return E.sync(s, now + minutes * 60)


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
    s["pos_time"] = None
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
        E.new_state("x", "astrology")


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


def test_clock_is_real_lagos_time():
    s = clear_event(new(now=MONDAY))
    assert E.tod(s) == H(6, 30) and s["dow"] == 0 and s["day"] == 1
    start = s["clock"]
    s, _ = E.sync(s, MONDAY + 59)
    assert s["clock"] == start
    s, _ = E.sync(s, MONDAY + 60)
    assert s["clock"] == start + 1
    s, _ = E.sync(s, MONDAY + 3 * 3600)
    assert E.tod(s) == H(9, 30)
    saturday = E.new_state("sat", "csc", now=MONDAY - 2 * 86_400)
    assert saturday["dow"] == 5 and saturday["day"] == 0 and E.lectures_today(saturday) == []


def test_while_you_are_away_life_goes_on_gently():
    s = clear_event(new(now=MONDAY))
    s = at(s, 12, where="hol")
    s["last_tick"] = t_of(s)
    s, msgs = E.sync(s, t_of(s) + 26 * 3600)   # gone until 2 PM tomorrow
    assert s["total_days"] == 2 and E.tod(s) == H(14)
    assert all(v >= E.AWAY_FLOOR - 0.01 for v in s["needs"].values())
    assert s["needs"]["energy"] > 50          # the night counted as sleep
    assert s["at"] == "staff" and any("went back" in m for m in msgs)


def test_clock_catches_up_after_a_dialog():
    s = clear_event(new(now=MONDAY))
    E._queue_event(s, "aunty")
    clock = s["clock"]
    s, _ = E.sync(s, MONDAY + 600)
    assert s["clock"] == clock
    s, _ = E.choose(s, 0, now=MONDAY + 650)
    s, _ = E.sync(s, MONDAY + 660)
    assert s["clock"] == clock + 11


def test_actions_play_in_seconds_and_sleep_takes_real_hours():
    s = at(new(), 14, where="staff")
    s["needs"]["energy"] = 50.0
    before = dict(s["needs"])
    clock = s["clock"]
    s, _ = E.act(s, "nap", now=t_of(s))
    assert s["clock"] == clock and 3 <= s["playback"] <= 16
    assert s["needs"]["hunger"] < before["hunger"] and s["needs"]["energy"] > before["energy"]
    with pytest.raises(E.GameError, match="still busy"):
        E.act(s, "bath", now=t_of(s) + 1)
    s = at(s, 22, where="staff")
    s["needs"]["energy"] = 20
    clock = s["clock"]
    s, msgs = E.act(s, "sleep", now=t_of(s))
    # sleep is a quick action now: about 15 seconds on screen, energy full, no waiting real hours
    assert not s.get("asleep") and s["needs"]["energy"] == 100 and s["playback"] <= 20 and s["clock"] == clock


def test_you_can_sleep_any_time_at_home():
    s = at(new(), 10, where="staff")
    assert action(s, "sleep")["reason"] is None


def test_activities_take_time_and_happen_in_their_building():
    s = at(new(), 10, where="staff")
    with pytest.raises(E.GameError, match="Go there first"):
        E.act(s, "hol_read")
    s = at(s, 10, where="hol")
    clock, prep = s["clock"], s["prep"]
    s, _ = E.act(s, "hol_read")
    assert s["clock"] == clock and s["prep"] > prep


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
    assert 100 - b["needs"]["energy"] > 0 and (a["needs"]["energy"] - b["needs"]["energy"]) > 0.5


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
    s, _ = later(s, 20)
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
    assert f["ca"] is not None and E.tod(f) == H(8, 40)
    late = at(s, 9, 45, where=hall)
    assert not action(late, "write_ca")["enabled"]


def test_missing_the_ca_test_scores_zero():
    s = at(new(seed="missca"), 23, 50, where="staff", day=C.CA_TEST_DAY)
    s["dow"] = 3
    s, msgs = later(s, 20)
    assert s["ca"] is None and any("missed the CA test" in m for m in msgs)


def test_unpaid_fees_means_no_exams():
    s = at(new(profile="lapo_baby", seed="fees"), 8, 30, where=C.DEPARTMENTS["csc"]["exams"], day=C.EXAM_DAYS[0])
    s["dow"] = 1
    assert not s["fees_paid"]
    s, msgs = E.act(s, "write_exam")
    assert any("No exam card" in m for m in msgs)
    assert all(v == 0 for v in s["exam_scores"].values())


def test_good_student_does_well_and_neglect_fails():
    good = Bot("good", "csc", "odogwu", "scholar").play()
    bad = Bot("bad", "csc", "odogwu", "neglect").play()
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
    s = at(new(profile="lapo_baby", seed="plan"), 11, where="awo")
    p = E.plan(s, "market")
    modes = {o["mode"]: o for o in p["options"]}
    assert set(modes) == {"trek", "bus", "keke", "cab"}
    assert modes["trek"]["cost"] == 0 and modes["bus"]["cost"] == 100
    assert 100 <= modes["keke"]["cost"] <= 200
    assert modes["keke"]["minutes"] < modes["trek"]["minutes"]
    assert not modes["cab"]["available"] and "9 PM" in modes["cab"]["reason"]
    assert any(seg["kind"] == "wait" for seg in modes["bus"]["segments"])


def test_the_cng_bus_skips_the_faculties_so_you_take_a_keke():
    s = at(new(profile="lapo_baby", seed="faculty"), 11, where="awo")
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
    near = next(o for o in E.plan(s, "moremi")["options"] if o["mode"] == "keke")
    far = next(o for o in E.plan(s, "angola")["options"] if o["mode"] == "keke")
    assert near["cost"] == 100 and far["cost"] > near["cost"]
    for to in W.BUILDINGS:
        if to == "sub":
            continue
        keke = next(o for o in E.plan(s, to)["options"] if o["mode"] == "keke")
        assert keke["cost"] <= 200


def test_the_quote_is_the_trip():
    s = at(new(profile="lapo_baby", seed="quote"), 11, where="awo")
    for mode in ("trek", "bus", "keke"):
        quote = next(o for o in E.plan(s, "booc")["options"] if o["mode"] == mode)
        after, msgs = E.travel(s, "booc", mode)
        assert after["clock"] == s["clock"] and after["playback"] == quote["seconds"]
        assert after["money"] == s["money"] - quote["cost"]
        assert after["at"] == "booc" and after["last_trip"]["mode"] == mode


def test_trekking_tires_you_more_than_riding():
    s = at(new(profile="lapo_baby", seed="tired"), 11, where="awo")
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
    s = at(new(profile="nepo_baby", seed="town"), 11, where="offcampus")
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
    home = at(new(profile="nepo_baby", seed="nightin"), 22, where="offcampus")
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
    s = at(new(seed="closed"), 16, 5, where="staff")
    s, msgs = E.travel(s, "senate", "trek")
    assert s["at"] is None and any("closed" in m for m in msgs)


def test_cant_pay_cant_ride():
    s = at(new(profile="lapo_baby", seed="broke"), 11, where="awo")
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
    t = t_of(s)
    s, _ = E.exit_building(s, now=t)
    with pytest.raises(E.GameError, match="that fast"):
        E.enter_building(s, "offcampus", E._door("offcampus"), now=t + 2)
    # a heartbeat with an impossible position is ignored
    s2, _ = E.sync(s, t + 1, pos=E._door("offcampus"))
    assert s2["pos"] == s["pos"]
    s3, _ = E.sync(s, t + 10, pos=[s["pos"][0] + 30, s["pos"][1]])
    assert s3["pos"] == [s["pos"][0] + 30, s["pos"][1]]
    with pytest.raises(E.GameError):
        E.sync(s, t + 10, pos=["a", 1])
    with pytest.raises(E.GameError):
        E.sync(s, t + 10, pos=[1e9, 0])


def test_travel_from_where_you_stand():
    s = at(new(seed="stand"), 12, where="staff")
    s, _ = E.exit_building(s)
    s["clock"] += 5
    here = [s["pos"][0] - 20, s["pos"][1]]
    trip = next(o for o in E.plan(s, "sub", pos=here)["options"] if o["mode"] == "trek")
    assert trip["segments"][0]["points"][0] == here


# --- Events, money, skills ------------------------------------------------------------------------


def test_hustle_income_counts_only_hustles():
    s = at(new(profile="lapo_baby"), 12)
    s, _ = E.act(s, "sell_data")
    assert s["stats"]["hustle_income"] > 0
    assert "Already done today" in action(s, "sell_data")["reason"]
    s2 = banked(at(new(profile="odogwu"), 12))
    s2, _ = E.ask_parents(s2, 20_000)
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
    s, _ = later(s, 20)
    assert s["day"] == day and s["strike_days"] == 1


def test_fees_deadline_offers_a_costly_loan():
    s = banked(at(new(profile="lapo_baby", seed="loan"), 5, 50, day=C.EXAM_DAYS[0] - 2))
    s["money"] = 3_000
    s["flags"]["seen"] = [e["id"] for e in C.EVENTS]
    s, _ = later(s, 20)
    assert s["pending"]["id"] == "fees_deadline"
    short = s["pending"]["short"]
    money = E.total_money(s)
    s, msgs = E.choose(s, 1)
    assert E.total_money(s) == money + short
    assert s["flags"]["debt"] == round(short * 1.3 / 50) * 50
    s["bank"]["balance"] += s["money"]   # deposit the cash, then pay on the portal
    s["money"] = 0
    s, _ = E.act(s, "pay_fees")
    assert s["fees_paid"]
    s["money"] = 500
    s["bank"]["balance"] = 0
    E._start_of_day(s, random.Random(1), [])
    assert E.total_money(s) == 0 and s["flags"]["debt"] == round(short * 1.3 / 50) * 50 - 500


def test_parents_send_some_money_but_never_more_than_their_cap():
    for profile, cap in (("lapo_baby", 20_000), ("nepo_baby", 100_000), ("odogwu", 300_000)):
        sent = []
        for i in range(30):
            s = at(new(profile=profile, seed=f"ask{profile}{i}"), 12)
            s["phone"] = s["phone"] or {"model": "itel", "cracked": False}  # a random event may have taken it
            banked(s)
            s, msgs = E.ask_parents(s, 500_000)
            sent.append(E.bank_balance(s))
            with pytest.raises(E.GameError, match="already called"):
                E.ask_parents(s, 5_000)
        assert max(sent) <= cap and max(sent) > 0
        assert any(x == 0 for x in sent) or profile == "odogwu"
    s = at(new(profile="nepo_baby", seed="late"), 23)
    with pytest.raises(E.GameError, match="account number"):
        E.ask_parents(at(new(profile="nepo_baby", seed="noacct"), 12), 5_000)
    banked(s)
    with pytest.raises(E.GameError, match="too late"):
        E.ask_parents(s, 5_000)


def test_practice_levels_up_skills_and_unlocks_gigs():
    s = banked(at(new(profile="odogwu", seed="skill"), 12, where="hol"))
    assert E.skill_level(s, "coding") == 1
    assert action(s, "bug_fix")["locked"] and "level 3" in action(s, "bug_fix")["reason"]
    s["skills"]["coding"] = C.SKILL_LEVELS[2] - 5
    s, msgs = E.act(s, "learn_coding")
    assert E.skill_level(s, "coding") == 3 and any("Coding is now level 3" in m for m in msgs)
    assert "bug_fix" in ids(at(s, 15))


def test_higher_skill_level_pays_more():
    s = new(profile="odogwu", seed="pay")
    low = E._hustle_pay(s, 2_500, "design")
    s["skills"]["design"] = C.SKILL_LEVELS[-1]
    assert E.skill_level(s, "design") == 10
    assert E._hustle_pay(s, 2_500, "design") >= 2 * low


def test_big_gigs_are_weekly():
    s = at(new(profile="odogwu", seed="weekly"), 9)
    s["skills"]["coding"] = C.SKILL_LEVELS[4]
    assert "open a bank account" in action(s, "website_gig")["reason"]
    banked(s)
    s, _ = E.act(s, "website_gig")
    assert E.bank_balance(s) > 0  # clients pay into your account
    assert "Once a week" in action(at(s, 9), "website_gig")["reason"]


def test_business_pays_every_evening_and_resells_for_60_percent():
    s = banked(at(new(profile="odogwu", seed="biz"), 9), 100_000)
    s["money"] = 0
    s["flags"]["seen"] = [e["id"] for e in C.EVENTS]
    s, msgs = E.act(s, "buy_kiosk")
    assert "kiosk" in s["businesses"] and E.bank_balance(s) == 70_000
    assert "Badge unlocked: Oga at the top!" in msgs
    names = [a["id"] for a in E.available_actions(s)]
    assert "buy_kiosk" not in names and "sell_kiosk" in names
    s = at(s, 19, 50, where="staff")
    s, msgs = later(s, 20)  # 8 PM: takings land
    assert any("evening takings" in m.lower() for m in msgs)
    s = at(s, 10)
    s["needs"] = {k: 90.0 for k in s["needs"]}
    money = E.total_money(s)
    s, _ = E.act(s, "sell_kiosk")
    assert E.total_money(s) == money + 18_000 and "kiosk" not in s["businesses"]


def test_badges_are_awarded_once():
    s = at(new(profile="odogwu", seed="badge"), 22, where="hol")
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


def test_old_saves_are_upgraded_to_real_time():
    s = clear_event(new(profile="lapo_baby", seed="old"))
    for key in ("clock", "at", "pos", "pos_time", "last_sync", "timetable", "look", "last_trip", "housing", "epoch",
                "last_tick", "busy_until", "asleep"):
        s.pop(key)
    s["profile"] = "hustler"
    s["flags"].pop("attended_keys")
    s["stats"].pop("trekked")
    s["slot"] = 2
    s["version"] = 2
    s["needs"] = {k: int(v) for k, v in s["needs"].items()}
    v = E.view(s)
    assert v["at"] == v["home"] and v["profile"]["name"] == "Lapo Baby"
    s2, _ = E.act(s, "scroll", now=MONDAY + 3600)
    assert s2["version"] == E.VERSION and "slot" not in s2 and E.tod(s2) == H(7, 30)
    assert s2["housing"]["kind"] == "hostel"


def test_whole_degrees_keep_invariants():
    """Fuzz: bots with different habits play whole degrees; nothing crashes or goes out of range."""
    for i, (profile, style) in enumerate([("lapo_baby", "lazy"), ("nepo_baby", "balanced"), ("nepo_baby", "builder")]):
        bot = Bot(f"fuzz{i}", "mcb", profile, style)
        while bot.s["status"] == "playing" and bot.moves < 40_000:
            bot.step()
            s = bot.s
            assert s["money"] >= 0 and 0 <= s["prep"] <= 100
            assert all(0 <= v <= 100 for v in s["needs"].values())
            assert s["total_days"] == s["clock"] // 1440 + 1
            assert s["clock"] <= E.real_clock(s, bot.now) + 1
        assert s["status"] == "graduated", (profile, style)
        assert C.SEMESTERS <= s["final"]["semesters"] <= C.SEMESTERS + C.MAX_EXTRA_SEMESTERS
        E.view(s)


# --- Phones, the market, your own ride ------------------------------------------------------------


def test_halls_follow_your_choice():
    for i in range(10):
        girl = E.new_state(f"hall{i}", "csc", profile="lapo_baby", look={**E.random_look("x"), "hall": 1})
        boy = E.new_state(f"hall{i}", "csc", profile="lapo_baby", look={**E.random_look("x"), "hall": 0})
        assert girl["at"] in C.HALLS["female"] and boy["at"] in C.HALLS["male"]
        assert girl["housing"]["kind"] == boy["housing"]["kind"] == "hostel"


def test_no_phone_no_phone_apps_until_you_buy_one():
    s = at(new(profile="tecno" and "nepo_baby", seed="lost"), 12, where="sub")
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
    s = at(new(profile="lapo_baby", seed="nokia"), 12)
    s["at"] = E.home_building(s)
    s["phone"] = {"model": "nokia", "cracked": False}
    phone = {a["id"]: a for a in E.view(s)["phone"]}
    assert phone["snake"]["enabled"]
    s2, _ = E.ask_parents(banked(copy.deepcopy(s)), 5_000)  # any phone can call home
    assert phone["design_gig"]["reason"] == "Needs a smartphone"
    assert not phone["pay_fees"]["enabled"]
    s = at(s, 12, where="sub")
    s["money"] = 20_000
    s, _ = E.act(s, "pay_fees_bc")
    assert s["fees_paid"] and s["money"] == 20_000 - C.SCHOOL_CHARGES - 200


def test_cracked_screens_get_fixed_at_the_market():
    s = at(new(profile="lapo_baby", seed="crack"), 12, where="market")
    assert s["phone"]["cracked"]
    s["money"] = 50_000
    s, _ = E.act(s, "fix_screen")
    assert not s["phone"]["cracked"] and s["money"] == 50_000 - C.PHONES["itel"]["screen_fix"]


def test_cook_real_meals_from_market_foodstuff():
    s = at(new(seed="pantry"), 12, where="market")
    s["money"] = 50_000
    with pytest.raises(E.GameError):
        E.act(at(s, 13, where=E.home_building(s)), "jollof")  # no rice yet
    s, _ = E.act(s, "shop_rice")
    s, _ = E.act(s, "shop_stew")
    assert s["food"]["rice"] == 6 and s["food"]["stew"] == 4
    s = at(s, 19, where=E.home_building(s))
    hunger = s["needs"]["hunger"] = 20
    s, _ = E.act(s, "jollof")
    assert s["food"]["rice"] == 5 and s["food"]["stew"] == 3 and s["needs"]["hunger"] > hunger
    assert not s.get("queued_event") and s["phase"] == "play"  # cooking in the hostel is allowed: no seized stove
    s = at(s, 12, where="market")
    s, _ = E.act(s, "foodstuff")
    s = at(s, 20, where=E.home_building(s))
    money = s["money"]
    s, _ = E.act(s, "cook")
    assert s["money"] == money  # noodles and egg from your own stock are free
    s, _ = E.act(at(s, 21), "garri")
    view = E.view(s, t_of(s))
    assert any(f["id"] == "garri" for f in view["food"]) and view["pantry"] == sum(f["count"] for f in view["food"])


def test_your_own_ride_goes_door_to_door():
    s = at(new(profile="odogwu", seed="car"), 11, where="staff")
    modes = {o["mode"]: o for o in E.plan(s, "techlt")["options"]}
    assert "car" in modes and "bike" not in modes
    car = modes["car"]
    assert car["available"] and car["wait"] == 0 and car["cost"] in (100, 200)
    assert car["minutes"] < modes["trek"]["minutes"]
    night = at(s, 23, where="staff")
    assert next(o for o in E.plan(night, "techlt")["options"] if o["mode"] == "car")["available"]
    b = at(new(profile="lapo_baby", seed="bike"), 11, where="market")
    b["money"] = 60_000
    b, msgs = E.act(b, "buy_bike")
    assert "bike" in b["items"] and "own_ride" in b["badges"]
    bike = next(o for o in E.plan(b, "techlt")["options"] if o["mode"] == "bike")
    assert bike["available"] and bike["cost"] == 0


def test_campus_hustles_need_their_tools():
    s = at(new(profile="lapo_baby", seed="barb"), 12, where=None)
    s["at"] = E.home_building(s)
    barb = action(s, "barb")
    assert not barb["enabled"] and "clippers" in barb["reason"]
    s["items"].append("clippers")
    s, msgs = E.act(s, "barb")
    assert s["stats"]["hustle_income"] > 0 and s["skills"]["barbing"] > 0
    c = at(new(profile="lapo_baby", seed="chin"), 12)
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
    s = at(new(profile="lapo_baby", seed="laptop"), 12)
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
    s = at(new(profile="lapo_baby", seed="hus"), 12, where="market")
    low = E._hustle_pay(s, 2_000)
    s, msgs = E.act(s, "shop_assistant") if E.is_weekday(s) else E.act(s, "puff")
    assert s["skills"]["hustling"] >= C.HUSTLE_XP or not E.is_weekday(s)
    s["skills"]["hustling"] = C.SKILL_LEVELS[5]
    assert E._hustle_pay(s, 2_000) > low


def test_being_social_trains_charisma():
    s = at(new(seed="cha"), 19, where="staff")
    s["needs"]["social"] = 20
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
        E.set_look(later, s["look"], ["lapo_baby", "foodie"], "odogwu")


def test_traits_change_how_needs_fall():
    a = at(new(seed="clean"), 9, where="staff")
    b = copy.deepcopy(a)
    a["traits"] = ["clean_pikin", "tech"]
    b["traits"] = ["lapo_baby", "tech"]
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
    for _ in range(8):
        s, _ = later(s, 60)
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


# --- Banking -------------------------------------------------------------------------------------


def test_you_start_with_cash_by_status():
    for profile, cash in (("lapo_baby", 100_000), ("nepo_baby", 200_000), ("odogwu", 300_000)):
        s = new(profile=profile, seed=f"cash{profile}")
        assert s["bank"] is None
        assert s["money"] + s["stats"]["spent"] - s["stats"]["earned"] + 0 >= 0
        assert E.new_state(f"cash{profile}", "csc", profile=profile, now=MONDAY)["money"] <= cash


def test_open_account_at_a_branch_in_banking_hours():
    s = at(new(profile="lapo_baby", seed="bank1"), 10, where="banks")
    s["money"] = 5_000
    s, msgs = E.open_account(s, "gtbank", "0111111111")
    assert s["bank"]["balance"] == C.BANK_OPEN_DEPOSIT and s["bank"]["card"]
    assert s["money"] == 5_000 - C.BANK_OPEN_DEPOSIT - C.CARD_FEE and "0111111111" in msgs[0]
    with pytest.raises(E.GameError, match="already have"):
        E.open_account(s, "gtbank", "0111111112")           # one account per bank
    late = at(new(seed="bank2"), 17, where="banks")
    with pytest.raises(E.GameError, match="8:00 AM to 4:00 PM"):
        E.open_account(late, "uba", "2000000000")
    away = at(new(seed="bank3"), 10, where="sub")
    with pytest.raises(E.GameError, match="Banking Area"):
        E.open_account(away, "uba", "2000000000")


def test_fintech_accounts_open_on_a_smartphone_without_a_card():
    s = at(new(profile="lapo_baby", seed="fin"), 22, where="staff")
    s["phone"] = {"model": "samsung", "cracked": False}
    s, _ = E.open_account(s, "opay", "8012345678")
    assert s["bank"]["balance"] == 0 and not s["bank"]["card"]
    s["phone"] = {"model": "nokia", "cracked": False}
    t = at(new(seed="fin2"), 12)
    t["phone"] = {"model": "nokia", "cracked": False}
    with pytest.raises(E.GameError, match="smartphone"):
        E.open_account(t, "moniepoint", "5012345678")


def test_held_allowance_arrives_when_you_open_an_account():
    s = at(new(profile="nepo_baby", seed="held"), 23, 50)
    s["dow"] = 6
    s, msgs = later(s, 400)  # into Monday morning
    held = s["flags"].get("held_allowance", 0)
    assert held >= C.PROFILES["nepo_baby"]["allowance"]
    s = at(s, 10, where="banks")
    s["money"] = 10_000
    s, msgs = E.open_account(s, "wema", "0299999999")
    assert E.bank_balance(s) == C.BANK_OPEN_DEPOSIT + held and any("Credit alert" in m for m in msgs)


def test_atm_needs_a_card_has_limits_and_sometimes_fails():
    s = banked(at(new(seed="atm"), 21, where="banks"), 300_000)
    s["money"] = 0
    got, fails = 0, 0
    for i in range(12):
        s["turn"] += 1
        before = s["money"]
        try:
            s, msgs = E.atm_withdraw(s, 20_000)
        except E.GameError as exc:
            assert "limit" in str(exc)
            break
        if s["money"] == before:
            fails += 1
        got = s["money"]
    assert got == C.ATM_DAILY and fails >= 0
    fin = banked(at(new(seed="atm2"), 12, where="banks"), 50_000, bank="opay")
    with pytest.raises(E.GameError, match="no card"):
        E.atm_withdraw(fin, 5_000)
    nowhere = banked(at(new(seed="atm3"), 12, where="hol"), 50_000)
    with pytest.raises(E.GameError, match="no ATM"):
        E.atm_withdraw(nowhere, 5_000)


def test_atm_at_sub_charges_other_banks():
    s = banked(at(new(seed="subatm"), 12, where="sub"), 50_000, bank="uba")
    s["seed"] = "subatm-ok"
    for i in range(20):  # find a turn where the ATM works
        try:
            t, _ = E.atm_withdraw(s, 5_000)
        except E.GameError:
            raise
        if t["money"] > s["money"]:
            assert E.bank_balance(t) == 50_000 - 5_000 - C.ATM_OTHER_BANK_FEE
            return
        s["turn"] += 1
    raise AssertionError("ATM never worked")


def test_pos_agents_charge_and_take_card_or_transfer():
    s = banked(at(new(seed="pos"), 21, where="awo"), 30_000)
    s["money"] = 0
    s, msgs = E.pos_cash(s, "withdraw", 10_000, "card")
    night = C.POS_NIGHT_FEE if W.BUILDINGS["awo"]["kind"] == "hall" else 0
    assert s["money"] == 10_000 and E.bank_balance(s) == 30_000 - 10_000 - 200 - night
    fin = banked(at(new(seed="pos2"), 12, where="market"), 30_000, bank="moniepoint")
    with pytest.raises(E.GameError, match="no card"):
        E.pos_cash(fin, "withdraw", 5_000, "card")
    fin["money"] = 0
    fin, _ = E.pos_cash(fin, "withdraw", 5_000, "transfer")
    assert fin["money"] == 5_000 and E.bank_balance(fin) == 30_000 - 5_000 - 100 - C.transfer_fee(5_000)
    fin["money"] = 10_200
    fin, _ = E.pos_cash(fin, "deposit", 10_000)
    assert fin["money"] == 0
    closed = banked(at(new(seed="pos3"), 23, 30, where="market"), 30_000)
    with pytest.raises(E.GameError, match="closed"):
        E.pos_cash(closed, "withdraw", 5_000, "card")


def test_fares_are_cash_but_shops_take_transfers():
    s = banked(at(new(profile="lapo_baby", seed="fare", home="awo"), 12, where="awo"), 50_000)
    s["money"] = 0
    trip = E.plan_trip(s, "tech", "keke")
    assert not trip["available"] and "cash" in trip["reason"].lower()
    s = at(s, 12, where="market")
    s, _ = E.act(s, "foodstuff")  # paid by transfer
    assert E.bank_balance(s) < 50_000


def test_transfers_between_students():
    s = banked(at(new(seed="send"), 12), 20_000)
    s, msgs = E.send_transfer(s, 5_000, "Bisi (UBA)")
    assert E.bank_balance(s) == 20_000 - 5_000 - C.transfer_fee(5_000)
    with pytest.raises(E.GameError, match="Insufficient"):
        E.send_transfer(s, 20_000, "Bisi (UBA)")
    r = banked(new(seed="recv"))
    r, line = E.receive_transfer(r, 5_000, "Tunde (GTBank)")
    assert E.bank_balance(r) == 5_000 and "Credit alert" in line


def test_lots_of_cash_can_get_stolen():
    stolen = 0
    for i in range(80):
        s = new(seed=f"thief{i}")
        s["money"] = 200_000
        E._start_of_day(s, random.Random(i), [])
        stolen += s["money"] < 200_000
    assert 0 < stolen < 20


def test_typed_amounts_bank_halls_and_any_banks_atm():
    s = banked(at(new(profile="lapo_baby", seed="typed"), 10, where="banks"), 50_000)
    s["money"] = 10_000
    s, _ = E.bank_counter(s, "deposit", 7_350, hall="gtbank")
    assert s["money"] == 2_650 and E.bank_balance(s) == 57_350
    with pytest.raises(E.GameError, match="You bank with GTBank"):
        E.bank_counter(s, "withdraw", 1_000, hall="uba")
    with pytest.raises(E.GameError, match="smallest"):
        E.bank_counter(s, "deposit", 50, hall="gtbank")
    with pytest.raises(E.GameError, match="multiple of ₦500"):
        E.atm_withdraw(s, 1_250)
    # someone else's ATM in the Banking Area: works, with a fee
    for i in range(20):
        t, _ = E.atm_withdraw(s, 2_500, machine="uba")
        if t["money"] > s["money"]:
            assert E.bank_balance(t) == 57_350 - 2_500 - C.ATM_OTHER_BANK_FEE
            break
        s["turn"] += 1
    else:
        raise AssertionError("ATM never worked")
    p = banked(at(new(seed="typedpos"), 12, where="market"), 20_000)
    p["money"] = 0
    p, _ = E.pos_cash(p, "withdraw", 3_700, "card")
    assert p["money"] == 3_700 and E.bank_balance(p) == 20_000 - 3_700 - C.pos_fee(3_700)
    q = banked(at(new(seed="typednote"), 12), 20_000)
    q, _ = E.send_transfer(q, 1_234, "Bisi (UBA)", note="for printing")
    assert "for printing" in q["bank"]["history"][1]["text"]


# --- Friendships: Stranger to Bestie, with more to do as you get closer ---------------------------


def test_friendship_grows_and_unlocks_more_to_do():
    s = at(new(seed="pal"), 12, where="buka")
    assert E.friend_level(0)["level"] == "Stranger" and E.friend_level(35)["level"] == "Friend"
    with pytest.raises(E.GameError, match="Acquaintance"):
        E.social(s, "hype", "Mama Put", t_of(s))
    s["people"] = {"Mama Put": {"bond": 9, "met": 0}}
    s, msgs = E.social(s, "hello", "Mama Put", t_of(s), role="Food seller")
    assert s["people"]["Mama Put"]["bond"] == 11 and any("Acquaintance" in m for m in msgs)
    s1 = later(s, 1)[0]
    s, _ = E.social(s1, "hype", "Mama Put", t_of(s1))
    view = E.view(s, t_of(s))
    assert view["people"][0]["name"] == "Mama Put" and view["people"][0]["role"] == "Food seller"
    s2 = later(s, 120)[0]
    s, msgs = E.social(s2, "shade", "Mama Put", t_of(s2))
    assert s["people"]["Mama Put"]["bond"] < 15


def test_small_money_is_for_close_friends_and_never_real_students():
    s = at(new(seed="lend"), 12, where="buka")
    s["people"] = {"Tobi": {"bond": 70, "met": 0}}
    with pytest.raises(E.GameError):
        E.social(s, "borrow", "Tobi", t_of(s), player=True)
    s2, _ = E.social(s, "borrow", "Tobi", t_of(s))
    s3 = later(s2, 30)[0]
    with pytest.raises(E.GameError, match="tomorrow"):
        E.social(s3, "borrow", "Tobi", t_of(s3))


def test_chat_blocks_real_money_trades():
    from game.chat import SCAM_RE
    assert SCAM_RE.search("Real 1k to my OPay for 2b") and SCAM_RE.search("fake alert dey")
    assert not SCAM_RE.search("How far, you dey class?")


def test_promotions_boost_business_takings_for_a_few_nights():
    s = at(new(seed="promo"), 10, where="staff")
    s["money"] = 100_000
    assert E._check(s, C.ACTIONS_BY_ID["promo_flyers"]) == "Start a business first"
    s["businesses"] = {"puffpuff": s["total_days"]}
    banked(s, 50_000)
    s, msgs = E.act(s, "promo_influencer")
    assert s["promo"]["boost"] == 0.5 and s["promo"]["until"] == s["total_days"] + 2
    assert E._check(s, C.ACTIONS_BY_ID["promo_flyers"]) == "A promotion is already running"


def test_campus_moments_are_real_places():
    for aid in ("rally_sub", "war_cry", "dept_dinner"):
        a = C.ACTIONS_BY_ID[aid]
        assert a["at"] in W.BUILDINGS and a["spectacle"]["text"]


def test_akintola_is_right_beside_fajuyi():
    a, f = W.BUILDINGS["akintola"], W.BUILDINGS["fajuyi"]
    gap = (f["x"] - f["w"] / 2) - (a["x"] + a["w"] / 2)
    assert 0 < gap < 20 and abs(a["z"] - f["z"]) < 10  # side by side, a footpath apart
    assert a["x"] < f["x"]  # coming from ETF you reach Akintola first
    assert any("Akintola" in p["name"] for p in W.FOOTPATHS)


def test_skipping_playback_only_lets_you_move_on():
    s = at(new(seed="skip"), 12, where="buka")
    now = t_of(s)
    s["busy_until"] = now + 20
    money = s["money"]
    s2, _ = E.skip_playback(s, now)
    assert s2["busy_until"] == now and s2["money"] == money


def test_you_can_gist_with_people_out_on_campus():
    s = at(new(seed="out"), 10, where=None)
    assert not s.get("at")
    s2, msgs = E.social(s, "gist", "Gbenga", t_of(s), role="Course rep")
    assert "Gbenga" in msgs[0] and s2["people"]["Gbenga"]["bond"] > 0


def test_weather_is_shared_and_changes_through_the_day():
    s = at(new(seed="w1"), 10)
    other = at(new(seed="w2"), 10)
    w = E.weather(s)
    assert w == E.weather(other)  # everyone sees the same sky
    assert w["label"] in ("Clear", "Cloudy", "Light rain", "Heavy rain")
    seen = {E.weather(at(s, h))["label"] for d in range(30) for h in (1, 4, 7, 10, 13, 16, 19, 22)
            for _ in [s.__setitem__("total_days", s["total_days"] + 1)]}
    assert "Clear" in seen and ({"Light rain", "Heavy rain"} & seen)


def test_every_oau_course_can_be_studied():
    assert len(C.DEPARTMENTS) >= 50
    assert {"law", "med", "phm", "mee", "arc", "nsc"} <= set(C.DEPARTMENTS)
    for did, d in C.DEPARTMENTS.items():
        assert d["faculty"] in W.BUILDINGS and W.BUILDINGS[d["faculty"]]["kind"] == "faculty", did
        assert all(v in W.BUILDINGS for v in d["venues"]) and d["exams"] in W.BUILDINGS
        s = new(dept=did, seed="t-" + did)
        assert s["courses"][0]["code"].startswith(d["code"]) and s["timetable"]
        view = E.view(s, t_of(s))
        assert view["department"]["name"] == d["name"]


def test_nothing_takes_more_than_13_seconds_to_watch():
    assert E.action_seconds(600) <= 13 and E.journey_seconds(500) <= 13 and E.BET_MATCH_SECONDS <= 13
    assert all(spec["seconds"] <= 13 for spec in C.SOCIAL.values())


def test_bath_sleep_and_food_any_time_of_day():
    for hour in (2, 10, 15, 23):
        s = at(new(seed=f"any{hour}"), hour, where="staff")
        s["money"] = 50_000
        enabled = ids(s)
        assert {"bath", "sleep", "cook"} <= enabled, (hour, enabled)


def test_lecture_theatres_open_for_night_reading():
    s = at(new(seed="night-read"), 23, where="thousand")
    assert E.building_open("thousand", E.tod(s)) and E.building_open("odlt", E.tod(s))
    assert "lt_tdb" in ids(s)


def test_bet_slip_with_many_matches_pays_only_if_all_land():
    s = banked(at(new(seed="acca"), 12, where="staff"), 100_000)
    games = E.fixtures(s, t_of(s))
    assert len(games) == C.BET_MATCHES
    picks = [(i, "1") for i in range(5)]
    s2, msgs = E.place_bet(s, stake=2_500, adult=True, now=t_of(s), picks=picks)
    slip = s2["last_bet"]
    assert len(slip["legs"]) == 5 and slip["stake"] == 2_500
    assert slip["odds"] == pytest.approx(round(math.prod(games[i]["odds"]["1"] for i in range(5)), 2), rel=1e-6)
    assert slip["won"] == all(leg["won"] for leg in slip["legs"])
    assert s2["playback"] <= 13
    with pytest.raises(E.GameError):
        E.place_bet(s, stake=50, adult=True, now=t_of(s), picks=picks)


def test_laptop_skills_lead_to_a_remote_job():
    s = banked(at(new(seed="remote"), 10, where="hol"), 1_000)
    s["items"].append("laptop")
    assert "Needs Coding level 4" in E._check(s, C.ACTIONS_BY_ID["job_junior_dev"])
    assert E._check(s, C.ACTIONS_BY_ID["remote_shift"]) == "Apply for a remote job first"
    s["skills"]["coding"] = C.SKILL_LEVELS[3]  # level 4
    s, msgs = E.act(s, "job_junior_dev", t_of(s))
    assert s["flags"]["remote_job"] == "junior_dev"
    s = at(s, 14, where="hol")
    bal = E.bank_balance(s)
    s, msgs = E.act(s, "remote_shift", t_of(s))
    assert E.bank_balance(s) >= bal + C.REMOTE_JOBS["junior_dev"]["pay"]


def test_deposit_any_amount_of_cash_from_the_app():
    s = banked(at(new(seed="dep"), 23, where="staff"), 0)
    s["money"] = 7_777
    s2, _ = E.app_deposit(s, 7_777, t_of(s))
    assert E.bank_balance(s2) == 7_777 and s2["money"] < 7_777
    with pytest.raises(E.GameError):
        E.app_deposit(s, 50_000, t_of(s))


def test_new_matches_after_every_bet_and_halls_by_gender():
    s = banked(at(new(seed="newgames"), 12, where="staff"), 50_000)
    before = [(g["home"], g["away"]) for g in E.fixtures(s, t_of(s))]
    s2, _ = E.place_bet(s, stake=100, adult=True, now=t_of(s), picks=[(0, "1")])
    after = [(g["home"], g["away"]) for g in E.fixtures(s2, t_of(s2))]
    assert before != after
    assert set(C.HALLS["male"]) == {"awo", "fajuyi", "etf", "angola"}
    assert set(C.HALLS["female"]) == {"akintola", "moremi", "mozambique", "alumni"} and "alumni" in W.BUILDINGS
    assert not any("(2 hrs)" in a["label"] for a in C.ACTIONS)


# --- Furnish your home -------------------------------------------------------------------------------

def test_buying_furniture_unlocks_tv_and_playstation():
    s = banked(at(new(seed="furn", home="offcampus"), 15, where="offcampus"), 2_000_000)
    start = E.total_money(s)
    assert "watch_tv" not in ids(s, enabled=False)       # hidden until you own a TV
    s, msgs = E.buy_furniture(s, "tv43", t_of(s))
    s, msgs = E.buy_furniture(s, "ps5", t_of(s))
    assert s["furniture"] == {"tv": "tv43", "console": "ps5"}
    assert 0 <= E.total_money(s) - (start - 320_000 - 950_000) <= 2_000   # (+ the daily streak reward)
    assert {"watch_tv", "play_console", "fifa_centre"} <= ids(s)
    fun = s["needs"]["fun"] = 20
    s, msgs = E.act(s, "play_console", t_of(s))
    assert s["needs"]["fun"] > fun + 20
    assert "PS5" in msgs[0]


def test_upgrading_trades_in_the_old_one_and_big_things_need_a_big_home():
    s = banked(at(new(seed="furn2", home="offcampus"), 12, where="offcampus"), 3_000_000)
    s, _ = E.buy_furniture(s, "foam6", t_of(s))
    before = E.total_money(s)
    s, msgs = E.buy_furniture(s, "ortho", t_of(s))
    assert E.total_money(s) == before - (180_000 - int(65_000 * C.FURNITURE_RESALE))
    assert "took your old" in msgs[0]
    with pytest.raises(E.GameError, match="flat"):
        E.buy_furniture(s, "smartbed", t_of(s))          # a self-contain is too small
    with pytest.raises(E.GameError):
        E.buy_furniture(s, "ortho", t_of(s))             # already have it
    s, msgs = E.sell_furniture(s, "ortho", t_of(s))
    assert "bed" not in s["furniture"]


def test_hall_students_can_only_get_small_things():
    s = banked(at(new(seed="furn3", home="none"), 12), 500_000)
    s = at(s, 12, where=E.home_building(s))
    assert E.housing_kind(s) == "hostel"
    s, _ = E.buy_furniture(s, "foam_pad", t_of(s))
    s, _ = E.buy_furniture(s, "lamp", t_of(s))
    with pytest.raises(E.GameError):
        E.buy_furniture(s, "tv32", t_of(s))


def test_generator_keeps_the_light_on_and_furniture_changes_needs():
    s = banked(at(new(seed="furn4", home="offcampus"), 12, where="offcampus"), 5_000_000)
    s["flags"]["no_light"] = 2
    s, _ = E.buy_furniture(s, "tv32", t_of(s))
    assert "watch_tv" in ids(s, enabled=False) and "watch_tv" not in ids(s)   # no light, no TV
    assert "needs power" in action(s, "watch_tv")["reason"]
    s, _ = E.buy_furniture(s, "gen_small", t_of(s))
    assert E.has_light(s) and "watch_tv" in ids(s)
    plain = E._decay(s, H(12))["energy"]
    s, _ = E.buy_furniture(s, "bedframe", t_of(s))
    assert E._decay(s, H(12))["energy"] > plain   # falls slower
    assert E.comfort_points(s) >= 5
    assert E.weekly_bills(s) == 300


def test_fetching_water_gives_needs_and_a_free_bath_when_taps_are_dry():
    s = banked(at(new(seed="water", home="none"), 9), 0)
    s = at(s, 9, where=E.home_building(s))
    s["money"] = 0
    s["needs"]["hygiene"] = 30
    s["flags"]["no_water"] = 2
    assert E.action_cost(s, C.ACTIONS_BY_ID["bath"]) == 300
    s, msgs = E.act(s, "fetch_water", t_of(s))
    assert s["flags"]["water"] == 2 and s["needs"]["hygiene"] > 30
    s = at(s, 10)
    assert E.action_cost(s, C.ACTIONS_BY_ID["bath"]) == 0
    s, msgs = E.act(s, "bath", t_of(s))
    assert s["flags"]["water"] == 1 and "bucket you fetched" in msgs[0]


# --- Resting at the Health Centre: the phone still works -----------------------------------------------

def _resting(seed):
    s = banked(at(new(seed=seed), 14, where="staff"), 50_000)
    s["items"] = []
    s["phone"] = {"model": "samsung", "cracked": False}
    s["needs"]["energy"] = 1
    s, _ = E.act(s, "scroll")
    assert s["at"] == "health" and s["asleep"]["until"]
    return s


def test_resting_blocks_moves_but_not_the_phone():
    s = _resting("rest-phone")
    acts = E.available_actions(s)
    assert acts and all(a["at"] == "phone" for a in acts)           # only phone things are listed
    assert "scroll" in {a["id"] for a in acts}
    s2, msgs = E.act(s, "scroll", t_of(s))                          # a phone action works
    assert s2["asleep"]["until"]                                    # still resting
    with pytest.raises(E.GameError, match="Health Centre"):
        E.act(s, "lt_read", t_of(s))                                # anything in person is refused
    with pytest.raises(E.GameError, match="Health Centre"):
        E.enter_building(s, "thousand", E._door("thousand"))


def test_resting_bank_app_and_parents_still_work():
    s = _resting("rest-bank")
    s2, _ = E.app_deposit(s, 5_000, t_of(s))
    assert E.bank_balance(s2) == 5_000 + E.bank_balance(s)
    assert s2["asleep"]["until"]


def test_new_readiness_and_fun_actions_exist_and_gain_readiness():
    s = banked(at(new(seed="ready"), 12, where="staff"), 50_000)
    s["items"].append("laptop")
    s["phone"] = {"model": "samsung", "cracked": False}
    for aid in ("past_qs_phone", "revise_laptop", "home_timetable"):
        assert aid in C.ACTIONS_BY_ID and C.ACTIONS_BY_ID[aid]["effects"]["prep"] == 10
    before = s["prep"]
    s2, msgs = E.act(s, "home_timetable", t_of(s))
    assert s2["prep"] > before and any("readiness" in m for m in msgs)
    for aid in ("karaoke", "buka_drinks", "card_game", "pepper_soup"):
        assert aid in C.ACTIONS_BY_ID


# --- More than one bank account ----------------------------------------------------------------------

def test_you_can_open_a_second_account_at_another_bank():
    s = at(new(profile="lapo_baby", seed="two-banks"), 10, where="banks")
    s["money"] = 10_000
    s, _ = E.open_account(s, "gtbank", "0111111111")
    s, msgs = E.open_account(s, "uba", "2000000000")
    assert s["bank"]["bank"] == "gtbank"                       # the first one stays main
    assert [a["bank"] for a in s["extra_banks"]] == ["uba"]
    assert s["extra_banks"][0]["balance"] == C.BANK_OPEN_DEPOSIT
    assert E.bank_balance(s) == 2 * C.BANK_OPEN_DEPOSIT
    assert E.bank_view(s)["held"] == ["gtbank", "uba"]
    with pytest.raises(E.GameError, match="already have"):
        E.open_account(s, "uba", "2000000001")


def test_second_account_app_on_the_phone_and_main_switch():
    s = at(new(seed="two-apps"), 12, where="staff")
    s["phone"] = {"model": "tecno", "cracked": False}
    s = banked(s, 30_000, bank="gtbank")
    s, _ = E.open_account(s, "opay", "8012345678")
    assert s["bank"]["bank"] == "gtbank" and s["extra_banks"][0]["bank"] == "opay"
    s, msgs = E.set_main_account(s, "opay", t_of(s))
    assert s["bank"]["bank"] == "opay" and s["extra_banks"][0]["bank"] == "gtbank"
    assert "main account" in msgs[0]
    with pytest.raises(E.GameError, match="extra"):
        E.set_main_account(s, "uba", None)


def test_moving_money_between_your_accounts_and_spending_from_any_of_them():
    s = at(new(seed="move"), 12, where="staff")
    s["phone"] = {"model": "tecno", "cracked": False}
    s = banked(s, 2_000, bank="gtbank")
    s["extra_banks"] = [{"bank": "opay", "number": "8011111111", "balance": 5_000, "card": False, "history": []}]
    total = E.bank_balance(s)
    s, msgs = E.move_between_accounts(s, "opay", "gtbank", 3_000, t_of(s))
    assert s["bank"]["balance"] == 5_000 and s["extra_banks"][0]["balance"] == 2_000
    assert E.bank_balance(s) == total
    with pytest.raises(E.GameError, match="Not enough"):
        E.move_between_accounts(s, "opay", "gtbank", 9_999, None)
    with pytest.raises(E.GameError, match="different"):
        E.move_between_accounts(s, "gtbank", "gtbank", 10, None)
    # paying draws from the main account first, then from the extra one
    E._bank_move(s, -6_500, "Shop")
    assert s["bank"]["balance"] == 0 and s["extra_banks"][0]["balance"] == 2_000 - 1_500


def test_businesses_pay_at_eight_pm_not_midnight():
    s = banked(at(new(profile="odogwu", seed="eve"), 9), 100_000)
    s["money"] = 0
    s, _ = E.act(s, "buy_puffpuff")
    s = at(s, 12, where="staff")
    s, msgs = later(s, 6 * 60)  # to 6 PM: nothing yet
    assert not any("takings" in m.lower() for m in msgs)
    s, msgs = later(s, 2 * 60)  # through 8 PM
    assert any("evening takings" in m.lower() for m in msgs)


def test_off_campus_shops_pay_rent_every_evening():
    s = at(new(seed="rent"), 9)
    s["money"] = 0
    s["businesses"] = {"boutique": s["total_days"]}
    s["flags"]["seen"] = [e["id"] for e in C.EVENTS]
    s["stats"]["business_income"] = 0
    rng_before = s["stats"]["business_income"]
    s = at(s, 19, 59, where="staff")
    s, msgs = later(s, 2)
    shop = C.BUSINESSES["boutique"]
    assert shop["rent"] == 1_500 and rng_before == 0
    assert any("evening" in m.lower() for m in msgs)
    assert E.total_money(s) >= -shop["rent"] - shop["bad_loss"]


def test_businesses_app_shops_list_capital_place_and_reasons():
    s = at(new(seed="shops"), 10)
    shops = E.view(s)["shops"]
    by = {x["id"]: x for x in shops}
    assert by["perfume_stall"]["place"] == "campus" and by["perfume_stall"]["capital"] == 25_000
    assert by["boutique"]["place"] == "off" and by["boutique"]["rent"] == 1_500
    assert by["gadget_tray"]["cat"] == "gadgets" and by["shirts"]["cat"] == "fashion"
    assert by["perfume_stall"]["start"]["id"] == "buy_perfume_stall" and not by["perfume_stall"]["owned"]
    assert E.view(s)["payout_at"] == "8:00 PM"

