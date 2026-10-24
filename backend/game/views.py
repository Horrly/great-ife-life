import re
import time
import uuid

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

import secrets

from . import chat as CH
from . import content as C
from . import engine as E
from . import rooms as R
from . import world as W
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import AccountSession, DeviceToken, Game, PlaceEvent, RiddleFind, Room, Transfer, Vote, hash_token

User = get_user_model()
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.]{3,20}$")

NAME_RE = re.compile(r"^[A-Za-z0-9 ._'-]{2,20}$")
# Keep the public leaderboard clean. Extend as needed; admins can also hide a game in Django admin.
BLOCKED_WORDS = {"fuck", "shit", "bitch", "pussy", "dick", "nigga", "nigger", "ashawo", "olosho", "mumu", "werey"}


def clean_name(raw: str) -> str:
    name = " ".join(str(raw or "").split())
    if not name:
        return ""
    if not NAME_RE.match(name):
        raise ValidationError({"name": "Use 2-20 letters, numbers or spaces."})
    if any(word in name.lower().replace(" ", "") for word in BLOCKED_WORDS):
        raise ValidationError({"name": "Pick another name."})
    return name


def now() -> float:
    """Real time in seconds. The game clock is real Lagos time.

    For local testing only (DEBUG on): GAME_TIME_OFFSET shifts the clock by that many seconds.
    """
    from django.conf import settings
    import os

    if settings.DEBUG and os.environ.get("GAME_TIME_OFFSET"):
        return time.time() + float(os.environ["GAME_TIME_OFFSET"])
    return time.time()


OLD_PROFILE_NAMES = {"staff_pikin": "Staff Pikin", "scholarship": "Scholarship Kid", "hustler": "Hustler Fresher",
                     "off_campus": "Off-Campus Student"}


def status_name(pid: str) -> str:
    return C.PROFILES[pid]["name"] if pid in C.PROFILES else OLD_PROFILE_NAMES.get(pid, "Student")


def collect_credits(game: Game) -> list[str]:
    """Transfers other students sent: credit them now. The game row is already locked by the caller."""
    lines = []
    if game.status != "playing":
        return lines
    for t in Transfer.objects.select_for_update().filter(receiver=game, applied=False).order_by("pk"):
        game.state, line = E.receive_transfer(game.state, t.amount, t.sender_label)
        t.applied = True
        t.save(update_fields=["applied"])
        lines.append(line)
    return lines


def commit(game: Game, state: dict):
    """Save a new state, keeping the player's database room in step with where they live."""
    game.state = state
    game._credit_lines = collect_credits(game)
    R.ensure_room(game)
    if game.profile != game.state["profile"]:
        game.profile = game.state["profile"]
    game.save_state(game.state)


def payload(game: Game, messages=None, at: float | None = None) -> dict:
    t = at if at is not None else now()
    data = E.view(game.state, t)
    data["room"] = R.roommates(game, t) if game.status == "playing" else None
    data["share_code"] = game.share_code if game.status == "graduated" else None
    data["matric"] = game.matric
    data["chat_unread"] = CH.unread_total(game) if game.status == "playing" else 0
    data["online"], data["here_count"], data["here_people"] = presence(game)
    data["events"] = place_events(game, t)
    credits = getattr(game, "_credit_lines", None)
    if credits:
        messages = list(messages or []) + credits
        game._credit_lines = []
    if messages is not None:
        data["messages"] = messages
    return data


ONLINE_WINDOW = 15 * 60
EVENT_WINDOW = 120   # a big moment shows for two minutes to everyone who is there


def place_events(game: Game, t: float) -> list[dict]:
    at = game.state.get("at")
    if not at or game.status != "playing":
        return []
    return [{"id": e.pk, "text": e.text, "emoji": e.emoji, "you": e.game_id == game.pk}
            for e in PlaceEvent.objects.filter(place=at, t__gte=t - EVENT_WINDOW).order_by("-pk")[:3]]


def lagos_day(t: float):
    from datetime import datetime, timedelta, timezone

    return datetime.fromtimestamp(t, tz=timezone(timedelta(hours=1)))


def sug_week(t: float) -> str:
    y, w, _ = lagos_day(t).isocalendar()
    return f"{y}-W{w:02d}"


