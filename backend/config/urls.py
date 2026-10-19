from django.contrib import admin
from django.urls import path, re_path

from game import views as g

from .views import assetlinks, health, spa

urlpatterns = [
    path("admin/", admin.site.urls),
    path(".well-known/assetlinks.json", assetlinks),
    path("api/health/", health, name="health"),
    path("api/config/", g.ConfigView.as_view()),
    path("api/games/", g.NewGameView.as_view()),
    path("api/game/", g.GameView.as_view()),
    path("api/world/", g.WorldView.as_view()),
    path("api/game/sync/", g.SyncView.as_view()),
    path("api/game/plan/", g.PlanView.as_view()),
    path("api/game/act/", g.ActView.as_view()),
    path("api/game/travel/", g.TravelView.as_view()),
    path("api/game/enter/", g.EnterView.as_view()),
    path("api/game/exit/", g.ExitView.as_view()),
    path("api/game/look/", g.LookView.as_view()),
    path("api/game/choose/", g.ChooseView.as_view()),
    path("api/game/continue/", g.ContinueView.as_view()),
    path("api/leaderboard/", g.LeaderboardView.as_view()),
    path("api/account/", g.AccountView.as_view()),
    path("api/account/register/", g.RegisterView.as_view()),
    path("api/account/login/", g.LoginView.as_view()),
    path("api/account/logout/", g.LogoutView.as_view()),
    path("api/account/lives/<int:pk>/resume/", g.ResumeLifeView.as_view()),
    path("api/cards/<str:code>/", g.CardView.as_view()),
    re_path(r"^(?P<path>(?!api/|admin/|static/|\.well-known/).*)$", spa, name="spa"),
]
