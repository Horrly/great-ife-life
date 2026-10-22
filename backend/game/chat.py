"""Chat between real students: your room, your department, and one-to-one.

Many players are teenagers, so chat is kept safe by design: phone numbers, links, emails and social
handles are hidden (meet in the game, not off it), rude words are starred out, anyone can be blocked or
reported, and moderators can hide messages or mute a player in Django admin.
"""

from __future__ import annotations

import re
import time

from django.db.models import Q

from . import content as C
from . import world as W
from .models import ChatBlock, ChatMessage, ChatRead, ChatReport, Game

MAX_LEN = 300
MIN_GAP = 1.5   # seconds between your messages
PAGE = 60
BLOCKED_WORDS = ["fuck", "shit", "bitch", "pussy", "dick", "nigga", "nigger", "ashawo", "olosho", "werey",
                 "bastard", "asshole", "whore", "slut"]

LINK_RE = re.compile(r"(https?://\S+|www\.\S+|\b\S+\.(com|ng|net|org|io|me|ly|link|xyz)\b\S*)", re.I)
EMAIL_RE = re.compile(r"\b\S+@\S+\.\S+\b")
HANDLE_RE = re.compile(r"(?<!\w)@\w{3,}")
PHONE_RE = re.compile(r"(\+?\d[\d\s\-().]{5,}\d)")
# Game money for real money is how scams start (the worst thing seen in Lagos Life's job board), so
# offers to buy or sell naira for real cash, "double your money" and "fake alert" never get sent.
SCAM_RE = re.compile(
    r"(real[\s-]*(money|cash|naira|life)|fake\s*alert|double\s+(your|ur|my)\s+(money|cash)|"
    r"\b(opay|palmpay|moniepoint|kuda|paystack|mtn\s*momo)\b|\b(airtime|recharge\s*card|data)\s+for\s+(game|naira|money)|"
    r"\b(sell|buy)(ing)?\s+(game\s+)?(naira|money|cash)\b|\bcash\s*out\b)", re.I)
SCAM_TEXT = ("Trading game money for real money isn't allowed: it's how students get scammed. "
             "Keep naira inside Great Ife Life.")
WORD_RE = re.compile("|".join(re.escape(w) for w in BLOCKED_WORDS), re.I)


class ChatError(Exception):
    pass


def clean_text(raw: str) -> str:
    text = " ".join(str(raw or "").split())[:MAX_LEN]
    if not text:
        raise ChatError("Type a message.")
    text = EMAIL_RE.sub("[hidden]", text)
    text = LINK_RE.sub("[link hidden]", text)
    text = HANDLE_RE.sub("[hidden]", text)
    text = PHONE_RE.sub(lambda m: "[number hidden]" if sum(c.isdigit() for c in m.group(0)) >= 7 else m.group(0), text)
    text = WORD_RE.sub(lambda m: m.group(0)[0] + "*" * (len(m.group(0)) - 1), text)
    return text


def dm_thread(a: int, b: int) -> str:
    lo, hi = sorted((a, b))
    return f"dm:{lo}:{hi}"


def _dm_other(game: Game, thread: str) -> int | None:
    try:
        _, a, b = thread.split(":")
        a, b = int(a), int(b)
    except ValueError:
        return None
    if game.pk not in (a, b):
        return None
    return b if a == game.pk else a


def blocked_ids(game: Game) -> set[int]:
    """People you blocked, and people who blocked you: neither side sees the other."""
    mine = ChatBlock.objects.filter(blocker=game).values_list("blocked_id", flat=True)
    theirs = ChatBlock.objects.filter(blocked=game).values_list("blocker_id", flat=True)
    return set(mine) | set(theirs)


def thread_info(game: Game, thread: str) -> dict:
    """Who can see this thread, and what it's called. Raises if you can't."""
    kind = thread.split(":", 1)[0]
    if kind == "room":
        if not game.room_id or thread != f"room:{game.room_id}":
            raise ChatError("That's not your room.")
        room = game.room
        title = (f"{W.BUILDINGS[room.building]['name']} {room.number}" if room.kind == "hostel"
                 else f"{C.HOUSING[room.kind]['name']}, {room.area}")
        return {"id": thread, "kind": "room", "title": f"🛏 {title}", "subtitle": "Your roommates"}
    if kind == "dept":
        if thread != f"dept:{game.department}":
            raise ChatError("That's another department's chat.")
        d = C.DEPARTMENTS[game.department]
        return {"id": thread, "kind": "dept", "title": f"🎓 {d['code']} students", "subtitle": d["name"]}
    if kind == "place":
        building = thread.split(":", 1)[1]
        if building not in W.BUILDINGS or game.state.get("at") != building:
            raise ChatError("You can only talk to people where you are.")
        return {"id": thread, "kind": "place", "title": f"📍 {W.BUILDINGS[building]['name']}",
                "subtitle": "Everyone here right now"}
    if kind == "dm":
        other_id = _dm_other(game, thread)
        other = Game.objects.filter(pk=other_id).first() if other_id else None
        if not other:
            raise ChatError("Chat not found.")
        return {"id": thread, "kind": "dm", "title": other.display_name or "A student",
                "subtitle": f"{C.DEPARTMENTS[other.department]['name']} · {other.matric}", "other": other.pk,
                "blocked": other.pk in blocked_ids(game)}
    raise ChatError("Chat not found.")