def presence(game: Game) -> tuple[int, int]:
    """Students active in the last 15 minutes, and how many of them are in the same place as you."""
    from datetime import timedelta

    from django.utils import timezone

    cut = timezone.now() - timedelta(seconds=ONLINE_WINDOW)
    active = Game.objects.filter(status="playing", updated_at__gte=cut)
    at = game.state.get("at")
    if not at:
        return active.count(), 0, []
    here_qs = active.filter(state__at=at)
    people = [{"id": g.pk, "name": g.display_name or "A student", "look": g.state.get("look", {}),
               "department": C.DEPARTMENTS.get(g.department, {}).get("code", "")}
              for g in here_qs.exclude(pk=game.pk).order_by("-updated_at")[:8]]
    return active.count(), here_qs.count(), people


def game_for(request, *, lock=False) -> Game:
    token = request.headers.get("X-Game-Token", "")
    if not token:
        raise NotFound("No game found. Start a new one.")
    hashed = hash_token(token)
    qs = Game.objects.select_for_update() if lock else Game.objects
    game = qs.filter(token_hash=hashed).first()
    if not game:  # a device that signed in to an account gets its own code for the same game
        device = DeviceToken.objects.filter(token_hash=hashed).values_list("game_id", flat=True).first()
        game = qs.filter(pk=device).first() if device else None
    if not game:
        raise NotFound("No game found for this save code.")
    return game


def account_for(request, required=True):
    token = request.headers.get("X-Account-Token", "")
    session = AccountSession.objects.select_related("user").filter(token_hash=hash_token(token)).first() if token else None
    if not session or not session.user.is_active:
        if required:
            raise NotFound("Please sign in again.")
        return None
    return session.user


class ConfigView(APIView):
    def get(self, request):
        return Response({
            "departments": [{"id": k, "name": v["name"], "code": v["code"]} for k, v in C.DEPARTMENTS.items()],
            "profiles": [{"id": k, "name": v["name"], "tagline": v["tagline"], "weight": v["weight"]}
                         for k, v in C.PROFILES.items()],
            "housing": C.HOUSING,
            "look_options": C.LOOK_OPTIONS,
            "traits": C.TRAITS,
            "dreams": C.DREAMS,
        })


class WorldView(APIView):
    """The campus map: buildings, roads and the bus route, for the 3D client to draw."""

    def get(self, request):
        data = W.public_map()
        data["banks"] = C.BANKS
        data["pos"] = [k for k, b in W.BUILDINGS.items() if b["kind"] in C.POS_KINDS or k in C.POS_PLACES]
        data["timing"] = {"rate": E.RATE, "journey_speedup": E.JOURNEY_SPEEDUP,
                          "journey_max_seconds": E.JOURNEY_MAX_SECONDS, "door_radius": E.DOOR_RADIUS,
                          "walk_units_per_second": E.WALK_UNITS_PER_SECOND}
        response = Response(data)
        response["Cache-Control"] = "public, max-age=300"
        return response


class NewGameView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "new-game"

    def post(self, request):
        name = clean_name(request.data.get("name", ""))
        try:
            look = request.data.get("look")
            state = E.new_state(uuid.uuid4().hex, request.data.get("department", ""), name, now=now(),
                                look=E.clean_look(look) if look else None)
        except E.GameError as exc:
            raise ValidationError({"department": str(exc)})
        with transaction.atomic():
            game, token = Game.create(state, name)
            user = account_for(request, required=False)
            if user:
                game.user = user
            commit(game, game.state)
        return Response({"token": token, "game": payload(game)}, status=status.HTTP_201_CREATED)


class GameView(APIView):
    def get(self, request):
        """Opening the game catches the clock up with real Lagos time."""
        with transaction.atomic():
            game = game_for(request, lock=True)
            t = now()
            state, messages = E.sync(game.state, t)
            commit(game, state)
        return Response(payload(game, messages, t))


class PerGameThrottle(SimpleRateThrottle):
    """Limit moves per game, not per IP: thousands of students can share one IP on campus Wi-Fi."""

    scope = "act"

    def get_cache_key(self, request, view):
        token = request.headers.get("X-Game-Token", "")
        ident = hash_token(token) if token else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class SyncThrottle(PerGameThrottle):
    scope = "sync"


