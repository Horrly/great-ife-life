"""Rooms shared by real players: who lives where, and who's in right now.

The engine keeps each player's housing in their game state; this module keeps the database rooms in step
with it, so roommates can see each other.
"""

from __future__ import annotations

import random
import time

from django.db import transaction

from . import content as C
from . import engine as E
from . import world as W
from .models import Game, Room, RoomNote

ONLINE_SECONDS = 15 * 60  # seen in the last 15 minutes: "in", not "away"


def members(room: Room, exclude: Game | None = None):
    qs = room.members.filter(status="playing")
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    return qs


def free_beds(room: Room) -> int:
    return room.capacity - members(room).count()


def _room_number(rng: random.Random) -> str:
    return f"{rng.choice('ABCDEFG')}{rng.randint(1, 4)}{rng.randint(1, 30):02d}"


def hostel_room(hall: str, gender: str, exclude: Game | None = None) -> Room:
    """The first room in the hall with a free bed (rooms fill up so players meet), or a fresh one."""
    rooms = Room.objects.select_for_update().filter(kind="hostel", building=hall).order_by("pk")
    for room in rooms:
        taken = members(room, exclude).count()
        if taken < room.capacity:
            return room
    rng = random.Random()
    return Room.objects.create(kind="hostel", building=hall, gender=gender, number=_room_number(rng),
                               capacity=C.HOUSING["hostel"]["capacity"], rent=C.HOUSING["hostel"]["rent"][0])


def room_label(room: Room) -> str:
    if room.kind == "hostel":
        return f"{W.BUILDINGS[room.building]['name']}, Room {room.number}"
    return f"{C.HOUSING[room.kind]['name']} in {room.area}"


def place(game: Game, room: Room, state: dict | None = None) -> dict:
    """Put the game in the room and write the room into its state."""
    state = dict(state or game.state)
    housing = dict(state["housing"])
    housing.update(room=room.pk, label=room_label(room), building=room.building, kind=room.kind,
                   area=room.area or None, rent=room.rent if room.kind != "hostel" else housing["rent"])
    housing["tenants"] = members(room, game).count() + 1
    state["housing"] = housing
    game.room = room
    return state


def ensure_room(game: Game) -> bool:
    """Make sure the player's database room matches their state. Returns True if anything changed."""
    state = game.state
    if game.status != "playing" or "housing" not in state:
        return False
    h = state["housing"]
    room = game.room
    ok = room is not None and room.pk == h.get("room") and room.building == h["building"] and room.kind == h["kind"]
    if ok:
        tenants = members(room).count()
        if tenants != h.get("tenants"):
            state = dict(state)
            state["housing"] = {**h, "tenants": tenants}
            game.state = state
            return True
        return False
    if h["kind"] == "hostel":
        room = hostel_room(h["building"], E.gender(state["look"]), exclude=game)
    else:
        room = Room.objects.create(kind=h["kind"], building=h["building"], area=h.get("area") or "",
                                   capacity=C.HOUSING[h["kind"]]["capacity"], rent=h["rent"])
    game.state = place(game, room)
    return True


def roommates(game: Game, now: float | None = None) -> dict | None:
    room = game.room
    if room is None:
        return None
    now = now or time.time()
    out = []
    for g in room.members.filter(status="playing").order_by("created_at", "pk")[: room.capacity]:
        s = g.state
        home = s.get("housing", {}).get("building")
        seen = now - (s.get("last_sync") or 0)
        if s.get("asleep") and not s["asleep"].get("until"):
            where = "asleep"
        elif s.get("at") == home and seen < ONLINE_SECONDS:
            where = "in"
        else:
            where = "out"
        out.append({"id": g.pk, "you": g.pk == game.pk, "name": g.display_name or "A student",
                    "department": C.DEPARTMENTS[g.department]["name"], "look": s.get("look", {}),
                    "where": where, "status": C.PROFILES.get(g.profile, {}).get("name", "")})
    notes = [{"by": n.game.display_name or "A roommate", "text": C.ROOM_NOTES[n.note],
              "you": n.game_id == game.pk, "at": n.created_at.timestamp()}
             for n in room.notes.select_related("game").order_by("-created_at")[:8]
             if n.note < len(C.ROOM_NOTES)]
    return {"id": room.pk, "kind": room.kind, "label": room_label(room), "capacity": room.capacity,
            "code": room.code, "rent": room.rent, "people": out, "notes": notes, "note_options": C.ROOM_NOTES}


def options(game: Game, now: float) -> dict:
    """Where you could move: halls (with free beds) and this week's off-campus listings, with prices."""
    state = game.state
    g = E.gender(state["look"])
    halls = []
    for hall in C.HALLS[g]:
        rooms = Room.objects.filter(kind="hostel", building=hall)
        partly = sum(1 for r in rooms if 0 < free_beds(r) < r.capacity)
        q = E.move_quote(state, "hostel", C.HOUSING["hostel"]["rent"][0])
        halls.append({"id": hall, "name": W.BUILDINGS[hall]["name"], "rooms_with_space": partly,
                      "current": state["housing"]["building"] == hall and state["housing"]["kind"] == "hostel", **q})
    places = [{**l, **E.move_quote(state, l["kind"], l["rent"])} for l in E.listings(now)]
    return {"halls": halls, "listings": places, "housing": C.HOUSING, "settling": E.settling(state),
            "money": E.spendable(state), "rent_budget": C.PROFILES[state["profile"]]["rent_budget"],
            "parents_used": bool(state["flags"].get("parents_rent_used"))}


def post_note(game: Game, index: int):
    if game.room is None:
        raise E.GameError("You don't have a room yet.")
    if not 0 <= index < len(C.ROOM_NOTES):
        raise E.GameError("Pick a message.")
    last = RoomNote.objects.filter(game=game).order_by("-created_at").first()
    if last and time.time() - last.created_at.timestamp() < 30:
        raise E.GameError("Give it a moment before posting again.")
    RoomNote.objects.create(room=game.room, game=game, note=index)
    old = list(game.room.notes.order_by("-created_at").values_list("pk", flat=True)[20:])
    if old:
        RoomNote.objects.filter(pk__in=old).delete()