def _row(m: ChatMessage, me: Game) -> dict:
    return {"id": m.pk, "text": m.text, "by": m.sender.display_name or "A student", "by_id": m.sender_id,
            "matric": m.sender.matric, "you": m.sender_id == me.pk, "at": m.created_at.timestamp()}


def _visible(qs, game: Game):
    hide = blocked_ids(game)
    qs = qs.filter(hidden=False)
    return qs.exclude(sender_id__in=hide) if hide else qs


def _my_threads(game: Game) -> list[str]:
    out = []
    if game.room_id:
        out.append(f"room:{game.room_id}")
    out.append(f"dept:{game.department}")
    dms = (ChatMessage.objects.filter(Q(thread__startswith=f"dm:{game.pk}:") | (Q(thread__startswith="dm:") &
                                                                                 Q(thread__endswith=f":{game.pk}")))
           .values_list("thread", flat=True).distinct())
    out += sorted(set(dms))
    return out


def _reads(game: Game) -> dict[str, int]:
    return dict(ChatRead.objects.filter(game=game).values_list("thread", "last_id"))


def unread_total(game: Game) -> int:
    reads = _reads(game)
    total = 0
    for thread in _my_threads(game):
        qs = _visible(ChatMessage.objects.filter(thread=thread, pk__gt=reads.get(thread, 0)), game).exclude(sender=game)
        total += qs.count()
    return total


def threads(game: Game) -> list[dict]:
    reads = _reads(game)
    out = []
    for thread in _my_threads(game):
        try:
            info = thread_info(game, thread)
        except ChatError:
            continue
        msgs = _visible(ChatMessage.objects.filter(thread=thread), game)
        last = msgs.select_related("sender").order_by("-pk").first()
        if info["kind"] == "dm" and (info.get("blocked") or not last):
            continue
        info["last"] = _row(last, game) if last else None
        info["unread"] = msgs.filter(pk__gt=reads.get(thread, 0)).exclude(sender=game).count()
        out.append(info)
    out.sort(key=lambda t: (t["kind"] == "dm", -(t["last"]["at"] if t["last"] else 0)))
    return out


def messages(game: Game, thread: str, after: int = 0) -> dict:
    info = thread_info(game, thread)
    qs = _visible(ChatMessage.objects.filter(thread=thread), game).select_related("sender")
    if info["kind"] == "place":   # what people said here in the last two hours
        from datetime import timedelta

        from django.utils import timezone
        qs = qs.filter(created_at__gte=timezone.now() - timedelta(hours=2))
    if after:
        rows = list(qs.filter(pk__gt=after).order_by("pk")[:PAGE])
    else:
        rows = list(qs.order_by("-pk")[:PAGE])[::-1]
    if rows:
        ChatRead.objects.update_or_create(game=game, thread=thread, defaults={"last_id": rows[-1].pk})
    return {"thread": info, "messages": [_row(m, game) for m in rows]}


def send(game: Game, thread: str, text: str | None = None, share_account: bool = False) -> ChatMessage:
    if game.chat_muted:
        raise ChatError("A moderator has paused your chat.")
    if game.status != "playing":
        raise ChatError("Chat is for students on campus.")
    info = thread_info(game, thread)
    if info.get("blocked"):
        raise ChatError("You can't message this student.")
    last = ChatMessage.objects.filter(sender=game).order_by("-pk").first()
    if last and time.time() - last.created_at.timestamp() < MIN_GAP:
        raise ChatError("Slow down a little.")
    if share_account:
        if not game.account_number:
            raise ChatError("Open a bank account first.")
        bank = C.BANKS.get(game.bank, {}).get("name", "Bank")
        body = f"💳 My account: {bank} {game.account_number} ({game.display_name or 'me'})"
    else:
        if SCAM_RE.search(str(text or "")):
            raise ChatError(SCAM_TEXT)
        body = clean_text(text)
    msg = ChatMessage.objects.create(thread=thread, sender=game, text=body)
    ChatRead.objects.update_or_create(game=game, thread=thread, defaults={"last_id": msg.pk})
    return msg


def find_student(game: Game, matric: str | None = None, game_id: int | None = None) -> Game:
    other = None
    if game_id:
        other = Game.objects.filter(pk=game_id).first()
    elif matric:
        try:
            other = Game.objects.filter(pk=int(str(matric).strip().split("/")[-1])).first()
        except ValueError:
            other = None
        if other and other.matric.lower() != str(matric).strip().lower():
            other = None
    if not other or other.status != "playing":
        raise ChatError("No student on campus has that matric number.")
    if other.pk == game.pk:
        raise ChatError("That's you!")
    if other.pk in blocked_ids(game):
        raise ChatError("You can't message this student.")
    return other


def block(game: Game, other_id: int):
    if other_id == game.pk:
        raise ChatError("You can't block yourself.")
    if not Game.objects.filter(pk=other_id).exists():
        raise ChatError("Student not found.")
    ChatBlock.objects.get_or_create(blocker=game, blocked_id=other_id)


def report(game: Game, message_id: int):
    msg = ChatMessage.objects.filter(pk=message_id).first()
    if not msg:
        raise ChatError("Message not found.")
    thread_info(game, msg.thread)   # you can only report what you can see
    ChatReport.objects.get_or_create(message=msg, reporter=game)
    # three different reporters hide a message until a moderator looks at it
    if msg.reports.values("reporter").distinct().count() >= 3:
        msg.hidden = True
        msg.save(update_fields=["hidden"])