class SyncView(APIView):
    """Heartbeat while you walk around: the clock catches up and the server notes where you are."""

    throttle_classes = [SyncThrottle]

    def post(self, request):
        with transaction.atomic():
            game = game_for(request, lock=True)
            t = now()
            try:
                state, messages = E.sync(game.state, t, request.data.get("pos"))
            except E.GameError as exc:
                return Response({"detail": str(exc), "game": payload(game, at=t)}, status=status.HTTP_400_BAD_REQUEST)
            commit(game, state)
        return Response(payload(game, messages, t))


class PlanView(APIView):
    """Every way to get somewhere from here: trek, CNG bus, keke or cab, with times and fares."""

    throttle_classes = [SyncThrottle]

    def get(self, request):
        game = game_for(request)
        pos = None
        if "x" in request.query_params and "z" in request.query_params:
            try:
                pos = [float(request.query_params["x"]), float(request.query_params["z"])]
            except ValueError:
                raise ValidationError({"pos": "Bad position."})
        try:
            return Response(E.plan(game.state, request.query_params.get("to", ""), pos, now()))
        except E.GameError as exc:
            raise ValidationError({"detail": str(exc)})


class _MoveView(APIView):
    """Every move names the turn it was made on, so a double-tap or a replayed request can't act twice."""

    throttle_classes = [PerGameThrottle]

    def move(self, state, data, t):
        raise NotImplementedError

    def move_game(self, game, data, t):
        return self.move(game.state, data, t)

    def post(self, request):
        with transaction.atomic():
            game = game_for(request, lock=True)
            try:
                turn = int(request.data.get("turn"))
            except (TypeError, ValueError):
                raise ValidationError({"turn": "Send the current turn number."})
            if turn != game.turn:
                return Response({"detail": "That move was already made.", "game": payload(game)},
                                status=status.HTTP_409_CONFLICT)
            t = now()
            try:
                state, messages = self.move_game(game, request.data, t)
            except E.GameError as exc:
                # The clock still moved while you were deciding, so keep that.
                game.refresh_from_db()
                state, _ = E.sync(game.state, t)
                commit(game, state)
                return Response({"detail": str(exc), "game": payload(game, at=t)}, status=status.HTTP_400_BAD_REQUEST)
            commit(game, state)
        return Response(payload(game, messages, t))


class SkipView(_MoveView):
    """Skip the rest of an action or journey you're watching; the outcome doesn't change."""

    def move(self, state, data, t):
        return E.skip_playback(state, t)


class ActView(_MoveView):
    def move_game(self, game, data, t):
        action_id = str(data.get("action", ""))
        state, messages = E.act(game.state, action_id, t)
        big = C.ACTIONS_BY_ID.get(action_id, {}).get("spectacle")
        if big:
            name = game.display_name or "A student"
            PlaceEvent.objects.create(place=state.get("at") or "", game=game, text=big["text"].format(name=name)[:140],
                                      emoji=big["emoji"], t=t)
        return state, messages


class SocialView(_MoveView):
    """Say hello, gist, crack a joke or throw shade at someone where you are. Real students get a wave in chat."""

    def move_game(self, game, data, t):
        kind = str(data.get("kind", ""))
        other_id = data.get("player")
        who = str(data.get("who", ""))
        other = None
        if other_id:
            try:
                other = Game.objects.filter(pk=int(other_id), status="playing").first()
            except (TypeError, ValueError):
                other = None
            if not other or other.pk == game.pk:
                raise E.GameError("That student isn't here any more.")
            if other.state.get("at") != game.state.get("at"):
                raise E.GameError(f"{other.display_name or 'They'} left.")
            who = other.display_name or "A student"
        state, messages = E.social(game.state, kind, who, t, role=str(data.get("role", "")), player=bool(other))
        if other and kind in ("hello", "gist", "joke", "hype", "life", "hang"):
            place = W.BUILDINGS.get(game.state.get("at"), {}).get("name", "campus")
            text = {"hello": f"👋🏾 waved at you at {place}", "gist": f"💬 came to gist with you at {place}",
                    "joke": f"😂 cracked a joke for you at {place}", "hype": f"🙌🏾 hyped you up at {place}",
                    "life": f"🫶🏾 talked about life with you at {place}", "hang": f"🚶🏾 hung out with you at {place}"}[kind]
            try:
                CH.send(game, CH.dm_thread(game.pk, other.pk), text)
            except CH.ChatError:
                pass  # blocked or muted: the wave just doesn't arrive
        return state, messages


