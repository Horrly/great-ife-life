import hashlib
import secrets

from django.conf import settings
from django.db import models


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_share_code() -> str:
    return secrets.token_urlsafe(6)


def new_room_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I to misread
    return "".join(secrets.choice(alphabet) for _ in range(6))


class Room(models.Model):
    """A hall room (up to 4) or an off-campus place (landlords allow 2). Roommates are real players."""

    kind = models.CharField(max_length=12)          # hostel, single, self_con, flat
    building = models.CharField(max_length=20)      # the hall, or "offcampus"
    area = models.CharField(max_length=40, blank=True)
    number = models.CharField(max_length=12, blank=True)
    capacity = models.PositiveSmallIntegerField()
    rent = models.PositiveIntegerField(default=0)
    gender = models.CharField(max_length=8, blank=True)
    code = models.CharField(max_length=8, unique=True, default=new_room_code)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["kind", "building", "gender"])]

    def __str__(self):
        return f"{self.building} {self.number or self.area} ({self.kind})"


class Game(models.Model):
    """One student's run from admission to graduation. The whole game lives in `state`."""

    token_hash = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="games", help_text="Set when the player saves to an account.")
    display_name = models.CharField(max_length=20, blank=True)
    department = models.CharField(max_length=10)
    profile = models.CharField(max_length=20)
    room = models.ForeignKey(Room, null=True, blank=True, on_delete=models.SET_NULL, related_name="members")
    status = models.CharField(max_length=12, default="playing", db_index=True)
    state = models.JSONField()
    turn = models.PositiveIntegerField(default=0)

    final_cgpa = models.FloatField(null=True, blank=True, db_index=True)
    final_class = models.CharField(max_length=30, blank=True)
    share_code = models.CharField(max_length=12, unique=True, default=new_share_code)
    hidden = models.BooleanField(default=False, help_text="Hide from the leaderboard (e.g. a rude name).")
    account_number = models.CharField(max_length=10, unique=True, null=True, blank=True,
                                      help_text="The player's in-game bank account number.")
    bank = models.CharField(max_length=20, blank=True)
    chat_muted = models.BooleanField(default=False, help_text="Stop this player sending chat messages.")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["status", "final_cgpa"])]

    def __str__(self):
        return f"{self.display_name or 'Anonymous'} ({self.department}, {self.status})"

    @property
    def matric(self) -> str:
        """A matric-style student number, shown in chat so students can find each other."""
        return f"{self.department.upper()}/{self.created_at.year if self.created_at else 2026}/{self.pk:04d}"

    @classmethod
    def create(cls, state: dict, display_name: str) -> tuple["Game", str]:
        token = secrets.token_urlsafe(24)
        game = cls.objects.create(token_hash=hash_token(token), display_name=display_name, state=state,
                                  department=state["department"], profile=state["profile"], turn=state["turn"])
        return game, token

    def save_state(self, state: dict):
        self.state = state
        self.turn = state["turn"]
        self.status = state["status"]
        if state.get("final"):
            self.final_cgpa = state["final"]["cgpa"]
            self.final_class = state["final"]["class"]
        self.save()


def new_token() -> str:
    return secrets.token_urlsafe(24)


class DeviceToken(models.Model):
    """Extra save codes for the same game: one per device the player signs in on."""

    token_hash = models.CharField(max_length=64, unique=True)
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="device_tokens")
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def issue(cls, game: Game) -> str:
        token = new_token()
        cls.objects.create(token_hash=hash_token(token), game=game)
        return token


class AccountSession(models.Model):
    """A signed-in device. The token is only stored hashed."""

    token_hash = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="game_sessions")
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def issue(cls, user) -> str:
        token = new_token()
        cls.objects.create(token_hash=hash_token(token), user=user)
        return token


class RoomNote(models.Model):
    """A quick message on the room's notice board. Players pick from set messages (no free text)."""

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="notes")
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="room_notes")
    note = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)


class Transfer(models.Model):
    """Money one student sent to another's account number. Credited when the receiver's game next loads."""

    sender = models.ForeignKey(Game, null=True, on_delete=models.SET_NULL, related_name="sent_transfers")
    receiver = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="received_transfers")
    amount = models.PositiveIntegerField()
    sender_label = models.CharField(max_length=60)
    applied = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ChatMessage(models.Model):
    """A chat message. thread is "room:<id>", "dept:<code>" or "dm:<low id>:<high id>"."""

    thread = models.CharField(max_length=40, db_index=True)
    sender = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="chat_messages")
    text = models.CharField(max_length=300)
    hidden = models.BooleanField(default=False, help_text="Hidden by a moderator.")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["thread", "id"])]

    def __str__(self):
        return f"{self.thread}: {self.text[:40]}"


class ChatRead(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="chat_reads")
    thread = models.CharField(max_length=40)
    last_id = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["game", "thread"], name="one_read_marker_per_thread")]


class ChatBlock(models.Model):
    blocker = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="blocks")
    blocked = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="blocked_by")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["blocker", "blocked"], name="block_once")]


class ChatReport(models.Model):
    message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="chat_reports")
    created_at = models.DateTimeField(auto_now_add=True)
    handled = models.BooleanField(default=False)
