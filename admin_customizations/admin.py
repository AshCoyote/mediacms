from django.conf import settings
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect
from django.urls import path, reverse

from .models import ALLOWED_LOGO_EXTENSIONS, MAX_LOGO_SIZE, SiteBranding


@admin.register(SiteBranding)
class SiteBrandingAdmin(admin.ModelAdmin):
    """Single-object page for the portal logo (Site branding)."""

    change_form_template = "admin/admin_customizations/sitebranding/change_form.html"
    readonly_fields = ("updated_at",)
    fieldsets = ((None, {"fields": ("logo", "updated_at")}),)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        branding = SiteBranding.get_solo()
        return redirect(reverse("admin:admin_customizations_sitebranding_change", args=[branding.pk]))

    def change_view(self, request, object_id, form_url="", extra_context=None):
        extra_context = dict(extra_context or {})
        extra_context.update(
            {
                "default_logo": getattr(settings, "PORTAL_LOGO_DARK_PNG", ""),
                "max_logo_size_bytes": MAX_LOGO_SIZE,
                "max_logo_size_mb": MAX_LOGO_SIZE // (1024 * 1024),
                "allowed_logo_extensions": ALLOWED_LOGO_EXTENSIONS,
                "restore_default_url": reverse("admin:admin_customizations_sitebranding_restore_default"),
            }
        )
        return super().change_view(request, object_id, form_url, extra_context)

    def save_model(self, request, obj, form, change):
        previous = SiteBranding.objects.filter(pk=1).first()
        previous_name = previous.logo.name if previous and previous.logo else ""
        super().save_model(request, obj, form, change)
        if previous_name and previous_name != obj.logo.name:
            obj.logo.storage.delete(previous_name)

    def get_urls(self):
        return [
            path(
                "restore-default/",
                self.admin_site.admin_view(self.restore_default_logo),
                name="admin_customizations_sitebranding_restore_default",
            )
        ] + super().get_urls()

    def restore_default_logo(self, request):
        if not self.has_change_permission(request):
            raise PermissionDenied
        branding = SiteBranding.get_solo()
        if branding.logo:
            branding.logo.delete(save=False)
        branding.logo = ""
        branding.save()
        self.message_user(request, "The default MediaCMS logo has been restored.", messages.SUCCESS)
        return redirect(reverse("admin:admin_customizations_sitebranding_change", args=[branding.pk]))