class RiddleView(APIView):
    """Today's campus riddle. Be at the right place and search it: the first finders win naira."""

    throttle_classes = [SyncThrottle]

    def get(self, request):
        game = game_for(request)
        return Response(riddle_info(game, now()))


def riddle_today(t: float) -> tuple[str, str]:
    import hashlib

    day = lagos_day(t).date().isoformat()
    places = sorted(C.RIDDLES)
    target = places[int(hashlib.sha256(day.encode()).hexdigest(), 16) % len(places)]
    return day, target


def riddle_prize(rank: int) -> int:
    return next(p for upto, p in C.RIDDLE_PRIZES if rank <= upto)


def riddle_info(game: Game, t: float) -> dict:
    day, target = riddle_today(t)
    finds = RiddleFind.objects.filter(day=day)
    mine = finds.filter(game=game).first()
    rank = finds.filter(pk__lte=mine.pk).count() if mine else None
    return {"day": day, "clue": C.RIDDLES[target], "found": bool(mine), "rank": rank, "prize": mine.prize if mine else 0,
            "finders": finds.count(), "ladder": [{"upto": u if u < 10**8 else None, "prize": p} for u, p in C.RIDDLE_PRIZES],
            "place": W.BUILDINGS[target]["name"] if mine else None}


class RiddleSearchView(_MoveView):
    def move_game(self, game, data, t):
        day, target = riddle_today(t)
        if RiddleFind.objects.filter(day=day, game=game).exists():
            raise E.GameError("You already solved today's riddle. A new one comes at midnight.")
        if game.state.get("at") != target:
            raise E.GameError("Not here. Read the clue again.")
        find = RiddleFind.objects.create(day=day, game=game)
        rank = RiddleFind.objects.filter(day=day, pk__lte=find.pk).count()
        prize = riddle_prize(rank)
        find.prize = prize
        find.save(update_fields=["prize"])
        state, messages = E.gift(game.state, prize, f"Campus riddle, finder #{rank}", t)
        messages.insert(0, f"🔎 You solved today's riddle! You're finder #{rank}.")
        return state, messages


class SugView(APIView):
    """This week's SUG election: candidates, votes, and last week's winner."""

    throttle_classes = [SyncThrottle]

    def get(self, request):
        game = game_for(request)
        return Response(sug_info(game, now()))

    def post(self, request):
        game = game_for(request)
        t = now()
        week = sug_week(t)
        ids = [c["id"] for c in sug_candidates(week)]
        pick = str(request.data.get("candidate", ""))
        if pick not in ids:
            raise ValidationError({"detail": "Pick one of this week's candidates."})
        if game.status != "playing":
            raise ValidationError({"detail": "Only students on campus can vote."})
        _, made = Vote.objects.get_or_create(game=game, week=week, defaults={"candidate": pick})
        if not made:
            raise ValidationError({"detail": "You've voted this week. One student, one vote."})
        return Response(sug_info(game, t))


def sug_candidates(week: str) -> list[dict]:
    import random

    rng = random.Random(f"sug-{week}")
    return rng.sample(C.SUG_CANDIDATES, 3)


def _campus_votes(week: str, cid: str, t: float) -> int:
    """Votes from the thousands of students on campus who aren't players, growing through the week."""
    import random

    rng = random.Random(f"sug-{week}-{cid}")
    base = rng.randint(180, 900)
    day = lagos_day(t)
    y, w, _ = day.isocalendar()
    if f"{y}-W{w:02d}" != week:
        return base
    progress = (day.weekday() * 24 + day.hour + 6) / (7 * 24)
    return int(base * min(1.0, progress))


def sug_info(game: Game, t: float) -> dict:
    from datetime import timedelta

    week = sug_week(t)
    cands = sug_candidates(week)
    real = {}
    for row in Vote.objects.filter(week=week).values_list("candidate", flat=True):
        real[row] = real.get(row, 0) + 1
    rows = []
    for c in cands:
        votes = _campus_votes(week, c["id"], t) + real.get(c["id"], 0)
        rows.append({**c, "votes": votes})
    total = sum(r["votes"] for r in rows) or 1
    for r in rows:
        r["pct"] = round(100 * r["votes"] / total)
    mine = Vote.objects.filter(game=game, week=week).values_list("candidate", flat=True).first()
    last_week = sug_week(t - 7 * 86400)
    last = sug_candidates(last_week)
    last_real = {}
    for row in Vote.objects.filter(week=last_week).values_list("candidate", flat=True):
        last_real[row] = last_real.get(row, 0) + 1
    winner = max(last, key=lambda c: _campus_votes(last_week, c["id"], t) + last_real.get(c["id"], 0))
    day = lagos_day(t)
    return {"week": week, "candidates": rows, "total": total, "voted": mine, "closes": "Sunday 8 PM",
            "last_winner": {"name": winner["name"], "slogan": winner["slogan"]}}


