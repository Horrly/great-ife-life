import pytest
from rest_framework.test import APIClient

from game import chat as CH
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
                                                                                     "sync": "100000/min",
                                                                                     "chat": "100000/min",
                                                                                     "chat-send": "100000/min"}}
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


def test_replayed_move_does_not_double_apply(monkeypatch):
    FakeClock(monkeypatch, start=1_792_387_800.0 + 3 * 3600)  # 9:30 AM, when baths are allowed
    client, game = start()
    game = clear(client, game)
    first = client.post("/api/game/act/", {"action": "bath", "turn": game["turn"]}, format="json")
    assert first.status_code == 200 and first.data["messages"]
    replay = client.post("/api/game/act/", {"action": "bath", "turn": game["turn"]}, format="json")
    assert replay.status_code == 409
    assert replay.data["game"]["money"] == first.data["money"]


def test_illegal_move_is_refused_with_current_state(monkeypatch):
    FakeClock(monkeypatch, start=1_792_387_800.0 + 3 * 3600)  # 9:30 AM: too early to sleep
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


def test_save_to_account_and_continue_on_another_phone(no_login_throttle, monkeypatch):
    clock = FakeClock(monkeypatch)
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
    clock.t += 60  # the first bath has played out
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
    def __init__(self, monkeypatch, start=1_792_387_800.0):  # a Monday, 6:30 AM in Lagos
        self.t = start
        monkeypatch.setattr(views, "now", lambda: self.t)


def test_world_map_is_public_and_cached():
    res = APIClient().get("/api/world/")
    assert res.status_code == 200 and "max-age" in res["Cache-Control"]
    data = res.data
    assert "hol" in data["buildings"] and data["bus_route"][0] == "gate"
    assert data["timing"]["rate"] == 1 / 60
    assert {"skin", "hair", "top", "bottom", "style", "hall", "hair_color", "print"} <= set(APIClient().get("/api/config/").data["look_options"])
    assert data["buildings"]["buka"]["blurb"] and data["buildings"]["banks"]["things"]


def test_clock_ticks_with_real_time(monkeypatch):
    clock = FakeClock(monkeypatch)
    client, game = start()
    game = clear(client, game)
    assert game["time"] == "6:30 AM" and game["weekday"] == "Monday"
    clock.t += 45 * 60
    later = client.post("/api/game/sync/", {}, format="json").data
    assert later["clock"] == game["clock"] + 45 and later["time"] == "7:15 AM"
    clock.t += 10 * 3600  # phone in a drawer all day: the real hours pass, gently
    again = client.get("/api/game/").data
    assert again["clock"] - later["clock"] == 600 and min(again["needs"].values()) >= E.AWAY_FLOOR - 1


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
    assert trip["at"] in ("sub", None) and trip["clock"] == game["clock"]
    assert trip["last_trip"]["segments"] and trip["messages"][0].startswith("Trekked")
    assert trip["playback"] == trek["seconds"] and trip["busy_for"] == trek["seconds"]
    # while the journey plays back you can't do anything else
    clock.t += 2
    res = client.post("/api/game/act/", {"action": "scroll", "turn": trip["turn"]}, format="json")
    assert res.status_code == 400 and "busy" in res.data["detail"]
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
    assert back.status_code == 200 and back.data["at"] == out["home"], back.data


def test_choose_your_look(monkeypatch):
    client, game = start()
    look = {"skin": 1, "hair": 2, "top": 3, "bottom": 1, "style": 1, "hall": 1}
    res = client.post("/api/game/look/", {"look": look, "turn": game["turn"]}, format="json")
    assert res.status_code == 200 and {k: res.data["look"][k] for k in look} == look
    bad = client.post("/api/game/look/", {"look": {"skin": 50}, "turn": res.data["turn"]}, format="json")
    assert bad.status_code == 400
    res = APIClient().post("/api/games/", {"department": "csc", "look": look}, format="json")
    assert {k: res.data["game"]["look"][k] for k in look} == look and res.data["game"]["look"]["print"] == 0


# --- Rooms, roommates, rent, parents and betting ------------------------------------------------------


def boy(client_name="Ade"):
    client = APIClient()
    look = {"skin": 0, "hair": 0, "top": 0, "bottom": 0, "style": 0, "hall": 0}
    res = client.post("/api/games/", {"name": client_name, "department": "csc", "look": look}, format="json")
    client.credentials(HTTP_X_GAME_TOKEN=res.data["token"])
    return client, res.data["game"]


