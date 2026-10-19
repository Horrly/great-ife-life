import pytest
from rest_framework.test import APIClient

from game import engine as E
from game import views
from game.models import Game

from .bot import Bot

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def fast_settings(settings, tmp_path):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"new-game": "1000/min",
                                                                                     "act": "100000/min",
                                                                                     "sync": "100000/min"}}
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text(
        '<html><head><meta name="description" content="Generic" /><meta property="og:title" content="Great Ife Life" />'
        "<title>Great Ife Life</title></head><body></body></html>")
    settings.FRONTEND_DIST = dist


def start(name="Tunde", department="csc"):
    client = APIClient()
    res = client.post("/api/games/", {"name": name, "department": department}, format="json")
    assert res.status_code == 201, res.data
    client.credentials(HTTP_X_GAME_TOKEN=res.data["token"])
    return client, res.data["game"]


def clear(client, game):
    while game["phase"] == "event":
        idx = next(i for i, c in enumerate(game["pending"]["choices"]) if c["enabled"])
        game = client.post("/api/game/choose/", {"choice": idx, "turn": game["turn"]}, format="json").data
    return game


def test_new_game_and_resume():
    client, game = start()
    assert game["name"] == "Tunde" and game["department"]["code"] == "CSC"
    assert game["profile"]["name"]
    assert client.get("/api/game/").data["turn"] == game["turn"]
    assert APIClient().get("/api/game/").status_code == 404
    other = APIClient()
    other.credentials(HTTP_X_GAME_TOKEN="not-a-real-code")
    assert other.get("/api/game/").status_code == 404


@pytest.mark.parametrize("name", ["x", "a" * 21, "<script>", "fuckboy"])
def test_bad_names_rejected(name):
    res = APIClient().post("/api/games/", {"name": name, "department": "csc"}, format="json")
    assert res.status_code == 400


def test_bad_department_rejected():
    assert APIClient().post("/api/games/", {"department": "medicine"}, format="json").status_code == 400


def test_token_is_stored_hashed():
    client, game = start()
    token = client._credentials["HTTP_X_GAME_TOKEN"]
    assert not Game.objects.filter(token_hash=token).exists()


def test_replayed_move_does_not_double_apply():
    client, game = start()
    game = clear(client, game)
    first = client.post("/api/game/act/", {"action": "bath", "turn": game["turn"]}, format="json")
    assert first.status_code == 200 and first.data["messages"]
    replay = client.post("/api/game/act/", {"action": "bath", "turn": game["turn"]}, format="json")
    assert replay.status_code == 409
    assert replay.data["game"]["money"] == first.data["money"]


def test_illegal_move_is_refused_with_current_state():
    client, game = start()
    game = clear(client, game)
    res = client.post("/api/game/act/", {"action": "sleep", "turn": game["turn"]}, format="json")  # morning
    assert res.status_code == 400 and "starts" in res.data["detail"].lower()
    assert res.data["game"]["turn"] == game["turn"]
    res = client.post("/api/game/act/", {"action": "print_money", "turn": game["turn"]}, format="json")
    assert res.status_code == 400


def test_client_cannot_send_its_own_state():
    client, game = start()
    game = clear(client, game)
    money = game["money"]
    client.post("/api/game/act/", {"action": "bath", "turn": game["turn"], "money": 99999999,
                                   "state": {"money": 99999999}}, format="json")
    after = client.get("/api/game/").data["money"]
    assert money - 300 <= after <= money + 5_000  # bath may cost ₦300; missions and streaks pay a little


def finish_degree(game_obj: Game):
    """Fast-forward a game to graduation with a bot that plays it properly."""
    s = Bot(state=game_obj.state, style="balanced", now=(game_obj.state.get("last_sync") or 0) + 1).play()
    game_obj.save_state(s)
    return game_obj


def test_graduation_card_leaderboard_and_share_preview():
    client, game = start(name="Ada Lovelace")
    g = finish_degree(Game.objects.get())
    data = client.get("/api/game/").data
    assert data["status"] == "graduated" and data["final"]["class"] and data["share_code"] == g.share_code

    card = APIClient().get(f"/api/cards/{g.share_code}/").data
    assert card["name"] == "Ada Lovelace" and card["class"] == g.final_class

    board = APIClient().get("/api/leaderboard/").data
    assert board[0]["name"] == "Ada Lovelace"
    assert APIClient().get("/api/leaderboard/?department=eng").data == []

    page = APIClient().get(f"/c/{g.share_code}").content.decode()
    assert "Ada Lovelace graduated with" in page
    assert page.count('property="og:title"') == 1 and 'content="Great Ife Life"' not in page
    assert page.count('name="description"') == 1
    assert APIClient().head(f"/c/{g.share_code}").status_code == 200

    g.hidden = True
    g.save()
    assert APIClient().get("/api/leaderboard/").data == []
    assert APIClient().get(f"/api/cards/{g.share_code}/").status_code == 404

    res = client.post("/api/game/act/", {"action": "bath", "turn": data["turn"]}, format="json")
    assert res.status_code == 400  # finished games can't be played on