class ChooseView(_MoveView):
    def move(self, state, data, t):
        try:
            index = int(data.get("choice"))
        except (TypeError, ValueError):
            raise E.GameError("Pick one of the options.")
        return E.choose(state, index, t)


class ContinueView(_MoveView):
    def move(self, state, data, t):
        return E.continue_after_results(state, t)


class TravelView(_MoveView):
    def move(self, state, data, t):
        return E.travel(state, str(data.get("to", "")), str(data.get("mode", "")), data.get("pos"), t)


class EnterView(_MoveView):
    def move(self, state, data, t):
        return E.enter_building(state, str(data.get("building", "")), data.get("pos"), t)


class ExitView(_MoveView):
    def move(self, state, data, t):
        return E.exit_building(state, t)


class LookView(_MoveView):
    def move(self, state, data, t):
        new = E.set_look(state, data.get("look"), data.get("traits"), data.get("dream"))
        new["turn"] += 1
        return new, []


class ParentsView(_MoveView):
    def move(self, state, data, t):
        try:
            amount = int(data.get("amount"))
        except (TypeError, ValueError):
            raise E.GameError("Pick how much to ask for.")
        return E.ask_parents(state, amount, t)


class BetView(_MoveView):
    def move(self, state, data, t):
        try:
            match, stake = int(data.get("match")), int(data.get("stake"))
        except (TypeError, ValueError):
            raise E.GameError("Pick a match and a stake.")
        return E.place_bet(state, match, str(data.get("pick", "")), stake, bool(data.get("adult")), t)


class HousingView(APIView):
    """Halls with space and this week's off-campus listings, priced for you."""

    throttle_classes = [SyncThrottle]

    def get(self, request):
        game = game_for(request)
        return Response(R.options(game, now()))


class MoveHomeView(_MoveView):
    def move_game(self, game, data, t):
        state = game.state
        kind = str(data.get("kind", ""))
        if kind == "hostel":
            hall = str(data.get("hall", ""))
            if hall not in C.HALLS[E.gender(state["look"])]:
                raise E.GameError("Pick a hall.")
            if state["housing"]["kind"] == "hostel" and state["housing"]["building"] == hall:
                raise E.GameError("You already live in this hall. Share your room code to bring friends in.")
            room = R.hostel_room(hall, E.gender(state["look"]), exclude=game)
            state, messages = E.move_home(state, "hostel", hall, C.HOUSING["hostel"]["rent"][0],
                                          label=R.room_label(room), now=t)
        else:
            listing = next((x for x in E.listings(t) if x["id"] == data.get("listing")), None)
            if not listing:
                raise E.GameError("That place has been taken. Pick another.")
            state, messages = E.move_home(state, listing["kind"], "offcampus", listing["rent"], area=listing["area"],
                                          now=t)
            room = Room.objects.create(kind=listing["kind"], building="offcampus", area=listing["area"],
                                       capacity=C.HOUSING[listing["kind"]]["capacity"], rent=listing["rent"])
        return R.place(game, room, state), messages


