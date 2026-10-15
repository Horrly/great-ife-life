import re
import uuid

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from . import content as C
from . import engine as E
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import AccountSession, DeviceToken, Game, hash_token

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


def payload(game: Game, messages=None) -> dict:
    data = E.view(game.state)
    data["share_code"] = game.share_code if game.status == "graduated" else None
    if messages is not None:
        data["messages"] = messages
    return data


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
            "profiles": [{"id": k, "name": v["name"], "tagline": v["tagline"]} for k, v in C.PROFILES.items()],
        })


class NewGameView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "new-game"

    def post(self, request):
        name = clean_name(request.data.get("name", ""))
        try:
            state = E.new_state(uuid.uuid4().hex, request.data.get("department", ""), name)
        except E.GameError as exc:
            raise ValidationError({"department": str(exc)})
        game, token = Game.create(state, name)
        user = account_for(request, required=False)
        if user:
            game.user = user
            game.save(update_fields=["user"])
        return Response({"token": token, "game": payload(game)}, status=status.HTTP_201_CREATED)


class GameView(APIView):
    def get(self, request):
        return Response(payload(game_for(request)))


class PerGameThrottle(SimpleRateThrottle):
    """Limit moves per game, not per IP: thousands of students can share one IP on campus Wi-Fi."""

    scope = "act"

    def get_cache_key(self, request, view):
        token = request.headers.get("X-Game-Token", "")
        ident = hash_token(token) if token else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class _MoveView(APIView):
    """Every move names the turn it was made on, so a double-tap or a replayed request can't act twice."""

    throttle_classes = [PerGameThrottle]

    def move(self, state, data):
        raise NotImplementedError

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
            try:
                state, messages = self.move(game.state, request.data)
            except E.GameError as exc:
                return Response({"detail": str(exc), "game": payload(game)}, status=status.HTTP_400_BAD_REQUEST)
            game.save_state(state)
        return Response(payload(game, messages))


class ActView(_MoveView):
    def move(self, state, data):
        return E.act(state, str(data.get("action", "")))


class ChooseView(_MoveView):
    def move(self, state, data):
        try:
            index = int(data.get("choice"))
        except (TypeError, ValueError):
            raise E.GameError("Pick one of the options.")
        return E.choose(state, index)


class ContinueView(_MoveView):
    def move(self, state, data):
        return E.continue_after_results(state)


class LeaderboardView(APIView):
    def get(self, request):
        qs = Game.objects.filter(status="graduated", hidden=False).exclude(display_name="")
        dept = request.query_params.get("department")
        if dept in C.DEPARTMENTS:
            qs = qs.filter(department=dept)
        rows = qs.order_by("-final_cgpa", "updated_at")[:25]
        return Response([{
            "name": g.display_name, "cgpa": g.final_cgpa, "class": g.final_class,
            "department": C.DEPARTMENTS[g.department]["name"], "profile": C.PROFILES[g.profile]["name"],
            "share_code": g.share_code,
        } for g in rows])


def card_data(game: Game) -> dict:
    final = game.state["final"]
    return {
        "name": game.display_name or "A Great Ife student",
        "department": C.DEPARTMENTS[game.department]["name"],
        "profile": C.PROFILES[game.profile]["name"],
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
        "department": C.DEPARTMENTS[game.department]["name"], "profile": C.PROFILES[game.profile]["name"],
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
