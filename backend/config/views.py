import html
import re

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_safe

from game.models import Game


@require_GET
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        return JsonResponse({"status": "error", "database": "unreachable"}, status=503)
    return JsonResponse({"status": "ok"})


def _share_meta(request, code: str) -> dict | None:
    game = Game.objects.filter(share_code=code, status="graduated", hidden=False).first()
    if not game:
        return None
    final = game.state["final"]
    who = game.display_name or "A Great Ife student"
    return {
        "title": f"{who} graduated with {final['class']} ({final['cgpa']:.2f}) | Great Ife Life",
        "description": "Survive four years at Great Ife: lectures, hustles, NEPA, ASUU strikes and exams. "
                       "Can you beat this CGPA?",
        "url": request.build_absolute_uri(),
    }


@require_safe
def assetlinks(request):
    """Proves to Android that the Play Store app and this website belong together (Trusted Web Activity).

    Without it the installed app shows a browser address bar. Set ANDROID_PACKAGE_NAME and
    ANDROID_CERT_SHA256 (comma-separated fingerprints from Play Console > App integrity).
    """
    package = settings.ANDROID_PACKAGE_NAME
    fingerprints = settings.ANDROID_CERT_SHA256
    if not package or not fingerprints:
        return JsonResponse({"detail": "Android app not configured."}, status=404)
    return JsonResponse([{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {"namespace": "android_app", "package_name": package, "sha256_cert_fingerprints": fingerprints},
    }], safe=False)


@require_safe  # GET and HEAD: link-preview bots often send HEAD first
def spa(request, path=""):
    index = settings.FRONTEND_DIST / "index.html"
    if not index.is_file():
        return HttpResponse("Frontend not built. Run the Vite dev server (npm run dev) or `npm run build`.",
                            status=404, content_type="text/plain")
    page = index.read_text(encoding="utf-8")
    # Shared graduation cards get their own preview text on WhatsApp, X and Facebook.
    match = re.match(r"^c/([\w-]{4,12})/?$", path)
    meta = _share_meta(request, match.group(1)) if match else None
    if meta:
        tags = "".join(
            f'<meta property="og:{k}" content="{html.escape(v)}" />' for k, v in meta.items()
        ) + f'<meta name="twitter:card" content="summary" /><meta name="description" content="{html.escape(meta["description"])}" />'
        # Replace the default preview tags; crawlers usually read the first og:title they find.
        page = re.sub(r'\s*<meta (?:property="og:[^"]+"|name="description"|name="twitter:[^"]+")[^>]*>', "", page)
        page = re.sub(r"<title>.*?</title>", f"<title>{html.escape(meta['title'])}</title>", page, count=1)
        page = page.replace("</head>", tags + "</head>", 1)
    response = HttpResponse(page, content_type="text/html")
    response["Cache-Control"] = "no-cache"
    return response