class JoinRoomView(_MoveView):
    """Move in with a friend using their room code: up to 4 in a hall room, 2 in an off-campus place."""

    def move_game(self, game, data, t):
        code = str(data.get("code", "")).strip().upper()
        room = Room.objects.select_for_update().filter(code=code).first() if code else None
        if not room:
            raise E.GameError("No room has that code. Check it and try again.")
        if game.room_id == room.pk:
            raise E.GameError("You already live here.")
        state = game.state
        others = list(R.members(room, game).select_for_update().order_by("pk"))
        if len(others) >= room.capacity:
            raise E.GameError("That hall room is full (4 people)." if room.kind == "hostel"
                              else "The landlord doesn't allow more than 2 tenants.")
        if room.kind == "hostel":
            if room.gender and room.gender != E.gender(state["look"]):
                raise E.GameError(f"That room is in a {room.gender} hall.")
            state, messages = E.move_home(state, "hostel", room.building, C.HOUSING["hostel"]["rent"][0],
                                          label=R.room_label(room), tenants=len(others) + 1, now=t)
        else:
            state, messages = E.move_home(state, room.kind, room.building, room.rent, area=room.area, share=True,
                                          tenants=len(others) + 1, now=t)
            if others:  # your half of the rent goes to the tenant already living there
                host = others[0]
                half = room.rent // 2
                if host.account_number:
                    Transfer.objects.create(receiver=host, amount=half, sender_label=(
                        f"{game.display_name or 'your new flatmate'} (half the rent)"))
                    return R.place(game, room, state), messages
                hs = dict(host.state)
                hs["money"] = hs["money"] + half
                hs["log"] = (hs.get("log", []) + [{"day": hs["total_days"], "time": E.clock_text(hs["clock"]),
                                                   "text": f"{game.display_name or 'Your new flatmate'} moved in and "
                                                           f"paid you ₦{half:,} (half the rent)."}])[-40:]
                host.state = hs
                commit(host, hs)
        return R.place(game, room, state), messages


class RoomNoteView(APIView):
    throttle_classes = [SyncThrottle]

    def post(self, request):
        with transaction.atomic():
            game = game_for(request, lock=True)
            try:
                R.post_note(game, int(request.data.get("note", -1)))
            except (E.GameError, TypeError, ValueError) as exc:
                raise ValidationError({"detail": str(exc) if isinstance(exc, E.GameError) else "Pick a message."})
        return Response(payload(game))


class LeaderboardView(APIView):
    def get(self, request):
        qs = Game.objects.filter(status="graduated", hidden=False).exclude(display_name="")
        dept = request.query_params.get("department")
        if dept in C.DEPARTMENTS:
            qs = qs.filter(department=dept)
        rows = qs.order_by("-final_cgpa", "updated_at")[:25]
        return Response([{
            "name": g.display_name, "cgpa": g.final_cgpa, "class": g.final_class,
            "department": C.DEPARTMENTS[g.department]["name"], "profile": status_name(g.profile),
            "share_code": g.share_code,
        } for g in rows])


def card_data(game: Game) -> dict:
    final = game.state["final"]
    return {
        "name": game.display_name or "A Great Ife student",
        "department": C.DEPARTMENTS[game.department]["name"],
        "profile": status_name(game.profile),
        "cgpa": final["cgpa"], "class": final["class"], "semesters": final["semesters"],
        "outstanding": len(final["outstanding"]), "hustles": final["hustles"], "lectures": final["lectures"],
        "earned": final["earned"],
        "strike": game.state.get("strike_used", False),
        "badges": final.get("badges", 0),
        "badges_total": len(C.BADGES),
        "business_income": final.get("business_income", 0),
        "share_code": game.share_code,
    }


class CardView(APIView):
    """Public graduation card for sharing."""

    def get(self, request, code):
        game = get_object_or_404(Game, share_code=code, status="graduated", hidden=False)
        return Response(card_data(game))


# --- Accounts: save your game and continue on any device (like Lagos Life) ----------------------

def life_summary(game: Game) -> dict:
    state = game.state
    return {
        "id": game.pk, "status": game.status, "name": game.display_name,
        "department": C.DEPARTMENTS[game.department]["name"], "profile": status_name(game.profile),
        "level": E.level_label(state) if game.status == "playing" else None,
        "cgpa": game.final_cgpa if game.status == "graduated" else (E.cgpa(state) if state["results"] else None),
        "class": game.final_class or None, "share_code": game.share_code if game.status == "graduated" else None,
        "updated_at": game.updated_at,
    }


def account_payload(user) -> dict:
    games = list(user.games.order_by("-updated_at")[:30])
    return {"username": user.username, "lives": [life_summary(g) for g in games]}


class AuthThrottle(SimpleRateThrottle):
    """Slow down password guessing per username, and loosely per IP (many students share one IP)."""

    scope = "login"

    def get_cache_key(self, request, view):
        username = str(request.data.get("username", "")).strip().lower()
        ident = hash_token(f"{username}:{self.get_ident(request)}")  # user-typed text never goes into a cache key raw
        return self.cache_format % {"scope": self.scope, "ident": ident}


