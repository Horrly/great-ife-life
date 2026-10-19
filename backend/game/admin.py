from django.contrib import admin

from .models import ChatMessage, ChatReport, Game, Transfer


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ["display_name", "department", "profile", "status", "final_cgpa", "final_class", "hidden",
                    "chat_muted", "updated_at"]
    list_filter = ["status", "department", "profile", "hidden", "chat_muted"]
    search_fields = ["display_name", "share_code", "account_number"]
    list_editable = ["hidden", "chat_muted"]
    readonly_fields = ["token_hash", "state", "turn", "share_code", "account_number", "bank", "created_at", "updated_at"]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ["thread", "sender", "text", "hidden", "created_at"]
    list_filter = ["hidden"]
    search_fields = ["text", "thread", "sender__display_name"]
    list_editable = ["hidden"]


@admin.register(ChatReport)
class ChatReportAdmin(admin.ModelAdmin):
    list_display = ["message", "reporter", "handled", "created_at"]
    list_filter = ["handled"]
    list_editable = ["handled"]
    raw_id_fields = ["message", "reporter"]


@admin.register(Transfer)
class TransferAdmin(admin.ModelAdmin):
    list_display = ["sender", "receiver", "amount", "applied", "created_at"]
    raw_id_fields = ["sender", "receiver"]