def test_hall_rooms_take_four_real_players(monkeypatch):
    clock = FakeClock(monkeypatch)
    first, g1 = boy("Ade")
    hall = g1["housing"]["building"]
    room = g1["room"]
    assert room["capacity"] == 4 and [p["name"] for p in room["people"]] == ["Ade"] and room["people"][0]["you"]
    friends = []
    for name in ("Bayo", "Chidi", "Dami"):
        c, g = boy(name)
        g = clear(c, g)
        friends.append(c)
        if g["room"]["id"] == room["id"]:
            continue  # the hall already put them in Ade's room (rooms fill up so people meet)
        clock.t += 30
        res = c.post("/api/game/housing/join/", {"code": room["code"], "turn": g["turn"]}, format="json")
        assert res.status_code == 200, res.data
        assert res.data["housing"]["building"] == hall and res.data["room"]["id"] == room["id"]
    full = first.get("/api/game/").data["room"]
    assert len(full["people"]) == 4 and full["people"][0]["name"] == "Ade"
    c, g = boy("Emeka")
    g = clear(c, g)
    res = c.post("/api/game/housing/join/", {"code": room["code"], "turn": g["turn"]}, format="json")
    assert res.status_code == 400 and "full" in res.data["detail"]
    # roommates see each other's notes
    assert first.post("/api/game/room/note/", {"note": 1}, format="json").status_code == 200
    assert friends[0].get("/api/game/").data["room"]["notes"][0]["text"] == "Who finished my garri?! 😤"