class RegisterView(APIView):
    throttle_classes = [AuthThrottle]

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        if not USERNAME_RE.match(username):
            raise ValidationError({"username": "Use 3-20 letters, numbers, dots or underscores."})
        if any(word in username.lower() for word in BLOCKED_WORDS):
            raise ValidationError({"username": "Pick another username."})
        if User.objects.filter(username__iexact=username).exists():
            raise ValidationError({"username": "That username is taken."})
        user = User(username=username)
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise ValidationError({"password": exc.messages[0]})
        user.set_password(password)
        user.save()
        # Save the game being played on this device to the new account.
        token = request.headers.get("X-Game-Token", "")
        if token:
            game = game_for(request)
            if game.user_id is None:
                game.user = user
                game.save(update_fields=["user"])
        return Response({"account_token": AccountSession.issue(user), "account": account_payload(user)},
                        status=status.HTTP_201_CREATED)


class LoginView(APIView):
    throttle_classes = [AuthThrottle]

    def post(self, request):
        user = authenticate(username=str(request.data.get("username", "")).strip(),
                            password=str(request.data.get("password", "")))
        if user is None:
            # Usernames are matched case-insensitively for convenience.
            match = User.objects.filter(username__iexact=str(request.data.get("username", "")).strip()).first()
            user = authenticate(username=match.username, password=str(request.data.get("password", ""))) if match else None
        if user is None:
            raise ValidationError({"detail": "Wrong username or password."})
        current = user.games.filter(status="playing").order_by("-updated_at").first()
        return Response({
            "account_token": AccountSession.issue(user),
            "account": account_payload(user),
            "game_token": DeviceToken.issue(current) if current else None,
            "game": payload(current) if current else None,
        })


class AccountView(APIView):
    def get(self, request):
        return Response(account_payload(account_for(request)))


class LogoutView(APIView):
    def post(self, request):
        token = request.headers.get("X-Account-Token", "")
        AccountSession.objects.filter(token_hash=hash_token(token)).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResumeLifeView(APIView):
    """Pick up one of your unfinished lives on this device."""

    def post(self, request, pk):
        user = account_for(request)
        game = get_object_or_404(Game, pk=pk, user=user)
        return Response({"game_token": DeviceToken.issue(game), "game": payload(game)})


# --- Banking -------------------------------------------------------------------------------------

def new_account_number(bank_id: str) -> str:
    prefix = C.BANKS[bank_id]["prefix"]
    for _ in range(50):
        number = prefix + "".join(secrets.choice("0123456789") for _ in range(10 - len(prefix)))
        if not Game.objects.filter(account_number=number).exists():
            return number
    raise E.GameError("The bank's network is down. Try again.")


def _amount(data) -> int:
    try:
        return int(data.get("amount"))
    except (TypeError, ValueError):
        raise E.GameError("Pick an amount.")


class BankOpenView(_MoveView):
    def move_game(self, game, data, t):
        bank_id = str(data.get("bank", ""))
        if bank_id not in C.BANKS:
            raise E.GameError("Pick a bank.")
        number = new_account_number(bank_id)
        state, messages = E.open_account(game.state, bank_id, number, t)
        game.account_number, game.bank = number, bank_id
        return state, messages


class BankCounterView(_MoveView):
    def move(self, state, data, t):
        return E.bank_counter(state, str(data.get("kind", "")), _amount(data), t, hall=data.get("hall") or None)


class AtmView(_MoveView):
    def move(self, state, data, t):
        return E.atm_withdraw(state, _amount(data), t, machine=data.get("machine") or None)


class PosView(_MoveView):
    def move(self, state, data, t):
        return E.pos_cash(state, str(data.get("kind", "")), _amount(data), str(data.get("method", "card")), t)


def _receiver(game: Game, number: str, bank_id: str) -> Game:
    number = re.sub(r"\D", "", str(number or ""))
    if len(number) != 10:
        raise E.GameError("Account numbers have 10 digits.")
    other = Game.objects.filter(account_number=number, status="playing").first()
    if not other or (bank_id and other.bank != bank_id):
        raise E.GameError("Account not found. Check the number and the bank.")
    if other.pk == game.pk:
        raise E.GameError("That's your own account.")
    return other