def test_anonymous_games_stay_off_the_leaderboard():
    client, game = start(name="")
    finish_degree(Game.objects.get())
    assert APIClient().get("/api/leaderboard/").data == []


def test_spa_serves_plain_index_for_other_paths():
    res = APIClient().get("/play")
    assert res.status_code == 200 and "<title>Great Ife Life</title>" in res.content.decode()


def test_move_limit_is_per_game_not_per_ip(monkeypatch):
    from django.core.cache import cache

    from game.views import PerGameThrottle

    cache.clear()
    monkeypatch.setattr(PerGameThrottle, "THROTTLE_RATES", {"act": "3/min"})
    a, game_a = start(name="Ade")
    b, game_b = start(name="Bola")  # same IP (the test client), different game
    game_a = clear(a, game_a)
    codes = []
    for _ in range(4):
        res = a.post("/api/game/act/", {"action": "bath", "turn": game_a["turn"]}, format="json")
        codes.append(res.status_code)
        if res.status_code == 200:
            game_a = res.data
    assert codes.count(429) >= 1
    game_b = clear(b, game_b) if game_b["phase"] != "event" else game_b
    res = b.post("/api/game/act/", {"action": "bath", "turn": game_b["turn"]}, format="json")
    assert res.status_code in (200, 400)  # not throttled by A's moves


# --- Accounts -------------------------------------------------------------------------------------


@pytest.fixture
def no_login_throttle(monkeypatch):
    from game.views import AuthThrottle
    monkeypatch.setattr(AuthThrottle, "THROTTLE_RATES", {"login": "1000/min"})


def test_save_to_account_and_continue_on_another_phone(no_login_throttle):
    phone1, game = start(name="Tunde")
    game = clear(phone1, game)
    game = phone1.post("/api/game/act/", {"action": "bath", "turn": game["turn"]}, format="json").data
    res = phone1.post("/api/account/register/", {"username": "tunde_b", "password": "greatife123"}, format="json")
    assert res.status_code == 201
    assert res.data["account"]["lives"][0]["status"] == "playing"

    phone2 = APIClient()
    login = phone2.post("/api/account/login/", {"username": "TUNDE_B", "password": "greatife123"}, format="json")
    assert login.status_code == 200 and login.data["game"]["money"] == game["money"]
    phone2.credentials(HTTP_X_GAME_TOKEN=login.data["game_token"])
    after = clear(phone2, phone2.get("/api/game/").data)
    moved = phone2.post("/api/game/act/", {"action": "bath", "turn": after["turn"]}, format="json")
    assert moved.status_code == 200
    # the first phone still works and sees the move made on the second
    assert phone1.get("/api/game/").data["turn"] == moved.data["turn"]


def test_wrong_password_and_bad_usernames(no_login_throttle):
    client, _ = start()
    client.post("/api/account/register/", {"username": "ada.l", "password": "greatife123"}, format="json")
    assert APIClient().post("/api/account/login/", {"username": "ada.l", "password": "nope"}, format="json").status_code == 400
    assert APIClient().post("/api/account/register/", {"username": "ada.l", "password": "greatife123"},
                            format="json").data["username"] == "That username is taken."
    assert APIClient().post("/api/account/register/", {"username": "a b", "password": "greatife123"},
                            format="json").status_code == 400
    assert "password" in APIClient().post("/api/account/register/", {"username": "kemi", "password": "123"},
                                          format="json").data


def test_new_life_is_saved_to_account_and_listed(no_login_throttle):
    client = APIClient()
    acct = client.post("/api/account/register/", {"username": "bola", "password": "greatife123"}, format="json").data
    client.credentials(HTTP_X_ACCOUNT_TOKEN=acct["account_token"])
    client.post("/api/games/", {"department": "eng"}, format="json")
    client.post("/api/games/", {"department": "csc"}, format="json")
    lives = client.get("/api/account/").data["lives"]
    assert len(lives) == 2 and {l["department"] for l in lives} == {"English", "Computer Science"}
    other = APIClient()
    other.credentials(HTTP_X_ACCOUNT_TOKEN=acct["account_token"])
    resumed = other.post(f"/api/account/lives/{lives[1]['id']}/resume/").data
    assert resumed["game"]["department"]["name"] == lives[1]["department"]


def test_cannot_resume_someone_elses_life(no_login_throttle):
    a = APIClient()
    acct_a = a.post("/api/account/register/", {"username": "ade", "password": "greatife123"}, format="json").data
    a.credentials(HTTP_X_ACCOUNT_TOKEN=acct_a["account_token"])
    a.post("/api/games/", {"department": "eng"}, format="json")
    life = a.get("/api/account/").data["lives"][0]["id"]
    b = APIClient()
    acct_b = b.post("/api/account/register/", {"username": "bayo", "password": "greatife123"}, format="json").data
    b.credentials(HTTP_X_ACCOUNT_TOKEN=acct_b["account_token"])
    assert b.post(f"/api/account/lives/{life}/resume/").status_code == 404