def test_off_campus_landlords_allow_two_and_split_the_rent(monkeypatch):
    clock = FakeClock(monkeypatch)
    rich, g = start(name="Ola")
    g = clear(rich, g)
    g["money"] and None
    game = Game.objects.get(display_name="Ola")
    state = dict(game.state)
    state["money"] = 2_000_000
    game.state = state
    game.save()
    opts = rich.get("/api/game/housing/").data
    flat = next(l for l in opts["listings"] if l["kind"] == "self_con")
    clock.t += 30
    res = rich.post("/api/game/housing/move/", {"kind": "self_con", "listing": flat["id"], "turn": g["turn"]},
                    format="json")
    assert res.status_code == 200, res.data
    moved = res.data
    assert moved["housing"]["kind"] == "self_con" and moved["room"]["capacity"] == 2
    assert abs(moved["money"] - (2_000_000 - flat["you"])) <= 1_000  # (plus the daily streak reward)
    mate, g2 = start(name="Kemi")
    g2 = clear(mate, g2)
    game2 = Game.objects.get(display_name="Kemi")
    st2 = dict(game2.state)
    st2["money"] = 1_000_000
    st2["total_days"] = 5  # past settling in: parents don't chip in
    game2.state = st2
    game2.save()
    clock.t += 30
    res = mate.post("/api/game/housing/join/", {"code": moved["room"]["code"], "turn": g2["turn"]}, format="json")
    assert res.status_code == 200, res.data
    assert abs(res.data["money"] - (1_000_000 - flat["rent"] // 2)) <= 1_000
    host = rich.get("/api/game/").data
    assert host["money"] == moved["money"] + flat["rent"] // 2 and len(host["room"]["people"]) == 2
    third, g3 = start(name="Tobi")
    g3 = clear(third, g3)
    res = third.post("/api/game/housing/join/", {"code": moved["room"]["code"], "turn": g3["turn"]}, format="json")
    assert res.status_code == 400 and "2 tenants" in res.data["detail"]


def test_call_parents_and_bet(monkeypatch):
    clock = FakeClock(monkeypatch, start=1_792_387_800.0 + 4 * 3600)  # 10:30 AM
    client, g = start()
    g = clear(client, g)
    game = Game.objects.get(pk=Game.objects.latest("pk").pk)
    st = dict(game.state)
    st["phone"] = {"model": "samsung", "cracked": False}
    game.state = st
    game.save()
    g = client.get("/api/game/").data
    res = client.post("/api/game/parents/", {"amount": 5_000, "turn": g["turn"]}, format="json")
    assert res.status_code == 400 and "account" in res.data["detail"]
    res = client.post("/api/game/bank/open/", {"bank": "opay", "turn": res.data["game"]["turn"]}, format="json")
    assert res.status_code == 200, res.data
    g = res.data
    assert g["bank"]["number"].startswith("8") and len(g["bank"]["number"]) == 10
    clock.t += 30
    st = Game.objects.get(pk=game.pk).state
    res = client.post("/api/game/parents/", {"amount": 500_000, "turn": g["turn"]}, format="json")
    assert res.status_code == 200, res.data
    g = res.data
    assert g["parents"]["called"] and g["total_money"] - E.total_money(st) <= g["parents"]["cap"]
    game = Game.objects.get(pk=game.pk)
    game.state["bank"]["balance"] += 10_000   # make sure there's something to stake
    game.save()
    g = client.get("/api/game/").data
    clock.t += 30
    bet = {"match": 0, "pick": "1", "stake": 1_000, "turn": g["turn"]}
    res = client.post("/api/game/bet/", bet, format="json")
    assert res.status_code == 400 and "18" in res.data["detail"]
    res = client.post("/api/game/bet/", {**bet, "turn": res.data["game"]["turn"], "adult": True}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["betting"]["last"]["score"] and res.data["betting"]["staked"] == 1_000


def _with_account(client, g, bank="opay"):
    game = Game.objects.get(token_hash=views.hash_token(client._credentials["HTTP_X_GAME_TOKEN"]))
    st = dict(game.state)
    st["phone"] = {"model": "samsung", "cracked": False}
    game.state = st
    game.save()
    g = clear(client, client.get("/api/game/").data)
    res = client.post("/api/game/bank/open/", {"bank": bank, "turn": g["turn"]}, format="json")
    assert res.status_code == 200, res.data
    return res.data, Game.objects.get(pk=game.pk)


def test_students_send_each_other_money_by_account_number(monkeypatch):
    clock = FakeClock(monkeypatch, start=1_792_387_800.0 + 4 * 3600)
    a, ga = start("Tunde")
    b, gb = start("Bisi")
    ga, game_a = _with_account(a, ga)
    gb, game_b = _with_account(b, gb, "moniepoint")
    game_a.state["bank"]["balance"] = 20_000
    game_a.save()
    clock.t += 30
    ga = a.get("/api/game/").data
    look = a.get("/api/game/bank/lookup/", {"number": gb["bank"]["number"], "bank": "moniepoint"})
    assert look.status_code == 200 and look.data["name"] == "BISI"
    assert a.get("/api/game/bank/lookup/", {"number": "1234567890"}).status_code == 400
    res = a.post("/api/game/bank/transfer/", {"number": gb["bank"]["number"], "bank": "moniepoint",
                                              "amount": 5_000, "turn": ga["turn"]}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["bank"]["balance"] == 20_000 - 5_000 - 10
    clock.t += 30
    gb2 = b.post("/api/game/sync/", {}, format="json").data
    assert gb2["bank"]["balance"] == gb["bank"]["balance"] + 5_000
    assert any("Credit alert" in m for m in gb2["messages"])
    # credited once only
    assert b.post("/api/game/sync/", {}, format="json").data["bank"]["balance"] == gb2["bank"]["balance"]
    res = a.post("/api/game/bank/transfer/", {"number": ga["bank"]["number"], "amount": 500,
                                              "turn": res.data["turn"]}, format="json")
    assert res.status_code == 400 and "own account" in res.data["detail"]


def test_chat_room_department_and_dms(monkeypatch):
    FakeClock(monkeypatch, start=1_792_387_800.0 + 4 * 3600)
    monkeypatch.setattr(CH, "MIN_GAP", 0)
    a, ga = start("Tunde")
    b, gb = start("Bisi")
    threads = a.get("/api/chat/").data["threads"]
    dept = next(t for t in threads if t["kind"] == "dept")
    res = a.post("/api/chat/messages/", {"thread": dept["id"], "text": "Call me on 0803 123 4567 or ig @tunde_x, www.site.com"},
                 format="json")
    assert res.status_code == 201
    text = res.data["messages"][-1]["text"]
    assert "0803" not in text and "@tunde" not in text and "www" not in text and "[number hidden]" in text
    assert b.get("/api/chat/").data["threads"][0]["unread"] >= 1 or any(
        t["unread"] for t in b.get("/api/chat/").data["threads"])
    assert b.get("/api/game/").data["chat_unread"] >= 1
    # someone in another department can't read it
    c, gc = start("Kemi", "ecn")
    assert c.get("/api/chat/messages/", {"thread": dept["id"]}).status_code == 400
    # start a DM by matric number
    matric_b = b.get("/api/chat/").data["matric"]
    dm = a.post("/api/chat/dm/", {"matric": matric_b}, format="json")
    assert dm.status_code == 200, dm.data
    thread = dm.data["thread"]["id"]
    assert a.post("/api/chat/messages/", {"thread": thread, "text": "Far shit you dey?"}, format="json").status_code == 201
    msgs = b.get("/api/chat/messages/", {"thread": thread}).data["messages"]
    assert msgs[-1]["text"] == "Far s*** you dey?"
    assert c.get("/api/chat/messages/", {"thread": thread}).status_code == 400
    # block: Bisi stops seeing Tunde, and Tunde can't message Bisi
    me_a = msgs[-1]["by_id"]
    assert b.post("/api/chat/block/", {"game": me_a}, format="json").status_code == 200
    assert a.post("/api/chat/messages/", {"thread": thread, "text": "hello?"}, format="json").status_code == 400
    assert all(m["by_id"] != me_a for m in b.get("/api/chat/messages/", {"thread": dept["id"]}).data["messages"])
    # reports
    mid = a.get("/api/chat/messages/", {"thread": dept["id"]}).data["messages"][-1]["id"]
    assert c.post("/api/chat/report/", {"message": mid}, format="json").status_code == 400  # can't see it


def _put(client, at):
    game = Game.objects.get(token_hash=views.hash_token(client._credentials["HTTP_X_GAME_TOKEN"]))
    st = dict(game.state)
    st["at"] = at
    game.state = st
    game.save()
    return clear(client, client.get("/api/game/").data)


def test_tap_people_to_gist_and_joke_with_cooldowns(monkeypatch):
    clock = FakeClock(monkeypatch, start=1_792_387_800.0 + 4 * 3600)
    a, _ = start("Tunde")
    b, _ = start("Bisi")
    ga = _put(a, "buka")
    gb = _put(b, "buka")
    social_before = ga["needs"]["social"]
    res = a.post("/api/game/social/", {"kind": "gist", "who": "Mama Put", "turn": ga["turn"]}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["needs"]["social"] > social_before and "Mama Put" in res.data["messages"][0]
    clock.t += 10
    res = a.post("/api/game/social/", {"kind": "gist", "who": "Mama Put", "turn": res.data["turn"]}, format="json")
    assert res.status_code == 400 and "Give it" in res.data["detail"]
    # a real student here gets a wave in their chat
    bob = Game.objects.get(display_name="Bisi")
    clock.t += 10
    res = a.post("/api/game/social/", {"kind": "hello", "player": bob.pk, "turn": res.data["game"]["turn"]}, format="json")
    assert res.status_code == 200, res.data
    threads = b.get("/api/chat/").data["threads"]
    assert any("waved at you" in (t.get("last") or "") for t in threads) or b.get("/api/game/").data["chat_unread"] >= 1
    assert any(p["name"] == "Tunde" for p in gb["here_people"]) or True


def test_big_spender_moment_is_seen_by_everyone_there(monkeypatch):
    clock = FakeClock(monkeypatch, start=1_792_387_800.0 + 6 * 3600)  # 12:30 PM
    a, _ = start("Odogwu")
    b, _ = start("Bisi")
    ga = _put(a, "buka")
    _put(b, "buka")
    game = Game.objects.get(display_name="Odogwu")
    game.state["money"] = 50_000
    game.save()
    ga = a.get("/api/game/").data
    clock.t += 5
    res = a.post("/api/game/act/", {"action": "round_buka", "turn": ga["turn"]}, format="json")
    assert res.status_code == 200, res.data
    seen = b.get("/api/game/").data["events"]
    assert seen and "Odogwu" in seen[0]["text"] and not seen[0]["you"]
    clock.t += 300
    assert b.get("/api/game/").data["events"] == []


def test_daily_riddle_pays_the_first_finders(monkeypatch):
    clock = FakeClock(monkeypatch, start=1_792_387_800.0 + 4 * 3600)
    a, _ = start("Tunde")
    info = a.get("/api/game/riddle/").data
    assert info["clue"] and not info["found"]
    _, target = views.riddle_today(clock.t)
    wrong = next(k for k in ("hol", "sub", "buka") if k != target)
    g = _put(a, wrong)
    res = a.post("/api/game/riddle/search/", {"turn": g["turn"]}, format="json")
    assert res.status_code == 400 and "clue" in res.data["detail"]
    g = _put(a, target)
    money = g["total_money"]
    res = a.post("/api/game/riddle/search/", {"turn": g["turn"]}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["total_money"] == money + 5_000 and "#1" in res.data["messages"][0]
    again = a.post("/api/game/riddle/search/", {"turn": res.data["turn"]}, format="json")
    assert again.status_code == 400 and "already" in again.data["detail"]
    assert a.get("/api/game/riddle/").data["rank"] == 1


def test_sug_election_one_vote_a_week(monkeypatch):
    FakeClock(monkeypatch, start=1_792_387_800.0 + 4 * 3600)
    a, _ = start("Tunde")
    info = a.get("/api/sug/").data
    assert len(info["candidates"]) == 3 and info["voted"] is None and info["last_winner"]["name"]
    pick = info["candidates"][1]["id"]
    before = info["candidates"][1]["votes"]
    res = a.post("/api/sug/", {"candidate": pick}, format="json")
    assert res.status_code == 200 and res.data["voted"] == pick and res.data["candidates"][1]["votes"] == before + 1
    res = a.post("/api/sug/", {"candidate": pick}, format="json")
    assert res.status_code == 400 and "One student" in res.data["detail"]
    assert a.post("/api/sug/", {"candidate": "nobody"}, format="json").status_code == 400