class BankLookupView(APIView):
    """Name enquiry: confirm who owns an account number before you send money."""

    throttle_classes = [SyncThrottle]

    def get(self, request):
        game = game_for(request)
        try:
            other = _receiver(game, request.query_params.get("number"), request.query_params.get("bank", ""))
        except E.GameError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"name": (other.display_name or "A STUDENT").upper(), "bank": C.BANKS[other.bank]["name"],
                         "number": other.account_number})


class TransferView(_MoveView):
    def move_game(self, game, data, t):
        if data.get("to") and not data.get("number"):
            try:
                other = Game.objects.filter(pk=int(data.get("to")), status="playing").first()
            except (TypeError, ValueError):
                other = None
            if not other or other.pk == game.pk:
                raise E.GameError("That student isn't on campus.")
            if not other.account_number:
                raise E.GameError(f"{other.display_name or 'They'} hasn't opened a bank account yet. Pay cash instead.")
        else:
            other = _receiver(game, data.get("number"), str(data.get("bank", "")))
        amount = _amount(data)
        label = f"{other.display_name or 'A student'} ({C.BANKS[other.bank]['name']})"
        if CH.SCAM_RE.search(str(data.get("note") or "")):
            raise E.GameError(CH.SCAM_TEXT)
        note = CH.clean_text(data.get("note"))[:60] if str(data.get("note") or "").strip() else ""
        state, messages = E.send_transfer(game.state, amount, label, t, note=note)
        sender_bank = C.BANKS[game.bank]["name"] if game.bank in C.BANKS else "Bank"
        Transfer.objects.create(sender=game, receiver=other, amount=amount,
                                sender_label=f"{game.display_name or 'A student'} ({sender_bank})" + (f": {note}" if note else ""))
        return state, messages


# --- Chat ----------------------------------------------------------------------------------------

class ChatThrottle(PerGameThrottle):
    scope = "chat"


class ChatSendThrottle(PerGameThrottle):
    scope = "chat-send"


def _chat(fn):
    try:
        return fn()
    except CH.ChatError as exc:
        raise ValidationError({"detail": str(exc)})


class ChatThreadsView(APIView):
    throttle_classes = [ChatThrottle]

    def get(self, request):
        game = game_for(request)
        return Response({"threads": _chat(lambda: CH.threads(game)), "matric": game.matric,
                         "account": bool(game.account_number)})


class ChatMessagesView(APIView):
    def get_throttles(self):
        self.throttle_scope = None
        return [ChatSendThrottle()] if self.request.method == "POST" else [ChatThrottle()]

    def get(self, request):
        game = game_for(request)
        try:
            after = int(request.query_params.get("after", 0) or 0)
        except ValueError:
            after = 0
        return Response(_chat(lambda: CH.messages(game, request.query_params.get("thread", ""), after)))

    def post(self, request):
        game = game_for(request)
        thread = str(request.data.get("thread", ""))
        _chat(lambda: CH.send(game, thread, request.data.get("text"), bool(request.data.get("share_account"))))
        after = request.data.get("after") or 0
        try:
            after = int(after)
        except (TypeError, ValueError):
            after = 0
        return Response(_chat(lambda: CH.messages(game, thread, after)), status=status.HTTP_201_CREATED)


class ChatDmView(APIView):
    throttle_classes = [ChatThrottle]

    def post(self, request):
        game = game_for(request)
        try:
            gid = int(request.data.get("game")) if request.data.get("game") else None
        except (TypeError, ValueError):
            gid = None
        other = _chat(lambda: CH.find_student(game, request.data.get("matric"), gid))
        return Response(_chat(lambda: CH.messages(game, CH.dm_thread(game.pk, other.pk))))


class ChatBlockView(APIView):
    throttle_classes = [ChatThrottle]

    def post(self, request):
        game = game_for(request)
        try:
            other = int(request.data.get("game"))
        except (TypeError, ValueError):
            raise ValidationError({"detail": "Pick a student."})
        _chat(lambda: CH.block(game, other))
        return Response({"ok": True})


class ChatReportView(APIView):
    throttle_classes = [ChatThrottle]

    def post(self, request):
        game = game_for(request)
        try:
            mid = int(request.data.get("message"))
        except (TypeError, ValueError):
            raise ValidationError({"detail": "Pick a message."})
        _chat(lambda: CH.report(game, mid))
        return Response({"ok": True})
