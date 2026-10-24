"""A bot that plays like a person on the real Lagos clock: it keeps the timetable, walks or rides between
buildings, sleeps at night and looks after its needs. Each action plays out in a few seconds, so the bot
waits real minutes in between, like a person who checks in now and then.
Styles: scholar, balanced, builder, lazy, neglect."""
import copy
import random
from collections import Counter

from game import content as C
from game import engine as E

A = C.ACTIONS_BY_ID


class Bot:
    def __init__(self, seed="bot", dept="csc", profile=None, style="balanced", state=None, now=1_792_387_800.0):
        self.now = now
        self.s = state if state is not None else E.new_state(seed, dept, "bot", profile=profile, now=self.now)
        self.style = style
        self.rng = random.Random(seed)
        self.moves = 0
        self.modes = Counter()

    def where(self, action_id):
        d = E.dept(self.s)
        if action_id in ("write_ca", "write_exam"):
            return d["exams"]
        at = A[action_id]["at"]
        if at == "lecture":
            lec = E.next_lecture(self.s)
            return lec["venue"] if lec else d["faculty"]
        if at == "dept":
            return d["faculty"]
        if at == "laptop":
            return self.s["at"] or E.home_building(self.s)
        return E.home_building(self.s) if at == "home" else (None if at == "phone" else at)

    def could(self, action_id):
        """Would this be allowed if we were standing there right now?"""
        s = copy.deepcopy(self.s)
        where = self.where(action_id)
        if where:
            s["at"] = where
        if action_id in ("write_ca", "write_exam"):
            t = E._test_action(s)
            return bool(t and t["id"] == action_id and (t["enabled"] or t["reason"].startswith("Doors open")))
        return E._check(s, A[action_id]) is None

    def first(self, ids):
        return next((i for i in ids if self.could(i)), None)

    def go(self, building):
        if self.s["at"] == building:
            return True
        if self.s["phase"] != "play":
            return False
        options = {o["mode"]: o for o in E.plan(self.s, building, now=self.now)["options"]}
        ok = [o for o in options.values() if o["available"]]
        if not ok:
            return False
        money = self.s["money"]
        trek = options["trek"]
        best = min(ok, key=lambda o: o["minutes"])
        pick = trek if trek["available"] else best
        cheap = [o for o in ok if o["cost"] <= 450]
        if cheap:
            pick = min(cheap, key=lambda o: o["minutes"])
        own = [options[m] for m in ("car", "bike") if m in options and options[m]["available"]]
        if own:
            pick = own[0]
        elif money > 15_000 and options["keke"]["available"] and options["keke"]["minutes"] + 8 < pick["minutes"]:
            pick = options["keke"]
        if E.tod(self.s) >= C.H(21) and options["cab"]["available"] and money > 3000 and trek["minutes"] > 15:
            pick = options["cab"]
        try:
            self.s, _ = E.travel(self.s, building, pick["mode"], now=self.now)
        except E.GameError:
            self.idle(1)
            return False
        self.now += self.s["playback"] + 2
        self.modes[pick["mode"]] += 1
        self.moves += 1
        return True

    def do(self, action_id):
        where = self.where(action_id)
        if where and not self.go(where):
            return False
        if where and self.s["at"] != where:
            return False  # closed on arrival
        if self.s["phase"] != "play":
            return True
        v = E.view(self.s)
        ids = {a["id"]: a for a in v["actions"] + v["phone"]}
        if action_id in ids and ids[action_id]["enabled"]:
            try:
                self.s, _ = E.act(self.s, action_id, now=self.now)
            except E.GameError:
                self.idle(1)  # the clock moved on while we were deciding
                return False
            self.now += self.s["playback"] + 2
            self.moves += 1
            return True
        return False

    def idle(self, minutes=20):
        self.now += minutes * 60
        self.s, _ = E.sync(self.s, self.now)
        self.moves += 1

    # How long each kind of player is willing to read in a day (real players aren't online all day).
    BUDGET = {"scholar": 300, "balanced": 150, "builder": 100, "lazy": 50, "neglect": 0}

    def brain_full(self):
        f = self.s["flags"]
        done = f.get("study_minutes", 0) if f.get("study_day") == self.s["total_days"] else 0
        return done >= self.BUDGET[self.style]

    def step(self):
        s = self.s
        if s["phase"] == "event":
            choices = s["pending"]["choices"]
            idx = 0 if s["pending"]["id"] != "fees_deadline" or self.style == "neglect" else (
                0 if s["pending"]["short"] == 0 else 1 if self.style in ("lazy",) else 0)
            idx = next(i for i, c in enumerate(choices) if c["enabled"]) if not choices[idx]["enabled"] else idx
            self.s, _ = E.choose(s, idx, now=self.now)
            return
        if s["phase"] == "results":
            self.s, _ = E.continue_after_results(s, now=self.now)
            return
        if s.get("asleep"):
            self.idle(30)
            return
        t = E.tod(s)
        n = s["needs"]
        style = self.style
        # Tests and exams come first
        test = E._test_action(s) if E.test_today(s) else None
        if test and t <= C.TEST_DOORS_CLOSE and style != "neglect":
            if t < C.H(7):
                if n["hunger"] < 50 and self.first(["cook", "garri"]) and self.do(self.first(["cook", "garri"])):
                    return
                self.idle(10)
                return
            if self.s["at"] != test["at"]:
                self.go(test["at"])
                return
            if t < E.TEST_OPENS:
                self.idle(min(20, E.TEST_OPENS - t))
                return
            self.do(test["id"])
            return
        # Bedtime
        bedtime = C.H(23) if style != "neglect" else C.H(25, 30)
        exam_soon = any(("tomorrow" in u) and ("Exams" in u or "CA" in u) for u in E.upcoming(s))
        if style == "scholar" and exam_soon and t >= C.H(21) and n["energy"] > 50 and self.could("hol_tdb") \
                and not s["flags"].get("tdb_today") == s["total_days"]:
            s["flags"]["tdb_today"] = s["total_days"]
            if self.do("hol_tdb"):
                return
        if t >= bedtime or t < C.H(4) or (t >= C.H(20) and n["energy"] < 30):
            if n["hunger"] < 35 and self.could("cook") and self.do("cook"):
                return
            if n["hygiene"] < 40 and self.do("bath"):
                return
            if self.do("sleep"):
                # sleep is a quick action now; then the player puts the phone down till morning
                self.idle(((C.WAKE_UP - E.tod(self.s)) % 1440) or 30)
                return
            self.idle(30)
            return
        if t < C.H(5):
            self.idle(30)
            return
        # Needs
        if n["hunger"] < 38:
            f = self.first(["rice", "amala", "cook", "snacks"] if s["at"] != "buka" else ["rice", "amala"])
            if f and self.do(f):
                return
        if n["energy"] < 22:
            if self.do("nap"):
                return
        if n["hygiene"] < 30 and self.do("bath"):
            return
        if not s["fees_paid"] and s["money"] >= C.SCHOOL_CHARGES and self.do("pay_fees"):
            return
        # Lectures
        lec = E.next_lecture(s)
        if lec and style != "neglect" and not (style == "lazy" and self.rng.random() < 0.4):
            trip = 45
            if lec["start"] - t <= trip + 15:
                if self.do("lecture"):
                    return
        if style == "neglect":
            if n["fun"] < 80 and self.do(self.first(["scroll", "gist", "hangout"]) or "scroll"):
                return
            self.idle(30)
            return
        money_low = s["money"] < 2500 or (not s["fees_paid"] and s["money"] < C.SCHOOL_CHARGES)
        before_next = (lec["start"] - t) if lec else 999
        if money_low and before_next > 200:
            h = self.first(["teach_tutorial", "braids", "design_gig", "business_centre", "sell_data", "fl_article"])
            if h and self.do(h):
                return
            if not s["flags"].get("parents_week") == E.week_key(s) and s.get("phone") and C.H(7) <= t < C.H(22):
                try:
                    self.s, _ = E.ask_parents(s, 20_000, now=self.now)
                    self.now += self.s["playback"] + 2
                    return
                except E.GameError:
                    pass
        if (n["fun"] < 28 or n["social"] < 22):
            f = self.first(["show", "football", "hangout", "gist", "scroll"])
            if f and self.do(f):
                return
        if style == "builder" and before_next > 200:
            for biz, price in (("buy_kiosk", 30_000), ("buy_printer", 60_000), ("buy_food", 150_000)):
                if s["money"] > price + 8_000 and self.could(biz) and self.do(biz):
                    return
            g = self.first(["website_gig", "logo_gig", "bug_fix", "learn_coding", "learn_design"])
            if g and n["energy"] > 40 and self.do(g):
                return
        if style == "lazy" and self.rng.random() < 0.55 and min(n["fun"], n["social"]) < 70:
            if self.do(self.first(["scroll", "gist", "hangout", "nap"]) or "scroll"):
                return
        if style == "balanced" and self.rng.random() < 0.2 and min(n["fun"], n["social"]) < 60:
            f = self.first(["hangout", "football", "gist", "scroll"])
            if f and self.do(f):
                return
        if before_next > 140 or lec is None:
            if n["energy"] > 30 and not self.brain_full():
                st = self.first(["hol_read", "study_group", "tutorial", "read_room"])
                if st and self.do(st):
                    return
        self.idle(15)

    def play(self, limit=40_000):
        while self.s["status"] == "playing" and self.moves < limit:
            self.step()
        return self.s
