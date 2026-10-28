# Development settings, used in docker-compose-dev.yaml
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INSTALLED_APPS = [
    "admin_customizations",
    "django.contrib.auth",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "jazzmin",
    "django.contrib.admin",
    "django.contrib.sites",
    "rest_framework",
    "rest_framework.authtoken",
    "imagekit",
    "files.apps.FilesConfig",
    "users.apps.UsersConfig",
    "actions.apps.ActionsConfig",
    "rbac.apps.RbacConfig",
    "identity_providers.apps.IdentityProvidersConfig",
    "lti.apps.LtiConfig",
    "migrationservice.apps.MigrationServiceConfig",
    "debug_toolbar",
    "mptt",
    "crispy_forms",
    "crispy_bootstrap5",
    "uploader.apps.UploaderConfig",
    "djcelery_email",
    "drf_yasg",
    "allauth.socialaccount.providers.saml",
    "saml_auth.apps.SamlAuthConfig",
    "corsheaders",
    "tinymce",
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    "django.middleware.locale.LocaleMiddleware",
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'debug_toolbar.middleware.DebugToolbarMiddleware',
    "allauth.account.middleware.AccountMiddleware",
]

DEBUG = True
CORS_ORIGIN_ALLOW_ALL = True
STATICFILES_DIRS = (os.path.join(BASE_DIR, 'static'),)
STATIC_ROOT = os.path.join(BASE_DIR, 'static_collected')

# Base44 sandbox preview only (BASE44_PREVIEW_MODE=1). The preview proxy
# terminates TLS and forwards the browser's Origin header untouched, so Django
# sees the public origin (https://<port>-<BASE44_PUBLIC_HOST_SUFFIX>) against an
# internal host and would reject every POST (login, upload, admin) with an
# "Origin checking failed" 403. Trust just those preview origins; with the flag
# unset or any other value nothing changes.
if os.environ.get("BASE44_PREVIEW_MODE") == "1" and os.environ.get("BASE44_PUBLIC_HOST_SUFFIX"):
    CSRF_TRUSTED_ORIGINS = [
        f"https://3000-{os.environ['BASE44_PUBLIC_HOST_SUFFIX']}",
        f"https://8000-{os.environ['BASE44_PUBLIC_HOST_SUFFIX']}",
    ]
