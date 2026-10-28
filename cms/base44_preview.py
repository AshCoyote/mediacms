"""Base44 sandbox preview only - see AGENTS.md.

The preview proxy terminates TLS in front of the app but forwards only the
internal ``Host`` (``<port>-<sandbox id>.<sandbox domain>``), without any
``X-Forwarded-Proto`` / ``X-Forwarded-Host`` header. Django would therefore build
``http://<internal host>/...`` URLs (``files/context_processors.py`` hands
``request.build_absolute_uri('/')`` to the frontend as ``FRONTEND_HOST``), which
browsers refuse to call from the HTTPS preview page and which point at the wrong
origin.

This middleware fills in the headers the proxy omits, using the public preview
host the platform passes in ``BASE44_PUBLIC_HOST_SUFFIX``, and lets Django's own
``USE_X_FORWARDED_HOST`` / ``SECURE_PROXY_SSL_HEADER`` handling do the rest.
It is registered only when ``BASE44_PREVIEW_MODE == "1"`` (see
``cms/dev_settings.py``); with the flag unset nothing changes.
"""

import os


class PreviewProxyHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.public_host_suffix = os.environ.get("BASE44_PUBLIC_HOST_SUFFIX", "")

    def __call__(self, request):
        if self.public_host_suffix:
            # Keep the port the request arrived on (3000 frontend proxy, 8000 Django).
            port = (request.META.get("HTTP_HOST") or "").split("-", 1)[0]
            if not port.isdigit():
                port = "3000"
            request.META["HTTP_X_FORWARDED_HOST"] = f"{port}-{self.public_host_suffix}"
            request.META["HTTP_X_FORWARDED_PROTO"] = "https"
        return self.get_response(request)
