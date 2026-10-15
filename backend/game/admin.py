from django.contrib import admin

from .models import Game


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ["display_name", "department", "profile", "status", "final_cgpa", "final_class", "hidden", "updated_at"]
    list_filter = ["status", "department", "profile", "hidden"]
    search_fields = ["display_name", "share_code"]
    list_editable = ["hidden"]
    readonly_fields = ["token_hash", "state", "turn", "share_code", "created_at", "updated_at"]