def test_logout_ends_the_session(no_login_throttle):
    client = APIClient()
    acct = client.post("/api/account/register/", {"username": "chika", "password": "greatife123"}, format="json").data
    client.credentials(HTTP_X_ACCOUNT_TOKEN=acct["account_token"])
    assert client.get("/api/account/").status_code == 200
    client.post("/api/account/logout/")
    assert client.get("/api/account/").status_code == 404


def test_login_is_rate_limited(monkeypatch):
    from django.core.cache import cache

    from game.views import AuthThrottle

    cache.clear()
    monkeypatch.setattr(AuthThrottle, "THROTTLE_RATES", {"login": "3/min"})
    codes = [APIClient().post("/api/account/login/", {"username": "x", "password": "y"}, format="json").status_code
             for _ in range(5)]
    assert 429 in codes


def test_assetlinks_for_play_store(settings):
    assert APIClient().get("/.well-known/assetlinks.json").status_code == 404
    settings.ANDROID_PACKAGE_NAME = "app.greatifelife.twa"
    settings.ANDROID_CERT_SHA256 = ["AB:CD:EF"]
    data = APIClient().get("/.well-known/assetlinks.json").json()
    assert data[0]["target"]["package_name"] == "app.greatifelife.twa"
    assert data[0]["target"]["sha256_cert_fingerprints"] == ["AB:CD:EF"]


# --- The campus, the clock and getting around -----------------------------------------------------


class FakeClock:
    def __init__(self, monkeypatch, start=1_000_000.0):
        self.t = start
        monkeypatch.setattr(views, "now", lambda: self.t)


def test_world_map_is_public_and_cached():
    res = APIClient().get("/api/world/")
    assert res.status_code == 200 and "max-age" in res["Cache-Control"]
    data = res.data
    assert "hol" in data["buildings"] and data["bus_route"][0] == "gate"
    assert data["timing"]["rate"] == 1.0
    assert set(APIClient().get("/api/config/").data["look_options"]) == {"skin", "hair", "top", "bottom", "style", "hall"}


def test_clock_ticks_with_real_time(monkeypatch):
    clock = FakeClock(monkeypatch)
    client, game = start()
    game = clear(client, game)
    clock.t += 45
    later = client.post("/api/game/sync/", {}, format="json").data
    assert later["clock"] == game["clock"] + 45 and later["time"]
    clock.t += 10_000  # phone in a drawer all day: only an hour passes
    again = client.get("/api/game/").data
    assert again["clock"] - later["clock"] <= E.IDLE_CAP + 1


def test_plan_and_take_a_trip(monkeypatch):
    clock = FakeClock(monkeypatch)
    client, game = start()
    game = clear(client, game)
    plan = client.get("/api/game/plan/?to=sub").data
    assert {"trek", "bus", "keke", "cab"} <= {o["mode"] for o in plan["options"]}  # plus "car" for a staff kid
    trek = next(o for o in plan["options"] if o["mode"] == "trek")
    res = client.post("/api/game/travel/", {"to": "sub", "mode": "trek", "turn": game["turn"]}, format="json")
    assert res.status_code == 200, res.data
    trip = res.data
    assert trip["at"] in ("sub", None) and trip["clock"] == game["clock"] + trek["minutes"]
    assert trip["last_trip"]["segments"] and trip["messages"][0].startswith("Trekked")
    # while the journey plays back, the clock doesn't run on
    clock.t += 3
    assert client.post("/api/game/sync/", {}, format="json").data["clock"] == trip["clock"]
    assert client.get("/api/game/plan/?to=nowhere").status_code == 400


def test_walk_out_walk_in_and_no_teleporting(monkeypatch):
    clock = FakeClock(monkeypatch)
    client, game = start()
    game = clear(client, game)
    out = client.post("/api/game/exit/", {"turn": game["turn"]}, format="json").data
    assert out["at"] is None
    target = "sports" if out["home"] == "offcampus" else "offcampus"
    door = {"sports": [380, 150], "offcampus": [-140, 150]}[target]
    far = client.post("/api/game/enter/", {"building": target, "pos": door, "turn": out["turn"]},
                      format="json")
    assert far.status_code == 400
    door = list(out["pos"])
    back = client.post("/api/game/enter/", {"building": out["home"], "pos": door, "turn": out["turn"]},
                       format="json")
    assert back.status_code == 200 and back.data["at"] == out["home"]


def test_choose_your_look(monkeypatch):
    client, game = start()
    look = {"skin": 1, "hair": 2, "top": 3, "bottom": 1, "style": 1, "hall": 1}
    res = client.post("/api/game/look/", {"look": look, "turn": game["turn"]}, format="json")
    assert res.status_code == 200 and res.data["look"] == look
    bad = client.post("/api/game/look/", {"look": {"skin": 50}, "turn": res.data["turn"]}, format="json")
    assert bad.status_code == 400
    res = APIClient().post("/api/games/", {"department": "csc", "look": look}, format="json")
    assert res.data["game"]["look"] == look
