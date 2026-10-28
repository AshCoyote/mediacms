import os

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models

ALLOWED_LOGO_EXTENSIONS = ["png", "jpg", "jpeg", "svg", "webp"]
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB
LOGO_CACHE_KEY = "site-branding-logo"


def validate_logo_file(file):
    """Validate an uploaded logo: real content, not just its extension.

    Rasters are opened with Pillow so a renamed non-image is rejected. SVG is
    checked for the elements that would make it scriptable, since the file is
    served from the portal's own origin.
    """
    extension = os.path.splitext(file.name)[1].lower().lstrip(".")
    if extension not in ALLOWED_LOGO_EXTENSIONS:
        raise ValidationError("Unsupported file type. Upload a PNG, SVG, JPG or WebP image.")
    if file.size > MAX_LOGO_SIZE:
        raise ValidationError("Logo is too large ({:.1f} MB). Maximum size is 2 MB.".format(file.size / (1024 * 1024)))

    if extension == "svg":
        content = file.read().decode("utf-8", "ignore").lower()
        file.seek(0)
        if "<svg" not in content:
            raise ValidationError("That file is not a valid SVG image.")
        for unsafe in ("<script", "javascript:", " onload=", " onerror="):
            if unsafe in content:
                raise ValidationError("SVG logos cannot contain scripts or event handlers.")
        return

    try:
        from PIL import Image

        Image.open(file).verify()
    except Exception:
        raise ValidationError("That file is not a valid image.")
    finally:
        file.seek(0)


class SiteBranding(models.Model):
    """Singleton holding the portal logo uploaded from the admin."""

    logo = models.FileField(
        upload_to="branding/",
        blank=True,
        validators=[
            FileExtensionValidator(allowed_extensions=ALLOWED_LOGO_EXTENSIONS),
            validate_logo_file,
        ],
        help_text="PNG, SVG, JPG or WebP, up to 2 MB. Leave empty to use the default MediaCMS logo.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Site branding"
        verbose_name_plural = "Site branding"

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton
        super().save(*args, **kwargs)
        cache.delete(LOGO_CACHE_KEY)

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        cache.delete(LOGO_CACHE_KEY)

    @classmethod
    def get_solo(cls):
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def logo_url(self):
        return self.logo.url if self.logo else ""

    @property
    def logo_is_svg(self):
        return self.logo.name.lower().endswith(".svg") if self.logo else False


def get_branding_logo():
    """Return ``(url, is_svg)`` for the uploaded logo, or ``None`` for the default one."""
    cached = cache.get(LOGO_CACHE_KEY)
    if cached is None:
        branding = SiteBranding.objects.filter(pk=1).first()
        cached = {"url": branding.logo_url, "svg": branding.logo_is_svg} if branding and branding.logo else {}
        cache.set(LOGO_CACHE_KEY, cached, None)
    if not cached.get("url"):
        return None
    return cached["url"], cached["svg"]
